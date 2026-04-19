// ============================================================
// tools/js/enemy-hydrator-curve.js — DOC-110 P5.3 (Intent Curve)
// ------------------------------------------------------------
// Intent Curve tab for tools/enemy-hydrator.html. Purely
// *observational*: visualizes how a deck's cards distribute
// across a combat encounter by intentType, with a recommended-
// curve overlay per (tier × profile). Does not mutate deck
// data. Does not register exporters. _curveOverride is read as
// ground truth when present; writes flow through 5.2's pipeline.
//
// Round model (authored-order loop — §P5.3 slot contract):
//   slot 0          → opener (guaranteed round 1)
//   slot 1..N-1     → looped sequence (rounds 2+)
//
//   For round k (0-indexed):
//     k === 0       → deck[0]
//     k >= 1, N>=2  → deck[1 + ((k - 1) % (N - 1))]
//     N === 1       → deck[0] every round
//     N === 0       → no curve
//
// No shuffle. No weight. Deterministic for debuggable curves.
// (The deck's `pattern: random` field is orthogonal — this tool
// shows the *hypothetical* sequence playback regardless, with a
// banner when pattern=random so the author knows the live game
// will scramble draws.)
//
// maxRounds: default 6, clamped to [1..12]. Configurable per
// session via the tab's "rounds" input. Bosses can go 8–10;
// trash mobs die in 3. Don't hardwire 6 into logic, only view.
//
// Recommended curves (tier × profile) are stored as:
//   { sequence: [BRACE, BASIC, ..., DRAIN],
//     tolerance: { earlyDefense: N, lateBurst: Bool } }
// The sequence is *example of intent*, not the only valid
// ordering. Tolerance is ignored today but travels with the
// data so future validators can lint "earlyDefense" etc.
//
// Loose coupling with the main hydrator IIFE:
//
//   window.EnemyHydrator.currentRow()          ← read selected enemy
//   window.EnemyHydrator.toast(msg, cls)       ← user feedback (rare)
//
//   document 'enemy-hydrator:select' event     ← selection changed
//   document 'enemy-hydrator:revert' event     ← main state reverted
//
// Reads from: window.ENEMY_CARDS_DATA + window.ENEMY_DECKS_DATA.
// Writes: none.
// ============================================================
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────
  var DEFAULT_MAX_ROUNDS = 6;
  var MIN_ROUNDS = 1;
  var MAX_ROUNDS = 12;

  // Intent categories — mirrors enemy-cards.json intentType vocab.
  var INTENTS = ['BASIC', 'BRACE', 'DOT', 'BURST', 'CC', 'DRAIN'];

  // Per-intent colour. Chosen to match the deck module's suit
  // bands while staying visually distinct from them (suits are
  // ♠♣♦♥ on the left-border; intents here are bar-fill).
  var INTENT_COLORS = {
    BRACE:  '#4a6a8a',   // blue   — defensive
    DOT:    '#7a8a4a',   // olive  — grind
    BURST:  '#c04040',   // red    — spike
    BASIC:  '#8a8a8a',   // grey   — neutral
    DRAIN:  '#7a4a7a',   // purple — tax
    CC:     '#b08040'    // amber  — control
  };

  // Recommended curve library: tier × profile → { sequence, tolerance }.
  // Sequences are example-of-intent. Keep 6 entries by default so the
  // standard view (maxRounds=6) renders cleanly without repeating.
  // If maxRounds > 6 we LOOP the sequence the same way we loop decks.
  var RECOMMENDED_CURVES = {
    'standard/balanced': {
      sequence:  ['BASIC',  'BRACE', 'BASIC',  'DOT',  'BASIC', 'BURST'],
      tolerance: { earlyDefense: 1, lateBurst: false }
    },
    'standard/tanky': {
      sequence:  ['BRACE',  'BASIC', 'BRACE',  'DOT',  'BASIC', 'DOT'],
      tolerance: { earlyDefense: 2, lateBurst: false }
    },
    'standard/glass': {
      sequence:  ['BASIC',  'BURST', 'BASIC',  'DOT',  'BASIC', 'BURST'],
      tolerance: { earlyDefense: 0, lateBurst: true }
    },
    'elite/balanced': {
      sequence:  ['BRACE',  'BASIC', 'DOT',    'BURST', 'BASIC', 'DRAIN'],
      tolerance: { earlyDefense: 1, lateBurst: true }
    },
    'elite/tanky': {
      sequence:  ['BRACE',  'BRACE', 'BASIC',  'DOT',  'BURST', 'DRAIN'],
      tolerance: { earlyDefense: 2, lateBurst: true }
    },
    'elite/glass': {
      sequence:  ['BURST',  'BASIC', 'DOT',    'BURST', 'CC',    'BURST'],
      tolerance: { earlyDefense: 0, lateBurst: true }
    },
    'boss/balanced': {
      sequence:  ['BRACE',  'BASIC', 'DOT',    'BURST', 'CC',    'BURST'],
      tolerance: { earlyDefense: 2, lateBurst: true }
    },
    'boss/tanky': {
      sequence:  ['BRACE',  'BRACE', 'DOT',    'BASIC', 'BURST', 'DRAIN'],
      tolerance: { earlyDefense: 2, lateBurst: true }
    },
    'boss/glass': {
      sequence:  ['BURST',  'BASIC', 'DOT',    'BURST', 'CC',    'BURST'],
      tolerance: { earlyDefense: 0, lateBurst: true }
    }
  };

  var FALLBACK_CURVE_KEY = 'standard/balanced';

  // Profile detection — MUST match tools/js/enemy-hydrator-deck.js so
  // the "actual" (authored by hydrator) and "recommended" (derived
  // from the same profile) stay on the same axis.
  //   tanky  (hp/str ≥ 5)   → attrition
  //   glass  (hp/str ≤ 2)   → spam
  //   balanced              → mix
  function profileFor(row) {
    if (!row) return 'balanced';
    var hp  = Number(row.hp)  || 0;
    var str = Math.max(1, Number(row.str) || 1);
    var ratio = hp / str;
    if (ratio >= 5) return 'tanky';
    if (ratio <= 2) return 'glass';
    return 'balanced';
  }

  function recommendedFor(row) {
    var tier = (row && row.tier) || 'standard';
    var profile = profileFor(row);
    var key = tier + '/' + profile;
    var spec = RECOMMENDED_CURVES[key] || RECOMMENDED_CURVES[FALLBACK_CURVE_KEY];
    return {
      key:       key,
      profile:   profile,
      sequence:  spec.sequence.slice(),
      tolerance: { earlyDefense: spec.tolerance.earlyDefense, lateBurst: !!spec.tolerance.lateBurst }
    };
  }

  // ── Slot contract (pure) ──────────────────────────────────
  // Returns the deck index that plays on the given round.
  // deckSize === 0 → -1 (caller must handle "no curve").
  function roundToSlot(round, deckSize) {
    if (deckSize <= 0) return -1;
    if (deckSize === 1) return 0;
    if (round === 0) return 0;
    return 1 + ((round - 1) % (deckSize - 1));
  }

  function clampRounds(n) {
    if (typeof n !== 'number' || !isFinite(n)) return DEFAULT_MAX_ROUNDS;
    n = Math.floor(n);
    if (n < MIN_ROUNDS) return MIN_ROUNDS;
    if (n > MAX_ROUNDS) return MAX_ROUNDS;
    return n;
  }

  // ── Deck expansion ────────────────────────────────────────
  // Produces [{round, cardId, intent, slot}, ...] — round is 1-indexed
  // for display; slot is the deck index for cross-referencing Deck tab.
  function expandDeck(deckCardIds, cardLookup, rounds) {
    var n = deckCardIds.length;
    var out = [];
    for (var r = 0; r < rounds; r++) {
      var slot = roundToSlot(r, n);
      if (slot < 0) break;
      var cardId = deckCardIds[slot];
      var card   = cardLookup[cardId];
      out.push({
        round:  r + 1,
        cardId: cardId,
        intent: (card && card.intentType) ? card.intentType : 'BASIC',
        slot:   slot
      });
    }
    return out;
  }

  // Takes the recommended sequence and tiles it across N rounds the
  // same way we tile a deck. This keeps the two rows visually aligned
  // when maxRounds > sequence.length.
  function expandRecommended(sequence, rounds) {
    var n = sequence.length;
    var out = [];
    for (var r = 0; r < rounds; r++) {
      var slot = roundToSlot(r, n);
      if (slot < 0) break;
      out.push({ round: r + 1, intent: sequence[slot], slot: slot });
    }
    return out;
  }

  // Theoretical max matches achievable for a deck of `deckSize` cards
  // against `recommendedExpanded` (the already-tiled recommended curve).
  // Closed-form: each deck slot s plays on a specific set of rounds R_s.
  // For slot s, the best single intent match-count is the mode of the
  // recommended intents at those rounds. Sum of modes = ceiling.
  //
  // This matters because size-3 decks looping over a 6-slot recommended
  // curve are *structurally* capped — e.g. a size-3 deck against
  // elite/tanky has ceiling 3/6 regardless of how it's authored. Showing
  // ceiling alongside `total` keeps the "match" number interpretable.
  function ceilingFor(recommendedExpanded, deckSize) {
    if (deckSize <= 0 || !recommendedExpanded || recommendedExpanded.length === 0) return 0;
    var bySlot = {};
    for (var r = 0; r < recommendedExpanded.length; r++) {
      var s = roundToSlot(r, deckSize);
      if (s < 0) continue;
      var intent = recommendedExpanded[r].intent;
      if (!bySlot[s]) bySlot[s] = {};
      bySlot[s][intent] = (bySlot[s][intent] || 0) + 1;
    }
    var ceiling = 0;
    for (var slot in bySlot) {
      if (!Object.prototype.hasOwnProperty.call(bySlot, slot)) continue;
      var freqs = bySlot[slot];
      var best = 0;
      for (var it in freqs) {
        if (!Object.prototype.hasOwnProperty.call(freqs, it)) continue;
        if (freqs[it] > best) best = freqs[it];
      }
      ceiling += best;
    }
    return ceiling;
  }

  // ── View model ────────────────────────────────────────────
  // Input:  row from enemies.json, deckEntry from enemy-decks.json,
  //         cardLookup (EATK→card), rounds (number).
  // Output: { actual: [...], recommended: [...], meta: {...} }
  //   meta.override: true if _curveOverride was used
  //   meta.pattern:  'sequence' | 'random' | 'undefined'
  //   meta.deckSize: length of the effective deck
  //   meta.match:    { perRound: [Bool...], total: N }
  function buildView(row, deckEntry, cardLookup, rounds) {
    rounds = clampRounds(rounds);
    var rec = recommendedFor(row);
    var recExp = expandRecommended(rec.sequence, rounds);

    if (!deckEntry || !Array.isArray(deckEntry.cards) || deckEntry.cards.length === 0) {
      return {
        actual:      [],
        recommended: recExp,
        meta: {
          override:    false,
          pattern:     deckEntry && deckEntry.pattern ? deckEntry.pattern : null,
          deckSize:    0,
          rounds:      rounds,
          recKey:      rec.key,
          tolerance:   rec.tolerance,
          match:       { perRound: [], total: 0, ceiling: 0 }
        }
      };
    }

    var overrideCards = Array.isArray(deckEntry._curveOverride)
      ? deckEntry._curveOverride.filter(function (id) { return typeof id === 'string'; })
      : null;
    var orderCards = overrideCards && overrideCards.length > 0
      ? overrideCards
      : deckEntry.cards;

    var actual = expandDeck(orderCards, cardLookup, rounds);

    // Per-round intent match (actual intent === recommended intent)
    var perRound = [];
    var total = 0;
    for (var i = 0; i < actual.length && i < recExp.length; i++) {
      var m = actual[i].intent === recExp[i].intent;
      perRound.push(m);
      if (m) total++;
    }

    var ceiling = ceilingFor(recExp, orderCards.length);

    return {
      actual:      actual,
      recommended: recExp,
      meta: {
        override:  !!overrideCards && overrideCards.length > 0,
        pattern:   deckEntry.pattern || null,
        deckSize:  orderCards.length,
        rounds:    rounds,
        recKey:    rec.key,
        tolerance: rec.tolerance,
        match:     { perRound: perRound, total: total, ceiling: ceiling }
      }
    };
  }

  // ── DOM helpers ───────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Render a single row (actual or recommended) as N bars left-to-right.
  // Each bar has a color (intent) and a label (round #). For actual,
  // bars also show cardId + mismatch ring.
  function renderRow(entries, opts) {
    if (!entries.length) {
      return '<div class="ehc-row-empty">—</div>';
    }
    var html = '<div class="ehc-bars">';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var color = INTENT_COLORS[e.intent] || '#666';
      var mismatch = opts && opts.match && opts.match[i] === false;
      var cls = 'ehc-bar';
      if (mismatch) cls += ' ehc-bar-mismatch';
      if (opts && opts.variant) cls += ' ehc-bar-' + opts.variant;
      var title = 'Round ' + e.round + ' · ' + e.intent;
      if (e.cardId) title += ' · ' + e.cardId;
      html += '<div class="' + cls + '" style="background:' + color + ';" title="' + escapeHtml(title) + '">' +
              '  <span class="ehc-bar-round">' + e.round + '</span>' +
              '  <span class="ehc-bar-intent">' + escapeHtml(e.intent) + '</span>' +
              (e.cardId ? '  <span class="ehc-bar-card">' + escapeHtml(e.cardId) + '</span>' : '') +
              '</div>';
    }
    html += '</div>';
    return html;
  }

  // Overlay mode: single row of actual bars with a recommended ghost
  // ribbon below each. Chosen UX default is side-by-side (below);
  // this is the toggle path.
  function renderOverlay(view) {
    var rec = view.recommended;
    var act = view.actual;
    var max = Math.max(act.length, rec.length);
    if (max === 0) return '<div class="ehc-row-empty">—</div>';
    var match = view.meta.match.perRound;
    var html = '<div class="ehc-bars ehc-bars-overlay">';
    for (var i = 0; i < max; i++) {
      var a = act[i] || null;
      var r = rec[i] || null;
      var topColor = a ? (INTENT_COLORS[a.intent] || '#666') : '#333';
      var botColor = r ? (INTENT_COLORS[r.intent] || '#666') : '#333';
      var mismatch = a && r && match[i] === false;
      var cls = 'ehc-bar ehc-bar-stacked' + (mismatch ? ' ehc-bar-mismatch' : '');
      var title = 'Round ' + (i + 1) +
                  ' · actual=' + (a ? a.intent : '—') +
                  ' · rec=' + (r ? r.intent : '—');
      html += '<div class="' + cls + '" title="' + escapeHtml(title) + '">' +
              '  <div class="ehc-bar-top"    style="background:' + topColor + ';">' +
                   '<span class="ehc-bar-intent">' + escapeHtml(a ? a.intent : '—') + '</span>' +
                   (a && a.cardId ? '<span class="ehc-bar-card">' + escapeHtml(a.cardId) + '</span>' : '') +
                 '</div>' +
              '  <div class="ehc-bar-bottom" style="background:' + botColor + ';">' +
                   '<span class="ehc-bar-intent">' + escapeHtml(r ? r.intent : '—') + '</span>' +
                 '</div>' +
              '  <span class="ehc-bar-round">' + (i + 1) + '</span>' +
              '</div>';
    }
    html += '</div>';
    return html;
  }

  // Legend for intent colours.
  function renderLegend() {
    var html = '<div class="ehc-legend">';
    for (var i = 0; i < INTENTS.length; i++) {
      var intent = INTENTS[i];
      html += '<span class="ehc-legend-chip">' +
              '<span class="ehc-legend-swatch" style="background:' + INTENT_COLORS[intent] + ';"></span>' +
              escapeHtml(intent) + '</span>';
    }
    html += '</div>';
    return html;
  }

  // ── State ─────────────────────────────────────────────────
  var _cards     = [];
  var _cardById  = {};
  var _decks     = {};
  var _rounds    = DEFAULT_MAX_ROUNDS;
  var _overlay   = false;
  var _view      = null;
  var _currentId = null;

  // ── Sidecar load ──────────────────────────────────────────
  function loadCards() {
    var src = window.ENEMY_CARDS_DATA;
    if (!src || !Array.isArray(src.cards)) {
      _cards = [];
      _cardById = {};
      return false;
    }
    _cards = src.cards.slice();
    _cardById = {};
    for (var i = 0; i < _cards.length; i++) {
      if (_cards[i] && _cards[i].id) _cardById[_cards[i].id] = _cards[i];
    }
    return true;
  }

  function loadDecks() {
    var src = window.ENEMY_DECKS_DATA;
    if (!src || !src.decks) {
      _decks = {};
      return false;
    }
    _decks = {};
    for (var k in src.decks) {
      if (Object.prototype.hasOwnProperty.call(src.decks, k)) {
        _decks[k] = src.decks[k];
      }
    }
    return true;
  }

  // ── Render orchestration ──────────────────────────────────
  function render() {
    var host = $('curve-host');
    if (!host) return;
    var headEl = $('curve-head');
    var metaEl = $('curve-meta');
    var bodyEl = $('curve-body');

    if (!_currentId) {
      if (headEl) headEl.textContent = '—';
      if (metaEl) metaEl.innerHTML = '<span class="ehc-dim">Select an enemy to see its intent curve.</span>';
      if (bodyEl) bodyEl.innerHTML = '';
      return;
    }

    var row = (window.EnemyHydrator && window.EnemyHydrator.currentRow && window.EnemyHydrator.currentRow()) || null;
    if (!row) {
      if (headEl) headEl.textContent = _currentId;
      if (metaEl) metaEl.innerHTML = '<span class="ehc-dim">Enemy not found in roster.</span>';
      if (bodyEl) bodyEl.innerHTML = '';
      return;
    }

    var deckEntry = _decks[_currentId] || null;
    _view = buildView(row, deckEntry, _cardById, _rounds);

    if (headEl) {
      headEl.textContent = _currentId + ' · ' + (row.name || '') +
                           ' · tier=' + (row.tier || '?') +
                           ' · profile=' + profileFor(row);
    }

    var bits = [];
    bits.push('deckSize=' + _view.meta.deckSize);
    bits.push('rec=' + escapeHtml(_view.meta.recKey));
    bits.push('rounds=' + _view.meta.rounds);
    if (_view.meta.pattern) bits.push('pattern=' + escapeHtml(_view.meta.pattern));
    if (_view.meta.override) bits.push('<span class="ehc-flag">_curveOverride active</span>');
    if (_view.actual.length) {
      var m = _view.meta.match;
      var matchBit = 'match=' + m.total + '/' + _view.actual.length;
      if (typeof m.ceiling === 'number' && m.ceiling < _view.actual.length) {
        matchBit += ' <span class="ehc-dim">(ceiling ' + m.ceiling + ', deckSize ' + _view.meta.deckSize + ' caps achievable)</span>';
        if (m.total === m.ceiling && m.total > 0) matchBit += ' <span class="ehc-flag">at-ceiling</span>';
      }
      bits.push(matchBit);
    }
    if (metaEl) metaEl.innerHTML = bits.join(' · ');

    if (!bodyEl) return;
    var html = '';
    html += renderLegend();
    if (_overlay) {
      html += '<div class="ehc-section"><h5>Overlay (actual / recommended)</h5>';
      html += renderOverlay(_view);
      html += '</div>';
    } else {
      html += '<div class="ehc-section"><h5>Actual <span class="ehc-dim">— authored-order playback</span></h5>';
      html += renderRow(_view.actual, { variant: 'actual', match: _view.meta.match.perRound });
      html += '</div>';
      html += '<div class="ehc-section"><h5>Recommended <span class="ehc-dim">— ' + escapeHtml(_view.meta.recKey) + '</span></h5>';
      html += renderRow(_view.recommended, { variant: 'rec' });
      html += '</div>';
    }
    if (_view.meta.pattern === 'random') {
      html += '<div class="ehc-note"><strong>Note:</strong> deck.pattern = random — live combat will shuffle draws. Curve above is the hypothetical sequence playback, useful for shape analysis but not a literal rehearsal.</div>';
    }
    if (_view.meta.deckSize === 0) {
      html += '<div class="ehc-note">No deck entry for this enemy (yet). Hydrate one from the Deck tab.</div>';
    }
    bodyEl.innerHTML = html;
  }

  // ── Event wiring ──────────────────────────────────────────
  function onSelect(ev) {
    _currentId = (ev && ev.detail && ev.detail.id) || null;
    render();
  }

  function onRevert() {
    // Main state was reverted; decks may have changed from disk. Re-load.
    loadDecks();
    render();
  }

  function onRoundsInput(ev) {
    var v = parseInt(ev.target.value, 10);
    _rounds = clampRounds(v);
    ev.target.value = String(_rounds);
    render();
  }

  function onOverlayToggle(ev) {
    _overlay = !!ev.target.checked;
    render();
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    var loadedCards = loadCards();
    var loadedDecks = loadDecks();
    if (!loadedCards) {
      if (window.EnemyHydrator && window.EnemyHydrator.toast) {
        window.EnemyHydrator.toast('Intent Curve: enemy-cards.js sidecar missing — tab disabled.', 'err');
      }
      return;
    }
    if (!loadedDecks) {
      if (window.EnemyHydrator && window.EnemyHydrator.toast) {
        window.EnemyHydrator.toast('Intent Curve: enemy-decks.js sidecar missing — curves will be empty.', 'warn');
      }
    }

    document.addEventListener('enemy-hydrator:select', onSelect);
    document.addEventListener('enemy-hydrator:revert', onRevert);

    var rInput = $('curve-rounds');
    if (rInput) {
      rInput.value = String(_rounds);
      rInput.addEventListener('input',  onRoundsInput);
      rInput.addEventListener('change', onRoundsInput);
    }
    var oToggle = $('curve-overlay');
    if (oToggle) {
      oToggle.checked = _overlay;
      oToggle.addEventListener('change', onOverlayToggle);
    }

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public debug surface ──────────────────────────────────
  // The module is purely observational — no setters. These are
  // for the smoke harness + devtool inspection.
  window.EnemyHydratorCurve = {
    DEFAULT_MAX_ROUNDS:  DEFAULT_MAX_ROUNDS,
    INTENTS:             INTENTS.slice(),
    RECOMMENDED_CURVES:  RECOMMENDED_CURVES,
    INTENT_COLORS:       INTENT_COLORS,
    profileFor:          profileFor,
    recommendedFor:      recommendedFor,
    roundToSlot:         roundToSlot,
    clampRounds:         clampRounds,
    expandDeck:          expandDeck,
    expandRecommended:   expandRecommended,
    ceilingFor:          ceilingFor,
    buildView:           buildView,
    getCurrentView:      function () { return _view; },
    getCurrentId:        function () { return _currentId; }
  };
})();

// ============================================================
// tools/js/enemy-hydrator-deck.js — DOC-110 P5.2 (Deck Composer)
// ------------------------------------------------------------
// Deck Composer module for tools/enemy-hydrator.html. Owns the
// "Deck" tab: EATK pool browser, per-enemy deck slot editor,
// pattern/greed controls, proposal preview, and the §4.5
// Hydrate-from-Stats heuristic.
//
// Loose coupling with the main hydrator IIFE via:
//
//   window.EnemyHydrator.markDirty()            ← this module calls
//   window.EnemyHydrator.clearDirty()           ← this module calls on revert
//   window.EnemyHydrator.currentRow()           ← read selected enemy
//   window.EnemyHydrator.registerExporter(...)  ← enemy-decks.json piggy-back
//   window.EnemyHydrator.toast(msg, cls)        ← user feedback
//
//   document 'enemy-hydrator:select' event      ← selection changed
//   document 'enemy-hydrator:revert' event      ← main state reverted
//
// Data sources:
//   window.ENEMY_CARDS_DATA.cards   — EATK-### pool (14 cards today)
//   window.ENEMY_DECKS_DATA.decks   — per-ENM-### deck map (26 decks today)
//
// Exported JSON mirrors the authored shape of data/enemy-decks.json:
//   { "_schema": {...}, "ENM-001": {...}, "ENM-002": {...}, ... }
// ============================================================
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────
  // Deck-size ranges by tier. §4.5. "boss" is intentionally the
  // same lo/hi so the heuristic settles — a boss with 3 cards is
  // rare but legal if the user hand-edits after hydrating.
  var TIER_DECK_SIZE = {
    standard: { lo: 3, hi: 3, preferred: 3 },
    elite:    { lo: 3, hi: 4, preferred: 3 },
    boss:     { lo: 4, hi: 4, preferred: 4 }
  };

  // Default greed by tier. Omitted from JSON when equal to engine
  // default (2) — matches the authored conventions in enemy-decks.json.
  var TIER_GREED = { standard: 2, elite: 2, boss: 3 };

  // EATK ids banned for a given tier — keeps standards from rocking
  // boss-signature bursts / bleeds.
  var TIER_QUALITY_BAN = {
    standard: { 'EATK-004': true, 'EATK-013': true, 'EATK-011': true, 'EATK-012': true },
    elite:    {},
    boss:     {}
  };

  // IntentType preferences by stats archetype.
  //   tanky (hp/str ≥ 5)   → attrition profile: BRACE + DOT
  //   glass  (hp/str ≤ 2)  → spam profile: BURST + BASIC
  //   balanced             → mix
  var INTENT_WEIGHTS = {
    tanky:    { BRACE: 3, DOT: 3, BASIC: 1, BURST: 1, DRAIN: 2, CC: 1 },
    glass:    { BURST: 3, BASIC: 3, DOT: 1, BRACE: 0, DRAIN: 1, CC: 1 },
    balanced: { BASIC: 2, DOT: 2, BRACE: 2, BURST: 2, DRAIN: 1, CC: 1 }
  };

  // ── State ─────────────────────────────────────────────────
  // Authoritative deck map: the module's live copy of the full
  // decks object (keyed by ENM-###). The _schema key is held
  // separately so it round-trips cleanly.
  var _decks        = {};       // { 'ENM-001': { cards, greed?, pattern?, _note }, ... }
  var _schema       = null;     // { key, cards, greed, pattern, _note } — verbatim from JSON
  var _originalJSON = '';       // snapshot for revert
  var _dirty        = false;    // this module's own dirty flag (in addition to main's)
  var _cards        = [];       // EATK pool — window.ENEMY_CARDS_DATA.cards
  var _cardById     = {};       // EATK-### → card ref (fast lookup)
  var _currentId    = null;     // ENM-### currently shown in the Composer
  var _proposal     = null;     // { targetId, cards, greed, pattern, note } or null

  // ── DOM helpers ───────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Boot ──────────────────────────────────────────────────
  function boot() {
    // Data sidecars must have loaded before this script — both are
    // script-tag injected ahead of us in index order.
    var cardsBundle = window.ENEMY_CARDS_DATA;
    var decksBundle = window.ENEMY_DECKS_DATA;
    if (!cardsBundle || !Array.isArray(cardsBundle.cards)) {
      console.error('[enemy-hydrator-deck] ENEMY_CARDS_DATA sidecar missing');
      return;
    }
    if (!decksBundle || !decksBundle.decks) {
      console.error('[enemy-hydrator-deck] ENEMY_DECKS_DATA sidecar missing');
      return;
    }
    _cards  = cardsBundle.cards.slice();
    _schema = decksBundle._schema || null;
    _decks  = JSON.parse(JSON.stringify(decksBundle.decks));   // deep-copy for mutability
    _cards.forEach(function (c) { _cardById[c.id] = c; });
    _originalJSON = JSON.stringify(rebuildBundle());

    wireEvents();
    renderEatkPool();
    renderSelectedDeck();

    // If the main hydrator already has a selected enemy by the
    // time we boot, pick that up.
    if (window.EnemyHydrator && window.EnemyHydrator.currentRow) {
      var row = window.EnemyHydrator.currentRow();
      if (row && row.id) {
        _currentId = row.id;
        renderSelectedDeck();
      }
    }

    // Register the JSON exporter with the main IIFE so the Export
    // button also downloads enemy-decks.json when deck state is dirty.
    if (window.EnemyHydrator && window.EnemyHydrator.registerExporter) {
      window.EnemyHydrator.registerExporter('enemy-decks', function () {
        if (!_dirty) return null;
        return {
          filename: 'enemy-decks.json',
          data:     serializeDecks()
        };
      });
    }
  }

  // ── Event wiring ──────────────────────────────────────────
  function wireEvents() {
    document.addEventListener('enemy-hydrator:select', function (e) {
      var id = e.detail && e.detail.id;
      if (!id) return;
      _currentId = id;
      cancelProposal();
      renderSelectedDeck();
      // Pool re-render highlights "in deck" count for the new enemy.
      renderEatkPool();
    });

    document.addEventListener('enemy-hydrator:revert', function () {
      _decks = JSON.parse(_originalJSON).decks || {};
      _dirty = false;
      cancelProposal();
      renderEatkPool();
      renderSelectedDeck();
    });

    // Pattern + greed + note bind to the live deck slot.
    $('deck-pattern').addEventListener('change', function () {
      var d = ensureDeck(); if (!d) return;
      var v = $('deck-pattern').value;
      if (v === 'random') { delete d.pattern; } else { d.pattern = v; }
      markDirty();
    });
    $('deck-greed').addEventListener('change', function () {
      var d = ensureDeck(); if (!d) return;
      var row = window.EnemyHydrator && window.EnemyHydrator.currentRow();
      var tierDefault = (row && TIER_GREED[row.tier]) || 2;
      var v = parseInt($('deck-greed').value, 10);
      if (!isFinite(v) || v < 1) v = tierDefault;
      if (v === tierDefault) { delete d.greed; } else { d.greed = v; }
      markDirty();
    });
    $('deck-note').addEventListener('input', function () {
      var d = ensureDeck(); if (!d) return;
      var v = $('deck-note').value;
      if (v) { d._note = v; } else { delete d._note; }
      markDirty();
    });

    // Hydrate / apply / cancel buttons.
    $('deck-hydrate').addEventListener('click', proposeFromStats);
    $('deck-preview-apply').addEventListener('click', applyProposal);
    $('deck-preview-cancel').addEventListener('click', cancelProposal);
  }

  // ── Core render — EATK pool (left panel) ──────────────────
  function renderEatkPool() {
    var host = $('deck-pool');
    if (!host) return;
    host.innerHTML = '';
    $('deck-pool-count').textContent = _cards.length + ' cards';

    var deck = _decks[_currentId];
    var inDeckCount = {};
    if (deck && Array.isArray(deck.cards)) {
      deck.cards.forEach(function (id) { inDeckCount[id] = (inDeckCount[id] || 0) + 1; });
    }

    _cards.forEach(function (c) {
      var el = cardRow(c, {
        weightLabel: inDeckCount[c.id] ? ('in deck: ' + inDeckCount[c.id]) : '',
        clickable:   !!_currentId,
        extraClass:  ''
      });
      if (_currentId) {
        el.addEventListener('click', function () { addCardToSlot(c.id); });
        el.title = 'Click to add to ' + _currentId + "'s deck";
      } else {
        el.style.opacity = '0.5';
        el.style.cursor = 'default';
        el.title = 'Select an enemy first';
      }
      host.appendChild(el);
    });
  }

  // ── Core render — Deck slot (middle panel) ────────────────
  function renderSelectedDeck() {
    var host = $('deck-slot');
    if (!host) return;
    host.innerHTML = '';
    $('deck-enemy-id').textContent = _currentId || '—';
    $('deck-slot-count').textContent = '0 cards';

    if (!_currentId) {
      host.innerHTML = '<div class="eh-deck-empty">Select an enemy from the sidebar to edit its deck.</div>';
      $('deck-pattern').value = 'random'; $('deck-pattern').disabled = true;
      $('deck-greed').value = ''; $('deck-greed').disabled = true;
      $('deck-note').value = ''; $('deck-note').disabled = true;
      $('deck-hydrate').disabled = true;
      return;
    }

    var deck = _decks[_currentId];
    var row  = window.EnemyHydrator && window.EnemyHydrator.currentRow();
    var tierDefaultGreed = (row && TIER_GREED[row.tier]) || 2;

    $('deck-pattern').disabled = false;
    $('deck-greed').disabled = false;
    $('deck-note').disabled = false;
    $('deck-hydrate').disabled = !row;

    if (!deck) {
      host.innerHTML = '<div class="eh-deck-empty">No deck authored yet.<br/>Click EATK cards on the left to build one, or click "Hydrate from stats".</div>';
      $('deck-pattern').value = 'random';
      $('deck-greed').value = tierDefaultGreed;
      $('deck-note').value = '';
      renderProposal();
      return;
    }

    var cards = Array.isArray(deck.cards) ? deck.cards : [];
    $('deck-slot-count').textContent = cards.length + ' card' + (cards.length === 1 ? '' : 's');

    $('deck-pattern').value = deck.pattern || 'random';
    $('deck-greed').value   = deck.greed != null ? deck.greed : tierDefaultGreed;
    $('deck-note').value    = deck._note || '';

    if (cards.length === 0) {
      host.innerHTML = '<div class="eh-deck-empty">Deck is empty — add cards from the EATK pool.</div>';
      renderProposal();
      return;
    }

    cards.forEach(function (id, idx) {
      var c = _cardById[id];
      if (!c) {
        // Broken reference — render a stub row so the user can remove it.
        var bad = document.createElement('div');
        bad.className = 'eh-eatk';
        bad.innerHTML = '<span class="emoji">?</span><span class="meta"><span class="name">' + escapeHtml(id) + '</span><span class="sub">unknown card — click to remove</span></span><span class="weight">[' + (idx + 1) + ']</span>';
        bad.style.borderLeftColor = '#7a3a3a';
        bad.title = 'Click to remove (card not found in EATK pool)';
        bad.addEventListener('click', function () { removeCardFromSlot(idx); });
        host.appendChild(bad);
        return;
      }
      var weight = Math.round((1 / cards.length) * 100);
      var el = cardRow(c, {
        weightLabel: weight + '%',
        clickable:   true,
        extraClass:  'deck-row'
      });
      el.title = 'Click to remove (slot ' + (idx + 1) + ' of ' + cards.length + ')';
      el.addEventListener('click', function () { removeCardFromSlot(idx); });
      host.appendChild(el);
    });

    renderProposal();
  }

  // ── Proposal preview (right panel) ────────────────────────
  function renderProposal() {
    var host = $('deck-preview');
    if (!host) return;
    host.innerHTML = '';

    var meta = $('deck-preview-meta');
    var apply = $('deck-preview-apply');
    var cancel = $('deck-preview-cancel');

    if (!_proposal || _proposal.targetId !== _currentId) {
      host.innerHTML = '<div class="eh-deck-empty">No proposal yet.<br/>Click "Hydrate from stats" to generate one from this enemy\'s stats + tier + suit.</div>';
      meta.textContent = '';
      apply.disabled = true;
      cancel.disabled = true;
      return;
    }

    meta.textContent = _proposal.cards.length + ' cards · greed ' + _proposal.greed + ' · ' + _proposal.pattern;

    // Compute diff vs current deck to colour preview rows.
    var current = (_decks[_currentId] && _decks[_currentId].cards) || [];
    var currentCount  = countById(current);
    var proposalCount = countById(_proposal.cards);

    // Render union set, in proposal-order first then leftover removals.
    var rendered = {};
    _proposal.cards.forEach(function (id, idx) {
      if (rendered[id]) return;
      rendered[id] = true;
      var c = _cardById[id]; if (!c) return;
      var delta = (proposalCount[id] || 0) - (currentCount[id] || 0);
      var klass = delta > 0 ? 'preview-add' : '';
      var weightLabel = proposalCount[id] + (delta !== 0 ? (delta > 0 ? ' (+' + delta + ')' : ' (' + delta + ')') : '');
      var el = cardRow(c, { weightLabel: weightLabel, clickable: false, extraClass: klass });
      el.style.cursor = 'default';
      host.appendChild(el);
    });
    // Removals: cards in current but not proposal.
    Object.keys(currentCount).forEach(function (id) {
      if (rendered[id]) return;
      rendered[id] = true;
      var c = _cardById[id]; if (!c) return;
      var el = cardRow(c, {
        weightLabel: '−' + currentCount[id],
        clickable:   false,
        extraClass:  'preview-remove'
      });
      el.style.cursor = 'default';
      host.appendChild(el);
    });

    apply.disabled = false;
    cancel.disabled = false;
  }

  // ── Card row builder ──────────────────────────────────────
  function cardRow(c, opts) {
    var el = document.createElement('div');
    el.className = 'eh-eatk suit-' + (c.suit || 'spade') + (opts.extraClass ? ' ' + opts.extraClass : '');
    var dmg = cardHeadlineDamage(c);
    var sub = (c.suit || '—') + ' · <span class="intent">' + escapeHtml(c.intentType || '—') + '</span>' + (dmg != null ? ' · ' + dmg + ' dmg' : '');
    el.innerHTML =
      '<span class="emoji">' + escapeHtml(c.emoji || '') + '</span>' +
      '<span class="meta">' +
        '<span class="name">' + escapeHtml(c.name || c.id) + '</span>' +
        '<span class="sub">' + sub + '</span>' +
      '</span>' +
      '<span class="weight">' + escapeHtml(opts.weightLabel || '') + '</span>';
    return el;
  }

  function cardHeadlineDamage(c) {
    if (!c || !Array.isArray(c.effects)) return null;
    for (var i = 0; i < c.effects.length; i++) {
      var ef = c.effects[i];
      if (ef && ef.type === 'damage') return ef.value;
    }
    return null;
  }

  // ── Deck mutation ─────────────────────────────────────────
  function ensureDeck() {
    if (!_currentId) return null;
    if (!_decks[_currentId]) {
      _decks[_currentId] = { cards: [] };
    }
    return _decks[_currentId];
  }

  function addCardToSlot(cardId) {
    if (!_currentId) return;
    var d = ensureDeck();
    d.cards.push(cardId);
    markDirty();
    renderSelectedDeck();
    renderEatkPool();
  }

  function removeCardFromSlot(idx) {
    if (!_currentId) return;
    var d = _decks[_currentId];
    if (!d || !Array.isArray(d.cards)) return;
    d.cards.splice(idx, 1);
    if (d.cards.length === 0 && !d._note && d.greed == null && !d.pattern) {
      delete _decks[_currentId];
    }
    markDirty();
    renderSelectedDeck();
    renderEatkPool();
  }

  function markDirty() {
    if (!_dirty) {
      _dirty = true;
    }
    if (window.EnemyHydrator && window.EnemyHydrator.markDirty) {
      window.EnemyHydrator.markDirty();
    }
  }

  // ── Hydrate-from-stats heuristic (§4.5) ───────────────────
  //
  // Deterministic proposal: same enemy stats + tier + suit → same
  // deck. Scoring approach:
  //   1. Discard banned cards for tier (quality ceiling).
  //   2. Score remaining cards by:
  //        + suit match with enemy.suit     (×3)
  //        + intentType weight for profile  (×2)
  //        + dex≥5 bonus for CC cards       (+4)
  //        + stealth≥5 bonus for DOT+BASIC  (+2)
  //   3. Choose deck size from TIER_DECK_SIZE.
  //   4. Fill deck greedy-by-score, enforcing:
  //        - boss: at least one BRACE + one BURST
  //        - suit match ≥ 60% of deck (backfill with suit-matched
  //          if greedy pass came up short)
  //        - stealth≥5 → first slot must be DOT or BASIC
  function proposeFromStats() {
    if (!_currentId) return;
    var row = window.EnemyHydrator && window.EnemyHydrator.currentRow();
    if (!row) {
      window.EnemyHydrator && window.EnemyHydrator.toast &&
        window.EnemyHydrator.toast('Cannot hydrate — selected enemy row not found.', 'err');
      return;
    }

    var tier    = TIER_DECK_SIZE[row.tier] ? row.tier : 'standard';
    var suit    = row.suit || 'spade';
    var hp      = Number(row.hp) || 1;
    var str     = Number(row.str) || 1;
    var dex     = Number(row.dex) || 0;
    var stealth = Number(row.stealth) || 0;

    var ratio   = hp / Math.max(str, 1);
    var profile = ratio >= 5 ? 'tanky' : (ratio <= 2 ? 'glass' : 'balanced');
    var weights = INTENT_WEIGHTS[profile] || INTENT_WEIGHTS.balanced;
    var banned  = TIER_QUALITY_BAN[tier] || {};
    var size    = TIER_DECK_SIZE[tier].preferred;

    // Deterministic tie-breaker: sort by id alphabetically so equal
    // scores always yield the same order.
    var pool = _cards
      .filter(function (c) { return !banned[c.id]; })
      .map(function (c) {
        var s = 0;
        s += (c.suit === suit) ? 3 : 0;
        s += (weights[c.intentType] || 0) * 2;
        if (dex >= 5 && c.intentType === 'CC') s += 4;
        if (stealth >= 5 && (c.intentType === 'DOT' || c.intentType === 'BASIC')) s += 2;
        // Tier-tilt: boss slightly prefers BURST/DRAIN; elite prefers DOT/BRACE.
        if (tier === 'boss' && (c.intentType === 'BURST' || c.intentType === 'DRAIN')) s += 2;
        if (tier === 'elite' && (c.intentType === 'DOT' || c.intentType === 'BRACE')) s += 1;
        return { card: c, score: s };
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.card.id < b.card.id ? -1 : (a.card.id > b.card.id ? 1 : 0);
      });

    var picks = [];
    var pickedByIntent = {};
    function pushPick(c) {
      picks.push(c.id);
      pickedByIntent[c.intentType] = (pickedByIntent[c.intentType] || 0) + 1;
    }

    // Boss requirement: one BRACE + one BURST before greedy.
    if (tier === 'boss') {
      var forcedIntents = ['BRACE', 'BURST'];
      forcedIntents.forEach(function (intent) {
        var pick = pool.filter(function (x) { return x.card.intentType === intent; })[0];
        if (pick) pushPick(pick.card);
      });
    }

    // Stealth≥5 requirement: reserve slot 1 for a DOT/BASIC card —
    // enemies that ambush should open with an unexpected strike
    // rather than a signature brace/burst.
    if (stealth >= 5 && picks.length === 0) {
      var opener = pool.filter(function (x) {
        return x.card.intentType === 'DOT' || x.card.intentType === 'BASIC';
      })[0];
      if (opener) pushPick(opener.card);
    }

    // Greedy fill to target size.
    for (var i = 0; i < pool.length && picks.length < size; i++) {
      var c = pool[i].card;
      if (picks.indexOf(c.id) !== -1) continue;
      // Avoid duplicating an intent if we can still reach size
      // with the remaining pool — keeps decks varied. Drop this
      // guard once the pool is too small to meet target.
      if ((pickedByIntent[c.intentType] || 0) >= 2 && (pool.length - i - 1) >= (size - picks.length)) continue;
      pushPick(c);
    }

    // If we still haven't hit size (tiny pool), drop the variety
    // guard and fill with duplicates of the best card.
    while (picks.length < size && pool.length > 0) {
      picks.push(pool[0].card.id);
    }

    // Suit-match enforcement: compute current suit share; if below
    // 60%, swap out the worst-scoring non-suit card for the best
    // available suit-match.
    var suitShare = picks.reduce(function (n, id) {
      var c = _cardById[id];
      return n + (c && c.suit === suit ? 1 : 0);
    }, 0) / picks.length;
    if (suitShare < 0.6) {
      var suitPool = pool.filter(function (x) {
        return x.card.suit === suit && picks.indexOf(x.card.id) === -1;
      });
      // Swap bottom-ranked non-suit for top-ranked suit-match until we cross 60%.
      var guard = 0;
      while (suitShare < 0.6 && suitPool.length > 0 && guard++ < size) {
        // Find last non-suit in picks.
        var swapIdx = -1;
        for (var j = picks.length - 1; j >= 0; j--) {
          var pc = _cardById[picks[j]];
          if (pc && pc.suit !== suit) { swapIdx = j; break; }
        }
        if (swapIdx < 0) break;
        picks[swapIdx] = suitPool.shift().card.id;
        suitShare = picks.reduce(function (n, id) {
          var c = _cardById[id];
          return n + (c && c.suit === suit ? 1 : 0);
        }, 0) / picks.length;
      }
    }

    // Opener constraint: if stealth≥5, move a DOT/BASIC to slot 0.
    if (stealth >= 5) {
      var openerIdx = -1;
      for (var k = 0; k < picks.length; k++) {
        var kc = _cardById[picks[k]];
        if (kc && (kc.intentType === 'DOT' || kc.intentType === 'BASIC')) { openerIdx = k; break; }
      }
      if (openerIdx > 0) {
        var opener2 = picks.splice(openerIdx, 1)[0];
        picks.unshift(opener2);
      }
    }

    _proposal = {
      targetId: _currentId,
      cards:    picks,
      greed:    TIER_GREED[tier] || 2,
      pattern:  'random',
      note:     '[hydrated] tier=' + tier + ' · ' + profile + ' profile · hp/str=' + ratio.toFixed(1)
    };
    renderProposal();
  }

  function applyProposal() {
    if (!_proposal || _proposal.targetId !== _currentId) return;
    var d = ensureDeck();
    d.cards = _proposal.cards.slice();
    // greed: omit if equal to tier default; otherwise set.
    var row = window.EnemyHydrator && window.EnemyHydrator.currentRow();
    var tierDefault = (row && TIER_GREED[row.tier]) || 2;
    if (_proposal.greed === tierDefault) { delete d.greed; } else { d.greed = _proposal.greed; }
    if (_proposal.pattern === 'random') { delete d.pattern; } else { d.pattern = _proposal.pattern; }
    // Preserve hand-authored _note unless slot is blank. Heuristic
    // note is a starting point; user can keep or rewrite.
    if (!d._note) { d._note = _proposal.note; }
    markDirty();
    _proposal = null;
    renderSelectedDeck();
    renderEatkPool();
  }

  function cancelProposal() {
    _proposal = null;
    renderProposal();
  }

  // ── Serialization ─────────────────────────────────────────
  // Output matches the authored shape of data/enemy-decks.json:
  //   { "_schema": {...}, "ENM-001": {...}, "ENM-002": {...} }
  // _schema ordered first; decks ordered by ENM-### ascending so
  // diffs stay stable. Banners (blank lines in the authored file)
  // are not preserved — JSON can't carry them anyway.
  function serializeDecks() {
    var bundle = rebuildBundle();
    var lines = ['{'];
    // _schema first.
    if (bundle._schema) {
      lines.push('  ' + JSON.stringify('_schema') + ': ' + JSON.stringify(bundle._schema, null, 2).split('\n').join('\n  ') + ',');
      lines.push('');
    }
    var keys = Object.keys(bundle).filter(function (k) { return k !== '_schema'; }).sort();
    keys.forEach(function (k, idx) {
      var body = JSON.stringify(bundle[k], null, 2).split('\n').join('\n  ');
      lines.push('  ' + JSON.stringify(k) + ': ' + body + (idx === keys.length - 1 ? '' : ','));
    });
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  function rebuildBundle() {
    // Strip empty decks before export — an ENM-### with 0 cards
    // and no overrides is noise.
    var out = {};
    if (_schema) out._schema = _schema;
    Object.keys(_decks).forEach(function (k) {
      var d = _decks[k];
      if (!d) return;
      if ((!d.cards || d.cards.length === 0) && !d._note && d.greed == null && !d.pattern) return;
      out[k] = d;
    });
    return out;
  }

  // ── Utilities ─────────────────────────────────────────────
  function countById(arr) {
    var out = {};
    for (var i = 0; i < arr.length; i++) out[arr[i]] = (out[arr[i]] || 0) + 1;
    return out;
  }

  // ── Public debug surface ──────────────────────────────────
  window.EnemyHydratorDeck = {
    getDecks:       function () { return _decks; },
    getProposal:    function () { return _proposal; },
    serialize:      serializeDecks,
    propose:        proposeFromStats,
    _internals:     { cards: function () { return _cards; }, schema: function () { return _schema; } }
  };

  // ── Go ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

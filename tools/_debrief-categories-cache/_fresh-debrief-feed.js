/**
 * DebriefFeed — persistent left-column panel cycling between display modes.
 *
 * Adapted from EyesOnly debrief-feed-controller.js. CRT terminal aesthetic.
 * Click anywhere on the panel to cycle modes.
 *
 * Modes:
 *   0 — MOK Avatar:  Character portrait + expression + compact gauges + stats
 *   1 — Resources:   Full-width HP/EN/BAT bars, buffs, currency, bag capacity
 *   2 — Feed:        Combat log / event history, newest at bottom, cursor blink
 *
 * Layer 2 (after HUD, before MenuBox)
 * Depends on: Player, i18n, SessionStats (optional)
 */
var DebriefFeed = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  // Single-page smartwatch layout — no cycling between modes.
  // All info (avatar + gauges + stats) on one unified page.
  var MODE_COUNT    = 1;
  var MODE_NAMES    = ['STATUS'];
  var MAX_FEED_LINES = 40;

  // EyesOnly pip-bar characters
  var BAR_FULL    = '\u2588';   // █
  var BAR_PARTIAL = '\u2592';   // ▒
  var BAR_EMPTY   = '\u2591';   // ░

  // Resource symbols (from EyesOnly RESOURCE_SYMBOLS)
  var RES_GLYPHS = { hp: '\u2665', energy: '\u25B3', battery: '\u25C8', fatigue: '\u022A' };

  // ── State ───────────────────────────────────────────────────────
  var _mode     = 0;     // Current display mode (0=MOK, 1=Resources, 2=Feed)
  var _el       = null;  // #debrief-feed DOM element
  var _headerEl = null;  // .df-header
  var _contentEl = null; // .df-content
  var _feedLog  = [];    // { text, type } — event log entries
  var _visible  = false;

  // ── Incinerator state ──────────────────────────────────────────
  var _incineratorActive = false;  // true when drag hovers over panel
  var _incineratorGlow   = 0;     // 0..1 glow intensity for animation
  var INCINERATOR_ZONE   = 'debrief-incinerator';

  // ── DOC-107 Phase 3 — faction reputation strip ─────────────────
  // Per-faction row state lives in _categories.relationships.rows (see
  // DOC-109 Phase 2 below). The legacy faction-only dict was migrated
  // out because the relationships category will also hold 'npc:<id>'
  // rows starting in Phase 6, and keeping two parallel state stores
  // was the main source of bugs in the EyesOnly prototype.
  // Faction colors — matched to Biome Plan §19.1 suit alignment.
  // The internal ids are Street Chronicles codenames retained for
  // narrative ambiguity; the displayed colors read from their
  // in-world counterpart biomes.
  //   bprd       = The Necromancer     ♥  crimson (employer, outside triangle)
  //   mss        = Tide Council        ♠  coral-teal (Coral Cellars)
  //   pinkerton  = Foundry Collective  ♦  brass/forge (Ironhold Depths)
  //   jesuit     = The Admiralty       ♣  lamp amethyst (Lamplit Catacombs)
  var FACTION_COLORS = {
    bprd:      '#B8395A',
    mss:       '#5F9EA0',
    pinkerton: '#B87333',
    jesuit:    '#6B5BA8'
  };
  // Display labels per faction, used as fallback when i18n.t is
  // unavailable. i18n keys are 'faction.<id>.name'. Canonical
  // in-world names per Biome Plan §19.1.
  var FACTION_LABELS = {
    bprd:      'The Necromancer',
    mss:       'Tide Council',
    pinkerton: 'Foundry Collective',
    jesuit:    'The Admiralty'
  };
  // Suit glyphs per faction — appended to the row header so the
  // suit alignment (which drives the RPS combat triangle) is
  // readable at a glance. i18n keys are 'faction.<id>.suit'.
  // ♥ is outside the ♣/♦/♠ triangle — used for the employer.
  var FACTION_SUITS = {
    bprd:      '\u2665', // ♥
    mss:       '\u2660', // ♠
    pinkerton: '\u2666', // ♦
    jesuit:    '\u2663'  // ♣
  };
  // Suit color accents (spade/club = black; heart/diamond = red).
  // Renders the glyph in the classic card-suit color alongside the
  // faction name tinted to its biome color.
  var SUIT_COLORS = {
    '\u2660': '#1A1A1A', // spade  — black
    '\u2663': '#1A1A1A', // club   — black
    '\u2665': '#C8314A', // heart  — red
    '\u2666': '#C8314A'  // diamond — red
  };
  // Tier display labels — fallback when i18n.t lookup misses.
  // Keys are 'rep.tier.<id>'.
  var TIER_LABELS = {
    hated:      'Hated',
    unfriendly: 'Unfriendly',
    neutral:    'Neutral',
    friendly:   'Friendly',
    allied:     'Allied',
    exalted:    'Exalted'
  };

  // ── DOC-109 Phase 2 — category wrapper ─────────────────────────
  // Two expandable categories ('readiness' and 'relationships') that
  // collapse their rows into a single "most recently updated" summary
  // line when closed, and fan out into all rows when open. Phase 2
  // wires relationships only (readiness arrives in Phase 3).
  //
  // Row storage: rows[rowId] holds the per-subject data and animation
  // flags. For relationships, rowId is namespaced as 'faction:<id>' to
  // match the Phase 0 ReputationBar subject-kind scheme — Phase 6 will
  // add 'npc:<id>' rows under the same category.
  //
  // Expansion state lives on the category, not on individual rows. The
  // legacy expandFaction/collapseFaction surface delegates into the
  // category so existing callers keep working unchanged.
  var _categories = {
    readiness: {
      id:           'readiness',
      label:        'Readiness',
      rows:         {},         // rowId → row state (Phase 3)
      order:        [],         // display order (Phase 3)
      expanded:     false,
      revealed:     false,
      mostRecentId: null,
      _lastUpdateAt: 0          // reserved for Phase 5 auto-retract
    },
    relationships: {
      id:           'relationships',
      label:        'Relationships',
      rows:         {},         // rowId → { kind, subjectId, favor, tier, justRevealed, justBumped, justTierCrossed }
      order:        [],
      expanded:     false,
      revealed:     false,
      mostRecentId: null,
      _lastUpdateAt: 0
    }
  };

  // Parse a rowId of the form 'kind:subjectId' into its parts. Legacy
  // callers pass a bare faction id (no ':'), which we map to 'faction:<id>'
  // transparently so the migration is invisible upstream.
  function _parseRowId(rowId) {
    if (typeof rowId !== 'string' || !rowId) return { kind: '', subjectId: '' };
    var colonAt = rowId.indexOf(':');
    if (colonAt < 0) return { kind: 'faction', subjectId: rowId };
    return { kind: rowId.slice(0, colonAt), subjectId: rowId.slice(colonAt + 1) };
  }
  function _makeRowId(kind, subjectId) { return kind + ':' + subjectId; }

  // MOK avatar state
  var _mokEmoji     = '\uD83D\uDDE1\uFE0F';  // 🗡️ default
  var _mokCallsign  = 'ROOK';
  var _mokClass     = 'Blade';
  var _mokExpression = 'idle'; // idle, hurt, happy, alert, dead

  // ── Roll-down animation state ──────────────────────────────────
  // Reverse coin-pump fanfare: when a numeric pool drops, animate the
  // displayed number down from the previous value with a pulse flash.
  //
  // One tween per key ('hp', 'en', 'bat'). While a tween is running the
  // *displayed* value lags the real value — _renderUnified draws the
  // lagged number, not p.energy. The rAF loop advances each tween and
  // re-writes the corresponding DOM nodes in place (so full re-renders
  // triggered mid-tween do not stomp the animation).
  var ROLL_MS = 420;                           // matches --df-drain-flash keyframe
  var _rollState = {};                         // key → { from, to, t0, duration }
  var _prevPool  = { hp: null, en: null, bat: null, fat: null };
  var _rafId     = 0;

  function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function _laggedValue(key, realVal) {
    var r = _rollState[key];
    if (!r) return realVal;
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var t = Math.min(1, (now - r.t0) / r.duration);
    return r.from + (r.to - r.from) * _easeOutCubic(t);
  }

  function _startRoll(key, from, to) {
    _rollState[key] = { from: from, to: to, t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()), duration: ROLL_MS };
    // Flash the row
    var row = document.getElementById('df-row-' + key);
    if (row) {
      row.classList.remove('df-drain-pulse');
      // force reflow so the animation restarts cleanly
      void row.offsetWidth;
      row.classList.add('df-drain-pulse');
    }
    if (!_rafId) _tick();
  }

  function _tick() {
    _rafId = 0;
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var anyActive = false;
    var keys = ['hp', 'en', 'bat'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var r = _rollState[k];
      if (!r) continue;
      var t = Math.min(1, (now - r.t0) / r.duration);
      var v = r.from + (r.to - r.from) * _easeOutCubic(t);
      _paintPool(k, v, r.to);
      if (t >= 1) {
        delete _rollState[k];
      } else {
        anyActive = true;
      }
    }
    if (anyActive && typeof requestAnimationFrame !== 'undefined') {
      _rafId = requestAnimationFrame(_tick);
    }
  }

  /**
   * Paint a single pool's lagged display value into the DOM without re-rendering.
   * cur = current tweened value, target = final pool value (used for max clamp).
   */
  function _paintPool(key, cur, target) {
    var p = (typeof Player !== 'undefined') ? Player.state() : {};
    var max;
    if (key === 'hp')  max = p.maxHp     || 1;
    else if (key === 'en')  max = p.maxEnergy  || 1;
    else                    max = p.maxBattery || 1;

    var numEl = document.getElementById('df-num-' + key);
    var fillEl = document.getElementById('df-fill-' + key);
    if (numEl) numEl.textContent = Math.round(cur) + '/' + max;
    if (fillEl) {
      var pct = Math.max(0, Math.min(100, (cur / max) * 100));
      fillEl.style.width = pct + '%';
    }
    // Pip-row (battery): rewrite glyphs in place
    var pipsEl = document.getElementById('df-pips-' + key);
    if (pipsEl) {
      var n = Math.round(cur);
      var s = '';
      for (var i = 0; i < max; i++) s += (i < n) ? '\u25C8' : '\u25C7';
      pipsEl.textContent = s;
    }
  }

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    _el        = document.getElementById('debrief-feed');
    _headerEl  = document.getElementById('df-header');
    _contentEl = document.getElementById('df-content');

    if (_el) {
      // Single-page mode — click no longer cycles.
      // Kept for incinerator drop zone registration only.
      _el.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    // Register as DragDrop incinerator zone
    _registerIncinerator();
  }

  // ── Incinerator Zone ────────────────────────────────────────────

  function _registerIncinerator() {
    if (typeof DragDrop === 'undefined' || !_el) return;

    DragDrop.registerZone(INCINERATOR_ZONE, {
      x: 0, y: 0, w: 0, h: 0,  // Updated dynamically
      accepts: function (payload) {
        // Accept cards and items, reject key items
        if (!payload) return false;
        if (payload.type === 'card' || payload.type === 'item') {
          // Don't accept key items
          if (payload.data && payload.data.isKey) return false;
          return true;
        }
        return false;
      },
      onDrop: function (payload) {
        return _handleIncineratorDrop(payload);
      },
      onHover: function () {
        _incineratorActive = true;
        if (_el) _el.style.boxShadow = '0 0 20px rgba(255,120,0,0.6), inset 0 0 15px rgba(255,60,0,0.3)';
      },
      onLeave: function () {
        _incineratorActive = false;
        if (_el) _el.style.boxShadow = '';
      }
    });
  }

  /**
   * Update incinerator zone bounds (call when panel layout changes).
   */
  function _updateIncineratorBounds() {
    if (typeof DragDrop === 'undefined' || !_el) return;
    var rect = _el.getBoundingClientRect();
    // Convert DOM rect to canvas coordinates (panels overlay the canvas)
    var canvas = document.getElementById('view-canvas');
    var cRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    DragDrop.updateZone(INCINERATOR_ZONE, {
      x: rect.left - cRect.left,
      y: rect.top - cRect.top,
      w: rect.width,
      h: rect.height
    });
  }

  /**
   * Handle an item/card dropped on the incinerator.
   * Returns true if accepted.
   */
  function _handleIncineratorDrop(payload) {
    if (!payload) return false;

    var name = '???';
    var refund = 0;

    if (payload.type === 'card') {
      name = (payload.data && payload.data.name) || 'Card';
      // Rarity-based refund: rare 5g, uncommon 3g, common 1g
      var rarity = (payload.data && payload.data.rarity) || 'common';
      refund = rarity === 'rare' ? 5 : (rarity === 'uncommon' ? 3 : 1);
    } else if (payload.type === 'item') {
      name = (payload.data && payload.data.name) || 'Item';
      // Items refund 10% of value (min 1g)
      var itemVal = (payload.data && payload.data.value) || 0;
      refund = itemVal > 0 ? Math.max(1, Math.floor(itemVal * 0.1)) : 1;
    }

    // Log the disposal
    var emoji = (payload.data && payload.data.emoji) || '\uD83D\uDCE6';
    logEvent('\uD83D\uDD25 Disposed: ' + emoji + ' ' + name, 'damage');

    // Grant refund if any
    if (refund > 0 && typeof CardAuthority !== 'undefined') {
      CardAuthority.addGold(refund);
      logEvent('  +' + refund + 'g refund', 'loot');
    }

    // Play SFX
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui_close');  // placeholder burn sound
    }

    // Toast notification
    if (typeof Toast !== 'undefined') {
      var msg = '\uD83D\uDD25 ' + name + ' destroyed';
      if (refund > 0) msg += ' (+' + refund + 'g)';
      Toast.show(msg);
    }

    // Clear glow
    _incineratorActive = false;
    if (_el) _el.style.boxShadow = '';

    return true;
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  function show() {
    _visible = true;
    if (_el) _el.style.display = 'flex';
    render();
    // Update incinerator bounds after layout settles
    setTimeout(_updateIncineratorBounds, 50);
  }

  function hide() {
    _visible = false;
    if (_el) _el.style.display = 'none';
  }

  function isVisible() { return _visible; }

  // ── Mode cycling ────────────────────────────────────────────────

  function cycleMode() {
    _mode = (_mode + 1) % MODE_COUNT;
    render();
  }

  function setMode(m) {
    _mode = Math.max(0, Math.min(MODE_COUNT - 1, m));
    render();
  }

  function getMode() { return _mode; }

  // ── Render ──────────────────────────────────────────────────────

  function render() {
    if (!_visible || !_contentEl || !_headerEl) return;

    // Dynamic scale factor based on panel width (reference: 273px design width)
    var elW = _el ? _el.offsetWidth : 273;
    var _S = Math.max(0.72, elW / 273);
    if (_el) _el.style.fontSize = Math.max(12, Math.round(15 * _S)) + 'px';

    // Smartwatch header: callsign only (time lives in weekly day counter)
    _headerEl.textContent = _escape(_mokCallsign);

    // Single unified page — avatar + gauges + stats + compact feed tail
    _renderUnified(_S);
  }

  // ── Unified smartwatch display ──────────────────────────────────

  function _renderUnified(S) {
    S = S || 1;
    var p = (typeof Player !== 'undefined') ? Player.state() : {};
    var hp    = p.hp || 0;
    var maxHp = p.maxHp || 10;
    var en    = p.energy || 0;
    var maxEn = p.maxEnergy || 5;
    var bat   = (typeof p.battery === 'number') ? p.battery : 3;
    var maxBat = p.maxBattery || 5;
    var currency = p.currency || 0;
    // Fatigue: read from Player (inverse resource — higher = worse)
    var fat    = (typeof Player !== 'undefined' && Player.getFatigue) ? Player.getFatigue() : 0;
    var maxFat = (typeof Player !== 'undefined' && Player.getMaxFatigue) ? Player.getMaxFatigue() : 100;

    // Detect drops vs last render → kick off reverse-fanfare tweens.
    // Only trigger on DECREASES; increases snap (matches pump pattern:
    // up-pumps are a separate fanfare reserved for HUD coin/score).
    if (_prevPool.hp  !== null && hp  < _prevPool.hp)  _startRoll('hp',  _prevPool.hp,  hp);
    if (_prevPool.en  !== null && en  < _prevPool.en)  _startRoll('en',  _prevPool.en,  en);
    if (_prevPool.bat !== null && bat < _prevPool.bat) _startRoll('bat', _prevPool.bat, bat);
    // Fatigue goes UP on exertion, so "increase" is the "bad" direction
    if (_prevPool.fat !== null && fat > _prevPool.fat) _startRoll('fat', _prevPool.fat, fat);

    // Choose what value to paint: if a tween is active for this key,
    // compute its current lagged value so a mid-tween re-render doesn't
    // snap back to the start. Otherwise show the real value.
    var hpShown  = _laggedValue('hp',  hp);
    var enShown  = _laggedValue('en',  en);
    var batShown = _laggedValue('bat', bat);
    var fatShown = _laggedValue('fat', fat);

    _prevPool.hp  = hp;
    _prevPool.en  = en;
    _prevPool.bat = bat;
    _prevPool.fat = fat;

    var html = '';

    // Compact avatar row (emoji + class)
    html += '<div class="df-avatar" style="padding:2px 0">';
    html += '<span class="df-emoji">' + _mokEmoji + '</span> ';
    html += '<span class="df-class">' + _escape(_mokClass) + '</span>';
    html += '</div>';

    // Full-width bars
    html += _fullBar('HP', hpShown, maxHp, '#FF6B9D', 'hp', S);
    html += _fullBar('EN', enShown, maxEn, '#00D4FF', 'en', S);
    html += _pipRow('BAT', batShown, maxBat, '#00FFA6', 'bat', S);
    // Fatigue bar (inverse: fills UP as exertion increases, brown earthy)
    if (fat > 0) {
      html += _fullBar(RES_GLYPHS.fatigue + ' FTG', fatShown, maxFat, '#A0522D', 'fat', S);
    }

    // Currency + stats row (compact)
    html += '<div class="df-stat-row" style="margin-top:2px">\uD83D\uDCB0 <span>' + currency + 'g</span></div>';

    if (p.str !== undefined) {
      html += '<div class="df-stat-row">';
      html += 'STR ' + (p.str || 0) + ' \u2502 ';
      html += 'DEX ' + (p.dex || 0) + ' \u2502 ';
      html += 'STL ' + (p.stealth || 0);
      html += '</div>';
    }

    // Buffs
    if (typeof StatusEffect !== 'undefined' && StatusEffect.getAll) {
      var effs = StatusEffect.getAll();
      if (effs && effs.length > 0) {
        html += '<div class="df-stat-row" style="color:var(--phosphor-dim)">';
        for (var i = 0; i < effs.length; i++) {
          html += (effs[i].emoji || '\u25CF') + ' ';
        }
        html += '</div>';
      }
    }

    // ── Category wrapper strip (DOC-109 Phase 2) ────────────────
    // Migrated from the raw faction-strip loop. _categories.relationships
    // owns the expanded/collapsed state for all faction rows (and, in
    // Phase 6, NPC rows). Phase 3 will also render _categories.readiness
    // below this block. Click the category head → toggleCategory(id).
    html += _renderCategoryRow(_categories.relationships);

    // Compact feed tail — last 2 events (avatar + 2-line event feed)
    if (_feedLog.length > 0) {
      var tailCount = Math.min(2, _feedLog.length);
      var startIdx  = _feedLog.length - tailCount;
      html += '<hr class="df-divider">';
      for (var fi = startIdx; fi < _feedLog.length; fi++) {
        var entry = _feedLog[fi];
        var cls = 'df-feed-line';
        if (entry.type === 'loot') cls += ' df-loot';
        else if (entry.type === 'damage') cls += ' df-dmg';
        else if (entry.type === 'heal') cls += ' df-heal';
        html += '<div class="' + cls + '" style="font-size:0.8em">' + _escape(entry.text) + '</div>';
      }
    }

    _contentEl.innerHTML = html;
  }

  function _gaugeRow(label, cur, max, color, barW) {
    barW = barW || 8;
    max = (max > 0) ? max : 1;
    cur = Math.max(0, Math.min(max, cur));
    var ratio = (cur / max) * barW;
    var full = Math.floor(ratio);
    var partial = ratio - full;
    var bar = '';
    for (var i = 0; i < barW; i++) {
      if (i < full) bar += BAR_FULL;
      else if (i === full && partial >= 0.25) bar += BAR_PARTIAL;
      else bar += BAR_EMPTY;
    }
    var numStr = String(Math.ceil(cur));

    return '<div class="df-gauge-row">' +
      '<span class="df-label">' + label + '</span>' +
      '<span class="df-bar" style="color:' + color + '">' + numStr + bar + '</span>' +
      '</div>';
  }

  function _fullBar(label, cur, max, color, key, S) {
    S = S || 1;
    max = (max > 0) ? max : 1;
    var shown = Math.round(cur);
    var pct = Math.max(0, Math.min(100, (cur / max) * 100));
    var rowId  = key ? ' id="df-row-'  + key + '"' : '';
    var numId  = key ? ' id="df-num-'  + key + '"' : '';
    var fillId = key ? ' id="df-fill-' + key + '"' : '';
    var barH = Math.max(4, Math.round(6 * S));
    return '<div class="df-gauge-row"' + rowId + '>' +
      '<span class="df-label">' + label + '</span>' +
      '<span style="color:' + color + ';font-size:1em"' + numId + '>' + shown + '/' + max + '</span>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.08);height:' + barH + 'px;border-radius:3px;margin:2px 0 5px">' +
      '<div' + fillId + ' style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:3px;transition:width 0.3s"></div>' +
      '</div>';
  }

  function _pipRow(label, cur, max, color, key, S) {
    S = S || 1;
    max = (max > 0) ? max : 1;
    cur = Math.round(cur);
    var pips = '';
    for (var i = 0; i < max; i++) {
      pips += (i < cur) ? '\u25C8' : '\u25C7'; // ◈ vs ◇
    }
    var rowId = key ? ' id="df-row-' + key + '"' : '';
    var pipsId = key ? ' id="df-pips-' + key + '"' : '';
    return '<div class="df-gauge-row"' + rowId + '>' +
      '<span class="df-label">' + label + '</span>' +
      '<span' + pipsId + ' style="color:' + color + ';letter-spacing:2px;font-size:1.05em">' + pips + '</span>' +
      '</div>';
  }

  // ── DOC-109 Phase 2 — category render + toggle helpers ────────

  // Render a category block. Returns '' when the category is not revealed.
  // When collapsed, emits a single "most recent" summary row under the
  // category head. When expanded, emits all rows in cat.order.
  function _renderCategoryRow(cat) {
    if (!cat || !cat.revealed) return '';

    var chevron   = cat.expanded ? '\u25BE' : '\u25B8';  // ▾ vs ▸
    var chevCls   = 'df-cat-chevron' + (cat.expanded ? ' df-cat-chev-open' : '');
    var headId    = 'df-cat-head-' + cat.id;
    var bodyId    = 'df-cat-body-' + cat.id;
    var catCls    = 'df-category df-category-' + cat.id;
    if (cat.expanded) catCls += ' df-category-expanded';

    // Category header — always visible when revealed. Click toggles expand.
    var head = '<div class="df-category-head" id="' + headId +
               '" data-cat-id="' + cat.id + '" onclick="DebriefFeed.toggleCategory(\'' +
               cat.id + '\')" role="button" tabindex="0">' +
                 '<span class="' + chevCls + '">' + chevron + '</span>' +
                 '<span class="df-cat-label">' + _escape(cat.label) + '</span>' +
               '</div>';

    var body = '';
    if (cat.expanded) {
      // Expanded: render every row in display order.
      body = '<div class="df-category-body" id="' + bodyId + '">';
      for (var i = 0; i < cat.order.length; i++) {
        body += _renderRowByKind(cat, cat.order[i]);
      }
      body += '</div>';
    } else if (cat.mostRecentId && cat.rows[cat.mostRecentId]) {
      // Collapsed: render only the most-recently-updated row.
      body = '<div class="df-cat-collapsed-row" id="' + bodyId + '">' +
               _renderRowByKind(cat, cat.mostRecentId) +
             '</div>';
    }

    return '<div class="' + catCls + '" data-cat-id="' + cat.id + '">' +
             head + body +
           '</div>';
  }

  // Dispatch a row render by kind. Faction rows go through the existing
  // _factionRow helper so visual parity with the DOC-107 strip is exact.
  // Phase 6 will add 'npc' dispatch here.
  function _renderRowByKind(cat, rowId) {
    var row = cat.rows[rowId];
    if (!row) return '';
    if (row.kind === 'faction') {
      return _factionRow(row.subjectId, row);
    }
    // Unknown kind — emit nothing rather than crashing.
    return '';
  }

  // Mark a category as revealed (first-time reveal on next render).
  function revealCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.revealed = true;
    if (_visible) render();
    return true;
  }

  // Mark a category as expanded (shows full body). Also reveals it if
  // it wasn't already — expanding an unrevealed category is a valid
  // entry point (e.g. the dispatcher-cinematic reveal path).
  function expandCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.revealed = true;
    cat.expanded = true;
    if (_visible) render();
    return true;
  }

  function collapseCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.expanded = false;
    if (_visible) render();
    return true;
  }

  // Click-handler target from _renderCategoryRow. Flips expanded.
  function toggleCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.expanded = !cat.expanded;
    if (_visible) render();
    return cat.expanded;
  }

  // Get read-only category state (tests + save serialization).
  function getCategoryState(catId) {
    var cat = _categories[catId];
    if (!cat) return null;
    return {
      id:           cat.id,
      label:        cat.label,
      expanded:     !!cat.expanded,
      revealed:     !!cat.revealed,
      mostRecentId: cat.mostRecentId,
      order:        cat.order.slice()
    };
  }

  // Write a single relationships-category row. Creates the row if it's
  // new, updates favor/tier/animation flags otherwise, and moves the row
  // to mostRecentId. Kind is 'faction' (Phase 2) or 'npc' (Phase 6).
  function _setRelationshipRow(kind, subjectId, data) {
    var cat = _categories.relationships;
    var rowId = _makeRowId(kind, subjectId);
    var existing = cat.rows[rowId];
    var now = (typeof Date !== 'undefined') ? Date.now() : 0;

    if (!existing) {
      cat.rows[rowId] = {
        kind:             kind,
        subjectId:        subjectId,
        favor:            (data && typeof data.favor === 'number') ? data.favor : 0,
        tier:             (data && data.tier) || 'neutral',
        expanded:         true,  // back-compat with getFactionState
        justRevealed:     !!(data && data.justRevealed),
        justBumped:       false,
        justTierCrossed:  false
      };
      cat.order.push(rowId);
    } else {
      var prevFavor = existing.favor;
      var prevTier  = existing.tier;
      if (data && typeof data.favor === 'number') existing.favor = data.favor;
      if (data && typeof data.tier === 'string')  existing.tier  = data.tier;
      if (existing.favor > prevFavor) existing.justBumped = true;
      if (existing.tier !== prevTier) existing.justTierCrossed = true;
      if (data && data.justRevealed)  existing.justRevealed = true;
    }

    cat.mostRecentId   = rowId;
    cat._lastUpdateAt  = now;
    return cat.rows[rowId];
  }

  // ── DOC-107 Phase 3 — faction-row helpers ──────────────────────

  // i18n lookup with fallback to FACTION_LABELS / TIER_LABELS.
  function _i18n(key, fallback) {
    if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  // Resolve the favor → progress-within-tier ratio. Returns 0..1.
  // For 'exalted' (open-ended top tier) we cap at 1 once the player
  // has any favor above the exalted threshold — there's no "next tier".
  function _tierProgress(favor, tierId) {
    if (typeof QuestTypes === 'undefined' || !QuestTypes.REP_TIERS) return 0;
    var tiers = QuestTypes.REP_TIERS;
    var idx = -1;
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].id === tierId) { idx = i; break; }
    }
    if (idx < 0) return 0;
    var lo = tiers[idx].min;
    if (idx === tiers.length - 1) {
      // Exalted: no upper bound. Show full bar.
      return 1;
    }
    var hi = tiers[idx + 1].min;
    if (lo === -Infinity) {
      // Hated: no lower bound. Show empty bar (player is at the bottom).
      return 0;
    }
    var span = hi - lo;
    if (span <= 0) return 0;
    var p = (favor - lo) / span;
    return Math.max(0, Math.min(1, p));
  }

  function _factionRow(factionId, fdata) {
    var color = FACTION_COLORS[factionId] || '#888888';
    var name  = _i18n('faction.' + factionId + '.name', FACTION_LABELS[factionId] || factionId.toUpperCase());
    var suit  = _i18n('faction.' + factionId + '.suit', FACTION_SUITS[factionId] || '');
    var suitColor = SUIT_COLORS[suit] || '#888888';
    var tierId = fdata.tier || 'neutral';
    var tierLabel = _i18n('rep.tier.' + tierId, TIER_LABELS[tierId] || tierId);
    var pct = Math.round(_tierProgress(fdata.favor || 0, tierId) * 100);

    // Animation classes: stack reveal + bump + tiercross as appropriate.
    // Each is consumed (cleared) on the next render so a re-render
    // mid-pulse doesn't restart the animation indefinitely.
    var classes = 'df-faction-row';
    if (fdata.justRevealed)    classes += ' df-faction-reveal';
    if (fdata.justBumped)      classes += ' df-faction-bump';
    if (fdata.justTierCrossed) classes += ' df-faction-tiercross';
    fdata.justRevealed    = false;
    fdata.justBumped      = false;
    fdata.justTierCrossed = false;

    var rowId  = ' id="df-fac-row-'  + factionId + '"';
    var nameId = ' id="df-fac-name-' + factionId + '"';
    var suitId = ' id="df-fac-suit-' + factionId + '"';
    var tierEl = ' id="df-fac-tier-' + factionId + '"';
    var fillId = ' id="df-fac-fill-' + factionId + '"';

    // Suit glyph renders inline before the name. Card-suit color
    // (red for ♥/♦, black for ♠/♣) so the alignment reads at a glance.
    var suitHtml = '';
    if (suit) {
      suitHtml = '<span class="df-faction-suit"' + suitId +
        ' style="color:' + suitColor + '">' + _escape(suit) + '</span>';
    }

    return '<div class="' + classes + '"' + rowId + '>' +
      '<div class="df-faction-head">' +
        suitHtml +
        '<span class="df-faction-name"' + nameId + ' style="color:' + color + '">' + _escape(name) + '</span>' +
        '<span class="df-faction-tier"' + tierEl + '>' + _escape(tierLabel) + '</span>' +
      '</div>' +
      '<div class="df-faction-track">' +
        '<div class="df-faction-fill"' + fillId + ' style="width:' + pct + '%;background:' + color + '"></div>' +
      '</div>' +
    '</div>';
  }

  // Public — expand a faction row in the strip. Triggers reveal
  // animation on next render. opts.animate defaults to true.
  //
  // DOC-109 Phase 2: delegates through _categories.relationships so the
  // legacy surface keeps working while the category wrapper drives the
  // actual render. First-time expansion reveals the category and sets
  // the subject row's justRevealed flag (reveal slide/grow animation).
  function expandFaction(factionId, opts) {
    if (typeof factionId !== 'string' || !factionId) return;
    var cat = _categories.relationships;
    var rowId = _makeRowId('faction', factionId);
    var existed = !!cat.rows[rowId];
    var animate = !opts || opts.animate !== false;

    // Create the row lazily if the caller expands before ever calling
    // updateFaction — matches legacy behavior (favor:0, tier:neutral).
    _setRelationshipRow('faction', factionId, animate && !existed ? { justRevealed: true } : {});

    cat.revealed = true;
    cat.expanded = true;
    // Also flip the per-row expanded flag so getFactionState matches
    // its legacy contract (expanded=true after expandFaction).
    cat.rows[rowId].expanded = true;
    if (_visible) render();
  }

  // Public — hide a faction row without losing its favor/tier state.
  // DOC-109 Phase 2: individual-row collapse now means "collapse the
  // relationships category". The subject row itself is preserved in
  // cat.rows so its favor/tier survive; getFactionState returns
  // expanded=false via the category's expanded flag.
  function collapseFaction(factionId) {
    var cat = _categories.relationships;
    var rowId = _makeRowId('faction', factionId);
    if (!cat.rows[rowId]) return;
    cat.expanded = false;
    cat.rows[rowId].expanded = false;
    if (_visible) render();
  }

  // Public — push new favor + tier into the strip. Drives the bump
  // animation on increases; tier-cross adds an extra goldflash.
  // Auto-expands the row if the favor/tier delta is non-trivial AND
  // the caller passed opts.expandOnUpdate (default false — explicit
  // expand via expandFaction is the canonical reveal path).
  //
  // DOC-109 Phase 2: delegates to _setRelationshipRow, which handles
  // bump/tier-cross animation flags and mostRecentId tracking for the
  // relationships category's collapsed-view summary line.
  function updateFaction(factionId, favor, tier, opts) {
    if (typeof factionId !== 'string' || !factionId) return;
    var row = _setRelationshipRow('faction', factionId, {
      favor: +favor || 0,
      tier:  tier || 'neutral'
    });
    if (opts && opts.expandOnUpdate) {
      _categories.relationships.revealed = true;
      _categories.relationships.expanded = true;
      if (row) row.expanded = true;
    }
    if (_visible) render();
  }

  // Public — read-only snapshot for tests / save serialization.
  // DOC-109 Phase 2: expanded now reflects the per-row flag (which
  // mirrors the category's expanded flag). Preserves the legacy
  // { favor, tier, expanded } shape so existing test assertions pass.
  function getFactionState(factionId) {
    var cat = _categories.relationships;
    var rowId = _makeRowId('faction', factionId);
    var r = cat.rows[rowId];
    if (!r) return null;
    return { favor: r.favor, tier: r.tier, expanded: !!r.expanded };
  }

  // ── Feed mode ───────────────────────────────────────────────────

  function _renderFeed() {
    var html = '';
    if (_feedLog.length === 0) {
      html = '<div class="df-feed-line" style="opacity:0.4">No events yet.</div>';
    } else {
      for (var i = 0; i < _feedLog.length; i++) {
        var entry = _feedLog[i];
        var cls = 'df-feed-line';
        if (entry.type === 'loot') cls += ' df-loot';
        else if (entry.type === 'damage') cls += ' df-dmg';
        else if (entry.type === 'heal') cls += ' df-heal';
        html += '<div class="' + cls + '">' + _escape(entry.text) + '</div>';
      }
    }

    _contentEl.innerHTML = html;
    // Auto-scroll to bottom
    _contentEl.scrollTop = _contentEl.scrollHeight;
  }

  // ── Feed API ────────────────────────────────────────────────────

  /**
   * Add an event to the feed log.
   * @param {string} text — short event description
   * @param {string} [type] — 'loot', 'damage', 'heal', or '' (default)
   */
  function logEvent(text, type) {
    _feedLog.push({ text: text, type: type || '' });
    if (_feedLog.length > MAX_FEED_LINES) {
      _feedLog.shift();
    }
    // Re-render — feed tail is embedded in unified view
    if (_visible) {
      render();
    }
  }

  function clearFeed() {
    _feedLog.length = 0;
    if (_mode === 2 && _visible) _renderFeed();
  }

  // ── MOK API ─────────────────────────────────────────────────────

  function setAvatar(emoji, callsign, className) {
    _mokEmoji = emoji || _mokEmoji;
    _mokCallsign = callsign || _mokCallsign;
    _mokClass = className || _mokClass;
    if (_mode === 0 && _visible) _renderUnified();
  }

  function setExpression(expr) {
    _mokExpression = expr || 'idle';
    // Future: expression affects avatar emoji/animation
  }

  // ── Refresh (called from game loop when player state changes) ──

  function refresh() {
    if (!_visible) return;
    _renderUnified();
    // Feed mode doesn't need periodic refresh — it's event-driven
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function _escape(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init:          init,
    show:          show,
    hide:          hide,
    isVisible:     isVisible,
    cycleMode:     cycleMode,
    setMode:       setMode,
    getMode:       getMode,
    render:        render,
    refresh:       refresh,

    // Feed
    logEvent:      logEvent,
    clearFeed:     clearFeed,

    // MOK
    setAvatar:     setAvatar,
    setExpression: setExpression,

    // DOC-107 Phase 3 — Faction reputation strip
    expandFaction:   expandFaction,
    collapseFaction: collapseFaction,
    updateFaction:   updateFaction,
    getFactionState: getFactionState,

    // DOC-109 Phase 2 — Category wrapper
    revealCategory:   revealCategory,
    expandCategory:   expandCategory,
    collapseCategory: collapseCategory,
    toggleCategory:   toggleCategory,
    getCategoryState: getCategoryState,

    // Incinerator
    updateIncineratorBounds: _updateIncineratorBounds
  };
})();

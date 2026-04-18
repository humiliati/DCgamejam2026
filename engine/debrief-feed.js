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

  // ── DOC-109 Phase 5 — Auto-retract tuning ───────────────────────
  // Expanded categories auto-collapse after an incoming update, so
  // the "most recent" summary line reappears once the flash finishes.
  // Policy: see docs/DEBRIEF_FEED_CATEGORIES_ROADMAP.md Phase 5.
  //   - MIN_EXPAND_WINDOW_MS: no auto-retract during this grace window
  //                           after expandCategory/toggleCategory open
  //                           (protects "I just opened it, let me read").
  //   - RETRACT_DELAY_MS:    wait this long after the triggering update
  //                           before collapsing. Lets the bump/tier-cross
  //                           keyframe play out before the row disappears.
  // Explicit collapseCategory() or toggleCategory()-to-collapse always
  // wins, cancelling any pending retract timer.
  var CATEGORY_MIN_EXPAND_WINDOW_MS = 600;
  var CATEGORY_RETRACT_DELAY_MS     = 600;

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

  // ── DOC-109 Phase 3 — Readiness group display data ─────────────
  // Dungeon-group metadata for the three ♠ ♣ ♦ hero-day contracts
  // tracked by DungeonSchedule. Each group corresponds to a faction's
  // biome palette (coral-teal ♠ / lamp-amethyst ♣ / brass-forge ♦)
  // that matches FACTION_COLORS above, so the row tint feels like it
  // belongs in the same widget family as the relationships rows.
  //
  // The groupId strings match DungeonSchedule's JAM_CONTRACTS entries
  // ('club'/'spade'/'diamond'), so the ReadinessCalc 'group-score-change'
  // event's `groupId` maps straight into this table without translation.
  var GROUP_DATA = {
    spade: {
      label: 'Coral Cellars',
      suit:  '\u2660', // ♠
      tint:  '#5F9EA0' // coral-teal (matches mss)
    },
    club: {
      label: 'Hero\u2019s Wake',
      suit:  '\u2663', // ♣
      tint:  '#6B5BA8' // lamp amethyst (matches jesuit)
    },
    diamond: {
      label: 'Ironhold Depths',
      suit:  '\u2666', // ♦
      tint:  '#B87333' // brass (matches pinkerton)
    }
  };
  // Deterministic render order (matches the ♠ ♣ ♦ print order).
  var GROUP_ORDER = ['spade', 'club', 'diamond'];

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
      _lastUpdateAt: 0,         // wall-clock ms at last row write
      expandedAtTs: 0           // Phase 5 — stamped on expand; drives min-window suppression
    },
    relationships: {
      id:           'relationships',
      label:        'Relationships',
      rows:         {},         // rowId → { kind, subjectId, favor, tier, justRevealed, justBumped, justTierCrossed }
      order:        [],
      expanded:     false,
      revealed:     false,
      mostRecentId: null,
      _lastUpdateAt: 0,
      expandedAtTs: 0
    }
  };

  // Phase 5 — per-category pending retract timer handle. Keyed by catId;
  // value is whatever the sandbox's setTimeout returns (or null). Flushed
  // on explicit collapse/toggle-to-collapse, overwritten on debounce.
  var _retractTimers = {};

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

  // ── DOC-113 Phase C — Sprint timer state ─────────────────────────
  // Populated via showTimer()/updateTimer() which subscribe to
  // QuestChain's 'timer-*' event bus (wiring lives in Game.init).
  // Rendered above the category strip when non-null.
  //
  // Shape when active:
  //   { questId, totalMs, remainMs, pct, zone, paused, heroArchetype, heroName }
  //
  // zone is one of 'green' | 'yellow' | 'red' | 'expired'. heroName is
  // the display label looked up from i18n on showTimer() so we don't
  // have to re-resolve it every tick.
  var _timerState = null;

  // Archetype → hero display label for the expired message. Keys match
  // the QuestChain.timer.heroArchetype values emitted in 'timer-start'.
  // Wrapped in i18n.t() at render time so translators can override via
  // 'quest.sprint.hero_name.<archetype>' keys when those land.
  var _HERO_NAMES = {
    seeker:   'The Seeker',
    sentinel: 'The Sentinel',
    pursuer:  'The Pursuer',
    hunter:   'The Hunter'
  };

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
    if (typeof DragDrop === 'undefined' || !DragDrop || !_el) return;

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
    if (typeof DragDrop === 'undefined' || !DragDrop || !_el) return;
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
    if (refund > 0 && typeof CardAuthority !== 'undefined' && CardAuthority) {
      CardAuthority.addGold(refund);
      logEvent('  +' + refund + 'g refund', 'loot');
    }

    // Play SFX
    if (typeof AudioSystem !== 'undefined' && AudioSystem) {
      AudioSystem.play('ui_close');  // placeholder burn sound
    }

    // Toast notification
    if (typeof Toast !== 'undefined' && Toast) {
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
    if (typeof StatusEffect !== 'undefined' && StatusEffect && StatusEffect.getAll) {
      var effs = StatusEffect.getAll();
      if (effs && effs.length > 0) {
        html += '<div class="df-stat-row" style="color:var(--phosphor-dim)">';
        for (var i = 0; i < effs.length; i++) {
          html += (effs[i].emoji || '\u25CF') + ' ';
        }
        html += '</div>';
      }
    }

    // ── Sprint timer (DOC-113 Phase C) ──────────────────────────
    // Urgent-priority countdown row for fetch-kind quest steps. Sits
    // ABOVE the category wrappers so the player never has to expand a
    // category to see how long they have left. _timerState is null when
    // no sprint dungeon is active; see showTimer()/updateTimer()/hideTimer().
    if (_timerState) html += _renderTimerRow(_timerState);

    // ── Category wrapper strip (DOC-109 Phase 2 + 3) ────────────
    // Both categories share a single render path. Readiness lands
    // first so the dungeon scorecard reads above the standing bars —
    // "how clean is the place right now" before "how do people feel
    // about you". Readiness gate self-reveals on first updateReadiness;
    // Relationships gate opens via the dispatcher cinematic (Phase 4).
    // Click the category head → toggleCategory(id).
    html += _renderCategoryRow(_categories.readiness);
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
    if (row.kind === 'readiness') {
      return _readinessRow(row.subjectId, row);
    }
    if (row.kind === 'npc') {
      return _npcRow(row.subjectId, row);
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
  //
  // Phase 5: stamps expandedAtTs on the first-flip-to-expanded so the
  // auto-retract logic can suppress retract during the grace window.
  // Idempotent expand (already expanded) does not re-stamp — that
  // would reset the grace window on every programmatic expand.
  function expandCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    var wasExpanded = cat.expanded;
    cat.revealed = true;
    cat.expanded = true;
    if (!wasExpanded) {
      cat.expandedAtTs = _now();
      _cancelRetract(catId);
    }
    if (_visible) render();
    return true;
  }

  function collapseCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.expanded = false;
    _cancelRetract(catId);          // Phase 5 — explicit action wins
    if (_visible) render();
    return true;
  }

  // Click-handler target from _renderCategoryRow. Flips expanded.
  //
  // Phase 5: flip-to-expanded stamps expandedAtTs (grace window); the
  // reverse flip cancels any pending retract timer so a user click
  // doesn't get overridden 600 ms later by a stale scheduled collapse.
  function toggleCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.expanded = !cat.expanded;
    if (cat.expanded) {
      cat.expandedAtTs = _now();
      _cancelRetract(catId);
    } else {
      _cancelRetract(catId);
    }
    if (_visible) render();
    return cat.expanded;
  }

  // ── DOC-109 Phase 5 — Auto-retract machinery ────────────────────

  // Monotonic clock helper — sandboxed harnesses swap the sandbox's
  // Date object wholesale to drive the min-expand window forward, so
  // the module reads Date.now() on every call rather than caching.
  function _now() {
    return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
  }

  // Clear any pending retract for catId. Safe to call when nothing is
  // scheduled — used both by explicit collapse/toggle-to-collapse and
  // by _scheduleRetract itself to debounce back-to-back updates.
  function _cancelRetract(catId) {
    var t = _retractTimers[catId];
    if (t === undefined || t === null) return;
    if (typeof clearTimeout === 'function') {
      try { clearTimeout(t); } catch (e) { /* noop */ }
    }
    delete _retractTimers[catId];
  }

  // Arm (or re-arm) the retract timer for catId. Each new call clears
  // the previous handle, implementing debounce — if updates keep
  // arriving within RETRACT_DELAY_MS, the clock resets. When the
  // timer finally fires, it re-checks the category's expanded state
  // (a racing manual collapse may have already closed it).
  function _scheduleRetract(catId) {
    _cancelRetract(catId);
    if (typeof setTimeout !== 'function') return;
    _retractTimers[catId] = setTimeout(function () {
      delete _retractTimers[catId];
      var cat = _categories[catId];
      if (!cat || !cat.expanded) return;
      cat.expanded = false;
      if (_visible) render();
    }, CATEGORY_RETRACT_DELAY_MS);
  }

  // Entry point called from updateReadiness / updateRelationship
  // after the row write lands. Only arms the timer when the category
  // is actually expanded AND we're past the min-expand grace window.
  // Everything else is a silent no-op — the collapsed-row mostRecent
  // summary already updated via render(); no retract needed.
  function _maybeScheduleRetract(catId) {
    var cat = _categories[catId];
    if (!cat || !cat.expanded) return;
    var since = _now() - (cat.expandedAtTs || 0);
    if (since < CATEGORY_MIN_EXPAND_WINDOW_MS) return;
    _scheduleRetract(catId);
  }

  // Harness-only inspection of the pending retract handle map. Returns
  // a count, not the handles themselves, so tests stay decoupled from
  // whatever object shape setTimeout returns (Node vs browser).
  function _getPendingRetractCount(catId) {
    if (catId) {
      return (_retractTimers[catId] !== undefined && _retractTimers[catId] !== null) ? 1 : 0;
    }
    var n = 0;
    for (var k in _retractTimers) {
      if (_retractTimers.hasOwnProperty(k) &&
          _retractTimers[k] !== undefined && _retractTimers[k] !== null) n++;
    }
    return n;
  }

  // Get read-only category state (tests + save serialization).
  //
  // Phase 5: `expandedAtTs` surfaces the grace-window anchor so
  // harnesses can probe it without reaching into `_categories`.
  function getCategoryState(catId) {
    var cat = _categories[catId];
    if (!cat) return null;
    return {
      id:           cat.id,
      label:        cat.label,
      expanded:     !!cat.expanded,
      revealed:     !!cat.revealed,
      mostRecentId: cat.mostRecentId,
      order:        cat.order.slice(),
      expandedAtTs: cat.expandedAtTs || 0
    };
  }

  // Write a single relationships-category row. Creates the row if it's
  // new, updates favor/tier/animation flags otherwise, and moves the row
  // to mostRecentId. Kind is 'faction' (Phase 2) or 'npc' (Phase 4).
  //
  // DOC-109 Phase 4 — NPC rows carry a `meta` bag persisted on the row
  // (icon/name/factionId/floor) so the renderer doesn't have to re-query
  // NpcSystem on every tick. First-write fills all meta fields; later
  // writes merge non-null keys so the favor-change fast path can omit
  // meta entirely.
  //
  // `data.flair` routes explicit animation flags from the Game-layer
  // subscribers — the 'tier-cross' ReputationBar event passes
  // flair.tierCrossed=true even when prevTier===nextTier (defensive for
  // duplicate emits), and the 'favor-change' handler omits flair so the
  // row only bumps when favor actually increased.
  function _setRelationshipRow(kind, subjectId, data) {
    var cat = _categories.relationships;
    var rowId = _makeRowId(kind, subjectId);
    var existing = cat.rows[rowId];
    var now = (typeof Date !== 'undefined') ? Date.now() : 0;
    var flair = (data && data.flair) || null;

    if (!existing) {
      cat.rows[rowId] = {
        kind:             kind,
        subjectId:        subjectId,
        favor:            (data && typeof data.favor === 'number') ? data.favor : 0,
        tier:             (data && data.tier) || 'neutral',
        expanded:         true,  // back-compat with getFactionState
        justRevealed:     !!(data && data.justRevealed),
        justBumped:       false,
        justTierCrossed:  !!(flair && flair.tierCrossed),
        // Phase 4 — optional meta bag (npc rows use all keys; faction
        // rows can leave this null and fall through to FACTION_* tables).
        meta: (data && data.meta) ? {
          icon:      data.meta.icon      || null,
          name:      data.meta.name      || null,
          factionId: data.meta.factionId || null,
          floor:     data.meta.floor     || null
        } : null
      };
      cat.order.push(rowId);
    } else {
      var prevFavor = existing.favor;
      var prevTier  = existing.tier;
      if (data && typeof data.favor === 'number') existing.favor = data.favor;
      if (data && typeof data.tier === 'string')  existing.tier  = data.tier;
      if (existing.favor > prevFavor) existing.justBumped = true;
      if (existing.tier !== prevTier) existing.justTierCrossed = true;
      if (flair && flair.tierCrossed) existing.justTierCrossed = true;
      if (data && data.justRevealed)  existing.justRevealed = true;
      // Merge meta — only non-null keys overwrite. Lets fast-path
      // favor-change calls pass meta:null without clobbering the icon.
      if (data && data.meta) {
        if (!existing.meta) existing.meta = { icon: null, name: null, factionId: null, floor: null };
        if (data.meta.icon)      existing.meta.icon      = data.meta.icon;
        if (data.meta.name)      existing.meta.name      = data.meta.name;
        if (data.meta.factionId) existing.meta.factionId = data.meta.factionId;
        if (data.meta.floor)     existing.meta.floor     = data.meta.floor;
      }
    }

    cat.mostRecentId   = rowId;
    cat._lastUpdateAt  = now;
    return cat.rows[rowId];
  }

  // ── DOC-109 Phase 3 — Readiness row write/update ───────────────

  // Write a single readiness row (one per dungeon group). Creates the
  // row on first call, updates score + animation flags on subsequent
  // calls, bumps mostRecentId so the collapsed-state summary line
  // always shows whichever group just moved. `meta` is optional and
  // folds into the row — future callers can stash display overrides
  // (label/suit/tint) for ad-hoc groups that aren't in GROUP_DATA.
  function _setReadinessRow(groupId, coreScore, meta) {
    var cat = _categories.readiness;
    var rowId = _makeRowId('readiness', groupId);
    var existing = cat.rows[rowId];
    var now = (typeof Date !== 'undefined') ? Date.now() : 0;
    var score = +coreScore;
    if (!isFinite(score)) score = 0;

    if (!existing) {
      cat.rows[rowId] = {
        kind:             'readiness',
        subjectId:        groupId,
        score:            score,
        prevScore:        score,
        label:            (meta && meta.label) || null,
        suit:             (meta && meta.suit)  || null,
        tint:             (meta && meta.tint)  || null,
        justRevealed:     true,
        justBumped:       false
      };
      cat.order.push(rowId);
    } else {
      var prevScore = existing.score;
      existing.prevScore = prevScore;
      existing.score     = score;
      if (meta) {
        if (meta.label) existing.label = meta.label;
        if (meta.suit)  existing.suit  = meta.suit;
        if (meta.tint)  existing.tint  = meta.tint;
      }
      if (score > prevScore) existing.justBumped = true;
    }

    cat.mostRecentId  = rowId;
    cat._lastUpdateAt = now;
    return cat.rows[rowId];
  }

  // ── DOC-107 Phase 3 — faction-row helpers ──────────────────────

  // i18n lookup with fallback to FACTION_LABELS / TIER_LABELS.
  function _i18n(key, fallback) {
    if (typeof i18n !== 'undefined' && i18n && typeof i18n.t === 'function') {
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

  // ── DOC-109 Phase 3 — readiness row renderer ───────────────────
  // Mirrors _factionRow visual language: suit glyph (♠/♣/♦) in the
  // classic card-suit color + biome-tinted label + progress bar.
  // The bar fill clamps at 100% visually, but when the underlying
  // score exceeds 1.0 a ★ accent overlays the end of the bar to
  // match ReadinessCalc.getPercent()'s "142% ★" convention.
  function _readinessRow(groupId, rdata) {
    var meta = GROUP_DATA[groupId] || {};
    var label = rdata.label || meta.label ||
                _i18n('readiness.group.' + groupId + '.label', groupId.toUpperCase());
    var suit  = rdata.suit  || meta.suit  || '';
    var suitColor = SUIT_COLORS[suit] || '#888888';
    var tint  = rdata.tint  || meta.tint  || '#888888';

    var scoreNum = +rdata.score;
    if (!isFinite(scoreNum)) scoreNum = 0;
    var rawPct     = Math.round(scoreNum * 100);
    var fillPct    = Math.max(0, Math.min(100, rawPct));
    var overHealed = scoreNum > 1;
    var pctLabel   = overHealed ? (rawPct + '% \u2605') : (rawPct + '%');

    var classes = 'df-readiness-row';
    if (rdata.justRevealed) classes += ' df-readiness-reveal';
    if (rdata.justBumped)   classes += ' df-readiness-bump';
    if (overHealed)         classes += ' df-readiness-overhealed';
    rdata.justRevealed = false;
    rdata.justBumped   = false;

    var rowIdAttr   = ' id="df-rd-row-'   + groupId + '"';
    var nameIdAttr  = ' id="df-rd-name-'  + groupId + '"';
    var suitIdAttr  = ' id="df-rd-suit-'  + groupId + '"';
    var pctIdAttr   = ' id="df-rd-pct-'   + groupId + '"';
    var fillIdAttr  = ' id="df-rd-fill-'  + groupId + '"';
    var starIdAttr  = ' id="df-rd-star-'  + groupId + '"';

    var suitHtml = '';
    if (suit) {
      suitHtml = '<span class="df-readiness-suit"' + suitIdAttr +
        ' style="color:' + suitColor + '">' + _escape(suit) + '</span>';
    }
    var starHtml = overHealed
      ? '<span class="df-readiness-star"' + starIdAttr + ' aria-hidden="true">\u2605</span>'
      : '';

    return '<div class="' + classes + '"' + rowIdAttr + '>' +
      '<div class="df-readiness-head">' +
        suitHtml +
        '<span class="df-readiness-name"' + nameIdAttr + ' style="color:' + tint + '">' + _escape(label) + '</span>' +
        '<span class="df-readiness-pct"'  + pctIdAttr  + '>' + _escape(pctLabel) + '</span>' +
      '</div>' +
      '<div class="df-readiness-track">' +
        '<div class="df-readiness-fill"' + fillIdAttr + ' style="width:' + fillPct + '%;background:' + tint + '"></div>' +
        starHtml +
      '</div>' +
    '</div>';
  }

  // ── DOC-109 Phase 4 — NPC row renderer ────────────────────────────
  // Mirrors _factionRow visual language but keyed on per-NPC meta
  // (portrait glyph + display name + faction tint) instead of the
  // FACTION_* static tables. Meta is persisted on row.meta by
  // _setRelationshipRow from the Game-layer favor-change subscriber.
  //
  // The tier progress bar reuses _tierProgress() unchanged — NPC
  // reputation shares the same QuestTypes.REP_TIERS scale as factions.
  // Faction-tinted portrait + bar give the NPC row an "I belong to X"
  // visual cue without spelling out the faction name on every line.
  function _npcRow(npcId, ndata) {
    var meta      = ndata.meta || {};
    var name      = meta.name || npcId;
    var icon      = meta.icon || '\uD83D\uDC64'; // 👤 fallback
    var factionId = meta.factionId || null;
    var tint      = (factionId && FACTION_COLORS[factionId]) || '#9fbfd8';
    var tierId    = ndata.tier || 'neutral';
    var tierLabel = _i18n('rep.tier.' + tierId, TIER_LABELS[tierId] || tierId);
    var pct       = Math.round(_tierProgress(ndata.favor || 0, tierId) * 100);

    var classes = 'df-npc-row';
    if (ndata.justRevealed)    classes += ' df-npc-reveal';
    if (ndata.justBumped)      classes += ' df-npc-bump';
    if (ndata.justTierCrossed) classes += ' df-npc-tiercross';
    ndata.justRevealed    = false;
    ndata.justBumped      = false;
    ndata.justTierCrossed = false;

    var rowIdAttr  = ' id="df-npc-row-'  + npcId + '"';
    var iconIdAttr = ' id="df-npc-icon-' + npcId + '"';
    var nameIdAttr = ' id="df-npc-name-' + npcId + '"';
    var tierIdAttr = ' id="df-npc-tier-' + npcId + '"';
    var fillIdAttr = ' id="df-npc-fill-' + npcId + '"';

    return '<div class="' + classes + '"' + rowIdAttr + ' data-npc-id="' + _escape(npcId) + '">' +
      '<div class="df-npc-head">' +
        '<span class="df-npc-icon"' + iconIdAttr + '>' + _escape(icon) + '</span>' +
        '<span class="df-npc-name"' + nameIdAttr + ' style="color:' + tint + '">' + _escape(name) + '</span>' +
        '<span class="df-npc-tier"' + tierIdAttr + '>' + _escape(tierLabel) + '</span>' +
      '</div>' +
      '<div class="df-npc-track">' +
        '<div class="df-npc-fill"' + fillIdAttr + ' style="width:' + pct + '%;background:' + tint + '"></div>' +
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

  // ── DOC-109 Phase 4 — Relationship unified API (faction + NPC) ──

  // Public — push new favor + tier for any relationship subject
  // (kind='faction' or kind='npc'). This is the canonical entry point
  // for the Game-layer ReputationBar event subscribers:
  //
  //   ReputationBar.on('favor-change', (kind, id, prev, next) => {
  //     DebriefFeed.updateRelationship(kind, id, next, tierForFavor(next), meta);
  //   });
  //   ReputationBar.on('tier-cross', (kind, id, prevTier, nextTier) => {
  //     DebriefFeed.updateRelationship(kind, id, favor, nextTier, {...meta, tierCrossed: true});
  //   });
  //
  // `meta` is optional. For 'npc' kind, first-call meta should include
  // {icon, name, factionId, floor} so the row renders correctly; later
  // calls can omit meta (it's preserved row-side). If meta.tierCrossed
  // is truthy, the row's tier-cross animation flag fires even if the
  // tier id didn't change (defensive for the tier-cross event path).
  //
  // Does NOT auto-expand the relationships category — the dispatcher
  // cinematic migration (Phase 4 step 5) calls revealCategory+expandCategory
  // once on the first BPRD encounter. Subsequent updates refresh the row
  // in place; the category stays whatever state the player chose.
  //
  // Returns the row record for harness/test convenience, or null if
  // (kind, subjectId) is invalid.
  function updateRelationship(kind, subjectId, favor, tier, meta) {
    if (kind !== 'faction' && kind !== 'npc') return null;
    if (typeof subjectId !== 'string' || !subjectId) return null;

    var data = {
      favor: (typeof favor === 'number') ? favor : 0,
      tier:  tier || 'neutral'
    };
    if (meta) {
      // tierCrossed is a flair flag, not persistent meta — strip it out
      // into data.flair so _setRelationshipRow routes it correctly and
      // the row's meta bag stays clean.
      var metaCopy = {
        icon:      meta.icon      || null,
        name:      meta.name      || null,
        factionId: meta.factionId || null,
        floor:     meta.floor     || null
      };
      // Only attach meta if at least one field is populated — faction
      // rows pass meta purely for the tierCrossed flair, and we don't
      // want to wipe FACTION_* fallback rendering with all-null meta.
      if (metaCopy.icon || metaCopy.name || metaCopy.factionId || metaCopy.floor) {
        data.meta = metaCopy;
      }
      if (meta.tierCrossed) data.flair = { tierCrossed: true };
    }
    var row = _setRelationshipRow(kind, subjectId, data);
    _maybeScheduleRetract('relationships');  // Phase 5 — arm auto-retract if expanded past grace window
    if (_visible) render();
    return row;
  }

  // Public — read-only snapshot of a relationship row. Mirrors
  // getFactionState's shape but kind-generic, so the Phase 4 harness
  // can probe 'npc' rows the same way Phase 2 probes 'faction' rows.
  function getRelationshipState(kind, subjectId) {
    var cat = _categories.relationships;
    var rowId = _makeRowId(kind, subjectId);
    var r = cat.rows[rowId];
    if (!r) return null;
    return {
      kind:     r.kind,
      favor:    r.favor,
      tier:     r.tier,
      expanded: !!r.expanded,
      meta:     r.meta ? {
        icon:      r.meta.icon,
        name:      r.meta.name,
        factionId: r.meta.factionId,
        floor:     r.meta.floor
      } : null
    };
  }

  // ── DOC-109 Phase 3 — readiness public API ─────────────────────

  // Public — push an updated core readiness score for a dungeon group
  // row. Called from Game.init's subscription to
  // ReadinessCalc's 'group-score-change' event. First call auto-reveals
  // the readiness category (sticky reveal gate). `meta` is optional;
  // rows fall back to the GROUP_DATA table for label/suit/tint when
  // not supplied, so the standard ♠/♣/♦ groups render correctly with
  // just (groupId, coreScore).
  //
  // Returns the row record for test/debug convenience, or null if the
  // groupId is not a non-empty string.
  function updateReadiness(groupId, coreScore, meta) {
    if (typeof groupId !== 'string' || !groupId) return null;
    var row = _setReadinessRow(groupId, coreScore, meta);
    // Sticky reveal gate — first update anywhere in the category
    // flips the readiness wrapper visible. Subsequent updates are no-op.
    _categories.readiness.revealed = true;
    _maybeScheduleRetract('readiness');  // Phase 5 — arm auto-retract if expanded past grace window
    if (_visible) render();
    return row;
  }

  // Public — read-only snapshot of a readiness row. Mirrors
  // getFactionState's shape so harnesses can probe state without
  // reaching into the category internals.
  function getReadinessState(groupId) {
    var cat = _categories.readiness;
    var rowId = _makeRowId('readiness', groupId);
    var r = cat.rows[rowId];
    if (!r) return null;
    return {
      score:     r.score,
      prevScore: r.prevScore,
      label:     r.label || (GROUP_DATA[groupId] && GROUP_DATA[groupId].label) || null,
      suit:      r.suit  || (GROUP_DATA[groupId] && GROUP_DATA[groupId].suit)  || null,
      tint:      r.tint  || (GROUP_DATA[groupId] && GROUP_DATA[groupId].tint)  || null
    };
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

  // ── DOC-113 Phase C — Sprint timer row ──────────────────────────

  // i18n helper — falls back to the fallback string when i18n is
  // unavailable (Layer 0 unit tests, early boot). Mirrors the pattern
  // used by _factionRow/_renderCategoryRow.
  function _timerI18n(key, fallback, params) {
    if (typeof i18n !== 'undefined' && i18n && i18n.t) {
      try { return i18n.t(key, params); } catch (e) { /* fall through */ }
    }
    if (params && fallback) {
      var out = fallback;
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) {
          out = out.replace('{' + k + '}', params[k]);
        }
      }
      return out;
    }
    return fallback;
  }

  // Format milliseconds as mm:ss with a zero-padded seconds component.
  // Ceiling seconds so the display reads "1:00" until the tick that
  // crosses into the next second — matches the behaviour players expect
  // from rally-rally-style timers. Negative/NaN inputs render as '0:00'.
  function _formatMMSS(ms) {
    ms = +ms;
    if (!isFinite(ms) || ms <= 0) return '0:00';
    var totalSec = Math.ceil(ms / 1000);
    var mins = Math.floor(totalSec / 60);
    var secs = totalSec - mins * 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function _renderTimerRow(t) {
    if (!t) return '';
    var zone = t.zone || 'green';
    var pctClamped = Math.max(0, Math.min(1, +t.pct || 0));
    var fillPct = (zone === 'expired') ? 0 : (pctClamped * 100);
    var rowClasses = 'df-timer-row df-timer-zone-' + zone;
    if (zone === 'expired') rowClasses += ' df-timer-expired';
    if (t.paused) rowClasses += ' df-timer-paused';

    var html = '';
    html += '<div class="' + rowClasses + '" role="timer" aria-live="off">';
    html += '<div class="df-timer-head">';
    html += '<span class="df-timer-icon" aria-hidden="true">\u23F1</span>';

    if (zone === 'expired') {
      var heroName = t.heroName || _HERO_NAMES[t.heroArchetype] || 'The Hero';
      html += '<span class="df-timer-label">' + _escape(_timerI18n('quest.sprint.timer_expired', 'TIME\u2019S UP')) + '</span>';
      html += '<span class="df-timer-time" aria-hidden="true">0:00</span>';
      html += '</div>'; // close head
      html += '<div class="df-timer-track"><div class="df-timer-fill" style="width:0%"></div></div>';
      html += '<div class="df-timer-hero-msg">' +
              _escape(heroName + ' ' + _timerI18n('quest.sprint.hero_sentinel', 'blocks the exit')) +
              '</div>';
    } else {
      html += '<span class="df-timer-label">' + _escape(_timerI18n('quest.sprint.timer_label', 'TIME')) + '</span>';
      html += '<span class="df-timer-time">' + _formatMMSS(t.remainMs) + '</span>';
      html += '</div>'; // close head
      html += '<div class="df-timer-track">' +
                '<div class="df-timer-fill" style="width:' + fillPct.toFixed(2) + '%"></div>' +
              '</div>';
    }
    html += '</div>'; // close row
    return html;
  }

  // Public: reveal the timer row. Called by Game.init's subscription to
  // QuestChain's 'timer-start' event. Resets any prior timer state.
  function showTimer(questId, totalMs, heroArchetype) {
    if (typeof questId !== 'string' || !questId) return false;
    var total = +totalMs;
    if (!isFinite(total) || total <= 0) return false;
    var arche = (typeof heroArchetype === 'string' && heroArchetype) ? heroArchetype : 'seeker';
    _timerState = {
      questId:       questId,
      totalMs:       total,
      remainMs:      total,
      pct:           1,
      zone:          'green',
      paused:        false,
      heroArchetype: arche,
      heroName:      _HERO_NAMES[arche] || 'The Hero'
    };
    if (_visible) _renderUnified();
    return true;
  }

  // Public: update fill + zone from a 'timer-tick' / 'timer-expired'
  // event. Ignores updates when no timer is active (prevents spurious
  // stray ticks from repainting a hidden row). opts.paused is optional;
  // when omitted the existing paused state is preserved so the Game.init
  // subscriber doesn't need to re-read paused on every tick.
  function updateTimer(remainMs, pct, zone, opts) {
    if (!_timerState) return false;
    var rem = Math.max(0, +remainMs || 0);
    var pctNum = Math.max(0, Math.min(1, +pct));
    if (!isFinite(pctNum)) pctNum = (_timerState.totalMs > 0) ? (rem / _timerState.totalMs) : 0;
    var z = (zone === 'green' || zone === 'yellow' || zone === 'red' || zone === 'expired')
      ? zone
      : _timerState.zone;
    _timerState.remainMs = rem;
    _timerState.pct      = pctNum;
    _timerState.zone     = z;
    if (opts && typeof opts.paused === 'boolean') _timerState.paused = opts.paused;
    if (_visible) _renderUnified();
    return true;
  }

  // Public: tear down the timer row — called on 'timer-cancel' when
  // the player leaves the floor or completes the objective.
  function hideTimer() {
    if (!_timerState) return false;
    _timerState = null;
    if (_visible) _renderUnified();
    return true;
  }

  // Test/debug helper — exposed so the Node harness can read state
  // without poking at the private variable directly.
  function getTimerState() {
    if (!_timerState) return null;
    return {
      questId:       _timerState.questId,
      totalMs:       _timerState.totalMs,
      remainMs:      _timerState.remainMs,
      pct:           _timerState.pct,
      zone:          _timerState.zone,
      paused:        _timerState.paused,
      heroArchetype: _timerState.heroArchetype,
      heroName:      _timerState.heroName
    };
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

    // DOC-109 Phase 4 — Unified relationship API (faction + NPC)
    updateRelationship:   updateRelationship,
    getRelationshipState: getRelationshipState,

    // DOC-109 Phase 2 — Category wrapper
    revealCategory:   revealCategory,
    expandCategory:   expandCategory,
    collapseCategory: collapseCategory,
    toggleCategory:   toggleCategory,
    getCategoryState: getCategoryState,

    // DOC-109 Phase 5 — Auto-retract introspection (harness-only; no
    // production caller should depend on this. Returns count of pending
    // setTimeout handles either across all categories or scoped by catId.)
    _getPendingRetractCount: _getPendingRetractCount,

    // DOC-109 Phase 3 — Readiness rows
    updateReadiness:   updateReadiness,
    getReadinessState: getReadinessState,

    // DOC-113 Phase C — Sprint timer row
    showTimer:     showTimer,
    updateTimer:   updateTimer,
    hideTimer:     hideTimer,
    getTimerState: getTimerState,

    // Incinerator
    updateIncineratorBounds: _updateIncineratorBounds
  };
})();
// eof

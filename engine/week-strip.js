/**
 * WeekStrip — HUD day/cycle counter widget.
 *
 * Displays a 7-9 day strip with hero-day suit symbols, temporal styling,
 * and DungeonSchedule-aware stacking. Pure display — zero game-state mutation.
 *
 * Layer 2 — depends on: DayCycle, DungeonSchedule (typeof-guarded)
 */

var WeekStrip = (function() {
  'use strict';

  var _dayCounterEl = null;

  // ── Week-strip widget config ───────────────────────────────────
  // Day abbreviations — Monday-first to match DayCycle (Day 0 = Monday)
  var _WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Suit symbols for hero-day indicators (each dungeon gets a color+suit)
  // Legacy: used when DungeonSchedule is absent
  var _DUNGEON_SUITS = [
    { sym: '\u2660', color: '#8888ff' },  // ♠ spades — blue dungeon
    { sym: '\u2666', color: '#ff6666' },  // ♦ diamonds — red dungeon
    { sym: '\u2663', color: '#66cc66' }   // ♣ clubs — green dungeon
  ];

  // §9: Group-to-suit mapping for DungeonSchedule-driven display.
  // Each group gets a unique suit symbol + color for the week strip.
  var _GROUP_SUITS = {
    soft_cellar: { sym: '\u2660', color: '#8888ff', name: 'Soft Cellar'  },  // ♠ spades
    heros_wake:  { sym: '\u2666', color: '#ff6666', name: "Hero's Wake"  },  // ♦ diamonds
    heart:       { sym: '\u2665', color: '#ff5588', name: 'Heart'        }   // ♥ hearts
  };

  /**
   * Create the day counter DOM element — week-strip with day nodes.
   */
  function _initDayCounter() {
    _dayCounterEl = document.getElementById('hud-day-counter');
    if (!_dayCounterEl) {
      _dayCounterEl = document.createElement('div');
      _dayCounterEl.id = 'hud-day-counter';
      _dayCounterEl.style.cssText =
        'position:absolute;top:10px;right:308px;' +
        'font:bold 13px var(--font-data, monospace);color:#d4c8a0;' +
        'text-shadow:0 1px 3px rgba(0,0,0,0.8);' +
        'z-index:15;pointer-events:auto;' +
        'background:rgba(10,8,5,0.7);padding:4px 8px;' +
        'border:1px solid rgba(180,160,120,0.3);border-radius:4px;' +
        'display:flex;align-items:center;gap:2px;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_dayCounterEl);
    }

    // Inject keyframes + suit-stack hover styles (once)
    if (!document.getElementById('day-strip-style')) {
      var style = document.createElement('style');
      style.id = 'day-strip-style';
      style.textContent =
        '@keyframes day-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }\n' +
        // Suit stack: overlapping cascade (NCH joker pattern)
        '.ds-node { position:relative; display:inline-flex; align-items:center;' +
        '  justify-content:center; width:20px; height:22px; border-radius:3px;' +
        '  text-align:center; line-height:22px; vertical-align:top; }\n' +
        // Individual suit chip inside a stacked node
        '.ds-suit { position:absolute; transition: left 0.2s ease, top 0.15s ease;' +
        '  font-size:inherit; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.6)); }\n' +
        // Stack positions: diagonal cascade (like NCH joker offset)
        '.ds-suit.s-0 { left:0; top:0; }\n' +
        '.ds-suit.s-1 { left:5px; top:-1px; }\n' +
        '.ds-suit.s-2 { left:10px; top:0; }\n' +
        // Hover: fan out (more horizontal spread)
        '.ds-node:hover .ds-suit.s-0 { left:-2px; }\n' +
        '.ds-node:hover .ds-suit.s-1 { left:6px; }\n' +
        '.ds-node:hover .ds-suit.s-2 { left:14px; }\n' +
        // Stacked node gets wider to accommodate fanned suits
        '.ds-node.ds-stacked { width:22px; }\n' +
        '.ds-node.ds-stacked:hover { width:30px; }\n' +
        // Death-shifted suits: pulsing red border glow
        '.ds-suit.ds-shifted { animation:ds-shift-pulse 1.5s ease-in-out infinite; }\n' +
        '@keyframes ds-shift-pulse { 0%,100%{filter:drop-shadow(0 1px 1px rgba(0,0,0,0.6))}' +
        '  50%{filter:drop-shadow(0 0 4px rgba(255,80,60,0.7))} }\n' +
        // Resolved (past hero day): checkmark or X
        '.ds-suit.ds-resolved-pass::after { content:"\\2713"; position:absolute;' +
        '  bottom:-6px; right:-4px; font-size:7px; color:#66cc66; }\n' +
        '.ds-suit.ds-resolved-fail::after { content:"\\2717"; position:absolute;' +
        '  bottom:-6px; right:-4px; font-size:7px; color:#ff5555; }\n';
      document.head.appendChild(style);
    }

    _updateDayCounter();
  }

  /**
   * Build a map: dayNum → [{ sym, color, groupId, resolved, onSchedule, result }]
   * from DungeonSchedule contracts. Returns {} if DungeonSchedule absent.
   */
  function _buildHeroDayMap() {
    if (typeof DungeonSchedule === 'undefined' || !DungeonSchedule.getSchedule) return null;
    var schedule = DungeonSchedule.getSchedule();
    var map = {};
    for (var i = 0; i < schedule.length; i++) {
      var c = schedule[i];
      var suit = _GROUP_SUITS[c.groupId] || { sym: '\u2694', color: '#aaa', name: c.label };
      var dayKey = c.actualDay;
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push({
        sym:        suit.sym,
        color:      suit.color,
        groupId:    c.groupId,
        label:      suit.name || c.label,
        resolved:   c.resolved,
        onSchedule: c.onSchedule,
        result:     c.result,
        shifted:    c.actualDay !== c.scheduledDay,
        scheduledDay: c.scheduledDay
      });
    }
    return map;
  }

  /**
   * Update the week-strip widget — [M T ♠ T ♦ S S] style display.
   * Monday-first (Day 0 = Monday, matching DayCycle).
   *
   * §9 DungeonSchedule-aware: consults actual group schedule (including
   * death-shifted days) instead of legacy HERO_DAY_INTERVAL cycling.
   * When multiple groups converge on the same day (due to death-shift),
   * their suits stack with NCH joker-style cascade + hover fan-out.
   *
   * Visual states per node:
   *   Past:    dim text, no background — already lived through
   *   Today:   bold, bright, bobbing, lit background — "you are here"
   *   Future:  medium text, no background — days ahead
   *   Hero:    suit symbol(s) in suit color (stacked if convergent)
   *   Shifted: pulsing red glow on death-shifted suits
   *   Resolved: tiny ✓/✗ below resolved suits
   */
  function _updateDayCounter() {
    if (!_dayCounterEl) return;
    if (typeof DayCycle === 'undefined') return;

    var day = DayCycle.getDay();
    var weekDayIndex = day % 7;
    var timeStr = DayCycle.getTimeString ? DayCycle.getTimeString() : '06:00';
    var phase = DayCycle.getPhase ? DayCycle.getPhase() : 'morning';

    // Build hero day map from DungeonSchedule (or null if absent)
    var heroDayMap = _buildHeroDayMap();

    // Legacy fallback: use DayCycle HERO_DAY_INTERVAL when no DungeonSchedule
    var heroInterval = DayCycle.HERO_DAY_INTERVAL || 3;

    var html = '';

    // Build 8+ day strip — show days 0 through max(7, highest hero day)
    // For the 8-day jam arc we need at least days 0–8 visible.
    var stripLen = 7;
    if (heroDayMap) {
      // Extend strip to cover all scheduled hero days
      for (var key in heroDayMap) {
        if (heroDayMap.hasOwnProperty(key)) {
          var d = parseInt(key, 10);
          if (d >= stripLen) stripLen = d + 1;
        }
      }
    }
    // Cap at 9 to keep strip compact (days 0–8 for jam)
    if (stripLen > 9) stripLen = 9;

    for (var i = 0; i < stripLen; i++) {
      var dayNum = i; // absolute day number (0-indexed jam arc)
      var isToday = (dayNum === day);
      var isPast = (dayNum < day);

      // Check for hero groups on this day
      var suitEntries = heroDayMap ? (heroDayMap[dayNum] || []) : [];

      // Legacy fallback: single suit from DayCycle cycling
      if (!heroDayMap && dayNum >= 0 && dayNum % heroInterval === 0) {
        var legacyIdx = Math.floor(dayNum / heroInterval) % _DUNGEON_SUITS.length;
        suitEntries = [{
          sym: _DUNGEON_SUITS[legacyIdx].sym,
          color: _DUNGEON_SUITS[legacyIdx].color,
          label: 'Hero Day',
          resolved: false, onSchedule: true, shifted: false, result: null
        }];
      }

      var isHeroSlot = suitEntries.length > 0;
      var isStacked = suitEntries.length > 1;

      // Day label — abbreviated day-of-week name
      var dayOfWeekIdx = dayNum % 7;
      var label = _WEEK_DAYS[dayOfWeekIdx];

      // ── Style by temporal state ──
      var nodeColor, bg, fontSize, fontWeight, opacity, nodeAnim;

      if (isToday) {
        nodeColor = isHeroSlot ? '#f0c040' : '#ffe8a0';
        fontWeight = '900';
        fontSize = isHeroSlot ? '14px' : '13px';
        bg = 'rgba(255,255,255,0.15)';
        opacity = '1';
        nodeAnim = 'animation:day-bob 1.2s ease-in-out infinite;';
      } else if (isPast) {
        nodeColor = '#5a5040';
        fontWeight = '400';
        fontSize = '10px';
        bg = 'transparent';
        opacity = '0.5';
        nodeAnim = '';
      } else {
        nodeColor = '#8a8068';
        fontWeight = '500';
        fontSize = '11px';
        bg = 'transparent';
        opacity = '0.75';
        nodeAnim = '';
      }

      // ── Build node HTML ──
      if (isHeroSlot) {
        // Hero day node — suit symbols (possibly stacked)
        var stackClass = isStacked ? ' ds-stacked' : '';
        var titleParts = [];
        for (var si = 0; si < suitEntries.length; si++) {
          var se = suitEntries[si];
          titleParts.push(se.sym + ' ' + se.label +
            (se.shifted ? ' (SHIFTED from Day ' + (se.scheduledDay + 1) + ')' : '') +
            (se.resolved ? (se.result && se.result.coreScore >= 0.6 ? ' \u2713' : ' \u2717') : ''));
        }
        var titleStr = _WEEK_DAYS[dayOfWeekIdx] + ' \u2014 Day ' + (dayNum + 1) +
                       ' (HERO DAY)\n' + titleParts.join('\n') +
                       (isToday ? '\n[TODAY]' : '');

        html += '<span class="ds-node' + stackClass + '" style="' +
                'background:' + bg + ';' +
                'font-size:' + fontSize + ';font-weight:' + fontWeight + ';' +
                'opacity:' + opacity + ';' +
                nodeAnim + '" title="' + titleStr + '">';

        // Render each suit as an overlapping chip
        for (var sj = 0; sj < suitEntries.length; sj++) {
          var entry = suitEntries[sj];
          var suitColor;

          if (isToday) {
            suitColor = '#f0c040';  // gold for today's active suits
          } else if (isPast) {
            suitColor = entry.color;
          } else {
            suitColor = entry.color;
          }

          var suitOpacity = isPast ? '0.45' : (isToday ? '1' : '0.85');
          var extraClass = '';
          if (entry.shifted && !entry.resolved) extraClass += ' ds-shifted';
          if (entry.resolved && entry.result) {
            extraClass += entry.result.coreScore >= 0.6
              ? ' ds-resolved-pass' : ' ds-resolved-fail';
          }

          html += '<span class="ds-suit s-' + sj + extraClass + '" style="' +
                  'color:' + suitColor + ';opacity:' + suitOpacity + ';">' +
                  entry.sym + '</span>';
        }

        html += '</span>';

      } else {
        // Regular day node (no hero groups)
        html += '<span class="ds-node" style="' +
                'color:' + nodeColor + ';background:' + bg + ';' +
                'font-size:' + fontSize + ';font-weight:' + fontWeight + ';' +
                'opacity:' + opacity + ';' +
                nodeAnim + '" title="' +
                _WEEK_DAYS[dayOfWeekIdx] + ' \u2014 Day ' + (dayNum + 1) +
                (isToday ? ' [TODAY]' : '') + '">' +
                label + '</span>';
      }
    }

    // Phase-tinted separator dot
    var dotColor = (phase === 'night' || phase === 'dusk') ? '#6688aa' : '#a09880';

    // Time display
    html += '<span style="margin-left:4px;color:' + dotColor + ';font-size:10px">\u00B7</span>' +
            '<span style="margin-left:4px;font-size:12px;color:#a09880;' +
            'letter-spacing:0.05em;font-weight:600">' +
            timeStr + '</span>';

    // Combo indicator (when streak > 0)
    if (heroDayMap && typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getCombo) {
      var combo = DungeonSchedule.getCombo();
      if (combo.streak > 0) {
        var stars = '';
        for (var ci = 0; ci < combo.streak && ci < 3; ci++) stars += '\u2605';
        html += '<span style="margin-left:4px;font-size:10px;color:#f0c040;' +
                'filter:drop-shadow(0 0 2px rgba(240,192,64,0.5))" title="' +
                'Combo streak: ' + combo.streak + ' (' + combo.multiplier.toFixed(1) + '\u00D7)">' +
                stars + '</span>';
      }
    }

    _dayCounterEl.innerHTML = html;
  }

  return Object.freeze({
    init:   _initDayCounter,
    update: _updateDayCounter
  });
})();

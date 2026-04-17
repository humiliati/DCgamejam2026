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

  var FACTION_COLORS = {
    bprd:      '#B8395A',
    mss:       '#5F9EA0',
    pinkerton: '#B87333',
    jesuit:    '#6B5BA8'
  };
  var FACTION_LABELS = {
    bprd:      'The Necromancer',
    mss:       'Tide Council',
    pinkerton: 'Foundry Collective',
    jesuit:    'The Admiralty'
  };
  var FACTION_SUITS = {
    bprd:      '\u2665',
    mss:       '\u2660',
    pinkerton: '\u2666',
    jesuit:    '\u2663'
  };
  var SUIT_COLORS = {
    '\u2660': '#1A1A1A',
    '\u2663': '#1A1A1A',
    '\u2665': '#C8314A',
    '\u2666': '#C8314A'
  };
  var TIER_LABELS = {
    hated:      'Hated',
    unfriendly: 'Unfriendly',
    neutral:    'Neutral',
    friendly:   'Friendly',
    allied:     'Allied',
    exalted:    'Exalted'
  };

  var GROUP_DATA = {
    spade:   { label: 'Coral Cellars',  suit: '\u2660', tint: '#5F9EA0' },
    club:    { label: 'Hero\u2019s Wake', suit: '\u2663', tint: '#6B5BA8' },
    diamond: { label: 'Ironhold Depths', suit: '\u2666', tint: '#B87333' }
  };
  var GROUP_ORDER = ['spade', 'club', 'diamond'];

  var _categories = {
    readiness: {
      id:           'readiness',
      label:        'Readiness',
      rows:         {},
      order:        [],
      expanded:     false,
      revealed:     false,
      mostRecentId: null,
      _lastUpdateAt: 0,
      expandedAtTs: 0
    },
    relationships: {
      id:           'relationships',
      label:        'Relationships',
      rows:         {},
      order:        [],
      expanded:     false,
      revealed:     false,
      mostRecentId: null,
      _lastUpdateAt: 0,
      expandedAtTs: 0
    }
  };

  // Phase 5 — per-category pending retract timer handle.
  var _retractTimers = {};

  function _parseRowId(rowId) {
    if (typeof rowId !== 'string' || !rowId) return { kind: '', subjectId: '' };
    var colonAt = rowId.indexOf(':');
    if (colonAt < 0) return { kind: 'faction', subjectId: rowId };
    return { kind: rowId.slice(0, colonAt), subjectId: rowId.slice(colonAt + 1) };
  }
  function _makeRowId(kind, subjectId) { return kind + ':' + subjectId; }

  var _timerState = null;

  var _HERO_NAMES = {
    seeker:   'The Seeker',
    sentinel: 'The Sentinel',
    pursuer:  'The Pursuer',
    hunter:   'The Hunter'
  };

  var _mokEmoji     = '\uD83D\uDDE1\uFE0F';
  var _mokCallsign  = 'ROOK';
  var _mokClass     = 'Blade';
  var _mokExpression = 'idle';

  var ROLL_MS = 420;
  var _rollState = {};
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
    var row = document.getElementById('df-row-' + key);
    if (row) {
      row.classList.remove('df-drain-pulse');
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
    var pipsEl = document.getElementById('df-pips-' + key);
    if (pipsEl) {
      var n = Math.round(cur);
      var s = '';
      for (var i = 0; i < max; i++) s += (i < n) ? '\u25C8' : '\u25C7';
      pipsEl.textContent = s;
    }
  }

  function init() {
    _el        = document.getElementById('debrief-feed');
    _headerEl  = document.getElementById('df-header');
    _contentEl = document.getElementById('df-content');

    if (_el) {
      _el.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    _registerIncinerator();
  }

  function _registerIncinerator() {
    if (typeof DragDrop === 'undefined' || !_el) return;
    DragDrop.registerZone(INCINERATOR_ZONE, {
      x: 0, y: 0, w: 0, h: 0,
      accepts: function (payload) {
        if (!payload) return false;
        if (payload.type === 'card' || payload.type === 'item') {
          if (payload.data && payload.data.isKey) return false;
          return true;
        }
        return false;
      },
      onDrop: function (payload) { return _handleIncineratorDrop(payload); },
      onHover: function () { _incineratorActive = true; },
      onLeave: function () { _incineratorActive = false; }
    });
  }

  function _updateIncineratorBounds() {
    if (typeof DragDrop === 'undefined' || !_el) return;
    var rect = _el.getBoundingClientRect();
    var canvas = document.getElementById('view-canvas');
    var cRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    DragDrop.updateZone(INCINERATOR_ZONE, {
      x: rect.left - cRect.left,
      y: rect.top - cRect.top,
      w: rect.width,
      h: rect.height
    });
  }

  function _handleIncineratorDrop(payload) { return false; }

  function show() {
    _visible = true;
    if (_el) _el.style.display = 'flex';
    render();
    setTimeout(_updateIncineratorBounds, 50);
  }

  function hide() {
    _visible = false;
    if (_el) _el.style.display = 'none';
  }

  function isVisible() { return _visible; }

  function cycleMode() { _mode = (_mode + 1) % MODE_COUNT; render(); }
  function setMode(m) { _mode = Math.max(0, Math.min(MODE_COUNT - 1, m)); render(); }
  function getMode() { return _mode; }

  function render() {
    if (!_visible || !_contentEl || !_headerEl) return;
    var elW = _el ? _el.offsetWidth : 273;
    var _S = Math.max(0.72, elW / 273);
    if (_el) _el.style.fontSize = Math.max(12, Math.round(15 * _S)) + 'px';
    _headerEl.textContent = _escape(_mokCallsign);
    _renderUnified(_S);
  }

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

    var html = '';
    html += '<div class="df-avatar">';
    html += '<span class="df-emoji">' + _mokEmoji + '</span> ';
    html += '<span class="df-class">' + _escape(_mokClass) + '</span>';
    html += '</div>';

    if (_timerState) html += _renderTimerRow(_timerState);

    html += _renderCategoryRow(_categories.readiness);
    html += _renderCategoryRow(_categories.relationships);

    _contentEl.innerHTML = html;
  }

  function _renderCategoryRow(cat) {
    if (!cat || !cat.revealed) return '';
    var chevron   = cat.expanded ? '\u25BE' : '\u25B8';
    var chevCls   = 'df-cat-chevron' + (cat.expanded ? ' df-cat-chev-open' : '');
    var headId    = 'df-cat-head-' + cat.id;
    var bodyId    = 'df-cat-body-' + cat.id;
    var catCls    = 'df-category df-category-' + cat.id;
    if (cat.expanded) catCls += ' df-category-expanded';

    var head = '<div class="df-category-head" id="' + headId +
               '" data-cat-id="' + cat.id + '" onclick="DebriefFeed.toggleCategory(\'' +
               cat.id + '\')" role="button" tabindex="0">' +
                 '<span class="' + chevCls + '">' + chevron + '</span>' +
                 '<span class="df-cat-label">' + _escape(cat.label) + '</span>' +
               '</div>';

    var body = '';
    if (cat.expanded) {
      body = '<div class="df-category-body" id="' + bodyId + '">';
      for (var i = 0; i < cat.order.length; i++) {
        body += _renderRowByKind(cat, cat.order[i]);
      }
      body += '</div>';
    } else if (cat.mostRecentId && cat.rows[cat.mostRecentId]) {
      body = '<div class="df-cat-collapsed-row" id="' + bodyId + '">' +
               _renderRowByKind(cat, cat.mostRecentId) +
             '</div>';
    }

    return '<div class="' + catCls + '" data-cat-id="' + cat.id + '">' +
             head + body +
           '</div>';
  }

  function _renderRowByKind(cat, rowId) {
    var row = cat.rows[rowId];
    if (!row) return '';
    if (row.kind === 'faction')  return _factionRow(row.subjectId, row);
    if (row.kind === 'readiness') return _readinessRow(row.subjectId, row);
    if (row.kind === 'npc')       return _npcRow(row.subjectId, row);
    return '';
  }

  function revealCategory(catId) {
    var cat = _categories[catId];
    if (!cat) return false;
    cat.revealed = true;
    if (_visible) render();
    return true;
  }

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
    _cancelRetract(catId);
    if (_visible) render();
    return true;
  }

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

  // ── Phase 5 helpers ─────────────────────────────────────────────

  function _now() {
    return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
  }

  function _cancelRetract(catId) {
    var t = _retractTimers[catId];
    if (t === undefined || t === null) return;
    if (typeof clearTimeout === 'function') {
      try { clearTimeout(t); } catch (e) { /* noop */ }
    }
    delete _retractTimers[catId];
  }

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

  function _maybeScheduleRetract(catId) {
    var cat = _categories[catId];
    if (!cat || !cat.expanded) return;
    var since = _now() - (cat.expandedAtTs || 0);
    if (since < CATEGORY_MIN_EXPAND_WINDOW_MS) return;
    _scheduleRetract(catId);
  }

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
        expanded:         true,
        justRevealed:     !!(data && data.justRevealed),
        justBumped:       false,
        justTierCrossed:  !!(flair && flair.tierCrossed),
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

  function _i18n(key, fallback) {
    if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function _tierProgress(favor, tierId) {
    if (typeof QuestTypes === 'undefined' || !QuestTypes.REP_TIERS) return 0;
    var tiers = QuestTypes.REP_TIERS;
    var idx = -1;
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].id === tierId) { idx = i; break; }
    }
    if (idx < 0) return 0;
    var lo = tiers[idx].min;
    if (idx === tiers.length - 1) return 1;
    var hi = tiers[idx + 1].min;
    if (lo === -Infinity) return 0;
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

    var classes = 'df-faction-row';
    if (fdata.justRevealed)    classes += ' df-faction-reveal';
    if (fdata.justBumped)      classes += ' df-faction-bump';
    if (fdata.justTierCrossed) classes += ' df-faction-tiercross';
    fdata.justRevealed    = false;
    fdata.justBumped      = false;
    fdata.justTierCrossed = false;

    var rowId  = ' id="df-fac-row-'  + factionId + '"';
    return '<div class="' + classes + '"' + rowId + '>' +
      '<div class="df-faction-head">' +
        '<span class="df-faction-suit">' + _escape(suit) + '</span>' +
        '<span class="df-faction-name">' + _escape(name) + '</span>' +
        '<span class="df-faction-tier">' + _escape(tierLabel) + '</span>' +
      '</div>' +
      '<div class="df-faction-track">' +
        '<div class="df-faction-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '</div>' +
    '</div>';
  }

  function _readinessRow(groupId, rdata) {
    var meta = GROUP_DATA[groupId] || {};
    var label = rdata.label || meta.label || groupId.toUpperCase();
    var suit  = rdata.suit  || meta.suit  || '';
    var tint  = rdata.tint  || meta.tint  || '#888888';

    var scoreNum = +rdata.score;
    if (!isFinite(scoreNum)) scoreNum = 0;
    var rawPct     = Math.round(scoreNum * 100);
    var fillPct    = Math.max(0, Math.min(100, rawPct));

    var classes = 'df-readiness-row';
    if (rdata.justRevealed) classes += ' df-readiness-reveal';
    if (rdata.justBumped)   classes += ' df-readiness-bump';
    rdata.justRevealed = false;
    rdata.justBumped   = false;

    var rowIdAttr = ' id="df-rd-row-' + groupId + '"';
    return '<div class="' + classes + '"' + rowIdAttr + '>' +
      '<div class="df-readiness-head">' +
        '<span class="df-readiness-suit">' + _escape(suit) + '</span>' +
        '<span class="df-readiness-name">' + _escape(label) + '</span>' +
      '</div>' +
      '<div class="df-readiness-track">' +
        '<div class="df-readiness-fill" style="width:' + fillPct + '%;background:' + tint + '"></div>' +
      '</div>' +
    '</div>';
  }

  function _npcRow(npcId, ndata) {
    var meta      = ndata.meta || {};
    var name      = meta.name || npcId;
    var icon      = meta.icon || '\uD83D\uDC64';
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
    return '<div class="' + classes + '"' + rowIdAttr + '>' +
      '<div class="df-npc-head">' +
        '<span class="df-npc-icon">' + _escape(icon) + '</span>' +
        '<span class="df-npc-name">' + _escape(name) + '</span>' +
        '<span class="df-npc-tier">' + _escape(tierLabel) + '</span>' +
      '</div>' +
      '<div class="df-npc-track">' +
        '<div class="df-npc-fill" style="width:' + pct + '%;background:' + tint + '"></div>' +
      '</div>' +
    '</div>';
  }

  function expandFaction(factionId, opts) {
    if (typeof factionId !== 'string' || !factionId) return;
    var cat = _categories.relationships;
    var rowId = _makeRowId('faction', factionId);
    var existed = !!cat.rows[rowId];
    var animate = !opts || opts.animate !== false;
    _setRelationshipRow('faction', factionId, animate && !existed ? { justRevealed: true } : {});
    cat.revealed = true;
    cat.expanded = true;
    cat.rows[rowId].expanded = true;
    if (_visible) render();
  }

  function collapseFaction(factionId) {
    var cat = _categories.relationships;
    var rowId = _makeRowId('faction', factionId);
    if (!cat.rows[rowId]) return;
    cat.expanded = false;
    cat.rows[rowId].expanded = false;
    if (_visible) render();
  }

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

  function getFactionState(factionId) {
    var cat = _categories.relationships;
    var rowId = _makeRowId('faction', factionId);
    var r = cat.rows[rowId];
    if (!r) return null;
    return { favor: r.favor, tier: r.tier, expanded: !!r.expanded };
  }

  function updateRelationship(kind, subjectId, favor, tier, meta) {
    if (kind !== 'faction' && kind !== 'npc') return null;
    if (typeof subjectId !== 'string' || !subjectId) return null;

    var data = {
      favor: (typeof favor === 'number') ? favor : 0,
      tier:  tier || 'neutral'
    };
    if (meta) {
      var metaCopy = {
        icon:      meta.icon      || null,
        name:      meta.name      || null,
        factionId: meta.factionId || null,
        floor:     meta.floor     || null
      };
      if (metaCopy.icon || metaCopy.name || metaCopy.factionId || metaCopy.floor) {
        data.meta = metaCopy;
      }
      if (meta.tierCrossed) data.flair = { tierCrossed: true };
    }
    var row = _setRelationshipRow(kind, subjectId, data);
    _maybeScheduleRetract('relationships');
    if (_visible) render();
    return row;
  }

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

  function updateReadiness(groupId, coreScore, meta) {
    if (typeof groupId !== 'string' || !groupId) return null;
    var row = _setReadinessRow(groupId, coreScore, meta);
    _categories.readiness.revealed = true;
    _maybeScheduleRetract('readiness');
    if (_visible) render();
    return row;
  }

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

  function logEvent(text, type) {
    _feedLog.push({ text: text, type: type || '' });
    if (_feedLog.length > MAX_FEED_LINES) _feedLog.shift();
    if (_visible) render();
  }

  function clearFeed() { _feedLog.length = 0; }
  function setAvatar(emoji, callsign, className) {
    _mokEmoji = emoji || _mokEmoji;
    _mokCallsign = callsign || _mokCallsign;
    _mokClass = className || _mokClass;
  }
  function setExpression(expr) { _mokExpression = expr || 'idle'; }
  function refresh() { if (_visible) _renderUnified(); }

  function _escape(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _renderTimerRow(t) { return ''; }
  function showTimer() { return false; }
  function updateTimer() { return false; }
  function hideTimer() { return false; }
  function getTimerState() { return _timerState; }

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

    logEvent:      logEvent,
    clearFeed:     clearFeed,

    setAvatar:     setAvatar,
    setExpression: setExpression,

    expandFaction:   expandFaction,
    collapseFaction: collapseFaction,
    updateFaction:   updateFaction,
    getFactionState: getFactionState,

    updateRelationship:   updateRelationship,
    getRelationshipState: getRelationshipState,

    revealCategory:   revealCategory,
    expandCategory:   expandCategory,
    collapseCategory: collapseCategory,
    toggleCategory:   toggleCategory,
    getCategoryState: getCategoryState,

    _getPendingRetractCount: _getPendingRetractCount,

    updateReadiness:   updateReadiness,
    getReadinessState: getReadinessState,

    showTimer:     showTimer,
    updateTimer:   updateTimer,
    hideTimer:     hideTimer,
    getTimerState: getTimerState,

    updateIncineratorBounds: _updateIncineratorBounds
  };
})();
// eof

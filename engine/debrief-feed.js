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
  var RES_GLYPHS = { hp: '\u2665', energy: '\u25B3', battery: '\u25C8' };

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
  var _prevPool  = { hp: null, en: null, bat: null };
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

    // Smartwatch header: callsign only (time lives in weekly day counter)
    _headerEl.textContent = _escape(_mokCallsign);

    // Single unified page — avatar + gauges + stats
    _renderUnified();
  }

  // ── Unified smartwatch display ──────────────────────────────────

  function _renderUnified() {
    var p = (typeof Player !== 'undefined') ? Player.state() : {};
    var hp    = p.hp || 0;
    var maxHp = p.maxHp || 10;
    var en    = p.energy || 0;
    var maxEn = p.maxEnergy || 5;
    var bat   = (typeof p.battery === 'number') ? p.battery : 3;
    var maxBat = p.maxBattery || 5;
    var currency = p.currency || 0;

    // Detect drops vs last render → kick off reverse-fanfare tweens.
    // Only trigger on DECREASES; increases snap (matches pump pattern:
    // up-pumps are a separate fanfare reserved for HUD coin/score).
    if (_prevPool.hp  !== null && hp  < _prevPool.hp)  _startRoll('hp',  _prevPool.hp,  hp);
    if (_prevPool.en  !== null && en  < _prevPool.en)  _startRoll('en',  _prevPool.en,  en);
    if (_prevPool.bat !== null && bat < _prevPool.bat) _startRoll('bat', _prevPool.bat, bat);

    // Choose what value to paint: if a tween is active for this key,
    // compute its current lagged value so a mid-tween re-render doesn't
    // snap back to the start. Otherwise show the real value.
    var hpShown  = _laggedValue('hp',  hp);
    var enShown  = _laggedValue('en',  en);
    var batShown = _laggedValue('bat', bat);

    _prevPool.hp  = hp;
    _prevPool.en  = en;
    _prevPool.bat = bat;

    var html = '';

    // Compact avatar row (emoji + class)
    html += '<div class="df-avatar" style="padding:2px 0">';
    html += '<span class="df-emoji">' + _mokEmoji + '</span> ';
    html += '<span class="df-class">' + _escape(_mokClass) + '</span>';
    html += '</div>';

    // Full-width bars
    html += _fullBar('HP', hpShown, maxHp, '#FF6B9D', 'hp');
    html += _fullBar('EN', enShown, maxEn, '#00D4FF', 'en');
    html += _pipRow('BAT', batShown, maxBat, '#00FFA6', 'bat');

    // Currency + stats row (compact)
    html += '<div class="df-stat-row" style="margin-top:2px">\uD83D\uDCB0 <span>' + currency + 'g</span></div>';

    if (p.str !== undefined) {
      html += '<div class="df-stat-row" style="font-size:14px">';
      html += 'STR ' + (p.str || 0) + ' \u2502 ';
      html += 'DEX ' + (p.dex || 0) + ' \u2502 ';
      html += 'STL ' + (p.stealth || 0);
      html += '</div>';
    }

    // Buffs
    if (typeof StatusEffect !== 'undefined' && StatusEffect.getAll) {
      var effs = StatusEffect.getAll();
      if (effs && effs.length > 0) {
        html += '<div class="df-stat-row" style="font-size:14px;color:var(--phosphor-dim)">';
        for (var i = 0; i < effs.length; i++) {
          html += (effs[i].emoji || '\u25CF') + ' ';
        }
        html += '</div>';
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

  function _fullBar(label, cur, max, color, key) {
    max = (max > 0) ? max : 1;
    var shown = Math.round(cur);
    var pct = Math.max(0, Math.min(100, (cur / max) * 100));
    var rowId  = key ? ' id="df-row-'  + key + '"' : '';
    var numId  = key ? ' id="df-num-'  + key + '"' : '';
    var fillId = key ? ' id="df-fill-' + key + '"' : '';
    return '<div class="df-gauge-row"' + rowId + '>' +
      '<span class="df-label">' + label + '</span>' +
      '<span style="color:' + color + ';font-size:15px"' + numId + '>' + shown + '/' + max + '</span>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.08);height:6px;border-radius:3px;margin:2px 0 5px">' +
      '<div' + fillId + ' style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:3px;transition:width 0.3s"></div>' +
      '</div>';
  }

  function _pipRow(label, cur, max, color, key) {
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
      '<span' + pipsId + ' style="color:' + color + ';letter-spacing:2px;font-size:16px">' + pips + '</span>' +
      '</div>';
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
    // Re-render if currently in feed mode
    if (_mode === 2 && _visible) {
      _renderFeed();
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

    // Incinerator
    updateIncineratorBounds: _updateIncineratorBounds
  };
})();

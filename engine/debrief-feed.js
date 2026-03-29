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
  var MODE_COUNT    = 3;
  var MODE_NAMES    = ['MOK', 'SYSTEMS', '>FEED'];
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

  // MOK avatar state
  var _mokEmoji     = '\uD83D\uDDE1\uFE0F';  // 🗡️ default
  var _mokCallsign  = 'ROOK';
  var _mokClass     = 'Blade';
  var _mokExpression = 'idle'; // idle, hurt, happy, alert, dead

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    _el        = document.getElementById('debrief-feed');
    _headerEl  = document.getElementById('df-header');
    _contentEl = document.getElementById('df-content');

    if (_el) {
      _el.addEventListener('click', function (e) {
        e.stopPropagation();
        cycleMode();
      });
    }
  }

  // ── Show / Hide ─────────────────────────────────────────────────

  function show() {
    _visible = true;
    if (_el) _el.style.display = 'flex';
    render();
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

    _headerEl.textContent = MODE_NAMES[_mode] || '';

    if (_mode === 0) {
      _renderMOK();
    } else if (_mode === 1) {
      _renderResources();
    } else {
      _renderFeed();
    }
  }

  // ── MOK Avatar mode ─────────────────────────────────────────────

  function _renderMOK() {
    var p = (typeof Player !== 'undefined') ? Player.state() : {};
    var hp    = p.hp || 0;
    var maxHp = p.maxHp || 10;
    var en    = p.energy || 0;
    var maxEn = p.maxEnergy || 5;
    var bat   = (typeof p.battery === 'number') ? p.battery : 3;
    var maxBat = p.maxBattery || 5;
    var currency = p.currency || 0;

    var html = '';
    // Avatar
    html += '<div class="df-avatar">';
    html += '<span class="df-emoji">' + _mokEmoji + '</span>';
    html += '<span class="df-callsign">' + _escape(_mokCallsign) + '</span><br>';
    html += '<span class="df-class">' + _escape(_mokClass) + '</span>';
    html += '</div>';
    html += '<hr class="df-divider">';

    // Compact gauge rows (EyesOnly pip format)
    html += _gaugeRow('HP', hp, maxHp, '#FF6B9D', 8);
    html += _gaugeRow('EN', en, maxEn, '#00D4FF', 8);
    html += _gaugeRow('\u25C8', bat, maxBat, '#00FFA6', 5); // ◈
    html += '<hr class="df-divider">';

    // Currency
    html += '<div class="df-stat-row">\uD83D\uDCB0 <span>' + currency + 'g</span></div>';

    // Stats (if available)
    if (p.str !== undefined) {
      html += '<hr class="df-divider">';
      html += '<div class="df-stat-row">STR <span>' + (p.str || 0) + '</span></div>';
      html += '<div class="df-stat-row">DEX <span>' + (p.dex || 0) + '</span></div>';
      html += '<div class="df-stat-row">STL <span>' + (p.stealth || 0) + '</span></div>';
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

  // ── Resources mode ──────────────────────────────────────────────

  function _renderResources() {
    var p = (typeof Player !== 'undefined') ? Player.state() : {};
    var hp    = p.hp || 0;
    var maxHp = p.maxHp || 10;
    var en    = p.energy || 0;
    var maxEn = p.maxEnergy || 5;
    var bat   = (typeof p.battery === 'number') ? p.battery : 3;
    var maxBat = p.maxBattery || 5;
    var currency = p.currency || 0;
    var bagCount = (typeof Player !== 'undefined' && Player.getBag) ? Player.getBag().length : 0;
    var maxBag = (typeof Player !== 'undefined' && Player.MAX_BAG) ? Player.MAX_BAG : 12;

    var html = '<div style="font-size:8px;color:var(--phosphor-dim);letter-spacing:0.1em;margin-bottom:4px">SYSTEMS</div>';

    // Full-width bars with numeric readout
    html += _fullBar('HP', hp, maxHp, '#FF6B9D');
    html += _fullBar('EN', en, maxEn, '#00D4FF');
    html += _pipRow('BAT', bat, maxBat, '#00FFA6');
    html += '<hr class="df-divider">';

    // Currency + bag
    html += '<div class="df-stat-row">\uD83D\uDCB0 <span>' + currency + 'g</span></div>';
    html += '<div class="df-stat-row">\uD83C\uDF92 <span>' + bagCount + '/' + maxBag + '</span></div>';
    html += '<hr class="df-divider">';

    // Buffs placeholder
    html += '<div class="df-stat-row" style="color:var(--phosphor-dim)">BUFFS</div>';
    html += '<div class="df-stat-row" style="opacity:0.4">[none]</div>';

    _contentEl.innerHTML = html;
  }

  function _fullBar(label, cur, max, color) {
    max = (max > 0) ? max : 1;
    var pct = Math.max(0, Math.min(100, (cur / max) * 100));
    return '<div class="df-gauge-row">' +
      '<span class="df-label">' + label + '</span>' +
      '<span style="color:' + color + ';font-size:9px">' + cur + '/' + max + '</span>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.06);height:4px;border-radius:2px;margin:1px 0 3px">' +
      '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:2px;transition:width 0.3s"></div>' +
      '</div>';
  }

  function _pipRow(label, cur, max, color) {
    max = (max > 0) ? max : 1;
    var pips = '';
    for (var i = 0; i < max; i++) {
      pips += (i < cur) ? '\u25C8' : '\u25C7'; // ◈ vs ◇
    }
    return '<div class="df-gauge-row">' +
      '<span class="df-label">' + label + '</span>' +
      '<span style="color:' + color + ';letter-spacing:1px">' + pips + '</span>' +
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
    // Cursor blink at bottom
    html += '<div class="df-feed-line df-cursor-blink" style="color:var(--phosphor)">\u258C</div>';

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
    if (_mode === 0 && _visible) _renderMOK();
  }

  function setExpression(expr) {
    _mokExpression = expr || 'idle';
    // Future: expression affects avatar emoji/animation
  }

  // ── Refresh (called from game loop when player state changes) ──

  function refresh() {
    if (!_visible) return;
    if (_mode === 0) _renderMOK();
    else if (_mode === 1) _renderResources();
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
    setExpression: setExpression
  };
})();

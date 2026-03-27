/**
 * VictoryScreen — win overlay with stats and return-to-title.
 *
 * Layer 2 (depends on i18n, Player, ScreenManager). Placeholder —
 * narrative payoff text is jam-scope content. This is just the
 * plumbing for displaying it.
 */
var VictoryScreen = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _active = false;
  var _fadeIn = 0;
  var _stats = null;

  var _keyHandler = null;
  var _clickHandler = null;

  // ── Input ─────────────────────────────────────────────────────────

  function _bindInput() {
    _keyHandler = function (e) {
      if (!_active || _fadeIn < 0.8) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _finish();
      }
    };
    _clickHandler = function () {
      if (!_active || _fadeIn < 0.8) return;
      _finish();
    };
    window.addEventListener('keydown', _keyHandler);
    _canvas.addEventListener('click', _clickHandler);
  }

  function _unbindInput() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    if (_clickHandler) _canvas.removeEventListener('click', _clickHandler);
    _keyHandler = null;
    _clickHandler = null;
  }

  function _finish() {
    _active = false;
    _unbindInput();
    ScreenManager.returnToTitle();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
  }

  function start(stats) {
    _active = true;
    _fadeIn = 0;
    _stats = stats || {};
    _bindInput();
  }

  function stop() {
    _active = false;
    _unbindInput();
  }

  function isActive() { return _active; }

  // ── Update ────────────────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;
    if (_fadeIn < 1) {
      _fadeIn = Math.min(1, _fadeIn + dt / 1000);
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    if (!_active || !_ctx) return;

    var w = _canvas.width;
    var h = _canvas.height;

    // Gold-tinted overlay
    _ctx.globalAlpha = _fadeIn * 0.8;
    _ctx.fillStyle = '#0a0800';
    _ctx.fillRect(0, 0, w, h);
    _ctx.globalAlpha = _fadeIn;

    var cx = w / 2;

    // Victory header
    _ctx.fillStyle = '#da4';
    _ctx.font = 'bold 28px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('victory.header', 'VICTORY'), cx, h * 0.18);

    // Trophy
    _ctx.font = '40px serif';
    _ctx.fillText('🏆', cx, h * 0.28);

    // Narrative placeholder
    _ctx.fillStyle = '#aa8';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.fillText(i18n.t('victory.narrative', '[Narrative payoff — jam content]'), cx, h * 0.38);

    // Stats
    var statsY = h * 0.48;
    var statLines = [
      [i18n.t('victory.floors', 'Floors explored'), _stats.floorsExplored || 0],
      [i18n.t('victory.enemies', 'Enemies defeated'), _stats.enemiesDefeated || 0],
      [i18n.t('victory.cards', 'Cards played'), _stats.cardsPlayed || 0],
      [i18n.t('victory.damage_dealt', 'Damage dealt'), _stats.damageDealt || 0],
      [i18n.t('victory.time', 'Time'), _formatTime(_stats.timeElapsed || 0)]
    ];

    _ctx.font = '12px "Courier New", monospace';
    for (var i = 0; i < statLines.length; i++) {
      var sy = statsY + i * 20;
      _ctx.fillStyle = '#888';
      _ctx.textAlign = 'right';
      _ctx.fillText(statLines[i][0], cx - 10, sy);
      _ctx.fillStyle = '#ddd';
      _ctx.textAlign = 'left';
      _ctx.fillText(String(statLines[i][1]), cx + 10, sy);
    }

    // Return prompt
    if (_fadeIn >= 0.8) {
      var blink = Math.sin(performance.now() / 400) * 0.3 + 0.7;
      _ctx.globalAlpha = blink;
      _ctx.fillStyle = '#aa8';
      _ctx.font = '14px "Courier New", monospace';
      _ctx.textAlign = 'center';
      _ctx.fillText(i18n.t('victory.continue', 'Press Enter to continue'), cx, h * 0.82);
    }

    _ctx.globalAlpha = 1;
  }

  function _formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  return {
    init: init,
    start: start,
    stop: stop,
    isActive: isActive,
    update: update,
    render: render
  };
})();

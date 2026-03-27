/**
 * SplashScreen — simple logo/title canvas overlay.
 *
 * Layer 2. Renders the jam/studio logo on the main canvas, then
 * auto-advances to the title screen after a short delay. Click or
 * keypress skips immediately. Not part of the rotating box menu —
 * this is a flat full-viewport draw.
 */
var SplashScreen = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _timer = 0;
  var _active = false;
  var _fadeOut = 0;       // 0–1 fade-out progress
  var _fading = false;

  var DISPLAY_TIME = 1500;   // ms before auto-advance
  var FADE_TIME = 400;       // ms fade-out duration

  // ── Init ──────────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
  }

  function start() {
    _active = true;
    _timer = 0;
    _fadeOut = 0;
    _fading = false;

    // Skip on any interaction
    var _skipHandler = function () {
      _beginFadeOut();
      window.removeEventListener('click', _skipHandler);
      window.removeEventListener('keydown', _skipHandler);
    };
    window.addEventListener('click', _skipHandler);
    window.addEventListener('keydown', _skipHandler);
  }

  function isActive() { return _active; }

  // ── Update ────────────────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;

    if (_fading) {
      _fadeOut += dt / FADE_TIME;
      if (_fadeOut >= 1) {
        _fadeOut = 1;
        _active = false;
        ScreenManager.toTitle();
      }
      return;
    }

    _timer += dt;
    if (_timer >= DISPLAY_TIME) {
      _beginFadeOut();
    }
  }

  function _beginFadeOut() {
    if (_fading) return;
    _fading = true;
    _fadeOut = 0;
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    if (!_active || !_ctx) return;

    var w = _canvas.width;
    var h = _canvas.height;

    // Black background
    _ctx.fillStyle = '#000';
    _ctx.fillRect(0, 0, w, h);

    // Global alpha for fade-out
    var alpha = 1 - _fadeOut;
    _ctx.globalAlpha = alpha;

    // Studio / jam branding (placeholder)
    _ctx.fillStyle = '#666';
    _ctx.font = '14px "Courier New", monospace';
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(i18n.t('splash.studio', 'PLACEHOLDER STUDIO'), w / 2, h / 2 - 40);

    // Game title
    _ctx.fillStyle = '#ddd';
    _ctx.font = 'bold 28px "Courier New", monospace';
    _ctx.fillText(i18n.t('splash.title', 'PLACEHOLDER TITLE'), w / 2, h / 2);

    // Jam badge
    _ctx.fillStyle = '#555';
    _ctx.font = '12px "Courier New", monospace';
    _ctx.fillText(i18n.t('splash.jam', 'DC Jam 2026'), w / 2, h / 2 + 36);

    // Subtle prompt
    if (!_fading && _timer > 500) {
      var blink = Math.sin(_timer / 300) * 0.3 + 0.5;
      _ctx.globalAlpha = alpha * blink;
      _ctx.fillStyle = '#888';
      _ctx.font = '11px "Courier New", monospace';
      _ctx.fillText(i18n.t('splash.skip', 'Press any key'), w / 2, h - 40);
    }

    _ctx.globalAlpha = 1;
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    init: init,
    start: start,
    isActive: isActive,
    update: update,
    render: render
  };
})();

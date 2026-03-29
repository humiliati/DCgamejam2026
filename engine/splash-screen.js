/**
 * SplashScreen — DOM-driven 3D box splash with click-to-envelop.
 *
 * Layer 2 (depends on BoxAnim, ScreenManager, i18n).
 *
 * Shows a CSS 3D rotating box (via the modular BoxAnim system) with
 * the game title on a full-viewport DOM overlay (#splash-overlay).
 *
 * Interaction flow:
 *   1. Box spins with lid open face visible. Title text fades in.
 *   2. On hover — lid swings open, interior glow brightens.
 *   3. On click (or any key) — BoxAnim.envelop() fires: the interior
 *      glow expands to fill the screen, the overlay background shifts
 *      to a radial gradient, then after ~1s the overlay fades out and
 *      ScreenManager transitions to TITLE.
 *
 * The canvas still renders a solid dark background behind the overlay
 * to prevent flicker.
 */
var SplashScreen = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _active = false;
  var _enveloping = false;     // glow envelop in progress
  var _fadeOut = false;         // final overlay fade after envelop
  var _fadeTimer = 0;
  var _minDisplayTimer = 0;    // enforce minimum display before interaction

  var MIN_DISPLAY = 800;       // ms before click/key is accepted
  var FADE_TIME = 500;         // ms final overlay fade

  // DOM overlay references
  var _overlay = null;
  var _titleEl = null;
  var _subtitleEl = null;
  var _promptEl = null;

  var _keyHandler = null;
  var _boxClickHandler = null;
  var _splashBoxEl = null;

  // ── Init ──────────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');

    _overlay = document.getElementById('splash-overlay');
    _titleEl = document.getElementById('splash-title-text');
    _subtitleEl = document.getElementById('splash-subtitle-text');
    _promptEl = document.getElementById('splash-prompt-text');
    _splashBoxEl = document.getElementById('splash-box');

    // Register the splash box with BoxAnim
    if (typeof BoxAnim !== 'undefined') BoxAnim.register('splash-box');
  }

  function _unbindAll() {
    if (_keyHandler) {
      window.removeEventListener('keydown', _keyHandler);
      _keyHandler = null;
    }
    if (_boxClickHandler && _splashBoxEl) {
      _splashBoxEl.removeEventListener('click', _boxClickHandler);
      _boxClickHandler = null;
    }
  }

  function start() {
    _active = true;
    _enveloping = false;
    _fadeOut = false;
    _fadeTimer = 0;
    _minDisplayTimer = 0;

    // Apply i18n strings
    if (_titleEl) _titleEl.textContent = i18n.t('splash.title', 'DUNGEON GLEANER');
    if (_subtitleEl) _subtitleEl.textContent = i18n.t('splash.jam', 'DC JAM 2026');
    if (_promptEl) _promptEl.textContent = i18n.t('splash.skip', 'PRESS ANY KEY');

    // Show overlay (remove any stale state classes)
    if (_overlay) {
      _overlay.classList.remove('hidden', 'fade-out', 'envelop-bg');
    }

    // Reset box state
    if (typeof BoxAnim !== 'undefined') BoxAnim.close('splash-box');

    // ── Separate handlers: click on BOX ONLY, keydown on window ──
    // This lets the user hover in/out to open/close the lid freely
    // without accidentally triggering the envelop transition.

    _keyHandler = function (e) {
      if (_minDisplayTimer < MIN_DISPLAY) return;
      _triggerEnvelop();
      _unbindAll();
    };

    _boxClickHandler = function (e) {
      e.stopPropagation(); // don't bubble to window
      if (_minDisplayTimer < MIN_DISPLAY) return;
      _triggerEnvelop();
      _unbindAll();
    };

    window.addEventListener('keydown', _keyHandler);
    if (_splashBoxEl) {
      _splashBoxEl.addEventListener('click', _boxClickHandler);
    }
  }

  function isActive() { return _active; }

  // ── Envelop trigger ───────────────────────────────────────────────

  function _triggerEnvelop() {
    if (_enveloping) return;
    _enveloping = true;

    if (typeof BoxAnim !== 'undefined') {
      BoxAnim.envelop('splash-box', function () {
        // Glow has filled the screen — now fade out the overlay
        _fadeOut = true;
        _fadeTimer = 0;
      });
    } else {
      // Fallback: go straight to fade
      _fadeOut = true;
      _fadeTimer = 0;
    }
  }

  // ── Update ────────────────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;

    _minDisplayTimer += dt;

    if (_fadeOut) {
      _fadeTimer += dt;
      // Apply CSS fade-out
      if (_overlay && !_overlay.classList.contains('fade-out')) {
        _overlay.classList.add('fade-out');
      }
      if (_fadeTimer >= FADE_TIME) {
        _active = false;
        if (_overlay) _overlay.classList.add('hidden');
        _unbindAll();
        ScreenManager.toTitle();
      }
      return;
    }

    // Auto-trigger envelop after a generous display period
    // (player can skip earlier by clicking)
    if (!_enveloping && _minDisplayTimer >= 4000) {
      _triggerEnvelop();
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    if (!_active || !_ctx) return;

    var w = _canvas.width;
    var h = _canvas.height;

    // Canvas draws matching dark background behind the DOM overlay
    _ctx.fillStyle = '#080812';
    _ctx.fillRect(0, 0, w, h);
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

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
  var _secretEl = null;

  var _keyHandler = null;
  var _boxClickHandler = null;
  var _splashBoxEl = null;

  // ── Easter egg state ─────────────────────────────────────────────
  var _eeClicks = 0;           // rapid-click counter
  var _eeClickTimer = 0;       // decay timer (resets on click)
  var _eeHoldStart = 0;        // pointerdown timestamp for hold detection
  var _eeHoldRevealed = false;  // secret text currently showing
  var _eePointerDown = false;
  var EE_HOLD_MS = 1500;       // hold duration to reveal secret
  var EE_CLICK_DECAY = 800;    // ms before click counter decays

  // ── Init ──────────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');

    _overlay = document.getElementById('splash-overlay');
    _titleEl = document.getElementById('splash-title-text');
    _subtitleEl = document.getElementById('splash-subtitle-text');
    _promptEl = document.getElementById('splash-prompt-text');
    _secretEl = document.getElementById('splash-secret-text');
    _splashBoxEl = document.getElementById('splash-box');

    // Register the splash box with BoxAnim
    if (typeof BoxAnim !== 'undefined') BoxAnim.register('splash-box');
  }

  var _pointerDownHandler = null;
  var _pointerUpHandler = null;

  function _unbindAll() {
    if (_keyHandler) {
      window.removeEventListener('keydown', _keyHandler);
      _keyHandler = null;
    }
    if (_boxClickHandler && _splashBoxEl) {
      _splashBoxEl.removeEventListener('click', _boxClickHandler);
      _boxClickHandler = null;
    }
    if (_pointerDownHandler && _splashBoxEl) {
      _splashBoxEl.removeEventListener('pointerdown', _pointerDownHandler);
      _pointerDownHandler = null;
    }
    if (_pointerUpHandler) {
      window.removeEventListener('pointerup', _pointerUpHandler);
      _pointerUpHandler = null;
    }
  }

  // ── Easter egg helpers ───────────────────────────────────────────

  function _eeRegisterClick() {
    _eeClicks++;
    _eeClickTimer = 0;

    // Color shift thresholds
    if (_splashBoxEl) {
      _splashBoxEl.classList.remove('ee-warm', 'ee-hot', 'ee-fire', 'ee-sparkle');
      if (_eeClicks >= 10) {
        _splashBoxEl.classList.add('ee-fire');
        _splashBoxEl.classList.add('ee-sparkle');
      } else if (_eeClicks >= 6) {
        _splashBoxEl.classList.add('ee-hot');
      } else if (_eeClicks >= 3) {
        _splashBoxEl.classList.add('ee-warm');
      }
    }
  }

  function _eeDecayClicks(dt) {
    if (_eeClicks <= 0) return;
    _eeClickTimer += dt;
    if (_eeClickTimer >= EE_CLICK_DECAY) {
      _eeClicks = Math.max(0, _eeClicks - 1);
      _eeClickTimer = 0;
      // Update visuals on decay
      if (_splashBoxEl) {
        _splashBoxEl.classList.remove('ee-warm', 'ee-hot', 'ee-fire', 'ee-sparkle');
        if (_eeClicks >= 10) {
          _splashBoxEl.classList.add('ee-fire');
        } else if (_eeClicks >= 6) {
          _splashBoxEl.classList.add('ee-hot');
        } else if (_eeClicks >= 3) {
          _splashBoxEl.classList.add('ee-warm');
        }
      }
    }
  }

  function _eeCheckHold(dt) {
    if (!_eePointerDown) {
      if (_eeHoldRevealed && _secretEl) {
        _secretEl.classList.remove('visible');
        _eeHoldRevealed = false;
      }
      return;
    }
    var elapsed = Date.now() - _eeHoldStart;
    if (elapsed >= EE_HOLD_MS && !_eeHoldRevealed) {
      _eeHoldRevealed = true;
      if (_secretEl) _secretEl.classList.add('visible');
    }
  }

  function start() {
    _active = true;
    _enveloping = false;
    _fadeOut = false;
    _fadeTimer = 0;
    _minDisplayTimer = 0;
    _eeClicks = 0;
    _eeClickTimer = 0;
    _eeHoldRevealed = false;
    _eePointerDown = false;

    // Apply i18n strings
    if (_titleEl) _titleEl.textContent = i18n.t('splash.title', 'DUNGEON GLEANER');
    if (_subtitleEl) _subtitleEl.textContent = i18n.t('splash.jam', 'DC JAM 2026');
    if (_promptEl) _promptEl.textContent = i18n.t('splash.skip', 'PRESS ANY KEY');

    // Reset secret text
    if (_secretEl) _secretEl.classList.remove('visible');

    // Show overlay (remove any stale state classes)
    if (_overlay) {
      _overlay.classList.remove('hidden', 'fade-out', 'envelop-bg');
    }

    // Reset box state + easter egg classes
    if (typeof BoxAnim !== 'undefined') BoxAnim.close('splash-box');
    if (_splashBoxEl) {
      _splashBoxEl.classList.remove('ee-warm', 'ee-hot', 'ee-fire', 'ee-sparkle');
    }

    // ── Separate handlers: click on BOX ONLY, keydown on window ──

    _keyHandler = function (e) {
      if (_minDisplayTimer < MIN_DISPLAY) return;
      _triggerEnvelop();
      _unbindAll();
    };

    _boxClickHandler = function (e) {
      e.stopPropagation();
      if (_minDisplayTimer < MIN_DISPLAY) return;
      _eeRegisterClick();
      // Only envelop on double-click or after sufficient display
      // Single clicks build the easter egg; key press or auto-timeout advances
      if (_eeClicks >= 2 && _eeClicks < 3) {
        // Second click: advance normally
        _triggerEnvelop();
        _unbindAll();
      }
      // Rapid clicks (3+) build easter egg instead of advancing
    };

    // Hold detection for secret reveal
    _pointerDownHandler = function (e) {
      _eePointerDown = true;
      _eeHoldStart = Date.now();
    };

    _pointerUpHandler = function (e) {
      _eePointerDown = false;
    };

    window.addEventListener('keydown', _keyHandler);
    if (_splashBoxEl) {
      _splashBoxEl.addEventListener('click', _boxClickHandler);
      _splashBoxEl.addEventListener('pointerdown', _pointerDownHandler);
    }
    window.addEventListener('pointerup', _pointerUpHandler);
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

    // Easter egg tick
    _eeDecayClicks(dt);
    _eeCheckHold(dt);

    // Auto-trigger envelop after a generous display period
    // (player can skip earlier by clicking or pressing any key)
    if (!_enveloping && _minDisplayTimer >= 5000) {
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

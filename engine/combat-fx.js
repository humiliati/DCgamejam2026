/**
 * CombatFX — viewport and HUD feedback for combat actions.
 *
 * Three effects driven from CombatBridge.playCard():
 *
 *   1. Enemy lunge — viewport zooms IN quickly (enemy attacks), then
 *      gradually retreats to neutral. Ported from EyesOnly STR lunge.
 *
 *   2. Player attack pulse — viewport zooms OUT slightly then snaps
 *      back, giving a "push forward" feel when the player strikes.
 *
 *   3. HUD frame flash — viewport border flashes in the resource
 *      color corresponding to what changed (HP lost = pink, healed =
 *      green/battery, etc). Colors from EyesOnly RESOURCE_COLOR_SYSTEM.
 *
 * All effects are canvas-level (ctx.save/scale/restore) or DOM-level
 * (viewport border-color transition). No new DOM elements required.
 *
 * Layer 2 (after CombatEngine, before Raycaster render)
 * Depends on: nothing (standalone timer-driven FX)
 */
var CombatFX = (function () {
  'use strict';

  // ── Resource colors (EyesOnly RESOURCE_COLOR_SYSTEM.md) ──────────
  var COLORS = {
    hp:       '#FF6B9D',   // Vibrant Pink — damage taken
    energy:   '#00D4FF',   // Electric Blue — energy spent
    heal:     '#00FFA6',   // Battery Green — HP restored
    currency: '#FFFF00',   // Gold — currency gained
    card:     '#800080',   // Purple — card played
    ammo:     '#DA70D6',   // Magenta — ammo used
    neutral:  '#c0d0e0'    // Soft grey-blue — default flash
  };

  // ── Per-enemy-type resolution timing (STR-HUD-DESIGNER-ROADMAP) ──
  // Each key maps to timing overrides. Missing keys inherit from _default.
  var RESOLUTION_TIMING = {
    _default: { slideAwayMs: 300, lungeMs: 500, lungeStaggerMs: 100, impactPauseMs: 500, slideBackMs: 300, lungeZoom: 1.06, pulseDuration: 300 },
    standard: { /* inherits _default */ },
    elite:    { lungeMs: 600, impactPauseMs: 650, lungeZoom: 1.08 },
    boss:     { slideAwayMs: 400, lungeMs: 750, lungeStaggerMs: 200, impactPauseMs: 800, slideBackMs: 400, lungeZoom: 1.12 },
    quick:    { slideAwayMs: 200, lungeMs: 350, lungeStaggerMs: 50,  impactPauseMs: 300, slideBackMs: 200, lungeZoom: 1.04, pulseDuration: 200 },
    puzzle:   { lungeMs: 450, impactPauseMs: 600 }
  };

  // Active enemy type for current combat (set via setEnemyType)
  var _enemyType = 'standard';

  /** Resolve timing for current enemy type, inheriting from _default. */
  function _getTiming() {
    var base = RESOLUTION_TIMING._default;
    var over = RESOLUTION_TIMING[_enemyType] || {};
    return {
      slideAwayMs:    over.slideAwayMs    !== undefined ? over.slideAwayMs    : base.slideAwayMs,
      lungeMs:        over.lungeMs        !== undefined ? over.lungeMs        : base.lungeMs,
      lungeStaggerMs: over.lungeStaggerMs !== undefined ? over.lungeStaggerMs : base.lungeStaggerMs,
      impactPauseMs:  over.impactPauseMs  !== undefined ? over.impactPauseMs  : base.impactPauseMs,
      slideBackMs:    over.slideBackMs    !== undefined ? over.slideBackMs    : base.slideBackMs,
      lungeZoom:      over.lungeZoom      !== undefined ? over.lungeZoom      : base.lungeZoom,
      pulseDuration:  over.pulseDuration  !== undefined ? over.pulseDuration  : base.pulseDuration
    };
  }

  // ── Lunge params (base — overridden per enemy type) ───────────────
  var ENEMY_LUNGE_PEAK      = 0.35;  // fraction of duration at peak zoom
  var PLAYER_PULSE_ZOOM     = 0.97;  // zoom OUT slightly (push feeling)
  var FLASH_DURATION        = 400;   // ms — frame flash duration

  // ── Active effects ────────────────────────────────────────────────
  var _enemyLunge  = null;  // { timer, duration, zoom }
  var _playerPulse = null;  // { timer, duration }
  var _flash       = null;  // { timer, duration, color }

  // ── Fan slide state (choreography) ────────────────────────────────
  var _fanSlide    = null;  // { phase, timer, duration } — 'away' | 'back'

  // ── Viewport ref ──────────────────────────────────────────────────
  var _viewport = null;

  function init() {
    _viewport = document.getElementById('viewport');
  }

  // ── Enemy type (set at combat start) ──────────────────────────────

  /**
   * Set the current enemy type for timing overrides.
   * @param {string} type - 'standard', 'elite', 'boss', 'quick', 'puzzle'
   */
  function setEnemyType(type) {
    _enemyType = (type && RESOLUTION_TIMING[type]) ? type : 'standard';
  }

  // ── Trigger API (called from CombatBridge) ───────────────────────

  /**
   * Trigger enemy attack lunge (viewport zooms in).
   * Duration and zoom scale adapt to enemy type.
   */
  function enemyLunge() {
    var t = _getTiming();
    _enemyLunge = { timer: 0, duration: t.lungeMs, zoom: t.lungeZoom };
  }

  /**
   * Trigger player attack pulse (viewport zooms out briefly).
   * Duration adapts to enemy type.
   */
  function playerPulse() {
    var t = _getTiming();
    _playerPulse = { timer: 0, duration: t.pulseDuration };
  }

  /**
   * Flash the HUD frame border in a resource color.
   * @param {string} type - 'hp', 'heal', 'energy', 'card', 'suit', etc.
   * @param {string} [customColor] - Override color (used by suit flash)
   */
  function flashFrame(type, customColor) {
    var color = customColor || COLORS[type] || COLORS.neutral;
    _flash = { timer: 0, duration: FLASH_DURATION, color: color };

    if (_viewport) {
      _viewport.style.boxShadow = 'inset 0 0 30px 6px ' + color;
      _viewport.style.transition = 'box-shadow 0.08s ease-out';
    }
  }

  // ── Fan slide choreography ──────────────────────────────────────

  /**
   * Start the hand-fan slide-away animation.
   * CardFan reads getFanSlideOffset() each frame.
   */
  function fanSlideAway() {
    var t = _getTiming();
    _fanSlide = { phase: 'away', timer: 0, duration: t.slideAwayMs };
  }

  /**
   * Start the hand-fan slide-back animation.
   */
  function fanSlideBack() {
    var t = _getTiming();
    _fanSlide = { phase: 'back', timer: 0, duration: t.slideBackMs };
  }

  /**
   * Returns 0..1 slide offset for CardFan vertical displacement.
   *   0 = fan at normal position
   *   1 = fan fully slid away (off-screen below)
   */
  function getFanSlideOffset() {
    if (!_fanSlide) return 0;
    var progress = Math.min(1, _fanSlide.timer / _fanSlide.duration);
    // Ease-in-out
    var ease = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    return _fanSlide.phase === 'away' ? ease : (1 - ease);
  }

  /**
   * Get the full resolution choreography timing for CombatBridge.
   * Returns timing object with all durations for the current enemy type.
   */
  function getResolutionTiming() {
    return _getTiming();
  }

  // ── Per-frame update ──────────────────────────────────────────────

  /**
   * Advance all active effect timers.
   * @param {number} dt - Frame delta in ms
   */
  function update(dt) {
    if (_enemyLunge) {
      _enemyLunge.timer += dt;
      if (_enemyLunge.timer >= _enemyLunge.duration) _enemyLunge = null;
    }
    if (_playerPulse) {
      _playerPulse.timer += dt;
      if (_playerPulse.timer >= _playerPulse.duration) _playerPulse = null;
    }
    if (_flash) {
      _flash.timer += dt;
      if (_flash.timer >= _flash.duration) {
        _flash = null;
        if (_viewport) {
          _viewport.style.boxShadow = 'none';
          _viewport.style.transition = 'box-shadow 0.3s ease-in';
        }
      }
    }
    if (_fanSlide) {
      _fanSlide.timer += dt;
      if (_fanSlide.timer >= _fanSlide.duration) {
        if (_fanSlide.phase === 'back') _fanSlide = null;
        else _fanSlide.timer = _fanSlide.duration; // hold at fully-away
      }
    }
  }

  // ── Zoom factor query ─────────────────────────────────────────────

  /**
   * Returns the current viewport zoom scale to apply before rendering.
   * 1.0 = neutral. Called by game.js render loop.
   *
   * @returns {number} Scale factor (e.g. 1.06 for enemy lunge peak)
   */
  function getZoom() {
    var zoom = 1.0;

    if (_enemyLunge) {
      var t = _enemyLunge.timer / _enemyLunge.duration;
      var lungeZoom = _enemyLunge.zoom || 1.06;
      // Quick ramp to peak at PEAK fraction, then slow retreat
      var curve;
      if (t < ENEMY_LUNGE_PEAK) {
        // Ease-out for snappy approach
        var ramp = t / ENEMY_LUNGE_PEAK;
        curve = 1 - (1 - ramp) * (1 - ramp);
      } else {
        // Slow ease-in-out retreat back to neutral
        var retreat = (t - ENEMY_LUNGE_PEAK) / (1 - ENEMY_LUNGE_PEAK);
        curve = 1 - retreat * retreat;
      }
      zoom *= 1 + (lungeZoom - 1) * curve;
    }

    if (_playerPulse) {
      var t = _playerPulse.timer / _playerPulse.duration;
      // Quick dip then snap back — sine half-wave
      var wave = Math.sin(t * Math.PI);
      zoom *= 1 + (PLAYER_PULSE_ZOOM - 1) * wave;
    }

    return zoom;
  }

  /**
   * True if any combat effect is currently animating.
   */
  function isActive() {
    return !!_enemyLunge || !!_playerPulse || !!_flash;
  }

  return {
    init:                init,
    setEnemyType:        setEnemyType,
    enemyLunge:          enemyLunge,
    playerPulse:         playerPulse,
    flashFrame:          flashFrame,
    fanSlideAway:        fanSlideAway,
    fanSlideBack:        fanSlideBack,
    getFanSlideOffset:   getFanSlideOffset,
    getResolutionTiming: getResolutionTiming,
    update:              update,
    getZoom:             getZoom,
    isActive:            isActive,
    COLORS:              COLORS
  };
})();

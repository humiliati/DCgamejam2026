/**
 * CinematicCamera — letterbox bars, focus lock, and perspective events.
 *
 * Inspired by Zelda OoT's Z-targeting: two black bars slide in from
 * top and bottom, the viewport narrows to widescreen, and the camera
 * perspective can shift (FOV zoom, angle offset, shake).
 *
 * Use cases:
 *   - Combat lock-on (bars slide in when engaging an enemy)
 *   - NPC dispatcher grab (forced turn + letterbox)
 *   - Monologue peek (intrusive thought overlay with bars)
 *   - Morning recap (slow fade-in letterbox + text crawl)
 *   - Boss entrance (dramatic bars + camera shake)
 *   - Peek enhancement (bars during any peek interaction)
 *
 * Renders directly on the game canvas AFTER raycaster, BEFORE HUD.
 * The module provides viewport insets that the raycaster can read
 * to adjust its render region (optional — bars can also just overlay).
 *
 * Layer 2 (after TransitionFX, before HUD)
 * Depends on: AudioSystem (optional, for whoosh SFX)
 */
var CinematicCamera = (function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var _active = false;
  var _barHeight = 0;          // Current bar height in pixels (animated)
  var _targetBarHeight = 0;    // Target bar height
  var _barSpeed = 0;           // px/sec animation speed
  var _barColor = 'rgba(0,0,0,1)';

  // Focus lock state
  var _focusTarget = null;     // { x, y } grid position to focus on
  var _focusAngle = null;      // Override player facing angle (radians)
  var _focusLerp = 0;          // 0–1 interpolation progress
  var _focusSpeed = 3.0;       // lerp speed (units/sec)

  // FOV zoom
  var _baseFOV = null;         // Captured at start of cinematic
  var _targetFOV = null;       // Zoom target
  var _currentFOV = null;      // Animated FOV

  // Shake
  var _shakeIntensity = 0;     // Current shake magnitude (pixels)
  var _shakeDecay = 0;         // Decay rate (intensity/sec)
  var _shakeOffsetX = 0;
  var _shakeOffsetY = 0;

  // Timing
  var _elapsed = 0;
  var _duration = 0;           // 0 = indefinite (manual close)
  var _onComplete = null;
  var _onMidpoint = null;
  var _midpointFired = false;

  // Input lock
  var _lockInput = false;

  // ── Presets ─────────────────────────────────────────────────────

  var PRESETS = {
    /**
     * Combat lock-on: fast bars, slight FOV tighten.
     * Bars = ~12% of viewport height. Punchy 200ms slide.
     */
    combat_lock: {
      barPct: 0.12,
      barSpeed: 800,      // px/sec — fast slide
      fovMult: 0.92,      // Slight zoom in
      focusSpeed: 5.0,
      lockInput: false,
      duration: 0,        // Stays until manually closed
      sfx: 'ui_whoosh'
    },

    /**
     * Dispatcher grab: medium bars, forced camera turn.
     * NPC grabs player and turns them around.
     */
    dispatcher_grab: {
      barPct: 0.15,
      barSpeed: 600,
      fovMult: 0.88,
      focusSpeed: 2.0,
      lockInput: true,
      duration: 3000,
      sfx: 'ui_whoosh'
    },

    /**
     * Monologue peek: thick bars, no FOV change, slow slide.
     * Player's intrusive thoughts during exploration.
     */
    monologue: {
      barPct: 0.18,
      barSpeed: 300,       // Slow, contemplative
      fovMult: 1.0,        // No zoom
      focusSpeed: 0,       // No camera movement
      lockInput: true,
      duration: 0,         // Controlled by text system
      sfx: null
    },

    /**
     * Morning recap: very thick bars, slow cinematic fade.
     * Day-start monologue about previous night.
     */
    morning_recap: {
      barPct: 0.22,
      barSpeed: 200,       // Very slow, dreamy
      fovMult: 1.05,       // Slight wide angle (disorientation)
      focusSpeed: 0,
      lockInput: true,
      duration: 0,
      sfx: null
    },

    /**
     * Boss entrance: thick bars + shake.
     * Dramatic reveal when entering a boss chamber.
     */
    boss_entrance: {
      barPct: 0.16,
      barSpeed: 1200,      // Slam in fast
      fovMult: 0.85,       // Strong zoom
      focusSpeed: 4.0,
      lockInput: true,
      duration: 2500,
      shake: 6,            // Initial shake intensity (pixels)
      shakeDecay: 4,       // Decay rate
      sfx: 'door_slam'
    },

    /**
     * Peek enhancement: thin bars for any tile peek.
     * Subtle framing that complements existing peek system.
     */
    peek: {
      barPct: 0.08,
      barSpeed: 500,
      fovMult: 0.96,
      focusSpeed: 0,
      lockInput: false,
      duration: 0,
      sfx: null
    }
  };

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Start a cinematic moment.
   *
   * @param {string|Object} preset - Preset name or custom config object
   * @param {Object} [opts] - Override options
   * @param {Object} [opts.focusTarget] - { x, y } grid cell to look at
   * @param {number} [opts.focusAngle] - Forced facing angle (radians)
   * @param {Function} [opts.onComplete] - Called when cinematic ends
   * @param {Function} [opts.onMidpoint] - Called when bars reach full height
   */
  function start(preset, opts) {
    opts = opts || {};

    var config;
    if (typeof preset === 'string') {
      config = PRESETS[preset];
      if (!config) {
        console.warn('[CinematicCamera] Unknown preset: ' + preset);
        return;
      }
    } else {
      config = preset;
    }

    _active = true;
    _elapsed = 0;
    _midpointFired = false;

    // Bar animation
    // Target height calculated at render time from canvas height
    _targetBarHeight = config.barPct || 0.12;  // Store as percentage
    _barSpeed = config.barSpeed || 600;
    _barHeight = 0;

    // FOV
    _targetFOV = config.fovMult || 1.0;
    _currentFOV = 1.0;

    // Focus
    _focusTarget = opts.focusTarget || null;
    _focusAngle = (opts.focusAngle !== undefined) ? opts.focusAngle : null;
    _focusLerp = 0;
    _focusSpeed = config.focusSpeed || 3.0;

    // Shake
    _shakeIntensity = config.shake || 0;
    _shakeDecay = config.shakeDecay || 3;
    _shakeOffsetX = 0;
    _shakeOffsetY = 0;

    // Timing
    _duration = config.duration || 0;
    _onComplete = opts.onComplete || null;
    _onMidpoint = opts.onMidpoint || null;
    _lockInput = config.lockInput || false;

    // SFX
    if (config.sfx && typeof AudioSystem !== 'undefined') {
      AudioSystem.play(config.sfx);
    }
  }

  /**
   * Close the cinematic (bars slide out).
   * Can be called manually or fires automatically when duration expires.
   */
  function close(immediate) {
    if (!_active) return;
    if (immediate) {
      _active = false;
      _barHeight = 0;
      _targetBarHeight = 0;
      _focusTarget = null;
      _focusAngle = null;
      _lockInput = false;
      _shakeIntensity = 0;
      if (_onComplete) { _onComplete(); _onComplete = null; }
      return;
    }
    // Start close animation — bars slide out
    _targetBarHeight = 0;
    _focusTarget = null;
    _focusAngle = null;
    _lockInput = false;
    _duration = 0;  // Prevent re-trigger
  }

  /**
   * Tick — call from game loop every frame.
   * @param {number} dt - Frame delta in milliseconds
   */
  function tick(dt) {
    if (!_active) return;

    var dtSec = dt / 1000;
    _elapsed += dt;

    // ── Bar animation ──
    // _targetBarHeight is stored as a percentage, actual pixel height
    // is computed at render time. Here we animate a normalized 0–1 value.
    var targetPx = _targetBarHeight;  // This is a pct, used as target ratio
    var diff = targetPx - _barHeight;
    var step = _barSpeed * dtSec / 300;  // Normalize speed

    if (Math.abs(diff) < 0.005) {
      _barHeight = targetPx;

      // Fire midpoint when bars reach full height
      if (!_midpointFired && _barHeight > 0 && _onMidpoint) {
        _midpointFired = true;
        _onMidpoint();
      }

      // If bars have closed, deactivate
      if (_barHeight === 0 && _targetBarHeight === 0 && _elapsed > 100) {
        _active = false;
        if (_onComplete) { _onComplete(); _onComplete = null; }
        return;
      }
    } else {
      _barHeight += (diff > 0 ? 1 : -1) * Math.min(Math.abs(diff), step);
    }

    // ── FOV interpolation ──
    if (_currentFOV !== _targetFOV) {
      var fovDiff = _targetFOV - _currentFOV;
      _currentFOV += fovDiff * Math.min(1, dtSec * 4);
      if (Math.abs(fovDiff) < 0.002) _currentFOV = _targetFOV;
    }

    // ── Focus lerp ──
    if (_focusSpeed > 0 && (_focusTarget || _focusAngle !== null)) {
      _focusLerp = Math.min(1, _focusLerp + dtSec * _focusSpeed);
    }

    // ── Shake decay ──
    if (_shakeIntensity > 0) {
      _shakeIntensity = Math.max(0, _shakeIntensity - _shakeDecay * dtSec);
      _shakeOffsetX = (Math.random() - 0.5) * 2 * _shakeIntensity;
      _shakeOffsetY = (Math.random() - 0.5) * 2 * _shakeIntensity;
    } else {
      _shakeOffsetX = 0;
      _shakeOffsetY = 0;
    }

    // ── Auto-close on duration ──
    if (_duration > 0 && _elapsed >= _duration) {
      close();
    }

    // When closing, lerp FOV back to 1.0
    if (_targetBarHeight === 0) {
      _targetFOV = 1.0;
    }
  }

  /**
   * Render letterbox bars on the game canvas.
   * Call AFTER raycaster render, BEFORE HUD.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW - Viewport width
   * @param {number} vpH - Viewport height
   */
  function render(ctx, vpW, vpH) {
    if (!_active && _barHeight <= 0) return;

    var barPx = Math.floor(_barHeight * vpH);
    if (barPx < 1) return;

    ctx.save();

    // Apply shake offset
    if (_shakeIntensity > 0) {
      ctx.translate(_shakeOffsetX, _shakeOffsetY);
    }

    // ── Top bar ──
    ctx.fillStyle = _barColor;
    ctx.fillRect(0, 0, vpW, barPx);

    // ── Bottom bar ──
    ctx.fillRect(0, vpH - barPx, vpW, barPx);

    // ── Subtle film grain on bars (optional visual texture) ──
    if (barPx > 8) {
      ctx.globalAlpha = 0.03;
      for (var i = 0; i < barPx; i += 2) {
        var noise = Math.random() * 0.06;
        ctx.fillStyle = 'rgba(255,255,255,' + noise.toFixed(3) + ')';
        ctx.fillRect(0, i, vpW, 1);
        ctx.fillRect(0, vpH - barPx + i, vpW, 1);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ── Queries ────────────────────────────────────────────────────

  /** Is a cinematic currently active? */
  function isActive() { return _active; }

  /** Should player input be locked? */
  function isInputLocked() { return _active && _lockInput; }

  /** Get current bar height in pixels for a given viewport height */
  function getBarHeight(vpH) {
    return Math.floor(_barHeight * (vpH || 600));
  }

  /**
   * Get the viewport inset (usable render region).
   * Raycaster can optionally read this to clip its render region.
   */
  function getViewportInset(vpH) {
    var barPx = Math.floor(_barHeight * (vpH || 600));
    return { top: barPx, bottom: barPx };
  }

  /** Get FOV multiplier (1.0 = normal, <1 = zoomed in, >1 = zoomed out) */
  function getFOVMultiplier() {
    return _active ? _currentFOV : 1.0;
  }

  /**
   * Get focus angle override (or null if no override).
   * MovementController / Player can read this to override facing.
   */
  function getFocusAngle() {
    if (!_active || _focusAngle === null) return null;
    return _focusAngle;
  }

  /**
   * Get focus lerp progress (0 = not started, 1 = fully locked).
   */
  function getFocusLerp() {
    return _focusLerp;
  }

  /** Get camera shake offsets { x, y } in pixels */
  function getShakeOffset() {
    return { x: _shakeOffsetX, y: _shakeOffsetY };
  }

  /** Get elapsed time in ms since cinematic started */
  function getElapsed() { return _elapsed; }

  /** Check if a named preset exists */
  function hasPreset(name) { return !!PRESETS[name]; }

  /** Add or override a preset at runtime */
  function definePreset(name, config) {
    PRESETS[name] = config;
  }

  return Object.freeze({
    start:              start,
    close:              close,
    tick:               tick,
    render:             render,
    isActive:           isActive,
    isInputLocked:      isInputLocked,
    getBarHeight:       getBarHeight,
    getViewportInset:   getViewportInset,
    getFOVMultiplier:   getFOVMultiplier,
    getFocusAngle:      getFocusAngle,
    getFocusLerp:       getFocusLerp,
    getShakeOffset:     getShakeOffset,
    getElapsed:         getElapsed,
    hasPreset:          hasPreset,
    definePreset:       definePreset
  });
})();

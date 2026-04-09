/**
 * MouseLook — free-look offset from mouse/pointer or gamepad right stick.
 *
 * Mouse backend:
 *   The active zone is the circular area defined by ViewportRing. The
 *   center ~60% of the ring is a dead zone — freelook only activates
 *   when the cursor approaches the ring edge (outer 40% of radius).
 *
 * Gamepad backend:
 *   Right stick analog deflection drives free-look through the same
 *   acceleration curve. Overrides mouse when stick is deflected.
 *   InputManager.getGamepadRightStick() provides raw axis values.
 *
 * Horizontal: ±32° yaw via acceleration curve.
 * Vertical:   pitch shift (horizon offset) — asymmetric range,
 *             more down (floor inspection) than up (ceiling/architecture).
 *
 * Lock-on system: external code can call lockOn(x, y) to smoothly
 * pan the camera toward a world position (OoT Z-target style).
 * The lock persists until releaseLock() is called. During lock,
 * mouse and gamepad input are ignored and the offset lerps toward the target.
 */
var MouseLook = (function () {
  'use strict';

  var _canvas = null;

  // ── Acceleration tuning ───────────────────────────────────────────
  var ACCEL_POWER   = 1.8;    // 1=linear, 2=quadratic — 1.8 is smooth
  var SMOOTH_ATTACK = 0.12;   // Lerp weight when offset is growing (was 0.18)
  var SMOOTH_DECAY  = 0.06;   // Lerp weight when offset is shrinking (was 0.08)

  // Horizontal speed multiplier — keeps yaw smooth like pitch.
  // 1.0 = same scale as vertical; <1 slows horizontal to prevent tearing.
  var H_SPEED_MULT  = 0.45;

  // ── Dead center zone ──────────────────────────────────────────────
  // Fraction of ring radius that is dead zone. 0.60 means only the
  // outer 40% of the ring triggers freelook — cursor must be near
  // the ring edge to start looking.
  var DEAD_CENTER_FRAC = 0.60;

  // ── Hitbox fraction ───────────────────────────────────────────────
  // The mousemove hitbox can be slightly larger than the visual ring
  // (more forgiving). Expressed as fraction of min(canvasW, canvasH).
  var HITBOX_RADIUS_FRAC = 0.328;

  // ── Invert Y ──────────────────────────────────────────────────────
  var _invertY = false;

  // ── State ──────────────────────────────────────────────────────────
  var _targetYaw   = 0;    // Raw horizontal offset target
  var _targetPitch = 0;    // Raw vertical offset target
  var _smoothYaw   = 0;    // Smoothed horizontal output
  var _smoothPitch = 0;    // Smoothed vertical output
  var _insideRing  = false;
  var _mouseX = -1;
  var _mouseY = -1;

  // ── Lock-on state ──────────────────────────────────────────────────
  var _locked       = false;
  var _lockYaw      = 0;     // Target yaw for lock-on
  var _lockPitch    = 0;     // Target pitch for lock-on
  var LOCK_LERP     = 0.06;  // Smooth pan speed toward lock target

  /**
   * Bind mouse events to a canvas element.
   * @param {HTMLCanvasElement} canvas
   */
  function init(canvas) {
    _canvas = canvas;

    canvas.addEventListener('mousemove', function (e) {
      if (_locked) return; // Ignore mouse during lock-on
      var rect = canvas.getBoundingClientRect();
      _mouseX = e.clientX - rect.left;
      _mouseY = e.clientY - rect.top;
      _updateTarget(rect.width, rect.height);
    });

    canvas.addEventListener('mouseleave', function () {
      if (_locked) return;
      _mouseX = -1;
      _mouseY = -1;
      _insideRing = false;
      _targetYaw = 0;
      _targetPitch = 0;
    });
  }

  /**
   * Compute target look offsets from current mouse position.
   */
  function _updateTarget(canvasW, canvasH) {
    var cx = canvasW / 2;
    var cy = canvasH / 2;

    // Hitbox radius — slightly larger than the visual ring for forgiveness
    var ringR = Math.min(canvasW, canvasH) * HITBOX_RADIUS_FRAC;

    // Distance from center
    var dx = _mouseX - cx;
    var dy = _mouseY - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > ringR) {
      // Outside ring = dead zone (HUD interaction)
      _insideRing = false;
      _targetYaw = 0;
      _targetPitch = 0;
      return;
    }

    _insideRing = true;

    // Radial distance as fraction of ring radius [0, 1]
    var radialFrac = dist / ringR;

    // Only activate when cursor is in outer band (beyond dead center)
    if (radialFrac < DEAD_CENTER_FRAC) {
      _targetYaw = 0;
      _targetPitch = 0;
      return;
    }

    // Remap: dead zone edge = 0, ring edge = 1
    var remapped = (radialFrac - DEAD_CENTER_FRAC) / (1 - DEAD_CENTER_FRAC);
    remapped = Math.min(1, remapped);

    // ── Horizontal (yaw) ──
    // Project horizontal component: how much of the displacement is sideways
    var normX = dx / dist;  // unit vector X component
    var hWeight = Math.abs(normX); // pure horizontal = 1, pure vertical = 0
    var hSign = dx < 0 ? -1 : 1;
    var hAccel = hSign * Math.pow(remapped * hWeight, ACCEL_POWER) * H_SPEED_MULT;

    if (typeof Player !== 'undefined') {
      _targetYaw = hAccel * Player.FREE_LOOK_RANGE;
    }

    // ── Vertical (pitch) ──
    // Natural: cursor below center (dy>0) → positive pitch → look DOWN
    // (positive pitch shifts horizon up, revealing floor).
    // invertY flips this so cursor-below = look up (flight-sim style).
    var normY = dy / dist;
    var vWeight = Math.abs(normY);
    var vSign = dy > 0 ? 1 : -1;    // Below center = positive = look down
    if (_invertY) vSign = -vSign;    // Flip when inverted
    var vAccel = vSign * Math.pow(remapped * vWeight, ACCEL_POWER);

    if (typeof Player !== 'undefined') {
      // Asymmetric range: more down (positive) than up (negative)
      if (vAccel > 0) {
        _targetPitch = vAccel * Player.PITCH_DOWN_MAX;
      } else {
        _targetPitch = vAccel * Player.PITCH_UP_MAX;
      }
    }
  }

  // ── Gamepad right stick speed multipliers ───────────────────────────
  // These scale the stick deflection before applying the acceleration
  // curve so stick feel can be tuned independently of mouse sensitivity.
  var GP_YAW_SPEED   = 0.85;    // Horizontal stick sensitivity
  var GP_PITCH_SPEED = 0.85;    // Vertical stick sensitivity

  /**
   * Read gamepad right stick and compute free-look targets.
   * Uses the same acceleration power curve as the mouse ring.
   * Called from tick() when a gamepad is connected and stick is deflected.
   */
  function _updateFromGamepad() {
    if (typeof InputManager === 'undefined' || !InputManager.isGamepadConnected()) return false;

    var rs = InputManager.getGamepadRightStick();
    if (rs.x === 0 && rs.y === 0) return false;

    // Magnitude and unit direction (same model as mouse ring)
    var mag = Math.sqrt(rs.x * rs.x + rs.y * rs.y);
    if (mag > 1) mag = 1;

    // Remap through the same acceleration curve
    var accel = Math.pow(mag, ACCEL_POWER);

    // Horizontal — stick right = look right (positive yaw)
    var normX = rs.x / (mag || 1);
    var hWeight = Math.abs(normX);
    var hSign = rs.x < 0 ? -1 : 1;
    var hAccel = hSign * accel * hWeight * GP_YAW_SPEED;

    if (typeof Player !== 'undefined') {
      _targetYaw = hAccel * Player.FREE_LOOK_RANGE;
    }

    // Vertical — stick down (positive Y) = look down (positive pitch)
    var normY = rs.y / (mag || 1);
    var vWeight = Math.abs(normY);
    var vSign = rs.y > 0 ? 1 : -1;
    if (_invertY) vSign = -vSign;
    var vAccel = vSign * accel * vWeight * GP_PITCH_SPEED;

    if (typeof Player !== 'undefined') {
      if (vAccel > 0) {
        _targetPitch = vAccel * Player.PITCH_DOWN_MAX;
      } else {
        _targetPitch = vAccel * Player.PITCH_UP_MAX;
      }
    }

    return true;
  }

  /**
   * Call once per frame to advance smoothing and apply offsets.
   * Must be called BEFORE Raycaster.render().
   * @param {number} [dt] — frame delta in ms (defaults to 16.667 for
   *   backwards compatibility, but callers should always pass frameDt)
   */
  function tick(dt) {
    if (!dt || dt <= 0) dt = 16.667; // fallback: assume 60fps
    if (dt > 100) dt = 100;          // clamp: prevent spiral after tab-away

    if (_locked) {
      // Lock-on: smoothly pan toward lock target (also dt-aware)
      var lockF = 1 - Math.pow(1 - LOCK_LERP, dt / 16.667);
      _smoothYaw   += (_lockYaw   - _smoothYaw)   * lockF;
      _smoothPitch += (_lockPitch - _smoothPitch) * lockF;
      if (Math.abs(_smoothYaw)   < 0.0005) _smoothYaw = 0;
      if (Math.abs(_smoothPitch) < 0.0005) _smoothPitch = 0;
    } else {
      // Gamepad right stick overrides mouse when active
      var gpActive = _updateFromGamepad();

      // If gamepad not driving free-look and mouse is outside ring,
      // targets will be 0 (natural decay to center)
      if (!gpActive && _mouseX < 0) {
        _targetYaw = 0;
        _targetPitch = 0;
      }

      // Normal freelook: two-stage dt-aware smoothing per axis
      _smoothYaw   = _lerp2(_smoothYaw,   _targetYaw,   dt);
      _smoothPitch = _lerp2(_smoothPitch, _targetPitch, dt);
    }

    if (typeof Player !== 'undefined') {
      Player.setLookOffset(_smoothYaw);
      Player.setLookPitch(_smoothPitch);
    }
  }

  /**
   * Two-stage dt-aware lerp: faster attack, slower decay.
   * Uses frame-rate-independent exponential smoothing so convergence
   * speed is consistent regardless of frame timing irregularity.
   * A 50ms frame applies ~3× the correction of a 16ms frame.
   */
  function _lerp2(current, target, dt) {
    var diff = target - current;
    var growing = Math.abs(target) > Math.abs(current);
    var base = growing ? SMOOTH_ATTACK : SMOOTH_DECAY;
    // dt-independent: factor = 1 - (1 - base)^(dt / 16.667)
    var factor = 1 - Math.pow(1 - base, dt / 16.667);
    var result = current + diff * factor;
    if (Math.abs(result) < 0.0005) result = 0;
    return result;
  }

  // ── Lock-on API ────────────────────────────────────────────────────

  /**
   * Lock the camera on a target yaw/pitch. Mouse input is ignored
   * until releaseLock(). The camera smoothly pans to the target.
   *
   * @param {number} yaw   - Target horizontal offset (radians, same
   *   range as Player.FREE_LOOK_RANGE). 0 = dead ahead.
   * @param {number} [pitch] - Target vertical offset. 0 = level.
   */
  function lockOn(yaw, pitch) {
    _locked = true;
    _lockYaw = yaw || 0;
    _lockPitch = pitch || 0;
  }

  /**
   * Release the lock-on. The camera will smoothly decay back to
   * wherever the mouse cursor is (or center if outside the ring).
   */
  function releaseLock() {
    _locked = false;
    // On release, the current smooth values become the starting point
    // and will naturally decay toward mouse-driven targets on next tick.
  }

  /** Is the camera currently locked on a target? */
  function isLocked() { return _locked; }

  /** Is the pointer inside the freelook ring? */
  function isInsideRing() { return _insideRing; }

  /** Toggle invert-Y free look. */
  function setInvertY(on) { _invertY = !!on; }

  /** Query current invert-Y state. */
  function getInvertY() { return _invertY; }

  // ── Public API ─────────────────────────────────────────────────────

  return Object.freeze({
    init:               init,
    tick:               tick,
    lockOn:             lockOn,
    releaseLock:        releaseLock,
    isLocked:           isLocked,
    isInsideRing:       isInsideRing,
    setInvertY:         setInvertY,
    getInvertY:         getInvertY,
    ACCEL_POWER:        ACCEL_POWER,
    SMOOTH_ATTACK:      SMOOTH_ATTACK,
    SMOOTH_DECAY:       SMOOTH_DECAY,
    HITBOX_RADIUS_FRAC: HITBOX_RADIUS_FRAC
  });
})();

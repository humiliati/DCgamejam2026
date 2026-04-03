/**
 * MouseLook — free-look offset from mouse/pointer position.
 *
 * The active zone is the circular area defined by ViewportRing. The
 * center ~60% of the ring is a dead zone — freelook only activates
 * when the cursor approaches the ring edge (outer 40% of radius).
 * This means the player must deliberately push the cursor toward the
 * ring to look around; idle cursor motion near center does nothing.
 *
 * Horizontal: ±32° yaw via acceleration curve.
 * Vertical:   pitch shift (horizon offset) — more range looking down
 *             (floor inspection / pressure washing) than up.
 *
 * Lock-on system: external code can call lockOn(x, y) to smoothly
 * pan the camera toward a world position (OoT Z-target style).
 * The lock persists until releaseLock() is called. During lock,
 * mouse input is ignored and the offset lerps toward the target.
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

  /**
   * Call once per frame to advance smoothing and apply offsets.
   * Must be called BEFORE Raycaster.render().
   */
  function tick() {
    if (_locked) {
      // Lock-on: smoothly pan toward lock target
      _smoothYaw   += (_lockYaw   - _smoothYaw)   * LOCK_LERP;
      _smoothPitch += (_lockPitch - _smoothPitch) * LOCK_LERP;
      if (Math.abs(_smoothYaw)   < 0.0005) _smoothYaw = 0;
      if (Math.abs(_smoothPitch) < 0.0005) _smoothPitch = 0;
    } else {
      // Normal freelook: two-stage smoothing per axis
      _smoothYaw   = _lerp2(_smoothYaw,   _targetYaw);
      _smoothPitch = _lerp2(_smoothPitch, _targetPitch);
    }

    if (typeof Player !== 'undefined') {
      Player.setLookOffset(_smoothYaw);
      Player.setLookPitch(_smoothPitch);
    }
  }

  /** Two-stage lerp: faster attack, slower decay. */
  function _lerp2(current, target) {
    var diff = target - current;
    var growing = Math.abs(target) > Math.abs(current);
    var factor = growing ? SMOOTH_ATTACK : SMOOTH_DECAY;
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

/**
 * MouseLook — free-look offset from mouse/pointer position.
 *
 * Maps horizontal pointer position within the viewport to a ±32°
 * look offset via an acceleration curve. Small mouse movements
 * produce subtle peeks; large sweeps accelerate into the offset
 * range for quick scouting.
 *
 * Acceleration model (matches Glov-style pointer input):
 *   offset = sign(n) × |n|^ACCEL_POWER × FREE_LOOK_RANGE
 * where n ∈ [-1, +1] is the normalized mouse position from center.
 * ACCEL_POWER=1.0 → linear (old behavior).
 * ACCEL_POWER=2.0 → quadratic (center-weighted, fast edges).
 * Default 1.6 is a smooth middle ground: ~40% less sensitive in
 * the center 50% of the viewport, accelerating toward edges.
 *
 * Smoothing: exponential lerp (`_smoothOffset`) prevents per-frame
 * jitter and adds a natural lag that sells the "head turning" feel.
 *
 * Future: gamepad right-stick and LG Magic Remote pointer
 * will feed through the same setOffset() API.
 */
var MouseLook = (function () {
  'use strict';

  var _canvas = null;

  // ── Acceleration tuning ───────────────────────────────────────────
  var ACCEL_POWER = 1.6;    // 1=linear, 2=quadratic, 1.6=Glov-like
  var SMOOTH_FACTOR = 0.15; // Per-frame lerp weight (0=frozen, 1=instant)

  var _targetOffset = 0;    // Raw accelerated offset from mouse position
  var _smoothOffset = 0;    // Exponentially smoothed output

  /**
   * Bind mouse events to a canvas element.
   * @param {HTMLCanvasElement} canvas
   */
  function init(canvas) {
    _canvas = canvas;

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var halfW = rect.width / 2;
      var normalized = Math.max(-1, Math.min(1, (mouseX - halfW) / halfW));

      // Apply acceleration curve: sign-preserving power function
      var sign = normalized < 0 ? -1 : 1;
      var accelerated = sign * Math.pow(Math.abs(normalized), ACCEL_POWER);
      _targetOffset = accelerated * Player.FREE_LOOK_RANGE;
    });

    canvas.addEventListener('mouseleave', function () {
      _targetOffset = 0;
    });
  }

  /**
   * Call once per frame (from render loop) to advance smoothing.
   * Must be called BEFORE Raycaster.render() reads Player.lookOffset.
   */
  function tick() {
    _smoothOffset += (_targetOffset - _smoothOffset) * SMOOTH_FACTOR;
    // Snap to zero when very close (prevent micro-drift)
    if (Math.abs(_smoothOffset) < 0.001) _smoothOffset = 0;
    Player.setLookOffset(_smoothOffset);
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init,
    tick: tick,
    // Tuning access for roadmap/debug
    ACCEL_POWER: ACCEL_POWER,
    SMOOTH_FACTOR: SMOOTH_FACTOR
  };
})();

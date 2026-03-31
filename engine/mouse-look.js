/**
 * MouseLook — free-look offset from mouse/pointer position.
 *
 * Maps horizontal pointer position within a narrow center strip to a
 * ±32° look offset via an acceleration curve. The active zone is
 * defined by ZONE_INSET — a fraction of canvas width on each side
 * that is treated as "dead zone" (no viewport rotation). Only pointer
 * movement inside the inner strip triggers look offset.
 *
 * Acceleration model (matches Glov-style pointer input):
 *   offset = sign(n) × |n|^ACCEL_POWER × FREE_LOOK_RANGE
 * where n ∈ [-1, +1] is the normalized mouse position within the zone.
 *
 * Smoothing: exponential lerp (`_smoothOffset`) prevents per-frame
 * jitter and adds a natural lag that sells the "head turning" feel.
 */
var MouseLook = (function () {
  'use strict';

  var _canvas = null;

  // ── Acceleration tuning ───────────────────────────────────────────
  var ACCEL_POWER = 2.0;     // 1=linear, 2=quadratic — steeper edges
  var SMOOTH_FACTOR = 0.12;  // Per-frame lerp weight (slightly slower for comfort)

  // ── Viewport zone ─────────────────────────────────────────────────
  // Fraction of canvas width on each side that is dead zone (no look).
  // 0.30 means the outer 30% on each side is dead → only inner 40% is active.
  var ZONE_INSET = 0.30;

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
      var canvasW = rect.width;

      // Define active zone: inner strip between ZONE_INSET margins
      var zoneLeft = canvasW * ZONE_INSET;
      var zoneRight = canvasW * (1 - ZONE_INSET);
      var zoneHalf = (zoneRight - zoneLeft) / 2;
      var zoneCenter = (zoneLeft + zoneRight) / 2;

      if (mouseX < zoneLeft || mouseX > zoneRight) {
        // Outside active zone — no viewport rotation
        // (allows HUD interaction without camera movement)
        _targetOffset = 0;
        return;
      }

      // Normalize within the active zone: [-1, +1]
      var normalized = Math.max(-1, Math.min(1, (mouseX - zoneCenter) / zoneHalf));

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
    if (Math.abs(_smoothOffset) < 0.001) _smoothOffset = 0;
    Player.setLookOffset(_smoothOffset);
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init,
    tick: tick,
    ACCEL_POWER: ACCEL_POWER,
    SMOOTH_FACTOR: SMOOTH_FACTOR,
    ZONE_INSET: ZONE_INSET
  };
})();

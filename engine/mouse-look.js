/**
 * MouseLook — free-look offset from mouse position.
 *
 * Maps horizontal mouse position within the viewport to a ±45°
 * look offset. This offset is added to the player's cardinal
 * facing direction when rendering, allowing the player to peek
 * left/right without turning.
 *
 * The offset resets to 0 when the mouse leaves the canvas.
 *
 * Future: gamepad right-stick and LG Magic Remote pointer
 * will feed through the same setOffset() API.
 */
var MouseLook = (function () {
  'use strict';

  var _canvas = null;

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
      Player.setLookOffset(normalized * Player.FREE_LOOK_RANGE);
    });

    canvas.addEventListener('mouseleave', function () {
      Player.resetLookOffset();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init
  };
})();

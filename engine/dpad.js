/**
 * DPad — on-screen movement pad using dcexjam2025 button sprites.
 *
 * 3×2 grid layout (matches dcexjam2025 crawler_controller.ts):
 *   Row 1: Turn Left (Q) | Forward (W) | Turn Right (E)
 *   Row 2: Strafe Left (A) | Back (S) | Strafe Right (D)
 *
 * Sprites: assets/ui/buttons/buttons.png (60×80, 3×4 grid of 20×20 frames)
 * Frames 0-5 map to the 6 movement buttons in reading order.
 *
 * Visibility: shown during GAMEPLAY, hidden during TITLE/PAUSE/etc.
 *
 * Layer 3 (depends on: MovementController, ScreenManager)
 */
var DPad = (function () {
  'use strict';

  var _frame = null;
  var _onInteract = null;

  function init() {
    _frame = document.getElementById('dpad-frame');
    if (!_frame) return;

    // Prevent context menu on long press
    _frame.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // ── Wire the 6 movement buttons ──
    _bind('dpad-turn-l', function () { _turnLeft(); });
    _bind('dpad-fwd',    function () { _moveForward(); });
    _bind('dpad-turn-r', function () { _turnRight(); });
    _bind('dpad-str-l',  function () { _strafeLeft(); });
    _bind('dpad-back',   function () { _moveBack(); });
    _bind('dpad-str-r',  function () { _strafeRight(); });
  }

  /**
   * Bind pointerdown with hold-to-repeat.
   * Matches dcexjam2025 button feel: immediate fire, 400ms delay, 200ms repeat.
   */
  function _bind(id, action) {
    var el = document.getElementById(id);
    if (!el) return;

    var holdId = null;
    var repeatId = null;

    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      action();
      // Play click SFX on first press
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play('ui-click', { volume: 0.25 });
      }
      holdId = setTimeout(function () {
        repeatId = setInterval(action, 200);
      }, 400);
    });

    var cancel = function () {
      if (holdId)   { clearTimeout(holdId);   holdId = null; }
      if (repeatId) { clearInterval(repeatId); repeatId = null; }
    };
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
  }

  // ── Actions — route through MovementController ──

  function _moveForward() {
    if (typeof MovementController !== 'undefined') {
      MovementController.startRelativeMove('forward');
    }
  }

  function _moveBack() {
    if (typeof MovementController !== 'undefined') {
      MovementController.startRelativeMove('back');
    }
  }

  function _turnLeft() {
    if (typeof MovementController !== 'undefined') {
      MovementController.turnLeft();
    }
  }

  function _turnRight() {
    if (typeof MovementController !== 'undefined') {
      MovementController.turnRight();
    }
  }

  function _strafeLeft() {
    if (typeof MovementController !== 'undefined') {
      MovementController.startRelativeMove('strafe_left');
    }
  }

  function _strafeRight() {
    if (typeof MovementController !== 'undefined') {
      MovementController.startRelativeMove('strafe_right');
    }
  }

  function _interact() {
    if (_onInteract) _onInteract();
  }

  function show() {
    if (_frame) _frame.style.display = '';
  }

  function hide() {
    if (_frame) _frame.style.display = 'none';
  }

  function setOnInteract(fn) {
    _onInteract = fn;
  }

  return Object.freeze({
    init:          init,
    show:          show,
    hide:          hide,
    setOnInteract: setOnInteract
  });
})();

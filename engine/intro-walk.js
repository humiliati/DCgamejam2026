/**
 * IntroWalk — scripted auto-walk controller for the tutorial sequence.
 *
 * Queues MovementController moves on a timer to walk the player from
 * their Floor 0 spawn through the courtyard and into the dungeon.
 *
 * During auto-walk:
 *   - InputPoll should block player input (isBlocked returns true)
 *   - MovementController processes steps normally (lerp, callbacks)
 *   - Minimap reveals tiles as the player walks
 *
 * After auto-walk completes, calls onComplete which triggers the
 * floor transition into Floor 1 (the first dungeon level).
 *
 * Depends on: MovementController
 */
var IntroWalk = (function () {
  'use strict';

  var MC = MovementController;

  var _active = false;
  var _stepIndex = 0;
  var _steps = [];         // Array of { action, delay }
  var _timer = null;
  var _onComplete = null;
  var _startDelay = 800;   // Pause before first step so player sees exterior

  // ── Public state ─────────────────────────────────────────────────

  function isActive() { return _active; }

  // ── Start sequence ───────────────────────────────────────────────

  /**
   * Begin an auto-walk sequence.
   *
   * @param {Object} opts
   * @param {Array}  opts.steps - [{ action: 'forward'|'turn_left'|'turn_right', delay: ms }, ...]
   * @param {number} [opts.startDelay] - ms to wait before first step (default 800)
   * @param {Function} opts.onComplete - Called after last step finishes animating
   */
  function start(opts) {
    opts = opts || {};
    _steps = opts.steps || [];
    _onComplete = opts.onComplete || null;
    _startDelay = (opts.startDelay != null) ? opts.startDelay : 800;
    _stepIndex = 0;
    _active = true;

    console.log('[IntroWalk] Starting auto-walk sequence (' + _steps.length + ' steps)');

    // Initial delay so the player gets a moment to see the exterior
    _timer = setTimeout(function () {
      _executeNextStep();
    }, _startDelay);
  }

  // ── Step execution ───────────────────────────────────────────────

  function _executeNextStep() {
    if (!_active) return;

    if (_stepIndex >= _steps.length) {
      // All steps queued — wait for MC to finish animating the last one
      _timer = setTimeout(_finish, MC.WALK_TIME + 100);
      return;
    }

    var step = _steps[_stepIndex];
    _stepIndex++;

    // Execute the movement action
    switch (step.action) {
      case 'forward':
        MC.startRelativeMove('forward');
        break;
      case 'back':
        MC.startRelativeMove('back');
        break;
      case 'strafe_left':
        MC.startRelativeMove('strafe_left');
        break;
      case 'strafe_right':
        MC.startRelativeMove('strafe_right');
        break;
      case 'turn_left':
        MC.turnLeft();
        break;
      case 'turn_right':
        MC.turnRight();
        break;
      default:
        console.warn('[IntroWalk] Unknown action: ' + step.action);
    }

    // Schedule next step after this one's delay
    var delay = step.delay || MC.WALK_TIME + 50;
    _timer = setTimeout(function () {
      _executeNextStep();
    }, delay);
  }

  // ── Finish ───────────────────────────────────────────────────────

  function _finish() {
    _active = false;
    _timer = null;
    console.log('[IntroWalk] Auto-walk complete');
    if (_onComplete) _onComplete();
  }

  // ── Cancel (e.g., player skips intro) ────────────────────────────

  function cancel() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    _active = false;
    console.log('[IntroWalk] Cancelled');
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    start: start,
    cancel: cancel,
    isActive: isActive
  };
})();

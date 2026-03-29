/**
 * IntroWalk — scripted auto-walk controller for tutorial sequences.
 *
 * General-purpose sequencer that queues MovementController moves on a
 * timer. Supports movement, turn, and bark (ambient dialog) step types.
 *
 * During auto-walk:
 *   - InputPoll should block player input (isBlocked returns true)
 *   - MovementController processes steps normally (lerp, callbacks)
 *   - Minimap reveals tiles as the player walks
 *   - 'bark' steps fire a Toast notification and continue immediately
 *
 * After the last step finishes animating, calls onComplete.
 *
 * Named sequences (shelved — not active in normal play):
 *   HOME_DEPARTURE  — Floor 1.6 → Floor 1 exit walk (fail-state recovery).
 *                     Activated only when the player collapses at curfew or
 *                     respawns at home after death, to smoothly walk them to
 *                     the Promenade door before restoring free control.
 *
 * Depends on: MovementController, Toast (optional — bark steps degrade
 *             gracefully if Toast is unavailable)
 */
var IntroWalk = (function () {
  'use strict';

  var MC = MovementController;

  var _active = false;
  var _stepIndex = 0;
  var _steps = [];         // Array of { action, delay, [text, style] }
  var _timer = null;
  var _onComplete = null;
  var _startDelay = 800;   // Pause before first step so player sees exterior

  // ── Named sequences ───────────────────────────────────────────────
  //
  // HOME_DEPARTURE: shelved — used only for fail-state recovery (curfew
  // collapse / respawn at home after death). Walks the player from their
  // bed spawn to the Promenade door (Floor 1.6 DOOR_EXIT).
  //
  // Floor 1.6 layout: spawn at (5,6) facing NORTH (dir 3) — the player
  // enters from the south-wall DOOR_EXIT at (5,7) and faces into the room.
  // On curfew respawn the player also starts at (5,6) facing NORTH (same
  // point). The exit door is one tile SOUTH at (5,7), so the sequence
  // turns the player 180° (two right-turns: N→E→S) then walks forward
  // once into the DOOR_EXIT tile which auto-triggers the transition.

  var SEQUENCES = Object.freeze({
    HOME_DEPARTURE: {
      startDelay: 600,
      steps: [
        { action: 'bark',        key: 'home.departure', delay: 1200 },
        { action: 'turn_right',  delay: 280 },
        { action: 'turn_right',  delay: 280 },
        { action: 'forward',     delay: 580 }
        // onComplete: caller supplies FloorTransition.go('1', 'advance')
      ]
    }
  });

  // ── Public state ─────────────────────────────────────────────────

  function isActive() { return _active; }

  // ── Start sequence ───────────────────────────────────────────────

  /**
   * Begin an auto-walk sequence.
   *
   * @param {Object} opts
   * @param {Array}  opts.steps     - Step array. Each step: { action, delay, [key], [barkOpts] }
   *                                  action: 'forward'|'back'|'strafe_left'|'strafe_right'|
   *                                          'turn_left'|'turn_right'|'bark'
   *                                  delay:  ms before scheduling the next step
   *                                  key:    (bark only) BarkLibrary pool key to fire
   *                                  barkOpts: (bark only) optional overrides passed to BarkLibrary.fire()
   * @param {number} [opts.startDelay] - ms to wait before first step (default 800)
   * @param {Function} opts.onComplete  - Called after last step finishes animating
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

  /**
   * Convenience: start a named shelved sequence.
   *
   * @param {string}   sequenceName - Key from SEQUENCES (e.g. 'HOME_DEPARTURE')
   * @param {Function} onComplete   - Called after last step finishes animating
   */
  function startNamed(sequenceName, onComplete) {
    var seq = SEQUENCES[sequenceName];
    if (!seq) {
      console.warn('[IntroWalk] Unknown named sequence: ' + sequenceName);
      return;
    }
    start({
      steps:      seq.steps,
      startDelay: seq.startDelay,
      onComplete: onComplete
    });
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

    // Execute the step action
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
      case 'bark':
        // Non-blocking bark pulled from BarkLibrary by pool key.
        // Fires and immediately schedules the next step — no blocking.
        if (step.key && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire(step.key, step.barkOpts || {});
        }
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
    start:      start,
    startNamed: startNamed,
    cancel:     cancel,
    isActive:   isActive,
    SEQUENCES:  SEQUENCES
  };
})();

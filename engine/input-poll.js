/**
 * InputPoll — movement and action input polling.
 *
 * Runs every frame (called from render loop) to translate raw
 * InputManager state into MovementController commands.
 *
 * Handles:
 *   - Turn edges (Q/E)
 *   - Movement edges + held key repeat (WASD)
 *   - Action edges (interact, descend, ascend, map toggle)
 *   - Card slot edges (1-5)
 *
 * Does NOT own:
 *   - Raw key state (see InputManager)
 *   - Movement animation (see MovementController)
 *   - What happens on interact/stairs/cards (delegates via callbacks)
 */
var InputPoll = (function () {
  'use strict';

  var MC = MovementController;

  // ── Callbacks (wired by Game orchestrator) ─────────────────────────
  var _onInteract = null;
  var _onDescend = null;
  var _onAscend = null;
  var _onMapToggle = null;
  var _onCard = null;

  // ── Blocked predicate ──────────────────────────────────────────────
  // Returns true if input should be ignored (combat, transition, etc.)
  var _isBlocked = null;

  /**
   * Wire callbacks and block predicate.
   * @param {Object} cbs
   */
  function init(cbs) {
    cbs = cbs || {};
    _onInteract = cbs.onInteract || null;
    _onDescend = cbs.onDescend || null;
    _onAscend = cbs.onAscend || null;
    _onMapToggle = cbs.onMapToggle || null;
    _onCard = cbs.onCard || null;
    _isBlocked = cbs.isBlocked || function () { return false; };
  }

  // ── Movement action table ──────────────────────────────────────────
  var MOVE_ACTIONS = [
    { action: 'step_forward', rel: 'forward',      hash: 1 },
    { action: 'step_back',    rel: 'back',         hash: 2 },
    { action: 'strafe_left',  rel: 'strafe_left',  hash: 3 },
    { action: 'strafe_right', rel: 'strafe_right', hash: 4 }
  ];

  /**
   * Poll all input. Call once per frame from render loop.
   */
  function poll() {
    if (_isBlocked && _isBlocked()) return;

    var now = performance.now();

    // ── Turns (edge-triggered only, no repeat) ──
    if (InputManager.downEdge('turn_left'))  MC.turnLeft();
    if (InputManager.downEdge('turn_right')) MC.turnRight();

    // ── Movement (edge + held repeat) ──
    for (var i = 0; i < MOVE_ACTIONS.length; i++) {
      var ma = MOVE_ACTIONS[i];
      if (InputManager.downEdge(ma.action)) {
        MC.startRelativeMove(ma.rel);
      } else if (InputManager.isDown(ma.action)) {
        if (MC.checkKeyRepeat(ma.hash, now)) {
          MC.startRelativeMove(ma.rel);
        }
      }
    }

    // Reset repeat when no movement keys are held
    var anyMovementHeld = false;
    for (var j = 0; j < MOVE_ACTIONS.length; j++) {
      if (InputManager.isDown(MOVE_ACTIONS[j].action)) {
        anyMovementHeld = true;
        break;
      }
    }
    if (!anyMovementHeld) MC.resetRepeat();

    // ── Edge-triggered actions ──
    if (InputManager.downEdge('interact') && _onInteract)   _onInteract();
    if (InputManager.downEdge('descend')  && _onDescend)    _onDescend();
    if (InputManager.downEdge('ascend')   && _onAscend)     _onAscend();
    if (InputManager.downEdge('map_toggle') && _onMapToggle) _onMapToggle();

    // ── Card keys ──
    if (_onCard) {
      for (var c = 0; c < 5; c++) {
        if (InputManager.downEdge('card_' + c)) {
          _onCard(c);
        }
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init,
    poll: poll
  };
})();

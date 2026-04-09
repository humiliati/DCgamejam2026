/**
 * HoseReel — "Roll Up Hose" auto-exit that retraces the hose path (PW-4).
 *
 * When the player triggers reel-up (button press, interact menu, or forced
 * by energy exhaustion), this module:
 *   1. Reads the breadcrumb trail from HoseState.getPath()
 *   2. Reverses it into a movement queue
 *   3. Feeds each step into MovementController (turn + move), exactly like
 *      MinimapNav but using a predetermined path instead of BFS
 *   4. Calls HoseState.popLastStep() as each tile is retracted
 *   5. Handles floor transitions mid-reel (stairs up / door exit)
 *   6. On reaching the origin truck tile, calls HoseState.onReeledUp()
 *
 * The player is locked from manual movement during reel. Combat encounters
 * can interrupt the reel (enemy blocks the path → reel pauses, combat
 * resolves, reel resumes or hose snaps on damage).
 *
 * The reel bypasses the MinimapNav distance gate — it's a hose mechanic,
 * not a minimap convenience.
 *
 * Layer 3 — depends on: HoseState, MovementController, FloorTransition (soft),
 *           CombatEngine (soft), Toast (soft), AudioSystem (soft), i18n (soft)
 */
var HoseReel = (function () {
  'use strict';

  var MC = (typeof MovementController !== 'undefined') ? MovementController : null;

  // ── State ──────────────────────────────────────────────────────────
  var _active = false;         // True while reel-in is executing
  var _paused = false;         // True when reel is interrupted (combat, transition)
  var _queue = [];             // Remaining [{x, y, floorId}] steps to retrace
  var _pendingFloorId = null;  // Set when next step crosses a floor boundary
  var _onComplete = null;      // Optional callback when reel finishes
  var _forced = false;         // True if this reel was triggered by energy exhaustion

  // ── Speed tuning ──────────────────────────────────────────────────
  // Reel is faster than walking: 0.5 = 2× speed (160ms/step, 175ms/turn).
  // Smooth enough to read, fast enough that long hose paths don't drag.
  var REEL_SPEED_MULT = 0.5;

  // ── Direction helper ───────────────────────────────────────────────

  function _deltaToDir(dx, dy) {
    if (dx === 1 && dy === 0) return 0;  // EAST
    if (dx === 0 && dy === 1) return 1;  // SOUTH
    if (dx === -1 && dy === 0) return 2; // WEST
    if (dx === 0 && dy === -1) return 3; // NORTH
    return -1;
  }

  // ── Start reel ─────────────────────────────────────────────────────

  /**
   * Begin rolling up the hose.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.forced]    — true if triggered by energy exhaustion
   * @param {Function} [opts.onComplete] — called when reel finishes or fails
   * @returns {boolean} true if reel started, false if preconditions not met
   */
  function start(opts) {
    opts = opts || {};

    if (_active) return false;

    // Must have an active hose with a path to retrace
    if (typeof HoseState === 'undefined' || !HoseState.isActive()) return false;
    var path = HoseState.getPath();
    if (!path || path.length < 2) {
      // Already at origin or path too short — just detach
      HoseState.onReeledUp();
      return true;
    }

    MC = (typeof MovementController !== 'undefined') ? MovementController : null;
    if (!MC) return false;

    // Reverse the path (last step = first move during retrace).
    // Drop the last entry — that's the player's current position.
    var reversed = path.slice(0, path.length - 1).reverse();

    _queue = reversed;
    _active = true;
    _paused = false;
    _forced = opts.forced || false;
    _onComplete = opts.onComplete || null;
    _pendingFloorId = null;

    // Cancel any existing queued movement (MinimapNav, etc.)
    MC.cancelQueued();
    if (typeof MinimapNav !== 'undefined' && MinimapNav.cancel) {
      MinimapNav.cancel();
    }

    // Speed up movement for the reel — smoother and faster than walking
    if (MC.setSpeedOverride) MC.setSpeedOverride(REEL_SPEED_MULT);

    // Toast
    if (typeof Toast !== 'undefined') {
      var msg = _forced
        ? (typeof i18n !== 'undefined' ? i18n.t('toast.hose_forced_reel', 'Out of energy — reeling in!') : 'Out of energy — reeling in!')
        : (typeof i18n !== 'undefined' ? i18n.t('toast.hose_reel', 'Rolling up hose…') : 'Rolling up hose…');
      Toast.show(msg, 'system');
    }

    // TODO:SFX hose-reel-start — mechanical ratchet clunk + water sloshing
    // onset, 400-600ms, volume 0.35-0.45. Conveys "winding mechanism engaged."
    if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      AudioSystem.play('hose-reel-start', { volume: 0.4 });
    }

    // TODO:SFX hose-zipline-loop — persistent looping zipline cable whir
    // while reel is active. High-tension wire hum + fast spool whine,
    // ~2-4s seamless loop, volume 0.25-0.35. Start here, stop in
    // _arrive() and _abort(). Use AudioSystem.loop() or equivalent.
    // The zipline whir IS the reel — it should feel like cable paying
    // out under tension. Layer under hose-reel-step ticks.

    // Start first step
    _advance();
    return true;
  }

  // ── Step execution ─────────────────────────────────────────────────

  /**
   * Advance one step along the reel path.
   * Called on start and then from onMoveFinish after each step completes.
   */
  function _advance() {
    if (!_active || _paused) return;

    // Queue exhausted — we've arrived at the truck
    if (_queue.length === 0) {
      _arrive();
      return;
    }

    // Gate: don't step during transitions or combat
    if (typeof FloorTransition !== 'undefined' && FloorTransition.isTransitioning()) {
      _paused = true;
      return;
    }
    if (typeof CombatEngine !== 'undefined' && CombatEngine.isActive()) {
      _paused = true;
      return;
    }

    var next = _queue[0];
    var pos = MC.getGridPos();

    // ── Floor transition check ──
    // If the next step is on a different floor, we need to handle the
    // transition first. The game.js movement hook fires FloorTransition
    // when the player steps onto a stairs/door tile. We set _pendingFloorId
    // so onFloorTransitionComplete() knows to resume.
    if (typeof FloorManager !== 'undefined') {
      var currentFloor = FloorManager.getCurrentFloorId();
      if (next.floorId !== currentFloor) {
        // The player needs to step onto the transition tile (stairs/door)
        // which should be adjacent. The movement system + game.js will
        // handle the actual floor transition. We mark pending and let
        // the transition complete callback resume us.
        _pendingFloorId = next.floorId;
        // Find the transition tile adjacent to us that leads to next.floorId.
        // In the path, the step just before a floor change IS the transition
        // tile. So we move TO it, then let game.js fire the transition.
        // The current queue entry is already on the new floor, meaning
        // the PREVIOUS step was the transition tile — but we already moved
        // there. Just pause and wait for the transition to complete.
        _paused = true;
        return;
      }
    }

    // Calculate direction from current position to next step
    var dx = next.x - pos.x;
    var dy = next.y - pos.y;
    var dir = _deltaToDir(dx, dy);

    if (dir === -1) {
      // Non-adjacent step — shouldn't happen with breadcrumb path, but
      // can occur if path crosses a floor boundary we missed. Cancel safely.
      _abort('path_discontinuity');
      return;
    }

    // Turn to face the step direction
    var curDir = MC.effRot();
    if (curDir !== dir) {
      MC.startTurn(dir);
    }

    // TODO:SFX hose-reel-step — wet rubber sliding on floor, 100-180ms,
    // volume 0.15-0.25. Plays per tile at 2× walk speed so keep short
    // and low to avoid machine-gun stacking. Subtle water drip layer
    // (50-80ms) randomly overlaid at 30% chance per step.

    // Execute the move
    MC.startMove(dir);

    // Consume the step from our queue AND from HoseState's path
    _queue.shift();
    if (typeof HoseState !== 'undefined') {
      HoseState.popLastStep();
    }
  }

  // ── Arrival ────────────────────────────────────────────────────────

  function _arrive() {
    _active = false;
    _paused = false;
    _queue = [];

    // Restore normal movement speed
    if (MC && MC.setSpeedOverride) MC.setSpeedOverride(1);

    // Tell HoseState the hose is fully retracted
    if (typeof HoseState !== 'undefined') {
      HoseState.onReeledUp();
    }

    // Toast
    if (typeof Toast !== 'undefined') {
      Toast.show(typeof i18n !== 'undefined'
        ? i18n.t('toast.hose_reeled', 'Hose returned to truck.')
        : 'Hose returned to truck.', 'loot');
    }

    // TODO:SFX hose-zipline-loop-stop — stop the zipline cable whir loop
    // here (counterpart to hose-zipline-loop started in start()).

    // TODO:SFX hose-reel-done — satisfying mechanical latch + water cutoff
    // silence, 300-500ms, volume 0.35-0.45. The sudden silence after the
    // drag loop stopping IS part of the sound design — let it breathe.
    if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      AudioSystem.play('hose-reel-done', { volume: 0.4 });
    }

    if (_onComplete) {
      var cb = _onComplete;
      _onComplete = null;
      cb(true);
    }
  }

  function _abort(reason) {
    _active = false;
    _paused = false;
    _queue = [];

    // Restore normal movement speed
    if (MC && MC.setSpeedOverride) MC.setSpeedOverride(1);

    // TODO:SFX hose-zipline-loop-stop — stop the zipline cable whir loop
    // here too (abort path, counterpart to hose-zipline-loop in start()).

    if (typeof Toast !== 'undefined') {
      Toast.show(typeof i18n !== 'undefined'
        ? i18n.t('toast.hose_reel_fail', 'Hose reel interrupted.')
        : 'Hose reel interrupted.', 'error');
    }

    if (_onComplete) {
      var cb = _onComplete;
      _onComplete = null;
      cb(false);
    }
  }

  // ── External hooks (wired by game.js) ──────────────────────────────

  /**
   * Called from MC.onMoveFinish to advance the reel.
   * Game.js wires this alongside MinimapNav.onMoveFinish.
   */
  function onMoveFinish() {
    if (!_active) return;
    if (_paused) return;
    _advance();
  }

  /**
   * Called from MC.onBump — player hit an obstacle during reel.
   * This shouldn't happen (retracing own path), but handle it gracefully.
   */
  function onBump() {
    if (!_active) return;
    _abort('bump');
  }

  /**
   * Called when a floor transition completes.
   * If we were paused waiting for a floor change, resume.
   */
  function onFloorTransitionComplete() {
    if (!_active || !_paused) return;
    _paused = false;
    _pendingFloorId = null;
    _advance();
  }

  /**
   * Called when combat starts. Pause the reel.
   */
  function onCombatStart() {
    if (_active) _paused = true;
  }

  /**
   * Called when combat ends. Resume the reel if hose survived.
   */
  function onCombatEnd() {
    if (!_active || !_paused) return;
    // If hose was cancelled by combat damage, don't resume
    if (typeof HoseState !== 'undefined' && !HoseState.isActive()) {
      _abort('hose_snapped');
      return;
    }
    _paused = false;
    _advance();
  }

  // ── Cancel ─────────────────────────────────────────────────────────

  /**
   * Externally cancel the reel (e.g., player hits a cancel button).
   * Unlike _abort, this doesn't fire an error toast.
   */
  function cancel() {
    if (!_active) return;
    _active = false;
    _paused = false;
    _queue = [];
    // Restore normal movement speed
    if (MC && MC.setSpeedOverride) MC.setSpeedOverride(1);
    if (_onComplete) {
      var cb = _onComplete;
      _onComplete = null;
      cb(false);
    }
  }

  // ── Queries ────────────────────────────────────────────────────────

  function isActive() { return _active; }
  function isPaused() { return _paused; }
  function isForced() { return _forced; }
  function getRemainingSteps() { return _queue.length; }

  // ── Init ───────────────────────────────────────────────────────────

  function init() {
    MC = (typeof MovementController !== 'undefined') ? MovementController : null;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return Object.freeze({
    init:                        init,
    start:                       start,
    cancel:                      cancel,
    isActive:                    isActive,
    isPaused:                    isPaused,
    isForced:                    isForced,
    getRemainingSteps:           getRemainingSteps,
    onMoveFinish:                onMoveFinish,
    onBump:                      onBump,
    onFloorTransitionComplete:   onFloorTransitionComplete,
    onCombatStart:               onCombatStart,
    onCombatEnd:                 onCombatEnd
  });
})();

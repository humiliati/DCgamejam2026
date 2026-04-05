/**
 * HoseState — Persistent dragging-hose state for Pressure Washing (PW-2).
 *
 * When the player grabs a hose from a Cleaning Truck (🧵 interact on hero day),
 * this module tracks their breadcrumb trail, kink count, energy drain, and the
 * survival rules that govern when the hose snaps and falls off the player.
 *
 * This module is PURE DATA. It does not touch the movement controller, does
 * not render, does not emit UI. It is the single source of truth that:
 *   - HoseReel reads (to walk the player backward along the trail)
 *   - HoseOverlay reads (to draw the minimap line + kink dots)
 *   - Spray / brush system reads (pressureMult from kinks)
 *   - Energy system reads (accumulated drain)
 *
 * The game.js movement hook is responsible for calling recordStep() on each
 * MC.onMoveFinish fire. Floor transitions call onFloorEnter() to extend or
 * invalidate the path. Combat damage and bonfire warps call cancel().
 *
 * Survival rules (see PRESSURE_WASHING_ROADMAP §2.3):
 *   ✓ Survives descending into the hose's origin building (e.g., 2.2 from truck at "2")
 *   ✓ Survives sub-floors of that building (2.2 → 2.2.1 → 2.2.2)
 *   ✗ Cancels if player enters a different building (2.2 → 1.1)
 *   ✗ Cancels if player ascends back to exterior without roll-up
 *   ✗ Cancels on combat damage
 *   ✗ Cancels on bonfire warp (fast travel)
 *
 * Energy drain per tile (see PRESSURE_WASHING_ROADMAP §2.4):
 *   drain = BASE_DRAIN + (path.length * LENGTH_PENALTY) + (kinkCount * KINK_PENALTY)
 *
 * Layer 1 (depends on: nothing — pure state module)
 */
var HoseState = (function () {
  'use strict';

  // ── Energy drain constants (roadmap §2.4, rebalance-later) ───
  var BASE_DRAIN     = 1.0;   // energy per tile moved while hose active
  var LENGTH_PENALTY = 0.1;   // * current path length (longer hose drags harder)
  var KINK_PENALTY   = 0.5;   // * kink count (crossed paths compound)

  // ── Pressure model (roadmap §3.2) ────────────────────────────
  var PRESSURE_PER_KINK = 0.7;  // pow(0.7, kinkCount)
  var MAX_PRESSURE = 1.0;       // no kinks = full pressure

  // ── State ────────────────────────────────────────────────────
  var _active = false;
  var _originBuildingId = null;   // "2.2" — which building the truck belongs to
  var _originFloorId = null;      // "2" — exterior floor where truck sits
  var _currentFloorId = null;     // Current floor the player is on
  var _path = [];                 // [{x, y, floorId}, ...] breadcrumb trail
  var _visitedKeys = {};          // "floorId:x,y" → true (for O(1) kink detection)
  var _kinkCount = 0;
  var _energyDrained = 0;         // Accumulated energy cost since attach
  var _lastCancelReason = null;   // String code for debug/UI messaging
  var _enteredSubtree = false;    // True once the player has stepped into the
                                  // origin building subtree at least once. Used
                                  // to enforce the "ascend back to exterior
                                  // without reel-up drops the hose" rule — the
                                  // origin exterior is only a safe floor BEFORE
                                  // the player crosses the threshold.

  // ── Listeners ────────────────────────────────────────────────
  // Other modules subscribe so they know when hose attaches/detaches/kinks.
  var _listeners = {
    attach: [],    // fn(originBuildingId, originFloorId)
    detach: [],    // fn(reason)
    step:   [],    // fn({x, y, floorId}, pathLength)
    kink:   []     // fn(kinkCount, {x, y, floorId})
  };

  function _emit(event, a, b) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](a, b); } catch (e) {
        if (typeof console !== 'undefined') console.warn('[HoseState] listener error on', event, e);
      }
    }
  }

  function on(event, fn) {
    if (_listeners[event]) _listeners[event].push(fn);
  }

  function off(event, fn) {
    var list = _listeners[event];
    if (!list) return;
    var idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  // ── Floor id helpers ─────────────────────────────────────────

  /**
   * Check if a floorId is a descendant (same building subtree) of another.
   * Example: "2.2" is a descendant of "2.2" (itself), "2.2.1", "2.2.3.1"
   * but NOT "2.1", "1.2", "3".
   */
  function _isDescendantBuilding(floorId, buildingId) {
    if (!floorId || !buildingId) return false;
    if (floorId === buildingId) return true;
    // String prefix match + dot boundary ensures "2.2" doesn't match "2.22"
    return floorId.indexOf(buildingId + '.') === 0;
  }

  /**
   * Compute the "building id" for a given floorId from the exterior context.
   * If we're standing on "2" (exterior) and grabbed a truck at door leading to
   * building "2.2", the hose is bound to the subtree starting at "2.2".
   * Callers pass buildingId directly at attach time — this is a helper for
   * validation sites that only have a floorId.
   */
  function getOriginBuildingId() { return _originBuildingId; }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Attach the hose to the player.
   *
   * @param {string} buildingId   — the child building this truck feeds ("2.2")
   * @param {string} exteriorFloorId — the parent exterior where truck lives ("2")
   * @param {string} currentFloorId — player's current floorId at pickup
   * @param {number} startX, startY — player's current grid position
   */
  function attach(buildingId, exteriorFloorId, currentFloorId, startX, startY) {
    if (_active) {
      // Already holding a hose — roadmap doesn't allow double-carry. Caller
      // should check isActive() before offering pickup.
      return false;
    }

    _active = true;
    _originBuildingId = buildingId;
    _originFloorId = exteriorFloorId;
    _currentFloorId = currentFloorId;
    _path = [{ x: startX, y: startY, floorId: currentFloorId }];
    _visitedKeys = {};
    _visitedKeys[currentFloorId + ':' + startX + ',' + startY] = true;
    _kinkCount = 0;
    _energyDrained = 0;
    _lastCancelReason = null;
    // If pickup happened inside the subtree already (edge case — truck spawned
    // on a building interior), latch immediately. Otherwise wait for the first
    // descendant step.
    _enteredSubtree = _isDescendantBuilding(currentFloorId, buildingId);

    _emit('attach', buildingId, exteriorFloorId);
    return true;
  }

  /**
   * Detach the hose. Called by:
   *   - HoseReel on successful roll-up (reason='reeled')
   *   - Combat system on damage taken (reason='combat_damage')
   *   - Bonfire warp handler (reason='bonfire_warp')
   *   - Floor validator when player enters wrong building (reason='wrong_building')
   *   - Exterior ascent without reel (reason='dropped_exterior')
   *   - Energy exhaustion (reason='energy_exhausted')
   */
  function detach(reason) {
    if (!_active) return;
    _active = false;
    _lastCancelReason = reason || 'unknown';
    _emit('detach', _lastCancelReason);
    // Keep _path intact until next attach() call so reel/overlay can finish
    // their retract animations. attach() clears on next pickup.
  }

  /** Convenience alias for the common "snap" outcomes. */
  function cancel(reason) { detach(reason); }

  // ── Movement recording ───────────────────────────────────────

  /**
   * Called by game.js from MC.onMoveFinish whenever the player steps to a
   * new tile while the hose is active. Records the step, detects kinks,
   * accumulates energy drain.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {Object} { kinked: bool, drainThisStep: number }
   */
  function recordStep(x, y, floorId) {
    if (!_active) return { kinked: false, drainThisStep: 0 };

    // Floor change: validate building membership
    if (floorId !== _currentFloorId) {
      _currentFloorId = floorId;
      var inSubtree = _isDescendantBuilding(floorId, _originBuildingId);
      if (!inSubtree && floorId !== _originFloorId) {
        // Player left the valid subtree entirely — hose snaps
        detach('wrong_building');
        return { kinked: false, drainThisStep: 0 };
      }
      if (!inSubtree && floorId === _originFloorId && _enteredSubtree) {
        // Ascended back to the origin exterior after having entered the
        // building subtree — spec §2.3: walking out without roll-up drops it.
        detach('dropped_exterior');
        return { kinked: false, drainThisStep: 0 };
      }
      if (inSubtree) _enteredSubtree = true;
    }

    var key = floorId + ':' + x + ',' + y;
    var kinked = false;
    if (_visitedKeys[key]) {
      _kinkCount++;
      kinked = true;
      _emit('kink', _kinkCount, { x: x, y: y, floorId: floorId });
    } else {
      _visitedKeys[key] = true;
    }

    // Accumulate drain BEFORE pushing the step so length penalty reflects
    // the trail behind the new step, not the one including it.
    var drain = BASE_DRAIN + (_path.length * LENGTH_PENALTY) + (_kinkCount * KINK_PENALTY);
    _energyDrained += drain;

    _path.push({ x: x, y: y, floorId: floorId });
    _emit('step', { x: x, y: y, floorId: floorId }, _path.length);

    return { kinked: kinked, drainThisStep: drain };
  }

  /**
   * Called by game.js on floor transition (before any step records on the new
   * floor). Validates the destination is still in the allowed subtree.
   * Returns true if hose survived, false if it snapped.
   */
  function onFloorEnter(newFloorId) {
    if (!_active) return false;
    _currentFloorId = newFloorId;
    var inSubtree = _isDescendantBuilding(newFloorId, _originBuildingId);
    if (!inSubtree && newFloorId !== _originFloorId) {
      detach('wrong_building');
      return false;
    }
    if (!inSubtree && newFloorId === _originFloorId && _enteredSubtree) {
      // Spec §2.3: ascending back to exterior without reel-up drops the hose.
      detach('dropped_exterior');
      return false;
    }
    if (inSubtree) _enteredSubtree = true;
    return true;
  }

  /**
   * Called when player warps via bonfire or secret exit — hose drops.
   */
  function onBonfireWarp() { detach('bonfire_warp'); }

  /**
   * Called by combat system when player takes damage.
   */
  function onCombatDamage() { detach('combat_damage'); }

  /**
   * Called by HoseReel after successful retract-exit.
   * Clears the path too since the hose is fully returned to the truck.
   */
  function onReeledUp() {
    detach('reeled');
    _path = [];
    _visitedKeys = {};
    _kinkCount = 0;
    _enteredSubtree = false;
  }

  // ── Reel-up support ──────────────────────────────────────────

  /**
   * Pop the most recent path entry (called by HoseReel as it retracts).
   * Returns the popped entry or null if path is empty.
   */
  function popLastStep() {
    if (_path.length === 0) return null;
    var last = _path.pop();
    var key = last.floorId + ':' + last.x + ',' + last.y;
    delete _visitedKeys[key];
    return last;
  }

  // ── Queries ──────────────────────────────────────────────────

  function isActive()         { return _active; }
  function getPath()          { return _path.slice(); }  // defensive copy
  function getPathLength()    { return _path.length; }
  function getKinkCount()     { return _kinkCount; }
  function getEnergyDrained() { return _energyDrained; }
  function getCurrentFloorId(){ return _currentFloorId; }
  function getOriginFloorId() { return _originFloorId; }
  function getLastCancelReason() { return _lastCancelReason; }

  /**
   * Current pressure multiplier for cleaning strength.
   * 0 kinks = 1.0, 1 kink = 0.7, 2 kinks = 0.49, 3 kinks = 0.343, etc.
   */
  function getPressureMult() {
    return Math.pow(PRESSURE_PER_KINK, _kinkCount) * MAX_PRESSURE;
  }

  /**
   * Return a list of tiles on the current floor that are part of the hose
   * trail. Used by HoseOverlay for minimap rendering.
   */
  function getPathOnFloor(floorId) {
    var out = [];
    for (var i = 0; i < _path.length; i++) {
      if (_path[i].floorId === floorId) out.push(_path[i]);
    }
    return out;
  }

  // ── Debug ────────────────────────────────────────────────────

  function debugSnapshot() {
    return {
      active: _active,
      origin: _originBuildingId,
      originFloor: _originFloorId,
      currentFloor: _currentFloorId,
      pathLength: _path.length,
      kinks: _kinkCount,
      energy: _energyDrained,
      pressure: getPressureMult(),
      lastCancel: _lastCancelReason
    };
  }

  /**
   * Hard reset — used by test harness or new-game. Clears everything,
   * does not fire any listeners.
   */
  function reset() {
    _active = false;
    _originBuildingId = null;
    _originFloorId = null;
    _currentFloorId = null;
    _path = [];
    _visitedKeys = {};
    _kinkCount = 0;
    _energyDrained = 0;
    _lastCancelReason = null;
    _enteredSubtree = false;
  }

  // ── Public API ───────────────────────────────────────────────

  return Object.freeze({
    // Constants (exposed for tuning / UI display)
    BASE_DRAIN:     BASE_DRAIN,
    LENGTH_PENALTY: LENGTH_PENALTY,
    KINK_PENALTY:   KINK_PENALTY,

    // Lifecycle
    attach:         attach,
    detach:         detach,
    cancel:         cancel,

    // Movement & events
    recordStep:     recordStep,
    onFloorEnter:   onFloorEnter,
    onBonfireWarp:  onBonfireWarp,
    onCombatDamage: onCombatDamage,
    onReeledUp:     onReeledUp,
    popLastStep:    popLastStep,

    // Queries
    isActive:            isActive,
    getPath:             getPath,
    getPathLength:       getPathLength,
    getKinkCount:        getKinkCount,
    getEnergyDrained:    getEnergyDrained,
    getCurrentFloorId:   getCurrentFloorId,
    getOriginFloorId:    getOriginFloorId,
    getOriginBuildingId: getOriginBuildingId,
    getLastCancelReason: getLastCancelReason,
    getPressureMult:     getPressureMult,
    getPathOnFloor:      getPathOnFloor,

    // Listeners
    on:             on,
    off:            off,

    // Debug / test
    debugSnapshot:  debugSnapshot,
    reset:          reset
  });
})();

/**
 * WorkOrderSystem — Dispatcher contracts with readiness targets.
 *
 * Each work order is a floor-level contract: reach N% readiness before
 * Hero Day. Completing orders earns coins; failing reduces reputation.
 *
 * The Dispatcher posts orders on Day 1 of each hero cycle. The player
 * can inspect active orders via the job board or Dispatcher NPC.
 *
 * Escalation follows the Core Game Loop doc:
 *   Cycle 1 (Days 1–3): 60% target
 *   Cycle 2 (Days 4–6): 65% target
 *   Cycle 3 (Days 7–9): 70% target
 *   Cycle 4 (Days 10–12): 75% target
 *   Cycle 5+ (Day 13+): 80–90% target
 *
 * Layer 1 — depends on: ReadinessCalc (Layer 1)
 */
var WorkOrderSystem = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var BASE_TARGET   = 0.60;   // Starting readiness target
  var ESCALATION    = 0.05;   // Increase per hero cycle
  var MAX_TARGET    = 0.90;   // Cap
  var BASE_PAYOUT   = 50;     // Coins for meeting target
  var BONUS_PER_PCT = 2;      // Extra coins per % above target
  var FAIL_PENALTY  = 0;      // Coin penalty for failure (jam: 0)

  // ── State ───────────────────────────────────────────────────────
  // _orders[floorId] = { target, payout, bonus, status, cycle }
  var _orders = {};
  var _currentCycle = 1;
  var _completedCount = 0;
  var _failedCount = 0;

  /**
   * Post new work orders for a set of floors. Called at start of each
   * hero cycle (or at game start for the first cycle).
   *
   * @param {string[]} floorIds - Dungeon floors to assign orders for
   * @param {number} [cycle] - Hero cycle number (1-based). If omitted, uses internal counter.
   */
  function postOrders(floorIds, cycle) {
    if (cycle !== undefined) _currentCycle = cycle;
    var target = Math.min(MAX_TARGET, BASE_TARGET + (_currentCycle - 1) * ESCALATION);

    for (var i = 0; i < floorIds.length; i++) {
      var floorId = floorIds[i];
      _orders[floorId] = {
        floorId: floorId,
        target:  target,
        payout:  BASE_PAYOUT + (_currentCycle - 1) * 10,
        status:  'active',     // active | complete | failed
        cycle:   _currentCycle
      };
    }
  }

  /**
   * Evaluate all active orders against current readiness.
   * Called on Hero Day (or when the player triggers evaluation).
   *
   * @returns {{ completed: Array, failed: Array, totalPayout: number }}
   */
  function evaluate() {
    var completed = [];
    var failed = [];
    var totalPayout = 0;

    for (var floorId in _orders) {
      if (!_orders.hasOwnProperty(floorId)) continue;
      var order = _orders[floorId];
      if (order.status !== 'active') continue;

      var score = (typeof ReadinessCalc !== 'undefined')
        ? ReadinessCalc.getScore(floorId)
        : 0;

      if (score >= order.target) {
        order.status = 'complete';
        // Bonus for exceeding target
        var overPct = Math.max(0, Math.round((score - order.target) * 100));
        var bonus = overPct * BONUS_PER_PCT;
        var payout = order.payout + bonus;
        order.earnedPayout = payout;
        totalPayout += payout;
        completed.push({ floorId: floorId, score: score, payout: payout, bonus: bonus });
        _completedCount++;
      } else {
        order.status = 'failed';
        order.earnedPayout = 0;
        failed.push({ floorId: floorId, score: score, target: order.target });
        _failedCount++;
      }
    }

    return { completed: completed, failed: failed, totalPayout: totalPayout };
  }

  /**
   * Get the active order for a specific floor (or null).
   */
  function getOrder(floorId) {
    return _orders[floorId] || null;
  }

  /**
   * Get all active orders as an array (for job board display).
   */
  function getActiveOrders() {
    var result = [];
    for (var floorId in _orders) {
      if (_orders.hasOwnProperty(floorId) && _orders[floorId].status === 'active') {
        result.push(_orders[floorId]);
      }
    }
    return result;
  }

  /**
   * Get all orders (any status) for display/history.
   */
  function getAllOrders() {
    var result = [];
    for (var floorId in _orders) {
      if (_orders.hasOwnProperty(floorId)) {
        result.push(_orders[floorId]);
      }
    }
    return result;
  }

  /**
   * Get live readiness vs target for an active order (for HUD progress bar).
   * @param {string} floorId
   * @returns {{ score: number, target: number, percent: number, met: boolean } | null}
   */
  function getProgress(floorId) {
    var order = _orders[floorId];
    if (!order || order.status !== 'active') return null;
    var score = (typeof ReadinessCalc !== 'undefined')
      ? ReadinessCalc.getScore(floorId)
      : 0;
    return {
      score:   score,
      target:  order.target,
      percent: Math.round(score * 100),
      met:     score >= order.target
    };
  }

  /**
   * Advance to the next hero cycle. Clears completed/failed orders.
   */
  function advanceCycle() {
    _currentCycle++;
    // Clear old orders
    for (var floorId in _orders) {
      if (_orders.hasOwnProperty(floorId)) {
        var o = _orders[floorId];
        if (o.status === 'complete' || o.status === 'failed') {
          delete _orders[floorId];
        }
      }
    }
  }

  /**
   * Get current cycle number.
   */
  function getCycle() { return _currentCycle; }

  /**
   * Get lifetime stats.
   */
  function getStats() {
    return {
      cycle:     _currentCycle,
      completed: _completedCount,
      failed:    _failedCount,
      active:    getActiveOrders().length
    };
  }

  /**
   * Reset all state (new game).
   */
  function reset() {
    _orders = {};
    _currentCycle = 1;
    _completedCount = 0;
    _failedCount = 0;
  }

  return Object.freeze({
    postOrders:      postOrders,
    evaluate:        evaluate,
    getOrder:        getOrder,
    getActiveOrders: getActiveOrders,
    getAllOrders:     getAllOrders,
    getProgress:     getProgress,
    advanceCycle:    advanceCycle,
    getCycle:        getCycle,
    getStats:        getStats,
    reset:           reset
  });
})();

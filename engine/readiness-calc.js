/**
 * ReadinessCalc — unified floor readiness score with overhealing.
 *
 * Two-tier model:
 *
 * CORE (0.0–1.0): The mechanics we're confident about. These define
 * whether a floor is "ready" for heroes.
 *   - Crate restocking  (35%)  — CrateSystem.getReadinessByType().crate
 *   - Blood cleaning    (25%)  — CleaningSystem.getReadiness()
 *   - Torch prep        (20%)  — TorchState.getReadiness()
 *   - Trap re-arm       (20%)  — TrapRearm.getReadiness()
 *
 * EXTRA CREDIT (0.0–1.0 bonus, stacks on top of core):
 * Perfectionist work beyond 100%. These are mechanics that aren't fully
 * built yet or represent "above and beyond" completionism.
 *   - Corpse processing / reanimate (30%)
 *   - Cobweb network intact         (15%)
 *   - Overclean bonus (>0.9 clean)  (10%)
 *   - Vermin repopulated            (10%)  — stub
 *   - Puzzle scrambled              (15%)  — stub
 *   - Doors relocked                (10%)  — stub
 *   - Perfect suit-match seals      (10%)  — stub
 *
 * Total readiness range: 0.0–2.0 (displayed as 0%–200%).
 * A realistic good run: 130–160%. A perfectionist: 180–200%.
 *
 * The work-order system uses core score for contract completion.
 * The bonfire warp threshold uses core score.
 * The HUD readiness bar shows the combined (overhealing) score.
 *
 * Layer 1 — depends on: CrateSystem, CleaningSystem, TorchState,
 *           TrapRearm, CobwebSystem (all Layer 1), DungeonSchedule
 *           (same layer, loaded after this one — accessed lazily via
 *           typeof guard only inside the microtask flush, never at init).
 *
 * ── Event bus (DOC-109 Phase 1, 2026-04-17) ───────────────────────
 * Smartwatch debrief-feed HUD needs to re-render when any floor's core
 * readiness changes, and when a hero-day group's aggregate crosses a
 * threshold. Mutation sites call `markDirty(floorId)`; a microtask
 * (`Promise.resolve().then`) batches per-tick dirty floors into a
 * single flush that diffs against `_lastCoreScore` / `_lastGroupScore`
 * and emits `'score-change'` (floorId, prev, next) per changed floor
 * plus `'group-score-change'` (groupId, prev, next) per changed group.
 * `invalidate()` forces re-emit for every scheduled floor + group,
 * used when subsystem data is rebuilt wholesale (save load, new cycle).
 * Listeners register via `on(event, fn)` / unsubscribe via `off`.
 *
 * Wiring to real mutation sites (breakable-spawner, cleaning-system,
 * torch-state, trap-rearm, cobweb-system) is deferred to a later
 * slice — Phase 1 only ships the API surface so the debrief-feed can
 * adopt the subscription model without scattered callsite edits.
 */
var ReadinessCalc = (function () {
  'use strict';

  // ── Core Weights — defaults (must sum to 1.0) ──────────────────
  var C_CRATE = 0.35;
  var C_CLEAN = 0.25;
  var C_TORCH = 0.20;
  var C_TRAP  = 0.20;

  // ── Per-floor / per-depth weight overrides ─────────────────────
  // See DEPTH3_CLEANING_LOOP_BALANCE §1. Each faction's dungeon
  // emphasizes different pillars via weight overrides.
  var _overrides = {};  // { floorId: { crate, clean, torch, trap } }

  // Depth-3 default: Watchmen's poor torch discipline
  _overrides['__depth3'] = Object.freeze({
    crate: 0.40, clean: 0.30, torch: 0.10, trap: 0.20
  });

  /**
   * Set a weight override for a specific floor.
   * @param {string} floorId
   * @param {{ crate: number, clean: number, torch: number, trap: number }} weights
   */
  function setWeightOverride(floorId, weights) {
    _overrides[floorId] = Object.freeze(weights);
  }

  /**
   * Resolve weights for a floor: exact match → depth default → global default.
   * @param {string} floorId
   * @returns {{ crate: number, clean: number, torch: number, trap: number }}
   */
  function _getWeights(floorId) {
    // Exact floor match first
    if (_overrides[floorId]) return _overrides[floorId];
    // Depth-based default (N.N.N = depth 3)
    var depth = floorId ? floorId.split('.').length : 1;
    if (depth >= 3 && _overrides['__depth3']) return _overrides['__depth3'];
    // Global defaults
    return { crate: C_CRATE, clean: C_CLEAN, torch: C_TORCH, trap: C_TRAP };
  }

  // ── Extra Credit Weights (must sum to 1.0) ─────────────────────
  var X_CORPSE    = 0.30;
  var X_COBWEB    = 0.15;
  var X_OVERCLEAN = 0.10;
  var X_VERMIN    = 0.10;  // stub — returns 0 until DailyVermin built
  var X_PUZZLE    = 0.15;  // stub — returns 0 until PuzzleState built
  var X_DOORS     = 0.10;  // stub — returns 0 until DoorState built
  var X_SUIT      = 0.10;  // stub — returns 0 until suit-match tracked

  // ── Snapshot storage (frozen readiness at hero arrival) ─────────
  var _snapshots = {};  // { floorId: { core, extra, total, breakdown } }

  // ── Event-bus state (DOC-109 Phase 1) ──────────────────────────
  // See file-level JSDoc for the debrief-feed subscription model.
  var _listeners         = { 'score-change': [], 'group-score-change': [] };
  var _lastCoreScore     = {};    // { floorId: number } — last emitted core
  var _lastGroupScore    = {};    // { groupId: number } — last emitted mean
  var _pendingDirty      = {};    // { floorId: true }
  var _flushScheduled    = false;
  var _pendingInvalidate = false;

  // ── Score helpers ──────────────────────────────────────────────

  function _torchScore(floorId) {
    if (typeof TorchState !== 'undefined' && TorchState.getReadiness) {
      return TorchState.getReadiness(floorId);
    }
    return 1.0;
  }

  function _trapScore(floorId) {
    if (typeof TrapRearm !== 'undefined' && TrapRearm.getReadiness) {
      return TrapRearm.getReadiness(floorId);
    }
    return 1.0;
  }

  function _crateScores(floorId) {
    if (typeof CrateSystem !== 'undefined' && CrateSystem.getReadinessByType) {
      return CrateSystem.getReadinessByType(floorId);
    }
    return { crate: 1.0, corpse: 1.0 };
  }

  function _cleanScore(floorId) {
    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.getReadiness) {
      return CleaningSystem.getReadiness(floorId);
    }
    return 1.0;
  }

  function _cobwebScore(floorId) {
    if (typeof CobwebSystem !== 'undefined' && CobwebSystem.getIntact) {
      var intactCount = CobwebSystem.getIntact(floorId).length;
      var bonus = Math.min(1.0, intactCount * 0.33); // 3 intact cobwebs = full bonus

      // Penalty: player self-tearing subtracts from cobweb score.
      // Each self-tear deducts 0.25 (so tearing 1 of 3 drops from 1.0 to 0.42,
      // not the 0.66 it would be from just losing the intact count).
      // This makes tearing actively worse than never installing at all.
      var tornCount = CobwebSystem.getPlayerTornCount
        ? CobwebSystem.getPlayerTornCount(floorId) : 0;
      var penalty = tornCount * 0.25;
      return Math.max(0, bonus - penalty);
    }
    return 0;
  }

  // ── Core Score (0.0–1.0) ──────────────────────────────────────

  /**
   * Get the core readiness score (0.0–1.0).
   * This is what bonfire warp and contract completion use.
   */
  function getCoreScore(floorId) {
    var crates = _crateScores(floorId);
    var clean  = _cleanScore(floorId);
    var torch  = _torchScore(floorId);
    var trap   = _trapScore(floorId);
    var w      = _getWeights(floorId);

    return crates.crate * w.crate +
           clean        * w.clean +
           torch        * w.torch +
           trap         * w.trap;
  }

  // ── Extra Credit Score (0.0–1.0) ──────────────────────────────

  /**
   * Get the extra credit score (0.0–1.0).
   * Stacked on top of core for "overhealing".
   */
  function getExtraScore(floorId) {
    var crates  = _crateScores(floorId);
    var clean   = _cleanScore(floorId);
    var cobweb  = _cobwebScore(floorId);

    // Corpse processing (reanimate)
    var corpseScore = crates.corpse;

    // Overclean bonus: if clean > 0.9, scale the excess into 0–1
    var overcleanScore = (clean > 0.9) ? Math.min(1.0, (clean - 0.9) * 10) : 0;

    // Stubs — return 0 until subsystems built
    var verminScore  = 0;
    var puzzleScore  = 0;
    var doorsScore   = 0;
    var suitScore    = 0;

    return corpseScore    * X_CORPSE +
           cobweb         * X_COBWEB +
           overcleanScore * X_OVERCLEAN +
           verminScore    * X_VERMIN +
           puzzleScore    * X_PUZZLE +
           doorsScore     * X_DOORS +
           suitScore      * X_SUIT;
  }

  // ── Combined Score (0.0–2.0) ──────────────────────────────────

  /**
   * Get the full readiness score including overhealing.
   * Range: 0.0 (nothing done) – 2.0 (perfect + all extra credit).
   *
   * @param {string} floorId
   * @returns {number}
   */
  function getScore(floorId) {
    return getCoreScore(floorId) + getExtraScore(floorId);
  }

  /**
   * Get a breakdown of all components for HUD / debug display.
   *
   * @param {string} floorId
   * @returns {{ total: number, core: number, extra: number,
   *             crate: number, clean: number, torch: number, trap: number,
   *             corpse: number, cobweb: number, overclean: number }}
   */
  function getBreakdown(floorId) {
    var crates      = _crateScores(floorId);
    var clean       = _cleanScore(floorId);
    var torch       = _torchScore(floorId);
    var trap        = _trapScore(floorId);
    var cobweb      = _cobwebScore(floorId);
    var overclean   = (clean > 0.9) ? Math.min(1.0, (clean - 0.9) * 10) : 0;
    var corpse      = crates.corpse;

    var w     = _getWeights(floorId);
    var core  = crates.crate * w.crate + clean * w.clean +
                torch * w.torch + trap * w.trap;
    var extra = corpse * X_CORPSE + cobweb * X_COBWEB +
                overclean * X_OVERCLEAN;
    // Stubs add 0

    return {
      total:     core + extra,
      core:      core,
      extra:     extra,
      crate:     crates.crate,
      clean:     clean,
      torch:     torch,
      trap:      trap,
      corpse:    corpse,
      cobweb:    cobweb,
      overclean: overclean
    };
  }

  /**
   * Format readiness as a percentage string for display.
   * @param {string} floorId
   * @returns {string} e.g. "72%" or "142% ★"
   */
  function getPercent(floorId) {
    var score = getScore(floorId);
    var pct = Math.round(score * 100);
    return pct > 100 ? (pct + '% \u2605') : (pct + '%');
  }

  /**
   * Check if a floor meets a target readiness threshold.
   * Uses CORE score only — extra credit doesn't count toward thresholds.
   * @param {string} floorId
   * @param {number} target - 0.0–1.0
   * @returns {boolean}
   */
  function meetsTarget(floorId, target) {
    return getCoreScore(floorId) >= target;
  }

  // ── Snapshots (freeze readiness at hero arrival) ───────────────

  /**
   * Freeze the current readiness state for a floor.
   * Called at hero day dawn before the hero run simulator trashes things.
   * @param {string} floorId
   */
  function snapshotFloor(floorId) {
    var bd = getBreakdown(floorId);
    _snapshots[floorId] = {
      core:      bd.core,
      extra:     bd.extra,
      total:     bd.total,
      breakdown: bd,
      timestamp: Date.now()
    };
  }

  /**
   * Retrieve a previously frozen snapshot.
   * @param {string} floorId
   * @returns {Object|null}
   */
  function getSnapshot(floorId) {
    return _snapshots[floorId] || null;
  }

  /**
   * Clear all snapshots (new cycle).
   */
  function clearSnapshots() {
    _snapshots = {};
  }

  // ── Debug logging ─────────────────────────────────────────────

  /**
   * Log a formatted readiness breakdown to console.
   * Call from browser console: ReadinessCalc.logBreakdown('2.2.1')
   * Or omit floorId to dump the current floor.
   *
   * @param {string} [floorId] — defaults to FloorManager.getFloor()
   */
  function logBreakdown(floorId) {
    if (!floorId && typeof FloorManager !== 'undefined' && FloorManager.getFloor) {
      floorId = FloorManager.getFloor();
    }
    if (!floorId) { console.warn('[ReadinessCalc] No floorId'); return; }

    var bd = getBreakdown(floorId);
    var w  = _getWeights(floorId);

    console.group('%c[ReadinessCalc] Floor ' + floorId +
                  ' — ' + Math.round(bd.total * 100) + '%', 'font-weight:bold');
    console.log('%cCORE  %c' + Math.round(bd.core * 100) + '%',
                'color:#4a9', 'color:#4a9; font-weight:bold');
    console.log('  Crate   ' + (bd.crate  * 100).toFixed(0) + '%  (w=' + w.crate + ')');
    console.log('  Clean   ' + (bd.clean  * 100).toFixed(0) + '%  (w=' + w.clean + ')');
    console.log('  Torch   ' + (bd.torch  * 100).toFixed(0) + '%  (w=' + w.torch + ')');
    console.log('  Trap    ' + (bd.trap   * 100).toFixed(0) + '%  (w=' + w.trap  + ')');
    console.log('%cEXTRA %c' + Math.round(bd.extra * 100) + '%',
                'color:#a94', 'color:#a94; font-weight:bold');
    console.log('  Corpse    ' + (bd.corpse    * 100).toFixed(0) + '%');
    console.log('  Cobweb    ' + (bd.cobweb    * 100).toFixed(0) + '%');
    console.log('  Overclean ' + (bd.overclean * 100).toFixed(0) + '%');
    console.groupEnd();

    return bd;
  }

  // ── Event bus (DOC-109 Phase 1) ────────────────────────────────

  function on(event, fn) {
    if (!_listeners[event] || typeof fn !== 'function') return false;
    _listeners[event].push(fn);
    return true;
  }
  function off(event, fn) {
    if (!_listeners[event]) return false;
    var i = _listeners[event].indexOf(fn);
    if (i !== -1) { _listeners[event].splice(i, 1); return true; }
    return false;
  }
  function _emit(event /*, ...args */) {
    var list = _listeners[event];
    if (!list) return;
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < list.length; i++) {
      try { list[i].apply(null, args); }
      catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ReadinessCalc] ' + event + ' listener threw:', e);
        }
      }
    }
  }

  /**
   * Mark a floor's readiness state dirty. Scheduled mutation sites call
   * this; a microtask-deferred flush recomputes the core score, diffs
   * against cache, and emits 'score-change' (+ any affected group's
   * 'group-score-change'). Multiple markDirty calls in the same tick
   * collapse into a single flush via the `_flushScheduled` guard.
   *
   * @param {string} floorId
   * @returns {boolean} true if scheduled, false on bad input
   */
  function markDirty(floorId) {
    if (typeof floorId !== 'string' || !floorId) return false;
    _pendingDirty[floorId] = true;
    _schedule();
    return true;
  }

  function _schedule() {
    if (_flushScheduled) return;
    _flushScheduled = true;
    Promise.resolve().then(_flush);
  }

  function _flush() {
    _flushScheduled = false;
    var forceAll    = _pendingInvalidate;
    var dirtyFloors = Object.keys(_pendingDirty);
    _pendingDirty = {};
    _pendingInvalidate = false;

    // On invalidate, walk every floor we know about: already-cached
    // floors + every floor listed in the schedule. This guarantees
    // the debrief-feed rebuilds cleanly after a save load.
    if (forceAll) {
      var all = {};
      for (var a = 0; a < dirtyFloors.length; a++) all[dirtyFloors[a]] = true;
      Object.keys(_lastCoreScore).forEach(function (f) { all[f] = true; });
      if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getSchedule) {
        var sched = DungeonSchedule.getSchedule();
        for (var s = 0; s < sched.length; s++) {
          var fids = sched[s].floorIds || [];
          for (var j = 0; j < fids.length; j++) all[fids[j]] = true;
        }
      }
      dirtyFloors = Object.keys(all);
    }

    var changedFloors = {};
    for (var k = 0; k < dirtyFloors.length; k++) {
      var fid  = dirtyFloors[k];
      var next = getCoreScore(fid);
      var had  = _lastCoreScore.hasOwnProperty(fid);
      var prev = had ? _lastCoreScore[fid] : null;
      if (forceAll || !had || prev !== next) {
        _lastCoreScore[fid] = next;
        changedFloors[fid]  = next;
        _emit('score-change', fid, had ? prev : null, next);
      }
    }

    // Group aggregates — recompute only groups whose floors moved
    // (or every group under invalidate).
    if (typeof DungeonSchedule === 'undefined' || !DungeonSchedule.getSchedule) return;
    var schedule = DungeonSchedule.getSchedule();
    for (var m = 0; m < schedule.length; m++) {
      var g = schedule[m];
      var touched = forceAll;
      if (!touched) {
        var gfids = g.floorIds || [];
        for (var n = 0; n < gfids.length; n++) {
          if (changedFloors.hasOwnProperty(gfids[n])) { touched = true; break; }
        }
      }
      if (!touched) continue;
      var gNext = _computeGroupScore(g);
      var gHad  = _lastGroupScore.hasOwnProperty(g.groupId);
      var gPrev = gHad ? _lastGroupScore[g.groupId] : null;
      if (forceAll || !gHad || gPrev !== gNext) {
        _lastGroupScore[g.groupId] = gNext;
        _emit('group-score-change', g.groupId, gHad ? gPrev : null, gNext);
      }
    }
  }

  function _computeGroupScore(group) {
    var fids = group && group.floorIds;
    if (!fids || !fids.length) return 0;
    var sum = 0;
    for (var i = 0; i < fids.length; i++) sum += getCoreScore(fids[i]);
    return sum / fids.length;
  }

  /**
   * Read-through mean of a hero-day group's per-floor core scores.
   * Resolves the group via DungeonSchedule.getSchedule(); returns 0 if
   * the schedule module isn't loaded or the groupId is unknown.
   *
   * @param {string} groupId — 'club' | 'spade' | 'diamond'
   * @returns {number} 0.0–1.0
   */
  function getGroupScore(groupId) {
    if (typeof DungeonSchedule === 'undefined' || !DungeonSchedule.getSchedule) return 0;
    var schedule = DungeonSchedule.getSchedule();
    for (var i = 0; i < schedule.length; i++) {
      if (schedule[i].groupId === groupId) return _computeGroupScore(schedule[i]);
    }
    return 0;
  }

  /**
   * Force a flush that re-emits for every scheduled floor + group,
   * regardless of whether the cached score matches. Use after wholesale
   * data rebuilds (save load, cycle reset).
   */
  function invalidate() {
    _pendingInvalidate = true;
    _schedule();
  }

  return Object.freeze({
    getScore:       getScore,
    getCoreScore:   getCoreScore,
    getExtraScore:  getExtraScore,
    getBreakdown:   getBreakdown,
    getPercent:     getPercent,
    meetsTarget:    meetsTarget,
    snapshotFloor:  snapshotFloor,
    getSnapshot:    getSnapshot,
    clearSnapshots:    clearSnapshots,
    logBreakdown:      logBreakdown,
    setWeightOverride: setWeightOverride,
    getWeights:        _getWeights,
    // Event bus (DOC-109 Phase 1)
    on:             on,
    off:            off,
    markDirty:      markDirty,
    getGroupScore:  getGroupScore,
    invalidate:     invalidate,
    CORE_WEIGHTS: Object.freeze({
      crate: C_CRATE, clean: C_CLEAN, torch: C_TORCH, trap: C_TRAP
    }),
    EXTRA_WEIGHTS: Object.freeze({
      corpse: X_CORPSE, cobweb: X_COBWEB, overclean: X_OVERCLEAN,
      vermin: X_VERMIN, puzzle: X_PUZZLE, doors: X_DOORS, suit: X_SUIT
    })
  });
})();

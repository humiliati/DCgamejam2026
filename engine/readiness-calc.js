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
 *           TrapRearm, CobwebSystem (all Layer 1)
 */
var ReadinessCalc = (function () {
  'use strict';

  // ── Core Weights (must sum to 1.0) ─────────────────────────────
  var C_CRATE = 0.35;
  var C_CLEAN = 0.25;
  var C_TORCH = 0.20;
  var C_TRAP  = 0.20;

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
      var count = CobwebSystem.getIntact(floorId).length;
      return Math.min(1.0, count * 0.33); // 3 intact cobwebs = full bonus
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

    return crates.crate * C_CRATE +
           clean        * C_CLEAN +
           torch        * C_TORCH +
           trap         * C_TRAP;
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

    var core  = crates.crate * C_CRATE + clean * C_CLEAN +
                torch * C_TORCH + trap * C_TRAP;
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

  return Object.freeze({
    getScore:       getScore,
    getCoreScore:   getCoreScore,
    getExtraScore:  getExtraScore,
    getBreakdown:   getBreakdown,
    getPercent:     getPercent,
    meetsTarget:    meetsTarget,
    snapshotFloor:  snapshotFloor,
    getSnapshot:    getSnapshot,
    clearSnapshots: clearSnapshots,
    CORE_WEIGHTS: Object.freeze({
      crate: C_CRATE, clean: C_CLEAN, torch: C_TORCH, trap: C_TRAP
    }),
    EXTRA_WEIGHTS: Object.freeze({
      corpse: X_CORPSE, cobweb: X_COBWEB, overclean: X_OVERCLEAN,
      vermin: X_VERMIN, puzzle: X_PUZZLE, doors: X_DOORS, suit: X_SUIT
    })
  });
})();

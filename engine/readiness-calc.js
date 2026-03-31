/**
 * ReadinessCalc — unified floor readiness score.
 *
 * Combines per-system readiness into a single 0.0–1.0 score:
 *   - Crate restocking  (40%)  — CrateSystem.getReadinessByType().crate
 *   - Corpse processing (20%)  — CrateSystem.getReadinessByType().corpse
 *   - Blood cleaning    (30%)  — CleaningSystem.getReadiness()
 *   - Miscellaneous     (10%)  — reserved for traps/puzzles (returns 1.0 for now)
 *
 * The work-order system will use this to evaluate contract completion.
 * The HUD can query it for a live progress bar.
 *
 * Layer 1 — depends on: CrateSystem, CleaningSystem (both Layer 1)
 */
var ReadinessCalc = (function () {
  'use strict';

  // ── Weights (must sum to 1.0) ──────────────────────────────────
  var W_CRATE   = 0.40;
  var W_CORPSE  = 0.20;
  var W_CLEAN   = 0.30;
  var W_MISC    = 0.10;

  /**
   * Get the unified readiness score for a floor.
   *
   * @param {string} floorId - Floor identifier
   * @returns {number} 0.0 (nothing done) – 1.0 (floor fully prepped)
   */
  function getScore(floorId) {
    var crateScore  = 1.0;
    var corpseScore = 1.0;
    var cleanScore  = 1.0;
    var miscScore   = 1.0;  // Placeholder — traps/puzzles not yet tracked

    if (typeof CrateSystem !== 'undefined' && CrateSystem.getReadinessByType) {
      var byType = CrateSystem.getReadinessByType(floorId);
      crateScore  = byType.crate;
      corpseScore = byType.corpse;
    }

    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.getReadiness) {
      cleanScore = CleaningSystem.getReadiness(floorId);
    }

    return crateScore  * W_CRATE +
           corpseScore * W_CORPSE +
           cleanScore  * W_CLEAN +
           miscScore   * W_MISC;
  }

  /**
   * Get a breakdown of each component for HUD / debug display.
   *
   * @param {string} floorId
   * @returns {{ total: number, crate: number, corpse: number, clean: number, misc: number }}
   */
  function getBreakdown(floorId) {
    var crateScore  = 1.0;
    var corpseScore = 1.0;
    var cleanScore  = 1.0;
    var miscScore   = 1.0;

    if (typeof CrateSystem !== 'undefined' && CrateSystem.getReadinessByType) {
      var byType = CrateSystem.getReadinessByType(floorId);
      crateScore  = byType.crate;
      corpseScore = byType.corpse;
    }

    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.getReadiness) {
      cleanScore = CleaningSystem.getReadiness(floorId);
    }

    return {
      total:  crateScore * W_CRATE + corpseScore * W_CORPSE + cleanScore * W_CLEAN + miscScore * W_MISC,
      crate:  crateScore,
      corpse: corpseScore,
      clean:  cleanScore,
      misc:   miscScore
    };
  }

  /**
   * Format readiness as a percentage string for display.
   * @param {string} floorId
   * @returns {string} e.g. "72%"
   */
  function getPercent(floorId) {
    return Math.round(getScore(floorId) * 100) + '%';
  }

  /**
   * Check if a floor meets a target readiness threshold.
   * @param {string} floorId
   * @param {number} target - 0.0–1.0
   * @returns {boolean}
   */
  function meetsTarget(floorId, target) {
    return getScore(floorId) >= target;
  }

  return Object.freeze({
    getScore:     getScore,
    getBreakdown: getBreakdown,
    getPercent:   getPercent,
    meetsTarget:  meetsTarget,
    WEIGHTS: Object.freeze({ crate: W_CRATE, corpse: W_CORPSE, clean: W_CLEAN, misc: W_MISC })
  });
})();

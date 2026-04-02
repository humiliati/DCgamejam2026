/**
 * ReadinessCalc — unified floor readiness score.
 *
 * Combines per-system readiness into a single 0.0–1.0 score:
 *   - Crate restocking  (30%)  — CrateSystem.getReadinessByType().crate
 *   - Corpse processing (15%)  — CrateSystem.getReadinessByType().corpse
 *   - Blood cleaning    (25%)  — CleaningSystem.getReadiness()
 *   - Torch prep        (20%)  — TorchState.getReadiness()
 *   - Miscellaneous     (10%)  — traps/puzzles/cobwebs
 *
 * The work-order system will use this to evaluate contract completion.
 * The HUD can query it for a live progress bar.
 *
 * Layer 1 — depends on: CrateSystem, CleaningSystem, TorchState (all Layer 1)
 */
var ReadinessCalc = (function () {
  'use strict';

  // ── Weights (must sum to 1.0) ──────────────────────────────────
  var W_CRATE   = 0.30;
  var W_CORPSE  = 0.15;
  var W_CLEAN   = 0.25;
  var W_TORCH   = 0.20;
  var W_MISC    = 0.10;

  /**
   * Get torch readiness score, guarded against missing module.
   */
  function _torchScore(floorId) {
    if (typeof TorchState !== 'undefined' && TorchState.getReadiness) {
      return TorchState.getReadiness(floorId);
    }
    return 1.0; // No torch system → fully ready (no torches to prep)
  }

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
    var torchScore  = _torchScore(floorId);
    var miscScore   = 1.0;

    if (typeof CrateSystem !== 'undefined' && CrateSystem.getReadinessByType) {
      var byType = CrateSystem.getReadinessByType(floorId);
      crateScore  = byType.crate;
      corpseScore = byType.corpse;
    }

    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.getReadiness) {
      cleanScore = CleaningSystem.getReadiness(floorId);
    }

    // C7: Trap re-arm readiness + cobweb bonus (misc weight)
    var trapReady = 1.0;
    var cobwebBonus = 0;
    if (typeof TrapRearm !== 'undefined') {
      trapReady = TrapRearm.getReadiness(floorId);
    }
    if (typeof CobwebSystem !== 'undefined') {
      // Cobweb bonus: each intact cobweb adds up to 0.15 (capped) to misc
      var cobCount = CobwebSystem.getIntact(floorId).length;
      cobwebBonus = Math.min(0.15, cobCount * 0.05);
    }
    miscScore = Math.min(1.0, trapReady + cobwebBonus);

    return crateScore  * W_CRATE +
           corpseScore * W_CORPSE +
           cleanScore  * W_CLEAN +
           torchScore  * W_TORCH +
           miscScore   * W_MISC;
  }

  /**
   * Get a breakdown of each component for HUD / debug display.
   *
   * @param {string} floorId
   * @returns {{ total: number, crate: number, corpse: number, clean: number, torch: number, misc: number }}
   */
  function getBreakdown(floorId) {
    var crateScore  = 1.0;
    var corpseScore = 1.0;
    var cleanScore  = 1.0;
    var torchScore  = _torchScore(floorId);
    var miscScore   = 1.0;

    if (typeof CrateSystem !== 'undefined' && CrateSystem.getReadinessByType) {
      var byType = CrateSystem.getReadinessByType(floorId);
      crateScore  = byType.crate;
      corpseScore = byType.corpse;
    }

    if (typeof CleaningSystem !== 'undefined' && CleaningSystem.getReadiness) {
      cleanScore = CleaningSystem.getReadiness(floorId);
    }

    // C7: Trap re-arm readiness + cobweb bonus (misc weight)
    var trapReady = 1.0;
    var cobwebBonus = 0;
    if (typeof TrapRearm !== 'undefined') {
      trapReady = TrapRearm.getReadiness(floorId);
    }
    if (typeof CobwebSystem !== 'undefined') {
      var cobCount = CobwebSystem.getIntact(floorId).length;
      cobwebBonus = Math.min(0.15, cobCount * 0.05);
    }
    miscScore = Math.min(1.0, trapReady + cobwebBonus);

    return {
      total:  crateScore * W_CRATE + corpseScore * W_CORPSE + cleanScore * W_CLEAN + torchScore * W_TORCH + miscScore * W_MISC,
      crate:  crateScore,
      corpse: corpseScore,
      clean:  cleanScore,
      torch:  torchScore,
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
    WEIGHTS: Object.freeze({ crate: W_CRATE, corpse: W_CORPSE, clean: W_CLEAN, torch: W_TORCH, misc: W_MISC })
  });
})();

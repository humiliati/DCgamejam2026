/**
 * SessionStats — accumulates gameplay statistics for end screens.
 *
 * Layer 1 (zero deps beyond basic JS). Tracks floors, combat, items,
 * and timing for the game-over and victory stat summaries.
 */
var SessionStats = (function () {
  'use strict';

  var _stats = {};

  function reset() {
    _stats = {
      // ── Exploration ──
      floorsExplored: 0,

      // ── Combat ──
      enemiesDefeated: 0,
      roundsFought: 0,
      cardsPlayed: 0,
      damageTaken: 0,
      damageDealt: 0,
      timesFled: 0,

      // ── Containers & restock ──
      chestsOpened: 0,
      slotsFilled: 0,          // Any container slot filled (crate/corpse/torch)
      containersSealed: 0,     // Crate or corpse sealed
      cratesSealed: 0,         // Legacy key (quick-fill.js uses this)

      // ── Torch & spray ──
      torchesExtinguished: 0,
      torchSlotsFilled: 0,

      // ── Cleaning / janitor loop ──
      tilesCleaned: 0,
      cobwebsInstalled: 0,
      cobwebsTorn: 0,
      trapsRearmed: 0,
      breakablesBroken: 0,
      detritusCollected: 0,

      // ── Harvest & corpses ──
      partsHarvested: 0,

      // ── Economy ──
      cardsBought: 0,
      itemsCollected: 0,
      itemsUsed: 0,

      // ── Equipment ──
      hosesGrabbed: 0,

      // ── Environment ──
      hazardsTriggered: 0,
      environmentalDeaths: 0,
      bonfiresUsed: 0,

      // ── Timing ──
      timeElapsed: 0,
      startTime: performance.now()
    };
  }

  function inc(key, amount) {
    if (_stats[key] !== undefined) {
      _stats[key] += (amount || 1);
    }
  }

  function get() {
    // Finalize elapsed time on read
    _stats.timeElapsed = performance.now() - (_stats.startTime || performance.now());
    return _stats;
  }

  // Initialize on load
  reset();

  return {
    reset: reset,
    inc: inc,
    get: get
  };
})();

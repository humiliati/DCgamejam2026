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
      floorsExplored: 0,
      enemiesDefeated: 0,
      roundsFought: 0,
      cardsPlayed: 0,
      chestsOpened: 0,
      damageTaken: 0,
      damageDealt: 0,
      itemsUsed: 0,
      timesFled: 0,
      hazardsTriggered: 0,
      environmentalDeaths: 0,
      bonfiresUsed: 0,
      torchesExtinguished: 0,
      torchSlotsFilled: 0,
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

/**
 * SynergyEngine — stub for card combo system.
 * Will be extracted from EyesOnly during jam (Pass 6).
 */
var SynergyEngine = (function () {
  'use strict';
  // Stub — returns no synergies until extracted
  function checkSynergies(hand, lastPlayed) { return []; }
  function applySynergy(synergy, player, enemy) { return null; }
  return { checkSynergies: checkSynergies, applySynergy: applySynergy };
})();

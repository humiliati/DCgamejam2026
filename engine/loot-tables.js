/**
 * LootTables — stub for procedural loot generation.
 * Will be extracted from EyesOnly's LootTableManager in Pass 6.
 */
var LootTables = (function () {
  'use strict';

  function generateDrop(enemyTier, floorNum) {
    // Simple stub: chance to drop a card
    if (SeededRNG.random() < 0.4) {
      return { type: 'card', card: SeededRNG.pick(CardSystem.getAllCards()) };
    }
    return { type: 'currency', amount: SeededRNG.randInt(1, 3 + floorNum) };
  }

  return { generateDrop: generateDrop };
})();

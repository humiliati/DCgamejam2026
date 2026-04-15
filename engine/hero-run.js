var HeroRun = (function() {
  'use strict';

  // Hero type profiles: success rates and metadata
  var HERO_PROFILES = {
    Seeker: {
      smashRate: 0.80,
      lootRate: 0.60,
      trapTriggerRate: 0.90,
      puzzleSolveRate: 0.30,
      killRate: 0.95,
      emoji: '⚔️'
    },
    Scholar: {
      smashRate: 0.30,
      lootRate: 0.80,
      trapTriggerRate: 0.20,
      puzzleSolveRate: 0.95,
      killRate: 0.50,
      emoji: '📖'
    },
    Shadow: {
      smashRate: 0.20,
      lootRate: 0.90,
      trapTriggerRate: 0.10,
      puzzleSolveRate: 0.40,
      killRate: 0.40,
      emoji: '🗡️'
    },
    Crusader: {
      smashRate: 0.65,
      lootRate: 0.40,
      trapTriggerRate: 0.85,
      puzzleSolveRate: 0.15,
      killRate: 0.90,
      emoji: '🛡️'
    }
  };

  // Card suits for random drops
  var CARD_SUITS = ['♠', '♣', '♦', '♥'];

  // Card rarities: 60% common, 30% uncommon, 10% rare
  var CARD_RARITIES = ['common', 'common', 'common', 'common', 'common', 'common', 'uncommon', 'uncommon', 'uncommon', 'rare'];

  /**
   * Get a random value using SeededRNG if available, otherwise Math.random
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (inclusive)
   * @returns {number} Random value
   */
  function random(min, max) {
    // M1: SeededRNG is guaranteed present (Layer 0). No Math.random fallback.
    return min + (SeededRNG.random() * (max - min));
  }

  /**
   * Determine which hero type runs on a given day
   * Cycles: Seeker -> Scholar -> Shadow -> Crusader every 3 days
   * @param {number} day - Day number
   * @returns {string} Hero type
   */
  function getHeroForDay(day) {
    var heroTypes = ['Seeker', 'Scholar', 'Shadow', 'Crusader'];
    var index = Math.floor(day / 3) % heroTypes.length;
    return heroTypes[index];
  }

  /**
   * Get the emoji for a hero type
   * @param {string} heroType - 'Seeker'|'Scholar'|'Shadow'|'Crusader'
   * @returns {string} Emoji
   */
  function getHeroEmoji(heroType) {
    var profile = HERO_PROFILES[heroType];
    return profile ? profile.emoji : '?';
  }

  /**
   * Determine result tier and payout multiplier based on readiness
   * @param {number} readiness - Readiness percentage (0-100)
   * @returns {object} { result, payoutMultiplier, rates }
   */
  function getResultTier(readiness) {
    if (readiness < 40) {
      return {
        result: 'retreated',
        payoutMultiplier: 0,
        rateMultiplier: 0.3  // Hero still smashes some stuff while fleeing
      };
    }
    if (readiness < 60) {
      return {
        result: 'struggled',
        payoutMultiplier: 0.5,
        rateMultiplier: 1.0
      };
    }
    if (readiness < 80) {
      return {
        result: 'cleared',
        payoutMultiplier: 1.0,
        rateMultiplier: 1.0
      };
    }
    if (readiness < 90) {
      return {
        result: 'clean',
        payoutMultiplier: 1.5,
        rateMultiplier: 1.0
      };
    }
    // readiness >= 90
    return {
      result: 'perfect',
      payoutMultiplier: 2.0,
      rateMultiplier: 1.0
    };
  }

  /**
   * Calculate carnage for a single floor
   * @param {object} floor - Floor data { floorId, name, readiness, crateCount, enemyCount, trapCount, puzzleCount }
   * @param {object} heroProfile - Hero profile object
   * @param {object} resultTier - Result tier data
   * @returns {object} Carnage counts
   */
  function calculateCarnage(floor, heroProfile, resultTier) {
    var rateMultiplier = resultTier.rateMultiplier;

    // Apply random variance (50-100% of expected)
    var cratesSmashed = Math.floor(floor.crateCount * heroProfile.smashRate * rateMultiplier * random(0.7, 1.0));
    var monstersSlain = Math.floor(floor.enemyCount * heroProfile.killRate * rateMultiplier * random(0.6, 1.0));
    var trapsTriggered = Math.floor(floor.trapCount * heroProfile.trapTriggerRate * rateMultiplier * random(0.5, 1.0));
    var puzzlesSolved = Math.floor(floor.puzzleCount * heroProfile.puzzleSolveRate * rateMultiplier * random(0.4, 1.0));

    return {
      cratesSmashed: cratesSmashed,
      monstersSlain: monstersSlain,
      trapsTriggered: trapsTriggered,
      puzzlesSolved: puzzlesSolved
    };
  }

  /**
   * Calculate payout for a single floor
   * @param {number} readiness - Readiness percentage
   * @param {number} payoutMultiplier - Multiplier based on result tier
   * @returns {number} Payout in coins
   */
  function calculatePayout(readiness, payoutMultiplier) {
    var basePayout = 10 + (readiness * 0.3);
    return Math.round(basePayout * payoutMultiplier);
  }

  /**
   * Attempt to drop a card based on result tier
   * @param {string} result - Result tier string
   * @returns {object|null} Card object or null
   */
  function rollCardDrop(result) {
    var dropChance;

    if (result === 'perfect') {
      dropChance = 1.0;
    } else if (result === 'clean') {
      dropChance = 0.5;
    } else if (result === 'cleared') {
      dropChance = 0.2;
    } else {
      // struggled or retreated
      return null;
    }

    if (random(0, 1) > dropChance) {
      return null;
    }

    // Roll rarity
    var rarityIndex = Math.floor(random(0, CARD_RARITIES.length));
    var rarity = CARD_RARITIES[rarityIndex];

    // Roll suit
    var suitIndex = Math.floor(random(0, CARD_SUITS.length));
    var suit = CARD_SUITS[suitIndex];

    return {
      name: 'Hero\'s Spoils',
      suit: suit,
      rarity: rarity
    };
  }

  /**
   * Execute a hero run across all floors
   * @param {string} heroType - 'Seeker'|'Scholar'|'Shadow'|'Crusader'
   * @param {array} floors - Array of floor data objects
   * @param {number} currentDay - Current day number (for context)
   * @returns {object} Report object matching MailboxPeek schema
   */
  function executeRun(heroType, floors, currentDay) {
    currentDay = currentDay || 0;

    var heroProfile = HERO_PROFILES[heroType];
    if (!heroProfile) {
      throw new Error('Unknown hero type: ' + heroType);
    }

    var floorReports = [];
    var totalPayout = 0;
    var allFloorsReadyForChain = true;
    var cardDrops = [];

    // Process each floor
    for (var i = 0; i < floors.length; i++) {
      var floor = floors[i];
      var resultTier = getResultTier(floor.readiness);

      // Check chain bonus eligibility
      if (floor.readiness < 60) {
        allFloorsReadyForChain = false;
      }

      // Calculate carnage
      var carnage = calculateCarnage(floor, heroProfile, resultTier);

      // Calculate payout
      var payout = calculatePayout(floor.readiness, resultTier.payoutMultiplier);
      totalPayout += payout;

      // Attempt card drop
      var cardDrop = rollCardDrop(resultTier.result);
      if (cardDrop) {
        cardDrops.push(cardDrop);
      }

      // Build floor report
      floorReports.push({
        floorId: floor.floorId,
        name: floor.name,
        readiness: floor.readiness,
        payout: payout,
        cratesSmashed: carnage.cratesSmashed,
        monstersSlain: carnage.monstersSlain,
        trapsTriggered: carnage.trapsTriggered,
        puzzlesSolved: carnage.puzzlesSolved,
        result: resultTier.result
      });
    }

    // Apply chain bonus if all floors ready
    var chainBonus = false;
    if (allFloorsReadyForChain && floorReports.length > 0) {
      chainBonus = true;
      totalPayout = Math.round(totalPayout * 1.5);
    }

    // Build final report
    var report = {
      day: currentDay,
      heroType: heroType,
      heroEmoji: getHeroEmoji(heroType),
      floors: floorReports,
      totalPayout: totalPayout,
      chainBonus: chainBonus,
      cardDrop: cardDrops.length > 0 ? cardDrops[0] : null,
      isDeathReport: false,
      rescueText: null
    };

    return report;
  }

  // Public API
  return Object.freeze({
    executeRun: executeRun,
    getHeroForDay: getHeroForDay,
    getHeroEmoji: getHeroEmoji,
    HERO_PROFILES: Object.freeze(HERO_PROFILES)
  });
})();

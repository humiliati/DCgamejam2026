/**
 * SynergyEngine — suit-based RPS combat synergy system.
 *
 * Core triangle:  ♣ Clubs > ♦ Diamonds > ♠ Spades > ♣ Clubs
 *   - ♣ (Wild/Force) disrupts ♦ (Crystal/Precision)
 *   - ♦ (Crystal/Precision) cuts through ♠ (Earth/Steel)
 *   - ♠ (Earth/Steel) crushes ♣ (Wild/Force)
 *
 * Fourth suit:  ♥ Hearts (Life/Blood/Bond)
 *   - Outside the triangle — no direct advantage or disadvantage
 *   - Rule-breaker: strong vs status effects, weak vs burst damage
 *   - Cards cost HP (blood sacrifice), high risk / high reward
 *
 * Advantage multiplier: ×1.5 damage when attacking with suit advantage.
 * Disadvantage: ×0.75 damage when attacking at disadvantage.
 * Neutral / same suit / ♥ involved: ×1.0 (no modifier).
 *
 * Resource color mapping (from EyesOnly RESOURCE_COLOR_SYSTEM):
 *   ♠ Spade  = free cost      (no resource color — basic/grounded)
 *   ♣ Club   = energy cost    #00D4FF (Electric Blue)
 *   ♦ Diamond = battery cost  #00FFA6 (Toxic Green)
 *   ♥ Heart  = HP cost        #FF6B9D (Vibrant Pink)
 *
 * Layer 2 — depends on: CardStack (stack data), CombatEngine (enemy)
 */
var SynergyEngine = (function () {
  'use strict';

  // ── Suit constants ──────────────────────────────────────────────
  var SPADE   = 'spade';
  var CLUB    = 'club';
  var DIAMOND = 'diamond';
  var HEART   = 'heart';

  // ── Suit symbols (for UI display) ──────────────────────────────
  var SUIT_SYMBOLS = {
    spade:   '♠',
    club:    '♣',
    diamond: '♦',
    heart:   '♥'
  };

  // ── Suit display names ─────────────────────────────────────────
  var SUIT_NAMES = {
    spade:   'Earth',
    club:    'Wild',
    diamond: 'Crystal',
    heart:   'Life'
  };

  // ── Resource colors (EyesOnly canon) ───────────────────────────
  var SUIT_COLORS = {
    spade:   null,        // Free cost — no resource color (use border default)
    club:    '#00D4FF',   // Energy — Electric Blue
    diamond: '#00FFA6',   // Battery — Toxic Green
    heart:   '#FF6B9D'    // HP — Vibrant Pink
  };

  // ── RPS advantage table ────────────────────────────────────────
  // BEATS[attacker] = defender suit that attacker beats
  var BEATS = {};
  BEATS[CLUB]    = DIAMOND;  // ♣ > ♦
  BEATS[DIAMOND] = SPADE;    // ♦ > ♠
  BEATS[SPADE]   = CLUB;     // ♠ > ♣
  // ♥ has no direct advantage

  // ── Multiplier constants ───────────────────────────────────────
  var ADV_MULT   = 1.5;    // Advantage damage multiplier
  var DISADV_MULT = 0.75;  // Disadvantage damage multiplier

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Get the suit advantage multiplier for an attacker suit vs defender suit.
   *
   * @param {string} attackerSuit - 'spade', 'club', 'diamond', 'heart'
   * @param {string} defenderSuit - 'spade', 'club', 'diamond', 'heart'
   * @returns {number} Damage multiplier (1.5, 1.0, or 0.75)
   */
  function getAdvantage(attackerSuit, defenderSuit) {
    if (!attackerSuit || !defenderSuit) return 1.0;
    if (attackerSuit === defenderSuit) return 1.0;

    // ♥ Heart is outside the triangle — always neutral
    if (attackerSuit === HEART || defenderSuit === HEART) return 1.0;

    // Check if attacker has advantage
    if (BEATS[attackerSuit] === defenderSuit) return ADV_MULT;

    // Check if attacker is at disadvantage
    if (BEATS[defenderSuit] === attackerSuit) return DISADV_MULT;

    // Shouldn't reach here with 3-suit triangle, but safety
    return 1.0;
  }

  /**
   * Get the dominant suit from a stack of cards.
   * Returns the most common suit, or the first card's suit on ties.
   *
   * @param {Array} cards - Array of card objects with .suit
   * @returns {string|null} Dominant suit or null if empty
   */
  function getDominantSuit(cards) {
    if (!cards || cards.length === 0) return null;

    var counts = {};
    for (var i = 0; i < cards.length; i++) {
      var s = cards[i].suit || SPADE;
      counts[s] = (counts[s] || 0) + 1;
    }

    var best = null;
    var bestCount = 0;
    for (var suit in counts) {
      if (counts[suit] > bestCount) {
        bestCount = counts[suit];
        best = suit;
      }
    }
    return best;
  }

  /**
   * Compute the suit advantage multiplier for a stack vs an enemy.
   * Uses the dominant suit of the player's stack against the enemy's suit.
   *
   * @param {Array} stackCards - Player's card stack
   * @param {Object} enemy - Enemy object with .suit field
   * @returns {{ multiplier: number, attackerSuit: string, defenderSuit: string, label: string }}
   */
  function computeStackAdvantage(stackCards, enemy) {
    var aSuit = getDominantSuit(stackCards);
    var dSuit = enemy ? (enemy.suit || SPADE) : SPADE;
    var mult = getAdvantage(aSuit, dSuit);

    var label = '';
    if (mult > 1.0) {
      label = SUIT_SYMBOLS[aSuit] + '>' + SUIT_SYMBOLS[dSuit] + ' +50%';
    } else if (mult < 1.0) {
      label = SUIT_SYMBOLS[aSuit] + '<' + SUIT_SYMBOLS[dSuit] + ' -25%';
    }

    return {
      multiplier: mult,
      attackerSuit: aSuit,
      defenderSuit: dSuit,
      label: label
    };
  }

  /**
   * Check if stacking same-suit cards together gives a synergy bonus.
   * Mono-suit stacks get an additional flat damage bonus.
   *
   * @param {Array} cards - Cards in the stack
   * @returns {{ monoSuit: boolean, suit: string|null, bonus: number }}
   */
  function checkMonoSuitBonus(cards) {
    if (!cards || cards.length < 2) return { monoSuit: false, suit: null, bonus: 0 };

    var firstSuit = cards[0].suit;
    for (var i = 1; i < cards.length; i++) {
      if (cards[i].suit !== firstSuit) {
        return { monoSuit: false, suit: null, bonus: 0 };
      }
    }

    // Mono-suit bonus: +1 per card beyond the first
    return {
      monoSuit: true,
      suit: firstSuit,
      bonus: cards.length - 1
    };
  }

  /**
   * Get the suit symbol character for display.
   * @param {string} suit
   * @returns {string} Unicode suit symbol
   */
  function getSymbol(suit) {
    return SUIT_SYMBOLS[suit] || '?';
  }

  /**
   * Get the resource color for a suit.
   * @param {string} suit
   * @returns {string|null} Hex color or null (for spade/free)
   */
  function getColor(suit) {
    return SUIT_COLORS[suit] || null;
  }

  /**
   * Get the display name for a suit.
   * @param {string} suit
   * @returns {string}
   */
  function getName(suit) {
    return SUIT_NAMES[suit] || 'Unknown';
  }

  // ── Legacy compat stubs ─────────────────────────────────────────
  function checkSynergies(hand, lastPlayed) { return []; }
  function applySynergy(synergy, player, enemy) { return null; }

  return {
    // Core RPS
    getAdvantage: getAdvantage,
    getDominantSuit: getDominantSuit,
    computeStackAdvantage: computeStackAdvantage,
    checkMonoSuitBonus: checkMonoSuitBonus,

    // Display helpers
    getSymbol: getSymbol,
    getColor: getColor,
    getName: getName,

    // Constants
    SPADE: SPADE,
    CLUB: CLUB,
    DIAMOND: DIAMOND,
    HEART: HEART,
    SUIT_SYMBOLS: SUIT_SYMBOLS,
    SUIT_COLORS: SUIT_COLORS,
    ADV_MULT: ADV_MULT,
    DISADV_MULT: DISADV_MULT,

    // Legacy compat
    checkSynergies: checkSynergies,
    applySynergy: applySynergy
  };
})();

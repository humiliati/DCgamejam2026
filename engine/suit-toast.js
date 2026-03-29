/**
 * SuitToast — suit advantage visual feedback overlay.
 *
 * Fires a centered Toast when a stack resolves with suit advantage
 * or disadvantage. Shows the RPS relationship and multiplier:
 *
 *   "♣ > ♦  +50%!"   (advantage — gold/yellow accent)
 *   "♠ < ♣  -25%"    (disadvantage — red accent)
 *
 * Also fires a smaller corner toast with the mono-suit bonus if
 * the player stacked all same-suit cards.
 *
 * Layer 2 — depends on: Toast, SynergyEngine
 */
var SuitToast = (function () {
  'use strict';

  // ── Icons per suit (used as toast icon) ─────────────────────────
  var SUIT_ICON = {
    spade:   '♠',
    club:    '♣',
    diamond: '♦',
    heart:   '♥'
  };

  /**
   * Show suit advantage feedback after stack resolution.
   *
   * Called from CombatBridge.fireStack() with the resolution result.
   *
   * @param {Object} result - From CombatEngine.fireStack()
   *   { suitMult, suitLabel, ... }
   * @param {Array}  stackCards - Cards that were in the player's stack
   */
  function show(result, stackCards) {
    if (typeof Toast === 'undefined') return;
    if (typeof SynergyEngine === 'undefined') return;

    // ── Suit advantage / disadvantage centered toast ──
    if (result.suitMult && result.suitMult !== 1.0) {
      var isAdv = result.suitMult > 1.0;
      var label = result.suitLabel || '';

      // Build display text:  "♣ > ♦  +50%!"  or  "♠ < ♣  -25%"
      var text = label;
      if (!text) {
        // Fallback: build from multiplier
        var pctStr = isAdv ? '+50%' : '-25%';
        text = pctStr;
      }

      // Determine dominant attacker suit for icon color
      var aSuit = SynergyEngine.getDominantSuit(stackCards);
      var colorKey = isAdv ? 'suit_adv' : 'suit_disadv';

      Toast.showCentered({
        text: text + (isAdv ? '!' : ''),
        icon: isAdv ? '⚔️' : '🛡️',
        color: colorKey,
        duration: isAdv ? 1400 : 1200
      });

      // ── Audio feedback (Pass 7) ──
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play(isAdv ? 'advantage-chime' : 'disadvantage', { volume: 0.6 });
      }

      // Also fire a suit-colored HUD flash via CombatFX
      if (typeof CombatFX !== 'undefined') {
        // Flash in the attacker's suit color for advantage,
        // defender's suit color for disadvantage (visual learning)
        var flashSuit = isAdv ? aSuit : _getDefenderSuit(stackCards);
        var flashColor = SynergyEngine.getColor(flashSuit);
        if (flashColor) {
          CombatFX.flashFrame('suit', flashColor);
        }
      }
    }

    // ── Mono-suit bonus corner toast ──
    if (stackCards && stackCards.length >= 2) {
      var mono = SynergyEngine.checkMonoSuitBonus(stackCards);
      if (mono.monoSuit && mono.bonus > 0) {
        var sym = SynergyEngine.getSymbol(mono.suit);
        Toast.show({
          text: sym + ' x' + stackCards.length + ' combo +' + mono.bonus + ' dmg',
          icon: sym,
          color: mono.suit,  // Uses the suit color preset we added
          duration: 2000
        });
      }
    }
  }

  /**
   * Get the defender (enemy) suit from combat context.
   * Reads from CombatEngine if available.
   */
  function _getDefenderSuit(stackCards) {
    if (typeof CombatEngine !== 'undefined' && CombatEngine.getEnemy()) {
      return CombatEngine.getEnemy().suit || 'spade';
    }
    return 'spade';
  }

  return {
    show: show
  };
})();

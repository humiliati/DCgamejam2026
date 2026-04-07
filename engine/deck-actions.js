/**
 * DeckActions — hand/backup deck card management extracted from game.js.
 *
 * Layer 2 — depends on: GameActions, CardAuthority, Toast, AudioSystem, i18n
 */

var DeckActions = (function() { 'use strict';

function handToBackup(handIndex) {
    var card = CardAuthority.removeFromHand(handIndex);
    if (!card) return;
    CardAuthority.addToBackup(card);
    var emoji = card.emoji || '\uD83C\uDCA0';
    Toast.show(emoji + ' \u2192 Backup Deck', 'info');
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
    GameActions.refreshPanels();
}

function backupToHand(deckIndex) {
    var backup = CardAuthority.getBackup();
    var card = backup[deckIndex];
    if (!card) return;

    var hand = CardAuthority.getHand();
    if (hand.length < CardAuthority.MAX_HAND) {
      CardAuthority.removeFromBackupById(card.id);
      CardAuthority.addToHand(card);
      var emoji = card.emoji || '\uD83C\uDCA0';
      Toast.show(emoji + ' \u2192 Hand', 'info');
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
      GameActions.refreshPanels();
      return;
    }

    var bagSize = (typeof CardAuthority.getBagSize === 'function')
      ? CardAuthority.getBagSize()
      : CardAuthority.getBag().length;
    if (bagSize < CardAuthority.getMaxBag()) {
      CardAuthority.removeFromBackupById(card.id);
      card._bagStored = true;
      CardAuthority.addToBag(card);
      var emoji2 = card.emoji || '\uD83C\uDCA0';
      Toast.show(emoji2 + ' \u2192 Bag', 'info');
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('card-whoosh');
      GameActions.refreshPanels();
      return;
    }

    Toast.show(i18n.t('inv.no_space', 'No space! Hand & bag full.'), 'warning');
}

return Object.freeze({
  handToBackup: handToBackup,
  backupToHand: backupToHand
});

})();

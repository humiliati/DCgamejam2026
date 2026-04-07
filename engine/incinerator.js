/**
 * Incinerator — burn items/cards for coin refund, extracted from game.js.
 *
 * Layer 2 — depends on: GameActions, CardAuthority, MenuFaces, Toast,
 *           AudioSystem, HUD, Player, i18n
 */

var Incinerator = (function() { 'use strict';

function burnFromFocus() {
    var focus = (typeof MenuFaces !== 'undefined') ? MenuFaces.getInvFocus() : 'bag';
    var offset = (typeof MenuFaces !== 'undefined') ? MenuFaces.getBagOffset() : 0;

    if (focus === 'bag') {
      var bag = CardAuthority.getBag();
      var item = bag[offset];
      if (!item) { Toast.show(i18n.t('inv.nothing_burn', 'Nothing to burn'), 'warning'); return; }
      CardAuthority.removeFromBag(offset);
      var refund = item.value ? Math.max(1, Math.floor(item.value * 0.1)) : 1;
      CardAuthority.addGold(refund);
      Toast.show('\uD83D\uDD25 ' + (item.emoji || '') + ' ' + (item.name || 'Item') + ' \u2192 ' + refund + 'g', 'warning');
    } else {
      var deckOff = (typeof MenuFaces !== 'undefined') ? MenuFaces.getDeckOffset() : 0;
      var collection = (typeof CardAuthority !== 'undefined') ? CardAuthority.getBackup() : [];
      var card = collection[deckOff];
      if (!card) { Toast.show(i18n.t('inv.nothing_burn', 'Nothing to burn'), 'warning'); return; }
      if (typeof CardAuthority !== 'undefined') CardAuthority.removeFromBackupById(card.id);
      var cardRefund = card.rarity === 'rare' ? 5 : (card.rarity === 'uncommon' ? 3 : 1);
      CardAuthority.addGold(cardRefund);
      Toast.show('\uD83D\uDD25 ' + (card.emoji || '\uD83C\uDCA0') + ' ' + (card.name || 'Card') + ' \u2192 ' + cardRefund + 'g', 'warning');
    }

    AudioSystem.play('incinerator');
    HUD.updatePlayer(Player.state());
    GameActions.refreshPanels();
}

return Object.freeze({
  burnFromFocus: burnFromFocus
});

})();

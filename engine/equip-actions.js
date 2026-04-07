/**
 * EquipActions — equip/unequip/stash item actions extracted from game.js.
 *
 * Layer 2 — depends on: GameActions, CardAuthority, Player, HUD, Toast,
 *           AudioSystem, ParticleFX, i18n (all typeof-guarded)
 */

var EquipActions = (function() {
  'use strict';

  /**
   * equipFromBag(bagIndex) — Move item from bag to equipment slot.
   * Determines slot by item type; ejects previous item back to bag.
   */
  function equipFromBag(bagIndex) {
    var bag = Player.state().bag;
    var item = bag[bagIndex];
    if (!item) return;
    if (item._bagStored || item.suit !== undefined ||
        item._cardRef || item.cardId !== undefined) {
      if (typeof Toast !== 'undefined') Toast.show('\uD83C\uDCCF Cards can\u2019t be equipped', 'warning');
      return;
    }
    var slot = 0;
    if (item.type === 'consumable' || item.subtype === 'food' || item.subtype === 'vice') slot = 1;
    if (item.type === 'key') slot = 2;
    var removed = CardAuthority.removeFromBag(bagIndex);
    if (!removed) return;
    var prev = CardAuthority.equip(slot, removed);
    if (prev) {
      CardAuthority.addToBag(prev);
      Toast.show(item.emoji + ' ' + i18n.t('inv.equipped', 'equipped') +
                 ' \u2190 ' + prev.emoji, 'info');
    } else {
      Toast.show(item.emoji + ' ' + i18n.t('inv.equipped', 'equipped'), 'info');
    }
    AudioSystem.play('pickup-success');
    if (typeof ParticleFX !== 'undefined') {
      var c = GameActions.getCanvas();
      ParticleFX.equipFlash(c ? c.width / 2 : 320, c ? c.height * 0.35 : 170);
    }
    HUD.updatePlayer(Player.state());
    GameActions.refreshPanels();
  }

  /**
   * unequipSlot(slot) — Move item from equipment slot back to bag.
   */
  function unequipSlot(slot) {
    var item = CardAuthority.getEquipSlot(slot);
    if (!item) return;
    if (CardAuthority.getBagSize() >= CardAuthority.getMaxBag()) {
      Toast.show(i18n.t('inv.bag_full', 'Bag is full!'), 'warning');
      return;
    }
    CardAuthority.unequip(slot);
    CardAuthority.addToBag(item);
    Toast.show(item.emoji + ' ' + i18n.t('inv.unequipped', 'unequipped'), 'dim');
    AudioSystem.playRandom('coin');
    HUD.updatePlayer(Player.state());
    GameActions.refreshPanels();
  }

  /**
   * bagToStash(bagIndex) — Move item from bag to stash.
   */
  function bagToStash(bagIndex) {
    var bag = CardAuthority.getBag();
    var item = bag[bagIndex];
    if (!item) return;
    if (CardAuthority.getStashSize() >= CardAuthority.MAX_STASH) {
      Toast.show(i18n.t('inv.stash_full', 'Stash is full!'), 'warning');
      return;
    }
    CardAuthority.removeFromBag(bagIndex);
    CardAuthority.addToStash(item);
    Toast.show(item.emoji + ' \u2192 ' + i18n.t('inv.stash', 'Stash'), 'info');
    AudioSystem.play('pickup-success');
    HUD.updatePlayer(Player.state());
    GameActions.refreshPanels();
  }

  /**
   * stashToBag(stashIndex) — Move item from stash back to bag.
   */
  function stashToBag(stashIndex) {
    var stash = CardAuthority.getStash();
    var item = stash[stashIndex];
    if (!item) return;
    if (CardAuthority.getBagSize() >= CardAuthority.getMaxBag()) {
      Toast.show(i18n.t('inv.bag_full', 'Bag is full!'), 'warning');
      return;
    }
    CardAuthority.removeFromStash(stashIndex);
    CardAuthority.addToBag(item);
    Toast.show(item.emoji + ' \u2192 ' + i18n.t('inv.bag', 'Bag'), 'info');
    AudioSystem.play('pickup-success');
    HUD.updatePlayer(Player.state());
    GameActions.refreshPanels();
  }

  return Object.freeze({
    equipFromBag: equipFromBag,
    unequipSlot: unequipSlot,
    bagToStash: bagToStash,
    stashToBag: stashToBag
  });
})();

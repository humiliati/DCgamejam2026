/**
 * ShopActions — buy/sell transaction handlers extracted from game.js.
 *
 * Layer 2 — depends on: GameActions, Shop, CardAuthority, Player, HUD,
 *           Toast, AudioSystem, ParticleFX, SessionStats, DebriefFeed,
 *           FloorManager, i18n (typeof-guarded)
 */
var ShopActions = (function() {
  'use strict';

  /**
   * Player presses [1-5] on shop Face 1 (buy pane) to purchase a card.
   * Slot index matches the number key (0-indexed).
   */
  function shopBuy(slot) {
    if (typeof Shop === 'undefined' || !Shop.isOpen()) return;

    var result = Shop.buy(slot);
    if (result.ok) {
      Toast.show(
        i18n.t('shop.bought', 'Bought') + ' ' + result.card.emoji + ' ' + result.card.name +
        ' (−' + result.cost + 'g)',
        'loot'
      );
      AudioSystem.playRandom('coin');
      // Coin burst at viewport center (coins fly UP from purchase)
      if (typeof ParticleFX !== 'undefined') {
        var canvas = GameActions.getCanvas();
        var cx = canvas ? canvas.width / 2 : 320;
        var cy = canvas ? canvas.height * 0.55 : 240;
        ParticleFX.coinBurst(cx, cy, Math.min(12, Math.max(4, Math.floor(result.cost / 5))));
      }
      HUD.updatePlayer(Player.state());
      SessionStats.inc('cardsBought');
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Bought ' + result.card.emoji + ' -' + result.cost + 'g', 'loot');
      GameActions.refreshPanels();
    } else if (result.reason === 'no_gold') {
      Toast.show(
        i18n.t('shop.need_gold', 'Need') + ' ' + result.needed + 'g ' + i18n.t('shop.more', 'more'),
        'warning'
      );
      AudioSystem.play('ui-fail');
    } else if (result.reason === 'sold_out') {
      Toast.show(i18n.t('shop.sold_out', 'Sold out'), 'dim');
    }
  }

  /**
   * Player clicks a supply row in the shop face supply section.
   * supplyIndex is the position in the faction's getSupplyStock() array.
   * Purchases are unlimited — no sold-out state.
   */
  function shopBuySupply(supplyIndex) {
    if (typeof Shop === 'undefined') return;
    // Ensure shop session is open for the current faction/floor before buying
    if (!Shop.isOpen()) {
      var _sf = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1';
      var _faction = Shop.getCurrentFaction ? Shop.getCurrentFaction() : 'tide';
      Shop.open(_faction, parseInt(_sf, 10) || 1);
    }

    var result = Shop.buySupply(supplyIndex);
    if (result.ok) {
      var item = result.item;
      Toast.show(
        item.emoji + ' ' + i18n.t('toast.bought', 'Bought') + ' ' + item.name + '  −' + result.cost + 'g',
        'currency'
      );
      AudioSystem.playRandom('coin', { volume: 0.4 });
      if (typeof ParticleFX !== 'undefined') {
        var canvas2 = GameActions.getCanvas();
        var cx2 = canvas2 ? canvas2.width / 2 : 320;
        var cy2 = canvas2 ? canvas2.height * 0.55 : 240;
        if (result.cost >= 5) ParticleFX.coinBurst(cx2, cy2, Math.min(8, Math.floor(result.cost / 3)));
      }
      HUD.updatePlayer(Player.state());
      if (typeof StatusBar !== 'undefined' && StatusBar.updateBag) StatusBar.updateBag();
      GameActions.refreshPanels();
    } else if (result.reason === 'no_gold') {
      var stock = Shop.getSupplyStock ? Shop.getSupplyStock() : [];
      var needed = stock[supplyIndex] ? stock[supplyIndex].shopPrice - CardAuthority.getGold() : 0;
      Toast.show(i18n.t('shop.need_gold', 'Need') + ' ' + needed + 'g ' + i18n.t('shop.more', 'more'), 'warning');
      AudioSystem.play('ui-fail');
    } else if (result.reason === 'bag_full') {
      Toast.show(i18n.t('toast.bag_full', 'Bag is full!'), 'warning');
    }
  }

  /**
   * Player presses [1-5] on shop Face 2 (sell pane) to sell a hand card.
   * Slot index matches card_N key binding (0-indexed over the hand).
   */
  function shopSellFromHand(slot) {
    if (typeof Shop === 'undefined' || !Shop.isOpen()) return;

    var hand = CardAuthority.getHand();
    var card = hand[slot];
    if (!card) return;

    var result = Shop.sell(card.id);
    if (result.ok) {
      // Also remove from displayed hand
      CardAuthority.removeFromHand(slot);

      Toast.show(
        i18n.t('shop.sold', 'Sold') + ' ' + card.emoji + ' ' + card.name +
        ' (+' + result.amount + 'g)',
        'loot'
      );
      AudioSystem.playRandom('coin');
      // Coin rain for sell proceeds
      if (typeof ParticleFX !== 'undefined') {
        var canvas3 = GameActions.getCanvas();
        var cx = canvas3 ? canvas3.width / 2 : 320;
        var cy = canvas3 ? canvas3.height * 0.45 : 200;
        if (result.amount >= 15) {
          ParticleFX.coinRain(cx, cy, result.amount);
        } else {
          ParticleFX.coinBurst(cx, cy, Math.max(3, Math.floor(result.amount / 3)));
        }
      }
      HUD.updatePlayer(Player.state());
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Sold ' + card.emoji + ' +' + result.amount + 'g', 'loot');

      // Rep tier changed — show toast + level-up particles
      if (result.repResult && result.repResult.tierChanged) {
        var fLabel = Shop.getFactionLabel(Shop.getCurrentFaction());
        Toast.show(fLabel + ' Rep Tier ' + result.repResult.newTier + '!', 'info');
        if (typeof ParticleFX !== 'undefined') {
          var canvas3b = GameActions.getCanvas();
          ParticleFX.levelUp(canvas3b ? canvas3b.width / 2 : 320, canvas3b ? canvas3b.height * 0.3 : 150);
        }
      }
      GameActions.refreshPanels();
    } else {
      Toast.show(i18n.t('shop.sell_fail', 'Cannot sell'), 'warning');
    }
  }

  /**
   * Player sells a salvage part from their bag at the current faction shop.
   * Called by MenuBox shop Face 3 (sell-parts pane) keybind.
   * @param {number} bagIndex - Index into Player.state().bag
   */
  function shopSellPart(bagIndex) {
    if (typeof Shop === 'undefined' || !Shop.isOpen()) return;

    var bag = Player.state().bag;
    var item = bag[bagIndex];
    if (!item || item.type !== 'salvage') return;

    var result = Shop.sellPart(item.id);
    if (result.ok) {
      Toast.show(
        i18n.t('shop.sold', 'Sold') + ' ' + item.emoji + ' ' + item.name +
        ' (+' + result.amount + 'g)',
        'loot'
      );
      AudioSystem.playRandom('coin');
      // Salvage sell — coin burst + salvage spark
      if (typeof ParticleFX !== 'undefined') {
        var canvas4 = GameActions.getCanvas();
        var cx = canvas4 ? canvas4.width / 2 : 320;
        var cy = canvas4 ? canvas4.height * 0.5 : 220;
        ParticleFX.salvageSpark(cx, cy);
        if (result.amount >= 15) {
          ParticleFX.coinRain(cx, cy - 20, result.amount);
        } else {
          ParticleFX.coinBurst(cx, cy, Math.max(3, Math.floor(result.amount / 3)));
        }
      }
      HUD.updatePlayer(Player.state());
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('Sold ' + item.emoji + ' +' + result.amount + 'g', 'loot');

      // Rep tier changed — show toast + level-up particles
      if (result.repResult && result.repResult.tierChanged) {
        var fLabel = Shop.getFactionLabel(Shop.getCurrentFaction());
        Toast.show(fLabel + ' Rep Tier ' + result.repResult.newTier + '!', 'info');
        if (typeof ParticleFX !== 'undefined') {
          var canvas4b = GameActions.getCanvas();
          ParticleFX.levelUp(canvas4b ? canvas4b.width / 2 : 320, canvas4b ? canvas4b.height * 0.3 : 150);
        }
      }
      GameActions.refreshPanels();
    } else {
      Toast.show(i18n.t('shop.sell_fail', 'Cannot sell'), 'warning');
    }
  }

  return Object.freeze({
    buy: shopBuy,
    buySupply: shopBuySupply,
    sellFromHand: shopSellFromHand,
    sellPart: shopSellPart
  });
})();

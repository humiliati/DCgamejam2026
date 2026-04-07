/**
 * GameActions — shared helpers extracted from game.js.
 *
 * High-reuse closures that multiple extracted modules depend on.
 * Initialized once by Game during _initGameplay.
 *
 * Layer 2 — depends on: CardAuthority, Player, HUD, Toast, AudioSystem,
 *           SessionStats, ParticleFX, i18n (all Layer 0-2, typeof-guarded)
 */
var GameActions = (function () {
  'use strict';

  var _canvas = null;
  var _gateUnlocked = false;

  // ── Init ───────────────────────────────────────────────────────────

  function init(opts) {
    if (opts.canvas) _canvas = opts.canvas;
    if (opts.gateUnlocked !== undefined) _gateUnlocked = opts.gateUnlocked;
  }

  // ── Panel refresh ──────────────────────────────────────────────────

  function refreshPanels() {
    if (typeof DebriefFeed !== 'undefined') DebriefFeed.refresh();
    if (typeof StatusBar !== 'undefined') StatusBar.refresh();
    if (typeof QuickBar !== 'undefined') QuickBar.refresh();
    if (typeof NchWidget !== 'undefined') NchWidget.refresh();
  }

  // ── Collapse all peek overlays ─────────────────────────────────────

  function collapseAllPeeks() {
    // ── Unified restock surface (RS-5 combat-safety fix) ──
    if (typeof RestockBridge !== 'undefined' && RestockBridge.isActive()) {
      RestockBridge.close();
      if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) CinematicCamera.close();
    }

    if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) {
      PeekSlots.close();
    }
    if (typeof TorchPeek !== 'undefined' && TorchPeek.isInteracting()) {
      if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) CinematicCamera.close();
      TorchPeek.handleKey('Escape');
    }
    if (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.isActive()) {
      if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) CinematicCamera.close();
      BookshelfPeek.handleKey('Escape');
    }
    if (typeof CratePeek   !== 'undefined' && CratePeek.isActive())   CratePeek.handleKey('Escape');
    if (typeof CorpsePeek  !== 'undefined' && CorpsePeek.isActive())  CorpsePeek.handleKey('Escape');
    if (typeof MerchantPeek !== 'undefined' && MerchantPeek.isActive()) MerchantPeek.handleKey('Escape');
    if (typeof PuzzlePeek  !== 'undefined' && PuzzlePeek.isActive())  PuzzlePeek.handleKey('Escape');
  }

  // ── Apply pickup (bag-add + HUD + VFX) ─────────────────────────────

  function applyPickup(pickup) {
    if (pickup.type === 'gold') {
      var goldAmt = pickup.amount || 1;
      CardAuthority.addGold(goldAmt);
      if (typeof Toast !== 'undefined') Toast.show('💰 +' + goldAmt, 'currency');
      AudioSystem.play('coin', { volume: 0.5 });
      // Coin VFX — match shop sell pattern (coinRain ≥ 15, coinBurst < 15)
      if (typeof ParticleFX !== 'undefined' && _canvas) {
        var gcx = _canvas.width / 2;
        var gcy = _canvas.height * 0.5;
        if (goldAmt >= 15) {
          ParticleFX.coinRain(gcx, gcy, goldAmt);
        } else if (goldAmt >= 3) {
          ParticleFX.coinBurst(gcx, gcy, Math.max(3, Math.floor(goldAmt / 2)));
        }
      }
    } else if (pickup.type === 'battery') {
      Player.addBattery(pickup.amount || 1);
      if (typeof Toast !== 'undefined') Toast.show('◈ +' + (pickup.amount || 1), 'battery');
      AudioSystem.play('coin', { volume: 0.5 });
      HUD.updateBattery(Player.state());
    } else if (pickup.type === 'food') {
      var HOT_ITEMS = { 'ITM-001': { hot: 1, ticks: 3 }, 'ITM-002': { hot: 1, ticks: 3 },
                       'ITM-003': { hot: 2, ticks: 4 }, 'ITM-004': { hp: 3 },
                       'ITM-005': { hp: 4 }, 'ITM-006': { hp: 3, energy: 2 } };
      var effect = (pickup.itemId && HOT_ITEMS[pickup.itemId]) || { hp: 2 };
      if (effect.hot) {
        Player.applyHOT(effect.hot, effect.ticks);
        if (typeof Toast !== 'undefined') Toast.show(i18n.t('toast.food_hot', 'Eating... +' + effect.hot + '♥ ×' + effect.ticks), 'hp');
      } else {
        if (effect.hp)     Player.heal(effect.hp);
        if (effect.energy) Player.restoreEnergy(effect.energy);
        if (typeof Toast !== 'undefined') Toast.show(i18n.t('toast.food_instant', 'Ate something. ♥ +' + (effect.hp || 0)), 'hp');
      }
      AudioSystem.play('pickup', { volume: 0.5 });
    } else if (pickup.type === 'supply') {
      var supplyItem = { id: pickup.itemId, type: 'consumable', subtype: 'supply' };
      if (typeof ItemDB !== 'undefined' && ItemDB.get) {
        var full = ItemDB.get(pickup.itemId);
        if (full) supplyItem = JSON.parse(JSON.stringify(full));
      }
      var added = CardAuthority.addToBag(supplyItem);
      if (added) {
        var sName = supplyItem.name || pickup.itemId;
        var sEmoji = supplyItem.emoji || '📦';
        if (typeof Toast !== 'undefined') Toast.show(sEmoji + ' ' + sName, 'item');
        AudioSystem.play('pickup', { volume: 0.5 });
      } else {
        if (typeof Toast !== 'undefined') Toast.show(i18n.t('toast.bag_full', 'Bag full!'), 'warning');
      }
    }
    HUD.updatePlayer(Player.state());
    if (typeof SessionStats !== 'undefined') SessionStats.inc('itemsCollected');
  }

  // ── Gate state ─────────────────────────────────────────────────────

  function isGateUnlocked() { return _gateUnlocked; }
  function setGateUnlocked(v) { _gateUnlocked = !!v; }

  // ── Canvas accessor ────────────────────────────────────────────────

  function getCanvas() { return _canvas; }

  // ── Public API ─────────────────────────────────────────────────────

  return Object.freeze({
    init:              init,
    refreshPanels:     refreshPanels,
    collapseAllPeeks:  collapseAllPeeks,
    applyPickup:       applyPickup,
    isGateUnlocked:    isGateUnlocked,
    setGateUnlocked:   setGateUnlocked,
    getCanvas:         getCanvas
  });
})();

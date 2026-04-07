/**
 * CorpseActions — Corpse harvest, deposit, seal, and reanimate workflows.
 *
 * This module encapsulates the six corpse interaction functions:
 * - harvestCorpse(fx, fy)     — Trigger harvest UI for a corpse at grid pos
 * - openCorpseMenu(optX, optY, optFloorId) — Open MenuBox for manual deposit
 * - depositBagItem(bagIdx)     — Move bag item into corpse slot
 * - depositHandCard(handIdx)   — Move hand card into corpse suit slot
 * - seal()                     — Finalize corpse, award gold, trigger reanimate
 * - takeHarvestItem(slot)      — Harvest one loot item from staged UI
 *
 * Internal state: _corpsePendingX/Y/Floor track the active corpse coords.
 *
 * Dependencies (typeof-guarded):
 *   Salvage, CrateSystem, CorpseRegistry, CorpsePeek, FloorManager,
 *   CardAuthority, i18n, Toast, AudioSystem, CombatBridge, DeathAnim,
 *   ParticleFX, GameActions, HUD, Player, SessionStats, DebriefFeed,
 *   MenuBox, TILES
 */

var CorpseActions = (function() {
  'use strict';

  // ── Internal state ────────

  var _corpsePendingX = -1;
  var _corpsePendingY = -1;
  var _corpsePendingFloor = '';

  var _requestPauseCb = null;

  // ── Init ────────

  function init(opts) {
    if (opts && typeof opts.requestPause === 'function') {
      _requestPauseCb = opts.requestPause;
    }
  }

  // ── Wander path builder for reanimated friendlies ──────────────
  // Scans the floor for interesting waypoints (BREAKABLE/crates, BONFIRE/
  // torches) and builds a PATROL ping-pong path starting from the corpse
  // origin. The NPC moseys for a short delay, then wanders crate→torch→crate.

  var _WANDER_TILE_TYPES = null; // Lazy-init: [BREAKABLE, BONFIRE, CHEST, CORPSE]

  function _buildWanderPath(originX, originY) {
    var fd = (typeof FloorManager !== 'undefined') ? FloorManager.getFloorData() : null;
    if (!fd || !fd.grid) return null;

    if (!_WANDER_TILE_TYPES) {
      _WANDER_TILE_TYPES = [];
      if (typeof TILES !== 'undefined') {
        if (TILES.BREAKABLE !== undefined) _WANDER_TILE_TYPES.push(TILES.BREAKABLE);
        if (TILES.BONFIRE !== undefined)   _WANDER_TILE_TYPES.push(TILES.BONFIRE);
        if (TILES.CHEST !== undefined)     _WANDER_TILE_TYPES.push(TILES.CHEST);
      }
    }

    var grid = fd.grid;
    var W = fd.gridW;
    var H = fd.gridH;
    var candidates = [];

    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var t = grid[y][x];
        for (var ti = 0; ti < _WANDER_TILE_TYPES.length; ti++) {
          if (t === _WANDER_TILE_TYPES[ti]) {
            var dist = Math.abs(x - originX) + Math.abs(y - originY);
            // Only consider reachable waypoints within 12-tile Manhattan radius
            if (dist > 0 && dist <= 12) {
              candidates.push({ x: x, y: y, dist: dist });
            }
            break;
          }
        }
      }
    }

    if (candidates.length === 0) return null;

    // Sort by distance and pick up to 4 closest waypoints
    candidates.sort(function (a, b) { return a.dist - b.dist; });
    var waypoints = [{ x: originX, y: originY }]; // start at origin
    var limit = Math.min(candidates.length, 4);
    for (var wi = 0; wi < limit; wi++) {
      waypoints.push({ x: candidates[wi].x, y: candidates[wi].y });
    }

    return {
      type: 'patrol',
      points: waypoints
    };
  }

  function _assignWanderPath(entity, originX, originY) {
    var path = _buildWanderPath(originX, originY);
    if (path) {
      entity.path = path;
      entity.pathIndex = 0;
      entity.pathDirection = 1;
      entity.pathTimer = 0;
      // Mosey delay: stay at origin for 2-4 seconds before wandering
      entity.pathTimer = -(2000 + Math.floor(Math.random() * 2000));
    }
  }

  // ── Corpse harvest (opens MenuBox with side-by-side UI) ────────

  function harvestCorpse(fx, fy) {
    if (typeof Salvage === 'undefined') return;

    var floorId = FloorManager.getCurrentFloorId();
    var biome = FloorManager.getBiome();

    var _corpseContainer = (typeof CrateSystem !== 'undefined')
      ? CrateSystem.getContainer(fx, fy, floorId) : null;
    var _corpseSealed = _corpseContainer && _corpseContainer.sealed;

    if (typeof CorpseRegistry !== 'undefined' && _corpseSealed) {
      var reanimData = CorpseRegistry.reanimate(fx, fy, floorId);
      if (reanimData) {
        var rfd = FloorManager.getFloorData();
        if (rfd && rfd.grid[fy]) rfd.grid[fy][fx] = TILES.EMPTY;

        var existingEnemy = (typeof CombatBridge !== 'undefined')
          ? CombatBridge.findDeadEnemyAt(fx, fy) : null;

        if (typeof DeathAnim !== 'undefined') {
          var canvas = GameActions.getCanvas();
          var cw = canvas ? canvas.width : 640;
          var ch = canvas ? canvas.height : 400;
          DeathAnim.startReanimate(reanimData.type, cw / 2, ch * 0.45, 0.6, function () {
            var _reanimEntity;
            if (existingEnemy) {
              CombatBridge.resurrectAsFriendly(existingEnemy);
              _reanimEntity = existingEnemy;
            } else {
              _reanimEntity = {
                x: fx, y: fy,
                id: 'reanim_' + reanimData.type + '_' + fx + '_' + fy,
                name: reanimData.name,
                emoji: reanimData.emoji,
                type: reanimData.type,
                hp: reanimData.hp,
                maxHp: reanimData.hp,
                str: reanimData.str,
                facing: 'south',
                awareness: 0,
                friendly: true,
                nonLethal: true,
                tags: reanimData.tags || []
              };
              FloorManager.getEnemies().push(_reanimEntity);
            }
            // Assign wander path: mosey, then crate→torch→crate patrol
            _assignWanderPath(_reanimEntity, fx, fy);
            Toast.show(i18n.t('toast.reanimate', 'The fallen rises...'), 'loot');
          });
        }
        return;
      }
    }

    if (!Salvage.hasHarvests(fx, fy, floorId)) {
      Toast.show(i18n.t('toast.harvest_empty', 'Nothing left to harvest.'), 'info');
      var fd = FloorManager.getFloorData();
      fd.grid[fy][fx] = TILES.EMPTY;
      return;
    }

    Salvage.prepareLoot(fx, fy, floorId, biome);

    GameActions.collapseAllPeeks();
    if (_requestPauseCb) _requestPauseCb('harvest', 0);
  }

  function openCorpseMenu(optX, optY, optFloorId) {
    var tx, ty, tFloor;

    if (optX !== undefined && optX >= 0) {
      tx     = optX;
      ty     = optY;
      tFloor = optFloorId || FloorManager.getCurrentFloorId();
    } else {
      var target = (typeof CorpsePeek !== 'undefined' && CorpsePeek.getTarget)
        ? CorpsePeek.getTarget() : null;
      if (!target || target.x < 0) return;
      tx     = target.x;
      ty     = target.y;
      tFloor = target.floorId || FloorManager.getCurrentFloorId();
    }

    _corpsePendingX     = tx;
    _corpsePendingY     = ty;
    _corpsePendingFloor = tFloor;

    if (typeof CrateSystem === 'undefined' ||
        !CrateSystem.hasContainer(tx, ty, tFloor)) {
      harvestCorpse(tx, ty);
      return;
    }

    if (typeof CorpsePeek !== 'undefined' && CorpsePeek.forceHide) CorpsePeek.forceHide();
    GameActions.collapseAllPeeks();

    if (_requestPauseCb) _requestPauseCb('corpse', 0);
  }

  function depositBagItem(bagIdx) {
    if (typeof CrateSystem === 'undefined') return;
    var container = CrateSystem.getContainer(_corpsePendingX, _corpsePendingY, _corpsePendingFloor);
    if (!container || container.sealed) return;

    var bag = CardAuthority.getBag();
    var item = bag[bagIdx];
    if (!item) return;

    var slots = container.slots;
    var targetSlotIdx = -1;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].filled) continue;
      if (slots[i].frameTag === CrateSystem.FRAME.SUIT_CARD) continue;
      var frameTag = slots[i].frameTag;
      var matches = (frameTag === CrateSystem.FRAME.WILDCARD) ||
                    (item.crateFillTag && item.crateFillTag === frameTag) ||
                    (item.category === 'food' && frameTag === CrateSystem.FRAME.HP_FOOD) ||
                    (item.category === 'energy' && frameTag === CrateSystem.FRAME.ENERGY) ||
                    (item.category === 'battery' && frameTag === CrateSystem.FRAME.BATTERY) ||
                    (item.category === 'scroll' && frameTag === CrateSystem.FRAME.SCROLL) ||
                    (item.category === 'gem' && frameTag === CrateSystem.FRAME.GEM) ||
                    (item.subtype  === 'food' && frameTag === CrateSystem.FRAME.HP_FOOD) ||
                    (item.subtype  === 'tonic' && frameTag === CrateSystem.FRAME.ENERGY) ||
                    (item.category === 'salvage' && frameTag === CrateSystem.FRAME.WILDCARD);
      if (matches) { targetSlotIdx = i; break; }
    }
    if (targetSlotIdx < 0) {
      for (var wi = 0; wi < slots.length; wi++) {
        if (!slots[wi].filled && slots[wi].frameTag !== CrateSystem.FRAME.SUIT_CARD) {
          targetSlotIdx = wi; break;
        }
      }
    }
    if (targetSlotIdx < 0) {
      Toast.show(i18n.t('toast.no_slot', 'No matching slot'), 'warning');
      return;
    }

    var result = CrateSystem.fillSlot(_corpsePendingX, _corpsePendingY, _corpsePendingFloor, targetSlotIdx, item);
    if (result) {
      CardAuthority.removeFromBag(bagIdx);
      var bonus = result.matched ? ' \u2713' : '';
      Toast.show(item.emoji + ' ' + item.name + ' \u2192 corpse slot' + bonus, 'info');
      AudioSystem.play('ui-confirm', { volume: 0.4 });
      HUD.updatePlayer(Player.state());
      GameActions.refreshPanels();
    }
  }

  function depositHandCard(handIdx) {
    if (typeof CrateSystem === 'undefined') return;
    var container = CrateSystem.getContainer(_corpsePendingX, _corpsePendingY, _corpsePendingFloor);
    if (!container || container.sealed) return;

    var hand = CardAuthority.getHand();
    var card = hand[handIdx];
    if (!card) return;

    var slots = container.slots;
    var targetSlotIdx = -1;
    for (var i = 0; i < slots.length; i++) {
      if (!slots[i].filled && slots[i].frameTag === CrateSystem.FRAME.SUIT_CARD) {
        targetSlotIdx = i; break;
      }
    }
    if (targetSlotIdx < 0) {
      Toast.show(i18n.t('toast.suit_slot_full', 'Suit slot already filled'), 'info');
      return;
    }
    if (slots[targetSlotIdx].suit && slots[targetSlotIdx].suit !== card.suit) {
      Toast.show('\u2660 Need ' + slots[targetSlotIdx].suit + ' card', 'warning');
      return;
    }

    var result = CrateSystem.fillSlot(_corpsePendingX, _corpsePendingY, _corpsePendingFloor, targetSlotIdx, card);
    if (result) {
      CardAuthority.removeFromHand(handIdx);
      var suitEmoji = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };
      Toast.show((card.emoji || suitEmoji[card.suit] || '\uD83C\uDCCF') + ' ' + card.name + ' \u2192 suit slot', 'loot');
      AudioSystem.play('card-deal', { volume: 0.5 });
      HUD.updatePlayer(Player.state());
      GameActions.refreshPanels();
    }
  }

  function seal() {
    if (typeof CrateSystem === 'undefined') return;
    if (!CrateSystem.canSeal(_corpsePendingX, _corpsePendingY, _corpsePendingFloor)) {
      Toast.show(i18n.t('toast.fill_slots', 'Fill all slots first!'), 'warning');
      AudioSystem.play('ui-fail');
      return;
    }

    var result = CrateSystem.seal(_corpsePendingX, _corpsePendingY, _corpsePendingFloor);
    if (!result) return;

    var msg = '\u2728 Sealed! +' + result.totalCoins + 'g';
    if (result.canReanimate) msg += '  \u2620\uFE0F Ready to reanimate!';
    Toast.show(msg, 'loot');

    CardAuthority.addGold(result.totalCoins);

    if (typeof ParticleFX !== 'undefined') {
      var canvas = GameActions.getCanvas();
      if (canvas) {
        var cx = canvas.width / 2;
        var cy = canvas.height * 0.4;
        if (result.totalCoins >= 5) ParticleFX.coinRain(cx, cy, result.totalCoins);
        else if (result.totalCoins > 0) ParticleFX.coinBurst(cx, cy, Math.max(3, result.totalCoins));
      }
    }

    HUD.updatePlayer(Player.state());

    if (typeof MenuBox !== 'undefined' && MenuBox.close) MenuBox.close();
  }

  function takeHarvestItem(slot) {
    if (typeof Salvage === 'undefined') return;

    var loot = Salvage.getStagedLoot();
    if (slot < 0 || slot >= loot.length) return;

    var item = Salvage.takeLoot(slot);
    if (!item) return;

    if (CardAuthority.addToBag(item)) {
      Toast.show(
        i18n.t('toast.harvest', 'Harvested:') + ' ' + item.emoji + ' ' + item.name,
        'loot'
      );
      AudioSystem.play('pickup-success');
      if (typeof ParticleFX !== 'undefined') {
        var canvas = GameActions.getCanvas();
        var cx = canvas ? canvas.width / 2 : 320;
        var cy = canvas ? canvas.height * 0.5 : 220;
        ParticleFX.salvageSpark(cx, cy);
      }
      HUD.updatePlayer(Player.state());
      SessionStats.inc('partsHarvested');
      if (typeof DebriefFeed !== 'undefined') DebriefFeed.logEvent('+' + item.emoji + ' ' + item.name, 'loot');
      GameActions.refreshPanels();
    } else {
      Toast.show(i18n.t('toast.bag_full', 'Bag is full!'), 'warning');
      loot.splice(slot, 0, item);
    }

    if (Salvage.getStagedLoot().length === 0) {
      var corpse = Salvage.getStagedCorpse();
      if (corpse) {
        var floorId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.3.1';
        if (typeof CorpseRegistry !== 'undefined') {
          CorpseRegistry.setLootState(corpse.x, corpse.y, floorId, 'dry');
        }
        if (typeof CorpseRegistry === 'undefined') {
          var fd = FloorManager.getFloorData();
          if (fd && fd.grid[corpse.y] && fd.grid[corpse.y][corpse.x] === TILES.CORPSE) {
            fd.grid[corpse.y][corpse.x] = TILES.EMPTY;
          }
        }
      }
      Salvage.closeLoot();
      MenuBox.close();
    }
  }

  // ── Public API ────────

  return Object.freeze({
    init:             init,
    harvestCorpse:    harvestCorpse,
    openCorpseMenu:   openCorpseMenu,
    depositBagItem:   depositBagItem,
    depositHandCard:  depositHandCard,
    seal:             seal,
    takeHarvestItem:  takeHarvestItem,
    getPendingPos:    function() { return { x: _corpsePendingX, y: _corpsePendingY, floor: _corpsePendingFloor }; }
  });
})();

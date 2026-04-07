/**
 * PickupActions — breakable smash + detritus pickup extracted from game.js.
 *
 * Layer 2 — depends on: GameActions, MovementController, FloorManager,
 *           BreakableSpawner, DetritusSprites, WorldItems, Player, HUD,
 *           AudioSystem, Toast, SessionStats, i18n (all typeof-guarded)
 */

var PickupActions = (function() {
  'use strict';

  // ── Breakable prop smash ──────────────────────────────────────────

  function smashBreakable(fx, fy) {
    if (typeof BreakableSpawner === 'undefined') return;
    if (typeof GameActions === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;
    if (typeof AudioSystem === 'undefined') return;
    if (typeof Toast === 'undefined') return;
    if (typeof SessionStats === 'undefined') return;
    if (typeof i18n === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    var bDef = BreakableSpawner.getAt(fx, fy);
    if (!bDef) return;

    AudioSystem.play('smash', { volume: 0.7 });

    var destroyed = BreakableSpawner.hitBreakable(fx, fy, floorData.grid);

    // D2+ crates with containers are indestructible
    if (destroyed && destroyed.blocked) {
      AudioSystem.play('ui-blop', { volume: 0.5 });
      var _bMsg = destroyed.reason === 'crate_storage'
        ? '\uD83D\uDCE6 ' + i18n.t('toast.crate_storage', 'This crate restocks each morning. Open it instead!')
        : '\uD83D\uDD29 ' + i18n.t('toast.crate_bolted', 'This crate is bolted down. Fill it, don\'t smash it.');
      Toast.show(_bMsg, 'info');
      return;
    }

    if (destroyed) {
      Toast.show(destroyed.emoji + ' ' + destroyed.name + ' ' + i18n.t('toast.smashed', 'smashed!'), 'loot');
      AudioSystem.playRandom('coin', { volume: 0.4 });  // Loot spill feedback
      SessionStats.inc('breakablesBroken');

      // ── DEPTH3 §6.3a: Auto-loot spilled drops directly ──
      // Instead of leaving walk-over items on the floor, immediately collect
      // everything _spillDrops just placed at the destroy site + adjacents.
      // Anything that fails pickup stays on the floor (existing fallback).
      if (typeof WorldItems !== 'undefined') {
        var dirs = [{ dx:0,dy:0 }, { dx:0,dy:-1 }, { dx:1,dy:0 }, { dx:0,dy:1 }, { dx:-1,dy:0 }];
        var autoCount = 0;
        for (var di = 0; di < dirs.length; di++) {
          var ax = fx + dirs[di].dx;
          var ay = fy + dirs[di].dy;
          var loot = WorldItems.pickupAt(ax, ay, floorData.grid);
          while (loot) {
            GameActions.applyPickup(loot);
            autoCount++;
            loot = WorldItems.pickupAt(ax, ay, floorData.grid);
          }
        }
      }
    }
    // If not destroyed, the prompt stays visible until HP reaches 0
  }

  // ── Detritus pickup (face+OK or walk-over) ───────────────────────

  /**
   * Collect detritus at (gx, gy).
   * - Removes the sprite from DetritusSprites cache
   * - Clears tile to EMPTY
   * - Face+OK: full item drop (auto-loot into bag via WorldItems)
   * - Walk-over: simplified pickup (battery/HP/energy based on type)
   * - Shows a toast either way
   *
   * Both paths converge here — the walk-over path just gets a simpler
   * pickup effect (no bag item, just a stat bump).
   */
  function collectDetritus(gx, gy) {
    if (typeof DetritusSprites === 'undefined') return;
    if (typeof GameActions === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;
    if (typeof AudioSystem === 'undefined') return;
    if (typeof Toast === 'undefined') return;
    if (typeof SessionStats === 'undefined') return;
    if (typeof i18n === 'undefined') return;
    if (typeof MovementController === 'undefined') return;
    if (typeof Player === 'undefined') return;
    if (typeof HUD === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    if (!floorData || !floorData.grid) return;

    var det = DetritusSprites.getAt(gx, gy);
    if (!det) return;

    // Remove from sprite cache + clear grid tile
    var removed = DetritusSprites.remove(gx, gy, floorData.grid);
    if (!removed) return;

    AudioSystem.play('pickup', { volume: 0.5 });

    // ── Determine if face+OK (interact) or walk-over ──
    var pos = MovementController.getGridPos();
    var isFacing = (pos.x !== gx || pos.y !== gy); // If player is NOT on the tile, they're facing it

    if (isFacing) {
      // Face + OK: full item pickup — drop the item into bag
      // Uses WorldItems to spawn a walk-over collectible at player feet
      // that's immediately picked up. This reuses the existing loot pipe.
      Toast.show(removed.detritusEmoji + ' ' + i18n.t('toast.detritus_pickup', 'Picked up') + ' ' + removed.detritusName, 'loot');

      // Spawn item drop at the tile location, then immediately collect
      if (typeof WorldItems !== 'undefined' && removed.dropItemId) {
        WorldItems.spawnAt(gx, gy, {
          type: removed.walkOverType,
          amount: removed.walkOverAmount,
          itemId: removed.dropItemId
        }, floorData.grid);
        // Auto-collect: pick it up since player just interacted deliberately
        var autoPickup = WorldItems.pickupAt(gx, gy, floorData.grid);
        if (autoPickup) GameActions.applyPickup(autoPickup);
      }
    } else {
      // Walk-over: simplified stat pickup (no bag item, just the effect)
      if (removed.walkOverType === 'food') {
        Player.heal(removed.walkOverAmount || 1);
        Toast.show(removed.detritusEmoji + ' +' + (removed.walkOverAmount || 1) + '\u2665', 'hp');
      } else if (removed.walkOverType === 'battery') {
        Player.addBattery(removed.walkOverAmount || 1);
        Toast.show(removed.detritusEmoji + ' +' + (removed.walkOverAmount || 1) + '\u25C8', 'battery');
      } else if (removed.walkOverType === 'energy') {
        if (typeof Player.restoreEnergy === 'function') Player.restoreEnergy(removed.walkOverAmount || 1);
        Toast.show(removed.detritusEmoji + ' +' + (removed.walkOverAmount || 1) + '\u26A1', 'energy');
      }
    }

    SessionStats.inc('detritusCollected');
    HUD.updatePlayer(Player.state());
    GameActions.refreshPanels();
  }

  return Object.freeze({
    smashBreakable: smashBreakable,
    collectDetritus: collectDetritus
  });
})();

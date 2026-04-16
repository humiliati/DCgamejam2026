/**
 * ClickyRecipes — registers the Tier 1 clicky minigame recipes with
 * ClickyMinigame. Recipes are defined here (not in ClickyMinigame)
 * so the core module stays content-agnostic and new tile types can
 * be added without touching engine internals.
 *
 * Tier 1 roster (per docs/MINIGAME_TILES.md):
 *   WELL          — crank/pump   (exterior social node)
 *   ANVIL         — hammer strikes (duty/work station)
 *   SOUP_KITCHEN  — ladle fill    (eat/cozy)
 *   BARREL        — tap/pour      (errand/work station)
 *   FUNGAL_PATCH  — harvest glow  (walkable, organic)
 *
 * Each recipe grants a small, floor-scoped boost. Effects are routed
 * through Player's existing hooks (heal, setEnergy, addBuff, clearDebuff)
 * with typeof guards so missing hooks don't crash.
 *
 * Layer 3 — depends on: TILES, ClickyMinigame, Player (guarded)
 */
(function () {
  'use strict';

  if (typeof TILES === 'undefined' || typeof ClickyMinigame === 'undefined') {
    console.warn('[ClickyRecipes] TILES or ClickyMinigame missing — recipes not registered');
    return;
  }

  // ── Effect helpers ──────────────────────────────────────────────

  var _buffSerial = 0;

  function _applyEffect(item) {
    if (typeof Player === 'undefined' || !item || !item.effect) return;
    var state = Player.state && Player.state();

    switch (item.effect) {
      case 'heal':
        if (Player.heal) Player.heal(item.amount || 1);
        break;
      case 'energy':
        if (Player.setEnergy && state && state.energy !== undefined) {
          Player.setEnergy(Math.min(
            (state.energy || 0) + (item.amount || 1),
            state.maxEnergy || 100
          ));
        }
        break;
      case 'speed':
        if (Player.addBuff) {
          Player.addBuff({
            id: 'clicky_speed_' + (_buffSerial++),
            type: 'speed',
            amount: item.amount || 3,
            floorsRemaining: item.floors || 1
          });
        }
        break;
      case 'cleanse':
        if (Player.clearDebuff) Player.clearDebuff(item.amount || 1);
        break;
      case 'glow':
        // Short-lived light-radius buff (dungeon fungal harvest).
        // Buff system reads getBuffs() for modifiers; stubbed effect.
        if (Player.addBuff) {
          Player.addBuff({
            id: 'clicky_glow_' + (_buffSerial++),
            type: 'glow',
            amount: item.amount || 1,
            floorsRemaining: item.floors || 1
          });
        }
        break;
      default:
        break;
    }

    // Push state to HUD so the pickup feedback is immediate.
    if (typeof HUD !== 'undefined' && HUD.updatePlayer && Player.state) {
      HUD.updatePlayer(Player.state());
    }
    if (typeof DebriefFeed !== 'undefined' && DebriefFeed.refresh) {
      DebriefFeed.refresh();
    }
  }

  function _toast(msg, kind) {
    if (typeof Toast !== 'undefined') Toast.show(msg, kind || 'loot');
  }

  // ── WELL ────────────────────────────────────────────────────────

  ClickyMinigame.registerRecipe(TILES.WELL, {
    tileId: TILES.WELL,
    walkable: false,
    peek: true,
    maxTaps: 3,
    sound: 'pickup-success',
    menu: [
      { emoji: '💧', name: 'Cool Draught', effect: 'heal',   amount: 2, desc: '+2 HP' },
      { emoji: '🪣', name: 'Fresh Pail',   effect: 'energy', amount: 2, desc: '+2 energy' }
    ],
    format: function (ctx) {
      return '💧 Well (' + ctx.tapsRemaining + '/' + ctx.maxTaps + ') — crank for ' + ctx.item.desc;
    },
    formatEmpty: function () { return '💧 Well — the bucket scrapes dry stone.'; },
    onTap: function (ctx) {
      _applyEffect(ctx.item);
      _toast(ctx.item.emoji + ' ' + ctx.item.name + ' — ' + ctx.item.desc);
    }
  });

  // ── ANVIL ───────────────────────────────────────────────────────

  ClickyMinigame.registerRecipe(TILES.ANVIL, {
    tileId: TILES.ANVIL,
    walkable: false,
    peek: true,
    maxTaps: 3,
    sound: 'pickup-success',
    menu: [
      { emoji: '🔨', name: 'Tempered Edge', effect: 'speed', amount: 4, floors: 1, desc: '+4% speed (1 floor)' },
      { emoji: '⚒️', name: 'Reset Hinge',   effect: 'heal',  amount: 1,           desc: '+1 HP (minor mend)' }
    ],
    format: function (ctx) {
      return '⚒️ Anvil (' + ctx.tapsRemaining + '/' + ctx.maxTaps + ') — strike for ' + ctx.item.desc;
    },
    formatEmpty: function () { return '⚒️ Anvil — the metal is spent for this visit.'; },
    onTap: function (ctx) {
      _applyEffect(ctx.item);
      _toast(ctx.item.emoji + ' ' + ctx.item.name + ' — ' + ctx.item.desc);
    }
  });

  // ── SOUP_KITCHEN ────────────────────────────────────────────────

  ClickyMinigame.registerRecipe(TILES.SOUP_KITCHEN, {
    tileId: TILES.SOUP_KITCHEN,
    walkable: false,
    peek: true,
    maxTaps: 3,
    sound: 'pickup-success',
    menu: [
      { emoji: '🍲', name: 'Hearty Ladle', effect: 'heal',   amount: 3, desc: '+3 HP' },
      { emoji: '🥣', name: 'Broth Bowl',   effect: 'energy', amount: 2, desc: '+2 energy' },
      { emoji: '🧄', name: 'Warm Crust',   effect: 'cleanse', amount: 1, desc: 'Clears 1 debuff' }
    ],
    format: function (ctx) {
      return '🍲 Soup Kitchen (' + ctx.tapsRemaining + '/' + ctx.maxTaps + ') — ladle for ' + ctx.item.desc;
    },
    formatEmpty: function () { return '🍲 Soup Kitchen — cauldron rings empty.'; },
    onTap: function (ctx) {
      _applyEffect(ctx.item);
      _toast(ctx.item.emoji + ' ' + ctx.item.name + ' — ' + ctx.item.desc);
    }
  });

  // ── BARREL ──────────────────────────────────────────────────────

  ClickyMinigame.registerRecipe(TILES.BARREL, {
    tileId: TILES.BARREL,
    walkable: false,
    peek: true,
    maxTaps: 3,
    sound: 'pickup-success',
    menu: [
      { emoji: '🍺', name: 'Stout Pour',  effect: 'energy', amount: 1,           desc: '+1 energy' },
      { emoji: '🫗', name: 'Quick Tap',   effect: 'speed',  amount: 3, floors: 1, desc: '+3% speed (1 floor)' },
      { emoji: '🧪', name: 'Odd Draught', effect: 'heal',   amount: 1,           desc: '+1 HP' }
    ],
    format: function (ctx) {
      return '🍺 Barrel (' + ctx.tapsRemaining + '/' + ctx.maxTaps + ') — tap for ' + ctx.item.desc;
    },
    formatEmpty: function () { return '🍺 Barrel — foam, no draft left.'; },
    onTap: function (ctx) {
      _applyEffect(ctx.item);
      _toast(ctx.item.emoji + ' ' + ctx.item.name + ' — ' + ctx.item.desc);
    }
  });

  // ── FUNGAL_PATCH (walkable) ─────────────────────────────────────

  ClickyMinigame.registerRecipe(TILES.FUNGAL_PATCH, {
    tileId: TILES.FUNGAL_PATCH,
    walkable: true,
    peek: true,
    showDelay: 500,
    maxTaps: 2,
    sound: 'pickup-success',
    menu: [
      { emoji: '🍄', name: 'Glow Cap',    effect: 'glow', amount: 1, floors: 1, desc: 'Light radius up (1 floor)' },
      { emoji: '🌱', name: 'Spore Tonic', effect: 'heal', amount: 2,            desc: '+2 HP' }
    ],
    format: function (ctx) {
      return '🍄 Fungal patch (' + ctx.tapsRemaining + '/' + ctx.maxTaps + ') — harvest for ' + ctx.item.desc;
    },
    formatEmpty: function () { return '🍄 Fungal patch — substrate is spent.'; },
    onTap: function (ctx) {
      _applyEffect(ctx.item);
      _toast(ctx.item.emoji + ' ' + ctx.item.name + ' — ' + ctx.item.desc);
    }
  });

  console.log('[ClickyRecipes] Registered Tier 1: WELL, ANVIL, SOUP_KITCHEN, BARREL, FUNGAL_PATCH');
})();

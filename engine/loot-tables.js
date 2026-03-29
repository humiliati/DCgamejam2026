/**
 * LootTables — procedural loot generation from data/loot-tables.json.
 *
 * Replaces the previous 17-line stub. Adapted from EyesOnly's
 * LootTableManager (772 lines) with DG-specific schema and RNG.
 *
 * Public API:
 *   LootTables.init()                              — load JSON (sync XHR)
 *   LootTables.rollBreakableLoot(tableKey, floor)  — [{type,amount?,itemId?}]
 *   LootTables.getBiomeProps(biome)                — prop list for BreakableSpawner
 *   LootTables.rollGold(biome, floor)              — gold amount for WorldItems
 *   LootTables.rollBattery(biome)                  — battery count for WorldItems
 *   LootTables.rollFood(pool)                      — pick food itemId from named pool
 *   LootTables.rollEnemyLoot(profile, tier, floor) — enemy drop summary
 *
 * Layer 1 — depends on: SeededRNG (rng.js)
 */
var LootTables = (function () {
  'use strict';

  var _data   = null;
  var _loaded = false;

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Load data/loot-tables.json via synchronous XHR.
   * Call once from Game.init() before floor generation.
   * Intentional sync: keeps IIFE module pattern; avoids async cascade
   * on webOS where Promise timing is unreliable during app startup.
   */
  function init() {
    if (_loaded) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/loot-tables.json', false);
      xhr.send();
      if (xhr.status === 200) {
        _data = JSON.parse(xhr.responseText);
        _loaded = true;
        console.log('[LootTables] Loaded v' + _data.version);
      } else {
        console.warn('[LootTables] HTTP ' + xhr.status + ' — using fallback');
        _data = _fallback();
        _loaded = true;
      }
    } catch (e) {
      console.error('[LootTables] Load failed:', e);
      _data = _fallback();
      _loaded = true;
    }
  }

  function _fallback() {
    return {
      version: '0.0.0-fallback',
      enemy_resource_profiles: {},
      enemy_tier_multipliers: { standard: { xp: 10 }, elite: { xp: 30 }, boss: { xp: 100 } },
      card_drops: { cellar: {}, foundry: {}, sealab: {} },
      breakable_loot: {},
      biome_props: { cellar: [], foundry: [], sealab: [] },
      walk_over_collectibles: {
        food_pools: {},
        gold_amounts:    { cellar: { min:1, max:3 }, foundry: { min:2, max:5 }, sealab: { min:3, max:8 } },
        battery_amounts: { cellar: { min:1, max:1 }, foundry: { min:1, max:2 }, sealab: { min:1, max:2 } }
      },
      floor_currency_scale: { _default: 1.0 },
      economy_settings: { max_floor_items: 24, corpse_loot_count: { min:2, max:4 } }
    };
  }

  // ── RNG helpers ──────────────────────────────────────────────────

  function _roll()           { return SeededRNG.random(); }
  function _randInt(min, max) { return SeededRNG.randInt(min, max); }

  /** Weighted pick from [{ id|itemId, weight }] pool array. */
  function _weightedPick(pool) {
    if (!pool || !pool.length) return null;
    var total = pool.reduce(function (s, e) { return s + (e.weight || 0); }, 0);
    if (total <= 0) return pool[0];
    var r = _roll() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= (pool[i].weight || 0);
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function _floorScale(floor) {
    var scale = _data.floor_currency_scale || {};
    return scale[String(floor)] || scale['_default'] || 1.0;
  }

  // ── Breakable loot ───────────────────────────────────────────────

  /**
   * Roll loot from a destroyed breakable prop.
   * @param {string} tableKey - e.g. 'barrel', 'crate', 'slag_bin'
   * @param {number} floor    - Current floor number (for currency scaling)
   * @returns {Array} [{type:'gold'|'battery'|'food'|'salvage', amount?, itemId?, partId?}]
   */
  function rollBreakableLoot(tableKey, floor) {
    if (!_loaded) init();
    floor = floor || 1;

    var table = (_data.breakable_loot && _data.breakable_loot[tableKey])
             || (_data.breakable_loot && _data.breakable_loot['breakable_default'])
             || {};
    var drops = [];
    var scale = _floorScale(floor);

    // Gold / currency
    if (table.currency && table.currency.enabled !== false && _roll() < (table.currency.chance || 0)) {
      var cMin = table.currency.min || 1;
      var cMax = Math.max(cMin, Math.round((table.currency.max || 4) * scale));
      drops.push({ type: 'gold', amount: _randInt(cMin, cMax) });
    }

    // Battery
    if (table.battery && table.battery.enabled !== false && _roll() < (table.battery.chance || 0)) {
      drops.push({ type: 'battery', amount: _randInt(table.battery.min || 1, table.battery.max || 1) });
    }

    // Food
    if (table.food && table.food.enabled !== false && _roll() < (table.food.chance || 0)) {
      var pool = typeof table.food.pool === 'string' ? table.food.pool : 'common_food';
      var foodId = rollFood(pool);
      if (foodId) drops.push({ type: 'food', itemId: foodId });
    }

    // Salvage parts (bag-item — BreakableSpawner adds to Salvage staged pool or bag)
    if (table.salvage && table.salvage.enabled !== false && _roll() < (table.salvage.chance || 0)) {
      var salPool = table.salvage.pool || [];
      if (salPool.length) drops.push({ type: 'salvage', partId: salPool[_randInt(0, salPool.length - 1)] });
    }

    return drops;
  }

  // ── Biome props ──────────────────────────────────────────────────

  /**
   * Get the breakable prop list for a biome (used by BreakableSpawner).
   * @param {string} biome - 'cellar' | 'foundry' | 'sealab'
   * @returns {Array}
   */
  function getBiomeProps(biome) {
    if (!_loaded) init();
    return (_data.biome_props && _data.biome_props[biome]) || [];
  }

  // ── Walk-over collectible rollers ────────────────────────────────

  /**
   * Roll a gold amount for a walk-over gold tile spawned from breakable loot.
   * @param {string} biome
   * @param {number} floor
   * @returns {number}
   */
  function rollGold(biome, floor) {
    if (!_loaded) init();
    var woc = _data.walk_over_collectibles || {};
    var range = (woc.gold_amounts && woc.gold_amounts[biome]) || { min: 1, max: 3 };
    var scale = _floorScale(floor || 1);
    return _randInt(range.min, Math.max(range.min, Math.round(range.max * scale)));
  }

  /**
   * Roll a battery count for a walk-over battery tile.
   * @param {string} biome
   * @returns {number}
   */
  function rollBattery(biome) {
    if (!_loaded) init();
    var woc = _data.walk_over_collectibles || {};
    var range = (woc.battery_amounts && woc.battery_amounts[biome]) || { min: 1, max: 1 };
    return _randInt(range.min, range.max);
  }

  /**
   * Pick a random food itemId from a named pool.
   * @param {string} poolName - Key in walk_over_collectibles.food_pools
   * @returns {string|null}
   */
  function rollFood(poolName) {
    if (!_loaded) init();
    var woc = _data.walk_over_collectibles || {};
    var pools = woc.food_pools || {};
    var pool = pools[poolName] || pools['common_food'];
    if (!pool || !pool.length) return null;
    var picked = _weightedPick(pool);
    return picked ? (picked.itemId || picked.id || null) : null;
  }

  // ── Enemy loot summary ───────────────────────────────────────────

  /**
   * Roll what drops from an enemy death.
   * @param {string} profile - 'undead' | 'construct' | 'organic' | 'marine'
   * @param {string} tier    - 'standard' | 'elite' | 'boss'
   * @param {number} floor
   * @returns {Object} { currency, battery, food, dropCard, xp }
   */
  function rollEnemyLoot(profile, tier, floor) {
    if (!_loaded) init();
    floor = floor || 1;

    var prof    = (_data.enemy_resource_profiles && _data.enemy_resource_profiles[profile]) || {};
    var tierMod = (_data.enemy_tier_multipliers  && _data.enemy_tier_multipliers[tier])     || { xp: 10 };
    var scale   = _floorScale(floor);
    var result  = { currency: 0, battery: 0, food: null, dropCard: false, xp: tierMod.xp || 10 };

    // Currency
    if (prof.currency && prof.currency.enabled !== false && _roll() < (prof.currency.chance || 0)) {
      var cMin = prof.currency.min || 1;
      var cMax = Math.round((prof.currency.max || 4) * (tierMod.currency_max_mult || 1.0) * scale);
      result.currency = _randInt(cMin, Math.max(cMin, cMax));
    }

    // Battery
    if (prof.battery && prof.battery.enabled !== false && _roll() < (prof.battery.chance || 0)) {
      result.battery = _randInt(prof.battery.min || 1, prof.battery.max || 1);
    }

    // Food (organic profile mainly)
    if (prof.food && prof.food.enabled !== false && _roll() < (prof.food.chance || 0)) {
      var fPool = typeof prof.food.pool === 'string' ? prof.food.pool
                : (Array.isArray(prof.food.pool) && prof.food.pool.length ? prof.food.pool[0] : 'common_food');
      result.food = rollFood(fPool);
    }

    // Card drop
    var cardChance = ((prof.card && prof.card.enabled !== false) ? (prof.card.chance || 0) : 0)
                   + (tierMod.card_chance_add || 0);
    if (_roll() < cardChance) result.dropCard = true;
    if (tierMod.guaranteed_drop && tierMod.guaranteed_type === 'card') result.dropCard = true;

    return result;
  }

  // ── Economy helpers ──────────────────────────────────────────────

  /** Max ground items allowed on a floor at once. */
  function maxFloorItems() {
    return (_data && _data.economy_settings && _data.economy_settings.max_floor_items) || 24;
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    init:              init,
    rollBreakableLoot: rollBreakableLoot,
    getBiomeProps:     getBiomeProps,
    rollGold:          rollGold,
    rollBattery:       rollBattery,
    rollFood:          rollFood,
    rollEnemyLoot:     rollEnemyLoot,
    maxFloorItems:     maxFloorItems
  };
})();

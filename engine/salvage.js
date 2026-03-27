/**
 * Salvage — necro-salvage harvest + faction shop economy.
 *
 * Core gameplay loop:
 *   1. Player finds CORPSE tiles (left by the Hero's rampage)
 *   2. Press [F] to harvest → typed parts go into bag
 *   3. Sell parts at faction shops → gold + reputation
 *   4. Each faction pays bonus for their preferred part types
 *   5. Higher reputation tiers unlock better card inventory
 *
 * Three factions:
 *   - Tide Council  (old fishing families, want dragon relics/scales)
 *   - The Foundry   (industrial consortium, want scrap/monster parts)
 *   - The Admiralty  (naval research, want specimens/data crystals)
 *
 * Layer 1 (Core systems). Depends on: TILES, SeededRNG
 * Wired by Game (Layer 4) via callbacks to Player, Toast, FloorManager.
 */
var Salvage = (function () {
  'use strict';

  // ── Part Definitions ──────────────────────────────────────────
  // Each part has: id, name, emoji, baseValue, tags[]
  // Tags determine which factions pay bonus prices.

  var PARTS = [
    { id: 'scale',   name: 'Dragon Scale',    emoji: '🐉', baseValue: 3, tags: ['dragon', 'organic'] },
    { id: 'bone',    name: 'Monster Bone',     emoji: '🦴', baseValue: 2, tags: ['organic', 'common'] },
    { id: 'organ',   name: 'Vital Organ',      emoji: '🫀', baseValue: 4, tags: ['organic', 'rare'] },
    { id: 'scrap',   name: 'Metal Scrap',      emoji: '⚙️', baseValue: 2, tags: ['metal', 'common'] },
    { id: 'crystal', name: 'Data Crystal',     emoji: '💎', baseValue: 5, tags: ['arcane', 'rare'] },
    { id: 'ichor',   name: 'Monster Ichor',    emoji: '🧪', baseValue: 3, tags: ['organic', 'arcane'] },
    { id: 'hide',    name: 'Tough Hide',       emoji: '🛡️', baseValue: 2, tags: ['organic', 'common'] },
    { id: 'ember',   name: 'Dragon Ember',     emoji: '🔥', baseValue: 4, tags: ['dragon', 'arcane'] }
  ];

  // Quick lookup by id
  var PART_BY_ID = {};
  for (var i = 0; i < PARTS.length; i++) {
    PART_BY_ID[PARTS[i].id] = PARTS[i];
  }

  // ── Loot Tables by Biome ──────────────────────────────────────
  // Each biome has a weighted pool of part IDs.
  // Weights don't need to sum to 1 — they're relative.

  var LOOT_POOLS = {
    cellar: [
      { id: 'bone',  weight: 4 },
      { id: 'organ', weight: 2 },
      { id: 'scale', weight: 1 },
      { id: 'hide',  weight: 3 }
    ],
    foundry: [
      { id: 'scrap',  weight: 5 },
      { id: 'bone',   weight: 2 },
      { id: 'ember',  weight: 1 },
      { id: 'ichor',  weight: 2 }
    ],
    sealab: [
      { id: 'crystal', weight: 3 },
      { id: 'ichor',   weight: 3 },
      { id: 'organ',   weight: 2 },
      { id: 'scale',   weight: 2 }
    ],
  };

  // ── Faction Definitions ───────────────────────────────────────
  // priceMultipliers: tag → multiplier (default 1.0 for unlisted)
  // repTiers: cumulative items sold thresholds

  var FACTIONS = {
    tide: {
      id: 'tide',
      nameKey: 'shop.tide_name',
      descKey: 'shop.tide_desc',
      emoji: '🌊',
      priceMultipliers: {
        dragon: 2.0,
        organic: 1.5,
        rare: 1.3
      },
      repTiers: [5, 15, 30],    // items sold for tier 1/2/3
      flagKey: 'faction.tide'    // Player flag key for rep counter
    },
    foundry: {
      id: 'foundry',
      nameKey: 'shop.foundry_name',
      descKey: 'shop.foundry_desc',
      emoji: '🔨',
      priceMultipliers: {
        metal: 2.0,
        common: 1.5,
        organic: 0.8
      },
      repTiers: [5, 15, 30],
      flagKey: 'faction.foundry'
    },
    admiralty: {
      id: 'admiralty',
      nameKey: 'shop.admiralty_name',
      descKey: 'shop.admiralty_desc',
      emoji: '⚓',
      priceMultipliers: {
        arcane: 2.0,
        rare: 1.5,
        dragon: 1.3
      },
      repTiers: [5, 15, 30],
      flagKey: 'faction.admiralty'
    }
  };

  // ── Harvest State ─────────────────────────────────────────────
  // Track which corpse tiles have been fully harvested (by floor+pos)
  // Key: "floorId:x:y" → number of harvests remaining

  var _harvestState = {};

  // ── Loot Staging ──────────────────────────────────────────────
  // When the player opens a corpse, all available loot is pre-rolled
  // into _stagedLoot[]. The MenuBox renders this array and lets the
  // player pick items into their bag. Unclaimed items stay on the
  // corpse (re-staged next open).

  var _stagedLoot = [];
  var _stagedCorpse = null; // { x, y, floorId }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Attempt to harvest a corpse tile.
   * @param {number} x - Grid X of corpse
   * @param {number} y - Grid Y of corpse
   * @param {string} floorId - Current floor ID
   * @param {string} biome - Current biome (for loot pool)
   * @returns {Object|null} Part item if successful, null if depleted
   */
  function harvest(x, y, floorId, biome) {
    var key = floorId + ':' + x + ':' + y;

    // First harvest at this tile? Init with 1-3 harvests
    if (_harvestState[key] === undefined) {
      _harvestState[key] = SeededRNG.randInt(1, 3);
    }

    if (_harvestState[key] <= 0) {
      return null; // Depleted
    }

    _harvestState[key]--;

    // Roll a part from the biome's loot pool
    var pool = LOOT_POOLS[biome] || LOOT_POOLS.cellar;
    var partId = _weightedPick(pool);
    var partDef = PART_BY_ID[partId];

    if (!partDef) return null;

    // Create an inventory item
    return {
      id: partDef.id + '_' + Date.now(),
      partId: partDef.id,
      type: 'salvage',
      name: partDef.name,
      emoji: partDef.emoji,
      tags: partDef.tags,
      baseValue: partDef.baseValue
    };
  }

  /**
   * Check if a corpse tile still has harvests remaining.
   */
  function hasHarvests(x, y, floorId) {
    var key = floorId + ':' + x + ':' + y;
    if (_harvestState[key] === undefined) return true; // Not yet visited
    return _harvestState[key] > 0;
  }

  // ── Loot Staging API (for MenuBox harvest UI) ──────────────────

  /**
   * Roll all available loot from a corpse and stage it for display.
   * Opens the "harvest window" — caller should open MenuBox with 'harvest' context.
   *
   * @param {number} x - Grid X of corpse
   * @param {number} y - Grid Y of corpse
   * @param {string} floorId - Current floor ID
   * @param {string} biome - Current biome
   * @returns {Array} Staged loot items
   */
  function prepareLoot(x, y, floorId, biome) {
    var key = floorId + ':' + x + ':' + y;

    // Init remaining harvests if first time
    if (_harvestState[key] === undefined) {
      _harvestState[key] = SeededRNG.randInt(1, 3);
    }

    _stagedCorpse = { x: x, y: y, floorId: floorId };
    _stagedLoot = [];

    // Roll items for each remaining harvest
    var remaining = _harvestState[key];
    var pool = LOOT_POOLS[biome] || LOOT_POOLS.cellar;

    for (var i = 0; i < remaining; i++) {
      var partId = _weightedPick(pool);
      var partDef = PART_BY_ID[partId];
      if (!partDef) continue;

      _stagedLoot.push({
        id: partDef.id + '_' + Date.now() + '_' + i,
        partId: partDef.id,
        type: 'salvage',
        name: partDef.name,
        emoji: partDef.emoji,
        tags: partDef.tags.slice(),
        baseValue: partDef.baseValue
      });
    }

    return _stagedLoot;
  }

  /**
   * Take a staged loot item by index. Returns the item or null.
   * Decrements the corpse's remaining harvest count.
   */
  function takeLoot(index) {
    if (index < 0 || index >= _stagedLoot.length) return null;
    if (!_stagedCorpse) return null;

    var item = _stagedLoot.splice(index, 1)[0];

    // Decrement remaining harvests
    var key = _stagedCorpse.floorId + ':' + _stagedCorpse.x + ':' + _stagedCorpse.y;
    if (_harvestState[key] !== undefined && _harvestState[key] > 0) {
      _harvestState[key]--;
    }

    return item;
  }

  /**
   * Get the current staged loot array (for rendering).
   */
  function getStagedLoot() {
    return _stagedLoot;
  }

  /**
   * Get the position of the currently open corpse.
   */
  function getStagedCorpse() {
    return _stagedCorpse;
  }

  /**
   * Close the loot staging (when MenuBox closes).
   * Unclaimed items remain on the corpse for next time.
   */
  function closeLoot() {
    _stagedLoot = [];
    _stagedCorpse = null;
  }

  /**
   * Calculate the sell price of a salvage item at a faction shop.
   * @param {Object} item - Item from harvest()
   * @param {string} factionId - 'tide', 'foundry', or 'admiralty'
   * @returns {number} Gold value
   */
  function getSellPrice(item, factionId) {
    var faction = FACTIONS[factionId];
    if (!faction || !item.tags) return item.baseValue || 1;

    var bestMult = 1.0;
    for (var i = 0; i < item.tags.length; i++) {
      var m = faction.priceMultipliers[item.tags[i]];
      if (m && m > bestMult) bestMult = m;
    }

    return Math.max(1, Math.round(item.baseValue * bestMult));
  }

  /**
   * Get the current reputation tier for a faction (0-3).
   * Reads from Player flags.
   * @param {string} factionId
   * @param {function} getFlagFn - Player.getFlag
   * @returns {number} Tier (0 = unranked, 1-3 = ranked)
   */
  function getRepTier(factionId, getFlagFn) {
    var faction = FACTIONS[factionId];
    if (!faction) return 0;

    var sold = getFlagFn(faction.flagKey) || 0;
    var tier = 0;
    for (var i = 0; i < faction.repTiers.length; i++) {
      if (sold >= faction.repTiers[i]) tier = i + 1;
    }
    return tier;
  }

  /**
   * Record a sale and increment faction reputation.
   * @param {string} factionId
   * @param {function} getFlagFn - Player.getFlag
   * @param {function} setFlagFn - Player.setFlag
   * @returns {Object} { newCount, newTier, tierChanged }
   */
  function recordSale(factionId, getFlagFn, setFlagFn) {
    var faction = FACTIONS[factionId];
    if (!faction) return { newCount: 0, newTier: 0, tierChanged: false };

    var oldTier = getRepTier(factionId, getFlagFn);
    var count = (getFlagFn(faction.flagKey) || 0) + 1;
    setFlagFn(faction.flagKey, count);
    var newTier = getRepTier(factionId, getFlagFn);

    return {
      newCount: count,
      newTier: newTier,
      tierChanged: newTier > oldTier
    };
  }

  /**
   * Get faction data for UI display.
   */
  function getFaction(factionId) {
    return FACTIONS[factionId] || null;
  }

  /**
   * Get all faction IDs.
   */
  function getFactionIds() {
    return ['tide', 'foundry', 'admiralty'];
  }

  /**
   * Get all part definitions (for UI/shop display).
   */
  function getPartDefs() {
    return PARTS;
  }

  /**
   * Get part definition by id.
   */
  function getPartDef(partId) {
    return PART_BY_ID[partId] || null;
  }

  /**
   * Place corpse tiles on a generated floor.
   * Called by GridGen or FloorManager after generation.
   * Corpses appear in rooms where the Hero left destruction.
   *
   * @param {Array[]} grid - 2D tile grid (mutated in place)
   * @param {Array} rooms - Room list from GridGen
   * @param {number} W - Grid width
   * @param {number} H - Grid height
   * @param {number} floor - Floor number (scales density)
   */
  function placeCorpses(grid, rooms, W, H, floor) {
    // 2-5 corpses per floor, scaling slightly with depth
    var count = Math.min(6, 2 + Math.floor(floor * 0.5) + SeededRNG.randInt(0, 1));

    for (var c = 0; c < count; c++) {
      // Pick a room that isn't the first (spawn room) or last (stairs room)
      var roomIdx = SeededRNG.randInt(1, Math.max(1, rooms.length - 2));
      var room = rooms[roomIdx];
      if (!room) continue;

      var cx = room.x + SeededRNG.randInt(1, room.w - 2);
      var cy = room.y + SeededRNG.randInt(1, room.h - 2);

      if (cx > 0 && cx < W - 1 && cy > 0 && cy < H - 1 &&
          grid[cy][cx] === TILES.EMPTY) {
        grid[cy][cx] = TILES.CORPSE;
      }
    }
  }

  /**
   * Clear harvest state (on new game).
   */
  function reset() {
    _harvestState = {};
  }

  // ── Helpers ───────────────────────────────────────────────────

  function _weightedPick(pool) {
    var total = 0;
    for (var i = 0; i < pool.length; i++) {
      total += pool[i].weight;
    }
    var roll = SeededRNG.random() * total;
    var sum = 0;
    for (var j = 0; j < pool.length; j++) {
      sum += pool[j].weight;
      if (roll < sum) return pool[j].id;
    }
    return pool[pool.length - 1].id;
  }

  // ── Freeze & Return ───────────────────────────────────────────

  return {
    // Harvest (single-item — used by quick-harvest fallback)
    harvest: harvest,
    hasHarvests: hasHarvests,
    placeCorpses: placeCorpses,

    // Loot staging (MenuBox harvest UI)
    prepareLoot: prepareLoot,
    takeLoot: takeLoot,
    getStagedLoot: getStagedLoot,
    getStagedCorpse: getStagedCorpse,
    closeLoot: closeLoot,

    // Economy
    getSellPrice: getSellPrice,
    getRepTier: getRepTier,
    recordSale: recordSale,

    // Data access
    getFaction: getFaction,
    getFactionIds: getFactionIds,
    getPartDefs: getPartDefs,
    getPartDef: getPartDef,

    // Lifecycle
    reset: reset,

    // Constants (for external modules)
    FACTIONS: FACTIONS,
    PARTS: PARTS
  };
})();

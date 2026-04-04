/**
 * CleaningSystem — blood splatter tracking and cleaning.
 *
 * When an enemy dies, surrounding tiles get blood splatter. The Gleaner
 * cleans blood by facing a dirty tile and pressing OK. Each scrub clears
 * one layer. Clean all blood on a floor to reach 100% cleanliness.
 *
 * The cleaning readiness score feeds into the floor's overall readiness
 * calculation (weighted 30% of total).
 *
 * Blood tiles are stored per-floor so they persist when the player
 * leaves and returns within the same session.
 *
 * Layer 1 — depends on: TILES, SeededRNG (for splatter pattern)
 */
var CleaningSystem = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var MAX_BLOOD = 3;           // Max blood layers per tile (3 scrubs to clean)
  var SPLATTER_RADIUS = 2;     // Tiles around a corpse that get blood
  var BLOOD_PER_KILL = 2;      // Default blood layers added per corpse event
  var CLEAN_TIME_MS = 400;     // Base cooldown between scrubs (ms)

  // ── Tool speed multipliers (C3) ─────────────────────────────────
  // The equipped cleaning tool reduces scrub cooldown.
  // Key = item.subtype (set on cleaning tool items in loot-tables).
  var TOOL_SPEED = {
    'rag':   1.0,    // Default (bare hands same as rag)
    'mop':   0.6,    // 240ms cooldown
    'brush': 0.35    // 140ms cooldown
  };

  // ── State ───────────────────────────────────────────────────────
  // _bloodMap[floorId] = { "x,y": bloodLevel (1–3), ... }
  var _bloodMap = {};
  var _lastCleanTime = 0;

  // ── Blood placement ─────────────────────────────────────────────

  /**
   * Add blood splatter around a kill site. Called when an enemy dies.
   *
   * @param {number} cx - Corpse tile X
   * @param {number} cy - Corpse tile Y
   * @param {string} floorId - Current floor ID
   * @param {Array}  grid - 2D tile grid (for walkability check)
   * @param {number} gridW - Grid width
   * @param {number} gridH - Grid height
   * @param {number} [layers] - Blood intensity (default BLOOD_PER_KILL)
   */
  function addBlood(cx, cy, floorId, grid, gridW, gridH, layers) {
    if (!_bloodMap[floorId]) _bloodMap[floorId] = {};
    var map = _bloodMap[floorId];
    layers = layers || BLOOD_PER_KILL;

    for (var dy = -SPLATTER_RADIUS; dy <= SPLATTER_RADIUS; dy++) {
      for (var dx = -SPLATTER_RADIUS; dx <= SPLATTER_RADIUS; dx++) {
        var tx = cx + dx;
        var ty = cy + dy;
        if (tx < 0 || tx >= gridW || ty < 0 || ty >= gridH) continue;

        // Only splatter walkable tiles (not walls, pillars, etc.)
        var tile = grid[ty][tx];
        if (!TILES.isWalkable(tile)) continue;

        // Manhattan distance for splatter falloff
        var dist = Math.abs(dx) + Math.abs(dy);
        if (dist > SPLATTER_RADIUS) continue;

        // Closer tiles get more blood
        var amount = Math.max(1, layers - dist + 1);
        var key = tx + ',' + ty;
        var current = map[key] || 0;
        map[key] = Math.min(MAX_BLOOD, current + amount);
      }
    }
  }

  /**
   * Manually set blood at a specific tile (for pre-placed hero carnage).
   */
  function setBlood(x, y, floorId, layers) {
    if (!_bloodMap[floorId]) _bloodMap[floorId] = {};
    _bloodMap[floorId][x + ',' + y] = Math.min(MAX_BLOOD, Math.max(0, layers));
  }

  // ── Cleaning ────────────────────────────────────────────────────

  /**
   * Scrub one layer of blood from a tile. Returns true if scrub succeeded.
   *
   * @param {number} x - Tile X
   * @param {number} y - Tile Y
   * @param {string} floorId - Floor ID
   * @param {string} [toolSubtype] - Equipped tool subtype ('rag'|'mop'|'brush')
   * @returns {boolean} True if a layer was cleaned
   */
  function scrub(x, y, floorId, toolSubtype) {
    var now = Date.now();
    var mult = (toolSubtype && TOOL_SPEED[toolSubtype]) || TOOL_SPEED['rag'];
    var cooldown = Math.round(CLEAN_TIME_MS * mult);
    if (now - _lastCleanTime < cooldown) return false;

    var map = _bloodMap[floorId];
    if (!map) return false;

    var key = x + ',' + y;
    var level = map[key];
    if (!level || level <= 0) return false;

    level--;
    _lastCleanTime = now;

    if (level <= 0) {
      delete map[key];
    } else {
      map[key] = level;
    }

    return true;
  }

  // ── Query ───────────────────────────────────────────────────────

  /**
   * Get blood level at a tile (0 = clean, 1–3 = dirty).
   */
  function getBlood(x, y, floorId) {
    var map = _bloodMap[floorId];
    if (!map) return 0;
    return map[x + ',' + y] || 0;
  }

  /**
   * Check if a tile has blood on it.
   */
  function isDirty(x, y, floorId) {
    return getBlood(x, y, floorId) > 0;
  }

  /**
   * Get all dirty tile positions on a floor.
   * @returns {Array} [{x, y, level}, ...]
   */
  function getDirtyTiles(floorId) {
    var map = _bloodMap[floorId];
    if (!map) return [];
    var result = [];
    for (var key in map) {
      if (map.hasOwnProperty(key)) {
        var parts = key.split(',');
        result.push({ x: parseInt(parts[0]), y: parseInt(parts[1]), level: map[key] });
      }
    }
    return result;
  }

  /**
   * Calculate cleaning readiness for a floor (0.0 = all dirty, 1.0 = all clean).
   * If there are no blood tiles tracked, returns 1.0 (fully clean).
   */
  function getReadiness(floorId) {
    var map = _bloodMap[floorId];
    if (!map) return 1.0;

    var totalBlood = 0;
    var count = 0;
    for (var key in map) {
      if (map.hasOwnProperty(key)) {
        totalBlood += map[key];
        count++;
      }
    }
    if (count === 0) return 1.0;

    // Max possible blood = count * MAX_BLOOD. Readiness = 1 - (actual / max)
    return 1.0 - (totalBlood / (count * MAX_BLOOD));
  }

  /**
   * Get total tile count and clean tile count for HUD display.
   */
  function getStats(floorId) {
    var map = _bloodMap[floorId];
    if (!map) return { dirty: 0, total: 0 };
    var dirty = 0;
    for (var key in map) {
      if (map.hasOwnProperty(key) && map[key] > 0) dirty++;
    }
    return { dirty: dirty, total: dirty };
  }

  // ── Floor lifecycle ─────────────────────────────────────────────

  /**
   * Clear all blood data for a floor (on reset/new generation).
   */
  function clearFloor(floorId) {
    delete _bloodMap[floorId];
  }

  /**
   * Seed initial blood on a dungeon floor based on corpse positions.
   * Called after enemy spawn to pre-dirty the hero's carnage.
   *
   * @param {string} floorId
   * @param {Array}  enemies - Enemy list (looks for dead/corpse entities)
   * @param {Array}  grid - 2D tile grid
   * @param {number} gridW
   * @param {number} gridH
   */
  function seedFromCorpses(floorId, grid, gridW, gridH) {
    // Ensure the blood map exists for this floor even if no corpse tiles
    // are found.  This marks the floor as "seeded" so revisits don't
    // re-seed after the player has cleaned everything.
    if (!_bloodMap[floorId]) _bloodMap[floorId] = {};

    // Walk the grid looking for CORPSE tiles
    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        if (grid[y][x] === TILES.CORPSE) {
          addBlood(x, y, floorId, grid, gridW, gridH, MAX_BLOOD);
        }
      }
    }
  }

  /**
   * Has blood ever been seeded on this floor?
   * Returns true if seedFromCorpses has run (even if all blood is now
   * cleaned).  Used by floor-load to avoid re-seeding on revisit.
   */
  function isSeeded(floorId) {
    return _bloodMap[floorId] !== undefined;
  }

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    addBlood:        addBlood,
    setBlood:        setBlood,
    scrub:           scrub,
    getBlood:        getBlood,
    isDirty:         isDirty,
    getDirtyTiles:   getDirtyTiles,
    getReadiness:    getReadiness,
    getStats:        getStats,
    clearFloor:      clearFloor,
    seedFromCorpses: seedFromCorpses,
    isSeeded:        isSeeded,
    MAX_BLOOD:       MAX_BLOOD,
    TOOL_SPEED:      TOOL_SPEED
  });
})();

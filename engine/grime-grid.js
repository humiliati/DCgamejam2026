/**
 * GrimeGrid — Sub-tile grime data for Pressure Washing (PW-1).
 *
 * Each grime-bearing tile gets a small Uint8Array grid tracking dirtiness
 * at sub-tile precision. Two resolutions by surface:
 *   - Floor tiles: 4×4 (16 cells) — coarse, walk-over cleaning
 *   - Wall tiles:  16×16 (256 cells) — fine-grained, cursor-aimed scrubbing
 *
 * Values: 0 = clean, 255 = fully dirty.
 * The raycaster reads grids via get() and blends a translucent tint per
 * subcell. The spray/brush system writes via clean().
 *
 * Allocation is lazy — grids are created by HeroSystem.applyCarnageManifest
 * when heroes dirty tiles, or by CleaningSystem.seedFloor for pre-placed
 * carnage tiles.
 *
 * Layer 1 (depends on: nothing — pure data structure)
 */
var GrimeGrid = (function () {
  'use strict';

  // ── Resolution constants ─────────────────────────────────────
  var FLOOR_RES = 4;    // 4×4 subcells per floor tile
  var WALL_RES  = 16;   // 16×16 subcells per wall tile

  // ── Storage ──────────────────────────────────────────────────
  // Keyed by "floorId:x,y" → { data: Uint8Array(res*res), res: number }
  var _grids = {};

  // ── Key helper ───────────────────────────────────────────────
  function _key(floorId, x, y) {
    return floorId + ':' + x + ',' + y;
  }

  // ── Allocation ───────────────────────────────────────────────

  /**
   * Allocate a grime grid for one tile.
   * If a grid already exists for this key, it is overwritten.
   *
   * @param {string} floorId
   * @param {number} x — tile X
   * @param {number} y — tile Y
   * @param {number} resolution — subcell count per axis (4 or 16)
   * @param {number} initialLevel — 0–255 fill value
   * @returns {Object} the grid object { data, res }
   */
  function allocate(floorId, x, y, resolution, initialLevel) {
    var key = _key(floorId, x, y);
    var size = resolution * resolution;
    var grid = new Uint8Array(size);
    if (initialLevel > 0) {
      grid.fill(Math.min(255, Math.max(0, initialLevel | 0)));
    }
    var entry = { data: grid, res: resolution };
    _grids[key] = entry;
    return entry;
  }

  /**
   * Allocate a floor-resolution (4×4) grime grid.
   */
  function allocateFloor(floorId, x, y, initialLevel) {
    return allocate(floorId, x, y, FLOOR_RES, initialLevel);
  }

  /**
   * Allocate a wall-resolution (16×16) grime grid.
   */
  function allocateWall(floorId, x, y, initialLevel) {
    return allocate(floorId, x, y, WALL_RES, initialLevel);
  }

  // ── Lookup ───────────────────────────────────────────────────

  /**
   * Get the grime grid for a tile, or null if none allocated.
   * Returns { data: Uint8Array, res: number } or null.
   *
   * @param {string} floorId
   * @param {number} x
   * @param {number} y
   */
  function get(floorId, x, y) {
    return _grids[_key(floorId, x, y)] || null;
  }

  /**
   * Check if a grime grid exists for a tile.
   */
  function has(floorId, x, y) {
    return _key(floorId, x, y) in _grids;
  }

  // ── Cleaning ─────────────────────────────────────────────────

  /**
   * Reduce grime at a specific subcell.
   *
   * @param {string} floorId
   * @param {number} x — tile X
   * @param {number} y — tile Y
   * @param {number} subX — subcell column (0..res-1)
   * @param {number} subY — subcell row    (0..res-1)
   * @param {number} strength — amount to subtract (positive int)
   */
  function clean(floorId, x, y, subX, subY, strength) {
    var g = _grids[_key(floorId, x, y)];
    if (!g) return;
    var idx = subY * g.res + subX;
    if (idx < 0 || idx >= g.data.length) return;
    g.data[idx] = Math.max(0, g.data[idx] - (strength | 0));
  }

  /**
   * Apply a brush kernel centered on (subX, subY).
   * Cleans a (2*radius+1)² area with strength falloff.
   *
   * @param {string} floorId
   * @param {number} x — tile X
   * @param {number} y — tile Y
   * @param {number} subX — center subcell column
   * @param {number} subY — center subcell row
   * @param {number} strength — center strength
   * @param {number} radius — brush radius in subcells (default 1)
   */
  function cleanKernel(floorId, x, y, subX, subY, strength, radius) {
    var g = _grids[_key(floorId, x, y)];
    if (!g) return;
    radius = radius || 1;
    var res = g.res;
    for (var dy = -radius; dy <= radius; dy++) {
      var sy = subY + dy;
      if (sy < 0 || sy >= res) continue;
      for (var dx = -radius; dx <= radius; dx++) {
        var sx = subX + dx;
        if (sx < 0 || sx >= res) continue;
        // Linear falloff from center
        var dist = Math.max(Math.abs(dx), Math.abs(dy));  // Chebyshev
        var falloff = 1.0 - (dist / (radius + 1));
        var amount = (strength * falloff) | 0;
        if (amount < 1) continue;
        var idx = sy * res + sx;
        g.data[idx] = Math.max(0, g.data[idx] - amount);
      }
    }
  }

  // ── Readiness query ──────────────────────────────────────────

  /**
   * Returns 0.0 (fully dirty) to 1.0 (fully clean) for a single tile.
   * If no grid allocated, returns 1.0 (clean by default).
   */
  function getTileCleanliness(floorId, x, y) {
    var g = _grids[_key(floorId, x, y)];
    if (!g) return 1.0;
    var total = g.data.length;
    var sum = 0;
    for (var i = 0; i < total; i++) sum += g.data[i];
    // sum / (total * 255) = fraction dirty; 1 - that = cleanliness
    return 1.0 - (sum / (total * 255));
  }

  /**
   * Get floor-level readiness across all grids for a floorId.
   * Returns 0.0–1.0. If no grids allocated for this floor, returns 1.0.
   */
  function getFloorCleanliness(floorId) {
    var prefix = floorId + ':';
    var tileCount = 0;
    var cleanSum = 0;
    for (var key in _grids) {
      if (key.indexOf(prefix) !== 0) continue;
      tileCount++;
      var g = _grids[key];
      var total = g.data.length;
      var sum = 0;
      for (var i = 0; i < total; i++) sum += g.data[i];
      cleanSum += 1.0 - (sum / (total * 255));
    }
    return tileCount > 0 ? cleanSum / tileCount : 1.0;
  }

  /**
   * Count allocated grids on a floor (for stats/debug).
   */
  function getGridCount(floorId) {
    var prefix = floorId + ':';
    var count = 0;
    for (var key in _grids) {
      if (key.indexOf(prefix) === 0) count++;
    }
    return count;
  }

  // ── Floor lifecycle ──────────────────────────────────────────

  /**
   * Clear all grime grids for a floor (on dungeon reset or regen).
   */
  function clearFloor(floorId) {
    var prefix = floorId + ':';
    var toDelete = [];
    for (var key in _grids) {
      if (key.indexOf(prefix) === 0) toDelete.push(key);
    }
    for (var i = 0; i < toDelete.length; i++) {
      delete _grids[toDelete[i]];
    }
  }

  /**
   * Clear all grime grids everywhere (full reset).
   */
  function clearAll() {
    _grids = {};
  }

  // ── Debug ────────────────────────────────────────────────────

  /**
   * Dump a grid as a 2D ASCII block for console debugging.
   */
  function debugDump(floorId, x, y) {
    var g = _grids[_key(floorId, x, y)];
    if (!g) return '(no grid)';
    var lines = [];
    for (var row = 0; row < g.res; row++) {
      var chars = [];
      for (var col = 0; col < g.res; col++) {
        var v = g.data[row * g.res + col];
        if (v === 0) chars.push('.');
        else if (v < 64) chars.push('░');
        else if (v < 128) chars.push('▒');
        else if (v < 192) chars.push('▓');
        else chars.push('█');
      }
      lines.push(chars.join(''));
    }
    return lines.join('\n');
  }

  // ── Public API ───────────────────────────────────────────────

  return Object.freeze({
    // Constants
    FLOOR_RES:    FLOOR_RES,
    WALL_RES:     WALL_RES,

    // Allocation
    allocate:     allocate,
    allocateFloor: allocateFloor,
    allocateWall:  allocateWall,

    // Lookup
    get:          get,
    has:          has,

    // Cleaning
    clean:        clean,
    cleanKernel:  cleanKernel,

    // Readiness
    getTileCleanliness:  getTileCleanliness,
    getFloorCleanliness: getFloorCleanliness,
    getGridCount:        getGridCount,

    // Lifecycle
    clearFloor:   clearFloor,
    clearAll:     clearAll,

    // Debug
    debugDump:    debugDump
  });
})();

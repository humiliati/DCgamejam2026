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

  // ── Non-hose scrub → GrimeGrid tuning ──────────────────────────
  // A 4×4 floor grid has 16 subcells at ~180–200 grime each.
  // Target: 6–8 OK presses to fully clean one tile without a hose.
  //
  // Each press applies a cleanKernel centered on a cycling subcell
  // with radius 1 (covers 3×3 = 9 subcells, falloff reduces edges).
  // Strength 60 means center drops 60/press, neighbors ~30/press.
  //   Center: 200 / 60 ≈ 3.3 presses → clean after 4
  //   Edges:  200 / 30 ≈ 6.7 presses → clean after 7
  // The sweep index cycles across subcells so coverage is even.
  // Net result: ~6–8 presses to fully clear a tile.
  var SCRUB_GRIME_STRENGTH = 60;    // subcell grime removed at kernel center
  var SCRUB_GRIME_RADIUS   = 1;     // kernel radius (3×3 coverage)
  var _scrubSweepIndex     = 0;     // cycling center for non-hose scrub

  /**
   * Scrub one layer of blood from a tile AND clean GrimeGrid subcells
   * if present. Returns true if any cleaning happened (blood or grime).
   *
   * The non-hose path applies a modest GrimeGrid kernel each press.
   * For floor tiles this yields ~6–8 presses to fully clean.
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

    var bloodCleaned = false;
    var grimeCleaned = false;

    // ── Legacy blood layer ───────────────────────────────────────
    var map = _bloodMap[floorId];
    if (map) {
      var key = x + ',' + y;
      var level = map[key];
      if (level && level > 0) {
        level--;
        if (level <= 0) {
          delete map[key];
        } else {
          map[key] = level;
        }
        bloodCleaned = true;
      }
    }

    // ── GrimeGrid subcell cleaning (non-hose path) ──────────────
    if (typeof GrimeGrid !== 'undefined') {
      var g = GrimeGrid.get(floorId, x, y);
      if (g && g.res > 0) {
        // Cycle the kernel center across subcells for even coverage.
        // The sweep walks a 2D raster across the grid resolution.
        var totalSub = g.res * g.res;
        var idx = _scrubSweepIndex % totalSub;
        _scrubSweepIndex++;
        var subX = idx % g.res;
        var subY = Math.floor(idx / g.res);

        // Tool-speed scaling: better tools clean grime faster too
        var toolMult = (toolSubtype && TOOL_SPEED[toolSubtype]) || TOOL_SPEED['rag'];
        // Invert: lower TOOL_SPEED mult = faster → higher strength
        var strength = Math.round(SCRUB_GRIME_STRENGTH / toolMult);

        GrimeGrid.cleanKernel(floorId, x, y, subX, subY, strength, SCRUB_GRIME_RADIUS);
        grimeCleaned = true;
      }
    }

    if (bloodCleaned || grimeCleaned) {
      _lastCleanTime = now;
    }
    return bloodCleaned || grimeCleaned;
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
   * Check if a tile has blood or grime on it.
   * Checks both the legacy blood layer AND the GrimeGrid so that
   * tiles with only sub-tile grime (no flat blood) are still interactive.
   */
  function isDirty(x, y, floorId) {
    if (getBlood(x, y, floorId) > 0) return true;
    // GrimeGrid: tile is dirty if any subcell is non-zero
    if (typeof GrimeGrid !== 'undefined') {
      var g = GrimeGrid.get(floorId, x, y);
      if (g) {
        for (var i = 0; i < g.data.length; i++) {
          if (g.data[i] > 0) return true;
        }
      }
    }
    return false;
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
   * Combines legacy blood readiness AND GrimeGrid readiness (weighted average).
   * If there are no blood tiles or grime grids tracked, returns 1.0.
   */
  function getReadiness(floorId) {
    // Legacy blood readiness
    var bloodReadiness = 1.0;
    var map = _bloodMap[floorId];
    if (map) {
      var totalBlood = 0;
      var count = 0;
      for (var key in map) {
        if (map.hasOwnProperty(key)) {
          totalBlood += map[key];
          count++;
        }
      }
      if (count > 0) {
        bloodReadiness = 1.0 - (totalBlood / (count * MAX_BLOOD));
      }
    }

    // GrimeGrid readiness (sub-tile precision)
    var grimeReadiness = 1.0;
    var hasGrime = false;
    if (typeof GrimeGrid !== 'undefined') {
      var gc = GrimeGrid.getGridCount(floorId);
      if (gc > 0) {
        grimeReadiness = GrimeGrid.getFloorCleanliness(floorId);
        hasGrime = true;
      }
    }

    // If both systems have data, weight grime higher (it's the primary
    // visual indicator). If only one has data, use that one.
    if (hasGrime && map && Object.keys(map).length > 0) {
      return bloodReadiness * 0.3 + grimeReadiness * 0.7;
    }
    if (hasGrime) return grimeReadiness;
    return bloodReadiness;
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

          // PW-1: Also allocate GrimeGrid subcells on corpse-adjacent
          // walkable tiles (matching the blood splatter radius) so the
          // raycaster renders sub-tile grime, not just flat blood tint.
          if (typeof GrimeGrid !== 'undefined') {
            _seedGrimeAround(floorId, x, y, grid, gridW, gridH);
          }
        }
      }
    }
  }

  /**
   * Allocate GrimeGrid subcells around a corpse site.
   * Mirrors addBlood's splatter radius + falloff logic so grime
   * visually matches the blood placement.
   * @private
   */
  function _seedGrimeAround(floorId, cx, cy, grid, gridW, gridH) {
    for (var dy = -SPLATTER_RADIUS; dy <= SPLATTER_RADIUS; dy++) {
      for (var dx = -SPLATTER_RADIUS; dx <= SPLATTER_RADIUS; dx++) {
        var tx = cx + dx;
        var ty = cy + dy;
        if (tx < 0 || tx >= gridW || ty < 0 || ty >= gridH) continue;

        var tile = grid[ty][tx];
        var dist = Math.abs(dx) + Math.abs(dy);
        if (dist > SPLATTER_RADIUS) continue;

        // Floor grime on walkable tiles
        if (TILES.isWalkable(tile) && !GrimeGrid.has(floorId, tx, ty)) {
          // Closer tiles get heavier grime (180 center, 120 edge)
          var floorLevel = 180 - (dist * 30);
          GrimeGrid.allocateFloor(floorId, tx, ty, floorLevel);
        }

        // Wall grime on adjacent opaque tiles (kill splatter on walls)
        if (dist <= 1 && TILES.isOpaque(tile) && !GrimeGrid.has(floorId, tx, ty)) {
          var wallLevel = 160 - (dist * 40);
          GrimeGrid.allocateWall(floorId, tx, ty, wallLevel);
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

  /**
   * Harness / DebugBoot wrapper. Seeds grime around a single grid cell
   * using the same splatter model as corpse-adjacent seeding. Callers
   * (DebugBoot._seedGrimeAroundPlayer) walk the cells in a square and
   * hit this for each one; intensity overrides the default falloff so
   * testers can dial in a reproducible "dense grime" test zone.
   *
   * @param {string} floorId
   * @param {number} cx — grid X of the cell to seed around
   * @param {number} cy — grid Y
   * @param {number} [intensity=180] — starting grime level at centre
   *   (floor), tapers -30 per Manhattan step. Walls adjacent to centre
   *   use intensity*0.9 - 40 per step.
   */
  function debugSeedAt(floorId, cx, cy, intensity) {
    if (typeof GrimeGrid === 'undefined') return;
    if (typeof FloorManager === 'undefined' || !FloorManager.getFloorData) return;
    var fd = FloorManager.getFloorData();
    if (!fd || !fd.grid) return;
    var I = (intensity === undefined) ? 180 : (intensity | 0);
    _seedGrimeAround(floorId, cx, cy, fd.grid, fd.gridW, fd.gridH);
  }

  // ── Save/Load (Track B M2.3a) ───────────────────────────────────
  //
  // Per-floor persistence of the discrete blood map + the full GrimeGrid
  // sub-tile state. The `seeded` flag is preserved so a re-visit after
  // load doesn't trigger a second seedFromCorpses pass.
  //
  // Shape:
  //   { blood: {"x,y": level 1-3}, grime: <GrimeGrid.serialize>, seeded: bool }
  //
  // Returns null when the floor has no state worth persisting AND has
  // never been seeded, so save-state.js can omit the keys entirely.

  function serialize(floorId) {
    var bloodSnap = null;
    if (_bloodMap[floorId]) {
      // Shallow copy so later mutations can't corrupt the saved blob.
      bloodSnap = {};
      var src = _bloodMap[floorId];
      for (var k in src) {
        if (src.hasOwnProperty(k)) bloodSnap[k] = src[k] | 0;
      }
    }
    var grimeSnap = (typeof GrimeGrid !== 'undefined' && GrimeGrid.serialize)
      ? GrimeGrid.serialize(floorId)
      : {};
    var hasGrime = false;
    for (var g in grimeSnap) { if (grimeSnap.hasOwnProperty(g)) { hasGrime = true; break; } }
    if (!bloodSnap && !hasGrime) return null;
    return {
      blood:  bloodSnap || {},
      grime:  grimeSnap,
      seeded: _bloodMap[floorId] !== undefined
    };
  }

  function deserialize(floorId, snap) {
    // Always wipe local state for this floor before hydrating — matches
    // clearFloor semantics.
    delete _bloodMap[floorId];
    if (typeof GrimeGrid !== 'undefined' && GrimeGrid.clearFloor) {
      GrimeGrid.clearFloor(floorId);
    }
    if (!snap || typeof snap !== 'object') return;

    // Blood map — restore only if a blob exists OR the floor was marked
    // seeded (an empty object still needs to exist to flip isSeeded()).
    if (snap.seeded || (snap.blood && typeof snap.blood === 'object')) {
      _bloodMap[floorId] = {};
      if (snap.blood && typeof snap.blood === 'object') {
        for (var k in snap.blood) {
          if (!snap.blood.hasOwnProperty(k)) continue;
          var lvl = snap.blood[k] | 0;
          if (lvl > 0) _bloodMap[floorId][k] = Math.min(MAX_BLOOD, lvl);
        }
      }
    }

    // Grime grids — delegate to GrimeGrid, which handles base64 decode +
    // size validation per-tile.
    if (snap.grime && typeof GrimeGrid !== 'undefined' && GrimeGrid.deserialize) {
      GrimeGrid.deserialize(floorId, snap.grime);
    }
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
    debugSeedAt:     debugSeedAt,
    serialize:       serialize,
    deserialize:     deserialize,
    MAX_BLOOD:       MAX_BLOOD,
    TOOL_SPEED:      TOOL_SPEED
  });
})();

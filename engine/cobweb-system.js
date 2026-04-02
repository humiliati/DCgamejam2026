/**
 * CobwebSystem — Core cobweb installation and destruction logic.
 *
 * Tracks cobweb states per floor. Cobwebs can be placed as:
 *   - "wall_overlay" on any existing WALL tile (decorative web on the wall face)
 *   - "standalone" blocking transparent tiles in 1-wide, 3+-long corridors
 *
 * Standalone cobwebs are semi-transparent obstacles destroyed when any entity
 * moves through them. Wall-overlay cobwebs are purely decorative.
 *
 * Readiness hook (Phase 3 integration):
 *   CobwebSystem.getReadinessBonus(floorId) returns extra readiness points.
 *   Wire into the readiness scoring subsystem per docs/CORE_GAME_LOOP_AND_JUICE.md §8.
 *
 * ─── Integration Roadmap ───────────────────────────────────────────────────
 * Phase 1 (this file): Standalone cobweb-system module, no existing-file edits.
 *
 * Phase 2 — ✅ COMPLETE (Apr 2). All hooks wired:
 *   • game.js _onFloorArrived:           CobwebSystem.onFloorLoad(floorData, floorId)  ✅
 *   • game.js _onPlayerMoveCommit:       CobwebSystem.onEntityMove(x, y, floorId)      ✅
 *   • enemy-ai.js _onEnemyArrived:       CobwebSystem.onEntityMove(nx, ny, floorId)    ✅
 *   • hero-system.js _stepScriptedPath:  CobwebSystem.onEntityMove(next.x, next.y, …)  ✅
 *   • game.js _interact():               CobwebNode.tryInteract(floorId)               ✅
 *
 * Phase 3 — Readiness scoring integration:
 *   • session-stats.js: add cobwebsInstalled counter (SessionStats.inc('cobwebsInstalled'))
 *   • Readiness sub-score: subScore.cobwebs = CobwebSystem.getReadinessBonus(floorId)
 *   • TILES.COBWEB_WALL = 27 in tiles.js (extend isWalkable/isOpaque/isDoor tables)
 *   • Raycaster: add TILES.COBWEB_WALL hit detection with partial transparency pass
 *
 * Phase 4 — Edge-case refinement:
 *   • Doorway cobwebs (1×1 passages) exclusion logic
 *   • Boss-room corridor cobweb cap (max 1 per room threshold)
 *   • Cobweb resilience (rare "reinforced" web variant, destroys on 2nd pass)
 *
 * Phase 5 (future draft):
 *   • Cobweb + fire interaction: web catches fire, spreads hazard
 *   • Cobweb + wind draft: decorative particle drift
 *   • Enemy pathfinding: EnemyAI avoids standalone cobwebs (stealth-breaker cost)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Layer 1 — zero deps beyond TILES (engine/tiles.js)
 */
var CobwebSystem = (function () {
  'use strict';

  // ── Tile constant ────────────────────────────────────────────────
  // Defines the standalone cobweb wall tile value.
  // Phase 3 integration: add TILES.COBWEB_WALL = COBWEB_TILE in tiles.js.
  var COBWEB_TILE = 27;

  // ── Readiness ────────────────────────────────────────────────────
  var READINESS_BONUS_PER_COBWEB = 5;  // points per intact cobweb

  // ── Per-floor state ──────────────────────────────────────────────
  // _eligible[floorId]  = Array<{ x, y, corridorDir: 'H'|'V' }>
  // _cobwebs[floorId]   = Object<key → CobwebRecord>
  //
  // CobwebRecord: { x, y, state: 'intact'|'destroyed',
  //                type: 'wall_overlay'|'standalone', installedAt }
  var _eligible = {};
  var _cobwebs  = {};

  // ── Helpers ──────────────────────────────────────────────────────

  function _key(x, y) { return x + ',' + y; }

  /**
   * True for tiles that act as solid walls in the corridor-detection pass.
   * Matches the raycaster's hit-detection list.
   */
  function _isWallLike(tile) {
    return tile === TILES.WALL     || tile === TILES.PILLAR   ||
           tile === TILES.BREAKABLE || tile === TILES.TREE     ||
           tile === TILES.SHRUB    || tile === TILES.BOOKSHELF ||
           tile === TILES.BAR_COUNTER;
  }

  /**
   * Count EMPTY tiles in a straight line from (x, y) in direction (dx, dy),
   * including the starting tile. Stops at map boundary or non-EMPTY tile.
   */
  function _runLength(grid, W, H, x, y, dx, dy) {
    var count = 0;
    var cx = x, cy = y;
    while (cx >= 0 && cx < W && cy >= 0 && cy < H &&
           grid[cy][cx] === TILES.EMPTY) {
      count++;
      cx += dx;
      cy += dy;
    }
    return count;
  }

  /**
   * Scan the grid and return all positions eligible for standalone cobweb
   * installation.
   *
   * Eligibility rules:
   *   1. Tile must be TILES.EMPTY.
   *   2. Both perpendicular neighbours must be wall-like (corridor width = 1).
   *   3. The EMPTY run in the corridor direction must be ≥ 3 tiles long.
   *
   * @param {Array}  grid - 2D tile grid
   * @param {number} W    - Grid width
   * @param {number} H    - Grid height
   * @returns {Array<{x,y,corridorDir}>}
   */
  function _findEligiblePositions(grid, W, H) {
    var positions = [];

    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (grid[y][x] !== TILES.EMPTY) continue;

        var wallN = (y === 0)     || _isWallLike(grid[y - 1][x]);
        var wallS = (y === H - 1) || _isWallLike(grid[y + 1][x]);
        var wallE = (x === W - 1) || _isWallLike(grid[y][x + 1]);
        var wallW = (x === 0)     || _isWallLike(grid[y][x - 1]);

        // Horizontal corridor: walls on N and S, open on E and W
        if (wallN && wallS && !wallE && !wallW) {
          var hRun = _runLength(grid, W, H, x, y, 1, 0) +
                     _runLength(grid, W, H, x, y, -1, 0) - 1;
          if (hRun >= 3) {
            positions.push({ x: x, y: y, corridorDir: 'H' });
          }
          continue;
        }

        // Vertical corridor: walls on E and W, open on N and S
        if (wallE && wallW && !wallN && !wallS) {
          var vRun = _runLength(grid, W, H, x, y, 0, 1) +
                     _runLength(grid, W, H, x, y, 0, -1) - 1;
          if (vRun >= 3) {
            positions.push({ x: x, y: y, corridorDir: 'V' });
          }
        }
      }
    }

    return positions;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Analyse a floor's grid and cache eligible cobweb positions.
   * Call once when a new floor is loaded.
   *
   * Phase 2 integration: wire into FloorTransition._onFloorArrived().
   *
   * @param {Object} floorData - { grid, gridW, gridH, … }
   * @param {string} floorId   - Floor string ID (e.g. "2.2.1")
   */
  function onFloorLoad(floorData, floorId) {
    if (!floorData || !floorData.grid) return;

    _eligible[floorId] = _findEligiblePositions(
      floorData.grid, floorData.gridW, floorData.gridH
    );
    if (!_cobwebs[floorId]) _cobwebs[floorId] = {};
  }

  /**
   * Check whether a tile position is eligible for standalone cobweb placement.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {boolean}
   */
  function isEligiblePosition(x, y, floorId) {
    var list = _eligible[floorId];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return true;
    }
    return false;
  }

  /**
   * Get the corridor direction for an eligible position, or null.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {'H'|'V'|null}
   */
  function getCorridorDir(x, y, floorId) {
    var list = _eligible[floorId];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i].corridorDir;
    }
    return null;
  }

  /**
   * Install a cobweb at the given position.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @param {string} [type]  - 'wall_overlay' | 'standalone' (default 'standalone')
   * @returns {boolean}        true if installed successfully
   */
  function install(x, y, floorId, type) {
    type = type || 'standalone';

    if (!_cobwebs[floorId]) _cobwebs[floorId] = {};

    // Standalone type requires corridor eligibility
    if (type === 'standalone' && !isEligiblePosition(x, y, floorId)) {
      return false;
    }

    var key = _key(x, y);
    var existing = _cobwebs[floorId][key];
    if (existing && existing.state === 'intact') {
      return false; // already has an intact cobweb
    }

    _cobwebs[floorId][key] = {
      x: x, y: y,
      state: 'intact',
      type: type,
      installedAt: Date.now()
    };
    return true;
  }

  /**
   * Destroy the cobweb at position (entity moved through it).
   *
   * Phase 2 integration: called from MovementController commit hook and
   * EnemyAI step handler.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {boolean} true if a cobweb was actually destroyed
   */
  function destroy(x, y, floorId) {
    if (!_cobwebs[floorId]) return false;
    var cob = _cobwebs[floorId][_key(x, y)];
    if (!cob || cob.state !== 'intact') return false;
    cob.state = 'destroyed';
    return true;
  }

  /**
   * Check if an intact cobweb exists at position.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {boolean}
   */
  function hasAt(x, y, floorId) {
    if (!_cobwebs[floorId]) return false;
    var cob = _cobwebs[floorId][_key(x, y)];
    return !!(cob && cob.state === 'intact');
  }

  /**
   * Return the cobweb record at a position, or null.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {Object|null}
   */
  function getAt(x, y, floorId) {
    if (!_cobwebs[floorId]) return null;
    return _cobwebs[floorId][_key(x, y)] || null;
  }

  /**
   * Return all intact cobwebs on a floor.
   *
   * @param {string} floorId
   * @returns {Array<CobwebRecord>}
   */
  function getIntact(floorId) {
    var result = [];
    var floor = _cobwebs[floorId];
    if (!floor) return result;
    var keys = Object.keys(floor);
    for (var i = 0; i < keys.length; i++) {
      if (floor[keys[i]].state === 'intact') result.push(floor[keys[i]]);
    }
    return result;
  }

  /**
   * Return all eligible corridor positions for a floor.
   * Used by CobwebNode to determine where to show installation nodes.
   *
   * @param {string} floorId
   * @returns {Array<{x,y,corridorDir}>}
   */
  function getEligible(floorId) {
    return _eligible[floorId] || [];
  }

  /**
   * Notify the system that an entity moved to tile (x, y).
   * Destroys any intact standalone cobweb at that tile.
   *
   * Phase 2 integration: wire into MovementController commit hook and
   * EnemyAI move step; pass FloorManager.getCurrentFloorId() as floorId.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {boolean} true if a cobweb was destroyed
   */
  function onEntityMove(x, y, floorId) {
    if (!hasAt(x, y, floorId)) return false;
    var cob = getAt(x, y, floorId);
    if (!cob || cob.type !== 'standalone') return false;
    return destroy(x, y, floorId);
  }

  /**
   * Readiness bonus for a floor: READINESS_BONUS_PER_COBWEB × intact cobwebs.
   *
   * Phase 3 integration (docs/CORE_GAME_LOOP_AND_JUICE.md §8):
   *   subScore.cobwebs = CobwebSystem.getReadinessBonus(floorId);
   *   // Cobwebs score capped at 15% of total readiness.
   *
   * @param {string} floorId
   * @returns {number}
   */
  function getReadinessBonus(floorId) {
    return getIntact(floorId).length * READINESS_BONUS_PER_COBWEB;
  }

  /**
   * Clear all cobweb state for a floor (floor reset / re-generation).
   *
   * @param {string} floorId
   */
  function resetFloor(floorId) {
    _cobwebs[floorId] = {};
  }

  // ── Exposed constants and API ────────────────────────────────────

  return Object.freeze({
    /** Tile constant for standalone cobweb walls (extends TILES). */
    COBWEB_TILE:         COBWEB_TILE,
    /** Readiness points awarded per intact cobweb. */
    READINESS_PER_COB:   READINESS_BONUS_PER_COBWEB,

    onFloorLoad:         onFloorLoad,
    isEligiblePosition:  isEligiblePosition,
    getCorridorDir:      getCorridorDir,
    install:             install,
    destroy:             destroy,
    hasAt:               hasAt,
    getAt:               getAt,
    getIntact:           getIntact,
    getEligible:         getEligible,
    onEntityMove:        onEntityMove,
    getReadinessBonus:   getReadinessBonus,
    resetFloor:          resetFloor
  });
})();

/**
 * DoorContracts — floor transition state and contract logic.
 * Extracted from EyesOnly's DoorContractSystem (nearly verbatim).
 *
 * Canonical contracts:
 *   advance  → spawn near STAIRS_UP (or DOOR_BACK/DOOR_EXIT) on new floor
 *   retreat  → spawn near STAIRS_DN (or DOOR/BOSS_DOOR) on previous floor
 *
 * When the exit tile is a DOOR type, applyContract() first scans the
 * target floor grid for the complementary door tile before falling
 * back to stairs. This allows building-style transitions (DOOR →
 * DOOR_EXIT) to spawn the player near the correct exit.
 *
 * Guardrail protection (~5 steps) prevents re-triggering the door
 * the player just arrived through.
 */
var DoorContracts = (function () {
  'use strict';

  var _lastExitPos = null;
  var _spawnDir = null;  // 'advance' | 'retreat' | null
  var _exitTile = null;  // TILES constant of the door/stair used to exit
  var _protect = null;   // { x, y, stepsRemaining }

  var GUARDRAIL_STEPS = 5;

  // ── State accessors ──

  function getProtect()       { return _protect; }
  function clearProtect()     { _protect = null; }

  function setContract(exitPos, direction, exitTile) {
    _lastExitPos = exitPos;
    _spawnDir = direction;
    _exitTile = exitTile || null;
  }

  function resetAll() {
    _lastExitPos = null;
    _spawnDir = null;
    _exitTile = null;
    _protect = null;
  }

  /**
   * Tick guardrail countdown. Call each time player moves onto a non-stair tile.
   * @returns {boolean} true if protect was cleared this tick
   */
  function tickProtect() {
    if (!_protect) return false;
    _protect.stepsRemaining--;
    if (_protect.stepsRemaining <= 0) {
      _protect = null;
      return true;
    }
    return false;
  }

  /**
   * Check if player is within the door protection zone.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  function isProtected(x, y) {
    if (!_protect) return false;
    return _protect.x === x && _protect.y === y && _protect.stepsRemaining > 0;
  }

  /**
   * Resolve door-based spawn target on the target floor.
   * When the player exits through a DOOR tile, look for the complementary
   * door tile on the new floor (DOOR_BACK/DOOR_EXIT for advance, DOOR for retreat).
   *
   * Also checks doors.doorEntry / doors.doorExit if GridGen provides them.
   *
   * @returns {{ x: number, y: number } | null}
   */
  function _resolveDoorTarget(grid, W, H, doors) {
    if (!_exitTile) return null;

    // Determine which tile types to search for on the target floor
    var searchTiles;
    if (_exitTile === TILES.DOOR || _exitTile === TILES.BOSS_DOOR) {
      // Entered through door: look for exit / back door to spawn near
      if (doors.doorExit) return doors.doorExit;
      if (doors.doorBack) return doors.doorBack;
      searchTiles = [TILES.DOOR_BACK, TILES.DOOR_EXIT];
    } else if (_exitTile === TILES.DOOR_BACK || _exitTile === TILES.DOOR_EXIT) {
      // Exited through back/exit door: look for entry door to spawn near
      if (doors.doorEntry) return doors.doorEntry;
      searchTiles = [TILES.DOOR, TILES.BOSS_DOOR];
    } else {
      return null; // Not a door tile
    }

    // Grid scan for matching door tile
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var t = grid[y][x];
        for (var s = 0; s < searchTiles.length; s++) {
          if (t === searchTiles[s]) return { x: x, y: y };
        }
      }
    }

    return null; // No matching door found — caller falls back to stairs
  }

  /**
   * Apply the current contract to a generated floor.
   * Places the player near the appropriate staircase or door.
   *
   * @param {Object} floorData - from GridGen.generate()
   * @returns {Object} { x, y, dir } player spawn position and facing
   */
  function applyContract(floorData) {
    var grid = floorData.grid;
    var W = floorData.gridW;
    var H = floorData.gridH;
    var doors = floorData.doors;

    var targetDoor, avoidDoor;

    // If exited through a door tile, look for the complementary door
    // on the target floor before falling back to stairs.
    var doorTarget = _resolveDoorTarget(grid, W, H, doors);

    if (doorTarget) {
      targetDoor = doorTarget;
      // Avoid the opposite transition point
      avoidDoor = _spawnDir === 'advance' ? doors.stairsDn : doors.stairsUp;
    } else if (_spawnDir === 'advance') {
      // Going deeper: spawn near stairs up (the way back)
      targetDoor = doors.stairsUp;
      avoidDoor = doors.stairsDn;
    } else if (_spawnDir === 'retreat') {
      // Going back: spawn near stairs down (the way forward)
      targetDoor = doors.stairsDn;
      avoidDoor = doors.stairsUp;
    } else {
      // No contract: spawn near stairs up (starting position)
      targetDoor = doors.stairsUp;
      avoidDoor = doors.stairsDn;
    }

    if (!targetDoor) {
      // Fallback: center of first room
      var r = floorData.rooms[0];
      return { x: r.cx, y: r.cy, dir: -Math.PI / 2 };
    }

    var spawn = findSpawnNearDoor(grid, W, H, targetDoor, avoidDoor, GUARDRAIL_STEPS);

    // Set guardrail protect on the target door
    if (_spawnDir) {
      _protect = {
        x: targetDoor.x,
        y: targetDoor.y,
        stepsRemaining: GUARDRAIL_STEPS
      };
    }

    // Face away from the target door
    var dir = -Math.PI / 2; // default: face north
    if (spawn && targetDoor) {
      var dx = spawn.x - targetDoor.x;
      var dy = spawn.y - targetDoor.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        dir = Math.atan2(dy, dx);
      }
    }

    // Clear contract (one-shot)
    _lastExitPos = null;
    _spawnDir = null;
    _exitTile = null;

    return { x: spawn.x, y: spawn.y, dir: dir };
  }

  /**
   * Find an empty tile near targetDoor, preferring tiles far from avoidDoor.
   * Expanding ring search (from EyesOnly DoorContractSystem.findSpawnNearDoor).
   */
  function findSpawnNearDoor(grid, W, H, targetDoor, avoidDoor, radius) {
    radius = radius || GUARDRAIL_STEPS;
    var best = null;
    var bestAvoidDist = -1;

    for (var r = 1; r <= radius; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only

          var tx = targetDoor.x + dx;
          var ty = targetDoor.y + dy;

          if (tx <= 0 || tx >= W - 1 || ty <= 0 || ty >= H - 1) continue;
          if (!grid[ty] || grid[ty][tx] !== TILES.EMPTY) continue;

          var avoidDist = 0;
          if (avoidDoor) {
            avoidDist = Math.abs(tx - avoidDoor.x) + Math.abs(ty - avoidDoor.y);
          }

          if (!best || avoidDist > bestAvoidDist) {
            best = { x: tx, y: ty };
            bestAvoidDist = avoidDist;
          }
        }
      }

      if (best) return best; // Found on this ring, take it
    }

    // Fallback to target door position
    return { x: targetDoor.x, y: targetDoor.y };
  }

  return {
    setContract: setContract,
    applyContract: applyContract,
    tickProtect: tickProtect,
    isProtected: isProtected,
    getProtect: getProtect,
    clearProtect: clearProtect,
    resetAll: resetAll,
    findSpawnNearDoor: findSpawnNearDoor
  };
})();

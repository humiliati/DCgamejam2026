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
   * Determine the best cardinal facing direction from a spawn point.
   * Casts a 4-tile ray in each cardinal direction and counts open tiles.
   * Prefers directions away from targetDoor as a tiebreaker.
   *
   * @returns {number} Radian angle (EAST=0, SOUTH=π/2, WEST=π, NORTH=-π/2)
   */
  function _bestFacingDir(grid, W, H, sx, sy, targetDoor) {
    var CARDINALS = [
      { dx:  1, dy:  0, angle: 0 },             // EAST
      { dx:  0, dy:  1, angle: Math.PI / 2 },   // SOUTH (+Y = south)
      { dx: -1, dy:  0, angle: Math.PI },        // WEST
      { dx:  0, dy: -1, angle: -Math.PI / 2 }   // NORTH
    ];

    // ── Primary strategy: face directly away from the arrival door ──
    // Find the cardinal direction most opposite to the door-to-spawn vector.
    // This ensures a clean 180° turn from the door the player just exited.
    if (targetDoor) {
      var ddx = targetDoor.x - sx;
      var ddy = targetDoor.y - sy;

      // Pick the cardinal axis with the larger component of the door offset.
      // If the door is primarily south (ddy > 0), face north.
      // If the door is primarily east (ddx > 0), face west. Etc.
      // Ties (diagonal) break toward the Y-axis (north/south feels more
      // natural for door-wall orientations in grid-based levels).
      var bestAngle = -Math.PI / 2; // default NORTH
      if (Math.abs(ddy) >= Math.abs(ddx)) {
        // Door is primarily above or below → face opposite on Y axis
        bestAngle = (ddy > 0) ? -Math.PI / 2 : Math.PI / 2;  // door south → face north, vice versa
      } else {
        // Door is primarily left or right → face opposite on X axis
        bestAngle = (ddx > 0) ? Math.PI : 0;  // door east → face west, vice versa
      }

      // Verify the chosen direction has at least 1 open tile ahead.
      // If blocked, fall through to the open-count heuristic below.
      for (var c = 0; c < CARDINALS.length; c++) {
        if (CARDINALS[c].angle === bestAngle) {
          var checkX = sx + CARDINALS[c].dx;
          var checkY = sy + CARDINALS[c].dy;
          if (checkX >= 0 && checkX < W && checkY >= 0 && checkY < H) {
            var ct = grid[checkY][checkX];
            if (ct !== TILES.WALL && ct !== TILES.PILLAR && ct !== TILES.TREE) {
              return bestAngle;
            }
          }
          break;
        }
      }
    }

    // ── Fallback: pick direction with most open tiles ahead ──
    var fallbackAngle = -Math.PI / 2;
    var fallbackScore = -1;

    for (var c2 = 0; c2 < CARDINALS.length; c2++) {
      var card = CARDINALS[c2];
      var openCount = 0;

      for (var step = 1; step <= 4; step++) {
        var nx = sx + card.dx * step;
        var ny = sy + card.dy * step;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) break;
        var t = grid[ny][nx];
        if (t === TILES.WALL || t === TILES.PILLAR || t === TILES.TREE) break;
        openCount++;
      }

      // Small away-from-door bonus to break ties
      var awayBonus = 0;
      if (targetDoor) {
        var toward = (card.dx * (targetDoor.x - sx) + card.dy * (targetDoor.y - sy));
        if (toward < 0) awayBonus = 0.5;
      }

      var score = openCount + awayBonus;
      if (score > fallbackScore) {
        fallbackScore = score;
        fallbackAngle = card.angle;
      }
    }

    return fallbackAngle;
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

    // Face into the room — pick the cardinal direction with the most open
    // floor tiles ahead. This prevents the "face the wall" bug when spawn
    // is between the arrival stairs and a wall.
    var dir = -Math.PI / 2; // default: face north
    if (spawn) {
      dir = _bestFacingDir(grid, W, H, spawn.x, spawn.y, targetDoor);
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
    var bestScore = -1;

    for (var r = 1; r <= radius; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only

          var tx = targetDoor.x + dx;
          var ty = targetDoor.y + dy;

          if (tx <= 0 || tx >= W - 1 || ty <= 0 || ty >= H - 1) continue;
          if (!grid[ty] || grid[ty][tx] !== TILES.EMPTY) continue;

          // Score = distance from avoidDoor + open neighbor count
          // Prefer tiles in room interiors (more open neighbors) over
          // tiles wedged against walls, to avoid face-the-wall spawns.
          var avoidDist = 0;
          if (avoidDoor) {
            avoidDist = Math.abs(tx - avoidDoor.x) + Math.abs(ty - avoidDoor.y);
          }

          var openNeighbors = 0;
          var DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
          for (var d = 0; d < 4; d++) {
            var nx = tx + DIRS[d][0], ny = ty + DIRS[d][1];
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny][nx] === TILES.EMPTY) {
              openNeighbors++;
            }
          }

          var score = avoidDist * 4 + openNeighbors; // avoidDist dominant, open tiebreaker
          if (!best || score > bestScore) {
            best = { x: tx, y: ty };
            bestScore = score;
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

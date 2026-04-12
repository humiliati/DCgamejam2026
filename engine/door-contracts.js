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
  var _sourceFloorId = null;  // Floor ID the player is leaving (for doorTargets reverse lookup)
  var _protect = null;   // { x, y, stepsRemaining }

  var GUARDRAIL_STEPS = 5;

  // ── State accessors ──

  function getProtect()       { return _protect; }
  function clearProtect()     { _protect = null; }

  function setContract(exitPos, direction, exitTile, sourceFloorId) {
    _lastExitPos = exitPos;
    _spawnDir = direction;
    _exitTile = exitTile || null;
    _sourceFloorId = sourceFloorId || null;
  }

  function resetAll() {
    _lastExitPos = null;
    _spawnDir = null;
    _exitTile = null;
    _sourceFloorId = null;
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
   * Priority depends on direction:
   *
   * ADVANCE (exited DOOR/BOSS_DOOR → arriving at new floor):
   *   1. doors.doorExit/doorBack shorthand — authoritative, identifies the
   *      PRIMARY exit point (e.g. center tile of a 3-wide gate).
   *   2. doorTargets reverse lookup
   *   3. Grid scan
   *
   * RETREAT (exited DOOR_EXIT/DOOR_BACK → returning to previous floor):
   *   1. doorTargets reverse lookup — required for multi-door parent floors
   *      where doorEntry might point to a different child's door.
   *   2. doors.doorEntry shorthand — fallback for single-entrance floors
   *   3. Grid scan
   *
   * @returns {{ x: number, y: number } | null}
   */
  function _resolveDoorTarget(grid, W, H, doors, doorTargets) {
    if (!_exitTile) return null;

    var isAdvance = (_exitTile === TILES.DOOR || _exitTile === TILES.BOSS_DOOR || _exitTile === TILES.DOOR_FACADE);
    var isRetreat = (_exitTile === TILES.DOOR_BACK || _exitTile === TILES.DOOR_EXIT);

    if (!isAdvance && !isRetreat) return null;

    if (isAdvance) {
      // ── ADVANCE: prefer doors shorthand, then reverse lookup ──
      // The floor builder explicitly sets doorExit/doorBack to mark the
      // canonical arrival tile. This is more authoritative than reverse
      // lookup, which can return any of several tiles mapping to the same
      // source floor (e.g. a 3-wide gate with 3 doorTargets entries).
      if (doors.doorExit) return doors.doorExit;
      if (doors.doorBack) return doors.doorBack;

      // Reverse lookup fallback
      if (_sourceFloorId && doorTargets) {
        for (var key in doorTargets) {
          if (String(doorTargets[key]) === String(_sourceFloorId)) {
            var parts = key.split(',');
            var dx = parseInt(parts[0], 10);
            var dy = parseInt(parts[1], 10);
            if (!isNaN(dx) && !isNaN(dy)) return { x: dx, y: dy };
          }
        }
      }
    } else {
      // ── RETREAT: prefer reverse lookup, then doors shorthand ──
      // Multi-door parent floors (e.g. Promenade with 4 building doors)
      // need the reverse lookup to find which specific door leads back
      // to the source floor. The doorEntry shorthand only marks ONE door.
      if (_sourceFloorId && doorTargets) {
        for (var key2 in doorTargets) {
          if (String(doorTargets[key2]) === String(_sourceFloorId)) {
            var parts2 = key2.split(',');
            var dx2 = parseInt(parts2[0], 10);
            var dy2 = parseInt(parts2[1], 10);
            if (!isNaN(dx2) && !isNaN(dy2)) return { x: dx2, y: dy2 };
          }
        }
      }

      // Shorthand fallback
      if (doors.doorEntry) return doors.doorEntry;
    }

    // ── Grid scan for matching door tile (last resort) ──
    var searchTiles = isAdvance
      ? [TILES.DOOR_BACK, TILES.DOOR_EXIT]
      : [TILES.DOOR, TILES.BOSS_DOOR, TILES.DOOR_FACADE];

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
    var doorTargets = floorData.doorTargets || null;

    // If exited through a door tile, look for the complementary door
    // on the target floor before falling back to stairs.
    var doorTarget = _resolveDoorTarget(grid, W, H, doors, doorTargets);

    if (doorTarget) {
      targetDoor = doorTarget;
      // Avoid the opposite transition point
      avoidDoor = _spawnDir === 'advance' ? doors.stairsDn : doors.stairsUp;
      // If no natural avoid target (parent floors with no stairs),
      // infer the building interior side to prevent spawning inside walls.
      if (!avoidDoor) {
        avoidDoor = _inferInteriorSide(grid, W, H, targetDoor);
      }
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
      // Fallback chain: doorExit → doorEntry → center of first room.
      // Exterior floors (depth 1) have no stairs, so the stairsUp/Down
      // paths above both yield null. doorExit is the natural "I just
      // arrived" spawn (the gate from the previous floor). doorEntry is
      // the first building entrance — still on the street. Room-center
      // is the last resort (may be inside a building).
      targetDoor = doors.doorExit || doors.doorEntry || null;
      if (!targetDoor) {
        var r = floorData.rooms[0];
        return { x: r.cx, y: r.cy, dir: -Math.PI / 2 };
      }
    }

    var spawn = findSpawnNearDoor(grid, W, H, targetDoor, avoidDoor, GUARDRAIL_STEPS);

    // ── Safety net: guarantee spawn is on a safe walkable tile ──
    // findSpawnNearDoor falls back to the targetDoor position itself if its
    // ring search finds no _isSpawnSafe candidate. That can leave the player
    // sitting on a stairs tile (re-trigger loop) or, on pathological procgen
    // layouts where post-gen passes (bookshelves, hazards, breakables,
    // torch conversion) have blocked candidate tiles, on a tile that was
    // emptied at gen time but overwritten afterward. BFS outward from the
    // targetDoor through walkable tiles until we find a genuinely safe one.
    if (!spawn || !grid[spawn.y] || !_isSpawnSafe(grid[spawn.y][spawn.x])) {
      spawn = _bfsSafeSpawn(grid, W, H, targetDoor) || spawn || targetDoor;
    }

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
    _sourceFloorId = null;

    return { x: spawn.x, y: spawn.y, dir: dir };
  }

  /**
   * Count reachable walkable tiles from a seed position using bounded BFS.
   * The traversal stops after `cap` tiles are found. Door tiles are treated
   * as walls so pockets on one side of a door don't bleed through to the
   * other side. Used to distinguish a true exterior (hundreds of tiles) from
   * a walled interior alcove (a handful of tiles).
   */
  function _boundedReachableCount(grid, W, H, sx, sy, cap) {
    if (sy < 0 || sy >= H || sx < 0 || sx >= W) return 0;
    if (!grid[sy] || !TILES.isWalkable(grid[sy][sx])) return 0;
    cap = cap || 32;
    var seen = {};
    var key0 = sx + ',' + sy;
    seen[key0] = true;
    var queue = [[sx, sy]];
    var count = 1;
    var head = 0;
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < queue.length && count < cap) {
      var cur = queue[head++];
      for (var i = 0; i < 4; i++) {
        var nx = cur[0] + DIRS[i][0];
        var ny = cur[1] + DIRS[i][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        var k = nx + ',' + ny;
        if (seen[k]) continue;
        if (!grid[ny]) continue;
        var t = grid[ny][nx];
        if (!TILES.isWalkable(t)) continue;
        if (TILES.isDoor(t)) continue;     // don't cross door boundary
        seen[k] = true;
        queue.push([nx, ny]);
        count++;
      }
    }
    return count;
  }

  /**
   * Infer which side of a door is the building interior (enclosed) vs
   * exterior (open walkway). Used to synthesize an avoidDoor point when
   * the parent floor has no stairs to use as a natural avoid target.
   *
   * Strategy: compare bounded BFS reachable-counts on each side of the door.
   * The side with FEWER reachable tiles (treating doors as walls) is the
   * enclosed interior. Falls back to linear-depth comparison only if BFS
   * can't seed (both adjacent tiles are walls).
   *
   * Prior versions used linear depth alone, which failed on symmetric
   * layouts — e.g. Floor 1's home door (22,27) where a 2-tile wall pocket
   * at (21,28)+(22,28) tied the "depth" check against the genuine exterior
   * at (22,26), and the algorithm then placed the avoid marker on the
   * exterior side, pushing the spawn into the pocket.
   *
   * @returns {{ x: number, y: number } | null}
   */
  function _inferInteriorSide(grid, W, H, doorPos) {
    var dx = doorPos.x, dy = doorPos.y;

    // Check if door is in a horizontal wall (non-walkable barriers flanking
    // E/W). Using !isWalkable (instead of WALL/PILLAR literals) catches
    // WINDOW_TAVERN, BAR_COUNTER, BOOKSHELF, FENCE, TREE, SHRUB, etc. —
    // any structural barrier that forms a wall line. Without this, doors
    // embedded in facades with windows on either side (e.g. Driftwood Inn
    // at Promenade 22,8) fail orientation detection and the retreat spawn
    // falls through to openNeighbors scoring alone, which has picked
    // interior-trapped tiles on iteration order.
    var wallEW = false, wallNS = false;
    if (dx > 0 && dx < W - 1) {
      var west = grid[dy][dx - 1], east = grid[dy][dx + 1];
      wallEW = !TILES.isWalkable(west) && !TILES.isWalkable(east);
    }
    if (dy > 0 && dy < H - 1) {
      var northT = grid[dy - 1][dx], southT = grid[dy + 1][dx];
      wallNS = !TILES.isWalkable(northT) && !TILES.isWalkable(southT);
    }

    var CAP = 40;   // enough to clearly separate pockets (<10) from exteriors

    if (wallEW) {
      // Door in horizontal wall — compare N vs S reachable regions.
      var nCount = _boundedReachableCount(grid, W, H, dx, dy - 1, CAP);
      var sCount = _boundedReachableCount(grid, W, H, dx, dy + 1, CAP);
      // Interior = smaller region; place avoid point 3 tiles into it so
      // findSpawnNearDoor scores exterior candidates higher.
      if (nCount < sCount) return { x: dx, y: Math.max(0, dy - 3) };
      if (sCount < nCount) return { x: dx, y: Math.min(H - 1, dy + 3) };
      // Truly symmetric — no information. Return null so scoring falls
      // back to openNeighbors + alignBonus without an avoid bias.
      return null;
    }

    if (wallNS) {
      // Door in vertical wall — compare W vs E reachable regions.
      var wCount = _boundedReachableCount(grid, W, H, dx - 1, dy, CAP);
      var eCount = _boundedReachableCount(grid, W, H, dx + 1, dy, CAP);
      if (wCount < eCount) return { x: Math.max(0, dx - 3), y: dy };
      if (eCount < wCount) return { x: Math.min(W - 1, dx + 3), y: dy };
      return null;
    }

    return null; // Can't determine wall orientation — no synthetic avoid
  }

  /**
   * Check if a tile is safe to spawn on: walkable, non-hazardous, not a
   * door/stair (to avoid re-triggering transitions). Accepts EMPTY, ROAD,
   * PATH, GRASS, and other safe walkables.
   */
  function _isSpawnSafe(tile) {
    // Reject non-walkable
    if (!TILES.isWalkable(tile)) return false;
    // Reject door/stair tiles (player would immediately re-trigger a transition)
    if (TILES.isDoor(tile)) return false;
    // Reject hazards
    if (TILES.isHazard && TILES.isHazard(tile)) return false;
    return true;
  }

  /**
   * BFS outward from a seed tile through walkable neighbors until a
   * spawn-safe tile is found. Used as a last-resort safety net when
   * findSpawnNearDoor's ring search fails or returns an unsafe tile.
   *
   * The walk traverses any walkable tile (including stairs/doors) so it
   * can step off a stairs tile onto a safe floor neighbor, but it only
   * RETURNS a tile that passes _isSpawnSafe (not a stair/door/hazard).
   *
   * Returns null if no safe tile is reachable within a reasonable bound.
   */
  function _bfsSafeSpawn(grid, W, H, seed) {
    if (!seed || seed.x == null || seed.y == null) return null;
    if (seed.x < 0 || seed.x >= W || seed.y < 0 || seed.y >= H) return null;
    if (!grid[seed.y]) return null;

    var seen = {};
    var startKey = seed.x + ',' + seed.y;
    seen[startKey] = true;
    var queue = [[seed.x, seed.y]];
    var head = 0;
    var MAX_VISITS = 512;
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (head < queue.length && head < MAX_VISITS) {
      var cur = queue[head++];
      var cx = cur[0], cy = cur[1];
      var ct = grid[cy] && grid[cy][cx];
      // Return the first safe tile we find (skips the seed if it's unsafe,
      // e.g. a stairs tile). Respect border — don't spawn on the outer edge.
      if (cx > 0 && cx < W - 1 && cy > 0 && cy < H - 1 && _isSpawnSafe(ct)) {
        return { x: cx, y: cy };
      }
      // Traverse through any walkable tile (including stairs/doors) so we
      // can step off the seed and reach the adjacent room interior.
      for (var i = 0; i < 4; i++) {
        var nx = cx + DIRS[i][0];
        var ny = cy + DIRS[i][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        var k = nx + ',' + ny;
        if (seen[k]) continue;
        if (!grid[ny]) continue;
        if (!TILES.isWalkable(grid[ny][nx])) continue;
        seen[k] = true;
        queue.push([nx, ny]);
      }
    }

    return null;
  }

  /**
   * Find a walkable tile near targetDoor, preferring tiles far from avoidDoor.
   * Expanding ring search (from EyesOnly DoorContractSystem.findSpawnNearDoor).
   *
   * Accepts any safe walkable tile (EMPTY, ROAD, PATH, GRASS, etc.) — not
   * just TILES.EMPTY. This is critical for exterior floors where the road
   * corridor uses ROAD/PATH tiles and no EMPTY tiles exist near gates.
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
          if (!grid[ty] || !_isSpawnSafe(grid[ty][tx])) continue;

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
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && TILES.isWalkable(grid[ny][nx])) {
              openNeighbors++;
            }
          }

          // Alignment bonus: prefer tiles on the same row or column as
          // the target door. This produces a clean cardinal facing direction
          // (away from the door) instead of a diagonal that picks an
          // arbitrary axis. E.g. for a west-wall gate, spawning directly
          // east (same row) gives a clean EAST facing.
          //
          // Weight 4.0 (not a tiebreaker) so a single-tile lateral offset
          // doesn't get outscored by the avoidDist*4 term. Without this,
          // candidates one tile diagonal from the door reliably beat the
          // axis-aligned candidate on floors where avoidDoor sits to the
          // side of the door's orientation axis (e.g. 1.2 Driftwood Inn,
          // where stairsDn at (7,9) pulled the spawn east to (11,14)).
          var alignBonus = (tx === targetDoor.x || ty === targetDoor.y) ? 4.0 : 0;

          var score = avoidDist * 4 + openNeighbors + alignBonus; // avoidDist dominant, open + align tiebreaker
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

/**
 * GridGen — Procedural dungeon floor generator.
 * Adapted from EyesOnly's FloorGenCore (BSP room placement + A* corridors).
 *
 * Output: { grid[][], rooms[], doors: { stairsUp, stairsDn }, gridW, gridH, biome, shops[] }
 * Grid uses TILES constants.
 */
var GridGen = (function () {
  'use strict';

  var DEFAULT_W = 32;
  var DEFAULT_H = 32;
  var MIN_ROOM = 4;
  var MAX_ROOM = 10;

  /**
   * Generate a dungeon floor.
   * @param {Object} opts
   * @param {number} opts.width - Grid width (default 32)
   * @param {number} opts.height - Grid height (default 32)
   * @param {number} opts.roomCount - Target room count (default 6-10)
   * @param {string} opts.biome - Biome name for theming
   * @param {number} opts.floor - Floor number (for scaling)
   * @param {boolean} opts.placeStairsUp - Place ascending stairs
   * @param {boolean} opts.placeStairsDn - Place descending stairs
   * @returns {Object} Floor data
   */
  function generate(opts) {
    opts = opts || {};
    var W = opts.width || DEFAULT_W;
    var H = opts.height || DEFAULT_H;
    var targetRooms = opts.roomCount || SeededRNG.randInt(6, 10);

    // Init grid with walls
    var grid = [];
    for (var y = 0; y < H; y++) {
      grid[y] = [];
      for (var x = 0; x < W; x++) {
        grid[y][x] = TILES.WALL;
      }
    }

    // ── BSP room placement ──
    var rooms = _generateRoomsBSP(W, H, targetRooms);

    // Carve rooms into grid
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      for (var ry = r.y; ry < r.y + r.h; ry++) {
        for (var rx = r.x; rx < r.x + r.w; rx++) {
          if (ry > 0 && ry < H - 1 && rx > 0 && rx < W - 1) {
            grid[ry][rx] = TILES.EMPTY;
          }
        }
      }
    }

    // ── Connect rooms with corridors ──
    for (var i = 1; i < rooms.length; i++) {
      _carveCorridor(grid, W, H, rooms[i - 1], rooms[i]);
    }

    // Connect last to first for loop
    if (rooms.length > 2) {
      _carveCorridor(grid, W, H, rooms[rooms.length - 1], rooms[0]);
    }

    // ── Place stairs ──
    var doors = { stairsUp: null, stairsDn: null };

    if (opts.placeStairsUp !== false && rooms.length >= 1) {
      var upRoom = rooms[0];
      var upPos = _findWallAdjacent(grid, W, H, upRoom);
      if (upPos) {
        grid[upPos.y][upPos.x] = TILES.STAIRS_UP;
        doors.stairsUp = upPos;
      }
    }

    if (opts.placeStairsDn !== false && rooms.length >= 2) {
      // Place stairs down in the farthest room from stairs up
      var dnRoom = rooms[rooms.length - 1];
      var dnPos = _findWallAdjacent(grid, W, H, dnRoom);
      if (dnPos) {
        grid[dnPos.y][dnPos.x] = TILES.STAIRS_DN;
        doors.stairsDn = dnPos;
      }
    }

    // ── Place chests ──
    var chestCount = SeededRNG.randInt(1, 3);
    for (var c = 0; c < chestCount; c++) {
      var chestRoom = rooms[SeededRNG.randInt(1, rooms.length - 1)];
      if (!chestRoom) continue;
      var cx = chestRoom.x + SeededRNG.randInt(1, chestRoom.w - 2);
      var cy = chestRoom.y + SeededRNG.randInt(1, chestRoom.h - 2);
      if (cx > 0 && cx < W - 1 && cy > 0 && cy < H - 1 && grid[cy][cx] === TILES.EMPTY) {
        grid[cy][cx] = TILES.CHEST;
      }
    }

    // ── Place hazards ──
    // Hazard density scales with floor depth. Biome determines type mix.
    // Adapted from EyesOnly's ground-effects placement logic.
    var floor = opts.floor || 1;
    var hazardBudget = Math.min(8, Math.floor(floor * 1.5) + SeededRNG.randInt(0, 2));
    var biome = opts.biome || 'cellar';
    var hazardPool = _getHazardPool(biome);

    for (var hz = 0; hz < hazardBudget; hz++) {
      var hzRoom = rooms[SeededRNG.randInt(1, rooms.length - 1)];
      if (!hzRoom) continue;
      var hx = hzRoom.x + SeededRNG.randInt(1, hzRoom.w - 2);
      var hy = hzRoom.y + SeededRNG.randInt(1, hzRoom.h - 2);
      if (hx > 0 && hx < W - 1 && hy > 0 && hy < H - 1 && grid[hy][hx] === TILES.EMPTY) {
        grid[hy][hx] = SeededRNG.pick(hazardPool);
      }
    }

    // ── Place bonfire / hearth ──
    // One rest point per floor, in a mid-range room (not first, not last).
    // Depth 1 (exterior): campfire blockout — C-shape of shrubs around bonfire.
    // Depth 3+ (dungeon): hearth tile — riverrock fireplace column.
    // Depth 2 (interior): hand-authored, so this code doesn't run.
    if (rooms.length >= 3) {
      var bfIdx = Math.floor(rooms.length / 2);
      var bfRoom = rooms[bfIdx];
      var bfx = bfRoom.cx;
      var bfy = bfRoom.cy;
      var flId = opts.floorId || '';
      var flDepth = flId ? flId.split('.').length : 1;

      if (grid[bfy][bfx] === TILES.EMPTY) {
        if (flDepth >= 3 && TILES.HEARTH) {
          // Dungeon: place a hearth column (riverrock fireplace)
          grid[bfy][bfx] = TILES.HEARTH;
        } else {
          // Exterior: campfire blockout — bonfire center with shrub ring
          grid[bfy][bfx] = TILES.BONFIRE;
          // Place C-shape shrubs around the bonfire (N, W, E — open to south)
          var shrubOffsets = [
            { dx: 0, dy: -1 },  // North
            { dx: -1, dy: 0 },  // West
            { dx: 1, dy: 0 }    // East
          ];
          for (var si = 0; si < shrubOffsets.length; si++) {
            var sx = bfx + shrubOffsets[si].dx;
            var sy = bfy + shrubOffsets[si].dy;
            if (sx > 0 && sx < W - 1 && sy > 0 && sy < H - 1 &&
                grid[sy][sx] === TILES.EMPTY) {
              grid[sy][sx] = TILES.SHRUB;
            }
          }
        }
      }
    }

    // ── Place corpses (Hero's mess — pre-placed salvage) ──
    if (typeof Salvage !== 'undefined') {
      Salvage.placeCorpses(grid, rooms, W, H, floor);
    }

    // ── Place breakable props (barrels, crates, etc.) ──
    if (typeof BreakableSpawner !== 'undefined') {
      var biomeStr = opts.biome || 'cellar';
      BreakableSpawner.spawnBreakables(grid, rooms, W, H, biomeStr, floor, opts.floorId || '');
    }

    // ── Place faction shop ──
    // One shop per floor, in the penultimate room (close to the exit but
    // not the spawn room). Faction is determined by biome:
    //   cellar → tide, foundry → foundry, sealab → admiralty
    var shops = [];
    var BIOME_FACTION = { cellar: 'tide', foundry: 'foundry', sealab: 'admiralty' };
    var shopFaction = BIOME_FACTION[biome] || 'tide';

    if (rooms.length >= 2) {
      var shopRoomIdx = Math.max(1, rooms.length - 2);
      var shopRoom = rooms[shopRoomIdx];
      var attempts = 0;
      var shopPlaced = false;
      while (!shopPlaced && attempts < 30) {
        attempts++;
        var sx = shopRoom.x + 1 + Math.floor(SeededRNG.random() * Math.max(1, shopRoom.w - 2));
        var sy = shopRoom.y + 1 + Math.floor(SeededRNG.random() * Math.max(1, shopRoom.h - 2));
        if (sx > 0 && sx < W - 1 && sy > 0 && sy < H - 1 && grid[sy][sx] === TILES.EMPTY) {
          grid[sy][sx] = TILES.SHOP;
          shops.push({ x: sx, y: sy, factionId: shopFaction });
          shopPlaced = true;
        }
      }
    }

    return {
      grid: grid,
      rooms: rooms,
      doors: doors,
      gridW: W,
      gridH: H,
      biome: opts.biome || 'cellar',
      shops: shops
    };
  }

  // ── Hazard pool by biome ──
  // Each biome favors different hazard types, matching the environment.
  // Adapted from EyesOnly's per-floor ground effect distributions.

  function _getHazardPool(biome) {
    switch (biome) {
      case 'cellar':
        // Old cellars: traps and spikes in damp stone tunnels
        return [TILES.TRAP, TILES.TRAP, TILES.SPIKES];
      case 'foundry':
        // Foundry works: fire and spikes among rusted machinery
        return [TILES.FIRE, TILES.FIRE, TILES.SPIKES];
      case 'sealab':
        // Sealab: poison (chemical spills) and traps (security)
        return [TILES.POISON, TILES.POISON, TILES.TRAP, TILES.SPIKES];
      default:
        return [TILES.TRAP];
    }
  }

  // ── BSP tree room generation ──

  function _generateRoomsBSP(W, H, targetCount) {
    var leaves = [{ x: 1, y: 1, w: W - 2, h: H - 2 }];
    var maxSplits = targetCount * 2;
    var splits = 0;

    while (leaves.length < targetCount && splits < maxSplits) {
      var newLeaves = [];
      var didSplit = false;
      SeededRNG.shuffle(leaves);

      for (var i = 0; i < leaves.length; i++) {
        var leaf = leaves[i];
        var pair = _splitLeaf(leaf);
        if (pair) {
          newLeaves.push(pair[0], pair[1]);
          didSplit = true;
        } else {
          newLeaves.push(leaf);
        }
        splits++;
      }

      leaves = newLeaves;
      if (!didSplit) break;
    }

    // Create rooms within leaves
    var rooms = [];
    for (var i = 0; i < leaves.length; i++) {
      var room = _roomFromLeaf(leaves[i]);
      if (room) rooms.push(room);
    }

    return rooms;
  }

  function _splitLeaf(leaf) {
    var minLeaf = MIN_ROOM * 2 + 2;

    // Decide split direction
    var splitH;
    if (leaf.w > leaf.h && leaf.w / leaf.h >= 1.25) {
      splitH = false; // split vertically (side by side)
    } else if (leaf.h > leaf.w && leaf.h / leaf.w >= 1.25) {
      splitH = true;  // split horizontally (top and bottom)
    } else {
      splitH = SeededRNG.random() > 0.5;
    }

    if (splitH) {
      if (leaf.h < minLeaf) return null;
      var split = SeededRNG.randInt(MIN_ROOM + 1, leaf.h - MIN_ROOM - 1);
      return [
        { x: leaf.x, y: leaf.y, w: leaf.w, h: split },
        { x: leaf.x, y: leaf.y + split, w: leaf.w, h: leaf.h - split }
      ];
    } else {
      if (leaf.w < minLeaf) return null;
      var split = SeededRNG.randInt(MIN_ROOM + 1, leaf.w - MIN_ROOM - 1);
      return [
        { x: leaf.x, y: leaf.y, w: split, h: leaf.h },
        { x: leaf.x + split, y: leaf.y, w: leaf.w - split, h: leaf.h }
      ];
    }
  }

  function _roomFromLeaf(leaf) {
    var rw = SeededRNG.randInt(MIN_ROOM, Math.min(MAX_ROOM, leaf.w - 2));
    var rh = SeededRNG.randInt(MIN_ROOM, Math.min(MAX_ROOM, leaf.h - 2));
    var rx = leaf.x + SeededRNG.randInt(1, leaf.w - rw - 1);
    var ry = leaf.y + SeededRNG.randInt(1, leaf.h - rh - 1);

    // Clamp to valid bounds
    if (rx < 1) rx = 1;
    if (ry < 1) ry = 1;
    if (rx + rw >= leaf.x + leaf.w) rw = leaf.x + leaf.w - rx - 1;
    if (ry + rh >= leaf.y + leaf.h) rh = leaf.y + leaf.h - ry - 1;

    if (rw < MIN_ROOM || rh < MIN_ROOM) return null;

    return { x: rx, y: ry, w: rw, h: rh, cx: Math.floor(rx + rw / 2), cy: Math.floor(ry + rh / 2) };
  }

  // ── Corridor carving (L-shaped) ──

  function _carveCorridor(grid, W, H, roomA, roomB) {
    var x1 = roomA.cx;
    var y1 = roomA.cy;
    var x2 = roomB.cx;
    var y2 = roomB.cy;

    // Randomly decide horizontal-first or vertical-first
    if (SeededRNG.random() > 0.5) {
      _carveH(grid, W, H, x1, x2, y1);
      _carveV(grid, W, H, y1, y2, x2);
    } else {
      _carveV(grid, W, H, y1, y2, x1);
      _carveH(grid, W, H, x1, x2, y2);
    }
  }

  function _carveH(grid, W, H, x1, x2, y) {
    var minX = Math.min(x1, x2);
    var maxX = Math.max(x1, x2);
    for (var x = minX; x <= maxX; x++) {
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
        if (grid[y][x] === TILES.WALL) grid[y][x] = TILES.EMPTY;
      }
    }
  }

  function _carveV(grid, W, H, y1, y2, x) {
    var minY = Math.min(y1, y2);
    var maxY = Math.max(y1, y2);
    for (var y = minY; y <= maxY; y++) {
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
        if (grid[y][x] === TILES.WALL) grid[y][x] = TILES.EMPTY;
      }
    }
  }

  // ── Find a wall-adjacent empty tile in a room for stair placement ──

  function _findWallAdjacent(grid, W, H, room) {
    // Try corners then edges of the room
    var candidates = [];
    for (var ry = room.y; ry < room.y + room.h; ry++) {
      for (var rx = room.x; rx < room.x + room.w; rx++) {
        if (grid[ry][rx] !== TILES.EMPTY) continue;
        // Check if adjacent to at least one wall
        var adjWall = false;
        if (rx > 0 && grid[ry][rx - 1] === TILES.WALL) adjWall = true;
        if (rx < W - 1 && grid[ry][rx + 1] === TILES.WALL) adjWall = true;
        if (ry > 0 && grid[ry - 1][rx] === TILES.WALL) adjWall = true;
        if (ry < H - 1 && grid[ry + 1][rx] === TILES.WALL) adjWall = true;
        if (adjWall) candidates.push({ x: rx, y: ry });
      }
    }
    return candidates.length > 0 ? SeededRNG.pick(candidates) : { x: room.cx, y: room.cy };
  }

  return {
    generate: generate
  };
})();

#!/usr/bin/env node
// ============================================================
// tools/procgen.js — Pass 6 Procedural Dungeon Generator
// ============================================================
// Consumes a recipe JSON (see recipes/recipe.schema.json) and
// produces a floor-data-compatible output: { grid, spawn, doors,
// doorTargets, entities, meta }. The output can be fed directly
// into applyWorldDiff or saved to floor-data.json via the CLI.
//
// Algorithm: BSP (Binary Space Partition) room carving with
// strategy-aware corridor linking and entity decoration.
//
// Three strategy archetypes shape the generated topology:
//   cobweb       — many long 1-wide corridors, frequent T-junctions
//   combat       — large open rooms, wide corridors, sightlines
//   pressure-wash — winding connected loops, self-crossing paths
//
// Usage (CLI):
//   node tools/procgen.js --recipe recipes/cobweb-cellar.json
//   node tools/procgen.js --recipe recipes/cobweb-cellar.json --seed 42
//   node tools/procgen.js --recipe recipes/cobweb-cellar.json --floor-id 3.1
//   node tools/procgen.js --recipe recipes/cobweb-cellar.json --ascii
//
// Output: JSON to stdout (or ASCII if --ascii).
//
// This file is also require()-able as a library:
//   var procgen = require('./procgen');
//   var result = procgen.generate(recipe, { seed: 42 });
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

// ── Tile resolution ────────────────────────────────────────────
// We need tile IDs. Load tile-schema.json to resolve names → IDs.
var TILE_SCHEMA_PATH = path.join(__dirname, 'tile-schema.json');
var BIOME_MAP_PATH   = path.join(__dirname, 'biome-map.json');

var _tileSchema = null;
var _biomeMap   = null;

function _loadTileSchema() {
  if (_tileSchema) return _tileSchema;
  _tileSchema = JSON.parse(fs.readFileSync(TILE_SCHEMA_PATH, 'utf8'));
  return _tileSchema;
}

function _loadBiomeMap() {
  if (_biomeMap) return _biomeMap;
  _biomeMap = JSON.parse(fs.readFileSync(BIOME_MAP_PATH, 'utf8'));
  return _biomeMap;
}

function _resolveTile(name) {
  var schema = _loadTileSchema();
  var tiles = schema.tiles || schema;
  // tiles is an object keyed by ID string: { "0": {id,name,...}, "1": ... }
  var keys = Object.keys(tiles);
  for (var i = 0; i < keys.length; i++) {
    if (tiles[keys[i]].name === name) return tiles[keys[i]].id;
  }
  return null;
}

// ── Seeded RNG (xorshift32) ────────────────────────────────────
function RNG(seed) {
  this._state = (seed || (Date.now() ^ (Math.random() * 0xFFFFFFFF))) >>> 0;
  if (this._state === 0) this._state = 1;
}
RNG.prototype.next = function () {
  var s = this._state;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  this._state = s >>> 0;
  return (this._state) / 0x100000000;
};
RNG.prototype.intBetween = function (lo, hi) {
  return lo + Math.floor(this.next() * (hi - lo + 1));
};
RNG.prototype.pick = function (arr) {
  return arr[Math.floor(this.next() * arr.length)];
};
RNG.prototype.shuffle = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(this.next() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
};

// ── BSP tree ───────────────────────────────────────────────────
// A BSP node is { x, y, w, h, room?, left?, right? }
// Leaf nodes get rooms carved inside them.

function _bspSplit(node, rng, minLeafW, minLeafH, depth, maxDepth) {
  if (depth >= maxDepth) return;
  if (node.w < minLeafW * 2 + 3 && node.h < minLeafH * 2 + 3) return;

  var splitH;
  if (node.w < minLeafW * 2 + 3) splitH = true;
  else if (node.h < minLeafH * 2 + 3) splitH = false;
  else splitH = rng.next() < 0.5;

  if (splitH) {
    // Horizontal split (top / bottom)
    var minY = node.y + minLeafH + 1;
    var maxY = node.y + node.h - minLeafH - 2;
    if (minY > maxY) return;
    var splitY = rng.intBetween(minY, maxY);
    node.left  = { x: node.x, y: node.y,      w: node.w, h: splitY - node.y };
    node.right = { x: node.x, y: splitY,       w: node.w, h: node.y + node.h - splitY };
  } else {
    // Vertical split (left / right)
    var minX = node.x + minLeafW + 1;
    var maxX = node.x + node.w - minLeafW - 2;
    if (minX > maxX) return;
    var splitX = rng.intBetween(minX, maxX);
    node.left  = { x: node.x,      y: node.y, w: splitX - node.x,               h: node.h };
    node.right = { x: splitX,      y: node.y, w: node.x + node.w - splitX,      h: node.h };
  }

  _bspSplit(node.left,  rng, minLeafW, minLeafH, depth + 1, maxDepth);
  _bspSplit(node.right, rng, minLeafW, minLeafH, depth + 1, maxDepth);
}

function _getLeaves(node) {
  if (!node.left && !node.right) return [node];
  var out = [];
  if (node.left)  out = out.concat(_getLeaves(node.left));
  if (node.right) out = out.concat(_getLeaves(node.right));
  return out;
}

function _carveRoom(leaf, rng, minW, minH, maxW, maxH) {
  // Room interior within the leaf, with at least 1 tile of wall border
  var roomW = rng.intBetween(Math.max(minW, 3), Math.min(maxW, leaf.w - 2));
  var roomH = rng.intBetween(Math.max(minH, 3), Math.min(maxH, leaf.h - 2));
  var roomX = rng.intBetween(leaf.x + 1, leaf.x + leaf.w - roomW - 1);
  var roomY = rng.intBetween(leaf.y + 1, leaf.y + leaf.h - roomH - 1);
  leaf.room = { x: roomX, y: roomY, w: roomW, h: roomH };
  return leaf.room;
}

// ── Grid helpers ───────────────────────────────────────────────
function _makeGrid(w, h, wallTile) {
  var grid = [];
  for (var y = 0; y < h; y++) {
    var row = [];
    for (var x = 0; x < w; x++) row.push(wallTile);
    grid.push(row);
  }
  return grid;
}

function _fillRect(grid, x, y, w, h, tile) {
  for (var dy = 0; dy < h; dy++) {
    for (var dx = 0; dx < w; dx++) {
      var gy = y + dy;
      var gx = x + dx;
      if (gy >= 0 && gy < grid.length && gx >= 0 && gx < grid[0].length) {
        grid[gy][gx] = tile;
      }
    }
  }
}

function _setTile(grid, x, y, tile) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    grid[y][x] = tile;
  }
}

function _getTile(grid, x, y) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    return grid[y][x];
  }
  return -1;
}

// ── Corridor carving ───────────────────────────────────────────

function _carveStraightCorridor(grid, x1, y1, x2, y2, floorTile, width) {
  var cells = [];
  // Horizontal then vertical (or vice versa, 50/50)
  var midX = x2, midY = y1;
  // Horizontal leg
  var sx = Math.min(x1, midX), ex = Math.max(x1, midX);
  for (var x = sx; x <= ex; x++) {
    for (var dw = 0; dw < width; dw++) {
      _setTile(grid, x, y1 + dw, floorTile);
      cells.push({ x: x, y: y1 + dw });
    }
  }
  // Vertical leg
  var sy = Math.min(y1, y2), ey = Math.max(y1, y2);
  for (var y = sy; y <= ey; y++) {
    for (var dw = 0; dw < width; dw++) {
      _setTile(grid, x2 + dw, y, floorTile);
      cells.push({ x: x2 + dw, y: y });
    }
  }
  return cells;
}

function _carveWindingCorridor(grid, x1, y1, x2, y2, floorTile, width, rng) {
  var cells = [];
  // S-curve: horizontal → vertical → horizontal (3 segments)
  var midY = rng.intBetween(Math.min(y1, y2), Math.max(y1, y2));
  var midX = rng.intBetween(Math.min(x1, x2), Math.max(x1, x2));

  // Segment 1: x1,y1 → midX,y1 (horizontal)
  var sx, ex;
  sx = Math.min(x1, midX); ex = Math.max(x1, midX);
  for (var x = sx; x <= ex; x++) {
    for (var dw = 0; dw < width; dw++) {
      _setTile(grid, x, y1 + dw, floorTile);
      cells.push({ x: x, y: y1 + dw });
    }
  }
  // Segment 2: midX,y1 → midX,midY (vertical)
  var sy, ey;
  sy = Math.min(y1, midY); ey = Math.max(y1, midY);
  for (var y = sy; y <= ey; y++) {
    for (var dw = 0; dw < width; dw++) {
      _setTile(grid, midX + dw, y, floorTile);
      cells.push({ x: midX + dw, y: y });
    }
  }
  // Segment 3: midX,midY → x2,midY (horizontal)
  sx = Math.min(midX, x2); ex = Math.max(midX, x2);
  for (var x = sx; x <= ex; x++) {
    for (var dw = 0; dw < width; dw++) {
      _setTile(grid, x, midY + dw, floorTile);
      cells.push({ x: x, y: midY + dw });
    }
  }
  // Segment 4: x2,midY → x2,y2 (vertical)
  sy = Math.min(midY, y2); ey = Math.max(midY, y2);
  for (var y = sy; y <= ey; y++) {
    for (var dw = 0; dw < width; dw++) {
      _setTile(grid, x2 + dw, y, floorTile);
      cells.push({ x: x2 + dw, y: y });
    }
  }
  return cells;
}

function _carveLBendCorridor(grid, x1, y1, x2, y2, floorTile, width, rng) {
  var cells = [];
  // L-bend: pick whether to go horizontal-first or vertical-first
  if (rng.next() < 0.5) {
    // Horizontal first
    var sx = Math.min(x1, x2), ex = Math.max(x1, x2);
    for (var x = sx; x <= ex; x++) {
      for (var dw = 0; dw < width; dw++) {
        _setTile(grid, x, y1 + dw, floorTile);
        cells.push({ x: x, y: y1 + dw });
      }
    }
    var sy = Math.min(y1, y2), ey = Math.max(y1, y2);
    for (var y = sy; y <= ey; y++) {
      for (var dw = 0; dw < width; dw++) {
        _setTile(grid, x2 + dw, y, floorTile);
        cells.push({ x: x2 + dw, y: y });
      }
    }
  } else {
    // Vertical first
    var sy2 = Math.min(y1, y2), ey2 = Math.max(y1, y2);
    for (var y = sy2; y <= ey2; y++) {
      for (var dw = 0; dw < width; dw++) {
        _setTile(grid, x1 + dw, y, floorTile);
        cells.push({ x: x1 + dw, y: y });
      }
    }
    var sx2 = Math.min(x1, x2), ex2 = Math.max(x1, x2);
    for (var x = sx2; x <= ex2; x++) {
      for (var dw = 0; dw < width; dw++) {
        _setTile(grid, x, y2 + dw, floorTile);
        cells.push({ x: x, y: y2 + dw });
      }
    }
  }
  return cells;
}

function _carveCorridor(grid, x1, y1, x2, y2, floorTile, style, width, rng) {
  var actualStyle = style;
  if (style === 'random') {
    actualStyle = rng.pick(['straight', 'winding', 'l-bend']);
  }
  switch (actualStyle) {
    case 'winding':
      return _carveWindingCorridor(grid, x1, y1, x2, y2, floorTile, width, rng);
    case 'l-bend':
      return _carveLBendCorridor(grid, x1, y1, x2, y2, floorTile, width, rng);
    default:
      return _carveStraightCorridor(grid, x1, y1, x2, y2, floorTile, width);
  }
}

// ── Room center helper ─────────────────────────────────────────
function _roomCenter(room) {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2)
  };
}

// ── MST (minimum spanning tree) corridor connections ───────────
// Prim's algorithm on room centers to guarantee connectivity.
function _connectRoomsMST(rooms, grid, floorTile, style, width, rng) {
  if (rooms.length < 2) return [];
  var corridorCells = [];
  var connected = [0];
  var remaining = [];
  for (var i = 1; i < rooms.length; i++) remaining.push(i);

  while (remaining.length > 0) {
    var bestDist = Infinity;
    var bestC = -1, bestR = -1;
    for (var ci = 0; ci < connected.length; ci++) {
      for (var ri = 0; ri < remaining.length; ri++) {
        var a = _roomCenter(rooms[connected[ci]]);
        var b = _roomCenter(rooms[remaining[ri]]);
        var dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestC = connected[ci];
          bestR = ri;
        }
      }
    }
    var targetIdx = remaining.splice(bestR, 1)[0];
    connected.push(targetIdx);
    var ca = _roomCenter(rooms[bestC]);
    var cb = _roomCenter(rooms[targetIdx]);
    var cells = _carveCorridor(grid, ca.x, ca.y, cb.x, cb.y, floorTile, style, width, rng);
    corridorCells = corridorCells.concat(cells);
  }
  return corridorCells;
}

// ── Extra loop-back connections ────────────────────────────────
function _addExtraConnections(rooms, grid, floorTile, style, width, fraction, rng) {
  var corridorCells = [];
  if (rooms.length < 3 || fraction <= 0) return corridorCells;
  // Build list of all non-MST pairs, sorted by distance
  var pairs = [];
  for (var i = 0; i < rooms.length; i++) {
    for (var j = i + 2; j < rooms.length; j++) { // skip adjacent (already MST)
      var a = _roomCenter(rooms[i]);
      var b = _roomCenter(rooms[j]);
      pairs.push({ i: i, j: j, dist: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) });
    }
  }
  pairs.sort(function (a, b) { return a.dist - b.dist; });
  var count = Math.max(1, Math.round(pairs.length * fraction));
  for (var k = 0; k < count && k < pairs.length; k++) {
    var pa = _roomCenter(rooms[pairs[k].i]);
    var pb = _roomCenter(rooms[pairs[k].j]);
    var cells = _carveCorridor(grid, pa.x, pa.y, pb.x, pb.y, floorTile, style, width, rng);
    corridorCells = corridorCells.concat(cells);
  }
  return corridorCells;
}

// ── Strategy decorators ────────────────────────────────────────
// These modify the grid post-BSP to emphasize each archetype.

function _applyCobwebStrategy(grid, rooms, corridorCells, floorTile, wallTile, weight, rng) {
  // Cobweb strategy: extend corridors to be longer, add T-junctions,
  // carve branch stubs off main corridors for chokepoint richness.
  var W = grid[0].length, H = grid.length;
  var branchCount = Math.round(rooms.length * 2 * weight);

  for (var b = 0; b < branchCount; b++) {
    // Pick a random corridor cell
    if (corridorCells.length === 0) break;
    var cell = rng.pick(corridorCells);
    var dirs = rng.shuffle([
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ]);
    // Try to carve a short branch (3-6 tiles) perpendicular
    for (var d = 0; d < dirs.length; d++) {
      var len = rng.intBetween(3, 6);
      var ok = true;
      var branchCells = [];
      for (var step = 1; step <= len; step++) {
        var nx = cell.x + dirs[d].dx * step;
        var ny = cell.y + dirs[d].dy * step;
        if (nx <= 0 || nx >= W - 1 || ny <= 0 || ny >= H - 1) { ok = false; break; }
        // Only carve into wall tiles (don't overwrite existing rooms)
        if (_getTile(grid, nx, ny) !== wallTile) { ok = false; break; }
        // Check neighbors perpendicular to branch direction aren't floor
        // (prevents merging branches into parallel corridors too easily)
        var px = nx + dirs[d].dy, py = ny + dirs[d].dx;
        var qx = nx - dirs[d].dy, qy = ny - dirs[d].dx;
        if (_getTile(grid, px, py) === floorTile && step > 1) { ok = false; break; }
        if (_getTile(grid, qx, qy) === floorTile && step > 1) { ok = false; break; }
        branchCells.push({ x: nx, y: ny });
      }
      if (ok && branchCells.length >= 3) {
        for (var s = 0; s < branchCells.length; s++) {
          _setTile(grid, branchCells[s].x, branchCells[s].y, floorTile);
          corridorCells.push(branchCells[s]);
        }
        break; // one branch per source cell
      }
    }
  }
}

function _applyPressureWashStrategy(grid, rooms, corridorCells, floorTile, wallTile, weight, rng) {
  // Pressure wash strategy: carve loop-backs and parallel passages
  // that create a circuit. The player can choose between short direct
  // paths (few kinks) and thorough coverage paths (many kinks).
  var W = grid[0].length, H = grid.length;
  var loopCount = Math.round(rooms.length * 1.5 * weight);

  for (var l = 0; l < loopCount; l++) {
    // Pick two corridor cells that are close but not directly connected
    if (corridorCells.length < 10) break;
    var a = rng.pick(corridorCells);
    var best = null, bestDist = Infinity;
    for (var tries = 0; tries < 20; tries++) {
      var b = rng.pick(corridorCells);
      var dx = Math.abs(a.x - b.x);
      var dy = Math.abs(a.y - b.y);
      var manhattan = dx + dy;
      // We want cells that are 3-8 tiles apart
      if (manhattan >= 3 && manhattan <= 8 && manhattan < bestDist) {
        best = b;
        bestDist = manhattan;
      }
    }
    if (!best) continue;
    // Carve a winding corridor between them to create a loop
    var cells = _carveWindingCorridor(grid, a.x, a.y, best.x, best.y, floorTile, 1, rng);
    for (var c = 0; c < cells.length; c++) corridorCells.push(cells[c]);
  }
}

function _applyCombatStrategy(grid, rooms, corridorCells, floorTile, wallTile, weight, rng) {
  // Combat strategy: widen rooms slightly, add alcoves for ambush,
  // create open sightlines between rooms.
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    // Expand room by 1 tile on random edges (if space allows)
    if (rng.next() < weight * 0.6) {
      var dir = rng.intBetween(0, 3);
      var expansions = [
        { dx: -1, dy: 0, fx: room.x - 1, fy: room.y, fw: 1, fh: room.h },
        { dx: 1,  dy: 0, fx: room.x + room.w, fy: room.y, fw: 1, fh: room.h },
        { dx: 0,  dy: -1, fx: room.x, fy: room.y - 1, fw: room.w, fh: 1 },
        { dx: 0,  dy: 1,  fx: room.x, fy: room.y + room.h, fw: room.w, fh: 1 }
      ];
      var exp = expansions[dir];
      // Check bounds (leave border wall intact)
      if (exp.fx > 0 && exp.fy > 0 &&
          exp.fx + exp.fw < grid[0].length - 1 &&
          exp.fy + exp.fh < grid.length - 1) {
        _fillRect(grid, exp.fx, exp.fy, exp.fw, exp.fh, floorTile);
        // Update room bounds
        if (dir === 0) { room.x--; room.w++; }
        else if (dir === 1) { room.w++; }
        else if (dir === 2) { room.y--; room.h++; }
        else { room.h++; }
      }
    }

    // Add 2x2 alcove off a random room wall (ambush nook)
    if (rng.next() < weight * 0.5) {
      var wallSide = rng.intBetween(0, 3);
      var alcX, alcY;
      switch (wallSide) {
        case 0: alcX = room.x - 2; alcY = room.y + rng.intBetween(0, Math.max(0, room.h - 2)); break;
        case 1: alcX = room.x + room.w; alcY = room.y + rng.intBetween(0, Math.max(0, room.h - 2)); break;
        case 2: alcX = room.x + rng.intBetween(0, Math.max(0, room.w - 2)); alcY = room.y - 2; break;
        default: alcX = room.x + rng.intBetween(0, Math.max(0, room.w - 2)); alcY = room.y + room.h; break;
      }
      if (alcX > 0 && alcY > 0 && alcX + 2 < grid[0].length - 1 && alcY + 2 < grid.length - 1) {
        _fillRect(grid, alcX, alcY, 2, 2, floorTile);
        // Carve the connecting door between room and alcove
        var connX = (wallSide === 0) ? room.x - 1 : (wallSide === 1) ? room.x + room.w - 1 : alcX;
        var connY = (wallSide === 2) ? room.y - 1 : (wallSide === 3) ? room.y + room.h - 1 : alcY;
        _setTile(grid, connX, connY, floorTile);
      }
    }
  }
}

// ── Entity placement ───────────────────────────────────────────

function _placeTorches(grid, rooms, wallTile, torchTile, density, rng) {
  var placed = [];
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    // Walk the room perimeter looking for wall tiles
    var perimeter = [];
    for (var x = room.x - 1; x <= room.x + room.w; x++) {
      if (_getTile(grid, x, room.y - 1) === wallTile) perimeter.push({ x: x, y: room.y - 1 });
      if (_getTile(grid, x, room.y + room.h) === wallTile) perimeter.push({ x: x, y: room.y + room.h });
    }
    for (var y = room.y; y < room.y + room.h; y++) {
      if (_getTile(grid, room.x - 1, y) === wallTile) perimeter.push({ x: room.x - 1, y: y });
      if (_getTile(grid, room.x + room.w, y) === wallTile) perimeter.push({ x: room.x + room.w, y: y });
    }
    rng.shuffle(perimeter);
    var count = Math.max(1, Math.round(perimeter.length * density));
    // Space torches apart (min 3 tiles)
    var lastPlaced = [];
    for (var j = 0; j < perimeter.length && lastPlaced.length < count; j++) {
      var p = perimeter[j];
      var tooClose = false;
      for (var k = 0; k < lastPlaced.length; k++) {
        if (Math.abs(p.x - lastPlaced[k].x) + Math.abs(p.y - lastPlaced[k].y) < 3) {
          tooClose = true; break;
        }
      }
      if (!tooClose) {
        _setTile(grid, p.x, p.y, torchTile);
        lastPlaced.push(p);
        placed.push(p);
      }
    }
  }
  return placed;
}

function _placeBreakables(grid, rooms, floorTile, breakableSet, density, rng) {
  var placed = [];
  var breakableTiles = [];
  for (var b = 0; b < breakableSet.length; b++) {
    var tid = _resolveTile(breakableSet[b]);
    if (tid !== null) breakableTiles.push(tid);
  }
  if (breakableTiles.length === 0) return placed;

  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var candidates = [];
    for (var y = room.y; y < room.y + room.h; y++) {
      for (var x = room.x; x < room.x + room.w; x++) {
        if (_getTile(grid, x, y) === floorTile) {
          candidates.push({ x: x, y: y });
        }
      }
    }
    rng.shuffle(candidates);
    var count = Math.max(0, Math.round(candidates.length * density));
    for (var j = 0; j < count && j < candidates.length; j++) {
      var tile = rng.pick(breakableTiles);
      _setTile(grid, candidates[j].x, candidates[j].y, tile);
      placed.push({ x: candidates[j].x, y: candidates[j].y, tile: tile });
    }
  }
  return placed;
}

function _placeTraps(grid, corridorCells, floorTile, trapDensity, rng) {
  var placed = [];
  var trapTiles = ['TRAP_PRESSURE_PLATE', 'TRAP_TRIPWIRE', 'TRAP_TELEPORT_DISC'];
  var trapIds = [];
  for (var i = 0; i < trapTiles.length; i++) {
    var tid = _resolveTile(trapTiles[i]);
    if (tid !== null) trapIds.push(tid);
  }
  if (trapIds.length === 0 || corridorCells.length === 0) return placed;

  // Only place traps on corridor cells that are still floor
  var eligible = [];
  for (var c = 0; c < corridorCells.length; c++) {
    if (_getTile(grid, corridorCells[c].x, corridorCells[c].y) === floorTile) {
      eligible.push(corridorCells[c]);
    }
  }
  rng.shuffle(eligible);
  var count = Math.max(0, Math.round(eligible.length * trapDensity));
  for (var j = 0; j < count && j < eligible.length; j++) {
    var trapId = rng.pick(trapIds);
    _setTile(grid, eligible[j].x, eligible[j].y, trapId);
    placed.push({ x: eligible[j].x, y: eligible[j].y, tile: trapId });
  }
  return placed;
}

function _placeChests(grid, rooms, floorTile, chestMin, chestMax, rng) {
  var chestTile = _resolveTile('CHEST');
  if (chestTile === null) return [];
  var placed = [];
  var count = rng.intBetween(chestMin, chestMax);

  // Place chests in distinct rooms, against walls
  var roomIndices = [];
  for (var i = 0; i < rooms.length; i++) roomIndices.push(i);
  rng.shuffle(roomIndices);

  for (var c = 0; c < count && c < roomIndices.length; c++) {
    var room = rooms[roomIndices[c]];
    // Find floor cells adjacent to a wall
    var wallAdj = [];
    for (var y = room.y; y < room.y + room.h; y++) {
      for (var x = room.x; x < room.x + room.w; x++) {
        if (_getTile(grid, x, y) !== floorTile) continue;
        // Check if adjacent to any wall-like tile (non-floor, non-walkable)
        var adj = [
          _getTile(grid, x - 1, y), _getTile(grid, x + 1, y),
          _getTile(grid, x, y - 1), _getTile(grid, x, y + 1)
        ];
        for (var a = 0; a < adj.length; a++) {
          if (adj[a] !== floorTile && adj[a] !== -1) {
            wallAdj.push({ x: x, y: y });
            break;
          }
        }
      }
    }
    if (wallAdj.length > 0) {
      var spot = rng.pick(wallAdj);
      _setTile(grid, spot.x, spot.y, chestTile);
      placed.push(spot);
    }
  }
  return placed;
}

function _placeCorpses(grid, rooms, floorTile, corpseMin, corpseMax, rng) {
  var corpseTile = _resolveTile('CORPSE');
  if (corpseTile === null) return [];
  var placed = [];
  var count = rng.intBetween(corpseMin, corpseMax);

  var allFloor = [];
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    for (var y = room.y; y < room.y + room.h; y++) {
      for (var x = room.x; x < room.x + room.w; x++) {
        if (_getTile(grid, x, y) === floorTile) allFloor.push({ x: x, y: y });
      }
    }
  }
  rng.shuffle(allFloor);
  for (var j = 0; j < count && j < allFloor.length; j++) {
    _setTile(grid, allFloor[j].x, allFloor[j].y, corpseTile);
    placed.push(allFloor[j]);
  }
  return placed;
}

// ── Door placement ─────────────────────────────────────────────

function _findWallSlot(grid, wall, floorTile, wallTile) {
  var W = grid[0].length, H = grid.length;
  // Find a wall tile on the given edge that has a floor tile behind it
  // (so the door is reachable). Returns {x, y} or null.
  var candidates = [];
  switch (wall) {
    case 'north':
      for (var x = 1; x < W - 1; x++) {
        if (_getTile(grid, x, 0) === wallTile && _getTile(grid, x, 1) === floorTile)
          candidates.push({ x: x, y: 0 });
      }
      break;
    case 'south':
      for (var x2 = 1; x2 < W - 1; x2++) {
        if (_getTile(grid, x2, H - 1) === wallTile && _getTile(grid, x2, H - 2) === floorTile)
          candidates.push({ x: x2, y: H - 1 });
      }
      break;
    case 'west':
      for (var y = 1; y < H - 1; y++) {
        if (_getTile(grid, 0, y) === wallTile && _getTile(grid, 1, y) === floorTile)
          candidates.push({ x: 0, y: y });
      }
      break;
    case 'east':
      for (var y2 = 1; y2 < H - 1; y2++) {
        if (_getTile(grid, W - 1, y2) === wallTile && _getTile(grid, W - 2, y2) === floorTile)
          candidates.push({ x: W - 1, y: y2 });
      }
      break;
  }
  return candidates.length > 0 ? candidates[Math.floor(candidates.length / 2)] : null;
}

function _ensurePathToDoor(grid, doorPos, floorTile, wallTile) {
  // Carve a straight path from the door inward until we hit existing floor
  var W = grid[0].length, H = grid.length;
  var dx = 0, dy = 0;
  if (doorPos.y === 0)     dy = 1;   // north edge → carve south
  if (doorPos.y === H - 1) dy = -1;  // south edge → carve north
  if (doorPos.x === 0)     dx = 1;   // west edge → carve east
  if (doorPos.x === W - 1) dx = -1;  // east edge → carve west

  var cx = doorPos.x + dx, cy = doorPos.y + dy;
  var maxSteps = Math.max(W, H);
  for (var s = 0; s < maxSteps; s++) {
    if (cx <= 0 || cx >= W - 1 || cy <= 0 || cy >= H - 1) break;
    if (_getTile(grid, cx, cy) === floorTile) break;
    _setTile(grid, cx, cy, floorTile);
    cx += dx;
    cy += dy;
  }
}

function _resolveWall(preference, rng) {
  if (preference === 'auto') {
    return rng.pick(['north', 'south', 'east', 'west']);
  }
  return preference;
}

function _oppositeWall(wall) {
  return { north: 'south', south: 'north', east: 'west', west: 'east' }[wall] || 'south';
}

// ── Enemy spawn list (entity metadata, not tile placement) ─────
function _generateEnemySpawns(rooms, floorTile, grid, enemyMin, enemyMax, rng) {
  var spawns = [];
  var count = rng.intBetween(enemyMin, enemyMax);
  // Distribute across rooms
  var roomIdx = [];
  for (var i = 0; i < rooms.length; i++) roomIdx.push(i);
  rng.shuffle(roomIdx);
  for (var e = 0; e < count; e++) {
    var room = rooms[roomIdx[e % roomIdx.length]];
    var cx = rng.intBetween(room.x + 1, room.x + room.w - 2);
    var cy = rng.intBetween(room.y + 1, room.y + room.h - 2);
    if (_getTile(grid, cx, cy) === floorTile) {
      spawns.push({ x: cx, y: cy, kind: 'ENEMY' });
    }
  }
  return spawns;
}

// ── ASCII renderer (standalone, doesn't need floor-data.json) ──
function _renderAscii(grid, spawn, doorPositions) {
  var schema = _loadTileSchema();
  var tiles = schema.tiles || schema;
  var glyphMap = {};
  var keys = Object.keys(tiles);
  for (var i = 0; i < keys.length; i++) {
    glyphMap[tiles[keys[i]].id] = tiles[keys[i]].glyph || '?';
  }
  var lines = [];
  for (var y = 0; y < grid.length; y++) {
    var row = '';
    for (var x = 0; x < grid[y].length; x++) {
      if (spawn && spawn.x === x && spawn.y === y) { row += '@'; continue; }
      var isDoor = false;
      if (doorPositions) {
        for (var d = 0; d < doorPositions.length; d++) {
          if (doorPositions[d].x === x && doorPositions[d].y === y) { isDoor = true; break; }
        }
      }
      if (isDoor) { row += 'D'; continue; }
      row += glyphMap[grid[y][x]] || '?';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════

function generate(recipe, opts) {
  opts = opts || {};
  var seed = (opts.seed != null) ? opts.seed : recipe.seed;
  var rng = new RNG(seed);

  // ── Resolve biome tiles ──────────────────────────────────────
  var biomeMap = _loadBiomeMap();
  var biome = biomeMap.biomes[recipe.biome];
  if (!biome) throw new Error('unknown biome: ' + recipe.biome);

  var wallTile  = _resolveTile(biome.wallTile);
  var floorTile = _resolveTile(biome.floorTile);
  var torchTile = _resolveTile(biome.torchTile);
  if (wallTile === null) throw new Error('cannot resolve wallTile: ' + biome.wallTile);
  if (floorTile === null) throw new Error('cannot resolve floorTile: ' + biome.floorTile);

  var W = recipe.size.width;
  var H = recipe.size.height;

  // ── Defaults ─────────────────────────────────────────────────
  var roomCfg = recipe.rooms || {};
  var roomCountRange = roomCfg.count || [3, 7];
  var roomMinSize = roomCfg.minSize || [3, 3];
  var roomMaxSize = roomCfg.maxSize || [9, 9];

  var corrCfg = recipe.corridors || {};
  var corrStyle = corrCfg.style || 'random';
  var corrWidth = corrCfg.width || 1;
  var extraConn = corrCfg.extraConnections != null ? corrCfg.extraConnections : 0.2;

  var entCfg = recipe.entities || {};
  var torchDensity    = entCfg.torchDensity != null ? entCfg.torchDensity : 0.3;
  var breakableDensity = entCfg.breakableDensity != null ? entCfg.breakableDensity : 0.15;
  var trapDensity     = entCfg.trapDensity != null ? entCfg.trapDensity : 0.05;
  var chestRange      = entCfg.chestCount || [1, 3];
  var corpseRange     = entCfg.corpseCount || [0, 2];
  var enemyRange      = entCfg.enemyBudget || [2, 6];

  var doorCfg = recipe.doors || {};
  var strategy = recipe.strategy || { primary: 'mixed', weight: 1.0 };
  var stratWeight = strategy.weight != null ? strategy.weight : 1.0;

  // ── 1. Create grid ───────────────────────────────────────────
  var grid = _makeGrid(W, H, wallTile);

  // ── 2. BSP partition ─────────────────────────────────────────
  var targetRooms = rng.intBetween(roomCountRange[0], roomCountRange[1]);
  // BSP depth heuristic: log2(targetRooms) + 1
  var maxDepth = Math.max(2, Math.ceil(Math.log(targetRooms) / Math.log(2)) + 1);
  var minLeafW = roomMinSize[0] + 2; // room + border
  var minLeafH = roomMinSize[1] + 2;

  var root = { x: 0, y: 0, w: W, h: H };
  _bspSplit(root, rng, minLeafW, minLeafH, 0, maxDepth);

  // ── 3. Carve rooms ───────────────────────────────────────────
  var leaves = _getLeaves(root);
  rng.shuffle(leaves);
  // Limit to targetRooms
  if (leaves.length > targetRooms) leaves = leaves.slice(0, targetRooms);

  var rooms = [];
  for (var i = 0; i < leaves.length; i++) {
    var room = _carveRoom(leaves[i], rng, roomMinSize[0], roomMinSize[1], roomMaxSize[0], roomMaxSize[1]);
    _fillRect(grid, room.x, room.y, room.w, room.h, floorTile);
    rooms.push(room);
  }

  // ── 4. Connect rooms (MST) ──────────────────────────────────
  var corridorCells = _connectRoomsMST(rooms, grid, floorTile, corrStyle, corrWidth, rng);

  // ── 5. Extra connections (loops) ─────────────────────────────
  var extraCells = _addExtraConnections(rooms, grid, floorTile, corrStyle, corrWidth, extraConn, rng);
  corridorCells = corridorCells.concat(extraCells);

  // ── 6. Apply strategy decorator ──────────────────────────────
  switch (strategy.primary) {
    case 'cobweb':
      _applyCobwebStrategy(grid, rooms, corridorCells, floorTile, wallTile, stratWeight, rng);
      break;
    case 'pressure-wash':
      _applyPressureWashStrategy(grid, rooms, corridorCells, floorTile, wallTile, stratWeight, rng);
      break;
    case 'combat':
      _applyCombatStrategy(grid, rooms, corridorCells, floorTile, wallTile, stratWeight, rng);
      break;
    case 'mixed':
      // Apply all three at reduced weight
      var w3 = stratWeight / 3;
      _applyCobwebStrategy(grid, rooms, corridorCells, floorTile, wallTile, w3, rng);
      _applyPressureWashStrategy(grid, rooms, corridorCells, floorTile, wallTile, w3, rng);
      _applyCombatStrategy(grid, rooms, corridorCells, floorTile, wallTile, w3, rng);
      break;
  }

  // ── 7. Place doors ───────────────────────────────────────────
  var entryWall = _resolveWall(doorCfg.entry || 'auto', rng);
  var exitWall  = doorCfg.exit || 'auto';
  if (exitWall === 'auto') exitWall = _oppositeWall(entryWall);

  var depth = biome.depth || 3;
  var entryTileName = (depth >= 3) ? 'STAIRS_UP' : 'DOOR_EXIT';
  var exitTileName  = doorCfg.bossGate ? 'BOSS_DOOR' : ((depth >= 3) ? 'STAIRS_DN' : 'DOOR');

  var entryTile = _resolveTile(entryTileName);
  var exitTile  = (exitWall !== 'none') ? _resolveTile(exitTileName) : null;

  var entryPos = _findWallSlot(grid, entryWall, floorTile, wallTile);
  if (!entryPos) {
    // Fallback: force entry at center of wall
    entryPos = { x: Math.floor(W / 2), y: (entryWall === 'north') ? 0 : H - 1 };
  }
  _setTile(grid, entryPos.x, entryPos.y, entryTile);
  _ensurePathToDoor(grid, entryPos, floorTile, wallTile);

  var exitPos = null;
  var doorPositions = [entryPos];
  if (exitTile && exitWall !== 'none') {
    exitPos = _findWallSlot(grid, exitWall, floorTile, wallTile);
    if (!exitPos) {
      exitPos = { x: Math.floor(W / 2), y: (exitWall === 'south') ? H - 1 : 0 };
    }
    _setTile(grid, exitPos.x, exitPos.y, exitTile);
    _ensurePathToDoor(grid, exitPos, floorTile, wallTile);
    doorPositions.push(exitPos);
  }

  // ── 8. Spawn point ──────────────────────────────────────────
  // Place spawn near the entry door
  var spawnX = entryPos.x;
  var spawnY = entryPos.y;
  var spawnDir = 1; // default south
  switch (entryWall) {
    case 'north': spawnY = entryPos.y + 1; spawnDir = 1; break; // face south
    case 'south': spawnY = entryPos.y - 1; spawnDir = 3; break; // face north
    case 'west':  spawnX = entryPos.x + 1; spawnDir = 0; break; // face east
    case 'east':  spawnX = entryPos.x - 1; spawnDir = 2; break; // face west
  }
  // Make sure spawn is on a floor tile
  if (_getTile(grid, spawnX, spawnY) !== floorTile) {
    _setTile(grid, spawnX, spawnY, floorTile);
  }
  var spawn = { x: spawnX, y: spawnY, dir: spawnDir };

  // ── 9. Place entities ────────────────────────────────────────
  var torches    = _placeTorches(grid, rooms, wallTile, torchTile, torchDensity, rng);
  var breakables = _placeBreakables(grid, rooms, floorTile, biome.breakableSet || [], breakableDensity, rng);
  var traps      = _placeTraps(grid, corridorCells, floorTile, trapDensity, rng);
  var chests     = _placeChests(grid, rooms, floorTile, chestRange[0], chestRange[1], rng);
  var corpses    = _placeCorpses(grid, rooms, floorTile, corpseRange[0], corpseRange[1], rng);
  var enemies    = _generateEnemySpawns(rooms, floorTile, grid, enemyRange[0], enemyRange[1], rng);

  // ── 10. Build doorTargets ────────────────────────────────────
  var doorTargets = {};
  doorTargets[entryPos.x + ',' + entryPos.y] = '__parent__';
  if (exitPos) {
    doorTargets[exitPos.x + ',' + exitPos.y] = '__child__';
  }

  // ── 11. Assemble result ──────────────────────────────────────
  var result = {
    grid: grid,
    gridW: W,
    gridH: H,
    spawn: spawn,
    doorTargets: doorTargets,
    biome: recipe.biome,
    doors: [],
    entities: enemies,
    rooms: rooms.map(function (r) { return { x: r.x, y: r.y, w: r.w, h: r.h }; }),
    meta: {
      recipe: recipe.id,
      seed: seed,
      strategy: strategy.primary,
      faction: recipe.faction || 'neutral',
      stats: {
        roomCount: rooms.length,
        corridorCells: corridorCells.length,
        torches: torches.length,
        breakables: breakables.length,
        traps: traps.length,
        chests: chests.length,
        corpses: corpses.length,
        enemySpawns: enemies.length
      }
    }
  };

  // Build doors array for template compatibility
  result.doors.push({
    x: entryPos.x, y: entryPos.y,
    key: 'entry', kind: entryTileName, target: '__parent__'
  });
  if (exitPos) {
    result.doors.push({
      x: exitPos.x, y: exitPos.y,
      key: 'exit', kind: exitTileName, target: '__child__'
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
//  CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════

function _cliMain() {
  var args = process.argv.slice(2);
  var recipePath = null;
  var seed = null;
  var floorId = null;
  var ascii = false;

  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--recipe' && args[i + 1]) { recipePath = args[++i]; continue; }
    if (args[i] === '--seed' && args[i + 1]) { seed = parseInt(args[++i], 10); continue; }
    if (args[i] === '--floor-id' && args[i + 1]) { floorId = args[++i]; continue; }
    if (args[i] === '--ascii') { ascii = true; continue; }
    if (args[i] === '--help' || args[i] === '-h') {
      process.stdout.write([
        'procgen.js — Pass 6 Procedural Dungeon Generator',
        '',
        'Usage:',
        '  node tools/procgen.js --recipe <path.json> [--seed N] [--floor-id ID] [--ascii]',
        '',
        'Options:',
        '  --recipe <path>   Recipe JSON file (required)',
        '  --seed <N>        RNG seed for deterministic output',
        '  --floor-id <ID>   Floor ID to assign (e.g. "3.1")',
        '  --ascii           Output ASCII render instead of JSON',
        '  --help, -h        Show this help',
        '',
        'Output: JSON { grid, spawn, doorTargets, biome, entities, rooms, meta }',
        'The grid is a 2D array of tile IDs, ready for floor-data.json insertion.',
        ''
      ].join('\n'));
      process.exit(0);
    }
  }

  if (!recipePath) {
    process.stderr.write('error: --recipe is required (try --help)\n');
    process.exit(1);
  }

  var absPath = path.resolve(recipePath);
  if (!fs.existsSync(absPath)) {
    process.stderr.write('error: recipe not found: ' + absPath + '\n');
    process.exit(1);
  }

  var recipe = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  var opts = {};
  if (seed != null) opts.seed = seed;

  var result = generate(recipe, opts);

  if (floorId) result.floorId = floorId;

  if (ascii) {
    process.stdout.write(_renderAscii(result.grid, result.spawn, result.doors) + '\n');
    process.stderr.write(
      '[procgen] ' + result.meta.stats.roomCount + ' rooms, ' +
      result.meta.stats.corridorCells + ' corridor cells, ' +
      result.meta.stats.torches + ' torches, ' +
      result.meta.stats.traps + ' traps, ' +
      result.meta.stats.enemySpawns + ' enemies\n'
    );
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

// ── Module exports (for require()) ─────────────────────────────
module.exports = {
  generate: generate,
  RNG: RNG,
  _renderAscii: _renderAscii
};

// ── CLI entry ──────────────────────────────────────────────────
if (require.main === module) {
  _cliMain();
}

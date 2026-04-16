// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-stamps.js — Parametric stamps + registry
//  Pass 0.3 split: stamp-room, stamp-corridor, stamp-torch-ring,
//                  save-stamp, apply-stamp, list-stamps, delete-stamp
//  Pass 5d Slice C4: stamp-tunnel-corridor, stamp-porthole-wall,
//                    stamp-alcove-flank (mirrors bv-bo-router.js).
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

// Slice C4 helper: apply a cells array with bounds checking, then save.
function _applyStampCells(raw, f, cells) {
  var changed = 0;
  cells.forEach(function(c) {
    if (c.y < 0 || c.y >= f.grid.length) return;
    var row = f.grid[c.y];
    if (c.x < 0 || c.x >= row.length) return;
    if (row[c.x] !== c.tile) { row[c.x] = c.tile; changed++; }
  });
  S.saveFloors(raw);
  return changed;
}

module.exports = {
  'stamp-room': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var size = S.parseCoord(args.size || args['size'], '--size');
    if (size.x < 2 || size.y < 2) S.fail(1, 'stamp-room: size must be >=2x2');
    var wallTile = S.resolveTile(args['wall-tile'] != null ? args['wall-tile'] : 'WALL', schema);
    var floorTile = S.resolveTile(args['floor-tile'] != null ? args['floor-tile'] : 0, schema);
    var cells = S.cellsInRect(at.x, at.y, at.x+size.x-1, at.y+size.y-1, false);
    var x0=at.x, y0=at.y, x1=at.x+size.x-1, y1=at.y+size.y-1;
    var changed = 0;
    cells.forEach(function(c) {
      var onEdge = (c.x===x0||c.x===x1||c.y===y0||c.y===y1);
      var t = onEdge ? wallTile : floorTile;
      if (c.y<0||c.y>=f.grid.length||c.x<0||c.x>=f.grid[c.y].length) return;
      if (f.grid[c.y][c.x] !== t) { f.grid[c.y][c.x] = t; changed++; }
    });
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed, at:{x:x0,y:y0}, w:size.x, h:size.y, wallTile:wallTile, floorTile:floorTile }) + '\n');
  },

  'stamp-corridor': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var from = S.parseCoord(args.from, '--from');
    var to   = S.parseCoord(args.to, '--to');
    var floorTile = S.resolveTile(args['floor-tile'] != null ? args['floor-tile'] : (args.tile != null ? args.tile : 0), schema);
    var wallTile = args['wall-tile'] != null ? S.resolveTile(args['wall-tile'], schema) : null;
    var width = Math.max(1, parseInt(args.width, 10) || 1);
    var corridor = S.cellsInLine(from.x, from.y, to.x, to.y);
    var wide = {};
    var hw = Math.floor((width-1)/2), hw2 = Math.ceil((width-1)/2);
    corridor.forEach(function(p) {
      for (var oy=-hw; oy<=hw2; oy++)
        for (var ox=-hw; ox<=hw2; ox++)
          wide[(p.x+ox)+','+(p.y+oy)] = 'floor';
    });
    if (wallTile != null) {
      var keys = Object.keys(wide);
      keys.forEach(function(k) {
        var parts=k.split(','), cx=+parts[0], cy=+parts[1];
        [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(d) {
          var nk=(cx+d[0])+','+(cy+d[1]);
          if (!wide[nk]) wide[nk] = 'wall';
        });
      });
    }
    var changed = 0;
    Object.keys(wide).forEach(function(k) {
      var parts=k.split(','), cx=+parts[0], cy=+parts[1];
      var t = (wide[k]==='wall') ? wallTile : floorTile;
      if (cy<0||cy>=f.grid.length||cx<0||cx>=f.grid[cy].length) return;
      if (f.grid[cy][cx] !== t) { f.grid[cy][cx] = t; changed++; }
    });
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed, pathLength: corridor.length, width: width, hasWalls: wallTile != null }) + '\n');
  },

  'stamp-torch-ring': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var radius = Math.max(1, parseInt(args.radius, 10) || 2);
    var step = Math.max(1, parseInt(args.step, 10) || 1);
    var torchTile = S.resolveTile(args['torch-tile'] != null ? args['torch-tile'] : 'TORCH_LIT', schema);
    var cx=at.x, cy=at.y;
    var x0=cx-radius, x1=cx+radius, y0=cy-radius, y1=cy+radius;
    var cells=[], i;
    i=0; for (var x=x0; x<=x1; x++) { if ((i++%step)===0) cells.push({x:x,y:y0}); }
    i=0; for (var x2=x0; x2<=x1; x2++) { if ((i++%step)===0) cells.push({x:x2,y:y1}); }
    i=0; for (var y=y0+1; y<=y1-1; y++) { if ((i++%step)===0) cells.push({x:x0,y:y}); }
    i=0; for (var y2=y0+1; y2<=y1-1; y2++) { if ((i++%step)===0) cells.push({x:x1,y:y2}); }
    var changed = S.applyCells(f.grid, cells, torchTile);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length, at:{x:cx,y:cy}, radius: radius, torchTile: torchTile, step: step }) + '\n');
  },

  'save-stamp': function(args, raw, schema) {
    if (!args.name) S.fail(1, 'save-stamp needs --name');
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var size = S.parseCoord(args.size, '--size');
    var rows = [];
    for (var dy=0; dy<size.y; dy++) {
      var row = [];
      for (var dx=0; dx<size.x; dx++) {
        var ty=at.y+dy, tx=at.x+dx;
        var t = (ty>=0&&ty<f.grid.length&&tx>=0&&tx<f.grid[ty].length) ? f.grid[ty][tx] : 0;
        row.push(t);
      }
      rows.push(row);
    }
    var stamps = S.loadStamps();
    stamps[args.name] = {
      w: size.x, h: size.y, cells: rows,
      meta: { sourceFloor: args.floor, at: {x:at.x,y:at.y}, createdAt: new Date().toISOString() }
    };
    S.saveStamps(stamps);
    process.stdout.write(JSON.stringify({ name: args.name, w: size.x, h: size.y, sourceFloor: args.floor }) + '\n');
  },

  'apply-stamp': function(args, raw, schema) {
    if (!args.name) S.fail(1, 'apply-stamp needs --name');
    var stamps = S.loadStamps();
    var s = stamps[args.name];
    if (!s) S.fail(2, 'unknown stamp: ' + args.name);
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var rot = ((parseInt(args.rotate, 10) || 0) % 360 + 360) % 360;
    var flipH = !!args['flip-h'];
    var flipV = !!args['flip-v'];
    var cells = s.cells;
    if (rot === 90)       cells = S.rotateCW(cells);
    else if (rot === 180) cells = S.rotate180(cells);
    else if (rot === 270) cells = S.rotateCCW(cells);
    if (flipH) cells = cells.map(function(r){ return r.slice().reverse(); });
    if (flipV) cells = cells.slice().reverse();
    var changed = 0;
    for (var dy=0; dy<cells.length; dy++) {
      for (var dx=0; dx<cells[dy].length; dx++) {
        var ty=at.y+dy, tx=at.x+dx;
        if (ty<0||ty>=f.grid.length||tx<0||tx>=f.grid[ty].length) continue;
        var t = cells[dy][dx];
        if (f.grid[ty][tx] !== t) { f.grid[ty][tx] = t; changed++; }
      }
    }
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed, name: args.name, at: at, rotate: rot, flipH: flipH, flipV: flipV }) + '\n');
  },

  'list-stamps': function() {
    var stamps = S.loadStamps();
    var out = Object.keys(stamps).sort().map(function(name) {
      var s = stamps[name];
      return { name: name, w: s.w, h: s.h, sourceFloor: (s.meta && s.meta.sourceFloor) || null };
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  },

  'delete-stamp': function(args) {
    if (!args.name) S.fail(1, 'delete-stamp needs --name');
    var stamps = S.loadStamps();
    if (!stamps[args.name]) S.fail(2, 'unknown stamp: ' + args.name);
    delete stamps[args.name];
    S.saveStamps(stamps);
    process.stdout.write(JSON.stringify({ name: args.name, deleted: true, remaining: Object.keys(stamps).length }) + '\n');
  },

  // ── Slice C4: biome-specific stamps ──────────────────────────
  // Geometry is documented in bv-bo-router.js next to the browser
  // equivalents (stampTunnelCorridor / stampPortholeWall /
  // stampAlcoveFlank). Keep the two sides in sync — the round-trip
  // smoke test will eventually enforce identical output cells.

  'stamp-tunnel-corridor': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var len = Math.max(4, parseInt(args.len, 10) || 6);
    var dir = ((parseInt(args.dir, 10) || 0) % 4 + 4) % 4;
    var ribTile   = S.resolveTile(args['rib-tile']   != null ? args['rib-tile']   : 'TUNNEL_RIB',  schema);
    var wallTile  = S.resolveTile(args['wall-tile']  != null ? args['wall-tile']  : 'TUNNEL_WALL', schema);
    var floorTile = S.resolveTile(args['floor-tile'] != null ? args['floor-tile'] : 'EMPTY',        schema);
    var cells = [];
    function pushAt(i, j, tile) {
      var dx, dy;
      switch (dir) {
        case 0: dx = i;  dy = j;  break;
        case 1: dx = -j; dy = i;  break;
        case 2: dx = -i; dy = -j; break;
        case 3: dx = j;  dy = -i; break;
      }
      cells.push({ x: at.x + dx, y: at.y + dy, tile: tile });
    }
    for (var i = 0; i < len; i++) {
      var atMouth = (i < 2 || i >= len - 2);
      if (atMouth) pushAt(i, 0, floorTile);
      else         pushAt(i, 0, (i % 2 === 0) ? ribTile : wallTile);
      pushAt(i, 1, floorTile);
      if (atMouth) pushAt(i, 2, floorTile);
      else         pushAt(i, 2, (i % 2 === 0) ? wallTile : ribTile);
    }
    var changed = _applyStampCells(raw, f, cells);
    process.stdout.write(JSON.stringify({
      changed: changed, action: 'stamp-tunnel-corridor',
      at: { x: at.x, y: at.y }, len: len, dir: dir,
      ribTile: ribTile, wallTile: wallTile, floorTile: floorTile
    }) + '\n');
  },

  'stamp-porthole-wall': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var side = (args.side || 'R').toString().toUpperCase();
    if (side !== 'L' && side !== 'R') S.fail(1, 'stamp-porthole-wall: --side must be L or R (got ' + args.side + ')');
    var span = Math.max(1, parseInt(args.span, 10) || 3);
    var tile     = S.resolveTile(args.tile        != null ? args.tile        : 'PORTHOLE_OCEAN', schema);
    var jambTile = S.resolveTile(args['jamb-tile'] != null ? args['jamb-tile'] : 'TUNNEL_WALL',   schema);
    var sx = (side === 'R') ? 1 : -1;
    var cells = [];
    for (var i = 0; i < 2 * span - 1; i++) {
      cells.push({ x: at.x + sx * i, y: at.y, tile: (i % 2 === 0) ? tile : jambTile });
    }
    var changed = _applyStampCells(raw, f, cells);
    process.stdout.write(JSON.stringify({
      changed: changed, action: 'stamp-porthole-wall',
      at: { x: at.x, y: at.y }, side: side, span: span,
      tile: tile, jambTile: jambTile, footprint: 2 * span - 1
    }) + '\n');
  },

  'stamp-alcove-flank': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var count   = Math.max(1, parseInt(args.count,   10) || 2);
    var spacing = Math.max(1, parseInt(args.spacing, 10) || 2);
    var depth   = Math.max(1, parseInt(args.depth,   10) || 1);
    var tile = S.resolveTile(args.tile != null ? args.tile : 'TUNNEL_WALL', schema);
    var cells = [];
    for (var i = 0; i < count; i++) {
      var yBase = at.y + i * spacing;
      for (var d = 0; d < depth; d++) {
        var yy = yBase + d;
        cells.push({ x: at.x - 2, y: yy, tile: tile });
        cells.push({ x: at.x + 2, y: yy, tile: tile });
      }
    }
    var changed = _applyStampCells(raw, f, cells);
    process.stdout.write(JSON.stringify({
      changed: changed, action: 'stamp-alcove-flank',
      at: { x: at.x, y: at.y }, count: count, spacing: spacing, depth: depth,
      tile: tile, pairs: count
    }) + '\n');
  }
};

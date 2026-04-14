// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-stamps.js — Parametric stamps + registry
//  Pass 0.3 split: stamp-room, stamp-corridor, stamp-torch-ring,
//                  save-stamp, apply-stamp, list-stamps, delete-stamp
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

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
  }
};

// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-paint.js — Paint primitive commands
//  Pass 0.3 split: paint, paint-rect, paint-line, flood-fill, replace
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

module.exports = {
  'paint': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var tile = S.resolveTile(args.tile, schema);
    var changed = S.applyCells(f.grid, [at], tile);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'paint-rect': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var size = S.parseCoord(args.size, '--size');
    var tile = S.resolveTile(args.tile, schema);
    var cells = S.cellsInRect(at.x, at.y, at.x + size.x - 1, at.y + size.y - 1, !!args.outline);
    var changed = S.applyCells(f.grid, cells, tile);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length, rect: { x0:at.x, y0:at.y, x1:at.x+size.x-1, y1:at.y+size.y-1 } }) + '\n');
  },

  'paint-line': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var from = S.parseCoord(args.from, '--from');
    var to   = S.parseCoord(args.to, '--to');
    var tile = S.resolveTile(args.tile, schema);
    var cells = S.cellsInLine(from.x, from.y, to.x, to.y);
    var changed = S.applyCells(f.grid, cells, tile);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'flood-fill': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var tile = S.resolveTile(args.tile, schema);
    var cells = S.floodFillCells(f.grid, at.x, at.y, tile);
    var changed = S.applyCells(f.grid, cells, tile);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'replace': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var tile = S.resolveTile(args.tile, schema);
    var cells = S.replaceAllCells(f.grid, at.x, at.y, tile);
    var changed = S.applyCells(f.grid, cells, tile);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  }
};

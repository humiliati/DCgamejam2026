// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-meta.js — Floor meta + resize commands
//  Pass 0.3 split: list-floors, get-floor, resize, set-spawn,
//                  set-door-target
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

module.exports = {
  'list-floors': function(args, raw) {
    var out = Object.keys(raw.floors).map(function(id) {
      var f = raw.floors[id];
      return {
        id: id, depth: id.split('.').length,
        w: f.gridW, h: f.gridH, spawn: f.spawn || null, biome: f.biome || null,
        doorTargetCount: Object.keys(f.doorTargets || {}).length
      };
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  },

  'get-floor': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var out = {
      id: args.floor, w: f.gridW, h: f.gridH,
      spawn: f.spawn || null, doorTargets: f.doorTargets || {},
      rooms: f.rooms || [], biome: f.biome || null,
      grid: f.grid
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  },

  'resize': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var side = args.side, action = args.action;
    if (!side || !action) S.fail(1, 'resize needs --side and --action');
    var fill = (args.fill != null) ? S.resolveTile(args.fill, schema) : 0;
    var grid = f.grid;
    var gw = grid[0] ? grid[0].length : 0, gh = grid.length;
    if (action === 'add') {
      if (side === 'col-r')      { for (var y=0; y<gh; y++) grid[y].push(fill); }
      else if (side === 'col-l') { for (var y=0; y<gh; y++) grid[y].unshift(fill); }
      else if (side === 'row-b') { var r=[]; for (var x=0;x<gw;x++) r.push(fill); grid.push(r); }
      else if (side === 'row-t') { var r=[]; for (var x=0;x<gw;x++) r.push(fill); grid.unshift(r); }
      else S.fail(1, 'bad --side: ' + side);
    } else if (action === 'shrink') {
      if (side === 'col-r' && gw > 1)      { for (var y=0; y<gh; y++) grid[y].pop(); }
      else if (side === 'col-l' && gw > 1) { for (var y=0; y<gh; y++) grid[y].shift(); }
      else if (side === 'row-b' && gh > 1) { grid.pop(); }
      else if (side === 'row-t' && gh > 1) { grid.shift(); }
    } else S.fail(1, 'bad --action: ' + action);
    f.gridW = grid[0] ? grid[0].length : 0;
    f.gridH = grid.length;
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ w: f.gridW, h: f.gridH }) + '\n');
  },

  'set-spawn': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    f.spawn = { x: at.x, y: at.y };
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ spawn: f.spawn }) + '\n');
  },

  'set-door-target': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    f.doorTargets = f.doorTargets || {};
    var key = at.x + ',' + at.y;
    var tgt = args.target;
    if (tgt === '' || tgt == null || tgt === 'null') delete f.doorTargets[key];
    else f.doorTargets[key] = String(tgt);
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ doorTargets: f.doorTargets }) + '\n');
  }
};

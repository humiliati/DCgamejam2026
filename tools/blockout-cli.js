#!/usr/bin/env node
// ============================================================
// blockout-cli.js — Tier 6 Pass 1 (Node side)
// ============================================================
// Agent-facing CLI for tools/floor-data.json. Shares the action
// vocabulary of window.BO so an agent can reach for either
// (browser via `javascript_tool`, or shell via this script) and
// get identical semantics.
//
// The CLI mutates tools/floor-data.json in place. Changes are
// picked up by the visualizer on next page-load (or by re-running
// extract-floors.js on the engine). This does NOT rewrite
// engine/floor-blockout-*.js — that requires the browser's
// File System Access API via `BO.run({action:'save'})` or the
// visualizer's Save button.
//
// Usage:
//   node tools/blockout-cli.js <command> [--flags...]
//   node tools/blockout-cli.js --help
//
// Commands:
//   list-floors
//   get-floor        --floor <id>
//   paint            --floor <id> --at X,Y --tile <id|name>
//   paint-rect       --floor <id> --at X,Y --size WxH --tile <id|name> [--outline]
//   paint-line       --floor <id> --from X,Y --to X,Y --tile <id|name>
//   flood-fill       --floor <id> --at X,Y --tile <id|name>
//   replace          --floor <id> --at X,Y --tile <id|name>
//   resize           --floor <id> --side col-l|col-r|row-t|row-b --action add|shrink [--fill <id|name>]
//   set-spawn        --floor <id> --at X,Y
//   set-door-target  --floor <id> --at X,Y --target <floorId|"">
//   validate         [--scope current|all] [--floor <id>] [--out <path>]
//   describe
//
// Pass 2 — perception tools (no mutation):
//   render-ascii     --floor <id> [--viewport X,Y,WxH]
//   describe-cell    --floor <id> --at X,Y
//   diff-ascii       --floor <id> --before <path-to-prior-get-floor.json>
//   report-validation [--scope current|all] [--floor <id>]
//
// Exit codes: 0 ok, 1 usage error, 2 runtime error.
// ============================================================

'use strict';

var fs   = require('fs');
var path = require('path');

var TOOLS_DIR      = __dirname;
var FLOOR_DATA_PATH = path.join(TOOLS_DIR, 'floor-data.json');
var TILE_SCHEMA_PATH = path.join(TOOLS_DIR, 'tile-schema.json');
var STAMPS_PATH     = path.join(TOOLS_DIR, 'stamps.json');

// Pass 4: stamp registry persists to tools/stamps.json so browser and
// CLI can share named patterns (browser: BO.importStamps(require(...)) ).
function loadStamps() {
  if (!fs.existsSync(STAMPS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STAMPS_PATH, 'utf8')); }
  catch (e) { return {}; }
}
function saveStamps(stamps) {
  fs.writeFileSync(STAMPS_PATH, JSON.stringify(stamps, null, 2));
}
function rotateCW(grid) {
  if (!grid.length || !grid[0].length) return grid.slice();
  var h = grid.length, w = grid[0].length, out = [];
  for (var y=0; y<w; y++) { var r=[]; for (var x=0; x<h; x++) r.push(grid[h-1-x][y]); out.push(r); }
  return out;
}
function rotateCCW(grid) {
  if (!grid.length || !grid[0].length) return grid.slice();
  var h = grid.length, w = grid[0].length, out = [];
  for (var y=0; y<w; y++) { var r=[]; for (var x=0; x<h; x++) r.push(grid[x][w-1-y]); out.push(r); }
  return out;
}
function rotate180(grid) {
  return grid.slice().reverse().map(function(r){ return r.slice().reverse(); });
}

// ── Args ────────────────────────────────────────────────────
function parseArgs(argv) {
  var out = { _: [] };
  var i = 0;
  while (i < argv.length) {
    var a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; i++; continue; }
    if (a.slice(0, 2) === '--') {
      var key = a.slice(2);
      var next = argv[i + 1];
      if (next === undefined || next.slice(0, 2) === '--') {
        out[key] = true; i++;
      } else {
        out[key] = next; i += 2;
      }
    } else {
      out._.push(a); i++;
    }
  }
  return out;
}

function fail(code, msg) {
  process.stderr.write('[blockout-cli] ' + msg + '\n');
  process.exit(code);
}

function parseCoord(s, name) {
  if (typeof s !== 'string') fail(1, 'missing ' + name);
  var m = s.match(/^(-?\d+)[ ,xX](-?\d+)$/);
  if (!m) fail(1, 'bad ' + name + ': expected X,Y got ' + JSON.stringify(s));
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

// ── Data loaders ────────────────────────────────────────────
function loadFloors() {
  if (!fs.existsSync(FLOOR_DATA_PATH)) {
    fail(2, 'floor-data.json not found — run `node tools/extract-floors.js`');
  }
  var raw = JSON.parse(fs.readFileSync(FLOOR_DATA_PATH, 'utf8'));
  return raw;
}
function saveFloors(raw) {
  fs.writeFileSync(FLOOR_DATA_PATH, JSON.stringify(raw, null, 2));
}
function loadSchema() {
  if (!fs.existsSync(TILE_SCHEMA_PATH)) return {};
  var raw = JSON.parse(fs.readFileSync(TILE_SCHEMA_PATH, 'utf8'));
  // tile-schema.json stores { generated, tileCount, tiles: { id: {...} } }
  return raw.tiles || raw;
}
function resolveTile(ref, schema) {
  if (ref == null) return null;
  if (typeof ref === 'number') return ref|0;
  if (/^-?\d+$/.test(ref)) return parseInt(ref, 10);
  var u = String(ref).toUpperCase();
  for (var id in schema) {
    var s = schema[id];
    if (s && s.name && String(s.name).toUpperCase() === u) return +id;
  }
  fail(1, 'unknown tile reference: ' + ref);
}

// ── Primitives (mirror the browser router) ──────────────────
function applyCells(grid, cells, newTile) {
  var changed = [];
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (c.y < 0 || c.y >= grid.length) continue;
    if (c.x < 0 || c.x >= grid[c.y].length) continue;
    var oldTile = grid[c.y][c.x];
    if (oldTile === newTile) continue;
    grid[c.y][c.x] = newTile;
    changed.push({ x: c.x, y: c.y, oldTile: oldTile });
  }
  return changed;
}
function cellsInRect(x0, y0, x1, y1, outline) {
  var xa = Math.min(x0,x1), xb = Math.max(x0,x1);
  var ya = Math.min(y0,y1), yb = Math.max(y0,y1);
  var out = [];
  for (var y = ya; y <= yb; y++) {
    for (var x = xa; x <= xb; x++) {
      if (outline) {
        if (x === xa || x === xb || y === ya || y === yb) out.push({x:x, y:y});
      } else {
        out.push({x:x, y:y});
      }
    }
  }
  return out;
}
function cellsInLine(x0, y0, x1, y1) {
  var out = [];
  var dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
  var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  var err = dx - dy, x = x0, y = y0;
  while (true) {
    out.push({x:x, y:y});
    if (x === x1 && y === y1) break;
    var e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
    if (out.length > 5000) break;
  }
  return out;
}
function floodFillCells(grid, gx, gy, excludeTile) {
  if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[gy].length) return [];
  var target = grid[gy][gx];
  if (target === excludeTile) return [];
  var gw = grid[0].length, gh = grid.length;
  var seen = new Uint8Array(gw * gh);
  var stack = [[gx, gy]];
  var out = [];
  while (stack.length) {
    var p = stack.pop(), x = p[0], y = p[1];
    if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
    var ix = y * gw + x;
    if (seen[ix]) continue;
    if (grid[y][x] !== target) continue;
    seen[ix] = 1;
    out.push({x:x, y:y});
    stack.push([x+1,y]); stack.push([x-1,y]); stack.push([x,y+1]); stack.push([x,y-1]);
    if (out.length > gw*gh) break;
  }
  return out;
}
function replaceAllCells(grid, gx, gy, excludeTile) {
  if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[gy].length) return [];
  var target = grid[gy][gx];
  if (target === excludeTile) return [];
  var out = [];
  for (var y = 0; y < grid.length; y++) {
    for (var x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === target) out.push({x:x, y:y});
    }
  }
  return out;
}

// ── Validation (subset that doesn't need the canvas) ────────
function validateFloor(floorId, floor, schema) {
  var issues = [];
  if (!floor || !floor.grid) return issues;
  var gw = floor.grid[0] ? floor.grid[0].length : 0;
  var gh = floor.grid.length;
  var sp = floor.spawn;
  if (!sp) {
    if (floorId !== '0') issues.push({ severity:'err', kind:'spawn-missing', floorId:floorId, msg:'No spawn defined' });
  } else {
    if (sp.x < 0 || sp.y < 0 || sp.x >= gw || sp.y >= gh) {
      issues.push({ severity:'err', kind:'spawn-oob', floorId:floorId, msg:'Spawn ('+sp.x+','+sp.y+') outside grid '+gw+'x'+gh });
    } else {
      var spTile = floor.grid[sp.y][sp.x];
      var sch = schema[spTile];
      if (sch && sch.walk === false) {
        issues.push({ severity:'err', kind:'spawn-blocked', floorId:floorId, msg:'Spawn on non-walkable tile: ' + (sch.name||spTile), cells:[{x:sp.x,y:sp.y}] });
      }
    }
  }
  return issues;
}
function validateCross(rawFloors) {
  var issues = [];
  var ids = Object.keys(rawFloors);
  ids.forEach(function(id) {
    var f = rawFloors[id]; if (!f) return;
    Object.keys(f.doorTargets || {}).forEach(function(k) {
      var tgt = f.doorTargets[k];
      if (!tgt) return;
      if (!rawFloors[tgt]) {
        var parts = k.split(','); var x = +parts[0]|0, y = +parts[1]|0;
        issues.push({ severity:'err', kind:'door-target-missing', floorId:id,
          msg:'Door at ('+x+','+y+') targets missing floor "'+tgt+'"', cells:[{x:x,y:y}] });
      }
    });
  });
  return issues;
}

// ── Command dispatch ────────────────────────────────────────
function requireFloor(raw, id) {
  if (!raw.floors[id]) fail(2, 'unknown floor: ' + id);
  return raw.floors[id];
}

var COMMANDS = {
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
    var f = requireFloor(raw, args.floor);
    var out = {
      id: args.floor, w: f.gridW, h: f.gridH,
      spawn: f.spawn || null, doorTargets: f.doorTargets || {},
      rooms: f.rooms || [], biome: f.biome || null,
      grid: f.grid
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  },

  'paint': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var tile = resolveTile(args.tile, schema);
    var changed = applyCells(f.grid, [at], tile);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'paint-rect': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var size = parseCoord(args.size, '--size');
    var tile = resolveTile(args.tile, schema);
    var cells = cellsInRect(at.x, at.y, at.x + size.x - 1, at.y + size.y - 1, !!args.outline);
    var changed = applyCells(f.grid, cells, tile);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length, rect: { x0:at.x, y0:at.y, x1:at.x+size.x-1, y1:at.y+size.y-1 } }) + '\n');
  },

  'paint-line': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var from = parseCoord(args.from, '--from');
    var to   = parseCoord(args.to, '--to');
    var tile = resolveTile(args.tile, schema);
    var cells = cellsInLine(from.x, from.y, to.x, to.y);
    var changed = applyCells(f.grid, cells, tile);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'flood-fill': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var tile = resolveTile(args.tile, schema);
    var cells = floodFillCells(f.grid, at.x, at.y, tile);
    var changed = applyCells(f.grid, cells, tile);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'replace': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var tile = resolveTile(args.tile, schema);
    var cells = replaceAllCells(f.grid, at.x, at.y, tile);
    var changed = applyCells(f.grid, cells, tile);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length }) + '\n');
  },

  'resize': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var side = args.side, action = args.action;
    if (!side || !action) fail(1, 'resize needs --side and --action');
    var fill = (args.fill != null) ? resolveTile(args.fill, schema) : 0;
    var grid = f.grid;
    var gw = grid[0] ? grid[0].length : 0, gh = grid.length;
    if (action === 'add') {
      if (side === 'col-r')      { for (var y=0; y<gh; y++) grid[y].push(fill); }
      else if (side === 'col-l') { for (var y=0; y<gh; y++) grid[y].unshift(fill); }
      else if (side === 'row-b') { var r=[]; for (var x=0;x<gw;x++) r.push(fill); grid.push(r); }
      else if (side === 'row-t') { var r=[]; for (var x=0;x<gw;x++) r.push(fill); grid.unshift(r); }
      else fail(1, 'bad --side: ' + side);
    } else if (action === 'shrink') {
      if (side === 'col-r' && gw > 1)      { for (var y=0; y<gh; y++) grid[y].pop(); }
      else if (side === 'col-l' && gw > 1) { for (var y=0; y<gh; y++) grid[y].shift(); }
      else if (side === 'row-b' && gh > 1) { grid.pop(); }
      else if (side === 'row-t' && gh > 1) { grid.shift(); }
    } else fail(1, 'bad --action: ' + action);
    f.gridW = grid[0] ? grid[0].length : 0;
    f.gridH = grid.length;
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ w: f.gridW, h: f.gridH }) + '\n');
  },

  'set-spawn': function(args, raw) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    f.spawn = { x: at.x, y: at.y };
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ spawn: f.spawn }) + '\n');
  },

  'set-door-target': function(args, raw) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    f.doorTargets = f.doorTargets || {};
    var key = at.x + ',' + at.y;
    var tgt = args.target;
    if (tgt === '' || tgt == null || tgt === 'null') delete f.doorTargets[key];
    else f.doorTargets[key] = String(tgt);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ doorTargets: f.doorTargets }) + '\n');
  },

  'validate': function(args, raw, schema) {
    var scope = args.scope || (args.floor ? 'current' : 'all');
    var issues = [];
    if (scope === 'current') {
      if (!args.floor) fail(1, 'validate --scope current needs --floor');
      issues = validateFloor(args.floor, raw.floors[args.floor], schema);
    } else {
      Object.keys(raw.floors).forEach(function(id) {
        issues = issues.concat(validateFloor(id, raw.floors[id], schema));
      });
      issues = issues.concat(validateCross(raw.floors));
    }
    var txt = JSON.stringify({ scope: scope, issueCount: issues.length, issues: issues }, null, 2);
    if (args.out) {
      fs.writeFileSync(path.resolve(process.cwd(), args.out), txt);
      process.stdout.write('[blockout-cli] wrote ' + issues.length + ' issues -> ' + args.out + '\n');
    } else {
      process.stdout.write(txt + '\n');
    }
    if (issues.some(function(i) { return i.severity === 'err'; })) process.exit(2);
  },

  // ── Pass 2: perception tools ─────────────────────────────────
  'render-ascii': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var grid = f.grid;
    var gw = grid[0] ? grid[0].length : 0, gh = grid.length;
    var vp = { x: 0, y: 0, w: gw, h: gh };
    if (args.viewport) {
      var m = String(args.viewport).match(/^(-?\d+),(-?\d+),(\d+)[xX](\d+)$/);
      if (!m) fail(1, 'bad --viewport (expected X,Y,WxH): ' + args.viewport);
      vp = { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
    }
    var x0 = Math.max(0, vp.x), y0 = Math.max(0, vp.y);
    var x1 = Math.min(gw, x0 + vp.w), y1 = Math.min(gh, y0 + vp.h);
    var used = {};
    var rows = [];
    for (var y = y0; y < y1; y++) {
      var row = '';
      for (var x = x0; x < x1; x++) {
        var t = grid[y][x];
        var s = schema[t] || {};
        var g = s.glyph || '?';
        row += g;
        if (!used[g]) used[g] = {};
        used[g][t] = s.name || ('TILE_' + t);
      }
      rows.push(row);
    }
    var legend = [];
    Object.keys(used).sort().forEach(function(g) {
      Object.keys(used[g]).forEach(function(id) {
        legend.push({ glyph: g, tileId: +id, name: used[g][id] });
      });
    });
    process.stdout.write(JSON.stringify({
      floor: args.floor, w: x1 - x0, h: y1 - y0,
      viewport: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      glyphs: rows.join('\n'),
      legend: legend,
      spawn: f.spawn || null
    }, null, 2) + '\n');
  },

  'describe-cell': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var grid = f.grid;
    if (at.y < 0 || at.y >= grid.length || at.x < 0 || at.x >= grid[at.y].length) {
      fail(1, 'cell ('+at.x+','+at.y+') out of bounds');
    }
    var t = grid[at.y][at.x];
    var s = schema[t] || {};
    var key = at.x + ',' + at.y;
    var dt = (f.doorTargets || {})[key] || null;
    var dirs = ['EAST','SOUTH','WEST','NORTH'];
    var df = (f.doorFaces && f.doorFaces[key] != null) ? dirs[f.doorFaces[key]] : null;
    var rooms = [];
    (f.rooms || []).forEach(function(r, i) {
      if (at.x >= r.x && at.x < r.x + r.w && at.y >= r.y && at.y < r.y + r.h) {
        rooms.push({ index: i, x: r.x, y: r.y, w: r.w, h: r.h });
      }
    });
    process.stdout.write(JSON.stringify({
      floor: args.floor, at: at,
      tileId: t, name: s.name || ('TILE_' + t),
      category: s.cat || null, glyph: s.glyph || null,
      walk: s.walk === true, opaque: s.opq === true, color: s.color || null,
      doorTarget: dt, exteriorFace: df, rooms: rooms,
      isSpawn: !!(f.spawn && f.spawn.x === at.x && f.spawn.y === at.y)
    }, null, 2) + '\n');
  },

  'diff-ascii': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    if (!args.before) fail(1, 'diff-ascii needs --before <path-to-prior-get-floor.json>');
    var beforePath = path.resolve(process.cwd(), args.before);
    if (!fs.existsSync(beforePath)) fail(2, 'before file not found: ' + beforePath);
    var before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    var beforeGrid = before.grid || before;
    if (!Array.isArray(beforeGrid) || !Array.isArray(beforeGrid[0])) {
      fail(1, '--before must be a get-floor JSON or 2D grid');
    }
    var grid = f.grid;
    var gh = grid.length, gw = grid[0] ? grid[0].length : 0;
    var rows = [], changes = [];
    for (var y = 0; y < gh; y++) {
      var row = '';
      for (var x = 0; x < gw; x++) {
        var cur = grid[y][x];
        var prev = (beforeGrid[y] && beforeGrid[y][x] != null) ? beforeGrid[y][x] : null;
        if (prev === cur) { row += '.'; }
        else {
          var s = schema[cur] || {};
          row += s.glyph || '?';
          changes.push({ x: x, y: y, before: prev, after: cur });
        }
      }
      rows.push(row);
    }
    process.stdout.write(JSON.stringify({
      floor: args.floor, w: gw, h: gh,
      diff: rows.join('\n'),
      changeCount: changes.length,
      changes: changes
    }, null, 2) + '\n');
  },

  'report-validation': function(args, raw, schema) {
    return COMMANDS.validate(args, raw, schema);
  },

  // ── Pass 3: tile semantic lookup ─────────────────────────────
  'tile': function(args, raw, schema) {
    var ref = args.name != null ? args.name : args.ref;
    if (ref == null) fail(1, 'tile needs --name <NAME> or --ref <id|name>');
    var id = resolveTile(ref, schema);
    if (id == null || !schema[id]) fail(2, 'unknown tile: ' + ref);
    process.stdout.write(String(id) + '\n');
  },

  'tile-name': function(args, raw, schema) {
    var id;
    if (args.id != null) id = parseInt(args.id, 10);
    else if (args.ref != null) id = resolveTile(args.ref, schema);
    else fail(1, 'tile-name needs --id <n> or --ref <name|id>');
    var s = schema[id];
    if (!s) fail(2, 'unknown tile id: ' + id);
    process.stdout.write((s.name || ('TILE_' + id)) + '\n');
  },

  'tile-schema': function(args, raw, schema) {
    if (args.ref != null || args.name != null || args.id != null) {
      var id;
      if (args.id != null) id = parseInt(args.id, 10);
      else id = resolveTile(args.ref != null ? args.ref : args.name, schema);
      var s = schema[id];
      if (!s) fail(2, 'unknown tile: ' + (args.ref||args.name||args.id));
      process.stdout.write(JSON.stringify(Object.assign({ id: id }, s), null, 2) + '\n');
    } else {
      var all = [];
      Object.keys(schema).forEach(function(id) {
        all.push(Object.assign({ id: +id }, schema[id]));
      });
      all.sort(function(a,b){ return a.id - b.id; });
      process.stdout.write(JSON.stringify(all, null, 2) + '\n');
    }
  },

  'find-tiles': function(args, raw, schema) {
    var nameQ = args.name != null ? String(args.name) : null;
    var nameRe = null;
    if (nameQ) {
      var m = nameQ.match(/^\/(.+)\/([imsu]*)$/);
      if (m) {
        try { nameRe = new RegExp(m[1], m[2] || 'i'); }
        catch (e) { fail(1, 'bad --name regex: ' + nameQ); }
      }
    }
    var cat = args.category != null ? String(args.category) : (args.cat != null ? String(args.cat) : null);
    var glyph = args.glyph != null ? String(args.glyph) : null;
    var flagKeys = ['walk','opq','opaque','hazard','isDoor','isFreeform','isFloating','isCrenellated','isFloatingMoss','isFloatingLid','isFloatingBackFace','isWindow','isTorch'];
    function parseFlag(v) {
      if (v === true || v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
      return null;
    }
    var flags = {};
    flagKeys.forEach(function(k) {
      if (args[k] != null) {
        var src = (k === 'opaque') ? 'opq' : k;
        var pv = parseFlag(args[k]);
        if (pv === null) fail(1, 'bad --' + k + ' (expected true|false): ' + args[k]);
        flags[src] = pv;
      }
    });
    var out = [];
    Object.keys(schema).forEach(function(id) {
      var s = schema[id]; if (!s) return;
      var name = s.name || '';
      if (nameRe) { if (!nameRe.test(name)) return; }
      else if (nameQ) { if (String(name).toUpperCase().indexOf(nameQ.toUpperCase()) < 0) return; }
      if (cat != null) {
        var sc = s.category || s.cat;
        if (String(sc) !== cat) return;
      }
      for (var k in flags) { if (!!s[k] !== flags[k]) return; }
      if (glyph != null && s.glyph !== glyph) return;
      out.push({
        id: +id,
        name: s.name || null,
        category: s.category || s.cat || null,
        glyph: s.glyph || null,
        walk: s.walk === true, opaque: s.opq === true, hazard: s.hazard === true,
        isDoor: s.isDoor === true, isFreeform: s.isFreeform === true,
        isFloating: s.isFloating === true, isWindow: s.isWindow === true,
        isTorch: s.isTorch === true, color: s.color || null
      });
    });
    out.sort(function(a,b){ return a.id - b.id; });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  },

  // ── Pass 4: parametric stamps + stamp registry ───────────────
  'stamp-room': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var size = parseCoord(args.size || args['size'], '--size');
    if (size.x < 2 || size.y < 2) fail(1, 'stamp-room: size must be >=2x2');
    var wallTile = resolveTile(args['wall-tile'] != null ? args['wall-tile'] : 'WALL', schema);
    var floorTile = resolveTile(args['floor-tile'] != null ? args['floor-tile'] : 0, schema);
    var cells = cellsInRect(at.x, at.y, at.x+size.x-1, at.y+size.y-1, false);
    var x0=at.x, y0=at.y, x1=at.x+size.x-1, y1=at.y+size.y-1;
    var changed = 0;
    cells.forEach(function(c) {
      var onEdge = (c.x===x0||c.x===x1||c.y===y0||c.y===y1);
      var t = onEdge ? wallTile : floorTile;
      if (c.y<0||c.y>=f.grid.length||c.x<0||c.x>=f.grid[c.y].length) return;
      if (f.grid[c.y][c.x] !== t) { f.grid[c.y][c.x] = t; changed++; }
    });
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed, at:{x:x0,y:y0}, w:size.x, h:size.y, wallTile:wallTile, floorTile:floorTile }) + '\n');
  },

  'stamp-corridor': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var from = parseCoord(args.from, '--from');
    var to   = parseCoord(args.to, '--to');
    var floorTile = resolveTile(args['floor-tile'] != null ? args['floor-tile'] : (args.tile != null ? args.tile : 0), schema);
    var wallTile = args['wall-tile'] != null ? resolveTile(args['wall-tile'], schema) : null;
    var width = Math.max(1, parseInt(args.width, 10) || 1);
    var path = cellsInLine(from.x, from.y, to.x, to.y);
    var wide = {};
    var hw = Math.floor((width-1)/2), hw2 = Math.ceil((width-1)/2);
    path.forEach(function(p) {
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
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed, pathLength: path.length, width: width, hasWalls: wallTile != null }) + '\n');
  },

  'stamp-torch-ring': function(args, raw, schema) {
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var radius = Math.max(1, parseInt(args.radius, 10) || 2);
    var step = Math.max(1, parseInt(args.step, 10) || 1);
    var torchTile = resolveTile(args['torch-tile'] != null ? args['torch-tile'] : 'TORCH_LIT', schema);
    var cx=at.x, cy=at.y;
    var x0=cx-radius, x1=cx+radius, y0=cy-radius, y1=cy+radius;
    var cells=[], i;
    i=0; for (var x=x0; x<=x1; x++) { if ((i++%step)===0) cells.push({x:x,y:y0}); }
    i=0; for (var x2=x0; x2<=x1; x2++) { if ((i++%step)===0) cells.push({x:x2,y:y1}); }
    i=0; for (var y=y0+1; y<=y1-1; y++) { if ((i++%step)===0) cells.push({x:x0,y:y}); }
    i=0; for (var y2=y0+1; y2<=y1-1; y2++) { if ((i++%step)===0) cells.push({x:x1,y:y2}); }
    var changed = applyCells(f.grid, cells, torchTile);
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed.length, at:{x:cx,y:cy}, radius: radius, torchTile: torchTile, step: step }) + '\n');
  },

  'save-stamp': function(args, raw, schema) {
    if (!args.name) fail(1, 'save-stamp needs --name');
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var size = parseCoord(args.size, '--size');
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
    var stamps = loadStamps();
    stamps[args.name] = {
      w: size.x, h: size.y, cells: rows,
      meta: { sourceFloor: args.floor, at: {x:at.x,y:at.y}, createdAt: new Date().toISOString() }
    };
    saveStamps(stamps);
    process.stdout.write(JSON.stringify({ name: args.name, w: size.x, h: size.y, sourceFloor: args.floor }) + '\n');
  },

  'apply-stamp': function(args, raw, schema) {
    if (!args.name) fail(1, 'apply-stamp needs --name');
    var stamps = loadStamps();
    var s = stamps[args.name];
    if (!s) fail(2, 'unknown stamp: ' + args.name);
    var f = requireFloor(raw, args.floor);
    var at = parseCoord(args.at, '--at');
    var rot = ((parseInt(args.rotate, 10) || 0) % 360 + 360) % 360;
    var flipH = !!args['flip-h'];
    var flipV = !!args['flip-v'];
    var cells = s.cells;
    if (rot === 90)       cells = rotateCW(cells);
    else if (rot === 180) cells = rotate180(cells);
    else if (rot === 270) cells = rotateCCW(cells);
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
    saveFloors(raw);
    process.stdout.write(JSON.stringify({ changed: changed, name: args.name, at: at, rotate: rot, flipH: flipH, flipV: flipV }) + '\n');
  },

  'list-stamps': function() {
    var stamps = loadStamps();
    var out = Object.keys(stamps).sort().map(function(name) {
      var s = stamps[name];
      return { name: name, w: s.w, h: s.h, sourceFloor: (s.meta && s.meta.sourceFloor) || null };
    });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  },

  'delete-stamp': function(args) {
    if (!args.name) fail(1, 'delete-stamp needs --name');
    var stamps = loadStamps();
    if (!stamps[args.name]) fail(2, 'unknown stamp: ' + args.name);
    delete stamps[args.name];
    saveStamps(stamps);
    process.stdout.write(JSON.stringify({ name: args.name, deleted: true, remaining: Object.keys(stamps).length }) + '\n');
  },

  'describe': function(args, raw) {
    process.stdout.write(JSON.stringify({
      floorDataPath: FLOOR_DATA_PATH,
      floorCount: Object.keys(raw.floors).length,
      generated: raw.generated || null,
      commands: Object.keys(COMMANDS).sort()
    }, null, 2) + '\n');
  }
};

function printHelp() {
  process.stdout.write([
    'blockout-cli — Tier 6 Pass 1+2+3+4 (Node)',
    'Mutates tools/floor-data.json in place (Pass 1/4). Pass 2/3 are read-only.',
    '',
    'Commands:',
    '  ' + Object.keys(COMMANDS).sort().join('\n  '),
    '',
    'Examples:',
    '  node tools/blockout-cli.js paint-rect   --floor 2.1   --at 5,5 --size 3x3 --tile WALL',
    '  node tools/blockout-cli.js render-ascii --floor 1.3.1 --viewport 0,0,40x20',
    '  node tools/blockout-cli.js tile         --name WALL',
    '  node tools/blockout-cli.js find-tiles   --isDoor true',
    '  node tools/blockout-cli.js stamp-room   --floor 2.2.1 --at 2,2 --size 5x5',
    '  node tools/blockout-cli.js save-stamp   --floor 2.2.1 --name my-room --at 2,2 --size 5x5',
    '  node tools/blockout-cli.js apply-stamp  --floor 2.2.2 --name my-room --at 10,10 --rotate 90',
    ''
  ].join('\n'));
}

function main() {
  var argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    process.exit(argv.length ? 0 : 1);
  }
  var cmdName = argv[0];
  var args = parseArgs(argv.slice(1));
  if (args.help) { printHelp(); process.exit(0); }
  var cmd = COMMANDS[cmdName];
  if (!cmd) fail(1, 'unknown command: ' + cmdName + ' (try --help)');
  var raw = loadFloors();
  var schema = loadSchema();
  try {
    cmd(args, raw, schema);
  } catch (e) {
    fail(2, (e && e.stack) || String(e));
  }
}

main();

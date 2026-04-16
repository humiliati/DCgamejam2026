// ═══════════════════════════════════════════════════════════════
//  tools/cli/shared.js — Shared helpers for blockout-cli commands
//  Pass 0.3 split of tools/blockout-cli.js
//
//  Every command module requires this and destructures what it
//  needs. The dispatcher (tools/blockout-cli.js) composes command
//  modules into a single COMMANDS map.
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');

var TOOLS_DIR        = path.resolve(__dirname, '..');
var FLOOR_DATA_PATH  = path.join(TOOLS_DIR, 'floor-data.json');
var TILE_SCHEMA_PATH = path.join(TOOLS_DIR, 'tile-schema.json');
var STAMPS_PATH      = path.join(TOOLS_DIR, 'stamps.json');

// ── Process ────────────────────────────────────────────────────
function fail(code, msg) {
  process.stderr.write('[blockout-cli] ' + msg + '\n');
  process.exit(code);
}

// ── Args ───────────────────────────────────────────────────────
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

function parseCoord(s, name) {
  if (typeof s !== 'string') fail(1, 'missing ' + name);
  var m = s.match(/^(-?\d+)[ ,xX](-?\d+)$/);
  if (!m) fail(1, 'bad ' + name + ': expected X,Y got ' + JSON.stringify(s));
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

// ── Data loaders ───────────────────────────────────────────────
function loadFloors() {
  if (!fs.existsSync(FLOOR_DATA_PATH)) {
    fail(2, 'floor-data.json not found — run `node tools/extract-floors.js`');
  }
  return JSON.parse(fs.readFileSync(FLOOR_DATA_PATH, 'utf8'));
}
// ── Dry-run mode (Slice C1) ────────────────────────────────────
// When the dispatcher sees --dry-run, it flips this flag ON before
// the command runs. Every command calls S.saveFloors(raw) at the end;
// in dry-run that write is swallowed and counted. The dispatcher then
// diffs the pristine-on-disk floor-data against the mutated in-memory
// raw and prints the preview instead of persisting.
var _dryRun = false;
var _saveCallCount = 0;
function setDryRun(flag) { _dryRun = !!flag; _saveCallCount = 0; }
function isDryRun()      { return _dryRun; }
function saveCallCount() { return _saveCallCount; }

function saveFloors(raw) {
  if (_dryRun) { _saveCallCount++; return; }
  fs.writeFileSync(FLOOR_DATA_PATH, JSON.stringify(raw, null, 2));
}
function loadSchema() {
  if (!fs.existsSync(TILE_SCHEMA_PATH)) return {};
  var raw = JSON.parse(fs.readFileSync(TILE_SCHEMA_PATH, 'utf8'));
  // tile-schema.json stores { generated, tileCount, tiles: { id: {...} } }
  return raw.tiles || raw;
}
function loadStamps() {
  if (!fs.existsSync(STAMPS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STAMPS_PATH, 'utf8')); }
  catch (e) { return {}; }
}
function saveStamps(stamps) {
  fs.writeFileSync(STAMPS_PATH, JSON.stringify(stamps, null, 2));
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

function requireFloor(raw, id) {
  if (!raw.floors[id]) fail(2, 'unknown floor: ' + id);
  return raw.floors[id];
}

// ── Grid primitives ────────────────────────────────────────────
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

// ── Stamp rotation ─────────────────────────────────────────────
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

module.exports = {
  fs: fs, path: path,
  paths: { TOOLS_DIR: TOOLS_DIR, FLOOR_DATA_PATH: FLOOR_DATA_PATH,
           TILE_SCHEMA_PATH: TILE_SCHEMA_PATH, STAMPS_PATH: STAMPS_PATH },
  fail: fail, parseArgs: parseArgs, parseCoord: parseCoord,
  loadFloors: loadFloors, saveFloors: saveFloors, loadSchema: loadSchema,
  setDryRun: setDryRun, isDryRun: isDryRun, saveCallCount: saveCallCount,
  loadStamps: loadStamps, saveStamps: saveStamps,
  resolveTile: resolveTile, requireFloor: requireFloor,
  applyCells: applyCells, cellsInRect: cellsInRect, cellsInLine: cellsInLine,
  floodFillCells: floodFillCells, replaceAllCells: replaceAllCells,
  rotateCW: rotateCW, rotateCCW: rotateCCW, rotate180: rotate180
};

// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-perception.js — Read-only perception
//  Pass 0.3 split: render-ascii, describe-cell, diff-ascii
//  Pass 5d Slice C5: render-ascii + describe-cell fall back to an
//                    in-memory `bo ingest` when the target floor
//                    isn't in floor-data.json but the matching
//                    engine/floor-blockout-<id>.js does exist.
//                    Fallback is hermetic — floor-data.json is NOT
//                    mutated on disk.
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');
var S    = require('./shared');

// ── Slice C5: hermetic fallback loader ───────────────────────────
// Tries raw.floors[id] first. If absent, boots the shared IIFE
// sandbox, loads engine/floor-blockout-<id>.js, extracts the floor
// payload via FloorManager._testGetBuilders, and returns the result.
// Returns { floor, source } where source ∈ {'floor-data','iife'}.
// Throws on miss — callers surface the error via S.fail(2, ...).
//
// Lazy require-d so the perception module stays cheap for the normal
// path (no VM boot when the floor is already in floor-data.json).
function _resolveFloor(raw, id) {
  if (raw.floors && raw.floors[id]) {
    return { floor: raw.floors[id], source: 'floor-data' };
  }
  // Try IIFE fallback.
  var ingestMod  = require('./commands-ingest');
  var sandboxMod = require('./iife-sandbox');
  var fileName   = ingestMod._fileNameForFloor(id);
  var relPath    = path.join('engine', fileName);
  var absPath    = path.join(sandboxMod.ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error('unknown floor: ' + id
      + ' (not in floor-data.json and ' + relPath + ' does not exist)');
  }
  var harness = sandboxMod.bootstrapForIngest();
  var loadRes = harness.loadFile(relPath);
  if (!loadRes.ok) throw new Error('iife fallback: eval failed for ' + relPath + ' — ' + loadRes.reason);
  var extracted = sandboxMod.extractFloor(harness.sandbox, id);
  if (!extracted) {
    throw new Error('iife fallback: ' + relPath
      + ' did not register a builder for "' + id + '"');
  }
  return { floor: extracted, source: 'iife' };
}

module.exports = {
  'render-ascii': function(args, raw, schema) {
    if (!args.floor) S.fail(1, 'render-ascii needs --floor <id>');
    var resolved;
    try { resolved = _resolveFloor(raw, args.floor); }
    catch (e) { S.fail(2, (e && e.message) || String(e)); }
    var f = resolved.floor;
    var grid = f.grid;
    var gw = grid[0] ? grid[0].length : 0, gh = grid.length;
    var vp = { x: 0, y: 0, w: gw, h: gh };
    if (args.viewport) {
      var m = String(args.viewport).match(/^(-?\d+),(-?\d+),(\d+)[xX](\d+)$/);
      if (!m) S.fail(1, 'bad --viewport (expected X,Y,WxH): ' + args.viewport);
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
      spawn: f.spawn || null,
      source: resolved.source  // 'floor-data' | 'iife' (Slice C5)
    }, null, 2) + '\n');
  },

  'describe-cell': function(args, raw, schema) {
    if (!args.floor) S.fail(1, 'describe-cell needs --floor <id>');
    var resolved;
    try { resolved = _resolveFloor(raw, args.floor); }
    catch (e) { S.fail(2, (e && e.message) || String(e)); }
    var f = resolved.floor;
    var at = S.parseCoord(args.at, '--at');
    var grid = f.grid;
    if (at.y < 0 || at.y >= grid.length || at.x < 0 || at.x >= grid[at.y].length) {
      S.fail(1, 'cell ('+at.x+','+at.y+') out of bounds');
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
      isSpawn: !!(f.spawn && f.spawn.x === at.x && f.spawn.y === at.y),
      source: resolved.source  // 'floor-data' | 'iife' (Slice C5)
    }, null, 2) + '\n');
  },

  'diff-ascii': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    if (!args.before) S.fail(1, 'diff-ascii needs --before <path-to-prior-get-floor.json>');
    var beforePath = S.path.resolve(process.cwd(), args.before);
    if (!S.fs.existsSync(beforePath)) S.fail(2, 'before file not found: ' + beforePath);
    var before = JSON.parse(S.fs.readFileSync(beforePath, 'utf8'));
    var beforeGrid = before.grid || before;
    if (!Array.isArray(beforeGrid) || !Array.isArray(beforeGrid[0])) {
      S.fail(1, '--before must be a get-floor JSON or 2D grid');
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
  }
};

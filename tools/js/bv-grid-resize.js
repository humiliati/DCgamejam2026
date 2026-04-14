// ═══════════════════════════════════════════════════════════════
//  bv-grid-resize.js — Grid resize (add/shrink rows/cols)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js
//
//  Exposes globals:
//    getResizeFill()       — read selected fill tile id from DOM
//    resizeGrid(side, act) — grow/shrink grid on one side
//    populateResizeFill()  — seed the fill-tile <select>
//
//  External refs: draw(), clearLasso()
// ═══════════════════════════════════════════════════════════════
'use strict';

function getResizeFill() {
  var sel = document.getElementById('resize-fill-tile');
  return parseInt(sel.value) || 0;
}

// FIX #2: when a row/col is prepended (+T, +L) or removed from the
// top/left (-T, -L), every tile's world coordinate shifts, so any
// metadata keyed by (x,y) must shift in lockstep. `dx`/`dy` are the
// offsets to apply to every coord (e.g. +L means dx=+1, -T means dy=-1).
// Returns { oldMeta, newMeta } snapshots so resize can be undone/redone.
function shiftFloorMetadata(floor, dx, dy) {
  if (!floor) return null;
  // Snapshot a full metadata bundle (spawn, rooms, door maps, AND the
  // separate `doors` {doorEntry, doorExit, stairsDn, stairsUp} struct
  // that bv-render.js draws the ENTRY/EXIT/UP/DN rectangles from —
  // missing this was why FIX #2's first pass didn't visibly shift doors).
  function snap(f) {
    return {
      spawn: f.spawn ? { x: f.spawn.x, y: f.spawn.y } : null,
      rooms: f.rooms ? JSON.parse(JSON.stringify(f.rooms)) : null,
      doorTargets: f.doorTargets ? JSON.parse(JSON.stringify(f.doorTargets)) : null,
      doorFaces: f.doorFaces ? JSON.parse(JSON.stringify(f.doorFaces)) : null,
      doors: f.doors ? JSON.parse(JSON.stringify(f.doors)) : null
    };
  }
  var before = snap(floor);
  if (!dx && !dy) return { before: before, after: before };

  if (floor.spawn) {
    floor.spawn = { x: floor.spawn.x + dx, y: floor.spawn.y + dy };
  }
  if (Array.isArray(floor.rooms)) {
    floor.rooms = floor.rooms.map(function(r) {
      var o = { x: (r.x|0) + dx, y: (r.y|0) + dy, w: r.w, h: r.h };
      if (r.cx !== undefined) o.cx = (r.cx|0) + dx;
      if (r.cy !== undefined) o.cy = (r.cy|0) + dy;
      return o;
    });
  }
  function reKeyMap(m) {
    if (!m || typeof m !== 'object') return m;
    var out = {};
    Object.keys(m).forEach(function(k) {
      var parts = k.split(',');
      if (parts.length !== 2) { out[k] = m[k]; return; }
      var nx = (parseInt(parts[0], 10) || 0) + dx;
      var ny = (parseInt(parts[1], 10) || 0) + dy;
      out[nx + ',' + ny] = m[k];
    });
    return out;
  }
  if (floor.doorTargets) floor.doorTargets = reKeyMap(floor.doorTargets);
  if (floor.doorFaces)   floor.doorFaces   = reKeyMap(floor.doorFaces);
  // Shift the ENTRY/EXIT/UP/DN markers that bv-render.js reads from
  // `currentFloor.doors` — these are {x,y} objects, not "x,y" keys.
  if (floor.doors && typeof floor.doors === 'object') {
    var shiftedDoors = {};
    Object.keys(floor.doors).forEach(function(k) {
      var v = floor.doors[k];
      if (v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') {
        shiftedDoors[k] = { x: v.x + dx, y: v.y + dy };
      } else {
        shiftedDoors[k] = v;
      }
    });
    floor.doors = shiftedDoors;
  }

  var after = snap(floor);
  return { before: before, after: after };
}

function restoreFloorMetadata(floor, snap) {
  if (!floor || !snap) return;
  floor.spawn       = snap.spawn       ? { x: snap.spawn.x, y: snap.spawn.y } : null;
  floor.rooms       = snap.rooms       ? JSON.parse(JSON.stringify(snap.rooms))       : [];
  floor.doorTargets = snap.doorTargets ? JSON.parse(JSON.stringify(snap.doorTargets)) : {};
  floor.doorFaces   = snap.doorFaces   ? JSON.parse(JSON.stringify(snap.doorFaces))   : {};
  if (snap.doors) floor.doors = JSON.parse(JSON.stringify(snap.doors));
}

function resizeGrid(side, action) {
  if (!currentFloor || !currentFloor.grid) return;
  var grid = currentFloor.grid;
  var oldGrid = snapshotGrid(grid);
  var gw = grid[0] ? grid[0].length : 0;
  var gh = grid.length;
  var fill = getResizeFill();
  // FIX #2: coord-shift amount for metadata.
  // +L prepends a column → every existing tile moves right by 1 (dx = +1).
  // +T prepends a row    → every existing tile moves down  by 1 (dy = +1).
  // -L removes the first column → every remaining tile moves left  (dx = -1).
  // -T removes the first row    → every remaining tile moves up    (dy = -1).
  // +R / +B / -R / -B only trim or grow the far edge, so dx = dy = 0.
  var dx = 0, dy = 0;
  if (action === 'add') {
    if (side === 'col-l') dx = 1;
    else if (side === 'row-t') dy = 1;
  } else if (action === 'shrink') {
    if (side === 'col-l' && gw > 1) dx = -1;
    else if (side === 'row-t' && gh > 1) dy = -1;
  }
  var metaSnap = shiftFloorMetadata(currentFloor, dx, dy);
  // FIX #1: mirror structural changes into EDIT.originalGrid so the
  // dirty-cell highlight in bv-render.js (`orig[y] && grid[y][x] !==
  // orig[y][x]`) has a defined cell to compare against on newly-added
  // rows/cols. Without this mirror, `orig[y]` is undefined on a +B row
  // and the red "edited" outline silently skips — making newly-added
  // cells look non-interactive even though painting actually works.
  var orig = EDIT.originalGrid;
  var mkFillRow = function(w) { var r = []; for (var x = 0; x < w; x++) r.push(fill); return r; };
  // FIX #1 (revised): seed newly-added cells in EDIT.originalGrid with a
  // sentinel (-1) rather than the fill tile, so any real tile on the new
  // cell reads as "different from original" and renders as dirty at
  // creation time. Without the sentinel, a freshly-added row painted with
  // the default fill matches originalGrid and looks non-interactive.
  var SENTINEL = -1;
  var mkSentinelRow = function(w) { var r = []; for (var x = 0; x < w; x++) r.push(SENTINEL); return r; };

  if (action === 'add') {
    if (side === 'col-r') {
      for (var y = 0; y < gh; y++) grid[y].push(fill);
      if (orig) for (var yo = 0; yo < orig.length; yo++) if (orig[yo]) orig[yo].push(SENTINEL);
    } else if (side === 'col-l') {
      for (var y = 0; y < gh; y++) grid[y].unshift(fill);
      if (orig) for (var yo = 0; yo < orig.length; yo++) if (orig[yo]) orig[yo].unshift(SENTINEL);
    } else if (side === 'row-b') {
      grid.push(mkFillRow(gw));
      if (orig) orig.push(mkSentinelRow(grid[0] ? grid[0].length : gw));
    } else if (side === 'row-t') {
      grid.unshift(mkFillRow(gw));
      if (orig) orig.unshift(mkSentinelRow(grid[0] ? grid[0].length : gw));
    }
  } else if (action === 'shrink') {
    if (side === 'col-r' && gw > 1) {
      for (var y = 0; y < gh; y++) grid[y].pop();
      if (orig) for (var yo = 0; yo < orig.length; yo++) if (orig[yo]) orig[yo].pop();
    } else if (side === 'col-l' && gw > 1) {
      for (var y = 0; y < gh; y++) grid[y].shift();
      if (orig) for (var yo = 0; yo < orig.length; yo++) if (orig[yo]) orig[yo].shift();
    } else if (side === 'row-b' && gh > 1) {
      grid.pop();
      if (orig) orig.pop();
    } else if (side === 'row-t' && gh > 1) {
      grid.shift();
      if (orig) orig.shift();
    }
  }

  currentFloor.gridW = grid[0] ? grid[0].length : 0;
  currentFloor.gridH = grid.length;
  pushUndo({
    type: 'resize',
    oldGrid: oldGrid,
    newGrid: snapshotGrid(currentFloor.grid),
    oldMeta: metaSnap ? metaSnap.before : null,
    newMeta: metaSnap ? metaSnap.after  : null
  });
  // Keep the metadata panel in sync if it's open (door rows keyed by x,y).
  if (typeof buildMetadataPanel === 'function' && typeof META !== 'undefined' && META.open) {
    buildMetadataPanel();
  }
  clearLasso();
  updateEditUI();
  draw();
}

function populateResizeFill() {
  var sel = document.getElementById('resize-fill-tile');
  sel.innerHTML = '';
  // Common fill tiles
  var fillTiles = [0, 1, 34, 32, 33, 21, 22, 9];
  fillTiles.forEach(function(id) {
    var s = TILE_SCHEMA[id];
    if (!s) return;
    var opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id + ' ' + s.name;
    sel.appendChild(opt);
  });
}

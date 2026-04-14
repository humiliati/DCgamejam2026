// ═══════════════════════════════════════════════════════════════
//  bv-primitives.js — Shape primitives: rect / line / flood / replace
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js, bv-brush.js
//
//  Exposes globals:
//    cellsInRect(x0,y0,x1,y1,outline)  — axis-aligned rect cells
//    cellsInLine(x0,y0,x1,y1)          — Bresenham line cells
//    floodFillCells(gx, gy)            — 4-connected flood fill
//    replaceAllOfType(gx, gy)          — every cell matching seed tile
//    commitBulk(cells)                 — paint EDIT.paintTile to cells + push undo
//
//  External refs: draw() — bv-render.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Rectangle / Line / Bucket / Replace primitives ──
function cellsInRect(x0, y0, x1, y1, outline) {
  var xa = Math.min(x0,x1), xb = Math.max(x0,x1);
  var ya = Math.min(y0,y1), yb = Math.max(y0,y1);
  var out = [];
  for (var y = ya; y <= yb; y++) {
    for (var x = xa; x <= xb; x++) {
      if (outline) {
        if (x === xa || x === xb || y === ya || y === yb) out.push({x:x,y:y});
      } else {
        out.push({x:x,y:y});
      }
    }
  }
  return out;
}

function cellsInLine(x0, y0, x1, y1) {
  // Bresenham
  var out = [];
  var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  var err = dx - dy;
  var x = x0, y = y0;
  while (true) {
    out.push({x:x,y:y});
    if (x === x1 && y === y1) break;
    var e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
    if (out.length > 5000) break;  // safety
  }
  return out;
}

function floodFillCells(gx, gy) {
  // 4-connected flood fill from (gx,gy) — returns every cell matching the seed tile.
  if (!currentFloor || !currentFloor.grid) return [];
  var grid = currentFloor.grid;
  if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[gy].length) return [];
  var target = grid[gy][gx];
  if (target === EDIT.paintTile) return [];  // no-op
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
    out.push({x:x,y:y});
    stack.push([x+1,y]); stack.push([x-1,y]); stack.push([x,y+1]); stack.push([x,y-1]);
    if (out.length > gw * gh) break;
  }
  return out;
}

function replaceAllOfType(gx, gy) {
  if (!currentFloor || !currentFloor.grid) return [];
  var grid = currentFloor.grid;
  if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[gy].length) return [];
  var target = grid[gy][gx];
  if (target === EDIT.paintTile) return [];
  var out = [];
  for (var y = 0; y < grid.length; y++) {
    for (var x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === target) out.push({x:x,y:y});
    }
  }
  return out;
}

function commitBulk(cells) {
  // Apply cells with EDIT.paintTile, push a single undo entry, refresh UI.
  var changed = applyCellsToGrid(cells, EDIT.paintTile);
  if (changed.length) {
    pushUndo({ type: 'bulk', cells: changed, newTile: EDIT.paintTile });
    updateEditUI();
    draw();
  }
}

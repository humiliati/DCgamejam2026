// ═══════════════════════════════════════════════════════════════
//  bv-brush.js — Brush helpers for the Paint tool
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js
//
//  Exposes globals:
//    brushCells(gx, gy, size)      — square brush footprint
//    applyCellsToGrid(cells, tile) — write tile + return {x,y,oldTile}[]
//    paintCell(gx, gy)             — drag-paint: stamp brush, accumulate stroke
//    flushStroke()                 — commit paint stroke as one undo entry
//
//  External refs: draw() — bv-render.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Brush helpers ──
function brushCells(gx, gy, size) {
  // Square brush centered on (gx,gy). Size 1=single cell, 2=2x2 (anchor top-left),
  // 3=3x3 (anchor center), 5=5x5 (anchor center). Returns array of {x,y}.
  var out = [];
  var half = size === 2 ? 0 : Math.floor(size / 2);
  var off = size === 2 ? 0 : 0;  // anchor: centered for odd sizes, top-left for 2x2
  var x0 = gx - half, y0 = gy - half;
  if (size === 2) { x0 = gx; y0 = gy; }
  for (var dy = 0; dy < size; dy++) {
    for (var dx = 0; dx < size; dx++) {
      out.push({ x: x0 + dx, y: y0 + dy });
    }
  }
  return out;
}

function applyCellsToGrid(cells, newTile) {
  // Writes newTile to each (x,y) in cells, returning [{x,y,oldTile}] for changed cells only.
  if (!currentFloor || !currentFloor.grid) return [];
  var grid = currentFloor.grid;
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

function paintCell(gx, gy) {
  // Called continuously during a paint-drag. Stamps the brush centered on cell,
  // accumulating changed cells into EDIT.stroke (flushed as one undo entry on mouseup).
  if (!EDIT.active || EDIT.tool !== 'paint' || !currentFloor || !currentFloor.grid) return;
  if (!EDIT.stroke) EDIT.stroke = { seen: {}, cells: [] };
  var cells = brushCells(gx, gy, EDIT.brushSize);
  // Dedupe against cells already stamped in this stroke so we don't double-record oldTile.
  var fresh = cells.filter(function(c) {
    var k = c.x + ',' + c.y;
    if (EDIT.stroke.seen[k]) return false;
    EDIT.stroke.seen[k] = true;
    return true;
  });
  var changed = applyCellsToGrid(fresh, EDIT.paintTile);
  if (changed.length) {
    EDIT.stroke.cells = EDIT.stroke.cells.concat(changed);
    updateEditUI();
    draw();
  }
}

function flushStroke() {
  if (EDIT.stroke && EDIT.stroke.cells.length) {
    pushUndo({ type: 'bulk', cells: EDIT.stroke.cells, newTile: EDIT.paintTile });
  }
  EDIT.stroke = null;
}

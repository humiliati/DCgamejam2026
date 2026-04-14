// ═══════════════════════════════════════════════════════════════
//  bv-lasso.js — Lasso tool (select / lift / drag / commit)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js, bv-grid-resize.js
//
//  Exposes globals:
//    clearLasso, lassoStartSelect, lassoUpdateSelect, lassoEndSelect,
//    lassoStartDrag, lassoUpdateDrag, lassoEndDrag, lassoCommit
//
//  External refs: draw()
// ═══════════════════════════════════════════════════════════════
'use strict';

function clearLasso() {
  LASSO.sel = null;
  LASSO.floating = null;
  LASSO.selecting = false;
  LASSO.dragging = false;
  document.getElementById('lasso-rect').style.display = 'none';
}

function lassoStartSelect(gx, gy) {
  // If clicking inside existing selection, start drag
  if (LASSO.sel && gx >= LASSO.sel.x && gx < LASSO.sel.x + LASSO.sel.w &&
      gy >= LASSO.sel.y && gy < LASSO.sel.y + LASSO.sel.h) {
    lassoStartDrag(gx, gy);
    return;
  }
  // Drop any floating tiles first
  if (LASSO.floating) lassoCommit();
  LASSO.selecting = true;
  LASSO.startGX = gx;
  LASSO.startGY = gy;
  LASSO.sel = { x: gx, y: gy, w: 1, h: 1 };
  draw();
}

function lassoUpdateSelect(gx, gy) {
  if (!LASSO.selecting) return;
  var x1 = Math.min(LASSO.startGX, gx), y1 = Math.min(LASSO.startGY, gy);
  var x2 = Math.max(LASSO.startGX, gx), y2 = Math.max(LASSO.startGY, gy);
  LASSO.sel = { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
  draw();
}

function lassoEndSelect() {
  LASSO.selecting = false;
}

function lassoStartDrag(gx, gy) {
  if (!LASSO.sel) return;
  var s = LASSO.sel;
  // Lift tiles if not already floating
  if (!LASSO.floating) {
    var grid = currentFloor.grid;
    var tiles = [];
    for (var dy = 0; dy < s.h; dy++) {
      var row = [];
      for (var dx = 0; dx < s.w; dx++) {
        var sy = s.y + dy, sx = s.x + dx;
        row.push((sy >= 0 && sy < grid.length && sx >= 0 && sx < grid[sy].length) ? grid[sy][sx] : 0);
      }
      tiles.push(row);
    }
    LASSO.floating = { tiles: tiles, origX: s.x, origY: s.y, curX: s.x, curY: s.y };
    // Clear source area with fill tile
    var fill = getResizeFill();
    for (var dy = 0; dy < s.h; dy++) {
      for (var dx = 0; dx < s.w; dx++) {
        var sy = s.y + dy, sx = s.x + dx;
        if (sy >= 0 && sy < grid.length && sx >= 0 && sx < grid[sy].length) {
          grid[sy][sx] = fill;
        }
      }
    }
  }
  LASSO.dragging = true;
  LASSO.dragOffX = gx - LASSO.sel.x;
  LASSO.dragOffY = gy - LASSO.sel.y;
}

function lassoUpdateDrag(gx, gy) {
  if (!LASSO.dragging || !LASSO.floating) return;
  var newX = gx - LASSO.dragOffX;
  var newY = gy - LASSO.dragOffY;
  LASSO.floating.curX = newX;
  LASSO.floating.curY = newY;
  LASSO.sel.x = newX;
  LASSO.sel.y = newY;
  draw();
}

function lassoEndDrag() {
  LASSO.dragging = false;
}

function lassoCommit() {
  if (!LASSO.floating || !currentFloor) return;
  var f = LASSO.floating;
  var grid = currentFloor.grid;
  var oldGrid = snapshotGrid(grid);

  // Stamp floating tiles onto grid
  for (var dy = 0; dy < f.tiles.length; dy++) {
    for (var dx = 0; dx < f.tiles[dy].length; dx++) {
      var gy = f.curY + dy, gx = f.curX + dx;
      if (gy >= 0 && gy < grid.length && gx >= 0 && gx < grid[gy].length) {
        grid[gy][gx] = f.tiles[dy][dx];
      }
    }
  }
  pushUndo({ type: 'lasso-move', oldGrid: oldGrid, newGrid: snapshotGrid(currentFloor.grid) });
  LASSO.floating = null;
  updateEditUI();
  draw();
}

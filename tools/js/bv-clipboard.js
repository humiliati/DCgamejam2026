// ═══════════════════════════════════════════════════════════════
//  bv-clipboard.js — Selection clipboard (Copy / Cut / Paste / stamp)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js, bv-floor-data.js, bv-lasso.js,
//              bv-tile-schema.js, bv-grid-resize.js
//
//  Exposes globals:
//    getSelectionRect, readTilesFromSelection, updateClipboardBadge,
//    doCopySelection, doCutSelection, stampClipboardAt, doPasteAtHover
//
//  External refs: showCopyToast() [bv-clipboard-utils],
//                 selectTool() [bv-tools],
//                 FLOOR_NAMES [bv-floor-selection], draw()
// ═══════════════════════════════════════════════════════════════
'use strict';

function getSelectionRect() {
  // Prefer a floating lasso block (already lifted), else the static selection rect.
  if (LASSO.floating) {
    var f = LASSO.floating;
    return { x: f.curX, y: f.curY, w: f.tiles[0].length, h: f.tiles.length, floating: true };
  }
  if (LASSO.sel && LASSO.sel.w > 0 && LASSO.sel.h > 0) {
    var s = LASSO.sel;
    return { x: s.x, y: s.y, w: s.w, h: s.h, floating: false };
  }
  return null;
}

function readTilesFromSelection(sel) {
  // Returns a 2D tile array from either the floating block or the live grid.
  if (sel.floating && LASSO.floating) {
    return LASSO.floating.tiles.map(function(row) { return row.slice(); });
  }
  var grid = currentFloor.grid;
  var out = [];
  for (var dy = 0; dy < sel.h; dy++) {
    var row = [];
    for (var dx = 0; dx < sel.w; dx++) {
      var gy = sel.y + dy, gx = sel.x + dx;
      row.push((gy >= 0 && gy < grid.length && gx >= 0 && gx < grid[gy].length) ? grid[gy][gx] : 0);
    }
    out.push(row);
  }
  return out;
}

function updateClipboardBadge() {
  var badge = document.getElementById('clipboard-badge');
  var txt   = document.getElementById('clipboard-badge-text');
  var cnv   = document.getElementById('clipboard-thumb');
  if (!CLIPBOARD.tiles) {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = 'inline-block';
  var crossFloor = CLIPBOARD.sourceFloorId && CLIPBOARD.sourceFloorId !== currentFloorId;
  badge.style.background = crossFloor ? '#6a4a2a' : '#2a4a6a';
  badge.style.color      = crossFloor ? '#ffd' : '#cfe';
  badge.title = crossFloor
    ? 'Clipboard from floor "' + CLIPBOARD.sourceFloorId + '" — click to jump there'
    : 'Clipboard from this floor — click to jump to source';
  txt.textContent = CLIPBOARD.w + '×' + CLIPBOARD.h + '  "' + (CLIPBOARD.sourceFloorId || '?') + '"';

  // Thumbnail: fit clipboard into 28×28 canvas at integer cell size.
  var ctx2 = cnv.getContext('2d');
  ctx2.fillStyle = '#111';
  ctx2.fillRect(0, 0, cnv.width, cnv.height);
  var cell = Math.max(1, Math.floor(Math.min(cnv.width / CLIPBOARD.w, cnv.height / CLIPBOARD.h)));
  var offX = Math.floor((cnv.width  - cell * CLIPBOARD.w) / 2);
  var offY = Math.floor((cnv.height - cell * CLIPBOARD.h) / 2);
  for (var y = 0; y < CLIPBOARD.h; y++) {
    for (var x = 0; x < CLIPBOARD.w; x++) {
      var t = CLIPBOARD.tiles[y][x];
      var schema = TILE_SCHEMA[t];
      ctx2.fillStyle = schema ? schema.color : '#ff00ff';
      ctx2.fillRect(offX + x * cell, offY + y * cell, cell, cell);
    }
  }
}

function doCopySelection() {
  var sel = getSelectionRect();
  if (!sel || !currentFloor) {
    showCopyToast('Nothing selected — use Lasso first');
    return;
  }
  CLIPBOARD.tiles = readTilesFromSelection(sel);
  CLIPBOARD.w = sel.w;
  CLIPBOARD.h = sel.h;
  CLIPBOARD.source = sel.floating ? 'lasso-floating' : 'lasso';
  CLIPBOARD.sourceFloorId = currentFloorId;
  CLIPBOARD.sourceFloorName = FLOOR_NAMES[currentFloorId] || currentFloorId;
  updateClipboardBadge();
  showCopyToast('Copied ' + sel.w + '×' + sel.h + ' from floor "' + currentFloorId + '"');
}

function doCutSelection() {
  var sel = getSelectionRect();
  if (!sel || !currentFloor) {
    showCopyToast('Nothing selected — use Lasso first');
    return;
  }
  CLIPBOARD.tiles = readTilesFromSelection(sel);
  CLIPBOARD.w = sel.w;
  CLIPBOARD.h = sel.h;
  CLIPBOARD.source = 'cut';
  CLIPBOARD.sourceFloorId = currentFloorId;
  CLIPBOARD.sourceFloorName = FLOOR_NAMES[currentFloorId] || currentFloorId;
  updateClipboardBadge();

  // If floating, just drop the lifted tiles (source area is already cleared).
  if (sel.floating && LASSO.floating) {
    LASSO.floating = null;
    LASSO.sel = null;
    // Record the clear-at-source that happened when the lasso lifted.
    // lassoStartDrag already mutated the grid; push a snapshot so undo restores it.
    // We snapshot the *current* grid (post-lift) — that's effectively the cut result.
    pushUndo({ type: 'lasso-move', oldGrid: snapshotGrid(currentFloor.grid), newGrid: snapshotGrid(currentFloor.grid) });
  } else {
    // Static selection — clear source area to fill tile via a bulk undo entry.
    var grid = currentFloor.grid;
    var fill = getResizeFill();
    var cells = [];
    for (var dy = 0; dy < sel.h; dy++) {
      for (var dx = 0; dx < sel.w; dx++) {
        var gy = sel.y + dy, gx = sel.x + dx;
        if (gy >= 0 && gy < grid.length && gx >= 0 && gx < grid[gy].length) {
          cells.push({ x: gx, y: gy, oldTile: grid[gy][gx] });
          grid[gy][gx] = fill;
        }
      }
    }
    if (cells.length) {
      pushUndo({ type: 'bulk', cells: cells, newTile: fill });
    }
    LASSO.sel = null;
  }
  updateEditUI();
  draw();
  showCopyToast('Cut ' + sel.w + '×' + sel.h + ' (' + (sel.w * sel.h) + ' cells)');
}

function stampClipboardAt(gx, gy) {
  // Stamps CLIPBOARD at (gx,gy) as top-left; writes a single bulk undo entry.
  if (!CLIPBOARD.tiles || !currentFloor) return;
  var grid = currentFloor.grid;
  var cells = [];
  for (var dy = 0; dy < CLIPBOARD.h; dy++) {
    for (var dx = 0; dx < CLIPBOARD.w; dx++) {
      var ty = gy + dy, tx = gx + dx;
      if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[ty].length) continue;
      var t = CLIPBOARD.tiles[dy][dx];
      if (grid[ty][tx] !== t) {
        cells.push({ x: tx, y: ty, oldTile: grid[ty][tx], newTile: t });
        grid[ty][tx] = t;
      }
    }
  }
  if (cells.length) {
    pushUndo({ type: 'bulk', cells: cells, newTile: null });
  }
  updateEditUI();
  draw();
  // Cross-floor toast: remind the designer where this block came from.
  if (CLIPBOARD.sourceFloorId && CLIPBOARD.sourceFloorId !== currentFloorId) {
    showCopyToast('Pasted ' + CLIPBOARD.w + '×' + CLIPBOARD.h + ' from floor "' + CLIPBOARD.sourceFloorId + '"');
  }
}

function doPasteAtHover() {
  if (!CLIPBOARD.tiles) {
    showCopyToast('Clipboard is empty — Copy or Cut first');
    return;
  }
  // Enter paste tool so the user can see the ghost and stamp with a click.
  selectTool('paste');
}

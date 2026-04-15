// ═══════════════════════════════════════════════════════════════
//  bv-edit-state.js — Edit mode state + undo/redo for Blockout Visualizer
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-tile-schema.js, bv-floor-data.js
//
//  Exposes globals:
//    EDIT, LASSO, CLIPBOARD, HOVER, FLOOR_HISTORY  — edit-session state
//    snapshotGrid, countDirty                      — pure helpers
//    updateEditUI, updateDimDisplay                — UI sync
//    pushUndo, applyEntry, undoLast, redoLast, revertAll — undo plumbing
//
//  External refs (resolved at runtime via later modules):
//    draw()              — bv-render.js
//    resizeCanvas()      — bv-render.js
//    clearLasso()        — bv-lasso.js
// ═══════════════════════════════════════════════════════════════
'use strict';

var EDIT = {
  active: false,
  paintTile: 1,
  originalGrid: null,
  undoStack: [],        // entries: {type:'paint'|'bulk'|'resize'|'lasso-move', ...}
  redoStack: [],        // same shape as undoStack; cleared on any new edit
  dirtyCount: 0,
  painting: false,
  tool: 'paint',        // 'paint' | 'rect' | 'line' | 'bucket' | 'replace' | 'lasso'
  brushSize: 1,         // 1 | 2 | 3 | 5
  stroke: null,         // accumulator for a single brush drag: {seen:{"x,y":true}, cells:[{x,y,oldTile}]}
  dragPreview: null     // {type:'rect'|'line', x0,y0,x1,y1, outline:bool} while rect/line drag
};

// ── Lasso state ──
var LASSO = {
  selecting: false,     // currently dragging a selection rect
  startGX: 0, startGY: 0,
  sel: null,            // {x,y,w,h} grid-coords of selected region, or null
  floating: null,       // {tiles:[][], origX, origY, curX, curY} — lifted tiles being dragged
  dragging: false,
  dragOffX: 0, dragOffY: 0
};

// ── Clipboard (in-memory; used by Copy/Cut/Paste tools) ──
var CLIPBOARD = {
  tiles: null,       // 2D array [y][x] of tile ids, or null if empty
  w: 0, h: 0,
  source: null,      // 'lasso'|'lasso-floating'|'cut'
  sourceFloorId: null,      // floor id the block was copied from
  sourceFloorName: null     // human-readable floor name (for the status badge)
};
// Track last hovered grid cell so paste ghost follows the cursor.
var HOVER = { gx: 0, gy: 0 };

// Per-floor history — {floorId: {undo:[], redo:[], originalGrid:[][]}}
// Lets the designer hop between floors without losing their undo chain.
var FLOOR_HISTORY = {};

function snapshotGrid(grid) {
  return grid.map(function(row) { return row.slice(); });
}

function countDirty() {
  if (!EDIT.originalGrid || !currentFloor) return 0;
  var count = 0, orig = EDIT.originalGrid, grid = currentFloor.grid;
  for (var y = 0; y < grid.length; y++) {
    for (var x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== (orig[y] ? orig[y][x] : -1)) count++;
    }
  }
  // Also count dimension changes
  if (grid.length !== orig.length) count += Math.abs(grid.length - orig.length) * (grid[0] ? grid[0].length : 0);
  if (grid[0] && orig[0] && grid[0].length !== orig[0].length) count += Math.abs(grid[0].length - orig[0].length) * grid.length;
  return count;
}

function updateEditUI() {
  EDIT.dirtyCount = countDirty();
  var el = document.getElementById('edit-count');
  if (EDIT.dirtyCount > 0) { el.textContent = EDIT.dirtyCount + ' changed'; el.style.display = 'inline'; }
  else { el.style.display = 'none'; }
  // Mirror into the info-bar status cell so dirty count is visible even
  // when the toolbar is busy. '0' when clean so the cell never goes blank.
  var ibDirty = document.getElementById('ib-dirty');
  if (ibDirty) {
    ibDirty.textContent = String(EDIT.dirtyCount || 0);
    ibDirty.style.color = EDIT.dirtyCount > 0 ? '#f88' : '#666';
  }

  var undoBtn = document.getElementById('btn-undo');
  var redoBtn = document.getElementById('btn-redo');
  undoBtn.style.display = EDIT.active ? 'inline-block' : 'none';
  redoBtn.style.display = EDIT.active ? 'inline-block' : 'none';
  undoBtn.disabled = EDIT.undoStack.length === 0;
  redoBtn.disabled = EDIT.redoStack.length === 0;
  undoBtn.style.opacity = undoBtn.disabled ? '0.4' : '1';
  redoBtn.style.opacity = redoBtn.disabled ? '0.4' : '1';
  document.getElementById('tool-row').style.display = EDIT.active ? 'inline' : 'none';
  document.getElementById('btn-revert').style.display = (EDIT.active && EDIT.dirtyCount > 0) ? 'inline-block' : 'none';
  var rb = document.getElementById('resize-bar');
  var wasShown = rb.style.display === 'flex';
  rb.style.display = EDIT.active ? 'flex' : 'none';
  // Toggling the resize bar changes canvas-wrap height — re-size the
  // canvas so the grid doesn't stay squished or float over empty space.
  if (wasShown !== (EDIT.active === true) && typeof resizeCanvas === 'function') {
    requestAnimationFrame(resizeCanvas);
  }

  var ps = TILE_SCHEMA[EDIT.paintTile];
  document.getElementById('ib-paint').textContent = EDIT.active ? (ps ? ps.name + ' (' + EDIT.paintTile + ')' : String(EDIT.paintTile)) : '--';
  var TOOL_LABELS = { paint:'Paint', rect:'Rect', line:'Line', bucket:'Fill', replace:'Replace', lasso:'Lasso', paste:'Paste' };
  document.getElementById('ib-tool').textContent = EDIT.active ? (TOOL_LABELS[EDIT.tool] || EDIT.tool) : '--';

  // Highlight the active tool button
  ['paint','rect','line','bucket','replace','paste'].forEach(function(t) {
    var b = document.getElementById('btn-tool-' + t);
    if (b) b.classList.toggle('tool-active', EDIT.tool === t);
  });
  document.getElementById('btn-lasso').classList.toggle('tool-active', EDIT.tool === 'lasso');
  document.getElementById('brush-size').value = String(EDIT.brushSize);

  updateDimDisplay();
}

function updateDimDisplay() {
  if (!currentFloor || !currentFloor.grid) return;
  var gw = currentFloor.grid[0] ? currentFloor.grid[0].length : 0;
  var gh = currentFloor.grid.length;
  document.getElementById('dim-display').textContent = gw + ' x ' + gh;
  document.getElementById('ib-grid').textContent = gw + ' x ' + gh;
  currentFloor.gridW = gw;
  currentFloor.gridH = gh;
}

// Every edit funnels through pushUndo so redo can replay it.
function pushUndo(entry) {
  EDIT.undoStack.push(entry);
  EDIT.redoStack.length = 0;  // any new edit invalidates redo
}

function applyEntry(entry, phase) {
  // phase: 'undo' restores old state, 'redo' restores new state.
  if (entry.type === 'paint') {
    var t = (phase === 'undo') ? entry.oldTile : entry.newTile;
    if (currentFloor.grid[entry.y]) currentFloor.grid[entry.y][entry.x] = t;
  } else if (entry.type === 'bulk') {
    for (var i = 0; i < entry.cells.length; i++) {
      var c = entry.cells[i];
      if (!currentFloor.grid[c.y]) continue;
      if (phase === 'undo') {
        currentFloor.grid[c.y][c.x] = c.oldTile;
      } else {
        // Prefer per-cell newTile (heterogeneous paste); fall back to uniform newTile.
        var nt = (c.newTile != null) ? c.newTile : entry.newTile;
        if (nt != null) currentFloor.grid[c.y][c.x] = nt;
      }
    }
  } else if (entry.type === 'resize' || entry.type === 'lasso-move') {
    var g = (phase === 'undo') ? entry.oldGrid : entry.newGrid;
    if (!g) return;
    currentFloor.grid = snapshotGrid(g);
    currentFloor.gridW = g[0] ? g[0].length : 0;
    currentFloor.gridH = g.length;
    // FIX #2: resize entries carry spawn/rooms/doorTargets/doorFaces
    // snapshots taken before and after the structural shift. Undo must
    // also rewind the metadata so door keys line up with the grid.
    if (entry.type === 'resize') {
      var meta = (phase === 'undo') ? entry.oldMeta : entry.newMeta;
      if (meta && typeof restoreFloorMetadata === 'function') {
        restoreFloorMetadata(currentFloor, meta);
      }
      if (typeof buildMetadataPanel === 'function' && typeof META !== 'undefined' && META.open) {
        buildMetadataPanel();
      }
    }
  }
}

function undoLast() {
  if (EDIT.undoStack.length === 0) return;
  var entry = EDIT.undoStack.pop();
  applyEntry(entry, 'undo');
  EDIT.redoStack.push(entry);
  clearLasso();
  updateEditUI();
  draw();
}

function redoLast() {
  if (EDIT.redoStack.length === 0) return;
  var entry = EDIT.redoStack.pop();
  applyEntry(entry, 'redo');
  EDIT.undoStack.push(entry);
  clearLasso();
  updateEditUI();
  draw();
}

function revertAll() {
  if (!EDIT.originalGrid || !currentFloor) return;
  currentFloor.grid = snapshotGrid(EDIT.originalGrid);
  currentFloor.gridW = currentFloor.grid[0] ? currentFloor.grid[0].length : 0;
  currentFloor.gridH = currentFloor.grid.length;
  EDIT.undoStack = [];
  EDIT.redoStack = [];
  clearLasso();
  updateEditUI();
  draw();
}

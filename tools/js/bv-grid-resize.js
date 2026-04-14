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

function resizeGrid(side, action) {
  if (!currentFloor || !currentFloor.grid) return;
  var grid = currentFloor.grid;
  var oldGrid = snapshotGrid(grid);
  var gw = grid[0] ? grid[0].length : 0;
  var gh = grid.length;
  var fill = getResizeFill();

  if (action === 'add') {
    if (side === 'col-r') {
      for (var y = 0; y < gh; y++) grid[y].push(fill);
    } else if (side === 'col-l') {
      for (var y = 0; y < gh; y++) grid[y].unshift(fill);
    } else if (side === 'row-b') {
      var row = []; for (var x = 0; x < gw; x++) row.push(fill);
      grid.push(row);
    } else if (side === 'row-t') {
      var row = []; for (var x = 0; x < gw; x++) row.push(fill);
      grid.unshift(row);
    }
  } else if (action === 'shrink') {
    if (side === 'col-r' && gw > 1) {
      for (var y = 0; y < gh; y++) grid[y].pop();
    } else if (side === 'col-l' && gw > 1) {
      for (var y = 0; y < gh; y++) grid[y].shift();
    } else if (side === 'row-b' && gh > 1) {
      grid.pop();
    } else if (side === 'row-t' && gh > 1) {
      grid.shift();
    }
  }

  currentFloor.gridW = grid[0] ? grid[0].length : 0;
  currentFloor.gridH = grid.length;
  pushUndo({ type: 'resize', oldGrid: oldGrid, newGrid: snapshotGrid(currentFloor.grid) });
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

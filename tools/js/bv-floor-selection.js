// ═══════════════════════════════════════════════════════════════
//  bv-floor-selection.js — Floor list, sort, and active-floor switch
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-floor-data.js (FLOORS, currentFloor, currentFloorId),
//              bv-edit-state.js (EDIT, FLOOR_HISTORY, snapshotGrid,
//                                updateEditUI),
//              bv-lasso.js (clearLasso),
//              bv-clipboard.js (updateClipboardBadge),
//              bv-render.js (canvas, VIEW, cellPx, draw),
//              bv-tile-picker.js (buildTilePicker),
//              bv-legend.js (buildLegend)
//
//  Exposes globals:
//    FLOOR_NAMES, sortFloorIds, populateFloorSelect, selectFloor
// ═══════════════════════════════════════════════════════════════
'use strict';

var FLOOR_NAMES = {
  '0':'The Approach','1':'The Promenade','1.1':'Coral Bazaar','1.2':'Driftwood Inn',
  '1.3':'Cellar Entrance','1.6':"Gleaner's Home",'1.3.1':'Soft Cellar',
  '2':'Lantern Row','2.1':"Dispatcher's Office",'2.2':"Watchman's Post",
  '2.2.1':"Hero's Wake B1",'2.2.2':"Hero's Wake B2",'2.3':"Armorer's Workshop",
  '2.4':"Chandler's Shop",'2.5':'The Apothecary','2.6':'The Cartographer',
  '2.7':'The Tea House','3':'The Garrison','3.1':'Armory/Barracks','3.2':"Quartermaster's Shop"
};

function sortFloorIds(ids) {
  return ids.sort(function(a,b) {
    var pa=a.split('.').map(Number), pb=b.split('.').map(Number);
    for (var i=0; i<Math.max(pa.length,pb.length); i++) { var va=pa[i]||0, vb=pb[i]||0; if (va!==vb) return va-vb; }
    return 0;
  });
}

function populateFloorSelect() {
  var sel = document.getElementById('floor-select');
  sel.innerHTML = '';
  var ids = sortFloorIds(Object.keys(FLOORS));
  ids.forEach(function(id) {
    var opt = document.createElement('option');
    opt.value = id;
    var depth = id.split('.').length;
    var prefix = depth===1?'':depth===2?'  ':'    ';
    opt.textContent = prefix + '"' + id + '" - ' + (FLOOR_NAMES[id]||id);
    sel.appendChild(opt);
  });
  selectFloor(ids[0]);
}

function selectFloor(id) {
  // Park the outgoing floor's history under its ID before switching.
  if (currentFloorId && currentFloor) {
    FLOOR_HISTORY[currentFloorId] = {
      undo: EDIT.undoStack,
      redo: EDIT.redoStack,
      originalGrid: EDIT.originalGrid
    };
  }
  currentFloorId = id;
  currentFloor = FLOORS[id];
  if (!currentFloor) return;
  document.getElementById('floor-select').value = id;

  // Restore this floor's history, or initialize fresh.
  var h = FLOOR_HISTORY[id];
  if (h) {
    EDIT.undoStack = h.undo;
    EDIT.redoStack = h.redo;
    EDIT.originalGrid = h.originalGrid;
  } else {
    EDIT.originalGrid = snapshotGrid(currentFloor.grid);
    EDIT.undoStack = [];
    EDIT.redoStack = [];
  }
  clearLasso();

  var gw = currentFloor.grid[0] ? currentFloor.grid[0].length : 0;
  var gh = currentFloor.grid.length;
  currentFloor.gridW = gw;
  currentFloor.gridH = gh;
  document.getElementById('ib-grid').textContent = gw + ' x ' + gh;
  document.getElementById('ib-floor').textContent = '"' + id + '" ' + (FLOOR_NAMES[id] || '');
  updateClipboardBadge();

  var cw = canvas.width, ch = canvas.height;
  VIEW.zoom = Math.max(0.3, Math.min(3.0, Math.min((cw*.85)/(gw*VIEW.cellSize), (ch*.85)/(gh*VIEW.cellSize))));
  var cp = cellPx();
  VIEW.panX = (cw - gw*cp)/2; VIEW.panY = (ch - gh*cp)/2;
  document.getElementById('zoom-display').textContent = VIEW.zoom.toFixed(1) + 'x';

  updateEditUI();
  buildLegend();
  buildTilePicker();
  draw();
}

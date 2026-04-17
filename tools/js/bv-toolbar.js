// ═══════════════════════════════════════════════════════════════
//  bv-toolbar.js — Toolbar button wiring + keyboard shortcuts
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-edit-state.js (EDIT, LASSO, updateEditUI, snapshotGrid,
//                                undoLast, redoLast, revertAll),
//              bv-floor-data.js (FLOORS, currentFloor),
//              bv-floor-selection.js (selectFloor),
//              bv-render.js (VIEW, draw),
//              bv-interaction.js (updateCursor),
//              bv-tile-picker.js (buildTilePicker),
//              bv-lasso.js (clearLasso, lassoCommit),
//              bv-clipboard.js (CLIPBOARD, doCopySelection, doCutSelection,
//                               stampClipboardAt, doPasteAtHover),
//              bv-clipboard-utils.js (doCopyFull, doCopyDiff),
//              bv-save-patcher.js (prepareSaveCurrentFloor, requestEngineDir,
//                                  closeSaveModal, confirmSaveWrite,
//                                  downloadPendingSave, FS_API_AVAILABLE,
//                                  ENGINE_DIR_HANDLE),
//              bv-grid-resize.js (resizeGrid, populateResizeFill)
//
//  MUST load AFTER DOM ready.
//
//  Exposes globals:
//    selectTool(), buildQuickbar(), window.__clipboardSmokeTest
// ═══════════════════════════════════════════════════════════════
'use strict';

document.getElementById('floor-select').addEventListener('change', function() { selectFloor(this.value); });

// FIX #3: single source of truth for entering/exiting edit mode.
// The button handler and the `e` keyboard shortcut previously diverged —
// the button toggled CSS/text/cursor/tile-picker but never snapshotted
// EDIT.originalGrid (so the dirty-cell highlight never worked when you
// entered edit via the button), and the `e` key snapshotted but never
// updated the button's CSS/text/cursor/tile-picker. Route both paths
// through this helper so they always do the same thing.
function toggleEditMode(force) {
  var next = (force === undefined) ? !EDIT.active : !!force;
  if (next === EDIT.active) return;  // no-op if already in desired state
  EDIT.active = next;
  if (EDIT.active) {
    // Snapshot the on-disk grid so the dirty-cell highlight has a
    // baseline to compare against.
    if (currentFloor && currentFloor.grid) {
      EDIT.originalGrid = snapshotGrid(currentFloor.grid);
    }
  } else {
    EDIT.tool = 'paint';
    clearLasso();
  }
  var btn = document.getElementById('btn-edit');
  if (btn) {
    btn.classList.toggle('edit-active', EDIT.active);
    btn.textContent = EDIT.active ? 'Edit ON' : 'Edit';
  }
  if (typeof updateCursor === 'function')    updateCursor();
  if (typeof buildTilePicker === 'function') buildTilePicker();
  if (typeof buildRequiredPanel === 'function') buildRequiredPanel();
  if (typeof buildQuickbar === 'function') buildQuickbar();
  updateEditUI();
  draw();
}

document.getElementById('btn-edit').addEventListener('click', function() {
  toggleEditMode();
});

// ── Quickbar — compact tile buttons in the toolbar ──────────────
// Two banks: base (keys 0-9) and Shift (Shift+0-9).
// Shows a row of small colored squares with key labels for instant tile picking.
var _QB_BASE  = [
  { id: 0,  key: '0', label: 'E' },   // EMPTY
  { id: 1,  key: '1', label: '#' },   // WALL
  { id: 34, key: '2', label: ',' },   // GRASS
  { id: 32, key: '3', label: '=' },   // ROAD
  { id: 33, key: '4', label: ':' },   // PATH
  { id: 21, key: '5', label: 'Y' },   // TREE
  { id: 22, key: '6', label: 'h' },   // SHRUB
  { id: 30, key: '7', label: 'i' },   // TORCH_LIT
  { id: 10, key: '8', label: 'O' },   // PILLAR
  { id: 65, key: '9', label: '@' }    // CANOPY
];
var _QB_INFRA = [
  { id: 40, key: '⇧0', label: 'W' },  // WELL
  { id: 41, key: '⇧1', label: '_' },  // BENCH
  { id: 42, key: '⇧2', label: 'N' },  // NOTICE_BOARD
  { id: 43, key: '⇧3', label: 'A' },  // ANVIL
  { id: 44, key: '⇧4', label: 'Q' },  // BARREL
  { id: 45, key: '⇧5', label: 'Z' },  // CHARGING_CRADLE
  { id: 46, key: '⇧6', label: '~' },  // SWITCHBOARD
  { id: 47, key: '⇧7', label: 'U' },  // SOUP_KITCHEN
  { id: 48, key: '⇧8', label: '-' },  // COT
  { id: 49, key: '⇧9', label: 'r' }   // ROOST
];
var _qbBank = 'base'; // 'base' or 'infra'

function buildQuickbar() {
  var el = document.getElementById('quickbar');
  if (!el) return;
  if (!EDIT.active) { el.style.display = 'none'; return; }
  el.style.display = 'inline-flex';
  var bank = _qbBank === 'infra' ? _QB_INFRA : _QB_BASE;
  var html = '<button class="qb-bank" id="qb-toggle-bank" title="Switch bank (Tab)">' +
             (_qbBank === 'infra' ? 'Infra' : 'Base') + '</button>';
  for (var i = 0; i < bank.length; i++) {
    var t = bank[i];
    var s = TILE_SCHEMA[t.id];
    if (!s) continue;
    var sel = t.id === EDIT.paintTile ? ' qb-sel' : '';
    html += '<span class="qb-tile' + sel + '" data-tile="' + t.id + '" ' +
            'style="background:' + s.color + ';" ' +
            'title="' + s.name + ' [' + t.key + ']">' +
            '<span class="qb-key">' + t.key.replace('⇧', '') + '</span></span>';
  }
  el.innerHTML = html;
  // Wire clicks
  el.querySelectorAll('.qb-tile').forEach(function(tile) {
    tile.addEventListener('click', function() {
      EDIT.paintTile = parseInt(this.dataset.tile);
      tilePickerTrackRecent(EDIT.paintTile);
      updateEditUI();
      buildQuickbar();
      buildTilePicker();
    });
  });
  var bankBtn = document.getElementById('qb-toggle-bank');
  if (bankBtn) {
    bankBtn.addEventListener('click', function() {
      _qbBank = _qbBank === 'infra' ? 'base' : 'infra';
      buildQuickbar();
    });
  }
}

function selectTool(tool) {
  if (!EDIT.active) return;
  // Commit any floating lasso selection when switching away from lasso.
  if (EDIT.tool === 'lasso' && tool !== 'lasso' && LASSO.floating) lassoCommit();
  if (tool !== 'lasso') clearLasso();
  if (EDIT.dragPreview) EDIT.dragPreview = null;
  EDIT.tool = tool;
  updateEditUI();
  updateCursor();
  draw();
}

['paint','rect','line','bucket','replace','paste'].forEach(function(t) {
  var btn = document.getElementById('btn-tool-' + t);
  if (btn) btn.addEventListener('click', function() { selectTool(t); });
});

// Populate the resize-bar Fill tile dropdown (defined earlier, called here once on load).
if (typeof populateResizeFill === 'function') populateResizeFill();

document.getElementById('btn-lasso').addEventListener('click', function() {
  if (EDIT.tool === 'lasso') {
    if (LASSO.floating) lassoCommit();
    selectTool('paint');
  } else {
    selectTool('lasso');
  }
});

document.getElementById('brush-size').addEventListener('change', function() {
  EDIT.brushSize = parseInt(this.value, 10) || 1;
  updateEditUI();
});

document.getElementById('btn-undo').addEventListener('click', undoLast);
document.getElementById('btn-redo').addEventListener('click', redoLast);
document.getElementById('btn-revert').addEventListener('click', function() {
  if (confirm('Revert all changes on this floor?')) revertAll();
});
document.getElementById('btn-copy').addEventListener('click', doCopySelection);
document.getElementById('clipboard-badge').addEventListener('click', function() {
  if (CLIPBOARD.sourceFloorId && FLOORS[CLIPBOARD.sourceFloorId]) {
    selectFloor(CLIPBOARD.sourceFloorId);
  }
});
document.getElementById('btn-cut').addEventListener('click', doCutSelection);
document.getElementById('btn-copy-full').addEventListener('click', doCopyFull);
document.getElementById('btn-copy-diff').addEventListener('click', doCopyDiff);
document.getElementById('btn-save').addEventListener('click', prepareSaveCurrentFloor);
document.getElementById('btn-save-dir').addEventListener('click', requestEngineDir);
// Save-modal markup lives AFTER the closing script tag — wire its
// buttons on DOMContentLoaded (or immediately if already parsed).
function wireSaveModal() {
  var c  = document.getElementById('save-cancel');
  var w  = document.getElementById('save-confirm');
  var dl = document.getElementById('save-download');
  if (c)  c.addEventListener('click',  closeSaveModal);
  if (w)  w.addEventListener('click',  confirmSaveWrite);
  if (dl) dl.addEventListener('click', downloadPendingSave);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireSaveModal);
} else {
  wireSaveModal();
}
// Show the directory-pick button up-front if the API is supported but no handle yet.
if (FS_API_AVAILABLE) {
  document.getElementById('btn-save-dir').style.display = ENGINE_DIR_HANDLE ? 'none' : 'inline-block';
}

function toggleBtn(id, prop) {
  var btn = document.getElementById(id);
  btn.addEventListener('click', function() {
    VIEW[prop] = !VIEW[prop];
    btn.classList.toggle('active', VIEW[prop]);
    if (prop === 'showLegend') document.getElementById('legend-panel').style.display = VIEW.showLegend ? 'block' : 'none';
    draw();
  });
}
toggleBtn('btn-grid','showGrid'); toggleBtn('btn-rooms','showRooms');
toggleBtn('btn-doors','showDoors'); toggleBtn('btn-ids','showIDs');
toggleBtn('btn-legend','showLegend');

// Resize buttons
['col-shrink-l','col-add-l','col-add-r','col-shrink-r','row-shrink-t','row-add-t','row-add-b','row-shrink-b'].forEach(function(id) {
  var parts = id.split('-');
  var action = parts[0] === 'col' ? parts[1] : parts[1]; // add or shrink
  var side = parts[0] + '-' + parts[2]; // col-l, col-r, row-t, row-b
  document.getElementById('btn-' + id).addEventListener('click', function() {
    resizeGrid(side, action);
  });
});

// Keyboard shortcuts
window.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'g') document.getElementById('btn-grid').click();
  if (e.key === 'r' && !EDIT.active) document.getElementById('btn-rooms').click();
  if (e.key === 'd' && !EDIT.active) document.getElementById('btn-doors').click();
  if (e.key === 'i' && !EDIT.active) document.getElementById('btn-ids').click();
  if (e.key === 'l' && !EDIT.active) document.getElementById('btn-legend').click();
  if (e.key === 'e') { toggleEditMode(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); prepareSaveCurrentFloor(); }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undoLast(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) { e.preventDefault(); redoLast(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c' && EDIT.active) { e.preventDefault(); doCopySelection(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'x' && EDIT.active) { e.preventDefault(); doCutSelection(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'v' && EDIT.active) { e.preventDefault(); doPasteAtHover(); }
  if (e.key === 'Escape' && document.getElementById('save-modal').classList.contains('open')) { closeSaveModal(); return; }
  if (e.key === 'Escape' && LASSO.floating) { clearLasso(); draw(); }
  if (e.key === 'Enter' && LASSO.floating) { lassoCommit(); draw(); }
  // Tab toggles quickbar bank
  if (e.key === 'Tab' && EDIT.active) {
    e.preventDefault();
    _qbBank = _qbBank === 'infra' ? 'base' : 'infra';
    buildQuickbar();
    return;
  }
  // Tool shortcuts (edit mode only — override base-view bindings like 'r' for Rooms).
  if (EDIT.active) {
    if (e.key === 'p') { selectTool('paint');   return; }
    if (e.key === 'r') { selectTool('rect');    return; }
    if (e.key === 'n') { selectTool('line');    return; }
    if (e.key === 'f') { selectTool('bucket');  return; }
    if (e.key === 'x') { selectTool('replace'); return; }
    if (e.key === 'v') { doPasteAtHover(); return; }
    if (e.key === '[') {
      var sizes = [1,2,3,5]; var i = sizes.indexOf(EDIT.brushSize);
      EDIT.brushSize = sizes[Math.max(0, i-1)]; updateEditUI(); return;
    }
    if (e.key === ']') {
      var sizes2 = [1,2,3,5]; var j = sizes2.indexOf(EDIT.brushSize);
      EDIT.brushSize = sizes2[Math.min(sizes2.length-1, j+1)]; updateEditUI(); return;
    }
  }
  if (EDIT.active && /^[0-9]$/.test(e.key)) {
    var ix = parseInt(e.key, 10);
    if (e.shiftKey) {
      // Shift+0–9: infrastructure & creature tiles
      // 0=WELL 1=BENCH 2=NOTICE_BOARD 3=ANVIL 4=BARREL
      // 5=CHARGING_CRADLE 6=SWITCHBOARD 7=SOUP_KITCHEN 8=COT 9=ROOST
      var infraQs = [40,41,42,43,44,45,46,47,48,49];
      if (infraQs[ix] != null) { EDIT.paintTile = infraQs[ix]; _qbBank = 'infra'; updateEditUI(); buildQuickbar(); buildTilePicker(); }
    } else {
      // 0–9: core tiles
      var qs = [0,1,34,32,33,21,22,30,10,65];
      if (qs[ix] != null) { EDIT.paintTile = qs[ix]; _qbBank = 'base'; updateEditUI(); buildQuickbar(); buildTilePicker(); }
    }
  }
});

// Dev-only smoke test: verifies copy → floor switch → paste.
// Usage from devtools: __clipboardSmokeTest('1', '1.3.1')
window.__clipboardSmokeTest = function(srcId, dstId) {
  srcId = srcId || Object.keys(FLOORS)[0];
  var dstCandidates = Object.keys(FLOORS).filter(function(k){ return k !== srcId; });
  dstId = dstId || dstCandidates[0];
  if (!FLOORS[srcId] || !FLOORS[dstId]) { console.error('bad floor ids'); return false; }
  selectFloor(srcId);
  EDIT.active = true;
  LASSO.sel = { x:0, y:0, w:2, h:2 };
  var srcTiles = [
    [FLOORS[srcId].grid[0][0], FLOORS[srcId].grid[0][1]],
    [FLOORS[srcId].grid[1][0], FLOORS[srcId].grid[1][1]]
  ];
  doCopySelection();
  console.log('[smoke] copied from', srcId, 'dims', CLIPBOARD.w+'x'+CLIPBOARD.h, 'source:', CLIPBOARD.sourceFloorId);
  selectFloor(dstId);
  console.log('[smoke] switched to', dstId, '— clipboard still present:', !!CLIPBOARD.tiles);
  stampClipboardAt(0, 0);
  var match = true;
  for (var y = 0; y < 2; y++) for (var x = 0; x < 2; x++) {
    if (FLOORS[dstId].grid[y][x] !== srcTiles[y][x]) match = false;
  }
  console.log('[smoke] paste', match ? 'OK — cells match source' : 'FAILED');
  undoLast(); // clean up the smoke-test stamp
  return match;
};

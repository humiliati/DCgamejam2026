// ═══════════════════════════════════════════════════════════════
//  bv-scenes.js — Tier 4 WINDOW-SCENE editor (sub-grids behind
//                 WINDOW_* / PORTHOLE / ARCH_DOORWAY tiles)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-tile-schema.js (TILE_SCHEMA),
//              bv-floor-data.js (FLOORS, currentFloor, currentFloorId),
//              bv-floor-selection.js (selectFloor, FLOOR_NAMES),
//              bv-edit-state.js (EDIT),
//              bv-clipboard.js (CLIPBOARD),
//              bv-clipboard-utils.js (showCopyToast)
//
//  MUST load AFTER bv-floor-selection.js (monkey-patches selectFloor).
//  The #scene-modal DOM lives after the script block, so modal wiring
//  is deferred to DOMContentLoaded.
//
//  Exposes globals:
//    WINDOW_SCENES, SCENE_DEFAULT_W, SCENE_DEFAULT_H, SCENE_EDIT,
//    isWindowLikeTile, parentFloorIdOf, windowSceneKey,
//    listWindowsOnFloor, getOrCreateWindowScene, buildWindowsPanel,
//    openSceneEditor, closeSceneEditor, refreshSceneEditor,
//    renderSceneCanvas, sceneCellAt, scenePaint, sceneResize,
//    sceneStampFromClipboard, sceneClear, sceneJumpToParent,
//    exportWindowScenes, window.__windowSceneSmokeTest
// ═══════════════════════════════════════════════════════════════
'use strict';

var WINDOW_SCENES = {};   // key "floorId|x,y" → {w,h,tiles:[[...]],parentFloorId,tileId,facing}
var SCENE_DEFAULT_W = 8;
var SCENE_DEFAULT_H = 6;
var SCENE_EDIT = { open:false, key:null, floorId:null, x:0, y:0, tileId:0, painting:false };

function isWindowLikeTile(tileId) {
  var info = TILE_SCHEMA[tileId];
  if (!info) return false;
  // Prefer schema predicate if loaded from tile-schema.json
  if (info.isWindow === true) return true;
  var n = (info.name || '').toUpperCase();
  return n.indexOf('WINDOW_') === 0 || n === 'PORTHOLE' || n === 'ARCH_DOORWAY';
}

function parentFloorIdOf(floorId) {
  if (!floorId) return null;
  var i = floorId.lastIndexOf('.');
  return i < 0 ? null : floorId.substring(0, i);
}

function windowSceneKey(floorId, x, y) { return floorId + '|' + x + ',' + y; }

function listWindowsOnFloor(floor, floorId) {
  var out = [];
  if (!floor || !floor.grid) return out;
  var g = floor.grid;
  for (var y = 0; y < g.length; y++) {
    var row = g[y]; if (!row) continue;
    for (var x = 0; x < row.length; x++) {
      var t = row[x];
      if (isWindowLikeTile(t)) out.push({ x:x, y:y, tileId:t, key:windowSceneKey(floorId, x, y) });
    }
  }
  return out;
}

function getOrCreateWindowScene(floorId, x, y, tileId) {
  var key = windowSceneKey(floorId, x, y);
  if (WINDOW_SCENES[key]) return WINDOW_SCENES[key];
  var w = SCENE_DEFAULT_W, h = SCENE_DEFAULT_H;
  var tiles = [];
  for (var iy = 0; iy < h; iy++) {
    var row = []; for (var ix = 0; ix < w; ix++) row.push(0);
    tiles.push(row);
  }
  WINDOW_SCENES[key] = {
    w: w, h: h, tiles: tiles,
    parentFloorId: parentFloorIdOf(floorId),
    tileId: tileId,
    facing: null   // populated later once engine consumes scenes
  };
  return WINDOW_SCENES[key];
}

function buildWindowsPanel() {
  var el = document.getElementById('windows-panel');
  if (!el) return;
  if (!currentFloor || !currentFloorId) { el.className = ''; el.innerHTML = ''; return; }
  var windows = listWindowsOnFloor(currentFloor, currentFloorId);
  if (!windows.length) { el.className = ''; el.innerHTML = ''; return; }
  el.className = 'has-windows';
  var depth = currentFloorId.split('.').length;
  var parts = ['<div class="wp-title">WINDOWS (' + windows.length + ')</div>'];
  parts.push('<div class="wp-empty">depth ' + depth + (depth >= 2 ? ' — interior' : ' — exterior (facades)') + '</div>');
  windows.forEach(function(w) {
    var info = TILE_SCHEMA[w.tileId] || {};
    var hasScene = !!WINDOW_SCENES[w.key];
    parts.push(
      '<div class="wp-row" data-key="' + w.key + '" data-x="' + w.x + '" data-y="' + w.y + '" data-tile="' + w.tileId + '">' +
        '<div class="wp-swatch" style="background:' + (info.color || '#999') + '"></div>' +
        '<div class="wp-coord">(' + w.x + ',' + w.y + ')</div>' +
        '<div class="wp-name' + (hasScene ? ' wp-has-scene' : '') + '">' + (info.name || '?') + (hasScene ? ' ●' : '') + '</div>' +
      '</div>'
    );
  });
  el.innerHTML = parts.join('');
  // Wire clicks
  var rows = el.querySelectorAll('.wp-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].addEventListener('click', function(ev) {
      var row = ev.currentTarget;
      openSceneEditor(currentFloorId,
        parseInt(row.getAttribute('data-x'), 10),
        parseInt(row.getAttribute('data-y'), 10),
        parseInt(row.getAttribute('data-tile'), 10));
    });
  }
}

function openSceneEditor(floorId, x, y, tileId) {
  var scene = getOrCreateWindowScene(floorId, x, y, tileId);
  SCENE_EDIT.open = true;
  SCENE_EDIT.key = windowSceneKey(floorId, x, y);
  SCENE_EDIT.floorId = floorId;
  SCENE_EDIT.x = x; SCENE_EDIT.y = y; SCENE_EDIT.tileId = tileId;
  var info = TILE_SCHEMA[tileId] || {};
  document.getElementById('sm-heading').textContent = 'Window scene — ' + (info.name || 'window');
  document.getElementById('sm-sub').textContent =
    'floor "' + floorId + '" @ (' + x + ',' + y + ')';
  document.getElementById('scene-modal').classList.add('open');
  refreshSceneEditor();
}

function closeSceneEditor() {
  SCENE_EDIT.open = false;
  document.getElementById('scene-modal').classList.remove('open');
  // Rebuild panel to reflect "has scene" indicator
  buildWindowsPanel();
}

function refreshSceneEditor() {
  if (!SCENE_EDIT.open) return;
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene) return;
  document.getElementById('sm-dims').textContent = scene.w + ' × ' + scene.h;
  var pi = TILE_SCHEMA[EDIT.paintTile] || {};
  document.getElementById('sm-paint-info').innerHTML =
    '<span style="display:inline-block;width:10px;height:10px;vertical-align:middle;' +
    'background:' + (pi.color||'#999') + ';border:1px solid #555;margin-right:4px;"></span>' +
    (pi.name || '?') + ' (' + EDIT.paintTile + ')';
  var parentLabel = scene.parentFloorId
    ? '"' + scene.parentFloorId + '" ' + (FLOOR_NAMES[scene.parentFloorId] || '(missing)')
    : '(none — this floor has no parent)';
  document.getElementById('sm-parent-info').textContent = parentLabel;
  document.getElementById('sm-jump-parent').disabled = !scene.parentFloorId || !FLOORS[scene.parentFloorId];
  var clipLabel = CLIPBOARD.tiles
    ? CLIPBOARD.w + '×' + CLIPBOARD.h + ' from floor "' + (CLIPBOARD.sourceFloorId || '?') + '"'
    : '(empty — copy a region first with lasso + Ctrl+C)';
  document.getElementById('sm-clip-info').textContent = clipLabel;
  document.getElementById('sm-stamp-clip').disabled = !CLIPBOARD.tiles;
  renderSceneCanvas();
}

function renderSceneCanvas() {
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene) return;
  var cv = document.getElementById('scene-canvas');
  var ctx = cv.getContext('2d');
  // Fit cell to canvas
  var cs = Math.floor(Math.min(cv.width / scene.w, cv.height / scene.h));
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, cv.width, cv.height);
  var ox = Math.floor((cv.width  - cs * scene.w) / 2);
  var oy = Math.floor((cv.height - cs * scene.h) / 2);
  for (var y = 0; y < scene.h; y++) {
    for (var x = 0; x < scene.w; x++) {
      var t = scene.tiles[y][x];
      var info = TILE_SCHEMA[t] || { color: '#222' };
      ctx.fillStyle = info.color;
      ctx.fillRect(ox + x*cs, oy + y*cs, cs, cs);
      ctx.strokeStyle = '#0008';
      ctx.strokeRect(ox + x*cs + 0.5, oy + y*cs + 0.5, cs-1, cs-1);
    }
  }
  // Store draw origin for click mapping
  cv._origin = { ox: ox, oy: oy, cs: cs, w: scene.w, h: scene.h };
}

function sceneCellAt(mx, my) {
  var cv = document.getElementById('scene-canvas');
  if (!cv._origin) return null;
  var r = cv.getBoundingClientRect();
  var px = (mx - r.left) * (cv.width / r.width);
  var py = (my - r.top)  * (cv.height / r.height);
  var o = cv._origin;
  var gx = Math.floor((px - o.ox) / o.cs);
  var gy = Math.floor((py - o.oy) / o.cs);
  if (gx < 0 || gy < 0 || gx >= o.w || gy >= o.h) return null;
  return { x: gx, y: gy };
}

function scenePaint(mx, my, erase) {
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene) return;
  var c = sceneCellAt(mx, my);
  if (!c) return;
  var t = erase ? 0 : EDIT.paintTile;
  if (scene.tiles[c.y][c.x] === t) return;
  scene.tiles[c.y][c.x] = t;
  renderSceneCanvas();
}

function sceneResize(dw, dh) {
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene) return;
  var nw = Math.max(1, Math.min(24, scene.w + dw));
  var nh = Math.max(1, Math.min(24, scene.h + dh));
  if (nw === scene.w && nh === scene.h) return;
  var newTiles = [];
  for (var y = 0; y < nh; y++) {
    var row = [];
    for (var x = 0; x < nw; x++) {
      row.push((y < scene.h && x < scene.w) ? scene.tiles[y][x] : 0);
    }
    newTiles.push(row);
  }
  scene.tiles = newTiles;
  scene.w = nw; scene.h = nh;
  refreshSceneEditor();
}

function sceneStampFromClipboard() {
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene || !CLIPBOARD.tiles) return;
  var copied = 0;
  for (var y = 0; y < CLIPBOARD.h && y < scene.h; y++) {
    for (var x = 0; x < CLIPBOARD.w && x < scene.w; x++) {
      scene.tiles[y][x] = CLIPBOARD.tiles[y][x];
      copied++;
    }
  }
  renderSceneCanvas();
  showCopyToast('Stamped ' + copied + ' cells from clipboard');
}

function sceneClear() {
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene) return;
  for (var y = 0; y < scene.h; y++)
    for (var x = 0; x < scene.w; x++)
      scene.tiles[y][x] = 0;
  renderSceneCanvas();
}

function sceneJumpToParent() {
  var scene = WINDOW_SCENES[SCENE_EDIT.key];
  if (!scene || !scene.parentFloorId || !FLOORS[scene.parentFloorId]) return;
  // Keep scene modal open so designer can see the sub-grid while
  // lassoing on the parent floor. Re-bind the panel to the new floor.
  var savedKey = SCENE_EDIT.key;
  var savedFloorId = SCENE_EDIT.floorId;
  selectFloor(scene.parentFloorId);
  SCENE_EDIT.key = savedKey;
  SCENE_EDIT.floorId = savedFloorId;
  refreshSceneEditor();
  showCopyToast('Jumped to parent floor "' + scene.parentFloorId + '" — lasso + Ctrl+C, then Stamp clipboard');
}

function exportWindowScenes() {
  var out = { generated: new Date().toISOString(), scenes: {} };
  Object.keys(WINDOW_SCENES).forEach(function(k) {
    var s = WINDOW_SCENES[k];
    out.scenes[k] = {
      floorId: k.split('|')[0],
      at: k.split('|')[1],
      tileId: s.tileId,
      parentFloorId: s.parentFloorId,
      w: s.w, h: s.h,
      tiles: s.tiles
    };
  });
  var json = JSON.stringify(out, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'window-scenes.json';
  document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

// ── Scene modal wiring ──
// The #scene-modal DOM lives AFTER the closing script tag in the
// document, so we cannot wire its listeners synchronously — the
// elements don't exist yet at script-parse time. Defer to
// DOMContentLoaded (or run immediately if already parsed).
function wireSceneModal() {
  var cv = document.getElementById('scene-canvas');
  if (!cv) { console.warn('scene-modal DOM missing — Tier 4 window-scene editor disabled'); return; }
  cv.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  cv.addEventListener('mousedown', function(e) {
    SCENE_EDIT.painting = true;
    scenePaint(e.clientX, e.clientY, e.button === 2);
  });
  cv.addEventListener('mousemove', function(e) {
    if (SCENE_EDIT.painting) scenePaint(e.clientX, e.clientY, (e.buttons & 2) !== 0);
  });
  window.addEventListener('mouseup', function() { SCENE_EDIT.painting = false; });
  var byId = function(id) { return document.getElementById(id); };
  var attach = function(id, fn) { var el = byId(id); if (el) el.addEventListener('click', fn); };
  attach('sm-close',        closeSceneEditor);
  attach('sm-clear',        sceneClear);
  attach('sm-w-inc',        function() { sceneResize(+1, 0); });
  attach('sm-w-dec',        function() { sceneResize(-1, 0); });
  attach('sm-h-inc',        function() { sceneResize(0, +1); });
  attach('sm-h-dec',        function() { sceneResize(0, -1); });
  attach('sm-stamp-clip',   sceneStampFromClipboard);
  attach('sm-jump-parent',  sceneJumpToParent);
  attach('sm-export-json',  exportWindowScenes);
  // ESC closes
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && SCENE_EDIT.open) { closeSceneEditor(); }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireSceneModal);
} else {
  wireSceneModal();
}

// Expose for dev smoke-testing.
window.__windowSceneSmokeTest = function(floorId) {
  floorId = floorId || currentFloorId;
  var windows = listWindowsOnFloor(FLOORS[floorId], floorId);
  console.log('[scene-smoke] floor', floorId, 'windows:', windows.length);
  windows.slice(0, 3).forEach(function(w) {
    console.log('  ', w.x + ',' + w.y, (TILE_SCHEMA[w.tileId]||{}).name);
  });
  return windows;
};

// Patch selectFloor to refresh the windows panel — via a post-hook.
(function patchSelectFloorForWindows() {
  var original = selectFloor;
  selectFloor = function(id) {
    original.apply(this, arguments);
    buildWindowsPanel();
    if (SCENE_EDIT.open) refreshSceneEditor();
  };
})();

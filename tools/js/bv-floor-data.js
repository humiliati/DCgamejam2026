// ═══════════════════════════════════════════════════════════════
//  bv-floor-data.js — Floor data loader for Blockout Visualizer
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-tile-schema.js (loaded earlier; reassigns
//    TILE_SCHEMA / CAT_ORDER / CAT_LABELS when tile-schema.json
//    is present).
//
//  Exposes globals:
//    FLOORS           — map of floorId → floor data ({grid, meta, ...})
//    currentFloor     — reference to the currently-selected floor (set by
//                       selectFloor in bv-floor-selection.js)
//    currentFloorId   — string id of the currently-selected floor
//
//  External references (provided by later modules):
//    populateFloorSelect()   — bv-floor-selection.js
//    document.getElementById('canvas-wrap')  — markup in host HTML
// ═══════════════════════════════════════════════════════════════
'use strict';

var FLOORS = {};
var currentFloor = null;
var currentFloorId = null;

// Load live tile schema extracted from engine/tiles.js (Phase 3).
// Falls back to the hardcoded TILE_SCHEMA above if the file is missing.
async function loadTileSchema() {
  try {
    var resp = await fetch('tile-schema.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (!data.tiles) throw new Error('no tiles field');
    // Normalize: tile-schema.json stores {name,category,color,glyph,walk,opq,...}
    // Legacy TILE_SCHEMA uses {name,cat,color,glyph,walk,opq}. Merge both keys
    // so existing render code keeps working (reads .cat) and new code can use .category.
    var merged = {};
    Object.keys(data.tiles).forEach(function(id) {
      var t = data.tiles[id];
      merged[id] = Object.assign({}, t, { cat: t.category || t.cat });
    });
    TILE_SCHEMA = merged;
    if (Array.isArray(data.catOrder)) CAT_ORDER = data.catOrder;
    if (data.catLabels) CAT_LABELS = data.catLabels;
    console.log('Loaded tile schema: ' + data.tileCount + ' tiles, maxId ' + data.maxId + ' (generated ' + data.generated + ')');
  } catch (e) {
    console.warn('Could not load tile-schema.json - falling back to hardcoded TILE_SCHEMA:', e);
  }
}

async function loadAllFloors() {
  await loadTileSchema();
  try {
    var resp = await fetch('floor-data.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    FLOORS = data.floors || {};
    console.log('Loaded ' + data.floorCount + ' floors (generated ' + data.generated + ')');
  } catch (e) { console.warn('Could not load floor-data.json:', e); }
  if (Object.keys(FLOORS).length > 0) populateFloorSelect();
  else {
    var wrap = document.getElementById('canvas-wrap');
    var n = document.createElement('div');
    n.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#e8c547;font-size:14px;line-height:2;';
    n.innerHTML = '<strong>floor-data.json not found.</strong><br>Run: <code style="background:#222;padding:4px 12px;color:#6ab0e8">node tools/extract-floors.js</code><br>Then: <code style="background:#222;padding:4px 12px;color:#6ab0e8">python -m http.server 8080</code>';
    wrap.appendChild(n);
  }
}

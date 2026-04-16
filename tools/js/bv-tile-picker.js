// ═══════════════════════════════════════════════════════════════
//  bv-tile-picker.js — Tile palette (all 77 tiles, grouped by category)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-tile-schema.js (TILE_SCHEMA, CAT_ORDER, CAT_LABELS),
//              bv-edit-state.js (EDIT, updateEditUI)
//
//  Exposes globals:
//    buildTilePicker()
// ═══════════════════════════════════════════════════════════════
'use strict';

function buildTilePicker() {
  var el = document.getElementById('tile-picker');
  if (!EDIT.active) { el.style.display = 'none'; return; }

  // M3: collect biome palette tile IDs from the current floor's payload
  var biomeTileIds = {};  // id → true, for quick lookup
  var biomeTileList = []; // ordered list for the "Biome" group
  var payload = null;
  if (typeof FLOORS !== 'undefined' && typeof currentFloorId === 'string' &&
      FLOORS[currentFloorId] && FLOORS[currentFloorId]._payload) {
    payload = FLOORS[currentFloorId]._payload;
  }
  if (payload && payload.biome && payload.biome.palette) {
    var pal = payload.biome.palette;
    var lists = [pal.wall, pal.floor, pal.light, pal.ceiling];
    for (var li = 0; li < lists.length; li++) {
      if (!Array.isArray(lists[li])) continue;
      for (var pi = 0; pi < lists[li].length; pi++) {
        var tid = lists[li][pi];
        if (!biomeTileIds[tid]) { biomeTileIds[tid] = true; biomeTileList.push(tid); }
      }
    }
    // Also include accent tiles and breakable set
    if (payload.biome.accentTiles) {
      for (var ai = 0; ai < payload.biome.accentTiles.length; ai++) {
        var atid = payload.biome.accentTiles[ai];
        if (!biomeTileIds[atid]) { biomeTileIds[atid] = true; biomeTileList.push(atid); }
      }
    }
    if (payload.biome.breakableSet) {
      for (var bi = 0; bi < payload.biome.breakableSet.length; bi++) {
        var btid = payload.biome.breakableSet[bi];
        if (!biomeTileIds[btid]) { biomeTileIds[btid] = true; biomeTileList.push(btid); }
      }
    }
  }

  // Group ALL tiles by category — no filtering
  var groups = {};
  for (var id in TILE_SCHEMA) {
    var s = TILE_SCHEMA[id];
    if (!groups[s.cat]) groups[s.cat] = [];
    groups[s.cat].push(parseInt(id));
  }

  var html = '';

  // M3: render "Biome" group first if we have payload palette tiles
  if (biomeTileList.length > 0) {
    var biomeName = (payload && payload.biome && payload.biome.name) ? payload.biome.name : 'biome';
    html += '<span class="tp-row tp-biome-row"><span class="tp-cat" style="color:#fc8;">\u2605 ' + biomeName + '</span>';
    for (var bti = 0; bti < biomeTileList.length; bti++) {
      var bid = biomeTileList[bti];
      var bs = TILE_SCHEMA[bid];
      if (!bs) continue;
      var bsel = bid === EDIT.paintTile ? ' selected' : '';
      html += '<span class="tp-tile' + bsel + '" data-tile="' + bid + '" style="background:' + bs.color + ';outline:1px solid #fc8;" title="' + bs.name + ' [' + bid + '] (biome)"><span class="tp-label">' + bs.name + '</span></span>';
    }
    html += '</span>';
  }

  // Standard category groups (unchanged)
  CAT_ORDER.forEach(function(cat) {
    if (!groups[cat]) return;
    groups[cat].sort(function(a,b){return a-b;});
    html += '<span class="tp-row"><span class="tp-cat">' + (CAT_LABELS[cat] || cat) + '</span>';
    groups[cat].forEach(function(id) {
      var s = TILE_SCHEMA[id];
      var sel = id === EDIT.paintTile ? ' selected' : '';
      html += '<span class="tp-tile' + sel + '" data-tile="' + id + '" style="background:' + s.color + '" title="' + s.name + ' [' + id + ']"><span class="tp-label">' + s.name + '</span></span>';
    });
    html += '</span>';
  });
  el.innerHTML = html;
  el.style.display = 'block';

  el.querySelectorAll('.tp-tile').forEach(function(tile) {
    tile.addEventListener('click', function() {
      EDIT.paintTile = parseInt(this.dataset.tile);
      updateEditUI();
      buildTilePicker();
    });
  });
}

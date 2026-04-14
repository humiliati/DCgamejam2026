// ═══════════════════════════════════════════════════════════════
//  bv-legend.js — Per-floor legend panel (tiles actually used)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-tile-schema.js (TILE_SCHEMA, CAT_ORDER, CAT_LABELS),
//              bv-edit-state.js (EDIT, updateEditUI),
//              bv-floor-data.js (currentFloor),
//              bv-tile-picker.js (buildTilePicker)
//
//  Exposes globals:
//    buildLegend()
// ═══════════════════════════════════════════════════════════════
'use strict';

function buildLegend() {
  var panel = document.getElementById('legend-panel');
  if (!currentFloor || !currentFloor.grid) { panel.innerHTML = ''; return; }
  var used = {};
  var grid = currentFloor.grid;
  for (var y = 0; y < grid.length; y++) { if (!grid[y]) continue; for (var x = 0; x < grid[y].length; x++) used[grid[y][x]] = true; }
  var groups = {};
  for (var id in used) { var s = TILE_SCHEMA[id]; if (!s) continue; if (!groups[s.cat]) groups[s.cat] = []; groups[s.cat].push({ id: parseInt(id), schema: s }); }
  var html = '<div style="color:#e8c547;margin-bottom:6px;font-weight:bold">Tiles on this floor</div>';
  CAT_ORDER.forEach(function(cat) {
    if (!groups[cat]) return;
    html += '<div style="color:#888;margin-top:6px;margin-bottom:2px;font-size:9px;text-transform:uppercase">' + (CAT_LABELS[cat]||cat) + '</div>';
    groups[cat].sort(function(a,b){return a.id-b.id;});
    groups[cat].forEach(function(t) {
      var sel = EDIT.active && t.id === EDIT.paintTile ? ' selected' : '';
      html += '<div class="legend-row' + sel + '" data-tile="' + t.id + '"><div class="legend-swatch" style="background:' + t.schema.color + '"></div><span>' + t.id + ' ' + t.schema.name + '</span></div>';
    });
  });
  panel.innerHTML = html;
  panel.querySelectorAll('.legend-row').forEach(function(row) {
    row.addEventListener('click', function() {
      if (!EDIT.active) return;
      EDIT.paintTile = parseInt(this.dataset.tile);
      updateEditUI();
      buildLegend();
      buildTilePicker();
    });
  });
}

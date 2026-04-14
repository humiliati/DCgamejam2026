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

  // Group ALL tiles by category — no filtering
  var groups = {};
  for (var id in TILE_SCHEMA) {
    var s = TILE_SCHEMA[id];
    if (!groups[s.cat]) groups[s.cat] = [];
    groups[s.cat].push(parseInt(id));
  }

  var html = '';
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

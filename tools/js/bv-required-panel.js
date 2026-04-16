// ═══════════════════════════════════════════════════════════════
//  bv-required-panel.js — M3 Required-cells checklist panel
//
//  When a floor has a _payload with a `required` array, this panel
//  shows a checklist of required cells (spawn, entry-door, exit-door)
//  with ✓/✗ status and "Jump" buttons that scroll+highlight the cell.
//
//  Depends on:
//    bv-floor-data.js  (FLOORS, currentFloor, currentFloorId)
//    bv-render.js      (VIEW, cellPx, draw)
//    bv-tile-schema.js (TILE_SCHEMA)
//
//  Exposes globals:
//    buildRequiredPanel()   — rebuild the panel for the current floor
//    isRequiredSatisfied()  — check if all required cells are placed
// ═══════════════════════════════════════════════════════════════
'use strict';

/**
 * Check whether a required cell is satisfied on the current grid.
 */
function _checkRequired(req, floor) {
  if (!floor || !floor.grid) return false;
  var grid = floor.grid;
  var w = grid[0] ? grid[0].length : 0;
  var h = grid.length;

  if (req.kind === 'spawn') {
    // Spawn is satisfied if spawnX/spawnY are set and inside the grid
    return (floor.spawnX != null && floor.spawnY != null &&
            floor.spawnX > 0 && floor.spawnX < w - 1 &&
            floor.spawnY > 0 && floor.spawnY < h - 1);
  }

  if (req.kind === 'entry-door' || req.kind === 'exit-door') {
    if (!req.at) return false;
    var x = req.at.x, y = req.at.y;
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    // Check that the tile at this position is a door-like tile
    var tileId = grid[y][x];
    var ts = TILE_SCHEMA ? TILE_SCHEMA[tileId] : null;
    if (!ts) return false;
    return !!(ts.isDoor);
  }

  return false;
}

/**
 * Build/rebuild the required-cells panel for the current floor.
 * If the floor has no payload or no required array, hides the panel.
 */
function buildRequiredPanel() {
  var panel = document.getElementById('required-panel');
  if (!panel) return;

  var floor = (typeof currentFloor !== 'undefined') ? currentFloor : null;
  var payload = floor ? floor._payload : null;
  if (!payload || !Array.isArray(payload.required) || payload.required.length === 0) {
    panel.style.display = 'none';
    return;
  }

  var required = payload.required;
  var allOk = true;

  var html = '<h4 style="margin:0 0 6px;font-size:11px;color:#fc8;letter-spacing:1px;">REQUIRED CELLS</h4>';
  for (var i = 0; i < required.length; i++) {
    var req = required[i];
    var ok = _checkRequired(req, floor);
    if (!ok) allOk = false;

    var icon = ok ? '\u2713' : '\u2717';
    var color = ok ? '#8c8' : '#c88';
    var label = req.kind;
    if (req.target) label += ' \u2192 ' + req.target;
    if (req.pinned) label += ' \uD83D\uDD12'; // 🔒

    var jumpBtn = '';
    var cx = null, cy = null;
    if (req.at) { cx = req.at.x; cy = req.at.y; }
    else if (req.kind === 'spawn' && floor.spawnX != null) { cx = floor.spawnX; cy = floor.spawnY; }

    if (cx != null && cy != null) {
      jumpBtn = ' <a class="rp-jump" data-x="' + cx + '" data-y="' + cy + '" style="color:#8cf;cursor:pointer;font-size:10px;">[jump]</a>';
    }

    html += '<div style="padding:2px 0;font-size:11px;">' +
            '<span style="color:' + color + ';font-weight:bold;">' + icon + '</span> ' +
            '<span style="color:#cde;">' + label + '</span>' +
            jumpBtn + '</div>';
  }

  // Summary line
  html += '<div style="margin-top:6px;font-size:10px;color:' + (allOk ? '#8c8' : '#986') + ';">' +
          (allOk ? '\u2705 All required cells placed' : '\u26A0 Some required cells missing') + '</div>';

  panel.innerHTML = html;
  panel.style.display = 'block';

  // Wire jump buttons
  panel.querySelectorAll('.rp-jump').forEach(function(a) {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      var jx = parseInt(this.dataset.x, 10);
      var jy = parseInt(this.dataset.y, 10);
      if (typeof VIEW !== 'undefined' && typeof cellPx !== 'undefined' && typeof draw === 'function') {
        var canvas = document.getElementById('canvas');
        if (canvas) {
          VIEW.x = jx * cellPx - canvas.width / 2 + cellPx / 2;
          VIEW.y = jy * cellPx - canvas.height / 2 + cellPx / 2;
          draw();
        }
      }
    });
  });
}

/**
 * Check if all required cells in the current floor are satisfied.
 * Returns true if no payload, no required array, or all satisfied.
 */
function isRequiredSatisfied() {
  var floor = (typeof currentFloor !== 'undefined') ? currentFloor : null;
  var payload = floor ? floor._payload : null;
  if (!payload || !Array.isArray(payload.required)) return true;
  for (var i = 0; i < payload.required.length; i++) {
    if (!_checkRequired(payload.required[i], floor)) return false;
  }
  return true;
}

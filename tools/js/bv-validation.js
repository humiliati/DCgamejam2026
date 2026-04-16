// ═══════════════════════════════════════════════════════════════
//  bv-validation.js — Tier 2 Validation (walkability + cross-floor)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Per-floor: walkability (BFS from spawn), door-target sanity,
//  spawn validity, required tiles for depth-1 exterior floors.
//  Cross-floor: target floor exists; inbound back-door reciprocity.
//  Results render in #validate-modal; clicking a row jumps the
//  camera, highlights the cells in red, and persists the highlight
//  as a canvas overlay until the selection changes or modal closes.
//
//  Depends on: bv-tile-schema.js (TILE_SCHEMA),
//              bv-floor-data.js (FLOORS, currentFloor, currentFloorId),
//              bv-floor-selection.js (selectFloor),
//              bv-render.js (canvas, ctx, VIEW, cellPx, draw)
//
//  Exposes globals:
//    VALIDATE, DOOR_NAME_RE, isDoorLikeTileId, depthOfFloorId,
//    forEachCell, tileNameAt, reachableFrom, validateFloor,
//    validateCrossFloor, runValidation, updateValidateButtonBadge,
//    renderValidationResults, selectValidationIssue, openValidateModal,
//    closeValidateModal, drawValidationHighlight
// ═══════════════════════════════════════════════════════════════
'use strict';

var VALIDATE = {
  lastResults: null,
  scope: 'current',
  selectedIdx: -1,
  highlightCells: null
};

var DOOR_NAME_RE = /^(DOOR(_EXIT|_BACK|_FACADE)?|STAIRS_(UP|DN))$/;

function isDoorLikeTileId(tileId) {
  var s = TILE_SCHEMA[tileId]; if (!s) return false;
  if (s.isDoor) return true;
  return DOOR_NAME_RE.test(s.name || '');
}

function depthOfFloorId(id) {
  if (!id) return 0;
  return String(id).split('.').length;
}

function forEachCell(grid, fn) {
  for (var y = 0; y < grid.length; y++) {
    var row = grid[y]; if (!row) continue;
    for (var x = 0; x < row.length; x++) fn(x, y, row[x]);
  }
}

function tileNameAt(grid, x, y) {
  var row = grid[y]; if (!row) return '?';
  var s = TILE_SCHEMA[row[x]];
  return s ? s.name : String(row[x]);
}

function reachableFrom(grid, sx, sy) {
  var reached = {};
  if (!grid || !grid[sy] || grid[sy][sx] === undefined) return reached;
  var startSchema = TILE_SCHEMA[grid[sy][sx]];
  if (!startSchema || !startSchema.walk) return reached;
  var stack = [{x:sx, y:sy}];
  reached[sx+','+sy] = true;
  while (stack.length) {
    var c = stack.pop();
    var neigh = [{x:c.x+1,y:c.y},{x:c.x-1,y:c.y},{x:c.x,y:c.y+1},{x:c.x,y:c.y-1}];
    for (var i = 0; i < neigh.length; i++) {
      var n = neigh[i];
      if (n.y < 0 || n.y >= grid.length) continue;
      var row = grid[n.y]; if (!row) continue;
      if (n.x < 0 || n.x >= row.length) continue;
      var k = n.x+','+n.y; if (reached[k]) continue;
      var s = TILE_SCHEMA[row[n.x]]; if (!s || !s.walk) continue;
      reached[k] = true;
      stack.push(n);
    }
  }
  return reached;
}

function validateFloor(floorId, floor) {
  var issues = [];
  if (!floor || !floor.grid) {
    issues.push({severity:'err', floorId:floorId, kind:'missing-data',
                 msg:'Floor data missing or has no grid', cells:[]});
    return issues;
  }
  var grid = floor.grid;
  var gh = grid.length;
  var gw = grid[0] ? grid[0].length : 0;

  var sp = floor.spawn;
  if (!sp && floorId === '0') sp = {x:4, y:17};
  if (!sp) {
    issues.push({severity:'err', floorId:floorId, kind:'spawn-missing',
                 msg:'No spawn defined for this floor', cells:[]});
  } else {
    if (sp.x < 0 || sp.x >= gw || sp.y < 0 || sp.y >= gh) {
      issues.push({severity:'err', floorId:floorId, kind:'spawn-oob',
                   msg:'Spawn ('+sp.x+','+sp.y+') is outside the grid ('+gw+'×'+gh+')',
                   cells:[{x:sp.x,y:sp.y}]});
    } else {
      var spTile = grid[sp.y][sp.x];
      var spSchema = TILE_SCHEMA[spTile];
      if (!spSchema || !spSchema.walk) {
        issues.push({severity:'err', floorId:floorId, kind:'spawn-blocked',
                     msg:'Spawn at ('+sp.x+','+sp.y+') lands on non-walkable tile '+(spSchema?spSchema.name:spTile),
                     cells:[{x:sp.x,y:sp.y}]});
      }
    }
  }

  if (sp && sp.x >= 0 && sp.x < gw && sp.y >= 0 && sp.y < gh) {
    var reached = reachableFrom(grid, sp.x, sp.y);
    var orphaned = [];
    forEachCell(grid, function(x, y, tile) {
      var s = TILE_SCHEMA[tile]; if (!s || !s.walk) return;
      if (!reached[x+','+y]) orphaned.push({x:x, y:y});
    });
    if (orphaned.length) {
      issues.push({severity:'warn', floorId:floorId, kind:'unreachable',
                   msg:orphaned.length+' walkable cells unreachable from spawn',
                   cells:orphaned});
    }
  }

  var doorTargets = floor.doorTargets || {};
  var hasFacadeArch = false, hasAnyDoor = false;
  forEachCell(grid, function(x, y, tile) {
    var s = TILE_SCHEMA[tile]; if (!s) return;
    if (s.name === 'ARCH_DOORWAY') hasFacadeArch = true;
    if (!isDoorLikeTileId(tile)) return;
    hasAnyDoor = true;
    var key = x+','+y;
    var target = doorTargets[key];
    if (!target) {
      issues.push({severity:'info', floorId:floorId, kind:'door-fallback',
                   msg:s.name+' at ('+x+','+y+') has no explicit doorTargets entry (engine will use parent/child fallback)',
                   cells:[{x:x,y:y}]});
    }
  });

  var depth = depthOfFloorId(floorId);
  if (depth === 1 && !hasFacadeArch && !hasAnyDoor && gw && gh) {
    issues.push({severity:'warn', floorId:floorId, kind:'exterior-no-entry',
                 msg:'Exterior floor has no ARCH_DOORWAY or door tile — nothing to enter',
                 cells:[]});
  }

  // ── C6 rule: every door/stair tile needs a doorTargets entry ──
  // Upgrade from the info-level 'door-fallback' above: when a door-like
  // tile relies on the engine's parent/child fallback, the fallback may
  // point at a floor the author didn't intend. Warn unless the tile is a
  // DOOR_FACADE (which is decorative, not a transition).
  forEachCell(grid, function(x, y, tile) {
    var s = TILE_SCHEMA[tile]; if (!s) return;
    if (!isDoorLikeTileId(tile)) return;
    if (s.name === 'DOOR_FACADE') return; // decorative — no target needed
    var key = x+','+y;
    if (!doorTargets[key]) {
      issues.push({severity:'warn', floorId:floorId, kind:'door-no-target',
                   msg:s.name+' at ('+x+','+y+') has no doorTargets entry — engine will guess parent/child, which may be wrong',
                   cells:[{x:x,y:y}]});
    }
  });

  // ── C6 rule: room interiors should not contain wall tiles ──
  // GridGen-authored rooms carry {x,y,w,h}. A WALL inside a room rect
  // is almost always a blockout error (leftover from resize or copy/paste).
  var rooms = floor.rooms || [];
  for (var ri = 0; ri < rooms.length; ri++) {
    var rm = rooms[ri];
    var wallCells = [];
    for (var ry = rm.y; ry < rm.y + rm.h && ry < gh; ry++) {
      var row = grid[ry]; if (!row) continue;
      for (var rx = rm.x; rx < rm.x + rm.w && rx < gw; rx++) {
        var ts = TILE_SCHEMA[row[rx]];
        if (ts && ts.name === 'WALL') wallCells.push({x:rx, y:ry});
      }
    }
    if (wallCells.length) {
      issues.push({severity:'warn', floorId:floorId, kind:'room-has-walls',
                   msg:'Room '+ri+' ('+rm.w+'×'+rm.h+' at '+rm.x+','+rm.y+') contains '+wallCells.length+' WALL tile'+(wallCells.length===1?'':'s')+' inside its bounds',
                   cells:wallCells});
    }
  }

  // ── C6 rule: tiles with tileHeightOffsets should have matching ──
  // ── tileWallHeights in the spatial contract                   ──
  // If a tile has a non-zero heightOffset but no tileWallHeights entry,
  // the raycaster renders it at the default wallHeight plus the offset —
  // which is usually wrong for short furniture or sunken stairs.
  // We check against the three static contracts; the actual contract
  // depends on floor depth, so we use the depth-appropriate one.
  // NOTE: this check only runs when SpatialContract is available (browser
  // BO-V context). CLI would need its own contract lookup.
  if (typeof SpatialContract !== 'undefined') {
    var contract = null;
    if (depth === 1 && SpatialContract.exterior) contract = SpatialContract.exterior();
    else if (depth === 2 && SpatialContract.interior) contract = SpatialContract.interior();
    else if (depth >= 3 && SpatialContract.nestedDungeon) contract = SpatialContract.nestedDungeon();
    if (contract && contract.tileHeightOffsets && contract.tileWallHeights) {
      var offKeys = Object.keys(contract.tileHeightOffsets);
      var heightMissing = [];
      for (var oi = 0; oi < offKeys.length; oi++) {
        var tid = parseInt(offKeys[oi], 10);
        if (contract.tileHeightOffsets[tid] === 0) continue; // zero offset is fine
        if (contract.tileWallHeights[tid] == null) {
          // Only flag if this tile actually appears on this floor
          var found = false;
          forEachCell(grid, function(cx, cy, ct) { if (ct === tid) found = true; });
          if (found) {
            var tn = TILE_SCHEMA[tid] ? TILE_SCHEMA[tid].name : String(tid);
            heightMissing.push(tn + ' (id ' + tid + ')');
          }
        }
      }
      if (heightMissing.length) {
        issues.push({severity:'info', floorId:floorId, kind:'offset-no-height',
                     msg:heightMissing.length+' tile type'+(heightMissing.length===1?'':'s')+' have tileHeightOffsets but no tileWallHeights entry: '+heightMissing.join(', '),
                     cells:[]});
      }
    }
  }

  return issues;
}

function validateCrossFloor() {
  var issues = [];
  var ids = Object.keys(FLOORS);

  ids.forEach(function(floorId) {
    var f = FLOORS[floorId]; if (!f) return;
    var targets = f.doorTargets || {};
    Object.keys(targets).forEach(function(key) {
      var tgt = targets[key];
      var parts = key.split(','), x = parseInt(parts[0]), y = parseInt(parts[1]);
      if (!FLOORS[tgt]) {
        issues.push({severity:'err', floorId:floorId, kind:'door-target-missing',
                     msg:'Door at ('+x+','+y+') points to floor "'+tgt+'" which does not exist',
                     cells:[{x:x,y:y}]});
      }
    });
  });

  ids.forEach(function(floorId) {
    var f = FLOORS[floorId]; if (!f) return;
    var targets = f.doorTargets || {};
    Object.keys(targets).forEach(function(key) {
      var tgt = targets[key];
      var tf = FLOORS[tgt]; if (!tf || !tf.grid) return;
      var hasDoor = false;
      forEachCell(tf.grid, function(x, y, tile) {
        if (hasDoor) return;
        if (isDoorLikeTileId(tile)) hasDoor = true;
      });
      if (!hasDoor) {
        var parts = key.split(','), x = parseInt(parts[0]), y = parseInt(parts[1]);
        issues.push({severity:'warn', floorId:floorId, kind:'no-return-door',
                     msg:'Floor "'+tgt+'" (target of door at '+x+','+y+') has no door tiles — one-way transition',
                     cells:[{x:x,y:y}]});
      }
    });
  });

  return issues;
}

function runValidation(scope) {
  VALIDATE.scope = scope || 'current';
  var issues = [];
  if (VALIDATE.scope === 'current') {
    if (currentFloorId && FLOORS[currentFloorId]) {
      issues = issues.concat(validateFloor(currentFloorId, FLOORS[currentFloorId]));
    }
  } else {
    Object.keys(FLOORS).forEach(function(id) {
      issues = issues.concat(validateFloor(id, FLOORS[id]));
    });
    issues = issues.concat(validateCrossFloor());
  }
  VALIDATE.lastResults = issues;
  VALIDATE.selectedIdx = -1;
  VALIDATE.highlightCells = null;
  renderValidationResults();
  updateValidateButtonBadge();
  draw();
}

function updateValidateButtonBadge() {
  var btn = document.getElementById('btn-validate');
  if (!btn) return;
  btn.classList.remove('has-errors','has-warnings','clean');
  if (!VALIDATE.lastResults) return;
  var nErr = 0, nWarn = 0;
  VALIDATE.lastResults.forEach(function(i) {
    if (i.severity === 'err') nErr++;
    else if (i.severity === 'warn') nWarn++;
  });
  if (nErr) btn.classList.add('has-errors');
  else if (nWarn) btn.classList.add('has-warnings');
  else btn.classList.add('clean');
}

function renderValidationResults() {
  var list = document.getElementById('validate-list');
  var sub = document.getElementById('validate-subtitle');
  var sumErr = document.getElementById('vsum-err');
  var sumWarn = document.getElementById('vsum-warn');
  var sumOk = document.getElementById('vsum-ok');
  if (!list) return;
  var issues = VALIDATE.lastResults || [];
  var nErr = 0, nWarn = 0, nInfo = 0;
  issues.forEach(function(i) {
    if (i.severity === 'err') nErr++;
    else if (i.severity === 'warn') nWarn++;
    else nInfo++;
  });
  sumErr.textContent  = nErr + ' error' + (nErr === 1 ? '' : 's');
  sumWarn.textContent = nWarn + ' warning' + (nWarn === 1 ? '' : 's');
  if (nErr === 0 && nWarn === 0) {
    sumOk.style.display = '';
    sumOk.textContent = nInfo ? nInfo + ' info · clean' : 'all checks passed';
  } else {
    sumOk.style.display = 'none';
  }
  sub.textContent = VALIDATE.scope === 'all'
    ? Object.keys(FLOORS).length + ' floors scanned'
    : 'floor "' + (currentFloorId || '?') + '"';

  var order = {err:0, warn:1, info:2};
  issues = issues.slice().sort(function(a, b) {
    var d = order[a.severity] - order[b.severity]; if (d) return d;
    return (a.floorId||'').localeCompare(b.floorId||'');
  });
  VALIDATE.lastResults = issues;

  list.innerHTML = '';
  if (!issues.length) {
    var e = document.createElement('div');
    e.className = 'vempty';
    e.textContent = '✓ No issues found';
    list.appendChild(e);
    return;
  }
  issues.forEach(function(iss, idx) {
    var row = document.createElement('div');
    row.className = 'vrow' + (idx === VALIDATE.selectedIdx ? ' selected' : '');
    row.innerHTML =
      '<span class="vsev ' + iss.severity + '">' + iss.severity.toUpperCase() + '</span>' +
      '<span class="vfloor">' + (iss.floorId || '—') + '</span>' +
      '<span class="vkind">' + iss.kind + '</span>' +
      '<span class="vmsg"></span>' +
      '<span class="vcells">' + (iss.cells && iss.cells.length ? iss.cells.length + ' cell' + (iss.cells.length===1?'':'s') : '') + '</span>';
    row.querySelector('.vmsg').textContent = iss.msg;
    row.addEventListener('click', function() { selectValidationIssue(idx); });
    list.appendChild(row);
  });
}

function selectValidationIssue(idx) {
  var issues = VALIDATE.lastResults || [];
  var iss = issues[idx]; if (!iss) return;
  VALIDATE.selectedIdx = idx;
  if (iss.floorId && iss.floorId !== currentFloorId && FLOORS[iss.floorId]) {
    selectFloor(iss.floorId);
  }
  VALIDATE.highlightCells = (iss.cells && iss.cells.length)
    ? { floorId: iss.floorId, cells: iss.cells, severity: iss.severity }
    : null;
  if (iss.cells && iss.cells.length) {
    var c = iss.cells[0];
    var cp = cellPx();
    VIEW.panX = canvas.width/2  - (c.x + 0.5) * cp;
    VIEW.panY = canvas.height/2 - (c.y + 0.5) * cp;
  }
  var rows = document.querySelectorAll('#validate-list .vrow');
  rows.forEach(function(r, i) { r.classList.toggle('selected', i === idx); });
  draw();
}

function openValidateModal() {
  runValidation(VALIDATE.scope);
  document.getElementById('validate-modal').classList.add('open');
}
function closeValidateModal() {
  document.getElementById('validate-modal').classList.remove('open');
  VALIDATE.highlightCells = null;
  draw();
}

function drawValidationHighlight() {
  var h = VALIDATE.highlightCells; if (!h) return;
  if (h.floorId && h.floorId !== currentFloorId) return;
  if (!canvas || !ctx) return;
  var cp = cellPx();
  var color = h.severity === 'err' ? '#ff4466'
            : h.severity === 'warn' ? '#ffaa44'
            : '#66aaff';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cp * 0.08);
  for (var i = 0; i < h.cells.length; i++) {
    var c = h.cells[i];
    var px = VIEW.panX + c.x * cp;
    var py = VIEW.panY + c.y * cp;
    ctx.strokeRect(px + 1, py + 1, cp - 2, cp - 2);
  }
  var first = h.cells[0];
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fillRect(VIEW.panX + first.x * cp, VIEW.panY + first.y * cp, cp, cp);
  ctx.restore();
}

function wireValidateModal() {
  var btn = document.getElementById('btn-validate');
  if (btn) btn.addEventListener('click', openValidateModal);
  var close = document.getElementById('validate-close');
  if (close) close.addEventListener('click', closeValidateModal);
  var rerun = document.getElementById('validate-rerun');
  if (rerun) rerun.addEventListener('click', function() { runValidation(VALIDATE.scope); });
  ['vtab-current','vtab-all'].forEach(function(id) {
    var t = document.getElementById(id); if (!t) return;
    t.addEventListener('click', function() {
      var scope = t.getAttribute('data-scope');
      document.getElementById('vtab-current').classList.toggle('active', scope === 'current');
      document.getElementById('vtab-all').classList.toggle('active', scope === 'all');
      runValidation(scope);
    });
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireValidateModal);
} else {
  wireValidateModal();
}

// Escape closes validate modal.
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('validate-modal').classList.contains('open')) {
    closeValidateModal();
  }
});

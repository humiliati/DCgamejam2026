// ═══════════════════════════════════════════════════════════════
//  bv-meta-editor.js — Tier 3 Per-Floor Metadata Editor
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Spawn drag-to-place + door-target dropdown editing. Edits mutate
//  FLOORS[id] in memory; file patching for metadata is deferred to
//  a follow-up (the save patcher currently only rewrites the GRID
//  literal). Export JSON snippet via the "Copy meta" button; paste
//  into the floor-blockout-*.js file's registerFloorBuilder entry.
//
//  Depends on: bv-tile-schema.js (TILE_SCHEMA),
//              bv-floor-data.js (FLOORS, currentFloor, currentFloorId),
//              bv-edit-state.js (pushUndo, applyEntry),
//              bv-floor-selection.js (selectFloor),
//              bv-interaction.js (canvasWrap, updateCursor),
//              bv-clipboard.js (showCopyToast)  // note: showCopyToast
//                  actually lives in bv-clipboard-utils.js
//              bv-validation.js (isDoorLikeTileId, forEachCell),
//              bv-render.js (canvas, VIEW, cellPx, draw)
//
//  MUST load AFTER bv-validation.js (uses isDoorLikeTileId/forEachCell)
//  and AFTER bv-floor-selection.js + bv-interaction.js (monkey-patches
//  selectFloor + updateCursor).
//
//  Exposes globals:
//    META, metaIsDirty, bumpMetaDirty, pushMetaUndo, applyMetaEntry,
//    listDoorCellsOnFloor, allFloorIdsSorted, buildMetadataPanel,
//    toggleMetaPanel, setSpawn, setDoorTarget, copyFloorMetaJson,
//    revertFloorMeta, metaInterceptMousedown,
//    window.__metaSmokeTest
// ═══════════════════════════════════════════════════════════════
'use strict';

var META = {
  open: false,
  placingSpawn: false,
  dirtyPerFloor: {}
};

function metaIsDirty(floorId) {
  return !!(floorId && META.dirtyPerFloor[floorId]);
}
function bumpMetaDirty(floorId) {
  if (!floorId) return;
  META.dirtyPerFloor[floorId] = (META.dirtyPerFloor[floorId] || 0) + 1;
}

function pushMetaUndo(entry) {
  entry.type = 'meta';
  pushUndo(entry);
}

// Monkey-patch applyEntry() to route 'meta' type through our applier.
(function patchApplyEntryForMeta() {
  if (typeof applyEntry !== 'function') return;
  var origApply = applyEntry;
  applyEntry = function(entry, direction) {
    if (entry && entry.type === 'meta') {
      applyMetaEntry(entry, direction);
      return;
    }
    return origApply.apply(this, arguments);
  };
})();

function applyMetaEntry(entry, direction) {
  var use = direction === 'undo' ? entry.oldValue : entry.newValue;
  var f = FLOORS[entry.floorId]; if (!f) return;
  if (entry.kind === 'spawn') {
    f.spawn = use ? { x: use.x, y: use.y } : null;
  } else if (entry.kind === 'doorTarget') {
    f.doorTargets = f.doorTargets || {};
    if (use == null || use === '') {
      delete f.doorTargets[entry.key];
    } else {
      f.doorTargets[entry.key] = use;
    }
  }
  if (currentFloorId === entry.floorId) {
    buildMetadataPanel();
    draw();
  }
}

function listDoorCellsOnFloor(floor) {
  if (!floor || !floor.grid) return [];
  var out = [];
  var targets = floor.doorTargets || {};
  forEachCell(floor.grid, function(x, y, tile) {
    if (!isDoorLikeTileId(tile)) return;
    out.push({
      x: x, y: y, tileId: tile,
      schema: TILE_SCHEMA[tile],
      currentTarget: targets[x+','+y] || ''
    });
  });
  return out;
}

function allFloorIdsSorted() {
  return Object.keys(FLOORS).sort(function(a, b) {
    var A = a.split('.').map(Number), B = b.split('.').map(Number);
    for (var i = 0; i < Math.max(A.length, B.length); i++) {
      var av = A[i]||0, bv = B[i]||0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

function buildMetadataPanel() {
  var panel = document.getElementById('metadata-panel');
  if (!panel) return;
  if (!META.open) { panel.classList.remove('open'); return; }
  panel.classList.add('open');
  panel.innerHTML = '';

  var header = document.createElement('div');
  header.className = 'mp-header';
  var dirtyMark = metaIsDirty(currentFloorId) ? ' <span style="color:#fc8">●</span>' : '';
  header.innerHTML = '<span class="mp-title">Metadata — floor "'+(currentFloorId||'?')+'"'+dirtyMark+'</span>';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.title = 'Close (M)';
  closeBtn.addEventListener('click', function() { toggleMetaPanel(false); });
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (!currentFloor || !currentFloor.grid) {
    var empty = document.createElement('div');
    empty.className = 'mp-empty';
    empty.textContent = 'No floor loaded';
    panel.appendChild(empty);
    return;
  }

  // ── Spawn row ──
  var spawnTitle = document.createElement('div');
  spawnTitle.className = 'mp-section-title';
  spawnTitle.textContent = 'SPAWN';
  panel.appendChild(spawnTitle);

  var sp = currentFloor.spawn;
  var spawnRow = document.createElement('div');
  spawnRow.className = 'mp-row';
  var sw = document.createElement('div');
  sw.className = 'mp-tileswatch';
  sw.style.background = '#ff44ff';
  spawnRow.appendChild(sw);
  var lbl = document.createElement('div');
  lbl.className = 'mp-label';
  lbl.innerHTML = sp ? '('+sp.x+', '+sp.y+')' : '<em style="color:#f88">not set</em>';
  spawnRow.appendChild(lbl);
  var moveBtn = document.createElement('button');
  moveBtn.className = 'mp-move' + (META.placingSpawn ? ' placing' : '');
  moveBtn.textContent = META.placingSpawn ? 'Click grid…' : (sp ? 'Move' : 'Place');
  moveBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    META.placingSpawn = !META.placingSpawn;
    updateCursor();
    buildMetadataPanel();
  });
  spawnRow.appendChild(moveBtn);
  panel.appendChild(spawnRow);

  // ── Doors ──
  var doors = listDoorCellsOnFloor(currentFloor);
  var doorsTitle = document.createElement('div');
  doorsTitle.className = 'mp-section-title';
  doorsTitle.textContent = 'DOOR TARGETS (' + doors.length + ')';
  panel.appendChild(doorsTitle);

  if (!doors.length) {
    var emp = document.createElement('div');
    emp.className = 'mp-empty';
    emp.textContent = 'No door tiles on this floor';
    panel.appendChild(emp);
  } else {
    var floorIds = allFloorIdsSorted();
    doors.forEach(function(d) {
      var row = document.createElement('div');
      row.className = 'mp-row';
      var sw2 = document.createElement('div');
      sw2.className = 'mp-tileswatch';
      sw2.style.background = d.schema ? d.schema.color : '#ff00ff';
      row.appendChild(sw2);
      var nm = document.createElement('div');
      nm.className = 'mp-label';
      nm.innerHTML = (d.schema ? d.schema.name : d.tileId) +
                     ' <span class="mp-coords">('+d.x+','+d.y+')</span>';
      row.appendChild(nm);
      var sel = document.createElement('select');
      var optFb = document.createElement('option');
      optFb.value = '';
      optFb.textContent = '(fallback)';
      sel.appendChild(optFb);
      floorIds.forEach(function(fid) {
        var o = document.createElement('option');
        o.value = fid;
        o.textContent = fid;
        sel.appendChild(o);
      });
      sel.value = d.currentTarget || '';
      sel.addEventListener('change', function() {
        setDoorTarget(d.x, d.y, sel.value);
      });
      var jmp = document.createElement('button');
      jmp.className = 'mp-move';
      jmp.style.marginLeft = '4px';
      jmp.textContent = '→';
      jmp.title = 'Center camera on this door';
      jmp.addEventListener('click', function() {
        var cp = cellPx();
        VIEW.panX = canvas.width/2  - (d.x + 0.5) * cp;
        VIEW.panY = canvas.height/2 - (d.y + 0.5) * cp;
        draw();
      });
      row.appendChild(sel);
      row.appendChild(jmp);
      panel.appendChild(row);
    });
  }

  // ── Actions ──
  var actions = document.createElement('div');
  actions.className = 'mp-actions';
  var copyBtn = document.createElement('button');
  copyBtn.className = 'primary';
  copyBtn.textContent = 'Copy meta JSON';
  copyBtn.title = 'Copy {spawn, doorTargets} snippet to clipboard — paste into registerFloorBuilder';
  copyBtn.addEventListener('click', copyFloorMetaJson);
  actions.appendChild(copyBtn);
  var revertBtn = document.createElement('button');
  revertBtn.textContent = 'Revert meta';
  revertBtn.title = 'Drop unsaved metadata edits for this floor (reloads floor-data.json)';
  revertBtn.addEventListener('click', revertFloorMeta);
  actions.appendChild(revertBtn);
  panel.appendChild(actions);
}

function toggleMetaPanel(force) {
  META.open = (force === undefined) ? !META.open : !!force;
  META.placingSpawn = false;
  var btn = document.getElementById('btn-meta');
  if (btn) btn.classList.toggle('active', META.open);
  buildMetadataPanel();
  updateCursor();
}

function setSpawn(x, y) {
  if (!currentFloor || !currentFloorId) return;
  var gw = currentFloor.grid[0] ? currentFloor.grid[0].length : 0;
  var gh = currentFloor.grid.length;
  if (x < 0 || x >= gw || y < 0 || y >= gh) return;
  var oldSpawn = currentFloor.spawn ? { x: currentFloor.spawn.x, y: currentFloor.spawn.y } : null;
  var newSpawn = { x: x, y: y };
  currentFloor.spawn = newSpawn;
  pushMetaUndo({
    floorId: currentFloorId, kind: 'spawn',
    oldValue: oldSpawn, newValue: newSpawn
  });
  bumpMetaDirty(currentFloorId);
  META.placingSpawn = false;
  buildMetadataPanel();
  updateCursor();
  draw();
  showCopyToast('Spawn moved to (' + x + ', ' + y + ')');
}

function setDoorTarget(x, y, newTarget) {
  if (!currentFloor || !currentFloorId) return;
  var key = x + ',' + y;
  currentFloor.doorTargets = currentFloor.doorTargets || {};
  var oldValue = currentFloor.doorTargets[key] || '';
  if (oldValue === newTarget) return;
  if (newTarget === '' || newTarget == null) {
    delete currentFloor.doorTargets[key];
  } else {
    currentFloor.doorTargets[key] = newTarget;
  }
  pushMetaUndo({
    floorId: currentFloorId, kind: 'doorTarget',
    key: key, oldValue: oldValue, newValue: newTarget
  });
  bumpMetaDirty(currentFloorId);
  draw();
}

function copyFloorMetaJson() {
  if (!currentFloor || !currentFloorId) return;
  var snippet = {
    floorId: currentFloorId,
    spawn: currentFloor.spawn || null,
    doorTargets: currentFloor.doorTargets || {}
  };
  var txt = JSON.stringify(snippet, null, 2);
  function fallbackCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    showCopyToast('Meta JSON copied (fallback)');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function() {
      showCopyToast('Meta JSON copied (' + Object.keys(snippet.doorTargets).length + ' doorTargets)');
    }, function() {
      fallbackCopy(txt);
    });
  } else {
    fallbackCopy(txt);
  }
}

function revertFloorMeta() {
  if (!currentFloorId) return;
  if (!confirm('Drop unsaved metadata edits for floor "' + currentFloorId + '"?\n\nThis re-fetches floor-data.json — any unsaved doorTargets / spawn edits on this floor will be lost. Grid edits are NOT affected.')) return;
  fetch('floor-data.json').then(function(r) { return r.json(); }).then(function(data) {
    var fresh = data.floors && data.floors[currentFloorId];
    if (!fresh) { showCopyToast('Floor not in data on disk'); return; }
    currentFloor.spawn = fresh.spawn ? { x: fresh.spawn.x, y: fresh.spawn.y } : null;
    currentFloor.doorTargets = fresh.doorTargets ? JSON.parse(JSON.stringify(fresh.doorTargets)) : {};
    META.dirtyPerFloor[currentFloorId] = 0;
    buildMetadataPanel();
    draw();
    showCopyToast('Metadata reverted to disk state');
  }).catch(function(e) { showCopyToast('Revert failed: ' + e.message); });
}

// Canvas-click interception hook called from bv-interaction's mousedown.
function metaInterceptMousedown(e, gridPos) {
  if (META.placingSpawn && e.button === 0) {
    e.preventDefault();
    setSpawn(gridPos.x, gridPos.y);
    return true;
  }
  return false;
}

// Patch updateCursor so metadata placement mode gets a crosshair.
(function patchUpdateCursorForMeta() {
  if (typeof updateCursor !== 'function') return;
  var orig = updateCursor;
  updateCursor = function() {
    if (META.placingSpawn) {
      if (canvasWrap) canvasWrap.style.cursor = 'crosshair';
      return;
    }
    return orig.apply(this, arguments);
  };
})();

// Hook selectFloor to refresh the panel on floor switch.
(function patchSelectFloorForMeta() {
  var original = selectFloor;
  selectFloor = function(id) {
    original.apply(this, arguments);
    META.placingSpawn = false;
    if (META.open) buildMetadataPanel();
  };
})();

function wireMetaButton() {
  var btn = document.getElementById('btn-meta');
  if (btn) btn.addEventListener('click', function() { toggleMetaPanel(); });
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'm' || e.key === 'M') {
      if (document.getElementById('validate-modal').classList.contains('open')) return;
      if (document.getElementById('save-modal').classList.contains('open')) return;
      if (document.getElementById('scene-modal').classList.contains('open')) return;
      e.preventDefault();
      toggleMetaPanel();
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireMetaButton);
} else {
  wireMetaButton();
}

window.__metaSmokeTest = function() {
  console.log('[meta-smoke] floor=' + currentFloorId);
  var doors = listDoorCellsOnFloor(currentFloor);
  console.log('  doors:', doors.length, 'spawn:', currentFloor && currentFloor.spawn);
  doors.slice(0, 6).forEach(function(d) {
    console.log('  ', d.schema.name, '('+d.x+','+d.y+')', '→', d.currentTarget || '(fallback)');
  });
  return { floor: currentFloorId, doors: doors.length, spawn: currentFloor && currentFloor.spawn };
};

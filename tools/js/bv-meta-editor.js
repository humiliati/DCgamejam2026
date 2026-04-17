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
  } else if (entry.kind === 'gate') {
    f.gates = f.gates || {};
    if (use == null) {
      delete f.gates[entry.key];
      if (Object.keys(f.gates).length === 0) delete f.gates;
    } else {
      f.gates[entry.key] = use;
    }
  } else if (entry.kind === 'edgeGate') {
    f.edgeGates = f.edgeGates || {};
    if (use == null) {
      delete f.edgeGates[entry.key];
      if (Object.keys(f.edgeGates).length === 0) delete f.edgeGates;
    } else {
      f.edgeGates[entry.key] = use;
    }
  }
  if (currentFloorId === entry.floorId) {
    buildMetadataPanel();
    draw();
  }
}

// ── Gate constants & helpers (DOC-116) ──────────────────────
var GATE_TYPES = ['none', 'key', 'quest', 'faction', 'schedule', 'breakable'];
var GATE_ICONS = { key: '\uD83D\uDD11', quest: '\uD83D\uDCDC', faction: '\uD83D\uDEE1\uFE0F', schedule: '\u23F0', breakable: '\uD83D\uDCA5' };
var FACTION_IDS = ['mss', 'pinkerton', 'jesuit', 'bprd'];
var FACTION_TIERS = ['hated','unfriendly','neutral','friendly','allied','exalted'];

function resolveGateForDoor(floor, x, y) {
  var key = x + ',' + y;
  // Tier 1: tile gate
  var gates = floor.gates || {};
  if (gates[key] && gates[key].override === true) {
    return { tier: 'tile', gate: gates[key] };
  }
  // Tier 2: edge gate
  var dt = floor.doorTargets || {};
  var tgt = dt[key];
  if (tgt) {
    var eg = floor.edgeGates || {};
    if (eg[tgt]) return { tier: 'edge', gate: eg[tgt], target: tgt };
  }
  // Tier 3: floor gate
  if (floor.floorGate) return { tier: 'floor', gate: floor.floorGate };
  return null;
}

function gateTypeLabel(gate) {
  if (!gate) return 'none';
  var icon = GATE_ICONS[gate.type] || '';
  var detail = '';
  if (gate.type === 'key') detail = gate.keyId || 'any key';
  else if (gate.type === 'quest') detail = gate.flag || (gate.questId + (gate.stepId ? ':' + gate.stepId : gate.stepIdx != null ? '#' + gate.stepIdx : ''));
  else if (gate.type === 'faction') detail = gate.factionId + ' \u2265 ' + gate.minTier;
  else if (gate.type === 'schedule') detail = gate.openHour + ':00\u2013' + gate.closeHour + ':00';
  else if (gate.type === 'breakable') detail = (gate.suit || 'any') + ' \u00D7' + (gate.hits || 1);
  return icon + ' ' + gate.type + (detail ? ' (' + detail + ')' : '');
}

function setTileGate(x, y, gate) {
  if (!currentFloor || !currentFloorId) return;
  var key = x + ',' + y;
  currentFloor.gates = currentFloor.gates || {};
  var old = currentFloor.gates[key] ? JSON.parse(JSON.stringify(currentFloor.gates[key])) : null;
  if (gate) {
    gate.override = true;
    currentFloor.gates[key] = gate;
  } else {
    delete currentFloor.gates[key];
    if (Object.keys(currentFloor.gates).length === 0) delete currentFloor.gates;
  }
  pushMetaUndo({
    floorId: currentFloorId, kind: 'gate',
    key: key, oldValue: old, newValue: gate ? JSON.parse(JSON.stringify(gate)) : null
  });
  bumpMetaDirty(currentFloorId);
  buildMetadataPanel();
  draw();
}

function setEdgeGate(targetFloorId, gate) {
  if (!currentFloor || !currentFloorId) return;
  currentFloor.edgeGates = currentFloor.edgeGates || {};
  var old = currentFloor.edgeGates[targetFloorId] ? JSON.parse(JSON.stringify(currentFloor.edgeGates[targetFloorId])) : null;
  if (gate) {
    currentFloor.edgeGates[targetFloorId] = gate;
  } else {
    delete currentFloor.edgeGates[targetFloorId];
    if (Object.keys(currentFloor.edgeGates).length === 0) delete currentFloor.edgeGates;
  }
  pushMetaUndo({
    floorId: currentFloorId, kind: 'edgeGate',
    key: targetFloorId, oldValue: old, newValue: gate ? JSON.parse(JSON.stringify(gate)) : null
  });
  bumpMetaDirty(currentFloorId);
  buildMetadataPanel();
  draw();
}

function buildGateEditor(parentEl, currentGate, onSave) {
  var wrap = document.createElement('div');
  wrap.className = 'mp-gate-editor';
  wrap.style.cssText = 'margin:4px 0 8px 0; padding:6px; background:#1a1d22; border:1px solid #333; border-radius:3px; font-size:11px;';

  var gate = currentGate ? JSON.parse(JSON.stringify(currentGate)) : { type: 'key' };

  // Type selector
  var typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex; gap:4px; align-items:center; margin-bottom:4px;';
  var typeLbl = document.createElement('span');
  typeLbl.textContent = 'Type:';
  typeLbl.style.color = '#789';
  typeRow.appendChild(typeLbl);
  var typeSel = document.createElement('select');
  typeSel.style.cssText = 'flex:1; background:#111; color:#cfe; border:1px solid #444; padding:2px; font-size:11px; font-family:inherit;';
  GATE_TYPES.forEach(function(t) {
    if (t === 'none') return;
    var o = document.createElement('option');
    o.value = t; o.textContent = (GATE_ICONS[t] || '') + ' ' + t;
    typeSel.appendChild(o);
  });
  typeSel.value = gate.type || 'key';
  typeRow.appendChild(typeSel);
  wrap.appendChild(typeRow);

  // Dynamic fields container
  var fields = document.createElement('div');
  fields.className = 'mp-gate-fields';
  wrap.appendChild(fields);

  function renderFields() {
    fields.innerHTML = '';
    var t = typeSel.value;
    gate.type = t;
    if (t === 'key') {
      fields.appendChild(_mkInput('keyId', gate.keyId || '', function(v) { gate.keyId = v; }));
      fields.appendChild(_mkInput('keyName', gate.keyName || '', function(v) { gate.keyName = v; }));
      fields.appendChild(_mkCheckbox('consume', gate.consume !== false, function(v) { gate.consume = v; }));
    } else if (t === 'quest') {
      fields.appendChild(_mkInput('flag', gate.flag || '', function(v) { gate.flag = v; delete gate.questId; delete gate.stepId; delete gate.stepIdx; }));
      fields.appendChild(_mkInput('— or questId', gate.questId || '', function(v) { gate.questId = v; delete gate.flag; }));
      fields.appendChild(_mkInput('stepId', gate.stepId || '', function(v) { gate.stepId = v; delete gate.stepIdx; }));
    } else if (t === 'faction') {
      fields.appendChild(_mkSelect('factionId', FACTION_IDS, gate.factionId || 'mss', function(v) { gate.factionId = v; }));
      fields.appendChild(_mkSelect('minTier', FACTION_TIERS, gate.minTier || 'neutral', function(v) { gate.minTier = v; }));
    } else if (t === 'schedule') {
      fields.appendChild(_mkInput('openHour', String(gate.openHour != null ? gate.openHour : 8), function(v) { gate.openHour = parseInt(v, 10) || 0; }));
      fields.appendChild(_mkInput('closeHour', String(gate.closeHour != null ? gate.closeHour : 20), function(v) { gate.closeHour = parseInt(v, 10) || 0; }));
      fields.appendChild(_mkInput('days (csv)', gate.days ? gate.days.join(',') : '', function(v) { gate.days = v ? v.split(',').map(function(d){return d.trim();}) : null; }));
    } else if (t === 'breakable') {
      fields.appendChild(_mkInput('suit', gate.suit || '', function(v) { gate.suit = v || null; }));
      fields.appendChild(_mkInput('hits', String(gate.hits || 1), function(v) { gate.hits = parseInt(v, 10) || 1; }));
    }
    fields.appendChild(_mkInput('rejectHint', gate.rejectHint || '', function(v) { gate.rejectHint = v; }));
  }

  typeSel.addEventListener('change', renderFields);
  renderFields();

  // Save / Cancel buttons
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:4px; margin-top:6px;';
  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save gate';
  saveBtn.style.cssText = 'background:#2a3a2a; border:1px solid #4a6a4a; color:#9c6; padding:3px 8px; font-size:10px; cursor:pointer; font-family:inherit; border-radius:2px;';
  saveBtn.addEventListener('click', function() { onSave(gate); });
  btnRow.appendChild(saveBtn);
  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'background:#2a1a1a; border:1px solid #633; color:#fcc; padding:3px 8px; font-size:10px; cursor:pointer; font-family:inherit; border-radius:2px;';
  cancelBtn.addEventListener('click', function() {
    wrap.remove();
  });
  btnRow.appendChild(cancelBtn);
  wrap.appendChild(btnRow);

  parentEl.appendChild(wrap);
}

function _mkInput(label, value, onChange) {
  var row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:4px; margin:2px 0;';
  var lbl = document.createElement('span');
  lbl.textContent = label + ':';
  lbl.style.cssText = 'color:#789; min-width:70px; font-size:10px;';
  row.appendChild(lbl);
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.value = value;
  inp.style.cssText = 'flex:1; background:#111; color:#cfe; border:1px solid #444; padding:2px 4px; font-size:10px; font-family:inherit;';
  inp.addEventListener('input', function() { onChange(inp.value); });
  row.appendChild(inp);
  return row;
}

function _mkSelect(label, options, value, onChange) {
  var row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:4px; margin:2px 0;';
  var lbl = document.createElement('span');
  lbl.textContent = label + ':';
  lbl.style.cssText = 'color:#789; min-width:70px; font-size:10px;';
  row.appendChild(lbl);
  var sel = document.createElement('select');
  sel.style.cssText = 'flex:1; background:#111; color:#cfe; border:1px solid #444; padding:2px; font-size:10px; font-family:inherit;';
  options.forEach(function(o) {
    var opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.value = value;
  sel.addEventListener('change', function() { onChange(sel.value); });
  row.appendChild(sel);
  return row;
}

function _mkCheckbox(label, checked, onChange) {
  var row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:4px; margin:2px 0;';
  var lbl = document.createElement('span');
  lbl.textContent = label + ':';
  lbl.style.cssText = 'color:#789; min-width:70px; font-size:10px;';
  row.appendChild(lbl);
  var cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.addEventListener('change', function() { onChange(cb.checked); });
  row.appendChild(cb);
  return row;
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
      jmp.textContent = '\u2192';
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

      // ── Gate status row for this door (DOC-116) ──
      var resolved = resolveGateForDoor(currentFloor, d.x, d.y);
      var gateRow = document.createElement('div');
      gateRow.style.cssText = 'margin:2px 0 6px 22px; font-size:10px;';

      if (resolved) {
        var tierBadge = document.createElement('span');
        tierBadge.style.cssText = resolved.tier === 'tile'
          ? 'color:#fc8; font-weight:bold;'
          : 'color:#789; font-style:italic;';
        tierBadge.textContent = '[' + resolved.tier + '] ' + gateTypeLabel(resolved.gate);
        gateRow.appendChild(tierBadge);

        if (resolved.tier === 'tile') {
          // Tile override — show edit + remove buttons
          var editBtn = document.createElement('button');
          editBtn.textContent = 'edit';
          editBtn.style.cssText = 'margin-left:6px; background:#1a2a1a; border:1px solid #4a6a4a; color:#9c6; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
          editBtn.addEventListener('click', (function(dx, dy, g) {
            return function() {
              buildGateEditor(gateRow.parentNode, g, function(newGate) {
                setTileGate(dx, dy, newGate);
              });
            };
          })(d.x, d.y, resolved.gate));
          gateRow.appendChild(editBtn);
          var rmBtn = document.createElement('button');
          rmBtn.textContent = '\u00D7';
          rmBtn.title = 'Remove tile override (revert to inherited)';
          rmBtn.style.cssText = 'margin-left:3px; background:#2a1a1a; border:1px solid #633; color:#fcc; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
          rmBtn.addEventListener('click', (function(dx, dy) {
            return function() { setTileGate(dx, dy, null); };
          })(d.x, d.y));
          gateRow.appendChild(rmBtn);
        } else {
          // Inherited — show override button
          var overBtn = document.createElement('button');
          overBtn.textContent = 'override';
          overBtn.title = 'Create tile-level gate override for this door';
          overBtn.style.cssText = 'margin-left:6px; background:#1a1a2a; border:1px solid #446; color:#8af; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
          overBtn.addEventListener('click', (function(dx, dy, g) {
            return function() {
              buildGateEditor(gateRow.parentNode, g, function(newGate) {
                setTileGate(dx, dy, newGate);
              });
            };
          })(d.x, d.y, resolved.gate));
          gateRow.appendChild(overBtn);
        }
      } else {
        var noGate = document.createElement('span');
        noGate.style.cssText = 'color:#567; font-style:italic;';
        noGate.textContent = 'no gate';
        gateRow.appendChild(noGate);
        var addBtn = document.createElement('button');
        addBtn.textContent = '+ gate';
        addBtn.title = 'Add tile-level gate';
        addBtn.style.cssText = 'margin-left:6px; background:#1a1a2a; border:1px solid #446; color:#8af; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
        addBtn.addEventListener('click', (function(dx, dy) {
          return function() {
            buildGateEditor(gateRow.parentNode, null, function(newGate) {
              setTileGate(dx, dy, newGate);
            });
          };
        })(d.x, d.y));
        gateRow.appendChild(addBtn);
      }
      panel.appendChild(gateRow);
    });
  }

  // ── Edge Gates (DOC-116) ──
  var edgeGates = currentFloor.edgeGates || {};
  var edgeKeys = Object.keys(edgeGates);
  var dt = currentFloor.doorTargets || {};
  var uniqueTargets = {};
  Object.keys(dt).forEach(function(k) { if (dt[k]) uniqueTargets[dt[k]] = true; });
  var allTargets = Object.keys(uniqueTargets).sort();

  if (allTargets.length > 0 || edgeKeys.length > 0) {
    var egTitle = document.createElement('div');
    egTitle.className = 'mp-section-title';
    egTitle.textContent = 'EDGE GATES (' + edgeKeys.length + ')';
    panel.appendChild(egTitle);

    // Show existing edge gates + targets without gates
    var shownTargets = {};
    edgeKeys.forEach(function(tgt) { shownTargets[tgt] = true; });
    allTargets.forEach(function(tgt) { shownTargets[tgt] = true; });

    Object.keys(shownTargets).sort().forEach(function(tgt) {
      var eg = edgeGates[tgt];
      var egRow = document.createElement('div');
      egRow.style.cssText = 'font-size:10px; padding:2px 0; border-bottom:1px dotted #1a1d22;';
      var arrow = document.createElement('span');
      arrow.style.color = '#789';
      arrow.textContent = '\u2192 ' + tgt + ': ';
      egRow.appendChild(arrow);

      if (eg) {
        var lbl = document.createElement('span');
        lbl.style.cssText = 'color:#fc8; font-weight:bold;';
        lbl.textContent = gateTypeLabel(eg);
        egRow.appendChild(lbl);
        var editBtn = document.createElement('button');
        editBtn.textContent = 'edit';
        editBtn.style.cssText = 'margin-left:6px; background:#1a2a1a; border:1px solid #4a6a4a; color:#9c6; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
        editBtn.addEventListener('click', (function(t, g) {
          return function() {
            buildGateEditor(egRow.parentNode, g, function(newGate) {
              setEdgeGate(t, newGate);
            });
          };
        })(tgt, eg));
        egRow.appendChild(editBtn);
        var rmBtn = document.createElement('button');
        rmBtn.textContent = '\u00D7';
        rmBtn.title = 'Remove edge gate';
        rmBtn.style.cssText = 'margin-left:3px; background:#2a1a1a; border:1px solid #633; color:#fcc; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
        rmBtn.addEventListener('click', (function(t) {
          return function() { setEdgeGate(t, null); };
        })(tgt));
        egRow.appendChild(rmBtn);
      } else {
        var noLbl = document.createElement('span');
        noLbl.style.cssText = 'color:#567; font-style:italic;';
        noLbl.textContent = 'no gate';
        egRow.appendChild(noLbl);
        var addBtn = document.createElement('button');
        addBtn.textContent = '+ gate';
        addBtn.style.cssText = 'margin-left:6px; background:#1a1a2a; border:1px solid #446; color:#8af; padding:1px 5px; font-size:9px; cursor:pointer; font-family:inherit; border-radius:2px;';
        addBtn.addEventListener('click', (function(t) {
          return function() {
            buildGateEditor(egRow.parentNode, null, function(newGate) {
              setEdgeGate(t, newGate);
            });
          };
        })(tgt));
        egRow.appendChild(addBtn);
      }
      panel.appendChild(egRow);
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
  if (currentFloor.gates && Object.keys(currentFloor.gates).length) snippet.gates = currentFloor.gates;
  if (currentFloor.edgeGates && Object.keys(currentFloor.edgeGates).length) snippet.edgeGates = currentFloor.edgeGates;
  if (currentFloor.floorGate) snippet.floorGate = currentFloor.floorGate;
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
    currentFloor.gates = fresh.gates ? JSON.parse(JSON.stringify(fresh.gates)) : undefined;
    currentFloor.edgeGates = fresh.edgeGates ? JSON.parse(JSON.stringify(fresh.edgeGates)) : undefined;
    currentFloor.floorGate = fresh.floorGate ? JSON.parse(JSON.stringify(fresh.floorGate)) : undefined;
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

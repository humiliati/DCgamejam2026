// ═══════════════════════════════════════════════════════════════
//  bv-verb-nodes.js — Verb-Node stamper layer (DOC-110 P3 Ch.2)
//
//  Renders + edits the canonical spatial-node registry stored in
//  data/verb-nodes.json. Consumes the sidecar window.VERB_NODES_DATA
//  (seeded by data/verb-nodes.js) and template library
//  window.VERB_NODE_TEMPLATES (seeded by tools/verb-node-templates.js).
//
//  Features:
//    • Toolbar button "🛠 Nodes" toggles a floating panel.
//    • Layer overlay: each node draws as a colored glyph on the grid.
//    • Place single node (type picker + id prompt).
//    • Stamp template (template picker + faction-slot prompts +
//      instance-prefix prompt — the stamper translates {dx,dy}
//      offsets from the anchor click into absolute (x,y) nodes).
//    • Hover ghost preview while placing.
//    • Remove node (right-click on node).
//    • Export the full JSON (download) or write directly via FS API
//      if the user grants a data/ directory handle.
//
//  Depends on (must load AFTER):
//    bv-tile-schema.js, bv-floor-data.js, bv-edit-state.js,
//    bv-render.js, bv-interaction.js, bv-toolbar.js, bv-save-patcher.js
//  Depends on (sidecar globals — must be <script>-loaded BEFORE):
//    window.VERB_NODES_DATA, window.VERB_NODE_TEMPLATES
//
//  Exposes globals:
//    VN (public API), window.__vnSmokeTest
// ═══════════════════════════════════════════════════════════════
'use strict';

var VN = (function() {
  // ── Constants ────────────────────────────────────────────────
  // Colour + glyph per node type. Kept in lockstep with the
  // type enum in tools/verb-node-schema.json (9 types).
  var TYPE_STYLE = {
    bonfire:         { color: '#ff8844', glyph: '*', label: 'Bonfire' },
    well:            { color: '#66ccff', glyph: 'O', label: 'Well' },
    bench:           { color: '#bba877', glyph: '=', label: 'Bench' },
    shop_entrance:   { color: '#ffcc44', glyph: '$', label: 'Shop' },
    bulletin_board:  { color: '#cccccc', glyph: 'N', label: 'Bulletin board' },
    faction_post:    { color: '#cc6699', glyph: 'F', label: 'Faction post' },
    work_station:    { color: '#aa88dd', glyph: 'W', label: 'Work station' },
    rest_spot:       { color: '#77dd77', glyph: 'Z', label: 'Rest spot' },
    soup_kitchen:    { color: '#ff9966', glyph: 'S', label: 'Soup kitchen' }
  };
  var TYPE_ORDER = Object.keys(TYPE_STYLE);

  // Faction enum mirrors tools/verb-node-schema.json (7 factions).
  var FACTIONS = ['tide','foundry','admiralty','pinkerton','jesuit','bprd','mss'];

  // ── State ────────────────────────────────────────────────────
  var _byFloor = Object.create(null);    // { floorId: [node,...] }
  var _templates = [];
  var _meta = null;                      // header from sidecar
  var _dirty = false;
  var _visible = false;
  var _mode = 'off';                     // 'off' | 'single' | 'stamp'
  var _pendingType = 'bonfire';          // single-placement type
  var _pendingFaction = null;            // single-placement faction (only for faction_post)
  var _pendingTemplate = null;           // { template, slotValues, prefix }
  var _panelEl = null;
  var _dataDirHandle = null;             // FS-API handle for data/ dir

  // ── Data bootstrap ───────────────────────────────────────────
  function _bootFromSidecar() {
    var src = (typeof window !== 'undefined') ? window.VERB_NODES_DATA : null;
    if (!src || !src.nodesByFloor) {
      console.warn('[vn] window.VERB_NODES_DATA not present — verb-node layer starts empty');
      return;
    }
    _meta = src._meta || null;
    Object.keys(src.nodesByFloor).forEach(function(fid) {
      _byFloor[fid] = (src.nodesByFloor[fid] || []).map(function(n) {
        return _cloneNode(n);
      });
    });
    if (typeof window !== 'undefined' && window.VERB_NODE_TEMPLATES &&
        Array.isArray(window.VERB_NODE_TEMPLATES.templates)) {
      _templates = window.VERB_NODE_TEMPLATES.templates.slice();
    } else {
      console.warn('[vn] window.VERB_NODE_TEMPLATES missing — template stamping disabled');
    }
  }

  function _cloneNode(n) {
    var out = { id: String(n.id), type: String(n.type),
                x: n.x | 0, y: n.y | 0 };
    if (n.faction) out.faction = String(n.faction);
    if (n.contested) out.contested = true;
    return out;
  }

  function _list(floorId) {
    if (!_byFloor[floorId]) _byFloor[floorId] = [];
    return _byFloor[floorId];
  }

  function _allIds() {
    var set = Object.create(null);
    Object.keys(_byFloor).forEach(function(fid) {
      _byFloor[fid].forEach(function(n) { set[n.id] = true; });
    });
    return set;
  }

  function _uniqueId(base) {
    var existing = _allIds();
    if (!existing[base]) return base;
    for (var i = 2; i < 1000; i++) {
      var candidate = base + '_' + i;
      if (!existing[candidate]) return candidate;
    }
    return base + '_' + Date.now().toString(36);
  }

  // ── Mutation primitives ──────────────────────────────────────
  function addNode(floorId, node) {
    if (!floorId || !node) return false;
    var n = _cloneNode(node);
    var list = _list(floorId);
    // Same-tile collision guard (per validator)
    var collides = list.some(function(other) { return other.x === n.x && other.y === n.y; });
    if (collides) {
      showToast('Tile (' + n.x + ',' + n.y + ') already has a node on floor ' + floorId);
      return false;
    }
    var existing = _allIds();
    if (existing[n.id]) {
      n.id = _uniqueId(n.id);
    }
    list.push(n);
    _dirty = true;
    if (_visible && typeof draw === 'function') draw();
    _renderPanel();
    return n;
  }

  function removeNodeAt(floorId, x, y) {
    var list = _byFloor[floorId];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) {
        var removed = list.splice(i, 1)[0];
        _dirty = true;
        if (_visible && typeof draw === 'function') draw();
        _renderPanel();
        return removed;
      }
    }
    return false;
  }

  function nodeAt(floorId, x, y) {
    var list = _byFloor[floorId];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  // ── Template stamping ────────────────────────────────────────
  // Returns { placed: [{...node}], skipped: [{suffix, reason}] } — the
  // stamper resolves each template node to absolute coords, clones
  // + adds via addNode() (which handles id-uniquing + collision).
  function applyTemplate(tpl, anchorX, anchorY, opts) {
    if (!tpl) return { placed: [], skipped: [] };
    opts = opts || {};
    var prefix = opts.prefix || tpl.id;
    var slotValues = opts.slotValues || {};
    var floorId = opts.floorId || currentFloorId;
    var placed = [], skipped = [];
    tpl.nodes.forEach(function(spec) {
      var x = anchorX + (spec.dx | 0);
      var y = anchorY + (spec.dy | 0);
      if (x < 0 || x > 255 || y < 0 || y > 255) {
        skipped.push({ suffix: spec.suffix, reason: 'out-of-bounds (' + x + ',' + y + ')' });
        return;
      }
      var candidate = {
        id: prefix + '_' + spec.suffix,
        type: spec.type,
        x: x, y: y
      };
      if (spec.factionSlot) {
        var val = slotValues[spec.factionSlot];
        if (!val) {
          // Fall back to declared default
          var slotDef = (tpl.factionSlots || []).find(function(s) { return s.slot === spec.factionSlot; });
          if (slotDef && slotDef['default']) val = slotDef['default'];
        }
        if (val) candidate.faction = val;
      }
      var added = addNode(floorId, candidate);
      if (added) placed.push(added);
      else skipped.push({ suffix: spec.suffix, reason: 'collision or invalid' });
    });
    return { placed: placed, skipped: skipped };
  }

  // ── Export ───────────────────────────────────────────────────
  function buildJsonPayload() {
    // Emit in the same shape tools/extract-verb-nodes.js produces —
    // re-ingest round-trips through the validator + sidecar generator.
    var meta = {
      generatedFrom: _meta && _meta.generatedFrom
        ? _meta.generatedFrom
        : 'data/verb-nodes.json (authored directly; formerly inline in engine/verb-nodes.js _registerBuiltinNodes)',
      generatedAt: new Date().toISOString(),
      generator: 'tools/blockout-visualizer.html · bv-verb-nodes.js (DOC-110 P3 Ch.2)',
      schemaRef: 'tools/verb-node-schema.json',
      note: _meta && _meta.note ? _meta.note
        : 'Canonical VerbNodes registry. Edit via BO-V verb-node layer or data/verb-nodes.json directly.',
      floorCount: Object.keys(_byFloor).length,
      nodeCount: 0
    };
    var nodesByFloor = {};
    var total = 0;
    Object.keys(_byFloor).sort(_floorIdCmp).forEach(function(fid) {
      var list = _byFloor[fid];
      if (!list || !list.length) return;
      nodesByFloor[fid] = list.map(_cloneNode);
      total += list.length;
    });
    meta.nodeCount = total;
    return { _meta: meta, nodesByFloor: nodesByFloor };
  }

  function _floorIdCmp(a, b) {
    var A = String(a).split('.').map(Number);
    var B = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(A.length, B.length); i++) {
      var av = A[i] || 0, bv = B[i] || 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  async function saveToFs() {
    var payload = buildJsonPayload();
    var json = JSON.stringify(payload, null, 2);
    if (_dataDirHandle) {
      try {
        var handle = await _dataDirHandle.getFileHandle('verb-nodes.json', { create: false });
        var writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        _dirty = false;
        showToast('Wrote data/verb-nodes.json · ' + payload._meta.nodeCount + ' nodes');
        _renderPanel();
        return true;
      } catch (err) {
        console.warn('[vn] direct write failed', err);
        showToast('Direct write failed — falling back to download');
      }
    }
    _downloadJson(json, 'verb-nodes.json');
    showToast('Downloaded verb-nodes.json — replace data/verb-nodes.json and run tools/extract-verb-nodes.js');
    return false;
  }

  function _downloadJson(text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  async function requestDataDir() {
    if (typeof window.showDirectoryPicker !== 'function') {
      showToast('File System Access API unavailable — use download path');
      return false;
    }
    try {
      _dataDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      showToast('data/ dir granted — future saves write directly');
      _renderPanel();
      return true;
    } catch (err) {
      if (err && err.name !== 'AbortError') console.warn('[vn] dir pick failed', err);
      return false;
    }
  }

  // ── Rendering (piggy-backs on the BO-V draw loop) ────────────
  function renderLayer() {
    if (!_visible) return;
    if (typeof ctx === 'undefined' || !ctx) return;
    if (typeof currentFloorId === 'undefined' || !currentFloorId) return;
    var list = _byFloor[currentFloorId] || [];
    var cp = cellPx();

    list.forEach(function(n) {
      var style = TYPE_STYLE[n.type] || { color: '#ff00ff', glyph: '?' };
      var cx = VIEW.panX + (n.x + 0.5) * cp;
      var cy = VIEW.panY + (n.y + 0.5) * cp;
      var r = Math.max(4, cp * 0.38);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      if (cp >= 14) {
        ctx.fillStyle = '#000';
        ctx.font = 'bold ' + Math.max(9, cp * 0.45) + 'px Consolas';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(style.glyph, cx, cy);
      }
      // Faction tag (small dot top-right of ring)
      if (n.faction) {
        ctx.beginPath(); ctx.arc(cx + r * 0.75, cy - r * 0.75, Math.max(2, cp * 0.12), 0, Math.PI * 2);
        ctx.fillStyle = _factionColor(n.faction);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    });

    // Ghost preview of pending stamp under hover
    if (_mode === 'stamp' && _pendingTemplate && typeof HOVER !== 'undefined') {
      _renderStampGhost(HOVER.gx, HOVER.gy);
    } else if (_mode === 'single' && typeof HOVER !== 'undefined') {
      _renderSingleGhost(HOVER.gx, HOVER.gy);
    }
  }

  function _renderStampGhost(ax, ay) {
    var tpl = _pendingTemplate && _pendingTemplate.template;
    if (!tpl || typeof ctx === 'undefined') return;
    var cp = cellPx();
    ctx.save();
    ctx.globalAlpha = 0.45;
    tpl.nodes.forEach(function(spec) {
      var style = TYPE_STYLE[spec.type] || { color: '#ff00ff', glyph: '?' };
      var x = ax + (spec.dx | 0), y = ay + (spec.dy | 0);
      var cx = VIEW.panX + (x + 0.5) * cp;
      var cy = VIEW.panY + (y + 0.5) * cp;
      var r = Math.max(4, cp * 0.38);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.restore();
  }

  function _renderSingleGhost(ax, ay) {
    if (typeof ctx === 'undefined') return;
    var style = TYPE_STYLE[_pendingType] || { color: '#ff00ff' };
    var cp = cellPx();
    var cx = VIEW.panX + (ax + 0.5) * cp;
    var cy = VIEW.panY + (ay + 0.5) * cp;
    var r = Math.max(4, cp * 0.38);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = style.color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  function _factionColor(f) {
    switch (f) {
      case 'tide':      return '#5b7';
      case 'foundry':   return '#b73';
      case 'admiralty': return '#37b';
      case 'pinkerton': return '#b37';
      case 'jesuit':    return '#777';
      case 'bprd':      return '#3b7';
      case 'mss':       return '#773';
      default: return '#fff';
    }
  }

  // Monkey-patch draw() so the layer renders on every redraw.
  (function patchDraw() {
    if (typeof draw !== 'function') return;
    var origDraw = draw;
    draw = function() {
      origDraw.apply(this, arguments);
      try { renderLayer(); } catch (e) { console.warn('[vn] render failed', e); }
    };
  })();

  // ── Mouse interaction ────────────────────────────────────────
  function _onCanvasMouseDown(e) {
    if (_mode === 'off') return;
    if (e.button !== 0) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var g = screenToGrid(mx, my);
    if (g.x < 0 || g.y < 0) return;
    if (_mode === 'single') {
      e.preventDefault(); e.stopPropagation();
      _placeSingle(g.x, g.y);
      return;
    }
    if (_mode === 'stamp') {
      e.preventDefault(); e.stopPropagation();
      _placeStamp(g.x, g.y);
      return;
    }
  }

  function _onCanvasRightClick(e) {
    if (!_visible) return;
    if (typeof currentFloorId !== 'string') return;
    var rect = canvas.getBoundingClientRect();
    var g = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
    var hit = nodeAt(currentFloorId, g.x, g.y);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    if (confirm('Remove node "' + hit.id + '" at (' + hit.x + ',' + hit.y + ')?')) {
      removeNodeAt(currentFloorId, g.x, g.y);
      showToast('Removed node · dirty');
    }
  }

  function _placeSingle(x, y) {
    var suggestedPrefix = (currentFloorId || 'floor') + '_' + _pendingType;
    var idBase = _uniqueId(suggestedPrefix);
    var id = prompt('Node id (must be unique):', idBase);
    if (id === null) return;
    id = String(id || '').trim() || idBase;
    var node = { id: id, type: _pendingType, x: x, y: y };
    if (_pendingType === 'faction_post') {
      node.faction = _pendingFaction || 'admiralty';
    }
    var added = addNode(currentFloorId, node);
    if (added) showToast('Placed ' + _pendingType + ' "' + added.id + '" @ (' + x + ',' + y + ')');
  }

  function _placeStamp(ax, ay) {
    if (!_pendingTemplate) return;
    var res = applyTemplate(_pendingTemplate.template, ax, ay, {
      prefix: _pendingTemplate.prefix,
      slotValues: _pendingTemplate.slotValues,
      floorId: currentFloorId
    });
    var msg = 'Stamped "' + _pendingTemplate.template.id + '" · ' +
      res.placed.length + ' placed';
    if (res.skipped.length) msg += ', ' + res.skipped.length + ' skipped';
    showToast(msg);
    if (res.skipped.length) {
      res.skipped.forEach(function(s) {
        console.warn('[vn] stamp skipped ' + s.suffix + ': ' + s.reason);
      });
    }
  }

  // Install canvas listeners — capture phase so we pre-empt the
  // bv-interaction.js paint handler when in placement mode. If we're
  // not in placement mode we simply return and the default handler
  // runs on the bubble.
  (function wireCanvas() {
    var wrap = document.getElementById('canvas-wrap');
    if (!wrap) {
      document.addEventListener('DOMContentLoaded', wireCanvas);
      return;
    }
    wrap.addEventListener('mousedown', _onCanvasMouseDown, true);
    wrap.addEventListener('contextmenu', _onCanvasRightClick, true);
  })();

  // ── UI panel + toolbar button ────────────────────────────────
  function showToast(msg) {
    if (typeof showCopyToast === 'function') showCopyToast(msg);
    else console.log('[vn] ' + msg);
  }

  function _injectButton() {
    if (document.getElementById('btn-verb-nodes')) return;
    // Sit next to the Meta button (same visual tier).
    var anchor = document.getElementById('btn-meta') ||
                 document.getElementById('btn-stamps') ||
                 document.getElementById('btn-copy');
    if (!anchor) return;
    var b = document.createElement('button');
    b.id = 'btn-verb-nodes';
    b.textContent = '🛠 Nodes';
    b.title = 'Verb-node stamper — toggle node overlay + placement panel';
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
    b.addEventListener('click', togglePanel);
  }

  function togglePanel() {
    _visible = !_visible;
    var b = document.getElementById('btn-verb-nodes');
    if (b) b.classList.toggle('tool-active', _visible);
    _ensurePanel().style.display = _visible ? 'block' : 'none';
    if (_visible) _renderPanel();
    if (!_visible) {
      _mode = 'off';
      _pendingTemplate = null;
    }
    if (typeof draw === 'function') draw();
  }

  function _ensurePanel() {
    if (_panelEl) return _panelEl;
    var el = document.createElement('div');
    el.id = 'verb-node-panel';
    el.style.cssText = [
      'position:fixed', 'top:80px', 'left:8px', 'width:280px',
      'max-height:82vh', 'overflow-y:auto', 'background:#12161c',
      'border:1px solid #345', 'border-radius:6px', 'padding:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.55)', 'z-index:500',
      'color:#ddd', 'font:12px Consolas,monospace', 'display:none'
    ].join(';');
    document.body.appendChild(el);
    _panelEl = el;
    return el;
  }

  function _renderPanel() {
    var el = _ensurePanel();
    if (!_visible) return;
    var floorId = (typeof currentFloorId === 'string') ? currentFloorId : '(none)';
    var list = _byFloor[floorId] || [];
    var html = [];
    html.push('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">');
    html.push('  <strong style="color:#8cf;">🛠 Verb-Node Layer</strong>');
    html.push('  <button id="vn-close" title="Close (Shift+N)" style="background:#333;color:#ccc;border:1px solid #555;border-radius:3px;padding:1px 8px;cursor:pointer;">×</button>');
    html.push('</div>');

    html.push('<div style="color:#889;font-size:11px;margin-bottom:6px;">');
    html.push('Floor <strong style="color:#cde;">' + _escape(floorId) + '</strong> · ');
    html.push(list.length + ' node' + (list.length === 1 ? '' : 's'));
    if (_dirty) html.push(' · <span style="color:#fc8;">● unsaved</span>');
    html.push('</div>');

    // Mode selector
    html.push('<div style="border-top:1px dashed #345;margin:8px 0 4px;padding-top:6px;">');
    html.push('  <div style="color:#8cf;font-size:11px;margin-bottom:4px;">PLACEMENT MODE</div>');
    html.push('  <div style="display:flex;gap:4px;margin-bottom:6px;">');
    html.push('    <button data-vn-mode="off"    class="vn-mode-btn' + (_mode === 'off'    ? ' active' : '') + '">Off</button>');
    html.push('    <button data-vn-mode="single" class="vn-mode-btn' + (_mode === 'single' ? ' active' : '') + '">Single</button>');
    html.push('    <button data-vn-mode="stamp"  class="vn-mode-btn' + (_mode === 'stamp'  ? ' active' : '') + '">Stamp</button>');
    html.push('  </div>');
    html.push('</div>');

    // Single-mode sub-panel
    if (_mode === 'single') {
      html.push('<div style="padding:6px;background:#1a2030;border:1px solid #345;border-radius:3px;margin-bottom:6px;">');
      html.push('  <div style="color:#aac;font-size:11px;margin-bottom:4px;">Node type</div>');
      html.push('  <select id="vn-type-select" style="width:100%;background:#222;color:#ddd;border:1px solid #445;padding:3px;">');
      TYPE_ORDER.forEach(function(t) {
        html.push('    <option value="' + t + '"' + (t === _pendingType ? ' selected' : '') +
                  '>' + TYPE_STYLE[t].glyph + ' ' + _escape(TYPE_STYLE[t].label) + '</option>');
      });
      html.push('  </select>');
      if (_pendingType === 'faction_post') {
        html.push('  <div style="color:#aac;font-size:11px;margin:6px 0 4px;">Faction</div>');
        html.push('  <select id="vn-faction-select" style="width:100%;background:#222;color:#ddd;border:1px solid #445;padding:3px;">');
        FACTIONS.forEach(function(f) {
          var selected = ((_pendingFaction || 'admiralty') === f) ? ' selected' : '';
          html.push('    <option value="' + f + '"' + selected + '>' + _escape(f) + '</option>');
        });
        html.push('  </select>');
      }
      html.push('  <div style="color:#779;font-size:10px;margin-top:5px;">Click the grid to place. Right-click an existing node to remove.</div>');
      html.push('</div>');
    }

    // Stamp-mode sub-panel
    if (_mode === 'stamp') {
      html.push('<div style="padding:6px;background:#1a2030;border:1px solid #345;border-radius:3px;margin-bottom:6px;">');
      html.push('  <div style="color:#aac;font-size:11px;margin-bottom:4px;">Template</div>');
      if (!_templates.length) {
        html.push('  <div style="color:#c88;">(no templates loaded — check tools/verb-node-templates.js)</div>');
      } else {
        html.push('  <select id="vn-tpl-select" style="width:100%;background:#222;color:#ddd;border:1px solid #445;padding:3px;">');
        _templates.forEach(function(tpl) {
          var selected = (_pendingTemplate && _pendingTemplate.template.id === tpl.id) ? ' selected' : '';
          html.push('    <option value="' + _escape(tpl.id) + '"' + selected + '>' +
                    _escape(tpl.displayName || tpl.id) + ' · ' +
                    tpl.nodes.length + 'n</option>');
        });
        html.push('  </select>');
        var tpl = _pendingTemplate && _pendingTemplate.template;
        if (tpl) {
          html.push('  <div style="color:#779;font-size:10px;margin-top:5px;">' + _escape(tpl.description || '') + '</div>');
          if (tpl.anchorDescription) {
            html.push('  <div style="color:#ac9;font-size:10px;margin-top:3px;"><em>Anchor:</em> ' +
                      _escape(tpl.anchorDescription) + '</div>');
          }
          html.push('  <div style="color:#aac;font-size:11px;margin:6px 0 4px;">Instance prefix</div>');
          html.push('  <input id="vn-prefix" type="text" value="' +
                    _escape(_pendingTemplate.prefix || (floorId + '_' + tpl.id)) +
                    '" style="width:100%;background:#222;color:#ddd;border:1px solid #445;padding:3px;"/>');
          if (tpl.factionSlots && tpl.factionSlots.length) {
            tpl.factionSlots.forEach(function(slot) {
              html.push('  <div style="color:#aac;font-size:11px;margin:6px 0 4px;">' +
                        _escape(slot.label || slot.slot) + '</div>');
              html.push('  <select data-vn-slot="' + _escape(slot.slot) + '" style="width:100%;background:#222;color:#ddd;border:1px solid #445;padding:3px;">');
              FACTIONS.forEach(function(f) {
                var cur = (_pendingTemplate.slotValues[slot.slot]) || slot['default'] || 'admiralty';
                html.push('    <option value="' + f + '"' + (f === cur ? ' selected' : '') + '>' + _escape(f) + '</option>');
              });
              html.push('  </select>');
            });
          }
        }
      }
      html.push('  <div style="color:#779;font-size:10px;margin-top:6px;">Click the grid to stamp at the anchor. Nodes outside bounds are skipped.</div>');
      html.push('</div>');
    }

    // Node list on current floor
    html.push('<div style="border-top:1px dashed #345;margin:6px 0 4px;padding-top:6px;">');
    html.push('  <div style="color:#8cf;font-size:11px;margin-bottom:4px;">NODES ON THIS FLOOR</div>');
    if (!list.length) {
      html.push('  <div style="color:#666;font-style:italic;">No nodes on floor ' + _escape(floorId) + '</div>');
    } else {
      html.push('  <div style="max-height:180px;overflow-y:auto;border:1px solid #223;border-radius:3px;">');
      list.forEach(function(n) {
        var style = TYPE_STYLE[n.type] || { color: '#ff00ff', glyph: '?' };
        html.push('<div class="vn-row" data-vn-nx="' + n.x + '" data-vn-ny="' + n.y + '" ' +
                  'style="display:flex;gap:4px;align-items:center;padding:3px 4px;border-bottom:1px solid #223;cursor:pointer;">');
        html.push('  <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:' +
                  style.color + ';color:#000;text-align:center;font-weight:bold;line-height:16px;">' +
                  style.glyph + '</span>');
        html.push('  <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cde;">' +
                  _escape(n.id) + '</span>');
        html.push('  <span style="color:#778;font-size:10px;">' + n.x + ',' + n.y + '</span>');
        if (n.faction) {
          html.push('  <span style="color:' + _factionColor(n.faction) + ';font-size:10px;">' + _escape(n.faction) + '</span>');
        }
        html.push('</div>');
      });
      html.push('  </div>');
    }
    html.push('</div>');

    // Save/export actions
    html.push('<div style="border-top:1px dashed #345;margin:8px 0 4px;padding-top:6px;display:flex;gap:4px;flex-wrap:wrap;">');
    html.push('  <button id="vn-save" style="flex:1;padding:5px;background:#2a4a6a;color:#cfe;border:1px solid #4a6a8a;border-radius:3px;cursor:pointer;">💾 Save verb-nodes.json</button>');
    if (typeof window.showDirectoryPicker === 'function' && !_dataDirHandle) {
      html.push('  <button id="vn-pick-dir" title="Grant access to data/ so Save writes directly" style="padding:5px;background:#2a3a4a;color:#ccc;border:1px solid #456;border-radius:3px;cursor:pointer;">📂 data/</button>');
    } else if (_dataDirHandle) {
      html.push('  <span style="padding:5px;color:#6a8;font-size:10px;">✔ data/ linked</span>');
    }
    html.push('</div>');
    html.push('<div style="color:#789;font-size:10px;margin-top:4px;">After Save: <code>node tools/extract-verb-nodes.js</code> regenerates the sidecar (or let the pre-commit hook do it).</div>');

    el.innerHTML = html.join('\n');

    // Wire handlers
    var closeBtn = el.querySelector('#vn-close');
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);

    Array.prototype.forEach.call(el.querySelectorAll('[data-vn-mode]'), function(btn) {
      btn.style.cssText = 'flex:1;padding:4px;background:' +
        (btn.classList.contains('active') ? '#2a4a6a;color:#fff;' : '#222;color:#aac;') +
        'border:1px solid #456;border-radius:3px;cursor:pointer;';
      btn.addEventListener('click', function() {
        _setMode(btn.getAttribute('data-vn-mode'));
      });
    });

    var typeSel = el.querySelector('#vn-type-select');
    if (typeSel) typeSel.addEventListener('change', function() {
      _pendingType = typeSel.value;
      _renderPanel();
    });

    var factionSel = el.querySelector('#vn-faction-select');
    if (factionSel) factionSel.addEventListener('change', function() {
      _pendingFaction = factionSel.value;
    });

    var tplSel = el.querySelector('#vn-tpl-select');
    if (tplSel) tplSel.addEventListener('change', function() {
      _setPendingTemplate(tplSel.value);
      _renderPanel();
    });

    var prefixInput = el.querySelector('#vn-prefix');
    if (prefixInput) prefixInput.addEventListener('input', function() {
      if (_pendingTemplate) _pendingTemplate.prefix = prefixInput.value.trim();
    });

    Array.prototype.forEach.call(el.querySelectorAll('[data-vn-slot]'), function(sel) {
      sel.addEventListener('change', function() {
        var slot = sel.getAttribute('data-vn-slot');
        if (_pendingTemplate) _pendingTemplate.slotValues[slot] = sel.value;
      });
    });

    Array.prototype.forEach.call(el.querySelectorAll('.vn-row'), function(row) {
      row.addEventListener('click', function() {
        var x = parseInt(row.getAttribute('data-vn-nx'), 10);
        var y = parseInt(row.getAttribute('data-vn-ny'), 10);
        _jumpCameraTo(x, y);
      });
      row.addEventListener('dblclick', function() {
        var x = parseInt(row.getAttribute('data-vn-nx'), 10);
        var y = parseInt(row.getAttribute('data-vn-ny'), 10);
        var hit = nodeAt(floorId, x, y);
        if (hit && confirm('Remove "' + hit.id + '" at (' + x + ',' + y + ')?')) {
          removeNodeAt(floorId, x, y);
        }
      });
    });

    var saveBtn = el.querySelector('#vn-save');
    if (saveBtn) saveBtn.addEventListener('click', saveToFs);
    var pickBtn = el.querySelector('#vn-pick-dir');
    if (pickBtn) pickBtn.addEventListener('click', requestDataDir);
  }

  function _setMode(m) {
    _mode = m;
    if (m === 'stamp' && !_pendingTemplate && _templates.length) {
      _setPendingTemplate(_templates[0].id);
    }
    if (m !== 'stamp') _pendingTemplate = null;
    _renderPanel();
    if (typeof draw === 'function') draw();
  }

  function _setPendingTemplate(tplId) {
    var tpl = _templates.find(function(t) { return t.id === tplId; });
    if (!tpl) { _pendingTemplate = null; return; }
    var slotValues = {};
    (tpl.factionSlots || []).forEach(function(s) {
      if (s['default']) slotValues[s.slot] = s['default'];
    });
    var floorId = (typeof currentFloorId === 'string') ? currentFloorId : 'floor';
    _pendingTemplate = {
      template: tpl,
      prefix: floorId + '_' + tpl.id,
      slotValues: slotValues
    };
  }

  function _jumpCameraTo(x, y) {
    if (typeof canvas === 'undefined' || typeof VIEW === 'undefined') return;
    var cp = cellPx();
    VIEW.panX = canvas.width  / 2 - (x + 0.5) * cp;
    VIEW.panY = canvas.height / 2 - (y + 0.5) * cp;
    if (typeof draw === 'function') draw();
  }

  function _escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Refresh panel when user switches floors (so the node list reflects
  // the new floor). Piggyback on bv-floor-selection's selectFloor.
  (function patchSelectFloorForVN() {
    if (typeof selectFloor !== 'function') return;
    var original = selectFloor;
    selectFloor = function() {
      original.apply(this, arguments);
      if (_visible) _renderPanel();
    };
  })();

  // Keyboard: Shift+N toggles panel.
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
      e.preventDefault();
      togglePanel();
    }
  });

  // ── Boot ─────────────────────────────────────────────────────
  function _init() {
    _bootFromSidecar();
    _injectButton();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  return {
    // Introspection
    list: function(floorId) { return (_byFloor[floorId] || []).slice(); },
    floors: function() { return Object.keys(_byFloor).slice(); },
    stats: function() {
      var total = 0;
      Object.keys(_byFloor).forEach(function(fid) { total += _byFloor[fid].length; });
      return { floors: Object.keys(_byFloor).length, nodes: total, dirty: _dirty };
    },
    templates: function() { return _templates.slice(); },

    // Mutation (agent-scriptable)
    addNode: addNode,
    removeNodeAt: removeNodeAt,
    nodeAt: nodeAt,
    applyTemplate: applyTemplate,

    // Export
    buildJsonPayload: buildJsonPayload,
    saveToFs: saveToFs,
    requestDataDir: requestDataDir,

    // UI
    togglePanel: togglePanel,
    setMode: _setMode,
    setPendingTemplate: _setPendingTemplate,
    render: function() { if (typeof draw === 'function') draw(); }
  };
})();

// Dev smoke test — runs the full Ch.2 happy path:
//   1. state after boot
//   2. apply town_square template at an open spot
//   3. undo-like cleanup via removeNodeAt (per-node)
// Invoke from devtools console: __vnSmokeTest('1', 40, 20)
window.__vnSmokeTest = function(floorId, ax, ay) {
  floorId = floorId || (typeof currentFloorId === 'string' ? currentFloorId : '1');
  ax = (ax != null) ? ax : 40;
  ay = (ay != null) ? ay : 20;
  var before = VN.stats();
  console.log('[vn-smoke] before:', before);
  var tpl = VN.templates().find(function(t) { return t.id === 'town_square'; });
  if (!tpl) { console.error('[vn-smoke] town_square template missing'); return false; }
  var res = VN.applyTemplate(tpl, ax, ay, { prefix: 'smoke_tx', floorId: floorId });
  console.log('[vn-smoke] applied:', res.placed.length, 'placed,', res.skipped.length, 'skipped');
  res.placed.forEach(function(n) {
    console.log('  •', n.id, n.type, '@', n.x + ',' + n.y);
  });
  // Clean up
  res.placed.forEach(function(n) { VN.removeNodeAt(floorId, n.x, n.y); });
  var after = VN.stats();
  console.log('[vn-smoke] after cleanup:', after);
  return before.nodes === after.nodes;
};

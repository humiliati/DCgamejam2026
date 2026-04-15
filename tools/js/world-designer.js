// ============================================================
// world-designer.js — Pass 5b.1 DG-native read-only viewer
// ============================================================
// Fetches ./floor-data.json, synthesizes a graph (one node per
// floor, one edge per doorTargets entry), renders via jsPlumb
// Community Edition 2.15.6 vendored at ../vendor/jsplumb/.
//
// Depth coloring:
//   depth 1 (exterior)       → green   (#6a8)
//   depth 2 (interior)       → blue    (#79a)
//   depth 3+ (nested dungeon)→ purple  (#96b)
//
// Edges are colored by the max depth of source/target. Non-
// reciprocal doors render red dashed and increment warnings.
// ============================================================
(function() {
  'use strict';

  var FLOOR_DATA_URL   = './floor-data.json';
  var WORLD_LAYOUT_URL = './world-layout.json';

  var state = {
    floors: {},
    ghosts: {},   // Pass 5b.2: synthesized slot records (proc-gen + planned)
    nodes:  {},
    edges:  [],
    layout: {},
    warnings: 0,
    selected: null,
    jsp: null
  };

  function $(id) { return document.getElementById(id); }
  function setStatus(msg, cls) {
    var s = $('dg-status');
    s.textContent = msg;
    s.style.color = cls === 'err' ? '#f88' : (cls === 'ok' ? '#9c6' : '#789');
  }

  function loadData() {
    // Prefer the inline sidecar (floor-data.js) — works under file:// where
    // fetch() is CORS-blocked. Fall back to fetch when served via HTTP.
    if (window.FLOOR_DATA && window.FLOOR_DATA.floors) {
      state.floors = window.FLOOR_DATA.floors;
      setStatus('floors loaded (inline): ' + Object.keys(state.floors).length, 'ok');
      return Promise.resolve();
    }
    setStatus('loading floor-data.json…');
    return fetch(FLOOR_DATA_URL, { cache: 'no-store' })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(j) {
        state.floors = j.floors || {};
        setStatus('floors loaded: ' + Object.keys(state.floors).length, 'ok');
      });
  }

  function loadLayout() {
    if (window.WORLD_LAYOUT && window.WORLD_LAYOUT.positions) {
      state.layout = window.WORLD_LAYOUT.positions;
      return Promise.resolve();
    }
    return fetch(WORLD_LAYOUT_URL, { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : {}; })
      .catch(function() { return {}; })
      .then(function(j) { state.layout = j && j.positions ? j.positions : {}; });
  }

  function depthOf(id)  { return id.split('.').length; }
  function branchOf(id) { return id.split('.')[0]; }

  // Pass 5b.2: ghost-node synthesis. Walks every authored floor and
  // produces two classes of speculative slot:
  //   proc-gen: declared via parent.procGenChildren[] — carries kind/
  //             label/biomeHint/maxDepth, edge from the declared
  //             doorCoord.
  //   planned:  authored doorTargets pointing at a floor that neither
  //             exists nor is a declared proc-gen child. Rendered in
  //             amber so the unfinished road is visible.
  function buildGhosts() {
    var ghosts = {};
    // proc-gen first (authored intent)
    Object.keys(state.floors).forEach(function(parentId) {
      var f = state.floors[parentId];
      var kids = Array.isArray(f.procGenChildren) ? f.procGenChildren : [];
      kids.forEach(function(k) {
        if (!k || !k.id) return;
        if (state.floors[k.id]) return; // authored trumps ghost
        ghosts[k.id] = {
          id: k.id,
          cls: 'procgen',
          kind: k.kind || 'template',
          label: k.label || k.id,
          biomeHint: k.biomeHint || null,
          maxDepth: k.maxDepth || 1,
          parent: parentId,
          parentCoord: k.doorCoord || null
        };
      });
    });
    // planned second (dangling authored refs)
    Object.keys(state.floors).forEach(function(parentId) {
      var dt = state.floors[parentId].doorTargets || {};
      Object.keys(dt).forEach(function(coord) {
        var toId = dt[coord];
        if (!toId) return;
        if (state.floors[toId] || ghosts[toId]) return;
        ghosts[toId] = {
          id: toId, cls: 'planned', kind: 'planned', label: toId + ' (planned)',
          biomeHint: null, maxDepth: 1,
          parent: parentId, parentCoord: coord
        };
      });
    });
    return ghosts;
  }

  function autoLayout() {
    // Layout includes authored floors + ghosts, grouped by branch so
    // proc-gen / planned slots sit in the column as their parent.
    var all = [].concat(Object.keys(state.floors), Object.keys(state.ghosts));
    var branches = {};
    all.forEach(function(id) {
      var b = branchOf(id);
      (branches[b] = branches[b] || []).push(id);
    });
    var branchKeys = Object.keys(branches).sort(function(a, b) {
      return (parseFloat(a) || 0) - (parseFloat(b) || 0);
    });
    var COL_W = 230, ROW_H = 95, PAD_X = 40, PAD_Y = 40;
    var positions = {};
    branchKeys.forEach(function(b, bi) {
      var ids = branches[b].slice().sort(function(a, c) {
        var da = depthOf(a), dc = depthOf(c);
        if (da !== dc) return da - dc;
        return a < c ? -1 : a > c ? 1 : 0;
      });
      ids.forEach(function(id, i) {
        positions[id] = {
          x: PAD_X + bi * COL_W + (depthOf(id) - 1) * 30,
          y: PAD_Y + i * ROW_H
        };
      });
    });
    return positions;
  }

  function resolvePositions(reset) {
    if (reset) return autoLayout();
    var auto = autoLayout();
    var out = {};
    var all = [].concat(Object.keys(state.floors), Object.keys(state.ghosts));
    all.forEach(function(id) {
      out[id] = state.layout[id] || auto[id] || { x: 40, y: 40 };
    });
    return out;
  }

  function makeNode(id, floor, pos) {
    var d = depthOf(id);
    var el = document.createElement('div');
    el.className = 'dg-node depth-' + Math.min(d, 3);
    el.id = 'dg-node-' + id.replace(/\./g, '_');
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    el.innerHTML =
      '<div class="dg-node-id">' + id + '</div>' +
      '<div class="dg-node-biome">' + (floor.biome || 'unknown') + '</div>' +
      '<div class="dg-node-size">' + (floor.gridW || '?') + '×' + (floor.gridH || '?') +
        ' · d' + d + '</div>';
    el.addEventListener('click', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
    });
    $('dg-canvas').appendChild(el);
    return el;
  }

  function makeGhostNode(id, g, pos) {
    var d = depthOf(id);
    var el = document.createElement('div');
    el.className = 'dg-node dg-node-ghost dg-ghost-' + g.cls +
      ' depth-' + Math.min(d, 3);
    el.id = 'dg-node-' + id.replace(/\./g, '_');
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    var badge = g.kind.toUpperCase();
    var biome = g.biomeHint ? g.biomeHint : (g.cls === 'planned' ? 'not authored' : '—');
    var sizeLine = g.cls === 'procgen'
      ? ('proc-gen · d' + d + (g.maxDepth > 1 ? ' · x' + g.maxDepth : ''))
      : ('planned · d' + d);
    el.innerHTML =
      '<div class="dg-node-badge">' + badge + '</div>' +
      '<div class="dg-node-id">' + id + '</div>' +
      '<div class="dg-node-biome">' + biome + '</div>' +
      '<div class="dg-node-size">' + sizeLine + '</div>';
    el.addEventListener('click', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
    });
    $('dg-canvas').appendChild(el);
    return el;
  }

  function renderNodes(positions) {
    $('dg-canvas').innerHTML = '';
    state.nodes = {};
    Object.keys(state.floors).forEach(function(id) {
      var pos = positions[id];
      var el = makeNode(id, state.floors[id], pos);
      state.nodes[id] = { el: el, x: pos.x, y: pos.y, depth: depthOf(id), ghost: false };
    });
    Object.keys(state.ghosts).forEach(function(id) {
      var pos = positions[id];
      var g = state.ghosts[id];
      var el = makeGhostNode(id, g, pos);
      state.nodes[id] = { el: el, x: pos.x, y: pos.y, depth: depthOf(id), ghost: true, ghostCls: g.cls };
    });
  }

  function edgeTypeForSource(srcDepth, tgtDepth) {
    var d = Math.max(srcDepth, tgtDepth);
    if (d >= 3) return 'dungeon';
    if (d === 2) return 'interior';
    return 'exterior';
  }

  function isReciprocal(fromId, toId) {
    var tgt = state.floors[toId];
    if (!tgt || !tgt.doorTargets) return false;
    var dt = tgt.doorTargets;
    for (var k in dt) if (dt[k] === fromId) return true;
    return false;
  }

  function connectEdge(fromId, toId, cls, warn) {
    try {
      var conn = state.jsp.connect({
        source: state.nodes[fromId].el,
        target: state.nodes[toId].el,
        anchors: ['Right', 'Left'],
        endpoint: ['Dot', { radius: 3 }],
        connector: ['Bezier', { curviness: 40 }],
        paintStyle: { strokeWidth: 2 },
        endpointStyle: { fill: '#567' },
        cssClass: cls,
        overlays: warn ? [
          ['Label', { label: '!', cssClass: 'dg-warn-label', location: 0.5 }]
        ] : []
      });
      return conn;
    } catch (e) {
      console.warn('[world-designer] edge failed', fromId, '->', toId, e);
      return null;
    }
  }

  function renderEdges() {
    state.edges = [];
    state.warnings = 0;
    // 1) Authored → authored (strict reciprocity check)
    Object.keys(state.floors).forEach(function(fromId) {
      var dt = state.floors[fromId].doorTargets || {};
      var seen = {};
      Object.keys(dt).forEach(function(coord) {
        var toId = dt[coord];
        if (!toId) return;
        if (seen[toId]) return;
        seen[toId] = 1;
        if (state.floors[toId]) {
          var reciprocal = isReciprocal(fromId, toId);
          var type = edgeTypeForSource(depthOf(fromId), depthOf(toId));
          var cls = reciprocal ? ('dg-edge-' + type) : 'dg-edge-mismatch';
          if (!reciprocal) state.warnings++;
          var conn = connectEdge(fromId, toId, cls, !reciprocal);
          if (conn) state.edges.push({ from: fromId, to: toId, conn: conn, type: type, reciprocal: reciprocal });
        } else if (state.ghosts[toId] && state.ghosts[toId].cls === 'planned') {
          // 2) Authored → planned ghost (dangling ref)
          var conn2 = connectEdge(fromId, toId, 'dg-edge-planned', false);
          if (conn2) state.edges.push({ from: fromId, to: toId, conn: conn2, type: 'planned', reciprocal: false });
        }
      });
    });
    // 3) Authored → proc-gen ghost (declared procGenChildren)
    Object.keys(state.floors).forEach(function(fromId) {
      var kids = state.floors[fromId].procGenChildren || [];
      kids.forEach(function(k) {
        if (!k || !k.id) return;
        if (state.floors[k.id]) return;
        var type = edgeTypeForSource(depthOf(fromId), depthOf(k.id));
        var cls = 'dg-edge-procgen dg-edge-' + type;
        var conn = connectEdge(fromId, k.id, cls, false);
        if (conn) state.edges.push({ from: fromId, to: k.id, conn: conn, type: 'procgen-' + type, reciprocal: false });
      });
    });
    $('sum-floors').textContent = Object.keys(state.floors).length +
      ' (+' + Object.keys(state.ghosts).length + ' ghosts)';
    $('sum-doors').textContent  = state.edges.length;
    $('sum-warn').textContent   = state.warnings;
  }

  function selectFloor(id) {
    if (state.selected && state.nodes[state.selected]) {
      state.nodes[state.selected].el.classList.remove('selected');
    }
    state.selected = id;
    if (state.nodes[id]) state.nodes[id].el.classList.add('selected');
    var body = $('dg-inspector-body');
    // Ghost (proc-gen or planned) — different inspector shape.
    if (state.ghosts[id]) {
      var g = state.ghosts[id];
      var parentHref = state.nodes[g.parent]
        ? '<a class="jump" data-jump="' + g.parent + '">' + g.parent + '</a>'
        : g.parent;
      body.innerHTML =
        '<div class="kv"><span class="k">Slot ID</span><span class="v">' + id + '</span></div>' +
        '<div class="kv"><span class="k">Class</span><span class="v">' + g.cls + '</span></div>' +
        '<div class="kv"><span class="k">Kind</span><span class="v">' + g.kind + '</span></div>' +
        '<div class="kv"><span class="k">Label</span><span class="v">' + g.label + '</span></div>' +
        '<div class="kv"><span class="k">Depth</span><span class="v">' + depthOf(id) + '</span></div>' +
        (g.biomeHint ? '<div class="kv"><span class="k">Biome hint</span><span class="v">' + g.biomeHint + '</span></div>' : '') +
        (g.cls === 'procgen' ? '<div class="kv"><span class="k">Max depth</span><span class="v">' + g.maxDepth + '</span></div>' : '') +
        '<div class="kv"><span class="k">Parent</span><span class="v">' + parentHref + '</span></div>' +
        (g.parentCoord ? '<div class="kv"><span class="k">Parent coord</span><span class="v">' + g.parentCoord + '</span></div>' : '') +
        '<div style="margin-top:12px; color:#789; font-style:italic; font-size:11px;">' +
          (g.cls === 'procgen'
            ? 'This slot is generated at runtime from a seed. See parent floor\'s procGenChildren[] for config.'
            : 'Dangling doorTarget — not yet authored. Either author the floor or remove the reference.') +
        '</div>';
      // wire jump links for the ghost body too
      Array.prototype.forEach.call(body.querySelectorAll('a.jump'), function(a) {
        a.addEventListener('click', function() {
          var to = a.getAttribute('data-jump');
          if (state.nodes[to]) {
            selectFloor(to);
            var n = state.nodes[to];
            var wrap = $('dg-canvas-wrap');
            wrap.scrollLeft = Math.max(0, n.x - wrap.clientWidth / 2 + 75);
            wrap.scrollTop  = Math.max(0, n.y - wrap.clientHeight / 2 + 27);
          }
        });
      });
      return;
    }
    var f = state.floors[id];
    if (!f) { body.innerHTML = '<div class="empty">Floor not found: ' + id + '</div>'; return; }
    var dt = f.doorTargets || {};
    var dtRows = Object.keys(dt).sort().map(function(k) {
      var to = dt[k];
      var reciprocal = isReciprocal(id, to);
      var warn = reciprocal ? '' : ' <span style="color:#f66;">(! not reciprocal)</span>';
      return '<div class="door-row">' + k + ' &rarr; <a class="jump" data-jump="' + to + '">' + to + '</a>' + warn + '</div>';
    }).join('') || '<div class="empty" style="margin:8px 0;">- no doors -</div>';
    var spawn = f.spawn || {};
    var kids = Array.isArray(f.procGenChildren) ? f.procGenChildren : [];
    var kidRows = kids.map(function(k) {
      return '<div class="door-row">' +
        (k.doorCoord ? k.doorCoord + ' &rarr; ' : '') +
        '<a class="jump" data-jump="' + k.id + '">' + k.id + '</a>' +
        ' <span style="color:#789;">[' + (k.kind || 'template') + ']</span>' +
        (k.label ? ' <span style="color:#9ab;">' + k.label + '</span>' : '') +
      '</div>';
    }).join('');
    body.innerHTML =
      '<div class="kv"><span class="k">Floor ID</span><span class="v">' + id + '</span></div>' +
      '<div class="kv"><span class="k">Biome</span><span class="v">' + (f.biome || '?') + '</span></div>' +
      '<div class="kv"><span class="k">Depth</span><span class="v">' + depthOf(id) + '</span></div>' +
      '<div class="kv"><span class="k">Grid</span><span class="v">' + f.gridW + '&times;' + f.gridH + '</span></div>' +
      '<div class="kv"><span class="k">Spawn</span><span class="v">(' + (spawn.x|0) + ',' + (spawn.y|0) + ') dir ' + (spawn.dir|0) + '</span></div>' +
      '<div class="kv"><span class="k">Rooms</span><span class="v">' + ((f.rooms || []).length) + '</span></div>' +
      '<div class="kv"><span class="k">Entities</span><span class="v">' + ((f.entities || []).length) + '</span></div>' +
      '<h3 style="margin-top:14px;">Doors (' + Object.keys(dt).length + ')</h3>' +
      dtRows +
      (kids.length ? '<h3 style="margin-top:14px;">Proc-gen slots (' + kids.length + ')</h3>' + kidRows : '');
    Array.prototype.forEach.call(body.querySelectorAll('a.jump'), function(a) {
      a.addEventListener('click', function() {
        var to = a.getAttribute('data-jump');
        if (state.nodes[to]) {
          selectFloor(to);
          var n = state.nodes[to];
          var wrap = $('dg-canvas-wrap');
          wrap.scrollLeft = Math.max(0, n.x - wrap.clientWidth / 2 + 75);
          wrap.scrollTop  = Math.max(0, n.y - wrap.clientHeight / 2 + 27);
        }
      });
    });
  }

  function snapshotPositions() {
    var out = {};
    Object.keys(state.nodes).forEach(function(id) {
      var el = state.nodes[id].el;
      out[id] = { x: parseInt(el.style.left, 10) || 0, y: parseInt(el.style.top, 10) || 0 };
    });
    return out;
  }

  function downloadLayout() {
    var payload = {
      generated: new Date().toISOString(),
      note: 'tools/world-layout.json — save next to floor-data.json to persist node positions (gitignored by default).',
      positions: snapshotPositions()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'world-layout.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 100);
    setStatus('world-layout.json downloaded', 'ok');
  }

  function rebuild(resetLayout) {
    if (state.jsp) { try { state.jsp.reset(); } catch (e) {} }
    $('dg-canvas').innerHTML = '';
    var jsp = window.jsPlumb.getInstance({
      Container: $('dg-canvas'),
      ConnectionsDetachable: false,
      EndpointStyle: { fill: '#567' },
      PaintStyle: { strokeWidth: 2, stroke: '#789' }
    });
    state.jsp = jsp;
    state.ghosts = buildGhosts();
    var positions = resolvePositions(resetLayout);
    renderNodes(positions);
    jsp.batch(function() {
      Object.keys(state.nodes).forEach(function(id) {
        jsp.draggable(state.nodes[id].el, { grid: [10, 10] });
      });
      renderEdges();
    });
  }

  function wire() {
    $('btn-reload').addEventListener('click', function() {
      setStatus('reloading…');
      Promise.all([loadData(), loadLayout()])
        .then(function() { rebuild(false); setStatus('reloaded', 'ok'); })
        .catch(function(e) { setStatus('reload failed: ' + e.message, 'err'); });
    });
    $('btn-layout-reset').addEventListener('click', function() {
      state.layout = {};
      rebuild(true);
      setStatus('layout reset', 'ok');
    });
    $('btn-layout-save').addEventListener('click', downloadLayout);
    $('dg-canvas-wrap').addEventListener('click', function() {
      if (state.selected && state.nodes[state.selected]) {
        state.nodes[state.selected].el.classList.remove('selected');
      }
      state.selected = null;
      $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
    });
  }

  function boot() {
    if (!window.jsPlumb) {
      setStatus('jsPlumb not loaded (vendor/jsplumb/jsplumb.min.js)', 'err');
      console.error('[world-designer] jsPlumb global missing');
      return;
    }
    wire();
    Promise.all([loadData(), loadLayout()])
      .then(function() { rebuild(false); setStatus('ready', 'ok'); })
      .catch(function(e) { setStatus('load failed: ' + e.message, 'err'); console.error(e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.DG_WORLD = { state: state, rebuild: rebuild, snapshotPositions: snapshotPositions };
})();

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

  // ──────────────────────────────────────────────────────────
  // pendingFloorSpec sessionStorage schema (Pass 5c handoff)
  // ──────────────────────────────────────────────────────────
  // Key:   'pendingFloorSpec'  (sessionStorage, per-origin/per-tab)
  // Value: JSON object, shape:
  //   {
  //     id:          "1.4",            // unique dotted floor id
  //     parent:      "1",              // parent id (dot-trimmed) or null for root
  //     biome:       "boardwalk",      // biome key (see bv-floor-presets)
  //     w:           50,               // grid width
  //     h:           36,               // grid height
  //     depth:       2,                // derived from dot-count
  //     doorCoord:   "12,4",           // coord on PARENT where DOOR lives (optional)
  //     createdAt:   "2026-04-15T…",   // ISO timestamp
  //     createdBy:   "world-designer"  // source tool
  //   }
  // Consumers: tools/js/bv-floor-data.js reads this on boot and seeds
  //            an empty grid + metadata, then clears the key.
  // ──────────────────────────────────────────────────────────
  var PENDING_KEY = 'pendingFloorSpec';

  // Pending pool — pre-BO-V floors that the designer has authored in-memory
  // but that have not been committed to floor-data.js yet. Persisted via
  // sessionStorage under 'pendingFloorPool' so reload survives the tab.
  var PENDING_POOL_KEY = 'pendingFloorPool';

  var state = {
    floors: {},
    ghosts: {},   // Pass 5b.2: synthesized slot records (proc-gen + planned)
    pendings: {}, // Pass 5c: uncommitted authored floors awaiting BO-V
    nodes:  {},
    edges:  [],
    layout: {},
    warnings: 0,
    selected: null,
    jsp: null,
    biomeMap: null,   // M3: biome-map.json data (keyed by biome name)
    tileSchema: null  // M3: tile-schema.json data (keyed by tile id string)
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

  // ── M3: biome-map + tile-schema loaders ──────────────────────
  function loadBiomeMap() {
    return fetch('./biome-map.json', { cache: 'no-store' })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(j) {
        state.biomeMap = (j && j.biomes) ? j.biomes : {};
        console.log('[world-designer] biome-map loaded: ' + Object.keys(state.biomeMap).length + ' biomes');
      })
      .catch(function(e) {
        console.warn('[world-designer] biome-map.json load failed:', e);
        state.biomeMap = {};
      });
  }

  function loadTileSchema() {
    return fetch('./tile-schema.json', { cache: 'no-store' })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(j) {
        state.tileSchema = (j && j.tiles) ? j.tiles : {};
        console.log('[world-designer] tile-schema loaded: ' + Object.keys(state.tileSchema).length + ' tiles');
      })
      .catch(function(e) {
        console.warn('[world-designer] tile-schema.json load failed:', e);
        state.tileSchema = {};
      });
  }

  /** Resolve a tile name (e.g. "WALL") to its integer id, or null. */
  function resolveTileName(name) {
    if (!state.tileSchema || !name) return null;
    for (var id in state.tileSchema) {
      if (state.tileSchema.hasOwnProperty(id) && state.tileSchema[id].name === name) {
        return parseInt(id, 10);
      }
    }
    return null;
  }

  /** Build an array of tile IDs from an array of tile names. */
  function resolveNameArray(names) {
    if (!Array.isArray(names)) return [];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var id = resolveTileName(names[i]);
      if (id != null) out.push(id);
    }
    return out;
  }

  /**
   * Populate the biome <select> dropdown from loaded biome-map.json.
   * Called once after data loads and again when modal opens.
   */
  function populateBiomeSelect() {
    var sel = $('nf-biome');
    sel.innerHTML = '';
    var biomes = state.biomeMap || {};
    var keys = Object.keys(biomes).sort(function(a, b) {
      // Sort by depth first, then alphabetically
      var da = biomes[a].depth || 0, db = biomes[b].depth || 0;
      if (da !== db) return da - db;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    if (keys.length === 0) {
      // Fallback if biome-map didn't load
      var fb = ['exterior', 'promenade', 'bazaar', 'inn', 'cellar', 'catacomb'];
      for (var f = 0; f < fb.length; f++) {
        var o = document.createElement('option');
        o.value = fb[f]; o.textContent = fb[f];
        sel.appendChild(o);
      }
      return;
    }
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var bm = biomes[key];
      var o = document.createElement('option');
      o.value = key;
      o.textContent = key + ' (d' + (bm.depth || '?') + ' ' + (bm.type || '') + ')';
      sel.appendChild(o);
    }
  }

  /**
   * Build the §3.1 seed payload for a new floor.
   * Returns the enriched payload object or a minimal fallback if biome-map
   * wasn't loaded.
   */
  function buildPayload(spec) {
    var biome = state.biomeMap ? state.biomeMap[spec.biome] : null;
    var depth = spec.depth || 1;

    // Resolve biome tile names → IDs
    var wallId  = resolveTileName(biome ? biome.wallTile  : 'WALL');
    var floorId = resolveTileName(biome ? biome.floorTile : 'EMPTY');
    var torchId = resolveTileName(biome ? biome.torchTile : 'TORCH_LIT');
    var accentIds  = biome ? resolveNameArray(biome.accentTiles)  : [];
    var breakIds   = biome ? resolveNameArray(biome.breakableSet) : [];

    // Build palette tile lists (wall variants + floor variants + light variants)
    // Include the primary tile + any accents that are wall-like or floor-like
    var wallPalette  = wallId  != null ? [wallId]  : [];
    var floorPalette = floorId != null ? [floorId] : [];
    var lightPalette = torchId != null ? [torchId] : [];

    // Add accent tiles to appropriate palette buckets based on their tile category
    for (var a = 0; a < accentIds.length; a++) {
      var aid = accentIds[a];
      var ts = state.tileSchema ? state.tileSchema[String(aid)] : null;
      if (!ts) continue;
      var cat = ts.category || '';
      if (cat === 'structure' || cat === 'wall') {
        if (wallPalette.indexOf(aid) < 0) wallPalette.push(aid);
      } else if (cat === 'floor' || cat === 'terrain') {
        if (floorPalette.indexOf(aid) < 0) floorPalette.push(aid);
      } else if (ts.isTorch) {
        if (lightPalette.indexOf(aid) < 0) lightPalette.push(aid);
      }
    }

    // ── Build required array ──────────────────────────────────
    var required = [];

    // Spawn is always required
    required.push({
      kind: 'spawn',
      hint: 'center-south',
      pinned: true
    });

    // Entry door — based on parent relationship
    if (spec.parent) {
      // Determine entry tile type from depth
      var entryTile;
      if (depth >= 3) {
        entryTile = resolveTileName('STAIRS_UP');
      } else {
        entryTile = resolveTileName('DOOR_EXIT');
      }
      required.push({
        kind: 'entry-door',
        tile: entryTile,
        faces: 'N',
        pinned: true,
        target: spec.parent
      });
    }

    // Build the §3.1 payload
    var payload = {
      version: 1,
      floorId: spec.id,
      authorSeed: ((Date.now() & 0xFFFFFFFF) ^ Math.floor(Math.random() * 0xFFFFFFFF) >>> 0).toString(16),
      parent: spec.parent || null,
      depth: depth,
      biome: {
        name: spec.biome,
        palette: {
          wall:  wallPalette,
          floor: floorPalette,
          ceiling: null,
          light: lightPalette
        },
        defaults: {
          wallTile:  wallId  != null ? wallId  : 1,
          floorTile: floorId != null ? floorId : 0,
          torchTile: torchId != null ? torchId : null
        },
        accentTiles: accentIds,
        breakableSet: breakIds
      },
      dimensions: { w: spec.w, h: spec.h },
      required: required,
      stamps: [],
      budget: biome ? {
        enemies:    { min: 0, max: depth >= 3 ? 6 : 3 },
        breakables: { min: 2, max: depth >= 3 ? 8 : 6 },
        lights:     { min: 1, max: depth >= 3 ? 2 : 4 }
      } : null,
      narrativeHints: []
    };

    return payload;
  }

  function depthOf(id)  { return id.split('.').length; }
  function branchOf(id) { return id.split('.')[0]; }

  // Pass 5c — floor-id helpers for New-Floor validation
  function parentOf(id) {
    if (!id) return null;
    var parts = id.split('.');
    if (parts.length <= 1) return null;
    parts.pop();
    return parts.join('.');
  }
  function isValidFloorId(id) {
    if (typeof id !== 'string') return false;
    if (!/^\d+(\.\d+)*$/.test(id)) return false;
    // No leading zeros on any segment (except literal "0")
    var parts = id.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].length > 1 && parts[i].charAt(0) === '0') return false;
    }
    return true;
  }
  function isIdTaken(id) {
    return !!(state.floors[id] || state.ghosts[id] || state.pendings[id]);
  }
  function isValidDoorCoord(s, w, h) {
    if (s == null || s === '') return { ok: true, coord: null };
    var m = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(s);
    if (!m) return { ok: false, msg: 'Door coord must be "x,y" integers.' };
    var x = parseInt(m[1], 10), y = parseInt(m[2], 10);
    if (x < 0 || y < 0) return { ok: false, msg: 'Door coord must be non-negative.' };
    // We validate against the PARENT's grid, not the new floor's. Caller
    // passes parent dimensions.
    if (w != null && x >= w) return { ok: false, msg: 'Door x >= parent W (' + w + ').' };
    if (h != null && y >= h) return { ok: false, msg: 'Door y >= parent H (' + h + ').' };
    return { ok: true, coord: x + ',' + y };
  }

  // Pending-pool persistence — survives reload within a tab.
  function loadPendings() {
    try {
      var raw = sessionStorage.getItem(PENDING_POOL_KEY);
      if (!raw) { state.pendings = {}; return; }
      var parsed = JSON.parse(raw);
      state.pendings = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.warn('[world-designer] pending pool load failed', e);
      state.pendings = {};
    }
  }
  function savePendings() {
    try {
      sessionStorage.setItem(PENDING_POOL_KEY, JSON.stringify(state.pendings));
    } catch (e) {
      console.warn('[world-designer] pending pool save failed', e);
    }
  }

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
        if (state.floors[toId] || ghosts[toId] || state.pendings[toId]) return;
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
    var all = [].concat(Object.keys(state.floors), Object.keys(state.ghosts), Object.keys(state.pendings));
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
    var all = [].concat(Object.keys(state.floors), Object.keys(state.ghosts), Object.keys(state.pendings));
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

  function makePendingNode(id, p, pos) {
    var d = depthOf(id);
    var el = document.createElement('div');
    el.className = 'dg-node dg-node-pending depth-' + Math.min(d, 3);
    el.id = 'dg-node-' + id.replace(/\./g, '_');
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    el.innerHTML =
      '<div class="dg-node-badge">PENDING</div>' +
      '<div class="dg-node-id">' + id + '</div>' +
      '<div class="dg-node-biome">' + (p.biome || '?') + '</div>' +
      '<div class="dg-node-size">' + (p.w || '?') + '×' + (p.h || '?') + ' · d' + d + '</div>';
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
    Object.keys(state.pendings).forEach(function(id) {
      var pos = positions[id];
      var p = state.pendings[id];
      var el = makePendingNode(id, p, pos);
      state.nodes[id] = { el: el, x: pos.x, y: pos.y, depth: depthOf(id), ghost: false, pending: true };
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
    // 4) Pending → parent edge (authored-but-uncommitted)
    Object.keys(state.pendings).forEach(function(pid) {
      var p = state.pendings[pid];
      if (!p.parent || !state.nodes[p.parent]) return;
      var conn = connectEdge(p.parent, pid, 'dg-edge-pending', false);
      if (conn) state.edges.push({ from: p.parent, to: pid, conn: conn, type: 'pending', reciprocal: false });
    });
    var pendCount = Object.keys(state.pendings).length;
    $('sum-floors').textContent = Object.keys(state.floors).length +
      ' (+' + Object.keys(state.ghosts).length + ' ghosts' +
      (pendCount ? ', +' + pendCount + ' pending' : '') + ')';
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
    // Pending (Pass 5c) — uncommitted authored floor
    if (state.pendings[id]) {
      var pf = state.pendings[id];
      var parentHrefP = state.nodes[pf.parent]
        ? '<a class="jump" data-jump="' + pf.parent + '">' + pf.parent + '</a>'
        : (pf.parent || '(root)');
      body.innerHTML =
        '<div class="kv"><span class="k">Floor ID</span><span class="v">' + id + '</span></div>' +
        '<div class="kv"><span class="k">Status</span><span class="v" style="color:#fc8;">PENDING</span></div>' +
        '<div class="kv"><span class="k">Biome</span><span class="v">' + (pf.biome || '?') + '</span></div>' +
        '<div class="kv"><span class="k">Depth</span><span class="v">' + depthOf(id) + '</span></div>' +
        '<div class="kv"><span class="k">Grid</span><span class="v">' + pf.w + '&times;' + pf.h + '</span></div>' +
        '<div class="kv"><span class="k">Parent</span><span class="v">' + parentHrefP + '</span></div>' +
        (pf.doorCoord ? '<div class="kv"><span class="k">Parent door</span><span class="v">' + pf.doorCoord + '</span></div>' : '') +
        '<div class="kv"><span class="k">Created</span><span class="v" style="font-size:10px;">' + (pf.createdAt || '') + '</span></div>' +
        '<div style="margin-top:12px; display:flex; gap:6px; flex-wrap:wrap;">' +
          '<button data-pending-action="open" style="background:#3a2d1a;border:1px solid #764;color:#fc8;padding:5px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:3px;">Open in BO-V</button>' +
          '<button data-pending-action="discard" style="background:#2a1a1a;border:1px solid #633;color:#fcc;padding:5px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:3px;">Discard</button>' +
        '</div>' +
        '<div style="margin-top:12px; color:#789; font-style:italic; font-size:11px;">' +
          'This floor has been authored in the graph but has no grid yet. Open it in the Blockout-Visualizer to paint tiles, then commit to floor-data.js.' +
        '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('a.jump'), function(a) {
        a.addEventListener('click', function() {
          var to = a.getAttribute('data-jump');
          if (state.nodes[to]) selectFloor(to);
        });
      });
      var openBtn = body.querySelector('[data-pending-action="open"]');
      var discardBtn = body.querySelector('[data-pending-action="discard"]');
      if (openBtn) openBtn.addEventListener('click', function() { openPendingInBOV(id); });
      if (discardBtn) discardBtn.addEventListener('click', function() { discardPending(id); });
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

  // ──────────────────────────────────────────────────────────
  // New-Floor modal (Pass 5c)
  // ──────────────────────────────────────────────────────────
  function openNewFloorModal(preselectParent) {
    var sel = $('nf-parent');
    // Populate parent dropdown with authored floors only (no ghosts/pendings).
    sel.innerHTML = '';
    var rootOpt = document.createElement('option');
    rootOpt.value = ''; rootOpt.textContent = '(root / no parent)';
    sel.appendChild(rootOpt);
    Object.keys(state.floors).sort().forEach(function(pid) {
      var o = document.createElement('option');
      o.value = pid; o.textContent = pid + ' — ' + (state.floors[pid].biome || '?');
      sel.appendChild(o);
    });
    if (preselectParent && state.floors[preselectParent]) sel.value = preselectParent;
    $('nf-id').value = suggestChildId(sel.value);
    $('nf-door').value = '';
    $('nf-err').textContent = '';
    $('dg-modal-new').classList.add('show');
    setTimeout(function() { $('nf-id').focus(); $('nf-id').select(); }, 30);
  }
  function closeNewFloorModal() {
    $('dg-modal-new').classList.remove('show');
  }
  function suggestChildId(parentId) {
    // Find lowest unused child index under parentId.
    var prefix = parentId ? (parentId + '.') : '';
    var used = {};
    function scan(set) {
      Object.keys(set).forEach(function(id) {
        if (parentId === '' ? depthOf(id) === 1 : parentOf(id) === parentId) {
          var last = parseInt(id.split('.').pop(), 10);
          if (!isNaN(last)) used[last] = 1;
        }
      });
    }
    scan(state.floors); scan(state.ghosts); scan(state.pendings);
    var n = (parentId === '') ? 0 : 1;  // root floors are conventionally 0-indexed; children 1-indexed
    while (used[n]) n++;
    return prefix + n;
  }
  function submitNewFloor() {
    var errEl = $('nf-err'); errEl.textContent = '';
    var parentId = $('nf-parent').value || '';
    var id = ($('nf-id').value || '').trim();
    var biome = $('nf-biome').value;
    var w = parseInt($('nf-w').value, 10);
    var h = parseInt($('nf-h').value, 10);
    var doorRaw = ($('nf-door').value || '').trim();

    if (!isValidFloorId(id)) { errEl.textContent = 'Invalid floor ID. Use dotted integers like "1.4" or "2.2.3".'; return; }
    if (isIdTaken(id))       { errEl.textContent = 'ID "' + id + '" already exists (authored, ghost, or pending).'; return; }
    if (parentId) {
      if (!state.floors[parentId]) { errEl.textContent = 'Parent "' + parentId + '" not authored.'; return; }
      if (parentOf(id) !== parentId) { errEl.textContent = 'ID "' + id + '" is not a child of "' + parentId + '". Expected "' + parentId + '.N".'; return; }
    } else {
      if (depthOf(id) !== 1) { errEl.textContent = 'Root floors must be depth 1 (no dots).'; return; }
    }
    if (isNaN(w) || w < 16 || w > 96) { errEl.textContent = 'W must be 16–96.'; return; }
    if (isNaN(h) || h < 16 || h > 96) { errEl.textContent = 'H must be 16–96.'; return; }

    var doorCoord = null;
    if (doorRaw) {
      var pf = parentId ? state.floors[parentId] : null;
      var pw = pf ? pf.gridW : null, ph = pf ? pf.gridH : null;
      var dv = isValidDoorCoord(doorRaw, pw, ph);
      if (!dv.ok) { errEl.textContent = dv.msg; return; }
      doorCoord = dv.coord;
    }

    var spec = {
      id: id,
      parent: parentId || null,
      biome: biome,
      w: w, h: h,
      depth: depthOf(id),
      doorCoord: doorCoord,
      createdAt: new Date().toISOString(),
      createdBy: 'world-designer'
    };
    // M3: attach the full §3.1 payload for BO-V consumption
    spec.payload = buildPayload(spec);
    state.pendings[id] = spec;
    savePendings();
    closeNewFloorModal();
    rebuild(false);
    selectFloor(id);
    setStatus('pending floor created: ' + id, 'ok');
  }

  function openPendingInBOV(id) {
    var spec = state.pendings[id];
    if (!spec) { setStatus('pending not found: ' + id, 'err'); return; }
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(spec));
    } catch (e) {
      setStatus('sessionStorage write failed: ' + e.message, 'err');
      return;
    }
    setStatus('handoff → blockout-visualizer', 'ok');
    // Same-origin navigation; BO-V reads PENDING_KEY on boot.
    window.location.href = 'blockout-visualizer.html';
  }

  function discardPending(id) {
    if (!state.pendings[id]) return;
    if (!window.confirm('Discard pending floor "' + id + '"? This cannot be undone.')) return;
    delete state.pendings[id];
    savePendings();
    if (state.selected === id) state.selected = null;
    rebuild(false);
    $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
    setStatus('pending discarded: ' + id, 'ok');
  }

  function wire() {
    $('btn-reload').addEventListener('click', function() {
      setStatus('reloading…');
      Promise.all([loadData(), loadLayout(), loadBiomeMap(), loadTileSchema()])
        .then(function() { populateBiomeSelect(); rebuild(false); setStatus('reloaded', 'ok'); })
        .catch(function(e) { setStatus('reload failed: ' + e.message, 'err'); });
    });
    $('btn-layout-reset').addEventListener('click', function() {
      state.layout = {};
      rebuild(true);
      setStatus('layout reset', 'ok');
    });
    $('btn-layout-save').addEventListener('click', downloadLayout);
    $('btn-new-floor').addEventListener('click', function() {
      // Preselect currently-selected authored floor as parent, if any.
      var pre = (state.selected && state.floors[state.selected]) ? state.selected : '';
      openNewFloorModal(pre);
    });
    $('nf-cancel').addEventListener('click', closeNewFloorModal);
    $('nf-create').addEventListener('click', submitNewFloor);
    $('nf-parent').addEventListener('change', function() {
      // Auto-suggest child id when parent changes (only if user hasn't typed).
      var id = $('nf-id').value.trim();
      if (id === '' || state.pendings[id] || state.floors[id] || state.ghosts[id]) {
        $('nf-id').value = suggestChildId($('nf-parent').value);
      }
    });
    $('dg-modal-new').addEventListener('click', function(ev) {
      if (ev.target === $('dg-modal-new')) closeNewFloorModal();
    });
    document.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape' && $('dg-modal-new').classList.contains('show')) {
        closeNewFloorModal();
      }
    });
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
    loadPendings();
    Promise.all([loadData(), loadLayout(), loadBiomeMap(), loadTileSchema()])
      .then(function() {
        populateBiomeSelect();
        rebuild(false);
        setStatus('ready', 'ok');
      })
      .catch(function(e) { setStatus('load failed: ' + e.message, 'err'); console.error(e); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.DG_WORLD = { state: state, rebuild: rebuild, snapshotPositions: snapshotPositions };
})();

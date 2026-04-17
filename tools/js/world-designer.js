// ============================================================
// world-designer.js — Pass 5b.3 DG-native world graph editor
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

  // Phase 6.3: recipe pool — procgen blueprints that haven't been expanded yet.
  var RECIPE_POOL_KEY = 'recipePool';

  var state = {
    floors: {},
    ghosts: {},   // Pass 5b.2: synthesized slot records (proc-gen + planned)
    pendings: {}, // Pass 5c: uncommitted authored floors awaiting BO-V
    recipes: {},  // Phase 6.3: procgen recipe blueprints (not yet expanded)
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
    return !!(state.floors[id] || state.ghosts[id] || state.pendings[id] || state.recipes[id]);
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

  // Phase 6.3: Recipe-pool persistence — survives reload within a tab.
  function loadRecipes() {
    try {
      var raw = sessionStorage.getItem(RECIPE_POOL_KEY);
      if (!raw) { state.recipes = {}; return; }
      var parsed = JSON.parse(raw);
      state.recipes = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.warn('[world-designer] recipe pool load failed', e);
      state.recipes = {};
    }
  }
  function saveRecipes() {
    try {
      sessionStorage.setItem(RECIPE_POOL_KEY, JSON.stringify(state.recipes));
    } catch (e) {
      console.warn('[world-designer] recipe pool save failed', e);
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
        if (state.floors[toId] || ghosts[toId] || state.pendings[toId] || state.recipes[toId]) return;
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
    var all = [].concat(Object.keys(state.floors), Object.keys(state.ghosts), Object.keys(state.pendings), Object.keys(state.recipes));
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
    var all = [].concat(Object.keys(state.floors), Object.keys(state.ghosts), Object.keys(state.pendings), Object.keys(state.recipes));
    all.forEach(function(id) {
      out[id] = state.layout[id] || auto[id] || { x: 40, y: 40 };
    });
    return out;
  }

  // Pass 5b.5: biome-tinted background color — mixes the biome's wallDark
  // palette color at low opacity with the depth base color.
  function biomeTintStyle(biomeKey) {
    if (!state.biomeMap || !biomeKey) return '';
    var b = state.biomeMap[biomeKey];
    if (!b || !b.palette || !b.palette.wallDark) return '';
    // Use wallDark at ~40% as background overlay
    return 'background: linear-gradient(135deg, ' + b.palette.wallDark + 'aa, ' + b.palette.wallDark + '44);' +
           'border-color: ' + b.palette.wallLight + '88;';
  }

  // Pass 5b.5: metadata summary line for node body
  function metaSummary(floor) {
    var parts = [];
    var entities = (floor.entities || []).length;
    var rooms = (floor.rooms || []).length;
    var doors = Object.keys(floor.doorTargets || {}).length;
    if (entities > 0) parts.push(entities + ' ent');
    if (rooms > 0) parts.push(rooms + ' rm');
    if (doors > 0) parts.push(doors + ' dr');
    return parts.length ? parts.join(' · ') : '';
  }

  function makeNode(id, floor, pos) {
    var d = depthOf(id);
    var el = document.createElement('div');
    el.className = 'dg-node depth-' + Math.min(d, 3);
    el.id = 'dg-node-' + id.replace(/\./g, '_');
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    // Pass 5b.5: biome-tinted background
    var tint = biomeTintStyle(floor.biome);
    if (tint) el.style.cssText += tint;
    var meta = metaSummary(floor);
    el.innerHTML =
      '<div class="dg-node-id">' + id + '</div>' +
      '<div class="dg-node-biome">' + (floor.biome || 'unknown') + '</div>' +
      '<div class="dg-node-size">' + (floor.gridW || '?') + '×' + (floor.gridH || '?') +
        ' · d' + d + '</div>' +
      (meta ? '<div class="dg-node-meta">' + meta + '</div>' : '');
    el.addEventListener('click', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
    });
    // Pass 5b.3: right-click context menu
    el.addEventListener('contextmenu', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
      showContextMenu(ev, id);
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
    el.addEventListener('contextmenu', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
      showContextMenu(ev, id);
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
    el.addEventListener('contextmenu', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
      showContextMenu(ev, id);
    });
    $('dg-canvas').appendChild(el);
    return el;
  }

  // Phase 6.3: recipe node factory
  function makeRecipeNode(id, rcp, pos) {
    var el = document.createElement('div');
    el.className = 'dg-node dg-node-recipe';
    el.id = 'dg-node-' + id.replace(/\./g, '_');
    el.style.left = pos.x + 'px';
    el.style.top  = pos.y + 'px';
    var stratLabel = rcp.strategy ? rcp.strategy.primary : '?';
    var sizeLabel = (rcp.size ? rcp.size.width + '×' + rcp.size.height : '?');
    el.innerHTML =
      '<div class="dg-node-badge">RECIPE</div>' +
      '<div class="dg-node-id">' + (rcp.title || id) + '</div>' +
      '<div class="dg-node-biome">' + (rcp.biome || '?') + '</div>' +
      '<div class="dg-node-size">' + sizeLabel + ' · ' + stratLabel + '</div>' +
      (rcp.faction && rcp.faction !== 'neutral' ? '<div class="dg-node-meta">' + rcp.faction + '</div>' : '');
    el.addEventListener('click', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
    });
    el.addEventListener('contextmenu', function(ev) {
      ev.stopPropagation();
      selectFloor(id);
      showContextMenu(ev, id);
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
    // Phase 6.3: recipe nodes
    Object.keys(state.recipes).forEach(function(id) {
      var pos = positions[id];
      var rcp = state.recipes[id];
      var el = makeRecipeNode(id, rcp, pos);
      state.nodes[id] = { el: el, x: pos.x, y: pos.y, depth: depthOf(id), ghost: false, pending: false, recipe: true };
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
    // 5) Phase 6.3: Recipe → parent edge
    Object.keys(state.recipes).forEach(function(rid) {
      var rcp = state.recipes[rid];
      if (!rcp._parent || !state.nodes[rcp._parent]) return;
      var conn = connectEdge(rcp._parent, rid, 'dg-edge-recipe', false);
      if (conn) state.edges.push({ from: rcp._parent, to: rid, conn: conn, type: 'recipe', reciprocal: false });
    });
    // 6) Phase 6.4: Pending → sibling pending edges (multi-floor expansion chain)
    Object.keys(state.pendings).forEach(function(pid) {
      var p = state.pendings[pid];
      if (!p._siblingNext || !state.nodes[p._siblingNext]) return;
      var conn = connectEdge(pid, p._siblingNext, 'dg-edge-pending dg-edge-sibling', false);
      if (conn) state.edges.push({ from: pid, to: p._siblingNext, conn: conn, type: 'sibling', reciprocal: false });
    });
    var pendCount = Object.keys(state.pendings).length;
    var rcpCount = Object.keys(state.recipes).length;
    $('sum-floors').textContent = Object.keys(state.floors).length +
      ' (+' + Object.keys(state.ghosts).length + ' ghosts' +
      (pendCount ? ', +' + pendCount + ' pending' : '') +
      (rcpCount ? ', +' + rcpCount + ' recipe' : '') + ')';
    $('sum-doors').textContent  = state.edges.length;
    $('sum-warn').textContent   = state.warnings;
  }

  // Pass 5b.2: render validation issues for a floor in the inspector
  function _buildValidationSection(floorId) {
    var group = _validationIssues[floorId];
    if (!group || !group.issues || !group.issues.length) return '';
    var html = '<h3 style="margin-top:14px; color:#f88;">Validation (' + group.issues.length + ')</h3>';
    group.issues.forEach(function(iss) {
      var color = iss.severity === 'err' ? '#f88' : iss.severity === 'warn' ? '#cc0' : '#8ad';
      html += '<div style="font-size:10px; padding:2px 0; color:' + color + ';">';
      html += '<b>[' + iss.severity + ']</b> ' + iss.kind + ': ' + iss.msg;
      html += '</div>';
    });
    return html;
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
        (pf._expansionIndex ? '<div class="kv"><span class="k">Chain</span><span class="v" style="color:#e8a;">floor ' + pf._expansionIndex + ' / ' + pf._expansionTotal + '</span></div>' : '') +
        (pf._siblingPrev ? '<div class="kv"><span class="k">Prev sibling</span><span class="v">' +
          (state.nodes[pf._siblingPrev] ? '<a class="jump" data-jump="' + pf._siblingPrev + '">' + pf._siblingPrev + '</a>' : pf._siblingPrev) + '</span></div>' : '') +
        (pf._siblingNext ? '<div class="kv"><span class="k">Next sibling</span><span class="v">' +
          (state.nodes[pf._siblingNext] ? '<a class="jump" data-jump="' + pf._siblingNext + '">' + pf._siblingNext + '</a>' : pf._siblingNext) + '</span></div>' : '') +
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
    // Phase 6.3: Recipe inspector
    if (state.recipes[id]) {
      var rcp = state.recipes[id];
      var parentHrefR = (rcp._parent && state.nodes[rcp._parent])
        ? '<a class="jump" data-jump="' + rcp._parent + '">' + rcp._parent + '</a>'
        : (rcp._parent || '(none)');
      var strat = rcp.strategy || {};
      var rooms = rcp.rooms || {};
      var corridors = rcp.corridors || {};
      var entities = rcp.entities || {};
      var doors = rcp.doors || {};
      var timer = rcp.timer || {};
      var isFetch = strat.primary === 'fetch';
      body.innerHTML =
        '<div class="kv"><span class="k">Recipe ID</span><span class="v" style="color:#aef;">' + (rcp.id || id) + '</span></div>' +
        '<div class="kv"><span class="k">Title</span><span class="v">' + (rcp.title || '—') + '</span></div>' +
        '<div class="kv"><span class="k">Status</span><span class="v" style="color:#6cb;">RECIPE</span></div>' +
        '<div class="kv"><span class="k">Biome</span><span class="v">' + (rcp.biome || '?') + '</span></div>' +
        (rcp.faction ? '<div class="kv"><span class="k">Faction</span><span class="v">' + rcp.faction + '</span></div>' : '') +
        '<div class="kv"><span class="k">Size</span><span class="v">' + (rcp.size ? rcp.size.width + '&times;' + rcp.size.height : '?') + '</span></div>' +
        '<div class="kv"><span class="k">Strategy</span><span class="v">' + (strat.primary || '?') + ' (' + (strat.weight != null ? strat.weight : 1) + ')</span></div>' +
        '<div class="kv"><span class="k">Parent</span><span class="v">' + parentHrefR + '</span></div>' +
        '<h3 style="margin-top:10px; color:#6cb;">Rooms</h3>' +
        '<div class="kv"><span class="k">Count</span><span class="v">' + (rooms.count ? rooms.count.join('–') : '3–7') + '</span></div>' +
        '<h3 style="margin-top:10px; color:#6cb;">Corridors</h3>' +
        '<div class="kv"><span class="k">Style</span><span class="v">' + (corridors.style || 'random') + '</span></div>' +
        '<div class="kv"><span class="k">Width</span><span class="v">' + (corridors.width || 1) + '</span></div>' +
        '<div class="kv"><span class="k">Extra loops</span><span class="v">' + (corridors.extraConnections != null ? corridors.extraConnections : 0.2) + '</span></div>' +
        '<h3 style="margin-top:10px; color:#6cb;">Entities</h3>' +
        '<div class="kv"><span class="k">Torch dens.</span><span class="v">' + (entities.torchDensity != null ? entities.torchDensity : 0.3) + '</span></div>' +
        '<div class="kv"><span class="k">Enemies</span><span class="v">' + (entities.enemyBudget ? entities.enemyBudget.join('–') : '2–6') + '</span></div>' +
        '<h3 style="margin-top:10px; color:#6cb;">Doors</h3>' +
        '<div class="kv"><span class="k">Entry</span><span class="v">' + (doors.entry || 'auto') + '</span></div>' +
        '<div class="kv"><span class="k">Exit</span><span class="v">' + (doors.exit || 'auto') + '</span></div>' +
        (doors.bossGate ? '<div class="kv"><span class="k">Boss gate</span><span class="v">yes</span></div>' : '') +
        (isFetch ? '<h3 style="margin-top:10px; color:#6cb;">Timer</h3>' +
          '<div class="kv"><span class="k">Budget</span><span class="v">' + (timer.budgetMs || 60000) + 'ms</span></div>' +
          '<div class="kv"><span class="k">Sentinel grace</span><span class="v">' + (timer.sentinelGraceMs || 12000) + 'ms</span></div>' +
          '<div class="kv"><span class="k">Hero</span><span class="v">' + (timer.heroArchetype || 'seeker') + '</span></div>' : '') +
        (rcp.seed != null ? '<div class="kv"><span class="k">Seed</span><span class="v">' + rcp.seed + '</span></div>' : '') +
        (rcp.expansion ? '<h3 style="margin-top:10px; color:#e8a;">Expansion</h3>' +
          '<div class="kv"><span class="k">Floors</span><span class="v">' + (rcp.expansion.floorCount || 3) + '</span></div>' +
          '<div class="kv"><span class="k">ID pattern</span><span class="v">' + (rcp.expansion.idPattern || '{parent}.{n}') + '</span></div>' +
          '<div class="kv"><span class="k">Last exit</span><span class="v">' + (rcp.expansion.lastFloorExit || 'none') + '</span></div>' +
          (rcp.expansion.ramp ? '<div class="kv"><span class="k">Ramp enemies</span><span class="v">+' + ((rcp.expansion.ramp.enemyBudget || 0) * 100).toFixed(0) + '%/lvl</span></div>' +
            '<div class="kv"><span class="k">Ramp torches</span><span class="v">' + ((rcp.expansion.ramp.torchDensity || 0) * 100).toFixed(0) + '%/lvl</span></div>' : '') : '') +
        '<div style="margin-top:12px; display:flex; gap:6px; flex-wrap:wrap;">' +
          '<button data-recipe-action="expand" style="background:#1a2a2a;border:1px solid #3a6a5a;color:#6cb;padding:5px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:3px;">' +
            (rcp.expansion ? 'Expand (' + (rcp.expansion.floorCount || 3) + ' floors)' : 'Expand (generate)') + '</button>' +
          '<button data-recipe-action="edit" style="background:#2a3a4a;border:1px solid #456;color:#cfe;padding:5px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:3px;">Edit</button>' +
          '<button data-recipe-action="discard" style="background:#2a1a1a;border:1px solid #633;color:#fcc;padding:5px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:3px;">Discard</button>' +
        '</div>' +
        '<div style="margin-top:12px; color:#789; font-style:italic; font-size:11px;">' +
          (rcp.expansion
            ? 'Multi-floor recipe. "Expand" creates ' + (rcp.expansion.floorCount || 3) + ' pending floors with auto-wired stair targets. For disk output:<br>' +
              '<code style="color:#6cb; font-size:10px;">bo bake-multi --recipe recipes/' + (rcp.id || id) + '.json --parent &lt;parentId&gt;</code>'
            : 'Procgen recipe blueprint. "Expand" converts to a pending floor via the bridge. For disk output:<br>' +
              '<code style="color:#6cb; font-size:10px;">bo bake --recipe recipes/' + (rcp.id || id) + '.json --id &lt;floorId&gt;</code>') +
        '</div>';
      // Wire jump links
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
      // Wire action buttons
      var expandBtn = body.querySelector('[data-recipe-action="expand"]');
      var editBtn = body.querySelector('[data-recipe-action="edit"]');
      var discardBtn2 = body.querySelector('[data-recipe-action="discard"]');
      if (expandBtn) expandBtn.addEventListener('click', function() { expandRecipe(id); });
      if (editBtn) editBtn.addEventListener('click', function() { openRecipeModal(id); });
      if (discardBtn2) discardBtn2.addEventListener('click', function() { discardRecipe(id); });
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
      (kids.length ? '<h3 style="margin-top:14px;">Proc-gen slots (' + kids.length + ')</h3>' + kidRows : '') +
      _buildValidationSection(id);
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
    scan(state.floors); scan(state.ghosts); scan(state.pendings); scan(state.recipes);
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

    // Pass 5b.3: if bridge is ready, create the floor in BO-V immediately
    var bridgeAvailable = (typeof WDBridge !== 'undefined' && WDBridge.ready);
    if (bridgeAvailable) {
      var wallId  = spec.payload.biome.defaults.wallTile;
      var floorId = spec.payload.biome.defaults.floorTile;
      WDBridge.run({
        action: 'createFloor',
        id: id,
        biome: biome,
        w: w, h: h,
        wallTile: wallId  != null ? wallId  : 1,
        floorTile: floorId != null ? floorId : 0,
        spawn: { x: w >> 1, y: h >> 1, dir: 0 },
        doorTargets: doorCoord && parentId ? (function() { var dt = {}; dt[doorCoord] = parentId; return dt; })() : {},
        force: false,
        select: false
      }).then(function(res) {
        if (res && res.ok !== false) {
          // Floor created in BO-V — add to local state as authored
          state.floors[id] = {
            floorId: id, biome: biome, gridW: w, gridH: h,
            spawn: { x: w >> 1, y: h >> 1, dir: 0 },
            doorTargets: doorCoord && parentId ? (function() { var dt = {}; dt[doorCoord] = parentId; return dt; })() : {},
            rooms: [], entities: []
          };
          // Also set reciprocal doorTarget on parent if door coord is set
          if (doorCoord && parentId && state.floors[parentId]) {
            if (!state.floors[parentId].doorTargets) state.floors[parentId].doorTargets = {};
            state.floors[parentId].doorTargets[doorCoord] = id;
            // Fire bridge call for the parent doorTarget too
            var cx = parseInt(doorCoord.split(',')[0], 10);
            var cy = parseInt(doorCoord.split(',')[1], 10);
            WDBridge.run({ action: 'setDoorTarget', floor: parentId, at: { x: cx, y: cy }, target: id })
              .catch(function(e) { console.warn('[world-designer] parent doorTarget bridge failed:', e); });
          }
          closeNewFloorModal();
          rebuild(false);
          selectFloor(id);
          setStatus('floor created via bridge: ' + id, 'ok');
        } else {
          // Bridge returned error — fall back to pending
          console.warn('[world-designer] bridge createFloor failed, using pending:', res);
          state.pendings[id] = spec;
          savePendings();
          closeNewFloorModal();
          rebuild(false);
          selectFloor(id);
          setStatus('pending floor created (bridge error): ' + id, 'ok');
        }
      }).catch(function(e) {
        console.warn('[world-designer] bridge createFloor error, using pending:', e);
        state.pendings[id] = spec;
        savePendings();
        closeNewFloorModal();
        rebuild(false);
        selectFloor(id);
        setStatus('pending floor created (bridge unavailable): ' + id, 'ok');
      });
    } else {
      // No bridge — create as pending (original behavior)
      state.pendings[id] = spec;
      savePendings();
      closeNewFloorModal();
      rebuild(false);
      selectFloor(id);
      setStatus('pending floor created: ' + id, 'ok');
    }
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

  // ── Pass 5b.2: Validation overlay ─────────────────────────
  var _validationIssues = {};  // floorId → [{severity, kind, msg, cells}, ...]

  function clearValidationOverlay() {
    _validationIssues = {};
    Object.keys(state.nodes).forEach(function(id) {
      var el = state.nodes[id].el;
      el.classList.remove('dg-val-err', 'dg-val-warn');
      var badge = el.querySelector('.dg-val-badge');
      if (badge) badge.parentNode.removeChild(badge);
    });
    $('sum-warn').textContent = state.warnings;
  }

  function applyValidationOverlay(issues) {
    clearValidationOverlay();
    if (!issues || !issues.length) {
      setStatus('validation: 0 issues', 'ok');
      return;
    }
    // Group by floorId
    var byFloor = {};
    issues.forEach(function(iss) {
      var fid = iss.floorId;
      if (!byFloor[fid]) byFloor[fid] = { err: 0, warn: 0, info: 0, issues: [] };
      byFloor[fid][iss.severity === 'err' ? 'err' : iss.severity === 'warn' ? 'warn' : 'info']++;
      byFloor[fid].issues.push(iss);
    });
    _validationIssues = byFloor;

    var totalErr = 0, totalWarn = 0;
    Object.keys(byFloor).forEach(function(fid) {
      var counts = byFloor[fid];
      totalErr += counts.err;
      totalWarn += counts.warn;
      var node = state.nodes[fid];
      if (!node) return;
      var el = node.el;
      // Outline class
      if (counts.err > 0)       el.classList.add('dg-val-err');
      else if (counts.warn > 0) el.classList.add('dg-val-warn');
      // Badge
      var sev = counts.err > 0 ? 'err' : counts.warn > 0 ? 'warn' : 'info';
      var total = counts.err + counts.warn + counts.info;
      var badge = document.createElement('div');
      badge.className = 'dg-val-badge ' + sev;
      badge.textContent = total;
      badge.title = counts.err + ' errors, ' + counts.warn + ' warnings, ' + counts.info + ' info';
      el.appendChild(badge);
    });
    $('sum-warn').textContent = state.warnings + ' reciprocity + ' + totalErr + ' err / ' + totalWarn + ' warn (BO)';
    setStatus('validation: ' + issues.length + ' issues (' + totalErr + ' err, ' + totalWarn + ' warn)', totalErr > 0 ? 'err' : 'ok');
  }

  function runBridgeValidation() {
    if (typeof WDBridge === 'undefined' || !WDBridge.ready) {
      setStatus('bridge not ready — validation requires BO-V iframe', 'err');
      return;
    }
    setStatus('validating via BO bridge…');
    WDBridge.validate('all').then(function(issues) {
      applyValidationOverlay(issues);
    }).catch(function(e) {
      setStatus('bridge validation failed: ' + e.message, 'err');
    });
  }

  // ──────────────────────────────────────────────────────────
  // Pass 5b.5: Subgraph zoom — focus on a floor + its subtree
  // ──────────────────────────────────────────────────────────
  var _zoomRoot = null; // null = full view, else = floor id prefix

  function zoomToSubgraph(rootId) {
    _zoomRoot = rootId;
    var prefix = rootId + '.';
    var wrap = $('dg-canvas-wrap');
    // Scroll to center the root node
    var rootNode = state.nodes[rootId];
    if (rootNode) {
      wrap.scrollLeft = Math.max(0, rootNode.x - wrap.clientWidth / 2 + 75);
      wrap.scrollTop  = Math.max(0, rootNode.y - wrap.clientHeight / 2 + 27);
    }
    // Dim nodes outside the subtree
    Object.keys(state.nodes).forEach(function(id) {
      var el = state.nodes[id].el;
      var inScope = (id === rootId || id.indexOf(prefix) === 0);
      el.style.opacity = inScope ? '1' : '0.25';
      el.style.pointerEvents = inScope ? 'auto' : 'none';
    });
    // Dim edges outside scope
    state.edges.forEach(function(e) {
      var inScope = (e.from === rootId || e.from.indexOf(prefix) === 0) ||
                    (e.to === rootId || e.to.indexOf(prefix) === 0);
      if (e.conn && e.conn.canvas) {
        e.conn.canvas.style.opacity = inScope ? '1' : '0.12';
      }
    });
    setStatus('zoomed: ' + rootId + ' subtree (' +
      Object.keys(state.nodes).filter(function(id) {
        return id === rootId || id.indexOf(prefix) === 0;
      }).length + ' nodes)', 'ok');
  }

  function zoomOut() {
    _zoomRoot = null;
    Object.keys(state.nodes).forEach(function(id) {
      var el = state.nodes[id].el;
      el.style.opacity = '';
      el.style.pointerEvents = '';
    });
    state.edges.forEach(function(e) {
      if (e.conn && e.conn.canvas) e.conn.canvas.style.opacity = '';
    });
    setStatus('zoom reset — full view', 'ok');
  }

  // ──────────────────────────────────────────────────────────
  // Pass 5b.5: Export graph to PNG
  // ──────────────────────────────────────────────────────────
  function exportToPng() {
    setStatus('rendering PNG…');
    // Use html2canvas-style approach: render the canvas div to a data URL
    // via a simple SVG foreignObject technique
    var canvas = $('dg-canvas');
    var rect = canvas.getBoundingClientRect();
    // Find bounding box of all nodes
    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    Object.keys(state.nodes).forEach(function(id) {
      var n = state.nodes[id];
      var el = n.el;
      var x = parseInt(el.style.left, 10) || 0;
      var y = parseInt(el.style.top, 10) || 0;
      var w = el.offsetWidth || 150;
      var h = el.offsetHeight || 60;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });
    // Pad
    var pad = 40;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX += pad;
    maxY += pad;
    var cw = maxX - minX;
    var ch = maxY - minY;

    // Create an offscreen canvas and draw node boxes + labels
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    // Background
    ctx.fillStyle = '#20232a';
    ctx.fillRect(0, 0, cw, ch);
    // Grid dots
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (var gx = 0; gx < cw; gx += 24) {
      for (var gy = 0; gy < ch; gy += 24) {
        ctx.fillRect(gx, gy, 1, 1);
      }
    }

    // Draw edges as lines
    state.edges.forEach(function(e) {
      var fromN = state.nodes[e.from];
      var toN = state.nodes[e.to];
      if (!fromN || !toN) return;
      var fx = (parseInt(fromN.el.style.left, 10) || 0) + 75 - minX;
      var fy = (parseInt(fromN.el.style.top, 10) || 0) + 27 - minY;
      var tx = (parseInt(toN.el.style.left, 10) || 0) + 75 - minX;
      var ty = (parseInt(toN.el.style.top, 10) || 0) + 27 - minY;
      ctx.strokeStyle = e.reciprocal === false ? '#f66' : (e.type === 'dungeon' ? '#b69' : e.type === 'interior' ? '#79a' : '#9b6');
      ctx.lineWidth = 2;
      if (!e.reciprocal) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      // Simple bezier
      var midX = (fx + tx) / 2 + (fy < ty ? 30 : -30);
      ctx.quadraticCurveTo(midX, (fy + ty) / 2, tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw nodes as rounded rects
    Object.keys(state.nodes).forEach(function(id) {
      var n = state.nodes[id];
      var el = n.el;
      var x = (parseInt(el.style.left, 10) || 0) - minX;
      var y = (parseInt(el.style.top, 10) || 0) - minY;
      var w = el.offsetWidth || 150;
      var h = el.offsetHeight || 60;
      // Background
      var bg = n.ghost ? '#1a1d22' : (n.depth >= 3 ? '#3a2a44' : n.depth === 2 ? '#2a3644' : '#2b3a2a');
      var border = n.ghost ? '#567' : (n.depth >= 3 ? '#96b' : n.depth === 2 ? '#79a' : '#6a8');
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      ctx.stroke();
      // ID text
      ctx.fillStyle = '#cfe';
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillText(id, x + 8, y + 16);
      // Biome text
      var floor = state.floors[id] || state.pendings[id];
      var biome = floor ? (floor.biome || '') : (state.ghosts[id] ? (state.ghosts[id].biomeHint || '') : '');
      ctx.fillStyle = '#9ab';
      ctx.font = '9px Consolas, monospace';
      ctx.fillText(biome.toUpperCase(), x + 8, y + 28);
      // Size
      var sizeText = floor ? ((floor.gridW || '?') + '×' + (floor.gridH || '?') + ' · d' + n.depth) : ('d' + n.depth);
      ctx.fillStyle = '#678';
      ctx.fillText(sizeText, x + 8, y + 40);
    });

    // Download
    try {
      var url = c.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = 'world-graph-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { a.remove(); }, 100);
      setStatus('PNG exported (' + cw + '×' + ch + ')', 'ok');
    } catch (e) {
      setStatus('PNG export failed: ' + e.message, 'err');
    }
  }

  // ──────────────────────────────────────────────────────────
  // Pass 5b.3: Context menu
  // ──────────────────────────────────────────────────────────
  var _ctxFloorId = null;

  function showContextMenu(ev, floorId) {
    _ctxFloorId = floorId;
    var menu = $('dg-ctx-menu');
    menu.style.display = 'block';
    menu.style.left = ev.clientX + 'px';
    menu.style.top  = ev.clientY + 'px';
    // Adjust if off-screen
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (ev.clientX - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (ev.clientY - rect.height) + 'px';
    ev.preventDefault();
    ev.stopPropagation();
  }

  function hideContextMenu() {
    $('dg-ctx-menu').style.display = 'none';
    _ctxFloorId = null;
  }

  function openInBlockoutEditor(floorId) {
    if (!floorId) return;
    var url = 'blockout-visualizer.html?floor=' + encodeURIComponent(floorId);
    window.open(url, '_blank');
    setStatus('opened ' + floorId + ' in BO-V', 'ok');
  }

  // ──────────────────────────────────────────────────────────
  // Pass 5b.3: Door contract modal
  // ──────────────────────────────────────────────────────────
  function openDoorContractModal(fromFloorId) {
    $('dc-from').value = fromFloorId || '';
    $('dc-from-coord').value = '';
    $('dc-to-coord').value = '';
    $('dc-err').textContent = '';
    $('dc-reciprocal').checked = true;
    // Populate "To floor" dropdown — all authored floors except fromFloorId
    var sel = $('dc-to');
    sel.innerHTML = '';
    Object.keys(state.floors).sort().forEach(function(fid) {
      if (fid === fromFloorId) return;
      var o = document.createElement('option');
      o.value = fid;
      o.textContent = fid + ' — ' + (state.floors[fid].biome || '?');
      sel.appendChild(o);
    });
    // Also include pending floors as possible targets
    Object.keys(state.pendings).sort().forEach(function(fid) {
      if (fid === fromFloorId) return;
      var o = document.createElement('option');
      o.value = fid;
      o.textContent = fid + ' (pending)';
      sel.appendChild(o);
    });
    $('dg-modal-door').classList.add('show');
    setTimeout(function() { $('dc-from-coord').focus(); }, 30);
  }

  function closeDoorContractModal() {
    $('dg-modal-door').classList.remove('show');
  }

  function submitDoorContract() {
    var errEl = $('dc-err'); errEl.textContent = '';
    var fromId = $('dc-from').value;
    var toId = $('dc-to').value;
    var fromCoordRaw = $('dc-from-coord').value.trim();
    var toCoordRaw = $('dc-to-coord').value.trim();
    var reciprocal = $('dc-reciprocal').checked;

    if (!fromId) { errEl.textContent = 'No source floor.'; return; }
    if (!toId) { errEl.textContent = 'Select a target floor.'; return; }
    if (fromId === toId) { errEl.textContent = 'Cannot link a floor to itself.'; return; }

    // Validate from-coord
    var fromFloor = state.floors[fromId];
    if (!fromFloor) { errEl.textContent = 'Source floor "' + fromId + '" not authored.'; return; }
    var fv = isValidDoorCoord(fromCoordRaw, fromFloor.gridW, fromFloor.gridH);
    if (!fv.ok) { errEl.textContent = 'From coord: ' + fv.msg; return; }
    if (!fv.coord) { errEl.textContent = 'From coord is required.'; return; }

    // Validate to-coord if reciprocal
    var toFloor = state.floors[toId];
    var tv = { ok: true, coord: null };
    if (reciprocal && toCoordRaw) {
      if (!toFloor) { errEl.textContent = 'Target "' + toId + '" not authored — cannot set reciprocal coord.'; return; }
      tv = isValidDoorCoord(toCoordRaw, toFloor.gridW, toFloor.gridH);
      if (!tv.ok) { errEl.textContent = 'To coord: ' + tv.msg; return; }
    }
    if (reciprocal && !tv.coord && toFloor) {
      errEl.textContent = 'Reciprocal checked but no "to" coord provided.';
      return;
    }

    // Route through bridge if available, else update local state
    var bridgeAvailable = (typeof WDBridge !== 'undefined' && WDBridge.ready);

    function applyForward() {
      if (bridgeAvailable) {
        return WDBridge.run({
          action: 'setDoorTarget',
          floor: fromId,
          at: { x: parseInt(fv.coord.split(',')[0], 10), y: parseInt(fv.coord.split(',')[1], 10) },
          target: toId
        });
      }
      // Local fallback
      if (!fromFloor.doorTargets) fromFloor.doorTargets = {};
      fromFloor.doorTargets[fv.coord] = toId;
      return Promise.resolve({ doorTargets: fromFloor.doorTargets });
    }

    function applyReverse() {
      if (!reciprocal || !tv.coord || !toFloor) return Promise.resolve(null);
      if (bridgeAvailable) {
        return WDBridge.run({
          action: 'setDoorTarget',
          floor: toId,
          at: { x: parseInt(tv.coord.split(',')[0], 10), y: parseInt(tv.coord.split(',')[1], 10) },
          target: fromId
        });
      }
      if (!toFloor.doorTargets) toFloor.doorTargets = {};
      toFloor.doorTargets[tv.coord] = fromId;
      return Promise.resolve({ doorTargets: toFloor.doorTargets });
    }

    applyForward().then(function() {
      return applyReverse();
    }).then(function() {
      closeDoorContractModal();
      rebuild(false);
      selectFloor(fromId);
      setStatus('door link: ' + fromId + ' → ' + toId + (reciprocal ? ' (reciprocal)' : ''), 'ok');
    }).catch(function(e) {
      errEl.textContent = 'Bridge error: ' + e.message;
    });
  }

  // ──────────────────────────────────────────────────────────
  // Pass 5b.3: Delete floor modal
  // ──────────────────────────────────────────────────────────
  var _deleteTarget = null;

  function openDeleteModal(floorId) {
    _deleteTarget = floorId;
    $('del-err').textContent = '';
    $('del-cascade').value = 'orphan';
    // Build info text
    var isAuthored = !!state.floors[floorId];
    var isPending = !!state.pendings[floorId];
    var isGhost = !!state.ghosts[floorId];
    var isRecipe = !!state.recipes[floorId];
    var childCount = 0;
    if (isAuthored) {
      var prefix = floorId + '.';
      Object.keys(state.floors).forEach(function(fid) {
        if (fid.indexOf(prefix) === 0) childCount++;
      });
    }
    var info = 'Floor: <b style="color:#fc8;">' + floorId + '</b>';
    if (isAuthored) info += ' <span style="color:#9c6;">(authored)</span>';
    else if (isRecipe) info += ' <span style="color:#6cb;">(recipe)</span>';
    else if (isPending) info += ' <span style="color:#fc8;">(pending)</span>';
    else if (isGhost) info += ' <span style="color:#789;">(ghost)</span>';
    if (childCount > 0) info += '<br>This floor has <b>' + childCount + '</b> descendant(s) in the tree.';
    $('del-info').innerHTML = info;
    $('dg-modal-delete').classList.add('show');
  }

  function closeDeleteModal() {
    $('dg-modal-delete').classList.remove('show');
    _deleteTarget = null;
  }

  function confirmDelete() {
    var errEl = $('del-err'); errEl.textContent = '';
    if (!_deleteTarget) return;
    var floorId = _deleteTarget;
    var cascade = $('del-cascade').value;

    // Recipe nodes just get removed from local pool
    if (state.recipes[floorId]) {
      delete state.recipes[floorId];
      saveRecipes();
      closeDeleteModal();
      if (state.selected === floorId) state.selected = null;
      rebuild(false);
      $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
      setStatus('recipe deleted: ' + floorId, 'ok');
      return;
    }

    // Pending floors just get removed from local pool
    if (state.pendings[floorId]) {
      delete state.pendings[floorId];
      savePendings();
      closeDeleteModal();
      if (state.selected === floorId) state.selected = null;
      rebuild(false);
      $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
      setStatus('pending floor deleted: ' + floorId, 'ok');
      return;
    }

    // Ghost floors — can't delete them, they're synthesized
    if (state.ghosts[floorId] && !state.floors[floorId]) {
      errEl.textContent = 'Ghost nodes are synthesized — delete the parent reference instead.';
      return;
    }

    // Authored floor — route through bridge if available
    var bridgeAvailable = (typeof WDBridge !== 'undefined' && WDBridge.ready);
    if (bridgeAvailable) {
      WDBridge.run({ action: 'deleteFloor', id: floorId, cascade: cascade })
        .then(function(res) {
          if (!res || !res.ok) {
            errEl.textContent = 'BO error: ' + ((res && res.error) || 'unknown');
            return;
          }
          var r = res.result || res;
          // Also remove from local state.floors to keep graph in sync
          var dels = r.deleted || [floorId];
          dels.forEach(function(d) {
            delete state.floors[d];
          });
          closeDeleteModal();
          if (state.selected === floorId) state.selected = null;
          rebuild(false);
          $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
          setStatus('deleted: ' + dels.join(', ') + (r.orphaned && r.orphaned.length ? ' (orphaned: ' + r.orphaned.join(', ') + ')' : ''), 'ok');
        })
        .catch(function(e) {
          errEl.textContent = 'Bridge error: ' + e.message;
        });
    } else {
      // Local-only fallback — just remove from state
      delete state.floors[floorId];
      closeDeleteModal();
      if (state.selected === floorId) state.selected = null;
      rebuild(false);
      $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
      setStatus('deleted locally (bridge not ready): ' + floorId, 'ok');
    }
  }

  // ──────────────────────────────────────────────────────────
  // Phase 6.3: Recipe modal + expand / edit / discard
  // ──────────────────────────────────────────────────────────
  var _editingRecipeId = null; // set when editing an existing recipe

  function openRecipeModal(editId) {
    _editingRecipeId = editId || null;
    // Populate parent dropdown
    var sel = $('rcp-parent');
    sel.innerHTML = '';
    var rootOpt = document.createElement('option');
    rootOpt.value = ''; rootOpt.textContent = '(no parent)';
    sel.appendChild(rootOpt);
    Object.keys(state.floors).sort().forEach(function(pid) {
      var o = document.createElement('option');
      o.value = pid; o.textContent = pid + ' — ' + (state.floors[pid].biome || '?');
      sel.appendChild(o);
    });

    if (_editingRecipeId && state.recipes[_editingRecipeId]) {
      // Pre-fill from existing recipe
      var r = state.recipes[_editingRecipeId];
      $('rcp-id').value = r.id || _editingRecipeId;
      $('rcp-title').value = r.title || '';
      if (r._parent) sel.value = r._parent;
      $('rcp-biome').value = r.biome || 'cellar';
      $('rcp-faction').value = r.faction || 'neutral';
      var st = r.strategy || {};
      $('rcp-strategy').value = st.primary || 'mixed';
      $('rcp-weight').value = st.weight != null ? st.weight : 1;
      $('rcp-w').value = r.size ? r.size.width : 30;
      $('rcp-h').value = r.size ? r.size.height : 30;
      var rm = r.rooms || {};
      $('rcp-room-min').value = rm.count ? rm.count[0] : 3;
      $('rcp-room-max').value = rm.count ? rm.count[1] : 7;
      var co = r.corridors || {};
      $('rcp-corr-style').value = co.style || 'random';
      $('rcp-corr-width').value = co.width || 1;
      $('rcp-corr-extra').value = co.extraConnections != null ? co.extraConnections : 0.2;
      var en = r.entities || {};
      $('rcp-torch').value = en.torchDensity != null ? en.torchDensity : 0.3;
      $('rcp-breakable').value = en.breakableDensity != null ? en.breakableDensity : 0.15;
      $('rcp-trap').value = en.trapDensity != null ? en.trapDensity : 0.05;
      $('rcp-chest-min').value = en.chestCount ? en.chestCount[0] : 1;
      $('rcp-chest-max').value = en.chestCount ? en.chestCount[1] : 3;
      $('rcp-enemy-min').value = en.enemyBudget ? en.enemyBudget[0] : 2;
      $('rcp-enemy-max').value = en.enemyBudget ? en.enemyBudget[1] : 6;
      var dr = r.doors || {};
      $('rcp-door-entry').value = dr.entry || 'auto';
      $('rcp-door-exit').value = dr.exit || 'auto';
      $('rcp-boss-gate').checked = !!dr.bossGate;
      var tm = r.timer || {};
      $('rcp-timer-budget').value = tm.budgetMs || 60000;
      $('rcp-timer-grace').value = tm.sentinelGraceMs || 12000;
      $('rcp-hero').value = tm.heroArchetype || 'seeker';
      $('rcp-seed').value = r.seed != null ? r.seed : '';
      $('rcp-id').disabled = true; // can't change id on edit
    } else {
      // Defaults for new recipe
      $('rcp-id').value = '';
      $('rcp-id').disabled = false;
      $('rcp-title').value = '';
      $('rcp-biome').value = 'cellar';
      $('rcp-faction').value = 'neutral';
      $('rcp-strategy').value = 'mixed';
      $('rcp-weight').value = '1';
      $('rcp-w').value = '30';
      $('rcp-h').value = '30';
      $('rcp-room-min').value = '3';
      $('rcp-room-max').value = '7';
      $('rcp-corr-style').value = 'random';
      $('rcp-corr-width').value = '1';
      $('rcp-corr-extra').value = '0.2';
      $('rcp-torch').value = '0.3';
      $('rcp-breakable').value = '0.15';
      $('rcp-trap').value = '0.05';
      $('rcp-chest-min').value = '1';
      $('rcp-chest-max').value = '3';
      $('rcp-enemy-min').value = '2';
      $('rcp-enemy-max').value = '6';
      $('rcp-door-entry').value = 'auto';
      $('rcp-door-exit').value = 'auto';
      $('rcp-boss-gate').checked = false;
      $('rcp-timer-budget').value = '60000';
      $('rcp-timer-grace').value = '12000';
      $('rcp-hero').value = 'seeker';
      $('rcp-seed').value = '';
      // Pre-select parent if an authored floor is selected
      if (state.selected && state.floors[state.selected]) sel.value = state.selected;
    }
    $('rcp-err').textContent = '';
    $('dg-modal-recipe').classList.add('show');
    setTimeout(function() { ($('rcp-id').disabled ? $('rcp-title') : $('rcp-id')).focus(); }, 30);
  }

  function closeRecipeModal() {
    $('dg-modal-recipe').classList.remove('show');
    _editingRecipeId = null;
  }

  function submitRecipe() {
    var errEl = $('rcp-err'); errEl.textContent = '';
    var id = ($('rcp-id').value || '').trim();
    var title = ($('rcp-title').value || '').trim();
    var parentId = $('rcp-parent').value || null;

    // Validate id
    if (!id || !/^[a-z0-9_-]+$/.test(id)) {
      errEl.textContent = 'Recipe ID must be lowercase alphanumeric with hyphens/underscores only.';
      return;
    }
    // On new, check uniqueness
    if (!_editingRecipeId && isIdTaken(id)) {
      errEl.textContent = 'ID "' + id + '" already exists.';
      return;
    }

    var w = parseInt($('rcp-w').value, 10);
    var h = parseInt($('rcp-h').value, 10);
    if (isNaN(w) || w < 9 || w > 60) { errEl.textContent = 'Width must be 9–60.'; return; }
    if (isNaN(h) || h < 9 || h > 60) { errEl.textContent = 'Height must be 9–60.'; return; }

    var seedRaw = ($('rcp-seed').value || '').trim();
    var seed = seedRaw === '' ? null : (isNaN(parseInt(seedRaw, 10)) ? null : parseInt(seedRaw, 10));

    var recipe = {
      id: id,
      title: title || id,
      biome: $('rcp-biome').value,
      faction: $('rcp-faction').value || 'neutral',
      size: { width: w, height: h },
      strategy: {
        primary: $('rcp-strategy').value,
        weight: parseFloat($('rcp-weight').value) || 1
      },
      rooms: {
        count: [parseInt($('rcp-room-min').value, 10) || 3, parseInt($('rcp-room-max').value, 10) || 7]
      },
      corridors: {
        style: $('rcp-corr-style').value,
        width: parseInt($('rcp-corr-width').value, 10) || 1,
        extraConnections: parseFloat($('rcp-corr-extra').value) || 0
      },
      entities: {
        torchDensity: parseFloat($('rcp-torch').value) || 0,
        breakableDensity: parseFloat($('rcp-breakable').value) || 0,
        trapDensity: parseFloat($('rcp-trap').value) || 0,
        chestCount: [parseInt($('rcp-chest-min').value, 10) || 0, parseInt($('rcp-chest-max').value, 10) || 0],
        enemyBudget: [parseInt($('rcp-enemy-min').value, 10) || 0, parseInt($('rcp-enemy-max').value, 10) || 0]
      },
      doors: {
        entry: $('rcp-door-entry').value || 'auto',
        exit: $('rcp-door-exit').value || 'auto',
        bossGate: $('rcp-boss-gate').checked
      },
      seed: seed,
      // Internal metadata (not part of recipe.schema.json)
      _parent: parentId,
      _createdAt: new Date().toISOString(),
      _createdBy: 'world-designer'
    };

    // Add timer knobs if strategy is fetch
    if (recipe.strategy.primary === 'fetch') {
      recipe.timer = {
        budgetMs: parseInt($('rcp-timer-budget').value, 10) || 60000,
        sentinelGraceMs: parseInt($('rcp-timer-grace').value, 10) || 12000,
        heroArchetype: $('rcp-hero').value || 'seeker'
      };
    }

    // If editing, remove old entry if id matches
    if (_editingRecipeId) {
      delete state.recipes[_editingRecipeId];
    }
    state.recipes[id] = recipe;
    saveRecipes();
    closeRecipeModal();
    rebuild(false);
    selectFloor(id);
    setStatus('recipe ' + (_editingRecipeId ? 'updated' : 'created') + ': ' + id, 'ok');
  }

  function discardRecipe(id) {
    if (!state.recipes[id]) return;
    if (!confirm('Discard recipe "' + id + '"? This cannot be undone.')) return;
    delete state.recipes[id];
    saveRecipes();
    if (state.selected === id) state.selected = null;
    rebuild(false);
    $('dg-inspector-body').innerHTML = '<div class="empty">Click a floor node</div>';
    setStatus('recipe discarded: ' + id, 'ok');
  }

  function expandRecipe(id) {
    var rcp = state.recipes[id];
    if (!rcp) return;

    // ── Multi-floor expansion (Phase 6.4) ─────────────────────
    // If recipe has expansion knobs, create N sibling pending floors
    // with auto-wired parent/child relationships.
    var exp = rcp.expansion;
    if (exp && exp.floorCount && exp.floorCount >= 2) {
      var floorCount = exp.floorCount;
      var idPattern  = exp.idPattern || '{parent}.{n}';
      var parentId   = rcp._parent || id;

      // Build floor IDs from pattern
      var floorIds = [];
      for (var n = 1; n <= floorCount; n++) {
        var fid = idPattern
          .replace(/\{parent\}/g, parentId)
          .replace(/\{n\}/g, String(n));
        floorIds.push(fid);
      }

      // Check for ID collisions
      var collision = null;
      floorIds.forEach(function(fid) {
        if (isIdTaken(fid)) collision = fid;
      });
      if (collision) {
        setStatus('expand blocked: floor ID "' + collision + '" already exists', 'err');
        return;
      }

      // Create N pending floors
      var now = new Date().toISOString();
      var baseDepth = parentId ? depthOf(parentId) + 1 : 2;

      floorIds.forEach(function(fid, i) {
        var pending = {
          id: fid,
          parent: (i === 0) ? parentId : floorIds[i - 1],
          biome: rcp.biome,
          w: rcp.size.width,
          h: rcp.size.height,
          depth: baseDepth,
          doorCoord: null,
          createdAt: now,
          createdBy: 'world-designer (multi-floor expand)',
          _fromRecipe: rcp.id,
          _recipe: rcp,
          _expansionIndex: i + 1,
          _expansionTotal: floorCount,
          _siblingPrev: (i > 0) ? floorIds[i - 1] : null,
          _siblingNext: (i < floorCount - 1) ? floorIds[i + 1] : null
        };
        state.pendings[fid] = pending;
      });

      // Remove the recipe node
      delete state.recipes[id];
      saveRecipes();
      savePendings();
      rebuild(false);
      selectFloor(floorIds[0]);
      setStatus('recipe expanded → ' + floorCount + ' pending floors: ' + floorIds.join(', '), 'ok');
      return;
    }

    // ── Single-floor expansion (original behavior) ────────────
    // Check if WDBridge is available for procgen
    var bridgeAvailable = (typeof WDBridge !== 'undefined' && WDBridge.ready);
    if (bridgeAvailable) {
      setStatus('expanding recipe: ' + id + '…');
      // Send procgen action to BO-V bridge
      WDBridge.run({ action: 'procgen', recipe: rcp })
        .then(function(res) {
          if (!res || !res.ok) {
            setStatus('expand failed: ' + ((res && res.error) || 'unknown'), 'err');
            return;
          }
          // On success, convert recipe → pending floor that can be opened in BO-V
          var pending = {
            id: id,
            parent: rcp._parent,
            biome: rcp.biome,
            w: rcp.size.width,
            h: rcp.size.height,
            depth: rcp._parent ? depthOf(rcp._parent) + 1 : 1,
            doorCoord: null,
            createdAt: new Date().toISOString(),
            createdBy: 'world-designer (expanded recipe)',
            _fromRecipe: rcp.id
          };
          delete state.recipes[id];
          state.pendings[id] = pending;
          saveRecipes();
          savePendings();
          rebuild(false);
          selectFloor(id);
          setStatus('recipe expanded → pending: ' + id, 'ok');
        })
        .catch(function(e) {
          setStatus('expand error: ' + e.message, 'err');
        });
    } else {
      // No bridge — convert to pending directly (user can generate later in BO-V)
      var pending = {
        id: id,
        parent: rcp._parent,
        biome: rcp.biome,
        w: rcp.size.width,
        h: rcp.size.height,
        depth: rcp._parent ? depthOf(rcp._parent) + 1 : 1,
        doorCoord: null,
        createdAt: new Date().toISOString(),
        createdBy: 'world-designer (recipe → pending, no bridge)',
        _fromRecipe: rcp.id,
        _recipe: rcp  // Stash full recipe so BO-V can use it later
      };
      delete state.recipes[id];
      state.pendings[id] = pending;
      saveRecipes();
      savePendings();
      rebuild(false);
      selectFloor(id);
      setStatus('recipe → pending (bridge not ready): ' + id, 'ok');
    }
  }

  function wire() {
    $('btn-reload').addEventListener('click', function() {
      setStatus('reloading…');
      Promise.all([loadData(), loadLayout(), loadBiomeMap(), loadTileSchema()])
        .then(function() {
          populateBiomeSelect();
          rebuild(false);
          setStatus('reloaded', 'ok');
          // Also reload the bridge iframe so BO-V picks up new data
          if (typeof WDBridge !== 'undefined') WDBridge.reload();
        })
        .catch(function(e) { setStatus('reload failed: ' + e.message, 'err'); });
    });
    // Pass 5b.2: Validate All button
    var btnValidate = $('btn-validate');
    if (btnValidate) {
      btnValidate.addEventListener('click', runBridgeValidation);
    }
    $('btn-layout-reset').addEventListener('click', function() {
      state.layout = {};
      rebuild(true);
      setStatus('layout reset', 'ok');
    });
    $('btn-layout-save').addEventListener('click', downloadLayout);
    // Pass 5b.5: zoom out + PNG export
    $('btn-zoom-out').addEventListener('click', function() {
      zoomOut();
      $('btn-zoom-out').style.display = 'none';
    });
    $('btn-export-png').addEventListener('click', exportToPng);
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
    // Pass 5b.3: context menu handlers
    document.addEventListener('click', function() { hideContextMenu(); });
    document.addEventListener('contextmenu', function(ev) {
      // Close menu on right-click outside node (node handler will stopPropagation)
      hideContextMenu();
    });
    var ctxMenu = $('dg-ctx-menu');
    ctxMenu.addEventListener('click', function(ev) {
      var item = ev.target.closest('[data-ctx]');
      if (!item || !_ctxFloorId) return;
      var action = item.getAttribute('data-ctx');
      var fid = _ctxFloorId;
      hideContextMenu();
      if (action === 'open-bov') {
        openInBlockoutEditor(fid);
      } else if (action === 'add-edge') {
        openDoorContractModal(fid);
      } else if (action === 'zoom') {
        zoomToSubgraph(fid);
        $('btn-zoom-out').style.display = '';
      } else if (action === 'expand-recipe') {
        if (state.recipes[fid]) expandRecipe(fid);
      } else if (action === 'delete') {
        openDeleteModal(fid);
      }
    });

    // Phase 6.3: recipe modal handlers
    $('btn-new-recipe').addEventListener('click', function() {
      openRecipeModal(null);
    });
    $('rcp-cancel').addEventListener('click', closeRecipeModal);
    $('rcp-create').addEventListener('click', submitRecipe);
    $('dg-modal-recipe').addEventListener('click', function(ev) {
      if (ev.target === $('dg-modal-recipe')) closeRecipeModal();
    });

    // Pass 5b.3: door contract modal handlers
    $('dc-cancel').addEventListener('click', closeDoorContractModal);
    $('dc-create').addEventListener('click', submitDoorContract);
    $('dg-modal-door').addEventListener('click', function(ev) {
      if (ev.target === $('dg-modal-door')) closeDoorContractModal();
    });

    // Pass 5b.3: delete modal handlers
    $('del-cancel').addEventListener('click', closeDeleteModal);
    $('del-confirm').addEventListener('click', confirmDelete);
    $('dg-modal-delete').addEventListener('click', function(ev) {
      if (ev.target === $('dg-modal-delete')) closeDeleteModal();
    });

    document.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') {
        if ($('dg-modal-new').classList.contains('show')) closeNewFloorModal();
        if ($('dg-modal-recipe').classList.contains('show')) closeRecipeModal();
        if ($('dg-modal-door').classList.contains('show')) closeDoorContractModal();
        if ($('dg-modal-delete').classList.contains('show')) closeDeleteModal();
        hideContextMenu();
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
    loadRecipes();
    // Pass 5b.2: init the BO bridge iframe (non-blocking)
    if (typeof WDBridge !== 'undefined') {
      WDBridge.init();
      WDBridge.onReady(function() {
        console.log('[world-designer] BO bridge ready');
        // Enable the validate button visually
        var btn = $('btn-validate');
        if (btn) btn.style.opacity = '1';
      });
      // Dim the validate button until bridge is ready
      var btn = $('btn-validate');
      if (btn) btn.style.opacity = '0.4';
    }
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

  window.DG_WORLD = {
    state: state,
    rebuild: rebuild,
    snapshotPositions: snapshotPositions,
    // Pass 5b.2 bridge helpers
    runBridgeValidation: runBridgeValidation,
    validationIssues: function() { return _validationIssues; },
    // Pass 5b.3 edit helpers
    openInBlockoutEditor: openInBlockoutEditor,
    openDoorContractModal: openDoorContractModal,
    openDeleteModal: openDeleteModal,
    // Pass 5b.5 polish helpers
    zoomToSubgraph: zoomToSubgraph,
    zoomOut: zoomOut,
    exportToPng: exportToPng,
    // Phase 6.3 recipe helpers
    openRecipeModal: openRecipeModal,
    expandRecipe: expandRecipe,
    discardRecipe: discardRecipe
  };
})();

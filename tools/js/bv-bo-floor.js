// ═══════════════════════════════════════════════════════════════
//  bv-bo-floor.js — Pass 5a browser twin of tools/cli/commands-floor
//
//  Registers three new actions on window.BO:
//    createFloor   — scaffold a new floor entry from biome + optional
//                    pre-materialized grid/spawn/doorTargets
//    setBiome      — change a floor's biome tag
//    placeEntity   — resolve a tile name, paint it, record in
//                    floor.entities[]
//
//  Unlike the CLI twin (which resolves templates + biome-map.json
//  from disk), the browser twin takes an already-materialized
//  floor shape. Agents that want template resolution can:
//    (a) call the CLI first and reload, or
//    (b) ship the shape through JS (fetch biome-map.json + template,
//        materialize client-side, then call createFloor).
//
//  Depends on (must load AFTER):
//    bv-bo-router.js      (window.BO._register, window.BO._helpers)
//    bv-floor-data.js     (FLOORS, FLOOR_NAMES)
//    bv-floor-selection.js (populateFloorSelect, selectFloor,
//                           sortFloorIds)
//    bv-edit-state.js     (applyCellsToGrid, pushUndo, EDIT)
//    bv-tile-schema.js    (TILE_SCHEMA)
//    bv-render.js         (draw)
// ═══════════════════════════════════════════════════════════════
'use strict';

(function() {
  if (!window.BO || typeof window.BO._register !== 'function') {
    console.warn('[bv-bo-floor] window.BO._register missing — router not loaded?');
    return;
  }
  var H = window.BO._helpers || {};

  function resolveTile(ref) {
    var id = H.resolveTileRef ? H.resolveTileRef(ref) : null;
    if (id == null) throw new Error('bad tile: ' + ref);
    return id;
  }

  function makeEmptyGrid(w, h, wallId, floorId) {
    var grid = [];
    for (var y = 0; y < h; y++) {
      var r = [];
      for (var x = 0; x < w; x++) {
        r.push((x === 0 || y === 0 || x === w-1 || y === h-1) ? wallId : floorId);
      }
      grid.push(r);
    }
    return grid;
  }

  // ── createFloor ───────────────────────────────────────────────
  // Args:
  //   id          (required) floor ID string, e.g. "4.1"
  //   biome       (required) biome name, recorded as floor.biome
  //   w, h        (optional) grid dimensions; default 16x16 if no grid
  //   grid        (optional) pre-materialized 2D tile-id array
  //   spawn       (optional) { x, y, dir }
  //   doorTargets (optional) { "x,y": "targetFloorId" }
  //   entities    (optional) [{ x, y, kind, key? }]
  //   wallTile    (optional) tile name/id for border, default "WALL"
  //   floorTile   (optional) tile name/id for interior, default "EMPTY"
  //   force       (optional) if true, overwrite existing floor
  //   select      (optional) if true (default), selectFloor(id) after create
  window.BO._register('createFloor', function(a) {
    if (!a.id)    throw new Error('createFloor needs id');
    if (!a.biome) throw new Error('createFloor needs biome');
    if (typeof FLOORS === 'undefined') throw new Error('FLOORS not loaded');
    if (FLOORS[a.id] && !a.force) throw new Error('floor exists: ' + a.id + ' (use force:true)');

    var grid;
    var w, h;
    if (Array.isArray(a.grid) && a.grid.length) {
      grid = a.grid.map(function(r){ return r.slice(); });
      h = grid.length;
      w = grid[0].length;
    } else {
      w = (a.w|0) || 16;
      h = (a.h|0) || 16;
      var wallId  = resolveTile(a.wallTile  || 'WALL');
      var floorId = resolveTile(a.floorTile || 'EMPTY');
      grid = makeEmptyGrid(w, h, wallId, floorId);
    }

    var spawn = a.spawn || { x: w>>1, y: h>>1, dir: 0 };
    FLOORS[a.id] = {
      floorId: a.id,
      grid: grid, gridW: w, gridH: h,
      rooms: [], doors: [],
      doorTargets: a.doorTargets || {},
      doorFaces: {},
      spawn: { x: spawn.x|0, y: spawn.y|0, dir: spawn.dir|0 },
      biome: a.biome,
      shops: [],
      entities: Array.isArray(a.entities) ? a.entities.slice() : []
    };
    if (typeof FLOOR_NAMES !== 'undefined') {
      FLOOR_NAMES[a.id] = a.name || FLOOR_NAMES[a.id] || a.id;
    }
    if (typeof populateFloorSelect === 'function') populateFloorSelect();
    var doSelect = (a.select !== false);
    if (doSelect && typeof selectFloor === 'function') selectFloor(a.id);
    if (typeof draw === 'function') draw();

    return {
      created: a.id, biome: a.biome, w: w, h: h,
      spawn: FLOORS[a.id].spawn,
      doorTargets: FLOORS[a.id].doorTargets,
      entities: FLOORS[a.id].entities.length
    };
  });

  // ── setBiome ──────────────────────────────────────────────────
  window.BO._register('setBiome', function(a) {
    if (!a.floor) throw new Error('setBiome needs floor');
    if (!a.biome) throw new Error('setBiome needs biome');
    if (!FLOORS[a.floor]) throw new Error('no such floor: ' + a.floor);
    FLOORS[a.floor].biome = a.biome;
    if (typeof draw === 'function') draw();
    return { floor: a.floor, biome: a.biome };
  });

  // ── placeEntity ───────────────────────────────────────────────
  //   Paints a semantic tile AND records an entry in floor.entities
  //   for round-trip persistence through extract-floors.js.
  //   Arg shape: { floor, at:{x,y}, kind:"CHEST"|..., key? }
  window.BO._register('placeEntity', function(a) {
    var fm = H.ensureFloor ? H.ensureFloor(a.floor) : null;
    if (!fm) throw new Error('floor not loaded: ' + (a.floor || '(current)'));
    if (!a.at || typeof a.at.x !== 'number' || typeof a.at.y !== 'number') {
      throw new Error('placeEntity needs at:{x,y}');
    }
    if (!a.kind) throw new Error('placeEntity needs kind');
    var grid = fm.floor.grid;
    var y = a.at.y|0, x = a.at.x|0;
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) {
      throw new Error('out of bounds: ' + x + ',' + y);
    }
    var tile = resolveTile(a.kind);
    var oldTile = grid[y][x];
    var changed = H.applyAndPush
      ? H.applyAndPush([{ x: x, y: y }], tile)
      : (function(){ grid[y][x] = tile; return [{x:x,y:y,oldTile:oldTile}]; })();
    fm.floor.entities = fm.floor.entities || [];
    fm.floor.entities = fm.floor.entities.filter(function(e){ return !(e.x===x && e.y===y); });
    fm.floor.entities.push({
      x: x, y: y,
      kind: String(a.kind).toUpperCase(),
      key: a.key || null,
      tileId: tile
    });
    if (typeof draw === 'function') draw();
    return {
      floor: fm.id, at: { x: x, y: y },
      kind: a.kind, tileId: tile, oldTile: oldTile,
      changed: changed.length
    };
  });

  console.log('[bv-bo-floor] registered: createFloor, setBiome, placeEntity');
})();

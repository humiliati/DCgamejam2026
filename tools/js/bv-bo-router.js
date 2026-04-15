// ═══════════════════════════════════════════════════════════════
//  bv-bo-router.js — Tier 6 window.BO headless command surface
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  A JSON-in / JSON-out router over the existing internal editor
//  primitives. Every action resolves to an existing function already
//  used by the GUI, so agent-driven edits are indistinguishable from
//  human ones — undo/redo, validation overlays, and dirty counts all
//  work identically.
//
//  Entry point: window.BO.run({ action, ...args })
//  Returns:     { ok: true,  result: <action-specific> }
//               { ok: false, error: <message>, action: <name> }
//
//  Optional postValidate:'current'|'all' on any command runs
//  validation after the mutation and attaches results to the response.
//
//  Depends on a lot of earlier-loaded state:
//    bv-tile-schema.js      (TILE_SCHEMA)
//    bv-floor-data.js       (FLOORS, currentFloor, currentFloorId,
//                            sortFloorIds)
//    bv-edit-state.js       (EDIT, pushUndo, undoLast, redoLast,
//                            CLIPBOARD, applyCellsToGrid)
//    bv-floor-selection.js  (selectFloor)
//    bv-stamps.js / brush   (cellsInRect, cellsInLine, floodFillCells,
//                            replaceAllOfType, stampClipboardAt,
//                            resizeGrid, updateEditUI)
//    bv-meta-editor.js      (setSpawn, setDoorTarget)
//    bv-validation.js       (runValidation, VALIDATE)
//    bv-save.js             (prepareSaveCurrentFloor)
//    bv-render.js           (draw, canvas)
//
//  Subsplit into router / perception / tile-lookup / stamps is
//  deferred — ACTIONS is a tight closure with deeply interdependent
//  helpers (resolveTileRef, withPaintTile, applyAndPush,
//  applyHeteroAndPush, rotate*, STAMPS) that would need to be hoisted
//  to shared globals before being cut apart.
//
//  MUST load AFTER all dependencies above (i.e. near the end of the
//  module list, just before loadAllFloors()).
//
//  Exposes globals: window.BO, window.__boSmokeTest
// ═══════════════════════════════════════════════════════════════
'use strict';

(function() {
  function resolveTileRef(ref) {
    // Accepts numeric tile ID or case-insensitive schema name.
    if (ref == null) return null;
    if (typeof ref === 'number') return ref|0;
    if (typeof ref === 'string') {
      if (/^-?\d+$/.test(ref)) return parseInt(ref, 10);
      var u = ref.toUpperCase();
      for (var id in TILE_SCHEMA) {
        var s = TILE_SCHEMA[id];
        if (s && s.name && s.name.toUpperCase() === u) return +id;
      }
    }
    return null;
  }

  function ensureFloor(id) {
    // Switches the editor to `id` if needed. Falls back to the
    // currently-loaded floor when no id is passed.
    if (!id) {
      if (!currentFloor || !currentFloorId) return null;
      return { id: currentFloorId, floor: currentFloor };
    }
    if (!FLOORS[id]) return null;
    if (id !== currentFloorId) selectFloor(id);
    return { id: id, floor: FLOORS[id] };
  }

  function currentFloorSnapshot() {
    if (!currentFloor) return null;
    var g = currentFloor.grid || [];
    return {
      id: currentFloorId,
      w: g[0] ? g[0].length : 0,
      h: g.length,
      spawn: currentFloor.spawn || null,
      doorTargets: currentFloor.doorTargets || {}
    };
  }

  function withPaintTile(tile, fn) {
    // floodFillCells / replaceAllOfType short-circuit when the seed
    // equals EDIT.paintTile — temp-set the brush so they compute the
    // correct cell list for this action's target tile.
    var saved = EDIT.paintTile;
    EDIT.paintTile = tile;
    try { return fn(); } finally { EDIT.paintTile = saved; }
  }

  function applyAndPush(cells, tile) {
    var changed = applyCellsToGrid(cells, tile);
    if (changed.length) pushUndo({ type: 'bulk', cells: changed, newTile: tile });
    return changed;
  }

  // Pass 4: heterogeneous mutations (stamp actions).
  // Writes a per-cell tile list and pushes a single bulk-undo entry with
  // per-cell newTile (same shape paste uses).
  function applyHeteroAndPush(heteroCells) {
    if (!currentFloor || !currentFloor.grid) throw new Error('no floor loaded');
    var grid = currentFloor.grid;
    var changed = [];
    for (var i = 0; i < heteroCells.length; i++) {
      var c = heteroCells[i];
      if (c.y < 0 || c.y >= grid.length) continue;
      if (c.x < 0 || c.x >= grid[c.y].length) continue;
      var oldTile = grid[c.y][c.x];
      if (oldTile === c.tile) continue;
      grid[c.y][c.x] = c.tile;
      changed.push({ x: c.x, y: c.y, oldTile: oldTile, newTile: c.tile });
    }
    if (changed.length) {
      pushUndo({ type: 'bulk', cells: changed, newTile: null });
      if (typeof updateEditUI === 'function') updateEditUI();
      if (typeof draw === 'function') draw();
    }
    return changed;
  }

  // Pass 4: stamp grid transforms.
  function rotateCW(grid) {
    if (!grid.length || !grid[0].length) return grid.slice();
    var h = grid.length, w = grid[0].length, out = [];
    for (var y=0; y<w; y++) { var row = []; for (var x=0; x<h; x++) row.push(grid[h-1-x][y]); out.push(row); }
    return out;
  }
  function rotateCCW(grid) {
    if (!grid.length || !grid[0].length) return grid.slice();
    var h = grid.length, w = grid[0].length, out = [];
    for (var y=0; y<w; y++) { var row = []; for (var x=0; x<h; x++) row.push(grid[x][w-1-y]); out.push(row); }
    return out;
  }
  function rotate180(grid) {
    return grid.slice().reverse().map(function(r){ return r.slice().reverse(); });
  }

  // Pass 4: in-memory stamp registry. Persists across floor switches but
  // resets on reload. Use exportStamps / importStamps (or the CLI side-car
  // tools/stamps.json) for cross-session carry-over.
  var STAMPS = {};

  // ── Action map — each one maps 1:1 to an existing editor primitive.
  var ACTIONS = {
    listFloors: function() {
      return sortFloorIds(Object.keys(FLOORS)).map(function(id) {
        var f = FLOORS[id]; var g = f && f.grid;
        return {
          id: id,
          depth: id.split('.').length,
          w: g && g[0] ? g[0].length : 0,
          h: g ? g.length : 0,
          spawn: f && f.spawn || null,
          biome: f && f.biome || null
        };
      });
    },

    getFloor: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not found: ' + (a.floor || '(current)'));
      return {
        id: fm.id,
        grid: fm.floor.grid.map(function(r) { return r.slice(); }),
        spawn: fm.floor.spawn || null,
        doorTargets: fm.floor.doorTargets || {},
        rooms: fm.floor.rooms || [],
        biome: fm.floor.biome || null
      };
    },

    selectFloor: function(a) {
      if (!FLOORS[a.floor]) throw new Error('no such floor: ' + a.floor);
      selectFloor(a.floor);
      return currentFloorSnapshot();
    },

    paint: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      var tile = resolveTileRef(a.tile);
      if (tile == null) throw new Error('bad tile: ' + a.tile);
      var cells = a.cells || (a.at ? [a.at] : []);
      if (!cells.length) throw new Error('no cells supplied');
      var changed = applyAndPush(cells, tile);
      draw();
      return { changed: changed.length };
    },

    paintRect: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      var tile = resolveTileRef(a.tile);
      if (tile == null) throw new Error('bad tile: ' + a.tile);
      var x0, y0, x1, y1;
      if (a.at && a.size) {
        x0 = a.at.x|0; y0 = a.at.y|0;
        x1 = x0 + ((a.size.w|0) - 1); y1 = y0 + ((a.size.h|0) - 1);
      } else {
        x0 = a.x0|0; y0 = a.y0|0; x1 = a.x1|0; y1 = a.y1|0;
      }
      var cells = cellsInRect(x0, y0, x1, y1, !!a.outline);
      var changed = applyAndPush(cells, tile);
      draw();
      return { changed: changed.length, rect: { x0:x0, y0:y0, x1:x1, y1:y1 } };
    },

    paintLine: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      var tile = resolveTileRef(a.tile);
      if (tile == null) throw new Error('bad tile: ' + a.tile);
      if (!a.from || !a.to) throw new Error('paintLine needs {from, to}');
      var cells = cellsInLine(a.from.x|0, a.from.y|0, a.to.x|0, a.to.y|0);
      var changed = applyAndPush(cells, tile);
      draw();
      return { changed: changed.length };
    },

    floodFill: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      var tile = resolveTileRef(a.tile);
      if (tile == null) throw new Error('bad tile: ' + a.tile);
      if (!a.at) throw new Error('floodFill needs {at:{x,y}}');
      var cells = withPaintTile(tile, function() {
        return floodFillCells(a.at.x|0, a.at.y|0);
      });
      var changed = applyAndPush(cells, tile);
      draw();
      return { changed: changed.length };
    },

    replaceAllOfType: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      var tile = resolveTileRef(a.tile);
      if (tile == null) throw new Error('bad tile: ' + a.tile);
      if (!a.at) throw new Error('replaceAllOfType needs {at:{x,y}} (seeds target tile)');
      var cells = withPaintTile(tile, function() {
        return replaceAllOfType(a.at.x|0, a.at.y|0);
      });
      var changed = applyAndPush(cells, tile);
      draw();
      return { changed: changed.length };
    },

    resize: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      if (!a.side || !a.action) throw new Error('resize needs {side, action}');
      resizeGrid(a.side, a.action);
      return currentFloorSnapshot();
    },

    setSpawn: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      if (!a.at) throw new Error('setSpawn needs {at:{x,y}}');
      setSpawn(a.at.x|0, a.at.y|0);
      return { spawn: fm.floor.spawn || null };
    },

    setDoorTarget: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      if (!a.at) throw new Error('setDoorTarget needs {at:{x,y}, target}');
      setDoorTarget(a.at.x|0, a.at.y|0, a.target || '');
      return { doorTargets: fm.floor.doorTargets || {} };
    },

    stampClipboard: function(a) {
      if (!CLIPBOARD || !CLIPBOARD.cells) throw new Error('clipboard is empty');
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      if (!a.at) throw new Error('stampClipboard needs {at:{x,y}}');
      stampClipboardAt(a.at.x|0, a.at.y|0);
      return { pasted: CLIPBOARD.cells.length };
    },

    validate: function(a) {
      runValidation(a.scope || 'current');
      return (VALIDATE.lastResults || []).map(function(i) {
        return {
          severity: i.severity, kind: i.kind, floorId: i.floorId, msg: i.msg,
          cells: i.cells ? i.cells.slice(0, 32) : null
        };
      });
    },

    save: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      // Opens the save-confirm modal; the human still clicks Write/Download.
      // Agent flow: call `save`, then trigger the DOM save-confirm button
      // via a follow-up command (or script the click in the page driver).
      prepareSaveCurrentFloor();
      return { queued: true, floor: fm.id, note: 'Save modal opened — confirm or Download via UI' };
    },

    undo: function() { undoLast(); draw(); return { ok: true }; },
    redo: function() { redoLast(); draw(); return { ok: true }; },

    // ── Pass 2: Perception tools ──────────────────────────────────
    // renderAscii({floor, viewport?}) → ASCII glyph grid + legend.
    // Agents without vision consume this to "see" the floor. The
    // viewport param clips to {x, y, w, h} so large floors can be
    // paginated.
    renderAscii: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      var grid = fm.floor.grid;
      var gw = grid[0] ? grid[0].length : 0, gh = grid.length;
      var vp = a.viewport || { x: 0, y: 0, w: gw, h: gh };
      var x0 = Math.max(0, vp.x|0), y0 = Math.max(0, vp.y|0);
      var x1 = Math.min(gw, x0 + (vp.w|0 || gw));
      var y1 = Math.min(gh, y0 + (vp.h|0 || gh));
      var used = {};
      var rows = [];
      for (var y = y0; y < y1; y++) {
        var row = '';
        for (var x = x0; x < x1; x++) {
          var t = grid[y][x];
          var s = TILE_SCHEMA[t];
          var g = (s && s.glyph) ? s.glyph : '?';
          row += g;
          if (!used[g]) used[g] = {};
          used[g][t] = (s && s.name) || ('TILE_' + t);
        }
        rows.push(row);
      }
      // Flatten used into a legend array. Duplicate glyphs surface
      // all tile IDs sharing that glyph so the caller can see
      // ambiguity in the schema.
      var legend = [];
      Object.keys(used).sort().forEach(function(g) {
        Object.keys(used[g]).forEach(function(id) {
          legend.push({ glyph: g, tileId: +id, name: used[g][id] });
        });
      });
      // Overlay spawn marker if visible in viewport.
      var sp = fm.floor.spawn;
      var spawnOverlay = null;
      if (sp && sp.x >= x0 && sp.x < x1 && sp.y >= y0 && sp.y < y1) {
        spawnOverlay = { x: sp.x, y: sp.y, relX: sp.x - x0, relY: sp.y - y0 };
      }
      return {
        floor: fm.id,
        w: x1 - x0, h: y1 - y0,
        viewport: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        glyphs: rows.join('\n'),
        legend: legend,
        spawn: spawnOverlay
      };
    },

    // diffAscii({floor, before}) → changes between current grid and
    // a prior snapshot. `before` accepts either a 2D array or a
    // prior `getFloor` result (`{grid}`). Unchanged cells render as
    // `.`; changed cells show the NEW glyph. Also returns a full
    // change list for programmatic use.
    diffAscii: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      if (!a.before) throw new Error('diffAscii needs {before} (grid or getFloor result)');
      var beforeGrid = a.before.grid || a.before;
      if (!Array.isArray(beforeGrid) || !Array.isArray(beforeGrid[0])) {
        throw new Error('before must be a 2D grid');
      }
      var grid = fm.floor.grid;
      var gh = grid.length, gw = grid[0] ? grid[0].length : 0;
      var rows = [], changes = [];
      for (var y = 0; y < gh; y++) {
        var row = '';
        for (var x = 0; x < gw; x++) {
          var cur = grid[y][x];
          var prev = (beforeGrid[y] && beforeGrid[y][x] != null) ? beforeGrid[y][x] : null;
          if (prev === cur) {
            row += '.';
          } else {
            var s = TILE_SCHEMA[cur];
            row += (s && s.glyph) ? s.glyph : '?';
            changes.push({ x: x, y: y, before: prev, after: cur });
          }
        }
        rows.push(row);
      }
      return {
        floor: fm.id, w: gw, h: gh,
        diff: rows.join('\n'),
        changes: changes,
        changeCount: changes.length
      };
    },

    // describeCell({floor, at}) → structured tooltip payload: tile,
    // walk/opq, category, room membership, door target/face, and a
    // before-snapshot if the cell has been edited since load.
    describeCell: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      if (!a.at) throw new Error('describeCell needs {at:{x,y}}');
      var x = a.at.x|0, y = a.at.y|0;
      var grid = fm.floor.grid;
      if (y < 0 || y >= grid.length || !grid[y] || x < 0 || x >= grid[y].length) {
        throw new Error('cell ('+x+','+y+') out of bounds');
      }
      var t = grid[y][x];
      var s = TILE_SCHEMA[t] || {};
      var key = x + ',' + y;
      var doorTarget = (fm.floor.doorTargets || {})[key] || null;
      var dirs = ['EAST','SOUTH','WEST','NORTH'];
      var doorFace = (fm.floor.doorFaces && fm.floor.doorFaces[key] != null)
        ? dirs[fm.floor.doorFaces[key]] : null;
      var rooms = [];
      (fm.floor.rooms || []).forEach(function(r, i) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
          rooms.push({ index: i, x: r.x, y: r.y, w: r.w, h: r.h });
        }
      });
      var wasTile = null;
      if (EDIT.originalGrid && EDIT.originalGrid[y] && EDIT.originalGrid[y][x] !== t) {
        var origT = EDIT.originalGrid[y][x];
        wasTile = { tileId: origT, name: (TILE_SCHEMA[origT] || {}).name || null };
      }
      return {
        floor: fm.id, at: { x: x, y: y },
        tileId: t,
        name: s.name || ('TILE_' + t),
        category: s.cat || null,
        glyph: s.glyph || null,
        walk: s.walk === true,
        opaque: s.opq === true,
        color: s.color || null,
        doorTarget: doorTarget,
        exteriorFace: doorFace,
        rooms: rooms,
        wasTile: wasTile,
        isSpawn: !!(fm.floor.spawn && fm.floor.spawn.x === x && fm.floor.spawn.y === y)
      };
    },

    // reportValidation({scope}) → alias for `validate` that matches
    // the Pass 2 naming convention. Identical return shape; provided
    // so agents can reach for either name.
    reportValidation: function(a) {
      runValidation(a.scope || 'current');
      return (VALIDATE.lastResults || []).map(function(i) {
        return {
          severity: i.severity, kind: i.kind, floorId: i.floorId, msg: i.msg,
          cells: i.cells ? i.cells.slice(0, 32) : null
        };
      });
    },

    // captureFloor({floor, format?}) → base64 PNG of the current
    // canvas view of the floor. For vision-capable agents. Always
    // captures the currently-rendered canvas (switches floor first
    // if `floor` differs from currentFloorId).
    captureFloor: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('floor not loaded');
      // Force a fresh render before grabbing the frame.
      draw();
      var dataUrl;
      try { dataUrl = canvas.toDataURL((a.format === 'jpeg') ? 'image/jpeg' : 'image/png'); }
      catch (e) { throw new Error('canvas.toDataURL failed: ' + e.message); }
      return {
        floor: fm.id,
        width: canvas.width, height: canvas.height,
        format: (a.format === 'jpeg') ? 'image/jpeg' : 'image/png',
        dataUrl: dataUrl
      };
    },

    // ── Pass 3: tile semantic lookup ─────────────────────────
    tile: function(a) {
      // Name (or numeric id) → tile id. Throws on unknown reference.
      var ref = a.name != null ? a.name : a.ref;
      if (ref == null) throw new Error('tile: missing "name" or "ref"');
      var id = resolveTileRef(ref);
      if (id == null || !TILE_SCHEMA[id]) throw new Error('unknown tile: ' + ref);
      return id;
    },

    tileName: function(a) {
      // Numeric id → canonical name.
      var id = a.id != null ? (a.id|0) : resolveTileRef(a.ref);
      if (id == null) throw new Error('tileName: missing "id" or "ref"');
      var s = TILE_SCHEMA[id];
      if (!s) throw new Error('unknown tile id: ' + id);
      return s.name || ('TILE_' + id);
    },

    tileSchema: function(a) {
      // id or name → full schema entry with id attached. If no arg, returns full table.
      if (a && (a.ref != null || a.name != null || a.id != null)) {
        var id = a.id != null ? (a.id|0) : resolveTileRef(a.ref != null ? a.ref : a.name);
        if (id == null || !TILE_SCHEMA[id]) throw new Error('unknown tile: ' + (a.ref||a.name||a.id));
        var s = TILE_SCHEMA[id];
        return Object.assign({ id: id }, s);
      }
      // No args → dump the whole schema.
      var all = [];
      Object.keys(TILE_SCHEMA).forEach(function(id) {
        all.push(Object.assign({ id: +id }, TILE_SCHEMA[id]));
      });
      all.sort(function(a,b){ return a.id - b.id; });
      return all;
    },

    findTiles: function(a) {
      // Filter predicate. AND semantics across all provided fields.
      a = a || {};
      var nameQ = a.name != null ? String(a.name) : null;
      var nameRe = null;
      if (nameQ) {
        var m = nameQ.match(/^\/(.+)\/([imsu]*)$/);
        if (m) { try { nameRe = new RegExp(m[1], m[2] || 'i'); } catch (e) { throw new Error('bad name regex: ' + nameQ); } }
      }
      var cat = a.category != null ? String(a.category) : (a.cat != null ? String(a.cat) : null);
      var flagKeys = ['walk','opq','opaque','hazard','isDoor','isFreeform','isFloating','isCrenellated','isFloatingMoss','isFloatingLid','isFloatingBackFace','isWindow','isTorch'];
      var flags = {};
      flagKeys.forEach(function(k) {
        // Alias "opaque" → "opq" on schema.
        var src = (k === 'opaque') ? 'opq' : k;
        if (a[k] != null) flags[src] = !!a[k];
      });
      var glyph = a.glyph != null ? String(a.glyph) : null;

      var out = [];
      Object.keys(TILE_SCHEMA).forEach(function(id) {
        var s = TILE_SCHEMA[id]; if (!s) return;
        var name = s.name || '';
        if (nameRe) { if (!nameRe.test(name)) return; }
        else if (nameQ) {
          if (String(name).toUpperCase().indexOf(nameQ.toUpperCase()) < 0) return;
        }
        if (cat != null) {
          var sc = s.category || s.cat;
          if (String(sc) !== cat) return;
        }
        for (var k in flags) {
          if (!!s[k] !== flags[k]) return;
        }
        if (glyph != null && s.glyph !== glyph) return;
        out.push({
          id: +id,
          name: s.name || null,
          category: s.category || s.cat || null,
          glyph: s.glyph || null,
          walk: s.walk === true,
          opaque: s.opq === true,
          hazard: s.hazard === true,
          isDoor: s.isDoor === true,
          isFreeform: s.isFreeform === true,
          isFloating: s.isFloating === true,
          isWindow: s.isWindow === true,
          isTorch: s.isTorch === true,
          color: s.color || null
        });
      });
      out.sort(function(a,b){ return a.id - b.id; });
      return out;
    },

    // ── Pass 4: parametric stamps ────────────────────────────
    stampRoom: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('stampRoom: no floor loaded');
      var at = a.at || {};
      var size = a.size || {};
      var w = (a.w != null ? a.w : size.w)|0;
      var h = (a.h != null ? a.h : size.h)|0;
      if (w < 2 || h < 2) throw new Error('stampRoom: w,h must both be >=2');
      var wallTile = resolveTileRef(a.wallTile != null ? a.wallTile : 'WALL');
      var floorTile = resolveTileRef(a.floorTile != null ? a.floorTile : (a.fillTile != null ? a.fillTile : 0));
      if (wallTile == null) throw new Error('stampRoom: unknown wallTile ' + a.wallTile);
      if (floorTile == null) throw new Error('stampRoom: unknown floorTile ' + a.floorTile);
      var x0 = at.x|0, y0 = at.y|0, x1 = x0 + w - 1, y1 = y0 + h - 1;
      var cells = [];
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          var onEdge = (x === x0 || x === x1 || y === y0 || y === y1);
          cells.push({ x: x, y: y, tile: onEdge ? wallTile : floorTile });
        }
      }
      var changed = applyHeteroAndPush(cells);
      return { changed: changed.length, at: {x:x0,y:y0}, w:w, h:h, wallTile:wallTile, floorTile:floorTile };
    },

    stampCorridor: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('stampCorridor: no floor loaded');
      if (!a.from || !a.to) throw new Error('stampCorridor: needs from and to');
      var floorTile = resolveTileRef(a.floorTile != null ? a.floorTile : (a.tile != null ? a.tile : 'EMPTY'));
      if (floorTile == null) throw new Error('stampCorridor: unknown floorTile');
      var wallTile = a.wallTile != null ? resolveTileRef(a.wallTile) : null;
      if (a.wallTile != null && wallTile == null) throw new Error('stampCorridor: unknown wallTile');
      var width = Math.max(1, (a.width|0) || 1);
      var x0 = a.from.x|0, y0 = a.from.y|0, x1 = a.to.x|0, y1 = a.to.y|0;
      var pathCells = [];
      var dxAbs = Math.abs(x1-x0), dyAbs = Math.abs(y1-y0);
      var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      var err = dxAbs - dyAbs, x = x0, y = y0;
      while (true) {
        pathCells.push({x:x,y:y});
        if (x === x1 && y === y1) break;
        var e2 = 2*err;
        if (e2 > -dyAbs) { err -= dyAbs; x += sx; }
        if (e2 <  dxAbs) { err += dxAbs; y += sy; }
        if (pathCells.length > 5000) break;
      }
      var wide = {};
      var hw = Math.floor((width-1)/2), hw2 = Math.ceil((width-1)/2);
      pathCells.forEach(function(p) {
        for (var oy = -hw; oy <= hw2; oy++)
          for (var ox = -hw; ox <= hw2; ox++)
            wide[(p.x+ox)+','+(p.y+oy)] = 'floor';
      });
      if (wallTile != null) {
        var keys = Object.keys(wide);
        keys.forEach(function(k) {
          var parts = k.split(','), cx = +parts[0], cy = +parts[1];
          [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(d) {
            var nk = (cx+d[0]) + ',' + (cy+d[1]);
            if (!wide[nk]) wide[nk] = 'wall';
          });
        });
      }
      var cells = Object.keys(wide).map(function(k) {
        var parts = k.split(','); var type = wide[k];
        return { x: +parts[0], y: +parts[1], tile: (type === 'wall') ? wallTile : floorTile };
      });
      var changed = applyHeteroAndPush(cells);
      return { changed: changed.length, pathLength: pathCells.length, width: width, hasWalls: wallTile != null };
    },

    stampTorchRing: function(a) {
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('stampTorchRing: no floor loaded');
      var at = a.at || {};
      var cx = at.x|0, cy = at.y|0;
      var radius = Math.max(1, (a.radius|0) || 2);
      var torchTile = resolveTileRef(a.torchTile != null ? a.torchTile : 'TORCH_LIT');
      if (torchTile == null) throw new Error('stampTorchRing: unknown torchTile');
      var step = Math.max(1, (a.step|0) || 1);
      var cells = [];
      var x0 = cx - radius, x1 = cx + radius;
      var y0 = cy - radius, y1 = cy + radius;
      var i;
      i = 0; for (var x = x0; x <= x1; x++) { if ((i++ % step) === 0) cells.push({x:x, y:y0, tile:torchTile}); }
      i = 0; for (var x2 = x0; x2 <= x1; x2++) { if ((i++ % step) === 0) cells.push({x:x2, y:y1, tile:torchTile}); }
      i = 0; for (var y = y0+1; y <= y1-1; y++) { if ((i++ % step) === 0) cells.push({x:x0, y:y, tile:torchTile}); }
      i = 0; for (var y2 = y0+1; y2 <= y1-1; y2++) { if ((i++ % step) === 0) cells.push({x:x1, y:y2, tile:torchTile}); }
      var changed = applyHeteroAndPush(cells);
      return { changed: changed.length, at: {x:cx,y:cy}, radius: radius, torchTile: torchTile, step: step };
    },

    // ── Pass 4: stamp registry (named patterns) ──────────────
    saveStamp: function(a) {
      if (!a.name) throw new Error('saveStamp: needs name');
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('saveStamp: no floor loaded');
      var grid = fm.floor.grid;
      var at = a.at || { x: 0, y: 0 };
      var size = a.size || {};
      var w = (a.w != null ? a.w : size.w)|0;
      var h = (a.h != null ? a.h : size.h)|0;
      if (w < 1 || h < 1) throw new Error('saveStamp: needs w,h (>=1)');
      var rows = [];
      for (var dy = 0; dy < h; dy++) {
        var row = [];
        for (var dx = 0; dx < w; dx++) {
          var ty = (at.y|0) + dy, tx = (at.x|0) + dx;
          var t = (ty >= 0 && ty < grid.length && tx >= 0 && tx < grid[ty].length) ? grid[ty][tx] : 0;
          row.push(t);
        }
        rows.push(row);
      }
      STAMPS[a.name] = {
        w: w, h: h, cells: rows,
        meta: { sourceFloor: fm.id, at: { x: at.x|0, y: at.y|0 }, createdAt: new Date().toISOString() }
      };
      return { name: a.name, w: w, h: h, sourceFloor: fm.id };
    },

    applyStamp: function(a) {
      if (!a.name) throw new Error('applyStamp: needs name');
      var s = STAMPS[a.name];
      if (!s) throw new Error('applyStamp: unknown stamp "' + a.name + '"');
      var fm = ensureFloor(a.floor);
      if (!fm) throw new Error('applyStamp: no floor loaded');
      var at = a.at || { x: 0, y: 0 };
      var rot = ((a.rotate|0) % 360 + 360) % 360;
      var flipH = !!a.flipH, flipV = !!a.flipV;
      var cells = s.cells;
      if (rot === 90)  cells = rotateCW(cells);
      else if (rot === 180) cells = rotate180(cells);
      else if (rot === 270) cells = rotateCCW(cells);
      if (flipH) cells = cells.map(function(r){ return r.slice().reverse(); });
      if (flipV) cells = cells.slice().reverse();
      var hetero = [];
      for (var dy = 0; dy < cells.length; dy++)
        for (var dx = 0; dx < cells[dy].length; dx++)
          hetero.push({ x: (at.x|0) + dx, y: (at.y|0) + dy, tile: cells[dy][dx] });
      var changed = applyHeteroAndPush(hetero);
      return { changed: changed.length, name: a.name, at: { x: at.x|0, y: at.y|0 }, rotate: rot, flipH: flipH, flipV: flipV };
    },

    listStamps: function() {
      return Object.keys(STAMPS).sort().map(function(name) {
        var s = STAMPS[name];
        return { name: name, w: s.w, h: s.h, sourceFloor: (s.meta && s.meta.sourceFloor) || null };
      });
    },

    deleteStamp: function(a) {
      if (!a.name) throw new Error('deleteStamp: needs name');
      if (!STAMPS[a.name]) throw new Error('deleteStamp: unknown stamp "' + a.name + '"');
      delete STAMPS[a.name];
      return { name: a.name, deleted: true, remaining: Object.keys(STAMPS).length };
    },

    exportStamps: function() {
      return JSON.parse(JSON.stringify(STAMPS));
    },

    importStamps: function(a) {
      if (!a || !a.stamps || typeof a.stamps !== 'object') throw new Error('importStamps: needs stamps:{...}');
      var merge = a.merge !== false;
      if (!merge) STAMPS = {};
      var added = 0;
      Object.keys(a.stamps).forEach(function(name) {
        var s = a.stamps[name];
        if (!s || !Array.isArray(s.cells) || !Array.isArray(s.cells[0])) return;
        STAMPS[name] = {
          w: s.w || s.cells[0].length,
          h: s.h || s.cells.length,
          cells: s.cells.map(function(r){ return r.slice(); }),
          meta: s.meta || {}
        };
        added++;
      });
      return { added: added, total: Object.keys(STAMPS).length, merge: merge };
    },

    // Diagnostic — useful for agents probing their own state.
    describe: function() {
      return {
        currentFloor: currentFloorId || null,
        floorCount: Object.keys(FLOORS).length,
        editActive: !!EDIT.active,
        tool: EDIT.tool,
        paintTile: EDIT.paintTile,
        paintTileName: (TILE_SCHEMA[EDIT.paintTile] || {}).name || null,
        brushSize: EDIT.brushSize,
        clipboard: CLIPBOARD && CLIPBOARD.cells ? {
          w: CLIPBOARD.w, h: CLIPBOARD.h, sourceFloor: CLIPBOARD.sourceFloorId
        } : null
      };
    }
  };

  function run(cmd) {
    cmd = cmd || {};
    var name = cmd.action;
    try {
      if (!name) throw new Error('missing action');
      var fn = ACTIONS[name];
      if (!fn) throw new Error('unknown action: ' + name);
      var result = fn(cmd);
      var resp = { ok: true, action: name, result: result };
      if (cmd.postValidate) {
        runValidation(cmd.postValidate === 'all' ? 'all' : 'current');
        resp.validation = (VALIDATE.lastResults || []).map(function(i) {
          return { severity: i.severity, kind: i.kind, floorId: i.floorId, msg: i.msg };
        });
      }
      return resp;
    } catch (e) {
      return { ok: false, action: name || null, error: String((e && e.message) || e) };
    }
  }

  // Pass 5a: extension hook so sibling modules (bv-bo-floor.js)
  // can register additional actions without editing this file.
  function registerAction(name, fn) {
    if (typeof name !== 'string' || !name) throw new Error('registerAction needs a name');
    if (typeof fn !== 'function')           throw new Error('registerAction needs a function');
    ACTIONS[name] = fn;
    if (window.BO) window.BO.actions = Object.keys(ACTIONS).sort();
    return name;
  }

  window.BO = {
    run: run,
    actions: Object.keys(ACTIONS).sort(),
    version: '0.3.1',
    _register: registerAction,
    _helpers: {
      resolveTileRef: resolveTileRef,
      ensureFloor:    ensureFloor,
      applyAndPush:   applyAndPush,
      currentFloorSnapshot: currentFloorSnapshot
    },
    // ── Pass 3: direct helpers (no router wrap) ────────────────
    tile:       function(name)       { return ACTIONS.tile({ name: name }); },
    tileName:   function(id)         { return ACTIONS.tileName({ id: id }); },
    tileSchema: function(ref)        { return ACTIONS.tileSchema(ref != null ? { ref: ref } : {}); },
    findTiles:  function(filter)     { return ACTIONS.findTiles(filter || {}); },
    // ── Pass 4: stamp helpers ──────────────────────────────────
    listStamps: function()           { return ACTIONS.listStamps({}); },
    exportStamps: function()         { return ACTIONS.exportStamps({}); },
    importStamps: function(st, merge) { return ACTIONS.importStamps({ stamps: st, merge: merge !== false }); }
  };
  Object.defineProperty(window.BO, 'currentFloorId', { get: function() { return currentFloorId; } });
  Object.defineProperty(window.BO, 'floors',         { get: function() { return Object.keys(FLOORS); } });
})();

// Smoke test: paints a 3×3 WALL rect, validates, and undoes. Run in
// the console after floors load: __boSmokeTest().
window.__boSmokeTest = function(floorId) {
  var fid = floorId || Object.keys(FLOORS)[0];
  if (!fid) { console.warn('[bo-smoke] no floors loaded'); return; }
  console.log('[bo-smoke] actions:', window.BO.actions.join(', '));
  var r1 = window.BO.run({ action: 'selectFloor', floor: fid });
  console.log('[bo-smoke] selectFloor →', r1);
  var r2 = window.BO.run({ action: 'paintRect', at: {x:2,y:2}, size:{w:3,h:3}, tile:'WALL' });
  console.log('[bo-smoke] paintRect →', r2);
  var r3 = window.BO.run({ action: 'validate', scope: 'current' });
  console.log('[bo-smoke] validate →', r3.result.length, 'issues');
  var r4 = window.BO.run({ action: 'renderAscii', viewport:{x:0,y:0,w:20,h:10} });
  console.log('[bo-smoke] renderAscii →\n' + r4.result.glyphs);
  var r5 = window.BO.run({ action: 'describeCell', at:{x:2,y:2} });
  console.log('[bo-smoke] describeCell →', r5.result);
  var r6 = window.BO.run({ action: 'undo' });
  console.log('[bo-smoke] undo →', r6);
  // Pass 3 checks
  var r7 = window.BO.tile('WALL');
  console.log('[bo-smoke] BO.tile("WALL") →', r7);
  var r8 = window.BO.findTiles({ isDoor: true });
  console.log('[bo-smoke] findTiles({isDoor:true}) →', r8.length, 'tiles');
  var r9 = window.BO.run({ action: 'tileSchema', name: 'WALL' });
  console.log('[bo-smoke] tileSchema(WALL) →', r9.result);
  // Pass 4 — stamps
  var rA = window.BO.run({ action: 'stampRoom', at:{x:6,y:6}, w:4, h:4, wallTile:'WALL', floorTile:'EMPTY' });  console.log('[bo-smoke] stampRoom 4×4 →', rA);
  var rB = window.BO.run({ action: 'saveStamp', name:'smoke-room', at:{x:6,y:6}, w:4, h:4 });
  console.log('[bo-smoke] saveStamp →', rB);
  var rC = window.BO.run({ action: 'applyStamp', name:'smoke-room', at:{x:12,y:12}, rotate:90 });
  console.log('[bo-smoke] applyStamp (rot 90) →', rC);
  var rD = window.BO.listStamps();
  console.log('[bo-smoke] listStamps →', rD);
  // Undo the stamps we just dropped so the smoke test leaves no trace.
  window.BO.run({ action: 'undo' });
  window.BO.run({ action: 'undo' });
  return { r1:r1, r2:r2, r3:r3, r4:r4, r5:r5, r6:r6, r7:r7, r8:r8, r9:r9, rA:rA, rB:rB, rC:rC, rD:rD };
};

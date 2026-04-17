// ═══════════════════════════════════════════════════════════════
//  bv-bo-world.js — Pass 5b.4 world-graph agent API
//
//  Registers two new actions on window.BO:
//    exportWorldGraph  — returns the full world graph as JSON
//                        (nodes with metadata, edges from doorTargets,
//                        layout positions if available)
//    applyWorldDiff    — takes a diff (nodes to create, edges to add,
//                        deletes) and fans out to createFloor /
//                        deleteFloor / setDoorTarget / setBiome.
//                        Transaction: validate all inputs first, then
//                        apply. Rollback on error via _snapshotAll /
//                        _restoreAll.
//
//  Depends on (must load AFTER):
//    bv-bo-router.js      (window.BO._register, window.BO._helpers)
//    bv-bo-floor.js       (createFloor, deleteFloor, setBiome registered)
//    bv-floor-data.js     (FLOORS, FLOOR_NAMES)
//    bv-meta-editor.js    (setDoorTarget)
//    bv-validation.js     (runValidation, VALIDATE)
// ═══════════════════════════════════════════════════════════════
'use strict';

(function() {
  if (!window.BO || typeof window.BO._register !== 'function') {
    console.warn('[bv-bo-world] window.BO._register missing — router not loaded?');
    return;
  }
  var H = window.BO._helpers || {};

  // ── helpers ─────────────────────────────────────────────────
  function depthOf(id)  { return id.split('.').length; }
  function parentOf(id) {
    var p = id.split('.');
    if (p.length <= 1) return null;
    p.pop();
    return p.join('.');
  }

  function depthType(d) {
    if (d >= 3) return 'dungeon';
    if (d === 2) return 'interior';
    return 'exterior';
  }

  // ── exportWorldGraph ────────────────────────────────────────
  // Returns { nodes: [...], edges: [...], summary: {...} }
  // Each node: { id, biome, gridW, gridH, depth, type, spawn, entityCount,
  //              roomCount, doorCount }
  // Each edge: { from, to, fromCoord, reciprocal, type }
  window.BO._register('exportWorldGraph', function(a) {
    if (typeof FLOORS === 'undefined') throw new Error('FLOORS not loaded');

    var nodes = [];
    var edges = [];
    var edgeSet = {}; // dedup "from:to" to avoid duplicates

    var floorIds = Object.keys(FLOORS).sort();
    for (var i = 0; i < floorIds.length; i++) {
      var id = floorIds[i];
      var f = FLOORS[id];
      var d = depthOf(id);
      nodes.push({
        id:          id,
        biome:       f.biome || null,
        gridW:       f.gridW || (f.grid && f.grid[0] ? f.grid[0].length : 0),
        gridH:       f.gridH || (f.grid ? f.grid.length : 0),
        depth:       d,
        type:        depthType(d),
        parent:      parentOf(id),
        spawn:       f.spawn || null,
        entityCount: (f.entities || []).length,
        roomCount:   (f.rooms || []).length,
        doorCount:   Object.keys(f.doorTargets || {}).length,
        name:        (typeof FLOOR_NAMES !== 'undefined' && FLOOR_NAMES[id]) || id
      });

      // Edges from doorTargets
      var dt = f.doorTargets || {};
      var dtKeys = Object.keys(dt);
      for (var j = 0; j < dtKeys.length; j++) {
        var coord = dtKeys[j];
        var toId = dt[coord];
        if (!toId) continue;
        var edgeKey = id + ':' + toId;
        if (edgeSet[edgeKey]) continue;
        edgeSet[edgeKey] = true;

        // Check reciprocity
        var reciprocal = false;
        var toFloor = FLOORS[toId];
        if (toFloor && toFloor.doorTargets) {
          var tdt = toFloor.doorTargets;
          for (var tk in tdt) {
            if (tdt[tk] === id) { reciprocal = true; break; }
          }
        }

        edges.push({
          from:      id,
          to:        toId,
          fromCoord: coord,
          reciprocal: reciprocal,
          type:      depthType(Math.max(d, depthOf(toId)))
        });
      }
    }

    return {
      nodes:   nodes,
      edges:   edges,
      summary: {
        floorCount:  nodes.length,
        edgeCount:   edges.length,
        nonReciprocal: edges.filter(function(e) { return !e.reciprocal; }).length,
        depths:      { exterior: 0, interior: 0, dungeon: 0 }
      }
    };
  });

  // Count depth types in summary after building it
  // (inline — the returned summary is filled below)

  // ── applyWorldDiff ──────────────────────────────────────────
  // Args:
  //   nodes:   [{ id, biome, w, h, wallTile?, floorTile?, spawn?, name? }]
  //            → fans out to BO.run({action:'createFloor', ...})
  //   edges:   [{ from, to, fromCoord, toCoord?, reciprocal? }]
  //            → fans out to BO.run({action:'setDoorTarget', ...})
  //            If reciprocal is true (default), sets both directions.
  //   deletes: [{ id, cascade? }]
  //            → fans out to BO.run({action:'deleteFloor', ...})
  //   biomes:  [{ floor, biome }]
  //            → fans out to BO.run({action:'setBiome', ...})
  //   validate: (optional) if true, run validation after applying
  //
  // Transaction semantics: snapshot before, validate inputs, apply in
  // order (deletes → nodes → biomes → edges), rollback on any error.
  window.BO._register('applyWorldDiff', function(a) {
    if (typeof FLOORS === 'undefined') throw new Error('FLOORS not loaded');

    var nodeDiffs   = Array.isArray(a.nodes)   ? a.nodes   : [];
    var edgeDiffs   = Array.isArray(a.edges)   ? a.edges   : [];
    var deleteDiffs = Array.isArray(a.deletes) ? a.deletes : [];
    var biomeDiffs  = Array.isArray(a.biomes)  ? a.biomes  : [];
    var doValidate  = !!a.validate;

    // ── Phase 1: validate inputs before mutating ──────────────
    var errors = [];

    // Validate deletes
    for (var d = 0; d < deleteDiffs.length; d++) {
      var dd = deleteDiffs[d];
      if (!dd.id) errors.push('delete[' + d + ']: missing id');
      else if (!FLOORS[dd.id]) errors.push('delete[' + d + ']: floor not found: ' + dd.id);
    }

    // Validate new nodes (check for conflicts, but allow if delete
    // removes it first — order matters)
    var willDelete = {};
    deleteDiffs.forEach(function(dd) { if (dd.id) willDelete[dd.id] = true; });

    for (var n = 0; n < nodeDiffs.length; n++) {
      var nd = nodeDiffs[n];
      if (!nd.id)    errors.push('nodes[' + n + ']: missing id');
      if (!nd.biome) errors.push('nodes[' + n + ']: missing biome');
      if (nd.id && FLOORS[nd.id] && !willDelete[nd.id] && !nd.force) {
        errors.push('nodes[' + n + ']: floor already exists: ' + nd.id + ' (use force:true or add to deletes)');
      }
    }

    // Validate biome changes
    for (var b = 0; b < biomeDiffs.length; b++) {
      var bd = biomeDiffs[b];
      if (!bd.floor) errors.push('biomes[' + b + ']: missing floor');
      if (!bd.biome) errors.push('biomes[' + b + ']: missing biome');
    }

    // Validate edges
    // (We can't fully validate coords without knowing the floor grid,
    // but we check that from/to and fromCoord are present)
    for (var e = 0; e < edgeDiffs.length; e++) {
      var ed = edgeDiffs[e];
      if (!ed.from)      errors.push('edges[' + e + ']: missing from');
      if (!ed.to)        errors.push('edges[' + e + ']: missing to');
      if (!ed.fromCoord) errors.push('edges[' + e + ']: missing fromCoord (e.g. "12,4")');
    }

    if (errors.length > 0) {
      return { applied: false, errors: errors };
    }

    // ── Phase 2: snapshot for rollback ────────────────────────
    var snap = H._snapshotAll ? H._snapshotAll() : null;
    var applied = { deleted: [], created: [], biomes: [], edges: [] };

    try {
      // ── Phase 3a: deletes first ──────────────────────────────
      for (var di = 0; di < deleteDiffs.length; di++) {
        var dr = window.BO.run({
          action: 'deleteFloor',
          id: deleteDiffs[di].id,
          cascade: deleteDiffs[di].cascade || 'orphan'
        });
        if (!dr.ok) throw new Error('deleteFloor(' + deleteDiffs[di].id + '): ' + dr.error);
        applied.deleted = applied.deleted.concat(dr.result.deleted || []);
      }

      // ── Phase 3b: create nodes ───────────────────────────────
      for (var ni = 0; ni < nodeDiffs.length; ni++) {
        var nc = nodeDiffs[ni];
        var cr = window.BO.run({
          action: 'createFloor',
          id:        nc.id,
          biome:     nc.biome,
          w:         nc.w || 16,
          h:         nc.h || 16,
          wallTile:  nc.wallTile  || 'WALL',
          floorTile: nc.floorTile || 'EMPTY',
          spawn:     nc.spawn || null,
          doorTargets: nc.doorTargets || {},
          force:     nc.force || false,
          select:    false,
          name:      nc.name || null
        });
        if (!cr.ok) throw new Error('createFloor(' + nc.id + '): ' + cr.error);
        applied.created.push(nc.id);
      }

      // ── Phase 3c: biome changes ──────────────────────────────
      for (var bi = 0; bi < biomeDiffs.length; bi++) {
        var bc = biomeDiffs[bi];
        var br = window.BO.run({
          action: 'setBiome',
          floor: bc.floor,
          biome: bc.biome
        });
        if (!br.ok) throw new Error('setBiome(' + bc.floor + '): ' + br.error);
        applied.biomes.push({ floor: bc.floor, biome: bc.biome });
      }

      // ── Phase 3d: edges (door targets) ───────────────────────
      for (var ei = 0; ei < edgeDiffs.length; ei++) {
        var ec = edgeDiffs[ei];
        var fc = ec.fromCoord.split(',');
        var fwd = window.BO.run({
          action: 'setDoorTarget',
          floor: ec.from,
          at: { x: parseInt(fc[0], 10), y: parseInt(fc[1], 10) },
          target: ec.to
        });
        if (!fwd.ok) throw new Error('setDoorTarget(' + ec.from + ' → ' + ec.to + '): ' + fwd.error);
        applied.edges.push({ from: ec.from, to: ec.to, fromCoord: ec.fromCoord });

        // Reciprocal (default true)
        var recip = ec.reciprocal !== false;
        if (recip && ec.toCoord) {
          var tc = ec.toCoord.split(',');
          var rev = window.BO.run({
            action: 'setDoorTarget',
            floor: ec.to,
            at: { x: parseInt(tc[0], 10), y: parseInt(tc[1], 10) },
            target: ec.from
          });
          if (!rev.ok) throw new Error('setDoorTarget(' + ec.to + ' → ' + ec.from + '): ' + rev.error);
          applied.edges.push({ from: ec.to, to: ec.from, fromCoord: ec.toCoord });
        }
      }
    } catch (err) {
      // ── Rollback ────────────────────────────────────────────
      if (snap && H._restoreAll) H._restoreAll(snap);
      return {
        applied: false,
        error: err.message,
        partial: applied
      };
    }

    // ── Phase 4: optional post-validation ─────────────────────
    var validation = null;
    if (doValidate && typeof runValidation === 'function' &&
        typeof VALIDATE !== 'undefined') {
      runValidation('all');
      validation = (VALIDATE.lastResults || []).map(function(i) {
        return {
          floorId:  i.floorId || null,
          severity: i.severity || 'info',
          kind:     i.kind || '',
          msg:      i.msg || ''
        };
      });
    }

    return {
      applied: true,
      deleted:  applied.deleted,
      created:  applied.created,
      biomes:   applied.biomes,
      edges:    applied.edges,
      validation: validation
    };
  });

  console.log('[bv-bo-world] registered: exportWorldGraph, applyWorldDiff');
})();

// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-world.js — Pass 5b.4 world-graph agent API
//
//  Commands:
//    export-world-graph   Dump the full world graph as JSON (nodes,
//                         edges, summary). Agents call this to see
//                         the floor tree before proposing changes.
//    apply-world-diff     Apply a batched diff: create floors, set
//                         biomes, wire door targets, delete floors —
//                         all in a single validated transaction.
//
//  Mirror of browser-side bv-bo-world.js (exportWorldGraph /
//  applyWorldDiff BO actions).
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

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

function childrenOf(floors, pid) {
  var prefix = pid + '.';
  var kids = [];
  Object.keys(floors).forEach(function(fid) {
    if (fid.indexOf(prefix) === 0) {
      var rest = fid.slice(prefix.length);
      if (rest.indexOf('.') < 0) kids.push(fid);
    }
  });
  return kids;
}

function collectTree(floors, rootId) {
  var ids = [rootId];
  var kids = childrenOf(floors, rootId);
  for (var i = 0; i < kids.length; i++) {
    ids = ids.concat(collectTree(floors, kids[i]));
  }
  return ids;
}

// ── export-world-graph ──────────────────────────────────────
function exportWorldGraph(args, raw) {
  var floors = raw.floors || {};
  var nodes = [];
  var edges = [];
  var edgeSet = {};

  var floorIds = Object.keys(floors).sort();
  for (var i = 0; i < floorIds.length; i++) {
    var id = floorIds[i];
    var f = floors[id];
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
      doorCount:   Object.keys(f.doorTargets || {}).length
    });

    var dt = f.doorTargets || {};
    var dtKeys = Object.keys(dt);
    for (var j = 0; j < dtKeys.length; j++) {
      var coord = dtKeys[j];
      var toId = dt[coord];
      if (!toId) continue;
      var edgeKey = id + ':' + toId;
      if (edgeSet[edgeKey]) continue;
      edgeSet[edgeKey] = true;

      var reciprocal = false;
      var toFloor = floors[toId];
      if (toFloor && toFloor.doorTargets) {
        for (var tk in toFloor.doorTargets) {
          if (toFloor.doorTargets[tk] === id) { reciprocal = true; break; }
        }
      }

      edges.push({
        from:       id,
        to:         toId,
        fromCoord:  coord,
        reciprocal: reciprocal,
        type:       depthType(Math.max(d, depthOf(toId)))
      });
    }
  }

  var depthCounts = { exterior: 0, interior: 0, dungeon: 0 };
  nodes.forEach(function(n) { depthCounts[n.type]++; });

  var result = {
    nodes:   nodes,
    edges:   edges,
    summary: {
      floorCount:    nodes.length,
      edgeCount:     edges.length,
      nonReciprocal: edges.filter(function(e) { return !e.reciprocal; }).length,
      depths:        depthCounts
    }
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// ── apply-world-diff ────────────────────────────────────────
// Reads a diff JSON from --input <file> or stdin (piped).
// Diff shape:
//   {
//     nodes:   [{ id, biome, w?, h?, wallTile?, floorTile?, spawn?, name? }],
//     edges:   [{ from, to, fromCoord, toCoord?, reciprocal? }],
//     deletes: [{ id, cascade? }],
//     biomes:  [{ floor, biome }]
//   }
function applyWorldDiff(args, raw, schema) {
  var floors = raw.floors || {};
  var diffJson;

  // Load diff from --input file or first positional arg
  var inputPath = args.input || args._[0];
  if (!inputPath) {
    S.fail(1, 'apply-world-diff needs --input <file.json> or a positional path');
  }
  if (!S.fs.existsSync(inputPath)) {
    S.fail(1, 'diff file not found: ' + inputPath);
  }
  try {
    diffJson = JSON.parse(S.fs.readFileSync(inputPath, 'utf8'));
  } catch (e) {
    S.fail(2, 'invalid JSON in diff file: ' + e.message);
  }

  var nodeDiffs   = Array.isArray(diffJson.nodes)   ? diffJson.nodes   : [];
  var edgeDiffs   = Array.isArray(diffJson.edges)   ? diffJson.edges   : [];
  var deleteDiffs = Array.isArray(diffJson.deletes) ? diffJson.deletes : [];
  var biomeDiffs  = Array.isArray(diffJson.biomes)  ? diffJson.biomes  : [];

  // ── Phase 1: validate ─────────────────────────────────────
  var errors = [];

  for (var d = 0; d < deleteDiffs.length; d++) {
    if (!deleteDiffs[d].id) errors.push('delete[' + d + ']: missing id');
    else if (!floors[deleteDiffs[d].id]) errors.push('delete[' + d + ']: floor not found: ' + deleteDiffs[d].id);
  }

  var willDelete = {};
  deleteDiffs.forEach(function(dd) { if (dd.id) willDelete[dd.id] = true; });

  for (var n = 0; n < nodeDiffs.length; n++) {
    if (!nodeDiffs[n].id)    errors.push('nodes[' + n + ']: missing id');
    if (!nodeDiffs[n].biome) errors.push('nodes[' + n + ']: missing biome');
    if (nodeDiffs[n].id && floors[nodeDiffs[n].id] && !willDelete[nodeDiffs[n].id] && !nodeDiffs[n].force) {
      errors.push('nodes[' + n + ']: floor exists: ' + nodeDiffs[n].id);
    }
  }

  for (var b = 0; b < biomeDiffs.length; b++) {
    if (!biomeDiffs[b].floor) errors.push('biomes[' + b + ']: missing floor');
    if (!biomeDiffs[b].biome) errors.push('biomes[' + b + ']: missing biome');
  }

  for (var e = 0; e < edgeDiffs.length; e++) {
    if (!edgeDiffs[e].from)      errors.push('edges[' + e + ']: missing from');
    if (!edgeDiffs[e].to)        errors.push('edges[' + e + ']: missing to');
    if (!edgeDiffs[e].fromCoord) errors.push('edges[' + e + ']: missing fromCoord');
  }

  if (errors.length > 0) {
    process.stderr.write('[apply-world-diff] validation failed:\n');
    errors.forEach(function(err) { process.stderr.write('  ' + err + '\n'); });
    S.fail(2, errors.length + ' validation error(s)');
  }

  // ── Phase 2: snapshot for dry-run diffing ───────────────────
  var snap = JSON.parse(JSON.stringify(raw));
  var applied = { deleted: [], created: [], biomes: [], edges: [] };

  // ── Phase 3a: deletes ───────────────────────────────────────
  for (var di = 0; di < deleteDiffs.length; di++) {
    var delId = deleteDiffs[di].id;
    var cascade = deleteDiffs[di].cascade || 'orphan';
    var toRemove = (cascade === 'delete') ? collectTree(floors, delId) : [delId];
    var orphaned = (cascade !== 'delete') ? childrenOf(floors, delId) : [];

    // Scrub doorTargets pointing at deleted floors
    var delSet = {};
    toRemove.forEach(function(rid) { delSet[rid] = true; });

    toRemove.forEach(function(rid) { delete floors[rid]; });

    Object.keys(floors).forEach(function(fid) {
      var dt = floors[fid].doorTargets;
      if (!dt) return;
      Object.keys(dt).forEach(function(coord) {
        if (delSet[dt[coord]]) delete dt[coord];
      });
    });

    applied.deleted = applied.deleted.concat(toRemove);
  }

  // ── Phase 3b: create nodes ──────────────────────────────────
  for (var ni = 0; ni < nodeDiffs.length; ni++) {
    var nc = nodeDiffs[ni];
    var w = (nc.w | 0) || 16;
    var h = (nc.h | 0) || 16;
    var wallTile  = S.resolveTile(nc.wallTile  || 'WALL', schema);
    var floorTile = S.resolveTile(nc.floorTile || 'EMPTY', schema);

    // Build empty grid
    var grid = [];
    for (var gy = 0; gy < h; gy++) {
      var row = [];
      for (var gx = 0; gx < w; gx++) {
        row.push((gx === 0 || gy === 0 || gx === w - 1 || gy === h - 1) ? wallTile : floorTile);
      }
      grid.push(row);
    }

    var spawn = nc.spawn || { x: w >> 1, y: h >> 1, dir: 0 };
    floors[nc.id] = {
      floorId: nc.id,
      grid: grid, gridW: w, gridH: h,
      rooms: [], doors: [],
      doorTargets: nc.doorTargets || {},
      doorFaces: {},
      spawn: { x: spawn.x | 0, y: spawn.y | 0, dir: spawn.dir | 0 },
      biome: nc.biome,
      shops: [],
      entities: []
    };
    applied.created.push(nc.id);
  }

  // ── Phase 3c: biome changes ─────────────────────────────────
  for (var bi = 0; bi < biomeDiffs.length; bi++) {
    var bf = biomeDiffs[bi].floor;
    if (!floors[bf]) {
      process.stderr.write('[apply-world-diff] warning: setBiome skipped — floor not found: ' + bf + '\n');
      continue;
    }
    floors[bf].biome = biomeDiffs[bi].biome;
    applied.biomes.push({ floor: bf, biome: biomeDiffs[bi].biome });
  }

  // ── Phase 3d: edges (door targets) ──────────────────────────
  for (var ei = 0; ei < edgeDiffs.length; ei++) {
    var ec = edgeDiffs[ei];
    var fromFloor = floors[ec.from];
    if (!fromFloor) {
      process.stderr.write('[apply-world-diff] warning: edge skipped — from floor not found: ' + ec.from + '\n');
      continue;
    }
    if (!fromFloor.doorTargets) fromFloor.doorTargets = {};
    fromFloor.doorTargets[ec.fromCoord] = ec.to;
    applied.edges.push({ from: ec.from, to: ec.to, fromCoord: ec.fromCoord });

    // Reciprocal
    var recip = ec.reciprocal !== false;
    if (recip && ec.toCoord) {
      var toFloor = floors[ec.to];
      if (toFloor) {
        if (!toFloor.doorTargets) toFloor.doorTargets = {};
        toFloor.doorTargets[ec.toCoord] = ec.from;
        applied.edges.push({ from: ec.to, to: ec.from, fromCoord: ec.toCoord });
      }
    }
  }

  // ── Phase 4: save ───────────────────────────────────────────
  S.saveFloors(raw);

  var result = {
    applied: true,
    deleted: applied.deleted,
    created: applied.created,
    biomes:  applied.biomes,
    edges:   applied.edges
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// ── exports ─────────────────────────────────────────────────
module.exports = {
  'export-world-graph': exportWorldGraph,
  'apply-world-diff':   applyWorldDiff
};

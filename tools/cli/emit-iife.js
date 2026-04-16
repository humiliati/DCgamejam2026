// ═══════════════════════════════════════════════════════════════
//  tools/cli/emit-iife.js — Deterministic IIFE scaffolder
//  Slice C2 — Track C (agent-feedback closeouts)
//
//  Emits a floor-blockout-<id>.js source string from an in-memory
//  floor record (grid, spawn, doorTargets, biome, rooms, shops,
//  entities). Shared by:
//
//    * Browser: tools/js/bv-save-patcher.js (scaffoldFloorBlockoutSource)
//    * CLI:     tools/cli/commands-emit.js  (bo emit --as iife ...)
//
//  OUTPUT CONTRACT — must remain byte-identical between the two.
//  If you touch the output shape here, mirror the same change into
//  bv-save-patcher.js.scaffoldFloorBlockoutSource — or better, route
//  the browser through this emitter once FS-API wrapping allows it.
//
//  The round-trip smoke test in Slice C2 enforces: emit → ingest →
//  emit is idempotent (byte-identical modulo comment whitespace).
// ═══════════════════════════════════════════════════════════════
'use strict';

// ── Grid literal (matches bv-save-patcher.formatGridLiteral) ────
// Emits:
//   var GRID = [
//     [ 0, 0, 1, 0, ...],  // y 0
//     ...
//   ];
// Cell width is the width of the largest tile id in the grid so
// columns stay aligned; row comments `// yNN` survive hand-editing.
function formatGridLiteral(grid) {
  var pad2 = function(n) { return (n < 10 ? ' ' : '') + n; };
  var max = 0;
  for (var y = 0; y < grid.length; y++) {
    var row = grid[y];
    for (var x = 0; x < row.length; x++) {
      if (row[x] > max) max = row[x];
    }
  }
  var cellW = String(max).length;
  if (!cellW) cellW = 1;
  var lines = ['  var GRID = ['];
  for (var y2 = 0; y2 < grid.length; y2++) {
    var r = grid[y2];
    var cells = [];
    for (var x2 = 0; x2 < r.length; x2++) {
      var s = String(r[x2]);
      cells.push(' '.repeat(Math.max(0, cellW - s.length)) + s);
    }
    var comma = (y2 < grid.length - 1) ? ',' : '';
    lines.push('    [' + cells.join(',') + ']' + comma + ' // y' + pad2(y2));
  }
  lines.push('  ];');
  return lines.join('\n');
}

// ── Full IIFE scaffold ──────────────────────────────────────────
// Mirrors bv-save-patcher.js scaffoldFloorBlockoutSource. Keep the
// two functions byte-identical for round-trip fidelity.
function scaffoldFloorBlockoutSource(floorId, floor) {
  if (!floor || !floor.grid || !floor.grid.length) return null;
  var W = floor.grid[0].length;
  var H = floor.grid.length;
  var gridLiteral = formatGridLiteral(floor.grid);
  var spawn = floor.spawn || { x: W >> 1, y: H >> 1, dir: 0 };
  var biome = floor.biome || '';
  var doorTargets = floor.doorTargets || {};
  var entities = Array.isArray(floor.entities) ? floor.entities : [];
  var rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
  var shops = Array.isArray(floor.shops) ? floor.shops : [];

  var depth = String(floorId).split('.').length;
  var depthLabel = depth === 1 ? 'exterior'
                 : depth === 2 ? 'interior'
                 : 'nested dungeon';

  var lines = [];
  lines.push('/**');
  lines.push(' * Floor Blockout ' + floorId + (biome ? ' — ' + biome : '') + ' (depth ' + depth + ', ' + depthLabel + ')');
  lines.push(' *');
  lines.push(' * Scaffolded by tools/cli/emit-iife.js (Slice C2).');
  lines.push(' * Edit freely — the grid block is patched in-place on future saves.');
  lines.push(' */');
  lines.push('(function () {');
  lines.push("  'use strict';");
  lines.push('');
  lines.push('  var W = ' + W + ';');
  lines.push('  var H = ' + H + ';');
  lines.push('');
  lines.push('  // prettier-ignore');
  lines.push(gridLiteral);
  lines.push('');
  lines.push('  var SPAWN = { x: ' + (spawn.x | 0) + ', y: ' + (spawn.y | 0) + ', dir: ' + (spawn.dir | 0) + ' };');
  lines.push('');
  lines.push('  var ROOMS = ' + JSON.stringify(rooms) + ';');
  lines.push('  var DOOR_TARGETS = ' + JSON.stringify(doorTargets) + ';');
  lines.push('  var SHOPS = ' + JSON.stringify(shops) + ';');
  lines.push('  var ENTITIES = ' + JSON.stringify(entities) + ';');
  lines.push('');
  lines.push('  function build() {');
  lines.push('    var grid = [];');
  lines.push('    for (var y = 0; y < H; y++) grid[y] = GRID[y].slice();');
  lines.push('    return {');
  lines.push('      grid: grid,');
  lines.push('      rooms: ROOMS.slice(),');
  lines.push('      doors: {},');
  lines.push('      doorTargets: JSON.parse(JSON.stringify(DOOR_TARGETS)),');
  lines.push('      gridW: W, gridH: H,');
  lines.push('      spawn: { x: SPAWN.x, y: SPAWN.y, dir: SPAWN.dir },');
  lines.push("      biome: '" + biome.replace(/'/g, "\\'") + "',");
  lines.push('      shops: SHOPS.slice(),');
  lines.push('      entities: ENTITIES.slice()');
  lines.push('    };');
  lines.push('  }');
  lines.push('');
  lines.push("  FloorManager.registerFloorBuilder('" + floorId + "', build);");
  lines.push('})();');
  lines.push('');
  return lines.join('\n');
}

// ── Canonical engine filename ──────────────────────────────────
// Matches tools/js/bv-save-patcher.js.floorBlockoutFileName —
// replaces '.' with '-' so '2.2.1' → 'floor-blockout-2-2-1.js'.
function floorBlockoutFileName(floorId) {
  return 'floor-blockout-' + String(floorId).replace(/\./g, '-') + '.js';
}

module.exports = {
  formatGridLiteral: formatGridLiteral,
  scaffoldFloorBlockoutSource: scaffoldFloorBlockoutSource,
  floorBlockoutFileName: floorBlockoutFileName
};

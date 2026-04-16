// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-emit.js — `bo emit` (Slice C2)
//
//  Read a floor from tools/floor-data.json and emit it as a
//  browser-loadable IIFE (matching engine/floor-blockout-*.js
//  convention). Closes blocker #2 from tools/BO-V agent feedback.md
//  when paired with `bo ingest`: round-trip becomes byte-identical.
//
//  Shape:
//    bo emit --floor 2.2.1 --as iife                  (→ stdout)
//    bo emit --floor 2.2.1 --as iife --out /tmp/f.js  (→ file)
//    bo emit --floor 2.2.1 --as iife --overwrite      (→ engine/...)
//    bo emit --floor 2.2.1 --as json                  (→ stdout, json)
//
//  --overwrite and --out are exclusive; --overwrite always targets
//  engine/floor-blockout-<id>.js so there's no path-for-you-to-type
//  footgun.
//
//  Exit codes: 0 ok, 1 usage, 2 runtime.
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');
var S    = require('./shared');
var emit = require('./emit-iife');

function run(args, raw) {
  var floorId = args.floor ? String(args.floor) : null;
  if (!floorId) S.fail(1, 'emit needs --floor <id>');
  var floor = raw.floors[floorId];
  if (!floor) S.fail(2, 'emit: floor "' + floorId + '" not found in floor-data.json');

  var format = (args.as || 'iife').toString().toLowerCase();
  var outPath = args.out ? String(args.out) : null;
  var overwrite = !!args.overwrite;
  if (outPath && overwrite) S.fail(1, 'emit: --out and --overwrite are mutually exclusive');

  var payload;
  if (format === 'json') {
    payload = JSON.stringify({
      floorId: floorId,
      grid: floor.grid,
      gridW: floor.gridW, gridH: floor.gridH,
      spawn: floor.spawn || null,
      biome: floor.biome || '',
      rooms: floor.rooms || [],
      doorTargets: floor.doorTargets || {},
      shops: floor.shops || [],
      entities: floor.entities || []
    }, null, 2) + '\n';
  } else if (format === 'iife') {
    var src = emit.scaffoldFloorBlockoutSource(floorId, floor);
    if (!src) S.fail(2, 'emit: scaffoldFloorBlockoutSource returned null (empty floor?)');
    payload = src;
  } else {
    S.fail(1, 'emit: unknown --as "' + format + '" (expected iife|json)');
  }

  // Resolve destination.
  var writeTo = null;
  if (overwrite) {
    // Project-root-relative engine path. Keep it simple: always
    // engine/floor-blockout-<id>.js — agent never has to guess.
    writeTo = path.join(S.paths.TOOLS_DIR, '..', 'engine', emit.floorBlockoutFileName(floorId));
  } else if (outPath) {
    writeTo = path.isAbsolute(outPath)
      ? outPath
      : path.join(process.cwd(), outPath);
  }

  if (writeTo) {
    // In --dry-run mode, shared.js has flipped saveFloors to a no-op.
    // Mirror that behavior for emit writes so `bo emit --overwrite
    // --dry-run` never actually touches engine/*. The dispatcher's
    // dry-run preview still prints; we just skip the write itself.
    if (S.isDryRun && S.isDryRun()) {
      process.stderr.write('[blockout-cli] --dry-run: skipped write to ' + writeTo + ' (' + payload.length + ' bytes)\n');
    } else {
      fs.writeFileSync(writeTo, payload);
    }
    process.stdout.write(JSON.stringify({
      ok: true, action: 'emit', floorId: floorId, format: format,
      path: writeTo, bytes: payload.length,
      overwrite: overwrite, dryRun: !!(S.isDryRun && S.isDryRun())
    }, null, 2) + '\n');
  } else {
    // stdout
    process.stdout.write(payload);
    if (payload.charAt(payload.length - 1) !== '\n') process.stdout.write('\n');
  }
}

module.exports = {
  'emit': run,
  '_emitOne': run
};

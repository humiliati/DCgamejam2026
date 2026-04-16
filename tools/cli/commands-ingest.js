// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-ingest.js — `bo ingest` (Slice C2)
//
//  Parse a single engine/floor-blockout-<id>.js IIFE into memory
//  and merge the result into tools/floor-data.json. The engine file
//  is not modified. Closes blocker #2 from tools/BO-V agent
//  feedback.md: "canonical state diverges (IIFE vs JSON)".
//
//  Shape:
//    bo ingest --from engine/floor-blockout-3-1-1.js
//    bo ingest --floor 3.1.1                           (derives path)
//    bo ingest --floor 3.1.1 --print                   (no merge; stdout)
//
//  Exit codes: 0 ok, 1 usage, 2 runtime.
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');
var S    = require('./shared');
var sandboxMod = require('./iife-sandbox');

// Convert '3.1.1' → 'floor-blockout-3-1-1.js'. Mirrors browser-side
// tools/js/bv-save-patcher.js.floorBlockoutFileName.
function fileNameForFloor(floorId) {
  return 'floor-blockout-' + String(floorId).replace(/\./g, '-') + '.js';
}

// Inverse: 'floor-blockout-3-1-1.js' → '3.1.1'. Returns null on no match.
function floorIdFromFileName(name) {
  var m = /^floor-blockout-([\d\-]+)\.js$/.exec(path.basename(String(name)));
  if (!m) return null;
  return m[1].replace(/-/g, '.');
}

function run(args, raw) {
  var fromPath = args.from ? String(args.from) : null;
  var floorId  = args.floor ? String(args.floor) : null;

  // Derive the missing half.
  if (fromPath && !floorId) floorId = floorIdFromFileName(fromPath);
  if (floorId && !fromPath) fromPath = path.join('engine', fileNameForFloor(floorId));
  if (!floorId || !fromPath) {
    S.fail(1, 'ingest needs --floor <id> or --from <path> (or both)');
  }

  // Normalize path: treat absolute paths verbatim; relative paths are
  // resolved from the project root so `--from engine/floor-blockout-3-1-1.js`
  // works no matter where the CLI was invoked from.
  var absFromPath = path.isAbsolute(fromPath)
    ? fromPath
    : path.join(sandboxMod.ROOT, fromPath);
  if (!fs.existsSync(absFromPath)) {
    S.fail(2, 'ingest: file not found: ' + absFromPath);
  }
  var relFromRoot = path.relative(sandboxMod.ROOT, absFromPath);

  // Boot sandbox with tiles.js + floor-manager.js, then evaluate the
  // target floor IIFE so FloorManager._testGetBuilders() sees it.
  var harness;
  try {
    harness = sandboxMod.bootstrapForIngest();
  } catch (e) {
    S.fail(2, 'ingest: sandbox bootstrap failed — ' + ((e && e.message) || e));
  }
  var loadRes = harness.loadFile(relFromRoot);
  if (!loadRes.ok) S.fail(2, 'ingest: failed to eval ' + relFromRoot + ' — ' + loadRes.reason);

  var extracted;
  try {
    extracted = sandboxMod.extractFloor(harness.sandbox, floorId);
  } catch (e) {
    S.fail(2, 'ingest: extractFloor failed — ' + ((e && e.message) || e));
  }
  if (!extracted) {
    S.fail(2, 'ingest: floor "' + floorId + '" did not register a builder (check floor id in the IIFE)');
  }

  // --print: emit the extracted payload to stdout, do NOT touch floor-data.json.
  if (args.print) {
    process.stdout.write(JSON.stringify({
      ok: true, action: 'ingest', floorId: floorId,
      source: relFromRoot, floor: extracted
    }, null, 2) + '\n');
    return;
  }

  // Merge into floor-data.json. Preserve any pre-existing entities[]
  // if the IIFE doesn't emit them (extract-floors.js does the same
  // thing for whole-world extract).
  var prior = raw.floors[floorId];
  if (!Array.isArray(extracted.entities)) extracted.entities = [];
  if (prior && Array.isArray(prior.entities) && extracted.entities.length === 0) {
    extracted.entities = prior.entities.slice();
  }
  raw.floors[floorId] = extracted;
  raw.generated = new Date().toISOString();
  raw.floorCount = Object.keys(raw.floors).length;
  S.saveFloors(raw);

  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'ingest',
    floorId: floorId,
    source: relFromRoot,
    gridW: extracted.gridW, gridH: extracted.gridH,
    spawn: extracted.spawn || null,
    biome: extracted.biome || null,
    doorTargetCount: Object.keys(extracted.doorTargets || {}).length,
    entityCount: (extracted.entities || []).length,
    merged: 'floor-data.json'
  }, null, 2) + '\n');
}

module.exports = {
  'ingest': run,
  // Export the helpers so tests / sibling commands (e.g. IIFE-aware
  // render-ascii in Slice C5) can reuse the single-floor parser.
  '_fileNameForFloor':    fileNameForFloor,
  '_floorIdFromFileName': floorIdFromFileName,
  '_ingestOne':           run
};

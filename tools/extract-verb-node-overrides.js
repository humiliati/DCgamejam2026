#!/usr/bin/env node
// ============================================================
// extract-verb-node-overrides.js — DOC-110 P3 Ch.2 stretch
// ============================================================
// Scans tools/verb-node-overrides/*.json and emits a single
// bundle sidecar at data/verb-node-overrides.js so that
// engine/verb-node-overrides-seed.js can register ops for
// every authored floor under file:// without a sync XHR per
// file.
//
// Bundle shape (window.VERB_NODE_OVERRIDES_DATA):
//   {
//     _meta:     { generatedAt, generator, schemaRef, floorCount, opCount },
//     byFloor:   {
//       "2.2.1": {
//         floorId: "2.2.1",
//         add:     [ { id, type, x, y, faction?, contested? }, ... ],
//         remove:  [ "nodeId1", "nodeId2", ... ],
//         replace: [ { id, patch: {...} }, ... ]
//       },
//       ...
//     }
//   }
//
// Idempotent: running on an unchanged corpus only refreshes
// _meta.generatedAt.
//
// Usage:  node tools/extract-verb-node-overrides.js [--dry-run]
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT  = path.resolve(__dirname, '..');
var SRC_DIR    = path.join(REPO_ROOT, 'tools', 'verb-node-overrides');
var BUNDLE_OUT = path.join(REPO_ROOT, 'data', 'verb-node-overrides.js');

var DRY_RUN = process.argv.includes('--dry-run');

function listFloorFiles(dir) {
  var entries;
  try { entries = fs.readdirSync(dir); }
  catch (e) {
    console.warn('[extract-verb-node-overrides] ' + dir + ' not found — emitting empty bundle.');
    return [];
  }
  return entries
    .filter(function (f) { return /^[0-9]+(\.[0-9]+)*\.json$/.test(f); })
    .sort(sortFloorFilenames);
}

function sortFloorFilenames(a, b) {
  var fa = a.replace(/\.json$/, '').split('.').map(Number);
  var fb = b.replace(/\.json$/, '').split('.').map(Number);
  for (var i = 0; i < Math.max(fa.length, fb.length); i++) {
    var da = fa[i] == null ? -1 : fa[i];
    var db = fb[i] == null ? -1 : fb[i];
    if (da !== db) return da - db;
  }
  return 0;
}

function cleanNode(d) {
  var out = { id: d.id, type: d.type, x: d.x, y: d.y };
  if (d.faction != null)   out.faction   = d.faction;
  if (d.contested === true) out.contested = true;
  return out;
}

function cleanReplace(entry) {
  var patch = {};
  if (entry.patch.type      != null) patch.type      = entry.patch.type;
  if (entry.patch.faction   != null) patch.faction   = entry.patch.faction;
  if (entry.patch.contested != null) patch.contested = entry.patch.contested;
  return { id: entry.id, patch: patch };
}

var files = listFloorFiles(SRC_DIR);
var byFloor = {};
var opCount = 0;
var issues = [];

files.forEach(function (fname) {
  var expectedFloorId = fname.replace(/\.json$/, '');
  var abs = path.join(SRC_DIR, fname);
  var raw;
  try { raw = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) {
    issues.push(fname + ': parse error — ' + e.message);
    return;
  }
  if (!raw || typeof raw !== 'object') {
    issues.push(fname + ': not an object');
    return;
  }
  if (raw.floorId !== expectedFloorId) {
    issues.push(fname + ': floorId "' + raw.floorId + '" does not match filename (expected "' + expectedFloorId + '")');
    return;
  }

  var adds     = Array.isArray(raw.add)     ? raw.add.map(cleanNode)         : [];
  var removes  = Array.isArray(raw.remove)  ? raw.remove.slice()             : [];
  var replaces = Array.isArray(raw.replace) ? raw.replace.map(cleanReplace)  : [];

  adds.sort(function (a, b) { return (a.id || '').localeCompare(b.id || ''); });
  removes.sort();
  replaces.sort(function (a, b) { return (a.id || '').localeCompare(b.id || ''); });

  if (adds.length === 0 && removes.length === 0 && replaces.length === 0) {
    // Empty override file is allowed (keeps the filename present for
    // future edits) but doesn't contribute to the bundle.
    return;
  }

  byFloor[expectedFloorId] = {
    floorId: expectedFloorId,
    add:     adds,
    remove:  removes,
    replace: replaces
  };
  opCount += adds.length + removes.length + replaces.length;
});

if (issues.length) {
  console.error('[extract-verb-node-overrides] FAIL — ' + issues.length + ' issue(s):');
  issues.forEach(function (m) { console.error('  - ' + m); });
  process.exit(1);
}

var bundle = {
  _meta: {
    generatedAt:  new Date().toISOString(),
    generator:    'tools/extract-verb-node-overrides.js (DOC-110 P3 Ch.2 stretch)',
    schemaRef:    'tools/verb-node-overrides-schema.json',
    note:         'Per-floor overrides to the DungeonVerbNodes auto-derivation. Applied at DungeonVerbNodes.populate() time via engine/verb-node-overrides-seed.js. Edit tools/verb-node-overrides/*.json directly; the pre-commit hook regenerates this bundle on stage.',
    floorCount:   Object.keys(byFloor).length,
    opCount:      opCount
  },
  byFloor: byFloor
};

var bundleJson = JSON.stringify(bundle, null, 2);

if (DRY_RUN) {
  console.log('[extract-verb-node-overrides] DRY RUN');
  console.log('  files scanned: ' + files.length);
  console.log('  floors:        ' + Object.keys(byFloor).length);
  console.log('  total ops:     ' + opCount);
  console.log('  target:        ' + BUNDLE_OUT);
  console.log('');
  Object.keys(byFloor).forEach(function (f) {
    var e = byFloor[f];
    console.log('  [' + f + ']  add:' + e.add.length + '  remove:' + e.remove.length + '  replace:' + e.replace.length);
  });
  process.exit(0);
}

var sidecarBody =
  '// AUTO-GENERATED by tools/extract-verb-node-overrides.js — do not edit by hand.\n' +
  '// Sidecar bundle of every tools/verb-node-overrides/*.json file so that\n' +
  '// engine/verb-node-overrides-seed.js can register override ops under file://\n' +
  '// without a sync XHR per file. Regenerated by the pre-commit §1e hook whenever\n' +
  '// any tools/verb-node-overrides/*.json is staged.\n' +
  'window.VERB_NODE_OVERRIDES_DATA = ' + bundleJson + ';\n';

fs.writeFileSync(BUNDLE_OUT, sidecarBody, 'utf8');
console.log('[extract-verb-node-overrides] Wrote bundle with ' + Object.keys(byFloor).length +
  ' floor(s) / ' + opCount + ' op(s) to ' + BUNDLE_OUT);

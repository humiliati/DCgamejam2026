#!/usr/bin/env node
// ============================================================
// generate-enemies-sidecar.js — DOC-110 P5 (Enemy Hydrator)
// ============================================================
// Reads data/enemies.json and emits a sibling sidecar at
// data/enemies.js so authoring tools (tools/enemy-hydrator.html)
// can load the roster via <script src="../data/enemies.js">
// instead of sync XHR. Same pattern as data/npcs.js, data/
// verb-nodes.js, and data/verb-node-overrides.js.
//
// The sidecar IS AUTO-GENERATED — hand-edits are always wrong
// (they will be clobbered on the next pre-commit sidecar regen).
//
// Output shape:
//   window.ENEMIES_DATA = { _meta: {...}, rows: [...] };
//
//   _meta.generatedAt     — ISO timestamp
//   _meta.generator       — this file's relative path
//   _meta.rowCount        — total rows incl. _comment banners
//   _meta.enemyCount      — rows with an `id` field (excludes banners)
//   rows[]                — verbatim array from data/enemies.json
//                           (preserves _comment banner rows + field
//                            order within each row)
//
// Idempotent: running on an unchanged source only refreshes
// _meta.generatedAt.
//
// Usage:  node tools/generate-enemies-sidecar.js [--dry-run]
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');
var SRC_JSON  = path.join(REPO_ROOT, 'data', 'enemies.json');
var OUT_JS    = path.join(REPO_ROOT, 'data', 'enemies.js');

var DRY_RUN = process.argv.includes('--dry-run');

var raw;
try { raw = fs.readFileSync(SRC_JSON, 'utf8'); }
catch (e) {
  console.error('[generate-enemies-sidecar] Cannot read ' + SRC_JSON + ' — ' + e.message);
  process.exit(1);
}

var rows;
try { rows = JSON.parse(raw); }
catch (e) {
  console.error('[generate-enemies-sidecar] Parse error in enemies.json — ' + e.message);
  process.exit(1);
}

if (!Array.isArray(rows)) {
  console.error('[generate-enemies-sidecar] enemies.json must be a top-level array, got ' + typeof rows);
  process.exit(1);
}

var enemyCount = rows.filter(function (r) { return r && typeof r === 'object' && typeof r.id === 'string'; }).length;

var meta = {
  generatedAt: new Date().toISOString(),
  generator:   'tools/generate-enemies-sidecar.js',
  source:      'data/enemies.json',
  rowCount:    rows.length,
  enemyCount:  enemyCount
};

// Pretty-printed, 2-space indent, preserves row order — the file:// load
// path is insensitive to whitespace, but a diff-friendly output makes the
// sidecar easy to review in PRs.
var bundle = {
  _meta: meta,
  rows:  rows
};

var banner = [
  '// ============================================================',
  '// data/enemies.js — AUTO-GENERATED (DOC-110 P5)',
  '// ------------------------------------------------------------',
  '// Source:     data/enemies.json',
  '// Generator:  tools/generate-enemies-sidecar.js',
  '// DO NOT hand-edit: the next pre-commit sidecar regen will',
  '// overwrite any changes. Edit the JSON and let the hook (or',
  '// `node tools/generate-enemies-sidecar.js` directly) rebuild.',
  '// ============================================================',
  ''
].join('\n');

var body = 'window.ENEMIES_DATA = ' + JSON.stringify(bundle, null, 2) + ';\n';

var out = banner + body;

if (DRY_RUN) {
  console.log('[generate-enemies-sidecar] DRY RUN — ' + enemyCount + ' enemies would be written to data/enemies.js');
  process.exit(0);
}

fs.writeFileSync(OUT_JS, out, 'utf8');
console.log('[generate-enemies-sidecar] OK — ' + enemyCount + ' enemies, ' + rows.length + ' rows → data/enemies.js');

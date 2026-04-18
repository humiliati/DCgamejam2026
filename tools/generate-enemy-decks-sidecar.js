#!/usr/bin/env node
// ============================================================
// generate-enemy-decks-sidecar.js — DOC-110 P5.2 (Deck Composer)
// ============================================================
// Reads data/enemy-decks.json and emits a sibling sidecar at
// data/enemy-decks.js so tools/enemy-hydrator.html (Deck Composer
// tab) can load the per-enemy deck map via
//   <script src="../data/enemy-decks.js">
// instead of sync XHR. Same pattern as data/enemies.js,
// data/npcs.js, data/verb-nodes.js, and data/verb-node-overrides.js.
//
// Source shape:
//   {
//     "_schema": { ...contract... },
//     "ENM-001": { cards: [...], greed?, pattern?, _note },
//     "ENM-002": { ... },
//     ...
//   }
//
// Output shape:
//   window.ENEMY_DECKS_DATA = {
//     _meta:   { generatedAt, generator, source, deckCount },
//     _schema: { ... verbatim from source ... },
//     decks:   { 'ENM-001': {...}, 'ENM-002': {...}, ... }
//   };
//
// The _schema key is preserved so the Composer can introspect
// the contract (greed default, pattern enum) at runtime.
//
// Idempotent: running on an unchanged source only refreshes
// _meta.generatedAt.
//
// Usage:  node tools/generate-enemy-decks-sidecar.js [--dry-run]
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');
var SRC_JSON  = path.join(REPO_ROOT, 'data', 'enemy-decks.json');
var OUT_JS    = path.join(REPO_ROOT, 'data', 'enemy-decks.js');

var DRY_RUN = process.argv.includes('--dry-run');

var raw;
try { raw = fs.readFileSync(SRC_JSON, 'utf8'); }
catch (e) {
  console.error('[generate-enemy-decks-sidecar] Cannot read ' + SRC_JSON + ' — ' + e.message);
  process.exit(1);
}

var src;
try { src = JSON.parse(raw); }
catch (e) {
  console.error('[generate-enemy-decks-sidecar] Parse error in enemy-decks.json — ' + e.message);
  process.exit(1);
}

if (!src || typeof src !== 'object' || Array.isArray(src)) {
  console.error('[generate-enemy-decks-sidecar] enemy-decks.json must be a top-level object, got ' + typeof src);
  process.exit(1);
}

// Split schema from deck rows. Preserve key order within each.
var schema = null;
var decks  = {};
var keys   = Object.keys(src);
for (var i = 0; i < keys.length; i++) {
  var k = keys[i];
  if (k === '_schema') { schema = src[k]; continue; }
  if (!/^ENM-\d+$/.test(k)) {
    console.error('[generate-enemy-decks-sidecar] Unexpected top-level key: ' + k + ' (expected ENM-### or _schema)');
    process.exit(1);
  }
  var entry = src[k];
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.cards)) {
    console.error('[generate-enemy-decks-sidecar] ' + k + ': missing/invalid `cards` array');
    process.exit(1);
  }
  decks[k] = entry;
}

var deckCount = Object.keys(decks).length;

var meta = {
  generatedAt: new Date().toISOString(),
  generator:   'tools/generate-enemy-decks-sidecar.js',
  source:      'data/enemy-decks.json',
  deckCount:   deckCount
};

var bundle = {
  _meta:   meta,
  _schema: schema,
  decks:   decks
};

var banner = [
  '// ============================================================',
  '// data/enemy-decks.js — AUTO-GENERATED (DOC-110 P5.2)',
  '// ------------------------------------------------------------',
  '// Source:     data/enemy-decks.json',
  '// Generator:  tools/generate-enemy-decks-sidecar.js',
  '// DO NOT hand-edit: the next pre-commit sidecar regen will',
  '// overwrite any changes. Edit the JSON and let the hook (or',
  '// `node tools/generate-enemy-decks-sidecar.js` directly) rebuild.',
  '// ============================================================',
  ''
].join('\n');

var body = 'window.ENEMY_DECKS_DATA = ' + JSON.stringify(bundle, null, 2) + ';\n';

var out = banner + body;

if (DRY_RUN) {
  console.log('[generate-enemy-decks-sidecar] DRY RUN — ' + deckCount + ' decks would be written to data/enemy-decks.js');
  process.exit(0);
}

fs.writeFileSync(OUT_JS, out, 'utf8');
console.log('[generate-enemy-decks-sidecar] OK — ' + deckCount + ' decks → data/enemy-decks.js');

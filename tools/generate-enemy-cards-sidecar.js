#!/usr/bin/env node
// ============================================================
// generate-enemy-cards-sidecar.js — DOC-110 P5.2 (Deck Composer)
// ============================================================
// Reads data/enemy-cards.json and emits a sibling sidecar at
// data/enemy-cards.js so tools/enemy-hydrator.html (Deck Composer
// tab) can load the EATK-### card pool via
//   <script src="../data/enemy-cards.js">
// instead of sync XHR. Same pattern as data/enemies.js,
// data/enemy-decks.js.
//
// Source shape:
//   {
//     "_schema": { ...contract... },
//     "cards": [
//       { id: "EATK-001", name, emoji, suit, intentType,
//         effects: [...], synergyTags: [...], _note },
//       ...
//     ]
//   }
//
// Output shape:
//   window.ENEMY_CARDS_DATA = {
//     _meta:   { generatedAt, generator, source, cardCount },
//     _schema: { ... verbatim from source ... },
//     cards:   [ ... verbatim array from source ... ]
//   };
//
// Idempotent: running on an unchanged source only refreshes
// _meta.generatedAt.
//
// Usage:  node tools/generate-enemy-cards-sidecar.js [--dry-run]
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');
var SRC_JSON  = path.join(REPO_ROOT, 'data', 'enemy-cards.json');
var OUT_JS    = path.join(REPO_ROOT, 'data', 'enemy-cards.js');

var DRY_RUN = process.argv.includes('--dry-run');

var raw;
try { raw = fs.readFileSync(SRC_JSON, 'utf8'); }
catch (e) {
  console.error('[generate-enemy-cards-sidecar] Cannot read ' + SRC_JSON + ' — ' + e.message);
  process.exit(1);
}

var src;
try { src = JSON.parse(raw); }
catch (e) {
  console.error('[generate-enemy-cards-sidecar] Parse error in enemy-cards.json — ' + e.message);
  process.exit(1);
}

if (!src || typeof src !== 'object' || Array.isArray(src)) {
  console.error('[generate-enemy-cards-sidecar] enemy-cards.json must be a top-level object, got ' + typeof src);
  process.exit(1);
}

if (!Array.isArray(src.cards)) {
  console.error('[generate-enemy-cards-sidecar] enemy-cards.json: missing/invalid `cards` array');
  process.exit(1);
}

// Light shape check — every card must have an id matching EATK-###.
var seenIds = {};
for (var i = 0; i < src.cards.length; i++) {
  var c = src.cards[i];
  if (!c || typeof c !== 'object') {
    console.error('[generate-enemy-cards-sidecar] cards[' + i + ']: not an object');
    process.exit(1);
  }
  if (typeof c.id !== 'string' || !/^EATK-\d+$/.test(c.id)) {
    console.error('[generate-enemy-cards-sidecar] cards[' + i + ']: id must match EATK-### (got ' + JSON.stringify(c.id) + ')');
    process.exit(1);
  }
  if (seenIds[c.id]) {
    console.error('[generate-enemy-cards-sidecar] duplicate card id: ' + c.id);
    process.exit(1);
  }
  seenIds[c.id] = true;
}

var cardCount = src.cards.length;

var meta = {
  generatedAt: new Date().toISOString(),
  generator:   'tools/generate-enemy-cards-sidecar.js',
  source:      'data/enemy-cards.json',
  cardCount:   cardCount
};

var bundle = {
  _meta:   meta,
  _schema: src._schema || null,
  cards:   src.cards
};

var banner = [
  '// ============================================================',
  '// data/enemy-cards.js — AUTO-GENERATED (DOC-110 P5.2)',
  '// ------------------------------------------------------------',
  '// Source:     data/enemy-cards.json',
  '// Generator:  tools/generate-enemy-cards-sidecar.js',
  '// DO NOT hand-edit: the next pre-commit sidecar regen will',
  '// overwrite any changes. Edit the JSON and let the hook (or',
  '// `node tools/generate-enemy-cards-sidecar.js` directly) rebuild.',
  '// ============================================================',
  ''
].join('\n');

var body = 'window.ENEMY_CARDS_DATA = ' + JSON.stringify(bundle, null, 2) + ';\n';

var out = banner + body;

if (DRY_RUN) {
  console.log('[generate-enemy-cards-sidecar] DRY RUN — ' + cardCount + ' cards would be written to data/enemy-cards.js');
  process.exit(0);
}

fs.writeFileSync(OUT_JS, out, 'utf8');
console.log('[generate-enemy-cards-sidecar] OK — ' + cardCount + ' cards → data/enemy-cards.js');

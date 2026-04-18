#!/usr/bin/env node
// ============================================================
// generate-loot-tables-sidecar.js — DOC-110 P5.4 (Loot tab)
// ============================================================
// Reads data/loot-tables.json and emits a sibling sidecar at
// data/loot-tables.js so tools/enemy-hydrator.html (Loot tab)
// can load the loot contract via
//   <script src="../data/loot-tables.js">
// instead of sync XHR. Same pattern as data/enemies.js,
// data/enemy-decks.js, data/enemy-cards.js, data/npcs.js, etc.
//
// Source shape (data/loot-tables.json):
//   {
//     "_comment": "...",
//     "version": "1.0.0",
//     "enemy_resource_profiles": { undead|construct|organic|marine: {...} },
//     "enemy_tier_multipliers":   { standard|elite|boss: {...} },
//     "card_drops":               { cellar|foundry|sealab: {...}, _element_bias: {...} },
//     "breakable_loot":           { ... }   // not consumed by P5.4
//   }
//
// Output shape:
//   window.LOOT_TABLES_DATA = {
//     _meta:    { generatedAt, generator, source, profileCount, tierCount, biomeCount },
//     version:  '1.0.0',
//     enemy_resource_profiles: { ... },
//     enemy_tier_multipliers:  { ... },
//     card_drops:              { ... },
//     breakable_loot:          { ... }
//   };
//
// Idempotent: running on unchanged source only refreshes _meta.generatedAt.
//
// Usage:  node tools/generate-loot-tables-sidecar.js [--dry-run]
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');
var SRC_JSON  = path.join(REPO_ROOT, 'data', 'loot-tables.json');
var OUT_JS    = path.join(REPO_ROOT, 'data', 'loot-tables.js');

var DRY_RUN = process.argv.includes('--dry-run');

var raw;
try { raw = fs.readFileSync(SRC_JSON, 'utf8'); }
catch (e) {
  console.error('[generate-loot-tables-sidecar] Cannot read ' + SRC_JSON + ' — ' + e.message);
  process.exit(1);
}

var src;
try { src = JSON.parse(raw); }
catch (e) {
  console.error('[generate-loot-tables-sidecar] Parse error in loot-tables.json — ' + e.message);
  process.exit(1);
}

if (!src || typeof src !== 'object' || Array.isArray(src)) {
  console.error('[generate-loot-tables-sidecar] loot-tables.json must be a top-level object, got ' + typeof src);
  process.exit(1);
}

// Shape checks — we don't enforce a full schema here (the tool consumes
// it at runtime and surfaces issues observationally), but we do guard the
// three keys P5.4 hard-requires so the smoke harness and UI don't silently
// collapse on a missing section.
var REQUIRED = ['enemy_resource_profiles', 'enemy_tier_multipliers', 'card_drops'];
for (var i = 0; i < REQUIRED.length; i++) {
  if (!src[REQUIRED[i]] || typeof src[REQUIRED[i]] !== 'object') {
    console.error('[generate-loot-tables-sidecar] Missing/invalid section: ' + REQUIRED[i]);
    process.exit(1);
  }
}

function realKeys(obj) {
  return Object.keys(obj).filter(function(k) { return k[0] !== '_'; });
}

var profiles = realKeys(src.enemy_resource_profiles);
var tiers    = realKeys(src.enemy_tier_multipliers);
var biomes   = realKeys(src.card_drops);

var meta = {
  generatedAt:  new Date().toISOString(),
  generator:    'tools/generate-loot-tables-sidecar.js',
  source:       'data/loot-tables.json',
  profileCount: profiles.length,
  tierCount:    tiers.length,
  biomeCount:   biomes.length
};

// Preserve the source verbatim (including the _comment banner and version),
// just prepend _meta. The runtime module reads the same keys whether loaded
// from the sidecar or the JSON.
var bundle = { _meta: meta };
var srcKeys = Object.keys(src);
for (var j = 0; j < srcKeys.length; j++) {
  bundle[srcKeys[j]] = src[srcKeys[j]];
}

var banner = [
  '// ============================================================',
  '// data/loot-tables.js — AUTO-GENERATED (DOC-110 P5.4)',
  '// ------------------------------------------------------------',
  '// Source:     data/loot-tables.json',
  '// Generator:  tools/generate-loot-tables-sidecar.js',
  '// DO NOT hand-edit: the next pre-commit sidecar regen will',
  '// overwrite any changes. Edit the JSON and let the hook (or',
  '// `node tools/generate-loot-tables-sidecar.js` directly) rebuild.',
  '// ============================================================',
  ''
].join('\n');

var body = 'window.LOOT_TABLES_DATA = ' + JSON.stringify(bundle, null, 2) + ';\n';
var out  = banner + body;

if (DRY_RUN) {
  console.log('[generate-loot-tables-sidecar] DRY RUN — ' + profiles.length + ' profiles / ' +
              tiers.length + ' tiers / ' + biomes.length + ' biomes would be written.');
  process.exit(0);
}

fs.writeFileSync(OUT_JS, out, 'utf8');
console.log('[generate-loot-tables-sidecar] OK — ' + profiles.length + ' profiles · ' +
            tiers.length + ' tiers · ' + biomes.length + ' biomes → data/loot-tables.js');

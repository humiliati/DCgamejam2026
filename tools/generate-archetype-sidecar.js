#!/usr/bin/env node
// ============================================================
// tools/generate-archetype-sidecar.js
// Regenerates tools/archetype-registry.js from the canonical
// tools/archetype-registry.json. Mirrors generate-schema-sidecar.js.
//
// Why: file:// pages (the NPC Designer loads from disk) cannot
// fetch() sibling JSON under Chromium's file:// origin. The .js
// sidecar attaches the parsed registry to window.ARCHETYPE_REGISTRY
// so <script src="archetype-registry.js"> works zero-setup.
//
// Run: node tools/generate-archetype-sidecar.js
// Wired into tools/.githooks/pre-commit when archetype-registry.json
// is in the staged set (same pattern as the schema sidecar).
// ============================================================
'use strict';

var fs = require('fs');
var path = require('path');

var SRC = path.resolve(__dirname, 'archetype-registry.json');
var DST = path.resolve(__dirname, 'archetype-registry.js');

function fail(msg, err) {
  console.error('[archetype-sidecar] ' + msg);
  if (err) console.error('  → ' + (err.stack || err.message || err));
  process.exit(1);
}

var raw;
try { raw = fs.readFileSync(SRC, 'utf8'); }
catch (e) { fail('cannot read ' + SRC, e); }

var parsed;
try { parsed = JSON.parse(raw); }
catch (e) { fail('archetype-registry.json is not valid JSON', e); }

if (!parsed || !Array.isArray(parsed.archetypes)) {
  fail('archetype-registry.json missing `archetypes` array');
}

var serialised = JSON.stringify(parsed, null, 2);
var banner =
  '// ============================================================\n' +
  '// tools/archetype-registry.js — AUTO-GENERATED — DO NOT HAND-EDIT\n' +
  '//\n' +
  '// Regenerated from tools/archetype-registry.json by\n' +
  '// tools/generate-archetype-sidecar.js. Hand-edits to this file\n' +
  '// will be overwritten by the next pre-commit run.\n' +
  '//\n' +
  '// Loaded by tools/npc-designer.html under file:// to drive the\n' +
  '// bulk "add from archetype" stamp UI.\n' +
  '// ============================================================\n' +
  '(function () {\n' +
  "  'use strict';\n" +
  '  var REGISTRY = ' + serialised + ';\n' +
  '  if (typeof window !== "undefined") {\n' +
  '    window.ARCHETYPE_REGISTRY = REGISTRY;\n' +
  '  }\n' +
  '  if (typeof module !== "undefined" && module.exports) {\n' +
  '    module.exports = REGISTRY;\n' +
  '  }\n' +
  '})();\n';

try { fs.writeFileSync(DST, banner, 'utf8'); }
catch (e) { fail('cannot write ' + DST, e); }

console.log('[archetype-sidecar] wrote ' + path.relative(process.cwd(), DST) +
  ' (' + parsed.archetypes.length + ' archetypes, ' + banner.length + ' bytes)');

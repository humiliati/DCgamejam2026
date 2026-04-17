#!/usr/bin/env node
// ============================================================
// extract-verb-nodes.js — DOC-110 P3 Ch.0 (2026-04-17)
// ============================================================
// JSON → sidecar normaliser for the VerbNodes spatial registry.
//
// Since the inline `_registerBuiltinNodes()` block is retired
// from engine/verb-nodes.js (P3 Ch.0), data/verb-nodes.json is
// the sole source of truth for hand-authored floors (depth 1-2).
// Depth >=3 floors auto-derive via engine/dungeon-verb-nodes.js.
//
// This script:
//   1. Reads data/verb-nodes.json
//   2. Runs every node through a field whitelist (cleanNode) that
//      matches tools/verb-node-schema.json. Unknown keys are
//      dropped so hand-edits cannot smuggle new fields into
//      the runtime.
//   3. Rewrites data/verb-nodes.json with deterministic ordering +
//      refreshed _meta.
//   4. Rewrites the data/verb-nodes.js sidecar so browser tooling
//      can load via a <script> tag under file://.
//
// Idempotent: running on a clean JSON leaves content unchanged
// aside from a refreshed generatedAt timestamp.
//
// Usage:  node tools/extract-verb-nodes.js [--dry-run]
// Output: data/verb-nodes.json (rewritten) + data/verb-nodes.js (sidecar)
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');
var NODES_JSON    = path.join(REPO_ROOT, 'data', 'verb-nodes.json');
var NODES_SIDECAR = path.join(REPO_ROOT, 'data', 'verb-nodes.js');

var DRY_RUN = process.argv.includes('--dry-run');

if (!fs.existsSync(NODES_JSON)) {
  console.error('[extract-verb-nodes] data/verb-nodes.json not found at ' + NODES_JSON);
  console.error('[extract-verb-nodes] Author the JSON first (or restore from git).');
  process.exit(2);
}

var raw;
try {
  raw = JSON.parse(fs.readFileSync(NODES_JSON, 'utf8'));
} catch (e) {
  console.error('[extract-verb-nodes] Failed to parse data/verb-nodes.json: ' + e.message);
  process.exit(3);
}

if (!raw || typeof raw !== 'object' || !raw.nodesByFloor) {
  console.error('[extract-verb-nodes] data/verb-nodes.json is missing `nodesByFloor` root.');
  process.exit(3);
}

// ── Normalise + sort for deterministic output ────────────────

var nodesByFloor = {};
var total = 0;
Object.keys(raw.nodesByFloor).sort(sortFloorIds).forEach(function (floorId) {
  var list = (raw.nodesByFloor[floorId] || []).slice().sort(function (a, b) {
    return (a.id || '').localeCompare(b.id || '');
  });
  nodesByFloor[floorId] = list.map(cleanNode);
  total += list.length;
});

/**
 * Produce a deterministic VerbNode envelope matching
 * tools/verb-node-schema.json. Unknown keys dropped.
 */
function cleanNode(d) {
  var clean = {
    id:   d.id,
    type: d.type,
    x:    d.x,
    y:    d.y
  };
  if (d.faction != null)   clean.faction   = d.faction;
  if (d.contested === true) clean.contested = true;
  return clean;
}

function sortFloorIds(a, b) {
  var pa = a.split('.').map(Number);
  var pb = b.split('.').map(Number);
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var da = pa[i] == null ? -1 : pa[i];
    var db = pb[i] == null ? -1 : pb[i];
    if (da !== db) return da - db;
  }
  return 0;
}

// ── Write ────────────────────────────────────────────────────

var output = {
  _meta: {
    generatedFrom: 'data/verb-nodes.json (authored directly; formerly inline in engine/verb-nodes.js _registerBuiltinNodes)',
    generatedAt:   new Date().toISOString(),
    generator:     'tools/extract-verb-nodes.js (DOC-110 P3 Ch.0 normaliser)',
    schemaRef:     'tools/verb-node-schema.json',
    note:          'Canonical VerbNodes registry for hand-authored floors (depth 1-2). Depth >=3 floors auto-derive via engine/dungeon-verb-nodes.js. Edit via tools/blockout-visualizer.html verb-node layer (DOC-110 P3 Ch.2) or this JSON directly. The inline _registerBuiltinNodes() fallback in engine/verb-nodes.js was retired in P3 Ch.0 — this JSON is now the sole source of truth at runtime (loaded by engine/verb-node-seed.js).',
    floorCount:    Object.keys(nodesByFloor).length,
    nodeCount:     total
  },
  nodesByFloor: nodesByFloor
};

if (DRY_RUN) {
  console.log('[extract-verb-nodes] DRY RUN');
  console.log('  floors: ' + Object.keys(nodesByFloor).length);
  console.log('  nodes:  ' + total);
  console.log('  target: ' + NODES_JSON);
  console.log('');
  Object.keys(nodesByFloor).forEach(function (f) {
    var byType = {};
    nodesByFloor[f].forEach(function (n) { byType[n.type] = (byType[n.type] || 0) + 1; });
    var summary = Object.keys(byType).sort().map(function (t) {
      return t + ':' + byType[t];
    }).join(' ');
    console.log('  [' + f + ']  ' + nodesByFloor[f].length + ' nodes  ' + summary);
  });
  process.exit(0);
}

var jsonText = JSON.stringify(output, null, 2);
fs.writeFileSync(NODES_JSON, jsonText + '\n', 'utf8');
console.log('[extract-verb-nodes] Wrote ' + total + ' nodes across '
  + Object.keys(nodesByFloor).length + ' floor(s) to ' + NODES_JSON);

// ── Sidecar .js wrapper for browser tools under file:// ─────────
fs.writeFileSync(NODES_SIDECAR,
  '// AUTO-GENERATED by tools/extract-verb-nodes.js — do not edit by hand.\n' +
  '// Sidecar wrapper so browser tooling works under file://\n' +
  '// (bypasses Chromium CORS fetch block). Keep in sync with data/verb-nodes.json.\n' +
  'window.VERB_NODES_DATA = ' + jsonText + ';\n', 'utf8');
console.log('[extract-verb-nodes] Sidecar -> ' + NODES_SIDECAR);

#!/usr/bin/env node
// ============================================================
// tools/validate-verb-node-overrides.js — DOC-110 P3 Ch.2 stretch
// ============================================================
// Validates every file under tools/verb-node-overrides/*.json:
//   1. JSON-Schema Draft-07 subset check against
//      tools/verb-node-overrides-schema.json
//   2. Filename stem must equal _meta.floorId AND the top-level
//      floorId field (three-way match)
//   3. Per-file id uniqueness across add[] and replace[]
//   4. Per-file no-overlap — same id cannot appear in both
//      remove[] and add[] (move = remove+add with a different
//      id, not same id)
//
// Exit 0 on all-pass, 1 on any failure.
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

// Shim + load schema sidecar so SchemaValidator sees it.
globalThis.window = globalThis;
require(path.resolve(__dirname, 'verb-node-overrides-schema.js'));
var SchemaValidator = require(path.resolve(__dirname, 'schema-validator.js'));

var REPO_ROOT = path.resolve(__dirname, '..');
var SRC_DIR   = path.join(REPO_ROOT, 'tools', 'verb-node-overrides');

var schema = globalThis.VERB_NODE_OVERRIDES_SCHEMA;
if (!schema) {
  console.error('[validate-verb-node-overrides] VERB_NODE_OVERRIDES_SCHEMA not loaded — did the sidecar generate?');
  process.exit(1);
}

var failures = [];
var fileCount = 0;
var opCount = 0;

var entries;
try { entries = fs.readdirSync(SRC_DIR); }
catch (e) {
  console.warn('[validate-verb-node-overrides] ' + SRC_DIR + ' not found — no-op.');
  process.exit(0);
}

var files = entries
  .filter(function (f) { return /\.json$/.test(f); })
  .sort();

files.forEach(function (fname) {
  fileCount++;
  var abs = path.join(SRC_DIR, fname);
  var stem = fname.replace(/\.json$/, '');

  // Filename must look like a floorId.
  if (!/^[0-9]+(\.[0-9]+)*$/.test(stem)) {
    failures.push(fname + ': filename stem "' + stem + '" is not a valid floorId (must match ^[0-9]+(\\.[0-9]+)*$)');
    return;
  }

  var raw;
  try { raw = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) {
    failures.push(fname + ': parse error — ' + e.message);
    return;
  }

  // Schema check first — cheapest way to catch shape errors.
  var res;
  try { res = SchemaValidator.validate(schema, raw, schema); }
  catch (e) { res = { ok: false, errors: [{ path: '', message: String(e && e.message || e) }] }; }
  if (!res.ok) {
    res.errors.forEach(function (err) {
      failures.push(fname + ': schema violation — ' + err.path + ' ' + err.message);
    });
    return;
  }

  // Three-way filename <-> floorId <-> _meta.floorId match.
  if (raw.floorId !== stem) {
    failures.push(fname + ': floorId "' + raw.floorId + '" does not match filename (expected "' + stem + '")');
  }
  if (raw._meta && raw._meta.floorId != null && raw._meta.floorId !== stem) {
    failures.push(fname + ': _meta.floorId "' + raw._meta.floorId + '" does not match filename (expected "' + stem + '")');
  }

  // Op-count bookkeeping + structural checks.
  var adds     = Array.isArray(raw.add)     ? raw.add     : [];
  var removes  = Array.isArray(raw.remove)  ? raw.remove  : [];
  var replaces = Array.isArray(raw.replace) ? raw.replace : [];
  opCount += adds.length + removes.length + replaces.length;

  // Within a file, every add id must be unique.
  // Use `in` checks rather than truthiness because index 0 is falsy.
  var seenAdd = Object.create(null);
  adds.forEach(function (n, i) {
    if (!n || !n.id) return; // schema would have caught
    if (n.id in seenAdd) {
      failures.push(fname + ': add[' + i + ']: duplicate id "' + n.id + '" (also at add[' + seenAdd[n.id] + '])');
    } else {
      seenAdd[n.id] = i;
    }
  });

  // Replace ids must be unique (patching the same id twice is always a mistake).
  var seenReplace = Object.create(null);
  replaces.forEach(function (r, i) {
    if (!r || !r.id) return;
    if (r.id in seenReplace) {
      failures.push(fname + ': replace[' + i + ']: duplicate id "' + r.id + '" (also at replace[' + seenReplace[r.id] + '])');
    } else {
      seenReplace[r.id] = i;
    }
  });

  // Remove list: no duplicates (cosmetic; tolerated as warning in runtime).
  var seenRemove = Object.create(null);
  removes.forEach(function (id, i) {
    if (id in seenRemove) {
      failures.push(fname + ': remove[' + i + ']: duplicate id "' + id + '"');
    } else {
      seenRemove[id] = i;
    }
  });

  // No id may appear in both add and remove within a single file.
  adds.forEach(function (n, i) {
    if (!n || !n.id) return;
    if (seenRemove[n.id] != null) {
      failures.push(fname + ': id "' + n.id + '" appears in both add[' + i + '] and remove[' + seenRemove[n.id] + '] — overrides should not remove-then-add the same id');
    }
  });

  // Ids referenced in replace[] should not overlap with remove[] or add[] in the same file.
  replaces.forEach(function (r, i) {
    if (!r || !r.id) return;
    if (seenRemove[r.id] != null) {
      failures.push(fname + ': id "' + r.id + '" appears in both replace[' + i + '] and remove[' + seenRemove[r.id] + '] — a removed node cannot be patched');
    }
    if (seenAdd[r.id] != null) {
      failures.push(fname + ': id "' + r.id + '" appears in both replace[' + i + '] and add[' + seenAdd[r.id] + '] — patch the add entry directly instead');
    }
  });
});

if (failures.length) {
  console.error('[validate-verb-node-overrides] FAIL — ' + failures.length + ' issue(s) across ' + fileCount + ' file(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}

console.log('[validate-verb-node-overrides] PASS — ' + fileCount + ' file(s), ' + opCount + ' op(s) validated against tools/verb-node-overrides-schema.json.');

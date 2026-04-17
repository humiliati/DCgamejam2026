#!/usr/bin/env node
// ============================================================
// tools/validate-verb-nodes.js — DOC-110 P3 Ch.0
// ============================================================
// Validates every entry in data/verb-nodes.json against
// tools/verb-node-schema.json. Also runs structural sanity:
//   - unique ids across all floors
//   - floorId keys match the schema's floorId pattern
//   - per-floor duplicate coordinate detection (two nodes on
//     the same tile is almost always an authoring mistake)
//
// Exit 0 on all-pass, 1 on any failure. Meant to run in CI +
// before regenerating the sidecar (pre-commit hook §1c).
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

// Shim + load sidecars so SchemaValidator sees the schema.
globalThis.window = globalThis;
require(path.resolve(__dirname, 'verb-node-schema.js'));
var SchemaValidator = require(path.resolve(__dirname, 'schema-validator.js'));

var NODES_JSON = path.resolve(__dirname, '..', 'data', 'verb-nodes.json');
var FLOOR_ID_RE = /^[0-9]+(\.[0-9]+)*$/;

var payload;
try { payload = JSON.parse(fs.readFileSync(NODES_JSON, 'utf8')); }
catch (e) {
  console.error('[validate-verb-nodes] cannot read/parse ' + NODES_JSON);
  console.error('  → ' + (e.stack || e.message || e));
  process.exit(1);
}

if (!payload || !payload.nodesByFloor || typeof payload.nodesByFloor !== 'object') {
  console.error('[validate-verb-nodes] missing `nodesByFloor` root.');
  process.exit(1);
}

var schema = globalThis.VERB_NODE_SCHEMA;
if (!schema) {
  console.error('[validate-verb-nodes] VERB_NODE_SCHEMA not loaded — did the sidecar generate?');
  process.exit(1);
}

var failures = [];
var seenIds  = Object.create(null);
var totalNodes = 0;

Object.keys(payload.nodesByFloor).forEach(function (floorId) {
  var loc = 'nodesByFloor["' + floorId + '"]';

  if (!FLOOR_ID_RE.test(floorId)) {
    failures.push(loc + ': floorId does not match /^[0-9]+(\\.[0-9]+)*$/');
  }

  var list = payload.nodesByFloor[floorId];
  if (!Array.isArray(list)) {
    failures.push(loc + ': value must be an array');
    return;
  }

  var seenXY = Object.create(null);

  list.forEach(function (node, idx) {
    var where = loc + '[' + idx + '] (id=' + (node && node.id || '(none)') + ')';
    totalNodes++;

    // Structural: unique id
    if (!node || typeof node !== 'object') {
      failures.push(where + ': not an object');
      return;
    }
    if (!node.id) {
      failures.push(where + ': missing id');
    } else if (seenIds[node.id]) {
      failures.push(where + ': duplicate id "' + node.id +
        '" (first at ' + seenIds[node.id] + ')');
    } else {
      seenIds[node.id] = where;
    }

    // Structural: no two nodes on the same tile
    if (Number.isInteger(node.x) && Number.isInteger(node.y)) {
      var key = node.x + ',' + node.y;
      if (seenXY[key]) {
        // This is a warning-level thing, but still a failure so
        // authors notice before it ships.
        failures.push(where + ': coordinate (' + key + ') collides with ' + seenXY[key]);
      } else {
        seenXY[key] = node.id || '(no-id)';
      }
    }

    // Schema: JSON-Schema Draft-07 subset check
    var res;
    try { res = SchemaValidator.validate(schema, node, schema); }
    catch (e) {
      res = { ok: false, errors: [{ path: '', keyword: 'throw', message: String(e && e.message || e) }] };
    }
    if (!res.ok) {
      failures.push(where + ': schema violation — ' +
        (res.errors[0] && (res.errors[0].path + ' ' + res.errors[0].message)));
    }
  });
});

if (failures.length) {
  console.error('[validate-verb-nodes] FAIL — ' + failures.length + ' issue(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}

console.log('[validate-verb-nodes] PASS — ' + totalNodes + ' node(s) across ' +
  Object.keys(payload.nodesByFloor).length + ' floor(s) validated against tools/verb-node-schema.json.');

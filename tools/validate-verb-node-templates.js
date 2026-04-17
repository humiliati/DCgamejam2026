#!/usr/bin/env node
// ============================================================
// tools/validate-verb-node-templates.js — DOC-110 P3 Ch.1
// ============================================================
// Validates tools/verb-node-templates.json.
//
// Structural checks:
//   - Unique template ids
//   - Required fields: id, displayName, category, description, nodes
//   - `nodes` is non-empty array
//   - Unique node suffix within each template
//   - dx, dy are integers in [-255, 255]
//   - factionSlots (if present) is array of {slot, label, default?}
//   - Any node.factionSlot references must appear in template.factionSlots
//
// Realised-stamp check:
//   - For each template, synthesize a stamp anchored at (128,128) with a
//     plausible floor id and default-faction substitutions, run every
//     resulting node through the verb-node schema. This proves the
//     offsets produce valid nodes (faction enum, coord bounds, id shape).
//
// Exit 0 on all-pass, 1 on any failure.
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

globalThis.window = globalThis;
require(path.resolve(__dirname, 'verb-node-schema.js'));
var SchemaValidator = require(path.resolve(__dirname, 'schema-validator.js'));

var schema = globalThis.VERB_NODE_SCHEMA;
if (!schema) {
  console.error('[validate-verb-node-templates] VERB_NODE_SCHEMA not loaded — run tools/generate-verb-node-schema-sidecar.js first.');
  process.exit(1);
}

var TEMPLATES_JSON = path.resolve(__dirname, 'verb-node-templates.json');
var payload;
try { payload = JSON.parse(fs.readFileSync(TEMPLATES_JSON, 'utf8')); }
catch (e) {
  console.error('[validate-verb-node-templates] cannot read/parse ' + TEMPLATES_JSON);
  console.error('  → ' + (e.stack || e.message || e));
  process.exit(1);
}

if (!payload || !Array.isArray(payload.templates)) {
  console.error('[validate-verb-node-templates] missing `templates` array root.');
  process.exit(1);
}

var failures = [];
var seenIds  = Object.create(null);

payload.templates.forEach(function (tpl, idx) {
  var loc = 'templates[' + idx + '] (id=' + (tpl && tpl.id || '(none)') + ')';

  if (!tpl || typeof tpl !== 'object') {
    failures.push(loc + ': not an object');
    return;
  }

  // Required scalars
  if (!tpl.id) failures.push(loc + ': missing id');
  else if (seenIds[tpl.id]) failures.push(loc + ': duplicate id "' + tpl.id +
    '" (first at ' + seenIds[tpl.id] + ')');
  else seenIds[tpl.id] = loc;

  if (!tpl.displayName) failures.push(loc + ': missing displayName');
  if (!tpl.category)    failures.push(loc + ': missing category');
  if (!tpl.description) failures.push(loc + ': missing description');

  // Nodes
  if (!Array.isArray(tpl.nodes) || !tpl.nodes.length) {
    failures.push(loc + ': nodes must be a non-empty array');
    return;
  }

  // factionSlots (optional)
  var slotMap = Object.create(null);
  if (tpl.factionSlots != null) {
    if (!Array.isArray(tpl.factionSlots)) {
      failures.push(loc + ': factionSlots must be an array when present');
    } else {
      tpl.factionSlots.forEach(function (s, si) {
        var sloc = loc + '.factionSlots[' + si + ']';
        if (!s || typeof s !== 'object') {
          failures.push(sloc + ': not an object');
          return;
        }
        if (!s.slot)  failures.push(sloc + ': missing slot');
        if (!s.label) failures.push(sloc + ': missing label');
        if (slotMap[s.slot]) failures.push(sloc + ': duplicate slot "' + s.slot + '"');
        slotMap[s.slot] = s;
      });
    }
  }

  // Per-node structural + synthesized schema check
  var seenSuffix = Object.create(null);
  tpl.nodes.forEach(function (node, ni) {
    var nloc = loc + '.nodes[' + ni + '] (suffix=' + (node && node.suffix || '(none)') + ')';

    if (!node || typeof node !== 'object') {
      failures.push(nloc + ': not an object');
      return;
    }
    if (!node.suffix) failures.push(nloc + ': missing suffix');
    else if (seenSuffix[node.suffix]) failures.push(nloc + ': duplicate suffix "' + node.suffix + '"');
    else seenSuffix[node.suffix] = true;

    if (!node.type) failures.push(nloc + ': missing type');
    if (!Number.isInteger(node.dx) || node.dx < -255 || node.dx > 255)
      failures.push(nloc + ': dx must be integer in [-255, 255]');
    if (!Number.isInteger(node.dy) || node.dy < -255 || node.dy > 255)
      failures.push(nloc + ': dy must be integer in [-255, 255]');

    if (node.factionSlot != null && !slotMap[node.factionSlot]) {
      failures.push(nloc + ': factionSlot "' + node.factionSlot +
        '" not declared in template.factionSlots');
    }

    // Synthesized stamp: anchor at (128, 128), default factions.
    // Built-in id substitution matches how the stamper will do it.
    var probe = {
      id:   'probe_' + (tpl.id || 'x') + '_' + (node.suffix || 'n'),
      type: node.type,
      x:    128 + (node.dx | 0),
      y:    128 + (node.dy | 0)
    };
    if (node.factionSlot) {
      var slot = slotMap[node.factionSlot];
      if (slot && slot.default) probe.faction = slot.default;
    }

    var res;
    try { res = SchemaValidator.validate(schema, probe, schema); }
    catch (e) {
      res = { ok: false, errors: [{ path: '', keyword: 'throw', message: String(e && e.message || e) }] };
    }
    if (!res.ok) {
      failures.push(nloc + ': schema violation — ' +
        (res.errors[0] && (res.errors[0].path + ' ' + res.errors[0].message)));
    }
  });
});

if (failures.length) {
  console.error('[validate-verb-node-templates] FAIL — ' + failures.length + ' issue(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}

var totalNodes = payload.templates.reduce(function (acc, t) {
  return acc + (t.nodes ? t.nodes.length : 0);
}, 0);
console.log('[validate-verb-node-templates] PASS — ' + payload.templates.length +
  ' template(s), ' + totalNodes + ' node(s) total, all synthesized stamps pass tools/verb-node-schema.json.');

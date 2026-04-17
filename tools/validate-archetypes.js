#!/usr/bin/env node
// ============================================================
// tools/validate-archetypes.js
// Validates every archetype's `defaults` object against
// tools/actor-schema.json's npcActor branch. Also runs
// structural sanity on the registry (unique ids, idPattern
// placeholders, emojiPool non-empty, recommendedCount range).
//
// Exit 0 on all-pass, 1 on any failure. Meant to run in CI +
// before regenerating the sidecar.
// ============================================================
'use strict';

var fs = require('fs');
var path = require('path');

globalThis.window = globalThis; // shim for sidecar
require(path.resolve(__dirname, 'actor-schema.js'));
var SchemaValidator = require(path.resolve(__dirname, 'schema-validator.js'));

var registryPath = path.resolve(__dirname, 'archetype-registry.json');
var registry;
try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); }
catch (e) {
  console.error('[validate-archetypes] cannot read/parse ' + registryPath);
  console.error('  → ' + (e.stack || e.message || e));
  process.exit(1);
}

var schema = globalThis.ACTOR_SCHEMA;
var failures = [];
var seenIds = Object.create(null);

(registry.archetypes || []).forEach(function (arch, idx) {
  var loc = 'archetypes[' + idx + '] (id=' + (arch.id || '(none)') + ')';

  // Structural checks
  if (!arch.id)                                    failures.push(loc + ': missing id');
  if (arch.id && seenIds[arch.id])                 failures.push(loc + ': duplicate id "' + arch.id + '"');
  seenIds[arch.id] = true;
  if (!arch.displayName)                           failures.push(loc + ': missing displayName');
  if (!arch.category)                              failures.push(loc + ': missing category');
  if (!arch.description)                           failures.push(loc + ': missing description');
  if (!arch.defaults || typeof arch.defaults !== 'object')
                                                   failures.push(loc + ': missing defaults object');
  if (!Array.isArray(arch.emojiPool) || !arch.emojiPool.length)
                                                   failures.push(loc + ': emojiPool must be non-empty array');
  if (arch.idPattern && arch.idPattern.indexOf('{n}') < 0)
                                                   failures.push(loc + ': idPattern must contain {n}');
  if (arch.recommendedCount) {
    if (!Array.isArray(arch.recommendedCount) || arch.recommendedCount.length !== 2)
                                                   failures.push(loc + ': recommendedCount must be [min, max]');
    else if (arch.recommendedCount[0] > arch.recommendedCount[1])
                                                   failures.push(loc + ': recommendedCount min > max');
  }

  // Schema check on a realised stamp — inject id/floorId/x/y/name/emoji
  // the same way the stamp code will, so we validate a real-looking NPC.
  if (arch.defaults && typeof arch.defaults === 'object') {
    var probe = Object.assign({}, arch.defaults);
    probe.id      = probe.id      || (arch.id + '_probe_1');
    probe.floorId = probe.floorId || '1';
    probe.x       = probe.x       || 0;
    probe.y       = probe.y       || 0;
    probe.name    = probe.name    || (arch.displayName + ' Probe');
    probe.emoji   = probe.emoji   || (arch.emojiPool && arch.emojiPool[0]) || '🧑';
    var res;
    try { res = SchemaValidator.validate(schema, probe, schema); }
    catch (e) {
      res = { ok: false, errors: [{ path: '', keyword: 'throw', message: String(e && e.message || e) }] };
    }
    if (!res.ok) {
      failures.push(loc + ': schema violation — ' +
        (res.errors[0] && (res.errors[0].path + ' ' + res.errors[0].message)));
    }
  }
});

if (failures.length) {
  console.error('[validate-archetypes] FAIL — ' + failures.length + ' issue(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}

console.log('[validate-archetypes] PASS — ' + (registry.archetypes || []).length +
  ' archetype(s) validated against tools/actor-schema.json npcActor branch.');

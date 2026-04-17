#!/usr/bin/env node
/**
 * validate-npcs-preflight.js — DOC-110 Phase 1.1 schema-validation baseline.
 *
 * Runs tools/schema-validator.js against every NPC entry in data/npcs.json
 * using tools/actor-schema.json. Reports per-NPC pass/fail and a summary.
 *
 * Exit 0 if all NPCs pass; 1 otherwise. Does not mutate anything.
 *
 * Usage:  node tools/validate-npcs-preflight.js
 *         node tools/validate-npcs-preflight.js --verbose   (print first 3 errors per NPC)
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT       = path.resolve(__dirname, '..');
var SCHEMA     = path.join(ROOT, 'tools', 'actor-schema.json');
var NPCS_JSON  = path.join(ROOT, 'data',  'npcs.json');
var VALIDATOR  = path.join(ROOT, 'tools', 'schema-validator.js');

var verbose = process.argv.indexOf('--verbose') !== -1;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  var schema    = loadJson(SCHEMA);
  var bundle    = loadJson(NPCS_JSON);
  var validator = require(VALIDATOR);

  if (!validator || typeof validator.validate !== 'function') {
    console.error('[pre-flight] schema-validator.js did not export validate()');
    process.exit(2);
  }

  var byFloor = bundle.npcsByFloor || {};
  var floorIds = Object.keys(byFloor).sort();

  var totalChecked = 0;
  var totalFailed  = 0;
  var failures     = [];

  for (var i = 0; i < floorIds.length; i++) {
    var fid = floorIds[i];
    var list = byFloor[fid] || [];
    for (var j = 0; j < list.length; j++) {
      var npc = list[j];
      totalChecked++;

      // Ensure discriminator fields are present on the object we validate
      // against. The top-level schema oneOf routes on `kind`, and many
      // subschemas require `floorId`. The bundle stores NPCs grouped by
      // floor, so inject floorId if missing.
      var candidate = Object.assign({}, npc);
      if (candidate.kind == null)    candidate.kind    = 'npc';
      if (candidate.floorId == null) candidate.floorId = fid;

      var res;
      try {
        res = validator.validate(schema, candidate, schema);
      } catch (e) {
        res = { ok: false, errors: [{ path: '', keyword: 'throw', message: String(e && e.message || e) }] };
      }

      if (!res.ok) {
        totalFailed++;
        failures.push({
          floorId: fid,
          id:      npc.id || '(no id)',
          errors:  res.errors || []
        });
      }
    }
  }

  console.log('--- DOC-110 P1.1 pre-flight validation ---');
  console.log('Schema:      ' + path.relative(ROOT, SCHEMA));
  console.log('Data file:   ' + path.relative(ROOT, NPCS_JSON));
  console.log('NPCs scanned: ' + totalChecked + ' across ' + floorIds.length + ' floor(s)');
  console.log('Failures:    ' + totalFailed);

  if (totalFailed > 0) {
    console.log('');
    console.log('Failing NPCs:');
    for (var k = 0; k < failures.length; k++) {
      var f = failures[k];
      console.log('  [' + f.floorId + '] ' + f.id + '  (' + f.errors.length + ' error' + (f.errors.length === 1 ? '' : 's') + ')');
      var show = verbose ? Math.min(f.errors.length, 3) : Math.min(f.errors.length, 1);
      for (var e = 0; e < show; e++) {
        var err = f.errors[e];
        console.log('      at "' + (err.path || '/') + '"  [' + err.keyword + ']  ' + err.message);
      }
      if (f.errors.length > show) {
        console.log('      ...(' + (f.errors.length - show) + ' more — rerun with --verbose)');
      }
    }
  }

  console.log('');
  console.log(totalFailed === 0 ? 'PASS — all NPCs validate cleanly.' : 'FAIL — ' + totalFailed + ' NPC(s) failed validation.');
  process.exit(totalFailed === 0 ? 0 : 1);
}

main();

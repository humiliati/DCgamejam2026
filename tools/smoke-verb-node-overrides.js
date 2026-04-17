#!/usr/bin/env node
// ============================================================
// smoke-verb-node-overrides.js — DOC-110 P3 Ch.2 stretch
// ============================================================
// Headless smoke test for the per-floor override merge flow.
// Boots the runtime modules under a fake window, simulates a
// DungeonVerbNodes-style auto-derived node list, runs
// VerbNodeOverrides.apply(), and asserts add/remove/replace
// semantics all land as expected. Exit 0 on pass, 1 on any
// assertion failure.
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

globalThis.window = globalThis;

// Load the override bundle sidecar (populates window.VERB_NODE_OVERRIDES_DATA).
var bundlePath = path.resolve(__dirname, '..', 'data', 'verb-node-overrides.js');
(0, eval)(fs.readFileSync(bundlePath, 'utf8'));
if (!globalThis.VERB_NODE_OVERRIDES_DATA) {
  console.error('[smoke-overrides] bundle did not populate window.VERB_NODE_OVERRIDES_DATA');
  process.exit(1);
}

// Load the seed module (defines VerbNodeOverrides as a top-level `var`).
// Node's indirect eval doesn't attach top-level `var` to globalThis, so
// append an explicit assignment — same workaround used in the Ch.2 smoke.
var seedPath = path.resolve(__dirname, '..', 'engine', 'verb-node-overrides-seed.js');
var seedSrc = fs.readFileSync(seedPath, 'utf8') + '\nglobalThis.VerbNodeOverrides = VerbNodeOverrides;\n';
(0, eval)(seedSrc);
if (!globalThis.VerbNodeOverrides || !globalThis.VerbNodeOverrides.apply) {
  console.error('[smoke-overrides] VerbNodeOverrides.apply missing after seed load');
  process.exit(1);
}

var failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }

// ── Scenario 1: floor with NO override → identity passthrough ─────
var auto1 = [
  { id: 'dvn_9.9.9_rest_0_0', type: 'rest_spot',     x: 0, y: 0 },
  { id: 'dvn_9.9.9_1_1',      type: 'shop_entrance', x: 1, y: 1 }
];
var out1 = VerbNodeOverrides.apply('9.9.9', auto1);
assert(out1 === auto1, 'scenario 1: no-override floor should return identity array');
assert(out1.length === 2, 'scenario 1: length should be 2');

// ── Scenario 2: live override file for 2.2.1 (add + remove) ─────
// Simulated DungeonVerbNodes auto-scan output — includes the id the
// override file targets for removal plus one that should survive.
var auto2 = [
  { id: 'dvn_2.2.1_rest_4_4', type: 'rest_spot',     x: 4, y: 4 },  // should be removed
  { id: 'dvn_2.2.1_rest_7_7', type: 'rest_spot',     x: 7, y: 7 },  // should survive
  { id: 'dvn_2.2.1_8_3',      type: 'shop_entrance', x: 8, y: 3 }   // should survive
];
var out2 = VerbNodeOverrides.apply('2.2.1', auto2);
assert(out2 !== auto2, 'scenario 2: overridden floor should return NEW array');
assert(out2.length === 3,
  'scenario 2: length should be 3 (started 3, removed 1, added 1), got ' + out2.length);

// Verify the removed id is gone
var hasRemoved = out2.some(function (n) { return n.id === 'dvn_2.2.1_rest_4_4'; });
assert(!hasRemoved, 'scenario 2: dvn_2.2.1_rest_4_4 should have been removed');

// Verify the added id is present with the right fields
var added = out2.find(function (n) { return n.id === 'wake_b1_tide_post'; });
assert(added, 'scenario 2: wake_b1_tide_post should have been added');
if (added) {
  assert(added.type === 'faction_post', 'scenario 2: added type = faction_post, got ' + added.type);
  assert(added.faction === 'tide',      'scenario 2: added faction = tide, got ' + added.faction);
  assert(added.x === 5 && added.y === 7, 'scenario 2: added coords (5,7), got (' + added.x + ',' + added.y + ')');
}

// Survivors preserved
var survivor = out2.find(function (n) { return n.id === 'dvn_2.2.1_rest_7_7'; });
assert(survivor && survivor.type === 'rest_spot', 'scenario 2: dvn_2.2.1_rest_7_7 should survive unchanged');

// ── Scenario 3: inject a synthetic replace + contested override ─
// Reset the seed cache and inject a fabricated bundle exercising replace[].
VerbNodeOverrides.reset();
globalThis.VERB_NODE_OVERRIDES_DATA = {
  _meta: { floorCount: 1, opCount: 3 },
  byFloor: {
    '3.1.2': {
      floorId: '3.1.2',
      add: [
        { id: 'synthetic_soup', type: 'soup_kitchen', x: 2, y: 2 }
      ],
      remove: [ 'dvn_3.1.2_zzz' ],       // targets a non-existent id — should silent-no-op
      replace: [
        { id: 'dvn_3.1.2_bench_1', patch: { type: 'bench',   faction: 'foundry' } },
        { id: 'dvn_3.1.2_bonf_0',  patch: { contested: true } }
      ]
    }
  }
};
var auto3 = [
  { id: 'dvn_3.1.2_bench_1', type: 'rest_spot',     x: 10, y: 5 },  // will be replaced
  { id: 'dvn_3.1.2_bonf_0',  type: 'bonfire',       x: 11, y: 5 },  // will get contested
  { id: 'dvn_3.1.2_shop_0',  type: 'shop_entrance', x: 12, y: 5 }   // untouched
];
var out3 = VerbNodeOverrides.apply('3.1.2', auto3);
assert(out3.length === 4, 'scenario 3: length should be 4 (3 auto + 1 add - 0 removed), got ' + out3.length);

var bench = out3.find(function (n) { return n.id === 'dvn_3.1.2_bench_1'; });
assert(bench && bench.type === 'bench',          'scenario 3: bench type patched');
assert(bench && bench.faction === 'foundry',     'scenario 3: bench faction patched');
assert(bench && bench.x === 10 && bench.y === 5, 'scenario 3: bench coords preserved (patch cannot move nodes)');

var bonf = out3.find(function (n) { return n.id === 'dvn_3.1.2_bonf_0'; });
assert(bonf && bonf.contested === true, 'scenario 3: bonfire contested flag set');
assert(bonf && bonf.type === 'bonfire',  'scenario 3: bonfire type untouched (only contested patched)');

var soup = out3.find(function (n) { return n.id === 'synthetic_soup'; });
assert(soup && soup.type === 'soup_kitchen', 'scenario 3: synthetic_soup added');

var shop = out3.find(function (n) { return n.id === 'dvn_3.1.2_shop_0'; });
assert(shop && shop.type === 'shop_entrance', 'scenario 3: untouched shop survives unchanged');

// ── Scenario 4: duplicate-add id should be skipped (defence-in-depth) ─
VerbNodeOverrides.reset();
globalThis.VERB_NODE_OVERRIDES_DATA = {
  _meta: {},
  byFloor: {
    '4.4.4': {
      floorId: '4.4.4',
      add: [ { id: 'dup_id', type: 'bench', x: 1, y: 1 } ],
      remove: [],
      replace: []
    }
  }
};
var auto4 = [ { id: 'dup_id', type: 'rest_spot', x: 0, y: 0 } ];
var _origWarn = console.warn;
var warnings = [];
console.warn = function () { warnings.push(Array.prototype.join.call(arguments, ' ')); };
var out4 = VerbNodeOverrides.apply('4.4.4', auto4);
console.warn = _origWarn;
assert(out4.length === 1, 'scenario 4: duplicate add should be skipped, length=1 got ' + out4.length);
assert(out4[0].type === 'rest_spot', 'scenario 4: survivor should be the auto-derived entry');
assert(warnings.some(function (m) { return m.indexOf('dup_id') !== -1; }),
  'scenario 4: a warning should have been logged about the duplicate id');

// ── Report ────────────────────────────────────────────────────────
if (failures.length) {
  console.error('[smoke-overrides] FAIL — ' + failures.length + ' assertion(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('[smoke-overrides] PASS — 4 scenarios covered (no-op, live override, synthetic replace+contested, duplicate-add guard)');

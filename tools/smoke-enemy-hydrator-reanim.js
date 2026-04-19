#!/usr/bin/env node
// ============================================================
// smoke-enemy-hydrator-reanim.js — DOC-110 P5.5 headless smoke
// ------------------------------------------------------------
// Exercises tools/js/enemy-hydrator-reanim.js in pure-logic mode
// (no DOM). Asserts:
//
//   1. Tier validators — T1/T2/T3/null valid/invalid forms,
//      noReanim↔tier coherence, T3 dispatchTarget shape
//   2. Suggest-tier heuristic — decision table hit rules,
//      determinism (same input → same output)
//   3. Coherence reporting — err/warn/info emission per bullet
//      in the spec §5
//   4. Roster rollup — totals sum, per-tier + per-profile buckets
//      partition correctly
//   5. Writeback normalize — strips stale fields, round-trip stable
//   6. Dialogue key cache — fallback works with no NpcDialogueTrees
//   7. Edge cases — empty roster, no brain, brain:{}, legacy drift
//   8. Integration buildView — 3 roster rows + coherence payload
//
// Run: node tools/smoke-enemy-hydrator-reanim.js
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var REPO_ROOT = path.resolve(__dirname, '..');
var ENEMIES   = path.join(REPO_ROOT, 'data', 'enemies.json');
var MODULE_JS = path.join(REPO_ROOT, 'tools', 'js', 'enemy-hydrator-reanim.js');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
var raw = readJson(ENEMIES);
var enemies = Array.isArray(raw) ? raw : (raw.rows || raw.enemies || []);

// ── Minimal browser shim ──────────────────────────────────────
var sandbox = {
  window:   {},
  document: {
    _listeners: {},
    addEventListener: function (k, fn) {
      (this._listeners[k] = this._listeners[k] || []).push(fn);
    },
    getElementById: function () { return null; },
    querySelector:  function () { return null; },
    querySelectorAll: function () { return []; },
    readyState: 'complete'
  },
  console: console,
  setTimeout: setTimeout
};
sandbox.window.EnemyHydrator = { currentRow: function () { return null; }, markDirty: function () {}, toast: function () {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(MODULE_JS, 'utf8'), sandbox);

var M = sandbox.window.EnemyHydratorReanim;
if (!M) { console.error('FAIL: window.EnemyHydratorReanim not exposed.'); process.exit(1); }

// ── Tiny assertion helpers ───────────────────────────────────
var failures = 0;
function eq(label, got, want) {
  if (got !== want) {
    console.error('FAIL ' + label + ' — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
    failures++;
  }
}
function deepEq(label, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error('FAIL ' + label + ' — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
    failures++;
  }
}
function truthy(label, v) { if (!v) { console.error('FAIL ' + label + ' — got falsy'); failures++; } }
function falsy(label, v)  { if (v)  { console.error('FAIL ' + label + ' — got truthy: ' + JSON.stringify(v)); failures++; } }
function has(label, list, pred) {
  for (var i = 0; i < list.length; i++) if (pred(list[i])) return;
  console.error('FAIL ' + label + ' — no element matched in ' + JSON.stringify(list));
  failures++;
}
function notHas(label, list, pred) {
  for (var i = 0; i < list.length; i++) if (pred(list[i])) {
    console.error('FAIL ' + label + ' — unexpected match: ' + JSON.stringify(list[i]));
    failures++; return;
  }
}

// ═══════════════════════════════════════════════════════════
// Group 1 — Tier validators
// ═══════════════════════════════════════════════════════════
console.log('--- 1. Tier validators ---');

// null + undefined are valid
eq('null is valid',      M.validateTier(null,      {}).ok, true);
eq('undefined is valid', M.validateTier(undefined, {}).ok, true);

// T1 basic
eq('T1 valid', M.validateTier({tier:'T1'}, {}).ok, true);
// T1 with extraneous fields → warn not err
var t1x = M.validateTier({tier:'T1', dialogueTreeId:'x'}, {});
eq('T1 + dialogueTreeId still ok', t1x.ok, true);
has('T1 + dialogueTreeId warns', t1x.warns, function(w){ return /T1 ignores/.test(w); });

// T2 valid / missing id
eq('T2 valid', M.validateTier({tier:'T2', dialogueTreeId:'hi'}, {}).ok, true);
eq('T2 missing id fails', M.validateTier({tier:'T2'}, {}).ok, false);
has('T2 missing surfaces err', M.validateTier({tier:'T2'}, {}).errs,
  function(e){ return /dialogueTreeId/.test(e); });
// T2 with stale dispatchTarget → warn
has('T2 + dispatchTarget warns',
  M.validateTier({tier:'T2', dialogueTreeId:'hi', dispatchTarget:{floorId:'1'}}, {}).warns,
  function(w){ return /T2 ignores dispatchTarget/.test(w); });

// T3 shape
eq('T3 valid', M.validateTier({tier:'T3', dispatchTarget:{floorId:'2.1'}}, {}).ok, true);
eq('T3 missing dispatchTarget fails', M.validateTier({tier:'T3'}, {}).ok, false);
eq('T3 empty dispatchTarget fails', M.validateTier({tier:'T3', dispatchTarget:{}}, {}).ok, false);
// T3 with processedVariantId but no shopId → warn
has('T3 orphan variant warns',
  M.validateTier({tier:'T3', dispatchTarget:{floorId:'2.1', processedVariantId:'x'}}, {}).warns,
  function(w){ return /processedVariantId.*without shopId/.test(w); });

// Invalid tier string → err
eq('invalid tier fails', M.validateTier({tier:'T9'}, {}).ok, false);
// Non-object → err
eq('string tier fails', M.validateTier('T1', {}).ok, false);

// noReanim flag + non-null tier → err
var nrRow = { noReanim: true, id:'X' };
has('noReanim + T1 surfaces err', M.validateTier({tier:'T1'}, nrRow).errs,
  function(e){ return /flagged non-reanim/.test(e); });
eq('noReanim + null is ok', M.validateTier(null, nrRow).ok, true);

// ═══════════════════════════════════════════════════════════
// Group 2 — Suggest heuristic
// ═══════════════════════════════════════════════════════════
console.log('--- 2. Suggest-tier heuristic ---');

// Decision table cases
var sStd  = M.suggestTier({tier:'standard', hp:20, str:5});       // ratio 4 → T1
eq('std → T1',  sStd.tier && sStd.tier.tier, 'T1');
eq('std conf high', sStd.confidence, 'high');

var sEliteT = M.suggestTier({tier:'elite', hp:60, str:8});        // ratio 7.5 → T2
eq('elite tanky → T2', sEliteT.tier && sEliteT.tier.tier, 'T2');
truthy('T2 carries dialogueTreeId seed', sEliteT.tier && typeof sEliteT.tier.dialogueTreeId === 'string');

var sEliteG = M.suggestTier({tier:'elite', hp:10, str:8});        // ratio 1.25 → T3
eq('elite glass → T3', sEliteG.tier && sEliteG.tier.tier, 'T3');
eq('T3 carries floorId', sEliteG.tier && sEliteG.tier.dispatchTarget.floorId, '2.1');

var sBoss = M.suggestTier({tier:'boss', hp:100, str:10});
eq('boss → null', sBoss.tier, null);

var sNR = M.suggestTier({noReanim:true, tier:'standard', hp:20, str:5});
eq('noReanim → null', sNR.tier, null);
eq('noReanim conf high', sNR.confidence, 'high');

// DRAIN/CC signal via _deckIntents sidecar
var sDrain = M.suggestTier({tier:'standard', hp:20, str:5, _deckIntents:['BASIC','DRAIN','BASIC']});
eq('DRAIN signal → T2', sDrain.tier && sDrain.tier.tier, 'T2');

// Determinism — same input → same output
var d1 = M.suggestTier({tier:'elite', hp:60, str:8});
var d2 = M.suggestTier({tier:'elite', hp:60, str:8});
deepEq('deterministic', d1, d2);

// ═══════════════════════════════════════════════════════════
// Group 3 — Coherence reporting
// ═══════════════════════════════════════════════════════════
console.log('--- 3. Coherence reporting ---');

// Valid T1 on plain row → no err, no warn
var c1 = M.coherenceReport({id:'X', tier:'standard'}, {tier:'T1'}, []);
eq('T1 plain no err', c1.err.length, 0);

// Boss + non-null → warn
var c2 = M.coherenceReport({id:'B', tier:'boss'}, {tier:'T1'}, []);
has('boss + T1 surfaces warn', c2.warn, function(w){ return /boss reanim is unusual/.test(w); });

// T2 with unknown dialogueTreeId (keys list provided) → warn
var c3 = M.coherenceReport({id:'X', tier:'standard'}, {tier:'T2', dialogueTreeId:'unknown_key'},
  ['known_a', 'known_b']);
has('unknown dialogue key surfaces warn', c3.warn, function(w){ return /unknown_key.*not found/.test(w); });
// T2 with known key → no warn about the key
var c4 = M.coherenceReport({id:'X', tier:'standard'}, {tier:'T2', dialogueTreeId:'known_a'},
  ['known_a', 'known_b']);
notHas('known dialogue key no warn', c4.warn, function(w){ return /not found/.test(w); });

// T3 floorId not in seed list → warn
var c5 = M.coherenceReport({id:'X', tier:'standard'}, {tier:'T3', dispatchTarget:{floorId:'9.9.9'}}, []);
has('unknown floorId surfaces warn', c5.warn, function(w){ return /9\.9\.9.*seed list/.test(w); });

// Legacy top-level drift → info
var c6 = M.coherenceReport({id:'X', tier:'standard', reanimTier:'T1', brain:{reanimTier:{tier:'T2', dialogueTreeId:'x'}}},
  {tier:'T2', dialogueTreeId:'x'}, ['x']);
has('legacy drift surfaces info', c6.info, function(i){ return /legacy top-level reanimTier/.test(i); });

// Non-lethal + T3 → info
var c7 = M.coherenceReport({id:'X', tier:'standard', nonLethal:true}, {tier:'T3', dispatchTarget:{floorId:'2.1'}}, []);
has('non-lethal + T3 surfaces info', c7.info, function(i){ return /non-lethal row dispatching/.test(i); });

// noReanim + tier → err (validator-driven)
var c8 = M.coherenceReport({id:'X', tier:'standard', noReanim:true}, {tier:'T1'}, []);
has('noReanim + T1 surfaces err', c8.err, function(e){ return /flagged non-reanim/.test(e); });

// ═══════════════════════════════════════════════════════════
// Group 4 — Roster rollup
// ═══════════════════════════════════════════════════════════
console.log('--- 4. Roster rollup ---');

var roll = M.rollup(enemies);
truthy('rollup.total matches live roster rows', roll.total > 0);
eq('t1+t2+t3+null partitions total',
  roll.t1 + roll.t2 + roll.t3 + roll['null'], roll.total);
truthy('nonReanim ≤ null', roll.nonReanim <= roll['null']);

// Per-tier buckets partition
function sumBucket(b) { return b.t1 + b.t2 + b.t3 + b['null']; }
var stdCt = sumBucket(roll.byTier.standard);
var eliteCt = sumBucket(roll.byTier.elite);
var bossCt = sumBucket(roll.byTier.boss);
eq('per-tier sums to total', stdCt + eliteCt + bossCt, roll.total);

// Per-profile partitions
var profCt = sumBucket(roll.byProfile.balanced) +
             sumBucket(roll.byProfile.tanky) +
             sumBucket(roll.byProfile.glass);
eq('per-profile sums to total', profCt, roll.total);

console.log('  rollup: total=' + roll.total +
  ' t1=' + roll.t1 + ' t2=' + roll.t2 + ' t3=' + roll.t3 +
  ' null=' + roll['null'] + ' nonReanim=' + roll.nonReanim +
  ' errs=' + roll.errs + ' warns=' + roll.warns);

// Empty roster
var empty = M.rollup([]);
eq('empty total', empty.total, 0);
eq('empty nulls', empty['null'], 0);

// Synthetic: inject reanimTiers into clones (filter comment rows first)
var realRows = enemies.filter(function (r) { return r && r.id; });
var synth = realRows.slice(0, 3).map(function (r) { return Object.assign({}, r, { brain: { reanimTier: { tier: 'T1' } } }); });
synth.push({ id: 'S-T2', tier: 'elite', hp: 30, str: 5, brain: { reanimTier: { tier: 'T2', dialogueTreeId: 'x' } } });
synth.push({ id: 'S-T3', tier: 'elite', hp: 10, str: 5, brain: { reanimTier: { tier: 'T3', dispatchTarget: { floorId: '2.1' } } } });
var srl = M.rollup(synth);
eq('synth total', srl.total, synth.length);
eq('synth t1', srl.t1, 3);
eq('synth t2', srl.t2, 1);
eq('synth t3', srl.t3, 1);
eq('synth null', srl['null'], 0);

// ═══════════════════════════════════════════════════════════
// Group 5 — Writeback normalize
// ═══════════════════════════════════════════════════════════
console.log('--- 5. Writeback normalize ---');

// null / undefined → null
eq('normalize null', M.normalizeTierForWrite(null), null);
eq('normalize undef', M.normalizeTierForWrite(undefined), null);

// T1 strips extras
deepEq('T1 strips extras',
  M.normalizeTierForWrite({tier:'T1', dialogueTreeId:'x', dispatchTarget:{floorId:'1'}}),
  {tier:'T1'});

// T2 keeps only tier + dialogueTreeId
deepEq('T2 strips dispatchTarget',
  M.normalizeTierForWrite({tier:'T2', dialogueTreeId:'hi', dispatchTarget:{floorId:'1'}}),
  {tier:'T2', dialogueTreeId:'hi'});

// T2 missing id → null (invalid gets dropped)
eq('T2 invalid normalizes to null', M.normalizeTierForWrite({tier:'T2'}), null);

// T3 keeps only needed dispatchTarget fields
deepEq('T3 keeps floorId, drops empty shopId',
  M.normalizeTierForWrite({tier:'T3', dispatchTarget:{floorId:'2.1', shopId:''}}),
  {tier:'T3', dispatchTarget:{floorId:'2.1'}});
deepEq('T3 keeps floorId + shopId + variant',
  M.normalizeTierForWrite({tier:'T3', dispatchTarget:{floorId:'2.1', shopId:'s', processedVariantId:'p'}}),
  {tier:'T3', dispatchTarget:{floorId:'2.1', shopId:'s', processedVariantId:'p'}});

// T3 missing floorId → null
eq('T3 no floorId normalizes to null', M.normalizeTierForWrite({tier:'T3', dispatchTarget:{}}), null);

// Round-trip stability: normalize(normalize(x)) === normalize(x)
function rt(x) { return JSON.stringify(M.normalizeTierForWrite(M.normalizeTierForWrite(x))); }
eq('round-trip T1', rt({tier:'T1', extra:'x'}), JSON.stringify({tier:'T1'}));
eq('round-trip T3', rt({tier:'T3', dispatchTarget:{floorId:'2.1'}}), JSON.stringify({tier:'T3', dispatchTarget:{floorId:'2.1'}}));

// Invalid tier → null
eq('bogus tier normalizes to null', M.normalizeTierForWrite({tier:'T9'}), null);

// ═══════════════════════════════════════════════════════════
// Group 6 — Dialogue key cache
// ═══════════════════════════════════════════════════════════
console.log('--- 6. Dialogue key cache ---');

// No window.NpcDialogueTrees → falls back to seed list
var keys = M.getDialogueKeys();
truthy('fallback seed list non-empty', keys.length >= 5);
has('fallback contains generic_greet', keys, function(k){ return k === 'generic_greet'; });

// ═══════════════════════════════════════════════════════════
// Group 7 — Edge cases
// ═══════════════════════════════════════════════════════════
console.log('--- 7. Edge cases ---');

// Row with no brain → null tier
eq('no-brain getTier null', M.getTier({id:'X'}), null);

// Row with brain:{} → null tier
eq('empty-brain getTier null', M.getTier({id:'X', brain:{}}), null);

// Row with brain.reanimTier:null → null
eq('explicit-null getTier null', M.getTier({id:'X', brain:{reanimTier:null}}), null);

// Row with legacy top-level only
eq('legacy-only getLegacyTier', M.getLegacyTier({id:'X', reanimTier:'T1'}), 'T1');
eq('legacy-only getTier null', M.getTier({id:'X', reanimTier:'T1'}), null);

// isFlaggedNonReanim — various inputs
eq('noReanim true → flagged', M.isFlaggedNonReanim({noReanim:true}), true);
eq('archetype:spirit → flagged', M.isFlaggedNonReanim({archetype:'spirit'}), true);
eq('tags:[void] → flagged', M.isFlaggedNonReanim({tags:['void']}), true);
eq('plain row → not flagged', M.isFlaggedNonReanim({tier:'standard'}), false);

// buildView on null row
var nv = M.buildView(null, enemies);
truthy('buildView on null row still returns', nv && nv.meta && nv.distribution);

// ═══════════════════════════════════════════════════════════
// Group 8 — Integration buildView on real roster rows
// ═══════════════════════════════════════════════════════════
console.log('--- 8. Integration buildView ---');

// Pick 3 representative rows: a standard, an elite, and a boss if present
var sample = [];
var std  = enemies.find(function(r){ return r && r.id && r.tier === 'standard'; });
var elt  = enemies.find(function(r){ return r && r.id && r.tier === 'elite'; });
var boss = enemies.find(function(r){ return r && r.id && r.tier === 'boss'; });
if (std)  sample.push(std);
if (elt)  sample.push(elt);
if (boss) sample.push(boss);
truthy('have ≥2 sample rows', sample.length >= 2);

for (var i = 0; i < sample.length; i++) {
  var row = sample[i];
  var v;
  try { v = M.buildView(row, enemies); }
  catch (e) { console.error('FAIL buildView threw on ' + row.id + ': ' + e.message); failures++; continue; }
  truthy(row.id + ' view.meta populated', v.meta && v.meta.id === row.id);
  truthy(row.id + ' view.distribution total matches', v.distribution.total === enemies.filter(function(r){return r && r.id;}).length);
  truthy(row.id + ' suggestion produced', v.suggestion && ('confidence' in v.suggestion));
  truthy(row.id + ' coherence shape', v.coherence && Array.isArray(v.coherence.err));
}

// ═══════════════════════════════════════════════════════════
// Result
// ═══════════════════════════════════════════════════════════
if (failures === 0) {
  var rosterCount = enemies.filter(function(r){return r && r.id;}).length;
  console.log('\nPASS — ' + rosterCount + ' roster rows · 8 assertion groups · ' +
    'rollup {t1:' + roll.t1 + ' t2:' + roll.t2 + ' t3:' + roll.t3 + ' null:' + roll['null'] + '} · ' +
    roll.errs + ' validator errs · ' + roll.warns + ' coherence warns.');
  process.exit(0);
} else {
  console.error('\nFAIL — ' + failures + ' assertion(s) failed.');
  process.exit(1);
}

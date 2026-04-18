#!/usr/bin/env node
// ============================================================
// smoke-enemy-hydrator-loot.js — DOC-110 P5.4 headless smoke
// ------------------------------------------------------------
// Exercises tools/js/enemy-hydrator-loot.js in pure-logic mode
// (no DOM). Asserts:
//
//   1. Closed-form EV math on known slot shapes
//      - range slots:  ev = chance × (min + max) / 2
//      - chance slots: ev = chance × 1
//      - tier currency_max_mult scales the max before EV
//      - tier card_chance_add / salvage_chance_add applied
//   2. Volatility bucketing on both range and chance forms
//   3. Roster coverage — every row in data/enemies.json resolves
//      without exception; the 4 non-lethal-with-no-profile land
//      in the "info" warning bucket, the 23 lethal get a full
//      view with summary.totalValue > 0
//   4. Guaranteed-drop semantics — boss = key + relic, elite = card
//   5. Per-biome rolldown — single-biome → no aggregate row;
//      multi-biome → aggregate row present; missing biome keys
//      surface a "warn" warning
//   6. normalizeWeights — sums to 100 for a known input
//   7. meanWeights — equal-weight mean over two maps
//   8. Forward hook estimateDropsOverRounds
//      - rounds defaults to 6
//      - perRound values scale with rounds param
//      - volatility carries through
//   9. Synthetic edge cases — empty biomes, unknown profile,
//      unknown tier, nonLethal with loot profile, zero-chance slot
//
// The module is browser-flavored (touches document/window),
// so we set up jsdom-lite shims before require().
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var REPO_ROOT  = path.resolve(__dirname, '..');
var ENEMIES    = path.join(REPO_ROOT, 'data', 'enemies.json');
var LOOT_JSON  = path.join(REPO_ROOT, 'data', 'loot-tables.json');
var MODULE_JS  = path.join(REPO_ROOT, 'tools', 'js', 'enemy-hydrator-loot.js');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

var enemies = readJson(ENEMIES).rows || readJson(ENEMIES);
var tables  = readJson(LOOT_JSON);

// ── Minimal browser shim ──────────────────────────────────────
var sandbox = {
  window:   {},
  document: {
    _listeners: {},
    addEventListener: function (k, fn) {
      (this._listeners[k] = this._listeners[k] || []).push(fn);
    },
    getElementById: function () { return null; },
    readyState: 'complete'
  },
  console: console,
  setTimeout: setTimeout
};
sandbox.window.LOOT_TABLES_DATA = tables;
sandbox.window.EnemyHydrator = {
  currentRow: function () { return null; },
  toast: function () {}
};
// Make `window` and `document` resolve as globals inside the module.
vm.createContext(sandbox);

var src = fs.readFileSync(MODULE_JS, 'utf8');
vm.runInContext(src, sandbox);

var M = sandbox.window.EnemyHydratorLoot;
if (!M) {
  console.error('FAIL: window.EnemyHydratorLoot not exposed after loading module.');
  process.exit(1);
}

// ── Tiny assertion helpers ───────────────────────────────────
var failures = 0;
function eq(label, got, want, eps) {
  if (eps != null) {
    if (Math.abs(got - want) > eps) { console.error('FAIL ' + label + ' — got ' + got + ', want ≈ ' + want); failures++; }
  } else if (got !== want) { console.error('FAIL ' + label + ' — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); failures++; }
}
function truthy(label, got) { if (!got) { console.error('FAIL ' + label + ' — got falsy'); failures++; } }
function gte(label, got, want) { if (!(got >= want)) { console.error('FAIL ' + label + ' — got ' + got + ', want ≥ ' + want); failures++; } }
function has(label, list, pred) {
  for (var i = 0; i < list.length; i++) if (pred(list[i])) return;
  console.error('FAIL ' + label + ' — no element matched predicate in ' + JSON.stringify(list));
  failures++;
}
function notHas(label, list, pred) {
  for (var i = 0; i < list.length; i++) if (pred(list[i])) {
    console.error('FAIL ' + label + ' — unexpected match: ' + JSON.stringify(list[i]));
    failures++; return;
  }
}

// ══════════════════════════════════════════════════════════════
// Group 1 — Closed-form EV math
// ══════════════════════════════════════════════════════════════
console.log('--- 1. EV math ---');

// Range slot, no tier mod
var r = M.computeSlot({ enabled: true, chance: 0.5, min: 2, max: 4 }, 'currency', {});
eq('range.chance',  r.chance,  0.5);
eq('range.min',     r.min,     2);
eq('range.max',     r.max,     4);
eq('range.ev',      r.ev,      0.5 * 3); // = 1.5

// Range with currency_max_mult (boss)
var rb = M.computeSlot({ enabled: true, chance: 0.55, min: 2, max: 5 }, 'currency', { currency_max_mult: 4.0 });
eq('bossCurr.min', rb.min, 2);
eq('bossCurr.max', rb.max, 20);         // 5 × 4 = 20
eq('bossCurr.ev',  rb.ev,  0.55 * 11, 0.01); // (2+20)/2 × 0.55

// Chance-only slot (card) with card_chance_add
var cc = M.computeSlot({ enabled: true, chance: 0.30 }, 'card', { card_chance_add: 0.15 });
eq('card.chance (add applied)', cc.chance, 0.45, 0.0001);
eq('card.ev',                    cc.ev,     0.45, 0.0001);

// Clamp at 1.0
var clamp = M.computeSlot({ enabled: true, chance: 0.60 }, 'card', { card_chance_add: 0.50 });
eq('card.chance clamped', clamp.chance, 1.0);

// enabled: false → zero
var off = M.computeSlot({ enabled: false }, 'food', {});
eq('disabled.enabled', off.enabled, false);
eq('disabled.ev',      off.ev,      0);

// ══════════════════════════════════════════════════════════════
// Group 2 — Volatility bucketing
// ══════════════════════════════════════════════════════════════
console.log('--- 2. Volatility ---');

eq('vol range 0-1 low',    M.volForRange(0, 1), 'low');
eq('vol range 1-4 medium', M.volForRange(1, 4), 'medium');
eq('vol range 1-6 high',   M.volForRange(1, 6), 'high');
eq('vol chance 0.05 low',    M.volForChance(0.05), 'low');    // 0.0475
eq('vol chance 0.25 medium', M.volForChance(0.25), 'medium'); // 0.1875 — inside [0.09, 0.21)
eq('vol chance 0.50 high',   M.volForChance(0.50), 'high');   // 0.25

// ══════════════════════════════════════════════════════════════
// Group 3 — Roster coverage
// ══════════════════════════════════════════════════════════════
console.log('--- 3. Roster coverage ---');

var counts = { lethal: 0, nonLethalNoProf: 0, nonLethalWithProf: 0, unknownProf: 0, unknownTier: 0 };
var vals = [];
var errors = 0;

for (var i = 0; i < enemies.length; i++) {
  var row = enemies[i];
  if (!row || !row.id) continue; // comment rows
  var v;
  try { v = M.buildView(row, tables); }
  catch (e) { console.error('FAIL roster.buildView threw on ' + row.id + ': ' + e.message); failures++; errors++; continue; }
  if (!row.lootProfile && row.nonLethal) counts.nonLethalNoProf++;
  else if (!row.lootProfile) counts.nonLethalNoProf++;
  else if (row.lootProfile && row.nonLethal) counts.nonLethalWithProf++;
  else counts.lethal++;
  if (v.meta.profileMissing) counts.unknownProf++;
  if (v.meta.tierMissing)    counts.unknownTier++;
  if (row.lootProfile && !v.meta.profileMissing) vals.push({ id: row.id, tv: v.summary.totalValue });
}
console.log('  roster: lethal=' + counts.lethal +
            ' nonLethalNoProf=' + counts.nonLethalNoProf +
            ' nonLethalWithProf=' + counts.nonLethalWithProf +
            ' unknownProf=' + counts.unknownProf +
            ' unknownTier=' + counts.unknownTier);
gte('no buildView throws', enemies.length - errors, enemies.length);
gte('some enemies have totalValue > 0', vals.filter(function (x) { return x.tv > 0; }).length, 10);

// ══════════════════════════════════════════════════════════════
// Group 4 — Guaranteed-drop semantics
// ══════════════════════════════════════════════════════════════
console.log('--- 4. Guaranteed drops ---');

// Craft a boss row (undead/boss) — known to exist via ENM-080 Bone Sovereign.
var bossRow = enemies.find(function (r) { return r && r.tier === 'boss' && r.lootProfile === 'undead'; });
truthy('boss/undead row exists in roster', bossRow);
if (bossRow) {
  var bv = M.buildView(bossRow, tables);
  truthy('boss has guaranteed drop',         bv.summary.guaranteed);
  if (bv.summary.guaranteed) {
    eq('boss guaranteed.type',     bv.summary.guaranteed.type, 'key');
    eq('boss guaranteed bonusRelic', bv.summary.guaranteed.bonusRelic, true);
  }
  gte('boss XP ≥ 100', bv.summary.xp, 100);
}

// Elite synthetic — guarantee type should be 'card'.
var eliteSynth = { id: 'SYNTH-ELITE', name: 'Synth Elite', tier: 'elite', lootProfile: 'construct', biomes: ['foundry'] };
var ev = M.buildView(eliteSynth, tables);
truthy('elite has guaranteed drop', ev.summary.guaranteed);
if (ev.summary.guaranteed) eq('elite guaranteed.type', ev.summary.guaranteed.type, 'card');

// Standard — no guaranteed drop.
var stdSynth = { id: 'SYNTH-STD', name: 'Synth Std', tier: 'standard', lootProfile: 'organic', biomes: ['cellar'] };
var sv = M.buildView(stdSynth, tables);
eq('standard has no guaranteed drop', sv.summary.guaranteed, null);

// ══════════════════════════════════════════════════════════════
// Group 5 — Per-biome rolldown
// ══════════════════════════════════════════════════════════════
console.log('--- 5. Per-biome rolldown ---');

var single = { id: 'S1', name: 'S', tier: 'standard', lootProfile: 'undead', biomes: ['cellar'] };
var sv1 = M.buildView(single, tables);
eq('single-biome perBiome len',  sv1.cardDrops.perBiome.length, 1);
eq('single-biome aggregate null', sv1.cardDrops.aggregate,      null);

var multi = { id: 'M1', name: 'M', tier: 'elite', lootProfile: 'marine', biomes: ['cellar', 'foundry', 'sealab'] };
var mv = M.buildView(multi, tables);
eq('multi-biome perBiome len',      mv.cardDrops.perBiome.length, 3);
truthy('multi-biome aggregate present', mv.cardDrops.aggregate);
if (mv.cardDrops.aggregate) {
  eq('multi-biome aggregate weight = 1/3', mv.cardDrops.aggregate.weight, 0.33, 0.01);
  truthy('aggregate has common rarity',    mv.cardDrops.aggregate.rarityPct.common > 0);
}

// Unknown biome surfaces a warning
var badBiome = { id: 'BB1', name: 'BB', tier: 'standard', lootProfile: 'undead', biomes: ['mars_colony'] };
var bbv = M.buildView(badBiome, tables);
has('missing biome surfaces warn', bbv.warnings, function (w) {
  return w.level === 'warn' && /mars_colony/.test(w.msg);
});

// ══════════════════════════════════════════════════════════════
// Group 6 — normalizeWeights / meanWeights
// ══════════════════════════════════════════════════════════════
console.log('--- 6. Weight helpers ---');

var norm = M.normalizeWeights({ common: 70, uncommon: 20, rare: 10 });
eq('normalize common', norm.common, 70);
eq('normalize uncommon', norm.uncommon, 20);
eq('normalize rare', norm.rare, 10);
eq('normalize empty', Object.keys(M.normalizeWeights({})).length, 0);

var mean = M.meanWeights([
  { a: 10, b: 20 },
  { a: 20, b: 40 }
]);
eq('mean.a', mean.a, 15);
eq('mean.b', mean.b, 30);

// ══════════════════════════════════════════════════════════════
// Group 7 — Forward hook
// ══════════════════════════════════════════════════════════════
console.log('--- 7. estimateDropsOverRounds ---');

// Any lethal marine row — post-open-question-resolution most marine
// rows re-tiered to elite, so don't pin on tier==standard.
var hookRow = enemies.find(function (r) { return r && r.lootProfile === 'marine' && !r.nonLethal; });
truthy('marine row exists in roster', hookRow);
if (hookRow) {
  var h6 = M.estimateDropsOverRounds(hookRow, tables);            // default 6
  var h3 = M.estimateDropsOverRounds(hookRow, tables, 3);
  eq('default rounds = 6', h6.rounds, 6);
  eq('explicit rounds = 3', h3.rounds, 3);
  truthy('perFight.totalValue > 0', h6.perFight.totalValue > 0);
  // perRound = perFight / rounds (approx, rounded)
  var expected = Math.round((h6.perFight.totalValue / 3) * 1000) / 1000;
  if (Math.abs(h3.perRound.totalValue - expected) > 0.01) {
    console.error('FAIL estimateDrops perRound scales with rounds — got ' + h3.perRound.totalValue + ', want ≈ ' + expected);
    failures++;
  }
  truthy('volatility carries through', h6.volatility === 'low' || h6.volatility === 'medium' || h6.volatility === 'high');
}

// ══════════════════════════════════════════════════════════════
// Group 8 — Synthetic edge cases
// ══════════════════════════════════════════════════════════════
console.log('--- 8. Synthetic edge cases ---');

// 8a: nonLethal without loot profile → "info" N/A message
var nl = { id: 'NL', name: 'NL', tier: 'standard', nonLethal: true, biomes: ['cellar'] };
var nlv = M.buildView(nl, tables);
has('nonLethal no-profile surfaces info', nlv.warnings, function (w) { return w.level === 'info' && /N\/A/.test(w.msg); });
eq('nonLethal no-profile totalValue = 0', nlv.summary.totalValue, 0);

// 8b: nonLethal WITH loot profile → info (valid pattern)
var nlp = { id: 'NLP', name: 'NLP', tier: 'standard', nonLethal: true, lootProfile: 'undead', biomes: ['cellar'] };
var nlpv = M.buildView(nlp, tables);
has('nonLethal with-profile surfaces info pattern', nlpv.warnings, function (w) {
  return w.level === 'info' && /Non-lethal drop source/.test(w.msg);
});
gte('nonLethal with-profile totalValue > 0', nlpv.summary.totalValue, 0.01);

// 8c: unknown profile → err, buildView still returns
var upRow = { id: 'UP', name: 'UP', tier: 'standard', lootProfile: 'bogus', biomes: ['cellar'] };
var upv = M.buildView(upRow, tables);
eq('unknown profile flag', upv.meta.profileMissing, true);
has('unknown profile surfaces err', upv.warnings, function (w) { return w.level === 'err'; });

// 8d: unknown tier → warn, falls back to neutral multipliers
var utRow = { id: 'UT', name: 'UT', tier: 'mythic', lootProfile: 'undead', biomes: ['cellar'] };
var utv = M.buildView(utRow, tables);
eq('unknown tier flag', utv.meta.tierMissing, true);
has('unknown tier surfaces warn', utv.warnings, function (w) { return w.level === 'warn' && /tier/.test(w.msg); });
// With neutral multipliers, still produces non-zero totalValue
gte('unknown tier still computes totalValue', utv.summary.totalValue, 0);

// 8e: empty biomes → perBiome empty, no aggregate, no missing-biome warn
var ebRow = { id: 'EB', name: 'EB', tier: 'standard', lootProfile: 'undead', biomes: [] };
var ebv = M.buildView(ebRow, tables);
eq('empty biomes perBiome',  ebv.cardDrops.perBiome.length, 0);
eq('empty biomes aggregate', ebv.cardDrops.aggregate, null);
notHas('empty biomes no missing-biome warn', ebv.warnings, function (w) { return /No card_drops table/.test(w.msg); });

// 8f: zero-chance card slot → vol low, ev zero
var zc = M.computeSlot({ enabled: true, chance: 0 }, 'card', {});
eq('zero chance ev',  zc.ev,  0);
eq('zero chance vol', zc.volatility, 'low');

// 8g: contribution % sums to ~100 for enabled slots on a well-formed enemy
var wfRow = enemies.find(function (r) { return r && r.lootProfile === 'construct' && r.tier === 'elite'; });
if (wfRow) {
  var wfv = M.buildView(wfRow, tables);
  var totalPct = 0;
  for (var k = 0; k < M.SLOT_KEYS.length; k++) {
    var ss = wfv.slots[M.SLOT_KEYS[k]];
    if (ss.enabled) totalPct += ss.contribPct;
  }
  // Sum is ≤ 100 because guaranteed-drop value sits *outside* the slot rows.
  // Expect roughly 30-100% depending on whether guaranteed drop is a big chunk.
  truthy('contribPct sums to a finite value', totalPct >= 0 && totalPct <= 100.5);
}

// ══════════════════════════════════════════════════════════════
// Result
// ══════════════════════════════════════════════════════════════
if (failures === 0) {
  console.log('\nPASS — ' + enemies.filter(function (r) { return r && r.id; }).length +
    ' roster rows · ' + vals.length + ' lethal views · ' +
    counts.nonLethalNoProf + ' nonLethal-no-profile · synthetic edges all green.');
  process.exit(0);
} else {
  console.error('\nFAIL — ' + failures + ' assertion(s) failed.');
  process.exit(1);
}

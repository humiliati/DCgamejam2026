#!/usr/bin/env node
// ============================================================
// tools/smoke-enemy-hydrator-curve.js — DOC-110 P5.3 smoke
// ------------------------------------------------------------
// Headless validation for tools/js/enemy-hydrator-curve.js.
//
// Since the curve module is purely observational, this smoke
// tests:
//
//   1. Slot-contract math (roundToSlot) — opener / loop / edge
//   2. Deck expansion — full roster, determinism, card lookups
//   3. Recommended-curve coverage — every (tier × profile) combo
//      present in data resolves to a non-fallback entry
//   4. _curveOverride semantics — when present, expansion uses
//      override order and does not mutate deck.cards
//   5. Synthetic cases — maxRounds clamp, 1-card deck, 0-card deck,
//      mismatch detection, overlay parity
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO = path.resolve(__dirname, '..');

// ── Constants (MUST mirror tools/js/enemy-hydrator-curve.js) ──
var DEFAULT_MAX_ROUNDS = 6;
var MIN_ROUNDS = 1;
var MAX_ROUNDS = 12;

var RECOMMENDED_CURVES = {
  'standard/balanced': { sequence: ['BASIC','BRACE','BASIC','DOT','BASIC','BURST'], tolerance: { earlyDefense: 1, lateBurst: false } },
  'standard/tanky':    { sequence: ['BRACE','BASIC','BRACE','DOT','BASIC','DOT'],   tolerance: { earlyDefense: 2, lateBurst: false } },
  'standard/glass':    { sequence: ['BASIC','BURST','BASIC','DOT','BASIC','BURST'], tolerance: { earlyDefense: 0, lateBurst: true } },
  'elite/balanced':    { sequence: ['BRACE','BASIC','DOT','BURST','BASIC','DRAIN'], tolerance: { earlyDefense: 1, lateBurst: true } },
  'elite/tanky':       { sequence: ['BRACE','BRACE','BASIC','DOT','BURST','DRAIN'], tolerance: { earlyDefense: 2, lateBurst: true } },
  'elite/glass':       { sequence: ['BURST','BASIC','DOT','BURST','CC','BURST'],    tolerance: { earlyDefense: 0, lateBurst: true } },
  'boss/balanced':     { sequence: ['BRACE','BASIC','DOT','BURST','CC','BURST'],    tolerance: { earlyDefense: 2, lateBurst: true } },
  'boss/tanky':        { sequence: ['BRACE','BRACE','DOT','BASIC','BURST','DRAIN'], tolerance: { earlyDefense: 2, lateBurst: true } },
  'boss/glass':        { sequence: ['BURST','BASIC','DOT','BURST','CC','BURST'],    tolerance: { earlyDefense: 0, lateBurst: true } }
};
var FALLBACK_CURVE_KEY = 'standard/balanced';

// ── Pure functions (verbatim port) ────────────────────────
function profileFor(row) {
  if (!row) return 'balanced';
  var hp  = Number(row.hp)  || 0;
  var str = Math.max(1, Number(row.str) || 1);
  var ratio = hp / str;
  if (ratio >= 5) return 'tanky';
  if (ratio <= 2) return 'glass';
  return 'balanced';
}

function recommendedFor(row) {
  var tier = (row && row.tier) || 'standard';
  var profile = profileFor(row);
  var key = tier + '/' + profile;
  var spec = RECOMMENDED_CURVES[key] || RECOMMENDED_CURVES[FALLBACK_CURVE_KEY];
  return {
    key:       key,
    profile:   profile,
    sequence:  spec.sequence.slice(),
    tolerance: { earlyDefense: spec.tolerance.earlyDefense, lateBurst: !!spec.tolerance.lateBurst }
  };
}

function roundToSlot(round, deckSize) {
  if (deckSize <= 0) return -1;
  if (deckSize === 1) return 0;
  if (round === 0) return 0;
  return 1 + ((round - 1) % (deckSize - 1));
}

function clampRounds(n) {
  if (typeof n !== 'number' || !isFinite(n)) return DEFAULT_MAX_ROUNDS;
  n = Math.floor(n);
  if (n < MIN_ROUNDS) return MIN_ROUNDS;
  if (n > MAX_ROUNDS) return MAX_ROUNDS;
  return n;
}

function expandDeck(deckCardIds, cardLookup, rounds) {
  var n = deckCardIds.length;
  var out = [];
  for (var r = 0; r < rounds; r++) {
    var slot = roundToSlot(r, n);
    if (slot < 0) break;
    var cardId = deckCardIds[slot];
    var card   = cardLookup[cardId];
    out.push({
      round:  r + 1,
      cardId: cardId,
      intent: (card && card.intentType) ? card.intentType : 'BASIC',
      slot:   slot
    });
  }
  return out;
}

function expandRecommended(sequence, rounds) {
  var n = sequence.length;
  var out = [];
  for (var r = 0; r < rounds; r++) {
    var slot = roundToSlot(r, n);
    if (slot < 0) break;
    out.push({ round: r + 1, intent: sequence[slot], slot: slot });
  }
  return out;
}

function buildView(row, deckEntry, cardLookup, rounds) {
  rounds = clampRounds(rounds);
  var rec = recommendedFor(row);
  var recExp = expandRecommended(rec.sequence, rounds);
  if (!deckEntry || !Array.isArray(deckEntry.cards) || deckEntry.cards.length === 0) {
    return {
      actual:      [],
      recommended: recExp,
      meta: {
        override: false, pattern: deckEntry && deckEntry.pattern ? deckEntry.pattern : null,
        deckSize: 0, rounds: rounds, recKey: rec.key, tolerance: rec.tolerance,
        match: { perRound: [], total: 0 }
      }
    };
  }
  var overrideCards = Array.isArray(deckEntry._curveOverride)
    ? deckEntry._curveOverride.filter(function (id) { return typeof id === 'string'; })
    : null;
  var orderCards = overrideCards && overrideCards.length > 0 ? overrideCards : deckEntry.cards;
  var actual = expandDeck(orderCards, cardLookup, rounds);
  var perRound = [];
  var total = 0;
  for (var i = 0; i < actual.length && i < recExp.length; i++) {
    var m = actual[i].intent === recExp[i].intent;
    perRound.push(m);
    if (m) total++;
  }
  return {
    actual: actual, recommended: recExp,
    meta: {
      override:  !!overrideCards && overrideCards.length > 0,
      pattern:   deckEntry.pattern || null,
      deckSize:  orderCards.length,
      rounds:    rounds,
      recKey:    rec.key,
      tolerance: rec.tolerance,
      match:     { perRound: perRound, total: total }
    }
  };
}

// ── Harness ───────────────────────────────────────────────
var failures = 0;
function fail(msg) { failures++; console.error('  FAIL: ' + msg); }
function pass()    { /* silent */ }

function assert(cond, msg) { if (cond) pass(); else fail(msg); }
function eq(a, b, msg)     { if (a === b) pass(); else fail(msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function deepEq(a, b, msg) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa === sb) pass(); else fail(msg + '\n      got  ' + sa + '\n      want ' + sb);
}

// ── Load data ─────────────────────────────────────────────
var enemies    = JSON.parse(fs.readFileSync(path.join(REPO, 'data/enemies.json'), 'utf8'));
var cards      = JSON.parse(fs.readFileSync(path.join(REPO, 'data/enemy-cards.json'), 'utf8'));
var decksJson  = JSON.parse(fs.readFileSync(path.join(REPO, 'data/enemy-decks.json'), 'utf8'));

var rows = Array.isArray(enemies) ? enemies : (enemies.rows || enemies.enemies || []);
if (!rows.length) { console.error('No enemy rows found'); process.exit(1); }

var cardById = {};
(cards.cards || []).forEach(function (c) { if (c && c.id) cardById[c.id] = c; });

var decks = {};
Object.keys(decksJson).forEach(function (k) { if (k !== '_schema') decks[k] = decksJson[k]; });

// ── Test 1: Slot-contract math ────────────────────────────
(function () {
  // deckSize 0 → -1
  eq(roundToSlot(0, 0), -1, 'roundToSlot(0, 0)');
  eq(roundToSlot(5, 0), -1, 'roundToSlot(5, 0)');
  // deckSize 1 → 0 for every round
  for (var r = 0; r < 10; r++) eq(roundToSlot(r, 1), 0, 'roundToSlot(' + r + ', 1) === 0');
  // deckSize 3: slot0=opener, then loop slots 1,2,1,2,...
  eq(roundToSlot(0, 3), 0, 'slot@r0 d3');
  eq(roundToSlot(1, 3), 1, 'slot@r1 d3');
  eq(roundToSlot(2, 3), 2, 'slot@r2 d3');
  eq(roundToSlot(3, 3), 1, 'slot@r3 d3 (loop)');
  eq(roundToSlot(4, 3), 2, 'slot@r4 d3 (loop)');
  eq(roundToSlot(5, 3), 1, 'slot@r5 d3 (loop)');
  // deckSize 4: opener, then loop slots 1,2,3,1,2,3,...
  eq(roundToSlot(0, 4), 0, 'slot@r0 d4');
  eq(roundToSlot(1, 4), 1, 'slot@r1 d4');
  eq(roundToSlot(3, 4), 3, 'slot@r3 d4');
  eq(roundToSlot(4, 4), 1, 'slot@r4 d4 (loop)');
  eq(roundToSlot(6, 4), 3, 'slot@r6 d4 (loop)');
  // clampRounds
  eq(clampRounds(6), 6, 'clamp 6');
  eq(clampRounds(0), MIN_ROUNDS, 'clamp 0 → MIN');
  eq(clampRounds(99), MAX_ROUNDS, 'clamp 99 → MAX');
  eq(clampRounds(NaN), DEFAULT_MAX_ROUNDS, 'clamp NaN → default');
  eq(clampRounds(3.7), 3, 'clamp float floors');
})();

// ── Test 2: Roster deck expansion ─────────────────────────
var rosterStats = { total: 0, totalMatches: 0, perfectMatch: 0, zeroMatch: 0 };
rows.forEach(function (row) {
  var d = decks[row.id];
  if (!d || !Array.isArray(d.cards) || d.cards.length === 0) return;
  var view = buildView(row, d, cardById, 6);
  rosterStats.total++;
  rosterStats.totalMatches += view.meta.match.total;
  if (view.meta.match.total === view.actual.length) rosterStats.perfectMatch++;
  if (view.meta.match.total === 0) rosterStats.zeroMatch++;

  // Every actual entry has a resolvable card + valid intent
  view.actual.forEach(function (e) {
    assert(cardById[e.cardId] != null, row.id + ' round ' + e.round + ': card ' + e.cardId + ' missing from pool');
    assert(['BASIC','BRACE','DOT','BURST','CC','DRAIN'].indexOf(e.intent) >= 0,
           row.id + ' round ' + e.round + ': invalid intent ' + e.intent);
  });

  // Determinism: two builds are identical
  var view2 = buildView(row, d, cardById, 6);
  deepEq(view.actual, view2.actual, row.id + ' deterministic actual');
  deepEq(view.recommended, view2.recommended, row.id + ' deterministic recommended');

  // Slot @ round 0 is always deck[0] (opener contract)
  eq(view.actual[0].slot, 0, row.id + ' opener at slot 0');
  eq(view.actual[0].cardId, d.cards[0], row.id + ' opener card === deck[0]');

  // deckSize field matches
  eq(view.meta.deckSize, d.cards.length, row.id + ' meta.deckSize');
});

// ── Test 3: Recommended-curve coverage ────────────────────
(function () {
  var tiers    = ['standard', 'elite', 'boss'];
  var profiles = ['balanced', 'tanky', 'glass'];
  tiers.forEach(function (t) {
    profiles.forEach(function (p) {
      var key = t + '/' + p;
      assert(RECOMMENDED_CURVES[key] != null, 'RECOMMENDED_CURVES has ' + key);
      var spec = RECOMMENDED_CURVES[key];
      assert(Array.isArray(spec.sequence) && spec.sequence.length >= 6, key + ' sequence length >= 6');
      spec.sequence.forEach(function (intent, i) {
        assert(['BASIC','BRACE','DOT','BURST','CC','DRAIN'].indexOf(intent) >= 0,
               key + ' sequence[' + i + '] = ' + intent + ' invalid');
      });
      assert(typeof spec.tolerance.earlyDefense === 'number', key + ' tolerance.earlyDefense is number');
      assert(typeof spec.tolerance.lateBurst === 'boolean', key + ' tolerance.lateBurst is boolean');
    });
  });
})();

// ── Test 4: _curveOverride semantics ──────────────────────
(function () {
  // Pick a real deck + craft a synthetic override that reverses its order
  var sampleId = Object.keys(decks)[0];
  var sample = decks[sampleId];
  if (!sample || !Array.isArray(sample.cards) || sample.cards.length < 2) return;
  var row = rows.find(function (r) { return r.id === sampleId; });
  if (!row) return;

  var reversed = sample.cards.slice().reverse();
  var overridden = {
    cards: sample.cards.slice(),
    _curveOverride: reversed
  };
  var originalCards = sample.cards.slice();

  var view = buildView(row, overridden, cardById, 6);
  eq(view.meta.override, true, 'override flag set when _curveOverride present');
  eq(view.actual[0].cardId, reversed[0], 'override opener === reversed[0]');

  // Mutation-safety: original deck.cards unchanged
  deepEq(overridden.cards, originalCards, '_curveOverride does not mutate deck.cards');

  // Empty override falls back to deck.cards
  var emptyOverride = { cards: sample.cards.slice(), _curveOverride: [] };
  var view2 = buildView(row, emptyOverride, cardById, 6);
  eq(view2.meta.override, false, 'empty _curveOverride ignored');
  eq(view2.actual[0].cardId, sample.cards[0], 'empty override falls back');
})();

// ── Test 5: Synthetic cases ───────────────────────────────
var syntheticCount = 0;

// S1: 0-card deck → empty actual, populated recommended, deckSize=0
(function () {
  var row = { id: 'SYN-001', hp: 10, str: 3, tier: 'standard' };
  var v = buildView(row, { cards: [] }, cardById, 6);
  eq(v.actual.length, 0, 'S1: 0-card deck → empty actual');
  eq(v.recommended.length, 6, 'S1: 6 recommended rounds');
  eq(v.meta.deckSize, 0, 'S1: deckSize = 0');
  eq(v.meta.match.total, 0, 'S1: zero matches');
  syntheticCount++;
})();

// S2: 1-card deck → same card every round
(function () {
  var row = { id: 'SYN-002', hp: 20, str: 4, tier: 'standard' };
  var deck = { cards: ['EATK-001'] };
  var v = buildView(row, deck, cardById, 6);
  eq(v.actual.length, 6, 'S2: 6 rounds');
  v.actual.forEach(function (e, i) {
    eq(e.cardId, 'EATK-001', 'S2: round ' + (i + 1) + ' card');
    eq(e.slot, 0, 'S2: round ' + (i + 1) + ' slot');
  });
  syntheticCount++;
})();

// S3: maxRounds clamp respected
(function () {
  var row = { id: 'SYN-003', hp: 10, str: 2, tier: 'standard' };
  var deck = { cards: ['EATK-001', 'EATK-002', 'EATK-003'] };
  eq(buildView(row, deck, cardById, 3).actual.length, 3, 'S3: rounds=3');
  eq(buildView(row, deck, cardById, 1).actual.length, 1, 'S3: rounds=1');
  eq(buildView(row, deck, cardById, 12).actual.length, 12, 'S3: rounds=12');
  eq(buildView(row, deck, cardById, 99).actual.length, MAX_ROUNDS, 'S3: rounds=99 clamped');
  eq(buildView(row, deck, cardById, 0).actual.length, 1, 'S3: rounds=0 clamped to MIN');
  syntheticCount++;
})();

// S4: Profile detection boundaries
(function () {
  eq(profileFor({ hp: 25, str: 5 }), 'tanky', 'S4: hp/str=5 tanky (>=5)');
  eq(profileFor({ hp: 24, str: 5 }), 'balanced', 'S4: hp/str=4.8 balanced');
  eq(profileFor({ hp: 10, str: 5 }), 'glass', 'S4: hp/str=2 glass (<=2)');
  eq(profileFor({ hp: 11, str: 5 }), 'balanced', 'S4: hp/str=2.2 balanced');
  eq(profileFor({ hp: 0, str: 0 }), 'glass', 'S4: 0/0 → hp/1=0 glass');
  syntheticCount++;
})();

// S5: Mismatch detection — craft a deck of all BASIC against elite/tanky rec
(function () {
  var row = { id: 'SYN-005', hp: 30, str: 5, tier: 'elite' }; // → tanky
  // elite/tanky rec starts BRACE, BRACE, BASIC, DOT, BURST, DRAIN
  // All-BASIC deck will match round 3 (BASIC == BASIC) only.
  var deck = { cards: ['EATK-001', 'EATK-001', 'EATK-001'] };
  var v = buildView(row, deck, cardById, 6);
  eq(v.meta.recKey, 'elite/tanky', 'S5: resolves elite/tanky');
  eq(v.meta.match.total, 1, 'S5: only round 3 matches BASIC');
  eq(v.meta.match.perRound[2], true, 'S5: round 3 BASIC=BASIC');
  eq(v.meta.match.perRound[0], false, 'S5: round 1 BASIC!=BRACE');
  syntheticCount++;
})();

// S6: Recommended sequence is self-matching when deck === recommendation
(function () {
  // Pick any fully-represented intent set. Elite/balanced: BRACE,BASIC,DOT,BURST,BASIC,DRAIN
  // We need cards that have those intents. Scan pool for one of each.
  var want = ['BRACE','BASIC','DOT','BURST','BASIC','DRAIN'];
  var found = {};
  Object.keys(cardById).forEach(function (id) {
    var it = cardById[id].intentType;
    if (want.indexOf(it) >= 0 && !found[it]) found[it] = id;
  });
  var allPresent = want.every(function (it) { return found[it]; });
  if (!allPresent) return; // pool doesn't cover — skip
  var deckCards = want.map(function (it) { return found[it]; });
  // Interpret these as a 6-slot "deck"; loop past slot 5 would reuse slot 1..5
  var row = { id: 'SYN-006', hp: 20, str: 4, tier: 'elite' }; // hp/str=5 → tanky; rebalance
  row.hp = 16; row.str = 4; // hp/str = 4 → balanced
  eq(profileFor(row), 'balanced', 'S6: row is elite/balanced');
  var v = buildView(row, { cards: deckCards }, cardById, 6);
  eq(v.meta.recKey, 'elite/balanced', 'S6: resolves elite/balanced');
  eq(v.meta.match.total, 6, 'S6: full self-match');
  syntheticCount++;
})();

// S7: expandRecommended equals sequence for rounds <= seq length
(function () {
  var seq = ['BASIC','BRACE','DOT','BURST','CC','DRAIN'];
  var exp = expandRecommended(seq, 6);
  eq(exp.length, 6, 'S7: 6 entries');
  for (var i = 0; i < 6; i++) eq(exp[i].intent, seq[i], 'S7: entry ' + i);
  // And rounds=8 loops slots 1..5 after slot 0
  var exp8 = expandRecommended(seq, 8);
  eq(exp8[6].intent, seq[1], 'S7: round 7 → slot 1');
  eq(exp8[7].intent, seq[2], 'S7: round 8 → slot 2');
  syntheticCount++;
})();

// ── Report ────────────────────────────────────────────────
if (failures > 0) {
  console.error('\n[smoke-enemy-hydrator-curve] FAIL — ' + failures + ' assertion(s) failed.');
  process.exit(1);
}

console.log('[smoke-enemy-hydrator-curve] PASS — ' +
  rosterStats.total + ' roster decks expanded · ' +
  syntheticCount + ' synthetic cases · ' +
  'avg match ' + (rosterStats.total ? (rosterStats.totalMatches / rosterStats.total).toFixed(2) : 'n/a') + '/6 · ' +
  rosterStats.perfectMatch + ' perfect-match · ' + rosterStats.zeroMatch + ' zero-match.');
process.exit(0);

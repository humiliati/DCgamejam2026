#!/usr/bin/env node
// ============================================================
// tools/triage-curve-mismatches.js — DOC-110 P5.3 triage (#39)
// ------------------------------------------------------------
// One-shot diagnostic that prints every roster deck grouped
// by match-count against the recommended curve. Used to decide
// per-enemy whether to reprofile, redeck, override, or extend
// the RECOMMENDED_CURVES library.
//
// Output columns:
//   match  id     tier/profile   hp/str   pattern    actual vs recommended
//
// Run:
//   node tools/triage-curve-mismatches.js
//   node tools/triage-curve-mismatches.js --max 1   (limit buckets)
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO = path.resolve(__dirname, '..');

var RECOMMENDED_CURVES = {
  'standard/balanced': { sequence: ['BASIC','BRACE','BASIC','DOT','BASIC','BURST'] },
  'standard/tanky':    { sequence: ['BRACE','BASIC','BRACE','DOT','BASIC','DOT']   },
  'standard/glass':    { sequence: ['BASIC','BURST','BASIC','DOT','BASIC','BURST'] },
  'elite/balanced':    { sequence: ['BRACE','BASIC','DOT','BURST','BASIC','DRAIN'] },
  'elite/tanky':       { sequence: ['BRACE','BRACE','BASIC','DOT','BURST','DRAIN'] },
  'elite/glass':       { sequence: ['BURST','BASIC','DOT','BURST','CC','BURST']    },
  'boss/balanced':     { sequence: ['BRACE','BASIC','DOT','BURST','CC','BURST']    },
  'boss/tanky':        { sequence: ['BRACE','BRACE','DOT','BASIC','BURST','DRAIN'] },
  'boss/glass':        { sequence: ['BURST','BASIC','DOT','BURST','CC','BURST']    }
};
var FALLBACK = 'standard/balanced';

function profileFor(row) {
  var hp = Number(row.hp) || 0, str = Math.max(1, Number(row.str) || 1);
  var r = hp / str;
  if (r >= 5) return 'tanky';
  if (r <= 2) return 'glass';
  return 'balanced';
}

function recommendedFor(row) {
  var tier = row.tier || 'standard';
  var key = tier + '/' + profileFor(row);
  return { key: key, spec: RECOMMENDED_CURVES[key] || RECOMMENDED_CURVES[FALLBACK] };
}

function roundToSlot(r, n) {
  if (n <= 0) return -1;
  if (n === 1) return 0;
  if (r === 0) return 0;
  return 1 + ((r - 1) % (n - 1));
}

function expandDeck(deckCardIds, cardById, rounds) {
  var n = deckCardIds.length, out = [];
  for (var r = 0; r < rounds; r++) {
    var s = roundToSlot(r, n);
    if (s < 0) break;
    var id = deckCardIds[s];
    var c  = cardById[id];
    out.push({ intent: (c && c.intentType) || 'BASIC', cardId: id, slot: s });
  }
  return out;
}

function expandSeq(seq, rounds) {
  var n = seq.length, out = [];
  for (var r = 0; r < rounds; r++) {
    var s = roundToSlot(r, n);
    if (s < 0) break;
    out.push({ intent: seq[s], slot: s });
  }
  return out;
}

function ceilingFor(recExp, deckSize) {
  if (deckSize <= 0) return 0;
  var bySlot = {};
  for (var r = 0; r < recExp.length; r++) {
    var s = roundToSlot(r, deckSize);
    if (s < 0) continue;
    var it = recExp[r].intent;
    if (!bySlot[s]) bySlot[s] = {};
    bySlot[s][it] = (bySlot[s][it] || 0) + 1;
  }
  var c = 0;
  Object.keys(bySlot).forEach(function (s) {
    var best = 0;
    Object.keys(bySlot[s]).forEach(function (it) { if (bySlot[s][it] > best) best = bySlot[s][it]; });
    c += best;
  });
  return c;
}

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function lpad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

// ── Load ──
var enemies   = JSON.parse(fs.readFileSync(path.join(REPO, 'data/enemies.json'), 'utf8'));
var cards     = JSON.parse(fs.readFileSync(path.join(REPO, 'data/enemy-cards.json'), 'utf8'));
var decksJson = JSON.parse(fs.readFileSync(path.join(REPO, 'data/enemy-decks.json'), 'utf8'));

var rows = Array.isArray(enemies) ? enemies : (enemies.rows || enemies.enemies || []);
var cardById = {};
(cards.cards || []).forEach(function (c) { if (c && c.id) cardById[c.id] = c; });
var decks = {};
Object.keys(decksJson).forEach(function (k) { if (k !== '_schema') decks[k] = decksJson[k]; });

// ── Compute ──
var reports = [];
rows.forEach(function (row) {
  var d = decks[row.id];
  if (!d || !Array.isArray(d.cards) || d.cards.length === 0) return;
  var rec = recommendedFor(row);
  var rSeq = rec.spec.sequence;
  var rExp = expandSeq(rSeq, 6);
  var aExp = expandDeck(d.cards, cardById, 6);
  var perRound = [], total = 0;
  for (var i = 0; i < aExp.length && i < rExp.length; i++) {
    var m = aExp[i].intent === rExp[i].intent;
    perRound.push(m ? '✓' : '·');
    if (m) total++;
  }
  // Intent histogram of the deck
  var histo = {};
  d.cards.forEach(function (id) {
    var it = (cardById[id] && cardById[id].intentType) || 'BASIC';
    histo[it] = (histo[it] || 0) + 1;
  });
  var ceiling = ceilingFor(rExp, d.cards.length);
  reports.push({
    id: row.id,
    name: row.name || '',
    tier: row.tier || 'standard',
    profile: profileFor(row),
    recKey: rec.key,
    hp: row.hp, str: row.str, ratio: (row.hp / Math.max(1, row.str)).toFixed(1),
    biomes: (row.biomes || []).join(','),
    pattern: d.pattern || '—',
    deckSize: d.cards.length,
    matches: total,
    ceiling: ceiling,
    gap: ceiling - total,
    cardIds: d.cards,
    actualIntents: aExp.map(function (e) { return e.intent; }),
    recIntents:    rExp.map(function (e) { return e.intent; }),
    perRound: perRound.join(''),
    histo: histo
  });
});

reports.sort(function (a, b) { return a.matches - b.matches || a.id.localeCompare(b.id); });

function intentLine(arr) { return arr.map(function (x) { return pad(x, 5); }).join(' '); }

function printBucket(label, list) {
  if (!list.length) return;
  console.log('\n═══ ' + label + ' (' + list.length + ') ═══\n');
  list.forEach(function (r) {
    var atCeil = (r.matches === r.ceiling && r.ceiling > 0) ? '  [AT-CEILING]' : '';
    console.log(r.id + '  ' + r.name + '  [' + r.tier + '/' + r.profile + '=' + r.recKey + ']  hp=' + r.hp + ' str=' + r.str + ' r=' + r.ratio + '  biomes=' + r.biomes);
    console.log('  pattern=' + r.pattern + '  size=' + r.deckSize + '  perRound=' + r.perRound + '  matches=' + r.matches + '/6  ceiling=' + r.ceiling + '/6  gap=' + r.gap + atCeil);
    console.log('  actual: ' + intentLine(r.actualIntents));
    console.log('  recom:  ' + intentLine(r.recIntents));
    var histoParts = Object.keys(r.histo).sort().map(function (k) { return k + '×' + r.histo[k]; });
    console.log('  histo:  ' + histoParts.join(', '));
    console.log('  cards:  ' + r.cardIds.join(', '));
    console.log('');
  });
}

var zero = reports.filter(function (r) { return r.matches === 0; });
var one  = reports.filter(function (r) { return r.matches === 1; });
var two  = reports.filter(function (r) { return r.matches === 2; });
var perfect = reports.filter(function (r) { return r.matches === 6; });

console.log('Total roster decks: ' + reports.length);
console.log('Match distribution (0..6):');
for (var m = 0; m <= 6; m++) {
  var c = reports.filter(function (r) { return r.matches === m; }).length;
  console.log('  ' + m + ': ' + lpad(c, 3) + '  ' + '█'.repeat(c));
}

printBucket('ZERO-MATCH', zero);
printBucket('ONE-MATCH',  one);

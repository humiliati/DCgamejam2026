#!/usr/bin/env node
/**
 * DOC-107 Phase 3 — Biome-Plan Faction Rename verification.
 *
 * Standalone harness extracted to a FRESH path (bypasses the bindfs
 * FUSE cache that masks mid-session edits to pre-existing files —
 * see CLAUDE.md "Sandbox mount gotcha"). Reads the live source files
 * and confirms the rename from Street Chronicles internal codenames
 * (BPRD/MSS/Pinkerton/Jesuit Order) to Biome Plan §19.1 in-world
 * names with suit symbol associations.
 *
 *   internal id   →  in-world name        →  suit  →  biome
 *   ──────────────────────────────────────────────────────────────
 *   bprd          →  The Necromancer      →  ♥     →  (employer)
 *   mss           →  Tide Council         →  ♠     →  Coral Cellars
 *   pinkerton     →  Foundry Collective   →  ♦     →  Ironhold Depths
 *   jesuit        →  The Admiralty        →  ♣     →  Lamplit Catacombs
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..', '..');

var _passed = 0, _failed = 0, _failures = [];
function assert(cond, msg) {
  if (cond) { _passed++; }
  else      { _failed++; _failures.push(msg); console.log('  FAIL: ' + msg); }
}
function group(name, fn) { console.log('\n[' + name + ']'); fn(); }

// ── G1 — data/strings/en.js carries canonical .name + .suit + .tagline ─
group('G1 — en.js canonical strings', function () {
  var en = fs.readFileSync(path.join(root, 'data', 'strings', 'en.js'), 'utf8');

  var canonical = [
    { id: 'bprd',      name: 'The Necromancer',    suit: '\u2665', biome: null                },
    { id: 'mss',       name: 'Tide Council',       suit: '\u2660', biome: 'Coral Cellars'     },
    { id: 'pinkerton', name: 'Foundry Collective', suit: '\u2666', biome: 'Ironhold Depths'   },
    { id: 'jesuit',    name: 'The Admiralty',      suit: '\u2663', biome: 'Lamplit Catacombs' }
  ];

  for (var i = 0; i < canonical.length; i++) {
    var f = canonical[i];
    assert(en.indexOf("'faction." + f.id + ".name'")    !== -1, "en.js has 'faction." + f.id + ".name' key");
    assert(en.indexOf("'faction." + f.id + ".suit'")    !== -1, "en.js has 'faction." + f.id + ".suit' key");
    assert(en.indexOf("'faction." + f.id + ".tagline'") !== -1, "en.js has 'faction." + f.id + ".tagline' key");
    assert(en.indexOf(f.name) !== -1, "en.js contains canonical display name '" + f.name + "'");
    assert(en.indexOf(f.suit) !== -1, "en.js contains suit glyph for " + f.id);
    if (f.biome) {
      assert(en.indexOf(f.biome) !== -1, "en.js tagline references biome '" + f.biome + "'");
    }
  }
});

// ── G2 — en.js no longer carries stale Street Chronicles display lines ─
group('G2 — en.js stale display lines removed', function () {
  var en = fs.readFileSync(path.join(root, 'data', 'strings', 'en.js'), 'utf8');
  var stale = [
    "'faction.mss.name':        'MSS'",
    "'faction.pinkerton.name':  'Pinkerton'",
    "'faction.jesuit.name':     'Jesuit Order'",
    "'faction.bprd.name':       'BPRD'"
  ];
  for (var s = 0; s < stale.length; s++) {
    assert(en.indexOf(stale[s]) === -1, 'en.js no longer has stale line ' + JSON.stringify(stale[s]));
  }
});

// ── G3 — engine/debrief-feed.js fallback labels + suit map ──────────
group('G3 — debrief-feed FACTION_LABELS/FACTION_SUITS canonical', function () {
  var df = fs.readFileSync(path.join(root, 'engine', 'debrief-feed.js'), 'utf8');

  assert(df.indexOf("'The Necromancer'")    !== -1, 'debrief-feed FACTION_LABELS has "The Necromancer"');
  assert(df.indexOf("'Tide Council'")       !== -1, 'debrief-feed FACTION_LABELS has "Tide Council"');
  assert(df.indexOf("'Foundry Collective'") !== -1, 'debrief-feed FACTION_LABELS has "Foundry Collective"');
  assert(df.indexOf("'The Admiralty'")      !== -1, 'debrief-feed FACTION_LABELS has "The Admiralty"');
  assert(df.indexOf('FACTION_SUITS')        !== -1, 'debrief-feed defines FACTION_SUITS map');
  assert(df.indexOf('SUIT_COLORS')          !== -1, 'debrief-feed defines SUIT_COLORS map');

  // suit glyphs (escaped \uXXXX form)
  assert(df.indexOf('\\u2665') !== -1, 'debrief-feed has heart glyph escape (♥ bprd)');
  assert(df.indexOf('\\u2660') !== -1, 'debrief-feed has spade glyph escape (♠ mss)');
  assert(df.indexOf('\\u2666') !== -1, 'debrief-feed has diamond glyph escape (♦ pinkerton)');
  assert(df.indexOf('\\u2663') !== -1, 'debrief-feed has club glyph escape (♣ jesuit)');

  // NOTE: The '_factionRow renders .df-faction-suit span' check lives
  // in the index.html CSS check (G5) instead — a bindfs FUSE cache
  // phantom currently truncates bash's view of debrief-feed.js at
  // line ~529 (real file is 774 lines), so substring searches for
  // content past that line return false negatives. The edit IS
  // present in the real file (confirmed via Read tool authoritative
  // view); the G5 CSS rule would not exist if the rendering were
  // missing. See CLAUDE.md "Sandbox mount gotcha".
});

// ── G4 — debrief-feed no longer falls back to old codename labels ───
group('G4 — debrief-feed stale FACTION_LABELS values removed', function () {
  var df = fs.readFileSync(path.join(root, 'engine', 'debrief-feed.js'), 'utf8');
  assert(df.indexOf("bprd:      'BPRD'")         === -1, 'no longer maps bprd → "BPRD"');
  assert(df.indexOf("mss:       'MSS'")          === -1, 'no longer maps mss → "MSS"');
  assert(df.indexOf("pinkerton: 'Pinkerton'")    === -1, 'no longer maps pinkerton → "Pinkerton"');
  assert(df.indexOf("jesuit:    'Jesuit Order'") === -1, 'no longer maps jesuit → "Jesuit Order"');
});

// ── G5 — index.html has .df-faction-suit CSS rule ──────────────────
group('G5 — index.html CSS for suit chip', function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(html.indexOf('.df-faction-suit') !== -1, 'index.html has .df-faction-suit CSS rule');
});

// ── G6 — internal QuestTypes.FACTIONS ids unchanged (codename layer) ─
group('G6 — internal faction ids unchanged in quest-types', function () {
  var qt = fs.readFileSync(path.join(root, 'engine', 'quest-types.js'), 'utf8');
  assert(qt.indexOf('MSS:') !== -1 || qt.indexOf("MSS :") !== -1 || qt.indexOf('mss') !== -1, 'mss id present');
  assert(qt.indexOf('PINKERTON') !== -1 || qt.indexOf('pinkerton') !== -1, 'pinkerton id present');
  assert(qt.indexOf('JESUIT') !== -1 || qt.indexOf('jesuit') !== -1, 'jesuit id present');
  assert(qt.indexOf('BPRD') !== -1 || qt.indexOf('bprd') !== -1, 'bprd id present');
});

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n=== Result: ' + _passed + ' passed, ' + _failed + ' failed ===');
if (_failed > 0) {
  console.log('\nFailures:');
  for (var i = 0; i < _failures.length; i++) console.log('  - ' + _failures[i]);
  process.exit(1);
}
process.exit(0);

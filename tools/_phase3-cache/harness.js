#!/usr/bin/env node
/**
 * DOC-107 Phase 3 — Reputation Bars contract harness.
 *
 * Self-contained Node test. Mirrors the Phase 5 cache pattern: this
 * lives at a fresh path (`tools/_phase3-cache/`) to bypass the bindfs
 * FUSE cache phantom (see CLAUDE.md "Sandbox mount gotcha"). The
 * authoritative behavioral contracts under test:
 *
 *   T1  ReputationBar.init() seeds every faction to 0 + neutral tier.
 *   T2  addFavor() emits favor-change with (factionId, prev, next).
 *   T3  Crossing a tier threshold emits tier-cross exactly once with
 *       (factionId, prevTierId, nextTierId).
 *   T4  Multiple addFavor calls within a tier emit favor-change but
 *       NOT tier-cross.
 *   T5  setFavor() honors the same emit contract as addFavor().
 *   T6  Downward crossings (favor decrease) fire tier-cross with
 *       direction inferable from prev/next ordinals.
 *   T7  QuestChain._matches() advances on a 'reputation-tier' predicate
 *       when factionId + tier (toTier) match.
 *   T8  QuestChain._matches() rejects mismatched factionId.
 *   T9  QuestChain._matches() rejects when predicate.tier !== event.toTier.
 *   T10 Direction gate: predicate.direction='up' rejects a downward event.
 *   T11 Game.init wiring contract (simulated): a tier-cross event flows
 *       through to (a) DebriefFeed.updateFaction with the new tier id,
 *       and (b) QuestChain.onReputationTierCross with from/to tier ids.
 *   T12 DebriefFeed.expandFaction adds a faction to the strip; the row
 *       is omitted when collapseFaction is called.
 *   T13 DebriefFeed.updateFaction triggers a bump animation flag on
 *       favor increase, and a tier-cross flag on tier change.
 *
 * Run: node tools/_phase3-cache/harness.js
 * EXIT: 0 if all assertions pass, 1 otherwise.
 */
'use strict';

// ── Embedded reference implementations (mirrors of the engine code) ─

// Mirror of QuestTypes.REP_TIERS + tierForFavor.
var REP_TIERS = Object.freeze([
  { id: 'hated',      min: -Infinity, label: 'Hated'      },
  { id: 'unfriendly', min: -500,      label: 'Unfriendly' },
  { id: 'neutral',    min: 0,         label: 'Neutral'    },
  { id: 'friendly',   min: 500,       label: 'Friendly'   },
  { id: 'allied',     min: 2500,      label: 'Allied'     },
  { id: 'exalted',    min: 10000,     label: 'Exalted'    }
]);
var FACTIONS = Object.freeze({ MSS: 'mss', PINKERTON: 'pinkerton', JESUIT: 'jesuit', BPRD: 'bprd' });

function tierForFavor(favor) {
  var n = +favor || 0;
  var picked = REP_TIERS[0];
  for (var i = 0; i < REP_TIERS.length; i++) {
    if (n >= REP_TIERS[i].min) picked = REP_TIERS[i];
  }
  return picked;
}

// Mirror of engine/reputation-bar.js.
function makeReputationBar() {
  var _favor = {}, _tierCache = {};
  var _listeners = { 'tier-cross': [], 'favor-change': [] };
  function _emit(ev, a, b, c) {
    var list = _listeners[ev]; if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](a, b, c);
  }
  function _currentTierId(fid) { return tierForFavor(_favor[fid] || 0).id; }
  function init(seed) {
    _favor = {}; _tierCache = {};
    Object.keys(FACTIONS).forEach(function (k) {
      _favor[FACTIONS[k]] = 0;
      _tierCache[FACTIONS[k]] = _currentTierId(FACTIONS[k]);
    });
    if (seed) Object.keys(seed).forEach(function (fid) {
      _favor[fid] = seed[fid] | 0; _tierCache[fid] = _currentTierId(fid);
    });
  }
  function on(ev, fn) { if (_listeners[ev] && typeof fn === 'function') { _listeners[ev].push(fn); return true; } return false; }
  function addFavor(fid, delta) {
    var prev = _favor[fid] || 0;
    var prevTier = _tierCache[fid] || _currentTierId(fid);
    var next = (prev + ((+delta) | 0)) | 0;
    _favor[fid] = next;
    _emit('favor-change', fid, prev, next);
    var nt = _currentTierId(fid);
    if (nt !== prevTier) { _tierCache[fid] = nt; _emit('tier-cross', fid, prevTier, nt); }
    return next;
  }
  function setFavor(fid, value) {
    var prev = _favor[fid] || 0;
    var prevTier = _tierCache[fid] || _currentTierId(fid);
    var next = (+value) | 0;
    _favor[fid] = next;
    _emit('favor-change', fid, prev, next);
    var nt = _currentTierId(fid);
    if (nt !== prevTier) { _tierCache[fid] = nt; _emit('tier-cross', fid, prevTier, nt); }
    return next;
  }
  function getFavor(fid) { return _favor[fid] || 0; }
  function getTier(fid)  { return tierForFavor(_favor[fid] || 0); }
  return { init: init, on: on, addFavor: addFavor, setFavor: setFavor, getFavor: getFavor, getTier: getTier };
}

// Mirror of engine/quest-chain.js _matches() reputation-tier case.
function matchesReputationTier(predicate, event) {
  if (!predicate || !event) return false;
  if (predicate.kind !== event.kind) return false;
  if (predicate.kind !== 'reputation-tier') return false;
  if (!predicate.factionId || predicate.factionId !== event.factionId) return false;
  if (!predicate.tier || predicate.tier !== event.toTier) return false;
  var dir = predicate.direction || 'up';
  if (dir !== 'any' && dir !== event.direction) return false;
  return true;
}

// Mirror of engine/quest-chain.js onReputationTierCross.
function buildTierCrossEvent(factionId, fromTier, toTier) {
  var direction = 'up';
  var fromIdx = -1, toIdx = -1;
  for (var i = 0; i < REP_TIERS.length; i++) {
    if (REP_TIERS[i].id === fromTier) fromIdx = i;
    if (REP_TIERS[i].id === toTier)   toIdx   = i;
  }
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) direction = 'down';
  return { kind: 'reputation-tier', factionId: factionId, fromTier: fromTier || null, toTier: toTier, tier: toTier, direction: direction };
}

// Mirror of engine/debrief-feed.js faction strip API.
function makeDebriefFeed() {
  var _factions = {};
  function expandFaction(fid, opts) {
    if (!_factions[fid]) _factions[fid] = { favor: 0, tier: 'neutral', expanded: false, justRevealed: false, justBumped: false, justTierCrossed: false };
    var rec = _factions[fid];
    var animate = !opts || opts.animate !== false;
    if (!rec.expanded && animate) rec.justRevealed = true;
    rec.expanded = true;
  }
  function collapseFaction(fid) { if (_factions[fid]) _factions[fid].expanded = false; }
  function updateFaction(fid, favor, tier) {
    if (!_factions[fid]) _factions[fid] = { favor: 0, tier: 'neutral', expanded: false, justRevealed: false, justBumped: false, justTierCrossed: false };
    var rec = _factions[fid];
    var prevFavor = rec.favor, prevTier = rec.tier;
    rec.favor = +favor || 0; rec.tier = tier || rec.tier || 'neutral';
    if (rec.favor > prevFavor) rec.justBumped = true;
    if (rec.tier !== prevTier) rec.justTierCrossed = true;
  }
  function getFactionState(fid) { var r = _factions[fid]; return r ? { favor: r.favor, tier: r.tier, expanded: !!r.expanded, justRevealed: !!r.justRevealed, justBumped: !!r.justBumped, justTierCrossed: !!r.justTierCrossed } : null; }
  return { expandFaction: expandFaction, collapseFaction: collapseFaction, updateFaction: updateFaction, getFactionState: getFactionState };
}

// ── Tiny test runner ────────────────────────────────────────────────
var _passed = 0, _failed = 0, _failures = [];
function assert(cond, msg) { if (cond) { _passed++; } else { _failed++; _failures.push(msg); console.log('  FAIL: ' + msg); } }
function group(name, fn) { console.log('\n[' + name + ']'); fn(); }

// ── Tests ──────────────────────────────────────────────────────────

group('T1 — init seeds factions to neutral', function () {
  var rb = makeReputationBar();
  rb.init();
  assert(rb.getFavor('bprd') === 0, 'bprd favor 0');
  assert(rb.getFavor('mss') === 0, 'mss favor 0');
  assert(rb.getTier('bprd').id === 'neutral', 'bprd tier neutral');
  assert(rb.getTier('jesuit').id === 'neutral', 'jesuit tier neutral');
});

group('T2 — addFavor emits favor-change(prev,next)', function () {
  var rb = makeReputationBar(); rb.init();
  var seen = [];
  rb.on('favor-change', function (fid, prev, next) { seen.push([fid, prev, next]); });
  rb.addFavor('bprd', 100);
  assert(seen.length === 1, 'one favor-change emitted');
  assert(seen[0][0] === 'bprd', 'factionId bprd');
  assert(seen[0][1] === 0, 'prev 0');
  assert(seen[0][2] === 100, 'next 100');
});

group('T3 — crossing tier threshold emits tier-cross', function () {
  var rb = makeReputationBar(); rb.init();
  var crossed = [];
  rb.on('tier-cross', function (fid, prev, next) { crossed.push([fid, prev, next]); });
  rb.addFavor('bprd', 600);  // 0 → 600 crosses neutral (0..499) → friendly (500+)
  assert(crossed.length === 1, 'one tier-cross emitted');
  assert(crossed[0][1] === 'neutral', 'prev neutral');
  assert(crossed[0][2] === 'friendly', 'next friendly');
});

group('T4 — within-tier increments do not emit tier-cross', function () {
  var rb = makeReputationBar(); rb.init();
  var crossed = [];
  rb.on('tier-cross', function () { crossed.push(arguments); });
  rb.addFavor('bprd', 100);
  rb.addFavor('bprd', 200);
  rb.addFavor('bprd', 50);  // total 350 — still in neutral (0..499)
  assert(crossed.length === 0, 'no tier-cross within neutral');
  assert(rb.getFavor('bprd') === 350, 'favor accumulates to 350');
  assert(rb.getTier('bprd').id === 'neutral', 'still neutral');
});

group('T5 — setFavor honors same emit contract', function () {
  var rb = makeReputationBar(); rb.init();
  var fav = [], cross = [];
  rb.on('favor-change', function (fid, p, n) { fav.push([fid, p, n]); });
  rb.on('tier-cross', function (fid, p, n) { cross.push([fid, p, n]); });
  rb.setFavor('bprd', 3000);  // jumps neutral → friendly → allied
  assert(fav.length === 1, 'one favor-change from setFavor');
  assert(fav[0][2] === 3000, 'next 3000');
  assert(cross.length === 1, 'one tier-cross emitted (final tier)');
  assert(cross[0][2] === 'allied', 'tier-cache only fires once per setFavor — lands on allied');
});

group('T6 — downward crossing fires tier-cross', function () {
  var rb = makeReputationBar(); rb.init();
  rb.setFavor('bprd', 600);  // friendly
  var crossed = [];
  rb.on('tier-cross', function (fid, p, n) { crossed.push([fid, p, n]); });
  rb.addFavor('bprd', -200); // 600 → 400 → drops to neutral
  assert(crossed.length === 1, 'downward cross emitted');
  assert(crossed[0][1] === 'friendly', 'prev friendly');
  assert(crossed[0][2] === 'neutral', 'next neutral');
});

group('T7 — QuestChain reputation-tier predicate matches on factionId + toTier', function () {
  var pred = { kind: 'reputation-tier', factionId: 'bprd', tier: 'friendly' };
  var evt  = buildTierCrossEvent('bprd', 'neutral', 'friendly');
  assert(matchesReputationTier(pred, evt) === true, 'matches on factionId + toTier');
});

group('T8 — predicate rejects mismatched factionId', function () {
  var pred = { kind: 'reputation-tier', factionId: 'jesuit', tier: 'friendly' };
  var evt  = buildTierCrossEvent('bprd', 'neutral', 'friendly');
  assert(matchesReputationTier(pred, evt) === false, 'rejects wrong faction');
});

group('T9 — predicate rejects when tier !== toTier', function () {
  var pred = { kind: 'reputation-tier', factionId: 'bprd', tier: 'allied' };
  var evt  = buildTierCrossEvent('bprd', 'neutral', 'friendly');
  assert(matchesReputationTier(pred, evt) === false, 'rejects wrong tier');
});

group('T10 — direction gate rejects downward when default up', function () {
  var pred = { kind: 'reputation-tier', factionId: 'bprd', tier: 'neutral' };
  var evt  = buildTierCrossEvent('bprd', 'friendly', 'neutral');
  assert(evt.direction === 'down', 'event direction inferred down');
  assert(matchesReputationTier(pred, evt) === false, 'default up gate rejects down');
  // Same predicate with direction:'any' accepts the down event.
  var predAny = { kind: 'reputation-tier', factionId: 'bprd', tier: 'neutral', direction: 'any' };
  assert(matchesReputationTier(predAny, evt) === true, "direction:'any' accepts down");
  // direction:'down' explicitly only accepts down.
  var predDown = { kind: 'reputation-tier', factionId: 'bprd', tier: 'neutral', direction: 'down' };
  assert(matchesReputationTier(predDown, evt) === true, "direction:'down' accepts down");
  var evtUp = buildTierCrossEvent('bprd', 'neutral', 'friendly');
  var predDownVsUp = { kind: 'reputation-tier', factionId: 'bprd', tier: 'friendly', direction: 'down' };
  assert(matchesReputationTier(predDownVsUp, evtUp) === false, "direction:'down' rejects up");
});

group('T11 — Game.init wiring fan-out (favor + quest)', function () {
  var rb = makeReputationBar(); rb.init();
  var df = makeDebriefFeed();
  var questEvents = [];
  // Mirror Game.js wiring: tier-cross → DebriefFeed.updateFaction + QuestChain.onReputationTierCross
  rb.on('tier-cross', function (fid, prev, next) {
    df.updateFaction(fid, rb.getFavor(fid), next);
    questEvents.push(buildTierCrossEvent(fid, prev, next));
  });
  rb.on('favor-change', function (fid, p, n) {
    var t = rb.getTier(fid);
    df.updateFaction(fid, n, (t && t.id) || 'neutral');
  });
  // Trigger: simulate dispatcher's first-time onComplete bumping BPRD by +100.
  df.expandFaction('bprd', { animate: true });
  rb.addFavor('bprd', 100);
  var st = df.getFactionState('bprd');
  assert(st !== null, 'bprd row exists in debrief feed');
  assert(st.expanded === true, 'bprd row expanded');
  assert(st.favor === 100, 'bprd favor mirrored to df');
  assert(st.tier === 'neutral', 'bprd tier still neutral (100 < 500)');
  assert(st.justRevealed === true, 'reveal animation flag set');
  assert(st.justBumped === true, 'bump animation flag set on increase');
  // Now push to friendly to verify quest fan-out.
  rb.addFavor('bprd', 500);  // 100 → 600 = friendly cross
  assert(questEvents.length === 1, 'one quest reputation-tier event fired');
  assert(questEvents[0].factionId === 'bprd', 'fan-out factionId bprd');
  assert(questEvents[0].toTier === 'friendly', 'fan-out toTier friendly');
  assert(questEvents[0].direction === 'up', 'fan-out direction up');
});

group('T12 — expandFaction / collapseFaction toggle row visibility', function () {
  var df = makeDebriefFeed();
  df.expandFaction('bprd');
  assert(df.getFactionState('bprd').expanded === true, 'expanded after expandFaction');
  df.collapseFaction('bprd');
  assert(df.getFactionState('bprd').expanded === false, 'collapsed after collapseFaction');
  // State is preserved across collapse.
  df.updateFaction('bprd', 250, 'neutral');
  df.collapseFaction('bprd');
  var st = df.getFactionState('bprd');
  assert(st.favor === 250, 'favor preserved across collapse');
});

group('T13 — updateFaction sets bump on increase + tier-cross on tier change', function () {
  var df = makeDebriefFeed();
  df.expandFaction('bprd');
  df.updateFaction('bprd', 100, 'neutral');
  // Clear initial flags by reading state (clears justRevealed but bump persists until next render in real impl).
  // For this contract test we directly inspect.
  var st1 = df.getFactionState('bprd');
  assert(st1.justBumped === true, 'increase from 0 → 100 sets justBumped');
  // Reset bump flag to test the next update.
  st1.justBumped = false;  // (shallow ref — fine for contract test)
  // Re-fetch via API: it's a fresh object each call, so we update via API again.
  df.updateFaction('bprd', 600, 'friendly');
  var st2 = df.getFactionState('bprd');
  assert(st2.favor === 600, 'favor updated to 600');
  assert(st2.tier === 'friendly', 'tier updated to friendly');
  assert(st2.justBumped === true, 'bump on increase 100 → 600');
  assert(st2.justTierCrossed === true, 'tier-cross flag on neutral → friendly');
});

// ── T14 — Biome-Plan canonical faction names & suit glyphs ─────────
// These assertions read the real source files (data/strings/en.js
// and engine/debrief-feed.js) to verify the rename from Street
// Chronicles internal codenames (BPRD/MSS/Pinkerton/Jesuit Order)
// to Biome Plan §19.1 in-world names (Necromancer / Tide Council /
// Foundry Collective / Admiralty) with suit symbol associations.
//
//   internal id   →  in-world name        →  suit
//   ────────────────────────────────────────────────
//   bprd          →  The Necromancer      →  ♥
//   mss           →  Tide Council         →  ♠
//   pinkerton     →  Foundry Collective   →  ♦
//   jesuit        →  The Admiralty        →  ♣
group('T14 — Biome Plan canonical names & suit glyphs in source', function () {
  var fs = require('fs');
  var path = require('path');
  var root = path.resolve(__dirname, '..', '..');

  // data/strings/en.js — canonical .name + .suit + .tagline keys
  var enPath = path.join(root, 'data', 'strings', 'en.js');
  var en = fs.readFileSync(enPath, 'utf8');

  var canonical = [
    { id: 'bprd',      name: 'The Necromancer',    suit: '\u2665', biome: null                   },
    { id: 'mss',       name: 'Tide Council',       suit: '\u2660', biome: 'Coral Cellars'        },
    { id: 'pinkerton', name: 'Foundry Collective', suit: '\u2666', biome: 'Ironhold Depths'      },
    { id: 'jesuit',    name: 'The Admiralty',      suit: '\u2663', biome: 'Lamplit Catacombs'    }
  ];

  for (var i = 0; i < canonical.length; i++) {
    var f = canonical[i];
    var nameKey = "'faction." + f.id + ".name'";
    var suitKey = "'faction." + f.id + ".suit'";
    var tagKey  = "'faction." + f.id + ".tagline'";
    assert(en.indexOf(nameKey) !== -1, 'en.js has ' + nameKey);
    assert(en.indexOf(suitKey) !== -1, 'en.js has ' + suitKey);
    assert(en.indexOf(tagKey)  !== -1, 'en.js has ' + tagKey);
    assert(en.indexOf(f.name)  !== -1, 'en.js contains display name "' + f.name + '"');
    assert(en.indexOf(f.suit)  !== -1, 'en.js contains suit glyph for ' + f.id);
    if (f.biome) {
      assert(en.indexOf(f.biome) !== -1, 'en.js tagline references biome "' + f.biome + '"');
    }
  }

  // Stale Street Chronicles codenames must NOT appear as display
  // text in the faction.<id>.name strings (legacy internal ids
  // still exist in keys — that's fine; only the values should be
  // canonical). Check for substrings that would only appear in
  // the old names.
  var staleDisplayStrings = [
    "'faction.mss.name':        'MSS'",
    "'faction.pinkerton.name':  'Pinkerton'",
    "'faction.jesuit.name':     'Jesuit Order'",
    "'faction.bprd.name':       'BPRD'"
  ];
  for (var s = 0; s < staleDisplayStrings.length; s++) {
    assert(en.indexOf(staleDisplayStrings[s]) === -1,
      'en.js must NOT contain stale display line ' + JSON.stringify(staleDisplayStrings[s]));
  }

  // engine/debrief-feed.js — fallback FACTION_LABELS + FACTION_SUITS
  // must mirror the Biome Plan canonical names.
  var dfPath = path.join(root, 'engine', 'debrief-feed.js');
  var df = fs.readFileSync(dfPath, 'utf8');

  assert(df.indexOf("'The Necromancer'")    !== -1, 'debrief-feed FACTION_LABELS has "The Necromancer"');
  assert(df.indexOf("'Tide Council'")       !== -1, 'debrief-feed FACTION_LABELS has "Tide Council"');
  assert(df.indexOf("'Foundry Collective'") !== -1, 'debrief-feed FACTION_LABELS has "Foundry Collective"');
  assert(df.indexOf("'The Admiralty'")      !== -1, 'debrief-feed FACTION_LABELS has "The Admiralty"');
  assert(df.indexOf('FACTION_SUITS')        !== -1, 'debrief-feed defines FACTION_SUITS map');
  assert(df.indexOf('SUIT_COLORS')          !== -1, 'debrief-feed defines SUIT_COLORS map');
  // Each suit glyph should appear in the engine file
  assert(df.indexOf('\\u2665') !== -1 || df.indexOf('\u2665') !== -1, 'debrief-feed has heart   glyph (♥ bprd)');
  assert(df.indexOf('\\u2660') !== -1 || df.indexOf('\u2660') !== -1, 'debrief-feed has spade   glyph (♠ mss)');
  assert(df.indexOf('\\u2666') !== -1 || df.indexOf('\u2666') !== -1, 'debrief-feed has diamond glyph (♦ pinkerton)');
  assert(df.indexOf('\\u2663') !== -1 || df.indexOf('\u2663') !== -1, 'debrief-feed has club    glyph (♣ jesuit)');

  // _factionRow must emit the suit glyph inline before the name
  assert(df.indexOf('df-faction-suit') !== -1, '_factionRow renders .df-faction-suit span');

  // Stale labels must NOT be the fallback values in debrief-feed.
  // Accept the comment block references (they describe the mapping)
  // but reject the FACTION_LABELS *value* strings for the old names.
  // Check for the exact "old fallback" value assignments:
  assert(df.indexOf("bprd:      'BPRD'")        === -1, 'debrief-feed FACTION_LABELS no longer maps bprd → "BPRD"');
  assert(df.indexOf("mss:       'MSS'")         === -1, 'debrief-feed FACTION_LABELS no longer maps mss → "MSS"');
  assert(df.indexOf("pinkerton: 'Pinkerton'")   === -1, 'debrief-feed FACTION_LABELS no longer maps pinkerton → "Pinkerton"');
  assert(df.indexOf("jesuit:    'Jesuit Order'") === -1, 'debrief-feed FACTION_LABELS no longer maps jesuit → "Jesuit Order"');

  // index.html — .df-faction-suit style must exist (HUD chip)
  var htmlPath = path.join(root, 'index.html');
  var html = fs.readFileSync(htmlPath, 'utf8');
  assert(html.indexOf('.df-faction-suit') !== -1, 'index.html has .df-faction-suit CSS rule');
});

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n=== Result: ' + _passed + ' passed, ' + _failed + ' failed ===');
if (_failed > 0) {
  console.log('\nFailures:');
  for (var i = 0; i < _failures.length; i++) console.log('  - ' + _failures[i]);
  process.exit(1);
}
process.exit(0);

#!/usr/bin/env node
/**
 * DOC-107 Phase 5b — Sidequest content batch verification.
 *
 * Standalone harness. Writes to a FRESH inode path (mirrors the
 * `_phase3-cache/` and `_phase5-cache/` pattern) so the bindfs FUSE
 * cache that caches pre-existing files at session boot cannot mask
 * this test's source. See CLAUDE.md "Sandbox mount gotcha".
 *
 * Phase 5b ships three new sidequests in `data/quests.json`:
 *
 *   side.1.2.innkeeper_bottles   — npc → floor → combat(count:3) → npc(branch)
 *   side.1.3.cellar_owner_mop    — npc → item(ITM-089) → readiness(≥0.5)
 *   side.2.2.watchman_roll_call  — npc → floor → floor → flag(heroWakeArrival)
 *
 * This harness:
 *   1. Loads `data/quests.json` and `data/strings/en.js` directly
 *      (source-of-truth files — not a reference copy).
 *   2. Validates the three new quest entries are structurally sound
 *      (ids, kinds, step predicates, i18n keys).
 *   3. Embeds the Phase 5 predicate engine (_matches + advance with
 *      count-gated stepProgress) and simulates the event stream for
 *      each quest, asserting the step sequence advances correctly.
 *
 * Why re-embed the engine? Same reason Phase 5 does — the live
 * `engine/quest-chain.js` sits behind the bindfs cache and Node's
 * `fs.readFileSync` cannot be trusted to see mid-session edits.
 * The harness is a CONTRACT test: any divergence between this file's
 * _matches/advance logic and engine/quest-chain.js is a Phase 5
 * contract bug. Keep in lockstep.
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..', '..');

// ── Assertion plumbing ──────────────────────────────────────────────
var _passed = 0, _failed = 0, _failures = [];
function assert(cond, msg) {
  if (cond) { _passed++; }
  else      { _failed++; _failures.push(msg); console.log('  FAIL: ' + msg); }
}
function group(name, fn) { console.log('\n[' + name + ']'); fn(); }

// ── Load quests.json ─────────────────────────────────────────────────
var questsRaw = fs.readFileSync(path.join(root, 'data', 'quests.json'), 'utf8');
var questsDoc;
try { questsDoc = JSON.parse(questsRaw); }
catch (e) {
  console.log('FATAL: data/quests.json does not parse: ' + e.message);
  process.exit(2);
}

// ── Load en.js (string table) — we scan as text for key presence ────
var enSrc = fs.readFileSync(path.join(root, 'data', 'strings', 'en.js'), 'utf8');

// ── Predicate engine — lockstep copy of engine/quest-chain.js ───────
// Mirrors `_matches(predicate, event)` at engine/quest-chain.js:398.
function _matches(predicate, event) {
  if (!predicate || !event) return false;
  if (predicate.kind !== event.kind) return false;

  switch (predicate.kind) {
    case 'floor':
      if (predicate.floorId && predicate.floorId !== event.floorId) return false;
      if (typeof predicate.x === 'number' && typeof predicate.y === 'number') {
        var r = (typeof predicate.radius === 'number') ? predicate.radius : 0;
        var dx = (event.x | 0) - predicate.x;
        var dy = (event.y | 0) - predicate.y;
        return (dx * dx + dy * dy) <= (r * r);
      }
      return true;
    case 'item':
      return predicate.itemId === event.itemId;
    case 'npc':
      if (predicate.npcId !== event.npcId) return false;
      if (predicate.branch && predicate.branch !== event.branch) return false;
      return true;
    case 'flag':
      if (predicate.flag !== event.flag) return false;
      if (typeof predicate.value === 'undefined') return !!event.value;
      return predicate.value === event.value;
    case 'readiness':
      if (predicate.floorId && predicate.floorId !== event.floorId) return false;
      return (+event.score || 0) >= (+predicate.threshold || 0);
    case 'combat':
      return predicate.archetype === event.archetype;
    case 'minigame':
      if (predicate.kindId && predicate.kindId !== event.kindId) return false;
      if (predicate.reason && predicate.reason !== event.reason) return false;
      if (predicate.subTargetId && predicate.subTargetId !== event.subTargetId) return false;
      if (predicate.floorId && predicate.floorId !== event.floorId) return false;
      return true;
    default:
      return false;
  }
}

// Simulate a quest active-record with count-gated advance (Phase 5).
function makeRec(quest) {
  return { id: quest.id, stepIndex: 0, stepProgress: {}, completed: false, events: [] };
}

// Simulate `advance(rec, quest, event)` — returns the waypoint event
// shape the dispatcher would fire for this step (`{partial:true,progress,of}`
// or `{advanced:true}` or null).
function tick(rec, quest, event) {
  if (rec.completed) return null;
  var step = quest.steps[rec.stepIndex];
  if (!step) return null;
  var pred = step.advanceWhen;
  if (!_matches(pred, event)) return null;

  var count = +pred.count || 1;
  if (count >= 2) {
    var key = 'step.' + rec.stepIndex;
    rec.stepProgress[key] = (rec.stepProgress[key] || 0) + 1;
    var progress = rec.stepProgress[key];
    if (progress < count) {
      return { partial: true, progress: progress, of: count, event: event };
    }
    // Nth match — clear the progress counter and fall through to advance.
    delete rec.stepProgress[key];
  }
  rec.stepIndex++;
  if (rec.stepIndex >= quest.steps.length) rec.completed = true;
  return { advanced: true, completedQuest: rec.completed };
}

// ── Quest lookup helpers ────────────────────────────────────────────
function getQuest(id) {
  var qs = questsDoc.quests || [];
  for (var i = 0; i < qs.length; i++) if (qs[i].id === id) return qs[i];
  return null;
}

// ══════════════════════════════════════════════════════════════════
// G1 — data/quests.json structural gate
// ══════════════════════════════════════════════════════════════════
group('G1 — data/quests.json structural', function () {
  assert(Array.isArray(questsDoc.quests), 'quests is an array');
  assert(questsDoc.quests.length >= 4, 'quests array has ≥4 entries (1 demo + 3 new)');
  assert(getQuest('side.1.3.1.pentagram_wash') !== null, 'pentagram_wash demo still present');
  assert(getQuest('side.1.2.innkeeper_bottles') !== null, 'side.1.2.innkeeper_bottles present');
  assert(getQuest('side.1.3.cellar_owner_mop')  !== null, 'side.1.3.cellar_owner_mop present');
  assert(getQuest('side.2.2.watchman_roll_call') !== null, 'side.2.2.watchman_roll_call present');
});

// ══════════════════════════════════════════════════════════════════
// G2 — Per-quest structural gates
// ══════════════════════════════════════════════════════════════════
group('G2 — innkeeper_bottles structure', function () {
  var q = getQuest('side.1.2.innkeeper_bottles');
  assert(q.kind === 'side', 'kind = side');
  assert(q.giver.npcId === 'inn_keeper' && q.giver.floorId === '1.2', 'giver is inn_keeper on 1.2');
  assert(q.steps.length === 4, '4 steps');
  assert(q.steps[0].advanceWhen.kind === 'npc' && q.steps[0].advanceWhen.npcId === 'inn_keeper', 'step.1 npc=inn_keeper');
  assert(q.steps[1].advanceWhen.kind === 'floor' && q.steps[1].advanceWhen.floorId === '1.3.1', 'step.2 floor=1.3.1');
  assert(q.steps[2].advanceWhen.kind === 'combat' && q.steps[2].advanceWhen.archetype === 'ENM-003', 'step.3 combat=ENM-003');
  assert(q.steps[2].advanceWhen.count === 3, 'step.3 count=3 (count-gated)');
  assert(q.steps[3].advanceWhen.kind === 'npc' && q.steps[3].advanceWhen.branch === 'rat_report', 'step.4 npc branch=rat_report');
  assert(q.rewards.gold === 40 && q.rewards.favor && q.rewards.favor.bprd === 50, 'reward 40g + 50 BPRD favor');
  assert(q.rewards.flags && q.rewards.flags.side_innkeeper_bottles_done === true, 'reward flag set');
});

group('G2 — cellar_owner_mop structure', function () {
  var q = getQuest('side.1.3.cellar_owner_mop');
  assert(q.kind === 'side', 'kind = side');
  assert(q.giver.npcId === 'cellar_resident' && q.giver.floorId === '1.3', 'giver is cellar_resident on 1.3');
  assert(q.steps.length === 3, '3 steps');
  assert(q.steps[0].advanceWhen.kind === 'npc' && q.steps[0].advanceWhen.npcId === 'cellar_resident', 'step.1 npc=cellar_resident');
  assert(q.steps[1].advanceWhen.kind === 'item' && q.steps[1].advanceWhen.itemId === 'ITM-089', 'step.2 item=ITM-089 Mop Head');
  assert(q.steps[2].advanceWhen.kind === 'readiness' && q.steps[2].advanceWhen.floorId === '1.3.1' && q.steps[2].advanceWhen.threshold === 0.5, 'step.3 readiness 1.3.1 ≥ 0.5');
  assert(q.rewards.gold === 30, 'reward 30g');
});

group('G2 — watchman_roll_call structure', function () {
  var q = getQuest('side.2.2.watchman_roll_call');
  assert(q.kind === 'side', 'kind = side');
  assert(q.giver.npcId === 'watchpost_watchman' && q.giver.floorId === '2.2', 'giver is watchpost_watchman on 2.2');
  assert(q.prereq.flags.gateUnlocked === true, 'prereq gateUnlocked=true');
  assert(q.steps.length === 4, '4 steps');
  assert(q.steps[0].advanceWhen.kind === 'npc' && q.steps[0].advanceWhen.npcId === 'watchpost_watchman', 'step.1 npc=watchpost_watchman');
  assert(q.steps[1].advanceWhen.kind === 'floor' && q.steps[1].advanceWhen.floorId === '2.2.1', 'step.2 floor=2.2.1');
  assert(q.steps[2].advanceWhen.kind === 'floor' && q.steps[2].advanceWhen.floorId === '2.2.2', 'step.3 floor=2.2.2');
  assert(q.steps[3].advanceWhen.kind === 'flag' && q.steps[3].advanceWhen.flag === 'heroWakeArrival' && q.steps[3].advanceWhen.value === true, 'step.4 flag heroWakeArrival=true');
  assert(q.rewards.gold === 50 && q.rewards.favor && q.rewards.favor.bprd === 75 && q.rewards.favor.jesuit === 25, 'reward 50g + 75 BPRD + 25 Jesuit favor');
});

// ══════════════════════════════════════════════════════════════════
// G3 — i18n coverage — every referenced string key exists in en.js
// ══════════════════════════════════════════════════════════════════
group('G3 — i18n key coverage in data/strings/en.js', function () {
  var needed = [];
  var qs = ['side.1.2.innkeeper_bottles', 'side.1.3.cellar_owner_mop', 'side.2.2.watchman_roll_call'];
  for (var qi = 0; qi < qs.length; qi++) {
    var q = getQuest(qs[qi]);
    if (!q) continue;
    needed.push(q.title);
    needed.push(q.hook);
    needed.push(q.summary);
    for (var si = 0; si < q.steps.length; si++) {
      if (q.steps[si].label) needed.push(q.steps[si].label);
    }
  }
  for (var i = 0; i < needed.length; i++) {
    var key = needed[i];
    // Keys appear as "'key':" in the en.js IIFE
    var present = enSrc.indexOf("'" + key + "'") !== -1;
    assert(present, 'en.js has string key ' + JSON.stringify(key));
  }
});

// ══════════════════════════════════════════════════════════════════
// G4 — Live predicate engine simulation per quest
// ══════════════════════════════════════════════════════════════════
group('G4 — innkeeper_bottles event stream', function () {
  var q = getQuest('side.1.2.innkeeper_bottles');
  var rec = makeRec(q);

  // Wrong-NPC npc event must not advance step 1
  assert(tick(rec, q, { kind:'npc', npcId:'cellar_resident' }) === null, 'wrong npc on step 1 does not advance');
  assert(rec.stepIndex === 0, 'still on step 1');

  // Right NPC → advance to step 2
  var r1 = tick(rec, q, { kind:'npc', npcId:'inn_keeper' });
  assert(r1 && r1.advanced && rec.stepIndex === 1, 'inn_keeper talk advances to step 2');

  // Wrong floor does not advance
  assert(tick(rec, q, { kind:'floor', floorId:'2.2.1', x:0, y:0 }) === null, 'wrong floor does not advance step 2');
  // Right floor advances
  var r2 = tick(rec, q, { kind:'floor', floorId:'1.3.1', x:5, y:5 });
  assert(r2 && r2.advanced && rec.stepIndex === 2, 'arrive at 1.3.1 advances to step 3');

  // Combat step: 3 dungeon rats required — first two emit partials, third advances
  var k1 = tick(rec, q, { kind:'combat', archetype:'ENM-003' });
  assert(k1 && k1.partial === true && k1.progress === 1 && k1.of === 3 && rec.stepIndex === 2, 'kill 1/3 partial');
  // Wrong archetype does not count
  assert(tick(rec, q, { kind:'combat', archetype:'ENM-001' }) === null, 'wrong archetype skipped');
  assert(rec.stepProgress['step.2'] === 1, 'stepProgress unchanged after wrong archetype');
  var k2 = tick(rec, q, { kind:'combat', archetype:'ENM-003' });
  assert(k2 && k2.partial === true && k2.progress === 2 && k2.of === 3, 'kill 2/3 partial');
  var k3 = tick(rec, q, { kind:'combat', archetype:'ENM-003' });
  assert(k3 && k3.advanced === true && rec.stepIndex === 3, 'kill 3/3 advances to step 4');
  assert(!('step.2' in rec.stepProgress), 'stepProgress cleared after advance');

  // Step 4 — npc with branch. Default-branch talk must not advance.
  assert(tick(rec, q, { kind:'npc', npcId:'inn_keeper' }) === null, 'default-branch inn_keeper does not advance step 4');
  assert(rec.stepIndex === 3, 'still on step 4');
  var r4 = tick(rec, q, { kind:'npc', npcId:'inn_keeper', branch:'rat_report' });
  assert(r4 && r4.advanced && r4.completedQuest === true, 'branch=rat_report completes the quest');
  assert(rec.completed === true, 'quest marked completed');
});

group('G4 — cellar_owner_mop event stream', function () {
  var q = getQuest('side.1.3.cellar_owner_mop');
  var rec = makeRec(q);

  var r1 = tick(rec, q, { kind:'npc', npcId:'cellar_resident' });
  assert(r1 && r1.advanced && rec.stepIndex === 1, 'cellar_resident talk advances step 1 → step 2');

  // Wrong itemId — e.g. Scrub Brush ITM-090 — does not advance
  assert(tick(rec, q, { kind:'item', itemId:'ITM-090' }) === null, 'wrong item ITM-090 does not advance step 2');
  // Right itemId advances
  var r2 = tick(rec, q, { kind:'item', itemId:'ITM-089' });
  assert(r2 && r2.advanced && rec.stepIndex === 2, 'pick up ITM-089 Mop Head advances step 2 → step 3');

  // Readiness below threshold does not advance
  assert(tick(rec, q, { kind:'readiness', floorId:'1.3.1', score:0.3 }) === null, 'readiness 0.3 below 0.5 threshold does not advance');
  // Readiness on wrong floor does not advance
  assert(tick(rec, q, { kind:'readiness', floorId:'2.2.1', score:0.9 }) === null, 'readiness on 2.2.1 does not advance (wrong floor)');
  // Readiness at/above threshold on right floor advances
  var r3 = tick(rec, q, { kind:'readiness', floorId:'1.3.1', score:0.55 });
  assert(r3 && r3.advanced && rec.completed === true, 'readiness 0.55 on 1.3.1 completes the quest');
});

group('G4 — watchman_roll_call event stream', function () {
  var q = getQuest('side.2.2.watchman_roll_call');
  var rec = makeRec(q);

  // Step 1 — watchman talk
  var r1 = tick(rec, q, { kind:'npc', npcId:'watchpost_watchman' });
  assert(r1 && r1.advanced && rec.stepIndex === 1, 'watchman talk advances step 1 → step 2');

  // Step 2 — arrive at 2.2.1. Arriving at 2.2.2 first does not advance.
  assert(tick(rec, q, { kind:'floor', floorId:'2.2.2', x:1, y:1 }) === null, 'arriving at 2.2.2 does not advance step 2 (wants 2.2.1 first)');
  var r2 = tick(rec, q, { kind:'floor', floorId:'2.2.1', x:1, y:1 });
  assert(r2 && r2.advanced && rec.stepIndex === 2, 'arrive 2.2.1 advances step 2 → step 3');

  // Step 3 — descend to 2.2.2
  var r3 = tick(rec, q, { kind:'floor', floorId:'2.2.2', x:3, y:3 });
  assert(r3 && r3.advanced && rec.stepIndex === 3, 'arrive 2.2.2 advances step 3 → step 4');

  // Step 4 — flag predicate
  // Wrong flag does not advance
  assert(tick(rec, q, { kind:'flag', flag:'gateUnlocked', value:true }) === null, 'wrong flag gateUnlocked does not advance step 4');
  // Right flag wrong value does not advance
  assert(tick(rec, q, { kind:'flag', flag:'heroWakeArrival', value:false }) === null, 'heroWakeArrival=false does not advance step 4');
  // Right flag right value completes
  var r4 = tick(rec, q, { kind:'flag', flag:'heroWakeArrival', value:true });
  assert(r4 && r4.advanced && rec.completed === true, 'heroWakeArrival=true completes the quest');
});

// ══════════════════════════════════════════════════════════════════
// G5 — Cross-quest isolation: one quest's events do not advance
//      another mid-flight
// ══════════════════════════════════════════════════════════════════
group('G5 — cross-quest isolation (multi-active fan-out)', function () {
  var qA = getQuest('side.1.2.innkeeper_bottles');
  var qB = getQuest('side.1.3.cellar_owner_mop');
  var recA = makeRec(qA);
  var recB = makeRec(qB);

  // Both are on step 1 (both want an npc event, for different npcIds)
  var ekA = { kind:'npc', npcId:'inn_keeper' };
  assert(tick(recA, qA, ekA) !== null, 'inn_keeper advances A');
  assert(tick(recB, qB, ekA) === null, 'inn_keeper does NOT advance B (B wants cellar_resident)');
  assert(recA.stepIndex === 1 && recB.stepIndex === 0, 'A advanced, B still on step 1');

  var ekB = { kind:'npc', npcId:'cellar_resident' };
  assert(tick(recB, qB, ekB) !== null, 'cellar_resident advances B');
  assert(recB.stepIndex === 1, 'B advanced to step 2');

  // A's next step is a floor arrive — B's next step is an item — an item
  // event must not advance A, and a floor event must not advance B.
  assert(tick(recA, qA, { kind:'item', itemId:'ITM-089' }) === null, 'item event does not advance A (A wants floor)');
  assert(tick(recB, qB, { kind:'floor', floorId:'1.3.1', x:0, y:0 }) === null, 'floor event does not advance B (B wants item)');
  assert(recA.stepIndex === 1 && recB.stepIndex === 1, 'no cross-advance');
});

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n=== Result: ' + _passed + ' passed, ' + _failed + ' failed ===');
if (_failed > 0) {
  console.log('\nFailures:');
  for (var i = 0; i < _failures.length; i++) console.log('  - ' + _failures[i]);
  process.exit(1);
}
process.exit(0);

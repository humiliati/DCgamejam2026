#!/usr/bin/env node
/**
 * DOC-116 gate-taxonomy coordination verification harness.
 *
 * Fresh-inode harness: loads the _fresh-*.js mirrors of quest-types,
 * quest-registry, and quest-chain into a sandboxed VM context and
 * exercises the four new surfaces shipped in this slice:
 *
 *   G1  QuestTypes.WAYPOINT_KIND.GATE_OPENED entry + isWaypointKind
 *   G2  QuestChain predicate engine — kind:'gate-opened' matching
 *   G3  QuestChain.onGateOpened fan-out + input validation
 *   G4  QuestChain.isStepComplete addressing (int / string / states)
 *   G5  QuestRegistry.flagReferenced + hasStep pure query API
 *
 * Run: node tools/_doc116-cache/verify-gate-coord.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var HERE = __dirname;
var SRC = {
  types:    path.join(HERE, '_fresh-quest-types.js'),
  registry: path.join(HERE, '_fresh-quest-registry.js'),
  chain:    path.join(HERE, '_fresh-quest-chain.js')
};

var results = [];
function assert(group, name, cond, detail) {
  results.push({ group: group, name: name, pass: !!cond, detail: detail || '' });
}

function makeSandbox() {
  var ctx = {
    console: console,
    Date:    Date,
    Math:    Math,
    Object:  Object,
    Array:   Array,
    JSON:    JSON,
    isFinite: isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC.types,    'utf8'), ctx, { filename: SRC.types });
  vm.runInContext(fs.readFileSync(SRC.registry, 'utf8'), ctx, { filename: SRC.registry });
  vm.runInContext(fs.readFileSync(SRC.chain,    'utf8'), ctx, { filename: SRC.chain });
  return ctx;
}

// Small quest corpus: two quests — one that expects a gate-opened step
// and drives the predicate tests, one that wires a flag-advance so
// flagReferenced can find it.
function seedRegistry(ctx) {
  var payload = {
    version: 1,
    _source: 'harness',
    quests: [
      {
        id:    'gate_test_quest',
        kind:  'side',
        label: 'Gate Test',
        steps: [
          {
            id: 'open_west_gate',
            advanceWhen: { kind: 'gate-opened', floorId: '1.3.1', x: 5, y: 7, gateType: 'key' }
          },
          {
            id: 'open_any_quest_gate',
            advanceWhen: { kind: 'gate-opened', gateType: 'quest' }
          },
          {
            id: 'open_floor_any_tile',
            advanceWhen: { kind: 'gate-opened', floorId: '2.2.1' }
          },
          {
            id: 'open_any_gate',
            advanceWhen: { kind: 'gate-opened' }
          }
        ]
      },
      {
        id:    'flag_quest',
        kind:  'main',
        label: 'Flag Quest',
        steps: [
          { id: 'wait_for_flag', advanceWhen: { kind: 'flag', flag: 'act2_unlocked', value: true } },
          { id: 'wait_for_item', advanceWhen: { kind: 'item', itemId: 'pearl' } }
        ]
      }
    ]
  };
  var ok = ctx.QuestRegistry.init(payload, null, null);
  ctx.QuestChain.init();
  return ok;
}

// ── G1 — QuestTypes.WAYPOINT_KIND.GATE_OPENED ────────────────────
(function () {
  var ctx = makeSandbox();
  var QT = ctx.QuestTypes;
  assert('G1', 'GATE_OPENED enum value', QT.WAYPOINT_KIND.GATE_OPENED === 'gate-opened');
  assert('G1', 'isWaypointKind accepts gate-opened', QT.isWaypointKind('gate-opened') === true);
  assert('G1', 'isWaypointKind still rejects garbage', QT.isWaypointKind('not-a-kind') === false);
  // Guard: every existing waypoint kind still passes the validator.
  var kinds = ['floor','item','npc','flag','readiness','combat','minigame','reputation-tier','fetch','gate-opened'];
  var allOk = kinds.every(function (k) { return QT.isWaypointKind(k); });
  assert('G1', 'all 10 waypoint kinds pass isWaypointKind', allOk, kinds.join(','));
})();

// ── G2 — Predicate engine match / reject matrix ──────────────────
// Drives the real _matches via advance(): stepIndex stays at 0 until
// a matching gate-opened event arrives. Only the first step is
// narrow (floorId+x+y+gateType); we test it exhaustively then tear
// down and re-seed for the other narrowings.
function g2Scenario(label, eventArgs, expectAdvance) {
  var ctx = makeSandbox();
  seedRegistry(ctx);
  ctx.QuestChain.setActive('gate_test_quest');
  var before = ctx.QuestChain.getStepIndex('gate_test_quest');
  ctx.QuestChain.onGateOpened.apply(null, eventArgs);
  var after = ctx.QuestChain.getStepIndex('gate_test_quest');
  var advanced = after > before;
  assert('G2', label, advanced === !!expectAdvance,
    'before=' + before + ' after=' + after + ' expected advance=' + expectAdvance);
}

// Step 0 predicate: {floorId:'1.3.1', x:5, y:7, gateType:'key'}
g2Scenario('narrow predicate — exact match advances',        ['1.3.1', 5, 7, 'key'], true);
g2Scenario('narrow predicate — wrong floorId rejects',       ['other', 5, 7, 'key'], false);
g2Scenario('narrow predicate — wrong x rejects',             ['1.3.1', 6, 7, 'key'], false);
g2Scenario('narrow predicate — wrong y rejects',             ['1.3.1', 5, 8, 'key'], false);
g2Scenario('narrow predicate — wrong gateType rejects',      ['1.3.1', 5, 7, 'quest'], false);
g2Scenario('narrow predicate — missing gateType rejects',    ['1.3.1', 5, 7, null], false);

// After step 0 matches, step 1 predicate is {gateType:'quest'}. Any
// floor/coord should match so long as gateType === 'quest'.
(function () {
  var ctx = makeSandbox();
  seedRegistry(ctx);
  ctx.QuestChain.setActive('gate_test_quest');
  // advance past step 0
  ctx.QuestChain.onGateOpened('1.3.1', 5, 7, 'key');
  assert('G2', 'step 1 reached after step 0', ctx.QuestChain.getStepIndex('gate_test_quest') === 1);
  // step 1 — gateType-only predicate
  ctx.QuestChain.onGateOpened('anywhere', 99, 99, 'breakable');
  assert('G2', 'gateType mismatch on step-1 rejects', ctx.QuestChain.getStepIndex('gate_test_quest') === 1);
  ctx.QuestChain.onGateOpened('anywhere', 99, 99, 'quest');
  assert('G2', 'gateType match on step-1 advances', ctx.QuestChain.getStepIndex('gate_test_quest') === 2);
  // step 2 — floorId-only predicate
  ctx.QuestChain.onGateOpened('different', 1, 1, 'key');
  assert('G2', 'floorId mismatch on step-2 rejects', ctx.QuestChain.getStepIndex('gate_test_quest') === 2);
  ctx.QuestChain.onGateOpened('2.2.1', 0, 0, 'schedule');
  assert('G2', 'floorId match on step-2 advances', ctx.QuestChain.getStepIndex('gate_test_quest') === 3);
  // step 3 — empty predicate matches anything
  ctx.QuestChain.onGateOpened('whatever', 12, 34, null);
  assert('G2', 'wide predicate on step-3 advances', ctx.QuestChain.getStepIndex('gate_test_quest') === 4);
  assert('G2', 'quest completes after last step', ctx.QuestChain.getState('gate_test_quest') === ctx.QuestTypes.STATE.COMPLETED);
})();

// ── G3 — onGateOpened input validation ───────────────────────────
(function () {
  var ctx = makeSandbox();
  seedRegistry(ctx);
  ctx.QuestChain.setActive('gate_test_quest');
  assert('G3', 'non-string floorId → false',   ctx.QuestChain.onGateOpened(123, 5, 7, 'key') === false);
  assert('G3', 'empty floorId → false',        ctx.QuestChain.onGateOpened('', 5, 7, 'key') === false);
  assert('G3', 'non-number x → false',         ctx.QuestChain.onGateOpened('1.3.1', '5', 7, 'key') === false);
  assert('G3', 'non-number y → false',         ctx.QuestChain.onGateOpened('1.3.1', 5, null, 'key') === false);
  assert('G3', 'no active quests → false',     (function () {
    var ctx2 = makeSandbox();
    seedRegistry(ctx2);
    // don't activate any quests
    return ctx2.QuestChain.onGateOpened('1.3.1', 5, 7, 'key');
  })() === false);
  // Still at step 0 since none of the bad calls advanced anything
  assert('G3', 'bad calls did not mutate stepIndex', ctx.QuestChain.getStepIndex('gate_test_quest') === 0);
})();

// ── G4 — isStepComplete addressing ───────────────────────────────
(function () {
  var ctx = makeSandbox();
  seedRegistry(ctx);
  var QC = ctx.QuestChain;
  var QT = ctx.QuestTypes;

  assert('G4', 'unknown quest → false',              QC.isStepComplete('nope', 0) === false);
  QC.setActive('gate_test_quest');
  assert('G4', 'ACTIVE, step 0 not complete',        QC.isStepComplete('gate_test_quest', 0) === false);
  assert('G4', 'ACTIVE, step 0 by id not complete',  QC.isStepComplete('gate_test_quest', 'open_west_gate') === false);
  assert('G4', 'ACTIVE, out-of-range int → false',   QC.isStepComplete('gate_test_quest', 99) === false);
  assert('G4', 'ACTIVE, negative int → false',       QC.isStepComplete('gate_test_quest', -1) === false);
  assert('G4', 'ACTIVE, unknown id → false',         QC.isStepComplete('gate_test_quest', 'no_such_step') === false);

  // Advance past step 0
  QC.onGateOpened('1.3.1', 5, 7, 'key');
  assert('G4', 'ACTIVE, step 0 complete by int',     QC.isStepComplete('gate_test_quest', 0) === true);
  assert('G4', 'ACTIVE, step 0 complete by id',      QC.isStepComplete('gate_test_quest', 'open_west_gate') === true);
  assert('G4', 'ACTIVE, step 1 not yet complete',    QC.isStepComplete('gate_test_quest', 1) === false);
  assert('G4', 'ACTIVE, step 1 by id not complete',  QC.isStepComplete('gate_test_quest', 'open_any_quest_gate') === false);

  // Drive to COMPLETED
  QC.onGateOpened('x', 1, 1, 'quest');
  QC.onGateOpened('2.2.1', 0, 0, 'schedule');
  QC.onGateOpened('z', 0, 0, null);
  assert('G4', 'quest now COMPLETED',                QC.getState('gate_test_quest') === QT.STATE.COMPLETED);
  assert('G4', 'COMPLETED, step 0 complete',         QC.isStepComplete('gate_test_quest', 0) === true);
  assert('G4', 'COMPLETED, last step complete',      QC.isStepComplete('gate_test_quest', 3) === true);
  assert('G4', 'COMPLETED, last step by id',         QC.isStepComplete('gate_test_quest', 'open_any_gate') === true);
  assert('G4', 'COMPLETED, out-of-range still false',QC.isStepComplete('gate_test_quest', 99) === false);
  assert('G4', 'COMPLETED, unknown id still false',  QC.isStepComplete('gate_test_quest', 'bogus') === false);
})();

// ── G5 — QuestRegistry.flagReferenced + hasStep ──────────────────
(function () {
  var ctx = makeSandbox();
  seedRegistry(ctx);
  var QR = ctx.QuestRegistry;

  // flagReferenced
  assert('G5', 'flagReferenced hit',           QR.flagReferenced('act2_unlocked') === true);
  assert('G5', 'flagReferenced miss',          QR.flagReferenced('never_set') === false);
  assert('G5', 'flagReferenced empty → false', QR.flagReferenced('') === false);
  assert('G5', 'flagReferenced non-string',    QR.flagReferenced(null) === false);
  assert('G5', 'flagReferenced number',        QR.flagReferenced(42) === false);

  // hasStep — int addressing
  assert('G5', 'hasStep known quest int 0',      QR.hasStep('gate_test_quest', 0) === true);
  assert('G5', 'hasStep known quest int 3',      QR.hasStep('gate_test_quest', 3) === true);
  assert('G5', 'hasStep out of range int',       QR.hasStep('gate_test_quest', 4) === false);
  assert('G5', 'hasStep negative int',           QR.hasStep('gate_test_quest', -1) === false);
  // hasStep — string.id addressing
  assert('G5', 'hasStep by id hit',              QR.hasStep('gate_test_quest', 'open_west_gate') === true);
  assert('G5', 'hasStep by id miss',             QR.hasStep('gate_test_quest', 'no_such') === false);
  assert('G5', 'hasStep by empty string',        QR.hasStep('gate_test_quest', '') === false);
  // hasStep — unknown quest
  assert('G5', 'hasStep unknown quest',          QR.hasStep('nope', 0) === false);
  assert('G5', 'hasStep empty questId',          QR.hasStep('', 0) === false);
  assert('G5', 'hasStep non-string questId',     QR.hasStep(null, 0) === false);
})();

// ── Report ───────────────────────────────────────────────────────
var passCount = 0, failCount = 0;
var byGroup = {};
results.forEach(function (r) {
  if (!byGroup[r.group]) byGroup[r.group] = { pass: 0, fail: 0, cases: [] };
  byGroup[r.group].cases.push(r);
  if (r.pass) { byGroup[r.group].pass++; passCount++; }
  else        { byGroup[r.group].fail++; failCount++; }
});

console.log('\nDOC-116 gate-coord verification — ' + (passCount + failCount) + ' assertions\n');
Object.keys(byGroup).sort().forEach(function (g) {
  var gg = byGroup[g];
  console.log(' [' + g + ']  pass ' + gg.pass + '/' + (gg.pass + gg.fail));
  gg.cases.forEach(function (c) {
    var mark = c.pass ? '  ✓' : '  ✗';
    console.log(mark + ' ' + c.name + (c.pass ? '' : '   — ' + c.detail));
  });
});
console.log('\n' + (failCount === 0 ? 'ALL GREEN' : (failCount + ' FAIL')) + '   (total ' + passCount + '/' + (passCount + failCount) + ')');
process.exit(failCount === 0 ? 0 : 1);

/**
 * Phase 2.1a — verify getJournalEntries projection + game.js handler wiring.
 *
 * Groups:
 *   G1 Source-file sanity — quest-chain.js has the new projection +
 *      game.js has the 3 new hit.action handlers.
 *   G2 Projection shape — every expected field is present + typed.
 *   G3 Filter semantics — active/completed/failed/expired + no-flag
 *      returns-all back-compat.
 *   G4 Sort order — main > side > contract, then startedTick asc.
 *   G5 Progress clamp — completed quests report total/total; active
 *      quests report stepIndex/total.
 *   G6 Breadcrumb derivation — `floor.<id>.name` when giver.floorId
 *      is present; empty string when giver missing.
 *   G7 Handler wiring — game.js contains each new action branch and
 *      calls the expected MenuFaces / DialogBox methods.
 */
'use strict';
var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '../..');
var failed = 0, passed = 0;

function check(group, label, cond) {
  if (cond) { passed++; console.log('  \u2713 ' + group + ' ' + label); }
  else      { failed++; console.log('  \u2717 ' + group + ' ' + label); }
}

// ─────────────────────────────────────────────────────────────────
// G1 — Source file sanity
// ─────────────────────────────────────────────────────────────────
var qChainSrc = fs.readFileSync(path.join(ROOT, 'engine/quest-chain.js'), 'utf8');
var gameSrc   = fs.readFileSync(path.join(ROOT, 'engine/game.js'),        'utf8');

check('G1', 'quest-chain.js has Phase 2.1a projection marker',
  qChainSrc.indexOf('Phase 2.1a') >= 0);
check('G1', 'quest-chain.js getJournalEntries references markerColor',
  qChainSrc.indexOf('markerColor:') >= 0);
check('G1', 'quest-chain.js getJournalEntries references breadcrumb',
  qChainSrc.indexOf('breadcrumb:') >= 0);
check('G1', 'game.js has quest_scroll_up handler',
  gameSrc.indexOf("hit.action === 'quest_scroll_up'") >= 0);
check('G1', 'game.js has quest_scroll_down handler',
  gameSrc.indexOf("hit.action === 'quest_scroll_down'") >= 0);
check('G1', 'game.js has read_quest_completed handler',
  gameSrc.indexOf("hit.action === 'read_quest_completed'") >= 0);

// ─────────────────────────────────────────────────────────────────
// vm context setup — load QuestTypes, a stub QuestRegistry, and
// the projection mirror.
// ─────────────────────────────────────────────────────────────────
var ctx = { console: console, window: {} };
vm.createContext(ctx);

var qTypesSrc = fs.readFileSync(path.join(ROOT, 'tools/_doc116-cache/_fresh-quest-types.js'), 'utf8');
vm.runInContext(qTypesSrc, ctx);

// Fixture quest defs — 5 quests across 3 kinds, with and without givers.
var defs = {
  'main.x': {
    id: 'main.x', kind: 'main', act: 1,
    title: 'quest.main.x.title', summary: 'quest.main.x.summary',
    giver: { npcId: 'npc1', floorId: '1.3' },
    markerColor: '#ff0',
    steps: [
      { id: 'step.1', kind: 'flag', label: 'quest.main.x.step.1' },
      { id: 'step.2', kind: 'flag', label: 'quest.main.x.step.2' },
      { id: 'step.3', kind: 'flag', label: 'quest.main.x.step.3' }
    ],
    rewards: { gold: 100, items: [], favor: { mss: 50 }, flags: {} }
  },
  'side.a': {
    id: 'side.a', kind: 'side', act: 1,
    title: 'quest.side.a.title', summary: 'quest.side.a.summary',
    giver: { npcId: null, floorId: '1.6' },
    markerColor: null,
    steps: [
      { id: 'step.1', kind: 'flag', label: 'quest.side.a.step.1' },
      { id: 'step.2', kind: 'flag', label: 'quest.side.a.step.2' }
    ],
    rewards: { gold: 30, items: [], favor: {}, flags: {} }
  },
  'side.b': {
    id: 'side.b', kind: 'side', act: 1,
    title: 'quest.side.b.title', summary: '',
    giver: null,
    markerColor: null,
    steps: [{ id: 'step.1', kind: 'flag', label: 'quest.side.b.step.1' }],
    rewards: null
  },
  'contract.c': {
    id: 'contract.c', kind: 'contract', act: 1,
    title: 'quest.contract.c.title', summary: 'quest.contract.c.summary',
    giver: { npcId: 'dispatcher', floorId: '2.1' },
    markerColor: null,
    steps: [{ id: 'step.1', kind: 'flag', label: 'quest.contract.c.step.1' }],
    rewards: { gold: 50, items: [], favor: {}, flags: {} }
  },
  'main.fail': {
    id: 'main.fail', kind: 'main', act: 1,
    title: 'quest.main.fail.title', summary: '',
    giver: { floorId: '0' },
    markerColor: null,
    steps: [{ id: 'step.1', kind: 'flag', label: 'x' }],
    rewards: null
  }
};
ctx.QuestRegistry = { getQuest: function (id) { return defs[id] || null; } };

var mirrorSrc = fs.readFileSync(path.join(__dirname, '_fresh-quest-chain-journal.js'), 'utf8');
vm.runInContext(mirrorSrc, ctx);

// Seed _active with records across all states + varied startedTick.
ctx.QuestChainJournal._seedActive({
  'main.x':     { state: ctx.QuestTypes.STATE.ACTIVE,    stepIndex: 1, startedTick: 100 },
  'side.a':     { state: ctx.QuestTypes.STATE.ACTIVE,    stepIndex: 0, startedTick: 50  },
  'side.b':     { state: ctx.QuestTypes.STATE.COMPLETED, stepIndex: 0, startedTick: 200 },
  'contract.c': { state: ctx.QuestTypes.STATE.ACTIVE,    stepIndex: 0, startedTick: 10  },
  'main.fail':  { state: ctx.QuestTypes.STATE.FAILED,    stepIndex: 0, startedTick: 300, failReason: 'timeout' }
});

// ─────────────────────────────────────────────────────────────────
// G2 — Projection shape
// ─────────────────────────────────────────────────────────────────
var allActive = ctx.QuestChainJournal.getJournalEntries({ active: true });
check('G2', 'active-filter returns 3 ACTIVE records', allActive.length === 3);
var mx = allActive.filter(function (e) { return e.id === 'main.x'; })[0];
check('G2', "main.x entry has title='quest.main.x.title'",     mx && mx.title === 'quest.main.x.title');
check('G2', "main.x entry has summary='quest.main.x.summary'", mx && mx.summary === 'quest.main.x.summary');
check('G2', "main.x entry has stepLabel='quest.main.x.step.2' (stepIndex=1)",
  mx && mx.stepLabel === 'quest.main.x.step.2');
check('G2', "main.x entry has stepId='step.2'",        mx && mx.stepId === 'step.2');
check('G2', "main.x entry has stepKind='flag'",        mx && mx.stepKind === 'flag');
check('G2', "main.x entry has markerColor='#ff0'",     mx && mx.markerColor === '#ff0');
check('G2', "main.x entry has totalSteps=3",           mx && mx.totalSteps === 3);
check('G2', "main.x entry has progress {1,3}",         mx && mx.progress.current === 1 && mx.progress.total === 3);
check('G2', "main.x entry has giver.npcId='npc1'",     mx && mx.giver && mx.giver.npcId === 'npc1');
check('G2', "main.x entry has breadcrumb='floor.1.3.name'",
  mx && mx.breadcrumb === 'floor.1.3.name');
check('G2', "main.x entry has rewards.gold=100",       mx && mx.rewards && mx.rewards.gold === 100);
check('G2', "main.x entry has act=1",                  mx && mx.act === 1);
check('G2', "main.x entry has label fallback != raw id (def.title present)",
  mx && mx.label === 'quest.main.x.title');
// Back-compat: steps array preserved
check('G2', "main.x entry keeps steps[] (len 3)",      mx && Array.isArray(mx.steps) && mx.steps.length === 3);

// side.b has null giver — breadcrumb should be empty, markerColor null, rewards null
var sbAll = ctx.QuestChainJournal.getJournalEntries({ completed: true });
var sb = sbAll.filter(function (e) { return e.id === 'side.b'; })[0];
check('G2', "side.b (no giver) has breadcrumb=''",     sb && sb.breadcrumb === '');
check('G2', "side.b has markerColor=null",             sb && sb.markerColor === null);
check('G2', "side.b has rewards=null",                 sb && sb.rewards === null);

// ─────────────────────────────────────────────────────────────────
// G3 — Filter semantics
// ─────────────────────────────────────────────────────────────────
var onlyActive    = ctx.QuestChainJournal.getJournalEntries({ active: true });
var onlyCompleted = ctx.QuestChainJournal.getJournalEntries({ completed: true });
var onlyFailed    = ctx.QuestChainJournal.getJournalEntries({ failed: true });
var onlyExpired   = ctx.QuestChainJournal.getJournalEntries({ expired: true });
var activeAndCom  = ctx.QuestChainJournal.getJournalEntries({ active: true, completed: true });
var noFilter      = ctx.QuestChainJournal.getJournalEntries({});

check('G3', 'active-only returns 3 entries',                 onlyActive.length === 3);
check('G3', 'active-only entries all STATE.ACTIVE',
  onlyActive.every(function (e) { return e.state === ctx.QuestTypes.STATE.ACTIVE; }));
check('G3', 'completed-only returns 1 entry',                onlyCompleted.length === 1);
check('G3', 'completed-only entry id==side.b',               onlyCompleted[0].id === 'side.b');
check('G3', 'failed-only returns 1 entry',                   onlyFailed.length === 1);
check('G3', 'failed-only id==main.fail + failReason set',
  onlyFailed[0].id === 'main.fail' && onlyFailed[0].failReason === 'timeout');
check('G3', 'expired-only returns 0 entries (no fixture)',   onlyExpired.length === 0);
check('G3', 'active+completed returns 4 entries',            activeAndCom.length === 4);
check('G3', 'no-filter returns all 5 entries (back-compat)', noFilter.length === 5);

// ─────────────────────────────────────────────────────────────────
// G4 — Sort order: main > side > contract, then startedTick asc
// ─────────────────────────────────────────────────────────────────
// Active set: main.x (main, 100), side.a (side, 50), contract.c (contract, 10)
// Expected order: main.x, side.a, contract.c (despite contract.c having smallest tick,
// it's sorted last because contract > side > main).
check('G4', 'active sort[0].kind == main',     onlyActive[0].kind === 'main');
check('G4', 'active sort[1].kind == side',     onlyActive[1].kind === 'side');
check('G4', 'active sort[2].kind == contract', onlyActive[2].kind === 'contract');

// Tie-break within same kind: seed two sides, one earlier.
ctx.QuestChainJournal._seedActive({
  'side.late':  { state: ctx.QuestTypes.STATE.ACTIVE, stepIndex: 0, startedTick: 500 },
  'side.early': { state: ctx.QuestTypes.STATE.ACTIVE, stepIndex: 0, startedTick: 5   }
});
// Add minimal defs so the mirror doesn't return null-kind entries.
defs['side.late']  = { id: 'side.late',  kind: 'side', steps: [{ id: 's', kind: 'flag', label: 'l' }] };
defs['side.early'] = { id: 'side.early', kind: 'side', steps: [{ id: 's', kind: 'flag', label: 'l' }] };
var tieSort = ctx.QuestChainJournal.getJournalEntries({ active: true });
check('G4', 'same-kind tie-break: earlier tick first',
  tieSort.length === 2 && tieSort[0].id === 'side.early' && tieSort[1].id === 'side.late');

// Restore the full fixture for G5/G6.
ctx.QuestChainJournal._seedActive({
  'main.x':     { state: ctx.QuestTypes.STATE.ACTIVE,    stepIndex: 1, startedTick: 100 },
  'side.a':     { state: ctx.QuestTypes.STATE.ACTIVE,    stepIndex: 0, startedTick: 50  },
  'side.b':     { state: ctx.QuestTypes.STATE.COMPLETED, stepIndex: 0, startedTick: 200 },
  'contract.c': { state: ctx.QuestTypes.STATE.ACTIVE,    stepIndex: 0, startedTick: 10  },
  'main.fail':  { state: ctx.QuestTypes.STATE.FAILED,    stepIndex: 0, startedTick: 300, failReason: 'timeout' }
});

// ─────────────────────────────────────────────────────────────────
// G5 — Progress clamp
// ─────────────────────────────────────────────────────────────────
var compSet = ctx.QuestChainJournal.getJournalEntries({ completed: true });
var sbc = compSet.filter(function (e) { return e.id === 'side.b'; })[0];
check('G5', 'completed side.b progress.current == totalSteps (clamp)',
  sbc && sbc.progress.current === sbc.progress.total);
check('G5', 'completed side.b progress.total == 1', sbc && sbc.progress.total === 1);

var actSet = ctx.QuestChainJournal.getJournalEntries({ active: true });
var mx2 = actSet.filter(function (e) { return e.id === 'main.x'; })[0];
check('G5', 'active main.x progress.current == stepIndex (1)',
  mx2 && mx2.progress.current === 1 && mx2.stepIndex === 1);
check('G5', 'active main.x progress.total == totalSteps (3)',
  mx2 && mx2.progress.total === 3);

// ─────────────────────────────────────────────────────────────────
// G6 — Breadcrumb derivation
// ─────────────────────────────────────────────────────────────────
var mx3 = actSet.filter(function (e) { return e.id === 'main.x'; })[0];
check('G6', "main.x (giver.floorId='1.3') breadcrumb=='floor.1.3.name'",
  mx3 && mx3.breadcrumb === 'floor.1.3.name');
var sbBread = compSet.filter(function (e) { return e.id === 'side.b'; })[0];
check('G6', "side.b (giver=null) breadcrumb==''",
  sbBread && sbBread.breadcrumb === '');
var mfSet = ctx.QuestChainJournal.getJournalEntries({ failed: true });
var mf = mfSet.filter(function (e) { return e.id === 'main.fail'; })[0];
check('G6', "main.fail (giver.floorId='0') breadcrumb=='floor.0.name'",
  mf && mf.breadcrumb === 'floor.0.name');

// ─────────────────────────────────────────────────────────────────
// G7 — Handler wiring in game.js
// ─────────────────────────────────────────────────────────────────
// Locate the quest_scroll_up handler block and verify it calls scrollQuestCompleted(-1).
var qsuIdx = gameSrc.indexOf("hit.action === 'quest_scroll_up'");
var qsuBlock = gameSrc.substring(qsuIdx, qsuIdx + 300);
check('G7', "quest_scroll_up calls MenuFaces.scrollQuestCompleted(-1)",
  qsuBlock.indexOf('scrollQuestCompleted(-1)') >= 0);

var qsdIdx = gameSrc.indexOf("hit.action === 'quest_scroll_down'");
var qsdBlock = gameSrc.substring(qsdIdx, qsdIdx + 300);
check('G7', "quest_scroll_down calls MenuFaces.scrollQuestCompleted(+1)",
  qsdBlock.indexOf('scrollQuestCompleted(+1)') >= 0);

var rqcIdx = gameSrc.indexOf("hit.action === 'read_quest_completed'");
var rqcBlock = gameSrc.substring(rqcIdx, rqcIdx + 2000);
check('G7', 'read_quest_completed calls QuestChain.getJournalEntries',
  rqcBlock.indexOf('QuestChain.getJournalEntries') >= 0);
check('G7', 'read_quest_completed opens DialogBox.show',
  rqcBlock.indexOf('DialogBox.show') >= 0);
check('G7', 'read_quest_completed closes MenuBox',
  rqcBlock.indexOf('MenuBox.close') >= 0);
check('G7', 'read_quest_completed reads hit.questId from hitzone',
  rqcBlock.indexOf('hit.questId') >= 0);

var total = passed + failed;
console.log('');
if (failed === 0) console.log('ALL GREEN   (total ' + passed + '/' + total + ')');
else              console.log('FAILED      (' + failed + '/' + total + ' failing)');
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * DOC-109 Phase 0 — ReputationBar subject-kind namespace verification.
 *
 * Four groups of assertions against the Phase 0 surface:
 *
 *   G1 — Back-compat alias round-trip: legacy addFavor/setFavor/getFavor/
 *        getTier/listFactions/snapshot all work on faction-scoped data
 *        and return pre-Phase-0 shapes.
 *
 *   G2 — NPC subject CRUD: addSubjectFavor('npc', ...) creates an NPC
 *        subject; getSubjectFavor / getSubjectTier / listSubjects('npc')
 *        read it back cleanly; faction ledger is untouched.
 *
 *   G3 — Event bus kind routing: legacy 3-arg listeners receive
 *        (id, prev, next) with faction-scoped semantics; new 4-arg
 *        listeners receive (kind, id, prev, next) for both faction
 *        and NPC mutations. Tier-cross fires only on threshold cross.
 *
 *   G4 — snapshotByKind shape: returns { faction: {...}, npc: {...} };
 *        legacy snapshot() returns the flat factionId -> {favor, tier}
 *        shape for save-game compatibility.
 *
 * Fresh-inode cache-bust pattern (same as tools/_phase6-cache/verify.js):
 * every source file we eval is copied to /tmp with a unique suffix
 * before read, so mid-session Edit tool writes to the bindfs mount are
 * guaranteed visible to Node.
 *
 * Usage: node tools/_debrief-categories-cache/verify-phase0.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var os   = require('os');

var ROOT = path.resolve(__dirname, '..', '..');

var _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase0-'));
var _readCounter = 0;
function freshRead(relPath) {
  var src = path.join(ROOT, relPath);
  var dst = path.join(_tmpDir, (_readCounter++) + '-' + path.basename(relPath));
  fs.copyFileSync(src, dst);
  return fs.readFileSync(dst, 'utf8');
}

var results = [];
function assert(group, name, cond, detail) {
  results.push({ group: group, name: name, pass: !!cond, detail: detail || '' });
}

function makeSandbox() {
  var ctx = {
    console: console,
    QuestTypes: {
      FACTIONS: Object.freeze({
        MSS:       'mss',
        PINKERTON: 'pinkerton',
        JESUIT:    'jesuit',
        BPRD:      'bprd'
      }),
      REP_TIERS: Object.freeze([
        { id: 'hated',      min: -Infinity, label: 'Hated'      },
        { id: 'unfriendly', min: -500,      label: 'Unfriendly' },
        { id: 'neutral',    min: 0,         label: 'Neutral'    },
        { id: 'friendly',   min: 500,       label: 'Friendly'   },
        { id: 'allied',     min: 2500,      label: 'Allied'     },
        { id: 'exalted',    min: 10000,     label: 'Exalted'    }
      ]),
      tierForFavor: function (favor) {
        var n = +favor || 0;
        var picked = this.REP_TIERS[0];
        for (var i = 0; i < this.REP_TIERS.length; i++) {
          if (n >= this.REP_TIERS[i].min) picked = this.REP_TIERS[i];
        }
        return picked;
      }
    }
  };
  vm.createContext(ctx);
  var src = freshRead('engine/reputation-bar.js');
  vm.runInContext(src, ctx, { filename: 'engine/reputation-bar.js' });
  return ctx;
}

// G1 -- Back-compat alias round-trip
(function g1() {
  var ctx = makeSandbox();
  var RB = ctx.ReputationBar;

  assert('G1', 'ReputationBar global defined', typeof RB === 'object' && RB !== null);
  assert('G1', 'init() seeds 4 factions',
         RB.init() === true && RB.listFactions().length === 4);
  assert('G1', 'listFactions returns faction ids',
         RB.listFactions().sort().join(',') === 'bprd,jesuit,mss,pinkerton');
  assert('G1', 'getFavor(bprd) == 0 pre-update', RB.getFavor('bprd') === 0);
  assert('G1', 'getTier(bprd).id == neutral pre-update',
         RB.getTier('bprd') && RB.getTier('bprd').id === 'neutral');

  assert('G1', 'addFavor(bprd, 100) returns 100', RB.addFavor('bprd', 100) === 100);
  assert('G1', 'getFavor(bprd) == 100 after add', RB.getFavor('bprd') === 100);
  assert('G1', 'setFavor(mss, 600) returns 600', RB.setFavor('mss', 600) === 600);
  assert('G1', 'getTier(mss).id == friendly after 600',
         RB.getTier('mss') && RB.getTier('mss').id === 'friendly');

  var snap = RB.snapshot();
  assert('G1', 'snapshot has 4 faction keys',
         Object.keys(snap).sort().join(',') === 'bprd,jesuit,mss,pinkerton');
  assert('G1', 'snapshot.bprd.favor == 100', snap.bprd && snap.bprd.favor === 100);
  assert('G1', 'snapshot.mss.tier == friendly', snap.mss && snap.mss.tier === 'friendly');

  RB.init({ bprd: 2500, mss: -500 });
  assert('G1', 'init(seed) restores bprd favor', RB.getFavor('bprd') === 2500);
  assert('G1', 'init(seed) restores bprd tier=allied',
         RB.getTier('bprd').id === 'allied');
  assert('G1', 'init(seed) restores mss tier=unfriendly',
         RB.getTier('mss').id === 'unfriendly');
})();

// G2 -- NPC subject CRUD
(function g2() {
  var ctx = makeSandbox();
  var RB = ctx.ReputationBar;
  RB.init();

  assert('G2', 'listSubjects(npc) empty after init', RB.listSubjects('npc').length === 0);
  assert('G2', 'listSubjects(faction) has 4 after init',
         RB.listSubjects('faction').length === 4);

  var r = RB.addSubjectFavor('npc', 'dispatcher-hallow', 25);
  assert('G2', 'addSubjectFavor(npc) returns cumulative 25', r === 25);
  assert('G2', 'getSubjectFavor(npc, dispatcher-hallow) == 25',
         RB.getSubjectFavor('npc', 'dispatcher-hallow') === 25);
  assert('G2', 'listSubjects(npc) now contains 1 id',
         RB.listSubjects('npc').length === 1 &&
         RB.listSubjects('npc')[0] === 'dispatcher-hallow');
  assert('G2', 'getSubjectTier(npc, dispatcher-hallow).id == neutral (25 < 500)',
         RB.getSubjectTier('npc', 'dispatcher-hallow').id === 'neutral');

  assert('G2', 'faction bprd still 0 after NPC add', RB.getSubjectFavor('faction', 'bprd') === 0);
  assert('G2', 'listSubjects(faction) unchanged at 4', RB.listSubjects('faction').length === 4);

  RB.setSubjectFavor('npc', 'dispatcher-hallow', 500);
  assert('G2', 'setSubjectFavor(npc) clamp to 500', RB.getSubjectFavor('npc', 'dispatcher-hallow') === 500);
  assert('G2', 'npc tier crossed to friendly after set 500',
         RB.getSubjectTier('npc', 'dispatcher-hallow').id === 'friendly');

  RB.addSubjectFavor('npc', 'watchman-vega', -100);
  assert('G2', 'second npc added without affecting first',
         RB.getSubjectFavor('npc', 'watchman-vega') === -100 &&
         RB.getSubjectFavor('npc', 'dispatcher-hallow') === 500);
  assert('G2', 'listSubjects(npc) now 2', RB.listSubjects('npc').length === 2);
})();

// G3 -- Event bus kind routing
(function g3() {
  var ctx = makeSandbox();
  var RB = ctx.ReputationBar;
  RB.init();

  var legacyFavorEvents = [];
  var legacyTierEvents  = [];
  var modernFavorEvents = [];
  var modernTierEvents  = [];

  function legacyFavor(id, prev, next) {
    legacyFavorEvents.push({ id: id, prev: prev, next: next });
  }
  function legacyTier(id, prevTier, nextTier) {
    legacyTierEvents.push({ id: id, prevTier: prevTier, nextTier: nextTier });
  }
  function modernFavor(kind, id, prev, next) {
    modernFavorEvents.push({ kind: kind, id: id, prev: prev, next: next });
  }
  function modernTier(kind, id, prevTier, nextTier) {
    modernTierEvents.push({ kind: kind, id: id, prevTier: prevTier, nextTier: nextTier });
  }

  assert('G3', 'legacyFavor.length == 3', legacyFavor.length === 3);
  assert('G3', 'modernFavor.length == 4', modernFavor.length === 4);

  RB.on('favor-change', legacyFavor);
  RB.on('favor-change', modernFavor);
  RB.on('tier-cross',  legacyTier);
  RB.on('tier-cross',  modernTier);

  RB.addSubjectFavor('faction', 'bprd', 100);
  assert('G3', 'legacy favor listener fired once for faction add',
         legacyFavorEvents.length === 1);
  assert('G3', 'legacy favor listener got id=bprd (no kind leaked)',
         legacyFavorEvents[0].id === 'bprd' && legacyFavorEvents[0].next === 100);
  assert('G3', 'modern favor listener got kind=faction, id=bprd',
         modernFavorEvents.length === 1 &&
         modernFavorEvents[0].kind === 'faction' &&
         modernFavorEvents[0].id === 'bprd');

  assert('G3', 'tier-cross not fired on sub-threshold favor bump',
         legacyTierEvents.length === 0 && modernTierEvents.length === 0);

  RB.addSubjectFavor('faction', 'bprd', 500);
  assert('G3', 'legacy tier listener got id=bprd, prev=neutral, next=friendly',
         legacyTierEvents.length === 1 &&
         legacyTierEvents[0].id === 'bprd' &&
         legacyTierEvents[0].prevTier === 'neutral' &&
         legacyTierEvents[0].nextTier === 'friendly');
  assert('G3', 'modern tier listener got kind=faction on tier cross',
         modernTierEvents.length === 1 &&
         modernTierEvents[0].kind === 'faction' &&
         modernTierEvents[0].id === 'bprd');

  RB.addSubjectFavor('npc', 'dispatcher-hallow', 25);
  assert('G3', 'modern favor listener fired for npc mutation too',
         modernFavorEvents.length === 3 &&
         modernFavorEvents[2].kind === 'npc' &&
         modernFavorEvents[2].id === 'dispatcher-hallow');
  assert('G3', 'legacy favor listener received npc id unwrapped (no kind prefix)',
         legacyFavorEvents.length === 3 &&
         legacyFavorEvents[2].id === 'dispatcher-hallow' &&
         legacyFavorEvents[2].next === 25);

  RB.off('favor-change', modernFavor);
  RB.addSubjectFavor('faction', 'mss', 10);
  assert('G3', 'modern listener stopped firing after off()',
         modernFavorEvents.length === 3);
  assert('G3', 'legacy listener still fires after other off()',
         legacyFavorEvents.length === 4);
})();

// G4 -- snapshotByKind + legacy snapshot shapes
(function g4() {
  var ctx = makeSandbox();
  var RB = ctx.ReputationBar;
  RB.init();
  RB.addSubjectFavor('faction', 'bprd', 2500);
  RB.addSubjectFavor('npc',     'dispatcher-hallow', 600);
  RB.addSubjectFavor('npc',     'watchman-vega', 0);

  var byKind = RB.snapshotByKind();
  assert('G4', 'snapshotByKind has faction + npc top-level keys',
         byKind && byKind.faction && byKind.npc);
  assert('G4', 'snapshotByKind.faction has 4 entries',
         Object.keys(byKind.faction).length === 4);
  assert('G4', 'snapshotByKind.npc has 2 entries',
         Object.keys(byKind.npc).length === 2);
  assert('G4', 'snapshotByKind.faction.bprd = {favor:2500, tier:allied}',
         byKind.faction.bprd &&
         byKind.faction.bprd.favor === 2500 &&
         byKind.faction.bprd.tier === 'allied');
  assert('G4', 'snapshotByKind.npc.dispatcher-hallow = {favor:600, tier:friendly}',
         byKind.npc['dispatcher-hallow'] &&
         byKind.npc['dispatcher-hallow'].favor === 600 &&
         byKind.npc['dispatcher-hallow'].tier === 'friendly');

  var legacy = RB.snapshot();
  assert('G4', 'legacy snapshot has 4 keys (factions only)',
         Object.keys(legacy).sort().join(',') === 'bprd,jesuit,mss,pinkerton');
  assert('G4', 'legacy snapshot has no npc keys',
         !legacy['dispatcher-hallow'] && !legacy['watchman-vega']);
  assert('G4', 'legacy snapshot.bprd shape = {favor, tier}',
         legacy.bprd && legacy.bprd.favor === 2500 && legacy.bprd.tier === 'allied');

  var s = RB.summary();
  assert('G4', 'summary.factionCount == 4', s.factionCount === 4);
  assert('G4', 'summary.npcCount == 2', s.npcCount === 2);
  assert('G4', 'summary.subjectCount == 6', s.subjectCount === 6);
  assert('G4', 'summary.initialized === true', s.initialized === true);
})();

// Report
var groups = {};
results.forEach(function (r) {
  if (!groups[r.group]) groups[r.group] = { pass: 0, fail: 0, failed: [] };
  if (r.pass) groups[r.group].pass++;
  else { groups[r.group].fail++; groups[r.group].failed.push(r); }
});

console.log('\n=== DOC-109 Phase 0 verification ===\n');
Object.keys(groups).sort().forEach(function (g) {
  var total = groups[g].pass + groups[g].fail;
  var mark = groups[g].fail === 0 ? 'PASS' : 'FAIL';
  console.log('  ' + g + ': ' + mark + ' -- ' + groups[g].pass + '/' + total);
  groups[g].failed.forEach(function (r) {
    console.log('      FAIL ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
  });
});

var totalPass = results.filter(function (r) { return r.pass; }).length;
var totalFail = results.length - totalPass;
console.log('\n  TOTAL: ' + totalPass + '/' + results.length +
            (totalFail === 0 ? '  all green' : '  ' + totalFail + ' failure(s)'));

try {
  fs.readdirSync(_tmpDir).forEach(function (f) { fs.unlinkSync(path.join(_tmpDir, f)); });
  fs.rmdirSync(_tmpDir);
} catch (e) { /* best effort */ }

process.exit(totalFail === 0 ? 0 : 1);

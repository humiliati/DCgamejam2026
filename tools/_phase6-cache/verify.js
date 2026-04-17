#!/usr/bin/env node
/**
 * DOC-107 Phase 6 — verification harness.
 *
 * Runs four groups of assertions against the shipped Phase 6 surface:
 *
 *   G1 — extract-floors pipeline emits data/quest-sidecars.js with
 *        both authored anchors (pentagram_chamber + home_work_keys_chest)
 *        aggregated from tools/floor-payloads/*.quest.json.
 *
 *   G2 — schema coverage: both sidecars parse, every required field is
 *        present, anchor specs are well-formed, floorId matches filename.
 *
 *   G3 — QuestRegistry.init(payload, floorAnchors, distributedAnchors)
 *        correctly unions the two anchor sources. Both anchors resolvable
 *        by name, source correctly tagged, central vs distributed lists
 *        partition cleanly.
 *
 *   G4 — fail-fast: (a) injecting a quest step that references an unknown
 *        anchor surfaces an 'unresolved-anchor' entry in initErrors;
 *        (b) injecting a distributed anchor that collides with a central
 *        one pushes an 'anchor-collision' entry and keeps central wins.
 *
 * Fresh-inode cache-bust pattern: every file we read goes through
 * `freshRead(relPath)` which first copies the file to /tmp with a unique
 * suffix, then readFileSync's the /tmp copy. This side-steps the bindfs
 * mount cache so mid-session Edit tool writes are always visible.
 *
 * Usage: node tools/_phase6-cache/verify.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var os   = require('os');

var ROOT = path.resolve(__dirname, '..', '..');

// ── Fresh-inode read to bypass bindfs cache ──────────────────────────
var _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-'));
var _readCounter = 0;
function freshRead(relPath) {
  var src = path.join(ROOT, relPath);
  var dst = path.join(_tmpDir, (_readCounter++) + '-' + path.basename(relPath));
  fs.copyFileSync(src, dst);
  return fs.readFileSync(dst, 'utf8');
}

// ── Assertion plumbing ───────────────────────────────────────────────
var results = [];
function assert(group, name, cond, detail) {
  results.push({ group: group, name: name, pass: !!cond, detail: detail || '' });
}

// ─────────────────────────────────────────────────────────────────────
// G1 — extract-floors emits the quest-sidecars runtime blob
// ─────────────────────────────────────────────────────────────────────
var qsPath = path.join(ROOT, 'data', 'quest-sidecars.js');
assert('G1', 'data/quest-sidecars.js exists', fs.existsSync(qsPath));

var qsSrc = freshRead('data/quest-sidecars.js');
var qsCtx = { window: {} };
vm.createContext(qsCtx);
try {
  vm.runInContext(qsSrc, qsCtx, { filename: 'data/quest-sidecars.js' });
  assert('G1', 'quest-sidecars.js evaluates cleanly', true);
} catch (e) {
  assert('G1', 'quest-sidecars.js evaluates cleanly', false, e.message);
}
var QS = qsCtx.window.QUEST_SIDECARS;
assert('G1', 'window.QUEST_SIDECARS is an object', !!(QS && typeof QS === 'object'));
assert('G1', 'QUEST_SIDECARS.anchors is an object', !!(QS && QS.anchors && typeof QS.anchors === 'object'));
assert('G1', 'QUEST_SIDECARS.anchorSources is an object', !!(QS && QS.anchorSources && typeof QS.anchorSources === 'object'));
assert('G1', 'QUEST_SIDECARS.floorQuests is an object', !!(QS && QS.floorQuests && typeof QS.floorQuests === 'object'));
assert('G1', 'QUEST_SIDECARS.generated is an ISO string',
       !!(QS && typeof QS.generated === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(QS.generated)));
assert('G1', 'pentagram_chamber anchor present in runtime blob',
       !!(QS && QS.anchors && QS.anchors.pentagram_chamber));
assert('G1', 'home_work_keys_chest anchor present in runtime blob',
       !!(QS && QS.anchors && QS.anchors.home_work_keys_chest));
assert('G1', 'pentagram_chamber source tagged to 1.3.1.quest.json',
       QS && QS.anchorSources && QS.anchorSources.pentagram_chamber === '1.3.1.quest.json');
assert('G1', 'home_work_keys_chest source tagged to 1.6.quest.json',
       QS && QS.anchorSources && QS.anchorSources.home_work_keys_chest === '1.6.quest.json');
assert('G1', 'anchorCount == 2', QS && QS.anchorCount === 2);
assert('G1', 'collisionCount == 0', QS && QS.collisionCount === 0);

// ─────────────────────────────────────────────────────────────────────
// G2 — schema coverage on the sidecar files
// ─────────────────────────────────────────────────────────────────────
var SIDECAR_FIXTURES = [
  { rel: 'tools/floor-payloads/1.3.1.quest.json',
    floorId: '1.3.1',
    anchorIds: ['pentagram_chamber'],
    coords: { pentagram_chamber: { x: 14, y: 8 } } },
  { rel: 'tools/floor-payloads/1.6.quest.json',
    floorId: '1.6',
    anchorIds: ['home_work_keys_chest'],
    coords: { home_work_keys_chest: { x: 19, y: 3 } } }
];

SIDECAR_FIXTURES.forEach(function (fx) {
  var raw = freshRead(fx.rel);
  var doc = null;
  try { doc = JSON.parse(raw); } catch (e) {
    assert('G2', fx.rel + ' parses as JSON', false, e.message); return;
  }
  assert('G2', fx.rel + ' parses as JSON', true);
  assert('G2', fx.rel + ' version=1', doc.version === 1);
  assert('G2', fx.rel + ' floorId matches filename', doc.floorId === fx.floorId);
  assert('G2', fx.rel + ' has anchors block', !!(doc.anchors && typeof doc.anchors === 'object'));

  fx.anchorIds.forEach(function (aid) {
    var spec = doc.anchors && doc.anchors[aid];
    assert('G2', fx.rel + ' anchor[' + aid + '] exists', !!spec);
    if (!spec) return;
    assert('G2', fx.rel + ' anchor[' + aid + '] type=literal', spec.type === 'literal');
    assert('G2', fx.rel + ' anchor[' + aid + '] floorId=' + fx.floorId, spec.floorId === fx.floorId);
    assert('G2', fx.rel + ' anchor[' + aid + '] x=' + fx.coords[aid].x, spec.x === fx.coords[aid].x);
    assert('G2', fx.rel + ' anchor[' + aid + '] y=' + fx.coords[aid].y, spec.y === fx.coords[aid].y);
  });
});

// Cross-file uniqueness — no anchor id is defined in multiple sidecars.
var seen = {};
var crossCollision = false;
SIDECAR_FIXTURES.forEach(function (fx) {
  var doc = JSON.parse(freshRead(fx.rel));
  Object.keys(doc.anchors || {}).forEach(function (aid) {
    if (seen[aid]) crossCollision = true;
    seen[aid] = fx.rel;
  });
});
assert('G2', 'no cross-sidecar anchor id collisions', !crossCollision);

// ─────────────────────────────────────────────────────────────────────
// G3 — QuestRegistry unions distributed anchors into _namedAnchors
// ─────────────────────────────────────────────────────────────────────
function loadQuestRegistry() {
  var ctx = { window: {}, console: { warn: function () {}, log: function () {}, error: function () {} } };
  vm.createContext(ctx);
  // QuestTypes is a zero-dependency foundation module but quest-registry
  // does not require it for init; skip to keep the harness minimal.
  vm.runInContext(freshRead('engine/quest-registry.js'), ctx,
                  { filename: 'engine/quest-registry.js' });
  return ctx.QuestRegistry;
}

// Build a minimal synthetic payload with a central anchor already present.
var centralPayload = {
  version: 1,
  _source: 'harness',
  anchors: {
    promenade_home_door: { type: 'literal', floorId: '1', x: 22, y: 27 }
  },
  quests: []
};
var sidecarAnchors = JSON.parse(freshRead('tools/floor-payloads/1.3.1.quest.json')).anchors;
var sidecarAnchors2 = JSON.parse(freshRead('tools/floor-payloads/1.6.quest.json')).anchors;
var distributedUnion = {};
Object.keys(sidecarAnchors).forEach(function (k) { distributedUnion[k] = sidecarAnchors[k]; });
Object.keys(sidecarAnchors2).forEach(function (k) { distributedUnion[k] = sidecarAnchors2[k]; });

var QR = loadQuestRegistry();
var ok = QR.init(centralPayload, {}, distributedUnion);
assert('G3', 'QuestRegistry.init returns true with clean inputs', ok === true);
assert('G3', 'init errors empty after clean init', QR.getInitErrors().length === 0);
assert('G3', 'central anchor promenade_home_door resolvable',
       !!QR.getAnchor('promenade_home_door'));
assert('G3', 'distributed anchor pentagram_chamber resolvable',
       !!QR.getAnchor('pentagram_chamber'));
assert('G3', 'distributed anchor home_work_keys_chest resolvable',
       !!QR.getAnchor('home_work_keys_chest'));
assert('G3', 'promenade_home_door source=central',
       QR.getAnchorSource('promenade_home_door') === 'central');
assert('G3', 'pentagram_chamber source=distributed',
       QR.getAnchorSource('pentagram_chamber') === 'distributed');
assert('G3', 'home_work_keys_chest source=distributed',
       QR.getAnchorSource('home_work_keys_chest') === 'distributed');
assert('G3', 'listAnchors contains all three',
       QR.listAnchors().length === 3);
assert('G3', 'listCentralAnchors == [promenade_home_door]',
       QR.listCentralAnchors().length === 1 && QR.listCentralAnchors()[0] === 'promenade_home_door');
assert('G3', 'listDistributedAnchors.length === 2',
       QR.listDistributedAnchors().length === 2);
assert('G3', 'summary().centralAnchorCount === 1',
       QR.summary().centralAnchorCount === 1);
assert('G3', 'summary().distributedAnchorCount === 2',
       QR.summary().distributedAnchorCount === 2);
assert('G3', 'summary().anchorCount === 3',
       QR.summary().anchorCount === 3);
assert('G3', 'resolveAnchor(pentagram_chamber) returns coords',
       (function () {
         var r = QR.resolveAnchor('pentagram_chamber');
         return r && r.floorId === '1.3.1' && r.x === 14 && r.y === 8;
       })());
assert('G3', 'resolveAnchor(home_work_keys_chest) returns coords',
       (function () {
         var r = QR.resolveAnchor('home_work_keys_chest');
         return r && r.floorId === '1.6' && r.x === 19 && r.y === 3;
       })());

// Floor-quest index with Phase 6 shape (array of quest defs, not strings).
var QR2 = loadQuestRegistry();
var floorAnchorsObj = {
  '1.3.1': [{ id: 'side.1.3.1.pentagram_wash', kind: 'side' }],
  '1.6':   [{ id: 'side.1.6.home_keys', kind: 'side' }]
};
QR2.init({ version: 1, quests: [], anchors: {} }, floorAnchorsObj, {});
assert('G3', 'floorQuestIndex accepts quest-def shape',
       QR2.anchorsFor('1.3.1').length === 1 && QR2.anchorsFor('1.3.1')[0] === 'side.1.3.1.pentagram_wash');

// ─────────────────────────────────────────────────────────────────────
// G4 — fail-fast validation
// ─────────────────────────────────────────────────────────────────────

// (a) Unknown anchor reference in a quest step should surface an error.
var QR3 = loadQuestRegistry();
var payloadWithBadRef = {
  version: 1, _source: 'harness',
  anchors: { good_anchor: { type: 'literal', floorId: '1', x: 1, y: 1 } },
  quests: [
    { id: 'side.test.bad', kind: 'side', steps: [
      { id: 'step.1', kind: 'floor',
        target: { anchor: 'nope_unknown_anchor' },
        advanceWhen: { kind: 'floor', floorId: '1' } }
    ] },
    { id: 'side.test.good', kind: 'side', steps: [
      { id: 'step.1', kind: 'floor',
        target: { anchor: 'good_anchor' },
        advanceWhen: { kind: 'floor', floorId: '1' } }
    ] }
  ]
};
var ok3 = QR3.init(payloadWithBadRef, {}, {});
assert('G4', 'init() returns false when unresolved anchor ref present', ok3 === false);
var errs3 = QR3.getInitErrors();
assert('G4', 'initErrors has at least one entry after bad ref', errs3.length >= 1);
var unresolved = errs3.filter(function (e) { return e.kind === 'unresolved-anchor'; });
assert('G4', 'unresolved-anchor error logged', unresolved.length === 1);
assert('G4', 'unresolved-anchor names the missing id',
       unresolved[0] && unresolved[0].anchor === 'nope_unknown_anchor');
assert('G4', 'unresolved-anchor names the quest',
       unresolved[0] && unresolved[0].quest === 'side.test.bad');
assert('G4', 'good quest ref does NOT trigger error',
       !errs3.some(function (e) {
         return e.kind === 'unresolved-anchor' && e.quest === 'side.test.good';
       }));

// (b) Anchor collision between central and distributed should log and reject
//     the distributed one.
var QR4 = loadQuestRegistry();
var colPayload = {
  version: 1, _source: 'harness',
  anchors: { dupe_id: { type: 'literal', floorId: '1', x: 10, y: 10 } },
  quests: []
};
var colDistributed = {
  dupe_id: { type: 'literal', floorId: '9', x: 99, y: 99 }
};
QR4.init(colPayload, {}, colDistributed);
var errs4 = QR4.getInitErrors();
var collisions = errs4.filter(function (e) { return e.kind === 'anchor-collision'; });
assert('G4', 'anchor-collision error logged', collisions.length === 1);
assert('G4', 'collision names the dupe anchor',
       collisions[0] && collisions[0].anchor === 'dupe_id');
// Central wins: the stored anchor is still the central def (x=10, y=10).
var winner = QR4.getAnchor('dupe_id');
assert('G4', 'central wins on collision (x=10)', winner && winner.x === 10);
assert('G4', 'central wins on collision (y=10)', winner && winner.y === 10);
assert('G4', 'collision anchor still tagged central',
       QR4.getAnchorSource('dupe_id') === 'central');

// (c) Malformed distributed anchor (missing type + coords) should be
//     rejected with an anchor-malformed entry but not take anything down.
var QR5 = loadQuestRegistry();
QR5.init({ version: 1, quests: [], anchors: {} }, {}, { bad_spec: { floorId: '1' } });
var malformed = QR5.getInitErrors().filter(function (e) { return e.kind === 'anchor-malformed'; });
assert('G4', 'malformed distributed anchor rejected with error', malformed.length === 1);
assert('G4', 'malformed anchor not present in registry',
       QR5.getAnchor('bad_spec') === null);

// ── Report ───────────────────────────────────────────────────────────
var groups = {};
results.forEach(function (r) {
  if (!groups[r.group]) groups[r.group] = { pass: 0, fail: 0, failed: [] };
  if (r.pass) groups[r.group].pass++;
  else { groups[r.group].fail++; groups[r.group].failed.push(r); }
});

console.log('\n═══ DOC-107 Phase 6 verification ═══\n');
Object.keys(groups).sort().forEach(function (g) {
  var total = groups[g].pass + groups[g].fail;
  var mark = groups[g].fail === 0 ? 'PASS' : 'FAIL';
  console.log('  ' + g + ': ' + mark + ' — ' + groups[g].pass + '/' + total);
  groups[g].failed.forEach(function (r) {
    console.log('      ✗ ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
  });
});

var totalPass = results.filter(function (r) { return r.pass; }).length;
var totalFail = results.length - totalPass;
console.log('\n  TOTAL: ' + totalPass + '/' + results.length +
            (totalFail === 0 ? '  ✓ all green' : '  ✗ ' + totalFail + ' failure(s)'));

// Cleanup tmpdir
try {
  fs.readdirSync(_tmpDir).forEach(function (f) { fs.unlinkSync(path.join(_tmpDir, f)); });
  fs.rmdirSync(_tmpDir);
} catch (e) { /* best effort */ }

process.exit(totalFail === 0 ? 0 : 1);

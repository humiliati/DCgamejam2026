#!/usr/bin/env node
/**
 * DOC-109 Phase 1 — ReadinessCalc event-bus verification.
 *
 * Four groups of assertions against the Phase 1 surface:
 *
 *   G1 — score-change basics: on()/off() wire up; markDirty triggers a
 *        microtask flush that emits 'score-change' with (floorId, prev,
 *        next); repeating markDirty with no state change is deduped;
 *        off() unsubscribes cleanly.
 *
 *   G2 — microtask debounce: N synchronous markDirty calls in the same
 *        tick collapse into a single flush; multi-floor dirty set emits
 *        one event per distinct floor; changed state between flushes
 *        emits fresh prev/next.
 *
 *   G3 — group-score-change aggregation: per-floor change propagates up
 *        to a 'group-score-change' emit for the containing DungeonSchedule
 *        group; mean math is correct; unrelated groups don't emit.
 *
 *   G4 — invalidate(): force re-emit for every scheduled floor + group,
 *        bypassing the value-diff dedup; cache rebuilds so subsequent
 *        no-op markDirty is still deduped.
 *
 * Fresh-inode cache-bust pattern (same as verify-phase0.js + phase6):
 * every source file we eval is copied to /tmp with a unique suffix
 * before read, so mid-session Edit tool writes to the bindfs mount are
 * guaranteed visible to Node.
 *
 * Usage: node tools/_debrief-categories-cache/verify-phase1.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var os   = require('os');

var ROOT = path.resolve(__dirname, '..', '..');

var _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-'));
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

// Drain the microtask queue. setImmediate fires on the next event-loop
// iteration — all already-queued microtasks (including our _flush) have
// completed by then. Awaiting this guarantees the event bus has emitted.
function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

// Mutable per-sandbox store for readiness inputs. The four subsystem
// mocks all return `scores[fid]`, so with default weights
// (crate 0.35 + clean 0.25 + torch 0.20 + trap 0.20 = 1.0) we get
// getCoreScore(fid) === scores[fid]. Clean round-trips for assertions.
function makeSandbox(scores, schedule) {
  var ctx = {
    console:  console,
    Promise:  Promise,
    setTimeout: setTimeout,
    setImmediate: setImmediate,
    CrateSystem: {
      getReadinessByType: function (fid) {
        return { crate: scores[fid] || 0, corpse: 0 };
      }
    },
    CleaningSystem: { getReadiness: function (fid) { return scores[fid] || 0; } },
    TorchState:     { getReadiness: function (fid) { return scores[fid] || 0; } },
    TrapRearm:      { getReadiness: function (fid) { return scores[fid] || 0; } },
    CobwebSystem:   { getIntact:    function ()    { return []; } },
    DungeonSchedule: {
      getSchedule: function () { return schedule; }
    }
  };
  vm.createContext(ctx);
  var src = freshRead('engine/readiness-calc.js');
  vm.runInContext(src, ctx, { filename: 'engine/readiness-calc.js' });
  return ctx;
}

// Canonical schedule used across groups. Mirrors the real 3-group
// hero-day layout (spade / club / diamond).
function mkSchedule() {
  return [
    { groupId: 'spade',   floorIds: ['1.3.1'] },
    { groupId: 'club',    floorIds: ['2.2.1', '2.2.2'] },
    { groupId: 'diamond', floorIds: ['3.1.1', '3.1.2', '3.1.3'] }
  ];
}

// Tolerance for float equality (group means produce 1/3 + 2/3 etc.).
function near(a, b) { return Math.abs(a - b) < 1e-9; }

// ── G1 — score-change basics ───────────────────────────────────────
(async function g1() {
  var scores = { '1.3.1': 0.5, '2.2.1': 0.3, '2.2.2': 0.7,
                 '3.1.1': 0.2, '3.1.2': 0.4, '3.1.3': 0.6 };
  var ctx = makeSandbox(scores, mkSchedule());
  var RC = ctx.ReadinessCalc;

  assert('G1', 'ReadinessCalc global defined', typeof RC === 'object' && RC !== null);
  assert('G1', 'on/off/markDirty/getGroupScore/invalidate exported',
         typeof RC.on === 'function' && typeof RC.off === 'function' &&
         typeof RC.markDirty === 'function' && typeof RC.getGroupScore === 'function' &&
         typeof RC.invalidate === 'function');

  var events = [];
  var listener = function (fid, prev, next) { events.push([fid, prev, next]); };
  assert('G1', 'on(score-change) returns true', RC.on('score-change', listener) === true);

  // Nothing fired yet
  assert('G1', 'no emits before any markDirty', events.length === 0);

  RC.markDirty('1.3.1');
  assert('G1', 'markDirty is synchronous — no emit yet', events.length === 0);
  await flush();

  assert('G1', 'one emit after flush', events.length === 1);
  assert('G1', 'emit args = (floorId, null, 0.5)',
         events[0][0] === '1.3.1' && events[0][1] === null && near(events[0][2], 0.5));

  // Same markDirty with unchanged state = no re-emit (diff suppression)
  RC.markDirty('1.3.1');
  await flush();
  assert('G1', 'no re-emit for unchanged value', events.length === 1);

  // Mutate the underlying score, markDirty again
  scores['1.3.1'] = 0.8;
  RC.markDirty('1.3.1');
  await flush();
  assert('G1', 'emit fires after score moves', events.length === 2);
  assert('G1', 'emit args = (floorId, 0.5, 0.8)',
         events[1][0] === '1.3.1' && near(events[1][1], 0.5) && near(events[1][2], 0.8));

  // off() — listener silenced
  assert('G1', 'off(score-change) returns true', RC.off('score-change', listener) === true);
  scores['1.3.1'] = 0.1;
  RC.markDirty('1.3.1');
  await flush();
  assert('G1', 'no emit after off()', events.length === 2);

  assert('G1', 'markDirty with bad input returns false',
         RC.markDirty('') === false && RC.markDirty(null) === false);
})();

// ── G2 — microtask debounce ────────────────────────────────────────
(async function g2() {
  var scores = { '1.3.1': 0.5, '2.2.1': 0.3, '2.2.2': 0.7,
                 '3.1.1': 0.2, '3.1.2': 0.4, '3.1.3': 0.6 };
  var ctx = makeSandbox(scores, mkSchedule());
  var RC = ctx.ReadinessCalc;

  var emits = [];
  RC.on('score-change', function (fid, prev, next) {
    emits.push({ fid: fid, prev: prev, next: next });
  });

  // 3 synchronous markDirty calls on the SAME floor → 1 emit
  RC.markDirty('1.3.1');
  RC.markDirty('1.3.1');
  RC.markDirty('1.3.1');
  await flush();
  assert('G2', '3x markDirty same floor → 1 emit', emits.length === 1);
  assert('G2', 'debounced emit = (1.3.1, null, 0.5)',
         emits[0].fid === '1.3.1' && emits[0].prev === null && near(emits[0].next, 0.5));

  emits.length = 0;
  // Multiple floors in same tick → one emit each, single flush
  RC.markDirty('2.2.1');
  RC.markDirty('2.2.2');
  RC.markDirty('3.1.1');
  await flush();
  assert('G2', '3 distinct floors → 3 emits', emits.length === 3);
  var fids = emits.map(function (e) { return e.fid; }).sort();
  assert('G2', 'emits cover all 3 floors',
         fids.join(',') === '2.2.1,2.2.2,3.1.1');

  emits.length = 0;
  // Change score between flushes — fresh prev/next
  scores['2.2.1'] = 0.9;
  RC.markDirty('2.2.1');
  await flush();
  assert('G2', 'post-change emit has updated prev/next',
         emits.length === 1 &&
         near(emits[0].prev, 0.3) && near(emits[0].next, 0.9));
})();

// ── G3 — group-score-change aggregation ────────────────────────────
(async function g3() {
  var scores = { '1.3.1': 0.5, '2.2.1': 0.3, '2.2.2': 0.7,
                 '3.1.1': 0.2, '3.1.2': 0.4, '3.1.3': 0.6 };
  var ctx = makeSandbox(scores, mkSchedule());
  var RC = ctx.ReadinessCalc;

  // Read-through computation (no mutation, no event)
  assert('G3', 'getGroupScore(spade) mean of [0.5] = 0.5',
         near(RC.getGroupScore('spade'), 0.5));
  assert('G3', 'getGroupScore(club) mean of [0.3,0.7] = 0.5',
         near(RC.getGroupScore('club'), 0.5));
  assert('G3', 'getGroupScore(diamond) mean of [0.2,0.4,0.6] = 0.4',
         near(RC.getGroupScore('diamond'), 0.4));
  assert('G3', 'getGroupScore(unknown) returns 0',
         RC.getGroupScore('unknown') === 0);

  var groupEmits = [];
  RC.on('group-score-change', function (gid, prev, next) {
    groupEmits.push({ gid: gid, prev: prev, next: next });
  });

  // Mutate a spade-group floor — only spade emits
  scores['1.3.1'] = 0.9;
  RC.markDirty('1.3.1');
  await flush();
  assert('G3', 'spade group emitted',
         groupEmits.length === 1 && groupEmits[0].gid === 'spade');
  assert('G3', 'group emit args = (spade, null, 0.9)',
         groupEmits[0].prev === null && near(groupEmits[0].next, 0.9));

  groupEmits.length = 0;
  // Mutate a club-group floor — only club emits
  scores['2.2.1'] = 0.9;  // club was 0.5, becomes (0.9+0.7)/2 = 0.8
  RC.markDirty('2.2.1');
  await flush();
  assert('G3', 'club group emitted once',
         groupEmits.length === 1 && groupEmits[0].gid === 'club');
  assert('G3', 'club mean recomputed to 0.8',
         near(groupEmits[0].next, 0.8));

  groupEmits.length = 0;
  // Prime the diamond cache by touching one floor. First emit is expected
  // (gHad=false → bypasses dedup). After this, _lastGroupScore['diamond']
  // holds the current mean (0.4), so a same-mean mutation will dedup.
  RC.markDirty('3.1.2');
  await flush();
  assert('G3', 'diamond group primes with first mutation',
         groupEmits.length === 1 && groupEmits[0].gid === 'diamond' &&
         near(groupEmits[0].next, 0.4));

  groupEmits.length = 0;
  // Mutate diamond floors to preserve the mean: [0.2,0.4,0.6] mean 0.4 →
  // [0.0,0.4,0.8] mean 0.4. Two score-change emits fire, but group dedup
  // should suppress the group emit because gPrev === gNext.
  scores['3.1.1'] = 0.0;
  scores['3.1.3'] = 0.8;
  RC.markDirty('3.1.1');
  RC.markDirty('3.1.3');
  await flush();
  assert('G3', 'diamond group dedup: mean unchanged → no group emit',
         groupEmits.length === 0);
})();

// ── G4 — invalidate() ──────────────────────────────────────────────
(async function g4() {
  var scores = { '1.3.1': 0.5, '2.2.1': 0.3, '2.2.2': 0.7,
                 '3.1.1': 0.2, '3.1.2': 0.4, '3.1.3': 0.6 };
  var ctx = makeSandbox(scores, mkSchedule());
  var RC = ctx.ReadinessCalc;

  var emits = [];
  var groupEmits = [];
  RC.on('score-change', function (fid, prev, next) {
    emits.push({ fid: fid, prev: prev, next: next });
  });
  RC.on('group-score-change', function (gid, prev, next) {
    groupEmits.push({ gid: gid, prev: prev, next: next });
  });

  // Cold invalidate — no prior cache. Every scheduled floor + group emits.
  RC.invalidate();
  await flush();
  assert('G4', 'invalidate emits every scheduled floor (6)', emits.length === 6);
  var fids = emits.map(function (e) { return e.fid; }).sort();
  assert('G4', 'invalidate covers 1.3.1,2.2.1,2.2.2,3.1.1,3.1.2,3.1.3',
         fids.join(',') === '1.3.1,2.2.1,2.2.2,3.1.1,3.1.2,3.1.3');
  assert('G4', 'invalidate emits every scheduled group (3)',
         groupEmits.length === 3);
  var gids = groupEmits.map(function (e) { return e.gid; }).sort();
  assert('G4', 'invalidate covers spade,club,diamond',
         gids.join(',') === 'club,diamond,spade');

  // Cache now populated. A fresh markDirty with unchanged value should be
  // deduped (no emit).
  emits.length = 0;
  groupEmits.length = 0;
  RC.markDirty('1.3.1');
  await flush();
  assert('G4', 'post-invalidate cache dedup: no emit for unchanged value',
         emits.length === 0 && groupEmits.length === 0);

  // invalidate() re-emits even when values unchanged (forceAll bypasses diff)
  RC.invalidate();
  await flush();
  assert('G4', 'second invalidate re-emits all 6 floors despite cache',
         emits.length === 6);
  assert('G4', 'second invalidate re-emits all 3 groups despite cache',
         groupEmits.length === 3);
})();

// ── Report ─────────────────────────────────────────────────────────
// All IIFEs above are async — schedule the reporter after they resolve.
// They were kicked off synchronously in script order, so a setImmediate
// chained twice gets us past all awaited flush() calls comfortably.
setImmediate(function () { setImmediate(function () { setImmediate(reportOnce); }); });

// In case the async chains are deeper than expected, allow a handful of
// extra ticks before giving up and printing whatever we have.
var _reported = false;
function reportOnce() {
  if (_reported) return;
  _reported = true;

  var groups = {};
  results.forEach(function (r) {
    if (!groups[r.group]) groups[r.group] = { pass: 0, fail: 0, fails: [] };
    if (r.pass) groups[r.group].pass++;
    else { groups[r.group].fail++; groups[r.group].fails.push(r); }
  });

  var totalPass = 0, totalFail = 0;
  Object.keys(groups).sort().forEach(function (g) {
    var s = groups[g];
    totalPass += s.pass; totalFail += s.fail;
    console.log(g + ': ' + s.pass + ' pass' +
                (s.fail ? ', ' + s.fail + ' FAIL' : ''));
    s.fails.forEach(function (f) {
      console.log('   x ' + f.name + (f.detail ? ' -- ' + f.detail : ''));
    });
  });
  console.log('---');
  console.log('TOTAL: ' + totalPass + '/' + (totalPass + totalFail));
  process.exit(totalFail ? 1 : 0);
}

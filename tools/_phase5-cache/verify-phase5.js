#!/usr/bin/env node
/**
 * DOC-109 Phase 5 — Auto-retract on activity verification.
 *
 * Fresh-inode harness: loads tools/_phase5-cache/_fresh-debrief-feed.js
 * into a sandboxed VM context with a fake clock + fake setTimeout so the
 * retract policy can be exercised deterministically without real waits.
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var SRC_PATH = path.join(ROOT, 'tools/_phase5-cache/_fresh-debrief-feed.js');

var results = [];
function assert(group, name, cond, detail) {
  results.push({ group: group, name: name, pass: !!cond, detail: detail || '' });
}

function makeEl(id) {
  return {
    id: id, innerHTML: '', textContent: '', style: {},
    classList: {
      _set: {},
      add:    function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    },
    _listeners: {},
    addEventListener: function (ev, fn) {
      (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    },
    offsetWidth: 273,
    getBoundingClientRect: function () {
      return { left: 0, top: 0, right: 273, bottom: 100, width: 273, height: 100 };
    },
    scrollTop: 0, scrollHeight: 100
  };
}

function makeDoc() {
  var els = {
    'debrief-feed': makeEl('debrief-feed'),
    'df-header':    makeEl('df-header'),
    'df-content':   makeEl('df-content'),
    'view-canvas':  makeEl('view-canvas')
  };
  return { _els: els, getElementById: function (id) { return els[id] || null; } };
}

function makeClock(startMs) {
  var now = startMs || 1000000;
  var timers = [];
  var nextId = 1;
  return {
    now: function () { return now; },
    set: function (ms) { now = ms; },
    advance: function (ms) {
      now += ms;
      var due = timers.filter(function (t) { return t.fireAt <= now; });
      for (var i = 0; i < due.length; i++) {
        var idx = timers.indexOf(due[i]);
        if (idx >= 0) timers.splice(idx, 1);
        try { due[i].fn(); } catch (e) {}
      }
    },
    setTimeout: function (fn, delay) {
      var id = nextId++;
      timers.push({ id: id, fn: fn, fireAt: now + (delay || 0) });
      return id;
    },
    clearTimeout: function (id) {
      for (var i = 0; i < timers.length; i++) {
        if (timers[i].id === id) { timers.splice(i, 1); return; }
      }
    },
    pendingCount: function () { return timers.length; }
  };
}

function makeSandbox(clock) {
  var dateStub = { now: clock.now };
  var ctx = {
    console: console,
    Promise: Promise,
    setTimeout:  clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setImmediate: setImmediate,
    requestAnimationFrame: function () { return 0; },
    performance: { now: clock.now },
    Date: dateStub,
    document: makeDoc(),
    Player: {
      state: function () {
        return { hp: 10, maxHp: 10, energy: 5, maxEnergy: 5,
                 battery: 3, maxBattery: 5, currency: 0,
                 str: 1, dex: 1, stealth: 1 };
      },
      getFatigue:    function () { return 0; },
      getMaxFatigue: function () { return 100; }
    },
    QuestTypes: {
      REP_TIERS: [
        { id: 'hated',      min: -Infinity },
        { id: 'unfriendly', min: -500 },
        { id: 'neutral',    min: 0 },
        { id: 'friendly',   min: 500 },
        { id: 'allied',     min: 2500 },
        { id: 'exalted',    min: 10000 }
      ]
    }
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  var src = fs.readFileSync(SRC_PATH, 'utf8');
  vm.runInContext(src, ctx, { filename: 'engine/debrief-feed.js' });
  ctx.DebriefFeed.init();
  ctx.DebriefFeed.show();
  // Drain the 50ms _updateIncineratorBounds bootstrap timer from show().
  var startMs = clock.now();
  clock.advance(50);
  clock.set(startMs);
  return ctx;
}

// G1
(function g1() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  assert('G1', 'expandedAtTs=0 initially',
    DF.getCategoryState('readiness').expandedAtTs === 0 &&
    DF.getCategoryState('relationships').expandedAtTs === 0);
  assert('G1', '_getPendingRetractCount exported',
    typeof DF._getPendingRetractCount === 'function');
  assert('G1', 'no pending timers at init',
    DF._getPendingRetractCount() === 0 && clock.pendingCount() === 0);
  DF.expandCategory('readiness');
  assert('G1', 'expandCategory stamps expandedAtTs',
    DF.getCategoryState('readiness').expandedAtTs === 1000000);
})();

// G2
(function g2() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.updateRelationship('faction', 'bprd', 100, 'neutral');
  assert('G2', 'updateRelationship on unexpanded cat -> no timer',
    DF._getPendingRetractCount('relationships') === 0 &&
    clock.pendingCount() === 0);
  DF.updateReadiness('spade', 0.25);
  assert('G2', 'updateReadiness on unexpanded cat -> no timer',
    DF._getPendingRetractCount('readiness') === 0 &&
    clock.pendingCount() === 0);
})();

// G3
(function g3() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  clock.advance(300);
  DF.updateRelationship('faction', 'bprd', 100, 'friendly');
  assert('G3', '+300ms inside grace window -> no retract',
    DF._getPendingRetractCount('relationships') === 0);
  clock.advance(299);
  DF.updateRelationship('faction', 'bprd', 150, 'friendly');
  assert('G3', '+599ms still inside grace window -> no retract',
    DF._getPendingRetractCount('relationships') === 0);
})();

// G4
(function g4() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  clock.advance(700);
  DF.updateRelationship('faction', 'bprd', 100, 'friendly');
  assert('G4', '+700ms past grace -> retract scheduled',
    DF._getPendingRetractCount('relationships') === 1 &&
    clock.pendingCount() === 1);
  assert('G4', 'cat still expanded immediately after scheduling',
    DF.getCategoryState('relationships').expanded === true);
  clock.advance(599);
  assert('G4', '+599ms after schedule -> no fire yet',
    DF.getCategoryState('relationships').expanded === true &&
    DF._getPendingRetractCount('relationships') === 1);
  clock.advance(1);
  assert('G4', '+600ms after schedule -> retract fires, cat collapses',
    DF.getCategoryState('relationships').expanded === false &&
    DF._getPendingRetractCount('relationships') === 0);
  assert('G4', 'retract preserves revealed=true',
    DF.getCategoryState('relationships').revealed === true);
})();

// G5
(function g5() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  clock.advance(700);
  DF.updateRelationship('faction', 'bprd', 100, 'friendly');
  assert('G5', 'first update schedules 1 timer',
    DF._getPendingRetractCount('relationships') === 1);
  clock.advance(300);
  DF.updateRelationship('faction', 'bprd', 200, 'friendly');
  assert('G5', 'second update re-arms (still 1 timer)',
    DF._getPendingRetractCount('relationships') === 1 &&
    clock.pendingCount() === 1);
  clock.advance(599);
  assert('G5', '+599ms since reset -> no fire',
    DF.getCategoryState('relationships').expanded === true &&
    DF._getPendingRetractCount('relationships') === 1);
  clock.advance(1);
  assert('G5', '+600ms since reset -> retract fires',
    DF.getCategoryState('relationships').expanded === false);
})();

// G6
(function g6() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  clock.advance(700);
  DF.updateRelationship('faction', 'bprd', 100, 'friendly');
  assert('G6', 'pending retract armed',
    DF._getPendingRetractCount('relationships') === 1);
  DF.collapseCategory('relationships');
  assert('G6', 'explicit collapseCategory clears pending retract',
    DF._getPendingRetractCount('relationships') === 0 &&
    clock.pendingCount() === 0 &&
    DF.getCategoryState('relationships').expanded === false);
  DF.expandCategory('relationships');
  clock.advance(10000);
  assert('G6', 'cat stays expanded after re-expand + large advance',
    DF.getCategoryState('relationships').expanded === true &&
    DF._getPendingRetractCount('relationships') === 0);
})();

// G7
(function g7() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  clock.advance(700);
  DF.updateRelationship('faction', 'bprd', 100, 'friendly');
  assert('G7', 'pending retract armed pre-toggle',
    DF._getPendingRetractCount('relationships') === 1);
  var nowExp = DF.toggleCategory('relationships');
  assert('G7', 'toggleCategory flipped to collapsed',
    nowExp === false &&
    DF.getCategoryState('relationships').expanded === false);
  assert('G7', 'toggle-to-collapse cleared pending retract',
    DF._getPendingRetractCount('relationships') === 0 &&
    clock.pendingCount() === 0);
})();

// G8
(function g8() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  clock.advance(700);
  DF.updateReadiness('spade', 0.25);
  assert('G8', 'update to collapsed readiness leaves both clean',
    DF._getPendingRetractCount('relationships') === 0 &&
    DF._getPendingRetractCount('readiness') === 0);
  DF.expandCategory('readiness');
  clock.advance(700);
  DF.updateReadiness('spade', 0.50);
  assert('G8', 'update to readiness arms readiness only',
    DF._getPendingRetractCount('readiness') === 1 &&
    DF._getPendingRetractCount('relationships') === 0);
  DF.updateRelationship('faction', 'bprd', 100, 'friendly');
  assert('G8', 'update to relationships arms its own timer',
    DF._getPendingRetractCount('readiness') === 1 &&
    DF._getPendingRetractCount('relationships') === 1 &&
    clock.pendingCount() === 2);
  clock.advance(600);
  assert('G8', 'both fire cleanly after +600ms',
    DF.getCategoryState('readiness').expanded === false &&
    DF.getCategoryState('relationships').expanded === false);
})();

// G9
(function g9() {
  var clock = makeClock(1000000);
  var DF = makeSandbox(clock).DebriefFeed;
  DF.expandCategory('relationships');
  assert('G9', 'first expand stamps expandedAtTs',
    DF.getCategoryState('relationships').expandedAtTs === 1000000);
  clock.advance(400);
  DF.expandCategory('relationships');
  assert('G9', 'idempotent expand does NOT re-stamp',
    DF.getCategoryState('relationships').expandedAtTs === 1000000);
  DF.collapseCategory('relationships');
  clock.advance(500);
  DF.expandCategory('relationships');
  assert('G9', 're-expand after collapse re-stamps',
    DF.getCategoryState('relationships').expandedAtTs === 1000900);
})();

// Summary
setImmediate(function () {
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
    console.log(g + ': ' + s.pass + ' pass' + (s.fail ? ', ' + s.fail + ' FAIL' : ''));
    s.fails.forEach(function (f) {
      console.log('   x ' + f.name + (f.detail ? ' -- ' + f.detail : ''));
    });
  });
  console.log('---');
  console.log('TOTAL: ' + totalPass + '/' + (totalPass + totalFail));
  process.exit(totalFail ? 1 : 0);
});

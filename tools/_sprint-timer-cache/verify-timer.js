#!/usr/bin/env node
/**
 * DOC-113 Phase C — DebriefFeed sprint timer row verification.
 *
 * Five contract groups:
 *   G1 — API surface + state lifecycle (show/update/hide, invalid-input
 *        guards, getTimerState mirror, null when inactive)
 *   G2 — Zone color CSS classes in rendered DOM (green/yellow/red)
 *   G3 — mm:ss format edge cases across remainMs values
 *   G4 — Expired state DOM swap (label change, hero message, 0% fill)
 *   G5 — Paused class toggle + zone color interaction
 *
 * Bindfs-cache caveat. engine/debrief-feed.js is pre-existing at session
 * boot, so the Node view of that path is frozen-stale. Workaround is the
 * byte-identical mirror at _fresh-debrief-feed.js, written THIS session
 * via the Write tool (new inodes are served hot). If you edit
 * debrief-feed.js, re-mirror before running this harness:
 *
 *   Read  engine/debrief-feed.js
 *   Write tools/_sprint-timer-cache/_fresh-debrief-feed.js (paste)
 *
 * Usage: node tools/_sprint-timer-cache/verify-timer.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var SRC_PATH = path.join(ROOT, 'tools/_sprint-timer-cache/_fresh-debrief-feed.js');

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

function makeSandbox() {
  var ctx = {
    console: console, Promise: Promise, setTimeout: setTimeout, setImmediate: setImmediate,
    requestAnimationFrame: function () { return 0; },
    performance: { now: function () { return Date.now(); } },
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
    // NOTE: deliberately omit i18n, StatusEffect, DragDrop, Toast,
    // AudioSystem, CardAuthority, SessionStats — debrief-feed.js uses
    // `typeof X === 'undefined'` guards on these. The timer row falls
    // through to fallback strings when i18n is absent, which is exactly
    // what we want to test against (translator output is out of scope
    // for this harness).
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  var src = fs.readFileSync(SRC_PATH, 'utf8');
  vm.runInContext(src, ctx, { filename: 'engine/debrief-feed.js' });
  ctx.DebriefFeed.init();
  ctx.DebriefFeed.show();
  return ctx;
}

function getHtml(ctx) {
  return ctx.document._els['df-content'].innerHTML;
}

function countSub(hay, needle) {
  if (!hay) return 0;
  var n = 0, i = 0;
  while (true) {
    var at = hay.indexOf(needle, i);
    if (at < 0) return n;
    n++;
    i = at + needle.length;
  }
}

// ── G1 — API surface + state lifecycle ────────────────────────────
(function g1() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  assert('G1', 'DebriefFeed global defined',
    typeof DF === 'object' && DF !== null);
  assert('G1', 'showTimer exported',      typeof DF.showTimer === 'function');
  assert('G1', 'updateTimer exported',    typeof DF.updateTimer === 'function');
  assert('G1', 'hideTimer exported',      typeof DF.hideTimer === 'function');
  assert('G1', 'getTimerState exported',  typeof DF.getTimerState === 'function');

  assert('G1', 'getTimerState starts null',
    DF.getTimerState() === null);

  assert('G1', 'initial DOM has no .df-timer-row',
    getHtml(ctx).indexOf('df-timer-row') < 0);

  // Invalid-input guards
  assert('G1', 'showTimer rejects missing questId',
    DF.showTimer('', 60000, 'seeker') === false);
  assert('G1', 'showTimer rejects non-string questId',
    DF.showTimer(null, 60000, 'seeker') === false);
  assert('G1', 'showTimer rejects zero totalMs',
    DF.showTimer('q1', 0, 'seeker') === false);
  assert('G1', 'showTimer rejects negative totalMs',
    DF.showTimer('q1', -5000, 'seeker') === false);
  assert('G1', 'showTimer rejects NaN totalMs',
    DF.showTimer('q1', NaN, 'seeker') === false);
  assert('G1', 'showTimer survives all rejections (still null)',
    DF.getTimerState() === null);

  // Update without active timer is a no-op
  assert('G1', 'updateTimer on inactive returns false',
    DF.updateTimer(30000, 0.5, 'green') === false);
  assert('G1', 'hideTimer on inactive returns false',
    DF.hideTimer() === false);

  // Start lifecycle
  var ok = DF.showTimer('sprint-1', 60000, 'sentinel');
  assert('G1', 'showTimer valid inputs returns true', ok === true);
  var s = DF.getTimerState();
  assert('G1', 'getTimerState returns active snapshot',
    s && s.questId === 'sprint-1' && s.totalMs === 60000 &&
    s.remainMs === 60000 && s.pct === 1 && s.zone === 'green' &&
    s.paused === false && s.heroArchetype === 'sentinel' &&
    s.heroName === 'The Sentinel');
  assert('G1', 'DOM has .df-timer-row after showTimer',
    getHtml(ctx).indexOf('df-timer-row') >= 0);

  // Update + zone transitions
  DF.updateTimer(30000, 0.5, 'yellow');
  var s2 = DF.getTimerState();
  assert('G1', 'updateTimer updates remainMs',  s2.remainMs === 30000);
  assert('G1', 'updateTimer updates pct',       s2.pct === 0.5);
  assert('G1', 'updateTimer updates zone',      s2.zone === 'yellow');
  assert('G1', 'updateTimer preserves questId', s2.questId === 'sprint-1');
  assert('G1', 'updateTimer preserves paused',  s2.paused === false);

  // Paused propagation
  DF.updateTimer(30000, 0.5, 'yellow', { paused: true });
  assert('G1', 'updateTimer opts.paused=true sticks',
    DF.getTimerState().paused === true);
  DF.updateTimer(28000, 0.46, 'yellow');
  assert('G1', 'omitting opts.paused preserves existing',
    DF.getTimerState().paused === true);

  // Unknown zone falls back to existing
  DF.updateTimer(28000, 0.46, 'rainbow');
  assert('G1', 'invalid zone string preserves previous zone',
    DF.getTimerState().zone === 'yellow');

  // hideTimer
  var h = DF.hideTimer();
  assert('G1', 'hideTimer on active returns true', h === true);
  assert('G1', 'getTimerState null after hideTimer',
    DF.getTimerState() === null);
  assert('G1', 'DOM clears .df-timer-row after hideTimer',
    getHtml(ctx).indexOf('df-timer-row') < 0);

  // Default archetype fallback — unknown string still accepted, uses label
  DF.showTimer('sprint-2', 45000, 'totally-invented');
  var s3 = DF.getTimerState();
  assert('G1', 'unknown archetype uses passed string',
    s3.heroArchetype === 'totally-invented');
  assert('G1', 'unknown archetype heroName falls back to generic',
    s3.heroName === 'The Hero');

  // Non-string archetype normalizes to 'seeker' default
  DF.hideTimer();
  DF.showTimer('sprint-3', 45000, null);
  var s4 = DF.getTimerState();
  assert('G1', 'null archetype defaults to seeker',
    s4.heroArchetype === 'seeker' && s4.heroName === 'The Seeker');
})();

// ── G2 — Zone color CSS classes in DOM output ─────────────────────
(function g2() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.showTimer('sprint-zones', 60000, 'pursuer');
  var hGreen = getHtml(ctx);
  assert('G2', 'green zone: df-timer-zone-green class present',
    hGreen.indexOf('df-timer-zone-green') >= 0);
  assert('G2', 'green zone: no yellow/red class',
    hGreen.indexOf('df-timer-zone-yellow') < 0 &&
    hGreen.indexOf('df-timer-zone-red')    < 0 &&
    hGreen.indexOf('df-timer-zone-expired') < 0);
  assert('G2', 'green zone: track + fill present',
    hGreen.indexOf('df-timer-track') >= 0 && hGreen.indexOf('df-timer-fill') >= 0);
  assert('G2', 'green zone: icon glyph U+23F1 present',
    hGreen.indexOf('\u23F1') >= 0);

  DF.updateTimer(30000, 0.5, 'yellow');
  var hYellow = getHtml(ctx);
  assert('G2', 'yellow zone: df-timer-zone-yellow class',
    hYellow.indexOf('df-timer-zone-yellow') >= 0);
  assert('G2', 'yellow zone: no green class',
    hYellow.indexOf('df-timer-zone-green') < 0);
  assert('G2', 'yellow zone: fill width ~50%',
    hYellow.indexOf('width:50.00%') >= 0);

  DF.updateTimer(15000, 0.25, 'red');
  var hRed = getHtml(ctx);
  assert('G2', 'red zone: df-timer-zone-red class',
    hRed.indexOf('df-timer-zone-red') >= 0);
  assert('G2', 'red zone: no yellow class',
    hRed.indexOf('df-timer-zone-yellow') < 0);
  assert('G2', 'red zone: fill width ~25%',
    hRed.indexOf('width:25.00%') >= 0);

  // Clamp: pct>1 should clamp to 100%
  DF.updateTimer(60000, 1.5, 'green');
  var hClampHi = getHtml(ctx);
  assert('G2', 'pct>1 clamps to 100%',
    hClampHi.indexOf('width:100.00%') >= 0);

  // Clamp: pct<0 should clamp to 0%
  DF.updateTimer(0, -0.2, 'red');
  var hClampLo = getHtml(ctx);
  assert('G2', 'pct<0 clamps to 0%',
    hClampLo.indexOf('width:0.00%') >= 0);
})();

// ── G3 — mm:ss format edge cases ──────────────────────────────────
(function g3() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  function checkFormat(totalMs, remainMs, pct, zone, expectTime, label) {
    DF.hideTimer();
    DF.showTimer('fmt-' + label, totalMs, 'seeker');
    DF.updateTimer(remainMs, pct, zone);
    var html = getHtml(ctx);
    // The mm:ss string is wrapped in <span class="df-timer-time">...</span>
    var needle = '<span class="df-timer-time">' + expectTime + '</span>';
    assert('G3', label + ' (remain=' + remainMs + 'ms -> ' + expectTime + ')',
      html.indexOf(needle) >= 0);
  }

  // Full-minute boundaries: ceil-seconds rule says "1:00" renders until
  // the tick crosses into 59s. So 60000ms -> "1:00", 59999ms -> "1:00",
  // 59000ms -> "0:59".
  checkFormat(60000, 60000, 1.0,  'green',  '1:00', '60s exact');
  checkFormat(60000, 59999, 0.99, 'green',  '1:00', '59999ms rounds up to 1:00');
  checkFormat(60000, 59001, 0.98, 'green',  '1:00', '59001ms rounds up to 1:00');
  checkFormat(60000, 59000, 0.98, 'green',  '0:59', '59000ms exact -> 0:59');
  checkFormat(60000, 30000, 0.5,  'yellow', '0:30', '30000ms -> 0:30');
  checkFormat(60000, 10000, 0.16, 'red',    '0:10', '10000ms -> 0:10');
  checkFormat(60000,  9999, 0.16, 'red',    '0:10', '9999ms rounds up to 0:10');
  checkFormat(60000,  9001, 0.15, 'red',    '0:10', '9001ms rounds up to 0:10');
  checkFormat(60000,  9000, 0.15, 'red',    '0:09', '9000ms exact -> 0:09');
  checkFormat(60000,   500, 0.01, 'red',    '0:01', '500ms rounds up to 0:01');
  checkFormat(60000,     1, 0.0,  'red',    '0:01', '1ms rounds up to 0:01');
  checkFormat(60000,     0, 0.0,  'red',    '0:00', '0ms -> 0:00');

  // Multi-minute values
  checkFormat(180000, 125000, 0.69, 'green', '2:05', '125000ms -> 2:05');
  checkFormat(180000,  89000, 0.49, 'yellow', '1:29', '89000ms -> 1:29');
  checkFormat(180000,   1000, 0.01, 'red',    '0:01', '1000ms exact -> 0:01');

  // Clamp negatives (via direct updateTimer) — rem<0 clamps to 0 in updateTimer
  DF.hideTimer();
  DF.showTimer('fmt-neg', 60000, 'seeker');
  DF.updateTimer(-500, 0, 'red');
  var hNeg = getHtml(ctx);
  assert('G3', 'negative remainMs clamps to 0:00',
    hNeg.indexOf('<span class="df-timer-time">0:00</span>') >= 0);
})();

// ── G4 — Expired state DOM swap ───────────────────────────────────
(function g4() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.showTimer('sprint-expired', 30000, 'hunter');
  var hPre = getHtml(ctx);
  assert('G4', 'pre-expired: no hero message',
    hPre.indexOf('df-timer-hero-msg') < 0);
  assert('G4', 'pre-expired: no .df-timer-expired class',
    hPre.indexOf('df-timer-expired') < 0);

  DF.updateTimer(0, 0, 'expired');
  var hExp = getHtml(ctx);
  assert('G4', 'expired: df-timer-zone-expired class',
    hExp.indexOf('df-timer-zone-expired') >= 0);
  assert('G4', 'expired: df-timer-expired class (modifier)',
    hExp.indexOf('df-timer-expired') >= 0);
  assert('G4', 'expired: fill width 0%',
    hExp.indexOf('width:0%') >= 0);
  assert('G4', 'expired: hero message block present',
    hExp.indexOf('df-timer-hero-msg') >= 0);
  assert('G4', 'expired: hero name "The Hunter" in message',
    hExp.indexOf('The Hunter') >= 0);
  assert('G4', 'expired: hero "blocks the exit" fallback string',
    hExp.indexOf('blocks the exit') >= 0);
  assert('G4', 'expired: label reads "TIME\u2019S UP"',
    hExp.indexOf('TIME\u2019S UP') >= 0);
  assert('G4', 'expired: time span still renders 0:00 for readers',
    hExp.indexOf('<span class="df-timer-time" aria-hidden="true">0:00</span>') >= 0);

  // State snapshot should report zone:'expired'
  var s = DF.getTimerState();
  assert('G4', 'getTimerState reports zone=expired',
    s.zone === 'expired');

  // Each archetype should surface its own hero label when expired
  var archetypes = [
    { arch: 'seeker',   label: 'The Seeker'   },
    { arch: 'sentinel', label: 'The Sentinel' },
    { arch: 'pursuer',  label: 'The Pursuer'  },
    { arch: 'hunter',   label: 'The Hunter'   }
  ];
  for (var i = 0; i < archetypes.length; i++) {
    DF.hideTimer();
    DF.showTimer('arc-' + i, 30000, archetypes[i].arch);
    DF.updateTimer(0, 0, 'expired');
    var html = getHtml(ctx);
    assert('G4', 'archetype ' + archetypes[i].arch + ' shows ' + archetypes[i].label,
      html.indexOf(archetypes[i].label) >= 0);
  }
})();

// ── G5 — Paused class toggle + zone interaction ───────────────────
(function g5() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.showTimer('sprint-pause', 60000, 'seeker');
  var h1 = getHtml(ctx);
  assert('G5', 'fresh timer: no df-timer-paused class',
    h1.indexOf('df-timer-paused') < 0);

  DF.updateTimer(40000, 0.67, 'green', { paused: true });
  var h2 = getHtml(ctx);
  assert('G5', 'paused=true: df-timer-paused class appears',
    h2.indexOf('df-timer-paused') >= 0);
  assert('G5', 'paused timer still has zone class',
    h2.indexOf('df-timer-zone-green') >= 0);
  assert('G5', 'paused timer still shows mm:ss time',
    h2.indexOf('<span class="df-timer-time">0:40</span>') >= 0);

  // Resume: paused flips back off, zone intact
  DF.updateTimer(38000, 0.63, 'yellow', { paused: false });
  var h3 = getHtml(ctx);
  assert('G5', 'paused=false: df-timer-paused class removed',
    h3.indexOf('df-timer-paused') < 0);
  assert('G5', 'resumed: zone transitioned to yellow',
    h3.indexOf('df-timer-zone-yellow') >= 0);

  // Paused + red zone co-existence
  DF.updateTimer(15000, 0.25, 'red', { paused: true });
  var h4 = getHtml(ctx);
  assert('G5', 'paused in red zone: both classes present',
    h4.indexOf('df-timer-paused') >= 0 && h4.indexOf('df-timer-zone-red') >= 0);

  // After hide, paused state is fully reset on next show
  DF.hideTimer();
  DF.showTimer('sprint-pause-2', 60000, 'seeker');
  var h5 = getHtml(ctx);
  assert('G5', 'new timer after hide: paused reset',
    h5.indexOf('df-timer-paused') < 0);
  assert('G5', 'new timer after hide: getTimerState.paused === false',
    DF.getTimerState().paused === false);
})();

// ── Report ────────────────────────────────────────────────────────
setImmediate(function () {
  var groups = {};
  results.forEach(function (r) {
    if (!groups[r.group]) groups[r.group] = { pass: 0, fail: 0, fails: [] };
    if (r.pass) groups[r.group].pass++;
    else { groups[r.group].fail++; groups[r.group].fails.push(r); }
  });

  var total = results.length, passed = 0;
  Object.keys(groups).sort().forEach(function (g) {
    var grp = groups[g];
    passed += grp.pass;
    var tag = (grp.fail === 0) ? 'GREEN' : 'RED';
    console.log('[' + tag + '] ' + g + ': ' + grp.pass + '/' + (grp.pass + grp.fail));
    grp.fails.forEach(function (f) {
      console.log('     FAIL: ' + f.name + (f.detail ? ' — ' + f.detail : ''));
    });
  });

  console.log('---');
  console.log('TOTAL: ' + passed + '/' + total);
  process.exit(passed === total ? 0 : 1);
});

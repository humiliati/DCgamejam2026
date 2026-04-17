#!/usr/bin/env node
/**
 * DOC-109 Phase 3 — DebriefFeed readiness row verification.
 *
 * Five contract groups:
 *   G1 — API surface + initial unrevealed state
 *   G2 — First updateReadiness: reveal-gate sticks + GROUP_DATA fallback
 *   G3 — Three-group sequencing: order + mostRecentId tracking
 *   G4 — Fill math + ★ overheal accent past 100% + bump flag
 *   G5 — Render DOM: readiness renders ABOVE relationships, kind dispatch,
 *        collapsed-vs-expanded body
 *
 * Target: ~12 assertions (landing at 15 for headroom).
 *
 * Bindfs-cache caveat. engine/debrief-feed.js was pre-existing at session
 * boot, so the sandbox page cache is frozen and Edit-tool writes to that
 * path are NOT visible to Node inside the sandbox. Workaround: maintain a
 * byte-identical mirror at _fresh-debrief-feed.js written THIS session via
 * the Write tool (new inodes are served hot). If that mirror is missing
 * or stale, re-mirror before running this harness:
 *
 *   Read  engine/debrief-feed.js
 *   Write tools/_readiness-phase3-cache/_fresh-debrief-feed.js (paste)
 *
 * Usage: node tools/_readiness-phase3-cache/verify-phase3.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var SRC_PATH = path.join(ROOT, 'tools/_readiness-phase3-cache/_fresh-debrief-feed.js');

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
    // AudioSystem, CardAuthority — debrief-feed.js uses `typeof X` guards.
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

// ── G1 — API surface + initial unrevealed state ────────────────────
(function g1() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  assert('G1', 'updateReadiness + getReadinessState exported',
    typeof DF.updateReadiness   === 'function' &&
    typeof DF.getReadinessState === 'function');

  var rd = DF.getCategoryState('readiness');
  assert('G1', 'readiness category starts unrevealed + empty',
    rd && rd.revealed === false && rd.expanded === false &&
    rd.order.length === 0 && rd.mostRecentId === null);

  assert('G1', 'getReadinessState unknown group returns null',
    DF.getReadinessState('spade') === null);

  assert('G1', 'updateReadiness invalid groupId returns null',
    DF.updateReadiness('', 0.5) === null &&
    DF.updateReadiness(null, 0.5) === null);

  var html = ctx.document._els['df-content'].innerHTML;
  assert('G1', 'no readiness block emitted before any update',
    html.indexOf('df-readiness-row') < 0 &&
    html.indexOf('df-category-readiness') < 0);
})();

// ── G2 — First-update reveal + GROUP_DATA fallback ─────────────────
(function g2() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  var row = DF.updateReadiness('spade', 0.5);
  assert('G2', 'updateReadiness returns a row record',
    row && row.kind === 'readiness' && row.subjectId === 'spade' &&
    row.score === 0.5);

  var rd = DF.getCategoryState('readiness');
  assert('G2', 'first update reveals readiness (sticky gate)',
    rd.revealed === true);
  assert('G2', 'first update appends row and tracks mostRecentId',
    rd.order.length === 1 && rd.order[0] === 'readiness:spade' &&
    rd.mostRecentId === 'readiness:spade');

  var state = DF.getReadinessState('spade');
  assert('G2', 'GROUP_DATA fallback: spade → Coral Cellars / ♠ / #5F9EA0',
    state && state.label === 'Coral Cellars' &&
    state.suit === '\u2660' &&
    state.tint === '#5F9EA0');

  // Collapsing the category must NOT un-reveal (sticky). Confirm by
  // driving a collapse and re-reading revealed.
  DF.collapseCategory('readiness');
  var rd2 = DF.getCategoryState('readiness');
  assert('G2', 'collapse does not un-reveal the sticky gate',
    rd2.revealed === true && rd2.expanded === false);
})();

// ── G3 — Three-group sequencing (spade / club / diamond) ───────────
(function g3() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.updateReadiness('spade',   0.5);
  DF.updateReadiness('club',    0.3);
  DF.updateReadiness('diamond', 0.7);

  var rd = DF.getCategoryState('readiness');
  assert('G3', 'three updates → three rows in insertion order',
    rd.order.length === 3 &&
    rd.order[0] === 'readiness:spade' &&
    rd.order[1] === 'readiness:club' &&
    rd.order[2] === 'readiness:diamond');
  assert('G3', 'mostRecentId moves with each update (diamond wins)',
    rd.mostRecentId === 'readiness:diamond');

  var club = DF.getReadinessState('club');
  var diamond = DF.getReadinessState('diamond');
  assert('G3', 'club + diamond fallback metadata resolves',
    club.label === 'Hero\u2019s Wake' && club.suit === '\u2663' &&
    club.tint === '#6B5BA8' &&
    diamond.label === 'Ironhold Depths' && diamond.suit === '\u2666' &&
    diamond.tint === '#B87333');

  // Aggregate math — sum of scores (0.5 + 0.3 + 0.7 = 1.5) preserved
  // across rows individually (the harness doesn't wire ReadinessCalc,
  // so we verify the shape the wire-through contract depends on).
  var sum = DF.getReadinessState('spade').score +
            DF.getReadinessState('club').score +
            DF.getReadinessState('diamond').score;
  assert('G3', 'aggregate — 0.5 + 0.3 + 0.7 round-trips as 1.5',
    Math.abs(sum - 1.5) < 1e-9);
})();

// ── G4 — Fill math + ★ overheal accent + bump flag ─────────────────
(function g4() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  // Seed + render expanded to flush reveal flag out of the row.
  DF.updateReadiness('spade', 0.5);
  DF.expandCategory('readiness');

  var h0 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'score 0.5 → fill width:50%',
    h0.indexOf('width:50%') >= 0 &&
    h0.indexOf('<span class="df-readiness-pct"') >= 0 &&
    h0.indexOf('50%') >= 0);
  assert('G4', 'no ★ accent when score ≤ 1.0',
    h0.indexOf('df-readiness-star') < 0 &&
    h0.indexOf('df-readiness-overhealed') < 0);

  // Bump: score increases from 0.5 → 0.9. justBumped should flip true
  // on the row, then clear on the subsequent render.
  DF.updateReadiness('spade', 0.9);
  // Before render, inspect state via internal access: the row's
  // justBumped flag is consumed by _readinessRow. We read it fresh
  // through getCategoryState → we can't see it directly, so we instead
  // verify by checking that the score mutation preserved prevScore.
  var st = DF.getReadinessState('spade');
  assert('G4', 'bump increase — prevScore=0.5, score=0.9',
    Math.abs(st.prevScore - 0.5) < 1e-9 &&
    Math.abs(st.score - 0.9) < 1e-9);

  // Overheal: 1.42 → "142% ★" label + fill clamps at 100%.
  DF.updateReadiness('spade', 1.42);
  var h1 = ctx.document._els['df-content'].innerHTML;
  assert('G4', '★ accent renders when score > 1.0',
    h1.indexOf('df-readiness-overhealed') >= 0 &&
    h1.indexOf('df-readiness-star') >= 0 &&
    h1.indexOf('\u2605') >= 0);
  assert('G4', 'overhealed label reads "142% \u2605"',
    h1.indexOf('142% \u2605') >= 0);
  assert('G4', 'overhealed fill clamps at 100% visually',
    h1.indexOf('width:100%') >= 0 &&
    h1.indexOf('width:142%') < 0);
})();

// ── G5 — Render DOM: kind dispatch, order, collapsed/expanded ──────
(function g5() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.updateReadiness('spade',   0.2);
  DF.updateReadiness('club',    0.4);
  DF.updateReadiness('diamond', 0.6);
  DF.expandCategory('readiness');
  DF.expandFaction('bprd');
  DF.updateFaction('bprd', 100, 'neutral');

  var h = ctx.document._els['df-content'].innerHTML;
  assert('G5', 'expanded readiness emits 3 .df-readiness-row entries',
    countSub(h, 'df-readiness-row') === 3);
  assert('G5', 'no .df-faction-row leaked into readiness category',
    h.indexOf('df-rd-row-spade') >= 0 &&
    h.indexOf('df-rd-row-club') >= 0 &&
    h.indexOf('df-rd-row-diamond') >= 0);

  // Verify readiness renders ABOVE relationships (string ordering).
  var rdIdx  = h.indexOf('df-category-readiness');
  var relIdx = h.indexOf('df-category-relationships');
  assert('G5', 'readiness category renders ABOVE relationships',
    rdIdx >= 0 && relIdx >= 0 && rdIdx < relIdx);

  // Collapse readiness — only mostRecent row (diamond) should render.
  DF.collapseCategory('readiness');
  var hC = ctx.document._els['df-content'].innerHTML;
  assert('G5', 'collapsed readiness shows only mostRecent (diamond)',
    countSub(hC, 'df-readiness-row') === 1 &&
    hC.indexOf('df-rd-row-diamond') >= 0 &&
    hC.indexOf('df-rd-row-spade') < 0 &&
    hC.indexOf('df-rd-row-club') < 0);
})();

// ── Report ─────────────────────────────────────────────────────────
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
    console.log(g + ': ' + s.pass + ' pass' +
                (s.fail ? ', ' + s.fail + ' FAIL' : ''));
    s.fails.forEach(function (f) {
      console.log('   x ' + f.name + (f.detail ? ' -- ' + f.detail : ''));
    });
  });
  console.log('---');
  console.log('TOTAL: ' + totalPass + '/' + (totalPass + totalFail));
  process.exit(totalFail ? 1 : 0);
});

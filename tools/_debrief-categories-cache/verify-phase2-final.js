#!/usr/bin/env node
/**
 * DOC-109 Phase 2 — DebriefFeed category wrapper verification (canonical).
 *
 * Five contract groups:
 *   G1 — initial shape: both categories + API surface + unrevealed state
 *   G2 — legacy expandFaction routes through _categories.relationships
 *   G3 — updateFaction tracks mostRecentId + favor/tier transitions
 *   G4 — collapsed vs expanded render DOM + chevron glyph flip
 *   G5 — toggle / collapse / reveal semantics
 *
 * Result on 2026-04-17: 37/37 green.
 *
 * Bindfs-cache caveat. engine/debrief-feed.js was pre-existing at session
 * boot, so the sandbox page cache is frozen and Edit-tool writes to that
 * path are NOT visible to Node inside the sandbox. Workaround: maintain a
 * byte-identical mirror at _fresh-debrief-feed.js written THIS session via
 * the Write tool (new inodes are served hot). If that mirror is missing
 * or stale, re-mirror before running this harness:
 *
 *   Read  engine/debrief-feed.js
 *   Write tools/_debrief-categories-cache/_fresh-debrief-feed.js (paste)
 *
 * Usage: node tools/_debrief-categories-cache/verify-phase2-final.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var SRC_PATH = path.join(ROOT, 'tools/_debrief-categories-cache/_fresh-debrief-feed.js');

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
    // `typeof X === 'undefined'` guards on these. Assigning null flips
    // typeof to 'object' and the guards fall through.
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

// Canonical outer-div needle: 'class="df-category ' with a trailing
// SPACE — distinguishes the outer .df-category wrapper from its
// .df-category-head / .df-category-body children (which have a hyphen
// after "df-category", not a space).
var OUTER_CATEGORY_NEEDLE = 'class="df-category ';

// ── G1 — initial shape ─────────────────────────────────────────────
(function g1() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  assert('G1', 'DebriefFeed global defined', typeof DF === 'object' && DF !== null);
  assert('G1', 'Phase 2 API exported',
    typeof DF.revealCategory   === 'function' &&
    typeof DF.expandCategory   === 'function' &&
    typeof DF.collapseCategory === 'function' &&
    typeof DF.toggleCategory   === 'function' &&
    typeof DF.getCategoryState === 'function');

  var r   = DF.getCategoryState('readiness');
  var rel = DF.getCategoryState('relationships');

  assert('G1', 'readiness exists',
    r && r.id === 'readiness' && r.label === 'Readiness');
  assert('G1', 'relationships exists',
    rel && rel.id === 'relationships' && rel.label === 'Relationships');
  assert('G1', 'both start unrevealed',
    r.revealed === false && rel.revealed === false);
  assert('G1', 'both start collapsed',
    r.expanded === false && rel.expanded === false);
  assert('G1', 'orders start empty',
    r.order.length === 0 && rel.order.length === 0);
  assert('G1', 'mostRecentId starts null',
    r.mostRecentId === null && rel.mostRecentId === null);
  assert('G1', 'getCategoryState(unknown) returns null',
    DF.getCategoryState('nonexistent') === null);
  assert('G1', 'getFactionState on unknown id returns null',
    DF.getFactionState('nobody') === null);

  var html = ctx.document._els['df-content'].innerHTML;
  assert('G1', 'unrevealed category emits no .df-category block',
    html.indexOf('df-category') < 0);
})();

// ── G2 — legacy expandFaction routes through ───────────────────────
(function g2() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.expandFaction('bprd');
  var rel = DF.getCategoryState('relationships');
  assert('G2', 'expandFaction reveals relationships',
    rel.revealed === true);
  assert('G2', 'expandFaction expands relationships',
    rel.expanded === true);
  assert('G2', 'row appended to order',
    rel.order.length === 1 && rel.order[0] === 'faction:bprd');
  assert('G2', 'mostRecentId points at the new row',
    rel.mostRecentId === 'faction:bprd');

  var legacy = DF.getFactionState('bprd');
  assert('G2', 'legacy getFactionState returns expanded:true after expandFaction',
    legacy && legacy.expanded === true &&
    legacy.favor === 0 && legacy.tier === 'neutral');

  var readiness = DF.getCategoryState('readiness');
  assert('G2', 'readiness untouched',
    readiness.revealed === false && readiness.expanded === false &&
    readiness.order.length === 0);
})();

// ── G3 — updateFaction sequence + mostRecentId + animation flags ───
(function g3() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.updateFaction('bprd', 100, 'neutral');
  var a1 = DF.getCategoryState('relationships');
  assert('G3', 'first updateFaction appends',
    a1.order.length === 1 && a1.order[0] === 'faction:bprd');
  assert('G3', 'first updateFaction sets mostRecentId',
    a1.mostRecentId === 'faction:bprd');

  DF.updateFaction('mss', 50, 'neutral');
  var a2 = DF.getCategoryState('relationships');
  assert('G3', 'second updateFaction appends mss',
    a2.order.length === 2 && a2.order.indexOf('faction:mss') === 1);
  assert('G3', 'second updateFaction moves mostRecentId to mss',
    a2.mostRecentId === 'faction:mss');

  DF.updateFaction('bprd', 300, 'neutral');
  var bprd = DF.getFactionState('bprd');
  assert('G3', 'favor increase updates favor',
    bprd.favor === 300);

  DF.updateFaction('bprd', 600, 'friendly');
  var bprd2 = DF.getFactionState('bprd');
  assert('G3', 'tier change sticks',
    bprd2.tier === 'friendly' && bprd2.favor === 600);
})();

// ── G4 — collapsed vs expanded render DOM + chevron glyph ──────────
(function g4() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.updateFaction('bprd',      100, 'neutral');
  DF.updateFaction('mss',       100, 'neutral');
  DF.updateFaction('pinkerton', 100, 'neutral');
  DF.revealCategory('relationships');

  var h1 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'collapsed: exactly one .df-category wrapper',
    countSub(h1, OUTER_CATEGORY_NEEDLE) === 1);
  assert('G4', 'collapsed: has .df-cat-collapsed-row',
    h1.indexOf('df-cat-collapsed-row') >= 0);
  assert('G4', 'collapsed: exactly one .df-faction-row',
    countSub(h1, 'df-faction-row') === 1);
  assert('G4', 'collapsed chevron is \u25B8 (right-pointing)',
    h1.indexOf('\u25B8') >= 0 && h1.indexOf('\u25BE') < 0);
  assert('G4', 'collapsed shows only pinkerton (mostRecentId)',
    h1.indexOf('df-fac-row-pinkerton') >= 0 &&
    h1.indexOf('df-fac-row-bprd') < 0 &&
    h1.indexOf('df-fac-row-mss') < 0);

  DF.expandCategory('relationships');
  var h2 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'expanded: has .df-category-body, no collapsed-row',
    h2.indexOf('df-category-body') >= 0 && h2.indexOf('df-cat-collapsed-row') < 0);
  assert('G4', 'expanded: 3 .df-faction-row entries',
    countSub(h2, 'df-faction-row') === 3);
  assert('G4', 'expanded chevron is \u25BE (down-pointing)',
    h2.indexOf('\u25BE') >= 0 && h2.indexOf('\u25B8') < 0);
  assert('G4', 'expanded includes all three factions',
    h2.indexOf('df-fac-row-bprd') >= 0 &&
    h2.indexOf('df-fac-row-mss') >= 0 &&
    h2.indexOf('df-fac-row-pinkerton') >= 0);
})();

// ── G5 — toggle / collapse / reveal semantics ──────────────────────
(function g5() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.updateFaction('bprd', 100, 'neutral');
  DF.revealCategory('relationships');

  var s1 = DF.getCategoryState('relationships');
  assert('G5', 'revealCategory: revealed=true, expanded=false',
    s1.revealed === true && s1.expanded === false);

  var r1 = DF.toggleCategory('relationships');
  var s2 = DF.getCategoryState('relationships');
  assert('G5', 'first toggle returns true (now expanded)',
    r1 === true && s2.expanded === true);

  var r2 = DF.toggleCategory('relationships');
  var s3 = DF.getCategoryState('relationships');
  assert('G5', 'second toggle returns false (collapsed, revealed preserved)',
    r2 === false && s3.expanded === false && s3.revealed === true);

  DF.collapseCategory('relationships');
  var s4 = DF.getCategoryState('relationships');
  assert('G5', 'collapseCategory preserves revealed=true',
    s4.expanded === false && s4.revealed === true);

  var rBad = DF.toggleCategory('nonexistent');
  assert('G5', 'toggleCategory unknown id returns false',
    rBad === false);
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

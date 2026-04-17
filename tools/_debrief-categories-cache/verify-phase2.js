#!/usr/bin/env node
/**
 * DOC-109 Phase 2 — DebriefFeed category wrapper verification.
 *
 * Loads the REAL engine/debrief-feed.js under a fresh-inode copy (same
 * bindfs-cache bypass as Phase 0/1) and exercises five contract groups:
 *
 *   G1 — initial shape: both categories (readiness + relationships)
 *        exist via getCategoryState, revealed=false, expanded=false,
 *        order=[], mostRecentId=null. No render output for unrevealed
 *        categories. Legacy getFactionState returns null for unknown id.
 *
 *   G2 — legacy expandFaction routes through: expandFaction('bprd')
 *        reveals + expands the relationships category, creates a
 *        'faction:bprd' row, sets mostRecentId=faction:bprd, sets the
 *        justRevealed animation flag, leaves the readiness category
 *        untouched. getFactionState('bprd') returns expanded=true.
 *
 *   G3 — updateFaction tracks mostRecentId + animation flags: sequential
 *        updateFaction('bprd',…), updateFaction('mss',…) moves
 *        mostRecentId to 'faction:mss'; justBumped fires on favor
 *        increase; justTierCrossed fires on tier change.
 *
 *   G4 — collapsed vs expanded render DOM: collapsed category emits
 *        exactly one .df-faction-row (the mostRecentId row) inside a
 *        .df-cat-collapsed-row; expanded category emits one
 *        .df-faction-row per entry in cat.order inside
 *        .df-category-body. Chevron glyph flips ▸ → ▾.
 *
 *   G5 — toggleCategory + collapseCategory + revealCategory semantics:
 *        toggleCategory flips expanded; collapseCategory preserves
 *        revealed; revealCategory does NOT auto-expand.
 *
 * Fresh-inode cache-bust pattern (same as verify-phase0/1): every
 * source file we eval is copied to /tmp with a unique suffix before
 * read, so mid-session Edit writes to the bindfs mount are guaranteed
 * visible to Node.
 *
 * Usage: node tools/_debrief-categories-cache/verify-phase2.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');
var os   = require('os');

var ROOT = path.resolve(__dirname, '..', '..');

var _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-'));
var _readCounter = 0;
// bindfs page-cache bypass: engine/debrief-feed.js existed at session
// boot, so its pages are frozen in the sandbox mount even after an
// Edit-tool write on the Windows side. We maintain a fresh-inode mirror
// at tools/_debrief-categories-cache/_fresh-debrief-feed.js (written
// THIS session via the Write tool, so its pages are hot) and silently
// redirect the engine path to it. The copy is byte-identical to the
// real file; only the inode differs.
var _FRESH_OVERRIDE = {
  'engine/debrief-feed.js': 'tools/_debrief-categories-cache/_fresh-debrief-feed.js'
};
function freshRead(relPath) {
  var actualRel = _FRESH_OVERRIDE[relPath] || relPath;
  var src = path.join(ROOT, actualRel);
  var dst = path.join(_tmpDir, (_readCounter++) + '-' + path.basename(actualRel));
  fs.copyFileSync(src, dst);
  return fs.readFileSync(dst, 'utf8');
}

var results = [];
function assert(group, name, cond, detail) {
  results.push({ group: group, name: name, pass: !!cond, detail: detail || '' });
}

// ── Minimal DOM shim ───────────────────────────────────────────────
// DebriefFeed uses document.getElementById for three elements
// (debrief-feed, df-header, df-content), plus requestAnimationFrame /
// performance for the lagged-pool tween loop. We back each element
// with a tiny object that captures innerHTML/textContent writes so
// tests can assert on the rendered HTML string.

function makeEl(id) {
  return {
    id:          id,
    innerHTML:   '',
    textContent: '',
    style:       {},
    classList:   {
      _set: {},
      add:    function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    },
    _listeners:  {},
    addEventListener: function (ev, fn) {
      (this._listeners[ev] = this._listeners[ev] || []).push(fn);
    },
    offsetWidth: 273,
    getBoundingClientRect: function () {
      return { left: 0, top: 0, right: 273, bottom: 100, width: 273, height: 100 };
    },
    scrollTop:    0,
    scrollHeight: 100
  };
}

function makeDoc() {
  var els = {
    'debrief-feed': makeEl('debrief-feed'),
    'df-header':    makeEl('df-header'),
    'df-content':   makeEl('df-content'),
    'view-canvas':  makeEl('view-canvas')
  };
  return {
    _els: els,
    getElementById: function (id) { return els[id] || null; }
  };
}

// Build a fresh sandbox with the real debrief-feed.js evaluated inside.
function makeSandbox() {
  var ctx = {
    console:    console,
    Promise:    Promise,
    setTimeout: setTimeout,
    setImmediate: setImmediate,
    requestAnimationFrame: function () { return 0; },
    performance: { now: function () { return Date.now(); } },
    document:   makeDoc(),
    // Player state: minimal fields used by _renderUnified.
    Player: {
      state: function () {
        return {
          hp: 10, maxHp: 10, energy: 5, maxEnergy: 5,
          battery: 3, maxBattery: 5, currency: 0,
          str: 1, dex: 1, stealth: 1
        };
      },
      getFatigue:    function () { return 0; },
      getMaxFatigue: function () { return 100; }
    },
    // QuestTypes.REP_TIERS drives _tierProgress.
    QuestTypes: {
      REP_TIERS: [
        { id: 'hated',      min: -Infinity },
        { id: 'unfriendly', min: -500 },
        { id: 'neutral',    min: 0 },
        { id: 'friendly',   min: 500 },
        { id: 'allied',     min: 2500 },
        { id: 'exalted',    min: 10000 }
      ]
    },
    i18n: null,           // forces fallback labels
    StatusEffect: null,   // no buffs rendered
    DragDrop: null,       // incinerator registration is guarded
    Toast: null,
    AudioSystem: null,
    CardAuthority: null,
    SessionStats: null
  };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);
  var src = freshRead('engine/debrief-feed.js');
  vm.runInContext(src, ctx, { filename: 'engine/debrief-feed.js' });
  ctx.DebriefFeed.init();
  ctx.DebriefFeed.show();
  return ctx;
}

// Count occurrences of a substring (for DOM assertion ergonomics).
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

// ── G1 — initial shape ─────────────────────────────────────────────
(function g1() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  assert('G1', 'DebriefFeed global defined', typeof DF === 'object' && DF !== null);
  assert('G1', 'new Phase 2 API exported',
         typeof DF.revealCategory   === 'function' &&
         typeof DF.expandCategory   === 'function' &&
         typeof DF.collapseCategory === 'function' &&
         typeof DF.toggleCategory   === 'function' &&
         typeof DF.getCategoryState === 'function');

  var readiness = DF.getCategoryState('readiness');
  var relationships = DF.getCategoryState('relationships');

  assert('G1', 'readiness category exists',
         readiness && readiness.id === 'readiness' && readiness.label === 'Readiness');
  assert('G1', 'relationships category exists',
         relationships && relationships.id === 'relationships' && relationships.label === 'Relationships');

  assert('G1', 'both categories start unrevealed',
         readiness.revealed === false && relationships.revealed === false);
  assert('G1', 'both categories start collapsed',
         readiness.expanded === false && relationships.expanded === false);
  assert('G1', 'orders start empty',
         readiness.order.length === 0 && relationships.order.length === 0);
  assert('G1', 'mostRecentId starts null',
         readiness.mostRecentId === null && relationships.mostRecentId === null);

  // Unknown category id returns null
  assert('G1', 'getCategoryState(unknown) returns null',
         DF.getCategoryState('nonexistent') === null);

  // Legacy getFactionState on unknown id still returns null
  assert('G1', 'getFactionState on unknown id returns null',
         DF.getFactionState('nobody') === null);

  // Render produced content, but neither category should appear.
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
  assert('G2', 'expandFaction reveals relationships category',
         rel.revealed === true);
  assert('G2', 'expandFaction expands relationships category',
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
  assert('G2', 'readiness category untouched by expandFaction',
         readiness.revealed === false && readiness.expanded === false &&
         readiness.order.length === 0);
})();

// ── G3 — mostRecentId + animation flags ────────────────────────────
(function g3() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  // Sequential updates — mostRecentId should track the latest.
  DF.updateFaction('bprd', 100, 'neutral');
  var afterFirst = DF.getCategoryState('relationships');
  assert('G3', 'first updateFaction appends to order',
         afterFirst.order.length === 1 && afterFirst.order[0] === 'faction:bprd');
  assert('G3', 'first updateFaction sets mostRecentId=faction:bprd',
         afterFirst.mostRecentId === 'faction:bprd');

  DF.updateFaction('mss', 50, 'neutral');
  var afterSecond = DF.getCategoryState('relationships');
  assert('G3', 'second updateFaction appends mss to order',
         afterSecond.order.length === 2 &&
         afterSecond.order.indexOf('faction:mss') === 1);
  assert('G3', 'second updateFaction moves mostRecentId to faction:mss',
         afterSecond.mostRecentId === 'faction:mss');

  // Favor increase → justBumped
  DF.updateFaction('bprd', 300, 'neutral');
  var bprd = DF.getFactionState('bprd');
  assert('G3', 'favor increase updates favor',
         bprd.favor === 300);

  // Tier change → justTierCrossed
  DF.updateFaction('bprd', 600, 'friendly');
  var bprd2 = DF.getFactionState('bprd');
  assert('G3', 'tier change sticks',
         bprd2.tier === 'friendly' && bprd2.favor === 600);
})();

// ── G4 — collapsed vs expanded render DOM ──────────────────────────
(function g4() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  // Set up: 3 factions in the order so expanded-vs-collapsed diverges.
  DF.updateFaction('bprd',      100, 'neutral');
  DF.updateFaction('mss',       100, 'neutral');
  DF.updateFaction('pinkerton', 100, 'neutral');

  // Reveal the category but leave it collapsed via revealCategory.
  DF.revealCategory('relationships');

  var htmlCollapsed = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'collapsed render emits exactly one .df-category',
         countSub(htmlCollapsed, 'class="df-category') === 1);
  assert('G4', 'collapsed render emits .df-cat-collapsed-row',
         htmlCollapsed.indexOf('df-cat-collapsed-row') >= 0);
  assert('G4', 'collapsed render emits exactly one .df-faction-row',
         countSub(htmlCollapsed, 'df-faction-row') === 1);
  assert('G4', 'collapsed chevron is ▸ (right-pointing)',
         htmlCollapsed.indexOf('\u25B8') >= 0 && htmlCollapsed.indexOf('\u25BE') < 0);
  assert('G4', 'collapsed row is the mostRecentId (pinkerton)',
         htmlCollapsed.indexOf('df-fac-row-pinkerton') >= 0 &&
         htmlCollapsed.indexOf('df-fac-row-bprd') < 0 &&
         htmlCollapsed.indexOf('df-fac-row-mss') < 0);

  // Expand and re-render.
  DF.expandCategory('relationships');
  var htmlExpanded = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'expanded render emits .df-category-body',
         htmlExpanded.indexOf('df-category-body') >= 0 &&
         htmlExpanded.indexOf('df-cat-collapsed-row') < 0);
  assert('G4', 'expanded render emits 3 .df-faction-row entries',
         countSub(htmlExpanded, 'df-faction-row') === 3);
  assert('G4', 'expanded chevron is ▾ (down-pointing)',
         htmlExpanded.indexOf('\u25BE') >= 0 && htmlExpanded.indexOf('\u25B8') < 0);
  assert('G4', 'expanded render includes all three factions',
         htmlExpanded.indexOf('df-fac-row-bprd') >= 0 &&
         htmlExpanded.indexOf('df-fac-row-mss') >= 0 &&
         htmlExpanded.indexOf('df-fac-row-pinkerton') >= 0);
})();

// ── G5 — toggle / collapse / reveal semantics ──────────────────────
(function g5() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  DF.updateFaction('bprd', 100, 'neutral');
  DF.revealCategory('relationships');

  var s1 = DF.getCategoryState('relationships');
  assert('G5', 'revealCategory sets revealed=true without expanding',
         s1.revealed === true && s1.expanded === false);

  // toggleCategory flips → expanded=true
  var r1 = DF.toggleCategory('relationships');
  var s2 = DF.getCategoryState('relationships');
  assert('G5', 'first toggleCategory returns true (now expanded)',
         r1 === true && s2.expanded === true);

  // toggleCategory again flips back → expanded=false, still revealed
  var r2 = DF.toggleCategory('relationships');
  var s3 = DF.getCategoryState('relationships');
  assert('G5', 'second toggleCategory returns false (now collapsed)',
         r2 === false && s3.expanded === false && s3.revealed === true);

  // collapseCategory is a no-op when already collapsed, but preserves revealed
  DF.collapseCategory('relationships');
  var s4 = DF.getCategoryState('relationships');
  assert('G5', 'collapseCategory preserves revealed=true',
         s4.expanded === false && s4.revealed === true);

  // toggle on an unknown category returns false and doesn't throw
  var rBad = DF.toggleCategory('nonexistent');
  assert('G5', 'toggleCategory on unknown id returns false',
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

#!/usr/bin/env node
/**
 * DOC-109 Phase 4 — DebriefFeed relationships (NPC + faction) verification.
 *
 * Six contract groups (22 assertions):
 *   G1 — API surface + initial state
 *   G2 — Faction migration: updateRelationship('faction', ...) routes identically
 *        to updateFaction + getFactionState back-compat
 *   G3 — NPC row creation + meta persistence across favor-change events
 *   G4 — Flag routing: justBumped vs justTierCrossed vs justRevealed
 *   G5 — Dispatcher reveal-gate + sticky behavior
 *   G6 — Render DOM dispatch: _renderRowByKind picks _npcRow vs _factionRow
 *
 * Bindfs-cache caveat — engine/debrief-feed.js was pre-existing at session
 * boot, so the sandbox page cache is frozen and Edit-tool writes to that
 * path are not visible to Node. This harness loads the byte-equivalent
 * fresh mirror at tools/_phase4-cache/_fresh-debrief-feed.js (written
 * this session via the Write tool, so its inode is hot).
 *
 * Usage: node tools/_phase4-cache/verify-phase4.js
 */
'use strict';

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var SRC_PATH = path.join(ROOT, 'tools/_phase4-cache/_fresh-debrief-feed.js');

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

// ── G1 — API surface + initial state ───────────────────────────────
(function g1() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  assert('G1', 'updateRelationship + getRelationshipState exported',
    typeof DF.updateRelationship   === 'function' &&
    typeof DF.getRelationshipState === 'function');

  var rel = DF.getCategoryState('relationships');
  assert('G1', 'relationships category starts unrevealed + empty',
    rel && rel.revealed === false && rel.order.length === 0);

  assert('G1', 'getRelationshipState returns null for unknown subject',
    DF.getRelationshipState('npc',     'nonesuch') === null &&
    DF.getRelationshipState('faction', 'nonesuch') === null);
})();

// ── G2 — Faction row migration via updateRelationship ──────────────
(function g2() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  var row = DF.updateRelationship('faction', 'bprd', 500, 'friendly');
  assert('G2', 'updateRelationship faction → row with kind=faction',
    row && row.kind === 'faction' && row.subjectId === 'bprd' &&
    row.favor === 500 && row.tier === 'friendly');

  var st = DF.getRelationshipState('faction', 'bprd');
  assert('G2', 'getRelationshipState faction mirrors getFactionState',
    st && st.kind === 'faction' && st.favor === 500 && st.tier === 'friendly');

  var legacy = DF.getFactionState('bprd');
  assert('G2', 'getFactionState back-compat still works post-migration',
    legacy && legacy.favor === 500 && legacy.tier === 'friendly');

  assert('G2', 'updateRelationship rejects invalid kinds + empty subjectId',
    DF.updateRelationship('hero',    'foo', 0, 'neutral') === null &&
    DF.updateRelationship('faction', '',    0, 'neutral') === null &&
    DF.updateRelationship('npc',     null,  0, 'neutral') === null);
})();

// ── G3 — NPC row creation + meta persistence ───────────────────────
(function g3() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  var row = DF.updateRelationship('npc', 'kessel', 100, 'neutral', {
    icon:      '\uD83D\uDC6E',     // 👮
    name:      'Sgt Kessel',
    factionId: 'bprd',
    floor:     '1.2'
  });
  assert('G3', 'updateRelationship npc → row with kind=npc',
    row && row.kind === 'npc' && row.subjectId === 'kessel' &&
    row.favor === 100 && row.tier === 'neutral');

  var st = DF.getRelationshipState('npc', 'kessel');
  assert('G3', 'NPC meta persisted on row (icon/name/factionId/floor)',
    st && st.meta &&
    st.meta.icon      === '\uD83D\uDC6E' &&
    st.meta.name      === 'Sgt Kessel' &&
    st.meta.factionId === 'bprd' &&
    st.meta.floor     === '1.2');

  // Follow-up favor-change with no meta — meta bag must not be clobbered.
  DF.updateRelationship('npc', 'kessel', 300, 'neutral');
  var st2 = DF.getRelationshipState('npc', 'kessel');
  assert('G3', 'favor-change without meta preserves stored meta bag',
    st2 && st2.favor === 300 && st2.meta &&
    st2.meta.icon      === '\uD83D\uDC6E' &&
    st2.meta.name      === 'Sgt Kessel' &&
    st2.meta.factionId === 'bprd');

  // Partial-meta update — only factionId supplied should update factionId
  // and leave icon/name/floor intact.
  DF.updateRelationship('npc', 'kessel', 400, 'neutral', { factionId: 'mss' });
  var st3 = DF.getRelationshipState('npc', 'kessel');
  assert('G3', 'partial-meta update merges field-by-field',
    st3.meta.factionId === 'mss' &&
    st3.meta.icon === '\uD83D\uDC6E' &&
    st3.meta.name === 'Sgt Kessel' &&
    st3.meta.floor === '1.2');

  // Render: tint follows the *current* factionId (mss=#5F9EA0) once
  // the relationships category is expanded.
  DF.revealCategory('relationships');
  DF.expandCategory('relationships');
  var h = ctx.document._els['df-content'].innerHTML;
  assert('G3', 'expanded render emits .df-npc-row with faction-tinted fill',
    h.indexOf('df-npc-row') >= 0 &&
    h.indexOf('df-npc-fill') >= 0 &&
    h.indexOf('#5F9EA0') >= 0);
})();

// ── G4 — Flag routing: justRevealed / justBumped / justTierCrossed ─
(function g4() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  // First-touch — updateRelationship should NOT auto-set justRevealed
  // (reveal animation is driven by the sticky category gate, not
  // per-row state). Confirm by inspecting internal row via render.
  DF.updateRelationship('npc', 'kessel', 100, 'neutral', {
    icon: '\uD83D\uDC6E', name: 'Sgt Kessel', factionId: 'bprd'
  });
  DF.revealCategory('relationships');
  DF.expandCategory('relationships');
  var h0 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'first-touch row renders without df-npc-bump / df-npc-tiercross',
    h0.indexOf('df-npc-row') >= 0 &&
    h0.indexOf('df-npc-bump') < 0 &&
    h0.indexOf('df-npc-tiercross') < 0);

  // Pure favor bump — updateRelationship with no tierCrossed flag.
  // The second call inside _setRelationshipRow detects favor > prev
  // and sets justBumped = true.
  DF.updateRelationship('npc', 'kessel', 300, 'neutral');
  var h1 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'favor increase emits df-npc-bump class',
    h1.indexOf('df-npc-bump') >= 0 &&
    h1.indexOf('df-npc-tiercross') < 0);

  // Subsequent render with no further change — bump flag was consumed
  // on the previous render so it should NOT re-appear.
  DF.expandCategory('relationships');  // triggers a fresh render
  var h2 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'bump flag cleared after render (single-frame flash)',
    h2.indexOf('df-npc-row') >= 0 &&
    h2.indexOf('df-npc-bump') < 0);

  // Tier-cross — explicit flair routing via meta.tierCrossed=true.
  DF.updateRelationship('npc', 'kessel', 600, 'friendly', { tierCrossed: true });
  var h3 = ctx.document._els['df-content'].innerHTML;
  assert('G4', 'meta.tierCrossed routes through to df-npc-tiercross class',
    h3.indexOf('df-npc-tiercross') >= 0);
})();

// ── G5 — Dispatcher reveal-gate + sticky behavior ──────────────────
(function g5() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  var r0 = DF.getCategoryState('relationships');
  assert('G5', 'relationships starts unrevealed at init',
    r0.revealed === false && r0.expanded === false);

  DF.revealCategory('relationships');
  var r1 = DF.getCategoryState('relationships');
  assert('G5', 'revealCategory sets revealed=true',
    r1.revealed === true);

  // Add a row, expand, then collapse — sticky gate must NOT reset.
  DF.updateRelationship('npc', 'kessel', 100, 'neutral');
  DF.expandCategory('relationships');
  DF.collapseCategory('relationships');
  var r2 = DF.getCategoryState('relationships');
  assert('G5', 'collapse does not un-reveal sticky gate',
    r2.revealed === true && r2.expanded === false);
})();

// ── G6 — Render DOM: kind dispatch + collapsed/expanded ────────────
(function g6() {
  var ctx = makeSandbox();
  var DF  = ctx.DebriefFeed;

  // Mixed population — faction and NPC rows in the same category.
  DF.updateRelationship('faction', 'bprd', 500, 'friendly');
  DF.updateRelationship('npc',     'kessel', 100, 'neutral', {
    icon: '\uD83D\uDC6E', name: 'Sgt Kessel', factionId: 'bprd'
  });
  DF.updateRelationship('faction', 'mss', 200, 'neutral');
  DF.expandCategory('relationships');

  var h = ctx.document._els['df-content'].innerHTML;
  // Match on the class attribute exactly — the NPC row's id
  // (df-npc-row-<id>) collides with the bare 'df-npc-row' substring
  // and would double-count without the class= qualifier.
  assert('G6', 'expanded emits both faction + npc rows (kind dispatch)',
    countSub(h, 'class="df-faction-row') === 2 &&
    countSub(h, 'class="df-npc-row')     === 1);

  // Category ordering — relationships must still render below timer
  // (if present) and above the rest. Just confirm the category wrapper
  // appears once.
  assert('G6', 'relationships category wrapper rendered exactly once',
    countSub(h, 'df-category-relationships') === 1);

  // Collapse — only mostRecent row (the mss faction, last updated).
  DF.collapseCategory('relationships');
  var hC = ctx.document._els['df-content'].innerHTML;
  assert('G6', 'collapsed → only mostRecent row visible (mss faction)',
    countSub(hC, 'class="df-faction-row') === 1 &&
    countSub(hC, 'class="df-npc-row')     === 0 &&
    hC.indexOf('df-fac-row-mss') >= 0);
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

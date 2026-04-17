/**
 * test-hose-decal.js — Rung 2A lock-in tests for HoseDecal ledger.
 *
 * Exercises attach / step / pop / detach, direction bookkeeping, crossed-tile
 * detection, floor-strand breaks, version bumping, clearFloor, and
 * rebuildFromState. Does NOT touch Rung 2C raster primitives — those live in
 * test-hose-decal-raster.js.
 *
 * Run: node tests/test-hose-decal.js
 */

// ═══════════════════════════════════════════════════════════════
//  MINIMAL STUB — HoseState (HoseDecal's only dependency)
// ═══════════════════════════════════════════════════════════════
//
// HoseDecal wires listeners at IIFE load via HoseState.on(...). This mock
// must exist BEFORE the eval() below. _fire() lets tests drive events
// synthetically without standing up the real HoseState module.

var HoseState = (function () {
  var handlers = Object.create(null);
  var path = [];  // array of {x, y, floorId}

  return {
    on: function (evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
    },
    getPath: function () { return path.slice(); },  // defensive copy

    // Test helpers (underscore prefix — not part of real HoseState API)
    _setPath: function (p) { path = p.slice(); },
    _fire: function (evt /*, ...args */) {
      var args = Array.prototype.slice.call(arguments, 1);
      var hs = handlers[evt] || [];
      for (var i = 0; i < hs.length; i++) hs[i].apply(null, args);
    },
    _reset: function () {
      handlers = Object.create(null);
      path = [];
    }
  };
})();

// ═══════════════════════════════════════════════════════════════
//  LOAD MODULE
// ═══════════════════════════════════════════════════════════════

var fs = require('fs');
var src = fs.readFileSync(__dirname + '/../engine/hose-decal.js', 'utf8');
eval(src);

// ═══════════════════════════════════════════════════════════════
//  TEST FRAMEWORK (match tests/test-dungeon-schedule.js convention)
// ═══════════════════════════════════════════════════════════════

var _passed = 0;
var _failed = 0;

function describe(name, fn) {
  console.log('\n\x1b[1m' + name + '\x1b[0m');
  fn();
}

function it(name, fn) {
  try {
    fn();
    _passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    _failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    \x1b[31m' + e.message + '\x1b[0m');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) {
    throw new Error((msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
}

// Attach + step helpers that fire through the HoseState event bus the way
// the real HoseState module would.
function doAttach(x, y, floorId) {
  HoseState._setPath([{ x: x, y: y, floorId: floorId }]);
  HoseState._fire('attach');
}
function doStep(x, y, floorId) {
  HoseState._fire('step', { x: x, y: y, floorId: floorId });
}
function doPop() {
  HoseState._fire('pop');
}
function doDetach() {
  HoseState._fire('detach');
}

function resetLedger() {
  HoseDecal.reset();
}

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════

describe('Rung 2A — attach seeds correctly', function () {
  it('seeds exactly one visit with null entry/exit', function () {
    resetLedger();
    doAttach(5, 7, 'f0');
    var rec = HoseDecal.getVisitsAt(5, 7, 'f0');
    assert(rec !== null, 'record exists at seed tile');
    assertEqual(rec.visits.length, 1, 'one visit');
    assertEqual(rec.crossCount, 1, 'crossCount=1');
    assertEqual(rec.visits[0].entryDir, null, 'entryDir null at seed');
    assertEqual(rec.visits[0].exitDir, null, 'exitDir null at seed');
    assertEqual(HoseDecal.getTileCount('f0'), 1, 'tile count=1');
  });

  it('getHead returns the seed tile', function () {
    resetLedger();
    doAttach(3, 2, 'f1');
    var h = HoseDecal.getHead();
    assert(h !== null, 'head defined');
    assertEqual(h.x, 3, 'head x');
    assertEqual(h.y, 2, 'head y');
    assertEqual(h.floorId, 'f1', 'head floor');
  });
});

describe('Rung 2A — step direction bookkeeping', function () {
  it('EAST step: prev.exit=EAST, new.entry=WEST', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');
    var a = HoseDecal.getVisitsAt(0, 0, 'f');
    var b = HoseDecal.getVisitsAt(1, 0, 'f');
    assertEqual(a.visits[0].exitDir, HoseDecal.DIR_EAST, 'prev exit=EAST');
    assertEqual(b.visits[0].entryDir, HoseDecal.DIR_WEST, 'new entry=WEST');
    assertEqual(b.visits[0].exitDir, null, 'new exit null (head)');
  });

  it('SOUTH step: prev.exit=SOUTH, new.entry=NORTH', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(0, 1, 'f');
    var a = HoseDecal.getVisitsAt(0, 0, 'f');
    var b = HoseDecal.getVisitsAt(0, 1, 'f');
    assertEqual(a.visits[0].exitDir, HoseDecal.DIR_SOUTH, 'prev exit=SOUTH');
    assertEqual(b.visits[0].entryDir, HoseDecal.DIR_NORTH, 'new entry=NORTH');
  });

  it('WEST step: prev.exit=WEST, new.entry=EAST', function () {
    resetLedger();
    doAttach(5, 0, 'f');
    doStep(4, 0, 'f');
    var a = HoseDecal.getVisitsAt(5, 0, 'f');
    var b = HoseDecal.getVisitsAt(4, 0, 'f');
    assertEqual(a.visits[0].exitDir, HoseDecal.DIR_WEST, 'prev exit=WEST');
    assertEqual(b.visits[0].entryDir, HoseDecal.DIR_EAST, 'new entry=EAST');
  });

  it('NORTH step: prev.exit=NORTH, new.entry=SOUTH', function () {
    resetLedger();
    doAttach(0, 5, 'f');
    doStep(0, 4, 'f');
    var a = HoseDecal.getVisitsAt(0, 5, 'f');
    var b = HoseDecal.getVisitsAt(0, 4, 'f');
    assertEqual(a.visits[0].exitDir, HoseDecal.DIR_NORTH, 'prev exit=NORTH');
    assertEqual(b.visits[0].entryDir, HoseDecal.DIR_SOUTH, 'new entry=SOUTH');
  });

  it('L-shaped path: entry/exit chain tracks each turn', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');  // E
    doStep(1, 1, 'f');  // S
    doStep(2, 1, 'f');  // E
    var a = HoseDecal.getVisitsAt(0, 0, 'f');  // tail
    var b = HoseDecal.getVisitsAt(1, 0, 'f');  // corner E→S
    var c = HoseDecal.getVisitsAt(1, 1, 'f');  // corner S→E
    var d = HoseDecal.getVisitsAt(2, 1, 'f');  // head
    // tail: no entry, exit E
    assertEqual(a.visits[0].exitDir, HoseDecal.DIR_EAST, 'tail exit=E');
    // elbow 1: entry W, exit S
    assertEqual(b.visits[0].entryDir, HoseDecal.DIR_WEST, 'b entry=W');
    assertEqual(b.visits[0].exitDir, HoseDecal.DIR_SOUTH, 'b exit=S');
    // elbow 2: entry N, exit E
    assertEqual(c.visits[0].entryDir, HoseDecal.DIR_NORTH, 'c entry=N');
    assertEqual(c.visits[0].exitDir, HoseDecal.DIR_EAST, 'c exit=E');
    // head: entry W, exit null
    assertEqual(d.visits[0].entryDir, HoseDecal.DIR_WEST, 'd entry=W');
    assertEqual(d.visits[0].exitDir, null, 'd exit=null (head)');
  });
});

describe('Rung 2A — crossed tiles', function () {
  it('revisit increments crossCount and appends a visit', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');     // E
    doStep(1, 1, 'f');     // S
    doStep(0, 1, 'f');     // W
    doStep(0, 0, 'f');     // N  (revisit)
    var rec = HoseDecal.getVisitsAt(0, 0, 'f');
    assertEqual(rec.visits.length, 2, 'two visits on (0,0)');
    assertEqual(rec.crossCount, 2, 'crossCount=2');
    assertEqual(rec.visits[0].exitDir, HoseDecal.DIR_EAST, 'visit0 exit=E (original)');
    assertEqual(rec.visits[1].entryDir, HoseDecal.DIR_SOUTH, 'visit1 entry=S (revisit)');
    assertEqual(rec.visits[1].exitDir, null, 'visit1 exit null (head)');
  });

  it('isCrossed: false for single visit, true for >=2 visits', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    assertEqual(HoseDecal.isCrossed(0, 0, 'f'), false, 'single visit not crossed');
    doStep(1, 0, 'f');
    doStep(1, 1, 'f');
    doStep(0, 1, 'f');
    doStep(0, 0, 'f');     // revisit
    assertEqual(HoseDecal.isCrossed(0, 0, 'f'), true, '>=2 visits crossed');
    assertEqual(HoseDecal.isCrossed(1, 1, 'f'), false, 'single visit still not crossed');
    assertEqual(HoseDecal.isCrossed(99, 99, 'f'), false, 'never-visited tile not crossed');
  });
});

describe('Rung 2A — pop', function () {
  it('pop removes head visit and un-nulls new head exit', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');     // head=(1,0)
    var beforePop = HoseDecal.getVisitsAt(1, 0, 'f');
    assert(beforePop !== null, 'head tile exists before pop');
    doPop();
    // Head tile removed (only had one visit), ledger drops it.
    var afterPop = HoseDecal.getVisitsAt(1, 0, 'f');
    assertEqual(afterPop, null, 'head tile gone after pop');
    // New head is (0,0), and its exit must be null (we're standing on it).
    var newHead = HoseDecal.getVisitsAt(0, 0, 'f');
    assertEqual(newHead.visits[0].exitDir, null, 'new head exit re-nulled');
    var h = HoseDecal.getHead();
    assertEqual(h.x, 0, 'new head x');
    assertEqual(h.y, 0, 'new head y');
  });

  it('pop from crossed tile preserves earlier visit', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');
    doStep(1, 1, 'f');
    doStep(0, 1, 'f');
    doStep(0, 0, 'f');     // revisit → (0,0) has 2 visits
    assertEqual(HoseDecal.getVisitsAt(0, 0, 'f').visits.length, 2, 'crossed tile has 2 visits');
    doPop();               // remove the second visit (revisit)
    var rec = HoseDecal.getVisitsAt(0, 0, 'f');
    assertEqual(rec.visits.length, 1, 'one visit remains after pop');
    assertEqual(rec.visits[0].entryDir, null, 'surviving visit is the seed');
    // New head is (0,1), exit re-nulled.
    var h = HoseDecal.getHead();
    assertEqual(h.x, 0, 'new head x');
    assertEqual(h.y, 1, 'new head y');
  });

  it('pop on empty ledger is no-op', function () {
    resetLedger();
    doPop();  // should not throw
    assertEqual(HoseDecal.getHead(), null, 'head still null');
  });
});

describe('Rung 2A — strand break across floors', function () {
  it('floor-change step leaves both prev.exit and new.entry null', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f1');   // step onto a different floor
    var a = HoseDecal.getVisitsAt(0, 0, 'f0');
    var b = HoseDecal.getVisitsAt(1, 0, 'f1');
    assertEqual(a.visits[0].exitDir, null, 'prev exit stays null (strand break)');
    assertEqual(b.visits[0].entryDir, null, 'new entry null (strand break)');
    assertEqual(HoseDecal.getTileCount('f0'), 1, 'f0 has 1 tile');
    assertEqual(HoseDecal.getTileCount('f1'), 1, 'f1 has 1 tile');
  });

  it('non-adjacent same-floor step also breaks strand', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(5, 5, 'f');   // non-adjacent (teleport/warp)
    var a = HoseDecal.getVisitsAt(0, 0, 'f');
    var b = HoseDecal.getVisitsAt(5, 5, 'f');
    assertEqual(a.visits[0].exitDir, null, 'prev exit null (non-adjacent)');
    assertEqual(b.visits[0].entryDir, null, 'new entry null (non-adjacent)');
  });
});

describe('Rung 2A — detach preserves ledger', function () {
  it('detach is a no-op on data (mirrors HoseState._path policy)', function () {
    resetLedger();
    doAttach(2, 2, 'f');
    doStep(3, 2, 'f');
    var headBefore = HoseDecal.getHead();
    doDetach();
    var headAfter = HoseDecal.getHead();
    assertEqual(headAfter.x, headBefore.x, 'head x preserved post-detach');
    assertEqual(headAfter.y, headBefore.y, 'head y preserved post-detach');
    assertEqual(HoseDecal.getTileCount('f'), 2, 'tile count preserved');
  });
});

describe('Rung 2A — getVersion bumps on every mutation', function () {
  it('version bumps on attach, step, pop, clearFloor', function () {
    resetLedger();
    var v0 = HoseDecal.getVersion();
    doAttach(0, 0, 'f');
    var v1 = HoseDecal.getVersion();
    assert(v1 > v0, 'version bumped after attach');
    doStep(1, 0, 'f');
    var v2 = HoseDecal.getVersion();
    assert(v2 > v1, 'version bumped after step');
    doPop();
    var v3 = HoseDecal.getVersion();
    assert(v3 > v2, 'version bumped after pop');
    HoseDecal.clearFloor('f');
    var v4 = HoseDecal.getVersion();
    assert(v4 > v3, 'version bumped after clearFloor');
  });

  it('detach does NOT bump version (no-op)', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    var before = HoseDecal.getVersion();
    doDetach();
    var after = HoseDecal.getVersion();
    assertEqual(after, before, 'version unchanged by detach');
  });
});

describe('Rung 2A — clearFloor drops only that floor', function () {
  it('clearFloor wipes target floor, leaves others intact', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f1');        // strand break, f1 now has a visit
    doStep(2, 0, 'f1');
    assertEqual(HoseDecal.getTileCount('f0'), 1, 'f0 pre-clear');
    assertEqual(HoseDecal.getTileCount('f1'), 2, 'f1 pre-clear');
    HoseDecal.clearFloor('f1');
    assertEqual(HoseDecal.getTileCount('f0'), 1, 'f0 preserved');
    assertEqual(HoseDecal.getTileCount('f1'), 0, 'f1 wiped');
  });
});

describe('Rung 2A — rebuildFromState reconstructs ledger', function () {
  it('rebuilds from a multi-tile path identically', function () {
    resetLedger();
    // Stage a full path directly into the HoseState mock.
    var path = [
      { x: 0, y: 0, floorId: 'f' },
      { x: 1, y: 0, floorId: 'f' },
      { x: 1, y: 1, floorId: 'f' },
      { x: 2, y: 1, floorId: 'f' }
    ];
    HoseState._setPath(path);
    HoseDecal.rebuildFromState();
    assertEqual(HoseDecal.getTileCount('f'), 4, 'four tiles reconstructed');
    var a = HoseDecal.getVisitsAt(0, 0, 'f');
    var d = HoseDecal.getVisitsAt(2, 1, 'f');
    assertEqual(a.visits[0].exitDir, HoseDecal.DIR_EAST, 'tail exit correct');
    assertEqual(d.visits[0].entryDir, HoseDecal.DIR_WEST, 'head entry correct');
    assertEqual(d.visits[0].exitDir, null, 'head exit null');
  });
});

describe('Rung 2A — iterateFloorVisits', function () {
  it('visits every unique tile on a floor', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');
    doStep(1, 1, 'f');
    var seen = {};
    HoseDecal.iterateFloorVisits('f', function (x, y, rec) {
      seen[x + ',' + y] = rec.visits.length;
    });
    assertEqual(Object.keys(seen).length, 3, '3 unique tiles visited');
    assertEqual(seen['0,0'], 1, '(0,0) one visit');
    assertEqual(seen['1,0'], 1, '(1,0) one visit');
    assertEqual(seen['1,1'], 1, '(1,1) one visit');
  });

  it('early-exit via return false', function () {
    resetLedger();
    doAttach(0, 0, 'f');
    doStep(1, 0, 'f');
    doStep(2, 0, 'f');
    var count = 0;
    HoseDecal.iterateFloorVisits('f', function () {
      count++;
      return count < 2 ? undefined : false;  // stop after 2 calls
    });
    assertEqual(count, 2, 'early-exit after 2 calls');
  });
});

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('');
console.log('\x1b[1m' + _passed + ' passed, ' + _failed + ' failed\x1b[0m');
process.exit(_failed > 0 ? 1 : 0);

/**
 * test-hose-decal-raster.js — Rung 2C lock-in tests for HoseDecal raster.
 *
 * Exercises the per-tile 16×16 bitmap produced by `_paintStripe` through the
 * public `getBitmap(floorId, x, y)` API. Covers all six shape-dispatch cases
 * (seed, tail-stub, head-stub, through-pass, U-turn, 90° elbow), lazy-rebuild
 * on the `dirty` flag, the max-combine additive semantic, floor-filtering on
 * `getHeadVisitIndex`, and the `_RUNG_2C_RENDER` feature-flag toggle.
 *
 * Private raster primitives (`_paintDisc`, `_paintLine`, `_paintStripe`) are
 * not called directly — they're exercised via crafted ledger states whose
 * rebuilt bitmap is then inspected.
 *
 * Run: node tests/test-hose-decal-raster.js
 */

// ═══════════════════════════════════════════════════════════════
//  MINIMAL STUB — HoseState
// ═══════════════════════════════════════════════════════════════

var HoseState = (function () {
  var handlers = Object.create(null);
  var path = [];

  return {
    on: function (evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
    },
    getPath: function () { return path.slice(); },

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
//  TEST FRAMEWORK (matches tests/test-dungeon-schedule.js convention)
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

// Helpers

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

function resetLedger() {
  HoseDecal.reset();
}

/**
 * Read coverage byte at subcell (sx, sy) of the returned bitmap.
 * Bitmap is HOSE_RES × HOSE_RES × 2 (coverage, intensity interleaved).
 */
function covAt(bmp, sx, sy) {
  var idx = (sy * HoseDecal.HOSE_RES + sx) * 2;
  return bmp.data[idx];
}

/**
 * Count subcells with coverage > 0 in the bitmap. Useful for verifying that
 * different shapes produce meaningfully different amounts of paint.
 */
function countPainted(bmp) {
  var n = 0;
  for (var i = 0; i < bmp.data.length; i += 2) {
    if (bmp.data[i] > 0) n++;
  }
  return n;
}

/**
 * Check coverage along a horizontal row; returns the min/max x with coverage>0.
 * If no painted subcells in the row, returns null.
 */
function rowExtent(bmp, y) {
  var minX = -1, maxX = -1;
  for (var x = 0; x < HoseDecal.HOSE_RES; x++) {
    if (covAt(bmp, x, y) > 0) {
      if (minX < 0) minX = x;
      maxX = x;
    }
  }
  return minX < 0 ? null : { minX: minX, maxX: maxX };
}

/**
 * Check coverage along a vertical column; returns the min/max y with coverage>0.
 */
function colExtent(bmp, x) {
  var minY = -1, maxY = -1;
  for (var y = 0; y < HoseDecal.HOSE_RES; y++) {
    if (covAt(bmp, x, y) > 0) {
      if (minY < 0) minY = y;
      maxY = y;
    }
  }
  return minY < 0 ? null : { minY: minY, maxY: maxY };
}

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════

describe('Rung 2C — raster constants are exposed and sensible', function () {
  it('HOSE_RES is the canonical 16-subcell-per-tile resolution', function () {
    assertEqual(HoseDecal.HOSE_RES, 16, 'HOSE_RES');
  });

  it('HOSE_STRIPE_HALFW defines the stripe thickness', function () {
    assert(HoseDecal.HOSE_STRIPE_HALFW >= 1 && HoseDecal.HOSE_STRIPE_HALFW <= 4,
           'halfW in sane range');
  });

  it('HOSE_STUB_DEPTH is shorter than half-tile', function () {
    assert(HoseDecal.HOSE_STUB_DEPTH < HoseDecal.HOSE_RES / 2,
           'stub stays in the entry half of the tile');
  });
});

describe('Rung 2C — feature flag gate (_RUNG_2C_RENDER)', function () {
  it('getBitmap returns null when flag is false', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    HoseDecal._RUNG_2C_RENDER = false;
    var bmp = HoseDecal.getBitmap('f0', 0, 0);
    assertEqual(bmp, null, 'flag off → null');
    HoseDecal._RUNG_2C_RENDER = true;  // restore
  });

  it('getBitmap returns a record when flag is true', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    HoseDecal._RUNG_2C_RENDER = true;
    var bmp = HoseDecal.getBitmap('f0', 0, 0);
    assert(bmp !== null, 'non-null when flag on');
    assert(bmp.data instanceof Uint8Array, 'bmp.data is Uint8Array');
    assertEqual(bmp.data.length, HoseDecal.HOSE_RES * HoseDecal.HOSE_RES * 2,
                'bitmap length = RES² × 2');
  });

  it('getBitmap returns null for unpainted tiles', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 5, 5);
    assertEqual(bmp, null, 'non-visited tile → null');
  });

  it('getBitmap returns null for unknown floor', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    var bmp = HoseDecal.getBitmap('nonexistent', 0, 0);
    assertEqual(bmp, null, 'unknown floorId → null');
  });
});

describe('Rung 2C — seed tile paints a center disc', function () {
  it('attach-only tile has coverage near center but not at corners', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 0, 0);
    assert(bmp !== null, 'bmp exists');

    var center = HoseDecal.HOSE_RES >> 1;
    assert(covAt(bmp, center, center) > 0, 'center painted');

    // Corners should be untouched (disc radius is ~3 subcells).
    assertEqual(covAt(bmp, 0, 0), 0, 'top-left corner blank');
    assertEqual(covAt(bmp, HoseDecal.HOSE_RES - 1, 0), 0, 'top-right corner blank');
    assertEqual(covAt(bmp, 0, HoseDecal.HOSE_RES - 1), 0, 'bottom-left corner blank');
    assertEqual(covAt(bmp, HoseDecal.HOSE_RES - 1, HoseDecal.HOSE_RES - 1), 0,
                'bottom-right corner blank');
  });

  it('seed disc paints coverage symmetrically around center', function () {
    resetLedger();
    doAttach(3, 3, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 3, 3);
    var center = HoseDecal.HOSE_RES >> 1;
    // Pick a radius just inside the disc.
    var r = HoseDecal.HOSE_STRIPE_HALFW;
    assert(covAt(bmp, center + r, center) > 0 || covAt(bmp, center + r - 1, center) > 0,
           'east of center painted');
    assert(covAt(bmp, center - r, center) > 0 || covAt(bmp, center - r + 1, center) > 0,
           'west of center painted');
  });
});

describe('Rung 2C — tail-stub (entry=null, exit=dir) paints edge↔center', function () {
  it('after attach + step E, origin tile has exit=E, paints a stub toward east edge', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    // Origin tile (0,0) is now a tail: entry=null, exit=E.
    var bmp = HoseDecal.getBitmap('f0', 0, 0);
    var mid = HoseDecal.HOSE_RES >> 1;

    // East edge midpoint should have coverage.
    assert(covAt(bmp, HoseDecal.HOSE_RES - 1, mid) > 0, 'east edge midpoint painted');
    // Center should have coverage.
    assert(covAt(bmp, mid, mid) > 0, 'center painted');

    // West edge (opposite direction) should NOT be painted — stub only reaches
    // from edge to center.
    assertEqual(covAt(bmp, 0, mid), 0, 'west edge untouched');
  });

  it('tail stub painted on right half only (not beyond center on opposite side)', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 0, 0);
    var mid = HoseDecal.HOSE_RES >> 1;
    var ext = rowExtent(bmp, mid);
    assert(ext !== null, 'middle row has paint');
    // Far-left extent shouldn't extend much past center minus half-width.
    assert(ext.minX >= mid - HoseDecal.HOSE_STRIPE_HALFW - 1,
           'paint does not cross far left past center: minX=' + ext.minX);
    assert(ext.maxX >= HoseDecal.HOSE_RES - 2, 'paint reaches the east edge');
  });
});

describe('Rung 2C — head-stub (entry=dir, exit=null) paints edge↔center', function () {
  it('after attach + step E, new head tile (1,0) has entry=W, exit=null', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 1, 0);
    var mid = HoseDecal.HOSE_RES >> 1;

    // West edge midpoint painted (entry).
    assert(covAt(bmp, 0, mid) > 0, 'west edge midpoint painted');
    assert(covAt(bmp, mid, mid) > 0, 'center painted');
    // East edge untouched — it's a stub, not a through-pass.
    assertEqual(covAt(bmp, HoseDecal.HOSE_RES - 1, mid), 0,
                'east edge untouched (head stub is half-tile)');
  });
});

describe('Rung 2C — through-pass (entry + opposite exit) paints full-width line', function () {
  it('two steps E gives middle tile a W→E through-pass', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');   // middle tile (1,0) entry=W, exit=null
    doStep(2, 0, 'f0');   // now (1,0) becomes entry=W, exit=E
    var bmp = HoseDecal.getBitmap('f0', 1, 0);
    var mid = HoseDecal.HOSE_RES >> 1;

    // Both edges painted.
    assert(covAt(bmp, 0, mid) > 0, 'west edge painted');
    assert(covAt(bmp, HoseDecal.HOSE_RES - 1, mid) > 0, 'east edge painted');
    assert(covAt(bmp, mid, mid) > 0, 'center painted');

    var ext = rowExtent(bmp, mid);
    assertEqual(ext.minX, 0, 'line reaches west edge');
    assertEqual(ext.maxX, HoseDecal.HOSE_RES - 1, 'line reaches east edge');
  });

  it('through-pass on middle row leaves top/bottom rows of tile mostly blank', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(2, 0, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 1, 0);

    // Top row should have no paint (stripe is in the middle row).
    assertEqual(rowExtent(bmp, 0), null, 'top row blank');
    assertEqual(rowExtent(bmp, HoseDecal.HOSE_RES - 1), null, 'bottom row blank');
  });
});

describe('Rung 2C — 90° elbow (perpendicular edges) paints two-segment bend', function () {
  it('step E then S at (1,0) gives entry=W exit=S — paints W→center→S', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');   // (1,0) entry=W, exit=null
    doStep(1, 1, 'f0');   // (1,0) now entry=W, exit=S
    var bmp = HoseDecal.getBitmap('f0', 1, 0);
    var mid = HoseDecal.HOSE_RES >> 1;

    // West edge painted.
    assert(covAt(bmp, 0, mid) > 0, 'west edge painted');
    // South edge painted.
    assert(covAt(bmp, mid, HoseDecal.HOSE_RES - 1) > 0, 'south edge painted');
    // Center painted (elbow pivots at center).
    assert(covAt(bmp, mid, mid) > 0, 'center painted');

    // East edge NOT painted (this is elbow, not through-pass).
    assertEqual(covAt(bmp, HoseDecal.HOSE_RES - 1, mid), 0, 'east edge blank');
    // North edge NOT painted.
    assertEqual(covAt(bmp, mid, 0), 0, 'north edge blank');
  });
});

describe('Rung 2C — U-turn (entry === exit) paints stub line inward', function () {
  it('U-turn visit paints from entry edge but does NOT reach opposite edge', function () {
    resetLedger();
    // Craft path where tile (0,0) visit 2 is a (E,E) U-turn:
    //   (0,0) attach → (1,0) step E → (0,0) step W → (1,0) step E
    // Tile (0,0) gets visit 1 (null,E) tail and visit 2 (E,E) U-turn.
    // Max-combine paints union of both shapes but neither reaches west edge.
    HoseState._setPath([
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' }
    ]);
    HoseDecal.rebuildFromState();

    var bmp = HoseDecal.getBitmap('f0', 0, 0);
    assert(bmp !== null, 'tile (0,0) bitmap exists');
    var mid = HoseDecal.HOSE_RES >> 1;

    // East edge painted (U-turn enters from east; tail stub exits east).
    assert(covAt(bmp, HoseDecal.HOSE_RES - 1, mid) > 0, 'east edge painted');

    // West edge must NOT be painted — both shapes are stubs that stop at
    // center or earlier. This is the essential U-turn invariant.
    assertEqual(covAt(bmp, 0, mid), 0, 'west edge blank (U-turn is stub)');

    // Top and bottom rows should also be blank (both shapes are along middle row).
    assertEqual(rowExtent(bmp, 0), null, 'top row blank');
    assertEqual(rowExtent(bmp, HoseDecal.HOSE_RES - 1), null, 'bottom row blank');
  });

  it('U-turn paints less than a through-pass (stub is shorter)', function () {
    resetLedger();
    // Build a U-turn.
    HoseState._setPath([
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' }
    ]);
    HoseDecal.rebuildFromState();
    var uTurnPainted = countPainted(HoseDecal.getBitmap('f0', 0, 0));

    // Now a through-pass on fresh tile.
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(2, 0, 'f0');
    var throughPainted = countPainted(HoseDecal.getBitmap('f0', 1, 0));

    assert(uTurnPainted < throughPainted,
           'U-turn paints less than through: uTurn=' + uTurnPainted + ' through=' + throughPainted);
  });
});

describe('Rung 2C — max-combine (overlapping visits are idempotent/additive)', function () {
  it('crossed-tile with two visits paints MORE than a single through-pass', function () {
    resetLedger();
    // Make a crossed tile: two visits through (1,0) from different directions.
    HoseState._setPath([
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },  // visit 1 at (1,0): entry=W, exit=?
      { x: 2, y: 0, floorId: 'f0' },  // visit 1 at (1,0): entry=W, exit=E
      { x: 2, y: 1, floorId: 'f0' },
      { x: 1, y: 1, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },  // visit 2 at (1,0): entry=S, exit=?
      { x: 0, y: 0, floorId: 'f0' }   // visit 2 at (1,0): entry=S, exit=W
    ]);
    HoseDecal.rebuildFromState();
    var crossedPainted = countPainted(HoseDecal.getBitmap('f0', 1, 0));

    // A single through-pass for comparison.
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(2, 0, 'f0');
    var singlePainted = countPainted(HoseDecal.getBitmap('f0', 1, 0));

    assert(crossedPainted > singlePainted,
           'crossed tile paints more than single pass: crossed=' + crossedPainted + ' single=' + singlePainted);
  });

  it('double-rebuild of identical state produces identical bitmap (max-combine idempotent)', function () {
    resetLedger();
    HoseState._setPath([
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },
      { x: 2, y: 0, floorId: 'f0' }
    ]);
    HoseDecal.rebuildFromState();
    var bmpA = HoseDecal.getBitmap('f0', 1, 0);
    var snapA = Array.prototype.slice.call(bmpA.data);

    // Rebuild again — max-combine means we get the same thing.
    HoseDecal.rebuildFromState();
    var bmpB = HoseDecal.getBitmap('f0', 1, 0);

    for (var i = 0; i < snapA.length; i++) {
      if (bmpB.data[i] !== snapA[i]) {
        throw new Error('byte ' + i + ' differs: ' + bmpB.data[i] + ' vs ' + snapA[i]);
      }
    }
  });
});

describe('Rung 2C — lazy rebuild (dirty flag)', function () {
  it('getBitmap only rebuilds when dirty; repeat calls return same instance', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    var bmp1 = HoseDecal.getBitmap('f0', 0, 0);
    var bmp2 = HoseDecal.getBitmap('f0', 0, 0);
    // Second call should return the same underlying Uint8Array (not rebuilt).
    assert(bmp1.data === bmp2.data, 'same Uint8Array reference on cached rebuild');
  });

  it('step marks tile dirty, next getBitmap reflects new shape', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    var bmp1 = HoseDecal.getBitmap('f0', 0, 0);
    var seedPainted = countPainted(bmp1);

    doStep(1, 0, 'f0');  // (0,0) is now a tail stub, not a seed disc
    var bmp2 = HoseDecal.getBitmap('f0', 0, 0);
    var tailPainted = countPainted(bmp2);

    // Tail-stub reaches edge — paints more than the center disc.
    assert(tailPainted > seedPainted,
           'tail-stub paints more than seed disc: tail=' + tailPainted + ' seed=' + seedPainted);
  });
});

describe('Rung 2C — getHeadVisitIndex tracks hose head with floor filtering', function () {
  it('returns -1 on empty ledger', function () {
    resetLedger();
    assertEqual(HoseDecal.getHeadVisitIndex('f0'), -1, 'empty → -1');
  });

  it('returns visit 0 after attach', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    assertEqual(HoseDecal.getHeadVisitIndex('f0'), 0, 'head at visit 0 after attach');
  });

  it('bumps after each step', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(2, 0, 'f0');
    assertEqual(HoseDecal.getHeadVisitIndex('f0'), 2, 'head at visit 2 after 2 steps');
  });

  it('returns -1 when head is on a different floor', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(0, 0, 'f1');   // strand-break transition to new floor
    assertEqual(HoseDecal.getHeadVisitIndex('f1'), 2, 'head on f1');
    assertEqual(HoseDecal.getHeadVisitIndex('f0'), -1, 'f0 no longer has head');
  });
});

describe('Rung 2C — bitmap metadata (visitIndexAtPaint, crossCount)', function () {
  it('seed tile exposes visitIndexAtPaint and crossCount=1', function () {
    resetLedger();
    doAttach(4, 4, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 4, 4);
    assertEqual(typeof bmp.visitIndexAtPaint, 'number', 'visitIndexAtPaint is a number');
    assertEqual(bmp.crossCount, 1, 'crossCount=1 for single visit');
  });

  it('crossed tile reports crossCount>=2', function () {
    resetLedger();
    HoseState._setPath([
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },
      { x: 2, y: 0, floorId: 'f0' },
      { x: 2, y: 1, floorId: 'f0' },
      { x: 1, y: 1, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' },
      { x: 0, y: 0, floorId: 'f0' }
    ]);
    HoseDecal.rebuildFromState();
    var bmp = HoseDecal.getBitmap('f0', 1, 0);
    assert(bmp.crossCount >= 2, 'crossed tile crossCount: ' + bmp.crossCount);
  });

  it('visitIndexAtPaint advances as tile becomes head again', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    var origHead = HoseDecal.getBitmap('f0', 0, 0).visitIndexAtPaint;

    doStep(1, 0, 'f0');
    // (0,0) is no longer head; (1,0) is.
    var newHead = HoseDecal.getBitmap('f0', 1, 0).visitIndexAtPaint;
    assert(newHead > origHead,
           '(1,0) visitIndexAtPaint greater: ' + newHead + ' > ' + origHead);
  });
});

describe('Rung 2C — pop triggers full rebuild (max-combine cannot subtract)', function () {
  it('after step + pop, the tile that was head is repainted correctly', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(2, 0, 'f0');
    // Before pop: (1,0) is a through-pass (W→E).
    var beforePainted = countPainted(HoseDecal.getBitmap('f0', 1, 0));

    // Pop — now (1,0) is the head stub again (entry=W, exit=null).
    HoseState._setPath([
      { x: 0, y: 0, floorId: 'f0' },
      { x: 1, y: 0, floorId: 'f0' }
    ]);
    doPop();

    var afterBmp = HoseDecal.getBitmap('f0', 1, 0);
    assert(afterBmp !== null, 'tile still exists after pop');
    var afterPainted = countPainted(afterBmp);
    // After pop it becomes a half-tile stub — fewer painted subcells.
    assert(afterPainted < beforePainted,
           'pop reduces paint (through-pass → stub): before=' + beforePainted + ' after=' + afterPainted);

    // And east edge should now be blank (no longer exits east).
    var mid = HoseDecal.HOSE_RES >> 1;
    assertEqual(covAt(afterBmp, HoseDecal.HOSE_RES - 1, mid), 0,
                'east edge blank after pop');
  });
});

describe('Rung 2C — clearFloor removes bitmaps on that floor only', function () {
  it('clearing one floor does not affect another floor', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(0, 0, 'f1');  // strand-break: fresh floor f1
    assert(HoseDecal.getBitmap('f0', 0, 0) !== null, 'f0 has bitmap');
    assert(HoseDecal.getBitmap('f1', 0, 0) !== null, 'f1 has bitmap');

    HoseDecal.clearFloor('f0');
    assertEqual(HoseDecal.getBitmap('f0', 0, 0), null, 'f0 cleared');
    assert(HoseDecal.getBitmap('f1', 0, 0) !== null, 'f1 still has bitmap');
  });
});

describe('Rung 2C — stripe thickness property', function () {
  it('straight through-pass produces coverage on multiple rows (thickness > 1 subcell)', function () {
    resetLedger();
    doAttach(0, 0, 'f0');
    doStep(1, 0, 'f0');
    doStep(2, 0, 'f0');
    var bmp = HoseDecal.getBitmap('f0', 1, 0);
    var mid = HoseDecal.HOSE_RES >> 1;

    // Count rows that have coverage at the center x.
    var painted = 0;
    for (var y = 0; y < HoseDecal.HOSE_RES; y++) {
      if (covAt(bmp, mid, y) > 0) painted++;
    }
    assert(painted >= 2 * HoseDecal.HOSE_STRIPE_HALFW,
           'stripe thickness >= 2×halfW rows: painted=' + painted);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n\x1b[1m' + _passed + ' passed, ' + _failed + ' failed\x1b[0m');
if (_failed > 0) process.exit(1);

/**
 * test-dungeon-schedule.js — Headless integration test for DungeonSchedule.
 *
 * Stubs ReadinessCalc, HeroRun, MailboxPeek, FloorManager so
 * DungeonSchedule can run its full state machine in isolation.
 *
 * Run: node tests/test-dungeon-schedule.js
 */

// ═══════════════════════════════════════════════════════════════
//  MINIMAL STUBS — just enough API surface for DungeonSchedule
// ═══════════════════════════════════════════════════════════════

var _snapshotLog = [];
var _coreScores = {};    // floorId → score
var _totalScores = {};   // floorId → score

var ReadinessCalc = {
  snapshotFloor: function (fid) { _snapshotLog.push(fid); },
  getCoreScore:  function (fid) { return _coreScores[fid] || 0; },
  getScore:      function (fid) { return _totalScores[fid] || 0; }
};

var _heroRunCalls = [];
var HeroRun = {
  executeRun: function (heroType, floors, day) {
    _heroRunCalls.push({ heroType: heroType, floors: floors, day: day });
    var payout = 0;
    for (var i = 0; i < floors.length; i++) {
      payout += Math.round(floors[i].readiness * 10);
    }
    return {
      heroType: heroType,
      heroEmoji: '⚔️',
      floors: floors,
      totalPayout: payout,
      chainBonus: false,
      cardDrop: null,
      isDeathReport: false,
      rescueText: null
    };
  },
  getHeroEmoji: function () { return '⚔️'; }
};

var _mailboxReports = [];
var MailboxPeek = {
  addReport: function (r) { _mailboxReports.push(r); }
};

var FloorManager = {
  getCachedFloorData: function () { return null; },
  invalidateCache: function () {}
};

var TILES = { BREAKABLE: 3, TRAP: 7 };

var i18n = { t: function (key, fallback) { return fallback || key; } };

// ═══════════════════════════════════════════════════════════════
//  LOAD MODULE
// ═══════════════════════════════════════════════════════════════

// DungeonSchedule is an IIFE that assigns to `var DungeonSchedule`.
// We eval it in this scope so the stubs are visible.
var fs = require('fs');
var src = fs.readFileSync(__dirname + '/../engine/dungeon-schedule.js', 'utf8');
eval(src);

// ═══════════════════════════════════════════════════════════════
//  TEST FRAMEWORK (minimal)
// ═══════════════════════════════════════════════════════════════

var _passed = 0;
var _failed = 0;
var _tests = [];

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
  if (a !== b) throw new Error((msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

function resetStubs() {
  _snapshotLog = [];
  _heroRunCalls = [];
  _mailboxReports = [];
  _coreScores = {};
  _totalScores = {};
}

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════

describe('DungeonSchedule — Init', function () {
  it('should export frozen API', function () {
    assert(typeof DungeonSchedule === 'object', 'DungeonSchedule exists');
    assert(typeof DungeonSchedule.init === 'function', 'init exists');
    assert(typeof DungeonSchedule.onDayChange === 'function', 'onDayChange exists');
    assert(typeof DungeonSchedule.onPlayerDeath === 'function', 'onPlayerDeath exists');
    assert(typeof DungeonSchedule.getSchedule === 'function', 'getSchedule exists');
    assert(typeof DungeonSchedule.getCombo === 'function', 'getCombo exists');
    assert(typeof DungeonSchedule.getArcSummary === 'function', 'getArcSummary exists');
    assert(typeof DungeonSchedule.isArcComplete === 'function', 'isArcComplete exists');
    assert(typeof DungeonSchedule.JAM_CONTRACTS === 'object', 'JAM_CONTRACTS exists');
  });

  it('should have 3 JAM_CONTRACTS (soft_cellar, heros_wake, heart)', function () {
    assertEqual(DungeonSchedule.JAM_CONTRACTS.length, 3, 'contract count');
    assertEqual(DungeonSchedule.JAM_CONTRACTS[0].groupId, 'soft_cellar');
    assertEqual(DungeonSchedule.JAM_CONTRACTS[1].groupId, 'heros_wake');
    assertEqual(DungeonSchedule.JAM_CONTRACTS[2].groupId, 'heart');
  });

  it('should init with default contracts', function () {
    resetStubs();
    DungeonSchedule.init();
    var sched = DungeonSchedule.getSchedule();
    assertEqual(sched.length, 3, 'schedule length');
    assertEqual(sched[0].actualDay, 2, 'Group A actualDay');
    assertEqual(sched[1].actualDay, 5, 'Group B actualDay');
    assertEqual(sched[2].actualDay, 8, 'Group C actualDay');
    assert(!DungeonSchedule.isArcComplete(), 'arc not complete at start');
  });

  it('should start with combo streak 0', function () {
    DungeonSchedule.init();
    var combo = DungeonSchedule.getCombo();
    assertEqual(combo.streak, 0, 'streak');
    assertEqual(combo.multiplier, 1.0, 'multiplier');
    assertEqual(combo.maxStreak, 0, 'maxStreak');
  });
});

describe('DungeonSchedule — Day Change / Group Resolution', function () {
  it('should not resolve groups before their hero day', function () {
    resetStubs();
    DungeonSchedule.init();
    DungeonSchedule.onDayChange(0);
    DungeonSchedule.onDayChange(1);
    assertEqual(_heroRunCalls.length, 0, 'no hero runs before day 2');
    assertEqual(_mailboxReports.length, 0, 'no mailbox reports');
  });

  it('should resolve Group A on day 2', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.72;
    _totalScores['1.3.1'] = 1.1;

    DungeonSchedule.onDayChange(2);

    assertEqual(_snapshotLog.length, 1, 'one floor snapshotted');
    assertEqual(_snapshotLog[0], '1.3.1', 'correct floor');
    assertEqual(_heroRunCalls.length, 1, 'one hero run');
    assertEqual(_heroRunCalls[0].heroType, 'Seeker', 'correct hero type');
    assertEqual(_mailboxReports.length, 1, 'one mailbox report');

    var sched = DungeonSchedule.getSchedule();
    assert(sched[0].resolved, 'Group A resolved');
    assert(!sched[1].resolved, 'Group B not resolved');
    assert(!sched[2].resolved, 'Group C not resolved');
  });

  it('should award combo streak when on-schedule and above target', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.72;  // above 0.6 target

    DungeonSchedule.onDayChange(2);

    var combo = DungeonSchedule.getCombo();
    assertEqual(combo.streak, 1, 'streak = 1 after Group A');
    assertEqual(combo.multiplier, 1.1, 'multiplier = 1.1');
  });

  it('should break combo when below target', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.72;
    DungeonSchedule.onDayChange(2);  // Group A passes → streak 1

    _coreScores['2.2.1'] = 0.3;  // below target
    _coreScores['2.2.2'] = 0.4;  // below target (average 0.35)
    DungeonSchedule.onDayChange(5);  // Group B fails

    var combo = DungeonSchedule.getCombo();
    assertEqual(combo.streak, 0, 'streak broken');
    assertEqual(combo.multiplier, 1.0, 'multiplier reset');
    assertEqual(combo.maxStreak, 1, 'maxStreak preserved');
  });

  it('should build combo streak across groups', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.8;
    _coreScores['2.2.1'] = 0.7;
    _coreScores['2.2.2'] = 0.9;

    DungeonSchedule.onDayChange(2);  // Group A → streak 1
    DungeonSchedule.onDayChange(5);  // Group B → streak 2

    var combo = DungeonSchedule.getCombo();
    assertEqual(combo.streak, 2, 'streak = 2');
    assertEqual(combo.multiplier, 1.2, 'multiplier = 1.2');
  });

  it('Heart dungeon (Group C) should not affect combo', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.8;
    _coreScores['2.2.1'] = 0.7;
    _coreScores['2.2.2'] = 0.9;
    _coreScores['0.1.1'] = 0.1;  // Heart has low readiness

    DungeonSchedule.onDayChange(2);  // Group A → streak 1
    DungeonSchedule.onDayChange(5);  // Group B → streak 2
    DungeonSchedule.onDayChange(8);  // Group C (heart, combo-exempt)

    var combo = DungeonSchedule.getCombo();
    assertEqual(combo.streak, 2, 'streak preserved through Heart');
    assert(DungeonSchedule.isArcComplete(), 'arc complete');
  });

  it('should not re-resolve already resolved groups', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.72;

    DungeonSchedule.onDayChange(2);
    var callsBefore = _heroRunCalls.length;

    DungeonSchedule.onDayChange(2);  // duplicate
    assertEqual(_heroRunCalls.length, callsBefore, 'no duplicate run');
  });
});

describe('DungeonSchedule — Death Shift', function () {
  it('should shift Group B hero day on death in 2.2.1', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.72;
    DungeonSchedule.onDayChange(2);  // resolve Group A

    // Player dies in Hero's Wake on day 3
    DungeonSchedule.onDayChange(3);  // advance day tracker
    var shifted = DungeonSchedule.onPlayerDeath('2.2.1');

    assert(shifted !== null, 'shift returned contract');
    assertEqual(shifted.actualDay, 4, 'shifted to day 4 (tomorrow)');
    assert(!shifted.onSchedule, 'marked off-schedule');

    // Group B's scheduled day was 5, now it's 4
    var sched = DungeonSchedule.getSchedule();
    assertEqual(sched[1].actualDay, 4, 'schedule reflects shift');
    assertEqual(sched[1].onSchedule, false, 'schedule reflects off-schedule');
  });

  it('should not shift already-resolved groups', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.72;
    DungeonSchedule.onDayChange(2);  // resolve Group A

    var shifted = DungeonSchedule.onPlayerDeath('1.3.1');
    assert(shifted === null, 'no shift on resolved group');
  });

  it('should not shift if hero day is already tomorrow or sooner', function () {
    resetStubs();
    DungeonSchedule.init();

    // Day 1, Group A hero day is day 2 (tomorrow)
    DungeonSchedule.onDayChange(1);
    var shifted = DungeonSchedule.onPlayerDeath('1.3.1');

    // actualDay=2, tomorrow=2, no shift needed
    var sched = DungeonSchedule.getSchedule();
    assertEqual(sched[0].actualDay, 2, 'no shift — already day 2');
  });

  it('should break combo on death-shifted group', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.8;
    DungeonSchedule.onDayChange(2);  // Group A passes → streak 1

    // Death-shift Group B
    DungeonSchedule.onDayChange(3);
    DungeonSchedule.onPlayerDeath('2.2.1');

    // Now set good readiness and let shifted day resolve
    _coreScores['2.2.1'] = 0.9;
    _coreScores['2.2.2'] = 0.9;
    DungeonSchedule.onDayChange(4);  // shifted hero day

    var combo = DungeonSchedule.getCombo();
    assertEqual(combo.streak, 0, 'combo broken by death-shift');
  });

  it('should allow multiple groups to converge on same day', function () {
    resetStubs();
    DungeonSchedule.init();

    // Death in both Group A floors (day 0) and Group B floors (day 0)
    // → both shift to day 1
    DungeonSchedule.onDayChange(0);
    DungeonSchedule.onPlayerDeath('1.3.1');  // Group A: day 2 → day 1
    DungeonSchedule.onPlayerDeath('2.2.1');  // Group B: day 5 → day 1

    var sched = DungeonSchedule.getSchedule();
    assertEqual(sched[0].actualDay, 1, 'Group A shifted to day 1');
    assertEqual(sched[1].actualDay, 1, 'Group B shifted to day 1');

    // Both should resolve on day 1
    _coreScores['1.3.1'] = 0.5;
    _coreScores['2.2.1'] = 0.5;
    _coreScores['2.2.2'] = 0.5;
    DungeonSchedule.onDayChange(1);

    assertEqual(_heroRunCalls.length, 2, 'two hero runs on converged day');
    assertEqual(_mailboxReports.length, 2, 'two mailbox reports');
    assert(sched[0].resolved || DungeonSchedule.getSchedule()[0].resolved, 'Group A resolved');
    assert(sched[1].resolved || DungeonSchedule.getSchedule()[1].resolved, 'Group B resolved');
  });

  it('should return null for unknown floor', function () {
    resetStubs();
    DungeonSchedule.init();
    var shifted = DungeonSchedule.onPlayerDeath('9.9.9');
    assert(shifted === null, 'null for unknown floor');
  });
});

describe('DungeonSchedule — Queries', function () {
  it('getGroupForFloor should map floors correctly', function () {
    DungeonSchedule.init();
    assertEqual(DungeonSchedule.getGroupForFloor('1.3.1'), 'soft_cellar');
    assertEqual(DungeonSchedule.getGroupForFloor('2.2.1'), 'heros_wake');
    assertEqual(DungeonSchedule.getGroupForFloor('2.2.2'), 'heros_wake');
    assertEqual(DungeonSchedule.getGroupForFloor('0.1.1'), 'heart');
    assertEqual(DungeonSchedule.getGroupForFloor('9.9.9'), null);
  });

  it('getDaysUntilHeroDay should count correctly', function () {
    DungeonSchedule.init();
    DungeonSchedule.onDayChange(0);
    assertEqual(DungeonSchedule.getDaysUntilHeroDay('soft_cellar'), 2);
    assertEqual(DungeonSchedule.getDaysUntilHeroDay('heros_wake'), 5);
    assertEqual(DungeonSchedule.getDaysUntilHeroDay('heart'), 8);

    DungeonSchedule.onDayChange(3);
    assertEqual(DungeonSchedule.getDaysUntilHeroDay('heros_wake'), 2);
  });

  it('getDaysUntilHeroDay should return -1 for resolved groups', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.7;
    DungeonSchedule.onDayChange(2);

    assertEqual(DungeonSchedule.getDaysUntilHeroDay('soft_cellar'), -1);
  });

  it('getNextGroup should return soonest unresolved', function () {
    resetStubs();
    DungeonSchedule.init();
    DungeonSchedule.onDayChange(0);

    var next = DungeonSchedule.getNextGroup();
    assertEqual(next.groupId, 'soft_cellar', 'soonest is Group A');
    assertEqual(next.daysAway, 2, '2 days away');

    _coreScores['1.3.1'] = 0.7;
    DungeonSchedule.onDayChange(2);

    next = DungeonSchedule.getNextGroup();
    assertEqual(next.groupId, 'heros_wake', 'after A resolves, B is next');
  });

  it('getNextGroup should return null when all resolved', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.8;
    _coreScores['2.2.1'] = 0.7;
    _coreScores['2.2.2'] = 0.7;
    _coreScores['0.1.1'] = 0.5;

    DungeonSchedule.onDayChange(2);
    DungeonSchedule.onDayChange(5);
    DungeonSchedule.onDayChange(8);

    assert(DungeonSchedule.getNextGroup() === null, 'null when all done');
  });
});

describe('DungeonSchedule — Arc Summary', function () {
  it('should produce correct summary for full arc', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.85;
    _totalScores['1.3.1'] = 1.4;
    _coreScores['2.2.1'] = 0.7;
    _coreScores['2.2.2'] = 0.9;
    _totalScores['2.2.1'] = 1.0;
    _totalScores['2.2.2'] = 1.2;
    _coreScores['0.1.1'] = 0.4;
    _totalScores['0.1.1'] = 0.4;

    DungeonSchedule.onDayChange(2);
    DungeonSchedule.onDayChange(5);
    DungeonSchedule.onDayChange(8);

    var summary = DungeonSchedule.getArcSummary();
    assert(summary.allResolved, 'all resolved');
    assertEqual(summary.groups.length, 3, '3 groups');
    assertEqual(summary.combo.streak, 2, 'combo streak 2');
    assertEqual(summary.combo.maxStreak, 2, 'max streak 2');
    assert(summary.totalPayout > 0, 'payout > 0');
    assert(summary.totalStars > 0, 'stars > 0');
    assertEqual(summary.maxStars, 15, 'max stars = 3 groups × 5');

    // Star ratings
    assertEqual(summary.groups[0].stars, 4, 'Group A: 85% → 4 stars');
    assertEqual(summary.groups[1].stars, 4, 'Group B: avg 80% → 4 stars');
    assertEqual(summary.groups[2].stars, 2, 'Group C: 40% → 2 stars');
  });

  it('should show combo multiplier applied to payouts', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.8;
    _totalScores['1.3.1'] = 0.8;

    DungeonSchedule.onDayChange(2);  // streak = 1

    // Check that the report has comboMultiplier
    assert(_mailboxReports.length === 1, 'one report');
    // Combo multiplier is applied BEFORE the group resolves (for next group).
    // Actually — the combo increments AFTER resolution, so Group A's payout
    // gets the pre-increment multiplier (1.0×), Group B gets 1.1×.
    // Let's verify Group B gets the multiplier.
    _coreScores['2.2.1'] = 0.7;
    _coreScores['2.2.2'] = 0.9;
    _totalScores['2.2.1'] = 0.7;
    _totalScores['2.2.2'] = 0.9;

    DungeonSchedule.onDayChange(5);

    var reportB = _mailboxReports[1];
    assert(reportB.comboMultiplier === 1.1, 'Group B report has 1.1× multiplier');
  });
});

describe('DungeonSchedule — Custom Config', function () {
  it('should accept custom contracts', function () {
    resetStubs();
    DungeonSchedule.init([
      {
        groupId: 'test_a',
        label: 'Test A',
        floorIds: ['5.5.1'],
        scheduledDay: 1,
        heroType: 'Shadow',
        comboEligible: true,
        target: 0.5
      }
    ]);

    var sched = DungeonSchedule.getSchedule();
    assertEqual(sched.length, 1, 'one contract');
    assertEqual(sched[0].groupId, 'test_a');
    assertEqual(DungeonSchedule.getGroupForFloor('5.5.1'), 'test_a');
  });
});

describe('DungeonSchedule — game.js Week Strip Integration Shape', function () {
  it('getSchedule provides all fields the week strip needs', function () {
    resetStubs();
    DungeonSchedule.init();
    _coreScores['1.3.1'] = 0.7;
    DungeonSchedule.onDayChange(2);

    var sched = DungeonSchedule.getSchedule();
    var a = sched[0];

    // All fields the _buildHeroDayMap helper accesses:
    assert('groupId' in a, 'groupId');
    assert('actualDay' in a, 'actualDay');
    assert('scheduledDay' in a, 'scheduledDay');
    assert('resolved' in a, 'resolved');
    assert('onSchedule' in a, 'onSchedule');
    assert('result' in a, 'result');
    assert(a.result !== null, 'result populated after resolve');
    assert('coreScore' in a.result, 'result.coreScore');
    assert('stars' in a.result, 'result.stars');
  });
});

// ═══════════════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════');
console.log('  \x1b[1mResults: ' + _passed + ' passed, ' + _failed + ' failed\x1b[0m');
console.log('═══════════════════════════════════════════');

process.exit(_failed > 0 ? 1 : 0);

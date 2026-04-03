/**
 * test-mailbox-system.js — Headless integration tests for the mailbox system.
 *
 * Tests: MailboxPeek (pending/collected split, history API, dynamic pos),
 *        MailboxSprites (emoji state, pending/reading toggles),
 *        TILES.MAILBOX (tile type, walkability, opacity).
 *
 * Run: node tests/test-mailbox-system.js
 */

// ═══════════════════════════════════════════════════════════════
//  MINIMAL STUBS
// ═══════════════════════════════════════════════════════════════

var _currentFloorId = '1';
var _playerPos = { x: 32, y: 8 };
var _playerDir = 0; // EAST → faces (33, 8)

var FloorManager = {
  getCurrentFloorId: function () { return _currentFloorId; },
  getFloorData: function (fid) {
    if (fid === '1') {
      // Minimal Floor 1 grid with MAILBOX at (33, 8)
      var grid = [];
      for (var y = 0; y < 30; y++) {
        grid[y] = [];
        for (var x = 0; x < 40; x++) grid[y][x] = 0;
      }
      grid[8][33] = 37; // MAILBOX
      return { grid: grid, gridW: 40, gridH: 30 };
    }
    if (fid === '1.6') {
      var grid16 = [];
      for (var y2 = 0; y2 < 20; y2++) {
        grid16[y2] = [];
        for (var x2 = 0; x2 < 24; x2++) grid16[y2][x2] = 0;
      }
      grid16[6][19] = 10; // PILLAR at history pos
      return { grid: grid16, gridW: 24, gridH: 20, mailboxHistory: { x: 19, y: 6 } };
    }
    return null;
  }
};

var Player = {
  getGridPos: function () { return { x: _playerPos.x, y: _playerPos.y }; },
  getDirection: function () { return _playerDir; }
};

var _toastLog = [];
var Toast = {
  show: function (msg, style) { _toastLog.push({ msg: msg, style: style }); }
};

var _goldAdded = 0;
var CardAuthority = {
  addGold: function (amount) { _goldAdded += amount; }
};

var AudioSystem = {
  playSFX: function () {}
};

var InputManager = {
  _handlers: {},
  on: function (evt, fn) { InputManager._handlers[evt] = fn; }
};

var DayCycle = {
  getCurrentDay: function () { return 2; }
};

var DungeonSchedule = {
  getNextGroup: function () {
    return { label: "Hero's Wake", actualDay: 5 };
  },
  getCurrentDay: function () { return 2; }
};

// Stub document for overlay creation
var _overlayElement = {
  id: '', style: { cssText: '', opacity: '0' }, innerHTML: ''
};
var document = {
  createElement: function () { return _overlayElement; },
  body: { appendChild: function () {} },
  addEventListener: function () {}
};

// ═══════════════════════════════════════════════════════════════
//  LOAD TILES (for MAILBOX constant)
// ═══════════════════════════════════════════════════════════════

var fs = require('fs');
var tilesSrc = fs.readFileSync(__dirname + '/../engine/tiles.js', 'utf8');
eval(tilesSrc);

// ═══════════════════════════════════════════════════════════════
//  LOAD MAILBOX SPRITES
// ═══════════════════════════════════════════════════════════════

var spritesSrc = fs.readFileSync(__dirname + '/../engine/mailbox-sprites.js', 'utf8');
eval(spritesSrc);

// ═══════════════════════════════════════════════════════════════
//  LOAD MAILBOX PEEK
// ═══════════════════════════════════════════════════════════════

var peekSrc = fs.readFileSync(__dirname + '/../engine/mailbox-peek.js', 'utf8');
eval(peekSrc);

// ═══════════════════════════════════════════════════════════════
//  TEST FRAMEWORK (minimal — mirrors test-dungeon-schedule.js)
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
  if (a !== b) throw new Error((msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

function resetState() {
  _toastLog = [];
  _goldAdded = 0;
  _currentFloorId = '1';
  _playerPos = { x: 32, y: 8 };
  _playerDir = 0;
  _overlayElement.innerHTML = '';
  _overlayElement.style.opacity = '0';
}

// ═══════════════════════════════════════════════════════════════
//  TESTS — TILES
// ═══════════════════════════════════════════════════════════════

describe('TILES — MAILBOX tile type', function () {
  it('MAILBOX should be 37', function () {
    assertEqual(TILES.MAILBOX, 37, 'TILES.MAILBOX');
  });

  it('MAILBOX should NOT be walkable', function () {
    assert(!TILES.isWalkable(TILES.MAILBOX), 'MAILBOX should block movement');
  });

  it('MAILBOX should be opaque', function () {
    assert(TILES.isOpaque(TILES.MAILBOX), 'MAILBOX should block LOS');
  });

  it('MAILBOX should not be a hazard', function () {
    assert(!TILES.isHazard(TILES.MAILBOX), 'MAILBOX is not a hazard');
  });

  it('MAILBOX should not be a door', function () {
    assert(!TILES.isDoor(TILES.MAILBOX), 'MAILBOX is not a door');
  });
});

// ═══════════════════════════════════════════════════════════════
//  TESTS — MAILBOX SPRITES
// ═══════════════════════════════════════════════════════════════

describe('MailboxSprites — Emoji state machine', function () {
  it('should export frozen API', function () {
    assert(typeof MailboxSprites === 'object', 'MailboxSprites exists');
    assert(typeof MailboxSprites.buildSprites === 'function', 'buildSprites exists');
    assert(typeof MailboxSprites.setPending === 'function', 'setPending exists');
    assert(typeof MailboxSprites.setReading === 'function', 'setReading exists');
  });

  it('should default to empty emoji', function () {
    MailboxSprites.clearCache();
    var grid = [];
    for (var y = 0; y < 5; y++) {
      grid[y] = [0, 0, 0, 0, 0];
    }
    grid[2][3] = 37; // MAILBOX
    var sprites = MailboxSprites.buildSprites('test1', grid, 5, 5);
    assertEqual(sprites.length, 1, 'sprite count');
    assertEqual(sprites[0].emoji, MailboxSprites.EMOJI_EMPTY, 'default emoji is empty');
  });

  it('should switch to pending emoji when setPending(true)', function () {
    MailboxSprites.setPending(true);
    var sprites = MailboxSprites.buildSprites('test1', null, 0, 0); // cached
    assertEqual(sprites[0].emoji, MailboxSprites.EMOJI_PENDING, 'pending emoji');
  });

  it('should switch to reading emoji when setReading(true)', function () {
    MailboxSprites.setReading(true);
    var sprites = MailboxSprites.buildSprites('test1', null, 0, 0);
    assertEqual(sprites[0].emoji, MailboxSprites.EMOJI_READING, 'reading emoji overrides pending');
  });

  it('should revert to pending when reading ends', function () {
    MailboxSprites.setReading(false);
    var sprites = MailboxSprites.buildSprites('test1', null, 0, 0);
    assertEqual(sprites[0].emoji, MailboxSprites.EMOJI_PENDING, 'back to pending');
  });

  it('should revert to empty when pending cleared', function () {
    MailboxSprites.setPending(false);
    var sprites = MailboxSprites.buildSprites('test1', null, 0, 0);
    assertEqual(sprites[0].emoji, MailboxSprites.EMOJI_EMPTY, 'back to empty');
  });

  it('should find MAILBOX tiles on Floor 1 grid', function () {
    MailboxSprites.clearCache();
    var fd = FloorManager.getFloorData('1');
    var sprites = MailboxSprites.buildSprites('1', fd.grid, fd.gridW, fd.gridH);
    assertEqual(sprites.length, 1, 'one mailbox on Floor 1');
    assertEqual(sprites[0].x, 33.5, 'x centered on tile 33');
    assertEqual(sprites[0].y, 8.5, 'y centered on tile 8');
    assert(sprites[0].mailbox === true, 'mailbox flag set');
  });

  it('animate should set bobOffset when pending', function () {
    MailboxSprites.setPending(true);
    MailboxSprites.animate(200);
    var sprites = MailboxSprites.buildSprites('1', null, 0, 0);
    assert(typeof sprites[0]._bobOffset === 'number', 'bobOffset is number');
  });

  it('getAnimatedY should return offset', function () {
    var result = MailboxSprites.getAnimatedY({ _bobOffset: 1.5 });
    assertEqual(result, 1.5, 'returns bobOffset');
  });

  it('getAnimatedY should return 0 for null', function () {
    assertEqual(MailboxSprites.getAnimatedY(null), 0, 'null → 0');
    assertEqual(MailboxSprites.getAnimatedY({}), 0, 'no _bobOffset → 0');
  });
});

// ═══════════════════════════════════════════════════════════════
//  TESTS — MAILBOX PEEK
// ═══════════════════════════════════════════════════════════════

describe('MailboxPeek — Init + API surface', function () {
  it('should export frozen API', function () {
    assert(typeof MailboxPeek === 'object', 'MailboxPeek exists');
    assert(typeof MailboxPeek.init === 'function', 'init');
    assert(typeof MailboxPeek.update === 'function', 'update');
    assert(typeof MailboxPeek.addReport === 'function', 'addReport');
    assert(typeof MailboxPeek.hasPending === 'function', 'hasPending');
    assert(typeof MailboxPeek.getPendingCount === 'function', 'getPendingCount');
    assert(typeof MailboxPeek.getHistory === 'function', 'getHistory');
    assert(typeof MailboxPeek.getHistoryCount === 'function', 'getHistoryCount');
    assert(typeof MailboxPeek.hasUnread === 'function', 'hasUnread (legacy)');
    assert(typeof MailboxPeek.getUnreadCount === 'function', 'getUnreadCount (legacy)');
    assert(typeof MailboxPeek.isShowing === 'function', 'isShowing');
    assert(typeof MailboxPeek.getMode === 'function', 'getMode');
  });

  it('init should reset state', function () {
    MailboxPeek.init();
    assertEqual(MailboxPeek.hasPending(), false, 'no pending after init');
    assertEqual(MailboxPeek.getPendingCount(), 0, 'pending count 0');
    assertEqual(MailboxPeek.getHistoryCount(), 0, 'history count 0');
    assertEqual(MailboxPeek.isShowing(), false, 'not showing');
    assertEqual(MailboxPeek.getMode(), null, 'no mode');
  });
});

describe('MailboxPeek — Pending reports', function () {
  it('addReport should add to pending', function () {
    resetState();
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'soft_cellar', label: 'Soft Cellar', day: 2, payout: 47 });
    assertEqual(MailboxPeek.hasPending(), true, 'has pending');
    assertEqual(MailboxPeek.getPendingCount(), 1, 'count = 1');
  });

  it('addReport should cap at 10 pending', function () {
    resetState();
    MailboxPeek.init();
    for (var i = 0; i < 15; i++) {
      MailboxPeek.addReport({ groupId: 'g' + i, label: 'G' + i, day: i, payout: i * 10 });
    }
    assertEqual(MailboxPeek.getPendingCount(), 10, 'capped at 10');
  });

  it('addReport should set MailboxSprites pending', function () {
    resetState();
    MailboxSprites.setPending(false);
    MailboxSprites.clearCache();
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'test', label: 'Test', day: 1, payout: 10 });
    // MailboxSprites.setPending(true) was called internally
    // Verify by building sprites and checking emoji
    var fd = FloorManager.getFloorData('1');
    var sprites = MailboxSprites.buildSprites('sprite_test', fd.grid, fd.gridW, fd.gridH);
    assertEqual(sprites[0].emoji, MailboxSprites.EMOJI_PENDING, 'sprites show pending');
  });

  it('hasUnread should mirror hasPending (legacy compat)', function () {
    assertEqual(MailboxPeek.hasUnread(), MailboxPeek.hasPending(), 'legacy alias');
    assertEqual(MailboxPeek.getUnreadCount(), MailboxPeek.getPendingCount(), 'legacy count alias');
  });

  it('addReport with null should be no-op', function () {
    resetState();
    MailboxPeek.init();
    var before = MailboxPeek.getPendingCount();
    MailboxPeek.addReport(null);
    assertEqual(MailboxPeek.getPendingCount(), before, 'count unchanged');
  });

  it('addReport should fire toast when player is on exterior floor', function () {
    resetState();
    _currentFloorId = '1';
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'test', label: 'Test', day: 1, payout: 10 });
    assert(_toastLog.length > 0, 'toast fired');
    assert(_toastLog[0].msg.indexOf('report') !== -1 || _toastLog[0].msg.indexOf('mail') !== -1,
      'toast mentions report/mail');
  });

  it('addReport should NOT fire toast when player is underground', function () {
    resetState();
    _currentFloorId = '1.3.1';
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'test', label: 'Test', day: 1, payout: 10 });
    assertEqual(_toastLog.length, 0, 'no toast underground');
  });
});

describe('MailboxPeek — Dwell detection (exterior)', function () {
  it('should not show overlay before dwell threshold', function () {
    resetState();
    _currentFloorId = '1';
    _playerPos = { x: 32, y: 8 };
    _playerDir = 0; // EAST → faces (33, 8) which is MAILBOX
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'test', label: 'Test', day: 2, payout: 50 });

    MailboxPeek.update(100); // 100ms — below 300ms threshold
    assertEqual(MailboxPeek.isShowing(), false, 'not showing at 100ms');
  });

  it('should show overlay after dwell threshold', function () {
    MailboxPeek.update(250); // cumulative 350ms > 300ms threshold
    assertEqual(MailboxPeek.isShowing(), true, 'showing after 350ms');
    assertEqual(MailboxPeek.getMode(), 'exterior', 'mode is exterior');
  });

  it('should hide after looking away + debounce', function () {
    _playerDir = 3; // NORTH — no longer facing mailbox
    MailboxPeek.update(50);  // 50ms into debounce
    assertEqual(MailboxPeek.isShowing(), true, 'still showing during debounce');
    MailboxPeek.update(200); // 250ms total > 200ms debounce
    assertEqual(MailboxPeek.isShowing(), false, 'hidden after debounce');
  });
});

describe('MailboxPeek — Dwell detection (history)', function () {
  it('should detect history position on Floor 1.6', function () {
    resetState();
    _currentFloorId = '1.6';
    _playerPos = { x: 18, y: 6 };
    _playerDir = 0; // EAST → faces (19, 6) which is history pos
    MailboxPeek.init();

    // Add a report and collect it (to populate history)
    // We need to manually push to collected for this test since
    // collection requires the exterior flow. Test the API shape instead.
    assertEqual(MailboxPeek.getHistoryCount(), 0, 'no history initially');
  });

  it('should show history overlay after 400ms dwell', function () {
    MailboxPeek.update(200);
    assertEqual(MailboxPeek.isShowing(), false, 'not showing at 200ms');
    MailboxPeek.update(250); // 450ms total > 400ms history threshold
    assertEqual(MailboxPeek.isShowing(), true, 'showing after 450ms');
    assertEqual(MailboxPeek.getMode(), 'history', 'mode is history');
  });
});

describe('MailboxPeek — Floor gating', function () {
  it('should not activate on dungeon floors', function () {
    resetState();
    _currentFloorId = '1.3.1';
    _playerPos = { x: 32, y: 8 };
    _playerDir = 0;
    MailboxPeek.init();
    MailboxPeek.update(500);
    assertEqual(MailboxPeek.isShowing(), false, 'no overlay on dungeon floor');
  });

  it('should not activate on Floor 2', function () {
    _currentFloorId = '2';
    MailboxPeek.update(500);
    assertEqual(MailboxPeek.isShowing(), false, 'no overlay on Floor 2');
  });

  it('should hide when floor changes while showing', function () {
    resetState();
    _currentFloorId = '1';
    _playerPos = { x: 32, y: 8 };
    _playerDir = 0;
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'test', label: 'Test', day: 2, payout: 50 });
    MailboxPeek.update(400); // show
    assertEqual(MailboxPeek.isShowing(), true, 'showing on Floor 1');

    _currentFloorId = '1.3.1'; // warp to dungeon
    MailboxPeek.update(16);
    assertEqual(MailboxPeek.isShowing(), false, 'hidden after floor change');
  });
});

describe('MailboxPeek — Collection flow', function () {
  it('handleInteract should collect all pending and move to history', function () {
    resetState();
    _currentFloorId = '1';
    _playerPos = { x: 32, y: 8 };
    _playerDir = 0;
    MailboxPeek.init();

    // Add 3 reports
    MailboxPeek.addReport({ groupId: 'a', label: 'A', day: 2, payout: 30 });
    MailboxPeek.addReport({ groupId: 'b', label: 'B', day: 5, payout: 40 });
    MailboxPeek.addReport({ groupId: 'c', label: 'C', day: 8, payout: 50 });
    assertEqual(MailboxPeek.getPendingCount(), 3, '3 pending');

    // Dwell to show overlay
    MailboxPeek.update(400);
    assertEqual(MailboxPeek.isShowing(), true, 'overlay visible');

    // Collect
    _toastLog = [];
    _goldAdded = 0;
    MailboxPeek.handleInteract();

    assertEqual(MailboxPeek.getPendingCount(), 0, 'pending cleared');
    assertEqual(MailboxPeek.getHistoryCount(), 3, 'all 3 in history');
    assertEqual(MailboxPeek.isShowing(), false, 'overlay hidden after collect');
    assertEqual(_goldAdded, 120, 'gold added (30+40+50)');
  });

  it('history should be newest-first', function () {
    var history = MailboxPeek.getHistory();
    assertEqual(history[0].groupId, 'c', 'newest first (C)');
    assertEqual(history[1].groupId, 'b', 'then B');
    assertEqual(history[2].groupId, 'a', 'oldest last (A)');
  });

  it('getHistory should return a copy (not internal ref)', function () {
    var h1 = MailboxPeek.getHistory();
    var h2 = MailboxPeek.getHistory();
    assert(h1 !== h2, 'different array references');
    assertEqual(h1.length, h2.length, 'same content');
  });

  it('history should cap at 20', function () {
    resetState();
    MailboxPeek.init();
    // Add + collect 25 reports in batches
    for (var batch = 0; batch < 5; batch++) {
      for (var i = 0; i < 5; i++) {
        var idx = batch * 5 + i;
        MailboxPeek.addReport({ groupId: 'g' + idx, label: 'G' + idx, day: idx, payout: 10 });
      }
      _currentFloorId = '1';
      _playerPos = { x: 32, y: 8 };
      _playerDir = 0;
      MailboxPeek.update(400); // show
      MailboxPeek.handleInteract(); // collect
    }
    assert(MailboxPeek.getHistoryCount() <= 20, 'history capped at 20, got ' + MailboxPeek.getHistoryCount());
  });

  it('handleInteract should be no-op when not in exterior mode', function () {
    resetState();
    MailboxPeek.init();
    MailboxPeek.addReport({ groupId: 'x', label: 'X', day: 1, payout: 99 });
    // Don't open overlay — just call handleInteract directly
    var before = MailboxPeek.getPendingCount();
    MailboxPeek.handleInteract();
    assertEqual(MailboxPeek.getPendingCount(), before, 'no collection without overlay');
  });

  it('onCollect callback should fire with total', function () {
    resetState();
    _currentFloorId = '1';
    _playerPos = { x: 32, y: 8 };
    _playerDir = 0;
    MailboxPeek.init();

    var callbackTotal = -1;
    MailboxPeek.setOnCollect(function (total) { callbackTotal = total; });
    MailboxPeek.addReport({ groupId: 'a', label: 'A', day: 1, payout: 77 });
    MailboxPeek.update(400);
    MailboxPeek.handleInteract();
    assertEqual(callbackTotal, 77, 'callback received total');
  });
});

// ═══════════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
if (_failed === 0) {
  console.log('\x1b[32m  ALL ' + _passed + ' TESTS PASSED\x1b[0m');
} else {
  console.log('\x1b[31m  ' + _failed + ' FAILED\x1b[0m, ' + _passed + ' passed');
}
console.log('═══════════════════════════════════════\n');

process.exit(_failed > 0 ? 1 : 0);

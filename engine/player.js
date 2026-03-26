/**
 * Player — owns the player entity state and direction helpers.
 *
 * Single source of truth for player position, facing, stats, and
 * look offset. Other modules read/write through the public API
 * rather than holding their own copies.
 *
 * Direction convention (matches MovementController):
 *   Index 0 = EAST,  angle 0
 *   Index 1 = SOUTH, angle π/2
 *   Index 2 = WEST,  angle π
 *   Index 3 = NORTH, angle -π/2
 */
var Player = (function () {
  'use strict';

  var MC = MovementController;

  // ── State ──────────────────────────────────────────────────────────

  var _state = {
    x: 5, y: 5,
    dir: MC.DIR_NORTH,
    lookOffset: 0,              // Mouse free-look offset (radians)
    hp: 10, maxHp: 10,
    energy: 5, maxEnergy: 5,
    str: 2, dex: 2, stealth: 1,
    currency: 0,
    lastMoveDirection: 'north'
  };

  // Direction name table (indexed by direction constant)
  var DIR_NAMES = ['east', 'south', 'west', 'north'];

  // Free-look limits
  var FREE_LOOK_RANGE = Math.PI / 4; // ±45 degrees

  // ── Accessors ──────────────────────────────────────────────────────

  /** Get raw state object (for passing to systems that need it). */
  function state() { return _state; }

  function getPos()  { return { x: _state.x, y: _state.y }; }
  function getDir()  { return _state.dir; }
  function getDirName() { return DIR_NAMES[_state.dir] || 'north'; }

  function setPos(x, y) {
    _state.x = x;
    _state.y = y;
  }

  function setDir(dir) {
    _state.dir = dir;
    _state.lastMoveDirection = DIR_NAMES[dir] || 'north';
  }

  function setLookOffset(offset) {
    _state.lookOffset = Math.max(-FREE_LOOK_RANGE, Math.min(FREE_LOOK_RANGE, offset));
  }

  function resetLookOffset() { _state.lookOffset = 0; }

  // ── Direction conversion ───────────────────────────────────────────
  // DoorContracts returns radians (atan2). We need direction indices.
  //
  // Radian convention: EAST=0, SOUTH=π/2, WEST=π, NORTH=-π/2 (3π/2)
  // MC indices:        EAST=0, SOUTH=1,   WEST=2, NORTH=3

  function radianToDir(angle) {
    var a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    var cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    var dirs = [MC.DIR_EAST, MC.DIR_SOUTH, MC.DIR_WEST, MC.DIR_NORTH];
    var best = 0;
    var bestDist = 999;
    for (var i = 0; i < 4; i++) {
      var diff = Math.abs(a - cardinals[i]);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDist) { bestDist = diff; best = i; }
    }
    return dirs[best];
  }

  // ── Stats ──────────────────────────────────────────────────────────

  function heal(amount) {
    _state.hp = Math.min(_state.maxHp, _state.hp + amount);
  }

  function damage(amount) {
    _state.hp = Math.max(0, _state.hp - amount);
  }

  function spendEnergy(amount) {
    if (_state.energy < amount) return false;
    _state.energy -= amount;
    return true;
  }

  function restoreEnergy(amount) {
    _state.energy = Math.min(_state.maxEnergy, _state.energy + amount);
  }

  function addCurrency(amount) {
    _state.currency += amount;
  }

  function isAlive() { return _state.hp > 0; }

  // ── Reset ──────────────────────────────────────────────────────────

  function reset() {
    _state.hp = _state.maxHp;
    _state.energy = _state.maxEnergy;
    _state.currency = 0;
    _state.lookOffset = 0;
    _state.lastMoveDirection = 'north';
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    state: state,
    getPos: getPos,
    getDir: getDir,
    getDirName: getDirName,
    setPos: setPos,
    setDir: setDir,
    setLookOffset: setLookOffset,
    resetLookOffset: resetLookOffset,
    radianToDir: radianToDir,
    heal: heal,
    damage: damage,
    spendEnergy: spendEnergy,
    restoreEnergy: restoreEnergy,
    addCurrency: addCurrency,
    isAlive: isAlive,
    reset: reset,
    DIR_NAMES: DIR_NAMES,
    FREE_LOOK_RANGE: FREE_LOOK_RANGE
  };
})();

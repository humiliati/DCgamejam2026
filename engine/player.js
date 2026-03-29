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

  // ── Container limits ──────────────────────────────────────────────
  var MAX_HAND    = 5;
  var MAX_BAG     = 12;
  var MAX_STASH   = 20;
  var EQUIP_SLOTS = 3;  // 0=weapon, 1=consumable, 2=key

  var _state = {
    x: 5, y: 5,
    dir: MC.DIR_NORTH,
    lookOffset: 0,              // Mouse free-look offset (radians)
    hp: 10, maxHp: 10,
    energy: 5, maxEnergy: 5,
    battery: 3, maxBattery: 10,  // ◈ Battery — powers card abilities (RPS trinity)
    str: 2, dex: 2, stealth: 1,
    currency: 0,
    lastMoveDirection: 'north',

    // ── Inventory containers (HUD_ROADMAP §Inventory Data Model) ──
    hand:     [],                            // CardRef[] — max 5
    bag:      [],                            // ItemRef[] — max 12
    stash:    [],                            // ItemRef[] — max 20
    equipped: [null, null, null],            // [weapon, consumable, key]
    flags:    {}                             // Quest/dialogue flags
  };

  // Direction name table (indexed by direction constant)
  var DIR_NAMES = ['east', 'south', 'west', 'north'];

  // Free-look limits
  // ±32° (~64° total free FOV) — prevents diagonal-walk illusion
  // Reduced from ±45° which gave too much peripheral range for a
  // grid-locked dungeon crawler where diagonal movement isn't allowed.
  var FREE_LOOK_RANGE = 32 * Math.PI / 180; // ±32 degrees (~0.559 rad)

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

  /**
   * Deduct currency from the player. Returns false if insufficient funds.
   * @param {number} amount
   * @returns {boolean}
   */
  function spendCurrency(amount) {
    if (_state.currency < amount) return false;
    _state.currency -= amount;
    return true;
  }

  function isAlive() { return _state.hp > 0; }

  function addBattery(amount) {
    _state.battery = Math.min(_state.maxBattery, _state.battery + (amount || 1));
  }

  function spendBattery(amount) {
    if (_state.battery < amount) return false;
    _state.battery -= amount;
    return true;
  }

  // ── HOT (Heal-Over-Time) — from health-system.js §HOT ─────────────
  // Food items with HOT effect call applyHOT(amount, ticks).
  // Each player move ticks down; restores 1 HP per tick until exhausted.

  var _hotAmount = 0;  // HP per tick
  var _hotTicks  = 0;  // Ticks remaining

  function applyHOT(amount, ticks) {
    // Stack with existing HOT (take whichever is larger)
    _hotAmount = Math.max(_hotAmount, amount || 1);
    _hotTicks  = Math.max(_hotTicks, ticks || 3);
  }

  function tickHOT() {
    if (_hotTicks <= 0) return 0;
    var restored = Math.min(_hotAmount, _state.maxHp - _state.hp);
    _state.hp = Math.min(_state.maxHp, _state.hp + _hotAmount);
    _hotTicks--;
    if (_hotTicks === 0) _hotAmount = 0;
    return restored;
  }

  // ── Inventory: Hand (cards) ────────────────────────────────────────
  // CANONICAL HAND lives in CardSystem._hand.
  // Player proxies to CardSystem so NchWidget / HUD have one source of truth
  // (matches EyesOnly CardStateAuthority → GAMESTATE pattern).

  function getHand() {
    if (typeof CardSystem !== 'undefined' && CardSystem.getHand) {
      return CardSystem.getHand();
    }
    return _state.hand; // fallback if CardSystem not loaded yet
  }

  function addToHand(card) {
    if (typeof CardSystem !== 'undefined' && CardSystem.addCard) {
      return CardSystem.addCard(card);
    }
    if (_state.hand.length >= MAX_HAND) return false;
    _state.hand.push(card);
    return true;
  }

  function removeFromHand(index) {
    if (typeof CardSystem !== 'undefined' && CardSystem.playFromHand) {
      return CardSystem.playFromHand(index);
    }
    if (index < 0 || index >= _state.hand.length) return null;
    return _state.hand.splice(index, 1)[0];
  }

  // ── Inventory: Bag ─────────────────────────────────────────────────

  function getBag()   { return _state.bag; }

  function addToBag(item) {
    if (_state.bag.length >= MAX_BAG) return false;
    _state.bag.push(item);
    return true;
  }

  function removeFromBag(id) {
    for (var i = 0; i < _state.bag.length; i++) {
      if (_state.bag[i].id === id) {
        return _state.bag.splice(i, 1)[0];
      }
    }
    return null;
  }

  // ── Inventory: Stash (survives death) ──────────────────────────────

  function getStash()  { return _state.stash; }

  function addToStash(item) {
    if (_state.stash.length >= MAX_STASH) return false;
    _state.stash.push(item);
    return true;
  }

  function removeFromStash(id) {
    for (var i = 0; i < _state.stash.length; i++) {
      if (_state.stash[i].id === id) {
        return _state.stash.splice(i, 1)[0];
      }
    }
    return null;
  }

  // ── Inventory: Equipped (3 quick-slots) ────────────────────────────

  function getEquipped() { return _state.equipped; }

  /**
   * Move an item from bag to an equipped slot.
   * Returns the previously equipped item (or null).
   */
  function equip(bagIndex, slot) {
    if (slot < 0 || slot >= EQUIP_SLOTS) return null;
    if (bagIndex < 0 || bagIndex >= _state.bag.length) return null;

    var item = _state.bag.splice(bagIndex, 1)[0];
    var prev = _state.equipped[slot];
    _state.equipped[slot] = item;

    // If there was something in the slot, put it back in bag
    if (prev) {
      _state.bag.push(prev);
    }
    return prev;
  }

  /**
   * Move an equipped item back to bag.
   * Returns false if bag is full.
   */
  function unequip(slot) {
    if (slot < 0 || slot >= EQUIP_SLOTS) return false;
    var item = _state.equipped[slot];
    if (!item) return false;
    if (_state.bag.length >= MAX_BAG) return false;

    _state.equipped[slot] = null;
    _state.bag.push(item);
    return true;
  }

  /**
   * Use an equipped item (consumable). Applies effects, removes if consumed.
   * Returns the item used, or null if slot is empty.
   */
  function useItem(slot) {
    if (slot < 0 || slot >= EQUIP_SLOTS) return null;
    var item = _state.equipped[slot];
    if (!item) return null;

    // Apply effects
    if (item.effects) {
      for (var i = 0; i < item.effects.length; i++) {
        var fx = item.effects[i];
        if (fx.type === 'hp')     heal(fx.value);
        if (fx.type === 'energy') restoreEnergy(fx.value);
        if (fx.type === 'damage') damage(fx.value); // self-damage (poison etc.)
      }
    }

    // Consumables are removed after use; equipment stays
    if (item.type === 'consumable') {
      _state.equipped[slot] = null;
    }

    return item;
  }

  /**
   * Check if the player has an item (any container).
   */
  function hasItem(id) {
    for (var i = 0; i < _state.hand.length; i++) {
      if (_state.hand[i].id === id) return true;
    }
    for (var j = 0; j < _state.bag.length; j++) {
      if (_state.bag[j].id === id) return true;
    }
    for (var k = 0; k < EQUIP_SLOTS; k++) {
      if (_state.equipped[k] && _state.equipped[k].id === id) return true;
    }
    return false;
  }

  /**
   * Check if the player has any item matching a type (any container).
   * @param {string} type - Item type to match (e.g. 'key')
   * @returns {Object|null} First matching item, or null
   */
  function hasItemType(type) {
    for (var j = 0; j < _state.bag.length; j++) {
      if (_state.bag[j] && _state.bag[j].type === type) return _state.bag[j];
    }
    for (var k = 0; k < EQUIP_SLOTS; k++) {
      if (_state.equipped[k] && _state.equipped[k].type === type) return _state.equipped[k];
    }
    return null;
  }

  /**
   * Consume (remove) an item by ID from bag or equipped slots.
   * Used for key items that are spent on use (e.g., boss door key).
   * @param {string} id - Item ID to consume
   * @returns {Object|null} The consumed item, or null if not found
   */
  function consumeItem(id) {
    // Check bag first
    for (var j = 0; j < _state.bag.length; j++) {
      if (_state.bag[j] && _state.bag[j].id === id) {
        return _state.bag.splice(j, 1)[0];
      }
    }
    // Check equipped slots
    for (var k = 0; k < EQUIP_SLOTS; k++) {
      if (_state.equipped[k] && _state.equipped[k].id === id) {
        var item = _state.equipped[k];
        _state.equipped[k] = null;
        return item;
      }
    }
    return null;
  }

  // ── Flags (quest/dialogue state) ───────────────────────────────────

  function setFlag(key, value) { _state.flags[key] = value; }
  function getFlag(key) { return _state.flags[key]; }
  function hasFlag(key) { return !!_state.flags[key]; }

  // ── Death handler ────────────────────────────────────────────────

  /**
   * Handle player death — prepare inventory for scatter.
   *
   * Returns an object describing what was lost so the caller
   * (CombatBridge → FloorManager) can place loot tiles.
   * Applies 50% currency penalty.
   *
   * When the full inventory system is built (HUD_ROADMAP.md), this
   * will clear hand/bag/equipped and return them as dropped items.
   * For now it's a stub that handles currency.
   */
  function onDeath() {
    var dropped = {
      currency: 0,
      cards: [],
      items: []
    };

    // 50% currency penalty
    var penalty = Math.floor(_state.currency * 0.5);
    dropped.currency = penalty;
    _state.currency -= penalty;

    // Scatter hand cards (canonical hand is in CardSystem)
    var hand = getHand();
    for (var c = 0; c < hand.length; c++) {
      dropped.cards.push(hand[c]);
    }
    _state.hand = [];
    // Clear CardSystem hand too (resetDeck will rebuild on respawn)
    if (typeof CardSystem !== 'undefined' && CardSystem.resetDeck) {
      CardSystem.resetDeck();
    }

    // Scatter bag items
    for (var b = 0; b < _state.bag.length; b++) {
      dropped.items.push(_state.bag[b]);
    }
    _state.bag = [];

    // Scatter equipped items
    for (var e = 0; e < EQUIP_SLOTS; e++) {
      if (_state.equipped[e]) {
        dropped.items.push(_state.equipped[e]);
        _state.equipped[e] = null;
      }
    }

    // Stash survives death — untouched

    return dropped;
  }

  /**
   * Restore player to full HP/energy (used after non-lethal defeat).
   */
  function fullRestore() {
    _state.hp = _state.maxHp;
    _state.energy = _state.maxEnergy;
  }

  // ── Reset ──────────────────────────────────────────────────────────

  function reset() {
    _state.hp = _state.maxHp;
    _state.energy = _state.maxEnergy;
    _state.currency = 0;
    _state.lookOffset = 0;
    _state.lastMoveDirection = 'north';
    _state.hand = [];
    _state.bag = [];
    _state.stash = [];
    _state.equipped = [null, null, null];
    _state.flags = {};
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
    spendCurrency: spendCurrency,
    addBattery: addBattery,
    spendBattery: spendBattery,
    isAlive: isAlive,
    applyHOT: applyHOT,
    tickHOT: tickHOT,

    // Inventory: hand (cards)
    getHand: getHand,
    addToHand: addToHand,
    removeFromHand: removeFromHand,

    // Inventory: bag
    getBag: getBag,
    addToBag: addToBag,
    removeFromBag: removeFromBag,

    // Inventory: stash (survives death)
    getStash: getStash,
    addToStash: addToStash,
    removeFromStash: removeFromStash,

    // Inventory: equipped (quick-slots)
    getEquipped: getEquipped,
    equip: equip,
    unequip: unequip,
    useItem: useItem,
    hasItem: hasItem,
    hasItemType: hasItemType,
    consumeItem: consumeItem,

    // Flags
    setFlag: setFlag,
    getFlag: getFlag,
    hasFlag: hasFlag,

    // Lifecycle
    onDeath: onDeath,
    fullRestore: fullRestore,
    reset: reset,

    // Constants
    DIR_NAMES: DIR_NAMES,
    FREE_LOOK_RANGE: FREE_LOOK_RANGE,
    MAX_HAND: MAX_HAND,
    MAX_BAG: MAX_BAG,
    MAX_STASH: MAX_STASH,
    EQUIP_SLOTS: EQUIP_SLOTS
  };
})();

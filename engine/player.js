/**
 * Player — owns the player entity state and direction helpers.
 *
 * S0.5: All inventory proxy stubs removed. Inventory state lives in
 * CardAuthority. Player retains position, facing, stats, debuffs, flags,
 * and compound item utilities (useItem, hasItem, consumeItem) that apply
 * game logic across CardAuthority containers.
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

  // ── Debuffs ────────────────────────────────────────────────────────
  var DEBUFFS = {
    GROGGY:     { emoji: '☁', label: 'Groggy',     walkTimeMult: 1.25 },
    SORE:       { emoji: '🩹', label: 'Sore',       cleanEfficiency: -1 },
    HUMILIATED: { emoji: '😳', label: 'Humiliated', narrative: true },
    SHAKEN:     { emoji: '💀', label: 'Shaken',     maxHpMult: 0.80 }
  };

  // ── Container limits (read from CardAuthority, kept as local alias) ──
  var EQUIP_SLOTS = 3;  // 0=active/weapon, 1=passive/consumable, 2=key

  // ── State (NO INVENTORY — lives in CardAuthority now) ──────────────

  var _state = {
    x: 5, y: 5,
    dir: MC.DIR_NORTH,
    lookOffset: 0,
    lookPitch:  0,
    hp: 10, maxHp: 10,
    energy: 5, maxEnergy: 5,
    battery: 3, maxBattery: 10,
    str: 2, dex: 2, stealth: 1,
    lastMoveDirection: 'north',
    flags:    {},
    debuffs:  []
  };

  var DIR_NAMES = ['east', 'south', 'west', 'north'];
  var FREE_LOOK_RANGE = 32 * Math.PI / 180;
  // Vertical pitch range: more down (floor inspection) than up
  var PITCH_DOWN_MAX = 0.55;   // fraction of halfH to shift horizon down (floor inspection)
  var PITCH_UP_MAX   = 0.35;   // fraction of halfH to shift horizon up (ceiling/architecture)

  // ── Accessors ──────────────────────────────────────────────────────

  /**
   * Get state object. Inventory fields are synced from CardAuthority
   * on each call so HUD/display code gets correct values.
   *
   * NOTE: Direct mutations to inventory fields on the returned object
   * will NOT persist — use CardAuthority methods instead.
   */
  function state() {
    if (typeof CardAuthority !== 'undefined') {
      _state.currency = CardAuthority.getGold();
      _state.hand     = CardAuthority.getHand();
      _state.bag      = CardAuthority.getBag();
      _state.stash    = CardAuthority.getStash();
      _state.equipped = CardAuthority.getEquipped();
    }
    return _state;
  }

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

  /**
   * Set vertical pitch offset.
   * @param {number} pitch - Negative = look down, positive = look up.
   *   Clamped to [-PITCH_DOWN_MAX, +PITCH_UP_MAX].
   */
  function setLookPitch(pitch) {
    _state.lookPitch = Math.max(-PITCH_DOWN_MAX, Math.min(PITCH_UP_MAX, pitch));
  }

  function resetLookOffset() { _state.lookOffset = 0; _state.lookPitch = 0; }

  // ── Direction conversion ───────────────────────────────────────────

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
    if (!amount || amount <= 0) return;
    _state.hp = Math.max(0, _state.hp - amount);
    // PW-2: HP loss snaps the hose (spec §2.3 — combat damage cancels).
    // The hose fantasy assumes the player is tiptoeing through carnage; a
    // hero/hazard landing a hit jerks the line off the reel.
    if (typeof HoseState !== 'undefined' && HoseState.isActive && HoseState.isActive()) {
      HoseState.onCombatDamage();
    }
  }

  function spendEnergy(amount) {
    if (_state.energy < amount) return false;
    _state.energy -= amount;
    return true;
  }

  function restoreEnergy(amount) {
    _state.energy = Math.min(_state.maxEnergy, _state.energy + amount);
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

  // ── HOT (Heal-Over-Time) ──────────────────────────────────────────

  var _hotAmount = 0;
  var _hotTicks  = 0;

  function applyHOT(amount, ticks) {
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

  // ── Item utility methods (read from CardAuthority) ──────────────────
  //
  // These are game logic that searches across containers. They read from
  // CardAuthority but provide compound behavior that doesn't belong in CA.

  /**
   * Use an equipped item (consumable). Applies effects, removes if consumed.
   */
  function useItem(slot) {
    if (slot < 0 || slot >= EQUIP_SLOTS) return null;
    var item = CardAuthority.getEquipSlot(slot);
    if (!item) return null;

    // Apply effects
    if (item.effects) {
      for (var i = 0; i < item.effects.length; i++) {
        var fx = item.effects[i];
        if (fx.type === 'hp')     heal(fx.value);
        if (fx.type === 'energy') restoreEnergy(fx.value);
        if (fx.type === 'damage') damage(fx.value);
      }
    }

    // Consumables are removed after use; equipment stays
    if (item.type === 'consumable') {
      CardAuthority.unequip(slot);
    }

    return item;
  }

  /**
   * Check if the player has an item (any container).
   */
  function hasItem(id) {
    var hand = CardAuthority.getHand();
    for (var i = 0; i < hand.length; i++) {
      if (hand[i].id === id) return true;
    }
    var bag = CardAuthority.getBag();
    for (var j = 0; j < bag.length; j++) {
      if (bag[j].id === id) return true;
    }
    for (var k = 0; k < EQUIP_SLOTS; k++) {
      var eq = CardAuthority.getEquipSlot(k);
      if (eq && eq.id === id) return true;
    }
    return false;
  }

  /**
   * Check if the player has any item matching a type (bag + equipped).
   */
  function hasItemType(type) {
    var bag = CardAuthority.getBag();
    for (var j = 0; j < bag.length; j++) {
      if (bag[j] && bag[j].type === type) return bag[j];
    }
    for (var k = 0; k < EQUIP_SLOTS; k++) {
      var eq = CardAuthority.getEquipSlot(k);
      if (eq && eq.type === type) return eq;
    }
    return null;
  }

  /**
   * Consume (remove) an item by ID from bag or equipped slots.
   */
  function consumeItem(id) {
    // Check bag first
    var bag = CardAuthority.getBag();
    for (var j = 0; j < bag.length; j++) {
      if (bag[j] && bag[j].id === id) {
        return CardAuthority.removeFromBag(j);
      }
    }
    // Check equipped slots
    for (var k = 0; k < EQUIP_SLOTS; k++) {
      var eq = CardAuthority.getEquipSlot(k);
      if (eq && eq.id === id) {
        return CardAuthority.unequip(k);
      }
    }
    return null;
  }

  // ── Flags (quest/dialogue state) ───────────────────────────────────

  function setFlag(key, value) { _state.flags[key] = value; }
  function getFlag(key) { return _state.flags[key]; }
  function hasFlag(key) { return !!_state.flags[key]; }

  // ── Debuffs ────────────────────────────────────────────────────────

  function applyDebuff(id, days) {
    if (!DEBUFFS[id]) return false;

    var existing = null;
    for (var i = 0; i < _state.debuffs.length; i++) {
      if (_state.debuffs[i].id === id) {
        existing = _state.debuffs[i];
        break;
      }
    }

    if (existing) {
      existing.daysRemaining = Math.max(existing.daysRemaining, days);
    } else {
      _state.debuffs.push({ id: id, daysRemaining: days });
      var def = DEBUFFS[id];
      if (def.maxHpMult) {
        _state.maxHp = Math.ceil(_state.maxHp * def.maxHpMult);
        if (_state.hp > _state.maxHp) {
          _state.hp = _state.maxHp;
        }
      }
    }

    return true;
  }

  function removeDebuff(id) {
    for (var i = 0; i < _state.debuffs.length; i++) {
      if (_state.debuffs[i].id === id) {
        var debuff = _state.debuffs.splice(i, 1)[0];
        var def = DEBUFFS[id];
        if (def.maxHpMult) {
          _state.maxHp = Math.ceil(_state.maxHp / def.maxHpMult);
        }
        return debuff;
      }
    }
    return null;
  }

  function hasDebuff(id) {
    for (var i = 0; i < _state.debuffs.length; i++) {
      if (_state.debuffs[i].id === id) return true;
    }
    return false;
  }

  function getDebuffs() { return _state.debuffs; }

  function tickDebuffs() {
    var expired = [];
    for (var i = _state.debuffs.length - 1; i >= 0; i--) {
      _state.debuffs[i].daysRemaining--;
      if (_state.debuffs[i].daysRemaining <= 0) {
        var id = _state.debuffs[i].id;
        removeDebuff(id);
        expired.push(id);
      }
    }
    return expired;
  }

  function getWalkTimeMultiplier() {
    if (typeof StatusEffect !== 'undefined') {
      return StatusEffect.getWalkTimeMultiplier();
    }
    var mult = 1.0;
    for (var i = 0; i < _state.debuffs.length; i++) {
      var def = DEBUFFS[_state.debuffs[i].id];
      if (def && def.walkTimeMult) {
        mult *= def.walkTimeMult;
      }
    }
    return mult;
  }

  function getCleanEfficiencyMod() {
    if (typeof StatusEffect !== 'undefined') {
      return StatusEffect.getCleanEfficiencyMod();
    }
    var mod = 0;
    for (var i = 0; i < _state.debuffs.length; i++) {
      var def = DEBUFFS[_state.debuffs[i].id];
      if (def && def.cleanEfficiency) {
        mod += def.cleanEfficiency;
      }
    }
    return mod;
  }

  // ── Death handler ──────────────────────────────────────────────────

  /**
   * Handle player death — delegates to CardAuthority.failstateWipe()
   * which handles the 50% gold penalty, scatters hand/bag/equipped,
   * preserves stash and Joker Vault cards.
   *
   * Returns { currency, cards, items } for scatter placement.
   */
  function onDeath() {
    var caDropped = CardAuthority.failstateWipe();

    // Remap to legacy return format (callers expect 'currency' not 'gold')
    return {
      currency: caDropped.gold || 0,
      cards:    caDropped.cards || [],
      items:    caDropped.items || []
    };
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
    _state.lookOffset = 0;
    _state.lookPitch = 0;
    _state.lastMoveDirection = 'north';
    _state.flags = {};
    _state.debuffs = [];

    // Reset inventory in CardAuthority
    if (typeof CardAuthority !== 'undefined') {
      CardAuthority.reset();
    }
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
    setLookPitch: setLookPitch,
    resetLookOffset: resetLookOffset,
    radianToDir: radianToDir,
    heal: heal,
    damage: damage,
    spendEnergy: spendEnergy,
    restoreEnergy: restoreEnergy,
    isAlive: isAlive,
    addBattery: addBattery,
    spendBattery: spendBattery,
    applyHOT: applyHOT,
    tickHOT: tickHOT,

    // ── Item utilities (read from CardAuthority) ──
    useItem:        useItem,
    hasItem:        hasItem,
    hasItemType:    hasItemType,
    consumeItem:    consumeItem,

    // Flags
    setFlag: setFlag,
    getFlag: getFlag,
    hasFlag: hasFlag,

    // Debuffs
    applyDebuff:          applyDebuff,
    removeDebuff:         removeDebuff,
    hasDebuff:            hasDebuff,
    getDebuffs:           getDebuffs,
    tickDebuffs:          tickDebuffs,
    getWalkTimeMultiplier: getWalkTimeMultiplier,
    getCleanEfficiencyMod: getCleanEfficiencyMod,
    DEBUFFS: DEBUFFS,

    // Lifecycle
    onDeath:     onDeath,
    fullRestore: fullRestore,
    reset:       reset,

    // Constants
    DIR_NAMES:       DIR_NAMES,
    FREE_LOOK_RANGE: FREE_LOOK_RANGE,
    PITCH_DOWN_MAX:  PITCH_DOWN_MAX,
    PITCH_UP_MAX:    PITCH_UP_MAX,
    EQUIP_SLOTS:     EQUIP_SLOTS
  };
})();

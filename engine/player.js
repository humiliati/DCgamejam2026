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
    debuffs:  [],
    // ── Fatigue (mirrors EyesOnly GAMESTATE fatigue subsystem) ──
    // 0 = fresh, 100 = exhausted. Inverse resource: higher = worse.
    playerFatigue: 0,
    maxFatigue: 100,
    _fatigueDecimal: 0.0,     // Sub-integer accumulator for smooth drain/recovery
    fatigueThreshold: 70      // Above this: future card cost increases
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

  // ── Screen shake ──────────────────────────────────────────────────
  // Sinusoidal decay on combat hit. Amplitude decays linearly over
  // duration; oscillation via sin(). Applied as horizontal camera offset.
  var _shakeAmplitude = 0;   // current max displacement (radians)
  var _shakeTimer     = 0;   // remaining ms
  var _shakeDuration  = 0;   // total ms (for decay ratio)
  var SHAKE_FREQ      = 25;  // oscillation Hz — fast judder, not slow sway

  /**
   * Trigger a screen shake.
   * @param {number} [amplitude=0.03] — peak horizontal offset (radians, ~1.7°)
   * @param {number} [durationMs=300] — total shake duration
   */
  function triggerShake(amplitude, durationMs) {
    _shakeAmplitude = amplitude || 0.03;
    _shakeDuration  = durationMs || 300;
    _shakeTimer     = _shakeDuration;
  }

  /**
   * Advance shake timer and return current offset.
   * Call once per render frame with frameDt.
   * @param {number} dt — frame delta in ms
   * @returns {number} horizontal offset in radians (apply to camera yaw)
   */
  function tickShake(dt) {
    if (_shakeTimer <= 0) return 0;
    _shakeTimer -= dt;
    if (_shakeTimer <= 0) { _shakeTimer = 0; return 0; }
    // Linear envelope decay: full amplitude → 0 over duration
    var envelope = _shakeTimer / _shakeDuration;
    // Sinusoidal oscillation
    var elapsed = _shakeDuration - _shakeTimer;
    var offset = Math.sin(elapsed * SHAKE_FREQ * 2 * Math.PI / 1000) * _shakeAmplitude * envelope;
    return offset;
  }

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

  // ── Fatigue System (mirrors EyesOnly GAMESTATE) ────────────────────
  // 0 = fresh, 100 = exhausted. Drains UP from exertion, recovers DOWN
  // passively. Uses _fatigueDecimal accumulator for sub-integer precision.

  // ── Recovery constants ──
  var FATIGUE_IDLE_RATE = 1.0;    // fatigue/sec while idle
  var FATIGUE_WALK_RATE = 0.5;    // fatigue/sec while walking

  function getFatigue() {
    return _state.playerFatigue || 0;
  }

  function getMaxFatigue() {
    return _state.maxFatigue || 100;
  }

  /**
   * Add fatigue (from hose work, bag encumbrance, future sprint).
   * @param {number} amount - Fatigue to add
   * @returns {number} New fatigue value
   */
  function addFatigue(amount) {
    _state.playerFatigue = Math.min(_state.maxFatigue, (_state.playerFatigue || 0) + amount);
    return _state.playerFatigue;
  }

  /**
   * Reduce fatigue (from food items, rest actions).
   * @param {number} amount - Fatigue to remove
   * @returns {number} New fatigue value
   */
  function reduceFatigue(amount) {
    _state.playerFatigue = Math.max(0, (_state.playerFatigue || 0) - amount);
    return _state.playerFatigue;
  }

  /**
   * Full reset (bonfire, bed, combat end, non-lethal defeat).
   */
  function resetFatigue() {
    _state.playerFatigue = 0;
    _state._fatigueDecimal = 0.0;
  }

  /**
   * Passive fatigue recovery tick. Called every frame when NOT hosing/in combat.
   * Mirrors EyesOnly tickFatigueRecovery() with equipment modifier hooks.
   *
   * @param {number} deltaTime - Seconds since last frame
   * @param {boolean} [isWalking=false] - Walking recovers at half speed
   * @returns {string|null} 'tick' if integer decreased, 'topped_off' if 0, null otherwise
   */
  function tickFatigueRecovery(deltaTime, isWalking) {
    if (_state.playerFatigue <= 0) return null;

    var rate = isWalking ? FATIGUE_WALK_RATE : FATIGUE_IDLE_RATE;

    // Equipment modifier hook (CardAuthority equipped items)
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getEquipped) {
      var equipped = CardAuthority.getEquipped();
      for (var i = 0; i < equipped.length; i++) {
        if (equipped[i] && equipped[i].fatigueRecoveryModifier) {
          rate *= equipped[i].fatigueRecoveryModifier;
        }
      }
    }

    // Status effect modifier hook
    if (typeof StatusEffect !== 'undefined' && StatusEffect.getFatigueRecoveryMult) {
      rate *= StatusEffect.getFatigueRecoveryMult();
    }

    _state._fatigueDecimal -= rate * deltaTime;

    if (_state._fatigueDecimal <= -1.0) {
      var drop = Math.floor(Math.abs(_state._fatigueDecimal));
      var prev = _state.playerFatigue;
      _state.playerFatigue = Math.max(0, _state.playerFatigue - drop);
      _state._fatigueDecimal += drop;

      if (_state.playerFatigue <= 0 && prev > 0) return 'topped_off';
      return 'tick';
    }
    return null;
  }

  /**
   * Hose fatigue drain. Called per tile while carrying hose.
   * Applies equipment hoseFatigueModifier and status effect hoseFatigueMult.
   *
   * @param {number} drain - Raw drain amount from hose formula
   * @returns {boolean} True if fatigue rolled over to next integer
   */
  function drainHoseFatigue(drain) {
    var mod = 1.0;

    // Equipment modifier hook (gloves, harness)
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getEquipped) {
      var equipped = CardAuthority.getEquipped();
      for (var i = 0; i < equipped.length; i++) {
        if (equipped[i] && equipped[i].hoseFatigueModifier) {
          mod *= equipped[i].hoseFatigueModifier;
        }
      }
    }

    // Status effect modifier hook (SORE = 1.5x)
    if (typeof StatusEffect !== 'undefined' && StatusEffect.getHoseFatigueMult) {
      mod *= StatusEffect.getHoseFatigueMult();
    }

    _state._fatigueDecimal += drain * mod;

    var rolled = false;
    if (_state._fatigueDecimal >= 1.0) {
      var intPart = Math.floor(_state._fatigueDecimal);
      _state.playerFatigue = Math.min(_state.maxFatigue, _state.playerFatigue + intPart);
      _state._fatigueDecimal -= intPart;
      rolled = true;
    }
    return rolled;
  }

  /**
   * Can the player attach/hold the hose? False if fully exhausted.
   */
  function canHose() {
    return _state.playerFatigue < _state.maxFatigue;
  }

  /**
   * Bag encumbrance fatigue. Called per tile moved.
   * Each bag item adds 0.02 fatigue per step.
   */
  function drainBagEncumbrance() {
    if (typeof CardAuthority === 'undefined') return;
    var bagCount = CardAuthority.getBag().length;
    if (bagCount <= 0) return;
    var drain = bagCount * 0.02;
    _state._fatigueDecimal += drain;
    if (_state._fatigueDecimal >= 1.0) {
      var intPart = Math.floor(_state._fatigueDecimal);
      _state.playerFatigue = Math.min(_state.maxFatigue, _state.playerFatigue + intPart);
      _state._fatigueDecimal -= intPart;
    }
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
        if (fx.type === 'hp')      heal(fx.value);
        if (fx.type === 'energy')  restoreEnergy(fx.value);
        if (fx.type === 'fatigue') reduceFatigue(Math.abs(fx.value));
        if (fx.type === 'damage')  damage(fx.value);
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

  var MAX_WALK_TIME_MULT = 3.0; // Cap: prevent debuff stacking from softlocking

  function getWalkTimeMultiplier() {
    var mult;
    if (typeof StatusEffect !== 'undefined') {
      mult = StatusEffect.getWalkTimeMultiplier();
    } else {
      mult = 1.0;
      for (var i = 0; i < _state.debuffs.length; i++) {
        var def = DEBUFFS[_state.debuffs[i].id];
        if (def && def.walkTimeMult) {
          mult *= def.walkTimeMult;
        }
      }
    }
    return Math.min(mult, MAX_WALK_TIME_MULT);
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
    resetFatigue();
  }

  // ── Reset ──────────────────────────────────────────────────────────

  function reset() {
    _state.hp = _state.maxHp;
    _state.energy = _state.maxEnergy;
    resetFatigue();
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

    // ── Fatigue (mirrors EyesOnly GAMESTATE) ──
    getFatigue:          getFatigue,
    getMaxFatigue:       getMaxFatigue,
    addFatigue:          addFatigue,
    reduceFatigue:       reduceFatigue,
    resetFatigue:        resetFatigue,
    tickFatigueRecovery: tickFatigueRecovery,
    drainHoseFatigue:    drainHoseFatigue,
    drainBagEncumbrance: drainBagEncumbrance,
    canHose:             canHose,

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

    // Screen shake
    triggerShake: triggerShake,
    tickShake:    tickShake,

    // Constants
    DIR_NAMES:       DIR_NAMES,
    FREE_LOOK_RANGE: FREE_LOOK_RANGE,
    PITCH_DOWN_MAX:  PITCH_DOWN_MAX,
    PITCH_UP_MAX:    PITCH_UP_MAX,
    EQUIP_SLOTS:     EQUIP_SLOTS
  };
})();

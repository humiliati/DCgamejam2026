/**
 * StatusEffect — modular buff/debuff registry and stat query system.
 *
 * Layer 1 (zero-dependency on game modules — pure data + logic).
 *
 * Every status effect is registered once via registerEffect(). Active
 * effects on the player are tracked as instances with duration semantics.
 * Paired effects (WELL_RESTED → TIRED) auto-transition when the source
 * expires or is explicitly transitioned.
 *
 * Stat queries (getWalkTimeMultiplier, getCleanEfficiencyMod, getCoyoteBonus)
 * aggregate across all active effects so callers don't need to know which
 * specific effects are contributing.
 *
 * Flash/HUD concerns are delegated to StatusEffectHUD (Layer 2).
 */
var StatusEffect = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  REGISTRY — all known effect definitions
  // ═══════════════════════════════════════════════════════════════

  var _registry = {};  // id → effect definition

  // ═══════════════════════════════════════════════════════════════
  //  ACTIVE EFFECTS — currently applied to the player
  // ═══════════════════════════════════════════════════════════════

  var _active = [];    // [{ id, daysRemaining, condition }]

  // ═══════════════════════════════════════════════════════════════
  //  CALLBACKS
  // ═══════════════════════════════════════════════════════════════

  var _onApply      = null;  // fn(effectDef, instance)
  var _onRemove     = null;  // fn(effectDef, reason)  reason: 'expired'|'manual'|'transition'
  var _onTransition = null;  // fn(fromDef, toDef)

  // ═══════════════════════════════════════════════════════════════
  //  BUILT-IN EFFECT DEFINITIONS
  // ═══════════════════════════════════════════════════════════════

  var BUILTIN_EFFECTS = [
    // ── Buffs ──
    {
      id:          'WELL_RESTED',
      type:        'buff',
      emoji:       '\u2600',         // ☀
      label:       'Well Rested',
      description: 'Slept before curfew. Snappier movement, better cleaning.',
      color:       '#FFF9B0',
      flashColor:  '#FFF9B0',
      statMods:    { cleanEfficiency: 1, walkTimeMult: 0.90, coyoteMs: 100 },
      duration:    'until_tired',
      pair:        'TIRED'
    },

    // ── Debuffs ──
    {
      id:          'TIRED',
      type:        'debuff',
      emoji:       '\uD83C\uDF19',   // 🌙
      label:       'Tired',
      description: 'It\'s late. Head home before curfew.',
      color:       '#A0522D',
      flashColor:  '#A0522D',
      statMods:    { walkTimeMult: 1.10 },
      duration:    'until_rest'
    },
    {
      id:          'GROGGY',
      type:        'debuff',
      emoji:       '\u2601',         // ☁
      label:       'Groggy',
      description: 'Sluggish movement. Sleep it off.',
      color:       '#A0522D',
      flashColor:  '#A0522D',
      statMods:    { walkTimeMult: 1.25 },
      duration:    1
    },
    {
      id:          'SORE',
      type:        'debuff',
      emoji:       '\uD83E\uDE79',   // 🩹
      label:       'Sore',
      description: 'Cleaning takes extra effort.',
      color:       '#DA70D6',
      flashColor:  '#DA70D6',
      statMods:    { cleanEfficiency: -1 },
      duration:    1
    },
    {
      id:          'HUMILIATED',
      type:        'debuff',
      emoji:       '\uD83D\uDE33',   // 😳
      label:       'Humiliated',
      description: 'The town knows what happened. NPCs react.',
      color:       '#FF6B9D',
      flashColor:  '#FF6B9D',
      statMods:    {},
      duration:    1
    },
    {
      id:          'SHAKEN',
      type:        'debuff',
      emoji:       '\uD83D\uDC80',   // 💀
      label:       'Shaken',
      description: 'Near-death experience. Max HP reduced.',
      color:       '#FF6B9D',
      flashColor:  '#FF3333',
      statMods:    { maxHpMult: 0.80 },
      duration:    2
    }
  ];

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function init() {
    _registry = {};
    _active = [];

    // Register built-in effects
    for (var i = 0; i < BUILTIN_EFFECTS.length; i++) {
      registerEffect(BUILTIN_EFFECTS[i]);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  REGISTRATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register an effect definition. Overwrites if id already exists.
   * @param {Object} def - { id, type, emoji, label, description, color, flashColor, statMods, duration, pair }
   */
  function registerEffect(def) {
    if (!def || !def.id) return;
    _registry[def.id] = def;
  }

  /**
   * Get a registered effect definition by id.
   * @param {string} id
   * @returns {Object|null}
   */
  function getDef(id) {
    return _registry[id] || null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  APPLY / REMOVE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Apply an effect. If already active, refresh to max duration.
   * @param {string} id          - registered effect id
   * @param {number|string} dur  - days (number), or 'until_tired'/'until_rest'/'permanent'
   * @returns {boolean} true if applied
   */
  function apply(id, dur) {
    var def = _registry[id];
    if (!def) {
      console.warn('[StatusEffect] Unknown effect: ' + id);
      return false;
    }

    // Use definition's default duration if not specified
    if (dur === undefined || dur === null) {
      dur = def.duration;
    }

    // Check if already active
    var existing = _findActive(id);
    if (existing) {
      // Refresh duration (numeric only — conditions stay as-is)
      if (typeof dur === 'number' && typeof existing.daysRemaining === 'number') {
        existing.daysRemaining = Math.max(existing.daysRemaining, dur);
      }
      return true;
    }

    // Create new active instance
    var instance = { id: id };
    if (typeof dur === 'number') {
      instance.daysRemaining = dur;
    } else {
      instance.condition = dur;  // 'until_tired', 'until_rest', 'permanent'
    }

    _active.push(instance);

    if (_onApply) _onApply(def, instance);
    return true;
  }

  /**
   * Remove an active effect by id.
   * @param {string} id
   * @param {string} reason - 'expired', 'manual', 'transition'
   * @returns {Object|null} the removed instance, or null
   */
  function remove(id, reason) {
    reason = reason || 'manual';
    for (var i = 0; i < _active.length; i++) {
      if (_active[i].id === id) {
        var instance = _active.splice(i, 1)[0];
        var def = _registry[id];
        if (_onRemove && def) _onRemove(def, reason);
        return instance;
      }
    }
    return null;
  }

  /**
   * Trigger a paired transition: remove source, apply its pair.
   * E.g., WELL_RESTED expires → TIRED auto-applies.
   * @param {string} sourceId
   * @returns {boolean} true if transition occurred
   */
  function transition(sourceId) {
    var sourceDef = _registry[sourceId];
    if (!sourceDef || !sourceDef.pair) return false;

    var targetDef = _registry[sourceDef.pair];
    if (!targetDef) return false;

    // Remove source
    remove(sourceId, 'transition');

    // Apply target with its default duration
    apply(sourceDef.pair);

    if (_onTransition) _onTransition(sourceDef, targetDef);
    return true;
  }

  /**
   * Remove all effects matching a condition string.
   * E.g., clearByCondition('until_rest') clears TIRED on sleep.
   * @param {string} condition
   * @returns {Array} ids of removed effects
   */
  function clearByCondition(condition) {
    var removed = [];
    for (var i = _active.length - 1; i >= 0; i--) {
      if (_active[i].condition === condition) {
        var id = _active[i].id;
        remove(id, 'manual');
        removed.push(id);
      }
    }
    return removed;
  }

  // ═══════════════════════════════════════════════════════════════
  //  QUERIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if an effect is currently active.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    return _findActive(id) !== null;
  }

  /**
   * Get all active effects as array of { id, daysRemaining|condition, def }.
   * @returns {Array}
   */
  function getActive() {
    var result = [];
    for (var i = 0; i < _active.length; i++) {
      var a = _active[i];
      result.push({
        id:            a.id,
        daysRemaining: a.daysRemaining,
        condition:     a.condition,
        def:           _registry[a.id] || null
      });
    }
    return result;
  }

  /**
   * Get all active buffs.
   * @returns {Array}
   */
  function getBuffs() {
    var result = [];
    for (var i = 0; i < _active.length; i++) {
      var def = _registry[_active[i].id];
      if (def && def.type === 'buff') {
        result.push({ id: _active[i].id, daysRemaining: _active[i].daysRemaining, condition: _active[i].condition, def: def });
      }
    }
    return result;
  }

  /**
   * Get all active debuffs.
   * @returns {Array}
   */
  function getDebuffs() {
    var result = [];
    for (var i = 0; i < _active.length; i++) {
      var def = _registry[_active[i].id];
      if (def && def.type === 'debuff') {
        result.push({ id: _active[i].id, daysRemaining: _active[i].daysRemaining, condition: _active[i].condition, def: def });
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STAT AGGREGATORS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cumulative walk time multiplier from all active effects.
   * < 1.0 = faster (WELL_RESTED), > 1.0 = slower (GROGGY, TIRED).
   * @returns {number}
   */
  function getWalkTimeMultiplier() {
    var mult = 1.0;
    for (var i = 0; i < _active.length; i++) {
      var def = _registry[_active[i].id];
      if (def && def.statMods && def.statMods.walkTimeMult) {
        mult *= def.statMods.walkTimeMult;
      }
    }
    return mult;
  }

  /**
   * Cumulative cleaning efficiency modifier.
   * Positive = bonus, negative = penalty.
   * @returns {number}
   */
  function getCleanEfficiencyMod() {
    var mod = 0;
    for (var i = 0; i < _active.length; i++) {
      var def = _registry[_active[i].id];
      if (def && def.statMods && def.statMods.cleanEfficiency) {
        mod += def.statMods.cleanEfficiency;
      }
    }
    return mod;
  }

  /**
   * Coyote time bonus in ms from all active effects.
   * Added to trap trigger grace window.
   * @returns {number}
   */
  function getCoyoteBonus() {
    var bonus = 0;
    for (var i = 0; i < _active.length; i++) {
      var def = _registry[_active[i].id];
      if (def && def.statMods && def.statMods.coyoteMs) {
        bonus += def.statMods.coyoteMs;
      }
    }
    return bonus;
  }

  /**
   * Max HP multiplier (for SHAKEN). Cumulative.
   * @returns {number}
   */
  function getMaxHpMultiplier() {
    var mult = 1.0;
    for (var i = 0; i < _active.length; i++) {
      var def = _registry[_active[i].id];
      if (def && def.statMods && def.statMods.maxHpMult) {
        mult *= def.statMods.maxHpMult;
      }
    }
    return mult;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DAY TICK
  // ═══════════════════════════════════════════════════════════════

  /**
   * Tick all active effects (call once per day change).
   * Decrements numeric durations. Removes expired effects.
   * Fires paired transitions for expired effects that have a pair.
   * @returns {{ expired: Array, transitioned: Array }}
   */
  function tickDay() {
    var expired = [];
    var transitioned = [];

    for (var i = _active.length - 1; i >= 0; i--) {
      var inst = _active[i];

      // Only tick numeric durations
      if (typeof inst.daysRemaining !== 'number') continue;

      inst.daysRemaining--;
      if (inst.daysRemaining <= 0) {
        var def = _registry[inst.id];

        // Check for paired transition
        if (def && def.pair && _registry[def.pair]) {
          transition(inst.id);
          transitioned.push({ from: inst.id, to: def.pair });
        } else {
          remove(inst.id, 'expired');
          expired.push(inst.id);
        }
      }
    }

    return { expired: expired, transitioned: transitioned };
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLEAR / RESET
  // ═══════════════════════════════════════════════════════════════

  /**
   * Remove all active effects (game reset).
   */
  function clearAll() {
    while (_active.length > 0) {
      remove(_active[0].id, 'manual');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  INTERNALS
  // ═══════════════════════════════════════════════════════════════

  function _findActive(id) {
    for (var i = 0; i < _active.length; i++) {
      if (_active[i].id === id) return _active[i];
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CALLBACK SETTERS
  // ═══════════════════════════════════════════════════════════════

  function setOnApply(fn)      { _onApply = fn; }
  function setOnRemove(fn)     { _onRemove = fn; }
  function setOnTransition(fn) { _onTransition = fn; }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    // Lifecycle
    init:               init,
    registerEffect:     registerEffect,
    getDef:             getDef,

    // Apply / remove
    apply:              apply,
    remove:             remove,
    transition:         transition,
    clearByCondition:   clearByCondition,
    clearAll:           clearAll,

    // Queries
    has:                has,
    getActive:          getActive,
    getBuffs:           getBuffs,
    getDebuffs:         getDebuffs,

    // Stat aggregators
    getWalkTimeMultiplier:  getWalkTimeMultiplier,
    getCleanEfficiencyMod:  getCleanEfficiencyMod,
    getCoyoteBonus:         getCoyoteBonus,
    getMaxHpMultiplier:     getMaxHpMultiplier,

    // Day tick
    tickDay:            tickDay,

    // Callbacks
    setOnApply:         setOnApply,
    setOnRemove:        setOnRemove,
    setOnTransition:    setOnTransition
  });

})();

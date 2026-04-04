/**
 * CardStack — stack-based card combo system for Dungeon Gleaner combat.
 *
 * Players build a "stack" by dragging cards onto each other in the hand
 * fan. Cards with matching synergy tags can stack; mismatched cards reject.
 * When the player fires the stack (pointer thrust toward enemy), all cards
 * resolve together with synergy multipliers from SynergyEngine.
 *
 * Stack rules:
 *   - A stack is 1–N cards built from the current hand
 *   - Cards need at least one shared synergyTag to stack together
 *   - Persistent cards (cost.persistent === true or persistent === true)
 *     return to hand after resolution; expendable cards are consumed
 *   - Each card's resource cost is paid on fire, not on stack
 *   - The stack can be cancelled (un-stacked) before firing
 *
 * Thrust mechanic:
 *   - When the player fires the stack, they thrust the Magic Remote (or
 *     drag aggressively toward the enemy on the screen)
 *   - Thrust velocity is measured from pointer delta during the fire gesture
 *   - Higher velocity → thrust multiplier (1.0x baseline, up to 1.5x)
 *   - This keeps gyro input central without excluding accessibility
 *     controllers (d-pad confirm still fires at 1.0x)
 *
 * Enemy AI stacking:
 *   - Enemies build visible stacks over turns based on stackGreed
 *   - Each beat, the enemy commits one card from their AI hand
 *   - Player can see the stack growing (overhead intent display)
 *   - When enemy stack reaches greed target OR player fires first,
 *     both stacks resolve simultaneously
 *
 * Layer 2 — depends on: CardSystem (hand data), SynergyEngine (tag combos)
 */
var CardStack = (function () {
  'use strict';

  // ── Thrust velocity → multiplier curve ──────────────────────────
  // Measured in px/ms of pointer velocity during fire gesture.
  // Soft floor at 1.0x (button press / slow drag), cap at 1.05x base.
  // Items can modify _thrustCapOverride to raise the cap (endgame → 1.5x).
  var THRUST_VEL_MIN   = 0.2;   // px/ms — below this = 1.0x baseline
  var THRUST_VEL_MAX   = 2.0;   // px/ms — above this = capped at max mult
  var THRUST_MULT_MIN  = 1.0;   // Multiplier at zero/low velocity
  var THRUST_MULT_MAX  = 1.05;  // Base max multiplier (items can raise via setThrustCap)
  var _thrustCapOverride = 0;   // Item bonus to thrust cap (0 = use THRUST_MULT_MAX)

  // ── Player stack state ──────────────────────────────────────────
  var _stack      = [];    // Array of { card, handIndex } in stack order
  var _stackTags  = [];    // Running intersection of shared synergy tags
  var _thrust     = 1.0;   // Last computed thrust multiplier

  // ── Enemy stack state ───────────────────────────────────────────
  var _enemyStack = [];    // Array of card objects the enemy has committed
  var _enemyGreed = 2;     // Target stack size before auto-fire

  // ── Gesture tracking ────────────────────────────────────────────
  var _gestureStart  = null;  // { x, y, time }
  var _gestureEnd    = null;  // { x, y, time }

  // ── Init / reset ────────────────────────────────────────────────

  function reset() {
    _stack = [];
    _stackTags = [];
    _thrust = 1.0;
    _enemyStack = [];
    _enemyGreed = 2;
    _gestureStart = null;
    _gestureEnd = null;
  }

  // ── Player stack building ───────────────────────────────────────

  /**
   * Check if a card can be added to the current stack.
   * First card always works. Subsequent cards need ≥1 shared synergy tag.
   *
   * @param {Object} card - Card definition with synergyTags array
   * @returns {boolean}
   */
  function canStack(card) {
    if (!card || !card.synergyTags) return false;
    if (_stack.length === 0) return true;

    // Must share at least one tag with the running tag intersection
    for (var i = 0; i < card.synergyTags.length; i++) {
      if (_stackTags.indexOf(card.synergyTags[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * Add a card to the stack. Returns true if accepted.
   * The card stays in the hand array (not spliced until fire).
   *
   * @param {Object} card - Card object
   * @param {number} handIndex - Index in CardSystem hand
   * @returns {boolean}
   */
  function pushCard(card, handIndex) {
    if (!canStack(card)) return false;

    // Check for duplicates (same hand slot)
    for (var i = 0; i < _stack.length; i++) {
      if (_stack[i].handIndex === handIndex) return false;
    }

    _stack.push({ card: card, handIndex: handIndex });
    _rebuildTags();

    // Card stack SFX — satisfying snap as cards layer
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.playRandom('card-stack', { volume: 0.45 });
    }

    return true;
  }

  /**
   * Remove the last card from the stack (undo). Returns the entry or null.
   */
  function popCard() {
    if (_stack.length === 0) return null;
    var entry = _stack.pop();
    _rebuildTags();
    return entry;
  }

  /**
   * Remove a specific card by hand index. Returns true if found.
   */
  function removeByIndex(handIndex) {
    for (var i = 0; i < _stack.length; i++) {
      if (_stack[i].handIndex === handIndex) {
        _stack.splice(i, 1);
        _rebuildTags();
        return true;
      }
    }
    return false;
  }

  /** Clear the entire player stack (cancel). */
  function clear() {
    _stack = [];
    _stackTags = [];
    _thrust = 1.0;
  }

  /** Rebuild shared tag intersection from current stack. */
  function _rebuildTags() {
    if (_stack.length === 0) { _stackTags = []; return; }
    if (_stack.length === 1) {
      _stackTags = _stack[0].card.synergyTags.slice();
      return;
    }
    // Intersect: tags shared by ALL cards in stack
    var tags = _stack[0].card.synergyTags.slice();
    for (var i = 1; i < _stack.length; i++) {
      var cardTags = _stack[i].card.synergyTags;
      tags = tags.filter(function (t) {
        return cardTags.indexOf(t) !== -1;
      });
    }
    _stackTags = tags;
  }

  // ── Stack queries ───────────────────────────────────────────────

  function getStack()    { return _stack; }
  function getSize()     { return _stack.length; }
  function isEmpty()     { return _stack.length === 0; }
  function getSharedTags() { return _stackTags; }

  /**
   * Get all cards in the stack as a flat array (for SynergyEngine).
   */
  function getCards() {
    var cards = [];
    for (var i = 0; i < _stack.length; i++) {
      cards.push(_stack[i].card);
    }
    return cards;
  }

  /**
   * Check if a hand index is already in the stack.
   */
  function isInStack(handIndex) {
    for (var i = 0; i < _stack.length; i++) {
      if (_stack[i].handIndex === handIndex) return true;
    }
    return false;
  }

  // ── Thrust gesture tracking ─────────────────────────────────────

  /**
   * Begin tracking a thrust gesture (pointerdown on stack/fire area).
   */
  function gestureStart(x, y) {
    _gestureStart = { x: x, y: y, time: Date.now() };
    _gestureEnd = null;
  }

  /**
   * End the thrust gesture and compute the multiplier.
   * Velocity is measured as Euclidean distance / elapsed time.
   *
   * @returns {number} Thrust multiplier (1.0 – effective cap)
   */
  function gestureEnd(x, y) {
    if (!_gestureStart) {
      _thrust = THRUST_MULT_MIN;
      return _thrust;
    }
    _gestureEnd = { x: x, y: y, time: Date.now() };

    var dx = _gestureEnd.x - _gestureStart.x;
    var dy = _gestureEnd.y - _gestureStart.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var elapsed = Math.max(1, _gestureEnd.time - _gestureStart.time);
    var velocity = dist / elapsed;  // px/ms

    // Effective cap: base + item bonuses
    var effectiveCap = THRUST_MULT_MAX + _thrustCapOverride;

    // Map velocity to multiplier
    if (velocity <= THRUST_VEL_MIN) {
      _thrust = THRUST_MULT_MIN;
    } else if (velocity >= THRUST_VEL_MAX) {
      _thrust = effectiveCap;
    } else {
      var t = (velocity - THRUST_VEL_MIN) / (THRUST_VEL_MAX - THRUST_VEL_MIN);
      // Ease-out curve for satisfying acceleration feel
      _thrust = THRUST_MULT_MIN + (effectiveCap - THRUST_MULT_MIN) * (1 - (1 - t) * (1 - t));
    }

    _gestureStart = null;
    return _thrust;
  }

  /**
   * Set item-based thrust cap bonus. Stacks additively.
   * E.g. setThrustCap(0.45) raises effective cap from 1.05 → 1.5.
   * @param {number} bonus — additional multiplier above THRUST_MULT_MAX
   */
  function setThrustCap(bonus) {
    _thrustCapOverride = Math.max(0, bonus || 0);
  }

  /** Get current effective thrust cap (base + items). */
  function getThrustCap() {
    return THRUST_MULT_MAX + _thrustCapOverride;
  }

  /** Get the last computed thrust multiplier. */
  function getThrust() { return _thrust; }

  /**
   * Fire with button/d-pad (no thrust gesture). Always 1.0x.
   */
  function fireBaseline() {
    _thrust = THRUST_MULT_MIN;
    return _thrust;
  }

  // ── Card persistence / expenditure ──────────────────────────────

  /**
   * Determine if a card is persistent (stays in hand after use).
   * Persistent cards spend their resource cost but don't get consumed.
   * Equipment-like cards, aura cards, stance cards are persistent.
   *
   * @param {Object} card
   * @returns {boolean}
   */
  function isPersistent(card) {
    if (!card) return false;
    // Explicit flag takes priority
    if (card.persistent === true) return true;
    if (card.persistent === false) return false;
    // Convention: cards with cost.persistent flag
    if (card.cost && card.cost.persistent) return true;
    return false;
  }

  /**
   * After stack resolution, partition stack cards into:
   *   - expended: cards consumed (removed from hand/deck)
   *   - retained: persistent cards that return to hand
   *
   * @returns {{ expended: Array, retained: Array }}
   */
  function partitionAfterFire() {
    var expended = [];
    var retained = [];
    for (var i = 0; i < _stack.length; i++) {
      var entry = _stack[i];
      if (isPersistent(entry.card)) {
        retained.push(entry);
      } else {
        expended.push(entry);
      }
    }
    return { expended: expended, retained: retained };
  }

  // ── Aggregate stack damage / effects ────────────────────────────

  /**
   * Compute the aggregate effects of the stack (pre-synergy).
   * Sums damage, defense, healing across all cards.
   * Thrust multiplier applies to damage effects only.
   *
   * @returns {{ damage: number, defense: number, healing: number,
   *             statuses: Array, cards: Array }}
   */
  function computeStackEffects() {
    var damage = 0;
    var defense = 0;
    var healing = 0;
    var energyGain = 0;
    var batteryGain = 0;
    var drawCount = 0;
    var statuses = [];

    for (var i = 0; i < _stack.length; i++) {
      var card = _stack[i].card;
      if (!card.effects) continue;
      for (var j = 0; j < card.effects.length; j++) {
        var eff = card.effects[j];
        if (eff.type === 'damage') damage += eff.value;
        else if (eff.type === 'defense') defense += eff.value;
        else if (eff.type === 'hp') healing += eff.value;
        else if (eff.type === 'energy') energyGain += eff.value;
        else if (eff.type === 'battery') batteryGain += eff.value;
        else if (eff.type === 'draw') drawCount += eff.value;
        else if (eff.type === 'status') statuses.push(eff);
      }
    }

    // Apply thrust multiplier to damage
    damage = Math.floor(damage * _thrust);

    return {
      damage: damage,
      defense: defense,
      healing: healing,
      energyGain: energyGain,
      batteryGain: batteryGain,
      drawCount: drawCount,
      statuses: statuses,
      cards: getCards(),
      thrust: _thrust,
      stackSize: _stack.length,
      sharedTags: _stackTags.slice()
    };
  }

  // ── Enemy AI stack ──────────────────────────────────────────────

  /**
   * Set the enemy's stack greed for this combat.
   * @param {number} greed - Target stack size (1=fire immediately, 3-4=boss)
   */
  function setEnemyGreed(greed) {
    _enemyGreed = Math.max(1, greed || 2);
    _enemyStack = [];
  }

  /**
   * Enemy commits one card to their stack (called once per "beat").
   * Returns the updated enemy stack for display purposes.
   *
   * @param {Object} card - Enemy AI card to commit
   * @returns {Array} Current enemy stack
   */
  function enemyCommitCard(card) {
    if (!card) return _enemyStack;
    _enemyStack.push(card);
    return _enemyStack;
  }

  /**
   * Check if the enemy stack has reached its greed target.
   * @returns {boolean}
   */
  function isEnemyStackReady() {
    return _enemyStack.length >= _enemyGreed;
  }

  /**
   * Get the enemy stack for display / resolution.
   */
  function getEnemyStack() { return _enemyStack; }
  function getEnemyStackSize() { return _enemyStack.length; }
  function getEnemyGreed() { return _enemyGreed; }

  /**
   * Compute aggregate enemy stack damage.
   * No thrust multiplier for enemies (they don't use the remote).
   *
   * @returns {{ damage: number, defense: number, statuses: Array }}
   */
  function computeEnemyStackEffects() {
    var damage = 0;
    var defense = 0;
    var statuses = [];

    for (var i = 0; i < _enemyStack.length; i++) {
      var card = _enemyStack[i];
      if (!card.effects) continue;
      for (var j = 0; j < card.effects.length; j++) {
        var eff = card.effects[j];
        if (eff.type === 'damage') damage += eff.value;
        else if (eff.type === 'defense') defense += eff.value;
        else if (eff.type === 'status') statuses.push(eff);
      }
    }

    return { damage: damage, defense: defense, statuses: statuses };
  }

  /** Clear enemy stack after resolution. */
  function clearEnemyStack() {
    _enemyStack = [];
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    // Lifecycle
    reset:            reset,

    // Player stack building
    canStack:         canStack,
    pushCard:         pushCard,
    popCard:          popCard,
    removeByIndex:    removeByIndex,
    clear:            clear,

    // Stack queries
    getStack:         getStack,
    getSize:          getSize,
    isEmpty:          isEmpty,
    getCards:         getCards,
    getSharedTags:    getSharedTags,
    isInStack:        isInStack,

    // Thrust gesture
    gestureStart:     gestureStart,
    gestureEnd:       gestureEnd,
    getThrust:        getThrust,
    fireBaseline:     fireBaseline,

    // Card persistence
    isPersistent:     isPersistent,
    partitionAfterFire: partitionAfterFire,

    // Stack resolution
    computeStackEffects: computeStackEffects,

    // Enemy AI
    setEnemyGreed:       setEnemyGreed,
    enemyCommitCard:     enemyCommitCard,
    isEnemyStackReady:   isEnemyStackReady,
    getEnemyStack:       getEnemyStack,
    getEnemyStackSize:   getEnemyStackSize,
    getEnemyGreed:       getEnemyGreed,
    computeEnemyStackEffects: computeEnemyStackEffects,
    clearEnemyStack:     clearEnemyStack,

    // Thrust cap (item-modifiable)
    setThrustCap:    setThrustCap,
    getThrustCap:    getThrustCap,

    // Constants (for UI)
    THRUST_MULT_MAX: THRUST_MULT_MAX
  };
})();

/**
 * EnemyIntent — enemy attack telegraph system (Pass 8).
 *
 * Adapted from EyesOnly's enemy-intent-system.js (597 lines).
 * DG simplification: emoji face expressions + card stack telegraph.
 *
 * During combat's stacking phase the enemy commits cards on a beat timer.
 * This module tracks intent state and feeds render data to the raycaster
 * so players can *see* the enemy's growing stack above their sprite:
 *
 *   Exploration:  💤  (awareness glyph — unchanged)
 *   Combat idle:  😐  (neutral face)
 *   Stacking:     😠 [🗡️🗡️_]  (angry face + 2 of 3 cards committed)
 *   Ready:        🔥 [🗡️🗡️🗡️]  (charged — full stack, about to fire)
 *
 * Expression is driven by HP%, combat events, and stack progress.
 * Stack telegraph shows committed card emojis + empty slots.
 *
 * Layer 2 — depends on: EnemySprites (states), CardStack, EnemyAI
 */
var EnemyIntent = (function () {
  'use strict';

  // ── Expression catalog (adapted from EyesOnly's 13 ASCII glyphs) ──
  // DG uses emoji faces for the dungeon aesthetic.
  var EXPRESSIONS = {
    calm:       { glyph: '😐', threat: 'low',    name: 'Calm' },
    focused:    { glyph: '😠', threat: 'medium', name: 'Focused' },
    angry:      { glyph: '😡', threat: 'high',   name: 'Angry' },
    enraged:    { glyph: '🤬', threat: 'high',   name: 'Enraged' },
    surprised:  { glyph: '😲', threat: 'low',    name: 'Surprised' },
    dazed:      { glyph: '😵', threat: 'none',   name: 'Dazed' },
    sleeping:   { glyph: '😴', threat: 'none',   name: 'Sleeping' },
    confident:  { glyph: '😏', threat: 'medium', name: 'Confident' },
    desperate:  { glyph: '😰', threat: 'high',   name: 'Desperate' },
    charged:    { glyph: '🔥', threat: 'high',   name: 'Charged' }
  };

  // ── Active intent state (one enemy at a time — DG is 1v1 combat) ──
  var _state = null;   // { expression, stackCards[], greed, ready, enemyRef }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initialize intent tracking for a new combat encounter.
   * Called by CombatBridge._beginCombat().
   *
   * @param {Object} enemy - Enemy entity
   * @param {number} greed - Enemy stack greed (from CardStack)
   */
  function beginCombat(enemy, greed) {
    _state = {
      expression: _determineExpression(enemy, null, 0, greed),
      stackCards: [],
      greed: greed || 2,
      ready: false,
      enemyRef: enemy,
      lastEvent: null
    };
  }

  /** Clear intent state when combat ends. */
  function endCombat() {
    _state = null;
  }

  // ── Expression determination ──────────────────────────────────────
  // Priority cascade adapted from EyesOnly's determineExpression():
  //   1. Stack full (ready to fire) → charged 🔥
  //   2. Dazed/stunned             → dazed 😵
  //   3. Sleeping (low awareness)  → sleeping 😴
  //   4. HP < 25%                  → desperate 😰
  //   5. HP < 50% + stacking       → enraged 🤬
  //   6. HP > 75% + stacking       → confident 😏
  //   7. Stacking (default)        → focused 😠
  //   8. Combat event override     → angry/surprised
  //   9. Default                   → calm 😐

  function _determineExpression(enemy, event, stackSize, greed) {
    // 1. Stack full
    if (stackSize >= greed && greed > 0) return EXPRESSIONS.charged;

    // 2. Stunned/paralyzed/frozen — incapacitated, can't act
    if (enemy.spriteState === 'paralyzed' || enemy.spriteState === 'frozen') {
      return EXPRESSIONS.dazed;
    }

    // 3. Sleeping
    if (enemy.spriteState === 'sleeping') return EXPRESSIONS.sleeping;

    // 3b. Burning — override to angry (pain disrupts strategy)
    if (enemy.spriteState === 'burning') return EXPRESSIONS.angry;

    // 3c. Poisoned — override to desperate (weakened)
    if (enemy.spriteState === 'poisoned') return EXPRESSIONS.desperate;

    // 3d. Enraged sprite state (from card effect or low HP auto-derive)
    if (enemy.spriteState === 'enraged') return EXPRESSIONS.enraged;

    var hpPct = (enemy.maxHp > 0) ? (enemy.hp / enemy.maxHp) : 1;

    // 4. Desperate (low HP)
    if (hpPct < 0.25) return EXPRESSIONS.desperate;

    // 5. Combat event overrides
    if (event === 'took_damage') {
      return (hpPct < 0.5) ? EXPRESSIONS.enraged : EXPRESSIONS.surprised;
    }
    if (event === 'ambushed') return EXPRESSIONS.surprised;

    // 6-8. Stacking states
    if (stackSize > 0) {
      if (hpPct < 0.5) return EXPRESSIONS.enraged;
      if (hpPct > 0.75) return EXPRESSIONS.confident;
      return EXPRESSIONS.focused;
    }

    // 9. Default
    return EXPRESSIONS.calm;
  }

  // ── Intent updates (called by CombatBridge) ───────────────────────

  /**
   * Enemy committed a new card. Update expression and stack display.
   * @param {Array} enemyStack - Current enemy stack from CardStack
   */
  function onEnemyCommit(enemyStack) {
    if (!_state) return;
    _state.stackCards = enemyStack || [];
    _state.ready = false;
    _state.expression = _determineExpression(
      _state.enemyRef, null, _state.stackCards.length, _state.greed
    );
  }

  /**
   * Enemy stack is full — about to fire.
   */
  function onEnemyReady() {
    if (!_state) return;
    _state.ready = true;
    _state.expression = EXPRESSIONS.charged;
  }

  /**
   * Combat event occurred (damage taken, ambush, etc.).
   * @param {string} event - 'took_damage' | 'ambushed' | 'round_end'
   */
  function onCombatEvent(event) {
    if (!_state) return;
    _state.lastEvent = event;

    if (event === 'round_end') {
      // Reset after resolution — new round starts with calm
      _state.stackCards = [];
      _state.ready = false;
      _state.expression = _determineExpression(
        _state.enemyRef, null, 0, _state.greed
      );
      return;
    }

    _state.expression = _determineExpression(
      _state.enemyRef, event, _state.stackCards.length, _state.greed
    );
  }

  // ── Render data (consumed by raycaster) ───────────────────────────

  /**
   * Get render data for the current combat enemy's intent telegraph.
   * Returns null if no combat is active.
   *
   * @returns {Object|null} {
   *   glyph:      string,   // Expression emoji
   *   threat:     string,   // 'low'|'medium'|'high'|'none'
   *   cardEmojis: string[], // Committed card emojis
   *   greed:      number,   // Total slots
   *   ready:      boolean,  // Stack full — flashing warning
   *   enemyId:    *         // For raycaster to match against sprite
   * }
   */
  function getRenderData() {
    if (!_state) return null;
    var emojis = [];
    for (var i = 0; i < _state.stackCards.length; i++) {
      emojis.push(_state.stackCards[i].emoji || '🗡️');
    }
    return {
      glyph: _state.expression.glyph,
      threat: _state.expression.threat,
      cardEmojis: emojis,
      greed: _state.greed,
      ready: _state.ready,
      enemyId: _state.enemyRef ? (_state.enemyRef.id || null) : null
    };
  }

  /**
   * Check if intent tracking is active (combat in progress).
   */
  function isActive() { return !!_state; }

  /**
   * Get the current expression object.
   */
  function getExpression() {
    return _state ? _state.expression : null;
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    EXPRESSIONS:    EXPRESSIONS,
    beginCombat:    beginCombat,
    endCombat:      endCombat,
    onEnemyCommit:  onEnemyCommit,
    onEnemyReady:   onEnemyReady,
    onCombatEvent:  onCombatEvent,
    getRenderData:  getRenderData,
    isActive:       isActive,
    getExpression:  getExpression
  };
})();

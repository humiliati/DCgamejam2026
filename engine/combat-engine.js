/**
 * CombatEngine — STR (Simultaneous Turn Resolution) combat.
 *
 * Adapted from EyesOnly's StrCombatEngine init sequence:
 *
 *   Phase: idle
 *     → 'facing'     — player turns toward enemy (250ms animated)
 *     → 'countdown'  — 3-beat narration: environment, advantage, readiness
 *     → 'selecting'  — hand fan open, player picks a card
 *     → 'resolving'  — card effects applied, damage exchange
 *     → 'post_resolve' — brief pause for log readability
 *     → back to 'selecting' (next round) OR 'victory' / 'defeat'
 *
 * Will be fully extracted from EyesOnly's StrCombatEngine during jam.
 * This stub has simple damage math but the full phase sequencing.
 */
var CombatEngine = (function () {
  'use strict';

  var _active = false;
  var _enemy = null;
  var _phase = 'idle';
  var _round = 0;
  var _advantage = 'neutral';
  var _onEnd = null;
  var _onPhaseChange = null;

  // Countdown state
  var _countdownBeat = 0;    // 0–3 (3 beats + done)
  var _countdownTimer = 0;
  var _countdownMessages = [];

  // Enemy beat accumulation (stacking phase)
  var _enemyBeatTimer  = 0;
  var _drawsThisRound  = 0;       // Draws taken this round
  var _drawsPerRound   = 1;       // Configurable per-turn draw count

  // ── Timing constants (ms) ─────────────────────────────────────────
  var FACING_TIME = 250;          // Time for turn-to-face (matches MC.ROT_TIME)
  var BEAT_DURATION = 600;        // Time each countdown beat displays
  var POST_RESOLVE_DELAY = 800;   // Pause after damage exchange for readability
  var ENEMY_BEAT_INTERVAL = 2500; // ms of player inaction before enemy commits next card

  // ── Accessors ─────────────────────────────────────────────────────

  function isActive()     { return _active; }
  function getPhase()     { return _phase; }
  function getEnemy()     { return _enemy; }
  function getRound()     { return _round; }
  function getAdvantage() { return _advantage; }
  function getCountdownMessage() {
    if (_phase !== 'countdown' || _countdownBeat >= _countdownMessages.length) return '';
    return _countdownMessages[_countdownBeat];
  }

  // ── Phase management ──────────────────────────────────────────────

  function _setPhase(phase) {
    var old = _phase;
    _phase = phase;
    if (_onPhaseChange) {
      try { _onPhaseChange(phase, old); }
      catch (e) { console.error('[CombatEngine] phase callback error:', e); }
    }
  }

  // ── Start combat ──────────────────────────────────────────────────

  /**
   * Initialize combat. The caller (CombatBridge) is responsible for
   * turning the player to face the enemy BEFORE calling this.
   * CombatEngine begins at 'countdown' and auto-advances.
   *
   * @param {Object} enemy
   * @param {Object} player
   * @param {Object} opts - { onEnd, onPhaseChange }
   */
  function start(enemy, player, opts) {
    _active = true;
    _enemy = enemy;
    _round = 0;
    _onEnd = (opts && opts.onEnd) || null;
    _onPhaseChange = (opts && opts.onPhaseChange) || null;

    // ── Calculate advantage ──
    // The ambushHint is set by CombatBridge BEFORE turning the player,
    // so it correctly captures who had the positional advantage.
    //
    // 'player_ambushed' → enemy snuck up behind player → alert advantage
    // 'enemy_ambushed'  → player snuck up on unaware enemy → ambush advantage
    // null               → mutual face-to-face engagement → neutral
    var hint = (opts && opts.ambushHint) || null;
    if (hint === 'enemy_ambushed') {
      _advantage = 'ambush';    // player ambushed the enemy
    } else if (hint === 'player_ambushed') {
      _advantage = 'alert';     // enemy ambushed the player
    } else {
      // Fall back to awareness for mutual engagements
      var state = EnemyAI.getAwarenessState(enemy.awareness);
      if (state === EnemyAI.AWARENESS.UNAWARE) {
        _advantage = 'ambush';
      } else if (state === EnemyAI.AWARENESS.ALERTED) {
        _advantage = 'alert';
      } else {
        _advantage = 'neutral';
      }
    }

    // ── Build 3-beat countdown messages ──
    // Beat 3 (environment): what gave you cover or exposed you
    // Beat 2 (advantage):   the combat advantage state
    // Beat 1 (readiness):   resource/status check
    _countdownMessages = _buildCountdownBeats(enemy, player);
    _countdownBeat = 0;
    _countdownTimer = 0;

    // Begin countdown phase
    _setPhase('countdown');

    console.log('[CombatEngine] Combat started — ' + _advantage +
                ' vs ' + enemy.name + ' (HP:' + enemy.hp + ')');
  }

  // ── 3-Beat Narration ──────────────────────────────────────────────

  function _buildCountdownBeats(enemy, player) {
    var beats = [];

    // Beat 3 — Environment context
    if (_advantage === 'ambush') {
      beats.push('⚔️ ' + i18n.t('combat.beat_ambush', 'You caught them off guard'));
    } else if (_advantage === 'alert') {
      beats.push('⚠️ ' + i18n.t('combat.beat_alert', 'They saw you coming'));
    } else {
      beats.push('⚔️ ' + i18n.t('combat.beat_engaged', 'Face to face'));
    }

    // Beat 2 — Advantage state
    var advantageEmoji = _advantage === 'ambush' ? '🎯' :
                         _advantage === 'alert'  ? '🔴' : '⚡';
    beats.push(advantageEmoji + ' ' +
      i18n.t('combat.advantage_' + _advantage,
        _advantage.charAt(0).toUpperCase() + _advantage.slice(1)));

    // Beat 1 — Readiness
    var hpPct = player.hp / player.maxHp;
    if (hpPct < 0.3) {
      beats.push('❗ ' + i18n.t('combat.beat_critical', 'Critical HP - fight carefully'));
    } else if (player.energy < 2) {
      beats.push('⚡ ' + i18n.t('combat.beat_low_energy', 'Low energy'));
    } else {
      beats.push('✅ ' + i18n.t('combat.beat_ready', 'Ready'));
    }

    return beats;
  }

  // ── Update (called from Game._render via CombatBridge) ────────────

  /**
   * Advance countdown timer. Call each frame with delta ms.
   * Returns true if a phase transition occurred this frame.
   */
  function update(dt) {
    if (!_active) return false;

    if (_phase === 'countdown') {
      _countdownTimer += dt;
      if (_countdownTimer >= BEAT_DURATION) {
        _countdownTimer -= BEAT_DURATION;
        _countdownBeat++;
        if (_countdownBeat >= _countdownMessages.length) {
          // Countdown complete → stacking (player builds stack, enemy accumulates)
          _enterStacking();
          return true;
        }
      }
      return false;
    }

    // ── Stacking phase: enemy commits cards on a timer ──────────
    // Player is free to drag-and-stack cards with no time pressure.
    // Every ENEMY_BEAT_INTERVAL ms of inaction, the enemy commits
    // one more card to their stack (visible intent escalation).
    // When enemy stack reaches greed target, enemy auto-fires
    // which forces simultaneous resolution.
    if (_phase === 'stacking') {
      _enemyBeatTimer += dt;
      if (_enemyBeatTimer >= ENEMY_BEAT_INTERVAL) {
        _enemyBeatTimer -= ENEMY_BEAT_INTERVAL;

        // Enemy commits a card (via CardStack enemy AI)
        if (typeof CardStack !== 'undefined' && !CardStack.isEnemyStackReady()) {
          var aiCard = _getEnemyAICard();
          if (aiCard) {
            CardStack.enemyCommitCard(aiCard);

            // Notify phase listeners so HUD can update
            if (_onPhaseChange) _onPhaseChange('enemy_commit', 'stacking');

            // If enemy stack is full, auto-fire (forces resolution)
            if (CardStack.isEnemyStackReady()) {
              if (_onPhaseChange) _onPhaseChange('enemy_ready', 'stacking');
            }
          }
        }
      }
      return false;
    }

    if (_phase === 'post_resolve') {
      _countdownTimer += dt;
      if (_countdownTimer >= POST_RESOLVE_DELAY) {
        _countdownTimer = 0;
        // Check end conditions after resolve pause
        if (_enemy.hp <= 0) {
          _setPhase('victory');
          _active = false;
          if (_onEnd) _onEnd('victory', _enemy);
        } else if (_checkPlayerDead()) {
          _setPhase('defeat');
          _active = false;
          if (_onEnd) _onEnd('defeat', _enemy);
        } else {
          // Next round → back to stacking
          _enterStacking();
        }
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Enter the stacking phase for a new round.
   * Resets enemy beat timer, draws per-turn card from backup, clears stacks.
   */
  function _enterStacking() {
    _round++;
    _enemyBeatTimer = 0;
    _drawsThisRound = 0;

    // Tick status duration — clear expired statuses, keep ongoing ones
    if (_enemy && _enemy.spriteState && _enemy.spriteState !== 'idle' && _enemy.spriteState !== 'dead') {
      if (_enemy.statusDuration && _enemy.statusDuration > 0) {
        _enemy.statusDuration--;
        if (_enemy.statusDuration <= 0) {
          _enemy.spriteState = 'idle';
          _enemy.statusDuration = 0;
        }
      }
      // Statuses without explicit duration persist until replaced
    }

    // Clear stacks from previous round
    if (typeof CardStack !== 'undefined') {
      CardStack.clear();
      CardStack.clearEnemyStack();
    }

    // Enemy commits their first card immediately (no free beats)
    if (typeof CardStack !== 'undefined') {
      var aiCard = _getEnemyAICard();
      if (aiCard) CardStack.enemyCommitCard(aiCard);
    }

    _setPhase('stacking');
  }

  /**
   * Simple enemy AI card generator (stub — will be replaced).
   * Generates a card from the enemy's stats.
   */
  function _getEnemyAICard() {
    if (!_enemy) return null;
    var str = _enemy.str || 1;
    return {
      id: 'AI-' + (_enemy.id || 'enemy'),
      name: _enemy.name + ' Strike',
      emoji: _enemy.emoji || '💀',
      effects: [{ type: 'damage', value: Math.max(1, str), target: 'player' }],
      synergyTags: ['melee']
    };
  }

  function _checkPlayerDead() {
    return Player.state().hp <= 0;
  }

  // ── Play a card ───────────────────────────────────────────────────

  /**
   * Play a single card (legacy path — wraps fireStack for backward compat).
   * @param {Object} card - { name, emoji, effects }
   * @param {Object} player
   */
  function playCard(card, player) {
    // Wrap single card as a 1-card stack for the new resolution path
    var singleStack = {
      damage: 0, defense: 0, healing: 0, statuses: [],
      cards: [card], thrust: 1.0, stackSize: 1, sharedTags: []
    };
    if (card && card.effects) {
      for (var i = 0; i < card.effects.length; i++) {
        var eff = card.effects[i];
        if (eff.type === 'damage') singleStack.damage += eff.value;
        else if (eff.type === 'defense') singleStack.defense += eff.value;
        else if (eff.type === 'hp') singleStack.healing += eff.value;
        else if (eff.type === 'status') singleStack.statuses.push(eff);
      }
    }
    return fireStack(singleStack, player);
  }

  /**
   * Fire a stack (new primary combat resolution).
   * Both player stack and enemy stack resolve simultaneously.
   *
   * @param {Object} stackEffects - From CardStack.computeStackEffects()
   *   { damage, defense, healing, statuses, cards, thrust, stackSize, sharedTags }
   * @param {Object} player - Player state
   * @returns {Object} Resolution result
   */
  function fireStack(stackEffects, player) {
    if ((_phase !== 'stacking' && _phase !== 'selecting') || !_active) return null;
    _setPhase('resolving');

    // ── Player damage (base + stack + thrust) ──
    var playerDmg = (player.str || 0) + stackEffects.damage;

    // Stack size bonus: 2+ cards = +1 per extra card (stacking reward)
    if (stackEffects.stackSize > 1) {
      playerDmg += stackEffects.stackSize - 1;
    }

    // Apply thrust multiplier (already baked into stackEffects.damage,
    // but str bonus should also benefit)
    if (stackEffects.thrust > 1.01) {
      playerDmg = Math.floor(playerDmg * stackEffects.thrust);
    }

    // ── Suit RPS advantage ──
    // Dominant suit of the player's stack vs enemy's suit
    var suitMult = 1.0;
    var suitLabel = '';
    if (typeof SynergyEngine !== 'undefined' && _enemy) {
      var suitAdv = SynergyEngine.computeStackAdvantage(
        stackEffects.cards || [], _enemy
      );
      suitMult = suitAdv.multiplier;
      suitLabel = suitAdv.label;
    }
    if (suitMult !== 1.0) {
      playerDmg = Math.max(1, Math.floor(playerDmg * suitMult));
    }

    // ── Enemy damage (from their committed stack) ──
    var enemyStackFX = (typeof CardStack !== 'undefined')
      ? CardStack.computeEnemyStackEffects()
      : { damage: 0, defense: 0, statuses: [] };
    var enemyDmg = enemyStackFX.damage;
    if (enemyDmg === 0) {
      // Fallback: raw str if no stack (shouldn't happen but safety)
      enemyDmg = Math.max(1, (_enemy.str || 1));
    }

    // ── Player defense from stack ──
    var playerDef = stackEffects.defense;
    var enemyDef = enemyStackFX.defense;

    // Apply defense reductions
    enemyDmg = Math.max(0, enemyDmg - playerDef);
    playerDmg = Math.max(0, playerDmg - enemyDef);

    // ── Healing ──
    if (stackEffects.healing > 0) {
      player.hp = Math.min(player.maxHp, player.hp + stackEffects.healing);
    }

    // ── Advantage modifiers (first round only) ──
    if (_advantage === 'ambush') {
      playerDmg = Math.floor(playerDmg * 1.5);
      enemyDmg = Math.floor(enemyDmg * 0.5);
    } else if (_advantage === 'alert') {
      playerDmg = Math.floor(playerDmg * 0.7);
      enemyDmg = Math.floor(enemyDmg * 1.3);
    }

    // ── Apply damage ──
    _enemy.hp -= playerDmg;
    player.hp -= enemyDmg;

    // Track stats
    SessionStats.inc('cardsPlayed', stackEffects.stackSize);
    SessionStats.inc('damageDealt', playerDmg);
    SessionStats.inc('damageTaken', enemyDmg);
    SessionStats.inc('roundsFought');

    var result = {
      playerDmg: playerDmg,
      enemyDmg: enemyDmg,
      enemyHp: _enemy.hp,
      playerHp: player.hp,
      round: _round,
      stackSize: stackEffects.stackSize,
      thrust: stackEffects.thrust,
      sharedTags: stackEffects.sharedTags,
      suitMult: suitMult,
      suitLabel: suitLabel
    };

    // ── Apply player status effects to enemy ──
    // Cards with { type: 'status', status: 'poisoned', ... } set spriteState
    // so EnemySprites renders visual FX and EnemyIntent reads the condition.
    if (stackEffects.statuses && stackEffects.statuses.length > 0) {
      for (var si = 0; si < stackEffects.statuses.length; si++) {
        var st = stackEffects.statuses[si];
        if (st.status && st.target !== 'player') {
          _enemy.spriteState = st.status;
          // Duration tracking (ticks remaining) — consumed by future status system
          if (st.duration) _enemy.statusDuration = st.duration;
        }
      }
    }

    // ── Apply enemy status effects to player (from enemy stack) ──
    if (enemyStackFX.statuses && enemyStackFX.statuses.length > 0) {
      for (var ei = 0; ei < enemyStackFX.statuses.length; ei++) {
        var est = enemyStackFX.statuses[ei];
        if (est.status && est.target === 'player') {
          // Player status effects handled by Player module in the future
          // For now: log it for the HUD
          result.playerStatus = est.status;
        }
      }
    }

    // ── Auto-derive spriteState from HP when no explicit status ──
    // Keeps the visual layer responsive even without status-inflicting cards.
    if (!_enemy.spriteState || _enemy.spriteState === 'idle') {
      var hpRatio = (_enemy.maxHp > 0) ? (_enemy.hp / _enemy.maxHp) : 1;
      if (hpRatio <= 0.25) {
        _enemy.spriteState = 'enraged';  // Desperate enemies look enraged
      } else if (_enemy.hp <= 0) {
        _enemy.spriteState = 'dead';
      }
    }

    // Transition to post_resolve (timed pause for readability)
    _countdownTimer = 0;
    _setPhase('post_resolve');

    // After first round, advantage resets to neutral
    if (_advantage === 'ambush' || _advantage === 'alert') {
      _advantage = 'neutral';
    }

    return result;
  }

  /**
   * Check if the player has draws remaining this round.
   */
  function canDraw() {
    return _drawsThisRound < _drawsPerRound;
  }

  /**
   * Mark a draw as used this round.
   */
  function useDraw() {
    _drawsThisRound++;
  }

  /**
   * Reset the enemy beat timer (called when player does something).
   * This way player actions "reset the pressure clock".
   */
  function resetEnemyBeat() {
    _enemyBeatTimer = 0;
  }

  function flee(player) {
    _active = false;
    _setPhase('idle');
    if (_onEnd) _onEnd('flee', _enemy);
  }

  function reset() {
    _active = false;
    _enemy = null;
    _phase = 'idle';
    _round = 0;
    _onPhaseChange = null;
  }

  return {
    isActive: isActive,
    getPhase: getPhase,
    getEnemy: getEnemy,
    getRound: getRound,
    getAdvantage: getAdvantage,
    getCountdownMessage: getCountdownMessage,
    start: start,
    update: update,
    playCard: playCard,
    fireStack: fireStack,
    canDraw: canDraw,
    useDraw: useDraw,
    resetEnemyBeat: resetEnemyBeat,
    flee: flee,
    reset: reset,
    // Timing exports (for other modules to sync animations)
    FACING_TIME: FACING_TIME,
    BEAT_DURATION: BEAT_DURATION,
    ENEMY_BEAT_INTERVAL: ENEMY_BEAT_INTERVAL
  };
})();

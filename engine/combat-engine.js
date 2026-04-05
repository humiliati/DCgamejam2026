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

  // Stun gate: true when the enemy is stunned for the current round.
  // Latched at round start (before StatusSystem.tick decays duration)
  // and consumed by both the opening commit in _enterStacking and the
  // mid-round beat gate in update(). Cleared on phase exit.
  var _stunSkipRound = false;

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

    // ── Per-combat energy refill ──
    // Energy is a per-combat tempo budget. Fully refill at combat start
    // so the player always has their full energy pool to spend.
    // Battery is NOT refilled — it's a session-spanning resource.
    if (typeof Player !== 'undefined') {
      Player.restoreEnergy(player.maxEnergy || 5);
    }

    // ── Build this enemy's attack-card draw pile ──
    // EnemyDeck resolves enemy.id → data/enemy-decks.json entry →
    // shuffled pile of EATK-### cards. Enemies without a registered
    // deck fall back to a generic Strike inside EnemyDeck itself.
    if (typeof EnemyDeck !== 'undefined') {
      EnemyDeck.beginCombatFor(enemy);

      // Boss/elite decks can override CardStack greed (stack size target).
      // e.g. Bone Sovereign / The Archivist run greed 3 to feel chunkier.
      var greedOverride = EnemyDeck.getGreedFor(enemy);
      if (greedOverride !== null && typeof CardStack !== 'undefined'
          && typeof CardStack.setEnemyGreed === 'function') {
        CardStack.setEnemyGreed(greedOverride);
      }
    }

    // ── Clear any stale status carryover ──
    // Safety: between combat sessions the same enemy instance could be
    // re-entered (e.g. fled and re-engaged). StatusSystem is combat-
    // scoped, so we reset both sides at the start too, not just end.
    if (typeof StatusSystem !== 'undefined') {
      StatusSystem.clearAll(enemy);
      if (typeof Player !== 'undefined') StatusSystem.clearAll(Player.state());
    }

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

        // Enemy commits a card (via CardStack enemy AI) — stunned
        // enemies stay silent for the full round, not just the opening
        // beat. _stunSkipRound is latched in _enterStacking BEFORE the
        // tick decrements the stun duration, so a 1-turn stun applied
        // last round cleanly gates this entire round's commits.
        if (typeof CardStack !== 'undefined' && !_stunSkipRound
            && !CardStack.isEnemyStackReady()) {
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
   * Also: ticks status effects on both sides (DoT + duration decay) and
   * skips the enemy's opening commit if they're stunned this round.
   */
  function _enterStacking() {
    _round++;
    _enemyBeatTimer = 0;
    _drawsThisRound = 0;

    // ── Tick status effects on both sides ────────────────────────────
    // StatusSystem handles poisoned/burning/bleeding DoT, stun/root CC,
    // and duration decay. One tick per round on the round boundary —
    // the moment the player sees their HP bar pulse matches the moment
    // new cards become committable.
    //
    // IMPORTANT ORDER: we latch the CC flags BEFORE ticking, because
    // tick() decrements duration and a 1-turn stun applied last round
    // would otherwise expire before we ever check it. Latch → tick →
    // commit gate reads the latched value. This gives a stun applied
    // on round N the exact lifetime "skip round N+1".
    var enemyStunnedThisRound = false;
    if (typeof StatusSystem !== 'undefined' && _enemy) {
      enemyStunnedThisRound = StatusSystem.hasCC(_enemy, 'stun');
    }

    var enemyDied = false;
    var playerDied = false;
    if (typeof StatusSystem !== 'undefined') {
      if (_enemy) {
        var eReport = StatusSystem.tick(_enemy);
        if (eReport.damageDealt > 0) {
          SessionStats.inc('damageDealt', eReport.damageDealt);
        }
        // Sync visual state for EnemySprites / EnemyIntent. If the last
        // DoT killed the enemy we leave spriteState alone — the death
        // path below handles it.
        if (_enemy.hp > 0) {
          _enemy.spriteState = StatusSystem.getVisualState(_enemy);
        } else {
          enemyDied = true;
        }
      }
      if (typeof Player !== 'undefined') {
        var pState = Player.state();
        var pReport = StatusSystem.tick(pState);
        if (pReport.damageDealt > 0) {
          SessionStats.inc('damageTaken', pReport.damageDealt);
        }
        if (pState.hp <= 0) playerDied = true;
      }
    }

    // If DoT ticks ended the fight, short-circuit into resolution.
    if (enemyDied) {
      _setPhase('victory');
      _active = false;
      if (_onEnd) _onEnd('victory', _enemy);
      return;
    }
    if (playerDied) {
      _setPhase('defeat');
      _active = false;
      if (_onEnd) _onEnd('defeat', _enemy);
      return;
    }

    // Clear stacks from previous round
    if (typeof CardStack !== 'undefined') {
      CardStack.clear();
      CardStack.clearEnemyStack();
    }

    // ── Enemy opening commit ──
    // Stunned enemies skip their opening commit AND any mid-round beats
    // for this round. _stunSkipRound is consumed by update()'s stacking
    // timer gate below so the enemy stays silent until next round.
    _stunSkipRound = enemyStunnedThisRound;
    if (typeof CardStack !== 'undefined' && !enemyStunnedThisRound) {
      var aiCard = _getEnemyAICard();
      if (aiCard) CardStack.enemyCommitCard(aiCard);
    }

    _setPhase('stacking');
  }

  /**
   * Pull the enemy's next committed card from their deck (data/enemy-
   * decks.json → data/enemy-cards.json). EnemyDeck.drawNextFor handles
   * shuffle/reshuffle and falls back to a suit-aware generic Strike if
   * the enemy has no registered deck — so combat never hard-crashes on
   * missing data.
   */
  function _getEnemyAICard() {
    if (!_enemy) return null;
    if (typeof EnemyDeck !== 'undefined') {
      var card = EnemyDeck.drawNextFor(_enemy);
      if (card) return card;
    }
    // Absolute last-ditch fallback (EnemyDeck module missing entirely)
    var str = _enemy.str || 1;
    return {
      id: 'AI-' + (_enemy.id || 'enemy'),
      name: _enemy.name + ' Strike',
      emoji: _enemy.emoji || '\ud83d\udc80',
      suit: _enemy.suit || 'spade',
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
      damage: 0, defense: 0, healing: 0,
      energyGain: 0, batteryGain: 0, drawCount: 0,
      statuses: [],
      cards: [card], thrust: 1.0, stackSize: 1, sharedTags: []
    };
    if (card && card.effects) {
      for (var i = 0; i < card.effects.length; i++) {
        var eff = card.effects[i];
        if (eff.type === 'damage') singleStack.damage += eff.value;
        else if (eff.type === 'defense') singleStack.defense += eff.value;
        else if (eff.type === 'hp') singleStack.healing += eff.value;
        else if (eff.type === 'energy') singleStack.energyGain += eff.value;
        else if (eff.type === 'battery') singleStack.batteryGain += eff.value;
        else if (eff.type === 'draw') singleStack.drawCount += eff.value;
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

    // ── Mono-suit bonus (was dead code — toast-only) ─────────────────
    // SynergyEngine.checkMonoSuitBonus returns { monoSuit, suit, bonus }
    // where bonus = stackSize - 1 when every card shares a suit. The
    // toast module was rendering the bragging number but nothing was
    // ever adding it to actual damage. A mono-spade 3-stack should hit
    // for stack size bonus (+2) AND mono-suit bonus (+2), not just +2.
    // Track the flat bonus separately so fireStack's result carries it
    // for the HUD/log.
    var monoInfo = { monoSuit: false, suit: null, bonus: 0 };
    if (typeof SynergyEngine !== 'undefined' && stackEffects.cards) {
      monoInfo = SynergyEngine.checkMonoSuitBonus(stackEffects.cards);
      if (monoInfo.monoSuit && monoInfo.bonus > 0) {
        playerDmg += monoInfo.bonus;
      }
    }

    // ── Thrust (single application point) ──
    // CardStack.computeStackEffects now returns RAW card damage. This
    // is the only place thrust is applied to the player side, and it
    // multiplies the sum (str + card damage + stack-size bonus) so all
    // three scale linearly with thrust — the original design intent.
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

    // ── Pay card costs (each card in the stack pays its cost) ──
    var costCards = stackEffects.cards || [];
    for (var ci = 0; ci < costCards.length; ci++) {
      var cc = costCards[ci];
      if (!cc || !cc.cost || cc.cost.type === 'free') continue;
      var cType = cc.cost.type;
      var cVal = cc.cost.value || 0;
      if (cType === 'energy' && cVal > 0)  Player.spendEnergy(cVal);
      if (cType === 'battery' && cVal > 0) Player.spendBattery(cVal);
      if (cType === 'hp' && cVal > 0)      player.hp -= cVal;
    }

    // ── Healing ──
    if (stackEffects.healing > 0) {
      player.hp = Math.min(player.maxHp, player.hp + stackEffects.healing);
    }

    // ── Energy gain ──
    if (stackEffects.energyGain > 0) {
      Player.restoreEnergy(stackEffects.energyGain);
    }

    // ── Battery gain ──
    if (stackEffects.batteryGain > 0) {
      Player.addBattery(stackEffects.batteryGain);
    }

    // ── Draw cards ──
    if (stackEffects.drawCount > 0 && typeof CardAuthority !== 'undefined') {
      for (var di = 0; di < stackEffects.drawCount; di++) {
        CardAuthority.drawWithOverflow(5, 0);
      }
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
      suitLabel: suitLabel,
      monoSuit: monoInfo.monoSuit,
      monoSuitSuit: monoInfo.suit,
      monoSuitBonus: monoInfo.bonus
    };

    // ── Apply player status effects to enemy (real entries, not just
    //    spriteState strings) ──────────────────────────────────────────
    // StatusSystem stores each status as an array entry on _enemy._statuses
    // and ticks them at round boundaries. spriteState is derived from the
    // highest-priority active status so EnemySprites + EnemyIntent stay
    // in sync with the real status stack.
    var pState = (typeof Player !== 'undefined') ? Player.state() : null;
    if (typeof StatusSystem !== 'undefined') {
      if (stackEffects.statuses && stackEffects.statuses.length > 0) {
        StatusSystem.applyBatch(stackEffects.statuses, {
          playerEntity:    pState,
          enemyEntity:     _enemy,
          selfEntity:      pState,      // player cards' 'self' = player
          fallbackEntity:  _enemy
        });
      }

      // Enemy-applied statuses land on the player — the gap the old code
      // flagged with a TODO comment. This is why EATK-005 Spore Burst
      // etc. now actually does what it says on the card.
      if (enemyStackFX.statuses && enemyStackFX.statuses.length > 0) {
        StatusSystem.applyBatch(enemyStackFX.statuses, {
          playerEntity:    pState,
          enemyEntity:     _enemy,
          selfEntity:      _enemy,      // enemy cards' 'self' = enemy
          fallbackEntity:  pState
        });
      }
    }

    // ── Apply 'heal' effects (self-heal on drain cards like EATK-012) ──
    // Cards can carry { type: 'heal', value, target } — we apply it to
    // whichever side committed the card. For enemy cards that means
    // self-heal on _enemy; player drain cards aren't in the DB yet but
    // the symmetric path is here for when they land.
    if (enemyStackFX && enemyStackFX.cards) {
      // CardStack doesn't expose enemy cards via computeEnemyStackEffects,
      // so walk _enemyStack directly through the public accessor.
    }
    if (typeof CardStack !== 'undefined' && CardStack.getEnemyStack) {
      var eStack = CardStack.getEnemyStack();
      for (var hi = 0; hi < eStack.length; hi++) {
        var hCard = eStack[hi];
        if (!hCard || !hCard.effects) continue;
        for (var hj = 0; hj < hCard.effects.length; hj++) {
          var hEff = hCard.effects[hj];
          if (hEff.type === 'heal' && hEff.target === 'self' && _enemy) {
            var healAmt = hEff.value || 0;
            _enemy.hp = Math.min(_enemy.maxHp || _enemy.hp + healAmt, _enemy.hp + healAmt);
          }
        }
      }
    }

    // ── Sync enemy visual state from its active status stack ────────
    // StatusSystem.getVisualState returns the highest-priority status
    // id (stunned > burning > poisoned/bleeding > rooted) or 'idle'.
    // Only override when no explicit state is set by a card effect
    // somewhere else in the pipeline — auto-derived HP states still win
    // for the <25% enraged look.
    if (typeof StatusSystem !== 'undefined' && _enemy) {
      var vs = StatusSystem.getVisualState(_enemy);
      if (vs !== 'idle') _enemy.spriteState = vs;
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

  /**
   * Check if the player can afford a card's resource cost.
   * Used by card-fan and combat-bridge to dim unaffordable cards.
   *
   * @param {Object} card - Card with cost: { type, value }
   * @returns {boolean}
   */
  function canPayCost(card) {
    if (!card || !card.cost || card.cost.type === 'free') return true;
    var cType = card.cost.type;
    var cVal = card.cost.value || 0;
    if (cVal <= 0) return true;
    if (typeof Player === 'undefined') return true;
    var s = Player.state();
    if (cType === 'energy')  return s.energy >= cVal;
    if (cType === 'battery') return s.battery >= cVal;
    if (cType === 'hp')      return s.hp > cVal;   // must survive the cost
    return true;
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
    canPayCost: canPayCost,
    reset: reset,
    // Timing exports (for other modules to sync animations)
    FACING_TIME: FACING_TIME,
    BEAT_DURATION: BEAT_DURATION,
    ENEMY_BEAT_INTERVAL: ENEMY_BEAT_INTERVAL
  };
})();

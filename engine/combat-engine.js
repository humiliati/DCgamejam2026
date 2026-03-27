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

  // ── Timing constants (ms) ─────────────────────────────────────────
  var FACING_TIME = 250;          // Time for turn-to-face (matches MC.ROT_TIME)
  var BEAT_DURATION = 600;        // Time each countdown beat displays
  var POST_RESOLVE_DELAY = 800;   // Pause after damage exchange for readability

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
      beats.push('❗ ' + i18n.t('combat.beat_critical', 'Critical HP — fight carefully'));
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
          // Countdown complete → selecting
          _setPhase('selecting');
          return true;
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
          _setPhase('selecting');
        }
        return true;
      }
      return false;
    }

    return false;
  }

  function _checkPlayerDead() {
    return Player.state().hp <= 0;
  }

  // ── Play a card ───────────────────────────────────────────────────

  /**
   * Play a card (stub — simple damage exchange).
   * @param {Object} card - { name, emoji, effects }
   * @param {Object} player
   */
  function playCard(card, player) {
    if (_phase !== 'selecting' || !_active) return null;
    _setPhase('resolving');
    _round++;

    // Simple damage calc (will be replaced with full STR system)
    var playerDmg = 2 + (player.str || 0);
    var enemyDmg = Math.max(1, (_enemy.str || 1));

    if (card && card.effects) {
      for (var i = 0; i < card.effects.length; i++) {
        var eff = card.effects[i];
        if (eff.type === 'damage') playerDmg += eff.value;
        if (eff.type === 'hp') player.hp = Math.min(player.maxHp, player.hp + eff.value);
      }
    }

    // Advantage modifiers
    if (_advantage === 'ambush') {
      playerDmg = Math.floor(playerDmg * 1.5);
      enemyDmg = Math.floor(enemyDmg * 0.5);
    } else if (_advantage === 'alert') {
      playerDmg = Math.floor(playerDmg * 0.7);
      enemyDmg = Math.floor(enemyDmg * 1.3);
    }

    _enemy.hp -= playerDmg;
    player.hp -= enemyDmg;

    // Track stats
    SessionStats.inc('cardsPlayed');
    SessionStats.inc('damageDealt', playerDmg);
    SessionStats.inc('damageTaken', enemyDmg);
    SessionStats.inc('roundsFought');

    var result = {
      playerDmg: playerDmg,
      enemyDmg: enemyDmg,
      enemyHp: _enemy.hp,
      playerHp: player.hp,
      round: _round
    };

    // Transition to post_resolve (timed pause for readability)
    _countdownTimer = 0;
    _setPhase('post_resolve');

    // After first round, advantage resets to neutral
    if (_advantage === 'ambush' || _advantage === 'alert') {
      _advantage = 'neutral';
    }

    return result;
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
    flee: flee,
    reset: reset,
    // Timing exports (for other modules to sync animations)
    FACING_TIME: FACING_TIME,
    BEAT_DURATION: BEAT_DURATION
  };
})();

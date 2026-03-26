/**
 * CombatEngine — STR (Simultaneous Turn Resolution) stub.
 * Will be fully extracted from EyesOnly's StrCombatEngine during jam (Pass 5).
 */
var CombatEngine = (function () {
  'use strict';

  var _active = false;
  var _enemy = null;
  var _phase = 'idle'; // idle, countdown, selecting, resolving, post_resolve, victory, defeat
  var _round = 0;
  var _advantage = 'neutral';
  var _onEnd = null;

  function isActive()    { return _active; }
  function getPhase()    { return _phase; }
  function getEnemy()    { return _enemy; }
  function getRound()    { return _round; }
  function getAdvantage(){ return _advantage; }

  function start(enemy, player, opts) {
    _active = true;
    _enemy = enemy;
    _phase = 'countdown';
    _round = 0;
    _onEnd = (opts && opts.onEnd) || null;

    // Calculate advantage
    var state = EnemyAI.getAwarenessState(enemy.awareness);
    if (state === EnemyAI.AWARENESS.UNAWARE) {
      _advantage = 'ambush';
    } else if (state === EnemyAI.AWARENESS.ENGAGED) {
      _advantage = 'neutral';
    } else {
      _advantage = 'neutral';
    }

    // Skip countdown for now, go straight to selecting
    setTimeout(function () { _phase = 'selecting'; }, 800);
  }

  /**
   * Play a card (stub — simple damage exchange).
   * @param {Object} card - { name, emoji, effects }
   * @param {Object} player
   */
  function playCard(card, player) {
    if (_phase !== 'selecting' || !_active) return null;
    _phase = 'resolving';
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
    }

    _enemy.hp -= playerDmg;
    player.hp -= enemyDmg;

    var result = {
      playerDmg: playerDmg,
      enemyDmg: enemyDmg,
      enemyHp: _enemy.hp,
      playerHp: player.hp
    };

    // Check end conditions
    setTimeout(function () {
      if (_enemy.hp <= 0) {
        _phase = 'victory';
        _active = false;
        if (_onEnd) _onEnd('victory', _enemy);
      } else if (player.hp <= 0) {
        _phase = 'defeat';
        _active = false;
        if (_onEnd) _onEnd('defeat', _enemy);
      } else {
        _phase = 'selecting';
      }
    }, 600);

    return result;
  }

  function flee(player) {
    _active = false;
    _phase = 'idle';
    if (_onEnd) _onEnd('flee', _enemy);
  }

  function reset() {
    _active = false;
    _enemy = null;
    _phase = 'idle';
    _round = 0;
  }

  return {
    isActive: isActive,
    getPhase: getPhase,
    getEnemy: getEnemy,
    getRound: getRound,
    getAdvantage: getAdvantage,
    start: start,
    playCard: playCard,
    flee: flee,
    reset: reset
  };
})();

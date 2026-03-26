/**
 * CombatBridge — bridges combat, card, chest, and game-over systems.
 *
 * Translates high-level events (enemy proximity, card clicks,
 * chest opens) into the correct sequence of CombatEngine,
 * CardSystem, LootTables, and HUD calls.
 *
 * Does NOT own:
 *   - Combat math (see CombatEngine)
 *   - Card deck state (see CardSystem)
 *   - Loot generation (see LootTables)
 *   - Enemy AI (see EnemyAI)
 *   - Player stats (see Player)
 */
var CombatBridge = (function () {
  'use strict';

  var MC = MovementController;

  // ── Callbacks (wired by Game orchestrator) ─────────────────────────
  var _onGameOver = null;

  function init(cbs) {
    cbs = cbs || {};
    _onGameOver = cbs.onGameOver || null;
  }

  // ── Combat ─────────────────────────────────────────────────────────

  /**
   * Start combat with an enemy.
   * Cancels queued movement, draws a fresh hand, and enters
   * CombatEngine's selecting phase.
   *
   * @param {Object} enemy - Enemy entity from EnemyAI
   */
  function startCombat(enemy) {
    if (CombatEngine.isActive()) return;

    MC.cancelQueued();

    CardSystem.drawHand();
    HUD.updateCards(CardSystem.getHand());

    var player = Player.state();

    CombatEngine.start(enemy, player, {
      onEnd: function (result, enemy) {
        HUD.hideCombat();
        HUD.updatePlayer(player);
        if (result === 'victory') {
          FloorManager.removeEnemy(enemy);
          HUD.showCombatLog(enemy.name + ' defeated!');
          setTimeout(function () { HUD.hideCombat(); }, 1500);
        } else if (result === 'defeat') {
          _gameOver();
        }
      }
    });

    HUD.showCombatLog('Combat! ' + CombatEngine.getAdvantage() + ' — Pick a card (1-5)');
  }

  /**
   * Play a card from hand during combat.
   * @param {number} index - Hand slot (0-4)
   */
  function playCard(index) {
    if (!CombatEngine.isActive() || CombatEngine.getPhase() !== 'selecting') return;

    var card = CardSystem.playFromHand(index);
    if (!card) return;

    var player = Player.state();
    var result = CombatEngine.playCard(card, player);
    if (!result) return;

    HUD.updateCards(CardSystem.getHand());
    HUD.updatePlayer(player);
    HUD.showCombatLog(
      card.emoji + ' ' + card.name + ' → ' + result.playerDmg + ' dmg! ' +
      'Enemy hits for ' + result.enemyDmg + '. ' +
      'Enemy HP: ' + result.enemyHp
    );
  }

  // ── Chests ─────────────────────────────────────────────────────────

  /**
   * Open a chest at a grid position.
   * Replaces tile with EMPTY, generates loot, updates HUD.
   *
   * @param {number} cx - Chest grid X
   * @param {number} cy - Chest grid Y
   */
  function openChest(cx, cy) {
    var floorData = FloorManager.getFloorData();
    var floorNum = FloorManager.getFloorNum();
    var player = Player.state();

    floorData.grid[cy][cx] = TILES.EMPTY;

    var loot = LootTables.generateDrop('standard', floorNum);
    if (loot.type === 'card' && loot.card) {
      CardSystem.addCard(loot.card);
      HUD.showCombatLog('Found card: ' + loot.card.emoji + ' ' + loot.card.name);
    } else {
      Player.addCurrency(loot.amount);
      HUD.showCombatLog('Found ' + loot.amount + ' gold!');
    }

    setTimeout(function () { HUD.hideCombat(); }, 1500);
    AudioSystem.play('chest_open');
  }

  // ── Game over ──────────────────────────────────────────────────────

  function _gameOver() {
    if (_onGameOver) _onGameOver();
    var floorNum = FloorManager.getFloorNum();
    HUD.showFloorTransition('YOU DIED — Floor ' + floorNum + ' — Refresh to retry');
  }

  // ── Enemy proximity check ──────────────────────────────────────────

  /**
   * Check if any enemy is adjacent and engaged.
   * Called from movement finish and game tick.
   *
   * @param {number} px - Player grid X
   * @param {number} py - Player grid Y
   */
  function checkEnemyProximity(px, py) {
    var enemies = FloorManager.getEnemies();
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      var dist = Math.abs(e.x - px) + Math.abs(e.y - py);
      if (dist <= 1 && EnemyAI.getAwarenessState(e.awareness) === EnemyAI.AWARENESS.ENGAGED) {
        startCombat(e);
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any enemy is adjacent and fully aware (> 100).
   * Used by the game tick for enemy-initiated combat.
   *
   * @param {number} px
   * @param {number} py
   */
  function checkEnemyAggro(px, py) {
    var enemies = FloorManager.getEnemies();
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      var dist = Math.abs(e.x - px) + Math.abs(e.y - py);
      if (dist <= 1 && e.awareness > 100) {
        startCombat(e);
        return true;
      }
    }
    return false;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init,
    startCombat: startCombat,
    playCard: playCard,
    openChest: openChest,
    checkEnemyProximity: checkEnemyProximity,
    checkEnemyAggro: checkEnemyAggro
  };
})();

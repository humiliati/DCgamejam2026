/**
 * CombatBridge — bridges combat, card, chest, and game-over systems.
 *
 * Translates high-level events (enemy proximity, card clicks,
 * chest opens) into the correct sequence of CombatEngine,
 * CardSystem, LootTables, and HUD calls.
 *
 * Combat init sequence (adapted from EyesOnly StrCombatEngine):
 *
 *   1. Enemy detected (proximity or aggro)
 *   2. Cancel queued movement
 *   3. Calculate direction to enemy → queue animated turn
 *   4. Wait for turn to complete (FACING_TIME)
 *   5. Start CombatEngine → 'countdown' phase (3-beat narration)
 *   6. CombatEngine auto-advances → 'selecting' phase
 *   7. Card fan opens (hook — CardFan.open() when built)
 *   8. Player picks a card → 'resolving' → 'post_resolve' → loop
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

  // ── Turn-to-face state ────────────────────────────────────────────
  var _pendingEnemy = null;    // Enemy waiting for turn animation to finish
  var _facingTimer = 0;        // ms remaining on facing animation
  var _lastBeatMsg = '';       // Track last displayed countdown beat

  // ── Entry position (for non-lethal defeat repositioning) ────────
  var _entryPos = null;        // { x, y } player position when combat started

  // ── Ambush hint (determined BEFORE turning player) ─────────────
  var _pendingAmbushHint = null;  // 'player_ambushed' | 'enemy_ambushed' | null

  function init(cbs) {
    cbs = cbs || {};
    _onGameOver = cbs.onGameOver || null;
    _pendingEnemy = null;
    _facingTimer = 0;
    _lastBeatMsg = '';
    _entryPos = null;
  }

  // ── Face toward enemy ─────────────────────────────────────────────

  /**
   * Calculate the cardinal direction from player to enemy.
   * Returns direction index: 0=EAST, 1=SOUTH, 2=WEST, 3=NORTH.
   */
  function _directionToEnemy(enemy) {
    var p = Player.getPos();
    var dx = enemy.x - p.x;
    var dy = enemy.y - p.y;

    // Pick dominant axis (Manhattan adjacent, so one will be 0)
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? MC.DIR_EAST : MC.DIR_WEST;
    }
    return dy > 0 ? MC.DIR_SOUTH : MC.DIR_NORTH;
  }

  /**
   * Check if the player is already facing the given direction.
   */
  function _isAlreadyFacing(dir) {
    return Player.getDir() === dir;
  }

  // ── Combat start ──────────────────────────────────────────────────

  /**
   * Start combat with an enemy.
   *
   * Sequence:
   *   1. Cancel queued movement
   *   2. Calculate direction to enemy
   *   3. If not already facing → queue animated turn, wait for it
   *   4. Start CombatEngine (handles countdown → selecting flow)
   *
   * @param {Object} enemy - Enemy entity from EnemyAI
   */
  function startCombat(enemy) {
    if (CombatEngine.isActive() || _pendingEnemy) return;

    // Interrupt any open dialog (player got ambushed while reading a sign, etc.)
    if (typeof DialogBox !== 'undefined' && DialogBox.isOpen()) {
      DialogBox.interrupt();
    }

    // Snapshot player position for non-lethal repositioning
    var p = Player.getPos();
    _entryPos = { x: p.x, y: p.y };

    MC.cancelAll();

    var dirToEnemy = _directionToEnemy(enemy);
    var wasAlreadyFacing = _isAlreadyFacing(dirToEnemy);

    // Determine ambush state BEFORE turning:
    // If player had to be turned → player was ambushed (enemy behind)
    // If enemy is UNAWARE → enemy was ambushed (player snuck up)
    if (!wasAlreadyFacing) {
      _pendingAmbushHint = 'player_ambushed';  // enemy snuck up on player
    } else if (EnemyAI.getAwarenessState(enemy.awareness) === EnemyAI.AWARENESS.UNAWARE) {
      _pendingAmbushHint = 'enemy_ambushed';   // player snuck up on enemy
    } else {
      _pendingAmbushHint = null;               // mutual engagement
    }

    if (wasAlreadyFacing) {
      // Already facing — start immediately
      _beginCombat(enemy);
    } else {
      // Queue turn, then start combat after it completes
      MC.startTurn(dirToEnemy);
      Player.setDir(dirToEnemy);
      _pendingEnemy = enemy;
      _facingTimer = CombatEngine.FACING_TIME;
    }
  }

  /**
   * Called each frame to advance the facing timer.
   * When the turn animation finishes, triggers actual combat start.
   */
  function update(dt) {
    if (_pendingEnemy && _facingTimer > 0) {
      _facingTimer -= dt;
      if (_facingTimer <= 0) {
        var enemy = _pendingEnemy;
        _pendingEnemy = null;
        _facingTimer = 0;
        _beginCombat(enemy);
      }
    }

    // Tick the CombatEngine (drives countdown → selecting auto-advance)
    if (CombatEngine.isActive()) {
      CombatEngine.update(dt);

      // Update HUD with countdown beat messages as they change
      if (CombatEngine.getPhase() === 'countdown') {
        var beatMsg = CombatEngine.getCountdownMessage();
        if (beatMsg && beatMsg !== _lastBeatMsg) {
          _lastBeatMsg = beatMsg;
          HUD.showCombatLog(beatMsg);
        }
      }
    }
  }

  /**
   * Actually initialize combat after the player is facing the enemy.
   */
  function _beginCombat(enemy) {
    // Draw a fresh hand
    CardSystem.drawHand();
    HUD.updateCards(CardSystem.getHand());

    var player = Player.state();

    // When enemy is ambushed, make them turn to face the player
    if (_pendingAmbushHint === 'enemy_ambushed') {
      var p = Player.getPos();
      EnemyAI.faceToward(enemy, p);
    }

    // Start the engine — pass ambush hint so advantage is set correctly
    // (awareness alone can't tell us who was facing whom at the moment
    // of engagement because we've already turned the player)
    CombatEngine.start(enemy, player, {
      onEnd: _onCombatEnd,
      onPhaseChange: _onPhaseChange,
      ambushHint: _pendingAmbushHint
    });

    // Clear the hint after use
    _pendingAmbushHint = null;

    // Show initial combat log with enemy info
    HUD.showCombatLog(
      '⚔️ ' + enemy.emoji + ' ' + enemy.name +
      ' — ' + CombatEngine.getAdvantage().toUpperCase()
    );
    HUD.setAdvantage(CombatEngine.getAdvantage().toUpperCase());

    // Track stats
    SessionStats.inc('roundsFought', 0); // init entry, actual rounds counted on card play
  }

  // ── Phase change handler ──────────────────────────────────────────

  function _onPhaseChange(newPhase, oldPhase) {
    if (newPhase === 'countdown') {
      // Update HUD with current beat message
      var msg = CombatEngine.getCountdownMessage();
      if (msg) HUD.showCombatLog(msg);
    }

    if (newPhase === 'selecting') {
      // Countdown complete — show "pick a card" prompt
      HUD.showCombatLog(
        CombatEngine.getEnemy().emoji + ' ' +
        CombatEngine.getEnemy().name +
        ' — ' + i18n.t('combat.pick_card', 'Pick a card (1-5)')
      );

      // Open the card fan for pointer-based card selection
      if (typeof CardFan !== 'undefined') {
        CardFan.open(CardSystem.getHand(), {
          onPlay: function (idx) { playCard(idx); }
        });
      }
    }

    if (newPhase === 'post_resolve') {
      // Brief pause after damage — log already updated by playCard
    }

    if (newPhase === 'victory' || newPhase === 'defeat') {
      if (typeof CardFan !== 'undefined' && CardFan.isOpen()) {
        CardFan.close();
      }
    }
  }

  // ── Combat end handler ────────────────────────────────────────────

  function _onCombatEnd(result, enemy) {
    HUD.hideCombat();
    HUD.setAdvantage('');
    HUD.updatePlayer(Player.state());

    if (result === 'victory') {
      // ── Victory: remove enemy, drop corpse tile, award loot ──
      var corpseX = enemy.x;
      var corpseY = enemy.y;
      FloorManager.removeEnemy(enemy);
      SessionStats.inc('enemiesDefeated');

      // Place a CORPSE tile where the enemy fell (if tile is empty)
      var fd = FloorManager.getFloorData();
      if (fd && fd.grid[corpseY] &&
          fd.grid[corpseY][corpseX] === TILES.EMPTY) {
        fd.grid[corpseY][corpseX] = TILES.CORPSE;
      }

      HUD.showCombatLog(
        enemy.emoji + ' ' + enemy.name + ' ' +
        i18n.t('combat.victory', 'defeated!')
      );
      setTimeout(function () { HUD.hideCombat(); }, 1500);

    } else if (result === 'defeat') {
      // ── Defeat: branch on nonLethal flag ──
      if (enemy.nonLethal) {
        // Trainer NPC — restore HP, return to entry position
        Player.fullRestore();
        if (_entryPos) {
          Player.setPos(_entryPos.x, _entryPos.y);
          MC.setPosition(_entryPos.x, _entryPos.y, Player.getDir());
        }
        HUD.updatePlayer(Player.state());
        HUD.showCombatLog(
          enemy.emoji + ' ' +
          i18n.t('combat.trainer_defeat', 'You need more practice...')
        );
        setTimeout(function () { HUD.hideCombat(); }, 2000);
      } else {
        // Lethal defeat — inventory scatter prep, game over
        var dropped = Player.onDeath();
        // TODO: Pass dropped to FloorManager for loot scatter tiles
        // FloorManager.scatterLoot(dropped, Player.getPos());
        _gameOver();
      }

    } else if (result === 'flee') {
      // ── Flee: apply immunity, step player back ──
      EnemyAI.applyFleeImmunity(enemy);

      // Step back one tile (opposite of facing direction)
      var dir = Player.getDir();
      var backDir = (dir + 2) % 4;
      var pos = Player.getPos();
      var nx = pos.x + MC.DX[backDir];
      var ny = pos.y + MC.DY[backDir];

      // Only step back if the tile is walkable
      var floorData = FloorManager.getFloorData();
      if (nx >= 0 && nx < floorData.gridW &&
          ny >= 0 && ny < floorData.gridH &&
          TILES.isWalkable(floorData.grid[ny][nx])) {
        MC.startMove(backDir);
      }

      SessionStats.inc('timesFled');
      HUD.showCombatLog(i18n.t('combat.fled', 'Escaped!'));
      setTimeout(function () { HUD.hideCombat(); }, 1000);
    }

    _entryPos = null;
  }

  // ── Play card ─────────────────────────────────────────────────────

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
      CombatEngine.getEnemy().emoji + ' hits for ' + result.enemyDmg + '. ' +
      'Enemy HP: ' + Math.max(0, result.enemyHp)
    );
  }

  // ── Flee ─────────────────────────────────────────────────────────

  /**
   * Attempt to flee combat. Only allowed during 'selecting' phase.
   * Costs 1 energy. Fails silently if not enough energy.
   */
  function flee() {
    if (!CombatEngine.isActive()) return;
    if (CombatEngine.getPhase() !== 'selecting') return;

    // Flee costs 1 energy — can't flee if exhausted
    if (!Player.spendEnergy(1)) {
      HUD.showCombatLog(i18n.t('combat.flee_no_energy', 'Not enough energy to flee!'));
      return;
    }

    CombatEngine.flee(Player.state());
  }

  // ── Chests ────────────────────────────────────────────────────────

  function openChest(cx, cy) {
    var floorData = FloorManager.getFloorData();
    var floorNum = FloorManager.getFloorNum();

    floorData.grid[cy][cx] = TILES.EMPTY;
    SessionStats.inc('chestsOpened');

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

  // ── Game over ─────────────────────────────────────────────────────

  function _gameOver() {
    if (_onGameOver) _onGameOver();
  }

  // ── Enemy detection ───────────────────────────────────────────────

  /**
   * Check if any enemy is adjacent and engaged.
   * Called from movement finish and game tick.
   */
  function checkEnemyProximity(px, py) {
    if (CombatEngine.isActive() || _pendingEnemy) return false;
    var enemies = FloorManager.getEnemies();
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!EnemyAI.canEngage(e)) continue;
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
   */
  function checkEnemyAggro(px, py) {
    if (CombatEngine.isActive() || _pendingEnemy) return false;
    var enemies = FloorManager.getEnemies();
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!EnemyAI.canEngage(e)) continue;
      var dist = Math.abs(e.x - px) + Math.abs(e.y - py);
      if (dist <= 1 && e.awareness > 100) {
        startCombat(e);
        return true;
      }
    }
    return false;
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    init: init,
    update: update,
    startCombat: startCombat,
    playCard: playCard,
    flee: flee,
    openChest: openChest,
    checkEnemyProximity: checkEnemyProximity,
    checkEnemyAggro: checkEnemyAggro
  };
})();

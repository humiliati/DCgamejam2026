/**
 * CombatBridge — bridges combat, card, chest, and game-over systems.
 *
 * Translates high-level events (enemy proximity, card clicks,
 * chest opens) into the correct sequence of CombatEngine,
 * CardAuthority, CardTransfer, LootTables, and HUD calls.
 *
 * S0.3 REWIRE: CardSystem.getHand/drawHand/playFromHand/etc replaced
 * with CardAuthority equivalents. Player.addCurrency → CardAuthority.addGold.
 * Chest loot uses CardTransfer.lootToBackup/lootGold.
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

  // Lunge peak fraction — when the zoom hits max (matches CombatFX curve)
  var ENEMY_LUNGE_PEAK_PCT = 0.35;

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
    MC.resetRepeat();

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
    // Interrupt any active tooltip dialogue
    if (typeof StatusBar !== 'undefined' && StatusBar.clearDialogue) {
      StatusBar.clearDialogue();
    }

    // ── Combat start audio (Pass 7) ──
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('enemy-alert', { volume: 0.6 });
      AudioSystem.preloadCategory('combat');
      AudioSystem.preloadCategory('card');
    }

    // Draw a fresh hand
    CardAuthority.drawHand();
    HUD.updateCards(CardAuthority.getHand());
    if (typeof Toast !== 'undefined') {
      var _ch = CardAuthority.getHand();
      var _names = [];
      for (var ci = 0; ci < _ch.length; ci++) _names.push(_ch[ci].emoji || '\uD83C\uDCA0');
      Toast.show('\uD83C\uDCA0 Combat hand: ' + _names.join(' '), 'dim');
    }

    // NCH widget → combat mode (shrink capsule)
    if (typeof NchWidget !== 'undefined') NchWidget.enterCombat();

    // Start combat tracking for end-of-combat report
    if (typeof CombatReport !== 'undefined') CombatReport.beginTracking(enemy);

    var player = Player.state();

    // When enemy is ambushed, make them turn to face the player
    if (_pendingAmbushHint === 'enemy_ambushed') {
      var p = Player.getPos();
      EnemyAI.faceToward(enemy, p);
    }

    // Start the engine — pass ambush hint so advantage is set correctly
    // (awareness alone can't tell us who was facing whom at the moment
    // of engagement because we've already turned the player)
    // Set enemy stack greed (how many cards they accumulate before firing)
    var greed = 2; // Default: 2-card combos
    if (enemy.isBoss) greed = 4;
    else if (enemy.isElite) greed = 3;
    else if (enemy.dex >= 5) greed = 1; // Quick enemies fire immediately
    if (enemy.stackGreed) greed = enemy.stackGreed; // Explicit override
    if (typeof CardStack !== 'undefined') {
      CardStack.setEnemyGreed(greed);
    }

    // Set enemy type for CombatFX timing overrides
    // Map enemy properties to timing category: boss > elite > quick > standard
    if (typeof CombatFX !== 'undefined') {
      var fxType = 'standard';
      if (enemy.isBoss) fxType = 'boss';
      else if (enemy.isElite) fxType = 'elite';
      else if (enemy.dex >= 5) fxType = 'quick'; // High-dex enemies feel snappy
      CombatFX.setEnemyType(fxType);
    }

    // ── Cinematic letterbox (combat_lock) ──
    // Persistent bars + slight FOV zoom — lockInput false so cards stay playable.
    if (typeof CinematicCamera !== 'undefined') {
      var pp = Player.getPos();
      var focusAngle = Math.atan2(enemy.y - pp.y, enemy.x - pp.x);
      CinematicCamera.start('combat_lock', { focusAngle: focusAngle });
    }

    CombatEngine.start(enemy, player, {
      onEnd: _onCombatEnd,
      onPhaseChange: _onPhaseChange,
      ambushHint: _pendingAmbushHint
    });

    // ── Enemy intent telegraph (Pass 8) ──
    if (typeof EnemyIntent !== 'undefined') {
      EnemyIntent.beginCombat(enemy, greed);
      // If ambushed, fire initial expression event
      if (_pendingAmbushHint === 'enemy_ambushed') {
        EnemyIntent.onCombatEvent('ambushed');
      }
    }

    // Clear the hint after use
    _pendingAmbushHint = null;

    // Show initial combat log with enemy info
    HUD.showCombatLog(
      '⚔️ ' + enemy.emoji + ' ' + enemy.name +
      ' - ' + CombatEngine.getAdvantage().toUpperCase()
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

    if (newPhase === 'stacking') {
      // Stacking phase — player builds card stacks, enemy accumulates
      var enemy = CombatEngine.getEnemy();

      // ── Intent telegraph: reset for new round (Pass 8) ──
      if (typeof EnemyIntent !== 'undefined') {
        EnemyIntent.onCombatEvent('round_end');
      }

      // Per-turn draw from backup deck (Gone Rogue overflow cascade)
      if (CombatEngine.canDraw()) {
        var maxH = CardAuthority.MAX_HAND;
        var drawResult = CardAuthority.drawWithOverflow(maxH, 0);
        CombatEngine.useDraw();
        if (drawResult.drawn) {
          HUD.showCombatLog('\uD83D\uDCE5 Drew ' + drawResult.drawn.emoji + ' ' + drawResult.drawn.name);
          if (drawResult.bumped && !drawResult.incinerated) {
            if (typeof Toast !== 'undefined') {
              Toast.show((drawResult.bumped.name || 'Card') + ' \u2192 deck (hand full)', 'info');
            }
          }
          if (drawResult.incinerated) {
            if (typeof Toast !== 'undefined') {
              Toast.show('\uD83D\uDD25 ' + (drawResult.incinerated.name || 'Card') + ' destroyed (overflow)', 'warning');
            }
          }
        }
      }

      HUD.updateCards(CardAuthority.getHand());
      HUD.showCombatLog(
        enemy.emoji + ' ' + enemy.name +
        ' - ' + i18n.t('combat.stack_cards', 'Stack cards, then fire!')
      );

      // Open the card fan for stacking interaction
      if (typeof CardFan !== 'undefined') {
        CardFan.open(CardAuthority.getHand(), {
          onPlay: function (idx) { _onCardStackOrPlay(idx); }
        });
      }

      // Reset CardStack for this round
      if (typeof CardStack !== 'undefined') CardStack.clear();
    }

    // Legacy compat: treat 'selecting' same as 'stacking'
    if (newPhase === 'selecting') {
      // Should not normally reach here in new flow, but safety
      if (typeof CardFan !== 'undefined' && !CardFan.isOpen()) {
        CardFan.open(CardAuthority.getHand(), {
          onPlay: function (idx) { _onCardStackOrPlay(idx); }
        });
      }
    }

    // Enemy committed another card to their stack
    if (newPhase === 'enemy_commit') {
      var eStack = (typeof CardStack !== 'undefined') ? CardStack.getEnemyStack() : [];
      var enemy = CombatEngine.getEnemy();
      HUD.showCombatLog(
        enemy.emoji + ' ' +
        i18n.t('combat.enemy_stacking', 'building combo...') +
        ' (' + eStack.length + '/' +
        ((typeof CardStack !== 'undefined') ? CardStack.getEnemyGreed() : '?') + ')'
      );

      // ── Intent telegraph update (Pass 8) ──
      if (typeof EnemyIntent !== 'undefined') {
        EnemyIntent.onEnemyCommit(eStack);
      }
    }

    // Enemy stack is full — they're about to fire
    if (newPhase === 'enemy_ready') {
      var enemy = CombatEngine.getEnemy();
      HUD.showCombatLog(
        '⚠️ ' + enemy.emoji + ' ' +
        i18n.t('combat.enemy_ready', 'ready to attack!')
      );

      // ── Intent telegraph: charged state (Pass 8) ──
      if (typeof EnemyIntent !== 'undefined') {
        EnemyIntent.onEnemyReady();
      }
    }

    if (newPhase === 'post_resolve') {
      // Brief pause after damage — log already updated by playCard
      // ── Intent telegraph: damage event + round end (Pass 8) ──
      if (typeof EnemyIntent !== 'undefined') {
        EnemyIntent.onCombatEvent('took_damage');
      }
    }

    if (newPhase === 'victory' || newPhase === 'defeat') {
      if (typeof CardFan !== 'undefined' && CardFan.isOpen()) {
        CardFan.close();
      }
    }
  }

  // ── Combat end handler ────────────────────────────────────────────

  function _onCombatEnd(result, enemy) {
    // ── Close cinematic letterbox ──
    if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isActive()) {
      CinematicCamera.close();
    }

    HUD.hideCombat();
    HUD.setAdvantage('');
    HUD.updatePlayer(Player.state());

    // ── Clear intent telegraph (Pass 8) ──
    if (typeof EnemyIntent !== 'undefined') EnemyIntent.endCombat();

    // End combat tracking
    if (typeof CombatReport !== 'undefined') CombatReport.endTracking(result);

    // NCH widget → exploration mode (restore capsule)
    if (typeof NchWidget !== 'undefined') NchWidget.exitCombat();

    if (result === 'victory') {
      // ── Victory: remove enemy, start death anim, drop corpse tile, award loot ──
      var corpseX = enemy.x;
      var corpseY = enemy.y;
      FloorManager.removeEnemy(enemy);
      SessionStats.inc('enemiesDefeated');

      // Start death animation (origami fold or poof)
      if (typeof DeathAnim !== 'undefined') {
        // Project enemy grid position → screen coordinates
        // Uses camera math matching the raycaster's sprite projection.
        var canvas = document.getElementById('view-canvas');
        var cw = canvas ? canvas.width : 640;
        var ch = canvas ? canvas.height : 400;
        var sx = cw / 2;  // fallback: screen center
        var sy = ch * 0.45;
        var renderPos = MC.getRenderPos ? MC.getRenderPos() : null;
        if (renderPos) {
          var edx = (corpseX + 0.5) - renderPos.x;
          var edy = (corpseY + 0.5) - renderPos.y;
          var eDist = Math.sqrt(edx * edx + edy * edy);
          if (eDist > 0.3) {
            var pAngle = renderPos.angle + (Player.state().lookOffset || 0);
            var eAngle = Math.atan2(edy, edx) - pAngle;
            while (eAngle > Math.PI) eAngle -= 2 * Math.PI;
            while (eAngle < -Math.PI) eAngle += 2 * Math.PI;
            var fov = Math.PI / 3;
            var halfFov = fov / 2;
            sx = Math.floor(cw / 2 + (eAngle / halfFov) * (cw / 2));
            sy = ch / 2;  // eye-level center
          }
        }
        var deathEnemy = { emoji: enemy.emoji, type: enemy.type || '', tags: enemy.tags || [] };

        DeathAnim.start(deathEnemy, sx, sy, 0.6, function (e, deathType) {
          // Place corpse tile after fold animation completes
          if (deathType === 'fold') {
            var fd = FloorManager.getFloorData();
            if (fd && fd.grid[corpseY] &&
                fd.grid[corpseY][corpseX] === TILES.EMPTY) {
              fd.grid[corpseY][corpseX] = TILES.CORPSE;
            }
            // Register in CorpseRegistry with full enemy data
            var flId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.3.1';
            if (typeof CorpseRegistry !== 'undefined') {
              CorpseRegistry.register(corpseX, corpseY, flId, enemy);
            }
          }
          // Poof enemies leave no corpse tile (and no registry entry)
        });
      } else {
        // Fallback: place corpse immediately if no DeathAnim
        var fd = FloorManager.getFloorData();
        if (fd && fd.grid[corpseY] &&
            fd.grid[corpseY][corpseX] === TILES.EMPTY) {
          fd.grid[corpseY][corpseX] = TILES.CORPSE;
        }
        var flId = FloorManager.getCurrentFloorId ? FloorManager.getCurrentFloorId() : '1.3.1';
        if (typeof CorpseRegistry !== 'undefined') {
          CorpseRegistry.register(corpseX, corpseY, flId, enemy);
        }
      }

      // Set enemy sprite state to dead (for any remaining render frames)
      enemy.spriteState = 'dead';

      HUD.showCombatLog(
        enemy.emoji + ' ' + enemy.name + ' ' +
        i18n.t('combat.victory', 'defeated!')
      );

      // Calculate XP reward (simple formula: base 5 + depth * 2 + elite bonus)
      var depth = (typeof FloorManager !== 'undefined') ? FloorManager.getFloorDepth() : 1;
      var xpEarned = 5 + depth * 2 + (enemy.isElite ? 10 : 0);

      // Show combat report after brief delay
      setTimeout(function () {
        HUD.hideCombat();
        if (typeof CombatReport !== 'undefined') {
          CombatReport.show({
            xpEarned: xpEarned,
            onDismiss: function () {
              // Feed log the victory
              if (typeof DebriefFeed !== 'undefined') {
                DebriefFeed.logEvent(enemy.emoji + ' defeated! +' + xpEarned + 'XP', 'loot');
              }
            }
          });
        }
      }, 800);

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

        // §10: Death-shift — shift this group's hero day before game over
        // POST-JAM: Convert combat death to rescue (like HazardSystem) so
        // death-shift is meaningful. For now, game-over ends the run.
        if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.onPlayerDeath) {
          DungeonSchedule.onPlayerDeath(FloorManager.getCurrentFloorId());
        }

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
      setTimeout(function () {
        HUD.hideCombat();
        if (typeof CombatReport !== 'undefined') {
          CombatReport.show({ xpEarned: 0 });
        }
      }, 1000);
    }

    _entryPos = null;
  }

  // ── Stack-based card interaction ──────────────────────────────────

  /**
   * Handle a card tap/drop during stacking phase.
   * If CardStack is available:
   *   - If stack is empty, push card as first stack entry
   *   - If card can stack (shared tags), add to stack
   *   - If card can't stack, start a new stack with just this card
   * Then reset the enemy beat timer (player is active).
   *
   * @param {number} index - Hand slot index
   */
  function _onCardStackOrPlay(index) {
    var hand = CardAuthority.getHand();
    if (index < 0 || index >= hand.length) return;
    var card = hand[index];

    if (typeof CardStack !== 'undefined') {
      if (CardStack.isInStack(index)) {
        // Tapping a stacked card un-stacks it
        CardStack.removeByIndex(index);
      } else if (CardStack.canStack(card)) {
        CardStack.pushCard(card, index);
      } else {
        // Doesn't match current stack — start fresh with this card
        CardStack.clear();
        CardStack.pushCard(card, index);
      }
      // Reset enemy pressure timer (player is doing things)
      CombatEngine.resetEnemyBeat();

      // Update HUD with stack preview
      var stackCards = CardStack.getCards();
      var tags = CardStack.getSharedTags();
      if (stackCards.length > 1) {
        var emojis = '';
        for (var i = 0; i < stackCards.length; i++) emojis += stackCards[i].emoji;
        HUD.showCombatLog(
          emojis + ' ' +
          i18n.t('combat.stack_preview', 'Combo') +
          (tags.length > 0 ? ' [' + tags.join('+') + ']' : '') +
          ' - ' + i18n.t('combat.thrust_to_fire', 'thrust to fire!')
        );
      }
    } else {
      // No CardStack module — fall through to legacy single-card play
      playCard(index);
    }
  }

  /**
   * Fire the current player stack (called by thrust gesture or confirm button).
   * Resolves both player and enemy stacks simultaneously.
   *
   * @param {number} [thrustMultiplier=1.0] - From CardStack.gestureEnd()
   */
  function fireStack(thrustMultiplier) {
    if (!CombatEngine.isActive()) return;
    var phase = CombatEngine.getPhase();
    if (phase !== 'stacking' && phase !== 'selecting') return;

    if (typeof CardStack === 'undefined' || CardStack.isEmpty()) return;

    // Compute thrust (default to baseline if not provided)
    if (thrustMultiplier === undefined) {
      thrustMultiplier = (typeof CardStack !== 'undefined') ? CardStack.getThrust() : 1.0;
    }

    // Compute aggregated stack effects
    var stackEffects = CardStack.computeStackEffects();

    var player = Player.state();
    var result = CombatEngine.fireStack(stackEffects, player);
    if (!result) return;

    // Resolve card persistence — remove expendable, keep persistent
    var partition = CardStack.partitionAfterFire();
    CardAuthority.playStack(CardStack.getStack());

    // Close fan during resolution
    if (typeof CardFan !== 'undefined' && CardFan.isOpen()) {
      CardFan.close();
    }

    HUD.updateCards(CardAuthority.getHand());
    HUD.updatePlayer(player);

    // Build log message
    var stackEmojis = '';
    for (var si = 0; si < stackEffects.cards.length; si++) {
      stackEmojis += stackEffects.cards[si].emoji;
    }
    var thrustLabel = result.thrust > 1.1 ? ' (' + result.thrust.toFixed(1) + 'x thrust!)' : '';
    var suitLabel = result.suitLabel ? ' ' + result.suitLabel : '';
    HUD.showCombatLog(
      stackEmojis + ' → ' + result.playerDmg + ' dmg!' + thrustLabel + suitLabel + ' ' +
      CombatEngine.getEnemy().emoji + ' hits for ' + result.enemyDmg + '. ' +
      'Enemy HP: ' + Math.max(0, result.enemyHp)
    );

    // ── Suit advantage toast overlay (Pass 6) ──
    if (typeof SuitToast !== 'undefined') {
      SuitToast.show(result, stackEffects.cards || []);
    }

    // ── Combat resolution choreography ──
    if (typeof CombatFX !== 'undefined') {
      var timing = CombatFX.getResolutionTiming();
      var _result = result;

      CombatFX.fanSlideAway();

      setTimeout(function () {
        if (typeof CombatFX !== 'undefined') CombatFX.playerPulse();
      }, timing.slideAwayMs);

      setTimeout(function () {
        if (typeof CombatFX !== 'undefined') CombatFX.enemyLunge();
      }, timing.slideAwayMs + timing.lungeStaggerMs);

      var impactTime = timing.slideAwayMs + timing.lungeStaggerMs +
                       Math.floor(timing.lungeMs * ENEMY_LUNGE_PEAK_PCT);
      setTimeout(function () {
        if (typeof CombatFX === 'undefined') return;
        if (_result.enemyDmg > 0) CombatFX.flashFrame('hp');
        if (_result.playerDmg > 0) CombatFX.flashFrame('energy');

        // ── Suit-keyed hit sounds (Pass 7) ──
        if (typeof AudioSystem !== 'undefined') {
          // Player's attack sound — keyed to stack's dominant suit
          if (_result.playerDmg > 0) {
            var aSuit = (typeof SynergyEngine !== 'undefined' && stackEffects.cards)
              ? SynergyEngine.getDominantSuit(stackEffects.cards) : 'spade';
            AudioSystem.playRandom('hit-' + (aSuit || 'spade'), { volume: 0.55 });
          }
          // Enemy hit on player — parry sound if defense absorbs, hit otherwise
          if (_result.enemyDmg > 0) {
            if (stackEffects.defense > 0 && stackEffects.defense >= _result.enemyDmg) {
              AudioSystem.playRandom('parry', { volume: 0.5 });
            } else {
              AudioSystem.playRandom('hit-spade', { volume: 0.45 });
            }
          }
        }
      }, impactTime);

      var slideBackTime = timing.slideAwayMs + timing.lungeMs + timing.impactPauseMs;
      setTimeout(function () {
        if (typeof CombatFX !== 'undefined') CombatFX.fanSlideBack();
      }, slideBackTime);
    }

    // Clear stacks after resolution
    if (typeof CardStack !== 'undefined') {
      CardStack.clear();
      CardStack.clearEnemyStack();
    }

    // Track for combat report
    if (typeof CombatReport !== 'undefined') {
      var primaryCard = stackEffects.cards[0] || {};
      CombatReport.trackCardPlayed(primaryCard, result.playerDmg, result.enemyDmg);
    }

    // Update NCH widget
    if (typeof NchWidget !== 'undefined') {
      NchWidget.updateCombat({ cards: CardAuthority.getHand(), selectedIdx: -1 });
    }
  }

  // ── Play card (legacy single-card path) ─────────────────────────

  /**
   * Play a card from hand during combat.
   * @param {number} index - Hand slot (0-4)
   */
  function playCard(index) {
    if (!CombatEngine.isActive()) return;
    var phase = CombatEngine.getPhase();
    if (phase !== 'selecting' && phase !== 'stacking') return;

    var card = CardAuthority.removeFromHand(index);
    if (!card) return;

    var player = Player.state();
    var result = CombatEngine.playCard(card, player);
    if (!result) return;

    HUD.updateCards(CardAuthority.getHand());
    HUD.updatePlayer(player);
    HUD.showCombatLog(
      card.emoji + ' ' + card.name + ' → ' + result.playerDmg + ' dmg! ' +
      CombatEngine.getEnemy().emoji + ' hits for ' + result.enemyDmg + '. ' +
      'Enemy HP: ' + Math.max(0, result.enemyHp)
    );

    // ── Combat resolution choreography (STR-HUD-DESIGNER-ROADMAP) ──
    // Full 2.2s sequence: fan slide away → player pulse → stagger →
    // enemy lunge → impact pause → HUD flash → fan slide back
    if (typeof CombatFX !== 'undefined') {
      var timing = CombatFX.getResolutionTiming();
      var _result = result;
      var _card = card;

      // Step 1: Fan slides away
      CombatFX.fanSlideAway();

      // Step 2: Player attack pulse (after fan clears)
      setTimeout(function () {
        if (typeof CombatFX !== 'undefined') CombatFX.playerPulse();
      }, timing.slideAwayMs);

      // Step 3: Enemy lunge (staggered after player pulse)
      setTimeout(function () {
        if (typeof CombatFX !== 'undefined') CombatFX.enemyLunge();
      }, timing.slideAwayMs + timing.lungeStaggerMs);

      // Step 4: HUD frame flash at impact (after lunge peaks)
      var impactTime = timing.slideAwayMs + timing.lungeStaggerMs +
                       Math.floor(timing.lungeMs * ENEMY_LUNGE_PEAK_PCT);
      setTimeout(function () {
        if (typeof CombatFX === 'undefined') return;
        if (_result.enemyDmg > 0) CombatFX.flashFrame('hp');
        if (_card.effects) {
          for (var ei = 0; ei < _card.effects.length; ei++) {
            if (_card.effects[ei].type === 'hp' && _card.effects[ei].value > 0) {
              CombatFX.flashFrame('heal');
              break;
            }
          }
        }
      }, impactTime);

      // Step 5: Fan slides back (after lunges + impact pause)
      var slideBackTime = timing.slideAwayMs + timing.lungeMs + timing.impactPauseMs;
      setTimeout(function () {
        if (typeof CombatFX !== 'undefined') CombatFX.fanSlideBack();
      }, slideBackTime);
    }

    // Track for combat report
    if (typeof CombatReport !== 'undefined') {
      CombatReport.trackCardPlayed(card, result.playerDmg, result.enemyDmg);
    }

    // Update NCH widget (hand shrank by one card)
    if (typeof NchWidget !== 'undefined') {
      NchWidget.updateCombat({ cards: CardAuthority.getHand(), selectedIdx: -1 });
    }
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
    var floorId = FloorManager.getFloor();

    floorData.grid[cy][cx] = TILES.EMPTY;
    SessionStats.inc('chestsOpened');

    var drops = LootTables.rollBreakableLoot('breakable_default', floorId);
    if (drops.length === 0) {
      // Fallback — always give at least a small gold reward
      CardTransfer.lootGold(1);
      HUD.showCombatLog('Found 1 gold!');
    } else {
      for (var di = 0; di < drops.length; di++) {
        var loot = drops[di];
        if (loot.type === 'gold') {
          CardTransfer.lootGold(loot.amount);
          HUD.showCombatLog('Found ' + loot.amount + ' gold!');
        } else if (loot.type === 'battery') {
          HUD.showCombatLog('Found a battery!');
        } else if (loot.type === 'food' && loot.itemId) {
          HUD.showCombatLog('Found food: ' + loot.itemId);
        } else if (loot.type === 'salvage' && loot.partId) {
          HUD.showCombatLog('Found salvage: ' + loot.partId);
        }
      }
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

  /**
   * True while the facing-turn animation is playing before combat
   * actually starts. Input should be blocked during this window.
   */
  function isPending() {
    return !!_pendingEnemy;
  }

  return {
    init: init,
    update: update,
    startCombat: startCombat,
    isPending: isPending,
    playCard: playCard,
    fireStack: fireStack,
    flee: flee,
    openChest: openChest,
    checkEnemyProximity: checkEnemyProximity,
    checkEnemyAggro: checkEnemyAggro
  };
})();

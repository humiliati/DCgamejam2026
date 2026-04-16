/**
 * HeroWake — first-entry cinematic for Floor 2.2.1 (Hero's Wake B1).
 *
 * Owns the hero-wake state machine: first-entry script, frozen/scripted
 * hero sprite, corpse pile reveal, and Wounded Warden spawn.
 *
 * Layer 3 — depends on: MovementController, FloorManager, Player, EnemyAI,
 *           DialogBox, Toast, AudioSystem, HUD, CinematicCamera, i18n
 *           (all typeof-guarded)
 */

var HeroWake = (function() {
  'use strict';

  // ── Internal state ──────────────────────────────────────────────────
  var _previousFloorId = null;
  var _heroWakeState = {
    phase: 'idle',          // 'idle' | 'playing' | 'done'
    combatTrigger: null,    // Copy of floorData.heroScript.combatTrigger
    triggerSpawned: false,  // Has the wounded warden been spawned yet
    timeoutIds: []          // Track timeouts for cleanup
  };

  /**
   * First-entry cinematic for Floor 2.2.1 (Deepwatch Cellars B1).
   *
   * The player enters the foyer and, through the 8-wide doorway at the
   * north end of the foyer, sees the Hero (Seeker) standing in the
   * junction (11,11) shouting at an unseen enemy. The camera locks with
   * letterbox bars (CinematicCamera boss_entrance preset), the hero
   * delivers two dialogue lines, then begins a scripted walk clockwise
   * around the ring corridor — disappearing from view as they turn the
   * first corner into the east passage.
   *
   * When the hero's scripted path completes (handled in _tick), the
   * combatTrigger from floorData.heroScript spawns a Wounded Vault
   * Warden in the North Hall — the mid-corridor blocker. The player
   * catches up to the hero's trail only to find the hero is gone and a
   * severely weakened elite is all that stands between them and
   * nothing.
   *
   * One-shot: guarded by Player.flags.heroWakeArrival.
   *
   * @param {string|null} previousFloorId - the floor ID the player came from
   */
  function onArriveHeroWake(previousFloorId) {
    _previousFloorId = previousFloorId;

    var fd = FloorManager.getFloorData();
    if (!fd) return;

    // ── Spawn override (every entry from the parent floor) ──────────
    // DoorContracts.applyContract on the authored 24×24 Q-shape picks
    // (12, 21) facing EAST — one tile east of the STAIRS_UP tile, with
    // _bestFacingDir rotating the player away from the door on the X
    // axis since the spawn ends up on the same row as the stair. That
    // lands the player staring at the east foyer wall with the hero
    // at (11, 11) completely off-screen to their left.
    //
    // The blockout declares the correct spawn as (11, 20) facing NORTH
    // — one tile directly north of the stair, centered in the 8-wide
    // foyer, with an unobstructed sightline through the row-13 doorway
    // to the hero in the junction. Apply that here whenever the player
    // arrived from Watchman's Post (2.2). Skip on 2.2.2 → 2.2.1 returns
    // (those come up via STAIRS_DN into the North Hall, a different
    // part of the map with its own correct facing).
    if (_previousFloorId === '2.2' || _previousFloorId === null) {
      if (typeof Player !== 'undefined' && Player.setPos && Player.setDir) {
        Player.setPos(11, 20);
        Player.setDir(3); // NORTH per direction convention
        if (Player.resetLookOffset) Player.resetLookOffset();
      }
      // Use setPosition() rather than init() — init wipes the MC callbacks,
      // which the Game orchestrator just wired in FloorTransition.onAfter
      // (onMoveFinish → _onMoveFinish → HoseState.recordStep, MinimapNav,
      // HoseReel, CobwebSystem, Player.setPos sync). Passing null callbacks
      // here would freeze every per-move side-effect on 2.2.1 — notably the
      // hose minimap trail, which stuck at the entry tile until we fixed it.
      // setPosition() only resets position/queues; the callback refs remain
      // whatever FloorTransition.onAfter installed. (movement.js §setPosition)
      if (typeof MovementController !== 'undefined' && MovementController.setPosition) {
        MovementController.setPosition(11, 20, 3);
      }
    }

    // One-shot guard. If the player has already triggered this scene,
    // skip everything (including the wounded warden spawn — they already
    // killed or bypassed it on the previous visit).
    if (Player.hasFlag && Player.hasFlag('heroWakeArrival')) {
      _heroWakeState.phase = 'done';
      return;
    }
    if (!fd || !fd.heroScript) {
      console.warn('[HeroWake] onArriveHeroWake: no heroScript on floor data');
      return;
    }

    var script = fd.heroScript;
    if (!script.spawn || !script.path || script.path.length === 0) {
      console.warn('[HeroWake] onArriveHeroWake: heroScript missing spawn/path');
      return;
    }

    // Mark as played BEFORE spawning anything — a mid-scene reload will
    // not re-trigger the cinematic (the hero will simply be gone and the
    // warden will need to be re-placed manually on reload; acceptable
    // for jam scope).
    if (Player.setFlag) Player.setFlag('heroWakeArrival', true);

    // DOC-107 Phase 1: fan out heroWakeArrival flag flip to QuestChain so
    // any active quest step predicated on the hero reveal advances now.
    if (typeof QuestChain !== 'undefined' && QuestChain.onFlagChanged) {
      QuestChain.onFlagChanged('heroWakeArrival', true);
    }

    _heroWakeState.phase = 'playing';
    _heroWakeState.combatTrigger = script.combatTrigger || null;
    _heroWakeState.triggerSpawned = false;
    _heroWakeState.timeoutIds = [];

    // Spawn the scripted hero entity at the junction. HeroSystem tracks
    // _scriptedHero internally; we render it and tick it from _render
    // and _tick respectively.
    if (typeof HeroSystem !== 'undefined' && HeroSystem.createScriptedHero) {
      HeroSystem.createScriptedHero(script.spawn.x, script.spawn.y, script.path);
    }

    // Fire the CinematicCamera boss-entrance preset. This:
    //   • Slams letterbox bars in over ~150ms (barSpeed 1200)
    //   • Zooms FOV to 0.85 (tight)
    //   • Adds shake (intensity 6, decay 4)
    //   • Locks input for the duration (lockInput: true)
    //   • Auto-closes after 2500ms, returning input to the player
    // The hero continues its scripted walk after the bars retract —
    // the player is then free to chase. The focusTarget hint lines up
    // the framing with the hero's spawn tile.
    if (typeof CinematicCamera !== 'undefined') {
      CinematicCamera.start('boss_entrance', {
        focusTarget: { x: script.spawn.x, y: script.spawn.y }
      });
    }

    // Dialogue beats — the hero shouts at the unseen wounded warden.
    // Fired via setTimeout so they layer over the letterbox reveal
    // rather than all at once. Each line auto-dismisses after its
    // display window; the scripted hero starts walking after the
    // second line completes (handled purely by tickScriptedHero's
    // movement timer — we do not gate movement on dialogue).
    var t1 = setTimeout(function () {
      if (typeof DialogBox !== 'undefined' && DialogBox.show) {
        DialogBox.show("Come out! I know you're back there!", {
          speaker: '???',
          transient: true,
          priority: 2
        });
      }
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play('enemy-alert', { volume: 0.4 });
      }
    }, 900);

    var t2 = setTimeout(function () {
      if (typeof DialogBox !== 'undefined' && DialogBox.show) {
        DialogBox.show("Hiding won't save you, worm. The agency paid in full.", {
          speaker: '???',
          transient: true,
          priority: 2
        });
      }
    }, 3100);

    // Atmospheric entry toast — lands immediately, just under the bars.
    var t0 = setTimeout(function () {
      if (typeof Toast !== 'undefined') {
        Toast.show('The foyer reeks of ozone and old blood.', 'dim');
      }
    }, 400);

    _heroWakeState.timeoutIds.push(t0, t1, t2);
  }

  /**
   * Spawn the Wounded Vault Warden in the North Hall after the hero
   * despawns. Called from Game._tick when HeroSystem.tickScriptedHero
   * returns the hero entity (path complete).
   *
   * The warden is authored in floor-blockout-2-2-1.js as:
   *   { x: 11, y: 2, enemyType: 'vault_warden',
   *     maxHp: 15, currentHp: 2, str: 5 }
   * i.e. a tier-elite enemy at 2/15 HP — the hero has already broken
   * them. Any weapon hit from the player finishes them. The point is
   * the pacing beat, not the fight.
   *
   * @param {object} trigger - the combatTrigger config object
   */
  function _spawnWoundedWarden(trigger) {
    if (!trigger || _heroWakeState.triggerSpawned) return;
    if (typeof EnemyAI === 'undefined' || !EnemyAI.createEnemy) return;

    var enemies = FloorManager.getEnemies();
    if (!enemies) return;

    // Don't spawn on top of another living entity (defensive — the
    // authored blockout already keeps North Hall empty of rats).
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp > 0 && e.x === trigger.x && e.y === trigger.y) return;
    }

    var warden = EnemyAI.createEnemy({
      type:  trigger.enemyType || 'vault_warden',
      name:  trigger.name || 'Wounded Vault Warden',
      emoji: trigger.emoji || '🛡️',
      x: trigger.x,
      y: trigger.y,
      hp: trigger.currentHp || 2,    // Severely weakened
      str: trigger.str || 5,
      dex: trigger.dex || 1,
      suit: trigger.suit || 'club',
      isElite: true,
      facing: 'south',               // Facing the approaching player
      awarenessRange: 6
    });
    // createEnemy sets maxHp = hp. Override so the HP bar reads "2/15"
    // and the player sees just how close to death this thing is.
    if (trigger.maxHp) warden.maxHp = trigger.maxHp;
    // Pre-alert — the warden hears the player coming and turns to face
    // them. Awareness in the ALERTED band starts the chase behaviour.
    warden.awareness = 80;

    enemies.push(warden);

    // Assign a bark pool so the warden gets proximity barks.
    if (EnemyAI.assignBarkPools) {
      EnemyAI.assignBarkPools([warden], FloorManager.getFloor());
    }

    // Audible cue — a distant slam / roar telling the player the
    // corridor ahead is now occupied.
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('door_slam', { volume: 0.55 });
    }

    if (typeof Toast !== 'undefined') {
      Toast.show('Something heavy just stood up in the dark.', 'danger');
    }

    _heroWakeState.triggerSpawned = true;
    _heroWakeState.phase = 'done';
  }

  /**
   * Reset the hero-wake state. Call before reloading the floor.
   */
  function reset() {
    // Clear any pending timeouts
    for (var i = 0; i < _heroWakeState.timeoutIds.length; i++) {
      clearTimeout(_heroWakeState.timeoutIds[i]);
    }
    _heroWakeState.timeoutIds = [];

    _heroWakeState.phase = 'idle';
    _heroWakeState.combatTrigger = null;
    _heroWakeState.triggerSpawned = false;
    _previousFloorId = null;
  }

  /**
   * Public API
   */
  return Object.freeze({
    onArrive: onArriveHeroWake,
    spawnWoundedWarden: _spawnWoundedWarden,
    getState: function() { return _heroWakeState; },
    reset: reset
  });
})();

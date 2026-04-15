/**
 * HomeEvents — home arrival, work keys, overnight hero run, and porch rest.
 *
 * Layer 3 — depends on: GameActions, WeekStrip, FloorManager, Player,
 *           HeroRun, MailboxPeek, ReadinessCalc, CrateSystem, BarkLibrary,
 *           DayCycle, DungeonSchedule, TransitionFX, StatusEffect, ParticleFX,
 *           Toast, AudioSystem, TILES, i18n (all typeof-guarded)
 */
var HomeEvents = (function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════════

  var _gateUnlocked = false;
  var _dispatcherSpawnId = 'npc_dispatcher_gate';
  var _onKeysPickedUpCallback = null;

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  function init(opts) {
    if (!opts) opts = {};
    if (typeof opts.isGateUnlocked === 'boolean') {
      _gateUnlocked = opts.isGateUnlocked;
    }
    if (typeof opts.onKeysPickedUp === 'function') {
      _onKeysPickedUpCallback = opts.onKeysPickedUp;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HOME ARRIVAL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Player has arrived on Floor 1.6 (Gleaner's Home).
   *
   * Fires the home-arrival bark and checks whether the work keys item
   * is present in the home chest. If so, marks it for pickup — the
   * player will interact with the DOOR tile at the chest position to
   * collect the keys, which sets _gateUnlocked = true.
   */
  function onArriveHome() {
    if (typeof BarkLibrary !== 'undefined') {
      setTimeout(function () {
        BarkLibrary.fire('home.morning.wakeup');
      }, 1000);
    }

    if (!_gateUnlocked) {
      console.log('[HomeEvents] Floor 1.6 — work keys available for pickup');
      // The chest at (19, 3) on the home floor contains the work keys.
      // When the player interacts with it, onPickupWorkKeys() is called
      // via the chest-interact path in game._interact().
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  WORK KEYS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check whether the tile at (fx, fy) on the current floor is the
   * work-keys chest on Floor 1.6.
   *
   * TODO (NPC-INTEGRATION): Wire this into the Watchman dialogue at Floor 2.2.
   * The Watchman should gate dungeon descent (2.2 → 2.2.1) behind a key check:
   *   - If !_gateUnlocked → Watchman refuses entry, barks "Get your keys first"
   *   - If _gateUnlocked but player hasn't spoken to Watchman → briefing dialogue
   *   - If briefing complete → free passage to 2.2.1
   * This function provides the tile-level predicate; the NPC tree in
   * watchpost_watchman (line ~2183) needs a 'gate_check' node that calls it.
   * See also: onPickupWorkKeys() below, which flips _gateUnlocked.
   */
  function checkWorkKeysChest(fx, fy) {
    return !_gateUnlocked
      && FloorManager.getFloor() === '1.6'
      && fx === 19 && fy === 3;
  }

  /**
   * Called when the player picks up the work keys from the home chest.
   * Unlocks the gate, removes the Dispatcher NPC, and fires the unlock bark.
   */
  function onPickupWorkKeys() {
    if (_gateUnlocked) return;
    setGateUnlocked(true);

    if (typeof BarkLibrary !== 'undefined') {
      BarkLibrary.fire('home.keys.pickup');
    }

    // Remove the Dispatcher NPC from Floor 1 enemy list (it may not be
    // loaded right now — the cache will be clean when Floor 1 is visited)
    if (FloorManager.getFloor() === '1') {
      var enemies = FloorManager.getEnemies();
      for (var i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].id === _dispatcherSpawnId) {
          enemies.splice(i, 1);
          break;
        }
      }
    }

    // Invalidate Floor 1 cache so gate NPC is not re-spawned on revisit
    FloorManager.invalidateCache('1');

    console.log('[HomeEvents] Work keys collected — dungeon gate unlocked');

    // Invoke callback for quest target update
    if (typeof _onKeysPickedUpCallback === 'function') {
      _onKeysPickedUpCallback();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  OVERNIGHT HERO RUN — executes during sleep on Hero Day eve
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute the overnight hero run when the player sleeps into a Hero Day.
   * Uses HeroRun to calculate results, then delivers a report to the mailbox.
   *
   * @param {number} dayNum - The day number that is now a Hero Day
   */
  function executeOvernightHeroRun(dayNum) {
    if (typeof HeroRun === 'undefined') return;
    if (typeof MailboxPeek === 'undefined') return;

    // Day 0 guard: heroes already ran before the game started.
    // Pre-existing carnage is baked into initial floor generation.
    if (dayNum === 0) {
      console.log('[HomeEvents] Day 0 — skipping hero run (pre-existing carnage).');
      return;
    }

    // Determine which hero runs today
    var heroType = HeroRun.getHeroForDay(dayNum);

    // Gather floor readiness data for all known dungeon floors
    var dungeonFloors = [];
    var knownDungeons = ['1.3.1', '2.2.1', '2.2.2'];
    for (var i = 0; i < knownDungeons.length; i++) {
      var fid = knownDungeons[i];
      var readiness = 0;
      var crateCount = 4;     // Default estimates
      var enemyCount = 3;
      var trapCount = 2;
      var puzzleCount = 1;

      // Try to get actual readiness from ReadinessCalc
      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getReadiness) {
        var r = ReadinessCalc.getReadiness(fid);
        if (r && typeof r.total === 'number') readiness = Math.round(r.total * 100);
      }

      // Try to get actual counts from cached floor data
      if (typeof FloorManager !== 'undefined' && FloorManager.getCachedFloorData) {
        var cached = FloorManager.getCachedFloorData(fid);
        if (cached && cached.grid) {
          crateCount = _countTilesOfType(cached.grid, cached.gridW, cached.gridH, TILES.BREAKABLE) || 4;
          trapCount = _countTilesOfType(cached.grid, cached.gridW, cached.gridH, TILES.TRAP) || 2;
        }
        if (cached && cached.enemies) {
          enemyCount = cached.enemies.length || 3;
        }
      }

      // Floor name lookup
      var floorName = fid;
      if (typeof i18n !== 'undefined' && i18n.t) {
        floorName = i18n.t('floor.' + fid, fid);
      }

      dungeonFloors.push({
        floorId: fid,
        name: floorName,
        readiness: readiness,
        crateCount: crateCount,
        enemyCount: enemyCount,
        trapCount: trapCount,
        puzzleCount: puzzleCount
      });
    }

    // Only run if there are floors with non-zero readiness
    var hasReadyFloor = false;
    for (var j = 0; j < dungeonFloors.length; j++) {
      if (dungeonFloors[j].readiness > 0) { hasReadyFloor = true; break; }
    }

    if (!hasReadyFloor && dayNum > 0) {
      // No floors prepared — hero is disappointed
      MailboxPeek.addReport({
        day: dayNum,
        heroType: heroType,
        heroEmoji: HeroRun.getHeroEmoji(heroType),
        floors: [],
        totalPayout: 0,
        chainBonus: false,
        cardDrop: null,
        isDeathReport: false,
        rescueText: null
      });
      console.log('[HomeEvents] Hero Day ' + dayNum + ' — no floors ready. Hero disappointed.');
      return;
    }

    // Execute the hero run
    var report = HeroRun.executeRun(heroType, dungeonFloors);
    report.day = dayNum;

    // Deliver report to mailbox
    MailboxPeek.addReport(report);

    // Invalidate dungeon floor caches so re-entry shows carnage
    for (var k = 0; k < knownDungeons.length; k++) {
      if (typeof FloorManager !== 'undefined' && FloorManager.invalidateCache) {
        FloorManager.invalidateCache(knownDungeons[k]);
      }
    }

    console.log('[HomeEvents] Hero Day ' + dayNum + ' — ' + heroType + ' ran. Payout: ' + report.totalPayout + ' coins. Report delivered to mailbox.');
  }

  /**
   * Count tiles of a specific type in a grid.
   */
  function _countTilesOfType(grid, w, h, tileType) {
    var count = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (grid[y] && grid[y][x] === tileType) count++;
      }
    }
    return count;
  }

  // ═══════════════════════════════════════════════════════════════
  //  HOME DOOR REST (porch shortcut when TIRED)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Rest at the front door of home. Skips entering the house —
   * player sleeps on the porch at depth-1 (exterior), so the clock
   * is NOT paused and advanceTime works normally.
   *
   * Grants WELL_RESTED if in bed before midnight (sleepHour >= 6).
   */
  function doHomeDoorRest() {
    var sleepHour = (typeof DayCycle !== 'undefined') ? DayCycle.getHour() : 0;

    if (typeof TransitionFX !== 'undefined') {
      TransitionFX.begin({
        type: 'descend',
        duration: 1200,
        label: 'Resting for the night...',
        onMidpoint: function () {
          // Advance time to morning
          if (typeof DayCycle !== 'undefined') {
            DayCycle.advanceTime(DayCycle.ADVANCE.REST);
          }

          // Clear TIRED
          if (typeof StatusEffect !== 'undefined') {
            StatusEffect.remove('TIRED', 'manual');
          }

          // Grant WELL_RESTED if in bed before midnight
          // sleepHour >= 6 means the player went to bed during the day/evening
          // (not in the 00:00–05:59 post-midnight zone = stayed up too late)
          if (sleepHour >= 6 && typeof StatusEffect !== 'undefined') {
            StatusEffect.apply('WELL_RESTED');
          }

          // Heal + heal particles
          if (typeof Player !== 'undefined') {
            Player.fullRestore();
            // Successful voluntary sleep resets consecutive fail streak
            Player.setFlag('consecutiveFails', 0);
          }
          if (typeof ParticleFX !== 'undefined') {
            var canvas = (typeof GameActions !== 'undefined' && GameActions.getCanvas)
              ? GameActions.getCanvas()
              : null;
            ParticleFX.healPulse(canvas ? canvas.width / 2 : 320, canvas ? canvas.height * 0.5 : 220);
          }

          // Transition into home (1.6) — wake up inside
          FloorManager.setFloor('1.6');
          FloorManager.generateCurrentFloor();
        },
        onComplete: function () {
          // Update day counter via WeekStrip if available
          if (typeof WeekStrip !== 'undefined') {
            WeekStrip.update();
          }

          if (sleepHour >= 6 && typeof Toast !== 'undefined') {
            Toast.show('\u2600 Well rested! Ready for the day.', 'buff');
          } else if (typeof Toast !== 'undefined') {
            Toast.show('\u2615 Late night... but at least you made it home.', 'info');
          }

          // Trigger overnight hero run if it's a Hero Day
          // §9: DungeonSchedule handles per-group runs via DayCycle.onDayChange.
          // Legacy path only when DungeonSchedule is absent.
          if (typeof DayCycle !== 'undefined' && DayCycle.isHeroDay() &&
              typeof DungeonSchedule === 'undefined') {
            executeOvernightHeroRun(DayCycle.getDay());
          }

          // Mailbox notification
          if (typeof MailboxPeek !== 'undefined' && MailboxPeek.hasUnread()) {
            setTimeout(function () {
              if (typeof Toast !== 'undefined') {
                Toast.show('\uD83D\uDCEC You have mail!', 'info');
              }
            }, 1500);
          }

          // ── M2.4 checkpoint autosave ────────────────────────────
          // Home-door rest is a respawn anchor for TIRED players who
          // short-circuit the bed. Persist after WeekStrip advances +
          // overnight hero run resolves so the save reflects the new
          // day's world state.
          if (typeof SaveState !== 'undefined' && SaveState.autosave) {
            try { SaveState.autosave(); }
            catch (e) { console.warn('[HomeEvents] autosave after door-rest failed:', e); }
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  STATE ACCESSORS
  // ═══════════════════════════════════════════════════════════════

  function isGateUnlocked() {
    return _gateUnlocked;
  }

  function setGateUnlocked(v) {
    _gateUnlocked = v;
    if (typeof GameActions !== 'undefined' && GameActions.setGateUnlocked) {
      GameActions.setGateUnlocked(v);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    init:                      init,
    onArriveHome:              onArriveHome,
    checkWorkKeysChest:        checkWorkKeysChest,
    onPickupWorkKeys:          onPickupWorkKeys,
    executeOvernightHeroRun:   executeOvernightHeroRun,
    doHomeDoorRest:            doHomeDoorRest,
    isGateUnlocked:            isGateUnlocked,
    setGateUnlocked:           setGateUnlocked
  });
})();

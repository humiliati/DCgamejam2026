/**
 * HazardSystem — environmental damage, bonfire checkpoints, and
 * depth-based lethality branching.
 *
 * Adapted from EyesOnly's ground-effects on-step damage, hazard tile
 * effects, and death-handler environmental kill paths.
 *
 * Layer 2 (depends on: TILES, Player, FloorManager, HUD, i18n,
 *          SessionStats, MovementController, AudioSystem)
 *
 * ── Hazard rules ───────────────────────────────────────────────────
 *
 *   TRAP    — 1 dmg, consumed on trigger (tile → EMPTY)
 *   FIRE    — 2 dmg, persists (can re-enter and take damage again)
 *   SPIKES  — 3 dmg, persists
 *   POISON  — 1 dmg + energy drain (1), persists
 *
 * ── Environmental death lethality ──────────────────────────────────
 *
 *   Floor ID depth determines what happens when hazard damage kills:
 *
 *     Depth 1 ("N")     → non-lethal: bonfire respawn, 25% currency penalty
 *     Depth 2 ("N.N")   → non-lethal: bonfire respawn, 25% currency penalty
 *     Depth 3 ("N.N.N") → PERMADEATH: full onDeath(), game over
 *
 * ── Bonfire mechanics ──────────────────────────────────────────────
 *
 *   Bonfires are interact-activated rest points.
 *   On rest: full HP/energy restore, position saved as respawn point.
 *   Respawn point persists per floor (cached in _bonfirePos).
 *   If no bonfire rested at, non-lethal death returns to stairs-up.
 */
var HazardSystem = (function () {
  'use strict';

  var MC = MovementController;

  // ── Hazard damage table (adapted from EyesOnly's TILE_EFFECTS) ──
  var HAZARD_DAMAGE = {};
  HAZARD_DAMAGE[TILES.TRAP]   = { dmg: 1, energy: 0, persist: false, emoji: '⚙️',  reason: 'trap' };
  HAZARD_DAMAGE[TILES.FIRE]   = { dmg: 2, energy: 0, persist: true,  emoji: '🔥', reason: 'fire' };
  HAZARD_DAMAGE[TILES.SPIKES] = { dmg: 3, energy: 0, persist: true,  emoji: '🔺', reason: 'spikes' };
  HAZARD_DAMAGE[TILES.POISON] = { dmg: 1, energy: 1, persist: true,  emoji: '☠️',  reason: 'poison' };

  // ── Bonfire respawn state ────────────────────────────────────────
  // Per-floor bonfire position: { floorNum: { x, y } }
  var _bonfirePositions = {};

  // ── Callbacks (wired by Game orchestrator) ───────────────────────
  var _onGameOver = null;
  var _onDeathRescue = null;

  // §7f: Flag for morning recap monologue after bonfire menu closes
  var _pendingMorningRecap = false;

  // §9b: Last rest result for REST face status feedback
  var _lastRestResult = null;

  function init(cbs) {
    cbs = cbs || {};
    _onGameOver = cbs.onGameOver || null;
    _onDeathRescue = cbs.onDeathRescue || null;
  }

  function setOnDeathRescue(fn) {
    _onDeathRescue = fn;
  }

  /**
   * Clear bonfire cache (on new game).
   */
  function clearBonfires() {
    _bonfirePositions = {};
    _pendingMorningRecap = false;
  }

  // ── Bonfire interaction ──────────────────────────────────────────

  /**
   * Calculate minutes needed to advance from current time to 06:00 dawn.
   * If already at 06:00, returns full 24h (sleep a whole day).
   * @returns {number} minutes to advance
   */
  function _minutesUntilDawn() {
    if (typeof DayCycle === 'undefined') return 480; // fallback 8h
    var currentMinutes = DayCycle.getHour() * 60 + DayCycle.getMinute();
    var dawnMinutes = 360; // 06:00
    var advance = currentMinutes < dawnMinutes
      ? dawnMinutes - currentMinutes           // pre-dawn same day (e.g. 01:15 → 06:00)
      : (1440 - currentMinutes) + dawnMinutes; // next day (e.g. 14:30 → 06:00+1)
    // Edge: exactly at 06:00 → full day
    if (advance === 0) advance = 1440;
    return advance;
  }

  /**
   * Rest at a bonfire tile. Called from game.js _interact when
   * the tile in front of the player is BONFIRE/HEARTH/BED (non-home).
   *
   * §7d: REST UNTIL DAWN — for jam build, bonfire rest always advances
   *      to 06:00 next dawn. This avoids waking into curfew hours
   *      (curfew is currently an automatic failstate). Post-jam,
   *      switch to ADVANCE.REST (480 min = 8h) when curfew softens.
   * §7b: Grants WELL_RESTED (always, since you wake at dawn).
   * §7c: Clears TIRED.
   * §7f: Queues morning recap monologue for after menu close.
   *
   * @param {number} bx - Bonfire tile X
   * @param {number} by - Bonfire tile Y
   */
  function restAtBonfire(bx, by) {
    var floorId = FloorManager.getFloor();
    var depth = floorId ? floorId.split('.').length : 1;

    // Save this bonfire as the respawn point for this floor
    _bonfirePositions[floorId] = { x: bx, y: by };

    // ── §11a: Depth-branched rest ──────────────────────────────
    // Depth 1 (exterior campfire): rest-until-dawn (§7d), full restore
    // Depth 3+ (dungeon hearth):   brief 2h rest, no WELL_RESTED, no day skip
    // Both clear TIRED and fully restore HP/energy.
    var isDungeon = (depth >= 3);
    var DUNGEON_REST_MIN = 120; // 2h quick rest — "coffee break, not a good night's rest"

    // Capture sleep hour BEFORE advancing (for WELL_RESTED gate + logging)
    var sleepHour = (typeof DayCycle !== 'undefined') ? DayCycle.getHour() : 0;
    var advanceMin = isDungeon ? DUNGEON_REST_MIN : _minutesUntilDawn();

    if (typeof DayCycle !== 'undefined' && DayCycle.advanceTime) {
      // Ensure clock is not paused (depth-2 interior time-freeze).
      // Bonfire rest always advances time regardless of location.
      var wasPaused = DayCycle.isPaused();
      if (wasPaused) DayCycle.setPaused(false);

      DayCycle.advanceTime(advanceMin);

      // ── POST-JAM: fixed 8h rest for exterior (uncomment when curfew is soft) ──
      // if (!isDungeon) DayCycle.advanceTime(DayCycle.ADVANCE.REST);

      if (wasPaused) DayCycle.setPaused(true);
    }

    // Full restore (both exterior and dungeon — rest always heals)
    Player.fullRestore();

    // ── §7c: Clear TIRED status ────────────────────────────────
    if (typeof StatusEffect !== 'undefined') {
      StatusEffect.remove('TIRED', 'manual');
    }

    // ── §7b / §11a: WELL_RESTED — exterior only, before midnight ──
    // Dungeon hearths never grant WELL_RESTED (too dangerous to truly
    // sleep in the dungeon — this is a coffee break).
    // Exterior: TIRED starts at 19:00. WELL_RESTED requires going to bed
    // before midnight (sleepHour >= 6, i.e. not in 00:00–05:59
    // post-midnight zone). Mirrors _doHomeDoorRest and BedPeek parity.
    var gotWellRested = false;
    if (!isDungeon && typeof StatusEffect !== 'undefined' && sleepHour >= 6) {
      StatusEffect.apply('WELL_RESTED');
      gotWellRested = true;
    }

    HUD.updatePlayer(Player.state());

    // Feedback — show rest type (🔥 prefix — dragonfire rest, not bed rest)
    var sleptHours = Math.round(advanceMin / 60);
    var restPrefix = '\uD83D\uDD25 ';  // 🔥
    if (isDungeon) {
      HUD.showCombatLog(restPrefix + i18n.t('hazard.dragonfire_brief',
        'Brief rest (' + sleptHours + 'h); HP & energy restored. Stay alert.'));
    } else if (gotWellRested) {
      HUD.showCombatLog(restPrefix + i18n.t('hazard.dragonfire_rest_dawn',
        'Rested until dawn (' + sleptHours + 'h); HP & energy restored. You feel well rested.'));
    } else {
      HUD.showCombatLog(restPrefix + i18n.t('hazard.dragonfire_rest_late',
        'Rested until dawn (' + sleptHours + 'h); HP & energy restored. Late night, though...'));
    }
    AudioSystem.play('ui-confirm', { volume: 0.5 });

    // ── §7f: Queue morning recap monologue (exterior only) ─────
    // Dungeon brief rests don't trigger morning recap — you didn't sleep.
    if (!isDungeon && typeof MonologuePeek !== 'undefined' && MonologuePeek.play) {
      _pendingMorningRecap = true;
    }

    // §9b: Store rest result for REST face status feedback
    _lastRestResult = {
      isDungeon: isDungeon,
      cleared: ['TIRED'],
      gained: gotWellRested ? ['WELL_RESTED'] : [],
      advanceMin: advanceMin,
      floorId: floorId,
      floorLabel: (typeof FloorManager !== 'undefined' && FloorManager.getFloorLabel)
        ? FloorManager.getFloorLabel() : floorId
    };

    SessionStats.inc('bonfiresUsed');

    console.log('[HazardSystem] Rested at ' + (isDungeon ? 'dungeon hearth' : 'campfire') +
                ' (' + bx + ',' + by + ') on floor ' + floorId + ' (depth ' + depth + ')' +
                ' | sleepHour=' + sleepHour + ' | advanced=' + advanceMin + 'min' +
                (isDungeon ? ' (brief)' : ' → dawn') +
                ' | WELL_RESTED=' + gotWellRested +
                (isDungeon ? ' (dungeon=never)' : ' (bedtime ' + (sleepHour >= 6 ? 'before' : 'after') + ' midnight)'));

    // ── M2.4 checkpoint autosave ───────────────────────────────────
    // Bonfire/hearth is a designated respawn anchor. Persist the
    // updated respawn cache + current floor state so death:reset has
    // a fresh anchor and the player can reload here directly.
    if (typeof SaveState !== 'undefined' && SaveState.autosave) {
      try { SaveState.autosave(); }
      catch (e) { console.warn('[HazardSystem] autosave after bonfire rest failed:', e); }
    }
  }

  /**
   * Check and clear pending morning recap flag.
   * Called by game.js when bonfire menu closes to trigger MonologuePeek.
   * @returns {boolean} true if a recap was pending
   */
  function consumeMorningRecap() {
    if (_pendingMorningRecap) {
      _pendingMorningRecap = false;
      return true;
    }
    return false;
  }

  /**
   * Get the respawn position for the current floor.
   * Falls back to stairs-up if no bonfire has been rested at.
   *
   * @returns {{ x: number, y: number }}
   */
  function _getRespawnPos() {
    var floorId = FloorManager.getFloor();

    // Prefer last bonfire rested at on this floor
    if (_bonfirePositions[floorId]) {
      return _bonfirePositions[floorId];
    }

    // Fallback: stairs-up position (entry point)
    var floorData = FloorManager.getFloorData();
    if (floorData.doors && floorData.doors.stairsUp) {
      return floorData.doors.stairsUp;
    }

    // Last resort: grid center
    return { x: Math.floor(floorData.gridW / 2), y: Math.floor(floorData.gridH / 2) };
  }

  // ── Hazard on-step check ─────────────────────────────────────────

  /**
   * Check the tile the player just stepped on for hazards.
   * Called from game.js _onMoveFinish after position update.
   *
   * @param {number} x - Player grid X
   * @param {number} y - Player grid Y
   * @returns {boolean} true if hazard was triggered
   */
  function checkTile(x, y) {
    var floorData = FloorManager.getFloorData();
    var tile = floorData.grid[y][x];

    if (!TILES.isHazard(tile)) return false;

    var info = HAZARD_DAMAGE[tile];
    if (!info) return false;

    // Apply damage
    Player.damage(info.dmg);

    // Energy drain (poison)
    if (info.energy > 0) {
      Player.spendEnergy(info.energy);
    }

    // Track stats
    SessionStats.inc('damageTaken', info.dmg);
    SessionStats.inc('hazardsTriggered');

    // Consume non-persistent traps
    if (!info.persist) {
      floorData.grid[y][x] = TILES.EMPTY;
      // C7: Notify TrapRearm so Gleaner can re-arm this position later
      if (typeof TrapRearm !== 'undefined') {
        TrapRearm.onTrapConsumed(x, y, FloorManager.getCurrentFloorId());
      }
    }

    // HUD feedback
    var msg = info.emoji + ' ' +
      i18n.t('hazard.' + info.reason, info.reason.toUpperCase()) +
      '! -' + info.dmg + ' HP';
    if (info.energy > 0) {
      msg += ', -' + info.energy + ' EN';
    }
    HUD.showCombatLog(msg);
    HUD.updatePlayer(Player.state());

    AudioSystem.play('zap', { volume: 0.4 });

    // ── Death check ──
    if (!Player.isAlive()) {
      _handleEnvironmentalDeath(info.reason);
    }

    return true;
  }

  // ── Environmental death ──────────────────────────────────────────

  /**
   * Handle player death from environmental damage.
   * Branches on floor depth:
   *   Depth 1-2 → non-lethal (bonfire respawn + penalty)
   *   Depth 3   → permadeath (game over)
   *
   * @param {string} reason - Death cause ('trap', 'fire', 'spikes', 'poison')
   */
  function _handleEnvironmentalDeath(reason) {
    var depth = FloorManager.getFloorDepth();

    console.log('[HazardSystem] Environmental death — reason: ' + reason +
                ', floor: ' + FloorManager.getCurrentFloorId() +
                ', depth: ' + depth);

    if (depth <= 2) {
      // ── Non-lethal: bonfire respawn ──
      _nonLethalRespawn(reason);
    } else {
      // ── Depth 3: permadeath ──
      _lethalDeath(reason);
    }
  }

  /**
   * Non-lethal environmental death (depth 1-2).
   *
   * New path (as of hero cycle shift):
   *   - 25% currency penalty
   *   - Apply debuffs: GROGGY (1 day) + SORE (1 day) + HUMILIATED (1 day)
   *   - Restore HP/energy
   *   - Trigger floor transition to home ("1.6")
   *   - Fire _onDeathRescue callback for hero cycle shift
   *   - Show blackout message
   */
  function _nonLethalRespawn(reason) {
    var currentFloor = FloorManager.getCurrentFloorId();
    var depth = FloorManager.getFloorDepth();

    // Currency penalty (25% — less harsh than combat death's 50%)
    var penalty = Math.floor(Player.state().currency * 0.25);
    if (penalty > 0) {
      Player.state().currency -= penalty;
    }

    // Restore HP/energy
    Player.fullRestore();

    // Apply debuffs (1 day each)
    Player.applyDebuff('GROGGY', 1);
    Player.applyDebuff('SORE', 1);
    Player.applyDebuff('HUMILIATED', 1);

    HUD.updatePlayer(Player.state());

    // Show immediate feedback before transition
    var reasonStr = i18n.t('hazard.death_' + reason, 'Felled by ' + reason);
    var penaltyStr = penalty > 0
      ? ' (-' + penalty + ' ' + i18n.t('hazard.currency_lost', 'gold lost') + ')'
      : '';

    HUD.showCombatLog(
      '💀 You blacked out. The heroes found you.' + penaltyStr
    );

    SessionStats.inc('environmentalDeaths');
    AudioSystem.play('enemy-death', { volume: 0.5 });

    // Fire rescue callback so game.js can shift hero cycle and handle transition
    if (_onDeathRescue) {
      _onDeathRescue({
        reason: reason,
        floorId: currentFloor,
        depth: depth
      });
    }

    console.log('[HazardSystem] Non-lethal death rescue triggered. Reason: ' + reason +
                ', Current floor: ' + currentFloor + ', Depth: ' + depth +
                ', Penalty: ' + penalty + ', Transitioning to home "1.6"');
  }

  /**
   * Lethal environmental death (depth 3).
   *
   * New path (as of hero cycle shift):
   *   - 50% currency penalty via Player.onDeath()
   *   - Apply debuffs: GROGGY (1 day) + SORE (1 day) + HUMILIATED (1 day) + SHAKEN (2 days)
   *   - Restore HP/energy
   *   - Trigger floor transition to home ("1.6")
   *   - Fire _onDeathRescue callback for hero cycle shift
   *   - Show dramatic blackout message
   *   - No longer triggers game over
   */
  function _lethalDeath(reason) {
    var currentFloor = FloorManager.getCurrentFloorId();
    var depth = FloorManager.getFloorDepth();

    // Player.onDeath handles 50% currency penalty and inventory scatter
    var dropped = Player.onDeath();
    // TODO: FloorManager.scatterLoot(dropped, Player.getPos());

    // Restore HP/energy
    Player.fullRestore();

    // Apply heavy debuffs (depth 3 experience is traumatic)
    Player.applyDebuff('GROGGY', 1);
    Player.applyDebuff('SORE', 1);
    Player.applyDebuff('HUMILIATED', 1);
    Player.applyDebuff('SHAKEN', 2);  // Extra severity at depth 3

    HUD.updatePlayer(Player.state());

    // Show immediate feedback before transition
    HUD.showCombatLog(
      '💀 The heroes dragged you out. You\'ll remember this.'
    );

    SessionStats.inc('environmentalDeaths');
    AudioSystem.play('explosion-big', { volume: 0.6 });

    // Fire rescue callback so game.js can shift hero cycle and handle transition
    if (_onDeathRescue) {
      _onDeathRescue({
        reason: reason,
        floorId: currentFloor,
        depth: depth
      });
    }

    console.log('[HazardSystem] Lethal death rescue triggered. Reason: ' + reason +
                ', Current floor: ' + currentFloor + ', Depth: ' + depth +
                ', Transitioning to home "1.6" with heavy debuffs');
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    init: init,
    setOnDeathRescue: setOnDeathRescue,
    clearBonfires: clearBonfires,
    restAtBonfire: restAtBonfire,
    consumeMorningRecap: consumeMorningRecap,
    checkTile: checkTile,

    // §9b: REST face reads last rest outcome for status feedback
    getLastRestResult: function () { return _lastRestResult; },
    clearLastRestResult: function () { _lastRestResult = null; },

    // M2 save/load hooks — SaveState reads/writes the bonfire-respawn map
    // across floors. Returns a shallow copy; setter replaces wholesale.
    getBonfirePositions: function () {
      var out = {};
      for (var k in _bonfirePositions) {
        if (_bonfirePositions.hasOwnProperty(k)) {
          var p = _bonfirePositions[k];
          out[k] = { x: p.x, y: p.y };
        }
      }
      return out;
    },
    setBonfirePositions: function (map) {
      _bonfirePositions = {};
      if (!map) return;
      for (var k in map) {
        if (map.hasOwnProperty(k) && map[k] && typeof map[k].x === 'number') {
          _bonfirePositions[k] = { x: map[k].x, y: map[k].y };
        }
      }
    },

    // Expose for testing / debug
    HAZARD_DAMAGE: HAZARD_DAMAGE
  };
})();

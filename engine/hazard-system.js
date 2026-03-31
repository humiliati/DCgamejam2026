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
  }

  // ── Bonfire interaction ──────────────────────────────────────────

  /**
   * Rest at a bonfire tile. Called from game.js _interact when
   * the tile in front of the player is BONFIRE.
   *
   * @param {number} bx - Bonfire tile X
   * @param {number} by - Bonfire tile Y
   */
  function restAtBonfire(bx, by) {
    var floorId = FloorManager.getFloor();

    // Save this bonfire as the respawn point for this floor
    _bonfirePositions[floorId] = { x: bx, y: by };

    // Full restore
    Player.fullRestore();
    HUD.updatePlayer(Player.state());

    // Feedback
    HUD.showCombatLog(i18n.t('hazard.bonfire_rest', '🔥 Rested at bonfire — HP & energy restored'));
    AudioSystem.play('ui-confirm', { volume: 0.5 });

    SessionStats.inc('bonfiresUsed');

    console.log('[HazardSystem] Rested at bonfire (' + bx + ',' + by + ') on floor ' + floorId);
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
    checkTile: checkTile,

    // Expose for testing / debug
    HAZARD_DAMAGE: HAZARD_DAMAGE
  };
})();

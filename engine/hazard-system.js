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

  function init(cbs) {
    cbs = cbs || {};
    _onGameOver = cbs.onGameOver || null;
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
   * Adapted from CombatBridge's non-lethal defeat path:
   *   - 25% currency penalty (lighter than combat death's 50%)
   *   - Respawn at bonfire or stairs-up
   *   - Full HP/energy restore
   *   - Brief blackout message
   */
  function _nonLethalRespawn(reason) {
    // Currency penalty (25% — less harsh than combat death's 50%)
    var penalty = Math.floor(Player.state().currency * 0.25);
    if (penalty > 0) {
      Player.state().currency -= penalty;
    }

    // Restore HP/energy
    Player.fullRestore();

    // Teleport to respawn point
    var respawn = _getRespawnPos();
    Player.setPos(respawn.x, respawn.y);
    MC.setPosition(respawn.x, respawn.y, Player.getDir());

    HUD.updatePlayer(Player.state());

    // Build message
    var reasonStr = i18n.t('hazard.death_' + reason, 'Felled by ' + reason);
    var penaltyStr = penalty > 0
      ? ' (-' + penalty + ' ' + i18n.t('hazard.currency_lost', 'gold lost') + ')'
      : '';
    var bonfireStr = _bonfirePositions[FloorManager.getFloor()]
      ? i18n.t('hazard.respawn_bonfire', 'Respawned at bonfire.')
      : i18n.t('hazard.respawn_entrance', 'Returned to entrance.');

    HUD.showCombatLog(
      '💀 ' + reasonStr + penaltyStr + '\n' + bonfireStr
    );

    SessionStats.inc('environmentalDeaths');
    AudioSystem.play('enemy-death', { volume: 0.5 });

    console.log('[HazardSystem] Non-lethal respawn at (' +
                respawn.x + ',' + respawn.y + '), penalty: ' + penalty);
  }

  /**
   * Lethal environmental death (depth 3).
   *
   * Mirrors combat lethal defeat:
   *   - Player.onDeath() (50% currency, inventory scatter stub)
   *   - Game over screen
   */
  function _lethalDeath(reason) {
    var dropped = Player.onDeath();
    // TODO: FloorManager.scatterLoot(dropped, Player.getPos());

    SessionStats.inc('environmentalDeaths');

    HUD.showCombatLog(
      '💀 ' + i18n.t('hazard.permadeath_' + reason,
        'Killed by ' + reason + ' in the deep dungeon')
    );

    AudioSystem.play('explosion-big', { volume: 0.6 });

    if (_onGameOver) _onGameOver();
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    init: init,
    clearBonfires: clearBonfires,
    restAtBonfire: restAtBonfire,
    checkTile: checkTile,

    // Expose for testing / debug
    HAZARD_DAMAGE: HAZARD_DAMAGE
  };
})();

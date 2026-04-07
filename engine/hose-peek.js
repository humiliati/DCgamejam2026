/**
 * HosePeek — Pressure-wash hose pickup interaction (PW-2).
 *
 * When the player faces a DUMP_TRUCK tile and presses OK, this module:
 *   1. Validates the truck is deployed on the current floor (DumpTruckSpawner)
 *   2. Resolves the active hero contract (DungeonSchedule) to derive the
 *      building the hose is bound to (floorIds[0] minus its leaf segment)
 *   3. Calls HoseState.attach(buildingId, exteriorFloorId, currentFloorId, x, y)
 *   4. Shows a confirmation toast + splash burst, plays a confirm sfx
 *
 * When the truck is parked at home (no active hero day), pickup is refused:
 * the hazmat coworker barks "no deployments today" instead. This keeps the
 * hose on-rails with the jam's three hero contracts — no free-roam spraying.
 *
 * If the hose is already active, pickup no-ops with a "already carrying"
 * toast. Drop/retract belongs to HoseReel (later increment).
 *
 * ── Roadmap divergence (intentional) ──
 * PRESSURE_WASHING_ROADMAP §2.1 spec'd two tile constants: TILES.TRUCK (body)
 * + TILES.TRUCK_HOSE (interactive cutout). The current implementation uses a
 * single TILES.DUMP_TRUCK that represents the whole vehicle, since the truck
 * sprite is a 2-tile billboard and splitting the grid cells would duplicate
 * texture/height/wall-decor entries for no visual gain at jam scale. The
 * entire DUMP_TRUCK footprint is interactive — player faces either tile.
 *
 * Layer 3 — depends on: TILES, Player, MovementController, FloorManager,
 *                       DumpTruckSpawner, DungeonSchedule, HoseState,
 *                       Toast, AudioSystem, WaterCursorFX (soft),
 *                       BarkLibrary (soft), i18n
 */
var HosePeek = (function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Resolve the currently-active hero contract (hero day == today).
   * Returns null if no contract is active (truck is at home).
   */
  function _getActiveContract() {
    if (typeof DungeonSchedule === 'undefined') return null;
    if (!DungeonSchedule.getSchedule || !DungeonSchedule.getCurrentDay) return null;

    var schedule = DungeonSchedule.getSchedule();
    var today = DungeonSchedule.getCurrentDay();
    for (var i = 0; i < schedule.length; i++) {
      var c = schedule[i];
      if (!c.resolved && c.actualDay === today) return c;
    }
    return null;
  }

  /**
   * Derive the building id from a dungeon floor id by stripping the leaf.
   *   "1.3.1"   → "1.3"
   *   "2.2.1"   → "2.2"
   *   "3.1.1"   → "3.1"
   *   "2.2"     → "2"    (degenerate — shouldn't happen for jam contracts)
   */
  function _buildingOf(floorId) {
    if (!floorId) return null;
    var parts = floorId.split('.');
    if (parts.length <= 1) return floorId;
    parts.pop();
    return parts.join('.');
  }

  /**
   * Derive the exterior (depth-1) floor id from any nested floor id.
   *   "1.3.1" → "1",  "2.2.1" → "2",  "3.1.2" → "3"
   */
  function _exteriorOf(floorId) {
    if (!floorId) return null;
    return floorId.split('.')[0];
  }

  /**
   * Locate a canvas-space screen position for the splash burst. Prefer the
   * actual pointer if active (hover click); fall back to the viewport center.
   */
  function _burstPos() {
    var canvas = document.getElementById('view-canvas');
    var cx = canvas ? canvas.width  / 2 : 320;
    var cy = canvas ? canvas.height * 0.5 : 200;
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var p = InputManager.getPointer();
      if (p && p.active) return { x: p.x, y: p.y };
    }
    return { x: cx, y: cy };
  }

  function _splash() {
    if (typeof WaterCursorFX === 'undefined') return;
    var pos = _burstPos();
    WaterCursorFX.spawnBurst(pos.x, pos.y, { count: 22, speedMult: 1.15, upward: true });
  }

  function _toast(msg, kind) {
    if (typeof Toast !== 'undefined') Toast.show(msg, kind || 'info');
  }

  function _sfx(id, vol) {
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play(id, { volume: vol == null ? 0.5 : vol });
    }
  }

  function _bark(poolId) {
    if (typeof BarkLibrary !== 'undefined' && BarkLibrary.fire) {
      BarkLibrary.fire(poolId);
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Attempt to grab the hose off the truck the player is facing.
   *
   * @param {number} fx — truck tile x (the tile the player is facing)
   * @param {number} fy — truck tile y
   * @param {string} currentFloorId — floor the player is on right now
   * @returns {boolean} true if pickup succeeded (or was blocked by intentional
   *                    rules like "already carrying"), false if no-op.
   */
  function tryGrab(fx, fy, currentFloorId) {
    if (typeof HoseState === 'undefined') return false;

    // Already carrying — ignore extra presses (drop belongs to HoseReel)
    if (HoseState.isActive()) {
      _toast('🧵 ' + (typeof i18n !== 'undefined'
        ? i18n.t('hose.already_carrying', 'Already carrying the hose')
        : 'Already carrying the hose'), 'dim');
      return true;
    }

    // Truck must actually be deployed on this floor
    if (typeof DumpTruckSpawner !== 'undefined' &&
        DumpTruckSpawner.isTruckOnFloor &&
        !DumpTruckSpawner.isTruckOnFloor(currentFloorId)) {
      // Shouldn't happen — tile is DUMP_TRUCK but spawner disagrees.
      // Fail quiet to avoid confusing the player.
      return false;
    }

    // Resolve the active contract. No contract = truck is parked at home.
    var contract = _getActiveContract();
    if (!contract || !contract.floorIds || contract.floorIds.length === 0) {
      // Off-duty: coworker snark instead of pickup.
      _toast('🐉 ' + (typeof i18n !== 'undefined'
        ? i18n.t('hose.no_deployment', 'No deployment today — truck\'s resting')
        : 'No deployment today — truck\'s resting'), 'dim');
      _bark('truck.hazmat_coworker.home');
      _sfx('ui-click', 0.3);
      return true;
    }

    var targetDungeon = contract.floorIds[0];
    var buildingId    = _buildingOf(targetDungeon);
    var exteriorId    = _exteriorOf(targetDungeon);

    if (!buildingId || !exteriorId) return false;

    // Attach. HoseState handles idempotency + rejects double-carry internally.
    var ok = HoseState.attach(buildingId, exteriorId, currentFloorId, fx, fy);
    if (!ok) return false;

    // ── First-grab discovery flag ─────────────────────────────────
    // Gates NPC dialogue branches (Watchman shifts from "go find the
    // hose" to "here's how to use it") and future tutorial hooks.
    var firstGrab = false;
    if (typeof Player !== 'undefined' && Player.getFlag && !Player.getFlag('hoseDiscovered')) {
      Player.setFlag('hoseDiscovered', true);
      firstGrab = true;
    }

    // Success juice
    _splash();
    _sfx('ui-confirm', 0.55);

    if (firstGrab) {
      // Expanded first-grab toast: orient the player on what just happened
      _toast('🧵 ' + (typeof i18n !== 'undefined'
        ? i18n.t('hose.first_grab', 'Hose attached! Head into the dungeon — it trails behind you. Watch your energy.')
        : 'Hose attached! Head into the dungeon — it trails behind you. Watch your energy.'), 'loot');
    } else {
      _toast('🧵 ' + (typeof i18n !== 'undefined'
        ? i18n.t('hose.grabbed', 'Hose attached — head for ' + (contract.label || buildingId))
        : 'Hose attached — head for ' + (contract.label || buildingId)), 'loot');
    }

    if (typeof SessionStats !== 'undefined' && SessionStats.inc) {
      SessionStats.inc('hosesGrabbed');
    }

    return true;
  }

  /**
   * Query whether the peek module has an overlay currently active. HosePeek
   * is a stateless interaction for now (no modal overlay) so this is always
   * false. Kept for parity with the peek contract so InteractPrompt's
   * _anyPeekActive() can include us later if an overlay is added.
   */
  function isActive() { return false; }

  /** No-op for parity with other peeks. */
  function forceHide() {}

  /** No-op init — reserved for future DOM scaffolding (hose-reel animation). */
  function init() {}

  return Object.freeze({
    init:       init,
    tryGrab:    tryGrab,
    isActive:   isActive,
    forceHide:  forceHide
  });
})();

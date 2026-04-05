/**
 * TorchHitResolver — collateral torch extinguish from hose spray.
 *
 * When the hose beam hits a tile (aimed or adjacent), this module scans
 * the target tile + 4 cardinal neighbors for TORCH_LIT and fires the
 * pressure-wash extinguish pipeline on each one found. It is the bridge
 * between "spray landed at (x,y)" and "torch slots mutated + visuals +
 * lighting + toast + stats." TorchState is data-only by design, so the
 * side effects live here.
 *
 * Per PRESSURE_WASHING_ROADMAP §7 this is the intentionally-inferior path:
 *   - Dry fuel slots are destroyed by the water blast.
 *   - Flame slot goes straight to empty (no hydration bonus).
 *   - Hydrated fuel survives.
 *   - Tile flips to TORCH_UNLIT, the light source is removed from the
 *     Lighting registry, the wall-decor cavity glow is cleared, and
 *     SessionStats tracks the kill.
 *
 * §7.3 "Adjacent splash" — the spray hits the aimed tile AND one tile in
 * each cardinal direction. This is deliberate: the player may knock out
 * a torch while cleaning a nearby floor tile and not even realize it.
 * That's the "hose is powerful but sloppy" fantasy.
 *
 * This module ships as a **pre-built clean interface** for PW-3's spray
 * system. PW-3's spray delivery layer (cursor aim, brush kernels, input
 * binding) doesn't exist yet — when it does, it calls onHoseHit(...) at
 * the end of its spray-resolution tick and torches handle themselves.
 * Until then, the resolver is manually triggerable for debug/testing and
 * is also called by TorchPeek's existing hose-extinguish button so that
 * code path matches spec (destructive, not hydrating).
 *
 * Layer 3 — depends on: TILES, FloorManager, TorchState, Lighting (soft),
 *                       WaterCursorFX (soft), SessionStats (soft),
 *                       AudioSystem (soft), Toast (soft), i18n (soft)
 */
var TorchHitResolver = (function () {
  'use strict';

  // Cardinal offsets: the aimed tile itself (0,0) plus N/S/E/W neighbors.
  var SPRAY_OFFSETS = [
    [ 0,  0],
    [ 1,  0],
    [-1,  0],
    [ 0,  1],
    [ 0, -1]
  ];

  // ── Helpers ───────────────────────────────────────────────────────

  function _tileAt(grid, W, H, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return -1;
    if (!grid[y]) return -1;
    return grid[y][x];
  }

  function _isLitTorchTile(t) {
    if (typeof TILES === 'undefined') return false;
    return t === TILES.TORCH_LIT;
  }

  function _removeLightSource(x, y) {
    if (typeof Lighting !== 'undefined' && Lighting.removeLightSource) {
      Lighting.removeLightSource(x, y);
    }
  }

  function _syncDecor(floorId, x, y) {
    if (typeof FloorManager !== 'undefined' && FloorManager.syncTorchDecor) {
      FloorManager.syncTorchDecor(floorId, x, y, false);
    }
  }

  function _fxBurst(x, y) {
    if (typeof WaterCursorFX !== 'undefined' && WaterCursorFX.spawnBurst) {
      // WaterCursorFX.spawnBurst signature varies across call sites in the
      // codebase; both screen-space (pixel) and tile-space calls exist. For
      // collateral extinguish we pass tile coords — matches how TorchPeek's
      // existing hose-extinguish button calls it.
      WaterCursorFX.spawnBurst(x, y, { count: 14, speedMult: 1.2, upward: false });
    }
  }

  function _sfx() {
    if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      AudioSystem.play('steam-hiss', { volume: 0.45 });
    }
  }

  function _stat(key, delta) {
    if (typeof SessionStats !== 'undefined' && SessionStats.inc) {
      SessionStats.inc(key, delta || 1);
    }
  }

  function _toast(count, ruined) {
    if (typeof Toast === 'undefined') return;
    var msg;
    if (count === 1) {
      msg = ruined > 0
        ? '💨 Torch doused — fuel soaked'
        : '💨 Torch doused';
    } else {
      msg = '💨 ' + count + ' torches doused';
    }
    Toast.show(msg, 'warning');
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Resolve a hose spray hit at a tile coordinate. Scans the target tile
   * plus the 4 cardinal neighbors for TORCH_LIT and applies the full
   * pressure-wash extinguish pipeline to each one found.
   *
   * Caller contract: HoseState should already be active. The resolver
   * does NOT re-validate hose state — callers (PW-3 spray, TorchPeek's
   * hose button, debug tools) are each responsible for gating.
   *
   * @param {string} floorId — floor the spray landed on
   * @param {number} cx      — center tile x (the aimed tile)
   * @param {number} cy      — center tile y
   * @returns {{
   *   tilesHit: Array<{x:number, y:number}>,
   *   count: number,
   *   slotsRuined: number,
   *   slotsSurvived: number
   * }}
   */
  function onHoseHit(floorId, cx, cy) {
    var result = { tilesHit: [], count: 0, slotsRuined: 0, slotsSurvived: 0 };

    if (typeof FloorManager === 'undefined' || typeof TorchState === 'undefined') {
      return result;
    }
    var fd = FloorManager.getFloorData();
    if (!fd || !fd.grid) return result;
    // The resolver only touches the currently-active floor. Cross-floor
    // hits are structurally impossible — the player is standing on fd.
    if (fd.floorId && fd.floorId !== floorId) return result;

    var grid = fd.grid;
    var W = fd.gridW || (grid[0] ? grid[0].length : 0);
    var H = fd.gridH || grid.length;

    for (var i = 0; i < SPRAY_OFFSETS.length; i++) {
      var ox = cx + SPRAY_OFFSETS[i][0];
      var oy = cy + SPRAY_OFFSETS[i][1];
      var t  = _tileAt(grid, W, H, ox, oy);
      if (!_isLitTorchTile(t)) continue;

      var summary = TorchState.pressureWashExtinguish(floorId, ox, oy, grid);
      if (!summary || !summary.extinguished) continue;

      // Side effects — fire once per extinguished torch.
      _removeLightSource(ox, oy);
      _syncDecor(floorId, ox, oy);
      _fxBurst(ox, oy);

      result.tilesHit.push({ x: ox, y: oy });
      result.count++;
      result.slotsRuined   += summary.slotsRuined;
      result.slotsSurvived += summary.slotsSurvived;
    }

    if (result.count > 0) {
      _sfx();
      _stat('torchesExtinguished', result.count);
      if (result.slotsRuined > 0) _stat('torchSlotsRuined', result.slotsRuined);
      _toast(result.count, result.slotsRuined);
    }

    return result;
  }

  /**
   * Debug helper: trigger a hit at the tile the player is currently
   * facing. Useful from the browser console when PW-3 spray isn't wired
   * yet but we need to smoke-test the pipeline end-to-end.
   *
   * Console use:
   *   TorchHitResolver.debugHitFacing()
   */
  function debugHitFacing() {
    if (typeof Player === 'undefined' || typeof MC === 'undefined' ||
        typeof FloorManager === 'undefined') return null;
    var p   = Player.getPos();
    var dir = Player.getDir();
    var fx  = p.x + MC.DX[dir];
    var fy  = p.y + MC.DY[dir];
    return onHoseHit(FloorManager.getCurrentFloorId(), fx, fy);
  }

  return Object.freeze({
    onHoseHit:       onHoseHit,
    debugHitFacing:  debugHitFacing,
    SPRAY_OFFSETS:   SPRAY_OFFSETS
  });
})();

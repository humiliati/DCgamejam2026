/**
 * DumpTruckSprites — Spawns a hose-reel emoji billboard inside the
 * DUMP_TRUCK freeform cavity.
 *
 * Mirror of BonfireSprites for HEARTH: the tile is a HEARTH-stature
 * freeform sandwich (2.0 wallHeight) whose middle band is a see-through
 * cavity at world Y 0.10–0.50 — "practically on the ground." The gap
 * filler itself (truck_spool_cavity in raycaster.js) paints only a
 * subtle cool-blue glow, matching hearth_fire's warm-glow pattern.
 *
 * This module emits a 🧵 spool glyph as a billboard sprite at the tile
 * center. The z-bypass path in the raycaster (which already covers
 * TILES.DUMP_TRUCK / freeform tiles) lets the billboard render even
 * though the truck's front face is closer to the camera. The
 * `groundLevel: true` flag shifts the sprite center DOWN by ~35% of
 * its screen height so the glyph lands inside the low cavity instead
 * of at eye level.
 *
 * Wheels on the side faces are wallDecor sprites registered elsewhere
 * (floor-manager.js _buildWallDecorFromGrid for static spawns and the
 * rebuildDumpTruckDecor helper for the scheduled node circuit).
 *
 * Sprite objects use the same schema the raycaster expects:
 * { x, y, emoji, emojiOverlay, scale, glow, groundLevel, ... }
 *
 * Game.js calls buildSprites(floorId) each frame in the sprite
 * compilation loop. Results are cached per floorId — sprites rebuild
 * only on floor change. DumpTruckSpawner calls clearCache() whenever
 * it stamps or clears truck tiles so the node-circuit relocation
 * picks up the new positions immediately.
 *
 * Layer 1 (depends on: TILES)
 */
var DumpTruckSprites = (function () {
  'use strict';

  // ── Sprite config ──────────────────────────────────────────────
  var HOSE = {
    emoji: '\uD83E\uDDF5',  // 🧵 (spool of thread — reads as hose reel)
    scale: 0.55,             // Billboard size; tuned with groundLevel shift
                             // to land inside the 0.10–0.50 world-Y cavity.
    glow: '#4488cc',         // Cool blue glow — water / cleaning theme
    glowRadius: 3            // Subtle halo — mechanical equipment, not fire
  };

  var NOZZLE_OVERLAY = {
    emoji: '\uD83D\uDD27',  // 🔧 (wrench — reads as nozzle attachment)
    opacity: 0.35,           // Translucent — spool shows through
    scale: 1.05,             // Slightly larger to frame the spool
    offX: 0,
    offY: -1                 // Nudge up so the wrench sits above the reel
  };

  // ── Bob animation ──────────────────────────────────────────────
  // Mechanical sway (slower than a flame, tighter amplitude)
  var BOB_AMP    = 0.4;      // Gentle sway — heavy equipment drift
  var BOB_PERIOD = 2400;     // Slow cycle — mechanical, not organic

  // ── Cache ───────────────────────────────────────────────────────
  var _cachedFloorId = null;
  var _cachedSprites = [];

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Build sprites for every DUMP_TRUCK tile on the current floor.
   * Cached per floorId — rebuilt only when the floor changes or
   * DumpTruckSpawner calls clearCache() after relocating the truck.
   *
   * @param {string} floorId
   * @param {Array<Array<number>>} grid
   * @param {number} gridW
   * @param {number} gridH
   * @returns {Array} sprite objects for the raycaster
   */
  function buildSprites(floorId, grid, gridW, gridH) {
    if (floorId === _cachedFloorId) return _cachedSprites;

    _cachedSprites = [];
    _cachedFloorId = floorId;

    if (!grid || !gridW || !gridH) return _cachedSprites;

    var truckTile = (typeof TILES !== 'undefined') ? TILES.DUMP_TRUCK : 38;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] !== truckTile) continue;
        // Position at grid index — _renderSprites adds 0.5 to center.
        // groundLevel: true shifts the sprite DOWN by ~35% of its
        // screen height so the glyph lands inside the low cavity
        // (world Y 0.10–0.50) instead of at the player's eye level.
        _cachedSprites.push({
          x: gx,
          y: gy,
          emoji:        HOSE.emoji,
          emojiOverlay: NOZZLE_OVERLAY,
          scale:        HOSE.scale,
          glow:         HOSE.glow,
          glowRadius:   HOSE.glowRadius,
          groundLevel:  true,   // drops sprite center into the low cavity
          dumpTruck:    true,
          noFogFade:    false,  // equipment fades with distance
          bobY:         0       // set by animate() each frame
        });
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate sprites each render frame — gentle vertical bob so the
   * reel feels alive without detaching from its slot.
   *
   * @param {number} now — performance.now() or Date.now()
   */
  function animate(now) {
    if (_cachedSprites.length === 0) return;
    var phase  = (now % BOB_PERIOD) / BOB_PERIOD;
    var offset = Math.sin(phase * Math.PI * 2) * BOB_AMP;
    for (var i = 0; i < _cachedSprites.length; i++) {
      _cachedSprites[i].bobY = offset;
    }
  }

  /**
   * Equipment doesn't sway horizontally.
   */
  function getAnimatedX(sprite) {
    return 0;
  }

  /**
   * Clear the cache (call on floor transition or after the spawner
   * relocates the truck on its scheduled node circuit).
   */
  function clearCache() {
    _cachedFloorId = null;
    _cachedSprites = [];
  }

  return Object.freeze({
    buildSprites: buildSprites,
    animate:      animate,
    clearCache:   clearCache,
    getAnimatedX: getAnimatedX
  });
})();

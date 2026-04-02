/**
 * BonfireSprites — Spawns billboard tent sprite for BONFIRE tiles.
 *
 * When a floor is generated with BONFIRE tiles (TILES.BONFIRE = 18),
 * this module creates a tent (⛺) emoji sprite positioned at the tile center.
 *
 * A4.5 REWORK: Fire (🔥) is now handled by the wall decor cavity glow system
 * in the raycaster — the bonfire tile renders as a 0.3× short stone ring wall
 * with a fire emoji cavity decor item and warm glow overlay. Shrubs (🌿)
 * removed — the stone ring texture reads as self-contained without them.
 * The tent billboard sits above the short wall, visible as the camp marker.
 *
 * The sprite objects are returned in the same format the raycaster
 * expects: { x, y, emoji, scale, groundLevel, facing, ... }
 *
 * Game.js calls buildSprites(floorId) each frame in the sprite
 * compilation loop, after enemies and corpses. The result is cached
 * per floor — sprites are rebuilt only on floor change.
 *
 * Layer 1 (depends on: TILES)
 */
var BonfireSprites = (function () {
  'use strict';

  // ── Sprite config ──────────────────────────────────────────────
  var TENT = {
    emoji: '\u26FA',     // ⛺
    scale: 0.50,         // Half-wall height billboard
    offX: 0,
    offY: 0
  };

  // ── Cache ───────────────────────────────────────────────────────
  var _cachedFloorId = null;
  var _cachedSprites = [];

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Build sprites for all BONFIRE tiles on the current floor.
   * Results are cached per floorId — only rebuilds on floor change.
   *
   * @param {string} floorId — current floor string ID
   * @param {Array<Array<number>>} grid — 2D tile grid
   * @param {number} gridW
   * @param {number} gridH
   * @returns {Array} sprite objects for the raycaster
   */
  function buildSprites(floorId, grid, gridW, gridH) {
    if (floorId === _cachedFloorId) return _cachedSprites;

    _cachedSprites = [];
    _cachedFloorId = floorId;

    if (!grid || !gridW || !gridH) return _cachedSprites;

    var bonfireTile = (typeof TILES !== 'undefined') ? TILES.BONFIRE : 18;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] === bonfireTile) {
          // Tent billboard centered on tile
          _cachedSprites.push({
            x: gx + 0.5 + TENT.offX,
            y: gy + 0.5 + TENT.offY,
            emoji: TENT.emoji,
            scale: TENT.scale,
            bonfire: true,
            bonfireType: 'tent'
          });
        }
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate bonfire sprites (call each render frame).
   * Tent is static — no animation needed after fire/shrub removal.
   * Kept as no-op for API compatibility with Game.js call site.
   *
   * @param {number} now — performance.now() or Date.now()
   */
  function animate(now) {
    // No-op: tent is static. Fire flicker is now handled by
    // Lighting.js flicker system on the bonfire light source.
  }

  /**
   * Get the animated world X for a sprite (accounts for sway).
   * Returns 0 — tent doesn't sway.
   */
  function getAnimatedX(sprite) {
    return 0;
  }

  /**
   * Clear the cache (call on floor transition).
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

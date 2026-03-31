/**
 * BonfireSprites — Spawns billboard sprite groups for BONFIRE tiles.
 *
 * When a floor is generated with BONFIRE tiles (TILES.BONFIRE = 18),
 * this module creates a composition of emoji sprites:
 *   - Tent (⛺) at half-wall height, centered on the tile
 *   - Fire (🔥) at ground level, slightly in front
 *   - 4 shrubs (🌿) in a C-shape surrounding the bonfire
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

  // ── Sprite composition config ───────────────────────────────────
  // Offsets are in grid units (0.0–1.0 within the tile).
  var TENT = {
    emoji: '\u26FA',     // ⛺
    scale: 0.50,         // Half-wall height billboard
    offX: 0,
    offY: 0
  };

  var FIRE = {
    emoji: '\uD83D\uDD25',  // 🔥
    scale: 0.18,
    offX: 0,
    offY: 0.15               // Slightly south (toward player approach)
  };

  // C-shape opening toward south (player's usual approach from north)
  var SHRUBS = [
    { emoji: '\uD83C\uDF3F', scale: 0.28, offX: -0.35, offY: -0.25 },  // NW
    { emoji: '\uD83C\uDF3F', scale: 0.25, offX: -0.38, offY:  0.15 },  // SW
    { emoji: '\uD83C\uDF3F', scale: 0.28, offX:  0.35, offY: -0.25 },  // NE
    { emoji: '\uD83C\uDF3F', scale: 0.25, offX:  0.38, offY:  0.15 }   // SE
  ];

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
          _spawnGroup(gx, gy);
        }
      }
    }

    return _cachedSprites;
  }

  /**
   * Spawn a bonfire sprite group at grid position (gx, gy).
   * Adds sprites to _cachedSprites.
   */
  function _spawnGroup(gx, gy) {
    // Center of tile
    var cx = gx + 0.5;
    var cy = gy + 0.5;

    // Tent (main billboard)
    _cachedSprites.push({
      x: cx + TENT.offX,
      y: cy + TENT.offY,
      emoji: TENT.emoji,
      scale: TENT.scale,
      bonfire: true,       // Tag for identification
      bonfireType: 'tent'
    });

    // Fire (ground level, slight bob animation handled via bobY)
    _cachedSprites.push({
      x: cx + FIRE.offX,
      y: cy + FIRE.offY,
      emoji: FIRE.emoji,
      scale: FIRE.scale,
      bonfire: true,
      bonfireType: 'fire',
      bobY: 0              // Updated per-frame for flicker
    });

    // Shrubs (C-shape)
    for (var i = 0; i < SHRUBS.length; i++) {
      var sh = SHRUBS[i];
      _cachedSprites.push({
        x: cx + sh.offX,
        y: cy + sh.offY,
        emoji: sh.emoji,
        scale: sh.scale,
        bonfire: true,
        bonfireType: 'shrub',
        _shrubIdx: i
      });
    }
  }

  /**
   * Animate bonfire sprites (call each render frame).
   * Fire wobbles vertically; shrubs sway horizontally.
   * Mutates the cached sprite objects in-place.
   *
   * @param {number} now — performance.now() or Date.now()
   */
  function animate(now) {
    for (var i = 0; i < _cachedSprites.length; i++) {
      var s = _cachedSprites[i];
      if (!s.bonfire) continue;

      if (s.bonfireType === 'fire') {
        // Vertical flicker: ±0.015 world units at ~3Hz
        s.bobY = Math.sin(now * 0.006) * 0.015;
      } else if (s.bonfireType === 'shrub') {
        // Horizontal sway: shift x slightly at ~0.5Hz, per-shrub phase offset
        var phase = (s._shrubIdx || 0) * 1.7;
        s._swayX = Math.sin(now * 0.001 + phase) * 0.02;
      }
    }
  }

  /**
   * Get the animated world X for a sprite (accounts for sway).
   * Used if the sprite compilation wants to apply sway offsets.
   */
  function getAnimatedX(sprite) {
    return (sprite._swayX || 0);
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

/**
 * BonfireSprites — Spawns dragonfire emoji billboards for fire-source tiles.
 *
 * When a floor is generated with BONFIRE tiles (TILES.BONFIRE = 18) OR
 * HEARTH tiles (TILES.HEARTH = 29), this module creates a 🔥+🐉 dragonfire
 * emoji sprite at the tile center. The billboard sits above the short stone
 * ring wall (0.3× height for BONFIRE) or inside the freeform cavity (HEARTH),
 * matching the mailbox composition pattern: opaque short wall + emoji
 * billboard above (or the freeform sandwich + billboard inside the cavity).
 *
 * The dragon emoji (🐉) renders as a translucent overlay on top of the flame
 * via the raycaster's emojiOverlay system. This is the canonical "Dragonfire"
 * visual — same composition on all fire source tiles, container wall varies
 * by biome depth.
 *
 * The sprite objects are returned in the same format the raycaster
 * expects: { x, y, emoji, emojiOverlay, scale, glow, ... }
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
  var FIRE = {
    emoji: '\uD83D\uDD25',  // 🔥
    scale: 0.45,             // Billboard size relative to wall height
    glow: '#ff7830',         // Warm orange glow halo
    glowRadius: 4            // Glow extent in world units
  };

  var DRAGON_OVERLAY = {
    emoji: '\uD83D\uDC09',  // 🐉
    opacity: 0.40,           // Translucent — visible silhouette, fire shows through
    scale: 1.15,             // Slightly larger than flame to frame it
    offX: 0,
    offY: -1                 // Nudge up slightly — dragon perches above flame center
  };

  // ── Bob animation ──────────────────────────────────────────────
  var BOB_AMP    = 0.6;      // Gentle vertical bob amplitude (pixels)
  var BOB_PERIOD = 1200;     // Bob cycle ms (slow flame drift)

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
    var hearthTile  = (typeof TILES !== 'undefined') ? TILES.HEARTH  : 29;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        var t = grid[gy][gx];
        if (t === bonfireTile || t === hearthTile) {
          // Position at grid index — _renderSprites adds 0.5 to center.
          // HEARTH gets a MUCH bigger flame (2.5x the bonfire size) so
          // the dragonfire glyph fills the freeform fire cavity bounded
          // by the hUpper stone mantle and hLower base stone. At default
          // bonfire scale the glyph reads too small inside the hearth's
          // tall cavity.
          var isHearth = (t === hearthTile);
          _cachedSprites.push({
            x: gx,
            y: gy,
            emoji: FIRE.emoji,
            emojiOverlay: DRAGON_OVERLAY,
            scale: isHearth ? (FIRE.scale * 2.5) : FIRE.scale,
            glow: FIRE.glow,
            glowRadius: FIRE.glowRadius,
            bonfire: true,
            bonfireType: 'dragonfire',
            hearth: isHearth,
            noFogFade: true,
            bobY: 0   // Set by animate() each frame
          });
        }
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate bonfire sprites (call each render frame).
   * Gentle vertical bob for flame drift effect.
   *
   * @param {number} now — performance.now() or Date.now()
   */
  function animate(now) {
    if (_cachedSprites.length === 0) return;

    var phase = (now % BOB_PERIOD) / BOB_PERIOD;
    var offset = Math.sin(phase * Math.PI * 2) * BOB_AMP;

    for (var i = 0; i < _cachedSprites.length; i++) {
      _cachedSprites[i].bobY = offset;
    }
  }

  /**
   * Get the animated world X for a sprite (accounts for sway).
   * Returns 0 — fire doesn't sway horizontally.
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

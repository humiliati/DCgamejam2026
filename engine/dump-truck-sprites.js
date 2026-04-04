/**
 * DumpTruckSprites — Spawns hose-reel emoji billboard for DUMP_TRUCK tiles.
 *
 * When a floor is generated with DUMP_TRUCK tiles (TILES.DUMP_TRUCK = 38),
 * this module creates a 🧵 hose-reel emoji sprite at the tile center.
 * The billboard sits above the short truck body wall (0.5× height), matching
 * the bonfire composition pattern: opaque short wall + emoji billboard above.
 *
 * The spool emoji (🧵) represents the pressure-wash hose reel mounted on
 * the truck. The overlay 🔧 wrench represents the nozzle/wand attachment.
 *
 * Sprite objects are returned in the same format the raycaster expects:
 * { x, y, emoji, emojiOverlay, scale, glow, ... }
 *
 * Game.js calls buildSprites(floorId) each frame in the sprite
 * compilation loop, after BonfireSprites and MailboxSprites.
 * Result is cached per floor — sprites rebuild only on floor change.
 *
 * Layer 1 (depends on: TILES)
 */
var DumpTruckSprites = (function () {
  'use strict';

  // ── Sprite config ──────────────────────────────────────────────
  var HOSE = {
    emoji: '\uD83E\uDDF5',  // 🧵 (thread/spool — represents hose reel)
    scale: 0.55,             // Billboard size relative to wall height
    glow: '#4488cc',         // Cool blue glow (water/cleaning theme)
    glowRadius: 2            // Subtle glow — not a fire source
  };

  var NOZZLE_OVERLAY = {
    emoji: '\uD83D\uDD27',  // 🔧 (wrench — represents pressure nozzle attachment)
    opacity: 0.35,           // Translucent — spool shows through
    scale: 1.1,              // Slightly larger to frame the spool
    offX: 0,
    offY: -1                 // Nudge up — nozzle perches above spool center
  };

  // ── Bob animation ──────────────────────────────────────────────
  // Gentle sway to give life — slower than fire (mechanical, not organic)
  var BOB_AMP    = 0.3;      // Very subtle bob (equipment, not flame)
  var BOB_PERIOD = 2400;     // Slow cycle — heavy equipment drift

  // ── Cache ───────────────────────────────────────────────────────
  var _cachedFloorId = null;
  var _cachedSprites = [];

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Build sprites for all DUMP_TRUCK tiles on the current floor.
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

    var dumpTruckTile = (typeof TILES !== 'undefined') ? TILES.DUMP_TRUCK : 38;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] === dumpTruckTile) {
          // Position at grid index — _renderSprites adds 0.5 to center
          _cachedSprites.push({
            x: gx,
            y: gy,
            emoji: HOSE.emoji,
            emojiOverlay: NOZZLE_OVERLAY,
            scale: HOSE.scale,
            glow: HOSE.glow,
            glowRadius: HOSE.glowRadius,
            dumpTruck: true,
            noFogFade: false,   // Equipment fades with distance (not magical)
            bobY: 0             // Set by animate() each frame
          });
        }
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate dump truck sprites (call each render frame).
   * Gentle vertical bob for mechanical sway.
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
   * Returns 0 — equipment doesn't sway horizontally.
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

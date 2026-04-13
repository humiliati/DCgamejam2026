/**
 * BonfireSprites — Spawns dragonfire emoji billboards for fire-source tiles.
 *
 * When a floor is generated with BONFIRE tiles (TILES.BONFIRE = 18),
 * HEARTH tiles (TILES.HEARTH = 29), or CITY_BONFIRE tiles
 * (TILES.CITY_BONFIRE = 69), this module creates a 🔥+🐉 dragonfire
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

    var bonfireTile    = (typeof TILES !== 'undefined') ? TILES.BONFIRE      : 18;
    var hearthTile     = (typeof TILES !== 'undefined') ? TILES.HEARTH       : 29;
    var cityBonfTile   = (typeof TILES !== 'undefined') ? TILES.CITY_BONFIRE : 69;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        var t = grid[gy][gx];
        if (t !== bonfireTile && t !== hearthTile && t !== cityBonfTile) continue;

        // Per-tile-type emoji billboard config. Scale multiplier on
        // FIRE.scale controls billboard size; larger cavities need
        // bigger flames so the glyph fills the opening.
        //
        // HEARTH: tall freeform cavity (hUpper–hLower gap) at 1.6×
        //   wallHeight → 2.5× scale fills the cavity.
        // CITY_BONFIRE: massive freeform column at 2.0× wallHeight,
        //   cavity between hLower 0.50 and hUpper 0.80 → 3.0× scale.
        // BONFIRE: short step-fill ring at 0.3× wallHeight → base scale.
        var isHearth     = (t === hearthTile);
        var isCityBonf   = (t === cityBonfTile);
        var scaleMult    = isCityBonf ? 3.0 : isHearth ? 2.5 : 1.0;

        _cachedSprites.push({
          x: gx,
          y: gy,
          emoji: FIRE.emoji,
          emojiOverlay: DRAGON_OVERLAY,
          scale: FIRE.scale * scaleMult,
          glow: FIRE.glow,
          glowRadius: isCityBonf ? 6 : FIRE.glowRadius,
          bonfire: true,
          bonfireType: 'dragonfire',
          hearth: isHearth,
          cityBonfire: isCityBonf,
          noFogFade: true,
          domSprite: true,  // suppress emoji billboard from frame 0
          bobY: 0   // Set by animate() each frame
        });
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

  // ── DOM Sprite Layer registration (CSS dragonfire overlays) ─────
  // The dragonfire HTML template — 8 particles + head with eye.
  var _DF_HTML =
    '<div class="df-flame">' +
      '<div class="df-head"></div>' +
      '<div class="df-eye"></div>' +
      '<div class="df-flames">' +
        '<div class="df-particle"></div><div class="df-particle"></div>' +
        '<div class="df-particle"></div><div class="df-particle"></div>' +
        '<div class="df-particle"></div><div class="df-particle"></div>' +
        '<div class="df-particle"></div><div class="df-particle"></div>' +
      '</div>' +
    '</div>';

  /**
   * Register CSS dragonfire sprites via SpriteLayer for all fire tiles
   * on the current floor. Call AFTER buildSprites() so _cachedSprites
   * is populated with tile coordinates.
   *
   * SpriteLayer.clear() is called automatically on floor transitions
   * by Game.js, so we don't need to track IDs for cleanup.
   */
  function registerDOMSprites() {
    if (typeof SpriteLayer === 'undefined') return;
    if (!_cachedSprites.length) return;

    // Mark all cached sprites so the raycaster skips the emoji billboard
    // for tiles that now have a CSS DOM overlay instead.
    for (var i = 0; i < _cachedSprites.length; i++) {
      _cachedSprites[i].domSprite = true;
    }

    // Per-tile-type DOM sprite config.
    //
    // scale: billboard projection size (distance-based). Larger = more
    //   screen coverage at the same distance.
    // worldOffsetY: vertical push below eye-level horizon. Positive =
    //   downward. Tuned so the sprite sits inside each tile's cavity:
    //   - HEARTH: cavity at ~0.35 below center (freeform hUpper/hLower)
    //   - CITY_BONFIRE: cavity higher on a 2× tall column, offset 0.20
    //   - BONFIRE: step-fill ring near floor level, offset 0.45
    // alignToFace: enables pedestal-buffer scan positioning so the DOM
    //   sprite locks to the exact screen columns the DDA rendered.
    var _SPRITE_CFG = {
      hearth:       { scale: 0.7,  worldOffsetY: 0.35 },
      cityBonfire:  { scale: 0.55, worldOffsetY: -0.05 },
      bonfire:      { scale: 0.30, worldOffsetY: 0.15 }
    };

    for (var i = 0; i < _cachedSprites.length; i++) {
      var sp = _cachedSprites[i];
      var cfg = sp.cityBonfire ? _SPRITE_CFG.cityBonfire
              : sp.hearth      ? _SPRITE_CFG.hearth
              :                  _SPRITE_CFG.bonfire;
      SpriteLayer.addSprite(
        sp.x, sp.y,
        _DF_HTML,
        'dragonfire',
        { scale: cfg.scale, worldOffsetY: cfg.worldOffsetY, alignToFace: true }
      );
    }
  }

  return Object.freeze({
    buildSprites:     buildSprites,
    animate:          animate,
    clearCache:       clearCache,
    getAnimatedX:     getAnimatedX,
    registerDOMSprites: registerDOMSprites
  });
})();

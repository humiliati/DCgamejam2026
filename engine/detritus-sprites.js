/**
 * DetritusSprites — Bobbing emoji billboards for adventurer detritus.
 *
 * Detritus tiles (TILES.DETRITUS = 39) are walkable floor tiles with
 * a floating emoji sprite rendered on top. The sprite:
 *   - Bobs gently (slower than bonfire, smaller amplitude)
 *   - Sits LOW — partially clipping the floor plane (groundShift)
 *   - Tilts slightly via euler Y-squish toward the player
 *   - Billboards toward the player (standard raycaster behavior)
 *
 * Unlike bonfires/mailboxes, detritus tiles are walkable. The player
 * can pick up (face + OK) or walk over to auto-collect.
 *
 * Sprite objects match the raycaster format:
 *   { x, y, emoji, scale, bobY, groundLevel, groundTilt, noFogFade, detritus, ... }
 *
 * Layer 1 (depends on: TILES)
 */
var DetritusSprites = (function () {
  'use strict';

  // ── Detritus type definitions ──────────────────────────────────
  // Each type maps to a drop item from items.json (ITM-110–114).
  // Walk-over auto-collect type determines the pickup effect.
  var TYPES = {
    cracked_flask: {
      emoji: '\uD83E\uDDEA',  // 🧪
      name: 'Cracked Flask',
      hp: 1,
      dropItemId: 'ITM-110',  // Potion Residue
      walkOverType: 'food',    // HP restore on step
      walkOverAmount: 1,
      scale: 0.30
    },
    dented_shield: {
      emoji: '\uD83D\uDEE1\uFE0F',  // 🛡️
      name: 'Dented Shield',
      hp: 2,
      dropItemId: 'ITM-111',  // Scrap Metal
      walkOverType: 'battery', // Battery on step
      walkOverAmount: 1,
      scale: 0.35
    },
    torn_satchel: {
      emoji: '\uD83D\uDC5D',  // 👝
      name: 'Torn Satchel',
      hp: 1,
      dropItemId: 'ITM-113',  // Torn Cloth Strip
      walkOverType: 'battery', // Battery on step
      walkOverAmount: 1,
      scale: 0.30
    },
    broken_arrows: {
      emoji: '\uD83C\uDFF9',  // 🏹
      name: 'Broken Arrow Bundle',
      hp: 1,
      dropItemId: 'ITM-112',  // Wood Scrap
      walkOverType: 'energy',  // Energy on step
      walkOverAmount: 1,
      scale: 0.30
    },
    hero_rations: {
      emoji: '\uD83C\uDF56',  // 🍖
      name: "Hero's Discarded Rations",
      hp: 1,
      dropItemId: 'ITM-114',  // Hero's Leftovers
      walkOverType: 'food',    // HP restore on step
      walkOverAmount: 2,
      scale: 0.30
    }
  };

  // ── Bob animation (gentler than bonfire) ───────────────────────
  var BOB_AMP    = 0.35;     // Subtle bob — sits on the floor, barely floats
  var BOB_PERIOD = 2000;     // Slow drift — debris settling, not dancing

  // ── Ground offset ──────────────────────────────────────────────
  // Positive groundLevel shift moves sprite DOWN toward floor plane.
  // Combined with small scale, the emoji clips the floor slightly.
  var GROUND_SHIFT = true;   // Use raycaster's groundLevel path
  var GROUND_TILT  = true;   // Euler tilt toward player (Y-squish)

  // ── Cache ──────────────────────────────────────────────────────
  var _cachedFloorId = null;
  var _cachedSprites = [];

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Build sprites for all DETRITUS tiles on the current floor.
   * Each sprite carries its detritus type data for interaction.
   *
   * @param {string} floorId
   * @param {Array<Array<number>>} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {Array} [detritusPlacements] — optional placement data from blockout
   *        Each: { x, y, type: 'cracked_flask'|... }
   *        If omitted, all DETRITUS tiles default to random types.
   * @returns {Array} sprite objects for the raycaster
   */
  function buildSprites(floorId, grid, gridW, gridH, detritusPlacements) {
    if (floorId === _cachedFloorId && _cachedSprites.length > 0) return _cachedSprites;

    _cachedSprites = [];
    _cachedFloorId = floorId;

    if (!grid || !gridW || !gridH) return _cachedSprites;

    var detTile = (typeof TILES !== 'undefined') ? TILES.DETRITUS : 39;

    // Build a lookup from placements if provided
    var placementMap = {};
    if (detritusPlacements) {
      for (var pi = 0; pi < detritusPlacements.length; pi++) {
        var p = detritusPlacements[pi];
        placementMap[p.x + ',' + p.y] = p.type;
      }
    }

    // Type keys for random fallback
    var typeKeys = Object.keys(TYPES);

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] !== detTile) continue;

        // Resolve detritus type: placement data > random
        var typeKey = placementMap[gx + ',' + gy];
        if (!typeKey || !TYPES[typeKey]) {
          // Seeded random from position (deterministic per tile)
          var hash = (gx * 7919 + gy * 104729) % typeKeys.length;
          typeKey = typeKeys[hash];
        }
        var def = TYPES[typeKey];

        // Slight per-sprite phase offset for varied bob
        var phaseOffset = ((gx * 31 + gy * 97) % 1000) / 1000;

        _cachedSprites.push({
          x: gx,
          y: gy,
          emoji: def.emoji,
          scale: def.scale,
          bobY: 0,
          groundLevel: GROUND_SHIFT,
          groundTilt: GROUND_TILT,
          noFogFade: false,       // Detritus fades with fog (it's debris, not a beacon)
          glow: null,
          glowRadius: 0,
          detritus: true,         // Flag for game.js interaction dispatch
          detritusType: typeKey,
          detritusName: def.name,
          detritusEmoji: def.emoji,
          dropItemId: def.dropItemId,
          walkOverType: def.walkOverType,
          walkOverAmount: def.walkOverAmount,
          hp: def.hp,
          maxHp: def.hp,
          _phaseOffset: phaseOffset
        });
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate detritus sprites (call each render frame).
   * Gentle bob with per-sprite phase offset for natural variation.
   *
   * @param {number} now — performance.now() or Date.now()
   */
  function animate(now) {
    for (var i = 0; i < _cachedSprites.length; i++) {
      var s = _cachedSprites[i];
      var phase = ((now % BOB_PERIOD) / BOB_PERIOD + s._phaseOffset) % 1;
      s.bobY = Math.sin(phase * Math.PI * 2) * BOB_AMP;
    }
  }

  /**
   * Get a detritus sprite at grid position. Used by interaction system.
   * @param {number} gx
   * @param {number} gy
   * @returns {Object|null} sprite or null
   */
  function getAt(gx, gy) {
    for (var i = 0; i < _cachedSprites.length; i++) {
      if (_cachedSprites[i].x === gx && _cachedSprites[i].y === gy) {
        return _cachedSprites[i];
      }
    }
    return null;
  }

  /**
   * Remove a detritus sprite (after pickup or smash).
   * Clears the grid tile to EMPTY.
   *
   * @param {number} gx
   * @param {number} gy
   * @param {Array<Array<number>>} grid — to clear the tile
   * @returns {Object|null} removed sprite data (for loot resolution)
   */
  function remove(gx, gy, grid) {
    for (var i = 0; i < _cachedSprites.length; i++) {
      if (_cachedSprites[i].x === gx && _cachedSprites[i].y === gy) {
        var removed = _cachedSprites.splice(i, 1)[0];
        if (grid && grid[gy]) {
          grid[gy][gx] = (typeof TILES !== 'undefined') ? TILES.EMPTY : 0;
        }
        return removed;
      }
    }
    return null;
  }

  /**
   * Hit a detritus sprite (reduce HP). Returns the sprite if destroyed.
   * At HP 0, the sprite is removed and tile cleared.
   *
   * @param {number} gx
   * @param {number} gy
   * @param {Array<Array<number>>} grid
   * @returns {{ destroyed: boolean, sprite: Object }|null}
   */
  function hit(gx, gy, grid) {
    var s = getAt(gx, gy);
    if (!s) return null;

    s.hp--;
    if (s.hp <= 0) {
      var removed = remove(gx, gy, grid);
      return { destroyed: true, sprite: removed };
    }
    return { destroyed: false, sprite: s };
  }

  /**
   * Clear the cache (call on floor transition).
   */
  function clearCache() {
    _cachedFloorId = null;
    _cachedSprites = [];
  }

  /**
   * Get all cached sprites (for external iteration).
   */
  function getSprites() {
    return _cachedSprites;
  }

  return Object.freeze({
    TYPES:        TYPES,
    buildSprites: buildSprites,
    animate:      animate,
    getAt:        getAt,
    remove:       remove,
    hit:          hit,
    clearCache:   clearCache,
    getSprites:   getSprites
  });
})();

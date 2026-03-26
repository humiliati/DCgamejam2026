/**
 * SpatialContract — rendering and generation rules for floor types.
 *
 * EyesOnly floor hierarchy adapted for dungeon crawler:
 *   floorsN       — Exterior / overworld (proc-gen or contrived)
 *   floorsN.N     — Interior contrived (taverns, shops, scripted rooms)
 *   floorsN.N.N   — Nested interior dungeons (proc-gen sub-dungeons)
 *
 * The contract tells both the GENERATOR and the RAYCASTER how to behave.
 * Generator reads it for room sizing, wall placement rules, ceiling semantics.
 * Raycaster reads it for wall height, fog model, distance rendering, parallax.
 *
 * Tile height offsets (Doom level design principle):
 *   Transition tiles render vertically offset from the base floor plane.
 *   Positive = raised (building entrance), negative = sunken (stairs down).
 *   The player reads elevation semantically: raised = horizontal transition,
 *   sunken = vertical descent, tall+raised = boss. The offset is per-tile-type,
 *   not per-cell — it's a visual grammar rule, not terrain data.
 *
 * Design: a floor carries a single SpatialContract instance that acts as
 * the source of truth for all spatial questions about that floor.
 */
var SpatialContract = (function () {
  'use strict';

  // ── Floor depth types ──
  var DEPTH = {
    EXTERIOR:       'exterior',        // floorsN     — open/outdoor, sky visible
    INTERIOR:       'interior',        // floorsN.N   — contrived template, enclosed
    NESTED_DUNGEON: 'nested_dungeon'   // floorsN.N.N — proc-gen sub-dungeon
  };

  // ── Fog models ──
  // Controls what happens when rays exceed render distance.
  var FOG = {
    // FADE: walls fade to fog color — distant walls disappear.
    // Good for exteriors (implies open space beyond render distance).
    FADE:    'fade',

    // CLAMP: walls at render distance render as a solid dark wall.
    // Prevents "outdoor illusion" — the space reads as enclosed.
    CLAMP:   'clamp',

    // DARKNESS: hard cutoff to black. Nothing visible beyond distance.
    // Most oppressive — tight dungeon corridors.
    DARKNESS: 'darkness'
  };

  // ── Ceiling types ──
  var CEILING = {
    SKY:    'sky',     // Gradient or skybox — open above
    SOLID:  'solid',   // Flat ceiling — enclosed
    VOID:   'void'     // Black void above — underground
  };

  // ═══════════════════════════════════════════════════════════════
  //  CONTRACT DEFINITIONS
  //  Each returns a frozen contract object the raycaster + generator read.
  // ═══════════════════════════════════════════════════════════════

  /**
   * floorsN — Exterior / overworld.
   * Open areas. Walls can vanish at distance (fog fade).
   * Standard 1-tile wall height. Sky ceiling.
   * Proc-gen or contrived layout.
   */
  function exterior(opts) {
    opts = opts || {};
    return Object.freeze({
      depth:            DEPTH.EXTERIOR,
      label:            opts.label || 'Exterior',

      // ── Raycaster rules ──
      wallHeight:       opts.wallHeight || 1.0,    // Multiplier on base wall height
      renderDistance:    opts.renderDistance || 20,  // Max ray travel (tiles)
      fogModel:         FOG.FADE,                  // Walls vanish into fog at distance
      fogDistance:       opts.fogDistance || 14,     // Distance where fog starts biting
      fogColor:         opts.fogColor || { r: 40, g: 50, b: 60 },  // Blueish haze
      ceilingType:      CEILING.SKY,
      ceilColor:        opts.ceilColor || '#2a3a4a',
      floorColor:       opts.floorColor || '#3a4a3a',

      // ── Parallax layers (background depth cues) ──
      parallax:         opts.parallax || null,
      // Example: [{ depth: 0.8, color: '#2a3a3a', height: 0.3 }]
      // Rendered as distant horizontal bands behind walls.

      // ── Generator rules ──
      gridSize:         opts.gridSize || { w: 40, h: 40 },
      roomSizeRange:    opts.roomSizeRange || { min: 5, max: 12 },
      roomCount:        opts.roomCount || { min: 6, max: 10 },
      allowOutdoorTiles: true,   // Can have tiles with no ceiling (grass, paths)
      corridorWidth:    opts.corridorWidth || 1,

      // ── Tile height offsets (Doom rule) ──
      // Positive = raised platform, negative = sunken recess.
      // Keyed by TILES constant value.
      tileHeightOffsets: opts.tileHeightOffsets || _buildOffsets({
        2:  0.15,     // DOOR — raised threshold, "entering a building"
        3:  0.15,     // DOOR_BACK — matches entrance from both sides
        4:  0.15,     // DOOR_EXIT — consistent with entrance
        5: -0.12,     // STAIRS_DN — sunken into ground, "descending"
        6:  0.06,     // STAIRS_UP — slight rise, "ascending"
        14: 0.25      // BOSS_DOOR — prominently elevated
      }),

      // Step fill color: rendered in the gap where offset displaces the wall.
      // Raised tiles show this below the wall; sunken tiles show it above.
      stepColor:        opts.stepColor || '#2a3a2a',

      // ── Transition rules ──
      canNest:          true,    // Can contain doors to floorsN.N
      maxNestDepth:     2        // Can go N → N.N → N.N.N
    });
  }

  /**
   * floorsN.N — Interior contrived (templates).
   * Enclosed spaces. Walls NEVER vanish — hard fog clamp.
   * 2-tile tall walls (taller ceilings, grander spaces).
   * Always from a hand-authored template, never proc-gen.
   */
  function interior(opts) {
    opts = opts || {};
    return Object.freeze({
      depth:            DEPTH.INTERIOR,
      label:            opts.label || 'Interior',

      // ── Raycaster rules ──
      wallHeight:       opts.wallHeight || 2.0,    // 2x height — tall ceilings
      renderDistance:    opts.renderDistance || 12,  // Shorter — rooms are smaller
      fogModel:         FOG.CLAMP,                 // Walls clamp to solid at distance
      fogDistance:       opts.fogDistance || 10,     // Fog starts close
      fogColor:         opts.fogColor || { r: 10, g: 10, b: 12 }, // Near-black
      ceilingType:      CEILING.SOLID,
      ceilColor:        opts.ceilColor || '#1a1a1a',
      floorColor:       opts.floorColor || '#2a2a2a',

      parallax:         null,   // No parallax in enclosed spaces

      // ── Generator rules ──
      gridSize:         opts.gridSize || { w: 16, h: 16 },  // Small template
      roomSizeRange:    opts.roomSizeRange || { min: 4, max: 8 },
      roomCount:        opts.roomCount || { min: 2, max: 5 },
      allowOutdoorTiles: false,
      corridorWidth:    1,
      useTemplate:      true,   // Generator should load template, not proc-gen

      // ── Tile height offsets (Doom rule) ──
      tileHeightOffsets: opts.tileHeightOffsets || _buildOffsets({
        2:  0.05,     // DOOR — slight step between rooms
        5: -0.08,     // STAIRS_DN — trap door feel
        6:  0.06,     // STAIRS_UP — slight rise toward exit
        14: 0.12      // BOSS_DOOR — elevated archway
      }),
      stepColor:        opts.stepColor || '#151518',

      // ── Transition rules ──
      canNest:          true,    // Can contain doors to floorsN.N.N
      maxNestDepth:     1
    });
  }

  /**
   * floorsN.N.N — Nested proc-gen dungeon.
   * Underground / sub-basement. Walls can vanish (darkness model).
   * 1-tile tall walls (cramped), with overrides for special chambers.
   * Proc-gen layout with optional templated puzzle/boss rooms injected.
   */
  function nestedDungeon(opts) {
    opts = opts || {};

    // Room height overrides: specific rooms can be taller
    // e.g., { roomIndex: 3, wallHeight: 1.5, label: 'Grand Chamber' }
    var chamberOverrides = opts.chamberOverrides || [];

    return Object.freeze({
      depth:            DEPTH.NESTED_DUNGEON,
      label:            opts.label || 'Dungeon',

      // ── Raycaster rules ──
      wallHeight:       opts.wallHeight || 1.0,    // Default 1x — low ceilings
      renderDistance:    opts.renderDistance || 14,
      fogModel:         FOG.DARKNESS,              // Hard black cutoff
      fogDistance:       opts.fogDistance || 10,
      fogColor:         opts.fogColor || { r: 0, g: 0, b: 0 },  // Pure black
      ceilingType:      CEILING.VOID,
      ceilColor:        opts.ceilColor || '#0a0a0a',
      floorColor:       opts.floorColor || '#222',

      // ── Parallax (depth supplement for long corridors) ──
      parallax:         opts.parallax || [
        { depth: 0.7, color: '#111', height: 0.15 }  // Subtle dark band
      ],

      // ── Generator rules ──
      gridSize:         opts.gridSize || { w: 24, h: 24 },
      roomSizeRange:    opts.roomSizeRange || { min: 4, max: 8 },
      roomCount:        opts.roomCount || { min: 5, max: 8 },
      allowOutdoorTiles: false,
      corridorWidth:    1,

      // ── Chamber height overrides ──
      // Per-room wallHeight multiplier. Raycaster checks if player is
      // inside a chamber's bounds and uses that room's height.
      chamberOverrides: chamberOverrides,

      // ── Tile height offsets (Doom rule) ──
      tileHeightOffsets: opts.tileHeightOffsets || _buildOffsets({
        5: -0.10,     // STAIRS_DN — hole in the floor
        6:  0.05,     // STAIRS_UP — rough hewn steps upward
        14: 0.15      // BOSS_DOOR — chamber entrance
      }),
      stepColor:        opts.stepColor || '#111',

      // ── Transition rules ──
      canNest:          false,   // Bottom of the hierarchy
      maxNestDepth:     0
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  RUNTIME QUERIES
  //  The raycaster calls these each frame to determine render params.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the effective wall height at a grid position.
   * Checks chamber overrides (nested dungeons can have tall rooms).
   *
   * @param {Object} contract - Spatial contract for current floor
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {Array}  rooms - Room list from GridGen (with bounds)
   * @returns {number} Wall height multiplier
   */
  function getWallHeight(contract, x, y, rooms) {
    if (!contract.chamberOverrides || contract.chamberOverrides.length === 0) {
      return contract.wallHeight;
    }

    // Check if position is inside an overridden chamber
    for (var i = 0; i < contract.chamberOverrides.length; i++) {
      var ov = contract.chamberOverrides[i];
      var room = rooms[ov.roomIndex];
      if (!room) continue;

      if (x >= room.x && x < room.x + room.w &&
          y >= room.y && y < room.y + room.h) {
        return ov.wallHeight;
      }
    }

    return contract.wallHeight;
  }

  /**
   * Determine what to render when a ray exceeds render distance.
   *
   * @param {Object} contract
   * @param {number} perpDist - perpendicular distance of the ray
   * @returns {Object} { draw: boolean, color: string, alpha: number }
   */
  function resolveDistantWall(contract, perpDist) {
    if (perpDist < contract.renderDistance) {
      // Within range — render normally
      return { draw: true, isClamped: false };
    }

    switch (contract.fogModel) {
      case FOG.FADE:
        // Wall fades out — DON'T draw (shows sky/background = outdoor feel)
        return { draw: false, isClamped: false };

      case FOG.CLAMP:
        // Draw a solid dark wall at render distance — reads as "more wall"
        return {
          draw: true,
          isClamped: true,
          clampDist: contract.renderDistance,
          clampColor: _fogToCSS(contract.fogColor)
        };

      case FOG.DARKNESS:
        // Hard black cutoff — draw black wall at distance
        return {
          draw: true,
          isClamped: true,
          clampDist: contract.renderDistance,
          clampColor: '#000'
        };

      default:
        return { draw: false, isClamped: false };
    }
  }

  /**
   * Get fog factor for a given distance.
   * 0 = no fog, 1 = fully fogged.
   *
   * @param {Object} contract
   * @param {number} dist
   * @returns {number}
   */
  function getFogFactor(contract, dist) {
    if (dist <= 0) return 0;
    if (dist >= contract.renderDistance) return 1;
    if (dist <= contract.fogDistance * 0.5) return 0; // No fog up close

    // Smooth ramp from fogDistance*0.5 to renderDistance
    var start = contract.fogDistance * 0.5;
    var range = contract.renderDistance - start;
    return Math.min(1, (dist - start) / range);
  }

  /**
   * Build ceiling/floor gradient colors for a contract.
   * @param {Object} contract
   * @returns {Object} { ceilTop, ceilBottom, floorTop, floorBottom }
   */
  function getGradients(contract) {
    switch (contract.ceilingType) {
      case CEILING.SKY:
        return {
          ceilTop: '#0a1020',   // Dark sky at zenith
          ceilBottom: contract.ceilColor,
          floorTop: contract.floorColor,
          floorBottom: '#111'
        };
      case CEILING.SOLID:
        return {
          ceilTop: contract.ceilColor,    // Uniform ceiling
          ceilBottom: contract.ceilColor,
          floorTop: contract.floorColor,
          floorBottom: '#0a0a0a'
        };
      case CEILING.VOID:
        return {
          ceilTop: '#000',
          ceilBottom: '#050508',
          floorTop: contract.floorColor,
          floorBottom: '#000'
        };
      default:
        return {
          ceilTop: '#111', ceilBottom: '#222',
          floorTop: '#333', floorBottom: '#111'
        };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PARALLAX LAYERS
  //  Background depth bands rendered behind walls.
  //  Exterior: distant mountains/treeline. Dungeon: rock strata.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get parallax layers for rendering.
   * Each layer: { depth (0-1 where 1=horizon), color, height (fraction of viewport) }
   *
   * @param {Object} contract
   * @returns {Array|null}
   */
  function getParallax(contract) {
    return contract.parallax || null;
  }

  // ── Presets for common scenarios ──

  var PRESETS = {
    // Overworld forest / ruins
    OVERWORLD: function (opts) {
      return exterior(Object.assign({
        label: 'Overworld',
        fogColor: { r: 30, g: 45, b: 35 },
        ceilColor: '#2a3a2a',
        floorColor: '#3a4a3a',
        parallax: [
          { depth: 0.95, color: '#1a2a1a', height: 0.12 },  // Distant treeline
          { depth: 0.85, color: '#253525', height: 0.08 }    // Mid hills
        ]
      }, opts || {}));
    },

    // Tavern / shop interior
    TAVERN: function (opts) {
      return interior(Object.assign({
        label: 'Tavern',
        wallHeight: 1.8,
        ceilColor: '#2a1a0a',
        floorColor: '#3a2a1a',
        fogColor: { r: 15, g: 10, b: 5 },
        gridSize: { w: 12, h: 10 }
      }, opts || {}));
    },

    // Temple / grand hall
    GRAND_HALL: function (opts) {
      return interior(Object.assign({
        label: 'Grand Hall',
        wallHeight: 2.5,
        renderDistance: 16,
        ceilColor: '#1a1a2a',
        floorColor: '#2a2a3a',
        gridSize: { w: 20, h: 16 }
      }, opts || {}));
    },

    // Standard dungeon crawl
    DUNGEON: function (opts) {
      return nestedDungeon(Object.assign({
        label: 'Dungeon',
        fogColor: { r: 5, g: 5, b: 8 }
      }, opts || {}));
    },

    // Dungeon with a boss chamber
    DUNGEON_WITH_BOSS: function (opts) {
      return nestedDungeon(Object.assign({
        label: 'Deep Dungeon',
        chamberOverrides: [
          { roomIndex: -1, wallHeight: 1.8, label: 'Boss Chamber' }
          // roomIndex -1 = last room. Resolved by generator.
        ]
      }, opts || {}));
    },

    // Tight cave / sewer
    CRAWLSPACE: function (opts) {
      return nestedDungeon(Object.assign({
        label: 'Crawlspace',
        wallHeight: 0.7,
        renderDistance: 8,
        fogDistance: 6,
        gridSize: { w: 20, h: 20 },
        roomSizeRange: { min: 3, max: 5 }
      }, opts || {}));
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  TILE HEIGHT OFFSETS
  //  Per-tile-type vertical displacement (Doom level design rule).
  //  Positive = raised platform, negative = sunken recess.
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the height offset for a tile type on a given contract.
   * Returns 0 for tiles with no offset (walls, empty, etc.).
   *
   * @param {Object} contract
   * @param {number} tileType - TILES constant value
   * @returns {number} Vertical offset multiplier
   */
  function getTileHeightOffset(contract, tileType) {
    if (!contract || !contract.tileHeightOffsets) return 0;
    return contract.tileHeightOffsets[tileType] || 0;
  }

  // ── Helpers ──

  /**
   * Build a frozen offset table from a plain object.
   * Keys are TILES constant values (numbers), values are float offsets.
   */
  function _buildOffsets(obj) {
    return Object.freeze(obj);
  }

  function _fogToCSS(fog) {
    return 'rgb(' + fog.r + ',' + fog.g + ',' + fog.b + ')';
  }

  return {
    // Constructors
    exterior: exterior,
    interior: interior,
    nestedDungeon: nestedDungeon,

    // Runtime queries (called by raycaster)
    getWallHeight: getWallHeight,
    getTileHeightOffset: getTileHeightOffset,
    resolveDistantWall: resolveDistantWall,
    getFogFactor: getFogFactor,
    getGradients: getGradients,
    getParallax: getParallax,

    // Presets
    PRESETS: PRESETS,

    // Constants
    DEPTH: DEPTH,
    FOG: FOG,
    CEILING: CEILING
  };
})();

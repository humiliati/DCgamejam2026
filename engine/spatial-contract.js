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
      waterColor:       opts.waterColor || { r: 15, g: 35, b: 65 }, // Deep ocean blue for WATER tile floor

      // ── Terminus fog veil ──
      // Soft atmospheric gradient band at the horizon that masks the
      // floor/sky seam and softens wall pop-in at render distance.
      // height: fraction of screen height (0.15 = 15% above + below horizon)
      // opacity: peak alpha at horizon center (0.7 default, 0 disables)
      terminusFog:      opts.terminusFog || { height: 0.15, opacity: 0.7 },

      ceilingType:      CEILING.SKY,
      skyPreset:        opts.skyPreset || 'cedar',   // Skybox preset name
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
      // ── Tile height offsets (Doom rule) ──
      // Biome overrides merge INTO these defaults (not replace).
      tileHeightOffsets: _mergeTileTable(_buildOffsets({
        5: -0.12,     // STAIRS_DN — sunken into ground, "descending"
        6:  0.06,     // STAIRS_UP — slight rise, "ascending"
        14: 0.15,     // BOSS_DOOR — prominently elevated (intentional)
        29: -0.40     // HEARTH — deep sunken: fire cavity for sandwich rendering
      }), opts.tileHeightOffsets),

      // Step fill color: rendered in the gap where offset displaces the wall.
      // Raised tiles show this below the wall; sunken tiles show it above.
      stepColor:        opts.stepColor || '#2a3a2a',

      // ── Wall textures ──
      // Keyed by TILES constant value → TextureAtlas texture ID.
      // Biome overrides merge INTO these defaults — a biome only needs to
      // list tiles it wants to remap, not every tile in the contract.
      textures: _mergeTileTable(_buildTextures({
        1:  'concrete',        // WALL — modern commercial concrete
        2:  'door_wood',       // DOOR — wooden entrance
        3:  'door_wood',       // DOOR_BACK
        4:  'door_wood',       // DOOR_EXIT
        5:  'stairs_down',     // STAIRS_DN — directional indicator
        6:  'stairs_up',       // STAIRS_UP — directional indicator
        11: 'crate_wood',      // BREAKABLE — destructible crate
        14: 'door_iron',       // BOSS_DOOR — iron gate
        18: 'bonfire_ring',    // BONFIRE — stone ring (0.3× short column)
        30: 'torch_bracket_lit',   // TORCH_LIT — stone wall + burning torch
        31: 'torch_bracket_unlit', // TORCH_UNLIT — stone wall + charred bracket
        35: 'fence_wood',      // FENCE — wooden rail (0.4× half-wall)
        38: 'truck_body'       // DUMP_TRUCK — blue pressure wash truck (0.5× short wall, hose billboard above)
      }), opts.textures),

      // ── Floor texture ──
      floorTexture:     opts.floorTexture || 'floor_cobble',

      // ── Per-tile-type floor texture overrides ──
      // Biome overrides merge INTO these defaults.
      tileFloorTextures: _mergeTileTable({
        21: 'floor_grass',       // TREE — grass under trees
        22: 'floor_grass',       // SHRUB — grass under hedges
        32: 'floor_cobble',      // ROAD — cobblestone avenues
        33: 'floor_dirt',        // PATH — dirt trails
        34: 'floor_grass',       // GRASS — meadow clearings
        35: 'floor_boardwalk',   // FENCE — boardwalk planks under railing
        37: 'bonfire_ring'       // MAILBOX — reuse stone ring base texture
      }, opts.tileFloorTextures),

      // ── Per-tile-type wall height overrides ──
      // Biome overrides merge INTO these defaults.
      tileWallHeights: _mergeTileTable({
        18: 0.3,    // BONFIRE — low stone ring, player sees over into fire cavity
        22: 0.5,    // SHRUB — half-height hedge
        35: 0.4,    // FENCE — railing, player sees over to skybox
        37: 0.5,    // MAILBOX — half-height post, emoji billboard sits above
        38: 0.5     // DUMP_TRUCK — short truck body, hose billboard floats above
      }, opts.tileWallHeights),

      // ── Gameplay rules ──
      timeFreeze:       false,   // Time passes on the surface
      timeRate:         opts.timeRate || 24,  // Game-minutes per real minute (Stardew pacing: 1440/24 = 60 real min per day)
      canNest:          true,    // Can contain doors to floorsN.N
      maxNestDepth:     2,       // Can go N → N.N → N.N.N

      // ── Audio contract ──
      // AudioMusicManager reads this on floor change. musicId is the
      // manifest key (or special sentinel). muffleHz=null disables the
      // lowpass filter. bgmVolume is the target music channel volume.
      audio:            _mergeAudio({
        musicId:     'music-mood-bober',
        muffleHz:    null,
        bgmVolume:   0.6,
        ambientBed:  null
      }, opts.audio)
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
      tileHeightOffsets: _mergeTileTable(_buildOffsets({
        5: -0.08,     // STAIRS_DN — trap door feel
        6:  0.06,     // STAIRS_UP — slight rise toward exit
        14: 0.12,     // BOSS_DOOR — elevated archway
        29: -0.40     // HEARTH — deep sunken: fire cavity for sandwich rendering
      }), opts.tileHeightOffsets),
      stepColor:        opts.stepColor || '#151518',

      // ── Wall textures ──
      textures: _mergeTileTable(_buildTextures({
        1:  'wood_plank',      // WALL — warm wood interior
        2:  'door_wood',       // DOOR — room-to-room door
        3:  'door_wood',       // DOOR_BACK
        4:  'door_wood',       // DOOR_EXIT
        5:  'stairs_down',     // STAIRS_DN — directional indicator
        6:  'stairs_up',       // STAIRS_UP — directional indicator
        11: 'crate_wood',      // BREAKABLE — destructible crate
        14: 'door_iron',       // BOSS_DOOR — iron archway
        18: 'bonfire_ring',    // BONFIRE — stone ring (interior hearth variant)
        30: 'torch_bracket_lit',   // TORCH_LIT — interior wall torch
        31: 'torch_bracket_unlit', // TORCH_UNLIT — extinguished
        36: 'terminal_screen'  // TERMINAL — CRT desk (retro-futuristic)
      }), opts.textures),

      // ── Floor texture ──
      floorTexture:     opts.floorTexture || 'floor_wood',

      // ── Per-tile-type floor texture overrides ──
      tileFloorTextures: _mergeTileTable(null, opts.tileFloorTextures),

      // ── Per-tile-type wall height overrides ──
      tileWallHeights: _mergeTileTable({
        1:  2.5,    // WALL — extends above ceiling plane for close-up immersion
        18: 0.3,    // BONFIRE — low stone ring
        36: 0.6     // TERMINAL — desk height, CRT screen above
      }, opts.tileWallHeights),

      // ── Gameplay rules ──
      timeFreeze:       true,    // No time pressure inside buildings — cozy safety contract
      timeRate:         0,       // Frozen — shops/inns are safe havens (matches timeFreeze)
      canNest:          true,    // Can contain doors to floorsN.N.N
      maxNestDepth:     1,

      // ── Audio contract ──
      // Default: inherit the parent exterior's track, muffled via lowpass
      // and volume-ducked. Biomes may override musicId for a dedicated
      // interior cue, or muffleHz/bgmVolume for a drier or wetter feel.
      audio:            _mergeAudio({
        musicId:     '__inherit_parent__',
        muffleHz:    800,
        bgmVolume:   0.35,
        ambientBed:  null
      }, opts.audio)
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
      tileHeightOffsets: _mergeTileTable(_buildOffsets({
        5: -0.10,     // STAIRS_DN — hole in the floor
        6:  0.05,     // STAIRS_UP — rough hewn steps upward
        14: 0.15,     // BOSS_DOOR — chamber entrance
        29: -0.40     // HEARTH — deep sunken: fire cavity for sandwich rendering
      }), opts.tileHeightOffsets),
      stepColor:        opts.stepColor || '#111',

      // ── Wall textures ──
      textures: _mergeTileTable(_buildTextures({
        1:  'stone_rough',     // WALL — rough dungeon stone
        2:  'door_wood',       // DOOR
        3:  'door_wood',       // DOOR_BACK
        4:  'door_wood',       // DOOR_EXIT
        5:  'stairs_down',     // STAIRS_DN — directional indicator
        6:  'stairs_up',       // STAIRS_UP — directional indicator
        11: 'crate_wood',      // BREAKABLE — destructible crate
        14: 'door_iron',       // BOSS_DOOR — iron chamber door
        18: 'bonfire_ring',    // BONFIRE — dungeon rest point
        30: 'torch_bracket_lit',   // TORCH_LIT — dungeon wall torch
        31: 'torch_bracket_unlit', // TORCH_UNLIT — hero's mess
        36: 'terminal_screen'  // TERMINAL — dungeon data terminal
      }), opts.textures),

      // ── Floor texture ──
      floorTexture:     opts.floorTexture || 'floor_stone',

      // ── Per-tile-type floor texture overrides ──
      tileFloorTextures: _mergeTileTable(null, opts.tileFloorTextures),

      // ── Per-tile-type wall height overrides ──
      tileWallHeights: _mergeTileTable({
        18: 0.3,    // BONFIRE — low stone ring
        36: 0.6     // TERMINAL — desk height
      }, opts.tileWallHeights),

      // ── Gameplay rules ──
      timeFreeze:       false,   // Time ticks in the dungeons — pressure!
      timeRate:         opts.timeRate || 12,  // Half exterior rate — dungeons eat time but aren't oppressive
      canNest:          false,   // Bottom of the hierarchy
      maxNestDepth:     0,

      // ── Audio contract ──
      // Default dungeon cue is 'insidearea' — tense sub-basement pulse.
      // Muffle is null (underground isn't muffled — it's dry and reverby).
      // Deeper dungeons or specific sub-dungeons can override musicId.
      audio:            _mergeAudio({
        musicId:     'music-insidearea',
        muffleHz:    null,
        bgmVolume:   0.6,
        ambientBed:  null
      }, opts.audio)
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
  function getWallHeight(contract, x, y, rooms, tileType, cellHeights) {
    // Per-cell height override (e.g. building entrance doors computed at
    // floor build time). Takes priority over everything else — this is how
    // the door height contract resolves per-instance height differences
    // (archway vs shop entrance) that tileWallHeights can't express.
    if (cellHeights) {
      var cellKey = x + ',' + y;
      if (cellHeights[cellKey] != null) {
        return cellHeights[cellKey];
      }
    }

    // Per-tile-type height override (e.g. TREE tiles at 2x in exterior)
    if (tileType != null && contract.tileWallHeights && contract.tileWallHeights[tileType] != null) {
      return contract.tileWallHeights[tileType];
    }

    if (!rooms || !contract.chamberOverrides || contract.chamberOverrides.length === 0) {
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
   * Compute per-cell height overrides for DOOR tiles based on spatial
   * context. Building entrance doors get capped to a sensible height
   * while archway/gate doors stay at full wall height.
   *
   * Rule:
   *   DOOR (type 2) leading DEEPER (target depth > current depth):
   *     height = max(1.0, wallHeight * 0.5)  — building entrance
   *   DOOR (type 2) leading SAME or SHALLOWER:
   *     height = tileWallHeights[DOOR]  — archway/gate
   *   DOOR_EXIT/DOOR_BACK/BOSS_DOOR:
   *     always use tileWallHeights (gates stay full height)
   *
   * @param {Array[]} grid      - 2D tile grid
   * @param {number}  gridW     - grid width
   * @param {number}  gridH     - grid height
   * @param {Object}  tileWallHeights - per-tile-type height map from contract
   * @param {number}  baseWallH - contract default wall height
   * @param {Object}  doorTargets - 'x,y' → target floor ID
   * @param {string}  currentFloorId - current floor ID string
   * @returns {Object|null} cellHeights map ('x,y' → height) or null if empty
   */
  function computeDoorHeights(grid, gridW, gridH, tileWallHeights, baseWallH, doorTargets, currentFloorId) {
    if (!tileWallHeights || !grid) return null;

    var wallH = tileWallHeights[1] || baseWallH;  // WALL tile height
    // Only apply entrance-cap rule when buildings are tall
    if (wallH <= 2.0) return null;

    var currentDepth = currentFloorId ? String(currentFloorId).split('.').length : 1;
    var doorH = tileWallHeights[2];  // DOOR tileWallHeight (may be null)
    if (doorH == null) return null;   // No explicit door height → nothing to cap

    var entranceH = Math.max(1.0, wallH * 0.5);  // Capped entrance height
    if (entranceH >= doorH) return null;          // Cap doesn't change anything

    var cellHeights = {};
    var found = false;

    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var tile = grid[y][x];
        // Only DOOR tiles (type 2) get the entrance-cap rule.
        // DOOR_BACK (3), DOOR_EXIT (4), BOSS_DOOR (14) stay full height.
        if (tile !== 2) continue;  // TILES.DOOR = 2

        var key = x + ',' + y;
        var isArchway = false;

        // Check if this door leads to same-depth or shallower = archway
        if (doorTargets && doorTargets[key]) {
          var targetId = doorTargets[key];
          var targetDepth = String(targetId).split('.').length;
          if (targetDepth <= currentDepth) {
            isArchway = true;
          }
        }

        if (!isArchway) {
          // Building entrance — cap to half building height
          cellHeights[key] = entranceH;
          found = true;
        }
      }
    }

    return found ? cellHeights : null;
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
        // Slight gradient: darker at top (farther from torchlight),
        // lighter near horizon (reflected light). Gives enclosed depth cue.
        return {
          ceilTop: _darken(contract.ceilColor, 0.6),  // Darker overhead
          ceilBottom: contract.ceilColor,              // Lit near eye level
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

  /**
   * Get the audio block for a contract. Never returns null — a missing
   * audio block yields a neutral fallback so callers can always read
   * .musicId / .muffleHz / .bgmVolume without defensive checks.
   *
   * @param {Object} contract
   * @returns {Object} { musicId, muffleHz, bgmVolume, ambientBed }
   */
  function getAudio(contract) {
    if (contract && contract.audio) return contract.audio;
    return { musicId: null, muffleHz: null, bgmVolume: 0.6, ambientBed: null };
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
        roomSizeRange: { min: 3, max: 5 },
        floorTexture: 'floor_dirt'
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

  /**
   * Get the texture ID assigned to a tile type on a given contract.
   * Returns null if no texture is assigned (raycaster falls back to flat color).
   *
   * @param {Object} contract
   * @param {number} tileType - TILES constant value
   * @returns {string|null} TextureAtlas texture ID
   */
  function getTexture(contract, tileType) {
    if (!contract || !contract.textures) return null;
    return contract.textures[tileType] || null;
  }

  /**
   * Get the floor texture ID for a contract.
   * Used by the raycaster's floor casting pass.
   *
   * @param {Object} contract
   * @returns {string|null} TextureAtlas texture ID for floor
   */
  function getFloorTexture(contract) {
    if (!contract) return null;
    return contract.floorTexture || null;
  }

  // ── Helpers ──

  /**
   * Build a frozen offset table from a plain object.
   * Keys are TILES constant values (numbers), values are float offsets.
   */
  function _buildOffsets(obj) {
    return Object.freeze(obj);
  }

  /**
   * Build a frozen texture assignment table from a plain object.
   * Keys are TILES constant values (numbers), values are texture ID strings.
   */
  function _buildTextures(obj) {
    return Object.freeze(obj);
  }

  /**
   * Merge a tile-keyed table: defaults + overrides → frozen result.
   * Biome overrides replace specific tile entries but defaults remain
   * for any tile the biome doesn't mention. Prevents the Object.assign
   * erasure bug where a biome's partial texture map silently drops
   * tiles that exist in the base contract's defaults.
   *
   * @param {Object} defaults - Base tile table from contract constructor
   * @param {Object|null} overrides - Biome-specific tile table (may be null/undefined)
   * @returns {Object} Frozen merged table
   */
  /**
   * Merge audio contract overrides onto defaults. Missing override keys
   * fall through to defaults; present keys replace them. Supports the
   * sentinel '__inherit_parent__' musicId for interior contracts.
   *
   * @param {Object} defaults - Base audio block from constructor
   * @param {Object|null} overrides - Caller opts.audio (may be null)
   * @returns {Object} Frozen merged audio block
   */
  function _mergeAudio(defaults, overrides) {
    if (!overrides) return Object.freeze(defaults);
    return Object.freeze({
      musicId:    overrides.musicId    !== undefined ? overrides.musicId    : defaults.musicId,
      muffleHz:   overrides.muffleHz   !== undefined ? overrides.muffleHz   : defaults.muffleHz,
      bgmVolume:  overrides.bgmVolume  !== undefined ? overrides.bgmVolume  : defaults.bgmVolume,
      ambientBed: overrides.ambientBed !== undefined ? overrides.ambientBed : defaults.ambientBed
    });
  }

  function _mergeTileTable(defaults, overrides) {
    if (!overrides) return defaults;
    if (!defaults) return overrides;
    var merged = {};
    var keys = Object.keys(defaults);
    for (var i = 0; i < keys.length; i++) {
      merged[keys[i]] = defaults[keys[i]];
    }
    keys = Object.keys(overrides);
    for (var i = 0; i < keys.length; i++) {
      merged[keys[i]] = overrides[keys[i]];
    }
    return Object.freeze(merged);
  }

  /**
   * Darken a hex color string by a factor (0–1).
   * @param {string} hex - '#rrggbb' or '#rgb'
   * @param {number} factor - 0 = black, 1 = unchanged
   * @returns {string} '#rrggbb'
   */
  function _darken(hex, factor) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = Math.round(parseInt(hex.substring(0, 2), 16) * factor);
    var g = Math.round(parseInt(hex.substring(2, 4), 16) * factor);
    var b = Math.round(parseInt(hex.substring(4, 6), 16) * factor);
    return '#' + ('0' + r.toString(16)).slice(-2) +
                 ('0' + g.toString(16)).slice(-2) +
                 ('0' + b.toString(16)).slice(-2);
  }

  function _fogToCSS(fog) {
    return 'rgb(' + fog.r + ',' + fog.g + ',' + fog.b + ')';
  }

  return {
    // Constructors
    exterior: exterior,
    interior: interior,
    nestedDungeon: nestedDungeon,

    // Build-time computation
    computeDoorHeights: computeDoorHeights,

    // Runtime queries (called by raycaster)
    getWallHeight: getWallHeight,
    getTileHeightOffset: getTileHeightOffset,
    getTexture: getTexture,
    getFloorTexture: getFloorTexture,
    resolveDistantWall: resolveDistantWall,
    getFogFactor: getFogFactor,
    getGradients: getGradients,
    getParallax: getParallax,
    getAudio: getAudio,

    // Presets
    PRESETS: PRESETS,

    // Constants
    DEPTH: DEPTH,
    FOG: FOG,
    CEILING: CEILING
  };
})();

/**
 * FloorManager — floor generation, caching, biome selection, and
 * spatial contract resolution.
 *
 * Owns:
 *   - Floor number tracking and floor ID convention
 *   - GridGen invocation with contract parameters
 *   - Per-floor cache (grid + enemies survive floor revisits)
 *   - Biome color palettes
 *   - SpatialContract selection per floor number
 *
 * Does NOT own:
 *   - Transition animations (see FloorTransition)
 *   - Player state (see Player)
 *   - Minimap fog caching (see Minimap)
 *
 * Floor ID convention (EyesOnly hierarchy):
 *   "N"     = depth 1, exterior/overworld
 *   "N.N"   = depth 2, interior contrived (building)
 *   "N.N.N" = depth 3, nested proc-gen dungeon
 *
 * Current world map (string floor IDs — NO linear floorNum):
 *   "0"       depth 1: exterior — The Approach
 *   "1"       depth 1: exterior — The Promenade
 *   "1.1"     depth 2: interior — Coral Bazaar
 *   "1.1.N"   depth 3: nested dungeon — Coral Cellars
 *
 * Floors "0", "1", "1.1" are hand-authored.
 * All depth-3+ floors are proc-gen via GridGen.
 */
var FloorManager = (function () {
  'use strict';

  var MC = MovementController;

  // ── State ──────────────────────────────────────────────────────────

  var _floorId = '0';          // Current floor ID string (primary identifier)
  var _floorData = null;       // Current floor's GridGen output + contract
  var _floorCache = {};        // floorId string → { floorData, enemies }
  var _enemies = [];

  // ── Floor ID helpers ───────────────────────────────────────────────

  /**
   * Get the depth level of a floor ID string.
   * "N"     → depth 1
   * "N.N"   → depth 2
   * "N.N.N" → depth 3
   */
  function _depth(id) {
    return String(id).split('.').length;
  }

  /**
   * Get the parent floor ID (ascend one level).
   * "1.1.1" → "1.1"
   * "1.1"   → "1"
   * "1"     → null
   */
  function _parentId(id) {
    var parts = String(id).split('.');
    if (parts.length <= 1) return null;
    parts.pop();
    return parts.join('.');
  }

  /**
   * Get a child floor ID (descend one level).
   * "1" + "1" → "1.1"
   * "1.1" + "1" → "1.1.1"
   */
  function _childId(id, suffix) {
    return String(id) + '.' + (suffix || '1');
  }

  /**
   * Get the next sibling floor ID (same depth, incremented last component).
   * "1.1.1" → "1.1.2"
   * "1" → "2"
   */
  function _nextSiblingId(id) {
    var parts = String(id).split('.');
    var last = parseInt(parts[parts.length - 1], 10) || 0;
    parts[parts.length - 1] = String(last + 1);
    return parts.join('.');
  }

  /**
   * Get the previous sibling floor ID (same depth, decremented last component).
   * "1.1.2" → "1.1.1"
   * "2" → "1"
   * Bottoms out at parent if last component is 1.
   */
  function _prevSiblingId(id) {
    var parts = String(id).split('.');
    var last = parseInt(parts[parts.length - 1], 10) || 0;
    if (last <= 1) return _parentId(id);
    parts[parts.length - 1] = String(last - 1);
    return parts.join('.');
  }

  /**
   * Deterministic integer hash from floor ID string (for RNG seeding).
   */
  function _hashId(id) {
    var hash = 0;
    var s = String(id);
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  // ── Floor ID management ────────────────────────────────────────────

  function getFloor()       { return _floorId; }
  function setFloor(id)     { _floorId = String(id); }
  function getFloorData()   { return _floorData; }
  function getEnemies()     { return _enemies; }
  function setEnemies(e)    { _enemies = e; }

  function getFloorDepth(id) {
    return _depth(id || _floorId);
  }

  // Backward compatibility — deprecated, use getFloor()/setFloor()
  function getCurrentFloorId() { return _floorId; }
  function getFloorNum()       { return _floorId; }  // Now returns string!
  function setFloorNum(id)     { _floorId = String(id); }
  function floorId(numOrId)    { return String(numOrId != null ? numOrId : _floorId); }

  // ── Biome resolution ───────────────────────────────────────────────

  /**
   * Resolve biome name for a floor ID.
   *
   * Depth 1: exterior biomes — keyed by top-level floor ID
   * Depth 2: interior biomes — keyed by full floor ID
   * Depth 3+: dungeon biomes — based on parent interior
   */
  function getBiome(floor) {
    floor = String(floor != null ? floor : _floorId);

    // Depth 1: exterior biomes — keyed by top-level floor ID
    if (_depth(floor) === 1) {
      if (floor === '0') return 'exterior';      // The Approach
      if (floor === '1') return 'promenade';     // The Promenade
      if (floor === '2') return 'gardens';       // Gardens (future)
      if (floor === '3') return 'frontier';      // Frontier (future)
      return 'exterior';  // fallback for unknown exteriors
    }

    // Depth 2: interior biomes — keyed by full floor ID
    if (_depth(floor) === 2) {
      if (floor === '1.1') return 'bazaar';      // Coral Bazaar
      if (floor === '1.2') return 'guild';       // Gleaner's Guild (future)
      if (floor === '2.1') return 'inn';         // Inn (future)
      if (floor === '3.1') return 'armory';      // Armory (future)
      return 'bazaar';  // fallback for unknown interiors
    }

    // Depth 3+: dungeon biomes — based on parent interior
    var parent = _parentId(floor);
    if (parent === '1.1') return 'cellar';       // Coral Cellars
    if (parent === '2.1') return 'catacomb';     // Lamplit Catacombs
    if (parent === '3.1') return 'foundry';      // Ironhold Depths

    // Deep fallback: use dungeon level for biome progression
    var parts = floor.split('.');
    var dungeonLevel = parseInt(parts[parts.length - 1], 10) || 1;
    if (dungeonLevel <= 2) return 'cellar';
    if (dungeonLevel <= 5) return 'foundry';
    return 'sealab';
  }

  /**
   * Get biome-specific wall texture + floor texture overrides for
   * SpatialContract constructors. Ensures dungeon visuals match
   * the biome theme (cellar=stone, foundry=metal, sealab=concrete).
   */
  function _biomeTextureOverrides(biome) {
    switch (biome) {
      case 'exterior':
        // Warm red brick facade ↔ red brick cobble floor
        // TREE tiles form the perimeter (2.5× tall — solid treeline backdrop)
        // WALL tiles are the building facade (3.5× tall — multi-story, towers
        //   over treeline so the single-pass raycaster never shows sky gaps
        //   above the building, even at the facade edges where rays would
        //   otherwise step down to shorter distant trees).
        // PILLAR tiles are decorative columns (1.5× — shorter accent)
        // DOOR tiles match building facade height so the door frame is
        //   flush with the surrounding wall.
        return {
          textures: Object.freeze({
            1: 'brick_red',        // WALL — building facade (brick)
            2: 'door_wood_desc',   // DOOR — descending porthole (advancing deeper)
            3: 'door_wood_asc',    // DOOR_BACK — ascending porthole (returning up)
            4: 'door_wood_asc',    // DOOR_EXIT — ascending porthole (returning up)
            5: 'stairs_down',      // STAIRS_DN
            6: 'stairs_up',        // STAIRS_UP
            10: 'stone_rough',     // PILLAR — decorative columns
            14: 'door_iron',       // BOSS_DOOR
            21: 'tree_trunk',      // TREE — perimeter trees (brown trunk + green canopy)
            22: 'shrub'            // SHRUB — wayfinding hedgerows (half-height, see-over)
          }),
          tileWallHeights: Object.freeze({
            1:  3.5,               // WALL — 3.5× tall multi-story facade (dominates skyline)
            2:  3.5,               // DOOR — flush with building facade (exterior archway)
            3:  3.5,               // DOOR_BACK — flush with building facade
            4:  3.5,               // DOOR_EXIT — flush with building facade
            10: 1.5,               // PILLAR — short accent columns
            14: 3.5,               // BOSS_DOOR — flush with building facade
            21: 2.5,               // TREE — 2.5× tall perimeter trees (solid treeline)
            22: 0.5                // SHRUB — half-height hedge (player sees over to buildings)
          }),
          floorTexture: 'floor_brick_red'
        };
      case 'promenade':
        // Warm sunset marble — the town's signature palette
        // Same height rules as exterior: buildings tower over treeline.
        // Biome Plan §5: "peach-tinted white stone with warm shadows"
        return {
          textures: Object.freeze({
            1: 'concrete',         // WALL — polished marble-like stone
            2: 'door_marble_desc', // DOOR — marble arch, descending porthole
            3: 'door_marble_asc',  // DOOR_BACK — marble arch, ascending porthole
            4: 'door_marble_asc',  // DOOR_EXIT — marble arch, ascending porthole
            5: 'stairs_down',      // STAIRS_DN
            6: 'stairs_up',        // STAIRS_UP
            10: 'stone_rough',     // PILLAR — decorative columns
            14: 'door_iron',       // BOSS_DOOR
            21: 'tree_trunk',      // TREE — perimeter trees
            22: 'shrub'            // SHRUB — wayfinding hedgerows
          }),
          tileWallHeights: Object.freeze({
            1:  3.5,               // WALL — multi-story facade (towers over treeline)
            2:  3.5,               // DOOR — flush with building facade (exterior archway)
            3:  3.5,               // DOOR_BACK — flush with building facade
            4:  3.5,               // DOOR_EXIT — flush with building facade
            10: 1.5,               // PILLAR — short accent columns
            14: 3.5,               // BOSS_DOOR — flush with building facade
            21: 2.5,               // TREE — 2.5× tall perimeter trees
            22: 0.5                // SHRUB — half-height hedge
          }),
          floorTexture: 'floor_cobble'  // Polished stone walkway
        };
      case 'bazaar':
        // Warm coral-gold interior — Biome Plan §6: "chrome display cases,
        // sunset light through high windows, coral-and-gold intensified"
        // Tall decorative pillars in wood, grass-veined stone floor.
        return {
          textures: Object.freeze({
            1: 'stone_rough',      // WALL — interior stone walls
            2: 'door_wood',        // DOOR
            3: 'door_wood',        // DOOR_BACK
            4: 'door_wood',        // DOOR_EXIT — back to Promenade
            5: 'stairs_down',      // STAIRS_DN — to Coral Cellars
            6: 'stairs_up',        // STAIRS_UP
            10: 'wood_plank',      // PILLAR — warm wood accent columns
            14: 'door_iron'        // BOSS_DOOR
          }),
          tileWallHeights: Object.freeze({
            10: 2.4                // PILLAR — tall decorative columns (taller than 2.0 walls)
          }),
          floorTexture: 'floor_grass_stone'
        };
      case 'cellar':
        // Stone walls ↔ brown dirt floor — dungeon contrast
        return {
          textures: Object.freeze({
            1: 'stone_rough', 2: 'door_cellar', 3: 'door_cellar', 4: 'door_cellar',
            5: 'stairs_down', 6: 'stairs_up', 14: 'door_iron'
          }),
          floorTexture: 'floor_dirt'
        };
      case 'foundry':
        // Dark metal walls ↔ warm dirt floor — industrial contrast
        return {
          textures: Object.freeze({
            1: 'metal_plate', 2: 'door_foundry', 3: 'door_foundry', 4: 'door_foundry',
            5: 'stairs_down', 6: 'stairs_up', 14: 'door_iron'
          }),
          floorTexture: 'floor_dirt',
          fogColor: { r: 12, g: 6, b: 3 },    // Warm furnace tint
          stepColor: '#1a1210'
        };
      case 'sealab':
        // Dark concrete walls ↔ bright clinical tile — clean contrast
        return {
          textures: Object.freeze({
            1:  'concrete_dark',   // WALL — clean sealab concrete
            2:  'door_sealab',     // DOOR — tech pressure door
            3:  'door_sealab',     // DOOR_BACK
            4:  'door_sealab',     // DOOR_EXIT
            5:  'stairs_down',     // STAIRS_DN
            6:  'stairs_up',       // STAIRS_UP
            10: 'porthole_wall',   // PILLAR — porthole windows (animated ocean)
            14: 'door_iron'        // BOSS_DOOR
          }),
          floorTexture: 'floor_tile',
          fogColor: { r: 2, g: 5, b: 12 },    // Cold fluorescent tint
          stepColor: '#0a1018'
        };
      default:
        return {};
    }
  }

  function getBiomeColors(floor) {
    var biomes = {
      exterior:   { wallLight: '#7a8a7a', wallDark: '#5a6a5a', door: '#8a7a60', doorDark: '#6a5a40', ceil: '#2a3a4a', floor: '#6a4038' },  // cool evening
      promenade:  { wallLight: '#d4a080', wallDark: '#a07858', door: '#c89050', doorDark: '#a07040', ceil: '#e8a070', floor: '#d4a878' },  // warm sunset coral
      bazaar:     { wallLight: '#c89868', wallDark: '#a07848', door: '#b08050', doorDark: '#8a6030', ceil: '#3a1a0a', floor: '#c89868' },  // warm coral-gold interior
      cellar:     { wallLight: '#8a7a6a', wallDark: '#6a5a4a', door: '#b08040', doorDark: '#906830', ceil: '#1a1a22', floor: '#3a3028' },  // dirt-brown fallback
      foundry:    { wallLight: '#7a5a4a', wallDark: '#5a3a2a', door: '#aa6a3a', doorDark: '#8a5a2a', ceil: '#1a1210', floor: '#3a2a20' },  // warm dirt fallback
      sealab:     { wallLight: '#6a7a8a', wallDark: '#4a5a6a', door: '#6a8aaa', doorDark: '#4a6a8a', ceil: '#0a1a2a', floor: '#4a5a6a' }   // cool tile fallback
    };
    return biomes[getBiome(floor)] || biomes.cellar;
  }

  // ── Spatial contract per floor ─────────────────────────────────────

  function getFloorContract(floor) {
    floor = String(floor != null ? floor : _floorId);

    var biome = getBiome(floor);
    var biomeTextures = _biomeTextureOverrides(biome);
    var depth = _depth(floor);

    // ── Depth 1: Exterior floors ──
    if (depth === 1) {
      if (floor === '0') {
        return SpatialContract.exterior(Object.assign({
          label: 'The Approach',
          wallHeight: 1.0,
          renderDistance: 20,
          fogDistance: 16,
          fogColor: { r: 30, g: 40, b: 55 },
          ceilColor: '#1a2a3a',
          floorColor: '#3a4a3a',
          gridSize: { w: 20, h: 16 },
          roomCount: { min: 2, max: 2 },
          skyPreset: 'cedar',
          parallax: [
            { depth: 0.95, color: '#1a2a1a', height: 0.10 },
            { depth: 0.85, color: '#253525', height: 0.06 }
          ]
        }, biomeTextures));
      }
      if (floor === '1') {
        return SpatialContract.exterior(Object.assign({
          label: 'The Promenade',
          wallHeight: 1.0,
          renderDistance: 20,
          fogDistance: 18,
          fogColor: { r: 45, g: 28, b: 22 },
          ceilColor: '#e8a070',
          floorColor: '#d4a878',
          gridSize: { w: 20, h: 16 },
          roomCount: { min: 2, max: 2 },
          skyPreset: 'sunset',
          parallax: [
            { depth: 0.95, color: '#c06848', height: 0.08 },
            { depth: 0.85, color: '#4a2838', height: 0.15 }
          ]
        }, biomeTextures));
      }
      // Generic exterior fallback
      return SpatialContract.exterior(Object.assign({
        label: 'District ' + floor,
        wallHeight: 1.0,
        renderDistance: 16,
        fogDistance: 14
      }, biomeTextures));
    }

    // ── Depth 2: Interior floors ──
    if (depth === 2) {
      if (floor === '1.1') {
        return SpatialContract.interior(Object.assign({
          label: 'Coral Bazaar',
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 30, g: 15, b: 8 },
          ceilColor: '#3a1a0a',
          floorColor: '#c89868',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 }
        }, biomeTextures));
      }
      // Generic interior fallback
      return SpatialContract.interior(Object.assign({
        label: 'Interior ' + floor,
        wallHeight: 2.0,
        renderDistance: 12,
        fogDistance: 10
      }, biomeTextures));
    }

    // ── Depth 3+: Nested dungeon ──
    var parts = floor.split('.');
    var dungeonLevel = parseInt(parts[parts.length - 1], 10) || 1;

    if (dungeonLevel === 1) {
      return SpatialContract.nestedDungeon(Object.assign({
        label: 'Entry Halls',
        wallHeight: 1.2,
        renderDistance: 16,
        fogDistance: 12,
        fogColor: { r: 8, g: 6, b: 10 },
        gridSize: { w: 28, h: 28 },
        roomCount: { min: 5, max: 7 }
      }, biomeTextures));
    }
    if (dungeonLevel <= 4) {
      return SpatialContract.PRESETS.DUNGEON(
        Object.assign({ gridSize: { w: 30, h: 30 } }, biomeTextures)
      );
    }
    if (dungeonLevel === 5) {
      return SpatialContract.PRESETS.DUNGEON_WITH_BOSS(Object.assign({
        gridSize: { w: 32, h: 32 },
        chamberOverrides: [
          { roomIndex: -1, wallHeight: 1.8, label: 'Boss Chamber' }
        ]
      }, biomeTextures));
    }
    if (dungeonLevel <= 8) {
      return SpatialContract.PRESETS.CRAWLSPACE(biomeTextures);
    }
    return SpatialContract.nestedDungeon(Object.assign({
      label: 'Deep Dungeon',
      renderDistance: 12 - Math.min(4, Math.floor(dungeonLevel / 5)),
      fogDistance: 8 - Math.min(3, Math.floor(dungeonLevel / 5)),
      fogColor: { r: 0, g: 0, b: 0 },
      gridSize: { w: 32, h: 32 }
    }, biomeTextures));
  }

  /**
   * Get a human-readable label for a floor ID.
   * @param {string} [floor] - defaults to current
   * @returns {string}
   */
  function getFloorLabel(floor) {
    floor = String(floor != null ? floor : _floorId);
    var contract = getFloorContract(floor);
    return contract.label || ('Floor ' + floor);
  }

  // ── Hand-authored Floor 0: Exterior Courtyard ─────────────────────
  //
  // 20×16 exterior. Player spawns south, building with DOOR entrance
  // at the north. Pillars and bonfire for flavor.
  //
  // Legend: 0=EMPTY, 1=WALL, 2=DOOR, 10=PILLAR, 18=BONFIRE
  //
  // The building facade is a solid wall with a DOOR at (9,6).
  // The player approaches, interacts → depth 1→1 transition to Promenade.
  // Rows 2-5 are solid building mass (inaccessible from exterior).

  var _FLOOR0_W = 20;
  var _FLOOR0_H = 16;
  // Legend: 0=EMPTY, 1=WALL (building), 2=DOOR, 10=PILLAR, 18=BONFIRE, 21=TREE
  // Perimeter and yard-behind-building use TREE (21) — 2.5× tall, solid treeline.
  // Building facade uses WALL (1) — 3.5× tall, multi-story, towers over trees.
  // SHRUB (22) hedgerows guide player from spawn to building entrance.
  // Rows 1-5 flanking the building (columns 1-4, 15-18) are TREE to close the
  // gap between building edge and perimeter — prevents sky peeking through.
  //
  // N-layer compositing test: from spawn facing north, the player sees
  // shrub hedges (0.5×) → floor between → pillars (1.5×) → building (3.5×) → sky.
  var _FLOOR0_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 0  tree perimeter
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 1  tree row (closes gap behind building)
    [21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 2  building top wall + trees flanking
    [21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 3  solid building + trees flanking
    [21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 4  solid building + trees flanking
    [21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 5  solid building + trees flanking
    [21,22,22,22, 0,10, 1, 1, 1, 2, 1, 1, 1, 1,10, 0,22,22,22,21], // 6  DOOR(9,6) + pillars(5,14) + shrub wings
    [21,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,21], // 7  courtyard path + shrub borders
    [21,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,21], // 8  courtyard path + shrub borders
    [21,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,21], // 9  widening path
    [21,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,22,21], // 10 BONFIRE (12,10) — player periphery
    [21,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,21], // 11 widening path
    [21,22,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,22,21], // 12 shrub funnel narrows toward spawn
    [21,22,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,22,21], // 13 spawn row — hedge-lined corridor
    [21,22,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,22,21], // 14 south hedge corridor
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21]  // 15 tree perimeter
  ];

  var _FLOOR0_SPAWN = { x: 9, y: 13, dir: 3 }; // facing NORTH
  var _FLOOR0_ROOMS = [
    // Courtyard (main open area)
    { x: 1, y: 7, w: 18, h: 8, cx: 9, cy: 11 }
  ];

  function _buildFloor0() {
    var grid = [];
    for (var y = 0; y < _FLOOR0_H; y++) {
      grid[y] = _FLOOR0_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR0_ROOMS.slice(),
      doors: {
        stairsUp: null,            // Surface — nowhere higher to go
        stairsDn: null,            // No stairs; town gate is a DOOR
        doorEntry: { x: 9, y: 6 } // DOOR — gate to The Promenade (depth 1→1)
      },
      doorTargets: { '9,6': '1' },  // DOOR at (9,6) → The Promenade
      gridW: _FLOOR0_W,
      gridH: _FLOOR0_H,
      biome: 'exterior',
      shops: []
    };
  }

  // ── Hand-authored Floor 1: The Promenade (depth 1) ────────────────
  //
  // 20×16 exterior. Sunset-washed town plaza. Player arrives from
  // the south gate (DOOR_EXIT back to The Approach). Shop facades at
  // the north with DOORs into building interiors (→ floor 2).
  //
  // Legend: 0=EMPTY, 1=WALL, 2=DOOR, 4=DOOR_EXIT, 10=PILLAR, 18=BONFIRE, 21=TREE
  //
  // The Promenade is the first proper town area. Warm sunset palette.
  // Coral Bazaar entrance (DOOR at 5,2) and Gleaner's Guild (DOOR at
  // 14,2). Both currently route to floor 2 (Coral Bazaar interior).

  var _FLOOR1_W = 20;
  var _FLOOR1_H = 16;
  var _FLOOR1_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 0  tree perimeter
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 1  north walk
    [21, 0, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 0,21], // 2  shop facades + DOORs (5,2) (14,2)
    [21, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0,21], // 3  shop backs (solid mass)
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 4  corridor
    [21, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0,21], // 5  pillar row
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 6  plaza
    [21, 0, 0, 0, 0, 0, 0, 0, 0,18, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 7  bonfire at (9,7)
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 8  plaza
    [21, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0,21], // 9  pillar row
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 10 open
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 11 approach
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 12 spawn area
    [21, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1,21], // 13 south gate, DOOR_EXIT (9,13)
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 14 behind gate
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21]  // 15 tree perimeter
  ];

  var _FLOOR1_SPAWN = { x: 9, y: 12, dir: 3 }; // facing NORTH
  var _FLOOR1_ROOMS = [
    // Main plaza (open area between gate and shops)
    { x: 1, y: 4, w: 18, h: 9, cx: 9, cy: 7 }
  ];

  function _buildFloor1() {
    var grid = [];
    for (var y = 0; y < _FLOOR1_H; y++) {
      grid[y] = _FLOOR1_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR1_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorExit: { x: 9, y: 13 },  // DOOR_EXIT — back to The Approach (depth 1→1)
        doorEntry: { x: 5, y: 2 }   // DOOR — Coral Bazaar entrance (depth 1→2)
      },
      doorTargets: { '5,2': '1.1', '14,2': '1.1', '9,13': '0' },  // DOORs → Coral Bazaar, DOOR_EXIT → The Approach
      gridW: _FLOOR1_W,
      gridH: _FLOOR1_H,
      biome: 'promenade',
      shops: []
    };
  }

  // ── Hand-authored Floor 2: Coral Bazaar (depth 2) ───────────────
  //
  // 16×12 interior. Warm coral-gold market hall. Entered from the
  // Promenade via building DOOR. DOOR_EXIT at south (back to Promenade),
  // STAIRS_DN at north (to Coral Cellars dungeon). Bonfire for rest.
  //
  // Legend: 0=EMPTY, 1=WALL, 4=DOOR_EXIT, 5=STAIRS_DN, 10=PILLAR, 18=BONFIRE

  var _FLOOR2_W = 16;
  var _FLOOR2_H = 12;
  var _FLOOR2_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  perimeter
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1  north hall
    [  1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1], // 2  inner wall
    [  1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 3  stair chamber
    [  1, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 1], // 4  STAIRS_DN (7,4)
    [  1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 5  stair chamber
    [  1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 6  gap at (6-8)
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 7  main hall
    [  1, 0,10, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,10, 0, 1], // 8  pillars + bonfire (7,8)
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  entry hall
    [  1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], // 10 DOOR_EXIT (7,10)
    [  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // 11 perimeter
  ];

  var _FLOOR2_SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH
  var _FLOOR2_ROOMS = [
    // Main hall (entry area)
    { x: 1, y: 7, w: 14, h: 3, cx: 7, cy: 8 },
    // Stair chamber (inner room with stairs down)
    { x: 5, y: 3, w: 6, h: 3, cx: 7, cy: 4 }
  ];

  function _buildFloor2() {
    var grid = [];
    for (var y = 0; y < _FLOOR2_H; y++) {
      grid[y] = _FLOOR2_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR2_ROOMS.slice(),
      doors: {
        stairsUp: null,            // Exit is via DOOR_EXIT, not stairs
        stairsDn: { x: 7, y: 4 }, // STAIRS_DN — to Coral Cellars (depth 2→3)
        doorExit: { x: 7, y: 10 } // DOOR_EXIT — back to Promenade (depth 2→1)
      },
      doorTargets: {},  // DOOR_EXIT and STAIRS follow convention
      gridW: _FLOOR2_W,
      gridH: _FLOOR2_H,
      biome: 'bazaar',
      shops: []
    };
  }

  // ── Floor generation ───────────────────────────────────────────────

  /**
   * Generate (or restore from cache) the current floor.
   * Sets _floorData, _enemies, applies contract to raycaster,
   * spawns the player via DoorContracts, and inits MovementController.
   *
   * @returns {Object} { x, y, dir } — player spawn position
   */
  function generateCurrentFloor() {
    var contract = getFloorContract(_floorId);
    var label = contract.label || ('Floor ' + _floorId);

    SeededRNG.seed(_hashId(_floorId) * 31337 + 42);

    var fromCache = false;

    if (_floorCache[_floorId]) {
      _floorData = _floorCache[_floorId].floorData;
      _enemies = _floorCache[_floorId].enemies;
      fromCache = true;
    } else if (_floorId === '0') {
      // Hand-authored Floor 0: exterior courtyard (depth 1)
      _floorData = _buildFloor0();
      _floorData.contract = contract;
      _enemies = [];  // No enemies on the exterior
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    } else if (_floorId === '1') {
      // Hand-authored Floor 1: entry plaza (depth 1)
      _floorData = _buildFloor1();
      _floorData.contract = contract;
      _enemies = [];  // No enemies in the plaza (safe zone)
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    } else if (_floorId === '1.1') {
      // Hand-authored Floor 2: Coral Bazaar (depth 2)
      _floorData = _buildFloor2();
      _floorData.contract = contract;
      _enemies = [];  // No enemies in the bazaar (safe zone)
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    } else {
      _floorData = GridGen.generate({
        width: contract.gridSize.w,
        height: contract.gridSize.h,
        biome: getBiome(_floorId),
        floor: _floorId,
        placeStairsUp: true,
        placeStairsDn: true,
        roomCount: SeededRNG.randInt(contract.roomCount.min, contract.roomCount.max)
      });

      _floorData.contract = contract;

      // Resolve -1 roomIndex (= last room) for chamber overrides
      if (contract.chamberOverrides) {
        for (var ci = 0; ci < contract.chamberOverrides.length; ci++) {
          if (contract.chamberOverrides[ci].roomIndex === -1) {
            contract.chamberOverrides[ci].roomIndex = _floorData.rooms.length - 1;
          }
        }
      }

      _enemies = EnemyAI.spawnEnemies(_floorData, _floorId, null);
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    }

    // Compute per-cell door height overrides (building entrance vs archway rule).
    // Stored on floorData and passed to raycaster alongside the frozen contract.
    _floorData.cellHeights = SpatialContract.computeDoorHeights(
      _floorData.grid, _floorData.gridW, _floorData.gridH,
      contract.tileWallHeights, contract.wallHeight,
      _floorData.doorTargets, _floorId
    );

    // Apply biome colors + contract to raycaster
    Raycaster.setBiomeColors(getBiomeColors(_floorId));
    Raycaster.setContract(contract, _floorData.rooms, _floorData.cellHeights);

    // Resolve player spawn
    var spawn, spawnDir;
    if (_floorId === '0' && !fromCache) {
      // Floor 0 first visit: use fixed spawn (auto-walk start position)
      spawn = { x: _FLOOR0_SPAWN.x, y: _FLOOR0_SPAWN.y, dir: MovementController.dirToAngle(_FLOOR0_SPAWN.dir) };
      spawnDir = _FLOOR0_SPAWN.dir;
    } else {
      // All other floors + revisits: use door contract system
      spawn = DoorContracts.applyContract(_floorData);
      spawnDir = Player.radianToDir(spawn.dir);
    }

    // Update player position
    Player.setPos(spawn.x, spawn.y);
    Player.setDir(spawnDir);
    Player.resetLookOffset();

    // Exclude spawn from enemy placement on fresh floors
    // (skip depth 1-2 — no enemies in exterior/interior safe zones)
    if (!fromCache && _depth(_floorId) >= 3) {
      _enemies = EnemyAI.spawnEnemies(_floorData, _floorId, { x: spawn.x, y: spawn.y });
      _floorCache[_floorId].enemies = _enemies;
    }

    // Init movement controller at spawn
    MC.init({
      x: spawn.x,
      y: spawn.y,
      dir: spawnDir,
      collisionCheck: _collisionCheck,
      onMoveStart: null,   // Wired by Game orchestrator
      onMoveFinish: null,
      onBump: null,
      onTurnFinish: null
    });

    return { x: spawn.x, y: spawn.y, dir: spawnDir };
  }

  // ── Collision check (used by MovementController) ───────────────────

  function _collisionCheck(fromX, fromY, toX, toY, dir) {
    var grid = _floorData.grid;
    var W = _floorData.gridW;
    var H = _floorData.gridH;

    if (toX < 0 || toX >= W || toY < 0 || toY >= H) {
      return { blocked: true, entity: false };
    }
    if (!TILES.isWalkable(grid[toY][toX])) {
      return { blocked: true, entity: false };
    }
    if (DoorContracts.isProtected(toX, toY)) {
      return { blocked: true, entity: false };
    }
    return { blocked: false, entity: false };
  }

  /** Expose collision check for MC init wiring. */
  function getCollisionCheck() { return _collisionCheck; }

  // ── Cache management ───────────────────────────────────────────────

  function clearCache() {
    _floorCache = {};
  }

  function removeEnemy(enemy) {
    var idx = _enemies.indexOf(enemy);
    if (idx >= 0) _enemies.splice(idx, 1);
    // Update cache with removed enemy
    _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    // Floor ID (primary)
    getFloor: getFloor,
    setFloor: setFloor,
    getFloorDepth: getFloorDepth,

    // Floor ID (backward compat — deprecated)
    floorId: floorId,
    getCurrentFloorId: getCurrentFloorId,
    getFloorNum: getFloorNum,
    setFloorNum: setFloorNum,

    // ID navigation helpers
    parentId: _parentId,
    childId: _childId,
    nextSiblingId: _nextSiblingId,
    prevSiblingId: _prevSiblingId,

    // Data
    getFloorData: getFloorData,
    setFloorData: function (fd) { _floorData = fd; },
    getEnemies: getEnemies,
    setEnemies: setEnemies,
    removeEnemy: removeEnemy,

    // Generation
    generateCurrentFloor: generateCurrentFloor,
    getCollisionCheck: getCollisionCheck,

    // Lookups
    getBiome: getBiome,
    getBiomeColors: getBiomeColors,
    getFloorContract: getFloorContract,
    getFloorLabel: getFloorLabel,

    // Floor 0
    getFloor0Spawn: function () { return { x: _FLOOR0_SPAWN.x, y: _FLOOR0_SPAWN.y, dir: _FLOOR0_SPAWN.dir }; },

    // Cache
    clearCache: clearCache
  };
})();

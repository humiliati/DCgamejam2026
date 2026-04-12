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
 *   "1.6"     depth 2: interior — Gleaner's Home (player bunk)
 *
 * Floors "0", "1", "1.1", "1.6" are hand-authored.
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

  // ── Registered floor builders ──────────────────────────────────────
  // External blockout files register hand-authored floor builders here.
  // Checked before the hard-coded if/else chain in generateCurrentFloor().
  var _registeredBuilders = {};

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

  /**
   * Register a hand-authored floor builder from an external blockout file.
   * Registered builders take priority over the hard-coded if/else chain
   * and over GridGen fallback in generateCurrentFloor().
   *
   * @param {string} id  Floor ID string (e.g. '1.2', '2', '2.1')
   * @param {Function} builderFn  Returns floor data object (same shape as _buildFloor0)
   */
  function registerFloorBuilder(id, builderFn) {
    _registeredBuilders[String(id)] = builderFn;
  }

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
      if (floor === '2') return 'lantern';       // Lantern Row (commercial district)
      if (floor === '3') return 'frontier';      // Frontier (future)
      return 'exterior';  // fallback for unknown exteriors
    }

    // Depth 2: interior biomes — keyed by full floor ID
    if (_depth(floor) === 2) {
      if (floor === '1.1') return 'bazaar';      // Coral Bazaar
      if (floor === '1.2') return 'inn';         // Driftwood Inn
      if (floor === '1.3') return 'cellar_entry'; // Storm Shelter (civic building, basement dungeon below)
      if (floor === '1.6') return 'home';        // Gleaner's Home (player bunk)
      if (floor === '2.1') return 'office';      // Dispatcher's Office
      if (floor === '2.2') return 'watchpost';   // Watchman's Post
      if (floor === '2.3') return 'shop';        // Armorer's Workshop (Foundry shop)
      if (floor === '2.4') return 'shop';        // Chandler's Shop (Tide shop)
      if (floor === '2.5') return 'shop';        // The Apothecary (Tide shop)
      if (floor === '2.6') return 'shop';        // The Cartographer (Admiralty shop)
      if (floor === '2.7') return 'shop';        // The Tea House (Tide social)
      if (floor === '3.1') return 'armory';      // Armory
      if (floor === '3.2') return 'shop';        // Quartermaster's Shop (Admiralty shop)
      return 'bazaar';  // fallback for unknown interiors
    }

    // Depth 3+: dungeon biomes — based on parent interior
    var parent = _parentId(floor);
    // Floor 0 building interiors (depth 3: 0.5.N) — accessed from exterior via doorTargets
    if (parent === '0.5') return 'cellar_entry';  // Approach building basements
    if (parent === '1.1') return 'cellar';       // Coral Cellars
    if (parent === '1.2') return 'cellar';       // Inn Cellar (Driftwood Inn basement)
    if (parent === '1.3') return 'cellar';       // Soft Cellar (tutorial dungeon)
    if (parent === '2.2') return 'catacomb';     // Hero's Wake (catacombs)
    if (parent === '3.1') return 'foundry';      // Ironhold Depths
    if (parent === '3.2') return 'foundry';      // Quartermaster Vaults

    // Deep fallback: use dungeon level for biome progression
    var parts = floor.split('.');
    var dungeonLevel = parseInt(parts[parts.length - 1], 10) || 1;
    if (dungeonLevel <= 2) return 'cellar';
    if (dungeonLevel <= 5) return 'foundry';
    return 'sealab';
  }

  /**
   * Classify a floor as a dungeon (cellar/catacomb/foundry/sealab) vs
   * exterior (promenade/lantern/frontier/etc.) or interior (bazaar/inn/
   * home/shop/armory/cellar_entry/etc.).
   *
   * This is the canonical check for "should dungeon-only systems run
   * here?" — reshuffle, blood seeding, trap re-arm, cobweb scan, work
   * orders, corpse registry, raycaster blood tint, etc.
   *
   * Depth alone is NOT sufficient: depth-3 floor IDs like 0.5.1 are
   * interior stubs (biome 'cellar_entry'), not real dungeons. Keying
   * off biome keeps the classifier honest as new floors are added.
   *
   * @param {string} [floorId] - Floor ID (defaults to current)
   * @returns {boolean}
   */
  function isDungeonFloor(floorId) {
    var biome = getBiome(floorId);
    return biome === 'cellar'   ||
           biome === 'catacomb' ||
           biome === 'foundry'  ||
           biome === 'sealab';
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
            18: 'bonfire_ring',    // BONFIRE — stone ring (0.3× short column)
            21: 'tree_trunk',      // TREE — perimeter trees (brown trunk + green canopy)
            22: 'shrub',           // SHRUB — wayfinding hedgerows (half-height, see-over)
            35: 'fence_wood',      // FENCE — wooden rail
            37: 'shrub',           // MAILBOX — shrub base matching grass floor (emoji billboard above via MailboxSprites)
            38: 'truck_body',      // DUMP_TRUCK — blue pressure wash truck body
            // Living infrastructure tiles (DOC-84 §1)
            47: 'soup_cauldron',   // SOUP_KITCHEN — iron pot on brazier stand
            48: 'cot_canvas',      // COT — canvas bedroll on low frame
            // Roof tiles — cool grey slate for rustic approach
            60: 'roof_slate',      // ROOF_EAVE_L
            61: 'roof_slate',      // ROOF_SLOPE_L
            62: 'roof_slate',      // ROOF_PEAK
            63: 'roof_slate',      // ROOF_SLOPE_R
            64: 'roof_slate',      // ROOF_EAVE_R
            65: 'canopy_oak',      // CANOPY — dense green leaf ring (opaque lid)
            66: 'canopy_moss',     // CANOPY_MOSS — hanging moss strands (translucent)
            67: 'roof_crenel',     // ROOF_CRENEL — cap stone rampart (toothed silhouette)
            68: 'pergola_beam'     // PERGOLA — stained hardwood open-air beam lattice
          }),
          tileWallHeights: Object.freeze({
            1:  3.5,               // WALL — 3.5× tall multi-story facade (dominates skyline)
            2:  3.5,               // DOOR — flush with building facade (exterior archway)
            3:  3.5,               // DOOR_BACK — flush with building facade
            4:  3.5,               // DOOR_EXIT — flush with building facade
            10: 1.5,               // PILLAR — short accent columns
            14: 3.5,               // BOSS_DOOR — flush with building facade
            18: 0.3,               // BONFIRE — low stone ring, fire cavity visible inside
            21: 2.5,               // TREE — 2.5× tall perimeter trees (solid treeline)
            22: 0.5,               // SHRUB — half-height hedge (player sees over to buildings)
            35: 0.4,               // FENCE — railing, player sees over
            37: 0.25,              // MAILBOX — short stone platform, emoji framed inside
            38: 2.0,               // DUMP_TRUCK — HEARTH-stature pressure-wash truck
                                   //   (freeform: 0.40 lower body w/ wheel decor +
                                   //   0.25 ground-level spool cavity + 1.35 upper
                                   //   chassis). See spatial-contract.js tileFreeform
                                   //   entry 38 for the band split and truck_spool_cavity
                                   //   gap filler. Must match the base exterior() value
                                   //   (2.0) or the biome merge will clobber the
                                   //   freeform geometry and fall back to a flat slab.
            47: 0.7,               // SOUP_KITCHEN — cauldron on brazier
            48: 0.3,               // COT — low bedroll
            65: 0.25,              // CANOPY — thin leaf strip (floats via tileHeightOffset)
            66: 0.25,              // CANOPY_MOSS — thin moss strip (floats via tileHeightOffset)
            67: 0.50,              // ROOF_CRENEL — 0.5-thick slab, solid lower half caps wall top,
                                   //   toothed upper half pokes above (see tileHeightOffsets)
            68: 0.50               // PERGOLA — same slab thickness as CRENEL (shared tooth pattern)
          }),
          tileHeightOffsets: Object.freeze({
            5:  -0.12,   // STAIRS_DN — sunken (base default)
            6:   0.06,   // STAIRS_UP — slight rise (base default)
            14:  0.15,   // BOSS_DOOR — elevated (base default)
            // BONFIRE: no offset on exterior — ring sits at ground level (visible like mailbox)
            // DUMP_TRUCK: no offset — truck sits at ground level (same as bonfire)
            // Floating roof moat — positioned near top of 3.5× building walls
            60:  2.8,    // ROOF_EAVE_L — eave at building-top level
            61:  3.0,    // ROOF_SLOPE_L — ascending toward peak
            62:  3.2,    // ROOF_PEAK — above building top
            63:  3.0,    // ROOF_SLOPE_R — descending
            64:  2.8,    // ROOF_EAVE_R — eave level
            // Floating canopy — positioned near top of 2.5× trees
            65:  2.0,    // CANOPY — leaf ring at tree crown height
            66:  2.0,    // CANOPY_MOSS — moss strands at tree crown height
            // Crenellated rampart — caps the 3.5× building wall.
            // Wall top altitude = 3.0 (3.5× wall anchored at ground, eye at 0.5).
            // Slab spans 2.75–3.25: solid lower half (2.75–3.00) interleaves with
            // the wall upper portion, toothed upper half (3.00–3.25) pokes 0.25
            // above the wall top as the merlon line.
            67:  3.0,    // ROOF_CRENEL — midline at wall top, teeth extend upward
            68:  2.5     // PERGOLA — plaza shade beam at courtyard canopy height
                         //   (unused in approach biome yet — reserved for Lantern Row plaza)
          }),
          floorTexture: 'floor_brick_red',
          tileFloorTextures: Object.freeze({
            21: 'floor_grass',       // TREE — grass under trees
            22: 'floor_grass',       // SHRUB — grass under hedges
            32: 'floor_cobble',      // ROAD — cobblestone avenues
            33: 'floor_dirt',        // PATH — dirt trails
            34: 'floor_grass',       // GRASS — meadow clearings
            35: 'floor_boardwalk',   // FENCE — boardwalk planks under railing
            37: 'floor_grass',       // MAILBOX — grass under mailbox
            // Floating tiles — grass visible below when looking down
            60: 'floor_grass',       // ROOF_EAVE_L
            61: 'floor_grass',       // ROOF_SLOPE_L
            62: 'floor_grass',       // ROOF_PEAK
            63: 'floor_grass',       // ROOF_SLOPE_R
            64: 'floor_grass',       // ROOF_EAVE_R
            65: 'floor_grass',       // CANOPY
            66: 'floor_grass',       // CANOPY_MOSS
            67: 'floor_brick_red',   // ROOF_CRENEL — red brick beneath the rampart (approach building base)
            68: 'floor_cobble'       // PERGOLA — plaza flagstones beneath the beam lattice
          })
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
            18: 'bonfire_ring',    // BONFIRE — stone ring
            21: 'tree_trunk',      // TREE — perimeter trees
            22: 'shrub',           // SHRUB — wayfinding hedgerows
            35: 'fence_wood',      // FENCE — wooden rail
            37: 'shrub',           // MAILBOX — shrub base matching grass floor
            38: 'truck_body',      // DUMP_TRUCK — blue pressure wash truck body
            // Living infrastructure tiles (DOC-84 §1)
            40: 'well_stone',      // WELL — circular stone rim, dark water
            41: 'bench_wood',      // BENCH — wooden slat seat
            42: 'notice_board_wood', // NOTICE_BOARD — posts with pinned parchment
            47: 'soup_cauldron',   // SOUP_KITCHEN — iron pot on brazier stand
            48: 'cot_canvas',      // COT — canvas bedroll on low frame
            // Roof tiles — warm terracotta for sunset boardwalk
            60: 'roof_shingle',    // ROOF_EAVE_L
            61: 'roof_shingle',    // ROOF_SLOPE_L
            62: 'roof_shingle',    // ROOF_PEAK
            63: 'roof_shingle',    // ROOF_SLOPE_R
            64: 'roof_shingle'     // ROOF_EAVE_R
          }),
          tileWallHeights: Object.freeze({
            1:  3.5,               // WALL — multi-story facade (towers over treeline)
            2:  3.5,               // DOOR — flush with building facade (exterior archway)
            3:  3.5,               // DOOR_BACK — flush with building facade
            4:  3.5,               // DOOR_EXIT — flush with building facade
            10: 1.5,               // PILLAR — short accent columns
            14: 3.5,               // BOSS_DOOR — flush with building facade
            18: 0.3,               // BONFIRE — low stone ring
            21: 2.5,               // TREE — 2.5× tall perimeter trees
            22: 0.5,               // SHRUB — half-height hedge
            35: 0.4,               // FENCE — railing
            37: 0.25,              // MAILBOX — short stone platform
            38: 2.0,               // DUMP_TRUCK — HEARTH-stature pressure-wash truck
                                   //   (freeform: 0.40 lower body w/ wheel decor +
                                   //   0.25 ground-level spool cavity + 1.35 upper
                                   //   chassis). See spatial-contract.js tileFreeform
                                   //   entry 38 for the band split and truck_spool_cavity
                                   //   gap filler. Must match the base exterior() value
                                   //   (2.0) or the biome merge will clobber the
                                   //   freeform geometry and fall back to a flat slab.
            40: 0.5,               // WELL — stone rim
            41: 0.35,              // BENCH — low seating
            42: 1.2,               // NOTICE_BOARD — tall posts with parchment
            44: 0.6,               // BARREL — banded oak
            47: 0.7,               // SOUP_KITCHEN — cauldron on brazier
            48: 0.3                // COT — low bedroll
          }),
          tileHeightOffsets: Object.freeze({
            5:  -0.12,   // STAIRS_DN — sunken (base default)
            6:   0.06,   // STAIRS_UP — slight rise (base default)
            14:  0.15    // BOSS_DOOR — elevated (base default)
            // DUMP_TRUCK: no offset — truck sits at ground level (same as bonfire)
          }),
          floorTexture: 'floor_cobble',  // Polished stone walkway
          tileFloorTextures: Object.freeze({
            21: 'floor_grass',       // TREE — grass under trees
            22: 'floor_grass',       // SHRUB — grass under hedges
            32: 'floor_cobble',      // ROAD — cobblestone avenues
            33: 'floor_dirt',        // PATH — dirt trails
            34: 'floor_grass',       // GRASS — meadow clearings
            35: 'floor_boardwalk',   // FENCE — boardwalk planks under railing
            37: 'floor_grass'        // MAILBOX — grass under mailbox
          })
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
            1:  2.5,               // WALL — extends above ceiling for close-up immersion
            10: 2.4                // PILLAR — tall decorative columns (taller than 2.0 walls)
          }),
          floorTexture: 'floor_grass_stone'
        };
      case 'home':
        // Gleaner's dwelling — warm planked interior, multiple rooms.
        // Wood plank walls with a soft amber lamp glow. Wooden floor.
        // Contains: BED (bonfire), TABLE (cozy), CHEST (stash+keys),
        // TERMINAL (mail + dispatch), BOOKSHELF (reading), DOOR_EXIT (to Promenade).
        return {
          textures: Object.freeze({
            1:  'wood_plank',       // WALL — warm plank walls
            2:  'door_wood',        // DOOR (unused in home)
            3:  'door_wood',        // DOOR_BACK (unused)
            4:  'door_wood_asc',    // DOOR_EXIT — out to The Promenade
            7:  'stash_chest',      // CHEST — stash container
            10: 'stone_rough',      // PILLAR — decorative column
            25: 'bookshelf',        // BOOKSHELF — dark wood shelves
            27: 'bed_quilt',        // BED — quilted blanket
            28: 'table_wood',       // TABLE — work surface
            29: 'hearth_riverrock', // HEARTH — riverrock fireplace
            36: 'terminal_screen'   // TERMINAL — CRT dispatch station
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — extends above ceiling for close-up immersion
            7:  0.7,               // CHEST — waist-height stash box
            10: 2.0,               // PILLAR — full wall height decorative column
            27: 0.6,               // BED — low, player sees over it
            28: 0.4,               // TABLE — low third-height surface
            29: 2.5,               // HEARTH — full chimney stack
            36: 1.0                // TERMINAL — desk-height CRT station
          }),
          floorTexture: 'floor_wood'
        };
      case 'inn':
        // Driftwood Inn — warm tavern interior with bar counter and cozy seating
        // Wood walls with amber light, similar to home but more public.
        return {
          textures: Object.freeze({
            1:  'wood_plank',       // WALL — warm plank walls
            2:  'door_wood',        // DOOR
            3:  'door_wood',        // DOOR_BACK
            4:  'door_wood_asc',    // DOOR_EXIT — back to exterior
            5:  'stairs_down',      // STAIRS_DN (if applicable)
            6:  'stairs_up',        // STAIRS_UP
            10: 'wood_dark',        // PILLAR — dark wood accent columns
            25: 'bookshelf',        // BOOKSHELF — dark wood shelves
            26: 'wood_dark',        // BAR_COUNTER — bar surface
            27: 'bed_quilt',        // BED — inn guest bed
            28: 'table_wood',       // TABLE — dining table
            29: 'hearth_riverrock', // HEARTH — tavern fireplace
            41: 'bench_wood'       // BENCH — wooden slat seat
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — extends above ceiling for close-up immersion
            7:  0.7,               // CHEST — waist-height storage
            10: 2.2,               // PILLAR — tall decorative beams
            26: 0.8,               // BAR_COUNTER — counter height
            27: 0.6,               // BED — low inn bed
            28: 0.4,               // TABLE — low dining surface
            29: 0.5,               // HEARTH — short base stone (sandwich: mantle above fire cavity)
            41: 0.35               // BENCH — low cushioned seat
          }),
          floorTexture: 'floor_wood'
        };
      case 'cellar_entry':
        // Storm Shelter — abandoned civil defense building, dungeon below
        // Rough stone walls, dim overhead, faded emergency signage feel.
        return {
          textures: Object.freeze({
            1:  'stone_rough',      // WALL — rough stone cellar walls
            2:  'door_cellar',      // DOOR
            3:  'door_cellar',      // DOOR_BACK
            4:  'door_wood_asc',    // DOOR_EXIT — back to exterior
            5:  'stairs_down',      // STAIRS_DN — to dungeon
            6:  'stairs_up',        // STAIRS_UP
            10: 'stone_rough',      // PILLAR — stone columns
            25: 'bookshelf',        // BOOKSHELF — dusty shelves
            29: 'hearth_riverrock'  // HEARTH — warming fire
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — extends above ceiling for close-up immersion
            10: 1.8,               // PILLAR — cellar columns
            29: 0.5                // HEARTH — short base stone (sandwich: mantle above fire cavity)
          }),
          floorTexture: 'floor_dirt'
        };
      case 'lantern':
        // Lantern Row — commercial exterior district, warm brick and lantern light
        // Brick facades with warm amber tones, cobblestone walkways.
        return {
          textures: Object.freeze({
            1:  'brick_light',      // WALL — light brick commercial facades
            2:  'door_wood_desc',   // DOOR — descending porthole (advancing deeper)
            3:  'door_wood_asc',    // DOOR_BACK — ascending porthole
            4:  'door_wood_asc',    // DOOR_EXIT — ascending porthole (returning)
            5:  'stairs_down',      // STAIRS_DN
            6:  'stairs_up',        // STAIRS_UP
            10: 'pillar_stone',     // PILLAR — decorative lamp columns
            14: 'door_iron',        // BOSS_DOOR
            18: 'bonfire_ring',     // BONFIRE — stone ring
            21: 'tree_trunk',       // TREE — perimeter trees
            22: 'shrub',            // SHRUB — wayfinding hedgerows
            35: 'fence_wood',       // FENCE — wooden rail
            37: 'shrub',            // MAILBOX — shrub base matching grass floor
            38: 'truck_body',       // DUMP_TRUCK — blue pressure wash truck body
            // Living infrastructure tiles (DOC-84 §1)
            40: 'well_stone',       // WELL — circular stone rim
            41: 'bench_wood',       // BENCH — wooden slat seat
            42: 'notice_board_wood', // NOTICE_BOARD — posts with parchment
            44: 'barrel_wood',      // BARREL — banded oak barrel
            47: 'soup_cauldron',    // SOUP_KITCHEN — iron pot on brazier
            48: 'cot_canvas',       // COT — canvas bedroll
            // Economy tiles (DOC-84 §17) — Clinic on Floor 2
            55: 'cot_canvas',       // STRETCHER_DOCK — reuses cot texture
            56: 'cot_canvas',       // TRIAGE_BED — reuses cot texture (tinted)
            59: 'switchboard_panel' // REFRIG_LOCKER — metal cabinet (placeholder)
          }),
          tileWallHeights: Object.freeze({
            1:  3.5,               // WALL — multi-story commercial facades
            2:  3.5,               // DOOR — flush with building facade
            3:  3.5,               // DOOR_BACK — flush with building facade
            4:  3.5,               // DOOR_EXIT — flush with building facade
            10: 1.5,               // PILLAR — lantern post height
            14: 3.5,               // BOSS_DOOR — flush with building facade
            18: 0.3,               // BONFIRE — low stone ring
            21: 2.5,               // TREE — perimeter trees
            22: 0.5,               // SHRUB — half-height hedge
            35: 0.4,               // FENCE — railing
            37: 0.25,              // MAILBOX — short stone platform
            38: 2.0,               // DUMP_TRUCK — HEARTH-stature pressure-wash truck
                                   //   (freeform: 0.40 lower body w/ wheel decor +
                                   //   0.25 ground-level spool cavity + 1.35 upper
                                   //   chassis). See spatial-contract.js tileFreeform
                                   //   entry 38 for the band split and truck_spool_cavity
                                   //   gap filler. Must match the base exterior() value
                                   //   (2.0) or the biome merge will clobber the
                                   //   freeform geometry and fall back to a flat slab.
            40: 0.5,               // WELL — stone rim
            41: 0.35,              // BENCH — low seating
            42: 1.2,               // NOTICE_BOARD — tall posts
            44: 0.6,               // BARREL — banded oak
            47: 0.7,               // SOUP_KITCHEN — cauldron on brazier
            48: 0.3,               // COT — low bedroll
            55: 0.4,               // STRETCHER_DOCK — low frame
            56: 0.4,               // TRIAGE_BED — low bed
            59: 1.0                // REFRIG_LOCKER — cabinet height
          }),
          tileHeightOffsets: Object.freeze({
            5:  -0.12,   // STAIRS_DN — sunken (base default)
            6:   0.06,   // STAIRS_UP — slight rise (base default)
            14:  0.15    // BOSS_DOOR — elevated (base default)
            // DUMP_TRUCK: no offset — truck sits at ground level (same as bonfire)
          }),
          floorTexture: 'floor_cobble',
          tileFloorTextures: Object.freeze({
            21: 'floor_grass',       // TREE — grass under trees
            22: 'floor_grass',       // SHRUB — grass under hedges
            32: 'floor_cobble',      // ROAD — cobblestone avenues
            33: 'floor_boardwalk',   // PATH — boardwalk planks (walkable boardwalk surface)
            34: 'floor_grass',       // GRASS — meadow clearings
            35: 'floor_boardwalk',   // FENCE — boardwalk planks under railing
            37: 'floor_grass'        // MAILBOX — grass under mailbox
          })
        };
      case 'frontier':
        // The Garrison — militarized port district, cool dusk tones
        // Stone/concrete fortress walls, worn dirt paths, waterfront edge.
        return {
          textures: Object.freeze({
            1:  'concrete',          // WALL — fortress/slum concrete
            2:  'door_iron',         // DOOR — heavy iron gate (military)
            3:  'door_wood_asc',     // DOOR_BACK — ascending porthole
            4:  'door_wood_asc',     // DOOR_EXIT — ascending porthole
            5:  'stairs_down',       // STAIRS_DN
            6:  'stairs_up',        // STAIRS_UP
            10: 'stone_rough',       // PILLAR — rough stone columns (tower corners)
            11: 'crate_wood',        // BREAKABLE — pier crates
            14: 'door_iron',         // BOSS_DOOR — grand arch gate
            18: 'bonfire_ring',      // BONFIRE — stone ring
            21: 'tree_trunk',        // TREE — perimeter/forest trees
            22: 'shrub',             // SHRUB — border hedges
            35: 'wall_pier',         // FENCE — salt-worn pier railing
            37: 'shrub',             // MAILBOX — shrub base
            // Living infrastructure tiles (DOC-84 §1)
            40: 'well_stone',        // WELL — circular stone rim
            41: 'bench_wood',        // BENCH — wooden slat seat
            42: 'notice_board_wood', // NOTICE_BOARD — posts with parchment
            43: 'anvil_iron',        // ANVIL — dark iron on stone
            44: 'barrel_wood',       // BARREL — banded oak barrel
            47: 'soup_cauldron',     // SOUP_KITCHEN — iron pot on brazier
            48: 'cot_canvas',        // COT — canvas bedroll
            // Economy tiles (DOC-84 §17) — Morgue + Union Hall on Floor 3
            55: 'cot_canvas',        // STRETCHER_DOCK — reuses cot texture (wider aspect)
            56: 'cot_canvas',        // TRIAGE_BED — reuses cot texture (tinted)
            57: 'table_wood',        // MORGUE_TABLE — stone slab (placeholder: table)
            58: 'hearth_riverrock',  // INCINERATOR — iron grate (placeholder: hearth)
            59: 'switchboard_panel'  // REFRIG_LOCKER — metal cabinet (placeholder: switchboard)
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — fortress walls (shorter than commercial)
            2:  2.5,               // DOOR — flush with fortress wall
            3:  2.5,               // DOOR_BACK
            4:  2.5,               // DOOR_EXIT
            10: 2.0,               // PILLAR — tower corner pillars
            11: 0.5,               // BREAKABLE — crate height
            14: 3.5,               // BOSS_DOOR — grand arch (tallest element)
            18: 0.3,               // BONFIRE — low stone ring
            21: 2.5,               // TREE — perimeter trees
            22: 0.5,               // SHRUB — half-height hedge
            35: 0.4,               // FENCE — pier railing
            37: 0.25,              // MAILBOX — short platform
            40: 0.5,               // WELL — stone rim
            41: 0.35,              // BENCH — low seating
            42: 1.2,               // NOTICE_BOARD — tall posts
            43: 0.5,               // ANVIL — waist-height iron block
            44: 0.6,               // BARREL — banded oak
            47: 0.7,               // SOUP_KITCHEN — cauldron on brazier
            48: 0.3,               // COT — low bedroll
            55: 0.4,               // STRETCHER_DOCK — low frame
            56: 0.4,               // TRIAGE_BED — low bed
            57: 0.5,               // MORGUE_TABLE — stone slab
            58: 1.2,               // INCINERATOR — tall iron frame
            59: 1.0                // REFRIG_LOCKER — cabinet height
          }),
          tileHeightOffsets: Object.freeze({
            5:  -0.12,   // STAIRS_DN
            6:   0.06,   // STAIRS_UP
            14:  0.15    // BOSS_DOOR — elevated arch
          }),
          floorTexture: 'floor_dirt',
          tileFloorTextures: Object.freeze({
            21: 'floor_grass',       // TREE — grass under trees
            22: 'floor_grass',       // SHRUB — grass under hedges
            32: 'floor_cobble',      // ROAD — highway cobblestone
            33: 'floor_dirt',        // PATH — worn dirt (slum + pier)
            34: 'floor_grass',       // GRASS — forest clearing
            35: 'floor_boardwalk',   // FENCE — boardwalk planks under railing
            37: 'floor_grass'        // MAILBOX — grass
          })
        };
      case 'office':
        // Dispatcher's Office — formal institutional interior
        // Clean stone walls, orderly layout, dispatch desk.
        return {
          textures: Object.freeze({
            1:  'concrete',         // WALL — clean institutional stone
            2:  'door_wood',        // DOOR
            3:  'door_wood',        // DOOR_BACK
            4:  'door_wood_asc',    // DOOR_EXIT — back to exterior
            10: 'stone_rough',      // PILLAR — stone columns
            25: 'bookshelf',        // BOOKSHELF — filing shelves
            28: 'table_wood'        // TABLE — dispatch desk
          }),
          tileWallHeights: Object.freeze({
            10: 2.0,               // PILLAR — formal columns
            28: 0.4                // TABLE — low desk surface
          }),
          floorTexture: 'floor_stone'
        };
      case 'watchpost':
        // Watchman's Post — military staging area, stone and iron
        // Heavy stone walls, iron-bound doors, staging room for dungeon.
        return {
          textures: Object.freeze({
            1:  'stone_cathedral',  // WALL — heavy dressed stone
            2:  'door_iron',        // DOOR — iron gate
            3:  'door_iron',        // DOOR_BACK
            4:  'door_wood_asc',    // DOOR_EXIT — back to exterior
            5:  'stairs_down',      // STAIRS_DN — to Hero's Wake
            6:  'stairs_up',        // STAIRS_UP
            7:  'stash_chest',      // CHEST — supply chest (iron-bound)
            10: 'stone_cathedral',  // PILLAR — stone columns
            25: 'bookshelf',        // BOOKSHELF — records shelves
            28: 'table_wood',       // TABLE — planning table
            48: 'cot_canvas'        // COT — guard bunks
          }),
          tileWallHeights: Object.freeze({
            7:  0.7,               // CHEST — waist-height stash box
            10: 2.2,               // PILLAR — imposing columns
            28: 0.4,               // TABLE — low planning surface
            48: 0.3                // COT — low guard bunk
          }),
          floorTexture: 'floor_stone'
        };
      case 'armory':
        // Armory / Barracks — military interior, iron and stone
        // Heavy stone walls, weapon racks (bookshelves), iron doors,
        // staging room for descent to Ironhold Depths dungeon.
        return {
          textures: Object.freeze({
            1:  'stone_cathedral',  // WALL — heavy dressed stone (garrison)
            2:  'door_iron',        // DOOR — iron gate
            3:  'door_iron',        // DOOR_BACK
            4:  'door_wood_asc',    // DOOR_EXIT — back to exterior
            5:  'stairs_down',      // STAIRS_DN — to Ironhold Depths
            6:  'stairs_up',        // STAIRS_UP
            10: 'stone_cathedral',  // PILLAR — stone columns
            18: 'bonfire_ring',     // BONFIRE — warming ring
            25: 'bookshelf',        // BOOKSHELF — weapon racks / tactical shelf
            28: 'table_wood'        // TABLE — planning table
          }),
          tileWallHeights: Object.freeze({
            10: 2.2,               // PILLAR — imposing garrison columns
            18: 0.3,               // BONFIRE — low stone ring
            28: 0.4                // TABLE — low planning surface
          }),
          floorTexture: 'floor_stone'
        };
      case 'shop':
        // Generic shop interior — warm lamplight, display cases, stone floor
        // Reusable biome for all dedicated shop buildings (2.3, 3.2, etc.)
        return {
          textures: Object.freeze({
            1:  'stone_rough',      // WALL — rough stone interior
            2:  'door_wood',        // DOOR
            3:  'door_wood',        // DOOR_BACK
            4:  'door_wood_asc',    // DOOR_EXIT — back to exterior
            10: 'wood_dark',        // PILLAR — dark wood display columns
            25: 'bookshelf',        // BOOKSHELF — supply shelves / weapon racks
            26: 'wood_dark',        // BAR_COUNTER — display case surface
            30: 'wood_plank',       // TORCH_LIT — torch bracket (warm wood)
            43: 'anvil_iron',       // ANVIL — dark iron work surface
            44: 'barrel_wood'       // BARREL — banded oak barrel
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — extends above ceiling
            10: 2.2,               // PILLAR — tall display columns
            26: 0.8,               // BAR_COUNTER — counter height
            30: 1.0,               // TORCH_LIT — wall sconce height
            43: 0.5,               // ANVIL — waist-height iron block
            44: 0.6                // BARREL — banded oak
          }),
          floorTexture: 'floor_stone'
        };
      case 'catacomb':
        // Hero's Wake — ancient catacombs, bone-dry stone, dim torchlight
        return {
          textures: Object.freeze({
            1: 'stone_cathedral', 2: 'door_cellar', 3: 'door_cellar', 4: 'door_cellar',
            5: 'stairs_down', 6: 'stairs_up', 14: 'door_iron',
            29: 'hearth_riverrock'
          }),
          tileWallHeights: Object.freeze({ 7: 0.65, 11: 0.6, 29: 0.5 }),
          floorTexture: 'floor_stone',
          fogColor: { r: 6, g: 4, b: 8 },
          stepColor: '#140e18'
        };
      case 'cellar':
        // Stone walls ↔ brown dirt floor — dungeon contrast
        return {
          textures: Object.freeze({
            1: 'stone_rough', 2: 'door_cellar', 3: 'door_cellar', 4: 'door_cellar',
            5: 'stairs_down', 6: 'stairs_up', 14: 'door_iron',
            29: 'hearth_riverrock',  // HEARTH — dungeon rest point
            // Creature verb tiles (DOC-84 §12)
            49: 'roost_ceiling',     // ROOST — ceiling claw-mark anchor (walkable overhead)
            50: 'nest_debris',       // NEST — bone/cloth debris pile
            51: 'den_hollow',        // DEN — hollowed alcove recess
            52: 'fungal_glow',       // FUNGAL_PATCH — bioluminescent floor growth
            54: 'scorch_mark'        // TERRITORIAL_MARK — claw gouge on floor
          }),
          tileWallHeights: Object.freeze({
            7: 0.65, 11: 0.6, 29: 0.5,
            50: 0.3, 51: 0.5
          }),
          floorTexture: 'floor_dirt'
        };
      case 'foundry':
        // Dark metal walls ↔ warm dirt floor — industrial contrast
        return {
          textures: Object.freeze({
            1: 'metal_plate', 2: 'door_foundry', 3: 'door_foundry', 4: 'door_foundry',
            5: 'stairs_down', 6: 'stairs_up', 14: 'door_iron',
            29: 'hearth_riverrock',  // HEARTH — dungeon rest point
            // Creature verb tiles (DOC-84 §12)
            50: 'nest_debris',       // NEST — scrap/vent debris (Soot Imp clusters)
            51: 'den_hollow',        // DEN — pack creature alcove (Slag Hounds)
            53: 'conduit_spark',     // ENERGY_CONDUIT — exposed power junction
            54: 'scorch_mark',       // TERRITORIAL_MARK — scorch mark on floor
            46: 'switchboard_panel'  // SWITCHBOARD — comms panel
          }),
          tileWallHeights: Object.freeze({
            7: 0.65, 11: 0.6, 29: 0.5,
            46: 1.0,                 // SWITCHBOARD — full-height panel
            50: 0.3, 51: 0.5, 53: 0.8
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
            14: 'door_iron',       // BOSS_DOOR
            29: 'hearth_riverrock', // HEARTH — dungeon rest point
            45: 'charging_cradle', // CHARGING_CRADLE — construct charging station
            46: 'switchboard_panel', // SWITCHBOARD — lab comms panel
            // Creature verb tiles (DOC-84 §12)
            49: 'roost_ceiling',   // ROOST — ceiling coil anchor (Shock Eels)
            50: 'nest_debris',     // NEST — marine prey cache (Deep Crawlers)
            51: 'den_hollow',      // DEN — tidal pool alcove (Tide Stalkers)
            52: 'fungal_glow',     // FUNGAL_PATCH — brine seep bioluminescence
            53: 'conduit_spark',   // ENERGY_CONDUIT — exposed lab power junction
            54: 'scorch_mark'      // TERRITORIAL_MARK — claw gouge
          }),
          tileWallHeights: Object.freeze({
            7: 0.65, 11: 0.6, 29: 0.5,
            45: 0.8,               // CHARGING_CRADLE — tall metal frame
            46: 1.0,               // SWITCHBOARD — full-height panel
            50: 0.3, 51: 0.5, 53: 0.8
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
      exterior:     { wallLight: '#7a8a7a', wallDark: '#5a6a5a', door: '#8a7a60', doorDark: '#6a5a40', ceil: '#2a3a4a', floor: '#6a4038' },  // cool evening
      promenade:    { wallLight: '#d4a080', wallDark: '#a07858', door: '#c89050', doorDark: '#a07040', ceil: '#e8a070', floor: '#d4a878' },  // warm sunset coral
      bazaar:       { wallLight: '#c89868', wallDark: '#a07848', door: '#b08050', doorDark: '#8a6030', ceil: '#3a1a0a', floor: '#c89868' },  // warm coral-gold interior
      home:         { wallLight: '#b88a58', wallDark: '#8a6438', door: '#a07040', doorDark: '#7a5020', ceil: '#2a1808', floor: '#4a3018' },  // warm amber plank room
      inn:          { wallLight: '#c09060', wallDark: '#987048', door: '#b08050', doorDark: '#8a6030', ceil: '#2a1a0a', floor: '#5a3a20' },  // warm tavern amber
      cellar_entry: { wallLight: '#8a7a6a', wallDark: '#6a5a4a', door: '#9a7a50', doorDark: '#7a5a30', ceil: '#1a1818', floor: '#3a3028' },  // dim stone cellar
      lantern:      { wallLight: '#c8a080', wallDark: '#a08060', door: '#b89060', doorDark: '#987040', ceil: '#d09060', floor: '#b8a080' },  // warm lantern-lit brick
      office:       { wallLight: '#9a9a8a', wallDark: '#7a7a6a', door: '#8a8070', doorDark: '#6a6050', ceil: '#2a2828', floor: '#5a5850' },  // clean institutional grey
      watchpost:    { wallLight: '#8a8a8a', wallDark: '#5a5a5a', door: '#7a7a7a', doorDark: '#4a4a4a', ceil: '#1a1a1a', floor: '#4a4a48' },  // cold military stone
      catacomb:     { wallLight: '#7a6a6a', wallDark: '#5a4a4a', door: '#8a6a50', doorDark: '#6a4a30', ceil: '#0a0808', floor: '#2a2020' },  // ancient bone-dry stone
      cellar:       { wallLight: '#8a7a6a', wallDark: '#6a5a4a', door: '#b08040', doorDark: '#906830', ceil: '#1a1a22', floor: '#3a3028' },  // dirt-brown fallback
      foundry:      { wallLight: '#7a5a4a', wallDark: '#5a3a2a', door: '#aa6a3a', doorDark: '#8a5a2a', ceil: '#1a1210', floor: '#3a2a20' },  // warm dirt fallback
      sealab:       { wallLight: '#6a7a8a', wallDark: '#4a5a6a', door: '#6a8aaa', doorDark: '#4a6a8a', ceil: '#0a1a2a', floor: '#4a5a6a' }   // cool tile fallback
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
          renderDistance: 24,
          fogDistance: 20,
          fogColor: { r: 30, g: 40, b: 55 },
          terminusFog: { height: 0.18, opacity: 0.75 },
          ceilColor: '#1a2a3a',
          floorColor: '#3a4a3a',
          gridSize: { w: 50, h: 36 },
          roomCount: { min: 8, max: 8 },
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
          renderDistance: 24,
          fogDistance: 22,
          fogColor: { r: 45, g: 28, b: 22 },
          ceilColor: '#e8a070',
          floorColor: '#d4a878',
          gridSize: { w: 50, h: 36 },
          roomCount: { min: 7, max: 7 },
          skyPreset: 'sunset',
          parallax: [
            { depth: 0.95, color: '#c06848', height: 0.08 },
            { depth: 0.85, color: '#4a2838', height: 0.15 }
          ]
        }, biomeTextures));
      }
      if (floor === '2') {
        return SpatialContract.exterior(Object.assign({
          label: 'Lantern Row',
          wallHeight: 1.0,
          renderDistance: 30,
          fogDistance: 24,
          fogColor: { r: 35, g: 22, b: 15 },
          waterColor: { r: 12, g: 30, b: 55 },  // Deep dusk-ocean blue
          ceilColor: '#d09060',
          floorColor: '#b8a080',
          gridSize: { w: 50, h: 36 },
          roomCount: { min: 7, max: 7 },
          skyPreset: 'lantern',
          terminusFog: { height: 0.20, opacity: 0.72 },
          parallax: [
            { depth: 0.95, color: '#b06040', height: 0.10 },
            { depth: 0.85, color: '#4a2030', height: 0.12 }
          ],
          audio: { musicId: 'music-tavern-jam' }   // Lantern Row — boardwalk energy
        }, biomeTextures));
      }
      if (floor === '3') {
        return SpatialContract.exterior(Object.assign({
          label: 'The Garrison',
          wallHeight: 1.0,
          renderDistance: 32,
          fogDistance: 26,
          fogColor: { r: 20, g: 25, b: 40 },
          waterColor: { r: 10, g: 22, b: 45 },   // Deep dusk-ocean
          ceilColor: '#1a2040',
          floorColor: '#3a3830',
          gridSize: { w: 52, h: 52 },
          roomCount: { min: 5, max: 5 },
          skyPreset: 'frontier',
          terminusFog: { height: 0.22, opacity: 0.80 },
          parallax: [
            { depth: 0.95, color: '#161220', height: 0.15 },
            { depth: 0.85, color: '#1a1220', height: 0.12 }
          ],
          audio: { musicId: 'music-empire' }   // The Garrison — frontier military
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
      if (floor === '1.6') {
        return SpatialContract.interior(Object.assign({
          label: "Gleaner's Home",
          wallHeight: 2.0,
          // Home is a 24×20 multi-room interior. The previous 14/12 range
          // stopped rays at pd=14, which was shorter than the longest
          // through-doorway sightline (player in living room seeing the
          // far storage east wall at x=23, pd≈15.5). That produced the
          // "merlon band" visible above half-height furniture: columns
          // whose rays hit the living-room east wall (pd≈9) rendered a
          // back layer; adjacent columns whose rays threaded through the
          // row-5 doorway hit the far storage wall at pd≈15.5 and the
          // layer was fog-clamped to 1.0 and culled. 22/18 lets those
          // far walls render dim-but-visible, filling the horizon.
          renderDistance: 22,
          fogDistance: 18,
          fogColor: { r: 20, g: 10, b: 5 },
          ceilColor: '#2a1808',
          floorColor: '#4a3018',
          gridSize: { w: 24, h: 20 },
          roomCount: { min: 4, max: 4 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at front door
            7:  -0.08,   // CHEST (stash) — sunken into floor alcove
            10: 0,       // PILLAR — flush with floor (no floating)
            27: -0.15,   // BED — low to the ground, player looks down at it
            28: -0.10,   // TABLE — half-height work surface
            29: -0.40    // HEARTH — deep sunken: generous fire cavity for sandwich rendering
          })
        }, biomeTextures));
      }
      if (floor === '1.2') {
        return SpatialContract.interior(Object.assign({
          label: 'Driftwood Inn',
          wallHeight: 2.0,
          renderDistance: 14,
          fogDistance: 12,
          fogColor: { r: 25, g: 12, b: 6 },
          ceilColor: '#2a1a0a',
          floorColor: '#5a3a20',
          gridSize: { w: 20, h: 16 },
          roomCount: { min: 3, max: 4 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — bar height offset
            27: -0.15,   // BED — low guest bed
            28: -0.10,   // TABLE — dining table
            29: -0.40    // HEARTH — deep sunken: generous fire cavity for sandwich rendering
          })
        }, biomeTextures));
      }
      if (floor === '1.3') {
        return SpatialContract.interior(Object.assign({
          label: 'Cellar Entrance',
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 18, g: 14, b: 10 },
          ceilColor: '#1a1818',
          floorColor: '#3a3028',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            29: -0.40    // HEARTH — deep sunken: fire cavity for sandwich rendering
          })
        }, biomeTextures));
      }
      if (floor === '2.1') {
        return SpatialContract.interior(Object.assign({
          label: "Dispatcher's Office",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 15, g: 14, b: 12 },
          ceilColor: '#2a2828',
          floorColor: '#5a5850',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            28: -0.10    // TABLE — dispatch desk height
          })
        }, biomeTextures));
      }
      if (floor === '2.2') {
        return SpatialContract.interior(Object.assign({
          label: "Watchman's Post",
          wallHeight: 2.0,
          renderDistance: 14,
          fogDistance: 12,
          fogColor: { r: 10, g: 10, b: 12 },
          ceilColor: '#1a1a1a',
          floorColor: '#4a4a48',
          gridSize: { w: 18, h: 14 },
          roomCount: { min: 3, max: 4 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            28: -0.10    // TABLE — planning table
          })
        }, biomeTextures));
      }
      if (floor === '2.3') {
        return SpatialContract.interior(Object.assign({
          label: "Armorer's Workshop",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 22, g: 14, b: 8 },
          ceilColor: '#2a1a0c',
          floorColor: '#5a4830',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — display case height
            30:  0       // TORCH_LIT — flush with wall
          })
        }, biomeTextures));
      }
      if (floor === '2.4') {
        return SpatialContract.interior(Object.assign({
          label: "The Chandler's Shop",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 26, g: 18, b: 10 },
          ceilColor: '#2c1e10',
          floorColor: '#5e4a32',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — display case height
            30:  0       // TORCH_LIT — flush with wall
          })
        }, biomeTextures));
      }
      if (floor === '2.5') {
        return SpatialContract.interior(Object.assign({
          label: "The Apothecary",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 20, g: 24, b: 14 },
          ceilColor: '#1e241a',
          floorColor: '#4a5232',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — display case height
            30:  0       // TORCH_LIT — flush with wall
          })
        }, biomeTextures));
      }
      if (floor === '2.6') {
        return SpatialContract.interior(Object.assign({
          label: "The Cartographer",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 16, g: 18, b: 26 },
          ceilColor: '#1a1c28',
          floorColor: '#4a4c58',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — chart counter height
            28: -0.10,   // TABLE — chart table
            30:  0       // TORCH_LIT — flush with wall
          })
        }, biomeTextures));
      }
      if (floor === '2.7') {
        return SpatialContract.interior(Object.assign({
          label: "The Tea House",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 28, g: 20, b: 14 },
          ceilColor: '#2e2014',
          floorColor: '#5e4a36',
          gridSize: { w: 16, h: 12 },
          roomCount: { min: 2, max: 3 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — tea service counter
            28: -0.10,   // TABLE — low seating tables
            30:  0       // TORCH_LIT — flush with wall
          })
        }, biomeTextures));
      }
      if (floor === '3.2') {
        return SpatialContract.interior(Object.assign({
          label: "Quartermaster's Shop",
          wallHeight: 2.0,
          renderDistance: 12,
          fogDistance: 10,
          fogColor: { r: 14, g: 12, b: 18 },
          ceilColor: '#1a1820',
          floorColor: '#484650',
          gridSize: { w: 14, h: 10 },
          roomCount: { min: 2, max: 2 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            26: -0.05,   // BAR_COUNTER — display case height
            30:  0       // TORCH_LIT — flush with wall
          })
        }, biomeTextures));
      }
      if (floor === '3.1') {
        return SpatialContract.interior(Object.assign({
          label: 'Armory',
          wallHeight: 2.0,
          renderDistance: 14,
          fogDistance: 12,
          fogColor: { r: 12, g: 10, b: 16 },
          ceilColor: '#1a1820',
          floorColor: '#3a3840',
          gridSize: { w: 18, h: 14 },
          roomCount: { min: 3, max: 4 },
          tileHeightOffsets: Object.freeze({
            4:  0.05,    // DOOR_EXIT — slight step at entrance
            28: -0.10    // TABLE — planning table
          })
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

    // The Approach building interiors (0.5.N) — depth 3 by ID convention
    // but functionally interior rooms accessed from floor 0 exterior.
    // Use interior contract, not nestedDungeon.
    if (floor === '0.5.1') {
      return SpatialContract.interior(Object.assign({
        label: 'Upper Facade',
        wallHeight: 2.0, renderDistance: 12, fogDistance: 10,
        fogColor: { r: 15, g: 12, b: 8 },
        ceilColor: '#1a1818', floorColor: '#3a3028',
        gridSize: { w: 14, h: 10 }, roomCount: { min: 2, max: 3 }
      }, biomeTextures));
    }
    if (floor === '0.5.2') {
      return SpatialContract.interior(Object.assign({
        label: 'Old Shack',
        wallHeight: 1.8, renderDistance: 10, fogDistance: 8,
        fogColor: { r: 12, g: 10, b: 6 },
        ceilColor: '#1a1818', floorColor: '#3a3028',
        gridSize: { w: 12, h: 10 }, roomCount: { min: 2, max: 2 }
      }, biomeTextures));
    }
    if (floor === '0.5.3') {
      return SpatialContract.interior(Object.assign({
        label: 'Root Cellar',
        wallHeight: 1.8, renderDistance: 10, fogDistance: 8,
        fogColor: { r: 10, g: 8, b: 6 },
        ceilColor: '#1a1818', floorColor: '#3a3028',
        gridSize: { w: 12, h: 10 }, roomCount: { min: 2, max: 2 }
      }, biomeTextures));
    }
    if (floor === '0.5.4') {
      return SpatialContract.interior(Object.assign({
        label: 'Old Keep',
        wallHeight: 2.2, renderDistance: 14, fogDistance: 10,
        fogColor: { r: 12, g: 10, b: 14 },
        ceilColor: '#1a1818', floorColor: '#2a2020',
        gridSize: { w: 16, h: 12 }, roomCount: { min: 3, max: 4 }
      }, biomeTextures));
    }

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

  var _FLOOR0_W = 50;
  var _FLOOR0_H = 36;
  // Legend: 0=EMPTY, 1=WALL, 2=DOOR, 10=PILLAR, 18=BONFIRE, 21=TREE, 22=SHRUB,
  //         32=ROAD, 33=PATH, 34=GRASS, 35=FENCE, 37=MAILBOX
  //
  // 40×30 exterior — The Approach. Interstate exit ramp campground.
  //
  // Layout: ROAD spine (cols 18-20) runs N-S from overpass to gate arcade.
  // West meadow = encampment zone (2 shacks, campfires, tree clusters).
  // East meadow = residential zone (1 house with fence yard, mailbox).
  // North: Roman-arch gate facade (thin wall + wide arch) to Floor 1.
  // South: Concrete overpass wall — player was just dropped off here.
  // GRASS dominant, PATH dirt trails branch to structures, ROAD for spine.
  //
  // NPC placement (not tile-driven):
  //   - 1-2 idle at encampment campfires (west)
  //   - 1 resident near house (east) — barks about "those people" camping
  var _FLOOR0_GRID = [
    //         0         1         2         3         4
    //         0123456789012345678901234567890123456789012345678 9
    [1,1,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 0  overpass + tree border
    [1,1,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 1  overpass + tree border
    [1,1,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,34,34,1,1,1,1,21,21,21], // 2  shrub perimeter N + facade
    [1,1,21,22,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,1,1,1,1,21,21,21], // 3  open meadow interior
    [1,1,21,22,34,22,22,22,22,22,22,22,22,34,34,22,22,22,22,22,22,22,22,34,34,22,22,22,22,22,22,22,22,34,34,34,34,34,34,34,34,34,34,1,1,1,1,21,21,21], // 4  pod tops (NW, NC, NE)
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,34,34,1,1,1,1,21,21,21], // 5  pod interiors
    [1,1,21,22,34,22,34,21,21,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,1,1,1,1,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], // 6  NW trees + NE shack top + facade widens
    [1,1,21,22,34,22,34,21,34,34,34,34,22,34,34,22,34,34,34,21,34,34,22,34,34,22,34,1, 1, 1,1,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], // 7  NE shack solid; upper facade solid (interiors deferred — see BUILDING_INTERIORS_ROADMAP)
    [1,1,21,22,34,22,34,34,21,34,34,34,22,34,34,22,34,34,18,34,34,34,22,34,34,22,34,1, 1, 1,1,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], // 8  NC campfire(18,8); NE shack solid
    [1,1,21,22,34,22,34,21,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,1, 1, 1,1,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], // 9  NE shack front wall solid (door deferred)
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,21,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //10  pod interiors
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,18,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //11  NE bonfire(29,11) outside shack
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //12  pod interiors
    [1,1,21,22,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //13  pod bottoms (C-shape gaps)
    [1,1,21,22,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //14  N-S path stubs
    [1,1,21,22,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,34,34,34,10,10,1,1,1,1,21,21,21], //15  path stubs + arch pillars(41,15)(42,15)
    [1,1,21,22,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,1,1,21,21,21], //16  path shoulder N
    [1,1,21,22,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,2,1,1,21,21,21], //17  ★ ROAD + arch DOOR(44,17)→Floor 1
    [1,1,21,22,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,2,1,1,21,21,21], //18  ★ ROAD + arch DOOR(44,18)→Floor 1
    [1,1,21,22,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,1,1,21,21,21], //19  path shoulder S
    [1,1,21,22,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,34,34,34,10,10,1,1,1,1,21,21,21], //20  path stubs S + arch pillars(41,20)(42,20)
    [1,1,21,22,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,33,33,34,34,34,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //21  S-N path stubs to south pods
    [1,1,21,22,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,22,22,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //22  pod tops (SW, SC, SE) — open NORTH
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //23  pod interiors
    [1,1,21,22,34,22,34,34,34,34,37,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //24  SW mailbox(10,24)
    [1,1,21,22,34,22,34,1,1,1,1,34,22,34,34,22,34,34,21,34,18,34,22,34,34,22,34,34,21,34,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //25  SW house front wall solid (door deferred — see BUILDING_INTERIORS_ROADMAP); SC bonfire(20,25)
    [1,1,21,22,34,22,34,1,1,1,1,34,22,34,34,22,34,34,34,21,34,34,22,34,34,22,34,34,34,21,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //26  SW house solid; SC tree + SE tree
    [1,1,21,22,34,22,34,1,1,1,1,34,22,34,34,22,34,21,34,34,34,34,22,34,34,22,34,34,21,34,34,34,22,34,34,34,34,34,34,34,34,1,34,34,34,1,1,21,21,21], //27  SW house solid; SC tree — facade courtyard opens
    [1,1,21,22,34,22,34,1,1,1,1,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,21,34,22,34,34,34,34,34,34,34,34,1,1,34,34,1,1,21,21,21], //28  SW house bottom; lower facade solid (interior deferred)
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,1,34,34,34,1,1,21,21,21], //29  pod interiors — courtyard
    [1,1,21,22,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,34,34,34,34,34,34,34,34,1,1,1,1,21,21,21], //30  pod interiors
    [1,1,21,22,34,22,22,22,22,22,22,22,22,34,34,22,22,22,22,22,22,22,22,34,34,22,22,22,22,22,22,22,22,34,34,34,34,34,34,34,34,34,34,1,1,1,1,21,21,21], //31  pod bottoms (closed)
    [1,1,21,22,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,0,1,1,1,1,21,21,21], //32  chest(42,32) in SE gap
    [1,1,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,34,34,1,1,1,1,21,21,21], //33  shrub perimeter S + facade
    [1,1,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], //34  tree border
    [1,1,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21]  //35  tree border
  ];

  var _FLOOR0_SPAWN = { x: 4, y: 17, dir: 0 }; // facing EAST (from overpass toward facade arch)
  var _FLOOR0_ROOMS = [
    // NW meadow pod (Tree Cluster)
    { x: 5, y: 4, w: 8, h: 10, cx: 8, cy: 8 },
    // NC meadow pod (Campground Bonfire)
    { x: 15, y: 4, w: 8, h: 10, cx: 18, cy: 8 },
    // NE meadow pod (Shack)
    { x: 25, y: 4, w: 8, h: 10, cx: 28, cy: 8 },
    // SW meadow pod (House)
    { x: 5, y: 22, w: 8, h: 10, cx: 8, cy: 26 },
    // SC meadow pod (Tree Cluster + bonfire)
    { x: 15, y: 22, w: 8, h: 10, cx: 18, cy: 26 },
    // SE meadow pod (Tree Cluster)
    { x: 25, y: 22, w: 8, h: 10, cx: 28, cy: 26 },
    // Central E-W road corridor
    { x: 4, y: 14, w: 40, h: 8, cx: 22, cy: 17 },
    // East facade strip
    { x: 41, y: 2, w: 6, h: 32, cx: 43, cy: 17 }
  ];

  function _buildFloor0() {
    var grid = [];
    for (var y = 0; y < _FLOOR0_H; y++) {
      grid[y] = _FLOOR0_GRID[y].slice();
    }

    // ── Floating tile test placements ──────────────────────────────
    // Canopy ring around isolated tree at (17,10) — mixed variants so
    // both underside rendering styles are visible on the same tree:
    //   N, S → CANOPY (65)      — opaque lid (floor-cast underside)
    //   W, E → CANOPY_MOSS (66) — hanging moss (translucent band)
    grid[9][17]  = 65;  // CANOPY       — north (opaque lid)
    grid[10][16] = 66;  // CANOPY_MOSS  — west  (hanging moss)
    grid[10][18] = 66;  // CANOPY_MOSS  — east  (hanging moss)
    grid[11][17] = 65;  // CANOPY       — south (opaque lid)

    // Crenellated rampart around NE shack (walls at cols 27-30, rows 6-9).
    // Each tile is ROOF_CRENEL (67) — single-tile crenellation via raycaster
    // tooth modulation (4 teeth per tile UV, solid bottom half). The moat
    // sits at offset 3.0 (wall top altitude) with a 0.5 slab, so the solid
    // lower half caps the 3.5× wall and the toothed upper half pokes above.
    // Top edge (y=5): cols 26-31
    grid[5][26] = 67; grid[5][27] = 67; grid[5][28] = 67;
    grid[5][29] = 67; grid[5][30] = 67; grid[5][31] = 67;
    // Bottom edge (y=10): cols 26-31
    grid[10][26] = 67; grid[10][27] = 67; grid[10][28] = 67;
    grid[10][29] = 67; grid[10][30] = 67; grid[10][31] = 67;
    // Left edge (x=26): rows 6-9 — west face visible from spawn approach
    grid[6][26] = 67; grid[7][26] = 67; grid[8][26] = 67; grid[9][26] = 67;
    // Right edge (x=31): rows 6-9
    grid[6][31] = 67; grid[7][31] = 67; grid[8][31] = 67; grid[9][31] = 67;

    return {
      floorId: '0',
      grid: grid,
      rooms: _FLOOR0_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorEntry: { x: 44, y: 17 }  // DOOR — roman arch to The Promenade (depth 0→1)
      },
      doorTargets: {
        '44,17': '1',     // Roman arch → The Promenade
        '44,18': '1'      // Roman arch lower tile → The Promenade
        // Building interiors (NE shack, SW house, upper/lower facade) are
        // deferred — walls are solid for now. Re-enable once the 0.5.N
        // interior stubs are authored as proper cellar_entry rooms.
        // See docs/BUILDING_INTERIORS_ROADMAP.md (to be written).
      },
      gridW: _FLOOR0_W,
      gridH: _FLOOR0_H,
      biome: 'exterior',
      shops: []
    };
  }

  // ── Hand-authored Floor 1: The Promenade (depth 1) ────────────────
  //
  // 40×30 exterior. Sunset-washed town plaza. Significantly larger layout
  // with thick tree perimeter, inner shrub corridors, and pillar arcades
  // that funnel players from the south gate toward buildings and Floor 2.
  // Trees and shrubs sit on grass-texture floor; paths use cobble texture.
  //
  // Six-pod layout (50×36) with central E–W road corridor rows 14–22:
  //   NW pod: Coral Bazaar        (DOOR 10,8  → 1.1)
  //   NC pod: Driftwood Inn       (DOOR 22,8  → 1.2)
  //   NE cluster: Noticeboard Pavilion (board tile at 38,7)
  //   SW pod: Storm Shelter       (DOOR 10,27 → 1.3, soft dungeon basement)
  //   SC pod: Gleaner's Home      (DOOR 22,27 → 1.6)
  //   SE cluster: Well/Fountain
  //
  // Road corridor gates:
  //   West — DOOR_EXIT(2,17)+(2,18)  → "0"  The Approach
  //   East — GATE(48,17)+(48,18)     → "2"  Lantern Row
  //
  // Landmarks:
  //   CITY_BONFIRE(24,16) — Olympic community pyre, tall freeform column on the
  //                         north path shoulder. Now the sole rest fixture of the
  //                         road plaza (the former adjacent BONFIRE at 24,17 was
  //                         retired in favor of the pergola canopy). Interactive
  //                         "Camp" — same rest flow as BONFIRE via game.js bonfire
  //                         menu path. See raycaster 'city_bonfire_fire' gap
  //                         filler + exterior() tileFreeform.
  //   PERGOLA_BEAM ring — 8 beam cells ringing the CITY_BONFIRE: (23–25,15)
  //                         north, (23,16)(25,16) east/west flanks,
  //                         (23–25,17) south canopy (now a full strip — the
  //                         old BONFIRE(24,17) was replaced with the 8th beam
  //                         cell to close the ring). Beams use hUpper=0.20 on
  //                         a 2.0-unit tall freeform column so the canopy
  //                         strip lands at world height 1.80–2.00 — a thin
  //                         "~1/4 the chimney thickness" rail resting on
  //                         top of the pyre's 1.20–2.00 chimney hood.
  //                         Walkable — player passes under the canopy the
  //                         same way they walk under CANOPY strips.
  //   MAILBOX(22,25) — 2 tiles north of home door (22,27) in SC pod.
  //                     Blockout-agnostic: MailboxPeek._findMailboxTile() scans
  //                     for TILES.MAILBOX rather than hardcoding position.
  //                     If the blockout moves the house door, move the MAILBOX
  //                     tile to stay adjacent to the new approach path.
  //   DUMP_TRUCK(30,26) — pressure wash truck parked between SC and SE pods
  //   WINDOW_TAVERN(9,8)(11,8) — Coral Bazaar facade windows flanking DOOR(10,8)
  //   WINDOW_TAVERN(21,8)(23,8) — Driftwood Inn facade windows flanking DOOR(22,8)
  //                     3.5-tall freeform column matching WALL height: 0.40 sill +
  //                     0.75 glass slot at waist-to-chin height (world Y 0.40–1.15,
  //                     slot center 0.775 — below the 1.0 eye level so the player
  //                     looks slightly DOWN into the interior) + 2.35 lintel /
  //                     upper floors. The glass slot uses window_tavern_interior
  //                     gap filler which paints amber interior wash + blue glass
  //                     sheen + 2×2 mullion cross + dark frame border (not just
  //                     an open hole — a real pane of glass with divisions).
  //                     WindowSprites emits a 🍺 billboard inside each cavity
  //                     via the z-bypass path, so the player sees lit tavern
  //                     interiors framed by mullions while walking past.

  var _FLOOR1_W = 50;
  var _FLOOR1_H = 36;
  var _FLOOR1_GRID = [
    //         0         1         2         3         4
    //         0123456789012345678901234567890123456789012345678 9
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,35,35,35,35,35,35,35,35,35,35,35,35,35,35], // 0  tree→shrub→fence border
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,35,35,35,35,35,35,35,35,35,35,35,35,35,35], // 1  tree→shrub→fence border
    [21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,35,35,35,35,35,35,35,35,35,35,35,35,35,35], // 2  shrub inner + fence inner
    [21,21,21,22,0,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,0,0,0,0,22,22,22,22,22,22,22,22,22,22,22,22,0,0,35,35,35], // 3  pod tops NW+NC + NE cluster
    [21,21,21,22,21,22,0,0,0,0,0,0,0,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,0,0,0,22,0,0,0,0,0,0,0,0,0,0,22,0,0,35,35,35], // 4
    [21,21,21,22,0,22,0,1,1,1,1,1,72,0,0,0,22,22,0,1,1,1,1,1,1,0,0,0,22,0,0,0,0,22,0,21,0,0,0,0,0,21,0,0,22,0,0,35,35,35], // 5  Bazaar east wall PORTHOLE(12,5) — Inn porthole removed (was 24,5)
    [21,21,21,22,0,22,0,1,0,0,0,0,1,0,0,0,22,22,0,1,0,0,0,0,1,0,0,0,22,0,0,0,0,22,0,0,0,10,0,10,0,0,0,0,22,0,0,35,35,35], // 6  Noticeboard pillars
    [21,21,21,22,0,22,0,1,0,0,0,0,1,0,0,0,22,22,0,1,0,0,0,0,1,0,0,0,22,0,0,0,0,22,0,21,0,0,71,0,0,21,0,0,22,0,0,35,35,35], // 7  ARCH_DOORWAY(38,7) — Phase 3 alpha-mask arch test
    [21,21,21,22,0,22,0,1,1,73,2,73,1,0,0,0,22,22,0,1,1,73,2,73,1,0,0,0,22,0,0,0,0,22,0,0,0,10,0,10,0,0,0,0,22,0,0,35,35,35], // 8  Bazaar DOOR(10,8) flanked by WINDOW_TAVERN(9,8)(11,8) + Inn DOOR(22,8) flanked by WINDOW_TAVERN(21,8)(23,8)
    [21,21,21,22,0,22,0,0,0,0,0,0,0,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,0,0,0,22,0,21,0,0,0,0,0,21,0,0,22,0,0,35,35,35], // 9
    [21,21,21,22,0,22,0,21,0,0,33,33,21,0,0,0,22,22,0,0,0,0,33,33,0,21,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //10  path stubs N
    [21,21,21,22,0,22,0,0,0,0,33,33,0,0,0,0,22,22,0,0,0,0,33,33,0,0,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //11  (bonfire removed — consolidated to road plaza)
    [21,21,21,22,0,22,0,0,0,0,33,33,0,0,0,0,22,22,0,0,0,0,33,33,0,0,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //12
    [21,21,21,22,0,22,22,22,22,22,0,0,22,22,22,22,22,22,22,22,22,22,0,0,22,22,22,22,22,0,0,0,0,22,22,22,22,22,0,0,22,22,22,22,22,0,0,35,35,35], //13  pod bottoms (C-gaps)
    [21,21,21,22,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,35,35,35], //14  pillar arcades
    [21,21,10,10,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,33,70,70,70,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,10,10,35], //15  W+E gate pillars; PERGOLA_BEAM(23–25,15) north canopy over pyre
    [1,1,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,70,69,70,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,35], //16  path shoulder N — CITY_BONFIRE(24,16) pyre with PERGOLA_BEAM(23,16)(25,16) flanks
    [1,1,4,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,70,70,70,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,0,2,0], //17  ★ ROAD + DOOR_EXIT(2,17)→0 + DOOR(48,17)→2; PERGOLA_BEAM(23–25,17) south canopy (closes the 8-cell ring)
    [1,1,4,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,0,2,0], //18  ★ ROAD + DOOR_EXIT(2,18)→0 + DOOR(48,18)→2
    [1,1,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,35], //19  path shoulder S
    [21,21,10,10,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,10,10,35], //20  gate pillars
    [21,21,21,22,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,35,35,35], //21  pillar arcades
    [21,21,21,22,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,35,35,35], //22
    [21,21,21,22,0,22,22,22,22,22,0,0,22,22,22,22,22,22,22,22,22,22,0,0,22,22,22,22,22,0,0,0,0,22,22,22,22,22,0,0,22,22,22,22,22,0,0,35,35,35], //23  pod tops S (open N)
    [21,21,21,22,0,22,0,21,0,0,33,33,0,0,21,0,22,22,0, 0,0,0,33,33,0,0,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //24  (bonfire removed — consolidated to road plaza)
    [21,21,21,22,0,22,0,0,0,0,33,33,0,0,0,0,22,22,0,0,0,0,0,33,37,0,0,0,22,0,0,0,0,22,0,21,33,33,0,0,0,21,0,0,22,0,0,35,35,35], //25  MAILBOX(24,25) outside home — moved east from home door
    [21,21,21,22,0,22,0,0,0,0,0,0,21,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,38,0,0,22,0,0,0,0,0,0,0,0,0,0,22,0,0,35,35,35], //26  DUMP_TRUCK(30,26) — parked in SE pod
    [21,21,21,22,0,22,0,0,1,1,2,1,0,0,0,0,22,22,0,0,1,1,74,1,0,0,0,0,22,0,0,0,0,22,0,21,0,0,10,10,0,21,0,0,22,0,0,35,35,35], //27  Storm Shelter DOOR(10,27) + Home DOOR_FACADE(22,27) + SE well
    [21,21,21,22,0,22,0,0,1,0,0,1,0,0,0,0,22,22,0,0,1,0,0,1,0,0,0,0,22,0,0,0,0,22,0,0,0,0,10,10,0,0,0,0,22,0,0,35,35,35], //28  building interiors + well pillars
    [21,21,21,22,0,22,0,0,1,1,1,1,0,0,0,0,22,22,0,0,1,1,1,1,0,0,0,0,22,0,0,0,0,22,0,21,0,0,0,0,0,21,0,0,22,0,0,35,35,35], //29
    [21,21,21,22,0,22,0,0,0,0,0,0,0,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,0,0,0,22,0,0,0,0,0,0,0,0,0,0,22,0,0,35,35,35], //30
    [21,21,21,22,0,22,0,0,0,0,0,0,0,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,0,0,0,22,0,0,0,0,0,0,0,0,0,0,22,0,0,35,35,35], //31
    [21,21,21,22,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,0,0,0,0,22,22,22,22,22,22,22,22,22,22,22,22,0,0,35,35,35], //32  pod bottoms
    [21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,35,35,35,35,35,35,35,35,35,35,35,35,35,35], //33  shrub→fence inner
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,35,35,35,35,35,35,35,35,35,35,35,35,35,35], //34  tree→shrub→fence border
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,35,35,35,35,35,35,35,35,35,35,35,35,35,35]  //35  tree→shrub→fence border
  ];

  var _FLOOR1_SPAWN = { x: 4, y: 17, dir: 0 }; // facing EAST (from Floor 0 arch)
  var _FLOOR1_ROOMS = [
    // NW pod — Coral Bazaar
    { x: 5, y: 3, w: 12, h: 11, cx: 10, cy: 7 },
    // NC pod — Driftwood Inn
    { x: 17, y: 3, w: 12, h: 11, cx: 22, cy: 7 },
    // NE cluster — Noticeboard Pavilion
    { x: 33, y: 3, w: 12, h: 11, cx: 38, cy: 7 },
    // SW pod — Storm Shelter (civil defense, abandoned)
    { x: 5, y: 23, w: 12, h: 10, cx: 10, cy: 27 },
    // SC pod — Gleaner's Home (player bunk)
    { x: 17, y: 23, w: 12, h: 10, cx: 22, cy: 27 },
    // SE cluster — Well/Fountain
    { x: 33, y: 23, w: 12, h: 10, cx: 38, cy: 27 },
    // Central E-W road corridor
    { x: 4, y: 14, w: 44, h: 8, cx: 24, cy: 17 }
  ];

  function _buildFloor1() {
    var grid = [];
    for (var y = 0; y < _FLOOR1_H; y++) {
      grid[y] = _FLOOR1_GRID[y].slice();
    }
    return {
      floorId: '1',
      grid: grid,
      rooms: _FLOOR1_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorExit: { x: 2, y: 17 },   // DOOR_EXIT — back to The Approach (west gate)
        doorEntry: { x: 10, y: 8 }   // DOOR — Coral Bazaar entrance (NW pod)
      },
      doorTargets: {
        '10,8':  '1.1',   // Coral Bazaar (NW pod)
        '22,8':  '1.2',   // Driftwood Inn (NC pod)
        '10,27': '1.3',   // Storm Shelter (SW pod — civil defense, basement dungeon)
        '22,27': '1.6',   // Gleaner's Home (SC pod — player bunk)
        '2,17':  '0',     // DOOR_EXIT → The Approach (west)
        '2,18':  '0',     // DOOR_EXIT → The Approach (west, lower tile)
        '48,17': '2',     // Gate → Lantern Row (east)
        '48,18': '2'      // Gate → Lantern Row (east, lower tile)
      },
      // Explicit exterior-face declarations for WINDOW_TAVERN tiles.
      // Same contract as doorTargets: "x,y" → face index
      // (0=E, 1=S, 2=W, 3=N). Winning over the auto-detect heuristic
      // in WindowSprites because Promenade row 8 has walkable EMPTY
      // on BOTH sides of each window (interior corridor N, street S),
      // which the neighbor-scoring heuristic can't disambiguate for
      // the column-aligned windows (9,8) and (21,8) whose souths
      // aren't directly over a path tile.
      windowFaces: {
        '9,8':  1,   // Bazaar left window  → facing SOUTH (the promenade)
        '11,8': 1,   // Bazaar right window → facing SOUTH
        '21,8': 1,   // Inn left window     → facing SOUTH
        '23,8': 1    // Inn right window    → facing SOUTH
      },
      // Explicit exterior-face declarations for DOOR_FACADE tiles.
      // Same contract: "x,y" → face index (0=E, 1=S, 2=W, 3=N).
      // Required when both sides of the door have walkable neighbors,
      // which the auto-detect can't disambiguate (it picks the first
      // walkable cardinal neighbor in E→S→W→N order).
      doorFaces: {
        '22,27': 3   // Gleaner's Home → exterior faces NORTH (street)
      },
      // Window scene declarations — maps each WINDOW_TAVERN tile to
      // its building, vignette recipe, and interior placement. The
      // vignette sprite is placed at facade + interiorStep (one tile
      // inside the building footprint) so it renders BEHIND the glass
      // with a visible depth gap. See LIVING_WINDOWS_ROADMAP §4.4.
      windowScenes: [
        // ── Coral Bazaar (NW pod) ─────────────────────────────────
        {
          facade:       { x: 9, y: 8 },
          interiorStep: { dx: 0, dy: -1 },   // one tile north = (9,7) inside bazaar
          building:     'coral_bazaar',
          vignette:     'bazaar_cards'
        },
        {
          facade:       { x: 11, y: 8 },
          interiorStep: { dx: 0, dy: -1 },   // (11,7) inside bazaar
          building:     'coral_bazaar',
          vignette:     'bazaar_cards'
        },
        // ── Driftwood Inn (NC pod) ────────────────────────────────
        {
          facade:       { x: 21, y: 8 },
          interiorStep: { dx: 0, dy: -1 },   // (21,7) inside inn
          building:     'driftwood_inn',
          vignette:     'tavern_mug'
        },
        {
          facade:       { x: 23, y: 8 },
          interiorStep: { dx: 0, dy: -1 },   // (23,7) inside inn
          building:     'driftwood_inn',
          vignette:     'tavern_mug'
        }
      ],
      gridW: _FLOOR1_W,
      gridH: _FLOOR1_H,
      biome: 'promenade',
      shops: []
    };
  }

  // ── Floor 1.1 (Coral Bazaar) → extracted to engine/floor-blockout-1-1.js
  // ── Floor 1.6 (Gleaner's Home) → extracted to engine/floor-blockout-1-6.js

  // (Floor 1.6 inline data removed — now in engine/floor-blockout-1-6.js)

  // ── Bookshelf placement for procedural interiors ────────────────
  //
  // Scans the first room for wall-adjacent EMPTY tiles and converts
  // 1-2 of them to BOOKSHELF (25). Assigns biome-appropriate books.

  var _INTERIOR_BOOK_PRESETS = {
    'inn':          ['tip_inn_bonfire', 'fiction_tides_of_passion', 'lore_dragon_history_1'],
    'guild':        ['tip_dispatch_protocol', 'notice_work_order_template', 'lore_gleaner_guild_charter'],
    'watchpost':    ['manual_admiralty_handbook', 'lore_hero_arrival', 'notice_hero_registration'],
    'dungeon':      ['tip_combat', 'lore_dragon_history_2'],
    'bazaar':       ['tip_bazaar_shopping', 'fiction_dashing_rogue', 'lore_adventuring_economy'],
    'cellar_entry': ['tip_combat', 'lore_dragon_history_2'],
    'office':       ['tip_dispatch_protocol', 'lore_gleaner_guild_charter', 'notice_work_order_template'],
    'home':         ['tip_home_schedule', 'fiction_love_among_crates', 'lore_gleaner_guild_charter']
  };

  function _placeBookshelvesInInterior(fd, floorId) {
    var T = TILES;
    var grid = fd.grid;
    var W = fd.gridW;
    var H = fd.gridH;
    var rooms = fd.rooms;
    if (!rooms || rooms.length === 0) return;

    // Use the first room (main room)
    var room = rooms[0];
    var candidates = [];

    // Find EMPTY tiles adjacent to WALLs inside the room
    for (var ry = room.y; ry < room.y + room.h && ry < H; ry++) {
      for (var rx = room.x; rx < room.x + room.w && rx < W; rx++) {
        if (grid[ry][rx] !== T.EMPTY) continue;
        // Check if adjacent to a wall
        var adjWall = false;
        if (ry > 0 && grid[ry - 1][rx] === T.WALL) adjWall = true;
        if (ry < H - 1 && grid[ry + 1][rx] === T.WALL) adjWall = true;
        if (rx > 0 && grid[ry][rx - 1] === T.WALL) adjWall = true;
        if (rx < W - 1 && grid[ry][rx + 1] === T.WALL) adjWall = true;
        if (adjWall) candidates.push({ x: rx, y: ry });
      }
    }

    if (candidates.length === 0) return;

    // Place 1-2 bookshelves using seeded selection
    var biome = fd.biome || 'guild';
    var presets = _INTERIOR_BOOK_PRESETS[biome] || _INTERIOR_BOOK_PRESETS['guild'];
    var count = Math.min(2, candidates.length, presets.length);
    fd.books = [];

    // Stable shuffle: pick spaced candidates
    var step = Math.max(1, Math.floor(candidates.length / count));
    for (var i = 0; i < count; i++) {
      var ci = (i * step) % candidates.length;
      var pos = candidates[ci];
      grid[pos.y][pos.x] = T.BOOKSHELF;
      fd.books.push({ x: pos.x, y: pos.y, bookId: presets[i] });
    }
  }

  // ── Wall decor auto-generation for hand-authored floors ──────
  // Mirrors GridGen._generateWallDecor logic for floors that don't go
  // through the proc-gen pipeline. Places torch brackets on wall faces
  // adjacent to walkable tiles. Exterior floors get banners on
  // building walls; interior/dungeon floors get torches and grates.

  function _buildWallDecorFromGrid(grid, rooms, W, H, biome, contract) {
    var decor = [];
    for (var y = 0; y < H; y++) {
      decor[y] = [];
      for (var x = 0; x < W; x++) {
        decor[y][x] = null;
      }
    }

    var T = TILES;

    // ── Torches/banners on walls adjacent to walkable tiles ──
    for (var dy = 1; dy < H - 1; dy++) {
      for (var dx = 1; dx < W - 1; dx++) {
        if (grid[dy][dx] !== T.WALL) continue;

        // Find faces bordering walkable tiles
        var faces = [];
        if (grid[dy - 1][dx] === T.EMPTY) faces.push('n');
        if (dy < H - 1 && grid[dy + 1][dx] === T.EMPTY) faces.push('s');
        if (grid[dy][dx - 1] === T.EMPTY) faces.push('w');
        if (dx < W - 1 && grid[dy][dx + 1] === T.EMPTY) faces.push('e');
        if (faces.length === 0) continue;

        // Sparse placement: deterministic hash → ~10% of eligible walls
        var h = ((dx * 374761 + dy * 668265) & 0x7fffffff) / 0x7fffffff;
        if (h > 0.10) continue;

        var face = faces[Math.floor(h * 10 * faces.length) % faces.length];
        var sprite = 'decor_torch';
        if (biome === 'exterior' && h < 0.04) {
          sprite = 'decor_banner_red';
        } else if (biome !== 'exterior' && h < 0.03) {
          sprite = 'decor_grate';
        }

        decor[dy][dx] = { n: [], s: [], e: [], w: [] };
        decor[dy][dx][face].push({
          spriteId: sprite,
          anchorU: 0.5,
          anchorV: 0.65,
          scale: 0.28
        });
      }
    }

    // ── Fire cavity glow on BONFIRE and HEARTH tile faces ──
    var isDungeonDecor = contract && contract.depth === 'nested_dungeon';
    for (var by = 0; by < H; by++) {
      for (var bx = 0; bx < W; bx++) {
        var bt = grid[by][bx];
        if (bt !== T.BONFIRE && bt !== T.HEARTH) continue;

        // Find walkable neighbor faces → place fire emoji as cavity decor
        var bFaces = [];
        if (by > 0 && T.isWalkable(grid[by - 1][bx])) bFaces.push('n');
        if (by < H - 1 && T.isWalkable(grid[by + 1][bx])) bFaces.push('s');
        if (bx > 0 && T.isWalkable(grid[by][bx - 1])) bFaces.push('w');
        if (bx < W - 1 && T.isWalkable(grid[by][bx + 1])) bFaces.push('e');
        if (bFaces.length === 0) continue;

        // Dungeon hearths get cold blue-grey cavity glow; all others warm orange
        var isDungeonHearth = bt === T.HEARTH && isDungeonDecor;
        var cgR = isDungeonHearth ?  80 : 255;
        var cgG = isDungeonHearth ? 100 : 120;
        var cgB = isDungeonHearth ? 160 :  30;
        var cgA = isDungeonHearth ? 0.25 : 0.35;

        if (!decor[by][bx]) decor[by][bx] = { n: [], s: [], e: [], w: [] };
        for (var bf = 0; bf < bFaces.length; bf++) {
          // Both HEARTH and BONFIRE use decor_hearth_fire (flame+dragon
          // composition) visible through their transparent portholes.
          // HEARTH: large porthole in tall (1.6x) riverrock column.
          // BONFIRE: wide slot porthole in short (0.3x) stone ring.
          var isHearth = (bt === T.HEARTH);
          decor[by][bx][bFaces[bf]].push({
            spriteId: 'decor_hearth_fire',
            anchorU: 0.5,
            anchorV: isHearth ? 0.45 : 0.50,
            scale: isHearth ? 0.4 : 0.35,
            cavityGlow: true,
            cavityBand: true,  // Rendered in step-fill lip, skip on wall face
            glowR: cgR, glowG: cgG, glowB: cgB, glowA: cgA,
            wobble: isHearth ? 0.02 : 0.015
          });
          // HEARTH air intake grate — painted ON the upper mantle, as
          // close to the ceiling as it'll fit. Originally anchored low
          // on the base stone (anchorV 0.35) back when the hearth's
          // fire cavity was narrow enough to leave real estate below
          // it; the current freeform (hUpper 0.80, hLower 0.40) puts
          // the cavity at world Y 0.40–1.20 on a 2.0-tall face, which
          // is exactly where anchorV 0.35 lands the sprite — floating
          // over the dragonfire. Moved to anchorV 0.94 (center world
          // Y 1.88 on a 2.0-tall face) so the grate sits flush under
          // the ceiling, inside the top 0.80-unit mantle band. Scale
          // dropped to 0.10 so the sprite half-height (0.10 world
          // units) keeps the whole grate between world Y 1.78–1.98 —
          // tight to the ceiling, clear of the cavity, clear of any
          // clipping at the top edge. Will get a proper hUpper/hLower-
          // aware anchoring pass in the architecture roadmap.
          if (isHearth) {
            decor[by][bx][bFaces[bf]].push({
              spriteId: 'decor_grate',
              anchorU: 0.5,
              anchorV: 0.94,  // Squished onto the mantle ceiling
              scale: 0.10
            });
          }
        }
      }
    }

    // ── Terminal CRT screen decor on TERMINAL tile faces ──
    for (var ty = 0; ty < H; ty++) {
      for (var tx = 0; tx < W; tx++) {
        if (grid[ty][tx] !== T.TERMINAL) continue;
        // Find walkable neighbor → that's the face the player approaches from
        var tFaces = [];
        if (ty > 0 && T.isWalkable(grid[ty - 1][tx])) tFaces.push('n');
        if (ty < H - 1 && T.isWalkable(grid[ty + 1][tx])) tFaces.push('s');
        if (tx > 0 && T.isWalkable(grid[ty][tx - 1])) tFaces.push('w');
        if (tx < W - 1 && T.isWalkable(grid[ty][tx + 1])) tFaces.push('e');
        if (tFaces.length === 0) continue;

        if (!decor[ty][tx]) decor[ty][tx] = { n: [], s: [], e: [], w: [] };
        for (var tf = 0; tf < tFaces.length; tf++) {
          decor[ty][tx][tFaces[tf]].push({
            spriteId: 'decor_terminal',
            anchorU: 0.5,
            anchorV: 0.75,  // Upper portion (screen above desk)
            scale: 0.35,
            cavityGlow: true,  // CRT screen emits sickly green glow
            glowR: 30, glowG: 90, glowB: 35, glowA: 0.25
          });
        }
      }
    }

    // ── Torch tile cavity decor (TORCH_LIT warm glow, TORCH_UNLIT dim bracket) ──
    for (var tcy = 0; tcy < H; tcy++) {
      for (var tcx = 0; tcx < W; tcx++) {
        var tct = grid[tcy][tcx];
        if (!T.isTorch(tct)) continue;

        // Find walkable neighbor faces → those are the faces the player sees
        var tcFaces = [];
        if (tcy > 0 && T.isWalkable(grid[tcy - 1][tcx])) tcFaces.push('n');
        if (tcy < H - 1 && T.isWalkable(grid[tcy + 1][tcx])) tcFaces.push('s');
        if (tcx > 0 && T.isWalkable(grid[tcy][tcx - 1])) tcFaces.push('w');
        if (tcx < W - 1 && T.isWalkable(grid[tcy][tcx + 1])) tcFaces.push('e');
        if (tcFaces.length === 0) continue;

        if (!decor[tcy][tcx]) decor[tcy][tcx] = { n: [], s: [], e: [], w: [] };
        var isLit = tct === T.TORCH_LIT;
        for (var tcf = 0; tcf < tcFaces.length; tcf++) {
          if (isLit) {
            // Lit torch: fire decor with warm cavity glow
            decor[tcy][tcx][tcFaces[tcf]].push({
              spriteId: 'decor_torch',
              anchorU: 0.5,
              anchorV: 0.6,
              scale: 0.25,
              cavityGlow: true,
              glowR: 255, glowG: 140, glowB: 40, glowA: 0.3
            });
          } else {
            // Unlit torch: charred bracket, no glow
            decor[tcy][tcx][tcFaces[tcf]].push({
              spriteId: 'decor_torch',
              anchorU: 0.5,
              anchorV: 0.6,
              scale: 0.2
            });
          }
        }
      }
    }

    // ── Dump truck wheel decor on DUMP_TRUCK faces ─────────────────
    // Two wheels per side face. DUMP_TRUCK is a 2.0-unit-tall freeform
    // tile (HEARTH stature) with three bands:
    //   • Lower body  — world Y 0.00–0.10  (0.10 units, bumper strip)
    //   • Spool cavity — world Y 0.10–0.50  (0.40 units, transparent)
    //   • Upper chassis — world Y 0.50–2.00 (1.50 units)
    //
    // The cavity sits "practically on the ground" so the wheels MUST
    // overlap into the cavity band — real trucks have wheel wells
    // cut into the body, and with only 0.10 world units of solid
    // bumper below the cavity there's nowhere else for a readable-
    // sized wheel to go. This overlap is intentional, not a bug.
    //
    // Paint order (wall texture → cavity tint → wallDecor → sprites)
    // lets the wheels draw ON TOP of the transparent cavity tint on
    // the side face, producing a clean "wheel arch cut into body"
    // silhouette. The 🧵 billboard from DumpTruckSprites still renders
    // INSIDE the cavity via the z-bypass sprite path regardless.
    //
    // anchorV is wall-face proportional: 0=bottom, 1=top. On a 2.0-tall
    // wall, anchorV 0.09 puts the sprite CENTER at world Y 0.18.
    // Square-texture vExtent = scale = 0.15 face units = 0.30 world
    // units tall, so the sprite spans world Y 0.03 → 0.33 — straddling
    // the cavity floor (0.10) for the wheel-well read.
    //
    // Horizontal: two wheels per face at U 0.22 / 0.78 (bottom-left
    // and bottom-right of the face) so they parallax with viewing
    // angle just like any other wallDecor sprite.
    //
    // 4-of-6 panes: emitted on the N/S/E/W side faces wherever the
    // neighbor tile is walkable. Top (ceiling) and bottom (floor)
    // faces of the tile cube are never wall-decor targets, so this
    // naturally maps to "4 of the 6 floor-adjacent/perpendicular
    // panes" the design calls for.
    //
    // IMPORTANT: DumpTruckSpawner mutates the grid AFTER this function
    // runs (the truck node circuit relocates the tiles daily). The
    // wallDecor cache built here would be stale at the new spawn
    // location. See FloorManager.rebuildDumpTruckDecor() below —
    // it is the live-update mirror of this block, called by the
    // spawner whenever it stamps or clears a truck tile.
    for (var dty = 0; dty < H; dty++) {
      for (var dtx = 0; dtx < W; dtx++) {
        if (grid[dty][dtx] !== T.DUMP_TRUCK) continue;

        var dtFaces = [];
        if (dty > 0 && T.isWalkable(grid[dty - 1][dtx])) dtFaces.push('n');
        if (dty < H - 1 && T.isWalkable(grid[dty + 1][dtx])) dtFaces.push('s');
        if (dtx > 0 && T.isWalkable(grid[dty][dtx - 1])) dtFaces.push('w');
        if (dtx < W - 1 && T.isWalkable(grid[dty][dtx + 1])) dtFaces.push('e');
        if (dtFaces.length === 0) continue;

        if (!decor[dty][dtx]) decor[dty][dtx] = { n: [], s: [], e: [], w: [] };
        for (var dtf = 0; dtf < dtFaces.length; dtf++) {
          var f = dtFaces[dtf];
          // Left wheel — bottom-left of wall face
          decor[dty][dtx][f].push({
            spriteId: 'decor_truck_wheel',
            anchorU: 0.22,
            anchorV: 0.09,   // Low on 2.0-tall face → center world Y 0.18
            scale: 0.15      // vExtent 0.30 world units → spans 0.03–0.33
          });
          // Right wheel — bottom-right of wall face
          decor[dty][dtx][f].push({
            spriteId: 'decor_truck_wheel',
            anchorU: 0.78,
            anchorV: 0.09,
            scale: 0.15
          });
        }
      }
    }

    // ── Infrastructure tile decor (placed on tile faces) ──────────
    var infraTiles = [T.WELL, T.NOTICE_BOARD, T.SOUP_KITCHEN, T.ANVIL,
                      T.CHARGING_CRADLE, T.SWITCHBOARD];
    for (var iy = 0; iy < H; iy++) {
      for (var ix = 0; ix < W; ix++) {
        var it = grid[iy][ix];
        if (infraTiles.indexOf(it) < 0) continue;

        // Find walkable neighbor faces
        var iFaces = [];
        if (iy > 0 && T.isWalkable(grid[iy - 1][ix])) iFaces.push('n');
        if (iy < H - 1 && T.isWalkable(grid[iy + 1][ix])) iFaces.push('s');
        if (ix > 0 && T.isWalkable(grid[iy][ix - 1])) iFaces.push('w');
        if (ix < W - 1 && T.isWalkable(grid[iy][ix + 1])) iFaces.push('e');
        if (iFaces.length === 0) continue;

        if (!decor[iy][ix]) decor[iy][ix] = { n: [], s: [], e: [], w: [] };
        for (var iif = 0; iif < iFaces.length; iif++) {
          var iface = iFaces[iif];
          if (it === T.WELL) {
            decor[iy][ix][iface].push({
              spriteId: 'decor_rope_bucket', anchorU: 0.35, anchorV: 0.7, scale: 0.3
            });
          } else if (it === T.NOTICE_BOARD) {
            decor[iy][ix][iface].push({
              spriteId: 'decor_pinned_note', anchorU: 0.65, anchorV: 0.7, scale: 0.22
            });
          } else if (it === T.SOUP_KITCHEN) {
            decor[iy][ix][iface].push({
              spriteId: 'decor_ladle', anchorU: 0.65, anchorV: 0.75, scale: 0.22
            });
          } else if (it === T.ANVIL) {
            decor[iy][ix][iface].push({
              spriteId: 'decor_spark', anchorU: 0.5, anchorV: 0.85, scale: 0.2,
              cavityGlow: true, glowR: 255, glowG: 180, glowB: 40, glowA: 0.2
            });
          } else if (it === T.CHARGING_CRADLE) {
            decor[iy][ix][iface].push({
              spriteId: 'decor_conduit_glow', anchorU: 0.5, anchorV: 0.6, scale: 0.25,
              cavityGlow: true, glowR: 80, glowG: 160, glowB: 220, glowA: 0.25
            });
          } else if (it === T.SWITCHBOARD) {
            // Red and green indicator lights on alternating faces
            var lightSeed = ((ix * 374761 + iy * 668265) & 0x7fffffff) / 0x7fffffff;
            var lightSprite = lightSeed > 0.5 ? 'decor_toggle_light_green' : 'decor_toggle_light_red';
            decor[iy][ix][iface].push({
              spriteId: lightSprite, anchorU: 0.5, anchorV: 0.8, scale: 0.15,
              cavityGlow: true,
              glowR: lightSeed > 0.5 ? 50 : 180,
              glowG: lightSeed > 0.5 ? 160 : 40,
              glowB: lightSeed > 0.5 ? 60 : 25,
              glowA: 0.2
            });
          }
        }
      }
    }

    // ── Hazard-adjacent wall decor ──────────────────────────────────
    // Walls next to hazard floor tiles get environmental staining.
    var hazardDecorMap = {};
    hazardDecorMap[T.FIRE]   = { spriteId: 'decor_scorch', anchorU: 0.5, anchorV: 0.4, scale: 0.35 };
    hazardDecorMap[T.POISON] = { spriteId: 'decor_acid_drip', anchorU: 0.5, anchorV: 0.8, scale: 0.25 };
    hazardDecorMap[T.TRAP]   = { spriteId: 'decor_warning_scratch', anchorU: 0.5, anchorV: 0.55, scale: 0.28 };
    hazardDecorMap[T.SPIKES] = { spriteId: 'decor_warning_scratch', anchorU: 0.5, anchorV: 0.55, scale: 0.28 };

    for (var hy = 1; hy < H - 1; hy++) {
      for (var hx = 1; hx < W - 1; hx++) {
        if (grid[hy][hx] !== T.WALL) continue;

        // Check each neighbor for hazard floor tiles
        var hazardNeighbors = [
          { dy: -1, dx: 0, face: 'n' }, { dy: 1, dx: 0, face: 's' },
          { dy: 0, dx: -1, face: 'w' }, { dy: 0, dx: 1, face: 'e' }
        ];
        for (var hi = 0; hi < hazardNeighbors.length; hi++) {
          var hn = hazardNeighbors[hi];
          var ny = hy + hn.dy, nx = hx + hn.dx;
          if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
          var neighborTile = grid[ny][nx];
          var hazDecor = hazardDecorMap[neighborTile];
          if (!hazDecor) continue;

          // Sparse: ~40% of eligible walls (hazard adjacency is already rare)
          var hHash = ((hx * 374761 + hy * 668265 + hi * 12345) & 0x7fffffff) / 0x7fffffff;
          if (hHash > 0.40) continue;

          if (!decor[hy][hx]) decor[hy][hx] = { n: [], s: [], e: [], w: [] };
          // Place decor on the face toward the hazard
          decor[hy][hx][hn.face].push({
            spriteId: hazDecor.spriteId,
            anchorU: hazDecor.anchorU + (hHash - 0.2) * 0.3, // slight U jitter
            anchorV: hazDecor.anchorV,
            scale: hazDecor.scale
          });
        }
      }
    }

    // ── Biome variety wall decor ────────────────────────────────────
    // Additional sparse decor on plain WALL tiles based on biome type.
    // Layered on top of the existing torch/banner pass — walls that
    // already have torch decor are skipped.
    var biomeDecor = null;
    if (biome === 'exterior' || biome === 'promenade' || biome === 'lantern') {
      biomeDecor = { spriteId: 'decor_wanted_poster', chance: 0.04, anchorV: 0.6, scale: 0.25 };
    } else if (biome === 'cellar' || biome === 'cellar_entry' || biome === 'catacomb') {
      biomeDecor = { spriteId: 'decor_cobweb', chance: 0.06, anchorV: 0.9, scale: 0.22 };
    } else if (biome === 'foundry') {
      biomeDecor = { spriteId: 'decor_chain', chance: 0.05, anchorV: 0.65, scale: 0.2 };
    } else if (biome === 'sealab') {
      biomeDecor = { spriteId: 'decor_crack', chance: 0.04, anchorV: 0.5, scale: 0.2 };
    }
    // Generic dungeon floors get cracks and cobwebs mixed
    if (!biomeDecor && isDungeonDecor) {
      biomeDecor = { spriteId: 'decor_crack', chance: 0.05, anchorV: 0.5, scale: 0.2 };
    }

    if (biomeDecor) {
      for (var vy = 1; vy < H - 1; vy++) {
        for (var vx = 1; vx < W - 1; vx++) {
          if (grid[vy][vx] !== T.WALL) continue;
          // Skip walls that already have decor (torch, banner, hazard stain)
          if (decor[vy][vx]) continue;

          // Find faces bordering walkable tiles
          var vFaces = [];
          if (T.isWalkable(grid[vy - 1][vx])) vFaces.push('n');
          if (vy < H - 1 && T.isWalkable(grid[vy + 1][vx])) vFaces.push('s');
          if (T.isWalkable(grid[vy][vx - 1])) vFaces.push('w');
          if (vx < W - 1 && T.isWalkable(grid[vy][vx + 1])) vFaces.push('e');
          if (vFaces.length === 0) continue;

          // Deterministic sparse placement
          var vHash = ((vx * 998677 + vy * 441113) & 0x7fffffff) / 0x7fffffff;
          if (vHash > biomeDecor.chance) continue;

          var vFace = vFaces[Math.floor(vHash / biomeDecor.chance * vFaces.length) % vFaces.length];

          decor[vy][vx] = { n: [], s: [], e: [], w: [] };
          decor[vy][vx][vFace].push({
            spriteId: biomeDecor.spriteId,
            anchorU: 0.5 + (vHash - biomeDecor.chance / 2) * 2, // slight jitter
            anchorV: biomeDecor.anchorV,
            scale: biomeDecor.scale
          });

          // Cobweb gets a second sprite on the perpendicular corner (if available)
          if (biomeDecor.spriteId === 'decor_cobweb' && vFaces.length > 1) {
            var altFace = vFaces[(vFaces.indexOf(vFace) + 1) % vFaces.length];
            decor[vy][vx][altFace].push({
              spriteId: 'decor_cobweb',
              anchorU: 0.1, // corner placement
              anchorV: 0.92,
              scale: 0.18
            });
          }
        }
      }
    }

    return decor;
  }

  // ── Dynamic light source registration ──────────────────────────
  // Scans the floor grid for light-emitting tiles and registers them
  // with Lighting so the lightmap reflects placed bonfires, hearths,
  // fire hazards, terminals, torch tiles, and building entrances.
  //
  // Also auto-places electric ceiling lights for interior floors (N.N)
  // to provide ambient coverage beyond the player torch.

  function _registerLightSources(grid, gridW, gridH, contract) {
    if (typeof Lighting === 'undefined' || !Lighting.addLightSource) return;
    Lighting.clearLightSources();

    var isExterior = contract && contract.depth === 'exterior';
    var isInterior = contract && contract.depth === 'interior';
    var isDungeon  = contract && contract.depth === 'nested_dungeon';
    var electricSpacing = 4; // Tiles between auto-placed electric lights

    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var t = grid[y][x];

        // ── Tile-based emitters ──
        if (t === TILES.BONFIRE) {
          // Exterior campfire — large warm glow, steady welcoming pulse
          Lighting.addLightSource(x, y, 5, 0.9, { tint: 'warm', flicker: 'bonfire' });
        } else if (t === TILES.HEARTH) {
          if (isDungeon) {
            // Dungeon hearth — cool blue-grey base, nervous sputtering flicker.
            // Fire barely wins against the cold stone; reads as unsafe/partial rest.
            Lighting.addLightSource(x, y, 3, 0.65, { tint: 'dungeon_hearth', flicker: 'hearth-dungeon' });
          } else {
            // Interior hearth — warm glow, standard torch flicker
            Lighting.addLightSource(x, y, 3, 0.7, { tint: 'warm', flicker: 'torch' });
          }
        } else if (t === TILES.FIRE) {
          // Environmental fire hazard — hot glow, fast flicker
          Lighting.addLightSource(x, y, 3, 0.6, { tint: 'warm', flicker: 'torch' });
        } else if (t === TILES.TERMINAL) {
          // Data terminal — sickly green CRT glow
          Lighting.addLightSource(x, y, 2, 0.45, { tint: 'sickly', flicker: 'steady' });
        } else if (t === TILES.TORCH_LIT) {
          // Wall-mounted torch — warm glow, standard torch flicker
          Lighting.addLightSource(x, y, 4, 0.8, { tint: 'warm', flicker: 'torch' });
        } else if (t === TILES.BED && isInterior) {
          // Home bed — golden steady glow, safest rest point in the game.
          // Radius 5 to fill the bedroom with warm amber light.
          Lighting.addLightSource(x, y, 5, 0.85, { tint: 'home_hearth', flicker: 'steady' });
        }

        // ── Auto-placed electric ceiling lights for interiors ──
        // Every electricSpacing tiles in walkable space, drop a neutral
        // steady light. Creates ambient coverage so interiors feel lit
        // by invisible overhead fixtures (Doom sector lighting model).
        if (isInterior && TILES.isWalkable(t) &&
            x % electricSpacing === 2 && y % electricSpacing === 2) {
          Lighting.addLightSource(x, y, 4, 0.65, { tint: 'none', flicker: 'steady' });
        }

        // ── Building entrance glow (exterior DOORs) ──
        // On exterior (depth-1) floors, DOOR tiles glow steadily to make
        // building entrances visually inviting on dark streets.
        if (isExterior && TILES.isDoor(t) && t !== TILES.BOSS_DOOR) {
          Lighting.addLightSource(x, y, 3, 0.6, { tint: 'warm', flicker: 'steady' });
        }
      }
    }
  }

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
    } else if (_registeredBuilders[_floorId]) {
      // External blockout file registered a builder for this floor
      _floorData = _registeredBuilders[_floorId]();
      if (!_floorData || !_floorData.grid) {
        console.warn('[FloorManager] Registered builder for ' + _floorId + ' returned invalid data; falling back');
        _floorData = null;
      } else {
        _floorData.contract = contract;
        // Depth 1-2 floors are safe zones (no enemies); depth 3+ spawns enemies
        _enemies = _depth(_floorId) >= 3 ? EnemyAI.spawnEnemies(_floorData, _floorId, null) : [];
        // Assign biome-appropriate bark pools to dungeon enemies
        if (_enemies.length > 0 && EnemyAI.assignBarkPools) {
          EnemyAI.assignBarkPools(_enemies, _floorId);
        }
        _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
      }
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
    } else {
      // Depth-2 (interior) floors use trapdoor hatches for descent into dungeons;
      // Depth-3 (nested dungeon) floors use trapdoor hatches for ascent back up.
      var _genDepth = _depth(_floorId);
      var _genOpts = {
        width: contract.gridSize.w,
        height: contract.gridSize.h,
        biome: getBiome(_floorId),
        floor: _floorId,
        floorId: _floorId,
        placeStairsUp: true,
        placeStairsDn: true,
        roomCount: SeededRNG.randInt(contract.roomCount.min, contract.roomCount.max)
      };
      if (_genDepth === 2) {
        _genOpts.stairDnTile = TILES.TRAPDOOR_DN;
      }
      if (_genDepth === 3) {
        _genOpts.stairUpTile = TILES.TRAPDOOR_UP;
      }
      _floorData = GridGen.generate(_genOpts);

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
      if (_enemies.length > 0 && EnemyAI.assignBarkPools) {
        EnemyAI.assignBarkPools(_enemies, _floorId);
      }
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    }

    // ── Post-gen bookshelf injection ──────────────────────────────
    // Depth 2 (interiors) and depth 3+ (dungeons) that weren't
    // hand-authored get 1-2 bookshelves placed against walls in the
    // first room. Dungeon shelves serve the universal adventurer's /
    // cleaner's guides via biome fallback from the catalog.
    if (!fromCache && _depth(_floorId) >= 2 && !_floorData.books) {
      _placeBookshelvesInInterior(_floorData, _floorId);
    }

    // ── Register torch tiles + apply hero damage patterns ──────────
    // Must happen BEFORE wallDecor and lightSources so the final
    // TORCH_LIT/TORCH_UNLIT grid state drives decor + lighting.
    if (!fromCache && typeof TorchState !== 'undefined') {
      var _torchBiome = _floorData.biome || getBiome(_floorId);
      TorchState.registerFloor(
        _floorId, _floorData.grid,
        _floorData.gridW, _floorData.gridH, _torchBiome
      );

      // Hero damage on dungeon floors (depth ≥ 3): flip some torches to UNLIT
      if (_depth(_floorId) >= 3) {
        var _corpsePos = {};
        var _stairPos  = {};
        for (var _ty = 0; _ty < _floorData.gridH; _ty++) {
          for (var _tx = 0; _tx < _floorData.gridW; _tx++) {
            var _tt = _floorData.grid[_ty][_tx];
            if (_tt === TILES.CORPSE) _corpsePos[_tx + ',' + _ty] = true;
            if (_tt === TILES.STAIRS_DN || _tt === TILES.STAIRS_UP || _tt === TILES.TRAPDOOR_DN || _tt === TILES.TRAPDOOR_UP) _stairPos[_tx + ',' + _ty] = true;
          }
        }
        TorchState.applyHeroDamage(_floorId, _floorData.grid, {
          corpsePositions: _corpsePos,
          stairPositions:  _stairPos
        });
      }
    }

    // ── Auto-generate wall decor for floors that don't have it ──
    // Proc-gen floors (GridGen.generate) include wallDecor. Hand-authored
    // floors may not. This step ensures every floor gets wall decor.
    if (!fromCache && !_floorData.wallDecor) {
      _floorData.wallDecor = _buildWallDecorFromGrid(
        _floorData.grid, _floorData.rooms || [],
        _floorData.gridW, _floorData.gridH,
        _floorData.biome || getBiome(_floorId),
        _floorData.contract || contract
      );
    }

    // Compute per-cell door height overrides (building entrance vs archway rule).
    // Stored on floorData and passed to raycaster alongside the frozen contract.
    _floorData.cellHeights = SpatialContract.computeDoorHeights(
      _floorData.grid, _floorData.gridW, _floorData.gridH,
      contract.tileWallHeights, contract.wallHeight,
      _floorData.doorTargets, _floorId
    );

    // ── Populate DoorSprites with per-building door/arch textures ──
    // For each door tile in doorTargets, resolve the target building
    // via BuildingRegistry and stash its doorTexture / archTexture so
    // the raycaster renders building-appropriate materials.
    if (typeof DoorSprites !== 'undefined') {
      DoorSprites.clear();
      DoorSprites.setFloor(_floorId);
      var _doorGrid = _floorData.grid;
      var _doorTargets = _floorData.doorTargets || {};
      var _DOOR = (typeof TILES !== 'undefined') ? TILES.DOOR : 2;
      var _DOOR_BACK = (typeof TILES !== 'undefined') ? TILES.DOOR_BACK : 3;
      var _DOOR_EXIT = (typeof TILES !== 'undefined') ? TILES.DOOR_EXIT : 4;
      var _ARCH = (typeof TILES !== 'undefined') ? TILES.ARCH_DOORWAY : 71;
      var _DOOR_FACADE = (typeof TILES !== 'undefined') ? TILES.DOOR_FACADE : 74;
      // Build a reverse map: floorId → building record
      var _floorToBuilding = {};
      if (typeof BuildingRegistry !== 'undefined') {
        var _bldgs = BuildingRegistry.listByFloor(_floorId);
        for (var _bi = 0; _bi < _bldgs.length; _bi++) {
          _floorToBuilding[_bldgs[_bi].floorId] = _bldgs[_bi];
        }
      }
      for (var _dtKey in _doorTargets) {
        var _dtParts = _dtKey.split(',');
        var _dtX = parseInt(_dtParts[0], 10);
        var _dtY = parseInt(_dtParts[1], 10);
        var _dtTile = (_doorGrid[_dtY] && _doorGrid[_dtY][_dtX]) || 0;
        var _dtTargetFloor = _doorTargets[_dtKey];
        var _dtBldg = _floorToBuilding[_dtTargetFloor] || null;
        if (!_dtBldg) continue;
        if (_dtTile === _ARCH && _dtBldg.archTexture) {
          DoorSprites.setTexture(_dtX, _dtY, _dtBldg.archTexture);
        } else if (_dtTile === _DOOR_FACADE && _dtBldg.wallTexture) {
          // DOOR_FACADE lintel band uses the building's wall texture
          // (not doorTexture — the lintel IS the wall above the door)
          DoorSprites.setTexture(_dtX, _dtY, _dtBldg.wallTexture);
          // Exterior face: the face facing the street (away from interior).
          // Promenade south-pod buildings face NORTH; north-pod face SOUTH.
          // Use explicit doorFaces if available, else auto-detect.
          var _dfKey = _dtX + ',' + _dtY;
          if (_floorData.doorFaces && typeof _floorData.doorFaces[_dfKey] === 'number') {
            DoorSprites.setExteriorFace(_dtX, _dtY, _floorData.doorFaces[_dfKey]);
          } else {
            // Auto-detect: the exterior face is the one whose neighbor
            // is walkable (not opaque). Check all 4 cardinal neighbors.
            var _dNbrs = [
              { dx: 1, dy: 0, face: 0 },  // EAST
              { dx: 0, dy: 1, face: 1 },  // SOUTH
              { dx:-1, dy: 0, face: 2 },  // WEST
              { dx: 0, dy:-1, face: 3 }   // NORTH
            ];
            for (var _dni = 0; _dni < 4; _dni++) {
              var _dnx = _dtX + _dNbrs[_dni].dx;
              var _dny = _dtY + _dNbrs[_dni].dy;
              if (_doorGrid[_dny] && _doorGrid[_dny][_dnx] !== undefined) {
                var _dnTile = _doorGrid[_dny][_dnx];
                if (!TILES.isOpaque(_dnTile) && !TILES.isDoor(_dnTile)) {
                  DoorSprites.setExteriorFace(_dtX, _dtY, _dNbrs[_dni].face);
                  break;
                }
              }
            }
          }
        } else if ((_dtTile === _DOOR || _dtTile === _DOOR_BACK || _dtTile === _DOOR_EXIT) && _dtBldg.doorTexture) {
          DoorSprites.setTexture(_dtX, _dtY, _dtBldg.doorTexture);
        }
      }
      // Lazy-register the facade_door gap filler (safe to call repeatedly)
      if (typeof DoorSprites.ensureFillerRegistered === 'function') {
        DoorSprites.ensureFillerRegistered();
      }
    }

    // Apply biome colors + contract to raycaster
    Raycaster.setBiomeColors(getBiomeColors(_floorId));
    Raycaster.setContract(contract, _floorData.rooms, _floorData.cellHeights, _floorData.wallDecor || null);

    // Register dynamic light sources from fire-emitting tiles + electric ceiling lights
    _registerLightSources(_floorData.grid, _floorData.gridW, _floorData.gridH, contract);

    // Set weather preset from schedule (day-of-week × region) or contract fallback
    if (typeof WeatherSystem !== 'undefined') {
      var _weatherPreset = WeatherSystem.getScheduledPreset
        ? WeatherSystem.getScheduledPreset(_floorId)
        : (contract.weather || 'clear');
      WeatherSystem.setPreset(_weatherPreset, contract);
    }

    // Set post-process profile by floor depth
    if (typeof PostProcess !== 'undefined') {
      var ppDepth = _floorId.split('.').length;
      if (ppDepth >= 3) {
        PostProcess.setProfile('dungeon');
        PostProcess.setColorGrade({ r: 20, g: 40, b: 60, a: 0.04 });
      } else if (ppDepth === 1) {
        PostProcess.setProfile('exterior');
        PostProcess.setColorGrade({ r: 255, g: 220, b: 160, a: 0.03 });
      } else {
        PostProcess.setProfile('default');
        PostProcess.setColorGrade(null);
      }
    }

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
      if (_enemies.length > 0 && EnemyAI.assignBarkPools) {
        EnemyAI.assignBarkPools(_enemies, _floorId);
      }
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

  /**
   * Invalidate the cached state for a specific floor ID.
   * Forces full re-generation next time that floor is visited.
   * Used when game state changes (e.g., gate unlock removes an NPC).
   *
   * @param {string} floorId
   */
  function invalidateCache(floorId) {
    if (_floorCache[floorId]) {
      delete _floorCache[floorId];
    }
  }

  function removeEnemy(enemy) {
    var idx = _enemies.indexOf(enemy);
    if (idx >= 0) _enemies.splice(idx, 1);
    // Update cache with removed enemy
    _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
  }

  // ── Torch decor sync (live wall-decor update on extinguish/relight) ─

  /**
   * Look up floorData for a given floorId — current floor or cache.
   * Private helper for mutations that need to work on any loaded floor.
   */
  function _resolveFloorData(floorId) {
    if (!floorId) return null;
    if (_floorId === floorId && _floorData) return _floorData;
    var entry = _floorCache[String(floorId)];
    return entry ? entry.floorData : null;
  }

  /**
   * Swap a torch's wall-decor entry between lit (cavity glow) and unlit
   * (charred bracket). Single source of truth for both the water-bottle
   * extinguish path (TorchPeek) and the pressure-wash extinguish path
   * (TorchHitResolver). Operates on the current floor OR any cached floor
   * so cross-floor updates (e.g. future scripted events) stay coherent.
   *
   * Mirror of the initial decor emission in _buildWallDecorFromGrid so the
   * visual state exactly matches a fresh-from-generation torch. Any change
   * to the generator's decor_torch emission must be mirrored here — the
   * pair is the contract.
   *
   * @param {string} floorId
   * @param {number} x
   * @param {number} y
   * @param {boolean} isLit
   * @returns {boolean} true if a decor entry was updated, false if no decor
   *                    existed at that tile (e.g. isolated torch with no
   *                    walkable neighbor — decor is only built on faces
   *                    facing walkable tiles).
   */
  function syncTorchDecor(floorId, x, y, isLit) {
    var fd = _resolveFloorData(floorId);
    if (!fd || !fd.wallDecor) return false;
    var decor = fd.wallDecor;
    if (!decor[y] || !decor[y][x]) return false;

    var cell = decor[y][x];
    var faces = ['n', 's', 'e', 'w'];
    var touched = false;
    for (var f = 0; f < faces.length; f++) {
      var arr = cell[faces[f]];
      if (!arr) continue;
      for (var d = 0; d < arr.length; d++) {
        if (arr[d].spriteId !== 'decor_torch') continue;
        if (isLit) {
          arr[d].scale = 0.25;
          arr[d].cavityGlow = true;
          arr[d].glowR = 255; arr[d].glowG = 140; arr[d].glowB = 40; arr[d].glowA = 0.3;
        } else {
          arr[d].scale = 0.2;
          arr[d].cavityGlow = false;
          delete arr[d].glowR;
          delete arr[d].glowG;
          delete arr[d].glowB;
          delete arr[d].glowA;
        }
        touched = true;
      }
    }
    return touched;
  }

  /**
   * Stamp or clear DUMP_TRUCK wheel decor on a specific tile of a
   * (potentially cached) floor. This exists because DumpTruckSpawner
   * mutates the grid AFTER the wallDecor cache was built at floor
   * generation — without this helper, the wheels disappear the moment
   * the truck is relocated on its scheduled node circuit.
   *
   * This is the live-update mirror of the DUMP_TRUCK decor emission in
   * _buildWallDecorFromGrid — the pair is the contract. Any change to
   * the generator's dimensions / anchors must be mirrored in BOTH
   * places or the daily-relocated truck will render differently from
   * a newly-generated one.
   *
   * mode = 'stamp'  — add wheel decor on the 4 side faces that face a
   *                   walkable neighbor (2 wheels per face). Idempotent:
   *                   strips any prior decor_truck_wheel entries first
   *                   so re-stamping doesn't double up.
   * mode = 'clear'  — remove all decor_truck_wheel entries on this tile
   *                   (leaves other decor like torches untouched).
   *
   * The grid is read to decide which faces get wheels, so callers
   * should stamp AFTER writing the DUMP_TRUCK tile and clear BEFORE
   * overwriting it back to road/path.
   *
   * @param {string} floorId  — floor to update (current or cached)
   * @param {number} x        — grid X
   * @param {number} y        — grid Y
   * @param {string} mode     — 'stamp' | 'clear'
   * @returns {boolean} true if decor was changed
   */
  function rebuildDumpTruckDecor(floorId, x, y, mode) {
    var fd = _resolveFloorData(floorId);
    if (!fd || !fd.wallDecor || !fd.grid) return false;
    var decor = fd.wallDecor;
    var grid  = fd.grid;
    var H     = grid.length;
    var W     = grid[0] ? grid[0].length : 0;
    if (y < 0 || y >= H || x < 0 || x >= W) return false;

    // Strip any existing wheel decor on this tile first (both modes).
    var cell = decor[y] && decor[y][x];
    if (cell) {
      var faces = ['n', 's', 'e', 'w'];
      for (var f = 0; f < faces.length; f++) {
        var arr = cell[faces[f]];
        if (!arr || arr.length === 0) continue;
        var kept = [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].spriteId !== 'decor_truck_wheel') kept.push(arr[i]);
        }
        cell[faces[f]] = kept;
      }
    }

    if (mode === 'clear') return true;

    // Stamp: compute walkable neighbor faces and push two wheels each.
    var T = TILES;
    if (grid[y][x] !== T.DUMP_TRUCK) return false;

    var dtFaces = [];
    if (y > 0     && T.isWalkable(grid[y - 1][x])) dtFaces.push('n');
    if (y < H - 1 && T.isWalkable(grid[y + 1][x])) dtFaces.push('s');
    if (x > 0     && T.isWalkable(grid[y][x - 1])) dtFaces.push('w');
    if (x < W - 1 && T.isWalkable(grid[y][x + 1])) dtFaces.push('e');
    if (dtFaces.length === 0) return true;

    if (!decor[y]) decor[y] = [];
    if (!decor[y][x]) decor[y][x] = { n: [], s: [], e: [], w: [] };
    var target = decor[y][x];
    for (var df = 0; df < dtFaces.length; df++) {
      var fc = dtFaces[df];
      if (!target[fc]) target[fc] = [];
      // Left wheel — bottom-left of wall face
      target[fc].push({
        spriteId: 'decor_truck_wheel',
        anchorU: 0.22,
        anchorV: 0.09,
        scale:   0.15
      });
      // Right wheel — bottom-right of wall face
      target[fc].push({
        spriteId: 'decor_truck_wheel',
        anchorU: 0.78,
        anchorV: 0.09,
        scale:   0.15
      });
    }
    return true;
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

    // External floor registration (for blockout files)
    registerFloorBuilder: registerFloorBuilder,

    // Lookups
    getBiome: getBiome,
    isDungeonFloor: isDungeonFloor,
    getBiomeColors: getBiomeColors,
    getFloorContract: getFloorContract,
    getFloorLabel: getFloorLabel,

    // Floor 0
    getFloor0Spawn: function () { return { x: _FLOOR0_SPAWN.x, y: _FLOOR0_SPAWN.y, dir: _FLOOR0_SPAWN.dir }; },

    // Cache
    clearCache: clearCache,
    invalidateCache: invalidateCache,

    // Torch decor sync (live wall-decor updates on extinguish/relight)
    syncTorchDecor: syncTorchDecor,

    // Dump-truck wheel decor rebuild (called by DumpTruckSpawner when
    // it relocates the truck on its scheduled node circuit — the floor-
    // gen wallDecor cache would otherwise leave the wheels stranded at
    // the previous spawn site).
    rebuildDumpTruckDecor: rebuildDumpTruckDecor,

    /**
     * Get cached floorData for a previously-visited floor (read-only).
     * Returns the floorData object or null if the floor hasn't been generated.
     * Used by quest waypoint system to look up doorTargets on other floors.
     */
    getFloorCache: function (floorId) {
      var entry = _floorCache[String(floorId)];
      return entry ? entry.floorData : null;
    }
  };
})();

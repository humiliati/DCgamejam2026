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
      if (floor === '3.1') return 'armory';      // Armory (future)
      return 'bazaar';  // fallback for unknown interiors
    }

    // Depth 3+: dungeon biomes — based on parent interior
    var parent = _parentId(floor);
    if (parent === '1.1') return 'cellar';       // Coral Cellars
    if (parent === '1.3') return 'cellar';       // Soft Cellar (tutorial dungeon)
    if (parent === '2.2') return 'catacomb';     // Hero's Wake (catacombs)
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
            18: 'bonfire_ring',    // BONFIRE — stone ring (0.3× short column)
            21: 'tree_trunk',      // TREE — perimeter trees (brown trunk + green canopy)
            22: 'shrub',           // SHRUB — wayfinding hedgerows (half-height, see-over)
            35: 'fence_wood',      // FENCE — wooden rail
            37: 'shrub',           // MAILBOX — shrub base matching grass floor (emoji billboard above via MailboxSprites)
            38: 'truck_body'       // DUMP_TRUCK — blue pressure wash truck body
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
            38: 0.5                // DUMP_TRUCK — short truck body, hose billboard above (bonfire pattern)
          }),
          tileHeightOffsets: Object.freeze({
            5:  -0.12,   // STAIRS_DN — sunken (base default)
            6:   0.06,   // STAIRS_UP — slight rise (base default)
            14:  0.15    // BOSS_DOOR — elevated (base default)
            // BONFIRE: no offset on exterior — ring sits at ground level (visible like mailbox)
            // DUMP_TRUCK: no offset — truck sits at ground level (same as bonfire)
          }),
          floorTexture: 'floor_brick_red',
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
            38: 'truck_body'       // DUMP_TRUCK — blue pressure wash truck body
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
            38: 0.5                // DUMP_TRUCK — short truck body, hose billboard above (bonfire pattern)
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
        // PILLAR (mailbox), BOOKSHELF (reading), DOOR_EXIT (to Promenade).
        return {
          textures: Object.freeze({
            1:  'wood_plank',       // WALL — warm plank walls
            2:  'door_wood',        // DOOR (unused in home)
            3:  'door_wood',        // DOOR_BACK (unused)
            4:  'door_wood_asc',    // DOOR_EXIT — out to The Promenade
            7:  'stash_chest',      // CHEST — stash container
            10: 'stone_rough',      // PILLAR — mailbox post
            25: 'bookshelf',        // BOOKSHELF — dark wood shelves
            27: 'bed_quilt',        // BED — quilted blanket
            28: 'table_wood',       // TABLE — work surface
            29: 'hearth_riverrock'  // HEARTH — riverrock fireplace
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — extends above ceiling for close-up immersion
            7:  0.7,               // CHEST — waist-height stash box
            10: 2.0,               // PILLAR — full wall height decorative column
            27: 0.6,               // BED — low, player sees over it
            28: 0.7,               // TABLE — half-height surface
            29: 2.5                 // HEARTH — full chimney stack (floor-to-ceiling riverrock, fire cavity via tileHeightOffset)
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
            29: 'hearth_riverrock'  // HEARTH — tavern fireplace
          }),
          tileWallHeights: Object.freeze({
            1:  2.5,               // WALL — extends above ceiling for close-up immersion
            7:  0.7,               // CHEST — waist-height storage
            10: 2.2,               // PILLAR — tall decorative beams
            26: 0.8,               // BAR_COUNTER — counter height
            27: 0.6,               // BED — low inn bed
            28: 0.7,               // TABLE — dining height
            29: 0.5                // HEARTH — short base stone (sandwich: mantle above fire cavity)
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
            38: 'truck_body'        // DUMP_TRUCK — blue pressure wash truck body
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
            38: 0.5                // DUMP_TRUCK — short truck body, hose billboard above (bonfire pattern)
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
            28: 0.7                // TABLE — desk height
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
            10: 'stone_cathedral',  // PILLAR — stone columns
            25: 'bookshelf',        // BOOKSHELF — records shelves
            28: 'table_wood'        // TABLE — planning table
          }),
          tileWallHeights: Object.freeze({
            10: 2.2,               // PILLAR — imposing columns
            28: 0.7                // TABLE — planning table height
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
            29: 'hearth_riverrock'   // HEARTH — dungeon rest point
          }),
          tileWallHeights: Object.freeze({ 7: 0.65, 11: 0.6, 29: 0.5 }),
          floorTexture: 'floor_dirt'
        };
      case 'foundry':
        // Dark metal walls ↔ warm dirt floor — industrial contrast
        return {
          textures: Object.freeze({
            1: 'metal_plate', 2: 'door_foundry', 3: 'door_foundry', 4: 'door_foundry',
            5: 'stairs_down', 6: 'stairs_up', 14: 'door_iron',
            29: 'hearth_riverrock'   // HEARTH — dungeon rest point
          }),
          tileWallHeights: Object.freeze({ 7: 0.65, 11: 0.6, 29: 0.5 }),
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
            29: 'hearth_riverrock' // HEARTH — dungeon rest point
          }),
          tileWallHeights: Object.freeze({ 7: 0.65, 11: 0.6, 29: 0.5 }),
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
          parallax: [
            { depth: 0.95, color: '#b06040', height: 0.10 },
            { depth: 0.85, color: '#4a2030', height: 0.12 }
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
      if (floor === '1.6') {
        return SpatialContract.interior(Object.assign({
          label: "Gleaner's Home",
          wallHeight: 2.0,
          renderDistance: 14,
          fogDistance: 12,
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
            5: -0.12,    // STAIRS_DN — sunken entry to dungeon
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
            5: -0.12,    // STAIRS_DN — sunken descent to Hero's Wake
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
    [1,1,21,22,34,22,34,21,34,34,34,34,22,34,34,22,34,34,34,21,34,34,22,34,34,22,34,1,34,34,1,34,22,34,34,34,34,34,34,34,34,1,1,2,1,1,1,21,21,21], // 7  NE shack int + DOOR(43,7)→0.5.1
    [1,1,21,22,34,22,34,34,21,34,34,34,22,34,34,22,34,34,18,34,34,34,22,34,34,22,34,1,34,34,1,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], // 8  NC campfire(18,8)
    [1,1,21,22,34,22,34,21,34,34,34,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,1,2,1,1,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], // 9  NE shack DOOR(28,9) + facade
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
    [1,1,21,22,34,22,34,1,2,1,1,34,22,34,34,22,34,34,21,34,18,34,22,34,34,22,34,34,21,34,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //25  SW house DOOR(8,25) + SC bonfire(20,25) + SE tree
    [1,1,21,22,34,22,34,1,34,34,1,34,22,34,34,22,34,34,34,21,34,34,22,34,34,22,34,34,34,21,34,34,22,34,34,34,34,34,34,34,34,1,1,1,1,1,1,21,21,21], //26  SW house int + SC tree + SE tree
    [1,1,21,22,34,22,34,1,34,34,1,34,22,34,34,22,34,21,34,34,34,34,22,34,34,22,34,34,21,34,34,34,22,34,34,34,34,34,34,34,34,1,34,34,34,1,1,21,21,21], //27  SW house + SC tree — facade courtyard opens
    [1,1,21,22,34,22,34,1,1,1,1,34,22,34,34,22,34,34,34,34,34,34,22,34,34,22,34,34,34,34,21,34,22,34,34,34,34,34,34,34,34,1,2,34,34,1,1,21,21,21], //28  SW house bottom + DOOR(42,28)→0.5.2
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
    return {
      grid: grid,
      rooms: _FLOOR0_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorEntry: { x: 44, y: 17 }  // DOOR — roman arch to The Promenade (depth 0→1)
      },
      doorTargets: {
        '44,17': '1',     // Roman arch → The Promenade
        '44,18': '1',     // Roman arch lower tile → The Promenade
        '43,7':  '0.5.1', // Upper facade building entrance
        '28,9':  '0.5.2', // NE shack interior
        '8,25':  '0.5.3', // SW house interior
        '42,28': '0.5.4'  // Lower facade building entrance (courtyard)
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
  // Buildings:
  //   NW: Coral Bazaar (DOOR 12,3 → 1.1)  — facade at row 3, approach from row 4
  //   NE: Driftwood Inn (DOOR 27,3 → 1.2)  — facade at row 3, approach from row 4
  //   W:  Cellar Entrance (DOOR 5,9 → 1.3)  — east-facing, approach from col 6
  //   E:  Gleaner's Home (DOOR 34,9 → 1.6)  — west-facing, approach from col 33
  //
  // South gate: EXIT(18,26)→"0" + GATE(20,26)→"2" (Lantern Row critical path)
  //
  // Landmarks:
  //   BONFIRE(24,17) — central road plaza rest point (single exterior bonfire)
  //   MAILBOX(33,8)  — north of home door approach (33,9).
  //                     Blockout-agnostic: MailboxPeek._findMailboxTile() scans
  //                     for TILES.MAILBOX rather than hardcoding position.
  //                     If the blockout moves the house door, move the MAILBOX
  //                     tile to remain 1 tile N of the new approach tile.
  //                     Candidate alt positions: (33,10) S of approach,
  //                     or any EMPTY adjacent to the door approach path.
  //   DUMP_TRUCK(30,26) — pressure wash truck parked in SE pod near well

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
    [21,21,21,22,0,22,0,1,1,1,1,1,1,0,0,0,22,22,0,1,1,1,1,1,1,0,0,0,22,0,0,0,0,22,0,21,0,0,0,0,0,21,0,0,22,0,0,35,35,35], // 5  Bazaar+Inn buildings
    [21,21,21,22,0,22,0,1,0,0,0,0,1,0,0,0,22,22,0,1,0,0,0,0,1,0,0,0,22,0,0,0,0,22,0,0,0,10,0,10,0,0,0,0,22,0,0,35,35,35], // 6  Noticeboard pillars
    [21,21,21,22,0,22,0,1,0,0,0,0,1,0,0,0,22,22,0,1,0,0,0,0,1,0,0,0,22,0,0,0,0,22,0,21,0,0,1,0,0,21,0,0,22,0,0,35,35,35], // 7  Board tile (38,7)
    [21,21,21,22,0,22,0,1,1,1,2,1,1,0,0,0,22,22,0,1,1,1,2,1,1,0,0,0,22,0,0,0,0,22,0,0,0,10,0,10,0,0,0,0,22,0,0,35,35,35], // 8  Bazaar DOOR(10,8) + Inn DOOR(22,8)
    [21,21,21,22,0,22,0,0,0,0,0,0,0,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,0,0,0,22,0,21,0,0,0,0,0,21,0,0,22,0,0,35,35,35], // 9
    [21,21,21,22,0,22,0,21,0,0,33,33,21,0,0,0,22,22,0,0,0,0,33,33,0,21,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //10  path stubs N
    [21,21,21,22,0,22,0,0,0,0,33,33,0,0,0,0,22,22,0,0,0,0,33,33,0,0,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //11  (bonfire removed — consolidated to road plaza)
    [21,21,21,22,0,22,0,0,0,0,33,33,0,0,0,0,22,22,0,0,0,0,33,33,0,0,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //12
    [21,21,21,22,0,22,22,22,22,22,0,0,22,22,22,22,22,22,22,22,22,22,0,0,22,22,22,22,22,0,0,0,0,22,22,22,22,22,0,0,22,22,22,22,22,0,0,35,35,35], //13  pod bottoms (C-gaps)
    [21,21,21,22,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,35,35,35], //14  pillar arcades
    [21,21,10,10,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,10,10,35], //15  W gate pillars + E gate pillars
    [1,1,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,35], //16  path shoulder N
    [1,1,4,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,18,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,0,2,0], //17  ★ ROAD + DOOR_EXIT(2,17)→0 + DOOR(48,17)→2
    [1,1,4,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,0,2,0], //18  ★ ROAD + DOOR_EXIT(2,18)→0 + DOOR(48,18)→2
    [1,1,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,35], //19  path shoulder S
    [21,21,10,10,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,10,10,35], //20  gate pillars
    [21,21,21,22,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,0,10,0,33,33,0,0,10,0,0,0,0,0,0,35,35,35], //21  pillar arcades
    [21,21,21,22,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,0,0,0,33,33,0,0,0,0,0,0,0,0,0,35,35,35], //22
    [21,21,21,22,0,22,22,22,22,22,0,0,22,22,22,22,22,22,22,22,22,22,0,0,22,22,22,22,22,0,0,0,0,22,22,22,22,22,0,0,22,22,22,22,22,0,0,35,35,35], //23  pod tops S (open N)
    [21,21,21,22,0,22,0,21,0,0,33,33,0,0,21,0,22,22,0, 0,0,0,33,33,0,0,0,0,22,0,0,0,0,22,0,0,33,33,0,0,0,0,0,0,22,0,0,35,35,35], //24  (bonfire removed — consolidated to road plaza)
    [21,21,21,22,0,22,0,0,0,0,33,33,0,0,0,0,22,22,0,0,0,0,37,33,0,0,0,0,22,0,0,0,0,22,0,21,33,33,0,0,0,21,0,0,22,0,0,35,35,35], //25  MAILBOX(22,25) outside home
    [21,21,21,22,0,22,0,0,0,0,0,0,21,0,0,0,22,22,0,0,0,0,0,0,0,0,0,0,22,0,38,0,0,22,0,0,0,0,0,0,0,0,0,0,22,0,0,35,35,35], //26  DUMP_TRUCK(30,26) — parked in SE pod
    [21,21,21,22,0,22,0,0,1,1,2,1,0,0,0,0,22,22,0,0,1,1,2,1,0,0,0,0,22,0,0,0,0,22,0,21,0,0,10,10,0,21,0,0,22,0,0,35,35,35], //27  Storm Shelter DOOR(10,27) + Home DOOR(22,27) + SE well
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
    [  1, 0,25, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0,25, 0, 1], // 2  inner wall + BOOKSHELVES (2,2) (13,2)
    [  1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 3  stair chamber
    [  1, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 1], // 4  STAIRS_DN (7,4)
    [  1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 5  stair chamber
    [  1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 6  gap at (6-8)
    [  1, 0,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 7  main hall + BOOKSHELF (2,7)
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
      shops: [],
      books: [
        { x: 2,  y: 2, bookId: 'tip_bazaar_shopping' },       // How to Buy and Sell
        { x: 13, y: 2, bookId: 'lore_adventuring_economy' },   // Adventuring Economy survey
        { x: 2,  y: 7, bookId: 'fiction_dashing_rogue' }       // The Dashing Rogue (fiction)
      ]
    };
  }

  // ── Hand-authored Floor 1.6: Gleaner's Home (depth 2) ─────────────
  //
  // 24×20 interior. Multi-room Gleaner's dwelling — generous interior
  // space that takes advantage of the "bigger on the inside" rule for
  // depth-2 floors. Existing on a single-tile door from the 20×-wide
  // Promenade, the home unfolds into four distinct zones:
  //
  //   1. Entry hall (south)   — front door (DOOR_EXIT), coat hooks
  //   2. Living room (center) — table with cozy contents, bookshelves
  //   3. Bedroom (west)       — two BED tiles (bonfire), nightstand
  //   4. Storage (east)       — stash CHEST (work keys), mailbox, shelves
  //
  // Work keys (🗝️) are on the CHEST (tile 7) at (19, 4).
  // BED tiles (27) at (3,3) and (4,3) act as the bonfire.
  // TABLE tiles (28) at (11,5) and (12,5) hold cozy items.
  //
  // DOOR_EXIT at (11, 19) leads back to The Promenade (Floor 1).
  //
  // Tile legend:
  //   0=EMPTY  1=WALL  4=DOOR_EXIT  7=CHEST(stash)
  //  10=PILLAR(mailbox/post)  25=BOOKSHELF  27=BED  28=TABLE

  var _FLOOR16_W = 24;
  var _FLOOR16_H = 20;
  // prettier-ignore
  var _FLOOR16_GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,25, 0, 1], // 1  bedroom shelf | living room | storage shelf
    [ 1, 0, 0, 0, 0, 0, 1, 0, 0,25, 0, 0, 0, 0,25, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 2  bedroom open  | bookshelves | storage open
    [ 1, 0,27,27, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 7, 0, 0, 0, 1], // 3  BED pair      | living open | CHEST (stash+keys)
    [ 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 4  bedroom open  | living open | storage open
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,28,28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  ←doorway      | TABLE pair  | doorway→
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 1], // 6  bedroom open  | living open | PILLAR (mailbox)
    [ 1, 0, 0, 0,28, 0, 1, 0, 0, 0, 0,29, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 7  nightstand    | HEARTH(11,7)| storage open
    [ 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,25, 0, 0, 1], // 8  bedroom floor | living open | storage shelf
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 9  bedroom wall  | living mid  | storage wall
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,10, 0, 0,10, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //10               | hall pillars |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //11               | corridor    |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //12               | entry hall  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //13               | entry hall  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //14               | entry hall  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0,25, 0, 0, 0, 0,25, 0, 1, 1, 1, 1, 1, 1, 1, 1], //15               | hall shelves|
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //16               | entry open  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //17               | entry open  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //18               | spawn row   |
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //19  DOOR_EXIT(11,19)
  ];

  var _FLOOR16_SPAWN = { x: 11, y: 18, dir: 3 }; // facing NORTH (toward rooms)
  var _FLOOR16_ROOMS = [
    { x: 1,  y: 1,  w: 5,  h: 8,  cx: 3,  cy: 4  },  // Bedroom (west)
    { x: 7,  y: 1,  w: 9,  h: 8,  cx: 11, cy: 5  },  // Living room (center)
    { x: 17, y: 1,  w: 6,  h: 8,  cx: 20, cy: 4  },  // Storage (east)
    { x: 7,  y: 10, w: 9,  h: 9,  cx: 11, cy: 14 }   // Entry hall (south)
  ];

  function _buildFloor16() {
    var grid = [];
    for (var y = 0; y < _FLOOR16_H; y++) {
      grid[y] = _FLOOR16_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR16_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorExit: { x: 11, y: 19 }   // DOOR_EXIT — back to The Promenade
      },
      doorTargets: { '11,19': '1' },  // DOOR_EXIT → The Promenade
      gridW: _FLOOR16_W,
      gridH: _FLOOR16_H,
      biome: 'home',
      shops: [],
      mailboxHistory: { x: 19, y: 6 },  // PILLAR in storage room — mailbox history peek (§14)
      books: [
        { x: 1,  y: 1,  bookId: 'journal_personal_day0' },         // Bedroom shelf — personal journal
        { x: 9,  y: 2,  bookId: 'notice_dispatcher_orientation' }, // Living room — dispatcher's orientation packet
        { x: 14, y: 2,  bookId: 'journal_contract_terms' },        // Living room — filed employment contract
        { x: 21, y: 1,  bookId: 'notice_landlord_welcome' },       // Storage shelf — landlord's welcome notice
        { x: 20, y: 8,  bookId: 'journal_operative_brief' },       // Storage shelf — personnel file
        { x: 9,  y: 15, bookId: 'journal_field_notes_day1' },      // Entry hall — dispatcher's log (day 1)
        { x: 14, y: 15, bookId: 'letter_anonymous_tip' }            // Entry hall — unsigned letter (conspiracy hook)
      ]
    };
  }

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
          // HEARTH air intake grate — painted ON the base stone face
          // (porthole method repurposed: surface-mounted hardware, not
          // interior cavity effect). Low on the wall, small vent.
          if (isHearth) {
            decor[by][bx][bFaces[bf]].push({
              spriteId: 'decor_grate',
              anchorU: 0.5,
              anchorV: 0.35,  // Low on base stone wall
              scale: 0.20
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
    // Wheels at bottom-left and bottom-right of each visible face.
    // Hose reel is now a billboard sprite (DumpTruckSprites) floating
    // above the short truck body wall, matching the bonfire pattern.
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
            anchorV: 0.22,  // Low on the wall (near ground)
            scale: 0.30
          });
          // Right wheel — bottom-right of wall face
          decor[dty][dtx][f].push({
            spriteId: 'decor_truck_wheel',
            anchorU: 0.78,
            anchorV: 0.22,
            scale: 0.30
          });
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
    } else if (_floorId === '1.1') {
      // Hand-authored Floor 2: Coral Bazaar (depth 2)
      _floorData = _buildFloor2();
      _floorData.contract = contract;
      _enemies = [];  // No enemies in the bazaar (safe zone)
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    } else if (_floorId === '1.6') {
      // Hand-authored Floor 1.6: Gleaner's Home (depth 2)
      _floorData = _buildFloor16();
      _floorData.contract = contract;
      _enemies = [];  // Home is always safe
      _floorCache[_floorId] = { floorData: _floorData, enemies: _enemies };
    } else {
      _floorData = GridGen.generate({
        width: contract.gridSize.w,
        height: contract.gridSize.h,
        biome: getBiome(_floorId),
        floor: _floorId,
        floorId: _floorId,
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

    // ── Post-gen bookshelf injection for interior floors ──────────
    // Depth 2 (interiors) that weren't hand-authored get 1-2 bookshelves
    // placed against walls in the first room.
    if (!fromCache && _depth(_floorId) === 2 && !_floorData.books) {
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
            if (_tt === TILES.STAIRS_DN || _tt === TILES.STAIRS_UP) _stairPos[_tx + ',' + _ty] = true;
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

    // Apply biome colors + contract to raycaster
    Raycaster.setBiomeColors(getBiomeColors(_floorId));
    Raycaster.setContract(contract, _floorData.rooms, _floorData.cellHeights, _floorData.wallDecor || null);

    // Register dynamic light sources from fire-emitting tiles + electric ceiling lights
    _registerLightSources(_floorData.grid, _floorData.gridW, _floorData.gridH, contract);

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
    getBiomeColors: getBiomeColors,
    getFloorContract: getFloorContract,
    getFloorLabel: getFloorLabel,

    // Floor 0
    getFloor0Spawn: function () { return { x: _FLOOR0_SPAWN.x, y: _FLOOR0_SPAWN.y, dir: _FLOOR0_SPAWN.dir }; },

    // Cache
    clearCache: clearCache,
    invalidateCache: invalidateCache
  };
})();

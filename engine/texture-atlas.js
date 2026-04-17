/**
 * TextureAtlas — texture loading, caching, and procedural generation.
 *
 * Manages all wall textures for the raycaster. Each texture is stored
 * as an offscreen canvas + ImageData for fast column sampling.
 *
 * For the jam: all textures are generated procedurally at init() time.
 * Post-jam: load hand-pixeled PNGs through the same API.
 *
 * ── ART DIRECTION (Apr 3 2026) ─────────────────────────────────────
 *
 *   Target look: HD-Minecraft pixel art — chunky readable blocks, not
 *   photorealistic. Two style tiers:
 *
 *   NON-INTERACTIVE surfaces (walls, floors, pillars, fences):
 *     Reference: _genShrub — large cluster blocks (5×4 px), 3-tier
 *     shadow/mid/highlight, minimal per-pixel noise. Shapes should be
 *     readable at a glance from TV distance (10 ft / LG webOS).
 *
 *   INTERACTIVE surfaces (chests, crates, doors, torches, terminals):
 *     Reference: _genStashChest — higher detail with bands, rivets,
 *     latches. Still pixel-art but finer structure so the player can
 *     parse "this thing is interactable" vs background wall.
 *
 *   All generators are expected to get a post-jam HD freshen pass
 *   toward this style. Current jam versions lean chunky over detailed.
 *   When in doubt: bigger blocks, less per-pixel noise, stronger
 *   per-block color contrast.
 *
 * ────────────────────────────────────────────────────────────────────
 *
 * Usage by raycaster:
 *   var tex = TextureAtlas.get('brick_light');
 *   // tex = { width, height, canvas, data (Uint8ClampedArray) }
 *   // Sample column texX from 0..tex.width-1
 *
 * Depends on: nothing (Layer 1, loads before Raycaster)
 */
var TextureAtlas = (function () {
  'use strict';

  var TEX_SIZE = 64; // Default texture resolution (square)
  var _textures = {}; // id → { width, height, canvas, data }

  // ── Animated texture support ──────────────────────────────────
  // Porthole textures composite a pre-rendered metal frame with a
  // per-frame ocean scene. The mask marks which pixels are window.
  var _animTime = 0;
  var _portholes = []; // { id, frameData, mask, cx, cy, radius }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Initialize all procedural textures.
   * Call once at startup before first render.
   */
  function init() {
    _generateAll();
    console.log('[TextureAtlas] Initialized — ' + Object.keys(_textures).length + ' textures');
  }

  /**
   * Get a texture by ID.
   * @param {string} id - Texture identifier
   * @returns {Object|null} { width, height, canvas, data } or null
   */
  function get(id) {
    return _textures[id] || null;
  }

  /**
   * Check if a texture exists.
   * @param {string} id
   * @returns {boolean}
   */
  function hasTexture(id) {
    return !!_textures[id];
  }

  /**
   * Register an externally loaded texture (for PNG loading post-jam).
   * @param {string} id
   * @param {HTMLCanvasElement} canvas
   */
  function register(id, canvas) {
    var ctx = canvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    _textures[id] = {
      width: canvas.width,
      height: canvas.height,
      canvas: canvas,
      data: imgData.data
    };
  }

  // ── Procedural texture generation ──────────────────────────────

  function _generateAll() {
    _genBrick('brick_light', { mortarR: 60, mortarG: 55, mortarB: 50,
      faceR: 138, faceG: 122, faceB: 106, variance: 15 });

    _genBrick('brick_dark', { mortarR: 30, mortarG: 28, mortarB: 25,
      faceR: 85, faceG: 65, faceB: 55, variance: 12 });

    _genBrick('brick_red', { mortarR: 50, mortarG: 40, mortarB: 35,
      faceR: 140, faceG: 70, faceB: 55, variance: 18 });

    _genStone('stone_rough', { baseR: 90, baseG: 88, baseB: 82, variance: 20 });

    _genStone('stone_cathedral', { baseR: 75, baseG: 72, baseB: 85, variance: 15 });

    _genWood('wood_plank', { baseR: 100, baseG: 70, baseB: 40, grainDark: 0.7 });

    _genWood('wood_dark', { baseR: 60, baseG: 40, baseB: 25, grainDark: 0.6 });

    // Bookshelf — dark frame with colourful book spines (interactive)
    _genBookshelf('bookshelf', {
      frameR: 55, frameG: 38, frameB: 22,     // Dark wood frame
      shelfR: 45, shelfG: 30, shelfB: 18      // Shelf edge (slightly darker)
    });

    // Default door — flat twinkly porthole (used when direction unknown)
    _genDoorWood('door_wood', { baseR: 120, baseG: 80, baseB: 45,
      bandR: 80, bandG: 55, bandB: 30, porthole: 'flat' });
    // Descending porthole variant (DOOR tiles — advancing deeper)
    _genDoorWood('door_wood_desc', { baseR: 120, baseG: 80, baseB: 45,
      bandR: 80, bandG: 55, bandB: 30, porthole: 'desc' });
    // Ascending porthole variant (DOOR_BACK/EXIT — returning up)
    _genDoorWood('door_wood_asc', { baseR: 120, baseG: 80, baseB: 45,
      bandR: 80, bandG: 55, bandB: 30, porthole: 'asc' });

    _genDoorIron('door_iron', { baseR: 70, baseG: 72, baseB: 78,
      rivetR: 100, rivetG: 105, rivetB: 110 });

    // ── Per-building door variants (Phase 0 — Door Architecture) ────
    // Each building gets a door whose surround matches its wall material.
    // Generated with _genDoorWood (same arch+porthole silhouette, different
    // colour palette). Keyed by BuildingRegistry.doorTexture.

    // Coral Bazaar — warm red brick surround, terracotta frame
    _genDoorWood('door_redbrick', { baseR: 145, baseG: 65, baseB: 50,
      bandR: 110, bandG: 55, bandB: 40, porthole: 'flat' });
    // Driftwood Inn — pale sun-bleached plank surround, sandy frame
    _genDoorWood('door_driftwood', { baseR: 150, baseG: 130, baseB: 100,
      bandR: 120, bandG: 100, bandB: 70, porthole: 'flat' });
    // Storm Shelter / Watchman's Post — cool grey stone, iron-dark frame
    _genDoorWood('door_greystone', { baseR: 95, baseG: 90, baseB: 85,
      bandR: 65, bandG: 62, bandB: 58, porthole: 'desc' });
    // Gleaner's Home — dark worn plank, simple dark wood frame
    _genDoorWood('door_darkwood', { baseR: 85, baseG: 58, baseB: 35,
      bandR: 55, bandG: 38, bandB: 22, porthole: 'flat' });
    // Dispatcher's Office — utilitarian concrete, steel frame
    _genDoorWood('door_concrete', { baseR: 115, baseG: 112, baseB: 108,
      bandR: 80, bandG: 78, bandB: 75, porthole: 'flat' });

    // Per-building ARCH_DOORWAY variants (same Gothic profile, different
    // surround material). Re-uses _genArchDoorway with building palettes.
    _genArchDoorway('arch_redbrick', {
      baseR: 145, baseG: 65,  baseB: 50,      // Red brick surround
      mortarR: 70, mortarG: 50, mortarB: 40,
      jambR: 170, jambG: 130, jambB: 100      // Warm terracotta trim
    });
    _genArchDoorway('arch_driftwood', {
      baseR: 150, baseG: 130, baseB: 100,     // Pale sun-bleached plank
      mortarR: 100, mortarG: 85, mortarB: 65,
      jambR: 170, jambG: 155, jambB: 130      // Sandy lighter trim
    });
    _genArchDoorway('arch_darkwood', {
      baseR: 85,  baseG: 58,  baseB: 35,      // Worn dark plank
      mortarR: 50, mortarG: 35, mortarB: 22,
      jambR: 110, jambG: 80,  jambB: 55       // Lighter oak trim
    });
    _genArchDoorway('arch_concrete', {
      baseR: 115, baseG: 112, baseB: 108,     // Government concrete
      mortarR: 75, mortarG: 72, mortarB: 68,
      jambR: 135, jambG: 130, jambB: 125      // Pale cement keystone
    });

    // Per-biome door variants
    // Cellar: dark stone arch with mossy frame — damp underground feel
    _genDoorWood('door_cellar', { baseR: 75, baseG: 70, baseB: 60,
      bandR: 50, bandG: 48, bandB: 40, porthole: 'desc' });

    // Foundry: heavy rusted iron with warm orange rivet glow
    _genDoorIron('door_foundry', { baseR: 55, baseG: 45, baseB: 35,
      rivetR: 120, rivetG: 80, rivetB: 40 });

    // Sealab: clean tech pressure door — cool steel with bright rivets
    _genDoorIron('door_sealab', { baseR: 85, baseG: 90, baseB: 100,
      rivetR: 140, rivetG: 150, rivetB: 160 });

    // Promenade: marble arch door — polished stone frame + warm dark interior
    // Matches the 'concrete' wall palette so the door frame looks embedded
    _genDoorWood('door_marble', { baseR: 125, baseG: 122, baseB: 118,
      bandR: 110, bandG: 105, bandB: 100, porthole: 'flat' });
    _genDoorWood('door_marble_desc', { baseR: 125, baseG: 122, baseB: 118,
      bandR: 110, bandG: 105, bandB: 100, porthole: 'desc' });
    _genDoorWood('door_marble_asc', { baseR: 125, baseG: 122, baseB: 118,
      bandR: 110, bandG: 105, bandB: 100, porthole: 'asc' });

    // ── Door panel textures (Phase 5A — cavity content) ──────────
    // These are the actual door FACE textures rendered inside the
    // DOOR_FACADE freeform cavity. Vertical planks + handle + hinges.
    _genDoorPanel('door_panel_wood', {
      baseR: 100, baseG: 68, baseB: 38,   // warm oak planks
      handleR: 160, handleG: 140, handleB: 90,  // brass handle
      hingeR: 55, hingeG: 50, hingeB: 45,  // dark iron hinges
      plankW: 10, grainDark: 0.72
    });
    _genDoorPanel('door_panel_dark', {
      baseR: 65, baseG: 42, baseB: 25,    // worn dark wood (Gleaner's Home)
      handleR: 120, handleG: 100, handleB: 70,
      hingeR: 45, hingeG: 40, hingeB: 35,
      plankW: 10, grainDark: 0.65
    });
    _genDoorPanel('door_panel_studded', {
      baseR: 85, baseG: 60, baseB: 38,    // heavy oak with iron studs
      handleR: 110, handleG: 115, handleB: 120, // steel ring handle
      hingeR: 70, hingeG: 72, hingeB: 75,  // iron strap hinges
      plankW: 12, grainDark: 0.68, studs: true
    });
    _genDoorPanel('door_panel_glass', {
      baseR: 90, baseG: 65, baseB: 40,    // wood frame + glass insert
      handleR: 140, handleG: 130, handleB: 100,
      hingeR: 50, hingeG: 48, hingeB: 42,
      plankW: 10, grainDark: 0.7, glassInsert: true
    });
    _genDoorPanel('door_panel_iron', {
      baseR: 70, baseG: 72, baseB: 78,    // riveted iron plate
      handleR: 100, handleG: 105, handleB: 110,
      hingeR: 55, hingeG: 58, hingeB: 62,
      plankW: 16, grainDark: 0.8, ironPlate: true
    });

    // ── Blockout Refresh Phase A: new door panel textures ──────────
    // See BLOCKOUT_REFRESH_PLAN.docx §2.2 — contrast system requires
    // these panels so no building has wood-on-wood or dark-on-dark doors.

    _genDoorPanel('door_panel_oiled', {
      baseR: 60, baseG: 38, baseB: 18,    // dark oiled wood — rich walnut tone
      handleR: 175, handleG: 148, handleB: 70,  // bright brass knob
      hingeR: 50, hingeG: 45, hingeB: 38,  // dark iron hinges
      plankW: 8, grainDark: 0.60           // tight planks, pronounced grain
    });
    _genDoorPanel('door_panel_charcoal', {
      baseR: 28, baseG: 22, baseB: 18,    // near-black charred wood
      handleR: 200, handleG: 170, handleB: 50,  // yellow-gold accent knob
      hingeR: 40, hingeG: 35, hingeB: 30,  // barely-visible dark hinges
      plankW: 10, grainDark: 0.55          // subtle grain on very dark base
    });
    _genDoorPanel('door_panel_ironbound', {
      baseR: 95, baseG: 68, baseB: 40,    // heavy oak base
      handleR: 90, handleG: 92, handleB: 98,  // iron ring pull (steel-grey)
      hingeR: 65, hingeG: 68, hingeB: 72,  // iron strap hinges
      plankW: 12, grainDark: 0.68, ironBands: true  // horizontal iron bands
    });

    // ── Phase 6A: wide (128×64) double-door panel textures ──────────
    // Two-leaf panels for paired DOOR_FACADE tiles. UV-split by gap filler:
    // left tile samples cols 0–63, right tile samples cols 64–127.
    _genDoubleDoorPanel('double_door_iron', {
      baseR: 70, baseG: 72, baseB: 78,           // riveted iron plate
      handleR: 100, handleG: 105, handleB: 110,   // iron ring pull
      hingeR: 55, hingeG: 58, hingeB: 62,
      plankW: 16, grainDark: 0.8, ironPlate: true
    });
    _genDoubleDoorPanel('double_door_wood', {
      baseR: 95, baseG: 68, baseB: 40,           // grand oak
      handleR: 160, handleG: 140, handleB: 90,    // brass pull handles
      hingeR: 65, hingeG: 68, hingeB: 72,
      plankW: 12, grainDark: 0.68, ironBands: true
    });
    _genDoubleDoorPanel('double_door_ornate', {
      baseR: 80, baseG: 55, baseB: 30,           // dark cathedral wood
      handleR: 180, handleG: 160, handleB: 70,    // gold fixtures
      hingeR: 60, hingeG: 55, hingeB: 48,
      plankW: 10, grainDark: 0.62
    });

    // ── Phase 6B: wide arch textures (128×64, paired ARCH_DOORWAY) ──
    // A single parabolic opening spans the full 128px width. The left
    // tile samples columns 0–63, the right tile samples 64–127.
    // The raycaster's alpha-mask path UV-remaps texX when it detects
    // a paired ARCH_DOORWAY tile via DoorSprites.getPairInfo().
    _genWideArch('arch_wide_brick', {
      baseR: 140, baseG: 90, baseB: 65,           // warm brick surround
      mortarR: 110, mortarG: 100, mortarB: 90,
      jambR: 165, jambG: 155, jambB: 140           // pale keystone trim
    });
    _genWideArch('arch_wide_stone', {
      baseR: 120, baseG: 118, baseB: 112,          // grey ashlar
      mortarR: 95, mortarG: 92, mortarB: 88,
      jambR: 150, jambG: 148, jambB: 140
    });
    _genWideArch('arch_wide_iron', {
      baseR: 65, baseG: 68, baseB: 74,             // dark iron frame
      mortarR: 50, mortarG: 52, mortarB: 56,
      jambR: 90, jambG: 95, jambB: 100
    });

    // ── Blockout Refresh Phase A: new door surround textures ───────
    // See BLOCKOUT_REFRESH_PLAN.docx §2.2 — surrounds for building
    // types not yet covered (light brick, metal plate, cathedral stone).

    _genDoorWood('door_lightbrick', {
      baseR: 195, baseG: 175, baseB: 145,  // cream/sand brick fill
      bandR: 180, bandG: 160, bandB: 130,  // warm sandstone frame
      porthole: 'flat'
    });
    _genDoorMetal('door_metal', {
      baseR: 100, baseG: 105, baseB: 112,  // brushed steel plate
      bandR: 80,  bandG: 85,  bandB: 92,   // darker steel frame
      rivetR: 130, rivetG: 135, rivetB: 140 // bright rivet highlights
    });
    _genDoorCathedral('door_cathedral', {
      baseR: 140, baseG: 135, baseB: 125,  // warm dressed stone
      bandR: 120, bandG: 115, bandB: 105,  // carved frame surround
      archR: 155, archG: 148, archB: 135   // arch motif highlight
    });

    _genConcrete('concrete', { baseR: 130, baseG: 128, baseB: 125, variance: 8 });

    _genConcrete('concrete_dark', { baseR: 70, baseG: 68, baseB: 72, variance: 6 });

    _genMetal('metal_plate', { baseR: 60, baseG: 65, baseB: 75, variance: 10 });

    // Pressure wash dump truck body — blue-painted steel panel
    _genMetal('truck_body', { baseR: 40, baseG: 60, baseB: 140, variance: 8 });

    _genPillar('pillar_stone', { baseR: 110, baseG: 105, baseB: 100 });

    // Directional stair textures — distinct at-a-glance silhouettes
    _genStairsDown('stairs_down', {
      stoneR: 75, stoneG: 72, stoneB: 68,    // Dark stone
      arrowR: 45, arrowG: 55, arrowB: 45,    // Dim green arrow pointing down
      stepR:  55, stepG: 52, stepB: 48        // Step edges
    });

    _genStairsUp('stairs_up', {
      stoneR: 95, stoneG: 90, stoneB: 82,    // Lighter stone
      arrowR: 120, arrowG: 110, arrowB: 70,  // Warm amber arrow pointing up
      stepR:  75, stepG: 72, stepB: 65        // Step edges
    });

    // Floor textures — used by floor casting in raycaster
    _genFloorCobble('floor_cobble', {
      baseR: 80, baseG: 78, baseB: 72, mortarR: 45, mortarG: 42, mortarB: 38
    });

    _genFloorWood('floor_wood', {
      baseR: 90, baseG: 62, baseB: 35, grainDark: 0.7
    });

    _genFloorStone('floor_stone', {
      baseR: 55, baseG: 52, baseB: 50, variance: 12
    });

    _genFloorDirt('floor_dirt', {
      baseR: 65, baseG: 50, baseB: 35, variance: 18
    });

    // Warm red-brown brick courtyard — distinct from grey stone walls
    _genFloorBrickRed('floor_brick_red', {
      faceR: 145, faceG: 72, faceB: 52,     // Warm terracotta brick
      mortarR: 90, mortarG: 78, mortarB: 65, // Tan sandy mortar
      variance: 16
    });

    // Grey flagstone with organic grass veins (Grey-Scott reaction-diffusion)
    _genFloorGrassStone('floor_grass_stone', {
      stoneR: 80, stoneG: 78, stoneB: 72,   // Cool grey stone base
      grassR: 55, grassG: 95, grassB: 40,    // Muted moss green
      mortarR: 50, mortarG: 55, mortarB: 42, // Greenish mortar (moss in cracks)
      variance: 12
    });

    // Clean tile — clinical sealab floor (contrasts with dark concrete walls)
    _genFloorTile('floor_tile', {
      baseR: 130, baseG: 140, baseB: 150,   // Cool blue-white tile
      groutR: 75, groutG: 80, groutB: 90,   // Dark blue-grey grout
      variance: 6
    });

    // Pure grass floor — under trees and shrubs on exterior floors
    _genFloorGrass('floor_grass', {
      baseR: 42, baseG: 78, baseB: 32,      // Muted forest green base
      hiR:   55, hiG:   98, hiB:   42,      // Sunlit blade highlights
      darkR: 30, darkG:  55, darkB: 22,     // Shadow patches (under canopy)
      variance: 18
    });

    // Exterior tree — brown bark bottom, dense green canopy top
    _genTreeTrunk('tree_trunk', {
      barkR: 85, barkG: 55, barkB: 30,      // Brown bark
      leafR: 40, leafG: 75, leafB: 35,      // Dense leaf green
      leafHiR: 55, leafHiG: 95, leafHiB: 45 // Leaf highlight (sunlight)
    });

    // Exterior shrub — dense hedge, all leaf, irregular top edge
    _genShrub('shrub', {
      leafR: 35, leafG: 65, leafB: 30,       // Dark hedge green
      leafHiR: 50, leafHiG: 85, leafHiB: 40, // Sunlit leaf highlight
      stemR: 55, stemG: 40, stemB: 22         // Brown stem/twig glimpses
    });

    // ── Roof textures (Architectural Shapes Phase 1) ──────────────
    _genRoofShingle('roof_shingle', {
      baseR: 140, baseG: 68, baseB: 42,       // Warm terracotta shingle
      mortarR: 90, mortarG: 55, mortarB: 35,   // Dark mortar between rows
      hiR: 170, hiG: 90, hiB: 55              // Sunlit highlight edge
    });
    _genRoofShingle('roof_slate', {
      baseR: 80, baseG: 82, baseB: 88,        // Cool grey slate
      mortarR: 50, mortarG: 52, mortarB: 55,   // Dark seam between tiles
      hiR: 105, hiG: 108, hiB: 115            // Wet highlight
    });
    _genRoofShingle('roof_thatch', {
      baseR: 155, baseG: 130, baseB: 65,      // Golden straw
      mortarR: 110, mortarG: 90, mortarB: 40,  // Shadow between bundles
      hiR: 185, hiG: 160, hiB: 90             // Sunlit straw tip
    });

    // Canopy leaf textures — dense foliage for tree canopy rings
    _genCanopyLeaf('canopy_oak', {
      baseR: 45, baseG: 100, baseB: 35,       // Deep green leaf body
      hiR: 85, hiG: 155, hiB: 60,             // Sunlit leaf highlight
      gapR: 20, gapG: 45, gapB: 15            // Dark gaps between clusters
    });
    _genCanopyLeaf('canopy_autumn', {
      baseR: 140, baseG: 80, baseB: 25,       // Warm autumn orange
      hiR: 195, hiG: 130, hiB: 45,            // Bright autumn highlight
      gapR: 60, gapG: 35, gapB: 12            // Dark autumn gap
    });
    // Swampy hanging-moss variant — used by CANOPY_MOSS (translucent
    // underside band). Muted grey-green with lots of gap pixels, so
    // the per-column moss band reads as dangling strands rather than
    // a solid leaf wall.
    _genCanopyLeaf('canopy_moss', {
      baseR: 75, baseG: 95, baseB: 55,        // Pale grey-green moss
      hiR: 115, hiG: 135, hiB: 80,            // Sun-bleached strand highlight
      gapR: 30, gapG: 40, gapB: 20            // Dark strand gap (lots of these)
    });

    // Crenel cap stone — slightly lighter & warmer than the base wall
    // stone so the rampart reads as finished top-course masonry. The
    // toothed silhouette is generated geometrically in the raycaster
    // via per-column UV bands, so this texture stays a flat solid
    // stone pattern (no alpha cutouts baked in).
    _genStone('roof_crenel', { baseR: 118, baseG: 112, baseB: 100, variance: 22 });

    // Pergola beam — dark stained hardwood for open-air trellis covers
    // over plazas, markets, and temple courtyards. Shares the crenel's
    // geometric tooth silhouette in the raycaster, but with back-face
    // injection enabled: the duplicated silhouette reads as vertical
    // posts supporting a horizontal cross-beam instead of a wall top.
    _genStone('pergola_beam', { baseR: 62, baseG: 42, baseB: 26, variance: 14 });

    // City Bonfire pedestal — carved pale limestone for the Olympic-style
    // community pyre (CITY_BONFIRE tile). Warm cream tint so it reads as
    // ceremonial masonry next to the warmer flame gradient above.
    // wallHeight is 3.0; the lower 1.2 world units sample this texture
    // (the rest of the column is the fire cavity — see raycaster
    // 'city_bonfire_fire' gap filler).
    _genStone('city_bonfire_stone', { baseR: 162, baseG: 148, baseB: 118, variance: 24 });

    // Breakable crate texture — wooden slat box with cross-braces
    _genCrateWood('crate_wood', {
      baseR: 110, baseG: 78, baseB: 42,      // Pale wood slats
      braceR: 70, braceG: 48, braceB: 25,    // Dark cross-braces
      nailR: 140, nailG: 140, nailB: 130     // Nail highlights
    });

    // Sealab porthole textures — animated ocean composited per frame
    _genPortholeWall('porthole_wall', {
      frameR: 55, frameG: 60, frameB: 70,   // Steel frame
      rivetR: 80, rivetG: 85, rivetB: 95,   // Rivet highlights
      glassR: 6,  glassG: 18, glassB: 35    // Deep ocean base (overwritten each frame)
    });
    _genPortholeCeil('porthole_ceil', {
      frameR: 50, frameG: 55, frameB: 65,
      rivetR: 75, rivetG: 80, rivetB: 90,
      glassR: 10, glassG: 25, glassB: 45    // Lighter — looking toward surface
    });

    // Arch doorway — brick wall with parabolic α=0 cutout. The raycaster's
    // alpha-mask freeform path reads the per-column transparent row range
    // to produce the curved opening. Gothic profile (pointed, not round).
    _genArchDoorway('arch_brick', {
      baseR: 140, baseG: 95,  baseB: 65,     // Warm sandstone brick surround
      mortarR: 80, mortarG: 72, mortarB: 62,  // Dark mortar lines
      jambR: 160, jambG: 145, jambB: 120      // Pale stone voussoir trim
    });
    _genArchDoorway('arch_stone', {
      baseR: 110, baseG: 108, baseB: 100,     // Cool grey stone surround
      mortarR: 70, mortarG: 68,  mortarB: 64,
      jambR: 140, jambG: 135, jambB: 125      // Lighter keystone trim
    });

    // Porthole (alpha-cutout) — brick/metal wall with circular α=0 hole.
    // Unlike the animated porthole_wall (which paints the glass region per
    // frame), this texture leaves the hole genuinely transparent so the
    // raycaster's alpha-mask freeform path can show back-layer content
    // (or a gap-filler scene) through the opening.
    _genPortholeAlpha('porthole_alpha', {
      baseR: 90, baseG: 95, baseB: 100,       // Cool industrial grey-blue
      mortarR: 55, mortarG: 58, mortarB: 60,
      frameR: 60, frameG: 65, frameB: 72,     // Darker steel frame ring
      rivetR: 85, rivetG: 90, rivetB: 100,    // Rivet highlights
      radius: 18, frameWidth: 4               // Opening radius in texels
    });

    // Bed — warm quilted blanket texture, pillow band at top
    _genBed('bed_quilt', {
      blanketR: 100, blanketG: 55, blanketB: 45,   // Deep burgundy-rust
      pillowR: 180, pillowG: 170, pillowB: 155,    // Off-white linen pillow
      frameR: 70,   frameG: 48,   frameB: 28        // Dark wood frame
    });

    // Table — flat-top work surface, warm wood with tool clutter
    _genTable('table_wood', {
      topR: 120, topG: 85, topB: 50,      // Lighter work surface
      legR: 75,  legG: 50, legB: 30,      // Dark wood legs
      clothR: 90, clothG: 60, clothB: 40  // Stained cloth runner
    });

    // Hearth — riverrock column with fire opening (dark archway center)
    _genHearth('hearth_riverrock', {
      stoneR: 95,  stoneG: 88,  stoneB: 78,    // Warm grey-brown river stones
      mortarR: 50, mortarG: 45, mortarB: 38     // Dark mortar between stones
    });

    // Stash — reinforced chest with iron bands and latch
    _genStashChest('stash_chest', {
      woodR: 95,   woodG: 65,  woodB: 35,   // Medium oak
      bandR: 70,   bandG: 72,  bandB: 78,   // Iron bands
      latchR: 160, latchG: 140, latchB: 60  // Brass latch
    });

    // Locked door — iron-banded wood with chain + lock overlay
    _genDoorLocked('door_locked', {
      baseR: 100, baseG: 68, baseB: 38,      // Wood base
      bandR: 70,  bandG: 50, bandB: 28,      // Iron bands
      chainR: 90, chainG: 95, chainB: 100,   // Chain + padlock color
      lockR: 180, lockG: 160, lockB: 50      // Brass lock highlight
    });

    // ── Wall decor sprites (16×16, alpha-transparent) ──────────────

    // Torch bracket — iron bracket + flame. Primary consumer: A6 torch tiles.
    _genTorchBracket('decor_torch', {
      bracketR: 60, bracketG: 58, bracketB: 55,  // Dark iron bracket
      flameR: 240, flameG: 160, flameB: 40,      // Orange flame body
      tipR: 255,   tipG: 240,   tipB: 200        // White-yellow flame tip
    });

    // Unlit torch — charred bracket stub, no flame. Sooty iron + black tip.
    // Same silhouette as decor_torch but the flame region is replaced with
    // a small charred wick stub so the bracket still reads as a torch,
    // just extinguished. Consumer: TORCH_UNLIT wallDecor.
    _genTorchUnlit('decor_torch_unlit', {
      bracketR: 48, bracketG: 44, bracketB: 40,  // Sooty iron
      stubR: 35,  stubG: 28,  stubB: 22,         // Charred wick
      ashR:  55,  ashG:  48,  ashB:  42          // Ash highlight
    });

    // Hearth fire — flame + dragon silhouette for porthole cavity
    // (legacy procedural texture; used by the original step-fill lip
    // path and the wall-decor billboard system)
    _genHearthFire('decor_hearth_fire', {
      coreR: 255, coreG: 230, coreB: 120,     // Bright yellow-white core
      outerR: 210, outerG: 100, outerB: 25,    // Deep orange outer flame
      dragonR: 60,  dragonG: 30,  dragonB: 15  // Dark ember dragon silhouette
    });

    // Dragonfire emoji stack — real 🔥 + 🐉 glyphs composited on a
    // transparent canvas, sampled per-column by the freeform HEARTH
    // cavity renderer. Matches the exterior BONFIRE billboard look
    // (BonfireSprites) so interior hearths read as "same fire, different
    // container" instead of "procedural oval." Alpha outside the emoji
    // body is zero so the dark cavity backdrop shows through rather
    // than being overwritten by opaque paint.
    _genDragonfireEmoji('decor_hearth_dragonfire');

    // Iron grate — horizontal bars with gaps (dungeon vents)
    _genWallGrate('decor_grate', {
      barR: 70, barG: 68, barB: 65,     // Dark iron bars
      hiR: 95,  hiG: 92,  hiB: 88      // Bar edge highlight
    });

    // Wall banner — triangular pennant hanging from rod
    _genWallBanner('decor_banner_red', {
      rodR: 80, rodG: 60, rodB: 35,       // Wooden rod
      fabricR: 140, fabricG: 30, fabricB: 25,  // Red fabric
      trimR: 180, trimG: 150, trimB: 50    // Gold trim
    });
    _genWallBanner('decor_banner_blue', {
      rodR: 80, rodG: 60, rodB: 35,
      fabricR: 30, fabricG: 50, fabricB: 140,
      trimR: 160, trimG: 160, trimB: 170
    });

    // Dump truck wheel — black tire ring with grey hub
    _genTruckWheel('decor_truck_wheel', {
      tireR: 20, tireG: 20, tireB: 22,     // Black rubber tire
      hubR: 90, hubG: 88, hubB: 85,        // Grey metal hub
      axleR: 50, axleG: 48, axleB: 45      // Dark axle center
    });

    // Dump truck hose reel — blue spool with orange caps (matches diagram)
    _genTruckHoseReel('decor_truck_hose', {
      spoolR: 50, spoolG: 120, spoolB: 200, // Blue hose on spool
      capR: 200, capG: 140, capB: 60,       // Orange/tan wooden caps
      needleR: 180, needleG: 175, needleB: 190 // Light grey nozzle
    });

    // Terminal desk wall texture (half-wall with CRT screen above)
    _genTerminalWall('terminal_screen', {
      deskR: 55, deskG: 52, deskB: 50,       // Grey metal desk
      screenR: 10, screenG: 28, screenB: 12,  // Dark green CRT background
      glowR: 30, glowG: 90, glowB: 35,        // Sickly green text glow
      frameR: 40, frameG: 38, frameB: 36       // Monitor bezel
    });

    // CRT screen decor sprite (for wallDecor overlay on terminal face)
    _genTerminalDecor('decor_terminal', {
      screenR: 10, screenG: 28, screenB: 12,
      glowR: 30, glowG: 90, glowB: 35,
      frameR: 45, frameG: 42, frameB: 40
    });

    // ── Trapdoor decor sprites ─────────────────────────────────────

    // Ladder — two vertical rails with horizontal rungs, transparent
    // background. Billboard sprite placed at trapdoor tile center.
    // Parallaxes as the player strafes, same pattern as dragonfire.
    _genLadder('decor_ladder', {
      railR: 85, railG: 60, railB: 35,     // Dark oak rails
      rungR: 110, rungG: 80, rungB: 45,    // Lighter rung wood
      boltR: 65, boltG: 62, boltB: 58      // Iron bolts at joints
    });

    // Trapdoor hatch lid — planked wood door face with iron hinges.
    // Used as the wall texture for TRAPDOOR_UP's solid band (the
    // floor-level frame reads as the underside of the hatch lid) and
    // TRAPDOOR_DN's solid band (the rim reads as the topside).
    _genTrapdoorLid('trapdoor_lid', {
      baseR: 75, baseG: 52, baseB: 30,     // Dark weathered wood
      hingeR: 55, hingeG: 52, hingeB: 48,  // Iron hinge plates
      boltR: 65, boltG: 62, boltB: 58,     // Iron bolts
      handleR: 80, handleG: 75, handleB: 65 // Iron pull ring
    });

    // ── Infrastructure tile decor sprites ────────────────────────────

    // Rope + bucket silhouette — dangles from well rim face
    _genRopeBucket('decor_rope_bucket', {
      ropeR: 110, ropeG: 85, ropeB: 50,          // Hemp rope
      bucketR: 70, bucketG: 55, bucketB: 35,     // Dark wood bucket
      bandR: 80, bandG: 78, bandB: 75            // Iron bands on bucket
    });

    // Curled parchment note — pinned to notice board face
    _genPinnedNote('decor_pinned_note', {
      paperR: 195, paperG: 185, paperB: 160,     // Parchment
      inkR: 45, inkG: 40, inkB: 35,              // Ink lines
      pinR: 150, pinG: 35, pinB: 25              // Red pushpin
    });

    // Ladle handle — poking up from soup cauldron rim
    _genLadle('decor_ladle', {
      handleR: 75, handleG: 55, handleB: 30,     // Dark wood handle
      bowlR: 60, bowlG: 58, bowlB: 55            // Iron bowl (below rim)
    });

    // Bright spark cluster — anvil strikes or electrical
    _genSpark('decor_spark', {
      coreR: 255, coreG: 240, coreB: 180,        // White-yellow core
      outerR: 255, outerG: 160, outerB: 40       // Orange outer spark
    });

    // Blue energy pulse — charging cradle conduit glow
    _genConduitGlow('decor_conduit_glow', {
      coreR: 120, coreG: 200, coreB: 255,        // Bright blue-white
      outerR: 40, outerG: 120, outerB: 200       // Deep blue fringe
    });

    // Indicator lamp — switchboard status light
    _genToggleLight('decor_toggle_light_red', {
      glassR: 180, glassG: 40, glassB: 25,       // Red glass
      glowR: 220, glowG: 60, glowB: 30           // Red glow halo
    });
    _genToggleLight('decor_toggle_light_green', {
      glassR: 40, glassG: 160, glassB: 50,       // Green glass
      glowR: 60, glowG: 200, glowB: 70           // Green glow halo
    });

    // ── Hazard-adjacent wall decor ─────────────────────────────────

    // Scorch mark — soot/burn stain on wall adjacent to FIRE tiles
    _genScorch('decor_scorch', {
      darkR: 20, darkG: 18, darkB: 15,           // Char black
      midR: 50, midG: 35, midB: 20               // Brown soot edge
    });

    // Acid drip — green ooze dripping down wall (POISON adjacent)
    _genAcidDrip('decor_acid_drip', {
      poolR: 55, poolG: 130, poolB: 30,           // Toxic green
      dripR: 70, dripG: 160, dripB: 45,           // Bright drip
      hiR: 100, hiG: 200, hiB: 70                 // Specular highlight
    });

    // Warning scratches — claw/tool marks on wall (TRAP/SPIKES adjacent)
    _genWarningScratches('decor_warning_scratch', {
      scratchR: 120, scratchG: 115, scratchB: 108, // Exposed stone
      deepR: 45, deepG: 40, deepB: 35             // Deep gouge shadow
    });

    // ── Biome variety wall decor ───────────────────────────────────

    // Wanted poster — parchment with text and border (exterior walls)
    _genWantedPoster('decor_wanted_poster', {
      paperR: 190, paperG: 175, paperB: 145,      // Yellowed paper
      borderR: 90, borderG: 70, borderB: 45,      // Dark frame/edge
      textR: 40, textG: 35, textB: 30             // Ink text
    });

    // Cobweb — delicate web in corner (dungeon biomes)
    _genCobweb('decor_cobweb', {
      silkR: 180, silkG: 175, silkB: 170,         // Grey-white silk
      anchorR: 140, anchorG: 135, anchorB: 128    // Thicker anchor strands
    });

    // Stress crack — jagged fracture in stone (cellar/dungeon)
    _genCrack('decor_crack', {
      crackR: 30, crackG: 28, crackB: 25,         // Deep shadow
      edgeR: 80, edgeG: 75, edgeB: 70             // Exposed edge
    });

    // Hanging chain — iron chain loops (foundry/dungeon)
    _genChain('decor_chain', {
      linkR: 75, linkG: 72, linkB: 68,            // Dark iron links
      hiR: 105, hiG: 100, hiB: 95                 // Worn highlight
    });

    // Moss patch — green organic growth on dungeon walls
    _genMoss('decor_moss', {
      baseR: 35, baseG: 65, baseB: 28,            // Dark moss base
      hiR: 50, hiG: 90, hiB: 38,                  // Bright moss highlights
      rootR: 28, rootG: 45, rootB: 20             // Dark root tendrils
    });

    // Water stain — mineral deposit / damp streak down wall
    _genWaterStain('decor_water_stain', {
      stainR: 55, stainG: 60, stainB: 65,         // Blue-grey mineral deposit
      wetR: 40, wetG: 45, wetB: 50,               // Dark wet stone
      dripR: 70, dripG: 75, dripB: 82             // Bright mineral edge
    });

    // Iron hook — wall-mounted utility/meat hook
    _genHook('decor_hook', {
      ironR: 80, ironG: 75, ironB: 70,            // Aged iron
      hiR: 110, hiG: 105, hiB: 98,               // Worn highlight
      plateR: 60, plateG: 55, plateB: 50          // Mounting plate
    });

    // ── A6 textures (torch tiles) ──────────────────────────────────

    // Lit torch wall — stone wall with iron bracket and flame
    _genTorchWall('torch_bracket_lit', {
      stoneR: 90, stoneG: 88, stoneB: 82,       // Same stone as rough
      bracketR: 60, bracketG: 58, bracketB: 55,  // Dark iron
      flameR: 240, flameG: 160, flameB: 40,      // Orange flame
      tipR: 255,   tipG: 240,   tipB: 200,       // White-yellow tip
      embers: true
    });

    // Unlit torch wall — stone wall with charred bracket stub
    _genTorchWall('torch_bracket_unlit', {
      stoneR: 75, stoneG: 72, stoneB: 68,        // Slightly darker (soot)
      bracketR: 45, bracketG: 40, bracketB: 35,   // Sooty iron
      flameR: 30,  flameG: 25,  flameB: 20,       // Charred stub (no flame)
      tipR: 40,    tipG: 35,    tipB: 28,          // Dark ash
      embers: false
    });

    // ── Pier / waterfront wall (Floor 1 south-side buildings) ────
    _genWallPier('wall_pier', {
      plankR: 62, plankG: 48, plankB: 32,       // Salt-weathered dark wood
      gapR:   28, gapG:   22, gapB:   15,       // Dark gaps between boards
      stainR: 50, stainG: 55, stainB: 58,       // Blue-grey salt stain tint
      nailR: 100, nailG:  95, nailB:  88        // Nail head highlights
    });

    // ── A4.5 textures ────────────────────────────────────────────

    // Wooden fence rail — boardwalk railing (Floor 1)
    _genFenceWood('fence_wood', {
      plankR: 75, plankG: 52, plankB: 30,      // Dark stained planks
      postR:  55, postG:  38, postB:  20,       // Darker post verticals
      railR:  90, railG:  65, railB:  38        // Top rail highlight
    });

    // Boardwalk planks — elevated walkway floor texture
    _genFloorBoardwalk('floor_boardwalk', {
      baseR: 95, baseG: 68, baseB: 40,         // Warm weathered wood
      gapR:  35, gapG:  28, gapB:  18,         // Dark gaps between planks
      grainDark: 0.65
    });

    // ── Stoop / Deck short-wall face textures ─────────────────────
    // Very short walls (wallHeight 0.04) show as a thin horizontal band.
    // Texture design emphasises horizontal variation across x; vertical
    // detail gets compressed into a handful of screen pixels.

    // Stoop face — 3 large flagstones echoing the floor_flagstone lid.
    // Big blocks with wide dark mortar so player reads the band as
    // "flagstone edge" aligned with the cap above.
    _genStoopFace('stoop_face_flagstone', {
      baseR: 58, baseG: 52, baseB: 48,          // Warm grey slab (matches floor_flagstone)
      mortarR: 30, mortarG: 26, mortarB: 22,    // Dark mortar joints
      stainR: 48, stainG: 38, stainB: 30,       // Oil/rust stain patches
      variance: 16
    });

    // Deck face — big boards and beams. Horizontal top rail + vertical
    // beams every ~21px with dark gap-fill pockets between.
    _genDeckFace('deck_face_beams', {
      beamR: 85, beamG: 60, beamB: 34,          // Dark beam wood
      boardR: 105, boardG: 75, boardB: 45,      // Brighter top/bottom board
      gapR: 30,   gapG: 22,  gapB: 14,          // Dark gap fill between beams
      grainDark: 0.7
    });

    // Deck lid — larger plank tiles rotated 90° vs floor_wood so that
    // side-by-side boardwalk regions read as different board courses.
    _genFloorDeckPlanks('floor_deck_planks', {
      baseR: 92, baseG: 64, baseB: 38,          // Warm weathered deck wood
      gapR:  32, gapG:  24,  gapB: 14,          // Dark plank gaps
      grainDark: 0.7
    });

    // Bonfire stone ring — low cylindrical wall texture for 0.3× bonfire tile
    _genBonfireRing('bonfire_ring', {
      stoneR: 85, stoneG: 78, stoneB: 68,      // Warm grey river stones
      mortarR: 40, mortarG: 35, mortarB: 28,    // Dark mortar joints
      sootR: 25,  sootG: 20,  sootB: 15,       // Soot staining at top
      glowR: 120, glowG: 50,  glowB: 10        // Inner fire glow at top
    });

    // ── Hazard floor textures ──────────────────────────────────────

    // Trap — stone flags with a recessed iron pressure plate center
    _genFloorTrap('floor_trap', {
      stoneR: 55, stoneG: 52, stoneB: 50,        // Same palette as floor_stone
      plateR: 68, plateG: 70, plateB: 74,         // Dull iron pressure plate
      grooveR: 30, grooveG: 28, grooveB: 26       // Dark groove around plate edge
    });

    // Fire — charred stone with glowing ember cracks
    _genFloorFire('floor_fire', {
      stoneR: 40, stoneG: 32, stoneB: 28,         // Scorched dark stone
      crackR: 180, crackG: 80, crackB: 20,        // Bright ember orange
      ashR: 25,    ashG: 22,   ashB: 20            // Char/ash patches
    });

    // Spikes — stone with iron spike tips poking through a grate
    _genFloorSpikes('floor_spikes', {
      stoneR: 50, stoneG: 48, stoneB: 45,         // Dark stone base
      spikeR: 95, spikeG: 100, spikeB: 105,       // Iron spike tips (bright)
      gapR: 18,   gapG: 15,    gapB: 12            // Dark pit below grate
    });

    // Poison — stone with sickly green toxic pools in the cracks
    _genFloorPoison('floor_poison', {
      stoneR: 48, stoneG: 50, stoneB: 42,         // Greenish-tinted stone
      poolR: 60,  poolG: 140, poolB: 35,          // Toxic green liquid
      bubbleR: 90, bubbleG: 180, bubbleB: 55       // Bright bubble highlights
    });

    // Fungal patch — bioluminescent growth on damp dungeon stone.
    // Clusters of glowing teal-cyan caps on a dark loamy substrate with
    // occasional bright spore highlights. Walkable tile; harvestable via
    // ClickyMinigame (P2 = pluck caps, P3 = depleted substrate).
    _genFloorFungalPatch('floor_fungal_patch', {
      loamR: 30,  loamG: 34, loamB: 28,           // Dark damp loam substrate
      loamHiR: 50, loamHiG: 56, loamHiB: 44,       // Damp loam highlights
      capR: 40,   capG: 150, capB: 140,            // Teal-cyan glowing cap body
      capHiR: 120, capHiG: 240, capHiB: 220,       // Bright cap crown highlight
      sporeR: 180, sporeG: 255, sporeB: 230        // Drifting spore specks
    });

    // Anvil top — dark iron face with hammer-strike wear marks. Used as
    // tileFloorTexture for ANVIL so looking down shows the iron surface.
    _genFloorAnvilTop('floor_anvil_top', {
      ironR: 52, ironG: 52, ironB: 56,               // Dark iron base
      wearR: 72, wearG: 74, wearB: 80,               // Polished wear marks
      scaleR: 35, scaleG: 30, scaleB: 28              // Dark hammer scale
    });

    // Cot top — wrinkled canvas bedroll viewed from above.
    _genFloorCotTop('floor_cot_top', {
      canvasR: 115, canvasG: 108, canvasB: 90,        // Drab canvas
      foldR: 95,  foldG: 88,  foldB: 72,             // Fold shadow creases
      strapR: 70, strapG: 50, strapB: 30              // Leather tie-down straps
    });

    // Bench top — wooden slat seat viewed from above.
    _genFloorBenchTop('floor_bench_top', {
      slatR: 95, slatG: 68, slatB: 40,               // Warm wood slats
      gapR: 22,  gapG: 18,  gapB: 12,                // Dark gaps between slats
      wearR: 80, wearG: 58, wearB: 35                 // Worn centre path
    });

    // Soup cauldron top — dark liquid surface with steam bubbles.
    _genFloorSoupTop('floor_soup_top', {
      brothR: 55, brothG: 35, brothB: 18,             // Dark brown broth
      steamR: 110, steamG: 105, steamB: 95,           // Steam wisps
      bubbleR: 75, bubbleG: 50, bubbleB: 28           // Bubble highlights
    });

    // Well water — dark pool surface viewed from above. Used as the
    // tileFloorTexture for WELL tiles so the player looking over the
    // stone rim sees water, not cobblestone.
    _genFloorWellWater('floor_well_water', {
      deepR: 6,   deepG: 12,  deepB: 25,            // Near-black deep water
      surfR: 12,  surfG: 22,  surfB: 40,             // Slightly lighter surface
      glintR: 35, glintG: 55, glintB: 80             // Rare surface glints
    });

    // Barrel lid — wooden planks with iron rim viewed from above.
    // Used as tileFloorTexture for BARREL so looking over the cask
    // shows a wooden lid, not the floor beneath.
    _genFloorBarrelLid('floor_barrel_lid', {
      staveR: 90, staveG: 62, staveB: 34,            // Oak stave planks
      bandR: 55,  bandG: 53,  bandB: 50,             // Iron rim ring
      centerR: 75, centerG: 50, centerB: 28           // Darker bung centre
    });

    // ── Environmental floor textures ───────────────────────────────

    // Corpse — bloodstained stone with bone fragments
    _genFloorCorpse('floor_corpse', {
      stoneR: 50, stoneG: 45, stoneB: 42,         // Dark stone base
      bloodR: 80, bloodG: 20, bloodB: 15,          // Dark dried blood
      boneR: 160, boneG: 150, boneB: 130           // Pale bone fragments
    });

    // Detritus — scattered adventurer debris on dungeon stone
    _genFloorDetritus('floor_detritus', {
      stoneR: 55, stoneG: 52, stoneB: 50,          // Standard dungeon stone
      gearR: 85, gearG: 80, gearB: 70,             // Dull metal scraps
      clothR: 75, clothG: 50, clothB: 35            // Torn leather/cloth
    });

    // Puzzle — stone with etched grid lines (sliding tile panel)
    _genFloorPuzzle('floor_puzzle', {
      stoneR: 65, stoneG: 63, stoneB: 60,          // Smooth worked stone
      lineR: 90, lineG: 85, lineB: 75,             // Carved groove highlights
      glyphR: 50, glyphG: 55, glyphB: 70            // Blue-tinted arcane runes
    });

    // ── Dungeon variety floor textures ─────────────────────────────

    // Mossy stone — catacomb/cellar stone with green organic patches
    _genFloorStoneMossy('floor_stone_mossy', {
      baseR: 52, baseG: 50, baseB: 48,              // Dark stone base
      mossR: 40, mossG: 72, mossB: 30,              // Dark moss patches
      mossHiR: 55, mossHiG: 95, mossHiB: 40,        // Moss highlights
      variance: 10
    });

    // Cracked stone — worn/damaged stone flags for deeper dungeon levels
    _genFloorStoneCracked('floor_stone_cracked', {
      baseR: 50, baseG: 48, baseB: 45,              // Weathered dark stone
      crackR: 25, crackG: 22, crackB: 20,           // Deep crack shadows
      edgeR: 70, edgeG: 65, edgeB: 60,              // Exposed crack edges
      variance: 14
    });

    // Flagstone — large irregular slabs for foundry/industrial dungeons
    _genFloorFlagstone('floor_flagstone', {
      baseR: 58, baseG: 52, baseB: 48,              // Warm grey slab
      mortarR: 30, mortarG: 26, mortarB: 22,         // Dark mortar joints
      stainR: 48, stainG: 38, stainB: 30,           // Oil/rust stain patches
      variance: 16
    });

    // ── Living infrastructure wall textures ────────────────────────

    // Well — circular stone rim (0.5× short wall)
    _genWellStone('well_stone', {
      stoneR: 100, stoneG: 95, stoneB: 88,         // Light grey rim stones
      mortarR: 50, mortarG: 45, mortarB: 38,        // Dark mortar joints
      waterR: 12,  waterG: 20, waterB: 35           // Dark water at centre
    });

    // Bench — wooden slat seat on frame (0.35× short wall)
    _genBench('bench_wood', {
      slatR: 100, slatG: 72, slatB: 42,            // Warm wood slats
      frameR: 65, frameG: 45, frameB: 25,           // Dark wood frame
      gapR: 28,   gapG: 22,  gapB: 15              // Gaps between slats
    });

    // Notice board — wooden posts with pinned parchment (1.2× tall)
    _genNoticeBoard('notice_board_wood', {
      postR: 70, postG: 50, postB: 30,             // Dark wood uprights
      boardR: 90, boardG: 65, boardB: 38,          // Board backing
      paperR: 190, paperG: 180, paperB: 155,       // Parchment notes
      pinR: 160, pinG: 40, pinB: 30                // Red pushpin dots
    });

    // Anvil — dark iron block on stone pedestal (0.5× short wall)
    _genAnvil('anvil_iron', {
      ironR: 55, ironG: 55, ironB: 60,             // Dark iron body
      hiR: 85,   hiG: 88,  hiB: 95,               // Worn edge highlight
      baseR: 70, baseG: 65, baseB: 58              // Stone pedestal
    });

    // Barrel — banded oak (0.6× short wall)
    _genBarrel('barrel_wood', {
      staveR: 95, staveG: 65, staveB: 35,          // Oak stave wood
      bandR: 60,  bandG: 58, bandB: 55,            // Iron hoops
      topR: 110,  topG: 78, topB: 45               // Lighter lid
    });

    // Soup cauldron — iron pot on brazier frame (0.7× short wall)
    _genSoupCauldron('soup_cauldron', {
      potR: 45, potG: 42, potB: 40,                // Cast iron pot
      rimR: 75, rimG: 72, rimB: 68,                // Pot rim highlight
      brazR: 55, brazG: 35, brazB: 20,             // Brazier legs
      steamR: 140, steamG: 135, steamB: 125        // Steam wisps at top
    });

    // Cot — canvas bedroll on low frame (0.3× short wall)
    _genCot('cot_canvas', {
      canvasR: 120, canvasG: 115, canvasB: 95,     // Drab canvas bedroll
      frameR: 60,   frameG: 42,  frameB: 25,       // Dark wood frame
      foldR: 100,   foldG: 95,  foldB: 78          // Fold shadow lines
    });

    // ── Retrofuture infrastructure textures ────────────────────────

    // Charging cradle — metal frame with glowing conduit cables (0.8×)
    _genChargingCradle('charging_cradle', {
      frameR: 65, frameG: 68, frameB: 72,          // Brushed steel frame
      conduitR: 40, conduitG: 120, conduitB: 180,  // Blue energy conduit
      glowR: 80, glowG: 160, glowB: 220            // Bright conduit glow
    });

    // Switchboard — brass toggle panel with indicator lights (1.0×)
    _genSwitchboard('switchboard_panel', {
      panelR: 55, panelG: 50, panelB: 42,          // Dark wood backing panel
      brassR: 140, brassG: 120, brassB: 55,        // Brass toggle switches
      lightR: 180, lightG: 50, lightB: 30,         // Red indicator light
      lightGR: 50, lightGG: 160, lightGB: 60       // Green indicator light
    });

    // ── Creature verb-node wall textures (DOC-115 §2b) ─────────────
    // Three wall-like tiles that anchor creature behavior on dungeon
    // floors. Mirror existing infrastructure generators for tonal
    // consistency — _genCot for NEST (low mound), _genChargingCradle
    // for DEN (frame + dark cavity) and ENERGY_CONDUIT (frame + glow).

    // Nest — chunky woven debris pile, ground-level (0.3× short wall)
    _genNestDebris('nest_debris', {
      debrisR: 110, debrisG: 85,  debrisB: 50,     // Mid tan woven sticks
      shadowR: 55,  shadowG: 38,  shadowB: 22,     // Dark brown shadow bands
      boneR:   195, boneG:   180, boneB:   150,    // Off-white bone chips
      earthR:  65,  earthG:  50,  earthB:  35      // Dark earth base ring
    });

    // Den — hollowed alcove in cave wall (0.5× short wall)
    _genDenAlcove('den_alcove', {
      stoneR:  100, stoneG: 95,  stoneB: 88,        // Med grey arch stones
      mortarR: 50,  mortarG: 45, mortarB: 38,        // Dark mortar joints
      voidR:   12,  voidG:   14, voidB:   18        // Near-black cavity
    });

    // Energy conduit — retrofuturistic pipe junction (0.8× tall wall)
    _genEnergyConduit('energy_conduit', {
      brassR:  130, brassG: 95,  brassB: 45,        // Worn brass frame
      brassHiR: 175, brassHiG: 140, brassHiB: 70,   // Brass edge highlight
      rivetR:  85,  rivetG:  70,  rivetB:  40,      // Darker rivet cap
      darkR:   28,  darkG:   30,  darkB:   36,      // Dark interior cavity
      glowR:   60,  glowG:   180, glowB:   220,     // Cyan energy glow
      glowHiR: 210, glowHiG: 240, glowHiB: 255      // Bright spark core
    });

    // Creature verb-node FLOOR textures (DOC-115 §2a — walkable, 0.0× wall).
    // Both sit on a standard flagstone base to blend visually with
    // floor_stone on neighbouring tiles.

    // Roost shadow — circular cast-down shadow from an overhead hook,
    // with a chain-link pattern radiating from center.
    _genRoostShadow('roost_shadow', {
      stoneR:  82,  stoneG:  80,  stoneB:  74,       // Dungeon floor stone
      shadowR: 22,  shadowG: 20,  shadowB: 18,       // Near-black pool shadow
      chainR:  45,  chainG:  42,  chainB:  38        // Iron chain-link tint
    });

    // Territorial mark — three diagonal claw gouges with scorched edges
    // and displaced stone chips along the rim.
    _genTerritorialMark('territorial_mark', {
      stoneR:  82,  stoneG:  80,  stoneB:  74,       // Dungeon floor stone
      gougeR:  18,  gougeG:  16,  gougeB:  14,       // Deep cut / scorch core
      chipR:   180, chipG:   172, chipB:   155       // Displaced stone chip
    });
  }

  // ── Texture generators ─────────────────────────────────────────

  /**
   * Create an offscreen canvas + ImageData, run a pixel callback, store result.
   */
  function _createTexture(id, w, h, pixelFn) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(w, h);
    var d = imgData.data;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var c = pixelFn(x, y, w, h);
        d[idx]     = c.r;
        d[idx + 1] = c.g;
        d[idx + 2] = c.b;
        d[idx + 3] = c.a !== undefined ? c.a : 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    _textures[id] = { width: w, height: h, canvas: canvas, data: d };
  }

  /** Simple seeded-ish hash for deterministic noise. */
  function _hash(x, y) {
    var n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff; // 0..1
  }

  function _clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  // ── Brick ──

  function _genBrick(id, p) {
    // Chunky pixel-art brick — fat bricks, thick mortar, strong per-brick
    // colour, 3-tier edge shading, minimal per-pixel noise.
    var brickH  = 10;  // taller bricks (was 8)
    var brickW  = 16;  // same width
    var mortarW = 2;   // thick mortar (was 1)

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var row = Math.floor(y / brickH);
      var localY = y % brickH;
      var offsetX = (row % 2 === 1) ? Math.floor(brickW / 2) : 0;
      var localX = (x + offsetX) % brickW;

      // Thick mortar lines
      if (localY < mortarW || localX < mortarW) {
        var mn = (_hash(x + 100, y + 200) - 0.5) * 4;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn)
        };
      }

      // Per-brick colour (strong variation like shrub clusters)
      var brickId = row * 6 + Math.floor((x + offsetX) / brickW);
      var brickTone = (_hash(brickId, row) - 0.5) * p.variance * 2.5;
      // 3-tier shading: dark edges → mid → light center
      var edgeDist = Math.min(localX - mortarW, brickW - mortarW - 1 - localX,
                              localY - mortarW, brickH - mortarW - 1 - localY);
      var tier = edgeDist < 2 ? 0.82 : (edgeDist > 4 ? 1.1 : 1.0);
      // Minimal per-pixel noise (was 8)
      var pn = (_hash(x, y) - 0.5) * 3;

      return {
        r: _clamp((p.faceR + brickTone) * tier + pn),
        g: _clamp((p.faceG + brickTone) * tier + pn * 0.8),
        b: _clamp((p.faceB + brickTone) * tier + pn * 0.6)
      };
    });
  }

  // ── Stone ──

  function _genStone(id, p) {
    // Chunky pixel-art stone — large irregular blocks, thick mortar,
    // strong per-block colour, minimal per-pixel noise (shrub style).
    var blockW = 16;  // wider blocks (was 12)
    var blockH = 12;  // taller blocks (was 10)
    var mortarW = 2;  // thick mortar (was 1)

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var row = Math.floor(y / blockH);
      var localY = y % blockH;
      var ox = (row % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var adjX = (x + ox) % blockW;
      var localX = adjX;

      // Thick mortar seams
      if (localX < mortarW || localY < mortarW) {
        var mn = (_hash(x + 300, y + 400) - 0.5) * 4;
        return {
          r: _clamp(p.baseR * 0.45 + mn),
          g: _clamp(p.baseG * 0.45 + mn),
          b: _clamp(p.baseB * 0.45 + mn)
        };
      }

      // Per-block colour (strong variation, shrub cluster style)
      var blockId = row * 6 + Math.floor((x + ox) / blockW);
      var blockTone = (_hash(blockId, row + 50) - 0.5) * p.variance * 2.5;
      // 3-tier shading: shadow edge, mid, highlight center
      var edgeDist = Math.min(localX - mortarW, blockW - mortarW - 1 - localX,
                              localY - mortarW, blockH - mortarW - 1 - localY);
      var tier = edgeDist < 2 ? 0.8 : (edgeDist > 4 ? 1.1 : 1.0);
      // Minimal per-pixel noise (toned down from 10 → 3)
      var pn = (_hash(x + 300, y + 400) - 0.5) * 3;

      return {
        r: _clamp((p.baseR + blockTone) * tier + pn),
        g: _clamp((p.baseG + blockTone) * tier + pn * 0.9),
        b: _clamp((p.baseB + blockTone) * tier + pn * 0.8)
      };
    });
  }

  // ── Wood ──

  function _genWood(id, p) {
    // Chunky pixel-art wood — wide plank bands, per-plank colour shift,
    // dark grain as full-width stripes, minimal per-pixel noise.
    var plankW = 10;  // wide vertical planks (was sine wave)
    var grainH = 4;   // horizontal grain band height

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Plank boundaries (vertical dark lines between planks)
      var plankIdx = Math.floor(x / plankW);
      var localX   = x % plankW;
      if (localX < 1) {
        return {
          r: _clamp(p.baseR * p.grainDark * 0.7),
          g: _clamp(p.baseG * p.grainDark * 0.7),
          b: _clamp(p.baseB * p.grainDark * 0.7)
        };
      }

      // Per-plank base colour (strong shift like shrub clusters)
      var plankTone = (_hash(plankIdx, 600) - 0.5) * 18;
      // Horizontal grain bands — alternating dark/light stripes
      var grainBand = Math.floor(y / grainH);
      var grainDark = (_hash(plankIdx + 50, grainBand + 70) > 0.6) ? p.grainDark : 1.0;
      // Knot — rare chunky dark spot (per-plank, one per 16px height zone)
      var knotZone = _hash(plankIdx + 700, Math.floor(y / 16) + 710);
      var knotDarken = (knotZone > 0.92 && localX > 2 && localX < plankW - 2) ? -15 : 0;
      // Minimal per-pixel noise (was 10)
      var pn = (_hash(x + 500, y + 600) - 0.5) * 3;

      return {
        r: _clamp((p.baseR + plankTone) * grainDark + pn + knotDarken),
        g: _clamp((p.baseG + plankTone) * grainDark + pn * 0.7 + knotDarken),
        b: _clamp((p.baseB + plankTone) * grainDark + pn * 0.4 + knotDarken)
      };
    });
  }

  // ── Bookshelf (dark wood frame + coloured book spines) ──

  function _genBookshelf(id, p) {
    // HD-Minecraft pixel art bookshelf: 3 horizontal shelf rows,
    // each row filled with chunky coloured book spines. Frame is
    // dark wood. Shelves are horizontal lines. Books are vertical
    // stripes with per-spine colour variation.
    //
    // Layout (64px tall):
    //   rows 0–2:   top frame
    //   rows 3–19:  shelf A (books)
    //   rows 20–21: shelf bar
    //   rows 22–39: shelf B (books)
    //   rows 40–41: shelf bar
    //   rows 42–59: shelf C (books)
    //   rows 60–63: bottom frame

    var SHELF_ROWS = [
      { top: 3,  bot: 19 },
      { top: 22, bot: 39 },
      { top: 42, bot: 59 }
    ];
    var SHELF_BARS = [[20, 21], [40, 41]];
    var FRAME_TOP = 2;
    var FRAME_BOT = 60;

    // Book spine colour palette (earthy + jewel tones)
    var SPINE_COLORS = [
      { r: 140, g: 45,  b: 40  },  // deep red
      { r: 45,  g: 80,  b: 130 },  // navy blue
      { r: 55,  g: 110, b: 55  },  // forest green
      { r: 130, g: 100, b: 45  },  // tan/gold
      { r: 100, g: 55,  b: 110 },  // plum
      { r: 90,  g: 70,  b: 50  },  // brown leather
      { r: 120, g: 80,  b: 45  },  // amber
      { r: 60,  g: 60,  b: 80  }   // slate
    ];

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // ── Frame (top / bottom) ──
      if (y <= FRAME_TOP || y >= FRAME_BOT) {
        var fn = (_hash(x + 200, y + 300) - 0.5) * 4;
        return {
          r: _clamp(p.frameR + fn),
          g: _clamp(p.frameG + fn),
          b: _clamp(p.frameB + fn)
        };
      }

      // ── Shelf bars (horizontal dividers) ──
      for (var sb = 0; sb < SHELF_BARS.length; sb++) {
        if (y >= SHELF_BARS[sb][0] && y <= SHELF_BARS[sb][1]) {
          var sn = (_hash(x + 800, y + 900) - 0.5) * 3;
          return {
            r: _clamp(p.shelfR + sn + 8),
            g: _clamp(p.shelfG + sn + 5),
            b: _clamp(p.shelfB + sn + 3)
          };
        }
      }

      // ── Left/right frame edges ──
      if (x <= 1 || x >= TEX_SIZE - 2) {
        var en = (_hash(x + 400, y + 500) - 0.5) * 3;
        return {
          r: _clamp(p.frameR + en),
          g: _clamp(p.frameG + en),
          b: _clamp(p.frameB + en)
        };
      }

      // ── Book spines ──
      // Each spine is 3–5 px wide; colour seeded by shelf row + x position
      var shelfIdx = -1;
      for (var sr = 0; sr < SHELF_ROWS.length; sr++) {
        if (y >= SHELF_ROWS[sr].top && y <= SHELF_ROWS[sr].bot) {
          shelfIdx = sr;
          break;
        }
      }
      if (shelfIdx < 0) {
        // Between-shelf gap (shouldn't happen but safety)
        return { r: p.frameR, g: p.frameG, b: p.frameB };
      }

      // Spine width varies 3–5px, seeded per column position
      var spineW = 3 + Math.floor(_hash(x + 100, shelfIdx + 200) * 3);
      var spineIdx = Math.floor((x - 2) / spineW);

      // Gaps between spines (dark shadow line)
      var localX = (x - 2) % spineW;
      if (localX === 0) {
        return {
          r: _clamp(p.shelfR - 5),
          g: _clamp(p.shelfG - 5),
          b: _clamp(p.shelfB - 3)
        };
      }

      // Pick spine colour from palette
      var cIdx = Math.floor(_hash(spineIdx + 50, shelfIdx * 7 + 300) * SPINE_COLORS.length);
      var sc = SPINE_COLORS[cIdx];

      // Per-pixel noise for texture
      var pn = (_hash(x + 700, y + 800) - 0.5) * 6;

      // Spine top highlight (first 2 rows of each spine section)
      var shelfY = y - SHELF_ROWS[shelfIdx].top;
      var highlight = (shelfY <= 1) ? 15 : 0;
      // Spine bottom shadow (last row)
      var shadow = (shelfY >= SHELF_ROWS[shelfIdx].bot - SHELF_ROWS[shelfIdx].top - 1) ? -12 : 0;

      return {
        r: _clamp(sc.r + pn + highlight + shadow),
        g: _clamp(sc.g + pn + highlight + shadow),
        b: _clamp(sc.b + pn * 0.7 + highlight + shadow)
      };
    });
  }

  // ── Door (wood with horizontal bands) ──

  function _genDoorWood(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // ── Archway geometry ──
      // Rounded arch top, rectangular opening below.
      // Frame is 4px thick stone surround.
      var frameW = 5;       // Stone frame thickness
      var archInnerL = 8;   // Left edge of opening
      var archInnerR = S - 8; // Right edge of opening
      var archTopY = 10;    // Top of arch peak
      var archBottomY = S;  // Opening extends to floor

      // Arch curve: semicircle across the opening width
      var archCx = cx;
      var archRadius = (archInnerR - archInnerL) / 2;
      var archCenterY = archTopY + archRadius;

      // Check if pixel is inside the arch opening
      var inOpening = false;
      if (y >= archCenterY && x > archInnerL && x < archInnerR) {
        // Below arch center — rectangular opening
        inOpening = true;
      } else if (y < archCenterY && y >= archTopY) {
        // In arch curve zone — check circle
        var dx = x - archCx;
        var dy = y - archCenterY;
        if (dx * dx + dy * dy < archRadius * archRadius) {
          inOpening = true;
        }
      }

      // ── Porthole interior ──────────────────────────────────
      // The dark space inside the door archway. OoT Lost Woods style
      // portal with directional depth gradient and dust particles.
      //   'flat' (default) — twinkly/dusty flat black (Wile E. Coyote tunnel)
      //   'desc'           — gradient brightening at top, deepens to black at bottom
      //   'asc'            — gradient dark at top, brightens to white at bottom
      if (inOpening) {
        var depthT = (y - archTopY) / (S - archTopY);    // 0=top → 1=bottom
        var gn = _hash(x + 800, y + 900) * 6 - 3;
        var phType = p.porthole || 'flat';

        // Radial vignette from center of opening
        var nx = (x - cx) / ((archInnerR - archInnerL) / 2);
        var ny = (depthT - 0.5) * 2;
        var vig = Math.min(1, Math.sqrt(nx * nx + ny * ny) * 0.7);

        var rv, gv, bv;
        if (phType === 'desc') {
          // Descending: brighter at top → deep black at bottom
          var dGrad = (1 - depthT) * 0.35;
          var dBase = dGrad * 100 * (1 - vig * 0.6) + gn;
          rv = _clamp(dBase);
          gv = _clamp(dBase * 0.9);
          bv = _clamp(dBase * 0.8);
        } else if (phType === 'asc') {
          // Ascending: dark at top → brighter at bottom
          var aGrad = depthT * 0.4;
          var aBase = aGrad * 130 * (1 - vig * 0.5) + gn;
          rv = _clamp(aBase * 1.05);
          gv = _clamp(aBase);
          bv = _clamp(aBase * 0.85);
        } else {
          // Flat: deep black void with subtle warm center glow
          var centerGlow = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny) * 1.3) * 10;
          rv = _clamp(8 + centerGlow + gn);
          gv = _clamp(7 + centerGlow * 0.6 + gn * 0.8);
          bv = _clamp(6 + centerGlow * 0.3 + gn * 0.5);
        }

        // Twinkle / dust particles — sparse bright specks
        var sparkHash = _hash(x * 7 + 1234, y * 13 + 5678);
        if (sparkHash > 0.94) {
          var sparkBright = (sparkHash - 0.94) * 600;  // 0..36
          rv = _clamp(rv + sparkBright);
          gv = _clamp(gv + sparkBright);
          bv = _clamp(bv + sparkBright * 0.8);
        }

        return { r: rv, g: gv, b: bv };
      }

      // ── Stone frame surround ──
      // Everything outside the opening is stone/brick frame
      var edgeDist = Math.min(x, S - 1 - x, y);
      if (edgeDist < frameW) {
        // Keystone at arch apex
        var isKeystone = (y < archTopY + 6) && Math.abs(x - cx) < 5;
        if (isKeystone) {
          var kn = _hash(x + 850, y + 850) * 6;
          return {
            r: _clamp(p.bandR + 20 + kn),
            g: _clamp(p.bandG + 15 + kn),
            b: _clamp(p.bandB + 10 + kn)
          };
        }

        var fn = _hash(x + 700, y + 750) * 10 - 5;
        return {
          r: _clamp(p.bandR + fn),
          g: _clamp(p.bandG + fn),
          b: _clamp(p.bandB + fn)
        };
      }

      // ── Brick/stone wall fill (around the arch) ──
      var bRow = Math.floor(y / 8);
      var bOx = (bRow % 2 === 1) ? 8 : 0;
      var bLocalX = (x + bOx) % 16;
      var bLocalY = y % 8;

      // Mortar lines
      if (bLocalX < 1 || bLocalY < 1) {
        var mn = _hash(x + 760, y + 770) * 6 - 3;
        return {
          r: _clamp(p.bandR * 0.7 + mn),
          g: _clamp(p.bandG * 0.7 + mn),
          b: _clamp(p.bandB * 0.7 + mn)
        };
      }

      // Brick face
      var brickId = bRow * 5 + Math.floor((x + bOx) / 16);
      var bn = (_hash(brickId, bRow + 20) - 0.5) * 15;
      var pn = (_hash(x + 800, y + 900) - 0.5) * 8;

      return {
        r: _clamp(p.baseR * 0.85 + bn + pn),
        g: _clamp(p.baseG * 0.85 + bn * 0.8 + pn * 0.7),
        b: _clamp(p.baseB * 0.85 + bn * 0.6 + pn * 0.4)
      };
    });
  }

  // ── Door panel (cavity content for DOOR_FACADE) ──
  // Vertical wood planks with handle, hinges, and optional studs/glass.
  // This texture fills the door OPENING (the cavity), not the archway
  // surround. 64×64, no arch shape — just the rectangular door face.

  function _genDoorPanel(id, p) {
    var plankW   = p.plankW || 10;
    var grainH   = 4;
    var grainDk  = p.grainDark || 0.7;
    var S        = TEX_SIZE;
    var frameT   = 2;        // thin frame border (top/bottom/sides)

    _createTexture(id, S, S, function (x, y) {
      // ── Outer frame (dark trim around door edge) ──
      if (x < frameT || x >= S - frameT || y < frameT || y >= S - frameT) {
        var fn = _hash(x + 300, y + 310) * 4 - 2;
        return {
          r: _clamp(p.hingeR * 0.7 + fn),
          g: _clamp(p.hingeG * 0.7 + fn),
          b: _clamp(p.hingeB * 0.7 + fn)
        };
      }

      // ── Iron plate variant ──
      if (p.ironPlate) {
        var ipn = (_hash(x + 200, y + 210) - 0.5) * 8;
        // Horizontal rivet rows every 12px
        var rivetRow = (y % 12 < 2) && (x % 8 > 2 && x % 8 < 6);
        if (rivetRow) {
          return {
            r: _clamp(p.handleR + ipn),
            g: _clamp(p.handleG + ipn),
            b: _clamp(p.handleB + ipn)
          };
        }
        // Horizontal seam every 16px
        if (y % 16 < 1) {
          return {
            r: _clamp(p.baseR * 0.6 + ipn),
            g: _clamp(p.baseG * 0.6 + ipn),
            b: _clamp(p.baseB * 0.6 + ipn)
          };
        }
        return {
          r: _clamp(p.baseR + ipn),
          g: _clamp(p.baseG + ipn),
          b: _clamp(p.baseB + ipn)
        };
      }

      // ── Glass insert variant (upper half) ──
      if (p.glassInsert && y > 6 && y < S * 0.45 && x > 10 && x < S - 10) {
        // Frosted glass with slight amber tint
        var gn = (_hash(x + 400, y + 410) - 0.5) * 10;
        var glassBase = 50 + gn;
        return {
          r: _clamp(glassBase + 15),
          g: _clamp(glassBase + 12),
          b: _clamp(glassBase + 5)
        };
      }

      // ── Vertical wood planks ──
      var plankIdx = Math.floor((x - frameT) / plankW);
      var localX   = (x - frameT) % plankW;

      // Plank boundary (dark vertical line)
      if (localX < 1) {
        return {
          r: _clamp(p.baseR * grainDk * 0.65),
          g: _clamp(p.baseG * grainDk * 0.65),
          b: _clamp(p.baseB * grainDk * 0.65)
        };
      }

      // Per-plank colour shift
      var plankTone = (_hash(plankIdx + 100, 500) - 0.5) * 16;
      // Horizontal grain bands
      var grainBand = Math.floor(y / grainH);
      var grainDarken = (_hash(plankIdx + 50, grainBand + 70) > 0.6) ? grainDk : 1.0;
      // Knot (rare dark spot)
      var knotZone = _hash(plankIdx + 700, Math.floor(y / 16) + 710);
      var knotDark = (knotZone > 0.92 && localX > 2 && localX < plankW - 2) ? -12 : 0;
      // Per-pixel noise
      var pn = (_hash(x + 500, y + 600) - 0.5) * 4;

      var r = (p.baseR + plankTone) * grainDarken + pn + knotDark;
      var g = (p.baseG + plankTone) * grainDarken + pn * 0.7 + knotDark;
      var b = (p.baseB + plankTone) * grainDarken + pn * 0.4 + knotDark;

      // ── Horizontal iron bands (ironbound variant) ──
      // 3 thick iron straps across the door face at 25%, 50%, 75% height.
      // Each strap is 3px tall with a highlight line on the top edge and
      // nail heads at the plank boundaries. Creates the fortress gate look
      // for cathedral/stone buildings.
      if (p.ironBands) {
        var bandPositions = [Math.floor(S * 0.25), Math.floor(S * 0.50), Math.floor(S * 0.72)];
        for (var _bi = 0; _bi < bandPositions.length; _bi++) {
          var bandY = bandPositions[_bi];
          if (y >= bandY && y < bandY + 3) {
            var ibn = (_hash(x + 250, y + 260) - 0.5) * 6;
            var bandShade = (y === bandY) ? 1.15 : 0.90; // top highlight
            // Nail heads at plank boundaries
            if (localX >= 0 && localX < 2 && y === bandY + 1) {
              return {
                r: _clamp(p.hingeR + 25 + ibn),
                g: _clamp(p.hingeG + 25 + ibn),
                b: _clamp(p.hingeB + 25 + ibn)
              };
            }
            return {
              r: _clamp(p.hingeR * bandShade + ibn),
              g: _clamp(p.hingeG * bandShade + ibn),
              b: _clamp(p.hingeB * bandShade + ibn)
            };
          }
        }
      }

      // ── Iron studs (studded variant) ──
      if (p.studs) {
        // 3×3 px studs in a grid pattern every 8px
        var sx = x % 8;
        var sy = y % 8;
        if (sx >= 3 && sx <= 5 && sy >= 3 && sy <= 5) {
          var sn = _hash(x + 150, y + 160) * 6;
          return {
            r: _clamp(p.hingeR + 20 + sn),
            g: _clamp(p.hingeG + 20 + sn),
            b: _clamp(p.hingeB + 20 + sn)
          };
        }
      }

      // ── Handle (brass/iron rectangle at ~55% height, right of center) ──
      var handleX = Math.floor(S * 0.62);
      var handleY = Math.floor(S * 0.52);
      if (x >= handleX - 2 && x <= handleX + 2 &&
          y >= handleY - 4 && y <= handleY + 4) {
        var hn = _hash(x + 900, y + 910) * 6;
        return {
          r: _clamp(p.handleR + hn),
          g: _clamp(p.handleG + hn),
          b: _clamp(p.handleB + hn)
        };
      }

      // ── Hinges (dark rectangles at top/bottom, left edge) ──
      var hingeX = frameT + 1;
      var hingeW = 4;
      var hingeTopY = Math.floor(S * 0.15);
      var hingeBotY = Math.floor(S * 0.80);
      var hingeH = 3;
      var isHinge = (x >= hingeX && x < hingeX + hingeW) &&
        ((y >= hingeTopY && y < hingeTopY + hingeH) ||
         (y >= hingeBotY && y < hingeBotY + hingeH));
      if (isHinge) {
        var ihn = _hash(x + 800, y + 810) * 4;
        return {
          r: _clamp(p.hingeR + ihn),
          g: _clamp(p.hingeG + ihn),
          b: _clamp(p.hingeB + ihn)
        };
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Double-door panel (128×64): two leaves with center seam ─────
  // Phase 6A — used for boss gates and grand entrances that span two
  // adjacent DOOR_FACADE tiles. The gap filler UV-splits this texture:
  // left tile samples columns 0–63, right tile samples columns 64–127.
  //
  // Reuses _genDoorPanel's plank/grain/hinge/stud logic on each leaf,
  // mirrored around the center seam. Handle position, hinge position,
  // and iron bands all respect the half-width coordinate space.

  var WIDE_TEX_W = 128;

  function _genDoubleDoorPanel(id, p) {
    var halfW    = WIDE_TEX_W / 2;   // 64 — each leaf
    var S        = TEX_SIZE;          // 64 — height
    var plankW   = p.plankW || 10;
    var grainH   = 4;
    var grainDk  = p.grainDark || 0.7;
    var frameT   = 2;
    var seamW    = 2;                 // center seam width (1px per leaf)

    _createTexture(id, WIDE_TEX_W, S, function (x, y) {
      // ── Which leaf? ──
      var leaf   = (x < halfW) ? 0 : 1; // 0=left, 1=right
      var lx     = (leaf === 0) ? x : (WIDE_TEX_W - 1 - x); // mirror right leaf

      // ── Outer frame (top/bottom/far-side edges) ──
      var isOuterFrame = (y < frameT || y >= S - frameT);
      // Left leaf: frame on left edge only. Right leaf: frame on right edge only.
      if (leaf === 0 && lx < frameT) isOuterFrame = true;
      if (leaf === 1 && lx < frameT) isOuterFrame = true; // (mirrored: lx < frameT = right edge)

      if (isOuterFrame) {
        var fn = _hash(x + 300, y + 310) * 4 - 2;
        return {
          r: _clamp(p.hingeR * 0.7 + fn),
          g: _clamp(p.hingeG * 0.7 + fn),
          b: _clamp(p.hingeB * 0.7 + fn)
        };
      }

      // ── Center seam (dark line where leaves meet) ──
      if (x >= halfW - seamW && x < halfW + seamW) {
        var sn = _hash(x + 700, y + 710) * 3 - 1;
        return {
          r: _clamp(p.hingeR * 0.45 + sn),
          g: _clamp(p.hingeG * 0.45 + sn),
          b: _clamp(p.hingeB * 0.45 + sn)
        };
      }

      // ── Iron plate variant ──
      if (p.ironPlate) {
        var ipn = (_hash(x + 200, y + 210) - 0.5) * 8;
        var rivetRow = (y % 12 < 2) && (lx % 8 > 2 && lx % 8 < 6);
        if (rivetRow) {
          return {
            r: _clamp(p.handleR + ipn),
            g: _clamp(p.handleG + ipn),
            b: _clamp(p.handleB + ipn)
          };
        }
        if (y % 16 < 1) {
          return {
            r: _clamp(p.baseR * 0.6 + ipn),
            g: _clamp(p.baseG * 0.6 + ipn),
            b: _clamp(p.baseB * 0.6 + ipn)
          };
        }
        return {
          r: _clamp(p.baseR + ipn),
          g: _clamp(p.baseG + ipn),
          b: _clamp(p.baseB + ipn)
        };
      }

      // ── Vertical wood planks (per-leaf coordinate) ──
      var plankIdx = Math.floor((lx - frameT) / plankW) + leaf * 100;
      var localX   = (lx - frameT) % plankW;
      if (localX < 1) {
        return {
          r: _clamp(p.baseR * grainDk * 0.65),
          g: _clamp(p.baseG * grainDk * 0.65),
          b: _clamp(p.baseB * grainDk * 0.65)
        };
      }
      var plankTone  = (_hash(plankIdx + 100, 500) - 0.5) * 16;
      var grainBand  = Math.floor(y / grainH);
      var grainDarken = (_hash(plankIdx + 50, grainBand + 70) > 0.6) ? grainDk : 1.0;
      var knotZone   = _hash(plankIdx + 700, Math.floor(y / 16) + 710);
      var knotDark   = (knotZone > 0.92 && localX > 2 && localX < plankW - 2) ? -12 : 0;
      var pn         = (_hash(x + 500, y + 600) - 0.5) * 4;

      var r = (p.baseR + plankTone) * grainDarken + pn + knotDark;
      var g = (p.baseG + plankTone) * grainDarken + pn * 0.7 + knotDark;
      var b = (p.baseB + plankTone) * grainDarken + pn * 0.4 + knotDark;

      // ── Iron bands (ironbound variant) ──
      if (p.ironBands) {
        var bandPositions = [Math.floor(S * 0.25), Math.floor(S * 0.50), Math.floor(S * 0.72)];
        for (var _bi = 0; _bi < bandPositions.length; _bi++) {
          var bandY = bandPositions[_bi];
          if (y >= bandY && y < bandY + 3) {
            var ibn = (_hash(x + 250, y + 260) - 0.5) * 6;
            var bandShade = (y === bandY) ? 1.15 : 0.90;
            if (localX >= 0 && localX < 2 && y === bandY + 1) {
              return {
                r: _clamp(p.hingeR + 25 + ibn),
                g: _clamp(p.hingeG + 25 + ibn),
                b: _clamp(p.hingeB + 25 + ibn)
              };
            }
            return {
              r: _clamp(p.hingeR * bandShade + ibn),
              g: _clamp(p.hingeG * bandShade + ibn),
              b: _clamp(p.hingeB * bandShade + ibn)
            };
          }
        }
      }

      // ── Handle (each leaf gets its own, mirrored) ──
      // Left leaf handle at ~38% from left edge, right leaf mirrors
      var handleLx = Math.floor(halfW * 0.62);
      var handleY  = Math.floor(S * 0.52);
      if (lx >= handleLx - 2 && lx <= handleLx + 2 &&
          y >= handleY - 4 && y <= handleY + 4) {
        var hn = _hash(x + 900, y + 910) * 6;
        return {
          r: _clamp(p.handleR + hn),
          g: _clamp(p.handleG + hn),
          b: _clamp(p.handleB + hn)
        };
      }

      // ── Hinges (far edge of each leaf, mirrored) ──
      var hingeX   = frameT + 1;
      var hingeW   = 4;
      var hingeTopY = Math.floor(S * 0.15);
      var hingeBotY = Math.floor(S * 0.80);
      var hingeH    = 3;
      var isHinge = (lx >= hingeX && lx < hingeX + hingeW) &&
        ((y >= hingeTopY && y < hingeTopY + hingeH) ||
         (y >= hingeBotY && y < hingeBotY + hingeH));
      if (isHinge) {
        var ihn = _hash(x + 800, y + 810) * 4;
        return {
          r: _clamp(p.hingeR + ihn),
          g: _clamp(p.hingeG + ihn),
          b: _clamp(p.hingeB + ihn)
        };
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Wide arch texture (Phase 6B: paired ARCH_DOORWAY) ────────────
  // 128×64 texture with a single parabolic arch opening centred across
  // the full width. The opening region returns α=0 (transparent) so the
  // raycaster's alpha-mask freeform path clips per-column correctly.
  // Voussoir trim borders the opening; surround is running-bond brick.

  function _genWideArch(id, p) {
    var W       = WIDE_TEX_W;           // 128
    var H       = TEX_SIZE;             // 64
    var archCX  = W / 2;               // horizontal centre (pixel 64)
    var archHalf = W * 0.42;           // half-width of the opening (~54px)
    var apexY   = 4;                   // top of arch curve (texel row)
    var springY = Math.floor(H * 0.78); // where curve meets vertical jambs
    var jamb    = 4;                    // pixel-thick stone trim at edge

    _createTexture(id, W, H, function (x, y) {
      var dx = Math.abs(x - archCX) / archHalf;

      // ── Is this pixel inside the transparent opening? ──
      var inside = false;
      if (dx < 1.0) {
        if (y >= springY) {
          inside = true;
        } else {
          var t = (y - apexY) / (springY - apexY);
          if (t < 0) t = 0;
          var boundary = Math.sqrt(t);
          if (dx < boundary) inside = true;
        }
      }

      // ── Voussoir / jamb trim ──
      var isJamb = false;
      if (!inside) {
        for (var jd = 1; jd <= jamb; jd++) {
          var testDx = Math.abs(x - archCX - (dx > 0 ? -jd : jd)) / archHalf;
          if (testDx < 0) testDx = -testDx;
          var insideTest = false;
          if (testDx < 1.0) {
            if (y >= springY) {
              insideTest = true;
            } else {
              var tt = (y - apexY) / (springY - apexY);
              if (tt < 0) tt = 0;
              if (testDx < Math.sqrt(tt)) insideTest = true;
            }
          }
          if (insideTest) { isJamb = true; break; }
        }
        // Vertical jamb below spring line
        if (!isJamb && y >= springY && dx >= 1.0 && dx < 1.0 + jamb / archHalf) {
          isJamb = true;
        }
      }

      // ── Transparent opening ──
      if (inside) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      var n = _hash(x, y) * 14 - 7;

      // ── Keystone / voussoir trim ──
      if (isJamb) {
        return {
          r: _clamp(p.jambR + n),
          g: _clamp(p.jambG + n),
          b: _clamp(p.jambB + n)
        };
      }

      // ── Running-bond brickwork surround ──
      var brickH  = 10;
      var brickW  = 16;
      var mortarW = 2;
      var row = Math.floor(y / brickH);
      var localY = y % brickH;
      var offsetX = (row % 2 === 1) ? Math.floor(brickW / 2) : 0;
      var localX = (x + offsetX) % brickW;
      var isMortar = localX < mortarW || localY < mortarW;
      if (isMortar) {
        return {
          r: _clamp(p.mortarR + n * 0.5),
          g: _clamp(p.mortarG + n * 0.5),
          b: _clamp(p.mortarB + n * 0.5)
        };
      }
      return {
        r: _clamp(p.baseR + n),
        g: _clamp(p.baseG + n),
        b: _clamp(p.baseB + n)
      };
    });
  }

  // ── Door surround: brushed metal plate ──────────────────────────
  // Industrial door surround for metal_plate buildings. Flat brushed
  // steel with horizontal brush marks, rivet grid, and dark weld seams.
  // Uses the same arch opening geometry as _genDoorWood but replaces
  // brick fill and stone frame with metal surfaces.

  function _genDoorMetal(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // ── Archway geometry (shared with _genDoorWood) ──
      var frameW = 5;
      var archInnerL = 8;
      var archInnerR = S - 8;
      var archTopY = 10;
      var archCx = cx;
      var archRadius = (archInnerR - archInnerL) / 2;
      var archCenterY = archTopY + archRadius;

      var inOpening = false;
      if (y >= archCenterY && x > archInnerL && x < archInnerR) {
        inOpening = true;
      } else if (y < archCenterY && y >= archTopY) {
        var dx = x - archCx;
        var dy = y - archCenterY;
        if (dx * dx + dy * dy < archRadius * archRadius) {
          inOpening = true;
        }
      }

      // ── Dark portal interior ──
      if (inOpening) {
        var gn = _hash(x + 800, y + 900) * 6 - 3;
        var sparkHash = _hash(x * 7 + 1234, y * 13 + 5678);
        var rv = 8 + gn, gv = 7 + gn * 0.8, bv = 6 + gn * 0.5;
        if (sparkHash > 0.94) {
          var sp = (sparkHash - 0.94) * 600;
          rv += sp; gv += sp; bv += sp * 0.8;
        }
        return { r: _clamp(rv), g: _clamp(gv), b: _clamp(bv) };
      }

      // ── Steel frame surround ──
      var edgeDist = Math.min(x, S - 1 - x, y);
      if (edgeDist < frameW) {
        var fn = (_hash(x + 700, y + 750) - 0.5) * 6;
        // Weld bead along inner edge
        var innerDist = Math.abs(edgeDist - frameW + 1);
        var weld = (innerDist < 1) ? 12 : 0;
        return {
          r: _clamp(p.bandR + fn + weld),
          g: _clamp(p.bandG + fn + weld),
          b: _clamp(p.bandB + fn + weld)
        };
      }

      // ── Brushed metal fill (around the arch) ──
      // Horizontal brush strokes + vertical panel seams + rivet grid
      var brushNoise = (_hash(x + 1100, y + 1200) - 0.5) * 4;
      var brushStroke = (_hash(x * 3 + 50, Math.floor(y / 2) + 60) - 0.5) * 6;

      // Vertical panel seams every 16px
      var panelLocalX = x % 16;
      if (panelLocalX < 1) {
        return {
          r: _clamp(p.baseR * 0.65 + brushNoise),
          g: _clamp(p.baseG * 0.65 + brushNoise),
          b: _clamp(p.baseB * 0.65 + brushNoise)
        };
      }

      // Rivet grid: every 16px horizontal, 12px vertical
      var rivLX = x % 16;
      var rivLY = y % 12;
      if (rivLX >= 7 && rivLX <= 9 && rivLY >= 5 && rivLY <= 7) {
        var rcx = rivLX - 8, rcy = rivLY - 6;
        if (rcx * rcx + rcy * rcy <= 2) {
          var rn = _hash(x + 350, y + 360) * 6;
          return {
            r: _clamp(p.rivetR + rn),
            g: _clamp(p.rivetG + rn),
            b: _clamp(p.rivetB + rn)
          };
        }
      }

      return {
        r: _clamp(p.baseR + brushStroke + brushNoise),
        g: _clamp(p.baseG + brushStroke + brushNoise),
        b: _clamp(p.baseB + brushStroke * 0.8 + brushNoise)
      };
    });
  }

  // ── Door surround: cathedral carved stone ───────────────────────
  // Ornate stone surround for stone_cathedral buildings. Large dressed
  // stone blocks with a subtle arch motif carved into the frame, and a
  // wider keystone at the apex. Warm stone tones with carved relief
  // shadows for a Gothic/Romanesque fortress entrance look.

  function _genDoorCathedral(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // ── Archway geometry ──
      var frameW = 7;        // wider stone frame for monumental look
      var archInnerL = 10;
      var archInnerR = S - 10;
      var archTopY = 8;      // taller arch
      var archCx = cx;
      var archRadius = (archInnerR - archInnerL) / 2;
      var archCenterY = archTopY + archRadius;

      var inOpening = false;
      if (y >= archCenterY && x > archInnerL && x < archInnerR) {
        inOpening = true;
      } else if (y < archCenterY && y >= archTopY) {
        var dx = x - archCx;
        var dy = y - archCenterY;
        if (dx * dx + dy * dy < archRadius * archRadius) {
          inOpening = true;
        }
      }

      // ── Dark portal interior ──
      if (inOpening) {
        var gn = _hash(x + 800, y + 900) * 6 - 3;
        var sparkHash = _hash(x * 7 + 1234, y * 13 + 5678);
        var rv = 8 + gn, gv = 7 + gn * 0.8, bv = 6 + gn * 0.5;
        if (sparkHash > 0.94) {
          var sp = (sparkHash - 0.94) * 600;
          rv += sp; gv += sp; bv += sp * 0.8;
        }
        return { r: _clamp(rv), g: _clamp(gv), b: _clamp(bv) };
      }

      // ── Stone frame surround with arch motif ──
      var edgeDist = Math.min(x, S - 1 - x, y);
      if (edgeDist < frameW) {
        // Wide keystone at apex (wider than _genDoorWood)
        var isKeystone = (y < archTopY + 8) && Math.abs(x - cx) < 7;
        if (isKeystone) {
          var kn = _hash(x + 850, y + 850) * 6;
          return {
            r: _clamp(p.archR + 10 + kn),
            g: _clamp(p.archG + 8 + kn),
            b: _clamp(p.archB + 5 + kn)
          };
        }

        // Carved arch motif: concentric relief line inside the frame
        // Creates a subtle recessed arch outline 2px inside the outer edge
        var innerEdge = Math.abs(edgeDist - 3);
        if (innerEdge < 1) {
          return {
            r: _clamp(p.bandR * 0.75),
            g: _clamp(p.bandG * 0.75),
            b: _clamp(p.bandB * 0.75)
          };
        }

        var fn = (_hash(x + 700, y + 750) - 0.5) * 8;
        return {
          r: _clamp(p.bandR + fn),
          g: _clamp(p.bandG + fn),
          b: _clamp(p.bandB + fn)
        };
      }

      // ── Dressed stone blocks (larger than brick, ashlar pattern) ──
      // 16×10 blocks (wider than _genDoorWood's 16×8 bricks) with
      // staggered offset for ashlar coursing.
      var blockH = 10;
      var blockW = 16;
      var bRow = Math.floor(y / blockH);
      var bOx = (bRow % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var bLocalX = (x + bOx) % blockW;
      var bLocalY = y % blockH;

      // Mortar joints (wider than brick for dressed stone look)
      if (bLocalX < 1 || bLocalY < 1) {
        var mn = (_hash(x + 760, y + 770) - 0.5) * 4;
        return {
          r: _clamp(p.bandR * 0.60 + mn),
          g: _clamp(p.bandG * 0.60 + mn),
          b: _clamp(p.bandB * 0.60 + mn)
        };
      }

      // Stone face with 3-tier depth shading (edge → mid → center)
      var blockId = bRow * 5 + Math.floor((x + bOx) / blockW);
      var blockTone = (_hash(blockId, bRow + 30) - 0.5) * 12;
      var stoneDist = Math.min(bLocalX - 1, blockW - 2 - bLocalX,
                               bLocalY - 1, blockH - 2 - bLocalY);
      var stoneShade = stoneDist < 2 ? 0.88 : (stoneDist > 4 ? 1.05 : 0.97);
      var pn = (_hash(x + 800, y + 900) - 0.5) * 5;

      return {
        r: _clamp((p.baseR + blockTone) * stoneShade + pn),
        g: _clamp((p.baseG + blockTone) * stoneShade + pn * 0.8),
        b: _clamp((p.baseB + blockTone) * stoneShade + pn * 0.5)
      };
    });
  }

  // ── Door (iron plate with rivets) ──

  function _genDoorIron(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Frame
      if (x < 2 || x >= TEX_SIZE - 2 || y < 2 || y >= TEX_SIZE - 2) {
        return {
          r: _clamp(p.baseR - 20),
          g: _clamp(p.baseG - 20),
          b: _clamp(p.baseB - 20)
        };
      }

      // Rivet pattern (every 12px, 2px diameter circles)
      var rivX = ((x - 3) % 12);
      var rivY = ((y - 3) % 12);
      if (rivX >= 0 && rivX < 3 && rivY >= 0 && rivY < 3) {
        var cx = rivX - 1, cy = rivY - 1;
        if (cx * cx + cy * cy <= 2) {
          return {
            r: _clamp(p.rivetR),
            g: _clamp(p.rivetG),
            b: _clamp(p.rivetB)
          };
        }
      }

      // Plate surface with subtle noise
      var pn = (_hash(x + 1000, y + 1100) - 0.5) * 6;
      // Horizontal panel seam every 32px
      var seam = (y % 32) < 1 ? -15 : 0;

      return {
        r: _clamp(p.baseR + pn + seam),
        g: _clamp(p.baseG + pn + seam),
        b: _clamp(p.baseB + pn + seam)
      };
    });
  }

  // ── Concrete ──

  function _genConcrete(id, p) {
    // Chunky pixel-art concrete — large panel blocks with thick seams,
    // per-panel colour shift, 3-tier edge shading (matches shrub style).
    var panelW = 32;  // big square panels (was seamless)
    var panelH = 16;  // half-height panels (horizontal slabs)
    var seamW  = 2;   // thick seam (was 1px)

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var row   = Math.floor(y / panelH);
      var localY = y % panelH;
      var ox    = (row % 2 === 1) ? Math.floor(panelW / 2) : 0;
      var localX = (x + ox) % panelW;

      // Thick seam lines
      if (localX < seamW || localY < seamW) {
        var sn = (_hash(x + 1200, y + 1300) - 0.5) * 3;
        return {
          r: _clamp(p.baseR * 0.55 + sn),
          g: _clamp(p.baseG * 0.55 + sn),
          b: _clamp(p.baseB * 0.55 + sn)
        };
      }

      // Per-panel tint (strong variation like shrub clusters)
      var panelId = row * 4 + Math.floor((x + ox) / panelW);
      var panelTone = (_hash(panelId, row + 90) - 0.5) * p.variance * 3;
      // 3-tier: dark edges, light center
      var edgeDist = Math.min(localX - seamW, panelW - seamW - 1 - localX,
                              localY - seamW, panelH - seamW - 1 - localY);
      var tier = edgeDist < 3 ? 0.85 : (edgeDist > 6 ? 1.08 : 1.0);
      // Minimal per-pixel noise
      var pn = (_hash(x + 1200, y + 1300) - 0.5) * 2;

      return {
        r: _clamp((p.baseR + panelTone) * tier + pn),
        g: _clamp((p.baseG + panelTone) * tier + pn),
        b: _clamp((p.baseB + panelTone) * tier + pn * 0.8)
      };
    });
  }

  // ── Metal plate ──

  function _genMetal(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Brushed metal: horizontal streaks
      var streak = (_hash(x, Math.floor(y / 2)) - 0.5) * p.variance;
      var pn = (_hash(x + 1400, y + 1500) - 0.5) * 4;

      // Bolt holes in corners
      var boltZone = false;
      if ((x < 6 || x >= TEX_SIZE - 6) && (y < 6 || y >= TEX_SIZE - 6)) {
        var bx = x < 6 ? x - 3 : x - (TEX_SIZE - 3);
        var by = y < 6 ? y - 3 : y - (TEX_SIZE - 3);
        boltZone = (bx * bx + by * by) <= 4;
      }

      if (boltZone) {
        return { r: _clamp(p.baseR - 25), g: _clamp(p.baseG - 25), b: _clamp(p.baseB - 25) };
      }

      return {
        r: _clamp(p.baseR + streak + pn),
        g: _clamp(p.baseG + streak + pn),
        b: _clamp(p.baseB + streak + pn)
      };
    });
  }

  // ── Pillar (rounded shading) ──

  function _genPillar(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Cylindrical shading: bright center, dark edges
      var nx = (x / TEX_SIZE) * 2 - 1; // -1 to 1
      var shade = Math.cos(nx * Math.PI * 0.5); // 1 at center, 0 at edges
      shade = 0.4 + shade * 0.6;

      var pn = (_hash(x + 1600, y + 1700) - 0.5) * 8;

      // Horizontal stone block seams
      var seam = (y % 16) < 1 ? -15 : 0;

      return {
        r: _clamp(p.baseR * shade + pn + seam),
        g: _clamp(p.baseG * shade + pn * 0.9 + seam),
        b: _clamp(p.baseB * shade + pn * 0.8 + seam)
      };
    });
  }

  // ── Stairs down (dark stone with chevron arrow + step lines) ──

  function _genStairsDown(id, p) {
    // HD descending staircase — chunky stone steps with 3-tier edges
    // and two fat filled chevrons (▼▼) pointing down. Should read
    // "stairs going deeper" at a glance from TV distance.
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y, w, h) {
      var cx = w / 2;

      // ── Frame (3-tier dark stone rim) ──
      var edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y);
      if (edgeDist < 3) {
        var fTier = edgeDist === 0 ? 0.4 : (edgeDist === 1 ? 0.55 : 0.7);
        return {
          r: _clamp(p.stoneR * fTier),
          g: _clamp(p.stoneG * fTier),
          b: _clamp(p.stoneB * fTier)
        };
      }

      // ── Stone step bands (10px tall, 3-tier shaded) ──
      var stepH = 10;
      var stepLocal = y % stepH;
      var stepEdge = Math.min(stepLocal, stepH - 1 - stepLocal);
      var stepTier = stepEdge < 1 ? 0.78 : (stepEdge < 3 ? 0.9 : 1.0);
      // Step lip highlight (top 2px of each step)
      if (stepLocal < 2) {
        stepTier = 1.12;
      }

      var pn = (_hash(x + 2000, y + 2100) - 0.5) * 5;
      var r = p.stoneR * stepTier + pn;
      var g = p.stoneG * stepTier + pn;
      var b = p.stoneB * stepTier + pn;

      // ── Down-pointing filled chevrons (2 fat V-shapes) ──
      // Solid filled arrows, 4px thick legs, strong color contrast.
      // apex/size define the draw band [apex, apex+size); point-of-V sits
      // at the BOTTOM of the band (wide at top, narrow at bottom = ▼).
      var chevrons = [
        { apex: 16, size: 16 },
        { apex: 36, size: 16 }
      ];
      for (var ci = 0; ci < chevrons.length; ci++) {
        var ch = chevrons[ci];
        var dy = (ch.apex + ch.size - 1) - y;
        if (dy >= 0 && dy < ch.size) {
          var halfW = dy * 0.9 + 2;
          var dist = Math.abs(x - cx);
          // Filled: everything inside the V shape (not just the outline)
          if (dist <= halfW && dist >= halfW - 4) {
            // 3-tier: bright center of leg, dark edges
            var legEdge = Math.min(dist - (halfW - 4), halfW - dist);
            var lTier = legEdge < 1 ? 0.8 : (legEdge > 2 ? 1.15 : 1.0);
            r = p.arrowR * lTier;
            g = p.arrowG * lTier;
            b = p.arrowB * lTier;
          }
        }
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Stairs up (lighter stone with upward chevrons + warm glow) ──

  function _genStairsUp(id, p) {
    // HD ascending staircase — lighter stone steps with warm gradient
    // and two fat filled chevrons (▲▲) pointing up. Warm amber color
    // communicates "safety, return to surface."
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y, w, h) {
      var cx = w / 2;

      // ── Frame (3-tier warm stone rim) ──
      var edgeDist = Math.min(x, w - 1 - x, y, h - 1 - y);
      if (edgeDist < 3) {
        var fTier = edgeDist === 0 ? 0.5 : (edgeDist === 1 ? 0.65 : 0.8);
        return {
          r: _clamp(p.stoneR * fTier),
          g: _clamp(p.stoneG * fTier),
          b: _clamp(p.stoneB * fTier * 0.9)
        };
      }

      // Warm vertical gradient (lighter at top = light coming from above)
      var warmth = 1.0 + (1.0 - y / h) * 0.18;

      // ── Stone step bands (10px tall, 3-tier shaded + warm gradient) ──
      var stepH = 10;
      var stepLocal = y % stepH;
      var stepEdge = Math.min(stepLocal, stepH - 1 - stepLocal);
      var stepTier = stepEdge < 1 ? 0.78 : (stepEdge < 3 ? 0.9 : 1.0);
      // Step lip highlight (top 2px bright)
      if (stepLocal < 2) {
        stepTier = 1.15;
      }

      var pn = (_hash(x + 2200, y + 2300) - 0.5) * 5;
      var r = p.stoneR * warmth * stepTier + pn;
      var g = p.stoneG * warmth * stepTier + pn;
      var b = p.stoneB * warmth * stepTier + pn * 0.7;

      // ── Up-pointing filled chevrons (2 fat ▲ shapes) ──
      // apex = bottom of draw band; shape is narrow at top, wide at bottom.
      var chevrons = [
        { apex: 18, size: 16 },
        { apex: 38, size: 16 }
      ];
      for (var ci = 0; ci < chevrons.length; ci++) {
        var ch = chevrons[ci];
        var dy = y - (ch.apex - ch.size + 1);  // narrow top, wide bottom
        if (dy >= 0 && dy < ch.size) {
          var halfW = dy * 0.9 + 2;
          var dist = Math.abs(x - cx);
          if (dist <= halfW && dist >= halfW - 4) {
            var legEdge = Math.min(dist - (halfW - 4), halfW - dist);
            var lTier = legEdge < 1 ? 0.8 : (legEdge > 2 ? 1.15 : 1.0);
            r = p.arrowR * lTier;
            g = p.arrowG * lTier;
            b = p.arrowB * lTier;
          }
        }
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Locked door (wood + iron bands + chain/padlock overlay) ──

  function _genDoorLocked(id, p) {
    // HD locked door — dark wood planks with iron bands, a thick
    // diagonal chain X, and a chunky padlock. Every element has
    // 3-tier edge shading. Should read "locked, can't pass" instantly.
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y, w, h) {
      var cx = w / 2;
      var cy = h / 2;
      var S = w;

      // ── Outer frame (3-tier dark iron rim) ──
      var edgeDist = Math.min(x, S - 1 - x, y, S - 1 - y);
      if (edgeDist < 3) {
        var fTier = edgeDist === 0 ? 0.55 : (edgeDist === 1 ? 0.72 : 0.88);
        return {
          r: _clamp(p.bandR * fTier),
          g: _clamp(p.bandG * fTier),
          b: _clamp(p.bandB * fTier)
        };
      }

      // ── Padlock (drawn first so chain overlaps behind it) ──
      // Body: 10×12 rect centered below midpoint
      var lockCX = cx, lockCY = cy + 5;
      var lx = x - lockCX, ly = y - lockCY;
      var lockW = 5, lockH = 6;
      var inLockBody = lx >= -lockW && lx <= lockW && ly >= 0 && ly <= lockH * 2;
      // Shackle: thick U-arc above lock body
      var shDist = Math.sqrt(lx * lx + (ly + 2) * (ly + 2));
      var inShackle = ly >= -6 && ly < 1 && shDist >= 3 && shDist <= 5.5;

      if (inLockBody) {
        var lEdge = Math.min(lx + lockW, lockW - lx, ly, lockH * 2 - ly);
        var lTier = lEdge < 1 ? 0.7 : (lEdge < 3 ? 1.0 : 1.15);
        // Keyhole: dark vertical slot
        if (Math.abs(lx) < 1.5 && ly >= 4 && ly <= 8) {
          return { r: 12, g: 10, b: 8 };
        }
        return {
          r: _clamp(p.lockR * lTier),
          g: _clamp(p.lockG * lTier),
          b: _clamp(p.lockB * lTier * 0.9)
        };
      }
      if (inShackle) {
        var shEdge = Math.abs(shDist - 4.25);
        var shTier = shEdge < 0.5 ? 1.1 : 0.85;
        return {
          r: _clamp(p.chainR * shTier),
          g: _clamp(p.chainG * shTier),
          b: _clamp(p.chainB * shTier)
        };
      }

      // ── Chain X (thick 5px diagonals with link segments) ──
      var chainHalf = 3;
      var d1 = Math.abs((x - cx) - (y - cy));
      var d2 = Math.abs((x - cx) + (y - cy));
      var nearCenter = Math.abs(x - cx) < 22 && Math.abs(y - cy) < 22;
      var onChainA = d1 < chainHalf && nearCenter;
      var onChainB = d2 < chainHalf && nearCenter;

      if (onChainA || onChainB) {
        var cDist = onChainA ? d1 : d2;
        // 3-tier: bright center ridge, dark edges
        var cTier = cDist < 1 ? 1.15 : (cDist < 2 ? 1.0 : 0.8);
        // Link segments: alternating bright/dark every 5px
        var linkParam = onChainA ? (x + y) : (x - y + S);
        var linkPhase = ((linkParam % 5) < 3) ? 1.0 : 0.72;
        return {
          r: _clamp(p.chainR * cTier * linkPhase),
          g: _clamp(p.chainG * cTier * linkPhase),
          b: _clamp(p.chainB * cTier * linkPhase)
        };
      }

      // ── Iron bands (3 horizontal, 5px tall, 3-tier shaded) ──
      var bandH = 4;
      var bandPositions = [6, Math.floor(S / 2) - 2, S - 10];
      for (var bi = 0; bi < bandPositions.length; bi++) {
        if (y >= bandPositions[bi] && y < bandPositions[bi] + bandH) {
          var bLocal = y - bandPositions[bi];
          var bEdge = Math.min(bLocal, bandH - 1 - bLocal);
          var bTier = bEdge < 1 ? 0.8 : 1.1;
          var bn = (_hash(x + 700, y) - 0.5) * 4;
          return {
            r: _clamp(p.bandR * bTier + bn),
            g: _clamp(p.bandG * bTier + bn),
            b: _clamp(p.bandB * bTier + bn)
          };
        }
      }

      // ── Wood plank body ──
      // Vertical planks ~10px wide, dark wood (door is old/weathered)
      var plankW = 10;
      var plankIdx = Math.floor(x / plankW);
      var plankLocal = x - plankIdx * plankW;
      if (plankLocal < 1) {
        return {
          r: _clamp(p.baseR * 0.4),
          g: _clamp(p.baseG * 0.4),
          b: _clamp(p.baseB * 0.35)
        };
      }
      var plankTone = (_hash(plankIdx, 44) - 0.5) * 14;
      var plankEdge = Math.min(plankLocal - 1, plankW - 1 - plankLocal);
      var pTier = plankEdge < 2 ? 0.85 : (plankEdge > 4 ? 1.06 : 1.0);
      var grain = Math.sin(y * (_hash(plankIdx, 0) * 2 + 0.3) + plankIdx * 3) * 0.5 + 0.5;
      var gMult = grain < 0.2 ? 0.84 : (grain > 0.75 ? 1.04 : 1.0);
      var pn = (_hash(x + 800, y + 900) - 0.5) * 3;

      return {
        r: _clamp((p.baseR + plankTone) * pTier * gMult + pn),
        g: _clamp((p.baseG + plankTone * 0.7) * pTier * gMult + pn * 0.7),
        b: _clamp((p.baseB + plankTone * 0.4) * pTier * gMult + pn * 0.4)
      };
    });
  }

  // ── Floor: cobblestone (exterior streets) ──

  function _genFloorCobble(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Irregular cobblestone grid — offset every other row
      var stoneW = 10, stoneH = 8;
      var row = Math.floor(y / stoneH);
      var ox = (row % 2 === 1) ? Math.floor(stoneW / 2) : 0;
      var localX = (x + ox) % stoneW;
      var localY = y % stoneH;

      // Mortar gaps
      if (localX < 1 || localY < 1) {
        var mn = _hash(x + 3000, y + 3100) * 6 - 3;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn)
        };
      }

      // Per-stone color variation
      var stoneId = row * 7 + Math.floor((x + ox) / stoneW);
      var stoneNoise = (_hash(stoneId, row + 99) - 0.5) * 20;
      var pn = (_hash(x + 3200, y + 3300) - 0.5) * 8;

      return {
        r: _clamp(p.baseR + stoneNoise + pn),
        g: _clamp(p.baseG + stoneNoise + pn * 0.9),
        b: _clamp(p.baseB + stoneNoise + pn * 0.8)
      };
    });
  }

  // ── Floor: wood planks (interior) ──

  function _genFloorWood(id, p) {
    // Laid-board floor — narrow, long planks running along x-axis with
    // varied per-row stagger so the end-cut seams never land in a
    // predictable column rhythm. This prevents the "marching vertical
    // seam" the eye latches onto during freelook.
    //
    // Dimensions (relative to brick at 16W × 10H, mortar 2):
    //   plankH    = 4   (narrower — brick is 10 tall, this is ~40%)
    //   rowPitch  = 4   (no dedicated gap row; top-pixel edge-shade
    //                    provides the row seam. Divides 64 cleanly →
    //                    16 plank rows per tile, no partial bottom row.)
    //   plankLen  = 64  (one "long board" per row, broken by a SINGLE
    //                    end-cut seam at a per-row varied position →
    //                    average section length ≈ 32 = 2× brick, but
    //                    with high variance: some sections ≈ 12, some
    //                    ≈ 52 → reads as longer, more natural planks.)
    //   gapV      = 1   (vertical end-cut seam thickness)
    //
    // Stagger: per-row end-cut position pulled from a 7-value hash set
    // (12,18,24,30,36,42,48) so no two adjacent rows share the same cut
    // column and the seams distribute across most of the tile width.
    var plankH      = 4;
    var rowPitch    = 4;    // plankH + 0 (top-pixel darkening = seam)
    var gapV        = 1;

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var row    = Math.floor(y / rowPitch);
      var localY = y - row * rowPitch;

      // Per-row end cut — one seam per row, varied position.
      // Hash maps row → index 0..6 → cut position in {12,18,24,30,36,42,48}.
      // These values avoid the cell boundary (x=0,63) so tiling is clean.
      var cutIdx   = Math.floor(_hash(row, 137) * 7) % 7;
      var rowCut   = 12 + cutIdx * 6;

      // Which plank section are we in? Left of cut = 0, right of cut = 1.
      // Each row has exactly two sections, lengths rowCut and (64 - rowCut).
      var section, localX, sectionLen;
      if (x < rowCut) {
        section    = 0;
        localX     = x;
        sectionLen = rowCut;
      } else {
        section    = 1;
        localX     = x - rowCut;
        sectionLen = TEX_SIZE - rowCut;
      }

      // Horizontal row seam — top pixel of each row (acts as the gap
      // between plank rows without stealing a whole row slot).
      if (localY === 0 && row > 0) {
        var hgn = (_hash(x + 3300, y + 3310) - 0.5) * 4;
        return {
          r: _clamp(p.baseR * 0.35 + hgn),
          g: _clamp(p.baseG * 0.35 + hgn * 0.85),
          b: _clamp(p.baseB * 0.30 + hgn * 0.7)
        };
      }

      // Vertical end-cut seam at rowCut
      if (localX < gapV && section === 1) {
        var vgn = (_hash(x + 3350, y + 3360) - 0.5) * 4;
        return {
          r: _clamp(p.baseR * 0.35 + vgn),
          g: _clamp(p.baseG * 0.35 + vgn * 0.85),
          b: _clamp(p.baseB * 0.30 + vgn * 0.7)
        };
      }

      // Per-section identity — row × prime + section × prime2 so
      // every board gets its own tone. Prime mix gives aperiodic
      // color distribution across the 16-row tile.
      var boardId   = row * 17 + section * 29;
      var plankTone = (_hash(boardId, row + 31) - 0.5) * 22;

      // 3-tier edge shading — section-local bounds so end cuts read
      // as physical joints instead of color steps. plankH is very
      // small (4), so y-edge shading uses a 1px dark rim on the
      // underside only (localY === 1 is rim, localY > 1 is field).
      var edgeX = Math.min(localX - (section === 1 ? gapV : 0),
                           sectionLen - 1 - localX);
      var yEdge = (localY === 1 || localY === plankH - 1) ? 1 : 0;
      var tier;
      if (yEdge || edgeX < 1) tier = 0.82;
      else if (edgeX > 6)     tier = 1.08;
      else                    tier = 1.0;

      // Per-board grain — each board has its own grain phase and
      // frequency seeded from boardId. Horizontal streaks dominate
      // (along the board length) with mild localY modulation.
      var grainFreq = _hash(boardId, 0) * 0.25 + 0.15;
      var grain     = Math.sin(localX * grainFreq + boardId * 1.7 +
                               localY * 0.4) * 0.5 + 0.5;
      var grainMult = grain < 0.3 ? p.grainDark : (grain > 0.78 ? 1.05 : 1.0);

      // Sparse knots — ~10% of boards get one knot blob
      var knotRand  = _hash(boardId + 91, 0);
      var knotDark  = 0;
      if (knotRand > 0.90) {
        var kx = ((knotRand * 997) % sectionLen) | 0;
        var dx = localX - kx;
        var dy = (localY - 1) * 2;
        if (dx * dx + dy * dy < 3) knotDark = -20;
      }

      // Per-pixel noise — subtle, lets plank banding dominate.
      var pn = (_hash(x + 3400, y + 3500) - 0.5) * 4;

      return {
        r: _clamp((p.baseR + plankTone) * tier * grainMult + pn + knotDark),
        g: _clamp((p.baseG + plankTone * 0.75) * tier * grainMult + pn * 0.75 + knotDark),
        b: _clamp((p.baseB + plankTone * 0.5)  * tier * grainMult + pn * 0.5  + knotDark)
      };
    });
  }

  // ── Floor: rough stone (dungeon) ──

  function _genFloorStone(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Large irregular stone flags
      var blockW = 16, blockH = 12;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 8 : 0;
      var localX = (x + ox) % blockW;
      var localY = y % blockH;

      // Cracks / mortar
      if (localX < 1 || localY < 1) {
        return {
          r: _clamp(p.baseR * 0.4),
          g: _clamp(p.baseG * 0.4),
          b: _clamp(p.baseB * 0.4)
        };
      }

      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId, row + 200) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 3600, y + 3700) - 0.5) * 8;

      return {
        r: _clamp(p.baseR + blockNoise + pn),
        g: _clamp(p.baseG + blockNoise + pn),
        b: _clamp(p.baseB + blockNoise + pn * 0.9)
      };
    });
  }

  // ── Floor: dirt (caves, cellars) ──

  function _genFloorDirt(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Organic noise — no regular pattern
      var n1 = _hash(x + 3800, y + 3900);
      var n2 = _hash(x * 3 + 100, y * 3 + 200);
      var combined = n1 * 0.7 + n2 * 0.3;

      // Occasional dark patches (puddles, roots)
      var patch = _hash(Math.floor(x / 12), Math.floor(y / 12));
      var patchMult = patch > 0.85 ? 0.6 : 1.0;

      var pn = (combined - 0.5) * p.variance * 2;
      return {
        r: _clamp((p.baseR + pn) * patchMult),
        g: _clamp((p.baseG + pn * 0.8) * patchMult),
        b: _clamp((p.baseB + pn * 0.6) * patchMult)
      };
    });
  }

  // ── Floor: red brick courtyard (warm terracotta, contrasts grey stone walls) ──

  // ── Floor: grass (pure grass under trees and shrubs on exterior floors) ──

  function _genFloorGrass(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Multi-frequency noise for organic grass variation
      var n1 = _hash(x + 5100, y + 5200);
      var n2 = _hash(x * 3 + 5300, y * 3 + 5400);
      var n3 = _hash(x * 7 + 5500, y * 5 + 5600);  // Blade-scale detail
      var combined = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

      // Clump pattern — darker areas simulate shadow under foliage
      var clump = _hash(Math.floor(x / 8), Math.floor(y / 8));
      var inShadow = clump > 0.7;

      // Blade direction hint — slight vertical streaking
      var blade = _hash(x, Math.floor(y / 3) + 9000);

      var pn = (combined - 0.5) * p.variance * 2;
      var bn = (blade - 0.5) * 8;

      if (inShadow) {
        return {
          r: _clamp(p.darkR + pn * 0.5),
          g: _clamp(p.darkG + pn + bn),
          b: _clamp(p.darkB + pn * 0.3)
        };
      }

      // Sunlit grass — occasional bright blade highlights
      var highlight = n3 > 0.85 ? 1 : 0;
      return {
        r: _clamp(p.baseR + pn * 0.6 + highlight * (p.hiR - p.baseR)),
        g: _clamp(p.baseG + pn + bn + highlight * (p.hiG - p.baseG)),
        b: _clamp(p.baseB + pn * 0.4 + highlight * (p.hiB - p.baseB))
      };
    });
  }

  // ── Floor: red brick courtyard (warm terracotta, contrasts grey stone walls) ──

  function _genFloorBrickRed(id, p) {
    var brickW = 12, brickH = 6, mortarW = 1;
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var row = Math.floor(y / brickH);
      var localY = y % brickH;
      var offsetX = (row % 2 === 1) ? Math.floor(brickW / 2) : 0;
      var localX = (x + offsetX) % brickW;

      // Sandy mortar lines — wider than wall mortar for ground perspective
      if (localY < mortarW || localX < mortarW) {
        var mn = _hash(x + 4000, y + 4100) * 8 - 4;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn * 0.6)
        };
      }

      // Brick face — warm terracotta with per-brick hue shift
      var brickId = row * 6 + Math.floor((x + offsetX) / brickW);
      var brickNoise = (_hash(brickId, row + 80) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 4200, y + 4300) - 0.5) * 10;

      // Slight hue variation — some bricks more orange, some more brown
      var hueShift = (_hash(brickId + 5, row + 5) - 0.5) * 20;

      return {
        r: _clamp(p.faceR + brickNoise + pn + hueShift),
        g: _clamp(p.faceG + brickNoise * 0.6 + pn * 0.5),
        b: _clamp(p.faceB + brickNoise * 0.4 + pn * 0.3)
      };
    });
  }

  // ── Floor: grey stone with Grey-Scott grass veins ──
  //
  // Uses reaction-diffusion (Grey-Scott model) to generate organic
  // vein patterns that look like moss/grass growing through stone
  // cracks. The pattern is pre-computed as a 2D mask, then applied
  // as a color blend over flagstone.

  function _genFloorGrassStone(id, p) {
    var S = TEX_SIZE;

    // ── Phase 1: Run Grey-Scott reaction-diffusion ──
    // Two chemical concentrations (U, V) on a 2D grid.
    // F = feed rate, k = kill rate. Parameters tuned for vein-like growth.
    var F = 0.037;   // feed rate — lower = more connected veins
    var k = 0.06;    // kill rate — controls vein thickness
    var Du = 0.16;   // U diffusion rate
    var Dv = 0.08;   // V diffusion rate
    var dt = 1.0;    // timestep

    // Initialize grids — U=1 everywhere, V=0 with seed spots
    var U = new Float32Array(S * S);
    var V = new Float32Array(S * S);
    var Unew = new Float32Array(S * S);
    var Vnew = new Float32Array(S * S);

    for (var i = 0; i < S * S; i++) { U[i] = 1.0; V[i] = 0.0; }

    // Seed V at a few spots — these grow into veins
    // Use deterministic positions based on hash
    var seeds = [
      { cx: 12, cy: 48 }, { cx: 44, cy: 16 }, { cx: 28, cy: 32 },
      { cx: 8, cy: 20 },  { cx: 52, cy: 44 }, { cx: 36, cy: 56 }
    ];
    for (var si = 0; si < seeds.length; si++) {
      var sx = seeds[si].cx, sy = seeds[si].cy;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var nx = (sx + dx + S) % S;
          var ny = (sy + dy + S) % S;
          V[ny * S + nx] = 1.0;
          U[ny * S + nx] = 0.5;
        }
      }
    }

    // Run iterations (2500 steps gives good vein growth at 64x64)
    var iterations = 2500;
    for (var iter = 0; iter < iterations; iter++) {
      for (var yy = 0; yy < S; yy++) {
        for (var xx = 0; xx < S; xx++) {
          var idx = yy * S + xx;

          // Laplacian with toroidal wrapping
          var xm = ((xx - 1) + S) % S;
          var xp = (xx + 1) % S;
          var ym = ((yy - 1) + S) % S;
          var yp = (yy + 1) % S;

          var lapU = U[yy * S + xp] + U[yy * S + xm] +
                     U[yp * S + xx] + U[ym * S + xx] - 4 * U[idx];
          var lapV = V[yy * S + xp] + V[yy * S + xm] +
                     V[yp * S + xx] + V[ym * S + xx] - 4 * V[idx];

          var u = U[idx], v = V[idx];
          var uvv = u * v * v;

          Unew[idx] = u + dt * (Du * lapU - uvv + F * (1 - u));
          Vnew[idx] = v + dt * (Dv * lapV + uvv - (F + k) * v);

          // Clamp
          if (Unew[idx] < 0) Unew[idx] = 0;
          if (Unew[idx] > 1) Unew[idx] = 1;
          if (Vnew[idx] < 0) Vnew[idx] = 0;
          if (Vnew[idx] > 1) Vnew[idx] = 1;
        }
      }
      // Swap buffers
      var tmpU = U; U = Unew; Unew = tmpU;
      var tmpV = V; V = Vnew; Vnew = tmpV;
    }

    // ── Phase 2: Render texture using V as grass mask ──
    _createTexture(id, S, S, function (x, y) {
      var grassAmount = V[y * S + x]; // 0..~0.5 (V rarely reaches 1)

      // Normalize — V typically peaks around 0.3-0.5 for these params
      var grassT = Math.min(1, grassAmount * 2.5);

      // Stone flagstone base (same structure as floor_stone)
      var blockW = 14, blockH = 10;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 7 : 0;
      var localX = (x + ox) % blockW;
      var localY = y % blockH;

      var isMortar = (localX < 1 || localY < 1);

      if (isMortar) {
        // Mortar — blend toward mossy green where grass grows
        var mn = _hash(x + 5000, y + 5100) * 6 - 3;
        var mr = _clamp(p.mortarR * (1 - grassT * 0.3) + mn);
        var mg = _clamp(p.mortarG * (1 + grassT * 0.4) + mn);
        var mb = _clamp(p.mortarB * (1 - grassT * 0.2) + mn);
        return { r: mr, g: mg, b: mb };
      }

      // Stone surface
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId, row + 300) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 5200, y + 5300) - 0.5) * 8;

      var sr = _clamp(p.stoneR + blockNoise + pn);
      var sg = _clamp(p.stoneG + blockNoise + pn);
      var sb = _clamp(p.stoneB + blockNoise + pn * 0.9);

      // Blend stone toward grass based on Grey-Scott V
      if (grassT > 0.15) {
        var blend = (grassT - 0.15) / 0.85; // 0..1 ramp
        blend = blend * blend; // ease-in for softer edge
        // Add per-pixel grass variation
        var gn = (_hash(x + 5400, y + 5500) - 0.5) * 15;
        var gr = _clamp(p.grassR + gn * 0.5);
        var gg = _clamp(p.grassG + gn);
        var gb = _clamp(p.grassB + gn * 0.3);

        sr = _clamp(sr * (1 - blend) + gr * blend);
        sg = _clamp(sg * (1 - blend) + gg * blend);
        sb = _clamp(sb * (1 - blend) + gb * blend);
      }

      return { r: sr, g: sg, b: sb };
    });
  }

  // ── Floor: clean tile (sealab — cool blue-white, clinical) ──

  function _genFloorTile(id, p) {
    var tileSize = 16;
    var groutW = 1;
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var localX = x % tileSize;
      var localY = y % tileSize;

      // Grout lines
      if (localX < groutW || localY < groutW) {
        var gn = _hash(x + 6000, y + 6100) * 6 - 3;
        return {
          r: _clamp(p.groutR + gn),
          g: _clamp(p.groutG + gn),
          b: _clamp(p.groutB + gn)
        };
      }

      // Tile surface — slight directional streak (fluorescent reflection)
      var streak = Math.sin(x * 0.2 + y * 0.05) * 0.5 + 0.5;
      var streakMult = 0.95 + streak * 0.1;
      var pn = (_hash(x + 6200, y + 6300) - 0.5) * p.variance * 2;

      return {
        r: _clamp((p.baseR + pn) * streakMult),
        g: _clamp((p.baseG + pn) * streakMult),
        b: _clamp((p.baseB + pn * 1.2) * streakMult)
      };
    });
  }

  // ── Floor: mossy stone (catacomb/cellar — stone flags with moss patches) ──

  function _genFloorStoneMossy(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Same stone flag structure as floor_stone
      var blockW = 16, blockH = 12;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 8 : 0;
      var localX = (x + ox) % blockW;
      var localY = y % blockH;

      // Mortar lines
      if (localX < 1 || localY < 1) {
        // Green-tinted mortar (moss grows in cracks)
        var mn = (_hash(x + 8100, y + 8200) - 0.5) * 4;
        return {
          r: _clamp(p.baseR * 0.3 + p.mossR * 0.15 + mn),
          g: _clamp(p.baseG * 0.3 + p.mossG * 0.2 + mn),
          b: _clamp(p.baseB * 0.3 + p.mossB * 0.1 + mn)
        };
      }

      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId, row + 8300) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 8400, y + 8500) - 0.5) * 8;

      // Moss patches: ~30% of blocks get moss overlay
      var mossSeed = _hash(blockId + 8600, row + 8700);
      if (mossSeed > 0.7) {
        // Distance from block centre → radial moss coverage
        var bCx = (Math.floor((x + ox) / blockW) * blockW + blockW / 2) - ox;
        var bCy = row * blockH + blockH / 2;
        var mDx = x - bCx, mDy = y - bCy;
        var mDist = Math.sqrt(mDx * mDx + mDy * mDy);
        var mMax = Math.min(blockW, blockH) * 0.6;
        if (mDist < mMax) {
          var mFalloff = 1.0 - mDist / mMax;
          var mN = _hash(x * 3 + 8800, y * 3 + 8900);
          var isHi = mN > 0.6;
          return {
            r: _clamp((isHi ? p.mossHiR : p.mossR) + pn * 0.3),
            g: _clamp((isHi ? p.mossHiG : p.mossG) + pn * 0.6),
            b: _clamp((isHi ? p.mossHiB : p.mossB) + pn * 0.2)
          };
        }
      }

      // Plain stone
      return {
        r: _clamp(p.baseR + blockNoise + pn),
        g: _clamp(p.baseG + blockNoise + pn),
        b: _clamp(p.baseB + blockNoise + pn * 0.9)
      };
    });
  }

  // ── Floor: cracked stone (deeper cellars — worn flags with fracture lines) ──

  function _genFloorStoneCracked(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Same stone flag structure as floor_stone
      var blockW = 16, blockH = 12;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 8 : 0;
      var localX = (x + ox) % blockW;
      var localY = y % blockH;

      // Mortar lines
      if (localX < 1 || localY < 1) {
        return {
          r: _clamp(p.baseR * 0.35),
          g: _clamp(p.baseG * 0.35),
          b: _clamp(p.baseB * 0.35)
        };
      }

      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId, row + 9100) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 9200, y + 9300) - 0.5) * 8;

      // Crack lines: jagged paths across blocks (deterministic per block)
      var crackSeed = _hash(blockId + 9400, row + 9500);
      if (crackSeed > 0.55) {
        // Diagonal crack from corner to corner with jitter
        var crackX = localX;
        var crackY = localY;
        var crackLine = blockW * (crackY / blockH);
        if (crackSeed > 0.75) crackLine = blockW - crackLine;  // Flip direction
        var jitter = (_hash(Math.floor(localY / 2) + blockId * 17 + 9600, 0) - 0.5) * 3;
        var dist = Math.abs(crackX - crackLine - jitter);

        if (dist < 2.5 && localY > 1 && localY < blockH - 1) {
          if (dist < 1.0) {
            // Deep crack shadow
            return {
              r: _clamp(p.crackR),
              g: _clamp(p.crackG),
              b: _clamp(p.crackB)
            };
          }
          // Exposed edge
          var eFall = (dist - 1.0) / 1.5;
          return {
            r: _clamp(p.edgeR * (1.0 - eFall) + (p.baseR + blockNoise) * eFall),
            g: _clamp(p.edgeG * (1.0 - eFall) + (p.baseG + blockNoise) * eFall),
            b: _clamp(p.edgeB * (1.0 - eFall) + (p.baseB + blockNoise) * eFall)
          };
        }
      }

      // Plain stone
      return {
        r: _clamp(p.baseR + blockNoise + pn),
        g: _clamp(p.baseG + blockNoise + pn),
        b: _clamp(p.baseB + blockNoise + pn * 0.9)
      };
    });
  }

  // ── Floor: flagstone (foundry — large irregular slabs with oil stains) ──

  function _genFloorFlagstone(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Larger irregular slabs than floor_stone
      var blockW = 20, blockH = 16;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 10 : 0;
      var localX = (x + ox) % blockW;
      var localY = y % blockH;

      // Wide mortar joints (industrial grout)
      if (localX < 2 || localY < 2) {
        var mn = (_hash(x + 9700, y + 9800) - 0.5) * 4;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn)
        };
      }

      var blockId = row * 4 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId, row + 9900) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 10000, y + 10100) - 0.5) * 8;

      // Oil/rust stain patches: ~20% of slabs
      var stainSeed = _hash(blockId + 10200, row + 10300);
      if (stainSeed > 0.8) {
        var sCx = (Math.floor((x + ox) / blockW) * blockW + blockW / 2) - ox;
        var sCy = row * blockH + blockH / 2;
        var sDx = x - sCx, sDy = y - sCy;
        var sDist = Math.sqrt(sDx * sDx + sDy * sDy);
        var nDist = sDist + (_hash(x + 10400, y + 10401) - 0.5) * 5;
        var sMax = Math.min(blockW, blockH) * 0.4;
        if (nDist < sMax) {
          var sFall = 1.0 - nDist / sMax;
          return {
            r: _clamp(p.stainR + pn * 0.5 + blockNoise * sFall),
            g: _clamp(p.stainG + pn * 0.4 + blockNoise * sFall),
            b: _clamp(p.stainB + pn * 0.3 + blockNoise * sFall)
          };
        }
      }

      // Plain slab
      return {
        r: _clamp(p.baseR + blockNoise + pn),
        g: _clamp(p.baseG + blockNoise + pn),
        b: _clamp(p.baseB + blockNoise + pn * 0.8)
      };
    });
  }

  // ── Stoop face flagstone (short wall face, 3 big slabs) ──
  //
  // Designed for wallHeight 0.04 tiles (STOOP). Palette + block size
  // mirrors floor_flagstone so the face reads as the same flagstone
  // material used on the stoop's cap/lid. Layout is a horizontal band
  // of 3 large slabs separated by thick vertical mortar seams; top and
  // bottom 2px are darker mortar edges so the short sliver still reads
  // as "stone edge, not wall".

  function _genStoopFace(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var slabCount = 3;               // 3 wide slabs across 64px
      var slabW = Math.floor(S / slabCount); // ~21
      var mortarV = 2;                 // thick vertical mortar
      var edgeBand = 2;                // top/bottom edge mortar

      // Top/bottom dark mortar edge — frames the slab band
      if (y < edgeBand || y >= S - edgeBand) {
        var en = (_hash(x + 9400, y + 9401) - 0.5) * 4;
        return {
          r: _clamp(p.mortarR + en),
          g: _clamp(p.mortarG + en),
          b: _clamp(p.mortarB + en)
        };
      }

      var slabIdx = Math.floor(x / slabW);
      var localX = x - slabIdx * slabW;

      // Vertical mortar between slabs
      if (localX < mortarV) {
        var mn = (_hash(x + 9500, y + 9501) - 0.5) * 4;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn)
        };
      }

      // Per-slab tone (strong variation like floor_flagstone)
      var slabTone = (_hash(slabIdx, 9600) - 0.5) * p.variance * 2;
      var pn = (_hash(x + 9700, y + 9701) - 0.5) * 6;

      // Rust/oil stain on ~30% of slabs — echoes floor_flagstone
      var stainSeed = _hash(slabIdx + 9800, 0);
      if (stainSeed > 0.7) {
        var sCx = slabIdx * slabW + slabW / 2;
        var sCy = S / 2;
        var sDx = x - sCx, sDy = y - sCy;
        var sDist = Math.sqrt(sDx * sDx + sDy * sDy);
        var sMax = slabW * 0.35;
        if (sDist < sMax) {
          var sFall = 1.0 - sDist / sMax;
          return {
            r: _clamp(p.stainR + pn * 0.5 + slabTone * sFall),
            g: _clamp(p.stainG + pn * 0.4 + slabTone * sFall),
            b: _clamp(p.stainB + pn * 0.3 + slabTone * sFall)
          };
        }
      }

      // Subtle edge shading within slab (3-tier lightness)
      var edgeDist = Math.min(localX - mortarV, slabW - 1 - localX,
                              y - edgeBand, S - edgeBand - 1 - y);
      var tier = edgeDist < 2 ? 0.85 : (edgeDist > 6 ? 1.08 : 1.0);

      return {
        r: _clamp((p.baseR + slabTone) * tier + pn),
        g: _clamp((p.baseG + slabTone) * tier + pn * 0.9),
        b: _clamp((p.baseB + slabTone) * tier + pn * 0.8)
      };
    });
  }

  // ── Deck face beams (short wall face, boards + beams) ──
  //
  // Designed for wallHeight 0.04 tiles (DECK). Layout:
  //   rows  0–5   : top board (horizontal plank edge — brighter)
  //   rows  6–57  : vertical beams every ~21px separated by dark gap
  //                 pockets (the "gap fill under" the deck)
  //   rows 58–63  : bottom board / shadow line
  // Beam colour varies per-beam so it reads as discrete lumber.

  function _genDeckFace(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var topBoard = 6;
      var botBoard = 6;
      var beamW = 10;                  // beam width
      var gapW = 11;                   // gap between beams (slightly wider)
      var pitch = beamW + gapW;        // 21

      // Top board — brighter horizontal plank with grain
      if (y < topBoard) {
        var grain = (_hash(x + 9000, Math.floor(y / 2) + 9001) - 0.5) * 10 * p.grainDark;
        var darken = (y === 0 || y === topBoard - 1) ? -12 : 0;
        return {
          r: _clamp(p.boardR + grain + darken),
          g: _clamp(p.boardG + grain * 0.8 + darken),
          b: _clamp(p.boardB + grain * 0.5 + darken)
        };
      }

      // Bottom board — darker shadow rail
      if (y >= S - botBoard) {
        var bn = (_hash(x + 9100, y + 9101) - 0.5) * 8 * p.grainDark;
        var bd = (y === S - 1 || y === S - botBoard) ? -10 : 0;
        return {
          r: _clamp(p.boardR * 0.75 + bn + bd),
          g: _clamp(p.boardG * 0.75 + bn * 0.8 + bd),
          b: _clamp(p.boardB * 0.75 + bn * 0.5 + bd)
        };
      }

      // Beam/gap band
      var localX = x % pitch;
      var beamIdx = Math.floor(x / pitch);

      if (localX >= beamW) {
        // Dark gap pocket — shows framing/void under deck
        var gn = (_hash(x + 9200, y + 9201) - 0.5) * 5;
        var gapFall = (localX - beamW) / (gapW - 1);
        // Slightly darker in the middle of the gap (deeper recess)
        var gd = (gapFall > 0.3 && gapFall < 0.7) ? -6 : 0;
        return {
          r: _clamp(p.gapR + gn + gd),
          g: _clamp(p.gapG + gn * 0.9 + gd),
          b: _clamp(p.gapB + gn * 0.8 + gd)
        };
      }

      // Beam surface — per-beam tone, vertical grain
      var beamTone = (_hash(beamIdx, 9300) - 0.5) * 16;
      var vGrain = Math.sin(y * 0.6 + beamIdx * 1.9) * 4;
      var pn2 = (_hash(x + 9310, y + 9311) - 0.5) * 5 * p.grainDark;
      // Beam edge shading
      var edgeShade = (localX === 0 || localX === beamW - 1) ? 0.78 : 1.0;

      return {
        r: _clamp((p.beamR + beamTone) * edgeShade + vGrain + pn2),
        g: _clamp((p.beamG + beamTone) * edgeShade + vGrain * 0.8 + pn2 * 0.8),
        b: _clamp((p.beamB + beamTone) * edgeShade + vGrain * 0.5 + pn2 * 0.5)
      };
    });
  }

  // ── Deck lid planks (top surface — perpendicular to floor_wood) ──
  //
  // Wider planks than floor_wood (6px vs 4px), laid ALONG Y so the grain
  // runs vertical in texture space — opposite of floor_wood whose grain
  // runs along X. When a deck region sits next to a floor_wood region,
  // the two plank-run directions contrast visually.

  function _genFloorDeckPlanks(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var plankW = 8;                  // wide planks (wider than boardwalk 8H)
      var gapW = 1;                    // thin dark gap between planks
      var plankIdx = Math.floor(x / plankW);
      var localX = x % plankW;

      // Vertical gap between planks (perpendicular orientation to floor_wood)
      if (localX >= plankW - gapW) {
        return { r: p.gapR, g: p.gapG, b: p.gapB };
      }

      // Per-plank base tone
      var plankSeed = _hash(plankIdx + 9850, 0);
      var plankShift = (plankSeed - 0.5) * 16;

      // Per-row end-cut seam (varied position per plank)
      var cutIdx = Math.floor(_hash(plankIdx, 9860) * 5);
      var plankCut = 16 + cutIdx * 10;  // 16,26,36,46,56
      if (y === plankCut || y === plankCut - 1) {
        var cn = (_hash(x + 9870, y + 9871) - 0.5) * 4;
        return {
          r: _clamp(p.baseR * 0.40 + cn),
          g: _clamp(p.baseG * 0.40 + cn * 0.85),
          b: _clamp(p.baseB * 0.35 + cn * 0.7)
        };
      }

      // Vertical grain (runs along plank length — down the y axis)
      var grain = _hash(Math.floor(x / 2) + plankIdx * 500, y + 9880);
      var gn2 = (grain - 0.5) * 14 * p.grainDark;

      // Weathering spots
      var weather = _hash(x + 9890, y + 9891);
      var wearDark = weather > 0.93 ? -18 : 0;

      return {
        r: _clamp(p.baseR + plankShift + gn2 + wearDark),
        g: _clamp(p.baseG + plankShift * 0.75 + gn2 * 0.75 + wearDark * 0.8),
        b: _clamp(p.baseB + plankShift * 0.5 + gn2 * 0.5 + wearDark * 0.6)
      };
    });
  }

  // ── Tree trunk (exterior trees — brown bark bottom, green canopy top) ──
  //
  // At 2x wall height, bottom half = bark with vertical crevices,
  // top half = dense layered leaf canopy. Texture is 64×64 but
  // renders over 2× the normal column height, so the bark/leaf
  // split falls at the visual midpoint.

  function _genTreeTrunk(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var leafLine = Math.floor(S * 0.45); // Top 55% is canopy, bottom 45% bark

      if (y >= leafLine) {
        // ── Bark (bottom portion) ──
        // Vertical crevices with organic irregularity
        var barkCol = Math.floor(x / 5);
        var crevice = x % 5;
        var isCrevice = crevice === 0;

        if (isCrevice) {
          var cn = _hash(x + 7000, y + 7100) * 8;
          return {
            r: _clamp(p.barkR * 0.5 + cn),
            g: _clamp(p.barkG * 0.5 + cn * 0.6),
            b: _clamp(p.barkB * 0.5 + cn * 0.3)
          };
        }

        // Bark surface — rough with vertical grain
        var grain = Math.sin(y * 0.8 + barkCol * 2.5) * 0.3;
        var barkNoise = (_hash(x + 7200, y + 7300) - 0.5) * 20;
        var colNoise = (_hash(barkCol, barkCol + 11) - 0.5) * 12;

        return {
          r: _clamp(p.barkR + barkNoise + colNoise + grain * 30),
          g: _clamp(p.barkG + barkNoise * 0.7 + colNoise * 0.6),
          b: _clamp(p.barkB + barkNoise * 0.4 + colNoise * 0.3)
        };
      }

      // ── Canopy (top portion) ──
      // Dense leaves with highlight clusters and shadow patches
      var leafCluster = _hash(Math.floor(x / 6), Math.floor(y / 5));
      var isHighlight = leafCluster > 0.65;
      var isShadow = leafCluster < 0.2;

      var leafNoise = (_hash(x + 7400, y + 7500) - 0.5) * 18;
      var depthNoise = (_hash(x * 3 + 100, y * 3 + 200) - 0.5) * 10;

      // Transition zone — bark showing through sparse leaves near trunk line
      var transBlend = 0;
      if (y > leafLine - 5) {
        transBlend = (y - (leafLine - 5)) / 5;
        transBlend *= _hash(x + 7600, y + 7700) > 0.4 ? 0 : 1;
      }

      var lr, lg, lb;
      if (isHighlight) {
        lr = p.leafHiR + leafNoise * 0.8;
        lg = p.leafHiG + leafNoise;
        lb = p.leafHiB + leafNoise * 0.4;
      } else if (isShadow) {
        lr = p.leafR * 0.65 + leafNoise * 0.4;
        lg = p.leafG * 0.7 + leafNoise * 0.6;
        lb = p.leafB * 0.5 + leafNoise * 0.3;
      } else {
        lr = p.leafR + leafNoise * 0.6 + depthNoise;
        lg = p.leafG + leafNoise + depthNoise * 0.5;
        lb = p.leafB + leafNoise * 0.3 + depthNoise * 0.2;
      }

      // Blend bark through at transition zone
      if (transBlend > 0) {
        var bn = (_hash(x + 7200, y + 7300) - 0.5) * 15;
        lr = lr * (1 - transBlend) + (p.barkR + bn) * transBlend;
        lg = lg * (1 - transBlend) + (p.barkG + bn * 0.6) * transBlend;
        lb = lb * (1 - transBlend) + (p.barkB + bn * 0.3) * transBlend;
      }

      return { r: _clamp(lr), g: _clamp(lg), b: _clamp(lb) };
    });
  }

  // ── Shrub / hedge — dense foliage, no bark, ragged top edge ──
  // Unlike tree_trunk (bark below, canopy above), a shrub is all leaf
  // with occasional twig glimpses. The top ~20% has an irregular edge
  // (some pixels transparent-ish / darker to break the silhouette).

  function _genShrub(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;

      // ── Irregular top edge ──
      // Hash-based ragged skyline: some columns are shorter than others
      var colSeed = _hash(x * 7 + 3000, 3001);
      var topLine = Math.floor(S * (0.12 + colSeed * 0.18)); // 12-30% from top
      if (y < topLine) {
        // Above the hedge edge — "empty" (dark void, will be sky in-game)
        // Use very dark green so it blends if the bg-fill isn't perfect
        return { r: 8, g: 12, b: 6 };
      }

      // ── Occasional twig/stem ──
      var twigChance = _hash(x + 8000, y + 8100);
      var isTwig = twigChance > 0.92 && (x % 7 < 2);
      if (isTwig) {
        var tn = (_hash(x + 8200, y + 8300) - 0.5) * 10;
        return {
          r: _clamp(p.stemR + tn),
          g: _clamp(p.stemG + tn * 0.6),
          b: _clamp(p.stemB + tn * 0.3)
        };
      }

      // ── Leaf clusters (main body) ──
      var cluster = _hash(Math.floor(x / 5), Math.floor(y / 4) + 500);
      var isHighlight = cluster > 0.6;
      var isShadow = cluster < 0.25;

      var noise = (_hash(x + 8400, y + 8500) - 0.5) * 16;
      var depth = (_hash(x * 2 + 300, y * 2 + 400) - 0.5) * 8;

      // Darken near top edge for depth gradient
      var topFade = 1.0;
      if (y < topLine + 6) {
        topFade = 0.6 + 0.4 * ((y - topLine) / 6);
      }

      var lr, lg, lb;
      if (isHighlight) {
        lr = p.leafHiR + noise * 0.7;
        lg = p.leafHiG + noise;
        lb = p.leafHiB + noise * 0.4;
      } else if (isShadow) {
        lr = p.leafR * 0.6 + noise * 0.3;
        lg = p.leafG * 0.65 + noise * 0.5;
        lb = p.leafB * 0.5 + noise * 0.2;
      } else {
        lr = p.leafR + noise * 0.5 + depth;
        lg = p.leafG + noise * 0.8 + depth * 0.4;
        lb = p.leafB + noise * 0.3 + depth * 0.2;
      }

      return {
        r: _clamp(lr * topFade),
        g: _clamp(lg * topFade),
        b: _clamp(lb * topFade)
      };
    });
  }

  // ── Pier wall (horizontal ship-lap, salt-stained, chunky pixel-art) ──
  //
  // Waterfront building exterior: dark weathered horizontal planks with
  // blue-grey salt staining. Reads as "dock warehouse / fish market" —
  // distinct from interior wood_plank (lighter, vertical grain) and
  // concrete (grey slabs, land-side). Matches shrub chunk style.

  function _genWallPier(id, p) {
    var plankH = 8;   // horizontal plank height (chunky)
    var gapH   = 2;   // dark gap between planks
    var postW  = 6;   // vertical support posts every 32px
    var postInterval = 32;
    var nailInterval = 16; // nail every 16px along each plank

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;

      // ── Vertical support post ──
      var postLocal = x % postInterval;
      var isPost = postLocal < postW;
      if (isPost) {
        var postTone = (_hash(x + 900, Math.floor(y / 6) + 910) - 0.5) * 8;
        // Darker than planks, minimal detail
        var edgeD = Math.min(postLocal, postW - 1 - postLocal);
        var postTier = edgeD < 1 ? 0.75 : 1.0;
        return {
          r: _clamp((p.plankR * 0.7 + postTone) * postTier),
          g: _clamp((p.plankG * 0.7 + postTone * 0.8) * postTier),
          b: _clamp((p.plankB * 0.7 + postTone * 0.5) * postTier)
        };
      }

      // ── Plank/gap band ──
      var bandY    = y % (plankH + gapH);
      var plankIdx = Math.floor(y / (plankH + gapH));
      var isGap    = bandY >= plankH;

      if (isGap) {
        var gn = (_hash(x + 920, y + 930) - 0.5) * 3;
        return {
          r: _clamp(p.gapR + gn),
          g: _clamp(p.gapG + gn),
          b: _clamp(p.gapB + gn)
        };
      }

      // ── Nail heads ──
      var localPlankY = bandY;
      var nailX = x % nailInterval;
      var isNail = (nailX >= 7 && nailX <= 9 && localPlankY >= 3 && localPlankY <= 5);
      if (isNail) {
        var nn = (_hash(x + 940, y + 950) - 0.5) * 6;
        return {
          r: _clamp(p.nailR + nn),
          g: _clamp(p.nailG + nn),
          b: _clamp(p.nailB + nn)
        };
      }

      // ── Plank body ──
      // Per-plank colour shift (strong, shrub-cluster style)
      var plankTone = (_hash(plankIdx, 960) - 0.5) * 14;
      // Salt stain patches — random blotches per plank section
      var stainZone = _hash(Math.floor(x / 12) + 970, plankIdx + 980);
      var hasStain  = stainZone > 0.65;
      // 3-tier edge shading
      var edgeDist = Math.min(localPlankY, plankH - 1 - localPlankY);
      var tier = edgeDist < 1 ? 0.78 : (edgeDist > 3 ? 1.08 : 1.0);
      // Minimal per-pixel noise
      var pn = (_hash(x + 990, y + 991) - 0.5) * 3;

      var pr, pg, pb;
      if (hasStain) {
        // Blend toward blue-grey salt stain
        pr = p.plankR * 0.6 + p.stainR * 0.4 + plankTone * 0.5;
        pg = p.plankG * 0.6 + p.stainG * 0.4 + plankTone * 0.5;
        pb = p.plankB * 0.6 + p.stainB * 0.4 + plankTone * 0.5;
      } else {
        pr = p.plankR + plankTone;
        pg = p.plankG + plankTone * 0.7;
        pb = p.plankB + plankTone * 0.4;
      }

      return {
        r: _clamp(pr * tier + pn),
        g: _clamp(pg * tier + pn * 0.8),
        b: _clamp(pb * tier + pn * 0.5)
      };
    });
  }

  // ── Breakable crate (wooden slats + cross-braces + nails) ──

  function _genCrateWood(id, p) {
    // HD breakable crate — horizontal slat planks held by dark cross-
    // braces, dome-head iron nails at intersections. Each plank has
    // per-plank color variation + 3-tier edge shading so the crate
    // reads as "smashable wooden box" at TV distance.
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2, cy = S / 2;

      // ── Frame / rim (3-tier shaded border) ──
      var frameW = 3;
      var edgeDist = Math.min(x, S - 1 - x, y, S - 1 - y);
      if (edgeDist < frameW) {
        var fTier = edgeDist === 0 ? 0.6 : (edgeDist === 1 ? 0.78 : 0.92);
        var fn = (_hash(x + 500, y + 501) - 0.5) * 4;
        return {
          r: _clamp(p.braceR * fTier + fn),
          g: _clamp(p.braceG * fTier + fn),
          b: _clamp(p.braceB * fTier + fn)
        };
      }

      // ── Cross-brace (X-shape, 4px wide, 3-tier shaded) ──
      var dx = x - cx, dy = y - cy;
      var distA = Math.abs(dx - dy);   // top-left → bottom-right
      var distB = Math.abs(dx + dy);   // top-right → bottom-left
      var braceHalf = 2.5;
      var onBraceA = distA < braceHalf;
      var onBraceB = distB < braceHalf;
      if (onBraceA || onBraceB) {
        var bDist = onBraceA ? distA : distB;
        var bTier = bDist < 0.8 ? 1.1 : (bDist < 1.6 ? 1.0 : 0.8);
        var bn = (_hash(x + 510, y + 511) - 0.5) * 4;
        return {
          r: _clamp(p.braceR * bTier + bn),
          g: _clamp(p.braceG * bTier + bn),
          b: _clamp(p.braceB * bTier + bn)
        };
      }

      // ── Dome-head nails at 5 key points ──
      var nailPositions = [
        [frameW + 1, frameW + 1], [S - frameW - 2, frameW + 1],
        [frameW + 1, S - frameW - 2], [S - frameW - 2, S - frameW - 2],
        [cx, cy]
      ];
      for (var ni = 0; ni < nailPositions.length; ni++) {
        var ndx = x - nailPositions[ni][0];
        var ndy = y - nailPositions[ni][1];
        var nDist = Math.sqrt(ndx * ndx + ndy * ndy);
        if (nDist < 2.5) {
          // Dome highlight: bright top-left, dark bottom-right
          var nShade = (ndx < 0 && ndy < 0) ? 1.2 : 0.85;
          var nHighlight = Math.max(0, 1 - nDist * 0.45) * 20;
          return {
            r: _clamp(p.nailR * nShade + nHighlight),
            g: _clamp(p.nailG * nShade + nHighlight),
            b: _clamp(p.nailB * nShade + nHighlight * 0.8)
          };
        }
      }

      // ── Horizontal plank body ──
      // Planks are ~8px tall with 1px dark gaps between them.
      var plankH = 8;
      var plankIdx = Math.floor((y - frameW) / plankH);
      var plankLocal = (y - frameW) - plankIdx * plankH;

      // Plank gap (dark seam)
      if (plankLocal < 1 && y > frameW && y < S - frameW) {
        return {
          r: _clamp(p.braceR * 0.45),
          g: _clamp(p.braceG * 0.45),
          b: _clamp(p.braceB * 0.35)
        };
      }

      // Per-plank color variation
      var plankTone = (_hash(plankIdx + 30, 88) - 0.5) * 16;

      // 3-tier: dark top/bottom edges → bright center
      var plankEdge = Math.min(plankLocal, plankH - 1 - plankLocal);
      var pTier = plankEdge < 1 ? 0.84 : (plankEdge > 3 ? 1.08 : 1.0);

      // Horizontal wood grain (broad streaks per plank)
      var grainSeed = _hash(0, plankIdx * 5 + 11) * 2.5 + 0.3;
      var grain = Math.sin(x * grainSeed + plankIdx * 4.0) * 0.5 + 0.5;
      var grainMult = grain < 0.2 ? 0.85 : (grain > 0.75 ? 1.05 : 1.0);

      var pn = (_hash(x + 520, y + 521) - 0.5) * 3;

      return {
        r: _clamp((p.baseR + plankTone) * pTier * grainMult + pn),
        g: _clamp((p.baseG + plankTone * 0.7) * pTier * grainMult + pn * 0.7),
        b: _clamp((p.baseB + plankTone * 0.4) * pTier * grainMult + pn * 0.4)
      };
    });
  }

  // ── Porthole wall (metal frame + circular ocean window) ──

  function _genPortholeWall(id, p) {
    var cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
    var radius = TEX_SIZE * 0.34;       // Window radius
    var frameThick = 3;                  // Frame ring thickness
    var mask = new Uint8Array(TEX_SIZE * TEX_SIZE); // 1 = window pixel

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Inside the glass window
      if (dist < radius - frameThick) {
        mask[y * TEX_SIZE + x] = 1;
        return { r: p.glassR, g: p.glassG, b: p.glassB };
      }

      // Frame ring (between radius-frameThick and radius+1)
      if (dist < radius + 1) {
        var rimLight = 1.0 + (dist - radius) * 0.1;
        return {
          r: _clamp(p.frameR * rimLight + 10),
          g: _clamp(p.frameG * rimLight + 10),
          b: _clamp(p.frameB * rimLight + 10)
        };
      }

      // Rivets at 8 positions around the frame
      var angle = Math.atan2(dy, dx);
      var rivetAngle = ((angle + Math.PI) / (2 * Math.PI)) * 8;
      var rivetFrac = rivetAngle - Math.floor(rivetAngle);
      if (Math.abs(rivetFrac - 0.5) < 0.12 && dist > radius && dist < radius + 4) {
        return { r: p.rivetR, g: p.rivetG, b: p.rivetB };
      }

      // Outer wall — brushed metal with panel seams
      var pn = (_hash(x + 4000, y + 4100) - 0.5) * 6;
      var seamH = (y % 32) < 1 ? -12 : 0;
      var seamV = (x % 32) < 1 ? -10 : 0;
      return {
        r: _clamp(p.frameR - 8 + pn + seamH + seamV),
        g: _clamp(p.frameG - 8 + pn + seamH + seamV),
        b: _clamp(p.frameB - 8 + pn + seamH + seamV)
      };
    });

    // Store frame data and mask for per-frame ocean compositing
    var tex = _textures[id];
    _portholes.push({
      id: id,
      frameData: new Uint8ClampedArray(tex.data),  // Copy of frame pixels
      mask: mask,
      cx: cx, cy: cy, radius: radius - frameThick,
      lookUp: false  // Wall porthole: horizontal ocean view
    });
  }

  // ── Porthole ceiling (looking up at ocean surface) ──

  function _genPortholeCeil(id, p) {
    var cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
    var radius = TEX_SIZE * 0.34;
    var frameThick = 3;
    var mask = new Uint8Array(TEX_SIZE * TEX_SIZE);

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius - frameThick) {
        mask[y * TEX_SIZE + x] = 1;
        return { r: p.glassR, g: p.glassG, b: p.glassB };
      }

      if (dist < radius + 1) {
        var rimLight = 1.0 + (dist - radius) * 0.1;
        return {
          r: _clamp(p.frameR * rimLight + 8),
          g: _clamp(p.frameG * rimLight + 8),
          b: _clamp(p.frameB * rimLight + 10)
        };
      }

      // Rivets
      var angle = Math.atan2(dy, dx);
      var rivetAngle = ((angle + Math.PI) / (2 * Math.PI)) * 8;
      var rivetFrac = rivetAngle - Math.floor(rivetAngle);
      if (Math.abs(rivetFrac - 0.5) < 0.12 && dist > radius && dist < radius + 4) {
        return { r: p.rivetR, g: p.rivetG, b: p.rivetB };
      }

      // Ceiling panel
      var pn = (_hash(x + 4200, y + 4300) - 0.5) * 5;
      return {
        r: _clamp(p.frameR - 10 + pn),
        g: _clamp(p.frameG - 10 + pn),
        b: _clamp(p.frameB - 10 + pn)
      };
    });

    var tex = _textures[id];
    _portholes.push({
      id: id,
      frameData: new Uint8ClampedArray(tex.data),
      mask: mask,
      cx: cx, cy: cy, radius: radius - frameThick,
      lookUp: true  // Ceiling porthole: looking up at surface
    });
  }

  // ── Animated texture tick ─────────────────────────────────────
  // Called once per frame by the game loop. Updates porthole textures
  // by compositing animated ocean pixels into the window regions.

  function tick(dt) {
    if (!_portholes.length) return;
    _animTime += (dt || 16);

    for (var pi = 0; pi < _portholes.length; pi++) {
      var ph = _portholes[pi];
      var tex = _textures[ph.id];
      if (!tex) continue;

      var w = tex.width, h = tex.height;
      var d = tex.data;
      var frame = ph.frameData;
      var mask = ph.mask;
      var t = _animTime;

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var mi = y * w + x;
          if (!mask[mi]) continue;  // Frame pixel — skip

          var idx = mi * 4;
          var r, g, b;

          if (ph.lookUp) {
            // Ceiling porthole: looking up at ocean surface
            // Bright caustic light from above, surface ripple pattern
            var surfDist = Math.sqrt((x - ph.cx) * (x - ph.cx) + (y - ph.cy) * (y - ph.cy)) / ph.radius;
            var caustic1 = Math.sin(x * 0.25 + t * 0.0012) * Math.sin(y * 0.2 + t * 0.0009);
            var caustic2 = Math.sin(x * 0.15 - t * 0.0007 + y * 0.12) * 0.5;
            var lightPool = Math.max(0, caustic1 + caustic2);

            // Base: dark blue, lightening toward center
            var depthFade = 1 - surfDist * 0.4;
            r = _clamp((8 + lightPool * 40) * depthFade);
            g = _clamp((25 + lightPool * 60) * depthFade);
            b = _clamp((50 + lightPool * 45) * depthFade);

            // Jellyfish silhouette — a slow-moving blob
            var jfX = (x + t * 0.008) * 0.1;
            var jfN = _hash(Math.floor(jfX) * 3 + 500, Math.floor(y * 0.12) * 3 + 600);
            if (jfN > 0.88 && surfDist < 0.7) {
              // Faint translucent creature
              r = _clamp(r + 20);
              g = _clamp(g + 30);
              b = _clamp(b + 15);
            }
          } else {
            // Wall porthole: horizontal ocean view
            // Deep water gradient (dark at bottom, slightly lighter at top)
            var depthY = y / h;
            r = _clamp(3 + (1 - depthY) * 8);
            g = _clamp(12 + (1 - depthY) * 22);
            b = _clamp(30 + (1 - depthY) * 30);

            // Caustic ripples (light from above reaching into depth)
            var caustic = Math.sin(x * 0.2 + t * 0.001) * Math.sin(y * 0.15 + t * 0.0007);
            if (caustic > 0.2) {
              var cStrength = (caustic - 0.2) * 35;
              g = _clamp(g + cStrength * 0.8);
              b = _clamp(b + cStrength * 0.5);
            }

            // Whale silhouette — large, slow, dark shape crossing horizontally
            var whaleX = (x + t * 0.005) * 0.06;
            var whaleN = _hash(Math.floor(whaleX) * 7 + 300, 0);
            var whaleY = 0.45 + (whaleN - 0.5) * 0.2;  // Vertical center varies
            var whaleDY = Math.abs(depthY - whaleY);
            var whaleShape = _hash(Math.floor(whaleX) * 7 + 301, Math.floor(y * 0.08));
            if (whaleN > 0.7 && whaleDY < 0.12 && whaleShape > 0.4) {
              // Dark whale shadow
              r = _clamp(r * 0.5);
              g = _clamp(g * 0.55);
              b = _clamp(b * 0.6);
            }

            // Jellyfish — small, scattered, faintly glowing
            var jfX2 = (x + t * 0.012) * 0.15;
            var jfY2 = (y - t * 0.003) * 0.15;
            var jfN2 = _hash(Math.floor(jfX2) * 5 + 400, Math.floor(jfY2) * 5 + 500);
            if (jfN2 > 0.82) {
              // Bioluminescent glow
              r = _clamp(r + 8);
              g = _clamp(g + 15);
              b = _clamp(b + 25);
            }
          }

          d[idx]     = r;
          d[idx + 1] = g;
          d[idx + 2] = b;
          // d[idx + 3] already 255
        }
      }

      // Write updated pixels to the canvas so drawImage picks them up
      var ctx = tex.canvas.getContext('2d');
      var imgData = ctx.createImageData(w, h);
      imgData.data.set(d);
      ctx.putImageData(imgData, 0, 0);
    }
  }

  // ── Bed texture (quilted blanket, pillow at top, wood frame) ────

  function _genBed(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;

      // Frame border (bottom 6px, sides 3px)
      if (y >= S - 6 || x < 3 || x >= S - 3) {
        var fNoise = (_hash(x + 90, y + 91) - 0.5) * 8;
        return {
          r: _clamp(p.frameR + fNoise),
          g: _clamp(p.frameG + fNoise * 0.7),
          b: _clamp(p.frameB + fNoise * 0.4)
        };
      }

      // Pillow band (top 16px)
      if (y < 16) {
        var pNoise = (_hash(x + 200, y + 201) - 0.5) * 10;
        // Pillow puff shadow — subtle sine wave
        var puffShadow = Math.sin(x * 0.3) * 6 - 3;
        return {
          r: _clamp(p.pillowR + pNoise + puffShadow),
          g: _clamp(p.pillowG + pNoise + puffShadow),
          b: _clamp(p.pillowB + pNoise + puffShadow * 0.5)
        };
      }

      // Quilted blanket — diamond quilt stitch pattern
      var qx = (x % 12) - 6;
      var qy = ((y - 16) % 12) - 6;
      var onStitch = (Math.abs(qx + qy) < 1) || (Math.abs(qx - qy) < 1);
      var stitchDarken = onStitch ? -15 : 0;

      // Color variation per quilt diamond
      var diamondSeed = _hash(Math.floor(x / 12), Math.floor((y - 16) / 12));
      var hueShift = (diamondSeed - 0.5) * 20;
      var bNoise = (_hash(x + 300, y + 301) - 0.5) * 8;

      return {
        r: _clamp(p.blanketR + hueShift + bNoise + stitchDarken),
        g: _clamp(p.blanketG + hueShift * 0.5 + bNoise * 0.7 + stitchDarken),
        b: _clamp(p.blanketB + hueShift * 0.3 + bNoise * 0.4 + stitchDarken)
      };
    });
  }

  // ── Table texture (work surface top, dark legs, cloth runner) ──

  function _genTable(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;

      // Table legs (bottom 20px, two pillars at x 8-14 and 50-56)
      if (y >= S - 20) {
        var isLeg = (x >= 8 && x < 15) || (x >= S - 15 && x < S - 8);
        if (isLeg) {
          var lNoise = (_hash(x + 400, y + 401) - 0.5) * 6;
          return {
            r: _clamp(p.legR + lNoise),
            g: _clamp(p.legG + lNoise * 0.7),
            b: _clamp(p.legB + lNoise * 0.4)
          };
        }
        // Shadow under table (dark between legs)
        return { r: 15, g: 12, b: 10 };
      }

      // Table top (upper portion) — wood grain with cloth runner down center
      var isRunner = (x >= S / 2 - 8 && x < S / 2 + 8);
      if (isRunner && y >= 6 && y < S - 24) {
        // Cloth runner texture
        var cNoise = (_hash(x + 500, y + 501) - 0.5) * 10;
        var weave = ((x + y) % 3 === 0) ? -5 : 0;
        return {
          r: _clamp(p.clothR + cNoise + weave),
          g: _clamp(p.clothG + cNoise * 0.7 + weave),
          b: _clamp(p.clothB + cNoise * 0.5 + weave)
        };
      }

      // Wood surface
      var grain = Math.sin(x * 0.4 + _hash(x, 0) * 3) * 0.5 + 0.5;
      var darkGrain = grain < 0.3 ? 0.75 : 1.0;
      var tNoise = (_hash(x + 600, y + 601) - 0.5) * 8;

      return {
        r: _clamp(p.topR * darkGrain + tNoise),
        g: _clamp(p.topG * darkGrain + tNoise * 0.7),
        b: _clamp(p.topB * darkGrain + tNoise * 0.4)
      };
    });
  }

  // ── Stash chest texture (reinforced wood box with iron bands) ──

  function _genStashChest(id, p) {
    // HD interactive chest — chunky plank structure with iron bands,
    // dome-rivet studs, brass hasp/latch, 3-tier edge shading on
    // every structural element. Should read "openable container" at
    // TV distance. Reference: HD-Minecraft reinforced chest.
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // ── Structural zones ──
      var frameW = 3;          // Outer rim
      var bandH = 5;           // Iron band height
      // Three horizontal iron bands
      var band1Top = 5;
      var band2Top = Math.floor(S / 2) - 2;  // Center
      var band3Top = S - 10;
      var onBand = (y >= band1Top && y < band1Top + bandH) ||
                   (y >= band2Top && y < band2Top + bandH) ||
                   (y >= band3Top && y < band3Top + bandH);

      // ── Outer frame (3-tier shaded rim) ──
      var edgeDist = Math.min(x, S - 1 - x, y, S - 1 - y);
      if (edgeDist < frameW) {
        var tier = edgeDist === 0 ? 0.6 : (edgeDist === 1 ? 0.75 : 0.9);
        var fn = (_hash(x + 700, y + 701) - 0.5) * 4;
        return {
          r: _clamp(p.bandR * tier + fn),
          g: _clamp(p.bandG * tier + fn),
          b: _clamp(p.bandB * tier + fn)
        };
      }

      // ── Dome-head rivets on bands ──
      // Placed every 10px along each band, 2px radius with highlight
      if (onBand) {
        var bandLocalY;
        if (y >= band1Top && y < band1Top + bandH) bandLocalY = y - band1Top;
        else if (y >= band2Top && y < band2Top + bandH) bandLocalY = y - band2Top;
        else bandLocalY = y - band3Top;

        // Check for rivet (every 10px, centered on band)
        var rivetPhase = ((x - 4) % 10);
        var rivetDx = rivetPhase - 1.5;  // center of 3px rivet
        var rivetDy = bandLocalY - Math.floor(bandH / 2);
        var rivetDist = Math.sqrt(rivetDx * rivetDx + rivetDy * rivetDy);
        if (rivetDist < 2.2) {
          // Dome rivet: bright highlight at top-left, dark edge
          var rivetLight = Math.max(0, 1 - rivetDist * 0.5) * 0.4;
          var rivetShade = (rivetDx < 0 && rivetDy < 0) ? 1.25 : 0.9;
          return {
            r: _clamp((p.bandR + 30) * rivetShade + rivetLight * 50),
            g: _clamp((p.bandG + 32) * rivetShade + rivetLight * 55),
            b: _clamp((p.bandB + 35) * rivetShade + rivetLight * 60)
          };
        }

        // Iron band body — 3-tier shading: dark edges, bright center
        var bandEdge = Math.min(bandLocalY, bandH - 1 - bandLocalY);
        var bandTier = bandEdge < 1 ? 0.8 : (bandEdge > 2 ? 1.1 : 1.0);
        var bNoise = (_hash(x + 710, y + 711) - 0.5) * 5;
        return {
          r: _clamp(p.bandR * bandTier + bNoise),
          g: _clamp(p.bandG * bandTier + bNoise),
          b: _clamp(p.bandB * bandTier + bNoise)
        };
      }

      // ── Brass hasp + latch (center of chest face) ──
      // Hasp plate: 10×8 rectangle, slightly above center
      var haspL = cx - 5, haspR = cx + 5;
      var haspT = band2Top - 4, haspB = band2Top;
      if (x >= haspL && x < haspR && y >= haspT && y < haspB) {
        var hEdge = Math.min(x - haspL, haspR - 1 - x, y - haspT, haspB - 1 - y);
        var hTier = hEdge < 1 ? 0.75 : (hEdge > 1 ? 1.15 : 1.0);
        return {
          r: _clamp(p.latchR * hTier),
          g: _clamp(p.latchG * hTier),
          b: _clamp(p.latchB * hTier)
        };
      }
      // Latch tongue (hangs below center band)
      var tongueL = cx - 3, tongueR = cx + 3;
      var tongueT = band2Top + bandH, tongueB = tongueT + 6;
      if (x >= tongueL && x < tongueR && y >= tongueT && y < tongueB) {
        var tEdge = Math.min(x - tongueL, tongueR - 1 - x);
        var tTier = tEdge < 1 ? 0.8 : 1.1;
        return {
          r: _clamp(p.latchR * tTier * 0.9),
          g: _clamp(p.latchG * tTier * 0.9),
          b: _clamp(p.latchB * tTier * 0.85)
        };
      }
      // Keyhole (dark circle in latch tongue)
      var khDx = x - cx, khDy = y - (tongueT + 3);
      if (khDx * khDx + khDy * khDy < 2.5) {
        return { r: 15, g: 12, b: 10 };
      }

      // ── Wood plank body ──
      // Vertical planks ~10px wide with 1px dark gap between them.
      // Each plank has per-plank color variation + 3-tier edge shading.
      var plankW = 10;
      var plankIdx = Math.floor(x / plankW);
      var plankLocal = x - plankIdx * plankW;

      // Plank gap (dark seam between planks)
      if (plankLocal < 1) {
        return {
          r: _clamp(p.woodR * 0.45),
          g: _clamp(p.woodG * 0.45),
          b: _clamp(p.woodB * 0.35)
        };
      }

      // Per-plank color variation (strong, like shrub clusters)
      var plankTone = (_hash(plankIdx, 77) - 0.5) * 20;

      // 3-tier shading within plank (dark edges → bright center)
      var plankEdge = Math.min(plankLocal - 1, plankW - 1 - plankLocal);
      var plankTier = plankEdge < 2 ? 0.85 : (plankEdge > 4 ? 1.08 : 1.0);

      // Wood grain — broad vertical streaks per plank
      var grainSeed = _hash(plankIdx * 3, 0) * 3.0 + 0.2;
      var grain = Math.sin(y * grainSeed + plankIdx * 5.0) * 0.5 + 0.5;
      var grainMult = grain < 0.2 ? 0.82 : (grain > 0.75 ? 1.06 : 1.0);

      // Minimal per-pixel noise (2-3 levels, not smooth)
      var pn = (_hash(x + 800, y + 801) - 0.5) * 4;

      return {
        r: _clamp((p.woodR + plankTone) * plankTier * grainMult + pn),
        g: _clamp((p.woodG + plankTone * 0.7) * plankTier * grainMult + pn * 0.7),
        b: _clamp((p.woodB + plankTone * 0.4) * plankTier * grainMult + pn * 0.4)
      };
    });
  }

  // ── Hearth texture (riverrock masonry with transparent porthole) ──
  //
  // The porthole is alpha-transparent (a=0) so the raycaster's cavity
  // pre-fill and cavity glow show through. This is the "sprite-inside-wall"
  // technique: opaque stone frame → transparent porthole → dark cavity fill
  // behind → cavity glow → fire+dragon decor sprite inside the opening.
  // Reusable pattern for: hearth, bonfire, truck hose bay, interactive walls.

  function _genHearth(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE; // 64
      var cx = S / 2;   // 32

      // ── Fully opaque riverrock masonry ──────────────────────────
      // The fire cavity is created by the step-fill (Doom rule) system
      // via a negative tileHeightOffset — the lip above the displaced
      // wall column reads as the hearth opening. No alpha porthole needed.

      // ── Soot gradient — darkens toward the top (chimney staining) ──
      var sootBlend = Math.max(0, 1 - y / (S * 0.25));
      var sootDarken = 1 - sootBlend * sootBlend * 0.4;

      // ── Riverrock masonry — irregular rounded stones ──
      var stoneW = 10;
      var stoneH = 7;
      var rowOff = (Math.floor(y / stoneH) % 2 === 0) ? 0 : stoneW / 2;
      var stoneCol = Math.floor((x + rowOff) / stoneW);
      var stoneRow = Math.floor(y / stoneH);
      var localX = (x + rowOff) - stoneCol * stoneW;
      var localY = y - stoneRow * stoneH;

      // Mortar gaps (1px border around each stone)
      if (localX < 1 || localX >= stoneW - 1 || localY < 1 || localY >= stoneH - 1) {
        var mNoise = (_hash(x + 1000, y + 1001) - 0.5) * 6;
        return {
          r: _clamp((p.mortarR + mNoise) * sootDarken),
          g: _clamp((p.mortarG + mNoise * 0.8) * sootDarken),
          b: _clamp((p.mortarB + mNoise * 0.6) * sootDarken)
        };
      }

      // Stone face — per-stone color variation + rounded edge darkening
      var stoneSeed = _hash(stoneCol * 7 + 33, stoneRow * 13 + 77);
      var stoneHue = (stoneSeed - 0.5) * 25;
      var edgeX = Math.min(localX - 1, stoneW - 2 - localX) / (stoneW / 2 - 1);
      var edgeY = Math.min(localY - 1, stoneH - 2 - localY) / (stoneH / 2 - 1);
      var edgeDarken = Math.min(edgeX, edgeY);
      edgeDarken = 0.7 + 0.3 * Math.min(1, edgeDarken * 2);
      var pixN = (_hash(x + 1100, y + 1101) - 0.5) * 8;

      return {
        r: _clamp((p.stoneR + stoneHue) * edgeDarken * sootDarken + pixN),
        g: _clamp((p.stoneG + stoneHue * 0.6) * edgeDarken * sootDarken + pixN * 0.8),
        b: _clamp((p.stoneB + stoneHue * 0.3) * edgeDarken * sootDarken + pixN * 0.6)
      };
    });
  }

  // ── Wall decor sprites (16×16, alpha-transparent) ──────────────
  // Small sprites overlaid on wall faces by the raycaster's decor
  // system. Unlike wall textures (64×64, opaque), these are 16×16
  // with alpha=0 for transparent pixels so the wall behind shows
  // through. Used for torches, grates, banners, signage.

  var DECOR_SIZE = 32;

  /** Torch bracket — iron L-bracket at bottom, teardrop flame above. */
  function _genTorchBracket(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;

      // ── Flame region (top 60%) ──
      if (y < S * 0.6) {
        // Teardrop shape: narrow at top, widens toward bracket
        var flameProgress = y / (S * 0.6); // 0=top, 1=bottom of flame
        var flameWidth = 1.0 + flameProgress * 2.5; // widens downward
        var dx = Math.abs(x - cx);
        if (dx <= flameWidth) {
          var n = (_hash(x + 5000, y + 5100) - 0.5) * 25;
          // Tip is white-yellow, body is orange
          var tipBlend = 1.0 - flameProgress;
          tipBlend = tipBlend * tipBlend; // sharper tip transition
          return {
            r: _clamp(p.flameR + (p.tipR - p.flameR) * tipBlend + n),
            g: _clamp(p.flameG + (p.tipG - p.flameG) * tipBlend + n * 0.7),
            b: _clamp(p.flameB + (p.tipB - p.flameB) * tipBlend + n * 0.3),
            a: 255
          };
        }
        return { r: 0, g: 0, b: 0, a: 0 }; // transparent
      }

      // ── Bracket region (bottom 40%) ──
      var bracketTop = Math.floor(S * 0.6);
      var by = y - bracketTop;
      var bh = S - bracketTop;

      // Vertical stem: center column 2px wide
      if (Math.abs(x - cx) <= 1) {
        var bn = (_hash(x + 5200, y + 5300) - 0.5) * 8;
        return {
          r: _clamp(p.bracketR + bn), g: _clamp(p.bracketG + bn),
          b: _clamp(p.bracketB + bn), a: 255
        };
      }

      // Horizontal arm: bottom 2 rows, extends 3px each side from center
      if (by >= bh - 2 && Math.abs(x - cx) <= 3) {
        var an = (_hash(x + 5400, y + 5500) - 0.5) * 6;
        return {
          r: _clamp(p.bracketR - 5 + an), g: _clamp(p.bracketG - 5 + an),
          b: _clamp(p.bracketB - 5 + an), a: 255
        };
      }

      return { r: 0, g: 0, b: 0, a: 0 }; // transparent
    });
  }

  /** Unlit torch — bracket silhouette identical to decor_torch but the
   *  flame region becomes a small charred wick stub. Keeps the same anchor
   *  layout so TORCH_UNLIT tiles can swap spriteId without re-tuning
   *  anchorU/anchorV/scale. */
  function _genTorchUnlit(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;

      // ── Wick stub (where the flame used to be) ──
      // Tiny charred nub at the top of the bracket arm — 3px tall,
      // 2px wide centered. Reads as "burned down to a stump."
      var stubTop = Math.floor(S * 0.48);
      var stubBot = Math.floor(S * 0.6);
      if (y >= stubTop && y < stubBot && Math.abs(x - cx) <= 1) {
        var sn = (_hash(x + 5600, y + 5700) - 0.5) * 12;
        // Ash flecks on the very top of the stub
        var isTop = y <= stubTop + 1;
        return {
          r: _clamp((isTop ? p.ashR : p.stubR) + sn),
          g: _clamp((isTop ? p.ashG : p.stubG) + sn * 0.7),
          b: _clamp((isTop ? p.ashB : p.stubB) + sn * 0.5),
          a: 255
        };
      }

      // ── Bracket region (bottom 40%) — match decor_torch layout ──
      var bracketTop = Math.floor(S * 0.6);
      if (y < bracketTop) return { r: 0, g: 0, b: 0, a: 0 };
      var by = y - bracketTop;
      var bh = S - bracketTop;

      // Vertical stem: center column 2px wide
      if (Math.abs(x - cx) <= 1) {
        var bn = (_hash(x + 5800, y + 5900) - 0.5) * 8;
        return {
          r: _clamp(p.bracketR + bn), g: _clamp(p.bracketG + bn),
          b: _clamp(p.bracketB + bn), a: 255
        };
      }

      // Horizontal arm: bottom 2 rows, extends 3px each side from center
      if (by >= bh - 2 && Math.abs(x - cx) <= 3) {
        var an = (_hash(x + 6000, y + 6100) - 0.5) * 6;
        return {
          r: _clamp(p.bracketR - 5 + an), g: _clamp(p.bracketG - 5 + an),
          b: _clamp(p.bracketB - 5 + an), a: 255
        };
      }

      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  /** Hearth fire — flame composition with dragon silhouette for porthole.
   *  Renders inside the transparent porthole of hearth_riverrock via the
   *  wall decor system. Larger and rounder than decor_torch (fills the
   *  elliptical porthole). This is the canonical "sprite-inside-wall" fire
   *  sprite — reusable for any cavity that needs visible fire. */
  function _genHearthFire(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE; // 32
      var cx = S / 2;     // 16
      var cy = S * 0.48;  // ~15, slightly above center

      // ── Flame envelope: oval shape filling most of the sprite ──
      var fRX = S * 0.42; // ~13.4 — fills porthole width
      var fRY = S * 0.46; // ~14.7 — slightly taller than wide
      var fdx = (x - cx) / fRX;
      var fdy = (y - cy) / fRY;

      // Flame tapers at top: pinch the horizontal radius for upper pixels
      var taperFactor = y < cy ? (1 - Math.pow(1 - y / cy, 1.5) * 0.55) : 1.0;
      fdx = fdx / taperFactor;
      var flameDist = fdx * fdx + fdy * fdy;

      if (flameDist > 1.0) {
        return { r: 0, g: 0, b: 0, a: 0 }; // transparent outside flame
      }

      // ── Dragon silhouette: small dark shape in the center ──
      // Crude whelp-shaped mask: oval body + triangular wing hints
      var drX = (x - cx) / 4.5;  // small body
      var drY = (y - cy - 1) / 3.5;
      var drDist = drX * drX + drY * drY;
      // Wing extensions (triangular)
      var wingL = (x < cx - 2 && y > cy - 2 && y < cy + 2) ?
        Math.max(0, 1 - Math.abs(x - (cx - 5)) / 3 - Math.abs(y - cy) / 3) : 0;
      var wingR = (x > cx + 2 && y > cy - 2 && y < cy + 2) ?
        Math.max(0, 1 - Math.abs(x - (cx + 5)) / 3 - Math.abs(y - cy) / 3) : 0;
      var isDragon = (drDist < 1.0) || (wingL > 0.3) || (wingR > 0.3);

      // ── Fire color gradient ──
      // Core (center-bottom): bright yellow-white
      // Middle: warm orange
      // Outer edge: deep red-orange
      // Dragon silhouette: dark ember with subtle red glow
      var edgeFade = Math.sqrt(flameDist); // 0=center, 1=edge
      var heightFade = Math.max(0, (y - 2) / (S - 4)); // 0=top, 1=bottom
      var coreness = (1 - edgeFade) * (0.4 + 0.6 * heightFade);
      coreness = coreness * coreness; // sharpen the core

      var fn = (_hash(x + 8800, y + 8801) - 0.5) * 20; // noise

      if (isDragon) {
        // Dragon: dark red-brown ember with shimmer potential
        return {
          r: _clamp(p.dragonR + fn * 0.5),
          g: _clamp(p.dragonG + fn * 0.3),
          b: _clamp(p.dragonB + fn * 0.2),
          a: _clamp(200 + fn)
        };
      }

      // Flame pixels
      var flameA = _clamp(255 * (1 - edgeFade * edgeFade * 0.3)); // slight fade at edge
      return {
        r: _clamp(p.outerR + (p.coreR - p.outerR) * coreness + fn),
        g: _clamp(p.outerG + (p.coreG - p.outerG) * coreness + fn * 0.6),
        b: _clamp(p.outerB + (p.coreB - p.outerB) * coreness + fn * 0.2),
        a: flameA
      };
    });
  }

  /**
   * Dragonfire emoji texture — 🔥 + translucent 🐉 overlay rendered
   * via Canvas 2D fillText. Unlike _genHearthFire (procedural oval),
   * this produces real glyphs the OS emoji font draws, matching the
   * exterior BONFIRE billboard sprite. Stored with an alpha channel
   * so the freeform cavity backdrop shows through the transparent
   * margins around the glyph.
   *
   * The raycaster samples this texture per-column in the freeform
   * cavity band, so columns at the tile center see the emoji body
   * and columns near the cell edges see alpha=0 (pure backdrop).
   */
  function _genDragonfireEmoji(id) {
    var W = 64;
    var H = 64;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── Base flame 🔥 ──
    // Large, centered, slightly low so the flame tip reads as the
    // natural focal point of the cavity.
    ctx.font = Math.floor(H * 0.82) + 'px serif';
    ctx.fillText('\uD83D\uDD25', W / 2, H * 0.56);

    // ── Dragon overlay 🐉 ──
    // Translucent, slightly bigger than the flame, nudged up so the
    // silhouette perches above the flame's hottest band — matches
    // the BonfireSprites DRAGON_OVERLAY composition.
    ctx.globalAlpha = 0.45;
    ctx.font = Math.floor(H * 0.94) + 'px serif';
    ctx.fillText('\uD83D\uDC09', W / 2, H * 0.48);
    ctx.globalAlpha = 1.0;

    // Read the composited pixels back so the raycaster's `data`-backed
    // consumers (grime pipeline, step-color sampler, etc.) can inspect
    // them. We store both the raw canvas (for ctx.drawImage) and the
    // Uint8ClampedArray (for per-pixel reads).
    var imgData;
    try {
      imgData = ctx.getImageData(0, 0, W, H);
    } catch (e) {
      // getImageData can throw on tainted canvases (unlikely here — we
      // only drew local glyphs) or in hosts without canvas support.
      // Fall back to an empty buffer so the raycaster still has a
      // `data` array to index into without crashing.
      imgData = { data: new Uint8ClampedArray(W * H * 4) };
    }
    _textures[id] = {
      width: W,
      height: H,
      canvas: canvas,
      data: imgData.data
    };
  }

  /** Iron grate — horizontal bars with gaps (dungeon air vents). */
  function _genWallGrate(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;

      // Frame border (1px around perimeter)
      if (x === 0 || x === S - 1 || y === 0 || y === S - 1) {
        return { r: p.hiR, g: p.hiG, b: p.hiB, a: 255 };
      }

      // Horizontal bars: 2px tall bars every 4px, with 2px gaps
      var localY = (y - 1) % 4;
      if (localY < 2) {
        var bn = (_hash(x + 6000, y + 6100) - 0.5) * 8;
        var isEdge = localY === 0;
        return {
          r: _clamp((isEdge ? p.hiR : p.barR) + bn),
          g: _clamp((isEdge ? p.hiG : p.barG) + bn),
          b: _clamp((isEdge ? p.hiB : p.barB) + bn),
          a: 255
        };
      }

      // Gaps between bars — transparent (wall shows through)
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  /** Wall banner — triangular pennant hanging from a rod. */
  function _genWallBanner(id, p) {
    // 32×48 (2:3 aspect) — pennant hanging with visible taper
    var bannerH = DECOR_SIZE * 1.5; // 48 at DECOR_SIZE=32
    _createTexture(id, DECOR_SIZE, bannerH, function (x, y) {
      var S = DECOR_SIZE;
      var rodH = Math.max(2, Math.floor(S / 8)); // Rod thickness scales with size

      // ── Rod (top rows) ──
      if (y < rodH) {
        if (x >= Math.floor(S * 0.1) && x <= S - Math.floor(S * 0.1) - 1) {
          var rn = (_hash(x + 7000, y + 7100) - 0.5) * 10;
          return {
            r: _clamp(p.rodR + rn), g: _clamp(p.rodG + rn),
            b: _clamp(p.rodB + rn), a: 255
          };
        }
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      // ── Fabric pennant (below rod to bottom) ──
      // Triangle: full width at top, narrows to point at bottom
      var fabricH = bannerH - rodH;
      var progress = (y - rodH) / fabricH; // 0=top, 1=bottom
      var halfW = (1.0 - progress) * (S / 2 - 2);
      var cx = S / 2;
      var dx = Math.abs(x - cx);

      if (dx <= halfW) {
        // Trim: 2px border at edges (scales with resolution)
        var isTrim = dx > halfW - 2.0;
        var fn = (_hash(x + 7200, y + 7300) - 0.5) * 12;
        // Shading: darker toward bottom
        var shade = 1.0 - progress * 0.3;
        if (isTrim) {
          return {
            r: _clamp(p.trimR * shade + fn), g: _clamp(p.trimG * shade + fn),
            b: _clamp(p.trimB * shade + fn), a: 255
          };
        }
        return {
          r: _clamp(p.fabricR * shade + fn), g: _clamp(p.fabricG * shade + fn),
          b: _clamp(p.fabricB * shade + fn), a: 255
        };
      }

      return { r: 0, g: 0, b: 0, a: 0 }; // transparent outside pennant
    });
  }

  // ── Terminal texture generators ─────────────────────────────────

  /**
   * Terminal desk wall texture (TEX_SIZE × TEX_SIZE).
   * Lower 60% = metal desk surface. Upper 40% = CRT monitor with bezel.
   * Scan lines across the screen for retro-futuristic CRT feel.
   */
  function _genTerminalWall(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var screenTop = Math.floor(S * 0.1);     // Monitor starts 10% from top
      var screenBot = Math.floor(S * 0.55);     // Monitor ends at 55%
      var deskTop   = Math.floor(S * 0.6);      // Desk surface starts at 60%
      var bezel     = 2;                         // Bezel width in pixels
      var fn = (_hash(x + 5100, y + 5200) - 0.5) * 8;

      // Monitor bezel zone
      if (y >= screenTop - bezel && y < screenBot + bezel &&
          x >= bezel && x < S - bezel) {
        // Inside screen (excluding bezel border)
        if (y >= screenTop && y < screenBot && x >= bezel + 1 && x < S - bezel - 1) {
          // CRT screen with scan lines
          var scanLine = (y % 3 === 0) ? 0.7 : 1.0;  // Dim every 3rd row
          // Fake text lines: horizontal bands of brighter green
          var textBand = (y % 7 < 4 && x > S * 0.15 && x < S * 0.85) ? 1.3 : 0.6;
          var tr = _clamp(p.screenR * scanLine * textBand + fn * 0.3);
          var tg = _clamp(p.glowR > 0 ? p.glowG * scanLine * textBand + fn * 0.5 : p.screenG * scanLine);
          var tb = _clamp(p.screenB * scanLine * textBand + fn * 0.3);
          return { r: tr, g: tg, b: tb, a: 255 };
        }
        // Bezel frame
        return { r: _clamp(p.frameR + fn), g: _clamp(p.frameG + fn), b: _clamp(p.frameB + fn), a: 255 };
      }

      // Desk surface (lower portion)
      if (y >= deskTop) {
        var dShade = 1.0 - (y - deskTop) / (S - deskTop) * 0.2;
        return {
          r: _clamp(p.deskR * dShade + fn),
          g: _clamp(p.deskG * dShade + fn),
          b: _clamp(p.deskB * dShade + fn),
          a: 255
        };
      }

      // Gap between monitor and desk (dark shadow)
      if (y >= screenBot + bezel && y < deskTop) {
        return { r: _clamp(20 + fn * 0.5), g: _clamp(18 + fn * 0.5), b: _clamp(18 + fn * 0.5), a: 255 };
      }

      // Above monitor (wall/background — dark)
      return { r: _clamp(25 + fn), g: _clamp(24 + fn), b: _clamp(26 + fn), a: 255 };
    });
  }

  /**
   * Terminal CRT screen decor sprite (DECOR_SIZE × DECOR_SIZE).
   * Floating screen with green glow, alpha-transparent background.
   * Placed on BAR_COUNTER / TERMINAL tile faces via wallDecor.
   */
  function _genTerminalDecor(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var margin = Math.floor(S * 0.1);
      var fn = (_hash(x + 6100, y + 6200) - 0.5) * 6;

      // Screen area (inset by margin)
      if (x >= margin && x < S - margin && y >= margin && y < S - margin) {
        // Bezel: 1px border
        if (x === margin || x === S - margin - 1 || y === margin || y === S - margin - 1) {
          return { r: _clamp(p.frameR + fn), g: _clamp(p.frameG + fn), b: _clamp(p.frameB + fn), a: 255 };
        }
        // Screen interior with scan lines
        var scanLine = (y % 2 === 0) ? 0.8 : 1.0;
        var textBand = ((y - margin) % 5 < 3 && x > margin + 2 && x < S - margin - 2) ? 1.4 : 0.5;
        return {
          r: _clamp(p.screenR * scanLine * textBand + fn * 0.3),
          g: _clamp(p.glowG * scanLine * textBand + fn * 0.5),
          b: _clamp(p.screenB * scanLine * textBand + fn * 0.3),
          a: 255
        };
      }

      // Outside screen — transparent
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // ── Infrastructure tile decor sprites ────────────────────────────

  // ── Ladder — two vertical rails + horizontal rungs on transparent BG ──
  //
  // 32×32 decor sprite. Two parallel rails (3px wide each) run the full
  // height. 5 evenly-spaced horizontal rungs connect them. Small iron
  // bolt dots at each rail/rung joint. Everything outside is a=0 so the
  // cavity behind shows through — the billboard sits inside the shaft.
  //
  function _genLadder(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;  // 32

      // Rail geometry — center-relative
      var cx = S / 2;               // 16
      var railHalfSpan = S * 0.28;  // ~9px — distance from center to rail center
      var railW = 1.5;              // half-width of each rail
      var leftRail  = cx - railHalfSpan;
      var rightRail = cx + railHalfSpan;

      // Is this pixel on a rail?
      var onLeftRail  = Math.abs(x - leftRail)  <= railW;
      var onRightRail = Math.abs(x - rightRail) <= railW;

      // Rung geometry — 5 evenly-spaced rungs
      var rungCount  = 5;
      var rungH      = 1.5;        // half-height of each rung
      var topPad     = 2;          // top margin before first rung
      var botPad     = 2;          // bottom margin after last rung
      var rungSpan   = S - topPad - botPad;
      var onRung     = false;
      var rungY      = -1;
      for (var ri = 0; ri < rungCount; ri++) {
        rungY = topPad + (ri + 0.5) * (rungSpan / rungCount);
        if (Math.abs(y - rungY) <= rungH) {
          // Only between the two rails
          if (x >= leftRail - railW && x <= rightRail + railW) {
            onRung = true;
          }
          break;
        }
      }

      // Bolt at rail/rung intersection — 2×2 iron dot
      var onBolt = false;
      if (onRung && (onLeftRail || onRightRail)) {
        onBolt = true;
      }

      if (!onLeftRail && !onRightRail && !onRung) {
        return { r: 0, g: 0, b: 0, a: 0 };  // transparent
      }

      // Wood noise for variation
      var n = (_hash(x + 17700, y + 17701) - 0.5) * 12;

      if (onBolt) {
        // Iron bolt
        return {
          r: _clamp(p.boltR + n * 0.5),
          g: _clamp(p.boltG + n * 0.5),
          b: _clamp(p.boltB + n * 0.5),
          a: 255
        };
      }

      if (onRung) {
        // Rung: slightly lighter wood, grain runs horizontal
        var grainH = (Math.floor(x / 3) % 2 === 0) ? 1.05 : 0.92;
        return {
          r: _clamp(p.rungR * grainH + n),
          g: _clamp(p.rungG * grainH + n * 0.8),
          b: _clamp(p.rungB * grainH + n * 0.6),
          a: 255
        };
      }

      // Rail: dark wood, grain runs vertical
      var grainV = (Math.floor(y / 3) % 2 === 0) ? 1.08 : 0.88;
      return {
        r: _clamp(p.railR * grainV + n),
        g: _clamp(p.railG * grainV + n * 0.8),
        b: _clamp(p.railB * grainV + n * 0.6),
        a: 255
      };
    });
  }

  // ── Trapdoor hatch lid — planked wood with iron hardware ────────
  //
  // 64×64 wall texture (same size as standard wall textures). Horizontal
  // planks with a 2px iron frame border, two hinge plates on the left
  // edge, and a pull ring handle right of center.
  //
  function _genTrapdoorLid(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;  // 64
      var n = (_hash(x + 18800, y + 18801) - 0.5) * 10;

      // Iron frame border — 2px on all edges
      var frameW = 2;
      if (x < frameW || x >= S - frameW || y < frameW || y >= S - frameW) {
        return {
          r: _clamp(p.hingeR + n * 0.3),
          g: _clamp(p.hingeG + n * 0.3),
          b: _clamp(p.hingeB + n * 0.3),
          a: 255
        };
      }

      // Hinge plates — two rectangular plates on left side
      var hingeW = 10;
      var hingeH = 6;
      var hinge1Y = S * 0.25;
      var hinge2Y = S * 0.72;
      var onHinge = (x >= frameW && x < frameW + hingeW) &&
                    ((Math.abs(y - hinge1Y) < hingeH / 2) ||
                     (Math.abs(y - hinge2Y) < hingeH / 2));
      if (onHinge) {
        // Hinge bolt at center
        var hingeCenter = frameW + hingeW / 2;
        var hingeCY = (Math.abs(y - hinge1Y) < hingeH / 2) ? hinge1Y : hinge2Y;
        if (Math.abs(x - hingeCenter) < 1.5 && Math.abs(y - hingeCY) < 1.5) {
          return { r: _clamp(p.boltR + n * 0.3), g: _clamp(p.boltG + n * 0.3),
                   b: _clamp(p.boltB + n * 0.3), a: 255 };
        }
        return { r: _clamp(p.hingeR + 5 + n * 0.3), g: _clamp(p.hingeG + 5 + n * 0.3),
                 b: _clamp(p.hingeB + 5 + n * 0.3), a: 255 };
      }

      // Pull ring handle — small iron circle right of center
      var handleCX = S * 0.58;
      var handleCY = S * 0.50;
      var handleR = 4;
      var dx = x - handleCX;
      var dy = y - handleCY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= handleR - 1.5 && dist <= handleR + 1.0) {
        return { r: _clamp(p.handleR + n * 0.3), g: _clamp(p.handleG + n * 0.3),
                 b: _clamp(p.handleB + n * 0.3), a: 255 };
      }

      // Wood planks — horizontal, ~10px tall each with dark seam lines
      var plankH = 10;
      var plankIdx = Math.floor((y - frameW) / plankH);
      var inPlank = (y - frameW) - plankIdx * plankH;
      // Seam at plank boundary — dark line
      if (inPlank === 0 && y > frameW) {
        return { r: _clamp(p.baseR * 0.5 + n * 0.3),
                 g: _clamp(p.baseG * 0.5 + n * 0.3),
                 b: _clamp(p.baseB * 0.5 + n * 0.3), a: 255 };
      }
      // Wood grain — subtle horizontal stripes, alternate per plank
      var grain = (Math.floor(x / 4 + plankIdx * 7) % 2 === 0) ? 1.06 : 0.92;
      // Per-plank color shift for variety
      var plankShift = ((plankIdx * 31 + 17) % 7 - 3) * 2;

      return {
        r: _clamp(p.baseR * grain + plankShift + n),
        g: _clamp(p.baseG * grain + plankShift * 0.8 + n * 0.8),
        b: _clamp(p.baseB * grain + plankShift * 0.6 + n * 0.6),
        a: 255
      };
    });
  }

  // Rope + bucket — hemp rope descending from top, wooden bucket at bottom.
  function _genRopeBucket(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;
      // Rope: 2px wide vertical line, slight sway
      var sway = Math.sin(y * 0.3) * 1.5;
      var ropeX = cx + sway;
      if (Math.abs(x - ropeX) < 1.5 && y < S * 0.55) {
        var rn = (_hash(x + 13500, y + 13501) - 0.5) * 8;
        // Rope twist pattern: alternating light/dark every 3px
        var twist = (Math.floor(y / 3) % 2 === 0) ? 1.1 : 0.85;
        return {
          r: _clamp(p.ropeR * twist + rn), g: _clamp(p.ropeG * twist + rn * 0.8),
          b: _clamp(p.ropeB * twist + rn * 0.6), a: 255
        };
      }
      // Bucket: rounded rectangle at bottom
      var bucketTop = S * 0.5;
      var bucketW = S * 0.35;
      if (y >= bucketTop && y < S - 2) {
        var dx = Math.abs(x - cx);
        // Bucket tapers slightly: wider at top, narrower at bottom
        var taper = 1.0 - (y - bucketTop) / (S - 2 - bucketTop) * 0.15;
        var halfW = bucketW * taper;
        if (dx <= halfW) {
          // Iron bands at top and bottom
          var bandY = (y < bucketTop + 2 || y > S - 5);
          if (bandY) {
            return { r: _clamp(p.bandR), g: _clamp(p.bandG), b: _clamp(p.bandB), a: 255 };
          }
          // Wood staves with curvature
          var curveDim = 1.0 - (dx / halfW) * 0.2;
          var bn = (_hash(x + 13600, y + 13601) - 0.5) * 6;
          return {
            r: _clamp(p.bucketR * curveDim + bn), g: _clamp(p.bucketG * curveDim + bn * 0.8),
            b: _clamp(p.bucketB * curveDim + bn * 0.6), a: 255
          };
        }
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Pinned note — single curled parchment with pushpin at top.
  function _genPinnedNote(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var margin = 4;
      // Note rectangle with curled bottom-right corner
      if (x >= margin && x < S - margin && y >= margin && y < S - margin) {
        // Curled corner: bottom-right triangle is transparent
        var curlSize = 6;
        var fromRight = S - margin - x;
        var fromBot = S - margin - y;
        if (fromRight < curlSize && fromBot < curlSize && fromRight + fromBot < curlSize) {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        // Pushpin at top-center
        if (x >= S / 2 - 2 && x <= S / 2 + 2 && y >= margin && y < margin + 4) {
          return { r: p.pinR, g: p.pinG, b: p.pinB, a: 255 };
        }
        // Fake text lines
        var textLine = (y - margin) % 5 < 2 && x > margin + 3 && x < S - margin - 3;
        if (textLine && y > margin + 5) {
          var tn = (_hash(x + 13700, y + 13701) - 0.5) * 6;
          return { r: _clamp(p.inkR + tn), g: _clamp(p.inkG + tn), b: _clamp(p.inkB + tn), a: 220 };
        }
        // Paper surface
        var pn = (_hash(x + 13800, y + 13801) - 0.5) * 5;
        return {
          r: _clamp(p.paperR + pn), g: _clamp(p.paperG + pn * 0.8),
          b: _clamp(p.paperB + pn * 0.6), a: 245
        };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Ladle — wooden handle angled upward from lower-left to upper-right.
  function _genLadle(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      // Handle: diagonal line from bottom-left to upper-centre
      var handleStart = { x: S * 0.2, y: S * 0.85 };
      var handleEnd = { x: S * 0.6, y: S * 0.15 };
      // Distance from line segment
      var lx = handleEnd.x - handleStart.x;
      var ly = handleEnd.y - handleStart.y;
      var len = Math.sqrt(lx * lx + ly * ly);
      var t = ((x - handleStart.x) * lx + (y - handleStart.y) * ly) / (len * len);
      t = Math.max(0, Math.min(1, t));
      var closestX = handleStart.x + t * lx;
      var closestY = handleStart.y + t * ly;
      var dist = Math.sqrt((x - closestX) * (x - closestX) + (y - closestY) * (y - closestY));
      if (dist < 2) {
        var hn = (_hash(x + 13900, y + 13901) - 0.5) * 6;
        return { r: _clamp(p.handleR + hn), g: _clamp(p.handleG + hn * 0.8), b: _clamp(p.handleB + hn * 0.6), a: 255 };
      }
      // Bowl: small circle at bottom of handle
      var bowlCx = S * 0.3, bowlCy = S * 0.75, bowlR = 4;
      var bdx = x - bowlCx, bdy = y - bowlCy;
      var bowlDist = Math.sqrt(bdx * bdx + bdy * bdy);
      if (bowlDist < bowlR) {
        var edge = bowlDist / bowlR;
        var bn = (_hash(x + 14000, y + 14001) - 0.5) * 4;
        return {
          r: _clamp(p.bowlR * (0.8 + edge * 0.2) + bn),
          g: _clamp(p.bowlG * (0.8 + edge * 0.2) + bn),
          b: _clamp(p.bowlB * (0.8 + edge * 0.2) + bn),
          a: 255
        };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Spark cluster — small bright points radiating from centre.
  function _genSpark(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2, cy = S / 2;
      // 5-7 spark rays radiating from centre
      var angle = Math.atan2(y - cy, x - cx);
      var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      // Spark rays at specific angles
      var rayIdx = Math.floor((angle + Math.PI) / (Math.PI * 2) * 7);
      var rayAngle = rayIdx * (Math.PI * 2 / 7) - Math.PI;
      var angleDiff = Math.abs(angle - rayAngle);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
      // Ray width narrows with distance
      var rayWidth = 0.3 - dist / S * 0.2;
      if (angleDiff < rayWidth && dist < S * 0.4 && dist > 1) {
        var brightness = 1.0 - dist / (S * 0.4);
        return {
          r: _clamp(p.coreR * brightness + p.outerR * (1 - brightness)),
          g: _clamp(p.coreG * brightness + p.outerG * (1 - brightness)),
          b: _clamp(p.coreB * brightness + p.outerB * (1 - brightness)),
          a: _clamp(255 * brightness)
        };
      }
      // Central core glow
      if (dist < 3) {
        return { r: p.coreR, g: p.coreG, b: p.coreB, a: 255 };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Conduit glow — vertical energy pulse streak (blue).
  function _genConduitGlow(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;
      var dx = Math.abs(x - cx);
      // Vertical streak: bright centre, soft edges
      var maxW = S * 0.2;
      if (dx > maxW) return { r: 0, g: 0, b: 0, a: 0 };
      var falloff = 1.0 - dx / maxW;
      falloff = falloff * falloff; // quadratic
      // Pulse segments: brighter bands every 6px
      var pulse = (y % 6 < 3) ? 1.0 : 0.6;
      var pn = (_hash(x + 14100, y + 14101) - 0.5) * 10;
      return {
        r: _clamp((p.coreR * falloff + p.outerR * (1 - falloff)) * pulse + pn),
        g: _clamp((p.coreG * falloff + p.outerG * (1 - falloff)) * pulse + pn),
        b: _clamp((p.coreB * falloff + p.outerB * (1 - falloff)) * pulse + pn),
        a: _clamp(200 * falloff * pulse)
      };
    });
  }

  // Toggle indicator light — small circular lamp with glow halo.
  function _genToggleLight(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2, cy = S / 2;
      var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      // Glass bulb: solid circle radius 4
      if (dist < 4) {
        var edge = dist / 4;
        return {
          r: _clamp(p.glassR * (1.2 - edge * 0.4)),
          g: _clamp(p.glassG * (1.2 - edge * 0.4)),
          b: _clamp(p.glassB * (1.2 - edge * 0.4)),
          a: 255
        };
      }
      // Glow halo: soft falloff to radius 10
      if (dist < 10) {
        var glow = 1.0 - (dist - 4) / 6;
        glow = glow * glow;
        return {
          r: _clamp(p.glowR), g: _clamp(p.glowG), b: _clamp(p.glowB),
          a: _clamp(150 * glow)
        };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // ── Hazard-adjacent wall decor ──────────────────────────────────

  // Scorch mark — irregular soot/burn stain. Darkest at centre,
  // fading to transparent at edges. Organic noise-shaped.
  function _genScorch(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2, cy = S * 0.6; // centre-bottom weighted
      var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      // Organic edge: noise-modulated radius
      var noiseDist = dist + (_hash(x + 14200, y + 14201) - 0.5) * 8;
      var maxR = S * 0.4;
      if (noiseDist > maxR) return { r: 0, g: 0, b: 0, a: 0 };
      var falloff = 1.0 - noiseDist / maxR;
      // Darker at centre, brown soot at edges
      var mix = falloff;
      return {
        r: _clamp(p.darkR * mix + p.midR * (1 - mix)),
        g: _clamp(p.darkG * mix + p.midG * (1 - mix)),
        b: _clamp(p.darkB * mix + p.midB * (1 - mix)),
        a: _clamp(200 * falloff)
      };
    });
  }

  // Acid drip — green ooze dripping down from top. Multiple drip
  // lines at random X positions, widening at bottom into pool.
  function _genAcidDrip(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      // 3-4 drip lines at deterministic X positions
      var numDrips = 3;
      for (var di = 0; di < numDrips; di++) {
        var dripX = Math.floor(_hash(di + 14300, 0) * (S - 6) + 3);
        var dripLen = Math.floor(_hash(di + 14301, 1) * S * 0.5 + S * 0.3);
        var dx = Math.abs(x - dripX);
        // Drip widens toward bottom
        var progress = y / dripLen;
        var width = 1 + progress * 2;
        if (dx < width && y < dripLen) {
          // Bright highlight at drip edge
          var edge = dx / width;
          var pn = (_hash(x + 14400, y + 14401) - 0.5) * 6;
          if (edge > 0.5) {
            return { r: _clamp(p.hiR + pn), g: _clamp(p.hiG + pn), b: _clamp(p.hiB + pn), a: _clamp(220 * (1 - edge)) };
          }
          return {
            r: _clamp(p.dripR * (1 - progress * 0.3) + pn * 0.5),
            g: _clamp(p.dripG * (1 - progress * 0.3) + pn),
            b: _clamp(p.dripB * (1 - progress * 0.3) + pn * 0.3),
            a: _clamp(240 - progress * 40)
          };
        }
        // Pool at bottom of each drip
        if (y >= dripLen && y < dripLen + 4 && dx < 3 + (dripLen + 4 - y)) {
          return { r: _clamp(p.poolR), g: _clamp(p.poolG), b: _clamp(p.poolB), a: 180 };
        }
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Warning scratches — diagonal claw/tool marks gouged into stone.
  function _genWarningScratches(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      // 3 diagonal scratch lines from upper-left to lower-right
      for (var si = 0; si < 3; si++) {
        var offset = si * 7 - 7;
        // Line: y = x + offset (45-degree diagonal)
        var lineDist = Math.abs((y - S * 0.3) - (x - S * 0.3 + offset)) / 1.414;
        // Only in the central area
        var inBounds = x > 4 && x < S - 4 && y > 4 && y < S - 4;
        if (lineDist < 2.5 && inBounds) {
          var depth = 1.0 - lineDist / 2.5;
          if (lineDist < 1) {
            // Deep gouge shadow
            return { r: _clamp(p.deepR), g: _clamp(p.deepG), b: _clamp(p.deepB), a: _clamp(220 * depth) };
          }
          // Exposed stone at edges
          return {
            r: _clamp(p.scratchR), g: _clamp(p.scratchG), b: _clamp(p.scratchB),
            a: _clamp(180 * depth)
          };
        }
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // ── Biome variety wall decor ────────────────────────────────────

  // Wanted poster — rectangular parchment with border and text lines.
  function _genWantedPoster(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var margin = 3;
      // Poster rectangle
      if (x < margin || x >= S - margin || y < margin || y >= S - margin) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      // Dark border (2px inset)
      var bx = x - margin, by = y - margin;
      var bw = S - margin * 2, bh = S - margin * 2;
      if (bx < 2 || bx >= bw - 2 || by < 2 || by >= bh - 2) {
        return { r: _clamp(p.borderR), g: _clamp(p.borderG), b: _clamp(p.borderB), a: 250 };
      }
      // "WANTED" header (top band, thicker text)
      if (by < 8 && bx > 4 && bx < bw - 4) {
        var headerLine = by % 3 < 2;
        if (headerLine) {
          return { r: _clamp(p.textR), g: _clamp(p.textG), b: _clamp(p.textB), a: 240 };
        }
      }
      // Text lines (body)
      var textLine = (by > 10 && by % 4 < 1 && bx > 3 && bx < bw - 3);
      if (textLine) {
        var tlen = _hash(Math.floor(by / 4) + 14500, 0);
        if (bx < bw * tlen * 0.6 + bw * 0.2) {
          return { r: _clamp(p.textR + 10), g: _clamp(p.textG + 8), b: _clamp(p.textB + 5), a: 200 };
        }
      }
      // Paper
      var pn = (_hash(x + 14600, y + 14601) - 0.5) * 5;
      return { r: _clamp(p.paperR + pn), g: _clamp(p.paperG + pn), b: _clamp(p.paperB + pn * 0.8), a: 240 };
    });
  }

  // Cobweb — delicate web radiating from upper corner. Strands fan
  // out from the top-left anchor point.
  function _genCobweb(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      // Anchor at top-left (2,2)
      var ax = 2, ay = 2;
      var dx = x - ax, dy = y - ay;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > S * 0.85 || dist < 1) return { r: 0, g: 0, b: 0, a: 0 };
      // Radial strands: 5 lines fanning from anchor
      var angle = Math.atan2(dy, dx);
      var numStrands = 5;
      var closest = Math.PI;
      for (var si = 0; si < numStrands; si++) {
        var strandAngle = (si / numStrands) * Math.PI * 0.5 + 0.05; // 0 to 90 degrees
        var diff = Math.abs(angle - strandAngle);
        if (diff < closest) closest = diff;
      }
      // Strand visibility: thin line near strand angles
      var strandThickness = 0.08 + dist / S * 0.04;
      if (closest < strandThickness) {
        var alpha = (1 - closest / strandThickness) * (1 - dist / (S * 0.85)) * 0.7;
        return { r: p.anchorR, g: p.anchorG, b: p.anchorB, a: _clamp(255 * alpha) };
      }
      // Concentric catch-threads: arcs at regular distances
      var arcSpacing = S * 0.18;
      var arcDist = dist % arcSpacing;
      if (arcDist < 1.5 && angle > 0.05 && angle < Math.PI * 0.5 - 0.05) {
        var alpha2 = (1 - arcDist / 1.5) * (1 - dist / (S * 0.85)) * 0.5;
        return { r: p.silkR, g: p.silkG, b: p.silkB, a: _clamp(255 * alpha2) };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Stress crack — jagged line with shadow depth and exposed edge.
  function _genCrack(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      // Jagged vertical crack from top to bottom with horizontal jitter
      var crackX = S / 2;
      for (var cy = 0; cy <= y; cy += 3) {
        crackX += (_hash(cy + 14700, 0) - 0.5) * 4;
      }
      var dist = Math.abs(x - crackX);
      // Main crack: 2px wide with edge highlight
      if (dist < 3 && y > 2 && y < S - 2) {
        if (dist < 1.2) {
          // Deep shadow
          var depth = 1.0 - dist / 1.2;
          return { r: _clamp(p.crackR), g: _clamp(p.crackG), b: _clamp(p.crackB), a: _clamp(230 * depth) };
        }
        // Edge highlight (exposed stone)
        var edgeAlpha = 1.0 - (dist - 1.2) / 1.8;
        return { r: _clamp(p.edgeR), g: _clamp(p.edgeG), b: _clamp(p.edgeB), a: _clamp(180 * edgeAlpha) };
      }
      // Branch cracks (smaller, at random Y positions)
      for (var bi = 0; bi < 2; bi++) {
        var branchY = Math.floor(_hash(bi + 14800, 0) * S * 0.6 + S * 0.2);
        if (Math.abs(y - branchY) < 1) {
          var branchDist = Math.abs(x - crackX);
          var branchLen = _hash(bi + 14801, 1) * 6 + 3;
          if (branchDist < branchLen && branchDist > 0.5) {
            var ba = 1.0 - branchDist / branchLen;
            return { r: _clamp(p.crackR + 15), g: _clamp(p.crackG + 12), b: _clamp(p.crackB + 10), a: _clamp(160 * ba) };
          }
        }
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Hanging chain — vertical chain with linked oval loops.
  function _genChain(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;
      // Chain links: alternating vertical and horizontal ovals
      var linkH = 6;  // each link is 6px tall
      var linkIdx = Math.floor(y / linkH);
      var ly = y % linkH;
      var isHoriz = linkIdx % 2 === 0;
      // Link shape: oval ring (outline only)
      var ovalW = isHoriz ? 4 : 3;
      var ovalH = linkH / 2;
      var ovalCy = linkH / 2;
      var dx = Math.abs(x - cx);
      var dy = Math.abs(ly - ovalCy);
      // Parametric oval distance
      var oDist = (dx * dx) / (ovalW * ovalW) + (dy * dy) / (ovalH * ovalH);
      // Ring: between 0.5 and 1.0 on the oval
      if (oDist > 0.3 && oDist < 1.0) {
        var edge = oDist > 0.65 ? 0.85 : 1.15; // inner shadow, outer highlight
        var ln = (_hash(x + 14900, y + 14901) - 0.5) * 5;
        return {
          r: _clamp((oDist < 0.65 ? p.hiR : p.linkR) * edge + ln),
          g: _clamp((oDist < 0.65 ? p.hiG : p.linkG) * edge + ln),
          b: _clamp((oDist < 0.65 ? p.hiB : p.linkB) * edge + ln),
          a: 255
        };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // Moss patch — organic green growth on dungeon walls.
  // Irregular patch shape using noise-modulated radius from centre.
  function _genMoss(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S * 0.5, cy = S * 0.55;  // Slightly bottom-weighted
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      // Organic edge — noise-modulated boundary
      var noiseDist = dist + (_hash(x + 16100, y + 16101) - 0.5) * 7;
      var maxR = S * 0.38;
      if (noiseDist > maxR) return { r: 0, g: 0, b: 0, a: 0 };
      var falloff = 1.0 - noiseDist / maxR;
      // Root tendrils reaching outward
      var angle = Math.atan2(dy, dx);
      var tendril = Math.abs(Math.sin(angle * 5 + dist * 0.4));
      if (tendril > 0.85 && dist > maxR * 0.5) {
        var ta = falloff * 0.5;
        return { r: _clamp(p.rootR), g: _clamp(p.rootG), b: _clamp(p.rootB), a: _clamp(200 * ta) };
      }
      // Highlight clumps
      var n = _hash(x * 3 + 16200, y * 3 + 16201);
      var isHi = n > 0.7;
      var pn = (_hash(x + 16300, y + 16301) - 0.5) * 8;
      return {
        r: _clamp((isHi ? p.hiR : p.baseR) + pn * 0.5),
        g: _clamp((isHi ? p.hiG : p.baseG) + pn),
        b: _clamp((isHi ? p.hiB : p.baseB) + pn * 0.3),
        a: _clamp(220 * falloff)
      };
    });
  }

  // Water stain — vertical mineral deposit streak down a dungeon wall.
  // Widest at top (source), tapering to a drip line at bottom.
  function _genWaterStain(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S * 0.5;
      // Main stain — widens at top (source), narrows at bottom
      var progress = y / S;
      var width = (1.0 - progress * 0.6) * S * 0.3;
      var jitter = (_hash(Math.floor(y / 3) + 16400, 0) - 0.5) * 3;
      var dist = Math.abs(x - cx - jitter);
      if (dist > width) return { r: 0, g: 0, b: 0, a: 0 };
      var edge = dist / width;
      // Bright mineral edge at boundary
      if (edge > 0.6) {
        var ea = (1.0 - edge) / 0.4 * (1.0 - progress * 0.3);
        return { r: _clamp(p.dripR), g: _clamp(p.dripG), b: _clamp(p.dripB), a: _clamp(160 * ea) };
      }
      // Dark wet centre
      var pn = (_hash(x + 16500, y + 16501) - 0.5) * 6;
      var mix = progress * 0.4;  // Gets lighter toward bottom
      return {
        r: _clamp(p.wetR + (p.stainR - p.wetR) * mix + pn),
        g: _clamp(p.wetG + (p.stainG - p.wetG) * mix + pn),
        b: _clamp(p.wetB + (p.stainB - p.wetB) * mix + pn),
        a: _clamp(180 * (1.0 - edge * 0.5) * (1.0 - progress * 0.2))
      };
    });
  }

  // Iron hook — wall-mounted utility hook on a small mounting plate.
  // Plate at top, curved hook prong below.
  function _genHook(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;
      // Mounting plate: small rectangle at top-centre
      var plateW = 6, plateH = 5;
      var plateX = cx - plateW / 2, plateY = S * 0.15;
      if (x >= plateX && x < plateX + plateW && y >= plateY && y < plateY + plateH) {
        var pe = (x === Math.floor(plateX) || x === Math.floor(plateX + plateW - 1) ||
                  y === Math.floor(plateY) || y === Math.floor(plateY + plateH - 1));
        var pn = (_hash(x + 16600, y + 16601) - 0.5) * 5;
        if (pe) {
          return { r: _clamp(p.hiR + pn), g: _clamp(p.hiG + pn), b: _clamp(p.hiB + pn), a: 255 };
        }
        return { r: _clamp(p.plateR + pn), g: _clamp(p.plateG + pn), b: _clamp(p.plateB + pn), a: 255 };
      }
      // Hook stem: vertical line from plate bottom
      var stemTop = plateY + plateH;
      var stemBot = S * 0.55;
      if (Math.abs(x - cx) < 1.5 && y >= stemTop && y <= stemBot) {
        var ln = (_hash(x + 16700, y + 16701) - 0.5) * 5;
        return { r: _clamp(p.ironR + ln), g: _clamp(p.ironG + ln), b: _clamp(p.ironB + ln), a: 255 };
      }
      // Hook curve: quarter-circle curving right then up
      var hookCX = cx + 3;
      var hookCY = stemBot;
      var hookR = 5;
      var hDx = x - hookCX, hDy = y - hookCY;
      var hDist = Math.sqrt(hDx * hDx + hDy * hDy);
      // Ring: draw only the lower-right quadrant arc
      if (hDist > hookR - 2 && hDist < hookR + 1.5 && hDy >= -1 && hDx >= -3) {
        var edge = Math.abs(hDist - hookR);
        var ln2 = (_hash(x + 16800, y + 16801) - 0.5) * 4;
        if (edge < 1) {
          return { r: _clamp(p.hiR + ln2), g: _clamp(p.hiG + ln2), b: _clamp(p.hiB + ln2), a: 255 };
        }
        return { r: _clamp(p.ironR + ln2), g: _clamp(p.ironG + ln2), b: _clamp(p.ironB + ln2), a: _clamp(200) };
      }
      // Hook tip: pointed end curving upward
      var tipX = hookCX + hookR - 1;
      var tipY = hookCY - 1;
      if (Math.abs(x - tipX) < 1.5 && y >= tipY - 3 && y <= tipY) {
        return { r: _clamp(p.hiR), g: _clamp(p.hiG), b: _clamp(p.hiB), a: 240 };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  }

  // ── Torch wall texture ──────────────────────────────────────────
  // Stone wall with centered iron bracket and torch. Lit variant has
  // orange flame + ember sparks; unlit has charred stub + soot stains.

  function _genTorchWall(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = Math.floor(S / 2);

      // ── Iron bracket: vertical stem + horizontal arm ──
      var bracketW = 3;
      var stemTop = Math.floor(S * 0.25);
      var stemBot = Math.floor(S * 0.75);
      var armY = Math.floor(S * 0.3);
      var armLeft = cx - 6;
      var armRight = cx + 6;

      // Bracket stem (vertical bar at center)
      var inStem = (x >= cx - 1 && x <= cx + 1 && y >= stemTop && y <= stemBot);
      // Bracket arm (horizontal bar near top)
      var inArm = (y >= armY - 1 && y <= armY + 1 && x >= armLeft && x <= armRight);

      if (inStem || inArm) {
        var bn = (_hash(x + 8100, y + 8101) - 0.5) * 8;
        return {
          r: _clamp(p.bracketR + bn),
          g: _clamp(p.bracketG + bn * 0.8),
          b: _clamp(p.bracketB + bn * 0.6)
        };
      }

      // ── Flame or charred stub above bracket arm ──
      var flameTop = Math.floor(S * 0.08);
      var flameBot = armY - 2;
      var flameHalfW = 5;

      if (y >= flameTop && y <= flameBot && x >= cx - flameHalfW && x <= cx + flameHalfW) {
        // Tapered shape: wider at bottom, narrower at top
        var fy = (y - flameTop) / (flameBot - flameTop); // 0=top, 1=bottom
        var maxW = flameHalfW * (0.4 + 0.6 * fy);       // Taper
        var fx = Math.abs(x - cx);

        if (fx <= maxW) {
          // Vertical gradient: tip color at top → flame color at bottom
          var vertBlend = fy;
          var fn = (_hash(x + 8200, y + 8201) - 0.5) * 20;
          return {
            r: _clamp(p.tipR * (1 - vertBlend) + p.flameR * vertBlend + fn),
            g: _clamp(p.tipG * (1 - vertBlend) + p.flameG * vertBlend + fn * 0.5),
            b: _clamp(p.tipB * (1 - vertBlend) + p.flameB * vertBlend + fn * 0.2)
          };
        }
      }

      // ── Ember sparks (lit only): random bright pixels around flame ──
      if (p.embers) {
        var dx = Math.abs(x - cx);
        var dy = Math.abs(y - Math.floor(S * 0.2));
        if (dx < 10 && dy < 10) {
          var emberHash = _hash(x * 7 + 8300, y * 11 + 8301);
          if (emberHash > 0.96) {
            return { r: 255, g: 200, b: 60 }; // Bright spark
          }
        }
      }

      // ── Stone wall background ──
      // Same pattern as stone_rough: multi-frequency noise
      var n1 = _hash(x + 8400, y + 8401);
      var n2 = _hash(x * 3 + 8500, y * 3 + 8501);
      var combined = n1 * 0.6 + n2 * 0.4;
      var pn = (combined - 0.5) * 20;

      // Soot darkening near the flame area (vertical gradient from top)
      var sootY = Math.max(0, 1 - y / (S * 0.5));
      var sootX = Math.max(0, 1 - Math.abs(x - cx) / 12);
      var soot = sootY * sootX * 25;

      return {
        r: _clamp(p.stoneR + pn - soot),
        g: _clamp(p.stoneG + pn * 0.9 - soot),
        b: _clamp(p.stoneB + pn * 0.8 - soot * 0.8)
      };
    });
  }

  // ── Fence wood texture ───────────────────────────────────────────
  // Horizontal planks with vertical post columns at 25% and 100% width.
  // Top rail is 1px lighter highlight. Grain noise per plank.

  function _genFenceWood(id, p) {
    var grainDark = p.grainDark || 0.7;
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var postW = 4; // Post column width in pixels

      // Two vertical posts: x=0..postW and x=75%..75%+postW
      var post1 = x < postW;
      var post2 = x >= Math.floor(S * 0.75) && x < Math.floor(S * 0.75) + postW;

      if (post1 || post2) {
        var pn = (_hash(x + 7000, y + 7001) - 0.5) * 8;
        return {
          r: _clamp(p.postR + pn),
          g: _clamp(p.postG + pn * 0.7),
          b: _clamp(p.postB + pn * 0.5)
        };
      }

      // Top rail highlight (top 1-2 px)
      if (y < 2) {
        var rn = (_hash(x + 7100, y + 7101) - 0.5) * 6;
        return {
          r: _clamp(p.railR + rn),
          g: _clamp(p.railG + rn * 0.8),
          b: _clamp(p.railB + rn * 0.5)
        };
      }

      // Three horizontal plank bands (each ~30% of height)
      var plankH = Math.floor(S / 3);
      var plankIdx = Math.floor(y / plankH);
      var localY = y % plankH;

      // Gap between planks (1px dark line)
      if (localY === 0 && plankIdx > 0) {
        return { r: 30, g: 22, b: 14 };
      }

      // Plank grain — horizontal streaking with per-plank noise seed
      var grain = _hash(x, Math.floor(y / 2) + plankIdx * 1000 + 7200);
      var plankNoise = (_hash(plankIdx + 7300, x + 7301) - 0.5) * 12;
      var gn = (grain - 0.5) * 15 * grainDark;

      return {
        r: _clamp(p.plankR + plankNoise + gn),
        g: _clamp(p.plankG + plankNoise * 0.7 + gn * 0.7),
        b: _clamp(p.plankB + plankNoise * 0.5 + gn * 0.5)
      };
    });
  }

  // ── Floor boardwalk texture ──────────────────────────────────────
  // Horizontal wood planks with visible gaps — weathered pier flooring.

  function _genFloorBoardwalk(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var plankH = 8; // Each plank is 8px tall
      var gapH = 1;   // 1px dark gap between planks
      var localY = y % (plankH + gapH);

      // Dark gap between planks
      if (localY >= plankH) {
        return { r: p.gapR, g: p.gapG, b: p.gapB };
      }

      // Plank surface — horizontal wood grain
      var plankIdx = Math.floor(y / (plankH + gapH));
      var grain = _hash(x, Math.floor(y / 2) + plankIdx * 500 + 7400);
      var plankSeed = _hash(plankIdx + 7500, 0);
      var plankShift = (plankSeed - 0.5) * 14; // Per-plank color variation
      var gn = (grain - 0.5) * 12 * p.grainDark;

      // Weathering: random dark spots
      var weather = _hash(x + 7600, y + 7601);
      var wearDarken = weather > 0.92 ? -15 : 0;

      return {
        r: _clamp(p.baseR + plankShift + gn + wearDarken),
        g: _clamp(p.baseG + plankShift * 0.7 + gn * 0.7 + wearDarken * 0.8),
        b: _clamp(p.baseB + plankShift * 0.5 + gn * 0.5 + wearDarken * 0.6)
      };
    });
  }

  // ── Hazard floor textures ─────────────────────────────────────────

  // Trap pressure plate — stone flags with a recessed iron plate at centre.
  // The plate is a 20×20px rounded rectangle with rivet dots. Surrounding
  // flags are identical to floor_stone so the hazard reads as "embedded."
  function _genFloorTrap(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2, cy = S / 2;
      var plateHalf = 10; // 20px plate centred in 64px tile
      var grooveW = 2;    // groove around the plate edge

      // Distance to plate centre (Chebyshev — rounded rectangle)
      var dx = Math.abs(x - cx);
      var dy = Math.abs(y - cy);
      var inPlate = dx <= plateHalf && dy <= plateHalf;
      var inGroove = !inPlate && dx <= plateHalf + grooveW && dy <= plateHalf + grooveW;

      if (inGroove) {
        var gn = (_hash(x + 8100, y + 8101) - 0.5) * 4;
        return { r: _clamp(p.grooveR + gn), g: _clamp(p.grooveG + gn), b: _clamp(p.grooveB + gn) };
      }

      if (inPlate) {
        // Iron plate surface with subtle cross-hatch texture
        var edgeDist = Math.min(plateHalf - dx, plateHalf - dy);
        var tier = edgeDist < 2 ? 0.85 : (edgeDist > 5 ? 1.08 : 1.0);
        var pn = (_hash(x + 8200, y + 8201) - 0.5) * 5;
        // Rivet dots at corners of the plate
        var rivet = false;
        if ((dx > plateHalf - 3 && dy > plateHalf - 3) ||
            (dx < 3 && dy > plateHalf - 3) ||
            (dx > plateHalf - 3 && dy < 3)) {
          rivet = Math.abs(dx % 6 - 3) < 1.5 && Math.abs(dy % 6 - 3) < 1.5;
        }
        var rMul = rivet ? 1.25 : 1.0;
        return {
          r: _clamp(p.plateR * tier * rMul + pn),
          g: _clamp(p.plateG * tier * rMul + pn * 0.9),
          b: _clamp(p.plateB * tier * rMul + pn * 0.8)
        };
      }

      // Surrounding stone flags — same pattern as floor_stone
      var blockW = 14, blockH = 10;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;
      if (lx < 1 || ly < 1) {
        return { r: _clamp(p.stoneR * 0.5), g: _clamp(p.stoneG * 0.5), b: _clamp(p.stoneB * 0.5) };
      }
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var bt = (_hash(blockId + 8300, row + 8301) - 0.5) * 12;
      var pn2 = (_hash(x + 8400, y + 8401) - 0.5) * 3;
      return {
        r: _clamp(p.stoneR + bt + pn2),
        g: _clamp(p.stoneG + bt + pn2 * 0.9),
        b: _clamp(p.stoneB + bt + pn2 * 0.8)
      };
    });
  }

  // Fire — charred stone with glowing ember cracks running through.
  // Cracks follow mortar lines but glow orange-red. Surface is scorched.
  function _genFloorFire(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var blockW = 12, blockH = 9;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;

      // Mortar cracks — these glow with ember heat
      if (lx < 2 || ly < 2) {
        var crackIntensity = _hash(x + 8500, y + 8501);
        // Some cracks glow brighter than others
        var glow = crackIntensity > 0.4 ? 1.0 : 0.4;
        var cn = (_hash(x + 8502, y + 8503) - 0.5) * 15;
        return {
          r: _clamp(p.crackR * glow + cn),
          g: _clamp(p.crackG * glow + cn * 0.3),
          b: _clamp(p.crackB * glow + cn * 0.1)
        };
      }

      // Scorched stone surface — dark with random ash patches
      var blockId = row * 6 + Math.floor((x + ox) / blockW);
      var bt = (_hash(blockId + 8600, row + 8601) - 0.5) * 10;
      var pn = (_hash(x + 8700, y + 8701) - 0.5) * 4;
      var ash = _hash(x + 8800, y + 8801) > 0.88;
      var ashDim = ash ? 0.65 : 1.0;
      // Warm tint — edge glow from nearby cracks
      var edgeDist = Math.min(lx, ly, blockW - lx, blockH - ly);
      var edgeWarm = edgeDist < 3 ? (3 - edgeDist) / 3 * 0.15 : 0;

      return {
        r: _clamp((p.stoneR + bt) * ashDim + pn + edgeWarm * p.crackR),
        g: _clamp((p.stoneG + bt) * ashDim + pn * 0.8 + edgeWarm * p.crackG * 0.3),
        b: _clamp((p.stoneB + bt) * ashDim + pn * 0.6)
      };
    });
  }

  // Spikes — iron spike tips visible through a grate over a dark pit.
  // Grid pattern: dark pit gaps with bright iron spike points at centres.
  function _genFloorSpikes(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var cellSize = 8;      // 8×8px per grate cell
      var barW = 2;          // grate bar width
      var lx = x % cellSize;
      var ly = y % cellSize;

      // Grate bars — stone-coloured cross-hatch
      var onBarX = lx < barW;
      var onBarY = ly < barW;
      if (onBarX || onBarY) {
        var tier = (onBarX && onBarY) ? 1.1 : 0.95; // intersection brighter
        var bn = (_hash(x + 8900, y + 8901) - 0.5) * 3;
        return {
          r: _clamp(p.stoneR * tier + bn),
          g: _clamp(p.stoneG * tier + bn),
          b: _clamp(p.stoneB * tier + bn)
        };
      }

      // Inside each cell — dark pit with a spike point at centre
      var cellCx = barW + (cellSize - barW) / 2;
      var cellCy = barW + (cellSize - barW) / 2;
      var cdx = Math.abs(lx - cellCx);
      var cdy = Math.abs(ly - cellCy);
      var dist = cdx + cdy; // Manhattan distance — makes diamond spike tips

      if (dist < 2) {
        // Spike tip — bright iron with specular highlight at very centre
        var specular = dist < 1 ? 1.3 : 1.0;
        return {
          r: _clamp(p.spikeR * specular),
          g: _clamp(p.spikeG * specular),
          b: _clamp(p.spikeB * specular)
        };
      }

      // Dark pit below — near-black with subtle noise
      var dn = (_hash(x + 9000, y + 9001) - 0.5) * 4;
      return {
        r: _clamp(p.gapR + dn),
        g: _clamp(p.gapG + dn),
        b: _clamp(p.gapB + dn)
      };
    });
  }

  // Poison — stone with sickly green toxic pools filling the low areas.
  // Uses noise to create organic puddle shapes in the mortar channels.
  function _genFloorPoison(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var blockW = 13, blockH = 10;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;

      // Mortar channels — filled with toxic green liquid
      if (lx < 2 || ly < 2) {
        var poolDepth = _hash(x + 9100, y + 9101);
        // Puddle variation — some channels deeper than others
        var depth = poolDepth > 0.3 ? 1.0 : 0.6;
        // Bubble highlights — rare bright spots
        var bubble = _hash(x + 9200, y + 9201) > 0.95;
        if (bubble) {
          return { r: p.bubbleR, g: p.bubbleG, b: p.bubbleB };
        }
        var pn = (_hash(x + 9102, y + 9103) - 0.5) * 8;
        return {
          r: _clamp(p.poolR * depth + pn * 0.5),
          g: _clamp(p.poolG * depth + pn),
          b: _clamp(p.poolB * depth + pn * 0.3)
        };
      }

      // Stone surface — greenish tint from toxic staining
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var bt = (_hash(blockId + 9300, row + 9301) - 0.5) * 10;
      var pn = (_hash(x + 9400, y + 9401) - 0.5) * 3;
      // Seepage stain — stone near edges is more green-tinted
      var edgeDist = Math.min(lx, ly, blockW - lx, blockH - ly);
      var stain = edgeDist < 3 ? (3 - edgeDist) / 3 * 0.35 : 0;
      return {
        r: _clamp(p.stoneR + bt + pn - stain * 15),
        g: _clamp(p.stoneG + bt + pn * 0.9 + stain * 25),
        b: _clamp(p.stoneB + bt + pn * 0.7 - stain * 10)
      };
    });
  }

  // ── Bioluminescent floor ──────────────────────────────────────────

  // Fungal patch — 64x64 organic floor tile. No mortar grid (this is a
  // living growth, not worked stone). Damp loam base with 3-5 clusters
  // of bioluminescent caps and scattered spore sparkles. The cap palette
  // leans teal-cyan so it reads as cool glow against warm torchlight.
  function _genFloorFungalPatch(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Loam substrate — mottled dark earth using low-freq noise
      var loamNoise = _hash(x + 11000, y + 11100);
      var loamBand = _hash(Math.floor(x / 3) + 11200, Math.floor(y / 3) + 11201);
      var loamMix = loamNoise * 0.4 + loamBand * 0.6;

      // Cap clusters — 4 cluster centres at quasi-random fixed positions
      // (deterministic so the texture tiles cleanly)
      var clusters = [
        { cx: 12, cy: 14, r: 7.5 },
        { cx: 42, cy: 10, r: 6.0 },
        { cx: 22, cy: 40, r: 8.5 },
        { cx: 50, cy: 46, r: 6.5 }
      ];

      var bestCapT = 0;    // 0..1 — 1 = cap centre, 0 = outside cluster
      var bestCapJitter = 0;
      for (var i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        var dx = x - c.cx;
        var dy = y - c.cy;
        // Noise-warped distance so cluster edges aren't perfect circles
        var jitter = (_hash(x + 11300 + i * 50, y + 11400 + i * 50) - 0.5) * 3.5;
        var d = Math.sqrt(dx * dx + dy * dy) + jitter;
        if (d < c.r) {
          var t = 1.0 - d / c.r;
          if (t > bestCapT) {
            bestCapT = t;
            bestCapJitter = jitter;
          }
        }
      }

      // Spore sparkles — rare bright specks anywhere (including loam)
      var sporeSeed = _hash(x + 11500, y + 11501);
      var isSpore = sporeSeed > 0.985;

      if (isSpore) {
        var sn = (_hash(x + 11600, y + 11601) - 0.5) * 20;
        return {
          r: _clamp(p.sporeR + sn * 0.5),
          g: _clamp(p.sporeG + sn * 0.3),
          b: _clamp(p.sporeB + sn * 0.4)
        };
      }

      if (bestCapT > 0) {
        // Cap body — hot centre, cool rim; highlight crown near bestCapT ≈ 0.75
        var crown = 1.0 - Math.abs(bestCapT - 0.75) * 3.0;     // peaks at 0.75
        crown = Math.max(0, Math.min(1, crown));
        var cn = (_hash(x + 11700, y + 11701) - 0.5) * 12;
        var capR = p.capR + (p.capHiR - p.capR) * crown * 0.9;
        var capG = p.capG + (p.capHiG - p.capG) * crown * 0.9;
        var capB = p.capB + (p.capHiB - p.capB) * crown * 0.9;
        // Blend cap into loam at the cluster edge for soft fringe
        var edge = Math.min(1, bestCapT * 3.0);
        var loamR = p.loamR + (p.loamHiR - p.loamR) * loamMix;
        var loamG = p.loamG + (p.loamHiG - p.loamG) * loamMix;
        var loamB = p.loamB + (p.loamHiB - p.loamB) * loamMix;
        return {
          r: _clamp(loamR * (1 - edge) + capR * edge + cn * 0.4),
          g: _clamp(loamG * (1 - edge) + capG * edge + cn * 0.6),
          b: _clamp(loamB * (1 - edge) + capB * edge + cn * 0.5)
        };
      }

      // Plain loam surface — damp earth with hair-fine mycelium specks
      var myc = _hash(x + 11800, y + 11801) > 0.97;
      var mn = (_hash(x + 11900, y + 11901) - 0.5) * 6;
      var lr = p.loamR + (p.loamHiR - p.loamR) * loamMix;
      var lg = p.loamG + (p.loamHiG - p.loamG) * loamMix;
      var lb = p.loamB + (p.loamHiB - p.loamB) * loamMix;
      if (myc) {
        // Thin bluish mycelium thread — faint cool tint over loam
        return {
          r: _clamp(lr * 0.9 + 10),
          g: _clamp(lg * 0.95 + 25),
          b: _clamp(lb * 0.95 + 30)
        };
      }
      return {
        r: _clamp(lr + mn * 0.6),
        g: _clamp(lg + mn),
        b: _clamp(lb + mn * 0.8)
      };
    });
  }

  // ── Well water floor ─────────────────────────────────────────────

  // Dark pool surface. Near-black with radial-from-center depth:
  // deepest at centre, slightly lighter towards edges, with very
  // rare surface glints. No mortar grid — this is water, not stone.
  function _genFloorWellWater(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var maxR = TEX_SIZE * 0.45;     // Slightly inside the circle rim

      // Radial depth — darker at centre, lighter at rim
      var depthT = Math.min(1, dist / maxR);
      var pn = (_hash(x + 12000, y + 12100) - 0.5) * 4;
      // Subtle concentric ripple
      var ripple = Math.sin(dist * 0.6 + (_hash(x + 12200, y) - 0.5) * 2) * 2;

      var r = p.deepR + (p.surfR - p.deepR) * depthT + pn * 0.3 + ripple * 0.2;
      var g = p.deepG + (p.surfG - p.deepG) * depthT + pn * 0.4 + ripple * 0.3;
      var b = p.deepB + (p.surfB - p.deepB) * depthT + pn * 0.8 + ripple * 0.5;

      // Rare glint
      if (_hash(x + 12300, y + 12301) > 0.993) {
        r = p.glintR; g = p.glintG; b = p.glintB;
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Barrel lid floor ────────────────────────────────────────────

  // Top of a sealed barrel: circular lid with radiating stave planks,
  // outer iron rim ring, and a darker centre bung.
  function _genFloorBarrelLid(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var maxR = TEX_SIZE * 0.47;

      // Iron rim ring — 2px wide at the perimeter
      if (dist > maxR - 2 && dist <= maxR) {
        var bn = (_hash(x + 12400, y + 12401) - 0.5) * 4;
        return {
          r: _clamp(p.bandR + bn),
          g: _clamp(p.bandG + bn),
          b: _clamp(p.bandB + bn)
        };
      }

      // Outside the barrel circle — transparent/dark
      if (dist > maxR) {
        return { r: 20, g: 18, b: 15 };
      }

      // Bung centre — darker circle in the middle
      var bungR = TEX_SIZE * 0.08;
      if (dist < bungR) {
        var cn = (_hash(x + 12500, y + 12501) - 0.5) * 3;
        return {
          r: _clamp(p.centerR + cn),
          g: _clamp(p.centerG + cn),
          b: _clamp(p.centerB + cn)
        };
      }

      // Stave planks — angular sectors (8 staves radiating out)
      var angle = Math.atan2(dy, dx);
      var sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 8);
      var sectorEdge = (((angle + Math.PI) / (2 * Math.PI)) * 8) % 1;
      var isGap = sectorEdge < 0.04 || sectorEdge > 0.96;

      var pn = (_hash(x + 12600, y + 12601) - 0.5) * 6;
      var sn = (_hash(sector + 12700, 0) - 0.5) * 10;  // Per-stave colour shift

      if (isGap) {
        // Dark line between staves
        return { r: _clamp(p.centerR - 5), g: _clamp(p.centerG - 5), b: _clamp(p.centerB - 5) };
      }

      return {
        r: _clamp(p.staveR + sn + pn),
        g: _clamp(p.staveG + sn * 0.7 + pn * 0.8),
        b: _clamp(p.staveB + sn * 0.5 + pn * 0.6)
      };
    });
  }

  // ── Anvil top floor ──────────────────────────────────────────────

  // Dark iron work surface with radial hammer-strike wear. Centre is
  // polished from repeated strikes; edges carry dark scale. No mortar
  // grid — solid iron casting.
  function _genFloorAnvilTop(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var maxR = TEX_SIZE * 0.42;

      // Radial wear — more polished at centre
      var wearT = 1 - Math.min(1, dist / maxR);
      wearT = wearT * wearT;  // Concentrate polish at centre
      var pn = (_hash(x + 13000, y + 13100) - 0.5) * 5;

      // Hammer scale patches at edges
      var scaleSeed = _hash(x + 13200, y + 13201);
      if (dist > maxR * 0.7 && scaleSeed > 0.75) {
        return {
          r: _clamp(p.scaleR + pn * 0.4),
          g: _clamp(p.scaleG + pn * 0.3),
          b: _clamp(p.scaleB + pn * 0.2)
        };
      }

      return {
        r: _clamp(p.ironR + (p.wearR - p.ironR) * wearT + pn * 0.5),
        g: _clamp(p.ironG + (p.wearG - p.ironG) * wearT + pn * 0.5),
        b: _clamp(p.ironB + (p.wearB - p.ironB) * wearT + pn * 0.7)
      };
    });
  }

  // ── Cot top floor ──────────────────────────────────────────────

  // Wrinkled canvas bedroll. Parallel fold creases running lengthwise
  // with occasional leather tie-down straps crossing.
  function _genFloorCotTop(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var pn = (_hash(x + 13300, y + 13400) - 0.5) * 5;

      // Fold creases — horizontal lines every ~8px
      var foldY = y % 8;
      if (foldY < 1) {
        return {
          r: _clamp(p.foldR + pn * 0.5),
          g: _clamp(p.foldG + pn * 0.4),
          b: _clamp(p.foldB + pn * 0.3)
        };
      }

      // Leather straps — vertical lines at 1/3 and 2/3
      var strapZone = (x > TEX_SIZE * 0.30 && x < TEX_SIZE * 0.34) ||
                      (x > TEX_SIZE * 0.64 && x < TEX_SIZE * 0.68);
      if (strapZone) {
        var sn = (_hash(x + 13500, y + 13501) - 0.5) * 4;
        return {
          r: _clamp(p.strapR + sn),
          g: _clamp(p.strapG + sn * 0.8),
          b: _clamp(p.strapB + sn * 0.6)
        };
      }

      // Plain canvas
      var weave = (_hash(Math.floor(x / 2) + 13600, Math.floor(y / 2) + 13601) - 0.5) * 4;
      return {
        r: _clamp(p.canvasR + pn + weave),
        g: _clamp(p.canvasG + pn * 0.9 + weave * 0.9),
        b: _clamp(p.canvasB + pn * 0.7 + weave * 0.7)
      };
    });
  }

  // ── Bench top floor ─────────────────────────────────────────────

  // Wooden slat seat viewed from above. Parallel planks with dark
  // gaps between them and a worn centre stripe.
  function _genFloorBenchTop(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // 4 slats across 64px
      var slatW = 16;
      var localX = x % slatW;
      var slatIdx = Math.floor(x / slatW);

      // Gap between slats
      if (localX < 1) {
        return { r: p.gapR, g: p.gapG, b: p.gapB };
      }

      var pn = (_hash(x + 13700, y + 13701) - 0.5) * 5;
      var sn = (_hash(slatIdx + 13800, 0) - 0.5) * 8;

      // Worn centre stripe (middle two slats)
      var cx = TEX_SIZE / 2;
      var wearDist = Math.abs(x - cx);
      var wearT = Math.max(0, 1 - wearDist / (TEX_SIZE * 0.25));
      wearT *= wearT;

      return {
        r: _clamp(p.slatR + sn + pn + (p.wearR - p.slatR) * wearT),
        g: _clamp(p.slatG + sn * 0.7 + pn * 0.8 + (p.wearR - p.slatG) * wearT * 0.7),
        b: _clamp(p.slatB + sn * 0.5 + pn * 0.6 + (p.wearR - p.slatB) * wearT * 0.5)
      };
    });
  }

  // ── Soup cauldron top floor ─────────────────────────────────────

  // Dark broth surface with steam wisp spots and occasional bubbles.
  // Viewed from above when looking over the SOUP_KITCHEN rim.
  function _genFloorSoupTop(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var cx = TEX_SIZE / 2, cy = TEX_SIZE / 2;
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var maxR = TEX_SIZE * 0.45;
      var pn = (_hash(x + 13900, y + 14000) - 0.5) * 4;

      // Outside the pot circle — dark (iron rim)
      if (dist > maxR) {
        return { r: 35, g: 32, b: 30 };
      }

      // Steam wisps — clustered blobs near centre
      var steamSeed = _hash(Math.floor(x / 5) + 14100, Math.floor(y / 5) + 14101);
      if (steamSeed > 0.82 && dist < maxR * 0.6) {
        var sn = (_hash(x + 14200, y + 14201) - 0.5) * 8;
        return {
          r: _clamp(p.steamR + sn),
          g: _clamp(p.steamG + sn),
          b: _clamp(p.steamB + sn * 0.8)
        };
      }

      // Bubble highlights — rare
      if (_hash(x + 14300, y + 14301) > 0.992) {
        return { r: p.bubbleR, g: p.bubbleG, b: p.bubbleB };
      }

      // Broth surface
      return {
        r: _clamp(p.brothR + pn * 0.5),
        g: _clamp(p.brothG + pn * 0.4),
        b: _clamp(p.brothB + pn * 0.3)
      };
    });
  }

  // ── Environmental floor textures ──────────────────────────────────

  // Corpse — bloodstained stone with pale bone fragments scattered.
  // Dark dried-blood pools in mortar channels, bone chips on stone face.
  function _genFloorCorpse(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var blockW = 14, blockH = 10;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;

      // Mortar — blood-filled channels
      if (lx < 1 || ly < 1) {
        var bloodMix = _hash(x + 9500, y + 9501);
        var isBlood = bloodMix > 0.3; // Most channels have blood
        if (isBlood) {
          var bn = (_hash(x + 9502, y + 9503) - 0.5) * 8;
          return {
            r: _clamp(p.bloodR + bn),
            g: _clamp(p.bloodG + bn * 0.3),
            b: _clamp(p.bloodB + bn * 0.2)
          };
        }
        return {
          r: _clamp(p.stoneR * 0.4), g: _clamp(p.stoneG * 0.4), b: _clamp(p.stoneB * 0.4)
        };
      }

      // Bone fragments — small clusters of 2-3px bright spots
      var boneNoise = _hash(x + 9600, y + 9601);
      var boneCluster = _hash(Math.floor(x / 3) + 9700, Math.floor(y / 3) + 9701);
      if (boneCluster > 0.88 && boneNoise > 0.5) {
        var bn2 = (_hash(x + 9602, y + 9603) - 0.5) * 10;
        return {
          r: _clamp(p.boneR + bn2),
          g: _clamp(p.boneG + bn2 * 0.9),
          b: _clamp(p.boneB + bn2 * 0.7)
        };
      }

      // Blood stain pools on stone surface — larger organic shapes
      var stainNoise = _hash(x + 9800, y + 9801) + _hash(Math.floor(x / 4) + 9802, Math.floor(y / 4) + 9803);
      if (stainNoise > 1.55) {
        var sn = (_hash(x + 9804, y + 9805) - 0.5) * 6;
        return {
          r: _clamp(p.bloodR * 1.2 + sn),
          g: _clamp(p.bloodG * 0.8 + sn * 0.2),
          b: _clamp(p.bloodB * 0.7 + sn * 0.1)
        };
      }

      // Regular stone — darker tint than normal (grime)
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var bt = (_hash(blockId + 9900, row + 9901) - 0.5) * 10;
      var pn = (_hash(x + 9902, y + 9903) - 0.5) * 3;
      return {
        r: _clamp(p.stoneR + bt + pn),
        g: _clamp(p.stoneG + bt + pn * 0.9),
        b: _clamp(p.stoneB + bt + pn * 0.8)
      };
    });
  }

  // Detritus — scattered adventurer gear on dungeon stone. Metal scraps
  // and torn cloth/leather on a standard flagstone base.
  function _genFloorDetritus(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var blockW = 14, blockH = 10;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? Math.floor(blockW / 2) : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;

      // Mortar (standard)
      if (lx < 1 || ly < 1) {
        return {
          r: _clamp(p.stoneR * 0.45), g: _clamp(p.stoneG * 0.45), b: _clamp(p.stoneB * 0.45)
        };
      }

      // Scattered metal scraps — small angular shapes
      var scrapNoise = _hash(Math.floor(x / 4) + 10000, Math.floor(y / 3) + 10001);
      if (scrapNoise > 0.85) {
        var edge = _hash(x + 10002, y + 10003);
        var shine = edge > 0.6 ? 1.2 : 0.9;
        return {
          r: _clamp(p.gearR * shine),
          g: _clamp(p.gearG * shine),
          b: _clamp(p.gearB * shine)
        };
      }

      // Torn cloth/leather patches — larger soft shapes
      var clothNoise = _hash(Math.floor(x / 5) + 10100, Math.floor(y / 5) + 10101);
      if (clothNoise > 0.82) {
        var cn = (_hash(x + 10102, y + 10103) - 0.5) * 8;
        return {
          r: _clamp(p.clothR + cn),
          g: _clamp(p.clothG + cn * 0.7),
          b: _clamp(p.clothB + cn * 0.5)
        };
      }

      // Base stone
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var bt = (_hash(blockId + 10200, row + 10201) - 0.5) * 10;
      var pn = (_hash(x + 10202, y + 10203) - 0.5) * 3;
      return {
        r: _clamp(p.stoneR + bt + pn),
        g: _clamp(p.stoneG + bt + pn),
        b: _clamp(p.stoneB + bt + pn)
      };
    });
  }

  // Puzzle — smooth worked stone with etched grid lines. The grid
  // reads as a sliding-tile panel. Faint arcane runes in some cells.
  function _genFloorPuzzle(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var cellSize = 16;  // 4×4 grid on 64px texture
      var lineW = 1;
      var lx = x % cellSize;
      var ly = y % cellSize;

      // Etched grid lines — carved groove with highlight edge
      if (lx < lineW || ly < lineW) {
        return { r: _clamp(p.lineR), g: _clamp(p.lineG), b: _clamp(p.lineB) };
      }
      // Shadow side of groove (right/bottom of line)
      if (lx === lineW || ly === lineW) {
        return {
          r: _clamp(p.stoneR * 0.7), g: _clamp(p.stoneG * 0.7), b: _clamp(p.stoneB * 0.7)
        };
      }

      // Arcane rune marks — faint blue-tinted symbols in some cells
      var cellX = Math.floor(x / cellSize);
      var cellY = Math.floor(y / cellSize);
      var hasRune = _hash(cellX + 10300, cellY + 10301) > 0.6;
      if (hasRune) {
        var runeLx = lx - cellSize / 2;
        var runeLy = ly - cellSize / 2;
        var runeDist = Math.abs(runeLx) + Math.abs(runeLy); // diamond shape
        if (runeDist < 4 && runeDist > 1) {
          var rn = (_hash(x + 10302, y + 10303) - 0.5) * 5;
          return {
            r: _clamp(p.glyphR + rn),
            g: _clamp(p.glyphG + rn),
            b: _clamp(p.glyphB + rn * 1.5)
          };
        }
      }

      // Smooth worked stone — less variation than natural stone
      var pn = (_hash(x + 10400, y + 10401) - 0.5) * 4;
      return {
        r: _clamp(p.stoneR + pn),
        g: _clamp(p.stoneG + pn * 0.9),
        b: _clamp(p.stoneB + pn * 0.8)
      };
    });
  }

  // ── Living infrastructure wall textures ──────────────────────────

  // Well — circular stone rim. Top half shows dark water; bottom half
  // shows curved masonry rim stones. Reads as "looking into a well."
  function _genWellStone(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // Top third: dark water surface
      if (y < S * 0.35) {
        var wn = (_hash(x + 10500, y + 10501) - 0.5) * 6;
        var ripple = Math.sin(x * 0.4 + y * 0.2) * 3;
        return {
          r: _clamp(p.waterR + wn + ripple),
          g: _clamp(p.waterG + wn * 1.2 + ripple),
          b: _clamp(p.waterB + wn * 1.5 + ripple * 1.5)
        };
      }

      // Stone rim — curved masonry blocks
      var stoneW = 10, stoneH = 7;
      var rowOff = (Math.floor(y / stoneH) % 2 === 0) ? 0 : stoneW / 2;
      var sCol = Math.floor((x + rowOff) / stoneW);
      var sRow = Math.floor(y / stoneH);
      var slx = (x + rowOff) - sCol * stoneW;
      var sly = y - sRow * stoneH;

      // Mortar
      if (slx < 1 || slx >= stoneW - 1 || sly < 1 || sly >= stoneH - 1) {
        var mn = (_hash(x + 10600, y + 10601) - 0.5) * 4;
        return { r: _clamp(p.mortarR + mn), g: _clamp(p.mortarG + mn), b: _clamp(p.mortarB + mn) };
      }

      // Stone face with curvature shading — darker at edges
      var distFromCenter = Math.abs(x - cx) / cx; // 0 at center, 1 at edge
      var curveDim = 1.0 - distFromCenter * 0.3;
      var blockId = sRow * 7 + sCol;
      var bt = (_hash(blockId + 10700, sRow + 10701) - 0.5) * 12;
      var pn = (_hash(x + 10702, y + 10703) - 0.5) * 3;
      return {
        r: _clamp((p.stoneR + bt) * curveDim + pn),
        g: _clamp((p.stoneG + bt) * curveDim + pn * 0.9),
        b: _clamp((p.stoneB + bt) * curveDim + pn * 0.8)
      };
    });
  }

  // Bench — horizontal slats on a simple frame. Dark frame bottom,
  // warm wood slats in the upper two-thirds with visible gaps.
  function _genBench(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var slatH = 6;   // slat thickness
      var gapH = 2;    // gap between slats
      var frameH = S * 0.3; // bottom 30% is frame/legs

      // Bottom frame
      if (y > S - frameH) {
        var legW = 8;
        var legX = x % (S / 2);
        var isLeg = legX < legW || legX > (S / 2) - legW;
        var fn = (_hash(x + 10800, y + 10801) - 0.5) * 4;
        var mul = isLeg ? 1.0 : 0.85; // cross bar slightly dimmer
        return {
          r: _clamp(p.frameR * mul + fn),
          g: _clamp(p.frameG * mul + fn * 0.8),
          b: _clamp(p.frameB * mul + fn * 0.6)
        };
      }

      // Slat region
      var slatLocal = y % (slatH + gapH);
      if (slatLocal >= slatH) {
        // Gap — dark void
        return { r: p.gapR, g: p.gapG, b: p.gapB };
      }

      // Wood slat — grain lines
      var slatIdx = Math.floor(y / (slatH + gapH));
      var grain = _hash(x, Math.floor(y / 2) + slatIdx * 400 + 10900);
      var slatShift = (_hash(slatIdx + 11000, 0) - 0.5) * 12;
      var gn = (grain - 0.5) * 8;
      return {
        r: _clamp(p.slatR + slatShift + gn),
        g: _clamp(p.slatG + slatShift * 0.7 + gn * 0.7),
        b: _clamp(p.slatB + slatShift * 0.5 + gn * 0.5)
      };
    });
  }

  // Notice board — two dark wood posts with a lighter board between them.
  // Parchment notes pinned with coloured pins in the centre region.
  function _genNoticeBoard(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var postW = 8;  // post width on each side

      // Left post
      if (x < postW) {
        var pn = (_hash(x + 11100, y + 11101) - 0.5) * 4;
        var grain = _hash(x, Math.floor(y / 3) + 11200);
        return {
          r: _clamp(p.postR + (grain - 0.5) * 8 + pn),
          g: _clamp(p.postG + (grain - 0.5) * 6 + pn * 0.8),
          b: _clamp(p.postB + (grain - 0.5) * 4 + pn * 0.6)
        };
      }
      // Right post
      if (x >= S - postW) {
        var pn2 = (_hash(x + 11102, y + 11103) - 0.5) * 4;
        var grain2 = _hash(x, Math.floor(y / 3) + 11300);
        return {
          r: _clamp(p.postR + (grain2 - 0.5) * 8 + pn2),
          g: _clamp(p.postG + (grain2 - 0.5) * 6 + pn2 * 0.8),
          b: _clamp(p.postB + (grain2 - 0.5) * 4 + pn2 * 0.6)
        };
      }

      // Board backing
      var boardNoise = (_hash(x + 11400, y + 11401) - 0.5) * 5;

      // Parchment notes — rectangles in the centre zone
      var noteId = _hash(Math.floor(x / 12) + 11500, Math.floor(y / 14) + 11501);
      if (noteId > 0.45 && x > postW + 3 && x < S - postW - 3 && y > 6 && y < S - 6) {
        // Inside a note rectangle
        var noteEdgeX = x % 12;
        var noteEdgeY = y % 14;
        if (noteEdgeX > 1 && noteEdgeX < 11 && noteEdgeY > 1 && noteEdgeY < 13) {
          // Pin at top-centre of each note
          if (noteEdgeX > 4 && noteEdgeX < 8 && noteEdgeY < 4) {
            return { r: p.pinR, g: p.pinG, b: p.pinB };
          }
          var nn = (_hash(x + 11600, y + 11601) - 0.5) * 6;
          return {
            r: _clamp(p.paperR + nn),
            g: _clamp(p.paperG + nn * 0.8),
            b: _clamp(p.paperB + nn * 0.6)
          };
        }
      }

      // Board surface
      return {
        r: _clamp(p.boardR + boardNoise),
        g: _clamp(p.boardG + boardNoise * 0.8),
        b: _clamp(p.boardB + boardNoise * 0.6)
      };
    });
  }

  // Anvil — dark iron body on a lighter stone pedestal. Classic anvil
  // profile: horn (narrow left), face (wide top), base (bottom third).
  function _genAnvil(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;
      var baseH = S * 0.3; // stone pedestal

      // Stone pedestal — bottom 30%
      if (y > S - baseH) {
        var bn = (_hash(x + 11700, y + 11701) - 0.5) * 5;
        return {
          r: _clamp(p.baseR + bn),
          g: _clamp(p.baseG + bn * 0.9),
          b: _clamp(p.baseB + bn * 0.8)
        };
      }

      // Anvil profile — wider in the middle, narrows at left (horn)
      var anvilY = y / (S - baseH); // 0 at top, 1 at base
      var halfW;
      if (anvilY < 0.15) {
        halfW = cx * 0.85; // top face — wide
      } else if (anvilY < 0.45) {
        halfW = cx * 0.55; // waist — narrow
      } else {
        halfW = cx * 0.75; // base flare
      }

      var dx = Math.abs(x - cx);
      if (dx > halfW) {
        // Outside anvil silhouette — transparent (let wall behind show)
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      // Iron surface — edge highlighting
      var edgeFrac = dx / halfW;
      var edgeTier = edgeFrac > 0.8 ? 1.0 : (edgeFrac < 0.3 ? 0.9 : 0.95);
      var worn = anvilY < 0.15 ? 1.1 : 1.0; // top face has use-wear shine
      var an = (_hash(x + 11800, y + 11801) - 0.5) * 4;
      var useHi = worn > 1.0;
      return {
        r: _clamp((useHi ? p.hiR : p.ironR) * edgeTier + an),
        g: _clamp((useHi ? p.hiG : p.ironG) * edgeTier + an),
        b: _clamp((useHi ? p.hiB : p.ironB) * edgeTier + an)
      };
    });
  }

  // Barrel — vertical oak staves with two iron hoops. Lighter lid at
  // top, darker staves below. Classic cask silhouette.
  function _genBarrel(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // Barrel curvature — wider in middle, narrower at top/bottom
      var yFrac = y / S;
      var bulge = 1.0 - Math.pow((yFrac - 0.5) * 2, 2) * 0.15; // subtle barrel shape
      var halfW = cx * bulge;
      var dx = Math.abs(x - cx);

      if (dx > halfW + 1) {
        return { r: 0, g: 0, b: 0, a: 0 }; // outside barrel
      }

      // Iron hoops — two horizontal bands
      var hoopY1 = S * 0.22, hoopY2 = S * 0.75;
      var hoopH = 3;
      var isHoop = (y >= hoopY1 && y < hoopY1 + hoopH) || (y >= hoopY2 && y < hoopY2 + hoopH);
      if (isHoop) {
        var hn = (_hash(x + 11900, y + 11901) - 0.5) * 4;
        return {
          r: _clamp(p.bandR + hn),
          g: _clamp(p.bandG + hn),
          b: _clamp(p.bandB + hn)
        };
      }

      // Lid — top 10%
      if (y < S * 0.1) {
        var ln = (_hash(x + 12000, y + 12001) - 0.5) * 5;
        return {
          r: _clamp(p.topR + ln),
          g: _clamp(p.topG + ln * 0.8),
          b: _clamp(p.topB + ln * 0.6)
        };
      }

      // Stave surface — vertical plank grain with curvature shading
      var staveW = 8;
      var staveIdx = Math.floor(x / staveW);
      var staveLocal = x % staveW;
      var isStaveEdge = staveLocal < 1;
      if (isStaveEdge) {
        return { r: _clamp(p.staveR * 0.6), g: _clamp(p.staveG * 0.6), b: _clamp(p.staveB * 0.6) };
      }

      var curveDim = 1.0 - (dx / halfW) * 0.25; // darker at edges
      var staveShift = (_hash(staveIdx + 12100, 0) - 0.5) * 10;
      var grain = _hash(x, Math.floor(y / 2) + staveIdx * 300 + 12200);
      var gn = (grain - 0.5) * 6;
      return {
        r: _clamp((p.staveR + staveShift + gn) * curveDim),
        g: _clamp((p.staveG + staveShift * 0.7 + gn * 0.7) * curveDim),
        b: _clamp((p.staveB + staveShift * 0.5 + gn * 0.5) * curveDim)
      };
    });
  }

  // Soup cauldron — cast iron pot on a brazier frame. Pot takes upper
  // 2/3, brazier legs below. Steam wisps at very top edge.
  function _genSoupCauldron(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;
      var potBottom = S * 0.65; // pot takes top 65%

      // Steam wisps at top (top 4px)
      if (y < 4) {
        var steamChance = _hash(x + 12300, y + 12301);
        if (steamChance > 0.5) {
          var sn = (_hash(x + 12302, y + 12303) - 0.5) * 8;
          return {
            r: _clamp(p.steamR + sn), g: _clamp(p.steamG + sn), b: _clamp(p.steamB + sn),
            a: _clamp(120 + steamChance * 80)
          };
        }
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      // Pot rim (y 4-8)
      if (y < 8) {
        var rn = (_hash(x + 12400, y + 12401) - 0.5) * 4;
        return { r: _clamp(p.rimR + rn), g: _clamp(p.rimG + rn), b: _clamp(p.rimB + rn) };
      }

      // Pot body — rounded silhouette
      if (y < potBottom) {
        var potFrac = (y - 8) / (potBottom - 8);
        var potHalfW = cx * (0.85 + 0.15 * Math.sin(potFrac * Math.PI)); // bulge
        var dx = Math.abs(x - cx);
        if (dx > potHalfW) {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        var curveDim = 1.0 - (dx / potHalfW) * 0.3;
        var pn = (_hash(x + 12500, y + 12501) - 0.5) * 4;
        return {
          r: _clamp(p.potR * curveDim + pn),
          g: _clamp(p.potG * curveDim + pn),
          b: _clamp(p.potB * curveDim + pn)
        };
      }

      // Brazier legs — three vertical bars
      var legPositions = [cx - 12, cx, cx + 12];
      var onLeg = false;
      for (var li = 0; li < legPositions.length; li++) {
        if (Math.abs(x - legPositions[li]) < 3) { onLeg = true; break; }
      }
      if (onLeg) {
        var bn = (_hash(x + 12600, y + 12601) - 0.5) * 4;
        return { r: _clamp(p.brazR + bn), g: _clamp(p.brazG + bn * 0.8), b: _clamp(p.brazB + bn * 0.6) };
      }

      return { r: 0, g: 0, b: 0, a: 0 }; // gaps between legs
    });
  }

  // Cot — canvas bedroll draped over a low wooden frame. Frame visible
  // at bottom, canvas folds visible across the surface.
  function _genCot(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var frameH = S * 0.25; // bottom 25% is frame

      // Wooden frame — bottom portion
      if (y > S - frameH) {
        var legW = 6;
        var legSpan = S / 2;
        var legX = x % legSpan;
        var isLeg = legX < legW || legX > legSpan - legW;
        var crossBar = y < S - frameH + 3;
        var fn = (_hash(x + 12700, y + 12701) - 0.5) * 4;
        var mul = (isLeg || crossBar) ? 1.0 : 0.75;
        return {
          r: _clamp(p.frameR * mul + fn),
          g: _clamp(p.frameG * mul + fn * 0.8),
          b: _clamp(p.frameB * mul + fn * 0.6)
        };
      }

      // Canvas surface with wrinkle fold lines
      var foldH = 10;
      var foldLocal = y % foldH;
      var isFold = foldLocal < 2;
      var foldIdx = Math.floor(y / foldH);
      var foldShift = (_hash(foldIdx + 12800, 0) - 0.5) * 8;

      if (isFold) {
        // Fold shadow line
        return {
          r: _clamp(p.foldR + foldShift),
          g: _clamp(p.foldG + foldShift * 0.9),
          b: _clamp(p.foldB + foldShift * 0.8)
        };
      }

      // Canvas body — flat with minimal texture
      var cn = (_hash(x + 12900, y + 12901) - 0.5) * 4;
      var weave = _hash(x + 13000, Math.floor(y / 2) + 13001);
      var wn = (weave - 0.5) * 3;
      return {
        r: _clamp(p.canvasR + cn + wn + foldShift * 0.3),
        g: _clamp(p.canvasG + cn * 0.9 + wn * 0.9 + foldShift * 0.25),
        b: _clamp(p.canvasB + cn * 0.7 + wn * 0.7 + foldShift * 0.2)
      };
    });
  }

  // ── Retrofuture infrastructure textures ────────────────────────────

  // Charging cradle — upright metal frame with vertical conduit cables.
  // Three cables (left, centre, right) glow blue against steel frame.
  function _genChargingCradle(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // Steel frame — outer border (4px on each side)
      var frameW = 4;
      if (x < frameW || x >= S - frameW || y < frameW || y >= S - frameW) {
        var fn = (_hash(x + 13100, y + 13101) - 0.5) * 4;
        var edgeTier = (x < 2 || x >= S - 2 || y < 2 || y >= S - 2) ? 1.1 : 0.9;
        return {
          r: _clamp(p.frameR * edgeTier + fn),
          g: _clamp(p.frameG * edgeTier + fn),
          b: _clamp(p.frameB * edgeTier + fn)
        };
      }

      // Interior — dark cavity with three vertical conduit cables
      var conduitPositions = [cx - 14, cx, cx + 14];
      var conduitW = 4;
      for (var ci = 0; ci < conduitPositions.length; ci++) {
        var cdx = Math.abs(x - conduitPositions[ci]);
        if (cdx < conduitW) {
          // Conduit cable — brighter at centre
          var glow = 1.0 - cdx / conduitW;
          var cn = (_hash(x + 13200, y + 13201) - 0.5) * 5;
          // Segmented: every 8px has a darker band (cable insulation)
          var segment = y % 8;
          var isBand = segment < 2;
          if (isBand) {
            return {
              r: _clamp(p.conduitR * 0.5 + cn),
              g: _clamp(p.conduitG * 0.5 + cn),
              b: _clamp(p.conduitB * 0.5 + cn)
            };
          }
          return {
            r: _clamp(p.conduitR + glow * (p.glowR - p.conduitR) + cn),
            g: _clamp(p.conduitG + glow * (p.glowG - p.conduitG) + cn),
            b: _clamp(p.conduitB + glow * (p.glowB - p.conduitB) + cn)
          };
        }
      }

      // Dark interior cavity — near-black with subtle noise
      var dn = (_hash(x + 13300, y + 13301) - 0.5) * 3;
      return { r: _clamp(20 + dn), g: _clamp(22 + dn), b: _clamp(25 + dn) };
    });
  }

  // Switchboard — brass toggle panel. Dark wood backing with rows of
  // brass toggle switches and red/green indicator lights.
  function _genSwitchboard(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;

      // Wood panel backing with subtle grain
      var grain = _hash(x, Math.floor(y / 3) + 13400);
      var baseNoise = (grain - 0.5) * 6;
      var pn = (_hash(x + 13500, y + 13501) - 0.5) * 3;

      // Toggle switch rows — 4 rows of 6 toggles each
      var rowH = 14;
      var colW = 10;
      var rowIdx = Math.floor(y / rowH);
      var colIdx = Math.floor(x / colW);
      var ly = y % rowH;
      var lx = x % colW;

      // Toggle switch — small brass rectangle in centre of each cell
      if (rowIdx < 4 && colIdx < 6) {
        var switchCx = colW / 2;
        var switchCy = rowH / 2;
        var sdx = Math.abs(lx - switchCx);
        var sdy = Math.abs(ly - switchCy);

        // Indicator light — small dot above the toggle
        if (sdy < 2 && ly < switchCy - 2 && sdx < 2) {
          var lightSeed = _hash(colIdx + 13600, rowIdx + 13601);
          var isGreen = lightSeed > 0.5;
          return isGreen
            ? { r: p.lightGR, g: p.lightGG, b: p.lightGB }
            : { r: p.lightR, g: p.lightG, b: p.lightB };
        }

        // Toggle lever — brass
        if (sdx < 2 && sdy < 4) {
          var toggleSeed = _hash(colIdx + 13700, rowIdx + 13701);
          var toggleUp = toggleSeed > 0.4;
          var toggleTier = toggleUp ? 1.15 : 0.85; // up = highlight, down = shadow
          var tn = (_hash(x + 13702, y + 13703) - 0.5) * 4;
          return {
            r: _clamp(p.brassR * toggleTier + tn),
            g: _clamp(p.brassG * toggleTier + tn * 0.8),
            b: _clamp(p.brassB * toggleTier + tn * 0.5)
          };
        }
      }

      // Panel surface
      return {
        r: _clamp(p.panelR + baseNoise + pn),
        g: _clamp(p.panelG + baseNoise * 0.8 + pn * 0.9),
        b: _clamp(p.panelB + baseNoise * 0.6 + pn * 0.8)
      };
    });
  }

  // ── Creature verb-node textures (DOC-115 §2b) ─────────────────────
  // Three wall-like tiles rendered as opaque columns on dungeon floors.
  // Each mirrors an existing infrastructure generator for tonal
  // consistency while carrying a distinct silhouette so the player can
  // read "rest point / alcove / power junction" at a glance from TV
  // distance.

  // Nest — chunky woven debris pile. Low mound silhouette (wider at
  // base, narrowing to a rounded top). Horizontal stick bands with
  // occasional bone-white chip highlights. Mirrors _genCot's low-
  // profile frame+body split but uses a mound shape and transparent
  // border so the wall behind shows through above the pile.
  function _genNestDebris(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // Mound silhouette — wider at bottom, narrower at top. yFrac
      // 0=top, 1=bottom. Radius grows from ~0.35*cx at top to ~0.95*cx
      // at base. Above the mound cap the wall is transparent.
      var yFrac = y / S;
      var halfW = cx * (0.35 + 0.60 * yFrac);
      var dx = Math.abs(x - cx);
      if (dx > halfW) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      // Dark earth ring around the base (bottom 15%)
      if (yFrac > 0.85) {
        var en = (_hash(x + 14100, y + 14101) - 0.5) * 5;
        return {
          r: _clamp(p.earthR + en),
          g: _clamp(p.earthG + en * 0.9),
          b: _clamp(p.earthB + en * 0.8)
        };
      }

      // Horizontal shadow bands — every 7px a dark stripe reads as the
      // shadow line between layers of woven sticks. Band spacing is
      // irregular via a per-row hash.
      var bandRow = Math.floor(y / 7);
      var bandShift = (_hash(bandRow + 14200, 0) - 0.5) * 10;
      var bandLocalY = y % 7;
      var isShadow = bandLocalY < 2;

      if (isShadow) {
        var sn = (_hash(x + 14300, y + 14301) - 0.5) * 5;
        return {
          r: _clamp(p.shadowR + bandShift + sn),
          g: _clamp(p.shadowG + bandShift * 0.9 + sn),
          b: _clamp(p.shadowB + bandShift * 0.8 + sn)
        };
      }

      // Bone-white chip highlights — sparse scattering. ~4% of pixels
      // in the upper 60% of the mound flip to bone tone.
      var chipRoll = _hash(x + 14400, y + 14401);
      if (yFrac < 0.60 && chipRoll > 0.96) {
        var bn = (_hash(x + 14500, y + 14501) - 0.5) * 8;
        return {
          r: _clamp(p.boneR + bn),
          g: _clamp(p.boneG + bn),
          b: _clamp(p.boneB + bn * 0.9)
        };
      }

      // Debris body — tan woven sticks with curvature shading (darker
      // at silhouette edges so the mound reads as three-dimensional).
      var curveDim = 1.0 - (dx / halfW) * 0.30;
      var grain = _hash(x + 14600, Math.floor(y / 2) + 14601);
      var gn = (grain - 0.5) * 8;
      return {
        r: _clamp((p.debrisR + bandShift * 0.5 + gn) * curveDim),
        g: _clamp((p.debrisG + bandShift * 0.4 + gn * 0.9) * curveDim),
        b: _clamp((p.debrisB + bandShift * 0.3 + gn * 0.7) * curveDim)
      };
    });
  }

  // Den — hollowed rock alcove. Stone arch frame surrounding a near-
  // black cavity. The arch is a rounded keystone (semicircle at top,
  // straight jambs descending to floor). Mirrors _genChargingCradle's
  // outer-frame + interior-cavity split, with _genWellStone's masonry
  // pattern driving the arch stones.
  function _genDenAlcove(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // Arch aperture — semicircle at top (radius ~22), straight
      // vertical jambs below. archY is the pivot where the arch curve
      // meets the straight jamb. Aperture half-width = 22 at/below
      // archY, narrower above (following a semicircle).
      var archR = 22;
      var archY = S * 0.35; // top 35% is the arch curve
      var apertureHalfW;
      if (y < archY - archR) {
        // Above the arch entirely — solid stone frame
        apertureHalfW = -1;
      } else if (y < archY) {
        // Inside the arch curve — semicircle
        var dy = archY - y;
        apertureHalfW = Math.sqrt(Math.max(0, archR * archR - dy * dy));
      } else {
        // Below the arch — straight jambs
        apertureHalfW = archR;
      }

      var dx = Math.abs(x - cx);

      // Interior cavity (inside the aperture) — near-black with subtle noise
      if (dx < apertureHalfW) {
        // Subtle edge darkening at the bottom (alcove floor)
        var floorDim = y > S * 0.85 ? 0.7 : 1.0;
        var vn = (_hash(x + 14700, y + 14701) - 0.5) * 4;
        return {
          r: _clamp(p.voidR * floorDim + vn),
          g: _clamp(p.voidG * floorDim + vn),
          b: _clamp(p.voidB * floorDim + vn * 0.9)
        };
      }

      // Stone arch frame — masonry blocks (10×7 brick with odd-row offset)
      var stoneW = 10, stoneH = 7;
      var rowOff = (Math.floor(y / stoneH) % 2 === 0) ? 0 : stoneW / 2;
      var sCol = Math.floor((x + rowOff) / stoneW);
      var sRow = Math.floor(y / stoneH);
      var slx = (x + rowOff) - sCol * stoneW;
      var sly = y - sRow * stoneH;

      // Mortar joints
      if (slx < 1 || slx >= stoneW - 1 || sly < 1 || sly >= stoneH - 1) {
        var mn = (_hash(x + 14800, y + 14801) - 0.5) * 4;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn)
        };
      }

      // Stone face — edge-darkening shade near the aperture so the
      // arch reads as inset (stone leaning toward the cavity).
      var apertureEdgeDist = dx - apertureHalfW; // positive outside aperture
      var rimFade = apertureEdgeDist < 4 ? 0.75 + apertureEdgeDist * 0.06 : 1.0;
      var blockId = sRow * 9 + sCol;
      var bt = (_hash(blockId + 14900, sRow + 14901) - 0.5) * 14;
      var pn = (_hash(x + 15000, y + 15001) - 0.5) * 3;
      return {
        r: _clamp((p.stoneR + bt) * rimFade + pn),
        g: _clamp((p.stoneG + bt) * rimFade + pn * 0.9),
        b: _clamp((p.stoneB + bt) * rimFade + pn * 0.8)
      };
    });
  }

  // Energy conduit — exposed power junction. Brass pipe frame with
  // rivet studs along the border, a dark interior cavity, and a
  // central glowing cyan slit with animated-feeling sparking highlights.
  // Mirrors _genChargingCradle's frame + interior pattern but collapses
  // three cables into a single central slit and adds rivet detail
  // ported from _genAnvil / _genDoorIron.
  function _genEnergyConduit(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;

      // Brass frame — outer border (5px on each side). Darker at the
      // very edge, brighter on the inner bevel so the frame reads
      // three-dimensional.
      var frameW = 5;
      var isFrame = x < frameW || x >= S - frameW || y < frameW || y >= S - frameW;
      if (isFrame) {
        // Rivet studs — centered along each edge, 12px spacing
        var edgeDist = Math.min(x, S - 1 - x, y, S - 1 - y);
        var isRivet = false;
        if (edgeDist < 2) {
          // Near outer edge — place rivet stud centers every 12px
          var rivetSpacing = 12;
          var rivetHalf = 2;
          var onHorizEdge = (y < frameW || y >= S - frameW);
          var onVertEdge = (x < frameW || x >= S - frameW);
          if (onHorizEdge) {
            var rx = (x + rivetSpacing / 2) % rivetSpacing;
            if (rx < rivetHalf * 2) isRivet = true;
          } else if (onVertEdge) {
            var ry = (y + rivetSpacing / 2) % rivetSpacing;
            if (ry < rivetHalf * 2) isRivet = true;
          }
        }
        if (isRivet) {
          var rn = (_hash(x + 15100, y + 15101) - 0.5) * 4;
          return {
            r: _clamp(p.rivetR + rn),
            g: _clamp(p.rivetG + rn * 0.9),
            b: _clamp(p.rivetB + rn * 0.7)
          };
        }
        var fn = (_hash(x + 15200, y + 15201) - 0.5) * 5;
        var edgeTier = (edgeDist < 1) ? 0.75 : (edgeDist < 3 ? 1.15 : 0.95);
        return {
          r: _clamp(p.brassR * edgeTier + fn),
          g: _clamp(p.brassG * edgeTier + fn * 0.9),
          b: _clamp(p.brassB * edgeTier + fn * 0.6)
        };
      }

      // Interior cavity — central vertical glowing slit (4px wide)
      var slitHalfW = 4;
      var sdx = Math.abs(x - cx);
      if (sdx < slitHalfW) {
        var glowFalloff = 1.0 - sdx / slitHalfW; // 1 at center, 0 at slit edge
        // Vertical spark segments — every 11px alternate bright/dim
        var sparkBand = Math.floor(y / 11);
        var sparkSeed = _hash(sparkBand + 15300, 0);
        var sparkHot = sparkSeed > 0.55;
        var sparkLocal = y % 11;
        var isCore = sparkLocal > 2 && sparkLocal < 9;
        var cn = (_hash(x + 15400, y + 15401) - 0.5) * 6;
        if (isCore && sparkHot) {
          // Bright cyan core — mix glow with highlight
          return {
            r: _clamp(p.glowR + glowFalloff * (p.glowHiR - p.glowR) + cn),
            g: _clamp(p.glowG + glowFalloff * (p.glowHiG - p.glowG) + cn),
            b: _clamp(p.glowB + glowFalloff * (p.glowHiB - p.glowB) + cn)
          };
        }
        // Dim sections — glow color with falloff into dark cavity
        return {
          r: _clamp(p.darkR + glowFalloff * (p.glowR - p.darkR) * 0.6 + cn),
          g: _clamp(p.darkG + glowFalloff * (p.glowG - p.darkG) * 0.6 + cn),
          b: _clamp(p.darkB + glowFalloff * (p.glowB - p.darkB) * 0.6 + cn)
        };
      }

      // Flanking dark cavity with horizontal banding (looks like
      // ribbed backplate behind the glowing core)
      var bandY = y % 6;
      var isBand = bandY < 2;
      var dn = (_hash(x + 15500, y + 15501) - 0.5) * 4;
      if (isBand) {
        return {
          r: _clamp(p.darkR * 0.6 + dn),
          g: _clamp(p.darkG * 0.6 + dn),
          b: _clamp(p.darkB * 0.6 + dn)
        };
      }
      // Subtle cyan ambient bleed onto the flanking plate (further
      // from slit = less bleed)
      var bleedAmount = Math.max(0, 1.0 - sdx / (cx * 0.7)) * 0.20;
      return {
        r: _clamp(p.darkR + bleedAmount * (p.glowR - p.darkR) + dn),
        g: _clamp(p.darkG + bleedAmount * (p.glowG - p.darkG) + dn),
        b: _clamp(p.darkB + bleedAmount * (p.glowB - p.darkB) + dn)
      };
    });
  }

  // ── Creature verb-node floor textures (DOC-115 §2a) ──────────────
  //
  // These are floor-only textures for walkable creature anchors (ROOST,
  // TERRITORIAL_MARK). They do not register a wall texture — the tiles
  // render as textured floor patches and the raycaster looks through
  // them. Base is standard flagstone masonry so the overlay reads as
  // a pattern burned / etched into the dungeon floor.

  // Roost — overhead hook/perch point. Rendered as a circular floor
  // shadow (the chain is above the camera, never visible head-on).
  // 3 radial tiers: dark shadow core (d<8) → mid shadow with chain-link
  // spokes (8-18) → fading outer vignette (18-28) → plain floor stone.
  function _genRoostShadow(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      var cx = S / 2;
      var cy = S / 2;

      // Stone flagstone base — matches _genFloorStone block geometry so
      // ROOST tiles sit visually flush with adjacent floor_stone tiles.
      var blockW = 16, blockH = 12;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 8 : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;
      var isMortar = (lx < 1 || ly < 1);

      var dx = x - cx;
      var dy = y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var theta = Math.atan2(dy, dx);

      // Shadow intensity profile. shadowT in [0,1], 1 = darkest.
      var shadowT;
      if (d < 8) {
        shadowT = 1.0;
      } else if (d < 18) {
        shadowT = 1.0 - (d - 8) / 10 * 0.35;
      } else if (d < 28) {
        shadowT = 0.65 * (1.0 - (d - 18) / 10);
      } else {
        shadowT = 0;
      }

      // Chain-link spokes — 6 radial arms with cross-beads every 4px.
      // Spoke width widens near center (suggests a hanging chain foreshortened).
      var chainHit = false;
      if (d >= 6 && d <= 20) {
        var spokeAngle = theta * 3 / Math.PI;
        var spokeLocal = spokeAngle - Math.round(spokeAngle);
        var spokeWidth = 1.2 / (d * 0.28 + 1);
        var onSpoke = Math.abs(spokeLocal) < spokeWidth;
        var ringLocal = d % 4;
        var onRing = ringLocal < 1.4 && d >= 7;
        if (onSpoke && onRing) chainHit = true;
      }

      // Base stone tone (mirrors _genFloorStone noise recipe)
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId + 15600, row + 15601) - 0.5) * 12;
      var pn = (_hash(x + 15700, y + 15701) - 0.5) * 6;
      var baseR, baseG, baseB;
      if (isMortar) {
        baseR = p.stoneR * 0.4;
        baseG = p.stoneG * 0.4;
        baseB = p.stoneB * 0.4;
      } else {
        baseR = p.stoneR + blockNoise + pn;
        baseG = p.stoneG + blockNoise + pn;
        baseB = p.stoneB + blockNoise + pn * 0.9;
      }

      if (chainHit) {
        var cn = (_hash(x + 15800, y + 15801) - 0.5) * 6;
        return {
          r: _clamp(p.chainR + cn),
          g: _clamp(p.chainG + cn),
          b: _clamp(p.chainB + cn * 0.9)
        };
      }

      // Shadow blend — lerp base toward shadow color by shadowT.
      return {
        r: _clamp(baseR * (1 - shadowT) + p.shadowR * shadowT),
        g: _clamp(baseG * (1 - shadowT) + p.shadowG * shadowT),
        b: _clamp(baseB * (1 - shadowT) + p.shadowB * shadowT)
      };
    });
  }

  // Territorial mark — three diagonal claw/scorch gouges on stone.
  // Each slash has a deep dark core, a scorched edge fading into the
  // base stone, and scattered bone-white stone chips along the rim.
  function _genTerritorialMark(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Stone flagstone base (same geometry as _genRoostShadow).
      var blockW = 16, blockH = 12;
      var row = Math.floor(y / blockH);
      var ox = (row % 2 === 1) ? 8 : 0;
      var lx = (x + ox) % blockW;
      var ly = y % blockH;
      var isMortar = (lx < 1 || ly < 1);

      // Three diagonal slashes. A slash line is y = x + offset; perpendicular
      // distance is |y - x - offset| / sqrt(2). Offsets spread the slashes
      // across the 64px tile; a y-banded warp keeps lines from feeling ruled.
      var slashOffsets = [-36, -8, 20];
      var slashWidth = 2.0;
      var slashEdge = 1.0;
      var warp = (_hash(Math.floor(y / 4) + 15900, 0) - 0.5) * 3.0;

      var bestCoreDist = 999;
      for (var i = 0; i < slashOffsets.length; i++) {
        var perp = Math.abs(y - x - slashOffsets[i] - warp) / Math.SQRT2;
        if (perp < bestCoreDist) bestCoreDist = perp;
      }

      // Chip highlights — 1-2px bright pixels along the scorched rim,
      // representing displaced stone chipped out by the claws.
      var chipRoll = _hash(x + 16000, y + 16001);
      var isChip = bestCoreDist > slashWidth &&
                   bestCoreDist < slashWidth + 1.6 &&
                   chipRoll > 0.82;

      // Base stone tone
      var blockId = row * 5 + Math.floor((x + ox) / blockW);
      var blockNoise = (_hash(blockId + 16100, row + 16101) - 0.5) * 12;
      var pn = (_hash(x + 16200, y + 16201) - 0.5) * 6;
      var baseR, baseG, baseB;
      if (isMortar) {
        baseR = p.stoneR * 0.4;
        baseG = p.stoneG * 0.4;
        baseB = p.stoneB * 0.4;
      } else {
        baseR = p.stoneR + blockNoise + pn;
        baseG = p.stoneG + blockNoise + pn;
        baseB = p.stoneB + blockNoise + pn * 0.9;
      }

      if (bestCoreDist < slashWidth) {
        // Deep gouge core — near-black claw cut.
        var gn = (_hash(x + 16300, y + 16301) - 0.5) * 5;
        return {
          r: _clamp(p.gougeR + gn),
          g: _clamp(p.gougeG + gn),
          b: _clamp(p.gougeB + gn)
        };
      }
      if (bestCoreDist < slashWidth + slashEdge) {
        // Scorched edge — linear blend from gouge color back to a dimmed
        // fraction of the base stone, so the cut feels recessed.
        var eT = (bestCoreDist - slashWidth) / slashEdge;
        var en = (_hash(x + 16400, y + 16401) - 0.5) * 4;
        return {
          r: _clamp(p.gougeR * (1 - eT) + baseR * 0.55 * eT + en),
          g: _clamp(p.gougeG * (1 - eT) + baseG * 0.55 * eT + en),
          b: _clamp(p.gougeB * (1 - eT) + baseB * 0.55 * eT + en * 0.9)
        };
      }
      if (isChip) {
        var cn = (_hash(x + 16500, y + 16501) - 0.5) * 8;
        return {
          r: _clamp(p.chipR + cn),
          g: _clamp(p.chipG + cn),
          b: _clamp(p.chipB + cn * 0.9)
        };
      }

      return {
        r: _clamp(baseR),
        g: _clamp(baseG),
        b: _clamp(baseB)
      };
    });
  }

  // ── Bonfire stone ring texture ───────────────────────────────────
  // Low cylindrical wall for the 0.3× bonfire tile. Riverrock masonry
  // with soot blackening at top and inner fire glow along the upper edge.

  // Bonfire ring texture with alpha-transparent porthole (sprite-inside-wall).
  // The porthole lets the raycaster's cavity pre-fill and cavity glow show
  // Bonfire stone ring — fully opaque riverrock masonry. The fire cavity
  // is created by the step-fill (Doom rule) system via a negative
  // tileHeightOffset — the lip above the displaced wall reads as the
  // campfire opening. No alpha porthole needed.

  function _genBonfireRing(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE; // 64
      var cx = S / 2;   // 32

      // Soot gradient — darkens toward the top (y=0 = top of wall)
      var sootBlend = Math.max(0, 1 - y / (S * 0.35)); // 0 at bottom, 1 at top
      var sootSq = sootBlend * sootBlend;

      // Inner fire glow at the very top edge (top 3px)
      if (y < 3) {
        var gn = (_hash(x + 7700, y + 7701) - 0.5) * 20;
        return {
          r: _clamp(p.glowR + gn),
          g: _clamp(p.glowG + gn * 0.4),
          b: _clamp(p.glowB + gn * 0.2)
        };
      }

      // Riverrock masonry — same interlocking pattern as hearth
      var stoneW = 10;
      var stoneH = 7;
      var rowOff = (Math.floor(y / stoneH) % 2 === 0) ? 0 : stoneW / 2;
      var stoneCol = Math.floor((x + rowOff) / stoneW);
      var stoneRow = Math.floor(y / stoneH);
      var localX = (x + rowOff) - stoneCol * stoneW;
      var localY = y - stoneRow * stoneH;

      // Mortar gaps
      if (localX < 1 || localX >= stoneW - 1 || localY < 1 || localY >= stoneH - 1) {
        var mn = (_hash(x + 7800, y + 7801) - 0.5) * 6;
        return {
          r: _clamp(p.mortarR + mn - sootSq * 20),
          g: _clamp(p.mortarG + mn - sootSq * 18),
          b: _clamp(p.mortarB + mn - sootSq * 15)
        };
      }

      // Stone face with per-stone color variation + soot overlay
      var stoneHash = _hash(stoneCol + 7900, stoneRow + 7901);
      var stoneVar = (stoneHash - 0.5) * 20;
      var pn = (_hash(x + 8000, y + 8001) - 0.5) * 10;

      return {
        r: _clamp(p.stoneR + stoneVar + pn - sootSq * (p.stoneR - p.sootR)),
        g: _clamp(p.stoneG + stoneVar * 0.8 + pn * 0.8 - sootSq * (p.stoneG - p.sootG)),
        b: _clamp(p.stoneB + stoneVar * 0.6 + pn * 0.6 - sootSq * (p.stoneB - p.sootB))
      };
    });
  }

  // ── Dump truck wheel decor ──────────────────────────────────────
  // Black tire ring with grey hub, alpha-transparent background.
  // Placed on DUMP_TRUCK wall faces via wallDecor system.

  function _genTruckWheel(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;
      var cy = S / 2;
      var dx = x - cx;
      var dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var outerR = S * 0.48;   // Tire outer radius
      var innerR = S * 0.28;   // Hub outer radius
      var axleR  = S * 0.10;   // Axle center radius
      var pn = (_hash(x + 9000, y + 9100) - 0.5) * 6;

      if (dist > outerR) {
        return { r: 0, g: 0, b: 0, a: 0 };  // Outside tire — transparent
      }
      if (dist > innerR) {
        // Tire rubber — black with subtle tread noise
        var tread = Math.sin(Math.atan2(dy, dx) * 12) * 4;
        return {
          r: _clamp(p.tireR + pn + tread),
          g: _clamp(p.tireG + pn + tread),
          b: _clamp(p.tireB + pn + tread),
          a: 255
        };
      }
      if (dist > axleR) {
        // Hub — grey metal with spoke hints
        var spoke = Math.cos(Math.atan2(dy, dx) * 5) > 0.6 ? 12 : 0;
        return {
          r: _clamp(p.hubR + pn + spoke),
          g: _clamp(p.hubG + pn + spoke),
          b: _clamp(p.hubB + pn + spoke),
          a: 255
        };
      }
      // Axle center — dark
      return {
        r: _clamp(p.axleR + pn),
        g: _clamp(p.axleG + pn),
        b: _clamp(p.axleB + pn),
        a: 255
      };
    });
  }

  // ── Dump truck hose reel decor ────────────────────────────────
  // Blue spool with orange end caps and nozzle (matches diagram).

  function _genTruckHoseReel(id, p) {
    _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
      var S = DECOR_SIZE;
      var cx = S / 2;
      var cy = S / 2;
      var dx = x - cx;
      var dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var pn = (_hash(x + 9200, y + 9300) - 0.5) * 6;

      // Spool body — vertical cylinder with horizontal stripes (hose wraps)
      var spoolW = S * 0.40;  // Half-width of spool body
      var spoolH = S * 0.44;  // Half-height of spool body
      var capH   = S * 0.10;  // Cap thickness (top + bottom)

      // Outside bounding box — transparent
      if (Math.abs(dx) > spoolW + capH * 0.3 || Math.abs(dy) > spoolH) {
        // Nozzle — extends to the right from center
        if (dy < 0 && dy > -S * 0.06 && x > cx + spoolW * 0.5 && x < S - 2) {
          return {
            r: _clamp(p.needleR + pn),
            g: _clamp(p.needleG + pn),
            b: _clamp(p.needleB + pn),
            a: 255
          };
        }
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      // End caps (top and bottom of spool — wider, orange)
      if (Math.abs(dy) > spoolH - capH) {
        return {
          r: _clamp(p.capR + pn),
          g: _clamp(p.capG + pn),
          b: _clamp(p.capB + pn),
          a: 255
        };
      }

      // Hose wraps — horizontal blue stripes with slight shade variation
      var wrap = Math.floor((y - (cy - spoolH + capH)) / 3);
      var wrapShade = (wrap % 2 === 0) ? 8 : -8;
      return {
        r: _clamp(p.spoolR + pn + wrapShade),
        g: _clamp(p.spoolG + pn + wrapShade),
        b: _clamp(p.spoolB + pn + wrapShade),
        a: 255
      };
    });
  }

  // ── Roof shingle texture ────────────────────────────────────────
  // Overlapping rows of angled shingles/tiles. Works for terracotta,
  // slate, and thatch via palette swap. Horizontal tiling so adjacent
  // roof tiles produce a continuous roofline.
  function _genRoofShingle(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var n = _hash(x, y);

      // Shingle row height (8px rows for chunky look)
      var rowH = 8;
      var row = Math.floor(y / rowH);
      var ry = y % rowH;

      // Stagger every other row by half a shingle width
      var shingleW = 12;
      var stagger = (row % 2 === 0) ? 0 : Math.floor(shingleW / 2);
      var sx = (x + stagger) % shingleW;

      // Mortar/seam line between shingles (vertical) and rows (horizontal)
      var isVertSeam = sx === 0 || sx === 1;
      var isHorizSeam = ry === 0;

      if (isHorizSeam || isVertSeam) {
        var mn = n * 12 - 6;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn),
          a: 255
        };
      }

      // Shingle body — slight gradient: lighter at top (exposed edge),
      // darker at bottom (shadow under next row's overlap)
      var overlap = ry / rowH;          // 0 at top of shingle -> 1 at bottom
      var shade = 1.0 - overlap * 0.25; // Top brighter, bottom 25% darker

      // Highlight on exposed top-left edge of each shingle
      var isHiEdge = ry <= 2 && sx >= 2 && sx <= 5;

      var pn = n * 16 - 8; // per-pixel noise
      if (isHiEdge) {
        return {
          r: _clamp(p.hiR + pn),
          g: _clamp(p.hiG + pn),
          b: _clamp(p.hiB + pn),
          a: 255
        };
      }

      return {
        r: _clamp(p.baseR * shade + pn),
        g: _clamp(p.baseG * shade + pn),
        b: _clamp(p.baseB * shade + pn),
        a: 255
      };
    });
  }

  // ── Canopy leaf texture generator ────────────────────────────────
  // Dense leaf clusters with dappled light. Organic irregular pattern.
  function _genCanopyLeaf(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var n = _hash(x, y);
      var n2 = _hash(x + 37, y + 53);

      // Leaf cluster cells — irregular Voronoi-ish via dual hash
      var cellSize = 6;
      var cx = Math.floor(x / cellSize);
      var cy = Math.floor(y / cellSize);
      var cellN = _hash(cx * 7 + 3, cy * 13 + 5);

      // Local position within cell (0–1)
      var lx = (x % cellSize) / cellSize;
      var ly = (y % cellSize) / cellSize;

      // Dark gap between leaf clusters
      var edgeDist = Math.min(lx, 1 - lx, ly, 1 - ly);
      var isGap = edgeDist < 0.15 && n < 0.4;

      if (isGap) {
        return {
          r: _clamp(p.gapR + n * 10 - 5),
          g: _clamp(p.gapG + n * 10 - 5),
          b: _clamp(p.gapB + n * 10 - 5),
          a: 255
        };
      }

      // Dappled sunlight — scattered bright spots
      var isSunlit = n2 > 0.82;

      // Per-cell hue shift for variety (some leaves lighter/darker)
      var cellShift = (cellN - 0.5) * 30;
      var pn = n * 14 - 7;

      if (isSunlit) {
        return {
          r: _clamp(p.hiR + pn + cellShift * 0.3),
          g: _clamp(p.hiG + pn + cellShift * 0.5),
          b: _clamp(p.hiB + pn),
          a: 255
        };
      }

      return {
        r: _clamp(p.baseR + pn + cellShift * 0.3),
        g: _clamp(p.baseG + pn + cellShift * 0.5),
        b: _clamp(p.baseB + pn),
        a: 255
      };
    });
  }

  // ── Arch Doorway ──
  //
  // 64×64 brick wall with a parabolic arch cutout. The cutout region
  // returns α=0 so the raycaster's alpha-mask freeform path can read
  // the per-column transparent row range and produce a curved opening.
  // The arch spans ~70% of the texture width (centred), with the apex
  // at ~row 6 and the spring line at ~row 50. Below the spring line
  // the opening continues as a flat vertical slot down to the bottom
  // of the texture (the doorway proper).

  function _genArchDoorway(id, p) {
    var archCX   = TEX_SIZE / 2;        // horizontal centre of the arch
    var archHalf = TEX_SIZE * 0.35;     // half-width of the opening
    var apexY    = 6;                   // top of arch curve (texel row)
    var springY  = Math.floor(TEX_SIZE * 0.78); // where the curve meets
                                        //   the vertical jambs (~row 50)
    var jamb     = 3;                   // pixel-thick stone trim at edge

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Distance from horizontal centre (0 = dead centre, 1 = edge of arch)
      var dx = Math.abs(x - archCX) / archHalf;

      // Is this pixel inside the transparent opening?
      var inside = false;
      if (dx < 1.0) {
        if (y >= springY) {
          // Below the spring line: flat rectangular doorway
          inside = true;
        } else {
          // Above the spring line: parabolic curve.
          // Parabola: at y = apexY, dx = 0 (apex). At y = springY, dx = 1.
          var t = (y - apexY) / (springY - apexY); // 0 at apex, 1 at spring
          if (t < 0) t = 0;
          // The arch boundary at this row: dx_boundary = sqrt(t)
          // (parabolic profile — gives a slightly pointed Gothic feel
          // vs. the semicircle's more squat Romanesque look).
          var boundary = Math.sqrt(t);
          if (dx < boundary) inside = true;
        }
      }

      // Jamb trim: a narrow stone band tracing the arch edge.
      // Check if the pixel is within `jamb` px of the arch boundary.
      var isJamb = false;
      if (!inside) {
        for (var jd = 1; jd <= jamb; jd++) {
          var testDx = Math.abs(x - archCX - (dx > 0 ? -jd : jd)) / archHalf;
          if (testDx < 0) testDx = -testDx;
          var insideTest = false;
          if (testDx < 1.0) {
            if (y >= springY) {
              insideTest = true;
            } else {
              var tt = (y - apexY) / (springY - apexY);
              if (tt < 0) tt = 0;
              if (testDx < Math.sqrt(tt)) insideTest = true;
            }
          }
          if (insideTest) { isJamb = true; break; }
        }
        // Also mark jamb below spring line (vertical door jambs)
        if (!isJamb && y >= springY && dx >= 1.0 && dx < 1.0 + jamb / archHalf) {
          isJamb = true;
        }
      }

      if (inside) {
        return { r: 0, g: 0, b: 0, a: 0 }; // transparent — the opening
      }

      var n = _hash(x, y) * 14 - 7;

      if (isJamb) {
        // Keystone / voussoir trim — lighter stone accent
        return {
          r: _clamp(p.jambR + n),
          g: _clamp(p.jambG + n),
          b: _clamp(p.jambB + n)
        };
      }

      // Normal brickwork surround (reuse _genBrick inline pattern)
      var brickH  = 10;
      var brickW  = 16;
      var mortarW = 2;
      var row = Math.floor(y / brickH);
      var localY = y % brickH;
      var offsetX = (row % 2 === 1) ? Math.floor(brickW / 2) : 0;
      var localX = (x + offsetX) % brickW;
      var isMortar = localX < mortarW || localY < mortarW;
      if (isMortar) {
        return {
          r: _clamp(p.mortarR + n * 0.5),
          g: _clamp(p.mortarG + n * 0.5),
          b: _clamp(p.mortarB + n * 0.5)
        };
      }
      return {
        r: _clamp(p.baseR + n),
        g: _clamp(p.baseG + n),
        b: _clamp(p.baseB + n)
      };
    });
  }

  // ── Porthole (alpha-cutout) ──
  //
  // 64×64 brick/metal wall with a circular cutout at the centre.
  // The cutout region returns α=0. A riveted steel frame ring
  // surrounds the opening (same aesthetic as the existing
  // _genPortholeWall but the glass region is genuinely transparent
  // instead of painted with an ocean scene).

  function _genPortholeAlpha(id, p) {
    var cx = TEX_SIZE / 2;
    var cy = TEX_SIZE / 2;
    var holeR = p.radius || Math.floor(TEX_SIZE * 0.30); // opening radius
    var frameW = p.frameWidth || 4;  // steel frame ring width

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var dx = x - cx;
      var dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Inside the opening — transparent
      if (dist < holeR) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }

      var n = _hash(x, y) * 14 - 7;

      // Steel frame ring
      if (dist < holeR + frameW) {
        // Rivet bumps at 8 evenly spaced points around the ring
        var angle = Math.atan2(dy, dx);
        var rivetAngle = ((angle + Math.PI) / (2 * Math.PI)) * 8;
        var rivetDist = Math.abs(rivetAngle - Math.round(rivetAngle));
        var isRivet = rivetDist < 0.12 && dist > holeR + 1 && dist < holeR + frameW - 1;

        if (isRivet) {
          return {
            r: _clamp(p.rivetR + n * 0.5),
            g: _clamp(p.rivetG + n * 0.5),
            b: _clamp(p.rivetB + n * 0.5)
          };
        }
        return {
          r: _clamp(p.frameR + n * 0.4),
          g: _clamp(p.frameG + n * 0.4),
          b: _clamp(p.frameB + n * 0.4)
        };
      }

      // Wall surround — brick/metal
      var brickH  = 10;
      var brickW  = 16;
      var mortarW = 2;
      var row = Math.floor(y / brickH);
      var localY = y % brickH;
      var offsetX = (row % 2 === 1) ? Math.floor(brickW / 2) : 0;
      var localX = (x + offsetX) % brickW;
      var isMortar = localX < mortarW || localY < mortarW;
      if (isMortar) {
        return {
          r: _clamp(p.mortarR + n * 0.5),
          g: _clamp(p.mortarG + n * 0.5),
          b: _clamp(p.mortarB + n * 0.5)
        };
      }
      return {
        r: _clamp(p.baseR + n),
        g: _clamp(p.baseG + n),
        b: _clamp(p.baseB + n)
      };
    });
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init: init,
    get: get,
    hasTexture: hasTexture,
    register: register,
    tick: tick,
    TEX_SIZE: TEX_SIZE
  };
})();
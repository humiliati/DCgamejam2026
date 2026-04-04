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

    // Hearth fire — flame + dragon silhouette for porthole cavity
    _genHearthFire('decor_hearth_fire', {
      coreR: 255, coreG: 230, coreB: 120,     // Bright yellow-white core
      outerR: 210, outerG: 100, outerB: 25,    // Deep orange outer flame
      dragonR: 60,  dragonG: 30,  dragonB: 15  // Dark ember dragon silhouette
    });

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

    // Bonfire stone ring — low cylindrical wall texture for 0.3× bonfire tile
    _genBonfireRing('bonfire_ring', {
      stoneR: 85, stoneG: 78, stoneB: 68,      // Warm grey river stones
      mortarR: 40, mortarG: 35, mortarB: 28,    // Dark mortar joints
      sootR: 25,  sootG: 20,  sootB: 15,       // Soot staining at top
      glowR: 120, glowG: 50,  glowB: 10        // Inner fire glow at top
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
      var chevrons = [
        { apex: 16, size: 16 },
        { apex: 36, size: 16 }
      ];
      for (var ci = 0; ci < chevrons.length; ci++) {
        var ch = chevrons[ci];
        var dy = y - ch.apex;
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
      var chevrons = [
        { apex: 18, size: 16 },
        { apex: 38, size: 16 }
      ];
      for (var ci = 0; ci < chevrons.length; ci++) {
        var ch = chevrons[ci];
        var dy = ch.apex - y;  // Inverted: apex at top
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
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Horizontal planks (running left-right, seen from above)
      var plankH = 8;
      var plankIdx = Math.floor(y / plankH);
      var localY = y % plankH;

      // Plank gap
      if (localY < 1) {
        return {
          r: _clamp(p.baseR * 0.4),
          g: _clamp(p.baseG * 0.4),
          b: _clamp(p.baseB * 0.4)
        };
      }

      // Wood grain — horizontal streaks
      var grain = Math.sin(y * 0.3 + _hash(0, plankIdx) * 6) * 0.5 + 0.5;
      var darkGrain = grain < 0.3 ? p.grainDark : 1.0;

      // Per-plank color variation
      var plankNoise = (_hash(plankIdx, plankIdx + 77) - 0.5) * 15;
      var pn = (_hash(x + 3400, y + 3500) - 0.5) * 6;

      return {
        r: _clamp(p.baseR * darkGrain + plankNoise + pn),
        g: _clamp(p.baseG * darkGrain + plankNoise * 0.8 + pn * 0.7),
        b: _clamp(p.baseB * darkGrain + plankNoise * 0.5 + pn * 0.4)
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

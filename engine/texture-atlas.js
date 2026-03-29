/**
 * TextureAtlas — texture loading, caching, and procedural generation.
 *
 * Manages all wall textures for the raycaster. Each texture is stored
 * as an offscreen canvas + ImageData for fast column sampling.
 *
 * For the jam: all textures are generated procedurally at init() time.
 * Post-jam: load hand-pixeled PNGs through the same API.
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

    // Locked door — iron-banded wood with chain + lock overlay
    _genDoorLocked('door_locked', {
      baseR: 100, baseG: 68, baseB: 38,      // Wood base
      bandR: 70,  bandG: 50, bandB: 28,      // Iron bands
      chainR: 90, chainG: 95, chainB: 100,   // Chain + padlock color
      lockR: 180, lockG: 160, lockB: 50      // Brass lock highlight
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
        d[idx + 3] = 255;
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
    var brickH = 8;  // brick height in pixels
    var brickW = 16; // brick width in pixels
    var mortarW = 1; // mortar line width

    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var row = Math.floor(y / brickH);
      var localY = y % brickH;
      var offsetX = (row % 2 === 1) ? Math.floor(brickW / 2) : 0;
      var localX = (x + offsetX) % brickW;

      // Mortar lines
      if (localY < mortarW || localX < mortarW) {
        var mn = _hash(x + 100, y + 200) * 10 - 5;
        return {
          r: _clamp(p.mortarR + mn),
          g: _clamp(p.mortarG + mn),
          b: _clamp(p.mortarB + mn)
        };
      }

      // Brick face with per-brick color variation
      var brickId = row * 10 + Math.floor((x + offsetX) / brickW);
      var brickNoise = (_hash(brickId, row) - 0.5) * p.variance * 2;
      var pixNoise = (_hash(x, y) - 0.5) * 8;

      return {
        r: _clamp(p.faceR + brickNoise + pixNoise),
        g: _clamp(p.faceG + brickNoise + pixNoise * 0.8),
        b: _clamp(p.faceB + brickNoise + pixNoise * 0.6)
      };
    });
  }

  // ── Stone ──

  function _genStone(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Irregular blocks: use hash to create "seams"
      var blockX = Math.floor(x / 12);
      var blockY = Math.floor(y / 10);
      var seamX = x % 12;
      var seamY = y % 10;

      // Offset every other row
      var ox = (blockY % 2 === 1) ? 6 : 0;
      var adjX = (x + ox) % 12;

      // Mortar seams
      if (adjX < 1 || seamY < 1) {
        return {
          r: _clamp(p.baseR * 0.5),
          g: _clamp(p.baseG * 0.5),
          b: _clamp(p.baseB * 0.5)
        };
      }

      var blockId = blockY * 8 + Math.floor((x + ox) / 12);
      var blockNoise = (_hash(blockId, blockY + 50) - 0.5) * p.variance * 2;
      var pixNoise = (_hash(x + 300, y + 400) - 0.5) * 10;

      return {
        r: _clamp(p.baseR + blockNoise + pixNoise),
        g: _clamp(p.baseG + blockNoise + pixNoise * 0.9),
        b: _clamp(p.baseB + blockNoise + pixNoise * 0.8)
      };
    });
  }

  // ── Wood ──

  function _genWood(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Vertical grain lines
      var grainFreq = 0.4;
      var grain = Math.sin(x * grainFreq + _hash(x, 0) * 3) * 0.5 + 0.5;
      var darkGrain = grain < 0.3 ? p.grainDark : 1.0;

      // Horizontal knot variation
      var knot = _hash(Math.floor(x / 8), Math.floor(y / 16));
      var knotEffect = knot > 0.92 ? -20 : 0;

      var pixNoise = (_hash(x + 500, y + 600) - 0.5) * 10;

      return {
        r: _clamp(p.baseR * darkGrain + pixNoise + knotEffect),
        g: _clamp(p.baseG * darkGrain + pixNoise * 0.7 + knotEffect),
        b: _clamp(p.baseB * darkGrain + pixNoise * 0.4 + knotEffect)
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
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      // Smooth surface with very subtle noise + occasional seam lines
      var pn = (_hash(x + 1200, y + 1300) - 0.5) * p.variance * 2;
      var seamH = (y % 32) < 1 ? -10 : 0;
      var seamV = (x % 32) < 1 ? -8 : 0;

      return {
        r: _clamp(p.baseR + pn + seamH + seamV),
        g: _clamp(p.baseG + pn + seamH + seamV),
        b: _clamp(p.baseB + pn * 0.8 + seamH + seamV)
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
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y, w, h) {
      var cx = w / 2;

      // Stone base with noise
      var pn = (_hash(x + 2000, y + 2100) - 0.5) * 10;
      var r = p.stoneR + pn;
      var g = p.stoneG + pn;
      var b = p.stoneB + pn;

      // Horizontal step lines every 10px (perspective depth cue)
      var stepBand = (y % 10);
      if (stepBand < 1) {
        r = p.stepR + pn * 0.5;
        g = p.stepG + pn * 0.5;
        b = p.stepB + pn * 0.5;
      }

      // Down-pointing chevron (▼) in center — 3 nested V-shapes
      // Each chevron: centerX = cx, apex at y=offset, legs spread 1px per row
      var chevrons = [
        { apex: 18, size: 14 },
        { apex: 32, size: 14 },
        { apex: 46, size: 12 }
      ];
      for (var ci = 0; ci < chevrons.length; ci++) {
        var ch = chevrons[ci];
        var dy = y - ch.apex;
        if (dy >= 0 && dy < ch.size) {
          var halfW = dy * 0.8 + 2;
          var dist = Math.abs(x - cx);
          if (dist <= halfW && dist >= halfW - 2.5) {
            r = p.arrowR;
            g = p.arrowG;
            b = p.arrowB;
          }
        }
      }

      // Frame
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) {
        r = p.stoneR * 0.5;
        g = p.stoneG * 0.5;
        b = p.stoneB * 0.5;
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Stairs up (lighter stone with upward chevrons + warm glow) ──

  function _genStairsUp(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y, w, h) {
      var cx = w / 2;

      // Stone base with noise + warm vertical gradient (lighter at top)
      var warmth = 1.0 + (1.0 - y / h) * 0.15;
      var pn = (_hash(x + 2200, y + 2300) - 0.5) * 10;
      var r = p.stoneR * warmth + pn;
      var g = p.stoneG * warmth + pn;
      var b = p.stoneB * warmth + pn * 0.7;

      // Horizontal step lines every 10px
      var stepBand = (y % 10);
      if (stepBand < 1) {
        r = p.stepR * warmth + pn * 0.5;
        g = p.stepG * warmth + pn * 0.5;
        b = p.stepB * warmth + pn * 0.3;
      }

      // Up-pointing chevrons (▲) — apex at top, legs go down
      var chevrons = [
        { apex: 14, size: 12 },
        { apex: 28, size: 14 },
        { apex: 44, size: 14 }
      ];
      for (var ci = 0; ci < chevrons.length; ci++) {
        var ch = chevrons[ci];
        var dy = ch.apex - y;  // Inverted: apex at top
        if (dy >= 0 && dy < ch.size) {
          var halfW = dy * 0.8 + 2;
          var dist = Math.abs(x - cx);
          if (dist <= halfW && dist >= halfW - 2.5) {
            r = p.arrowR;
            g = p.arrowG;
            b = p.arrowB;
          }
        }
      }

      // Frame
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) {
        r = p.stoneR * 0.6;
        g = p.stoneG * 0.6;
        b = p.stoneB * 0.5;
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
    });
  }

  // ── Locked door (wood + iron bands + chain/padlock overlay) ──

  function _genDoorLocked(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y, w, h) {
      var cx = w / 2;
      var cy = h / 2;

      // Start from wooden door base
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) {
        return { r: _clamp(p.bandR - 15), g: _clamp(p.bandG - 15), b: _clamp(p.bandB - 15) };
      }

      // Horizontal bands every 16px
      var bandZone = (y % 16) < 2;
      var r, g, b;
      if (bandZone) {
        var bn = (_hash(x + 700, y) - 0.5) * 6;
        r = p.bandR + bn;
        g = p.bandG + bn;
        b = p.bandB + bn;
      } else {
        // Wood grain
        var grain = Math.sin(x * 0.5 + _hash(x, 0) * 2) * 0.5 + 0.5;
        var mult = grain < 0.25 ? 0.8 : 1.0;
        var pn = (_hash(x + 800, y + 900) - 0.5) * 8;
        r = p.baseR * mult + pn;
        g = p.baseG * mult + pn * 0.7;
        b = p.baseB * mult + pn * 0.4;
      }

      // Chain: diagonal cross pattern across center (X shape)
      var chainThick = 2;
      // Diagonal from top-left to bottom-right through center
      var d1 = Math.abs((x - cx) - (y - cy));
      // Diagonal from top-right to bottom-left through center
      var d2 = Math.abs((x - cx) + (y - cy));
      // Only in center region (within 18px of center)
      var nearCenter = Math.abs(x - cx) < 18 && Math.abs(y - cy) < 18;

      if (nearCenter && (d1 < chainThick || d2 < chainThick)) {
        // Chain links: modulate brightness every 4px for link pattern
        var linkPhase = (d1 < chainThick)
          ? ((x + y) % 4) < 2
          : ((x - y + 64) % 4) < 2;
        var linkMult = linkPhase ? 1.0 : 0.7;
        r = p.chainR * linkMult;
        g = p.chainG * linkMult;
        b = p.chainB * linkMult;
      }

      // Padlock: centered, just below center (5x7 rect + 3px shackle arc)
      var lockX = x - cx;
      var lockY = y - (cy + 2);
      if (lockX >= -3 && lockX <= 3 && lockY >= 0 && lockY <= 7) {
        // Lock body
        r = p.lockR;
        g = p.lockG;
        b = p.lockB;
        // Keyhole (1px dark dot at center of lock body)
        if (lockX >= -1 && lockX <= 0 && lockY >= 2 && lockY <= 4) {
          r = 20; g = 18; b = 15;
        }
      }
      // Shackle (arc above lock body)
      if (lockY >= -4 && lockY < 0) {
        var shDist = Math.sqrt(lockX * lockX + (lockY + 2) * (lockY + 2));
        if (shDist >= 2 && shDist <= 3.5) {
          r = p.chainR;
          g = p.chainG;
          b = p.chainB;
        }
      }

      return { r: _clamp(r), g: _clamp(g), b: _clamp(b) };
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

  // ── Breakable crate (wooden slats + cross-braces + nails) ──

  function _genCrateWood(id, p) {
    _createTexture(id, TEX_SIZE, TEX_SIZE, function (x, y) {
      var S = TEX_SIZE;
      // Border frame (3px thick edge)
      var frameW = 3;
      var onFrame = x < frameW || x >= S - frameW || y < frameW || y >= S - frameW;

      // Cross-brace: two diagonal strips forming an X
      var cx = S / 2, cy = S / 2;
      var dx = x - cx, dy = y - cy;
      var onBraceA = Math.abs(dx - dy) < 3;   // top-left to bottom-right
      var onBraceB = Math.abs(dx + dy) < 3;   // top-right to bottom-left
      var onBrace = onBraceA || onBraceB;

      // Horizontal slat lines every 8px
      var slatLine = (y % 8 === 0 || y % 8 === 1) && !onFrame;

      // Nail heads at brace-frame intersections and center cross
      var onNail = false;
      var nailPositions = [
        [frameW, frameW], [S - frameW - 1, frameW],
        [frameW, S - frameW - 1], [S - frameW - 1, S - frameW - 1],
        [cx, cy]
      ];
      for (var ni = 0; ni < nailPositions.length; ni++) {
        var ndx = x - nailPositions[ni][0];
        var ndy = y - nailPositions[ni][1];
        if (ndx * ndx + ndy * ndy < 4) { onNail = true; break; }
      }

      // Wood grain noise
      var grain = _hash(x * 2, y + 500) * 0.3 - 0.15;
      var slatDark = slatLine ? -15 : 0;

      if (onNail) {
        return { r: p.nailR, g: p.nailG, b: p.nailB };
      }
      if (onFrame || onBrace) {
        return {
          r: _clamp(p.braceR + grain * 40),
          g: _clamp(p.braceG + grain * 30),
          b: _clamp(p.braceB + grain * 20)
        };
      }
      return {
        r: _clamp(p.baseR + grain * 50 + slatDark),
        g: _clamp(p.baseG + grain * 35 + slatDark),
        b: _clamp(p.baseB + grain * 20 + slatDark)
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

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

    _genDoorWood('door_wood', { baseR: 120, baseG: 80, baseB: 45,
      bandR: 80, bandG: 55, bandB: 30 });

    _genDoorIron('door_iron', { baseR: 70, baseG: 72, baseB: 78,
      rivetR: 100, rivetG: 105, rivetB: 110 });

    _genConcrete('concrete', { baseR: 130, baseG: 128, baseB: 125, variance: 8 });

    _genConcrete('concrete_dark', { baseR: 70, baseG: 68, baseB: 72, variance: 6 });

    _genMetal('metal_plate', { baseR: 60, baseG: 65, baseB: 75, variance: 10 });

    _genPillar('pillar_stone', { baseR: 110, baseG: 105, baseB: 100 });
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
      // Door frame (2px border)
      if (x < 2 || x >= TEX_SIZE - 2 || y < 2 || y >= TEX_SIZE - 2) {
        return {
          r: _clamp(p.bandR - 10),
          g: _clamp(p.bandG - 10),
          b: _clamp(p.bandB - 10)
        };
      }

      // Horizontal bands every 16px
      var bandZone = (y % 16) < 2;
      if (bandZone) {
        var bn = (_hash(x + 700, y) - 0.5) * 6;
        return {
          r: _clamp(p.bandR + bn),
          g: _clamp(p.bandG + bn),
          b: _clamp(p.bandB + bn)
        };
      }

      // Wood grain (vertical)
      var grain = Math.sin(x * 0.5 + _hash(x, 0) * 2) * 0.5 + 0.5;
      var mult = grain < 0.25 ? 0.8 : 1.0;
      var pn = (_hash(x + 800, y + 900) - 0.5) * 8;

      return {
        r: _clamp(p.baseR * mult + pn),
        g: _clamp(p.baseG * mult + pn * 0.7),
        b: _clamp(p.baseB * mult + pn * 0.4)
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

  // ── Public API ──────────────────────────────────────────────────

  return {
    init: init,
    get: get,
    hasTexture: hasTexture,
    register: register,
    TEX_SIZE: TEX_SIZE
  };
})();

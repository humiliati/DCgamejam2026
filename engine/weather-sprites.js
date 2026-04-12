/**
 * WeatherSprites — Procedural sprite cache for weather particles.
 *
 * Each sprite type is drawn once to an offscreen canvas and cached.
 * The weather particle renderer calls draw() with type, position,
 * scale, and rotation — it blits the cached canvas with transforms.
 * No PNG assets required.
 *
 * Layer: 1 (before WeatherSystem, no dependencies)
 *
 * @module WeatherSprites
 */
var WeatherSprites = (function () {
  'use strict';

  // Cache: spriteType → { canvas, w, h, cx, cy }
  var _cache = {};

  // Base size for cached sprites (scaled at draw time)
  var BASE = 16;

  // ═══════════════════════════════════════════════════════════════
  // ── Sprite generators ──
  // ═══════════════════════════════════════════════════════════════

  function _makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /**
   * Newspaper leaf — rounded rectangle with "text" lines.
   * Tan color, slight inner detail for readability at scale.
   */
  function _genNewspaper() {
    var w = 14, h = 10;
    var c = _makeCanvas(w, h);
    var ctx = c.getContext('2d');

    // Paper body
    ctx.fillStyle = '#c8b89a';
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.lineTo(w - 1, 0);
    ctx.quadraticCurveTo(w, 0, w, 1);
    ctx.lineTo(w, h - 1);
    ctx.quadraticCurveTo(w, h, w - 1, h);
    ctx.lineTo(1, h);
    ctx.quadraticCurveTo(0, h, 0, h - 1);
    ctx.lineTo(0, 1);
    ctx.quadraticCurveTo(0, 0, 1, 0);
    ctx.fill();

    // "Text" lines
    ctx.fillStyle = '#9a8a6a';
    ctx.fillRect(2, 2, 10, 1);
    ctx.fillRect(2, 4, 8, 1);
    ctx.fillRect(2, 6, 10, 1);
    ctx.fillRect(2, 8, 5, 1);

    return { canvas: c, w: w, h: h, cx: w / 2, cy: h / 2 };
  }

  /**
   * Leaf — bezier teardrop shape. Olive-green with a center vein.
   */
  function _genLeaf() {
    var w = 10, h = 14;
    var c = _makeCanvas(w, h);
    var ctx = c.getContext('2d');

    ctx.fillStyle = '#6a7a4a';
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.bezierCurveTo(w, 3, w, 10, w / 2, h);
    ctx.bezierCurveTo(0, 10, 0, 3, w / 2, 0);
    ctx.fill();

    // Center vein
    ctx.strokeStyle = '#5a6a3a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(w / 2, 1);
    ctx.lineTo(w / 2, h - 2);
    ctx.stroke();

    return { canvas: c, w: w, h: h, cx: w / 2, cy: h / 2 };
  }

  /**
   * Raindrop — angled 2px line at ~75° (steep diagonal).
   */
  function _genRaindrop() {
    var w = 6, h = 12;
    var c = _makeCanvas(w, h);
    var ctx = c.getContext('2d');

    ctx.strokeStyle = 'rgba(160,180,220,0.8)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w - 1, 0);
    ctx.lineTo(1, h);
    ctx.stroke();

    return { canvas: c, w: w, h: h, cx: w / 2, cy: h / 2 };
  }

  /**
   * Wind streak — long thin horizontal line with alpha fade.
   */
  function _genWindStreak() {
    var w = 36, h = 3;
    var c = _makeCanvas(w, h);
    var ctx = c.getContext('2d');

    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   'rgba(180,190,205,0)');
    grad.addColorStop(0.2, 'rgba(180,190,205,0.5)');
    grad.addColorStop(0.7, 'rgba(180,190,205,0.4)');
    grad.addColorStop(1,   'rgba(180,190,205,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    return { canvas: c, w: w, h: h, cx: w / 2, cy: h / 2 };
  }

  /**
   * Smoke wisp — soft semi-transparent circle with radial gradient.
   */
  function _genSmokeWisp() {
    var r = 8, d = r * 2;
    var c = _makeCanvas(d, d);
    var ctx = c.getContext('2d');

    var grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0,   'rgba(130,120,110,0.5)');
    grad.addColorStop(0.6, 'rgba(130,120,110,0.2)');
    grad.addColorStop(1,   'rgba(130,120,110,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, d, d);

    return { canvas: c, w: d, h: d, cx: r, cy: r };
  }

  /**
   * Dust mote — tiny filled circle.
   */
  function _genDustMote() {
    var d = 4;
    var c = _makeCanvas(d, d);
    var ctx = c.getContext('2d');

    ctx.fillStyle = 'rgba(190,180,160,0.7)';
    ctx.beginPath();
    ctx.arc(d / 2, d / 2, d / 2 - 0.5, 0, 6.2832);
    ctx.fill();

    return { canvas: c, w: d, h: d, cx: d / 2, cy: d / 2 };
  }

  /**
   * Drip — short vertical line (ceiling water drop).
   */
  function _genDrip() {
    var w = 2, h = 6;
    var c = _makeCanvas(w, h);
    var ctx = c.getContext('2d');

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   'rgba(100,140,190,0.2)');
    grad.addColorStop(0.5, 'rgba(100,140,190,0.7)');
    grad.addColorStop(1,   'rgba(100,140,190,0.3)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    return { canvas: c, w: w, h: h, cx: w / 2, cy: h / 2 };
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Generator registry ──
  // ═══════════════════════════════════════════════════════════════

  var _generators = {
    newspaper:    _genNewspaper,
    leaf:         _genLeaf,
    raindrop:     _genRaindrop,
    wind_streak:  _genWindStreak,
    smoke_wisp:   _genSmokeWisp,
    dust_mote:    _genDustMote,
    drip:         _genDrip
  };

  /**
   * Get or create the cached sprite for a given type.
   * @param {string} type — sprite type name
   * @returns {Object|null} { canvas, w, h, cx, cy }
   */
  function _getSprite(type) {
    if (_cache[type]) return _cache[type];
    var gen = _generators[type];
    if (!gen) return null;
    _cache[type] = gen();
    return _cache[type];
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Public draw API ──
  // ═══════════════════════════════════════════════════════════════

  /**
   * Draw a weather sprite at the given position with scale and rotation.
   * Uses cached offscreen canvas — fast drawImage blit.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} type  — sprite type ('newspaper', 'raindrop', etc.)
   * @param {number} x     — screen X
   * @param {number} y     — screen Y
   * @param {number} scale — draw scale multiplier
   * @param {number} rot   — rotation in radians
   */
  function draw(ctx, type, x, y, scale, rot) {
    var sprite = _getSprite(type);
    if (!sprite) return;

    var sw = sprite.w * scale;
    var sh = sprite.h * scale;

    if (rot && Math.abs(rot) > 0.01) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sprite.canvas, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
    } else {
      ctx.drawImage(sprite.canvas, x - sw / 2, y - sh / 2, sw, sh);
    }
  }

  /**
   * Pre-warm all sprite caches. Call at init to avoid first-frame
   * jank when a weather preset activates.
   */
  function warmCache() {
    for (var type in _generators) {
      _getSprite(type);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Public API ──
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    draw:      draw,
    warmCache: warmCache
  });
})();

/**
 * Skybox — per-biome parallax sky with clouds, mountains, and reflections.
 *
 * Renders a multi-layer atmospheric scene to the top half of the viewport
 * for exterior floors, or to the full viewport for the title screen.
 * Each biome has a distinct sky preset that makes it identifiable within
 * seconds — the strongest distance signal in the game.
 *
 * Rendering is column-based (same as raycaster) for natural integration.
 * Clouds and mountains are procedural 1D noise — no sprites or images.
 *
 * Layer 2 (before Raycaster — Raycaster calls Skybox)
 * Depends on: nothing (pure canvas 2D)
 */
var Skybox = (function () {
  'use strict';

  // ── 1D value noise (hash-based, deterministic) ──────────────────

  function _hash1D(n) {
    n = ((n << 13) ^ n) & 0x7fffffff;
    return (1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0) * 0.5 + 0.5;
  }

  function _noise1D(x) {
    var i = Math.floor(x);
    var f = x - i;
    f = f * f * (3 - 2 * f); // smoothstep
    return _hash1D(i) + (_hash1D(i + 1) - _hash1D(i)) * f;
  }

  // ── Presets ─────────────────────────────────────────────────────

  var PRESETS = {
    cedar: {
      zenith:  { r: 42, g: 58, b: 90 },
      horizon: { r: 90, g: 104, b: 120 },
      clouds: [
        { y: 0.15, h: 0.12, depth: 0.3, speed: 0.0003, scale: 80, threshold: 0.42, opacity: 0.35, r: 180, g: 190, b: 210, seed: 10 }
      ],
      mountains: null,
      water: false,
      stars: false
    },
    mainst: {
      zenith:  { r: 42, g: 26, b: 24 },
      horizon: { r: 90, g: 58, b: 32 },
      clouds: [],
      mountains: null,
      water: false,
      stars: false
    },
    harbor: {
      zenith:  { r: 10, g: 24, b: 48 },
      horizon: { r: 26, g: 40, b: 64 },
      clouds: [
        { y: 0.55, h: 0.20, depth: 0.6, speed: 0.0002, scale: 60, threshold: 0.35, opacity: 0.25, r: 80, g: 90, b: 110, seed: 30 }
      ],
      mountains: null,
      water: false,
      stars: true
    },
    historic: {
      zenith:  { r: 26, g: 21, b: 37 },
      horizon: { r: 42, g: 32, b: 53 },
      clouds: [
        { y: 0.30, h: 0.14, depth: 0.35, speed: 0.00025, scale: 90, threshold: 0.45, opacity: 0.3, r: 120, g: 100, b: 130, seed: 40 }
      ],
      mountains: null,
      water: false,
      stars: false
    },
    alpine: {
      zenith:  { r: 10, g: 21, b: 32 },
      horizon: { r: 58, g: 40, b: 24 },
      clouds: [
        { y: 0.35, h: 0.18, depth: 0.4, speed: 0.00015, scale: 50, threshold: 0.38, opacity: 0.5, r: 100, g: 105, b: 115, seed: 50 },
        { y: 0.55, h: 0.12, depth: 0.55, speed: 0.0003, scale: 40, threshold: 0.40, opacity: 0.35, r: 80, g: 85, b: 95, seed: 55 }
      ],
      mountains: { depth: 0.95, scale: 120, maxHeight: 0.25, color: 'rgba(15,18,22,0.9)', seed: 500 },
      water: false,
      stars: false
    },
    dockyard: {
      zenith:  { r: 5, g: 8, b: 16 },
      horizon: { r: 16, g: 24, b: 37 },
      clouds: [],
      mountains: null,
      water: false,
      stars: true
    },
    title: {
      zenith:  { r: 10, g: 21, b: 48 },
      horizon: { r: 90, g: 64, b: 48 },
      clouds: [
        { y: 0.10, h: 0.12, depth: 0.2, speed: 0.0004, scale: 100, threshold: 0.40, opacity: 0.4, r: 200, g: 180, b: 160, seed: 100 },
        { y: 0.25, h: 0.15, depth: 0.35, speed: 0.0006, scale: 70, threshold: 0.38, opacity: 0.35, r: 170, g: 150, b: 140, seed: 110 },
        { y: 0.45, h: 0.10, depth: 0.5, speed: 0.0008, scale: 50, threshold: 0.42, opacity: 0.3, r: 140, g: 120, b: 110, seed: 120 }
      ],
      mountains: { depth: 0.9, scale: 100, maxHeight: 0.2, color: 'rgba(20,24,30,0.95)', seed: 600 },
      water: true,
      stars: true
    }
  };

  // ── Time accumulator for animation ──────────────────────────────
  var _time = 0;

  function init() {
    _time = 0;
  }

  // ── Render (top half only — called by Raycaster for exterior) ───

  /**
   * Render sky to the top half of the viewport.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w   - Canvas width
   * @param {number} h   - Sky region height (halfH of viewport)
   * @param {number} angle - Player facing angle (radians)
   * @param {string} presetName - Biome preset key
   * @param {number} [dt] - Frame delta for cloud drift (ms)
   */
  function render(ctx, w, h, angle, presetName, dt) {
    var preset = PRESETS[presetName] || PRESETS.cedar;
    if (dt) _time += dt;

    // ── Sky gradient ──
    _renderGradient(ctx, w, 0, h, preset.zenith, preset.horizon);

    // ── Stars (before clouds) ──
    if (preset.stars) {
      _renderStars(ctx, w, h, angle);
    }

    // ── Cloud bands ──
    for (var i = 0; i < preset.clouds.length; i++) {
      _renderCloudBand(ctx, w, h, angle, preset.clouds[i]);
    }

    // ── Mountain silhouette ──
    if (preset.mountains) {
      _renderMountains(ctx, w, h, angle, preset.mountains);
    }
  }

  // ── Render full viewport (title screen: sky + water reflection) ─

  /**
   * Render full viewport — sky in top half, water reflection in bottom.
   * Used by TitleScreen for the cinematic Lake Pend Oreille scene.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {number} time - Time in ms for animation
   * @param {string} presetName - Preset key (usually 'title')
   */
  function renderFull(ctx, w, h, time, presetName) {
    var preset = PRESETS[presetName] || PRESETS.title;
    _time = time;
    var halfH = Math.floor(h / 2);

    // ── Sky (top half) ──
    render(ctx, w, halfH, time * 0.0005, presetName, 0);

    // ── Floor gradient (bottom half fallback if no water) ──
    if (!preset.water) {
      _renderGradient(ctx, w, halfH, h - halfH, preset.horizon, { r: 10, g: 10, b: 10 });
      return;
    }

    // ── Water reflection (bottom half) ──
    _renderWaterReflection(ctx, w, h, halfH, time, preset);
  }

  // ── Sky gradient ────────────────────────────────────────────────

  function _renderGradient(ctx, w, y, h, top, bottom) {
    var grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, 'rgb(' + top.r + ',' + top.g + ',' + top.b + ')');
    grad.addColorStop(1, 'rgb(' + bottom.r + ',' + bottom.g + ',' + bottom.b + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, h);
  }

  // ── Star field ──────────────────────────────────────────────────

  function _renderStars(ctx, w, h, angle) {
    // Deterministic star placement based on hash
    var count = Math.floor(w * 0.15);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < count; i++) {
      var sx = (_hash1D(i * 7 + 1) * w * 3 + angle * w * 0.05) % w;
      var sy = _hash1D(i * 13 + 3) * h * 0.7;
      var brightness = _hash1D(i * 19 + 5);

      // Subtle twinkle
      var twinkle = 0.5 + 0.5 * Math.sin(_time * 0.003 + i * 2.1);
      var alpha = brightness * 0.4 * twinkle;

      if (alpha > 0.05) {
        ctx.globalAlpha = alpha;
        var size = brightness > 0.8 ? 2 : 1;
        ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Cloud band ──────────────────────────────────────────────────

  function _renderCloudBand(ctx, w, h, angle, params) {
    var bandY = Math.floor(h * params.y);
    var bandH = Math.floor(h * params.h);
    var scrollX = (angle / (2 * Math.PI)) * w * 2 * params.depth + _time * params.speed;

    for (var x = 0; x < w; x++) {
      var worldX = (x + scrollX) / params.scale;
      var n1 = _noise1D(worldX * 0.3 + params.seed) * 0.6;
      var n2 = _noise1D(worldX * 1.2 + params.seed + 100) * 0.3;
      var n3 = _noise1D(worldX * 3.0 + params.seed + 200) * 0.1;
      var density = n1 + n2 + n3;

      if (density > params.threshold) {
        var alpha = (density - params.threshold) / (1 - params.threshold);
        alpha *= params.opacity;
        var cy = bandY + bandH * 0.5;
        var cloudH = Math.floor(bandH * alpha * 0.8);
        ctx.fillStyle = 'rgba(' + params.r + ',' + params.g + ',' + params.b + ',' + (alpha * 0.6).toFixed(2) + ')';
        ctx.fillRect(x, Math.floor(cy - cloudH / 2), 1, cloudH);
      }
    }
  }

  // ── Mountain silhouette ─────────────────────────────────────────

  function _renderMountains(ctx, w, h, angle, params) {
    var scrollX = (angle / (2 * Math.PI)) * w * 2 * params.depth;
    ctx.fillStyle = params.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var x = 0; x <= w; x++) {
      var worldX = (x + scrollX) / params.scale;
      var mh = _noise1D(worldX + params.seed) * params.maxHeight * h;
      mh += _noise1D(worldX * 3 + params.seed + 50) * params.maxHeight * h * 0.3;
      ctx.lineTo(x, h - mh);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  // ── Water reflection ────────────────────────────────────────────

  function _renderWaterReflection(ctx, w, h, horizonY, time, preset) {
    // Render a darkened, rippled reflection of the sky gradient below horizon
    var reflectH = h - horizonY;

    for (var y = 0; y < reflectH; y++) {
      var reflectY = horizonY - y - 1; // Source scanline (mirrored)
      if (reflectY < 0) reflectY = 0;

      var rippleOffset = Math.sin(y * 0.15 + time * 0.002) * (2 + y * 0.02);
      var alpha = (1 - y / reflectH) * 0.45; // Fade with depth

      // Lerp between horizon color and dark water
      var t = y / reflectH;
      var r = Math.floor(preset.horizon.r * (1 - t) * 0.6);
      var g = Math.floor(preset.horizon.g * (1 - t) * 0.6);
      var b = Math.floor(preset.horizon.b * (1 - t) * 0.7 + 20 * (1 - t));

      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(2) + ')';
      ctx.fillRect(Math.floor(rippleOffset), horizonY + y, w, 1);
    }

    // Water base color underneath
    ctx.fillStyle = 'rgb(6,10,18)';
    ctx.fillRect(0, horizonY, w, reflectH);

    // Re-draw reflection on top (composited)
    for (var y2 = 0; y2 < reflectH; y2++) {
      var ripple2 = Math.sin(y2 * 0.15 + time * 0.002) * (2 + y2 * 0.02);
      var a2 = (1 - y2 / reflectH) * 0.4;
      var t2 = y2 / reflectH;
      var r2 = Math.floor(preset.horizon.r * (1 - t2) * 0.5);
      var g2 = Math.floor(preset.horizon.g * (1 - t2) * 0.5);
      var b2 = Math.floor(preset.horizon.b * (1 - t2) * 0.6 + 15 * (1 - t2));

      ctx.fillStyle = 'rgba(' + r2 + ',' + g2 + ',' + b2 + ',' + a2.toFixed(2) + ')';
      ctx.fillRect(Math.floor(ripple2), horizonY + y2, w, 1);
    }
  }

  // ── Preset access ───────────────────────────────────────────────

  function getPreset(name) { return PRESETS[name] || null; }

  function registerPreset(name, config) { PRESETS[name] = config; }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init: init,
    render: render,
    renderFull: renderFull,
    getPreset: getPreset,
    registerPreset: registerPreset,
    PRESETS: PRESETS
  };
})();

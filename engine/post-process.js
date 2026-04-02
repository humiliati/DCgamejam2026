/**
 * PostProcess — canvas pixel shader pipeline.
 *
 * Applies full-frame visual effects AFTER the raycaster and overlays
 * have rendered but BEFORE HUD DOM elements. Reads the canvas pixels,
 * applies shader passes, writes them back.
 *
 * Available effects:
 *   - CRT scanlines (horizontal darkening bands)
 *   - Chromatic aberration (RGB channel offset)
 *   - Vignette (radial darkening at edges)
 *   - Color grading (per-biome tint, contrast, saturation)
 *   - Film grain (random noise overlay)
 *   - Pixelate (downscale + nearest-neighbor upscale for retro look)
 *   - Dither (ordered Bayer dithering for limited color depth feel)
 *
 * Performance: effects run on getImageData/putImageData which is
 * CPU-bound. On webOS TVs (low-end ARM), only enable 1-2 effects.
 * The module provides a budget system: set a max ms per frame and
 * effects auto-disable if budget is exceeded.
 *
 * Layer 2 (after Raycaster, before CinematicCamera)
 * Depends on: SpatialContract (optional, for biome-aware grading)
 */
var PostProcess = (function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var _enabled = true;
  var _effects = [];           // Ordered pipeline of active effects
  var _budget = 4;             // Max ms per frame for post-processing
  var _lastFrameMs = 0;
  var _frameCount = 0;
  var _skipFrames = 0;         // Adaptive: skip N frames if over budget

  // Offscreen buffer for effects that need a clean read
  var _offCanvas = null;
  var _offCtx = null;

  // ── Scanlines ──────────────────────────────────────────────────
  var SCANLINE_OPACITY = 0.08;   // Darkness of scanline bands
  var SCANLINE_GAP = 3;          // Every Nth row is darkened

  function _scanlines(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,' + SCANLINE_OPACITY + ')';
    for (var y = 0; y < h; y += SCANLINE_GAP) {
      ctx.fillRect(0, y, w, 1);
    }
  }

  // ── Chromatic Aberration ───────────────────────────────────────
  var CHROMA_OFFSET = 1.5;  // Pixel offset for R/B channels

  function _chromaticAberration(ctx, w, h) {
    // Read the current frame
    if (!_offCanvas || _offCanvas.width !== w || _offCanvas.height !== h) {
      _offCanvas = document.createElement('canvas');
      _offCanvas.width = w;
      _offCanvas.height = h;
      _offCtx = _offCanvas.getContext('2d');
    }

    // Copy current frame to offscreen
    _offCtx.drawImage(ctx.canvas, 0, 0);

    // Draw red channel shifted left, blue channel shifted right
    ctx.globalCompositeOperation = 'multiply';

    // Darken original slightly to make room for color shifts
    ctx.globalAlpha = 0.92;
    ctx.drawImage(_offCanvas, 0, 0);

    // Red channel (shifted left)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.06;
    ctx.drawImage(_offCanvas, -CHROMA_OFFSET, 0);

    // Blue channel (shifted right)
    ctx.drawImage(_offCanvas, CHROMA_OFFSET, 0);

    // Reset
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ── Vignette ───────────────────────────────────────────────────
  var VIGNETTE_STRENGTH = 0.35;

  function _vignette(ctx, w, h) {
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.max(cx, cy) * 1.1;
    var grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,' + (VIGNETTE_STRENGTH * 0.3).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(0,0,0,' + VIGNETTE_STRENGTH.toFixed(3) + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Color Grading ──────────────────────────────────────────────
  // Biome-aware tint overlay. Subtle color wash.
  var _gradeTint = null;  // { r, g, b, a } or null

  function _colorGrade(ctx, w, h) {
    if (!_gradeTint) return;
    ctx.fillStyle = 'rgba(' + _gradeTint.r + ',' + _gradeTint.g + ',' +
                    _gradeTint.b + ',' + (_gradeTint.a || 0.06).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }

  // ── Film Grain ─────────────────────────────────────────────────
  var GRAIN_INTENSITY = 0.04;
  var _grainCanvas = null;
  var _grainCtx = null;
  var _grainTimer = 0;
  var GRAIN_REFRESH = 100;  // ms between grain pattern refreshes

  function _generateGrain(w, h) {
    if (!_grainCanvas || _grainCanvas.width !== w || _grainCanvas.height !== h) {
      _grainCanvas = document.createElement('canvas');
      _grainCanvas.width = w;
      _grainCanvas.height = h;
      _grainCtx = _grainCanvas.getContext('2d');
    }
    // Generate at half resolution for speed
    var hw = Math.floor(w / 2);
    var hh = Math.floor(h / 2);
    var imgData = _grainCtx.createImageData(hw, hh);
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = Math.floor(Math.random() * 255);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.floor(GRAIN_INTENSITY * 255);
    }
    // Clear and draw at half size, then the main draw scales up
    _grainCtx.putImageData(imgData, 0, 0);
  }

  function _filmGrain(ctx, w, h) {
    if (!_grainCanvas) _generateGrain(w, h);
    ctx.globalAlpha = GRAIN_INTENSITY;
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(_grainCanvas, 0, 0, Math.floor(w / 2), Math.floor(h / 2), 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ── Dither (Bayer ordered) ─────────────────────────────────────
  // 4x4 Bayer matrix for ordered dithering look
  var BAYER_4x4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  ];
  var DITHER_STRENGTH = 0.12;  // How much to shift brightness

  function _dither(ctx, w, h) {
    // Lightweight: just darken pixels in the Bayer pattern
    ctx.fillStyle = 'rgba(0,0,0,' + DITHER_STRENGTH.toFixed(3) + ')';
    for (var by = 0; by < h; by += 4) {
      for (var bx = 0; bx < w; bx += 4) {
        for (var dy = 0; dy < 4 && by + dy < h; dy++) {
          for (var dx = 0; dx < 4 && bx + dx < w; dx++) {
            if (BAYER_4x4[dy * 4 + dx] < 5) {
              ctx.fillRect(bx + dx, by + dy, 1, 1);
            }
          }
        }
      }
    }
  }

  // ── Effect Registry ────────────────────────────────────────────

  var EFFECT_MAP = {
    scanlines:   _scanlines,
    chromatic:   _chromaticAberration,
    vignette:    _vignette,
    colorgrade:  _colorGrade,
    grain:       _filmGrain,
    dither:      _dither
  };

  // ── Preset Profiles ────────────────────────────────────────────

  var PROFILES = {
    /** Default: subtle scanlines + vignette. Cheap. */
    default: ['vignette', 'scanlines'],

    /** Dungeon: heavy vignette + grain + scanlines. Oppressive. */
    dungeon: ['vignette', 'grain', 'scanlines'],

    /** Exterior: color grade + light vignette. Warm/atmospheric. */
    exterior: ['colorgrade', 'vignette'],

    /** CRT: scanlines + chromatic aberration. Retro terminal feel. */
    crt: ['scanlines', 'chromatic', 'vignette'],

    /** Clean: vignette only. Minimal performance hit. */
    minimal: ['vignette'],

    /** Off: no post-processing. */
    none: []
  };

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Set the active effect pipeline.
   * @param {string|Array} profile - Profile name or array of effect names
   */
  function setProfile(profile) {
    if (typeof profile === 'string') {
      _effects = (PROFILES[profile] || PROFILES['default']).slice();
    } else if (Array.isArray(profile)) {
      _effects = profile.slice();
    }
  }

  /**
   * Set the color grade tint.
   * @param {Object} tint - { r, g, b, a } where a is opacity (0.02–0.15)
   */
  function setColorGrade(tint) {
    _gradeTint = tint;
  }

  /**
   * Set the per-frame budget in milliseconds.
   * If post-processing takes longer, effects auto-skip frames.
   */
  function setBudget(ms) {
    _budget = ms;
  }

  /** Enable/disable post-processing globally */
  function setEnabled(on) { _enabled = on; }
  function isEnabled() { return _enabled; }

  /**
   * Apply post-processing to the canvas.
   * Call AFTER all world rendering, BEFORE letterbox/HUD.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @param {number} dt - Frame delta ms (for grain refresh)
   */
  function apply(ctx, w, h, dt) {
    if (!_enabled || _effects.length === 0) return;

    // Adaptive frame skipping
    if (_skipFrames > 0) {
      _skipFrames--;
      return;
    }

    var t0 = performance.now();

    // Refresh grain texture periodically
    _grainTimer += (dt || 16);
    if (_grainTimer >= GRAIN_REFRESH) {
      _grainTimer = 0;
      _generateGrain(w, h);
    }

    // Run pipeline
    for (var i = 0; i < _effects.length; i++) {
      var fn = EFFECT_MAP[_effects[i]];
      if (fn) fn(ctx, w, h);
    }

    _lastFrameMs = performance.now() - t0;
    _frameCount++;

    // Budget enforcement: if over budget, skip next 2 frames
    if (_lastFrameMs > _budget) {
      _skipFrames = 2;
    }
  }

  /** Get last frame processing time in ms */
  function getLastFrameMs() { return _lastFrameMs; }

  // Default profile
  _effects = PROFILES['default'].slice();

  return Object.freeze({
    setProfile:     setProfile,
    setColorGrade:  setColorGrade,
    setBudget:      setBudget,
    setEnabled:     setEnabled,
    isEnabled:      isEnabled,
    apply:          apply,
    getLastFrameMs: getLastFrameMs,
    PROFILES:       PROFILES
  });
})();

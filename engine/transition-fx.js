/**
 * TransitionFX — canvas-rendered visual transition overlay.
 *
 * Draws vignette darkening, color fades, and transition labels on top
 * of the raycaster viewport. Replaces HUD.showFloorTransition() with
 * smooth, depth-specific visual treatments.
 *
 * Renders directly on the game canvas (composited after world render
 * but before HUD DOM). No separate canvas element needed.
 *
 * Layer 2 (after HUD, before MenuBox)
 * Depends on: i18n (optional, for label lookup)
 */
var TransitionFX = (function () {
  'use strict';

  // ── Presets ─────────────────────────────────────────────────────
  var PRESETS = {
    enter_building: {
      fadeColor: { r: 40, g: 30, b: 15 },
      duration: 900,
      phases: [
        { t: 0.00, vignette: 0.0, fade: 0.0 },
        { t: 0.30, vignette: 0.6, fade: 0.2 },
        { t: 0.50, vignette: 1.0, fade: 1.0 },
        { t: 0.70, vignette: 0.8, fade: 0.6 },
        { t: 1.00, vignette: 0.0, fade: 0.0 }
      ]
    },
    descend: {
      fadeColor: { r: 0, g: 0, b: 0 },
      duration: 1000,
      phases: [
        { t: 0.00, vignette: 0.0, fade: 0.0 },
        { t: 0.20, vignette: 0.3, fade: 0.0 },
        { t: 0.40, vignette: 0.8, fade: 0.5 },
        { t: 0.50, vignette: 1.0, fade: 1.0 },
        { t: 0.80, vignette: 0.6, fade: 0.4 },
        { t: 1.00, vignette: 0.0, fade: 0.0 }
      ]
    },
    ascend: {
      fadeColor: { r: 60, g: 55, b: 50 },
      duration: 900,
      phases: [
        { t: 0.00, vignette: 0.0, fade: 0.0 },
        { t: 0.30, vignette: 0.4, fade: 0.3 },
        { t: 0.50, vignette: 0.2, fade: 1.0 },
        { t: 0.70, vignette: 0.1, fade: 0.5 },
        { t: 1.00, vignette: 0.0, fade: 0.0 }
      ]
    },
    walk_through: {
      fadeColor: { r: 0, g: 0, b: 0 },
      duration: 600,
      phases: [
        { t: 0.00, vignette: 0.0, fade: 0.0 },
        { t: 0.40, vignette: 0.3, fade: 0.8 },
        { t: 0.50, vignette: 0.3, fade: 1.0 },
        { t: 0.60, vignette: 0.2, fade: 0.6 },
        { t: 1.00, vignette: 0.0, fade: 0.0 }
      ]
    }
  };

  // ── State ───────────────────────────────────────────────────────
  var _active    = false;
  var _elapsed   = 0;       // ms into transition
  var _duration  = 0;       // total ms
  var _preset    = null;    // current preset object
  var _label     = '';      // transition label text
  var _onMidpoint = null;   // callback at peak darkness (once)
  var _onComplete = null;   // callback when done
  var _midpointFired = false;

  // Current interpolated values
  var _vignette = 0;        // 0–1
  var _fade     = 0;        // 0–1
  var _fadeR = 0, _fadeG = 0, _fadeB = 0;

  // ── Begin a transition ──────────────────────────────────────────

  /**
   * Start a visual transition.
   *
   * @param {Object} opts
   * @param {string}   opts.type        - Preset name: 'enter_building','descend','ascend','walk_through'
   * @param {number}   [opts.duration]  - Override preset duration (ms)
   * @param {string}   [opts.label]     - Text to display at peak darkness
   * @param {Function} [opts.onMidpoint] - Called once when fade reaches 1.0
   * @param {Function} [opts.onComplete] - Called when transition finishes
   */
  function begin(opts) {
    opts = opts || {};
    _preset = PRESETS[opts.type] || PRESETS.walk_through;
    _duration = opts.duration || _preset.duration || 800;
    _label = opts.label || '';
    _onMidpoint = opts.onMidpoint || null;
    _onComplete = opts.onComplete || null;
    _midpointFired = false;
    _elapsed = 0;
    _active = true;

    _fadeR = _preset.fadeColor.r;
    _fadeG = _preset.fadeColor.g;
    _fadeB = _preset.fadeColor.b;
  }

  /**
   * Resolve which preset to use based on floor depth pair.
   *
   * @param {string} srcId  - Source floor ID ("1", "1.1", "1.1.1")
   * @param {string} tgtId  - Target floor ID
   * @param {string} direction - 'advance' or 'retreat'
   * @returns {string} Preset name
   */
  function resolvePreset(srcId, tgtId, direction) {
    var srcDepth = srcId.split('.').length;
    var tgtDepth = tgtId.split('.').length;

    if (srcDepth === 1 && tgtDepth === 2) return 'enter_building';
    if (srcDepth === 2 && tgtDepth === 1) return 'ascend';       // Exit building → daylight
    if (srcDepth === 2 && tgtDepth === 3) return 'descend';
    if (srcDepth === 3 && tgtDepth === 2) return 'ascend';
    if (srcDepth === tgtDepth)            return 'walk_through';

    return direction === 'advance' ? 'descend' : 'ascend';
  }

  // ── Manual control ──────────────────────────────────────────────

  function setVignette(intensity) { _vignette = intensity; }
  function setFade(opacity) { _fade = opacity; }

  function clear() {
    _active = false;
    _vignette = 0;
    _fade = 0;
    _elapsed = 0;
  }

  function isActive() { return _active || _vignette > 0 || _fade > 0; }

  // ── Update ──────────────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;

    _elapsed += dt;
    var t = Math.min(1, _elapsed / _duration);

    // Interpolate current vignette and fade from preset phases
    var phases = _preset.phases;
    _vignette = _lerp(phases, t, 'vignette');
    _fade     = _lerp(phases, t, 'fade');

    // Fire midpoint callback once when fade hits 1.0
    if (!_midpointFired && _fade >= 0.99 && _onMidpoint) {
      _midpointFired = true;
      try { _onMidpoint(); } catch (e) {
        console.error('[TransitionFX] onMidpoint error:', e);
      }
    }

    // Transition complete
    if (t >= 1) {
      _active = false;
      _vignette = 0;
      _fade = 0;
      if (_onComplete) {
        try { _onComplete(); } catch (e) {
          console.error('[TransitionFX] onComplete error:', e);
        }
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  /**
   * Render transition effects on the canvas.
   * Call from Game._render() after world rendering.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  function render(ctx, w, h) {
    if (_vignette <= 0 && _fade <= 0) return;

    ctx.save();

    // ── Vignette (radial gradient from transparent center to dark edges) ──
    if (_vignette > 0.01) {
      var cx = w / 2;
      var cy = h / 2;
      var outerR = Math.sqrt(cx * cx + cy * cy);
      var innerR = outerR * (1 - _vignette * 0.7);  // Inner radius shrinks with intensity

      var grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,' + Math.min(1, _vignette) + ')');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Color fade (full canvas fill) ──
    if (_fade > 0.01) {
      ctx.fillStyle = 'rgba(' + _fadeR + ',' + _fadeG + ',' + _fadeB + ',' + _fade + ')';
      ctx.fillRect(0, 0, w, h);
    }

    // ── Label text (only visible during peak darkness) ──
    if (_label && _fade > 0.8) {
      var labelAlpha = (_fade - 0.8) / 0.2; // Fade in label from 0.8→1.0
      ctx.globalAlpha = labelAlpha;
      ctx.fillStyle = '#c0b898';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(_label, w / 2, h / 2);
    }

    ctx.restore();
  }

  // ── Interpolation helper ────────────────────────────────────────

  /**
   * Linearly interpolate a property across preset phase keyframes.
   */
  function _lerp(phases, t, prop) {
    if (t <= phases[0].t) return phases[0][prop];
    if (t >= phases[phases.length - 1].t) return phases[phases.length - 1][prop];

    for (var i = 0; i < phases.length - 1; i++) {
      var a = phases[i];
      var b = phases[i + 1];
      if (t >= a.t && t <= b.t) {
        var localT = (t - a.t) / (b.t - a.t);
        return a[prop] + (b[prop] - a[prop]) * localT;
      }
    }
    return 0;
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    begin: begin,
    resolvePreset: resolvePreset,
    setVignette: setVignette,
    setFade: setFade,
    clear: clear,
    isActive: isActive,
    update: update,
    render: render,
    PRESETS: PRESETS
  };
})();

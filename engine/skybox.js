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

  // ── Color interpolation ─────────────────────────────────────────

  function _lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    };
  }

  /**
   * Resolve current zenith/horizon colors for a preset, interpolating
   * between the current DayCycle phase and the next phase.
   * Falls back to flat zenith/horizon if the preset has no phase table
   * (e.g. ocean, title — time-independent presets).
   */
  function _getPhaseColors(preset) {
    if (!preset.phases) return { zenith: preset.zenith, horizon: preset.horizon };
    if (typeof DayCycle === 'undefined') {
      return { zenith: preset.phases.morning.zenith, horizon: preset.phases.morning.horizon };
    }
    var phase    = DayCycle.getPhase();
    var next     = DayCycle.getNextPhase();
    var progress = DayCycle.getPhaseProgress();
    var a = preset.phases[phase]  || preset.phases.morning;
    var b = preset.phases[next]   || a;
    return {
      zenith:  _lerpColor(a.zenith, b.zenith, progress),
      horizon: _lerpColor(a.horizon, b.horizon, progress)
    };
  }

  /**
   * Compute star visibility alpha for the current phase.
   * Stars fade in during dusk and fade out during dawn.
   * All exterior presets show stars at night.
   */
  function _getStarAlpha() {
    if (typeof DayCycle === 'undefined') return 0;
    var phase    = DayCycle.getPhase();
    var progress = DayCycle.getPhaseProgress();
    if (phase === 'night')     return 1;
    if (phase === 'dusk')      return progress;
    if (phase === 'dawn')      return 1 - progress;
    return 0;
  }

  // ── Presets ─────────────────────────────────────────────────────
  //
  // Each exterior preset has a `phases` object with per-phase
  // zenith/horizon colors. The flat zenith/horizon kept as fallback
  // for non-phase-aware presets (ocean, title).

  var PRESETS = {
    cedar: {
      zenith:  { r: 42, g: 58, b: 90 },
      horizon: { r: 90, g: 104, b: 120 },
      phases: {
        dawn:      { zenith: { r: 60, g: 45, b: 70 },  horizon: { r: 180, g: 120, b: 80 } },
        morning:   { zenith: { r: 42, g: 58, b: 90 },  horizon: { r: 90, g: 104, b: 120 } },
        afternoon: { zenith: { r: 50, g: 65, b: 100 }, horizon: { r: 110, g: 95, b: 75 } },
        dusk:      { zenith: { r: 35, g: 25, b: 55 },  horizon: { r: 140, g: 70, b: 40 } },
        night:     { zenith: { r: 8, g: 12, b: 25 },   horizon: { r: 15, g: 20, b: 35 } }
      },
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
      phases: {
        dawn:      { zenith: { r: 55, g: 35, b: 40 },  horizon: { r: 170, g: 100, b: 60 } },
        morning:   { zenith: { r: 42, g: 26, b: 24 },  horizon: { r: 90, g: 58, b: 32 } },
        afternoon: { zenith: { r: 50, g: 35, b: 30 },  horizon: { r: 100, g: 65, b: 38 } },
        dusk:      { zenith: { r: 30, g: 18, b: 20 },  horizon: { r: 130, g: 55, b: 25 } },
        night:     { zenith: { r: 6, g: 8, b: 14 },    horizon: { r: 14, g: 16, b: 22 } }
      },
      clouds: [],
      mountains: null,
      water: false,
      stars: false
    },
    harbor: {
      zenith:  { r: 10, g: 24, b: 48 },
      horizon: { r: 26, g: 40, b: 64 },
      phases: {
        dawn:      { zenith: { r: 40, g: 35, b: 60 },  horizon: { r: 150, g: 90, b: 70 } },
        morning:   { zenith: { r: 25, g: 45, b: 80 },  horizon: { r: 60, g: 80, b: 100 } },
        afternoon: { zenith: { r: 30, g: 50, b: 85 },  horizon: { r: 70, g: 85, b: 95 } },
        dusk:      { zenith: { r: 20, g: 18, b: 45 },  horizon: { r: 120, g: 55, b: 35 } },
        night:     { zenith: { r: 5, g: 10, b: 24 },   horizon: { r: 12, g: 20, b: 35 } }
      },
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
      phases: {
        dawn:      { zenith: { r: 50, g: 35, b: 55 },  horizon: { r: 140, g: 85, b: 75 } },
        morning:   { zenith: { r: 35, g: 30, b: 55 },  horizon: { r: 60, g: 50, b: 75 } },
        afternoon: { zenith: { r: 40, g: 35, b: 60 },  horizon: { r: 65, g: 55, b: 70 } },
        dusk:      { zenith: { r: 25, g: 15, b: 35 },  horizon: { r: 100, g: 45, b: 40 } },
        night:     { zenith: { r: 6, g: 6, b: 14 },    horizon: { r: 12, g: 10, b: 22 } }
      },
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
      phases: {
        dawn:      { zenith: { r: 45, g: 35, b: 55 },  horizon: { r: 160, g: 100, b: 60 } },
        morning:   { zenith: { r: 20, g: 40, b: 65 },  horizon: { r: 80, g: 70, b: 50 } },
        afternoon: { zenith: { r: 25, g: 45, b: 70 },  horizon: { r: 90, g: 75, b: 55 } },
        dusk:      { zenith: { r: 20, g: 15, b: 35 },  horizon: { r: 120, g: 50, b: 30 } },
        night:     { zenith: { r: 4, g: 8, b: 16 },    horizon: { r: 10, g: 14, b: 22 } }
      },
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
      phases: {
        dawn:      { zenith: { r: 35, g: 30, b: 50 },  horizon: { r: 130, g: 80, b: 60 } },
        morning:   { zenith: { r: 20, g: 35, b: 60 },  horizon: { r: 50, g: 60, b: 75 } },
        afternoon: { zenith: { r: 22, g: 38, b: 65 },  horizon: { r: 55, g: 65, b: 78 } },
        dusk:      { zenith: { r: 12, g: 10, b: 30 },  horizon: { r: 90, g: 40, b: 30 } },
        night:     { zenith: { r: 3, g: 5, b: 12 },    horizon: { r: 8, g: 12, b: 20 } }
      },
      clouds: [],
      mountains: null,
      water: false,
      stars: true
    },
    // Deep ocean view — rendered inside sealab porthole windows.
    // "Clouds" are ghostly sea creature silhouettes; "mountains" are
    // the seabed ridge. Light comes from above (caustic flicker).
    ocean: {
      zenith:  { r: 2, g: 8, b: 18 },    // Deep abyss above
      horizon: { r: 8, g: 28, b: 48 },    // Mid-water column
      clouds: [
        // Whale silhouettes — large, slow, sparse (high threshold = few shapes)
        { y: 0.35, h: 0.22, depth: 0.5, speed: 0.00008, scale: 150, threshold: 0.55, opacity: 0.25, r: 20, g: 40, b: 60, seed: 700 },
        // Jellyfish band — smaller, numerous, faster drift
        { y: 0.55, h: 0.16, depth: 0.35, speed: 0.00018, scale: 40, threshold: 0.48, opacity: 0.2, r: 60, g: 80, b: 120, seed: 750 },
        // Jellyfish tentacle trails — thin, low opacity, below main band
        { y: 0.65, h: 0.10, depth: 0.35, speed: 0.00018, scale: 40, threshold: 0.58, opacity: 0.12, r: 40, g: 55, b: 90, seed: 755 },
        // Caustic light ripples — fast, subtle, near top
        { y: 0.10, h: 0.30, depth: 0.15, speed: 0.0006, scale: 25, threshold: 0.52, opacity: 0.15, r: 80, g: 140, b: 160, seed: 780 }
      ],
      // Seabed ridge at horizon — organic, low, dark
      mountains: { depth: 0.9, scale: 80, maxHeight: 0.15, color: 'rgba(4,10,20,0.95)', seed: 800 },
      water: false,
      stars: false
    },
    title: {
      zenith:  { r: 10, g: 21, b: 48 },
      horizon: { r: 90, g: 64, b: 48 },
      clouds: [
        { y: 0.10, h: 0.12, depth: 0.2, speed: 0.00008, scale: 100, threshold: 0.40, opacity: 0.4, r: 200, g: 180, b: 160, seed: 100 },
        { y: 0.25, h: 0.15, depth: 0.35, speed: 0.00012, scale: 70, threshold: 0.38, opacity: 0.35, r: 170, g: 150, b: 140, seed: 110 },
        { y: 0.45, h: 0.10, depth: 0.5, speed: 0.00016, scale: 50, threshold: 0.42, opacity: 0.3, r: 140, g: 120, b: 110, seed: 120 }
      ],
      mountains: { depth: 0.9, scale: 100, maxHeight: 0.22, color: 'rgba(20,24,30,0.95)', seed: 600, shaped: true },
      water: false,
      oceanFloor: true,   // Bottom half: ocean floor view (looking down through glass)
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

    // ── Phase-interpolated sky gradient ──
    var colors = _getPhaseColors(preset);
    _renderGradient(ctx, w, 0, h, colors.zenith, colors.horizon);

    // ── Stars — phase-aware alpha (all exterior presets at night) ──
    var starAlpha = _getStarAlpha();
    if (preset.phases && starAlpha > 0.01) {
      _renderStars(ctx, w, h, angle, starAlpha);
    } else if (preset.stars) {
      // Legacy: non-phase presets (ocean) use static stars
      _renderStars(ctx, w, h, angle, 1);
    }

    // ── Shooting star (night only, after stars) ──
    if (preset.phases) {
      _renderShootingStar(ctx, w, h);
    }

    // ── Celestial bodies (sun/moon) — after stars, before clouds ──
    if (preset.phases) {
      _renderCelestials(ctx, w, h, angle);
    }

    // ── Cloud bands — tinted by atmosphere ──
    var tint = (preset.phases && typeof DayCycle !== 'undefined')
             ? DayCycle.getAtmosphereTint() : null;
    for (var i = 0; i < preset.clouds.length; i++) {
      _renderCloudBand(ctx, w, h, angle, preset.clouds[i], tint);
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

    // ── Sky (top half) ── (slow drift — stately panorama)
    render(ctx, w, halfH, time * 0.00008, presetName, 0);

    // ── Bottom half ──
    if (preset.oceanFloor) {
      // Ocean floor porthole view — looking down through glass into the deep
      _renderOceanFloor(ctx, w, h, halfH, time);
    } else if (preset.water) {
      // Water reflection (mirrored sky)
      _renderWaterReflection(ctx, w, h, halfH, time, preset);
    } else {
      // Plain floor gradient fallback
      _renderGradient(ctx, w, halfH, h - halfH, preset.horizon, { r: 10, g: 10, b: 10 });
    }
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

  // Star color palette: 70% white/blue-white, 15% yellow, 10% orange, 5% blue
  var _STAR_COLORS = [
    '255,255,255',   // white
    '220,230,255',   // blue-white
    '240,240,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '255,255,255',   // white
    '220,230,255',   // blue-white
    '255,255,255',   // white
    '255,240,200',   // pale yellow
    '255,240,200',   // pale yellow
    '255,200,140',   // orange
    '255,200,140',   // orange
    '160,190,255',   // blue
    '255,255,255',   // white
    '255,255,255'    // white
  ];

  // Multi-layer star definitions: { count, minSize, maxSize, minBright, maxBright, depth, twinkleSpeed }
  var _STAR_LAYERS = [
    { count: 200, minSize: 1, maxSize: 1, minBright: 0.3, maxBright: 0.5, depth: 0.02, twinkleSpeed: 0.001, seed: 0 },     // deep field
    { count: 80,  minSize: 1, maxSize: 2, minBright: 0.5, maxBright: 0.7, depth: 0.08, twinkleSpeed: 0.003, seed: 1000 },   // mid field
    { count: 30,  minSize: 2, maxSize: 3, minBright: 0.7, maxBright: 1.0, depth: 0.15, twinkleSpeed: 0.006, seed: 2000 }    // near field
  ];

  function _renderStars(ctx, w, h, angle, phaseAlpha) {
    var pa = phaseAlpha !== undefined ? phaseAlpha : 1;
    if (pa < 0.01) return;

    for (var L = 0; L < _STAR_LAYERS.length; L++) {
      var layer = _STAR_LAYERS[L];
      var parallax = angle * w * layer.depth;

      for (var i = 0; i < layer.count; i++) {
        var idx = i + layer.seed;
        var sx = (_hash1D(idx * 7 + 1) * w * 4 + parallax) % w;
        if (sx < 0) sx += w;
        var sy = _hash1D(idx * 13 + 3) * h * 0.75;
        var brightness = layer.minBright + _hash1D(idx * 19 + 5) * (layer.maxBright - layer.minBright);

        // Twinkle
        var twinkle = 0.5 + 0.5 * Math.sin(_time * layer.twinkleSpeed + idx * 2.1);
        var alpha = brightness * twinkle * pa;

        if (alpha > 0.04) {
          // Color from palette (deterministic per star)
          var colorIdx = Math.floor(_hash1D(idx * 31) * _STAR_COLORS.length) % _STAR_COLORS.length;
          ctx.fillStyle = 'rgba(' + _STAR_COLORS[colorIdx] + ',' + alpha.toFixed(2) + ')';

          var size = layer.minSize + Math.floor(_hash1D(idx * 41) * (layer.maxSize - layer.minSize + 1));
          ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);
        }
      }
    }
  }

  // ── Shooting stars ──────────────────────────────────────────────

  /**
   * Periodic shooting star streak during night phases.
   * ~30s interval, 0.5s duration, deterministic timing from _time.
   */
  function _renderShootingStar(ctx, w, h) {
    if (typeof DayCycle === 'undefined') return;
    if (DayCycle.getPhase() !== 'night') return;

    // Fire every ~30 seconds of animation time
    var cycle = 30000;
    var phase = _time % cycle;
    var duration = 500;
    if (phase > duration) return;

    var t = phase / duration;  // 0→1 over the streak

    // Deterministic start/end from the cycle number
    var seed = Math.floor(_time / cycle);
    var x0 = _hash1D(seed * 37) * w * 0.6 + w * 0.2;
    var y0 = _hash1D(seed * 41 + 7) * h * 0.3;
    var dx = (_hash1D(seed * 53 + 13) - 0.3) * w * 0.35;
    var dy = _hash1D(seed * 59 + 19) * h * 0.25 + h * 0.05;

    var headX = x0 + dx * t;
    var headY = y0 + dy * t;
    var tailLen = 0.3;
    var tailX = x0 + dx * Math.max(0, t - tailLen);
    var tailY = y0 + dy * Math.max(0, t - tailLen);

    // Fade in and out
    var alpha = t < 0.15 ? (t / 0.15) : (t > 0.7 ? (1 - t) / 0.3 : 1);
    alpha *= 0.7;

    ctx.strokeStyle = 'rgba(255,255,240,' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // ── Celestial bodies (sun + moon) ────────────────────────────────

  /**
   * Render sun and moon discs along sinusoidal arcs driven by DayCycle.
   * Sun: visible 06:00–18:00. Moon: visible 18:00–06:00.
   * Position is player-angle-relative so they track with rotation.
   */
  function _renderCelestials(ctx, w, h, angle) {
    if (typeof DayCycle === 'undefined') return;
    var hour = DayCycle.getHour() + DayCycle.getMinute() / 60;

    // ── Sun (06:00–18:00) ──
    if (hour >= 5.5 && hour <= 18.5) {
      var sunT = (hour - 6) / 12;                          // 0 at 06:00, 1 at 18:00
      var sunElev = Math.sin(Math.PI * Math.max(0, Math.min(1, sunT)));  // 0→1→0 arc
      var sunAz = sunT;                                     // east(0)→west(1)

      // Screen position (angle-relative, wrapping)
      var sunScreenX = ((sunAz - angle / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * w;
      var sunScreenY = h * (1 - sunElev * 0.85) - 10;      // near horizon at edges

      // Radius — larger near horizon (atmospheric lensing)
      var baseR = 14;
      var sunR = baseR + (1 - sunElev) * 6;

      // Horizon refraction: oval + redden when low
      var squish = sunElev < 0.15 ? (0.6 + sunElev / 0.15 * 0.4) : 1;
      var redden = sunElev < 0.15 ? (1 - sunElev / 0.15) : 0;

      // Glow halo
      var glowR = sunR * 3;
      var glowAlpha = 0.12 + redden * 0.08;
      var grad = ctx.createRadialGradient(sunScreenX, sunScreenY, sunR * 0.5, sunScreenX, sunScreenY, glowR);
      var glowRed = Math.round(255 - redden * 20);
      var glowGreen = Math.round(200 - redden * 60);
      var glowBlue = Math.round(120 - redden * 60);
      grad.addColorStop(0, 'rgba(' + glowRed + ',' + glowGreen + ',' + glowBlue + ',' + glowAlpha.toFixed(2) + ')');
      grad.addColorStop(1, 'rgba(' + glowRed + ',' + glowGreen + ',' + glowBlue + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sunScreenX - glowR, sunScreenY - glowR, glowR * 2, glowR * 2);

      // Sun disc (core white → edge orange gradient)
      ctx.save();
      ctx.translate(sunScreenX, sunScreenY);
      ctx.scale(1, squish);
      var discGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sunR);
      discGrad.addColorStop(0, 'rgba(255,255,240,0.95)');
      discGrad.addColorStop(0.4, 'rgba(255,230,180,0.9)');
      discGrad.addColorStop(0.8, 'rgba(255,' + Math.round(180 - redden * 60) + ',' + Math.round(100 - redden * 50) + ',0.8)');
      discGrad.addColorStop(1, 'rgba(255,' + Math.round(140 - redden * 60) + ',' + Math.round(60 - redden * 30) + ',0)');
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(0, 0, sunR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Horizon glow band (dawn/dusk) ──
      if (sunElev < 0.2 && sunElev > 0) {
        var glowIntensity = (0.2 - sunElev) / 0.2;
        var bandH = Math.floor(h * (hour < 12 ? 0.20 : 0.15));
        var bandY = h - bandH;
        var isDawn = hour < 12;
        var hGrad = ctx.createLinearGradient(0, bandY, 0, h);
        if (isDawn) {
          hGrad.addColorStop(0, 'rgba(255,160,100,0)');
          hGrad.addColorStop(0.5, 'rgba(255,140,80,' + (glowIntensity * 0.15).toFixed(3) + ')');
          hGrad.addColorStop(1, 'rgba(255,120,60,' + (glowIntensity * 0.2).toFixed(3) + ')');
        } else {
          hGrad.addColorStop(0, 'rgba(200,80,40,0)');
          hGrad.addColorStop(0.5, 'rgba(180,60,30,' + (glowIntensity * 0.18).toFixed(3) + ')');
          hGrad.addColorStop(1, 'rgba(160,40,20,' + (glowIntensity * 0.22).toFixed(3) + ')');
        }
        ctx.fillStyle = hGrad;
        ctx.fillRect(0, bandY, w, bandH);
      }
    }

    // ── Moon (18:00–06:00, offset 12h from sun) ──
    if (hour >= 17.5 || hour <= 6.5) {
      // Normalize to 0–12 range for the sinusoidal arc
      var moonHour = hour >= 17.5 ? (hour - 18) : (hour + 6);
      var moonT = moonHour / 12;                            // 0 at 18:00, 1 at 06:00
      var moonElev = Math.sin(Math.PI * Math.max(0, Math.min(1, moonT)));
      var moonAz = moonT;

      var moonScreenX = ((moonAz - angle / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * w;
      var moonScreenY = h * (1 - moonElev * 0.8) - 8;
      var moonR = 10 + (1 - moonElev) * 3;

      // Moon glow halo (subtle blue-white)
      var mGlowR = moonR * 2.5;
      var mGrad = ctx.createRadialGradient(moonScreenX, moonScreenY, moonR * 0.3, moonScreenX, moonScreenY, mGlowR);
      mGrad.addColorStop(0, 'rgba(180,200,240,0.08)');
      mGrad.addColorStop(1, 'rgba(140,160,200,0)');
      ctx.fillStyle = mGrad;
      ctx.fillRect(moonScreenX - mGlowR, moonScreenY - mGlowR, mGlowR * 2, mGlowR * 2);

      // Moon disc (blue-white core → pale edge)
      var moonDiscGrad = ctx.createRadialGradient(moonScreenX, moonScreenY, 0, moonScreenX, moonScreenY, moonR);
      moonDiscGrad.addColorStop(0, 'rgba(220,230,250,0.9)');
      moonDiscGrad.addColorStop(0.5, 'rgba(190,200,230,0.85)');
      moonDiscGrad.addColorStop(1, 'rgba(160,175,210,0)');
      ctx.fillStyle = moonDiscGrad;
      ctx.beginPath();
      ctx.arc(moonScreenX, moonScreenY, moonR, 0, Math.PI * 2);
      ctx.fill();

      // Craters (2–3 small dark circles at fixed offsets)
      ctx.fillStyle = 'rgba(130,140,170,0.25)';
      ctx.beginPath();
      ctx.arc(moonScreenX - moonR * 0.3, moonScreenY - moonR * 0.2, moonR * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonScreenX + moonR * 0.25, moonScreenY + moonR * 0.3, moonR * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonScreenX + moonR * 0.1, moonScreenY - moonR * 0.35, moonR * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Cloud band ──────────────────────────────────────────────────

  function _renderCloudBand(ctx, w, h, angle, params, tint) {
    var bandY = Math.floor(h * params.y);
    var bandH = Math.floor(h * params.h);
    var scrollX = (angle / (2 * Math.PI)) * w * 2 * params.depth + _time * params.speed;

    // Atmosphere-tinted cloud colors (dawn = pink/orange, night = dark blue)
    var cr = params.r, cg = params.g, cb = params.b;
    if (tint) {
      cr = Math.round(cr * tint.r);
      cg = Math.round(cg * tint.g);
      cb = Math.round(cb * tint.b);
    }

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
        ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (alpha * 0.6).toFixed(2) + ')';
        ctx.fillRect(x, Math.floor(cy - cloudH / 2), 1, cloudH);
      }
    }
  }

  // ── Mountain silhouette ─────────────────────────────────────────

  /**
   * Zone-based mountain shapes. When params.shaped is true, the strip
   * alternates: industrial → forest → industrial across world-X,
   * each zone ~2.5 scale-widths. Industrial: angular flat-tops,
   * chimneys, crane-like spikes. Forest: organic peaks, undulating
   * canopy. The zone blend is smooth so there's no hard seam.
   */

  /** Industrial shape modifier — quantizes noise into flat-top steps + spikes. */
  function _industrialShape(base, worldX, seed) {
    // Flat-top plateaus via step quantization
    var step = Math.floor(base * 5) / 5;
    // Chimney spikes — thin tall features
    var spike = _noise1D(worldX * 8 + seed + 300);
    if (spike > 0.78) step += (spike - 0.78) * 3.0;
    // Crane arm — occasional horizontal jut
    var crane = _noise1D(worldX * 12 + seed + 400);
    if (crane > 0.85) step += 0.08;
    return step;
  }

  /** Forest shape modifier — organic peaks with pine-tree spikes. */
  function _forestShape(base, worldX, seed) {
    // Smooth rolling hills
    var hill = base * 0.7;
    // Pine tree canopy — high-frequency triangle wave peaks
    var pine = _noise1D(worldX * 6 + seed + 500);
    var pineSharp = Math.abs((pine * 2 - 1)); // triangle wave 0–1
    hill += pineSharp * 0.35 * base;
    // Gentle undulation
    hill += Math.sin(worldX * 0.4 + seed) * 0.06;
    return hill;
  }

  function _renderMountains(ctx, w, h, angle, params) {
    var scrollX = (angle / (2 * Math.PI)) * w * 2 * params.depth;
    ctx.fillStyle = params.color;
    ctx.beginPath();
    ctx.moveTo(0, h);

    // Zone period in world-X units (how wide each zone is)
    var zonePeriod = 2.5;

    for (var x = 0; x <= w; x++) {
      var worldX = (x + scrollX) / params.scale;

      // Base elevation from layered noise
      var base = _noise1D(worldX + params.seed) * 0.7
               + _noise1D(worldX * 3 + params.seed + 50) * 0.3;

      var mh;

      if (params.shaped) {
        // Determine zone: repeating industrial(0)–forest(1)–industrial(2)
        // Zone modulator: sin wave gives smooth 0→1→0 blend
        var zoneT = (Math.sin(worldX / zonePeriod * Math.PI) + 1) * 0.5; // 0=industrial, 1=forest

        var indust = _industrialShape(base, worldX, params.seed);
        var forest = _forestShape(base, worldX, params.seed);

        // Smooth blend between zones
        mh = (indust * (1 - zoneT) + forest * zoneT) * params.maxHeight * h;
      } else {
        // Original pure-noise mountains for non-shaped presets
        mh = base * params.maxHeight * h;
      }

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

  // ── Ocean floor view (looking down through glass into the deep) ─

  function _renderOceanFloor(ctx, w, h, horizonY, time) {
    var floorH = h - horizonY;
    var ocean = PRESETS.ocean;

    // Base: dark abyss gradient (horizon → deep)
    _renderGradient(ctx, w, horizonY, floorH, ocean.horizon, ocean.zenith);

    // Glass floor divider line — a bright caustic shimmer at the horizon
    var shimmer = 0.3 + 0.15 * Math.sin(time * 0.003);
    ctx.fillStyle = 'rgba(80,160,200,' + shimmer.toFixed(2) + ')';
    ctx.fillRect(0, horizonY, w, 2);

    // Porthole frame lines (riveted steel border around the glass floor)
    ctx.fillStyle = 'rgba(50,55,65,0.8)';
    ctx.fillRect(0, horizonY + 2, w, 3);
    ctx.fillRect(0, h - 5, w, 5);
    // Rivet dots along the frame
    for (var rx = 12; rx < w; rx += 24) {
      ctx.fillStyle = 'rgba(80,85,95,0.7)';
      ctx.fillRect(rx, horizonY + 3, 3, 2);
      ctx.fillRect(rx, h - 4, 3, 2);
    }

    // Ocean creature silhouettes rendered as cloud bands (ocean preset)
    // Shift Y coordinates to render into the bottom half
    var oceanAngle = time * 0.00004;  // Very slow ocean current drift
    for (var i = 0; i < ocean.clouds.length; i++) {
      var band = ocean.clouds[i];
      // Remap band Y into the floor region (horizonY to h)
      var bandY = Math.floor(horizonY + floorH * band.y);
      var bandH = Math.floor(floorH * band.h);
      var scrollX = (oceanAngle / (2 * Math.PI)) * w * 2 * band.depth + _time * band.speed;

      for (var x = 0; x < w; x++) {
        var worldX = (x + scrollX) / band.scale;
        var n1 = _noise1D(worldX * 0.3 + band.seed) * 0.6;
        var n2 = _noise1D(worldX * 1.2 + band.seed + 100) * 0.3;
        var n3 = _noise1D(worldX * 3.0 + band.seed + 200) * 0.1;
        var density = n1 + n2 + n3;

        if (density > band.threshold) {
          var alpha = (density - band.threshold) / (1 - band.threshold);
          alpha *= band.opacity;
          var cy = bandY + bandH * 0.5;
          var cloudH = Math.floor(bandH * alpha * 0.8);
          ctx.fillStyle = 'rgba(' + band.r + ',' + band.g + ',' + band.b + ',' + (alpha * 0.6).toFixed(2) + ')';
          ctx.fillRect(x, Math.floor(cy - cloudH / 2), 1, cloudH);
        }
      }
    }

    // Seabed ridge at bottom
    if (ocean.mountains) {
      var mParams = ocean.mountains;
      var seabedScrollX = (oceanAngle / (2 * Math.PI)) * w * 2 * mParams.depth;
      ctx.fillStyle = mParams.color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (var mx = 0; mx <= w; mx++) {
        var mWorldX = (mx + seabedScrollX) / mParams.scale;
        var mBase = _noise1D(mWorldX + mParams.seed) * 0.7 +
                    _noise1D(mWorldX * 3 + mParams.seed + 50) * 0.3;
        var mh = mBase * mParams.maxHeight * floorH;
        ctx.lineTo(mx, h - mh);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // Caustic light overlay (bright ripple pattern from above)
    for (var cy2 = horizonY + 6; cy2 < horizonY + floorH * 0.5; cy2 += 2) {
      var causticX = Math.sin(cy2 * 0.08 + time * 0.0015) * 30;
      var causticW = 20 + Math.sin(cy2 * 0.05 + time * 0.001) * 15;
      var causticA = 0.04 * (1 - (cy2 - horizonY) / (floorH * 0.5));
      if (causticA > 0.005) {
        ctx.fillStyle = 'rgba(100,180,200,' + causticA.toFixed(3) + ')';
        ctx.fillRect(Math.floor(w * 0.3 + causticX), cy2, Math.floor(causticW), 2);
        ctx.fillRect(Math.floor(w * 0.6 - causticX * 0.7), cy2, Math.floor(causticW * 0.7), 2);
      }
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

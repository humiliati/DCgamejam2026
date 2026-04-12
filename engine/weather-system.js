/**
 * WeatherSystem — Per-floor atmospheric overlay engine.
 *
 * Replaces the legacy terminus fog veil with a configurable weather
 * preset system. Each preset defines:
 *   - A veil (horizon gradient band, inheriting from terminusFog)
 *   - Parallax sprite layers (rolling debris, wind streaks, rain)
 *   - A terminusDist that controls where sprites punch through
 *   - Optional above-HUD overlay layers for immersive weather
 *
 * The raycaster calls renderBelow() between the distant and near
 * sprite passes (the "weather sandwich"). Game calls renderAbove()
 * after HUD rendering for above-HUD layers. FloorManager calls
 * setPreset() on floor change.
 *
 * Layer: 1.5 (after SpatialContract, before Raycaster)
 * Dependencies: SpatialContract (reads contract fog settings)
 *
 * @module WeatherSystem
 */
var WeatherSystem = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // ── Constants ──
  // ═══════════════════════════════════════════════════════════════

  var MAX_PARTICLES = 300;
  var CROSSFADE_MS  = 500;   // Preset transition duration

  // ═══════════════════════════════════════════════════════════════
  // ── State ──
  // ═══════════════════════════════════════════════════════════════

  var _presets       = {};     // name → preset config
  var _active        = null;   // current preset config (resolved)
  var _activeName    = 'clear';
  var _contract      = null;   // current SpatialContract

  // Particle pool — flat array, no per-frame allocation
  var _particles     = [];

  // Crossfade transition state
  var _fading        = false;
  var _fadeTimer     = 0;
  var _fadeDuration  = CROSSFADE_MS;
  var _fadeFromVeil  = 0;      // veil opacity snapshot at transition start
  var _fadeToVeil    = 0;      // target veil opacity
  var _fadeFromTD    = 2.0;    // terminusDist snapshot
  var _fadeToTD      = 2.0;    // target terminusDist

  // Interpolated runtime values (updated each tick)
  var _veilOpacity   = 0;
  var _terminusDist  = 2.0;

  // Time accumulator for particle spawning
  var _spawnAccum    = [];     // per-layer spawn debt (fractional particles)

  // Veil pulse phase (radians, continuous)
  var _pulsePhase    = 0;

  // ═══════════════════════════════════════════════════════════════
  // ── Preset registry ──
  // ═══════════════════════════════════════════════════════════════

  /**
   * Default preset template. Every registered preset is merged
   * against this so callers can omit unchanged fields.
   */
  var _DEFAULT_PRESET = Object.freeze({
    terminusDist: null,    // null = use contract.terminusDist
    veil: Object.freeze({
      enabled:    true,
      height:     0.15,
      opacity:    0.7,
      color:      null,    // null = inherit contract fogColor
      pulse:      0,       // sine amplitude on opacity
      pulseSpeed: 1.5      // radians per second
    }),
    layers: Object.freeze([]),
    overlay: Object.freeze({
      enabled:   false,
      type:      'none',   // 'vignette', 'tint', 'none'
      color:     'rgba(0,0,0,0)',
      intensity: 0,
      aboveHUD:  false
    })
  });

  /**
   * Register a named weather preset.
   * @param {string} name
   * @param {Object} cfg — partial preset (merged with defaults)
   */
  function register(name, cfg) {
    _presets[name] = _mergePreset(_DEFAULT_PRESET, cfg || {});
  }

  // ── Built-in presets ──

  function _registerDefaults() {
    // 'clear' — legacy behavior: terminus veil on exterior, nothing else.
    register('clear', {
      terminusDist: null,
      veil: { enabled: true, height: 0.15, opacity: 0.7 },
      layers: [],
      overlay: { enabled: false }
    });

    // 'boardwalk_wind' — Promenade: rolling debris + wind streaks
    register('boardwalk_wind', {
      terminusDist: 3.0,
      veil: { enabled: true, height: 0.18, opacity: 0.55, pulse: 0.08, pulseSpeed: 1.2 },
      layers: [
        {
          zone:          'lower',
          zoneHeight:    0.4,
          spriteType:    'newspaper',
          density:       1.2,       // particles per second per screen-width
          scrollX:       -80,       // px/sec leftward
          scrollY:       6,         // px/sec slight downward drift
          parallaxDepth: 0.3,
          opacity:       0.45,
          aboveHUD:      false,
          scale:         { min: 0.6, max: 1.2 },
          tumble:        1.5        // rad/sec rotation
        },
        {
          zone:          'upper',
          zoneHeight:    0.35,
          spriteType:    'wind_streak',
          density:       2.5,
          scrollX:       -200,
          scrollY:       0,
          parallaxDepth: 0.15,
          opacity:       0.18,
          aboveHUD:      false,
          scale:         { min: 0.8, max: 1.5 },
          tumble:        0
        }
      ],
      overlay: { enabled: false }
    });

    // 'lantern_haze' — Lantern Row: warm amber haze + smoke wisps
    register('lantern_haze', {
      terminusDist: 2.5,
      veil: { enabled: true, height: 0.20, opacity: 0.60, color: { r: 60, g: 45, b: 25 }, pulse: 0.05, pulseSpeed: 0.8 },
      layers: [
        {
          zone:          'lower',
          zoneHeight:    0.3,
          spriteType:    'smoke_wisp',
          density:       0.6,
          scrollX:       -30,
          scrollY:       -15,       // upward drift
          parallaxDepth: 0.2,
          opacity:       0.25,
          aboveHUD:      false,
          scale:         { min: 0.8, max: 1.8 },
          tumble:        0.3
        }
      ],
      overlay: { enabled: true, type: 'tint', color: 'rgba(60,45,25,0.04)', intensity: 0.04, aboveHUD: false }
    });

    // 'indoor_dust' — interior dust motes
    register('indoor_dust', {
      terminusDist: 1.5,
      veil: { enabled: false },
      layers: [
        {
          zone:          'full',
          zoneHeight:    0.8,
          spriteType:    'dust_mote',
          density:       3.0,
          scrollX:       -8,
          scrollY:       4,
          parallaxDepth: 0.05,
          opacity:       0.3,
          aboveHUD:      false,
          scale:         { min: 0.3, max: 0.8 },
          tumble:        0
        }
      ],
      overlay: { enabled: false }
    });

    // 'hearth_smoke' — inn bonfire warmth
    register('hearth_smoke', {
      terminusDist: 1.5,
      veil: { enabled: false },
      layers: [
        {
          zone:          'lower',
          zoneHeight:    0.5,
          spriteType:    'smoke_wisp',
          density:       0.8,
          scrollX:       -15,
          scrollY:       -20,
          parallaxDepth: 0.1,
          opacity:       0.20,
          aboveHUD:      false,
          scale:         { min: 1.0, max: 2.0 },
          tumble:        0.2
        }
      ],
      overlay: { enabled: true, type: 'tint', color: 'rgba(80,50,20,0.03)', intensity: 0.03, aboveHUD: false }
    });

    // 'cellar_drip' — dungeon ceiling drips
    register('cellar_drip', {
      terminusDist: 1.0,
      veil: { enabled: false },
      layers: [
        {
          zone:          'upper',
          zoneHeight:    0.6,
          spriteType:    'drip',
          density:       0.4,
          scrollX:       0,
          scrollY:       60,
          parallaxDepth: 0.05,
          opacity:       0.35,
          aboveHUD:      false,
          scale:         { min: 0.5, max: 1.0 },
          tumble:        0
        }
      ],
      overlay: { enabled: false }
    });

    // 'dungeon_dust' — disturbed dust after hero passage
    register('dungeon_dust', {
      terminusDist: 1.5,
      veil: { enabled: false },
      layers: [
        {
          zone:          'full',
          zoneHeight:    0.7,
          spriteType:    'dust_mote',
          density:       4.0,
          scrollX:       -12,
          scrollY:       3,
          parallaxDepth: 0.08,
          opacity:       0.35,
          aboveHUD:      false,
          scale:         { min: 0.3, max: 1.0 },
          tumble:        0
        }
      ],
      overlay: { enabled: false }
    });

    // 'light_rain' — sparse exterior rain
    register('light_rain', {
      terminusDist: 4.0,
      veil: { enabled: true, height: 0.22, opacity: 0.50, pulse: 0.06, pulseSpeed: 1.0 },
      layers: [
        {
          zone:          'full',
          zoneHeight:    0.95,
          spriteType:    'raindrop',
          density:       8.0,
          scrollX:       -40,
          scrollY:       250,
          parallaxDepth: 0.1,
          opacity:       0.30,
          aboveHUD:      false,
          scale:         { min: 0.6, max: 1.2 },
          tumble:        0
        }
      ],
      overlay: { enabled: false }
    });

    // 'heavy_rain' — dense rain with above-HUD streaks
    register('heavy_rain', {
      terminusDist: 5.0,
      veil: { enabled: true, height: 0.25, opacity: 0.65, pulse: 0.10, pulseSpeed: 1.5 },
      layers: [
        {
          zone:          'full',
          zoneHeight:    0.95,
          spriteType:    'raindrop',
          density:       18.0,
          scrollX:       -60,
          scrollY:       300,
          parallaxDepth: 0.12,
          opacity:       0.35,
          aboveHUD:      false,
          scale:         { min: 0.5, max: 1.4 },
          tumble:        0
        },
        {
          zone:          'full',
          zoneHeight:    1.0,
          spriteType:    'raindrop',
          density:       4.0,
          scrollX:       -80,
          scrollY:       350,
          parallaxDepth: 0.0,
          opacity:       0.20,
          aboveHUD:      true,
          scale:         { min: 0.8, max: 1.6 },
          tumble:        0
        }
      ],
      overlay: { enabled: true, type: 'vignette', color: 'rgba(20,25,35,0.25)', intensity: 0.25, aboveHUD: true }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Preset activation ──
  // ═══════════════════════════════════════════════════════════════

  /**
   * Activate a named preset. Called by FloorManager on floor change.
   * Crossfades from current to target over CROSSFADE_MS.
   *
   * @param {string} name    — preset key (falls back to 'clear')
   * @param {Object} [contract] — SpatialContract for the new floor
   */
  function setPreset(name, contract) {
    if (contract) _contract = contract;
    var preset = _presets[name] || _presets['clear'];
    if (!preset) return;

    // Skip transition if same preset
    if (name === _activeName && !_fading) {
      _active = preset;
      return;
    }

    // Snapshot current interpolated values for crossfade
    _fadeFromVeil = _veilOpacity;
    _fadeFromTD   = _terminusDist;

    // Resolve target values
    _fadeToVeil = (preset.veil && preset.veil.enabled) ? (preset.veil.opacity || 0) : 0;
    _fadeToTD   = _resolveTerminusDist(preset);

    _fading       = true;
    _fadeTimer    = 0;
    _fadeDuration = CROSSFADE_MS;

    _activeName = name;
    _active     = preset;

    // Reset spawn accumulators for new layer count
    _spawnAccum.length = 0;
    for (var i = 0; i < preset.layers.length; i++) {
      _spawnAccum.push(0);
    }

    // Don't nuke particles mid-crossfade — let them die naturally
  }

  /**
   * Update the contract reference (e.g. when Raycaster.setContract is
   * called). Does NOT change the active preset.
   */
  function setContract(contract) {
    _contract = contract;
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Tick (called from game loop at render rate) ──
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update weather state: crossfade interpolation, particle spawning,
   * particle physics, and particle culling.
   *
   * @param {number} dt — frame delta in milliseconds
   * @param {number} screenW — viewport width (for density → count conversion)
   * @param {number} screenH — viewport height (for zone bounds)
   */
  function tick(dt, screenW, screenH) {
    if (!_active) return;
    if (dt <= 0 || dt > 200) return;  // Skip bogus deltas

    var dtSec = dt / 1000;

    // ── Crossfade interpolation ──
    if (_fading) {
      _fadeTimer += dt;
      var t = Math.min(1, _fadeTimer / _fadeDuration);
      // Ease-in-out (smoothstep)
      t = t * t * (3 - 2 * t);
      _veilOpacity  = _fadeFromVeil + (_fadeToVeil - _fadeFromVeil) * t;
      _terminusDist = _fadeFromTD   + (_fadeToTD   - _fadeFromTD)   * t;
      if (_fadeTimer >= _fadeDuration) {
        _fading       = false;
        _veilOpacity  = _fadeToVeil;
        _terminusDist = _fadeToTD;
      }
    } else {
      // Steady state — snap to preset values (in case setContract changed)
      _veilOpacity = (_active.veil && _active.veil.enabled) ? (_active.veil.opacity || 0) : 0;
      _terminusDist = _resolveTerminusDist(_active);
    }

    // ── Veil pulse ──
    if (_active.veil && _active.veil.pulse > 0) {
      _pulsePhase += dtSec * (_active.veil.pulseSpeed || 1.5);
      if (_pulsePhase > 6.2832) _pulsePhase -= 6.2832;  // 2π wrap
    }

    // ── Spawn particles per layer ──
    var layers = _active.layers;
    for (var li = 0; li < layers.length; li++) {
      var layer = layers[li];
      if (!layer.density || layer.density <= 0) continue;

      // density = particles per second per screen-width
      var spawnRate = layer.density * dtSec;
      _spawnAccum[li] = (_spawnAccum[li] || 0) + spawnRate;

      while (_spawnAccum[li] >= 1 && _particles.length < MAX_PARTICLES) {
        _spawnAccum[li] -= 1;
        _spawnParticle(layer, li, screenW, screenH);
      }
    }

    // ── Update particles ──
    for (var i = _particles.length - 1; i >= 0; i--) {
      var p = _particles[i];
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.age += dt;
      if (p.tumble) p.rot += p.tumble * dtSec;

      // Cull if expired or off-screen
      if (p.age >= p.life || p.x < -60 || p.x > screenW + 60 ||
          p.y < -60 || p.y > screenH + 60) {
        _particles[i] = _particles[_particles.length - 1];
        _particles.pop();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Particle spawning ──
  // ═══════════════════════════════════════════════════════════════

  function _spawnParticle(layer, layerIdx, screenW, screenH) {
    var halfH = screenH * 0.5;

    // Determine spawn Y zone
    var yMin, yMax;
    var zh = layer.zoneHeight || 0.5;
    if (layer.zone === 'lower') {
      yMin = halfH;
      yMax = halfH + halfH * zh;
    } else if (layer.zone === 'upper') {
      yMax = halfH;
      yMin = halfH - halfH * zh;
    } else {
      // 'full'
      yMin = halfH * (1 - zh);
      yMax = halfH * (1 + zh);
    }

    // Spawn at right edge (scrolling left) or top edge (falling down)
    var sx = layer.scrollX || 0;
    var sy = layer.scrollY || 0;
    var x, y;
    if (Math.abs(sx) > Math.abs(sy)) {
      // Horizontal-dominant: spawn at leading edge
      x = sx < 0 ? screenW + 20 : -20;
      y = yMin + Math.random() * (yMax - yMin);
    } else {
      // Vertical-dominant: spawn at top/bottom edge
      x = Math.random() * screenW;
      y = sy > 0 ? yMin - 10 : yMax + 10;
    }

    var scaleRange = layer.scale || { min: 0.8, max: 1.2 };
    var scale = scaleRange.min + Math.random() * (scaleRange.max - scaleRange.min);

    // Life = time to cross the screen at scroll speed
    var travelDist = Math.max(screenW, screenH) * 1.3;
    var speed = Math.max(Math.abs(sx), Math.abs(sy), 20);
    var life = (travelDist / speed) * 1000;

    _particles.push({
      x:          x,
      y:          y,
      vx:         sx + (Math.random() - 0.5) * Math.abs(sx) * 0.2,
      vy:         sy + (Math.random() - 0.5) * Math.abs(sy) * 0.2,
      age:        0,
      life:       life,
      scale:      scale,
      rot:        (layer.tumble > 0) ? Math.random() * 6.2832 : 0,
      tumble:     layer.tumble || 0,
      opacity:    layer.opacity || 0.5,
      layerIdx:   layerIdx,
      spriteType: layer.spriteType || 'dust_mote',
      aboveHUD:   layer.aboveHUD || false
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Rendering: below HUD (called by raycaster) ──
  // ═══════════════════════════════════════════════════════════════

  /**
   * Render weather layers that sit between distant and near sprite
   * passes. This includes the veil gradient and all non-aboveHUD
   * parallax particle layers.
   *
   * @param {CanvasRenderingContext2D} ctx — offscreen raycaster context
   * @param {number} w   — viewport width
   * @param {number} h   — viewport height
   * @param {number} halfH — h/2 (horizon line Y)
   * @param {Object} fogColor — { r, g, b } from contract
   */
  function renderBelow(ctx, w, h, halfH, fogColor) {
    if (!_active) return;

    // ── 1. Veil gradient ──
    if (_active.veil && _active.veil.enabled && _veilOpacity > 0.01) {
      _drawVeil(ctx, w, h, halfH, fogColor);
    }

    // ── 2. Below-HUD particle layers ──
    _drawParticles(ctx, w, h, false);
  }

  /**
   * Render above-HUD weather layers (heavy rain streaks, vignette).
   * Called by game.js after all HUD rendering.
   *
   * @param {CanvasRenderingContext2D} ctx — main canvas context
   * @param {number} W — canvas width
   * @param {number} H — canvas height
   */
  function renderAbove(ctx, W, H) {
    if (!_active) return;

    // ── Above-HUD particle layers ──
    _drawParticles(ctx, W, H, true);

    // ── Overlay (vignette / tint) ──
    if (_active.overlay && _active.overlay.enabled && _active.overlay.aboveHUD) {
      _drawOverlay(ctx, W, H);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Draw helpers ──
  // ═══════════════════════════════════════════════════════════════

  function _drawVeil(ctx, w, h, halfH, fogColor) {
    var veil = _active.veil;
    var veilH = Math.floor(h * (veil.height || 0.15));
    var veilTop = Math.max(0, Math.floor(halfH) - veilH);
    var veilBot = Math.min(h, Math.floor(halfH) + veilH);
    var totalH  = veilBot - veilTop;
    if (totalH <= 4) return;

    // Resolve veil color (preset override or contract fog)
    var vc = veil.color || fogColor;
    var r = vc.r, g = vc.g, b = vc.b;

    // Apply pulse modulation
    var opacity = _veilOpacity;
    if (veil.pulse > 0) {
      opacity += Math.sin(_pulsePhase) * veil.pulse;
      opacity = Math.max(0, Math.min(1, opacity));
    }

    var mid  = opacity.toFixed(3);
    var side = (opacity * 0.6).toFixed(3);

    var grad = ctx.createLinearGradient(0, veilTop, 0, veilBot);
    grad.addColorStop(0,    'rgba(' + r + ',' + g + ',' + b + ',0)');
    grad.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',' + side + ')');
    grad.addColorStop(0.5,  'rgba(' + r + ',' + g + ',' + b + ',' + mid + ')');
    grad.addColorStop(0.65, 'rgba(' + r + ',' + g + ',' + b + ',' + side + ')');
    grad.addColorStop(1,    'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, veilTop, w, totalH);
  }

  /**
   * Draw particles, filtered by aboveHUD flag.
   */
  function _drawParticles(ctx, w, h, aboveHUDPass) {
    if (_particles.length === 0) return;

    // Check if WeatherSprites is loaded for procedural rendering
    var hasSprites = (typeof WeatherSprites !== 'undefined');

    ctx.save();
    for (var i = 0; i < _particles.length; i++) {
      var p = _particles[i];
      if (p.aboveHUD !== aboveHUDPass) continue;

      // Fade in during first 10% of life, fade out during last 25%
      var lifeRatio = p.age / p.life;
      var fadeAlpha = 1;
      if (lifeRatio < 0.1) {
        fadeAlpha = lifeRatio / 0.1;
      } else if (lifeRatio > 0.75) {
        fadeAlpha = (1 - lifeRatio) / 0.25;
      }

      var alpha = p.opacity * Math.max(0, Math.min(1, fadeAlpha));
      if (alpha < 0.01) continue;

      ctx.globalAlpha = alpha;

      if (hasSprites && WeatherSprites.draw) {
        // Delegate to procedural sprite renderer (Phase 2)
        WeatherSprites.draw(ctx, p.spriteType, p.x, p.y, p.scale, p.rot);
      } else {
        // Fallback: simple shapes per type
        _drawFallbackParticle(ctx, p);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Minimal fallback renderer when WeatherSprites is not loaded.
   * Draws basic shapes so the particle system is visible without
   * the full procedural sprite module.
   */
  function _drawFallbackParticle(ctx, p) {
    var x = p.x, y = p.y, s = p.scale;

    switch (p.spriteType) {
      case 'newspaper':
        // Small tan rectangle
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#c8b89a';
        ctx.fillRect(-6 * s, -4 * s, 12 * s, 8 * s);
        ctx.restore();
        break;

      case 'wind_streak':
        // Thin horizontal line
        ctx.strokeStyle = 'rgba(180,190,200,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 25 * s, y + 1);
        ctx.stroke();
        break;

      case 'raindrop':
        // Angled line
        ctx.strokeStyle = 'rgba(160,180,210,0.6)';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3 * s, y + 8 * s);
        ctx.stroke();
        break;

      case 'smoke_wisp':
        // Soft circle
        ctx.fillStyle = 'rgba(120,110,100,0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 4 * s, 0, 6.2832);
        ctx.fill();
        break;

      case 'dust_mote':
        // Tiny dot
        ctx.fillStyle = 'rgba(180,170,150,0.5)';
        ctx.beginPath();
        ctx.arc(x, y, 1.5 * s, 0, 6.2832);
        ctx.fill();
        break;

      case 'drip':
        // Short vertical line
        ctx.strokeStyle = 'rgba(100,130,180,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 4 * s);
        ctx.stroke();
        break;

      default:
        // Generic dot
        ctx.fillStyle = 'rgba(200,200,200,0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 2 * s, 0, 6.2832);
        ctx.fill();
        break;
    }
  }

  /**
   * Draw the above-HUD overlay (vignette or full-screen tint).
   */
  function _drawOverlay(ctx, W, H) {
    var ov = _active.overlay;
    if (ov.type === 'tint') {
      ctx.save();
      ctx.globalAlpha = ov.intensity || 0.05;
      ctx.fillStyle = ov.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else if (ov.type === 'vignette') {
      var cx = W * 0.5, cy = H * 0.5;
      var outerR = Math.max(W, H) * 0.75;
      var innerR = Math.min(W, H) * 0.3;
      ctx.save();
      ctx.globalAlpha = ov.intensity || 0.2;
      var grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, ov.color);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Queries ──
  // ═══════════════════════════════════════════════════════════════

  /**
   * Returns the current effective terminusDist for the sprite sandwich.
   * Called by raycaster each frame.
   */
  function getTerminusDist() {
    return _terminusDist;
  }

  /**
   * Returns the active preset name.
   */
  function getPresetName() {
    return _activeName;
  }

  /**
   * Returns true if a crossfade is in progress.
   */
  function isTransitioning() {
    return _fading;
  }

  /**
   * Get active particle count (for perf monitoring).
   */
  function getParticleCount() {
    return _particles.length;
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Utilities ──
  // ═══════════════════════════════════════════════════════════════

  function _resolveTerminusDist(preset) {
    if (preset && preset.terminusDist != null) return preset.terminusDist;
    if (_contract && _contract.terminusDist != null) return _contract.terminusDist;
    return 2.0;
  }

  /**
   * Deep merge a preset config against defaults.
   */
  function _mergePreset(defaults, overrides) {
    var result = {};
    result.terminusDist = overrides.terminusDist !== undefined ? overrides.terminusDist : defaults.terminusDist;

    // Veil
    result.veil = {};
    var dv = defaults.veil || {};
    var ov = overrides.veil || {};
    result.veil.enabled    = ov.enabled    !== undefined ? ov.enabled    : dv.enabled;
    result.veil.height     = ov.height     !== undefined ? ov.height     : dv.height;
    result.veil.opacity    = ov.opacity    !== undefined ? ov.opacity    : dv.opacity;
    result.veil.color      = ov.color      !== undefined ? ov.color      : dv.color;
    result.veil.pulse      = ov.pulse      !== undefined ? ov.pulse      : dv.pulse;
    result.veil.pulseSpeed = ov.pulseSpeed !== undefined ? ov.pulseSpeed : dv.pulseSpeed;

    // Layers (replace, don't merge)
    result.layers = overrides.layers || defaults.layers || [];

    // Overlay
    result.overlay = {};
    var dolay = defaults.overlay || {};
    var oolay = overrides.overlay || {};
    result.overlay.enabled   = oolay.enabled   !== undefined ? oolay.enabled   : dolay.enabled;
    result.overlay.type      = oolay.type      !== undefined ? oolay.type      : dolay.type;
    result.overlay.color     = oolay.color     !== undefined ? oolay.color     : dolay.color;
    result.overlay.intensity = oolay.intensity !== undefined ? oolay.intensity : dolay.intensity;
    result.overlay.aboveHUD  = oolay.aboveHUD  !== undefined ? oolay.aboveHUD  : dolay.aboveHUD;

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Weather Schedule (7-day cycle × region) ──
  // ═══════════════════════════════════════════════════════════════
  //
  // Weather fronts move from the woods (floor 0) through the coast
  // (floor 1) and into the city (floors 2+) with a ~1-day lag, so
  // adjacent floors never jump between extremes. The player deploys
  // on Day 0 (Monday) into heavy rain at the Approach, walks into
  // lighter weather on the Promenade, and reaches clear skies in
  // the city — a natural environmental gradient that teaches depth.
  //
  // Interior floors derive from their parent exterior. Dungeons
  // are underground and respond to surface rain with ceiling drips.

  /**
   * Weather region classification. Maps a floor ID to a weather
   * region key used in the schedule table.
   *
   * @param {string} floorId
   * @returns {string} 'woods'|'coast'|'city'|'interior'|'dungeon'
   */
  function _getWeatherRegion(floorId) {
    if (!floorId) return 'city';
    var parts = String(floorId).split('.');
    var depth = parts.length;

    if (depth >= 3) return 'dungeon';
    if (depth === 2) return 'interior';

    // Depth 1: exterior floors
    var top = parts[0];
    if (top === '0') return 'woods';
    if (top === '1') return 'coast';
    return 'city';  // '2', '3', and beyond
  }

  /**
   * For interior floors (depth 2), resolve the parent exterior's
   * weather region so the interior gets a dampened version of the
   * same system.
   *
   * @param {string} floorId — e.g. '1.2', '2.1'
   * @returns {string} 'woods'|'coast'|'city'
   */
  function _parentExteriorRegion(floorId) {
    var top = String(floorId).split('.')[0];
    if (top === '0') return 'woods';
    if (top === '1') return 'coast';
    return 'city';
  }

  // ── Schedule tables ──
  // Rows indexed by day-of-week (0=Mon … 6=Sun), matching DayCycle.
  // The front pattern: heavy rain in woods first, then shifts
  // coastward a day later, city a day after that. Clear spells
  // propagate the same way. This creates natural 2–3 day weather
  // "blocks" per region with gentle transitions between neighbors.

  var _SCHEDULE_EXTERIOR = {
    //             Mon             Tue              Wed              Thu              Fri              Sat              Sun
    woods: [ 'heavy_rain',   'light_rain',    'boardwalk_wind', 'clear',         'clear',         'light_rain',    'heavy_rain'  ],
    coast: [ 'light_rain',   'boardwalk_wind', 'clear',         'clear',         'boardwalk_wind', 'light_rain',   'light_rain'  ],
    city:  [ 'lantern_haze', 'boardwalk_wind', 'clear',         'clear',         'clear',         'boardwalk_wind', 'lantern_haze']
  };

  // Interior presets (dampened): exterior rain → hearth_smoke,
  // exterior wind → indoor_dust, exterior clear → clear (no particles).
  var _INTERIOR_MAP = {
    heavy_rain:     'hearth_smoke',
    light_rain:     'hearth_smoke',
    boardwalk_wind: 'indoor_dust',
    lantern_haze:   'indoor_dust',
    clear:          'clear'
  };

  // Dungeon presets: surface rain → ceiling drips, otherwise dust.
  var _DUNGEON_MAP = {
    heavy_rain:     'cellar_drip',
    light_rain:     'cellar_drip',
    boardwalk_wind: 'dungeon_dust',
    lantern_haze:   'dungeon_dust',
    clear:          'dungeon_dust'
  };

  /**
   * Resolve the scheduled weather preset for a floor on the current
   * game day. Reads DayCycle.getDay() for the day-of-week index.
   *
   * Call this from FloorManager instead of reading contract.weather
   * directly. The contract's weather field becomes a fallback for
   * floors with explicit overrides or when DayCycle isn't loaded.
   *
   * @param {string} floorId — e.g. '0', '1', '2.1', '1.3.1'
   * @returns {string} preset name
   */
  function getScheduledPreset(floorId) {
    // Day-of-week (0–6, Mon–Sun)
    var dayOfWeek = 0;
    if (typeof DayCycle !== 'undefined' && DayCycle.getDay) {
      dayOfWeek = DayCycle.getDay() % 7;
    }

    var region = _getWeatherRegion(floorId);

    if (region === 'woods' || region === 'coast' || region === 'city') {
      var row = _SCHEDULE_EXTERIOR[region];
      return row ? row[dayOfWeek] : 'clear';
    }

    // Interior: derive from parent exterior's weather
    if (region === 'interior') {
      var parentRegion = _parentExteriorRegion(floorId);
      var parentRow = _SCHEDULE_EXTERIOR[parentRegion];
      var surfaceWeather = parentRow ? parentRow[dayOfWeek] : 'clear';
      return _INTERIOR_MAP[surfaceWeather] || 'clear';
    }

    // Dungeon: derive from grandparent exterior's weather
    if (region === 'dungeon') {
      var grandparent = String(floorId).split('.')[0];
      var gpRegion = _getWeatherRegion(grandparent);
      var gpRow = _SCHEDULE_EXTERIOR[gpRegion];
      var gpWeather = gpRow ? gpRow[dayOfWeek] : 'clear';
      return _DUNGEON_MAP[gpWeather] || 'dungeon_dust';
    }

    return 'clear';
  }

  /**
   * Get the full 7-day forecast for a floor's region.
   * Returns an array of 7 preset names (Mon–Sun).
   * Useful for UI display (e.g., week strip weather icons).
   *
   * @param {string} floorId
   * @returns {string[]}
   */
  function getForecast(floorId) {
    var region = _getWeatherRegion(floorId);
    if (region === 'woods' || region === 'coast' || region === 'city') {
      return _SCHEDULE_EXTERIOR[region].slice();
    }
    // Interior/dungeon: derive full week from parent
    var parentRegion = (region === 'interior')
      ? _parentExteriorRegion(floorId)
      : _getWeatherRegion(String(floorId).split('.')[0]);
    var parentRow = _SCHEDULE_EXTERIOR[parentRegion] || _SCHEDULE_EXTERIOR['city'];
    var map = (region === 'dungeon') ? _DUNGEON_MAP : _INTERIOR_MAP;
    var forecast = [];
    for (var i = 0; i < 7; i++) {
      forecast.push(map[parentRow[i]] || 'clear');
    }
    return forecast;
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Init ──
  // ═══════════════════════════════════════════════════════════════

  _registerDefaults();

  // Set clear as the initial active preset
  _active     = _presets['clear'];
  _activeName = 'clear';
  _veilOpacity  = _active.veil.opacity;
  _terminusDist = 2.0;

  // Pre-warm sprite cache if WeatherSprites is available
  if (typeof WeatherSprites !== 'undefined' && WeatherSprites.warmCache) {
    WeatherSprites.warmCache();
  }

  // ═══════════════════════════════════════════════════════════════
  // ── Public API ──
  // ═══════════════════════════════════════════════════════════════

  return Object.freeze({
    // Preset management
    register:           register,
    setPreset:          setPreset,
    setContract:        setContract,

    // Schedule
    getScheduledPreset: getScheduledPreset,
    getForecast:        getForecast,

    // Frame update
    tick:               tick,

    // Rendering
    renderBelow:        renderBelow,
    renderAbove:        renderAbove,

    // Queries
    getTerminusDist:    getTerminusDist,
    getPresetName:      getPresetName,
    isTransitioning:    isTransitioning,
    getParticleCount:   getParticleCount
  });
})();

/**
 * LightOrbs — Additive halation rendered over fire sources.
 *
 * Phase 1: clear-weather orbs for Lighting point sources. Each fire
 * source gets a soft additive radial gradient tracked to its on-screen
 * position so torches, bonfires, and hearths read as emitting volumetric
 * light instead of flat sprites.
 *
 * Two source-position paths:
 *   1. Gaze sources (bonfire, hearth) — lock to the post-billboard
 *      screen position published by SpriteLayer.getLightSprites().
 *      Inherits the "aggressive tracking / shrink-before-cull" quirk
 *      of the eyeball flame sprite exactly, so the orb stays pinned
 *      to the gaze no matter how the CSS billboard distorts.
 *   2. Non-gaze sources (torches, lanterns, braziers) — project via
 *      Raycaster.projectWorldToScreen with a gentle inertial lag so
 *      the halation feels atmospheric rather than decal-stuck.
 *
 * Modulation inputs:
 *   - SpatialContract depth (exterior/interior/nested dungeon)
 *   - WeatherSystem preset (rain halation, haze spread, smoke diffusion)
 *   - DayCycle phase (orbs fade to ~15% during daylight, peak at night)
 *
 * Layer 2 module — depends on: Raycaster, Lighting, SpriteLayer (all
 * Layer 2 or earlier). Loaded AFTER SpriteLayer so the gaze snapshot
 * is current when LightOrbs.render reads it.
 *
 * API:
 *   LightOrbs.tick(dt)          — advance per-source pulse/lag state
 *   LightOrbs.render(ctx, w, h, camX, camY, camDir)
 *   LightOrbs.setEnabled(bool)
 *   LightOrbs.getActiveCount()  — diagnostics
 */
var LightOrbs = (function () {
  'use strict';

  // ── Tunables ─────────────────────────────────────────────────────
  var DEFAULT_RADIUS_PX   = 48;   // baseline orb radius at dist=1, scale=1
  var MAX_RADIUS_PX       = 260;  // hard cap so close bonfires don't wash
  var INERTIA             = 0.22; // low-pass α for non-gaze tracking lag
  var MIN_ALPHA           = 0.02; // below this the orb is skipped
  var RENDER_DIST         = 14;   // tiles; orbs beyond are culled
  var DAY_DIM             = 0.15; // brightness multiplier at midday
  var DUSK_DIM            = 0.55;
  var NIGHT_DIM           = 0.95;
  var DAWN_DIM            = 0.40;

  // Per-kind base profile (radius multiplier, hue anchor, base alpha)
  var _KIND_PROFILE = {
    torch:   { radiusMul: 1.2, alphaMul: 0.85, rgb: '255,190,110' },
    bonfire: { radiusMul: 2.2, alphaMul: 1.00, rgb: '255,160,70'  },
    hearth:  { radiusMul: 1.9, alphaMul: 0.95, rgb: '255,175,95'  },
    lantern: { radiusMul: 0.9, alphaMul: 0.75, rgb: '200,210,255' },
    brazier: { radiusMul: 1.6, alphaMul: 0.90, rgb: '255,170,80'  }
  };

  // Weather modifier lookup (queried by preset name from WeatherSystem)
  var _WEATHER_MOD = {
    clear:           { spread: 1.00, alpha: 1.00, sparkle: 0 },
    boardwalk_wind:  { spread: 1.15, alpha: 0.90, sparkle: 0 },
    lantern_haze:    { spread: 1.40, alpha: 0.85, sparkle: 0 },
    indoor_dust:     { spread: 1.30, alpha: 0.90, sparkle: 0 },
    hearth_smoke:    { spread: 1.80, alpha: 0.65, sparkle: 0 },
    cellar_drip:     { spread: 1.50, alpha: 0.75, sparkle: 0 },
    dungeon_dust:    { spread: 1.60, alpha: 0.80, sparkle: 0 },
    light_rain:      { spread: 1.55, alpha: 0.70, sparkle: 0.02 },
    heavy_rain:      { spread: 2.00, alpha: 0.50, sparkle: 0.04 }
  };

  // Depth modifier (from SpatialContract.depth or inferred)
  var _DEPTH_MOD = {
    1: { spread: 0.75, alpha: 0.85 }, // exterior — open air
    2: { spread: 1.20, alpha: 1.05 }, // interior — trapped bloom
    3: { spread: 1.45, alpha: 1.15 }  // nested dungeon — darkness amplifies
  };

  // ── State ────────────────────────────────────────────────────────
  var _enabled = true;
  var _timeSec = 0;
  // Per-source smoothed screen position for inertial tracking.
  // Keyed by "x,y" of the Lighting source. Entries pruned on floor change.
  var _track = {};
  var _activeCount = 0;

  // ── Helpers ──────────────────────────────────────────────────────
  function _getDepth() {
    // SpatialContract has a depth the Raycaster holds; not directly
    // queryable, so infer from FloorManager floor-id dot count.
    if (typeof FloorManager === 'undefined' || !FloorManager.getCurrentFloorId) return 1;
    var id = FloorManager.getCurrentFloorId();
    if (!id) return 1;
    var dots = 0;
    for (var i = 0; i < id.length; i++) if (id.charAt(i) === '.') dots++;
    return Math.min(3, dots + 1);
  }

  function _getPhaseDim() {
    if (typeof DayCycle === 'undefined' || !DayCycle.getPhase) return NIGHT_DIM;
    switch (DayCycle.getPhase()) {
      case 'dawn':  return DAWN_DIM;
      case 'day':   return DAY_DIM;
      case 'dusk':  return DUSK_DIM;
      case 'night': return NIGHT_DIM;
      default:      return 0.70;
    }
  }

  function _getWeatherMod() {
    if (typeof WeatherSystem === 'undefined' || !WeatherSystem.getPresetName) {
      return _WEATHER_MOD.clear;
    }
    var p = WeatherSystem.getPresetName();
    return _WEATHER_MOD[p] || _WEATHER_MOD.clear;
  }

  function _flickerPulse(flickerType, seed) {
    // Mirrors Lighting.js flicker shapes at a gentler amplitude so the
    // halation breathes rather than strobes.
    var t = _timeSec;
    switch (flickerType) {
      case 'torch':
        return 0.88 + 0.12 * Math.sin(t * 6.3 + seed);
      case 'bonfire':
        return 0.80 + 0.20 * (0.5 + 0.5 * Math.sin(t * 3.1 + seed))
                     * (0.7 + 0.3 * Math.sin(t * 7.7 + seed * 1.3));
      case 'hearth-dungeon':
        return 0.85 + 0.15 * Math.sin(t * 2.2 + seed);
      case 'steady':
        return 0.95 + 0.05 * Math.sin(t * 1.1 + seed);
      default:
        return 1.0;
    }
  }

  function _trackKey(src) { return src.x + ',' + src.y; }

  function _smoothTrack(key, targetX, targetY) {
    var t = _track[key];
    if (!t) {
      t = { x: targetX, y: targetY };
      _track[key] = t;
      return t;
    }
    t.x += (targetX - t.x) * INERTIA;
    t.y += (targetY - t.y) * INERTIA;
    return t;
  }

  // ── Public API ───────────────────────────────────────────────────

  function tick(dt) {
    _timeSec += (dt || 0.016);
  }

  /**
   * Draw orbs. Call AFTER Raycaster.render() and AFTER SpriteLayer.tick()
   * so gaze snapshots are current, but BEFORE weather veil / HUD.
   */
  function render(ctx, w, h, camX, camY, camDir) {
    _activeCount = 0;
    if (!_enabled) return;
    if (typeof Lighting === 'undefined' || !Lighting.getSources) return;
    if (typeof Raycaster === 'undefined' || !Raycaster.projectWorldToScreen) return;

    var sources = Lighting.getSources();
    if (!sources || !sources.length) return;

    // Gaze override lookup: map "x,y" → SpriteLayer lastRender.
    var gazeOverrides = {};
    if (typeof SpriteLayer !== 'undefined' && SpriteLayer.getLightSprites) {
      var gazes = SpriteLayer.getLightSprites();
      for (var g = 0; g < gazes.length; g++) {
        var gz = gazes[g];
        gazeOverrides[gz.tileX + ',' + gz.tileY] = gz;
      }
    }

    var depth = _getDepth();
    var depthMod = _DEPTH_MOD[depth] || _DEPTH_MOD[1];
    var weatherMod = _getWeatherMod();
    var phaseDim = _getPhaseDim();
    // Exterior orbs get extra dampening at noon because the sun
    // physically washes them; interiors/dungeons ignore phaseDim.
    var phaseMul = (depth === 1) ? phaseDim : Math.max(0.55, phaseDim);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      // Skip unregistered/non-fire emitters. Electric/terminal sources
      // (flicker 'none', tint cool) still get an orb — their kind is
      // 'torch' by fallback which is fine.
      var kindProf = _KIND_PROFILE[src.kind] || _KIND_PROFILE.torch;
      var key = _trackKey(src);

      // ── Position resolution ────────────────────────────────────
      var posX, posY, dist;
      var override = src.gaze ? gazeOverrides[key] : null;
      if (override) {
        posX = override.centerX;
        posY = override.centerY;
        dist = override.dist;
        // Gaze sources lock; reset track so non-gaze code doesn't drift.
        _track[key] = { x: posX, y: posY };
      } else {
        var proj = Raycaster.projectWorldToScreen(
          src.x, src.y, camX, camY, camDir, 0.5, 0
        );
        if (!proj) continue;
        if (proj.dist > RENDER_DIST) continue;
        if (!proj.visible) continue;
        var trk = _smoothTrack(key, proj.screenX, proj.screenY + proj.scaleH * 0.5);
        posX = trk.x;
        posY = trk.y;
        dist = proj.dist;
      }

      // ── Intensity computation ─────────────────────────────────
      var pulse = _flickerPulse(src.flickerType, src._seed || 0);
      var distFalloff = 1 / (1 + dist * dist * 0.04);
      var baseAlpha = (src.intensity || 0.8) * kindProf.alphaMul
                      * weatherMod.alpha * depthMod.alpha * phaseMul
                      * pulse * distFalloff;
      if (baseAlpha < MIN_ALPHA) continue;

      var radius = DEFAULT_RADIUS_PX
                 * kindProf.radiusMul
                 * weatherMod.spread
                 * depthMod.spread
                 * (1 / Math.max(0.5, dist * 0.6))
                 * pulse;
      if (radius > MAX_RADIUS_PX) radius = MAX_RADIUS_PX;
      if (radius < 4) continue;

      // ── Draw gradient ─────────────────────────────────────────
      var rgb = kindProf.rgb;
      var a = Math.min(1, baseAlpha);
      var grad = ctx.createRadialGradient(posX, posY, 0, posX, posY, radius);
      grad.addColorStop(0,    'rgba(' + rgb + ',' + (a * 0.55).toFixed(3) + ')');
      grad.addColorStop(0.35, 'rgba(' + rgb + ',' + (a * 0.28).toFixed(3) + ')');
      grad.addColorStop(0.70, 'rgba(' + rgb + ',' + (a * 0.08).toFixed(3) + ')');
      grad.addColorStop(1,    'rgba(' + rgb + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(posX - radius, posY - radius, radius * 2, radius * 2);

      // Optional sparkle (rain catching firelight): cheap single-pixel bloom
      if (weatherMod.sparkle > 0 && Math.random() < weatherMod.sparkle) {
        var sx = posX + (Math.random() - 0.5) * radius * 0.6;
        var sy = posY + (Math.random() - 0.5) * radius * 0.6;
        ctx.fillStyle = 'rgba(' + rgb + ',' + (a * 0.9).toFixed(3) + ')';
        ctx.fillRect(sx, sy, 2, 2);
      }

      _activeCount++;
    }

    ctx.restore();
  }

  function setEnabled(b) { _enabled = !!b; }
  function isEnabled()   { return _enabled; }
  function getActiveCount() { return _activeCount; }

  /** Clear tracking state (call on floor transition). */
  function reset() { _track = {}; _activeCount = 0; }

  return Object.freeze({
    tick:           tick,
    render:         render,
    setEnabled:     setEnabled,
    isEnabled:      isEnabled,
    getActiveCount: getActiveCount,
    reset:          reset
  });
})();

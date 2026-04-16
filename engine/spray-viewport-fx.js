/**
 * SprayViewportFX — Hose-carry overlay + wet spatter on the viewport lens.
 *
 * Two visual layers that sell the pressure-washing fantasy:
 *
 *   1. CARRY TINT — while HoseState.isActive(), a gentle blue wash covers
 *      the viewport so the player "feels" the weight of water. Ramps on
 *      over 300ms at attach, fades off over 200ms at detach. Composited
 *      with normal blending (source-over) at low alpha.
 *
 *   2. WET SPATTER — while SpraySystem.isActive() AND the floor is
 *      interior/dungeon (depth ≥ 2), water droplets accumulate on the
 *      viewport like a camera lens getting splashed. Each droplet:
 *        - spawns at a random screen position weighted toward the lower
 *          half (gravity bias) and the beam aim point (deflection bias)
 *        - sits as a transparent "lens drop" with a refraction-shifted
 *          light catch — the pixel under the droplet is color-shifted by
 *          the nearest LightOrbs' RGB + alpha
 *        - slowly slides downward (gravity creep) and shrinks (evaporation)
 *        - on evaporation, leaves a faint wet-stain ring for a few seconds
 *      When spraying stops, no new droplets spawn but existing ones
 *      finish their lifecycle.
 *
 * WHY this replaces the stagnant cellar preset during spray:
 *   The cellar_drip / dungeon_dust particles fall in the mid-distance
 *   (parallax depth 0.05–0.08) and read as environmental atmosphere.
 *   Spray droplets land ON THE LENS (screen-space, no parallax) and
 *   interact with the player's own light sources via LightOrbs' per-frame
 *   snapshot, making the viewport feel alive and wet rather than
 *   dusty/stagnant. The two systems coexist — weather particles are the
 *   room; spatter is the player's goggles.
 *
 * Layer 2. Depends on: HoseState (Layer 1), SpraySystem (Layer 3 — soft
 * via typeof guard), LightOrbs (Layer 2 — optional, for light-catch),
 * Lighting (Layer 1 — optional, for nearest-source RGB fallback).
 */
var SprayViewportFX = (function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // ── Carry tint tunables ──
  // ══════════════════════════════════════════════════════════════
  var CARRY_R = 60, CARRY_G = 130, CARRY_B = 200;  // muted steel-blue
  var CARRY_ALPHA_MAX  = 0.08;   // ceiling — barely perceptible
  var CARRY_RAMP_MS    = 300;    // fade-in duration on hose attach
  var CARRY_FADE_MS    = 200;    // fade-out duration on hose detach
  // Gentle sine pulse so the overlay breathes rather than sitting flat.
  var CARRY_PULSE_AMP  = 0.015;
  var CARRY_PULSE_FREQ = 1.2;    // Hz

  // ══════════════════════════════════════════════════════════════
  // ── Wet spatter tunables ──
  // ══════════════════════════════════════════════════════════════
  var MAX_DROPS         = 40;     // pool cap
  var SPAWN_INTERVAL_MS = 120;    // one drop every N ms while spraying
  var DROP_RADIUS_MIN   = 8;
  var DROP_RADIUS_MAX   = 28;
  var DROP_LIFE_MIN     = 1.8;    // seconds before full evaporation
  var DROP_LIFE_MAX     = 4.5;
  var GRAVITY_CREEP     = 6.0;    // px/s downward slide
  var EVAP_SHRINK       = 0.65;   // radius multiplier at end of life
  var STAIN_LINGER_SEC  = 2.5;    // wet ring after drop evaporates
  var STAIN_ALPHA       = 0.04;   // very faint ring residue

  // Light-catch: each droplet samples the nearest LightOrbs contribution
  // at its screen position and tints the drop's specular highlight.
  var LIGHT_CATCH_ALPHA = 0.55;   // how much of the orb colour bleeds in
  var LIGHT_CATCH_RADIUS_FRAC = 0.30; // specular hot-spot as frac of drop radius

  // ══════════════════════════════════════════════════════════════
  // ── State ──
  // ══════════════════════════════════════════════════════════════
  var _enabled       = true;
  var _timeSec       = 0;

  // Carry tint
  var _carryAlpha    = 0;         // current interpolated alpha
  var _carryTarget   = 0;         // 0 or CARRY_ALPHA_MAX
  var _carryPrev     = false;     // HoseState.isActive() last frame

  // Spatter
  var _drops         = [];        // active drops
  var _stains        = [];        // evaporated wet rings
  var _spawnAccum    = 0;         // ms debt for spawn timing
  var _sprayPrev     = false;     // SpraySystem.isActive() last frame

  // Cached nearest-light snapshot per frame (populated in tick)
  var _lightSnapshot = [];        // [{x, y, r, g, b, alpha, radius}]

  // ══════════════════════════════════════════════════════════════
  // ── Helpers ──
  // ══════════════════════════════════════════════════════════════

  function _rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  function _getDepth() {
    if (typeof FloorManager === 'undefined' || !FloorManager.getCurrentFloorId) return 1;
    var id = FloorManager.getCurrentFloorId();
    if (!id) return 1;
    var dots = 0;
    for (var i = 0; i < id.length; i++) if (id.charAt(i) === '.') dots++;
    return Math.min(3, dots + 1);
  }

  /** Sample the nearest LightOrbs contribution at screen (sx, sy). */
  function _sampleLight(sx, sy) {
    // Walk the Lighting source list and project to find the nearest
    // visible source to (sx, sy) in screen-space. This is cheaper
    // than reading back canvas pixels and integrates with the orb
    // system's warm RGB.
    var best = null;
    var bestDsq = Infinity;
    for (var i = 0; i < _lightSnapshot.length; i++) {
      var s = _lightSnapshot[i];
      var dx = sx - s.x;
      var dy = sy - s.y;
      var dsq = dx * dx + dy * dy;
      var rSq = s.radius * s.radius;
      // Only count if the drop is within the orb's drawn radius
      if (dsq < rSq && dsq < bestDsq) {
        bestDsq = dsq;
        best = s;
      }
    }
    if (!best) return null;
    // Attenuate by distance from orb centre (linear falloff within radius)
    var distFrac = Math.sqrt(bestDsq) / best.radius;
    var a = best.alpha * (1 - distFrac) * LIGHT_CATCH_ALPHA;
    return { r: best.r, g: best.g, b: best.b, a: a };
  }

  function _spawnDrop(w, h) {
    if (_drops.length >= MAX_DROPS) return;
    // Bias toward lower-centre of viewport (gravity + deflection)
    var x = _rand(w * 0.1, w * 0.9);
    var y = _rand(h * 0.3, h * 0.95);
    var radius = _rand(DROP_RADIUS_MIN, DROP_RADIUS_MAX);
    var life = _rand(DROP_LIFE_MIN, DROP_LIFE_MAX);
    _drops.push({
      x: x,
      y: y,
      r: radius,
      r0: radius,
      life: life,
      maxLife: life,
      // Per-drop wobble seed so they don't slide in lockstep
      seed: Math.random() * Math.PI * 2,
      // Light catch sampled at spawn — cheaper than per-frame and
      // the drop doesn't move much during its short life.
      light: _sampleLight(x, y)
    });
  }

  // ══════════════════════════════════════════════════════════════
  // ── Tick ──
  // ══════════════════════════════════════════════════════════════

  function tick(dt) {
    var d = dt || 16;
    if (d > 3) d = d / 1000;
    _timeSec += d;

    // ── Carry tint ramp ──
    var hoseActive = (typeof HoseState !== 'undefined' && HoseState.isActive && HoseState.isActive());
    _carryTarget = hoseActive ? CARRY_ALPHA_MAX : 0;

    if (_carryAlpha < _carryTarget) {
      _carryAlpha += (CARRY_ALPHA_MAX / (CARRY_RAMP_MS / 1000)) * d;
      if (_carryAlpha > _carryTarget) _carryAlpha = _carryTarget;
    } else if (_carryAlpha > _carryTarget) {
      _carryAlpha -= (CARRY_ALPHA_MAX / (CARRY_FADE_MS / 1000)) * d;
      if (_carryAlpha < 0) _carryAlpha = 0;
    }
    _carryPrev = hoseActive;

    // ── Spatter lifecycle ──
    var spraying = (typeof SpraySystem !== 'undefined' && SpraySystem.isActive && SpraySystem.isActive());
    var depth = _getDepth();
    var indoors = depth >= 2;

    // Spawn new drops while spraying indoors
    if (spraying && indoors && _enabled) {
      _spawnAccum += d * 1000;
      while (_spawnAccum >= SPAWN_INTERVAL_MS) {
        _spawnAccum -= SPAWN_INTERVAL_MS;
        // Need w/h — defer to render; set a flag
        _spawnAccum = Math.min(_spawnAccum, SPAWN_INTERVAL_MS);
        // We'll spawn in render() where we have canvas dims
      }
    } else {
      _spawnAccum = 0;
    }
    _sprayPrev = spraying;

    // Age + gravity-creep existing drops
    for (var i = _drops.length - 1; i >= 0; i--) {
      var dr = _drops[i];
      dr.life -= d;
      if (dr.life <= 0) {
        // Evaporate → leave stain
        if (dr.r > 4) {
          _stains.push({
            x: dr.x, y: dr.y,
            r: dr.r * 0.9,
            life: STAIN_LINGER_SEC
          });
        }
        _drops.splice(i, 1);
        continue;
      }
      // Gravity creep + wobble
      dr.y += GRAVITY_CREEP * d;
      dr.x += Math.sin(_timeSec * 1.3 + dr.seed) * 0.3;
      // Evaporation shrink
      var lifeFrac = dr.life / dr.maxLife;
      dr.r = dr.r0 * (EVAP_SHRINK + (1 - EVAP_SHRINK) * lifeFrac);
    }

    // Age stains
    for (var j = _stains.length - 1; j >= 0; j--) {
      _stains[j].life -= d;
      if (_stains[j].life <= 0) _stains.splice(j, 1);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ── Light snapshot builder ──
  // ══════════════════════════════════════════════════════════════

  /** Call once per frame before render, passing camera state so we can
   *  project Lighting sources to screen-space for the light-catch. */
  function buildLightSnapshot(w, h, camX, camY, camDir) {
    _lightSnapshot = [];
    if (typeof Lighting === 'undefined' || !Lighting.getFlickerLights) return;
    if (typeof Raycaster === 'undefined' || !Raycaster.projectWorldToScreen) return;

    var now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    var lights = Lighting.getFlickerLights(now);
    if (!lights) return;

    var camFX = Math.cos(camDir);
    var camFY = Math.sin(camDir);

    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      var relX = L.emitterWX - camX;
      var relY = L.emitterWY - camY;
      // Behind-camera cull
      if (relX * camFX + relY * camFY <= 0) continue;

      var srcTileX = Math.floor(L.emitterWX);
      var srcTileY = Math.floor(L.emitterWY);
      var proj = Raycaster.projectWorldToScreen(srcTileX, srcTileY, camX, camY, camDir, 0.5, 0.3);
      if (!proj) continue;
      if (proj.dist > 14) continue;

      var pxS = (proj.canvasW > 0) ? (w / proj.canvasW) : 1;
      var pyS = (proj.canvasH > 0) ? (h / proj.canvasH) : 1;

      // Rescale from Lighting's dark-overlay tint to bright warm hue
      // (same logic as LightOrbs._getOrbSprite)
      var maxC = Math.max(1, L.r, L.g, L.b);
      var sc = 255 / maxC;
      var br = Math.min(255, Math.round(L.r * sc));
      var bg = Math.min(255, Math.round(L.g * sc * 0.85 + 40));
      var bb = Math.min(255, Math.round(L.b * sc * 0.70 + 20));

      var orbRadius = 105 * (1 / Math.max(0.6, proj.dist * 0.45));
      if (orbRadius > 340) orbRadius = 340;

      _lightSnapshot.push({
        x: proj.screenX * pxS,
        y: (proj.screenY + proj.scaleH * 0.25) * pyS,
        r: br, g: bg, b: bb,
        alpha: L.peakA,
        radius: orbRadius
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ── Render ──
  // ══════════════════════════════════════════════════════════════

  /**
   * Call AFTER LightOrbs.render() and weather overlays.
   * Two passes: carry tint (source-over), then wet spatter.
   */
  function render(ctx, w, h) {
    if (!_enabled) return;

    // ── 1. Carry tint ──────────────────────────────────────────
    if (_carryAlpha > 0.001) {
      var pulse = Math.sin(_timeSec * CARRY_PULSE_FREQ * Math.PI * 2) * CARRY_PULSE_AMP;
      var a = Math.max(0, Math.min(CARRY_ALPHA_MAX, _carryAlpha + pulse));
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(' + CARRY_R + ',' + CARRY_G + ',' + CARRY_B + ',' + a.toFixed(4) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // ── 2. Spawn deferred drops (need w/h) ─────────────────────
    var spraying = (typeof SpraySystem !== 'undefined' && SpraySystem.isActive && SpraySystem.isActive());
    var depth = _getDepth();
    if (spraying && depth >= 2 && _enabled) {
      // Spawn based on time debt accumulated in tick()
      // Simple: one drop per render call while spraying, throttled by pool cap
      if (_drops.length < MAX_DROPS && Math.random() < 0.35) {
        _spawnDrop(w, h);
      }
    }

    // ── 3. Stains (fading wet rings) ───────────────────────────
    if (_stains.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (var s = 0; s < _stains.length; s++) {
        var st = _stains[s];
        var stAlpha = STAIN_ALPHA * (st.life / STAIN_LINGER_SEC);
        if (stAlpha < 0.002) continue;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120,170,210,' + stAlpha.toFixed(4) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── 4. Active drops ────────────────────────────────────────
    if (_drops.length === 0) return;

    ctx.save();
    for (var i = 0; i < _drops.length; i++) {
      var dr = _drops[i];
      var lifeFrac = dr.life / dr.maxLife;

      // ── Drop body: translucent blue-grey lens blob ──
      var bodyAlpha = 0.12 * lifeFrac;
      var grad = ctx.createRadialGradient(
        dr.x, dr.y, 0,
        dr.x, dr.y, dr.r
      );
      grad.addColorStop(0.0, 'rgba(160,200,230,' + (bodyAlpha * 1.4).toFixed(4) + ')');
      grad.addColorStop(0.4, 'rgba(130,175,210,' + (bodyAlpha * 0.9).toFixed(4) + ')');
      grad.addColorStop(0.7, 'rgba(100,150,190,' + (bodyAlpha * 0.4).toFixed(4) + ')');
      grad.addColorStop(1.0, 'rgba(80,130,170,0)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(dr.x, dr.y, dr.r, 0, Math.PI * 2);
      ctx.fill();

      // ── Rim highlight: thin bright ring at the drop edge ──
      ctx.beginPath();
      ctx.arc(dr.x, dr.y, dr.r * 0.85, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,220,240,' + (bodyAlpha * 0.6).toFixed(4) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── Light-catch specular ──
      // If this drop is within a LightOrbs' footprint, paint a small
      // additive highlight inside the drop tinted by the orb's warm
      // RGB. This makes the drops "reflect" nearby torches/hearths —
      // the key visual that distinguishes live spatter from stagnant
      // cellar atmosphere.
      if (dr.light && dr.light.a > 0.01) {
        var lc = dr.light;
        var catchR = dr.r * LIGHT_CATCH_RADIUS_FRAC;
        // Offset the specular up-left slightly (fake refraction)
        var catchX = dr.x - dr.r * 0.18;
        var catchY = dr.y - dr.r * 0.22;
        var catchAlpha = lc.a * lifeFrac;

        ctx.globalCompositeOperation = 'lighter';
        var lcGrad = ctx.createRadialGradient(
          catchX, catchY, 0,
          catchX, catchY, catchR
        );
        lcGrad.addColorStop(0.0, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',' + (catchAlpha * 0.9).toFixed(4) + ')');
        lcGrad.addColorStop(0.6, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',' + (catchAlpha * 0.3).toFixed(4) + ')');
        lcGrad.addColorStop(1.0, 'rgba(' + lc.r + ',' + lc.g + ',' + lc.b + ',0)');
        ctx.fillStyle = lcGrad;
        ctx.beginPath();
        ctx.arc(catchX, catchY, catchR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════
  // ── Public API ──
  // ══════════════════════════════════════════════════════════════

  function setEnabled(b) { _enabled = !!b; }
  function isEnabled()   { return _enabled; }
  function clear() {
    _drops = [];
    _stains = [];
    _spawnAccum = 0;
    _carryAlpha = 0;
    _lightSnapshot = [];
  }

  return Object.freeze({
    tick:               tick,
    buildLightSnapshot: buildLightSnapshot,
    render:             render,
    setEnabled:         setEnabled,
    isEnabled:          isEnabled,
    clear:              clear
  });
})();

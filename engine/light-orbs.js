/**
 * LightOrbs — Volumetric-spoof halation tied to Lighting's canonical
 *             per-frame snapshot.
 *
 * This module is one of three consumers of Lighting.getFlickerLights():
 *
 *   1. Floor cone/ring/disc pass (raycaster-floor.js) — paints warm
 *      additive light on the ground per-pixel, shape-modulated.
 *   2. Grid lightmap (lighting.js calculate()) — tints wall pixels at
 *      a damped amplitude so multi-torch corridors don't pulse.
 *   3. LightOrbs (this file) — paints an additive halation orb over
 *      each source at its on-screen position plus a smaller scatter
 *      orb lerped toward the screen centre, reading as volumetric
 *      light scattering toward the viewer.
 *
 * All three share: flicker phase (peakA in the snapshot), warm RGB
 * (tint-resolved in the snapshot), and the emitter world point
 * (emitterWX/emitterWY — source centre pushed 0.15 along the
 * walkable-face normal for wall-mounted torches so the orb lands in
 * open air in front of the flame, not inside the wall tile).
 *
 * Perf notes:
 *   - Orb sprite is pre-cached once at first render into a 64×64
 *     offscreen canvas. drawImage scales it per orb; no per-frame
 *     createRadialGradient or fillRect-with-gradient allocation.
 *   - Behind-camera cull via dot product before projectWorldToScreen.
 *   - Two draws per source (main + scatter). Typical scene with 4–6
 *     visible emitters: ~8–12 drawImage calls, each ≤ 80 px wide.
 *
 * Layer 2. Depends on Lighting, Raycaster.projectWorldToScreen, and
 * optionally WeatherSystem / SpatialContract for atmosphere modifiers.
 */
var LightOrbs = (function () {
  'use strict';

  // ── Tunables ─────────────────────────────────────────────────────
  var BASE_RADIUS_PX       = 140;  // orb radius at dist=1
  var MAX_RADIUS_PX        = 360;  // hard cap near the camera
  var MIN_RADIUS_PX        = 6;    // below this skip the orb
  var MIN_ALPHA            = 0.02; // below this skip
  var ALPHA_BOOST          = 3.8;  // lighter-compositing multiplier
  var RENDER_DIST          = 14;   // tiles
  var SCATTER_LERP         = 0.40; // main → screen-centre lerp fraction
  var SCATTER_ALPHA_MUL    = 0.55; // scatter orb dimmer than main
  var SCATTER_RADIUS_MUL   = 0.65; // scatter orb smaller than main
  var DAY_DIM              = 0.25;
  var DUSK_DIM             = 0.70;
  var NIGHT_DIM            = 1.00;
  var DAWN_DIM             = 0.55;

  // Per-kind profile — radius and alpha multipliers only. Colour comes
  // from the snapshot (Lighting tint). Keeping the profile small avoids
  // re-introducing the flicker/colour duplication that disconnected
  // the orbs from the floor cone in the old implementation.
  var _KIND = {
    torch:   { radiusMul: 1.0, alphaMul: 0.85, yOffset: 0.35 },
    bonfire: { radiusMul: 1.8, alphaMul: 1.00, yOffset: 0.40 },
    hearth:  { radiusMul: 1.6, alphaMul: 0.95, yOffset: 0.30 },
    lantern: { radiusMul: 0.7, alphaMul: 0.75, yOffset: 0.15 },
    brazier: { radiusMul: 1.4, alphaMul: 0.90, yOffset: 0.30 }
  };

  var _WEATHER = {
    clear:          { spread: 1.00, alpha: 1.00 },
    boardwalk_wind: { spread: 1.10, alpha: 0.90 },
    lantern_haze:   { spread: 1.30, alpha: 0.90 },
    indoor_dust:    { spread: 1.20, alpha: 0.95 },
    hearth_smoke:   { spread: 1.60, alpha: 0.70 },
    cellar_drip:    { spread: 1.35, alpha: 0.80 },
    dungeon_dust:   { spread: 1.45, alpha: 0.85 },
    light_rain:     { spread: 1.40, alpha: 0.75 },
    heavy_rain:     { spread: 1.70, alpha: 0.55 }
  };

  var _DEPTH = {
    1: { spread: 0.85, alpha: 0.90 },
    2: { spread: 1.15, alpha: 1.05 },
    3: { spread: 1.35, alpha: 1.15 }
  };

  // ── State ────────────────────────────────────────────────────────
  var _enabled = true;
  var _timeSec = 0;
  var _activeCount = 0;
  var _spriteCache = {};  // "r,g,b" → 64×64 pre-tinted canvas
  var _debug = false;
  var _diag = { snapshot: 0, culledBehind: 0, projFail: 0,
                culledDist: 0, culledOcc: 0, culledAlpha: 0,
                culledOffscreen: 0, drawn: 0 };

  // ── Helpers ──────────────────────────────────────────────────────

  /**
   * Lazy per-tint orb sprite cache. At most ~5 entries (one per
   * Lighting.TINT palette index). Each entry is a 64×64 pre-rendered
   * radial gradient baked with the warm RGB. Render path: one
   * drawImage per orb (hardware-accelerated) instead of allocating
   * a gradient + stopping + fillRect on every frame per source.
   */
  function _getOrbSprite(r, g, b) {
    var key = r + ',' + g + ',' + b;
    var cached = _spriteCache[key];
    if (cached) return cached;
    // Lighting's _TINT_RGB palette stores darkness-OVERLAY colours
    // ([40,18,4] for WARM, etc.) — near-black values designed to
    // subtract into the fog tint. For additive orb painting we need
    // the bright hue those overlays represent. Re-scale so the max
    // channel hits ~255 while preserving hue ratios, then bias a
    // little toward the original warm balance so the tint stays
    // amber rather than shifting toward white.
    var maxC = Math.max(1, r, g, b);
    var scale = 255 / maxC;
    // Saturation preservation: lift toward full-bright but keep
    // colder channels at proportionally lower values.
    var br = Math.min(255, Math.round(r * scale));
    var bg = Math.min(255, Math.round(g * scale * 0.85 + 40));
    var bb = Math.min(255, Math.round(b * scale * 0.70 + 20));
    var SZ = 64;
    var c = document.createElement('canvas');
    c.width = SZ; c.height = SZ;
    var x = c.getContext('2d');
    var rgb = br + ',' + bg + ',' + bb;
    var grad = x.createRadialGradient(SZ/2, SZ/2, 0, SZ/2, SZ/2, SZ/2);
    grad.addColorStop(0.00, 'rgba(' + rgb + ',1.00)');
    grad.addColorStop(0.18, 'rgba(' + rgb + ',0.75)');
    grad.addColorStop(0.45, 'rgba(' + rgb + ',0.32)');
    grad.addColorStop(0.75, 'rgba(' + rgb + ',0.10)');
    grad.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, SZ, SZ);
    _spriteCache[key] = c;
    return c;
  }

  function _getDepth() {
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
      return _WEATHER.clear;
    }
    var p = WeatherSystem.getPresetName();
    return _WEATHER[p] || _WEATHER.clear;
  }

  // ── Public API ───────────────────────────────────────────────────

  function tick(dt) {
    var d = dt || 16;
    if (d > 3) d = d / 1000;
    _timeSec += d;
  }

  /**
   * Render all visible orbs. Consume Lighting.getFlickerLights(now) so
   * flicker/colour/emitter-point match the floor cone and grid lightmap.
   */
  function render(ctx, w, h, camX, camY, camDir) {
    _activeCount = 0;
    if (_debug) {
      _diag.snapshot = 0; _diag.culledBehind = 0; _diag.projFail = 0;
      _diag.culledDist = 0; _diag.culledOcc = 0; _diag.culledAlpha = 0;
      _diag.culledOffscreen = 0; _diag.drawn = 0;
    }
    if (!_enabled) return;
    if (typeof Lighting === 'undefined' || !Lighting.getFlickerLights) return;
    if (typeof Raycaster === 'undefined' || !Raycaster.projectWorldToScreen) return;

    var now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    var lights = Lighting.getFlickerLights(now);
    if (_debug) _diag.snapshot = lights ? lights.length : 0;
    if (!lights || !lights.length) {
      if (_debug) console.log('[LightOrbs] empty snapshot');
      return;
    }

    var depth = _getDepth();
    var depthMod = _DEPTH[depth] || _DEPTH[1];
    var weatherMod = _getWeatherMod();
    var phaseDim = _getPhaseDim();
    var phaseMul = (depth === 1) ? phaseDim : 1.0;

    // Camera forward vector for behind-camera cull (cheap dot product
    // before the more expensive projectWorldToScreen call).
    var camFX = Math.cos(camDir);
    var camFY = Math.sin(camDir);

    var halfW = w * 0.5;
    var halfH = h * 0.5;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      var kindProf = _KIND[L.kind] || _KIND.torch;

      // ── Behind-camera cull ────────────────────────────────────
      var relX = L.emitterWX - camX;
      var relY = L.emitterWY - camY;
      if (relX * camFX + relY * camFY <= 0.05) {
        if (_debug) _diag.culledBehind++;
        continue;
      }

      // ── Project emitter ─────────────────────────────────────
      // Try the raycaster's projection first (gives us zbuf spans for
      // occlusion + matches sprite positioning conventions). If it
      // returns null (off-FOV by a hair, too close, or RENDER_DIST > 16
      // internal cap), fall back to direct screen-space projection so
      // wide-angle wall torches still halate the peripheral edge.
      var srcTileX = Math.floor(L.emitterWX);
      var srcTileY = Math.floor(L.emitterWY);
      var proj = Raycaster.projectWorldToScreen(
        srcTileX, srcTileY,
        camX, camY, camDir, 0.5, kindProf.yOffset
      );

      var projDist, posX, posY, startCol, endCol, canvasW, canvasH, scaleH;

      if (proj) {
        projDist = proj.dist;
        if (projDist > RENDER_DIST) {
          if (_debug) _diag.culledDist++;
          continue;
        }
        startCol = proj.startCol;
        endCol   = proj.endCol;
        canvasW  = proj.canvasW;
        canvasH  = proj.canvasH;
        scaleH   = proj.scaleH;
        var pxScaleA = (canvasW && canvasW > 0) ? (w / canvasW) : 1;
        var pyScaleA = (canvasH && canvasH > 0) ? (h / canvasH) : 1;
        posX = proj.screenX * pxScaleA;
        posY = (proj.screenY + scaleH * 0.25) * pyScaleA;
      } else {
        // Fallback projection — the source is in front of the camera
        // (we already dot-product culled), but projectWorldToScreen
        // declined for FOV/distance reasons. Compute screen coords
        // ourselves using the same tan-based mapping the DDA uses, so
        // the halation still paints into peripheral columns. No zbuf
        // span is available — we'll take the sample at the centre
        // column of the screen below.
        var exDx = (srcTileX + 0.5) - camX;
        var exDy = (srcTileY + 0.5) - camY;
        var exDist = Math.sqrt(exDx * exDx + exDy * exDy);
        if (exDist < 0.05) {
          if (_debug) _diag.projFail++;
          continue;
        }
        if (exDist > RENDER_DIST) {
          if (_debug) _diag.culledDist++;
          continue;
        }
        var exAngle = Math.atan2(exDy, exDx) - camDir;
        while (exAngle >  Math.PI) exAngle -= 2 * Math.PI;
        while (exAngle < -Math.PI) exAngle += 2 * Math.PI;
        // Half-FOV ≈ 0.523 rad (Raycaster uses ~60° FOV). Allow slop.
        var HALFFOV = 0.60;
        if (Math.abs(exAngle) > HALFFOV + 0.5) {
          if (_debug) _diag.projFail++;
          continue;
        }
        var tanHF = Math.tan(HALFFOV);
        posX = halfW + (Math.tan(exAngle) / tanHF) * halfW;
        var yShift = kindProf.yOffset ? (kindProf.yOffset / exDist) * h : 0;
        posY = halfH + yShift;
        projDist = exDist;
        startCol = null;
        endCol = null;
        scaleH = Math.floor(h * (0.5 / exDist));
      }

      // ── Occlusion: tolerant zbuffer check across spanned cols ─
      // Torches sit on wall tiles whose DDA ray lands at the wall
      // face; strict zbuf > dist would cull them. Accept if any
      // column along the sprite span shows clearance >= dist − 1.0.
      // Generous tolerance covers flush-wall torches, recessed niches
      // (recessD up to 0.22), and dir-offset emitters (0.15 push).
      var zbuf = Raycaster.getZBuffer ? Raycaster.getZBuffer() : null;
      if (zbuf && startCol != null && endCol != null) {
        var tolerant = false;
        var endC = Math.min(endCol, zbuf.length - 1);
        var startC = Math.max(startCol, 0);
        for (var c = startC; c <= endC; c++) {
          if (zbuf[c] >= projDist - 1.0) { tolerant = true; break; }
        }
        if (!tolerant) {
          if (_debug) _diag.culledOcc++;
          continue;
        }
      }

      // proj.dist compatibility alias for downstream radius/alpha code
      proj = { dist: projDist, scaleH: scaleH };

      // ── Radius and alpha (flicker shared with floor cone) ────
      var distFalloff = 1 / (1 + proj.dist * 0.25);
      var alpha = L.peakA * kindProf.alphaMul
                * weatherMod.alpha * depthMod.alpha * phaseMul
                * distFalloff * ALPHA_BOOST;
      if (alpha < MIN_ALPHA) {
        if (_debug) _diag.culledAlpha++;
        continue;
      }
      if (alpha > 1) alpha = 1;

      var radius = BASE_RADIUS_PX
                 * kindProf.radiusMul
                 * weatherMod.spread
                 * depthMod.spread
                 * (1 / Math.max(0.6, proj.dist * 0.45));
      // Flicker also scales radius subtly (peakA is ~0.68–0.92 for torch)
      radius *= (0.85 + 0.3 * L.peakA);
      if (radius > MAX_RADIUS_PX) radius = MAX_RADIUS_PX;
      if (radius < MIN_RADIUS_PX) continue;

      // Off-screen cull with radius padding
      if (posX < -radius || posX > w + radius ||
          posY < -radius || posY > h + radius) {
        if (_debug) _diag.culledOffscreen++;
        continue;
      }
      if (_debug) _diag.drawn++;

      // ── Main orb ─────────────────────────────────────────────
      // Pre-tinted sprite lookup keyed by L.r/L.g/L.b. The cache has
      // at most one entry per Lighting.TINT palette index (~5 total).
      var orb = _getOrbSprite(L.r, L.g, L.b);
      var d = radius * 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(orb, posX - radius, posY - radius, d, d);

      // ── Volumetric scatter tail ──────────────────────────────
      // Smaller, dimmer orb lerped toward the screen centre. Reads
      // as haze-scattered light streaming toward the viewer. Off-
      // axis sources get a visible tail; on-axis sources (emitter
      // near screen centre) have near-zero offset so the two orbs
      // stack and the source just reads as brighter.
      var sLerp = SCATTER_LERP * weatherMod.spread;
      var scX = posX + (halfW - posX) * sLerp;
      var scY = posY + (halfH - posY) * sLerp;
      var scR = radius * SCATTER_RADIUS_MUL;
      var scA = alpha  * SCATTER_ALPHA_MUL;
      if (scR >= MIN_RADIUS_PX && scA >= MIN_ALPHA) {
        var sd = scR * 2;
        ctx.globalAlpha = scA;
        ctx.drawImage(orb, scX - scR, scY - scR, sd, sd);
      }

      _activeCount++;
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function setEnabled(b) { _enabled = !!b; }
  function isEnabled()   { return _enabled; }
  function getActiveCount() { return _activeCount; }
  function reset() { _activeCount = 0; }

  // Toggle a per-frame console trace + populate getDiag() output.
  // Usage: LightOrbs.setDebug(true); then check the console or call
  //        LightOrbs.getDiag() after a frame.
  function setDebug(b) { _debug = !!b; }
  function getDiag() { return _diag; }

  return Object.freeze({
    tick:           tick,
    render:         render,
    setEnabled:     setEnabled,
    setDebug:       setDebug,
    isEnabled:      isEnabled,
    getActiveCount: getActiveCount,
    getDiag:        getDiag,
    reset:          reset
  });
})();

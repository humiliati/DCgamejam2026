/**
 * Lighting — per-tile light map with dynamic point light sources.
 * Player torch + positioned emitters (bonfire, hearth, terminal, electric).
 * Flicker animation per source. Color tint palette per source.
 *
 * Phase 1 + 1d of LIGHT_AND_TORCH_ROADMAP.
 * Full EyesOnly LightingSystem extraction deferred to S1.
 */
var Lighting = (function () {
  'use strict';

  // ── Tint palette ──────────────────────────────────────────────
  // Each tint shifts the raycaster darkness overlay toward a color.
  // Index 0 = neutral (no shift). Higher indices = colored light.
  // The RGB values are the overlay color at full tint intensity.
  //
  // Raycaster reads these via getTintRGB().

  var TINT = {
    NONE:           0,   // Neutral white — player torch, electric ceiling lights
    WARM:           1,   // Amber/orange — torches, bonfires, hearths, fire hazards
    SICKLY:         2,   // CRT green — terminals, data screens, sickly glow
    DUNGEON_HEARTH: 3,   // Cool blue-grey — dungeon fire fighting cold stone
    HOME_HEARTH:    4    // Golden amber — safe hearth, warm home glow
  };

  // Overlay RGB at full tint intensity (raycaster multiplies by tintMap value)
  var _TINT_RGB = [
    [0,  0,  0 ],   // NONE — darkness is pure black
    [40, 18, 4 ],   // WARM — amber shift in darkness
    [8,  32, 12],   // SICKLY — green-tinted darkness
    [12, 14, 28],   // DUNGEON_HEARTH — cold blue-grey base, fire barely wins
    [50, 24, 6 ]    // HOME_HEARTH — golden amber, high R = safe/warm read
  ];

  // ── Flicker tunables (Lighting Test-Harness §1) ────────────────
  // Lifted from hardcoded values in _flicker() so the harness can tune.
  var _FLICKER_FREQ = {
    torch:          18.85,  // rad/s (~3 Hz visible shimmer)
    bonfire_slow:    6.28,  // rad/s (~1 Hz slow pulse)
    bonfire_fast:   31.40,  // rad/s fast shimmer overlay
    hearth_primary: 31.40,  // rad/s nervous stutter primary
    hearth_second:  47.10,  // rad/s erratic secondary harmonic
    hearth_third:   11.00,  // rad/s low-freq wobble
    steady:          0.00   // no flicker
  };

  var _FLICKER_AMP = {
    torch:          0.15,   // ±15% of base intensity
    bonfire_slow:   0.10,
    bonfire_fast:   0.03,
    hearth_primary: 0.18,
    hearth_second:  0.06,
    hearth_third:   0.04
  };

  // Tint palette RGB — mutable copies for harness tuning.
  // _TINT_RGB above is the public reference; keep both in sync.
  // (We mutate _TINT_RGB entries in-place so getTintRGB callers get
  // updated values without re-querying.)

  var _GRID_LIGHTMAP_RADIUS = 6;  // alias; _playerLightRadius starts here
  var _FALLOFF_EXPONENT     = 2;  // 1 = linear, 2 = quadratic (default)
  var _WALL_DARKNESS_MUL    = 1.0;  // multiplier on unlit wall shading

  // ── State ──────────────────────────────────────────────────────
  var _lightMap = null;   // Float32Array[] — brightness per tile (0–1)
  var _tintStr  = null;   // Float32Array[] — tint intensity per tile (0–1)
  var _tintId   = null;   // Uint8Array[]   — tint palette index per tile
  var _playerLightRadius = _GRID_LIGHTMAP_RADIUS;
  var _lightSources = []; // { x, y, radius, intensity, tint, flickerType, _seed }
  var _gridW = 0;
  var _gridH = 0;

  // ── Light source registry ─────────────────────────────────────

  /**
   * Resolve tint string/number to palette index.
   */
  function _resolveTint(v) {
    if (typeof v === 'number') return v;
    switch (v) {
      case 'warm':           return TINT.WARM;
      case 'sickly':         return TINT.SICKLY;
      case 'dungeon_hearth': return TINT.DUNGEON_HEARTH;
      case 'home_hearth':    return TINT.HOME_HEARTH;
      default:               return TINT.NONE;
    }
  }

  /**
   * Register a positioned light source.
   * @param {number} x       - tile X
   * @param {number} y       - tile Y
   * @param {number} radius  - light reach in tiles
   * @param {number} intensity - peak brightness (0–1)
   * @param {Object} [opts]
   * @param {string|number} [opts.tint='none'] - 'none'|'warm'|'sickly' or TINT index
   * @param {number} [opts.warmth]  - DEPRECATED: >0 maps to tint 'warm'
   * @param {string} [opts.flicker='none'] - 'none' | 'torch' | 'bonfire' | 'steady'
   * @param {string} [opts.kind] - 'torch' | 'bonfire' | 'hearth' | 'lantern' | 'brazier' (LightOrbs profile hint)
   * @param {boolean} [opts.gaze] - true if this source is tied to a gazing sprite (bonfire/hearth eye)
   */
  function addLightSource(x, y, radius, intensity, opts) {
    opts = opts || {};
    // Backward compat: warmth > 0 maps to WARM tint
    var tint = opts.tint !== undefined ? _resolveTint(opts.tint)
      : (opts.warmth && opts.warmth > 0 ? TINT.WARM : TINT.NONE);
    var flicker = opts.flicker || 'none';
    // Infer LightOrbs kind from flicker + tint. Tint wins when it's
    // unambiguously warm (home/dungeon hearth) because 'steady' flicker
    // is shared between terminals (cool lantern) and hearths (warm disc).
    var kind = opts.kind;
    if (!kind) {
      var tintStr = (typeof opts.tint === 'string') ? opts.tint : '';
      if (flicker === 'bonfire') kind = 'bonfire';
      else if (flicker === 'hearth-dungeon') kind = 'hearth';
      else if (tintStr === 'home_hearth' || tintStr === 'dungeon_hearth') kind = 'hearth';
      else if (flicker === 'torch') kind = 'torch';
      else if (flicker === 'steady') kind = 'lantern';
      else kind = 'torch';
    }
    var gaze = (opts.gaze === true) || (kind === 'bonfire' || kind === 'hearth');
    // Shape for dynamic floor illumination pass:
    //   'cone' — wall-mounted directional source (torch), needs opts.dir
    //   'ring' — annular glow peaking at band radius (bonfire, brazier)
    //   'disc' — omnidirectional radial falloff (hearth, lantern, default)
    // Shape is separate from the per-tile lightmap, which always uses
    // radial falloff — this only governs the floor-pixel glow pass.
    var shape = opts.shape;
    if (!shape) {
      if (kind === 'torch')   shape = 'cone';
      else if (kind === 'bonfire' || kind === 'brazier') shape = 'ring';
      else                    shape = 'disc';
    }
    var dir = opts.dir || null;  // {x, y} unit vector, walls-into-walkable
    _lightSources.push({
      x: x,
      y: y,
      radius: radius,
      intensity: Math.min(1, Math.max(0, intensity)),
      tint: tint,
      flickerType: flicker,
      kind: kind,
      gaze: gaze,
      shape: shape,
      dir: dir,
      _seed: _lightSources.length * 137 + 42
    });
  }

  /**
   * Per-frame snapshot of dynamic lights, with flicker precomputed.
   * Called by the floor caster once per frame. Returns a compact list:
   *   { wx, wy, r, g, b, radius, peakA, shape, dx, dy }
   * where peakA already includes the flicker multiplier and intensity,
   * and (r, g, b) is the warm tint colour the floor pass should add.
   * Caller-allocates nothing — returns the shared internal buffer.
   */
  var _lightSnapshot = [];
  function getFlickerLights(now) {
    _lightSnapshot.length = 0;
    var t = (now || 0) * 0.001;
    for (var i = 0; i < _lightSources.length; i++) {
      var src = _lightSources[i];
      // Skip neutral sources — floor pass only paints coloured light.
      if (src.tint === TINT.NONE) continue;
      var fM = _flicker(src, t);
      // Torch: radius held steady (matches grid lightmap behaviour).
      var eR = (src.flickerType === 'torch') ? src.radius : src.radius * fM;
      var peak = src.intensity * fM;
      if (peak <= 0.02 || eR <= 0.05) continue;
      var rgb = _TINT_RGB[src.tint] || _TINT_RGB[0];
      // Emitter point: tile centre for omnidirectional sources, pushed
      // 0.15 along the walkable-face normal for wall-mounted torches so
      // the orb renders in open air in front of the flame instead of
      // inside the wall tile.
      var emWX = src.x + 0.5;
      var emWY = src.y + 0.5;
      if (src.dir) {
        emWX += src.dir.x * 0.15;
        emWY += src.dir.y * 0.15;
      }
      _lightSnapshot.push({
        wx: src.x + 0.5, wy: src.y + 0.5,
        emitterWX: emWX, emitterWY: emWY,
        r: rgb[0], g: rgb[1], b: rgb[2],
        radius: eR,
        peakA: peak,
        kind: src.kind,
        flickerType: src.flickerType,
        shape: src.shape || 'disc',
        dx: src.dir ? src.dir.x : 0,
        dy: src.dir ? src.dir.y : 0
      });
    }
    return _lightSnapshot;
  }

  /**
   * Remove first light source at tile (x, y).
   */
  function removeLightSource(x, y) {
    for (var i = _lightSources.length - 1; i >= 0; i--) {
      if (_lightSources[i].x === x && _lightSources[i].y === y) {
        _lightSources.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Remove all light sources (call on floor change).
   */
  function clearLightSources() {
    _lightSources.length = 0;
  }

  // ── Flicker ───────────────────────────────────────────────────

  /**
   * Compute radius multiplier for flicker animation.
   * @param {Object} src - light source
   * @param {number} t   - time in seconds
   * @returns {number} multiplier ~0.7–1.15
   */
  function _flicker(src, t) {
    var s = src._seed;
    switch (src.flickerType) {
      case 'torch':
        // Visible torch shimmer ~3Hz, ±15%. This is the "raw" curve used
        // for the flame sprite glow (torch-niche.js) and the dynamic
        // floor-cone pass (raycaster-floor.js) — both of which SHOULD
        // pulse visibly with the flame.
        //
        // The grid lightmap path (calculate()) further damps this to
        // ±6% and holds radius steady, so adjacent wall textures don't
        // pulse when several torches share a corridor.
        return (1.0 - _FLICKER_AMP.torch) + _FLICKER_AMP.torch * Math.sin(t * _FLICKER_FREQ.torch + s);
      case 'bonfire':
        // Slow pulse ~1Hz ±10%, plus subtle fast shimmer
        return (1.0 - _FLICKER_AMP.bonfire_slow) + _FLICKER_AMP.bonfire_slow * Math.sin(t * _FLICKER_FREQ.bonfire_slow + s)
                     + _FLICKER_AMP.bonfire_fast * Math.sin(t * _FLICKER_FREQ.bonfire_fast + s * 2);
      case 'hearth-dungeon':
        // Nervous stutter — 5Hz primary + erratic secondary harmonic.
        // Reads as a fire fighting a draft, unsafe and sputtering.
        return (1.0 - _FLICKER_AMP.hearth_primary - _FLICKER_AMP.hearth_second) + _FLICKER_AMP.hearth_primary * Math.sin(t * _FLICKER_FREQ.hearth_primary + s)
                     + _FLICKER_AMP.hearth_second * Math.sin(t * _FLICKER_FREQ.hearth_second + s * 3)
                     + _FLICKER_AMP.hearth_third * Math.sin(t * _FLICKER_FREQ.hearth_third + s * 7);
      case 'steady':
      case 'none':
      default:
        return 1.0;
    }
  }

  // ── Lightmap calculation ──────────────────────────────────────

  /**
   * Rebuild the lightmap for a single frame.
   * @param {Object}  player - { x, y }
   * @param {Array[]} grid
   * @param {number}  gridW
   * @param {number}  gridH
   * @param {number}  [now=0] - performance.now() for flicker timing
   * @returns {Array[]} 2D brightness map (0–1 per tile)
   */
  function calculate(player, grid, gridW, gridH, now) {
    now = now || 0;
    _gridW = gridW;
    _gridH = gridH;

    // Allocate / resize maps
    if (!_lightMap || _lightMap.length !== gridH ||
        (_lightMap[0] && _lightMap[0].length !== gridW)) {
      _lightMap = [];
      _tintStr  = [];
      _tintId   = [];
      for (var a = 0; a < gridH; a++) {
        _lightMap[a] = new Float32Array(gridW);
        _tintStr[a]  = new Float32Array(gridW);
        _tintId[a]   = new Uint8Array(gridW);
      }
    }

    // Reset to ambient darkness
    for (var ry = 0; ry < gridH; ry++) {
      var lmRow = _lightMap[ry];
      var tsRow = _tintStr[ry];
      var tiRow = _tintId[ry];
      for (var rx = 0; rx < gridW; rx++) {
        lmRow[rx] = 0.05;
        tsRow[rx] = 0;
        tiRow[rx] = 0;
      }
    }

    // ── Player torch — neutral white radial falloff ─────────────
    var r = _playerLightRadius;
    var pxI = Math.floor(player.x);
    var pyI = Math.floor(player.y);
    var y0 = Math.max(0, pyI - r);
    var y1 = Math.min(gridH - 1, pyI + r);
    var x0 = Math.max(0, pxI - r);
    var x1 = Math.min(gridW - 1, pxI + r);
    var rSq = r * r;

    for (var ty = y0; ty <= y1; ty++) {
      var dy = ty - player.y;
      var dySq = dy * dy;
      var row = _lightMap[ty];
      for (var tx = x0; tx <= x1; tx++) {
        var dx = tx - player.x;
        var distSq = dx * dx + dySq;
        if (distSq > rSq) continue;

        var dist = Math.sqrt(distSq);
        var brightness = 1.0 - (dist / r);
        brightness *= brightness; // Quadratic falloff
        if (brightness > row[tx]) row[tx] = brightness;
      }
    }

    // ── Dynamic light sources ───────────────────────────────────
    var t = now * 0.001; // seconds for flicker

    for (var s = 0; s < _lightSources.length; s++) {
      var src = _lightSources[s];
      var flickMult = _flicker(src, t);
      // Torch: hold radius steady so edge-of-range tiles don't pop in/out
      // and cause adjacent walls to pulse. Also damp intensity flicker
      // to ~40% amplitude on the grid lightmap only — the full-amplitude
      // flicker is carried by the flame sprite glow (torch-niche.js) and
      // the floor cone pass (raycaster-floor.js via getFlickerLights).
      // Other flicker types (bonfire, hearth-dungeon) keep full mod.
      var _torchSteady = (src.flickerType === 'torch');
      var effRadius = _torchSteady ? src.radius : src.radius * flickMult;
      var _gridMult = _torchSteady ? (1 + (flickMult - 1) * 0.4) : flickMult;
      var effIntensity = src.intensity * _gridMult;
      var ir = Math.ceil(effRadius);
      var irSq = effRadius * effRadius;
      var srcTint = src.tint;

      var sy0 = Math.max(0, src.y - ir);
      var sy1 = Math.min(gridH - 1, src.y + ir);
      var sx0 = Math.max(0, src.x - ir);
      var sx1 = Math.min(gridW - 1, src.x + ir);

      for (var sy = sy0; sy <= sy1; sy++) {
        var sdy = sy - src.y;
        var sdySq = sdy * sdy;
        var lRow = _lightMap[sy];
        var tSRow = _tintStr[sy];
        var tIRow = _tintId[sy];

        for (var sx = sx0; sx <= sx1; sx++) {
          var sdx = sx - src.x;
          var sdSq = sdx * sdx + sdySq;
          if (sdSq > irSq) continue;

          var sDist = Math.sqrt(sdSq);
          var sBri = effIntensity * (1.0 - (sDist / effRadius));
          sBri *= sBri; // Quadratic falloff

          // Brightness: max wins (brightest source)
          if (sBri > lRow[sx]) lRow[sx] = sBri;

          // Tint: strongest tinted source wins at each tile
          if (srcTint > 0 && sBri > 0.03) {
            var tVal = sBri;
            if (tVal > tSRow[sx]) {
              tSRow[sx] = tVal;
              tIRow[sx] = srcTint;
            }
          }
        }
      }
    }

    return _lightMap;
  }

  // ── Accessors ─────────────────────────────────────────────────

  function setRadius(r) { _playerLightRadius = r; _GRID_LIGHTMAP_RADIUS = r; }
  function getMap() { return _lightMap; }

  /** @returns {Array[]} Float32Array[] — tint intensity per tile (0–1) */
  function getTintStrength() { return _tintStr; }

  /** @returns {Array[]} Uint8Array[] — tint palette index per tile */
  function getTintIndex() { return _tintId; }

  /** @returns {Array} RGB triplet for a tint palette index */
  function getTintRGB(idx) { return _TINT_RGB[idx] || _TINT_RGB[0]; }

  /** @returns {Object} TINT enum for callers */
  function getTintEnum() { return TINT; }

  function getSources() { return _lightSources; }

  // ── Backward compat ───────────────────────────────────────────
  // getWarmMap() returns tintStr for callers that haven't migrated.
  function getWarmMap() { return _tintStr; }

  // ── Accessors for downstream consumers (raycaster wall-darkness) ─
  function getWallDarknessMul() { return _WALL_DARKNESS_MUL; }
  function getFalloffExponent() { return _FALLOFF_EXPONENT; }

  // ── Tunable surface (Lighting Test-Harness §1) ────────────────

  function getTunables() {
    var tintRGB = [];
    for (var i = 0; i < _TINT_RGB.length; i++) {
      tintRGB.push([_TINT_RGB[i][0], _TINT_RGB[i][1], _TINT_RGB[i][2]]);
    }
    return {
      GRID_LIGHTMAP_RADIUS: _GRID_LIGHTMAP_RADIUS,
      FALLOFF_EXPONENT:     _FALLOFF_EXPONENT,
      WALL_DARKNESS_MUL:    _WALL_DARKNESS_MUL,
      FLICKER_FREQ:  {
        torch:          _FLICKER_FREQ.torch,
        bonfire_slow:   _FLICKER_FREQ.bonfire_slow,
        bonfire_fast:   _FLICKER_FREQ.bonfire_fast,
        hearth_primary: _FLICKER_FREQ.hearth_primary,
        hearth_second:  _FLICKER_FREQ.hearth_second,
        hearth_third:   _FLICKER_FREQ.hearth_third
      },
      FLICKER_AMP: {
        torch:          _FLICKER_AMP.torch,
        bonfire_slow:   _FLICKER_AMP.bonfire_slow,
        bonfire_fast:   _FLICKER_AMP.bonfire_fast,
        hearth_primary: _FLICKER_AMP.hearth_primary,
        hearth_second:  _FLICKER_AMP.hearth_second,
        hearth_third:   _FLICKER_AMP.hearth_third
      },
      TINT_RGB: tintRGB
    };
  }

  function setTunables(patch) {
    if (!patch || typeof patch !== 'object') return;
    if (patch.GRID_LIGHTMAP_RADIUS != null) {
      _GRID_LIGHTMAP_RADIUS = +patch.GRID_LIGHTMAP_RADIUS;
      _playerLightRadius    = _GRID_LIGHTMAP_RADIUS;
    }
    if (patch.FALLOFF_EXPONENT  != null) _FALLOFF_EXPONENT  = +patch.FALLOFF_EXPONENT;
    if (patch.WALL_DARKNESS_MUL != null) _WALL_DARKNESS_MUL = +patch.WALL_DARKNESS_MUL;
    // Flicker frequency overrides
    if (patch.FLICKER_FREQ && typeof patch.FLICKER_FREQ === 'object') {
      var ff = patch.FLICKER_FREQ;
      for (var fk in ff) {
        if (ff.hasOwnProperty(fk) && _FLICKER_FREQ.hasOwnProperty(fk)) {
          _FLICKER_FREQ[fk] = +ff[fk];
        }
      }
    }
    // Flicker amplitude overrides
    if (patch.FLICKER_AMP && typeof patch.FLICKER_AMP === 'object') {
      var fa = patch.FLICKER_AMP;
      for (var ak in fa) {
        if (fa.hasOwnProperty(ak) && _FLICKER_AMP.hasOwnProperty(ak)) {
          _FLICKER_AMP[ak] = +fa[ak];
        }
      }
    }
    // Tint palette RGB overrides — array of [r,g,b] by index
    if (patch.TINT_RGB && Array.isArray(patch.TINT_RGB)) {
      for (var ti = 0; ti < patch.TINT_RGB.length && ti < _TINT_RGB.length; ti++) {
        var t = patch.TINT_RGB[ti];
        if (Array.isArray(t) && t.length >= 3) {
          _TINT_RGB[ti][0] = +t[0];
          _TINT_RGB[ti][1] = +t[1];
          _TINT_RGB[ti][2] = +t[2];
        }
      }
    }
  }

  return {
    TINT:               TINT,
    TINT_RGB:           _TINT_RGB,
    calculate:          calculate,
    setRadius:          setRadius,
    getMap:             getMap,
    getWarmMap:         getWarmMap,
    getTintStrength:    getTintStrength,
    getTintIndex:       getTintIndex,
    getTintRGB:         getTintRGB,
    getTintEnum:        getTintEnum,
    getSources:         getSources,
    getFlickerLights:   getFlickerLights,
    addLightSource:     addLightSource,
    removeLightSource:  removeLightSource,
    clearLightSources:  clearLightSources,
    getWallDarknessMul: getWallDarknessMul,
    getFalloffExponent: getFalloffExponent,
    getTunables:        getTunables,
    setTunables:        setTunables
  };
})();

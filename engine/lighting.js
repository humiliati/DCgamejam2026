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
    NONE:    0,   // Neutral white — player torch, electric ceiling lights
    WARM:    1,   // Amber/orange — torches, bonfires, hearths, fire hazards
    SICKLY:  2    // CRT green — terminals, data screens, sickly glow
  };

  // Overlay RGB at full tint intensity (raycaster multiplies by tintMap value)
  var _TINT_RGB = [
    [0,  0,  0 ],   // NONE — darkness is pure black
    [40, 18, 4 ],   // WARM — amber shift in darkness
    [8,  32, 12]    // SICKLY — green-tinted darkness
  ];

  // ── State ──────────────────────────────────────────────────────
  var _lightMap = null;   // Float32Array[] — brightness per tile (0–1)
  var _tintStr  = null;   // Float32Array[] — tint intensity per tile (0–1)
  var _tintId   = null;   // Uint8Array[]   — tint palette index per tile
  var _playerLightRadius = 6;
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
      case 'warm':    return TINT.WARM;
      case 'sickly':  return TINT.SICKLY;
      default:        return TINT.NONE;
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
   */
  function addLightSource(x, y, radius, intensity, opts) {
    opts = opts || {};
    // Backward compat: warmth > 0 maps to WARM tint
    var tint = opts.tint !== undefined ? _resolveTint(opts.tint)
      : (opts.warmth && opts.warmth > 0 ? TINT.WARM : TINT.NONE);
    _lightSources.push({
      x: x,
      y: y,
      radius: radius,
      intensity: Math.min(1, Math.max(0, intensity)),
      tint: tint,
      flickerType: opts.flicker || 'none',
      _seed: _lightSources.length * 137 + 42
    });
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
        // Fast flicker ~3Hz, ±15%
        return 0.85 + 0.15 * Math.sin(t * 18.85 + s);
      case 'bonfire':
        // Slow pulse ~1Hz ±10%, plus subtle fast shimmer
        return 0.90 + 0.10 * Math.sin(t * 6.28 + s)
                     + 0.03 * Math.sin(t * 31.4 + s * 2);
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
      var effRadius = src.radius * flickMult;
      var effIntensity = src.intensity * flickMult;
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

  function setRadius(r) { _playerLightRadius = r; }
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
    addLightSource:     addLightSource,
    removeLightSource:  removeLightSource,
    clearLightSources:  clearLightSources
  };
})();

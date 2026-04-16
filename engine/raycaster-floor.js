/**
 * RaycasterFloor — floor-caster, parallax band, and terminus fog veil.
 *
 * Phase 2 of the raycaster extraction roadmap (see
 * docs/RAYCASTER_EXTRACTION_ROADMAP.md, EX-4).
 *
 * Owns:
 *   - _floorImgData / _floorBufW / _floorBufH — the floor row ImageData
 *     backing buffer (allocated on first call, resized on viewport change)
 *   - Grime tint constants (_GRIME_R/G/B) used by the floor grid tinting
 *     branch. Wall-column grime in raycaster.js uses the same constants
 *     — they are intentionally duplicated (3 ints) rather than cross-
 *     referenced via module boundary.
 *
 * Does NOT own:
 *   - _contract or _bloodFloorId — these live in Raycaster core. Access
 *     is via the lazy bind() getter pattern introduced in EX-3.
 *
 * Layer 2 — loaded after raycaster-projection.js, before raycaster.js.
 */
var RaycasterFloor = (function () {
  'use strict';

  // ── Grime tint constants (also in raycaster.js wall column) ──────
  var _GRIME_R = 82, _GRIME_G = 68, _GRIME_B = 46;

  // ── Module-local buffer state ────────────────────────────────────
  var _floorImgData = null;
  var _floorBufW = 0;
  var _floorBufH = 0;

  // ── Row-local light cull scratch buffer (PERF-1) ─────────────────
  // Reused across every row of every floor cast to avoid per-row
  // allocation. Grown on demand when a scene has more dynamic lights
  // than we've ever seen before. Entries are direct refs into the
  // Lighting module's flicker-light array — safe because that array is
  // only mutated at snapshot time (once per frame, before renderFloor).
  var _rowLights = [];
  var _rowLightsLen = 0;

  // ── State binding (installed by Raycaster IIFE) ──────────────────
  //   contract()       → active SpatialContract or null
  //   bloodFloorId()   → current CleaningSystem floor id or null
  var _s = null;

  function bind(getters) {
    _s = getters;
  }

  /**
   * Reset the floor ImageData backing buffer. Called from Raycaster's
   * resize path so the floor caster reallocates next frame.
   */
  function resetBuffer() {
    _floorImgData = null;
    _floorBufW = 0;
    _floorBufH = 0;
  }

  // ── Parallax band renderer ───────────────────────────────────────
  // Fills horizontal color bands at depth-derived rows. Used on exterior
  // FADE floors to paint distant silhouette layers behind the walls.
  function renderParallax(ctx, w, h, halfH, layers, playerDir) {
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      // Depth determines vertical position (closer to horizon = deeper)
      var bandY = Math.floor(halfH * (1 - layer.height * layer.depth));
      var bandH = Math.max(2, Math.floor(h * layer.height * 0.5));

      // Horizontal offset from player facing (subtle parallax scroll)
      // This makes layers feel "behind" the geometry
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, bandY, w, bandH);
    }
  }

  // ── Terminus fog veil (legacy fallback) ──────────────────────────
  // Draws a soft atmospheric gradient band centered on the horizon to
  // mask the floor/sky seam and soften wall pop-in at render distance.
  // Only active on exterior FADE floors when WeatherSystem is not loaded.
  // When WeatherSystem is present, it takes over this slot entirely via
  // renderBelow() and may draw additional parallax sprite layers.
  function renderWeatherVeil(ctx, w, h, halfH, fogColor) {
    var contract = _s ? _s.contract() : null;
    if (!contract || contract.fogModel !== 'fade' || !contract.terminusFog) return;
    var tf = contract.terminusFog;
    var tfOpacity = tf.opacity || 0;
    if (tfOpacity <= 0.01) return;

    var veilH = Math.floor(h * (tf.height || 0.15));
    var veilTop = Math.max(0, Math.floor(halfH) - veilH);
    var veilBot = Math.min(h, Math.floor(halfH) + veilH);
    var veilTotalH = veilBot - veilTop;
    if (veilTotalH <= 4) return;

    var r = fogColor.r, g = fogColor.g, b = fogColor.b;
    var mid = tfOpacity.toFixed(3);
    var side = (tfOpacity * 0.6).toFixed(3);
    var veilGrad = ctx.createLinearGradient(0, veilTop, 0, veilBot);
    veilGrad.addColorStop(0,    'rgba(' + r + ',' + g + ',' + b + ',0)');
    veilGrad.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',' + side + ')');
    veilGrad.addColorStop(0.5,  'rgba(' + r + ',' + g + ',' + b + ',' + mid + ')');
    veilGrad.addColorStop(0.65, 'rgba(' + r + ',' + g + ',' + b + ',' + side + ')');
    veilGrad.addColorStop(1,    'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.fillStyle = veilGrad;
    ctx.fillRect(0, veilTop, w, veilTotalH);
  }

  // ── Floor caster ─────────────────────────────────────────────────
  // Perspective-correct textured floor pass. Fills the bottom half of
  // the canvas below the pitch-shifted horizon. Writes one row at a
  // time into a persistent ImageData buffer, then blits to canvas via
  // putImageData at the true horizon Y.
  //
  // Per-tile caching minimises the expensive string-keyed
  // CleaningSystem.getBlood / GrimeGrid.get lookups — we re-query only
  // when the floor ray crosses into a new tile.
  //
  // Grime grid (PW-1): when GrimeGrid has a floor grid for the current
  // tile, a sub-tile grime level is sampled from the 4×4 subcell the
  // ray lands in and used to paint dirt accumulation. Without a grid,
  // falls back to flat per-tile blood tint.
  //
  // WATER tiles bypass texture sampling entirely and write the
  // contract's waterColor (fog-blended, distance-darkened) so water
  // reads as deep ocean even under warm amber fog palettes.
  function renderFloor(ctx, w, h, halfH, player, fov, baseWallH, floorTex, fogDist, fogColor, grid, gridW, gridH, tileFloorTexArr, playerElev) {
    playerElev = playerElev || 0;
    var floorH = h - Math.floor(halfH);
    if (floorH <= 0) return;

    // Allocate / reuse ImageData buffer for floor region
    if (_floorBufW !== w || _floorBufH !== floorH || !_floorImgData) {
      _floorImgData = ctx.createImageData(w, floorH);
      _floorBufW = w;
      _floorBufH = floorH;
    }

    var buf = _floorImgData.data;
    var px = player.x + 0.5;
    var py = player.y + 0.5;
    var pDir = player.dir;
    var halfFov = fov / 2;

    // Precompute direction vectors for left and right screen edges
    var dirX = Math.cos(pDir);
    var dirY = Math.sin(pDir);
    var planeX = -Math.sin(pDir) * Math.tan(halfFov);
    var planeY =  Math.cos(pDir) * Math.tan(halfFov);

    var texW = floorTex.width;
    var texH = floorTex.height;
    var texData = floorTex.data;

    var fr = fogColor ? fogColor.r : 0;
    var fg = fogColor ? fogColor.g : 0;
    var fb = fogColor ? fogColor.b : 0;
    // Water colour — pulled from contract, falls back to deep ocean blue
    var contract = _s ? _s.contract() : null;
    var _wc = contract && contract.waterColor;
    var _waterR = _wc ? _wc.r : 15;
    var _waterG = _wc ? _wc.g : 35;
    var _waterB = _wc ? _wc.b : 65;
    var fogStart = fogDist * 0.5;
    var fogRange = (fogDist * 1.5) - fogStart;

    var halfHFloor = Math.floor(halfH);
    // True projection center — always h/2 regardless of pitch.
    // The floor paints starting from halfH (the pitched horizon) so the
    // visible region shifts correctly, but perspective distance uses the
    // true center so floor rows at a wall's base position always produce
    // rowDist == perpDist. Without this, pitched halfH scales distance
    // non-uniformly: nearby floor stays correct but far floor detaches
    // from wall bases ("jaw opening" artifact).
    var trueHalfH = h / 2;

    var bloodFloorId = _s ? _s.bloodFloorId() : null;

    // ── Dynamic flickering light contribution (per-pixel add) ──────
    // Pull the per-frame snapshot from Lighting. Each entry carries its
    // flicker-adjusted peak, warm RGB, radius, shape, and direction.
    // The inner loop does sq-dist early-out first so most pixels touch
    // at most one or two sources even in a crowded torch corridor.
    var _dynLights = (typeof Lighting !== 'undefined' && Lighting.getFlickerLights)
      ? Lighting.getFlickerLights((typeof performance !== 'undefined' ? performance.now() : Date.now()))
      : null;
    var _nDyn = _dynLights ? _dynLights.length : 0;

    for (var row = 0; row < floorH; row++) {
      // Screen Y (actual pixel row on screen)
      var screenY = halfHFloor + row;
      // Distance from horizon
      var rowFromCenter = screenY - halfH;
      if (rowFromCenter <= 0) rowFromCenter = 0.5;

      // Floor distance for this scanline (anchored to true center).
      // MULTI-ELEVATION: eye is at (baseWallH/2 + playerElev) in world
      // Y, so the row→world mapping uses (baseWallH + 2*playerElev)
      // in the numerator (== 2 × eye-height-above-floor). Falls back
      // to the simple formula when playerElev is 0.
      var rowDist = (trueHalfH * (baseWallH + 2 * playerElev)) / rowFromCenter;

      // World position of left and right edges of this scanline
      var floorStepX = (2 * rowDist * planeX) / w;
      var floorStepY = (2 * rowDist * planeY) / w;

      // Start position (leftmost pixel)
      var floorX = px + rowDist * (dirX - planeX);
      var floorY = py + rowDist * (dirY - planeY);

      // Fog for this row
      var rowFog = 0;
      if (rowDist > fogStart) {
        rowFog = Math.min(1, (rowDist - fogStart) / fogRange);
      }
      var invFog = 1 - rowFog;

      // Distance-based darkening (simulate lighting falloff)
      var bright = Math.max(0.25, 1 - rowDist * 0.04);

      var rowOffset = row * w * 4;

      // ── Per-tile cache ──
      // getBlood() does string concat + hash lookup — expensive per-pixel.
      // Cache the result and only re-query when the tile coordinate changes.
      // PW-1: also caches floor grime grid for sub-tile tinting.
      var prevTileGX = -1, prevTileGY = -1;
      var cachedBlood = 0;
      var cachedFloorGrime = null;  // PW-1: { data: Uint8Array, res: number } or null
      var _hasGrimeGrid = (typeof GrimeGrid !== 'undefined');

      // ── PERF-1: Row-level dynamic-light culling ───────────────────
      // Before the per-pixel lights loop, test each dynamic light
      // against this row's world-space segment. Lights whose closest
      // approach to the segment is outside their own radius cannot
      // contribute to any pixel in this row and are skipped entirely.
      //
      // This collapses the lights loop to zero work for rows that see
      // no nearby torch/bonfire/hearth. On a torchlit floor, far rows
      // typically see 0 lights while rows near a light source see 1–2.
      //
      // Point-to-segment squared distance (no sqrt):
      //   AB = end - start
      //   AP = P - start
      //   t  = clamp((AP·AB) / |AB|², 0, 1)
      //   closest = start + t·AB
      //   distSq  = |P - closest|²
      //
      // |AB|² is the same for every light, so hoist it. A small radius
      // padding (+0.5 world unit) covers the "just inside R" contribution
      // clamp we do at line ~362 (_add < 0.01 short-circuit) so we don't
      // skip a pixel that would have contributed.
      var _rowLen = 0;
      if (_nDyn > 0) {
        var _segEndX = floorX + (w - 1) * floorStepX;
        var _segEndY = floorY + (w - 1) * floorStepY;
        var _abx = _segEndX - floorX;
        var _aby = _segEndY - floorY;
        var _abSq = _abx * _abx + _aby * _aby;
        var _invAbSq = (_abSq > 1e-8) ? (1 / _abSq) : 0;
        for (var _rli = 0; _rli < _nDyn; _rli++) {
          var _RL = _dynLights[_rli];
          var _apx = _RL.wx - floorX;
          var _apy = _RL.wy - floorY;
          var _t = (_apx * _abx + _apy * _aby) * _invAbSq;
          if (_t < 0) _t = 0; else if (_t > 1) _t = 1;
          var _cx = floorX + _t * _abx;
          var _cy = floorY + _t * _aby;
          var _dcx = _RL.wx - _cx;
          var _dcy = _RL.wy - _cy;
          var _dcSq = _dcx * _dcx + _dcy * _dcy;
          var _rPad = _RL.radius + 0.5;
          if (_dcSq <= _rPad * _rPad) {
            _rowLights[_rowLen++] = _RL;
          }
        }
      }
      _rowLightsLen = _rowLen;

      for (var col = 0; col < w; col++) {
        // Compute grid tile coordinates (used for per-tile texture and blood)
        var tileGX = Math.floor(floorX);
        var tileGY = Math.floor(floorY);

        // Select floor texture — per-tile override or default
        var curTexW = texW;
        var curTexH = texH;
        var curTexData = texData;

        // ── WATER tile skip: render dedicated water color instead of texture ──
        // WATER tiles (9) have no floor surface — they render as deep ocean.
        // Uses contract.waterColor (default deep blue) so water reads correctly
        // regardless of the fog color (which may be warm brown for amber atmosphere).
        var tileVal = (tileGX >= 0 && tileGX < gridW &&
                       tileGY >= 0 && tileGY < gridH)
                      ? grid[tileGY][tileGX] : -1;
        if (tileVal === 9) { // TILES.WATER
          // Write water colour directly — skip texture sampling.
          // Distance-darkened + fog-blended so water fades naturally at range.
          var pIdx = rowOffset + col * 4;
          var wr = _waterR, wg = _waterG, wb = _waterB;
          // Blend toward fog at distance (same fog curve as textured floor)
          var wR = (wr * invFog + fr * rowFog) * bright;
          var wG = (wg * invFog + fg * rowFog) * bright;
          var wB = (wb * invFog + fb * rowFog) * bright;
          buf[pIdx]     = (wR) | 0;
          buf[pIdx + 1] = (wG) | 0;
          buf[pIdx + 2] = (wB) | 0;
          buf[pIdx + 3] = 255;
          floorX += floorStepX;
          floorY += floorStepY;
          continue;
        }

        if (tileFloorTexArr && tileVal >= 0) {
          var altTex = tileFloorTexArr[tileVal];
          if (altTex) {
            curTexW = altTex.width;
            curTexH = altTex.height;
            curTexData = altTex.data;
          }
        }

        // Texture coordinates — wrap to tile boundaries
        var tx = ((Math.floor(floorX * curTexW) % curTexW) + curTexW) % curTexW;
        var ty = ((Math.floor(floorY * curTexH) % curTexH) + curTexH) % curTexH;

        // Sample texel
        var texIdx = (ty * curTexW + tx) * 4;
        var r = curTexData[texIdx]     * bright;
        var g = curTexData[texIdx + 1] * bright;
        var b = curTexData[texIdx + 2] * bright;

        // ── Dirt/grime tint — blood overlay or sub-tile grime grid ──
        // Per-tile cache: only re-query when tile coordinate changes.
        // PW-1: when GrimeGrid exists for this tile, use subcell grime
        // tint instead of flat blood level. No grid = old blood fallback.
        if (bloodFloorId && typeof CleaningSystem !== 'undefined') {
          if (tileGX !== prevTileGX || tileGY !== prevTileGY) {
            cachedBlood = CleaningSystem.getBlood(tileGX, tileGY, bloodFloorId);
            cachedFloorGrime = _hasGrimeGrid
              ? GrimeGrid.get(bloodFloorId, tileGX, tileGY) : null;
            prevTileGX = tileGX;
            prevTileGY = tileGY;
          }

          if (cachedFloorGrime) {
            // PW-1 §5.3: sub-tile grime tint (4×4 floor grid)
            // UV within tile = fractional part of world floor coords
            var floorFracX = floorX - tileGX;
            var floorFracY = floorY - tileGY;
            var fgRes = cachedFloorGrime.res;
            var fgSubX = Math.floor(floorFracX * fgRes);
            var fgSubY = Math.floor(floorFracY * fgRes);
            if (fgSubX >= fgRes) fgSubX = fgRes - 1;
            if (fgSubY >= fgRes) fgSubY = fgRes - 1;
            if (fgSubX < 0) fgSubX = 0;
            if (fgSubY < 0) fgSubY = 0;
            var fgLevel = cachedFloorGrime.data[fgSubY * fgRes + fgSubX];
            if (fgLevel > 0) {
              var fga = (fgLevel / 255) * 0.6;
              r = r * (1 - fga) + _GRIME_R * fga;
              g = g * (1 - fga) + _GRIME_G * fga;
              b = b * (1 - fga) + _GRIME_B * fga;
            }
          } else if (cachedBlood > 0) {
            // Legacy blood tint — flat per-tile overlay (no grime grid)
            var bloodAlpha = 0.15 * cachedBlood;
            r = r * (1 - bloodAlpha) + 140 * bloodAlpha;
            g = g * (1 - bloodAlpha * 1.3);
            b = b * (1 - bloodAlpha * 1.3);
          }
        }

        // Apply fog
        if (rowFog > 0.01) {
          r = r * invFog + fr * rowFog;
          g = g * invFog + fg * rowFog;
          b = b * invFog + fb * rowFog;
        }

        // ── Dynamic flickering lights: cone (torch), ring (bonfire),
        //    disc (hearth/lantern). Additive warm overlay per source
        //    with per-shape falloff. Fog-attenuated so distant lights
        //    don't punch through the fog wash.
        // PERF-1: Iterates the row-culled list, not the scene list. Rows
        // that passed no lights through culling skip this loop entirely.
        if (_rowLightsLen > 0) {
          var _lFade = invFog;  // lights dim into fog
          for (var _li = 0; _li < _rowLightsLen; _li++) {
            var _L = _rowLights[_li];
            var _ldx = floorX - _L.wx;
            var _ldy = floorY - _L.wy;
            var _ldSq = _ldx * _ldx + _ldy * _ldy;
            var _lRsq = _L.radius * _L.radius;
            if (_ldSq >= _lRsq) continue;
            var _ld = Math.sqrt(_ldSq);
            var _shapeF;
            if (_L.shape === 'cone') {
              // Dot product with facing direction, biased so the cone
              // has soft shoulders and doesn't cut off abruptly.
              var _invLd = (_ld > 1e-4) ? 1 / _ld : 0;
              var _dot = (_ldx * _L.dx + _ldy * _L.dy) * _invLd;
              var _coneK = (_dot + 0.3) / 1.3;  // bias 0.3 rad half-shoulder
              if (_coneK <= 0) continue;
              if (_coneK > 1) _coneK = 1;
              var _rfall = 1 - _ld / _L.radius;
              _shapeF = _rfall * _rfall * _coneK;
            } else if (_L.shape === 'ring') {
              // Annulus peak at 0.65 * radius, band width 0.5 * radius.
              var _ringC = _L.radius * 0.65;
              var _ringW = _L.radius * 0.5;
              var _dBand = Math.abs(_ld - _ringC) / _ringW;
              if (_dBand >= 1) continue;
              _shapeF = (1 - _dBand) * (1 - _dBand);
            } else {
              var _rf2 = 1 - _ld / _L.radius;
              _shapeF = _rf2 * _rf2;
            }
            var _add = _L.peakA * _shapeF * _lFade;
            if (_add < 0.01) continue;
            r += _L.r * _add;
            g += _L.g * _add;
            b += _L.b * _add;
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;
          }
        }

        var pIdx2 = rowOffset + col * 4;
        buf[pIdx2]     = r | 0;
        buf[pIdx2 + 1] = g | 0;
        buf[pIdx2 + 2] = b | 0;
        buf[pIdx2 + 3] = 255;

        floorX += floorStepX;
        floorY += floorStepY;
      }
    }

    ctx.putImageData(_floorImgData, 0, halfHFloor);
  }

  return Object.freeze({
    bind: bind,
    resetBuffer: resetBuffer,
    renderFloor: renderFloor,
    renderParallax: renderParallax,
    renderWeatherVeil: renderWeatherVeil
  });
})();

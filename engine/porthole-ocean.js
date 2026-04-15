/**
 * PortholeOcean — gap filler for the PORTHOLE_OCEAN tile (96).
 *
 * Renders a circular porthole cut into a bulkhead plate. Inside the
 * aperture a procedural ocean skybox is sampled with a parallax
 * lookup: horizon stays stable as the player walks past, but the
 * visible slice drifts with viewer column + wall position so the
 * porthole reads as a window into open water rather than a flat
 * billboard. Outside the aperture: riveted steel plate.
 *
 * Parallax model (per user direction: "b" = parallax, not cube
 * sampling): horizon is fixed at world Y≈0.5 of the gap. Horizontal
 * offset into the skybox gradient = (info.mapX + info.wallX) * 0.15
 * + col/screenW * 0.35. Small multipliers keep the ocean "distant" —
 * a full walk past the tile only slides the horizon by a fraction
 * of a slice, which reads as real distance rather than moving scenery.
 *
 * Registered as 'porthole_ocean' filler in SpatialContract's
 * tileFreeform entry for tile 96. Layer 1 load (alongside
 * window-sprites.js) with the same lazy registration pattern.
 *
 * See CLAUDE.md — this module is the sealab-dungeon porthole pipeline
 * used alongside TUNNEL_RIB / TUNNEL_WALL for hobbit-hole tight
 * corridors with ocean views.
 */
var PortholeOcean = (function () {
  'use strict';

  // Porthole geometry (in wallX / gap-local-Y unit space, both 0..1).
  var _CENTER_U = 0.5;
  var _CENTER_V = 0.5;
  var _RADIUS   = 0.42;       // Fills most of the freeform gap
  var _RIM_W    = 0.04;       // Rim bead thickness (darker ring)

  // Bulkhead steel palette (before brightness/fog).
  var _BULK_R = 58, _BULK_G = 64, _BULK_B = 72;
  var _RIVET_R = 32, _RIVET_G = 36, _RIVET_B = 42;
  var _RIM_R = 22, _RIM_G = 26, _RIM_B = 32;

  // Ocean skybox palette (vertical gradient inside the aperture).
  // Coastal / submarine-base water: greener than open ocean, slightly
  // murkier at depth. Intended to read as the view from a sealab
  // porthole at floor IDs 3.n.n / 4.n.n (submarine-base dungeons).
  // Top of porthole = lighter surface-side teal; bottom = deep greenish navy.
  var _TOP_R = 48,  _TOP_G = 132, _TOP_B = 136;
  var _BOT_R = 6,   _BOT_G = 24,  _BOT_B = 40;

  // Kelp silhouette palette (very dark, almost black-green).
  var _KELP_R = 4,  _KELP_G = 18, _KELP_B = 14;

  // Fish silhouette palette (slightly lighter than kelp so they
  // read as mid-water rather than foreground).
  var _FISH_R = 18, _FISH_G = 34, _FISH_B = 42;

  // God-ray caustic palette (subtle surface-lit streaks).
  var _RAY_R = 180, _RAY_G = 220, _RAY_B = 210;

  // Parallax strengths — kept small so the horizon stays distant.
  var _PARALLAX_WALL = 0.15;  // World-position contribution
  var _PARALLAX_COL  = 0.35;  // Viewport-column contribution

  // Animation clock cache — read once per filler invocation and
  // reused across the column loop so all rows of a single column
  // see the same time value. The filler runs per-column, so we
  // still re-sample per column; adjacent columns are microseconds
  // apart which is imperceptible.
  function _now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() * 0.001
      : Date.now() * 0.001;
  }

  /**
   * Gap filler entry point.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} col         - screen column (x)
   * @param {number} gapStart    - first row of the gap on screen
   * @param {number} gapH        - number of rows in the gap
   * @param {Object} info        - raycaster info bundle (see _gapInfo)
   */
  function _portholeFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var screenW = (typeof ctx.canvas !== 'undefined' && ctx.canvas) ? ctx.canvas.width : 640;
    var brightness = info.brightness;
    var fogF = info.fogFactor;
    var fogR = info.fogColor.r, fogG = info.fogColor.g, fogB = info.fogColor.b;
    var t = _now();

    // Parallax offset into the ocean gradient. Small values keep the
    // horizon distant; the player walking past the porthole sees the
    // horizon drift slightly rather than sweep.
    var parallaxU =
      (info.mapX + info.wallX) * _PARALLAX_WALL +
      (col / screenW) * _PARALLAX_COL;
    // Wrap to 0..1 for a seamless drift.
    var phase = parallaxU - Math.floor(parallaxU);

    // Column-local porthole U coordinate (0..1 across tile face).
    var u = info.wallX;

    // ── Kelp strand positions (module-stable along the wall) ─────
    // Three strands anchored in aperture-U space. The sway offset
    // comes from a slow sine keyed to time + strand index so each
    // strand drifts independently.
    //   anchorU: base U position of the strand's ROOT (bottom).
    //   bendAmp: how far the top drifts left/right per strand.
    //   swayHz:  sway frequency (cycles per second).
    // The top of the strand lives near v≈0.35 (mid-aperture) — kelp
    // reaches from the bottom of the porthole upward through the
    // lower 2/3 of the view.
    var _kelpCount = 3;

    // ── Fish band ────────────────────────────────────────────────
    // Sparse silhouettes drifting horizontally through the middle
    // band of the aperture. We test for each row whether a fish
    // silhouette covers (u, v). Fish positions computed once per
    // column: small ellipse-shaped dark blob at periodic U values
    // that scroll with time.
    var _fishSpeed = 0.06;   // U units per second
    var _fishScroll = (t * _fishSpeed) - Math.floor(t * _fishSpeed);

    // Walk each pixel in the gap span. For each row we compute V
    // (0 at top of gap, 1 at bottom), then a radial distance from
    // the porthole centre. Inside radius → ocean; rim bead → dark
    // ring; outside → bulkhead with rivet specks.
    for (var dy = 0; dy < gapH; dy++) {
      var row = gapStart + dy;
      var v = dy / gapH;
      var du = u - _CENTER_U;
      var dv = v - _CENTER_V;
      var r = Math.sqrt(du * du + dv * dv);

      var rOut, gOut, bOut;

      if (r < _RADIUS - _RIM_W) {
        // ── Inside aperture: layered underwater skybox ───────────
        // Layer stack (back → front):
        //   1. Vertical water gradient (top teal → bottom navy)
        //   2. Surface-line highlight streak (parallax)
        //   3. God-ray caustics (diagonal light shafts from surface)
        //   4. Fish silhouette band (drifting)
        //   5. Kelp silhouette strands (swaying)

        // 1. Base gradient.
        var tR = _TOP_R * (1 - v) + _BOT_R * v;
        var tG = _TOP_G * (1 - v) + _BOT_G * v;
        var tB = _TOP_B * (1 - v) + _BOT_B * v;

        // 2. Surface-line highlight streak (thin horizontal band of
        //    "light on water" just above the centre line; parallaxes
        //    so the horizon reads as far off rather than painted-on).
        var surfaceMid = 0.36 + 0.05 * Math.sin(phase * Math.PI * 2);
        var surfaceBand = 1 - Math.min(1, Math.abs(v - surfaceMid) * 14);
        var surfaceDrift = 0.5 + 0.5 * Math.sin((phase + u) * Math.PI * 2);
        var sBoost = surfaceBand * surfaceDrift * 0.28;
        tR += (170 - tR) * sBoost;
        tG += (215 - tG) * sBoost;
        tB += (210 - tB) * sBoost;

        // 3. God-ray caustics — slanted light shafts descending from
        //    the surface. Only visible in the upper third of the
        //    aperture where the "surface" would realistically be.
        //    Angle ≈ 30° off vertical, animated slowly so the rays
        //    seem to sweep through the water as the sun moves.
        if (v < 0.55) {
          var rayAngle = (t * 0.08) % 1;
          // Ray coordinate: combine slanted U+V with slow drift.
          var rayU = (u - rayAngle) * 3.2 + v * 0.55;
          var rayF = 0.5 + 0.5 * Math.sin(rayU * Math.PI * 2);
          rayF = rayF * rayF;  // sharpen — thin shafts not broad gradients
          // Fade out toward the bottom (caustics only near surface).
          var rayDepth = 1 - (v / 0.55);
          var rayA = rayF * rayDepth * 0.22;
          tR += (_RAY_R - tR) * rayA;
          tG += (_RAY_G - tG) * rayA;
          tB += (_RAY_B - tB) * rayA;
        }

        // 4. Fish band — two drifting silhouette "shoals" in the
        //    middle vertical band. Each shoal is a small elongated
        //    ellipse. We check whether (u, v) lies inside either
        //    shoal's current bounding ellipse.
        var fishMaskA_u = _fishScroll + 0.12;
        var fishMaskA_v = 0.46;
        var fishMaskB_u = (_fishScroll + 0.62) - Math.floor(_fishScroll + 0.62);
        var fishMaskB_v = 0.52;
        var fDuA = (u - fishMaskA_u) / 0.10;
        var fDvA = (v - fishMaskA_v) / 0.04;
        var fDuB = (u - fishMaskB_u) / 0.08;
        var fDvB = (v - fishMaskB_v) / 0.03;
        var inFishA = (fDuA * fDuA + fDvA * fDvA) < 1;
        var inFishB = (fDuB * fDuB + fDvB * fDvB) < 1;
        if (inFishA || inFishB) {
          // Soft blend — fish are slightly translucent silhouettes.
          tR = tR * 0.35 + _FISH_R * 0.65;
          tG = tG * 0.35 + _FISH_G * 0.65;
          tB = tB * 0.35 + _FISH_B * 0.65;
        }

        // 5. Kelp strands — three vertical silhouettes rooted at the
        //    bottom of the aperture, reaching up through the lower
        //    2/3 and swaying slowly. Each strand's horizontal offset
        //    at height v is a sine of (t + strand_index), amplified
        //    by how far from the root we are (top sways most).
        for (var ks = 0; ks < _kelpCount; ks++) {
          var anchorU = 0.18 + ks * 0.32;         // 0.18, 0.50, 0.82
          var kelpTop = 0.35 + (ks * 0.07);       // vary top heights
          if (v < kelpTop) continue;              // above this strand's top
          var kelpBase = 1.0;                     // rooted at bottom
          var kelpAge = (v - kelpTop) / (kelpBase - kelpTop); // 0 at top, 1 at bottom
          var sway = Math.sin(t * 0.6 + ks * 1.7) * 0.04 * (1 - kelpAge);
          var kelpU = anchorU + sway;
          // Strand width tapers from 0.045 at base to 0.020 at top.
          var kelpW = 0.020 + kelpAge * 0.025;
          if (Math.abs(u - kelpU) < kelpW) {
            // Inside the strand — dark silhouette. Leaf-edge shading
            // slightly brighter at strand edges so the kelp reads
            // as a rounded blade, not a flat stripe.
            var kEdge = Math.abs(u - kelpU) / kelpW;  // 0 centre → 1 edge
            var kelpShade = 0.75 + kEdge * 0.25;
            tR = _KELP_R * kelpShade;
            tG = _KELP_G * kelpShade;
            tB = _KELP_B * kelpShade;
          }
        }

        rOut = tR; gOut = tG; bOut = tB;
      } else if (r < _RADIUS) {
        // ── Rim bead: dark ring around the aperture ─────────────
        rOut = _RIM_R; gOut = _RIM_G; bOut = _RIM_B;
      } else {
        // ── Bulkhead plate with rivets ──────────────────────────
        // Rivet dots at fixed grid points in (u, v) space. Small
        // radius check around each grid node. 4x3 pattern fits the
        // typical porthole gap without crowding.
        var gridU = u * 4;
        var gridV = v * 3;
        var fu = gridU - Math.floor(gridU);
        var fv = gridV - Math.floor(gridV);
        var rivDu = fu - 0.5;
        var rivDv = fv - 0.5;
        var rivDist = Math.sqrt(rivDu * rivDu + rivDv * rivDv);
        if (rivDist < 0.12) {
          rOut = _RIVET_R; gOut = _RIVET_G; bOut = _RIVET_B;
        } else {
          rOut = _BULK_R; gOut = _BULK_G; bOut = _BULK_B;
        }
      }

      // Apply brightness (wall shading) + fog blend.
      rOut *= brightness;
      gOut *= brightness;
      bOut *= brightness;
      if (fogF > 0) {
        rOut = rOut * (1 - fogF) + fogR * fogF;
        gOut = gOut * (1 - fogF) + fogG * fogF;
        bOut = bOut * (1 - fogF) + fogB * fogF;
      }
      rOut = rOut < 0 ? 0 : (rOut > 255 ? 255 : rOut);
      gOut = gOut < 0 ? 0 : (gOut > 255 ? 255 : gOut);
      bOut = bOut < 0 ? 0 : (bOut > 255 ? 255 : bOut);
      ctx.fillStyle = 'rgb(' + (rOut | 0) + ',' + (gOut | 0) + ',' + (bOut | 0) + ')';
      ctx.fillRect(col, row, 1, 1);
    }
  }

  /**
   * Gap filler for TUNNEL_WALL alcove niche. Paints a warm amber
   * lantern glow at niche centre, fading to the tile's wall colour
   * at the niche edges. Minimal placeholder — later phases can
   * replace with per-niche billboard sprites (lantern / shelf /
   * mushroom cluster).
   */
  function _tunnelAlcoveFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;
    var brightness = info.brightness;
    var fogF = info.fogFactor;
    var fogR = info.fogColor.r, fogG = info.fogColor.g, fogB = info.fogColor.b;

    var u = info.wallX;
    // Amber glow at centre, falls off toward edges.
    for (var dy = 0; dy < gapH; dy++) {
      var row = gapStart + dy;
      var v = dy / gapH;
      var du = u - 0.5;
      var dv = v - 0.5;
      var r = Math.sqrt(du * du + dv * dv);
      var glow = Math.max(0, 1 - r * 2.4);  // 0 at r≥0.42, 1 at centre
      // Base stone (dark) → amber lantern
      var tR = 40 + glow * 180;
      var tG = 30 + glow * 130;
      var tB = 24 + glow * 40;
      tR *= brightness;
      tG *= brightness;
      tB *= brightness;
      if (fogF > 0) {
        tR = tR * (1 - fogF) + fogR * fogF;
        tG = tG * (1 - fogF) + fogG * fogF;
        tB = tB * (1 - fogF) + fogB * fogF;
      }
      tR = tR < 0 ? 0 : (tR > 255 ? 255 : tR);
      tG = tG < 0 ? 0 : (tG > 255 ? 255 : tG);
      tB = tB < 0 ? 0 : (tB > 255 ? 255 : tB);
      ctx.fillStyle = 'rgb(' + (tR | 0) + ',' + (tG | 0) + ',' + (tB | 0) + ')';
      ctx.fillRect(col, row, 1, 1);
    }
  }

  // Lazy registration — mirrors window-sprites.js pattern because
  // this module loads BEFORE the raycaster in the Layer 1 cascade.
  var _registered = false;
  function ensureRegistered() {
    if (_registered) return;
    if (typeof Raycaster !== 'undefined' &&
        typeof Raycaster.registerFreeformGapFiller === 'function') {
      Raycaster.registerFreeformGapFiller('porthole_ocean', _portholeFiller);
      Raycaster.registerFreeformGapFiller('tunnel_alcove',  _tunnelAlcoveFiller);
      _registered = true;
    }
  }

  return Object.freeze({
    ensureRegistered: ensureRegistered
  });
})();

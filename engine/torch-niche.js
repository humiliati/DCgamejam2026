/**
 * TorchNiche — gap filler for TORCH_LIT (30) and TORCH_UNLIT (31).
 *
 * Modeled directly on DoorSprites._facadeDoorFiller. The tile renders
 * as a recessed niche with a narrow aperture in the middle and solid
 * wall jambs on either side. Inside the aperture a dark portal is
 * drawn, then a torch sprite is overlaid — `decor_torch` when lit,
 * `decor_torch_unlit` when extinguished. The sprite IS the on/off
 * state indicator, exactly the way a door's panel texture is the
 * open/closed indicator.
 *
 * Why this shape instead of the earlier gradient-only filler:
 *   The gradient-only filler painted a column-wide orange blob in
 *   the cavity band, which read as a flat horizontal strip with a
 *   glow in the middle — no architectural recess, no clear visual
 *   state swap for lit vs unlit, and interactivity couldn't be read
 *   from the shape. The DOOR_FACADE pattern gives a real recess
 *   (via recessD in the tileFreeform entry) and a swappable sprite
 *   overlay that moves between states the same way a door does.
 *
 * Geometry (in wallX units, 0..1 across the tile face):
 *   [0,     NICHE_L]  → jamb (wall masonry)
 *   [NICHE_L, NICHE_R] → niche aperture (dark portal + torch sprite)
 *   [NICHE_R, 1]      → jamb (wall masonry)
 *
 * The aperture is 0.20 of a tile (1/5), matching the requested width.
 * The jambs are (1 - 0.20) / 2 = 0.40 on each side.
 *
 * Lit/unlit discrimination: info.hitTile === 30 is TORCH_LIT; 31 is
 * TORCH_UNLIT. Any other tile renders as unlit silhouette (defensive).
 *
 * Interactivity: the peek/extinguish/refuel loop operates on the grid
 * tile (TorchState + peek overlays swap the grid value between 30 and
 * 31). This filler reads the grid tile each frame, so as soon as
 * TorchState mutates the tile, the visual swaps on the next render.
 * No special plumbing in this module — it's declarative off grid state.
 *
 * Perf: one column-wide ctx.drawImage call for the sprite strip + a
 * handful of fillRect calls for portal/jamb/frame. O(1) per column,
 * matches facade_door cost. Replaces the prior per-pixel cavityGlow
 * loop that pegged wallPhase to 125 ms/frame at five-torches-facing.
 */
var TorchNiche = (function () {
  'use strict';

  // Niche horizontal extents in wallX (0..1). 1/5-tile aperture as
  // requested — the jamb stone on each side is 0.40 wide, which reads
  // as a proper masonry frame rather than a surface decal.
  var _NICHE_L = 0.40;
  var _NICHE_R = 0.60;

  // Niche interior (back wall of recess) — deep warm-dark stone.
  // Hotter than DOOR_FACADE's portal because torch light tints it.
  var _INT_R = 22, _INT_G = 16, _INT_B = 10;

  // Wall-jamb stone — matches the surrounding dungeon wall palette.
  // Dungeon WALL is 'stone_rough'. We can't sample the texture from
  // a filler cheaply, so use a representative mid-tone that reads as
  // continuous with the bulk wall at typical dungeon fog/brightness.
  var _JAMB_R = 70, _JAMB_G = 64, _JAMB_B = 58;

  // Frame (jamb edges lining the aperture) — a touch darker than the
  // jamb so the niche has a crisp edge.
  var _FRAME_R = 35, _FRAME_G = 28, _FRAME_B = 20;

  // Warm glow colour (lit torches only) — painted over the portal
  // before the sprite draws so transparent parts of the sprite still
  // read as "fire is inside this niche."
  var _GLOW_R = 255, _GLOW_G = 140, _GLOW_B = 40;

  function _clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v | 0); }

  /**
   * Paint one column of the torch niche.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} col       Screen column x.
   * @param {number} gapStart  Screen Y of the cavity top.
   * @param {number} gapH      Cavity pixel height.
   * @param {object} info      Raycaster's _gapInfo shared buffer.
   */
  function _torchNicheFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var wallX   = info.wallX;
    var bright  = info.brightness;
    var fogF    = info.fogFactor;
    var fogR    = info.fogColor.r;
    var fogG    = info.fogColor.g;
    var fogB    = info.fogColor.b;
    var isLit   = (info.hitTile === 30);   // TILES.TORCH_LIT

    // ── Jamb: wallX outside the narrow aperture ────────────────────
    // Paint wall-matching stone so the niche reads as an inset into a
    // continuous wall face. This is the DOOR_FACADE "side face" role.
    if (wallX < _NICHE_L || wallX > _NICHE_R) {
      var jR = _JAMB_R * bright;
      var jG = _JAMB_G * bright;
      var jB = _JAMB_B * bright;
      if (fogF > 0) {
        jR = jR * (1 - fogF) + fogR * fogF;
        jG = jG * (1 - fogF) + fogG * fogF;
        jB = jB * (1 - fogF) + fogB * fogF;
      }
      ctx.fillStyle = 'rgb(' + _clamp255(jR) + ',' + _clamp255(jG) + ',' + _clamp255(jB) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Aperture: dark portal + optional glow + sprite overlay ──────

    // 1. Dark portal interior (always painted first).
    var pR = _INT_R * bright;
    var pG = _INT_G * bright;
    var pB = _INT_B * bright;
    if (fogF > 0) {
      pR = pR * (1 - fogF) + fogR * fogF;
      pG = pG * (1 - fogF) + fogG * fogF;
      pB = pB * (1 - fogF) + fogB * fogF;
    }
    ctx.fillStyle = 'rgb(' + _clamp255(pR) + ',' + _clamp255(pG) + ',' + _clamp255(pB) + ')';
    ctx.fillRect(col, gapStart, 1, gapH);

    // 2. Aperture frame — 1px on each side of the niche where wallX
    //    crosses from jamb into aperture. Reads as a crisp masonry
    //    edge between the jamb stone and the dark recess.
    //    (Approximate: the frame is painted on the first/last columns
    //    of the aperture by testing distance-from-edge in wallX.)
    var frameW = 0.015;    // fraction of wallX that counts as frame
    var onFrame = (wallX < _NICHE_L + frameW) || (wallX > _NICHE_R - frameW);
    if (onFrame) {
      var fR = _FRAME_R * bright;
      var fG = _FRAME_G * bright;
      var fB = _FRAME_B * bright;
      if (fogF > 0) {
        fR = fR * (1 - fogF) + fogR * fogF;
        fG = fG * (1 - fogF) + fogG * fogF;
        fB = fB * (1 - fogF) + fogB * fogF;
      }
      ctx.fillStyle = 'rgb(' + _clamp255(fR) + ',' + _clamp255(fG) + ',' + _clamp255(fB) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;   // frame column covers whatever's behind
    }

    // 3. Flicker (lit only) — seeded by tile coord so adjacent torches
    //    desync. Curve matches Lighting._flicker() so the sprite + grid
    //    lightmap + glow stay in phase.
    var flicker = 1.0;
    if (isLit) {
      var seed = ((info.mapX * 1103515245 + info.mapY * 12345) & 0x7fffffff)
                 / 0x7fffffff * 6.28;
      var t = Date.now() * 0.001;
      flicker = 0.85 + 0.15 * Math.sin(t * 18.85 + seed);
    }

    // 4. Warm radial glow (lit only) — a single linear gradient from
    //    dim at the top of the cavity, bright in the middle, dim at
    //    the bottom. Painted before the sprite so transparent pixels
    //    of the sprite still show a warm wash.
    if (isLit) {
      // Horizontal falloff inside the aperture (0 at center, 1 at edges).
      var uMid = (wallX - 0.5) / ((_NICHE_R - _NICHE_L) * 0.5);
      var hFall = 1 - uMid * uMid;
      if (hFall < 0) hFall = 0;
      var peakA = 0.75 * hFall * flicker;
      if (peakA > 0.02) {
        var fFade = 1 - Math.min(0.85, fogF);
        peakA *= fFade * bright;
        var grad = ctx.createLinearGradient(0, gapStart, 0, gapStart + gapH);
        var rgb = _GLOW_R + ',' + _GLOW_G + ',' + _GLOW_B + ',';
        grad.addColorStop(0.00, 'rgba(' + rgb + '0)');
        grad.addColorStop(0.55, 'rgba(' + rgb + peakA.toFixed(3) + ')');
        grad.addColorStop(1.00, 'rgba(' + rgb + (peakA * 0.3).toFixed(3) + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(col, gapStart, 1, gapH);
      }
    }

    // 5. Sprite overlay — the torch bracket+flame (or charred stub).
    //    This is the moral equivalent of DOOR_FACADE's door-panel
    //    texture: ONE texture sampled per column, with alpha, to make
    //    the niche read as "there's an object inside it."
    //
    //    Sample UV: remap wallX from [_NICHE_L.._NICHE_R] to [0..1]
    //    across the sprite's width. The sprite has a transparent
    //    background so the portal/glow behind shows through.
    var spriteId = isLit ? 'decor_torch' : 'decor_torch_unlit';
    var tex = (typeof TextureAtlas !== 'undefined') ? TextureAtlas.get(spriteId) : null;
    if (tex && tex.canvas) {
      var u = (wallX - _NICHE_L) / (_NICHE_R - _NICHE_L);
      if (u < 0) u = 0; else if (u >= 1) u = 0.9999;
      var texX = Math.floor(u * tex.width);
      // Draw the sprite column stretched over the full gap height.
      ctx.drawImage(tex.canvas, texX, 0, 1, tex.height,
                    col, gapStart, 1, gapH);
      // Fog/brightness overlay on the sprite — match facade_door's
      // post-sprite dim pass so niches at distance blend into fog.
      if (fogF > 0.01 || bright < 0.99) {
        var dim = (1 - bright) + fogF * bright;
        if (dim > 0.01) {
          var oR = Math.round(fogR * fogF);
          var oG = Math.round(fogG * fogF);
          var oB = Math.round(fogB * fogF);
          ctx.fillStyle = 'rgba(' + oR + ',' + oG + ',' + oB + ',' + dim.toFixed(3) + ')';
          ctx.fillRect(col, gapStart, 1, gapH);
        }
      }
    }
  }

  // ── Lazy registration ─────────────────────────────────────────────
  // Raycaster loads AFTER this file, so we can't register at IIFE init.
  // FloorManager calls ensureRegistered on floor load.
  var _registered = false;
  function ensureRegistered() {
    if (_registered) return;
    if (typeof Raycaster !== 'undefined' &&
        typeof Raycaster.registerFreeformGapFiller === 'function') {
      Raycaster.registerFreeformGapFiller('torch_niche', _torchNicheFiller);
      _registered = true;
    }
  }

  return Object.freeze({
    ensureRegistered: ensureRegistered
  });
})();

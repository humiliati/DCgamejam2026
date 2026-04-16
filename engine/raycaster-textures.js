/**
 * RaycasterTextures — freeform gap-filler registry + alpha-range cache.
 *
 * Phase 1 of the raycaster extraction roadmap (see
 * docs/RAYCASTER_EXTRACTION_ROADMAP.md, EX-2).
 *
 * Owns:
 *   - The _gapFillers registry (built-in fillers + runtime registrations
 *     from Layer 3 modules like DoorSprites and WindowSprites)
 *   - The alpha-range cache used by Phase-3 alpha-mask freeform tiles
 *
 * Does NOT own:
 *   - The `_gapInfo` scratch object — that lives in the raycaster hot
 *     loop and is passed to each filler as the `info` argument
 *   - The `_freeformEnabled` toggle — kept on Raycaster because it's a
 *     public-API mutable flag
 *
 * Consumers (raycaster.js) alias the registry and cache helpers into
 * local names at IIFE top for hot-path efficiency:
 *
 *     var _gapFillers           = RaycasterTextures.getRegistry();
 *     var _computeAlphaRange    = RaycasterTextures.computeAlphaRange;
 *     var _clearAlphaRangeCache = RaycasterTextures.clearAlphaRangeCache;
 *
 * Depends on RaycasterLighting (for the `_default` filler's fog blend).
 * Layer 2 — loaded after raycaster-lighting.js, before raycaster.js.
 */
var RaycasterTextures = (function () {
  'use strict';

  var _applyFogAndBrightness = RaycasterLighting.applyFogAndBrightness;

  // ── Freeform gap filler registry ─────────────────────────────────
  // When a freeform tile's two-segment render produces a visible cavity
  // (upper band + gap + lower band), the gap is painted by a registered
  // filler function selected via the tile's contract entry:
  //
  //   tileFreeform[TILE] = { hUpper, hLower, fillGap: 'my_key' }
  //
  // The raycaster looks up `fillGap` in the registry and calls the
  // function with the shared `_gapInfo` object describing the column
  // state. Tiles without a `fillGap` slot use the `_default` filler
  // (dark placeholder — easy to spot unstyled cavities during dev).
  //
  // Zero-alloc: `_gapInfo` is a single shared object reused across all
  // columns each frame. Fillers MUST treat it as read-only and MUST NOT
  // cache references to it past the call — the fields change as the
  // renderer sweeps the column buffer.
  //
  // Filler signature: function (ctx, col, gapStart, gapH, info)
  //   ctx       — 2D canvas context
  //   col       — screen x
  //   gapStart  — first screen row inside the gap (clipped to viewport)
  //   gapH      — gap height in screen pixels (clipped)
  //   info      — see field list in Raycaster._gapInfo
  var _gapFillers = {
    // Default: dark placeholder. Shows through floor prepass + back
    // layers with a dim fog-blended tint so an unregistered cavity
    // still reads as "something goes here" rather than a hole.
    _default: function (ctx, col, gapStart, gapH, info) {
      ctx.fillStyle = _applyFogAndBrightness(
        '#141414', info.fogFactor, info.brightness * 0.5, info.fogColor
      );
      ctx.fillRect(col, gapStart, 1, gapH);
    },

    // Transparent: explicit no-op filler for tiles whose cavity should
    // be a literal hole through the column — sky above horizon, floor
    // below. The sky/skybox and floor prepasses have already painted
    // both halves of the screen before walls start drawing, and the
    // back-layer collection flag (_fgIsFreeformSeeThrough) emits any
    // walls behind the freeform tile into this Y range as well. Doing
    // nothing here preserves all of that.
    //
    // Used by PERGOLA_BEAM (70) — a top-anchored beam with hLower=0
    // and a huge gap below the beam band; painting anything here would
    // cover the sky/plaza the player expects to see under the canopy.
    _transparent: function () { /* intentional no-op */ },

    // HEARTH / BONFIRE fire cavity: transparent window through the
    // column with a warm amber glow overlay. The dragonfire emoji is
    // NOT drawn here — BonfireSprites emits a billboard sprite at the
    // tile center so the glyph has proper single-instance parallax.
    // HEARTH columns bypass the z-buffer (see zBypass in the main DDA
    // loop) so the sprite isn't culled by the front face distance.
    //
    // The cavity is literally see-through: no opaque backdrop is
    // painted. Whatever was drawn by prior passes (floor prepass +
    // back layers) shows through and is merely tinted by the glow.
    hearth_fire: function (ctx, col, gapStart, gapH, info) {
      var glowA = 0.08 * info.brightness * (1 - Math.min(0.85, info.fogFactor));
      if (glowA > 0.01) {
        ctx.fillStyle = 'rgba(255,120,30,' + glowA.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, gapH);
      }
    },

    // CITY_BONFIRE (Olympic community pyre): tall vertical flame column
    // rising from the stone pedestal into the open sky. Unlike the
    // HEARTH cavity — which is a small amber wash behind a billboard —
    // the city bonfire IS the cavity visual: a layered vertical
    // gradient from hot white-yellow at the base, through saturated
    // orange, to near-transparent red at the crown (so sky peeks
    // through). Per-column flicker phases keep adjacent columns and
    // adjacent pyres out of sync so the flame reads as alive.
    //
    // The gradient is anchored to the UNCLIPPED gap extents (computed
    // from info.ff.hUpper / info.ff.hLower) so band proportions stay
    // correct even when the viewport clips the top of the pyre —
    // otherwise walking up close would squish the crown into a red
    // band instead of fading out against the sky.
    //
    // Runs one createLinearGradient per visible column. At close range
    // that is ~16–32 gradients per frame; well within budget.
    city_bonfire_fire: function (ctx, col, gapStart, gapH, info) {
      if (gapH <= 0) return;
      var ff = info.ff;
      if (!ff) return;

      var whMult = info.wallHeightMult;
      var lineH  = info.lineH;
      var wallTop = info.wallTop;

      // Full (unclipped) gap extents in screen pixels. The gradient is
      // anchored here so band proportions stay correct at close range.
      var fullGapTop = wallTop + (ff.hUpper / whMult) * lineH;
      var fullGapBot = wallTop + lineH * (1 - ff.hLower / whMult);
      if (fullGapBot - fullGapTop < 1) return;

      // Per-column flicker. Slow sine modulated by column + tile so
      // adjacent columns and adjacent pyres desynchronise naturally.
      var t = Date.now();
      var flicker = 0.88 + 0.12 * Math.sin(
        t * 0.012 + col * 0.31 + info.mapX * 1.7 + info.mapY * 2.9
      );
      var fogFade = 1 - Math.min(0.85, info.fogFactor);
      var bAdj    = info.brightness * flicker * fogFade;

      var aBase  = (0.88 * bAdj).toFixed(3);  // hot core (pedestal top)
      var aMid   = (0.72 * bAdj).toFixed(3);  // body
      var aCrown = (0.34 * bAdj).toFixed(3);  // fade-out cap

      var grad = ctx.createLinearGradient(0, fullGapTop, 0, fullGapBot);
      // Crown (top of gap) — transparent → faint red, sky shows through
      grad.addColorStop(0.00, 'rgba(255, 60, 10, 0)');
      grad.addColorStop(0.15, 'rgba(220, 60, 15, ' + aCrown + ')');
      // Upper body — red-orange
      grad.addColorStop(0.35, 'rgba(240, 110, 30, ' + aMid   + ')');
      // Mid body — warm orange
      grad.addColorStop(0.55, 'rgba(255, 150, 40, ' + aMid   + ')');
      // Lower body — yellow-orange
      grad.addColorStop(0.78, 'rgba(255, 200, 90, ' + aBase  + ')');
      // Base (flush with pedestal top) — hot white-yellow core
      grad.addColorStop(1.00, 'rgba(255, 235, 170, ' + aBase + ')');

      ctx.fillStyle = grad;
      ctx.fillRect(col, gapStart, 1, gapH);
    },

    // DUMP_TRUCK spool cavity: transparent ground-level slot through the
    // truck body housing the pressure-wash hose reel. Follows the same
    // pattern as hearth_fire — the cavity is LITERALLY see-through and
    // painted with nothing but a subtle cool-blue tint on top of the
    // back-layer content the freeform see-through logic has already
    // emitted behind the tile. The 🧵 spool glyph itself is NOT drawn
    // here: DumpTruckSprites emits a billboard sprite at the tile center
    // (mirror of BonfireSprites for HEARTH) and the z-bypass path lets
    // that billboard render even though the truck's front face is closer
    // to the camera than the sprite. The result is "the player looks
    // into the slot and sees the reel bobbing inside," NOT "a blue
    // rubber band painted across the truck."
    //
    // If the filler painted anything opaque the cavity would become an
    // emoji-coloured band on the wall face — which is exactly the bug
    // this rewrite fixes. KEEP THIS TRANSPARENT.
    truck_spool_cavity: function (ctx, col, gapStart, gapH, info) {
      if (gapH <= 0) return;
      // Cool-blue "pressure wash" tint. Alpha scales with brightness
      // and inverse fog so the glow fades at distance, matching the
      // hearth_fire warm-glow pattern exactly.
      var glowA = 0.10 * info.brightness * (1 - Math.min(0.85, info.fogFactor));
      if (glowA > 0.01) {
        ctx.fillStyle = 'rgba(70, 130, 200, ' + glowA.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, gapH);
      }
    },

    // WELL water cavity: dark blue-black surface with faint ripple
    // shimmer. The cavity is see-through (floor prepass + back layers
    // show through), tinted with a deep-water blue. A subtle per-column
    // sine shimmer on the alpha reads as water surface without needing
    // a full reflection render pass. Used at the base of the 0.50-unit
    // circular stone rim — player looks at the well from the side and
    // sees dark water below the lip.
    well_water: function (ctx, col, gapStart, gapH, info) {
      if (gapH <= 0) return;
      var fogFade = 1 - Math.min(0.85, info.fogFactor);
      var t = Date.now();
      // Slow ripple shimmer — subtle enough to read as "surface glint"
      var shimmer = 0.85 + 0.15 * Math.sin(
        t * 0.004 + col * 0.47 + info.mapX * 2.1 + info.mapY * 1.3
      );
      var a = 0.35 * info.brightness * fogFade * shimmer;
      if (a > 0.01) {
        ctx.fillStyle = 'rgba(8, 18, 35, ' + a.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, gapH);
      }
    },

    // CHARGING_CRADLE conduit glow: bright blue energy stripe visible
    // through the frame's cavity. Same transparent-base pattern as
    // hearth_fire / truck_spool_cavity. Flickers at mains frequency
    // (~60 Hz visual, modulated down to a visible 2-3 Hz rate).
    cradle_conduit: function (ctx, col, gapStart, gapH, info) {
      if (gapH <= 0) return;
      var fogFade = 1 - Math.min(0.85, info.fogFactor);
      var t = Date.now();
      var pulse = 0.7 + 0.3 * Math.sin(t * 0.008 + col * 0.15 + info.mapY * 0.5);
      var a = 0.22 * info.brightness * fogFade * pulse;
      if (a > 0.01) {
        ctx.fillStyle = 'rgba(50, 140, 220, ' + a.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, gapH);
      }
    },

    // NOTE: window_tavern_interior and related window fillers are
    // registered at Layer 3 init time from engine/window-sprites.js via
    // Raycaster.registerFreeformGapFiller(). That module owns the
    // per-floor exterior-face cache the fillers read from, so the
    // fillers close over WindowSprites state naturally. See
    // docs/LIVING_WINDOWS_ROADMAP.md §4 for the window depth contract.
    //
    // facade_door and trapdoor_shaft are registered from
    // engine/door-sprites.js.
  };

  function register(key, fn) {
    if (typeof key !== 'string' || typeof fn !== 'function') return false;
    _gapFillers[key] = fn;
    return true;
  }

  function getRegistry() {
    return _gapFillers;
  }

  // ── Alpha-range cache for alpha-mask freeform (Phase 3) ──────────
  // For tiles with `gapTexAlpha: true`, the gap boundary is not a flat
  // row-range but varies per texture column based on the texture's
  // alpha channel. This helper walks a texture column once, finds the
  // contiguous transparent (α < 128) row range, and caches the result
  // per (textureId, texX) pair so subsequent frames are a plain lookup.
  //
  // Cache key: "texId:texX". Value: { topOpaque, botOpaque } — the
  // last fully opaque row counting from the top, and the first fully
  // opaque row counting from the bottom. The gap occupies
  // [topOpaque+1 .. botOpaque-1]. If the column has no transparent
  // pixels, topOpaque = texHeight-1 and botOpaque = 0 (no gap).

  var _alphaRangeCache = {};

  /**
   * Walk texture column `texX` and return { topOpaque, botOpaque }.
   * Cached per texture ID + column index.
   * @param {Object} tex   - TextureAtlas texture { width, height, data }
   * @param {string} texId - Texture ID (for cache keying)
   * @param {number} texX  - Column index (0..width-1)
   * @returns {{ topOpaque: number, botOpaque: number }}
   */
  function computeAlphaRange(tex, texId, texX) {
    var cacheKey = texId + ':' + texX;
    if (_alphaRangeCache[cacheKey]) return _alphaRangeCache[cacheKey];

    var w = tex.width;
    var h = tex.height;
    var d = tex.data;  // Uint8ClampedArray, RGBA stride
    var topOpaque = h - 1;  // default: no gap (entire column opaque)
    var botOpaque = 0;

    // Walk down from top — find last opaque row before first transparent
    for (var y = 0; y < h; y++) {
      var a = d[(y * w + texX) * 4 + 3];
      if (a < 128) { topOpaque = y - 1; break; }
    }

    // Walk up from bottom — find last opaque row before first transparent
    for (var y2 = h - 1; y2 >= 0; y2--) {
      var a2 = d[(y2 * w + texX) * 4 + 3];
      if (a2 < 128) { botOpaque = y2 + 1; break; }
    }

    // Sanity: if topOpaque >= botOpaque there's no transparent band
    // in this column (fully opaque or fully transparent edge case).
    if (topOpaque < 0) topOpaque = 0;
    if (botOpaque > h - 1) botOpaque = h - 1;

    var result = { topOpaque: topOpaque, botOpaque: botOpaque };
    _alphaRangeCache[cacheKey] = result;
    return result;
  }

  /**
   * Flush the alpha-range cache. Call on floor transition or when
   * textures are regenerated.
   */
  function clearAlphaRangeCache() {
    _alphaRangeCache = {};
  }

  return Object.freeze({
    register: register,
    getRegistry: getRegistry,
    computeAlphaRange: computeAlphaRange,
    clearAlphaRangeCache: clearAlphaRangeCache
  });
})();

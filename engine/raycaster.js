/**
 * Raycaster — Wolfenstein-style DDA raycaster for first-person dungeon view.
 * Reads spatial contracts for wall height, fog model, parallax, ceiling type.
 *
 * Features:
 *   - Variable wall height (per contract + per-room chamber overrides)
 *   - Tile height offsets (Doom rule: doors render raised/sunken per contract)
 *   - Three fog models: FADE (exterior), CLAMP (interior), DARKNESS (dungeon)
 *   - Parallax background layers
 *   - Floor/ceiling gradients driven by contract
 *   - Sprite billboard rendering (enemies, items)
 */
var Raycaster = (function () {
  'use strict';

  // Main canvas — owned by the page, stays at native CSS resolution so
  // HUD / minimap / menus / overlays all draw at full fidelity. We DO NOT
  // shrink this canvas when RENDER_SCALE < 1.0 — only the 3D viewport
  // offscreen canvas is shrunk. The main canvas is used solely by the
  // final blit at the end of render() to copy the offscreen into place.
  var _canvas = null;      // <canvas> DOM element (main)
  var _mainCtx = null;     // main canvas 2d context (full-res)

  // Offscreen 3D viewport — internal render target. All raycasting,
  // floor casting, wall drawing, sprite billboards write here. Its dims
  // = CSS size × RENDER_SCALE. At the end of render(), it's blitted
  // (nearest-neighbor) onto the main canvas at full CSS size.
  var _offCanvas = null;
  var _ctx = null;         // offscreen 2d context — "ctx" throughout render code means this
  var _width = 0;          // offscreen width  (= cssW * scale)
  var _height = 0;         // offscreen height (= cssH * scale)
  var _zBuffer = [];

  // ── Internal render resolution (pixel-cost lever) ────────────────
  // The raycaster is pure-JS per-pixel. Every doubling of either axis
  // roughly quadruples per-frame cost because _renderFloor paints every
  // floor pixel in JavaScript and the column loop casts one ray per
  // pixel column. Classic software raycasters (Doom, Wolf3D) rendered
  // at a small fixed backing store and scaled up — we do the same.
  //
  //   RENDER_SCALE = fraction of the display's CSS size to cast at.
  //     1.00 → native (e.g. 1920×925)
  //     0.75 → 1440×693 (~56% of native pixels)
  //     0.50 → 960×462  (~25% of native pixels, 4× faster)
  //     0.33 → 633×305  (~11% of native pixels, 9× faster)
  //     0.25 → 480×231  (~6%  of native pixels, 16× faster)
  //
  // `_ctx.imageSmoothingEnabled = false` (set in init) keeps the CSS
  // upscale crisp-pixelated rather than blurry. Re-applied after every
  // _resize because some browsers reset it on canvas backing-store
  // changes.
  var RENDER_SCALE = 1.0;
  var RENDER_SCALE_KEY = 'dg_render_scale';
  try {
    var _savedScale = parseFloat(localStorage.getItem(RENDER_SCALE_KEY));
    if (!isNaN(_savedScale) && _savedScale >= 0.2 && _savedScale <= 1.0) {
      RENDER_SCALE = _savedScale;
    }
  } catch (e) { /* no localStorage — keep default */ }

  // ── Pedestal occlusion mask (parallel to _zBuffer) ──────────────
  // Freeform tiles with a solid lower band (HEARTH base stone,
  // CITY_BONFIRE limestone pedestal) set these per column so sprites
  // positioned BEHIND the pedestal (not inside the same cell) get
  // their bottom half clipped at the pedestal's top screen row.
  // Without this, zBypass lets sprites render straight through the
  // solid stone — NPCs talking to the player across a bonfire appear
  // ghostly from the waist down.
  //
  //   _zBufferPedTopY[col]  — screen Y of the pedestal's top edge
  //                           (unclipped; may be off-screen). 0 = no
  //                           pedestal in this column.
  //   _zBufferPedDist[col]  — perpDist of the pedestal's front face.
  //                           0 = no pedestal.
  //   _zBufferPedMX[col]    — map X of the pedestal tile. -1 = none.
  //   _zBufferPedMY[col]    — map Y of the pedestal tile. -1 = none.
  //
  // The sprite renderer uses (mx,my) to detect same-tile sprites
  // (dragonfire emoji inside HEARTH cavity) and skip clipping there.
  var _zBufferPedTopY = [];
  var _zBufferPedDist = [];
  var _zBufferPedMX   = [];
  var _zBufferPedMY   = [];

  // Floor casting buffer (reused across frames to avoid GC)
  var _floorImgData = null;
  var _floorBufW = 0;
  var _floorBufH = 0;

  // Wall colors per biome
  var _wallColors = {
    light: '#8a7a6a', dark: '#6a5a4a',
    door: '#b08040', doorDark: '#906830'
  };

  // Active spatial contract (set per floor)
  var _contract = null;
  var _bloodFloorId = null;  // Set by Game to enable blood rendering
  var _rooms = null;        // Room list for chamber height lookups
  var _cellHeights = null;  // Per-cell height overrides (door entrance caps)
  var _wallDecor = null;    // Per-cell wall decoration sprites (set per floor)

  // ── N-layer compositing ──────────────────────────────────────────
  // Pre-allocated buffer for multi-hit DDA results. Avoids per-frame
  // allocation. Each layer stores the grid hit info; geometry (perpDist,
  // drawStart, etc.) is computed on-demand during back-to-front render.
  // Back-layer capacity. Sized for the boosted renderDist regime
  // (up to ~48 cells at RENDER_SCALE 0.5): a contiguous freeform
  // cluster like a pergola beam ring can eat 3-4 slots on its own
  // before the ray reaches any meaningful back geometry, so 6 was
  // too tight — distant walls / gates fell off the end. 8 gives
  // room for: near freeform cluster (2-3) + back face + back wall
  // + distant gate pair + skyline. Each additional slot costs one
  // extra _layerBuf struct at init and one extra strip draw in the
  // rare column where collection actually fills the buffer.
  var _MAX_LAYERS = 8;
  var _MAX_BG_STEPS = 24; // max DDA steps past first hit (increased for deeper views)
  var _layerBuf = [
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 }
  ];

  // ── Freeform two-segment wall feature flag ───────────────────────
  // Phase 1 of the raycast freeform upgrade. When enabled, tiles
  // registered in `contract.tileFreeform` (currently only HEARTH) render
  // as upper brick band + fire cavity + lower brick band instead of
  // the legacy step-fill lip trick. Toggle via URL param ?freeform=1
  // or via Raycaster.setFreeformEnabled(bool) at runtime.
  // See docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md.
  var _freeformEnabled = true;
  try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      var _qs = window.location.search;
      if (_qs.indexOf('freeform=0') >= 0) _freeformEnabled = false;
      if (_qs.indexOf('freeform=1') >= 0) _freeformEnabled = true;
    }
  } catch (e) {}

  // ── Freeform gap filler registry ─────────────────────────────────
  // When a freeform tile's two-segment render produces a visible cavity
  // (upper band + gap + lower band), the gap is painted by a registered
  // filler function selected via the tile's contract entry:
  //
  //   tileFreeform[TILE] = { hUpper, hLower, fillGap: 'my_key' }
  //
  // The raycaster looks up `fillGap` in `_gapFillers` and calls the
  // function with the shared `_gapInfo` object describing the column
  // state. Tiles without a `fillGap` slot use the `_default` filler
  // (dark placeholder — easy to spot unstyled cavities during dev).
  //
  // This is the shared "freeform gap filler" extension point called
  // out in docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md §3.5 — the same
  // pipeline is used by HEARTH (fire glow), CIVILIZED_BONFIRE (Phase 2
  // fire column), WELL (water surface), DUMP_TRUCK (trash fill), and
  // any future cavity-bearing tile. Layer-3 modules (e.g. WellSprites,
  // DumpTruckSprites) should register their fillers via
  // Raycaster.registerFreeformGapFiller(key, fn) during init instead
  // of editing raycaster.js. That keeps per-tile gap behavior out of
  // the hot path module and next to the module that owns the tile.
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
  //   info      — see field list in `_gapInfo` below
  var _gapInfo = {
    brightness: 1,
    fogFactor: 0,
    fogColor: null,
    tintStr: null,
    tintIdx: null,
    tintRGB: null,
    mapX: 0,
    mapY: 0,
    side: 0,
    perpDist: 0,
    hitTile: 0,
    wallX: 0,
    wallTop: 0,
    lineH: 0,
    halfH: 0,
    screenH: 0,
    wallHeightMult: 1,
    // Gap band extent in world units (handy for content that needs
    // to know "how tall is the cavity physically" — e.g. reflection
    // offset on a water surface).
    gapWorldH: 0,
    // Reference to the active tile's frozen freeform config
    // ({ hUpper, hLower, fillGap }). Fillers that need to compute
    // unclipped gap extents (e.g. the city bonfire's vertical flame
    // gradient) read `ff.hUpper` and `ff.hLower` to project band
    // boundaries independent of viewport clipping.
    ff: null
  };

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
    }

    // NOTE: window_tavern_interior is registered at Layer 3 init time
    // from engine/window-sprites.js via registerFreeformGapFiller().
    // That module owns the per-floor exterior-face cache the filler
    // reads from (for skipping interior paint on non-exterior faces),
    // so the filler closes over WindowSprites state naturally. See
    // docs/LIVING_WINDOWS_ROADMAP.md §4 for the window depth contract.
  };

  function registerFreeformGapFiller(key, fn) {
    if (typeof key !== 'string' || typeof fn !== 'function') return false;
    _gapFillers[key] = fn;
    return true;
  }

  // ── Debug layer trace (URL param ?debug=1) ───────────────────────
  // Dumps the N-layer collection buffer for a sparse set of sample
  // columns on the next rendered frame. Press `P` in-game to arm a
  // one-shot trace. Gate is a single boolean check per column so the
  // hot path stays free when debug is off.
  // Sample layout: 13 columns across the viewport (every w/12, plus
  // exact center). Output is a flat console log sequence the user can
  // copy-paste back.
  var _debugEnabled = false;
  var _debugTraceOnce = false;
  try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      if (window.location.search.indexOf('debug=1') >= 0) {
        _debugEnabled = true;
      }
    }
  } catch (e) {}
  if (_debugEnabled && typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'p' || e.key === 'P') {
        _debugTraceOnce = true;
        try { console.log('[RC-DBG] trace armed — next frame will dump sampled columns'); } catch (_) {}
      }
    });
  }

  function init(canvas) {
    _canvas = canvas;
    _mainCtx = canvas.getContext('2d');
    _mainCtx.imageSmoothingEnabled = false;
    if (_mainCtx.webkitImageSmoothingEnabled !== undefined) _mainCtx.webkitImageSmoothingEnabled = false;

    // Create the offscreen 3D viewport canvas. All internal rendering
    // targets this surface; the main canvas only receives a single
    // scaled drawImage blit per frame.
    _offCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    _ctx = _offCanvas ? _offCanvas.getContext('2d') : null;
    if (_ctx) {
      _ctx.imageSmoothingEnabled = false;
      if (_ctx.webkitImageSmoothingEnabled !== undefined) _ctx.webkitImageSmoothingEnabled = false;
    }

    _resize();
    window.addEventListener('resize', _resize);
  }

  function _resize() {
    var container = _canvas.parentElement;
    var cssW = container.clientWidth;
    var cssH = container.clientHeight;

    // ── Main canvas: always at native CSS resolution ────────────────
    // The main canvas hosts all UI drawing (HUD, minimap, menus,
    // dialog box, overlays). Keeping it at full CSS size means layout
    // math based on _canvas.width / _canvas.height stays correct
    // regardless of RENDER_SCALE.
    _canvas.width  = Math.max(2, cssW);
    _canvas.height = Math.max(2, cssH);
    _canvas.style.width  = cssW + 'px';
    _canvas.style.height = cssH + 'px';

    // Browsers reset smoothing when backing store is resized.
    if (_mainCtx) {
      _mainCtx.imageSmoothingEnabled = false;
      if (_mainCtx.webkitImageSmoothingEnabled !== undefined) {
        _mainCtx.webkitImageSmoothingEnabled = false;
      }
    }

    // ── Offscreen 3D viewport: CSS size × RENDER_SCALE ──────────────
    // This is the pixel-cost lever. Every per-pixel raycaster op
    // (floor casting, column fills, sprite columns) runs against this
    // smaller surface, then a single drawImage upscales it crisp.
    var scale = RENDER_SCALE;
    if (scale > 1.0) scale = 1.0;
    if (scale < 0.2) scale = 0.2;
    if (_offCanvas) {
      _offCanvas.width  = Math.max(2, Math.floor(cssW * scale));
      _offCanvas.height = Math.max(2, Math.floor(cssH * scale));
      _width  = _offCanvas.width;
      _height = _offCanvas.height;
      if (_ctx) {
        _ctx.imageSmoothingEnabled = false;
        if (_ctx.webkitImageSmoothingEnabled !== undefined) {
          _ctx.webkitImageSmoothingEnabled = false;
        }
      }
    } else {
      _width  = _canvas.width;
      _height = _canvas.height;
    }

    _zBuffer = new Array(_width);
    _zBufferPedTopY = new Array(_width);
    _zBufferPedDist = new Array(_width);
    _zBufferPedMX   = new Array(_width);
    _zBufferPedMY   = new Array(_width);
    for (var _i = 0; _i < _width; _i++) {
      _zBufferPedTopY[_i] = 0;
      _zBufferPedDist[_i] = 0;
      _zBufferPedMX[_i]   = -1;
      _zBufferPedMY[_i]   = -1;
    }

    // Floor buffer is tied to backing store dims — invalidate so the
    // next frame re-allocates at the new size.
    _floorImgData = null;
    _floorBufW = 0;
    _floorBufH = 0;
  }

  // Public: change render scale at runtime. Clamps, persists, resizes.
  function setRenderScale(s) {
    if (typeof s !== 'number' || isNaN(s)) return;
    if (s > 1.0) s = 1.0;
    if (s < 0.2) s = 0.2;
    RENDER_SCALE = s;
    try { localStorage.setItem(RENDER_SCALE_KEY, String(s)); } catch (e) {}
    if (_canvas) _resize();
  }

  function getRenderScale() { return RENDER_SCALE; }

  function setBiomeColors(biome) {
    if (!biome || !biome.wallLight) return;
    _wallColors.light = biome.wallLight;
    _wallColors.dark = biome.wallDark;
    _wallColors.door = biome.door || '#b08040';
    _wallColors.doorDark = biome.doorDark || '#906830';
  }

  /** Set the active spatial contract, room list, cell height overrides, and wall decor */
  function setContract(contract, rooms, cellHeights, wallDecor) {
    _contract = contract;
    _rooms = rooms || null;
    _cellHeights = cellHeights || null;
    _wallDecor = wallDecor || null;
  }

  /**
   * Render a frame.
   * @param {Object} player - { x, y, dir }
   * @param {Array[]} grid - 2D tile grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {Array} [sprites]
   * @param {Object} [lightMap]
   */
  function render(player, grid, gridW, gridH, sprites, lightMap) {
    var ctx = _ctx;
    var w = _width;
    var h = _height;
    // Horizon line — shifted by lookPitch for vertical free look.
    // Negative pitch = look down (horizon moves up, more floor visible).
    // Positive pitch = look up (horizon moves down, more ceiling/sky).
    var rawHalfH = h / 2;
    var pitchShift = (player.pitch || 0) * rawHalfH;
    var halfH = Math.max(20, Math.min(h - 20, rawHalfH - pitchShift));
    var fov = Math.PI / 3;
    var halfFov = fov / 2;

    // Read contract (fall back to defaults if none set)
    var baseRenderDist = _contract ? _contract.renderDistance : 16;
    var baseFogDist    = _contract ? _contract.fogDistance : 12;
    var fogColor       = _contract ? _contract.fogColor : { r: 0, g: 0, b: 0 };
    var baseWallH      = _contract ? _contract.wallHeight : 1.0;

    // ── Render-scale-aware distance boost ──────────────────────────
    // The pixel-cost lever (RENDER_SCALE) shrinks the offscreen
    // viewport quadratically: at 0.5 scale the raycaster paints ~25%
    // of the pixels it used to. That headroom lets us cast FURTHER
    // without losing framerate. Linear boost = 1/scale keeps per-
    // column DDA cost roughly constant while the per-pixel floor
    // caster gets a free quadratic win. Clamped so contracts with
    // very short renderDistance (small interior rooms) don't blow up
    // into absurd depths.
    var _distBoost = (RENDER_SCALE > 0.01) ? (1.0 / RENDER_SCALE) : 1.0;
    if (_distBoost < 1.0) _distBoost = 1.0;
    // Cap: exterior floors already cast 20 tiles; 4× that = 80 is a
    // sensible ceiling even with a huge gridW. Interior contracts cap
    // naturally at their grid edge.
    var _MAX_BOOSTED_DIST = 80;
    var renderDist = Math.min(_MAX_BOOSTED_DIST, baseRenderDist * _distBoost);
    // Fog distance rides the same multiplier so the ramp start and
    // end both expand together — keeps the fog curve looking correct
    // (not a hard clamp wall at a distant edge).
    var fogDist    = Math.min(_MAX_BOOSTED_DIST * 0.8, baseFogDist * _distBoost);

    // ── Light tint maps (colored glow from dynamic light sources) ──
    var _hasLighting = typeof Lighting !== 'undefined';
    var tintStr = _hasLighting && Lighting.getTintStrength ? Lighting.getTintStrength() : null;
    var tintIdx = _hasLighting && Lighting.getTintIndex ? Lighting.getTintIndex() : null;
    var tintRGB = _hasLighting && Lighting.TINT_RGB ? Lighting.TINT_RGB : null;

    // ── DayCycle atmosphere tint (exterior floors only) ──
    // Multiplies fog color by the time-of-day tint for dawn/dusk/night shifts.
    if (_contract && _contract.ceilingType === 'sky' &&
        typeof DayCycle !== 'undefined') {
      var tint = DayCycle.getAtmosphereTint();
      fogColor = {
        r: Math.round(fogColor.r * tint.r),
        g: Math.round(fogColor.g * tint.g),
        b: Math.round(fogColor.b * tint.b)
      };
    }

    // ── Background: ceiling + floor gradients from contract ──
    // Use Skybox for exterior contracts (ceilingType === SKY)
    var useSkybox = _contract && _contract.ceilingType === 'sky' &&
                    typeof Skybox !== 'undefined' && _contract.skyPreset;

    if (useSkybox) {
      Skybox.render(ctx, w, halfH, player.dir, _contract.skyPreset, 16);
    } else {
      var grads = _contract ? SpatialContract.getGradients(_contract)
        : { ceilTop: '#111', ceilBottom: '#222', floorTop: '#444', floorBottom: '#111' };
      var cGrad = ctx.createLinearGradient(0, 0, 0, halfH);
      cGrad.addColorStop(0, grads.ceilTop);
      cGrad.addColorStop(1, grads.ceilBottom);
      ctx.fillStyle = cGrad;
      ctx.fillRect(0, 0, w, halfH);
    }

    // ── Floor: textured floor casting or gradient fallback ──
    var floorTexId = _contract ? SpatialContract.getFloorTexture(_contract) : null;
    var floorTex = floorTexId && typeof TextureAtlas !== 'undefined'
      ? TextureAtlas.get(floorTexId) : null;

    // Resolve per-tile floor texture overrides (e.g. grass under trees)
    var tileFloorTexArr = null;
    if (_contract && _contract.tileFloorTextures && typeof TextureAtlas !== 'undefined') {
      tileFloorTexArr = [];
      var _tft = _contract.tileFloorTextures;
      for (var _tfk in _tft) {
        if (_tft.hasOwnProperty(_tfk)) {
          var _tfTex = TextureAtlas.get(_tft[_tfk]);
          if (_tfTex) tileFloorTexArr[parseInt(_tfk, 10)] = _tfTex;
        }
      }
      if (tileFloorTexArr.length === 0) tileFloorTexArr = null;
    }

    if (floorTex) {
      _renderFloor(ctx, w, h, halfH, player, fov, baseWallH, floorTex,
                   fogDist, fogColor, grid, gridW, gridH, tileFloorTexArr);
    } else {
      var floorGrads = _contract ? SpatialContract.getGradients(_contract)
        : { floorTop: '#444', floorBottom: '#111' };
      var fGrad = ctx.createLinearGradient(0, halfH, 0, h);
      fGrad.addColorStop(0, floorGrads.floorTop);
      fGrad.addColorStop(1, floorGrads.floorBottom);
      ctx.fillStyle = fGrad;
      ctx.fillRect(0, halfH, w, halfH);
    }

    // ── Parallax layers (behind walls, above floor gradient) ──
    if (_contract) {
      var parallax = SpatialContract.getParallax(_contract);
      if (parallax) {
        _renderParallax(ctx, w, h, halfH, parallax, player.dir);
      }
    }

    // ── Cast rays ──
    var px = player.x + 0.5;
    var py = player.y + 0.5;
    var pDir = player.dir;

    // ── Debug trace: snapshot flag for this frame, dump player state ──
    // Snapshot into a frame-local so the trace is atomic — the global
    // flag clears at end of frame, so a keypress between frames queues
    // the next full-frame dump and nothing else.
    var _dbgFrame = _debugTraceOnce;
    if (_dbgFrame) {
      try {
        var _dbgCid = _contract ? (_contract.floorId || _contract.biome || '?') : 'no-contract';
        console.log(
          '[RC-DBG] ===== FRAME TRACE =====\n' +
          '  player px=' + px.toFixed(3) + ' py=' + py.toFixed(3) +
          ' dir=' + pDir.toFixed(3) + ' pitch=' + (player.pitch || 0).toFixed(3) + '\n' +
          '  screen w=' + w + ' h=' + h + ' halfH=' + halfH +
          ' baseWallH=' + baseWallH + ' renderDist=' + renderDist +
          ' fogDist=' + fogDist + '\n' +
          '  contract=' + _dbgCid +
          ' tileWallHeights=' + (_contract && _contract.tileWallHeights ? 'yes' : 'NO') +
          ' freeform=' + _freeformEnabled
        );
      } catch (_dbgErr) { _dbgFrame = false; }
    }
    var _dbgSampleStep = Math.max(1, Math.floor(w / 12));
    var _dbgCenterCol = w >> 1;

    for (var col = 0; col < w; col++) {
      var cameraX = (2 * col / w) - 1;
      var rayAngle = pDir + Math.atan(cameraX * Math.tan(halfFov));
      var rayDirX = Math.cos(rayAngle);
      var rayDirY = Math.sin(rayAngle);

      // DDA setup
      var mapX = Math.floor(px);
      var mapY = Math.floor(py);
      var deltaDistX = Math.abs(1 / (rayDirX || 1e-10));
      var deltaDistY = Math.abs(1 / (rayDirY || 1e-10));
      var stepX, stepY, sideDistX, sideDistY;

      if (rayDirX < 0) { stepX = -1; sideDistX = (px - mapX) * deltaDistX; }
      else              { stepX = 1;  sideDistX = (mapX + 1 - px) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (py - mapY) * deltaDistY; }
      else              { stepY = 1;  sideDistY = (mapY + 1 - py) * deltaDistY; }

      // DDA traversal
      var hit = false;
      var side = 0;
      var hitTile = TILES.WALL;
      var depth = 0;

      while (!hit && depth < renderDist) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX; mapX += stepX; side = 0;
        } else {
          sideDistY += deltaDistY; mapY += stepY; side = 1;
        }
        depth++;

        if (mapX < 0 || mapX >= gridW || mapY < 0 || mapY >= gridH) {
          hit = true; hitTile = TILES.WALL;
        } else {
          var tile = grid[mapY][mapX];
          if (TILES.isOpaque(tile)) {
            hit = true; hitTile = tile;
          } else if (TILES.isDoor(tile)) {
            hit = true; hitTile = tile;
          }
        }
      }

      // ── N-layer hit collection ────────────────────────────────
      // Continue the DDA past the first hit to collect all solid wall
      // layers along this ray. Enables back-to-front compositing where
      // short foreground tiles (shrubs, pillars) reveal taller walls
      // behind them. The floor pre-pass already painted correct floor
      // texture everywhere below the horizon — wall layers just
      // overdraw on top. Zero overhead on floors without tileWallHeights.
      var _lc = 0; // layer count for this column
      if (hit && _contract && _contract.tileWallHeights) {
        // Record first hit as layer 0
        _layerBuf[0].mx = mapX;
        _layerBuf[0].my = mapY;
        _layerBuf[0].sd = side;
        _layerBuf[0].tile = hitTile;
        _lc = 1;

        // Track tallest TOP EDGE seen in world-space altitude — only
        // collect hits that add visible area above the current stack.
        // Using the top edge (heightOffset + wallHeight/2) rather than
        // slab thickness alone is critical for floating tiles: a roof
        // tile is only ~0.25 thick but sits 2.0 above the ground, so
        // its top at 2.125 clearly extends above a 1.0 building wall
        // whose top is only at 0.5. A pure "wallHeight > prev" check
        // would reject the roof because 0.25 < 1.0, leaving a hole
        // between the crenellations where the flat roof should be.
        //
        // Same-silhouette tiles (shrub behind shrub, wall behind wall
        // at equal height/offset) still get occluded by the closer one
        // and skipped, so layer slots aren't wasted on fully hidden
        // back geometry.
        var _fgWH = SpatialContract.getWallHeight(_contract, mapX, mapY, _rooms, hitTile, _cellHeights);
        var _fgOff = SpatialContract.getTileHeightOffset(_contract, hitTile) || 0;
        var _fgTop = _fgWH / 2 + _fgOff;
        // Floating foregrounds (canopy, crenel, thin roof slabs) don't
        // create a monolithic silhouette: there's an UNDER-SLAB gap
        // (0 → slabBottom) AND an OVER-SLAB gap (slabTop → ∞) where
        // back geometry is still visible. For these, start the
        // occlusion threshold at 0 so ground-level walls behind the
        // slab qualify as back layers — they're visible through the
        // under-slab gap (and through the tooth gaps on crenel tiles).
        // The _cTop > _maxTop progression then handles multi-layer
        // back-to-front ordering correctly: each new layer must be
        // taller than the previous ones to add fresh pixels.
        //
        // Regular (ground-anchored) foregrounds still use their true
        // top edge — only tiles that peek above the fg silhouette
        // contribute new pixels.
        // Freeform tiles (HEARTH etc.) have a transparent cavity band, so
        // back geometry behind them must be collected and rendered — the
        // cavity reveals whatever is beyond. Treat them like floating tiles
        // for layer collection: start _maxTop at 0 so equal-height back
        // walls pass the strict _cTop > _maxTop gate.
        var _fgIsFloating = TILES.isFloating(hitTile);
        var _fgIsFreeformSeeThrough = (_freeformEnabled && TILES.isFreeform(hitTile));
        var _maxTop = (_fgIsFloating || _fgIsFreeformSeeThrough) ? 0 : _fgTop;

        // ── Short-wall back-face injection flag ────────────────────
        // Short walls (height < 1.0×) need their inner face visible so
        // the player sees a solid box, not a paper cutout. The back-face
        // is drawn as a back layer (painter's algorithm); the foreground
        // cap rendering (for furniture tiles) overdraws the top portion,
        // completing the 3D box illusion.
        //
        // Applies to: MAILBOX (0.25×), BONFIRE (0.3×), DUMP_TRUCK (0.5×),
        //   TABLE (0.4×), BED (0.6×), CHEST (0.65–0.7×), BAR_COUNTER (0.8×).
        // Also applies to FLOATING tiles (CANOPY, ROOF_*, PERGOLA) —
        // thin slabs raised high need the opposite wall drawn so they
        // don't look like paper cutouts viewed from one side only.
        //
        // EXCEPTION: ROOF_CRENEL intentionally opts out via
        // isFloatingBackFace(). A crenel tile renders as a single-pane
        // merlon line crowning the wall below it — injecting a back-face
        // would duplicate the tooth silhouette at a slightly offset
        // screen position, reading as a pergola-style double lattice
        // instead of a clean rampart edge. PERGOLA is the dedicated
        // tile type for the double-lattice look and DOES inject.
        //
        // Does NOT apply to: SHRUB, FENCE (exterior see-over tiles —
        // back face would reveal "inside the hedge" which reads wrong).
        var _needBackFace = (
          hitTile === TILES.MAILBOX || hitTile === TILES.BONFIRE ||
          hitTile === TILES.DUMP_TRUCK ||
          hitTile === TILES.TABLE  || hitTile === TILES.BED ||
          hitTile === TILES.CHEST  || hitTile === TILES.BAR_COUNTER ||
          TILES.isFloatingBackFace(hitTile) ||
          // Freeform tiles (HEARTH etc.) inject a back face so that
          // approaching the hearth up close reveals the opposing wall
          // of the fire cavity — matches the mailbox/canopy pattern.
          // The back face re-runs freeform rendering, so its cavity
          // is transparent and the glowing coals behind it show.
          (_fgIsFreeformSeeThrough)
        );

        // Continue DDA to collect up to MAX_LAYERS total hits.
        //
        // Termination is bounded by THREE independent conditions:
        //   1. _lc < _MAX_LAYERS — layer-buffer capacity
        //   2. (_cDep - depth) < _MAX_BG_STEPS — back-step budget past
        //      the first hit (24 cells). This is the correct budget
        //      for this loop because the back-layer collection is
        //      specifically "additional cells PAST the first hit."
        //   3. Grid-edge break below — prevents infinite walk off the map
        //
        // NOTE: Previously this loop also gated on `_cDep < renderDist`
        // which created an asymmetric interior culling bug. For a ray
        // that first-hits at depth=8 (e.g. HEARTH or PILLAR close to the
        // player) and renderDist=14, only 6 additional steps would be
        // allowed — not enough to reach the opposite perimeter wall in
        // a 20-cell interior. Straight-axis rays would squeak through
        // because they don't burn depth on x/y diagonal DDA drift, but
        // off-angle rays ran out of budget mid-room, leaving the back
        // wall collected for a single column while adjacent columns
        // missed it entirely. That produced the "solo column pops in
        // with no peripheral neighbors" artifact.
        //
        // renderDist is the correct cap for the FIRST-hit DDA loop
        // (which must stop somewhere on empty maps), but the BACK-layer
        // loop has its own explicit budget in _MAX_BG_STEPS and its
        // own per-layer fog-skip in _renderBackLayer (`fog > 0.98`
        // returns early). Removing the renderDist cap here lets back
        // layers register consistently across all ray angles; layers
        // that are invisible in fog cost nothing to render.
        var _cSdX = sideDistX, _cSdY = sideDistY;
        var _cMX = mapX, _cMY = mapY, _cSd = 0;
        var _cDep = depth;
        while (_lc < _MAX_LAYERS && (_cDep - depth) < _MAX_BG_STEPS) {
          if (_cSdX < _cSdY) {
            _cSdX += deltaDistX; _cMX += stepX; _cSd = 0;
          } else {
            _cSdY += deltaDistY; _cMY += stepY; _cSd = 1;
          }
          _cDep++;

          if (_cMX < 0 || _cMX >= gridW || _cMY < 0 || _cMY >= gridH) break;

          // Read the next cell's tile once — used by both the back-face
          // dedup gate below and the regular layer-collection check.
          var _cT = grid[_cMY][_cMX];
          var _cTSolid = (TILES.isOpaque(_cT) || TILES.isDoor(_cT));

          // Inject back-face for short walls on first step past the tile.
          // Bounds-checked above — back-face coordinates are always in-grid.
          //
          // DEDUP: when the next cell contains the SAME tile type as the
          // foreground (e.g. a row of PERGOLA_BEAM or a cluster of MAILBOX
          // tiles), its own front face — collected immediately below by
          // the regular branch — already renders at the exact (mx, my, sd)
          // that the back-face injection would write. Emitting both
          // produces a pixel-identical duplicate that burns one of the
          // _MAX_LAYERS slots, starving distant back geometry (gates,
          // buildings, skyline) that would otherwise register farther
          // along the ray. Skip the injection in that case — the next
          // cell's front face serves as the back face already.
          if (_needBackFace && _lc < _MAX_LAYERS) {
            var _skipBackFace = (_cTSolid && _cT === hitTile);
            if (!_skipBackFace) {
              _layerBuf[_lc].mx = _cMX;
              _layerBuf[_lc].my = _cMY;
              _layerBuf[_lc].sd = _cSd;
              _layerBuf[_lc].tile = hitTile;
              _lc++;
            }
            _needBackFace = false;
          }
          if (_cTSolid) {
            var _cH = SpatialContract.getWallHeight(_contract, _cMX, _cMY, _rooms, _cT, _cellHeights);
            var _cOff = SpatialContract.getTileHeightOffset(_contract, _cT) || 0;
            var _cTop = _cH / 2 + _cOff;
            // Record if this tile's top edge rises above the current
            // stack's top — that's the only way it adds visible pixels
            // we haven't already covered. Shorter/lower or equal top
            // tiles are fully occluded by the foreground silhouette.
            if (_cTop > _maxTop) {
              _layerBuf[_lc].mx = _cMX;
              _layerBuf[_lc].my = _cMY;
              _layerBuf[_lc].sd = _cSd;
              _layerBuf[_lc].tile = _cT;
              _lc++;
              // Ground-anchored tiles cover altitude [0, _cTop] fully,
              // so they raise the occlusion threshold and can terminate
              // collection once the stack reaches the practical ceiling.
              // Floating tiles (CANOPY, ROOF_*, crenel) are slabs —
              // they only cover [slabBottom, slabTop] and leave an
              // under-slab gap. Recording them as back layers is
              // correct (they contribute pixels in the slab band),
              // but they must NOT advance _maxTop or trigger the
              // break, because the building wall BEHIND them still
              // needs to register to fill the under-slab gap.
              // Without this skip, a short foreground tile followed
              // by a canopy/crenel along the ray would consume the
              // break condition and leave the tall back wall sky-out.
              //
              // Freeform tiles (HEARTH, future arch/porthole/window)
              // have a transparent cavity band and must NOT advance
              // _maxTop either — the wall behind a hearth/arch needs
              // to register so it can fill the cavity on render.
              var _cIsFreeformSeeThrough = (_freeformEnabled && TILES.isFreeform(_cT));
              if (!TILES.isFloating(_cT) && !_cIsFreeformSeeThrough) {
                _maxTop = _cTop;
                // Stop when the stack covers altitude ≥3.0 — nothing
                // practical in the tileset rises above a 3m top edge,
                // and anything that did would be hidden anyway.
                if (_cTop >= 3.0) break;
              }
            }
            // Same or lower top edge: skip, keep searching
          }
        }
      }

      // ── Debug trace: dump sampled columns' layer buffers ──────
      if (_dbgFrame && (col === _dbgCenterCol || (col % _dbgSampleStep) === 0)) {
        try {
          var _dbgLines = '[RC-DBG] col=' + col +
            ' ray=(' + rayDirX.toFixed(3) + ',' + rayDirY.toFixed(3) + ')' +
            ' hit=' + hit + ' firstTile=' + hitTile +
            ' firstHit=(' + mapX + ',' + mapY + ')' +
            ' depth=' + depth + ' _lc=' + _lc;
          for (var _dbgI = 0; _dbgI < _lc; _dbgI++) {
            var _dL = _layerBuf[_dbgI];
            var _dWh = _contract
              ? SpatialContract.getWallHeight(_contract, _dL.mx, _dL.my, _rooms, _dL.tile, _cellHeights)
              : baseWallH;
            var _dOff = _contract
              ? (SpatialContract.getTileHeightOffset(_contract, _dL.tile) || 0)
              : 0;
            var _dPd;
            if (_dL.sd === 0) {
              _dPd = (_dL.mx - px + (1 - stepX) / 2) / (rayDirX || 1e-10);
            } else {
              _dPd = (_dL.my - py + (1 - stepY) / 2) / (rayDirY || 1e-10);
            }
            _dPd = Math.abs(_dPd);
            if (_dPd < 0.2) _dPd = 0.2;
            var _dLineH = Math.max(2, Math.floor((h * _dWh) / _dPd));
            var _dBaseLH = Math.max(2, Math.floor((h * baseWallH) / _dPd));
            var _dFlatBot = Math.floor(halfH + _dBaseLH / 2);
            var _dFlatTop = _dFlatBot - _dLineH;
            var _dVertShift = Math.floor((h * _dOff) / _dPd);
            var _dDrStart = Math.max(0, _dFlatTop - _dVertShift);
            var _dDrEnd = Math.min(h - 1, _dFlatBot - _dVertShift);
            var _dCapGated = (_dWh < 0.95 && _dWh > 0.25 && _dDrStart > halfH);
            var _dFog = _contract
              ? SpatialContract.getFogFactor(_contract, _dPd, renderDist, fogDist).toFixed(2)
              : Math.min(1, _dPd / fogDist).toFixed(2);
            _dbgLines += '\n  L' + _dbgI +
              ' tile=' + _dL.tile + ' @(' + _dL.mx + ',' + _dL.my + ')' +
              ' sd=' + _dL.sd + ' pd=' + _dPd.toFixed(2) +
              ' wh=' + _dWh + ' off=' + _dOff +
              ' draw=[' + _dDrStart + ',' + _dDrEnd + ']' +
              ' lineH=' + _dLineH + ' baseLH=' + _dBaseLH +
              ' fog=' + _dFog +
              (_dCapGated ? ' CAP' : '');
          }
          console.log(_dbgLines);
        } catch (_dbgErr2) {}
      }

      // ── Handle no-hit: consult spatial contract ──
      if (!hit) {
        if (_contract) {
          var distRes = SpatialContract.resolveDistantWall(_contract, renderDist, renderDist);
          if (distRes.draw && distRes.isClamped) {
            // Draw a clamped wall at render distance (CLAMP / DARKNESS model)
            var clampH = Math.floor(h * baseWallH / renderDist);
            var clampStart = Math.max(0, Math.floor(halfH - clampH / 2));
            var clampEnd = Math.min(h - 1, Math.floor(halfH + clampH / 2));
            ctx.fillStyle = distRes.clampColor;
            ctx.fillRect(col, clampStart, 1, clampEnd - clampStart + 1);
          }
          // FADE model: don't draw anything — sky/parallax shows through
        }
        _zBuffer[col] = renderDist;
        _zBufferPedDist[col] = 0;  // no pedestal in this column
        _zBufferPedMX[col]   = -1;
        _zBufferPedMY[col]   = -1;
        continue;
      }

      // Perpendicular distance (avoids fisheye)
      var perpDist;
      if (side === 0) {
        perpDist = (mapX - px + (1 - stepX) / 2) / (rayDirX || 1e-10);
      } else {
        perpDist = (mapY - py + (1 - stepY) / 2) / (rayDirY || 1e-10);
      }
      perpDist = Math.abs(perpDist);

      // Minimum perpDist clamp — prevents division-by-near-zero when
      // peripheral rays graze very close surfaces. With ±32° free-look
      // the effective viewport spans up to ±62° total, so peripheral
      // rays can get very shallow. The UV clipping below handles
      // arbitrarily large lineHeight correctly; this clamp is only
      // needed to prevent numeric instability in 1/perpDist.
      if (perpDist < 0.2) perpDist = 0.2;

      // ── Wall height: contract tileWallHeights → chamber override → base ──
      var wallHeightMult = baseWallH;
      if (_contract) {
        wallHeightMult = SpatialContract.getWallHeight(_contract, mapX, mapY, _rooms, hitTile, _cellHeights);
      }

      // Z-buffer: initial write based on the tile's class. This is a
      // DEFAULT — the short ground-wall block further below (after
      // drawStart/drawEnd are known) may override this and populate
      // the pedestal mask for partial sprite clipping.
      //
      //   • DUMP_TRUCK — legacy short-body representation, always
      //     renderDist so the hose billboard floats above. Will be
      //     rebuilt as a 2×1×1 vehicle (see pending spec below).
      //   • Freeform tiles — zBypass so their transparent cavity
      //     lets sprites/back-layers show through; the foreground
      //     helper owns its own pedestal mask write for the solid
      //     bands.
      //   • Ultra-short props (<0.35×) — already transparent to the
      //     sprite pass via the legacy threshold; the post-hoc
      //     short-wall block upgrades them to also publish a clip Y.
      //   • Tall walls (≥1.0×) — normal perpDist occlusion.
      var _zBypass = (hitTile === TILES.DUMP_TRUCK) ||
                     (_freeformEnabled && TILES.isFreeform(hitTile));
      _zBuffer[col] = (!_zBypass && wallHeightMult > 0.35) ? perpDist : renderDist;
      // Default-clear the pedestal mask for this column. Freeform
      // tiles populate it inside _renderFreeformForeground; short
      // ground walls populate it in the dedicated block below.
      _zBufferPedDist[col] = 0;
      _zBufferPedMX[col]   = -1;
      _zBufferPedMY[col]   = -1;
      // No cap on lineHeight — proper texture UV clipping handles
      // close-range walls. Removing the cap fixes the stretch bug where
      // nearby walls widen (more columns) without getting proportionally
      // taller, because the old h*3 cap limited height but not width.
      // MIN WALL BAND: always render at least 2px strip so distant walls
      // never vanish — maintains LOD silhouette at any range.
      var lineHeight = Math.max(2, Math.floor((h * wallHeightMult) / perpDist));

      // ── Tile height offset (Doom rule) ──────────────────────────
      // Transition tiles are vertically displaced from the floor plane.
      // Positive = raised platform (wall shifts up, step visible below).
      // Negative = sunken recess (wall shifts down, lip visible above).
      // The shift scales with distance identically to lineHeight so
      // perspective stays correct at all depths.
      var heightOffset = _contract
        ? SpatialContract.getTileHeightOffset(_contract, hitTile)
        : 0;

      // ── Freeform two-segment config lookup ─────────────────────
      // If the active contract has a tileFreeform entry for this
      // tile (currently HEARTH in interior()), render as upper brick
      // band + fire cavity + lower brick band instead of the legacy
      // sunken step-fill lip trick. Suppress heightOffset in that
      // case — the cavity comes from the segment split, not a
      // displacement offset.
      //
      // Degenerate guard: when hUpper + hLower ≥ wallHeightMult the
      // bands would overlap, so fall back to the legacy single-segment
      // render. This preserves the short-stub HEARTH look biomes use
      // for decorative fireplaces (inn, cellar).
      var freeformCfg = null;
      if (_freeformEnabled && _contract && TILES.isFreeform(hitTile)) {
        freeformCfg = SpatialContract.getTileFreeform(_contract, hitTile);
        if (freeformCfg &&
            (freeformCfg.hUpper + freeformCfg.hLower) >= wallHeightMult - 1e-6) {
          freeformCfg = null;
        }
      }
      if (freeformCfg) {
        heightOffset = 0;  // suppress Doom-rule displacement
      }

      var vertShift = Math.floor((h * heightOffset) / perpDist);

      // Unshifted positions (where the wall would draw at floor level)
      // For tiles with tileWallHeights override (e.g. TREE at 2×), anchor
      // the bottom at normal floor level and extend upward only. Without
      // this, centered positioning makes tall walls grow symmetrically
      // above and below the horizon, clipping into the floor.
      var baseLineH = Math.floor((h * baseWallH) / perpDist);
      var flatBottom = Math.floor(halfH + baseLineH / 2);
      var flatTop    = flatBottom - lineHeight;

      // Shifted positions (where the wall actually draws)
      var drawStart = Math.max(0, flatTop - vertShift);
      var drawEnd   = Math.min(h - 1, flatBottom - vertShift);

      // ── Short ground-wall pedestal mask ──────────────────────────
      // Any tile shorter than a full wall that sits at plaza grade
      // (no positive Doom-rule height offset) should NOT cull sprites
      // behind it — players need to see an NPC's head & torso above
      // a hedge, fence, mailbox, or bonfire ring. We override the
      // default z-buffer (which would cull fully) to renderDist and
      // publish the wall-top screen row into the pedestal mask so
      // the sprite pass clips the bottom half of far sprites.
      //
      // Excluded:
      //   • Freeform tiles — they own their own mask write inside
      //     _renderFreeformForeground (different band math).
      //   • DUMP_TRUCK — the current short-body representation is a
      //     known wrong spec that will be rebuilt as a 2×1×1 full-
      //     height vehicle. Leaving it untouched here keeps the
      //     existing billboard rendering stable until the rebuild.
      //   • Elevated tiles (heightOffset > 0) — roofs, canopies,
      //     crenels, pergolas etc. These occupy a mid-height band
      //     (not bottom-anchored), so a single bottom clip would be
      //     wrong. Handled as a future 'band clip' pass.
      if (!freeformCfg &&
          hitTile !== TILES.DUMP_TRUCK &&
          wallHeightMult < 1.0 - 1e-6 &&
          heightOffset <= 0) {
        _zBuffer[col] = renderDist;
        _zBufferPedTopY[col] = flatTop - vertShift;
        _zBufferPedDist[col] = perpDist;
        _zBufferPedMX[col]   = mapX;
        _zBufferPedMY[col]   = mapY;
      }

      // ── Crenellated tile silhouette cutout (foreground) ──────────
      // ROOF_CRENEL (and any future isCrenellated tile) gets a
      // per-column tooth pattern on its top half. 4 merlons per tile
      // UV = 8 alternating bands along wallX. In crenel-gap bands we
      // raise drawStart by half the slab's screen height, clipping
      // the top half of the wall column to nothing. The solid bottom
      // half remains, so the player sees alternating "tooth / notch"
      // along the rampart edge. The back face (injected via
      // _needBackFace) gets the same treatment in _renderBackLayer.
      //
      // wallX has already been folded to [0,1) and flipped for
      // consistent left-to-right; same for the back face, so the
      // tooth pattern reads identically from both sides of the slab.
      //
      // NOTE: wallX isn't actually computed until ~line 473 below
      // (inside the foreground wall block). We recompute it inline
      // here so the cutout can also narrow drawStart BEFORE the back
      // layer loop, which matters for the N-layer occlusion midline
      // decision for crenel layer 0 (handled separately above).
      if (_contract && TILES.isCrenellated(hitTile)) {
        var _crWX;
        if (side === 0) {
          _crWX = py + perpDist * rayDirY;
        } else {
          _crWX = px + perpDist * rayDirX;
        }
        _crWX = _crWX - Math.floor(_crWX);
        if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
          _crWX = 1 - _crWX;
        }
        // 4 teeth = 8 alternating bands (merlon, gap, merlon, gap, ...)
        var _crBand = Math.floor(_crWX * 8);
        var _crIsGap = (_crBand & 1) === 1;
        if (_crIsGap) {
          // Clip the top half of the slab on screen. Keep drawEnd as
          // the solid base, so the bottom half (the solid part of
          // the rampart) renders untouched.
          var _crHalf = Math.floor(lineHeight / 2);
          drawStart = Math.min(drawEnd + 1, drawStart + _crHalf);
        }
      }

      // Fog from contract (boosted render/fog dist when RENDER_SCALE < 1)
      var fogFactor = _contract
        ? SpatialContract.getFogFactor(_contract, perpDist, renderDist, fogDist)
        : Math.min(1, perpDist / fogDist);

      // Lightmap brightness
      var brightness = 1.0;
      if (lightMap && lightMap[mapY] && lightMap[mapY][mapX] !== undefined) {
        brightness = lightMap[mapY][mapX];
      }

      // ── Back-to-front N-layer wall rendering ────────────────
      // Render background layers (farthest first, skipping layer 0
      // which is the foreground — rendered by the existing code below).
      // Each layer draws its full textured strip; closer layers
      // overdraw farther layers naturally (painter's algorithm).
      // Floor pre-pass shows through any column region no layer covers.
      if (_lc > 1) {
        for (var _li = _lc - 1; _li >= 1; _li--) {
          _renderBackLayer(
            ctx, col, _layerBuf[_li], h, halfH, baseWallH,
            px, py, rayDirX, rayDirY, stepX, stepY,
            renderDist, fogDist, fogColor, lightMap,
            tintStr, tintIdx, tintRGB
          );
        }
      }

      // ── Foreground wall (layer 0) — texture or flat-color ─────
      var texId = _contract ? SpatialContract.getTexture(_contract, hitTile) : null;

      // Locked BOSS_DOOR override: show chain/padlock texture until unlocked
      if (hitTile === TILES.BOSS_DOOR && texId &&
          typeof FloorTransition !== 'undefined' &&
          typeof FloorManager !== 'undefined' &&
          !FloorTransition.isDoorUnlocked(FloorManager.getFloor(), mapX, mapY)) {
        texId = 'door_locked';
      }

      var tex = texId ? TextureAtlas.get(texId) : null;
      var stripH = drawEnd - drawStart + 1;

      // Compute wall-hit UV (0..1 along the face) — needed by both
      // the normal texture path and DoorAnimator
      var wallX;
      if (side === 0) {
        wallX = py + perpDist * rayDirY;
      } else {
        wallX = px + perpDist * rayDirX;
      }
      wallX = wallX - Math.floor(wallX);

      // Flip for consistent left-to-right on both face orientations
      if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
        wallX = 1 - wallX;
      }

      // ── Door-open animation override ──────────────────────────
      // If this tile is the one currently animating open, delegate
      // rendering to DoorAnimator which draws the split/portcullis
      // reveal instead of the static door texture.
      if (typeof DoorAnimator !== 'undefined' &&
          DoorAnimator.isAnimatingTile(mapX, mapY) && stripH > 0) {
        DoorAnimator.renderColumn(
          ctx, col, drawStart, drawEnd, wallX, side,
          fogFactor, brightness, fogColor
        );
      } else if (tex && stripH > 0) {
        // Texture column index
        var texX = Math.floor(wallX * tex.width);
        if (texX >= tex.width) texX = tex.width - 1;

        var shiftedTop = flatTop - vertShift;

        if (freeformCfg) {
          // ── Freeform two-segment render (HEARTH sandwich) ────
          // Upper brick band + cavity + lower brick band. Each
          // strip is sampled from the matching vertical band of
          // the source texture so the mantle reads as stone-top
          // and the base reads as stone-bottom. The cavity in
          // between is filled with fire sprite + warm glow
          // (owned by the helper for HEARTH/BONFIRE; fallback
          // fill for other freeform tiles added in later phases).
          _renderFreeformForeground(
            ctx, tex, texX, col, wallX,
            shiftedTop, lineHeight, wallHeightMult,
            drawStart, drawEnd, freeformCfg,
            side, fogFactor, brightness, fogColor,
            tintStr, tintIdx, tintRGB, mapY, mapX,
            hitTile, perpDist, h, halfH,
            stepX, stepY
          );

          // Wall decor sprites on freeform tiles (e.g. DUMP_TRUCK wheels).
          // The non-freeform path already calls this below; mirror the
          // call here so freeform tiles like DUMP_TRUCK can also carry
          // anchored side-face sprites. anchorV=0 (bottom) lands on the
          // floor-adjacent lower body of the truck. Fillers with
          // cavityBand: true are skipped inside _renderWallDecor so the
          // spool slot doesn't get wheels painted over it.
          _renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
                           shiftedTop, mapX, mapY, side, stepX, stepY);
        } else {
          // Draw textured wall column — WALL tiles (brick) get vertical tiling
          // so patterns repeat on tall facades. All other tiles stretch.
          // PW-1 hook: if this wall tile has a grime grid, use the per-pixel
          // path so grime tint can be composited. Otherwise fast ctx.drawImage.
          var _fgGrime = (typeof GrimeGrid !== 'undefined')
            ? GrimeGrid.get(_bloodFloorId, mapX, mapY) : null;
          if (_fgGrime) {
            _drawTiledColumnPixel(ctx, tex, texX, shiftedTop, lineHeight,
                                  drawStart, drawEnd, col, wallHeightMult, hitTile,
                                  _fgGrime, wallX);
          } else {
            _drawTiledColumn(ctx, tex, texX, shiftedTop, lineHeight,
                             drawStart, drawEnd, col, wallHeightMult, hitTile);
          }

          // Wall decor sprites (drawn before overlays so fog/shade affect them)
          _renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
                           shiftedTop, mapX, mapY, side, stepX, stepY);

          // Side shading (side=1 faces are darker, matching flat-color convention)
          if (side === 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(col, drawStart, 1, stripH);
          }

          // Fog + brightness combined overlay — single pass to avoid alpha-stacking flicker.
          // Compute both fog and brightness darkening, then draw the dominant one.
          var _fgDark = (brightness < 0.95) ? (1 - brightness) : 0;
          if (fogFactor > 0.05 || _fgDark > 0.05) {
            if (fogFactor >= _fgDark) {
              // Fog dominates — draw fog-colored overlay
              ctx.fillStyle = 'rgba(' + fogColor.r + ',' + fogColor.g + ',' + fogColor.b + ',' + fogFactor + ')';
            } else {
              // Brightness/tint dominates — draw tint-colored darkness
              ctx.fillStyle = _tintedDark(tintStr, tintIdx, tintRGB, mapY, mapX, _fgDark);
            }
            ctx.fillRect(col, drawStart, 1, stripH);
          }
        }
      } else {
        // Flat-color fallback (original path — no texture assigned)
        var isDoor = TILES.isDoor(hitTile);
        var baseColor;
        if (isDoor) {
          baseColor = (side === 1) ? _wallColors.doorDark : _wallColors.door;
        } else {
          baseColor = (side === 1) ? _wallColors.dark : _wallColors.light;
        }

        var _tS = tintStr && tintStr[mapY] ? tintStr[mapY][mapX] : 0;
        var _tI = tintIdx && tintIdx[mapY] ? tintIdx[mapY][mapX] : 0;
        var finalColor = _applyFogAndBrightness(baseColor, fogFactor, brightness, fogColor, _tS, _tI, tintRGB);
        ctx.fillStyle = finalColor;
        ctx.fillRect(col, drawStart, 1, stripH);
      }

      // ── Step fill (Doom rule) ───────────────────────────────────
      // The gap between the displaced wall and the floor/ceiling plane
      // fills with a darkened step color to read as a physical platform
      // or recessed lip. This is what makes doors "look" raised/sunken.
      //
      // Step color is sampled from the tile's texture edge pixel when
      // available, so each biome's door/stair texture automatically gets
      // a matching step color. Falls back to contract.stepColor.
      // ── Floating-slab underside: two distinct rendering modes ───
      //
      // Moss variant (CANOPY_MOSS): translucent hanging-moss band.
      //   A fog-darkened strip below the front face, sized to the
      //   geometric gap between front & back face drawEnds. Sky
      //   shows through in patches — reads as Spanish moss / vines
      //   on swampy canopies. The column-based approach has visual
      //   artifacts at slab corners (known & desired for the moss
      //   aesthetic — the "placeholder" look reads as hanging growth).
      //
      // Opaque-lid variant (CANOPY, ROOF_*): proper per-column floor
      //   cast. See _renderFloatingLid() — walks screen rows from the
      //   front face drawEnd toward the horizon, projects each row
      //   back to the slab's bottom plane, stops at the actual tile
      //   footprint boundary. No corner bleed; fog is continuous
      //   per-pixel (no snap-to-opaque as the player approaches).
      if (vertShift > 0 && _contract && TILES.isFloatingMoss(hitTile)) {
        var rawUndersideColor = _contract.stepColor || '#222';
        if (tex && tex.data) {
          var uTexX = Math.floor(wallX * tex.width);
          if (uTexX >= tex.width) uTexX = tex.width - 1;
          var uIdx = ((tex.height - 1) * tex.width + uTexX) * 4;
          rawUndersideColor = 'rgb(' + tex.data[uIdx] + ',' + tex.data[uIdx + 1] + ',' + tex.data[uIdx + 2] + ')';
        }
        var undersideColor = _applyFogAndBrightness(
          rawUndersideColor, fogFactor, brightness * 0.45, fogColor
        );
        ctx.fillStyle = undersideColor;
        var undersideH = Math.floor(
          (h * (heightOffset - baseWallH / 2)) / (perpDist * (perpDist + 1))
        );
        if (undersideH > 0) {
          if (undersideH > h) undersideH = h;
          var uTop = drawEnd + 1;
          var uBot = Math.min(h, uTop + undersideH);
          if (uBot > uTop) {
            ctx.fillRect(col, uTop, 1, uBot - uTop);
          }
        }
      } else if (vertShift > 0 && _contract && TILES.isFloatingLid(hitTile)) {
        // ── Compute slab exit distance along this ray ─────────────
        // Walk the DDA forward from the hit cell until we either
        // leave the floating-lid footprint or hit a walk limit. The
        // exit distance is the ray-perpDist of the first non-lid
        // cell — that's where the slab's back edge lands on screen.
        //
        // Doing the walk ONCE per column and passing the result as
        // a single screen-space fill range eliminates the per-row
        // grid sampling that caused barcode tearing in the earlier
        // floor-cast approach. Adjacent columns get perpDist and
        // backDist that vary continuously with ray direction, so
        // the fill extent varies ~1 pixel per column — smooth.
        var _fldBackDist = perpDist;
        var _fldSdX = sideDistX, _fldSdY = sideDistY;
        var _fldMX = mapX, _fldMY = mapY;
        var _fldMaxSteps = 8;
        var _fldStepped = false;
        for (var _fldI = 0; _fldI < _fldMaxSteps; _fldI++) {
          var _fldSide;
          if (_fldSdX < _fldSdY) {
            _fldSdX += deltaDistX; _fldMX += stepX; _fldSide = 0;
          } else {
            _fldSdY += deltaDistY; _fldMY += stepY; _fldSide = 1;
          }
          // Distance to the entry edge of the cell we just stepped
          // into (equivalently, the exit edge of the cell we were
          // just in). In Lode-DDA, (new sideDist - deltaDist) equals
          // the old sideDist, which is that entry distance along ray.
          var _fldEntryDist = (_fldSide === 0)
            ? _fldSdX - deltaDistX
            : _fldSdY - deltaDistY;

          if (_fldMX < 0 || _fldMX >= gridW || _fldMY < 0 || _fldMY >= gridH) {
            _fldBackDist = _fldEntryDist;
            _fldStepped = true;
            break;
          }
          var _fldT = grid[_fldMY][_fldMX];
          if (!TILES.isFloatingLid(_fldT)) {
            _fldBackDist = _fldEntryDist;
            _fldStepped = true;
            break;
          }
          // Still inside the slab — keep walking.
        }
        if (!_fldStepped) {
          // Hit the walk limit without exiting — clamp to a generous
          // fallback so the fill still terminates.
          _fldBackDist = perpDist + _fldMaxSteps;
        }

        _renderFloatingLid(
          ctx, col, drawEnd, halfH, h, baseWallH, heightOffset,
          perpDist, _fldBackDist, tex, fogColor, lightMap,
          mapX, mapY, renderDist, fogDist
        );
      }

      if (vertShift !== 0 && _contract && !TILES.isFloating(hitTile)) {
        var rawStepColor = _contract.stepColor || '#222';

        // Sample texture edge for per-tile step color
        if (tex && tex.data) {
          var sTexX = Math.floor(wallX * tex.width);
          if (sTexX >= tex.width) sTexX = tex.width - 1;
          var sTexY = (heightOffset > 0) ? tex.height - 1 : 0;
          var sIdx = (sTexY * tex.width + sTexX) * 4;
          rawStepColor = 'rgb(' + tex.data[sIdx] + ',' + tex.data[sIdx + 1] + ',' + tex.data[sIdx + 2] + ')';
        }

        var stepColor = _applyFogAndBrightness(
          rawStepColor, fogFactor, brightness * 0.7, fogColor
        );
        ctx.fillStyle = stepColor;

        if (heightOffset > 0) {
          // Raised tile: step visible BELOW the wall.
          // Fill from bottom of shifted wall down to where flat bottom was.
          var stepTop = drawEnd + 1;
          var stepBot = Math.min(h, flatBottom);
          if (stepBot > stepTop) {
            ctx.fillRect(col, stepTop, 1, stepBot - stepTop);
          }
        } else {
          // Sunken tile: lip visible ABOVE the wall.
          // Fill from where flat top was down to top of shifted wall.
          var lipTop = Math.max(0, flatTop);
          var lipBot = drawStart;
          if (lipBot > lipTop) {
            var lipH = lipBot - lipTop;

            // ── Fire cavity for HEARTH/BONFIRE ─────────────────────
            // The step-fill lip reads as a cavity opening above the
            // sunken stone column. Dark fill + warm glow + fire sprite
            // composited into the band — the "Doom rule" depth illusion.
            //
            // HEARTH sandwich rendering (mantle → fire → base):
            // The lip region becomes the fire cavity (center of sandwich).
            // A mantle band is drawn ABOVE the cavity using the same wall
            // texture, creating the stone-fire-stone fireplace look.
            // The base stone is the normal wall face below (already drawn).
            if ((hitTile === TILES.HEARTH || hitTile === TILES.BONFIRE) && lipH >= 2) {

              // ── HEARTH mantle band (stone cap above fire cavity) ───
              // Draws a textured stone band above the fire opening.
              // Proportional to the base wall height so the sandwich
              // scales correctly at all distances.
              if (hitTile === TILES.HEARTH && tex && tex.canvas) {
                var mantleFrac = 0.70;  // Mantle height as fraction of base wall
                var mantleH = Math.max(2, Math.floor(lineHeight * mantleFrac));
                var mantleBot = lipTop;
                var mantleTop = Math.max(0, mantleBot - mantleH);
                var mantleStripH = mantleBot - mantleTop;
                if (mantleStripH > 1) {
                  // Sample from upper portion of wall texture for mantle
                  var mTexX = Math.floor(wallX * tex.width);
                  if (mTexX >= tex.width) mTexX = tex.width - 1;
                  ctx.drawImage(tex.canvas,
                    mTexX, 0, 1, Math.floor(tex.height * 0.5),
                    col, mantleTop, 1, mantleStripH
                  );
                  // Side shading to match wall face convention
                  if (side === 1) {
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(col, mantleTop, 1, mantleStripH);
                  }
                  // Fog + brightness overlay on mantle (matches wall rendering)
                  var _mDark = (brightness < 0.95) ? (1 - brightness) : 0;
                  if (fogFactor > 0.05 || _mDark > 0.05) {
                    if (fogFactor >= _mDark) {
                      ctx.fillStyle = 'rgba(' + fogColor.r + ',' + fogColor.g + ',' + fogColor.b + ',' + fogFactor + ')';
                    } else {
                      ctx.fillStyle = 'rgba(0,0,0,' + _mDark.toFixed(3) + ')';
                    }
                    ctx.fillRect(col, mantleTop, 1, mantleStripH);
                  }
                  // Mantle bottom edge (dark line separating mantle from fire)
                  ctx.fillStyle = 'rgba(0,0,0,0.4)';
                  ctx.fillRect(col, mantleBot - 1, 1, 1);
                  // Mantle top edge
                  if (mantleStripH > 4) {
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(col, mantleTop, 1, 1);
                  }
                }
              }

              // 1. Dark cavity base
              var cavDark = _applyFogAndBrightness(
                '#0a0502', fogFactor, brightness * 0.4, fogColor
              );
              ctx.fillStyle = cavDark;
              ctx.fillRect(col, lipTop, 1, lipH);

              // 2. Fire sprite — blit 1px column of decor_hearth_fire
              var fireTex = TextureAtlas.get('decor_hearth_fire');
              if (fireTex && fireTex.canvas && lipH >= 3) {
                var fSrcX = Math.floor(wallX * fireTex.width);
                if (fSrcX >= fireTex.width) fSrcX = fireTex.width - 1;
                // Wobble: subtle vertical phase shift for flame animation
                var fWobble = Math.sin(Date.now() * 0.003) * 0.04;
                var fSrcY = Math.max(0, Math.floor(fWobble * fireTex.height));
                var fSrcH = fireTex.height - fSrcY;
                ctx.drawImage(fireTex.canvas,
                  fSrcX, fSrcY, 1, fSrcH,
                  col, lipTop, 1, lipH
                );
              }

              // 3. Warm glow overlay — single semi-transparent pass
              var glowA = 0.18 * brightness;
              if (glowA > 0.01) {
                ctx.fillStyle = 'rgba(255,120,30,' + glowA.toFixed(3) + ')';
                ctx.fillRect(col, lipTop, 1, lipH);
              }

              // 4. Base top edge (dark line separating fire from base stone)
              ctx.fillStyle = 'rgba(0,0,0,0.35)';
              ctx.fillRect(col, drawStart, 1, 1);
            } else {
              // Normal sunken step fill (doors, stairs, etc.)
              ctx.fillRect(col, lipTop, 1, lipH);
            }
          }
        }
      }

      // ── Short-wall cap (table top, bed surface, chest lid) ─────
      // When a short interior furnishing is visible, the area between
      // the horizon (eye level) and the top of the wall face should
      // show a horizontal "lid" surface. Without this, the player sees
      // through to the floor behind, which reads as dissolve.
      //
      // Cap tiles: TABLE (28), BED (27), CHEST (7), BAR_COUNTER (26).
      // Exterior see-over tiles (SHRUB, FENCE) intentionally skip cap.
      // HEARTH/BOOKSHELF are full-height and skip via the < 0.95 check.
      //
      // The cap fills from horizon down to wall-top (drawStart). This
      // region is the foreshortened horizontal surface — geometrically
      // correct at all distances. The cap color is sampled from the
      // wall texture's top-edge pixels at reduced brightness (reads as
      // a lit horizontal surface vs the vertical wall face).
      if (wallHeightMult < 0.95 && wallHeightMult > 0.25 && drawStart > halfH) {
        var _isCapTile = (hitTile === TILES.TABLE || hitTile === TILES.BED ||
                          hitTile === TILES.CHEST || hitTile === TILES.BAR_COUNTER);
        if (_isCapTile) {
          var capTop = Math.max(0, halfH);
          var capBot = Math.min(drawStart, h);
          var capH = capBot - capTop;
          if (capH > 0) {
            // Sample cap color from texture top-edge pixel (brightened for
            // foreshortened horizontal surface catching overhead light).
            // Raw RGB computation — avoids hex format mismatch with
            // _applyFogAndBrightness which expects '#rrggbb'.
            var capR = 58, capG = 42, capB = 26;  // Default dark wood
            if (tex && tex.data) {
              var capTexX = Math.floor(wallX * tex.width);
              if (capTexX >= tex.width) capTexX = tex.width - 1;
              var capIdx = capTexX * 4;  // row 0 (top edge)
              capR = tex.data[capIdx];
              capG = tex.data[capIdx + 1];
              capB = tex.data[capIdx + 2];
            }

            // Foreshortened surface is brighter than wall face (catching
            // more overhead light) but still dimmed by distance/fog.
            var capBright = brightness * 0.80;
            capR = Math.floor(capR * capBright);
            capG = Math.floor(capG * capBright);
            capB = Math.floor(capB * capBright);

            // Apply fog
            if (fogFactor > 0.01) {
              var capInvFog = 1 - fogFactor;
              capR = Math.floor(capR * capInvFog + fogColor.r * fogFactor);
              capG = Math.floor(capG * capInvFog + fogColor.g * fogFactor);
              capB = Math.floor(capB * capInvFog + fogColor.b * fogFactor);
            }

            ctx.fillStyle = 'rgb(' + capR + ',' + capG + ',' + capB + ')';
            ctx.fillRect(col, capTop, 1, capH);

            // Side shading: cap faces on side=1 walls are darker (matches
            // wall face convention for directional lighting).
            if (side === 1) {
              ctx.fillStyle = 'rgba(0,0,0,0.15)';
              ctx.fillRect(col, capTop, 1, capH);
            }

            // Edge line where cap meets wall face — depth separation cue.
            // Renders at all sizes (even 1px cap gets a dark line).
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(col, capBot - 1, 1, 1);

            // Top edge of cap (where it meets the space behind).
            // Softer than bottom edge — reads as the far edge of the lid.
            if (capH > 2) {
              ctx.fillStyle = 'rgba(0,0,0,0.15)';
              ctx.fillRect(col, capTop, 1, 1);
            }
          }
        }
      }

      // Wall edge lines (top/bottom border for depth cue)
      if (lineHeight > 20) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(col, drawStart, 1, 1);
        ctx.fillRect(col, drawEnd, 1, 1);
      }
    }

    // ── Debug trace: one-shot clear after the column loop ────────
    if (_dbgFrame) {
      _debugTraceOnce = false;
      try { console.log('[RC-DBG] ===== END FRAME ====='); } catch (_) {}
    }

    // ── Sprite + terminus-veil sandwich ──────────────────────────
    // The terminus fog veil (below) masks wall pop-in at the horizon
    // on exterior FADE floors. Historically all sprites were drawn
    // before the veil, so close-range NPCs/props standing near the
    // horizon line were painted over by the veil and looked like
    // they were fading into fog only a few tiles away. Fix: split
    // the sprite pass around the veil. Distant sprites (≥ NEAR_SPRITE_DIST
    // tiles) render first and can be masked by the veil as intended;
    // close sprites render after the veil and punch through it so
    // they always appear at full fidelity.
    var NEAR_SPRITE_DIST = 2.0;

    // Distant sprite pass — masked by veil along with distant walls.
    if (sprites && sprites.length > 0) {
      _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor, NEAR_SPRITE_DIST, null);
    }

    // ── Terminus fog veil (exterior FADE floors only) ────────────
    // Draws a soft atmospheric gradient band centered on the horizon
    // to mask two artifacts:
    //   1. Horizon seam — floor fog color vs sky gradient color mismatch
    //   2. Wall pop-in — buildings beyond renderDistance popping in
    //
    // The veil is a vertical gradient: transparent at edges, opaque
    // fog color at center (horizon line). It covers ~15% of screen
    // height above and below the horizon. Interior/dungeon floors
    // use CLAMP or DARKNESS fog which have intentional hard cutoffs,
    // so the veil is skipped for those models.
    if (_contract && _contract.fogModel === 'fade' && _contract.terminusFog) {
      var _tf = _contract.terminusFog;
      var _tfOpacity = _tf.opacity || 0;
      if (_tfOpacity > 0.01) {
        var veilH = Math.floor(h * (_tf.height || 0.15));
        var veilTop = Math.max(0, Math.floor(halfH) - veilH);
        var veilBot = Math.min(h, Math.floor(halfH) + veilH);
        var veilTotalH = veilBot - veilTop;
        if (veilTotalH > 4) {
          var _tfR = fogColor.r, _tfG = fogColor.g, _tfB = fogColor.b;
          var _tfMid = _tfOpacity.toFixed(3);
          var _tfSide = (_tfOpacity * 0.6).toFixed(3);
          var veilGrad = ctx.createLinearGradient(0, veilTop, 0, veilBot);
          veilGrad.addColorStop(0,    'rgba(' + _tfR + ',' + _tfG + ',' + _tfB + ',0)');
          veilGrad.addColorStop(0.35, 'rgba(' + _tfR + ',' + _tfG + ',' + _tfB + ',' + _tfSide + ')');
          veilGrad.addColorStop(0.5,  'rgba(' + _tfR + ',' + _tfG + ',' + _tfB + ',' + _tfMid + ')');
          veilGrad.addColorStop(0.65, 'rgba(' + _tfR + ',' + _tfG + ',' + _tfB + ',' + _tfSide + ')');
          veilGrad.addColorStop(1,    'rgba(' + _tfR + ',' + _tfG + ',' + _tfB + ',0)');
          ctx.fillStyle = veilGrad;
          ctx.fillRect(0, veilTop, w, veilTotalH);
        }
      }
    }

    // Near sprite pass — punches through the veil so close NPCs and
    // props are never painted into the horizon band.
    if (sprites && sprites.length > 0) {
      _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor, 0, NEAR_SPRITE_DIST);
    }

    // ── Render particles (above sprites, below HUD) ──
    // dt is estimated from frame timing since render() doesn't receive it.
    // CombatFX or game.js calls updateParticles() separately if precision matters.
    var now = Date.now();
    var pDt = now - (_lastParticleTime || now);
    _lastParticleTime = now;
    if (pDt > 0 && pDt < 100) {
      _updateAndRenderParticles(ctx, pDt);
    }

    // ── Blit offscreen 3D viewport → main canvas ───────────────────
    // The raycaster drew everything above into `_offCanvas` at the
    // scaled backing resolution. Now copy it to the main canvas at
    // full CSS size with nearest-neighbor upscale. The main canvas
    // stays at native size so HUD/minimap/menus drawn AFTER this
    // render() (elsewhere in the game loop) get full-fidelity pixels.
    // Any ctx transform already applied to _mainCtx (e.g. CombatFX
    // zoom set up by game.js before calling render) is respected by
    // drawImage.
    if (_mainCtx && _offCanvas && _canvas) {
      _mainCtx.drawImage(_offCanvas, 0, 0, _canvas.width, _canvas.height);
    }
  }

  var _lastParticleTime = 0;

  // ── Parallax background layers ──
  function _renderParallax(ctx, w, h, halfH, layers, playerDir) {
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

  // ── Tiled texture column renderer ──────────────────────────────
  // Draws a single textured wall column with vertical tiling for WALL
  // tiles only (bricks). Doors, trees, concrete, and all other tile
  // types use stretch mapping — their textures are designed for their
  // specific height multiplier.
  //
  // Parameters:
  //   ctx       - canvas 2D context
  //   tex       - texture object {canvas, width, height}
  //   texX      - source column index in texture
  //   wallTop   - unshifted top pixel of the full wall strip
  //   lineH     - total wall height in pixels
  //   drawStart - visible top pixel (clamped to screen)
  //   drawEnd   - visible bottom pixel (clamped to screen)
  //   col       - screen column X
  //   whMult    - wall height multiplier (from tileWallHeights)
  //   tileType  - TILES constant (only WALL tiles get tiled)
  /**
   * Freeform two-segment wall column renderer (Phase 1: HEARTH).
   *
   * Splits the wall column into three bands — upper brick strip,
   * cavity gap, lower brick strip — rather than stretching a single
   * texture over the full height. The upper band samples from the
   * top portion of the source texture, the lower band from the
   * bottom portion, so brick / stone patterns read as a true
   * stone-fire-stone fireplace instead of a paint-over-opaque
   * lip trick.
   *
   * Per-tile configuration lives on the spatial contract's
   * `tileFreeform` table; `{ hUpper, hLower }` is in world units.
   * The cavity gap = wallHeightMult − (hUpper + hLower). When the
   * sum meets or exceeds wallHeightMult the caller skips freeform
   * entirely (degenerate solid column — same look as the legacy
   * path on short stub hearths).
   *
   * For HEARTH/BONFIRE the cavity is filled with a fire sprite and
   * warm glow overlay (ported from the legacy step-fill trick).
   * Other freeform tiles get a plain dark fill; later phases will
   * register cavity content handlers (arch, porthole, tavern window).
   *
   * See docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md §3, §4.
   */
  function _renderFreeformForeground(
    ctx, tex, texX, col, wallX,
    wallTop, lineH, whMult,
    drawStart, drawEnd, ff,
    side, fogFactor, brightness, fogColor,
    tintStr, tintIdx, tintRGB, mapY, mapX,
    hitTile, perpDist, screenH, halfH,
    stepX, stepY
  ) {
    if (lineH <= 0) return;

    // World-unit → pixel fractions of the full wall column.
    var upperFrac = ff.hUpper / whMult;
    var lowerFrac = ff.hLower / whMult;
    if (upperFrac < 0) upperFrac = 0;
    if (lowerFrac < 0) lowerFrac = 0;

    // Unclipped wall extent (matches _drawTiledColumn's wallTop/lineH).
    var wallBot = wallTop + lineH;

    // Segment boundaries in screen pixels (unclipped).
    var upperBotPx = wallTop + upperFrac * lineH;
    var lowerTopPx = wallBot - lowerFrac * lineH;
    // Pathological guard (should be prevented by caller's degenerate check).
    if (lowerTopPx < upperBotPx) lowerTopPx = upperBotPx;

    // ── Pedestal occlusion mask ─────────────────────────────────
    // When this freeform tile has a solid lower band, publish its
    // top screen row + front-face distance + tile coordinates so the
    // sprite pass can clip NPCs standing BEHIND the pedestal (but
    // not sprites living inside the same cell — the HEARTH fire
    // emoji, future bonfire halos, etc.).
    if (ff.hLower > 0) {
      _zBufferPedTopY[col] = lowerTopPx;
      _zBufferPedDist[col] = perpDist;
      _zBufferPedMX[col]   = mapX;
      _zBufferPedMY[col]   = mapY;
    }

    // Clip to visible band.
    var upStart = Math.max(drawStart, Math.floor(wallTop));
    var upEnd   = Math.min(drawEnd,   Math.ceil(upperBotPx) - 1);

    var loStart = Math.max(drawStart, Math.floor(lowerTopPx));
    var loEnd   = Math.min(drawEnd,   Math.ceil(wallBot) - 1);

    var gapStart = Math.max(drawStart, Math.floor(upperBotPx));
    var gapEnd   = Math.min(drawEnd,   Math.ceil(lowerTopPx) - 1);

    var _dark = (brightness < 0.95) ? (1 - brightness) : 0;

    // ── Upper brick band (mantle) — top slice of texture ──────
    if (upEnd >= upStart) {
      var upStripH = upEnd - upStart + 1;
      // Source: map screen rows back into the top slice of the texture.
      // Upper band maps to texY ∈ [0, upperFrac * texH].
      var upSrcY = (upStart - wallTop) / lineH * tex.height;
      var upSrcH = upStripH / lineH * tex.height;
      if (upSrcY < 0) { upSrcH += upSrcY; upSrcY = 0; }
      if (upSrcY + upSrcH > tex.height) upSrcH = tex.height - upSrcY;
      if (upSrcH < 0.5) upSrcH = 0.5;
      ctx.drawImage(tex.canvas, texX, upSrcY, 1, upSrcH,
                    col, upStart, 1, upStripH);

      if (side === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(col, upStart, 1, upStripH);
      }
      if (fogFactor > 0.05 || _dark > 0.05) {
        if (fogFactor >= _dark) {
          ctx.fillStyle = 'rgba(' + fogColor.r + ',' + fogColor.g + ',' + fogColor.b + ',' + fogFactor + ')';
        } else {
          ctx.fillStyle = _tintedDark(tintStr, tintIdx, tintRGB, mapY, mapX, _dark);
        }
        ctx.fillRect(col, upStart, 1, upStripH);
      }
      // Dark separator line — mantle underside shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(col, upEnd, 1, 1);
    }

    // ── Lower brick band (base stone) — bottom slice of texture ──
    if (loEnd >= loStart) {
      var loStripH = loEnd - loStart + 1;
      var loSrcY = (loStart - wallTop) / lineH * tex.height;
      var loSrcH = loStripH / lineH * tex.height;
      if (loSrcY < 0) { loSrcH += loSrcY; loSrcY = 0; }
      if (loSrcY + loSrcH > tex.height) loSrcH = tex.height - loSrcY;
      if (loSrcH < 0.5) loSrcH = 0.5;
      ctx.drawImage(tex.canvas, texX, loSrcY, 1, loSrcH,
                    col, loStart, 1, loStripH);

      if (side === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(col, loStart, 1, loStripH);
      }
      if (fogFactor > 0.05 || _dark > 0.05) {
        if (fogFactor >= _dark) {
          ctx.fillStyle = 'rgba(' + fogColor.r + ',' + fogColor.g + ',' + fogColor.b + ',' + fogFactor + ')';
        } else {
          ctx.fillStyle = _tintedDark(tintStr, tintIdx, tintRGB, mapY, mapX, _dark);
        }
        ctx.fillRect(col, loStart, 1, loStripH);
      }
      // Dark separator line — base top edge.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(col, loStart, 1, 1);
    }

    // ── Cavity (gap) ──────────────────────────────────────────
    // Dispatch to a registered gap filler keyed by ff.fillGap.
    // Back-layer collection flags HEARTH (and any freeform tile) as
    // see-through via _fgIsFreeformSeeThrough, so walls behind the
    // tile register and paint into this Y range before the foreground
    // bands overdraw. The filler just tints / overlays that content.
    //
    // New cavity-bearing tiles (wells, dump_truck, arches, windows)
    // register their filler from Layer-3 init via
    // Raycaster.registerFreeformGapFiller('my_key', fn) and set
    // `fillGap: 'my_key'` on their tileFreeform contract entry. They
    // never edit this function.
    if (gapEnd >= gapStart) {
      var gapH = gapEnd - gapStart + 1;

      // Populate the shared info object once per column. Fillers are
      // expected to treat this as read-only and not retain references
      // past the call (it gets overwritten for the next column).
      _gapInfo.brightness     = brightness;
      _gapInfo.fogFactor      = fogFactor;
      _gapInfo.fogColor       = fogColor;
      _gapInfo.tintStr        = tintStr;
      _gapInfo.tintIdx        = tintIdx;
      _gapInfo.tintRGB        = tintRGB;
      _gapInfo.mapX           = mapX;
      _gapInfo.mapY           = mapY;
      _gapInfo.side           = side;
      _gapInfo.perpDist       = perpDist;
      _gapInfo.hitTile        = hitTile;
      _gapInfo.wallX          = wallX;
      _gapInfo.wallTop        = wallTop;
      _gapInfo.lineH          = lineH;
      _gapInfo.halfH          = halfH;
      _gapInfo.screenH        = screenH;
      _gapInfo.wallHeightMult = whMult;
      _gapInfo.gapWorldH      = whMult - (ff.hUpper + ff.hLower);
      if (_gapInfo.gapWorldH < 0) _gapInfo.gapWorldH = 0;
      _gapInfo.ff             = ff;

      // ── Hit face index (CLAUDE.md direction convention) ─────────
      // 0 = EAST face of tile, 1 = SOUTH, 2 = WEST, 3 = NORTH.
      // Derived from DDA side + step direction:
      //   side 0 (x-face), stepX>0  → ray heading east, hits WEST  face (2)
      //   side 0, stepX<0           → ray heading west, hits EAST  face (0)
      //   side 1 (y-face), stepY>0  → ray heading south, hits NORTH face (3)
      //   side 1, stepY<0           → ray heading north, hits SOUTH face (1)
      // Fillers that want to restrict painting to one face of a tile
      // (e.g. windows only render the interior through the exterior
      // face of the building) compare this against a per-tile exterior
      // face map. Back-layer calls may pass stepX/stepY = 0 when the
      // step direction is unknown; in that case hitFace falls back to
      // a best-guess from `side` alone (side 0 → 0, side 1 → 1).
      var _hitFace;
      if (stepX === 0 && stepY === 0) {
        _hitFace = (side === 0) ? 0 : 1;
      } else if (side === 0) {
        _hitFace = (stepX > 0) ? 2 : 0;
      } else {
        _hitFace = (stepY > 0) ? 3 : 1;
      }
      _gapInfo.hitFace = _hitFace;

      var fillerKey = ff.fillGap || '_default';
      var filler    = _gapFillers[fillerKey] || _gapFillers._default;
      filler(ctx, col, gapStart, gapH, _gapInfo);
    }
  }

  function _drawTiledColumn(ctx, tex, texX, wallTop, lineH, drawStart, drawEnd, col, whMult, tileType) {
    var stripH = drawEnd - drawStart + 1;
    if (stripH <= 0 || lineH <= 0) return;

    // Only WALL tiles tile their texture (bricks repeat on tall facades).
    // Doors, trees, pillars, concrete etc. stretch — their textures are
    // authored for the full height. Also stretch at or below 1.0×.
    var shouldTile = (tileType === TILES.WALL) && (whMult > 1.001);

    if (!shouldTile) {
      var srcY = (drawStart - wallTop) / lineH * tex.height;
      var srcH = stripH / lineH * tex.height;
      if (srcY < 0) { srcH += srcY; srcY = 0; }
      if (srcY + srcH > tex.height) srcH = tex.height - srcY;
      if (srcH < 0.5) srcH = 0.5;
      ctx.drawImage(tex.canvas, texX, srcY, 1, srcH, col, drawStart, 1, stripH);
      return;
    }

    // Above 1.0×: tile the texture vertically. Each repeat occupies
    // (lineH / whMult) screen pixels — the height of a 1.0× wall at
    // this distance. The wall contains ceil(whMult) full or partial tiles.
    var tilePixH = lineH / whMult;          // screen pixels per texture repeat
    var numTiles = Math.ceil(whMult);        // number of tile segments

    for (var t = 0; t < numTiles; t++) {
      var segWallTop = wallTop + t * tilePixH;
      var segWallBot = wallTop + (t + 1) * tilePixH;

      // Last tile may be partial (e.g. 0.5 of a tile for 3.5×)
      if (t === numTiles - 1 && whMult % 1 > 0.001) {
        segWallBot = wallTop + lineH;  // align to actual wall bottom
      }

      // Clamp to visible region
      var segStart = Math.max(drawStart, Math.floor(segWallTop));
      var segEnd   = Math.min(drawEnd,   Math.ceil(segWallBot) - 1);
      if (segStart > segEnd) continue;

      var segH = segEnd - segStart + 1;
      var localTileH = segWallBot - segWallTop;
      if (localTileH < 1) localTileH = 1;

      // Source UV within this single texture tile
      var sY = (segStart - segWallTop) / localTileH * tex.height;
      var sH = segH / localTileH * tex.height;
      if (sY < 0) { sH += sY; sY = 0; }
      if (sY + sH > tex.height) sH = tex.height - sY;
      if (sH < 0.5) sH = 0.5;

      ctx.drawImage(tex.canvas, texX, sY, 1, sH, col, segStart, 1, segH);
    }
  }

  // ── Per-pixel wall column renderer (PW-1 grime hook) ─────────
  // Reads texture data directly and writes via ImageData, enabling
  // per-pixel grime tinting. Only used for wall columns that have a
  // GrimeGrid — clean columns keep the fast ctx.drawImage path above.
  //
  // Pre-allocated 1-pixel-wide column buffer (shared across calls).
  var _wallColImgData = null;
  var _wallColBuf = null;   // Uint8ClampedArray alias for _wallColImgData.data
  var _wallColBufH = 0;     // allocated height

  // Grime tint target color (brownish-green, PW-1 §5.3)
  var _GRIME_R = 82, _GRIME_G = 68, _GRIME_B = 46;

  /**
   * Per-pixel wall column renderer with grime tint.
   *
   * Replicates _drawTiledColumn logic but samples texture pixels manually
   * so grime can be composited per-pixel. The grime grid is a Uint8Array
   * of resolution×resolution subcells — the wallU selects the horizontal
   * subcell and the vertical V within the column selects the vertical one.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} tex         - TextureAtlas entry { canvas, width, height, data }
   * @param {number} texX        - Source texture column (integer pixel index)
   * @param {number} wallTop     - Unshifted top pixel of the full wall strip
   * @param {number} lineH       - Total wall height in pixels
   * @param {number} drawStart   - Visible top pixel (clamped to screen)
   * @param {number} drawEnd     - Visible bottom pixel (clamped to screen)
   * @param {number} col         - Screen column X
   * @param {number} whMult      - Wall height multiplier (tileWallHeights)
   * @param {number} tileType    - TILES constant
   * @param {Object} grimeGrid   - { data: Uint8Array, res: number } or null
   * @param {number} wallU       - UV coordinate along wall face (0..1)
   */
  function _drawTiledColumnPixel(ctx, tex, texX, wallTop, lineH,
                                  drawStart, drawEnd, col, whMult, tileType,
                                  grimeGrid, wallU) {
    var stripH = drawEnd - drawStart + 1;
    if (stripH <= 0 || lineH <= 0) return;

    // Lazy-init / grow the shared column buffer
    if (!_wallColImgData || _wallColBufH < _height) {
      _wallColImgData = ctx.createImageData(1, _height);
      _wallColBuf = _wallColImgData.data;
      _wallColBufH = _height;
    }

    var shouldTile = (tileType === TILES.WALL) && (whMult > 1.001);
    var texData = tex.data;
    var texW = tex.width;
    var texH = tex.height;

    // Grime subcell X is constant for the entire column (same U)
    var grimeRes = grimeGrid ? grimeGrid.res : 0;
    var grimeData = grimeGrid ? grimeGrid.data : null;
    var grimeSubX = 0;
    if (grimeGrid) {
      grimeSubX = Math.floor(wallU * grimeRes);
      if (grimeSubX >= grimeRes) grimeSubX = grimeRes - 1;
    }

    for (var py = 0; py < stripH; py++) {
      var screenY = drawStart + py;

      // Compute V coordinate within the wall (0..1)
      var v;
      if (!shouldTile) {
        v = (screenY - wallTop) / lineH;
      } else {
        // Tiled walls: V wraps per tile repeat
        var globalV = (screenY - wallTop) / lineH * whMult;
        v = globalV - Math.floor(globalV);
      }

      // Sample source texel
      var srcY = Math.floor(v * texH);
      if (srcY < 0) srcY = 0;
      if (srcY >= texH) srcY = texH - 1;
      var srcIdx = (srcY * texW + texX) * 4;
      var r = texData[srcIdx];
      var g = texData[srcIdx + 1];
      var b = texData[srcIdx + 2];
      var a = texData[srcIdx + 3];

      // ── GrimeGrid tint (PW-1 §5.3) ──
      // Subcell lookup: grimeSubX is column-constant, subY varies per pixel.
      if (grimeData) {
        var grimeSubY = Math.floor(v * grimeRes);
        if (grimeSubY >= grimeRes) grimeSubY = grimeRes - 1;
        var grime = grimeData[grimeSubY * grimeRes + grimeSubX];
        if (grime > 0) {
          var ga = (grime / 255) * 0.6;  // max 60% opacity
          r = r * (1 - ga) + _GRIME_R * ga;
          g = g * (1 - ga) + _GRIME_G * ga;
          b = b * (1 - ga) + _GRIME_B * ga;
        }
      }

      var bufIdx = py * 4;
      _wallColBuf[bufIdx]     = r;
      _wallColBuf[bufIdx + 1] = g;
      _wallColBuf[bufIdx + 2] = b;
      _wallColBuf[bufIdx + 3] = a;
    }

    ctx.putImageData(_wallColImgData, col, drawStart, 0, 0, 1, stripH);
  }

  // ── Wall decor rendering ──────────────────────────────────────
  // Draws small alpha-transparent sprites pinned to wall faces.
  // Called after the wall texture and before fog/brightness overlays
  // so that all post-processing applies uniformly to both wall and decor.

  /**
   * Determine which wall face was hit.
   * @param {number} sd - DDA side (0=vertical grid line, 1=horizontal)
   * @param {number} stX - Step direction X (+1 or -1)
   * @param {number} stY - Step direction Y (+1 or -1)
   * @returns {string} Face key: 'n', 's', 'e', 'w'
   */
  /**
   * Parse a glow color string into 'r,g,b' for use in rgba() construction.
   * Accepts '#rrggbb' hex, 'rgba(r,g,b,a)', or 'rgb(r,g,b)'.
   * Returns '255,255,255' as fallback.
   */
  function _parseGlowRGB(color) {
    if (!color) return '255,255,255';
    if (color.charAt(0) === '#') {
      var hex = color.length === 4
        ? color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2) + color.charAt(3) + color.charAt(3)
        : color.substring(1);
      return parseInt(hex.substring(0, 2), 16) + ',' +
             parseInt(hex.substring(2, 4), 16) + ',' +
             parseInt(hex.substring(4, 6), 16);
    }
    var m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return m[1] + ',' + m[2] + ',' + m[3];
    return '255,255,255';
  }

  function _hitFace(sd, stX, stY) {
    // side 0 (vertical line): ray going right (+X) hits the WEST face;
    //                          ray going left (-X) hits the EAST face
    // side 1 (horizontal line): ray going south (+Y) hits the NORTH face;
    //                            ray going north (-Y) hits the SOUTH face
    if (sd === 0) return stX > 0 ? 'w' : 'e';
    return stY > 0 ? 'n' : 's';
  }

  /**
   * Render wall decor sprites for one column at a specific grid cell/face.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} col - Screen column
   * @param {number} wallX - UV coordinate along the wall face (0..1)
   * @param {number} drawStart - Top pixel of the wall strip (clamped to screen)
   * @param {number} drawEnd - Bottom pixel of the wall strip (clamped to screen)
   * @param {number} lineHeight - Full height of the wall in pixels (may exceed screen)
   * @param {number} wallTop - UNCLAMPED top pixel of the full wall strip
   * @param {number} mapX - Grid X of hit cell
   * @param {number} mapY - Grid Y of hit cell
   * @param {number} sd - DDA side
   * @param {number} stX - Step X
   * @param {number} stY - Step Y
   */
  function _renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
                            wallTop, mapX, mapY, sd, stX, stY) {
    if (!_wallDecor) return;
    var row = _wallDecor[mapY];
    if (!row) return;
    var cell = row[mapX];
    if (!cell) return;

    var face = _hitFace(sd, stX, stY);
    var items = cell[face];
    if (!items || items.length === 0) return;

    if (drawEnd - drawStart < 0) return;

    for (var di = 0; di < items.length; di++) {
      var d = items[di];

      // Skip items rendered in the step-fill cavity band (fire sprites
      // for HEARTH/BONFIRE — already composited into the lip region)
      if (d.cavityBand) continue;

      var halfW = d.scale / 2;
      var uMin = d.anchorU - halfW;
      var uMax = d.anchorU + halfW;

      // Check if this column falls within the sprite's horizontal span
      if (wallX < uMin || wallX >= uMax) continue;

      var tex = TextureAtlas.get(d.spriteId);
      if (!tex) continue;

      // Which column of the sprite to sample
      var texCol = Math.floor((wallX - uMin) / d.scale * tex.width);
      if (texCol < 0) texCol = 0;
      if (texCol >= tex.width) texCol = tex.width - 1;

      // Vertical placement: anchorV 0=bottom, 1=top of wall face
      // Sprite aspect ratio preserved: vExtent = scale * (texH / texW)
      var vExtent = d.scale * tex.height / tex.width;
      var vCenter = d.anchorV;
      // Wobble: slow vertical bobbing for fire-inside-wall sprites
      if (d.wobble) {
        vCenter += Math.sin(Date.now() * 0.003) * d.wobble;
      }
      var vMin = vCenter - vExtent / 2;
      var vMax = vCenter + vExtent / 2;

      // Map to screen pixels within the FULL (unclamped) wall strip.
      // Using wallTop + lineHeight (not drawStart + stripH) so sprite
      // position is stable regardless of screen clamping — fixes the
      // "flag waving" warping artifact on peripheral walls.
      // wallV 0=top of wall, 1=bottom → sprite vMin/vMax are 0=bottom, 1=top
      var spriteTop = wallTop + (1 - vMax) * lineHeight;
      var spriteBot = wallTop + (1 - vMin) * lineHeight;
      var spriteH = spriteBot - spriteTop;
      if (spriteH < 1) continue;

      // Clamp to wall bounds
      var dTop = Math.max(drawStart, Math.floor(spriteTop));
      var dBot = Math.min(drawEnd, Math.floor(spriteBot) - 1);
      if (dTop > dBot) continue;

      // ── Cavity glow: radial-falloff colored glow behind the sprite ──
      // Renders per-pixel alpha-faded glow before the sprite texture.
      // Uses radial distance from glow center to produce soft orb-like
      // light spill, not a flat disc. Makes fire openings (bonfires,
      // hearths) and CRT screens look like they emit volumetric light
      // from inside the short wall cavity.
      if (d.cavityGlow) {
        var cgR = d.glowR || 255;
        var cgG = d.glowG || 120;
        var cgB = d.glowB || 30;
        var cgA = d.glowA || 0.3;
        // Extend glow region beyond sprite bounds
        var glowPad = Math.max(3, Math.floor((dBot - dTop) * 0.35));
        var gTop = Math.max(drawStart, dTop - glowPad);
        var gBot = Math.min(drawEnd, dBot + glowPad);
        var gH = gBot - gTop + 1;
        if (gH > 0) {
          // Glow center in screen Y (sprite vertical center)
          var gCY = (dTop + dBot) * 0.5;
          // Glow center in screen X (sprite horizontal center)
          var spriteCX = wallTop + (1 - d.anchorV) * lineHeight; // approximate
          // Column offset from sprite U center → horizontal falloff
          var uCenter = d.anchorU;
          var uDist = Math.abs(wallX - uCenter) / (d.scale * 0.5 + 0.001);
          uDist = Math.min(uDist, 1); // 0 at center, 1 at edge
          // Per-pixel vertical render with radial falloff
          for (var gp = gTop; gp <= gBot; gp++) {
            var vDist = Math.abs(gp - gCY) / (glowPad + (dBot - dTop) * 0.5 + 0.001);
            vDist = Math.min(vDist, 1);
            // Radial distance from center (0=center, 1=edge)
            var rDist = Math.sqrt(uDist * uDist + vDist * vDist);
            if (rDist >= 1) continue;
            // Smooth falloff: bright core, soft edge
            var falloff = 1 - rDist * rDist; // quadratic falloff
            var pixA = cgA * falloff;
            if (pixA < 0.01) continue;
            ctx.fillStyle = 'rgba(' + cgR + ',' + cgG + ',' + cgB + ',' + pixA.toFixed(3) + ')';
            ctx.fillRect(col, gp, 1, 1);
          }
        }
      }

      // Source rect in sprite texture
      var srcY = (dTop - spriteTop) / spriteH * tex.height;
      var srcH = (dBot - dTop + 1) / spriteH * tex.height;
      if (srcH < 0.5) srcH = 0.5;

      ctx.drawImage(tex.canvas, texCol, srcY, 1, srcH, col, dTop, 1, dBot - dTop + 1);
    }
  }

  // ── Floating-slab underside (opaque lid) ────────────────────────
  // Renders the slab's bottom horizontal face as an opaque fill,
  // spanning from the front face's bottom edge to the back face's
  // bottom edge on screen.
  //
  // Geometry (camera at world-Y = baseWallH/2, slab bottom at world-Y
  // = heightOffset, ray distance d along the ray):
  //   slabBottomY = heightOffset - baseWallH/2   (height above eye)
  //   screenY(d)  = halfH - slabBottomY * h / d  (projection of the
  //                                                 slab-bottom plane)
  //
  // The near edge of the slab along this ray is at d = perpDist; the
  // far edge is at d = backDist (supplied by the caller after a
  // short DDA walk from the hit cell until it leaves the floating-
  // lid footprint). Fill the column from just below the front face
  // (y = frontDrawEnd + 1) down to screenY(backDist).
  //
  // This replaces the earlier per-row grid-sampling approach. Because
  // the caller's DDA walk already answered "where does the slab end
  // along this ray?", the lid fill is a pure screen-space operation.
  // Adjacent columns have perpDist/backDist that vary continuously
  // with ray direction, so the fill extent varies ~1 pixel per column
  // — no more barcode tears when freelooking up, and roof rings no
  // longer drag down at the corners.
  //
  // Per-row fog is still computed from each pixel's own rowDistance
  // so distant slab interiors blend continuously with the sky.
  function _renderFloatingLid(ctx, col, frontDrawEnd, halfH, h,
                              baseWallH, heightOffset,
                              perpDist, backDist,
                              tex, fogColor, lightMap,
                              slabMX, slabMY,
                              renderDist, fogDist) {
    var slabBottomY = heightOffset - baseWallH / 2;
    if (slabBottomY <= 0) return;
    if (backDist <= perpDist) return;

    // Screen Y of the slab's back edge along this ray. Asymptotes
    // toward halfH as backDist grows; clamp one pixel short of the
    // horizon to avoid filling across it.
    var backP = (slabBottomY * h) / backDist;
    var yEnd  = Math.floor(halfH - backP);
    var horizonRow = Math.floor(halfH) - 1;
    if (yEnd > horizonRow) yEnd = horizonRow;
    if (yEnd >= h) yEnd = h - 1;

    var yStart = frontDrawEnd + 1;
    if (yStart < 0) yStart = 0;
    if (yStart > yEnd) return;

    // Sample the slab's underside base color once per column from
    // the texture's bottom row. Using column index as the U
    // coordinate gives neighboring columns neighboring texels,
    // so the underside has a stable texture banding across the
    // slab's screen footprint.
    var baseR = 40, baseG = 40, baseB = 40;
    if (tex && tex.data) {
      var texW = tex.width;
      var texH_ = tex.height;
      var tX = ((col % texW) + texW) % texW;
      var tIdx = ((texH_ - 1) * texW + tX) * 4;
      baseR = tex.data[tIdx];
      baseG = tex.data[tIdx + 1];
      baseB = tex.data[tIdx + 2];
    }

    // Darken the raw color — underside sits in the slab's own shadow.
    baseR = Math.floor(baseR * 0.55);
    baseG = Math.floor(baseG * 0.55);
    baseB = Math.floor(baseB * 0.55);

    // Lightmap sampled once at the slab cell itself. A single sample
    // (not per-pixel) keeps the fill flat-shaded, which reads fine
    // for a small slab — the underside doesn't span multiple
    // lightmap cells meaningfully.
    if (lightMap && lightMap[slabMY] && lightMap[slabMY][slabMX] !== undefined) {
      var bri = lightMap[slabMY][slabMX];
      if (bri < 1.0) {
        baseR = Math.floor(baseR * bri);
        baseG = Math.floor(baseG * bri);
        baseB = Math.floor(baseB * bri);
      }
    }

    // Fill row by row, applying fog at each row's own distance so
    // the underside blends smoothly with the sky as it recedes.
    for (var y = yStart; y <= yEnd; y++) {
      var p = halfH - y;
      if (p <= 0) break;
      var rowDistance = (slabBottomY * h) / p;

      var fogF = _contract
        ? SpatialContract.getFogFactor(_contract, rowDistance,
                                       renderDist, fogDist)
        : 0;
      var r, g, bl;
      if (fogF > 0) {
        var inv = 1 - fogF;
        r  = Math.floor(baseR * inv + fogColor.r * fogF);
        g  = Math.floor(baseG * inv + fogColor.g * fogF);
        bl = Math.floor(baseB * inv + fogColor.b * fogF);
      } else {
        r  = baseR;
        g  = baseG;
        bl = baseB;
      }

      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + bl + ')';
      ctx.fillRect(col, y, 1, 1);
    }
  }

  // ── N-layer back-wall renderer ──────────────────────────────────
  // Renders a single background wall layer for the N-layer compositing
  // system. Called for each layer behind the foreground, farthest first
  // (painter's algorithm). Draws the full textured wall strip — closer
  // layers overdraw farther ones, and the floor pre-pass shows through
  // any uncovered column region.
  //
  // Simpler than the foreground renderer: no DoorAnimator, no BOSS_DOOR
  // lock check, no Doom-rule step fill. Back layers are static scenery.
  function _renderBackLayer(ctx, col, L, h, halfH, baseWallH,
                            px, py, rayDirX, rayDirY, stepX, stepY,
                            renderDist, fogDist, fogColor, lightMap,
                            tintStr, tintIdx, tintRGB) {
    // Perpendicular distance
    var pd;
    if (L.sd === 0) {
      pd = (L.mx - px + (1 - stepX) / 2) / (rayDirX || 1e-10);
    } else {
      pd = (L.my - py + (1 - stepY) / 2) / (rayDirY || 1e-10);
    }
    pd = Math.abs(pd);
    if (pd < 0.2) pd = 0.2;

    // Wall height from contract
    var wh = SpatialContract.getWallHeight(_contract, L.mx, L.my, _rooms, L.tile, _cellHeights);
    var lineH = Math.max(2, Math.floor((h * wh) / pd));
    var baseLH = Math.max(2, Math.floor((h * baseWallH) / pd));

    // Vertical shift from tile height offset (raised/sunken tiles).
    // CRITICAL for floating tiles: without this, the back face of a
    // raised slab (canopy, roof) would draw at ground level while the
    // front face floats high — visual mismatch. Back face must track
    // the same vertShift as the foreground face so both align at the
    // raised slab position.
    var blHeightOffset = SpatialContract.getTileHeightOffset(_contract, L.tile);
    var blVertShift = Math.floor((h * blHeightOffset) / pd);

    // Bottom-anchored positioning (same as foreground)
    var flatBot = Math.floor(halfH + baseLH / 2);
    var flatTop = flatBot - lineH;
    var drStart = Math.max(0, flatTop - blVertShift);
    var drEnd   = Math.min(h - 1, flatBot - blVertShift);
    var stripH  = drEnd - drStart + 1;
    if (stripH <= 0) return;

    // Fog — skip fully fogged layers (invisible, saves draw calls)
    var fog = _contract
      ? SpatialContract.getFogFactor(_contract, pd, renderDist, fogDist)
      : Math.min(1, pd / fogDist);
    if (fog > 0.98) return;

    // Brightness from lightmap
    var bri = 1.0;
    if (lightMap && lightMap[L.my] && lightMap[L.my][L.mx] !== undefined) {
      bri = lightMap[L.my][L.mx];
    }

    // Wall UV
    var wx;
    if (L.sd === 0) {
      wx = py + pd * rayDirY;
    } else {
      wx = px + pd * rayDirX;
    }
    wx -= Math.floor(wx);
    if ((L.sd === 0 && rayDirX > 0) || (L.sd === 1 && rayDirY < 0)) {
      wx = 1 - wx;
    }

    // ── Crenellated back-face tooth cutout ──────────────────────
    // Mirror of the foreground crenel modulation: when a crenel tile
    // is rendered as a back layer (specifically the back face injected
    // via _needBackFace for floating tiles), apply the same per-column
    // tooth cutout so the teeth line up from both sides of the slab.
    // The UV is folded identically to the foreground, so band indices
    // match up on the opposing face and the gaps don't get "filled in"
    // by the back face peeking through.
    if (TILES.isCrenellated(L.tile)) {
      var _blCrBand = Math.floor(wx * 8);
      var _blCrIsGap = (_blCrBand & 1) === 1;
      if (_blCrIsGap) {
        var _blCrHalf = Math.floor(lineH / 2);
        drStart = Math.min(drEnd + 1, drStart + _blCrHalf);
        stripH = drEnd - drStart + 1;
        if (stripH <= 0) return;
      }
    }

    // Texture lookup
    var texId = SpatialContract.getTexture(_contract, L.tile);
    var tex = texId ? TextureAtlas.get(texId) : null;

    // ── Freeform back-layer path ───────────────────────────────
    // When a back layer is a freeform tile (HEARTH, future arch/
    // porthole/window), render with the same upper-band + cavity +
    // lower-band sandwich used by the foreground pass. Two cases
    // drive this:
    //
    //   (a) A HEARTH sits behind another see-through or short
    //       tile along the ray (e.g. TABLE kitty-corner to the
    //       hearth). Without this path the back-hit HEARTH would
    //       paint as a solid opaque column and occlude the wall
    //       beyond it. The freeform sandwich keeps the cavity
    //       transparent so the wall behind the hearth registers.
    //
    //   (b) HEARTH is flagged in _needBackFace, so the foreground
    //       collection injects a second HEARTH layer at the next
    //       cell. That injected layer has to render as freeform
    //       too — otherwise the "back face" of the hearth would
    //       be an opaque painted column covering the cavity from
    //       the other side, breaking the 3D "see into the fire
    //       from either side" illusion we get for mailbox/canopy.
    //
    // The freeform helper bakes side shading + fog + brightness
    // into each band, so we return after it runs (matching the
    // foreground path at line ~644).
    var bgFreeformCfg = null;
    if (tex && _freeformEnabled && _contract && TILES.isFreeform(L.tile)) {
      bgFreeformCfg = SpatialContract.getTileFreeform(_contract, L.tile);
      if (bgFreeformCfg &&
          (bgFreeformCfg.hUpper + bgFreeformCfg.hLower) >= wh - 1e-6) {
        bgFreeformCfg = null;  // degenerate stub → fall through to solid
      }
    }
    if (bgFreeformCfg) {
      var _bfTexX = Math.floor(wx * tex.width);
      if (_bfTexX >= tex.width) _bfTexX = tex.width - 1;
      var _bgTSff = tintStr && tintStr[L.my] ? tintStr[L.my][L.mx] : 0;
      var _bgTIff = tintIdx && tintIdx[L.my] ? tintIdx[L.my][L.mx] : 0;
      _renderFreeformForeground(
        ctx, tex, _bfTexX, col, wx,
        flatTop, lineH, wh,
        drStart, drEnd, bgFreeformCfg,
        L.sd, fog, bri, fogColor,
        _bgTSff, _bgTIff, tintRGB, L.my, L.mx,
        L.tile, pd, h, halfH,
        stepX, stepY
      );
      // Wall decor on back layers (still wanted around the bands)
      _renderWallDecor(ctx, col, wx, drStart, drEnd, lineH,
                       flatTop, L.mx, L.my, L.sd, stepX, stepY);
      return;  // freeform bakes fog + side shading into each band
    }

    if (tex) {
      var texX = Math.floor(wx * tex.width);
      if (texX >= tex.width) texX = tex.width - 1;

      // Draw textured wall column — only WALL tiles tile their texture
      // PW-1 hook: per-pixel path for grimed back-layer walls.
      var _blGrime = (typeof GrimeGrid !== 'undefined')
        ? GrimeGrid.get(_bloodFloorId, L.mx, L.my) : null;
      if (_blGrime) {
        _drawTiledColumnPixel(ctx, tex, texX, flatTop, lineH, drStart, drEnd, col, wh, L.tile,
                              _blGrime, wx);
      } else {
        _drawTiledColumn(ctx, tex, texX, flatTop, lineH, drStart, drEnd, col, wh, L.tile);
      }

      // Wall decor on back layers
      _renderWallDecor(ctx, col, wx, drStart, drEnd, lineH,
                       flatTop, L.mx, L.my, L.sd, stepX, stepY);

      // Side shading
      if (L.sd === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(col, drStart, 1, stripH);
      }
    } else {
      // Flat-color fallback
      var base = (L.sd === 1) ? _wallColors.dark : _wallColors.light;
      var _bgTS = tintStr && tintStr[L.my] ? tintStr[L.my][L.mx] : 0;
      var _bgTI = tintIdx && tintIdx[L.my] ? tintIdx[L.my][L.mx] : 0;
      ctx.fillStyle = _applyFogAndBrightness(base, fog, bri, fogColor, _bgTS, _bgTI, tintRGB);
      ctx.fillRect(col, drStart, 1, stripH);
    }

    // Fog + brightness combined overlay — single pass to avoid alpha-stacking flicker.
    var _blDark = (bri < 0.95) ? (1 - bri) : 0;
    if (fog > 0.05 || _blDark > 0.05) {
      if (fog >= _blDark) {
        ctx.fillStyle = 'rgba(' + fogColor.r + ',' + fogColor.g + ',' + fogColor.b + ',' + fog + ')';
      } else {
        ctx.fillStyle = _tintedDark(tintStr, tintIdx, tintRGB, L.my, L.mx, _blDark);
      }
      ctx.fillRect(col, drStart, 1, stripH);
    }

    // NOTE: The underside fill for floating slabs is NOT drawn here.
    // It's drawn in the foreground pass so it can span FROM the front
    // face's drawEnd TO the back face's drawEnd (covering the back
    // face strip in the overlap region — which is the correct 3D
    // projection of the slab's bottom horizontal face).

    // ── Back-layer cap for furniture ────────────────────────────
    // When a back layer is a furniture tile (injected via _needBackFace),
    // draw a cap surface above the wall face — same logic as the
    // foreground cap but using back-layer geometry. Prevents a bare
    // wall sliver from peeking above the foreground cap at steep angles.
    if (wh < 0.95 && wh > 0.25 && drStart > halfH) {
      var _blCap = (L.tile === TILES.TABLE || L.tile === TILES.BED ||
                    L.tile === TILES.CHEST || L.tile === TILES.BAR_COUNTER);
      if (_blCap) {
        var blCapTop = Math.max(0, halfH);
        var blCapBot = Math.min(drStart, h);
        var blCapH = blCapBot - blCapTop;
        if (blCapH > 0) {
          var blCapR = 58, blCapG = 42, blCapB = 26;
          if (tex && tex.data) {
            var blCapTexX = Math.floor(wx * tex.width);
            if (blCapTexX >= tex.width) blCapTexX = tex.width - 1;
            var blCapIdx = blCapTexX * 4;
            blCapR = tex.data[blCapIdx];
            blCapG = tex.data[blCapIdx + 1];
            blCapB = tex.data[blCapIdx + 2];
          }
          var blCapBri = bri * 0.80;
          blCapR = Math.floor(blCapR * blCapBri);
          blCapG = Math.floor(blCapG * blCapBri);
          blCapB = Math.floor(blCapB * blCapBri);
          if (fog > 0.01) {
            var blCapInv = 1 - fog;
            blCapR = Math.floor(blCapR * blCapInv + fogColor.r * fog);
            blCapG = Math.floor(blCapG * blCapInv + fogColor.g * fog);
            blCapB = Math.floor(blCapB * blCapInv + fogColor.b * fog);
          }
          ctx.fillStyle = 'rgb(' + blCapR + ',' + blCapG + ',' + blCapB + ')';
          ctx.fillRect(col, blCapTop, 1, blCapH);
          if (L.sd === 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(col, blCapTop, 1, blCapH);
          }
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(col, blCapBot - 1, 1, 1);
        }
      }
    }

    // Edge line (top border only — bottom is at floor level)
    if (lineH > 20) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(col, drStart, 1, 1);
    }
  }

  // ── Floor casting — textured floor via ImageData ──
  // For each pixel below the horizon, computes the world floor position
  // and samples the floor texture. Uses a reusable ImageData buffer.
  function _renderFloor(ctx, w, h, halfH, player, fov, baseWallH, floorTex, fogDist, fogColor, grid, gridW, gridH, tileFloorTexArr) {
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
    var _wc = _contract && _contract.waterColor;
    var _waterR = _wc ? _wc.r : 15;
    var _waterG = _wc ? _wc.g : 35;
    var _waterB = _wc ? _wc.b : 65;
    var fogStart = fogDist * 0.5;
    var fogRange = (fogDist * 1.5) - fogStart;

    var halfHFloor = Math.floor(halfH);

    for (var row = 0; row < floorH; row++) {
      // Screen Y (actual pixel row on screen)
      var screenY = halfHFloor + row;
      // Distance from horizon
      var rowFromCenter = screenY - halfH;
      if (rowFromCenter <= 0) rowFromCenter = 0.5;

      // Floor distance for this scanline
      var rowDist = (halfH * baseWallH) / rowFromCenter;

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
        if (_bloodFloorId && typeof CleaningSystem !== 'undefined') {
          if (tileGX !== prevTileGX || tileGY !== prevTileGY) {
            cachedBlood = CleaningSystem.getBlood(tileGX, tileGY, _bloodFloorId);
            cachedFloorGrime = _hasGrimeGrid
              ? GrimeGrid.get(_bloodFloorId, tileGX, tileGY) : null;
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

        var pIdx = rowOffset + col * 4;
        buf[pIdx]     = r | 0;
        buf[pIdx + 1] = g | 0;
        buf[pIdx + 2] = b | 0;
        buf[pIdx + 3] = 255;

        floorX += floorStepX;
        floorY += floorStepY;
      }
    }

    ctx.putImageData(_floorImgData, 0, halfHFloor);
  }

  // ── Facing direction lookup for sprite directional shading ──
  // Maps enemy.facing string → [dx, dy] unit vector.
  var _FACE_VEC = {
    east:  [ 1,  0],
    south: [ 0,  1],
    west:  [-1,  0],
    north: [ 0, -1]
  };

  // Max darkness when enemy faces directly away from player.
  // 0.45 = heavy shadow, enough to read as "their back" without
  // fully obscuring the emoji.
  var FACING_DARK_MAX = 0.45;

  // ── Overhead awareness expressions (MGS-style indicators) ────────
  // Maps EnemyAI awareness state labels → overhead glyph + color.
  // Rendered above enemy sprites in world-space (canvas coordinates).
  var _AWARENESS_GLYPHS = {
    Unaware:    { glyph: '💤', color: '#aaa' },
    Suspicious: { glyph: '❓', color: '#cc4' },
    Alerted:    { glyph: '❗', color: '#c44' },
    Engaged:    { glyph: '⚔️',  color: '#c4c' }
  };

  // Overhead expression bob amplitude (px at distance 1)
  var OVERHEAD_BOB_AMP = 3;
  // Overhead expression bob frequency (cycles per second)
  var OVERHEAD_BOB_FREQ = 2.5;

  // ── Lightweight particle pool for status FX ──────────────────────
  // Fixed pool, no allocation per frame. Each particle has:
  //   emoji, x, y, vx, vy, life, maxLife, size, alpha
  var _PARTICLE_MAX = 48;
  var _particles = [];
  var _particleThrottle = {};  // Keyed by screenX bucket, limits spawn rate

  function _emitParticle(emoji, sx, sy, spriteH, dist, baseAlpha) {
    // Throttle: max 1 particle per sprite-bucket every 200ms
    var bucket = Math.floor(sx / 20);
    var now = Date.now();
    if (_particleThrottle[bucket] && now - _particleThrottle[bucket] < 200) return;
    _particleThrottle[bucket] = now;

    // Find a dead slot or overwrite oldest
    var slot = null;
    for (var pi = 0; pi < _particles.length; pi++) {
      if (_particles[pi].life <= 0) { slot = _particles[pi]; break; }
    }
    if (!slot) {
      if (_particles.length < _PARTICLE_MAX) {
        slot = { emoji: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 10, alpha: 1 };
        _particles.push(slot);
      } else {
        slot = _particles[0];
        for (var pi = 1; pi < _particles.length; pi++) {
          if (_particles[pi].life < slot.life) slot = _particles[pi];
        }
      }
    }

    var pSize = Math.max(8, Math.floor(spriteH * 0.25));
    slot.emoji = emoji;
    slot.x = sx + (Math.random() - 0.5) * spriteH * 0.4;
    slot.y = sy - spriteH * 0.2;
    slot.vx = (Math.random() - 0.5) * 0.3;
    slot.vy = -0.4 - Math.random() * 0.3;  // Float upward
    slot.life = 800 + Math.random() * 400;  // 800-1200ms
    slot.maxLife = slot.life;
    slot.size = pSize;
    slot.alpha = baseAlpha;
  }

  function _updateAndRenderParticles(ctx, dt) {
    for (var pi = 0; pi < _particles.length; pi++) {
      var p = _particles[pi];
      if (p.life <= 0) continue;

      p.life -= dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;

      var t = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = p.alpha * t * 0.7;
      ctx.font = Math.floor(p.size * t) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, p.x, p.y);
      ctx.restore();
    }
  }

  // ── Triple emoji stack renderer ──────────────────────────────────
  // Slot Y offsets as fraction of spriteH from center:
  //   Slot 0 (head):  -0.28
  //   Slot 1 (torso):  0.00
  //   Slot 2 (legs):  +0.28
  var _SLOT_Y = [-0.28, 0.0, 0.28];
  // Per-slot bob damping: head bobs full, legs stay grounded
  var _SLOT_BOB = [1.0, 0.6, 0.2];
  // Per-slot font scale (fraction of spriteH for each emoji)
  var _SLOT_FONT = 0.32;

  // ── Per-slot tint offscreen canvas ─────────────────────────────
  // Reusable scratch canvas for isolating individual emoji glyphs
  // so hue tint only colors the glyph pixels (source-atop), not a
  // bounding rect that bleeds onto transparent areas and other slots.
  var _tintCanvas = null;
  var _tintCtx    = null;
  // Default tint mask: [head, torso, legs]. Only clothes slots tinted.
  var _DEFAULT_TINT_SLOTS = [false, true, true];

  function _ensureTintCanvas(size) {
    if (!_tintCanvas || _tintCanvas.width < size || _tintCanvas.height < size) {
      _tintCanvas = document.createElement('canvas');
      _tintCanvas.width  = size;
      _tintCanvas.height = size;
      _tintCtx = _tintCanvas.getContext('2d');
    }
    return _tintCtx;
  }

  /**
   * Render a triple emoji stack at billboard position.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} stack - { head, torso, legs, hat, backWeapon, frontWeapon, headMods, torsoMods, tintHue }
   * @param {number} screenX - Horizontal center (px)
   * @param {number} centerY - Vertical center (px)
   * @param {number} spriteH - Total sprite height (px)
   * @param {number} spriteW - Total sprite width (px)
   * @param {number} hSquish - Horizontal squish from Euler flattening
   * @param {number} ySquish - Vertical squish for ground tilt
   * @param {string} facing  - Cardinal direction string ('north','south','east','west')
   * @param {Object} item    - Sorted sprite item (has .dx, .dy, .dist)
   */
  function _renderStack(ctx, stack, screenX, centerY, spriteH, spriteW, hSquish, ySquish, facing, item, bobY, stackFX) {
    var fontSize = Math.max(8, Math.floor(spriteH * _SLOT_FONT));
    var sx = hSquish < 0.98 ? hSquish : 1;
    // Differential idle bob per slot (head leads, legs anchor)
    var baseBob = bobY || 0;

    // ── Stack FX extraction ──────────────────────────────────────
    var fx = stackFX || {};
    var travelSpring = fx.travelSpring || 0;
    var lungePhase   = fx.lungePhase   || 0;
    var flashWhite   = fx.flashWhite   || false;
    var dotFlash     = fx.dotFlash     || false;
    var statusHue    = (fx.statusHue !== null && fx.statusHue !== undefined) ? fx.statusHue : -1;
    var statusAlpha  = fx.statusAlpha  || 0;
    var ghostAlpha   = fx.ghostAlpha !== undefined ? fx.ghostAlpha : 1;

    // Apply ghost alpha to all slots
    if (ghostAlpha < 1) ctx.globalAlpha *= ghostAlpha;

    // Per-slot travel spring offsets (head sways most, legs least)
    // Spring is a horizontal displacement that creates a walking sway
    var _SPRING_SCALE = [1.0, 0.5, 0.15];
    // Per-slot lunge offsets (torso leads, head follows, legs anchor)
    // Lunge shifts slots upward (toward player in billboard space) for forward lean
    var _LUNGE_SCALE = [0.6, 1.0, 0.1];

    // Resolve directional facing dot product for layer visibility
    var faceDot = 0;
    if (facing && item) {
      var fv = _FACE_VEC[facing];
      if (fv && item.dist > 0.01) {
        var invD = 1 / item.dist;
        var ex = -item.dx * invD;
        var ey = -item.dy * invD;
        faceDot = fv[0] * ex + fv[1] * ey;
      }
    }
    // Layer visibility based on facing
    var showFrontWeapon = faceDot > -0.1;
    var showBackWeapon  = faceDot < 0.2;
    // When NPC faces away, back weapon renders ON TOP (highest z) instead of behind
    var backWeaponOnTop = faceDot < -0.3;
    var headDim = faceDot < -0.3 ? 0.6 : 1.0;
    // Head Y-squash when facing away (back-of-head foreshortening)
    var headSquash = faceDot < -0.3 ? 0.94 : 1.0;
    // Weapon scale multiplier at side angles (foreshortening)
    var absFace = Math.abs(faceDot);
    var weaponFore = absFace < 0.3 ? 0.7 : 1.0;
    // Hat X-shift in facing direction (perspective offset)
    var hatShiftX = 0;
    if (facing && absFace < 0.5) {
      var fv2 = _FACE_VEC[facing];
      if (fv2) hatShiftX = fv2[0] * fontSize * 0.12;
    }
    // Back weapon squish: weapon is perpendicular to body plane, so it
    // foreshortens LESS than the body at side angles. Lerp toward 1.0.
    var bwSx = sx + (1 - sx) * 0.6;

    var slots = [stack.head, stack.torso, stack.legs];
    var mods  = [stack.headMods, stack.torsoMods, null];

    for (var si = 0; si < 3; si++) {
      var slotEmoji = slots[si];
      if (!slotEmoji) continue;

      var slotBob = baseBob * _SLOT_BOB[si];
      // Travel spring: horizontal sway per slot
      var slotSpringX = travelSpring * _SPRING_SCALE[si] * fontSize * 0.5;
      // Attack lunge: Y offset (torso dips forward most)
      var slotLungeY = lungePhase * _LUNGE_SCALE[si] * fontSize * -0.3;
      var slotY = centerY + _SLOT_Y[si] * spriteH + slotBob + slotLungeY;
      var slotX = screenX + slotSpringX;

      // ── Back sub-layers (render behind this slot) ──
      if (si === 0 && stack.hat && stack.hat.behind) {
        _renderSubLayer(ctx, stack.hat.emoji, slotX + hatShiftX, slotY - fontSize * 0.4,
                        fontSize * stack.hat.scale * 1.5, sx, ySquish);
      }
      if (si === 1 && stack.backWeapon && showBackWeapon && !backWeaponOnTop) {
        // Position with offsetX (fraction of spriteW) — mirrors frontWeapon pattern.
        // bwSx reduces Euler squish (weapon perpendicular to body plane).
        var bwBehindX = slotX + spriteW * (stack.backWeapon.offsetX || 0.3);
        _renderSubLayer(ctx, stack.backWeapon.emoji, bwBehindX, slotY,
                        fontSize * (stack.backWeapon.scale || 0.4), bwSx, ySquish);
      }

      // ── Slot modifiers (behind main emoji) ──
      if (mods[si]) {
        for (var mi = 0; mi < mods[si].length; mi++) {
          var mod = mods[si][mi];
          var modX = slotX + spriteW * (mod.offsetX || 0);
          var modY = slotY + spriteH * (mod.offsetY || 0);
          _renderSubLayer(ctx, mod.emoji, modX, modY,
                          fontSize * (mod.scale || 0.4), sx, ySquish);
        }
      }

      // ── Main slot emoji ──
      // Determine if this slot should receive hue tint (clothes only by default)
      var hasHueTint   = (stack.tintHue !== null && stack.tintHue !== undefined);
      var hasColorTint = !!(stack.tintColor && typeof stack.tintColor.r === 'number');
      var wantTint = ((hasHueTint || hasColorTint) && spriteH > 10);
      if (wantTint) {
        var tSlots = stack.tintSlots || _DEFAULT_TINT_SLOTS;
        wantTint = !!tSlots[si];
      }

      ctx.save();
      ctx.translate(slotX, slotY);
      var slotSx = sx;
      var slotSy = ySquish;
      // Head: dim + Y-squash when facing away
      if (si === 0) {
        if (headDim < 1) ctx.globalAlpha *= headDim;
        if (headSquash < 1) slotSy *= headSquash;
      }
      if (slotSx !== 1 || slotSy !== 1) ctx.scale(slotSx, slotSy);

      if (wantTint) {
        // ── Per-glyph tint: draw emoji on offscreen canvas, color
        //    only the glyph pixels via source-atop, then composite back.
        var tSize = Math.ceil(fontSize * 2.5);
        var tHalf = tSize * 0.5;
        var tc = _ensureTintCanvas(tSize);
        tc.clearRect(0, 0, tSize, tSize);

        // 1) Draw emoji centered on scratch canvas
        tc.globalCompositeOperation = 'source-over';
        tc.globalAlpha = 1;
        tc.font = fontSize + 'px serif';
        tc.textAlign = 'center';
        tc.textBaseline = 'middle';
        tc.fillText(slotEmoji, tHalf, tHalf);

        // 2) Paint hue ONLY on glyph pixels (source-atop)
        //    Stacks may override with a direct tintColor (e.g. pure black
        //    for hero antagonists) and a stronger tintAlpha to achieve a
        //    true darken/black wash that hue rotation cannot produce.
        tc.globalCompositeOperation = 'source-atop';
        tc.globalAlpha = (typeof stack.tintAlpha === 'number') ? stack.tintAlpha : 0.22;
        var rgb;
        if (stack.tintColor && typeof stack.tintColor.r === 'number') {
          rgb = stack.tintColor;
        } else {
          rgb = _hueToRgb(stack.tintHue);
        }
        tc.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
        tc.fillRect(0, 0, tSize, tSize);

        // 3) Reset scratch state
        tc.globalCompositeOperation = 'source-over';
        tc.globalAlpha = 1;

        // 4) Draw tinted result onto main canvas (inherits transform).
        //    Use 9-arg drawImage to sample only the tSize×tSize region —
        //    _tintCanvas may be larger from a prior sprite, and the 4-arg
        //    form maps the FULL canvas into the destination, shifting the
        //    emoji off-center.
        ctx.drawImage(_tintCanvas, 0, 0, tSize, tSize, -tHalf, -tHalf, tSize, tSize);
      } else {
        ctx.font = fontSize + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slotEmoji, 0, 0);
      }
      ctx.restore();

      // ── Front sub-layers (render over this slot) ──
      if (si === 0 && stack.hat && !stack.hat.behind) {
        _renderSubLayer(ctx, stack.hat.emoji, slotX + hatShiftX, slotY - fontSize * 0.4,
                        fontSize * stack.hat.scale * 1.5, sx, ySquish);
      }
      if (si === 1 && stack.frontWeapon && showFrontWeapon) {
        var fwX = slotX + spriteW * stack.frontWeapon.offsetX;
        _renderSubLayer(ctx, stack.frontWeapon.emoji, fwX, slotY,
                        fontSize * stack.frontWeapon.scale * weaponFore, sx, ySquish);
      }
    }

    // ── Back weapon ON TOP pass (NPC facing away → weapon at highest z) ──
    if (stack.backWeapon && showBackWeapon && backWeaponOnTop) {
      var bwTopY = centerY + _SLOT_Y[1] * spriteH + (baseBob * _SLOT_BOB[1]);
      var bwTopX = screenX + travelSpring * _SPRING_SCALE[1] * fontSize * 0.5
                 + spriteW * (stack.backWeapon.offsetX || 0.3);
      _renderSubLayer(ctx, stack.backWeapon.emoji, bwTopX, bwTopY,
                      fontSize * (stack.backWeapon.scale || 0.4), bwSx, ySquish);
    }

    // ── Status effect hue overlay (poison green, frozen blue, etc.) ──
    if (statusHue >= 0 && statusAlpha > 0 && spriteH > 6) {
      var sRgb = _hueToRgb(statusHue);
      ctx.save();
      ctx.globalAlpha = statusAlpha;
      ctx.fillStyle = 'rgb(' + sRgb.r + ',' + sRgb.g + ',' + sRgb.b + ')';
      ctx.fillRect(screenX - spriteW * 0.45, centerY - spriteH * 0.45,
                   spriteW * 0.9, spriteH * 0.9);
      ctx.restore();
    }

    // ── Damage white flash (all slots flash white on hit) ──
    if ((flashWhite || dotFlash) && spriteH > 6) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = flashWhite ? 0.6 : 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(screenX - spriteW * 0.45, centerY - spriteH * 0.45,
                   spriteW * 0.9, spriteH * 0.9);
      ctx.restore();
    }
  }

  /**
   * Render a sub-layer emoji (hat, weapon, modifier) at given position/scale.
   */
  /**
   * Render a corpse pile — scattered stack slots on the ground plane.
   * Each slot emoji is drawn at its pile offset with resting rotation.
   */
  function _renderCorpsePile(ctx, pile, screenX, centerY, spriteH, ySquish) {
    var fontSize = Math.max(6, Math.floor(spriteH * _SLOT_FONT));
    var dir = pile.dir || 1;
    var slots = pile.slots;

    for (var si = 0; si < slots.length; si++) {
      if (!slots[si]) continue;
      var px = screenX + pile.pileX[si] * dir * spriteH * 0.4;
      var py = centerY + pile.pileY[si] * spriteH * 0.2;
      var rot = pile.pileRot[si] * dir;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      if (ySquish !== 1) ctx.scale(1, ySquish);
      ctx.globalAlpha = 0.85;
      ctx.font = Math.floor(fontSize * 0.9) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slots[si], 0, 0);
      ctx.restore();
    }

    // Detached accessories (hat, weapon) at scattered offsets
    if (pile.hat) {
      var hatX = screenX + dir * spriteH * 0.25;
      var hatY = centerY - spriteH * 0.1;
      ctx.save();
      ctx.translate(hatX, hatY);
      ctx.rotate(dir * 0.4);
      if (ySquish !== 1) ctx.scale(1, ySquish);
      ctx.globalAlpha = 0.7;
      ctx.font = Math.floor(fontSize * (pile.hatScale || 0.5)) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pile.hat, 0, 0);
      ctx.restore();
    }
    if (pile.frontWeapon) {
      var wpnX = screenX - dir * spriteH * 0.3;
      var wpnY = centerY + spriteH * 0.05;
      ctx.save();
      ctx.translate(wpnX, wpnY);
      ctx.rotate(-dir * 0.5);
      if (ySquish !== 1) ctx.scale(1, ySquish);
      ctx.globalAlpha = 0.75;
      ctx.font = Math.floor(fontSize * (pile.frontWeaponScale || 0.65)) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pile.frontWeapon, 0, 0);
      ctx.restore();
    }
  }

  function _renderSubLayer(ctx, emoji, x, y, fontSize, hSquish, ySquish) {
    if (!emoji) return;
    ctx.save();
    ctx.translate(x, y);
    var sx = hSquish < 0.98 ? hSquish : 1;
    if (sx !== 1 || ySquish !== 1) ctx.scale(sx, ySquish);
    ctx.font = Math.max(6, Math.floor(fontSize)) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  /**
   * Convert a hue (0-360) to an RGB object for tint overlay.
   */
  function _hueToRgb(hue) {
    // HSL to RGB with S=100%, L=50%
    var h = hue / 60;
    var c = 255;
    var x = Math.floor(c * (1 - Math.abs(h % 2 - 1)));
    if (h < 1) return { r: c, g: x, b: 0 };
    if (h < 2) return { r: x, g: c, b: 0 };
    if (h < 3) return { r: 0, g: c, b: x };
    if (h < 4) return { r: 0, g: x, b: c };
    if (h < 5) return { r: x, g: 0, b: c };
    return { r: c, g: 0, b: x };
  }

  function _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor, minDist, maxDist) {
    // Optional distance window — lets callers split sprite rendering
    // into "distant" and "near" passes sandwiching the terminus fog
    // veil so close sprites punch through the horizon band. Defaults
    // to no filter (render everything in the normal render distance).
    var hasMin = (typeof minDist === 'number');
    var hasMax = (typeof maxDist === 'number');
    var sorted = [];
    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      var dx = (s.x + 0.5) - px;
      var dy = (s.y + 0.5) - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3 || dist > renderDist) continue;
      if (hasMin && dist <  minDist) continue;
      if (hasMax && dist >= maxDist) continue;

      var angle = Math.atan2(dy, dx) - pDir;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      if (Math.abs(angle) > halfFov + 0.3) continue;

      sorted.push({ sprite: s, dist: dist, angle: angle, dx: dx, dy: dy });
    }

    sorted.sort(function (a, b) { return b.dist - a.dist; });

    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      var s = item.sprite;
      var dist = item.dist;
      var angle = item.angle;

      var screenX = Math.floor(w / 2 + (angle / halfFov) * (w / 2));
      var baseScale = (s.scale || 0.6) / dist;
      // Pulse effect: scaleAdd oscillates 0..max, adds to base scale
      var pulseAdd = s.scaleAdd || 0;
      var scale = baseScale + pulseAdd / dist;
      var spriteH = Math.floor(h * scale);
      var spriteW = spriteH;
      // Bob effect: vertical oscillation (world-space px scaled by distance)
      var bobOffset = s.bobY ? Math.floor(s.bobY * h / dist * 0.15) : 0;

      // ── Euler flattening: narrow sprites at perpendicular facing ──
      // Dot product of facing vs enemy→player gives front/back (|1|)
      // vs side (0). Side-facing sprites appear narrower, like turning
      // a paper cutout. Uses cos²-shaped curve for smooth roll-off.
      if (s.facing) {
        var fv = _FACE_VEC[s.facing];
        if (fv && dist > 0.01) {
          var invD = 1 / dist;
          var ex = -item.dx * invD;
          var ey = -item.dy * invD;
          var faceDot = fv[0] * ex + fv[1] * ey;
          // |dot|=1 → front/back (full width), 0 → perpendicular (narrow)
          // flatScale: 0.55 at perpendicular, 1.0 at front/back
          var absDot = Math.abs(faceDot);
          var flatScale = 0.55 + 0.45 * absDot * absDot; // cos²-ish
          spriteW = Math.floor(spriteW * flatScale);
        }
      }

      var drawX = screenX - spriteW / 2;

      // Z-buffer check
      var startCol = Math.max(0, Math.floor(drawX));
      var endCol = Math.min(w - 1, Math.floor(drawX + spriteW));
      var visible = false;
      for (var col = startCol; col <= endCol; col++) {
        if (_zBuffer[col] > dist) { visible = true; break; }
      }
      if (!visible) continue;

      var fogFactor = _contract
        ? SpatialContract.getFogFactor(_contract, dist, renderDist, fogDist)
        : Math.min(1, dist / fogDist);
      // Interactive/solid sprites (mailbox, bonfire ring) stay opaque —
      // fog fade on close-range interactables looks like a rendering bug.
      var alpha = s.noFogFade ? 1.0 : Math.max(0.1, 1 - fogFactor);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Sprite center Y with bob displacement
      // Ground-level sprites (corpses, items) render at floor plane
      var groundShift = s.groundLevel ? Math.floor(spriteH * 0.35) : 0;
      var spriteCenterY = halfH + bobOffset + groundShift;

      // Billboard tilt for ground sprites (origami corpse / Paper Mario style)
      // Y-scale compresses to ~40% so they look like flat objects on the floor,
      // with a slight tilt toward the player for visibility from distance.
      // Closer corpses appear flatter; distant ones tilt more upward.
      var ySquish = 1;
      if (s.groundTilt) {
        var tiltBase = 0.35;  // Minimum Y scale (very flat)
        var tiltLift = Math.min(0.25, 0.8 / (dist + 0.5)); // Lift more when close
        ySquish = tiltBase + tiltLift;
      }

      // ── Glow halo (drawn behind sprite) ─────────────────────────
      // Radial gradient with multi-stop falloff for soft orb-like
      // light spill. Matches the silhouette glow pattern for visual
      // consistency with fog-tinted creature rendering and cavity glow.
      if (s.glow && s.glowRadius && spriteH > 4) {
        var glowRad = Math.floor(spriteH * 0.5 + s.glowRadius / dist * 8);
        var sgAlpha = alpha * 0.35;
        // Parse glow color: accepts '#rrggbb' or 'rgba(r,g,b,a)'
        var sgRGB = _parseGlowRGB(s.glow);
        var sgGrad = ctx.createRadialGradient(screenX, spriteCenterY, 0, screenX, spriteCenterY, glowRad);
        sgGrad.addColorStop(0, 'rgba(' + sgRGB + ',' + sgAlpha.toFixed(3) + ')');
        sgGrad.addColorStop(0.5, 'rgba(' + sgRGB + ',' + (sgAlpha * 0.4).toFixed(3) + ')');
        sgGrad.addColorStop(1, 'rgba(' + sgRGB + ',0)');
        ctx.fillStyle = sgGrad;
        ctx.fillRect(screenX - glowRad, spriteCenterY - glowRad, glowRad * 2, glowRad * 2);
      }

      // Horizontal squish ratio for perpendicular flattening
      var hSquish = spriteH > 0 ? spriteW / spriteH : 1;

      // ── Pedestal occlusion (sprite behind a freeform stone base) ──
      // Scan the columns the sprite spans; if any column has a
      // freeform pedestal in front of the sprite AND that pedestal
      // is NOT in the same grid cell as the sprite, clip the
      // sprite's bottom at the tightest pedestal-top screen row.
      // Same-cell sprites (HEARTH dragonfire emoji, future bonfire
      // glow billboards) skip the clip so they can render through
      // the cavity band.
      var _pedClipped = false;
      var _pedClipY = Infinity;
      var _spriteMX = Math.floor(s.x);
      var _spriteMY = Math.floor(s.y);
      for (var _pcol = startCol; _pcol <= endCol; _pcol++) {
        var _pd = _zBufferPedDist[_pcol];
        if (_pd > 0 && _pd < dist) {
          // Different tile than the sprite → pedestal occludes.
          if (_zBufferPedMX[_pcol] !== _spriteMX ||
              _zBufferPedMY[_pcol] !== _spriteMY) {
            var _py2 = _zBufferPedTopY[_pcol];
            if (_py2 < _pedClipY) _pedClipY = _py2;
          }
        }
      }
      if (_pedClipY < Infinity) {
        var _spriteBottom = spriteCenterY + spriteH * 0.5 * ySquish;
        if (_pedClipY < _spriteBottom) {
          ctx.save();
          ctx.beginPath();
          // Clip the sprite's draw region to rows ABOVE the pedestal
          // top. Extra horizontal padding lets overhead capsule/glow
          // render outside the raw sprite rect without re-clipping.
          ctx.rect(screenX - spriteW, 0, spriteW * 2, _pedClipY);
          ctx.clip();
          _pedClipped = true;
        }
      }

      // ── Counter occlusion (vendor behind half-height counter) ──
      var _counterClipped = false;
      if (s.counterOcclude && s.stack && spriteH > 6) {
        ctx.save();
        ctx.beginPath();
        // Clip to upper 60% of sprite — legs hidden by counter tile
        var clipTop = spriteCenterY - spriteH * 0.5;
        ctx.rect(screenX - spriteW, clipTop, spriteW * 2, spriteH * 0.6);
        ctx.clip();
        _counterClipped = true;
      }

      if (s.stack && spriteH > 6 && s.stackFX && s.stackFX.sleeping) {
        // ── Sleeping stack: render as pile (like corpse) ────────
        var sleepPile = {
          slots: [s.stack.head, s.stack.torso, s.stack.legs],
          dir: 1,
          pileX: [-0.3, 0.1, 0.35],
          pileY: [0.15, 0.0, -0.1],
          pileRot: [0.12, 0.08, 0.04],
          hat: s.stack.hat ? s.stack.hat.emoji : null,
          hatScale: s.stack.hat ? s.stack.hat.scale : 0.5,
          frontWeapon: s.stack.frontWeapon ? s.stack.frontWeapon.emoji : null,
          frontWeaponScale: s.stack.frontWeapon ? s.stack.frontWeapon.scale : 0.65
        };
        _renderCorpsePile(ctx, sleepPile, screenX, spriteCenterY, spriteH, ySquish);
      } else if (s.stack && spriteH > 6) {
        // ── Triple emoji stack rendering ──────────────────────────
        _renderStack(ctx, s.stack, screenX, spriteCenterY, spriteH, spriteW,
                     hSquish, ySquish, s.facing, item, bobOffset, s.stackFX);
      } else if (s.corpseStack && spriteH > 4) {
        // ── Corpse pile: scattered stack slots on ground ─────────
        _renderCorpsePile(ctx, s.corpseStack, screenX, spriteCenterY, spriteH, ySquish);
      } else if (s.emoji) {
        ctx.save();
        ctx.translate(screenX, spriteCenterY);
        var sx = hSquish < 0.98 ? hSquish : 1;
        if (sx !== 1 || ySquish !== 1) ctx.scale(sx, ySquish);
        ctx.font = Math.floor(spriteH * 0.8) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, 0, 0);
        // Overlay emoji (e.g. translucent 🐉 over 🔥 for dragonfire)
        if (s.emojiOverlay) {
          var ov = s.emojiOverlay;
          var prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = prevAlpha * (ov.opacity || 0.5);
          var ovScale = ov.scale || 1.0;
          if (ovScale !== 1.0) ctx.scale(ovScale, ovScale);
          ctx.font = Math.floor(spriteH * 0.8 / ovScale) + 'px serif';
          ctx.fillText(ov.emoji, ov.offX || 0, ov.offY || 0);
          ctx.globalAlpha = prevAlpha;
        }
        ctx.restore();
      } else if (s.color) {
        ctx.fillStyle = s.color;
        ctx.fillRect(drawX, spriteCenterY - spriteH / 2, spriteW, spriteH * ySquish);
      }

      // Close counter occlusion clip if active
      if (_counterClipped) {
        ctx.restore();
      }
      // Close pedestal occlusion clip if active (restored after
      // counter clip so the two nested save/restores stay balanced).
      if (_pedClipped) {
        ctx.restore();
      }

      // ── Tint overlay ───────────────────────────────────────────
      if (s.tint && spriteH > 4) {
        ctx.fillStyle = s.tint;
        ctx.fillRect(
          screenX - spriteW * 0.45,
          spriteCenterY - spriteH * 0.45,
          spriteW * 0.9,
          spriteH * 0.9
        );
      }

      // ── Directional facing shade ──────────────────────────────
      // Darken sprites facing away from the player. The dot product
      // of the enemy's facing vector and the enemy→player vector
      // gives -1 (back) to +1 (front). We map that to a 0→max
      // darkness overlay, giving implied depth and pathing.
      //
      // Exterior floors (ceilingType === 'sky') get an additional
      // radial center-fade that implies the featureless back of the
      // emoji — a soft silhouette where the center washes out to a
      // color-averaged blur while the edges retain some definition.
      if (s.facing && spriteH > 0 && !s.friendly) {
        // Skip directional shading for friendly NPCs — they should always
        // be clearly visible regardless of facing direction.
        var fv = _FACE_VEC[s.facing];
        if (fv) {
          var invDist = 1 / dist;
          var etpX = -item.dx * invDist;
          var etpY = -item.dy * invDist;
          var dot = fv[0] * etpX + fv[1] * etpY;
          var darkness = (1 - dot) * 0.5 * FACING_DARK_MAX;

          if (darkness > 0.01) {
            var isExterior = _contract && _contract.ceilingType === 'sky';
            var backFactor = Math.max(0, -dot);   // 0 when front, 1 when directly away

            if (isExterior && backFactor > 0.2) {
              // ── Exterior back-of-sprite: radial silhouette ──
              // A radial gradient that is opaque at center and transparent
              // at edges — the emoji's details vanish in the middle while
              // the silhouette outline persists. Combined with fog color
              // so the back blends into the environment.
              var silAlpha = Math.min(0.65, backFactor * 0.7);
              var fogR = fogColor ? fogColor.r : 0;
              var fogG = fogColor ? fogColor.g : 0;
              var fogB = fogColor ? fogColor.b : 0;
              var silR = Math.round(fogR * 0.4);
              var silG = Math.round(fogG * 0.4);
              var silB = Math.round(fogB * 0.4);
              var sX = screenX;
              var sY = spriteCenterY;
              var sR = Math.max(spriteW, spriteH) * 0.45;
              var grad = ctx.createRadialGradient(sX, sY, 0, sX, sY, sR);
              grad.addColorStop(0, 'rgba(' + silR + ',' + silG + ',' + silB + ',' + silAlpha.toFixed(3) + ')');
              grad.addColorStop(0.6, 'rgba(' + silR + ',' + silG + ',' + silB + ',' + (silAlpha * 0.4).toFixed(3) + ')');
              grad.addColorStop(1, 'rgba(' + silR + ',' + silG + ',' + silB + ',0)');
              ctx.globalAlpha = 1;
              ctx.fillStyle = grad;
              ctx.fillRect(
                screenX - spriteW * 0.5,
                spriteCenterY - spriteH * 0.5,
                spriteW, spriteH
              );
            } else {
              // ── Interior / dungeon: flat darkness overlay ──
              ctx.globalAlpha = 1;
              ctx.fillStyle = 'rgba(0,0,0,' + darkness.toFixed(3) + ')';
              ctx.fillRect(
                screenX - spriteW * 0.45,
                spriteCenterY - spriteH * 0.45,
                spriteW * 0.9,
                spriteH * 0.9
              );
            }
          }
        }
      }

      // ── Particle FX (status emoji floating upward) ──────────────
      // Lightweight: spawn particles into a shared pool, render with
      // the sprite's screen coordinates. Pool lives on the module.
      if (s.particleEmoji && spriteH > 10) {
        _emitParticle(s.particleEmoji, screenX, spriteCenterY, spriteH, dist, alpha);
      }

      // ── Status overlay text (BURN, PARA, ATK+, etc.) ────────────
      if (s.overlayText && spriteH > 12) {
        var olSize = Math.max(8, Math.floor(spriteH * 0.22));
        ctx.globalAlpha = alpha * 0.85;
        ctx.font = 'bold ' + olSize + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Dark outline for readability
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeText(s.overlayText, screenX, spriteCenterY - spriteH * 0.45);
        ctx.fillStyle = '#fff';
        ctx.fillText(s.overlayText, screenX, spriteCenterY - spriteH * 0.45);
      }

      // ── Kaomoji capsule (intent + speech) above head ──────────────
      // Replaces old floating emoji intent glyph with a pill-shaped
      // capsule containing animated kaomoji text.
      var _capsuleRendered = false;
      if (typeof KaomojiCapsule !== 'undefined' && s.id !== undefined && spriteH > 12) {
        var capsuleNow = performance.now();
        var capData = KaomojiCapsule.getRenderData(s.id, capsuleNow);
        if (capData && capData.text) {
          _capsuleRendered = true;
          var cbobPhase = (capsuleNow * 0.001 * OVERHEAD_BOB_FREQ * Math.PI * 2);
          var cbob = Math.sin(cbobPhase) * OVERHEAD_BOB_AMP / dist;

          // Position capsule above head slot (or above single-emoji sprite)
          var capsuleBaseY = s.stack
            ? spriteCenterY - spriteH * 0.28 // head slot Y
            : spriteCenterY;
          var capsuleY = capsuleBaseY - spriteH * 0.32 + cbob;

          // Capsule dimensions scale with sprite height
          var capFontSize = Math.max(8, Math.floor(spriteH * 0.18));
          var textWidth = capData.text.length * capFontSize * 0.55;
          var capsuleW = Math.max(textWidth + capFontSize * 0.8, spriteH * 0.35);
          var capsuleH = capFontSize * 1.4;
          var capR = capsuleH / 2; // Corner radius = half height (full pill)

          // Background pill
          ctx.save();
          ctx.globalAlpha = alpha * capData.alpha * 0.5;
          ctx.fillStyle = 'rgba(' + capData.bgR + ',' + capData.bgG + ',' + capData.bgB + ',0.55)';
          ctx.beginPath();
          // Rounded rect as pill shape
          var cx1 = screenX - capsuleW / 2;
          var cy1 = capsuleY - capsuleH / 2;
          if (ctx.roundRect) {
            ctx.roundRect(cx1, cy1, capsuleW, capsuleH, capR);
          } else {
            // Fallback for browsers without roundRect
            ctx.moveTo(cx1 + capR, cy1);
            ctx.lineTo(cx1 + capsuleW - capR, cy1);
            ctx.arcTo(cx1 + capsuleW, cy1, cx1 + capsuleW, cy1 + capR, capR);
            ctx.lineTo(cx1 + capsuleW, cy1 + capsuleH - capR);
            ctx.arcTo(cx1 + capsuleW, cy1 + capsuleH, cx1 + capsuleW - capR, cy1 + capsuleH, capR);
            ctx.lineTo(cx1 + capR, cy1 + capsuleH);
            ctx.arcTo(cx1, cy1 + capsuleH, cx1, cy1 + capsuleH - capR, capR);
            ctx.lineTo(cx1, cy1 + capR);
            ctx.arcTo(cx1, cy1, cx1 + capR, cy1, capR);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Kaomoji text
          ctx.save();
          ctx.globalAlpha = alpha * capData.alpha * 0.95;
          ctx.font = 'bold ' + capFontSize + 'px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Dark outline for readability
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeText(capData.text, screenX, capsuleY);
          ctx.fillStyle = '#fff';
          ctx.fillText(capData.text, screenX, capsuleY);
          ctx.restore();
        }
      }

      // ── Card stack telegraph (rendered below capsule during combat) ──
      if (typeof EnemyIntent !== 'undefined' && EnemyIntent.isActive() && spriteH > 18) {
        var intentData = EnemyIntent.getRenderData();
        if (intentData && s.id !== undefined && intentData.enemyId === s.id && intentData.greed > 0) {
          _capsuleRendered = true;
          var csNow = Date.now();
          var csBobPhase = (csNow * 0.001 * OVERHEAD_BOB_FREQ * Math.PI * 2);
          var csBob = Math.sin(csBobPhase) * OVERHEAD_BOB_AMP / dist;
          var csBaseY = s.stack
            ? spriteCenterY - spriteH * 0.28
            : spriteCenterY;
          var csOverheadY = csBaseY - spriteH * 0.32 + csBob;

          var slotSize = Math.max(8, Math.floor(spriteH * 0.18));
          var slotGap = Math.max(2, Math.floor(slotSize * 0.25));
          var totalW = intentData.greed * slotSize + (intentData.greed - 1) * slotGap;
          // Card row sits above the capsule
          var cardRowY = csOverheadY - slotSize * 0.9;
          var stackStartX = screenX - totalW * 0.5;

          ctx.font = slotSize + 'px serif';
          ctx.textBaseline = 'bottom';
          ctx.textAlign = 'center';

          for (var ci = 0; ci < intentData.greed; ci++) {
            var slotCX = stackStartX + ci * (slotSize + slotGap) + slotSize * 0.5;

            if (ci < intentData.cardEmojis.length) {
              ctx.globalAlpha = alpha * 0.9;
              ctx.fillText(intentData.cardEmojis[ci], slotCX, cardRowY);
            } else {
              ctx.globalAlpha = alpha * 0.3;
              ctx.fillStyle = 'rgba(255,255,255,0.4)';
              ctx.fillRect(
                slotCX - slotSize * 0.35,
                cardRowY - slotSize * 0.8,
                slotSize * 0.7,
                slotSize * 0.7
              );
            }
          }

          // Ready pulse (stack full — flashing warning)
          if (intentData.ready) {
            var csPulse = (Math.sin(csNow * 0.008) * 0.5 + 0.5);
            ctx.globalAlpha = alpha * 0.25 * csPulse;
            ctx.fillStyle = '#ff4040';
            ctx.fillRect(
              stackStartX - slotGap,
              cardRowY - slotSize,
              totalW + slotGap * 2,
              slotSize * 1.1
            );
          }
        }
      }

      // Exploration awareness glyph (only when capsule is NOT shown)
      // Friendly entities (Dispatcher, vendors, quest givers) never show the
      // hostile ❓/❗/⚔ ladder even if their awareness field gets nudged —
      // they're not threats, so painting an alert indicator would lie to the
      // player. Gated here in addition to the EnemyAI skip in game.js so the
      // visual stays quiet regardless of how awareness was mutated.
      if (!_capsuleRendered && !s.friendly && s.awareness !== undefined && spriteH > 8) {
        var awarenessState = typeof EnemyAI !== 'undefined'
          ? EnemyAI.getAwarenessState(s.awareness)
          : null;
        if (awarenessState && awarenessState.label !== 'Unaware') {
          var glyphInfo = _AWARENESS_GLYPHS[awarenessState.label];
          if (glyphInfo) {
            var overheadY = spriteCenterY - spriteH * 0.55;
            var bobPhase = (Date.now() * 0.001 * OVERHEAD_BOB_FREQ * Math.PI * 2);
            var bob = Math.sin(bobPhase) * OVERHEAD_BOB_AMP / dist;

            var glyphSize = Math.max(10, Math.floor(spriteH * 0.35));
            ctx.globalAlpha = alpha * 0.9;
            ctx.font = glyphSize + 'px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(glyphInfo.glyph, screenX, overheadY + bob);
          }
        }
      }

      ctx.restore();
    }
  }

  // ── Tint helpers ────────────────────────────────────────────────
  // Shared by foreground and back-layer brightness overlays.

  /**
   * Build an rgba() darkness overlay string, tinted by the light palette.
   * @param {Array[]} tS   - tint strength map (Float32Array[])
   * @param {Array[]} tI   - tint index map (Uint8Array[])
   * @param {Array}   tRGB - palette: [[r,g,b], ...]
   * @param {number}  my   - tile Y
   * @param {number}  mx   - tile X
   * @param {number}  alpha - overlay opacity (1-brightness)
   * @returns {string} rgba() CSS color
   */
  function _tintedDark(tS, tI, tRGB, my, mx, alpha) {
    var s = tS && tS[my] ? tS[my][mx] : 0;
    if (s > 0.01 && tRGB) {
      var idx = tI && tI[my] ? tI[my][mx] : 0;
      var c = tRGB[idx] || tRGB[0];
      return 'rgba(' + ((s * c[0]) | 0) + ',' + ((s * c[1]) | 0) + ',' + ((s * c[2]) | 0) + ',' + alpha + ')';
    }
    return 'rgba(0,0,0,' + alpha + ')';
  }

  function _applyFogAndBrightness(hexColor, fogFactor, brightness, fogColor, tintS, tintI, tintRGB) {
    var r = parseInt(hexColor.substr(1, 2), 16);
    var g = parseInt(hexColor.substr(3, 2), 16);
    var b = parseInt(hexColor.substr(5, 2), 16);

    r = Math.floor(r * brightness);
    g = Math.floor(g * brightness);
    b = Math.floor(b * brightness);

    // Color tint: shift toward palette color in dim areas near tinted sources
    if (tintS > 0.01 && tintRGB) {
      var inv = 1 - brightness; // Stronger in darker areas
      var tc = tintRGB[tintI] || tintRGB[0];
      r = Math.min(255, r + Math.floor(tc[0] * tintS * inv));
      g = Math.min(255, g + Math.floor(tc[1] * tintS * inv));
      b = Math.max(0,   b - Math.floor(Math.max(0, 10 - tc[2]) * tintS * inv));
    }

    var fr = fogColor ? fogColor.r : 0;
    var fg = fogColor ? fogColor.g : 0;
    var fb = fogColor ? fogColor.b : 0;

    r = Math.floor(r * (1 - fogFactor) + fr * fogFactor);
    g = Math.floor(g * (1 - fogFactor) + fg * fogFactor);
    b = Math.floor(b * (1 - fogFactor) + fb * fogFactor);

    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ── Pointer ray query (PW-3 squeegee aim) ─────────────────────────
  //
  // Casts a single ray from the player's eye through a screen-space
  // pixel and returns the wall hit info: tile coordinates, UV on the
  // face, perpendicular distance, and which subcell the pointer is
  // aimed at for the grime grid. Used by SpraySystem to map Magic
  // Remote / mouse cursor position to a specific grime subcell.
  //
  // Returns null if the ray doesn't hit an opaque/door tile within
  // render distance, or if required globals aren't available.

  /**
   * @param {number} screenX — pixel column on canvas (0..width-1)
   * @param {number} screenY — pixel row on canvas (0..height-1)
   * @param {Array[]} grid — 2D tile grid
   * @param {number} gridW
   * @param {number} gridH
   * @returns {Object|null} { tileX, tileY, wallU, wallV, perpDist, side,
   *                          subX, subY, grimeRes }  or null
   */
  function castScreenRay(screenX, screenY, grid, gridW, gridH) {
    if (!_canvas || !grid) return null;
    var w = _width;
    var h = _height;
    if (w < 1 || h < 1) return null;

    // Incoming pointer coords are in main-canvas (CSS) pixel space,
    // but raycasting happens in the offscreen viewport at w × h. Map
    // the cursor from CSS space → offscreen space so the cameraX /
    // screenY math below stays in the casting coordinate system.
    if (_canvas.width > 0 && _canvas.height > 0) {
      screenX = screenX * (w / _canvas.width);
      screenY = screenY * (h / _canvas.height);
    }

    // Reconstruct player eye state (same sources as render())
    var MC = (typeof MovementController !== 'undefined') ? MovementController : null;
    if (!MC || typeof Player === 'undefined') return null;
    var rp = MC.getRenderPos();
    var ps = Player.state();
    var pDir = rp.angle + (ps.lookOffset || 0);
    var px = rp.x + 0.5;
    var py = rp.y + 0.5;
    var pitch = ps.lookPitch || 0;

    var fov = Math.PI / 3;
    var halfFov = fov / 2;
    var rawHalfH = h / 2;
    var pitchShift = pitch * rawHalfH;
    var halfH = Math.max(20, Math.min(h - 20, rawHalfH - pitchShift));
    // Match the boosted render distance used by render() so cursor
    // picks on far-off walls succeed at the same distance the wall
    // is actually visible at.
    var _baseRenderDist = _contract ? _contract.renderDistance : 16;
    var _csBoost = (RENDER_SCALE > 0.01) ? Math.max(1.0, 1.0 / RENDER_SCALE) : 1.0;
    var renderDist = Math.min(80, _baseRenderDist * _csBoost);
    var baseWallH = _contract ? _contract.wallHeight : 1.0;

    // ── Horizontal: screen column → ray angle ──
    var cameraX = (2 * screenX / w) - 1;
    var rayAngle = pDir + Math.atan(cameraX * Math.tan(halfFov));
    var rayDirX = Math.cos(rayAngle);
    var rayDirY = Math.sin(rayAngle);

    // ── DDA setup (identical to render loop) ──
    var mapX = Math.floor(px);
    var mapY = Math.floor(py);
    var deltaDistX = Math.abs(1 / (rayDirX || 1e-10));
    var deltaDistY = Math.abs(1 / (rayDirY || 1e-10));
    var stepX, stepY, sideDistX, sideDistY;

    if (rayDirX < 0) { stepX = -1; sideDistX = (px - mapX) * deltaDistX; }
    else              { stepX = 1;  sideDistX = (mapX + 1 - px) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (py - mapY) * deltaDistY; }
    else              { stepY = 1;  sideDistY = (mapY + 1 - py) * deltaDistY; }

    // ── DDA traversal ──
    var hit = false;
    var side = 0;
    var hitTile = 0;
    var depth = 0;

    while (!hit && depth < renderDist) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX; mapX += stepX; side = 0;
      } else {
        sideDistY += deltaDistY; mapY += stepY; side = 1;
      }
      depth++;
      if (mapX < 0 || mapX >= gridW || mapY < 0 || mapY >= gridH) break;
      var tile = grid[mapY][mapX];
      if (typeof TILES !== 'undefined' && (TILES.isOpaque(tile) || TILES.isDoor(tile))) {
        hit = true;
        hitTile = tile;
      }
    }

    if (!hit) return null;

    // ── Perpendicular distance ──
    var perpDist;
    if (side === 0) {
      perpDist = (mapX - px + (1 - stepX) / 2) / (rayDirX || 1e-10);
    } else {
      perpDist = (mapY - py + (1 - stepY) / 2) / (rayDirY || 1e-10);
    }
    perpDist = Math.abs(perpDist);
    if (perpDist < 0.2) perpDist = 0.2;

    // ── Wall U coordinate (horizontal position on face, 0..1) ──
    var wallU;
    if (side === 0) {
      wallU = py + perpDist * rayDirY;
    } else {
      wallU = px + perpDist * rayDirX;
    }
    wallU = wallU - Math.floor(wallU);
    if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
      wallU = 1 - wallU;
    }

    // ── Wall V coordinate (vertical position on face, 0..1) ──
    // Derived from screenY: invert the projection formula
    //   drawStart = halfH - lineHeight/2 + vertShift
    //   screenY maps linearly within [drawStart..drawEnd] to V [0..1]
    var wallHeightMult = baseWallH;
    if (_contract && typeof SpatialContract !== 'undefined') {
      wallHeightMult = SpatialContract.getWallHeight(_contract, mapX, mapY, _rooms, hitTile, _cellHeights);
    }
    var lineHeight = Math.max(2, Math.floor((h * wallHeightMult) / perpDist));
    var heightOffset = (_contract && typeof SpatialContract !== 'undefined')
      ? SpatialContract.getTileHeightOffset(_contract, hitTile) : 0;
    var vertShift = Math.floor((h * heightOffset) / perpDist);
    var baseLineH = Math.floor((h * baseWallH) / perpDist);
    var flatBottom = Math.floor(halfH + baseLineH / 2);
    var flatTop = flatBottom - lineHeight;
    var drawStart = flatTop - vertShift;
    var drawEnd = flatBottom - vertShift;

    // V = fraction of wall column from top (0) to bottom (1)
    var wallV = (screenY - drawStart) / (drawEnd - drawStart);
    wallV = Math.max(0, Math.min(1, wallV));

    // Map UV to grime grid subcell
    var grimeRes = 0;
    var subX = 0;
    var subY = 0;
    if (typeof GrimeGrid !== 'undefined') {
      var gGrid = GrimeGrid.get(
        (typeof FloorManager !== 'undefined' ? FloorManager.getCurrentFloorId() : ''),
        mapX, mapY
      );
      if (gGrid) {
        grimeRes = gGrid.res;
        subX = Math.min(grimeRes - 1, Math.floor(wallU * grimeRes));
        subY = Math.min(grimeRes - 1, Math.floor(wallV * grimeRes));
      }
    }

    return {
      tileX: mapX,
      tileY: mapY,
      wallU: wallU,
      wallV: wallV,
      perpDist: perpDist,
      side: side,
      subX: subX,
      subY: subY,
      grimeRes: grimeRes
    };
  }

  return {
    init: init,
    render: render,
    setBiomeColors: setBiomeColors,
    setContract: setContract,
    setBloodFloorId: function (id) { _bloodFloorId = id; },
    castScreenRay: castScreenRay,
    setRenderScale: setRenderScale,
    getRenderScale: getRenderScale,
    setFreeformEnabled: function (enabled) { _freeformEnabled = !!enabled; },
    isFreeformEnabled: function () { return _freeformEnabled; },
    registerFreeformGapFiller: registerFreeformGapFiller
  };
})();

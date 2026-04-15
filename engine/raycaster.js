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

  // ── Extracted helpers (see docs/RAYCASTER_EXTRACTION_ROADMAP.md) ──
  // Fog / tint / glow helpers live in RaycasterLighting. Aliased here
  // so existing call sites (e.g. _applyFogAndBrightness(...)) continue
  // to resolve to single-identifier lookups at runtime.
  var _applyFogAndBrightness = RaycasterLighting.applyFogAndBrightness;
  var _tintedDark            = RaycasterLighting.tintedDark;
  var _parseGlowRGB          = RaycasterLighting.parseGlowRGB;

  // Freeform gap-filler registry + alpha-range cache live in
  // RaycasterTextures (EX-2). `_gapFillers` is the shared registry
  // object — aliasing it here means Layer 3 registrations via
  // Raycaster.registerFreeformGapFiller still land in the same object
  // the hot loop reads from.
  var _gapFillers           = RaycasterTextures.getRegistry();
  var _computeAlphaRange    = RaycasterTextures.computeAlphaRange;
  var _clearAlphaRangeCache = RaycasterTextures.clearAlphaRangeCache;

  // Floor / parallax / weather-veil renderers live in RaycasterFloor
  // (EX-4). Aliased here so existing call sites (_renderFloor(...),
  // _renderParallax(...), _renderWeatherVeil(...)) continue to resolve
  // to single-identifier lookups.
  var _renderFloor        = RaycasterFloor.renderFloor;
  var _renderParallax     = RaycasterFloor.renderParallax;
  var _renderWeatherVeil  = RaycasterFloor.renderWeatherVeil;

  // Wall column drawing lives in RaycasterWalls (EX-5). Aliased so hot
  // call sites inside the DDA wall phase (~960× / frame) resolve via
  // a single local identifier.
  var _drawTiledColumn      = RaycasterWalls.drawTiledColumn;
  var _drawTiledColumnPixel = RaycasterWalls.drawTiledColumnPixel;
  var _hitFace              = RaycasterWalls.hitFace;
  var _crenelFaceVisible    = RaycasterWalls.crenelFaceVisible;

  // Sprite / wall-decor / particle rendering lives in RaycasterSprites
  // (EX-6). Only the three public entry points are aliased — the stack /
  // corpse-pile / sub-layer / hue helpers are module-private and called
  // only from within renderSprites.
  var _renderSprites            = RaycasterSprites.renderSprites;
  var _renderWallDecor          = RaycasterSprites.renderWallDecor;
  var _updateAndRenderParticles = RaycasterSprites.updateAndRenderParticles;

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
  var _lastHalfH = 0;      // horizon line from last render (pitch-shifted)
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
  // NOTE: the old _MAX_BG_STEPS step-count budget was removed in favor
  // of a perpendicular-distance cap (renderDist) + a local safety step
  // cap (_MAX_BG_SAFETY inside the loop). DDA steps are a bad proxy
  // for perpDist on diagonal rays — off-axis rays burn steps on cross
  // crossings and undershoot the visual horizon, producing "gate
  // vanishes behind pergola canopy" artifacts on exterior floors.
  // Stashed grid reference — set at the top of render() so helpers
  // like _renderFreeformForeground can read the current floor grid
  // without threading the parameter through every call.
  var _renderGrid = null;
  var _renderGridW = 0;
  var _renderGridH = 0;

  // ── ROOF_CRENEL face-aware visibility ────────────────────────────
  // ROOF_CRENEL should only render on faces whose axis is aligned with
  // an adjacent building WALL tile. Perpendicular faces (along the wall
  // run) are transparent so the crenel reads as a roofline cap, not a
  // pergola-style floating slab visible from all angles.
  //
  // The check has two tiers:
  //   1. Direct: does this tile have a WALL neighbor on the hit axis?
  //   2. Corner: no direct WALL at all, but CRENEL neighbors exist on
  //      both perpendicular axes → L-bend corner piece that should
  //      render on all faces to wrap the rampart roofline.
  //
  // Called from the DDA front-hit loop and the N-layer back-collection
  // loop. Uses _renderGrid / _renderGridW / _renderGridH stashed at
  // the top of render().
  // _crenelFaceVisible moved to engine/raycaster-walls.js (EX-5)

  var _layerBuf = [
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0, isCircle: false, hx: 0, hy: 0, cx: 0, cy: 0 },
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

  // _gapFillers registry, registerFreeformGapFiller, alpha-range
  // cache moved to engine/raycaster-textures.js (EX-2). Aliases for
  // _gapFillers / _computeAlphaRange / _clearAlphaRangeCache are
  // defined at IIFE top.

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
    RaycasterFloor.resetBuffer();
    RaycasterWalls.resetBuffer();
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
    _clearAlphaRangeCache();
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
    // ── Per-frame perf probe handle (P1 CPU attribution) ──────────────
    // DebugPerfMonitor loads at Layer 5, after this IIFE parses, so we
    // can't cache it at module init. Look up once per frame; when the
    // monitor is absent or idle, begin/end short-circuit on _running.
    // Cost in release: 1 property lookup + 1 truthy check per frame.
    var _dpm = (typeof DebugPerfMonitor !== 'undefined')
      ? DebugPerfMonitor.probe : null;

    _renderGrid = grid;  // stash for helpers (_renderFreeformForeground etc.)
    _renderGridW = gridW;
    _renderGridH = gridH;
    var ctx = _ctx;
    var w = _width;
    var h = _height;
    // Horizon line — shifted by lookPitch for vertical free look.
    // Positive pitch = look down (horizon moves up, more floor visible).
    // Negative pitch = look up (horizon moves down, more ceiling/sky).
    var rawHalfH = h / 2;
    var pitchShift = (player.pitch || 0) * rawHalfH;
    var halfH = Math.max(20, Math.min(h - 20, rawHalfH - pitchShift));
    _lastHalfH = halfH;  // expose for projectWorldToScreen
    var fov = Math.PI / 3;
    var halfFov = fov / 2;

    // Read contract (fall back to defaults if none set)
    var baseRenderDist = _contract ? _contract.renderDistance : 16;
    var baseFogDist    = _contract ? _contract.fogDistance : 12;
    var fogColor       = _contract ? _contract.fogColor : { r: 0, g: 0, b: 0 };
    var baseWallH      = _contract ? _contract.wallHeight : 1.0;

    // ── Player elevation (multi-elevation rendering arc) ──
    // Sampled here — early, before the floor + wall passes — so both
    // can apply the same eye-height correction. See the "Player
    // elevation" note later in this function and the arc roadmap
    // (docs/MULTI_ELEVATION_RENDERING.md).
    var _playerElev = 0;
    if (_contract) {
      var _peGX = player.x | 0;
      var _peGY = player.y | 0;
      if (_peGX >= 0 && _peGX < gridW && _peGY >= 0 && _peGY < gridH) {
        var _peTile = grid[_peGY][_peGX];
        var _peOff = SpatialContract.getTileHeightOffset(_contract, _peTile);
        if (_peOff) _playerElev = _peOff;
      }
    }

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

    if (_dpm) _dpm.begin('Raycaster.skybox');
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
    if (_dpm) _dpm.end('Raycaster.skybox');

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

    if (_dpm) _dpm.begin('Raycaster.floorCast');
    if (floorTex) {
      _renderFloor(ctx, w, h, halfH, player, fov, baseWallH, floorTex,
                   fogDist, fogColor, grid, gridW, gridH, tileFloorTexArr,
                   _playerElev);
    } else {
      var floorGrads = _contract ? SpatialContract.getGradients(_contract)
        : { floorTop: '#444', floorBottom: '#111' };
      var fGrad = ctx.createLinearGradient(0, halfH, 0, h);
      fGrad.addColorStop(0, floorGrads.floorTop);
      fGrad.addColorStop(1, floorGrads.floorBottom);
      ctx.fillStyle = fGrad;
      ctx.fillRect(0, halfH, w, h - halfH);
    }
    if (_dpm) _dpm.end('Raycaster.floorCast');

    // ── Parallax layers (behind walls, above floor gradient) ──
    if (_dpm) _dpm.begin('Raycaster.parallax');
    if (_contract) {
      var parallax = SpatialContract.getParallax(_contract);
      if (parallax) {
        _renderParallax(ctx, w, h, halfH, parallax, player.dir);
      }
    }
    if (_dpm) _dpm.end('Raycaster.parallax');

    // ── Cast rays ──
    var px = player.x + 0.5;
    var py = player.y + 0.5;
    var pDir = player.dir;

    // _playerElev computed above (right after baseWallH) so the floor
    // pass + wall pass see the same value. See the multi-elevation
    // rendering arc doc for why this shifts world-Y=0 DOWN on screen.

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
    // Denser sampling (w/24) so columns near the horizon center are
    // captured — the ~15-col gap around center-of-view is where most
    // "why is this tile culled?" investigations actually happen.
    var _dbgSampleStep = Math.max(1, Math.floor(w / 24));
    var _dbgCenterCol = w >> 1;

    // ── Round-tile support ──────────────────────────────────────────
    // Pre-compute the player's forward-vector cosines so circle-tile
    // hits can convert Euclidean ray-parameter t into camera-plane
    // perpDist without re-calling Math.cos/sin per column. Circle
    // tiles (e.g. TREE) use an inscribed-circle hit test instead of
    // the tile's axis-aligned bounds; see the DDA hit branch below.
    var _pdCos = Math.cos(pDir);
    var _pdSin = Math.sin(pDir);
    // Inscribed-circle radius for 'circle' shape tiles. Slightly under
    // 0.5 leaves a visible corner gap between adjacent round tiles so
    // the player can peek between trunks — the whole point of doing
    // this. If you need them to visibly touch, raise toward 0.5.
    var _CIRCLE_R = 0.45;
    // 'circle4' shape: 2×2 cluster of small pillars inside one tile.
    // Sub-centers at (±_CIRCLE4_OFF, ±_CIRCLE4_OFF) from tile centre,
    // each of radius _CIRCLE4_R. The 0.2/0.25 pair leaves a ~0.1 gap
    // between adjacent sub-pillars (visible diagonal slits through the
    // cluster) and ~0.05 gap to the cell edge (hidden behind neighbours).
    var _CIRCLE4_R = 0.2;
    var _CIRCLE4_OFF = 0.25;

    // Wall phase encompasses DDA, column draw, freeform foreground,
    // back-layer collection, and floating-lid rendering — they're
    // interleaved inside the per-column loop so they can't be split
    // without Phase 4's hotpath extraction. Gated as one coarse span.
    if (_dpm) _dpm.begin('Raycaster.wallPhase');
    if (_dpm) _dpm.count('Raycaster.wallPhase.columns', w);
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

      // Round-tile hit state: populated when the DDA accepts a circle
      // intersection instead of an axis-aligned tile boundary. The
      // perpDist + wallX + side overrides fire after the DDA loop.
      var _circleHit = false;
      var _circleHX = 0, _circleHY = 0, _circleCX = 0, _circleCY = 0;

      // Diagonal-wall hit state: populated when the DDA accepts a
      // WALL_DIAG_0..3 ray-segment intersection. `_diagOffsetLeft` is
      // the normalised position along the segment (0 at endpoint A,
      // 1 at endpoint B) — used as texture U coordinate downstream.
      // The perpDist + wallX + side overrides fire after the DDA loop,
      // mirroring the circle-hit path.
      var _diagHit = false;
      var _diagHX = 0, _diagHY = 0;
      var _diagNX = 0, _diagNY = 0; // segment normal (for side derivation)
      var _diagOffsetLeft = 0;

      // Perpendicular-distance budget: same fix as the back-layer
      // loop. `depth` alone is a DDA step count that under-shoots
      // perpDist on diagonal rays by ~sqrt(2), so walls on 45° rays
      // would disappear ~34 cells out while sprites (which test
      // Euclidean dist directly) render all the way to renderDist.
      // That asymmetry made NPCs visible past their tile backdrop.
      // We now gate on min(sideDistX, sideDistY) — the perpDist at
      // the next crossing — against renderDist, and keep a generous
      // step cap as a safety rail.
      var _SAFETY_FRONT = 128;
      while (!hit && depth < _SAFETY_FRONT) {
        var _frontNextPD = (sideDistX < sideDistY) ? sideDistX : sideDistY;
        if (_frontNextPD >= renderDist) break;
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
            // ROOF_CRENEL face filter: only register the hit when the
            // ray's hit axis is aligned with an adjacent building wall.
            // Perpendicular faces are transparent — the ray passes through
            // so the crenel reads as a roofline, not a pergola.
            if (tile === TILES.ROOF_CRENEL && !_crenelFaceVisible(mapX, mapY, side)) {
              // Skip — let DDA continue through this cell
            } else {
              // Round-tile hit test: if this tile has a 'circle' shape,
              // ray must intersect the inscribed circle to count as a
              // hit. Misses let the DDA walk past the tile (so you can
              // see between trunks through the corner gaps). On hit,
              // stash the intersection point so we can override
              // perpDist/wallX/side after the loop.
              var _shape = (_contract && SpatialContract.getTileShape)
                ? SpatialContract.getTileShape(_contract, tile) : null;
              if (_shape === 'circle' || _shape === 'circle4') {
                // Single-circle vs 2×2 cluster. For 'circle4' we solve
                // four sub-circles and keep the nearest hit; for 'circle'
                // we solve one inscribed circle at tile centre. Shared
                // math below; the loop count + sub-centre layout is the
                // only difference.
                var _isQuad = (_shape === 'circle4');
                var _nSubs  = _isQuad ? 4 : 1;
                var _subR   = _isQuad ? _CIRCLE4_R : _CIRCLE_R;
                var _bestT  = Infinity;
                var _bestHX = 0, _bestHY = 0, _bestCX = 0, _bestCY = 0;
                for (var _si = 0; _si < _nSubs; _si++) {
                  var _cX, _cY;
                  if (_isQuad) {
                    _cX = mapX + ((_si & 1) ? (0.5 + _CIRCLE4_OFF) : (0.5 - _CIRCLE4_OFF));
                    _cY = mapY + ((_si & 2) ? (0.5 + _CIRCLE4_OFF) : (0.5 - _CIRCLE4_OFF));
                  } else {
                    _cX = mapX + 0.5;
                    _cY = mapY + 0.5;
                  }
                  var _bX = px - _cX;
                  var _bY = py - _cY;
                  var _B = _bX * rayDirX + _bY * rayDirY;
                  var _C = _bX * _bX + _bY * _bY - _subR * _subR;
                  var _disc = _B * _B - _C;
                  if (_disc < 0) continue;
                  var _t = -_B - Math.sqrt(_disc);
                  if (_t <= 0 || _t >= _bestT) continue;
                  var _hX = px + _t * rayDirX;
                  var _hY = py + _t * rayDirY;
                  // Clamp acceptance to this tile's footprint — the
                  // ray may graze a neighbouring circle on its way
                  // through, but the DDA will visit that neighbour
                  // on its own step. Treat out-of-tile hits as a
                  // miss here so cells can't steal each other's
                  // contributions.
                  if (Math.floor(_hX) !== mapX || Math.floor(_hY) !== mapY) continue;
                  _bestT  = _t;
                  _bestHX = _hX; _bestHY = _hY;
                  _bestCX = _cX; _bestCY = _cY;
                }
                if (_bestT !== Infinity) {
                  hit = true; hitTile = tile;
                  _circleHit = true;
                  _circleHX = _bestHX; _circleHY = _bestHY;
                  _circleCX = _bestCX; _circleCY = _bestCY;
                }
                // else: miss — DDA continues
              } else if (TILES.isWallDiag && TILES.isWallDiag(tile)) {
                // WALL_DIAG_0..3 ray-segment intersection.
                // Ported from raycast.js-master. The DDA has landed on
                // a diagonal wall tile; the actual geometry is a single
                // line segment spanning two corners of the unit cell.
                // We solve the ray vs segment crossing; miss means the
                // ray passes through the open half of the cell and the
                // DDA continues.
                var _dOff = TILES.OFFSET_DIAG_WALLS[TILES.diagFaceIndex(tile)];
                var _dAx = mapX + _dOff[0][0];
                var _dAy = mapY + _dOff[0][1];
                var _dBx = mapX + _dOff[1][0];
                var _dBy = mapY + _dOff[1][1];
                var _dSx = _dBx - _dAx;
                var _dSy = _dBy - _dAy;
                // det = Dy*Sx - Dx*Sy (2D cross product of ray dir and segment dir).
                var _dDet = rayDirY * _dSx - rayDirX * _dSy;
                if (_dDet !== 0) {
                  var _dT = ((_dAy - py) * _dSx - (_dAx - px) * _dSy) / _dDet;
                  var _dS = (rayDirY * (_dAx - px) - rayDirX * (_dAy - py)) / _dDet;
                  if (_dT > 0 && _dS >= 0 && _dS <= 1) {
                    hit = true; hitTile = tile;
                    _diagHit = true;
                    _diagHX = px + _dT * rayDirX;
                    _diagHY = py + _dT * rayDirY;
                    _diagOffsetLeft = _dS;
                    // Segment normal (perpendicular to (Sx, Sy) in 2D).
                    // We pick whichever of the two possible normals
                    // points back toward the player — that face is the
                    // one the ray is hitting.
                    var _dNx = _dSy;
                    var _dNy = -_dSx;
                    if (_dNx * rayDirX + _dNy * rayDirY > 0) {
                      _dNx = -_dNx; _dNy = -_dNy;
                    }
                    _diagNX = _dNx; _diagNY = _dNy;
                  }
                }
                // else: ray parallel to segment, or missed — DDA continues
              } else {
                hit = true; hitTile = tile;
              }
            }
          } else if (TILES.isDoor(tile)) {
            hit = true; hitTile = tile;
          } else if (TILES.isStep && TILES.isStep(tile)) {
            // Walkable raised-step tiles (STOOP, DECK). Not opaque, not
            // a door — the DDA would normally skip them, leaving only
            // the floor-texture override visible. Treat as a ray hit so
            // drawWallSlice runs with the contract's short wallHeight
            // (0.08×) + positive heightOffset (+0.10), producing the
            // thin lip silhouette that reads as a raised platform.
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
        _layerBuf[0].isCircle = _circleHit;
        if (_circleHit) {
          _layerBuf[0].hx = _circleHX;
          _layerBuf[0].hy = _circleHY;
          _layerBuf[0].cx = _circleCX;
          _layerBuf[0].cy = _circleCY;
        }
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
          //
          // EXCEPTION: every WINDOW_* variant (TAVERN, SHOP, BAY,
          // SLIT) — the window is a thin glass pane on the building
          // facade. No back face: the cavity is fully see-through
          // and the lintel/sill bands should not render on the
          // interior side (that would make the wall look hollow
          // when viewed up close, and paint solid masonry over the
          // back-layer skybox so the gap reads as an opaque black
          // stripe instead of glass). The N-layer collector still
          // gathers walls BEHIND the window tile because
          // _fgIsFreeformSeeThrough sets _maxTop = 0.
          (_fgIsFreeformSeeThrough &&
           !(TILES.isWindow && TILES.isWindow(hitTile)) &&
           hitTile !== TILES.DOOR_FACADE)
        );

        // Continue DDA to collect up to MAX_LAYERS total hits.
        //
        // Termination is bounded by FOUR independent conditions:
        //   1. _lc < _MAX_LAYERS — layer-buffer capacity
        //   2. _nextPD < renderDist — the next cell boundary crossing
        //      must be within the render distance. This uses the
        //      raycaster's native perpendicular-distance unit, not
        //      DDA step count. Crucial fix: on diagonal rays, each
        //      step advances perpDist by only ~0.5–1.0, so a 24-step
        //      budget translates to only ~12 cells of perpDist on a
        //      45° ray — not enough to reach opposite-side walls in a
        //      48-cell-deep exterior view. Using perpDist directly
        //      makes the budget angle-independent.
        //   3. _safety < _MAX_BG_SAFETY — hard upper bound preventing
        //      runaway loops on near-axis rays where deltaDist on the
        //      cross axis is enormous.
        //   4. Grid-edge break below — prevents infinite walk off the map
        //
        // NOTE: The old step-count budget _MAX_BG_STEPS=24 was exactly
        // the X-distance from a mid-promenade first-hit (e.g. pergola
        // at 24,17) to the far gate at (48,17). Any ray with slight Y
        // drift burned a step on Y crossings and could not reach x=48
        // within the 24-step budget, so gate tiles disappeared behind
        // pergola canopies. Cols 264/312/336/360/384 all exited with
        // _lc=2 exit=budget and ZERO rejection entries — proving the
        // ray walked 23 steps through empty cells without ever
        // encountering opaque geometry.
        var _cSdX = sideDistX, _cSdY = sideDistY;
        var _cMX = mapX, _cMY = mapY, _cSd = 0;
        var _cDep = depth;
        var _safety = 0;
        var _MAX_BG_SAFETY = 64;
        // Debug: collect opaque cells that were VISITED during the back
        // loop but were REJECTED (by the _cTop > _maxTop gate or any
        // other filter). A gate wall that never shows up in _layerBuf
        // is either "never reached" or "reached but rejected" — without
        // this log those two cases are indistinguishable.
        var _dbgRej = _dbgFrame ? [] : null;
        // Exit reason so the trace can print WHY layer collection
        // stopped growing. One of: 'cap' (hit _MAX_LAYERS), 'dist'
        // (crossed renderDist), 'safety' (hit _MAX_BG_SAFETY),
        // 'oob' (walked off the grid), 'tall' (_maxTop hit 3.0 early
        // break).
        var _dbgExit = null;
        while (_lc < _MAX_LAYERS && _safety < _MAX_BG_SAFETY) {
          // Perpendicular distance at the next cell boundary. If this
          // already exceeds renderDist, the cell we'd step into is
          // past the visible horizon — stop here.
          var _nextPD = (_cSdX < _cSdY) ? _cSdX : _cSdY;
          if (_nextPD >= renderDist) {
            if (_dbgFrame) _dbgExit = 'dist';
            break;
          }
          if (_cSdX < _cSdY) {
            _cSdX += deltaDistX; _cMX += stepX; _cSd = 0;
          } else {
            _cSdY += deltaDistY; _cMY += stepY; _cSd = 1;
          }
          _cDep++;
          _safety++;

          if (_cMX < 0 || _cMX >= gridW || _cMY < 0 || _cMY >= gridH) {
            if (_dbgFrame) _dbgExit = 'oob';
            break;
          }

          // Read the next cell's tile once — used by both the back-face
          // dedup gate below and the regular layer-collection check.
          var _cT = grid[_cMY][_cMX];
          // ROOF_CRENEL face filter (same as front-hit loop): treat the
          // crenel as non-solid when the ray's hit axis has no adjacent
          // building wall. Prevents pergola-like back-layer rendering on
          // perpendicular faces of the rampart.
          var _cTSolid = (TILES.isOpaque(_cT) || TILES.isDoor(_cT));
          if (_cTSolid && _cT === TILES.ROOF_CRENEL &&
              !_crenelFaceVisible(_cMX, _cMY, _cSd)) {
            _cTSolid = false;
          }
          // Round-tile back-layer hit test. Same contract as the
          // front-hit DDA: circle tiles occlude only where the ray
          // actually intersects the inscribed circle; corner gaps
          // are see-through. Without this, a tree trunk behind a
          // shrub (or below a canopy ring) would render as a square
          // back layer because _renderBackLayer assumes axis-aligned
          // bounds for perpDist / wallX. We stash the circle hit
          // here and flag the layer entry so the renderer picks the
          // circle path.
          var _cbCircleHit = false;
          var _cbHX = 0, _cbHY = 0, _cbCX = 0, _cbCY = 0;
          if (_cTSolid) {
            var _cbShape = (_contract && SpatialContract.getTileShape)
              ? SpatialContract.getTileShape(_contract, _cT) : null;
            if (_cbShape === 'circle' || _cbShape === 'circle4') {
              // Same single-vs-quad dispatch as the front-hit path.
              var _cbIsQuad = (_cbShape === 'circle4');
              var _cbNSubs  = _cbIsQuad ? 4 : 1;
              var _cbSubR   = _cbIsQuad ? _CIRCLE4_R : _CIRCLE_R;
              var _cbBestT  = Infinity;
              var _cbAccept = false;
              for (var _cbSi = 0; _cbSi < _cbNSubs; _cbSi++) {
                var _cbCx, _cbCy;
                if (_cbIsQuad) {
                  _cbCx = _cMX + ((_cbSi & 1) ? (0.5 + _CIRCLE4_OFF) : (0.5 - _CIRCLE4_OFF));
                  _cbCy = _cMY + ((_cbSi & 2) ? (0.5 + _CIRCLE4_OFF) : (0.5 - _CIRCLE4_OFF));
                } else {
                  _cbCx = _cMX + 0.5;
                  _cbCy = _cMY + 0.5;
                }
                var _cbBx = px - _cbCx;
                var _cbBy = py - _cbCy;
                var _cbB  = _cbBx * rayDirX + _cbBy * rayDirY;
                var _cbC  = _cbBx * _cbBx + _cbBy * _cbBy - _cbSubR * _cbSubR;
                var _cbDisc = _cbB * _cbB - _cbC;
                if (_cbDisc < 0) continue;
                var _cbT = -_cbB - Math.sqrt(_cbDisc);
                if (_cbT <= 0 || _cbT >= _cbBestT) continue;
                var _cbX = px + _cbT * rayDirX;
                var _cbY = py + _cbT * rayDirY;
                if (Math.floor(_cbX) !== _cMX || Math.floor(_cbY) !== _cMY) continue;
                _cbBestT = _cbT;
                _cbAccept = true;
                _cbCircleHit = true;
                _cbHX = _cbX; _cbHY = _cbY;
                _cbCX = _cbCx; _cbCY = _cbCy;
              }
              // Miss — treat as non-solid so the back-layer collector
              // walks past the cell and keeps looking for farther
              // geometry through the corner gap.
              if (!_cbAccept) _cTSolid = false;
            }
          }

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
              // Back-face injections are always square silhouettes —
              // the mirrored face of the foreground tile. Circle tiles
              // don't inject a back face (they're not in _needBackFace
              // list), so the flag below is defensively cleared.
              _layerBuf[_lc].isCircle = false;
              _lc++;
            }
            _needBackFace = false;
          }
          if (_cTSolid) {
            // Skip door tiles from back-layer collection ONLY when the
            // foreground hit is a window tile. Doors behind windows
            // bleed their texture through the transparent cavity onto
            // the building facade. But doors behind short tiles (e.g.
            // MAILBOX) must collect normally — they're the building
            // entrance visible above the short obstacle.
            if (TILES.isDoor(_cT) && TILES.isWindow && TILES.isWindow(hitTile)) {
              _safety++;
              continue;
            }
            var _cH = SpatialContract.getWallHeight(_contract, _cMX, _cMY, _rooms, _cT, _cellHeights);
            var _cOff = SpatialContract.getTileHeightOffset(_contract, _cT) || 0;
            var _cTop = _cH / 2 + _cOff;
            // Record if this tile's top edge rises above the current
            // stack's top — that's the only way it adds visible pixels
            // we haven't already covered. Shorter/lower or equal top
            // tiles are fully occluded by the foreground silhouette.
            //
            // MULTI-ELEVATION ARC: when the player themselves stands on
            // a raised lip tile (STOOP/DECK), a second same-height lip
            // tile behind the foreground IS visible — its cap plane sits
            // at the player's eye-relative elevation, not below it. We
            // relax the strict > to a ≥ for low-lip tiles (offset below
            // half a wall) so two same-height lips in a row both
            // register. Full-height solid walls still use strict > so
            // we don't double-paint identical back walls.
            var _cIsLowLip = (_cOff > 0 && _cOff < 0.5 && _cH < 0.25);
            var _elevAccept = _cIsLowLip && _playerElev > 0 && _cTop >= _maxTop;
            if (_cTop > _maxTop || _elevAccept) {
              _layerBuf[_lc].mx = _cMX;
              _layerBuf[_lc].my = _cMY;
              // For circle hits, derive sd from hit-point normal so
              // shading/tinting picks the same E/W vs N/S branch as
              // the foreground circle path. Square hits keep the
              // DDA's _cSd (which axis we stepped through).
              if (_cbCircleHit) {
                var _cbNdX = _cbHX - _cbCX;
                var _cbNdY = _cbHY - _cbCY;
                _layerBuf[_lc].sd = (Math.abs(_cbNdX) > Math.abs(_cbNdY)) ? 0 : 1;
              } else {
                _layerBuf[_lc].sd = _cSd;
              }
              _layerBuf[_lc].tile = _cT;
              _layerBuf[_lc].isCircle = _cbCircleHit;
              if (_cbCircleHit) {
                _layerBuf[_lc].hx = _cbHX;
                _layerBuf[_lc].hy = _cbHY;
                _layerBuf[_lc].cx = _cbCX;
                _layerBuf[_lc].cy = _cbCY;
              }
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
                if (_cTop >= 3.0) {
                  if (_dbgFrame) _dbgExit = 'tall';
                  break;
                }
              }
            } else if (_dbgRej) {
              // Opaque cell visited but rejected because its top edge
              // didn't rise above the current stack's ceiling. Record
              // so the debug trace can explain "why isn't this tile
              // showing up behind the pergola?"
              _dbgRej.push({
                mx: _cMX, my: _cMY, tile: _cT,
                wh: _cH, off: _cOff, top: _cTop,
                maxTop: _maxTop, step: _cDep - depth
              });
            }
            // Same or lower top edge: skip, keep searching
          }
        }
        if (_dbgFrame && _dbgExit === null) {
          if (_lc >= _MAX_LAYERS) _dbgExit = 'cap';
          else if (_safety >= _MAX_BG_SAFETY) _dbgExit = 'safety';
        }
      }

      // ── Debug trace: dump sampled columns' layer buffers ──────
      if (_dbgFrame && (col === _dbgCenterCol || (col % _dbgSampleStep) === 0)) {
        try {
          var _dbgLines = '[RC-DBG] col=' + col +
            ' ray=(' + rayDirX.toFixed(3) + ',' + rayDirY.toFixed(3) + ')' +
            ' hit=' + hit + ' firstTile=' + hitTile +
            ' firstHit=(' + mapX + ',' + mapY + ')' +
            ' depth=' + depth + ' _lc=' + _lc +
            (typeof _dbgExit !== 'undefined' && _dbgExit ? ' exit=' + _dbgExit : '');
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
          // Rejected-cell log: opaque cells the back loop visited but
          // couldn't add (blocked by the _cTop > _maxTop gate). Critical
          // for "why isn't the gate showing?" — if (47,17) appears here
          // the gate IS reached, just culled; if it doesn't appear at
          // all the ray never walked to it within the step budget.
          if (typeof _dbgRej !== 'undefined' && _dbgRej && _dbgRej.length) {
            for (var _dRI = 0; _dRI < _dbgRej.length; _dRI++) {
              var _dR = _dbgRej[_dRI];
              _dbgLines += '\n  REJ tile=' + _dR.tile +
                ' @(' + _dR.mx + ',' + _dR.my + ')' +
                ' wh=' + _dR.wh + ' off=' + _dR.off +
                ' top=' + _dR.top.toFixed(2) +
                ' maxTop=' + _dR.maxTop.toFixed(2) +
                ' step=' + _dR.step;
            }
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
      if (_circleHit) {
        // Circle hit: perpDist is the hit point's projection onto the
        // player's forward axis (camera-plane-perpendicular). Using
        // player forward rather than the ray direction preserves the
        // raycaster's standard fisheye-free convention.
        perpDist = (_circleHX - px) * _pdCos + (_circleHY - py) * _pdSin;
        if (perpDist < 0) perpDist = 0;
        // Derive side from the hit-point normal (from centre → hit).
        // The horizontal/vertical dominance of the normal controls
        // which wall-shading branch (E/W vs N/S) the downstream code
        // picks, and which axis wallX texture-wraps around. For a
        // circle, an angle-based wrap reads better than square-face
        // shading, but we still need a valid side so the wall-height
        // and freeform paths find their bearings.
        var _ndX = _circleHX - _circleCX;
        var _ndY = _circleHY - _circleCY;
        side = (Math.abs(_ndX) > Math.abs(_ndY)) ? 0 : 1;
      } else if (_diagHit) {
        // Diagonal-wall hit: project hit point onto the player's forward
        // axis for a fisheye-free perpDist, then pick shading side based
        // on which axis the segment normal is more aligned with.
        perpDist = (_diagHX - px) * _pdCos + (_diagHY - py) * _pdSin;
        if (perpDist < 0) perpDist = 0;
        side = (Math.abs(_diagNX) > Math.abs(_diagNY)) ? 0 : 1;
      } else if (side === 0) {
        perpDist = (mapX - px + (1 - stepX) / 2) / (rayDirX || 1e-10);
      } else {
        perpDist = (mapY - py + (1 - stepY) / 2) / (rayDirY || 1e-10);
      }
      perpDist = Math.abs(perpDist);

      // ── DOOR_FACADE recess (Wolfenstein thin-wall offset) ─────────
      // After perpDist is calculated for the tile boundary, recessed
      // tiles advance the ray further into the tile so the door face
      // renders at a greater distance than the surrounding wall plane.
      // If the ray exits through a perpendicular tile boundary before
      // reaching the inset plane, that column is a solid jamb wall
      // (the visible sidewall of the recess). Jamb columns suppress
      // freeform rendering and write normal z-buffer occlusion.
      var _recessJamb = false;
      // Recess gate: check BOTH door and window exterior-face registries.
      // Door tiles use DoorSprites; window tiles use WindowSprites.
      // Torch tiles are omnidirectional — every face is a valid niche face,
      // so they recess on any hit (no exterior-face lookup needed).
      var _isExtHit = false;
      var _isOmniRecess = (hitTile === TILES.TORCH_LIT || hitTile === TILES.TORCH_UNLIT);
      if (TILES.isFreeform(hitTile) && !_isOmniRecess) {
        if (TILES.isWindow && TILES.isWindow(hitTile)) {
          _isExtHit = (typeof WindowSprites !== 'undefined' && WindowSprites.isExteriorHit &&
                       WindowSprites.isExteriorHit(mapX, mapY, side, stepX, stepY));
        } else {
          _isExtHit = (typeof DoorSprites !== 'undefined' && DoorSprites.isExteriorHit &&
                       DoorSprites.isExteriorHit(mapX, mapY, side, stepX, stepY));
        }
      }
      // ── Narrow-aperture preview (torch tiles only) ────────────────
      // Torches want a 1/5-tile-wide niche with flush masonry jambs on
      // either side — NOT a full-tile recess like DOOR_FACADE. Compute a
      // preview wallX at the tile-boundary perpDist; if it lands outside
      // the aperture range, short-circuit: leave perpDist at the tile
      // face (flush with adjacent walls) and mark _recessJamb so the
      // freeform filler is suppressed below — the column then renders
      // with the normal wall-texture path. Only aperture columns recess.
      var _torchFlushJamb = false;
      if (_isOmniRecess) {
        var _pwX;
        if (side === 0) _pwX = py + perpDist * rayDirY;
        else            _pwX = px + perpDist * rayDirX;
        _pwX = _pwX - Math.floor(_pwX);
        if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
          _pwX = 1 - _pwX;
        }
        // Aperture must match torch-niche.js _NICHE_L / _NICHE_R (0.40/0.60).
        if (_pwX < 0.40 || _pwX > 0.60) {
          _recessJamb = true;      // suppresses freeformCfg / solid z-buffer write
          _torchFlushJamb = true;  // skip the recess-advance block below
        }
      }
      if ((_isExtHit || _isOmniRecess) && !_torchFlushJamb) {
        // Per-tile recess depth from freeform config, or global default.
        var _rfCfg = (_contract) ? SpatialContract.getTileFreeform(_contract, hitTile) : null;
        var _recessD = (_rfCfg && _rfCfg.recessD) ? _rfCfg.recessD : 0.25;
        // Perpendicular distance to the inset plane
        var _rayComp = (side === 0) ? Math.abs(rayDirX) : Math.abs(rayDirY);
        var _rPD = perpDist + _recessD / (_rayComp || 1e-10);
        // Does the ray at _rPD still land inside this tile?
        var _rX = px + _rPD * rayDirX;
        var _rY = py + _rPD * rayDirY;
        // Negative recessD (bay window protrusion): the inset point
        // is OUTSIDE the tile (in the adjacent street tile). Accept
        // it as long as _rPD > minPerpDist (not behind the player).
        var _recessIsProtrusion = (_recessD < 0);
        if (_recessIsProtrusion ? (_rPD > 0.05) :
            (Math.floor(_rX) === mapX && Math.floor(_rY) === mapY)) {
          // Inset/protrusion hit — face renders at adjusted depth
          perpDist = _rPD;
        } else {
          // Ray exits tile laterally before reaching inset → jamb wall.
          // EXCEPTION: if the adjacent tile is a double-door/arch partner,
          // suppress the jamb — the two recesses merge into one cavity.
          var _adjX = mapX + (side === 0 ? 0 : stepX);
          var _adjY = mapY + (side === 0 ? stepY : 0);
          var _pairInf = (typeof DoorSprites !== 'undefined' && DoorSprites.getPairInfo)
            ? DoorSprites.getPairInfo(mapX, mapY) : null;
          if (_pairInf && _pairInf.partner === _adjX + ',' + _adjY) {
            // Partner tile — don't render jamb. Continue with the inset
            // depth so this column renders the recessed face texture, and
            // the partner's recess will handle its side when hit.
            perpDist = _rPD;
          } else {
            _recessJamb = true;
            if (side === 0) {
              // Entered through X face, exits through Y boundary
              var _jY = (stepY > 0) ? (mapY + 1) : mapY;
              perpDist = Math.abs((_jY - py) / (rayDirY || 1e-10));
              side = 1;
            } else {
              // Entered through Y face, exits through X boundary
              var _jX = (stepX > 0) ? (mapX + 1) : mapX;
              perpDist = Math.abs((_jX - px) / (rayDirX || 1e-10));
              side = 0;
            }
          }
        }
      }

      // Minimum perpDist clamp — prevents division-by-near-zero when
      // peripheral rays graze very close surfaces. With ±32° free-look
      // the effective viewport spans up to ±62° total, so peripheral
      // rays can get very shallow. The UV clipping below handles
      // arbitrarily large lineHeight correctly; this clamp is only
      // needed to prevent numeric instability in 1/perpDist.
      if (perpDist < 0.2) perpDist = 0.2;

      // ── Wall height: contract tileWallHeights → chamber override → base ──
      // Face for per-face height resolution (TERMINAL bezel etc). side+step
      // maps to 'n'/'s'/'e'/'w' using the project's +Y=south convention.
      var _whFace = null;
      if (side === 0) _whFace = (stepX > 0) ? 'w' : 'e';
      else            _whFace = (stepY > 0) ? 'n' : 's';
      var wallHeightMult = baseWallH;
      if (_contract) {
        wallHeightMult = SpatialContract.getWallHeight(
          _contract, mapX, mapY, _rooms, hitTile, _cellHeights, _whFace, grid
        );
      }

      // Z-buffer: initial write based on the tile's class. This is a
      // DEFAULT — the short ground-wall block further below (after
      // drawStart/drawEnd are known) may override this and populate
      // the pedestal mask for partial sprite clipping.
      //
      //   • DUMP_TRUCK — legacy short-body representation, always
      //     renderDist so the hose billboard floats above. Will be
      //     rebuilt as a 2×1×1 vehicle (see pending spec below).
      //   • Freeform tiles — renderDist (cavity fully transparent to
      //     sprites/back-layers). Per-sprite depth is governed by the
      //     EmojiMount block below: any tile with a registered mount
      //     (type OR instance) writes perpDist + mount.recess instead,
      //     placing the sprite's z-threshold inside the building mass
      //     so vignettes read with real depth. Used by DOOR_FACADE,
      //     ARCH_DOORWAY, PORTHOLE, HEARTH, all window tiles, etc.
      //     The foreground helper still owns its own pedestal mask
      //     write for the solid bands.
      //   • Ultra-short props (<0.35×) — already transparent to the
      //     sprite pass via the legacy threshold; the post-hoc
      //     short-wall block upgrades them to also publish a clip Y.
      //   • Tall walls (≥1.0×) — normal perpDist occlusion.
      var _zBypass = (hitTile === TILES.DUMP_TRUCK) ||
                     (_freeformEnabled && TILES.isFreeform(hitTile));
      if (_zBypass) {
        _zBuffer[col] = renderDist;
      } else {
        _zBuffer[col] = (wallHeightMult > 0.35) ? perpDist : renderDist;
      }
      // Jamb columns are solid walls — restore normal z-buffer so
      // sprites behind the jamb are properly culled.
      if (_recessJamb) { _zBuffer[col] = perpDist; }
      // EmojiMount z-bypass: any tile with a registered emoji mount
      // (per-coord instance OR per-tile-type) pushes its zbuffer write
      // out to perpDist + mount.recess so the sprite at the tile's
      // center isn't culled by the tile's own wall column. Deeper
      // geometry (the next tile and beyond) still writes smaller z
      // and wins the sprite's depth test, so the hologram/vignette
      // is occluded correctly by everything *behind* it — just not
      // by its own pedestal.
      //
      // As of Phase 6 this is the unified z-bypass path for all
      // billboard mounts — the old `zBypassMode: 'depth'` field on
      // window tile freeform configs has been retired. Window
      // vignettes (🍺, 🗝️, 🕯️) are instance mounts registered from
      // floorData.windowScenes via game.js; TERMINAL holograms are
      // type mounts registered at emoji-mount.js load. One path.
      if (typeof EmojiMount !== 'undefined' && EmojiMount.getMountAtOrType) {
        var _emMnt = EmojiMount.getMountAtOrType(mapX, mapY, hitTile);
        if (_emMnt) _zBuffer[col] = perpDist + _emMnt.recess;
      }
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
      // Jamb columns render as solid wall — suppress the freeform
      // cavity/lintel split so the column draws as one textured slab.
      if (_recessJamb) { freeformCfg = null; }
      if (freeformCfg) {
        heightOffset = 0;  // suppress Doom-rule displacement
      }

      var vertShift = Math.floor((h * heightOffset) / perpDist);

      // Unshifted positions (where the wall would draw at floor level)
      // For tiles with tileWallHeights override (e.g. TREE at 2×), anchor
      // the bottom at normal floor level and extend upward only. Without
      // this, centered positioning makes tall walls grow symmetrically
      // above and below the horizon, clipping into the floor.
      //
      // MULTI-ELEVATION: _playerElev shifts the world-Y=0 plane DOWN on
      // screen by h*_playerElev/perpDist (player's eye rides up, floor
      // appears further below). flatBottom picks this up; flatTop,
      // drawStart, drawEnd all inherit through the subtraction chain,
      // so every step-fill band and cap paint stays geometrically
      // consistent without per-site corrections.
      var _elevShift = (_playerElev > 0)
        ? Math.floor((h * _playerElev) / perpDist) : 0;
      var baseLineH = Math.floor((h * baseWallH) / perpDist);
      var flatBottom = Math.floor(halfH + baseLineH / 2) + _elevShift;
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
            tintStr, tintIdx, tintRGB,
            _pdCos, _pdSin, _playerElev
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

      // Per-tile window texture override: building-specific wall material
      // for the freeform sill + lintel bands (brick, wood, stone, etc.)
      if (TILES.isWindow && TILES.isWindow(hitTile) &&
          typeof WindowSprites !== 'undefined' &&
          WindowSprites.getWallTexture) {
        var winTex = WindowSprites.getWallTexture(mapX, mapY);
        if (winTex) texId = winTex;
      }

      // Per-tile door/arch texture override: building-specific material
      // for DOOR, DOOR_BACK, DOOR_EXIT, and ARCH_DOORWAY tiles.
      // Phase 0 of Door Architecture Roadmap.
      if ((hitTile === TILES.DOOR || hitTile === TILES.DOOR_BACK ||
           hitTile === TILES.DOOR_EXIT || hitTile === TILES.ARCH_DOORWAY ||
           hitTile === TILES.DOOR_FACADE) &&
          typeof DoorSprites !== 'undefined' &&
          DoorSprites.getWallTexture) {
        var doorTex = DoorSprites.getWallTexture(mapX, mapY);
        if (doorTex) texId = doorTex;
      }

      var tex = texId ? TextureAtlas.get(texId) : null;
      var stripH = drawEnd - drawStart + 1;

      // Compute wall-hit UV (0..1 along the face) — needed by both
      // the normal texture path and DoorAnimator
      var wallX;
      if (_circleHit) {
        // Circle hit: wrap the texture around the trunk by the hit
        // point's angle relative to tile centre. atan2 ∈ [−π, π] maps
        // to wallX ∈ [0, 1]. This sends the trunk texture around the
        // full circumference once, so vertical bark grooves read as
        // curved around the trunk instead of as a flat billboard.
        var _dxC = _circleHX - _circleCX;
        var _dyC = _circleHY - _circleCY;
        wallX = (Math.atan2(_dyC, _dxC) + Math.PI) / (2 * Math.PI);
        if (wallX < 0) wallX = 0;
        if (wallX >= 1) wallX -= 1;
      } else if (_diagHit) {
        // Diagonal-wall hit: texture U is the position along the
        // segment from endpoint A to endpoint B (already normalised
        // 0..1 by the ray-segment solver).
        wallX = _diagOffsetLeft;
        if (wallX < 0) wallX = 0;
        if (wallX >= 1) wallX = 0.9999;
      } else if (side === 0) {
        wallX = py + perpDist * rayDirY;
      } else {
        wallX = px + perpDist * rayDirX;
      }
      if (!_circleHit && !_diagHit) {
        wallX = wallX - Math.floor(wallX);

        // Flip for consistent left-to-right on both face orientations
        if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
          wallX = 1 - wallX;
        }
      }

      // ── Door-open animation override ──────────────────────────
      // If this tile is the one currently animating open, delegate
      // rendering to DoorAnimator which draws the split/portcullis
      // reveal instead of the static door texture.
      if (typeof DoorAnimator !== 'undefined' &&
          DoorAnimator.isAnimatingTile(mapX, mapY) && stripH > 0 &&
          hitTile !== TILES.DOOR_FACADE && hitTile !== TILES.TRAPDOOR_DN && hitTile !== TILES.TRAPDOOR_UP) {
        // DOOR_FACADE tiles use freeform rendering — the door animation
        // plays inside the gap filler, not as a full-column takeover.
        // Skip DoorAnimator for DOOR_FACADE; it falls through to the
        // freeform path below.
        DoorAnimator.renderColumn(
          ctx, col, drawStart, drawEnd, wallX, side,
          fogFactor, brightness, fogColor, mapX, mapY
        );
      } else if (tex && stripH > 0) {
        // Texture column index
        var texX = Math.floor(wallX * tex.width);
        if (texX >= tex.width) texX = tex.width - 1;

        var shiftedTop = flatTop - vertShift;

        // ── Phase 6B: wide-arch UV remap for paired ARCH_DOORWAY ──
        // If this is an alpha-mask freeform tile (ARCH_DOORWAY) that
        // belongs to a double-door pair, swap to the wide 128×64
        // texture and remap texX to the correct half. This ensures
        // _computeAlphaRange walks the wide texture's column, giving
        // a single continuous arch opening that spans both tiles.
        if (freeformCfg && freeformCfg.gapTexAlpha &&
            typeof DoorSprites !== 'undefined' && DoorSprites.getPairInfo) {
          var _archPair = DoorSprites.getPairInfo(mapX, mapY);
          if (_archPair) {
            var _wideTexId = DoorSprites.getDoubleDoorPanel
              ? DoorSprites.getDoubleDoorPanel(mapX, mapY) : null;
            var _wideTex = (_wideTexId && typeof TextureAtlas !== 'undefined')
              ? TextureAtlas.get(_wideTexId) : null;
            if (_wideTex && _wideTex.data) {
              tex = _wideTex;
              if (_archPair.side === 'left') {
                texX = Math.floor(wallX * 0.5 * tex.width);
              } else {
                texX = Math.floor((0.5 + wallX * 0.5) * tex.width);
              }
              if (texX >= tex.width) texX = tex.width - 1;
            }
          }
        }

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
            // Thin-slab furniture (TABLE/BED) uses a TRANSLUCENT shadow
            // overlay here instead of the opaque texture-sampled band
            // the stoop/deck use. The floor texture has already been
            // drawn in the floor pass; an rgba fill darkens it without
            // replacing it, so the under-table region reads as "floor
            // in shadow" rather than as a separate colored kickplate.
            // This is the look the user described as the "bed's
            // transparent step-fill method" — the shadow is a tint,
            // not a band.
            if (TILES.hasFlatTopCap && TILES.hasFlatTopCap(hitTile) &&
                hitTile !== TILES.STOOP && hitTile !== TILES.DECK) {
              // Alpha scales gently with brightness so far-away shadows
              // fade into fog like everything else.
              var _skA = Math.min(0.55, 0.40 * brightness);
              ctx.fillStyle = 'rgba(0,0,0,' + _skA.toFixed(3) + ')';
              ctx.fillRect(col, stepTop, 1, stepBot - stepTop);
            } else {
              ctx.fillRect(col, stepTop, 1, stepBot - stepTop);
            }
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
      // ── STOOP/DECK top-surface cap (per-row floor projection) ───────
      // Step tiles have a horizontal TOP plane at world height
      // topElev = heightOffset + wallHeightMult/2. Previous attempts
      // filled the cap region with a single fillRect sampled by wallX
      // (the 1D U-coordinate along the hit face), which produced
      // vertical-stripe artifacts because wallX doesn't parametrise a
      // horizontal surface. The correct approach mirrors RaycasterFloor:
      // for each screen row between the horizon and drawStart, compute
      // the rowDist that maps that row to the elevated plane, project
      // into world (floorX, floorY), test whether that world point is
      // still inside a step tile, and sample the tile's floor texture
      // at those coordinates.
      //
      // Eye is at world height baseWallH/2 (the centre of a standard
      // wall). Vertical drop from eye to the top plane is
      //   eyeAbove = baseWallH/2 - topElev
      // so the floor-projection formula becomes
      //   rowDist = trueHalfH * (baseWallH - 2*topElev) / rowFromCenter.
      // For STOOP (topElev = 0.06) this is slightly beyond the regular
      // floor's rowDist for the same row — the near face of the lip
      // occludes the cap's foreground edge, so only rows between
      // halfH (horizon) and drawStart receive a paint.
      if (TILES.hasFlatTopCap && TILES.hasFlatTopCap(hitTile) && drawStart > halfH) {
        // Top of the slab in world Y: walls are anchored at the floor
        // plane and extend UP by wallHeightMult, then shifted UP by
        // heightOffset. So the top plane sits at (heightOffset +
        // wallHeightMult) world units.
        //
        // MULTI-ELEVATION: eye is at (_playerElev + baseWallH/2) in
        // world Y. Row-to-plane formula is rowDist = trueHalfH *
        // 2*(eyeY - topElev) / rowFromCenter. Collapsing 2*(eye - top)
        // = baseWallH + 2*(_playerElev - _capTopElev) gives the
        // eye-scale below — matches the non-elevated formula when
        // _playerElev = 0. Negative values mean the cap plane is
        // ABOVE eye level (can't render as "cap from above" — it'd be
        // a ceiling) so we bail via the positive-scale gate below.
        var _capTopElev = heightOffset + wallHeightMult;
        var _capEyeScale = baseWallH - 2 * _capTopElev + 2 * _playerElev;
        if (_capEyeScale > 0.01) {
          var _capTrueHalf = h / 2;
          var _capRowStart = Math.floor(halfH) + 1;
          var _capRowEnd = Math.min(drawStart - 1, h - 1);
          // Fog band parameters (match RaycasterFloor formula).
          var _capFogStart = fogDist * 0.5;
          var _capFogRange = (fogDist * 1.5) - _capFogStart;
          // Cap texture lookup: prefer tileFloorTextures (flagstone for
          // STOOP, boardwalk for DECK, a dedicated tabletop texture for
          // TABLE/BED). If no entry is registered, fall back to the
          // wall texture (`tex`) already used for the face — the top
          // reads as the same material as the apron, which is the
          // right default for furniture where side and top are the
          // same board of wood.
          var _capTex = null;
          if (typeof TextureAtlas !== 'undefined' && TextureAtlas.get) {
            var _capTexId = _contract && _contract.tileFloorTextures
              ? _contract.tileFloorTextures[hitTile] : null;
            if (_capTexId) _capTex = TextureAtlas.get(_capTexId);
          }
          if (!_capTex && tex && tex.data) _capTex = tex;
          if (_capTex && _capTex.data) {
            var _capTW = _capTex.width;
            var _capTH = _capTex.height;
            var _capTD = _capTex.data;
            // Per-tile cap texture scale. We sample the texture in world
            // coords (floorX * texW mod texW) — dividing the world coord
            // by a scale factor stretches the texture across more world
            // units per repeat. TABLE stretches the wood planks so they
            // read larger than the floor's planks (2× width, 2.5× length
            // grain direction); BED stretches the quilt a touch. Others
            // (STOOP, DECK) sample 1:1.
            var _capScaleX = 1.0, _capScaleY = 1.0;
            if (hitTile === TILES.TABLE) { _capScaleX = 2.0; _capScaleY = 2.5; }
            else if (hitTile === TILES.BED) { _capScaleX = 1.5; _capScaleY = 1.5; }
            // ── Contiguous flat-top run precompute ────────────────────
            // Walk a DDA step past the hit tile in ray direction,
            // collecting consecutive hasFlatTopCap cells of the same
            // species as the hit. This replaces the Manhattan ≤ 1 gate
            // for non-void caps — long boardwalk/deck strips viewed
            // longitudinally need more than 1 neighbour to stay lit, but
            // we still stop at the first non-flat-top cell so grazing
            // rays can't paint ghostly lids across a room.
            //
            // Void caps (TERMINAL pedestal wells) skip this — they keep
            // the strict self-only gate enforced in the row loop.
            var _capRun = null;
            if (TILES.hasVoidCap && TILES.hasVoidCap(hitTile)) {
              // leave null — row loop uses strict Manhattan 0 below
            } else {
              _capRun = {};
              _capRun[mapX + ',' + mapY] = true;
              var _runWX = mapX, _runWY = mapY;
              var _runSgnX = rayDirX >= 0 ? 1 : -1;
              var _runSgnY = rayDirY >= 0 ? 1 : -1;
              var _runDeltaX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
              var _runDeltaY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
              var _runTMaxX = rayDirX === 0 ? 1e30
                : ((rayDirX > 0 ? (mapX + 1) : mapX) - px) / rayDirX;
              var _runTMaxY = rayDirY === 0 ? 1e30
                : ((rayDirY > 0 ? (mapY + 1) : mapY) - py) / rayDirY;
              for (var _runStep = 0; _runStep < 12; _runStep++) {
                if (_runTMaxX < _runTMaxY) {
                  _runTMaxX += _runDeltaX; _runWX += _runSgnX;
                } else {
                  _runTMaxY += _runDeltaY; _runWY += _runSgnY;
                }
                if (_runWX < 0 || _runWX >= gridW ||
                    _runWY < 0 || _runWY >= gridH) break;
                var _runT = grid[_runWY][_runWX];
                if (!(TILES.hasFlatTopCap && TILES.hasFlatTopCap(_runT))) break;
                // Stop if we enter a void-cap tile — shouldn't blend
                // with solid flat-top strips.
                if (TILES.hasVoidCap && TILES.hasVoidCap(_runT)) break;
                _capRun[_runWX + ',' + _runWY] = true;
              }
            }
            for (var _capRow = _capRowStart; _capRow <= _capRowEnd; _capRow++) {
              var _capRowFromCenter = _capRow - halfH;
              if (_capRowFromCenter < 0.5) continue;
              var _capRowDist = (_capTrueHalf * _capEyeScale) / _capRowFromCenter;
              // Stay in front of the near-face hit — past the back edge
              // of the slab we have no footprint to paint.
              if (_capRowDist < perpDist) continue;
              // Project into world; skip if outside a step tile.
              var _capWX = px + _capRowDist * rayDirX;
              var _capWY = py + _capRowDist * rayDirY;
              var _capTGX = Math.floor(_capWX);
              var _capTGY = Math.floor(_capWY);
              if (_capTGX < 0 || _capTGX >= gridW ||
                  _capTGY < 0 || _capTGY >= gridH) continue;
              // Contiguity gate. The cap may paint the hit tile itself
              // or a 4-adjacent hasFlatTopCap neighbor — this supports
              // authored multi-tile furniture like a 2×1 dining table
              // where both cells should render as one continuous top.
              // Cells farther than 1 step (Manhattan) from the hit
              // cell are rejected: without this, grazing rays that
              // skim past the hit tile and keep walking would paint
              // another hasFlatTopCap tile across the room, producing
              // ghostly tabletop strips on the far side of walls.
              //
              // The neighbor must itself be hasFlatTopCap so the cap
              // stops at the tabletop's real edge rather than bleeding
              // onto plain floor.
              var _capCellT = grid[_capTGY][_capTGX];
              if (!(TILES.hasFlatTopCap && TILES.hasFlatTopCap(_capCellT))) continue;
              // Void-cap tiles (TERMINAL pedestal wells) must keep their
              // dark-green paint strictly inside their own footprint —
              // otherwise they spill rows onto adjacent cells and stomp
              // back-layer geometry (e.g. HEARTH behind) at the same
              // world-Y. Flat-top tiles (TABLE/BED/STOOP/DECK) use the
              // precomputed run membership instead, so a long DECK strip
              // paints its whole lid and isn't clipped at Manhattan 1.
              var _capIsVoid = TILES.hasVoidCap && TILES.hasVoidCap(_capCellT);
              if (_capIsVoid) {
                if (_capTGX !== mapX || _capTGY !== mapY) continue;
              } else {
                if (!_capRun || !_capRun[_capTGX + ',' + _capTGY]) continue;
              }
              // Tile-repeating texture sample. Dividing world coords by
              // the per-tile scale stretches the texture (a scale of 2
              // means the pattern period doubles in world units, so
              // planks look twice as wide).
              var _capTx = ((Math.floor(_capWX * _capTW / _capScaleX) % _capTW) + _capTW) % _capTW;
              var _capTy = ((Math.floor(_capWY * _capTH / _capScaleY) % _capTH) + _capTH) % _capTH;
              var _capIdx = (_capTy * _capTW + _capTx) * 4;
              var _capR = _capTD[_capIdx];
              var _capG = _capTD[_capIdx + 1];
              var _capB = _capTD[_capIdx + 2];
              // Distance-lit (same curve as RaycasterFloor) — horizontal
              // surfaces catch a bit more overhead light, so lift the
              // floor formula's 0.04 falloff slightly.
              var _capBright = Math.max(0.30, 1 - _capRowDist * 0.035);
              _capR = _capR * _capBright;
              _capG = _capG * _capBright;
              _capB = _capB * _capBright;
              // Fog (row-based, matching floor).
              if (_capRowDist > _capFogStart) {
                var _capFog = Math.min(1, (_capRowDist - _capFogStart) / _capFogRange);
                var _capInv = 1 - _capFog;
                _capR = _capR * _capInv + fogColor.r * _capFog;
                _capG = _capG * _capInv + fogColor.g * _capFog;
                _capB = _capB * _capInv + fogColor.b * _capFog;
              }
              // Void-cap override: TERMINAL (and future hollow pedestals)
              // paint their top surface as "looking down into a lit
               // well" — not a surface at all. We discard the texture
              // sample entirely (which otherwise reads as green-tinted
              // wood planks) and paint a near-black fill with a faint
              // hologram-green cast + horizontal CRT scanline on every
              // other pixel row. The depth cue comes from row distance:
              // rows closer to the horizon (far edge of the well)
              // darken toward pure black; rows nearer the player
              // (front of the well) lift slightly so the 💻 hologram
              // appears to be "down in the well."
              if (TILES.hasVoidCap && TILES.hasVoidCap(_capCellT)) {
                // Depth factor: 0 at far horizon edge, 1 at near front lip.
                var _voidT = (_capRow - halfH) / Math.max(1, (_capRowEnd - halfH));
                if (_voidT < 0) _voidT = 0; else if (_voidT > 1) _voidT = 1;
                var _voidLift = _voidT * _voidT;   // quadratic, dark deep
                _capR = 2 + 10 * _voidLift;
                _capG = 10 + 32 * _voidLift;
                _capB = 4 + 14 * _voidLift;
                // Scanlines: dim every other row for CRT feel.
                if ((_capRow & 1) === 0) {
                  _capR *= 0.55; _capG *= 0.55; _capB *= 0.55;
                }
              }
              ctx.fillStyle = 'rgb(' + (_capR | 0) + ',' + (_capG | 0) + ',' + (_capB | 0) + ')';
              ctx.fillRect(col, _capRow, 1, 1);
            }
          }
        }
      }

      if (wallHeightMult < 0.95 && wallHeightMult > 0.25 && drawStart > halfH) {
        // NOTE: TABLE and BED were removed from this wallX-sampled cap
        // path and now render their tops via the floor-projected cap
        // above (TILES.hasFlatTopCap). That path avoids the 1D U
        // striping artifact and correctly presents the tabletop as a
        // horizontal plane. Only CHEST and BAR_COUNTER — which are
        // fat cubes, not thin slabs — still use the cheap wallX cap.
        var _isCapTile = (hitTile === TILES.CHEST || hitTile === TILES.BAR_COUNTER);
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

    if (_dpm) _dpm.end('Raycaster.wallPhase');

    // ── Sprite + weather-veil sandwich ──────────────────────────
    // Weather overlays (veil gradient, parallax debris layers) sit
    // between a distant and near sprite pass. Sprites closer than
    // terminusDist punch through the weather for depth perception.
    // terminusDist is per-floor via SpatialContract; WeatherSystem
    // can override it per-preset when loaded (Phase 1+).
    var terminusDist = (typeof WeatherSystem !== 'undefined' && WeatherSystem.getTerminusDist)
      ? WeatherSystem.getTerminusDist()
      : (_contract && _contract.terminusDist) || 2.0;

    // Distant sprite pass — masked by weather along with distant walls.
    //
    // Sprite cull distance is biased slightly INSIDE the tile
    // renderDist so NPCs always have a wall/floor backdrop behind
    // them. Without the bias, a sprite can appear at perpDist ≈
    // renderDist while the diagonal-corrected wall horizon is a
    // few tenths shorter, producing an "NPC floating in fog with
    // no tiles behind them" artifact at the very edge of view.
    // 0.92 is empirically just inside the back-layer perpDist cap.
    var _spriteRenderDist = renderDist * 0.92;
    if (_dpm) _dpm.begin('Raycaster.spritesDistant');
    if (sprites && sprites.length > 0) {
      _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, _spriteRenderDist, fogDist, fogColor, terminusDist, null);
    }
    if (_dpm) _dpm.end('Raycaster.spritesDistant');

    // ── Weather layer insertion point ─────────────────────────────
    // When WeatherSystem is loaded (Phase 1+), it renders the veil,
    // lower parallax (rolling debris), and upper parallax (wind
    // streaks) here — between distant and near sprite passes.
    // Fallback: the legacy terminus fog veil for exterior FADE floors.
    if (_dpm) _dpm.begin('Raycaster.weather');
    if (typeof WeatherSystem !== 'undefined' && WeatherSystem.renderBelow) {
      WeatherSystem.renderBelow(ctx, w, h, halfH, fogColor);
    } else {
      _renderWeatherVeil(ctx, w, h, halfH, fogColor);
    }
    if (_dpm) _dpm.end('Raycaster.weather');

    // Near sprite pass — punches through the weather so close NPCs
    // and props are never painted into the horizon band. Near sprites
    // are always within terminusDist tiles of the player, so they're
    // inside the tile backdrop and don't need the _spriteRenderDist bias.
    if (_dpm) _dpm.begin('Raycaster.spritesNear');
    if (sprites && sprites.length > 0) {
      _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor, 0, terminusDist);
    }
    if (_dpm) _dpm.end('Raycaster.spritesNear');

    // ── Render particles (above sprites, below HUD) ──
    // dt is estimated from frame timing since render() doesn't receive it.
    // CombatFX or game.js calls updateParticles() separately if precision matters.
    var now = Date.now();
    var pDt = now - (_lastParticleTime || now);
    _lastParticleTime = now;
    if (_dpm) _dpm.begin('Raycaster.particles');
    if (pDt > 0 && pDt < 100) {
      _updateAndRenderParticles(ctx, pDt);
    }
    if (_dpm) _dpm.end('Raycaster.particles');

    // ── Blit offscreen 3D viewport → main canvas ───────────────────
    // The raycaster drew everything above into `_offCanvas` at the
    // scaled backing resolution. Now copy it to the main canvas at
    // full CSS size with nearest-neighbor upscale. The main canvas
    // stays at native size so HUD/minimap/menus drawn AFTER this
    // render() (elsewhere in the game loop) get full-fidelity pixels.
    // Any ctx transform already applied to _mainCtx (e.g. CombatFX
    // zoom set up by game.js before calling render) is respected by
    // drawImage.
    if (_dpm) _dpm.begin('Raycaster.blit');
    if (_mainCtx && _offCanvas && _canvas) {
      _mainCtx.drawImage(_offCanvas, 0, 0, _canvas.width, _canvas.height);
    }
    if (_dpm) _dpm.end('Raycaster.blit');
  }

  var _lastParticleTime = 0;

  // ── Parallax background layers ──
  // _renderParallax moved to engine/raycaster-floor.js (EX-4)


  // ── Terminus fog veil (legacy fallback) ──────────────────────────
  // Draws a soft atmospheric gradient band centered on the horizon to
  // mask the floor/sky seam and soften wall pop-in at render distance.
  // Only active on exterior FADE floors when WeatherSystem is not loaded.
  // When WeatherSystem is present, it takes over this slot entirely via
  // renderBelow() and may draw additional parallax sprite layers.
  // _renderWeatherVeil moved to engine/raycaster-floor.js (EX-4)


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

    // Unclipped wall extent (matches _drawTiledColumn's wallTop/lineH).
    var wallBot = wallTop + lineH;

    // ── Segment fraction computation ──────────────────────────────
    // Two modes:
    //   (a) Flat row-range: hUpper/hLower in world units → fixed fracs.
    //       Used by HEARTH, CITY_BONFIRE, DUMP_TRUCK, WINDOW_TAVERN.
    //   (b) Alpha-mask: per-column frac derived from the texture's α
    //       channel. Used by ARCH_DOORWAY, PORTHOLE (Phase 3).
    var upperFrac, lowerFrac;

    if (ff.gapTexAlpha && tex && tex.data) {
      // Alpha-mask mode: walk (or cache-hit) the texture column to
      // find the transparent row range, then convert to fractions.
      var clampedTexX = Math.min(Math.max(Math.floor(texX), 0), tex.width - 1);
      var aRange = _computeAlphaRange(tex, hitTile + '', clampedTexX);
      // topOpaque = last opaque row from top; botOpaque = first opaque row from bot
      // Upper band occupies rows 0..topOpaque → fraction = (topOpaque+1)/height
      // Lower band occupies rows botOpaque..height-1 → fraction = (height-botOpaque)/height
      upperFrac = (aRange.topOpaque + 1) / tex.height;
      lowerFrac = (tex.height - aRange.botOpaque) / tex.height;
      if (upperFrac < 0) upperFrac = 0;
      if (lowerFrac < 0) lowerFrac = 0;
      // Clamp so the bands don't exceed the column.
      if (upperFrac + lowerFrac > 1) {
        upperFrac = 0.5; lowerFrac = 0.5;
      }
    } else {
      // Flat row-range: world-unit → pixel fractions of the full wall column.
      upperFrac = ff.hUpper / whMult;
      lowerFrac = ff.hLower / whMult;
      if (upperFrac < 0) upperFrac = 0;
      if (lowerFrac < 0) lowerFrac = 0;
    }

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

      // ── Back-face coordinate + face recovery ────────────────
      // When this freeform render is a back-face injection (the
      // layer's coordinates point to the cell BEHIND the tile,
      // not the tile itself), two corrections are needed:
      //
      //  1. COORDINATES: the gap filler needs the original tile's
      //     grid coords for per-tile metadata lookups (windowFaces,
      //     mullion colors). Recover by stepping back one DDA cell.
      //
      //  2. HIT FACE: the DDA step/side values are identical for
      //     both the foreground hit and the back-face injection, so
      //     the naïve hitFace formula returns the SAME face index
      //     for both. The back face is the OPPOSITE face of the
      //     tile — flip by 180° ((face + 2) % 4).
      var _srcMapX = mapX;
      var _srcMapY = mapY;
      var _isBackFace = false;
      if (_renderGrid && _renderGrid[mapY] && _renderGrid[mapY][mapX] !== hitTile) {
        _isBackFace = true;
        if (side === 0) {
          _srcMapX = mapX - stepX;
        } else {
          _srcMapY = mapY - stepY;
        }
      }

      // Populate the shared info object once per column. Fillers are
      // expected to treat this as read-only and not retain references
      // past the call (it gets overwritten for the next column).
      _gapInfo.brightness     = brightness;
      _gapInfo.fogFactor      = fogFactor;
      _gapInfo.fogColor       = fogColor;
      _gapInfo.tintStr        = tintStr;
      _gapInfo.tintIdx        = tintIdx;
      _gapInfo.tintRGB        = tintRGB;
      _gapInfo.mapX           = _srcMapX;
      _gapInfo.mapY           = _srcMapY;
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
      // Back-face injection: the ray exits through the opposite
      // face of the tile, so flip 180° to get the correct face
      // index for per-face filler logic (e.g. window mullion only
      // on the exterior face, transparent on the interior face).
      _gapInfo.hitFace = _isBackFace ? ((_hitFace + 2) % 4) : _hitFace;

      var fillerKey = ff.fillGap || '_default';
      var filler    = _gapFillers[fillerKey];
      if (!filler) {
        if (!_gapFillers.__warned) _gapFillers.__warned = {};
        if (!_gapFillers.__warned[fillerKey]) {
          _gapFillers.__warned[fillerKey] = true;
          try { console.warn('[Raycaster] missing freeform gap filler for key:', fillerKey, 'tile=', _gapInfo.hitTile); } catch (e) {}
        }
        filler = _gapFillers._default;
      }
      filler(ctx, col, gapStart, gapH, _gapInfo);
    }
  }

  // _drawTiledColumn moved to engine/raycaster-walls.js (EX-5)


  // ── Per-pixel wall column renderer (PW-1 grime hook) ─────────
  // Reads texture data directly and writes via ImageData, enabling
  // per-pixel grime tinting. Only used for wall columns that have a
  // GrimeGrid — clean columns keep the fast ctx.drawImage path above.
  //
  // _drawTiledColumnPixel moved to engine/raycaster-walls.js (EX-5)


  // ── Wall decor rendering ──────────────────────────────────────
  // _renderWallDecor, _hitFace moved to engine/raycaster-walls.js (EX-5)
  // and engine/raycaster-sprites.js (EX-6). Aliased at top of IIFE.

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
                            tintStr, tintIdx, tintRGB,
                            pdCos, pdSin, playerElev) {
    playerElev = playerElev || 0;
    // Perpendicular distance.
    // Circle-shaped tiles (flagged during back-layer collection) use
    // the stashed circle intersection point and project onto the
    // player's forward vector — matching the foreground-hit path so a
    // trunk behind a shrub / under a canopy renders with the same
    // round silhouette and angle-wrapped texture as an unoccluded trunk.
    var pd;
    if (L.isCircle) {
      pd = (L.hx - px) * pdCos + (L.hy - py) * pdSin;
      if (pd < 0) pd = 0;
    } else if (L.sd === 0) {
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

    // Bottom-anchored positioning (same as foreground).
    // MULTI-ELEVATION: playerElev pushes the floor plane DOWN on
    // screen — same correction as the foreground wall pass so
    // back-layer tiles stay pinned to the shared world-Y=0 plane.
    var _blElevShift = (playerElev > 0)
      ? Math.floor((h * playerElev) / pd) : 0;
    var flatBot = Math.floor(halfH + baseLH / 2) + _blElevShift;
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

    // Wall UV.
    // Circle layers wrap the texture by hit-point angle around the
    // trunk centre. Square layers use the standard axis-aligned UV
    // derived from the ray's tile-crossing.
    var wx;
    if (L.isCircle) {
      var _blDxC = L.hx - L.cx;
      var _blDyC = L.hy - L.cy;
      wx = (Math.atan2(_blDyC, _blDxC) + Math.PI) / (2 * Math.PI);
      if (wx < 0) wx = 0;
      if (wx >= 1) wx -= 1;
    } else {
      if (L.sd === 0) {
        wx = py + pd * rayDirY;
      } else {
        wx = px + pd * rayDirX;
      }
      wx -= Math.floor(wx);
      if ((L.sd === 0 && rayDirX > 0) || (L.sd === 1 && rayDirY < 0)) {
        wx = 1 - wx;
      }
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

    // Per-tile window texture override (back-layer mirror of foreground hook)
    if (TILES.isWindow && TILES.isWindow(L.tile) &&
        typeof WindowSprites !== 'undefined' &&
        WindowSprites.getWallTexture) {
      var _blWinTex = WindowSprites.getWallTexture(L.mx, L.my);
      if (_blWinTex) texId = _blWinTex;
    }

    // Per-tile door/arch texture override (back-layer mirror of foreground hook)
    if ((L.tile === TILES.DOOR || L.tile === TILES.DOOR_BACK ||
         L.tile === TILES.DOOR_EXIT || L.tile === TILES.ARCH_DOORWAY ||
         L.tile === TILES.DOOR_FACADE) &&
        typeof DoorSprites !== 'undefined' &&
        DoorSprites.getWallTexture) {
      var _blDoorTex = DoorSprites.getWallTexture(L.mx, L.my);
      if (_blDoorTex) texId = _blDoorTex;
    }

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
  // _renderFloor moved to engine/raycaster-floor.js (EX-4)


  // ── Sprite / particle / wall-decor rendering ───────────────────
  // _renderSprites, _renderWallDecor, _updateAndRenderParticles plus
  // module-private helpers (_renderStack, _renderCorpsePile,
  // _renderSubLayer, _hueToRgb, _emitParticle, _ensureTintCanvas) and
  // constants (_FACE_VEC, _AWARENESS_GLYPHS, FACING_DARK_MAX,
  // OVERHEAD_BOB_*, _SLOT_*, _PARTICLE_MAX, tint canvas) all moved to
  // engine/raycaster-sprites.js (EX-6). Aliased at top of IIFE.

  // ── Tint helpers ────────────────────────────────────────────────
  // _tintedDark and _applyFogAndBrightness moved to
  // engine/raycaster-lighting.js (EX-1). Aliased at top of IIFE.

  // ── Projection / pointer-ray APIs ───────────────────────────────
  // castScreenRay, findTileScreenRange, projectWorldToScreen moved to
  // engine/raycaster-projection.js (EX-3). Bind the live closure state
  // once here so the projection module reads the same _zBuffer /
  // _zBufferPed* arrays, _contract, _width etc. that the render loop
  // fills each frame.
  RaycasterProjection.bind({
    canvas:      function () { return _canvas; },
    width:       function () { return _width; },
    height:      function () { return _height; },
    contract:    function () { return _contract; },
    rooms:       function () { return _rooms; },
    cellHeights: function () { return _cellHeights; },
    renderScale: function () { return RENDER_SCALE; },
    lastHalfH:   function () { return _lastHalfH; },
    zBuffer:     function () { return _zBuffer; },
    pedBuffers:  function () {
      return { mx: _zBufferPedMX, my: _zBufferPedMY, topY: _zBufferPedTopY };
    }
  });

  // RaycasterFloor reads _contract (waterColor, terminusFog) and
  // _bloodFloorId (CleaningSystem / GrimeGrid lookups) via lazy getters
  // so mutations (setContract, setBloodFloorId) after this point still
  // land in subsequent frames.
  RaycasterFloor.bind({
    contract:     function () { return _contract; },
    bloodFloorId: function () { return _bloodFloorId; }
  });

  // RaycasterWalls reads _height (to size its 1-pixel column scratch
  // buffer on first use or after resize) and the per-frame floor grid
  // (for ROOF_CRENEL face culling). All lazy — mutations propagate
  // automatically on subsequent frames.
  RaycasterWalls.bind({
    height: function () { return _height; },
    grid:   function () { return _renderGrid; },
    gridW:  function () { return _renderGridW; },
    gridH:  function () { return _renderGridH; }
  });

  // RaycasterSprites reads the z-buffer + pedestal arrays for occlusion,
  // the active contract (ceilingType → exterior silhouette branch), and
  // the per-floor wall-decor grid. All via lazy getters — swapping floor
  // data or contract propagates on the next frame.
  RaycasterSprites.bind({
    contract:   function () { return _contract; },
    zBuffer:    function () { return _zBuffer; },
    pedBuffers: function () {
      return { dist: _zBufferPedDist, topY: _zBufferPedTopY,
               mx:   _zBufferPedMX,   my:   _zBufferPedMY };
    },
    wallDecor:  function () { return _wallDecor; }
  });

  return {
    init: init,
    render: render,
    setBiomeColors: setBiomeColors,
    setContract: setContract,
    setBloodFloorId: function (id) { _bloodFloorId = id; },
    castScreenRay: RaycasterProjection.castScreenRay,
    setRenderScale: setRenderScale,
    getRenderScale: getRenderScale,
    setFreeformEnabled: function (enabled) { _freeformEnabled = !!enabled; },
    isFreeformEnabled: function () { return _freeformEnabled; },
    registerFreeformGapFiller: RaycasterTextures.register,
    projectWorldToScreen: RaycasterProjection.projectWorldToScreen,
    findTileScreenRange: RaycasterProjection.findTileScreenRange,
    getZBuffer: function () { return _zBuffer; },
    getCanvasSize: function () { return { w: _canvas ? _canvas.width : 320, h: _canvas ? _canvas.height : 200 }; }
  };
})();
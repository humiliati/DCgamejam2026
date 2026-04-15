/**
 * EmojiMount — generic "emoji mounted on a tile" technology.
 *
 * A tile type can register an emoji mount via EmojiMount.register({...}).
 * Each frame, buildSprites() scans the grid and emits a sprite for every
 * cell whose tile type has a registered mount. The sprites flow through
 * game.js's _sprites[] array the same way WindowSprites' vignettes do,
 * and the raycaster's existing sprite pass billboards them.
 *
 * Three anchor modes cover the current use cases:
 *
 *   'floor'   — baseline at world Y 0, sprite rises through the tile.
 *               Used by TERMINAL: hologram stems out of the pedestal well,
 *               partially obscured from the side by the TERMINAL_RIM lip.
 *
 *   'cavity'  — sprite sits inside the tile cavity at `lift` world Y.
 *               Phase 2 use case: window vignette emoji (🍺 in the tavern,
 *               🗝️ in a shop window). The mount's `recess` parameter
 *               drives the raycaster z-bypass so near-tile obstacles still
 *               occlude the vignette but content deeper in the scene does
 *               not fight for depth.
 *
 *   'surface' — sprite sits on top of a hasFlatTopCap slab at `lift`
 *               world Y. Reserved for shop-shelf items and tabletop
 *               displays — not wired for Phase 1 but the math is here.
 *
 * The module owns: mount registry (keyed by tile id), per-floor sprite
 * cache, bob/glint animation clocks. It owns no rendering — it produces
 * sprite records and hands them off.
 *
 * Load order: Layer 1 (before Raycaster). Game calls buildSprites()
 * per render frame and animate() per frame with the current timestamp.
 * Same plumbing shape as WindowSprites (engine/window-sprites.js).
 *
 * Phase 6 (LIVING_WINDOWS_ROADMAP §4.6) ported WindowSprites' window
 * vignette emission into this module. Each windowScenes entry on the
 * floor data becomes an INSTANCE mount (anchor='cavity', recess=1.0,
 * lift per-tile) registered via registerAt(floorId, x, y, cfg). The
 * per-mount `recess` is now the unified z-bypass knob — the
 * `zBypassMode='depth'` field on SpatialContract freeform configs
 * has been deleted, and the raycaster's per-tile zbuffer write is
 * back to the simple transparent-to-sprites rule with depth applied
 * by getMountAtOrType() on the column-by-column hot path.
 */
var EmojiMount = (function () {
  'use strict';

  // Mount registry — key: tile id (number), value: frozen config.
  // TYPE mounts apply uniformly to every tile of a given kind (e.g.
  // every TERMINAL tile emits a hologram). Registered once at load.
  var _mounts = {};

  // INSTANCE mount registry — per-floor, per-coord overrides. Keyed
  // by floorId → "x,y" → frozen config. Used by window vignettes
  // where every (x,y) has a distinct billboard (🍺 vs 🗝️ vs 🕯️) even
  // though the underlying tile type (WINDOW_TAVERN) is the same.
  // Populated on floor load from floorData.emojiMounts / windowScenes.
  // Cleared via clearFloor(floorId) on floor transition.
  var _instances = {};

  // Tracks the floor id most recently passed to buildSprites(). The
  // raycaster's z-bypass path reads this to look up instance mounts
  // without having to thread the floor id through every call site.
  var _currentFloorId = null;

  // Per-floor sprite list cache — invalidated on clearCache() or
  // whenever buildSprites() sees a different floorId than last time.
  var _cachedFloorId = null;
  var _cachedSprites = [];

  // Shared animation clock (ms since epoch). animate() updates this
  // and walks _cachedSprites refreshing each sprite's bobY in place.
  var _now = 0;

  /**
   * Register a mount on a tile type. If the tile is already
   * registered, the new config replaces the old one. Config fields:
   *
   *   tile        (required)  tile id number (TILES.*)
   *   emoji       (required)  glyph to billboard
   *   glow        default null           CSS color for glow halo
   *   glowRadius  default 0.5            halo radius scale (raycaster-sprites fmt)
   *   scale       default 0.5            sprite size multiplier
   *   anchor      default 'floor'        'floor' | 'cavity' | 'surface'
   *   lift        default 0              world-Y offset above anchor plane
   *   recess      default 0.5            position within tile along view axis;
   *                                       0 = near face, 0.5 = tile center,
   *                                       1.0 = far face. Used by raycaster
   *                                       z-bypass to keep the sprite from
   *                                       being culled by the tile's own
   *                                       wall column while still allowing
   *                                       deeper geometry to occlude it.
   *   bob         default 0              bob amplitude (world units)
   *   bobPeriod   default 3200           bob period (ms)
   *   glint       default false          enable specular glint animation
   *   overlay     default null           secondary emoji overlay (like
   *                                       WindowSprites' 🐉 over 🔥 trick)
   *   noFogFade   default false          skip fog tinting (for holograms
   *                                       that should read as self-lit)
   *   groundLevel default false          pass through to raycaster-sprites
   *                                       so the billboard plants at floor
   *                                       level rather than eye-center
   */
  function register(cfg) {
    if (cfg == null || cfg.tile == null) return;
    _mounts[cfg.tile] = Object.freeze({
      tile:        cfg.tile,
      emoji:       cfg.emoji || '\u2754',
      overlay:     cfg.overlay || null,
      glow:        cfg.glow || null,
      glowRadius:  (cfg.glowRadius != null) ? cfg.glowRadius : 0.5,
      scale:       (cfg.scale != null) ? cfg.scale : 0.5,
      anchor:      cfg.anchor || 'floor',
      lift:        (cfg.lift != null) ? cfg.lift : 0,
      recess:      (cfg.recess != null) ? cfg.recess : 0.5,
      bob:         (cfg.bob != null) ? cfg.bob : 0,
      bobPeriod:   (cfg.bobPeriod != null) ? cfg.bobPeriod : 3200,
      glint:       cfg.glint === true,
      noFogFade:   cfg.noFogFade === true,
      groundLevel: cfg.groundLevel === true,
      crtScanlines:cfg.crtScanlines === true
    });
    // Registry changed — invalidate the sprite cache so the next
    // buildSprites() rebuilds with the new config.
    _cachedFloorId = null;
  }

  /**
   * Register a per-coord instance mount. Same config fields as
   * register(), but the mount applies only at (x,y) on floorId. If
   * both an instance mount and a type mount exist for a tile, the
   * instance wins. Typical use: window vignettes, where windowScenes
   * declarations become one registerAt() call per facade tile.
   */
  function registerAt(floorId, x, y, cfg) {
    if (cfg == null || floorId == null || x == null || y == null) return;
    if (!_instances[floorId]) _instances[floorId] = {};
    var key = x + ',' + y;
    _instances[floorId][key] = Object.freeze({
      emoji:       cfg.emoji || '\u2754',
      overlay:     cfg.overlay || null,
      glow:        cfg.glow || null,
      glowRadius:  (cfg.glowRadius != null) ? cfg.glowRadius : 0.5,
      scale:       (cfg.scale != null) ? cfg.scale : 0.5,
      anchor:      cfg.anchor || 'cavity',
      lift:        (cfg.lift != null) ? cfg.lift : 0,
      // Default 1.5: the sprite typically emits at (sprX,sprY) one
      // tile off the key (cavity vignettes: facade + interiorStep),
      // so spriteDist ≈ perpDist + 1. The raycaster-sprites z-test
      // is STRICT greater (`zBuffer[col] > dist`), so recess must
      // exceed 1.0 for the sprite to pass on the key-tile's columns.
      // 1.5 puts the threshold a half-tile past the sprite center.
      recess:      (cfg.recess != null) ? cfg.recess : 1.5,
      bob:         (cfg.bob != null) ? cfg.bob : 0,
      bobPeriod:   (cfg.bobPeriod != null) ? cfg.bobPeriod : 3200,
      glint:       cfg.glint === true,
      noFogFade:   cfg.noFogFade === true,
      groundLevel: cfg.groundLevel === true,
      crtScanlines:cfg.crtScanlines === true,
      // Per-instance hard render-distance cap. raycaster-sprites
      // culls the billboard when player-to-sprite distance exceeds
      // this value. Used by window vignettes so the cross-map read
      // respects shrubs / half-wall occluders that the z-buffer
      // can't distinguish from see-through freeform tiles. Null
      // means no cap (defer to the raycaster's renderDist fog).
      maxDist:     (cfg.maxDist != null) ? cfg.maxDist : null,
      // Extra fields not owned by type mounts — instance emits a
      // billboard at (sprX, sprY) which may differ from (x,y). For
      // windows, sprX/sprY is the interior-adjacent tile behind the
      // glass ("facade + interiorStep") so the vignette reads as
      // content INSIDE the building, with the glass pane in front.
      sprX:        (cfg.sprX != null) ? cfg.sprX : x,
      sprY:        (cfg.sprY != null) ? cfg.sprY : y
    });
    // Invalidate the sprite cache for this floor if it matches.
    if (floorId === _cachedFloorId) _cachedFloorId = null;
  }

  /**
   * Drop ALL instance mounts for a floor. Called by game.js on floor
   * transition so that descending into the Bazaar doesn't leave the
   * Promenade's 🍺 vignettes registered (they'd still try to look up
   * tiles at those coords on the new grid).
   */
  function clearFloor(floorId) {
    if (_instances[floorId]) delete _instances[floorId];
    if (floorId === _cachedFloorId) _cachedFloorId = null;
  }

  /** Look up a type mount by tile id. Returns the frozen config or null. */
  function getMount(tile) {
    return _mounts[tile] || null;
  }

  /**
   * Look up an instance mount at (x,y) on floorId. Returns frozen
   * config or null. Raycaster hot-path uses this to resolve the
   * per-tile recess for window vignettes.
   */
  function getMountAt(floorId, x, y) {
    var bucket = _instances[floorId];
    if (!bucket) return null;
    return bucket[x + ',' + y] || null;
  }

  /**
   * Combined lookup: instance mount at (x,y) on the current floor
   * (whichever floor was last passed to buildSprites) wins; falls
   * back to type mount by tile id. This is the raycaster's z-bypass
   * entry point — one call covers both window vignettes (per-coord)
   * and TERMINAL holograms (per-type) without the caller having to
   * thread floor id through the per-column hotpath.
   */
  function getMountAtOrType(x, y, tile) {
    if (_currentFloorId != null) {
      var bucket = _instances[_currentFloorId];
      if (bucket) {
        var inst = bucket[x + ',' + y];
        if (inst) return inst;
      }
    }
    return _mounts[tile] || null;
  }

  /** Fast predicate for raycaster hot loops (type mounts only). */
  function hasMount(tile) {
    return _mounts[tile] != null;
  }

  /**
   * Advance the animation clock. Called once per render frame from
   * game.js with the current timestamp. Updates bobY in place on
   * every cached sprite whose mount has a non-zero bob amplitude —
   * no allocation on the hot path.
   */
  function animate(now) {
    _now = now;
    var TWO_PI = Math.PI * 2;
    for (var i = 0; i < _cachedSprites.length; i++) {
      var s = _cachedSprites[i];
      if (s._mountBobAmp > 0) {
        var t = (now - s._mountBobPhase) / s._mountBobPeriod;
        s.bobY = Math.sin(t * TWO_PI) * s._mountBobAmp;
      }
    }
  }

  /**
   * Scan the grid for tiles with registered mounts and return the
   * sprite list. Result is cached by floorId; repeat calls with the
   * same floorId return the cached array (same reference) so game.js
   * can safely animate() + push into _sprites without redoing work.
   */
  function buildSprites(floorId, grid, w, h) {
    // Track the floor id for raycaster getMountAtOrType lookups even
    // when the sprite cache hits — the raycaster needs this every
    // frame, not just on floor transitions.
    _currentFloorId = floorId;
    if (floorId === _cachedFloorId) return _cachedSprites;
    _cachedSprites = [];
    _cachedFloorId = floorId;
    if (!grid) return _cachedSprites;
    // Pass 1: type mounts — scan the grid and emit one sprite per
    // matching tile. Skip tiles that also have an instance mount at
    // the same (x,y) to avoid double emission.
    var floorInstances = _instances[floorId] || null;
    for (var y = 0; y < h; y++) {
      var row = grid[y];
      if (!row) continue;
      for (var x = 0; x < w; x++) {
        var t = row[x];
        var m = _mounts[t];
        if (!m) continue;
        if (floorInstances && floorInstances[x + ',' + y]) continue;
        _emit(x, y, m);
      }
    }
    // Pass 2: instance mounts — iterate the per-floor registry. The
    // instance's sprX/sprY is the emission coord, which may differ
    // from the registered (x,y) key (windows: sprite sits one tile
    // inside the facade behind the glass).
    if (floorInstances) {
      for (var key in floorInstances) {
        if (!Object.prototype.hasOwnProperty.call(floorInstances, key)) continue;
        var parts = key.split(',');
        var gx = parseInt(parts[0], 10);
        var gy = parseInt(parts[1], 10);
        if (isNaN(gx) || isNaN(gy)) continue;
        _emit(gx, gy, floorInstances[key]);
      }
    }
    return _cachedSprites;
  }

  /**
   * Emit a sprite record for a single (gx, gy) cell with mount m.
   * World X/Y centered on the tile. yAlt is computed from anchor
   * mode: 'floor' places the sprite's baseline at world Y 0 and
   * lets `lift` raise its center; 'cavity' and 'surface' both use
   * `lift` directly as the sprite-center world Y.
   *
   * Bob phase is deterministically hashed from grid coords so
   * neighbouring terminals don't bob in sync — the hologram room
   * reads as "many independent screens" rather than one heartbeat.
   */
  function _emit(gx, gy, m) {
    // Match MailboxSprites / WindowSprites convention: emit raw grid
    // coords. _renderSprites() in raycaster-sprites adds 0.5 to center
    // the billboard on the tile. Double-adding (gx+0.5) pushes the
    // sprite a half-tile southeast — the "offset to one side" bug.
    //
    // Instance mounts may override the sprite emission position via
    // sprX/sprY (window vignettes place the billboard one tile INSIDE
    // the facade, behind the glass, so the raycaster renders it at
    // perpDist + recess and it reads as interior content behind the
    // mullion grid).
    var sx = (m.sprX != null) ? m.sprX : gx;
    var sy = (m.sprY != null) ? m.sprY : gy;
    var yAlt = 0;
    if (m.anchor === 'floor') {
      // Floor-anchored: sprite center is lifted above floor by `lift`.
      // At lift=0 the sprite plants at the horizon (eye level).
      yAlt = m.lift;
    } else {
      // 'cavity' and 'surface' both treat lift as the sprite's
      // vertical center in world Y. For cavity (window vignette)
      // this is typically 0.8; for surface (tabletop item) this
      // matches the cap's top-plane elevation (TABLE: 0.52).
      yAlt = m.lift;
    }
    var phase = ((gx * 197 + gy * 563) % m.bobPeriod + m.bobPeriod) % m.bobPeriod;
    _cachedSprites.push({
      // Sprite fields consumed by raycaster-sprites.renderSprites():
      x:            sx,
      y:            sy,
      emoji:        m.emoji,
      emojiOverlay: m.overlay,
      scale:        m.scale,
      bobY:         0,
      yAlt:         yAlt,
      glow:         m.glow,
      glowRadius:   m.glowRadius,
      groundLevel:  m.groundLevel,
      noFogFade:    m.noFogFade,
      crtScanlines: m.crtScanlines,
      maxDist:      m.maxDist || null,
      // EmojiMount-private animation state — leading underscore marks
      // them as "don't read from the renderer, set by animate()":
      _mountBobAmp:    m.bob,
      _mountBobPeriod: m.bobPeriod,
      _mountBobPhase:  phase,
      _mountTile:      m.tile
    });
  }

  /** Invalidate the per-floor sprite cache (call on floor transition). */
  function clearCache() {
    _cachedFloorId = null;
    _cachedSprites.length = 0;
  }

  // ── Built-in mounts ─────────────────────────────────────────────────
  // TERMINAL (tile 36): Data terminal with holographic display. A
  // floor-anchored 💻 billboard rises from inside the pedestal well
  // with a sickly green CRT-style glow. The TERMINAL_RIM back-layer
  // lip (auto-attached by FloorManager) partially obscures the
  // emoji from side angles, so the hologram reads as *inside* the
  // terminal rather than floating above it.
  //
  // Lift 0.35 puts the sprite's eye-level plane (yAlt 0 = horizon)
  // at 0.35 world units above the floor — roughly the elevation of
  // the TERMINAL_RIM's top plane (0.54), so the emoji's vertical
  // center sits just below the rim edge and its top half crests
  // above. Bob 0.02 is a subtle pulse; glint stays off (the steady
  // green glow is its own animation).
  if (typeof TILES !== 'undefined' && TILES.TERMINAL != null) {
    register({
      tile:       TILES.TERMINAL,
      emoji:      '\uD83D\uDCBB',   // 💻 laptop (stand-in for "retrofuturistic CRT")
      glow:       '#4aff88',
      glowRadius: 1.2,
      scale:      0.55,
      anchor:     'floor',
      lift:      -0.38,  // Nest the 💻 DOWN into the pedestal well.
                         // Measured against the SpatialDebug sightline
                         // the emoji's billboard center should sit
                         // ~0.2 BELOW the pedestal top (top = world-Y
                         // 0.0 on the tile's sightline; emoji center ≈
                         // -0.2). The rim's upfolded sides then clip
                         // the emoji's lower edge, and the inner glow
                         // will dramatize the "hologram rising from
                         // inside the terminal" read. lift is in
                         // sprite-projection units, not raw world-Y —
                         // tune against the overlay, not against
                         // wallHeight numbers.
      recess:     0.75,  // Push z-bypass past adjacent-tile center so the
                         // hologram doesn't cull when the player stands
                         // one tile away (sprite dist ≈ 1.0, perpDist to
                         // near face ≈ 0.5 → 0.5 + 0.75 = 1.25 > 1.0).
      bob:        0.02,
      bobPeriod:  2600,
      glint:      false,
      crtScanlines: true, // 1px dim horizontal lines overlaid on the
                          // billboard — reads as a CRT raster scan.
      noFogFade:  false   // hologram still fades with distance so
                          // terminals read as part of the environment
    });
  }

  return Object.freeze({
    register:        register,
    registerAt:      registerAt,
    clearFloor:      clearFloor,
    getMount:        getMount,
    getMountAt:      getMountAt,
    getMountAtOrType:getMountAtOrType,
    hasMount:        hasMount,
    animate:         animate,
    buildSprites:    buildSprites,
    clearCache:      clearCache
  });
})();

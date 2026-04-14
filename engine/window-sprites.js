/**
 * WindowSprites — Owns the WINDOW_TAVERN freeform cavity: the
 * interior billboard sprite, the per-floor exterior-face cache, and
 * the `window_tavern_interior` gap filler that paints glass / mullion
 * cross on only the facade-facing face of the tile.
 *
 * Window depth contract (see docs/LIVING_WINDOWS_ROADMAP.md §4):
 *
 *   - A WINDOW_TAVERN tile is a freeform sandwich with a 0.75-unit
 *     cavity at roughly chin height. The cavity is painted by the
 *     gap filler registered here, and the interior billboard sprite
 *     (🍺 emoji) is emitted through the raycaster's z-bypass path
 *     inside the cavity.
 *
 *   - A window cavity is NOT a four-sided hole. Of the four faces
 *     of the tile, TWO are the glass pane itself — the exterior
 *     face (the street side, viewed by a passerby) and its opposite
 *     face (the same pane viewed from inside the building). The
 *     remaining two faces are perpendicular to the pane and sit
 *     inside the building mass as solid masonry. The raycaster's
 *     gap filler gets called for every column whose ray passes
 *     through the cavity regardless of which face the ray crossed,
 *     so the filler has to know which face it's painting: glass
 *     content (amber wash + mullion cross, with the cavity left
 *     transparent so the billboard sprite + world beyond can render
 *     through) on the two pane faces, opaque masonry on the other
 *     two. The `_exteriorFaces` map below records the exterior face
 *     per tile; the filler derives the interior pane face as the
 *     opposite direction (0↔2, 1↔3) and treats both as glass.
 *
 *   - Exterior-face detection is a grid heuristic run once per floor
 *     at buildSprites() time: a window's exterior face is the one
 *     whose neighbor is not opaque (walkable EMPTY / ROAD / PATH /
 *     etc.), with interior faces being WALL or similar building mass.
 *     If more than one neighbor is walkable, the N/S axis is
 *     preferred before E/W, and the side whose opposite neighbor is
 *     opaque wins (the window "leans" into the wall mass). This
 *     works for the current Promenade placements (walls N, street S)
 *     and for any future facade where the building presents a solid
 *     back to the window.
 *
 * Direction convention (CLAUDE.md): 0=EAST, 1=SOUTH, 2=WEST, 3=NORTH.
 *
 * Layer 3 (depends on: TILES, Raycaster)
 */
var WindowSprites = (function () {
  'use strict';

  // ── Sprite config ──────────────────────────────────────────────
  var INTERIOR = {
    emoji: '\uD83C\uDF7A',   // 🍺 (beer mug — reads as tavern interior)
    scale: 0.42,              // Small-ish — window is a vignette, not a
                              // dominating landmark. Large enough to read
                              // at the three-tile-away approach distance.
    glow: '#ffaa33',          // Warm amber — sodium-lamp interior light
    glowRadius: 2             // Gentle halo — light spilling onto street
  };

  // ── Bob animation ──────────────────────────────────────────────
  // Barely-there sway so the vignette feels lived-in without looking
  // like a physics bug. Slower + smaller amplitude than the dump truck.
  var BOB_AMP    = 0.3;       // Subtle drift — patrons shuffling
  var BOB_PERIOD = 3200;      // Slow cycle — relaxed tavern mood

  // ── Glint animation ────────────────────────────────────────────
  // The glass glint streak rotates through - \ | / - on a slow cycle
  // that tracks the skybox cloud drift pace — languid enough that the
  // idle rock reads as ambient reflected light, not a metronome.
  var GLINT_PERIOD = 20000;   // ms — one full rotation (~skybox cloud drift)
  var _glintClock  = 0;       // updated by animate() each frame

  // ── Cache ───────────────────────────────────────────────────────
  var _cachedFloorId  = null;
  var _cachedSprites  = [];
  // Per-tile exterior-face index keyed by "x,y". Cleared when the
  // floor changes. Read by the gap filler on every column.
  var _exteriorFaces  = {};
  // Per-tile wall texture override keyed by "x,y" → TextureAtlas ID.
  // Built from BuildingRegistry.wallTexture via windowScenes. The
  // raycaster reads this to swap the freeform band texture per window.
  var _windowTextures = {};
  // Per-tile mullion color keyed by "x,y" → { r, g, b }. Built from
  // BuildingRegistry.mullionStyle. The gap filler reads this to tint
  // the mullion cross per building material.
  var _windowMullions = {};

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Compute the exterior face index (0=E / 1=S / 2=W / 3=N) for a
   * WINDOW_TAVERN tile at (x,y) on `grid`.
   *
   * Primary signal: **street scoring.** Walk up to STREET_WALK_MAX
   * tiles in each cardinal direction (stopping at the first opaque
   * blocker) and count how many of the visited tiles are ROAD / PATH
   * / GRASS. The direction with the highest street count is the
   * outdoor side — streets are long open runs of paving, building
   * interiors are walkable but typically EMPTY floor with no paving.
   * This handles the common case where BOTH the interior (behind the
   * facade wall) and the exterior (the street) are walkable empty
   * tiles, which the pure "walkable neighbor" heuristic can't
   * distinguish.
   *
   * Fallback: if no direction has any street tiles, use the simpler
   * "walkable pair" heuristic — axis where one side is walkable and
   * the opposite is opaque wins, with N/S preferred over E/W.
   *
   * Returns -1 only if no signal in any direction can be found; the
   * filler treats -1 as "paint as solid wall on every face" so
   * unrecognized placements fail safe rather than leaking interior
   * content through all four sides.
   */
  function _detectExteriorFace(grid, gridW, gridH, x, y) {
    var isOpaque = (typeof TILES !== 'undefined' && TILES.isOpaque)
      ? TILES.isOpaque
      : function (_) { return false; };

    // Street tile constants — read from TILES if available, else
    // fall back to the canonical values (see engine/tiles.js).
    var T_ROAD  = (typeof TILES !== 'undefined' && TILES.ROAD  != null) ? TILES.ROAD  : 32;
    var T_PATH  = (typeof TILES !== 'undefined' && TILES.PATH  != null) ? TILES.PATH  : 33;
    var T_GRASS = (typeof TILES !== 'undefined' && TILES.GRASS != null) ? TILES.GRASS : 34;

    // How far to walk in each direction when scoring streetness.
    // 8 tiles is enough to step off a facade into a visible street
    // run without traversing most of the map.
    var STREET_WALK_MAX = 8;

    // Neighbor lookup — returns the tile value or -1 if out of bounds.
    function _nb(nx, ny) {
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) return -1;
      if (!grid[ny]) return -1;
      var t = grid[ny][nx];
      return (typeof t === 'number') ? t : -1;
    }
    function _walkable(nx, ny) {
      var t = _nb(nx, ny);
      return (t >= 0 && !isOpaque(t));
    }
    function _isStreet(t) {
      return (t === T_ROAD || t === T_PATH || t === T_GRASS);
    }

    // Walk a ray in (dx, dy) from (x+dx, y+dy) and count how many
    // tiles are street before we hit an opaque blocker or run out
    // of grid. The IMMEDIATE neighbor must be walkable for the
    // direction to count at all — a window can't face a wall.
    function _scoreStreet(dx, dy) {
      var firstX = x + dx, firstY = y + dy;
      if (!_walkable(firstX, firstY)) return -1;
      var score = 0;
      for (var i = 1; i <= STREET_WALK_MAX; i++) {
        var nx = x + dx * i, ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) break;
        if (!grid[ny]) break;
        var t = grid[ny][nx];
        if (typeof t !== 'number') break;
        if (isOpaque(t)) break;
        if (_isStreet(t)) score++;
      }
      return score;
    }

    // Direction order matches the CLAUDE.md convention:
    // 0=EAST, 1=SOUTH, 2=WEST, 3=NORTH.
    var dirs = [
      { dx:  1, dy:  0, face: 0 },
      { dx:  0, dy:  1, face: 1 },
      { dx: -1, dy:  0, face: 2 },
      { dx:  0, dy: -1, face: 3 }
    ];

    var bestFace = -1;
    var bestScore = 0;
    for (var i = 0; i < dirs.length; i++) {
      var s = _scoreStreet(dirs[i].dx, dirs[i].dy);
      if (s > bestScore) {
        bestScore = s;
        bestFace  = dirs[i].face;
      }
    }
    if (bestFace >= 0) return bestFace;

    // ── Fallback: walkable-pair heuristic ─────────────────────────
    // Used for floors with no street tiles (interior scenes).
    var eastWalkable  = _walkable(x + 1, y);
    var westWalkable  = _walkable(x - 1, y);
    var northWalkable = _walkable(x,     y - 1);
    var southWalkable = _walkable(x,     y + 1);

    if (northWalkable && !southWalkable) return 3;
    if (southWalkable && !northWalkable) return 1;
    if (eastWalkable  && !westWalkable)  return 0;
    if (westWalkable  && !eastWalkable)  return 2;

    if (northWalkable || southWalkable) return southWalkable ? 1 : 3;
    if (eastWalkable  || westWalkable)  return eastWalkable  ? 0 : 2;
    return -1;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Build sprites for every WINDOW_TAVERN tile on the current floor.
   * Cached per floorId — rebuilt only when the floor changes.
   *
   * Two jobs:
   *   1. Populate the exterior-face map consumed by the gap filler.
   *   2. Emit one billboard sprite per window — positioned at the
   *      **interior-adjacent tile** (one step behind the glass into the
   *      building facade) when `windowScenes` is provided, or at the
   *      window tile itself as a fallback for floors that haven't
   *      declared scenes yet.
   *
   * @param {string} floorId
   * @param {Array<Array<number>>} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {Object} [explicitFaces] — "x,y" → face index map (§4.3)
   * @param {Array}  [windowScenes]  — scene declarations (§4.4)
   * @returns {Array} sprite objects for the raycaster
   */
  function buildSprites(floorId, grid, gridW, gridH, explicitFaces, windowScenes) {
    // Lazy filler registration — safe to call repeatedly, costs
    // nothing once `_registered` flips true on the first successful
    // call. See comment on _ensureFillerRegistered.
    _ensureFillerRegistered();

    if (floorId === _cachedFloorId) return _cachedSprites;

    _cachedSprites  = [];
    _exteriorFaces  = {};
    _windowTextures = {};
    _windowMullions = {};
    _cachedFloorId  = floorId;

    if (!grid || !gridW || !gridH) return _cachedSprites;

    var winTile = (typeof TILES !== 'undefined' && TILES.WINDOW_TAVERN)
      ? TILES.WINDOW_TAVERN : 73;

    // ── Pass 1: populate exterior-face cache for every window tile ──
    // The gap filler needs this on every column draw, regardless of
    // whether the sprite uses windowScenes or fallback placement.
    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] !== winTile) continue;
        var key = gx + ',' + gy;
        var face;
        if (explicitFaces && typeof explicitFaces[key] === 'number') {
          face = explicitFaces[key];
        } else {
          face = _detectExteriorFace(grid, gridW, gridH, gx, gy);
        }
        _exteriorFaces[key] = face;
      }
    }

    // ── Pass 2: emit billboard sprites ──────────────────────────────
    // When windowScenes is provided, each scene entry drives a sprite
    // positioned at (facade + interiorStep) with the vignette recipe
    // from BuildingRegistry. Any WINDOW_TAVERN tile NOT covered by a
    // scene entry gets the old fallback (sprite at the window tile
    // with the default INTERIOR config).

    // Build a set of covered facade tiles for the fallback check.
    var _coveredFacades = {};

    if (windowScenes && windowScenes.length > 0) {
      for (var si = 0; si < windowScenes.length; si++) {
        var scene = windowScenes[si];
        var fx = scene.facade.x;
        var fy = scene.facade.y;
        _coveredFacades[fx + ',' + fy] = true;

        // Resolve building material for this window's bands + mullion.
        var bldgId = scene.building || null;
        var bldg   = (bldgId && typeof BuildingRegistry !== 'undefined')
                   ? BuildingRegistry.get(bldgId) : null;
        if (bldg) {
          var fKey = fx + ',' + fy;
          if (bldg.wallTexture)  _windowTextures[fKey] = bldg.wallTexture;
          if (bldg.mullionStyle) _windowMullions[fKey] = BuildingRegistry.getMullionStyle(bldg.mullionStyle);
        }

        // Resolve the vignette recipe — from BuildingRegistry if
        // available, else fall back to the default INTERIOR config.
        var vKey  = scene.vignette || null;
        var vData = null;
        if (vKey && typeof BuildingRegistry !== 'undefined') {
          vData = BuildingRegistry.getVignette(vKey);
        }
        var emoji = vData ? vData.emoji     : INTERIOR.emoji;
        var scale = vData ? vData.scale     : INTERIOR.scale;
        var glow  = vData ? vData.glow      : INTERIOR.glow;
        var glowR = vData ? vData.glowRadius : INTERIOR.glowRadius;

        // Sprite position: one step behind the glass into the facade.
        var sprX = fx + (scene.interiorStep ? scene.interiorStep.dx : 0);
        var sprY = fy + (scene.interiorStep ? scene.interiorStep.dy : 0);

        // Vignette altitude above the player eye (world units). Each
        // window type opens its gap at a different world-Y range, and
        // the sprite has to rise out of the horizon and sit inside
        // that slot. Eye sits at altitude 0.5 (mid of the base 1.0
        // wall). Slot centers — for a 3.5-tall building facade —
        // are:
        //   shop / tavern  hLower 0.40 → whMult-hUpper 1.15   center 0.775
        //   bay            hLower 0.55 → whMult-hUpper 1.25   center 0.900
        //   slit           hLower 0.50 → whMult-hUpper 1.70   center 1.100
        // yAlt = slotCenter − eyeAlt. Positive lifts the sprite on
        // screen; the raycaster projects this with (h / dist) so the
        // vignette tracks the gap as the player approaches.
        var wType = bldg ? bldg.windowType : null;
        var yAlt  = 0.275;                    // shop / tavern default
        if (wType === 'bay')  yAlt = 0.40;
        if (wType === 'slit') yAlt = 0.60;

        _cachedSprites.push({
          x: sprX,
          y: sprY,
          emoji:        emoji,
          emojiOverlay: null,
          scale:        scale,
          glow:         glow,
          glowRadius:   glowR,
          windowTavern: true,
          noFogFade:    false,
          yAlt:         yAlt,
          bobY:         0
        });
      }
    }

    // Fallback: any WINDOW_TAVERN tile without a scene entry gets a
    // sprite at the window tile itself (Phase 0 behavior). This keeps
    // windows working on floors that haven't declared windowScenes yet.
    for (var fy2 = 0; fy2 < gridH; fy2++) {
      if (!grid[fy2]) continue;
      for (var fx2 = 0; fx2 < gridW; fx2++) {
        if (grid[fy2][fx2] !== winTile) continue;
        if (_coveredFacades[fx2 + ',' + fy2]) continue;

        _cachedSprites.push({
          x: fx2,
          y: fy2,
          emoji:        INTERIOR.emoji,
          emojiOverlay: null,
          scale:        INTERIOR.scale,
          glow:         INTERIOR.glow,
          glowRadius:   INTERIOR.glowRadius,
          windowTavern: true,
          noFogFade:    false,
          bobY:         0
        });
      }
    }

    return _cachedSprites;
  }

  /**
   * Animate sprites each render frame — subtle bob so the tavern
   * interior feels alive.
   *
   * @param {number} now — performance.now() or Date.now()
   */
  function animate(now) {
    // Feed the glint clock — consumed by the gap filler on every
    // column this frame. Runs even when there are no sprites (the
    // filler is registered independently and the clock costs nothing).
    _glintClock = now;

    if (_cachedSprites.length === 0) return;
    var phase  = (now % BOB_PERIOD) / BOB_PERIOD;
    var offset = Math.sin(phase * Math.PI * 2) * BOB_AMP;
    for (var i = 0; i < _cachedSprites.length; i++) {
      _cachedSprites[i].bobY = offset;
    }
  }

  /**
   * No horizontal sway — tavern patrons stay seated.
   */
  function getAnimatedX(sprite) {
    return 0;
  }

  /**
   * Returns the cached exterior face index for the window at (x,y),
   * or -1 if the tile is unknown or had no clear exterior neighbor.
   */
  function getExteriorFace(x, y) {
    var key = x + ',' + y;
    var f = _exteriorFaces[key];
    return (typeof f === 'number') ? f : -1;
  }

  /**
   * Clear the cache (call on floor transition).
   */
  function clearCache() {
    _cachedFloorId  = null;
    _cachedSprites  = [];
    _exteriorFaces  = {};
    _windowTextures = {};
    _windowMullions = {};
  }

  // ── Gap filler ──────────────────────────────────────────────────
  // The filler closes over _exteriorFaces (via getExteriorFace) so
  // every column can look up its tile's exterior face and decide
  // whether to paint the glass pane or fall back to an opaque wall
  // fill. The exterior face = the one whose neighbor is the street;
  // painting glass content on the other faces is what previously
  // gave the window the "mailbox cut through every side of the
  // block" look.
  //
  // Three-face model for the window cavity:
  //   EXTERIOR face  → glass pane (mullion + amber + glint)
  //   INTERIOR face  → transparent (no fill, back layers show through)
  //   SIDE faces     → opaque wall masonry (close the tile edges)
  // The window reads as a thin glass pane on the building facade:
  // mullion on the front, see-through from front to back, solid
  // wall on the edges where the tile meets its neighbours.
  function _windowTavernInteriorFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var exteriorFace = getExteriorFace(info.mapX, info.mapY);
    var interiorFace = (exteriorFace >= 0) ? ((exteriorFace + 2) % 4) : -1;

    // Three face treatments:
    //   Exterior face  → glass pane (mullion + amber wash + glint)
    //   Interior face  → nothing (leave cavity transparent, see-through)
    //   Side faces     → opaque wall masonry (close the tile edges)

    // ── Interior face: leave transparent ─────────────────────────
    // The back of the glass pane is open — the cavity stays clear
    // so back-layer geometry (sky, far walls) shows through. No
    // fill, no mullion. The player looking in from the street sees
    // through the glass; the window reads as a thin pane, not a
    // full-tile-depth cube.
    if (exteriorFace >= 0 && hitFace === interiorFace) {
      return;
    }

    // ── Side faces: paint as solid wall ──────────────────────────
    // The two perpendicular faces (tile edges visible when looking
    // at the window edge-on) fill with opaque wall-colored masonry
    // so the freeform cavity doesn't leak. Color is derived from
    // the tile's texture brightness + fog to match adjacent bands.
    if (exteriorFace < 0 || hitFace !== exteriorFace) {
      var bAdjW = info.brightness;
      var wR = Math.round(70 * bAdjW);
      var wG = Math.round(55 * bAdjW);
      var wB = Math.round(40 * bAdjW);
      var fFW = info.fogFactor;
      if (fFW > 0) {
        wR = Math.round(wR * (1 - fFW) + info.fogColor.r * fFW);
        wG = Math.round(wG * (1 - fFW) + info.fogColor.g * fFW);
        wB = Math.round(wB * (1 - fFW) + info.fogColor.b * fFW);
      }
      ctx.fillStyle = 'rgb(' + wR + ',' + wG + ',' + wB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Exterior face: glass pane with mullion ────────────────────
    var bAdj   = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);

    // 1. Amber interior wash — warm sodium-lamp tint. This is the
    //    only transparent layer; everything that follows is opaque
    //    so the mullions and frame don't inherit the wash's alpha.
    var warmA = 0.14 * bAdj * fogFade;
    if (warmA > 0.01) {
      ctx.fillStyle = 'rgba(255, 180, 60, ' + warmA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 2. Parallax glint — a bright streak on the glass surface that
    //    rotates through the states  - \ | / -  as the player moves
    //    past the window, selling the illusion of reflected light
    //    catching at different angles. The streak's angle is driven
    //    by wallX (encodes the ray's lateral hit position on the face)
    //    with a slow time shimmer on top.
    //
    //    The streak is a 2-pixel-tall bright white band whose vertical
    //    center shifts based on wallX × slope. The slope itself
    //    oscillates slowly over time (cyclone nozzle math) so the
    //    glint revolves even when the player is standing still.
    //
    //    The glint is drawn with low alpha so it doesn't overpower
    //    the mullion cross painted on top of it in the next pass.
    if (gapH >= 4) {
      var _now      = _glintClock;
      var _wallX    = info.wallX;
      // Slow rotation: full cycle every ~4.2 seconds.
      // The slope ranges from -1 to +1 (maps to / through - through \).
      var _rotPhase = (_now % GLINT_PERIOD) / GLINT_PERIOD;
      var _slope    = Math.sin(_rotPhase * Math.PI * 2);
      // Vertical center offset within the gap: wallX drives parallax.
      // At wallX=0.5 (face center) the streak is at gap midpoint.
      // Slope tilts it: positive slope → streak rises left, drops right.
      var _yNorm    = 0.5 + (_wallX - 0.5) * _slope * 0.35;
      // Clamp to inner 80% of gap so streak doesn't touch frame edges.
      if (_yNorm < 0.1) _yNorm = 0.1;
      if (_yNorm > 0.9) _yNorm = 0.9;
      var _glintY   = gapStart + Math.floor(_yNorm * gapH);
      // Intensity: brightest near wallX ≈ 0.35 (off-center, like a
      // real specular highlight), fading to 0 at edges.
      var _xDist    = Math.abs(_wallX - 0.35);
      var _glintA   = Math.max(0, 1 - _xDist * 3.5) * 0.45 * bAdj * fogFade;
      if (_glintA > 0.02) {
        // 6px tall white band (3× the original 2px — reads as a
        // chunky reflected-light block, closer to Minecraft glass).
        var _gH = Math.min(6, gapH - (_glintY - gapStart));
        if (_gH > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, ' + _glintA.toFixed(3) + ')';
          ctx.fillRect(col, _glintY, 1, _gH);
        }
      }
    }

    // 3. Mullion cross — divided-pane frame drawn with opaque
    //    (renumbered from 2 after glint insertion)
    //    rgb() so the dark wood isn't swallowed by the amber wash.
    //    Brightness and fog are baked into the RGB channels; alpha
    //    stays 1.0. Vertical mullion at wallX ≈ 0.5; horizontal
    //    mullion at the slot's vertical midpoint, min 2 px thick.
    var wallX = info.wallX;
    var mullionHalfW = 0.05 + 0.03 / Math.max(0.6, info.perpDist);
    var vertMullion = (wallX >= 0.5 - mullionHalfW && wallX <= 0.5 + mullionHalfW);

    // Per-tile mullion color from BuildingRegistry, or default wood.
    var mRGB = _windowMullions[info.mapX + ',' + info.mapY] || null;
    var mR = mRGB ? mRGB.r : 48;
    var mG = mRGB ? mRGB.g : 28;
    var mB = mRGB ? mRGB.b : 14;
    mR = Math.round(mR * bAdj);
    mG = Math.round(mG * bAdj);
    mB = Math.round(mB * bAdj);
    var fF = info.fogFactor;
    if (fF > 0) {
      mR = Math.round(mR * (1 - fF) + info.fogColor.r * fF);
      mG = Math.round(mG * (1 - fF) + info.fogColor.g * fF);
      mB = Math.round(mB * (1 - fF) + info.fogColor.b * fF);
    }
    var mullionColor = 'rgb(' + mR + ',' + mG + ',' + mB + ')';

    if (vertMullion) {
      ctx.fillStyle = mullionColor;
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    var midY = gapStart + Math.floor(gapH * 0.5);
    var hMullionThickness = Math.max(2, Math.floor(info.lineH / info.wallHeightMult * 0.05));
    var hmTop = midY - Math.floor(hMullionThickness / 2);
    if (hmTop >= gapStart && hmTop + hMullionThickness <= gapStart + gapH) {
      ctx.fillStyle = mullionColor;
      ctx.fillRect(col, hmTop, 1, hMullionThickness);
    }

    // 4. Top + bottom frame lines — 1px opaque dark bands at the
    //    slot's top and bottom edges (the stop bead).
    var fR = Math.round(mR * 0.6);
    var fG = Math.round(mG * 0.6);
    var fB = Math.round(mB * 0.6);
    ctx.fillStyle = 'rgb(' + fR + ',' + fG + ',' + fB + ')';
    ctx.fillRect(col, gapStart, 1, 1);
    ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
  }

  // ── WINDOW_SHOP gap filler ─────────────────────────────────────
  // Commercial storefront — large plate glass with thin iron muntins.
  // The glass dominates; the bars are minimal 1px verticals at
  // wallX ≈ 0.25, 0.50, 0.75 with iron-grey color. Same three-face
  // model as TAVERN (exterior=glass, interior=transparent, sides=masonry).
  function _windowShopFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var exteriorFace = getExteriorFace(info.mapX, info.mapY);
    var interiorFace = (exteriorFace >= 0) ? ((exteriorFace + 2) % 4) : -1;

    // Interior face: transparent (see-through)
    if (exteriorFace >= 0 && hitFace === interiorFace) return;

    // Side faces: opaque masonry
    if (exteriorFace < 0 || hitFace !== exteriorFace) {
      var bAdjW = info.brightness;
      var wR = Math.round(70 * bAdjW);
      var wG = Math.round(55 * bAdjW);
      var wB = Math.round(40 * bAdjW);
      var fFW = info.fogFactor;
      if (fFW > 0) {
        wR = Math.round(wR * (1 - fFW) + info.fogColor.r * fFW);
        wG = Math.round(wG * (1 - fFW) + info.fogColor.g * fFW);
        wB = Math.round(wB * (1 - fFW) + info.fogColor.b * fFW);
      }
      ctx.fillStyle = 'rgb(' + wR + ',' + wG + ',' + wB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Exterior face: plate glass with iron bars ──────────────
    var bAdj    = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);
    var wallX   = info.wallX;

    // 1. Amber interior wash — brighter than tavern (lit display case).
    var warmA = 0.20 * bAdj * fogFade;
    if (warmA > 0.01) {
      ctx.fillStyle = 'rgba(255, 190, 70, ' + warmA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 2. Parallax glint — same mechanic as TAVERN but on each of
    //    the 4 pane segments between the iron bars. The glint shifts
    //    per pane segment for extra parallax.
    if (gapH >= 4) {
      var _now2   = _glintClock;
      var _rot2   = ((_now2 % GLINT_PERIOD) / GLINT_PERIOD);
      var _slope2 = Math.sin(_rot2 * Math.PI * 2);
      // Determine which pane segment (0–3) this wallX falls in.
      var _seg    = Math.floor(wallX * 4);
      if (_seg > 3) _seg = 3;
      // Local wallX within the pane segment (0→1).
      var _localX = (wallX * 4) - _seg;
      var _yNorm2 = 0.5 + (_localX - 0.5) * _slope2 * 0.35;
      if (_yNorm2 < 0.1) _yNorm2 = 0.1;
      if (_yNorm2 > 0.9) _yNorm2 = 0.9;
      var _glintY2 = gapStart + Math.floor(_yNorm2 * gapH);
      var _xDist2  = Math.abs(_localX - 0.35);
      var _glintA2 = Math.max(0, 1 - _xDist2 * 3.5) * 0.40 * bAdj * fogFade;
      if (_glintA2 > 0.02) {
        var _gH2 = Math.min(4, gapH - (_glintY2 - gapStart));
        if (_gH2 > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, ' + _glintA2.toFixed(3) + ')';
          ctx.fillRect(col, _glintY2, 1, _gH2);
        }
      }
    }

    // 3. Iron bars — 3 thin vertical muntins at wallX ≈ 0.25, 0.50, 0.75.
    //    1px each, iron grey. These are thin enough to read as "mostly glass."
    var barHalfW = 0.02 + 0.01 / Math.max(0.6, info.perpDist);
    var isBar = (wallX >= 0.25 - barHalfW && wallX <= 0.25 + barHalfW) ||
                (wallX >= 0.50 - barHalfW && wallX <= 0.50 + barHalfW) ||
                (wallX >= 0.75 - barHalfW && wallX <= 0.75 + barHalfW);

    // Iron color — always cold grey regardless of building mullion style.
    var iR = Math.round(70 * bAdj);
    var iG = Math.round(72 * bAdj);
    var iB = Math.round(78 * bAdj);
    var fF2 = info.fogFactor;
    if (fF2 > 0) {
      iR = Math.round(iR * (1 - fF2) + info.fogColor.r * fF2);
      iG = Math.round(iG * (1 - fF2) + info.fogColor.g * fF2);
      iB = Math.round(iB * (1 - fF2) + info.fogColor.b * fF2);
    }

    if (isBar) {
      ctx.fillStyle = 'rgb(' + iR + ',' + iG + ',' + iB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 4. Top + bottom iron frame — 2px each.
    var frR = Math.round(iR * 0.7);
    var frG = Math.round(iG * 0.7);
    var frB = Math.round(iB * 0.7);
    ctx.fillStyle = 'rgb(' + frR + ',' + frG + ',' + frB + ')';
    ctx.fillRect(col, gapStart, 1, Math.min(2, gapH));
    if (gapH > 2) ctx.fillRect(col, gapStart + gapH - 2, 1, 2);
  }

  // ── WINDOW_BAY gap filler ─────────────────────────────────────
  // Residential bay window — warm amber wash + classic 2×2 wood
  // mullion cross. Cozy colonial look. The protrusion is handled
  // by negative recessD in the raycaster; this filler just paints
  // the glass interior.
  function _windowBayFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var exteriorFace = getExteriorFace(info.mapX, info.mapY);
    var interiorFace = (exteriorFace >= 0) ? ((exteriorFace + 2) % 4) : -1;

    // Interior face: transparent
    if (exteriorFace >= 0 && hitFace === interiorFace) return;

    // Side faces: building wall texture masonry (the beveled jambs).
    // Use a warmer brown for residential wood.
    if (exteriorFace < 0 || hitFace !== exteriorFace) {
      var bAdjW = info.brightness;
      var wR = Math.round(58 * bAdjW);
      var wG = Math.round(38 * bAdjW);
      var wB = Math.round(22 * bAdjW);
      var fFW = info.fogFactor;
      if (fFW > 0) {
        wR = Math.round(wR * (1 - fFW) + info.fogColor.r * fFW);
        wG = Math.round(wG * (1 - fFW) + info.fogColor.g * fFW);
        wB = Math.round(wB * (1 - fFW) + info.fogColor.b * fFW);
      }
      ctx.fillStyle = 'rgb(' + wR + ',' + wG + ',' + wB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Exterior face: warm colonial window ──────────────────
    var bAdj    = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);
    var wallX   = info.wallX;

    // 1. Warm amber wash — stronger than SHOP (cozy interior glow).
    var warmA = 0.22 * bAdj * fogFade;
    if (warmA > 0.01) {
      ctx.fillStyle = 'rgba(255, 170, 50, ' + warmA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 2. Parallax glint (subtle, residential).
    if (gapH >= 4) {
      var _now3   = _glintClock;
      var _rot3   = ((_now3 % GLINT_PERIOD) / GLINT_PERIOD);
      var _slope3 = Math.sin(_rot3 * Math.PI * 2);
      var _yNorm3 = 0.5 + (wallX - 0.5) * _slope3 * 0.25;
      if (_yNorm3 < 0.15) _yNorm3 = 0.15;
      if (_yNorm3 > 0.85) _yNorm3 = 0.85;
      var _glintY3 = gapStart + Math.floor(_yNorm3 * gapH);
      var _xDist3  = Math.abs(wallX - 0.40);
      var _glintA3 = Math.max(0, 1 - _xDist3 * 4) * 0.30 * bAdj * fogFade;
      if (_glintA3 > 0.02) {
        var _gH3 = Math.min(4, gapH - (_glintY3 - gapStart));
        if (_gH3 > 0) {
          ctx.fillStyle = 'rgba(255, 255, 240, ' + _glintA3.toFixed(3) + ')';
          ctx.fillRect(col, _glintY3, 1, _gH3);
        }
      }
    }

    // 3. Wood mullion cross — classic 2×2 colonial pane grid.
    //    Per-tile mullion color from BuildingRegistry, or default wood.
    var mullionHalfW = 0.06 + 0.03 / Math.max(0.6, info.perpDist);
    var vertMullion = (wallX >= 0.5 - mullionHalfW && wallX <= 0.5 + mullionHalfW);

    var mRGB = _windowMullions[info.mapX + ',' + info.mapY] || null;
    var mR = mRGB ? mRGB.r : 48;
    var mG = mRGB ? mRGB.g : 28;
    var mB = mRGB ? mRGB.b : 14;
    mR = Math.round(mR * bAdj);
    mG = Math.round(mG * bAdj);
    mB = Math.round(mB * bAdj);
    var fF3 = info.fogFactor;
    if (fF3 > 0) {
      mR = Math.round(mR * (1 - fF3) + info.fogColor.r * fF3);
      mG = Math.round(mG * (1 - fF3) + info.fogColor.g * fF3);
      mB = Math.round(mB * (1 - fF3) + info.fogColor.b * fF3);
    }
    var mullionColor = 'rgb(' + mR + ',' + mG + ',' + mB + ')';

    if (vertMullion) {
      ctx.fillStyle = mullionColor;
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    var midY3 = gapStart + Math.floor(gapH * 0.5);
    var hThick3 = Math.max(2, Math.floor(info.lineH / info.wallHeightMult * 0.06));
    var hmTop3 = midY3 - Math.floor(hThick3 / 2);
    if (hmTop3 >= gapStart && hmTop3 + hThick3 <= gapStart + gapH) {
      ctx.fillStyle = mullionColor;
      ctx.fillRect(col, hmTop3, 1, hThick3);
    }

    // 4. Frame — warm wood border (darker than mullion).
    var fR3 = Math.round(mR * 0.55);
    var fG3 = Math.round(mG * 0.55);
    var fB3 = Math.round(mB * 0.55);
    ctx.fillStyle = 'rgb(' + fR3 + ',' + fG3 + ',' + fB3 + ')';
    ctx.fillRect(col, gapStart, 1, 1);
    ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
  }

  // ── WINDOW_SLIT gap filler ────────────────────────────────────
  // Institutional fortress slit — narrow vertical opening in the
  // center 30% of the tile width. Everything outside that center
  // strip is opaque masonry. Inside: cold blue-grey wash, single
  // iron bar at center.
  function _windowSlitFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var exteriorFace = getExteriorFace(info.mapX, info.mapY);
    var interiorFace = (exteriorFace >= 0) ? ((exteriorFace + 2) % 4) : -1;

    // Interior face: transparent
    if (exteriorFace >= 0 && hitFace === interiorFace) return;

    // Side faces: opaque masonry
    if (exteriorFace < 0 || hitFace !== exteriorFace) {
      var bAdjW = info.brightness;
      var wR = Math.round(65 * bAdjW);
      var wG = Math.round(60 * bAdjW);
      var wB = Math.round(55 * bAdjW);
      var fFW = info.fogFactor;
      if (fFW > 0) {
        wR = Math.round(wR * (1 - fFW) + info.fogColor.r * fFW);
        wG = Math.round(wG * (1 - fFW) + info.fogColor.g * fFW);
        wB = Math.round(wB * (1 - fFW) + info.fogColor.b * fFW);
      }
      ctx.fillStyle = 'rgb(' + wR + ',' + wG + ',' + wB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Exterior face ─────────────────────────────────────────
    var bAdj    = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);
    var wallX   = info.wallX;

    // Narrow slit: masonry flanks on wallX < 0.35 and > 0.65.
    // Only the center 30% is the actual glass opening.
    if (wallX < 0.35 || wallX > 0.65) {
      // Paint as opaque wall masonry matching the building stone.
      var mwR = Math.round(65 * bAdj);
      var mwG = Math.round(60 * bAdj);
      var mwB = Math.round(55 * bAdj);
      var fFM = info.fogFactor;
      if (fFM > 0) {
        mwR = Math.round(mwR * (1 - fFM) + info.fogColor.r * fFM);
        mwG = Math.round(mwG * (1 - fFM) + info.fogColor.g * fFM);
        mwB = Math.round(mwB * (1 - fFM) + info.fogColor.b * fFM);
      }
      ctx.fillStyle = 'rgb(' + mwR + ',' + mwG + ',' + mwB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // Center strip: the actual slit opening.

    // 1. Cold blue-grey wash — institutional interior light.
    var coldA = 0.10 * bAdj * fogFade;
    if (coldA > 0.01) {
      ctx.fillStyle = 'rgba(140, 160, 180, ' + coldA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 2. Single iron bar at center (2px wide).
    var barHalfW = 0.04 + 0.02 / Math.max(0.6, info.perpDist);
    // Remap wallX to slit-local (0.35→0, 0.65→1)
    var slitX = (wallX - 0.35) / 0.30;
    var isBar = (slitX >= 0.5 - barHalfW && slitX <= 0.5 + barHalfW);

    var iR = Math.round(60 * bAdj);
    var iG = Math.round(62 * bAdj);
    var iB = Math.round(68 * bAdj);
    var fF4 = info.fogFactor;
    if (fF4 > 0) {
      iR = Math.round(iR * (1 - fF4) + info.fogColor.r * fF4);
      iG = Math.round(iG * (1 - fF4) + info.fogColor.g * fF4);
      iB = Math.round(iB * (1 - fF4) + info.fogColor.b * fF4);
    }

    if (isBar) {
      ctx.fillStyle = 'rgb(' + iR + ',' + iG + ',' + iB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 3. Iron frame — top/bottom 2px + edge bars where slit meets masonry.
    var frR = Math.round(iR * 0.65);
    var frG = Math.round(iG * 0.65);
    var frB = Math.round(iB * 0.65);
    ctx.fillStyle = 'rgb(' + frR + ',' + frG + ',' + frB + ')';
    ctx.fillRect(col, gapStart, 1, Math.min(2, gapH));
    if (gapH > 2) ctx.fillRect(col, gapStart + gapH - 2, 1, 2);

    // Edge bars where slit meets masonry flanks (wallX ≈ 0.35 and ≈ 0.65).
    if (slitX < 0.08 || slitX > 0.92) {
      ctx.fillStyle = 'rgb(' + frR + ',' + frG + ',' + frB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }
  }

  // ── Filler registration ─────────────────────────────────────────
  // This module currently loads in Layer 1 in index.html (alongside
  // bonfire-sprites / dump-truck-sprites), which is BEFORE the
  // raycaster — so we can't register the filler at IIFE time. Instead
  // we lazy-register the first time buildSprites() is called, by
  // which point Game init has set up the raycaster. A `_registered`
  // flag keeps it to one call per session.
  var _registered = false;
  function _ensureFillerRegistered() {
    if (_registered) return;
    if (typeof Raycaster !== 'undefined' &&
        typeof Raycaster.registerFreeformGapFiller === 'function') {
      Raycaster.registerFreeformGapFiller(
        'window_tavern_interior',
        _windowTavernInteriorFiller
      );
      Raycaster.registerFreeformGapFiller(
        'window_shop_interior',
        _windowShopFiller
      );
      Raycaster.registerFreeformGapFiller(
        'window_bay_interior',
        _windowBayFiller
      );
      Raycaster.registerFreeformGapFiller(
        'window_slit_interior',
        _windowSlitFiller
      );
      _registered = true;
    }
  }

  /**
   * Return the wall texture ID for a window tile's freeform bands,
   * or null if no override (raycaster falls back to SpatialContract).
   * @param {number} x
   * @param {number} y
   * @returns {string|null}
   */
  function getWallTexture(x, y) {
    return _windowTextures[x + ',' + y] || null;
  }

  /**
   * Return the mullion RGB object {r,g,b} for a window tile, or null
   * if no override (filler falls back to the default wood color).
   * @param {number} x
   * @param {number} y
   * @returns {Object|null}
   */
  function getMullionColor(x, y) {
    return _windowMullions[x + ',' + y] || null;
  }

  /**
   * Check if a ray hit on a window tile is from the exterior (street) side.
   * Same contract as DoorSprites.isExteriorHit() — used by the raycaster's
   * recess block to decide whether to apply the Wolfenstein inset.
   * @param {number} x — tile grid X
   * @param {number} y — tile grid Y
   * @param {number} hitSide — 0 (X-axis hit) or 1 (Y-axis hit)
   * @param {number} stepX — DDA step direction (-1 or +1)
   * @param {number} stepY — DDA step direction (-1 or +1)
   * @returns {boolean}
   */
  function isExteriorHit(x, y, hitSide, stepX, stepY) {
    var extFace = getExteriorFace(x, y);
    if (extFace < 0) return false;
    var hitFace = (hitSide === 0)
      ? (stepX > 0 ? 2 : 0)
      : (stepY > 0 ? 3 : 1);
    return hitFace === extFace;
  }

  return Object.freeze({
    buildSprites:    buildSprites,
    animate:         animate,
    clearCache:      clearCache,
    getAnimatedX:    getAnimatedX,
    getExteriorFace: getExteriorFace,
    isExteriorHit:   isExteriorHit,
    getWallTexture:  getWallTexture,
    getMullionColor: getMullionColor
  });
})();

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

  // ── Cache ───────────────────────────────────────────────────────
  var _cachedFloorId  = null;
  var _cachedSprites  = [];
  // Per-tile exterior-face index keyed by "x,y". Cleared when the
  // floor changes. Read by the gap filler on every column.
  var _exteriorFaces  = {};

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
   * Cached per floorId — rebuilt only when the floor changes. The
   * same pass populates the exterior-face map consumed by the gap
   * filler registered below.
   *
   * @param {string} floorId
   * @param {Array<Array<number>>} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {Object} [explicitFaces] — optional "x,y" → face index map
   *   authored on the floor data. Same contract as `doorTargets`:
   *   explicit declarations from the floor definition win over the
   *   auto-detect heuristic, which is a fallback for tiles that
   *   aren't listed. Face index is 0=E, 1=S, 2=W, 3=N.
   * @returns {Array} sprite objects for the raycaster
   */
  function buildSprites(floorId, grid, gridW, gridH, explicitFaces) {
    // Lazy filler registration — safe to call repeatedly, costs
    // nothing once `_registered` flips true on the first successful
    // call. See comment on _ensureFillerRegistered.
    _ensureFillerRegistered();

    if (floorId === _cachedFloorId) return _cachedSprites;

    _cachedSprites  = [];
    _exteriorFaces  = {};
    _cachedFloorId  = floorId;

    if (!grid || !gridW || !gridH) return _cachedSprites;

    var winTile = (typeof TILES !== 'undefined' && TILES.WINDOW_TAVERN)
      ? TILES.WINDOW_TAVERN : 73;

    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] !== winTile) continue;

        // Compute + cache exterior face for this tile. Explicit
        // floor-data entries win; the heuristic is only consulted
        // when the tile isn't listed.
        var key = gx + ',' + gy;
        var face;
        if (explicitFaces && typeof explicitFaces[key] === 'number') {
          face = explicitFaces[key];
        } else {
          face = _detectExteriorFace(grid, gridW, gridH, gx, gy);
        }
        _exteriorFaces[key] = face;

        // Position at grid index — _renderSprites adds 0.5 to center.
        // No groundLevel flag: default eye-level placement lands the
        // glyph near the top of the 0.40–1.15 slot, which is where a
        // bar patron's upraised mug would naturally be anyway.
        _cachedSprites.push({
          x: gx,
          y: gy,
          emoji:        INTERIOR.emoji,
          emojiOverlay: null,
          scale:        INTERIOR.scale,
          glow:         INTERIOR.glow,
          glowRadius:   INTERIOR.glowRadius,
          windowTavern: true,
          noFogFade:    false,  // vignette fades naturally with distance
          bobY:         0       // set by animate() each frame
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
  // A glass pane has TWO visible faces though: the exterior face
  // (street side, viewed by the player walking past) and the
  // opposite face, which is the same pane viewed from inside the
  // building. Both should render as glass so that when the player
  // is inside the bazaar/inn and looks at the back of the window,
  // they see the mullion cross and can look through the cavity at
  // the street/sky beyond — not a solid wall. The two perpendicular
  // faces (the sides of the tile that sit inside the building mass)
  // are the ones that should be opaque masonry.
  function _windowTavernInteriorFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var exteriorFace = getExteriorFace(info.mapX, info.mapY);

    // Back face of the same glass pane — opposite direction index.
    // 0↔2 (E/W), 1↔3 (S/N). Both faces get the glass treatment.
    var interiorFace = (exteriorFace >= 0) ? ((exteriorFace + 2) % 4) : -1;
    var isGlassFace  = (exteriorFace >= 0) &&
                       (hitFace === exteriorFace || hitFace === interiorFace);

    // ── Perpendicular faces: paint as solid wall ──────────────────
    // The freeform cavity is transparent by default (back layers
    // bled through), which is what used to leak the amber wash on
    // every face. Painting an opaque wall-colored strip here closes
    // the hole on the two sides of the tile that are supposed to be
    // solid masonry — i.e. the faces perpendicular to the glass
    // pane. Color is derived from the tile's texture brightness +
    // fog so the patch matches the adjacent WALL bands.
    if (!isGlassFace) {
      var bAdjW = info.brightness;
      // Mid-tone brick/stone color — not pure black, since the rest
      // of the facade is textured. Later phases can swap this for a
      // sampled texture column if needed.
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

    // ── Exterior face: paint interior ─────────────────────────────
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

    // (Blue sheen deleted — barely visible and not the style we
    //  want. LIVING_WINDOWS_ROADMAP Phase 1 replaces it with a
    //  parallax glint sprite driven by angle-from-normal.)

    // 2. Mullion cross — divided-pane frame drawn with opaque
    //    rgb() so the dark wood isn't swallowed by the amber wash.
    //    Brightness and fog are baked into the RGB channels; alpha
    //    stays 1.0. Vertical mullion at wallX ≈ 0.5; horizontal
    //    mullion at the slot's vertical midpoint, min 2 px thick.
    var wallX = info.wallX;
    var mullionHalfW = 0.05 + 0.03 / Math.max(0.6, info.perpDist);
    var vertMullion = (wallX >= 0.5 - mullionHalfW && wallX <= 0.5 + mullionHalfW);

    var mR = 48, mG = 28, mB = 14;
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

    // 3. Top + bottom frame lines — 1px opaque dark bands at the
    //    slot's top and bottom edges (the stop bead).
    var fR = Math.round(mR * 0.6);
    var fG = Math.round(mG * 0.6);
    var fB = Math.round(mB * 0.6);
    ctx.fillStyle = 'rgb(' + fR + ',' + fG + ',' + fB + ')';
    ctx.fillRect(col, gapStart, 1, 1);
    ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
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
      _registered = true;
    }
  }

  return Object.freeze({
    buildSprites:    buildSprites,
    animate:         animate,
    clearCache:      clearCache,
    getAnimatedX:    getAnimatedX,
    getExteriorFace: getExteriorFace
  });
})();

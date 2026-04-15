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
   * Compute the exterior face BITMASK for a window tile at (x,y).
   *
   * Face bits follow CLAUDE.md direction convention:
   *   1 = EAST   (bit 0)
   *   2 = SOUTH  (bit 1)
   *   4 = WEST   (bit 2)
   *   8 = NORTH  (bit 3)
   *
   * A tile may have MULTIPLE exterior faces (corner windows sitting at
   * a building corner where two adjacent faces both look onto streets).
   * The filler uses the bitmask to decide, per-column:
   *   - ray face ∈ mask          → paint glass
   *   - ray face's OPPOSITE ∈ mask → transparent (back of a pane)
   *   - otherwise                → opaque masonry side
   *
   * Primary signal: **street scoring.** Walk up to STREET_WALK_MAX
   * tiles in each cardinal direction (stopping at the first opaque
   * blocker) and count how many of the visited tiles are ROAD / PATH
   * / GRASS. ANY direction with a positive street score contributes
   * its bit to the mask. Streets are long open runs of paving, while
   * building interiors are walkable but typically EMPTY floor with no
   * paving — so corner windows bordering two streets light up both.
   *
   * Fallback: if no direction has any street tiles, use the simpler
   * "walkable pair" heuristic — axes where one side is walkable and
   * the opposite is opaque set that exterior bit.
   *
   * Returns -1 if no signal in any direction can be found; the filler
   * treats -1 / 0 as "paint as solid wall on every face" so
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

    // Accumulate EVERY direction with a positive street score into
    // the bitmask. Corner windows (two street-facing sides) end up
    // with two bits set; typical mid-wall windows with one.
    var mask = 0;
    for (var i = 0; i < dirs.length; i++) {
      var s = _scoreStreet(dirs[i].dx, dirs[i].dy);
      if (s > 0) mask |= (1 << dirs[i].face);
    }
    if (mask !== 0) return mask;

    // ── Fallback: walkable-pair heuristic ─────────────────────────
    // Used for floors with no street tiles (interior scenes). Any
    // face whose neighbor is walkable AND whose opposite neighbor is
    // opaque is treated as exterior. If both sides of an axis are
    // walkable we can't tell — skip that axis. If neither is
    // walkable we have no signal — skip too.
    var eastWalkable  = _walkable(x + 1, y);
    var westWalkable  = _walkable(x - 1, y);
    var northWalkable = _walkable(x,     y - 1);
    var southWalkable = _walkable(x,     y + 1);

    if (eastWalkable  && !westWalkable)  mask |= 1;  // E
    if (southWalkable && !northWalkable) mask |= 2;  // S
    if (westWalkable  && !eastWalkable)  mask |= 4;  // W
    if (northWalkable && !southWalkable) mask |= 8;  // N
    if (mask !== 0) return mask;

    // Symmetric case — both sides of an axis walkable (classic
    // dungeon arrow-slit between two rooms, or a peephole in a
    // corridor divider). Treat BOTH sides as aperture faces so the
    // filler paints the cut on either approach and back-face logic
    // stays consistent. This is the typical layout for dungeon
    // peepholes where neither side is "the street side."
    if (northWalkable && southWalkable) mask |= (2 | 8);   // S + N
    if (eastWalkable  && westWalkable)  mask |= (1 | 4);   // E + W
    if (mask !== 0) return mask;

    // Last-ditch: one walkable side only.
    if (northWalkable || southWalkable) return southWalkable ? 2 : 8;
    if (eastWalkable  || westWalkable)  return eastWalkable  ? 1 : 4;
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
    // Register ALL window variants (WINDOW_TAVERN, WINDOW_SHOP,
    // WINDOW_BAY, WINDOW_SLIT) — without an exterior face cached, the
    // raycaster's recess block treats the tile as flush and the gap
    // filler falls into the "side face" branch (opaque masonry).
    for (var gy = 0; gy < gridH; gy++) {
      if (!grid[gy]) continue;
      for (var gx = 0; gx < gridW; gx++) {
        var _gt = grid[gy][gx];
        var _isWin = (typeof TILES !== 'undefined' && TILES.isWindow)
          ? TILES.isWindow(_gt) : (_gt === winTile);
        if (!_isWin) continue;
        var key = gx + ',' + gy;
        var faceMask;
        if (explicitFaces && explicitFaces[key] != null) {
          // Accept either a single face index (0-3, legacy shape)
          // or an array of face indices for corner windows. The
          // stored value is ALWAYS a bitmask from here on out.
          var _ef = explicitFaces[key];
          if (typeof _ef === 'number') {
            faceMask = (1 << _ef);
          } else if (_ef && typeof _ef.length === 'number') {
            faceMask = 0;
            for (var _ei = 0; _ei < _ef.length; _ei++) {
              if (typeof _ef[_ei] === 'number') faceMask |= (1 << _ef[_ei]);
            }
            if (faceMask === 0) faceMask = _detectExteriorFace(grid, gridW, gridH, gx, gy);
          } else {
            faceMask = _detectExteriorFace(grid, gridW, gridH, gx, gy);
          }
        } else {
          faceMask = _detectExteriorFace(grid, gridW, gridH, gx, gy);
        }
        _exteriorFaces[key] = faceMask;
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

        // Dungeon apertures (ARROWSLIT, MURDERHOLE) are pure stone cuts
        // with no interior billboard — skip sprite emission entirely.
        // The gap filler handles everything visual. Marking the tile
        // covered above keeps the TAVERN-only fallback loop from
        // double-emitting a sprite if someone points a scene at one.
        var _sceneTile = (grid && grid[fy] && typeof grid[fy][fx] !== 'undefined') ? grid[fy][fx] : 0;
        if (typeof TILES !== 'undefined' &&
            (_sceneTile === TILES.WINDOW_ARROWSLIT ||
             _sceneTile === TILES.WINDOW_MURDERHOLE)) {
          continue;
        }

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
        // Tile-type overrides windowType where present, so ALCOVE at a
        // BAY-typed building still gets the correct gap center altitude.
        var wType = bldg ? bldg.windowType : null;
        var yAlt  = 0.275;                    // shop / tavern default
        if (wType === 'bay')  yAlt = 0.40;
        if (wType === 'slit') yAlt = 0.60;
        var _facadeTile = (grid && grid[fy] && typeof grid[fy][fx] !== 'undefined') ? grid[fy][fx] : 0;
        if (typeof TILES !== 'undefined' && _facadeTile === TILES.WINDOW_ALCOVE) {
          yAlt = 0.30;                        // alcove: gap centered ~0.80 world
        }
        if (typeof TILES !== 'undefined' && _facadeTile === TILES.WINDOW_SHOP) {
          yAlt = 0.125;                       // shop: gap 0.25→1.00, center 0.625, eye 0.5
        }
        if (typeof TILES !== 'undefined' && _facadeTile === TILES.WINDOW_COMMERCIAL) {
          yAlt = 1.125;                       // commercial: gap 0.25→3.00, center 1.625, eye 0.5
        }

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
   * Returns the cached exterior-face BITMASK for the window at (x,y).
   *   1 = E bit, 2 = S bit, 4 = W bit, 8 = N bit.
   * Returns -1 (or 0) if the tile is unknown or had no exterior
   * neighbor. Corner windows return a two-bit mask (e.g. E|S = 3).
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

  // ── Back-face interior wall fill ────────────────────────────────
  // LIVING_WINDOWS_ROADMAP §10.5 #6 — the back (interior) face of a
  // window tile used to paint nothing (transparent), which meant the
  // ray kept walking into whatever was behind the tile. Now we paint
  // a TextureAtlas sample of the building's wall material, darkened
  // a touch for the "inside shadow" feel, and fog-modulated. Reads
  // as a real interior wall without costing us the forward-facing
  // emoji billboards (sprites draw between back-layer and foreground
  // so the vignette still punches through the glass from the street).
  //
  // Called from each filler when (isBack && !isGlass).
  function _paintInteriorBack(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var texId = _windowTextures[info.mapX + ',' + info.mapY] || null;
    var tex = (texId && typeof TextureAtlas !== 'undefined')
      ? TextureAtlas.get(texId) : null;

    if (tex && tex.canvas && info.lineH > 0) {
      var texX = Math.floor(info.wallX * tex.width);
      if (texX >= tex.width) texX = tex.width - 1;
      if (texX < 0) texX = 0;
      var srcY = (gapStart - info.wallTop) / info.lineH * tex.height;
      var srcH = gapH / info.lineH * tex.height;
      if (srcY < 0) { srcH += srcY; srcY = 0; }
      if (srcY + srcH > tex.height) srcH = tex.height - srcY;
      if (srcH < 0.5) srcH = 0.5;
      ctx.drawImage(tex.canvas, texX, srcY, 1, srcH, col, gapStart, 1, gapH);
    } else {
      // Fallback: warm dark interior wash.
      ctx.fillStyle = 'rgb(24, 16, 10)';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // Interior shadow — back of a window is always dimmer than the
    // daylit exterior. Additional 35% darken on top of the normal
    // brightness attenuation.
    var bAdj   = info.brightness;
    var darkA  = 1 - bAdj * 0.65;
    if (darkA > 0.05) {
      ctx.fillStyle = 'rgba(0,0,0,' + darkA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // Fog pass.
    if (info.fogFactor > 0.05) {
      ctx.fillStyle = 'rgba(' + info.fogColor.r + ',' + info.fogColor.g +
                      ',' + info.fogColor.b + ',' + info.fogFactor.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }
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
  //   INTERIOR face  → textured wall sample (see _paintInteriorBack)
  //   SIDE faces     → opaque wall masonry (close the tile edges)
  // The window reads as a thin glass pane on the building facade:
  // mullion on the front, a proper inside wall on the back,
  // solid masonry on the edges where the tile meets its neighbours.
  function _windowTavernInteriorFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace  = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var extMask  = getExteriorFace(info.mapX, info.mapY);
    var hitBit   = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit   = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass  = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack   = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    // Three face treatments (bitmask-aware — corner windows have
    // TWO glass faces, each with its opposite as a transparent back):
    //   Glass face        → glass pane (mullion + amber wash + glint)
    //   Back of a glass   → nothing (leave cavity transparent)
    //   Side faces        → opaque wall masonry (close the tile edges)

    // ── Back-of-glass face: textured interior wall (roadmap §10.5 #6)
    if (isBack) {
      _paintInteriorBack(ctx, col, gapStart, gapH, info);
      return;
    }

    // ── Side faces: paint as solid wall ──────────────────────────
    if (!isGlass) {
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
  // Commercial storefront — plate glass with a classic wood mullion
  // cross (matches tavern aesthetic). Brighter amber wash than tavern
  // (lit display case). Same three-face model as TAVERN
  // (exterior=glass, interior=transparent, sides=masonry).
  function _windowShopFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var extMask = getExteriorFace(info.mapX, info.mapY);
    var hitBit  = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit  = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack  = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    // Interior face: textured back-wall (roadmap §10.5 #6)
    if (isBack) {
      _paintInteriorBack(ctx, col, gapStart, gapH, info);
      return;
    }

    // Side faces: opaque masonry
    if (!isGlass) {
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

    // 3. Two vertical mullions at wallX ≈ 1/3 and 2/3 — divide the
    //    glass into 3 equal-width panels. No horizontal bar
    //    (gas-station storefront aesthetic).
    var mullionHalfW2 = 0.025 + 0.015 / Math.max(0.6, info.perpDist);
    var _onMullion2 = (wallX >= (1/3) - mullionHalfW2 && wallX <= (1/3) + mullionHalfW2) ||
                      (wallX >= (2/3) - mullionHalfW2 && wallX <= (2/3) + mullionHalfW2);

    var mRGB2 = _windowMullions[info.mapX + ',' + info.mapY] || null;
    var mR2 = mRGB2 ? mRGB2.r : 60;   // slightly warmer than default wood
    var mG2 = mRGB2 ? mRGB2.g : 50;
    var mB2 = mRGB2 ? mRGB2.b : 42;
    mR2 = Math.round(mR2 * bAdj);
    mG2 = Math.round(mG2 * bAdj);
    mB2 = Math.round(mB2 * bAdj);
    var fF2 = info.fogFactor;
    if (fF2 > 0) {
      mR2 = Math.round(mR2 * (1 - fF2) + info.fogColor.r * fF2);
      mG2 = Math.round(mG2 * (1 - fF2) + info.fogColor.g * fF2);
      mB2 = Math.round(mB2 * (1 - fF2) + info.fogColor.b * fF2);
    }
    var mullionColor2 = 'rgb(' + mR2 + ',' + mG2 + ',' + mB2 + ')';

    if (_onMullion2) {
      ctx.fillStyle = mullionColor2;
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // 4. Top + bottom frame — 2px bands at head/sill (solid stop bead).
    var frR = Math.round(mR2 * 0.65);
    var frG = Math.round(mG2 * 0.65);
    var frB = Math.round(mB2 * 0.65);
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
    var extMask = getExteriorFace(info.mapX, info.mapY);
    var hitBit  = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit  = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack  = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    // Interior face: textured back-wall (roadmap §10.5 #6)
    if (isBack) {
      _paintInteriorBack(ctx, col, gapStart, gapH, info);
      return;
    }

    // Side faces: building wall texture masonry (the beveled jambs).
    // Use a warmer brown for residential wood.
    if (!isGlass) {
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
    var extMask = getExteriorFace(info.mapX, info.mapY);
    var hitBit  = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit  = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack  = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    // Interior face: textured back-wall (roadmap §10.5 #6)
    if (isBack) {
      _paintInteriorBack(ctx, col, gapStart, gapH, info);
      return;
    }

    // Side faces: opaque masonry
    if (!isGlass) {
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

  // ── WINDOW_ALCOVE gap filler ──────────────────────────────────
  // Residential alcove window — mild inset (not a protrusion like
  // BAY), narrower glass cavity, warm colonial cross mullion. Used
  // on facades directly adjacent to doors or corners, where a BAY's
  // outward protrusion reads awkwardly. Same three-face model.
  function _windowAlcoveFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var extMask = getExteriorFace(info.mapX, info.mapY);
    var hitBit  = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit  = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack  = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    // Interior face: textured back-wall (roadmap §10.5 #6)
    if (isBack) {
      _paintInteriorBack(ctx, col, gapStart, gapH, info);
      return;
    }

    if (!isGlass) {
      var bAdjW = info.brightness;
      var wR = Math.round(62 * bAdjW);
      var wG = Math.round(42 * bAdjW);
      var wB = Math.round(26 * bAdjW);
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

    var bAdj    = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);
    var wallX   = info.wallX;

    // Warm amber wash (same intensity as bay — cozy residential).
    var warmA = 0.22 * bAdj * fogFade;
    if (warmA > 0.01) {
      ctx.fillStyle = 'rgba(255, 170, 50, ' + warmA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }

    // Subtle glint.
    if (gapH >= 4) {
      var _rotA   = (_glintClock % GLINT_PERIOD) / GLINT_PERIOD;
      var _slopeA = Math.sin(_rotA * Math.PI * 2);
      var _yNormA = 0.5 + (wallX - 0.5) * _slopeA * 0.25;
      if (_yNormA < 0.15) _yNormA = 0.15;
      if (_yNormA > 0.85) _yNormA = 0.85;
      var _glintYA = gapStart + Math.floor(_yNormA * gapH);
      var _xDistA  = Math.abs(wallX - 0.40);
      var _glintAA = Math.max(0, 1 - _xDistA * 4) * 0.28 * bAdj * fogFade;
      if (_glintAA > 0.02) {
        var _gHA = Math.min(4, gapH - (_glintYA - gapStart));
        if (_gHA > 0) {
          ctx.fillStyle = 'rgba(255, 255, 240, ' + _glintAA.toFixed(3) + ')';
          ctx.fillRect(col, _glintYA, 1, _gHA);
        }
      }
    }

    // Single horizontal mullion at gap midpoint — splits glass into
    // two stacked panes. Distinct from the other window types (no
    // vertical divider).
    var mRGBA = _windowMullions[info.mapX + ',' + info.mapY] || null;
    var mRA = mRGBA ? mRGBA.r : 48;
    var mGA = mRGBA ? mRGBA.g : 28;
    var mBA = mRGBA ? mRGBA.b : 14;
    mRA = Math.round(mRA * bAdj);
    mGA = Math.round(mGA * bAdj);
    mBA = Math.round(mBA * bAdj);
    var fFA = info.fogFactor;
    if (fFA > 0) {
      mRA = Math.round(mRA * (1 - fFA) + info.fogColor.r * fFA);
      mGA = Math.round(mGA * (1 - fFA) + info.fogColor.g * fFA);
      mBA = Math.round(mBA * (1 - fFA) + info.fogColor.b * fFA);
    }
    var mullionColorA = 'rgb(' + mRA + ',' + mGA + ',' + mBA + ')';

    var midYA = gapStart + Math.floor(gapH * 0.5);
    var hThickA = Math.max(2, Math.floor(info.lineH / info.wallHeightMult * 0.06));
    var hmTopA = midYA - Math.floor(hThickA / 2);
    if (hmTopA >= gapStart && hmTopA + hThickA <= gapStart + gapH) {
      ctx.fillStyle = mullionColorA;
      ctx.fillRect(col, hmTopA, 1, hThickA);
    }

    // Frame — darker stop bead top/bottom.
    var frRA = Math.round(mRA * 0.55);
    var frGA = Math.round(mGA * 0.55);
    var frBA = Math.round(mBA * 0.55);
    ctx.fillStyle = 'rgb(' + frRA + ',' + frGA + ',' + frBA + ')';
    ctx.fillRect(col, gapStart, 1, 1);
    ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
  }

  // ── WINDOW_ARROWSLIT gap filler (dungeon / interior peephole) ──
  // Tall narrow vertical aperture cut through raw stone — no glass,
  // no warm vignette. The cavity spans nearly the full wall height,
  // but the filler confines the actual opening to a 10% wallX stripe
  // centered at 0.5. Outside that stripe, the filler paints stone
  // masonry so the slit reads as a narrow vertical cut rather than
  // a wide horizontal band. Inside the stripe, the filler paints
  // nothing — back-layer geometry (the adjacent room) shows through.
  //
  // A single 1px darker bead frames each long edge (wallX ≈ 0.45 /
  // 0.55) to sell the depth of the cut. Usable on both interior
  // (N.N) and nested dungeon (N.N.N) floors — the contract's fog
  // mode (CLAMP vs DARKNESS) decides how legible the back side is.
  function _windowArrowslitFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var extMask = getExteriorFace(info.mapX, info.mapY);
    var hitBit  = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit  = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack  = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    // Shared stone-flank color (muted, fog-aware). Used for BOTH
    // the masonry flanks on the aperture face AND the side faces,
    // so the tile reads as one continuous block of dungeon stone.
    var bAdjS = info.brightness;
    var sR = Math.round(70 * bAdjS);
    var sG = Math.round(66 * bAdjS);
    var sB = Math.round(60 * bAdjS);
    var fFS = info.fogFactor;
    if (fFS > 0) {
      sR = Math.round(sR * (1 - fFS) + info.fogColor.r * fFS);
      sG = Math.round(sG * (1 - fFS) + info.fogColor.g * fFS);
      sB = Math.round(sB * (1 - fFS) + info.fogColor.b * fFS);
    }
    var stoneRGB = 'rgb(' + sR + ',' + sG + ',' + sB + ')';

    // Back-face: transparent (see through the slit to whatever is
    // on the other side). Same early-return as the facade windows.
    if (isBack) return;

    // Side faces: solid masonry.
    if (!isGlass) {
      ctx.fillStyle = stoneRGB;
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Aperture face ────────────────────────────────────────────
    // Outside the 10% center stripe: paint masonry (the rest of the
    // wall face). Inside the stripe: skip fill to show back layers.
    var wallX = info.wallX;
    if (wallX < 0.45 || wallX > 0.55) {
      ctx.fillStyle = stoneRGB;
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // Darker 1px bead on the two long edges of the cut, so the slit
    // reads as a recessed stone gouge rather than a painted stripe.
    // wallX 0.45 / 0.55 land exactly on the transition columns.
    var edgeSlack = 0.005;
    var onEdge = (wallX <= 0.45 + edgeSlack) || (wallX >= 0.55 - edgeSlack);
    if (onEdge) {
      ctx.fillStyle = 'rgb(' +
        Math.round(sR * 0.45) + ',' +
        Math.round(sG * 0.45) + ',' +
        Math.round(sB * 0.45) + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }
    // Inside the aperture — leave transparent (no fill).
  }

  // ── WINDOW_MURDERHOLE gap filler (small high square peephole) ──
  // A short horizontal cavity high up on the wall (defined by the
  // freeform hUpper/hLower in SpatialContract), with the filler
  // further confining the aperture to wallX ∈ [0.40, 0.60]. The
  // result is a small square opening roughly at head height (in
  // dungeon wall terms) that the player has to crane up through to
  // glimpse the adjacent room.
  function _windowMurderholeFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var extMask = getExteriorFace(info.mapX, info.mapY);
    var hitBit  = (hitFace >= 0) ? (1 << hitFace) : 0;
    var oppBit  = (hitFace >= 0) ? (1 << ((hitFace + 2) % 4)) : 0;
    var isGlass = (extMask > 0 && (extMask & hitBit) !== 0);
    var isBack  = (extMask > 0 && !isGlass && (extMask & oppBit) !== 0);

    var bAdjS = info.brightness;
    var sR = Math.round(68 * bAdjS);
    var sG = Math.round(64 * bAdjS);
    var sB = Math.round(58 * bAdjS);
    var fFS = info.fogFactor;
    if (fFS > 0) {
      sR = Math.round(sR * (1 - fFS) + info.fogColor.r * fFS);
      sG = Math.round(sG * (1 - fFS) + info.fogColor.g * fFS);
      sB = Math.round(sB * (1 - fFS) + info.fogColor.b * fFS);
    }
    var stoneRGB = 'rgb(' + sR + ',' + sG + ',' + sB + ')';

    if (isBack) return;

    if (!isGlass) {
      ctx.fillStyle = stoneRGB;
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // Aperture face: 20% center stripe is the hole, flanks are stone.
    var wallX = info.wallX;
    if (wallX < 0.40 || wallX > 0.60) {
      ctx.fillStyle = stoneRGB;
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // Darker 1px rim at the four edges of the square (top/bottom
    // rendered as gap edges; left/right at wallX ≈ 0.40 / 0.60).
    var darkR = Math.round(sR * 0.45);
    var darkG = Math.round(sG * 0.45);
    var darkB = Math.round(sB * 0.45);
    var darkRGB = 'rgb(' + darkR + ',' + darkG + ',' + darkB + ')';

    var edgeSlack = 0.008;
    var onVertEdge = (wallX <= 0.40 + edgeSlack) || (wallX >= 0.60 - edgeSlack);
    if (onVertEdge) {
      ctx.fillStyle = darkRGB;
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // Top + bottom 1px rim lines to complete the square frame.
    ctx.fillStyle = darkRGB;
    ctx.fillRect(col, gapStart, 1, 1);
    if (gapH > 1) ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
    // Interior of the hole — leave transparent.
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
      Raycaster.registerFreeformGapFiller('window_tavern_interior', _windowTavernInteriorFiller);
      Raycaster.registerFreeformGapFiller('window_shop_interior',   _windowShopFiller);
      Raycaster.registerFreeformGapFiller('window_bay_interior',    _windowBayFiller);
      Raycaster.registerFreeformGapFiller('window_slit_interior',   _windowSlitFiller);
      Raycaster.registerFreeformGapFiller('window_alcove_interior', _windowAlcoveFiller);
      Raycaster.registerFreeformGapFiller('window_arrowslit_interior',  _windowArrowslitFiller);
      Raycaster.registerFreeformGapFiller('window_murderhole_interior', _windowMurderholeFiller);
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
    var extMask = getExteriorFace(x, y);
    if (extMask <= 0) return false;
    var hitFace = (hitSide === 0)
      ? (stepX > 0 ? 2 : 0)
      : (stepY > 0 ? 3 : 1);
    return (extMask & (1 << hitFace)) !== 0;
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

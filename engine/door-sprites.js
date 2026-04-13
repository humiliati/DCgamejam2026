/**
 * DoorSprites — Per-building door/arch texture overrides + facade_door
 * gap filler for DOOR_FACADE (74) tiles.
 *
 * Phase 0: Coordinate→texture cache for DOOR/ARCH_DOORWAY tiles.
 * Phase 1: facade_door gap filler — renders the door opening cavity in
 *   a full-height DOOR_FACADE freeform tile. Three-face model mirrors
 *   WindowSprites' window_tavern_interior filler:
 *     EXTERIOR face → dark interior portal + door frame border
 *     INTERIOR face → transparent (back layers show through)
 *     SIDE faces    → opaque wall masonry (seal tile edges)
 *
 * Data flow:
 *   1. FloorManager builds a floor, iterates doorTargets, resolves
 *      each door's building via BuildingRegistry, calls setTexture().
 *   2. FloorManager also calls setExteriorFace() for DOOR_FACADE tiles
 *      to tell the gap filler which face is the street side.
 *   3. The raycaster's texture lookup checks getWallTexture() for the
 *      lintel band texture. The gap filler reads getExteriorFace() to
 *      decide what to paint in the cavity.
 *
 * Layer 0 — depends on nothing at IIFE time. Lazy-registers the gap
 * filler the first time ensureFillerRegistered() is called (by which
 * point Raycaster is loaded).
 */
var DoorSprites = (function () {
  'use strict';

  // ── Cache ───────────────────────────────────────────────────────
  // "x,y" → TextureAtlas texture ID string (lintel band texture)
  var _doorTextures = {};
  // "x,y" → TextureAtlas texture ID string (door panel in cavity)
  var _doorPanels = {};
  // "x,y" → exterior face index (0=E, 1=S, 2=W, 3=N), set by FloorManager
  var _exteriorFaces = {};
  // "x,y" → { partner: "px,py", side: 'left'|'right' } for double-door pairs
  var _doorPairs = {};
  // "x,y" → TextureAtlas texture ID string (wide 128×64 double-door panel)
  var _doubleDoorPanels = {};
  var _cachedFloorId = null;

  // ── Gap filler registration ─────────────────────────────────────
  var _registered = false;

  function _ensureFillerRegistered() {
    if (_registered) return;
    if (typeof Raycaster !== 'undefined' &&
        typeof Raycaster.registerFreeformGapFiller === 'function') {
      Raycaster.registerFreeformGapFiller('facade_door', _facadeDoorFiller);
      Raycaster.registerFreeformGapFiller('trapdoor_shaft', _trapdoorShaftFiller);
      _registered = true;
    }
  }

  // ── Population ─────────────────────────────────────────────────

  /**
   * Set the texture override for a door/arch tile at (x,y).
   * Called by FloorManager during floor generation.
   */
  function setTexture(x, y, texId) {
    _doorTextures[x + ',' + y] = texId;
  }

  /**
   * Set the door-panel texture for a DOOR_FACADE cavity at (x,y).
   * This is the texture rendered INSIDE the door opening (the actual
   * door face), distinct from the lintel band texture (setTexture).
   */
  function setDoorPanel(x, y, texId) {
    _doorPanels[x + ',' + y] = texId;
  }

  /**
   * Set the exterior face for a DOOR_FACADE tile at (x,y).
   * The exterior face is the one facing the street — the gap filler
   * paints the door portal on this face. Interior face = opposite.
   * @param {number} x
   * @param {number} y
   * @param {number} face — 0=E, 1=S, 2=W, 3=N
   */
  function setExteriorFace(x, y, face) {
    _exteriorFaces[x + ',' + y] = face;
  }

  /**
   * Register a double-door or great-arch pair.
   * Two adjacent tiles sharing an exterior face are paired: one is 'left',
   * the other 'right' (relative to the exterior view).  The gap filler
   * UV-splits a 128×64 wide texture across the two tiles.
   * @param {number} x
   * @param {number} y
   * @param {number} partnerX
   * @param {number} partnerY
   * @param {string} side — 'left' or 'right'
   */
  function setPairInfo(x, y, partnerX, partnerY, side) {
    _doorPairs[x + ',' + y] = {
      partner: partnerX + ',' + partnerY,
      side: side
    };
  }

  /**
   * Set the wide (128×64) door-panel texture shared by a double-door pair.
   * Both tiles in the pair should reference the same texture ID — the gap
   * filler selects the correct half based on getPairInfo().side.
   */
  function setDoubleDoorPanel(x, y, texId) {
    _doubleDoorPanels[x + ',' + y] = texId;
  }

  /**
   * Mark which floor the cache belongs to.
   */
  function setFloor(floorId) {
    _cachedFloorId = floorId;
  }

  // ── Queries ────────────────────────────────────────────────────

  function getWallTexture(x, y) {
    return _doorTextures[x + ',' + y] || null;
  }

  function getDoorPanel(x, y) {
    return _doorPanels[x + ',' + y] || null;
  }

  function getExteriorFace(x, y) {
    var f = _exteriorFaces[x + ',' + y];
    return (typeof f === 'number') ? f : -1;
  }

  /**
   * Get double-door pairing info for tile at (x,y).
   * @returns {{ partner: string, side: string }|null}
   */
  function getPairInfo(x, y) {
    return _doorPairs[x + ',' + y] || null;
  }

  /**
   * Get the wide (128×64) panel texture ID for a double-door tile.
   * @returns {string|null}
   */
  function getDoubleDoorPanel(x, y) {
    return _doubleDoorPanels[x + ',' + y] || null;
  }

  /**
   * Does this DDA hit correspond to the exterior face of a recessed tile?
   * Decodes (side, stepX, stepY) into a face index and compares against
   * the registered exterior face.  Used by the raycaster recess block and
   * any future recessed-tile type (shop windows, alcoves).
   *
   * @param {number} x — tile grid X
   * @param {number} y — tile grid Y
   * @param {number} hitSide — 0 (X-axis hit) or 1 (Y-axis hit)
   * @param {number} stepX — DDA step direction on X (-1 or +1)
   * @param {number} stepY — DDA step direction on Y (-1 or +1)
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

  /**
   * Clear all caches. Called when switching floors.
   */
  function clear() {
    _doorTextures = {};
    _doorPanels = {};
    _exteriorFaces = {};
    _doorPairs = {};
    _doubleDoorPanels = {};
    _cachedFloorId = null;
  }

  // ── facade_door gap filler ─────────────────────────────────────
  //
  // Three-face model (mirrors WindowSprites pattern):
  //   EXTERIOR face → door portal: dark interior wash with warm-edge
  //     vignette, door frame border lines, depth-implying gradient.
  //   INTERIOR face → transparent (no fill). The player inside the
  //     building doesn't see a door back — they see the DOOR_EXIT
  //     tile on the interior floor.
  //   SIDE faces → opaque wall masonry fill. Seals the tile edges
  //     so the cavity doesn't leak when viewed edge-on.
  //
  function _facadeDoorFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var hitFace      = (typeof info.hitFace === 'number') ? info.hitFace : -1;
    var exteriorFace = getExteriorFace(info.mapX, info.mapY);
    var interiorFace = (exteriorFace >= 0) ? ((exteriorFace + 2) % 4) : -1;

    // ── Interior face: leave transparent ─────────────────────────
    if (exteriorFace >= 0 && hitFace === interiorFace) {
      return;
    }

    // ── Side faces: solid wall masonry ───────────────────────────
    if (exteriorFace < 0 || hitFace !== exteriorFace) {
      var bW = info.brightness;
      var sR = Math.round(75 * bW);
      var sG = Math.round(68 * bW);
      var sB = Math.round(60 * bW);
      var fW = info.fogFactor;
      if (fW > 0) {
        sR = Math.round(sR * (1 - fW) + info.fogColor.r * fW);
        sG = Math.round(sG * (1 - fW) + info.fogColor.g * fW);
        sB = Math.round(sB * (1 - fW) + info.fogColor.b * fW);
      }
      ctx.fillStyle = 'rgb(' + sR + ',' + sG + ',' + sB + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
      return;
    }

    // ── Exterior face: door portal ───────────────────────────────
    // Batch-drawn (no per-pixel loop) so filler cost is O(1) per
    // column, not O(gapH).
    //
    // Tier A: if a door-panel texture is assigned, sample it via
    // ctx.drawImage (1px column). Otherwise fall back to the
    // procedural 3-band dark gradient.
    var bAdj    = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);
    var wallX   = info.wallX;
    var fF      = info.fogFactor;
    var side    = info.side;

    // ── 1. Door panel texture (Tier A) or dark gradient fallback ──
    // Check for double-door pairing: if paired, use the wide (128×64)
    // texture and remap wallX to the correct half.
    var pair    = getPairInfo(info.mapX, info.mapY);
    var panelId, panelTex;

    if (pair) {
      panelId  = getDoubleDoorPanel(info.mapX, info.mapY);
      panelTex = (panelId && typeof TextureAtlas !== 'undefined')
        ? TextureAtlas.get(panelId) : null;
    }
    if (!panelTex || !panelTex.canvas) {
      // Fall back to single-tile panel (standard or unpaired)
      panelId  = getDoorPanel(info.mapX, info.mapY);
      panelTex = (panelId && typeof TextureAtlas !== 'undefined')
        ? TextureAtlas.get(panelId) : null;
      pair = null;  // disable UV remap for single panels
    }

    if (panelTex && panelTex.canvas) {
      // Sample 1px-wide column from the panel texture.
      // For paired tiles: remap wallX from 0–1 (single tile) to the
      // correct half of the 128-wide texture.
      var sampleU = wallX;
      if (pair) {
        if (pair.side === 'left') {
          sampleU = wallX * 0.5;            // columns 0–63
        } else {
          sampleU = 0.5 + wallX * 0.5;     // columns 64–127
        }
      }
      var texX = Math.floor(sampleU * panelTex.width);
      if (texX >= panelTex.width) texX = panelTex.width - 1;
      ctx.drawImage(panelTex.canvas, texX, 0, 1, panelTex.height,
                    col, gapStart, 1, gapH);
      // Side shading — Y-axis faces (side=1) get shadow for
      // consistent depth cue with the lintel band above.
      if (side === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(col, gapStart, 1, gapH);
      }
      // Fog + brightness overlay
      if (fF > 0.01 || bAdj < 0.99) {
        var dim = (1 - bAdj) + fF * bAdj;
        if (dim > 0.01) {
          var oR = Math.round(info.fogColor.r * fF);
          var oG = Math.round(info.fogColor.g * fF);
          var oB = Math.round(info.fogColor.b * fF);
          ctx.fillStyle = 'rgba(' + oR + ',' + oG + ',' + oB + ',' + dim.toFixed(3) + ')';
          ctx.fillRect(col, gapStart, 1, gapH);
        }
      }
    } else {
      // ── Fallback: 3-band dark gradient (no panel texture) ──
      var bandCount = 3;
      var bandH     = Math.max(1, Math.floor(gapH / bandCount));
      var xDist   = Math.abs(wallX - 0.5) * 2;
      var edgeDim = 1 - xDist * 0.35;
      var bases = [0.18 * edgeDim, 0.08 * edgeDim, 0.03 * edgeDim];
      for (var bi = 0; bi < bandCount; bi++) {
        var bH = (bi === bandCount - 1) ? (gapH - bandH * (bandCount - 1)) : bandH;
        if (bH <= 0) continue;
        var b  = bases[bi] * bAdj * fogFade;
        var bR = Math.round(Math.min(255, b * 100 + 8));
        var bG = Math.round(Math.min(255, b * 80  + 6));
        var bB = Math.round(Math.min(255, b * 60  + 4));
        if (fF > 0) {
          bR = Math.round(bR * (1 - fF) + info.fogColor.r * fF);
          bG = Math.round(bG * (1 - fF) + info.fogColor.g * fF);
          bB = Math.round(bB * (1 - fF) + info.fogColor.b * fF);
        }
        ctx.fillStyle = 'rgb(' + bR + ',' + bG + ',' + bB + ')';
        ctx.fillRect(col, gapStart + bandH * bi, 1, bH);
      }
    }

    // ── 2. Door frame overlay — dark jamb edges + lintel bottom ──
    // Drawn on top of both the texture and the gradient fallback.
    // For paired tiles: suppress the frame on the shared inner edge —
    // the center seam is baked into the wide texture.
    var frameW = 0.06 + 0.02 / Math.max(0.5, info.perpDist);
    var pairRef = getPairInfo(info.mapX, info.mapY);
    var isFrame;
    if (pairRef && pairRef.side === 'left') {
      isFrame = (wallX < frameW);                    // outer jamb only
    } else if (pairRef && pairRef.side === 'right') {
      isFrame = (wallX > 1 - frameW);               // outer jamb only
    } else {
      isFrame = (wallX < frameW || wallX > 1 - frameW);
    }
    var frR = Math.round(35 * bAdj);
    var frG = Math.round(28 * bAdj);
    var frB = Math.round(20 * bAdj);
    if (fF > 0) {
      frR = Math.round(frR * (1 - fF) + info.fogColor.r * fF);
      frG = Math.round(frG * (1 - fF) + info.fogColor.g * fF);
      frB = Math.round(frB * (1 - fF) + info.fogColor.b * fF);
    }
    var frameColor = 'rgb(' + frR + ',' + frG + ',' + frB + ')';
    if (isFrame) {
      ctx.fillStyle = frameColor;
      ctx.fillRect(col, gapStart, 1, gapH);
    }
    // Lintel bottom edge — always 1px
    ctx.fillStyle = frameColor;
    ctx.fillRect(col, gapStart, 1, 1);
    // Threshold top edge — 1px at bottom of gap
    if (gapH > 2) {
      ctx.fillStyle = frameColor;
      ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
    }
  }


  // ── trapdoor_shaft gap filler ──────────────────────────────────
  //
  // Hearth-pattern transparent cavity: the shaft is LITERALLY see-
  // through. Back-layer walls (the room behind the trapdoor tile)
  // have already been painted by the N-layer collector because
  // _fgIsFreeformSeeThrough allows collection behind this tile.
  //
  // We paint three overlay layers on top of the existing content:
  //
  //   1. Cool-dark tint — direction-aware depth wash so the shaft
  //      reads as a receding hole rather than a flat window.
  //      TRAPDOOR_DN: darker toward bottom (looking down into abyss).
  //      TRAPDOOR_UP: darker toward top (looking up into shadow).
  //
  //   2. Hatch frame border — dark 8% edge strips on left/right +
  //      single-pixel top/bottom lines. Reads as the timber frame
  //      of the opening.
  //
  //   3. No ladder rungs here — the ladder is a billboard sprite
  //      emitted by BonfireSprites (same pattern as HEARTH dragonfire).
  //      The sprite has proper parallax and depth through the z-bypass
  //      path. See Tier 4 in TRAPDOOR_ARCHITECTURE_ROADMAP.md.
  //
  // All four faces render identically (no exterior/interior distinction).
  //
  function _trapdoorShaftFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var bAdj    = info.brightness;
    var fF      = info.fogFactor;
    var fogFade = 1 - Math.min(0.85, fF);
    var wallX   = info.wallX;
    var isDown  = (info.hitTile === 75);  // TRAPDOOR_DN

    // 1. Direction-aware depth tint — semi-transparent gradient overlay.
    //    Two bands: near-opening (lighter) and deep-shaft (darker).
    //    The tint is cool-blue-grey, not warm amber like hearth_fire.
    var nearA = 0.10 * bAdj * fogFade;  // light wash near the opening
    var deepA = 0.30 * bAdj * fogFade;  // heavier wash into the shaft

    if (nearA > 0.005 || deepA > 0.005) {
      var halfH = Math.max(1, Math.floor(gapH / 2));
      // DN: top half is near-opening (lighter), bottom half is deep
      // UP: bottom half is near-opening (lighter), top half is deep
      var topA  = isDown ? nearA : deepA;
      var botA  = isDown ? deepA : nearA;

      if (topA > 0.005) {
        ctx.fillStyle = 'rgba(15,20,30,' + topA.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, halfH);
      }
      if (botA > 0.005) {
        ctx.fillStyle = 'rgba(15,20,30,' + botA.toFixed(3) + ')';
        ctx.fillRect(col, gapStart + halfH, 1, gapH - halfH);
      }
    }

    // 2. Hatch frame — dark timber border around the cavity opening.
    //    8% edge strips on left/right + 1px lines at top and bottom.
    var frameW = 0.08;
    var isFrame = (wallX < frameW || wallX > 1 - frameW);
    if (isFrame) {
      var frameA = 0.45 * bAdj * fogFade;
      if (frameA > 0.005) {
        ctx.fillStyle = 'rgba(20,15,10,' + frameA.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, gapH);
      }
    }
    // Top and bottom edge lines
    var edgeA = 0.35 * bAdj * fogFade;
    if (edgeA > 0.005) {
      ctx.fillStyle = 'rgba(20,15,10,' + edgeA.toFixed(3) + ')';
      ctx.fillRect(col, gapStart, 1, 1);
      if (gapH > 1) ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
    }
  }

  // ── Public API ──────────────────────────────────────────────────
  return Object.freeze({
    setTexture:            setTexture,
    setDoorPanel:          setDoorPanel,
    setExteriorFace:       setExteriorFace,
    setPairInfo:           setPairInfo,
    setDoubleDoorPanel:    setDoubleDoorPanel,
    setFloor:              setFloor,
    getWallTexture:        getWallTexture,
    getDoorPanel:          getDoorPanel,
    getExteriorFace:       getExteriorFace,
    getPairInfo:           getPairInfo,
    getDoubleDoorPanel:    getDoubleDoorPanel,
    isExteriorHit:         isExteriorHit,
    clear:                 clear,
    ensureFillerRegistered: _ensureFillerRegistered
  });
})();

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
  // "x,y" → exterior face index (0=E, 1=S, 2=W, 3=N), set by FloorManager
  var _exteriorFaces = {};
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
   * Mark which floor the cache belongs to.
   */
  function setFloor(floorId) {
    _cachedFloorId = floorId;
  }

  // ── Queries ────────────────────────────────────────────────────

  function getWallTexture(x, y) {
    return _doorTextures[x + ',' + y] || null;
  }

  function getExteriorFace(x, y) {
    var f = _exteriorFaces[x + ',' + y];
    return (typeof f === 'number') ? f : -1;
  }

  /**
   * Clear all caches. Called when switching floors.
   */
  function clear() {
    _doorTextures = {};
    _exteriorFaces = {};
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
    // Dark interior with door frame border.  Batch-drawn (no per-pixel
    // loop) so filler cost is O(1) per column, not O(gapH).
    var bAdj    = info.brightness;
    var fogFade = 1 - Math.min(0.85, info.fogFactor);
    var wallX   = info.wallX;
    var fF      = info.fogFactor;

    // 1. Dark interior wash — 3-band vertical gradient.
    //    Top band (ambient spill), mid band (receding dark), bottom
    //    band (deepest shadow).  Three fillRect calls total.
    var bandCount = 3;
    var bandH     = Math.max(1, Math.floor(gapH / bandCount));
    // Horizontal edge darkening (vignette substitute)
    var xDist   = Math.abs(wallX - 0.5) * 2;            // 0 center, 1 edge
    var edgeDim = 1 - xDist * 0.35;                     // 0.65 at edge → 1 at center
    // Per-band base brightness: top = warm, bottom = near-black
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

    // 2. Door frame — dark vertical edges + top threshold.
    var frameW = 0.06 + 0.02 / Math.max(0.5, info.perpDist);
    var isFrame = (wallX < frameW || wallX > 1 - frameW);
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
  }


  // ── trapdoor_shaft gap filler ──────────────────────────────────
  //
  // Renders the interior of a trapdoor hatch — a dark shaft with
  // evenly spaced ladder rungs. Direction-aware:
  //   TRAPDOOR_DN (75) → dark at bottom (looking down into shaft)
  //   TRAPDOOR_UP (76) → dark at bottom conceptually but visually
  //     the shaft is above so the gradient inverts (bright at bottom,
  //     dark at top — light spills DOWN from the opening).
  //
  // All faces render the same (no exterior/interior distinction like
  // DOOR_FACADE). Trapdoors are visible from all 4 sides in a room.
  //
  function _trapdoorShaftFiller(ctx, col, gapStart, gapH, info) {
    if (gapH <= 0) return;

    var bAdj    = info.brightness;
    var fF      = info.fogFactor;
    var fogFade = 1 - Math.min(0.85, fF);
    var wallX   = info.wallX;
    var isDown  = (info.hitTile === 75);  // TRAPDOOR_DN

    // 1. Dark shaft gradient — 3 bands
    var bandCount = 3;
    var bandH     = Math.max(1, Math.floor(gapH / bandCount));
    // Down shaft: dark at bottom (band 2 darkest).
    // Up shaft: dark at top (band 0 darkest, invert).
    var basesDown = [0.12, 0.06, 0.02];
    var basesUp   = [0.02, 0.06, 0.12];
    var bases     = isDown ? basesDown : basesUp;

    for (var bi = 0; bi < bandCount; bi++) {
      var bH = (bi === bandCount - 1) ? (gapH - bandH * (bandCount - 1)) : bandH;
      if (bH <= 0) continue;
      var b  = bases[bi] * bAdj * fogFade;
      var bR = Math.round(Math.min(255, b * 60 + 5));
      var bG = Math.round(Math.min(255, b * 55 + 4));
      var bB = Math.round(Math.min(255, b * 50 + 3));
      if (fF > 0) {
        bR = Math.round(bR * (1 - fF) + info.fogColor.r * fF);
        bG = Math.round(bG * (1 - fF) + info.fogColor.g * fF);
        bB = Math.round(bB * (1 - fF) + info.fogColor.b * fF);
      }
      ctx.fillStyle = 'rgb(' + bR + ',' + bG + ',' + bB + ')';
      ctx.fillRect(col, gapStart + bandH * bi, 1, bH);
    }

    // 2. Ladder rungs — horizontal bars spaced evenly through the cavity.
    //    4 rungs regardless of gap height; each is 1–2px tall.
    var rungCount = 4;
    var rungSpacing = gapH / (rungCount + 1);
    if (rungSpacing >= 2) {
      // Rung colour: warm wood brown, dimmed by brightness + fog
      var rB = Math.round(Math.min(255, 0.25 * bAdj * fogFade * 140 + 15));
      var rG = Math.round(Math.min(255, 0.25 * bAdj * fogFade * 100 + 10));
      var rBl = Math.round(Math.min(255, 0.25 * bAdj * fogFade * 50 + 5));
      if (fF > 0) {
        rB = Math.round(rB * (1 - fF) + info.fogColor.r * fF);
        rG = Math.round(rG * (1 - fF) + info.fogColor.g * fF);
        rBl = Math.round(rBl * (1 - fF) + info.fogColor.b * fF);
      }
      ctx.fillStyle = 'rgb(' + rB + ',' + rG + ',' + rBl + ')';
      // Only draw rungs in the center 60% of the face (ladder width)
      var ladderL = 0.20;
      var ladderR = 0.80;
      if (wallX >= ladderL && wallX <= ladderR) {
        for (var ri = 1; ri <= rungCount; ri++) {
          var rungY = Math.floor(gapStart + ri * rungSpacing);
          ctx.fillRect(col, rungY, 1, Math.max(1, Math.round(gapH / 40)));
        }
      }
    }

    // 3. Hatch frame — dark border around the cavity edge
    var frameW = 0.08;
    var isFrame = (wallX < frameW || wallX > 1 - frameW);
    if (isFrame) {
      var fR = Math.round(25 * bAdj);
      var fG = Math.round(20 * bAdj);
      var fBl = Math.round(15 * bAdj);
      if (fF > 0) {
        fR = Math.round(fR * (1 - fF) + info.fogColor.r * fF);
        fG = Math.round(fG * (1 - fF) + info.fogColor.g * fF);
        fBl = Math.round(fBl * (1 - fF) + info.fogColor.b * fF);
      }
      ctx.fillStyle = 'rgb(' + fR + ',' + fG + ',' + fBl + ')';
      ctx.fillRect(col, gapStart, 1, gapH);
    }
    // Top and bottom edge lines
    var edgeR = Math.round(30 * bAdj);
    var edgeG = Math.round(25 * bAdj);
    var edgeBl = Math.round(18 * bAdj);
    if (fF > 0) {
      edgeR = Math.round(edgeR * (1 - fF) + info.fogColor.r * fF);
      edgeG = Math.round(edgeG * (1 - fF) + info.fogColor.g * fF);
      edgeBl = Math.round(edgeBl * (1 - fF) + info.fogColor.b * fF);
    }
    ctx.fillStyle = 'rgb(' + edgeR + ',' + edgeG + ',' + edgeBl + ')';
    ctx.fillRect(col, gapStart, 1, 1);
    ctx.fillRect(col, gapStart + gapH - 1, 1, 1);
  }

  // ── Public API ──────────────────────────────────────────────────
  return Object.freeze({
    setTexture:            setTexture,
    setExteriorFace:       setExteriorFace,
    setFloor:              setFloor,
    getWallTexture:        getWallTexture,
    getExteriorFace:       getExteriorFace,
    clear:                 clear,
    ensureFillerRegistered: _ensureFillerRegistered
  });
})();

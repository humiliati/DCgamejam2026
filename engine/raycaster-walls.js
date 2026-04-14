/**
 * RaycasterWalls — per-column wall draw helpers.
 *
 * Phase 2 of the raycaster extraction roadmap (see
 * docs/RAYCASTER_EXTRACTION_ROADMAP.md, EX-5).
 *
 * Exposes four functions the DDA wall phase calls per column:
 *
 *   - drawTiledColumn(ctx, tex, texX, wallTop, lineH,
 *                     drawStart, drawEnd, col, whMult, tileType)
 *       Fast path. Uses ctx.drawImage() — one call per texture tile
 *       segment. WALL tiles above 1.0× repeat vertically; everything
 *       else stretches.
 *
 *   - drawTiledColumnPixel(ctx, tex, texX, wallTop, lineH,
 *                          drawStart, drawEnd, col, whMult, tileType,
 *                          grimeGrid, wallU)
 *       Per-pixel path. Samples texture manually so GrimeGrid subcell
 *       tints composite on top of the brick texture. Used only for
 *       columns whose hit tile has a grime grid — clean columns stay
 *       on drawTiledColumn.
 *
 *   - hitFace(sd, stX, stY)
 *       DDA side + step → 'n'/'s'/'e'/'w' face key for wall-decor
 *       lookup. Pure.
 *
 *   - crenelFaceVisible(mx, my, side)
 *       Rampart roofline face culling. Called from the DDA front-hit
 *       loop and back-layer collection when a ROOF_CRENEL tile is
 *       encountered. Reads the active floor grid via lazy bind().
 *
 * Module-owned state:
 *   - _wallColImgData / _wallColBuf / _wallColBufH — 1px column scratch
 *     buffer for drawTiledColumnPixel. Reallocated when the offscreen
 *     height changes.
 *
 * Layer 2 — loaded after raycaster-floor.js, before raycaster.js.
 */
var RaycasterWalls = (function () {
  'use strict';

  // ── Grime tint constants (mirrored in raycaster-floor.js) ────────
  var _GRIME_R = 82, _GRIME_G = 68, _GRIME_B = 46;

  // ── Pre-allocated 1-pixel-wide column buffer ─────────────────────
  // Lazy-init on first drawTiledColumnPixel call; resized when the
  // offscreen height changes (bind().height()).
  var _wallColImgData = null;
  var _wallColBuf = null;
  var _wallColBufH = 0;

  // ── State binding ────────────────────────────────────────────────
  //   height()  → offscreen render height (int) — used to size the
  //               column scratch buffer.
  //   grid(), gridW(), gridH() → active floor grid + dims for the
  //               crenel face-visibility check. Change per frame as
  //               render() stashes them before the DDA loop.
  var _s = null;
  function bind(getters) { _s = getters; }

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
  // loop. Reads the current floor grid through the bind() getter.
  function crenelFaceVisible(mx, my, side) {
    if (!_s) return true;
    var g = _s.grid();
    if (!g) return true; // safety fallback
    var gW = _s.gridW();
    var gH = _s.gridH();
    var W = TILES.WALL;

    // Tier 1 — direct WALL on the hit axis
    if (side === 0) {
      // X-axis hit (east/west face): check E/W neighbors for WALL
      if (mx > 0 && g[my][mx - 1] === W) return true;
      if (mx < gW - 1 && g[my][mx + 1] === W) return true;
    } else {
      // Y-axis hit (north/south face): check N/S neighbors for WALL
      if (my > 0 && g[my - 1][mx] === W) return true;
      if (my < gH - 1 && g[my + 1][mx] === W) return true;
    }

    // Tier 2 — corner detection: no direct WALL in ANY cardinal
    // direction, but CRENEL neighbors on both perpendicular axes.
    // Corners wrap the rampart roofline and render on all faces.
    var hasAnyWall = false;
    if (mx > 0 && g[my][mx - 1] === W) hasAnyWall = true;
    if (!hasAnyWall && mx < gW - 1 && g[my][mx + 1] === W) hasAnyWall = true;
    if (!hasAnyWall && my > 0 && g[my - 1][mx] === W) hasAnyWall = true;
    if (!hasAnyWall && my < gH - 1 && g[my + 1][mx] === W) hasAnyWall = true;
    if (hasAnyWall) return false; // has wall but not on this axis → skip

    // No wall anywhere — possible corner piece.
    var CR = TILES.ROOF_CRENEL;
    var hasXCrenel = (mx > 0 && g[my][mx - 1] === CR) ||
                     (mx < gW - 1 && g[my][mx + 1] === CR);
    var hasYCrenel = (my > 0 && g[my - 1][mx] === CR) ||
                     (my < gH - 1 && g[my + 1][mx] === CR);
    if (hasXCrenel && hasYCrenel) return true; // L-bend corner

    return false;
  }

  // ── Hit-face lookup ──────────────────────────────────────────────
  // Determine which wall face was hit.
  //   sd  — DDA side (0=vertical grid line, 1=horizontal)
  //   stX — step direction X (+1 or -1)
  //   stY — step direction Y (+1 or -1)
  // Returns face key: 'n' | 's' | 'e' | 'w'.
  function hitFace(sd, stX, stY) {
    // side 0 (vertical line): ray going right (+X) hits the WEST face;
    //                          ray going left (-X) hits the EAST face
    // side 1 (horizontal line): ray going south (+Y) hits the NORTH face;
    //                            ray going north (-Y) hits the SOUTH face
    if (sd === 0) return stX > 0 ? 'w' : 'e';
    return stY > 0 ? 'n' : 's';
  }

  // ── Tiled texture column renderer (fast path) ────────────────────
  // Draws a single textured wall column with vertical tiling for WALL
  // tiles only (bricks). Doors, trees, concrete, and all other tile
  // types use stretch mapping — their textures are designed for their
  // specific height multiplier.
  function drawTiledColumn(ctx, tex, texX, wallTop, lineH, drawStart, drawEnd, col, whMult, tileType) {
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

  // ── Per-pixel wall column renderer (PW-1 grime hook) ─────────────
  // Reads texture data directly and writes via ImageData, enabling
  // per-pixel grime tinting. Only used for wall columns that have a
  // GrimeGrid — clean columns keep the fast ctx.drawImage path above.
  //
  // Replicates drawTiledColumn logic but samples texture pixels manually
  // so grime can be composited per-pixel. The grime grid is a Uint8Array
  // of resolution×resolution subcells — the wallU selects the horizontal
  // subcell and the vertical V within the column selects the vertical one.
  function drawTiledColumnPixel(ctx, tex, texX, wallTop, lineH,
                                drawStart, drawEnd, col, whMult, tileType,
                                grimeGrid, wallU) {
    var stripH = drawEnd - drawStart + 1;
    if (stripH <= 0 || lineH <= 0) return;

    var height = _s ? _s.height() : 0;

    // Lazy-init / grow the shared column buffer
    if (!_wallColImgData || _wallColBufH < height) {
      _wallColImgData = ctx.createImageData(1, height);
      _wallColBuf = _wallColImgData.data;
      _wallColBufH = height;
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

  /**
   * Reset the column scratch buffer. Called from the Raycaster resize
   * path so drawTiledColumnPixel reallocates at the new height next
   * frame.
   */
  function resetBuffer() {
    _wallColImgData = null;
    _wallColBuf = null;
    _wallColBufH = 0;
  }

  return Object.freeze({
    bind: bind,
    resetBuffer: resetBuffer,
    drawTiledColumn: drawTiledColumn,
    drawTiledColumnPixel: drawTiledColumnPixel,
    hitFace: hitFace,
    crenelFaceVisible: crenelFaceVisible
  });
})();

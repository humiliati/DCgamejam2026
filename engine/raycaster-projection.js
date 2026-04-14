/**
 * RaycasterProjection — editor/tool projection APIs extracted from
 * raycaster.js.
 *
 * Phase 1 of the raycaster extraction roadmap (see
 * docs/RAYCASTER_EXTRACTION_ROADMAP.md, EX-3).
 *
 * Exposes three functions that were previously on Raycaster's public
 * API:
 *
 *   - castScreenRay(sx, sy, grid, gw, gh)   — cursor → wall-hit info
 *   - findTileScreenRange(tileX, tileY)     — scan pedestal buffers
 *   - projectWorldToScreen(tileX, tileY,    — world tile → screen xy
 *                          camX, camY, camDir,
 *                          spriteScale, worldOffsetY)
 *
 * None of these are per-column hotpath calls. castScreenRay runs once
 * per pointer event. projectWorldToScreen runs per DOM sprite (handful
 * per frame). findTileScreenRange runs per freeform-cavity sprite.
 *
 * State access is resolved through a lazy binding the Raycaster IIFE
 * installs at the end of its setup. Each getter is a zero-arg function
 * returning the live closure variable; this keeps RaycasterProjection
 * decoupled from Raycaster's internal symbol names while still letting
 * mutations (resize, floor change, render frame) land in subsequent
 * calls.
 *
 * Layer 2 — loaded after raycaster-textures.js, before raycaster.js.
 */
var RaycasterProjection = (function () {
  'use strict';

  // ── FOV constants (moved with projectWorldToScreen) ──────────────
  // Must match the FOV used in Raycaster.render()'s DDA loop — this is
  // the inverse of that projection.
  var _FOV = Math.PI / 3;
  var _HALF_FOV = _FOV / 2;

  // ── State binding ────────────────────────────────────────────────
  // Raycaster installs getters here once at IIFE end via bind(). If
  // a projection function is called before binding (e.g. during early
  // page load), it returns null gracefully.
  //
  // Required getters (all zero-arg, return current value):
  //   canvas()        → HTMLCanvasElement (main canvas)
  //   width(), height() → offscreen render dimensions (int)
  //   contract()      → active SpatialContract or null
  //   rooms()         → active rooms array or null
  //   cellHeights()   → per-cell wall-height map or null
  //   renderScale()   → internal render scale factor (0..1)
  //   lastHalfH()     → last pitch-shifted horizon from render()
  //   zBuffer()       → per-column wall depth array
  //   pedBuffers()    → { mx, my, topY } per-column pedestal arrays
  var _s = null;

  function bind(getters) {
    _s = getters;
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
    if (!_s) return null;
    var canvas = _s.canvas();
    var w = _s.width();
    var h = _s.height();
    if (!canvas || !grid) return null;
    if (w < 1 || h < 1) return null;

    var contract = _s.contract();
    var rooms = _s.rooms();
    var cellHeights = _s.cellHeights();
    var renderScale = _s.renderScale();

    // Incoming pointer coords are in main-canvas (CSS) pixel space,
    // but raycasting happens in the offscreen viewport at w × h. Map
    // the cursor from CSS space → offscreen space so the cameraX /
    // screenY math below stays in the casting coordinate system.
    if (canvas.width > 0 && canvas.height > 0) {
      screenX = screenX * (w / canvas.width);
      screenY = screenY * (h / canvas.height);
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
    var _baseRenderDist = contract ? contract.renderDistance : 16;
    var _csBoost = (renderScale > 0.01) ? Math.max(1.0, 1.0 / renderScale) : 1.0;
    var renderDist = Math.min(80, _baseRenderDist * _csBoost);
    var baseWallH = contract ? contract.wallHeight : 1.0;

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

    // Wall U coordinate (horizontal position on face, 0..1)
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

    // Wall V coordinate (vertical position on face, 0..1)
    var wallHeightMult = baseWallH;
    if (contract && typeof SpatialContract !== 'undefined') {
      wallHeightMult = SpatialContract.getWallHeight(contract, mapX, mapY, rooms, hitTile, cellHeights);
    }
    var lineHeight = Math.max(2, Math.floor((h * wallHeightMult) / perpDist));
    var heightOffset = (contract && typeof SpatialContract !== 'undefined')
      ? SpatialContract.getTileHeightOffset(contract, hitTile) : 0;
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

  // ── Pedestal-buffer tile scan ──────────────────────────────────
  /**
   * Scan the pedestal occlusion buffers to find the exact screen column
   * range where a given tile was rendered as a freeform pedestal (HEARTH,
   * CITY_BONFIRE, etc.). Returns the leftmost column, rightmost column,
   * center column, and the pedestal top screen-Y at center.
   *
   * This is far more accurate than angular projection for positioning
   * DOM sprites inside freeform cavities, because it uses the actual
   * DDA rendering results rather than approximating the geometry.
   *
   * @param {number} tileX - grid X of the target tile
   * @param {number} tileY - grid Y of the target tile
   * @returns {Object|null} { minCol, maxCol, centerCol, centerPedY, w, h }
   *   or null if the tile isn't visible in any pedestal column.
   */
  function findTileScreenRange(tileX, tileY) {
    if (!_s) return null;
    var ped = _s.pedBuffers();
    if (!ped || !ped.mx || !ped.mx.length) return null;

    var width = _s.width();
    var height = _s.height();

    var mx = ped.mx;
    var my = ped.my;
    var topY = ped.topY;

    var minCol = -1;
    var maxCol = -1;
    var pedYSum = 0;
    var pedYCount = 0;

    for (var col = 0; col < width; col++) {
      if (mx[col] === tileX && my[col] === tileY) {
        if (minCol === -1) minCol = col;
        maxCol = col;
        pedYSum += topY[col];
        pedYCount++;
      }
    }

    if (minCol === -1) return null;

    var centerCol = Math.floor((minCol + maxCol) / 2);
    var avgPedY = Math.floor(pedYSum / pedYCount);

    return {
      minCol:     minCol,
      maxCol:     maxCol,
      centerCol:  centerCol,
      centerPedY: avgPedY,
      w:          width,
      h:          height
    };
  }

  // ── Sprite-layer projection API ──────────────────────────────────
  // Exposes the same projection math _renderSprites uses internally
  // so the DOM sprite-layer can position CSS overlays in world space.
  /**
   * Project a world tile to screen coordinates for DOM sprite overlay.
   *
   * @param {number} tileX, tileY  — grid position
   * @param {number} camX, camY    — camera world position
   * @param {number} camDir        — camera angle (radians)
   * @param {number} [spriteScale] — billboard scale (default 0.6)
   * @param {number} [worldOffsetY] — vertical offset: 0 = eye level,
   *   positive = below eye level (toward floor). Units are fraction of
   *   wall height at distance 1. 0.5 = bottom of a standard wall.
   */
  function projectWorldToScreen(tileX, tileY, camX, camY, camDir, spriteScale, worldOffsetY) {
    if (!_s) return null;
    // Use the RENDER-SPACE dimensions — these match the z-buffer length.
    // canvas.width is the full-res display canvas which is larger than
    // width when RENDER_SCALE < 1.0; using it would cause the z-buffer
    // loop to read undefined entries for center-screen sprites.
    var canvas = _s.canvas();
    var w = _s.width()  || (canvas ? canvas.width  : 320);
    var h = _s.height() || (canvas ? canvas.height : 200);
    var dx = (tileX + 0.5) - camX;
    var dy = (tileY + 0.5) - camY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.3 || dist > 16) return null;

    var angle = Math.atan2(dy, dx) - camDir;
    while (angle >  Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    if (Math.abs(angle) > _HALF_FOV + 0.3) return null;

    // Perspective-correct inverse of the DDA's column→angle mapping:
    //   DDA: rayAngle = pDir + atan(cameraX * tan(halfFov))
    //   Inverse: cameraX = tan(angle) / tan(halfFov)
    // The old linear formula (angle / halfFov) drifted ~9% at 10° off-
    // center, sliding DOM sprites out of freeform cavities.
    var _tanHF = Math.tan(_HALF_FOV);
    var screenX = Math.floor((1 + Math.tan(angle) / _tanHF) * w / 2);
    var baseScale = (spriteScale || 0.6) / dist;
    var spriteH = Math.floor(h * baseScale);
    var spriteW = spriteH;
    var drawX = screenX - spriteW / 2;
    // Vertical position: use the pitch-shifted horizon (lastHalfH) so
    // DOM sprites track the camera's vertical look direction, matching
    // the raycaster's wall/sprite rendering. Falls back to h/2 if no
    // render has occurred yet.
    var lastHalfH = _s.lastHalfH();
    var horizon = lastHalfH || (h / 2);
    var yShift = worldOffsetY ? Math.floor((worldOffsetY / dist) * h) : 0;
    var screenY = Math.floor(horizon - spriteH / 2) + yShift;

    // Z-buffer occlusion check
    var zBuffer = _s.zBuffer();
    var startCol = Math.max(0, Math.floor(drawX));
    var endCol   = Math.min(w - 1, Math.floor(drawX + spriteW));
    var visible = false;
    for (var col = startCol; col <= endCol; col++) {
      if (zBuffer[col] > dist) { visible = true; break; }
    }

    return {
      screenX: screenX,
      screenY: screenY,
      dist: dist,
      scaleH: spriteH,
      scaleW: spriteW,
      visible: visible,
      startCol: startCol,
      endCol: endCol,
      canvasW: w,
      canvasH: h
    };
  }

  return Object.freeze({
    bind: bind,
    castScreenRay: castScreenRay,
    findTileScreenRange: findTileScreenRange,
    projectWorldToScreen: projectWorldToScreen
  });
})();

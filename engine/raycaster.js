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

  var _canvas = null;
  var _ctx = null;
  var _width = 0;
  var _height = 0;
  var _zBuffer = [];

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
  var _MAX_LAYERS = 6; // shrub → pillar → tree → building → far wall → skyline
  var _MAX_BG_STEPS = 24; // max DDA steps past first hit (increased for deeper views)
  var _layerBuf = [
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 },
    { mx: 0, my: 0, sd: 0, tile: 0 }
  ];

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _ctx.imageSmoothingEnabled = false;
    if (_ctx.webkitImageSmoothingEnabled !== undefined) _ctx.webkitImageSmoothingEnabled = false;
    _resize();
    window.addEventListener('resize', _resize);
  }

  function _resize() {
    var container = _canvas.parentElement;
    _canvas.width = container.clientWidth;
    _canvas.height = container.clientHeight;
    _width = _canvas.width;
    _height = _canvas.height;
    _zBuffer = new Array(_width);
  }

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
    var renderDist = _contract ? _contract.renderDistance : 16;
    var fogDist    = _contract ? _contract.fogDistance : 12;
    var fogColor   = _contract ? _contract.fogColor : { r: 0, g: 0, b: 0 };
    var baseWallH  = _contract ? _contract.wallHeight : 1.0;

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

        // Track tallest layer seen — only collect hits that add visible
        // area above the current stack. Same-height walls (e.g. shrub
        // behind shrub) are fully occluded by the closer one, so skip
        // them and keep searching for something taller.
        var _maxH = SpatialContract.getWallHeight(_contract, mapX, mapY, _rooms, hitTile, _cellHeights);

        // Continue DDA to collect up to MAX_LAYERS total hits
        var _cSdX = sideDistX, _cSdY = sideDistY;
        var _cMX = mapX, _cMY = mapY, _cSd = 0;
        var _cDep = depth;
        while (_lc < _MAX_LAYERS && _cDep < renderDist && (_cDep - depth) < _MAX_BG_STEPS) {
          if (_cSdX < _cSdY) {
            _cSdX += deltaDistX; _cMX += stepX; _cSd = 0;
          } else {
            _cSdY += deltaDistY; _cMY += stepY; _cSd = 1;
          }
          _cDep++;
          if (_cMX < 0 || _cMX >= gridW || _cMY < 0 || _cMY >= gridH) break;
          var _cT = grid[_cMY][_cMX];
          if (TILES.isOpaque(_cT) || TILES.isDoor(_cT)) {
            var _cH = SpatialContract.getWallHeight(_contract, _cMX, _cMY, _rooms, _cT, _cellHeights);
            // Only record if taller than everything in front — shorter or
            // equal hits are fully occluded and waste a layer slot
            if (_cH > _maxH) {
              _layerBuf[_lc].mx = _cMX;
              _layerBuf[_lc].my = _cMY;
              _layerBuf[_lc].sd = _cSd;
              _layerBuf[_lc].tile = _cT;
              _lc++;
              _maxH = _cH;
              // Stop at max-height tiles — nothing visible behind them
              if (_cH >= 3.0) break;
            }
            // Same or shorter height: skip, keep searching
          }
        }
      }

      // ── Handle no-hit: consult spatial contract ──
      if (!hit) {
        if (_contract) {
          var distRes = SpatialContract.resolveDistantWall(_contract, renderDist);
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
      _zBuffer[col] = perpDist;

      // ── Wall height: contract tileWallHeights → chamber override → base ──
      var wallHeightMult = baseWallH;
      if (_contract) {
        wallHeightMult = SpatialContract.getWallHeight(_contract, mapX, mapY, _rooms, hitTile, _cellHeights);
      }
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

      // Fog from contract
      var fogFactor = _contract
        ? SpatialContract.getFogFactor(_contract, perpDist)
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
            fogDist, fogColor, lightMap,
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

        // Draw textured wall column — WALL tiles (brick) get vertical tiling
        // so patterns repeat on tall facades. All other tiles stretch.
        var shiftedTop = flatTop - vertShift;
        _drawTiledColumn(ctx, tex, texX, shiftedTop, lineHeight,
                         drawStart, drawEnd, col, wallHeightMult, hitTile);

        // Wall decor sprites (drawn before overlays so fog/shade affect them)
        _renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
                         mapX, mapY, side, stepX, stepY);

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
      if (vertShift !== 0 && _contract) {
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
            ctx.fillRect(col, lipTop, 1, lipBot - lipTop);
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

    // ── Render sprites ──
    if (sprites && sprites.length > 0) {
      _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor);
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
   * @param {number} drawStart - Top pixel of the wall strip
   * @param {number} drawEnd - Bottom pixel of the wall strip
   * @param {number} lineHeight - Full height of the wall in pixels (may exceed screen)
   * @param {number} mapX - Grid X of hit cell
   * @param {number} mapY - Grid Y of hit cell
   * @param {number} sd - DDA side
   * @param {number} stX - Step X
   * @param {number} stY - Step Y
   */
  function _renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
                            mapX, mapY, sd, stX, stY) {
    if (!_wallDecor) return;
    var row = _wallDecor[mapY];
    if (!row) return;
    var cell = row[mapX];
    if (!cell) return;

    var face = _hitFace(sd, stX, stY);
    var items = cell[face];
    if (!items || items.length === 0) return;

    var stripH = drawEnd - drawStart + 1;
    if (stripH <= 0) return;

    for (var di = 0; di < items.length; di++) {
      var d = items[di];
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
      var vMin = vCenter - vExtent / 2;
      var vMax = vCenter + vExtent / 2;

      // Map to screen pixels within the wall strip
      // wallV 0=top of wall, 1=bottom → sprite vMin/vMax are 0=bottom, 1=top
      // So screenTop = drawStart + (1 - vMax) * stripH
      var spriteTop = drawStart + (1 - vMax) * stripH;
      var spriteBot = drawStart + (1 - vMin) * stripH;
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
          var spriteCX = drawStart + (1 - d.anchorV) * stripH; // approximate
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
                            fogDist, fogColor, lightMap,
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

    // Bottom-anchored positioning (same as foreground)
    var flatBot = Math.floor(halfH + baseLH / 2);
    var flatTop = flatBot - lineH;
    var drStart = Math.max(0, flatTop);
    var drEnd   = Math.min(h - 1, flatBot);
    var stripH  = drEnd - drStart + 1;
    if (stripH <= 0) return;

    // Fog — skip fully fogged layers (invisible, saves draw calls)
    var fog = _contract
      ? SpatialContract.getFogFactor(_contract, pd)
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

    // Texture lookup
    var texId = SpatialContract.getTexture(_contract, L.tile);
    var tex = texId ? TextureAtlas.get(texId) : null;

    if (tex) {
      var texX = Math.floor(wx * tex.width);
      if (texX >= tex.width) texX = tex.width - 1;

      // Draw textured wall column — only WALL tiles tile their texture
      _drawTiledColumn(ctx, tex, texX, flatTop, lineH, drStart, drEnd, col, wh, L.tile);

      // Wall decor on back layers
      _renderWallDecor(ctx, col, wx, drStart, drEnd, lineH,
                       L.mx, L.my, L.sd, stepX, stepY);

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

      for (var col = 0; col < w; col++) {
        // Compute grid tile coordinates (used for per-tile texture and blood)
        var tileGX = Math.floor(floorX);
        var tileGY = Math.floor(floorY);

        // Select floor texture — per-tile override or default
        var curTexW = texW;
        var curTexH = texH;
        var curTexData = texData;

        if (tileFloorTexArr &&
            tileGX >= 0 && tileGX < gridW &&
            tileGY >= 0 && tileGY < gridH) {
          var altTex = tileFloorTexArr[grid[tileGY][tileGX]];
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

        // Blood splatter tint — red overlay on dirty tiles
        if (_bloodFloorId && typeof CleaningSystem !== 'undefined') {
          var blood = CleaningSystem.getBlood(tileGX, tileGY, _bloodFloorId);
          if (blood > 0) {
            // Blood intensity: 0.15–0.45 depending on blood level (1–3)
            var bloodAlpha = 0.15 * blood;
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
      var wantTint = (stack.tintHue !== null && stack.tintHue !== undefined && spriteH > 10);
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
        tc.globalCompositeOperation = 'source-atop';
        tc.globalAlpha = 0.22;
        var rgb = _hueToRgb(stack.tintHue);
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

  function _renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor) {
    var sorted = [];
    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      var dx = (s.x + 0.5) - px;
      var dy = (s.y + 0.5) - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3 || dist > renderDist) continue;

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
        ? SpatialContract.getFogFactor(_contract, dist)
        : Math.min(1, dist / fogDist);
      var alpha = Math.max(0.1, 1 - fogFactor);

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
        ctx.restore();
      } else if (s.color) {
        ctx.fillStyle = s.color;
        ctx.fillRect(drawX, spriteCenterY - spriteH / 2, spriteW, spriteH * ySquish);
      }

      // Close counter occlusion clip if active
      if (_counterClipped) {
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
      if (!_capsuleRendered && s.awareness !== undefined && spriteH > 8) {
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

  return {
    init: init,
    render: render,
    setBiomeColors: setBiomeColors,
    setContract: setContract,
    setBloodFloorId: function (id) { _bloodFloorId = id; }
  };
})();

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

  // Wall colors per biome
  var _wallColors = {
    light: '#8a7a6a', dark: '#6a5a4a',
    door: '#b08040', doorDark: '#906830'
  };

  // Active spatial contract (set per floor)
  var _contract = null;
  var _rooms = null; // Room list for chamber height lookups

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
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

  /** Set the active spatial contract and room list for this floor */
  function setContract(contract, rooms) {
    _contract = contract;
    _rooms = rooms || null;
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
    var halfH = h / 2;
    var fov = Math.PI / 3;
    var halfFov = fov / 2;

    // Read contract (fall back to defaults if none set)
    var renderDist = _contract ? _contract.renderDistance : 16;
    var fogDist    = _contract ? _contract.fogDistance : 12;
    var fogColor   = _contract ? _contract.fogColor : { r: 0, g: 0, b: 0 };
    var baseWallH  = _contract ? _contract.wallHeight : 1.0;

    // ── Background: ceiling + floor gradients from contract ──
    var grads = _contract ? SpatialContract.getGradients(_contract)
      : { ceilTop: '#111', ceilBottom: '#222', floorTop: '#444', floorBottom: '#111' };

    var cGrad = ctx.createLinearGradient(0, 0, 0, halfH);
    cGrad.addColorStop(0, grads.ceilTop);
    cGrad.addColorStop(1, grads.ceilBottom);
    ctx.fillStyle = cGrad;
    ctx.fillRect(0, 0, w, halfH);

    var fGrad = ctx.createLinearGradient(0, halfH, 0, h);
    fGrad.addColorStop(0, grads.floorTop);
    fGrad.addColorStop(1, grads.floorBottom);
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, halfH, w, halfH);

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
          if (tile === TILES.WALL || tile === TILES.PILLAR || tile === TILES.BREAKABLE) {
            hit = true; hitTile = tile;
          } else if (TILES.isDoor(tile)) {
            hit = true; hitTile = tile;
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
      if (perpDist < 0.01) perpDist = 0.01;
      _zBuffer[col] = perpDist;

      // ── Wall height: contract base × chamber override ──
      var wallHeightMult = baseWallH;
      if (_contract && _rooms) {
        wallHeightMult = SpatialContract.getWallHeight(_contract, mapX, mapY, _rooms);
      }

      var lineHeight = Math.floor((h * wallHeightMult) / perpDist);

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
      var flatTop    = Math.floor(halfH - lineHeight / 2);
      var flatBottom = Math.floor(halfH + lineHeight / 2);

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

      // Wall color
      var isDoor = TILES.isDoor(hitTile);
      var baseColor;
      if (isDoor) {
        baseColor = (side === 1) ? _wallColors.doorDark : _wallColors.door;
      } else {
        baseColor = (side === 1) ? _wallColors.dark : _wallColors.light;
      }

      var finalColor = _applyFogAndBrightness(baseColor, fogFactor, brightness, fogColor);
      ctx.fillStyle = finalColor;
      ctx.fillRect(col, drawStart, 1, drawEnd - drawStart + 1);

      // ── Step fill (Doom rule) ───────────────────────────────────
      // The gap between the displaced wall and the floor/ceiling plane
      // fills with a darkened step color to read as a physical platform
      // or recessed lip. This is what makes doors "look" raised/sunken.
      if (vertShift !== 0 && _contract && _contract.stepColor) {
        var stepColor = _applyFogAndBrightness(
          _contract.stepColor, fogFactor, brightness * 0.7, fogColor
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
  }

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

      sorted.push({ sprite: s, dist: dist, angle: angle });
    }

    sorted.sort(function (a, b) { return b.dist - a.dist; });

    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      var s = item.sprite;
      var dist = item.dist;
      var angle = item.angle;

      var screenX = Math.floor(w / 2 + (angle / halfFov) * (w / 2));
      var scale = (s.scale || 0.6) / dist;
      var spriteH = Math.floor(h * scale);
      var spriteW = spriteH;
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

      if (s.emoji) {
        ctx.font = Math.floor(spriteH * 0.8) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, screenX, halfH);
      } else if (s.color) {
        ctx.fillStyle = s.color;
        ctx.fillRect(drawX, halfH - spriteH / 2, spriteW, spriteH);
      }

      ctx.restore();
    }
  }

  function _applyFogAndBrightness(hexColor, fogFactor, brightness, fogColor) {
    var r = parseInt(hexColor.substr(1, 2), 16);
    var g = parseInt(hexColor.substr(3, 2), 16);
    var b = parseInt(hexColor.substr(5, 2), 16);

    r = Math.floor(r * brightness);
    g = Math.floor(g * brightness);
    b = Math.floor(b * brightness);

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
    setContract: setContract
  };
})();

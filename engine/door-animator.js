/**
 * DoorAnimator — raycaster door-opening animation with OoT-style porthole.
 *
 * When a floor transition triggers, the door tile plays a swing-open
 * animation during the pre-fade delay (~350ms). The door panel swings
 * away to reveal a porthole behind — a depth-implying gradient tunnel
 * inspired by the Lost Woods doors in Ocarina of Time.
 *
 * Porthole types (based on depth transition direction):
 *   Adjacent (same depth): flat twinkly/dusty black void
 *   Ascending (going up):  gradient from black → white (brightening)
 *   Descending (going down): gradient from white → black (deepening)
 *
 * The porthole parallaxes toward the player based on viewing angle.
 *
 * Text overlay:
 *   Inside the opening: destination floor name
 *   Below: "Exiting [current] to proceed/return to [target]"
 *
 * Layer 2 (after TextureAtlas, before Raycaster in load order).
 * Depends on: TextureAtlas, TILES, FloorManager
 */
var DoorAnimator = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────
  var OPEN_DURATION   = 320;  // ms — slightly under pre-fade delay
  var TEX_SIZE        = 64;   // Match TextureAtlas.TEX_SIZE

  // ── State ──────────────────────────────────────────────────────────
  var _active       = false;
  var _tileX        = -1;
  var _tileY        = -1;
  var _hitTile      = 0;
  var _direction    = 'advance';
  var _elapsed      = 0;
  var _progress     = 0;       // 0..1 eased
  var _currentFloor = '';
  var _targetFloor  = '';
  var _portholeType = 'flat';  // 'flat' | 'ascending' | 'descending'

  // Screen bounds for overlay text (populated during renderColumn)
  var _screenLeft   = 9999;
  var _screenRight  = 0;
  var _screenTop    = 9999;
  var _screenBottom = 0;
  var _screenValid  = false;

  // Generated porthole canvases
  var _portholes = {};  // 'flat' | 'ascending' | 'descending' → canvas

  // ── Init ───────────────────────────────────────────────────────────

  function init() {
    _generatePortholes();
  }

  // ── Animation control ──────────────────────────────────────────────

  function start(tileX, tileY, hitTile, direction, currentFloorId, targetFloorId) {
    _active       = true;
    _tileX        = tileX;
    _tileY        = tileY;
    _hitTile      = hitTile;
    _direction    = direction || 'advance';
    _elapsed      = 0;
    _progress     = 0;
    _currentFloor = currentFloorId || '';
    _targetFloor  = targetFloorId  || '';
    _screenValid  = false;

    // Determine porthole type from floor depth comparison
    var curDepth = _currentFloor ? String(_currentFloor).split('.').length : 1;
    var tgtDepth = _targetFloor  ? String(_targetFloor).split('.').length  : 1;

    if (tgtDepth > curDepth) {
      _portholeType = 'descending';  // Going deeper → darkening
    } else if (tgtDepth < curDepth) {
      _portholeType = 'ascending';   // Coming up → brightening
    } else {
      _portholeType = 'flat';        // Same depth → twinkly void
    }
  }

  function stop() {
    _active      = false;
    _tileX       = -1;
    _tileY       = -1;
    _elapsed     = 0;
    _progress    = 0;
    _screenValid = false;
  }

  function isAnimating() { return _active; }

  function isAnimatingTile(mapX, mapY) {
    return _active && mapX === _tileX && mapY === _tileY;
  }

  function update(dt) {
    if (!_active) return;
    _elapsed += dt;
    var t = Math.min(1, _elapsed / OPEN_DURATION);
    // Ease-out cubic
    _progress = 1 - (1 - t) * (1 - t) * (1 - t);

    // Reset screen bounds for this frame
    _screenLeft   = 9999;
    _screenRight  = 0;
    _screenTop    = 9999;
    _screenBottom = 0;
    _screenValid  = false;
  }

  // ── Per-column rendering ───────────────────────────────────────────

  /**
   * Render one raycaster column for the animating door tile.
   *
   * Architecture (back to front):
   *   1. Porthole — the dark gradient tunnel behind the door
   *   2. Door panel — swings open from a hinge on the left edge
   *
   * No separate frame pieces — the door texture's own painted frame
   * border provides the surround. Adjacent WALL tiles (rendered by
   * the N-layer compositor) provide the building facade context.
   */
  function renderColumn(ctx, col, drawStart, drawEnd, wallX, side, fogFactor, brightness, fogColor) {
    var stripH = drawEnd - drawStart + 1;
    if (stripH <= 0) return;

    // Track screen bounds for overlay text
    if (col < _screenLeft)        _screenLeft   = col;
    if (col > _screenRight)       _screenRight  = col;
    if (drawStart < _screenTop)   _screenTop    = drawStart;
    if (drawEnd > _screenBottom)  _screenBottom = drawEnd;
    _screenValid = true;

    // ── Layer 1: Porthole (always behind everything) ──────────────
    var phCanvas = _portholes[_portholeType];
    if (phCanvas) {
      // Parallax: shift texture horizontally based on wallX offset
      // from center. Creates depth illusion — porthole interior
      // slides as the player views the door from different angles.
      var parallaxShift = (wallX - 0.5) * 0.15;
      var phU = wallX + parallaxShift;
      phU = Math.max(0, Math.min(0.999, phU));

      var phTexX = Math.floor(phU * TEX_SIZE);
      if (phTexX >= TEX_SIZE) phTexX = TEX_SIZE - 1;

      ctx.drawImage(
        phCanvas,
        phTexX, 0, 1, TEX_SIZE,
        col, drawStart, 1, stripH
      );

      // Twinkle particles for 'flat' type porthole
      if (_portholeType === 'flat') {
        _drawTwinkle(ctx, col, drawStart, stripH, wallX);
      }
    } else {
      // Fallback: flat black
      ctx.fillStyle = '#080808';
      ctx.fillRect(col, drawStart, 1, stripH);
    }

    // ── Layer 2: Door panel (swings open from left hinge) ────────
    // At progress 0, door covers entire width (wallX 0..1).
    // At progress 1, door is fully open (edge-on, invisible).
    // The hinge is on the left (wallX=0), door swings away to the right.
    if (_progress < 0.98) {
      var doorEdge = 1.0 - _progress;  // Visible door: wallX 0..doorEdge

      if (wallX < doorEdge) {
        var doorTex = _getDoorTexture();
        if (doorTex) {
          // Map this column's position within the visible door portion
          // back to the full texture width for correct UV mapping.
          var doorFrac = wallX / doorEdge;  // 0..1 within visible door
          var dtx = Math.floor(doorFrac * doorTex.width);
          if (dtx >= doorTex.width) dtx = doorTex.width - 1;

          // Perspective foreshortening: columns near the swinging edge
          // are further from the viewer (door angling into depth).
          // Reduce height slightly near the far edge to imply rotation.
          var perspReduction = _progress * doorFrac * 0.12;
          var perspH = Math.max(1, Math.floor(stripH * (1.0 - perspReduction)));
          var perspOffset = Math.floor((stripH - perspH) / 2);

          ctx.drawImage(
            doorTex.canvas,
            dtx, 0, 1, doorTex.height,
            col, drawStart + perspOffset, 1, perspH
          );

          // Darken columns further from hinge (depth shadow on angled door)
          if (_progress > 0.05) {
            var darkAmt = doorFrac * _progress * 0.35;
            ctx.fillStyle = 'rgba(0,0,0,' + darkAmt.toFixed(3) + ')';
            ctx.fillRect(col, drawStart + perspOffset, 1, perspH);
          }
        }
      }
    }

    // Side shading
    if (side === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(col, drawStart, 1, stripH);
    }

    // Fog overlay
    if (fogFactor > 0.01) {
      ctx.fillStyle = 'rgba(' + fogColor.r + ',' + fogColor.g + ',' + fogColor.b + ',' + fogFactor + ')';
      ctx.fillRect(col, drawStart, 1, stripH);
    }

    // Brightness overlay
    if (brightness < 0.95) {
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - brightness) + ')';
      ctx.fillRect(col, drawStart, 1, stripH);
    }
  }

  // ── Twinkle particles ──────────────────────────────────────────────
  // Scattered bright specks in the flat porthole — dust motes / distant
  // stars like a Wile E. Coyote tunnel exit. Time-varying for shimmer.

  function _drawTwinkle(ctx, col, drawStart, stripH, wallX) {
    // Use column + time to generate pseudo-random twinkle positions
    var timeSlot = Math.floor(_elapsed / 80);  // Change every 80ms
    var seed = col * 7919 + timeSlot * 6271;

    // 2-3 twinkle chances per column
    for (var i = 0; i < 3; i++) {
      var h = _hashInt(seed + i * 3571);
      if ((h & 0xff) > 240) {  // ~6% chance per slot
        var yFrac = ((h >> 8) & 0x3ff) / 1024;
        var py = drawStart + Math.floor(yFrac * stripH);
        var bright = 80 + ((h >> 18) & 0x7f);  // 80..207

        // Distance from center makes twinkles dimmer at edges
        var centerDist = Math.abs(wallX - 0.5) * 2;  // 0..1
        bright = Math.floor(bright * (1.0 - centerDist * 0.6));

        if (bright > 30) {
          ctx.fillStyle = 'rgba(' + bright + ',' + bright + ',' + Math.floor(bright * 0.9) + ',0.7)';
          ctx.fillRect(col, py, 1, 1);
        }
      }
    }
  }

  // ── Text overlay (drawn after raycaster) ───────────────────────────

  function renderOverlay(ctx, w, h) {
    if (!_active || !_screenValid || _progress < 0.15) return;

    var midX = (_screenLeft + _screenRight) / 2;
    var doorW = _screenRight - _screenLeft;
    if (doorW < 10) return;

    var alpha = Math.min(1, (_progress - 0.15) / 0.4);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── Destination floor name inside the opening ──
    var targetLabel = '';
    if (_targetFloor && typeof FloorManager !== 'undefined' &&
        typeof FloorManager.getFloorLabel === 'function') {
      targetLabel = FloorManager.getFloorLabel(_targetFloor);
    }
    if (!targetLabel && _targetFloor) {
      targetLabel = 'Floor ' + _targetFloor;
    }

    if (targetLabel) {
      var fontSize = Math.max(8, Math.min(18, Math.floor(doorW * 0.12)));
      ctx.font = 'bold ' + fontSize + 'px monospace';

      var textY = (_screenTop + _screenBottom) / 2;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,' + (alpha * 0.8).toFixed(2) + ')';
      ctx.fillText(targetLabel, midX + 1, textY + 1);
      // Main text — warm parchment
      ctx.fillStyle = 'rgba(220,200,160,' + alpha.toFixed(2) + ')';
      ctx.fillText(targetLabel, midX, textY);
    }

    // ── Transition text below the door ──
    var currentLabel = '';
    if (_currentFloor && typeof FloorManager !== 'undefined' &&
        typeof FloorManager.getFloorLabel === 'function') {
      currentLabel = FloorManager.getFloorLabel(_currentFloor);
    }
    if (!currentLabel && _currentFloor) {
      currentLabel = 'Floor ' + _currentFloor;
    }

    if (currentLabel && targetLabel) {
      var verb = (_direction === 'advance') ? 'proceed to' : 'return to';
      var subText = 'Exiting ' + currentLabel + ' to ' + verb + ' ' + targetLabel;

      var subSize = Math.max(6, Math.min(11, Math.floor(doorW * 0.06)));
      ctx.font = subSize + 'px monospace';

      var subY = _screenBottom + subSize + 6;

      ctx.fillStyle = 'rgba(0,0,0,' + (alpha * 0.6).toFixed(2) + ')';
      ctx.fillText(subText, midX + 1, subY + 1);
      ctx.fillStyle = 'rgba(180,170,150,' + alpha.toFixed(2) + ')';
      ctx.fillText(subText, midX, subY);
    }

    ctx.restore();
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function _getDoorTexture() {
    if (_hitTile === TILES.BOSS_DOOR) {
      return TextureAtlas.get('door_iron');
    }
    // Use the contract's texture for this door tile type
    if (typeof SpatialContract !== 'undefined' && typeof FloorManager !== 'undefined') {
      var fd = FloorManager.getFloorData();
      if (fd && fd.contract) {
        var texId = SpatialContract.getTexture(fd.contract, _hitTile);
        if (texId) {
          var tex = TextureAtlas.get(texId);
          if (tex) return tex;
        }
      }
    }
    return TextureAtlas.get('door_wood') || null;
  }

  function _hashInt(n) {
    n = ((n >> 16) ^ n) * 0x45d9f3b;
    n = ((n >> 16) ^ n) * 0x45d9f3b;
    n = (n >> 16) ^ n;
    return n & 0x7fffffff;
  }

  function _hash01(x, y) {
    var n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
  }

  function _cl(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  // ── Porthole texture generation ────────────────────────────────────
  // Each porthole is a 64×64 canvas showing what's visible through the
  // opening door — inspired by OoT's Lost Woods tunnels.
  //
  // 'flat':       Twinkly/dusty black void (Wile E. Coyote tunnel)
  // 'descending': Gradient from brighter edge → deep black center
  // 'ascending':  Gradient from dark edge → bright white center

  function _generatePortholes() {
    _portholes.flat       = _genPorthole('flat');
    _portholes.ascending  = _genPorthole('ascending');
    _portholes.descending = _genPorthole('descending');
  }

  function _genPorthole(type) {
    var S = TEX_SIZE;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var d = img.data;

    var halfW = S / 2;
    var halfH = S / 2;

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var idx = (y * S + x) * 4;

        // Normalized coords (-1..1) from center
        var nx = (x - halfW) / halfW;
        var ny = (y - halfH) / halfH;

        // Radial distance from center (0..1+)
        var r = Math.sqrt(nx * nx + ny * ny);

        // Vignette: darker at edges, lighter/darker at center depending
        // on porthole type. All portholes have a tunnel-like vignette.
        var vignette = Math.min(1, r * 0.8);  // Edge darkening factor

        var noise = _hash01(x + 1200, y + 3400) * 6 - 3;
        var baseV, rv, gv, bv;

        if (type === 'flat') {
          // Deep black void with subtle warmth at center
          baseV = 8 + noise;
          // Slight warm center glow (very subtle)
          var centerGlow = Math.max(0, 1 - r * 1.5) * 12;
          rv = _cl(baseV + centerGlow);
          gv = _cl(baseV + centerGlow * 0.7);
          bv = _cl(baseV + centerGlow * 0.4);

        } else if (type === 'descending') {
          // Top is brighter (daylight behind), fades to deep black at bottom
          // Vertical gradient: y=0 (top) is lighter, y=S (bottom) is black
          var depthT = y / S;  // 0=top(bright) → 1=bottom(dark)
          var grad = (1 - depthT) * 0.4;  // 0.4 at top → 0 at bottom
          baseV = grad * 120 + noise;
          // Edge vignette makes it darker at periphery
          baseV *= (1 - vignette * 0.7);
          rv = _cl(baseV);
          gv = _cl(baseV * 0.95);
          bv = _cl(baseV * 0.85);

        } else {
          // ascending: Bottom is brighter (light above), top is dark
          var liftT = 1 - (y / S);  // 0=bottom(bright) → 1=top(dark)
          var aGrad = (1 - liftT) * 0.5;  // 0.5 at bottom → 0 at top
          baseV = aGrad * 160 + noise;
          baseV *= (1 - vignette * 0.6);
          // Warmer tone for ascending (daylight above)
          rv = _cl(baseV * 1.05);
          gv = _cl(baseV);
          bv = _cl(baseV * 0.8);
        }

        d[idx]     = rv;
        d[idx + 1] = gv;
        d[idx + 2] = bv;
        d[idx + 3] = 255;
      }
    }

    // Add some dust/grain texture to all types
    for (var py = 0; py < S; py++) {
      for (var px = 0; px < S; px++) {
        var pi = (py * S + px) * 4;
        var grain = _hash01(px + 7000, py + 8000);
        if (grain > 0.92) {
          // Sparse bright dust motes baked into texture
          var bump = Math.floor(grain * 30);
          d[pi]     = _cl(d[pi] + bump);
          d[pi + 1] = _cl(d[pi + 1] + bump);
          d[pi + 2] = _cl(d[pi + 2] + bump * 0.7);
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init,
    start: start,
    stop: stop,
    update: update,
    isAnimating: isAnimating,
    isAnimatingTile: isAnimatingTile,
    renderColumn: renderColumn,
    renderOverlay: renderOverlay
  };
})();

/**
 * DoorAnimator — raycaster door-opening animation with through-door reveal.
 *
 * When a floor transition triggers, the door/stair tile that was interacted
 * with plays a split-open animation during the pre-fade delay (~350ms).
 * The door texture slides apart (wood doors split horizontally, iron doors
 * rise like a portcullis) to reveal a directional indicator behind:
 *
 *   STAIRS_DN / DOOR (advance)  → dark archway with descending steps
 *   STAIRS_UP / DOOR_BACK/EXIT  → lit archway with ascending steps
 *   BOSS_DOOR                   → red-lit archway with descending steps
 *
 * The raycaster checks DoorAnimator.isAnimating() each frame and, for the
 * animating tile, calls DoorAnimator.renderColumn() instead of the normal
 * texture path. This draws the reveal texture first, then the door texture
 * with a growing gap (split or rise) based on animation progress.
 *
 * Layer 2 (after TextureAtlas, before Raycaster in load order).
 * Depends on: TextureAtlas, TILES
 */
var DoorAnimator = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────
  var OPEN_DURATION   = 320;  // ms — slightly under pre-fade delay
  var REVEAL_TEX_SIZE = 64;   // Match TextureAtlas.TEX_SIZE

  // ── State ──────────────────────────────────────────────────────────
  var _active     = false;
  var _tileX      = -1;       // Grid coords of animating door
  var _tileY      = -1;
  var _hitTile    = 0;        // TILES constant
  var _direction  = 'advance'; // 'advance' | 'retreat'
  var _elapsed    = 0;        // ms since animation started
  var _progress   = 0;        // 0..1 eased
  var _revealType = 'descend'; // 'descend' | 'ascend' | 'boss'

  // Reveal textures (generated once at init)
  var _revealCanvases = {};   // 'descend' | 'ascend' | 'boss' → canvas

  // ── Init ───────────────────────────────────────────────────────────

  function init() {
    _generateRevealTextures();
  }

  // ── Animation control ──────────────────────────────────────────────

  /**
   * Start the door-open animation.
   * @param {number} tileX - Grid X of the door tile
   * @param {number} tileY - Grid Y of the door tile
   * @param {number} hitTile - TILES constant (DOOR, STAIRS_DN, etc.)
   * @param {string} direction - 'advance' or 'retreat'
   */
  function start(tileX, tileY, hitTile, direction) {
    _active    = true;
    _tileX     = tileX;
    _tileY     = tileY;
    _hitTile   = hitTile;
    _direction = direction || 'advance';
    _elapsed   = 0;
    _progress  = 0;

    // Determine reveal type from tile + direction
    if (hitTile === TILES.BOSS_DOOR) {
      _revealType = 'boss';
    } else if (direction === 'advance') {
      _revealType = 'descend';
    } else {
      _revealType = 'ascend';
    }
  }

  function stop() {
    _active   = false;
    _tileX    = -1;
    _tileY    = -1;
    _elapsed  = 0;
    _progress = 0;
  }

  function isAnimating() { return _active; }

  /**
   * Check if a specific grid cell is the one being animated.
   */
  function isAnimatingTile(mapX, mapY) {
    return _active && mapX === _tileX && mapY === _tileY;
  }

  /**
   * Advance animation timer.
   * @param {number} dt - Frame delta in ms
   */
  function update(dt) {
    if (!_active) return;
    _elapsed += dt;
    var t = Math.min(1, _elapsed / OPEN_DURATION);
    // Ease-out cubic: fast start, slow finish (door swings open then settles)
    _progress = 1 - (1 - t) * (1 - t) * (1 - t);
  }

  // ── Per-column rendering ───────────────────────────────────────────

  /**
   * Render one raycaster column for the animating door tile.
   * Called by raycaster instead of normal texture/color path when
   * isAnimatingTile() is true.
   *
   * The door texture splits apart from center, revealing the through-door
   * scene behind. Iron doors (BOSS_DOOR) rise upward like a portcullis.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} col       - Screen column index
   * @param {number} drawStart - Top Y of wall strip
   * @param {number} drawEnd   - Bottom Y of wall strip
   * @param {number} wallX     - UV coordinate along wall face (0..1)
   * @param {number} side      - 0 or 1 (DDA side hit)
   * @param {number} fogFactor - 0..1 fog intensity
   * @param {number} brightness- 0..1 light level
   * @param {Object} fogColor  - { r, g, b }
   */
  function renderColumn(ctx, col, drawStart, drawEnd, wallX, side, fogFactor, brightness, fogColor) {
    var stripH = drawEnd - drawStart + 1;
    if (stripH <= 0) return;

    var revealCanvas = _revealCanvases[_revealType];
    var doorTex = _getDoorTexture();

    // Texture column index
    var texX = Math.floor(wallX * REVEAL_TEX_SIZE);
    if (texX >= REVEAL_TEX_SIZE) texX = REVEAL_TEX_SIZE - 1;

    // ── Step 1: Draw the reveal (through-door) texture as background ──
    if (revealCanvas && _progress > 0.02) {
      ctx.drawImage(
        revealCanvas,
        texX, 0, 1, REVEAL_TEX_SIZE,
        col, drawStart, 1, stripH
      );

      // Darken slightly for depth
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(col, drawStart, 1, stripH);
    }

    // ── Step 2: Draw the door texture with a gap ──
    if (doorTex && _progress < 0.98) {
      var isPortcullis = (_hitTile === TILES.BOSS_DOOR);

      if (isPortcullis) {
        // Portcullis: door rises upward, gap grows from bottom
        var visibleFrac = 1 - _progress;
        var srcH = Math.floor(REVEAL_TEX_SIZE * visibleFrac);
        var destH = Math.floor(stripH * visibleFrac);

        if (srcH > 0 && destH > 0) {
          ctx.drawImage(
            doorTex.canvas,
            texX, 0, 1, srcH,
            col, drawStart, 1, destH
          );
        }
      } else {
        // Split doors: gap grows from center of texture
        var gapPixels = Math.floor(REVEAL_TEX_SIZE * _progress * 0.5);
        var halfTex = Math.floor(REVEAL_TEX_SIZE / 2);

        // Top half of door (slides up)
        var topSrcH = Math.max(0, halfTex - gapPixels);
        var topDestH = Math.floor(stripH * topSrcH / REVEAL_TEX_SIZE);

        if (topSrcH > 0 && topDestH > 0) {
          ctx.drawImage(
            doorTex.canvas,
            texX, 0, 1, topSrcH,
            col, drawStart, 1, topDestH
          );
        }

        // Bottom half of door (slides down)
        var botSrcStart = halfTex + gapPixels;
        var botSrcH = Math.max(0, REVEAL_TEX_SIZE - botSrcStart);
        var botDestStart = drawStart + Math.floor(stripH * botSrcStart / REVEAL_TEX_SIZE);
        var botDestH = Math.floor(stripH * botSrcH / REVEAL_TEX_SIZE);

        if (botSrcH > 0 && botDestH > 0) {
          ctx.drawImage(
            doorTex.canvas,
            texX, botSrcStart, 1, botSrcH,
            col, botDestStart, 1, botDestH
          );
        }
      }

      // Side shading on door remnants
      if (side === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        // Only shade the door portions, not the revealed gap
        if (isPortcullis) {
          var visH = Math.floor(stripH * (1 - _progress));
          if (visH > 0) ctx.fillRect(col, drawStart, 1, visH);
        } else {
          if (topDestH > 0) ctx.fillRect(col, drawStart, 1, topDestH);
          if (botDestH > 0) ctx.fillRect(col, botDestStart, 1, botDestH);
        }
      }
    }

    // Fog overlay on entire strip
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

  // ── Helpers ────────────────────────────────────────────────────────

  function _getDoorTexture() {
    if (_hitTile === TILES.BOSS_DOOR) {
      return TextureAtlas.get('door_iron');
    }
    return TextureAtlas.get('door_wood') || null;
  }

  // ── Procedural reveal textures ─────────────────────────────────────
  // Each reveal texture shows what's visible through the opening door:
  //   descend: dark archway, stone steps going down
  //   ascend:  lit archway, stone steps going up
  //   boss:    red-tinged archway, steps going down

  function _generateRevealTextures() {
    _revealCanvases.descend = _genReveal({
      archR: 25, archG: 20, archB: 18,          // Dark stone interior
      stepR: 55, stepG: 50, stepB: 48,           // Gray steps
      stepDir: 1,                                 // Steps go down (lower = deeper)
      glowR: 30, glowG: 25, glowB: 20,          // Warm dim glow from below
      glowStrength: 0.15
    });

    _revealCanvases.ascend = _genReveal({
      archR: 60, archG: 58, archB: 52,           // Lighter stone
      stepR: 80, stepG: 78, stepB: 72,           // Lighter steps
      stepDir: -1,                                // Steps go up (higher = shallower)
      glowR: 140, glowG: 130, glowB: 100,       // Warm daylight from above
      glowStrength: 0.35
    });

    _revealCanvases.boss = _genReveal({
      archR: 20, archG: 10, archB: 10,           // Deep dark red
      stepR: 50, stepG: 35, stepB: 30,           // Dark reddish steps
      stepDir: 1,                                 // Steps go down
      glowR: 120, glowG: 30, glowB: 15,         // Ominous red glow
      glowStrength: 0.25
    });
  }

  /**
   * Generate a single reveal texture — archway with directional steps.
   * Steps are rendered as horizontal bands that shift diagonally to
   * convey ascending or descending perspective.
   */
  function _genReveal(p) {
    var S = REVEAL_TEX_SIZE;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    var imgData = ctx.createImageData(S, S);
    var d = imgData.data;

    var halfW = S / 2;

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var idx = (y * S + x) * 4;

        // Archway shape: parabolic top, straight sides with 4px inset
        var inset = 4;
        var archTop = inset + (y < S * 0.4
          ? Math.floor(((x - halfW) * (x - halfW)) / (halfW * 0.6))
          : 0);

        var inArch = x >= inset && x < (S - inset) && y >= archTop;

        if (!inArch) {
          // Outside arch: dark stone frame
          var fn = _hashSimple(x + 2000, y + 3000) * 8 - 4;
          d[idx]     = _cl(p.archR * 0.5 + fn);
          d[idx + 1] = _cl(p.archG * 0.5 + fn);
          d[idx + 2] = _cl(p.archB * 0.5 + fn);
          d[idx + 3] = 255;
          continue;
        }

        // Inside arch: step pattern
        // Steps are diagonal bands that shift with stepDir
        var stepH = 8;  // Step height in pixels
        var stepShift = p.stepDir * Math.floor((x - halfW) * 0.3);
        var stepY = (y + stepShift + S * 2) % stepH;  // Wrap safely
        var isStepEdge = stepY < 1;

        // Depth gradient: darker toward the back (center of arch)
        var depthFrac = y / S;
        // For descend: gets darker toward bottom. For ascend: gets lighter.
        var depthMult = p.stepDir > 0
          ? 1.0 - depthFrac * 0.4     // Descend: darker at bottom
          : 0.6 + depthFrac * 0.4;    // Ascend: brighter at bottom

        // Glow from destination direction
        var glowFrac = p.stepDir > 0
          ? Math.max(0, depthFrac - 0.5) * 2   // Glow from below
          : Math.max(0, (1 - depthFrac) - 0.3) * 1.5;  // Glow from above
        glowFrac = Math.min(1, glowFrac) * p.glowStrength;

        var noise = _hashSimple(x + 4000, y + 5000) * 6 - 3;

        var r, g, b;
        if (isStepEdge) {
          // Step edge: darker line
          r = p.stepR * depthMult * 0.6 + noise;
          g = p.stepG * depthMult * 0.6 + noise;
          b = p.stepB * depthMult * 0.6 + noise;
        } else {
          // Step surface
          r = p.stepR * depthMult + noise;
          g = p.stepG * depthMult + noise;
          b = p.stepB * depthMult + noise;
        }

        // Apply glow
        r = r * (1 - glowFrac) + p.glowR * glowFrac;
        g = g * (1 - glowFrac) + p.glowG * glowFrac;
        b = b * (1 - glowFrac) + p.glowB * glowFrac;

        d[idx]     = _cl(r);
        d[idx + 1] = _cl(g);
        d[idx + 2] = _cl(b);
        d[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  function _hashSimple(x, y) {
    var n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
  }

  function _cl(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init: init,
    start: start,
    stop: stop,
    update: update,
    isAnimating: isAnimating,
    isAnimatingTile: isAnimatingTile,
    renderColumn: renderColumn
  };
})();

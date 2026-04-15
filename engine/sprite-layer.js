/**
 * SpriteLayer — Billboarded DOM overlay for CSS-animated world sprites.
 *
 * Renders CSS elements (flames, particle effects, animated badges) as
 * world-anchored overlays on top of the raycaster canvas. Each sprite
 * is a <div> positioned absolutely over the viewport, repositioned
 * every frame using the same projection math the raycaster uses for
 * enemy/item sprites.
 *
 * Layer 2 module — depends on: Raycaster (Layer 2, loaded before this).
 *
 * Usage:
 *   SpriteLayer.init(viewportEl);
 *   var id = SpriteLayer.addSprite(tileX, tileY, htmlStr, 'dragonfire', { scale: 0.6 });
 *   // In render loop, after Raycaster.render():
 *   SpriteLayer.tick(camX, camY, camDir);
 *   // On floor change:
 *   SpriteLayer.clear();
 */
var SpriteLayer = (function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  var _container = null;     // <div id="sprite-layer"> we create
  var _sprites   = [];       // { id, tileX, tileY, el, opts }
  var _nextId    = 1;

  // ── Init ─────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} viewportEl - the #viewport div that wraps the canvas
   */
  function init(viewportEl) {
    if (_container) return;
    _container = document.createElement('div');
    _container.id = 'sprite-layer';
    _container.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;';
    // Insert right after the canvas (first child of viewport)
    var canvas = viewportEl.querySelector('canvas');
    if (canvas && canvas.nextSibling) {
      viewportEl.insertBefore(_container, canvas.nextSibling);
    } else {
      viewportEl.appendChild(_container);
    }
  }

  // ── Add / Remove ─────────────────────────────────────────────────

  /**
   * Register a CSS sprite anchored at a world tile.
   *
   * @param {number} tileX        - grid X coordinate
   * @param {number} tileY        - grid Y coordinate
   * @param {string} htmlContent  - inner HTML for the sprite div
   * @param {string} [className]  - CSS class applied to the wrapper
   * @param {Object} [opts]       - { scale: 0.6, offsetY: 0 }
   * @returns {number} sprite ID
   */
  function addSprite(tileX, tileY, htmlContent, className, opts) {
    var el = document.createElement('div');
    el.className = 'sl-sprite' + (className ? ' ' + className : '');
    el.innerHTML = htmlContent;
    el.style.cssText =
      'position:absolute;left:0;top:0;transform-origin:center bottom;' +
      'pointer-events:none;will-change:transform,opacity;display:none;' +
      'overflow:visible;';
    _container.appendChild(el);

    var id = _nextId++;
    _sprites.push({
      id:    id,
      tileX: tileX,
      tileY: tileY,
      el:    el,
      opts:  opts || {}
    });
    return id;
  }

  /**
   * Remove a sprite by ID.
   */
  function removeSprite(id) {
    for (var i = _sprites.length - 1; i >= 0; i--) {
      if (_sprites[i].id === id) {
        _container.removeChild(_sprites[i].el);
        _sprites.splice(i, 1);
        return;
      }
    }
  }

  /**
   * Remove all sprites (floor change).
   */
  function clear() {
    for (var i = 0; i < _sprites.length; i++) {
      _container.removeChild(_sprites[i].el);
    }
    _sprites = [];
  }

  // ── Tick (per-frame projection) ──────────────────────────────────

  /**
   * Reposition all registered sprites based on camera state.
   * Call once per render frame, AFTER Raycaster.render().
   *
   * @param {number} camX   - player world X
   * @param {number} camY   - player world Y
   * @param {number} camDir - player facing angle (radians)
   */
  function tick(camX, camY, camDir) {
    if (!_container || !_sprites.length) return;
    if (typeof Raycaster === 'undefined') return;

    for (var i = 0; i < _sprites.length; i++) {
      var sp = _sprites[i];
      var scale = sp.opts.scale || 0.6;
      var worldOffsetY = sp.opts.worldOffsetY || 0;

      // ── Scan-based positioning for freeform cavity sprites ──────
      // Instead of projecting a world point to screen (which drifts at
      // oblique angles), scan the raycaster's pedestal buffers to find
      // the exact column range where the DDA rendered this tile. This
      // gives pixel-perfect horizontal centering inside the cavity.
      //
      // projectWorldToScreen is still called for: vertical position
      // (pitch-aware horizon + worldOffsetY), sprite sizing (distance-
      // based scale), fog distance, and z-buffer visibility check.
      // Only the horizontal center (screenX) is overridden by the scan.

      var scanResult = null;
      if (sp.opts.alignToFace && Raycaster.findTileScreenRange) {
        scanResult = Raycaster.findTileScreenRange(sp.tileX, sp.tileY);
      }

      // Always run the standard projection for size, Y position, fog,
      // and as a fallback when the scan doesn't find the tile.
      var proj = Raycaster.projectWorldToScreen(
        sp.tileX, sp.tileY, camX, camY, camDir, scale, worldOffsetY
      );

      if (!proj || !proj.visible) {
        // If projection says not visible but scan found columns, the
        // tile IS on screen (z-bypass for freeform). Force visible.
        if (!scanResult) {
          sp.el.style.display = 'none';
          continue;
        }
      }

      // Map raycaster render-space coords to the display viewport.
      // The viewport fills 100% of its container; the canvas is
      // stretched via CSS to match. We need the ratio between the
      // viewport's CSS size and the canvas pixel size.
      var canvasW = (proj ? proj.canvasW : (scanResult ? scanResult.w : 320));
      var canvasH = (proj ? proj.canvasH : (scanResult ? scanResult.h : 200));
      var vw = _container.clientWidth  || canvasW;
      var vh = _container.clientHeight || canvasH;
      var sx = vw / canvasW;
      var sy = vh / canvasH;

      // Horizontal position: prefer scan center, fall back to projection.
      var renderScreenX;
      if (scanResult) {
        renderScreenX = scanResult.centerCol;
      } else if (proj) {
        renderScreenX = proj.screenX;
      } else {
        sp.el.style.display = 'none';
        continue;
      }

      var displayX = renderScreenX * sx;
      var displayH = proj ? (proj.scaleH * sy) : 0;
      var displayW = proj ? (proj.scaleW * sx) : 0;

      // If scan found the tile, constrain sprite width to the visible
      // column span so it doesn't overflow outside the cavity.
      if (scanResult) {
        var scanDisplayW = (scanResult.maxCol - scanResult.minCol + 1) * sx;
        if (scanDisplayW > 0 && scanDisplayW < displayW) {
          var aspect = displayH / (displayW || 1);
          displayW = scanDisplayW;
          displayH = displayW * aspect;
        }
      }

      var displayY = proj ? (proj.screenY * sy + (sp.opts.offsetY || 0)) : 0;

      // Fog-based opacity: fade at distance
      var dist = proj ? proj.dist : 8;
      var fogFactor = Math.min(1, dist / 14);
      var alpha = Math.max(0.05, 1 - fogFactor);

      sp.el.style.display = 'block';
      sp.el.style.width   = displayW + 'px';
      sp.el.style.height  = displayH + 'px';
      sp.el.style.opacity = alpha;
      // --sl-scale maps the authored reference size (128px) down to the
      // RENDER-SPACE pixel count, not the display count. When
      // RENDER_SCALE < 1 the CSS children render at fewer logical
      // pixels — coarser borders, chunkier radii — matching the 3D
      // viewport's resolution. The display-space wrapper stretches them
      // to fill without adding detail.
      var renderScale = (typeof Raycaster !== 'undefined' && Raycaster.getRenderScale)
        ? Raycaster.getRenderScale() : 1;
      var refSize = sp.opts.refSize || 128;
      var scaleFactor = Math.min(displayW, displayH) * renderScale / refSize;
      sp.el.style.setProperty('--sl-scale', scaleFactor.toFixed(4));
      sp.el.style.transform =
        'translate(' + (displayX - displayW / 2) + 'px,' + displayY + 'px)';

      // Publish last-render position for LightOrbs (gaze lock).
      // Only sprites flagged with a lightKind participate — bonfires,
      // hearths, any future "eyeball flame" DOM sprites. LightOrbs
      // reads displayCenterX/displayCenterY so the orb follows the
      // over-rotation/shrink quirk of the CSS billboard exactly.
      if (sp.opts.lightKind) {
        sp.lastRender = {
          visible: sp.el.style.display !== 'none',
          centerX: displayX,
          centerY: displayY + displayH * 0.5,
          topY:    displayY,
          w:       displayW,
          h:       displayH,
          dist:    dist,
          alpha:   alpha,
          kind:    sp.opts.lightKind,
          gaze:    sp.opts.gaze !== false,   // default true for lightKind
          tileX:   sp.tileX,
          tileY:   sp.tileY
        };
      } else if (sp.lastRender) {
        sp.lastRender.visible = false;
      }
    }
  }

  /**
   * Snapshot of DOM sprites registered as light sources (bonfire/hearth
   * eyeball flames, etc.). Each entry carries the post-billboard screen
   * position LightOrbs needs to pin orbs to the gazing flame.
   *
   * @returns {Array<Object>} array of lastRender snapshots
   */
  function getLightSprites() {
    var out = [];
    for (var i = 0; i < _sprites.length; i++) {
      var sp = _sprites[i];
      if (sp.opts && sp.opts.lightKind && sp.lastRender && sp.lastRender.visible) {
        out.push(sp.lastRender);
      }
    }
    return out;
  }

  /**
   * @returns {number} count of active sprites
   */
  function count() {
    return _sprites.length;
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    init:         init,
    addSprite:    addSprite,
    removeSprite: removeSprite,
    clear:        clear,
    tick:         tick,
    count:        count,
    getLightSprites: getLightSprites
  };
})();

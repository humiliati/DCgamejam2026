/**
 * UISprites — preloaded UI sprite images for MenuBox, HUD, and overlays.
 *
 * Loads arrow, frame, bar, panel, and button assets borrowed from
 * dcexjam2025's atlas system. Since DCgamejam2026 has no build pipeline,
 * images are loaded as plain Image objects and drawn via ctx.drawImage().
 *
 * Layer 1 (no game-logic deps — loaded early so sprites are cached
 * before first pause/shop/bonfire)
 *
 * Usage:
 *   UISprites.get('arrow-left')   → Image (or null if not loaded)
 *   UISprites.draw(ctx, 'arrow-left', x, y, w, h)
 *   UISprites.isReady()           → true when all sprites loaded
 */
var UISprites = (function () {
  'use strict';

  var BASE_PATH = 'assets/ui/';

  // ── Sprite manifest ────────────────────────────────────────────
  // key → relative path under assets/ui/
  var MANIFEST = {
    // Directional arrows (nav buttons)
    'arrow-left':   'arrow-left.png',
    'arrow-right':  'arrow-right.png',
    'arrow-up':     'arrow-up.png',
    'arrow-down':   'arrow-down.png',

    // Ornamental frame pieces
    'frame-h':             'frame-h.png',
    'frame-v':             'frame-v.png',
    'frame-corner-silver': 'frame-corner-silver.png',
    'frame-ll':            'frame-ll.png',
    'frame-lr':            'frame-lr.png',

    // Bar components (HP/EN)
    'bar-frame':      'bar-frame.9.png',
    'bar-frame-3d':   'bar-frame-3d.png',
    'bar-fill-red':   'bar-fill-red.9.png',
    'bar-fill-blue':  'bar-fill-blue.9.png',
    'bar-fill-yellow':'bar-fill-yellow.9.png',

    // Panels
    'panel-thick':  'panel-thick.9.png',
    'roundpanel':   'roundpanel.9.png',

    // Inventory
    'inventory-iconframe': 'inventory-iconframe.9.png',
    'inventory-empty':     'inventory-empty.png',
    'inventory-locked':    'inventory-locked.png',

    // Buttons (pixely atlas)
    'button':          'buttons/button.9.png',
    'button-down':     'buttons/button_down.9.png',
    'button-rollover': 'buttons/button_rollover.9.png',
    'button-disabled': 'buttons/button_disabled.9.png',

    // Menu entries
    'menu-entry':    'buttons/menu_entry.9.png',
    'menu-selected': 'buttons/menu_selected.9.png',
    'menu-header':   'buttons/menu_header.9.png',

    // Slider
    'slider':        'buttons/slider.9.png',
    'slider-handle': 'buttons/slider_handle.png'
  };

  // ── State ──────────────────────────────────────────────────────
  var _images = {};       // key → Image
  var _loaded = 0;
  var _total = 0;
  var _ready = false;

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    var keys = Object.keys(MANIFEST);
    _total = keys.length;
    _loaded = 0;
    _ready = false;

    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        var img = new Image();
        img.onload = function () {
          _loaded++;
          if (_loaded >= _total) {
            _ready = true;
            console.log('[UISprites] All ' + _total + ' sprites loaded');
          }
        };
        img.onerror = function () {
          console.warn('[UISprites] Failed to load: ' + key + ' (' + MANIFEST[key] + ')');
          _loaded++;
          if (_loaded >= _total) {
            _ready = true;
          }
        };
        img.src = BASE_PATH + MANIFEST[key];
        _images[key] = img;
      })(keys[i]);
    }

    console.log('[UISprites] Loading ' + _total + ' sprites');
  }

  // ── Accessors ──────────────────────────────────────────────────

  /** Get the Image object for a sprite key, or null. */
  function get(key) {
    var img = _images[key];
    return (img && img.complete && img.naturalWidth > 0) ? img : null;
  }

  /** Are all sprites loaded? */
  function isReady() { return _ready; }

  /**
   * Draw a sprite to a canvas context.
   * Falls back silently if the image isn't loaded yet.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key - Sprite key from MANIFEST
   * @param {number} x
   * @param {number} y
   * @param {number} w - Target width
   * @param {number} h - Target height
   */
  function draw(ctx, key, x, y, w, h) {
    var img = get(key);
    if (!img) return;
    ctx.drawImage(img, x, y, w, h);
  }

  /**
   * Draw a sprite centered at (cx, cy).
   */
  function drawCentered(ctx, key, cx, cy, w, h) {
    draw(ctx, key, cx - w / 2, cy - h / 2, w, h);
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init: init,
    get: get,
    isReady: isReady,
    draw: draw,
    drawCentered: drawCentered,
    MANIFEST: MANIFEST
  };
})();

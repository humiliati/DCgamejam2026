/**
 * MenuBox — OoT-style rotating 4-face box menu.
 *
 * Renders on the raycaster canvas during pause, bonfire, and shop states.
 * The box folds up around the camera, enclosing the POV with 4 menu faces.
 * The game world remains visible through blur borders between faces.
 *
 * Adapted from GAME_FLOW_ROADMAP.md design spec:
 *   - Fold-up animation (400ms)
 *   - 4-face rotation with seam-hold settle
 *   - Canvas-based blur snapshot of frozen world
 *   - Face content delegated to registered renderer functions
 *   - Context modes: 'pause', 'title', 'bonfire', 'shop'
 *
 * Layer 2 (after Raycaster — needs canvas access)
 * Depends on: i18n, InputManager, UISprites (optional — arrow fallback)
 */
var MenuBox = (function () {
  'use strict';

  // ── Timing constants ────────────────────────────────────────────
  var FOLD_DURATION = 400;      // ms for fold-up / fold-down
  var ROT_SPEED = 0.18;         // degrees per ms during active rotation
  var SETTLE_DELAY = 1500;      // ms before idle box settles to nearest face
  var SETTLE_EASE = 0.006;      // ease speed toward snap target per ms
  var FACE_COUNT = 4;

  // ── State ───────────────────────────────────────────────────────
  var _state = 'closed';        // closed, folding_up, open, folding_down
  var _foldProgress = 0;        // 0 (flat) to 1 (vertical, box complete)
  var _foldTimer = 0;           // ms into fold animation
  var _rotAngle = 0;            // Continuous rotation in degrees
  var _currentFace = 0;         // 0-3, snapped when settled
  var _settled = true;
  var _idleTime = 0;
  var _rotDir = 0;              // -1 left, 0 idle, 1 right
  var _context = 'pause';       // 'pause' | 'title' | 'bonfire' | 'shop'
  var _startFace = 0;           // Which face to show when opening

  // ── Nav button hit zones (screen-space rects updated each frame) ─
  var NAV_BTN_SIZE = 32;        // px — arrow button touch area
  var NAV_ARROW_SIZE = 16;      // px — drawn arrow sprite size
  var _navHitLeft  = null;      // { x, y, w, h } or null if not visible
  var _navHitRight = null;

  // ── Canvas references ───────────────────────────────────────────
  var _mainCanvas = null;
  var _blurCanvas = null;       // Cached blurred world snapshot

  // ── Face renderers ──────────────────────────────────────────────
  // Each face has a render function: fn(ctx, x, y, w, h, context)
  var _faceRenderers = [null, null, null, null];
  var _faceLabels = ['', '', '', ''];

  // ── Callbacks ───────────────────────────────────────────────────
  var _onClose = null;

  // ── Init ────────────────────────────────────────────────────────

  function init(canvas) {
    _mainCanvas = canvas;
  }

  // ── Face registration ───────────────────────────────────────────

  /**
   * Register a render function for a face.
   * @param {number} idx - Face index (0-3)
   * @param {Function} fn - fn(ctx, x, y, w, h, context)
   * @param {string} [label] - Face label for indicator dots
   */
  function setFaceRenderer(idx, fn, label) {
    if (idx >= 0 && idx < FACE_COUNT) {
      _faceRenderers[idx] = fn;
      _faceLabels[idx] = label || '';
    }
  }

  // ── Open / Close ────────────────────────────────────────────────

  /**
   * Open the menu box.
   * @param {string} context - 'pause', 'title', 'bonfire', 'shop'
   * @param {Object} [opts] - { startFace, onClose }
   */
  function open(context, opts) {
    if (_state === 'open' || _state === 'folding_up') return;

    opts = opts || {};
    _context = context || 'pause';
    _startFace = opts.startFace || 0;
    _onClose = opts.onClose || null;

    _rotAngle = _startFace * 90;
    _currentFace = _startFace;
    _settled = true;
    _idleTime = 0;
    _rotDir = 0;

    // Capture blurred world snapshot
    _captureBlurSnapshot();

    _state = 'folding_up';
    _foldTimer = 0;
    _foldProgress = 0;

    console.log('[MenuBox] Opening — context: ' + _context + ', face: ' + _startFace);
  }

  function close() {
    if (_state === 'closed' || _state === 'folding_down') return;

    _state = 'folding_down';
    _foldTimer = 0;
    _clearNavHits();

    console.log('[MenuBox] Closing');
  }

  function isOpen() {
    return _state === 'open' || _state === 'folding_up' || _state === 'folding_down';
  }

  function isFullyOpen() {
    return _state === 'open';
  }

  function getContext() { return _context; }
  function getCurrentFace() { return _currentFace; }
  function getRotAngle() { return _rotAngle; }

  // ── Rotation ────────────────────────────────────────────────────

  function rotateLeft() {
    if (_state !== 'open') return;
    _rotDir = -1;
    _settled = false;
    _idleTime = 0;
  }

  function rotateRight() {
    if (_state !== 'open') return;
    _rotDir = 1;
    _settled = false;
    _idleTime = 0;
  }

  function stopRotation() {
    _rotDir = 0;
    _idleTime = 0;
  }

  // ── Blur snapshot ───────────────────────────────────────────────

  function _captureBlurSnapshot() {
    if (!_mainCanvas) return;

    var w = _mainCanvas.width;
    var h = _mainCanvas.height;

    // Render at 1/4 resolution for cheap blur
    var smallW = Math.floor(w / 4);
    var smallH = Math.floor(h / 4);

    if (!_blurCanvas) {
      _blurCanvas = document.createElement('canvas');
    }
    _blurCanvas.width = smallW;
    _blurCanvas.height = smallH;

    var sCtx = _blurCanvas.getContext('2d');
    sCtx.drawImage(_mainCanvas, 0, 0, smallW, smallH);

    // 3-pass box blur (approximates gaussian at this resolution)
    _boxBlur(sCtx, smallW, smallH, 3);
  }

  function _boxBlur(ctx, w, h, passes) {
    var imageData = ctx.getImageData(0, 0, w, h);
    var data = imageData.data;
    var buf = new Uint8ClampedArray(data.length);
    var radius = 2;

    for (var pass = 0; pass < passes; pass++) {
      // Horizontal pass
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var r = 0, g = 0, b = 0, a = 0, count = 0;
          for (var dx = -radius; dx <= radius; dx++) {
            var nx = Math.min(w - 1, Math.max(0, x + dx));
            var i = (y * w + nx) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
            count++;
          }
          var oi = (y * w + x) * 4;
          buf[oi] = r / count; buf[oi + 1] = g / count;
          buf[oi + 2] = b / count; buf[oi + 3] = a / count;
        }
      }
      // Vertical pass
      for (var x2 = 0; x2 < w; x2++) {
        for (var y2 = 0; y2 < h; y2++) {
          var r2 = 0, g2 = 0, b2 = 0, a2 = 0, count2 = 0;
          for (var dy = -radius; dy <= radius; dy++) {
            var ny = Math.min(h - 1, Math.max(0, y2 + dy));
            var i2 = (ny * w + x2) * 4;
            r2 += buf[i2]; g2 += buf[i2 + 1]; b2 += buf[i2 + 2]; a2 += buf[i2 + 3];
            count2++;
          }
          var oi2 = (y2 * w + x2) * 4;
          data[oi2] = r2 / count2; data[oi2 + 1] = g2 / count2;
          data[oi2 + 2] = b2 / count2; data[oi2 + 3] = a2 / count2;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // ── Update (called each frame) ──────────────────────────────────

  function update(dt) {
    if (_state === 'closed') return;

    // ── Fold animation ──
    if (_state === 'folding_up') {
      _foldTimer += dt;
      _foldProgress = Math.min(1, _foldTimer / FOLD_DURATION);
      if (_foldProgress >= 1) {
        _state = 'open';
        _foldProgress = 1;
      }
    } else if (_state === 'folding_down') {
      _foldTimer += dt;
      _foldProgress = Math.max(0, 1 - _foldTimer / FOLD_DURATION);
      if (_foldProgress <= 0) {
        _state = 'closed';
        _foldProgress = 0;
        if (_onClose) {
          try { _onClose(); } catch (e) { console.error('[MenuBox] onClose error:', e); }
        }
      }
    }

    // ── Rotation ──
    if (_state === 'open') {
      if (_rotDir !== 0) {
        _rotAngle += _rotDir * ROT_SPEED * dt;
        _settled = false;
        _idleTime = 0;
      } else if (!_settled) {
        _idleTime += dt;
        if (_idleTime > SETTLE_DELAY) {
          // Ease toward nearest 90° snap
          var targetAngle = Math.round(_rotAngle / 90) * 90;
          _rotAngle += (targetAngle - _rotAngle) * SETTLE_EASE * dt;
          if (Math.abs(targetAngle - _rotAngle) < 0.5) {
            _rotAngle = targetAngle;
            _settled = true;
            _currentFace = (((Math.round(_rotAngle / 90)) % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;
          }
        }
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  /**
   * Render the MenuBox on the given canvas context.
   * Called from Game._render() during pause/bonfire/shop states.
   */
  function render(ctx, vpW, vpH) {
    if (_state === 'closed') return;

    // 1. Draw blurred world background
    if (_blurCanvas) {
      ctx.drawImage(_blurCanvas, 0, 0, vpW, vpH);
    }

    // 2. Dim overlay (strengthens with fold progress)
    ctx.fillStyle = 'rgba(0,0,0,' + (0.4 * _foldProgress) + ')';
    ctx.fillRect(0, 0, vpW, vpH);

    // 3. Draw visible faces (max 2 during rotation)
    var faceAngle0 = -(_rotAngle % 360);
    for (var f = 0; f < FACE_COUNT; f++) {
      var angle = faceAngle0 + f * 90;
      // Normalize to -180..180
      angle = ((angle + 180) % 360 + 360) % 360 - 180;

      var proj = _projectFace(angle, vpW, vpH);
      if (!proj) continue;

      // Apply fold progress (scale height from 0 at bottom)
      var foldH = proj.h * _foldProgress;
      var foldY = vpH - foldH; // Hinges at bottom of viewport

      _renderFace(ctx, f, proj.x, foldY, proj.w, foldH, proj.alpha * _foldProgress);
    }

    // 4. Face indicator dots
    if (_foldProgress > 0.8) {
      _renderFaceIndicator(ctx, vpW, vpH);
    }

    // 5. Context label
    if (_foldProgress > 0.5) {
      _renderContextLabel(ctx, vpW, vpH);
    }
  }

  /**
   * Project a face to 2D screen coordinates.
   * Adapted from GAME_FLOW_ROADMAP.md projection formula.
   */
  function _projectFace(faceAngleDeg, vpW, vpH) {
    var rad = faceAngleDeg * Math.PI / 180;
    var cosA = Math.cos(rad);
    var sinA = Math.sin(rad);

    if (cosA <= 0.01) return null; // Behind camera

    var faceW = vpW * 0.7 * cosA;
    var faceH = vpH * 0.8;
    var centerX = vpW / 2 + sinA * vpW * 0.4;

    return {
      x: centerX - faceW / 2,
      y: (vpH - faceH) / 2,
      w: faceW,
      h: faceH,
      alpha: Math.min(1, cosA * 1.5)
    };
  }

  /**
   * Render a single face with blur border and content area.
   */
  function _renderFace(ctx, faceIdx, x, y, w, h, alpha) {
    if (w < 10 || h < 10 || alpha < 0.05) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Blur border (outer frame) ──
    // Semi-transparent tinted border
    var borderPct = 0.12;
    ctx.fillStyle = 'rgba(20,18,25,0.6)';
    ctx.fillRect(x, y, w, h);

    // ── Content area (inner region) ──
    var cx = x + w * borderPct;
    var cy = y + h * borderPct;
    var cw = w * (1 - borderPct * 2);
    var ch = h * (1 - borderPct * 2);

    // Dark semi-opaque content background
    ctx.fillStyle = 'rgba(8,6,12,0.82)';
    _roundRect(ctx, cx, cy, cw, ch, 6);
    ctx.fill();

    // Ornamental border (biome-tinted)
    ctx.strokeStyle = 'rgba(160,140,100,0.5)';
    ctx.lineWidth = 1.5;
    _roundRect(ctx, cx, cy, cw, ch, 6);
    ctx.stroke();

    // ── Face content ──
    var padX = 12;
    var padY = 10;
    var renderer = _faceRenderers[faceIdx];
    if (renderer && ch > 20) {
      try {
        renderer(ctx, cx + padX, cy + padY, cw - padX * 2, ch - padY * 2, _context);
      } catch (e) {
        console.error('[MenuBox] Face ' + faceIdx + ' render error:', e);
        // Fallback: show face label
        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(_faceLabels[faceIdx] || ('Face ' + faceIdx),
                     cx + cw / 2, cy + ch / 2);
      }
    } else {
      // No renderer — placeholder
      ctx.fillStyle = '#555';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(_faceLabels[faceIdx] || ('Face ' + faceIdx),
                   x + w / 2, y + h / 2);
    }

    // ── Nav arrow buttons (on the front-facing pane only) ──
    // Only render on the face closest to camera (alpha > 0.8)
    if (alpha > 0.8 && _state === 'open' && cw > 60) {
      _renderNavButtons(ctx, cx, cy, cw, ch);
    }

    ctx.restore();
  }

  /**
   * Draw face indicator dots at bottom of screen.
   */
  function _renderFaceIndicator(ctx, vpW, vpH) {
    var dotRadius = 4;
    var dotGap = 16;
    var totalW = FACE_COUNT * dotGap;
    var startX = (vpW - totalW) / 2 + dotGap / 2;
    var dotY = vpH - 20;

    var activeFace = (((Math.round(_rotAngle / 90)) % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;

    ctx.save();
    ctx.globalAlpha = _foldProgress;
    for (var i = 0; i < FACE_COUNT; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * dotGap, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = (i === activeFace) ? '#f0d070' : 'rgba(255,255,255,0.3)';
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draw context label at top of screen.
   */
  function _renderContextLabel(ctx, vpW, vpH) {
    var labels = {
      pause: 'menu.face0',
      title: 'title.game_name',
      bonfire: 'hazard.bonfire_rest',
      shop: 'shop.title'
    };

    var labelKey = labels[_context] || '';
    var label = '';

    if (_context === 'pause') {
      label = i18n.t('menu.resume', 'PAUSED');
    } else if (_context === 'bonfire') {
      label = '🔥 ' + i18n.t('shop.bonfire_title', 'BONFIRE');
    } else if (_context === 'shop') {
      label = '🏪 ' + i18n.t('shop.title', 'SHOP');
    } else {
      label = i18n.t(labelKey, _context.toUpperCase());
    }

    ctx.save();
    ctx.globalAlpha = (_foldProgress - 0.5) * 2; // Fade in during second half of fold
    ctx.fillStyle = '#d0c8a0';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, vpW / 2, 28);
    ctx.restore();
  }

  // ── Nav button rendering ────────────────────────────────────────

  /**
   * Render left/right rotation arrows at the center of the content
   * area's left and right edges. Also updates _navHitLeft/_navHitRight
   * so pointer clicks can be detected.
   *
   * Uses UISprites 'arrow-left'/'arrow-right' if loaded, falls back
   * to canvas-drawn chevrons.
   */
  function _renderNavButtons(ctx, cx, cy, cw, ch) {
    var btnSize = NAV_BTN_SIZE;
    var arrowSize = NAV_ARROW_SIZE;
    var midY = cy + ch / 2;

    // ── Left arrow (rotate left = previous face) ──
    var lx = cx - btnSize / 2 + 4;       // Slightly inset from left edge
    var ly = midY - btnSize / 2;

    _navHitLeft = { x: lx, y: ly, w: btnSize, h: btnSize };

    // Button background
    var hoverLeft = _isPointerInRect(_navHitLeft);
    ctx.fillStyle = hoverLeft ? 'rgba(240,208,112,0.25)' : 'rgba(255,255,255,0.08)';
    _roundRect(ctx, lx, ly, btnSize, btnSize, 4);
    ctx.fill();
    ctx.strokeStyle = hoverLeft ? 'rgba(240,208,112,0.6)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, lx, ly, btnSize, btnSize, 4);
    ctx.stroke();

    // Arrow sprite or fallback chevron
    var leftSprite = (typeof UISprites !== 'undefined') ? UISprites.get('arrow-left') : null;
    if (leftSprite) {
      ctx.drawImage(leftSprite,
                    lx + (btnSize - arrowSize) / 2,
                    ly + (btnSize - arrowSize) / 2,
                    arrowSize, arrowSize);
    } else {
      _drawChevron(ctx, lx + btnSize / 2, midY, arrowSize, 'left', hoverLeft);
    }

    // ── Right arrow (rotate right = next face) ──
    var rx = cx + cw - btnSize / 2 - 4;  // Slightly inset from right edge
    var ry = midY - btnSize / 2;

    _navHitRight = { x: rx, y: ry, w: btnSize, h: btnSize };

    // Button background
    var hoverRight = _isPointerInRect(_navHitRight);
    ctx.fillStyle = hoverRight ? 'rgba(240,208,112,0.25)' : 'rgba(255,255,255,0.08)';
    _roundRect(ctx, rx, ry, btnSize, btnSize, 4);
    ctx.fill();
    ctx.strokeStyle = hoverRight ? 'rgba(240,208,112,0.6)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, rx, ry, btnSize, btnSize, 4);
    ctx.stroke();

    var rightSprite = (typeof UISprites !== 'undefined') ? UISprites.get('arrow-right') : null;
    if (rightSprite) {
      ctx.drawImage(rightSprite,
                    rx + (btnSize - arrowSize) / 2,
                    ry + (btnSize - arrowSize) / 2,
                    arrowSize, arrowSize);
    } else {
      _drawChevron(ctx, rx + btnSize / 2, midY, arrowSize, 'right', hoverRight);
    }
  }

  /**
   * Draw a simple chevron arrow as canvas path fallback.
   */
  function _drawChevron(ctx, cx, cy, size, dir, hover) {
    var half = size / 2;
    ctx.save();
    ctx.strokeStyle = hover ? '#f0d070' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (dir === 'left') {
      ctx.moveTo(cx + half * 0.4, cy - half);
      ctx.lineTo(cx - half * 0.4, cy);
      ctx.lineTo(cx + half * 0.4, cy + half);
    } else {
      ctx.moveTo(cx - half * 0.4, cy - half);
      ctx.lineTo(cx + half * 0.4, cy);
      ctx.lineTo(cx - half * 0.4, cy + half);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Pointer hit detection ─────────────────────────────────────

  /**
   * Check if the current pointer position is inside a rect.
   */
  function _isPointerInRect(rect) {
    if (!rect || typeof InputManager === 'undefined') return false;
    var ptr = InputManager.getPointer();
    if (!ptr || !ptr.active) return false;
    return ptr.x >= rect.x && ptr.x <= rect.x + rect.w &&
           ptr.y >= rect.y && ptr.y <= rect.y + rect.h;
  }

  /**
   * Handle a pointer click event. Called from game.js or InputManager
   * when 'pointer_click' fires during PAUSE state.
   *
   * @returns {boolean} true if click was consumed by a nav button
   */
  function handlePointerClick() {
    if (_state !== 'open') return false;

    if (_navHitLeft && _isPointerInRect(_navHitLeft)) {
      rotateLeft();
      // Brief rotation pulse — stop after ~90° snap
      setTimeout(function () { stopRotation(); }, 200);
      return true;
    }

    if (_navHitRight && _isPointerInRect(_navHitRight)) {
      rotateRight();
      setTimeout(function () { stopRotation(); }, 200);
      return true;
    }

    return false;
  }

  /**
   * Clear nav hit zones (when box is not rendering).
   */
  function _clearNavHits() {
    _navHitLeft = null;
    _navHitRight = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    init: init,
    setFaceRenderer: setFaceRenderer,
    open: open,
    close: close,
    isOpen: isOpen,
    isFullyOpen: isFullyOpen,
    getContext: getContext,
    getCurrentFace: getCurrentFace,
    getRotAngle: getRotAngle,
    rotateLeft: rotateLeft,
    rotateRight: rotateRight,
    stopRotation: stopRotation,
    update: update,
    render: render,
    handlePointerClick: handlePointerClick,

    // Constants
    FACE_COUNT: FACE_COUNT,
    FOLD_DURATION: FOLD_DURATION
  };
})();

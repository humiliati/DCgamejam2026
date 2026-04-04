/**
 * Toast — canvas-rendered non-blocking notification system.
 *
 * Small messages that appear briefly at the top-right of the viewport.
 * "Picked up: Iron Key", "Quest Updated", "+5 HP", "Gold: 12".
 *
 * Does NOT block gameplay input — purely informational.
 *
 * Layer 2 (after DialogBox, before MenuBox)
 * Depends on: i18n (optional, for string lookup)
 */
var Toast = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var DEFAULT_DURATION = 2500;  // ms before fade starts
  var FADE_DURATION    = 400;   // ms fade-out
  var MAX_VISIBLE      = 4;     // Max simultaneous toasts
  var TOAST_H          = 28;    // Height per toast
  var TOAST_PAD        = 8;     // Inner padding
  var TOAST_GAP        = 4;     // Gap between stacked toasts
  var TOAST_MARGIN     = 12;    // Margin from viewport edges
  var SLIDE_SPEED      = 0.008; // px per ms for slide-in (0→1 over ~125ms)
  var TOAST_RADIUS     = 5;     // Corner radius
  var ICON_SIZE        = 16;    // Emoji icon render size

  // ── Color presets ───────────────────────────────────────────────
  var COLORS = {
    item:    { bg: 'rgba(20,50,20,0.85)',  border: 'rgba(80,180,80,0.6)',  text: '#8f8' },
    quest:   { bg: 'rgba(20,30,60,0.85)',  border: 'rgba(80,120,220,0.6)', text: '#8af' },
    warning: { bg: 'rgba(60,50,10,0.85)',  border: 'rgba(220,180,60,0.6)', text: '#fd8' },
    damage:  { bg: 'rgba(50,15,15,0.85)',  border: 'rgba(200,60,60,0.6)',  text: '#f88' },
    info:    { bg: 'rgba(20,20,30,0.85)',  border: 'rgba(120,120,160,0.5)',text: '#ccc' },
    gold:    { bg: 'rgba(40,35,10,0.85)',  border: 'rgba(200,170,60,0.6)', text: '#f0d070' },
    // Suit advantage toasts (EyesOnly RESOURCE_COLOR_SYSTEM)
    spade:   { bg: 'rgba(40,38,35,0.9)',   border: 'rgba(180,170,150,0.7)', text: '#b4aa96' },
    club:    { bg: 'rgba(0,30,50,0.9)',     border: 'rgba(0,212,255,0.7)',   text: '#00D4FF' },
    diamond: { bg: 'rgba(0,40,25,0.9)',     border: 'rgba(0,255,166,0.7)',   text: '#00FFA6' },
    heart:   { bg: 'rgba(50,15,25,0.9)',    border: 'rgba(255,107,157,0.7)', text: '#FF6B9D' },
    suit_adv:    { bg: 'rgba(10,10,10,0.92)',  border: 'rgba(255,220,80,0.8)',  text: '#FFE066' },
    suit_disadv: { bg: 'rgba(10,10,10,0.92)',  border: 'rgba(180,60,60,0.8)',   text: '#ff8888' },
    // Gameplay feedback presets
    loot:     { bg: 'rgba(20,40,25,0.88)',  border: 'rgba(100,200,120,0.6)', text: '#8fd8a0' },
    currency: { bg: 'rgba(40,35,10,0.88)',  border: 'rgba(200,170,60,0.6)',  text: '#f0d070' },
    hp:       { bg: 'rgba(50,15,15,0.88)',  border: 'rgba(200,80,80,0.5)',   text: '#f09090' },
    battery:  { bg: 'rgba(20,20,50,0.88)',  border: 'rgba(100,120,220,0.5)', text: '#90a0f0' },
    dim:      { bg: 'rgba(15,15,18,0.85)',  border: 'rgba(80,80,90,0.4)',    text: '#888' }
  };

  // ── State ───────────────────────────────────────────────────────
  var _toasts = [];  // { text, icon, color, duration, age, slide, fading }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Show a toast notification.
   *
   * Two call signatures:
   *   Toast.show({ text, icon?, color?, duration? })
   *   Toast.show('text', 'colorPreset')  — shorthand
   *
   * @param {Object|string} param - Toast parameters or plain text
   * @param {string} [colorKey] - Color preset when param is a string
   */
  function show(param, colorKey) {
    if (typeof param === 'string') {
      param = { text: param, color: colorKey || undefined };
    }

    var toast = {
      text:     param.text || '',
      icon:     param.icon || null,
      color:    COLORS[param.color] || COLORS.info,
      duration: param.duration || DEFAULT_DURATION,
      age:      0,
      slide:    0,      // 0→1 slide-in progress
      fading:   false
    };

    _toasts.push(toast);

    // Trim oldest if over max
    while (_toasts.length > MAX_VISIBLE) {
      _toasts.shift();
    }

    // Mirror to StatusBar tooltip history (persistent log)
    if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
      StatusBar.pushTooltip(param.text, param.color || colorKey || 'info');
    }
  }

  // ── Centered "big" toast (suit advantage, etc.) ─────────────────
  var _centered = null;  // { text, icon, color, duration, age, scale }

  var CENTER_DURATION  = 1400;
  var CENTER_FADE      = 350;
  var CENTER_FONT_SIZE = 22;
  var CENTER_PAD       = 14;
  var CENTER_RADIUS    = 8;

  /**
   * Show a large centered toast (e.g., suit advantage overlay).
   * Only one at a time — replaces any existing centered toast.
   *
   * @param {Object} param - { text, icon?, color?, duration? }
   */
  function showCentered(param) {
    if (typeof param === 'string') param = { text: param };
    _centered = {
      text:     param.text || '',
      icon:     param.icon || null,
      color:    COLORS[param.color] || COLORS.info,
      duration: param.duration || CENTER_DURATION,
      age:      0,
      scale:    0
    };
  }

  /** Clear all toasts immediately. */
  function clear() {
    _toasts.length = 0;
    _centered = null;
  }

  /**
   * Update toast timers. Call once per frame.
   * @param {number} dt - Frame delta in ms
   */
  function update(dt) {
    for (var i = _toasts.length - 1; i >= 0; i--) {
      var t = _toasts[i];
      t.age += dt;

      // Slide in
      if (t.slide < 1) {
        t.slide = Math.min(1, t.slide + SLIDE_SPEED * dt);
      }

      // Check if expired (age past duration + fade)
      if (t.age >= t.duration + FADE_DURATION) {
        _toasts.splice(i, 1);
      }
    }

    // Tick centered toast
    if (_centered) {
      _centered.age += dt;
      // Scale-in: 0→1 over first 120ms (ease-out)
      if (_centered.scale < 1) {
        _centered.scale = Math.min(1, _centered.scale + dt / 120);
      }
      if (_centered.age >= _centered.duration + CENTER_FADE) {
        _centered = null;
      }
    }
  }

  /**
   * Render toasts on the canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW - Viewport width
   * @param {number} vpH - Viewport height
   */
  function render(ctx, vpW, vpH) {
    if (_toasts.length === 0 && !_centered) return;

    ctx.save();

    for (var i = 0; i < _toasts.length; i++) {
      var t = _toasts[i];
      var col = t.color;

      // Calculate alpha (fade out at end of life)
      var alpha = 1;
      if (t.age > t.duration) {
        alpha = 1 - (t.age - t.duration) / FADE_DURATION;
        alpha = Math.max(0, Math.min(1, alpha));
      }

      // Slide-in easing (ease-out quad)
      var slide = 1 - (1 - t.slide) * (1 - t.slide);

      // Measure text width for toast sizing
      ctx.font = '12px monospace';
      var textW = ctx.measureText(t.text).width;
      var iconW = t.icon ? ICON_SIZE + 6 : 0;
      var toastW = TOAST_PAD * 2 + iconW + textW;
      var minW = 120;
      if (toastW < minW) toastW = minW;

      // Position: centered below the freelook ring, stacked downward.
      // ViewportRing center = viewport center, radius ≈ 0.315 * min(vpW,vpH).
      // Place toasts just below the ring with a small gap.
      var RING_FRAC = 0.315;
      var ringR = RING_FRAC * Math.min(vpW, vpH);
      var ringBottom = vpH / 2 + ringR + 10;  // 10px gap below ring
      var tx = (vpW - toastW) / 2;
      var ty = ringBottom + i * (TOAST_H + TOAST_GAP);

      // Combine slide-in (fade) with expiry alpha
      ctx.globalAlpha = alpha * slide;

      // Background
      _roundRect(ctx, tx, ty, toastW, TOAST_H, TOAST_RADIUS);
      ctx.fillStyle = col.bg;
      ctx.fill();

      // Border
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 1;
      _roundRect(ctx, tx, ty, toastW, TOAST_H, TOAST_RADIUS);
      ctx.stroke();

      // Icon (emoji)
      if (t.icon) {
        ctx.font = ICON_SIZE + 'px serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(t.icon, tx + TOAST_PAD, ty + TOAST_H / 2);
      }

      // Text
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col.text;
      ctx.fillText(t.text, tx + TOAST_PAD + iconW, ty + TOAST_H / 2);
    }

    // ── Centered toast (suit advantage overlay) ──
    if (_centered) {
      var c = _centered;
      var col = c.color;

      // Alpha: full during display, fade at end
      var cAlpha = 1;
      if (c.age > c.duration) {
        cAlpha = 1 - (c.age - c.duration) / CENTER_FADE;
        cAlpha = Math.max(0, Math.min(1, cAlpha));
      }

      // Pop-in scale (ease-out quad)
      var scl = 1 - (1 - c.scale) * (1 - c.scale);

      ctx.globalAlpha = cAlpha;

      // Measure text
      ctx.font = 'bold ' + CENTER_FONT_SIZE + 'px monospace';
      var cTextW = ctx.measureText(c.text).width;
      var cIconW = c.icon ? (CENTER_FONT_SIZE + 8) : 0;
      var cW = CENTER_PAD * 2 + cIconW + cTextW;
      var cH = CENTER_FONT_SIZE + CENTER_PAD * 2;
      var cx = (vpW - cW) / 2;
      var cy = vpH * 0.32 - cH / 2;

      // Apply pop-in scale around center
      ctx.save();
      ctx.translate(cx + cW / 2, cy + cH / 2);
      ctx.scale(scl, scl);
      ctx.translate(-(cx + cW / 2), -(cy + cH / 2));

      // Background
      _roundRect(ctx, cx, cy, cW, cH, CENTER_RADIUS);
      ctx.fillStyle = col.bg;
      ctx.fill();

      // Border (thicker for emphasis)
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 2;
      _roundRect(ctx, cx, cy, cW, cH, CENTER_RADIUS);
      ctx.stroke();

      // Icon
      if (c.icon) {
        ctx.font = CENTER_FONT_SIZE + 'px serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(c.icon, cx + CENTER_PAD, cy + cH / 2);
      }

      // Text
      ctx.font = 'bold ' + CENTER_FONT_SIZE + 'px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col.text;
      ctx.fillText(c.text, cx + CENTER_PAD + cIconW, cy + cH / 2);

      ctx.restore();
    }

    ctx.restore();
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

  // ── Public ──────────────────────────────────────────────────────

  return {
    show: show,
    showCentered: showCentered,
    clear: clear,
    update: update,
    render: render,
    COLORS: COLORS
  };
})();

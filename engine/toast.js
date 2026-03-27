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
    gold:    { bg: 'rgba(40,35,10,0.85)',  border: 'rgba(200,170,60,0.6)', text: '#f0d070' }
  };

  // ── State ───────────────────────────────────────────────────────
  var _toasts = [];  // { text, icon, color, duration, age, slide, fading }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Show a toast notification.
   *
   * @param {Object|string} param - Toast parameters or plain text
   * @param {string}  param.text     - Message text
   * @param {string}  [param.icon]   - Emoji icon (rendered left of text)
   * @param {string}  [param.color]  - Color preset key: item|quest|warning|damage|info|gold
   * @param {number}  [param.duration] - Display duration in ms (default 2500)
   */
  function show(param) {
    if (typeof param === 'string') {
      param = { text: param };
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
  }

  /** Clear all toasts immediately. */
  function clear() {
    _toasts.length = 0;
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
  }

  /**
   * Render toasts on the canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW - Viewport width
   * @param {number} vpH - Viewport height
   */
  function render(ctx, vpW, vpH) {
    if (_toasts.length === 0) return;

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

      // Position: top-right, stacked downward
      var tx = vpW - TOAST_MARGIN - toastW * slide;
      var ty = TOAST_MARGIN + i * (TOAST_H + TOAST_GAP);

      ctx.globalAlpha = alpha;

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
    clear: clear,
    update: update,
    render: render,
    COLORS: COLORS
  };
})();

/**
 * WorldPopup — brief text labels that appear at tile positions in the 3D viewport.
 *
 * When the Gleaner scrubs blood, re-arms a trap, deploys a cobweb, or tears one,
 * a small text label pops up at the interaction point in 3D space and floats
 * upward before fading out. This gives spatial feedback — the player sees where
 * the action happened, not just a corner toast.
 *
 * Uses the same billboard projection math as the raycaster sprite pass:
 *   angle from player direction → screen X
 *   inverse distance → screen Y and font size
 *
 * Layer 2 — depends on: MovementController (Layer 1)
 */
var WorldPopup = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var FOV         = Math.PI / 3;
  var HALF_FOV    = FOV / 2;
  var LIFETIME_MS = 1200;         // Total popup duration
  var FADE_START  = 0.6;          // Fraction of lifetime when fade begins
  var RISE_PX     = 40;           // Total pixels the text floats upward
  var BASE_FONT   = 16;           // Font size at distance=1
  var MAX_DIST    = 12;           // Don't render beyond this
  var MAX_POPUPS  = 6;            // Cap active popups

  // ── Color presets (match Toast categories) ─────────────────────
  var COLORS = {
    loot:     '#8fd8a0',
    warning:  '#fd8',
    currency: '#f0d070',
    info:     '#ccc',
    damage:   '#f88',
    hp:       '#f09090'
  };

  // ── State ──────────────────────────────────────────────────────
  var _popups = [];  // { text, wx, wy, age, color }

  /**
   * Spawn a popup at a world tile position.
   *
   * @param {string} text   - Short label ("🧹 Clean!", "⚙️ Armed!", "🕸️ Torn!")
   * @param {number} tileX  - Grid tile X
   * @param {number} tileY  - Grid tile Y
   * @param {string} [colorKey] - Color preset key (default 'info')
   */
  function spawn(text, tileX, tileY, colorKey) {
    if (_popups.length >= MAX_POPUPS) _popups.shift();
    _popups.push({
      text:  text,
      wx:    tileX + 0.5,
      wy:    tileY + 0.5,
      age:   0,
      color: COLORS[colorKey] || COLORS.info
    });
  }

  /**
   * Update popup timers. Call once per frame.
   * @param {number} dt - Frame delta in ms
   */
  function update(dt) {
    for (var i = _popups.length - 1; i >= 0; i--) {
      _popups[i].age += dt;
      if (_popups[i].age >= LIFETIME_MS) {
        _popups.splice(i, 1);
      }
    }
  }

  /**
   * Render all active popups.
   * Call after Raycaster.render() in the game loop.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW    - Viewport width
   * @param {number} vpH    - Viewport height
   * @param {Object} player - { x, y, dir } in render space (interpolated)
   */
  function render(ctx, vpW, vpH, player) {
    if (!_popups.length || !player) return;

    var px   = player.x + 0.5;
    var py   = player.y + 0.5;
    var pDir = player.dir;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < _popups.length; i++) {
      var p = _popups[i];
      var dx = p.wx - px;
      var dy = p.wy - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1 || dist > MAX_DIST) continue;

      // Angle from player forward direction
      var angle = Math.atan2(dy, dx) - pDir;
      while (angle >  Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      if (Math.abs(angle) > HALF_FOV + 0.15) continue;

      // Billboard projection
      var screenX = Math.floor(vpW / 2 + (angle / HALF_FOV) * (vpW / 2));
      var halfH   = vpH / 2;

      // Vertical position: horizon level, offset slightly above center
      var baseY = halfH - Math.floor(halfH * 0.3 / dist);

      // Animation progress (0→1)
      var t = p.age / LIFETIME_MS;

      // Rise animation (ease-out)
      var rise = RISE_PX * (1 - (1 - t) * (1 - t));
      var screenY = baseY - rise;

      // Alpha: full until FADE_START, then fade to 0
      var alpha = 1;
      if (t > FADE_START) {
        alpha = 1 - (t - FADE_START) / (1 - FADE_START);
      }
      // Distance fade
      alpha *= Math.max(0.2, 1 - dist / MAX_DIST);

      // Font size scales with distance
      var fontSize = Math.max(10, Math.floor(BASE_FONT / (dist * 0.6)));

      ctx.globalAlpha = alpha;
      ctx.font = 'bold ' + fontSize + 'px monospace';

      // Drop shadow for legibility
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(p.text, screenX + 1, screenY + 1);

      // Main text
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, screenX, screenY);
    }

    ctx.restore();
  }

  /** Clear all popups (floor transition). */
  function clear() {
    _popups.length = 0;
  }

  return Object.freeze({
    spawn:  spawn,
    update: update,
    render: render,
    clear:  clear
  });
})();

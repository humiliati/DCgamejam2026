/**
 * CobwebRenderer — Canvas overlay for cobweb visual effects.
 *
 * Draws procedural spider-web patterns in the 3D viewport for cobwebs
 * managed by CobwebSystem. Two render modes:
 *
 *   standalone   — Full barrier web spanning floor-to-ceiling in a corridor.
 *                  Projected as a billboard at the tile's world position.
 *                  Alpha ~0.58 so the dungeon is visible through the webbing.
 *
 *   wall_overlay — Smaller decorative web in the upper corner of a wall face.
 *                  Alpha ~0.45, rendered at the facing-wall position.
 *
 * Billboard projection uses the same DDA geometry as the raycaster's sprite
 * pass (angle from player direction → screen X, inverse-distance → height).
 *
 * ─── Integration Roadmap ───────────────────────────────────────────────────
 * Phase 1 (this file): Standalone CobwebRenderer module, no existing edits.
 *
 * Phase 2 — Wire into game.js _renderFrame() (do not edit game.js now):
 *   After the Raycaster.render() call, before the Minimap render:
 *     CobwebRenderer.render(ctx, canvas.width, canvas.height, renderPlayer, floorId);
 *   Where renderPlayer = { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset }
 *
 * Phase 4 — Visual refinement:
 *   • Destroyed cobwebs render as torn shred sprites (short strand remnants).
 *   • Silk-thread colour varies by biome (grey cellar, pale green sewer, gold temple).
 *   • Per-column z-buffer check to hide webs behind closer walls (requires
 *     CobwebRenderer.setZBuffer(zBuffer) called from Raycaster.render).
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Layer 2 — depends on: CobwebSystem (Layer 1), MovementController (Layer 1)
 */
var CobwebRenderer = (function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  var FOV          = Math.PI / 3;   // Must match Raycaster FOV
  var HALF_FOV     = FOV / 2;

  var WEB_ALPHA_STANDALONE = 0.58;  // Standalone (barrier) web opacity
  var WEB_ALPHA_OVERLAY    = 0.45;  // Wall-overlay web opacity

  var WEB_COLOR    = '#ddd8cc';     // Main thread colour
  var WEB_COLOR2   = '#bfb8a8';     // Secondary thread colour (rings)

  var MAX_DIST     = 10;            // Tiles — don't render beyond this distance

  // Web pattern geometry
  var STRAND_COUNT = 12;            // Radial threads per web circle
  var RING_COUNT   = 5;             // Concentric ring count

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Render all intact cobwebs visible from the player's position.
   * Call after Raycaster.render() in the game render loop.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW    - Viewport width  (canvas.width)
   * @param {number} vpH    - Viewport height (canvas.height)
   * @param {Object} player - { x, y, dir } in render (interpolated) space
   * @param {string} floorId
   */
  function render(ctx, vpW, vpH, player, floorId) {
    if (typeof CobwebSystem === 'undefined') return;
    if (!floorId || !player) return;

    var cobwebs = CobwebSystem.getIntact(floorId);
    if (!cobwebs.length) return;

    var px   = player.x + 0.5;
    var py   = player.y + 0.5;
    var pDir = player.dir;

    for (var i = 0; i < cobwebs.length; i++) {
      _renderOne(ctx, vpW, vpH, cobwebs[i], px, py, pDir);
    }
  }

  // ── Private rendering ─────────────────────────────────────────────

  /**
   * Project and render a single cobweb.
   */
  function _renderOne(ctx, vpW, vpH, cob, px, py, pDir) {
    var wx   = cob.x + 0.5;
    var wy   = cob.y + 0.5;
    var dx   = wx - px;
    var dy   = wy - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1 || dist > MAX_DIST) return;

    // Horizontal angle from player's forward direction to the cobweb
    var angle = Math.atan2(dy, dx) - pDir;
    // Normalise to (-π, π]
    while (angle >  Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;

    // Outside the field-of-view?  Allow a small margin.
    if (Math.abs(angle) > HALF_FOV + 0.12) return;

    // Billboard screen X (same formula as raycaster sprite pass)
    var screenX = Math.floor(vpW / 2 + (angle / HALF_FOV) * (vpW / 2));
    var halfH   = vpH / 2;

    // Distance-based fog fade
    var fogFactor = Math.min(1, dist / MAX_DIST);
    var fadeAlpha = Math.max(0.05, 1 - fogFactor * fogFactor);

    ctx.save();

    if (cob.type === 'standalone') {
      // Full corridor-spanning barrier web
      var wallH = Math.floor(halfH * 1.1 / dist);
      ctx.globalAlpha = WEB_ALPHA_STANDALONE * fadeAlpha;
      _drawBarrierWeb(ctx, screenX, halfH, wallH, dist);
    } else {
      // Decorative wall-corner web (wall_overlay type)
      var cornerR = Math.max(6, Math.floor(halfH * 0.45 / dist));
      var cornerX = screenX - cornerR * 0.4;
      var cornerY = halfH - Math.floor(halfH * 0.55 / dist);
      ctx.globalAlpha = WEB_ALPHA_OVERLAY * fadeAlpha;
      _drawWebCircle(ctx, cornerX, cornerY, cornerR);
    }

    ctx.restore();
  }

  /**
   * Draw a standalone cobweb barrier: full-height web filling a 1-tile corridor.
   * The web is drawn as a rectangular mesh with radial threads crossing it,
   * matching the corridor orientation (horizontal or vertical).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx       - Screen centre X of the barrier
   * @param {number} cy       - Screen centre Y (horizon line)
   * @param {number} halfH    - Half the web height in pixels
   * @param {number} dist     - Distance in tiles (used for line width)
   */
  function _drawBarrierWeb(ctx, cx, cy, halfH, dist) {
    var r = halfH;  // vertical radius
    if (r < 2) return;

    var lw = Math.max(0.4, 1.6 / dist);

    ctx.strokeStyle = WEB_COLOR;
    ctx.lineWidth   = lw;

    // ── Radial strands outward from centre ──────────────────────
    for (var s = 0; s < STRAND_COUNT; s++) {
      var a = (s / STRAND_COUNT) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
      ctx.stroke();
    }

    // ── Concentric rings with organic jitter ────────────────────
    ctx.strokeStyle = WEB_COLOR2;
    ctx.lineWidth   = lw * 0.8;

    for (var ring = 1; ring <= RING_COUNT; ring++) {
      var ringFrac = ring / RING_COUNT;
      var ringR    = ringFrac * r;

      ctx.beginPath();
      for (var s2 = 0; s2 <= STRAND_COUNT; s2++) {
        var sa = (s2 / STRAND_COUNT) * Math.PI * 2;
        // Per-strand-per-ring jitter gives an irregular, organic look
        var jitter = 1 + 0.07 * Math.sin(s2 * 2.3 + ring * 1.7);
        var rx = cx + Math.cos(sa) * ringR * jitter;
        var ry = cy + Math.sin(sa) * ringR * jitter * 0.8;
        if (s2 === 0) { ctx.moveTo(rx, ry); }
        else          { ctx.lineTo(rx, ry); }
      }
      ctx.closePath();
      ctx.stroke();
    }

    // ── Outer boundary circle ────────────────────────────────────
    ctx.strokeStyle = WEB_COLOR;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Draw a smaller decorative cobweb (wall_overlay variant).
   * Classic radial + spiral spider-web design.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - Centre X
   * @param {number} cy - Centre Y
   * @param {number} r  - Radius in pixels
   */
  function _drawWebCircle(ctx, cx, cy, r) {
    if (r < 2) return;

    var lw = Math.max(0.4, r * 0.025);

    ctx.strokeStyle = WEB_COLOR;
    ctx.lineWidth   = lw;

    // Radial threads
    for (var s = 0; s < STRAND_COUNT; s++) {
      var a = (s / STRAND_COUNT) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }

    // Concentric rings
    ctx.strokeStyle = WEB_COLOR2;
    ctx.lineWidth   = lw * 0.7;

    for (var ring = 1; ring <= RING_COUNT; ring++) {
      var ringR = (ring / RING_COUNT) * r;
      ctx.beginPath();
      for (var s2 = 0; s2 <= STRAND_COUNT; s2++) {
        var sa = (s2 / STRAND_COUNT) * Math.PI * 2;
        var jitter = 1 + 0.08 * Math.sin(s2 * 2.3 + ring * 1.7);
        var rx = cx + Math.cos(sa) * ringR * jitter;
        var ry = cy + Math.sin(sa) * ringR * jitter;
        if (s2 === 0) { ctx.moveTo(rx, ry); }
        else          { ctx.lineTo(rx, ry); }
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  return Object.freeze({
    render: render
  });
})();

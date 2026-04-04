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

  // Default thread colours (cellar biome)
  var WEB_COLOR    = '#ddd8cc';     // Main thread colour
  var WEB_COLOR2   = '#bfb8a8';     // Secondary thread colour (rings)

  // Per-biome tint overrides (Phase 4.1)
  var BIOME_COLORS = {
    cellar:  { main: '#ddd8cc', ring: '#bfb8a8' },  // Dusty grey
    foundry: { main: '#e8d8a0', ring: '#c8b880' },  // Warm gold
    sealab:  { main: '#b8e8c8', ring: '#90c8a8' }   // Pale green
  };

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
  // Active biome colors for this frame (set per render call)
  var _mainColor = WEB_COLOR;
  var _ringColor = WEB_COLOR2;

  /**
   * Render all intact cobwebs visible from the player's position.
   * Call after Raycaster.render() in the game render loop.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW    - Viewport width  (canvas.width)
   * @param {number} vpH    - Viewport height (canvas.height)
   * @param {Object} player - { x, y, dir } in render (interpolated) space
   * @param {string} floorId
   * @param {string} [biome] - 'cellar' | 'foundry' | 'sealab' (optional, tints web color)
   */
  function render(ctx, vpW, vpH, player, floorId, biome) {
    if (typeof CobwebSystem === 'undefined') return;
    if (!floorId || !player) return;

    var cobwebs = CobwebSystem.getIntact(floorId);
    if (!cobwebs.length) return;

    // Resolve biome tint
    var tint = BIOME_COLORS[biome] || BIOME_COLORS.cellar;
    _mainColor = tint.main;
    _ringColor = tint.ring;

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
   *
   * Standalone webs are flat planes spanning a 1-tile corridor, oriented
   * perpendicular to the corridor direction:
   *   - H corridor (runs E↔W) → web faces N↔S (plane normal = E/W axis)
   *   - V corridor (runs N↔S) → web faces E↔W (plane normal = N/S axis)
   *
   * The screen width of the barrier is foreshortened by the viewing angle
   * relative to the web plane's normal, so head-on = full width, parallel = thin.
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
    while (angle >  Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;

    // Outside the field-of-view? Allow a small margin.
    if (Math.abs(angle) > HALF_FOV + 0.12) return;

    // Billboard screen X (same formula as raycaster sprite pass)
    var screenX = Math.floor(vpW / 2 + (angle / HALF_FOV) * (vpW / 2));
    var halfH   = vpH / 2;

    // Distance-based fog fade
    var fogFactor = Math.min(1, dist / MAX_DIST);
    var fadeAlpha = Math.max(0.05, 1 - fogFactor * fogFactor);

    ctx.save();

    if (cob.type === 'standalone') {
      // ── Barrier web: oriented plane spanning the corridor ──
      // Wall height at this distance (floor-to-ceiling)
      var wallH = Math.floor(halfH * 1.1 / dist);

      // Corridor-aware width: the web stretches across the corridor (1 tile wide).
      // The plane's world normal depends on corridorDir:
      //   H corridor → plane normal is along X axis (angle 0 or π)
      //   V corridor → plane normal is along Y axis (angle π/2 or 3π/2)
      var planeNormalAngle = (cob.corridorDir === 'V') ? 0 : (Math.PI / 2);
      // Dot product of view direction with plane normal gives foreshortening
      var viewToPlane = Math.abs(Math.cos(pDir - planeNormalAngle));
      // Clamp foreshortening so the web doesn't vanish completely edge-on
      viewToPlane = Math.max(0.15, viewToPlane);

      // Base width: 1 tile projected at this distance, scaled by foreshortening
      var baseWidth = Math.floor(vpW * 0.5 / dist);
      var webWidth = Math.floor(baseWidth * viewToPlane);
      webWidth = Math.max(4, Math.min(webWidth, vpW * 0.8)); // clamp

      ctx.globalAlpha = WEB_ALPHA_STANDALONE * fadeAlpha;
      _drawBarrierWeb(ctx, screenX, halfH, wallH, webWidth, dist);
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
   * Draw a standalone cobweb barrier: floor-to-ceiling web filling a corridor.
   *
   * The web is an elliptical radial pattern with corridor-aware dimensions:
   *   - halfH controls the vertical extent (floor-to-ceiling)
   *   - halfW controls the horizontal extent (wall-to-wall, foreshortened)
   *
   * Radial strands extend from the centre outward; concentric rings
   * connect them with organic jitter for a natural cobweb look.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx       - Screen centre X of the barrier
   * @param {number} cy       - Screen centre Y (horizon line)
   * @param {number} halfH    - Half the web height in pixels (floor-to-ceiling)
   * @param {number} halfW    - Half the web width in pixels (wall-to-wall)
   * @param {number} dist     - Distance in tiles (used for line width)
   */
  function _drawBarrierWeb(ctx, cx, cy, halfH, halfW, dist) {
    if (halfH < 2 || halfW < 2) return;

    var lw = Math.max(0.4, 1.6 / dist);

    // ── Anchor threads to corners (structural support) ──────────
    // Four diagonal threads from centre to the four corners of the
    // corridor rectangle — gives the web its rectangular frame.
    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw * 1.2;
    var corners = [
      [cx - halfW, cy - halfH],  // top-left
      [cx + halfW, cy - halfH],  // top-right
      [cx + halfW, cy + halfH],  // bottom-right
      [cx - halfW, cy + halfH]   // bottom-left
    ];
    for (var c = 0; c < 4; c++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(corners[c][0], corners[c][1]);
      ctx.stroke();
    }

    // ── Radial strands outward from centre ──────────────────────
    ctx.lineWidth = lw;
    for (var s = 0; s < STRAND_COUNT; s++) {
      var a = (s / STRAND_COUNT) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * halfW, cy + Math.sin(a) * halfH);
      ctx.stroke();
    }

    // ── Concentric rings with organic jitter ────────────────────
    ctx.strokeStyle = _ringColor;
    ctx.lineWidth = lw * 0.8;

    for (var ring = 1; ring <= RING_COUNT; ring++) {
      var ringFrac = ring / RING_COUNT;
      var ringW = ringFrac * halfW;
      var ringH = ringFrac * halfH;

      ctx.beginPath();
      for (var s2 = 0; s2 <= STRAND_COUNT; s2++) {
        var sa = (s2 / STRAND_COUNT) * Math.PI * 2;
        var jitter = 1 + 0.07 * Math.sin(s2 * 2.3 + ring * 1.7);
        var rx = cx + Math.cos(sa) * ringW * jitter;
        var ry = cy + Math.sin(sa) * ringH * jitter;
        if (s2 === 0) { ctx.moveTo(rx, ry); }
        else          { ctx.lineTo(rx, ry); }
      }
      ctx.closePath();
      ctx.stroke();
    }

    // ── Outer boundary ellipse ──────────────────────────────────
    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
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

    ctx.strokeStyle = _mainColor;
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
    ctx.strokeStyle = _ringColor;
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

  // ── Tear particles (Phase 4.5) ────────────────────────────────────
  // When a cobweb is torn, spawn drifting silk strands that settle.

  var _tearParticles = [];

  /**
   * Spawn tear particles at a world position.
   * Called from game.js when a cobweb is destroyed.
   *
   * @param {number} wx - World X (tile centre)
   * @param {number} wy - World Y (tile centre)
   */
  function spawnTear(wx, wy) {
    var count = 6 + Math.floor(Math.random() * 4);
    for (var i = 0; i < count; i++) {
      _tearParticles.push({
        wx: wx + 0.5 + (Math.random() - 0.5) * 0.6,
        wy: wy + 0.5 + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 0.4,   // slow horizontal drift
        vy: 0.3 + Math.random() * 0.5,      // downward settle
        life: 0,
        maxLife: 600 + Math.random() * 400,  // 0.6–1.0s
        rot: Math.random() * Math.PI,
        rotV: (Math.random() - 0.5) * 3     // spin
      });
    }
  }

  /**
   * Update and render tear particles.
   * Call each frame from the game render loop (after render()).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW
   * @param {number} vpH
   * @param {Object} player - { x, y, dir }
   * @param {number} dt - Frame delta ms
   */
  function updateTearParticles(ctx, vpW, vpH, player, dt) {
    if (!_tearParticles.length || !player) return;

    var px   = player.x + 0.5;
    var py   = player.y + 0.5;
    var pDir = player.dir;

    ctx.save();
    ctx.strokeStyle = _mainColor;

    for (var i = _tearParticles.length - 1; i >= 0; i--) {
      var p = _tearParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        _tearParticles.splice(i, 1);
        continue;
      }

      // Physics
      p.wx += p.vx * dt * 0.001;
      p.wy += p.vy * dt * 0.001;
      p.vy += 0.15 * dt * 0.001; // gentle gravity
      p.rot += p.rotV * dt * 0.001;

      // Project to screen
      var dx   = p.wx - px;
      var dy   = p.wy - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.05 || dist > MAX_DIST) continue;

      var angle = Math.atan2(dy, dx) - pDir;
      while (angle >  Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      if (Math.abs(angle) > HALF_FOV + 0.1) continue;

      var sx = Math.floor(vpW / 2 + (angle / HALF_FOV) * (vpW / 2));
      var sy = vpH / 2 + Math.floor((vpH / 2) * 0.3 / dist);
      var len = Math.max(2, Math.floor(8 / dist));

      var alpha = 1 - (p.life / p.maxLife);
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = Math.max(0.5, 1.2 / dist);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(p.rot) * len, sy + Math.sin(p.rot) * len);
      ctx.stroke();
    }

    ctx.restore();
  }

  return Object.freeze({
    render:              render,
    spawnTear:           spawnTear,
    updateTearParticles: updateTearParticles
  });
})();

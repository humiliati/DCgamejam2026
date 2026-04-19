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
      _renderOne(ctx, vpW, vpH, cobwebs[i], px, py, pDir, floorId);
    }
  }

  // ── Private rendering ─────────────────────────────────────────────

  // Install draw-in animation duration (strands extend outward, rings fade in).
  var DRAW_DURATION_MS = 600;

  // Variant pool — deterministic per-install silhouette so every web on a floor
  // doesn't look identical. Picked by hashing floorId + tile coords.
  var VARIANTS = ['classic', 'corner_br', 'funnel', 'tangled', 'hammock', 'sheet'];

  /**
   * Deterministic variant picker. Hashes floorId + tile coords so the same
   * cobweb always renders with the same silhouette across frames (and
   * survives save/load without mutating CobwebSystem state).
   *
   * Phase 4.7: if the cob record carries an explicit `variantId` (set by
   * CobwebSystem.install when forced by a failed constellation trace), we
   * honor that override instead of hashing. This keeps botched installs
   * visually consistent (forced 'tangled') without plumbing a second state
   * field through the renderer.
   */
  function _pickVariant(cob, floorId) {
    if (cob && cob.variantId && VARIANTS.indexOf(cob.variantId) !== -1) {
      return cob.variantId;
    }
    var s = (floorId || '') + '|' + cob.x + ',' + cob.y;
    var h = 2166136261; // FNV-1a start
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) | 0;
    }
    return VARIANTS[((h >>> 0) % VARIANTS.length)];
  }

  /**
   * Draw a partial line from (x1,y1) toward (x2,y2) by fraction p.
   * Used for the draw-in animation — strands extend from their anchor outward.
   */
  function _strokeLine(ctx, x1, y1, x2, y2, p) {
    if (p <= 0) return;
    var q = (p >= 1) ? 1 : p;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q);
    ctx.stroke();
  }

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
  function _renderOne(ctx, vpW, vpH, cob, px, py, pDir, floorId) {
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

    // Install draw-in progress [0..1] — computed from cob.installedAt.
    // Strands extend first (0→0.65), rings fade in overlapping (0.40→1.0).
    var drawProgress = 1;
    if (typeof cob.installedAt === 'number') {
      var age = Date.now() - cob.installedAt;
      drawProgress = Math.max(0, Math.min(1, age / DRAW_DURATION_MS));
    }
    var strandP = Math.min(1, drawProgress / 0.65);
    var ringP   = Math.max(0, Math.min(1, (drawProgress - 0.40) / 0.60));

    ctx.save();

    if (cob.type === 'standalone' || cob.type === 'aesthetic') {
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
      // Raise the foreshortening floor from 0.15 → 0.30 so webs stay legible
      // when viewed at a shallow angle (the "too narrow" fix — Phase A).
      viewToPlane = Math.max(0.30, viewToPlane);

      // Base width: 1 tile projected at this distance, scaled by foreshortening
      var baseWidth = Math.floor(vpW * 0.5 / dist);
      var webWidth = Math.floor(baseWidth * viewToPlane);
      webWidth = Math.max(4, Math.min(webWidth, vpW * 0.8)); // clamp

      var variant = _pickVariant(cob, floorId);

      ctx.globalAlpha = WEB_ALPHA_STANDALONE * fadeAlpha;
      _drawBarrierWeb(ctx, screenX, halfH, wallH, webWidth, dist, variant, strandP, ringP);
    } else {
      // Decorative wall-corner web (wall_overlay type)
      var cornerR = Math.max(6, Math.floor(halfH * 0.45 / dist));
      var cornerX = screenX - cornerR * 0.4;
      var cornerY = halfH - Math.floor(halfH * 0.55 / dist);
      ctx.globalAlpha = WEB_ALPHA_OVERLAY * fadeAlpha;
      _drawWebCircle(ctx, cornerX, cornerY, cornerR, strandP, ringP);
    }

    ctx.restore();
  }

  /**
   * Dispatch to the right silhouette renderer. Each variant honours
   * `strandP` (radial line extension 0..1) and `ringP` (ring fade-in 0..1)
   * so the install draw-in animation plays consistently across variants.
   *
   * All variants share the same framing bbox (halfH × halfW) so corridor
   * foreshortening and fog fade stay consistent.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx       - Screen centre X of the barrier
   * @param {number} cy       - Screen centre Y (horizon line)
   * @param {number} halfH    - Half the web height in pixels (floor-to-ceiling)
   * @param {number} halfW    - Half the web width in pixels (wall-to-wall)
   * @param {number} dist     - Distance in tiles (used for line width)
   * @param {string} variant  - One of VARIANTS
   * @param {number} strandP  - Strand draw-in progress [0..1]
   * @param {number} ringP    - Ring fade-in progress [0..1]
   */
  function _drawBarrierWeb(ctx, cx, cy, halfH, halfW, dist, variant, strandP, ringP) {
    if (halfH < 2 || halfW < 2) return;
    var lw = Math.max(0.4, 1.6 / dist);

    switch (variant) {
      case 'corner_br': _drawWeb_cornerBr(ctx, cx, cy, halfH, halfW, lw, strandP, ringP); break;
      case 'funnel':    _drawWeb_funnel  (ctx, cx, cy, halfH, halfW, lw, strandP, ringP); break;
      case 'tangled':   _drawWeb_tangled (ctx, cx, cy, halfH, halfW, lw, strandP, ringP); break;
      case 'hammock':   _drawWeb_hammock (ctx, cx, cy, halfH, halfW, lw, strandP, ringP); break;
      case 'sheet':     _drawWeb_sheet   (ctx, cx, cy, halfH, halfW, lw, strandP, ringP); break;
      case 'classic':
      default:          _drawWeb_classic (ctx, cx, cy, halfH, halfW, lw, strandP, ringP);
    }
  }

  // ── Barrier web variants ──────────────────────────────────────────

  /**
   * Classic symmetric web — 4 corner anchors, 12 centred radial strands,
   * 5 concentric elliptical rings, outer bounding ellipse.
   * This is the original silhouette (pre-Phase A) preserved as one option.
   */
  function _drawWeb_classic(ctx, cx, cy, halfH, halfW, lw, strandP, ringP) {
    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw * 1.2;
    var corners = [
      [cx - halfW, cy - halfH],
      [cx + halfW, cy - halfH],
      [cx + halfW, cy + halfH],
      [cx - halfW, cy + halfH]
    ];
    for (var c = 0; c < 4; c++) {
      _strokeLine(ctx, cx, cy, corners[c][0], corners[c][1], strandP);
    }

    ctx.lineWidth = lw;
    for (var s = 0; s < STRAND_COUNT; s++) {
      var a = (s / STRAND_COUNT) * Math.PI * 2;
      _strokeLine(ctx, cx, cy, cx + Math.cos(a) * halfW, cy + Math.sin(a) * halfH, strandP);
    }

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP;
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
        if (s2 === 0) ctx.moveTo(rx, ry);
        else          ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Outer boundary ellipse appears only once the rings are nearly full.
    if (ringP > 0.85) {
      ctx.strokeStyle = _mainColor;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Corner-anchored fan — asymmetric, anchored at the bottom-right corner
   * of the frame. Three structural anchor threads reach across; a fan of
   * radial strands sweeps from the anchor across the corridor; concentric
   * quarter-arcs form the ring layer.
   */
  function _drawWeb_cornerBr(ctx, cx, cy, halfH, halfW, lw, strandP, ringP) {
    var ax = cx + halfW * 0.80;
    var ay = cy + halfH * 0.80;

    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw * 1.2;
    _strokeLine(ctx, ax, ay, cx - halfW,         cy - halfH,        strandP);
    _strokeLine(ctx, ax, ay, cx + halfW,         cy - halfH * 0.85, strandP);
    _strokeLine(ctx, ax, ay, cx - halfW * 0.85,  cy + halfH,        strandP);

    ctx.lineWidth = lw;
    var N = 10;
    for (var s = 0; s < N; s++) {
      // Sweep from roughly π (toward upper-left) through to -π/2 (upper-right).
      var a = Math.PI + (s / (N - 1)) * (Math.PI * 0.75);
      _strokeLine(ctx, ax, ay, ax + Math.cos(a) * halfW * 1.8, ay + Math.sin(a) * halfH * 1.8, strandP);
    }

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP;
    ctx.strokeStyle = _ringColor;
    ctx.lineWidth = lw * 0.7;

    var aspectCorrection = halfH / Math.max(1, halfW);
    for (var ring = 1; ring <= 4; ring++) {
      var r = (ring / 4) * Math.max(halfW, halfH) * 1.6;
      ctx.beginPath();
      var steps = 16;
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var jitter = 1 + 0.06 * Math.sin(i * 1.9 + ring * 2.1);
        var ang = Math.PI + t * (Math.PI * 0.75);
        var x = ax + Math.cos(ang) * r * jitter;
        var y = ay + Math.sin(ang) * r * jitter * aspectCorrection;
        if (i === 0) ctx.moveTo(x, y);
        else         ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Funnel web — focal point near the ceiling, strands fan downward and
   * outward. Horizontal catenary rings form the rings layer.
   */
  function _drawWeb_funnel(ctx, cx, cy, halfH, halfW, lw, strandP, ringP) {
    var fx = cx;
    var fy = cy - halfH * 0.55;

    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw * 1.1;
    _strokeLine(ctx, fx, fy, cx - halfW, cy - halfH, strandP);
    _strokeLine(ctx, fx, fy, cx + halfW, cy - halfH, strandP);

    ctx.lineWidth = lw;
    var N = 11;
    for (var s = 0; s < N; s++) {
      var t = s / (N - 1);
      var a = Math.PI * 0.15 + t * (Math.PI * 0.70);  // ~27°..~153°, a downward fan
      _strokeLine(ctx, fx, fy, fx + Math.cos(a) * halfW * 1.6, fy + Math.sin(a) * halfH * 2.2, strandP);
    }

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP;
    ctx.strokeStyle = _ringColor;
    ctx.lineWidth = lw * 0.7;

    for (var ring = 1; ring <= 5; ring++) {
      var rt = ring / 5;
      var ringY = fy + rt * halfH * 1.9;
      var ringW = halfW * (0.25 + rt * 0.85);
      ctx.beginPath();
      var steps = 14;
      for (var i = 0; i <= steps; i++) {
        var tt = i / steps;
        var x = fx + (tt - 0.5) * 2 * ringW;
        var sag = Math.sin(tt * Math.PI) * halfH * 0.06;
        var jit = Math.sin(i * 1.7 + ring * 1.3) * lw * 0.8;
        if (i === 0) ctx.moveTo(x, ringY + sag + jit);
        else         ctx.lineTo(x, ringY + sag + jit);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Tangled web — two overlapping centres wired by a bridge thread.
   * Produces a distinctly chaotic silhouette — the "overworked spider".
   */
  function _drawWeb_tangled(ctx, cx, cy, halfH, halfW, lw, strandP, ringP) {
    var cx1 = cx - halfW * 0.25;
    var cy1 = cy - halfH * 0.20;
    var cx2 = cx + halfW * 0.25;
    var cy2 = cy + halfH * 0.20;

    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw * 1.1;
    var corners = [
      [cx - halfW, cy - halfH],
      [cx + halfW, cy - halfH],
      [cx + halfW, cy + halfH],
      [cx - halfW, cy + halfH]
    ];
    for (var c = 0; c < 4; c++) {
      var useA = (c === 0 || c === 3);
      var ax = useA ? cx1 : cx2;
      var ay = useA ? cy1 : cy2;
      _strokeLine(ctx, ax, ay, corners[c][0], corners[c][1], strandP);
    }

    ctx.lineWidth = lw;
    var N = 8;
    for (var s = 0; s < N; s++) {
      var a1 = (s / N) * Math.PI * 2 + 0.3;
      _strokeLine(ctx, cx1, cy1, cx1 + Math.cos(a1) * halfW * 0.75, cy1 + Math.sin(a1) * halfH * 0.85, strandP);
    }
    for (var s3 = 0; s3 < N; s3++) {
      var a3 = (s3 / N) * Math.PI * 2 - 0.5;
      _strokeLine(ctx, cx2, cy2, cx2 + Math.cos(a3) * halfW * 0.75, cy2 + Math.sin(a3) * halfH * 0.85, strandP);
    }
    // Bridge thread between the two centres
    _strokeLine(ctx, cx1, cy1, cx2, cy2, strandP);

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP * 0.85;
    ctx.strokeStyle = _ringColor;
    ctx.lineWidth = lw * 0.65;

    var centres = [[cx1, cy1], [cx2, cy2]];
    for (var k = 0; k < centres.length; k++) {
      var ccx = centres[k][0];
      var ccy = centres[k][1];
      for (var ring = 1; ring <= 3; ring++) {
        var rf = ring / 3;
        var rW = rf * halfW * 0.7;
        var rH = rf * halfH * 0.7;
        ctx.beginPath();
        for (var s4 = 0; s4 <= N; s4++) {
          var sa = (s4 / N) * Math.PI * 2;
          var jitter = 1 + 0.12 * Math.sin(s4 * 2.7 + ring * 1.3 + k * 0.9);
          var rx = ccx + Math.cos(sa) * rW * jitter;
          var ry = ccy + Math.sin(sa) * rH * jitter;
          if (s4 === 0) ctx.moveTo(rx, ry);
          else          ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Hammock — two side anchors high up, a catenary rope sags between them
   * with vertical threads dropping to the floor. Reads as a slung sheet.
   */
  function _drawWeb_hammock(ctx, cx, cy, halfH, halfW, lw, strandP, ringP) {
    var lx = cx - halfW;
    var rx = cx + halfW;
    var anchorY = cy - halfH * 0.55;
    var segs = 18;

    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw * 1.2;

    // Main hammock rope — catenary curve from left anchor to right anchor,
    // revealed progressively by strandP.
    var maxReveal = Math.floor(segs * Math.max(0, Math.min(1, strandP)));
    if (maxReveal > 0) {
      ctx.beginPath();
      for (var i = 0; i <= maxReveal; i++) {
        var t = i / segs;
        var x = lx + (rx - lx) * t;
        var sag = Math.sin(t * Math.PI) * halfH * 0.6;
        var y = anchorY + sag;
        if (i === 0) ctx.moveTo(x, y);
        else         ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Hanging vertical threads dropping from the rope.
    ctx.lineWidth = lw;
    var N = 9;
    for (var s = 1; s < N; s++) {
      var t2 = s / N;
      var x2 = lx + (rx - lx) * t2;
      var sag2 = Math.sin(t2 * Math.PI) * halfH * 0.6;
      var ropeY = anchorY + sag2;
      var dropY = cy + halfH * (0.4 + Math.sin(s * 1.9) * 0.2);
      _strokeLine(ctx, x2, ropeY, x2, dropY, strandP);
    }
    // Anchor threads from the end points down to the opposite-side corners.
    _strokeLine(ctx, lx, anchorY, cx - halfW, cy + halfH, strandP);
    _strokeLine(ctx, rx, anchorY, cx + halfW, cy + halfH, strandP);

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP;
    ctx.strokeStyle = _ringColor;
    ctx.lineWidth = lw * 0.7;

    // Horizontal catenary layers below the main rope, diminishing in sag.
    for (var ring = 1; ring <= 4; ring++) {
      var ry = anchorY + halfH * (0.15 + ring * 0.22);
      var ringSag = halfH * (0.45 - ring * 0.08);
      ctx.beginPath();
      for (var i2 = 0; i2 <= segs; i2++) {
        var tt = i2 / segs;
        var xx = lx + (rx - lx) * tt;
        var yy = ry + Math.sin(tt * Math.PI) * ringSag + Math.sin(i2 * 1.7 + ring * 1.3) * lw * 0.7;
        if (i2 === 0) ctx.moveTo(xx, yy);
        else          ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Sheet web — dense horizontal strands anchored to both side walls, a
   * few vertical cross-threads, subtle horizontal accent bands as rings.
   * The "wall-to-wall curtain" silhouette.
   */
  function _drawWeb_sheet(ctx, cx, cy, halfH, halfW, lw, strandP, ringP) {
    ctx.strokeStyle = _mainColor;
    ctx.lineWidth = lw;

    var N = 14;
    for (var s = 0; s < N; s++) {
      if (strandP <= 0) break;
      var t = s / (N - 1);
      var y = cy - halfH + t * (halfH * 2);
      var sagBase = Math.sin(t * Math.PI) * halfH * 0.08;
      var leftX = cx - halfW;
      var rightX = cx + halfW;
      var midX = leftX + (rightX - leftX) * strandP;
      ctx.beginPath();
      var steps = 10;
      for (var i = 0; i <= steps; i++) {
        var tt = i / steps;
        var x = leftX + (midX - leftX) * tt;
        var sag = Math.sin(tt * Math.PI) * sagBase;
        var jit = Math.sin(i * 2.1 + s * 1.3) * lw * 0.4;
        if (i === 0) ctx.moveTo(x, y + sag + jit);
        else         ctx.lineTo(x, y + sag + jit);
      }
      ctx.stroke();
    }

    // A handful of vertical cross-threads to hold the sheet together.
    ctx.lineWidth = lw * 0.8;
    var V = 5;
    for (var v = 0; v < V; v++) {
      var vt = (v + 0.5) / V;
      var vx = cx - halfW + vt * halfW * 2;
      _strokeLine(ctx, vx, cy - halfH, vx, cy + halfH, strandP);
    }

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP * 0.6;
    ctx.strokeStyle = _ringColor;
    ctx.lineWidth = lw * 0.6;

    // Two subtle horizontal accent bands.
    for (var ring = 0; ring < 2; ring++) {
      var ay = cy + (ring === 0 ? -halfH * 0.35 : halfH * 0.35);
      ctx.beginPath();
      var steps2 = 18;
      for (var j = 0; j <= steps2; j++) {
        var jt = j / steps2;
        var xj = cx - halfW + jt * halfW * 2;
        var sag2 = Math.sin(jt * Math.PI) * halfH * 0.12;
        var jit2 = Math.sin(j * 2.4 + ring * 1.1) * lw * 0.6;
        if (j === 0) ctx.moveTo(xj, ay + sag2 + jit2);
        else         ctx.lineTo(xj, ay + sag2 + jit2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Draw a smaller decorative cobweb (wall_overlay variant).
   * Classic radial + spiral spider-web design.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - Centre X
   * @param {number} cy - Centre Y
   * @param {number} r  - Radius in pixels
   * @param {number} [strandP=1] - Strand draw-in progress [0..1]
   * @param {number} [ringP=1]   - Ring fade-in progress   [0..1]
   */
  function _drawWebCircle(ctx, cx, cy, r, strandP, ringP) {
    if (r < 2) return;
    if (typeof strandP !== 'number') strandP = 1;
    if (typeof ringP   !== 'number') ringP   = 1;

    var lw = Math.max(0.4, r * 0.025);

    ctx.strokeStyle = _mainColor;
    ctx.lineWidth   = lw;

    // Radial threads (extend from centre outward by strandP).
    for (var s = 0; s < STRAND_COUNT; s++) {
      var a = (s / STRAND_COUNT) * Math.PI * 2;
      _strokeLine(ctx, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, strandP);
    }

    if (ringP <= 0) return;
    var savedAlpha = ctx.globalAlpha;
    ctx.globalAlpha = savedAlpha * ringP;

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
    ctx.globalAlpha = savedAlpha;
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

  /**
   * Public variant picker for consumers that need the deterministic variant
   * _before_ a cob record exists (e.g. CobwebTrace previews the required
   * trace shape at install-begin time). Mirrors the private hash so
   * trace-time and render-time always agree.
   */
  function pickVariantForPosition(x, y, floorId) {
    return _pickVariant({ x: x, y: y }, floorId);
  }

  return Object.freeze({
    render:                 render,
    spawnTear:              spawnTear,
    updateTearParticles:    updateTearParticles,
    pickVariantForPosition: pickVariantForPosition
  });
})();

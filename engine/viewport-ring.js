/**
 * ViewportRing — translucent ring overlay for freelook zone + directional indicators.
 *
 * Renders a "porthole" ring on the game canvas that:
 *   1. Visually defines the free-look active zone (inner ring edge = dead zone boundary)
 *   2. Shows directional indicator pips (bark source, threat, quest) along the ring
 *   3. Displays a subtle look-direction reticle tick that tracks the free-look offset
 *
 * The ring is mostly transparent — the player sees the 3D world through it.
 * The outer region (between ring and canvas edge) gets a gentle tint to
 * communicate "this is the HUD zone, not the look zone."
 *
 * Canvas-rendered (no DOM) — draws in the render loop after PostProcess,
 * before UI overlays. Uses the same ctx as the raycaster.
 *
 * Layer 2 module (Rendering + UI). Dependencies: Player (layer 3 — optional,
 * read only for lookOffset). Wire via Game.
 *
 * Spec reference: DOC-50 SPATIAL_AUDIO_BARK_ROADMAP Phase 2.
 */
var ViewportRing = (function () {
  'use strict';

  // ── Ring geometry ──────────────────────────────────────────────────
  // Ring radius as fraction of the smaller canvas dimension (height).
  // 0.315 = 75% of the original 0.42 (25% smaller visual ring).
  // The MouseLook hitbox (0.328) is slightly larger for forgiveness.
  var RING_RADIUS_FRAC = 0.315;

  // Ring stroke width (px) — the actual brass/chrome band
  var RING_WIDTH = 3;

  // ── Colors ─────────────────────────────────────────────────────────
  // Ring band: warm brass with low alpha (translucent, not distracting)
  var RING_COLOR       = 'rgba(180,160,120,0.25)';
  var RING_HIGHLIGHT   = 'rgba(220,200,160,0.35)';  // Top-lit specular band

  // Outer mask: very subtle darkening beyond the ring (HUD zone hint)
  var OUTER_MASK_ALPHA = 0.08;

  // Reticle tick: small line at ring edge showing current look direction
  var RETICLE_COLOR    = 'rgba(220,200,140,0.55)';
  var RETICLE_LENGTH   = 10;

  // ── Directional indicators ─────────────────────────────────────────
  // Active indicators: [{ type, angle, text, color, spawnT, lifeMs }]
  var _indicators = [];
  var MAX_INDICATORS = 12;

  // Indicator config per type
  var IND_CONFIG = {
    bark:   { radius: 6, color: 'rgba(100,220,140,0.7)', life: 3000 },
    threat: { radius: 5, color: 'rgba(255,80,60,0.8)',   life: 0 },   // 0 = persistent
    sound:  { radius: 4, color: 'rgba(180,200,220,0.5)', life: 600 },
    quest:  { radius: 5, color: 'rgba(80,220,100,0.8)',  life: 0 }
  };

  // ── State ──────────────────────────────────────────────────────────
  var _enabled = true;
  var _lookOffset = 0;   // Updated each frame from Player.lookOffset

  // ── Init ───────────────────────────────────────────────────────────

  function init() {
    _indicators = [];
  }

  // ── Render ─────────────────────────────────────────────────────────

  /**
   * Render the viewport ring overlay.
   * Call after PostProcess, before UI overlays.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  function render(ctx, w, h) {
    if (!_enabled) return;

    var cx = w / 2;
    var cy = h / 2;
    var r  = Math.min(w, h) * RING_RADIUS_FRAC;
    var now = performance.now();

    // Read current look offset for reticle positioning
    if (typeof Player !== 'undefined') {
      var p = Player.state();
      if (p) _lookOffset = p.lookOffset || 0;
    }

    ctx.save();

    // ── 1. Outer mask — subtle darkening outside the ring ──
    // Draw a full-canvas rect with a circular cutout
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, r + RING_WIDTH, 0, Math.PI * 2, true); // CCW = cutout
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,' + OUTER_MASK_ALPHA + ')';
    ctx.fill();
    ctx.restore();

    // ── 2. Ring band (brass porthole frame) ──
    // Inner shadow for depth
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = RING_WIDTH + 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.stroke();

    // Main ring stroke
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = RING_WIDTH;
    ctx.strokeStyle = RING_COLOR;
    ctx.stroke();

    // Top-lit highlight arc (upper 120°)
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.lineWidth = RING_WIDTH - 1;
    ctx.strokeStyle = RING_HIGHLIGHT;
    ctx.stroke();

    // ── 3. Reticle tick — shows current freelook direction ──
    // At the top of the ring, offset horizontally by lookOffset
    var lookFrac = 0;
    if (typeof Player !== 'undefined' && Player.FREE_LOOK_RANGE > 0) {
      lookFrac = _lookOffset / Player.FREE_LOOK_RANGE; // -1 to +1
    }
    // Map lookFrac to an angle on the ring (small arc, ±30° from top)
    var reticleAngle = -Math.PI / 2 + lookFrac * (Math.PI / 6);
    var rInner = r - RETICLE_LENGTH;
    var rOuter = r + RETICLE_LENGTH * 0.5;
    var rx1 = cx + Math.cos(reticleAngle) * rInner;
    var ry1 = cy + Math.sin(reticleAngle) * rInner;
    var rx2 = cx + Math.cos(reticleAngle) * rOuter;
    var ry2 = cy + Math.sin(reticleAngle) * rOuter;

    ctx.beginPath();
    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = RETICLE_COLOR;
    ctx.stroke();

    // Small diamond at reticle tip
    var dSz = 3;
    var dX = cx + Math.cos(reticleAngle) * (r);
    var dY = cy + Math.sin(reticleAngle) * (r);
    ctx.beginPath();
    ctx.moveTo(dX, dY - dSz);
    ctx.lineTo(dX + dSz, dY);
    ctx.lineTo(dX, dY + dSz);
    ctx.lineTo(dX - dSz, dY);
    ctx.closePath();
    ctx.fillStyle = RETICLE_COLOR;
    ctx.fill();

    // ── 4. Directional indicator pips ──
    _renderIndicators(ctx, cx, cy, r, now);

    ctx.restore();
  }

  // ── Indicator rendering ────────────────────────────────────────────

  function _renderIndicators(ctx, cx, cy, r, now) {
    var i = _indicators.length;
    while (i--) {
      var ind = _indicators[i];
      var cfg = IND_CONFIG[ind.type] || IND_CONFIG.sound;

      // Lifetime check (0 = persistent, removed externally)
      if (cfg.life > 0) {
        var age = now - ind.spawnT;
        if (age > cfg.life) {
          _indicators.splice(i, 1);
          continue;
        }
        // Fade out in last 30% of life
        var fadeStart = cfg.life * 0.7;
        var alpha = age > fadeStart
          ? 1 - (age - fadeStart) / (cfg.life - fadeStart)
          : 1;
        ctx.globalAlpha = alpha;
      }

      // Position on ring circumference
      var px = cx + Math.cos(ind.angle) * (r + 8);
      var py = cy + Math.sin(ind.angle) * (r + 8);

      // Pip circle
      ctx.beginPath();
      ctx.arc(px, py, cfg.radius, 0, Math.PI * 2);
      ctx.fillStyle = ind.color || cfg.color;
      ctx.fill();

      // Truncated label (bark text)
      if (ind.text) {
        var label = ind.text.length > 24 ? ind.text.substring(0, 22) + '\u2026' : ind.text;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        // Position label just outside the pip
        var labelR = r + 8 + cfg.radius + 8;
        var lx = cx + Math.cos(ind.angle) * labelR;
        var ly = cy + Math.sin(ind.angle) * labelR;
        ctx.fillText(label, lx, ly);
      }

      ctx.globalAlpha = 1;
    }
  }

  // ── Indicator API ──────────────────────────────────────────────────

  /**
   * Add a directional indicator on the ring.
   *
   * @param {string} type - 'bark' | 'threat' | 'sound' | 'quest'
   * @param {number} angle - World-space angle in radians (from SpatialDir or manual)
   * @param {Object} [opts] - { text, color, id }
   */
  function addIndicator(type, angle, opts) {
    opts = opts || {};
    if (_indicators.length >= MAX_INDICATORS) {
      // Evict oldest non-persistent
      for (var i = 0; i < _indicators.length; i++) {
        var cfg = IND_CONFIG[_indicators[i].type];
        if (cfg && cfg.life > 0) { _indicators.splice(i, 1); break; }
      }
    }
    _indicators.push({
      type:   type,
      angle:  angle,
      text:   opts.text || null,
      color:  opts.color || null,
      id:     opts.id || null,
      spawnT: performance.now()
    });
  }

  /**
   * Remove a persistent indicator by id (for threat/quest that end).
   * @param {string} id
   */
  function removeIndicator(id) {
    for (var i = _indicators.length - 1; i >= 0; i--) {
      if (_indicators[i].id === id) { _indicators.splice(i, 1); }
    }
  }

  /** Clear all indicators. */
  function clearIndicators() { _indicators.length = 0; }

  /**
   * Set ring visibility.
   * @param {boolean} on
   */
  function setEnabled(on) { _enabled = !!on; }

  // ── Public API ─────────────────────────────────────────────────────

  return Object.freeze({
    init:             init,
    render:           render,
    addIndicator:     addIndicator,
    removeIndicator:  removeIndicator,
    clearIndicators:  clearIndicators,
    setEnabled:       setEnabled,
    RING_RADIUS_FRAC: RING_RADIUS_FRAC
  });
})();

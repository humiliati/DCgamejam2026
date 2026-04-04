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

  // ── Ring bark (north-anchored text) ─────────────────────────────────
  // Renders interaction text centered at the top of the ring, inside the
  // brass band. Queued entries cycle through with fade-in/linger/fade-out.
  // SPATIAL_AUDIO_BARK_ROADMAP Phase 2 — jam-scope subset.

  var BARK_FONT       = '12px monospace';
  var BARK_LINE_H     = 16;          // px per line
  var BARK_MAX_W_FRAC = 0.5;         // Max text width as fraction of canvas width
  var BARK_PAD_X      = 14;          // Horizontal padding inside bubble
  var BARK_PAD_Y      = 8;           // Vertical padding inside bubble
  var BARK_OFFSET_Y   = 24;          // Pixels below ring's north edge (inside ring)
  var BARK_BG         = 'rgba(20,18,14,0.72)';
  var BARK_TEXT_COLOR  = 'rgba(230,220,190,0.95)';
  var BARK_FADE_IN    = 200;         // ms
  var BARK_LINGER     = 3500;        // ms
  var BARK_FADE_OUT   = 600;         // ms
  var BARK_QUEUE_MAX  = 4;

  var _barkQueue = [];   // [{ text, lines, spawnT }]
  var _barkActive = null;

  /**
   * Push interaction text to the ring-bark display.
   * Renders centered at the north (top) of the free-look ring.
   * @param {string} text
   */
  function showRingBark(text) {
    if (!text) return;
    // Wrap text to lines (deferred — needs canvas ctx, done at render time)
    var entry = { text: text, lines: null, spawnT: 0 };
    if (!_barkActive) {
      _barkActive = entry;
      _barkActive.spawnT = performance.now();
    } else {
      if (_barkQueue.length >= BARK_QUEUE_MAX) _barkQueue.shift();
      _barkQueue.push(entry);
    }
  }

  /** Advance bark queue — call each frame. */
  function _tickBarkQueue(now) {
    if (!_barkActive) return;
    var totalLife = BARK_FADE_IN + BARK_LINGER + BARK_FADE_OUT;
    if (now - _barkActive.spawnT > totalLife) {
      // Current entry expired — advance queue
      _barkActive = _barkQueue.shift() || null;
      if (_barkActive) _barkActive.spawnT = now;
    }
  }

  /** Word-wrap text into lines that fit within maxW pixels. */
  function _wrapText(ctx, text, maxW) {
    var words = text.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Render the active ring bark entry. */
  function _renderBark(ctx, cx, cy, r, w, now) {
    if (!_barkActive) return;

    var age = now - _barkActive.spawnT;
    var totalLife = BARK_FADE_IN + BARK_LINGER + BARK_FADE_OUT;

    // Compute opacity
    var alpha;
    if (age < BARK_FADE_IN) {
      alpha = age / BARK_FADE_IN;
    } else if (age < BARK_FADE_IN + BARK_LINGER) {
      alpha = 1;
    } else if (age < totalLife) {
      alpha = 1 - (age - BARK_FADE_IN - BARK_LINGER) / BARK_FADE_OUT;
    } else {
      alpha = 0;
    }
    if (alpha <= 0) return;

    // Lazy word-wrap (first render frame)
    ctx.font = BARK_FONT;
    if (!_barkActive.lines) {
      var maxW = w * BARK_MAX_W_FRAC;
      _barkActive.lines = _wrapText(ctx, _barkActive.text, maxW);
    }
    var lines = _barkActive.lines;
    if (!lines.length) return;

    // Measure bubble
    var textW = 0;
    for (var i = 0; i < lines.length; i++) {
      var lw = ctx.measureText(lines[i]).width;
      if (lw > textW) textW = lw;
    }
    var bubbleW = textW + BARK_PAD_X * 2;
    var bubbleH = lines.length * BARK_LINE_H + BARK_PAD_Y * 2;
    var bubbleX = cx - bubbleW / 2;
    var bubbleY = cy - r + BARK_OFFSET_Y;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Background bubble (rounded rect)
    var cr = 6;
    ctx.beginPath();
    ctx.moveTo(bubbleX + cr, bubbleY);
    ctx.lineTo(bubbleX + bubbleW - cr, bubbleY);
    ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + cr);
    ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - cr);
    ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - cr, bubbleY + bubbleH);
    ctx.lineTo(bubbleX + cr, bubbleY + bubbleH);
    ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - cr);
    ctx.lineTo(bubbleX, bubbleY + cr);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + cr, bubbleY);
    ctx.closePath();
    ctx.fillStyle = BARK_BG;
    ctx.fill();

    // Subtle brass border to match ring
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(180,160,120,0.35)';
    ctx.stroke();

    // Text lines
    ctx.font = BARK_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = BARK_TEXT_COLOR;
    var textX = cx;
    var textY = bubbleY + BARK_PAD_Y;
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], textX, textY + j * BARK_LINE_H);
    }

    ctx.restore();
  }

  // ── State ──────────────────────────────────────────────────────────
  var _enabled = true;
  var _lookOffset = 0;   // Updated each frame from Player.lookOffset

  // ── Victory glow state (dungeon N.N.N readiness = 100%) ──────────
  // When the player clears a dungeon floor to 100%, the blue hose ring
  // transitions to a gold "victory" wash with rotating ray sweeps. Held
  // until explicitly cleared (roll-up-hose evac, floor exit, or detach).
  var _victoryActive   = false;
  var _victoryFloorId  = null;   // Floor where victory was awarded
  var _victorySpawnT   = 0;      // performance.now() when triggered — drives fade-in + ray rotation

  /**
   * Enter the victory ring state (gold + rays).
   * Suppresses the blue hose wash while active.
   * @param {string} floorId - Dungeon floor that achieved 100% (for auto-clear on exit)
   */
  function setVictoryGlow(floorId) {
    _victoryActive  = true;
    _victoryFloorId = floorId || null;
    _victorySpawnT  = performance.now();
  }

  /** Clear the victory ring state (roll-up-hose, floor exit, or detach). */
  function clearVictoryGlow() {
    _victoryActive  = false;
    _victoryFloorId = null;
    _victorySpawnT  = 0;
  }

  /** True if the victory ring is currently displaying on the given floor (or any, if no arg). */
  function isVictoryGlowActive(floorId) {
    if (!_victoryActive) return false;
    if (floorId == null) return true;
    return _victoryFloorId === floorId;
  }

  // ── Init ───────────────────────────────────────────────────────────

  function init() {
    _indicators = [];
    _barkQueue = [];
    _barkActive = null;
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

    // ── 1b. PW-2: Blue hose glow (depth-tiered) ───────────────────
    // When the player is carrying a pressure-wash hose, paint a pulsing
    // cyan-blue radial wash across the outer mask zone so the viewport
    // edges "bloom" with cool water light. Driven by HoseState.isActive().
    //
    // Intensity tiers by floor depth (see design_depth3_loop):
    //   depth 1 (exterior floorN)    → MILD   — carrying hose to the job
    //   depth 2 (dungeon lobby N.N)  → MEDIUM — entered the building
    //   depth ≥3 (dungeon N.N.N)     → FULL   — on the clean-site itself
    // HoseState.onFloorEnter handles subtree validation and detaches in
    // non-dungeon N.N buildings, so if isActive() is true at depth 2 the
    // player is legitimately in a dungeon lobby and gets the medium tier.
    // ── 1c. Victory ring auto-clear on floor mismatch ──
    // If the player left the victory floor (without going through the
    // explicit roll-up-hose evac), drop the glow so it doesn't bleed
    // into unrelated floors.
    if (_victoryActive && _victoryFloorId &&
        typeof FloorManager !== 'undefined' && FloorManager.getCurrentFloorId) {
      if (FloorManager.getCurrentFloorId() !== _victoryFloorId) {
        clearVictoryGlow();
      }
    }

    // Gold victory ring takes priority over the blue hose wash.
    if (_victoryActive) {
      _renderVictoryGlow(ctx, cx, cy, r, w, h, now);
    } else if (typeof HoseState !== 'undefined' && HoseState.isActive && HoseState.isActive()) {
      var hoseDepth = 1;
      if (typeof FloorManager !== 'undefined' && FloorManager.getCurrentFloorId) {
        hoseDepth = String(FloorManager.getCurrentFloorId()).split('.').length;
      }
      // Tier multipliers: mild / medium / full
      var tierMult, pulseMult;
      if (hoseDepth >= 3)      { tierMult = 1.00; pulseMult = 1.00; }  // full bloom + strong pulse
      else if (hoseDepth === 2){ tierMult = 0.65; pulseMult = 0.70; }  // medium hum
      else                     { tierMult = 0.38; pulseMult = 0.45; }  // mild glow

      var pulse = 0.55 + 0.45 * Math.sin(now / 420);    // 0.10 .. 1.00 raw
      pulse = 0.55 + (pulse - 0.55) * pulseMult;        // attenuate swing by tier
      var baseA = (0.22 + 0.16 * pulse) * tierMult;     // edge alpha, scaled

      var innerR = r + RING_WIDTH;
      var outerR = Math.hypot(w, h) * 0.62;
      var grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0.00, 'rgba(60,180,255,0)');
      grad.addColorStop(0.45, 'rgba(80,200,255,' + (baseA * 0.5).toFixed(3) + ')');
      grad.addColorStop(1.00, 'rgba(120,220,255,' + baseA.toFixed(3) + ')');

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);  // CCW cutout
      ctx.closePath();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

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

    // ── 5. Ring bark text (north-anchored interaction text) ──
    _tickBarkQueue(now);
    _renderBark(ctx, cx, cy, r, w, now);

    ctx.restore();
  }

  // ── Victory glow rendering ─────────────────────────────────────────
  //
  // Gold wash + rotating ray sweep, drawn into the outer mask zone
  // (between ring edge and canvas edge). Suppresses the blue hose
  // glow while active. Held until clearVictoryGlow() is called —
  // future "roll up hose" evac button will be the explicit dismiss.
  //
  // Rendering is clipped to the outer-mask zone (rect minus ring
  // cutout) so the central viewport stays readable.

  var VICTORY_FADE_IN_MS = 800;       // Gentle ramp — follows the fanfare audio beat
  var VICTORY_RAY_COUNT  = 8;         // Number of sweeping rays
  var VICTORY_RAY_SPEED  = 0.00028;   // Radians per ms (≈ one rotation per 22s)

  function _renderVictoryGlow(ctx, cx, cy, r, w, h, now) {
    var age = now - _victorySpawnT;
    var fadeIn = Math.min(1, age / VICTORY_FADE_IN_MS);

    // Shared breathing pulse for wash + rays
    var pulse = 0.65 + 0.35 * Math.sin(now / 520);   // 0.30 .. 1.00
    var innerR = r + RING_WIDTH;
    var outerR = Math.hypot(w, h) * 0.62;

    ctx.save();
    // Clip to outer-mask zone (full rect minus ring cutout)
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    ctx.globalCompositeOperation = 'lighter';

    // ── Base gold wash ──
    var baseA = (0.30 + 0.22 * pulse) * fadeIn;
    var grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0.00, 'rgba(255,210,90,0)');
    grad.addColorStop(0.45, 'rgba(255,205,80,' + (baseA * 0.55).toFixed(3) + ')');
    grad.addColorStop(1.00, 'rgba(255,225,140,' + baseA.toFixed(3) + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // ── Rotating ray sweep ──
    // Each ray is a thin isosceles wedge from near the ring outward.
    var rayBase = now * VICTORY_RAY_SPEED;
    var rayLen = Math.hypot(w, h);
    var rayAlpha = (0.14 + 0.10 * pulse) * fadeIn;
    var halfAngle = (Math.PI / VICTORY_RAY_COUNT) * 0.35;   // wedge half-width

    ctx.fillStyle = 'rgba(255,235,160,' + rayAlpha.toFixed(3) + ')';
    for (var i = 0; i < VICTORY_RAY_COUNT; i++) {
      var a = rayBase + (i * (Math.PI * 2 / VICTORY_RAY_COUNT));
      var ax = Math.cos(a), ay = Math.sin(a);
      // Tangent for the wedge edges — rotate ±halfAngle
      var a1 = a - halfAngle, a2 = a + halfAngle;
      var x0 = cx + ax * innerR;
      var y0 = cy + ay * innerR;
      var x1 = cx + Math.cos(a1) * rayLen;
      var y1 = cy + Math.sin(a1) * rayLen;
      var x2 = cx + Math.cos(a2) * rayLen;
      var y2 = cy + Math.sin(a2) * rayLen;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
    }

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
    init:                init,
    render:              render,
    addIndicator:        addIndicator,
    removeIndicator:     removeIndicator,
    clearIndicators:     clearIndicators,
    showRingBark:        showRingBark,
    setEnabled:          setEnabled,
    setVictoryGlow:      setVictoryGlow,
    clearVictoryGlow:    clearVictoryGlow,
    isVictoryGlowActive: isVictoryGlowActive,
    RING_RADIUS_FRAC:    RING_RADIUS_FRAC
  });
})();

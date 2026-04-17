/**
 * WaterCursorFX — Water-droplet cursor effect for menu hover/select.
 *
 * Reinforces the cleaning/pressure-wash theme by spraying globs of water off
 * the pointer as it hovers menu surfaces. A hover-trail emits a thin spray
 * whenever the pointer moves across a menu, and a burst emits a satisfying
 * splash when a menu item is clicked or selected.
 *
 * The module is standalone and modular — menus don't need to know how it
 * works. They only call:
 *   - WaterCursorFX.setActive(true)  when the menu opens
 *   - WaterCursorFX.setActive(false) when it closes
 *   - WaterCursorFX.spawnBurst(x, y) on click/select (optional, for juice)
 *
 * While active, the module polls InputManager.getPointer() each frame and
 * spawns trail droplets whenever the pointer moves more than TRAIL_DELTA_MIN
 * pixels since last frame. Particles are drawn as radial-gradient blobs
 * (not emoji) so they look like actual water beading up and spraying off.
 *
 * Integration:
 *   - game.js calls WaterCursorFX.tick(frameDt) + .render(ctx) in overlay
 *     branches where menus are active (PAUSE, peek overlays, etc.)
 *   - Menus call setActive(true/false) on open/close
 *   - Click handlers call spawnBurst(x, y) for a satisfying impact
 *
 * Layer 2 (after HUD — needs canvas + pointer access)
 * Depends on: InputManager (soft — falls back to explicit coordinates)
 */
var WaterCursorFX = (function () {
  'use strict';

  // ── Pool cap ─────────────────────────────────────────────────
  var MAX_DROPLETS = 180;

  // ── Trail tuning ─────────────────────────────────────────────
  var TRAIL_DELTA_MIN = 3;   // px — pointer must move this far between frames to spawn trail
  var TRAIL_RATE = 0.55;     // droplets spawned per px of pointer movement (clamped)
  var TRAIL_RATE_MAX = 4;    // hard cap droplets per frame from trail
  var TRAIL_SPEED_MIN = 0.6;
  var TRAIL_SPEED_MAX = 2.4;
  var TRAIL_LIFE_MIN = 22;   // frames
  var TRAIL_LIFE_MAX = 36;
  var TRAIL_RADIUS_MIN = 2.5;
  var TRAIL_RADIUS_MAX = 5.0;

  // ── Burst tuning (click/select splash) ───────────────────────
  var BURST_COUNT_DEFAULT = 14;
  var BURST_SPEED_MIN = 2.2;
  var BURST_SPEED_MAX = 5.5;
  var BURST_LIFE_MIN = 28;
  var BURST_LIFE_MAX = 46;
  var BURST_RADIUS_MIN = 3.5;
  var BURST_RADIUS_MAX = 7.5;

  // ── Physics ──────────────────────────────────────────────────
  var GRAVITY = 0.18;        // px/frame² downward — looks wet, not floaty
  var FRICTION = 0.03;       // slight air drag
  var WOBBLE_AMP = 0.12;     // subtle sideways sway during fall

  // ── Color (cyan water with highlight) ────────────────────────
  // Slightly cool cyan for water-drop body, bright white highlight for spec.
  var COLOR_CORE = [220, 240, 255];   // near-white with cyan tint
  var COLOR_EDGE = [70,  150, 210];   // mid cyan
  var COLOR_RIM  = [30,  70,  120];   // dark cyan outer ring
  var PEAK_ALPHA = 0.82;

  // ── State ────────────────────────────────────────────────────
  var _droplets = [];
  var _active = false;
  var _lastPointerX = -9999;
  var _lastPointerY = -9999;

  // ── Droplet sprite cache (perf) ──────────────────────────────
  // createRadialGradient per-droplet-per-frame is a Canvas2D tall pole:
  // object allocation + 3 addColorStop calls + string concat every render.
  // A 22-droplet pickup burst with ~40-frame lives was tanking FPS; when
  // the dungeon trail gate kicked in with up to 180 droplets, it pegged.
  // Fix: bake the gradient body into an offscreen canvas at init and
  // draw it with ctx.drawImage + globalAlpha per droplet (~20x cheaper).
  // Specular pip stays as a live arc fill — it's cheap and needs the
  // crisp highlight contrast that a scaled sprite would blur out.
  var _sprite = null;          // { canvas, size, rBase } — built lazily
  var SPRITE_R_BASE = 10;      // render sprite at this world-pixel radius
  var SPRITE_PAD    = 2;       // ensure the alpha=0 edge has a margin

  function _buildSprite() {
    var r    = SPRITE_R_BASE;
    var pad  = SPRITE_PAD;
    var size = r * 2 + pad * 2;
    var c    = document.createElement('canvas');
    c.width  = size;
    c.height = size;
    var cx   = c.getContext('2d');
    var cxC  = size * 0.5;
    var cyC  = size * 0.5;

    var g = cx.createRadialGradient(
      cxC - r * 0.3, cyC - r * 0.3, 0,
      cxC, cyC, r
    );
    // alpha=1 in the sprite itself; per-droplet fade is applied at draw
    // time via ctx.globalAlpha on the viewport canvas.
    g.addColorStop(0,
      'rgba(' + COLOR_CORE[0] + ',' + COLOR_CORE[1] + ',' + COLOR_CORE[2] + ',1)');
    g.addColorStop(0.55,
      'rgba(' + COLOR_EDGE[0] + ',' + COLOR_EDGE[1] + ',' + COLOR_EDGE[2] + ',0.85)');
    g.addColorStop(1,
      'rgba(' + COLOR_RIM[0]  + ',' + COLOR_RIM[1]  + ',' + COLOR_RIM[2]  + ',0)');

    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(cxC, cyC, r, 0, Math.PI * 2);
    cx.fill();
    return { canvas: c, size: size, rBase: r };
  }

  function _getSprite() {
    if (!_sprite) _sprite = _buildSprite();
    return _sprite;
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  function _getPointer() {
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      return InputManager.getPointer();
    }
    return null;
  }

  function _spawnDroplet(x, y, vx, vy, radius, life) {
    if (_droplets.length >= MAX_DROPLETS) return;
    _droplets.push({
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      r: radius,
      r0: radius,
      life: life,
      maxLife: life,
      phase: Math.random() * Math.PI * 2    // wobble phase offset
    });
  }

  // ── Public spawn API ─────────────────────────────────────────

  /**
   * Spawn a radial burst of droplets at (x, y) — use on click/select.
   *
   * @param {number} x — canvas X
   * @param {number} y — canvas Y
   * @param {Object} [opts]
   *   count:     number of droplets (default 14)
   *   speedMult: scale burst velocity (default 1.0)
   *   upward:    bias droplets upward (default false)
   */
  function spawnBurst(x, y, opts) {
    opts = opts || {};
    var count = opts.count || BURST_COUNT_DEFAULT;
    var speedMult = opts.speedMult || 1.0;
    var upward = !!opts.upward;

    for (var i = 0; i < count; i++) {
      // Even angular distribution with jitter for natural look
      var angle = (Math.PI * 2 / count) * i + _rand(-0.35, 0.35);
      if (upward) {
        // Bias to upper hemisphere — looks like water popping off a click
        angle = -Math.PI / 2 + _rand(-Math.PI / 2, Math.PI / 2);
      }
      var speed = _rand(BURST_SPEED_MIN, BURST_SPEED_MAX) * speedMult;
      var vx = Math.cos(angle) * speed;
      var vy = Math.sin(angle) * speed;
      // Small initial upward kick to help droplets arc before gravity pulls
      if (!upward) vy -= _rand(0.4, 1.2);

      var radius = _rand(BURST_RADIUS_MIN, BURST_RADIUS_MAX);
      var life = _rand(BURST_LIFE_MIN, BURST_LIFE_MAX) | 0;
      _spawnDroplet(x, y, vx, vy, radius, life);
    }
  }

  /**
   * Spawn a sparse hover trail at (x, y) with a given movement magnitude.
   * Usually called automatically from tick() when active, but exposed for
   * cases where a menu wants to force trail spawning (e.g., synthetic hover).
   *
   * @param {number} x
   * @param {number} y
   * @param {number} movePx — how many pixels the pointer just moved
   */
  function spawnTrail(x, y, movePx) {
    if (movePx < TRAIL_DELTA_MIN) return;

    // Droplet count scales with movement speed, capped
    var count = Math.min(TRAIL_RATE_MAX, Math.ceil(movePx * TRAIL_RATE));
    for (var i = 0; i < count; i++) {
      // Slight spread around pointer — droplets "fling" sideways from stroke
      var angle = _rand(0, Math.PI * 2);
      var speed = _rand(TRAIL_SPEED_MIN, TRAIL_SPEED_MAX);
      var vx = Math.cos(angle) * speed;
      var vy = Math.sin(angle) * speed - _rand(0.2, 0.8);  // upward bias
      var radius = _rand(TRAIL_RADIUS_MIN, TRAIL_RADIUS_MAX);
      var life = _rand(TRAIL_LIFE_MIN, TRAIL_LIFE_MAX) | 0;

      // Offset spawn point slightly around pointer for a wet halo
      var offX = _rand(-2, 2);
      var offY = _rand(-2, 2);
      _spawnDroplet(x + offX, y + offY, vx, vy, radius, life);
    }
  }

  // ── Tick ─────────────────────────────────────────────────────

  /**
   * Update physics and (when active) sample pointer for trail spawning.
   * Call once per render frame from game.js BEFORE render().
   *
   * @param {number} frameDt — unused (frame-count physics), accepted for API parity
   */
  function tick(frameDt) {
    // Sample pointer and spawn trail if active
    if (_active) {
      var p = _getPointer();
      if (p && p.active) {
        var dx = p.x - _lastPointerX;
        var dy = p.y - _lastPointerY;
        // First frame after activation: snap tracker, don't spawn
        if (_lastPointerX < -9000) {
          _lastPointerX = p.x;
          _lastPointerY = p.y;
        } else {
          var moved = Math.sqrt(dx * dx + dy * dy);
          if (moved >= TRAIL_DELTA_MIN) {
            spawnTrail(p.x, p.y, moved);
            _lastPointerX = p.x;
            _lastPointerY = p.y;
          }
        }
      } else {
        // Pointer inactive — reset tracker so next activation doesn't
        // spawn a ghost burst across the screen
        _lastPointerX = -9999;
      }
    }

    // Physics update (always runs so trailing droplets finish their arc
    // even after setActive(false))
    for (var i = _droplets.length - 1; i >= 0; i--) {
      var d = _droplets[i];

      // Wobble — tiny sideways sway as droplet falls
      d.phase += 0.25;
      var wobble = Math.sin(d.phase) * WOBBLE_AMP;

      d.x += d.vx + wobble;
      d.y += d.vy;
      d.vy += GRAVITY;
      d.vx *= (1 - FRICTION);

      d.life--;
      if (d.life <= 0) {
        _droplets.splice(i, 1);
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────

  /**
   * Draw all live droplets. Call AFTER tick() in the render pipeline.
   * Expected to be called as a top-level overlay above menu content.
   */
  function render(ctx) {
    if (_droplets.length === 0) return;

    var sprite = _getSprite();
    var spriteCanvas = sprite.canvas;
    var spriteSize   = sprite.size;
    var spriteRBase  = sprite.rBase;
    // Sprite was built with a 1-radius-unit of transparent padding on each
    // side; compensate so the visible body scales to r, not size/2.
    var spriteScale = spriteSize / (spriteRBase * 2);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    var prevAlpha = ctx.globalAlpha;

    for (var i = 0; i < _droplets.length; i++) {
      var d = _droplets[i];

      // Life-based alpha (ease-out: stay solid most of life, fade at end)
      var lifeFrac = d.life / d.maxLife;
      var alpha;
      if (lifeFrac > 0.5) {
        alpha = PEAK_ALPHA;
      } else {
        alpha = PEAK_ALPHA * (lifeFrac * 2);  // 0.5→full, 0→0
      }

      // Slight radius pulse then shrink at end of life for a "drip-off" look
      var r = d.r;
      if (lifeFrac < 0.3) r = d.r * (0.4 + lifeFrac * 2);  // shrink toward 0.4*r0

      // Cached sprite draw — replaces the per-frame createRadialGradient.
      var drawSize = r * 2 * spriteScale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(spriteCanvas,
        d.x - drawSize * 0.5, d.y - drawSize * 0.5,
        drawSize, drawSize);

      // Bright specular pip for sheen (only larger droplets)
      // Kept as a live arc — it's a single small fill and the crisp
      // highlight sells the "wet" look. Alpha is handled by globalAlpha.
      if (r > 3.5 && alpha > 0.4) {
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(d.x - r * 0.35, d.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = prevAlpha;
    ctx.restore();
  }

  // ── Control ──────────────────────────────────────────────────

  /**
   * Enable or disable hover-trail emission. Physics continues either way
   * so in-flight droplets finish their arcs.
   *
   * Typical usage:
   *   MenuBox.open  → WaterCursorFX.setActive(true)
   *   MenuBox.close → WaterCursorFX.setActive(false)
   */
  function setActive(on) {
    _active = !!on;
    if (!_active) _lastPointerX = -9999;  // reset tracker so next open is clean
  }

  function isActive() { return _active; }

  /**
   * Immediately remove all droplets (e.g., on menu force-close or reset).
   */
  function clear() {
    _droplets.length = 0;
    _lastPointerX = -9999;
  }

  function getDropletCount() { return _droplets.length; }

  // ── Public API ───────────────────────────────────────────────

  return Object.freeze({
    // Spawn
    spawnBurst:      spawnBurst,
    spawnTrail:      spawnTrail,

    // Control
    setActive:       setActive,
    isActive:        isActive,
    clear:           clear,

    // Loop
    tick:            tick,
    render:          render,

    // Debug
    getDropletCount: getDropletCount
  });
})();

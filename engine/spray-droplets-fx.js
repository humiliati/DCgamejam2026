/**
 * SprayDropletsFX — In-world water droplet burst at the beam hit point.
 *
 * Rung 1 of the PWS polish ladder (see docs/PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md).
 *
 * WaterCursorFX handles menu-hover trails and click bursts; that module is
 * pointer-polling and scoped to overlay UIs. SprayDropletsFX is the in-world
 * counterpart: spray-system.js explicitly spawns droplets at the beam hit
 * point every spray tick while the hose trigger is held. The result reads as
 * water deflecting off a hard surface — the single biggest "juice" lever PWS
 * uses to sell the stroke.
 *
 * Contract:
 *   - Spawn is push-based (spray-system drives it). This module never polls
 *     the pointer or the beam state, which keeps the FX decoupled from the
 *     cleaning pipeline and lets the caller decide when droplets fly.
 *   - Physics runs every frame regardless of whether new droplets are being
 *     spawned, so in-flight droplets finish their arcs even after the player
 *     releases the trigger.
 *   - Pool-capped at MAX_DROPLETS. Over-spawn is dropped silently rather
 *     than causing array growth — the render loop doesn't spike under
 *     rapid pointer sweeps.
 *
 * Visual model:
 *   - Emit from the impact point with a high-energy spread biased away from
 *     the player (upward + sideways hemisphere). Simulates water rebounding
 *     off the wall toward the camera rather than puddling beneath it.
 *   - Droplets are larger, faster, and slightly whiter than WaterCursorFX
 *     droplets so they read as pressurized spray, not menu hover dust.
 *   - Same radial-gradient rendering as WaterCursorFX for visual cohesion.
 *
 * Layer 2 (after HUD — needs canvas + render-loop access).
 * Depends on: nothing. Soft-coupled: spray-system.js calls spawn().
 */
var SprayDropletsFX = (function () {
  'use strict';

  // ── Pool cap ─────────────────────────────────────────────────
  // Higher than WaterCursorFX (180) is unnecessary; lower to keep the
  // render loop cheap. Spray typically emits 3-6 droplets per tick at
  // 100ms cadence — 60 is plenty of headroom for fast sweeps.
  var MAX_DROPLETS = 60;

  // ── Spawn tuning ─────────────────────────────────────────────
  var BURST_COUNT_MIN = 3;    // even on a dead-still aim, a few droplets fly
  var BURST_COUNT_MAX = 7;    // fast sweeps produce more deflection
  var BURST_SPEED_MIN = 2.8;
  var BURST_SPEED_MAX = 6.2;
  var BURST_LIFE_MIN = 24;    // frames
  var BURST_LIFE_MAX = 40;
  var BURST_RADIUS_MIN = 3.0;
  var BURST_RADIUS_MAX = 6.0;
  var SPAWN_JITTER = 6;       // px — random offset around impact point

  // ── Physics ──────────────────────────────────────────────────
  var GRAVITY = 0.22;         // slightly wetter/heavier than menu droplets
  var FRICTION = 0.025;
  var WOBBLE_AMP = 0.14;

  // ── Color ────────────────────────────────────────────────────
  // Whiter than WaterCursorFX to read as high-pressure spray mist.
  // WaterCursorFX is a cyan blob; this is closer to foam/atomized water.
  var COLOR_CORE = [250, 253, 255];   // near-white
  var COLOR_EDGE = [140, 200, 240];   // pale blue
  var COLOR_RIM  = [60,  110, 170];   // darker cyan rim
  var PEAK_ALPHA = 0.78;

  // ── State ────────────────────────────────────────────────────
  var _droplets = [];

  // ── Helpers ──────────────────────────────────────────────────

  function _rand(lo, hi) { return lo + Math.random() * (hi - lo); }

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
      phase: Math.random() * Math.PI * 2
    });
  }

  // ── Public spawn API ─────────────────────────────────────────

  /**
   * Emit a spray burst at the beam impact point.
   *
   * @param {number} x — canvas X of the impact point (screen pixels)
   * @param {number} y — canvas Y of the impact point
   * @param {Object} [opts]
   *   strokeVx:  stroke velocity X in px/tick (drives spread direction)
   *   strokeVy:  stroke velocity Y in px/tick
   *   speedMag:  scalar for overall droplet speed (default 1.0)
   *   count:     override droplet count (default: scales with speedMag)
   *   surface:   'wall' | 'floor' | null — biases droplet arc (wall=upward
   *              hemisphere, floor=radial, null=upward default)
   */
  function spawn(x, y, opts) {
    opts = opts || {};
    var surface = opts.surface || 'wall';
    var speedMag = typeof opts.speedMag === 'number' ? opts.speedMag : 1.0;

    // Stroke velocity magnitude scales droplet count — fast sweeps
    // fling more water than a static aim.
    var svx = opts.strokeVx || 0;
    var svy = opts.strokeVy || 0;
    var strokeMag = Math.sqrt(svx * svx + svy * svy);
    var velBoost = Math.min(1.0, strokeMag / 40);  // 0..1 over 40px/tick

    var count = opts.count != null
      ? opts.count
      : Math.round(BURST_COUNT_MIN + (BURST_COUNT_MAX - BURST_COUNT_MIN) * (0.4 + velBoost * 0.6));

    for (var i = 0; i < count; i++) {
      // Hemisphere bias:
      //   wall  → upward/outward (deflection off vertical surface)
      //   floor → radial (splash in all directions)
      var angle;
      if (surface === 'floor') {
        angle = _rand(0, Math.PI * 2);
      } else {
        // Upper hemisphere (-π to 0 covers top half in screen space,
        // where +Y is down). Jitter across the full upper arc with a
        // slight bias in the stroke direction so sweeping left flings
        // water left.
        var strokeAngle = (strokeMag > 1) ? Math.atan2(-svy, svx) : -Math.PI / 2;
        angle = strokeAngle + _rand(-Math.PI * 0.55, Math.PI * 0.55);
      }

      var speed = _rand(BURST_SPEED_MIN, BURST_SPEED_MAX) * speedMag * (0.8 + velBoost * 0.5);
      var vx = Math.cos(angle) * speed;
      var vy = Math.sin(angle) * speed;

      // Small upward kick so droplets arc before gravity takes over
      if (surface !== 'floor') vy -= _rand(0.6, 1.6);

      var radius = _rand(BURST_RADIUS_MIN, BURST_RADIUS_MAX);
      var life = _rand(BURST_LIFE_MIN, BURST_LIFE_MAX) | 0;

      var offX = _rand(-SPAWN_JITTER, SPAWN_JITTER);
      var offY = _rand(-SPAWN_JITTER, SPAWN_JITTER);
      _spawnDroplet(x + offX, y + offY, vx, vy, radius, life);
    }
  }

  // ── Tick (physics only — no pointer polling) ─────────────────

  /**
   * Advance droplet physics one frame. Call once per render frame from
   * game.js BEFORE render(). Spawning is caller-driven via spawn().
   *
   * @param {number} frameDt — unused (frame-count physics); accepted for API parity
   */
  function tick(frameDt) {
    for (var i = _droplets.length - 1; i >= 0; i--) {
      var d = _droplets[i];

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
   * Renders on top of the 3D viewport so droplets occlude wall surfaces
   * (which is what you want — the spray is in front of the wall).
   */
  function render(ctx) {
    if (_droplets.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (var i = 0; i < _droplets.length; i++) {
      var d = _droplets[i];

      var lifeFrac = d.life / d.maxLife;
      var alpha;
      if (lifeFrac > 0.5) {
        alpha = PEAK_ALPHA;
      } else {
        alpha = PEAK_ALPHA * (lifeFrac * 2);
      }

      var r = d.r;
      if (lifeFrac < 0.3) r = d.r * (0.4 + lifeFrac * 2);

      var grad = ctx.createRadialGradient(
        d.x - r * 0.3, d.y - r * 0.3, 0,
        d.x, d.y, r
      );
      grad.addColorStop(0,
        'rgba(' + COLOR_CORE[0] + ',' + COLOR_CORE[1] + ',' + COLOR_CORE[2] + ',' + alpha.toFixed(3) + ')');
      grad.addColorStop(0.55,
        'rgba(' + COLOR_EDGE[0] + ',' + COLOR_EDGE[1] + ',' + COLOR_EDGE[2] + ',' + (alpha * 0.85).toFixed(3) + ')');
      grad.addColorStop(1,
        'rgba(' + COLOR_RIM[0]  + ',' + COLOR_RIM[1]  + ',' + COLOR_RIM[2]  + ',0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Specular pip — sells the "wet" look on larger droplets
      if (r > 3.5 && alpha > 0.4) {
        ctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.75).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(d.x - r * 0.35, d.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ── Control ──────────────────────────────────────────────────

  function clear() {
    _droplets.length = 0;
  }

  function getDropletCount() { return _droplets.length; }

  // ── Public API ───────────────────────────────────────────────

  return Object.freeze({
    // Spawn
    spawn:           spawn,

    // Control
    clear:           clear,

    // Loop
    tick:            tick,
    render:          render,

    // Debug
    getDropletCount: getDropletCount
  });
})();

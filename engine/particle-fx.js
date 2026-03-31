/**
 * ParticleFX — Screen-space particle emitter with presets.
 *
 * Adapted from EyesOnly ParticleEmitter (genre-helper) +
 * ConstellationRewards coin-rain orchestration.
 *
 * Renders emoji particles on the main canvas overlay layer.
 * All coordinates are screen-space (no camera transform).
 *
 * Presets:
 *   coinBurst(x, y, count)     — gold coin fountain (buy/sell/loot)
 *   coinRain(x, y, w, amount)  — sustained coin waterfall + counter tick
 *   sparkle(x, y)              — generic sparkle burst (equip/unequip)
 *   itemPoof(x, y)             — smoke poof (discard/consume)
 *   levelUp(x, y)              — star shower (rep tier unlock)
 *   healPulse(x, y)            — green heal particles (bonfire/potion)
 *   dmgFlash(x, y)             — red damage sparks
 *
 * Layer 2 (after HUD — needs canvas access for overlay rendering)
 * Depends on: nothing (standalone, optional AudioSystem integration)
 *
 * @module ParticleFX
 */
var ParticleFX = (function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  var MAX_PARTICLES = 400;
  // 💰 (U+1F4B0) is safe on all platforms. 🪙 (U+1FA99) renders as tofu on older Windows.
  var COIN_EMOJI = '\uD83D\uDCB0';  // 💰

  // ── Particle pool ────────────────────────────────────────────────
  var _particles = [];

  // ── Counter animations (coin-rain tick-up) ───────────────────────
  var _counters = [];   // { x, y, current, target, startTime, duration, emoji }

  // ── Internal helpers ─────────────────────────────────────────────

  function _merge(defaults, overrides) {
    if (!overrides) return defaults;
    var result = {};
    for (var key in defaults) {
      result[key] = (overrides[key] != null) ? overrides[key] : defaults[key];
    }
    return result;
  }

  function _randRange(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  // ── Core emitter ─────────────────────────────────────────────────

  var DEFAULT_BURST = {
    emoji: '\u2728',    // ✨
    count: 6,
    speed: 3,
    life: 30,           // frames
    gravity: 0.12,
    spread: Math.PI * 2,
    angle: -Math.PI / 2,  // upward default
    size: 14,
    fadeOut: true,
    friction: 0,
    scaleDecay: false,    // shrink over lifetime
    spin: 0,              // rotation speed (rad/frame)
    spriteSheet: null,    // SpriteSheet name (e.g. 'coin') — null = emoji
    frameInterval: 5      // frames between sprite animation advances
  };

  /**
   * Emit a burst of particles at screen position (x, y).
   */
  function burst(x, y, opts) {
    opts = _merge(DEFAULT_BURST, opts);
    var halfSpread = opts.spread / 2;

    for (var i = 0; i < opts.count; i++) {
      if (_particles.length >= MAX_PARTICLES) break;

      var angle;
      if (opts.spread >= Math.PI * 2 - 0.01) {
        // Full circle — evenly distribute
        angle = (Math.PI * 2 / opts.count) * i;
      } else {
        // Cone — random within spread centered on opts.angle
        angle = opts.angle + _randRange(-halfSpread, halfSpread);
      }

      var speed = opts.speed * _randRange(0.5, 1.0);

      _particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.floor(opts.life * _randRange(0.8, 1.3)),
        maxLife: opts.life,
        emoji: opts.emoji,
        size: opts.size,
        gravity: opts.gravity,
        fadeOut: opts.fadeOut,
        friction: opts.friction,
        scaleDecay: opts.scaleDecay,
        spin: opts.spin,
        rotation: opts.spin ? _randRange(0, Math.PI * 2) : 0,
        spriteSheet: opts.spriteSheet,
        frameInterval: opts.frameInterval || 5,
        frameTick: 0
      });
    }
  }

  /**
   * Emit a single particle (for streams — call each frame).
   */
  function emit(x, y, opts) {
    if (_particles.length >= MAX_PARTICLES) return;
    opts = _merge(DEFAULT_BURST, opts);

    var angle = opts.angle + _randRange(-opts.spread / 2, opts.spread / 2);
    var speed = opts.speed * _randRange(0.5, 1.0);

    _particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: Math.floor(opts.life * _randRange(0.8, 1.3)),
      maxLife: opts.life,
      emoji: opts.emoji,
      size: opts.size,
      gravity: opts.gravity,
      fadeOut: opts.fadeOut,
      friction: opts.friction,
      scaleDecay: opts.scaleDecay,
      spin: opts.spin,
      rotation: opts.spin ? _randRange(0, Math.PI * 2) : 0,
      spriteSheet: opts.spriteSheet,
      frameInterval: opts.frameInterval || 5,
      frameTick: 0
    });
  }

  // ── Update (call once per render frame) ──────────────────────────

  function update() {
    for (var i = _particles.length - 1; i >= 0; i--) {
      var p = _particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;

      if (p.friction > 0) {
        p.vx *= (1 - p.friction);
        p.vy *= (1 - p.friction);
      }

      if (p.spin) {
        p.rotation += p.spin;
      }

      // Advance sprite animation frame tick
      if (p.spriteSheet) {
        p.frameTick++;
      }

      p.life--;
      if (p.life <= 0) {
        _particles.splice(i, 1);
      }
    }

    // Update counter tick-up animations
    var now = Date.now();
    for (var c = _counters.length - 1; c >= 0; c--) {
      var ct = _counters[c];
      var elapsed = now - ct.startTime;
      if (elapsed >= ct.duration) {
        ct.current = ct.target;
        _counters.splice(c, 1);
      } else {
        var t = elapsed / ct.duration;
        // Ease-out quadratic
        var eased = t * (2 - t);
        ct.current = Math.floor(ct.from + (ct.target - ct.from) * eased);

        // Tick sound at regular intervals
        if (ct.nextTickTime && now >= ct.nextTickTime) {
          if (typeof AudioSystem !== 'undefined') {
            AudioSystem.play('ui-blop', { volume: 0.15 });
          }
          ct.nextTickTime = now + ct.tickInterval;
        }
      }
    }
  }

  // ── Render (call after world render, before UI) ──────────────────

  function render(ctx) {
    if (_particles.length === 0 && _counters.length === 0) return;

    ctx.save();

    // Draw particles
    var _hasSpriteSheet = (typeof SpriteSheet !== 'undefined');

    for (var i = 0; i < _particles.length; i++) {
      var p = _particles[i];
      var alpha = p.fadeOut ? Math.min(1, p.life / (p.maxLife * 0.35)) : 1;
      var scale = p.scaleDecay ? (p.life / p.maxLife) : 1;
      var drawSize = Math.max(4, Math.floor(p.size * scale));

      ctx.globalAlpha = alpha;

      // Try sprite-based rendering first
      var spriteFrame = null;
      if (p.spriteSheet && _hasSpriteSheet && SpriteSheet.isLoaded(p.spriteSheet)) {
        var frameIdx = Math.floor(p.frameTick / p.frameInterval);
        spriteFrame = SpriteSheet.getFrame(p.spriteSheet, frameIdx);
      }

      if (spriteFrame) {
        // Sprite rendering — draw image centered at particle position
        var halfW = drawSize / 2;
        var halfH = drawSize / 2;
        // Maintain aspect ratio from source image
        var aspect = spriteFrame.naturalWidth / (spriteFrame.naturalHeight || 1);
        if (aspect > 1) { halfH = halfW / aspect; }
        else if (aspect < 1) { halfW = halfH * aspect; }

        if (p.rotation) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.drawImage(spriteFrame, -halfW, -halfH, halfW * 2, halfH * 2);
          ctx.restore();
        } else {
          ctx.drawImage(spriteFrame, p.x - halfW, p.y - halfH, halfW * 2, halfH * 2);
        }
      } else {
        // Emoji fallback
        ctx.font = drawSize + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (p.rotation) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillText(p.emoji, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(p.emoji, p.x, p.y);
        }
      }
    }

    // Draw counter tick-up overlays
    for (var c = 0; c < _counters.length; c++) {
      var ct = _counters[c];
      var age = Date.now() - ct.startTime;
      var floatY = ct.y - Math.min(30, age * 0.025);  // float upward
      var cAlpha = Math.min(1, Math.max(0, 1 - (age / ct.duration) * 0.6));

      ctx.globalAlpha = cAlpha;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Gold glow
      ctx.fillStyle = '#f0d070';
      ctx.shadowColor = 'rgba(240,208,112,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText((ct.emoji || COIN_EMOJI) + ' +' + ct.current, ct.x, floatY);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // ── Presets ──────────────────────────────────────────────────────

  /**
   * Gold coin fountain — burst of coins flying upward then falling.
   * Use for: buying, selling, looting gold.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   * @param {number} [count] — number of coins (default 8)
   */
  function coinBurst(x, y, count) {
    count = count || 8;
    // Use coin sprite sheet if loaded, otherwise emoji fallback
    var useCoinSprite = (typeof SpriteSheet !== 'undefined' && SpriteSheet.isLoaded('coin'));
    burst(x, y, {
      emoji: COIN_EMOJI,
      count: Math.min(count, 20),
      speed: 4.5,
      life: 40,
      gravity: 0.18,
      spread: Math.PI * 0.8,   // upward cone
      angle: -Math.PI / 2,     // straight up
      size: useCoinSprite ? 24 : 18,  // sprites need slightly more room
      fadeOut: true,
      friction: 0.01,
      spin: useCoinSprite ? 0 : 0.15,  // sprite animation replaces spin
      spriteSheet: useCoinSprite ? 'coin' : null,
      frameInterval: 4  // ~12fps at 60fps render rate
    });

    // Add a couple of sparkles
    burst(x, y, {
      emoji: '\u2728',   // ✨
      count: 3,
      speed: 2,
      life: 20,
      gravity: 0.05,
      size: 12,
      fadeOut: true
    });

    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('coin-pickup', { volume: 0.5 });
    }
  }

  /**
   * Sustained coin waterfall from a region + floating counter.
   * Use for: large payouts, quest rewards, salvage sell.
   * @param {number} x — center X
   * @param {number} y — top Y of rain region
   * @param {number} amount — gold amount for counter
   * @param {Object} [opts] — { width, duration, emoji }
   */
  function coinRain(x, y, amount, opts) {
    opts = opts || {};
    var width = opts.width || 120;
    var duration = opts.duration || 1200;
    var coinEmoji = opts.emoji || COIN_EMOJI;
    var useCoinSprite = (typeof SpriteSheet !== 'undefined' && SpriteSheet.isLoaded('coin'));

    // Determine burst count from amount (logarithmic scaling)
    var burstCount = Math.min(4, Math.max(1, Math.floor(Math.log2(amount + 1))));
    var coinsPerBurst = Math.min(8, Math.max(3, Math.floor(amount / 10)));

    // Stagger bursts over the first 60% of duration
    for (var b = 0; b < burstCount; b++) {
      (function (burstIdx, _useSpr) {
        setTimeout(function () {
          var bx = x + _randRange(-width / 2, width / 2);
          burst(bx, y, {
            emoji: coinEmoji,
            count: coinsPerBurst,
            speed: 3.5,
            life: 45,
            gravity: 0.15,
            spread: Math.PI * 0.6,
            angle: -Math.PI / 2,
            size: _useSpr ? 22 : 16,
            fadeOut: true,
            friction: 0.008,
            spin: _useSpr ? 0 : 0.12,
            spriteSheet: _useSpr ? 'coin' : null,
            frameInterval: 4
          });

          // Sparkle trail
          burst(bx, y - 10, {
            emoji: '\u2728',
            count: 2,
            speed: 1.5,
            life: 15,
            gravity: 0.04,
            size: 10,
            fadeOut: true
          });
        }, burstIdx * (duration * 0.6 / burstCount));
      })(b, useCoinSprite);
    }

    // Counter tick-up animation
    var tickCount = Math.min(12, amount);
    _counters.push({
      x: x,
      y: y - 20,
      from: 0,
      current: 0,
      target: amount,
      startTime: Date.now() + 200,  // slight delay for coins to appear first
      duration: duration * 0.7,
      emoji: coinEmoji,
      tickInterval: Math.max(60, Math.floor(duration * 0.7 / tickCount)),
      nextTickTime: Date.now() + 260
    });

    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('coin-pickup', { volume: 0.6 });
      // Second sound for larger amounts
      if (amount >= 20) {
        setTimeout(function () {
          AudioSystem.play('coin-pickup', { volume: 0.4 });
        }, 400);
      }
    }
  }

  /**
   * Generic sparkle burst — equip, unequip, item transfer.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   * @param {string} [color] — emoji override (default ✨)
   */
  function sparkle(x, y, color) {
    burst(x, y, {
      emoji: color || '\u2728',   // ✨
      count: 5,
      speed: 2.5,
      life: 22,
      gravity: 0.06,
      size: 14,
      fadeOut: true,
      scaleDecay: true
    });
  }

  /**
   * Smoke poof — discard, consume, incinerator.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   */
  function itemPoof(x, y) {
    burst(x, y, {
      emoji: '\uD83D\uDCA8',  // 💨
      count: 4,
      speed: 1.8,
      life: 18,
      gravity: -0.04,    // floats up
      size: 18,
      fadeOut: true,
      friction: 0.03,
      scaleDecay: true
    });
    // Tiny debris
    burst(x, y, {
      emoji: '\u2022',   // •
      count: 3,
      speed: 2,
      life: 12,
      gravity: 0.15,
      size: 8,
      fadeOut: true
    });
  }

  /**
   * Star shower — rep tier unlock, level up.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   */
  function levelUp(x, y) {
    burst(x, y, {
      emoji: '\u2B50',   // ⭐
      count: 10,
      speed: 3.5,
      life: 35,
      gravity: 0.08,
      spread: Math.PI * 2,
      size: 16,
      fadeOut: true,
      spin: 0.05
    });
    burst(x, y, {
      emoji: '\u2728',   // ✨
      count: 6,
      speed: 2,
      life: 25,
      gravity: 0.04,
      size: 12,
      fadeOut: true
    });
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui-confirm', { volume: 0.6 });
    }
  }

  /**
   * Green heal particles — bonfire rest, potion use.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   */
  function healPulse(x, y) {
    burst(x, y, {
      emoji: '\uD83D\uDC9A',  // 💚
      count: 5,
      speed: 2,
      life: 28,
      gravity: -0.06,    // float up
      spread: Math.PI * 0.6,
      angle: -Math.PI / 2,
      size: 14,
      fadeOut: true,
      scaleDecay: true,
      friction: 0.02
    });
    burst(x, y, {
      emoji: '\u2728',
      count: 3,
      speed: 1.5,
      life: 20,
      gravity: -0.03,
      size: 10,
      fadeOut: true
    });
  }

  /**
   * Red damage sparks — hit feedback.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   */
  function dmgFlash(x, y) {
    burst(x, y, {
      emoji: '\uD83D\uDCA5',  // 💥
      count: 1,
      speed: 0,
      life: 10,
      gravity: 0,
      size: 24,
      fadeOut: true
    });
    burst(x, y, {
      emoji: '\u2022',    // •
      count: 6,
      speed: 3.5,
      life: 14,
      gravity: 0.2,
      spread: Math.PI * 1.2,
      angle: -Math.PI / 2,
      size: 8,
      fadeOut: true
    });
  }

  /**
   * Key sparkle — key consumed in lock, with directional upward scatter.
   * @param {number} x — screen X
   * @param {number} y — screen Y
   * @param {string} [keyEmoji] — key item emoji (default 🔑)
   */
  function keyConsume(x, y, keyEmoji) {
    // Key fragments scatter
    burst(x, y, {
      emoji: keyEmoji || '\uD83D\uDD11',  // 🔑
      count: 1,
      speed: 0,
      life: 20,
      gravity: 0,
      size: 22,
      fadeOut: true,
      scaleDecay: true,
      spin: 0.2
    });
    // Sparkle burst around the lock
    burst(x, y, {
      emoji: '\u2728',
      count: 8,
      speed: 3,
      life: 25,
      gravity: 0.08,
      size: 14,
      fadeOut: true
    });
    // Golden dust
    burst(x, y, {
      emoji: '\u2022',
      count: 5,
      speed: 2,
      life: 18,
      gravity: 0.12,
      size: 6,
      fadeOut: true
    });
  }

  /**
   * Item equip flash — brief sparkle at equip slot.
   */
  function equipFlash(x, y) {
    burst(x, y, {
      emoji: '\u2728',
      count: 4,
      speed: 2,
      life: 16,
      gravity: 0.05,
      size: 12,
      fadeOut: true,
      scaleDecay: true
    });
  }

  /**
   * Salvage sparkle — part extracted from corpse.
   */
  function salvageSpark(x, y) {
    burst(x, y, {
      emoji: '\u2699\uFE0F',  // ⚙️
      count: 3,
      speed: 2.5,
      life: 20,
      gravity: 0.1,
      size: 14,
      fadeOut: true,
      spin: 0.1
    });
    burst(x, y, {
      emoji: '\u2728',
      count: 2,
      speed: 1.5,
      life: 15,
      gravity: 0.05,
      size: 10,
      fadeOut: true
    });
  }

  // ── Housekeeping ─────────────────────────────────────────────────

  function clear() {
    _particles.length = 0;
    _counters.length = 0;
  }

  function count() {
    return _particles.length;
  }

  function isActive() {
    return _particles.length > 0 || _counters.length > 0;
  }

  // ── Public API ───────────────────────────────────────────────────

  return Object.freeze({
    // Core
    burst: burst,
    emit: emit,
    update: update,
    render: render,
    clear: clear,
    count: count,
    isActive: isActive,

    // Presets
    coinBurst: coinBurst,
    coinRain: coinRain,
    sparkle: sparkle,
    itemPoof: itemPoof,
    levelUp: levelUp,
    healPulse: healPulse,
    dmgFlash: dmgFlash,
    keyConsume: keyConsume,
    equipFlash: equipFlash,
    salvageSpark: salvageSpark
  });
})();

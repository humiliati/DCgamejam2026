/**
 * DeathAnim — origami fold + poof death animations for enemies.
 *
 * Paper Mario style: enemy folds up vertically (perspective squash),
 * then either flattens into a lootable corpse tile or poofs away
 * with a particle burst.
 *
 * Canvas-rendered — called from the raycaster sprite pass or an
 * overlay pass in game.js's render loop.
 *
 * Layer 2 (after EnemySprites, before Raycaster)
 * Depends on: EnemySprites (DEATH_TYPE), Toast (optional)
 */
var DeathAnim = (function () {
  'use strict';

  // ── Timing ────────────────────────────────────────────────────────
  var FOLD_DURATION   = 600;   // ms — fold-up phase
  var FLATTEN_DURATION = 300;  // ms — fold → flatten to ground
  var POOF_DURATION   = 400;   // ms — poof particle burst
  var LINGER_DURATION = 200;   // ms — brief pause before corpse tile placed

  // ── Active animations ────────────────────────────────────────────
  var _anims = [];   // { enemy, type, phase, timer, screenX, screenY, scale, emoji, corpseEmoji, done }

  // Poof particle pool
  var _particles = [];  // { emoji, x, y, vx, vy, life, maxLife, scale }

  /**
   * Start a death animation for an enemy.
   *
   * @param {Object} enemy - The enemy entity
   * @param {number} screenX - Screen-space X (center of sprite)
   * @param {number} screenY - Screen-space Y (center of sprite)
   * @param {number} scale - Current render scale of the sprite
   * @param {Function} [onComplete] - Called when animation finishes
   */
  function start(enemy, screenX, screenY, scale, onComplete) {
    var deathType = (typeof EnemySprites !== 'undefined')
      ? EnemySprites.getDeathType(enemy)
      : 'fold';

    var corpseEmoji = '💀';
    if (typeof EnemySprites !== 'undefined') {
      corpseEmoji = EnemySprites.getEmoji(enemy.type, 'corpse', '💀');
    }

    // Death SFX — fold gets a thud, poof gets a zap
    if (typeof AudioSystem !== 'undefined') {
      if (deathType === 'fold') {
        AudioSystem.play('enemy-death', { volume: 0.5 });
      } else {
        AudioSystem.play('zap', { volume: 0.4 });
      }
    }

    _anims.push({
      enemy:       enemy,
      type:        deathType,
      phase:       deathType === 'fold' ? 'folding' : 'poofing',
      timer:       0,
      screenX:     screenX,
      screenY:     screenY,
      scale:       scale,
      emoji:       enemy.emoji || '👹',
      corpseEmoji: corpseEmoji,
      done:        false,
      onComplete:  onComplete || null
    });
  }

  /**
   * Update all active death animations.
   * @param {number} dt - Frame delta in ms
   */
  function update(dt) {
    // Update particles
    for (var p = _particles.length - 1; p >= 0; p--) {
      var part = _particles[p];
      part.life += dt;
      if (part.life >= part.maxLife) {
        _particles.splice(p, 1);
        continue;
      }
      part.x += part.vx * dt * 0.001;
      part.y += part.vy * dt * 0.001;
      part.vy += 40 * dt * 0.001; // gravity
    }

    // Update animations
    for (var i = _anims.length - 1; i >= 0; i--) {
      var a = _anims[i];
      a.timer += dt;

      if (a.type === 'fold') {
        if (a.phase === 'folding' && a.timer >= FOLD_DURATION) {
          a.phase = 'flattening';
          a.timer = 0;
        } else if (a.phase === 'flattening' && a.timer >= FLATTEN_DURATION) {
          a.phase = 'linger';
          a.timer = 0;
        } else if (a.phase === 'linger' && a.timer >= LINGER_DURATION) {
          a.done = true;
        }
      } else { // poof
        if (a.phase === 'poofing') {
          // Emit particles during first half
          if (a.timer < POOF_DURATION * 0.5) {
            _emitPoof(a);
          }
          if (a.timer >= POOF_DURATION) {
            a.done = true;
          }
        }
      }

      if (a.done) {
        if (a.onComplete) a.onComplete(a.enemy, a.type);
        _anims.splice(i, 1);
      }
    }
  }

  /**
   * Emit poof particles from animation center.
   */
  function _emitPoof(a) {
    var poofEmojis = ['✨', '💫', '💨', '⭐'];
    for (var j = 0; j < 2; j++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 30 + Math.random() * 60;
      _particles.push({
        emoji: poofEmojis[Math.floor(Math.random() * poofEmojis.length)],
        x: a.screenX + (Math.random() - 0.5) * 20,
        y: a.screenY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0,
        maxLife: 300 + Math.random() * 200,
        scale: 0.5 + Math.random() * 0.5
      });
    }
  }

  /**
   * Render all active death animations on the canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  function render(ctx, w, h) {
    ctx.save();

    // Render particles (behind animations)
    for (var p = 0; p < _particles.length; p++) {
      var part = _particles[p];
      var pAlpha = 1 - (part.life / part.maxLife);
      ctx.globalAlpha = pAlpha;
      ctx.font = Math.floor(14 * part.scale) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(part.emoji, part.x, part.y);
    }

    // Render death animations
    for (var i = 0; i < _anims.length; i++) {
      var a = _anims[i];

      if (a.type === 'fold') {
        _renderFold(ctx, a);
      } else {
        _renderPoof(ctx, a);
      }
    }

    ctx.restore();
  }

  /**
   * Origami fold animation:
   * Phase 1 (folding): Sprite squashes vertically (scaleY 1→0)
   *   with slight rotation, like paper folding in half.
   * Phase 2 (flattening): Corpse emoji appears, scales from 0→0.6
   *   with a subtle bounce, positioned slightly lower (on ground).
   * Phase 3 (linger): Brief hold before tile placement.
   */
  function _renderFold(ctx, a) {
    var sx = a.screenX;
    var sy = a.screenY;

    if (a.phase === 'folding') {
      var t = Math.min(1, a.timer / FOLD_DURATION);
      // Ease-in fold: starts slow, accelerates (like paper falling)
      var eased = t * t;

      // Scale Y squashes to 0
      var scaleY = 1 - eased;
      // Scale X slightly widens then narrows (paper bulge)
      var scaleX = 1 + Math.sin(t * Math.PI) * 0.15;
      // Rotation increases as fold progresses
      var rotation = eased * 0.3;
      // Alpha fades slightly at end
      var alpha = 1 - eased * 0.3;

      // Vertical drift downward (sprite sinks)
      var driftY = eased * a.scale * 40;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy + driftY);
      ctx.rotate(rotation);
      ctx.scale(scaleX * a.scale, scaleY * a.scale);

      var fontSize = Math.floor(48 * a.scale);
      ctx.font = fontSize + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.emoji, 0, 0);

      ctx.restore();

    } else if (a.phase === 'flattening') {
      var t2 = Math.min(1, a.timer / FLATTEN_DURATION);
      // Bounce-out ease
      var bounce = t2 < 0.6
        ? (t2 / 0.6) * (t2 / 0.6)
        : 1 - Math.pow(2 * (1 - t2), 2) * 0.15;
      var corpseScale = bounce * 0.6 * a.scale;

      // Corpse appears near bottom of sprite position
      var corpseY = sy + a.scale * 30;

      ctx.save();
      ctx.globalAlpha = 0.7 + t2 * 0.3;
      ctx.translate(sx, corpseY);
      ctx.scale(corpseScale, corpseScale * 0.4); // Flattened (perspective)

      var fontSize2 = 48;
      ctx.font = fontSize2 + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.corpseEmoji, 0, 0);

      ctx.restore();

    } else if (a.phase === 'linger') {
      // Hold the flattened corpse in place
      var corpseY2 = sy + a.scale * 30;

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(sx, corpseY2);
      ctx.scale(0.6 * a.scale, 0.24 * a.scale);

      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.corpseEmoji, 0, 0);

      ctx.restore();
    }
  }

  /**
   * Poof animation: sprite rapidly shrinks and fades while
   * particles burst outward.
   */
  function _renderPoof(ctx, a) {
    if (a.phase !== 'poofing') return;

    var t = Math.min(1, a.timer / POOF_DURATION);
    // Rapid shrink + fade
    var shrink = 1 - t * t;
    var alpha = 1 - t;
    // Slight upward drift
    var liftY = t * 20;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(a.screenX, a.screenY - liftY);
    ctx.scale(shrink * a.scale, shrink * a.scale);

    var fontSize = 48;
    ctx.font = fontSize + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.emoji, 0, 0);

    ctx.restore();
  }

  /**
   * Check if any death animations are currently playing.
   * @returns {boolean}
   */
  function isPlaying() {
    return _anims.length > 0 || _particles.length > 0;
  }

  /**
   * Clear all animations (e.g. on floor change).
   */
  function clear() {
    _anims.length = 0;
    _particles.length = 0;
  }

  /**
   * Get count of active animations.
   */
  function count() {
    return _anims.length;
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    start:     start,
    update:    update,
    render:    render,
    isPlaying: isPlaying,
    clear:     clear,
    count:     count
  };
})();

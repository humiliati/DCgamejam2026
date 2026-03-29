/**
 * DeathAnim — stack-aware death animations for enemies.
 *
 * Two death types:
 *   FOLD  — ragdoll joint collapse (stacked) or origami fold (legacy single emoji).
 *           Each stack slot separates with offset timing, joint-spring rotation,
 *           and settles into a scattered corpse pile on the ground.
 *   POOF  — particle burst vanish (unchanged).
 *
 * Reanimation: reverse collapse — pile reassembles from ground into standing stack.
 *
 * Canvas-rendered — called from game.js render overlay.
 * Layer 2 (after EnemySprites, before Raycaster)
 * Depends on: EnemySprites (DEATH_TYPE, getStack), AudioSystem (optional)
 */
var DeathAnim = (function () {
  'use strict';

  // ── Timing ────────────────────────────────────────────────────────
  var FOLD_DURATION    = 600;   // ms — fold/collapse phase
  var SETTLE_DURATION  = 350;   // ms — slots drift to pile positions
  var LINGER_DURATION  = 200;   // ms — brief hold before corpse tile placed
  var POOF_DURATION    = 400;   // ms — poof particle burst
  var REANIMATE_DURATION = 700; // ms — reverse collapse (stand back up)

  // ── Ragdoll joint constants ───────────────────────────────────────
  // Stagger delay per slot: head breaks first, legs last
  var SLOT_STAGGER  = [0.0, 0.12, 0.25]; // fraction of FOLD_DURATION
  // Max rotation per slot (radians): head wobbles most
  var SLOT_MAX_ROT  = [0.55, 0.35, 0.15];
  // X drift direction per slot (normalized): head right, legs left for asymmetry
  var SLOT_DRIFT_X  = [0.6, -0.2, -0.5];
  // Y slot offsets in stack (fraction of sprite height)
  var SLOT_Y_OFF    = [-0.28, 0.0, 0.28];
  // Settle pile layout: X offset, Y offset from center (scattered pile)
  var PILE_X = [-0.3, 0.1, 0.35];
  var PILE_Y = [0.15, 0.0, -0.1];

  // ── Active animations ────────────────────────────────────────────
  var _anims = [];
  var _particles = [];  // { emoji, x, y, vx, vy, life, maxLife, scale }

  /**
   * Start a death animation for an enemy.
   *
   * @param {Object} enemy - The enemy entity (needs .emoji, .type, .tags)
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

    // Resolve stack definition for ragdoll collapse
    var stack = null;
    if (typeof EnemySprites !== 'undefined') {
      stack = EnemySprites.getStack(enemy.type);
    }

    // Death SFX
    if (typeof AudioSystem !== 'undefined') {
      if (deathType === 'fold') {
        AudioSystem.play('enemy-death', { volume: 0.5 });
      } else {
        AudioSystem.play('zap', { volume: 0.4 });
      }
    }

    // Seed for variety: use enemy type hash for deterministic scatter direction
    var seed = 0;
    var etype = enemy.type || '';
    for (var ci = 0; ci < etype.length; ci++) seed += etype.charCodeAt(ci);
    // Direction bias: -1 or 1 — which way the stack falls
    var fallDir = (seed % 2 === 0) ? 1 : -1;

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
      stack:       stack,      // null → legacy single-emoji fold
      fallDir:     fallDir,    // -1 or 1
      seed:        seed,
      done:        false,
      onComplete:  onComplete || null
    });
  }

  /**
   * Start a reanimation animation (corpse → standing NPC).
   * Reverse of the ragdoll collapse.
   *
   * @param {string} enemyType - Type key for stack lookup
   * @param {number} screenX - Screen-space X
   * @param {number} screenY - Screen-space Y
   * @param {number} scale - Render scale
   * @param {Function} [onComplete] - Called when stand-up finishes
   */
  function startReanimate(enemyType, screenX, screenY, scale, onComplete) {
    var stack = null;
    if (typeof EnemySprites !== 'undefined') {
      stack = EnemySprites.getStack(enemyType);
    }

    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('pickup-success', { volume: 0.4 });
    }

    var seed = 0;
    for (var ci = 0; ci < enemyType.length; ci++) seed += enemyType.charCodeAt(ci);

    _anims.push({
      enemy:       { type: enemyType, emoji: stack ? (stack.head || stack.torso || '👹') : '👹' },
      type:        'reanimate',
      phase:       'rising',
      timer:       0,
      screenX:     screenX,
      screenY:     screenY,
      scale:       scale,
      emoji:       stack ? (stack.head || stack.torso || '👹') : '👹',
      corpseEmoji: null,
      stack:       stack,
      fallDir:     (seed % 2 === 0) ? 1 : -1,
      seed:        seed,
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
          a.phase = 'settling';
          a.timer = 0;
        } else if (a.phase === 'settling' && a.timer >= SETTLE_DURATION) {
          a.phase = 'linger';
          a.timer = 0;
        } else if (a.phase === 'linger' && a.timer >= LINGER_DURATION) {
          a.done = true;
        }
      } else if (a.type === 'reanimate') {
        if (a.phase === 'rising' && a.timer >= REANIMATE_DURATION) {
          a.done = true;
        }
      } else { // poof
        if (a.phase === 'poofing') {
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

  // ── Render ────────────────────────────────────────────────────────

  function render(ctx, w, h) {
    ctx.save();

    // Particles (behind)
    for (var p = 0; p < _particles.length; p++) {
      var part = _particles[p];
      var pAlpha = 1 - (part.life / part.maxLife);
      ctx.globalAlpha = pAlpha;
      ctx.font = Math.floor(14 * part.scale) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(part.emoji, part.x, part.y);
    }

    // Animations
    for (var i = 0; i < _anims.length; i++) {
      var a = _anims[i];

      if (a.type === 'fold') {
        if (a.stack) {
          _renderStackFold(ctx, a);
        } else {
          _renderLegacyFold(ctx, a);
        }
      } else if (a.type === 'reanimate') {
        _renderReanimate(ctx, a);
      } else {
        _renderPoof(ctx, a);
      }
    }

    ctx.restore();
  }

  // ── Stack ragdoll collapse ────────────────────────────────────────
  //
  // Design: 3 slots separate with staggered timing. Joint springs keep
  // them slightly tethered — adjacent slots' rotations influence each
  // other via a damped coupling term. Head is top-heavy (falls first,
  // rotates most). Legs are the anchor (stagger delay, minimal rotation).
  //
  // Phase 'folding': Each slot independently collapses with:
  //   - Y drop (gravity ease-in)
  //   - X drift (fall direction × per-slot bias)
  //   - Rotation (damped sinusoid × per-slot amplitude)
  //   - Alpha fade at end
  //
  // Phase 'settling': Slots drift from collapse end positions to final
  //   pile layout (scattered ground arrangement).
  //
  // Phase 'linger': Hold pile in place.

  function _renderStackFold(ctx, a) {
    var sx = a.screenX;
    var sy = a.screenY;
    var sc = a.scale;
    var fontSize = Math.floor(48 * sc * 0.36);  // Match _SLOT_FONT ratio
    var spriteH = 48 * sc;
    var dir = a.fallDir;
    var slots = [a.stack.head, a.stack.torso, a.stack.legs];

    if (a.phase === 'folding') {
      var globalT = Math.min(1, a.timer / FOLD_DURATION);

      for (var si = 0; si < 3; si++) {
        if (!slots[si]) continue;

        // Staggered start: head=0, torso=0.12, legs=0.25 of duration
        var localT = Math.max(0, globalT - SLOT_STAGGER[si]) / (1 - SLOT_STAGGER[si]);
        localT = Math.min(1, localT);
        var eased = localT * localT; // ease-in (accelerating fall)

        // Y: gravity drop from standing position to ground
        var standY = SLOT_Y_OFF[si] * spriteH;
        var dropY = eased * spriteH * 0.6;

        // X: drift in fall direction with per-slot bias
        var driftX = eased * SLOT_DRIFT_X[si] * dir * spriteH * 0.5;

        // Rotation: damped sinusoid — fast wobble decaying to a tilt
        var rotFreq = 8 + si * 2; // head wobbles faster
        var rotDecay = Math.exp(-3 * localT);
        var rotBase = eased * SLOT_MAX_ROT[si] * dir;
        var rotWobble = Math.sin(localT * rotFreq) * SLOT_MAX_ROT[si] * 0.4 * rotDecay;
        var rotation = rotBase + rotWobble;

        // Joint coupling: adjacent slots pull rotation slightly toward each other
        // This keeps the stack feeling "glued" during the first moments
        var coupling = Math.max(0, 1 - localT * 3); // strong at start, fades by t=0.33
        if (si > 0 && slots[si - 1]) rotation *= (1 - coupling * 0.3);
        if (si < 2 && slots[si + 1]) rotation *= (1 - coupling * 0.2);

        // Alpha: slight fade at end
        var alpha = 1 - eased * 0.2;

        // Scale: slight shrink as stack compresses
        var slotScale = 1 - eased * 0.15;

        _drawSlot(ctx, slots[si], sx + driftX, sy + standY + dropY, fontSize * slotScale, rotation, alpha);
      }

      // Sub-layers (hat, weapons) follow their parent slot collapse
      _renderCollapsingSubLayers(ctx, a, slots, sx, sy, spriteH, fontSize, dir);

    } else if (a.phase === 'settling') {
      var setT = Math.min(1, a.timer / SETTLE_DURATION);
      // Ease-out: decelerating drift to pile positions
      var easeOut = 1 - (1 - setT) * (1 - setT);

      // End-of-fold positions (where each slot ended up at t=1)
      for (var si2 = 0; si2 < 3; si2++) {
        if (!slots[si2]) continue;

        var endDriftX = SLOT_DRIFT_X[si2] * dir * spriteH * 0.5;
        var endDropY = SLOT_Y_OFF[si2] * spriteH + spriteH * 0.6;
        var endRot = SLOT_MAX_ROT[si2] * dir;

        // Target pile positions (scattered on ground)
        var pileX = PILE_X[si2] * dir * spriteH * 0.4;
        var pileY = spriteH * 0.5 + PILE_Y[si2] * spriteH * 0.2;
        var pileRot = endRot * 0.3; // Flatten rotation for pile

        // Lerp from end-of-fold to pile
        var curX = sx + endDriftX + (pileX - endDriftX) * easeOut;
        var curY = sy + endDropY + (pileY - endDropY) * easeOut;
        var curRot = endRot + (pileRot - endRot) * easeOut;
        var curAlpha = 0.8 + easeOut * 0.2;
        var curScale = 0.85 + easeOut * 0.05;

        _drawSlot(ctx, slots[si2], curX, curY, fontSize * curScale, curRot, curAlpha);
      }

    } else if (a.phase === 'linger') {
      // Hold final pile
      for (var si3 = 0; si3 < 3; si3++) {
        if (!slots[si3]) continue;
        var px = sx + PILE_X[si3] * dir * spriteH * 0.4;
        var py = sy + spriteH * 0.5 + PILE_Y[si3] * spriteH * 0.2;
        var pr = SLOT_MAX_ROT[si3] * dir * 0.3;
        _drawSlot(ctx, slots[si3], px, py, fontSize * 0.9, pr, 1);
      }
    }
  }

  /**
   * Render sub-layers (hat, weapons, modifiers) following parent slot collapse.
   */
  function _renderCollapsingSubLayers(ctx, a, slots, sx, sy, spriteH, fontSize, dir) {
    var globalT = Math.min(1, a.timer / FOLD_DURATION);
    var stack = a.stack;

    // Hat follows head (slot 0)
    if (stack.hat && slots[0]) {
      var ht = Math.max(0, globalT - SLOT_STAGGER[0]) / (1 - SLOT_STAGGER[0]);
      ht = Math.min(1, ht);
      var he = ht * ht;
      var hx = sx + he * SLOT_DRIFT_X[0] * dir * spriteH * 0.5;
      var hy = sy + SLOT_Y_OFF[0] * spriteH - fontSize * 0.4 + he * spriteH * 0.55;
      // Hat flies off slightly further than head
      hx += he * dir * fontSize * 0.3;
      var hRot = he * SLOT_MAX_ROT[0] * dir * 1.3; // rotates more than head
      var hAlpha = 1 - he * 0.3;
      _drawSlot(ctx, stack.hat, hx, hy, fontSize * (stack.hatScale || 0.5), hRot, hAlpha);
    }

    // Front weapon follows torso (slot 1) but detaches
    if (stack.frontWeapon && slots[1]) {
      var wt = Math.max(0, globalT - SLOT_STAGGER[1] - 0.05) / (1 - SLOT_STAGGER[1]);
      wt = Math.min(1, Math.max(0, wt));
      var we = wt * wt;
      var wx = sx + we * dir * spriteH * 0.4 + spriteH * (stack.frontWeaponOffsetX || -0.25);
      var wy = sy + we * spriteH * 0.65;
      var wRot = we * dir * 0.8;
      _drawSlot(ctx, stack.frontWeapon, wx, wy,
                fontSize * (stack.frontWeaponScale || 0.65), wRot, 1 - we * 0.2);
    }

    // Back weapon follows torso but with opposite drift
    if (stack.backWeapon && slots[1]) {
      var bwt = Math.max(0, globalT - SLOT_STAGGER[1]) / (1 - SLOT_STAGGER[1]);
      bwt = Math.min(1, bwt);
      var bwe = bwt * bwt;
      var bwx = sx - bwe * dir * spriteH * 0.35 + spriteH * (stack.backWeaponOffsetX || 0.3);
      var bwy = sy + bwe * spriteH * 0.6;
      var bwRot = -bwe * dir * 0.6;
      _drawSlot(ctx, stack.backWeapon, bwx, bwy,
                fontSize * (stack.backWeaponScale || 0.4), bwRot, 1 - bwe * 0.25);
    }
  }

  // ── Reanimation (reverse collapse) ────────────────────────────────
  //
  // Slots rise from pile positions back to standing stack.
  // Legs first (anchor plants), torso follows, head snaps to attention.
  // Reverse of the SLOT_STAGGER order.

  function _renderReanimate(ctx, a) {
    if (!a.stack || a.phase !== 'rising') {
      // Legacy fallback: simple scale-up
      var lt = Math.min(1, a.timer / REANIMATE_DURATION);
      var lEase = 1 - (1 - lt) * (1 - lt);
      ctx.save();
      ctx.globalAlpha = lEase;
      ctx.translate(a.screenX, a.screenY);
      ctx.scale(lEase * a.scale, lEase * a.scale);
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.emoji, 0, 0);
      ctx.restore();
      return;
    }

    var sx = a.screenX;
    var sy = a.screenY;
    var sc = a.scale;
    var fontSize = Math.floor(48 * sc * 0.36);
    var spriteH = 48 * sc;
    var dir = a.fallDir;
    var slots = [a.stack.head, a.stack.torso, a.stack.legs];
    var t = Math.min(1, a.timer / REANIMATE_DURATION);

    // Reverse stagger: legs first (0.0), torso (0.15), head (0.3)
    var RISE_STAGGER = [0.3, 0.15, 0.0];

    for (var si = 0; si < 3; si++) {
      if (!slots[si]) continue;

      var localT = Math.max(0, t - RISE_STAGGER[si]) / (1 - RISE_STAGGER[si]);
      localT = Math.min(1, localT);
      // Ease-out: fast start, gentle landing
      var eased = 1 - (1 - localT) * (1 - localT);

      // Start: pile position
      var startX = PILE_X[si] * dir * spriteH * 0.4;
      var startY = spriteH * 0.5 + PILE_Y[si] * spriteH * 0.2;
      var startRot = SLOT_MAX_ROT[si] * dir * 0.3;

      // End: standing position
      var endX = 0;
      var endY = SLOT_Y_OFF[si] * spriteH;
      var endRot = 0;

      // Lerp pile → standing
      var curX = sx + startX + (endX - startX) * eased;
      var curY = sy + startY + (endY - startY) * eased;
      var curRot = startRot + (endRot - startRot) * eased;

      // Wobble on arrival (spring overshoot)
      if (localT > 0.7) {
        var wobbleT = (localT - 0.7) / 0.3;
        var wobble = Math.sin(wobbleT * Math.PI * 3) * 0.08 * (1 - wobbleT);
        curRot += wobble;
      }

      var alpha = 0.6 + eased * 0.4;

      _drawSlot(ctx, slots[si], curX, curY, fontSize, curRot, alpha);
    }

    // Hat snaps on at the end
    if (a.stack.hat && slots[0] && t > 0.75) {
      var hatT = (t - 0.75) / 0.25;
      var hatEase = 1 - (1 - hatT) * (1 - hatT);
      var hatY = sy + SLOT_Y_OFF[0] * spriteH - fontSize * 0.4;
      var hatBounce = Math.sin(hatT * Math.PI) * fontSize * 0.2;
      _drawSlot(ctx, a.stack.hat, sx, hatY - hatBounce,
                fontSize * (a.stack.hatScale || 0.5), 0, hatEase);
    }
  }

  // ── Shared slot drawing helper ────────────────────────────────────

  function _drawSlot(ctx, emoji, x, y, fontSize, rotation, alpha) {
    if (!emoji) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    ctx.font = Math.max(6, Math.floor(fontSize)) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  // ── Legacy single-emoji fold (unchanged for non-stack enemies) ────

  function _renderLegacyFold(ctx, a) {
    var sx = a.screenX;
    var sy = a.screenY;

    if (a.phase === 'folding') {
      var t = Math.min(1, a.timer / FOLD_DURATION);
      var eased = t * t;
      var scaleY = 1 - eased;
      var scaleX = 1 + Math.sin(t * Math.PI) * 0.15;
      var rotation = eased * 0.3;
      var alpha = 1 - eased * 0.3;
      var driftY = eased * a.scale * 40;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy + driftY);
      ctx.rotate(rotation);
      ctx.scale(scaleX * a.scale, scaleY * a.scale);
      ctx.font = Math.floor(48 * a.scale) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.emoji, 0, 0);
      ctx.restore();

    } else if (a.phase === 'settling') {
      // Legacy: corpse emoji bounce-in (was 'flattening')
      var t2 = Math.min(1, a.timer / SETTLE_DURATION);
      var bounce = t2 < 0.6
        ? (t2 / 0.6) * (t2 / 0.6)
        : 1 - Math.pow(2 * (1 - t2), 2) * 0.15;
      var corpseScale = bounce * 0.6 * a.scale;
      var corpseY = sy + a.scale * 30;

      ctx.save();
      ctx.globalAlpha = 0.7 + t2 * 0.3;
      ctx.translate(sx, corpseY);
      ctx.scale(corpseScale, corpseScale * 0.4);
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.corpseEmoji, 0, 0);
      ctx.restore();

    } else if (a.phase === 'linger') {
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

  // ── Poof (unchanged) ─────────────────────────────────────────────

  function _renderPoof(ctx, a) {
    if (a.phase !== 'poofing') return;
    var t = Math.min(1, a.timer / POOF_DURATION);
    var shrink = 1 - t * t;
    var alpha = 1 - t;
    var liftY = t * 20;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(a.screenX, a.screenY - liftY);
    ctx.scale(shrink * a.scale, shrink * a.scale);
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.emoji, 0, 0);
    ctx.restore();
  }

  // ── Utility ───────────────────────────────────────────────────────

  function isPlaying() {
    return _anims.length > 0 || _particles.length > 0;
  }

  function clear() {
    _anims.length = 0;
    _particles.length = 0;
  }

  function count() {
    return _anims.length;
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    start:          start,
    startReanimate: startReanimate,
    update:         update,
    render:         render,
    isPlaying:      isPlaying,
    clear:          clear,
    count:          count
  };
})();

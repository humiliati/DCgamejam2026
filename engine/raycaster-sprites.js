/**
 * RaycasterSprites — billboard sprite, wall-decor, and particle rendering.
 *
 * Phase 3 of the raycaster extraction roadmap (see
 * docs/RAYCASTER_EXTRACTION_ROADMAP.md, EX-6). This is the largest
 * extraction — ~1,100 lines — and the one that most frequently receives
 * edits ("tweak how X enemy displays").
 *
 * Public entry points (called from Raycaster core):
 *
 *   - renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites,
 *                   renderDist, fogDist, fogColor, minDist, maxDist)
 *       Sorts sprites far→near and draws each one with billboarding,
 *       triple-emoji stacks, particles, capsules, awareness glyphs,
 *       directional shading, pedestal / counter occlusion. Reads but
 *       never writes the z-buffer.
 *
 *   - renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
 *                     wallTop, mapX, mapY, sd, stX, stY)
 *       Per-column, per-wall-hit sprite overlay (torches, runes, cavity
 *       glows) keyed off `_wallDecor[y][x][face]`. Called from both the
 *       foreground wall phase and the back-layer loop in Raycaster core.
 *
 *   - updateAndRenderParticles(ctx, dt)
 *       Ticks the shared particle pool once per frame and draws live
 *       particles.
 *
 * Module-private helpers (not aliased in core):
 *   _renderStack, _renderCorpsePile, _renderSubLayer, _hueToRgb,
 *   _emitParticle, _ensureTintCanvas.
 *
 * Module-owned state:
 *   - _particles / _particleThrottle — shared status-FX pool.
 *   - _tintCanvas / _tintCtx — scratch canvas for per-glyph hue tint.
 *
 * State binding (via bind getters):
 *   - contract()    → active SpatialContract (ceilingType check)
 *   - zBuffer()     → column depth buffer for occlusion reads
 *   - pedBuffers()  → { dist, topY, mx, my } pedestal occlusion arrays
 *   - wallDecor()   → per-cell wall-decor lookup grid
 *
 * External deps (read through Layer 2 globals — no IIFE indirection):
 *   - RaycasterLighting.parseGlowRGB   (EX-1)
 *   - RaycasterWalls.hitFace           (EX-5)
 *   - TextureAtlas, SpatialContract    (engine globals)
 *   - KaomojiCapsule, EnemyIntent,
 *     EnemyAI                          (typeof-guarded at call site)
 *
 * Layer 2 — loaded after raycaster-walls.js, before raycaster.js.
 */
var RaycasterSprites = (function () {
  'use strict';

  // Layer-2 aliases — resolve once at IIFE init (free identifiers in hotpath).
  var _parseGlowRGB = RaycasterLighting.parseGlowRGB;
  var _hitFace      = RaycasterWalls.hitFace;

  // ── Facing direction lookup for sprite directional shading ──
  // Maps enemy.facing string → [dx, dy] unit vector.
  var _FACE_VEC = {
    east:  [ 1,  0],
    south: [ 0,  1],
    west:  [-1,  0],
    north: [ 0, -1]
  };

  // Max darkness when enemy faces directly away from player.
  // 0.45 = heavy shadow, enough to read as "their back" without
  // fully obscuring the emoji.
  var FACING_DARK_MAX = 0.45;

  // ── Overhead awareness expressions (MGS-style indicators) ────────
  // Maps EnemyAI awareness state labels → overhead glyph + color.
  // Rendered above enemy sprites in world-space (canvas coordinates).
  var _AWARENESS_GLYPHS = {
    Unaware:    { glyph: '💤', color: '#aaa' },
    Suspicious: { glyph: '❓', color: '#cc4' },
    Alerted:    { glyph: '❗', color: '#c44' },
    Engaged:    { glyph: '⚔️',  color: '#c4c' }
  };

  // Overhead expression bob amplitude (px at distance 1)
  var OVERHEAD_BOB_AMP = 3;
  // Overhead expression bob frequency (cycles per second)
  var OVERHEAD_BOB_FREQ = 2.5;

  // ── Lightweight particle pool for status FX ──────────────────────
  // Fixed pool, no allocation per frame. Each particle has:
  //   emoji, x, y, vx, vy, life, maxLife, size, alpha
  var _PARTICLE_MAX = 48;
  var _particles = [];
  var _particleThrottle = {};  // Keyed by screenX bucket, limits spawn rate

  // ── Triple emoji stack layout constants ──────────────────────────
  // Slot Y offsets as fraction of spriteH from center:
  //   Slot 0 (head):  -0.28
  //   Slot 1 (torso):  0.00
  //   Slot 2 (legs):  +0.28
  var _SLOT_Y = [-0.28, 0.0, 0.28];
  // Per-slot bob damping: head bobs full, legs stay grounded
  var _SLOT_BOB = [1.0, 0.6, 0.2];
  // Per-slot font scale (fraction of spriteH for each emoji)
  var _SLOT_FONT = 0.32;

  // ── Per-slot tint offscreen canvas ─────────────────────────────
  // Reusable scratch canvas for isolating individual emoji glyphs
  // so hue tint only colors the glyph pixels (source-atop), not a
  // bounding rect that bleeds onto transparent areas and other slots.
  var _tintCanvas = null;
  var _tintCtx    = null;
  // Default tint mask: [head, torso, legs]. Only clothes slots tinted.
  var _DEFAULT_TINT_SLOTS = [false, true, true];

  // ── State binding ────────────────────────────────────────────────
  // Getters installed by the Raycaster IIFE. See header for shape.
  var _s = null;
  function bind(getters) { _s = getters; }

  // ── Wall decor rendering ──────────────────────────────────────
  // Draws small alpha-transparent sprites pinned to wall faces.
  // Called after the wall texture and before fog/brightness overlays
  // so that all post-processing applies uniformly to both wall and decor.
  function renderWallDecor(ctx, col, wallX, drawStart, drawEnd, lineHeight,
                           wallTop, mapX, mapY, sd, stX, stY) {
    var wallDecor = _s ? _s.wallDecor() : null;
    if (!wallDecor) return;
    var row = wallDecor[mapY];
    if (!row) return;
    var cell = row[mapX];
    if (!cell) return;

    var face = _hitFace(sd, stX, stY);
    var items = cell[face];
    if (!items || items.length === 0) return;

    if (drawEnd - drawStart < 0) return;

    for (var di = 0; di < items.length; di++) {
      var d = items[di];

      // Skip items rendered in the step-fill cavity band (fire sprites
      // for HEARTH/BONFIRE — already composited into the lip region)
      if (d.cavityBand) continue;

      var halfW = d.scale / 2;
      var uMin = d.anchorU - halfW;
      var uMax = d.anchorU + halfW;

      // Check if this column falls within the sprite's horizontal span
      if (wallX < uMin || wallX >= uMax) continue;

      var tex = TextureAtlas.get(d.spriteId);
      if (!tex) continue;

      // Which column of the sprite to sample
      var texCol = Math.floor((wallX - uMin) / d.scale * tex.width);
      if (texCol < 0) texCol = 0;
      if (texCol >= tex.width) texCol = tex.width - 1;

      // Vertical placement: anchorV 0=bottom, 1=top of wall face
      // Sprite aspect ratio preserved: vExtent = scale * (texH / texW)
      var vExtent = d.scale * tex.height / tex.width;
      var vCenter = d.anchorV;
      // Wobble: slow vertical bobbing for fire-inside-wall sprites
      if (d.wobble) {
        vCenter += Math.sin(Date.now() * 0.003) * d.wobble;
      }
      var vMin = vCenter - vExtent / 2;
      var vMax = vCenter + vExtent / 2;

      // Map to screen pixels within the FULL (unclamped) wall strip.
      // Using wallTop + lineHeight (not drawStart + stripH) so sprite
      // position is stable regardless of screen clamping — fixes the
      // "flag waving" warping artifact on peripheral walls.
      // wallV 0=top of wall, 1=bottom → sprite vMin/vMax are 0=bottom, 1=top
      var spriteTop = wallTop + (1 - vMax) * lineHeight;
      var spriteBot = wallTop + (1 - vMin) * lineHeight;
      var spriteH = spriteBot - spriteTop;
      if (spriteH < 1) continue;

      // Clamp to wall bounds
      var dTop = Math.max(drawStart, Math.floor(spriteTop));
      var dBot = Math.min(drawEnd, Math.floor(spriteBot) - 1);
      if (dTop > dBot) continue;

      // ── Cavity glow: radial-falloff colored glow behind the sprite ──
      // Renders per-pixel alpha-faded glow before the sprite texture.
      // Uses radial distance from glow center to produce soft orb-like
      // light spill, not a flat disc. Makes fire openings (bonfires,
      // hearths) and CRT screens look like they emit volumetric light
      // from inside the short wall cavity.
      if (d.cavityGlow) {
        var cgR = d.glowR || 255;
        var cgG = d.glowG || 120;
        var cgB = d.glowB || 30;
        var cgA = d.glowA || 0.3;
        // Extend glow region beyond sprite bounds
        var glowPad = Math.max(3, Math.floor((dBot - dTop) * 0.35));
        var gTop = Math.max(drawStart, dTop - glowPad);
        var gBot = Math.min(drawEnd, dBot + glowPad);
        var gH = gBot - gTop + 1;
        if (gH > 0) {
          // Glow center in screen Y (sprite vertical center)
          var gCY = (dTop + dBot) * 0.5;
          // Glow center in screen X (sprite horizontal center)
          var spriteCX = wallTop + (1 - d.anchorV) * lineHeight; // approximate
          // Column offset from sprite U center → horizontal falloff
          var uCenter = d.anchorU;
          var uDist = Math.abs(wallX - uCenter) / (d.scale * 0.5 + 0.001);
          uDist = Math.min(uDist, 1); // 0 at center, 1 at edge
          // Per-pixel vertical render with radial falloff
          for (var gp = gTop; gp <= gBot; gp++) {
            var vDist = Math.abs(gp - gCY) / (glowPad + (dBot - dTop) * 0.5 + 0.001);
            vDist = Math.min(vDist, 1);
            // Radial distance from center (0=center, 1=edge)
            var rDist = Math.sqrt(uDist * uDist + vDist * vDist);
            if (rDist >= 1) continue;
            // Smooth falloff: bright core, soft edge
            var falloff = 1 - rDist * rDist; // quadratic falloff
            var pixA = cgA * falloff;
            if (pixA < 0.01) continue;
            ctx.fillStyle = 'rgba(' + cgR + ',' + cgG + ',' + cgB + ',' + pixA.toFixed(3) + ')';
            ctx.fillRect(col, gp, 1, 1);
          }
        }
      }

      // Source rect in sprite texture
      var srcY = (dTop - spriteTop) / spriteH * tex.height;
      var srcH = (dBot - dTop + 1) / spriteH * tex.height;
      if (srcH < 0.5) srcH = 0.5;

      ctx.drawImage(tex.canvas, texCol, srcY, 1, srcH, col, dTop, 1, dBot - dTop + 1);
    }
  }

  // ── Particle pool ────────────────────────────────────────────────

  function _emitParticle(emoji, sx, sy, spriteH, dist, baseAlpha) {
    // Throttle: max 1 particle per sprite-bucket every 200ms
    var bucket = Math.floor(sx / 20);
    var now = Date.now();
    if (_particleThrottle[bucket] && now - _particleThrottle[bucket] < 200) return;
    _particleThrottle[bucket] = now;

    // Find a dead slot or overwrite oldest
    var slot = null;
    for (var pi = 0; pi < _particles.length; pi++) {
      if (_particles[pi].life <= 0) { slot = _particles[pi]; break; }
    }
    if (!slot) {
      if (_particles.length < _PARTICLE_MAX) {
        slot = { emoji: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 10, alpha: 1 };
        _particles.push(slot);
      } else {
        slot = _particles[0];
        for (var pi = 1; pi < _particles.length; pi++) {
          if (_particles[pi].life < slot.life) slot = _particles[pi];
        }
      }
    }

    var pSize = Math.max(8, Math.floor(spriteH * 0.25));
    slot.emoji = emoji;
    slot.x = sx + (Math.random() - 0.5) * spriteH * 0.4;
    slot.y = sy - spriteH * 0.2;
    slot.vx = (Math.random() - 0.5) * 0.3;
    slot.vy = -0.4 - Math.random() * 0.3;  // Float upward
    slot.life = 800 + Math.random() * 400;  // 800-1200ms
    slot.maxLife = slot.life;
    slot.size = pSize;
    slot.alpha = baseAlpha;
  }

  function updateAndRenderParticles(ctx, dt) {
    for (var pi = 0; pi < _particles.length; pi++) {
      var p = _particles[pi];
      if (p.life <= 0) continue;

      p.life -= dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;

      var t = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = p.alpha * t * 0.7;
      ctx.font = Math.floor(p.size * t) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, p.x, p.y);
      ctx.restore();
    }
  }

  function _ensureTintCanvas(size) {
    if (!_tintCanvas || _tintCanvas.width < size || _tintCanvas.height < size) {
      _tintCanvas = document.createElement('canvas');
      _tintCanvas.width  = size;
      _tintCanvas.height = size;
      _tintCtx = _tintCanvas.getContext('2d');
    }
    return _tintCtx;
  }

  /**
   * Render a triple emoji stack at billboard position.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} stack - { head, torso, legs, hat, backWeapon, frontWeapon, headMods, torsoMods, tintHue }
   * @param {number} screenX - Horizontal center (px)
   * @param {number} centerY - Vertical center (px)
   * @param {number} spriteH - Total sprite height (px)
   * @param {number} spriteW - Total sprite width (px)
   * @param {number} hSquish - Horizontal squish from Euler flattening
   * @param {number} ySquish - Vertical squish for ground tilt
   * @param {string} facing  - Cardinal direction string ('north','south','east','west')
   * @param {Object} item    - Sorted sprite item (has .dx, .dy, .dist)
   */
  function _renderStack(ctx, stack, screenX, centerY, spriteH, spriteW, hSquish, ySquish, facing, item, bobY, stackFX) {
    var fontSize = Math.max(8, Math.floor(spriteH * _SLOT_FONT));
    var sx = hSquish < 0.98 ? hSquish : 1;
    // Differential idle bob per slot (head leads, legs anchor)
    var baseBob = bobY || 0;

    // ── Stack FX extraction ──────────────────────────────────────
    var fx = stackFX || {};
    var travelSpring = fx.travelSpring || 0;
    var lungePhase   = fx.lungePhase   || 0;
    var flashWhite   = fx.flashWhite   || false;
    var dotFlash     = fx.dotFlash     || false;
    var statusHue    = (fx.statusHue !== null && fx.statusHue !== undefined) ? fx.statusHue : -1;
    var statusAlpha  = fx.statusAlpha  || 0;
    var ghostAlpha   = fx.ghostAlpha !== undefined ? fx.ghostAlpha : 1;

    // Apply ghost alpha to all slots
    if (ghostAlpha < 1) ctx.globalAlpha *= ghostAlpha;

    // Per-slot travel spring offsets (head sways most, legs least)
    // Spring is a horizontal displacement that creates a walking sway
    var _SPRING_SCALE = [1.0, 0.5, 0.15];
    // Per-slot lunge offsets (torso leads, head follows, legs anchor)
    // Lunge shifts slots upward (toward player in billboard space) for forward lean
    var _LUNGE_SCALE = [0.6, 1.0, 0.1];

    // Resolve directional facing dot product for layer visibility
    var faceDot = 0;
    if (facing && item) {
      var fv = _FACE_VEC[facing];
      if (fv && item.dist > 0.01) {
        var invD = 1 / item.dist;
        var ex = -item.dx * invD;
        var ey = -item.dy * invD;
        faceDot = fv[0] * ex + fv[1] * ey;
      }
    }
    // Layer visibility based on facing
    var showFrontWeapon = faceDot > -0.1;
    var showBackWeapon  = faceDot < 0.2;
    // When NPC faces away, back weapon renders ON TOP (highest z) instead of behind
    var backWeaponOnTop = faceDot < -0.3;
    var headDim = faceDot < -0.3 ? 0.6 : 1.0;
    // Head Y-squash when facing away (back-of-head foreshortening)
    var headSquash = faceDot < -0.3 ? 0.94 : 1.0;
    // Weapon scale multiplier at side angles (foreshortening)
    var absFace = Math.abs(faceDot);
    var weaponFore = absFace < 0.3 ? 0.7 : 1.0;
    // Hat X-shift in facing direction (perspective offset)
    var hatShiftX = 0;
    if (facing && absFace < 0.5) {
      var fv2 = _FACE_VEC[facing];
      if (fv2) hatShiftX = fv2[0] * fontSize * 0.12;
    }
    // Back weapon squish: weapon is perpendicular to body plane, so it
    // foreshortens LESS than the body at side angles. Lerp toward 1.0.
    var bwSx = sx + (1 - sx) * 0.6;

    var slots = [stack.head, stack.torso, stack.legs];
    var mods  = [stack.headMods, stack.torsoMods, null];

    for (var si = 0; si < 3; si++) {
      var slotEmoji = slots[si];
      if (!slotEmoji) continue;

      var slotBob = baseBob * _SLOT_BOB[si];
      // Travel spring: horizontal sway per slot
      var slotSpringX = travelSpring * _SPRING_SCALE[si] * fontSize * 0.5;
      // Attack lunge: Y offset (torso dips forward most)
      var slotLungeY = lungePhase * _LUNGE_SCALE[si] * fontSize * -0.3;
      var slotY = centerY + _SLOT_Y[si] * spriteH + slotBob + slotLungeY;
      var slotX = screenX + slotSpringX;

      // ── Back sub-layers (render behind this slot) ──
      if (si === 0 && stack.hat && stack.hat.behind) {
        _renderSubLayer(ctx, stack.hat.emoji, slotX + hatShiftX, slotY - fontSize * 0.4,
                        fontSize * stack.hat.scale * 1.5, sx, ySquish);
      }
      if (si === 1 && stack.backWeapon && showBackWeapon && !backWeaponOnTop) {
        // Position with offsetX (fraction of spriteW) — mirrors frontWeapon pattern.
        // bwSx reduces Euler squish (weapon perpendicular to body plane).
        var bwBehindX = slotX + spriteW * (stack.backWeapon.offsetX || 0.3);
        _renderSubLayer(ctx, stack.backWeapon.emoji, bwBehindX, slotY,
                        fontSize * (stack.backWeapon.scale || 0.4), bwSx, ySquish);
      }

      // ── Slot modifiers (behind main emoji) ──
      if (mods[si]) {
        for (var mi = 0; mi < mods[si].length; mi++) {
          var mod = mods[si][mi];
          var modX = slotX + spriteW * (mod.offsetX || 0);
          var modY = slotY + spriteH * (mod.offsetY || 0);
          _renderSubLayer(ctx, mod.emoji, modX, modY,
                          fontSize * (mod.scale || 0.4), sx, ySquish);
        }
      }

      // ── Main slot emoji ──
      // Determine if this slot should receive hue tint (clothes only by default)
      var hasHueTint   = (stack.tintHue !== null && stack.tintHue !== undefined);
      var hasColorTint = !!(stack.tintColor && typeof stack.tintColor.r === 'number');
      var wantTint = ((hasHueTint || hasColorTint) && spriteH > 10);
      if (wantTint) {
        var tSlots = stack.tintSlots || _DEFAULT_TINT_SLOTS;
        wantTint = !!tSlots[si];
      }

      ctx.save();
      ctx.translate(slotX, slotY);
      var slotSx = sx;
      var slotSy = ySquish;
      // Head: dim + Y-squash when facing away
      if (si === 0) {
        if (headDim < 1) ctx.globalAlpha *= headDim;
        if (headSquash < 1) slotSy *= headSquash;
      }
      if (slotSx !== 1 || slotSy !== 1) ctx.scale(slotSx, slotSy);

      if (wantTint) {
        // ── Per-glyph tint: draw emoji on offscreen canvas, color
        //    only the glyph pixels via source-atop, then composite back.
        var tSize = Math.ceil(fontSize * 2.5);
        var tHalf = tSize * 0.5;
        var tc = _ensureTintCanvas(tSize);
        tc.clearRect(0, 0, tSize, tSize);

        // 1) Draw emoji centered on scratch canvas
        tc.globalCompositeOperation = 'source-over';
        tc.globalAlpha = 1;
        tc.font = fontSize + 'px serif';
        tc.textAlign = 'center';
        tc.textBaseline = 'middle';
        tc.fillText(slotEmoji, tHalf, tHalf);

        // 2) Paint hue ONLY on glyph pixels (source-atop)
        //    Stacks may override with a direct tintColor (e.g. pure black
        //    for hero antagonists) and a stronger tintAlpha to achieve a
        //    true darken/black wash that hue rotation cannot produce.
        tc.globalCompositeOperation = 'source-atop';
        tc.globalAlpha = (typeof stack.tintAlpha === 'number') ? stack.tintAlpha : 0.22;
        var rgb;
        if (stack.tintColor && typeof stack.tintColor.r === 'number') {
          rgb = stack.tintColor;
        } else {
          rgb = _hueToRgb(stack.tintHue);
        }
        tc.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
        tc.fillRect(0, 0, tSize, tSize);

        // 3) Reset scratch state
        tc.globalCompositeOperation = 'source-over';
        tc.globalAlpha = 1;

        // 4) Draw tinted result onto main canvas (inherits transform).
        //    Use 9-arg drawImage to sample only the tSize×tSize region —
        //    _tintCanvas may be larger from a prior sprite, and the 4-arg
        //    form maps the FULL canvas into the destination, shifting the
        //    emoji off-center.
        ctx.drawImage(_tintCanvas, 0, 0, tSize, tSize, -tHalf, -tHalf, tSize, tSize);
      } else {
        ctx.font = fontSize + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slotEmoji, 0, 0);
      }
      ctx.restore();

      // ── Front sub-layers (render over this slot) ──
      if (si === 0 && stack.hat && !stack.hat.behind) {
        _renderSubLayer(ctx, stack.hat.emoji, slotX + hatShiftX, slotY - fontSize * 0.4,
                        fontSize * stack.hat.scale * 1.5, sx, ySquish);
      }
      if (si === 1 && stack.frontWeapon && showFrontWeapon) {
        var fwX = slotX + spriteW * stack.frontWeapon.offsetX;
        _renderSubLayer(ctx, stack.frontWeapon.emoji, fwX, slotY,
                        fontSize * stack.frontWeapon.scale * weaponFore, sx, ySquish);
      }
    }

    // ── Back weapon ON TOP pass (NPC facing away → weapon at highest z) ──
    if (stack.backWeapon && showBackWeapon && backWeaponOnTop) {
      var bwTopY = centerY + _SLOT_Y[1] * spriteH + (baseBob * _SLOT_BOB[1]);
      var bwTopX = screenX + travelSpring * _SPRING_SCALE[1] * fontSize * 0.5
                 + spriteW * (stack.backWeapon.offsetX || 0.3);
      _renderSubLayer(ctx, stack.backWeapon.emoji, bwTopX, bwTopY,
                      fontSize * (stack.backWeapon.scale || 0.4), bwSx, ySquish);
    }

    // ── Status effect hue overlay (poison green, frozen blue, etc.) ──
    if (statusHue >= 0 && statusAlpha > 0 && spriteH > 6) {
      var sRgb = _hueToRgb(statusHue);
      ctx.save();
      ctx.globalAlpha = statusAlpha;
      ctx.fillStyle = 'rgb(' + sRgb.r + ',' + sRgb.g + ',' + sRgb.b + ')';
      ctx.fillRect(screenX - spriteW * 0.45, centerY - spriteH * 0.45,
                   spriteW * 0.9, spriteH * 0.9);
      ctx.restore();
    }

    // ── Damage white flash (all slots flash white on hit) ──
    if ((flashWhite || dotFlash) && spriteH > 6) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = flashWhite ? 0.6 : 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(screenX - spriteW * 0.45, centerY - spriteH * 0.45,
                   spriteW * 0.9, spriteH * 0.9);
      ctx.restore();
    }
  }

  /**
   * Render a corpse pile — scattered stack slots on the ground plane.
   * Each slot emoji is drawn at its pile offset with resting rotation.
   */
  function _renderCorpsePile(ctx, pile, screenX, centerY, spriteH, ySquish) {
    var fontSize = Math.max(6, Math.floor(spriteH * _SLOT_FONT));
    var dir = pile.dir || 1;
    var slots = pile.slots;

    for (var si = 0; si < slots.length; si++) {
      if (!slots[si]) continue;
      var px = screenX + pile.pileX[si] * dir * spriteH * 0.4;
      var py = centerY + pile.pileY[si] * spriteH * 0.2;
      var rot = pile.pileRot[si] * dir;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      if (ySquish !== 1) ctx.scale(1, ySquish);
      ctx.globalAlpha = 0.85;
      ctx.font = Math.floor(fontSize * 0.9) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slots[si], 0, 0);
      ctx.restore();
    }

    // Detached accessories (hat, weapon) at scattered offsets
    if (pile.hat) {
      var hatX = screenX + dir * spriteH * 0.25;
      var hatY = centerY - spriteH * 0.1;
      ctx.save();
      ctx.translate(hatX, hatY);
      ctx.rotate(dir * 0.4);
      if (ySquish !== 1) ctx.scale(1, ySquish);
      ctx.globalAlpha = 0.7;
      ctx.font = Math.floor(fontSize * (pile.hatScale || 0.5)) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pile.hat, 0, 0);
      ctx.restore();
    }
    if (pile.frontWeapon) {
      var wpnX = screenX - dir * spriteH * 0.3;
      var wpnY = centerY + spriteH * 0.05;
      ctx.save();
      ctx.translate(wpnX, wpnY);
      ctx.rotate(-dir * 0.5);
      if (ySquish !== 1) ctx.scale(1, ySquish);
      ctx.globalAlpha = 0.75;
      ctx.font = Math.floor(fontSize * (pile.frontWeaponScale || 0.65)) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pile.frontWeapon, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Render a sub-layer emoji (hat, weapon, modifier) at given position/scale.
   */
  function _renderSubLayer(ctx, emoji, x, y, fontSize, hSquish, ySquish) {
    if (!emoji) return;
    ctx.save();
    ctx.translate(x, y);
    var sx = hSquish < 0.98 ? hSquish : 1;
    if (sx !== 1 || ySquish !== 1) ctx.scale(sx, ySquish);
    ctx.font = Math.max(6, Math.floor(fontSize)) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  /**
   * Convert a hue (0-360) to an RGB object for tint overlay.
   */
  function _hueToRgb(hue) {
    // HSL to RGB with S=100%, L=50%
    var h = hue / 60;
    var c = 255;
    var x = Math.floor(c * (1 - Math.abs(h % 2 - 1)));
    if (h < 1) return { r: c, g: x, b: 0 };
    if (h < 2) return { r: x, g: c, b: 0 };
    if (h < 3) return { r: 0, g: c, b: x };
    if (h < 4) return { r: 0, g: x, b: c };
    if (h < 5) return { r: x, g: 0, b: c };
    return { r: c, g: 0, b: x };
  }

  // ── Main sprite pass ─────────────────────────────────────────────
  // Sorts visible sprites far→near and billboards each one. Reads the
  // z-buffer and pedestal arrays for occlusion but never writes them.
  function renderSprites(ctx, px, py, pDir, halfFov, w, h, halfH, sprites, renderDist, fogDist, fogColor, minDist, maxDist) {
    var contract = _s ? _s.contract() : null;
    var zBuffer  = _s ? _s.zBuffer()  : null;
    var peds     = _s ? _s.pedBuffers() : null;
    var pedDist  = peds ? peds.dist : null;
    var pedTopY  = peds ? peds.topY : null;
    var pedMX    = peds ? peds.mx   : null;
    var pedMY    = peds ? peds.my   : null;

    // Optional distance window — lets callers split sprite rendering
    // into "distant" and "near" passes sandwiching the terminus fog
    // veil so close sprites punch through the horizon band. Defaults
    // to no filter (render everything in the normal render distance).
    var _tanHF = Math.tan(halfFov);
    var hasMin = (typeof minDist === 'number');
    var hasMax = (typeof maxDist === 'number');
    var sorted = [];
    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      // Skip sprites that have a CSS DOM overlay (SpriteLayer handles them)
      if (s.domSprite) continue;
      var dx = (s.x + 0.5) - px;
      var dy = (s.y + 0.5) - py;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3 || dist > renderDist) continue;
      if (hasMin && dist <  minDist) continue;
      if (hasMax && dist >= maxDist) continue;

      var angle = Math.atan2(dy, dx) - pDir;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      if (Math.abs(angle) > halfFov + 0.3) continue;

      sorted.push({ sprite: s, dist: dist, angle: angle, dx: dx, dy: dy });
    }

    sorted.sort(function (a, b) { return b.dist - a.dist; });

    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i];
      var s = item.sprite;
      var dist = item.dist;
      var angle = item.angle;

      // Perspective-correct column: exact inverse of DDA's atan mapping.
      var screenX = Math.floor((1 + Math.tan(angle) / _tanHF) * w / 2);
      var baseScale = (s.scale || 0.6) / dist;
      // Pulse effect: scaleAdd oscillates 0..max, adds to base scale
      var pulseAdd = s.scaleAdd || 0;
      var scale = baseScale + pulseAdd / dist;
      var spriteH = Math.floor(h * scale);
      var spriteW = spriteH;
      // Bob effect: vertical oscillation (world-space px scaled by distance)
      var bobOffset = s.bobY ? Math.floor(s.bobY * h / dist * 0.15) : 0;

      // ── Euler flattening: narrow sprites at perpendicular facing ──
      // Dot product of facing vs enemy→player gives front/back (|1|)
      // vs side (0). Side-facing sprites appear narrower, like turning
      // a paper cutout. Uses cos²-shaped curve for smooth roll-off.
      if (s.facing) {
        var fv = _FACE_VEC[s.facing];
        if (fv && dist > 0.01) {
          var invD = 1 / dist;
          var ex = -item.dx * invD;
          var ey = -item.dy * invD;
          var faceDot = fv[0] * ex + fv[1] * ey;
          // |dot|=1 → front/back (full width), 0 → perpendicular (narrow)
          // flatScale: 0.55 at perpendicular, 1.0 at front/back
          var absDot = Math.abs(faceDot);
          var flatScale = 0.55 + 0.45 * absDot * absDot; // cos²-ish
          spriteW = Math.floor(spriteW * flatScale);
        }
      }

      var drawX = screenX - spriteW / 2;

      // Z-buffer check
      var startCol = Math.max(0, Math.floor(drawX));
      var endCol = Math.min(w - 1, Math.floor(drawX + spriteW));
      var visible = false;
      for (var col = startCol; col <= endCol; col++) {
        if (zBuffer[col] > dist) { visible = true; break; }
      }
      if (!visible) continue;

      var fogFactor = contract
        ? SpatialContract.getFogFactor(contract, dist, renderDist, fogDist)
        : Math.min(1, dist / fogDist);
      // Interactive/solid sprites (mailbox, bonfire ring) stay opaque —
      // fog fade on close-range interactables looks like a rendering bug.
      var alpha = s.noFogFade ? 1.0 : Math.max(0.1, 1 - fogFactor);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Sprite center Y with bob displacement
      // Ground-level sprites (corpses, items) render at floor plane
      var groundShift = s.groundLevel ? Math.floor(spriteH * 0.35) : 0;
      // yAlt: world-space altitude above player eye plane (positive = up).
      // 1 world unit projects to (h / dist) screen px — same scale the
      // raycaster uses for wall top/bottom. Used by window vignettes so
      // emoji render at a table or sill height inside the cavity instead
      // of pinned to the horizon.
      var yAltShift = s.yAlt ? Math.floor(s.yAlt * h / dist) : 0;
      var spriteCenterY = halfH + bobOffset + groundShift - yAltShift;

      // Billboard tilt for ground sprites (origami corpse / Paper Mario style)
      // Y-scale compresses to ~40% so they look like flat objects on the floor,
      // with a slight tilt toward the player for visibility from distance.
      // Closer corpses appear flatter; distant ones tilt more upward.
      var ySquish = 1;
      if (s.groundTilt) {
        var tiltBase = 0.35;  // Minimum Y scale (very flat)
        var tiltLift = Math.min(0.25, 0.8 / (dist + 0.5)); // Lift more when close
        ySquish = tiltBase + tiltLift;
      }

      // ── Glow halo (drawn behind sprite) ─────────────────────────
      // Radial gradient with multi-stop falloff for soft orb-like
      // light spill. Matches the silhouette glow pattern for visual
      // consistency with fog-tinted creature rendering and cavity glow.
      if (s.glow && s.glowRadius && spriteH > 4) {
        var glowRad = Math.floor(spriteH * 0.5 + s.glowRadius / dist * 8);
        var sgAlpha = alpha * 0.35;
        // Parse glow color: accepts '#rrggbb' or 'rgba(r,g,b,a)'
        var sgRGB = _parseGlowRGB(s.glow);
        var sgGrad = ctx.createRadialGradient(screenX, spriteCenterY, 0, screenX, spriteCenterY, glowRad);
        sgGrad.addColorStop(0, 'rgba(' + sgRGB + ',' + sgAlpha.toFixed(3) + ')');
        sgGrad.addColorStop(0.5, 'rgba(' + sgRGB + ',' + (sgAlpha * 0.4).toFixed(3) + ')');
        sgGrad.addColorStop(1, 'rgba(' + sgRGB + ',0)');
        ctx.fillStyle = sgGrad;
        ctx.fillRect(screenX - glowRad, spriteCenterY - glowRad, glowRad * 2, glowRad * 2);
      }

      // Horizontal squish ratio for perpendicular flattening
      var hSquish = spriteH > 0 ? spriteW / spriteH : 1;

      // ── Pedestal occlusion (sprite behind a freeform stone base) ──
      // Scan the columns the sprite spans; if any column has a
      // freeform pedestal in front of the sprite AND that pedestal
      // is NOT in the same grid cell as the sprite, clip the
      // sprite's bottom at the tightest pedestal-top screen row.
      // Same-cell sprites (HEARTH dragonfire emoji, future bonfire
      // glow billboards) skip the clip so they can render through
      // the cavity band.
      var _pedClipped = false;
      var _pedClipY = Infinity;
      var _spriteMX = Math.floor(s.x);
      var _spriteMY = Math.floor(s.y);
      if (pedDist) {
        for (var _pcol = startCol; _pcol <= endCol; _pcol++) {
          var _pd = pedDist[_pcol];
          if (_pd > 0 && _pd < dist) {
            // Different tile than the sprite → pedestal occludes.
            if (pedMX[_pcol] !== _spriteMX ||
                pedMY[_pcol] !== _spriteMY) {
              var _py2 = pedTopY[_pcol];
              if (_py2 < _pedClipY) _pedClipY = _py2;
            }
          }
        }
      }
      if (_pedClipY < Infinity) {
        var _spriteBottom = spriteCenterY + spriteH * 0.5 * ySquish;
        if (_pedClipY < _spriteBottom) {
          ctx.save();
          ctx.beginPath();
          // Clip the sprite's draw region to rows ABOVE the pedestal
          // top. Extra horizontal padding lets overhead capsule/glow
          // render outside the raw sprite rect without re-clipping.
          ctx.rect(screenX - spriteW, 0, spriteW * 2, _pedClipY);
          ctx.clip();
          _pedClipped = true;
        }
      }

      // ── Counter occlusion (vendor behind half-height counter) ──
      var _counterClipped = false;
      if (s.counterOcclude && s.stack && spriteH > 6) {
        ctx.save();
        ctx.beginPath();
        // Clip to upper 60% of sprite — legs hidden by counter tile
        var clipTop = spriteCenterY - spriteH * 0.5;
        ctx.rect(screenX - spriteW, clipTop, spriteW * 2, spriteH * 0.6);
        ctx.clip();
        _counterClipped = true;
      }

      if (s.stack && spriteH > 6 && s.stackFX && s.stackFX.sleeping) {
        // ── Sleeping stack: render as pile (like corpse) ────────
        var sleepPile = {
          slots: [s.stack.head, s.stack.torso, s.stack.legs],
          dir: 1,
          pileX: [-0.3, 0.1, 0.35],
          pileY: [0.15, 0.0, -0.1],
          pileRot: [0.12, 0.08, 0.04],
          hat: s.stack.hat ? s.stack.hat.emoji : null,
          hatScale: s.stack.hat ? s.stack.hat.scale : 0.5,
          frontWeapon: s.stack.frontWeapon ? s.stack.frontWeapon.emoji : null,
          frontWeaponScale: s.stack.frontWeapon ? s.stack.frontWeapon.scale : 0.65
        };
        _renderCorpsePile(ctx, sleepPile, screenX, spriteCenterY, spriteH, ySquish);
      } else if (s.stack && spriteH > 6) {
        // ── Triple emoji stack rendering ──────────────────────────
        _renderStack(ctx, s.stack, screenX, spriteCenterY, spriteH, spriteW,
                     hSquish, ySquish, s.facing, item, bobOffset, s.stackFX);
      } else if (s.corpseStack && spriteH > 4) {
        // ── Corpse pile: scattered stack slots on ground ─────────
        _renderCorpsePile(ctx, s.corpseStack, screenX, spriteCenterY, spriteH, ySquish);
      } else if (s.emoji) {
        ctx.save();
        ctx.translate(screenX, spriteCenterY);
        var sx = hSquish < 0.98 ? hSquish : 1;
        if (sx !== 1 || ySquish !== 1) ctx.scale(sx, ySquish);
        ctx.font = Math.floor(spriteH * 0.8) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, 0, 0);
        // Overlay emoji (e.g. translucent 🐉 over 🔥 for dragonfire)
        if (s.emojiOverlay) {
          var ov = s.emojiOverlay;
          var prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = prevAlpha * (ov.opacity || 0.5);
          var ovScale = ov.scale || 1.0;
          if (ovScale !== 1.0) ctx.scale(ovScale, ovScale);
          ctx.font = Math.floor(spriteH * 0.8 / ovScale) + 'px serif';
          ctx.fillText(ov.emoji, ov.offX || 0, ov.offY || 0);
          ctx.globalAlpha = prevAlpha;
        }
        ctx.restore();
      } else if (s.color) {
        ctx.fillStyle = s.color;
        ctx.fillRect(drawX, spriteCenterY - spriteH / 2, spriteW, spriteH * ySquish);
      }

      // Close counter occlusion clip if active
      if (_counterClipped) {
        ctx.restore();
      }
      // Close pedestal occlusion clip if active (restored after
      // counter clip so the two nested save/restores stay balanced).
      if (_pedClipped) {
        ctx.restore();
      }

      // ── Tint overlay ───────────────────────────────────────────
      if (s.tint && spriteH > 4) {
        ctx.fillStyle = s.tint;
        ctx.fillRect(
          screenX - spriteW * 0.45,
          spriteCenterY - spriteH * 0.45,
          spriteW * 0.9,
          spriteH * 0.9
        );
      }

      // ── Directional facing shade ──────────────────────────────
      // Darken sprites facing away from the player. The dot product
      // of the enemy's facing vector and the enemy→player vector
      // gives -1 (back) to +1 (front). We map that to a 0→max
      // darkness overlay, giving implied depth and pathing.
      //
      // Exterior floors (ceilingType === 'sky') get an additional
      // radial center-fade that implies the featureless back of the
      // emoji — a soft silhouette where the center washes out to a
      // color-averaged blur while the edges retain some definition.
      if (s.facing && spriteH > 0 && !s.friendly) {
        // Skip directional shading for friendly NPCs — they should always
        // be clearly visible regardless of facing direction.
        var fv3 = _FACE_VEC[s.facing];
        if (fv3) {
          var invDist = 1 / dist;
          var etpX = -item.dx * invDist;
          var etpY = -item.dy * invDist;
          var dot = fv3[0] * etpX + fv3[1] * etpY;
          var darkness = (1 - dot) * 0.5 * FACING_DARK_MAX;

          if (darkness > 0.01) {
            var isExterior = contract && contract.ceilingType === 'sky';
            var backFactor = Math.max(0, -dot);   // 0 when front, 1 when directly away

            if (isExterior && backFactor > 0.2) {
              // ── Exterior back-of-sprite: radial silhouette ──
              // A radial gradient that is opaque at center and transparent
              // at edges — the emoji's details vanish in the middle while
              // the silhouette outline persists. Combined with fog color
              // so the back blends into the environment.
              var silAlpha = Math.min(0.65, backFactor * 0.7);
              var fogR = fogColor ? fogColor.r : 0;
              var fogG = fogColor ? fogColor.g : 0;
              var fogB = fogColor ? fogColor.b : 0;
              var silR = Math.round(fogR * 0.4);
              var silG = Math.round(fogG * 0.4);
              var silB = Math.round(fogB * 0.4);
              var sX = screenX;
              var sY = spriteCenterY;
              var sR = Math.max(spriteW, spriteH) * 0.45;
              var grad = ctx.createRadialGradient(sX, sY, 0, sX, sY, sR);
              grad.addColorStop(0, 'rgba(' + silR + ',' + silG + ',' + silB + ',' + silAlpha.toFixed(3) + ')');
              grad.addColorStop(0.6, 'rgba(' + silR + ',' + silG + ',' + silB + ',' + (silAlpha * 0.4).toFixed(3) + ')');
              grad.addColorStop(1, 'rgba(' + silR + ',' + silG + ',' + silB + ',0)');
              ctx.globalAlpha = 1;
              ctx.fillStyle = grad;
              ctx.fillRect(
                screenX - spriteW * 0.5,
                spriteCenterY - spriteH * 0.5,
                spriteW, spriteH
              );
            } else {
              // ── Interior / dungeon: flat darkness overlay ──
              ctx.globalAlpha = 1;
              ctx.fillStyle = 'rgba(0,0,0,' + darkness.toFixed(3) + ')';
              ctx.fillRect(
                screenX - spriteW * 0.45,
                spriteCenterY - spriteH * 0.45,
                spriteW * 0.9,
                spriteH * 0.9
              );
            }
          }
        }
      }

      // ── Particle FX (status emoji floating upward) ──────────────
      // Lightweight: spawn particles into a shared pool, render with
      // the sprite's screen coordinates. Pool lives on the module.
      if (s.particleEmoji && spriteH > 10) {
        _emitParticle(s.particleEmoji, screenX, spriteCenterY, spriteH, dist, alpha);
      }

      // ── Status overlay text (BURN, PARA, ATK+, etc.) ────────────
      if (s.overlayText && spriteH > 12) {
        var olSize = Math.max(8, Math.floor(spriteH * 0.22));
        ctx.globalAlpha = alpha * 0.85;
        ctx.font = 'bold ' + olSize + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Dark outline for readability
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeText(s.overlayText, screenX, spriteCenterY - spriteH * 0.45);
        ctx.fillStyle = '#fff';
        ctx.fillText(s.overlayText, screenX, spriteCenterY - spriteH * 0.45);
      }

      // ── Kaomoji capsule (intent + speech) above head ──────────────
      // Replaces old floating emoji intent glyph with a pill-shaped
      // capsule containing animated kaomoji text.
      var _capsuleRendered = false;
      if (typeof KaomojiCapsule !== 'undefined' && s.id !== undefined && spriteH > 12) {
        var capsuleNow = performance.now();
        var capData = KaomojiCapsule.getRenderData(s.id, capsuleNow);
        if (capData && capData.text) {
          _capsuleRendered = true;
          var cbobPhase = (capsuleNow * 0.001 * OVERHEAD_BOB_FREQ * Math.PI * 2);
          var cbob = Math.sin(cbobPhase) * OVERHEAD_BOB_AMP / dist;

          // Position capsule above head slot (or above single-emoji sprite)
          var capsuleBaseY = s.stack
            ? spriteCenterY - spriteH * 0.28 // head slot Y
            : spriteCenterY;
          var capsuleY = capsuleBaseY - spriteH * 0.32 + cbob;

          // Capsule dimensions scale with sprite height
          var capFontSize = Math.max(8, Math.floor(spriteH * 0.18));
          var textWidth = capData.text.length * capFontSize * 0.55;
          var capsuleW = Math.max(textWidth + capFontSize * 0.8, spriteH * 0.35);
          var capsuleH = capFontSize * 1.4;
          var capR = capsuleH / 2; // Corner radius = half height (full pill)

          // Background pill
          ctx.save();
          ctx.globalAlpha = alpha * capData.alpha * 0.5;
          ctx.fillStyle = 'rgba(' + capData.bgR + ',' + capData.bgG + ',' + capData.bgB + ',0.55)';
          ctx.beginPath();
          // Rounded rect as pill shape
          var cx1 = screenX - capsuleW / 2;
          var cy1 = capsuleY - capsuleH / 2;
          if (ctx.roundRect) {
            ctx.roundRect(cx1, cy1, capsuleW, capsuleH, capR);
          } else {
            // Fallback for browsers without roundRect
            ctx.moveTo(cx1 + capR, cy1);
            ctx.lineTo(cx1 + capsuleW - capR, cy1);
            ctx.arcTo(cx1 + capsuleW, cy1, cx1 + capsuleW, cy1 + capR, capR);
            ctx.lineTo(cx1 + capsuleW, cy1 + capsuleH - capR);
            ctx.arcTo(cx1 + capsuleW, cy1 + capsuleH, cx1 + capsuleW - capR, cy1 + capsuleH, capR);
            ctx.lineTo(cx1 + capR, cy1 + capsuleH);
            ctx.arcTo(cx1, cy1 + capsuleH, cx1, cy1 + capsuleH - capR, capR);
            ctx.lineTo(cx1, cy1 + capR);
            ctx.arcTo(cx1, cy1, cx1 + capR, cy1, capR);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Kaomoji text
          ctx.save();
          ctx.globalAlpha = alpha * capData.alpha * 0.95;
          ctx.font = 'bold ' + capFontSize + 'px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Dark outline for readability
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeText(capData.text, screenX, capsuleY);
          ctx.fillStyle = '#fff';
          ctx.fillText(capData.text, screenX, capsuleY);
          ctx.restore();
        }
      }

      // ── Card stack telegraph (rendered below capsule during combat) ──
      if (typeof EnemyIntent !== 'undefined' && EnemyIntent.isActive() && spriteH > 18) {
        var intentData = EnemyIntent.getRenderData();
        if (intentData && s.id !== undefined && intentData.enemyId === s.id && intentData.greed > 0) {
          _capsuleRendered = true;
          var csNow = Date.now();
          var csBobPhase = (csNow * 0.001 * OVERHEAD_BOB_FREQ * Math.PI * 2);
          var csBob = Math.sin(csBobPhase) * OVERHEAD_BOB_AMP / dist;
          var csBaseY = s.stack
            ? spriteCenterY - spriteH * 0.28
            : spriteCenterY;
          var csOverheadY = csBaseY - spriteH * 0.32 + csBob;

          var slotSize = Math.max(8, Math.floor(spriteH * 0.18));
          var slotGap = Math.max(2, Math.floor(slotSize * 0.25));
          var totalW = intentData.greed * slotSize + (intentData.greed - 1) * slotGap;
          // Card row sits above the capsule
          var cardRowY = csOverheadY - slotSize * 0.9;
          var stackStartX = screenX - totalW * 0.5;

          ctx.font = slotSize + 'px serif';
          ctx.textBaseline = 'bottom';
          ctx.textAlign = 'center';

          for (var ci = 0; ci < intentData.greed; ci++) {
            var slotCX = stackStartX + ci * (slotSize + slotGap) + slotSize * 0.5;

            if (ci < intentData.cardEmojis.length) {
              ctx.globalAlpha = alpha * 0.9;
              ctx.fillText(intentData.cardEmojis[ci], slotCX, cardRowY);
            } else {
              ctx.globalAlpha = alpha * 0.3;
              ctx.fillStyle = 'rgba(255,255,255,0.4)';
              ctx.fillRect(
                slotCX - slotSize * 0.35,
                cardRowY - slotSize * 0.8,
                slotSize * 0.7,
                slotSize * 0.7
              );
            }
          }

          // Ready pulse (stack full — flashing warning)
          if (intentData.ready) {
            var csPulse = (Math.sin(csNow * 0.008) * 0.5 + 0.5);
            ctx.globalAlpha = alpha * 0.25 * csPulse;
            ctx.fillStyle = '#ff4040';
            ctx.fillRect(
              stackStartX - slotGap,
              cardRowY - slotSize,
              totalW + slotGap * 2,
              slotSize * 1.1
            );
          }
        }
      }

      // Exploration awareness glyph (only when capsule is NOT shown)
      // Friendly entities (Dispatcher, vendors, quest givers) never show the
      // hostile ❓/❗/⚔ ladder even if their awareness field gets nudged —
      // they're not threats, so painting an alert indicator would lie to the
      // player. Gated here in addition to the EnemyAI skip in game.js so the
      // visual stays quiet regardless of how awareness was mutated.
      if (!_capsuleRendered && !s.friendly && s.awareness !== undefined && spriteH > 8) {
        var awarenessState = typeof EnemyAI !== 'undefined'
          ? EnemyAI.getAwarenessState(s.awareness)
          : null;
        if (awarenessState && awarenessState.label !== 'Unaware') {
          var glyphInfo = _AWARENESS_GLYPHS[awarenessState.label];
          if (glyphInfo) {
            var overheadY = spriteCenterY - spriteH * 0.55;
            var bobPhase = (Date.now() * 0.001 * OVERHEAD_BOB_FREQ * Math.PI * 2);
            var bob = Math.sin(bobPhase) * OVERHEAD_BOB_AMP / dist;

            var glyphSize = Math.max(10, Math.floor(spriteH * 0.35));
            ctx.globalAlpha = alpha * 0.9;
            ctx.font = glyphSize + 'px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(glyphInfo.glyph, screenX, overheadY + bob);
          }
        }
      }

      ctx.restore();
    }
  }

  return Object.freeze({
    bind: bind,
    renderSprites: renderSprites,
    renderWallDecor: renderWallDecor,
    updateAndRenderParticles: updateAndRenderParticles
  });
})();

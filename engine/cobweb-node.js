/**
 * CobwebNode — Node highlight and spider deployment workflow.
 *
 * During dungeon crawl (nested-dungeon floors, depth ≥ 3), renders small
 * glowing "installation nodes" at eligible corridor positions managed by
 * CobwebSystem. Nodes mark spots where the player can deploy a spider to
 * install a cobweb barrier.
 *
 * Workflow:
 *   1. CobwebNode.update(dt, floorId) scans eligible positions each frame.
 *   2. When the player faces an eligible, unoccupied tile, a spider-deployment
 *      prompt fades in above the InteractPrompt zone.
 *   3. Pressing [OK] / clicking the prompt calls CobwebNode.tryInteract(floorId),
 *      which delegates to CobwebSystem.install() and plays a placement cue.
 *   4. CobwebNode.render() draws node glows in the 3D viewport, projected using
 *      the same billboard geometry as the raycaster sprite pass.
 *
 * ─── Integration Roadmap ───────────────────────────────────────────────────
 * Phase 1 (this file): Standalone module, no existing-file edits.
 *
 * Phase 2 — Wire into game.js (do not edit now):
 *   In _renderFrame(), after InteractPrompt.update(dt):
 *     CobwebNode.update(frameDt, FloorManager.getCurrentFloorId());
 *
 *   In _renderFrame(), after Raycaster.render(), before Minimap.render():
 *     CobwebRenderer.render(ctx, vpW, vpH, renderPlayer, floorId);
 *     CobwebNode.render(ctx, vpW, vpH, renderPlayer);
 *
 *   In _interact(), before the tile switch:
 *     if (CobwebNode.tryInteract(FloorManager.getCurrentFloorId())) return;
 *
 *   InteractPrompt check(): skip showing default prompt when
 *     CobwebNode.isPromptVisible() returns true (prevents overlap).
 *
 * Phase 3 — Readiness feedback:
 *   After CobwebSystem.install() succeeds, call:
 *     SessionStats.inc('cobwebsInstalled');
 *     Toast.show('🕷️ Cobweb installed (+' + CobwebSystem.READINESS_PER_COB + ' readiness)');
 *
 * Phase 4 — Node visual refinement:
 *   • Nodes rendered as textured spheres using a small offscreen canvas.
 *   • Nodes that would overlap a wall face are culled via z-buffer check.
 *   • Animate node glow on hover (pointer-based detection).
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Layer 3 — depends on: CobwebSystem (Layer 1), MovementController (Layer 1),
 *                        Player (Layer 3), FloorManager (Layer 3)
 */
var CobwebNode = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ────────────────────────────────────────────────────────
  var FOV       = Math.PI / 3;
  var HALF_FOV  = FOV / 2;

  var NODE_RADIUS   = 5;               // Base pixel radius for node dot
  var NODE_COLOR    = '#78e8a0';       // Lime-green core
  var NODE_GLOW     = 'rgba(80,220,120,0.30)'; // Soft halo colour
  var FADE_SPEED    = 140;             // ms for prompt fade-in
  var FADE_OUT_SPEED = 180;            // ms for prompt fade-out
  var MAX_NODE_DIST = 7;               // Tiles — nodes beyond this are not drawn

  // ── State ─────────────────────────────────────────────────────────
  var _visible       = [];    // { x, y } — eligible nodes visible this frame
  var _facingElig    = false; // Player is currently facing an eligible tile
  var _facingX       = -1;
  var _facingY       = -1;
  var _promptAlpha   = 0;
  var _pulseT        = 0;     // Running timer for pulse animation (ms)
  var _promptHitBox  = null;  // { x, y, w, h } for pointer click/hover
  var _promptHovered = false; // Pointer is over the prompt box
  var _lastFloorId   = null;  // Cached for handlePointerClick

  // ── Success flash state ──────────────────────────────────────────
  var _successFlashT  = 0;      // Remaining ms for success flash (0 = idle)
  var SUCCESS_FLASH_MS = 400;   // Duration of green flash after deploy

  // ── Manual dismiss state ─────────────────────────────────────────
  var _dismissed      = false;  // Player manually dismissed prompt (resets on turn-away)
  var _dismissHitBox  = null;   // { x, y, w, h } for [X] close button

  // ── Floor depth helper ────────────────────────────────────────────

  /** Returns depth level: "1" → 1, "1.1" → 2, "2.2.1" → 3, etc. */
  function _depth(floorId) {
    if (!floorId) return 0;
    return floorId.split('.').length;
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Update node visibility and prompt state.
   * Call once per frame from the game render loop.
   *
   * @param {number} dt      - Frame delta in milliseconds
   * @param {string} floorId - Current floor ID
   */
  function update(dt, floorId) {
    _pulseT += dt;

    // Tick success flash
    if (_successFlashT > 0) _successFlashT = Math.max(0, _successFlashT - dt);

    _visible    = [];
    var wasFacing = _facingElig;
    _facingElig = false;
    _facingX    = -1;
    _facingY    = -1;

    _lastFloorId = floorId;

    // PF-5 — Yield while a captured-input minigame owns the viewport.
    // Fade any active spider-deployment prompt out and skip the
    // facing/eligibility scan; the exit banner is the only UI that
    // should be visible during a Tier 2+ minigame.
    if (typeof MinigameExit !== 'undefined' && MinigameExit.isActive()) {
      _promptAlpha = Math.max(0, _promptAlpha - dt / FADE_OUT_SPEED);
      return;
    }

    // Nodes are only active in nested dungeons (depth ≥ 3)
    if (_depth(floorId) < 3) {
      _promptAlpha = Math.max(0, _promptAlpha - dt / FADE_OUT_SPEED);
      return;
    }

    if (typeof CobwebSystem === 'undefined' ||
        typeof FloorManager  === 'undefined') {
      _promptAlpha = Math.max(0, _promptAlpha - dt / FADE_OUT_SPEED);
      return;
    }

    var eligible = CobwebSystem.getEligible(floorId);
    if (!eligible.length) {
      _promptAlpha = Math.max(0, _promptAlpha - dt / FADE_OUT_SPEED);
      return;
    }

    // Grid position the player is currently facing
    var gridPos = MC.getGridPos();
    var dir     = gridPos.dir;
    var fx      = gridPos.x + MC.DX[dir];
    var fy      = gridPos.y + MC.DY[dir];

    for (var i = 0; i < eligible.length; i++) {
      var pos = eligible[i];
      // Skip positions that already have an intact cobweb
      if (CobwebSystem.hasAt(pos.x, pos.y, floorId)) continue;
      _visible.push({ x: pos.x, y: pos.y });
      if (pos.x === fx && pos.y === fy) {
        _facingElig = true;
        _facingX    = fx;
        _facingY    = fy;
      }
    }

    // Reset dismiss when player turns away from an eligible tile
    if (!_facingElig && wasFacing) {
      _dismissed = false;
    }

    // PF-4: rising-edge approach — when the player starts facing a fresh
    // eligible install node (not suppressed by a manual dismiss), ask the
    // status bar to collapse its expanded tooltip footer. collapseIfIdle()
    // respects dialogue state, so conversations stay open. Firing only on
    // the rising edge means the player can manually re-expand while
    // adjacent without us snapping it closed again.
    if (_facingElig && !wasFacing && !_dismissed) {
      if (typeof StatusBar !== 'undefined' && typeof StatusBar.collapseIfIdle === 'function') {
        StatusBar.collapseIfIdle();
      }
    }

    // Fade prompt in/out based on facing eligibility + dismiss state
    if (_facingElig && !_dismissed) {
      _promptAlpha = Math.min(1, _promptAlpha + dt / FADE_SPEED);
    } else {
      _promptAlpha = Math.max(0, _promptAlpha - dt / FADE_OUT_SPEED);
    }
  }

  /**
   * Render node glows and the spider-deployment prompt.
   * Call after Raycaster.render() and CobwebRenderer.render().
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW    - Viewport width
   * @param {number} vpH    - Viewport height
   * @param {Object} player - { x, y, dir } render-space player state
   */
  function render(ctx, vpW, vpH, player) {
    if (!player) return;

    var px   = player.x + 0.5;
    var py   = player.y + 0.5;
    var pDir = player.dir;

    // Draw eligible-position node highlights
    for (var i = 0; i < _visible.length; i++) {
      _renderNode(ctx, vpW, vpH, _visible[i], px, py, pDir);
    }

    // Draw spider-deployment prompt above the interact-prompt zone
    if (_promptAlpha > 0.01) {
      _renderPrompt(ctx, vpW, vpH);
    } else {
      _promptHitBox = null;
      _promptHovered = false;
    }
  }

  /**
   * Handle the [OK] / click interact when the player faces an eligible tile.
   * Deploys a spider to install a cobweb at the facing position.
   *
   * Returns true if a cobweb was installed so game.js _interact() can return
   * early without falling through to the default tile-switch.
   *
   * Phase 3 addition: after a successful install, fire:
   *   SessionStats.inc('cobwebsInstalled');
   *   Toast.show('🕷️ Cobweb installed (+5 readiness)');
   *
   * @param {string} floorId
   * @returns {boolean}
   */
  var SPIDER_ITEM_ID = 'ITM-115';

  /**
   * Count how many Silk Spiders the player currently has in bag.
   * @returns {number}
   */
  function _spiderCount() {
    if (typeof CardAuthority === 'undefined') return 0;
    var bag = CardAuthority.getBag();
    var count = 0;
    for (var i = 0; i < bag.length; i++) {
      if (bag[i] && bag[i].id === SPIDER_ITEM_ID) count++;
    }
    return count;
  }

  /**
   * Consume one Silk Spider from the player's bag.
   * @returns {boolean} true if consumed
   */
  function _consumeSpider() {
    if (typeof CardAuthority === 'undefined') return false;
    return !!CardAuthority.removeFromBagById(SPIDER_ITEM_ID);
  }

  function tryInteract(floorId) {
    if (!_facingElig || _facingX < 0) return false;
    if (typeof CobwebSystem === 'undefined') return false;
    if (_depth(floorId) < 3) return false;

    // Phase 2: require a Silk Spider consumable
    if (_spiderCount() <= 0) {
      if (typeof Toast !== 'undefined') {
        Toast.show(
          (typeof i18n !== 'undefined')
            ? i18n.t('cobweb.need_spider', 'Need a Silk Spider \uD83D\uDD77\uFE0F')
            : 'Need a Silk Spider \uD83D\uDD77\uFE0F',
          'warning'
        );
      }
      return false;
    }

    var ok = CobwebSystem.install(_facingX, _facingY, floorId, 'standalone');

    if (ok) {
      _consumeSpider();
      _successFlashT = SUCCESS_FLASH_MS;
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play('step', { volume: 0.4 });
      }
    }

    return ok;
  }

  /**
   * Get the player's current Silk Spider count. Used by prompt renderer.
   * @returns {number}
   */
  function getSpiderCount() {
    return _spiderCount();
  }

  /** True when the spider-deployment prompt is currently fading in/out. */
  function isPromptVisible() {
    return _promptAlpha > 0.05;
  }

  // ── Private rendering ─────────────────────────────────────────────

  /**
   * Project an eligible position to screen space and draw a glowing node.
   */
  function _renderNode(ctx, vpW, vpH, pos, px, py, pDir) {
    var wx   = pos.x + 0.5;
    var wy   = pos.y + 0.5;
    var dx   = wx - px;
    var dy   = wy - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1 || dist > MAX_NODE_DIST) return;

    var angle = Math.atan2(dy, dx) - pDir;
    while (angle >  Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    if (Math.abs(angle) > HALF_FOV + 0.05) return;

    var screenX = Math.floor(vpW / 2 + (angle / HALF_FOV) * (vpW / 2));
    var halfH   = vpH / 2;

    // Place the node at the floor/wall intersection — slightly below horizon
    var screenY = halfH + Math.floor(halfH * 0.92 / dist);

    // Pulse animation
    var pulse = 0.72 + 0.28 * Math.sin(_pulseT * 0.004);
    var r     = Math.max(2, Math.floor((NODE_RADIUS / dist) * 2.5 * pulse));

    // Fade out with distance
    var alpha = Math.min(0.9, 0.7 / (dist * 0.5)) * pulse;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow halo
    ctx.beginPath();
    ctx.arc(screenX, screenY, r * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = NODE_GLOW;
    ctx.fill();

    // Bright core dot
    ctx.beginPath();
    ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
    ctx.fillStyle = NODE_COLOR;
    ctx.fill();

    ctx.restore();
  }

  /**
   * Render the "[OK] 🕷️ Deploy Spider" prompt near the bottom of the viewport.
   * Features: success flash after deploy, [X] dismiss button, out-of-stock hint.
   * Stores hit boxes for pointer click/hover detection.
   */
  function _renderPrompt(ctx, vpW, vpH) {
    var sc = _spiderCount();
    var isFlashing = _successFlashT > 0;

    // ── Text content ───────────────────────────────────────────────
    var keyLbl = (typeof i18n !== 'undefined')
      ? i18n.t('interact.key', '[OK]')
      : '[OK]';

    var full;
    if (isFlashing) {
      full = '\u2714 Cobweb installed!  +2g';  // ✔ Cobweb installed!  +2g
    } else if (sc <= 0) {
      full = '\uD83D\uDD77\uFE0F No Silk Spiders';    // 🕷️ No Silk Spiders
    } else {
      var action = (typeof i18n !== 'undefined')
        ? i18n.t('cobweb.deploy', 'Deploy Spider')
        : 'Deploy Spider';
      full = '\uD83D\uDD77\uFE0F ' + action + '  +2g  (\u00D7' + sc + ')';
    }

    // ── Measure & layout ───────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = _promptAlpha;
    ctx.font        = 'bold 18px monospace';

    var keyW  = isFlashing ? 0 : ctx.measureText(keyLbl).width;
    ctx.font  = '18px monospace';
    var txtW  = ctx.measureText((isFlashing ? '' : ' ') + full).width;
    var PAD      = 20;
    var CLOSE_W  = 32;      // Width of [X] dismiss zone
    var BOX_W    = PAD * 2 + keyW + txtW + CLOSE_W;
    var BOX_H    = 48;
    var BOX_X    = (vpW - BOX_W) / 2;

    // PF-1: anchor box bottom just above the tooltip footer so the
    // [BACK] hint that renders at BOX_Y + BOX_H + 13 is also clear.
    // Footprint = BOX_H + ~14px hint line + 10px breathing room.
    var BOX_Y;
    if (typeof HUD !== 'undefined' && typeof HUD.getSafeBottom === 'function') {
      BOX_Y = HUD.getSafeBottom(vpH) - BOX_H - 24;
      if (BOX_Y < 0) BOX_Y = vpH - 140;  // defensive clamp
    } else {
      BOX_Y = vpH - 140;
    }

    // Store hit boxes
    _promptHitBox  = { x: BOX_X, y: BOX_Y, w: BOX_W - CLOSE_W, h: BOX_H };
    _dismissHitBox = { x: BOX_X + BOX_W - CLOSE_W, y: BOX_Y, w: CLOSE_W, h: BOX_H };

    // ── Pointer hover detection ────────────────────────────────────
    _promptHovered = false;
    var _dismissHovered = false;
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var ptr = InputManager.getPointer();
      if (ptr && ptr.active) {
        if (ptr.x >= _dismissHitBox.x && ptr.x <= _dismissHitBox.x + _dismissHitBox.w &&
            ptr.y >= _dismissHitBox.y && ptr.y <= _dismissHitBox.y + _dismissHitBox.h) {
          _dismissHovered = true;
        } else if (ptr.x >= BOX_X && ptr.x <= BOX_X + BOX_W &&
                   ptr.y >= BOX_Y && ptr.y <= BOX_Y + BOX_H) {
          _promptHovered = true;
        }
      }
    }

    // ── Background ─────────────────────────────────────────────────
    var flashT = isFlashing ? (_successFlashT / SUCCESS_FLASH_MS) : 0;
    var bgColor;
    if (isFlashing) {
      // Green flash that fades: bright green → dark
      var gr = Math.floor(40 + 60 * flashT);
      var gg = Math.floor(80 + 120 * flashT);
      bgColor = 'rgba(' + gr + ',' + gg + ',40,0.92)';
    } else if (_promptHovered) {
      bgColor = 'rgba(20,30,30,0.9)';
    } else {
      bgColor = 'rgba(10,8,18,0.82)';
    }

    _roundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 6);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // ── Border ─────────────────────────────────────────────────────
    var borderColor;
    if (isFlashing) {
      borderColor = '#80ff80';
    } else if (sc <= 0) {
      borderColor = '#886644';  // Dim / unavailable
    } else if (_promptHovered) {
      borderColor = '#aaffcc';
    } else {
      borderColor = NODE_COLOR;
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth   = (_promptHovered || isFlashing) ? 2 : 1;
    _roundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 6);
    ctx.stroke();

    // Hover / flash glow
    if (_promptHovered || isFlashing) {
      ctx.shadowColor = isFlashing ? '#80ff80' : NODE_COLOR;
      ctx.shadowBlur  = isFlashing ? (14 * flashT) : 10;
      _roundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 6);
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // ── Text ───────────────────────────────────────────────────────
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    var textX = BOX_X + PAD;

    if (isFlashing) {
      // Success text — bright green, bold
      ctx.font      = 'bold 18px monospace';
      ctx.fillStyle = '#b0ffb0';
      ctx.fillText(full, textX, BOX_Y + BOX_H / 2);
    } else {
      // [OK] label (gold, bold — dimmed when out of stock)
      ctx.font      = 'bold 18px monospace';
      ctx.fillStyle = sc <= 0 ? '#887744' : (_promptHovered ? '#ffe080' : '#f0d070');
      ctx.fillText(keyLbl, textX, BOX_Y + BOX_H / 2);

      // Action text (dimmed when out of stock)
      ctx.font      = '18px monospace';
      ctx.fillStyle = sc <= 0 ? '#776655' : (_promptHovered ? '#fff' : '#d8d0c0');
      ctx.fillText(' ' + full, textX + keyW, BOX_Y + BOX_H / 2);
    }

    // ── [X] dismiss button ─────────────────────────────────────────
    var closeX = BOX_X + BOX_W - CLOSE_W;
    // Vertical separator
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(closeX, BOX_Y + 8);
    ctx.lineTo(closeX, BOX_Y + BOX_H - 8);
    ctx.stroke();

    // X glyph
    ctx.font      = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = _dismissHovered ? '#ff8888' : 'rgba(255,255,255,0.45)';
    ctx.fillText('\u00D7', closeX + CLOSE_W / 2, BOX_Y + BOX_H / 2);  // ×

    // [BACK] hint below dismiss (small, faint)
    if (!isFlashing) {
      ctx.font      = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText('[BACK]', BOX_X + BOX_W - 6, BOX_Y + BOX_H + 13);
    }

    ctx.restore();
  }

  /**
   * Handle a pointer click on the deployment prompt or dismiss button.
   * Returns true if the click was consumed.
   */
  function handlePointerClick() {
    if (_promptAlpha < 0.05) return false;

    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var ptr = InputManager.getPointer();
      if (!ptr || !ptr.active) return false;

      // [X] dismiss button click
      if (_dismissHitBox &&
          ptr.x >= _dismissHitBox.x && ptr.x <= _dismissHitBox.x + _dismissHitBox.w &&
          ptr.y >= _dismissHitBox.y && ptr.y <= _dismissHitBox.y + _dismissHitBox.h) {
        _dismissed = true;
        return true;
      }

      // Deploy prompt click
      if (_promptHitBox && _facingElig &&
          ptr.x >= _promptHitBox.x && ptr.x <= _promptHitBox.x + _promptHitBox.w &&
          ptr.y >= _promptHitBox.y && ptr.y <= _promptHitBox.y + _promptHitBox.h) {
        if (_lastFloorId) {
          tryInteract(_lastFloorId);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Handle key input for the cobweb prompt.
   * BACK / Escape dismisses the prompt (hides it until player turns away).
   *
   * @param {string} key - 'Escape' | 'Backspace' | 'GoBack'
   * @returns {boolean} true if key was consumed
   */
  function handleKey(key) {
    if (_promptAlpha < 0.05) return false;
    if (key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'Back') {
      _dismissed = true;
      return true;
    }
    return false;
  }

  // ── Utility ───────────────────────────────────────────────────────

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return Object.freeze({
    update:             update,
    render:             render,
    tryInteract:        tryInteract,
    handlePointerClick: handlePointerClick,
    handleKey:          handleKey,
    isPromptVisible:    isPromptVisible,
    getSpiderCount:     getSpiderCount,
    SPIDER_ITEM_ID:     SPIDER_ITEM_ID
  });
})();

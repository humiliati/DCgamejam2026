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
    _visible    = [];
    _facingElig = false;
    _facingX    = -1;
    _facingY    = -1;

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

    // Fade prompt in/out based on facing eligibility
    if (_facingElig) {
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
  function tryInteract(floorId) {
    if (!_facingElig || _facingX < 0) return false;
    if (typeof CobwebSystem === 'undefined') return false;
    if (_depth(floorId) < 3) return false;

    var ok = CobwebSystem.install(_facingX, _facingY, floorId, 'standalone');

    if (ok && typeof AudioSystem !== 'undefined') {
      // Phase 2 integration: add 'cobweb_deploy' cue to AudioSystem.
      // Fallback to 'step' as placeholder until the cue is registered.
      AudioSystem.play('step', { volume: 0.4 });
    }

    return ok;
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
   */
  function _renderPrompt(ctx, vpW, vpH) {
    var keyLbl = (typeof i18n !== 'undefined')
      ? i18n.t('interact.key', '[OK]')
      : '[OK]';
    var action = (typeof i18n !== 'undefined')
      ? i18n.t('cobweb.deploy', 'Deploy Spider')
      : 'Deploy Spider';
    var full = '\uD83D\uDD77\uFE0F ' + action;  // 🕷️ Deploy Spider

    ctx.save();
    ctx.globalAlpha = _promptAlpha;
    ctx.font        = 'bold 18px monospace';

    var keyW  = ctx.measureText(keyLbl).width;
    ctx.font  = '18px monospace';
    var txtW  = ctx.measureText(' ' + full).width;
    var PAD   = 20;
    var BOX_W = PAD * 2 + keyW + txtW;
    var BOX_H = 48;
    var BOX_X = (vpW - BOX_W) / 2;
    var BOX_Y = vpH - 140;  // Sits above the standard InteractPrompt zone

    // Background panel
    _roundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 6);
    ctx.fillStyle = 'rgba(10,8,18,0.82)';
    ctx.fill();

    // Teal border matching node colour
    ctx.strokeStyle = NODE_COLOR;
    ctx.lineWidth   = 1;
    _roundRect(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, 6);
    ctx.stroke();

    // [OK] label (gold, bold)
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 18px monospace';
    ctx.fillStyle    = '#f0d070';
    ctx.fillText(keyLbl, BOX_X + PAD, BOX_Y + BOX_H / 2);

    // Action text (pale)
    ctx.font      = '18px monospace';
    ctx.fillStyle = '#d8d0c0';
    ctx.fillText(' ' + full, BOX_X + PAD + keyW, BOX_Y + BOX_H / 2);

    ctx.restore();
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
    update:          update,
    render:          render,
    tryInteract:     tryInteract,
    isPromptVisible: isPromptVisible
  });
})();

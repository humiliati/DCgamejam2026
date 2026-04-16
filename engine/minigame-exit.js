/**
 * MinigameExit — shared exit overlay for captured-input Tier 2+ minigames.
 *
 * Tier 1 clickies never capture WASD — the player walks away to dismiss.
 * Tier 2+ kinds that remap WASD for in-minigame use (SAFE_DIAL, LIGHTS_OUT,
 * TETRIS_STACK, MATCH_THREE, CARD_SOLITAIRE, etc.) need an explicit exit
 * affordance because movement-exit isn't available.
 *
 * This module renders:
 *   1. Top-edge input banner — chips of `[KEYS] label` so players know what
 *      the captured keys do. Anchored at HUD.getSafeTop(vpH) + 8.
 *   2. Bottom-right [×] corner target — 44×44 hitbox, Magic Remote-friendly.
 *      Anchored above the footer via HUD.getSafeBottom(vpH).
 *   3. 300ms entry grace — suppresses [×] clicks right after mount so a
 *      player who just clicked through to enter can't accidentally exit.
 *   4. Two-stage confirm — first [×]/Back prompts "Exit? Progress will be
 *      lost · [OK] Cancel  [BACK] Exit". Second Back commits; OK cancels;
 *      4s inactivity auto-cancels.
 *
 * Usage from a captured-input minigame:
 *
 *   MinigameExit.mount({
 *     kindId: 'SAFE_DIAL',
 *     controls: [
 *       { keys: ['←','→'], label: 'rotate' },
 *       { keys: ['OK'],     label: 'commit' },
 *       { keys: ['BACK'],   label: 'exit' }
 *     ],
 *     onExit: function(reason) { SafeDialMinigame.abandon(reason); }
 *   });
 *
 *   // Inside the minigame's own key handler:
 *   if (MinigameExit.handleKey(key)) return;   // exit overlay consumed it
 *   // ... minigame-specific key handling ...
 *
 *   // Inside the minigame's own pointer handler:
 *   if (MinigameExit.handlePointerClick()) return;
 *   // ... minigame-specific pointer handling ...
 *
 *   // On win/abandon:
 *   MinigameExit.unmount();
 *
 * Game.js wires MinigameExit.update() + render() into the render loop and
 * makes InteractPrompt / CobwebNode yield while isActive() is true (same
 * pattern as yielding to peek overlays).
 *
 * Layer 2 — depends on: HUD, InputManager, AudioSystem (soft), i18n (soft)
 */
var MinigameExit = (function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var GRACE_MS         = 300;   // Entry grace: ignore [×] clicks for this long
  var FADE_MS          = 300;   // Overlay fade-in duration (matches grace)
  var CONFIRM_TIMEOUT  = 4000;  // Confirm prompt auto-cancels after 4s idle

  var BANNER_H         = 36;    // Top input-banner strip height
  var BANNER_GAP       = 8;     // Gap between banner and top safe Y
  var BANNER_PAD_X     = 12;    // Chip horizontal padding
  var BANNER_CHIP_GAP  = 14;    // Space between chips

  var CLOSE_SIZE       = 44;    // [×] hitbox edge length (Magic Remote target)
  var CLOSE_VISUAL     = 36;    // Visible circle diameter (inside the hitbox)
  var CLOSE_MARGIN     = 16;    // Distance from viewport right edge + above footer

  var CONFIRM_W        = 420;
  var CONFIRM_H        = 120;

  // ── Colors ──────────────────────────────────────────────────────
  var BANNER_BG        = 'rgba(10,8,18,0.78)';
  var BANNER_BORDER    = 'rgba(200,180,120,0.35)';
  var CHIP_BG          = 'rgba(30,26,46,0.85)';
  var CHIP_KEY         = '#f0d070';
  var CHIP_LABEL       = '#e0d8c8';

  var CLOSE_BG         = 'rgba(20,15,25,0.85)';
  var CLOSE_BG_HOVER   = 'rgba(60,20,20,0.92)';
  var CLOSE_BG_CONFIRM = 'rgba(140,40,40,0.92)';
  var CLOSE_GLYPH      = '#e8d8c8';
  var CLOSE_GLYPH_HOT  = '#ffffff';

  var CONFIRM_BG       = 'rgba(10,8,18,0.96)';
  var CONFIRM_BORDER   = 'rgba(240,120,100,0.75)';
  var CONFIRM_TEXT     = '#f0e0d0';
  var CONFIRM_KEY_OK   = '#80c080';  // green for Cancel
  var CONFIRM_KEY_BACK = '#e07070';  // red for Exit

  // ── State ───────────────────────────────────────────────────────
  var _active        = false;
  var _kindId        = '';
  var _controls      = [];       // [{ keys:[], label:'' }, ...]
  var _onExit        = null;
  var _graceT        = 0;        // ms remaining of entry grace
  var _fadeT         = 0;        // ms of fade-in elapsed (caps at FADE_MS)
  var _confirmStage  = 'none';   // 'none' | 'pending'
  var _confirmT      = 0;        // ms remaining on confirm auto-cancel

  var _closeHitBox   = null;     // { x, y, w, h } — set each render
  var _closeHovered  = false;
  var _bannerScrollX = 0;        // px offset if banner content overflows vpW

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Mount the exit overlay. Starts the 300ms entry grace and fade-in.
   *
   * @param {Object}   cfg
   * @param {string}   cfg.kindId    — Minigame kind id (for logging / harness)
   * @param {Array}    cfg.controls  — [{ keys:['W','A','S','D'], label:'move' }, ...]
   * @param {Function} cfg.onExit    — Called when the player commits exit; receives
   *                                   a reason string ('user_confirm' | 'forced').
   */
  function mount(cfg) {
    if (_active) {
      // Double-mount is a caller bug; noop rather than stack overlays
      if (typeof console !== 'undefined') {
        console.warn('[MinigameExit] mount() called while already active', _kindId);
      }
      return;
    }
    _active        = true;
    _kindId        = (cfg && cfg.kindId) || '';
    _controls      = (cfg && Array.isArray(cfg.controls)) ? cfg.controls.slice() : [];
    _onExit        = (cfg && typeof cfg.onExit === 'function') ? cfg.onExit : null;
    _graceT        = GRACE_MS;
    _fadeT         = 0;
    _confirmStage  = 'none';
    _confirmT      = 0;
    _closeHitBox   = null;
    _closeHovered  = false;
    _bannerScrollX = 0;
  }

  /**
   * Unmount the exit overlay. Safe to call when already inactive (idempotent).
   * Does NOT invoke onExit — the minigame calls unmount on win/abandon; onExit
   * only fires when the player confirms an exit via the overlay itself.
   */
  function unmount() {
    _active        = false;
    _kindId        = '';
    _controls      = [];
    _onExit        = null;
    _graceT        = 0;
    _fadeT         = 0;
    _confirmStage  = 'none';
    _confirmT      = 0;
    _closeHitBox   = null;
    _closeHovered  = false;
    _bannerScrollX = 0;
  }

  /** True whenever the overlay is mounted (including during confirm stage). */
  function isActive() { return _active; }

  /** True only during the 300ms entry grace — callers can check this to gate
   * feedback (e.g. suppress minigame tutorial toasts until grace ends). */
  function isInGrace() { return _active && _graceT > 0; }

  /** True when the exit confirmation prompt is showing. Callers should NOT
   * treat this as "minigame dismissed" — the player can still cancel. */
  function isConfirming() { return _active && _confirmStage === 'pending'; }

  /** Returns the current kind id (mostly for harness telemetry). */
  function getKindId() { return _kindId; }

  // ── Per-frame tick ──────────────────────────────────────────────

  function update(dt) {
    if (!_active) return;
    if (_graceT > 0) _graceT = Math.max(0, _graceT - dt);
    if (_fadeT < FADE_MS) _fadeT = Math.min(FADE_MS, _fadeT + dt);
    if (_confirmStage === 'pending') {
      _confirmT -= dt;
      if (_confirmT <= 0) {
        // Auto-cancel: stay in the minigame
        _confirmStage = 'none';
        _confirmT     = 0;
      }
    }
  }

  // ── Key input ───────────────────────────────────────────────────

  /**
   * Handle a key press. Captured minigames should call this BEFORE their
   * own key handler runs; if it returns true, skip further handling.
   *
   * First Back/Escape → arm confirm.
   * Second Back/Escape → commit exit, call onExit('user_confirm'), unmount.
   * Enter/OK while confirming → cancel, return to minigame.
   *
   * @param {string} key — 'Escape' | 'Backspace' | 'Back' | 'GoBack' |
   *                       'Enter' | 'OK' | any other key (ignored)
   * @returns {boolean} true if the key was consumed by the exit overlay
   */
  function handleKey(key) {
    if (!_active) return false;

    var isBack = (key === 'Escape' || key === 'Backspace' ||
                  key === 'Back'   || key === 'GoBack');
    var isOK   = (key === 'Enter'  || key === 'OK');

    if (_confirmStage === 'pending') {
      if (isBack) {
        _commitExit('user_confirm');
        return true;
      }
      if (isOK) {
        // Cancel confirm; resume minigame
        _confirmStage = 'none';
        _confirmT     = 0;
        if (typeof AudioSystem !== 'undefined') {
          AudioSystem.play('ui_cancel', { volume: 0.4 });
        }
        return true;
      }
      // Other keys pass through — the minigame may interpret them, but
      // we still consume so the confirm stays visible until explicit.
      return true;
    }

    if (isBack) {
      _armConfirm();
      return true;
    }

    return false;
  }

  // ── Pointer input ──────────────────────────────────────────────

  /**
   * Handle a pointer click. Captured minigames should call this BEFORE
   * their own pointer handler; returns true if the exit overlay
   * consumed the click.
   *
   * A click on [×] during the 300ms grace is ignored (consumed silently
   * so it doesn't fall through to the minigame either — avoids dual-
   * action surprises).
   */
  function handlePointerClick() {
    if (!_active) return false;
    if (typeof InputManager === 'undefined' || !InputManager.getPointer) return false;

    var ptr = InputManager.getPointer();
    if (!ptr || !ptr.active) return false;

    // Hit test the close button
    if (_closeHitBox &&
        ptr.x >= _closeHitBox.x && ptr.x <= _closeHitBox.x + _closeHitBox.w &&
        ptr.y >= _closeHitBox.y && ptr.y <= _closeHitBox.y + _closeHitBox.h) {
      if (_graceT > 0) {
        // Silently consume during grace — prevents fall-through without
        // actually triggering an exit.
        return true;
      }
      if (_confirmStage === 'pending') {
        // Second click on [×] confirms the exit
        _commitExit('user_confirm');
        return true;
      }
      _armConfirm();
      return true;
    }

    return false;
  }

  // ── Internal: confirm state machine ────────────────────────────

  function _armConfirm() {
    _confirmStage = 'pending';
    _confirmT     = CONFIRM_TIMEOUT;
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui_warn', { volume: 0.45 });
    }
  }

  function _commitExit(reason) {
    var cb = _onExit;
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui_confirm', { volume: 0.5 });
    }
    // Unmount first so re-entrant callers see a clean inactive state
    unmount();
    if (typeof cb === 'function') {
      try { cb(reason); }
      catch (e) {
        if (typeof console !== 'undefined') console.error('[MinigameExit] onExit threw', e);
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  function render(ctx, vpW, vpH) {
    if (!_active) return;

    var fadeAlpha = FADE_MS > 0 ? (_fadeT / FADE_MS) : 1;

    _renderBanner(ctx, vpW, vpH, fadeAlpha);
    _renderCloseButton(ctx, vpW, vpH, fadeAlpha);
    if (_confirmStage === 'pending') {
      _renderConfirm(ctx, vpW, vpH);
    }
  }

  function _renderBanner(ctx, vpW, vpH, fadeAlpha) {
    var safeTop = (typeof HUD !== 'undefined' && typeof HUD.getSafeTop === 'function')
      ? HUD.getSafeTop(vpH) : 0;
    var y = safeTop + BANNER_GAP;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // Background strip spans full viewport width so chips center naturally
    ctx.fillStyle = BANNER_BG;
    ctx.fillRect(0, y, vpW, BANNER_H);
    ctx.strokeStyle = BANNER_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + BANNER_H);
    ctx.lineTo(vpW, y + BANNER_H);
    ctx.stroke();

    // Measure each chip, lay them out centered
    ctx.font = 'bold 14px monospace';
    var chipWidths = [];
    var totalW = 0;
    for (var i = 0; i < _controls.length; i++) {
      var c = _controls[i];
      var keyStr = _formatKeys(c.keys);
      var labelStr = c.label || '';
      ctx.font = 'bold 14px monospace';
      var kw = ctx.measureText(keyStr).width;
      ctx.font = '14px monospace';
      var lw = ctx.measureText(' ' + labelStr).width;
      var cw = BANNER_PAD_X * 2 + kw + lw;
      chipWidths.push({ w: cw, keyW: kw, key: keyStr, label: labelStr });
      totalW += cw;
    }
    totalW += BANNER_CHIP_GAP * Math.max(0, _controls.length - 1);

    var startX = Math.max(BANNER_CHIP_GAP, (vpW - totalW) / 2);
    // If overflow, left-align and scroll (not implemented for v1 — we just
    // left-align and let extra chips clip; v1 ships with ≤4 entries which
    // fits comfortably at typical resolutions).

    var cx = startX;
    for (var j = 0; j < chipWidths.length; j++) {
      var cd = chipWidths[j];
      _drawChip(ctx, cx, y + 4, cd.w, BANNER_H - 8, cd.key, cd.label, cd.keyW);
      cx += cd.w + BANNER_CHIP_GAP;
    }

    ctx.restore();
  }

  function _formatKeys(keys) {
    if (!keys || !keys.length) return '';
    var out = [];
    for (var i = 0; i < keys.length; i++) out.push('[' + keys[i] + ']');
    return out.join('');
  }

  function _drawChip(ctx, x, y, w, h, keyStr, labelStr, keyW) {
    // Chip background
    var r = 5;
    ctx.fillStyle = CHIP_BG;
    _roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Key text (gold)
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CHIP_KEY;
    ctx.fillText(keyStr, x + BANNER_PAD_X, y + h / 2);

    // Label text (cream)
    ctx.font = '14px monospace';
    ctx.fillStyle = CHIP_LABEL;
    ctx.fillText(' ' + labelStr, x + BANNER_PAD_X + keyW, y + h / 2);
  }

  function _renderCloseButton(ctx, vpW, vpH, fadeAlpha) {
    var safeBot = (typeof HUD !== 'undefined' && typeof HUD.getSafeBottom === 'function')
      ? HUD.getSafeBottom(vpH) : vpH;

    var cx = vpW - CLOSE_MARGIN - CLOSE_SIZE / 2;
    var cy = safeBot - CLOSE_MARGIN - CLOSE_SIZE / 2;

    // Store hit box (pointer-click target is the full CLOSE_SIZE square,
    // centered on cx/cy). Visual is a smaller circle inside for polish.
    _closeHitBox = {
      x: cx - CLOSE_SIZE / 2,
      y: cy - CLOSE_SIZE / 2,
      w: CLOSE_SIZE,
      h: CLOSE_SIZE
    };

    // Hover detection
    _closeHovered = false;
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var ptr = InputManager.getPointer();
      if (ptr && ptr.active &&
          ptr.x >= _closeHitBox.x && ptr.x <= _closeHitBox.x + _closeHitBox.w &&
          ptr.y >= _closeHitBox.y && ptr.y <= _closeHitBox.y + _closeHitBox.h) {
        _closeHovered = true;
      }
    }

    var inGrace = _graceT > 0;
    var confirming = (_confirmStage === 'pending');

    ctx.save();
    // During grace, dim the button to telegraph "not yet clickable"
    ctx.globalAlpha = fadeAlpha * (inGrace ? 0.5 : 1);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, CLOSE_VISUAL / 2, 0, Math.PI * 2);
    if (confirming) {
      ctx.fillStyle = CLOSE_BG_CONFIRM;
    } else if (_closeHovered && !inGrace) {
      ctx.fillStyle = CLOSE_BG_HOVER;
    } else {
      ctx.fillStyle = CLOSE_BG;
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = confirming ? '#ffaaaa' : (_closeHovered ? '#f0d070' : 'rgba(200,180,120,0.45)');
    ctx.lineWidth = confirming ? 2.5 : (_closeHovered ? 2 : 1.25);
    ctx.beginPath();
    ctx.arc(cx, cy, CLOSE_VISUAL / 2, 0, Math.PI * 2);
    ctx.stroke();

    // × glyph
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = (_closeHovered && !inGrace) ? CLOSE_GLYPH_HOT : CLOSE_GLYPH;
    ctx.fillText('\u00D7', cx, cy + 1);

    // Hover label "EXIT" below the button
    if (_closeHovered && !inGrace) {
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('EXIT', cx, cy + CLOSE_VISUAL / 2 + 10);
    }

    ctx.restore();
  }

  function _renderConfirm(ctx, vpW, vpH) {
    var x = (vpW - CONFIRM_W) / 2;
    var y = (vpH - CONFIRM_H) / 2;

    ctx.save();

    // Dim the rest of the screen slightly so attention pulls to the prompt
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, vpW, vpH);

    // Prompt panel
    _roundRect(ctx, x, y, CONFIRM_W, CONFIRM_H, 10);
    ctx.fillStyle = CONFIRM_BG;
    ctx.fill();
    ctx.strokeStyle = CONFIRM_BORDER;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(240,120,100,0.35)';
    ctx.shadowBlur = 12;
    _roundRect(ctx, x, y, CONFIRM_W, CONFIRM_H, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Question
    var title = (typeof i18n !== 'undefined')
      ? i18n.t('minigame.exit_confirm', 'Exit? Progress will be lost')
      : 'Exit? Progress will be lost';
    ctx.fillStyle = CONFIRM_TEXT;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, vpW / 2, y + 38);

    // Action row: [OK] Cancel    [BACK] Exit
    ctx.font = 'bold 14px monospace';
    var okLabel   = (typeof i18n !== 'undefined') ? i18n.t('ui.ok',   '[OK]')   : '[OK]';
    var backLabel = (typeof i18n !== 'undefined') ? i18n.t('ui.back', '[BACK]') : '[BACK]';
    var cancelTxt = (typeof i18n !== 'undefined') ? i18n.t('ui.cancel', 'Cancel') : 'Cancel';
    var exitTxt   = (typeof i18n !== 'undefined') ? i18n.t('ui.exit',   'Exit')   : 'Exit';

    var rowY = y + 82;
    ctx.textAlign = 'center';
    // Cancel on the left
    ctx.fillStyle = CONFIRM_KEY_OK;
    ctx.fillText(okLabel + ' ' + cancelTxt, x + CONFIRM_W * 0.30, rowY);
    // Exit on the right
    ctx.fillStyle = CONFIRM_KEY_BACK;
    ctx.fillText(backLabel + ' ' + exitTxt, x + CONFIRM_W * 0.70, rowY);

    // Countdown hairline (auto-cancel timer)
    var pct = Math.max(0, _confirmT) / CONFIRM_TIMEOUT;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 16, y + CONFIRM_H - 10, (CONFIRM_W - 32) * pct, 2);

    ctx.restore();
  }

  // ── Utility ─────────────────────────────────────────────────────

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

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    mount:              mount,
    unmount:            unmount,
    update:             update,
    render:             render,
    handleKey:          handleKey,
    handlePointerClick: handlePointerClick,
    isActive:           isActive,
    isInGrace:          isInGrace,
    isConfirming:       isConfirming,
    getKindId:          getKindId,
    // Exposed for test harness only — not for minigame authors
    _CONFIG: Object.freeze({
      GRACE_MS:        GRACE_MS,
      FADE_MS:         FADE_MS,
      CONFIRM_TIMEOUT: CONFIRM_TIMEOUT,
      CLOSE_SIZE:      CLOSE_SIZE
    })
  });
})();

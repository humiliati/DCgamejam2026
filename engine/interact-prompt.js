/**
 * InteractPrompt — contextual "[OK] Talk / Open / Use" prompt.
 *
 * Canvas-rendered widget that appears above the bottom HUD area when
 * the player faces an interactable tile (NPC, chest, bonfire, shop,
 * door, sign). Fades in/out smoothly.
 *
 * Layer 2 (after Toast, before MenuBox)
 * Depends on: TILES, Player, MovementController, FloorManager, i18n
 */
var InteractPrompt = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var FADE_IN   = 150;   // ms fade-in
  var FADE_OUT  = 100;   // ms fade-out
  var BOX_H     = 28;    // Prompt box height
  var BOX_PAD   = 14;    // Horizontal padding
  var BOX_RAD   = 6;     // Corner radius
  var BOX_Y_OFF = 80;    // Pixels from bottom of viewport

  // ── Colors ──────────────────────────────────────────────────────
  var COL_BG      = 'rgba(10,8,18,0.82)';
  var COL_BORDER  = 'rgba(200,180,120,0.45)';
  var COL_KEY     = '#f0d070';     // [OK] highlight
  var COL_ACTION  = '#d8d0c0';     // Action text

  // ── Tile → action label map ─────────────────────────────────────
  var ACTION_MAP = {};
  // Filled in init() after TILES is available

  // ── State ───────────────────────────────────────────────────────
  var _visible    = false;   // Should prompt be showing?
  var _alpha      = 0;       // Current opacity (0–1)
  var _actionText = '';      // Current action label
  var _iconText   = '';      // Optional emoji prefix
  var _hitBox     = null;    // { x, y, w, h } — screen-space click zone
  var _hovered    = false;   // Pointer is over the prompt

  function init() {
    ACTION_MAP[TILES.CHEST]     = { action: 'interact.open',   icon: '' };
    ACTION_MAP[TILES.BONFIRE]   = { action: 'interact.rest',   icon: '🔥' };
    ACTION_MAP[TILES.SHOP]      = { action: 'interact.browse', icon: '' };
    ACTION_MAP[TILES.STAIRS_DN] = { action: 'interact.descend',icon: '' };
    ACTION_MAP[TILES.STAIRS_UP] = { action: 'interact.ascend', icon: '' };
    ACTION_MAP[TILES.BOSS_DOOR] = { action: 'interact.enter',  icon: '' };
    ACTION_MAP[TILES.DOOR]      = { action: 'interact.enter',  icon: '' };
    ACTION_MAP[TILES.DOOR_BACK] = { action: 'interact.enter',  icon: '' };
    ACTION_MAP[TILES.DOOR_EXIT] = { action: 'interact.exit',   icon: '' };
    ACTION_MAP[TILES.CORPSE]    = { action: 'interact.harvest', icon: '', gleaner: 'interact.restock', gleanerIcon: '🧪' };
    ACTION_MAP[TILES.BREAKABLE] = { action: 'interact.smash',   icon: '🔨', gleaner: 'interact.restock', gleanerIcon: '📦' };
    ACTION_MAP[TILES.PUZZLE]    = { action: 'interact.reset',   icon: '🧩' };
    ACTION_MAP[TILES.BOOKSHELF] = { action: 'interact.read',    icon: '📖' };
    ACTION_MAP[TILES.BAR_COUNTER] = { action: 'interact.drink', icon: '🍺' };
  }

  /**
   * Check the tile the player is facing and update visibility.
   * Call once per frame from the gameplay render path.
   */
  function check() {
    if (typeof FloorManager === 'undefined') { _visible = false; return; }

    var floorData = FloorManager.getFloorData();
    if (!floorData) { _visible = false; return; }

    var p   = Player.getPos();
    var dir = Player.getDir();
    var fx  = p.x + MC.DX[dir];
    var fy  = p.y + MC.DY[dir];

    if (fx < 0 || fx >= floorData.gridW || fy < 0 || fy >= floorData.gridH) {
      _visible = false;
      return;
    }

    var tile = floorData.grid[fy][fx];
    var entry = ACTION_MAP[tile];

    if (entry) {
      _visible = true;
      _actionText = i18n.t(entry.action, entry.action.split('.')[1]);
      _iconText = entry.icon;

      // Gleaner mode: show restock prompt for containers that exist
      if (entry.gleaner && typeof CrateSystem !== 'undefined') {
        var flId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
        if (CrateSystem.hasContainer(fx, fy, flId)) {
          var cont = CrateSystem.getContainer(fx, fy, flId);
          if (cont && cont.sealed) {
            _actionText = 'sealed \u2714';
            _iconText = '\u2714';
          } else {
            _actionText = i18n.t(entry.gleaner, entry.gleaner.split('.')[1]);
            _iconText = entry.gleanerIcon || entry.icon;
          }
        }
      }

      // Append destination floor ID for door tiles so the player
      // knows where they're going: "[OK] Enter → 1.1"
      if (TILES.isDoor(tile) && floorData.doorTargets) {
        var doorKey = fx + ',' + fy;
        var targetId = floorData.doorTargets[doorKey];
        if (targetId) {
          var label = (typeof FloorManager.getFloorLabel === 'function')
            ? FloorManager.getFloorLabel(targetId) : null;
          _actionText += ' → ' + (label || targetId);
        }
      }
      return;
    }

    // Check for enemies on the facing tile (NPC interaction — future)
    var enemies = FloorManager.getEnemies();
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp > 0 && e.x === fx && e.y === fy && e.friendly) {
        _visible = true;
        _actionText = i18n.t('interact.talk', 'Talk');
        _iconText = e.emoji || '';
        return;
      }
    }

    _visible = false;
  }

  /**
   * Update fade animation. Call once per frame.
   * @param {number} dt - Frame delta in ms
   */
  function update(dt) {
    if (_visible) {
      _alpha = Math.min(1, _alpha + dt / FADE_IN);
    } else {
      _alpha = Math.max(0, _alpha - dt / FADE_OUT);
    }
  }

  /**
   * Render the prompt on the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW
   * @param {number} vpH
   */
  function render(ctx, vpW, vpH) {
    if (_alpha <= 0) { _hitBox = null; return; }

    var keyLabel = i18n.t('interact.key', '[OK]');
    var fullText = _iconText ? _iconText + ' ' + _actionText : _actionText;

    ctx.save();
    ctx.globalAlpha = _alpha;
    ctx.font = '12px monospace';

    var keyW = ctx.measureText(keyLabel).width;
    var actW = ctx.measureText(' ' + fullText).width;
    var boxW = BOX_PAD * 2 + keyW + actW;
    var boxX = (vpW - boxW) / 2;
    var boxY = vpH - BOX_Y_OFF;

    // Store hit zone for pointer click
    _hitBox = { x: boxX, y: boxY, w: boxW, h: BOX_H };

    // Check hover state for visual feedback
    _hovered = false;
    if (typeof InputManager !== 'undefined') {
      var ptr = InputManager.getPointer();
      if (ptr && ptr.active &&
          ptr.x >= boxX && ptr.x <= boxX + boxW &&
          ptr.y >= boxY && ptr.y <= boxY + BOX_H) {
        _hovered = true;
      }
    }

    // Background — brighter when hovered
    _roundRect(ctx, boxX, boxY, boxW, BOX_H, BOX_RAD);
    ctx.fillStyle = _hovered ? 'rgba(30,25,40,0.92)' : COL_BG;
    ctx.fill();
    ctx.strokeStyle = _hovered ? '#f0d070' : COL_BORDER;
    ctx.lineWidth = _hovered ? 1.5 : 1;
    _roundRect(ctx, boxX, boxY, boxW, BOX_H, BOX_RAD);
    ctx.stroke();

    // Key label
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_KEY;
    ctx.fillText(keyLabel, boxX + BOX_PAD, boxY + BOX_H / 2);

    // Action text
    ctx.fillStyle = _hovered ? '#fff' : COL_ACTION;
    ctx.fillText(' ' + fullText, boxX + BOX_PAD + keyW, boxY + BOX_H / 2);

    // Pointer cursor hint (clickable affordance)
    if (_hovered) {
      ctx.fillStyle = 'rgba(240,208,112,0.5)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▶ click', boxX + boxW / 2, boxY + BOX_H + 10);
    }

    ctx.restore();
  }

  function isVisible() { return _alpha > 0; }

  /**
   * Test if the pointer click hit the prompt box.
   * Returns true if the click was inside the prompt — game.js
   * then calls _interact() to execute the action.
   */
  function handlePointerClick() {
    if (!_hitBox || _alpha < 0.5) return false;
    if (typeof InputManager === 'undefined') return false;
    var ptr = InputManager.getPointer();
    if (!ptr || !ptr.active) return false;
    return ptr.x >= _hitBox.x && ptr.x <= _hitBox.x + _hitBox.w &&
           ptr.y >= _hitBox.y && ptr.y <= _hitBox.y + _hitBox.h;
  }

  // ── Helpers ─────────────────────────────────────────────────────

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

  return {
    init: init,
    check: check,
    update: update,
    render: render,
    isVisible: isVisible,
    handlePointerClick: handlePointerClick
  };
})();
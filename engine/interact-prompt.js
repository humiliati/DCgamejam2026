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
  var FADE_IN   = 120;   // ms fade-in
  var FADE_OUT  = 80;    // ms fade-out
  var BOX_H     = 60;    // Prompt box height (Magic Remote tactile target)
  var BOX_PAD   = 24;    // Horizontal padding
  var BOX_RAD   = 10;    // Corner radius
  var BOX_BOTTOM_MARGIN = 16;  // px above the status-bar footer
  var BOX_Y_FRAC = 0.60;  // Legacy fallback — used only when HUD.getSafeBottom
                          // is unavailable (e.g. HUD not yet initialised during
                          // early boot). Normal path: bottom-anchored via
                          // HUD.getSafeBottom() so the prompt rides up when
                          // the tooltip footer expands (.sb-expanded).

  // ── Colors ──────────────────────────────────────────────────────
  var COL_BG      = 'rgba(10,8,18,0.88)';
  var COL_BORDER  = 'rgba(200,180,120,0.55)';
  var COL_KEY     = '#f0d070';     // [OK] highlight
  var COL_ACTION  = '#e0d8c8';     // Action text
  var COL_GLOW    = 'rgba(240,208,112,0.12)'; // Ambient glow behind box

  // ── Tile → action label map ─────────────────────────────────────
  var ACTION_MAP = {};
  // Filled in init() after TILES is available

  // ── State ───────────────────────────────────────────────────────
  var _visible    = false;   // Should prompt be showing?
  var _alpha      = 0;       // Current opacity (0–1)
  var _actionText = '';      // Current action label
  var _iconText   = '';      // Optional emoji prefix
  var _hintText   = '';      // Hover-only hint line (explain the action)
  var _hitBox     = null;    // { x, y, w, h } — screen-space click zone
  var _hovered    = false;   // Pointer is over the prompt
  var _clickFlash = 0;       // Click feedback flash timer (ms remaining)
  var _inactive   = false;   // True when tile is non-interactive (empty bookshelf)

  // PF-4: rising-edge "approaching a new interactable" signal
  // When the player starts facing a new interactable tile, ask the status bar
  // to collapse its expanded tooltip footer — but only if they aren't engaged
  // in dialogue (StatusBar.collapseIfIdle already respects _dialogueActive).
  // Tracking the "approach key" (fx,fy,tile) lets us fire once per approach
  // rather than every frame, so if the player manually re-expands the footer
  // while still facing the same tile we don't fight them.
  var _lastApproachKey = null;

  /**
   * PF-4: Signal that the player has started facing a (potentially new)
   * interactable tile. Fires StatusBar.collapseIfIdle() on the rising edge
   * only — i.e. when (fx, fy, tile) changes from the previous facing key.
   * Staying adjacent to the same tile does NOT re-fire, so a player who
   * manually re-expands the footer while adjacent keeps it open.
   */
  function _signalApproach(fx, fy, tile) {
    var key = fx + ',' + fy + ':' + tile;
    if (key !== _lastApproachKey) {
      _lastApproachKey = key;
      if (typeof StatusBar !== 'undefined' && typeof StatusBar.collapseIfIdle === 'function') {
        StatusBar.collapseIfIdle();
      }
    }
  }

  /** Clear the approach key when nothing interactable is in front. */
  function _clearApproach() {
    _lastApproachKey = null;
  }

  /**
   * Check if any peek overlay with its own action button is active.
   * These peeks render DOM buttons that duplicate the canvas prompt.
   */
  function _anyPeekActive() {
    var peeks = [
      typeof CratePeek    !== 'undefined' && CratePeek,
      typeof CorpsePeek   !== 'undefined' && CorpsePeek,
      typeof MerchantPeek !== 'undefined' && MerchantPeek,
      typeof DoorPeek     !== 'undefined' && DoorPeek,
      typeof TorchPeek    !== 'undefined' && TorchPeek,
      typeof PuzzlePeek   !== 'undefined' && PuzzlePeek,
      typeof BookshelfPeek!== 'undefined' && BookshelfPeek
    ];
    for (var i = 0; i < peeks.length; i++) {
      if (peeks[i] && peeks[i].isActive && peeks[i].isActive()) return true;
    }
    return false;
  }

  function init() {
    ACTION_MAP[TILES.CHEST]     = { action: 'interact.open',   icon: '' };
    ACTION_MAP[TILES.BONFIRE]   = { action: 'interact.rest',   icon: '🔥' };
    ACTION_MAP[TILES.SHOP]      = { action: 'interact.browse', icon: '' };
    ACTION_MAP[TILES.STAIRS_DN] = { action: 'interact.descend',icon: '' };
    ACTION_MAP[TILES.STAIRS_UP] = { action: 'interact.ascend', icon: '' };
    ACTION_MAP[TILES.TRAPDOOR_DN] = { action: 'interact.descend', icon: '' };
    ACTION_MAP[TILES.TRAPDOOR_UP] = { action: 'interact.ascend',  icon: '' };
    ACTION_MAP[TILES.BOSS_DOOR] = { action: 'interact.enter',  icon: '' };
    ACTION_MAP[TILES.DOOR]      = { action: 'interact.enter',  icon: '' };
    ACTION_MAP[TILES.DOOR_BACK] = { action: 'interact.enter',  icon: '' };
    ACTION_MAP[TILES.DOOR_EXIT] = { action: 'interact.exit',   icon: '' };
    ACTION_MAP[TILES.CORPSE]    = { action: 'interact.harvest', icon: '', gleaner: 'interact.restock', gleanerIcon: '🧪' };
    ACTION_MAP[TILES.BREAKABLE] = { action: 'interact.smash',   icon: '🔨', gleaner: 'interact.fill', gleanerIcon: '📦' };
    ACTION_MAP[TILES.PUZZLE]    = { action: 'interact.reset',   icon: '🧩' };
    ACTION_MAP[TILES.BOOKSHELF] = { action: 'interact.read',    icon: '📖' };
    ACTION_MAP[TILES.BAR_COUNTER] = { action: 'interact.drink', icon: '🍺' };
    ACTION_MAP[TILES.BED]         = { action: 'interact.rest',  icon: '🛏️' };
    ACTION_MAP[TILES.TABLE]       = { action: 'interact.inspect', icon: '🔍' };
    ACTION_MAP[TILES.HEARTH]      = { action: 'interact.rest',    icon: '🔥' };
    ACTION_MAP[TILES.CITY_BONFIRE] = { action: 'interact.rest',   icon: '🔥' };
    ACTION_MAP[TILES.TORCH_LIT]   = { action: 'interact.extinguish', icon: '🔥', gleaner: 'interact.refuel', gleanerIcon: '🪵' };
    ACTION_MAP[TILES.TORCH_UNLIT] = { action: 'interact.refuel', icon: '🪵' };
    ACTION_MAP[TILES.MAILBOX]     = { action: 'interact.check_mail', icon: '📫' };
    ACTION_MAP[TILES.TERMINAL]    = { action: 'interact.access',     icon: '' };
    ACTION_MAP[TILES.DETRITUS]    = { action: 'interact.pick_up',    icon: '👝' };
    ACTION_MAP[TILES.DUMP_TRUCK]  = { action: 'interact.grab_hose',   icon: '🧵' };

    // ── Hint map (hover-only description, keyed by i18n action key) ──
    ACTION_MAP[TILES.CHEST].hint     = 'hint.inspect';
    ACTION_MAP[TILES.BONFIRE].hint   = 'hint.rest';
    ACTION_MAP[TILES.SHOP].hint      = 'hint.browse';
    ACTION_MAP[TILES.CORPSE].hint    = 'hint.harvest';
    ACTION_MAP[TILES.CORPSE].gleanerHint = 'hint.restock';
    ACTION_MAP[TILES.BREAKABLE].hint = 'hint.smash';
    ACTION_MAP[TILES.BREAKABLE].gleanerHint = 'hint.fill';
    ACTION_MAP[TILES.PUZZLE].hint    = 'hint.inspect';
    ACTION_MAP[TILES.BOOKSHELF].hint = 'hint.read';
    ACTION_MAP[TILES.BAR_COUNTER].hint = 'hint.drink';
    ACTION_MAP[TILES.BED].hint       = 'hint.rest';
    ACTION_MAP[TILES.TABLE].hint     = 'hint.inspect';
    ACTION_MAP[TILES.HEARTH].hint    = 'hint.rest';
    ACTION_MAP[TILES.CITY_BONFIRE].hint = 'hint.rest';
    ACTION_MAP[TILES.TORCH_LIT].hint = 'hint.extinguish';
    ACTION_MAP[TILES.TORCH_LIT].gleanerHint = 'hint.refuel';
    ACTION_MAP[TILES.TORCH_UNLIT].hint = 'hint.refuel';
    ACTION_MAP[TILES.DETRITUS].hint    = 'hint.pick_up';
    ACTION_MAP[TILES.DOOR].hint      = 'hint.enter';
    ACTION_MAP[TILES.DOOR_BACK].hint = 'hint.enter';
    ACTION_MAP[TILES.DOOR_EXIT].hint = 'hint.exit';
    ACTION_MAP[TILES.MAILBOX].hint   = 'hint.check_mail';
    ACTION_MAP[TILES.TERMINAL].hint  = 'hint.access';
    ACTION_MAP[TILES.DUMP_TRUCK].hint = 'hint.grab_hose';
  }

  /**
   * Check the tile the player is facing and update visibility.
   * Call once per frame from the gameplay render path.
   */
  function check() {
    if (typeof FloorManager === 'undefined') { _visible = false; return; }

    // PF-5 — Yield to MinigameExit while a captured-input minigame owns the viewport.
    // The exit banner + [×] corner + confirm prompt are the only controls the player
    // should see; any stale tile hint must not bleed through.
    if (typeof MinigameExit !== 'undefined' && MinigameExit.isActive()) {
      _visible = false;
      _clearApproach();
      return;
    }

    // Yield to CobwebNode's spider-deployment prompt to prevent overlap
    if (typeof CobwebNode !== 'undefined' && CobwebNode.isPromptVisible()) {
      _visible = false; return;
    }

    // Yield to active peek overlays that have their own DOM action buttons.
    // Without this guard, both the canvas InteractPrompt and the peek's DOM
    // button render simultaneously — producing stacked redundant prompts.
    if (_anyPeekActive()) { _visible = false; return; }

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
      _signalApproach(fx, fy, tile);
      _visible = true;
      _inactive = false;
      _actionText = i18n.t(entry.action, entry.action.split('.')[1]);
      _iconText = entry.icon;
      _hintText = entry.hint ? i18n.t(entry.hint, '') : '';

      // Empty bookshelf → non-interactive state (dimmed, no [OK])
      if (tile === TILES.BOOKSHELF && typeof BookshelfPeek !== 'undefined' && BookshelfPeek.hasBook) {
        if (!BookshelfPeek.hasBook(fx, fy)) {
          _inactive = true;
          _actionText = i18n.t('interact.empty_shelf', 'Empty');
          _iconText = '📖';
          _hintText = '';
        }
      }

      // §11d: Depth-based verb for bonfire/hearth tiles ("Camp" vs "Rest")
      if (tile === TILES.BONFIRE || tile === TILES.HEARTH || tile === TILES.CITY_BONFIRE) {
        var fId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
        var fDepth = fId ? fId.split('.').length : 1;
        if (fDepth >= 3) {
          _actionText = i18n.t('interact.dragonfire_rest', 'Rest');
          _hintText = i18n.t('hint.camp', '');
        } else {
          _actionText = i18n.t('interact.dragonfire_camp', 'Camp');
          _hintText = i18n.t('hint.rest', '');
        }
        _iconText = '🔥';
      }

      // Gleaner mode: show restock prompt for containers that exist
      if (entry.gleaner && typeof CrateSystem !== 'undefined') {
        var flId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
        if (CrateSystem.hasContainer(fx, fy, flId)) {
          var cont = CrateSystem.getContainer(fx, fy, flId);
          if (cont && cont.sealed) {
            _actionText = 'sealed \u2714';
            _iconText = '\u2714';
            _hintText = i18n.t(tile === TILES.CORPSE ? 'hint.harvest_sealed' : 'hint.restock_sealed', '');
          } else {
            _actionText = i18n.t(entry.gleaner, entry.gleaner.split('.')[1]);
            _iconText = entry.gleanerIcon || entry.icon;
            _hintText = entry.gleanerHint ? i18n.t(entry.gleanerHint, '') : '';
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

    // C7: Trap re-arm — consumed trap position (tile is now EMPTY)
    if (typeof TrapRearm !== 'undefined') {
      var trFlId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
      if (TrapRearm.canRearm(fx, fy, trFlId)) {
        _signalApproach(fx, fy, 'rearm');
        // Phase 2: show count of trap consumables in bag
        var _trapKitCount = 0;
        if (typeof CardAuthority !== 'undefined') {
          var _trBag = CardAuthority.getBag();
          for (var _ti = 0; _ti < _trBag.length; _ti++) {
            if (_trBag[_ti] && (_trBag[_ti].id === 'ITM-116' || _trBag[_ti].id === 'ITM-092')) _trapKitCount++;
          }
        }
        _visible = true;
        _actionText = i18n.t('interact.rearm', 'Re-arm trap') + '  (\u00D7' + _trapKitCount + ')';
        _iconText = '⚙️';
        _hintText = _trapKitCount > 0 ? '' : i18n.t('hint.need_kit', 'Need Trap Kit or Spring');
        return;
      }
    }

    // Blood tile cleaning — walkable tile with blood on it
    if (typeof CleaningSystem !== 'undefined') {
      var clFlId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
      if (CleaningSystem.isDirty(fx, fy, clFlId)) {
        _signalApproach(fx, fy, 'clean');
        _visible = true;
        var bloodLvl = CleaningSystem.getBlood(fx, fy, clFlId);
        _actionText = i18n.t('interact.clean', 'Scrub') + ' (' + bloodLvl + '/' + CleaningSystem.MAX_BLOOD + ')';
        _iconText = '🧹';
        _hintText = i18n.t('hint.clean', '');
        return;
      }
    }

    // Check for NPC entities on the facing tile — both INTERACTIVE
    // (talkable, dialogue trees) and AMBIENT (bark cycling on OK)
    var enemies = FloorManager.getEnemies();
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp > 0 && e.x === fx && e.y === fy && e.npcType) {
        _signalApproach(fx, fy, 'npc:' + (e.id || e.npcType));
        _visible = true;
        _actionText = i18n.t(e.talkable ? 'interact.talk' : 'interact.listen', e.talkable ? 'Talk' : 'Listen');
        _iconText = e.emoji || '';
        _hintText = i18n.t('hint.talk', '');
        return;
      }
    }

    // Fallback: friendly talkable non-NPC entities (e.g. enemy with friendly flag)
    for (var j = 0; j < enemies.length; j++) {
      var ef = enemies[j];
      if (ef.hp > 0 && ef.x === fx && ef.y === fy && ef.friendly && ef.talkable && !ef.npcType) {
        _signalApproach(fx, fy, 'friendly:' + (ef.id || ''));
        _visible = true;
        _actionText = i18n.t('interact.talk', 'Talk');
        _iconText = ef.emoji || '';
        _hintText = i18n.t('hint.talk', '');
        return;
      }
    }

    _visible = false;
    _hintText = '';
    _clearApproach();
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
    if (_clickFlash > 0) _clickFlash = Math.max(0, _clickFlash - dt);
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
    ctx.font = 'bold 20px monospace';

    var keyW = ctx.measureText(keyLabel).width;
    ctx.font = '20px monospace';
    var actW = ctx.measureText('  ' + fullText).width;
    var boxW = BOX_PAD * 2 + keyW + actW;
    var boxX = (vpW - boxW) / 2;

    // PF-1: anchor prompt bottom just above the tooltip footer so it
    // stays visible whether the bar is collapsed (128px) or expanded
    // (up to 50vh). Fall back to BOX_Y_FRAC when HUD isn't ready.
    var boxY;
    if (typeof HUD !== 'undefined' && typeof HUD.getSafeBottom === 'function') {
      boxY = HUD.getSafeBottom(vpH) - BOX_H - BOX_BOTTOM_MARGIN;
      if (boxY < 0) boxY = vpH * BOX_Y_FRAC;  // defensive clamp
    } else {
      boxY = vpH * BOX_Y_FRAC;
    }

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

    // ── Inactive state: dimmed, no glow, no [OK] key ──
    if (_inactive) {
      // Dim background
      _roundRect(ctx, boxX, boxY, boxW, BOX_H, BOX_RAD);
      ctx.fillStyle = 'rgba(10,8,18,0.55)';
      ctx.fill();
      // Dim border (no glow)
      ctx.strokeStyle = 'rgba(120,110,100,0.25)';
      ctx.lineWidth = 1;
      _roundRect(ctx, boxX, boxY, boxW, BOX_H, BOX_RAD);
      ctx.stroke();
      // Dim text — icon + label only, no [OK] key
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '18px monospace';
      ctx.fillStyle = 'rgba(160,150,130,0.45)';
      ctx.fillText(fullText, boxX + boxW / 2, boxY + BOX_H / 2);
      ctx.restore();
      return;
    }

    // Ambient glow halo behind the box
    var glowR = boxW * 0.6;
    var grd = ctx.createRadialGradient(
      boxX + boxW / 2, boxY + BOX_H / 2, 0,
      boxX + boxW / 2, boxY + BOX_H / 2, glowR
    );
    grd.addColorStop(0, _hovered ? 'rgba(240,208,112,0.18)' : COL_GLOW);
    grd.addColorStop(1, 'rgba(240,208,112,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(boxX - glowR, boxY - glowR + BOX_H / 2, boxW + glowR * 2, glowR * 2);

    // Background — brighter when hovered, flash white on click
    _roundRect(ctx, boxX, boxY, boxW, BOX_H, BOX_RAD);
    if (_clickFlash > 0) {
      var flashAlpha = _clickFlash / 200;
      ctx.fillStyle = 'rgba(240,220,140,' + (0.3 + flashAlpha * 0.5).toFixed(2) + ')';
    } else {
      ctx.fillStyle = _hovered ? 'rgba(30,25,40,0.94)' : COL_BG;
    }
    ctx.fill();

    // Border with subtle glow
    ctx.shadowColor = 'rgba(240,208,112,0.25)';
    ctx.shadowBlur = _hovered ? 12 : 6;
    ctx.strokeStyle = _hovered ? '#f0d070' : COL_BORDER;
    ctx.lineWidth = _hovered ? 2.5 : 1.5;
    _roundRect(ctx, boxX, boxY, boxW, BOX_H, BOX_RAD);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Key label (bold)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = COL_KEY;
    ctx.fillText(keyLabel, boxX + BOX_PAD, boxY + BOX_H / 2);

    // Action text
    ctx.font = '20px monospace';
    ctx.fillStyle = _hovered ? '#fff' : COL_ACTION;
    ctx.fillText('  ' + fullText, boxX + BOX_PAD + keyW, boxY + BOX_H / 2);

    // Hover hint line: explain what the action does
    if (_hovered && _hintText) {
      ctx.fillStyle = 'rgba(200,190,170,0.65)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(_hintText, boxX + boxW / 2, boxY + BOX_H + 16);
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
    if (_inactive) return false;  // Non-interactive tiles don't respond to clicks
    if (!_hitBox || _alpha < 0.5) return false;
    if (typeof InputManager === 'undefined') return false;
    var ptr = InputManager.getPointer();
    if (!ptr || !ptr.active) return false;
    var hit = ptr.x >= _hitBox.x && ptr.x <= _hitBox.x + _hitBox.w &&
              ptr.y >= _hitBox.y && ptr.y <= _hitBox.y + _hitBox.h;
    if (hit) {
      _clickFlash = 200; // 200ms bright flash on click
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui_confirm');
    }
    return hit;
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
    isInactive: function () { return _inactive; },
    handlePointerClick: handlePointerClick
  };
})();
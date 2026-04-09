/**
 * CrateUI — canvas-rendered slot interface for crates, corpse stocks, AND chests.
 *
 * Renders a row of framed slot boxes overlaid on the viewport. Supports
 * two interaction modes based on container type:
 *
 *   DEPOSIT (crate/corpse): Slots start empty/barely hydrated. Number keys
 *   fill slots from the player's bag. 'S' key seals when all filled.
 *
 *   WITHDRAW (chest): Slots start filled with loot. Number keys take items
 *   FROM slots into the player's inventory. Chest depletes when all empty.
 *
 * Same visual wrapper, opposite resource flow.
 *
 * Layer 2 — depends on: CrateSystem, Player, CardAuthority (optional), i18n (optional)
 */
var CrateUI = (function () {
  'use strict';

  // ── Callback ────────────────────────────────────────────────────
  // Optional hook fired after every successful withdraw. Signature:
  //   fn(item, x, y, floorId) — item is the withdrawn item object.
  var _onWithdrawCb = null;

  // ── Layout constants ────────────────────────────────────────────
  var SLOT_SIZE     = 56;   // px per slot box (Magic Remote 56px minimum)
  var SLOT_GAP      = 14;   // px between slots (gyro jitter clearance)
  var SLOT_RAD      = 6;    // Corner radius
  var PANEL_PAD     = 16;   // Padding around slot row
  var PANEL_Y_FRAC  = 0.38; // Vertical centre fraction (above middle)
  var LABEL_FONT    = '11px monospace';
  var EMOJI_FONT    = '22px sans-serif';
  var SUIT_FONT     = '28px sans-serif';
  var TITLE_FONT    = 'bold 13px monospace';

  // ── Slot hit-test rects (updated each render frame) ────────────
  // Array of { x, y, w, h, index } — one per slot, screen coords.
  var _slotRects = [];

  // ── Stash grid layout constants ─────────────────────────────────
  var GRID_COLS       = 8;    // Columns in stash grid
  var GRID_VIS_ROWS   = 4;   // Visible rows before scroll
  var GRID_SLOT_SIZE  = 48;  // Slightly smaller slots for grid density
  var GRID_SLOT_GAP   = 8;
  var GRID_PAD        = 16;
  var SCROLL_SPEED    = 0.012; // Smooth scroll interpolation per ms

  // ── Bag strip constants ──────────────────────────────────────────
  var BAG_SLOT_SIZE = 48;   // px per bag item box (≥48px for Magic Remote pointer accuracy)
  var BAG_SLOT_GAP  = 8;    // px between bag items
  var BAG_MAX       = 12;   // Max visible bag items before scroll

  // ── Seal / Close button constants ──────────────────────────────
  var SEAL_BTN_W    = 140;
  var SEAL_BTN_H    = 32;
  var CLOSE_BTN_W   = 100;  // slightly wider for "✕ Close" label
  var CLOSE_BTN_H   = 36;   // was 26 — bumped to ≥36px for Magic Remote tap accuracy

  // ── State ───────────────────────────────────────────────────────
  var _open       = false;
  var _containerX = -1;
  var _containerY = -1;
  var _floorId    = '';
  var _alpha      = 0;       // Fade in/out
  var _selectedSlot   = -1;  // Last-acted slot index (flash highlight)
  var _selectedFlash  = 0;   // Flash timer (ms) for last-acted slot
  var _sealFlash  = 0;       // Seal celebration timer (ms)

  // ── Bag strip state ────────────────────────────────────────────
  var _selectedBagIdx  = -1;  // Selected bag item index (-1 = none)
  var _selectedHandIdx = -1;  // Selected hand card index (-1 = none)
  var _bagRects        = [];  // Hit rects for bag items { x, y, w, h, index }
  var _handRects       = [];  // Hit rects for hand cards { x, y, w, h, index }

  // ── Button hit rects (updated each render frame) ───────────────
  var _sealBtnRect  = null;  // { x, y, w, h } or null if hidden
  var _closeBtnRect = null;  // { x, y, w, h }

  // ── Seal VFX state ─────────────────────────────────────────────
  var _sealFlashWhite = 0;   // White flash timer (ms)
  var _sealFlashGold  = 0;   // Gold flash timer (ms)
  var _sealTextScale  = 0;   // Seal text bounce scale (0→1.2→1.0)
  var _sealTextTimer  = 0;   // Seal text animation timer (ms)

  // ── Rejection highlight state ──────────────────────────────────
  var _rejectFlash    = 0;   // Rejection highlight timer (ms) — pulses bag + close

  // ── Stash scroll state ─────────────────────────────────────────
  var _scrollRow    = 0;     // Top visible row index (integer target)
  var _scrollSmooth = 0;     // Smooth scroll position (interpolated)

  // ── Open / Close ────────────────────────────────────────────────

  /**
   * Open the slot UI for a container at (x, y, floorId).
   * RS-5: delegates to RestockBridge (unified surface) when available.
   * Container must already exist in CrateSystem.
   */
  function open(x, y, floorId) {
    // RS-5: Prefer unified RestockSurface via RestockBridge
    if (typeof RestockBridge !== 'undefined' && typeof RestockSurface !== 'undefined') {
      var mode = RestockBridge.detectMode(x, y, floorId);
      if (mode) {
        RestockBridge.open(x, y, floorId, mode);
        return;
      }
    }

    // Legacy path (RestockSurface not loaded or detectMode returned null)
    if (typeof CrateSystem === 'undefined') return;
    var c = CrateSystem.getContainer(x, y, floorId);
    if (!c) return;

    _containerX = x;
    _containerY = y;
    _floorId    = floorId;
    _open       = true;
    _selectedSlot    = -1;
    _selectedBagIdx  = -1;
    _selectedHandIdx = -1;
    _sealFlash  = 0;
    _sealFlashWhite = 0;
    _sealFlashGold  = 0;
    _sealTextScale  = 0;
    _sealTextTimer  = 0;
    _rejectFlash = 0;
    _scrollRow    = 0;
    _scrollSmooth = 0;
    _bagRects     = [];
    _handRects    = [];
    _sealBtnRect  = null;
    _closeBtnRect = null;
  }

  function close() {
    // RS-5: Close unified surface if it's the active path
    if (typeof RestockBridge !== 'undefined' && RestockBridge.isActive()) {
      RestockBridge.close();
      return;
    }
    _open = false;
    _selectedSlot    = -1;
    _selectedBagIdx  = -1;
    _selectedHandIdx = -1;
  }

  function isOpen() {
    // RS-5: Report open if unified surface is active
    if (typeof RestockBridge !== 'undefined' && RestockBridge.isActive()) return true;
    return _open;
  }

  // ── Update (fade + seal flash) ──────────────────────────────────

  function update(dt) {
    if (_open) {
      _alpha = Math.min(1, _alpha + dt / 200);
    } else {
      _alpha = Math.max(0, _alpha - dt / 150);
    }
    if (_sealFlash > 0) {
      _sealFlash = Math.max(0, _sealFlash - dt);
    }
    // Seal VFX timers
    if (_sealFlashWhite > 0) _sealFlashWhite = Math.max(0, _sealFlashWhite - dt);
    if (_sealFlashGold > 0)  _sealFlashGold  = Math.max(0, _sealFlashGold - dt);
    if (_rejectFlash > 0)    _rejectFlash    = Math.max(0, _rejectFlash - dt);
    if (_selectedFlash > 0)  _selectedFlash  = Math.max(0, _selectedFlash - dt);
    if (_sealTextTimer > 0) {
      _sealTextTimer = Math.max(0, _sealTextTimer - dt);
      // Bounce curve: scale up 0→1.2 in first 200ms, settle 1.2→1.0 in next 300ms
      var t = 1.0 - (_sealTextTimer / 500);
      if (t < 0.4) {
        _sealTextScale = (t / 0.4) * 1.2;
      } else {
        _sealTextScale = 1.2 - 0.2 * ((t - 0.4) / 0.6);
      }
    }
    // Smooth scroll interpolation for stash grid
    if (_scrollSmooth !== _scrollRow) {
      var diff = _scrollRow - _scrollSmooth;
      var step = SCROLL_SPEED * dt * (Math.abs(diff) + 0.5);
      if (Math.abs(diff) < 0.01) {
        _scrollSmooth = _scrollRow;
      } else {
        _scrollSmooth += diff > 0 ? Math.min(step, diff) : Math.max(-step, diff);
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  function render(ctx, vpW, vpH) {
    if (_alpha <= 0) return;
    if (typeof CrateSystem === 'undefined') return;

    var c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    if (!c) { _open = false; return; }

    var slots = c.slots;
    var n = slots.length;

    // Route stash containers to grid renderer
    if (c.stash) {
      _renderStashGrid(ctx, vpW, vpH, c);
      return;
    }

    // ── Standard single-row layout (crate/corpse/small chest) ────

    // Determine if this is a deposit container (crate/corpse)
    var isDeposit = (c.type !== CrateSystem.TYPE.CHEST);
    var canSeal   = isDeposit && !c.sealed &&
                    CrateSystem.canSeal(_containerX, _containerY, _floorId);
    var allFilled = canSeal; // canSeal already checks all-filled

    // Get bag contents for deposit mode bag strip
    var bagItems = [];
    var handCards = [];  // For corpse mode — combat cards from hand
    var isCorpse = (c.type === CrateSystem.TYPE.CORPSE);
    if (isDeposit && !c.sealed) {
      var hasAuth = (typeof CardAuthority !== 'undefined');
      bagItems = hasAuth ? CardAuthority.getBag() : (typeof Player !== 'undefined' ? Player.state().bag : []);
      // Corpses also need hand/deck cards for SUIT_CARD slots
      if (isCorpse) {
        handCards = hasAuth ? CardAuthority.getHand() : (typeof Player !== 'undefined' ? (Player.state().hand || []) : []);
      }
    }

    // Panel dimensions — taller to fit seal button + bag/hand strips in deposit mode
    var rowW = n * SLOT_SIZE + (n - 1) * SLOT_GAP;
    var handStripH = (isCorpse && !c.sealed && handCards.length > 0) ? (BAG_SLOT_SIZE + 30) : 0;
    var bagStripH = (isDeposit && !c.sealed) ? (BAG_SLOT_SIZE + 30) : 0; // bag label + slots
    bagStripH += handStripH; // Corpses get both strips
    var sealRowH  = (isDeposit && !c.sealed) ? 42 : 0; // seal + close buttons row
    var panelW = Math.max(rowW + PANEL_PAD * 2, 320); // Min width for buttons
    var panelH = SLOT_SIZE + PANEL_PAD * 2 + 36 + sealRowH + bagStripH;
    var panelX = (vpW - panelW) / 2;
    var panelY = vpH * PANEL_Y_FRAC - panelH / 2;

    ctx.save();
    ctx.globalAlpha = _alpha;

    // Panel background
    _roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.fillStyle = 'rgba(8,6,16,0.88)';
    ctx.fill();
    var borderColor = c.sealed || c.depleted
      ? 'rgba(100,200,100,0.7)'
      : c.type === CrateSystem.TYPE.CHEST ? 'rgba(255,200,80,0.5)' : 'rgba(180,160,100,0.5)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    _roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.stroke();

    // Title
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var _t = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : function(k, d) { return d; };
    var title, titleColor;
    if (c.type === CrateSystem.TYPE.CHEST) {
      titleColor = '#ffd060';
      title = _t('ui.chest_title', 'TREASURE CHEST');
      if (c.depleted) title += ' — ' + _t('ui.chest_empty', 'EMPTY');
    } else if (c.type === CrateSystem.TYPE.CORPSE) {
      titleColor = '#d88';
      title = _t('ui.corpse_title', 'CORPSE STOCK');
      if (c.sealed) title += ' — ' + _t('ui.sealed', 'SEALED');
    } else {
      titleColor = '#d8c8a0';
      title = _t('ui.crate_title', 'SUPPLY CRATE');
      if (c.sealed) title += ' — ' + _t('ui.sealed', 'SEALED');
    }
    ctx.fillStyle = titleColor;
    ctx.fillText(title, vpW / 2, panelY + 8);

    // Slot row — store rects for pointer hit-testing
    var rowStartX = (vpW - rowW) / 2;
    var slotY = panelY + 28;
    _slotRects = [];

    // Pointer hover detection
    var ptr = (typeof InputManager !== 'undefined' && InputManager.getPointer)
              ? InputManager.getPointer() : null;
    var hoverIdx = -1;

    for (var i = 0; i < n; i++) {
      var sx = rowStartX + i * (SLOT_SIZE + SLOT_GAP);
      _slotRects.push({ x: sx, y: slotY, w: SLOT_SIZE, h: SLOT_SIZE, index: i });
      // Check pointer hover
      if (ptr && ptr.active &&
          ptr.x >= sx && ptr.x <= sx + SLOT_SIZE &&
          ptr.y >= slotY && ptr.y <= slotY + SLOT_SIZE) {
        hoverIdx = i;
      }
      // Highlight matching slots when bag item or hand card is selected
      var slotHighlight = false;
      if (isDeposit && !c.sealed && !slots[i].filled) {
        if (_selectedBagIdx >= 0 && slots[i].frameTag !== CrateSystem.FRAME.SUIT_CARD) {
          slotHighlight = true; // Resource slot for selected bag item
        }
        if (_selectedHandIdx >= 0) {
          // Highlight SUIT_CARD slots that match the selected hand card's suit
          var selHand = _getHandCards();
          var selCard = selHand[_selectedHandIdx];
          if (selCard && slots[i].frameTag === CrateSystem.FRAME.SUIT_CARD &&
              slots[i].suit === selCard.suit) {
            slotHighlight = true;
          }
        }
      }
      _renderSlot(ctx, slots[i], sx, slotY, i, c.sealed, i === hoverIdx, slotHighlight);
    }

    // ── Seal Button + Close Button row (deposit mode only) ───────
    _sealBtnRect  = null;
    _closeBtnRect = null;
    var btnRowY = slotY + SLOT_SIZE + 18; // Below frame tag labels

    // Count filled slots for tiered seal button state
    var filledSlotCount = 0;
    for (var fc = 0; fc < n; fc++) {
      if (slots[fc].filled) filledSlotCount++;
    }
    var someFilled = filledSlotCount > 0 && !allFilled;
    var rejectPulse = _rejectFlash > 0 ? (0.3 + 0.7 * Math.sin(_rejectFlash * 0.02)) : 0;

    if (isDeposit && !c.sealed) {
      // [F] SEAL button
      var sealX = vpW / 2 - SEAL_BTN_W / 2 - CLOSE_BTN_W / 2 - 8;
      var sealHover = ptr && ptr.active &&
        ptr.x >= sealX && ptr.x <= sealX + SEAL_BTN_W &&
        ptr.y >= btnRowY && ptr.y <= btnRowY + SEAL_BTN_H;

      _sealBtnRect = { x: sealX, y: btnRowY, w: SEAL_BTN_W, h: SEAL_BTN_H };

      if (allFilled) {
        // FULL — glowing gold, ready to seal
        var glowAlpha = 0.6 + 0.3 * Math.sin(Date.now() * 0.005);
        _roundRect(ctx, sealX, btnRowY, SEAL_BTN_W, SEAL_BTN_H, 6);
        ctx.fillStyle = sealHover ? 'rgba(80,60,10,0.95)' : 'rgba(40,30,8,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,60,' + glowAlpha + ')';
        ctx.lineWidth = sealHover ? 2.5 : 2;
        _roundRect(ctx, sealX, btnRowY, SEAL_BTN_W, SEAL_BTN_H, 6);
        ctx.stroke();
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sealHover ? '#ffe080' : '#ffd060';
        ctx.fillText('[F] \u2605 SEAL \u2605', sealX + SEAL_BTN_W / 2, btnRowY + SEAL_BTN_H / 2);
      } else if (someFilled) {
        // PARTIAL — warm amber, can seal with reduced reward
        _roundRect(ctx, sealX, btnRowY, SEAL_BTN_W, SEAL_BTN_H, 6);
        ctx.fillStyle = sealHover ? 'rgba(60,45,15,0.95)' : 'rgba(30,22,8,0.85)';
        ctx.fill();
        ctx.strokeStyle = sealHover ? 'rgba(220,160,60,0.7)' : 'rgba(180,130,40,0.5)';
        ctx.lineWidth = sealHover ? 2 : 1.5;
        _roundRect(ctx, sealX, btnRowY, SEAL_BTN_W, SEAL_BTN_H, 6);
        ctx.stroke();
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sealHover ? '#e0b040' : '#c09030';
        ctx.fillText('[F] SEAL (' + filledSlotCount + '/' + n + ')',
                     sealX + SEAL_BTN_W / 2, btnRowY + SEAL_BTN_H / 2);
      } else {
        // EMPTY — dim grey, seal will reject
        _roundRect(ctx, sealX, btnRowY, SEAL_BTN_W, SEAL_BTN_H, 6);
        ctx.fillStyle = 'rgba(20,18,14,0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,70,50,0.3)';
        ctx.lineWidth = 1;
        _roundRect(ctx, sealX, btnRowY, SEAL_BTN_W, SEAL_BTN_H, 6);
        ctx.stroke();
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(100,90,70,0.5)';
        ctx.fillText('[F] SEAL', sealX + SEAL_BTN_W / 2, btnRowY + SEAL_BTN_H / 2);
      }

      // [BACK] Close button — to the right of seal
      var closeX = sealX + SEAL_BTN_W + 16;
      var closeY = btnRowY + (SEAL_BTN_H - CLOSE_BTN_H) / 2;
      var closeHover = ptr && ptr.active &&
        ptr.x >= closeX && ptr.x <= closeX + CLOSE_BTN_W &&
        ptr.y >= closeY && ptr.y <= closeY + CLOSE_BTN_H;

      _closeBtnRect = { x: closeX, y: closeY, w: CLOSE_BTN_W, h: CLOSE_BTN_H };

      // Rejection flash pulses the close button red to draw attention
      var closeBorderColor = _rejectFlash > 0
        ? 'rgba(255,100,80,' + (0.3 + rejectPulse * 0.5) + ')'
        : closeHover ? 'rgba(180,170,140,0.6)' : 'rgba(100,90,70,0.3)';

      _roundRect(ctx, closeX, closeY, CLOSE_BTN_W, CLOSE_BTN_H, 4);
      ctx.fillStyle = closeHover ? 'rgba(50,45,35,0.9)' : 'rgba(25,22,18,0.7)';
      ctx.fill();
      ctx.strokeStyle = closeBorderColor;
      ctx.lineWidth = _rejectFlash > 0 ? 2 : 1;
      _roundRect(ctx, closeX, closeY, CLOSE_BTN_W, CLOSE_BTN_H, 4);
      ctx.stroke();
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = closeHover ? 'rgba(220,210,180,0.9)' : 'rgba(150,140,120,0.6)';
      ctx.fillText('\u2715 Close', closeX + CLOSE_BTN_W / 2, closeY + CLOSE_BTN_H / 2);

    } else if (c.type === CrateSystem.TYPE.CHEST && !c.depleted) {
      // Chest withdraw mode — just a close button
      var chCloseX = vpW / 2 - CLOSE_BTN_W / 2;
      var chCloseHover = ptr && ptr.active &&
        ptr.x >= chCloseX && ptr.x <= chCloseX + CLOSE_BTN_W &&
        ptr.y >= btnRowY && ptr.y <= btnRowY + CLOSE_BTN_H;

      _closeBtnRect = { x: chCloseX, y: btnRowY, w: CLOSE_BTN_W, h: CLOSE_BTN_H };

      _roundRect(ctx, chCloseX, btnRowY, CLOSE_BTN_W, CLOSE_BTN_H, 4);
      ctx.fillStyle = chCloseHover ? 'rgba(50,45,35,0.9)' : 'rgba(25,22,18,0.7)';
      ctx.fill();
      ctx.strokeStyle = chCloseHover ? 'rgba(180,170,140,0.6)' : 'rgba(100,90,70,0.3)';
      ctx.lineWidth = 1;
      _roundRect(ctx, chCloseX, btnRowY, CLOSE_BTN_W, CLOSE_BTN_H, 4);
      ctx.stroke();
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = chCloseHover ? 'rgba(220,210,180,0.9)' : 'rgba(150,140,120,0.6)';
      ctx.fillText('[BACK] Close', chCloseX + CLOSE_BTN_W / 2, btnRowY + CLOSE_BTN_H / 2);
    }

    // ── Bag Strip (deposit mode, unsealed only) ──────────────────
    _bagRects = [];
    if (isDeposit && !c.sealed && bagItems.length > 0) {
      var bagY = btnRowY + SEAL_BTN_H + 14;

      // "YOUR BAG" label — pulses on rejection to draw attention
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = _rejectFlash > 0
        ? 'rgba(255,180,80,' + (0.6 + rejectPulse * 0.4) + ')'
        : 'rgba(160,150,120,0.6)';
      ctx.fillText(_rejectFlash > 0 ? '\u25BC YOUR BAG \u25BC' : 'YOUR BAG', vpW / 2, bagY);

      var bagSlotY = bagY + 14;
      var visCount = Math.min(bagItems.length, BAG_MAX);
      var bagRowW  = visCount * BAG_SLOT_SIZE + (visCount - 1) * BAG_SLOT_GAP;
      var bagStartX = (vpW - bagRowW) / 2;

      for (var bi = 0; bi < visCount; bi++) {
        var bx = bagStartX + bi * (BAG_SLOT_SIZE + BAG_SLOT_GAP);
        _bagRects.push({ x: bx, y: bagSlotY, w: BAG_SLOT_SIZE, h: BAG_SLOT_SIZE, index: bi });

        var bagItem = bagItems[bi];
        var isSelected = (bi === _selectedBagIdx);
        var bagHover = ptr && ptr.active &&
          ptr.x >= bx && ptr.x <= bx + BAG_SLOT_SIZE &&
          ptr.y >= bagSlotY && ptr.y <= bagSlotY + BAG_SLOT_SIZE;

        // Bag slot background
        _roundRect(ctx, bx, bagSlotY, BAG_SLOT_SIZE, BAG_SLOT_SIZE, 4);
        ctx.fillStyle = isSelected ? 'rgba(60,50,20,0.95)'
                       : bagHover ? 'rgba(50,45,30,0.9)'
                       : 'rgba(20,18,14,0.8)';
        ctx.fill();

        // Border
        ctx.strokeStyle = isSelected ? '#ffd060'
                         : bagHover ? 'rgba(200,180,100,0.6)'
                         : 'rgba(80,70,50,0.4)';
        ctx.lineWidth = isSelected ? 2.5 : (bagHover ? 1.5 : 1);
        _roundRect(ctx, bx, bagSlotY, BAG_SLOT_SIZE, BAG_SLOT_SIZE, 4);
        ctx.stroke();

        // Item emoji
        if (bagItem) {
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(bagItem.emoji || '?', bx + BAG_SLOT_SIZE / 2, bagSlotY + BAG_SLOT_SIZE / 2 - 2);

          // Tiny name below
          if (bagItem.name) {
            ctx.font = '7px monospace';
            ctx.fillStyle = 'rgba(180,170,140,0.7)';
            var bname = bagItem.name.length > 6 ? bagItem.name.substring(0, 5) + '\u2026' : bagItem.name;
            ctx.fillText(bname, bx + BAG_SLOT_SIZE / 2, bagSlotY + BAG_SLOT_SIZE - 4);
          }
        }
      }

      // Overflow indicator
      if (bagItems.length > BAG_MAX) {
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(160,150,120,0.5)';
        ctx.fillText('+' + (bagItems.length - BAG_MAX), bagStartX + bagRowW + 6, bagSlotY + BAG_SLOT_SIZE / 2);
      }
    } else if (isDeposit && !c.sealed && bagItems.length === 0) {
      // Empty bag notice
      var emptyBagY = btnRowY + SEAL_BTN_H + 14;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(120,110,90,0.5)';
      ctx.fillText('BAG EMPTY', vpW / 2, emptyBagY);
    }

    // ── Hand/Deck Strip (corpse mode only — suit cards) ─────────
    _handRects = [];
    if (isCorpse && !c.sealed && handCards.length > 0) {
      // Position below bag strip (or below buttons if bag is empty)
      var handBaseY = (bagItems.length > 0)
        ? (btnRowY + SEAL_BTN_H + 14 + BAG_SLOT_SIZE + 28)
        : (btnRowY + SEAL_BTN_H + 14);

      // "YOUR HAND" label — red tint for combat cards
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = _rejectFlash > 0
        ? 'rgba(255,140,100,' + (0.6 + rejectPulse * 0.4) + ')'
        : 'rgba(200,120,120,0.6)';
      ctx.fillText(_rejectFlash > 0 ? '\u25BC YOUR HAND \u25BC' : 'YOUR HAND', vpW / 2, handBaseY);

      var handSlotY = handBaseY + 14;
      var handVisCount = Math.min(handCards.length, BAG_MAX);
      var handRowW = handVisCount * BAG_SLOT_SIZE + (handVisCount - 1) * BAG_SLOT_GAP;
      var handStartX = (vpW - handRowW) / 2;

      // Determine which suit the corpse needs (for highlighting matching cards)
      var neededSuit = c.suit || null;

      for (var hi = 0; hi < handVisCount; hi++) {
        var hx = handStartX + hi * (BAG_SLOT_SIZE + BAG_SLOT_GAP);
        _handRects.push({ x: hx, y: handSlotY, w: BAG_SLOT_SIZE, h: BAG_SLOT_SIZE, index: hi });

        var card = handCards[hi];
        var isHandSelected = (hi === _selectedHandIdx);
        var handHover = ptr && ptr.active &&
          hx <= ptr.x && ptr.x <= hx + BAG_SLOT_SIZE &&
          handSlotY <= ptr.y && ptr.y <= handSlotY + BAG_SLOT_SIZE;
        var suitMatch = card && neededSuit && card.suit === neededSuit;

        // Card slot background — matching suit gets green tint
        _roundRect(ctx, hx, handSlotY, BAG_SLOT_SIZE, BAG_SLOT_SIZE, 4);
        ctx.fillStyle = isHandSelected ? 'rgba(50,20,20,0.95)'
                       : handHover ? 'rgba(45,25,25,0.9)'
                       : suitMatch ? 'rgba(20,35,20,0.85)'
                       : 'rgba(20,15,15,0.8)';
        ctx.fill();

        // Border — suit match gets green, selected gets red-gold
        ctx.strokeStyle = isHandSelected ? '#ff6644'
                         : suitMatch ? '#60c060'
                         : handHover ? 'rgba(200,120,120,0.6)'
                         : 'rgba(100,60,60,0.4)';
        ctx.lineWidth = isHandSelected ? 2.5 : (suitMatch ? 2 : 1);
        _roundRect(ctx, hx, handSlotY, BAG_SLOT_SIZE, BAG_SLOT_SIZE, 4);
        ctx.stroke();

        // Card emoji + suit symbol
        if (card) {
          // Suit emoji in corner
          var SUIT_EMOJI = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = suitMatch ? '#80ff80' : 'rgba(180,140,140,0.7)';
          ctx.fillText(SUIT_EMOJI[card.suit] || '?', hx + 3, handSlotY + 2);

          // Card emoji center
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(card.emoji || '?', hx + BAG_SLOT_SIZE / 2, handSlotY + BAG_SLOT_SIZE / 2);

          // Tiny name
          if (card.name) {
            ctx.font = '7px monospace';
            ctx.fillStyle = 'rgba(200,160,160,0.7)';
            var cname = card.name.length > 6 ? card.name.substring(0, 5) + '\u2026' : card.name;
            ctx.fillText(cname, hx + BAG_SLOT_SIZE / 2, handSlotY + BAG_SLOT_SIZE - 4);
          }
        }
      }
    }

    // ── Hint text (simplified — buttons handle seal/close now) ───
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,170,140,0.5)';
    var hintY = panelY + panelH - 8;
    var _th = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : function(k, d) { return d; };
    if (c.type === CrateSystem.TYPE.CHEST) {
      if (c.depleted) {
        ctx.fillStyle = 'rgba(120,120,100,0.5)';
        ctx.fillText(_th('ui.hint_chest_empty', 'All items taken'), vpW / 2, hintY);
      } else {
        ctx.fillText(_th('ui.hint_chest_take', 'Tap item to take'), vpW / 2, hintY);
      }
    } else if (c.sealed) {
      ctx.fillText(_th('ui.hint_coins_earned', 'Coins earned') + ': ' + c.coinTotal, vpW / 2, hintY);
    } else {
      ctx.fillText(_th('ui.hint_deposit', 'Tap bag item → tap slot  ·  drag & drop'), vpW / 2, hintY);
    }

    // ── Hover Tooltip (above hovered slot) ─────────────────────
    if (hoverIdx >= 0 && hoverIdx < n && !c.sealed) {
      var hSlot    = slots[hoverIdx];
      var hDisplay = CrateSystem.getSlotDisplay(hSlot);
      var tipLines = [];

      if (hSlot.filled && hSlot.item) {
        tipLines.push(hSlot.item.name || hSlot.item.emoji || '?');
        tipLines.push(hDisplay.matched ? '\u2713 Match' : '\u2717 Mismatch');
      } else {
        tipLines.push('Needs: ' + hDisplay.label);
      }

      var tipFont  = Math.max(9, Math.round(11 * (SLOT_SIZE / 56))) + 'px monospace';
      ctx.font = tipFont;
      var tipPad   = 6;
      var lineH    = Math.round(SLOT_SIZE / 56 * 13);
      var tipW     = 0;
      for (var ti = 0; ti < tipLines.length; ti++) {
        var tw = ctx.measureText(tipLines[ti]).width;
        if (tw > tipW) tipW = tw;
      }
      tipW += tipPad * 2;
      var tipH = tipLines.length * lineH + tipPad * 2;
      var tipRect = _slotRects[hoverIdx];
      var tipX = tipRect.x + SLOT_SIZE / 2 - tipW / 2;
      var tipY = tipRect.y - tipH - 6;

      // Clamp to viewport
      if (tipX < 4) tipX = 4;
      if (tipX + tipW > vpW - 4) tipX = vpW - 4 - tipW;
      if (tipY < 4) tipY = tipRect.y + SLOT_SIZE + 6; // flip below if no room above

      _roundRect(ctx, tipX, tipY, tipW, tipH, 4);
      ctx.fillStyle = 'rgba(20,18,12,0.92)';
      ctx.fill();
      ctx.strokeStyle = hDisplay.color;
      ctx.lineWidth = 1;
      _roundRect(ctx, tipX, tipY, tipW, tipH, 4);
      ctx.stroke();

      ctx.font = tipFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var tl = 0; tl < tipLines.length; tl++) {
        ctx.fillStyle = tl === 0 ? 'rgba(230,220,190,0.95)'
                       : (hSlot.filled && hDisplay.matched ? '#8d8' : '#d88');
        ctx.fillText(tipLines[tl], tipX + tipW / 2, tipY + tipPad + tl * lineH);
      }
    }

    // ── Seal VFX Overlays ────────────────────────────────────────
    // These render OVER everything (full viewport flashes + text)
    if (_sealFlashWhite > 0) {
      ctx.globalAlpha = (_sealFlashWhite / 200) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, vpW, vpH);
    }
    if (_sealFlashGold > 0) {
      ctx.globalAlpha = (_sealFlashGold / 400) * 0.25;
      ctx.fillStyle = '#ffc83c';
      ctx.fillRect(0, 0, vpW, vpH);
    }
    if (_sealTextTimer > 0 && _sealTextScale > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, _sealTextTimer / 200);
      ctx.translate(vpW / 2, vpH * 0.30);
      ctx.scale(_sealTextScale, _sealTextScale);
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Gold text with dark outline
      ctx.strokeStyle = 'rgba(40,30,0,0.8)';
      ctx.lineWidth = 4;
      ctx.strokeText('\u2605 SEALED \u2605', 0, 0);
      ctx.fillStyle = '#ffd700';
      ctx.fillText('\u2605 SEALED \u2605', 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  // ── Stash Grid Renderer ────────────────────────────────────────
  //
  // Multi-row scrollable grid for large stash containers (home chest).
  // Shows GRID_VIS_ROWS rows of GRID_COLS slots. Arrow keys or pointer
  // scroll to reveal more rows. Filled slots are clickable for withdraw.

  function _renderStashGrid(ctx, vpW, vpH, c) {
    var slots = c.slots;
    var totalSlots = slots.length;
    var totalRows = Math.ceil(totalSlots / GRID_COLS);
    var visRows = Math.min(GRID_VIS_ROWS, totalRows);
    var S = GRID_SLOT_SIZE;
    var G = GRID_SLOT_GAP;

    // Grid pixel dimensions
    var gridW = GRID_COLS * S + (GRID_COLS - 1) * G;
    var gridH = visRows * S + (visRows - 1) * G;
    var panelW = gridW + GRID_PAD * 2;
    var panelH = gridH + GRID_PAD * 2 + 42; // title + hint + padding
    var panelX = (vpW - panelW) / 2;
    var panelY = vpH * PANEL_Y_FRAC - panelH / 2;

    ctx.save();
    ctx.globalAlpha = _alpha;

    // Panel background
    _roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.fillStyle = 'rgba(8,6,16,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,80,0.5)';
    ctx.lineWidth = 1.5;
    _roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.stroke();

    // Title
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffd060';
    var filledCount = 0;
    for (var fc = 0; fc < totalSlots; fc++) {
      if (slots[fc].filled) filledCount++;
    }
    ctx.fillText('STASH  (' + filledCount + '/' + totalSlots + ')',
                 vpW / 2, panelY + 8);

    // Scrollbar indicator (right edge)
    if (totalRows > visRows) {
      var sbX = panelX + panelW - 6;
      var sbTop = panelY + 28;
      var sbH = gridH;
      var thumbH = Math.max(12, sbH * (visRows / totalRows));
      var maxScroll = totalRows - visRows;
      var thumbY = sbTop + (_scrollSmooth / Math.max(1, maxScroll)) * (sbH - thumbH);

      ctx.fillStyle = 'rgba(80,70,50,0.3)';
      _roundRect(ctx, sbX, sbTop, 4, sbH, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,170,80,0.6)';
      _roundRect(ctx, sbX, thumbY, 4, thumbH, 2);
      ctx.fill();
    }

    // Grid origin
    var gridX = panelX + GRID_PAD;
    var gridY = panelY + 28;

    // Clipping region for the grid (hide slots that scroll out of view)
    ctx.save();
    ctx.beginPath();
    ctx.rect(gridX - 2, gridY - 2, gridW + 4, gridH + 4);
    ctx.clip();

    // Render slots with scroll offset
    var scrollPx = _scrollSmooth * (S + G);
    _slotRects = [];

    // Pointer hover detection for grid
    var gPtr = (typeof InputManager !== 'undefined' && InputManager.getPointer)
               ? InputManager.getPointer() : null;
    var gHoverIdx = -1;

    for (var row = 0; row < totalRows; row++) {
      var rowY = gridY + row * (S + G) - scrollPx;

      // Skip rows entirely off-screen
      if (rowY + S < gridY - S || rowY > gridY + gridH + S) continue;

      for (var col = 0; col < GRID_COLS; col++) {
        var idx = row * GRID_COLS + col;
        if (idx >= totalSlots) break;

        var sx = gridX + col * (S + G);
        var sy = rowY;
        var slot = slots[idx];

        // Store hit rect (only for visible area)
        if (sy + S > gridY && sy < gridY + gridH) {
          _slotRects.push({ x: sx, y: sy, w: S, h: S, index: idx });
          // Pointer hover check
          if (gPtr && gPtr.active &&
              gPtr.x >= sx && gPtr.x <= sx + S &&
              gPtr.y >= sy && gPtr.y <= sy + S) {
            gHoverIdx = idx;
          }
        }

        _renderGridSlot(ctx, slot, sx, sy, idx, idx === gHoverIdx);
      }
    }

    ctx.restore(); // remove clip

    // Hint text
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,170,140,0.7)';
    var hintY = panelY + panelH - 10;
    var _tg = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t.bind(i18n) : function(k, d) { return d; };
    if (totalRows > visRows) {
      ctx.fillText(_tg('ui.hint_stash_scroll', 'Scroll ↑↓  ·  Tap item to take  ·  ESC close'), vpW / 2, hintY);
    } else {
      ctx.fillText(_tg('ui.hint_stash_take', 'Tap item to take  ·  ESC close'), vpW / 2, hintY);
    }

    ctx.restore();
  }

  /** Render a single slot in the stash grid (smaller, no number key hint). */
  function _renderGridSlot(ctx, slot, x, y, index, hovered) {
    var display = CrateSystem.getSlotDisplay(slot);
    var S = GRID_SLOT_SIZE;

    // Background
    _roundRect(ctx, x, y, S, S, 4);
    ctx.fillStyle = hovered ? 'rgba(60,55,40,0.95)'
                   : slot.filled ? 'rgba(30,28,22,0.9)'
                   : 'rgba(15,12,8,0.5)';
    ctx.fill();

    // Border
    ctx.strokeStyle = hovered ? '#f0d070'
                     : slot.filled ? 'rgba(200,170,80,0.5)'
                     : 'rgba(60,55,40,0.3)';
    ctx.lineWidth = hovered ? 2 : 1;
    _roundRect(ctx, x, y, S, S, 4);
    ctx.stroke();

    // Item emoji
    if (slot.filled && slot.item) {
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(slot.item.emoji || '?', x + S / 2, y + S / 2 - 2);

      // Item name below emoji (tiny)
      if (slot.item.name) {
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(200,190,160,0.8)';
        var nm = slot.item.name.length > 7
          ? slot.item.name.substring(0, 6) + '…' : slot.item.name;
        ctx.fillText(nm, x + S / 2, y + S - 5);
      }
    } else if (!slot.filled && display.suitEmoji) {
      // Empty stash slot marker
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(80,70,50,0.4)';
      ctx.fillText(display.suitEmoji, x + S / 2, y + S / 2);
    }
  }

  // ── Standard single-slot renderer ──────────────────────────────

  function _renderSlot(ctx, slot, x, y, index, sealed, hovered, highlighted) {
    var display = CrateSystem.getSlotDisplay(slot);

    // Slot background — highlighted = green tint when matching selected bag item
    _roundRect(ctx, x, y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
    ctx.fillStyle = hovered ? 'rgba(60,55,40,0.95)'
                   : highlighted ? 'rgba(20,40,15,0.9)'
                   : slot.filled ? 'rgba(30,28,22,0.9)'
                   : 'rgba(15,12,8,0.7)';
    ctx.fill();

    // Frame border (resource colour, brighter on hover, green pulse when highlighted)
    ctx.strokeStyle = highlighted ? '#60c060'
                     : hovered ? '#f0d070' : display.color;
    ctx.lineWidth = highlighted ? 2.5
                   : hovered ? 2.5 : (slot.filled && display.matched ? 2.5 : 1.5);
    _roundRect(ctx, x, y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
    ctx.stroke();

    // Selection flash glow — brief gold pulse when slot receives an item
    if (_selectedSlot === index && _selectedFlash > 0) {
      ctx.save();
      ctx.globalAlpha = (_selectedFlash / 400) * 0.6;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      _roundRect(ctx, x - 2, y - 2, SLOT_SIZE + 4, SLOT_SIZE + 4, SLOT_RAD + 1);
      ctx.stroke();
      ctx.restore();
    }

    // Suit card watermark (large faded suit symbol)
    if (display.suitEmoji && !slot.filled) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.font = SUIT_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = display.color;
      ctx.fillText(display.suitEmoji, x + SLOT_SIZE / 2, y + SLOT_SIZE / 2);
      ctx.restore();
    }

    // Filled item emoji
    if (slot.filled && slot.item) {
      ctx.font = EMOJI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.item.emoji || '?', x + SLOT_SIZE / 2, y + SLOT_SIZE / 2);
    }

    // Match checkmark
    if (slot.filled && display.matched) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#8d8';
      ctx.fillText('✓', x + SLOT_SIZE - 3, y + 2);
    }

    // Slot number hint
    // Crate/corpse: show on empty slots (deposit prompt)
    // Chest: show on filled slots (withdraw prompt)
    var isChest = _isChestContainer();
    var showHint = isChest ? (slot.filled && !sealed) : (!slot.filled && !sealed);
    if (showHint) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(180,170,140,0.5)';
      ctx.fillText(String(index + 1), x + SLOT_SIZE / 2, y + SLOT_SIZE - 3);
    }

    // Frame tag label below slot
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(160,150,120,0.5)';
    var tagLabel = display.label;
    if (tagLabel.length > 8) tagLabel = tagLabel.substring(0, 8);
    ctx.fillText(tagLabel, x + SLOT_SIZE / 2, y + SLOT_SIZE + 1);
  }

  // ── Input handling ──────────────────────────────────────────────

  /**
   * Handle a key press while the slot UI is open.
   * Returns true if the key was consumed.
   *
   * @param {string} key - Key name (e.g. '1', '2', 's', 'Escape')
   * @returns {boolean}
   */
  function handleKey(key) {
    if (!_open) return false;
    if (typeof CrateSystem === 'undefined') return false;

    var c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    if (!c) { close(); return true; }

    // Escape closes
    if (key === 'Escape' || key === 'escape') {
      close();
      return true;
    }

    // Already sealed/depleted — any key closes
    if (c.sealed || c.depleted) {
      close();
      return true;
    }

    // ── CHEST (withdraw mode) ──────────────────────────────────
    if (c.type === CrateSystem.TYPE.CHEST) {
      // Stash grid: arrow key scrolling
      if (c.stash) {
        var totalRows = Math.ceil(c.slots.length / GRID_COLS);
        var maxScroll = Math.max(0, totalRows - GRID_VIS_ROWS);
        if (key === 'ArrowDown' || key === 'Down') {
          _scrollRow = Math.min(maxScroll, _scrollRow + 1);
          return true;
        }
        if (key === 'ArrowUp' || key === 'Up') {
          _scrollRow = Math.max(0, _scrollRow - 1);
          return true;
        }
        if (key === 'PageDown') {
          _scrollRow = Math.min(maxScroll, _scrollRow + GRID_VIS_ROWS);
          return true;
        }
        if (key === 'PageUp') {
          _scrollRow = Math.max(0, _scrollRow - GRID_VIS_ROWS);
          return true;
        }
        // Stash uses click-only for withdraw (no number keys — too many slots)
        return false;
      }

      // Small chest: number keys 1-5 withdraw item from slot
      var wNum = parseInt(key, 10);
      if (wNum >= 1 && wNum <= 5) {
        var wIdx = wNum - 1;
        if (wIdx < c.slots.length && c.slots[wIdx].filled) {
          _withdrawToBag(wIdx, c);
        }
        return true;
      }
      return false;
    }

    // ── CRATE / CORPSE (deposit mode) ──────────────────────────
    // F (interact key) or S seals — F is primary since it's the interact key
    if (key === 'f' || key === 'F' || key === 's' || key === 'S') {
      _attemptSeal(c);
      return true;
    }

    // Number keys 1-5: fill slot from bag
    var num = parseInt(key, 10);
    if (num >= 1 && num <= 5) {
      var slotIdx = num - 1;
      if (slotIdx < c.slots.length && !c.slots[slotIdx].filled) {
        _fillFromBag(slotIdx, c);
      }
      return true;
    }

    return false;
  }

  /**
   * Handle a pointer click while the slot UI is open.
   * Hit-tests against slot rects computed during render().
   *
   * CHEST withdraw: click a filled slot to take the item.
   * CRATE/CORPSE deposit: click an empty slot to fill from bag.
   *
   * @param {number} px - Pointer X in canvas coords
   * @param {number} py - Pointer Y in canvas coords
   * @returns {boolean} true if click was consumed
   */
  function handleClick(px, py) {
    if (!_open) return false;
    if (typeof CrateSystem === 'undefined') return false;

    var c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    if (!c) return false;

    // ── Seal button hit-test ─────────────────────────────────────
    if (_sealBtnRect) {
      var sb = _sealBtnRect;
      if (px >= sb.x && px <= sb.x + sb.w && py >= sb.y && py <= sb.y + sb.h) {
        _attemptSeal(c);
        return true;
      }
    }

    // ── Close button hit-test ────────────────────────────────────
    if (_closeBtnRect) {
      var cb = _closeBtnRect;
      if (px >= cb.x && px <= cb.x + cb.w && py >= cb.y && py <= cb.y + cb.h) {
        if (typeof PeekSlots !== 'undefined' && PeekSlots.close) {
          PeekSlots.close();
        } else {
          close();
        }
        return true;
      }
    }

    // ── Bag item hit-test ────────────────────────────────────────
    for (var bi = 0; bi < _bagRects.length; bi++) {
      var br = _bagRects[bi];
      if (px >= br.x && px <= br.x + br.w && py >= br.y && py <= br.y + br.h) {
        _handleBagItemClick(br.index, c);
        return true;
      }
    }

    // ── Hand card hit-test (corpse mode) ───────────────────────
    for (var hi = 0; hi < _handRects.length; hi++) {
      var hr = _handRects[hi];
      if (px >= hr.x && px <= hr.x + hr.w && py >= hr.y && py <= hr.y + hr.h) {
        _handleHandCardClick(hr.index, c);
        return true;
      }
    }

    // ── Crate/corpse slot hit-test (with bag/hand selection support) ──
    for (var i = 0; i < _slotRects.length; i++) {
      var r = _slotRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        if (c.type === CrateSystem.TYPE.CHEST) {
          // Chest withdraw: click filled slot to take
          if (r.index < c.slots.length && c.slots[r.index].filled) {
            _withdrawToBag(r.index, c);
          }
        } else {
          var slot = c.slots[r.index];
          // Hand card selected → fill SUIT_CARD slot
          if (_selectedHandIdx >= 0 && r.index < c.slots.length && !slot.filled &&
              slot.frameTag === CrateSystem.FRAME.SUIT_CARD) {
            _fillSuitCardFromHand(_selectedHandIdx, r.index, c);
            _selectedHandIdx = -1;
          }
          // Bag item selected → fill resource slot
          else if (_selectedBagIdx >= 0 && r.index < c.slots.length && !slot.filled) {
            _fillFromBagAt(_selectedBagIdx, r.index, c);
            _selectedBagIdx = -1;
          }
          // No selection → auto-fill from bag/hand
          else if (r.index < c.slots.length && !slot.filled) {
            _fillFromBag(r.index, c);
          }
        }
        return true;
      }
    }

    // Click on empty area deselects bag/hand item
    if (_selectedBagIdx >= 0 || _selectedHandIdx >= 0) {
      _selectedBagIdx  = -1;
      _selectedHandIdx = -1;
      return true;
    }

    return false;
  }

  /**
   * Handle clicking a bag item during deposit mode.
   * If exactly one empty slot matches, auto-fill it.
   * Otherwise, select the bag item and highlight matching empty slots.
   */
  function _handleBagItemClick(bagIdx, container) {
    if (_selectedBagIdx === bagIdx) {
      // Clicking the already-selected item deselects
      _selectedBagIdx = -1;
      return;
    }

    // Count empty slots
    var emptySlots = [];
    for (var i = 0; i < container.slots.length; i++) {
      if (!container.slots[i].filled) {
        emptySlots.push(i);
      }
    }

    if (emptySlots.length === 1) {
      // Exactly one empty slot — auto-fill it
      _fillFromBagAt(bagIdx, emptySlots[0], container);
      _selectedBagIdx = -1;
    } else if (emptySlots.length > 1) {
      // Multiple empty slots — select bag item, wait for slot click
      _selectedBagIdx = bagIdx;
    }
    // No empty slots — do nothing
  }

  /**
   * Handle clicking a hand card during corpse deposit mode.
   * If exactly one unfilled SUIT_CARD slot with matching suit exists, auto-fill.
   * Otherwise, select the card and highlight matching SUIT_CARD slots.
   */
  function _handleHandCardClick(handIdx, container) {
    if (_selectedHandIdx === handIdx) {
      _selectedHandIdx = -1;
      return;
    }
    _selectedBagIdx = -1; // Deselect bag when selecting hand

    var hasAuth = (typeof CardAuthority !== 'undefined');
    var hand = hasAuth ? CardAuthority.getHand()
             : (typeof Player !== 'undefined' ? (Player.state().hand || []) : []);
    var card = hand[handIdx];
    if (!card) return;

    // Find unfilled SUIT_CARD slots that match this card's suit
    var matchingSlots = [];
    for (var i = 0; i < container.slots.length; i++) {
      var s = container.slots[i];
      if (!s.filled && s.frameTag === CrateSystem.FRAME.SUIT_CARD && s.suit === card.suit) {
        matchingSlots.push(i);
      }
    }

    if (matchingSlots.length === 1) {
      _fillSuitCardFromHand(handIdx, matchingSlots[0], container);
      _selectedHandIdx = -1;
    } else if (matchingSlots.length > 1) {
      _selectedHandIdx = handIdx;
    } else {
      // No matching suit slots
      if (typeof Toast !== 'undefined') {
        var SUIT_EMOJI = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };
        Toast.show('No ' + (SUIT_EMOJI[card.suit] || '') + ' slot needs this card', 'info');
      }
    }
  }

  /**
   * Fill a SUIT_CARD slot from a specific hand card index.
   * Used by click-to-fill (hand card → suit slot) flow for corpses.
   */
  function _fillSuitCardFromHand(handIdx, slotIdx, container) {
    var hasAuthority = (typeof CardAuthority !== 'undefined');
    var hand = hasAuthority ? CardAuthority.getHand()
             : (typeof Player !== 'undefined' ? (Player.state().hand || []) : []);

    if (handIdx >= hand.length) return;
    var slot = container.slots[slotIdx];
    if (!slot || slot.filled) return;

    var card = hasAuthority
      ? CardAuthority.removeFromHand(handIdx)
      : hand.splice(handIdx, 1)[0];

    if (card) {
      var result = CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, card);
      if (result) {
        _selectedSlot  = slotIdx;
        _selectedFlash = 400;
        var SUIT_EMOJI = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };
        if (typeof Toast !== 'undefined') {
          Toast.show(
            (SUIT_EMOJI[card.suit] || '?') + ' ' + (card.name || 'Card') +
            ' \u2192 slot ' + (slotIdx + 1) + (result.matched ? ' \u2713' : '') +
            ' (+' + result.coins + 'g)', 'loot'
          );
        }
        if (result.coins > 0) {
          if (typeof CardTransfer !== 'undefined') {
            CardTransfer.lootGold(result.coins);
          } else if (typeof CardAuthority !== 'undefined') {
            CardAuthority.addGold(result.coins);
          }
        }
        if (typeof AudioSystem !== 'undefined') {
          AudioSystem.play('pickup-success');
        }
      }
    }
  }

  /**
   * Fill a specific crate slot from a specific bag index.
   * Used by click-to-fill (bag selection → slot click) flow.
   */
  function _fillFromBagAt(bagIdx, slotIdx, container) {
    var hasAuthority = (typeof CardAuthority !== 'undefined');
    var bag = hasAuthority ? CardAuthority.getBag()
            : (typeof Player !== 'undefined' ? Player.state().bag : []);

    if (bagIdx >= bag.length) return;
    var slot = container.slots[slotIdx];
    if (!slot || slot.filled) return;

    var item = hasAuthority
      ? CardAuthority.removeFromBag(bagIdx)
      : bag.splice(bagIdx, 1)[0];

    if (item) {
      var result = CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, item);
      if (result) {
        // Flash the slot that just received the item
        _selectedSlot  = slotIdx;
        _selectedFlash = 400;
        if (typeof Toast !== 'undefined') {
          var matchTxt = result.matched ? ' \u2713' : '';
          Toast.show(
            (item.emoji || '\uD83D\uDCE6') + ' \u2192 slot ' + (slotIdx + 1) + matchTxt +
            ' (+' + result.coins + 'g)', 'loot'
          );
        }
        if (result.coins > 0) {
          if (typeof CardTransfer !== 'undefined') {
            CardTransfer.lootGold(result.coins);
          } else if (typeof CardAuthority !== 'undefined') {
            CardAuthority.addGold(result.coins);
          }
        }
        if (typeof AudioSystem !== 'undefined') {
          AudioSystem.play('pickup-success');
        }
      }
    }
  }

  /**
   * Tiered seal attempt — routes to rejection, partial, or full seal path.
   *
   * NO slots hydrated   → reject: highlight bag row + escape button, Toast warning
   * ALL slots filled     → full seal via PeekSlots.trySeal(), max FX/coins
   * SOME slots filled    → partial seal via PeekSlots.trySeal(), mini FX
   *
   * After seal, fires a tooltip reporting the object type + next hero faction day.
   */
  function _attemptSeal(container) {
    if (!container || container.sealed) return;

    var slots = container.slots;
    var filledCount = 0;
    var totalCount  = slots.length;
    for (var i = 0; i < totalCount; i++) {
      if (slots[i].filled) filledCount++;
    }

    // ── REJECT: nothing filled at all ────────────────────────────
    if (filledCount === 0) {
      _rejectFlash = 600; // Triggers bag row + close button highlight pulse
      if (typeof Toast !== 'undefined') {
        Toast.show('Fill slots from your bag first!', 'warning');
      }
      if (typeof AudioSystem !== 'undefined') {
        AudioSystem.play('error');
      }
      return;
    }

    // ── FULL or PARTIAL seal ─────────────────────────────────────
    // canSeal checks all-filled; if not all filled we still allow partial seal
    var isFull = CrateSystem.canSeal(_containerX, _containerY, _floorId);

    if (isFull) {
      // Full seal — max coins, full VFX, delegate to PeekSlots
      if (typeof PeekSlots !== 'undefined' && PeekSlots.trySeal) {
        PeekSlots.trySeal();
      }
    } else {
      // Partial seal — seal with what we have, reduced reward
      // Force-seal via CrateSystem directly (bypass canSeal check)
      if (typeof CrateSystem.forceSeal === 'function') {
        var result = CrateSystem.forceSeal(_containerX, _containerY, _floorId);
        if (result) {
          // Mini FX — gold flash only, no white flash
          _sealFlash     = 500;
          _sealFlashGold = 250;
          _sealTextTimer = 400;
          _sealTextScale = 0;

          // Reduced coin award
          if (typeof CardTransfer !== 'undefined') {
            CardTransfer.lootGold(result.totalCoins);
          } else if (typeof CardAuthority !== 'undefined') {
            CardAuthority.addGold(result.totalCoins);
          }

          // Mini coin burst
          if (typeof ParticleFX !== 'undefined') {
            var cvs = document.getElementById('view-canvas');
            if (cvs && result.totalCoins > 0) {
              ParticleFX.coinBurst(cvs.width / 2, cvs.height * 0.4,
                                   Math.max(2, result.totalCoins));
            }
          }

          if (typeof Toast !== 'undefined') {
            Toast.show('Partially sealed +' + result.totalCoins + 'g', 'loot');
          }
          if (typeof AudioSystem !== 'undefined') {
            AudioSystem.play('pickup-success');
          }
        }
      } else {
        // CrateSystem.forceSeal not available — tell player to fill remaining
        if (typeof Toast !== 'undefined') {
          var remaining = totalCount - filledCount;
          Toast.show('Fill ' + remaining + ' more slot' +
                     (remaining > 1 ? 's' : '') + ' to seal!', 'info');
        }
        return;
      }
    }

    // ── Seal Tooltip — report object + next hero faction day ─────
    _showSealTooltip(container);
  }

  /**
   * Post-seal tooltip: "[Object] has been sealed and marked ready
   * in time for next [faction] day (in N days)."
   */
  function _showSealTooltip(container) {
    if (typeof Toast === 'undefined') return;

    var objName = 'Container';
    if (container.type === CrateSystem.TYPE.CRATE)  objName = 'Crate';
    if (container.type === CrateSystem.TYPE.CORPSE)  objName = 'Corpse';
    if (container.type === CrateSystem.TYPE.CHEST)   objName = 'Chest';

    // Look up the hero faction and their next scheduled day
    var factionInfo = '';
    if (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getGroupForFloor) {
      var groupId = DungeonSchedule.getGroupForFloor(_floorId);
      if (groupId) {
        var daysUntil = DungeonSchedule.getDaysUntilHeroDay(groupId);
        var FACTION_NAMES = {
          tide: 'Tide',  ember: 'Ember',  root: 'Root',
          iron: 'Iron',  shadow: 'Shadow'
        };
        var fName = FACTION_NAMES[groupId] || groupId;
        if (daysUntil > 0) {
          factionInfo = ' in time for next ' + fName + ' day (in ' + daysUntil + 'd)';
        } else if (daysUntil === 0) {
          factionInfo = ' \u2014 ' + fName + ' heroes arrive today!';
        } else {
          factionInfo = ' for the ' + fName + ' faction';
        }
      }
    }

    Toast.show(objName + ' sealed & marked ready' + factionInfo, 'loot', 3500);
  }

  /**
   * Trigger the seal celebration VFX sequence.
   * Called after a successful seal from handleClick or handleKey.
   */
  function _triggerSealVFX() {
    _sealFlash      = 800;
    _sealFlashWhite = 200;
    _sealFlashGold  = 400;
    _sealTextTimer  = 500;
    _sealTextScale  = 0;
  }

  /**
   * Fill a slot from the player's bag (first available item).
   * For suit card slots, searches for a combat card with matching suit.
   */
  function _fillFromBag(slotIdx, container) {
    if (typeof Player === 'undefined') return;
    var hasAuthority = (typeof CardAuthority !== 'undefined');

    var slot = container.slots[slotIdx];
    if (!slot || slot.filled) return;

    // Suit card slot: search hand for matching suit card
    if (slot.frameTag === CrateSystem.FRAME.SUIT_CARD) {
      var hand = hasAuthority ? CardAuthority.getHand() : Player.state().hand;
      for (var h = 0; h < hand.length; h++) {
        if (hand[h] && hand[h].suit === slot.suit) {
          // Remove card from hand via authority (mutates real state + fires event)
          var card = hasAuthority
            ? CardAuthority.removeFromHand(h)
            : hand.splice(h, 1)[0];
          if (card) {
            var suitResult = CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, card);
            _selectedSlot  = slotIdx;
            _selectedFlash = 400;
            if (typeof SessionStats !== 'undefined') SessionStats.inc('slotsFilled');
            if (suitResult && suitResult.coins > 0 && typeof Toast !== 'undefined') {
              Toast.show('+' + suitResult.coins + 'g \u2714 suit match!', 'loot');
            }
          }
          return;
        }
      }
      // No matching suit card found
      if (typeof Toast !== 'undefined') {
        var suitName = slot.suit || '?';
        Toast.show('Need a ' + (CrateSystem.SUIT_EMOJI[suitName] || '?') + ' card', 'info');
      }
      return;
    }

    // Resource slot: take first bag item
    var bag = hasAuthority ? CardAuthority.getBag() : Player.state().bag;
    if (bag.length === 0) {
      if (typeof Toast !== 'undefined') Toast.show('Bag is empty', 'info');
      return;
    }

    // Remove first bag item via authority (mutates real state + fires event)
    var item = hasAuthority
      ? CardAuthority.removeFromBag(0)
      : bag.splice(0, 1)[0];
    if (item) {
      var fillResult = CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, item);
      _selectedSlot  = slotIdx;
      _selectedFlash = 400;
      if (typeof SessionStats !== 'undefined') SessionStats.inc('slotsFilled');
      if (fillResult && fillResult.coins > 0 && typeof Toast !== 'undefined') {
        var fillMsg = '+' + fillResult.coins + 'g';
        if (fillResult.matched) fillMsg += ' \u2714 match!';
        Toast.show(fillMsg, fillResult.matched ? 'loot' : 'info');
      }
      if (typeof AudioSystem !== 'undefined') AudioSystem.play(fillResult && fillResult.matched ? 'slot-match' : 'slot-fill');
    }
  }

  /**
   * Withdraw an item from a chest slot into the player's bag.
   * Opposite of _fillFromBag — takes from container, gives to player.
   */
  function _withdrawToBag(slotIdx, container) {
    if (typeof CrateSystem === 'undefined') return;

    var item = CrateSystem.withdrawSlot(_containerX, _containerY, _floorId, slotIdx);
    if (!item) return;

    // Flash the slot that was just emptied
    _selectedSlot  = slotIdx;
    _selectedFlash = 400;

    // Add item to player's bag via authority or direct
    var hasAuthority = (typeof CardAuthority !== 'undefined');
    if (hasAuthority && typeof CardAuthority.addToBag === 'function') {
      CardAuthority.addToBag(item);
    } else if (typeof Player !== 'undefined') {
      var bag = Player.state().bag;
      bag.push(item);
    }

    // Toast feedback
    if (typeof Toast !== 'undefined') {
      Toast.show((item.emoji || '') + ' ' + (item.name || 'Item') + ' taken', 'loot');
    }

    // Audio feedback
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('chest_open');
    }

    // Fire withdraw callback (game.js uses this for work-keys gate unlock)
    if (_onWithdrawCb) {
      _onWithdrawCb(item, _containerX, _containerY, _floorId);
    }

    // Chests never disappear from the grid — they persist as furniture
    // even when fully emptied. The depleted flag marks them as empty for
    // visual feedback (ChestPeek shows "— empty", CrateUI shows "chest emptied")
    // but the CHEST tile stays in the grid.

    // SC-B: If the chest just transitioned to 'empty' phase and is a D3+
    // restockable chest, auto-close withdraw UI and toast the restock hint.
    // The player can re-interact to open in restock/deposit mode.
    var _c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    if (_c && _c.phase === 'empty' && _c.demandRefill) {
      if (typeof Toast !== 'undefined') {
        Toast.show('\u2728 Chest emptied \u2014 restock to earn coins', 'info');
      }
      // Brief delay so the player sees the last withdraw feedback,
      // then close the withdraw UI. Next interaction opens RestockSurface.
      setTimeout(function () {
        if (typeof PeekSlots !== 'undefined') {
          PeekSlots.close();
        } else {
          close();
        }
      }, 600);
    }
  }

  // ── Container type helper ───────────────────────────────────────

  function _isChestContainer() {
    if (typeof CrateSystem === 'undefined') return false;
    var c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    return c && c.type === CrateSystem.TYPE.CHEST;
  }

  /** Get current hand cards (for corpse suit-card slot highlighting). */
  function _getHandCards() {
    var hasAuth = (typeof CardAuthority !== 'undefined');
    return hasAuth ? CardAuthority.getHand()
         : (typeof Player !== 'undefined' ? (Player.state().hand || []) : []);
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

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Register a callback fired after every successful chest withdrawal.
   * @param {Function} fn - fn(item, x, y, floorId)
   */
  function onWithdraw(fn) { _onWithdrawCb = fn; }

  return {
    open:            open,
    close:           close,
    isOpen:          isOpen,
    update:          update,
    render:          render,
    handleKey:       handleKey,
    handleClick:     handleClick,
    onWithdraw:      onWithdraw,
    triggerSealVFX:  _triggerSealVFX
  };
})();

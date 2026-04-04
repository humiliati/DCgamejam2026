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

  // ── State ───────────────────────────────────────────────────────
  var _open       = false;
  var _containerX = -1;
  var _containerY = -1;
  var _floorId    = '';
  var _alpha      = 0;       // Fade in/out
  var _selectedSlot = -1;    // Highlighted slot index
  var _sealFlash  = 0;       // Seal celebration timer (ms)

  // ── Stash scroll state ─────────────────────────────────────────
  var _scrollRow    = 0;     // Top visible row index (integer target)
  var _scrollSmooth = 0;     // Smooth scroll position (interpolated)

  // ── Open / Close ────────────────────────────────────────────────

  /**
   * Open the slot UI for a container at (x, y, floorId).
   * Container must already exist in CrateSystem.
   */
  function open(x, y, floorId) {
    if (typeof CrateSystem === 'undefined') return;
    var c = CrateSystem.getContainer(x, y, floorId);
    if (!c) return;

    _containerX = x;
    _containerY = y;
    _floorId    = floorId;
    _open       = true;
    _selectedSlot = -1;
    _sealFlash  = 0;
    _scrollRow    = 0;
    _scrollSmooth = 0;
  }

  function close() {
    _open = false;
    _selectedSlot = -1;
  }

  function isOpen() { return _open; }

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
    // Panel dimensions
    var rowW = n * SLOT_SIZE + (n - 1) * SLOT_GAP;
    var panelW = rowW + PANEL_PAD * 2;
    var panelH = SLOT_SIZE + PANEL_PAD * 2 + 36; // Extra for title + hint
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
    var title, titleColor;
    if (c.type === CrateSystem.TYPE.CHEST) {
      titleColor = '#ffd060';
      title = 'TREASURE CHEST';
      if (c.depleted) title += ' - EMPTY';
    } else if (c.type === CrateSystem.TYPE.CORPSE) {
      titleColor = '#d88';
      title = 'CORPSE STOCK';
      if (c.sealed) title += ' - SEALED';
    } else {
      titleColor = '#d8c8a0';
      title = 'CRATE';
      if (c.sealed) title += ' - SEALED';
    }
    ctx.fillStyle = titleColor;
    ctx.fillText(title, vpW / 2, panelY + 8);

    // Slot row — store rects for pointer hit-testing
    var rowStartX = panelX + PANEL_PAD;
    var slotY = panelY + 28;
    _slotRects = [];

    for (var i = 0; i < n; i++) {
      var sx = rowStartX + i * (SLOT_SIZE + SLOT_GAP);
      _slotRects.push({ x: sx, y: slotY, w: SLOT_SIZE, h: SLOT_SIZE, index: i });
      _renderSlot(ctx, slots[i], sx, slotY, i, c.sealed);
    }

    // Hint text
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,170,140,0.7)';
    if (c.type === CrateSystem.TYPE.CHEST) {
      // Chest: withdraw mode
      if (c.depleted) {
        ctx.fillStyle = 'rgba(120,120,100,0.6)';
        ctx.fillText('chest emptied', vpW / 2, slotY + SLOT_SIZE + 8);
      } else {
        ctx.fillText('[1-' + n + '] take item    [ESC] close', vpW / 2, slotY + SLOT_SIZE + 8);
      }
    } else if (c.sealed) {
      ctx.fillText('coins earned: ' + c.coinTotal, vpW / 2, slotY + SLOT_SIZE + 8);
    } else if (CrateSystem.canSeal(_containerX, _containerY, _floorId)) {
      ctx.fillStyle = '#8d8';
      ctx.fillText('[S] Seal container', vpW / 2, slotY + SLOT_SIZE + 8);
    } else {
      ctx.fillText('[1-' + n + '] fill slot from bag    [ESC] close', vpW / 2, slotY + SLOT_SIZE + 8);
    }

    // Seal celebration flash (crates/corpses only)
    if (_sealFlash > 0) {
      ctx.globalAlpha = _alpha * (_sealFlash / 800);
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✦ SEALED ✦', vpW / 2, panelY - 10);
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
        }

        _renderGridSlot(ctx, slot, sx, sy, idx);
      }
    }

    ctx.restore(); // remove clip

    // Hint text
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,170,140,0.7)';
    var hintY = panelY + panelH - 10;
    if (totalRows > visRows) {
      ctx.fillText('[↑↓] scroll    [click] take    [ESC] close', vpW / 2, hintY);
    } else {
      ctx.fillText('[click] take item    [ESC] close', vpW / 2, hintY);
    }

    ctx.restore();
  }

  /** Render a single slot in the stash grid (smaller, no number key hint). */
  function _renderGridSlot(ctx, slot, x, y, index) {
    var display = CrateSystem.getSlotDisplay(slot);
    var S = GRID_SLOT_SIZE;

    // Background
    _roundRect(ctx, x, y, S, S, 4);
    ctx.fillStyle = slot.filled
      ? 'rgba(30,28,22,0.9)'
      : 'rgba(15,12,8,0.5)';
    ctx.fill();

    // Border
    ctx.strokeStyle = slot.filled
      ? 'rgba(200,170,80,0.5)'
      : 'rgba(60,55,40,0.3)';
    ctx.lineWidth = 1;
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

  function _renderSlot(ctx, slot, x, y, index, sealed) {
    var display = CrateSystem.getSlotDisplay(slot);

    // Slot background
    _roundRect(ctx, x, y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
    ctx.fillStyle = slot.filled
      ? 'rgba(30,28,22,0.9)'
      : 'rgba(15,12,8,0.7)';
    ctx.fill();

    // Frame border (resource colour)
    ctx.strokeStyle = display.color;
    ctx.lineWidth = slot.filled && display.matched ? 2.5 : 1.5;
    _roundRect(ctx, x, y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
    ctx.stroke();

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
    // Seal key
    if (key === 's' || key === 'S') {
      if (CrateSystem.canSeal(_containerX, _containerY, _floorId)) {
        var result = CrateSystem.seal(_containerX, _containerY, _floorId);
        if (result) {
          _sealFlash = 800;
          return true;
        }
      }
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

    // Hit-test against stored slot rects
    for (var i = 0; i < _slotRects.length; i++) {
      var r = _slotRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        // Slot hit — route to appropriate mode
        if (c.type === CrateSystem.TYPE.CHEST) {
          if (r.index < c.slots.length && c.slots[r.index].filled) {
            _withdrawToBag(r.index, c);
          }
        } else {
          if (r.index < c.slots.length && !c.slots[r.index].filled) {
            _fillFromBag(r.index, c);
          }
        }
        return true;
      }
    }
    return false;
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
            CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, card);
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
      CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, item);
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
  }

  // ── Container type helper ───────────────────────────────────────

  function _isChestContainer() {
    if (typeof CrateSystem === 'undefined') return false;
    var c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    return c && c.type === CrateSystem.TYPE.CHEST;
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
    open:        open,
    close:       close,
    isOpen:      isOpen,
    update:      update,
    render:      render,
    handleKey:   handleKey,
    handleClick: handleClick,
    onWithdraw:  onWithdraw
  };
})();

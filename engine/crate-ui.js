/**
 * CrateUI — canvas-rendered slot fill interface for crates and corpse stocks.
 *
 * When the player opens a container in Gleaner mode, renders a row of
 * framed slot boxes overlaid on the viewport. Each slot shows:
 *   • Frame border coloured by resource tag (RESOURCE_COLORs)
 *   • Fill state: empty (dim interior) or filled (item emoji centred)
 *   • Match indicator: ✓ for frame-matched fills
 *   • Suit card slots: suit emoji watermark + deep border
 *
 * Interaction: number keys 1-5 fill slots sequentially from the player's
 * bag. 'S' key seals when all slots are filled. Click/tap on individual
 * slots also works.
 *
 * Layer 2 — depends on: CrateSystem, Player, i18n (optional)
 */
var CrateUI = (function () {
  'use strict';

  // ── Layout constants ────────────────────────────────────────────
  var SLOT_SIZE     = 48;   // px per slot box
  var SLOT_GAP      = 8;    // px between slots
  var SLOT_RAD      = 6;    // Corner radius
  var PANEL_PAD     = 16;   // Padding around slot row
  var PANEL_Y_FRAC  = 0.38; // Vertical centre fraction (above middle)
  var LABEL_FONT    = '11px monospace';
  var EMOJI_FONT    = '22px sans-serif';
  var SUIT_FONT     = '28px sans-serif';
  var TITLE_FONT    = 'bold 13px monospace';

  // ── State ───────────────────────────────────────────────────────
  var _open       = false;
  var _containerX = -1;
  var _containerY = -1;
  var _floorId    = '';
  var _alpha      = 0;       // Fade in/out
  var _selectedSlot = -1;    // Highlighted slot index
  var _sealFlash  = 0;       // Seal celebration timer (ms)

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
  }

  // ── Render ──────────────────────────────────────────────────────

  function render(ctx, vpW, vpH) {
    if (_alpha <= 0) return;
    if (typeof CrateSystem === 'undefined') return;

    var c = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    if (!c) { _open = false; return; }

    var slots = c.slots;
    var n = slots.length;

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
    ctx.strokeStyle = c.sealed ? 'rgba(100,200,100,0.7)' : 'rgba(180,160,100,0.5)';
    ctx.lineWidth = 1.5;
    _roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.stroke();

    // Title
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = c.type === CrateSystem.TYPE.CORPSE ? '#d88' : '#d8c8a0';
    var title = c.type === CrateSystem.TYPE.CORPSE ? 'CORPSE STOCK' : 'CRATE';
    if (c.sealed) title += ' — SEALED';
    ctx.fillText(title, vpW / 2, panelY + 8);

    // Slot row
    var rowStartX = panelX + PANEL_PAD;
    var slotY = panelY + 28;

    for (var i = 0; i < n; i++) {
      var sx = rowStartX + i * (SLOT_SIZE + SLOT_GAP);
      _renderSlot(ctx, slots[i], sx, slotY, i, c.sealed);
    }

    // Hint text
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,170,140,0.7)';
    if (c.sealed) {
      ctx.fillText('coins earned: ' + c.coinTotal, vpW / 2, slotY + SLOT_SIZE + 8);
    } else if (CrateSystem.canSeal(_containerX, _containerY, _floorId)) {
      ctx.fillStyle = '#8d8';
      ctx.fillText('[S] Seal container', vpW / 2, slotY + SLOT_SIZE + 8);
    } else {
      ctx.fillText('[1-' + n + '] fill slot from bag    [ESC] close', vpW / 2, slotY + SLOT_SIZE + 8);
    }

    // Seal celebration flash
    if (_sealFlash > 0) {
      ctx.globalAlpha = _alpha * (_sealFlash / 800);
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✦ SEALED ✦', vpW / 2, panelY - 10);
    }

    ctx.restore();
  }

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

    // Slot number hint (when not sealed and not filled)
    if (!sealed && !slot.filled) {
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

    // Already sealed — any key closes
    if (c.sealed) {
      close();
      return true;
    }

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

  return {
    open:      open,
    close:     close,
    isOpen:    isOpen,
    update:    update,
    render:    render,
    handleKey: handleKey
  };
})();

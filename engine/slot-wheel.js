/**
 * SlotWheel — 5-visible scroll container for inventory arrays.
 *
 * Factory module: SlotWheel.create(opts) returns an independent WheelInstance.
 * Each instance renders a horizontal row of 5 slot boxes over a variable-length
 * data array. Keys 1-5 address the visible window; scrolling (Q/E, mouse wheel,
 * chevron click) shifts the window to reveal concealed items.
 *
 * Designed for three tableaux:
 *   - Restock (crate/corpse fill): bag wheel + hand strip
 *   - Shop sell: bag wheel + deck wheel (TAB focus toggle)
 *   - Bonfire stash: stash wheel + bag wheel (TAB focus toggle)
 *
 * Card-in-bag rendering: items with .suit or ._bagStored render as 🃏 with
 * a purple inner glow, per gone-rogue card vault pattern from EyesOnly.
 *
 * LG Magic Remote compatible: all interactions are clickable with 56×56
 * minimum touch targets, plus scroll wheel passthrough.
 *
 * Layer 2 (after DragDrop, before PeekSlots)
 * Depends on: DragDrop (optional), Player (optional), i18n (optional)
 *
 * @module SlotWheel
 */
var SlotWheel = (function () {
  'use strict';

  // ── Layout Constants ───────────────────────────────────────────────
  var SLOT_SIZE      = 56;   // px per slot box (Magic Remote 56px minimum)
  var SLOT_GAP       = 14;   // px between slots (gyro jitter clearance)
  var SLOT_RAD       = 6;    // Corner radius
  var VISIBLE_SLOTS  = 5;    // Always show 5 slot frames
  var CHEVRON_W      = 24;   // Chevron hit zone width
  var CHEVRON_GAP    = 6;    // Gap between chevron and slot row
  var LABEL_FONT     = '11px monospace';
  var EMOJI_FONT     = '22px sans-serif';
  var COUNT_FONT     = '11px monospace';
  var NUM_FONT       = '10px monospace';

  // Colours
  var BORDER_NORMAL  = 'rgba(180,180,160,0.7)';
  var BORDER_FOCUSED = 'rgba(255,215,0,0.9)';
  var BORDER_DIM     = 'rgba(180,180,160,0.3)';
  var INTERIOR_EMPTY = 'rgba(30,30,40,0.3)';
  var INTERIOR_OCC   = 'rgba(30,30,40,0.6)';
  var JOKER_GLOW     = 'rgba(128,0,255,0.15)';
  var CHEVRON_ACTIVE = 'rgba(200,200,180,0.8)';
  var CHEVRON_DIM    = 'rgba(200,200,180,0.25)';
  var NUM_COLOR      = 'rgba(200,200,180,0.6)';
  var COUNT_COLOR    = 'rgba(200,200,180,0.5)';
  var FOCUS_DIAMOND  = 'rgba(255,215,0,0.8)';
  var SELECTED_GLOW  = 'rgba(255,215,0,0.4)';

  // ── Helpers ────────────────────────────────────────────────────────

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

  /**
   * Detect whether an item is a card stored in the bag.
   * Cards have .suit, or are explicitly flagged _bagStored.
   */
  function _isCardInBag(item) {
    if (!item) return false;
    return item._bagStored === true || (item.suit !== undefined && item.value !== undefined);
  }

  /**
   * Get display emoji for an item.
   * Cards in bag → 🃏; regular items → their emoji or 📦 fallback.
   */
  function _getEmoji(item) {
    if (!item) return '';
    if (_isCardInBag(item)) return '\uD83C\uDCCF'; // 🃏
    return item.emoji || '\uD83D\uDCE6'; // 📦
  }

  // ── Factory ────────────────────────────────────────────────────────

  /**
   * Create a new SlotWheel instance.
   *
   * @param {Object} opts
   * @param {string}   opts.id        - Unique identifier ('bag', 'deck', 'stash')
   * @param {Function} opts.getData   - Returns the current data array (called each frame)
   * @param {Function} opts.getLabel  - Returns the count label string (e.g. 'bag 7/12')
   * @param {number}   opts.y         - Y position (canvas px, top of slot row)
   * @param {number}   opts.vpW       - Viewport width (for horizontal centering)
   * @param {Function} [opts.onSlotAction] - Called with (item, dataIndex, slotIdx) when key/click fires
   * @param {string}   [opts.emptyLabel]   - Shown when data is empty ('Empty bag')
   * @returns {WheelInstance}
   */
  function create(opts) {
    var _id        = opts.id || 'wheel';
    var _getData   = opts.getData;
    var _getLabel  = opts.getLabel || function () { return ''; };
    var _y         = opts.y || 0;
    var _vpW       = opts.vpW || 640;
    var _onSlotAction = opts.onSlotAction || null;
    var _emptyLabel   = opts.emptyLabel || '';

    var _offset    = 0;     // First visible data index
    var _focused   = false; // Gold border, responds to keys
    var _selected  = -1;    // Highlighted slot index (0-4), -1 = none
    var _zonesRegistered = false;
    var _zonePrefix = 'sw-' + _id + '-';

    // ── Computed Layout ──────────────────────────────────────────

    /**
     * Total row width (chevrons + slots + gaps).
     */
    function _rowWidth() {
      return CHEVRON_W + CHEVRON_GAP +
             VISIBLE_SLOTS * SLOT_SIZE + (VISIBLE_SLOTS - 1) * SLOT_GAP +
             CHEVRON_GAP + CHEVRON_W;
    }

    /**
     * Left edge X for the entire row (centred in viewport).
     */
    function _rowX() {
      return (_vpW - _rowWidth()) / 2;
    }

    /**
     * X position of slot index i (0-4).
     */
    function _slotX(i) {
      return _rowX() + CHEVRON_W + CHEVRON_GAP + i * (SLOT_SIZE + SLOT_GAP);
    }

    /**
     * Bounds for the left chevron.
     */
    function _leftChevronBounds() {
      return { x: _rowX(), y: _y, w: CHEVRON_W, h: SLOT_SIZE };
    }

    /**
     * Bounds for the right chevron.
     */
    function _rightChevronBounds() {
      var x = _rowX() + CHEVRON_W + CHEVRON_GAP +
              VISIBLE_SLOTS * SLOT_SIZE + (VISIBLE_SLOTS - 1) * SLOT_GAP +
              CHEVRON_GAP;
      return { x: x, y: _y, w: CHEVRON_W, h: SLOT_SIZE };
    }

    // ── Scroll ───────────────────────────────────────────────────

    function _maxOffset() {
      var len = _getData().length;
      return Math.max(0, len - VISIBLE_SLOTS);
    }

    function scroll(delta) {
      var prev = _offset;
      _offset = Math.max(0, Math.min(_maxOffset(), _offset + delta));
      return _offset !== prev; // true if scroll actually changed
    }

    function _canScrollLeft()  { return _offset > 0; }
    function _canScrollRight() { return _offset < _maxOffset(); }

    // ── Data Access ──────────────────────────────────────────────

    function getVisibleItem(slotIdx) {
      if (slotIdx < 0 || slotIdx >= VISIBLE_SLOTS) return null;
      var data = _getData();
      var idx = _offset + slotIdx;
      return idx < data.length ? data[idx] : null;
    }

    function getVisibleItems() {
      var data = _getData();
      var result = [];
      for (var i = 0; i < VISIBLE_SLOTS; i++) {
        var idx = _offset + i;
        result.push(idx < data.length ? data[idx] : null);
      }
      return result;
    }

    // ── Rendering ────────────────────────────────────────────────

    function render(ctx) {
      var data = _getData();
      var globalAlpha = ctx.globalAlpha;

      // Dim non-focused wheels (when another wheel has focus)
      if (!_focused) {
        ctx.globalAlpha = globalAlpha * 0.5;
      }

      // ── Focus ring ──
      if (_focused) {
        var rw = _rowWidth();
        var rx = _rowX();
        ctx.strokeStyle = BORDER_FOCUSED;
        ctx.lineWidth = 2;
        _roundRect(ctx, rx - 4, _y - 4, rw + 8, SLOT_SIZE + 8, 8);
        ctx.stroke();

        // Focus diamond marker
        ctx.fillStyle = FOCUS_DIAMOND;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u25C6', rx - 12, _y + SLOT_SIZE / 2); // ◆
      }

      // ── Left chevron ──
      var lcb = _leftChevronBounds();
      ctx.fillStyle = _canScrollLeft() ? CHEVRON_ACTIVE : CHEVRON_DIM;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25C0', lcb.x + lcb.w / 2, lcb.y + lcb.h / 2); // ◀

      // ── Slots ──
      for (var s = 0; s < VISIBLE_SLOTS; s++) {
        var sx = _slotX(s);
        var item = getVisibleItem(s);
        var isSelected = (_selected === s && _focused);

        // Slot background
        if (item) {
          ctx.fillStyle = INTERIOR_OCC;
        } else {
          ctx.fillStyle = INTERIOR_EMPTY;
        }
        _roundRect(ctx, sx, _y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
        ctx.fill();

        // Joker glow for cards in bag
        if (item && _isCardInBag(item)) {
          ctx.fillStyle = JOKER_GLOW;
          _roundRect(ctx, sx + 2, _y + 2, SLOT_SIZE - 4, SLOT_SIZE - 4, SLOT_RAD - 1);
          ctx.fill();
        }

        // Selected glow
        if (isSelected) {
          ctx.fillStyle = SELECTED_GLOW;
          _roundRect(ctx, sx, _y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
          ctx.fill();
        }

        // Border
        ctx.strokeStyle = _focused ? BORDER_FOCUSED : (item ? BORDER_NORMAL : BORDER_DIM);
        ctx.lineWidth = isSelected ? 2 : 1;
        _roundRect(ctx, sx, _y, SLOT_SIZE, SLOT_SIZE, SLOT_RAD);
        ctx.stroke();

        // Emoji
        if (item) {
          ctx.font = EMOJI_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText(_getEmoji(item), sx + SLOT_SIZE / 2, _y + SLOT_SIZE / 2);
        }

        // Slot number (only for occupied slots or when focused)
        if (item || _focused) {
          ctx.font = NUM_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = NUM_COLOR;
          ctx.fillText(String(s + 1), sx + SLOT_SIZE / 2, _y + SLOT_SIZE + 2);
        }
      }

      // ── Right chevron ──
      var rcb = _rightChevronBounds();
      ctx.fillStyle = _canScrollRight() ? CHEVRON_ACTIVE : CHEVRON_DIM;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25B6', rcb.x + rcb.w / 2, rcb.y + rcb.h / 2); // ▶

      // ── Count badge ──
      var label = _getLabel();
      if (label) {
        ctx.font = COUNT_FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = COUNT_COLOR;
        ctx.fillText(label, rcb.x + rcb.w, _y + SLOT_SIZE + 2);
      }

      // ── Empty state label ──
      if (data.length === 0 && _emptyLabel) {
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(200,200,180,0.4)';
        ctx.fillText(_emptyLabel, _vpW / 2, _y + SLOT_SIZE / 2);
      }

      // Restore alpha
      ctx.globalAlpha = globalAlpha;
    }

    // ── Hit Testing ──────────────────────────────────────────────

    /**
     * Test a pointer position against wheel elements.
     * @param {number} px - Pointer X
     * @param {number} py - Pointer Y
     * @returns {Object|null} { type: 'slot'|'chevron', slot?: 0-4, chevron?: 'left'|'right' }
     */
    function hitTest(px, py) {
      // Check slots
      for (var s = 0; s < VISIBLE_SLOTS; s++) {
        var sx = _slotX(s);
        if (px >= sx && px <= sx + SLOT_SIZE && py >= _y && py <= _y + SLOT_SIZE) {
          return { type: 'slot', slot: s };
        }
      }

      // Check left chevron
      var lcb = _leftChevronBounds();
      if (px >= lcb.x && px <= lcb.x + lcb.w && py >= lcb.y && py <= lcb.y + lcb.h) {
        return { type: 'chevron', chevron: 'left' };
      }

      // Check right chevron
      var rcb = _rightChevronBounds();
      if (px >= rcb.x && px <= rcb.x + rcb.w && py >= rcb.y && py <= rcb.y + rcb.h) {
        return { type: 'chevron', chevron: 'right' };
      }

      return null;
    }

    /**
     * Handle a pointer click at (px, py).
     * Returns true if the click was consumed.
     */
    function handleClick(px, py) {
      var hit = hitTest(px, py);
      if (!hit) return false;

      if (hit.type === 'chevron') {
        if (hit.chevron === 'left')  scroll(-1);
        if (hit.chevron === 'right') scroll(+1);
        return true;
      }

      if (hit.type === 'slot') {
        var item = getVisibleItem(hit.slot);
        if (item && _onSlotAction) {
          _onSlotAction(item, _offset + hit.slot, hit.slot);
        }
        return true;
      }

      return false;
    }

    // ── Focus / Selection ────────────────────────────────────────

    function setFocused(v) { _focused = !!v; }
    function isFocused()   { return _focused; }
    function setSelected(s) { _selected = s; }
    function getSelected()  { return _selected; }

    // ── DragDrop Zone Management ─────────────────────────────────

    function registerDragZones(opts) {
      if (typeof DragDrop === 'undefined') return;
      if (_zonesRegistered) unregisterDragZones();

      var onDrop    = (opts && opts.onDrop)    || null;
      var accepts   = (opts && opts.accepts)   || function () { return false; };
      var draggable = (opts && opts.draggable) || false;

      for (var i = 0; i < VISIBLE_SLOTS; i++) {
        (function (slotIdx) {
          var zoneId = _zonePrefix + slotIdx;
          var sx = _slotX(slotIdx);

          DragDrop.registerZone(zoneId, {
            x: sx, y: _y, w: SLOT_SIZE, h: SLOT_SIZE,
            accepts: function (payload) {
              return accepts(payload, slotIdx, getVisibleItem(slotIdx));
            },
            onDrop: function (payload) {
              if (onDrop) return onDrop(payload, slotIdx, getVisibleItem(slotIdx));
              return false;
            },
            onHover: function () {
              _selected = slotIdx;
            },
            onLeave: function () {
              if (_selected === slotIdx) _selected = -1;
            }
          });

          // If slots are drag sources (e.g., bag items can be dragged to container)
          if (draggable) {
            // DragDrop source registration handled externally via beginDrag
            // The slot bounds are available via getSlotBounds for hit-test
          }
        })(i);
      }

      _zonesRegistered = true;
    }

    function unregisterDragZones() {
      if (typeof DragDrop === 'undefined') return;
      for (var i = 0; i < VISIBLE_SLOTS; i++) {
        DragDrop.removeZone(_zonePrefix + i);
      }
      _zonesRegistered = false;
    }

    /**
     * Update DragDrop zone positions (call after layout change or scroll).
     */
    function updateDragZones() {
      if (typeof DragDrop === 'undefined' || !_zonesRegistered) return;
      for (var i = 0; i < VISIBLE_SLOTS; i++) {
        var sx = _slotX(i);
        DragDrop.updateZone(_zonePrefix + i, {
          x: sx, y: _y, w: SLOT_SIZE, h: SLOT_SIZE
        });
      }
    }

    // ── Layout Updates ───────────────────────────────────────────

    function updateLayout(vpW, y) {
      _vpW = vpW;
      if (y !== undefined) _y = y;
      if (_zonesRegistered) updateDragZones();
    }

    function getSlotBounds(slotIdx) {
      var sx = _slotX(slotIdx);
      return { x: sx, y: _y, w: SLOT_SIZE, h: SLOT_SIZE };
    }

    function getRowBounds() {
      return { x: _rowX(), y: _y, w: _rowWidth(), h: SLOT_SIZE + 16 };
    }

    // ── Cleanup ──────────────────────────────────────────────────

    function destroy() {
      unregisterDragZones();
      _offset = 0;
      _focused = false;
      _selected = -1;
    }

    // ── Clamp offset after data changes ──────────────────────────

    function clampOffset() {
      _offset = Math.max(0, Math.min(_maxOffset(), _offset));
    }

    // ── Public Instance API ──────────────────────────────────────

    return {
      id:               _id,
      render:           render,
      scroll:           scroll,
      getVisibleItem:   getVisibleItem,
      getVisibleItems:  getVisibleItems,
      getOffset:        function () { return _offset; },
      getDataLength:    function () { return _getData().length; },
      hitTest:          hitTest,
      handleClick:      handleClick,
      setFocused:       setFocused,
      isFocused:        isFocused,
      setSelected:      setSelected,
      getSelected:      getSelected,
      registerDragZones:   registerDragZones,
      unregisterDragZones: unregisterDragZones,
      updateDragZones:     updateDragZones,
      updateLayout:        updateLayout,
      getSlotBounds:       getSlotBounds,
      getRowBounds:        getRowBounds,
      clampOffset:         clampOffset,
      destroy:             destroy
    };
  }

  // ── Static Module API ──────────────────────────────────────────────

  return Object.freeze({
    create:     create,
    SLOT_SIZE:  SLOT_SIZE,
    SLOT_GAP:   SLOT_GAP,
    VISIBLE:    VISIBLE_SLOTS
  });
})();

/**
 * SupplyRows — right-half renderer for the restock surface.
 *
 * Displays labelled rows of drag-source items pulled from:
 *   - CardAuthority.getBag()       → 🎒 Bag row (always visible)
 *   - CardAuthority.getHand()      → 🃏 Hand row (corpse restock only)
 *   - CardAuthority.getEquipped()  → 🔧 Tools row (always visible)
 *
 * Each item box is a drag source. Clicking it calls DragDrop.beginDrag()
 * with a payload that RestockWheel's drop zones can accept/reject.
 *
 * Compatibility glow: items that match an unfilled container slot get a
 * green border; wildcard/generic matches get an amber border.
 *
 * Mount/unmount lifecycle managed by RestockSurface._populateSupply().
 *
 * Layer 2 — depends on: CardAuthority, DragDrop (optional),
 *           RestockWheel (optional, for compatibility glow), i18n (optional)
 *
 * @module SupplyRows
 */
var SupplyRows = (function () {
  'use strict';

  // ── Layout Constants ───────────────────────────────────────────────
  var ITEM_SIZE    = 48;   // px per item box (≥48px for Magic Remote)
  var ITEM_GAP     = 8;    // px between items
  var ROW_MAX_VIS  = 10;   // Max visible items per row before scroll
  var SCROLL_STEP  = 3;    // Items scrolled per click/key

  // ── Colour Tokens ──────────────────────────────────────────────────
  var BORDER_NORMAL   = 'rgba(180,180,160,0.4)';
  var BORDER_COMPAT   = 'rgba(80,220,80,0.7)';
  var BORDER_GENERIC  = 'rgba(220,200,80,0.6)';
  var BORDER_INCOMPAT = 'rgba(180,180,160,0.2)';
  var BG_NORMAL       = 'rgba(30,30,40,0.4)';
  var BG_HOVER        = 'rgba(50,50,30,0.5)';
  var LABEL_COLOR     = 'rgba(200,190,170,0.6)';
  var TEXT_DIM        = 'rgba(200,190,170,0.4)';

  // ── State ──────────────────────────────────────────────────────────
  var _mounted    = false;
  var _parentEl   = null;
  var _mode       = 'crate';
  var _containerX = -1;
  var _containerY = -1;
  var _floorId    = '';

  // Per-row scroll offsets
  var _scrollBag  = 0;
  var _scrollHand = 0;

  // Row container elements
  var _bagRowEl   = null;
  var _handRowEl  = null;
  var _toolRowEl  = null;

  // ── Mount / Unmount ────────────────────────────────────────────────

  function mount(parentEl, mode, x, y, floorId) {
    if (_mounted) unmount();

    _parentEl   = parentEl;
    _mode       = mode || 'crate';
    _containerX = x;
    _containerY = y;
    _floorId    = floorId || '';
    _scrollBag  = 0;
    _scrollHand = 0;
    _mounted    = true;

    _render();
  }

  function unmount() {
    _bagRowEl  = null;
    _handRowEl = null;
    _toolRowEl = null;
    if (_parentEl) _parentEl.innerHTML = '';
    _mounted   = false;
    _parentEl  = null;
  }

  // ── Rendering ──────────────────────────────────────────────────────

  function _render() {
    if (!_parentEl) return;
    _parentEl.innerHTML = '';

    var unfilledTags = _getUnfilledTags();

    // 🎒 Bag row — always visible
    _bagRowEl = _renderRow(
      '\uD83C\uDF92 Bag',    // 🎒
      'bag',
      _getBag(),
      unfilledTags,
      _scrollBag
    );
    _parentEl.appendChild(_bagRowEl);

    // 🃏 Hand row — corpse mode only
    if (_mode === 'corpse') {
      _handRowEl = _renderRow(
        '\uD83C\uDCCF Hand',  // 🃏
        'hand',
        _getHand(),
        unfilledTags,
        _scrollHand
      );
      _parentEl.appendChild(_handRowEl);
    }

    // 🔧 Tools row — always visible
    _toolRowEl = _renderRow(
      '\uD83D\uDD27 Equipped', // 🔧
      'tool',
      _getEquipped(),
      unfilledTags,
      0    // tools don't scroll (max 3-4 slots)
    );
    _parentEl.appendChild(_toolRowEl);
  }

  /**
   * Render a single labelled row of item boxes.
   */
  function _renderRow(label, sourceType, items, unfilledTags, scrollOffset) {
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:10px;';

    // Label
    var labelEl = document.createElement('div');
    labelEl.style.cssText =
      'font-size:11px;color:' + LABEL_COLOR + ';margin-bottom:4px;padding:0 2px;';
    labelEl.textContent = label + ' (' + items.length + ')';
    row.appendChild(labelEl);

    if (items.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'font-size:10px;color:' + TEXT_DIM + ';padding:4px;';
      empty.textContent = sourceType === 'hand' ? 'No cards in hand' :
                          sourceType === 'tool' ? 'Nothing equipped' : 'Empty';
      row.appendChild(empty);
      return row;
    }

    // Item strip wrapper (with scroll arrows if needed)
    var stripWrap = document.createElement('div');
    stripWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';

    // Left scroll arrow
    var needsScroll = items.length > ROW_MAX_VIS;
    if (needsScroll) {
      var leftArr = _createScrollArrow('\u25C0', scrollOffset > 0, function () {
        if (sourceType === 'bag') _scrollBag = Math.max(0, _scrollBag - SCROLL_STEP);
        else if (sourceType === 'hand') _scrollHand = Math.max(0, _scrollHand - SCROLL_STEP);
        _render();
      });
      stripWrap.appendChild(leftArr);
    }

    // Item boxes
    var strip = document.createElement('div');
    strip.style.cssText =
      'display:flex;gap:' + ITEM_GAP + 'px;flex-wrap:nowrap;overflow:hidden;';

    var end = Math.min(items.length, scrollOffset + ROW_MAX_VIS);
    for (var i = scrollOffset; i < end; i++) {
      var item = items[i];
      var compat = _getCompatibility(item, unfilledTags);
      var box = _createItemBox(item, i, sourceType, compat);
      strip.appendChild(box);
    }

    stripWrap.appendChild(strip);

    // Right scroll arrow
    if (needsScroll) {
      var maxOff = Math.max(0, items.length - ROW_MAX_VIS);
      var rightArr = _createScrollArrow('\u25B6', scrollOffset < maxOff, function () {
        var mx = Math.max(0, items.length - ROW_MAX_VIS);
        if (sourceType === 'bag') _scrollBag = Math.min(mx, _scrollBag + SCROLL_STEP);
        else if (sourceType === 'hand') _scrollHand = Math.min(mx, _scrollHand + SCROLL_STEP);
        _render();
      });
      stripWrap.appendChild(rightArr);
    }

    row.appendChild(stripWrap);
    return row;
  }

  /**
   * Create a scroll arrow button.
   */
  function _createScrollArrow(symbol, active, onClick) {
    var btn = document.createElement('div');
    btn.style.cssText =
      'width:36px;height:' + ITEM_SIZE + 'px;display:flex;align-items:center;' +
      'justify-content:center;cursor:' + (active ? 'pointer' : 'default') + ';' +
      'color:' + (active ? 'rgba(200,200,180,0.8)' : 'rgba(200,200,180,0.2)') + ';' +
      'font-size:14px;user-select:none;flex-shrink:0;';
    btn.textContent = symbol;
    if (active) {
      btn.addEventListener('click', onClick);
    }
    return btn;
  }

  /**
   * Create a single item box element (drag source).
   */
  function _createItemBox(item, dataIndex, sourceType, compat) {
    var borderColor = BORDER_NORMAL;
    if (compat === 'match')   borderColor = BORDER_COMPAT;
    if (compat === 'generic') borderColor = BORDER_GENERIC;
    if (compat === 'none')    borderColor = BORDER_INCOMPAT;

    var el = document.createElement('div');
    el.style.cssText =
      'width:' + ITEM_SIZE + 'px;height:' + ITEM_SIZE + 'px;' +
      'border-radius:4px;border:2px solid ' + borderColor + ';' +
      'background:' + BG_NORMAL + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:18px;cursor:grab;position:relative;' +
      'transition:border-color 150ms,background 150ms;' +
      'box-sizing:border-box;flex-shrink:0;';
    el.title = (item.name || item.id || '') +
      (compat === 'match' ? ' ✓ matches slot' : compat === 'generic' ? ' ~ generic fill' : '');

    // Emoji
    var emoji = document.createElement('span');
    emoji.style.cssText = 'pointer-events:none;line-height:1;';
    emoji.textContent = item.emoji || '\uD83D\uDCE6'; // 📦
    el.appendChild(emoji);

    // Quantity badge (if stackable)
    if (item.qty && item.qty > 1) {
      var qty = document.createElement('div');
      qty.style.cssText =
        'position:absolute;bottom:1px;right:2px;font-size:8px;' +
        'color:rgba(200,200,180,0.7);pointer-events:none;';
      qty.textContent = 'x' + item.qty;
      el.appendChild(qty);
    }

    // Card-in-bag indicator
    if (item.suit || item._bagStored) {
      var cardBadge = document.createElement('div');
      cardBadge.style.cssText =
        'position:absolute;top:1px;left:2px;font-size:8px;' +
        'color:rgba(128,0,255,0.7);pointer-events:none;';
      cardBadge.textContent = '\uD83C\uDCCF'; // 🃏
      el.appendChild(cardBadge);
    }

    // Compatibility glow (box-shadow)
    if (compat === 'match') {
      el.style.boxShadow = '0 0 8px rgba(80,220,80,0.3)';
    } else if (compat === 'generic') {
      el.style.boxShadow = '0 0 6px rgba(220,200,80,0.2)';
    }

    // Hover effects
    el.addEventListener('mouseenter', function () {
      el.style.background = BG_HOVER;
    });
    el.addEventListener('mouseleave', function () {
      el.style.background = BG_NORMAL;
    });

    // Click → begin drag (or direct action if DragDrop unavailable)
    el.addEventListener('mousedown', function (e) {
      _startItemDrag(item, dataIndex, sourceType, e);
    });
    el.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      _startItemDrag(item, dataIndex, sourceType, { clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });

    return el;
  }

  // ── Drag Initiation ────────────────────────────────────────────────

  function _startItemDrag(item, dataIndex, sourceType, e) {
    if (typeof DragDrop === 'undefined') return;

    var payload = {
      type: sourceType,   // 'bag' | 'hand' | 'tool'
      zone: 'supply-' + sourceType,
      index: dataIndex,
      data: item
    };

    var vp = document.getElementById('viewport');
    var vpRect = vp ? vp.getBoundingClientRect() : { left: 0, top: 0 };
    var cx = (e.clientX || 0) - vpRect.left;
    var cy = (e.clientY || 0) - vpRect.top;

    DragDrop.beginDrag(payload, {
      ghostEmoji: item.emoji || '\uD83D\uDCE6',
      ghostLabel: item.name || '',
      ghostColor: 'rgba(240,230,210,0.9)',
      sourceZone: 'supply-' + sourceType + '-' + dataIndex,
      clientX: e.clientX || 0,
      clientY: e.clientY || 0,
      onCancel: function () { /* no-op for supply items */ }
    }, cx, cy);
  }

  // ── Compatibility Glow Logic ───────────────────────────────────────

  /**
   * Determine how well an item matches the current container's unfilled slots.
   * Returns: 'match' | 'generic' | 'none'
   */
  function _getCompatibility(item, unfilledTags) {
    if (!unfilledTags || unfilledTags.length === 0) return 'none';
    if (typeof RestockWheel === 'undefined') return 'none';

    var hasExact   = false;
    var hasGeneric = false;

    for (var i = 0; i < unfilledTags.length; i++) {
      var tag = unfilledTags[i];
      if (RestockWheel.doesItemMatchSlot(item, tag)) {
        // Distinguish exact vs generic
        if (tag === 'wildcard') {
          hasGeneric = true;
        } else if (item.crateFillTag === 'WILDCARD') {
          hasGeneric = true;
        } else {
          hasExact = true;
        }
      }
    }

    if (hasExact)   return 'match';
    if (hasGeneric) return 'generic';
    return 'none';
  }

  /**
   * Get the unfilled frame tags from RestockWheel.
   */
  function _getUnfilledTags() {
    if (typeof RestockWheel !== 'undefined' && RestockWheel.getUnfilledFrameTags) {
      return RestockWheel.getUnfilledFrameTags();
    }
    return [];
  }

  // ── Data Access ────────────────────────────────────────────────────

  function _getBag() {
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getBag) {
      return CardAuthority.getBag();
    }
    return [];
  }

  function _getHand() {
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getHand) {
      return CardAuthority.getHand();
    }
    return [];
  }

  function _getEquipped() {
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getEquipped) {
      return CardAuthority.getEquipped().filter(function (e) { return e != null; });
    }
    return [];
  }

  // ── Per-frame Update ───────────────────────────────────────────────

  function update(dt) {
    // Lightweight — compatibility glow re-evaluated on full render only
    // (triggered by RestockSurface.refreshSupply after a fill)
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    mount:     mount,
    unmount:   unmount,
    update:    update,
    isMounted: function () { return _mounted; }
  };
})();

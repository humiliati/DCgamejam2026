/**
 * RestockWheel — container slot renderer for the restock surface's left half.
 *
 * Renders CrateSystem container slots as a vertical flex of DOM boxes.
 * Each slot is a DragDrop target zone. Slot visuals reflect fill state,
 * frame tag colour, and compatibility with the currently-dragged item.
 *
 * RS-1 supports 'crate' mode only. RS-2 adds 'torch', RS-3 adds 'corpse'.
 *
 * Mount/unmount lifecycle managed by RestockSurface._populateWheel().
 *
 * Layer 2 — depends on: CrateSystem, DragDrop (optional), CardAuthority (optional),
 *           i18n (optional)
 *
 * @module RestockWheel
 */
var RestockWheel = (function () {
  'use strict';

  // ── Layout Constants ───────────────────────────────────────────────
  var SLOT_SIZE     = 56;   // px — Magic Remote 56px minimum
  var SLOT_GAP      = 14;   // px — gyro jitter clearance
  var SLOT_RAD      = 6;    // px — corner radius

  // ── Colour Tokens ──────────────────────────────────────────────────
  var BORDER_EMPTY    = 'rgba(180,180,160,0.5)';
  var BORDER_FILLED   = 'rgba(80,180,80,0.6)';
  var BORDER_MATCH    = 'rgba(80,255,80,0.8)';
  var BORDER_WILDCARD = 'rgba(220,200,80,0.6)';
  var BORDER_HOVER    = 'rgba(255,215,0,0.9)';
  var BG_EMPTY        = 'rgba(30,30,40,0.3)';
  var BG_FILLED       = 'rgba(30,60,30,0.4)';
  var BG_HOVER        = 'rgba(50,50,30,0.4)';
  var LABEL_DIM       = 'rgba(200,190,170,0.5)';
  var PULSE_GLOW      = 'rgba(255,215,0,0.15)';

  // Frame tag → border color map (mirrors CrateSystem.FRAME_COLOR)
  var FRAME_COLOR = {
    hp_food:     '#FF6B9D',
    energy_food: '#00D4FF',
    battery:     '#00FFA6',
    scroll:      '#C080FF',
    gem:         '#FFD700',
    wildcard:    '#BBBBBB',
    suit_card:   '#FF4466'
  };

  // Frame tag → emoji
  var FRAME_EMOJI = {
    hp_food:     '\u2764\uFE0F',   // ❤️
    energy_food: '\u26A1',          // ⚡
    battery:     '\uD83D\uDD0B',   // 🔋
    scroll:      '\uD83D\uDCDC',   // 📜
    gem:         '\uD83D\uDC8E',   // 💎
    wildcard:    '\u2B50',          // ⭐
    suit_card:   '\uD83C\uDCCF'    // 🃏
  };

  // ── RS-2: Torch Colour Tokens ─────────────────────────────────────
  var TORCH_BORDER = {
    flame:          'rgba(255,140,20,0.8)',
    fuel_hydrated:  'rgba(80,180,255,0.7)',
    fuel_dry:       'rgba(180,140,80,0.6)',
    empty:          'rgba(180,180,160,0.5)'
  };
  var TORCH_BG = {
    flame:          'rgba(80,30,0,0.4)',
    fuel_hydrated:  'rgba(20,40,60,0.4)',
    fuel_dry:       'rgba(50,40,20,0.35)',
    empty:          'rgba(30,30,40,0.3)'
  };
  var TORCH_EMOJI = {
    flame:          '\uD83D\uDD25',   // 🔥
    fuel_hydrated:  '\uD83D\uDCA7',   // 💧
    fuel_dry:       '\uD83E\uDEB5',   // 🪵
    empty:          '\u25CB'           // ○
  };
  var TORCH_LABEL = {
    flame:          'FLAME',
    fuel_hydrated:  'WET',
    fuel_dry:       'DRY',
    empty:          'EMPTY'
  };

  // ── State ──────────────────────────────────────────────────────────
  var _mounted     = false;
  var _parentEl    = null;
  var _containerX  = -1;
  var _containerY  = -1;
  var _floorId     = '';
  var _mode        = 'crate';
  var _slotEls     = [];           // DOM elements for each slot
  var _zonePrefix  = 'rw-slot-';
  var _zonesRegistered = false;

  // ── Readiness bar state ────────────────────────────────────────────
  var _readinessEl = null;

  // ── Mount / Unmount ────────────────────────────────────────────────

  /**
   * Mount the wheel into the given parent DOM element.
   * Called by RestockSurface._populateWheel().
   */
  function mount(parentEl, x, y, floorId, mode) {
    if (_mounted) unmount();

    _parentEl   = parentEl;
    _containerX = x;
    _containerY = y;
    _floorId    = floorId;
    _mode       = mode || 'crate';
    _mounted    = true;

    _render();
    if (_mode === 'torch') { _registerTorchZones(); }
    else { _registerZones(); }
  }

  /**
   * Unmount the wheel, removing DOM and DragDrop zones.
   */
  function unmount() {
    _unregisterZones();
    _slotEls = [];
    _readinessEl = null;
    if (_parentEl) _parentEl.innerHTML = '';
    _mounted = false;
    _parentEl = null;
  }

  // ── Rendering ──────────────────────────────────────────────────────

  function _render() {
    if (!_parentEl) return;
    _parentEl.innerHTML = '';
    _slotEls = [];

    // RS-2: Torch mode reads from TorchState, not CrateSystem
    if (_mode === 'torch') {
      _renderTorch();
      return;
    }

    var container = _getContainer();
    if (!container || !container.slots) {
      _parentEl.innerHTML = '<div style="color:' + LABEL_DIM +
        ';font-size:11px;">No container found</div>';
      return;
    }

    // Slot row: flex wrap, centred
    var slotRow = document.createElement('div');
    slotRow.style.cssText =
      'display:flex;gap:' + SLOT_GAP + 'px;flex-wrap:wrap;justify-content:center;' +
      'align-items:center;padding:8px 0;';

    for (var i = 0; i < container.slots.length; i++) {
      var slot = container.slots[i];
      var el = _createSlotEl(slot, i);
      slotRow.appendChild(el);
      _slotEls.push(el);
    }

    _parentEl.appendChild(slotRow);

    // Readiness bar
    _readinessEl = document.createElement('div');
    _readinessEl.style.cssText =
      'margin-top:12px;text-align:center;font:11px monospace;color:' + LABEL_DIM + ';';
    _updateReadiness(container);
    _parentEl.appendChild(_readinessEl);
  }

  /**
   * Create a single slot DOM element.
   */
  function _createSlotEl(slot, index) {
    var el = document.createElement('div');
    el.dataset.slotIndex = index;
    el.style.cssText = _slotCSS(slot);

    // Frame tag label (top-left corner)
    var tagLabel = document.createElement('div');
    tagLabel.style.cssText =
      'position:absolute;top:2px;left:4px;font-size:8px;color:' +
      (FRAME_COLOR[slot.frameTag] || LABEL_DIM) + ';opacity:0.7;' +
      'pointer-events:none;text-transform:uppercase;letter-spacing:0.05em;';
    tagLabel.textContent = _shortTag(slot.frameTag);
    el.appendChild(tagLabel);

    // Centre content: emoji or empty indicator
    var content = document.createElement('div');
    content.style.cssText =
      'font-size:22px;line-height:1;pointer-events:none;';
    if (slot.filled && slot.item) {
      content.textContent = slot.item.emoji || '\u2714'; // ✔
    } else {
      content.textContent = FRAME_EMOJI[slot.frameTag] || '\u25CB'; // ○
      content.style.opacity = '0.35';
    }
    content.className = 'rs-slot-emoji';
    el.appendChild(content);

    // Slot number label (bottom)
    var numLabel = document.createElement('div');
    numLabel.style.cssText =
      'position:absolute;bottom:2px;right:4px;font-size:9px;color:' + LABEL_DIM + ';' +
      'pointer-events:none;';
    numLabel.textContent = String(index + 1);
    el.appendChild(numLabel);

    // Match badge (visible only when filled + matched)
    if (slot.filled && slot.matched) {
      var badge = document.createElement('div');
      badge.style.cssText =
        'position:absolute;top:-4px;right:-4px;width:14px;height:14px;' +
        'border-radius:50%;background:rgba(80,220,80,0.9);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:8px;color:#fff;pointer-events:none;';
      badge.textContent = '\u2714'; // ✔
      el.appendChild(badge);
    }

    return el;
  }

  /**
   * Generate inline CSS for a slot box.
   */
  function _slotCSS(slot) {
    var borderColor = BORDER_EMPTY;
    var bgColor     = BG_EMPTY;

    if (slot.filled) {
      borderColor = slot.matched ? BORDER_MATCH : BORDER_FILLED;
      bgColor     = BG_FILLED;
    } else if (slot.frameTag === 'wildcard') {
      borderColor = BORDER_WILDCARD;
    } else if (FRAME_COLOR[slot.frameTag]) {
      borderColor = FRAME_COLOR[slot.frameTag];
    }

    return 'position:relative;width:' + SLOT_SIZE + 'px;height:' + SLOT_SIZE + 'px;' +
      'border-radius:' + SLOT_RAD + 'px;' +
      'border:2px solid ' + borderColor + ';' +
      'background:' + bgColor + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'cursor:' + (slot.filled ? 'default' : 'pointer') + ';' +
      'transition:border-color 150ms,background 150ms,box-shadow 150ms;' +
      'box-sizing:border-box;flex-shrink:0;';
  }

  /**
   * Abbreviated frame tag for UI label.
   */
  function _shortTag(tag) {
    var map = {
      hp_food: 'HP', energy_food: 'NRG', battery: 'BAT',
      scroll: 'SCR', gem: 'GEM', wildcard: '*', suit_card: 'SUIT'
    };
    return map[tag] || (tag || '?').toUpperCase().slice(0, 3);
  }

  function _updateReadiness(container) {
    if (!_readinessEl) return;
    if (!container || !container.slots) return;

    var filled = 0;
    var total  = container.slots.length;
    for (var i = 0; i < total; i++) {
      if (container.slots[i].filled) filled++;
    }

    var pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    var bar = '\u2588'.repeat(filled) + '\u2591'.repeat(total - filled);
    _readinessEl.textContent = bar + '  ' + pct + '% (' + filled + '/' + total + ')';

    if (filled === total && total > 0) {
      _readinessEl.style.color = 'rgba(80,220,80,0.8)';
    } else {
      _readinessEl.style.color = LABEL_DIM;
    }
  }

  // ── RS-2: Torch Rendering ──────────────────────────────────────────

  /**
   * Render 3 torch slots from TorchState.
   * Slot states: 'flame' | 'fuel_hydrated' | 'fuel_dry' | 'empty'
   */
  function _renderTorch() {
    var torch = _getTorch();
    if (!torch || !torch.slots) {
      _parentEl.innerHTML = '<div style="color:' + LABEL_DIM +
        ';font-size:11px;">No torch found</div>';
      return;
    }

    // Slot row
    var slotRow = document.createElement('div');
    slotRow.style.cssText =
      'display:flex;gap:' + SLOT_GAP + 'px;flex-wrap:wrap;justify-content:center;' +
      'align-items:center;padding:8px 0;';

    for (var i = 0; i < torch.slots.length; i++) {
      var el = _createTorchSlotEl(torch.slots[i], i, torch);
      slotRow.appendChild(el);
      _slotEls.push(el);
    }

    _parentEl.appendChild(slotRow);

    // Torch readiness from TorchState
    _readinessEl = document.createElement('div');
    _readinessEl.style.cssText =
      'margin-top:12px;text-align:center;font:11px monospace;color:' + LABEL_DIM + ';';
    _updateTorchReadiness(torch);
    _parentEl.appendChild(_readinessEl);
  }

  /**
   * Create a single torch slot DOM element.
   */
  function _createTorchSlotEl(slot, index, torch) {
    var st = slot.state;
    var el = document.createElement('div');
    el.dataset.slotIndex = index;
    el.style.cssText = _torchSlotCSS(st);

    // State label (top-left)
    var stateLabel = document.createElement('div');
    stateLabel.style.cssText =
      'position:absolute;top:2px;left:4px;font-size:8px;color:' +
      (TORCH_BORDER[st] || LABEL_DIM) + ';opacity:0.7;' +
      'pointer-events:none;letter-spacing:0.05em;';
    stateLabel.textContent = TORCH_LABEL[st] || '?';
    el.appendChild(stateLabel);

    // Centre content: state emoji
    var content = document.createElement('div');
    content.style.cssText = 'font-size:22px;line-height:1;pointer-events:none;';
    content.textContent = TORCH_EMOJI[st] || '\u25CB';
    if (st === 'empty') content.style.opacity = '0.35';
    content.className = 'rs-slot-emoji';
    el.appendChild(content);

    // Slot number (bottom-right)
    var numLabel = document.createElement('div');
    numLabel.style.cssText =
      'position:absolute;bottom:2px;right:4px;font-size:9px;color:' + LABEL_DIM + ';' +
      'pointer-events:none;';
    numLabel.textContent = String(index + 1);
    el.appendChild(numLabel);

    // Hint icon for actionable states (bottom-left)
    if (st === 'flame') {
      // Hint: water bottle or hose to extinguish
      var hintEl = document.createElement('div');
      hintEl.style.cssText =
        'position:absolute;bottom:2px;left:4px;font-size:9px;opacity:0.6;pointer-events:none;';
      hintEl.textContent = '\uD83D\uDCA7';  // 💧
      el.appendChild(hintEl);
    } else if (st === 'fuel_dry') {
      // Hint: water to hydrate
      var hintWet = document.createElement('div');
      hintWet.style.cssText =
        'position:absolute;bottom:2px;left:4px;font-size:9px;opacity:0.6;pointer-events:none;';
      hintWet.textContent = '\uD83D\uDCA7';  // 💧
      el.appendChild(hintWet);
    }

    // Ideal fuel badge (visible for fuel_hydrated with ideal match)
    if (st === 'fuel_hydrated' && slot.item && slot.item.id === torch.idealFuel) {
      var idealBadge = document.createElement('div');
      idealBadge.style.cssText =
        'position:absolute;top:-4px;right:-4px;width:14px;height:14px;' +
        'border-radius:50%;background:rgba(80,220,80,0.9);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:8px;color:#fff;pointer-events:none;';
      idealBadge.textContent = '\u2714';  // ✔
      el.appendChild(idealBadge);
    }

    return el;
  }

  /**
   * Generate inline CSS for a torch slot box.
   */
  function _torchSlotCSS(state) {
    var borderColor = TORCH_BORDER[state] || BORDER_EMPTY;
    var bgColor     = TORCH_BG[state]     || BG_EMPTY;

    return 'position:relative;width:' + SLOT_SIZE + 'px;height:' + SLOT_SIZE + 'px;' +
      'border-radius:' + SLOT_RAD + 'px;' +
      'border:2px solid ' + borderColor + ';' +
      'background:' + bgColor + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'cursor:' + (state === 'fuel_hydrated' ? 'default' : 'pointer') + ';' +
      'transition:border-color 150ms,background 150ms,box-shadow 150ms;' +
      'box-sizing:border-box;flex-shrink:0;';
  }

  /**
   * Update torch readiness display.
   */
  function _updateTorchReadiness(torch) {
    if (!_readinessEl) return;
    if (!torch || !torch.slots) return;

    var readiness = (typeof TorchState !== 'undefined' && TorchState.getReadiness)
      ? TorchState.getReadiness(_floorId) : 0;
    var pct = Math.round(readiness * 100);
    var isLit = torch.tile === TILES.TORCH_LIT;

    _readinessEl.textContent = (isLit ? '\uD83D\uDD25 LIT' : '\u2B1C UNLIT') +
      '  \u2502  Torch readiness: ' + pct + '%';
  }

  /**
   * Handle a drop on a torch slot.
   * Routes to TorchState.fillSlot / hydrateSlot / extinguish based on slot state.
   */
  function _fillTorchSlotFromDrop(slotIdx, payload) {
    if (typeof TorchState === 'undefined') return false;
    var torch = _getTorch();
    if (!torch || !torch.slots) return false;

    var slot = torch.slots[slotIdx];
    var item = payload.data;
    if (!item) return false;

    var itemId = item.id || item.subtype || '';
    var floorId = _floorId;
    var grid = (typeof FloorManager !== 'undefined' && FloorManager.getFloorData)
      ? FloorManager.getFloorData().grid : null;

    // ── Flame slot: water/hose extinguish ──
    if (slot.state === 'flame') {
      if (TorchState.isWater(itemId)) {
        if (!grid) return false;
        var result = TorchState.extinguish(floorId, _containerX, _containerY, grid);
        if (!result) return false;
        _consumeSourceItem(payload);
        if (typeof SessionStats !== 'undefined') { SessionStats.inc('torchesExtinguished'); SessionStats.inc('slotsFilled'); }
        if (typeof Toast !== 'undefined') Toast.show('\uD83D\uDCA7 Torch extinguished (careful)', 'info');
        if (typeof AudioSystem !== 'undefined') {
          AudioSystem.play('water-hiss');
          // Steam hiss fadeout — contract-aware duration/volume
          if (AudioSystem.playFadeOut) {
            var _rwContract = (typeof FloorManager !== 'undefined' && FloorManager.getFloorContract)
              ? FloorManager.getFloorContract() : null;
            var _rwDepth = _rwContract ? _rwContract.depth : 'exterior';
            var _rwFade = _rwDepth === 'nested_dungeon' ? 3500
                        : _rwDepth === 'interior' ? 4500 : 5500;
            var _rwVol  = _rwDepth === 'nested_dungeon' ? 0.50
                        : _rwDepth === 'interior' ? 0.40 : 0.30;
            AudioSystem.playFadeOut('torch_extinguish', { volume: _rwVol }, _rwFade);
          }
        }
        // Update lighting
        if (typeof Lighting !== 'undefined' && Lighting.removeSource) {
          Lighting.removeSource(_containerX, _containerY, floorId);
        }
        _refreshAfterFill();
        return true;
      }
      // Can't put fuel on a flame
      if (typeof Toast !== 'undefined') Toast.show('Extinguish the flame first', 'warn');
      return false;
    }

    // ── Empty slot: accept fuel or junk ──
    if (slot.state === 'empty') {
      var ok = TorchState.fillSlot(floorId, _containerX, _containerY, slotIdx, itemId);
      if (!ok) return false;
      _consumeSourceItem(payload);
      if (typeof SessionStats !== 'undefined') { SessionStats.inc('torchSlotsFilled'); SessionStats.inc('slotsFilled'); }

      var isIdeal = (itemId === torch.idealFuel);
      if (typeof Toast !== 'undefined') {
        Toast.show(isIdeal ? '\u2714 Ideal fuel placed' : 'Fuel placed', isIdeal ? 'loot' : 'info');
      }
      if (typeof AudioSystem !== 'undefined') AudioSystem.play('slot-fill');
      _refreshAfterFill();
      return true;
    }

    // ── Fuel-dry slot: water hydrates it ──
    if (slot.state === 'fuel_dry') {
      if (TorchState.isWater(itemId)) {
        var hydOk = TorchState.hydrateSlot(floorId, _containerX, _containerY, slotIdx);
        if (!hydOk) return false;
        _consumeSourceItem(payload);
        if (typeof SessionStats !== 'undefined') { SessionStats.inc('torchSlotsFilled'); SessionStats.inc('slotsFilled'); }
        if (typeof Toast !== 'undefined') Toast.show('\uD83D\uDCA7 Fuel hydrated', 'info');
        if (typeof AudioSystem !== 'undefined') AudioSystem.play('water-hiss');
        _refreshAfterFill();
        return true;
      }
      // Can't put another item on an already-filled dry slot
      if (typeof Toast !== 'undefined') Toast.show('Slot already has fuel \u2014 add water to hydrate', 'warn');
      return false;
    }

    // fuel_hydrated: no further interaction
    return false;
  }

  /**
   * Register DragDrop zones for torch slots.
   * Flame slots accept water only. Empty slots accept fuel/junk.
   * Fuel_dry slots accept water only. Fuel_hydrated: no zone.
   */
  function _registerTorchZones() {
    if (typeof DragDrop === 'undefined') return;
    if (_zonesRegistered) _unregisterZones();

    var torch = _getTorch();
    if (!torch || !torch.slots) return;

    for (var i = 0; i < torch.slots.length; i++) {
      (function (slotIdx) {
        var slot = torch.slots[slotIdx];
        // fuel_hydrated is read-only — no drop zone
        if (slot.state === 'fuel_hydrated') return;

        var zoneId = _zonePrefix + slotIdx;
        var el = _slotEls[slotIdx];
        if (!el) return;

        var bounds = _getElBounds(el);

        DragDrop.registerZone(zoneId, {
          x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h,

          accepts: function (payload) {
            if (!payload || !payload.data) return false;
            var id = payload.data.id || payload.data.subtype || '';
            if (slot.state === 'flame') return TorchState.isWater(id);
            if (slot.state === 'fuel_dry') return TorchState.isWater(id);
            if (slot.state === 'empty') return true;  // fuel or junk
            return false;
          },

          onDrop: function (payload) {
            if (!payload || !payload.data) return false;
            return _fillTorchSlotFromDrop(slotIdx, payload);
          },

          onHover: function () {
            if (el) {
              el.style.borderColor = BORDER_HOVER;
              el.style.background  = BG_HOVER;
              el.style.boxShadow   = '0 0 12px ' + PULSE_GLOW;
            }
          },

          onLeave: function () {
            var t = _getTorch();
            if (t && t.slots[slotIdx] && el) {
              el.style.cssText = _torchSlotCSS(t.slots[slotIdx].state);
            }
          }
        });
      })(i);
    }

    _zonesRegistered = true;
  }

  /**
   * Get TorchState record for the current position.
   */
  function _getTorch() {
    if (typeof TorchState === 'undefined') return null;
    return TorchState.getTorch(_floorId, _containerX, _containerY);
  }

  // ── DragDrop Zone Registration ─────────────────────────────────────

  function _registerZones() {
    if (typeof DragDrop === 'undefined') return;
    if (_zonesRegistered) _unregisterZones();

    var container = _getContainer();
    if (!container || !container.slots) return;

    for (var i = 0; i < container.slots.length; i++) {
      (function (slotIdx) {
        var slot = container.slots[slotIdx];
        if (slot.filled) return; // No zone for already-filled slots

        var zoneId = _zonePrefix + slotIdx;
        var el = _slotEls[slotIdx];
        if (!el) return;

        // Get element bounds relative to viewport container
        var bounds = _getElBounds(el);

        DragDrop.registerZone(zoneId, {
          x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h,

          accepts: function (payload) {
            if (!payload || !payload.data) return false;
            // Any item can fill any slot (mismatched items just yield fewer coins)
            // But suit_card slots require an item with .suit
            if (slot.frameTag === 'suit_card') {
              return !!(payload.data.suit);
            }
            return true;
          },

          onDrop: function (payload) {
            if (!payload || !payload.data) return false;
            return _fillSlotFromDrop(slotIdx, payload);
          },

          onHover: function () {
            if (el) {
              el.style.borderColor = BORDER_HOVER;
              el.style.background  = BG_HOVER;
              el.style.boxShadow   = '0 0 12px ' + PULSE_GLOW;
            }
          },

          onLeave: function () {
            // Refresh this slot's visual to default
            var c = _getContainer();
            if (c && c.slots[slotIdx] && el) {
              el.style.cssText = _slotCSS(c.slots[slotIdx]);
              // Re-add children styles (position:relative already set)
            }
          }
        });
      })(i);
    }

    _zonesRegistered = true;
  }

  function _unregisterZones() {
    if (typeof DragDrop === 'undefined') return;
    // Unregister all possible zone IDs (slots 0..9)
    for (var i = 0; i < 10; i++) {
      DragDrop.removeZone(_zonePrefix + i);
    }
    _zonesRegistered = false;
  }

  /**
   * Get element bounds in the coordinate space DragDrop uses (viewport-relative).
   */
  function _getElBounds(el) {
    var rect = el.getBoundingClientRect();
    // DragDrop zones use canvas coordinates — get viewport element offset
    var vp = document.getElementById('viewport');
    var vpRect = vp ? vp.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      x: rect.left - vpRect.left,
      y: rect.top  - vpRect.top,
      w: rect.width,
      h: rect.height
    };
  }

  // ── Fill Logic ─────────────────────────────────────────────────────

  /**
   * Handle a drop payload landing on a slot.
   * Returns true if the fill succeeded.
   */
  function _fillSlotFromDrop(slotIdx, payload) {
    if (typeof CrateSystem === 'undefined') return false;

    var item = payload.data;
    var result = CrateSystem.fillSlot(_containerX, _containerY, _floorId, slotIdx, item);
    if (!result) return false;

    // Remove item from source (bag or hand)
    _consumeSourceItem(payload);

    // Track stat
    if (typeof SessionStats !== 'undefined') SessionStats.inc('slotsFilled');

    // Coin feedback
    if (result.coins > 0 && typeof Toast !== 'undefined') {
      var msg = '+' + result.coins + 'g';
      if (result.matched) msg += ' \u2714 match!';
      Toast.show(msg, result.matched ? 'loot' : 'info');
    }

    // Coin VFX on the slot element
    if (result.coins > 0 && typeof ParticleFX !== 'undefined') {
      var el = _slotEls[slotIdx];
      if (el) {
        var rect = el.getBoundingClientRect();
        ParticleFX.coinBurst(rect.left + rect.width / 2, rect.top + rect.height / 2,
          Math.max(2, result.coins));
      }
    }

    // Play fill SFX
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play(result.matched ? 'slot-match' : 'slot-fill');
    }

    // Refresh the surface
    _refreshAfterFill();

    return true;
  }

  /**
   * Remove the dropped item from its source container (bag or hand).
   */
  function _consumeSourceItem(payload) {
    if (!payload) return;
    var src = payload.type || '';

    if (src === 'bag' && typeof CardAuthority !== 'undefined' && CardAuthority.removeFromBag) {
      CardAuthority.removeFromBag(payload.data, payload.index);
    } else if (src === 'hand' && typeof CardAuthority !== 'undefined' && CardAuthority.removeFromHand) {
      CardAuthority.removeFromHand(payload.data, payload.index);
    }
  }

  /**
   * After filling a slot: re-render wheel, refresh supply rows, update zones.
   */
  function _refreshAfterFill() {
    // Re-render wheel
    _unregisterZones();
    _render();
    if (_mode === 'torch') { _registerTorchZones(); }
    else { _registerZones(); }

    // Tell RestockSurface to refresh supply side
    if (typeof RestockSurface !== 'undefined' && RestockSurface.refreshSupply) {
      RestockSurface.refreshSupply();
    }

    // Check if all slots are now filled → show seal button
    if (typeof RestockSurface !== 'undefined' && RestockSurface.refreshWheel) {
      // Footer updates via RestockSurface.update() each frame
    }
  }

  // ── Quick-Fill ─────────────────────────────────────────────────────

  /**
   * Quick-fill slot at index with the best-matching bag item.
   * Called from RestockSurface.handleKey() for number keys 1-5.
   */
  function quickFill(slotIdx) {
    var container = _getContainer();
    if (!container || !container.slots) return;
    if (slotIdx < 0 || slotIdx >= container.slots.length) return;
    if (container.slots[slotIdx].filled) return;

    var bag = (typeof CardAuthority !== 'undefined' && CardAuthority.getBag)
      ? CardAuthority.getBag() : [];
    if (bag.length === 0) return;

    var slot = container.slots[slotIdx];

    // Find best-matching item: exact frame match first, then wildcard crateFillTag, then any
    var bestIdx = -1;
    var bestScore = -1;

    for (var i = 0; i < bag.length; i++) {
      var item = bag[i];
      var score = 0;

      // Suit card slot requires .suit
      if (slot.frameTag === 'suit_card') {
        if (!item.suit) continue;
        score = (item.suit === slot.suit) ? 3 : 1;
      } else {
        // Check frame match via crateFillTag or category
        if (item.crateFillTag === slot.frameTag) score = 3;
        else if (item.crateFillTag === 'WILDCARD') score = 2;
        else if (item.category === slot.frameTag) score = 3;
        else if (slot.frameTag === 'wildcard') score = 2;
        else score = 1; // Mismatch but still fills
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return;

    var payload = {
      type: 'bag',
      data: bag[bestIdx],
      index: bestIdx
    };

    _fillSlotFromDrop(slotIdx, payload);
  }

  // ── Key Handling ───────────────────────────────────────────────────

  function handleKey(key) {
    // Arrow scroll (future: multi-row containers)
    return false;
  }

  // ── Per-frame Update ───────────────────────────────────────────────

  function update(dt) {
    if (!_mounted) return;
    // Re-read container to catch external changes (e.g., hose spray filling a torch slot)
    var container = _getContainer();
    if (container) _updateReadiness(container);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  function _getContainer() {
    if (typeof CrateSystem === 'undefined') return null;
    return CrateSystem.getContainer(_containerX, _containerY, _floorId);
  }

  /**
   * Check if an item matches a slot's frame tag.
   * Used by SupplyRows for compatibility glow rendering.
   */
  function doesItemMatchSlot(item, slotFrameTag) {
    if (!item || !slotFrameTag) return false;

    // RS-2: Torch pseudo-tags
    if (slotFrameTag === 'torch_water') {
      var id = item.id || item.subtype || '';
      return (typeof TorchState !== 'undefined') ? TorchState.isWater(id) : (id === 'water_bottle');
    }
    if (slotFrameTag === 'torch_fuel') {
      var fid = item.id || item.subtype || '';
      return (typeof TorchState !== 'undefined') ? TorchState.isTorchFuel(fid) : false;
    }

    if (slotFrameTag === 'wildcard') return true;
    if (slotFrameTag === 'suit_card') return !!(item.suit);
    if (item.crateFillTag === slotFrameTag) return true;
    if (item.crateFillTag === 'WILDCARD') return true;
    if (item.category === slotFrameTag) return true;
    if (slotFrameTag === 'hp_food' && (item.category === 'food' || item.subtype === 'food')) return true;
    if (slotFrameTag === 'energy_food' && (item.category === 'energy' || item.subtype === 'tonic')) return true;
    if (slotFrameTag === 'battery' && item.category === 'battery') return true;
    return false;
  }

  /**
   * Get the set of unfilled frame tags for the current container.
   * Used by SupplyRows for compatibility glow.
   */
  function getUnfilledFrameTags() {
    // RS-2: Torch mode returns pseudo-tags for SupplyRows compatibility glow
    if (_mode === 'torch') {
      var torch = _getTorch();
      if (!torch || !torch.slots) return [];
      var torchTags = [];
      for (var ti = 0; ti < torch.slots.length; ti++) {
        var st = torch.slots[ti].state;
        if (st === 'flame')    torchTags.push('torch_water');   // needs water
        if (st === 'fuel_dry') torchTags.push('torch_water');   // needs water
        if (st === 'empty')    torchTags.push('torch_fuel');    // needs fuel
      }
      return torchTags;
    }

    var container = _getContainer();
    if (!container || !container.slots) return [];
    var tags = [];
    for (var i = 0; i < container.slots.length; i++) {
      if (!container.slots[i].filled) {
        tags.push(container.slots[i].frameTag);
      }
    }
    return tags;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    mount:               mount,
    unmount:             unmount,
    update:              update,
    quickFill:           quickFill,
    handleKey:           handleKey,
    doesItemMatchSlot:   doesItemMatchSlot,
    getUnfilledFrameTags: getUnfilledFrameTags,

    /**
     * RS-4: Return per-slot labels for number key hints.
     * Returns array of { key: '1', emoji: '❤️', filled: false } objects.
     * For torch mode returns torch slot labels.
     */
    getSlotLabels: function () {
      if (!_mounted) return [];
      if (_mode === 'torch') {
        var torch = _getTorch();
        if (!torch || !torch.slots) return [];
        var tLabels = [];
        for (var ti = 0; ti < torch.slots.length; ti++) {
          var ts = torch.slots[ti];
          tLabels.push({
            key:    String(ti + 1),
            emoji:  ts.state === 'flame' ? '\uD83D\uDD25' :    // 🔥
                    ts.state === 'fuel_hydrated' ? '\uD83D\uDCA7' : // 💧
                    ts.state === 'fuel_dry' ? '\uD83E\uDEB5' :     // 🪵
                    '\u25CB',                                        // ○
            filled: ts.state !== 'empty'
          });
        }
        return tLabels;
      }
      var container = _getContainer();
      if (!container || !container.slots) return [];
      var labels = [];
      for (var i = 0; i < container.slots.length; i++) {
        var slot = container.slots[i];
        labels.push({
          key:    String(i + 1),
          emoji:  slot.filled
            ? (slot.item && slot.item.emoji ? slot.item.emoji : '\u2714') // ✔
            : (FRAME_EMOJI[slot.frameTag] || '\u25CB'),                    // ○
          filled: !!slot.filled
        });
      }
      return labels;
    },

    isMounted:           function () { return _mounted; },
    FRAME_COLOR:         FRAME_COLOR,
    FRAME_EMOJI:         FRAME_EMOJI
  };
})();

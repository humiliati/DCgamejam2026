/**
 * TorchPeek — BoxAnim torch reveal when facing a torch tile.
 *
 * When the player faces a TORCH_LIT or TORCH_UNLIT tile, a CSS 3D
 * torch-bracket box appears centred in the viewport. The lid slides off
 * to reveal the 3-slot fuel interior.
 *
 * Lit torch: warm amber glow, flame emoji in slot 0, remaining fuel slots.
 * Unlit torch: cold charred bracket, empty/fuel slots.
 *
 * Player interactions (via DragDrop or number keys):
 *   - Water bottle → flame slot: extinguish (careful method)
 *   - Fuel item → empty slot: fill
 *   - Water bottle → fuel_dry slot: hydrate
 *   - Non-fuel → empty slot: junk fill (tiny readiness)
 *
 * Visual: BoxAnim torch-variant — iron bracket faces, warm/cold interior.
 *
 * Text below box (two rows, left-aligned):
 *   wall torch (lit/unlit)
 *   → extinguish + refuel  /  → refuel slots
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager,
 *             TorchState, CardAuthority (optional), DragDrop (optional)
 */
var TorchPeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 350;   // ms before box appears (debounce)
  var OPEN_DELAY = 200;   // ms after appear before lid slides off

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _boxId      = null;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _opened     = false;
  var _container  = null;
  var _labelLayer = null;   // Flat overlay above 3D scene (z-index:2)
  var _slotStrip  = null;   // Slot indicator strip in label layer
  var _subLabel   = null;
  var _actionBtn  = null;   // Clickable action button (Magic Remote)
  var _slotEls    = [];     // DOM elements for the 3 slot indicators
  var _interacting = false; // true when slot-fill UI is active

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('torch-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'torch-peek-container';
      // top:40% — lift ~10vh so Interact button clears freelook ring hitbox.
       _container.style.cssText =
        'position:absolute; top:40%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    // Label layer — flat overlay above 3D scene for text + action button
    _labelLayer = document.getElementById('torch-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'torch-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Slot indicator strip — centered over box, in label layer
    _slotStrip = document.getElementById('torch-peek-slots');
    if (!_slotStrip) {
      _slotStrip = document.createElement('div');
      _slotStrip.id = 'torch-peek-slots';
      _slotStrip.style.cssText =
        'display:flex; justify-content:center; gap:10px;' +
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%); white-space:nowrap;' +
        'pointer-events:none; opacity:0; transition:opacity 0.3s ease 0.15s;';
      _labelLayer.appendChild(_slotStrip);
    }

    // Sub-label below box (in label layer, margin 60px to clear 3D projection)
    _subLabel = document.getElementById('torch-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'torch-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(200,170,100,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.4;';
      _labelLayer.appendChild(_subLabel);
    }

    // Action button — clickable for Magic Remote
    _actionBtn = document.getElementById('torch-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'torch-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%;' +
        'transform:translateX(-50%);' +
        'margin-top:130px; min-height:48px;' +
        'font:bold 18px monospace; color:#ffa030;' +
        'background:rgba(80,50,20,0.5);' +
        'border:2px solid rgba(200,140,60,0.4);' +
        'border-radius:8px; padding:12px 28px;' +
        'text-shadow:0 0 8px rgba(255,140,40,0.4);' +
        'cursor:pointer; pointer-events:auto;' +
        'opacity:0; transition:opacity 0.3s ease;' +
        'white-space:nowrap; outline:none;';
      _actionBtn.textContent = 'Interact';
      _actionBtn.addEventListener('click', _onActionClick);
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#ffa030';
        _actionBtn.style.color = '#fff';
        _actionBtn.style.background = 'rgba(120,70,20,0.6)';
        _actionBtn.style.textShadow = '0 0 12px rgba(255,180,60,0.5)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = 'rgba(200,140,60,0.4)';
        _actionBtn.style.color = '#ffa030';
        _actionBtn.style.background = 'rgba(80,50,20,0.5)';
        _actionBtn.style.textShadow = '0 0 8px rgba(255,140,40,0.4)';
      });
      _labelLayer.appendChild(_actionBtn);
    }
  }

  function _onActionClick(e) {
    if (e) e.stopPropagation();
    if (typeof Game !== 'undefined' && typeof Game.interact === 'function') {
      Game.interact();
    } else if (typeof InputManager !== 'undefined' && InputManager.simulateOK) {
      InputManager.simulateOK();
    }
  }

  /**
   * Hose extinguish: called when player has hose active and clicks a flame
   * slot inside the torch peek UI. Routes through TorchHitResolver so the
   * "hose is always destructive" rule (PRESSURE_WASHING_ROADMAP §7.1) is
   * enforced consistently — deliberate peek-click and PW-3 spray collateral
   * share the same extinguish pipeline. Dry fuel below the flame gets
   * blown out regardless of whether this was targeted or accidental.
   *
   * After the resolver fires we still need to refresh THIS peek's slot UI
   * since the resolver doesn't know we're open.
   */
  function _hoseExtinguish(e) {
    if (e) e.stopPropagation();
    if (!_active) return;
    if (typeof TorchHitResolver === 'undefined') return;

    var floorId = typeof FloorManager !== 'undefined' ? FloorManager.getCurrentFloorId() : '0';
    var summary = TorchHitResolver.onHoseHit(floorId, _facingX, _facingY);
    if (summary && summary.count > 0) {
      _refreshSlotDisplay();
    }
  }

  // ── Per-frame check ──────────────────────────────────────────

  function update(dt) {
    if (!_container || typeof BoxAnim === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;
    if (_interacting) return; // Slot UI is open, don't re-check facing
    // Don't show torch peek while another slot-fill UI is active (e.g. crate)
    if (typeof PeekSlots !== 'undefined' && PeekSlots.isFilling()) return;

    var floorData = FloorManager.getFloorData();
    if (!floorData) { _hide(); return; }

    var p   = Player.getPos();
    var dir = Player.getDir();
    var fx  = p.x + MC.DX[dir];
    var fy  = p.y + MC.DY[dir];

    if (fx < 0 || fx >= floorData.gridW || fy < 0 || fy >= floorData.gridH) {
      _hide(); return;
    }

    var tile = floorData.grid[fy][fx];
    if (!TILES.isTorch(tile)) { _hide(); return; }

    // SC-A: Torch peek/refuel is a depth-3+ dungeon mechanic only.
    // Surface/interior torches (depth 1-2) are decorative infrastructure.
    var _torchDepth = floorData.floorId ? String(floorData.floorId).split('.').length : 1;
    if (_torchDepth < 3) { _hide(); return; }

    // Same tile we were already peeking at — hold steady
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // Different tile while active — dismiss first, reset debounce
    if (_active && (_facingX !== fx || _facingY !== fy)) {
      _hide();
    }

    // New tile — accumulate debounce
    _facingTile = tile;
    _facingX    = fx;
    _facingY    = fy;
    _timer     += dt;

    if (_timer >= SHOW_DELAY) {
      _show(tile, fx, fy, floorData);
    }
  }

  // ── Show / hide ──────────────────────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) _destroyBox();

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

    _boxId   = BoxAnim.create('chest', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    var isLit      = tile === TILES.TORCH_LIT;
    var glowColor  = isLit ? 'rgba(255,140,40,0.5)' : 'rgba(80,70,60,0.4)';
    var labelColor = isLit ? '#ffa030' : '#8a7a68';

    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.zIndex = '1';
      inst.style.setProperty('--box-glow', glowColor);
      inst.style.setProperty('--box-dark', isLit ? '#3a2008' : '#1a1810');
      inst.style.setProperty('--box-light', isLit ? '#c88030' : '#4a4038');
      inst.style.setProperty('--box-floor', isLit ? '#2a1804' : '#0a0808');
      inst.style.setProperty('--box-ceil', isLit ? '#8a5820' : '#2a2420');
      inst.style.pointerEvents = 'none';
    }

    // Build slot indicators in the label layer (above 3D scene)
    _buildSlotIndicators(_slotStrip, fx, fy, isLit, labelColor, glowColor);

    // Reset action button
    if (_actionBtn) {
      _actionBtn.style.opacity = '0';
      _actionBtn.textContent = isLit ? 'Extinguish' : 'Refuel';
    }

    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(
        isLit ? 'wall torch (lit)' : 'wall torch (unlit)'
      ));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode(
        isLit ? '\u2192 extinguish + refuel' : '\u2192 refuel slots'
      ));
      _subLabel.style.color = 'rgba(200,170,100,0)';
    }

    _container.style.opacity = '1';

    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0.9)';
        if (_slotStrip) _slotStrip.style.opacity = '1';
        if (_actionBtn) _actionBtn.style.opacity = '1';
      }
    }, OPEN_DELAY);
  }

  /**
   * Build 3 slot indicator elements inside the box glow area.
   * Each slot shows its state as an emoji/label:
   *   flame → 🔥,  fuel_hydrated → 💧,  fuel_dry → 🪵,  empty → ◯
   */
  function _buildSlotIndicators(parent, fx, fy, isLit, labelColor, glowColor) {
    _slotEls = [];

    // Clear existing children
    while (parent.firstChild) parent.removeChild(parent.firstChild);

    var floorId = (typeof FloorManager !== 'undefined')
      ? FloorManager.getCurrentFloorId() : '0';
    var torch = (typeof TorchState !== 'undefined')
      ? TorchState.getTorch(floorId, fx, fy) : null;

    for (var i = 0; i < 3; i++) {
      var slot = torch ? torch.slots[i] : { state: 'empty', item: null };
      var el = document.createElement('span');
      el.style.cssText =
        'display:inline-block; width:48px; height:48px; line-height:48px;' +
        'text-align:center; font-size:26px; border-radius:8px;' +
        'border:2px solid ' + labelColor + ';' +
        'background:rgba(0,0,0,0.6);' +
        'pointer-events:auto; cursor:pointer;' +
        'transition:border-color 0.15s, background 0.15s, transform 0.1s;';
      el.textContent = _slotEmoji(slot);
      el.title = _slotLabel(slot);

      // Slot number label
      var numLabel = document.createElement('span');
      numLabel.style.cssText =
        'position:absolute; bottom:2px; right:4px; font:bold 10px monospace;' +
        'color:rgba(200,170,100,0.5); pointer-events:none;';
      numLabel.textContent = String(i + 1);
      el.style.position = 'relative';
      el.appendChild(numLabel);

      // Hover feedback
      (function (elem, lc) {
        elem.addEventListener('mouseenter', function () {
          elem.style.borderColor = '#fff';
          elem.style.background = 'rgba(60,40,10,0.8)';
          elem.style.transform = 'scale(1.1)';
        });
        elem.addEventListener('mouseleave', function () {
          elem.style.borderColor = lc;
          elem.style.background = 'rgba(0,0,0,0.6)';
          elem.style.transform = 'scale(1)';
        });
      })(el, labelColor);

      // Click handler — hose bypass, or start+fill atomically for Magic Remote
      (function (slotIdx) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();

          // Hose extinguish path: if player has hose active and this slot is
          // the flame slot, douse with pressure-wash FX instead of inventory item.
          if (typeof HoseState !== 'undefined' && HoseState.isActive()) {
            var floorId2 = typeof FloorManager !== 'undefined'
              ? FloorManager.getCurrentFloorId() : '0';
            var torch2 = typeof TorchState !== 'undefined'
              ? TorchState.getTorch(floorId2, _facingX, _facingY) : null;
            if (torch2 && torch2.slots[slotIdx] &&
                torch2.slots[slotIdx].state === 'flame') {
              _hoseExtinguish(e);
              return;
            }
          }

          if (_interacting) {
            // Already in slot-fill mode — process the slot directly
            handleKey('Digit' + (slotIdx + 1));
          } else {
            // Start interaction and immediately process the slot (atomic — one tap)
            if (tryInteract()) {
              handleKey('Digit' + (slotIdx + 1));
            }
          }
        });
      })(i);

      parent.appendChild(el);
      _slotEls.push(el);
    }
  }

  function _slotEmoji(slot) {
    switch (slot.state) {
      case 'flame':         return '\uD83D\uDD25';  // 🔥
      case 'fuel_hydrated': return '\uD83D\uDCA7';  // 💧
      case 'fuel_dry':      return '\uD83E\uDEB5';  // 🪵
      case 'empty':         return '\u25CB';          // ○
      default:              return '?';
    }
  }

  function _slotLabel(slot) {
    switch (slot.state) {
      case 'flame':         return 'Flame (use water to extinguish)';
      case 'fuel_hydrated': return 'Hydrated fuel (ready)';
      case 'fuel_dry':      return 'Dry fuel (needs water)';
      case 'empty':         return 'Empty (needs fuel)';
      default:              return slot.state;
    }
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0)';
    if (_slotStrip) _slotStrip.style.opacity = '0';
    if (_actionBtn) _actionBtn.style.opacity = '0';

    setTimeout(function () { _destroyBox(); }, 350);

    _active      = false;
    _opened      = false;
    _interacting = false;
    _facingTile  = 0;
    _facingX     = -1;
    _facingY     = -1;
    _timer       = 0;
    _slotEls     = [];
  }

  function _destroyBox() {
    if (_boxId) {
      BoxAnim.destroy(_boxId);
      _boxId = null;
    }
    _active = false;
    _opened = false;
    _slotEls = [];
  }

  // ── Interaction (called from Game._interact) ─────────────────

  /**
   * Enter the slot-filling interaction for the currently peeked torch.
   * Returns true if interaction started successfully.
   */
  function tryInteract() {
    if (!_active || !_opened) return false;
    if (_interacting) return false;
    if (typeof TorchState === 'undefined') return false;

    _interacting = true;

    // Pause movement while interacting
    if (typeof MovementController !== 'undefined') {
      MovementController.pause();
    }

    _refreshSlotDisplay();
    return true;
  }

  /**
   * Handle a key press during torch interaction.
   * 1-3: fill slot from selected bag item
   * Q/W: use water bottle on flame/dry slot
   * Escape: close interaction
   *
   * @param {string} key - KeyboardEvent.code
   * @returns {boolean} true if handled
   */
  function handleKey(key) {
    if (!_interacting) return false;

    if (key === 'Escape') {
      _closeInteraction();
      return true;
    }

    var floorId = FloorManager.getCurrentFloorId();
    var torch = TorchState.getTorch(floorId, _facingX, _facingY);
    if (!torch) { _closeInteraction(); return true; }

    var floorData = FloorManager.getFloorData();

    // Number keys 1-3: fill the corresponding slot from the player's
    // selected bag item (CardAuthority selected card / quick-bar item)
    if (key === 'Digit1' || key === 'Digit2' || key === 'Digit3') {
      var slotIdx = parseInt(key.charAt(5), 10) - 1;
      var slot = torch.slots[slotIdx];

      // Get the player's held/selected item
      var heldItem = _getHeldItem();
      if (!heldItem) {
        if (typeof Toast !== 'undefined') Toast.show('No item selected', 'warning');
        return true;
      }

      if (slot.state === 'flame' && TorchState.isWater(heldItem.id)) {
        // Extinguish with water bottle
        if (TorchState.extinguish(floorId, _facingX, _facingY, floorData.grid)) {
          _consumeHeldItem(heldItem);
          _onTorchExtinguished();
          _refreshSlotDisplay();
          if (typeof SessionStats !== 'undefined') SessionStats.inc('torchesExtinguished');
        }
        return true;
      }

      if (slot.state === 'fuel_dry' && TorchState.isWater(heldItem.id)) {
        // Hydrate dry fuel
        if (TorchState.hydrateSlot(floorId, _facingX, _facingY, slotIdx)) {
          _consumeHeldItem(heldItem);
          if (typeof Toast !== 'undefined') Toast.show('\uD83D\uDCA7 Fuel hydrated', 'info');
          _refreshSlotDisplay();
        }
        return true;
      }

      if (slot.state === 'empty') {
        // Fill slot with whatever item the player has
        if (TorchState.fillSlot(floorId, _facingX, _facingY, slotIdx, heldItem.id)) {
          _consumeHeldItem(heldItem);
          var fillMsg = TorchState.isTorchFuel(heldItem.id)
            ? '\uD83E\uDEB5 Fuel loaded' : '\uD83D\uDCE6 Slot filled (junk)';
          if (typeof Toast !== 'undefined') Toast.show(fillMsg, 'info');
          _refreshSlotDisplay();
          if (typeof SessionStats !== 'undefined') SessionStats.inc('torchSlotsFilled');
        }
        return true;
      }

      // Slot already filled / no valid action
      if (typeof Toast !== 'undefined') Toast.show('Can\'t place that here', 'warning');
      return true;
    }

    return false;
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _getHeldItem() {
    // Try CardAuthority selected card first (bag zone)
    if (typeof CardAuthority !== 'undefined' && CardAuthority.getSelectedCard) {
      var card = CardAuthority.getSelectedCard();
      if (card && card.itemId) return { id: card.itemId, card: card };
    }
    // Try quick-bar selected item
    if (typeof QuickBar !== 'undefined' && QuickBar.getSelected) {
      var qb = QuickBar.getSelected();
      if (qb && qb.itemId) return { id: qb.itemId, quickBar: qb };
    }
    return null;
  }

  function _consumeHeldItem(heldItem) {
    if (heldItem.card && typeof CardAuthority !== 'undefined') {
      CardAuthority.removeCard(heldItem.card);
    } else if (heldItem.quickBar && typeof QuickBar !== 'undefined') {
      QuickBar.consumeSelected();
    }
  }

  function _onTorchExtinguished() {
    // Update visual state: cavity glow removal + light source removal
    // happen on the next floor-manager refresh cycle. For immediate
    // feedback we show a toast.
    if (typeof Toast !== 'undefined') {
      Toast.show('\uD83D\uDCA7 Torch extinguished', 'info');
    }

    // Remove light source at this position
    if (typeof Lighting !== 'undefined' && Lighting.removeLightSource) {
      Lighting.removeLightSource(_facingX, _facingY);
    }

    // Update wall decor: swap cavity glow decor to dim bracket
    _updateWallDecor(false);
  }

  function _updateWallDecor(isLit) {
    // Single source of truth lives on FloorManager so every extinguish /
    // relight path (this peek, TorchHitResolver, future PW-3 spray) shares
    // the same decor mutation. See FloorManager.syncTorchDecor.
    if (typeof FloorManager === 'undefined' || !FloorManager.syncTorchDecor) return;
    var floorId = FloorManager.getCurrentFloorId
      ? FloorManager.getCurrentFloorId()
      : null;
    if (!floorId) return;
    FloorManager.syncTorchDecor(floorId, _facingX, _facingY, isLit);
  }

  function _refreshSlotDisplay() {
    if (!_slotEls.length) return;
    var floorId = FloorManager.getCurrentFloorId();
    var torch = TorchState.getTorch(floorId, _facingX, _facingY);
    if (!torch) return;

    for (var i = 0; i < _slotEls.length && i < torch.slots.length; i++) {
      var el = _slotEls[i];
      // Preserve the number label child — update only the first text node
      var emoji = _slotEmoji(torch.slots[i]);
      if (el.firstChild && el.firstChild.nodeType === 3) {
        el.firstChild.textContent = emoji;
      } else {
        el.insertBefore(document.createTextNode(emoji), el.firstChild);
      }
      el.title = _slotLabel(torch.slots[i]);
    }

    var isLit = torch.tile === TILES.TORCH_LIT;

    // Update action button text
    if (_actionBtn) {
      if (_interacting) {
        _actionBtn.textContent = '\u2715 Close';
      } else {
        _actionBtn.textContent = isLit ? 'Extinguish' : 'Refuel';
      }
    }

    // Update subtitle text
    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(
        isLit ? 'wall torch (lit)' : 'wall torch (unlit)'
      ));
      _subLabel.appendChild(document.createElement('br'));

      if (_interacting) {
        _subLabel.appendChild(document.createTextNode(
          'Tap slot to fill \u00b7 \u2715 to close'
        ));
      } else {
        _subLabel.appendChild(document.createTextNode(
          isLit ? '\u2192 extinguish + refuel' : '\u2192 refuel slots'
        ));
      }
    }
  }

  function _closeInteraction() {
    _interacting = false;

    // Resume movement
    if (typeof MovementController !== 'undefined') {
      MovementController.resume();
    }

    _refreshSlotDisplay();
  }

  /**
   * Returns true if the peek is actively showing for a torch.
   */
  function isActive() {
    return _active;
  }

  /**
   * Returns true if the slot interaction is open.
   */
  function isInteracting() {
    return _interacting;
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  return {
    init:           init,
    update:         update,
    tryInteract:    tryInteract,
    handleKey:      handleKey,
    isActive:       isActive,
    isInteracting:  isInteracting,
    forceHide:      forceHide
  };
})();

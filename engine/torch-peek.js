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
  var _subLabel   = null;
  var _slotEls    = [];     // DOM elements for the 3 slot indicators
  var _interacting = false; // true when slot-fill UI is active

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('torch-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'torch-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    _subLabel = document.getElementById('torch-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'torch-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:36px; text-align:left;' +
        'font:38px monospace; color:rgba(200,170,100,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.3;';
      _container.appendChild(_subLabel);
    }
  }

  // ── Per-frame check ──────────────────────────────────────────

  function update(dt) {
    if (!_container || typeof BoxAnim === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;
    if (_interacting) return; // Slot UI is open, don't re-check facing

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

    _boxId   = BoxAnim.create('crate', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    var isLit      = tile === TILES.TORCH_LIT;
    var glowColor  = isLit ? 'rgba(255,140,40,0.5)' : 'rgba(80,70,60,0.4)';
    var labelColor = isLit ? '#ffa030' : '#8a7a68';

    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', glowColor);
      inst.style.pointerEvents = 'none';

      var glow = inst.querySelector('.box3d-glow');
      if (glow) {
        // Build slot indicator strip inside the box glow area
        _buildSlotIndicators(glow, fx, fy, isLit, labelColor, glowColor);
      }
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

    var strip = document.createElement('div');
    strip.style.cssText =
      'display:flex; justify-content:center; gap:10px;' +
      'position:absolute; top:50%; left:50%;' +
      'transform:translate(-50%,-50%); white-space:nowrap;';

    var floorId = (typeof FloorManager !== 'undefined')
      ? FloorManager.getCurrentFloorId() : '0';
    var torch = (typeof TorchState !== 'undefined')
      ? TorchState.getTorch(floorId, fx, fy) : null;

    for (var i = 0; i < 3; i++) {
      var slot = torch ? torch.slots[i] : { state: 'empty', item: null };
      var el = document.createElement('span');
      el.style.cssText =
        'display:inline-block; width:36px; height:36px; line-height:36px;' +
        'text-align:center; font-size:22px; border-radius:6px;' +
        'border:2px solid ' + labelColor + ';' +
        'background:rgba(0,0,0,0.5);';
      el.textContent = _slotEmoji(slot);
      el.title = _slotLabel(slot);
      strip.appendChild(el);
      _slotEls.push(el);
    }

    parent.appendChild(strip);
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

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0)';

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
    if (typeof FloorManager === 'undefined') return;
    var floorData = FloorManager.getFloorData();
    if (!floorData || !floorData.wallDecor) return;

    var decor = floorData.wallDecor;
    if (!decor[_facingY] || !decor[_facingY][_facingX]) return;

    var cell = decor[_facingY][_facingX];
    var faces = ['n', 's', 'e', 'w'];
    for (var f = 0; f < faces.length; f++) {
      var arr = cell[faces[f]];
      if (!arr) continue;
      for (var d = 0; d < arr.length; d++) {
        if (arr[d].spriteId === 'decor_torch') {
          if (isLit) {
            arr[d].scale = 0.25;
            arr[d].cavityGlow = true;
            arr[d].glowR = 255; arr[d].glowG = 140; arr[d].glowB = 40; arr[d].glowA = 0.3;
          } else {
            arr[d].scale = 0.2;
            arr[d].cavityGlow = false;
            delete arr[d].glowR;
            delete arr[d].glowG;
            delete arr[d].glowB;
            delete arr[d].glowA;
          }
        }
      }
    }
  }

  function _refreshSlotDisplay() {
    if (!_slotEls.length) return;
    var floorId = FloorManager.getCurrentFloorId();
    var torch = TorchState.getTorch(floorId, _facingX, _facingY);
    if (!torch) return;

    for (var i = 0; i < _slotEls.length && i < torch.slots.length; i++) {
      _slotEls[i].textContent = _slotEmoji(torch.slots[i]);
      _slotEls[i].title = _slotLabel(torch.slots[i]);
    }

    // Update subtitle text
    if (_subLabel) {
      _subLabel.textContent = '';
      var isLit = torch.tile === TILES.TORCH_LIT;
      _subLabel.appendChild(document.createTextNode(
        isLit ? 'wall torch (lit)' : 'wall torch (unlit)'
      ));
      _subLabel.appendChild(document.createElement('br'));

      if (_interacting) {
        _subLabel.appendChild(document.createTextNode(
          '[1-3] fill slot  [ESC] close'
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

  return {
    init:           init,
    update:         update,
    tryInteract:    tryInteract,
    handleKey:      handleKey,
    isActive:       isActive,
    isInteracting:  isInteracting
  };
})();

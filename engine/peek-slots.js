/**
 * PeekSlots — bridge between peek modules and the inventory/slot system.
 *
 * When the player interacts with a BREAKABLE or CORPSE tile that has a
 * CrateSystem container, PeekSlots opens CrateUI overlaid on gameplay
 * and registers the container's slot boxes as DragDrop target zones.
 * This allows drag-from-bag and drag-from-hand to fill crate/corpse
 * resource and suit card slots.
 *
 * States:
 *   IDLE     → player is walking around, peeks are autonomous
 *   FILLING  → CrateUI is open, slots are DragDrop targets, hand/bag accessible
 *   SEALED   → container sealed, celebration, auto-dismiss after 1s
 *
 * Transition triggers:
 *   IDLE → FILLING:   Player interacts with a tile that has an unsealed container
 *   FILLING → SEALED: Player presses 'S' and all slots are filled
 *   FILLING → IDLE:   Player presses ESC or walks away
 *   SEALED → IDLE:    Auto-dismiss timer (1s)
 *
 * During FILLING state:
 *   - CrateUI is open (renders slot boxes on canvas)
 *   - DragDrop zones registered for each unfilled slot
 *   - Player can press number keys (1-5) to fill slots from bag/hand
 *   - Player can drag items from the inventory face onto slots
 *   - The NCH widget remains visible for quick card access
 *   - Movement is BLOCKED (MovementController paused)
 *
 * Layer 3 (after CrateUI, CrateSystem, Player, DragDrop)
 * Depends on: CrateSystem, CrateUI, Player, DragDrop (optional),
 *             CardSystem (optional), MovementController, FloorManager,
 *             Toast (optional), AudioSystem (optional)
 *
 * @module PeekSlots
 */
var PeekSlots = (function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  var STATE = { IDLE: 0, FILLING: 1, SEALED: 2 };
  var SEALED_DISMISS_MS = 1200;
  var ZONE_PREFIX = 'crate-slot-';

  // ── State ────────────────────────────────────────────────────────
  var _state      = STATE.IDLE;
  var _targetX    = -1;
  var _targetY    = -1;
  var _floorId    = '';
  var _container  = null;   // CrateSystem container reference
  var _sealTimer  = 0;
  var _zonesRegistered = false;

  // ── Open / Close ─────────────────────────────────────────────────

  /**
   * Attempt to open the slot-filling interface for the tile at (x, y).
   * Returns true if a container was found and CrateUI opened.
   *
   * Called from Game._interact() for BREAKABLE and CORPSE tiles
   * when a CrateSystem container exists at that position.
   */
  function tryOpen(x, y, floorId) {
    if (_state !== STATE.IDLE) return false;
    if (typeof CrateSystem === 'undefined') return false;

    floorId = floorId || (typeof FloorManager !== 'undefined'
      ? FloorManager.getCurrentFloorId() : '0');

    if (!CrateSystem.hasContainer(x, y, floorId)) return false;

    var container = CrateSystem.getContainer(x, y, floorId);
    if (!container) return false;
    if (container.sealed) {
      if (typeof Toast !== 'undefined') {
        Toast.show('\u2714 Already sealed', 'info');
      }
      return false;
    }

    _targetX   = x;
    _targetY   = y;
    _floorId   = floorId;
    _container = container;
    _state     = STATE.FILLING;

    // Open CrateUI
    if (typeof CrateUI !== 'undefined') {
      CrateUI.open(x, y, floorId);
    }

    // Register DragDrop zones for each slot
    _registerSlotZones();

    // Play open sound
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui_open');
    }

    return true;
  }

  /**
   * Close the slot-filling interface and return to IDLE.
   */
  function close() {
    if (_state === STATE.IDLE) return;

    // Close CrateUI
    if (typeof CrateUI !== 'undefined' && CrateUI.isOpen()) {
      CrateUI.close();
    }

    // Unregister DragDrop zones
    _unregisterSlotZones();

    // Play close sound
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('ui_close');
    }

    _state     = STATE.IDLE;
    _targetX   = -1;
    _targetY   = -1;
    _floorId   = '';
    _container = null;
    _sealTimer = 0;
  }

  /**
   * Seal the container (called when player presses 'S' with all slots filled).
   */
  function trySeal() {
    if (_state !== STATE.FILLING) return false;
    if (typeof CrateSystem === 'undefined') return false;

    if (!CrateSystem.canSeal(_targetX, _targetY, _floorId)) {
      if (typeof Toast !== 'undefined') {
        Toast.show('Fill all slots first!', 'warning');
      }
      return false;
    }

    var result = CrateSystem.seal(_targetX, _targetY, _floorId);

    // Announce reward
    if (typeof Toast !== 'undefined') {
      var msg = '\u2728 Sealed! +' + result.totalCoins + 'g';
      if (result.reward) {
        msg += ' | Bonus: ' + (result.reward.type || 'item');
      }
      if (result.canReanimate) {
        msg += ' | \u2620\uFE0F Ready to reanimate!';
      }
      Toast.show(msg, 'loot');
    }

    // Grant coins via authority path
    if (typeof CardTransfer !== 'undefined') {
      CardTransfer.lootGold(result.totalCoins);
    } else if (typeof CardAuthority !== 'undefined') {
      CardAuthority.addGold(result.totalCoins);
    }

    // Coin VFX — seal is a big moment, use coinRain for ≥ 5g, burst for smaller
    var _sealCanvas = document.getElementById('view-canvas');
    if (typeof ParticleFX !== 'undefined' && _sealCanvas) {
      var scx = _sealCanvas.width / 2;
      var scy = _sealCanvas.height * 0.4;
      if (result.totalCoins >= 5) {
        ParticleFX.coinRain(scx, scy, result.totalCoins);
      } else if (result.totalCoins > 0) {
        ParticleFX.coinBurst(scx, scy, Math.max(3, result.totalCoins));
      }
    }

    // Transition to SEALED state
    _state     = STATE.SEALED;
    _sealTimer = 0;

    // Unregister drag zones (container is done)
    _unregisterSlotZones();

    // Play seal SFX
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play('pickup-success');
    }

    return true;
  }

  // ── Update (per-frame) ───────────────────────────────────────────

  function update(dt) {
    if (_state === STATE.SEALED) {
      _sealTimer += dt;
      if (_sealTimer >= SEALED_DISMISS_MS) {
        close();
      }
    }

    // Update slot zone bounds if CrateUI is rendering
    if (_state === STATE.FILLING && _zonesRegistered) {
      _updateSlotZoneBounds();
    }
  }

  // ── DragDrop Zone Management ─────────────────────────────────────

  function _registerSlotZones() {
    if (typeof DragDrop === 'undefined') return;
    if (!_container || !_container.slots) return;
    if (_zonesRegistered) _unregisterSlotZones();

    for (var i = 0; i < _container.slots.length; i++) {
      (function (slotIdx) {
        var slot = _container.slots[slotIdx];
        var zoneId = ZONE_PREFIX + slotIdx;

        DragDrop.registerZone(zoneId, {
          x: 0, y: 0, w: 0, h: 0,  // Updated dynamically by _updateSlotZoneBounds
          accepts: function (payload) {
            if (!payload) return false;
            if (slot.filled) return false;

            // Suit card slot: accepts cards with matching suit
            if (slot.frameTag === 'suit_card') {
              if (payload.type !== 'card') return false;
              var card = payload.data;
              return card && card.suit === slot.suit;
            }

            // Resource slot: accepts items from bag
            if (payload.type !== 'item') return false;
            return true;
          },
          onDrop: function (payload) {
            if (!payload || !payload.data) return false;
            if (slot.filled) return false;

            var item = payload.data;

            // Remove from source
            if (payload.type === 'card') {
              // Card from hand
              CardAuthority.removeFromHand(payload.index);
            } else if (payload.type === 'item') {
              // Item from bag
              CardAuthority.removeFromBagById(item.id);
            }

            // Fill the slot via CrateSystem
            var result = CrateSystem.fillSlot(
              _targetX, _targetY, _floorId, slotIdx, item
            );

            if (result) {
              if (typeof Toast !== 'undefined') {
                var matchTxt = result.matched ? ' \u2713' : '';
                Toast.show(
                  (item.emoji || '\uD83D\uDCE6') + ' \u2192 slot ' + (slotIdx + 1) + matchTxt +
                  ' (+' + result.coins + 'g)',
                  'loot'
                );
              }
              // Authority path for per-slot coin award
              if (typeof CardTransfer !== 'undefined') {
                CardTransfer.lootGold(result.coins);
              } else if (typeof CardAuthority !== 'undefined') {
                CardAuthority.addGold(result.coins);
              }
              // Per-slot coin burst (small amounts, keep subtle)
              if (result.coins > 0 && typeof ParticleFX !== 'undefined') {
                var _slotCanvas = document.getElementById('view-canvas');
                if (_slotCanvas) {
                  ParticleFX.coinBurst(
                    _slotCanvas.width / 2,
                    _slotCanvas.height * 0.4,
                    Math.max(2, result.coins)
                  );
                }
              }
              if (typeof AudioSystem !== 'undefined') {
                AudioSystem.play('pickup-success');
              }
              return true;
            }
            return false;
          },
          onHover: function () {},
          onLeave: function () {}
        });
      })(i);
    }

    _zonesRegistered = true;
  }

  function _unregisterSlotZones() {
    if (typeof DragDrop === 'undefined') return;
    if (!_container || !_container.slots) {
      _zonesRegistered = false;
      return;
    }

    for (var i = 0; i < _container.slots.length; i++) {
      DragDrop.removeZone(ZONE_PREFIX + i);
    }
    _zonesRegistered = false;
  }

  /**
   * Update DragDrop zone bounds to match CrateUI's rendered slot positions.
   * CrateUI renders on canvas, so we need to know where the slots appear.
   */
  function _updateSlotZoneBounds() {
    if (typeof DragDrop === 'undefined' || typeof CrateUI === 'undefined') return;
    if (!_container || !_container.slots) return;

    // CrateUI slot layout constants (must match crate-ui.js)
    var SLOT_SIZE = 56;
    var SLOT_GAP  = 14;
    var PANEL_Y_FRAC = 0.38;

    var canvas = document.getElementById('view-canvas');
    if (!canvas) return;
    var vpW = canvas.width;
    var vpH = canvas.height;
    var slotCount = _container.slots.length;
    var totalW = slotCount * SLOT_SIZE + (slotCount - 1) * SLOT_GAP;
    var startX = (vpW - totalW) / 2;
    var slotY  = vpH * PANEL_Y_FRAC;

    for (var i = 0; i < slotCount; i++) {
      var zoneId = ZONE_PREFIX + i;
      DragDrop.updateZone(zoneId, {
        x: startX + i * (SLOT_SIZE + SLOT_GAP),
        y: slotY,
        w: SLOT_SIZE,
        h: SLOT_SIZE
      });
    }
  }

  // ── Input Handling ───────────────────────────────────────────────

  /**
   * Handle a key press during FILLING state.
   * Returns true if the key was consumed.
   */
  function handleKey(key) {
    if (_state !== STATE.FILLING) return false;

    // ESC → close
    if (key === 'Escape') {
      close();
      return true;
    }

    // S → seal
    if (key === 'KeyS' || key === 's') {
      return trySeal();
    }

    // Delegate to CrateUI for number keys (1-5 fill slots)
    if (typeof CrateUI !== 'undefined') {
      return CrateUI.handleKey(key);
    }

    return false;
  }

  // ── Queries ──────────────────────────────────────────────────────

  function isOpen()   { return _state !== STATE.IDLE; }
  function isFilling(){ return _state === STATE.FILLING; }
  function isSealed() { return _state === STATE.SEALED; }

  function getTarget() {
    if (_state === STATE.IDLE) return null;
    return { x: _targetX, y: _targetY, floorId: _floorId };
  }

  function getContainerType() {
    return _container ? _container.type : null;
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    tryOpen:          tryOpen,
    close:            close,
    trySeal:          trySeal,
    update:           update,
    handleKey:        handleKey,
    isOpen:           isOpen,
    isFilling:        isFilling,
    isSealed:         isSealed,
    getTarget:        getTarget,
    getContainerType: getContainerType,

    // Constants
    STATE: STATE
  };
})();

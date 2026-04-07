/**
 * RestockBridge — adapter between peek modules and the unified RestockSurface.
 *
 * Maps the various peek interaction entry points (CratePeek, TorchPeek,
 * CorpsePeek) into RestockSurface.open(mode, x, y, floorId). Handles mode
 * detection for containers (crate vs corpse vs torch) and provides the
 * glue that PeekSlots.tryOpen() calls instead of CrateUI.open().
 *
 * RS-1 supports 'crate' mode, RS-2 adds 'torch' mode, RS-3 adds 'corpse' mode.
 * All three modes route through RestockSurface; harvest-only corpses stay on legacy CorpseActions.
 *
 * Layer 3 — depends on: RestockSurface, CrateSystem, PeekSlots (optional),
 *           TorchState (optional), i18n (optional)
 *
 * @module RestockBridge
 */
var RestockBridge = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────
  var TURN_DEBOUNCE_MS  = 150;   // ms before transitioning on face-turn
  var CLOSE_DEBOUNCE_MS = 300;   // ms before auto-close on non-interactable

  // ── State ──────────────────────────────────────────────────────────
  var _active    = false;
  var _mode      = null;
  var _x         = -1;
  var _y         = -1;
  var _floorId   = '';

  // Face-turn tracking (RS-4)
  var _lastPx      = -1;   // Player position last frame
  var _lastPy      = -1;
  var _pendingFx   = -1;   // Facing tile being debounced
  var _pendingFy   = -1;
  var _pendingMode = null;
  var _turnTimer   = 0;    // Accumulates toward TURN_DEBOUNCE_MS
  var _closeTimer  = 0;    // Accumulates toward CLOSE_DEBOUNCE_MS

  // ── Mode Detection ─────────────────────────────────────────────────

  /**
   * Determine the restock mode for a tile interaction.
   * Returns 'crate' | 'corpse' | 'torch' | null (not restockable).
   */
  function detectMode(x, y, floorId) {
    // Check CrateSystem container type
    if (typeof CrateSystem !== 'undefined' && CrateSystem.hasContainer(x, y, floorId)) {
      var container = CrateSystem.getContainer(x, y, floorId);
      if (container && !container.sealed) {
        if (container.type === 'crate')  return 'crate';
        if (container.type === 'corpse') return 'corpse';
        // Chests are withdraw-only — not a restock interaction
      }
    }

    // RS-2: Check TorchState for torch tiles
    if (typeof TorchState !== 'undefined' && TorchState.getTorch) {
      if (TorchState.getTorch(floorId, x, y)) return 'torch';
    }

    return null;
  }

  // ── Open / Close ───────────────────────────────────────────────────

  /**
   * Open the restock surface for the given tile.
   * Called from PeekSlots.tryOpen() as a replacement for CrateUI.open().
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @param {string} [modeOverride] — force a specific mode
   * @returns {boolean} true if surface opened
   */
  function open(x, y, floorId, modeOverride) {
    var mode = modeOverride || detectMode(x, y, floorId);
    if (!mode) return false;

    // RS-3: crate, torch, and corpse modes are fully supported
    if (mode !== 'crate' && mode !== 'torch' && mode !== 'corpse') {
      // Fall back to legacy UI for unsupported modes
      return _legacyFallback(mode, x, y, floorId);
    }

    if (typeof RestockSurface === 'undefined') return false;

    _mode    = mode;
    _x       = x;
    _y       = y;
    _floorId = floorId;
    _active  = true;

    // Snapshot player position so face-turn detection doesn't false-trigger on first frame
    if (typeof Player !== 'undefined') {
      var _p = Player.getPos();
      _lastPx = _p.x;
      _lastPy = _p.y;
    }

    RestockSurface.open(mode, x, y, floorId);
    return true;
  }

  /**
   * Close the restock surface.
   * Called from PeekSlots.close() or RestockSurface.close().
   */
  function close() {
    if (!_active) return;

    _active  = false;
    _mode    = null;
    _x       = -1;
    _y       = -1;
    _floorId = '';

    // Reset face-turn state
    _lastPx      = -1;
    _lastPy      = -1;
    _pendingFx   = -1;
    _pendingFy   = -1;
    _pendingMode = null;
    _turnTimer   = 0;
    _closeTimer  = 0;

    if (typeof RestockSurface !== 'undefined' && RestockSurface.isOpen()) {
      RestockSurface.close();
    }
  }

  /**
   * Fall back to legacy peek UI for modes not yet supported by RestockSurface.
   */
  function _legacyFallback(mode, x, y, floorId) {
    if (mode === 'torch') {
      // TorchPeek handles its own UI — no bridge needed
      return false;
    }
    if (mode === 'corpse') {
      // CorpsePeek → PeekSlots → CrateUI (legacy path)
      if (typeof CrateUI !== 'undefined') {
        CrateUI.open(x, y, floorId);
        return true;
      }
    }
    return false;
  }

  // ── Key Routing ────────────────────────────────────────────────────

  /**
   * Route keyboard input to the restock surface.
   * Called from game.js key handler when the surface is active.
   * Returns true if the key was consumed.
   */
  function handleKey(key) {
    if (!_active) return false;
    if (typeof RestockSurface !== 'undefined') {
      return RestockSurface.handleKey(key);
    }
    return false;
  }

  // ── Per-frame Update ───────────────────────────────────────────────

  /**
   * RS-4: Per-frame update with face-turn detection.
   *
   * Polls Player.getPos() + getDir() each frame. If the faced tile changes:
   *   - New restockable tile → debounce then transition()
   *   - Non-interactable → debounce then auto-close
   *   - Player moved (position change) → immediate close
   */
  function update(dt) {
    if (!_active) return;

    // Delegate surface frame update
    if (typeof RestockSurface !== 'undefined') {
      RestockSurface.update(dt);
    }

    // Face-turn detection requires Player + MovementController + FloorManager
    if (typeof Player === 'undefined' || typeof MovementController === 'undefined' ||
        typeof FloorManager === 'undefined') return;

    var p   = Player.getPos();
    var dir = Player.getDir();

    // Immediate close on player movement (position changed)
    if (_lastPx >= 0 && (p.x !== _lastPx || p.y !== _lastPy)) {
      _lastPx = p.x;
      _lastPy = p.y;
      close();
      return;
    }
    _lastPx = p.x;
    _lastPy = p.y;

    // Compute faced tile
    var fx = p.x + MovementController.DX[dir];
    var fy = p.y + MovementController.DY[dir];
    var floorId = FloorManager.getCurrentFloorId();

    // Still facing same target — nothing to do
    if (fx === _x && fy === _y && floorId === _floorId) {
      _turnTimer  = 0;
      _closeTimer = 0;
      return;
    }

    // Faced tile changed — detect mode on new tile
    var newMode = detectMode(fx, fy, floorId);

    if (newMode) {
      // Restockable tile — debounce before transition
      _closeTimer = 0;
      if (fx === _pendingFx && fy === _pendingFy && newMode === _pendingMode) {
        _turnTimer += dt;
      } else {
        _pendingFx   = fx;
        _pendingFy   = fy;
        _pendingMode = newMode;
        _turnTimer   = 0;
      }

      if (_turnTimer >= TURN_DEBOUNCE_MS) {
        _x       = fx;
        _y       = fy;
        _floorId = floorId;
        _mode    = newMode;
        _turnTimer  = 0;
        _pendingFx  = -1;
        _pendingFy  = -1;
        _pendingMode = null;
        if (typeof RestockSurface !== 'undefined') {
          RestockSurface.transition(newMode, fx, fy, floorId);
        }
      }
    } else {
      // Non-interactable — debounce before auto-close
      _turnTimer = 0;
      _closeTimer += dt;
      if (_closeTimer >= CLOSE_DEBOUNCE_MS) {
        _closeTimer = 0;
        close();
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    detectMode: detectMode,
    open:       open,
    close:      close,
    handleKey:  handleKey,
    update:     update,
    isActive:   function () { return _active; },
    getMode:    function () { return _mode; },
    getTarget:  function () { return { x: _x, y: _y, floorId: _floorId }; }
  };
})();

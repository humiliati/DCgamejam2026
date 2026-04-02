/**
 * InventoryOverlay — DOM overlay companion for the Face 2 canvas inventory.
 *
 * Layer 2 (same as DragDrop). Creates transparent DOM overlay divs that
 * sit on top of canvas-rendered inventory zones. Provides:
 *
 *   - CSS context class toggling on drag hover (context-buying, -selling,
 *     -disposing, -disabled) via inventory-drag.css
 *   - Zone-specific border highlights (.zone-bag, .zone-equipped, etc.)
 *   - Incinerator two-phase tease → burn animation
 *   - Combat lock overlay (.combat-locked)
 *   - Sync with DragDrop zone bounds each frame
 *
 * Does NOT replace any canvas rendering. This is purely an additive
 * CSS animation layer on top of what menu-faces.js already draws.
 *
 * Lifecycle:
 *   mount()  — called when Face 2 opens (creates DOM elements)
 *   sync(layout)  — called each frame from _storeInvLayout (repositions divs)
 *   unmount()  — called when Face 2 closes (removes DOM elements)
 *
 * @module InventoryOverlay
 */
var InventoryOverlay = (function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────

  /** Root container div (appended to #viewport) */
  var _root = null;

  /** Whether overlay is currently mounted */
  var _mounted = false;

  /**
   * Map of zone ID → overlay div element.
   * Zone IDs match DragDrop: 'inv-eq-0'..'inv-eq-2', 'inv-bag-0'..'inv-bag-4',
   * 'inv-hand-0'..'inv-hand-4', 'inv-deck-0'..'inv-deck-4', 'inv-incin'.
   */
  var _overlays = {};

  /** Canvas element reference (needed for coordinate mapping) */
  var _canvas = null;

  /** Current combat lock state */
  var _combatLocked = false;

  /** Incinerator burn timeout ID (for cleanup) */
  var _burnTimeout = null;

  // ── Zone CSS class mapping ───────────────────────────────────────

  /**
   * Maps zone ID prefix to its CSS zone class.
   * Applied permanently (while mounted) for per-zone border colors.
   */
  var ZONE_CLASS_MAP = {
    'inv-eq-':   'zone-equipped',
    'inv-bag-':  'zone-bag',
    'inv-hand-': 'zone-hand',
    'inv-deck-': 'zone-deck',
    'inv-incin': 'zone-debrief'
  };

  /**
   * Get the CSS zone class for a given zone ID.
   */
  function _zoneClass(zoneId) {
    var keys = Object.keys(ZONE_CLASS_MAP);
    for (var i = 0; i < keys.length; i++) {
      if (zoneId.indexOf(keys[i]) === 0) return ZONE_CLASS_MAP[keys[i]];
    }
    return '';
  }

  // ── Mount / Unmount ──────────────────────────────────────────────

  /**
   * Create the overlay DOM structure and append to #viewport.
   * Called once when Face 2 (inventory) opens.
   *
   * @param {HTMLCanvasElement} canvas  The view-canvas element
   */
  function mount(canvas) {
    if (_mounted) unmount();

    _canvas = canvas || document.getElementById('view-canvas');
    if (!_canvas) return;

    var viewport = _canvas.parentElement || document.getElementById('viewport');
    if (!viewport) return;

    // Root container — covers the canvas, receives combat-locked class
    _root = document.createElement('div');
    _root.id = 'inv-overlay';
    _root.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:50;';

    // Create overlay divs for each zone type
    var zoneIds = _buildZoneIds();
    for (var i = 0; i < zoneIds.length; i++) {
      var div = document.createElement('div');
      div.className = 'drop-zone-overlay ' + _zoneClass(zoneIds[i]);
      div.dataset.zone = zoneIds[i];
      _root.appendChild(div);
      _overlays[zoneIds[i]] = div;
    }

    viewport.appendChild(_root);
    _mounted = true;
    _combatLocked = false;
  }

  /**
   * Build the list of zone IDs to create overlay divs for.
   */
  function _buildZoneIds() {
    var ids = [];
    var ei, bi, hi, di;
    for (ei = 0; ei < 3; ei++) ids.push('inv-eq-' + ei);
    for (bi = 0; bi < 5; bi++) ids.push('inv-bag-' + bi);
    for (hi = 0; hi < 5; hi++) ids.push('inv-hand-' + hi);
    for (di = 0; di < 5; di++) ids.push('inv-deck-' + di);
    ids.push('inv-incin');
    return ids;
  }

  /**
   * Remove all overlay DOM elements.
   * Called when Face 2 closes or menu closes.
   */
  function unmount() {
    if (_burnTimeout) {
      clearTimeout(_burnTimeout);
      _burnTimeout = null;
    }
    if (_root && _root.parentNode) {
      _root.parentNode.removeChild(_root);
    }
    _root = null;
    _overlays = {};
    _mounted = false;
    _combatLocked = false;
  }

  /**
   * Is the overlay currently mounted?
   */
  function isMounted() {
    return _mounted;
  }

  // ── Sync Zone Positions ──────────────────────────────────────────

  /**
   * Reposition all overlay divs to match the canvas-rendered zones.
   * Called each frame from _storeInvLayout in menu-faces.js.
   *
   * Converts canvas-space coordinates to CSS percentages relative
   * to the viewport div, so overlays align with the canvas content
   * regardless of canvas scaling.
   *
   * @param {object} layout  {
   *   eqSlots:   [{x,y,w,h}, ...],  // 3 equipped zones
   *   bagSlots:  [{x,y,w,h}, ...],  // 5 visible bag zones
   *   handSlots: [{x,y,w,h}, ...],  // 5 hand zones
   *   deckSlots: [{x,y,w,h}, ...],  // 5 deck zones
   *   incin:     {x,y,w,h}          // incinerator
   * }
   */
  function sync(layout) {
    if (!_mounted || !_canvas || !layout) return;

    var cW = _canvas.width;
    var cH = _canvas.height;
    if (!cW || !cH) return;

    // Position each zone group
    _syncGroup('inv-eq-', layout.eqSlots, 3, cW, cH);
    _syncGroup('inv-bag-', layout.bagSlots, 5, cW, cH);
    _syncGroup('inv-hand-', layout.handSlots, 5, cW, cH);
    _syncGroup('inv-deck-', layout.deckSlots, 5, cW, cH);

    // Incinerator
    if (layout.incin && _overlays['inv-incin']) {
      _positionDiv(_overlays['inv-incin'], layout.incin, cW, cH);
    }
  }

  /**
   * Position a group of overlay divs from layout data.
   */
  function _syncGroup(prefix, slots, count, cW, cH) {
    if (!slots) return;
    for (var i = 0; i < count; i++) {
      var div = _overlays[prefix + i];
      if (div && slots[i]) {
        _positionDiv(div, slots[i], cW, cH);
      }
    }
  }

  /**
   * Position a single overlay div using percentage-based layout.
   * Canvas coords → CSS percentages so it scales with canvas.
   */
  function _positionDiv(div, rect, cW, cH) {
    div.style.left   = ((rect.x / cW) * 100) + '%';
    div.style.top    = ((rect.y / cH) * 100) + '%';
    div.style.width  = ((rect.w / cW) * 100) + '%';
    div.style.height = ((rect.h / cH) * 100) + '%';
  }

  // ── Context Class Management ─────────────────────────────────────

  /**
   * Set a context class on a zone overlay (e.g., 'context-disposing').
   * Called by DragDrop onHover callbacks.
   *
   * @param {string} zoneId       DragDrop zone ID (e.g. 'inv-incin')
   * @param {string} contextClass CSS class to add
   */
  function setContext(zoneId, contextClass) {
    var div = _overlays[zoneId];
    if (!div) return;
    if (!div.classList.contains(contextClass)) {
      div.classList.add(contextClass);
    }
  }

  /**
   * Remove a context class from a zone overlay.
   * Called by DragDrop onLeave callbacks.
   *
   * @param {string} zoneId       DragDrop zone ID
   * @param {string} contextClass CSS class to remove
   */
  function clearContext(zoneId, contextClass) {
    var div = _overlays[zoneId];
    if (!div) return;
    div.classList.remove(contextClass);
  }

  /**
   * Remove ALL context-* classes from a zone overlay.
   */
  function clearAllContexts(zoneId) {
    var div = _overlays[zoneId];
    if (!div) return;
    var classes = div.className.split(' ');
    for (var i = classes.length - 1; i >= 0; i--) {
      if (classes[i].indexOf('context-') === 0 ||
          classes[i] === 'drop-zone-active' ||
          classes[i] === 'incinerator-tease' ||
          classes[i] === 'incinerator-active') {
        div.classList.remove(classes[i]);
      }
    }
  }

  /**
   * Activate drop-zone-active pulse on all zones that can accept
   * the current drag payload. Called when a drag starts.
   *
   * @param {object} payload  DragDrop payload
   */
  function highlightAcceptingZones(payload) {
    if (!_mounted || typeof DragDrop === 'undefined') return;
    var keys = Object.keys(_overlays);
    for (var i = 0; i < keys.length; i++) {
      var zone = DragDrop.getZone(keys[i]);
      if (zone && zone.accepts && zone.accepts(payload)) {
        _overlays[keys[i]].classList.add('drop-zone-active');
      }
    }
  }

  /**
   * Remove drop-zone-active from all zones. Called when drag ends.
   */
  function clearAllHighlights() {
    if (!_mounted) return;
    var keys = Object.keys(_overlays);
    for (var i = 0; i < keys.length; i++) {
      _overlays[keys[i]].classList.remove('drop-zone-active');
      clearAllContexts(keys[i]);
    }
  }

  // ── Incinerator Two-Phase ────────────────────────────────────────

  /**
   * Phase 1 — TEASE: fire-flicker on hover.
   * Called by incinerator zone onHover callback.
   */
  function incineratorTease() {
    var div = _overlays['inv-incin'];
    if (!div) return;
    div.classList.add('incinerator-tease');
    div.classList.add('context-disposing');
  }

  /**
   * Cancel tease (on leave without drop).
   */
  function incineratorCancelTease() {
    var div = _overlays['inv-incin'];
    if (!div) return;
    div.classList.remove('incinerator-tease');
    div.classList.remove('context-disposing');
  }

  /**
   * Phase 2 — BURN: scale pulse on drop.
   * Plays incinerator-burn animation + rumble SFX.
   * Auto-resets after 600ms.
   */
  function incineratorBurn() {
    var div = _overlays['inv-incin'];
    if (!div) return;

    // Clear tease, apply burn
    div.classList.remove('incinerator-tease');
    div.classList.remove('context-disposing');
    div.classList.add('incinerator-active');

    // Rumble SFX
    if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      AudioSystem.play('rumble-1', { volume: 0.4 });
    }

    // Auto-reset after animation completes
    if (_burnTimeout) clearTimeout(_burnTimeout);
    _burnTimeout = setTimeout(function () {
      if (div) div.classList.remove('incinerator-active');
      _burnTimeout = null;
    }, 650);
  }

  // ── Success / Failure Feedback ───────────────────────────────────

  /**
   * Flash a success animation on a zone.
   * @param {string} zoneId
   * @param {string} [type]  'money-bag' | 'slot' (default: 'money-bag')
   */
  function flashSuccess(zoneId, type) {
    var div = _overlays[zoneId];
    if (!div) return;
    var cls = (type === 'slot') ? 'slot-active' : 'money-bag-active';
    div.classList.add(cls);
    setTimeout(function () { if (div) div.classList.remove(cls); }, 650);
  }

  /**
   * Flash a failure shake on a zone.
   * @param {string} zoneId
   */
  function flashFail(zoneId) {
    var div = _overlays[zoneId];
    if (!div) return;
    div.classList.add('transaction-failed');
    setTimeout(function () { if (div) div.classList.remove('transaction-failed'); }, 450);
  }

  // ── Combat Lock ──────────────────────────────────────────────────

  /**
   * Check combat state and toggle lock.
   * Called each frame from the menu render loop.
   *
   * When locked: all zones get context-disabled, root gets .combat-locked.
   * When unlocked: classes are removed.
   *
   * Uses CombatEngine.isActive() as the authoritative combat state check.
   */
  function updateCombatLock() {
    if (!_mounted || !_root) return;

    var inCombat = (typeof CombatEngine !== 'undefined' && CombatEngine.isActive)
      ? CombatEngine.isActive() : false;

    if (inCombat === _combatLocked) return; // No change

    _combatLocked = inCombat;

    if (inCombat) {
      _root.classList.add('combat-locked');
      // Disable all DragDrop zones except hand (sorting allowed)
      var keys = Object.keys(_overlays);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('inv-hand-') !== 0) {
          _overlays[keys[i]].classList.add('context-disabled');
          if (typeof DragDrop !== 'undefined') {
            DragDrop.setZoneActive(keys[i], false);
          }
        }
      }
    } else {
      _root.classList.remove('combat-locked');
      var keys2 = Object.keys(_overlays);
      for (var j = 0; j < keys2.length; j++) {
        _overlays[keys2[j]].classList.remove('context-disabled');
        if (typeof DragDrop !== 'undefined') {
          DragDrop.setZoneActive(keys2[j], true);
        }
      }
    }
  }

  /**
   * Is the inventory currently combat-locked?
   */
  function isCombatLocked() {
    return _combatLocked;
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    // Lifecycle
    mount:             mount,
    unmount:           unmount,
    isMounted:         isMounted,
    sync:              sync,

    // Context classes
    setContext:         setContext,
    clearContext:       clearContext,
    clearAllContexts:  clearAllContexts,
    highlightAcceptingZones: highlightAcceptingZones,
    clearAllHighlights: clearAllHighlights,

    // Incinerator
    incineratorTease:       incineratorTease,
    incineratorCancelTease: incineratorCancelTease,
    incineratorBurn:        incineratorBurn,

    // Feedback
    flashSuccess:  flashSuccess,
    flashFail:     flashFail,

    // Combat lock
    updateCombatLock: updateCombatLock,
    isCombatLocked:   isCombatLocked
  };
})();

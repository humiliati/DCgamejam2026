/**
 * RestockSurface — unified restock DOM panel.
 *
 * Replaces scattered CrateUI / TorchPeek / CorpsePeek slot UIs with a
 * single two-half surface: container wheel (left) + supply rows (right).
 * Opens over the viewport at z-index 19 (above peek labels at 18, below
 * modal panels at 20).
 *
 * Lifecycle:
 *   open(mode, containerData)  → slide-in, populate both halves
 *   close()                    → slide-out, tear down
 *   transition(mode, data)     → swap container wheel contents (200ms slide)
 *
 * Modes (RS-1 ships 'crate' only; RS-2/3 add 'torch', 'corpse'):
 *   'crate'  — CrateSystem deposit container
 *   'torch'  — TorchState 3-slot fuel model        (stub)
 *   'corpse' — CrateSystem corpse container         (stub)
 *
 * DOM structure:
 *   #restock-surface  (position:absolute, fills viewport)
 *     #rs-wheel-half  (left 50%)
 *     #rs-supply-half (right 50%)
 *     #rs-footer      (seal/close buttons + hint line)
 *
 * Layer 3 — depends on: DragDrop (optional), CrateSystem, CardAuthority,
 *           RestockWheel, SupplyRows, i18n (optional)
 *
 * @module RestockSurface
 */
var RestockSurface = (function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────
  var PANEL_ID       = 'restock-surface';
  var Z_INDEX        = 19;
  var ANIM_MS        = 220;    // slide-in / slide-out duration
  var TRANSITION_MS  = 200;    // wheel content swap slide

  // ── Colours / styling tokens ───────────────────────────────────────
  var BG_COLOR       = 'rgba(16,14,12,0.92)';
  var BORDER_COLOR   = 'rgba(180,160,120,0.35)';
  var DIVIDER_COLOR  = 'rgba(180,160,120,0.2)';
  var FOOTER_BG      = 'rgba(20,18,14,0.8)';
  var BTN_BG         = 'rgba(60,55,45,0.7)';
  var BTN_HOVER      = 'rgba(90,80,60,0.8)';
  var BTN_SEAL_BG    = 'rgba(60,120,60,0.7)';
  var BTN_SEAL_HOVER = 'rgba(80,160,80,0.8)';
  var TEXT_DIM       = 'rgba(200,190,170,0.6)';
  var TEXT_BRIGHT     = 'rgba(240,230,210,0.95)';

  // ── State ──────────────────────────────────────────────────────────
  var _open      = false;
  var _mode      = null;      // 'crate' | 'torch' | 'corpse'
  var _el        = null;      // Root DOM element
  var _wheelHalf = null;      // Left half container
  var _supplyHalf = null;     // Right half container
  var _footer    = null;      // Footer bar
  var _sealBtn   = null;
  var _closeBtn  = null;
  var _hintEl    = null;
  var _animTimer = null;

  // Container data passed in by RestockBridge / PeekSlots
  var _containerX  = -1;
  var _containerY  = -1;
  var _floorId     = '';

  // RS-5: Decorative BoxAnim backdrop
  var _backdropId  = null;   // BoxAnim instance ID
  var _backdropEl  = null;   // Wrapper div for positioning

  // Mode → BoxAnim variant mapping (mirrors what each peek uses)
  var BACKDROP_VARIANT = {
    crate:  'crate',
    torch:  'chest',
    corpse: 'chest'
  };

  // ── CSS Injection ──────────────────────────────────────────────────

  var _cssInjected = false;

  function _injectCSS() {
    if (_cssInjected) return;
    var style = document.createElement('style');
    style.textContent = [
      '#' + PANEL_ID + ' {',
      '  position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
      '  z-index: ' + Z_INDEX + ';',
      '  display: flex; flex-direction: column;',
      '  background: ' + BG_COLOR + ';',
      '  border: 1px solid ' + BORDER_COLOR + ';',
      '  box-sizing: border-box;',
      '  opacity: 0; transform: translateY(12px);',
      '  transition: opacity ' + ANIM_MS + 'ms ease-out, transform ' + ANIM_MS + 'ms ease-out;',
      '  pointer-events: none;',
      '  font-family: monospace;',
      '  color: ' + TEXT_BRIGHT + ';',
      '}',
      '#' + PANEL_ID + '.rs-visible {',
      '  opacity: 1; transform: translateY(0);',
      '  pointer-events: auto;',
      '}',
      /* -- Layout: two halves side by side -- */
      '.rs-body {',
      '  display: flex; flex: 1; min-height: 0;',
      '}',
      '.rs-half {',
      '  flex: 1; display: flex; flex-direction: column;',
      '  padding: 12px; overflow: hidden;',
      '}',
      '.rs-half--wheel {',
      '  border-right: 1px solid ' + DIVIDER_COLOR + ';',
      '}',
      /* -- Section headers -- */
      '.rs-header {',
      '  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;',
      '  color: ' + TEXT_DIM + '; margin-bottom: 8px; padding: 0 4px;',
      '}',
      /* -- Slot container inside each half -- */
      '.rs-slot-area {',
      '  flex: 1; display: flex; flex-direction: column;',
      '  align-items: center; justify-content: center;',
      '  min-height: 0;',
      '}',
      /* -- Footer bar -- */
      '.rs-footer {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 8px 12px;',
      '  background: ' + FOOTER_BG + ';',
      '  border-top: 1px solid ' + DIVIDER_COLOR + ';',
      '  min-height: 44px;',
      '}',
      '.rs-btn {',
      '  padding: 6px 16px; border: 1px solid ' + BORDER_COLOR + ';',
      '  border-radius: 4px; cursor: pointer; font: 12px monospace;',
      '  color: ' + TEXT_BRIGHT + '; background: ' + BTN_BG + ';',
      '  min-width: 56px; min-height: 48px;',  // RS-5: 48px minimum for Magic Remote gyro
      '  text-align: center; user-select: none;',
      '}',
      '.rs-btn:hover { background: ' + BTN_HOVER + '; }',
      '.rs-btn--seal { background: ' + BTN_SEAL_BG + '; }',
      '.rs-btn--seal:hover { background: ' + BTN_SEAL_HOVER + '; }',
      '.rs-btn--seal.rs-hidden { display: none; }',
      '.rs-hint {',
      '  font-size: 10px; color: ' + TEXT_DIM + ';',
      '  flex: 1; text-align: center; padding: 0 12px;',
      '}',
      /* -- Transition slide for wheel swap -- */
      '.rs-wheel-transition {',
      '  transition: transform ' + TRANSITION_MS + 'ms ease-in-out, opacity ' + TRANSITION_MS + 'ms ease-in-out;',
      '}',
      '.rs-wheel-exit {',
      '  transform: translateX(-100%); opacity: 0;',
      '}',
      '.rs-wheel-enter {',
      '  transform: translateX(100%); opacity: 0;',
      '}',
      '.rs-wheel-active {',
      '  transform: translateX(0); opacity: 1;',
      '}',
      /* -- RS-4: Seal celebration flash -- */
      '@keyframes rs-seal-flash {',
      '  0%   { background: rgba(80,220,80,0.25); }',
      '  40%  { background: rgba(255,215,0,0.15); }',
      '  100% { background: ' + BG_COLOR + '; }',
      '}',
      '#' + PANEL_ID + '.rs-seal-celebrate {',
      '  animation: rs-seal-flash 800ms ease-out;',
      '}',
      '@keyframes rs-seal-btn-pulse {',
      '  0%   { transform: scale(1); }',
      '  30%  { transform: scale(1.15); }',
      '  60%  { transform: scale(0.95); }',
      '  100% { transform: scale(1); }',
      '}',
      '.rs-btn--seal.rs-seal-pulse {',
      '  animation: rs-seal-btn-pulse 500ms ease-out;',
      '  background: rgba(80,200,80,0.9) !important;',
      '}',
      /* -- RS-5: BoxAnim decorative backdrop -- */
      '.rs-backdrop {',
      '  position: absolute; top: 50%; left: 50%;',
      '  transform: translate(-50%, -50%) scale(0.55);',
      '  opacity: 0; pointer-events: none;',
      '  transition: opacity 400ms ease-in;',
      '  z-index: 0;',  // Behind wheel content
      '}',
      '.rs-backdrop.rs-backdrop-visible {',
      '  opacity: 0.25;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
    _cssInjected = true;
  }

  // ── DOM Construction ───────────────────────────────────────────────

  function _buildDOM() {
    if (_el) return;

    _injectCSS();

    _el = document.createElement('div');
    _el.id = PANEL_ID;

    // -- Title bar (mode label) --
    var titleBar = document.createElement('div');
    titleBar.style.cssText = 'padding:8px 12px 0;font-size:13px;font-weight:bold;' +
      'color:' + TEXT_BRIGHT + ';';
    titleBar.id = 'rs-title';
    titleBar.textContent = '';
    _el.appendChild(titleBar);

    // -- Body: two halves --
    var body = document.createElement('div');
    body.className = 'rs-body';

    _wheelHalf = document.createElement('div');
    _wheelHalf.className = 'rs-half rs-half--wheel';
    _wheelHalf.innerHTML =
      '<div class="rs-header" id="rs-wheel-label">Container</div>' +
      '<div class="rs-slot-area" id="rs-wheel-area"></div>';

    _supplyHalf = document.createElement('div');
    _supplyHalf.className = 'rs-half rs-half--supply';
    _supplyHalf.innerHTML =
      '<div class="rs-header" id="rs-supply-label">Supplies</div>' +
      '<div class="rs-slot-area" id="rs-supply-area"></div>';

    body.appendChild(_wheelHalf);
    body.appendChild(_supplyHalf);
    _el.appendChild(body);

    // -- Footer --
    _footer = document.createElement('div');
    _footer.className = 'rs-footer';

    _closeBtn = document.createElement('div');
    _closeBtn.className = 'rs-btn';
    _closeBtn.textContent = '\u2715 Close';
    _closeBtn.addEventListener('click', function () { close(); });

    _sealBtn = document.createElement('div');
    _sealBtn.className = 'rs-btn rs-btn--seal rs-hidden';
    _sealBtn.textContent = '\u2728 Seal';
    _sealBtn.addEventListener('click', function () {
      if (typeof PeekSlots !== 'undefined') PeekSlots.trySeal();
    });

    _hintEl = document.createElement('div');
    _hintEl.className = 'rs-hint';
    _hintEl.textContent = '';

    _footer.appendChild(_closeBtn);
    _footer.appendChild(_hintEl);
    _footer.appendChild(_sealBtn);
    _el.appendChild(_footer);
  }

  // ── Mount / Unmount ────────────────────────────────────────────────

  function _mount() {
    if (!_el) _buildDOM();
    var viewport = document.getElementById('viewport');
    if (viewport && !_el.parentNode) {
      viewport.appendChild(_el);
    }
  }

  function _unmount() {
    if (_el && _el.parentNode) {
      _el.parentNode.removeChild(_el);
    }
  }

  // ── Open / Close ───────────────────────────────────────────────────

  /**
   * Open the restock surface.
   *
   * @param {string} mode  — 'crate' | 'torch' | 'corpse'
   * @param {number} x     — Container tile X
   * @param {number} y     — Container tile Y
   * @param {string} floorId
   */
  function open(mode, x, y, floorId) {
    if (_open) {
      // Already open — transition the wheel to new container
      if (mode !== _mode || x !== _containerX || y !== _containerY) {
        transition(mode, x, y, floorId);
      }
      return;
    }

    _mode       = mode || 'crate';
    _containerX = x;
    _containerY = y;
    _floorId    = floorId || '';
    _open       = true;

    _mount();

    // Set title based on mode
    _updateTitle();

    // Populate halves via sub-modules
    _populateWheel();
    _populateSupply();
    _updateFooter();

    // RS-5: Decorative BoxAnim backdrop
    _createBackdrop();

    // Trigger slide-in on next frame
    if (_animTimer) clearTimeout(_animTimer);
    requestAnimationFrame(function () {
      if (_el) _el.classList.add('rs-visible');
    });
  }

  /**
   * Close the restock surface with slide-out animation.
   */
  function close() {
    if (!_open) return;

    _open = false;

    // Tear down sub-module content
    _teardownWheel();
    _teardownSupply();
    _destroyBackdrop();

    // Slide-out
    if (_el) _el.classList.remove('rs-visible');

    // Remove from DOM after animation
    if (_animTimer) clearTimeout(_animTimer);
    _animTimer = setTimeout(function () {
      _unmount();
      _mode       = null;
      _containerX = -1;
      _containerY = -1;
      _floorId    = '';
    }, ANIM_MS + 20);

    // Notify PeekSlots the surface is closing (if it didn't initiate the close)
    if (typeof PeekSlots !== 'undefined' && PeekSlots.isOpen && PeekSlots.isOpen()) {
      PeekSlots.close();
    }
  }

  /**
   * Transition the container wheel to a new target without closing the surface.
   * Old wheel slides left/fades, new slides in from right.
   */
  function transition(mode, x, y, floorId) {
    _mode       = mode || _mode;
    _containerX = x;
    _containerY = y;
    _floorId    = floorId || _floorId;

    var wheelArea = document.getElementById('rs-wheel-area');
    if (!wheelArea) return;

    // Animate exit
    wheelArea.classList.add('rs-wheel-transition', 'rs-wheel-exit');

    setTimeout(function () {
      // Repopulate
      _teardownWheel();
      _populateWheel();
      _updateTitle();
      _updateFooter();

      // RS-5: Re-create backdrop for new mode/target
      _createBackdrop();

      // Snap to enter position, then animate in
      wheelArea.classList.remove('rs-wheel-exit');
      wheelArea.classList.add('rs-wheel-enter');
      requestAnimationFrame(function () {
        wheelArea.classList.remove('rs-wheel-enter');
        wheelArea.classList.add('rs-wheel-active');
        // Clean up classes after animation
        setTimeout(function () {
          wheelArea.classList.remove('rs-wheel-transition', 'rs-wheel-active');
        }, TRANSITION_MS + 10);
      });
    }, TRANSITION_MS);
  }

  // ── Content Population ─────────────────────────────────────────────

  function _updateTitle() {
    var titleEl = document.getElementById('rs-title');
    if (!titleEl) return;

    var labels = {
      crate:  '\uD83D\uDCE6 Restock Crate',    // 📦
      torch:  '\uD83D\uDD25 Refuel Torch',       // 🔥
      corpse: '\u2620\uFE0F Restock Corpse'       // ☠️
    };
    var t = typeof i18n !== 'undefined' && i18n.t
      ? i18n.t('restock.title.' + _mode, labels[_mode] || 'Restock')
      : (labels[_mode] || 'Restock');
    titleEl.textContent = t;
  }

  /**
   * Populate the left (wheel) half.
   * Delegates to RestockWheel if available; otherwise renders placeholder.
   */
  function _populateWheel() {
    var area = document.getElementById('rs-wheel-area');
    if (!area) return;

    var label = document.getElementById('rs-wheel-label');

    if (_mode === 'crate') {
      if (label) {
        label.textContent = typeof i18n !== 'undefined' && i18n.t
          ? i18n.t('restock.wheel.crate', 'Crate Slots')
          : 'Crate Slots';
      }

      // Delegate to RestockWheel
      if (typeof RestockWheel !== 'undefined') {
        RestockWheel.mount(area, _containerX, _containerY, _floorId, _mode);
        return;
      }

      // Fallback: render slot summary directly
      _renderFallbackSlots(area);

    } else if (_mode === 'torch') {
      if (label) {
        label.textContent = typeof i18n !== 'undefined' && i18n.t
          ? i18n.t('restock.wheel.torch', 'Torch Fuel')
          : 'Torch Fuel';
      }

      // RS-2: Delegate to RestockWheel in torch mode
      if (typeof RestockWheel !== 'undefined') {
        RestockWheel.mount(area, _containerX, _containerY, _floorId, 'torch');
        return;
      }

      // Fallback
      area.innerHTML = '<div style="color:' + TEXT_DIM + ';font-size:11px;">Torch slots unavailable</div>';

    } else if (_mode === 'corpse') {
      if (label) {
        label.textContent = typeof i18n !== 'undefined' && i18n.t
          ? i18n.t('restock.wheel.corpse', 'Corpse Slots')
          : 'Corpse Slots';
      }

      // RS-3: Delegate to RestockWheel — corpse containers share the CrateSystem slot model
      if (typeof RestockWheel !== 'undefined') {
        RestockWheel.mount(area, _containerX, _containerY, _floorId, 'corpse');
        return;
      }

      // Fallback
      area.innerHTML = '<div style="color:' + TEXT_DIM + ';font-size:11px;">Corpse slots unavailable</div>';
    }
  }

  /**
   * Populate the right (supply) half.
   * Delegates to SupplyRows if available; otherwise renders placeholder.
   */
  function _populateSupply() {
    var area = document.getElementById('rs-supply-area');
    if (!area) return;

    if (typeof SupplyRows !== 'undefined') {
      SupplyRows.mount(area, _mode, _containerX, _containerY, _floorId);
      return;
    }

    // Fallback: render bag summary
    _renderFallbackBag(area);
  }

  function _updateFooter() {
    // Seal button: visible only for deposit modes with all slots filled
    if (_sealBtn) {
      var showSeal = false;
      if (_mode === 'crate' || _mode === 'corpse') {
        if (typeof CrateSystem !== 'undefined') {
          showSeal = CrateSystem.canSeal(_containerX, _containerY, _floorId);
        }
      }
      if (showSeal) {
        _sealBtn.classList.remove('rs-hidden');
      } else {
        _sealBtn.classList.add('rs-hidden');
      }
    }

    // RS-4: Hint line with per-slot number key labels
    if (_hintEl) {
      var slotLabels = '';
      if (typeof RestockWheel !== 'undefined' && RestockWheel.getSlotLabels) {
        var labels = RestockWheel.getSlotLabels();
        var parts = [];
        for (var li = 0; li < labels.length; li++) {
          if (!labels[li].filled) {
            parts.push('[' + labels[li].key + ']' + labels[li].emoji);
          }
        }
        if (parts.length > 0) slotLabels = parts.join(' ');
      }

      var base = '';
      if (_mode === 'torch') {
        base = 'Drag fuel \u2192 slots';
      } else {
        base = 'Drag \u2192 slots | [S] Seal';
      }

      _hintEl.textContent = slotLabels
        ? base + '  ' + slotLabels
        : base;
    }
  }

  // ── Teardown ───────────────────────────────────────────────────────

  function _teardownWheel() {
    if (typeof RestockWheel !== 'undefined') {
      RestockWheel.unmount();
    }
    var area = document.getElementById('rs-wheel-area');
    if (area) area.innerHTML = '';
  }

  function _teardownSupply() {
    if (typeof SupplyRows !== 'undefined') {
      SupplyRows.unmount();
    }
    var area = document.getElementById('rs-supply-area');
    if (area) area.innerHTML = '';
  }

  // ── Fallback Renderers (before RestockWheel / SupplyRows exist) ───

  function _renderFallbackSlots(area) {
    if (typeof CrateSystem === 'undefined') return;
    var container = CrateSystem.getContainer(_containerX, _containerY, _floorId);
    if (!container || !container.slots) return;

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;justify-content:center;';

    for (var i = 0; i < container.slots.length; i++) {
      var slot = container.slots[i];
      var box = document.createElement('div');
      box.style.cssText =
        'width:56px;height:56px;border-radius:6px;display:flex;' +
        'align-items:center;justify-content:center;font-size:22px;' +
        'border:1px solid ' + (slot.filled ? 'rgba(80,180,80,0.6)' : BORDER_COLOR) + ';' +
        'background:' + (slot.filled ? 'rgba(30,60,30,0.4)' : 'rgba(30,30,40,0.3)') + ';';
      box.textContent = slot.filled
        ? (slot.item && slot.item.emoji ? slot.item.emoji : '\u2714')
        : '\u25CB';  // ○
      box.title = slot.frameTag || 'any';
      wrap.appendChild(box);
    }

    area.appendChild(wrap);
  }

  function _renderFallbackBag(area) {
    if (typeof CardAuthority === 'undefined') return;
    var bag = CardAuthority.getBag ? CardAuthority.getBag() : [];

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';

    var max = Math.min(bag.length, 12);
    for (var i = 0; i < max; i++) {
      var item = bag[i];
      var box = document.createElement('div');
      box.style.cssText =
        'width:48px;height:48px;border-radius:4px;display:flex;' +
        'align-items:center;justify-content:center;font-size:18px;' +
        'border:1px solid ' + BORDER_COLOR + ';' +
        'background:rgba(30,30,40,0.4);cursor:grab;';
      box.textContent = item.emoji || '\uD83D\uDCE6'; // 📦
      box.title = item.name || item.id || '';
      wrap.appendChild(box);
    }

    if (bag.length === 0) {
      wrap.innerHTML = '<div style="color:' + TEXT_DIM + ';font-size:11px;">Bag is empty</div>';
    } else if (bag.length > 12) {
      var more = document.createElement('div');
      more.style.cssText = 'color:' + TEXT_DIM + ';font-size:10px;padding-top:4px;width:100%;text-align:center;';
      more.textContent = '+' + (bag.length - 12) + ' more';
      wrap.appendChild(more);
    }

    area.appendChild(wrap);
  }

  // ── RS-5: BoxAnim Decorative Backdrop ───────────────────────────────

  /**
   * Create a decorative BoxAnim box behind the wheel content.
   * The box fades in at 25% opacity, non-spinning, purely visual.
   */
  function _createBackdrop() {
    _destroyBackdrop();
    if (typeof BoxAnim === 'undefined') return;
    if (!_wheelHalf) return;

    // Need the wheel half to be position:relative for absolute backdrop
    _wheelHalf.style.position = 'relative';

    _backdropEl = document.createElement('div');
    _backdropEl.className = 'rs-backdrop';
    _wheelHalf.insertBefore(_backdropEl, _wheelHalf.firstChild);

    var variant = BACKDROP_VARIANT[_mode] || 'chest';
    _backdropId = BoxAnim.create(variant, _backdropEl, { spin: false });

    // Open the lid for the revealed-interior look
    requestAnimationFrame(function () {
      if (_backdropId) BoxAnim.open(_backdropId);
      if (_backdropEl) _backdropEl.classList.add('rs-backdrop-visible');
    });
  }

  /**
   * Destroy the decorative backdrop.
   */
  function _destroyBackdrop() {
    if (_backdropId && typeof BoxAnim !== 'undefined') {
      BoxAnim.destroy(_backdropId);
      _backdropId = null;
    }
    if (_backdropEl && _backdropEl.parentNode) {
      _backdropEl.parentNode.removeChild(_backdropEl);
    }
    _backdropEl = null;
  }

  // ── RS-4: Seal Celebration VFX ──────────────────────────────────────

  /**
   * Trigger a visual celebration on the surface when a container is sealed.
   * Called from PeekSlots.trySeal() as a replacement for CrateUI.triggerSealVFX().
   *
   * Effects: green→gold background flash (800ms), seal button pulse (500ms).
   */
  function triggerSealVFX() {
    if (!_el || !_open) return;

    // Background flash
    _el.classList.add('rs-seal-celebrate');
    setTimeout(function () {
      if (_el) _el.classList.remove('rs-seal-celebrate');
    }, 850);

    // Seal button pulse
    if (_sealBtn) {
      _sealBtn.classList.add('rs-seal-pulse');
      _sealBtn.textContent = '\u2728 Sealed!';
      setTimeout(function () {
        if (_sealBtn) {
          _sealBtn.classList.remove('rs-seal-pulse');
          _sealBtn.textContent = '\u2728 Seal';
        }
      }, 550);
    }
  }

  // ── Per-frame Update ───────────────────────────────────────────────

  /**
   * Called each frame from game.js render loop when surface is open.
   * Refreshes seal button visibility and triggers sub-module refreshes.
   */
  function update(dt) {
    if (!_open) return;

    // Refresh seal button state
    _updateFooter();

    // Sub-module frame updates
    if (typeof RestockWheel !== 'undefined' && RestockWheel.update) {
      RestockWheel.update(dt);
    }
    if (typeof SupplyRows !== 'undefined' && SupplyRows.update) {
      SupplyRows.update(dt);
    }
  }

  // ── Key Handling ───────────────────────────────────────────────────

  /**
   * Handle keyboard input while the surface is open.
   * Returns true if the key was consumed.
   */
  function handleKey(key) {
    if (!_open) return false;

    // ESC / Backspace → close
    if (key === 'Escape' || key === 'Backspace') {
      close();
      return true;
    }

    // S → seal
    if (key === 's' || key === 'S') {
      if (typeof PeekSlots !== 'undefined') PeekSlots.trySeal();
      return true;
    }

    // Number keys 1-5 → quick-fill via RestockWheel
    var num = parseInt(key, 10);
    if (num >= 1 && num <= 5) {
      if (typeof RestockWheel !== 'undefined' && RestockWheel.quickFill) {
        RestockWheel.quickFill(num - 1);
      }
      return true;
    }

    // Arrow keys → scroll wheels
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (typeof RestockWheel !== 'undefined' && RestockWheel.handleKey) {
        return RestockWheel.handleKey(key);
      }
    }

    // Tab → toggle focus between wheel and supply rows
    if (key === 'Tab') {
      // RS-2+ feature: focus toggle between halves
      return true;
    }

    return false;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    open:            open,
    close:           close,
    transition:      transition,
    update:          update,
    handleKey:       handleKey,
    triggerSealVFX:  triggerSealVFX,
    isOpen:          function () { return _open; },
    getMode:    function () { return _mode; },
    getTarget:  function () { return { x: _containerX, y: _containerY, floorId: _floorId }; },

    /**
     * Refresh the supply rows (e.g., after a bag item is consumed).
     */
    refreshSupply: function () {
      if (!_open) return;
      _teardownSupply();
      _populateSupply();
    },

    /**
     * Refresh the wheel slots (e.g., after a slot is filled).
     */
    refreshWheel: function () {
      if (!_open) return;
      _teardownWheel();
      _populateWheel();
      _updateFooter();
    }
  };
})();

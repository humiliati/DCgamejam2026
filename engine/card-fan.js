/**
 * CardFan — canvas-rendered combat card arc with drag-to-reorder
 * and drag-drop-to-stack interaction.
 *
 * Displays the player's hand as a fan of cards arcing upward from the
 * bottom of the viewport. Cards spread around a pivot point below the
 * screen edge. Pointer hover lifts and highlights cards.
 *
 * Drag interaction (adapted from EyesOnly splash-screen.js):
 *   - pointerdown on a card → begin drag (after 3px dead-zone)
 *   - pointermove → ghost follows pointer, placeholder marks drop gap
 *   - drop on another card in combat → stack (if shared synergy tags)
 *   - drop in gap → reorder
 *   - swipe up on a stack → fire (thrust from gesture velocity)
 *   - tap a stacked card → un-stack
 *
 * Stack rules (combat only):
 *   - Cards need ≥1 shared synergyTag to stack (CardStack.canStack)
 *   - Stacked cards render as overlapping group with glow border
 *   - Only one stack can be active at a time
 *   - Selecting or swiping up fires the stack
 *
 * Audio hooks (AudioSystem.play — stubs until Pass 7 assets):
 *   'card-pickup'   — pointerdown begins drag
 *   'card-snap'     — card dropped into new position (reorder)
 *   'card-stack'    — card stacked onto another
 *   'card-unstack'  — card removed from stack
 *   'card-fire'     — stack fired (swipe up or confirm)
 *   'card-reject'   — attempted stack with no shared tags
 *
 * Layer 2 (after HUD, before MenuBox)
 * Depends on: InputManager (pointer), CardSystem (hand data),
 *             CardStack (stack ops), CombatEngine (phase),
 *             CombatFX (slide offset), AudioSystem (sfx)
 */
var CardFan = (function () {
  'use strict';

  // ── Layout (base dimensions — scaled by mode multiplier) ────────
  var BASE_CARD_W  = 56;        // Card width at 1x
  var BASE_CARD_H  = 80;        // Card height at 1x
  var ARC_ANGLE    = Math.PI / 3;  // Total fan arc (~60°)
  var BASE_PIVOT_Y = 20;       // Pivot point below viewport bottom at 1x (low value = cards higher on screen)
  var LIFT_PX      = 20;       // Hover lift amount
  var LIFT_SCALE   = 1.12;     // Hover scale-up
  var DEAL_STAGGER = 60;       // ms stagger per card on open
  var PLAY_DURATION = 200;     // ms card-fly-forward animation

  // Mode-aware sizing:
  //   Combat:     2.0x base (100% larger), 60px higher
  //   Non-combat: 2.5x base (150% larger) for easy inspection
  var COMBAT_SCALE     = 2.0;
  var EXPLORE_SCALE    = 2.5;
  var COMBAT_LIFT      = 160;  // px additional upward shift in combat — must clear 128px status bar with margin
  var EXPLORE_LIFT     = 140;  // px additional upward shift in explore (NCH overlay) — cards must clear status bar

  // ── Derived (recalculated on open) ──────────────────────────────
  var CARD_W       = BASE_CARD_W;
  var CARD_H       = BASE_CARD_H;
  var PIVOT_Y_OFF  = BASE_PIVOT_Y;

  // ── Drag thresholds ─────────────────────────────────────────────
  var DRAG_DEAD_ZONE = 4;       // px before drag starts
  var FIRE_SWIPE_VEL = 0.3;     // px/ms upward velocity to trigger fire
  var FIRE_SWIPE_MIN_DY = 30;   // px minimum upward distance for fire gesture

  // ── Stack visual offsets ────────────────────────────────────────
  var STACK_CARD_OFFSET = 6;    // px overlap between stacked cards
  var STACK_GLOW_COLOR  = 'rgba(255,200,60,0.35)';
  var STACK_GLOW_RADIUS = 8;

  // ── Colors ──────────────────────────────────────────────────────
  // Suit-based border colors (from EyesOnly RESOURCE_COLOR_SYSTEM)
  // Maps suit → resource color: ♠=free(warm grey), ♣=energy(blue),
  // ♦=battery(green), ♥=HP(pink)
  var SUIT_BORDER_COLORS = {
    spade:   'rgba(180,170,150,0.7)',  // Warm grey — free/earth (no resource glow)
    club:    '#00D4FF',                // Electric Blue — energy
    diamond: '#00FFA6',                // Toxic Green — battery
    heart:   '#FF6B9D'                 // Vibrant Pink — HP
  };
  // Fallback for old type-based coloring (legacy compat)
  var BORDER_COLORS = {
    attack:  '#c44',
    defense: '#48c',
    heal:    '#4a4',
    utility: '#aa4'
  };
  var COL_BG     = 'rgba(20,18,28,0.92)';
  var COL_BORDER = 'rgba(160,140,100,0.5)';
  var COL_TEXT   = '#d8d0c0';
  var COL_NAME   = '#f0d070';

  // ── Maximize / minimize state ────────────────────────────────────
  var _maximized  = false;    // True when fan takes over bottom 30%
  var _minimizeBtnEl = null;  // DOM element: minimize toggle
  var _onMinimize = null;     // Callback when minimize button clicked

  // ── Rejection shake state ─────────────────────────────────────────
  var _rejectShake = null;  // { cardIdx, timer, startTime }
  var REJECT_SHAKE_MS = 350;
  var REJECT_SHAKE_AMP = 6;  // px horizontal shake amplitude

  // ── State ───────────────────────────────────────────────────────
  var _open       = false;
  var _hand       = [];       // Card objects from CardSystem
  var _cards      = [];       // Fan state per card: { card, angle, dealTimer, playing, playTimer, handIndex }
  var _hoverIdx   = -1;       // Currently hovered card index
  var _selectedIdx = -1;      // Selected (about to play) card index
  var _onPlay     = null;     // Callback fn(cardIndex) when a card is played
  var _canvas     = null;
  var _openTimer  = 0;        // ms since fan opened

  // ── Dice button (accessibility combat attack) ───────────────────
  var _diceBtn = null;  // DOM button: random attack or fire stack

  // ── External drop system (cross-zone drag to inventory) ─────────
  // Registered by Game.js to bridge fan → MenuFaces drag zones.
  // Signature: fn({ cardIdx, card, screenX, screenY }) → boolean
  //   Returns true if the drop was handled, false to cancel.
  var _externalDropHandler = null;
  // Ghost element for visual feedback during external drag
  var _ghostEl = null;

  // ── Drag state (mirrors EyesOnly _dragState pattern) ────────────
  var _drag = null;  // { cardIdx, startX, startY, curX, curY, started, pointerId, external }

  // ── Fire animation state ────────────────────────────────────────
  // When stack is fired, cards animate upward into enemy half of screen.
  // Each card launches with a stagger delay, flies to a target y (~25% of screen),
  // then flashes in its resource color. Persistent cards retract back;
  // one-use cards dissolve (fade + shrink).
  var _fireAnim = null;  // null or { cards: [{card, startX, startY, targetX, targetY, delay, timer, phase, persistent}], totalDuration }
  var FIRE_STAGGER     = 80;    // ms between card launches
  var FIRE_FLY_MS      = 250;   // ms flight time per card
  var FIRE_FLASH_MS    = 200;   // ms resource color flash at impact
  var FIRE_RETRACT_MS  = 300;   // ms for persistent cards to slide back
  var FIRE_DISSOLVE_MS = 400;   // ms for one-use cards to fade out

  // ── Init ────────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    // Pointer listeners are NOT added to the canvas here.
    // They are added to the window in open() and removed in close().
    // This ensures events are captured even when DOM overlays (status-bar,
    // nch-widget, etc.) sit in front of the canvas and would otherwise
    // intercept pointer events before they reach it.
    _createMinimizeBtn();
    _createDiceBtn();
  }

  /**
   * Create the DOM close button (hidden by default).
   * Anchors at the NchWidget joker stack position when the fan is
   * maximized — the stack hides and this button replaces it visually.
   * Styled as a loud red close indicator so it's unmistakable.
   */
  function _createMinimizeBtn() {
    if (_minimizeBtnEl) return;
    var vp = document.getElementById('viewport');
    if (!vp) return;

    _minimizeBtnEl = document.createElement('button');
    _minimizeBtnEl.id = 'fan-minimize-btn';
    _minimizeBtnEl.className = 'a11y-btn';
    _minimizeBtnEl.type = 'button';
    _minimizeBtnEl.textContent = '✕';
    // aria-label is authoritative for screen readers; title is kept for
    // mouse hover tooltips. Both say the same thing for consistency.
    _minimizeBtnEl.setAttribute('aria-label', 'Close hand');
    _minimizeBtnEl.setAttribute('aria-keyshortcuts', 'Enter Space Escape');
    _minimizeBtnEl.title = 'Close hand';
    _minimizeBtnEl.style.cssText =
      'position:absolute; z-index:20;' +
      'width:40px; height:40px; border-radius:50%;' +
      'background:rgba(180,40,40,0.85); border:2px solid rgba(255,100,80,0.7);' +
      'color:#fff; font-size:18px; font-weight:bold; cursor:pointer;' +
      'display:none; align-items:center; justify-content:center;' +
      'font-family:monospace; pointer-events:auto;' +
      'box-shadow:0 2px 8px rgba(180,40,40,0.5);' +
      'transition:background 0.15s, transform 0.15s;';
    _minimizeBtnEl.addEventListener('mouseenter', function () {
      if (_minimizeBtnEl.getAttribute('aria-disabled') === 'true') return;
      _minimizeBtnEl.style.background = 'rgba(220,50,50,0.95)';
      _minimizeBtnEl.style.transform = 'scale(1.15)';
    });
    _minimizeBtnEl.addEventListener('mouseleave', function () {
      _minimizeBtnEl.style.background = 'rgba(180,40,40,0.85)';
      _minimizeBtnEl.style.transform = 'scale(1)';
    });
    _minimizeBtnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_minimizeBtnEl.getAttribute('aria-disabled') === 'true') return;
      minimize();
    });
    // Escape as a keyboard-accelerator close is a near-universal
    // convention. Native <button> already handles Enter/Space; this
    // handler adds Escape so a focused Magic Remote user can dismiss
    // the hand without leaving the button.
    _minimizeBtnEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (_minimizeBtnEl.getAttribute('aria-disabled') !== 'true') minimize();
      }
    });
    vp.appendChild(_minimizeBtnEl);
  }

  /**
   * Position the close button at the NchWidget's last location.
   * Hides the joker stack and replaces it with the close button.
   */
  function _anchorMinimizeToWidget() {
    if (!_minimizeBtnEl) return;
    var widgetEl = document.getElementById('nch-widget');
    if (widgetEl && typeof NchWidget !== 'undefined') {
      var pos = NchWidget.getCenterPosition();
      _minimizeBtnEl.style.left = (pos.x - 20) + 'px';
      _minimizeBtnEl.style.top  = (pos.y - 20) + 'px';
      _minimizeBtnEl.style.right = 'auto';
      _minimizeBtnEl.style.bottom = 'auto';
      // Hide the joker stack while fan is open
      widgetEl.style.visibility = 'hidden';
    } else {
      // Fallback if widget not found
      _minimizeBtnEl.style.right = '20px';
      _minimizeBtnEl.style.bottom = '140px';
      _minimizeBtnEl.style.left = 'auto';
      _minimizeBtnEl.style.top = 'auto';
    }
  }

  // ── Dice button (combat accessibility attack) ───────────────────

  // Sibling visually-hidden live region. Paired with aria-describedby
  // on the button so screen readers announce stack state changes as
  // the player builds — "stack: 2 cards, 5 damage" etc. Kept as a
  // module-local so we only ever append one to the DOM.
  var _diceLiveEl = null;

  // :focus-visible ring and aria-disabled dimming live in a shared
  // `.a11y-btn` class defined in index.html. Any runtime-created
  // button that wants keyboard-accessible behaviour adds that class
  // — no per-module stylesheet injection needed.

  /**
   * Create the dice button DOM element.
   * In combat, this button gives accessibility controllers a reliable
   * click/enter target to:
   *   - No stack: fire a random card at 1.0× baseline thrust
   *   - Stack built: fire the stack at the full thrust-cap multiplier
   *     (equivalent to the swipe-up gesture for controllers that can't
   *     perform a reliable swipe)
   *
   * Accessibility notes:
   *   - Native <button> → Enter and Space activate it out of the box
   *   - type="button" so we never accidentally submit a form ancestor
   *   - aria-label is authoritative and updated on every state change
   *     to reflect the actual action (random vs fire N-card, damage)
   *   - aria-describedby points at a visually-hidden live region that
   *     announces stack/damage changes as they happen
   *   - :focus-visible ring in phosphor amber matches game theme and
   *     ONLY shows for keyboard focus, not mouse clicks
   *   - aria-disabled + dimmed style when the action isn't meaningful
   *   - Native title kept for mouse hover tooltips (unchanged)
   */
  function _createDiceBtn() {
    if (_diceBtn) return;
    var vp = document.getElementById('viewport');
    if (!vp) return;

    // Visually-hidden live region (sr-only). Sits next to the button
    // so aria-describedby resolves without layout cost.
    _diceLiveEl = document.createElement('span');
    _diceLiveEl.id = 'fan-dice-live';
    _diceLiveEl.setAttribute('aria-live', 'polite');
    _diceLiveEl.setAttribute('aria-atomic', 'true');
    _diceLiveEl.style.cssText =
      'position:absolute; width:1px; height:1px; padding:0; margin:-1px;' +
      'overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;';
    vp.appendChild(_diceLiveEl);

    _diceBtn = document.createElement('button');
    _diceBtn.id = 'fan-dice-btn';
    _diceBtn.className = 'a11y-btn';
    _diceBtn.type = 'button';
    _diceBtn.textContent = '\uD83C\uDFB2';
    _diceBtn.setAttribute('aria-label', 'Random attack');
    _diceBtn.setAttribute('aria-describedby', 'fan-dice-live');
    _diceBtn.setAttribute('aria-keyshortcuts', 'Enter Space');
    _diceBtn.title = 'Random attack';
    _diceBtn.style.cssText =
      'position:absolute; z-index:16;' +
      'right:20px; bottom:72px;' +
      'width:56px; height:56px; border-radius:50%;' +
      'background:rgba(50,30,120,0.88);' +
      'border:2px solid rgba(140,100,255,0.7);' +
      'color:#fff; font-size:26px; cursor:pointer;' +
      'display:none; align-items:center; justify-content:center;' +
      'font-family:monospace; pointer-events:auto;' +
      'box-shadow:0 2px 14px rgba(100,60,255,0.5);' +
      'transition:background 0.15s, transform 0.15s, border-color 0.2s;';
    _diceBtn.addEventListener('mouseenter', function () {
      if (_diceBtn.getAttribute('aria-disabled') === 'true') return;
      _diceBtn.style.background = 'rgba(80,55,180,0.95)';
      _diceBtn.style.transform  = 'scale(1.12)';
    });
    _diceBtn.addEventListener('mouseleave', function () {
      _updateDiceBtn();
      _diceBtn.style.transform = 'scale(1)';
    });
    _diceBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_diceBtn.getAttribute('aria-disabled') === 'true') return;
      _handleDiceAction();
    });

    vp.appendChild(_diceBtn);
  }

  // Remember the last announced label so the live region only fires
  // when the state actually changes — chatty aria-live regions make
  // screen readers unusable.
  var _diceLastAnnounced = '';

  /**
   * Sync dice button label/colour/aria to current stack state.
   * Call whenever the stack changes or the button becomes visible.
   */
  function _updateDiceBtn() {
    if (!_diceBtn) return;

    var hasStack = typeof CardStack !== 'undefined' && !CardStack.isEmpty();
    var canAct = _open && _inCombat();

    var label;      // aria-label / title (functional description)
    var announce;   // live region text (state change)

    if (hasStack) {
      // Pull the authoritative damage estimate from StackPreview so the
      // a11y label matches the visual HUD exactly. Falls back to a
      // plain count if StackPreview isn't present.
      var est = null;
      if (typeof StackPreview !== 'undefined' && StackPreview.getEstimate) {
        est = StackPreview.getEstimate();
      }
      var size = CardStack.getSize();
      if (est && est.hasStack) {
        label = 'Commit ' + size + '-card stack for ' + est.damage + ' damage';
        var parts = ['Stack: ' + size + ' cards, ' + est.damage + ' damage'];
        if (est.suitAdv && est.suitMult > 1.01) parts.push('suit advantage');
        else if (est.suitAdv && est.suitMult < 0.99) parts.push('suit resisted');
        if (est.mono.monoSuit && est.mono.bonus > 0) parts.push('mono-suit bonus');
        announce = parts.join(', ');
      } else {
        label = 'Commit ' + size + '-card stack at full thrust';
        announce = 'Stack: ' + size + ' cards ready';
      }
      _diceBtn.style.background   = 'rgba(140,90,20,0.88)';
      _diceBtn.style.borderColor  = 'rgba(255,200,60,0.9)';
    } else {
      label = 'Random attack — fire a single card at baseline thrust';
      announce = 'No stack built. Random attack ready.';
      _diceBtn.style.background  = 'rgba(50,30,120,0.88)';
      _diceBtn.style.borderColor = 'rgba(140,100,255,0.7)';
    }

    _diceBtn.setAttribute('aria-label', label);
    _diceBtn.title = label;
    _diceBtn.setAttribute('aria-disabled', canAct ? 'false' : 'true');

    // Only push to the live region when the announcement actually
    // changes — avoids flooding screen readers every animation frame.
    if (_diceLiveEl && announce !== _diceLastAnnounced) {
      _diceLastAnnounced = announce;
      _diceLiveEl.textContent = announce;
    }
  }

  /**
   * Handle the dice button tap.
   *
   * No stack → select a random card, push it as a 1-card stack, fire at
   *            baseline (1.0×) thrust.
   * Stack built → fire the existing stack at the full thrust cap
   *              (accessibility replacement for swipe-up gesture).
   */
  function _handleDiceAction() {
    if (!_open || !_inCombat()) return;
    if (typeof CardStack === 'undefined') return;

    if (!CardStack.isEmpty()) {
      // Fire the prepared stack at max thrust (swipe-up equivalent)
      var cap = (typeof CardStack.getThrustCap === 'function')
        ? CardStack.getThrustCap() : 1.05;
      var stackForAnim = CardStack.getStack().slice();
      startFireAnim(stackForAnim);
      _playAudio('card-fire', { volume: 0.55 });
      if (typeof CombatBridge !== 'undefined') {
        CombatBridge.fireStack(cap);
      }
    } else {
      // No stack — pick a random playable card and fire it at baseline
      if (_cards.length === 0) return;
      var rIdx = Math.floor(Math.random() * _cards.length);
      var c = _cards[rIdx];
      CardStack.clear();
      CardStack.pushCard(c.card, c.handIndex);
      var animStack = CardStack.getStack().slice();
      startFireAnim(animStack);
      _playAudio('card-fire', { volume: 0.55 });
      if (typeof CombatBridge !== 'undefined') {
        CombatBridge.fireStack(CardStack.fireBaseline());
      }
    }
  }

  // ── Maximize / Minimize ─────────────────────────────────────────

  /**
   * Enter maximized mode: fan takes bottom ~30%, DOM overlays suppressed.
   * Called by NchWidget when opening the fan in explore mode.
   */
  function maximize(opts) {
    _maximized = true;
    _onMinimize = (opts && opts.onMinimize) || null;

    // Anchor close button at the joker stack location, hide the stack
    _anchorMinimizeToWidget();
    if (_minimizeBtnEl) _minimizeBtnEl.style.display = 'flex';

    // No CSS filter — peripheral dim with ring cutout is drawn on-canvas
    // in render(), keeping cards above the dim layer and ring center clear.
  }

  /**
   * Exit maximized mode, restoring DOM overlays.
   * Called by minimize button or when fan closes.
   */
  function minimize() {
    _maximized = false;
    if (_minimizeBtnEl) _minimizeBtnEl.style.display = 'none';

    // Restore joker stack visibility
    var widgetEl = document.getElementById('nch-widget');
    if (widgetEl) widgetEl.style.visibility = '';

    // Close the fan and notify
    if (_open) {
      close();
    }
    if (_onMinimize) _onMinimize();
    _onMinimize = null;
  }

  function isMaximized() { return _maximized; }

  // ── Open / Close ────────────────────────────────────────────────

  /**
   * Open the card fan with the given hand.
   *
   * @param {Array} hand - Card objects [{ id, name, emoji, type, effects, border }]
   * @param {Object} [opts]
   * @param {Function} [opts.onPlay] - fn(cardIndex) called when a card is played
   */
  function open(hand, opts) {
    opts = opts || {};
    _hand = hand || [];
    _onPlay = opts.onPlay || null;
    _open = true;
    _openTimer = 0;
    _hoverIdx = -1;
    _selectedIdx = -1;
    _drag = null;

    // Apply mode-aware sizing
    var inCombat = _inCombat();
    var modeScale = inCombat ? COMBAT_SCALE : EXPLORE_SCALE;
    CARD_W = Math.floor(BASE_CARD_W * modeScale);
    CARD_H = Math.floor(BASE_CARD_H * modeScale);
    PIVOT_Y_OFF = Math.floor(BASE_PIVOT_Y * modeScale) - (inCombat ? COMBAT_LIFT : EXPLORE_LIFT);

    _buildFan();

    // Attach window-level pointer listeners.
    // Listening on window (rather than canvas) ensures events are received even
    // when DOM elements with higher z-index sit over the canvas area.
    window.addEventListener('pointerdown',   _onPointerDown,   false);
    window.addEventListener('pointermove',   _onPointerMove,   false);
    window.addEventListener('pointerup',     _onPointerUp,     false);
    window.addEventListener('pointercancel', _onPointerCancel, false);

    // Show dice button in combat
    if (_inCombat() && _diceBtn) {
      _diceBtn.style.display = 'flex';
      _updateDiceBtn();
    }
  }

  /** Close the fan (sweep down). */
  function close() {
    _open = false;
    _cards = [];
    _hoverIdx = -1;
    _selectedIdx = -1;
    _drag = null;

    // Remove window-level pointer listeners
    window.removeEventListener('pointerdown',   _onPointerDown,   false);
    window.removeEventListener('pointermove',   _onPointerMove,   false);
    window.removeEventListener('pointerup',     _onPointerUp,     false);
    window.removeEventListener('pointercancel', _onPointerCancel, false);

    // Hide dice button
    if (_diceBtn) _diceBtn.style.display = 'none';

    // Clean up maximized state if active
    if (_maximized) {
      _maximized = false;
      if (_minimizeBtnEl) _minimizeBtnEl.style.display = 'none';
      var widgetEl = document.getElementById('nch-widget');
      if (widgetEl) widgetEl.style.visibility = '';
    }
  }

  function isOpen() { return _open; }

  /** Update hand mid-combat (after card draw). */
  function setHand(hand) {
    _hand = hand || [];
    _buildFan();
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function _inCombat() {
    return (typeof CombatEngine !== 'undefined' && CombatEngine.isActive());
  }

  function _playAudio(name, opts) {
    if (typeof AudioSystem !== 'undefined') {
      AudioSystem.play(name, opts);
    }
  }

  /** Trigger a visual rejection shake on a specific card index. */
  function _triggerRejectShake(cardIdx) {
    _rejectShake = { cardIdx: cardIdx, startTime: Date.now() };
  }

  /** Get current shake offset for a card (0 if not shaking). */
  function _getShakeOffset(cardIdx) {
    if (!_rejectShake || _rejectShake.cardIdx !== cardIdx) return 0;
    var elapsed = Date.now() - _rejectShake.startTime;
    if (elapsed > REJECT_SHAKE_MS) { _rejectShake = null; return 0; }
    var t = elapsed / REJECT_SHAKE_MS;
    var decay = 1 - t;
    return Math.sin(t * Math.PI * 6) * REJECT_SHAKE_AMP * decay;
  }

  // ── Build card positions ────────────────────────────────────────

  function _buildFan() {
    _cards = [];
    var n = _hand.length;
    if (n === 0) return;

    var angleStep = n > 1 ? ARC_ANGLE / (n - 1) : 0;
    var startAngle = -ARC_ANGLE / 2;

    for (var i = 0; i < n; i++) {
      _cards.push({
        card:      _hand[i],
        angle:     n > 1 ? startAngle + angleStep * i : 0,
        dealTimer: i * DEAL_STAGGER,
        playing:   false,
        playTimer: 0,
        handIndex: i  // Tracks original hand slot for CardStack
      });
    }
  }

  // ── Select / Play ───────────────────────────────────────────────

  function selectCard(index) {
    if (index >= 0 && index < _cards.length) {
      _selectedIdx = index;
      _hoverIdx = index;
    }
  }

  /**
   * Play the selected card — animate it forward and fire callback.
   * Returns the card object, or null if nothing selected.
   */
  function playCard(index) {
    if (index === undefined) index = _hoverIdx;
    if (index < 0 || index >= _cards.length) return null;

    var c = _cards[index];
    if (c.playing) return null;

    c.playing = true;
    c.playTimer = 0;

    // Fire callback after animation
    var cardObj = c.card;
    var cb = _onPlay;

    setTimeout(function () {
      if (cb) cb(index);
    }, PLAY_DURATION);

    return cardObj;
  }

  // ── Hit test ────────────────────────────────────────────────────

  /**
   * Test a point against the fan card bounding boxes.
   * Returns card index or -1.
   *
   * @param {number} px - Canvas-space X
   * @param {number} py - Canvas-space Y
   * @param {number} [excludeIdx] - Optional card index to skip (e.g. the
   *   card currently being dragged, so its own static arc slot doesn't
   *   self-match and starve the drop-target detection).
   */
  function hitTest(px, py, excludeIdx) {
    if (!_open || !_canvas) return -1;
    if (typeof excludeIdx !== 'number') excludeIdx = -1;
    var h = _canvas.height;
    var cx = _canvas.width / 2;

    // Fan slide choreography offset
    var slideOffset = 0;
    if (typeof CombatFX !== 'undefined') {
      slideOffset = CombatFX.getFanSlideOffset() * (CARD_H + 60);
    }
    var pivotY = h + PIVOT_Y_OFF + slideOffset;

    // Test from top (front) card to back for correct overlap order
    for (var i = _cards.length - 1; i >= 0; i--) {
      if (i === excludeIdx) continue;
      var c = _cards[i];
      if (c.playing) continue;

      var pos = _getCardPos(c, cx, pivotY, h);
      // Account for stacked card offsets
      var stackOff = _getStackOffset(i);
      pos.x += stackOff.dx;
      pos.y += stackOff.dy;

      // Expanded AABB hit test — compensate for card rotation (angle * 0.6).
      // At fan edges (~18° tilt), rotated card AABB is ~20% wider.
      // Also add a minimum pad for touch/pointer tolerance.
      var tilt = Math.abs(c.angle * 0.6);
      var sinT = Math.sin(tilt);
      var cosT = Math.cos(tilt);
      var hw = (CARD_W * cosT + CARD_H * sinT) / 2 + 4;  // rotated half-width + pad
      var hh = (CARD_H * cosT + CARD_W * sinT) / 2 + 4;  // rotated half-height + pad
      if (px >= pos.x - hw && px <= pos.x + hw &&
          py >= pos.y - hh && py <= pos.y + hh) {
        return i;
      }
    }
    return -1;
  }

  // ── Get card render position ────────────────────────────────────

  function _getCardPos(c, cx, pivotY, viewH) {
    // Arc radius decoupled from pivot offset — always positive, scales with card size
    var radius = Math.max(CARD_H * 0.6, Math.abs(PIVOT_Y_OFF) + CARD_H * 0.3);
    var x = cx + Math.sin(c.angle) * radius;
    var y = pivotY - Math.cos(c.angle) * radius;
    return { x: x, y: y };
  }

  /**
   * Get visual offset for stacked cards — stacked cards cluster together
   * with slight overlap offsets to show the stack depth.
   *
   * @param {number} fanIdx - Index in _cards array
   * @returns {{ dx: number, dy: number, inStack: boolean, stackPos: number }}
   */
  function _getStackOffset(fanIdx) {
    if (typeof CardStack === 'undefined' || !_inCombat()) {
      return { dx: 0, dy: 0, inStack: false, stackPos: -1 };
    }

    var c = _cards[fanIdx];
    if (!c) return { dx: 0, dy: 0, inStack: false, stackPos: -1 };

    var stack = CardStack.getStack();
    for (var s = 0; s < stack.length; s++) {
      if (stack[s].handIndex === c.handIndex) {
        // This card is in the stack — offset it based on stack position
        // First card in stack stays put; subsequent cards offset upward + right
        return {
          dx: s * STACK_CARD_OFFSET * 0.5,
          dy: -s * STACK_CARD_OFFSET,
          inStack: true,
          stackPos: s
        };
      }
    }
    return { dx: 0, dy: 0, inStack: false, stackPos: -1 };
  }

  // ── Pointer events (drag system) ────────────────────────────────

  function _onPointerDown(e) {
    if (!_open || _drag) return;

    var rect = _canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;

    // Scale to canvas coordinates
    px = px * (_canvas.width / rect.width);
    py = py * (_canvas.height / rect.height);

    var idx = hitTest(px, py);
    if (idx < 0) return;

    // Capture pointer for reliable tracking
    try { _canvas.setPointerCapture(e.pointerId); } catch (_ex) {}

    _drag = {
      cardIdx:   idx,
      startX:    px,
      startY:    py,
      curX:      px,
      curY:      py,
      started:   false,   // True after passing dead zone
      pointerId: e.pointerId,
      startTime: Date.now()
    };

    _hoverIdx = idx;
    e.preventDefault();
  }

  function _onPointerMove(e) {
    if (!_open) return;

    var rect = _canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    px = px * (_canvas.width / rect.width);
    py = py * (_canvas.height / rect.height);

    if (!_drag) {
      // No drag in progress — just update hover
      var prevHover = _hoverIdx;
      _hoverIdx = hitTest(px, py);
      // Update cursor for drag affordance
      if (_canvas) {
        _canvas.style.cursor = (_hoverIdx >= 0) ? 'grab' : '';
      }
      return;
    }

    if (_drag.pointerId !== e.pointerId) return;

    _drag.curX = px;
    _drag.curY = py;

    // Check dead zone
    if (!_drag.started) {
      var dx = px - _drag.startX;
      var dy = py - _drag.startY;
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_DEAD_ZONE) return;

      _drag.started = true;
      if (_canvas) _canvas.style.cursor = 'grabbing';
      _playAudio('card-pickup', { volume: 0.4 });
    }

    // During drag: update hover to the card under pointer (for drop target).
    // Exclude the source card so its own static arc slot doesn't eclipse
    // the real drop target underneath the pointer.
    _hoverIdx = hitTest(px, py, _drag.cardIdx);

    // External drag: if pointer is above the fan area, show ghost overlay
    if (_drag.started && !_inCombat() && _externalDropHandler) {
      var fanTop = _getFanTopY();
      if (py < fanTop) {
        // Pointer has left the fan — activate external drag ghost
        if (!_drag.external) {
          _drag.external = true;
          _showGhost(_drag.cardIdx, e.clientX, e.clientY);
        } else {
          _moveGhost(e.clientX, e.clientY);
        }
      } else if (_drag.external) {
        // Pointer re-entered the fan — hide ghost
        _drag.external = false;
        _hideGhost();
      }
    }

    e.preventDefault();
  }

  function _onPointerUp(e) {
    if (!_drag || _drag.pointerId !== e.pointerId) return;

    try { _canvas.releasePointerCapture(e.pointerId); } catch (_ex) {}
    if (_canvas) _canvas.style.cursor = '';

    var rect = _canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    px = px * (_canvas.width / rect.width);
    py = py * (_canvas.height / rect.height);

    if (!_drag.started) {
      // Didn't pass dead zone — treat as tap/click
      _handleTap(_drag.cardIdx);
      _drag = null;
      return;
    }

    // Drag completed — determine action.
    // Exclude the source card from hitTest so its own static arc slot
    // doesn't self-match and block stack/reorder drops.
    var dragIdx = _drag.cardIdx;
    var dropIdx = hitTest(px, py, dragIdx);

    // Check for swipe-up-to-fire gesture
    var dy = _drag.startY - py;  // Positive = upward
    var elapsed = Math.max(1, Date.now() - _drag.startTime);
    var velY = dy / elapsed;  // px/ms upward

    if (_inCombat() && dy > FIRE_SWIPE_MIN_DY && velY > FIRE_SWIPE_VEL) {
      // Swipe up detected — fire the stack (or fire single card if no stack)
      _handleSwipeFire(px, py, velY);
      _drag = null;
      return;
    }

    // Drop on a different card in combat → attempt stack
    if (_inCombat() && dropIdx >= 0 && dropIdx !== dragIdx) {
      _handleDragToStack(dragIdx, dropIdx);
      _drag = null;
      return;
    }

    // External drop — card dragged out of fan onto inventory zone
    if (_drag.external && _externalDropHandler) {
      var card = _cards[dragIdx] ? _cards[dragIdx].card : null;
      if (card) {
        var handled = _externalDropHandler({
          cardIdx: dragIdx,
          card:    card,
          screenX: e.clientX,
          screenY: e.clientY
        });
        if (handled) {
          _playAudio('card-snap', { volume: 0.5 });
        }
      }
      _hideGhost();
      _drag = null;
      return;
    }

    // Drop on same card or empty space → reorder
    if (dropIdx >= 0 && dropIdx !== dragIdx) {
      _handleReorder(dragIdx, dropIdx);
    }

    _hideGhost();
    _drag = null;
  }

  function _onPointerCancel(e) {
    if (_drag && _drag.pointerId === e.pointerId) {
      try { _canvas.releasePointerCapture(e.pointerId); } catch (_ex) {}
      if (_canvas) _canvas.style.cursor = '';
      _hideGhost();
      _drag = null;
    }
  }

  // ── External drag ghost (CDC pattern) ────────────────────────────

  /** Approximate Y coordinate of the fan's top edge in canvas space. */
  function _getFanTopY() {
    if (!_canvas) return 0;
    var h = _canvas.height;
    // Fan cards arc upward from bottom. Top of tallest card at hover lift.
    return h - PIVOT_Y_OFF - CARD_H - LIFT_PX - 30;
  }

  /** Create and show a ghost element for external drag feedback. */
  function _showGhost(cardIdx, clientX, clientY) {
    if (_ghostEl) return; // Already showing
    var c = _cards[cardIdx];
    if (!c || !c.card) return;

    // Use CardRenderer DOM ghost if available, else simple fallback
    if (typeof CardRenderer !== 'undefined' && CardRenderer.createGhostFromData) {
      _ghostEl = CardRenderer.createGhostFromData(c.card);
    } else {
      _ghostEl = document.createElement('div');
      _ghostEl.className = 'cf-drag-ghost';
      _ghostEl.style.cssText =
        'position:fixed;z-index:10000;pointer-events:none;' +
        'padding:6px 10px;border-radius:6px;font:bold 14px monospace;' +
        'background:rgba(20,18,28,0.92);border:2px solid #f0d070;' +
        'color:#f0d070;box-shadow:0 8px 24px rgba(0,0,0,0.4);' +
        'transform:scale(0.9);opacity:0.92;white-space:nowrap;';
      var card = c.card;
      var emoji = card.emoji || (card.suit ? { spade:'\u2660', club:'\u2663', diamond:'\u2666', heart:'\u2665' }[card.suit] || '\uD83C\uDCCF' : '\uD83C\uDCCF');
      _ghostEl.textContent = emoji + ' ' + (card.name || card.id || '???');
    }
    document.body.appendChild(_ghostEl);

    _moveGhost(clientX, clientY);
  }

  /** Move ghost element to follow pointer. */
  function _moveGhost(clientX, clientY) {
    if (!_ghostEl) return;
    _ghostEl.style.left = (clientX + 12) + 'px';
    _ghostEl.style.top  = (clientY - 20) + 'px';
  }

  /** Remove ghost element. */
  function _hideGhost() {
    if (_ghostEl) {
      _ghostEl.remove();
      _ghostEl = null;
    }
  }

  // ── Tap handler ─────────────────────────────────────────────────

  function _handleTap(idx) {
    if (idx < 0 || idx >= _cards.length) return;

    if (_inCombat() && typeof CardStack !== 'undefined') {
      var c = _cards[idx];

      if (CardStack.isInStack(c.handIndex)) {
        // Tap stacked card → un-stack
        CardStack.removeByIndex(c.handIndex);
        _playAudio('card-unstack', { volume: 0.35 });
        CombatEngine.resetEnemyBeat();
        _notifyStackChange();
        return;
      }

      // Tap a non-stacked card → try to add to current stack
      if (CardStack.canStack(c.card)) {
        CardStack.pushCard(c.card, c.handIndex);
        _playAudio('card-stack', { volume: 0.4 });
        CombatEngine.resetEnemyBeat();
        _notifyStackChange();
        return;
      }

      // Can't stack with current → start new stack (clears old one)
      CardStack.clear();
      CardStack.pushCard(c.card, c.handIndex);
      _playAudio('card-snap', { volume: 0.35 });
      CombatEngine.resetEnemyBeat();
      _notifyStackChange();
      return;
    }

    // Non-combat or no CardStack — play card directly
    if (_onPlay) _onPlay(idx);
  }

  // ── Drag-to-stack ───────────────────────────────────────────────

  function _handleDragToStack(dragIdx, dropIdx) {
    if (typeof CardStack === 'undefined') {
      // No stack module — just reorder
      _handleReorder(dragIdx, dropIdx);
      return;
    }

    var dragCard = _cards[dragIdx];
    var dropCard = _cards[dropIdx];
    if (!dragCard || !dropCard) return;

    // If drop target is already in a stack, try to add drag card to that stack
    if (CardStack.isInStack(dropCard.handIndex)) {
      if (CardStack.canStack(dragCard.card)) {
        CardStack.pushCard(dragCard.card, dragCard.handIndex);
        _playAudio('card-stack', { volume: 0.45 });
        CombatEngine.resetEnemyBeat();
        _notifyStackChange();
        return;
      }
      // Can't stack — reject with feedback
      _playAudio('card-reject', { volume: 0.3 });
      _triggerRejectShake(dropIdx);
      return;
    }

    // Neither is in a stack — try to create a new 2-card stack
    // Start with the drop target, then push the drag card
    CardStack.clear();
    CardStack.pushCard(dropCard.card, dropCard.handIndex);

    if (CardStack.canStack(dragCard.card)) {
      CardStack.pushCard(dragCard.card, dragCard.handIndex);
      _playAudio('card-stack', { volume: 0.45 });
      CombatEngine.resetEnemyBeat();
      _notifyStackChange();
    } else {
      // Incompatible tags — undo the stack start, reject
      CardStack.clear();
      _playAudio('card-reject', { volume: 0.3 });
      _triggerRejectShake(dropIdx);
    }
  }

  // ── Swipe-up-to-fire ────────────────────────────────────────────

  function _handleSwipeFire(px, py, velY) {
    if (typeof CardStack === 'undefined') return;

    if (CardStack.isEmpty()) {
      // No stack — check if swiped a single card (fire as 1-card stack)
      var idx = _drag ? _drag.cardIdx : -1;
      if (idx >= 0 && idx < _cards.length) {
        var c = _cards[idx];
        CardStack.clear();
        CardStack.pushCard(c.card, c.handIndex);
      }
    }

    if (CardStack.isEmpty()) return;

    // Use gesture velocity for thrust multiplier
    // Map velY (px/ms) to CardStack's thrust gesture
    CardStack.gestureStart(_drag.startX, _drag.startY);
    var thrust = CardStack.gestureEnd(px, py);

    _playAudio('card-fire', { volume: 0.55 });

    // Start toss animation before CombatBridge resolves
    var stackForAnim = CardStack.getStack().slice();
    startFireAnim(stackForAnim);

    // Fire via CombatBridge
    if (typeof CombatBridge !== 'undefined') {
      CombatBridge.fireStack(thrust);
    }
  }

  // ── Reorder ─────────────────────────────────────────────────────

  function _handleReorder(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= _hand.length) return;
    if (toIdx < 0 || toIdx >= _hand.length) return;

    // Move card in _hand array (direct mutation of CardSystem reference)
    var card = _hand.splice(fromIdx, 1)[0];
    _hand.splice(toIdx, 0, card);

    _playAudio('card-snap', { volume: 0.3 });
    _buildFan();

    // S0.3: CardAuthority events handle hand state changes reactively.
    // Visual reorder in the fan's _hand copy is local to rendering.
  }

  // ── Stack change notification ───────────────────────────────────

  function _notifyStackChange() {
    if (typeof CardStack === 'undefined') return;

    // Keep dice button label / colour in sync with stack state
    _updateDiceBtn();

    var stackCards = CardStack.getCards();
    var tags = CardStack.getSharedTags();

    if (stackCards.length > 1 && typeof HUD !== 'undefined') {
      var emojis = '';
      for (var i = 0; i < stackCards.length; i++) emojis += stackCards[i].emoji;
      HUD.showCombatLog(
        emojis + ' ' +
        (typeof i18n !== 'undefined' ? i18n.t('combat.stack_preview', 'Combo') : 'Combo') +
        (tags.length > 0 ? ' [' + tags.join('+') + ']' : '') +
        ' - ' +
        (typeof i18n !== 'undefined' ? i18n.t('combat.swipe_to_fire', 'swipe up to fire!') : 'swipe up to fire!')
      );
    }
  }

  // ── Fire animation (toss cards into enemy half) ──────────────────

  /**
   * Start the fire animation. Called by _handleSwipeFire BEFORE CombatBridge
   * resolves the stack. Cards splay upward with stagger into the enemy's
   * screen region, flash in their resource color, then persistent cards
   * retract and one-use cards dissolve.
   *
   * @param {Array} stackCards — [{card, handIndex}] from CardStack.getStack()
   */
  function startFireAnim(stackCards) {
    if (!_canvas || !stackCards || stackCards.length === 0) return;

    var w = _canvas.width;
    var h = _canvas.height;
    var cx = w / 2;
    var pivotY = h + PIVOT_Y_OFF;
    var n = stackCards.length;

    var animCards = [];
    var spreadW = Math.min(w * 0.6, n * (CARD_W + 10));
    var startX = cx - spreadW / 2;

    for (var i = 0; i < n; i++) {
      var sc = stackCards[i];
      // Find this card's current fan position for launch origin
      var srcX = cx;
      var srcY = h - CARD_H;
      for (var f = 0; f < _cards.length; f++) {
        if (_cards[f].handIndex === sc.handIndex) {
          var pos = _getCardPos(_cards[f], cx, pivotY, h);
          srcX = pos.x;
          srcY = pos.y;
          break;
        }
      }

      // Target: spread across top ~25% of screen
      var targetX = startX + (spreadW / Math.max(1, n - 1)) * i;
      if (n === 1) targetX = cx;
      var targetY = h * 0.18 + (i % 2) * 12;  // Slight wave

      var persistent = false;
      if (typeof CardStack !== 'undefined' && CardStack.isPersistent) {
        persistent = CardStack.isPersistent(sc.card);
      }

      animCards.push({
        card: sc.card,
        startX: srcX,
        startY: srcY,
        targetX: targetX,
        targetY: targetY,
        delay: i * FIRE_STAGGER,
        timer: 0,
        phase: 'waiting',  // waiting → flying → flash → retract/dissolve → done
        persistent: persistent
      });
    }

    var totalDuration = (n - 1) * FIRE_STAGGER + FIRE_FLY_MS + FIRE_FLASH_MS +
                        Math.max(FIRE_RETRACT_MS, FIRE_DISSOLVE_MS) + 100;

    _fireAnim = {
      cards: animCards,
      totalDuration: totalDuration,
      elapsed: 0
    };
  }

  /** Is the fire animation currently playing? */
  function isFireAnimPlaying() {
    return _fireAnim !== null;
  }

  /**
   * Update fire animation timers.
   * @param {number} dt — frame delta in ms
   */
  function _updateFireAnim(dt) {
    if (!_fireAnim) return;
    _fireAnim.elapsed += dt;

    var allDone = true;
    for (var i = 0; i < _fireAnim.cards.length; i++) {
      var ac = _fireAnim.cards[i];
      if (ac.phase === 'done') continue;

      allDone = false;
      ac.timer += dt;

      if (ac.phase === 'waiting' && ac.timer >= ac.delay) {
        ac.phase = 'flying';
        ac.timer = 0;  // Reset for fly phase
      } else if (ac.phase === 'flying' && ac.timer >= FIRE_FLY_MS) {
        ac.phase = 'flash';
        ac.timer = 0;
      } else if (ac.phase === 'flash' && ac.timer >= FIRE_FLASH_MS) {
        ac.phase = ac.persistent ? 'retract' : 'dissolve';
        ac.timer = 0;
      } else if (ac.phase === 'retract' && ac.timer >= FIRE_RETRACT_MS) {
        ac.phase = 'done';
      } else if (ac.phase === 'dissolve' && ac.timer >= FIRE_DISSOLVE_MS) {
        ac.phase = 'done';
      }
    }

    if (allDone) {
      _fireAnim = null;
    }
  }

  /**
   * Render fire animation cards.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w — canvas width
   * @param {number} h — canvas height
   */
  function _renderFireAnim(ctx, w, h) {
    if (!_fireAnim) return;

    ctx.save();
    for (var i = 0; i < _fireAnim.cards.length; i++) {
      var ac = _fireAnim.cards[i];
      if (ac.phase === 'waiting' || ac.phase === 'done') continue;

      var suit = ac.card.suit || '';
      var resourceColor = SUIT_BORDER_COLORS[suit] || '#c0d0e0';

      var x, y, alpha, scale;

      if (ac.phase === 'flying') {
        var t = Math.min(1, ac.timer / FIRE_FLY_MS);
        // Ease-out for satisfying deceleration
        var ease = 1 - (1 - t) * (1 - t);
        x = ac.startX + (ac.targetX - ac.startX) * ease;
        y = ac.startY + (ac.targetY - ac.startY) * ease;
        alpha = 1;
        scale = 1 + 0.15 * (1 - ease);  // Slightly larger at start
        // Spin while flying
        var spin = t * 0.3 * (i % 2 === 0 ? 1 : -1);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spin);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        _drawCardBody(ctx, { card: ac.card, handIndex: i }, false, false);
        ctx.restore();
        continue;
      }

      if (ac.phase === 'flash') {
        x = ac.targetX;
        y = ac.targetY;
        var ft = ac.timer / FIRE_FLASH_MS;
        // Flash: bright glow that fades
        alpha = 1;
        scale = 1 + 0.1 * (1 - ft);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        _drawCardBody(ctx, { card: ac.card, handIndex: i }, true, false);
        // Resource color flash overlay
        var hw = CARD_W / 2;
        var hh = CARD_H / 2;
        ctx.globalAlpha = 0.5 * (1 - ft);
        ctx.fillStyle = resourceColor;
        _roundRect(ctx, -hw, -hh, CARD_W, CARD_H, 5);
        ctx.fill();
        ctx.restore();
        continue;
      }

      if (ac.phase === 'retract') {
        var rt = Math.min(1, ac.timer / FIRE_RETRACT_MS);
        var rEase = rt * rt;  // Ease-in: accelerate back
        x = ac.targetX + (ac.startX - ac.targetX) * rEase;
        y = ac.targetY + (ac.startY - ac.targetY) * rEase;
        alpha = 1;
        scale = 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        _drawCardBody(ctx, { card: ac.card, handIndex: i }, false, false);
        ctx.restore();
        continue;
      }

      if (ac.phase === 'dissolve') {
        var dt2 = Math.min(1, ac.timer / FIRE_DISSOLVE_MS);
        x = ac.targetX;
        y = ac.targetY - dt2 * 20;  // Drift upward slightly
        alpha = 1 - dt2;
        scale = 1 - dt2 * 0.3;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        _drawCardBody(ctx, { card: ac.card, handIndex: i }, false, false);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ── Update ──────────────────────────────────────────────────────

  function update(dt) {
    if (!_open && !_fireAnim) return;
    _openTimer += dt;

    // Update play animations
    for (var i = 0; i < _cards.length; i++) {
      if (_cards[i].playing) {
        _cards[i].playTimer += dt;
        if (_cards[i].playTimer >= PLAY_DURATION) {
          // Remove played card from fan
          _cards.splice(i, 1);
          _hand.splice(i, 1);
          _hoverIdx = -1;
          _selectedIdx = -1;
          _buildFan(); // Re-fan remaining cards
          break;
        }
      }
    }

    // Update fire animation
    _updateFireAnim(dt);

    // Update hover from pointer (only when not dragging)
    if (!_drag && typeof InputManager !== 'undefined') {
      var ptr = InputManager.getPointer();
      if (ptr && ptr.active) {
        _hoverIdx = hitTest(ptr.x, ptr.y);
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  /**
   * Render the card fan on the canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   */
  function render(ctx, w, h) {
    if (!_open || _cards.length === 0) return;

    // ── Fan slide choreography: displace downward during resolution ──
    var slideOffset = 0;
    if (typeof CombatFX !== 'undefined') {
      slideOffset = CombatFX.getFanSlideOffset() * (CARD_H + 60);
    }

    var cx = w / 2;
    var pivotY = h + PIVOT_Y_OFF + slideOffset;

    ctx.save();

    // ── Maximized backdrop: peripheral dim with ring cutout ──
    // Everything outside the freelook ring dims; inside stays clear.
    // Cards render AFTER this layer so they are always crisp.
    if (_maximized) {
      var ringFrac = (typeof ViewportRing !== 'undefined')
        ? ViewportRing.RING_RADIUS_FRAC : 0.315;
      var ringR = Math.min(w, h) * ringFrac;
      var rcx = w / 2;
      var rcy = h / 2;

      ctx.save();
      // Draw full-screen dim with circular cutout (even-odd fill)
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(rcx, rcy, ringR, 0, Math.PI * 2, true); // CCW = cutout
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,8,16,0.55)';
      ctx.fill();

      // Soft gradient at bottom for card readability
      var bottomGrad = ctx.createLinearGradient(0, h * 0.68, 0, h);
      bottomGrad.addColorStop(0, 'rgba(10,8,16,0)');
      bottomGrad.addColorStop(1, 'rgba(10,8,16,0.4)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, h * 0.68, w, h * 0.32);

      // Thin divider arc along the bottom of the ring
      ctx.strokeStyle = 'rgba(160,140,100,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rcx, rcy, ringR, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();

      ctx.restore();
    }

    // ── First pass: render stack glow behind stacked cards ──
    if (_inCombat() && typeof CardStack !== 'undefined' && CardStack.getSize() > 1) {
      _renderStackGlow(ctx, cx, pivotY, h);
    }

    // ── Compute reorder drop target (explore mode only) ──
    var reorderDropIdx = -1;
    if (_drag && _drag.started && !_inCombat()) {
      reorderDropIdx = hitTest(_drag.curX, _drag.curY);
      if (reorderDropIdx === _drag.cardIdx) reorderDropIdx = -1;
    }

    // ── Second pass: render cards (hovered/selected card rendered LAST for z-order) ──
    // Determine which index should render on top. If the pointer is dragging
    // that card, the drag ghost handles it — skip the on-top pass.
    var topIdx = _hoverIdx;
    if (_drag && _drag.started && _drag.cardIdx === topIdx) topIdx = -1;

    for (var i = 0; i < _cards.length; i++) {
      var c = _cards[i];

      // Deal-in stagger: don't show until openTimer passes this card's deal time
      if (_openTimer < c.dealTimer) continue;

      // Skip dragged card in normal pass (render ghost separately)
      if (_drag && _drag.started && _drag.cardIdx === i) {
        // Render a dim placeholder gap where the card was
        var gapPos = _getCardPos(c, cx, pivotY, h);
        ctx.save();
        ctx.translate(gapPos.x, gapPos.y);
        ctx.rotate(c.angle * 0.6);
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = 'rgba(240,208,112,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        _roundRect(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, Math.max(4, CARD_W * 0.06));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }

      // Skip hovered card — render it after all others so it appears on top
      if (i === topIdx) continue;

      // If this card is the reorder drop target, shift it slightly to show the gap
      if (reorderDropIdx === i) {
        ctx.save();
        var shiftDir = (_drag.cardIdx < i) ? 1 : -1;
        ctx.translate(shiftDir * CARD_W * 0.15, 0);
        _renderCard(ctx, c, i, cx, pivotY, h, false);
        ctx.restore();
      } else {
        _renderCard(ctx, c, i, cx, pivotY, h, false);
      }
    }

    // ── 2.5 pass: envelope highlights on valid stack targets during combat drag ──
    if (_drag && _drag.started && _inCombat() && typeof CardStack !== 'undefined') {
      var dragC = _cards[_drag.cardIdx];
      if (dragC) {
        for (var ei = 0; ei < _cards.length; ei++) {
          if (ei === _drag.cardIdx) continue;
          var ec = _cards[ei];
          if (ec.playing) continue;
          if (_checkCanCombine(dragC.card, ec.card)) {
            var ePos = _getCardPos(ec, cx, pivotY, h);
            var eSO = _getStackOffset(ei);
            ePos.x += eSO.dx;
            ePos.y += eSO.dy;
            // Draw pulsing green envelope
            var pulse = 0.4 + 0.3 * Math.sin(_openTimer * 0.008);
            ctx.save();
            ctx.translate(ePos.x, ePos.y - 6);
            ctx.strokeStyle = 'rgba(80,255,120,' + pulse + ')';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 3]);
            _roundRect(ctx, -CARD_W / 2 - 4, -CARD_H / 2 - 4, CARD_W + 8, CARD_H + 8, 7);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }
      }
    }

    // ── 2.8 pass: hovered / selected card rendered last for correct z-order ──
    // This ensures the active card always appears above its neighbors in the fan,
    // regardless of its index position in the arc.
    if (topIdx >= 0 && topIdx < _cards.length && !_cards[topIdx].playing) {
      if (_openTimer >= _cards[topIdx].dealTimer) {
        if (reorderDropIdx === topIdx) {
          ctx.save();
          var topShiftDir = (_drag && _drag.cardIdx < topIdx) ? 1 : -1;
          ctx.translate(topShiftDir * CARD_W * 0.15, 0);
          _renderCard(ctx, _cards[topIdx], topIdx, cx, pivotY, h, false);
          ctx.restore();
        } else {
          _renderCard(ctx, _cards[topIdx], topIdx, cx, pivotY, h, false);
        }
      }
    }

    // ── Third pass: render dragged ghost card on top ──
    if (_drag && _drag.started && _drag.cardIdx >= 0 && _drag.cardIdx < _cards.length) {
      _renderDragGhost(ctx, w, h);
    }

    // ── Tooltip for hovered card ──
    if (!_drag || !_drag.started) {
      _renderTooltip(ctx, cx, pivotY, h);
    }

    // ── Fire animation (toss cards into enemy half) ──
    _renderFireAnim(ctx, w, h);

    ctx.restore();
  }

  /**
   * Render a single card at its fan position.
   */
  function _renderCard(ctx, c, i, cx, pivotY, h, isGhost) {
    var pos = _getCardPos(c, cx, pivotY, h);
    var stackOff = _getStackOffset(i);

    var isHover = (i === _hoverIdx) && !isGhost;
    var isPlaying = c.playing;
    var isStacked = stackOff.inStack;

    // Play animation: card flies upward toward center
    var playProgress = 0;
    if (isPlaying) {
      playProgress = Math.min(1, c.playTimer / PLAY_DURATION);
      var ease = 1 - (1 - playProgress) * (1 - playProgress);
      pos.x += (cx - pos.x) * ease;
      pos.y += (h * 0.3 - pos.y) * ease;
    }

    // Apply stack offset
    pos.x += stackOff.dx;
    pos.y += stackOff.dy;

    // Hover: lift card
    var lift = 0;
    var scale = 1;
    if (isHover && !isPlaying) {
      lift = LIFT_PX;
      scale = LIFT_SCALE;
    }
    // Stacked cards get a slight lift to show grouping
    if (isStacked && !isHover) {
      lift = 6;
    }

    // Rejection shake offset (horizontal wobble)
    var shakeOff = _getShakeOffset(i);

    ctx.save();
    ctx.translate(pos.x + shakeOff, pos.y - lift);
    ctx.rotate(c.angle * 0.6);  // Slight tilt following arc
    ctx.scale(scale, scale);

    // Fade out playing card
    if (isPlaying) {
      ctx.globalAlpha = 1 - playProgress;
    }

    // Flash red border on reject shake
    var isRejecting = (shakeOff !== 0);

    _drawCardBody(ctx, c, isHover, isStacked, isRejecting);
    ctx.restore();
  }

  /**
   * Render the dragged card as a floating ghost at pointer position.
   */
  function _renderDragGhost(ctx, w, h) {
    if (!_drag || !_drag.started) return;
    var idx = _drag.cardIdx;
    if (idx < 0 || idx >= _cards.length) return;
    var c = _cards[idx];

    ctx.save();
    ctx.globalAlpha = 0.85;

    // Ghost follows pointer with slight tilt based on drag velocity
    var dx = _drag.curX - _drag.startX;
    var tilt = Math.max(-0.15, Math.min(0.15, dx * 0.001));

    ctx.translate(_drag.curX, _drag.curY);
    ctx.rotate(tilt);
    ctx.scale(1.08, 1.08);  // Slight scale-up while dragging

    _drawCardBody(ctx, c, true, false);

    // Drop target indicator: if hovering over a different card, show
    // a small glow to indicate stackability
    if (_hoverIdx >= 0 && _hoverIdx !== idx && _inCombat()) {
      var targetCard = _cards[_hoverIdx];
      if (targetCard && typeof CardStack !== 'undefined') {
        // Quick check: would these cards be compatible?
        var canCombine = _checkCanCombine(c.card, targetCard.card);
        if (canCombine) {
          // Draw green glow at bottom
          ctx.fillStyle = 'rgba(80,255,120,0.25)';
          var hw = CARD_W / 2;
          ctx.fillRect(-hw, CARD_H / 2 - 8, CARD_W, 8);
        } else {
          // Draw red indicator
          ctx.fillStyle = 'rgba(255,60,60,0.2)';
          var hw2 = CARD_W / 2;
          ctx.fillRect(-hw2, CARD_H / 2 - 8, CARD_W, 8);
        }
      }
    }

    ctx.restore();
  }

  /**
   * Check if two cards share at least one synergy tag.
   */
  function _checkCanCombine(cardA, cardB) {
    if (!cardA || !cardB) return false;
    var tagsA = cardA.synergyTags || [];
    var tagsB = cardB.synergyTags || [];
    for (var i = 0; i < tagsA.length; i++) {
      for (var j = 0; j < tagsB.length; j++) {
        if (tagsA[i] === tagsB[j]) return true;
      }
    }
    return false;
  }

  /**
   * Render stack glow behind all stacked cards.
   */
  function _renderStackGlow(ctx, cx, pivotY, h) {
    var stack = CardStack.getStack();
    if (stack.length < 2) return;

    // Find the average position of stacked cards
    var sumX = 0;
    var sumY = 0;
    var count = 0;

    for (var i = 0; i < _cards.length; i++) {
      var sOff = _getStackOffset(i);
      if (!sOff.inStack) continue;
      var pos = _getCardPos(_cards[i], cx, pivotY, h);
      sumX += pos.x + sOff.dx;
      sumY += pos.y + sOff.dy;
      count++;
    }

    if (count === 0) return;
    var avgX = sumX / count;
    var avgY = sumY / count;

    // Draw radial glow centered on stack
    var glowSize = CARD_W * 0.8 + stack.length * 4;
    var grad = ctx.createRadialGradient(avgX, avgY - 10, 0, avgX, avgY - 10, glowSize);
    grad.addColorStop(0, STACK_GLOW_COLOR);
    grad.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(avgX - glowSize, avgY - 10 - glowSize, glowSize * 2, glowSize * 2);
  }

  /**
   * Draw a card body (shared between normal render and ghost).
   * Visual style ported from EyesOnly: coin border, resource gradient,
   * paper texture, metallic sheen, suit symbols TL + BR (rotated 180°),
   * cost badge, quality glow.
   */
  function _drawCardBody(ctx, c, isHover, isStacked, isRejecting) {
    // Delegate to unified CardDraw module (Layer 1) at FULL LOD.
    // CardDraw.drawCard expects the raw card object and dimensions.
    if (typeof CardDraw !== 'undefined') {
      CardDraw.drawCard(ctx, c.card, CARD_W, CARD_H, {
        lod:         'full',
        isHover:     isHover,
        isStacked:   isStacked,
        isRejecting: isRejecting,
        handIndex:   c.handIndex
      });
    }
  }

  /**
   * Render tooltip for hovered card.
   */
  function _renderTooltip(ctx, cx, pivotY, h) {
    if (_hoverIdx < 0 || _hoverIdx >= _cards.length) return;
    if (_cards[_hoverIdx].playing) return;

    var hc = _cards[_hoverIdx];
    var hPos = _getCardPos(hc, cx, pivotY, h);
    var desc = hc.card.description || hc.card.name || '';

    if (!desc) return;

    var tipSize = Math.max(10, Math.floor(CARD_H * 0.14));
    var tipH = tipSize + 10;
    ctx.font = tipSize + 'px monospace';
    var tw = ctx.measureText(desc).width + 16;
    var tx = hPos.x - tw / 2;
    var ty = hPos.y - CARD_H / 2 - LIFT_PX - tipH - 8;

    // Tooltip bg
    _roundRect(ctx, tx, ty, tw, tipH, 4);
    ctx.fillStyle = 'rgba(10,8,16,0.9)';
    ctx.fill();
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 1;
    _roundRect(ctx, tx, ty, tw, tipH, 4);
    ctx.stroke();

    // Tooltip text
    ctx.fillStyle = COL_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(desc, hPos.x, ty + tipH / 2);
  }

  // ── Handle pointer click on fan (legacy — kept for keyboard/dpad) ──

  /**
   * Handle a pointer click. Returns true if consumed.
   */
  function handlePointerClick() {
    if (!_open) return false;
    if (_hoverIdx >= 0) {
      _handleTap(_hoverIdx);
      return true;
    }
    return false;
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

  /**
   * Register a handler for cards dragged out of the fan (non-combat).
   * Signature: fn({ cardIdx, card, screenX, screenY }) → boolean
   * Return true if the external drop was handled.
   * @param {Function|null} handler
   */
  function setExternalDropHandler(handler) {
    _externalDropHandler = handler;
  }

  /** True if a card is currently being dragged outside the fan. */
  function isExternalDragging() {
    return !!(_drag && _drag.external);
  }

  /** Get the currently dragged card info (for zone highlight feedback). */
  function getDragInfo() {
    if (!_drag || !_drag.started) return null;
    var c = _cards[_drag.cardIdx];
    return c ? { cardIdx: _drag.cardIdx, card: c.card, external: !!_drag.external } : null;
  }

  return {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    setHand: setHand,
    selectCard: selectCard,
    playCard: playCard,
    hitTest: hitTest,
    update: update,
    render: render,
    handlePointerClick: handlePointerClick,
    maximize: maximize,
    minimize: minimize,
    isMaximized: isMaximized,
    startFireAnim: startFireAnim,
    isFireAnimPlaying: isFireAnimPlaying,

    // External drag system (cross-zone transfers)
    setExternalDropHandler: setExternalDropHandler,
    isExternalDragging: isExternalDragging,
    getDragInfo: getDragInfo
  };
})();

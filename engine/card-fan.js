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
  var COMBAT_LIFT      = 80;   // px additional upward shift in combat (increased for status bar clearance)
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
    if (_canvas) {
      _canvas.addEventListener('pointerdown', _onPointerDown, false);
      _canvas.addEventListener('pointermove', _onPointerMove, false);
      _canvas.addEventListener('pointerup', _onPointerUp, false);
      _canvas.addEventListener('pointercancel', _onPointerCancel, false);
    }
    _createMinimizeBtn();
  }

  /**
   * Create the DOM minimize toggle button (hidden by default).
   * Floats above the fan at z-index 20.
   */
  function _createMinimizeBtn() {
    if (_minimizeBtnEl) return;
    var vp = document.getElementById('viewport');
    if (!vp) return;

    _minimizeBtnEl = document.createElement('button');
    _minimizeBtnEl.id = 'fan-minimize-btn';
    _minimizeBtnEl.textContent = '▼';
    _minimizeBtnEl.title = 'Minimize hand';
    _minimizeBtnEl.style.cssText =
      'position:absolute; bottom:28%; right:12px; z-index:20;' +
      'width:36px; height:36px; border-radius:50%;' +
      'background:rgba(20,18,28,0.85); border:2px solid rgba(160,140,100,0.5);' +
      'color:#f0d070; font-size:16px; cursor:pointer;' +
      'display:none; align-items:center; justify-content:center;' +
      'font-family:monospace; pointer-events:auto;' +
      'transition:background 0.15s, transform 0.15s;';
    _minimizeBtnEl.addEventListener('mouseenter', function () {
      _minimizeBtnEl.style.background = 'rgba(40,36,56,0.95)';
      _minimizeBtnEl.style.transform = 'scale(1.1)';
    });
    _minimizeBtnEl.addEventListener('mouseleave', function () {
      _minimizeBtnEl.style.background = 'rgba(20,18,28,0.85)';
      _minimizeBtnEl.style.transform = 'scale(1)';
    });
    _minimizeBtnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      minimize();
    });
    vp.appendChild(_minimizeBtnEl);
  }

  // ── Maximize / Minimize ─────────────────────────────────────────

  /**
   * Enter maximized mode: fan takes bottom ~30%, DOM overlays suppressed.
   * Called by NchWidget when opening the fan in explore mode.
   */
  function maximize(opts) {
    _maximized = true;
    _onMinimize = (opts && opts.onMinimize) || null;

    // Show minimize button
    if (_minimizeBtnEl) _minimizeBtnEl.style.display = 'flex';

    // Slightly blur only the game canvas to focus attention on cards
    // HUD stays fully opaque and readable
    var cv = document.getElementById('view-canvas');
    if (cv) cv.style.filter = 'blur(1.5px) brightness(0.85)';
  }

  /**
   * Exit maximized mode, restoring DOM overlays.
   * Called by minimize button or when fan closes.
   */
  function minimize() {
    _maximized = false;
    if (_minimizeBtnEl) _minimizeBtnEl.style.display = 'none';

    // Remove canvas blur
    var cv = document.getElementById('view-canvas');
    if (cv) cv.style.filter = '';

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
  }

  /** Close the fan (sweep down). */
  function close() {
    _open = false;
    _cards = [];
    _hoverIdx = -1;
    _selectedIdx = -1;
    _drag = null;

    // Clean up maximized state if active
    if (_maximized) {
      _maximized = false;
      if (_minimizeBtnEl) _minimizeBtnEl.style.display = 'none';
      var cv = document.getElementById('view-canvas');
      if (cv) cv.style.filter = '';
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
   */
  function hitTest(px, py) {
    if (!_open || !_canvas) return -1;
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

    // During drag: update hover to the card under pointer (for drop target)
    _hoverIdx = hitTest(px, py);

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

    // Drag completed — determine action
    var dragIdx = _drag.cardIdx;
    var dropIdx = hitTest(px, py);

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

    var stackCards = CardStack.getCards();
    var tags = CardStack.getSharedTags();

    if (stackCards.length > 1 && typeof HUD !== 'undefined') {
      var emojis = '';
      for (var i = 0; i < stackCards.length; i++) emojis += stackCards[i].emoji;
      HUD.showCombatLog(
        emojis + ' ' +
        (typeof i18n !== 'undefined' ? i18n.t('combat.stack_preview', 'Combo') : 'Combo') +
        (tags.length > 0 ? ' [' + tags.join('+') + ']' : '') +
        ' — ' +
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

    // ── Maximized backdrop: dark gradient across bottom ~30% ──
    if (_maximized) {
      var backdropH = h * 0.35;
      var backdropY = h - backdropH;
      var grad = ctx.createLinearGradient(0, backdropY, 0, h);
      grad.addColorStop(0, 'rgba(10,8,16,0)');
      grad.addColorStop(0.15, 'rgba(10,8,16,0.7)');
      grad.addColorStop(1, 'rgba(10,8,16,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, backdropY, w, backdropH);

      // Thin divider line at top of backdrop
      ctx.strokeStyle = 'rgba(160,140,100,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, backdropY + backdropH * 0.15);
      ctx.lineTo(w, backdropY + backdropH * 0.15);
      ctx.stroke();
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

    // ── Second pass: render cards ──
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

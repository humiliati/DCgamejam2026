/**
 * NchWidget — Non-Combat Hand capsule widget.
 *
 * Adapted from EyesOnly NCH_CAPSULE_OVERLAY_ARCHITECTURE.md:
 *   - Shared DOM surface (#nch-widget / #nch-stack)
 *   - Signature-based render skipping (stackEl.dataset.sig)
 *   - Mode dispatch: explore (default) → combat (minimized)
 *   - Intelligent joker nodes: 🃏 per card in hand, count matches hand size
 *   - EyesOnly diagonal cascade layout (5px offset, wave pattern)
 *
 * The widget also displays summary badges for bag count and deck count,
 * translating bag/shop/equipped hand interactions down to the capsule.
 *
 * Position persists in JS memory for the session (no localStorage on webOS).
 * Draggable via Magic Remote pointer.
 *
 * Layer 2 (after CardFan)
 * Depends on: CardFan, CardSystem, Player, InputManager (optional)
 */
var NchWidget = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  var DEFAULT_X      = -1;   // -1 = auto (right side, above status bar)
  var DEFAULT_Y      = -1;
  var MAX_JOKERS     = 5;    // Max visible joker cards in stack
  var JOKER_ADVANCE  = 5;    // px right per card (70% overlap on 16px emoji)
  var JOKER_CHAR     = '🃏';

  // ── DOM refs ──────────────────────────────────────────────────────
  var _el         = null;  // #nch-widget (capsule wrapper)
  var _stackEl    = null;  // #nch-stack (joker container)
  var _badgesEl   = null;  // #nch-badges
  var _bagBadge   = null;  // #nch-badge-bag span
  var _deckBadge  = null;  // #nch-badge-deck span

  // ── State ─────────────────────────────────────────────────────────
  var _visible        = false;
  var _posX           = DEFAULT_X;
  var _posY           = DEFAULT_Y;
  var _dragging       = false;
  var _dragOffX       = 0;
  var _dragOffY       = 0;
  var _dragMoved      = false;
  var _mode           = 'explore';  // 'explore' | 'combat'
  var _fanOpenByWidget = false;

  // ── Combat capsule state (like EyesOnly _combatCapsule) ──────────
  var _combatCapsule  = null;
  // When active: { cards: [], selectedIdx: -1 }

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    _el        = document.getElementById('nch-widget');
    _stackEl   = document.getElementById('nch-stack');
    _badgesEl  = document.getElementById('nch-badges');

    var bagSpan  = document.getElementById('nch-badge-bag');
    var deckSpan = document.getElementById('nch-badge-deck');
    _bagBadge  = bagSpan  ? bagSpan.querySelector('span')  : null;
    _deckBadge = deckSpan ? deckSpan.querySelector('span') : null;

    if (!_el) return;

    // Default position: bottom-right, above quick bar + status bar
    var vp = document.getElementById('viewport');
    if (_posX < 0 && vp) {
      _posX = vp.offsetWidth - 80;
      _posY = vp.offsetHeight - 120;
    }
    _applyPosition();

    // Click → toggle hand fan (browse mode)
    _el.addEventListener('click', function (e) {
      if (_dragMoved) return;
      e.stopPropagation();
      _onCapsuleClick();
    });

    // Drag support (Magic Remote / mouse)
    _el.addEventListener('pointerdown', _onDragStart);
    document.addEventListener('pointermove', _onDragMove);
    document.addEventListener('pointerup', _onDragEnd);

    // Initial render
    _renderStack();
    _renderBadges();
  }

  // ── Show / Hide ───────────────────────────────────────────────────

  function show() {
    _visible = true;
    if (_el) {
      _el.style.display = 'flex';
      _applyPosition();
      _renderStack();
      _renderBadges();
    }
  }

  function hide() {
    _visible = false;
    if (_el) _el.style.display = 'none';
  }

  // ── Position ──────────────────────────────────────────────────────

  function _applyPosition() {
    if (!_el) return;
    _el.style.left = _posX + 'px';
    _el.style.top  = _posY + 'px';
  }

  function getPosition() {
    return { x: _posX, y: _posY };
  }

  function getCenterPosition() {
    var w = _el ? _el.offsetWidth  : 50;
    var h = _el ? _el.offsetHeight : 30;
    return { x: _posX + w / 2, y: _posY + h / 2 };
  }

  function getExpandOrigin() {
    return getCenterPosition();
  }

  // ── Drag handlers ─────────────────────────────────────────────────

  function _onDragStart(e) {
    if (_mode === 'combat') return;
    _dragging = true;
    _dragOffX = e.clientX - _posX;
    _dragOffY = e.clientY - _posY;
    _dragMoved = false;
    if (_el.setPointerCapture) _el.setPointerCapture(e.pointerId);
  }

  function _onDragMove(e) {
    if (!_dragging || !_el || _mode === 'combat') return;
    var nx = e.clientX - _dragOffX;
    var ny = e.clientY - _dragOffY;
    if (!_dragMoved && (Math.abs(nx - _posX) > 3 || Math.abs(ny - _posY) > 3)) {
      _dragMoved = true;
    }
    if (_dragMoved) {
      _posX = nx;
      _posY = ny;
      var vp = document.getElementById('viewport');
      if (vp) {
        var ew = _el.offsetWidth  || 60;
        var eh = _el.offsetHeight || 32;
        _posX = Math.max(0, Math.min(vp.offsetWidth  - ew, _posX));
        _posY = Math.max(0, Math.min(vp.offsetHeight - eh, _posY));
      }
      _applyPosition();
    }
  }

  function _onDragEnd() {
    _dragging = false;
    if (_dragMoved) {
      setTimeout(function () { _dragMoved = false; }, 50);
    } else {
      _dragMoved = false;
    }
  }

  // ── Capsule click → toggle hand fan ───────────────────────────────

  function _onCapsuleClick() {
    if (_mode !== 'explore') return;
    if (typeof CardFan === 'undefined') return;

    if (CardFan.isOpen() && _fanOpenByWidget) {
      // Close fan + exit maximized mode
      CardFan.close();
      _fanOpenByWidget = false;
      _setModeClass('idle');
      _renderStack();
    } else if (!CardFan.isOpen()) {
      var hand = _getHand();
      var deckCount = _getDeckCount();
      if (hand.length === 0) {
        if (deckCount === 0) {
          // No cards anywhere — nothing to show
          if (typeof Toast !== 'undefined') {
            Toast.show(i18n.t('nch.totally_empty', 'Totally out of cards'), 'info');
          }
          return;
        }
        // Hand empty but deck has cards — open pause menu at inventory face
        // so the player can manage their deck
        if (typeof Game !== 'undefined' && Game.requestPause) {
          Game.requestPause('pause', 2);
        } else if (typeof ScreenManager !== 'undefined') {
          ScreenManager.toPause();
        }
        return;
      }
      CardFan.open(hand, { onPlay: null });
      _fanOpenByWidget = true;
      _setModeClass('open');

      // Enter maximized mode with minimize callback
      CardFan.maximize({
        onMinimize: function () {
          _fanOpenByWidget = false;
          _setModeClass('idle');
          _renderStack();
        }
      });
    }
  }

  // ── Data helpers ──────────────────────────────────────────────────

  function _getHand() {
    if (typeof CardAuthority !== 'undefined') return CardAuthority.getHand();
    return [];
  }

  function _getDeckCount() {
    if (typeof CardAuthority !== 'undefined') {
      return CardAuthority.getBackupSize();
    }
    return 0;
  }

  function _getBagInfo() {
    if (typeof Player !== 'undefined') {
      var s = Player.state();
      return { count: s.bag ? s.bag.length : 0, max: 12 };
    }
    return { count: 0, max: 12 };
  }

  function _getEquipped() {
    if (typeof Player !== 'undefined') {
      var s = Player.state();
      return s.equipped || [null, null, null];
    }
    return [null, null, null];
  }

  // ── Stack renderer (signature-based — EyesOnly pattern) ──────────

  /**
   * Render the joker stack into #nch-stack.
   * One 🃏 per card in hand, max MAX_JOKERS visible, diagonal cascade.
   * Signature-based: skips DOM rebuild if nothing changed.
   */
  function _renderStack() {
    if (!_stackEl) return;

    if (_combatCapsule) {
      _renderCombatStack();
      return;
    }

    var hand = _getHand();
    var count = hand.length;
    var equipped = _getEquipped();

    // Build signature: hand count + equipped slot hashes
    var eqSig = '';
    for (var ei = 0; ei < 3; ei++) {
      eqSig += equipped[ei] ? '1' : '0';
    }
    var sig = count + ':' + eqSig + ':' + (_fanOpenByWidget ? 'O' : 'C');
    if (_stackEl.dataset.sig === sig) return;
    _stackEl.dataset.sig = sig;

    // Clear and rebuild
    _stackEl.innerHTML = '';

    if (count === 0) {
      // Empty state: single greyed joker
      _stackEl.style.width = '16px';
      var gj = document.createElement('div');
      gj.className = 'nch-joker j-0 nch-joker-greyed';
      gj.textContent = JOKER_CHAR;
      _stackEl.appendChild(gj);
      _el.classList.add('nch-empty');
      return;
    }

    _el.classList.remove('nch-empty');

    var numJokers = Math.min(count, MAX_JOKERS);
    _stackEl.style.width = (16 + (numJokers - 1) * JOKER_ADVANCE) + 'px';

    for (var i = 0; i < numJokers; i++) {
      var j = document.createElement('div');
      j.className = 'nch-joker j-' + i;

      // In "open" mode (fan browsing), show card emojis instead of 🃏
      if (_fanOpenByWidget && hand[i] && hand[i].emoji) {
        j.textContent = hand[i].emoji;
        j.classList.add('nch-joker-active');
      } else {
        j.textContent = JOKER_CHAR;
      }

      _stackEl.appendChild(j);
    }
  }

  /**
   * Combat mode stack: minimized view showing cards shrunk/greyed.
   * Signature: ch:<count>:<selectedIdx>
   */
  function _renderCombatStack() {
    if (!_stackEl || !_combatCapsule) return;

    var cards = _combatCapsule.cards || [];
    var selIdx = _combatCapsule.selectedIdx;
    var count = cards.length;

    var sig = 'ch:' + count + ':' + selIdx;
    if (_stackEl.dataset.sig === sig) return;
    _stackEl.dataset.sig = sig;

    _stackEl.innerHTML = '';
    var numJokers = Math.min(count, MAX_JOKERS);
    _stackEl.style.width = (numJokers > 0 ? (16 + (numJokers - 1) * JOKER_ADVANCE) : 16) + 'px';

    for (var i = 0; i < numJokers; i++) {
      var j = document.createElement('div');
      j.className = 'nch-joker j-' + i;

      if (i === selIdx && cards[i]) {
        // Selected card → reveal emoji (intelligent node)
        j.textContent = cards[i].emoji || JOKER_CHAR;
        j.classList.add('nch-joker-active');
      } else {
        j.textContent = JOKER_CHAR;
      }

      _stackEl.appendChild(j);
    }
  }

  // ── Badge renderer ────────────────────────────────────────────────

  function _renderBadges() {
    var bag = _getBagInfo();
    var deckCount = _getDeckCount();

    if (_bagBadge)  _bagBadge.textContent  = bag.count + '/' + bag.max;
    if (_deckBadge) _deckBadge.textContent = deckCount + '';
  }

  // ── Mode class management ─────────────────────────────────────────

  function _setModeClass(mode) {
    if (!_el) return;
    _el.classList.remove('nch-idle', 'nch-open', 'nch-combat', 'nch-empty');
    _el.classList.add('nch-' + mode);
  }

  // ── Combat mode transitions ───────────────────────────────────────

  function enterCombat() {
    // Close any widget-opened fan first
    if (typeof CardFan !== 'undefined' && CardFan.isOpen() && _fanOpenByWidget) {
      CardFan.close();
      _fanOpenByWidget = false;
    }

    _mode = 'combat';

    // Set combat capsule state
    _combatCapsule = {
      cards: _getHand(),
      selectedIdx: -1
    };

    _setModeClass('combat');
    _renderStack();
  }

  /**
   * Update combat capsule with current card selection.
   * Called by game.js when a card is being played.
   */
  function updateCombat(opts) {
    if (!_combatCapsule) return;
    if (opts.cards) _combatCapsule.cards = opts.cards;
    if (opts.selectedIdx !== undefined) _combatCapsule.selectedIdx = opts.selectedIdx;
    _renderStack();
  }

  function exitCombat() {
    _mode = 'explore';
    _combatCapsule = null;

    _setModeClass('idle');

    // Force signature reset so stack rebuilds
    if (_stackEl) _stackEl.dataset.sig = '';

    _renderStack();
    _renderBadges();
  }

  // ── Refresh (master entry point — call after ANY mutation) ────────

  /**
   * Full refresh: re-renders stack + badges.
   * Call after hand/bag/deck/equip changes.
   * Safe to call frequently — signature skips no-ops.
   */
  function refresh() {
    if (!_visible) return;

    // Update combat capsule's card reference if in combat
    if (_combatCapsule) {
      _combatCapsule.cards = _getHand();
    }

    _renderStack();
    _renderBadges();
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    init:              init,
    show:              show,
    hide:              hide,
    getPosition:       getPosition,
    getCenterPosition: getCenterPosition,
    getExpandOrigin:   getExpandOrigin,
    enterCombat:       enterCombat,
    updateCombat:      updateCombat,
    exitCombat:        exitCombat,
    refresh:           refresh
  };
})();

/**
 * CardFan — canvas-rendered combat card arc.
 *
 * Displays the player's hand as a fan of cards arcing upward from the
 * bottom of the viewport. Cards spread around a pivot point below the
 * screen edge. Pointer hover lifts and highlights cards. OK plays the
 * selected card.
 *
 * Adapted from EyesOnly's hand-fan-component.js (~1800 lines) — distilled
 * to core interaction: fan geometry, hover detection, play animation.
 *
 * Layer 2 (after HUD, before MenuBox)
 * Depends on: InputManager (pointer), CardSystem (hand data)
 */
var CardFan = (function () {
  'use strict';

  // ── Layout ──────────────────────────────────────────────────────
  var CARD_W       = 56;        // Card width
  var CARD_H       = 80;        // Card height
  var ARC_ANGLE    = Math.PI / 3;  // Total fan arc (~60°)
  var PIVOT_Y_OFF  = 160;      // Pivot point below viewport bottom
  var LIFT_PX      = 20;       // Hover lift amount
  var LIFT_SCALE   = 1.12;     // Hover scale-up
  var DEAL_STAGGER = 60;       // ms stagger per card on open
  var PLAY_DURATION = 200;     // ms card-fly-forward animation

  // ── Colors ──────────────────────────────────────────────────────
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

  // ── State ───────────────────────────────────────────────────────
  var _open       = false;
  var _hand       = [];       // Card objects from CardSystem
  var _cards      = [];       // Fan state per card: { card, angle, x, y, dealTimer, playing, playTimer }
  var _hoverIdx   = -1;       // Currently hovered card index
  var _selectedIdx = -1;      // Selected (about to play) card index
  var _onPlay     = null;     // Callback fn(cardIndex) when a card is played
  var _canvas     = null;
  var _openTimer  = 0;        // ms since fan opened

  // ── Init ────────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
  }

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
    _buildFan();
  }

  /** Close the fan (sweep down). */
  function close() {
    _open = false;
    _cards = [];
    _hoverIdx = -1;
    _selectedIdx = -1;
  }

  function isOpen() { return _open; }

  /** Update hand mid-combat (after card draw). */
  function setHand(hand) {
    _hand = hand || [];
    _buildFan();
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
        dealTimer: i * DEAL_STAGGER,  // Staggered deal-in
        playing:   false,
        playTimer: 0
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
    var pivotY = h + PIVOT_Y_OFF;

    // Test from top (front) card to back for correct overlap order
    for (var i = _cards.length - 1; i >= 0; i--) {
      var c = _cards[i];
      if (c.playing) continue;

      var pos = _getCardPos(c, cx, pivotY, h);
      // Simple AABB hit test (rotated cards are approximate)
      var hw = CARD_W / 2;
      var hh = CARD_H / 2;
      if (px >= pos.x - hw && px <= pos.x + hw &&
          py >= pos.y - hh && py <= pos.y + hh) {
        return i;
      }
    }
    return -1;
  }

  // ── Get card render position ────────────────────────────────────

  function _getCardPos(c, cx, pivotY, viewH) {
    var radius = PIVOT_Y_OFF + CARD_H * 0.3;
    var x = cx + Math.sin(c.angle) * radius;
    var y = pivotY - Math.cos(c.angle) * radius;
    return { x: x, y: y };
  }

  // ── Update ──────────────────────────────────────────────────────

  function update(dt) {
    if (!_open) return;
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

    // Update hover from pointer
    if (typeof InputManager !== 'undefined') {
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

    var cx = w / 2;
    var pivotY = h + PIVOT_Y_OFF;

    ctx.save();

    for (var i = 0; i < _cards.length; i++) {
      var c = _cards[i];

      // Deal-in stagger: don't show until openTimer passes this card's deal time
      if (_openTimer < c.dealTimer) continue;

      var pos = _getCardPos(c, cx, pivotY, h);
      var isHover = (i === _hoverIdx);
      var isPlaying = c.playing;

      // Play animation: card flies upward toward center
      var playProgress = 0;
      if (isPlaying) {
        playProgress = Math.min(1, c.playTimer / PLAY_DURATION);
        var ease = 1 - (1 - playProgress) * (1 - playProgress); // ease-out
        pos.x += (cx - pos.x) * ease;
        pos.y += (h * 0.3 - pos.y) * ease;
      }

      // Hover: lift card
      var lift = 0;
      var scale = 1;
      if (isHover && !isPlaying) {
        lift = LIFT_PX;
        scale = LIFT_SCALE;
      }

      ctx.save();
      ctx.translate(pos.x, pos.y - lift);
      ctx.rotate(c.angle * 0.6);  // Slight tilt following arc
      ctx.scale(scale, scale);

      // Fade out playing card
      if (isPlaying) {
        ctx.globalAlpha = 1 - playProgress;
      }

      // ── Card body ──
      var hw = CARD_W / 2;
      var hh = CARD_H / 2;
      var borderColor = BORDER_COLORS[c.card.type] || COL_BORDER;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      _roundRect(ctx, -hw + 2, -hh + 2, CARD_W, CARD_H, 5);
      ctx.fill();

      // Background
      _roundRect(ctx, -hw, -hh, CARD_W, CARD_H, 5);
      ctx.fillStyle = COL_BG;
      ctx.fill();

      // Border (color-coded by type)
      ctx.strokeStyle = isHover ? '#fff' : borderColor;
      ctx.lineWidth = isHover ? 2 : 1.5;
      _roundRect(ctx, -hw, -hh, CARD_W, CARD_H, 5);
      ctx.stroke();

      // Emoji icon (large, centered)
      if (c.card.emoji) {
        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(c.card.emoji, 0, -8);
      }

      // Card name (small, bottom)
      if (c.card.name) {
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = COL_NAME;
        ctx.fillText(c.card.name, 0, hh - 6);
      }

      ctx.restore();
    }

    // ── Tooltip for hovered card ──
    if (_hoverIdx >= 0 && _hoverIdx < _cards.length && !_cards[_hoverIdx].playing) {
      var hc = _cards[_hoverIdx];
      var hPos = _getCardPos(hc, cx, pivotY, h);
      var desc = hc.card.description || hc.card.name || '';

      if (desc) {
        ctx.font = '11px monospace';
        var tw = ctx.measureText(desc).width + 12;
        var tx = hPos.x - tw / 2;
        var ty = hPos.y - CARD_H / 2 - LIFT_PX - 28;

        // Tooltip bg
        _roundRect(ctx, tx, ty, tw, 22, 4);
        ctx.fillStyle = 'rgba(10,8,16,0.9)';
        ctx.fill();
        ctx.strokeStyle = COL_BORDER;
        ctx.lineWidth = 1;
        _roundRect(ctx, tx, ty, tw, 22, 4);
        ctx.stroke();

        // Tooltip text
        ctx.fillStyle = COL_TEXT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(desc, hPos.x, ty + 11);
      }
    }

    ctx.restore();
  }

  // ── Handle pointer click on fan ─────────────────────────────────

  /**
   * Handle a pointer click. Returns true if consumed.
   */
  function handlePointerClick() {
    if (!_open) return false;
    if (_hoverIdx >= 0) {
      playCard(_hoverIdx);
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
    handlePointerClick: handlePointerClick
  };
})();

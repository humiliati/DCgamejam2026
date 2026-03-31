/**
 * CardDraw — Unified canvas-based card rendering at multiple LOD tiers.
 *
 * This module provides a single drawCard() function that renders a card
 * onto a 2D canvas context at three detail levels:
 *
 *   FULL   — Hand fan cards (combat/explore): coin border, resource tint,
 *            suit portholes, cost badge, emoji artwork, name bar, tags.
 *   MEDIUM — Menu/inventory slots (~60-80px): resource tint border, suit pip,
 *            cost number, emoji, truncated name. Recognizable as "the same card."
 *   SMALL  — Bag/stash grid (~40-48px): resource border, emoji only, suit dot.
 *
 * Replaces:
 *   - CardFan._drawCardBody()  (FULL tier — fan cards)
 *   - MenuFaces._drawItemTile() for cards (tiles showed generic emoji, not card)
 *
 * Design: card data flows in as a plain object (card), not a wrapper.
 * The caller passes {card, w, h, lod, isHover, isStacked, isRejecting}.
 *
 * Depends on: CardRenderer (Layer 1) for SUIT_DATA and RES_COLORS lookups.
 *             Falls back to hardcoded values if CardRenderer is absent.
 *
 * Layer 1 (after CardRenderer, before CardFan/MenuFaces)
 */
var CardDraw = (function () {
  'use strict';

  // ── LOD tiers ───────────────────────────────────────────────────
  var LOD_FULL   = 'full';
  var LOD_MEDIUM = 'medium';
  var LOD_SMALL  = 'small';

  // ── Colors ──────────────────────────────────────────────────────
  var SUIT_BORDER_COLORS = {
    spade:   'rgba(180,170,150,0.7)',
    club:    '#00D4FF',
    diamond: '#00FFA6',
    heart:   '#FF6B9D'
  };
  var BORDER_COLORS = {
    attack:  '#c44',
    defense: '#48c',
    heal:    '#4a4',
    utility: '#aa4'
  };
  var COL_BORDER = 'rgba(160,140,100,0.5)';
  var COL_NAME   = '#f0d070';
  var COL_TEXT   = '#d8d0c0';

  // ── Helpers ─────────────────────────────────────────────────────

  function _getResColor(card) {
    if (typeof CardRenderer !== 'undefined' && CardRenderer.RES_COLORS) {
      var res = card.resource || card.costResource || null;
      if (res && CardRenderer.RES_COLORS[res]) return CardRenderer.RES_COLORS[res];
      if (card.suit && CardRenderer.SUIT_DATA && CardRenderer.SUIT_DATA[card.suit]) {
        var sres = CardRenderer.SUIT_DATA[card.suit].res;
        return CardRenderer.RES_COLORS[sres] || CardRenderer.RES_COLORS.cards;
      }
      return CardRenderer.RES_COLORS.cards;
    }
    return { r: 128, g: 0, b: 128 };
  }

  function _getSuitData(card) {
    if (typeof CardRenderer !== 'undefined' && CardRenderer.SUIT_DATA && card.suit) {
      return CardRenderer.SUIT_DATA[card.suit] || null;
    }
    // Fallback
    var fallback = {
      spade:   { sym: '\u2660', color: 'rgba(180,170,150,0.85)' },
      club:    { sym: '\u2663', color: '#00D4FF' },
      diamond: { sym: '\u2666', color: '#00FFA6' },
      heart:   { sym: '\u2665', color: '#FF6B9D' }
    };
    return card.suit ? (fallback[card.suit] || null) : null;
  }

  function _getBorderColor(card) {
    if (card.suit && SUIT_BORDER_COLORS[card.suit]) return SUIT_BORDER_COLORS[card.suit];
    if (card.type && BORDER_COLORS[card.type]) return BORDER_COLORS[card.type];
    return COL_BORDER;
  }

  function _roundRect(ctx, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function _getCostVal(card) {
    var raw = card.cost;
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'object' && raw.value !== undefined) return raw.value;
    return raw;
  }

  // ════════════════════════════════════════════════════════════════
  //  FULL LOD — richly detailed playing card (fan cards)
  // ════════════════════════════════════════════════════════════════

  function _drawFull(ctx, card, w, h, opts) {
    var hw = w / 2;
    var hh = h / 2;
    var borderR = Math.max(4, w * 0.06);
    var rc = _getResColor(card);
    var borderColor = _getBorderColor(card);
    var isHover = opts.isHover || false;
    var isStacked = opts.isStacked || false;
    var isRejecting = opts.isRejecting || false;
    var costVal = _getCostVal(card);

    // ── Drop shadow ─────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, -hw + 3, -hh + 3, w, h, borderR);
    ctx.fill();

    // ── Outer coin border (brass rim) ───────────────────────────
    var outerPad = Math.max(2, Math.floor(w * 0.03));
    _roundRect(ctx, -hw - outerPad, -hh - outerPad, w + outerPad * 2, h + outerPad * 2, borderR + 2);
    var outerGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    outerGrad.addColorStop(0, 'rgba(180,160,100,0.55)');
    outerGrad.addColorStop(0.5, 'rgba(220,200,140,0.35)');
    outerGrad.addColorStop(1, 'rgba(140,120,70,0.45)');
    ctx.fillStyle = outerGrad;
    ctx.fill();

    // ── Inner coin border (recessed shadow) ─────────────────────
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ── Card body: opaque paper base + resource gradient tint ───
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    ctx.fillStyle = 'rgb(22,20,30)';
    ctx.fill();
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    var bodyGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    bodyGrad.addColorStop(0, 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.22)');
    bodyGrad.addColorStop(0.5, 'rgba(30,26,40,0.95)');
    bodyGrad.addColorStop(1, 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.18)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // ── Paper texture (FULL only, skip at small sizes) ──────────
    if (w >= 80) {
      ctx.save();
      _roundRect(ctx, -hw, -hh, w, h, borderR);
      ctx.clip();
      ctx.globalAlpha = 0.08;
      for (var ty = -hh; ty < hh; ty += 4) {
        for (var tx = -hw; tx < hw; tx += 4) {
          var v = ((tx * 7 + ty * 13) & 0xFF) / 255;
          if (v > 0.7) {
            ctx.fillStyle = 'rgba(200,190,170,' + (v * 0.15) + ')';
            ctx.fillRect(tx, ty, 2, 2);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Metallic sheen (FULL only, skip at small sizes) ─────────
    if (w >= 80) {
      ctx.save();
      _roundRect(ctx, -hw, -hh, w, h, borderR);
      ctx.clip();
      var sheenGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
      sheenGrad.addColorStop(0, 'transparent');
      sheenGrad.addColorStop(0.42, 'transparent');
      sheenGrad.addColorStop(0.48, 'rgba(220,200,140,0.06)');
      sheenGrad.addColorStop(0.52, 'rgba(220,200,140,0.04)');
      sheenGrad.addColorStop(0.58, 'transparent');
      sheenGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(-hw, -hh, w, h);
      ctx.restore();
    }

    // ── State/quality border ────────────────────────────────────
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    if (isRejecting) {
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255,60,60,0.5)';
      ctx.shadowBlur = 10;
    } else if (isStacked) {
      ctx.strokeStyle = '#f0d070';
      ctx.lineWidth = 2.5;
    } else if (isHover) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(28,255,155,0.35)';
      ctx.shadowBlur = 12;
    } else {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(128,0,128,0.25)';
      ctx.shadowBlur = 4;
    }
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // ── Cost badge (top-left circle) ────────────────────────────
    if (costVal !== null && costVal !== undefined) {
      var costR = Math.max(8, Math.floor(w * 0.11));
      var costX = -hw + costR + 4;
      var costY = -hh + costR + 4;
      ctx.beginPath();
      ctx.arc(costX, costY, costR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = 'bold ' + Math.floor(costR * 1.2) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgb(' + rc.r + ',' + rc.g + ',' + rc.b + ')';
      ctx.fillText(String(costVal), costX, costY);
    }

    // ── Suit portholes ──────────────────────────────────────────
    _drawSuitPortholes(ctx, card, w, h, costVal);

    // ── Stack position badge ────────────────────────────────────
    if (isStacked && typeof CardStack !== 'undefined') {
      var stack = CardStack.getStack();
      for (var s = 0; s < stack.length; s++) {
        if (stack[s].handIndex === opts.handIndex) {
          var badge = String(s + 1);
          var badgeSize = Math.max(8, Math.floor(h * 0.09));
          ctx.font = 'bold ' + badgeSize + 'px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(240,208,112,0.9)';
          ctx.beginPath();
          ctx.arc(hw - badgeSize, -hh + badgeSize, badgeSize * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1a1520';
          ctx.fillText(badge, hw - badgeSize, -hh + badgeSize);
          break;
        }
      }
    }

    // ── Emoji artwork ───────────────────────────────────────────
    if (card.emoji) {
      var emojiSize = Math.floor(h * 0.28);
      ctx.font = emojiSize + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(card.emoji, 0, -hh * 0.08);
    }

    // ── Card name (bottom, dark bar) ────────────────────────────
    _drawNameBar(ctx, card, w, h);

    // ── Type/tag line (small, above name bar) ───────────────────
    if (card.type || (card.tags && card.tags.length)) {
      var tagSize = Math.max(5, Math.floor(h * 0.06));
      ctx.font = tagSize + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      var tagText = card.type || '';
      if (card.tags && card.tags.length) tagText = card.tags.join(' \u00b7 ');
      var nameBarH2 = Math.max(16, Math.floor(h * 0.14));
      ctx.fillText(tagText, 0, hh - nameBarH2 - 2);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  MEDIUM LOD — inventory/menu slot card (recognizable minicard)
  // ════════════════════════════════════════════════════════════════

  function _drawMedium(ctx, card, w, h, opts) {
    var hw = w / 2;
    var hh = h / 2;
    var borderR = Math.max(3, w * 0.06);
    var rc = _getResColor(card);
    var borderColor = _getBorderColor(card);
    var isHover = opts.isHover || false;
    var costVal = _getCostVal(card);
    var sd = _getSuitData(card);

    // ── Card body: dark base + resource tint ────────────────────
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    ctx.fillStyle = 'rgb(22,20,30)';
    ctx.fill();

    // Resource gradient (subtler than FULL)
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    var bodyGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
    bodyGrad.addColorStop(0, 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.18)');
    bodyGrad.addColorStop(1, 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.10)');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // ── Border ──────────────────────────────────────────────────
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    if (isHover) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(28,255,155,0.3)';
      ctx.shadowBlur = 6;
    } else {
      ctx.strokeStyle = 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.4)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // ── Suit pip (top-left) ─────────────────────────────────────
    if (sd) {
      var pipSize = Math.max(7, Math.floor(w * 0.18));
      ctx.font = 'bold ' + pipSize + 'px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = sd.color;
      ctx.fillText(sd.sym, -hw + 3, -hh + 2);
    }

    // ── Cost (top-right) ────────────────────────────────────────
    if (costVal !== null && costVal !== undefined) {
      var costSize = Math.max(7, Math.floor(w * 0.16));
      ctx.font = 'bold ' + costSize + 'px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgb(' + rc.r + ',' + rc.g + ',' + rc.b + ')';
      ctx.fillText(String(costVal), hw - 3, -hh + 2);
    }

    // ── Emoji (centered, slightly above middle) ─────────────────
    if (card.emoji) {
      var emojiSize = Math.max(14, Math.floor(h * 0.30));
      ctx.font = emojiSize + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(card.emoji, 0, -hh * 0.08);
    }

    // ── Name (bottom, truncated) ────────────────────────────────
    _drawNameBar(ctx, card, w, h);
  }

  // ════════════════════════════════════════════════════════════════
  //  SMALL LOD — bag/stash grid tile (icon + suit dot)
  // ════════════════════════════════════════════════════════════════

  function _drawSmall(ctx, card, w, h, opts) {
    var hw = w / 2;
    var hh = h / 2;
    var borderR = Math.max(2, w * 0.06);
    var rc = _getResColor(card);
    var isHover = opts.isHover || false;
    var sd = _getSuitData(card);

    // ── Body ────────────────────────────────────────────────────
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    ctx.fillStyle = 'rgb(18,16,26)';
    ctx.fill();

    // ── Border — resource tint or purple for cards ──────────────
    _roundRect(ctx, -hw, -hh, w, h, borderR);
    if (isHover) {
      ctx.strokeStyle = 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.7)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(' + rc.r + ',' + rc.g + ',' + rc.b + ',0.3)';
      ctx.shadowBlur = 4;
    } else {
      ctx.strokeStyle = 'rgba(180,100,255,0.3)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // ── Emoji (centered) ────────────────────────────────────────
    if (card.emoji) {
      var emojiSize = Math.max(12, Math.floor(h * 0.40));
      ctx.font = emojiSize + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(card.emoji, 0, -2);
    }

    // ── Suit dot (bottom-center) ────────────────────────────────
    if (sd) {
      var dotR = Math.max(2, Math.floor(w * 0.06));
      ctx.beginPath();
      ctx.arc(0, hh - dotR - 3, dotR, 0, Math.PI * 2);
      ctx.fillStyle = sd.color;
      ctx.fill();
    }

    // ── Abbreviated name (bottom, very small) ───────────────────
    if (card.name) {
      var nameSize = Math.max(5, Math.floor(h * 0.12));
      ctx.font = nameSize + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      var abbr = card.name;
      if (abbr.length > 6) abbr = abbr.substring(0, 5) + '\u2026';
      ctx.fillText(abbr, 0, hh - 1);
    }
  }

  // ── Shared sub-renderers ────────────────────────────────────────

  function _drawSuitPortholes(ctx, card, w, h, costVal) {
    if (!card.suit) return;
    var sd = _getSuitData(card);
    if (!sd || !sd.sym) return;

    var hw = w / 2;
    var hh = h / 2;
    var borderColor = _getBorderColor(card);

    var phR = Math.max(7, Math.floor(w * 0.09));
    var phFont = Math.max(8, Math.floor(phR * 1.3));
    var phTLX = -hw + phR + 5;
    var phTLY = (costVal !== null && costVal !== undefined)
      ? -hh + Math.floor(h * 0.20) + phR
      : -hh + phR + 5;

    // TL porthole
    ctx.beginPath();
    ctx.arc(phTLX, phTLY, phR + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,160,100,0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(phTLX, phTLY, phR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,8,18,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = 'bold ' + phFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = sd.color;
    ctx.fillText(sd.sym, phTLX, phTLY);

    // BR porthole (rotated 180°)
    var phBRX = hw - phR - 5;
    var phBRY = hh - phR - 5;
    ctx.beginPath();
    ctx.arc(phBRX, phBRY, phR + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,160,100,0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(phBRX, phBRY, phR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,8,18,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.translate(phBRX, phBRY);
    ctx.rotate(Math.PI);
    ctx.font = 'bold ' + phFont + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = sd.color;
    ctx.fillText(sd.sym, 0, 0);
    ctx.restore();
  }

  function _drawNameBar(ctx, card, w, h) {
    if (!card.name) return;
    var hw = w / 2;
    var hh = h / 2;
    var nameBarH = Math.max(12, Math.floor(h * 0.14));
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(-hw + 1, hh - nameBarH - 1, w - 2, nameBarH);
    var nameSize = Math.max(6, Math.floor(h * 0.085));
    ctx.font = 'bold ' + nameSize + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_NAME;
    var displayName = card.name;
    var maxNameW = w - 8;
    if (ctx.measureText(displayName).width > maxNameW) {
      while (displayName.length > 3 && ctx.measureText(displayName + '\u2026').width > maxNameW) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '\u2026';
    }
    ctx.fillText(displayName, 0, hh - nameBarH / 2 - 1);
  }

  // ════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════

  /**
   * Draw a card onto a canvas context at the specified LOD.
   *
   * The context should already be translated to the card's center point.
   * (Caller does ctx.save/translate/rotate before calling.)
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} card — card data object (name, emoji, suit, cost, type, tags, etc.)
   * @param {number} w — card width in canvas pixels
   * @param {number} h — card height in canvas pixels
   * @param {Object} [opts]
   * @param {string} [opts.lod='full'] — 'full', 'medium', or 'small'
   * @param {boolean} [opts.isHover=false]
   * @param {boolean} [opts.isStacked=false]
   * @param {boolean} [opts.isRejecting=false]
   * @param {number} [opts.handIndex] — for stack badge lookup (FULL only)
   */
  function drawCard(ctx, card, w, h, opts) {
    opts = opts || {};
    var lod = opts.lod || LOD_FULL;
    if (lod === LOD_SMALL) {
      _drawSmall(ctx, card, w, h, opts);
    } else if (lod === LOD_MEDIUM) {
      _drawMedium(ctx, card, w, h, opts);
    } else {
      _drawFull(ctx, card, w, h, opts);
    }
  }

  /**
   * Draw card for an item-like context (MenuFaces tile slot).
   * Wrapper that draws at MEDIUM or SMALL lod based on tile size,
   * with ctx translated to tile center.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} card
   * @param {number} cx — tile center x
   * @param {number} cy — tile center y
   * @param {number} tileW — tile width
   * @param {number} tileH — tile height
   * @param {boolean} isHover
   */
  function drawCardInTile(ctx, card, cx, cy, tileW, tileH, isHover) {
    var lod = (tileW >= 56) ? LOD_MEDIUM : LOD_SMALL;
    // Aspect ratio: cards are taller than wide. Within the square tile,
    // use ~75% width and proportional height, capped at tile height.
    var cardW = Math.floor(tileW * 0.80);
    var cardH = Math.min(Math.floor(cardW * 1.4), tileH - 2);
    ctx.save();
    ctx.translate(cx, cy);
    drawCard(ctx, card, cardW, cardH, { lod: lod, isHover: isHover });
    ctx.restore();
  }

  return Object.freeze({
    drawCard:       drawCard,
    drawCardInTile: drawCardInTile,
    LOD_FULL:       LOD_FULL,
    LOD_MEDIUM:     LOD_MEDIUM,
    LOD_SMALL:      LOD_SMALL
  });
})();

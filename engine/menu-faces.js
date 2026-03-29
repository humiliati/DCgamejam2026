/**
 * MenuFaces — face content renderers for the MenuBox.
 *
 * Each face renderer draws into the content area of a MenuBox face.
 * Signature: fn(ctx, x, y, w, h, context)
 *
 * Faces adapt to the current MenuBox context:
 *   'pause'   → standard pause menu (minimap, journal, inventory, system)
 *   'bonfire' → rest & stash management (stash, rest, stats, system)
 *   'shop'    → buy/sell interface (buy, sell/gamble, inventory, system)
 *
 * Layer 3 (depends on: MenuBox, Player, CardSystem, FloorManager,
 *          Minimap, HUD, i18n, SessionStats)
 *
 * Adapted from:
 *   - EyesOnly vendor-system.js: 5-item vendor inventory layout
 *   - EyesOnly shop-system.js: buy/sell panes with card display
 *   - EyesOnly arcade-vendor.js: fixed catalog + gamble carousel
 *   - GAME_FLOW_ROADMAP.md: 4-face content specs per context
 */
var MenuFaces = (function () {
  'use strict';

  // ── Colors ──────────────────────────────────────────────────────
  var COL = {
    title:    '#d0c8a0',
    text:     '#c0b890',
    dim:      '#888',
    accent:   '#f0d070',
    hp:       '#4a4',
    energy:   '#48c',
    currency: '#fd0',
    slot_bg:  'rgba(255,255,255,0.06)',
    slot_sel: 'rgba(240,208,112,0.15)',
    slot_hover: 'rgba(240,208,112,0.10)',
    divider:  'rgba(255,255,255,0.1)'
  };

  // ── Click hit zones ───────────────────────────────────────────
  // Rebuilt every render frame; each entry: { x, y, w, h, slot }
  var _hitZones = [];
  var _hoverSlot = -1;   // slot index under pointer, or -1

  // ── Shared helpers ──────────────────────────────────────────────

  function _drawTitle(ctx, x, y, w, text, emoji) {
    ctx.fillStyle = COL.title;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText((emoji ? emoji + ' ' : '') + text, x + w / 2, y + 14);
    // Divider line
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 22);
    ctx.lineTo(x + w - 10, y + 22);
    ctx.stroke();
    return y + 30; // Return Y after header
  }

  function _drawStat(ctx, x, y, label, value, color) {
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COL.dim;
    ctx.fillText(label, x, y);
    ctx.fillStyle = color || COL.text;
    ctx.textAlign = 'right';
    ctx.fillText('' + value, x + 140, y);
    ctx.textAlign = 'left';
  }

  function _drawSlot(ctx, x, y, w, h, label, emoji, selected) {
    ctx.fillStyle = selected ? COL.slot_sel : COL.slot_bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    if (emoji) {
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(emoji, x + w / 2, y + 22);
    }
    if (label) {
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = COL.dim;
      ctx.fillText(label, x + w / 2, y + h - 4);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  FACE 0 — MINIMAP / REST
  // ═══════════════════════════════════════════════════════════════

  /**
   * Pause: scaled minimap
   * Bonfire: rest status + floor info
   * Shop: vendor info
   */
  function renderFace0(ctx, x, y, w, h, context) {
    if (context === 'bonfire') {
      _renderBonfireRest(ctx, x, y, w, h);
    } else if (context === 'shop') {
      _renderShopInfo(ctx, x, y, w, h);
    } else if (context === 'harvest') {
      _renderHarvestLoot(ctx, x, y, w, h);
    } else {
      _renderMinimap(ctx, x, y, w, h);
    }
  }

  function _renderMinimap(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face0', 'MAP'), '🗺️');

    // Minimap.renderToCanvas() hook — placeholder until Minimap exposes it
    ctx.fillStyle = COL.dim;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('menu.minimap_placeholder', 'Minimap — Floor ' + FloorManager.getFloor()),
                 x + w / 2, ty + 40);

    // Floor info
    ctx.fillStyle = COL.text;
    ctx.fillText(FloorManager.getFloorLabel(), x + w / 2, ty + 60);
    ctx.fillStyle = COL.dim;
    ctx.fillText('Depth: ' + FloorManager.getFloor(), x + w / 2, ty + 78);
  }

  function _renderBonfireRest(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.bonfire_title', 'BONFIRE'), '🔥');

    var ps = Player.state();

    // HP/Energy bars
    var barW = Math.min(w - 40, 180);
    var barH = 12;
    var barX = x + (w - barW) / 2;

    // HP bar
    ctx.fillStyle = COL.dim;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HP', barX - 22, ty + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(barX, ty + 2, barW, barH);
    var hpPct = ps.hp / ps.maxHp;
    ctx.fillStyle = hpPct > 0.6 ? COL.hp : (hpPct > 0.3 ? '#c80' : '#c44');
    ctx.fillRect(barX, ty + 2, barW * hpPct, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ps.hp + '/' + ps.maxHp, barX + barW / 2, ty + 12);

    // Energy bar
    ty += 22;
    ctx.fillStyle = COL.dim;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('EN', barX - 22, ty + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(barX, ty + 2, barW, barH);
    ctx.fillStyle = COL.energy;
    ctx.fillRect(barX, ty + 2, barW * (ps.energy / ps.maxEnergy), barH);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ps.energy + '/' + ps.maxEnergy, barX + barW / 2, ty + 12);

    // Status text
    ty += 30;
    ctx.fillStyle = COL.accent;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.bonfire_restored', 'HP & Energy restored'), x + w / 2, ty + 10);

    // Floor info
    ty += 26;
    ctx.fillStyle = COL.dim;
    ctx.fillText(FloorManager.getFloorLabel() + ' — ' + FloorManager.getCurrentFloorId(),
                 x + w / 2, ty + 10);

    // Hint
    ty += 30;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.fillText(i18n.t('shop.bonfire_hint', '[ESC] Close   [Q/E] Browse'),
                 x + w / 2, ty + 10);
  }

  function _renderShopInfo(ctx, x, y, w, h) {
    // ── Faction identity ─────────────────────────────────────────
    var factionId    = (typeof Shop !== 'undefined') ? Shop.getCurrentFaction() : null;
    var factionLabel = (typeof Shop !== 'undefined') ? Shop.getFactionLabel(factionId) : i18n.t('shop.vendor_name', 'MERCHANT');
    var factionEmoji = (typeof Shop !== 'undefined') ? Shop.getFactionEmoji(factionId) : '🏪';

    var ty = _drawTitle(ctx, x, y, w, factionLabel.toUpperCase(), factionEmoji);

    // ── Rep tiers ────────────────────────────────────────────────
    var REP_NAMES = [
      i18n.t('shop.rep0', 'Stranger'),
      i18n.t('shop.rep1', 'Associate'),
      i18n.t('shop.rep2', 'Ally'),
      i18n.t('shop.rep3', 'Trusted')
    ];
    var REP_COLORS = ['#888', '#8af', '#4c8', '#fd0'];
    var allTiers = (typeof Shop !== 'undefined') ? Shop.getAllRepTiers() : { tide: 0, foundry: 0, admiralty: 0 };
    var factions = [
      { id: 'tide',      emoji: '🐉', label: i18n.t('faction.tide', 'Tide') },
      { id: 'foundry',   emoji: '⚙️', label: i18n.t('faction.foundry', 'Foundry') },
      { id: 'admiralty', emoji: '🌊', label: i18n.t('faction.admiralty', 'Admiralty') }
    ];

    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    for (var fi = 0; fi < factions.length; fi++) {
      var fd = factions[fi];
      var tier = allTiers[fd.id] || 0;
      var rowY = ty + fi * 22;
      var active = (fd.id === factionId);

      // Highlight active faction row
      if (active) {
        ctx.fillStyle = 'rgba(240,208,112,0.10)';
        ctx.fillRect(x + 6, rowY - 10, w - 12, 18);
      }

      ctx.font = '10px monospace';
      ctx.fillStyle = active ? COL.accent : COL.dim;
      ctx.textAlign = 'left';
      ctx.fillText(fd.emoji + ' ' + fd.label, x + 10, rowY + 2);
      ctx.fillStyle = REP_COLORS[tier];
      ctx.textAlign = 'right';
      ctx.fillText(REP_NAMES[tier], x + w - 8, rowY + 2);
    }
    ty += factions.length * 22 + 10;

    // Divider
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, ty); ctx.lineTo(x + w - 10, ty);
    ctx.stroke();
    ty += 12;

    // ── Currency ─────────────────────────────────────────────────
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💰 ' + Player.state().currency + ' ' + i18n.t('shop.currency', 'gold'),
                 x + w / 2, ty);

    // ── Current rep tier badge ───────────────────────────────────
    ty += 20;
    var curTier = (typeof Shop !== 'undefined') ? Shop.getRepTier() : 0;
    ctx.fillStyle = REP_COLORS[curTier];
    ctx.font = '11px monospace';
    ctx.fillText(factionEmoji + ' ' + REP_NAMES[curTier] + ' (Tier ' + curTier + ')',
                 x + w / 2, ty);

    // ── Hint ─────────────────────────────────────────────────────
    ty += 24;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.fillText(i18n.t('shop.browse_hint', '[Q/E] Browse panes   [ESC] Leave'),
                 x + w / 2, ty);
  }

  // ── Harvest: Corpse Loot (Face 0 in harvest context) ────────

  // ── Tile rendering helper ──────────────────────────────────────
  // Shared by harvest, shop buy, shop sell — grid of clickable tiles
  // with emoji icon, name label, and optional value/price tag.

  var TILE_SIZE = 56;     // px square (fits 3 across in ~230px content)
  var TILE_GAP  = 6;      // gap between tiles
  var TILE_RAD  = 4;      // corner radius

  /**
   * Draw an empty placeholder tile (EyesOnly dashed-border pattern).
   * Dashed border, dim slot number, "EMPTY" label, low opacity.
   */
  function _drawEmptyTile(ctx, tx, ty, slotIdx, opts) {
    var ts = TILE_SIZE;
    opts = opts || {};

    // Subtle dark background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    _roundRectFill(ctx, tx, ty, ts, ts, TILE_RAD);

    // Dashed border (EyesOnly empty-slot pattern)
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    _roundRectStroke(ctx, tx, ty, ts, ts, TILE_RAD);
    ctx.setLineDash([]);

    // Slot number (centered, dim)
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText(slotIdx < 10 ? '0' + (slotIdx + 1) : '' + (slotIdx + 1),
                 tx + ts / 2, ty + ts / 2 - 2);

    // "EMPTY" label
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillText(opts.label || 'EMPTY', tx + ts / 2, ty + ts / 2 + 10);

    // Fade hint on last slot (suggests expandability)
    if (opts.fadeHint) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      _roundRectFill(ctx, tx, ty, ts, ts, TILE_RAD);
    }
  }

  /**
   * Draw an occupied item tile with emoji icon, name, and optional tags.
   * Adapts EyesOnly's phosphor-glow occupied slot styling.
   */
  function _drawItemTile(ctx, tx, ty, item, slotIdx, isHover, opts) {
    var ts = TILE_SIZE;
    opts = opts || {};

    // Tile background — phosphor glow when hovered
    ctx.fillStyle = isHover ? 'rgba(51,255,136,0.08)' : COL.slot_bg;
    _roundRectFill(ctx, tx, ty, ts, ts, TILE_RAD);

    // Border — phosphor accent on hover, dim solid otherwise
    if (isHover) {
      ctx.strokeStyle = COL.accent;
      ctx.lineWidth = 1.5;
      // Glow shadow effect
      ctx.shadowColor = 'rgba(240,208,112,0.25)';
      ctx.shadowBlur = 6;
      _roundRectStroke(ctx, tx, ty, ts, ts, TILE_RAD);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      _roundRectStroke(ctx, tx, ty, ts, ts, TILE_RAD);
    }

    // Large emoji icon (centered, upper area)
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(item.emoji || '?', tx + ts / 2, ty + 18);
    ctx.textBaseline = 'alphabetic';

    // Item name (truncated, below icon)
    ctx.font = '8px monospace';
    ctx.fillStyle = isHover ? '#fff' : COL.text;
    var name = item.name || '';
    if (name.length > 8) name = name.substring(0, 7) + '…';
    ctx.fillText(name, tx + ts / 2, ty + 36);

    // Value/price tag (bottom of tile)
    if (opts.priceText) {
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = opts.priceColor || COL.currency;
      ctx.fillText(opts.priceText, tx + ts / 2, ty + ts - 4);
    }

    // Rarity dot (top-right corner)
    if (opts.rarityColor) {
      ctx.fillStyle = opts.rarityColor;
      ctx.beginPath();
      ctx.arc(tx + ts - 6, ty + 6, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slot key hint (top-left, dim)
    if (slotIdx < 5) {
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.textAlign = 'left';
      ctx.fillText('' + (slotIdx + 1), tx + 3, ty + 9);
      ctx.textAlign = 'center';
    }

    // "SOLD" overlay
    if (opts.sold) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      _roundRectFill(ctx, tx, ty, ts, ts, TILE_RAD);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      _roundRectStroke(ctx, tx, ty, ts, ts, TILE_RAD);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '8px monospace';
      ctx.fillText('SOLD', tx + ts / 2, ty + ts / 2 + 3);
    }

    // "Can't afford" dim overlay
    if (opts.dimmed && !opts.sold) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      _roundRectFill(ctx, tx, ty, ts, ts, TILE_RAD);
    }
  }

  function _roundRectFill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  function _roundRectStroke(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();
  }

  /**
   * Lay out a grid of tiles, centered in the available width.
   * Returns an array of { x, y, col, row } positions.
   */
  function _gridLayout(startX, startY, availW, count) {
    var cols = Math.max(1, Math.floor((availW + TILE_GAP) / (TILE_SIZE + TILE_GAP)));
    var gridW = cols * TILE_SIZE + (cols - 1) * TILE_GAP;
    var offsetX = startX + (availW - gridW) / 2;
    var positions = [];
    for (var i = 0; i < count; i++) {
      var c = i % cols;
      var r = Math.floor(i / cols);
      positions.push({
        x: offsetX + c * (TILE_SIZE + TILE_GAP),
        y: startY + r * (TILE_SIZE + TILE_GAP),
        col: c, row: r
      });
    }
    return positions;
  }

  // ── Harvest: Corpse Loot (Face 0 in harvest context) ────────

  function _renderHarvestLoot(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, 'REMAINS', '💀');

    // Get staged loot from Salvage
    var loot = (typeof Salvage !== 'undefined') ? Salvage.getStagedLoot() : [];

    if (loot.length === 0) {
      ctx.fillStyle = COL.dim;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Nothing remains.', x + w / 2, ty + 40);
      return;
    }

    // Hint text
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('harvest.hint', 'Click to take'), x + w / 2, ty + 10);
    ty += 18;

    // Grid of item tiles
    var count = Math.min(5, loot.length);
    var positions = _gridLayout(x, ty, w, count);

    for (var i = 0; i < count; i++) {
      var item = loot[i];
      var pos = positions[i];

      // Register hit zone
      _hitZones.push({ x: pos.x, y: pos.y, w: TILE_SIZE, h: TILE_SIZE, slot: i, action: 'harvest' });

      _drawItemTile(ctx, pos.x, pos.y, item, i, _hoverSlot === i, {
        priceText: item.baseValue + 'g',
        priceColor: COL.currency
      });
    }

    ctx.textAlign = 'center';

    // Bottom hint
    var lastRow = positions.length > 0 ? positions[positions.length - 1].row : 0;
    var hintY = ty + (lastRow + 1) * (TILE_SIZE + TILE_GAP) + 8;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.fillText('[Q/E] View bag   [ESC] Leave', x + w / 2, hintY);
    ctx.textAlign = 'left';
  }

  // ── Harvest: Player Bag (Face 1 in harvest context) ─────────

  function _renderHarvestBag(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, 'BAG', '🎒');

    var bag = Player.getBag();
    var maxBag = Player.MAX_BAG;

    // Capacity header
    ctx.fillStyle = COL.dim;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bag.length + ' / ' + maxBag + ' slots', x + w / 2, ty + 12);
    ty += 22;

    if (bag.length === 0) {
      ctx.fillStyle = COL.dim;
      ctx.font = '11px monospace';
      ctx.fillText('Empty', x + w / 2, ty + 20);
      return;
    }

    // Bag grid (4 columns)
    var cols = 4;
    var rows = Math.ceil(bag.length / cols);
    var slotSize = Math.min(Math.floor((w - 20) / cols), 36);
    var gridW2 = cols * (slotSize + 4);
    var gridX = x + (w - gridW2) / 2;

    for (var i = 0; i < bag.length; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var sx = gridX + col * (slotSize + 4);
      var sy = ty + row * (slotSize + 4);
      var bagItem = bag[i];

      _drawSlot(ctx, sx, sy, slotSize, slotSize,
                bagItem ? (bagItem.name || bagItem.id) : '',
                bagItem ? bagItem.emoji : null,
                false);
    }

    // Empty slots
    for (var j = bag.length; j < maxBag && j < bag.length + 4; j++) {
      var r2 = Math.floor(j / cols);
      var c2 = j % cols;
      var sx2 = gridX + c2 * (slotSize + 4);
      var sy2 = ty + r2 * (slotSize + 4);
      _drawSlot(ctx, sx2, sy2, slotSize, slotSize, '', null, false);
    }

    // Currency
    var curY = ty + (rows + 1) * (slotSize + 4) + 4;
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💰 ' + Player.state().currency, x + w / 2, curY);
  }

  // ═══════════════════════════════════════════════════════════════
  //  FACE 1 — STASH / BUY
  // ═══════════════════════════════════════════════════════════════

  /**
   * Pause: journal/skills (placeholder)
   * Bonfire: stash management grid
   * Shop: buy pane — vendor inventory
   */
  function renderFace1(ctx, x, y, w, h, context) {
    if (context === 'bonfire') {
      _renderStash(ctx, x, y, w, h);
    } else if (context === 'shop') {
      _renderShopBuy(ctx, x, y, w, h);
    } else if (context === 'harvest') {
      _renderHarvestBag(ctx, x, y, w, h);
    } else {
      _renderJournal(ctx, x, y, w, h);
    }
  }

  function _renderJournal(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face1', 'JOURNAL'), '📖');
    ctx.fillStyle = COL.dim;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('menu.journal_placeholder', 'No entries yet.'), x + w / 2, ty + 30);
  }

  function _renderStash(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.stash_title', 'STASH'), '📦');

    // Stash description
    ctx.fillStyle = COL.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.stash_desc', 'Items stored here survive death'),
                 x + w / 2, ty + 12);

    // Stash grid (4×5 = 20 slots)
    var cols = 4;
    var rows = 5;
    var slotSize = Math.min(Math.floor((w - 20) / cols), Math.floor((h - 80) / rows), 36);
    var gridW = cols * (slotSize + 4);
    var gridX = x + (w - gridW) / 2;
    var gridY = ty + 24;

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col;
        var sx = gridX + col * (slotSize + 4);
        var sy = gridY + row * (slotSize + 4);

        // TODO: Check Player.getStash()[idx] when inventory model is built
        _drawSlot(ctx, sx, sy, slotSize, slotSize,
                  '' + (idx + 1), null, false);
      }
    }

    // Capacity
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0 / 20 ' + i18n.t('shop.stash_capacity', 'slots'),
                 x + w / 2, gridY + rows * (slotSize + 4) + 12);
  }

  function _renderShopBuy(ctx, x, y, w, h) {
    var factionEmoji = (typeof Shop !== 'undefined') ? Shop.getFactionEmoji(Shop.getCurrentFaction()) : '🛒';
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.buy_title', 'BUY CARDS'), factionEmoji);

    var currency = Player.state().currency;

    // Currency display
    ctx.fillStyle = COL.currency;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('💰 ' + currency, x + w - 8, ty + 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.fillText(i18n.t('shop.buy_hint', 'Click to buy'), x + w / 2, ty + 12);
    ty += 22;

    // Live inventory from Shop module
    var inv = (typeof Shop !== 'undefined') ? Shop.getInventory() : [];

    // Rarity colours for badge
    var RARITY_COL = {
      common: '#aaa', uncommon: '#4cf', rare: '#c8f',
      epic: '#fa4', legendary: '#ff0'
    };

    // Build tile data
    var tiles = [];
    for (var i = 0; i < 5; i++) {
      var slot  = inv[i];
      var card  = slot ? slot.card  : null;
      var price = slot ? slot.price : 0;
      var sold  = slot ? slot.sold  : true;
      var canAfford = !sold && card && currency >= price;

      tiles.push({
        emoji: card ? card.emoji : '?',
        name: card ? card.name : '',
        card: card, price: price, sold: sold,
        canAfford: canAfford,
        rarity: card ? card.rarity : null
      });
    }

    var positions = _gridLayout(x, ty, w, 5);

    for (var j = 0; j < 5; j++) {
      var t = tiles[j];
      var pos = positions[j];

      if (!t.card && !t.sold) {
        // No item in this slot — empty placeholder
        _drawEmptyTile(ctx, pos.x, pos.y, j);
      } else if (t.sold) {
        // Was here, now sold — show item ghost with SOLD overlay
        _drawItemTile(ctx, pos.x, pos.y, t, j, false, { sold: true });
      } else {
        // Active item — clickable if affordable
        if (t.canAfford) {
          _hitZones.push({ x: pos.x, y: pos.y, w: TILE_SIZE, h: TILE_SIZE, slot: j, action: 'buy' });
        }
        _drawItemTile(ctx, pos.x, pos.y, t, j, t.canAfford && (_hoverSlot === j), {
          priceText: t.price + 'g',
          priceColor: t.canAfford ? COL.currency : '#844',
          rarityColor: RARITY_COL[t.rarity] || '#aaa',
          dimmed: !t.canAfford
        });
      }
    }

    ctx.textAlign = 'center';
    var lastRow = positions.length > 0 ? positions[positions.length - 1].row : 0;
    var hintY = ty + (lastRow + 1) * (TILE_SIZE + TILE_GAP) + 8;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.fillText('[Q/E] Switch pane   [ESC] Leave', x + w / 2, hintY);
    ctx.textAlign = 'left';
  }

  // ═══════════════════════════════════════════════════════════════
  //  FACE 2 — INVENTORY / SELL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Pause: equipment & inventory
   * Bonfire: hand/bag management (move items to/from stash)
   * Shop: sell pane — player inventory for selling
   */
  function renderFace2(ctx, x, y, w, h, context) {
    if (context === 'bonfire') {
      _renderBag(ctx, x, y, w, h);
    } else if (context === 'shop') {
      _renderShopSell(ctx, x, y, w, h);
    } else if (context === 'harvest') {
      _renderInventory(ctx, x, y, w, h);
    } else {
      _renderInventory(ctx, x, y, w, h);
    }
  }

  // ── Equipped slot labels (matches Player.EQUIP_SLOTS order) ──
  var EQUIP_LABELS = ['⚔ Weapon', '🧪 Consumable', '🗝 Key'];
  var EQUIP_SLOT_W = 56;
  var EQUIP_SLOT_H = 42;

  function _renderInventory(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face2', 'INVENTORY'), '🎒');
    var ps = Player.state();

    // ── Section 1: Equipped quick-slots (3 across) ──────────────
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EQUIPPED', x + w / 2, ty + 10);
    ty += 16;

    var eqTotalW = 3 * EQUIP_SLOT_W + 2 * 6;
    var eqX = x + (w - eqTotalW) / 2;

    var equipped = Player.getEquipped();
    for (var e = 0; e < 3; e++) {
      var sx = eqX + e * (EQUIP_SLOT_W + 6);
      var item = equipped[e];

      if (item) {
        // Occupied — draw item tile (compact)
        ctx.fillStyle = (_hoverSlot === (100 + e)) ? 'rgba(51,255,136,0.08)' : COL.slot_bg;
        _roundRectFill(ctx, sx, ty, EQUIP_SLOT_W, EQUIP_SLOT_H, 4);
        ctx.strokeStyle = (_hoverSlot === (100 + e)) ? COL.accent : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        _roundRectStroke(ctx, sx, ty, EQUIP_SLOT_W, EQUIP_SLOT_H, 4);

        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(item.emoji || '?', sx + EQUIP_SLOT_W / 2, ty + 18);
        ctx.font = '7px monospace';
        ctx.fillStyle = COL.text;
        var iName = item.name || '';
        if (iName.length > 8) iName = iName.substring(0, 7) + '…';
        ctx.fillText(iName, sx + EQUIP_SLOT_W / 2, ty + 32);
        ctx.font = '6px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('[UNEQUIP]', sx + EQUIP_SLOT_W / 2, ty + EQUIP_SLOT_H - 2);

        // Hit zone: click to unequip (slot 100+ to avoid collision with bag slots)
        _hitZones.push({ x: sx, y: ty, w: EQUIP_SLOT_W, h: EQUIP_SLOT_H, slot: 100 + e, action: 'unequip' });
      } else {
        // Empty — dashed border with slot label
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        _roundRectStroke(ctx, sx, ty, EQUIP_SLOT_W, EQUIP_SLOT_H, 4);
        ctx.setLineDash([]);
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillText(EQUIP_LABELS[e], sx + EQUIP_SLOT_W / 2, ty + EQUIP_SLOT_H / 2 + 3);
      }
    }

    ty += EQUIP_SLOT_H + 8;

    // ── Section 2: Bag grid (4 cols, live data) ─────────────────
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    var bag = Player.getBag();
    ctx.fillText('BAG  ' + bag.length + '/' + Player.MAX_BAG, x + w / 2, ty + 10);
    ty += 16;

    var bagCols = 4;
    var bagSlotS = Math.min(Math.floor((w - 20) / bagCols) - 4, TILE_SIZE);
    var bagGridW = bagCols * (bagSlotS + 4);
    var bagGridX = x + (w - bagGridW) / 2;

    // Draw bag items
    var bagRows = Math.max(2, Math.ceil(Player.MAX_BAG / bagCols));
    for (var r = 0; r < bagRows; r++) {
      for (var c = 0; c < bagCols; c++) {
        var bi = r * bagCols + c;
        if (bi >= Player.MAX_BAG) break;
        var bsx = bagGridX + c * (bagSlotS + 4);
        var bsy = ty + r * (bagSlotS + 4);
        var bagItem = bag[bi];

        if (bagItem) {
          // Compact item tile
          var isHov = (_hoverSlot === (200 + bi));
          ctx.fillStyle = isHov ? 'rgba(51,255,136,0.08)' : COL.slot_bg;
          _roundRectFill(ctx, bsx, bsy, bagSlotS, bagSlotS, 4);
          ctx.strokeStyle = isHov ? COL.accent : 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, bsx, bsy, bagSlotS, bagSlotS, 4);

          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(bagItem.emoji || '?', bsx + bagSlotS / 2, bsy + bagSlotS / 2 + 2);

          ctx.font = '6px monospace';
          ctx.fillStyle = COL.text;
          var bName = bagItem.name || '';
          if (bName.length > 7) bName = bName.substring(0, 6) + '…';
          ctx.fillText(bName, bsx + bagSlotS / 2, bsy + bagSlotS - 3);

          // Hit zone: click to equip (slot 200+ to avoid collision)
          _hitZones.push({ x: bsx, y: bsy, w: bagSlotS, h: bagSlotS, slot: 200 + bi, action: 'equip' });
        } else {
          // Empty slot
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, bsx, bsy, bagSlotS, bagSlotS, 4);
          ctx.setLineDash([]);
        }
      }
    }

    ty += bagRows * (bagSlotS + 4) + 6;

    // ── Section 3: Currency + hand count ────────────────────────
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💰 ' + ps.currency, x + w / 2 - 40, ty + 10);
    ctx.fillStyle = '#800080';
    var hand = CardSystem.getHand();
    ctx.fillText('🂠 ' + hand.length + '/5', x + w / 2 + 40, ty + 10);

    // ── Bottom hint ─────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.fillText('[Click] Equip/Unequip   [Q/E] Rotate', x + w / 2, ty + 26);
    ctx.textAlign = 'left';
  }

  function _renderBag(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.bag_title', 'BAG → STASH'), '🎒');
    var bag = Player.getBag();

    ctx.fillStyle = COL.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.bag_desc', 'Click item to move to stash'),
                 x + w / 2, ty + 12);
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.fillText(bag.length + ' / ' + Player.MAX_BAG + ' ' + i18n.t('shop.bag_capacity', 'slots'),
                 x + w / 2, ty + 24);
    ty += 32;

    // Bag grid (4×3 = 12 slots) with live data
    var cols = 4;
    var slotSize = Math.min(Math.floor((w - 20) / cols) - 4, TILE_SIZE);
    var gridW = cols * (slotSize + 4);
    var gridX = x + (w - gridW) / 2;

    var totalSlots = Player.MAX_BAG;
    var rows = Math.ceil(totalSlots / cols);

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col;
        if (idx >= totalSlots) break;
        var sx = gridX + col * (slotSize + 4);
        var sy = ty + row * (slotSize + 4);
        var bagItem = bag[idx];

        if (bagItem) {
          var isHov = (_hoverSlot === (300 + idx));
          ctx.fillStyle = isHov ? 'rgba(51,255,136,0.08)' : COL.slot_bg;
          _roundRectFill(ctx, sx, sy, slotSize, slotSize, 4);
          ctx.strokeStyle = isHov ? COL.accent : 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, sx, sy, slotSize, slotSize, 4);

          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(bagItem.emoji || '?', sx + slotSize / 2, sy + slotSize / 2 + 2);

          ctx.font = '6px monospace';
          ctx.fillStyle = COL.text;
          var nm = bagItem.name || '';
          if (nm.length > 7) nm = nm.substring(0, 6) + '…';
          ctx.fillText(nm, sx + slotSize / 2, sy + slotSize - 3);

          // Click to move to stash (slot 300+ to avoid collision)
          _hitZones.push({ x: sx, y: sy, w: slotSize, h: slotSize, slot: 300 + idx, action: 'stash' });
        } else {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, sx, sy, slotSize, slotSize, 4);
          ctx.setLineDash([]);
        }
      }
    }

    // Bottom hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    var hintY = ty + rows * (slotSize + 4) + 8;
    ctx.fillText('[Click] Move to stash   [Q/E] Rotate', x + w / 2, hintY);
    ctx.textAlign = 'left';
  }

  function _renderShopSell(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.sell_title', 'SELL'), '💰');
    var factionId = (typeof Shop !== 'undefined') ? Shop.getCurrentFaction() : null;

    // Currency display
    ctx.fillStyle = COL.currency;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('💰 ' + Player.state().currency, x + w - 8, ty + 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.fillText(i18n.t('shop.sell_hint', 'Click to sell'), x + w / 2, ty + 12);
    ty += 20;

    // ── Card sell row (hand cards) ──────────────────────────────
    ctx.fillStyle = COL.dim;
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CARDS', x + 8, ty + 8);
    ty += 12;

    var SELL_VALUE = { common: 12, uncommon: 24, rare: 40, epic: 72, legendary: 120 };
    var RARITY_COL = {
      common: '#aaa', uncommon: '#4cf', rare: '#c8f',
      epic: '#fa4', legendary: '#ff0'
    };

    var hand = CardSystem.getHand();
    var positions = _gridLayout(x, ty, w, 5);

    for (var i = 0; i < 5; i++) {
      var card = hand[i];
      var pos = positions[i];

      if (card) {
        _hitZones.push({ x: pos.x, y: pos.y, w: TILE_SIZE, h: TILE_SIZE, slot: i, action: 'sell' });

        var sv = SELL_VALUE[card.rarity] || 12;
        _drawItemTile(ctx, pos.x, pos.y, card, i, _hoverSlot === i, {
          priceText: '+' + sv + 'g',
          priceColor: COL.currency,
          rarityColor: RARITY_COL[card.rarity] || '#aaa'
        });
      } else {
        _drawEmptyTile(ctx, pos.x, pos.y, i);
      }
    }

    var lastCardRow = positions.length > 0 ? positions[positions.length - 1].row : 0;
    ty += (lastCardRow + 1) * (TILE_SIZE + TILE_GAP) + 4;

    // ── Salvage parts sell section (bag items with type 'salvage') ──
    var bag = Player.getBag();
    var salvageParts = [];
    var salvageIndices = [];
    for (var b = 0; b < bag.length; b++) {
      if (bag[b] && bag[b].type === 'salvage') {
        salvageParts.push(bag[b]);
        salvageIndices.push(b);
      }
    }

    // Section header
    ctx.fillStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, ty);
    ctx.lineTo(x + w - 10, ty);
    ctx.stroke();
    ty += 6;

    ctx.fillStyle = COL.dim;
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SALVAGE PARTS', x + 8, ty + 8);
    if (factionId) {
      ctx.textAlign = 'right';
      var fEmoji = (typeof Shop !== 'undefined') ? Shop.getFactionEmoji(factionId) : '';
      ctx.fillText(fEmoji + ' ' + (factionId || ''), x + w - 8, ty + 8);
    }
    ty += 14;

    if (salvageParts.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px monospace';
      ctx.fillText(i18n.t('shop.no_parts', 'No salvage parts in bag'), x + w / 2, ty + 10);
    } else {
      var partPositions = _gridLayout(x, ty, w, salvageParts.length);

      for (var p = 0; p < salvageParts.length; p++) {
        var part = salvageParts[p];
        var pPos = partPositions[p];
        var sellPrice = (typeof Salvage !== 'undefined' && factionId)
          ? Salvage.getSellPrice(part, factionId) : (part.baseValue || 1);

        // Slot = 400 + bagIndex (strip offset in game.js)
        _hitZones.push({
          x: pPos.x, y: pPos.y, w: TILE_SIZE, h: TILE_SIZE,
          slot: 400 + salvageIndices[p], action: 'sellPart'
        });

        _drawItemTile(ctx, pPos.x, pPos.y, part, p, _hoverSlot === (400 + salvageIndices[p]), {
          priceText: '+' + sellPrice + 'g',
          priceColor: COL.currency
        });
      }
    }

    // Bottom hint
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.fillText('[Q/E] Switch pane   [ESC] Leave', x + w / 2, y + h - 8);
    ctx.textAlign = 'left';
  }

  // ═══════════════════════════════════════════════════════════════
  //  FACE 3 — SYSTEM / SETTINGS
  // ═══════════════════════════════════════════════════════════════

  // ── Settings face state (persists within a pause session) ───────

  var _settingsState = { row: 0 };   // 0 = Master, 1 = SFX, 2 = BGM

  var _SLIDER_DEFS = [
    { key: 'master', labelKey: 'settings.master', label: 'Master Volume' },
    { key: 'sfx',    labelKey: 'settings.sfx',    label: 'SFX Volume'    },
    { key: 'bgm',    labelKey: 'settings.bgm',    label: 'BGM Volume'    }
  ];

  /**
   * Move selected slider row up (-1) or down (+1). Wraps.
   * Called by game.js W/S handlers when Face 3 is the active face.
   */
  function handleSettingsNav(dir) {
    var n = _SLIDER_DEFS.length;
    _settingsState.row = ((_settingsState.row + dir) % n + n) % n;
  }

  /**
   * Adjust the currently selected slider by `delta` percentage points.
   * Clamped to 0–100. Writes immediately to AudioSystem.
   * Called by game.js ← → handlers on Face 3 and scroll_up/down.
   * @param {number} delta - positive = louder, negative = quieter
   */
  function handleSettingsAdjust(delta) {
    if (typeof AudioSystem === 'undefined') return;
    var vols = AudioSystem.getVolumes();       // { master, sfx, bgm } as 0–100
    var def = _SLIDER_DEFS[_settingsState.row];
    var newVal = Math.max(0, Math.min(100, vols[def.key] + delta));
    if (def.key === 'master') AudioSystem.setMasterVolume(newVal / 100);
    if (def.key === 'sfx')    AudioSystem.setSFXVolume(newVal / 100);
    if (def.key === 'bgm')    AudioSystem.setMusicVolume(newVal / 100);
  }

  /** Reset per-session state. Called by game.js on every MenuBox.open(). */
  function resetSettings() {
    _settingsState.row = 0;
  }

  // ── Renderer ─────────────────────────────────────────────────────

  /**
   * All contexts: system settings + exit option.
   * Input: W/S navigate sliders, ←/→ adjust value, scroll wheel fine-adjust.
   * Q/E still rotate the box away from this face (handled in game.js).
   */
  function renderFace3(ctx, x, y, w, h, context) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face3', 'SYSTEM'), '⚙️');

    var listX  = x + 16;
    var trackW = w - 48;
    var rowH   = 38;
    var ty2    = ty + 6;

    // Live volumes from AudioSystem (0–100 integers)
    var vols = (typeof AudioSystem !== 'undefined')
             ? AudioSystem.getVolumes()
             : { master: 80, sfx: 100, bgm: 60 };

    // ── Volume sliders ─────────────────────────────────────────────
    for (var s = 0; s < _SLIDER_DEFS.length; s++) {
      var def     = _SLIDER_DEFS[s];
      var val     = vols[def.key];
      var sy      = ty2 + s * rowH;
      var selected = (s === _settingsState.row);

      // Selection highlight row
      if (selected) {
        ctx.fillStyle = 'rgba(240,208,112,0.12)';
        ctx.fillRect(x + 6, sy - 2, w - 12, rowH - 4);

        // Selection cursor indicator
        ctx.fillStyle = COL.accent;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('▶', x + 6, sy + 12);
      }

      // Label
      ctx.font = selected ? 'bold 10px monospace' : '10px monospace';
      ctx.fillStyle = selected ? COL.accent : COL.dim;
      ctx.textAlign = 'left';
      ctx.fillText(i18n.t(def.labelKey, def.label), listX + 12, sy + 12);

      // Value badge (right-aligned)
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = selected ? COL.accent : COL.text;
      ctx.textAlign = 'right';
      ctx.fillText(val + '%', listX + trackW + 6, sy + 12);

      // Slider track
      var trackY  = sy + 18;
      var trackH  = 7;
      var fillW   = Math.round(trackW * (val / 100));

      // Track background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(listX + 12, trackY, trackW, trackH);

      // Track fill — gradient from dim to accent when selected
      if (selected) {
        var grad = ctx.createLinearGradient(listX + 12, 0, listX + 12 + fillW, 0);
        grad.addColorStop(0, 'rgba(200,160,60,0.7)');
        grad.addColorStop(1, COL.accent);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(180,140,50,0.55)';
      }
      ctx.fillRect(listX + 12, trackY, fillW, trackH);

      // Thumb pip at fill end
      if (selected && fillW > 0) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(listX + 12 + fillW - 2, trackY - 2, 4, trackH + 4);
      }

      // Left / right nudge hint on selected row (only show when selected)
      if (selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('← / → adjust    scroll fine-tune', x + w / 2, trackY + trackH + 10);
      }
    }

    // ── Language ──────────────────────────────────────────────────
    var langY = ty2 + _SLIDER_DEFS.length * rowH + 8;
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, langY - 4);
    ctx.lineTo(x + w - 10, langY - 4);
    ctx.stroke();

    ctx.fillStyle = COL.dim;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      i18n.t('settings.language', 'Language') + ':  ' +
      i18n.t('settings.lang_en', 'English'),
      listX + 12, langY + 10
    );

    // ── Navigation hint ───────────────────────────────────────────
    var navHintY = langY + 24;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      i18n.t('settings.nav_hint', 'W/S  select   ←/→  adjust   Q/E  leave'),
      x + w / 2, navHintY
    );

    // ── Exit options ──────────────────────────────────────────────
    var exitY = navHintY + 20;
    ctx.strokeStyle = COL.divider;
    ctx.beginPath();
    ctx.moveTo(x + 10, exitY - 4);
    ctx.lineTo(x + w - 10, exitY - 4);
    ctx.stroke();

    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    if (context === 'pause') {
      ctx.fillStyle = COL.text;
      ctx.fillText(i18n.t('menu.resume', 'Return to Game') + '  [ESC]', x + w / 2, exitY + 8);
      ctx.fillStyle = 'rgba(200,80,80,0.8)';
      ctx.fillText(i18n.t('menu.quit_title', 'Quit to Title'), x + w / 2, exitY + 24);
    } else {
      ctx.fillStyle = COL.text;
      ctx.fillText('[ESC] ' + i18n.t('shop.close', 'Close'), x + w / 2, exitY + 8);
    }

    ctx.textAlign = 'left';
  }

  // ── Hit zone management ────────────────────────────────────────

  /**
   * Clear hit zones at the start of each render frame.
   * Called by MenuBox before delegating to face renderers.
   */
  function clearHitZones() {
    _hitZones.length = 0;
    _hoverSlot = -1;
  }

  /**
   * Update hover state by checking pointer position against hit zones.
   * Called each frame after face rendering (hit zones are populated).
   */
  function updateHover() {
    _hoverSlot = -1;
    if (typeof InputManager === 'undefined') return;
    var ptr = InputManager.getPointer();
    if (!ptr || !ptr.active) return;
    for (var i = 0; i < _hitZones.length; i++) {
      var z = _hitZones[i];
      if (ptr.x >= z.x && ptr.x <= z.x + z.w &&
          ptr.y >= z.y && ptr.y <= z.y + z.h) {
        _hoverSlot = z.slot;
        return;
      }
    }
  }

  /**
   * Handle a pointer click on face content.
   * Returns the hit zone's { slot, action } if a zone was clicked,
   * or null if the click didn't land on any interactive slot.
   *
   * game.js uses the returned action to dispatch to the correct
   * handler (_takeHarvestItem, _shopBuy, _shopSellFromHand).
   */
  function handlePointerClick() {
    if (typeof InputManager === 'undefined') return null;
    var ptr = InputManager.getPointer();
    if (!ptr || !ptr.active) return null;
    for (var i = 0; i < _hitZones.length; i++) {
      var z = _hitZones[i];
      if (ptr.x >= z.x && ptr.x <= z.x + z.w &&
          ptr.y >= z.y && ptr.y <= z.y + z.h) {
        return { slot: z.slot, action: z.action };
      }
    }
    return null;
  }

  // ── Registration helper ─────────────────────────────────────────

  /**
   * Register all 4 face renderers on a MenuBox instance.
   * Called from Game._initGameplay().
   */
  function registerAll() {
    MenuBox.setFaceRenderer(0, renderFace0, 'Map');
    MenuBox.setFaceRenderer(1, renderFace1, 'Items');
    MenuBox.setFaceRenderer(2, renderFace2, 'Gear');
    MenuBox.setFaceRenderer(3, renderFace3, 'System');
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    renderFace0:          renderFace0,
    renderFace1:          renderFace1,
    renderFace2:          renderFace2,
    renderFace3:          renderFace3,
    registerAll:          registerAll,
    handleSettingsNav:    handleSettingsNav,
    handleSettingsAdjust: handleSettingsAdjust,
    resetSettings:        resetSettings,
    clearHitZones:        clearHitZones,
    updateHover:          updateHover,
    handlePointerClick:   handlePointerClick
  };
})();

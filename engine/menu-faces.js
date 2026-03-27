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
    divider:  'rgba(255,255,255,0.1)'
  };

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
    ctx.fillText(i18n.t('menu.minimap_placeholder', 'Minimap — Floor ' + FloorManager.getFloorNum()),
                 x + w / 2, ty + 40);

    // Floor info
    ctx.fillStyle = COL.text;
    ctx.fillText(FloorManager.getFloorLabel(), x + w / 2, ty + 60);
    ctx.fillStyle = COL.dim;
    ctx.fillText('Depth: ' + FloorManager.getCurrentFloorId(), x + w / 2, ty + 78);
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
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.vendor_name', 'MERCHANT'), '🏪');

    ctx.fillStyle = COL.text;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.vendor_desc', 'A weary traveler with wares to trade'),
                 x + w / 2, ty + 20);

    // Currency
    ty += 46;
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('💰 ' + Player.state().currency + ' ' + i18n.t('shop.currency', 'gold'),
                 x + w / 2, ty);

    // Hint
    ty += 30;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.fillText(i18n.t('shop.browse_hint', '[Q/E] Browse panes   [ESC] Leave'),
                 x + w / 2, ty);
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

    // Loot item list (up to 5 slots, matching number key mapping)
    var itemH = 30;
    var listX = x + 8;
    var listW = w - 16;

    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Press [1-' + Math.min(5, loot.length) + '] to take', listX, ty + 10);
    ty += 18;

    for (var i = 0; i < loot.length && i < 5; i++) {
      var item = loot[i];
      var iy = ty + i * itemH;

      // Row background (alternating)
      ctx.fillStyle = (i % 2 === 0) ? COL.slot_bg : 'rgba(0,0,0,0)';
      ctx.fillRect(listX, iy, listW, itemH - 2);

      // Slot number
      ctx.fillStyle = COL.accent;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('[' + (i + 1) + ']', listX + 4, iy + 18);

      // Item emoji + name
      ctx.font = '12px monospace';
      ctx.fillStyle = COL.text;
      ctx.fillText(item.emoji + ' ' + item.name, listX + 34, iy + 18);

      // Base value
      ctx.fillStyle = COL.currency;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(item.baseValue + 'g', listX + listW - 4, iy + 18);
    }

    ctx.textAlign = 'left';

    // Tags hint (show what factions want)
    var hintY = ty + Math.min(5, loot.length) * itemH + 12;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[Q/E] View bag   [ESC] Leave', x + w / 2, hintY);
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
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.buy_title', 'BUY'), '🛒');

    // Placeholder vendor inventory (5 items)
    // Adapted from EyesOnly vendor-system.js showVendor() layout
    var itemH = 28;
    var listX = x + 8;
    var listW = w - 16;

    // Currency display
    ctx.fillStyle = COL.currency;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('💰 ' + Player.state().currency, x + w - 8, ty + 12);
    ctx.textAlign = 'left';
    ty += 18;

    // Item slots (placeholder — will be wired to ShopInventory when built)
    var shopItems = [
      { emoji: '🗡️', name: 'Iron Blade',  price: 50 },
      { emoji: '🛡️', name: 'Oak Shield',  price: 40 },
      { emoji: '🧪', name: 'Health Vial',  price: 25 },
      { emoji: '⚡', name: 'Energy Shard', price: 30 },
      { emoji: '🃏', name: 'Mystery Card', price: 80 }
    ];

    for (var i = 0; i < shopItems.length; i++) {
      var item = shopItems[i];
      var iy = ty + i * itemH;
      var canAfford = Player.state().currency >= item.price;

      // Row background
      ctx.fillStyle = (i % 2 === 0) ? COL.slot_bg : 'rgba(0,0,0,0)';
      ctx.fillRect(listX, iy, listW, itemH - 2);

      // Item emoji + name
      ctx.font = '12px monospace';
      ctx.fillStyle = canAfford ? COL.text : 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'left';
      ctx.fillText(item.emoji + ' ' + item.name, listX + 4, iy + 17);

      // Price
      ctx.fillStyle = canAfford ? COL.currency : '#844';
      ctx.textAlign = 'right';
      ctx.fillText(item.price + 'g', listX + listW - 4, iy + 17);
    }

    ctx.textAlign = 'left';

    // Hint
    var hintY = ty + shopItems.length * itemH + 12;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.buy_hint', '[1-5] Buy   [ESC] Close'),
                 x + w / 2, hintY);
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

  function _renderInventory(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face2', 'INVENTORY'), '🎒');

    // Card hand display
    var hand = CardSystem.getHand();
    var cardW = Math.min(60, Math.floor((w - 20) / 5));
    var cardH = cardW * 1.4;
    var handX = x + (w - cardW * 5 - 16) / 2;
    var handY = ty + 4;

    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HAND', x + w / 2, handY);
    handY += 10;

    for (var c = 0; c < 5; c++) {
      var card = hand[c];
      var cx = handX + c * (cardW + 4);
      _drawSlot(ctx, cx, handY, cardW, cardH,
                card ? card.name : 'Empty',
                card ? card.emoji : null,
                false);
    }

    // Currency
    var curY = handY + cardH + 14;
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💰 ' + Player.state().currency, x + w / 2, curY);

    // Stats summary
    var ps = Player.state();
    var statsY = curY + 20;
    _drawStat(ctx, x + (w - 140) / 2, statsY,      'STR', ps.str, COL.text);
    _drawStat(ctx, x + (w - 140) / 2, statsY + 16,  'DEX', ps.dex, COL.text);
    _drawStat(ctx, x + (w - 140) / 2, statsY + 32,  'Stealth', ps.stealth, COL.text);
  }

  function _renderBag(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.bag_title', 'BAG'), '🎒');

    ctx.fillStyle = COL.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.bag_desc', 'Carried items (lost on death)'),
                 x + w / 2, ty + 12);

    // Bag grid (4×3 = 12 slots)
    var cols = 4;
    var rows = 3;
    var slotSize = Math.min(Math.floor((w - 20) / cols), 36);
    var gridW = cols * (slotSize + 4);
    var gridX = x + (w - gridW) / 2;
    var gridY = ty + 24;

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col;
        var sx = gridX + col * (slotSize + 4);
        var sy = gridY + row * (slotSize + 4);
        _drawSlot(ctx, sx, sy, slotSize, slotSize,
                  '' + (idx + 1), null, false);
      }
    }

    // Capacity
    ctx.fillStyle = COL.dim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0 / 12 ' + i18n.t('shop.bag_capacity', 'slots'),
                 x + w / 2, gridY + rows * (slotSize + 4) + 12);

    // Hint: move to stash
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(i18n.t('shop.bag_hint', 'Select item → Move to stash'),
                 x + w / 2, gridY + rows * (slotSize + 4) + 28);
  }

  function _renderShopSell(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.sell_title', 'SELL'), '💰');

    // Player's inventory for selling
    ctx.fillStyle = COL.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.sell_desc', 'Select items to sell'),
                 x + w / 2, ty + 14);

    // Card hand (sellable items)
    var hand = CardSystem.getHand();
    var cardW = Math.min(56, Math.floor((w - 20) / 5));
    var cardH = cardW * 1.4;
    var handX = x + (w - cardW * 5 - 16) / 2;
    var handY = ty + 28;

    for (var c = 0; c < 5; c++) {
      var card = hand[c];
      var cx = handX + c * (cardW + 4);
      // Show sell value below each card
      _drawSlot(ctx, cx, handY, cardW, cardH,
                card ? card.name : '—',
                card ? card.emoji : null,
                false);

      if (card) {
        ctx.fillStyle = COL.currency;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        // Sell value: rough 40% of base (placeholder)
        var sellPrice = Math.floor(20 * (1 + (card.effects ? card.effects.length : 0) * 0.5));
        ctx.fillText(sellPrice + 'g', cx + cardW / 2, handY + cardH + 12);
      }
    }

    // Hint
    var hintY = handY + cardH + 28;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.sell_hint', '[1-5] Sell card   [ESC] Close'),
                 x + w / 2, hintY);
  }

  // ═══════════════════════════════════════════════════════════════
  //  FACE 3 — SYSTEM / SETTINGS
  // ═══════════════════════════════════════════════════════════════

  /**
   * All contexts: system settings + exit option.
   */
  function renderFace3(ctx, x, y, w, h, context) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face3', 'SYSTEM'), '⚙️');

    var lineH = 22;
    var listX = x + 20;
    var ty2 = ty + 8;

    // Volume sliders (placeholder — visual only)
    var sliders = [
      { label: i18n.t('settings.master', 'Master Volume'), value: 80 },
      { label: i18n.t('settings.sfx', 'SFX Volume'),      value: 100 },
      { label: i18n.t('settings.bgm', 'BGM Volume'),      value: 60 }
    ];

    for (var s = 0; s < sliders.length; s++) {
      var sl = sliders[s];
      var sy = ty2 + s * (lineH + 10);

      ctx.fillStyle = COL.dim;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(sl.label, listX, sy + 10);

      // Slider track
      var trackX = listX;
      var trackW = w - 40;
      var trackY = sy + 16;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(trackX, trackY, trackW, 6);

      // Slider fill
      ctx.fillStyle = COL.accent;
      ctx.fillRect(trackX, trackY, trackW * (sl.value / 100), 6);

      // Value
      ctx.fillStyle = COL.text;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(sl.value + '%', listX + trackW, sy + 10);
    }

    // Language
    var langY = ty2 + sliders.length * (lineH + 10) + 10;
    ctx.fillStyle = COL.dim;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(i18n.t('settings.language', 'Language') + ': English', listX, langY);

    // Exit options
    var exitY = langY + 30;
    ctx.strokeStyle = COL.divider;
    ctx.beginPath();
    ctx.moveTo(x + 10, exitY - 8);
    ctx.lineTo(x + w - 10, exitY - 8);
    ctx.stroke();

    if (context === 'pause') {
      ctx.fillStyle = COL.text;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(i18n.t('menu.resume', 'Return to Game') + '  [ESC]', x + w / 2, exitY + 6);
      ctx.fillText(i18n.t('menu.quit_title', 'Quit to Title'), x + w / 2, exitY + 24);
    } else {
      ctx.fillStyle = COL.text;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[ESC] ' + i18n.t('shop.close', 'Close'), x + w / 2, exitY + 6);
    }
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
    renderFace0: renderFace0,
    renderFace1: renderFace1,
    renderFace2: renderFace2,
    renderFace3: renderFace3,
    registerAll: registerAll
  };
})();

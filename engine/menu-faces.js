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

  // ── Resource color lookup (CardAuthority canonical source) ─────
  function _getCardResColor(card) {
    if (typeof CardAuthority !== 'undefined' && CardAuthority.RES_COLORS && CardAuthority.SUIT_DATA) {
      var res = card.resource || card.costResource || null;
      if (res && CardAuthority.RES_COLORS[res]) return CardAuthority.RES_COLORS[res];
      if (card.suit && CardAuthority.SUIT_DATA[card.suit]) {
        var sres = CardAuthority.SUIT_DATA[card.suit].res;
        return CardAuthority.RES_COLORS[sres] || CardAuthority.RES_COLORS.cards;
      }
      return CardAuthority.RES_COLORS.cards;
    }
    return { r: 128, g: 0, b: 128 };
  }

  // ── Click hit zones ───────────────────────────────────────────
  // Rebuilt every render frame; each entry: { x, y, w, h, slot }
  var _hitZones = [];
  var _hoverSlot = -1;   // slot index under pointer, or -1
  var _hoverDetail = null; // { item, x, y } — item/card under pointer for tooltip
  var _selectedSlot = -1;  // tap-selected slot for highlight mode
  var _selectedPayload = null; // payload from selected slot (for drop matching)
  var _selectedZoneId = null;  // zone id of selected slot

  // ── DragDrop zone IDs ──────────────────────────────────────────
  var ZONE_EQUIP  = 'inv-equip';   // equipped quick-slots area
  var ZONE_BAG    = 'inv-bag';     // bag grid area
  var ZONE_STASH  = 'inv-stash';   // stash grid area (bonfire)
  var ZONE_SELL   = 'inv-sell';    // shop sell zone
  var ZONE_INCIN  = 'inv-incin';   // incinerator drop zone (always active)
  var _dragZonesRegistered = false;

  // ── Shared helpers ──────────────────────────────────────────────

  /**
   * Draw a hover tooltip for a card or item near the cursor position.
   * Shows: emoji, name, rarity, suit, power, description.
   */
  function _drawHoverTooltip(ctx, detail, panelX, panelW) {
    if (!detail || !detail.item) return;
    var it = detail.item;
    var isCard = !!(it.suit || it.power || it.value);

    var TW = 160, TH = isCard ? 80 : 60;
    var tx = Math.min(detail.x + 10, panelX + panelW - TW - 4);
    var ty = detail.y - TH - 6;
    if (ty < 0) ty = detail.y + 30;

    // Background
    ctx.fillStyle = 'rgba(15,12,25,0.92)';
    _roundRectFill(ctx, tx, ty, TW, TH, 6);
    ctx.strokeStyle = 'rgba(255,215,0,0.5)';
    ctx.lineWidth = 1;
    _roundRectStroke(ctx, tx, ty, TW, TH, 6);

    var cy = ty + 16;
    // Name + emoji
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText((it.emoji || '') + ' ' + (it.name || '???'), tx + 6, cy);
    cy += 14;

    // Rarity
    if (it.rarity) {
      ctx.font = '13px monospace';
      ctx.fillStyle = INV_RARITY_COL[it.rarity] || COL.dim;
      ctx.fillText(it.rarity.toUpperCase(), tx + 6, cy);
      cy += 12;
    }

    if (isCard) {
      // Suit + power
      var suit = it.suit || '';
      ctx.font = '13px monospace';
      ctx.fillStyle = INV_SUIT_COLOR[suit] || COL.dim;
      ctx.fillText((INV_SUIT_EMOJI[suit] || '') + ' ' + suit, tx + 6, cy);
      ctx.fillStyle = COL.text;
      ctx.textAlign = 'right';
      ctx.fillText('PWR ' + (it.power || it.value || '?'), tx + TW - 6, cy);
      ctx.textAlign = 'left';
      cy += 12;
    }

    // Description (truncated)
    if (it.description) {
      ctx.font = '12px monospace';
      ctx.fillStyle = COL.dim;
      var desc = it.description;
      if (desc.length > 24) desc = desc.substring(0, 23) + '\u2026';
      ctx.fillText(desc, tx + 6, cy);
    }
  }

  function _drawTitle(ctx, x, y, w, text, emoji, S) {
    S = S || 1;
    var fontSize = Math.round(16 * S);
    if (fontSize < 12) fontSize = 12;
    ctx.fillStyle = COL.title;
    ctx.font = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign = 'center';
    var titleY = y + Math.round(18 * S);
    ctx.fillText((emoji ? emoji + ' ' : '') + text, x + w / 2, titleY);
    // Divider line
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    var divY = titleY + Math.round(8 * S);
    ctx.beginPath();
    ctx.moveTo(x + 10, divY);
    ctx.lineTo(x + w - 10, divY);
    ctx.stroke();
    return divY + Math.round(10 * S); // Return Y after header
  }

  function _drawStat(ctx, x, y, label, value, color, S) {
    S = S || 1;
    var fontSize = Math.round(13 * S);
    if (fontSize < 10) fontSize = 10;
    ctx.font = fontSize + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COL.dim;
    ctx.fillText(label, x, y);
    ctx.fillStyle = color || COL.text;
    ctx.textAlign = 'right';
    ctx.fillText('' + value, x + Math.round(160 * S), y);
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
      ctx.font = '12px monospace';
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
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face0', 'MAP'), '\uD83D\uDDFA\uFE0F', S);

    // ── Scale-aware font sizes ──
    var F_BODY   = Math.max(10, Math.round(14 * S));
    var F_SMALL  = Math.max(9, Math.round(13 * S));
    var F_HINT   = Math.max(9, Math.round(13 * S));
    var F_COMPASS = Math.max(9, Math.round(13 * S));

    // ── Floor label + depth info ──
    var floorId = FloorManager.getFloor();
    var floorLabel = FloorManager.getFloorLabel();
    var depth = floorId ? floorId.split('.').length : 1;
    var depthNames = ['', 'Surface', 'Interior', 'Dungeon'];
    var depthName = depthNames[Math.min(depth, 3)] || 'Deep';

    ctx.fillStyle = COL.text;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(floorLabel, x + w / 2, ty + Math.round(6 * S));
    ctx.fillStyle = COL.dim;
    ctx.font = F_SMALL + 'px monospace';
    ctx.fillText(depthName + ' \u2014 ' + floorId, x + w / 2, ty + Math.round(20 * S));
    ty += Math.round(28 * S);

    // ── Minimap canvas (live from Minimap module) ──
    var mapCanvas = (typeof Minimap !== 'undefined' && Minimap.getCanvas)
      ? Minimap.getCanvas() : null;

    if (mapCanvas && mapCanvas.width > 0) {
      // Map fills most of the remaining space — reserve room for stats below
      var statsReserve = Math.round(80 * S);
      var mapSize = Math.min(w - Math.round(16 * S), h - (ty - y) - statsReserve);
      if (mapSize < Math.round(60 * S)) mapSize = Math.round(60 * S);
      var mapX = x + (w - mapSize) / 2;
      var mapY = ty;
      var framePad = Math.round(4 * S);
      var frameRad = Math.round(6 * S);

      // Frame border (parchment feel)
      ctx.fillStyle = 'rgba(60,50,35,0.7)';
      _roundRectFill(ctx, mapX - framePad, mapY - framePad,
                     mapSize + framePad * 2, mapSize + framePad * 2, frameRad);
      ctx.strokeStyle = 'rgba(180,160,120,0.5)';
      ctx.lineWidth = Math.max(1, 1.5 * S);
      _roundRectStroke(ctx, mapX - framePad, mapY - framePad,
                       mapSize + framePad * 2, mapSize + framePad * 2, frameRad);

      // Inner bevel
      ctx.strokeStyle = 'rgba(100,90,60,0.4)';
      ctx.lineWidth = 1;
      _roundRectStroke(ctx, mapX - 1, mapY - 1, mapSize + 2, mapSize + 2, Math.round(4 * S));

      // Draw the minimap canvas scaled into the frame
      ctx.drawImage(mapCanvas, 0, 0, mapCanvas.width, mapCanvas.height,
                    mapX, mapY, mapSize, mapSize);

      // Corner pips (compass decoration)
      ctx.fillStyle = 'rgba(180,160,120,0.6)';
      ctx.font = F_COMPASS + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', mapX + mapSize / 2, mapY - Math.round(6 * S));
      ctx.fillText('S', mapX + mapSize / 2, mapY + mapSize + Math.round(12 * S));
      ctx.textAlign = 'left';
      ctx.fillText('W', mapX - Math.round(14 * S), mapY + mapSize / 2 + 3);
      ctx.textAlign = 'right';
      ctx.fillText('E', mapX + mapSize + Math.round(14 * S), mapY + mapSize / 2 + 3);

      ty = mapY + mapSize + Math.round(16 * S);
    } else {
      ctx.fillStyle = COL.dim;
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Map not available', x + w / 2, ty + Math.round(30 * S));
      ty += Math.round(50 * S);
    }

    // ── Floor stack breadcrumb ──
    if (typeof Minimap !== 'undefined' && Minimap.getFloorStack) {
      var stack = Minimap.getFloorStack();
      if (stack && stack.length > 1) {
        ctx.fillStyle = COL.dim;
        ctx.font = F_SMALL + 'px monospace';
        ctx.textAlign = 'center';
        var breadcrumb = stack.join(' \u25B8 ');
        ctx.fillText(breadcrumb, x + w / 2, ty);
        ty += Math.round(16 * S);
      }
    }

    // ── Progress stats (SessionStats + explored tile count) ──
    if (typeof SessionStats !== 'undefined') {
      var stats = SessionStats.get();
      var explored = (typeof Minimap !== 'undefined' && Minimap.getExplored)
        ? Minimap.getExplored() : {};
      var tileCount = 0;
      for (var _k in explored) { if (explored.hasOwnProperty(_k)) tileCount++; }

      ctx.font = F_SMALL + 'px monospace';
      ctx.textAlign = 'center';

      // Row 1: explored tiles + enemies
      ctx.fillStyle = COL.dim;
      var statLine1 = tileCount + ' tiles explored';
      if (stats.enemiesDefeated > 0) {
        statLine1 += '  \u00B7  ' + stats.enemiesDefeated + ' defeated';
      }
      ctx.fillText(statLine1, x + w / 2, ty);
      ty += Math.round(14 * S);

      // Row 2: chests + bonfires + hazards
      var statParts = [];
      if (stats.chestsOpened > 0)      statParts.push(stats.chestsOpened + ' chests');
      if (stats.bonfiresUsed > 0)      statParts.push(stats.bonfiresUsed + ' rests');
      if (stats.hazardsTriggered > 0)  statParts.push(stats.hazardsTriggered + ' hazards');
      if (stats.floorsExplored > 0)    statParts.push(stats.floorsExplored + ' floors');
      if (statParts.length > 0) {
        ctx.fillText(statParts.join('  \u00B7  '), x + w / 2, ty);
        ty += Math.round(14 * S);
      }
    }

    // ── Current quest objective ──
    var questText = _getQuestObjective();
    if (questText) {
      ty += Math.round(4 * S);
      ctx.fillStyle = 'rgba(120,220,160,0.8)';
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u25C6 ' + questText, x + w / 2, ty);
      ty += Math.round(16 * S);
    }

    // ── Compass heading + Time display ──
    if (typeof DayCycle !== 'undefined') {
      var timeStr = DayCycle.getTimeString();
      var phase = DayCycle.getPhase ? DayCycle.getPhase() : '';
      var phaseIcon = DayCycle.getPhaseIcon ? DayCycle.getPhaseIcon() : '';

      // Compass heading (player direction as cardinal)
      var heading = '';
      if (typeof Player !== 'undefined' && Player.getDir) {
        var HEADINGS_MAP = ['N', 'E', 'S', 'W'];
        heading = HEADINGS_MAP[Player.getDir()] || 'N';
      }

      // Row 1: prominent time + phase
      ctx.fillStyle = COL.accent;
      ctx.font = 'bold ' + F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(phaseIcon + ' ' + timeStr + (phase ? ' \u2014 ' + phase : ''), x + w / 2, ty);
      ty += Math.round(14 * S);

      // Row 2: compass heading + day label (suit symbol on hero days)
      var dayLabel = DayCycle.getDayLabel ? DayCycle.getDayLabel() : DayCycle.getDayOfWeek();
      var dayColor = DayCycle.getDayLabelColor ? DayCycle.getDayLabelColor() : null;
      ctx.font = F_SMALL + 'px monospace';
      // Draw heading first
      ctx.fillStyle = COL.dim;
      var row2 = 'Facing ' + heading + '  \u00B7  ';
      var row2W = ctx.measureText(row2).width;
      var dayPart = dayLabel + ', Day ' + (DayCycle.getDay() + 1);
      var totalW = row2W + ctx.measureText(dayPart).width;
      var startX = x + w / 2 - totalW / 2;
      ctx.textAlign = 'left';
      ctx.fillText(row2, startX, ty);
      ctx.fillStyle = dayColor || COL.dim;
      ctx.fillText(dayPart, startX + row2W, ty);
      ctx.textAlign = 'center';
    }

    // ── Hint ──
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = F_HINT + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[Q/E] Browse   [ESC] Resume', x + w / 2, y + h - Math.round(6 * S));
    ctx.textAlign = 'left';
  }

  // ── Quest objective resolver ──────────────────────────────────────
  // Returns a short string describing the current Day 0 objective
  // based on game state flags and current floor.
  function _getQuestObjective() {
    var floorId = (typeof FloorManager !== 'undefined') ? FloorManager.getFloor() : '';
    // Check if Game exposes gate state
    var gateUnlocked = (typeof Game !== 'undefined' && Game.isGateUnlocked)
      ? Game.isGateUnlocked() : false;

    if (!gateUnlocked) {
      // Phase 1: player needs to get work keys from home
      if (floorId === '1.6') return 'Find work keys in the chest';
      if (floorId === '0') return 'Enter The Promenade';
      return 'Head home for your keys \u2014 east side of town';
    }

    // Phase 2: gate unlocked, head to dungeon
    if (floorId === '1') return 'Enter the Coral Bazaar \u2014 find the cellar';
    if (floorId === '1.1') return 'Descend to the Soft Cellar';
    if (floorId && floorId.split('.').length >= 3) return 'Clear the dungeon floor';
    return 'Report to the dungeon entrance';
  }

  function _renderBonfireRest(ctx, x, y, w, h) {
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.bonfire_title', 'BONFIRE'), '🔥', S);

    var F_BODY  = Math.max(10, Math.round(14 * S));
    var F_SMALL = Math.max(9, Math.round(13 * S));
    var F_HINT  = Math.max(9, Math.round(13 * S));

    var ps = Player.state();

    // HP/Energy bars
    var barW = Math.min(w - Math.round(40 * S), Math.round(220 * S));
    var barH = Math.max(10, Math.round(14 * S));
    var barX = x + (w - barW) / 2;

    // HP bar
    ctx.fillStyle = COL.dim;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HP', barX - Math.round(26 * S), ty + barH);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(barX, ty + 2, barW, barH);
    var hpPct = ps.hp / ps.maxHp;
    ctx.fillStyle = hpPct > 0.6 ? COL.hp : (hpPct > 0.3 ? '#c80' : '#c44');
    ctx.fillRect(barX, ty + 2, barW * hpPct, barH);
    ctx.fillStyle = '#fff';
    ctx.font = F_SMALL + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ps.hp + '/' + ps.maxHp, barX + barW / 2, ty + barH);

    // Energy bar
    ty += Math.round(26 * S);
    ctx.fillStyle = COL.dim;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('EN', barX - Math.round(26 * S), ty + barH);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(barX, ty + 2, barW, barH);
    ctx.fillStyle = COL.energy;
    ctx.fillRect(barX, ty + 2, barW * (ps.energy / ps.maxEnergy), barH);
    ctx.fillStyle = '#fff';
    ctx.font = F_SMALL + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ps.energy + '/' + ps.maxEnergy, barX + barW / 2, ty + barH);

    // Status text
    ty += Math.round(34 * S);
    ctx.fillStyle = COL.accent;
    ctx.font = F_SMALL + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.bonfire_restored', 'HP & Energy restored'), x + w / 2, ty + Math.round(10 * S));

    // Floor info
    ty += Math.round(28 * S);
    ctx.fillStyle = COL.dim;
    ctx.fillText(FloorManager.getFloorLabel() + ' — ' + FloorManager.getCurrentFloorId(),
                 x + w / 2, ty + Math.round(10 * S));

    // ── Warp button (exterior → home, dungeon → entrance) ──
    var floorId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
    var depth = floorId.split('.').length;
    var warpTarget = null;
    var warpLabel  = '';
    if (depth === 1 && floorId !== '0') {
      warpTarget = '1.6';
      warpLabel  = '\uD83C\uDFE0 ' + i18n.t('bonfire.warp_home', 'Warp Home');
    } else if (depth >= 3) {
      warpTarget = (typeof FloorManager !== 'undefined') ? FloorManager.parentId(floorId) : null;
      warpLabel  = '\uD83D\uDD3C ' + i18n.t('bonfire.warp_entrance', 'Warp to Entrance');
    }

    if (warpTarget) {
      ty += Math.round(28 * S);
      var btnW = Math.min(w - Math.round(20 * S), Math.round(200 * S));
      var btnH = Math.max(24, Math.round(30 * S));
      var btnX = x + (w - btnW) / 2;
      var isHov = (_hoverSlot === 900);
      ctx.fillStyle = isHov ? 'rgba(100,180,255,0.2)' : 'rgba(60,120,200,0.1)';
      _roundRectFill(ctx, btnX, ty, btnW, btnH, Math.round(4 * S));
      ctx.strokeStyle = isHov ? '#88ccff' : 'rgba(100,160,255,0.4)';
      ctx.lineWidth = isHov ? 2 : 1;
      _roundRectStroke(ctx, btnX, ty, btnW, btnH, Math.round(4 * S));
      ctx.fillStyle = isHov ? '#bbddff' : 'rgba(160,200,255,0.8)';
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(warpLabel, x + w / 2, ty + btnH * 0.65);
      _hitZones.push({ x: btnX, y: ty, w: btnW, h: btnH, slot: 900, action: 'warp', warpTarget: warpTarget });
      ty += btnH;
    }

    // Hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = F_HINT + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.bonfire_hint', '[ESC] Close   [Q/E] Browse'),
                 x + w / 2, y + h - Math.round(6 * S));
  }

  function _renderShopInfo(ctx, x, y, w, h) {
    var S = Math.min(w, h) / 400;
    var F_BODY  = Math.max(10, Math.round(14 * S));
    var F_SMALL = Math.max(9, Math.round(13 * S));
    var F_HINT  = Math.max(9, Math.round(13 * S));

    // ── Faction identity ─────────────────────────────────────────
    var factionId    = (typeof Shop !== 'undefined') ? Shop.getCurrentFaction() : null;
    var factionLabel = (typeof Shop !== 'undefined') ? Shop.getFactionLabel(factionId) : i18n.t('shop.vendor_name', 'MERCHANT');
    var factionEmoji = (typeof Shop !== 'undefined') ? Shop.getFactionEmoji(factionId) : '🏪';

    var ty = _drawTitle(ctx, x, y, w, factionLabel.toUpperCase(), factionEmoji, S);

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

    var factionRowH = Math.round(26 * S);
    ctx.textAlign = 'left';
    for (var fi = 0; fi < factions.length; fi++) {
      var fd = factions[fi];
      var tier = allTiers[fd.id] || 0;
      var rowY = ty + fi * factionRowH;
      var active = (fd.id === factionId);

      if (active) {
        ctx.fillStyle = 'rgba(240,208,112,0.10)';
        ctx.fillRect(x + 6, rowY - Math.round(10 * S), w - 12, Math.round(22 * S));
      }

      ctx.font = F_BODY + 'px monospace';
      ctx.fillStyle = active ? COL.accent : COL.dim;
      ctx.textAlign = 'left';
      ctx.fillText(fd.emoji + ' ' + fd.label, x + Math.round(10 * S), rowY + 2);
      ctx.fillStyle = REP_COLORS[tier];
      ctx.textAlign = 'right';
      ctx.fillText(REP_NAMES[tier], x + w - Math.round(8 * S), rowY + 2);
    }
    ty += factions.length * factionRowH + Math.round(12 * S);

    // Divider
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, ty); ctx.lineTo(x + w - 10, ty);
    ctx.stroke();
    ty += Math.round(14 * S);

    // ── Currency ─────────────────────────────────────────────────
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold ' + F_BODY + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💰 ' + Player.state().currency + ' ' + i18n.t('shop.currency', 'gold'),
                 x + w / 2, ty);

    // ── Current rep tier badge ───────────────────────────────────
    ty += Math.round(24 * S);
    var curTier = (typeof Shop !== 'undefined') ? Shop.getRepTier() : 0;
    ctx.fillStyle = REP_COLORS[curTier];
    ctx.font = F_SMALL + 'px monospace';
    ctx.fillText(factionEmoji + ' ' + REP_NAMES[curTier] + ' (Tier ' + curTier + ')',
                 x + w / 2, ty);

    // ── Hint ─────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = F_HINT + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.browse_hint', '[Q/E] Browse panes   [ESC] Leave'),
                 x + w / 2, y + h - Math.round(6 * S));
  }

  // ── Harvest: Corpse Loot (Face 0 in harvest context) ────────

  // ── Tile rendering helper ──────────────────────────────────────
  // Shared by harvest, shop buy, shop sell — grid of clickable tiles
  // with emoji icon, name label, and optional value/price tag.

  var TILE_SIZE = 72;     // px square (scaled up for readability)
  var TILE_GAP  = 8;      // gap between tiles
  var TILE_RAD  = 5;      // corner radius

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
    ctx.font = '11px monospace';
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
      ctx.font = '11px monospace';
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
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, 'REMAINS', '💀', S);

    var F_BODY = Math.max(10, Math.round(14 * S));
    var F_HINT = Math.max(9, Math.round(13 * S));

    // Get staged loot from Salvage
    var loot = (typeof Salvage !== 'undefined') ? Salvage.getStagedLoot() : [];

    if (loot.length === 0) {
      ctx.fillStyle = COL.dim;
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Nothing remains.', x + w / 2, ty + Math.round(40 * S));
      return;
    }

    // Hint text
    ctx.fillStyle = COL.dim;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('harvest.hint', 'Click to take'), x + w / 2, ty + Math.round(10 * S));
    ty += Math.round(20 * S);

    // Grid of item tiles (tile size scales with S)
    var tileS = Math.max(48, Math.round(TILE_SIZE * S));
    var tileGap = Math.round(TILE_GAP * S);
    var count = Math.min(5, loot.length);
    var cols = Math.max(1, Math.floor((w + tileGap) / (tileS + tileGap)));
    var gridW = cols * tileS + (cols - 1) * tileGap;
    var offsetX = x + (w - gridW) / 2;

    for (var i = 0; i < count; i++) {
      var item = loot[i];
      var c = i % cols;
      var r = Math.floor(i / cols);
      var px = offsetX + c * (tileS + tileGap);
      var py = ty + r * (tileS + tileGap);

      _hitZones.push({ x: px, y: py, w: tileS, h: tileS, slot: i, action: 'harvest' });
      _drawItemTile(ctx, px, py, item, i, _hoverSlot === i, {
        priceText: item.baseValue + 'g',
        priceColor: COL.currency
      });
    }

    ctx.textAlign = 'center';

    // Bottom hint
    var lastRow = count > 0 ? Math.floor((count - 1) / cols) : 0;
    var hintY = ty + (lastRow + 1) * (tileS + tileGap) + Math.round(8 * S);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = F_HINT + 'px monospace';
    ctx.fillText('[Q/E] View bag   [ESC] Leave', x + w / 2, hintY);
    ctx.textAlign = 'left';
  }

  // ── Harvest: Player Bag (Face 1 in harvest context) ─────────

  function _renderHarvestBag(ctx, x, y, w, h) {
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, 'BAG', '🎒', S);

    var F_BODY  = Math.max(10, Math.round(14 * S));
    var F_SMALL = Math.max(9, Math.round(13 * S));

    var bag = CardAuthority.getBag();
    var maxBag = CardAuthority.MAX_BAG;

    // Capacity header
    ctx.fillStyle = COL.dim;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bag.length + ' / ' + maxBag + ' slots', x + w / 2, ty + Math.round(12 * S));
    ty += Math.round(24 * S);

    if (bag.length === 0) {
      ctx.fillStyle = COL.dim;
      ctx.font = F_SMALL + 'px monospace';
      ctx.fillText('Empty', x + w / 2, ty + Math.round(20 * S));
      return;
    }

    // Bag grid (4 columns)
    var cols = 4;
    var rows = Math.ceil(bag.length / cols);
    var slotSize = Math.max(28, Math.min(Math.floor((w - Math.round(20 * S)) / cols), Math.round(44 * S)));
    var slotGap = Math.round(5 * S);
    var gridW2 = cols * (slotSize + slotGap);
    var gridX = x + (w - gridW2) / 2;

    for (var i = 0; i < bag.length; i++) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var sx = gridX + col * (slotSize + slotGap);
      var sy = ty + row * (slotSize + slotGap);
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
      var sx2 = gridX + c2 * (slotSize + slotGap);
      var sy2 = ty + r2 * (slotSize + slotGap);
      _drawSlot(ctx, sx2, sy2, slotSize, slotSize, '', null, false);
    }

    // Currency
    var curY = ty + (rows + 1) * (slotSize + slotGap) + Math.round(4 * S);
    ctx.fillStyle = COL.currency;
    ctx.font = 'bold ' + F_BODY + 'px monospace';
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
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face1', 'JOURNAL'), '\uD83D\uDCD6', S);

    var F_BODY    = Math.max(10, Math.round(14 * S));
    var F_SMALL   = Math.max(9, Math.round(13 * S));
    var F_SECTION = Math.max(9, Math.round(12 * S));
    var F_HINT    = Math.max(9, Math.round(13 * S));
    var PAD       = Math.round(10 * S);

    // ── Section 1: Operative dossier (class, callsign, status) ──
    var ps = (typeof Player !== 'undefined') ? Player.state() : {};
    var callsign = ps.callsign || 'Gleaner';
    var className = ps.className || 'Operative';
    var classEmoji = ps.classEmoji || '\uD83D\uDD27';

    ctx.fillStyle = COL.accent;
    ctx.font = 'bold ' + F_BODY + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(classEmoji + ' ' + callsign, x + PAD, ty + Math.round(4 * S));
    ctx.fillStyle = COL.dim;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(className, x + w - PAD, ty + Math.round(4 * S));
    ty += Math.round(16 * S);

    // ── Character stats (HP, EN, currency — quick glance) ──
    var statRowH = Math.round(14 * S);
    ctx.font = F_SMALL + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COL.hp;
    ctx.fillText('HP ' + (ps.hp || 0) + '/' + (ps.maxHp || 0), x + PAD, ty + 2);
    ctx.fillStyle = COL.energy;
    var hpTextW = Math.round(w * 0.33);
    ctx.fillText('EN ' + (ps.energy || 0) + '/' + (ps.maxEnergy || 0), x + PAD + hpTextW, ty + 2);
    ctx.fillStyle = COL.currency;
    ctx.textAlign = 'right';
    ctx.fillText('💰 ' + (ps.currency || 0), x + w - PAD, ty + 2);
    ty += statRowH + Math.round(4 * S);

    // ── Active status effects (detailed view) ──
    if (typeof StatusEffect !== 'undefined') {
      var active = StatusEffect.getActive();
      if (active.length > 0) {
        ctx.strokeStyle = COL.divider;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + PAD, ty); ctx.lineTo(x + w - PAD, ty);
        ctx.stroke();
        ty += Math.round(6 * S);

        ctx.fillStyle = COL.dim;
        ctx.font = F_SECTION + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('STATUS', x + PAD, ty + Math.round(6 * S));
        ty += Math.round(14 * S);

        for (var si = 0; si < active.length && si < 4; si++) {
          var eff = active[si];
          var isBuff = !eff.debuff;
          ctx.fillStyle = isBuff ? 'rgba(80,220,120,0.9)' : 'rgba(220,100,80,0.9)';
          ctx.font = F_SMALL + 'px monospace';
          ctx.textAlign = 'left';
          ctx.fillText((eff.emoji || '\u2B50') + ' ' + (eff.label || eff.id), x + PAD + 2, ty + 4);
          ctx.fillStyle = COL.dim;
          ctx.font = F_SECTION + 'px monospace';
          ctx.textAlign = 'right';
          var durText = eff.duration === 'permanent' ? 'permanent'
            : (typeof eff.duration === 'number' ? eff.duration + 'd' : String(eff.duration || ''));
          ctx.fillText(durText, x + w - PAD, ty + 4);
          ty += Math.round(16 * S);
        }
      }
    }
    ty += Math.round(4 * S);

    // ── Section 2: Quest log (stub — shows current objective) ──
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + PAD, ty); ctx.lineTo(x + w - PAD, ty);
    ctx.stroke();
    ty += Math.round(8 * S);

    ctx.fillStyle = COL.dim;
    ctx.font = F_SECTION + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('OBJECTIVES', x + PAD, ty + Math.round(6 * S));
    ty += Math.round(14 * S);

    var questText = _getQuestObjective();
    if (questText) {
      ctx.fillStyle = 'rgba(120,220,160,0.8)';
      ctx.font = F_SMALL + 'px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('\u25C6 ' + questText, x + PAD + 2, ty + 2);
      ty += Math.round(16 * S);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = F_SMALL + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No active objectives', x + w / 2, ty + 2);
      ty += Math.round(16 * S);
    }

    // ── Section 3: Books read (thumbnail grid) ──
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + PAD, ty); ctx.lineTo(x + w - PAD, ty);
    ctx.stroke();
    ty += Math.round(8 * S);

    ctx.fillStyle = COL.dim;
    ctx.font = F_SECTION + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('BOOKS', x + PAD, ty + Math.round(6 * S));

    var catalog = (typeof BookshelfPeek !== 'undefined' && BookshelfPeek.getCatalog)
      ? BookshelfPeek.getCatalog() : [];
    var readBooks = [];
    for (var bi = 0; bi < catalog.length; bi++) {
      if (typeof Player !== 'undefined' && Player.hasFlag('book_read_' + catalog[bi].id)) {
        readBooks.push(catalog[bi]);
      }
    }

    ctx.textAlign = 'right';
    ctx.fillText(readBooks.length + '/' + catalog.length, x + w - PAD, ty + Math.round(6 * S));
    ty += Math.round(14 * S);

    var thumbS = Math.max(28, Math.min(Math.round(44 * S), Math.floor((w - PAD * 2) / 5 - Math.round(5 * S))));
    var thumbGap = Math.round(5 * S);

    if (readBooks.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = F_SMALL + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No books read yet. Find a bookshelf!', x + w / 2, ty + Math.round(10 * S));
      ty += Math.round(24 * S);
    } else {
      var thumbPerRow = Math.max(1, Math.floor((w - PAD * 2) / (thumbS + thumbGap)));
      var maxVisible = Math.min(readBooks.length, thumbPerRow * 3);

      for (var rb = 0; rb < maxVisible; rb++) {
        var bk = readBooks[rb];
        var col2 = rb % thumbPerRow;
        var row2 = Math.floor(rb / thumbPerRow);
        var bx = x + PAD + col2 * (thumbS + thumbGap);
        var by = ty + row2 * (thumbS + thumbGap);
        var bHov = (_hoverSlot === (900 + rb));

        ctx.fillStyle = bHov ? 'rgba(180,160,100,0.2)' : 'rgba(60,50,35,0.5)';
        _roundRectFill(ctx, bx, by, thumbS, thumbS, Math.round(3 * S));
        ctx.strokeStyle = bHov ? COL.accent : 'rgba(180,160,120,0.3)';
        ctx.lineWidth = 1;
        _roundRectStroke(ctx, bx, by, thumbS, thumbS, Math.round(3 * S));

        var bookEmojiFont = Math.max(12, Math.round(22 * S));
        ctx.font = bookEmojiFont + 'px serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(bk.emoji || '\uD83D\uDCD6', bx + thumbS / 2, by + thumbS / 2 + Math.round(4 * S));

        _hitZones.push({ x: bx, y: by, w: thumbS, h: thumbS, slot: 900 + rb, action: 'read_book' });

        if (bHov) {
          _hoverDetail = { item: { name: bk.title || bk.id, emoji: bk.emoji || '\uD83D\uDCD6',
            description: bk.category || '' }, x: bx + thumbS, y: by };
        }
      }

      ty += Math.ceil(maxVisible / thumbPerRow) * (thumbS + thumbGap);

      if (readBooks.length > maxVisible) {
        ctx.fillStyle = COL.dim;
        ctx.font = F_SECTION + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+' + (readBooks.length - maxVisible) + ' more', x + w / 2, ty + Math.round(4 * S));
        ty += Math.round(14 * S);
      }
    }

    // ── Section 4: Skill tree stub ──
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + PAD, ty); ctx.lineTo(x + w - PAD, ty);
    ctx.stroke();
    ty += Math.round(8 * S);

    ctx.fillStyle = COL.dim;
    ctx.font = F_SECTION + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SKILLS', x + PAD, ty + Math.round(6 * S));
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('COMING SOON', x + w - PAD, ty + Math.round(6 * S));
    ty += Math.round(14 * S);

    // Flat stat preview (jam scope: STR, DEX, Stealth)
    var statDefs = [
      { label: 'STR', val: ps.str || 1, color: '#f88' },
      { label: 'DEX', val: ps.dex || 1, color: '#8f8' },
      { label: 'STE', val: ps.stealth || 1, color: '#88f' }
    ];
    var statBlockW = Math.round(w / statDefs.length);
    ctx.font = F_SMALL + 'px monospace';
    for (var sti = 0; sti < statDefs.length; sti++) {
      var sd = statDefs[sti];
      var stX = x + sti * statBlockW + statBlockW / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = sd.color;
      ctx.fillText(sd.label + ' ' + sd.val, stX, ty + 2);
    }
    ty += Math.round(16 * S);

    // ── Section 5: Lore stub ──
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + PAD, ty); ctx.lineTo(x + w - PAD, ty);
    ctx.stroke();
    ty += Math.round(8 * S);

    ctx.fillStyle = COL.dim;
    ctx.font = F_SECTION + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LORE', x + PAD, ty + Math.round(6 * S));
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillText('0 entries', x + w - PAD, ty + Math.round(6 * S));
    ty += Math.round(14 * S);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = F_SMALL + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Discover lore by exploring the world', x + w / 2, ty + 2);

    // ── Day/time info + hint ──
    if (typeof DayCycle !== 'undefined') {
      var dayNum = DayCycle.getDay() + 1;
      var dayLabel = DayCycle.getDayLabel ? DayCycle.getDayLabel() : DayCycle.getDayOfWeek();
      var dayLblColor = DayCycle.getDayLabelColor ? DayCycle.getDayLabelColor() : null;
      var dow = DayCycle.getDayOfWeekFull ? DayCycle.getDayOfWeekFull() : '';
      var tStr = DayCycle.getTimeString();
      var pIcon = DayCycle.getPhaseIcon ? DayCycle.getPhaseIcon() : '';

      // Row 1: Day label (suit on hero days / day name) + time
      ctx.font = F_SMALL + 'px monospace';
      ctx.textAlign = 'center';
      // Use suit color on hero days
      if (dayLblColor) {
        // Draw: "♠ Wednesday  ☀ 08:00" with colored suit
        var prefix = dayLabel + ' ';
        var rest = dow + '  ' + pIcon + ' ' + tStr;
        var prefW = ctx.measureText(prefix).width;
        var restW = ctx.measureText(rest).width;
        var rowStart = x + w / 2 - (prefW + restW) / 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = dayLblColor;
        ctx.fillText(prefix, rowStart, y + h - Math.round(32 * S));
        ctx.fillStyle = COL.accent;
        ctx.fillText(rest, rowStart + prefW, y + h - Math.round(32 * S));
        ctx.textAlign = 'center';
      } else {
        ctx.fillStyle = COL.accent;
        ctx.fillText(dow + '  ' + pIcon + ' ' + tStr, x + w / 2, y + h - Math.round(32 * S));
      }

      // Row 2: Total days survived
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('Day ' + dayNum + (dayNum === 1 ? '' : '  \u00B7  ' + dayNum + ' days survived'), x + w / 2, y + h - Math.round(20 * S));
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = F_HINT + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[Q/E] Browse   [ESC] Resume', x + w / 2, y + h - Math.round(6 * S));
    ctx.textAlign = 'left';
  }

  /**
   * B5.4 — Deck management section (rendered as part of unified inventory face).
   * Shows hand preview (5 slots) + backup deck grid.
   * Click backup card → move to hand. Click hand card → return to backup.
   */
  function _renderDeckSection(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face1', 'DECK'), '🂠');

    var hand = CardAuthority.getHand();
    var maxHand = (typeof Player !== 'undefined') ? CardAuthority.MAX_HAND : 5;

    // Suit symbols — use CardAuthority canonical data, else fallback
    var SUIT_EMOJI, SUIT_COLOR;
    if (typeof CardAuthority !== 'undefined' && CardAuthority.SUIT_DATA) {
      SUIT_EMOJI = {}; SUIT_COLOR = {};
      var _sd = CardAuthority.SUIT_DATA;
      for (var _sk in _sd) { SUIT_EMOJI[_sk] = _sd[_sk].sym; SUIT_COLOR[_sk] = _sd[_sk].color; }
    } else {
      SUIT_EMOJI = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };
      SUIT_COLOR = { spade: 'rgba(180,170,150,0.85)', club: '#00D4FF', diamond: '#00FFA6', heart: '#FF6B9D' };
    }
    var RARITY_COL = {
      common: '#aaa', uncommon: '#4cf', rare: '#c8f',
      epic: '#fa4', legendary: '#ff0'
    };

    // ── Hand preview (5 slots across top) ──────────────────────
    ctx.fillStyle = COL.dim;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HAND  ' + hand.length + '/' + maxHand, x + w / 2, ty + 10);
    ty += 16;

    var cardW = 52;
    var cardH = 72;
    var cardGap = 6;
    var handTotalW = 5 * cardW + 4 * cardGap;
    var handX = x + (w - handTotalW) / 2;

    for (var hi = 0; hi < 5; hi++) {
      var cx = handX + hi * (cardW + cardGap);
      var card = hand[hi];

      if (card) {
        var isHov = (_hoverSlot === (500 + hi));
        // Unified card rendering via CardDraw (MEDIUM LOD)
        if (typeof CardDraw !== 'undefined') {
          CardDraw.drawCardInTile(ctx, card, cx + cardW / 2, ty + cardH / 2, cardW, cardH, isHov);
        }
        // Hit zone: click to return to backup
        _hitZones.push({ x: cx, y: ty, w: cardW, h: cardH, slot: 500 + hi, action: 'hand_to_backup' });
      } else {
        // Empty hand slot
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        _roundRectStroke(ctx, cx, ty, cardW, cardH, 3);
        ctx.setLineDash([]);
      }
    }

    ty += cardH + 10;

    // ── Backup deck grid (scrollable, 4 cols) ──────────────────
    ctx.fillStyle = COL.dim;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    var backupDeck = CardAuthority.getBackup();
    ctx.fillText('BACKUP DECK  (' + backupDeck.length + ')', x + w / 2, ty + 8);
    ty += 14;

    if (backupDeck.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '12px monospace';
      ctx.fillText('Empty — pick up cards to build your deck', x + w / 2, ty + 20);
    } else {
      var bCols = 4;
      var bSlotW = 36;
      var bSlotH = 50;
      var bGap = 4;
      var bGridW = bCols * bSlotW + (bCols - 1) * bGap;
      var bGridX = x + (w - bGridW) / 2;
      var bRows = Math.ceil(backupDeck.length / bCols);
      var maxVisible = Math.min(bRows, 3);  // Show max 3 rows in the panel

      for (var br = 0; br < maxVisible; br++) {
        for (var bc = 0; bc < bCols; bc++) {
          var bi = br * bCols + bc;
          if (bi >= backupDeck.length) break;
          var bCard = backupDeck[bi];
          var bx = bGridX + bc * (bSlotW + bGap);
          var by = ty + br * (bSlotH + bGap);
          var bHov = (_hoverSlot === (600 + bi));

          // Unified card rendering via CardDraw (SMALL LOD for backup grid)
          if (typeof CardDraw !== 'undefined') {
            CardDraw.drawCardInTile(ctx, bCard, bx + bSlotW / 2, by + bSlotH / 2, bSlotW, bSlotH, bHov);
          }
          // Hit zone: click to add to hand
          _hitZones.push({ x: bx, y: by, w: bSlotW, h: bSlotH, slot: 600 + bi, action: 'backup_to_hand' });
        }
      }

      ty += maxVisible * (bSlotH + bGap) + 4;

      // Overflow indicator
      if (bRows > maxVisible) {
        ctx.fillStyle = COL.dim;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▼ ' + (backupDeck.length - maxVisible * bCols) + ' more cards', x + w / 2, ty + 6);
        ty += 14;
      }
    }

    // ── Bottom hint ─────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[Click] Shuttle cards  [Drag→🔥] Dispose  [Q/E] Rotate', x + w / 2, y + h - 8);
    ctx.textAlign = 'left';
  }

  function _renderStash(ctx, x, y, w, h) {
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.stash_title', 'STASH'), '📦', S);

    var F_BODY  = Math.max(10, Math.round(14 * S));
    var F_SMALL = Math.max(9, Math.round(13 * S));

    // Stash description
    ctx.fillStyle = COL.text;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(i18n.t('shop.stash_desc', 'Items stored here survive death'),
                 x + w / 2, ty + Math.round(12 * S));

    // Stash grid (4×5 = 20 slots)
    var cols = 4;
    var rows = 5;
    var slotSize = Math.min(Math.floor((w - 20) / cols), Math.floor((h - 80) / rows), 52);
    var gridW = cols * (slotSize + 4);
    var gridX = x + (w - gridW) / 2;
    var gridY = ty + 24;

    var stash = CardAuthority.getStash();
    var maxStash = 20; // CardAuthority.MAX_STASH

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col;
        var sx = gridX + col * (slotSize + 4);
        var sy = gridY + row * (slotSize + 4);
        var stashItem = stash[idx];

        if (stashItem) {
          var isHov = (_hoverSlot === (400 + idx));
          ctx.fillStyle = isHov ? 'rgba(51,255,136,0.08)' : COL.slot_bg;
          _roundRectFill(ctx, sx, sy, slotSize, slotSize, 4);
          ctx.strokeStyle = isHov ? COL.accent : 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, sx, sy, slotSize, slotSize, 4);

          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(stashItem.emoji || '?', sx + slotSize / 2, sy + slotSize / 2 + 2);

          ctx.font = '6px monospace';
          ctx.fillStyle = COL.text;
          var nm = stashItem.name || '';
          if (nm.length > 7) nm = nm.substring(0, 6) + '\u2026';
          ctx.fillText(nm, sx + slotSize / 2, sy + slotSize - 3);

          // Click to move to bag (slot 400+ range)
          _hitZones.push({ x: sx, y: sy, w: slotSize, h: slotSize, slot: 400 + idx, action: 'unstash' });
        } else {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, sx, sy, slotSize, slotSize, 4);
          ctx.setLineDash([]);
        }
      }
    }

    // Capacity
    ctx.fillStyle = COL.dim;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(stash.length + ' / ' + maxStash + ' ' + i18n.t('shop.stash_capacity', 'slots'),
                 x + w / 2, gridY + rows * (slotSize + 4) + 12);

    // Hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px monospace';
    ctx.fillText('[Click] Move to bag', x + w / 2, gridY + rows * (slotSize + 4) + 24);
  }

  function _renderShopBuy(ctx, x, y, w, h) {
    var S = Math.min(w, h) / 400;
    var factionEmoji = (typeof Shop !== 'undefined') ? Shop.getFactionEmoji(Shop.getCurrentFaction()) : '🛒';
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.buy_title', 'BUY CARDS'), factionEmoji, S);

    var currency = Player.state().currency;

    // Currency display
    ctx.fillStyle = COL.currency;
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('💰 ' + currency, x + w - 8, ty + 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    ctx.font = '12px monospace';
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
    ctx.font = '12px monospace';
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
  var EQUIP_LABELS = ['\u2694\uFE0F Weapon', '\uD83E\uDDEA Item', '\uD83D\uDD11 Key'];

  // ── Inventory scroll state (persists while menu is open) ──────
  var _bagOffset    = 0;     // Bag wheel scroll offset
  var _deckOffset   = 0;     // Deck wheel scroll offset
  var _invFocus     = 'bag'; // Which wheel has focus: 'bag' | 'deck'
  var _bagExpanded  = false; // Bag expander toggled open
  var _deckExpanded = false; // Deck expander toggled open
  var EMPTY_COLLAPSE_THRESHOLD = 2; // Hide empties behind expander if > this many

  // Suit / rarity display helpers
  var INV_SUIT_EMOJI = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };
  var INV_SUIT_COLOR = { spade: '#8888ff', club: '#88ff88', diamond: '#ff8888', heart: '#ff88ff' };
  var INV_RARITY_COL = {
    common: '#aaa', uncommon: '#4cf', rare: '#c8f',
    epic: '#fa4', legendary: '#ff0'
  };

  /**
   * B6 — Unified inventory + deck face with full-width scroll wheels.
   *
   * Layout (top to bottom):
   *   1. Equipped quick-slots (3 across, legible)
   *   2. Bag wheel (5 visible, scrollable, full content width)
   *   3. Hand strip (5 card slots, full size)
   *   4. Deck wheel (5 visible, scrollable, full content width)
   *   5. Currency + hint row
   *
   * Keys 1-5 fire against the focused wheel.
   * Q/E scroll the focused wheel.
   * TAB toggles focus between bag and deck.
   * Click any slot for equip/transfer actions.
   */
  function _renderInventory(ctx, x, y, w, h) {
    // ================================================================
    // SCALE-AWARE LAYOUT
    // The menu face renders inside a MenuBox content area that is ~70%
    // of the viewport on-screen. All sizes are derived from (w, h) so
    // they fill the available space. Font sizes are bumped ~40% over
    // what you'd normally use because perceived size ≈ 70%.
    // ================================================================
    var ps = Player.state();

    // ── Global scale factors ────────────────────────────────────
    var S  = Math.min(w, h) / 400;         // Unitless scale from content area
    var GAP     = Math.round(6 * S);       // Universal inter-slot gap
    var RAD     = Math.round(5 * S);       // Border radius
    var CHEV_W  = Math.round(28 * S);      // Chevron button width
    var CHEV_H;                            // Set per-section
    var SECT_PAD = Math.round(4 * S);      // Vertical pad between sections

    // ── Font scale helpers (px values pre-compensate for 30% shrink) ─
    var F_TITLE   = Math.round(20 * S) + 'px monospace';
    var F_SECTION = Math.round(16 * S) + 'px monospace';
    var F_SECTION_B = 'bold ' + Math.round(16 * S) + 'px monospace';
    var F_EMOJI   = Math.round(30 * S) + 'px serif';
    var F_LABEL   = Math.round(15 * S) + 'px monospace';
    var F_HINT    = Math.round(14 * S) + 'px monospace';
    var F_CHEV    = Math.round(22 * S) + 'px sans-serif';
    var F_COUNT   = Math.round(14 * S) + 'px monospace';
    var F_CURRENCY = Math.round(16 * S) + 'px monospace';
    var F_EXPANDER = 'bold ' + Math.round(15 * S) + 'px monospace';

    // ── Vertical budget — proportional fill ─────────────────────
    // Title:   fixed
    // Equip:   15% of body
    // Bag:     20%
    // Hand:    30%
    // Deck:    20%
    // Footer:  15%
    var TITLE_H = Math.round(38 * S);
    var bodyH = h - TITLE_H;
    var eqH    = Math.floor(bodyH * 0.14);
    var bagH   = Math.floor(bodyH * 0.20);
    var handH  = Math.floor(bodyH * 0.30);
    var deckH  = Math.floor(bodyH * 0.20);
    var footH  = bodyH - eqH - bagH - handH - deckH;

    // ── Title ──────────────────────────────────────────────────
    ctx.fillStyle = COL.title;
    ctx.font = 'bold ' + F_TITLE;
    ctx.textAlign = 'center';
    ctx.fillText('\uD83C\uDF92 ' + i18n.t('menu.face2', 'Inventory'), x + w / 2, y + Math.round(24 * S));
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.round(10 * S), y + Math.round(32 * S));
    ctx.lineTo(x + w - Math.round(10 * S), y + Math.round(32 * S));
    ctx.stroke();
    var ty = y + TITLE_H;

    // ════════════════════════════════════════════════════════════
    // Section 1: EQUIPPED (3 across, always visible)
    // ════════════════════════════════════════════════════════════
    var equipped = CardAuthority.getEquipped();
    var eqGap   = Math.round(10 * S);
    var eqSlotW = Math.floor((w * 0.82 - 2 * eqGap) / 3);
    var eqSlotH = eqH - SECT_PAD;
    var eqTotalW = 3 * eqSlotW + 2 * eqGap;
    var eqX = x + (w - eqTotalW) / 2;
    var eqStartY = ty;

    for (var e = 0; e < 3; e++) {
      var sx = eqX + e * (eqSlotW + eqGap);
      var item = equipped[e];
      var eHov = (_hoverSlot === (100 + e));
      if (item) {
        ctx.fillStyle = eHov ? 'rgba(51,255,136,0.12)' : COL.slot_bg;
        _roundRectFill(ctx, sx, ty, eqSlotW, eqSlotH, RAD);
        ctx.strokeStyle = eHov ? COL.accent : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = eHov ? 2.5 : 1.5;
        _roundRectStroke(ctx, sx, ty, eqSlotW, eqSlotH, RAD);
        ctx.font = F_EMOJI;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(item.emoji || '?', sx + eqSlotW / 2, ty + eqSlotH * 0.38);
        ctx.font = F_LABEL;
        ctx.fillStyle = COL.text;
        var iName = item.name || '';
        var maxChars = Math.max(5, Math.floor(eqSlotW / (8 * S)));
        if (iName.length > maxChars) iName = iName.substring(0, maxChars - 1) + '\u2026';
        ctx.fillText(iName, sx + eqSlotW / 2, ty + eqSlotH * 0.68);
        _hitZones.push({ x: sx, y: ty, w: eqSlotW, h: eqSlotH, slot: 100 + e, action: 'unequip' });
      } else {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        _roundRectStroke(ctx, sx, ty, eqSlotW, eqSlotH, RAD);
        ctx.setLineDash([]);
        ctx.font = F_LABEL;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillText(EQUIP_LABELS[e], sx + eqSlotW / 2, ty + eqSlotH / 2 + Math.round(4 * S));
        // Still register hit zone for empty equip slots (drop target)
        _hitZones.push({ x: sx, y: ty, w: eqSlotW, h: eqSlotH, slot: 100 + e, action: 'unequip' });
      }
    }
    ty += eqH;

    // ════════════════════════════════════════════════════════════
    // Section 2: BAG (adaptive wheel + expander)
    // ════════════════════════════════════════════════════════════
    var bag = CardAuthority.getBag();
    var bagMax = CardAuthority.MAX_BAG || 12;
    var bagFocused = (_invFocus === 'bag');
    var bagHeaderH = Math.round(22 * S);

    // Header
    ctx.fillStyle = bagFocused ? COL.accent : COL.dim;
    ctx.font = bagFocused ? F_SECTION_B : F_SECTION;
    ctx.textAlign = 'left';
    ctx.fillText(bagFocused ? '\u25C6 BAG' : '  BAG', x, ty + Math.round(14 * S));
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.dim;
    ctx.font = F_COUNT;
    ctx.fillText(bag.length + '/' + bagMax, x + w, ty + Math.round(14 * S));
    ty += bagHeaderH;

    var bagSlotH = bagH - bagHeaderH - SECT_PAD;
    var bagStartY = ty;
    CHEV_H = bagSlotH;

    // Adaptive slot count: filled + 1 placeholder + expander (if excess empties)
    var bagEmpty = bagMax - bag.length;
    var bagShowExpander = !_bagExpanded && bagEmpty > EMPTY_COLLAPSE_THRESHOLD;
    var bagVisCount = bag.length + (bagEmpty > 0 ? 1 : 0) + (bagShowExpander ? 1 : 0);
    if (_bagExpanded) bagVisCount = Math.max(bag.length + bagEmpty, 1);
    var bagMaxVis = Math.max(2, Math.floor((w - 2 * CHEV_W - 4 * GAP) / (bagSlotH + GAP)));
    var bagNeedScroll = bagVisCount > bagMaxVis;
    var bagDrawCount = Math.min(bagVisCount, bagMaxVis);
    var SLOT_S_BAG = bagSlotH;

    // Clamp offset
    var bagScrollMax = Math.max(0, bagVisCount - bagDrawCount);
    _bagOffset = Math.max(0, Math.min(bagScrollMax, _bagOffset));
    if (!bagNeedScroll) _bagOffset = 0;

    // Layout X positions
    var bagWheelW = bagDrawCount * SLOT_S_BAG + (bagDrawCount - 1) * GAP;
    var bagRowX = x + (w - bagWheelW - (bagNeedScroll ? 2 * (CHEV_W + GAP) : 0)) / 2;
    var bagChevLX = bagRowX;
    var bagSlotsX = bagRowX + (bagNeedScroll ? CHEV_W + GAP : 0);
    var bagChevRX = bagSlotsX + bagWheelW + GAP;

    // Focus ring
    if (bagFocused) {
      var ringX = bagSlotsX - Math.round(3 * S);
      var ringW = bagWheelW + Math.round(6 * S);
      ctx.strokeStyle = 'rgba(255,215,0,0.4)';
      ctx.lineWidth = 2;
      _roundRectStroke(ctx, ringX, ty - Math.round(3 * S), ringW, SLOT_S_BAG + Math.round(6 * S), RAD + 2);
    }

    // Left chevron
    if (bagNeedScroll) {
      var bagCanLeft = _bagOffset > 0;
      ctx.fillStyle = bagCanLeft ? 'rgba(200,200,180,0.8)' : 'rgba(200,200,180,0.15)';
      ctx.font = F_CHEV;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25C0', bagChevLX + CHEV_W / 2, ty + SLOT_S_BAG / 2);
      _hitZones.push({ x: bagChevLX, y: ty, w: CHEV_W, h: SLOT_S_BAG, slot: 700, action: 'bag_scroll_left' });
    }

    // Build virtual slot list: [filled items...] [empty placeholder?] [expander?]
    // or if expanded: [filled items...] [all empty placeholders...]
    var bagSlotData = []; // { type: 'item'|'empty'|'expander', index, item }
    for (var _bfi = 0; _bfi < bag.length; _bfi++) {
      bagSlotData.push({ type: 'item', index: _bfi, item: bag[_bfi] });
    }
    if (_bagExpanded) {
      for (var _bei = bag.length; _bei < bagMax; _bei++) {
        bagSlotData.push({ type: 'empty', index: _bei, item: null });
      }
    } else {
      if (bagEmpty > 0 && bagEmpty <= EMPTY_COLLAPSE_THRESHOLD) {
        for (var _bse = 0; _bse < bagEmpty; _bse++) {
          bagSlotData.push({ type: 'empty', index: bag.length + _bse, item: null });
        }
      } else if (bagEmpty > 0) {
        bagSlotData.push({ type: 'empty', index: bag.length, item: null });
        bagSlotData.push({ type: 'expander', index: -1, item: null, count: bagEmpty - 1 });
      }
    }

    // Render visible slots
    var bagSlotBounds = [];
    for (var bs = 0; bs < bagDrawCount; bs++) {
      var bsx = bagSlotsX + bs * (SLOT_S_BAG + GAP);
      var bvi = _bagOffset + bs;
      var bSlot = (bvi < bagSlotData.length) ? bagSlotData[bvi] : null;

      if (!bSlot || bSlot.type === 'empty') {
        // Empty placeholder
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        _roundRectFill(ctx, bsx, ty, SLOT_S_BAG, SLOT_S_BAG, RAD);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1.5;
        _roundRectStroke(ctx, bsx, ty, SLOT_S_BAG, SLOT_S_BAG, RAD);
        ctx.setLineDash([]);
        // Placeholder label
        ctx.font = F_LABEL;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillText('\u2500', bsx + SLOT_S_BAG / 2, ty + SLOT_S_BAG / 2 + Math.round(4 * S));
        bagSlotBounds.push({ x: bsx, y: ty, w: SLOT_S_BAG, h: SLOT_S_BAG });
      } else if (bSlot.type === 'expander') {
        // Expander: "+N" — clickable & droppable
        ctx.fillStyle = 'rgba(156,39,176,0.08)';
        _roundRectFill(ctx, bsx, ty, SLOT_S_BAG, SLOT_S_BAG, RAD);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(156,39,176,0.35)';
        ctx.lineWidth = 1.5;
        _roundRectStroke(ctx, bsx, ty, SLOT_S_BAG, SLOT_S_BAG, RAD);
        ctx.setLineDash([]);
        ctx.font = F_EXPANDER;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(156,39,176,0.6)';
        ctx.fillText('+' + bSlot.count, bsx + SLOT_S_BAG / 2, ty + SLOT_S_BAG / 2 + Math.round(5 * S));
        _hitZones.push({ x: bsx, y: ty, w: SLOT_S_BAG, h: SLOT_S_BAG, slot: 750, action: 'expand_bag' });
        bagSlotBounds.push({ x: bsx, y: ty, w: SLOT_S_BAG, h: SLOT_S_BAG });
      } else {
        // Filled item slot
        var bagItem = bSlot.item;
        var bdi = bSlot.index;
        var bHov = (_hoverSlot === (200 + bdi));
        var isCardInBag = bagItem && (bagItem._bagStored || (bagItem.suit !== undefined && bagItem.value !== undefined));

        ctx.fillStyle = bHov ? 'rgba(51,255,136,0.12)' : COL.slot_bg;
        _roundRectFill(ctx, bsx, ty, SLOT_S_BAG, SLOT_S_BAG, RAD);
        if (isCardInBag) {
          ctx.fillStyle = 'rgba(128,0,255,0.14)';
          _roundRectFill(ctx, bsx + 2, ty + 2, SLOT_S_BAG - 4, SLOT_S_BAG - 4, RAD - 1);
        }
        ctx.strokeStyle = bHov ? COL.accent : (bagFocused ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.25)');
        ctx.lineWidth = bHov ? 2.5 : 1.5;
        _roundRectStroke(ctx, bsx, ty, SLOT_S_BAG, SLOT_S_BAG, RAD);

        // Emoji
        var bagEmoji = isCardInBag ? '\uD83C\uDCCF' : (bagItem.emoji || '\uD83D\uDCE6');
        ctx.font = F_EMOJI;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(bagEmoji, bsx + SLOT_S_BAG / 2, ty + SLOT_S_BAG * 0.4);

        // Name
        ctx.font = F_LABEL;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = COL.text;
        var bName = bagItem.name || '';
        var bMaxC = Math.max(4, Math.floor(SLOT_S_BAG / (9 * S)));
        if (bName.length > bMaxC) bName = bName.substring(0, bMaxC - 1) + '\u2026';
        ctx.fillText(bName, bsx + SLOT_S_BAG / 2, ty + SLOT_S_BAG * 0.82);

        _hitZones.push({ x: bsx, y: ty, w: SLOT_S_BAG, h: SLOT_S_BAG, slot: 200 + bdi, action: 'equip' });
        bagSlotBounds.push({ x: bsx, y: ty, w: SLOT_S_BAG, h: SLOT_S_BAG });
      }
    }
    ctx.textBaseline = 'alphabetic';

    // Right chevron
    if (bagNeedScroll) {
      var bagCanRight = _bagOffset + bagDrawCount < bagVisCount;
      ctx.fillStyle = bagCanRight ? 'rgba(200,200,180,0.8)' : 'rgba(200,200,180,0.15)';
      ctx.font = F_CHEV;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25B6', bagChevRX + CHEV_W / 2, ty + SLOT_S_BAG / 2);
      ctx.textBaseline = 'alphabetic';
      _hitZones.push({ x: bagChevRX, y: ty, w: CHEV_W, h: SLOT_S_BAG, slot: 701, action: 'bag_scroll_right' });
    }
    ty += bagH;

    // ════════════════════════════════════════════════════════════
    // Section 3: HAND (5 card slots, proportional)
    // ════════════════════════════════════════════════════════════
    var hand = CardAuthority.getHand();
    var maxHand = CardAuthority.MAX_HAND || 5;
    var handHeaderH = Math.round(22 * S);

    ctx.fillStyle = COL.dim;
    ctx.font = F_SECTION;
    ctx.textAlign = 'left';
    ctx.fillText('  HAND', x, ty + Math.round(14 * S));
    ctx.textAlign = 'right';
    ctx.font = F_COUNT;
    ctx.fillText(hand.length + '/' + maxHand, x + w, ty + Math.round(14 * S));
    ty += handHeaderH;

    var handSlotH = handH - handHeaderH - SECT_PAD;
    var cardH = handSlotH;
    var cardW = Math.floor(cardH / 1.35);
    var cardGap = Math.round(8 * S);
    var handTotalW = 5 * cardW + 4 * cardGap;
    // Clamp if too wide for content area
    if (handTotalW > w * 0.92) {
      cardW = Math.floor((w * 0.92 - 4 * cardGap) / 5);
      cardH = Math.floor(cardW * 1.35);
      handTotalW = 5 * cardW + 4 * cardGap;
    }
    var handX = x + (w - handTotalW) / 2;
    var handStartY = ty;

    for (var hi = 0; hi < 5; hi++) {
      var hcx = handX + hi * (cardW + cardGap);
      var card = hand[hi];
      if (card) {
        var hHov = (_hoverSlot === (500 + hi));
        if (typeof CardDraw !== 'undefined') {
          CardDraw.drawCardInTile(ctx, card, hcx + cardW / 2, ty + cardH / 2, cardW, cardH, hHov);
        }
        _hitZones.push({ x: hcx, y: ty, w: cardW, h: cardH, slot: 500 + hi, action: 'hand_to_backup' });
      } else {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        _roundRectStroke(ctx, hcx, ty, cardW, cardH, RAD);
        ctx.setLineDash([]);
        // Empty hand placeholder
        ctx.font = F_LABEL;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillText('\u2500', hcx + cardW / 2, ty + cardH / 2 + Math.round(4 * S));
      }
    }
    ty += handH;

    // ════════════════════════════════════════════════════════════
    // Section 4: DECK (adaptive wheel + expander)
    // ════════════════════════════════════════════════════════════
    var collection = CardAuthority.getBackup();
    var deckFocused = (_invFocus === 'deck');
    var deckHeaderH = Math.round(22 * S);

    ctx.fillStyle = deckFocused ? COL.accent : COL.dim;
    ctx.font = deckFocused ? F_SECTION_B : F_SECTION;
    ctx.textAlign = 'left';
    ctx.fillText(deckFocused ? '\u25C6 DECK' : '  DECK', x, ty + Math.round(14 * S));
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.dim;
    ctx.font = F_COUNT;
    ctx.fillText('' + collection.length, x + w, ty + Math.round(14 * S));
    ty += deckHeaderH;

    var deckSlotH = deckH - deckHeaderH - SECT_PAD;
    var deckStartY = ty;
    var SLOT_S_DECK = deckSlotH;

    // Deck is unbounded size — use scroll, no expander needed (deck has no "max")
    // but we still use adaptive visible count
    var deckDrawCount = Math.max(2, Math.floor((w - 2 * CHEV_W - 4 * GAP) / (SLOT_S_DECK + GAP)));
    var deckVisCount = Math.max(collection.length, 1);
    var deckNeedScroll = deckVisCount > deckDrawCount;
    deckDrawCount = Math.min(deckVisCount, deckDrawCount);
    var deckScrollMax = Math.max(0, deckVisCount - deckDrawCount);
    _deckOffset = Math.max(0, Math.min(deckScrollMax, _deckOffset));
    if (!deckNeedScroll) _deckOffset = 0;

    // Layout X
    var deckWheelW = deckDrawCount * SLOT_S_DECK + (deckDrawCount - 1) * GAP;
    var deckRowX = x + (w - deckWheelW - (deckNeedScroll ? 2 * (CHEV_W + GAP) : 0)) / 2;
    var deckChevLX = deckRowX;
    var deckSlotsX = deckRowX + (deckNeedScroll ? CHEV_W + GAP : 0);
    var deckChevRX = deckSlotsX + deckWheelW + GAP;

    // Focus ring
    if (deckFocused) {
      ctx.strokeStyle = 'rgba(255,215,0,0.4)';
      ctx.lineWidth = 2;
      _roundRectStroke(ctx, deckSlotsX - Math.round(3 * S), ty - Math.round(3 * S),
        deckWheelW + Math.round(6 * S), SLOT_S_DECK + Math.round(6 * S), RAD + 2);
    }

    // Left chevron
    if (deckNeedScroll) {
      var deckCanLeft = _deckOffset > 0;
      ctx.fillStyle = deckCanLeft ? 'rgba(200,200,180,0.8)' : 'rgba(200,200,180,0.15)';
      ctx.font = F_CHEV;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25C0', deckChevLX + CHEV_W / 2, ty + SLOT_S_DECK / 2);
      _hitZones.push({ x: deckChevLX, y: ty, w: CHEV_W, h: SLOT_S_DECK, slot: 710, action: 'deck_scroll_left' });
    }

    // Deck slots
    var deckSlotBounds = [];
    for (var ds = 0; ds < deckDrawCount; ds++) {
      var dsx = deckSlotsX + ds * (SLOT_S_DECK + GAP);
      var ddi = _deckOffset + ds;
      var dCard = (ddi < collection.length) ? collection[ddi] : null;
      var dHov = (_hoverSlot === (600 + ddi));

      if (dCard) {
        ctx.fillStyle = dHov ? 'rgba(100,255,100,0.12)' : 'rgba(40,35,50,0.6)';
        _roundRectFill(ctx, dsx, ty, SLOT_S_DECK, SLOT_S_DECK, RAD);
        ctx.strokeStyle = dHov ? COL.accent : (deckFocused ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.25)');
        ctx.lineWidth = dHov ? 2.5 : 1.5;
        _roundRectStroke(ctx, dsx, ty, SLOT_S_DECK, SLOT_S_DECK, RAD);
        if (typeof CardDraw !== 'undefined') {
          CardDraw.drawCardInTile(ctx, dCard, dsx + SLOT_S_DECK / 2, ty + SLOT_S_DECK / 2, SLOT_S_DECK, SLOT_S_DECK, dHov);
        }
        _hitZones.push({ x: dsx, y: ty, w: SLOT_S_DECK, h: SLOT_S_DECK, slot: 600 + ddi, action: 'backup_to_hand' });
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        _roundRectFill(ctx, dsx, ty, SLOT_S_DECK, SLOT_S_DECK, RAD);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1.5;
        _roundRectStroke(ctx, dsx, ty, SLOT_S_DECK, SLOT_S_DECK, RAD);
        ctx.setLineDash([]);
      }
      deckSlotBounds.push({ x: dsx, y: ty, w: SLOT_S_DECK, h: SLOT_S_DECK });
    }
    ctx.textBaseline = 'alphabetic';

    // Right chevron
    if (deckNeedScroll) {
      var deckCanRight = _deckOffset + deckDrawCount < deckVisCount;
      ctx.fillStyle = deckCanRight ? 'rgba(200,200,180,0.8)' : 'rgba(200,200,180,0.15)';
      ctx.font = F_CHEV;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u25B6', deckChevRX + CHEV_W / 2, ty + SLOT_S_DECK / 2);
      ctx.textBaseline = 'alphabetic';
      _hitZones.push({ x: deckChevRX, y: ty, w: CHEV_W, h: SLOT_S_DECK, slot: 711, action: 'deck_scroll_right' });
    }
    ty += deckH;

    // ════════════════════════════════════════════════════════════
    // Footer: Incinerator + Currency + Hint
    // ════════════════════════════════════════════════════════════
    var incinS = Math.min(Math.round(48 * S), footH - Math.round(20 * S));
    var incinX = x + Math.round(8 * S);
    var incinY = ty + (footH - incinS - Math.round(16 * S)) / 2;
    var incinHov = (_hoverSlot === 800);

    ctx.fillStyle = incinHov ? 'rgba(255,60,30,0.3)' : 'rgba(60,20,10,0.5)';
    _roundRectFill(ctx, incinX, incinY, incinS, incinS, RAD);
    ctx.strokeStyle = incinHov ? '#ff4422' : 'rgba(255,80,40,0.35)';
    ctx.lineWidth = incinHov ? 2.5 : 1.5;
    _roundRectStroke(ctx, incinX, incinY, incinS, incinS, RAD);
    ctx.font = Math.round(28 * S) + 'px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = incinHov ? '#ff6644' : 'rgba(255,100,60,0.7)';
    ctx.fillText('\uD83D\uDD25', incinX + incinS / 2, incinY + incinS * 0.64);
    _hitZones.push({ x: incinX, y: incinY, w: incinS, h: incinS, slot: 800, action: 'incinerator' });

    // Currency (centered)
    ctx.fillStyle = COL.currency;
    ctx.font = F_CURRENCY;
    ctx.textAlign = 'center';
    ctx.fillText('\uD83D\uDCB0 ' + ps.currency + 'g', x + w / 2, incinY + incinS / 2 + Math.round(5 * S));

    // Hint (bottom)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = F_HINT;
    ctx.textAlign = 'center';
    ctx.fillText('[Drag] Transfer  [Q/E] Scroll  [TAB] Focus', x + w / 2, y + h - Math.round(6 * S));
    ctx.textAlign = 'left';

    // ── Hover detail tooltip ────────────────────────────────────
    _hoverDetail = null;
    if (_hoverSlot >= 0) {
      var _hovItem = null, _hovHZ = null;
      for (var _hz = 0; _hz < _hitZones.length; _hz++) {
        if (_hitZones[_hz].slot === _hoverSlot) { _hovHZ = _hitZones[_hz]; break; }
      }
      if (_hovHZ) {
        if (_hoverSlot >= 100 && _hoverSlot < 200) {
          _hovItem = equipped[_hoverSlot - 100];
        } else if (_hoverSlot >= 200 && _hoverSlot < 300) {
          _hovItem = bag[_hoverSlot - 200];
        } else if (_hoverSlot >= 500 && _hoverSlot < 600) {
          _hovItem = hand[_hoverSlot - 500];
        } else if (_hoverSlot >= 600 && _hoverSlot < 700) {
          _hovItem = collection[_hoverSlot - 600];
        }
        if (_hovItem) {
          _hoverDetail = { item: _hovItem, x: _hovHZ.x + _hovHZ.w, y: _hovHZ.y };
          _drawHoverTooltip(ctx, _hoverDetail, x, w);
        }
      }
    }

    // ── Sync DragDrop per-slot zone bounds ─────────────────────
    if (typeof DragDrop !== 'undefined' && _dragZonesRegistered) {
      var eqSlots = [];
      for (var _ei = 0; _ei < 3; _ei++) {
        eqSlots.push({ x: eqX + _ei * (eqSlotW + eqGap), y: eqStartY, w: eqSlotW, h: eqSlotH });
      }
      // Pad bag/deck slot arrays to 5 (DragDrop expects 5 zones registered)
      var _bagBounds = [];
      for (var _bi = 0; _bi < 5; _bi++) {
        _bagBounds.push(bagSlotBounds[_bi] || { x: 0, y: 0, w: 0, h: 0 });
      }
      var handSlots = [];
      for (var _hi = 0; _hi < 5; _hi++) {
        handSlots.push({ x: handX + _hi * (cardW + cardGap), y: handStartY, w: cardW, h: cardH });
      }
      var _deckBounds = [];
      for (var _di = 0; _di < 5; _di++) {
        _deckBounds.push(deckSlotBounds[_di] || { x: 0, y: 0, w: 0, h: 0 });
      }
      // Determine expander bounds from hit zones (slot 750 = bag expander)
      var _expanderBounds = null;
      for (var _hzx = 0; _hzx < _hitZones.length; _hzx++) {
        if (_hitZones[_hzx].slot === 750) {
          _expanderBounds = { x: _hitZones[_hzx].x, y: _hitZones[_hzx].y,
                              w: _hitZones[_hzx].w, h: _hitZones[_hzx].h };
          break;
        }
      }
      // Activate/deactivate expander DragDrop zone
      if (typeof DragDrop !== 'undefined') {
        DragDrop.setZoneActive('inv-bag-expander', !!_expanderBounds);
        if (_expanderBounds) {
          DragDrop.updateZone('inv-bag-expander', _expanderBounds);
        }
      }
      _storeInvLayout({
        eqSlots: eqSlots, bagSlots: _bagBounds, handSlots: handSlots, deckSlots: _deckBounds,
        incin: { x: incinX, y: incinY, w: incinS, h: incinS },
        bagExpander: _expanderBounds
      });
      _drawSelectionHighlights(ctx);
    }
  }

  /**
   * Bonfire context: two-panel vault interface.
   * Left panel = BAG (12 slots, 3×4 grid)
   * Right panel = STASH / VAULT (20 slots, 4×5 grid)
   * Click item in either panel to transfer to the other.
   * Interior floors (N.N) only — exterior/dungeon bonfires skip stash.
   */
  function _renderBag(ctx, x, y, w, h) {
    var bag = CardAuthority.getBag();
    var stash = CardAuthority.getStash();
    var hasVault = _hasVaultAccess();

    // ── Title ──
    var titleText = hasVault ? 'BAG ↔ VAULT' : 'BAG';
    var ty = _drawTitle(ctx, x, y, w, i18n.t('bonfire.vault_title', titleText), '🎒');
    ty += 4;

    var cols, slotSize, gap;

    if (hasVault) {
      // ── Two-panel layout ──────────────────────────────────────────
      gap = 8;
      var halfW = Math.floor((w - gap - 24) / 2);
      cols = 3;
      slotSize = Math.min(Math.floor((halfW - 8) / cols) - 4, TILE_SIZE);

      var bagGridW = cols * (slotSize + 4);
      var stashCols = 4;
      var stashSlotSize = Math.min(Math.floor((halfW - 8) / stashCols) - 4, TILE_SIZE);
      var stashGridW = stashCols * (stashSlotSize + 4);

      var panelLX = x + 12;
      var panelRX = x + 12 + halfW + gap;

      // ── Left panel: BAG ──
      ctx.fillStyle = COL.accent;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BAG (' + bag.length + '/' + CardAuthority.MAX_BAG + ')', panelLX + halfW / 2, ty + 10);

      var bagY = ty + 16;
      var bagRows = Math.ceil(CardAuthority.MAX_BAG / cols);
      var bagGridX = panelLX + (halfW - bagGridW) / 2;
      _renderSlotGrid(ctx, bag, CardAuthority.MAX_BAG, cols, slotSize, bagGridX, bagY, bagRows,
                       300, 'bag-to-stash');

      // ── Right panel: VAULT / STASH ──
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VAULT (' + stash.length + '/' + CardAuthority.MAX_STASH + ')', panelRX + halfW / 2, ty + 10);

      var stashY = ty + 16;
      var stashRows = Math.ceil(CardAuthority.MAX_STASH / stashCols);
      var stashGridX = panelRX + (halfW - stashGridW) / 2;
      _renderSlotGrid(ctx, stash, CardAuthority.MAX_STASH, stashCols, stashSlotSize, stashGridX, stashY,
                       stashRows, 500, 'stash-to-bag');

      // ── Divider line ──
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 12 + halfW + gap / 2, ty + 10);
      ctx.lineTo(x + 12 + halfW + gap / 2, y + h - 20);
      ctx.stroke();

      // ── Keyboard hint ──
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Click] Transfer   [Q/E] Switch pane   [ESC] Leave', x + w / 2, y + h - 8);

    } else {
      // ── Single panel: BAG only (exterior/dungeon bonfires) ────────
      cols = 4;
      slotSize = Math.min(Math.floor((w - 20) / cols) - 4, TILE_SIZE);
      var gridW2 = cols * (slotSize + 4);
      var gridX2 = x + (w - gridW2) / 2;

      ctx.fillStyle = COL.dim;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bag.length + ' / ' + CardAuthority.MAX_BAG + ' slots', x + w / 2, ty + 10);
      ty += 16;

      var totalSlots2 = CardAuthority.MAX_BAG;
      var rows2 = Math.ceil(totalSlots2 / cols);
      _renderSlotGrid(ctx, bag, totalSlots2, cols, slotSize, gridX2, ty, rows2, 300, null);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Q/E] Switch pane   [ESC] Leave', x + w / 2, y + h - 8);
    }
    ctx.textAlign = 'left';
  }

  /**
   * Check if current bonfire floor has vault access.
   * Only interior floors (depth 2, format "N.N") have stash chests.
   */
  function _hasVaultAccess() {
    if (typeof FloorManager === 'undefined') return false;
    var floorId = FloorManager.getFloor();
    if (!floorId) return false;
    var parts = String(floorId).split('.');
    return parts.length === 2; // depth 2 = interior
  }

  /**
   * Shared grid renderer for bag/stash slot grids.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} items - Source array
   * @param {number} totalSlots - Max slots to render
   * @param {number} cols - Columns
   * @param {number} slotSize - Pixel size per slot
   * @param {number} gridX - Left edge
   * @param {number} gridY - Top edge
   * @param {number} rows - Row count
   * @param {number} slotBase - Hit zone slot ID base (300 for bag, 500 for stash)
   * @param {string|null} clickAction - 'bag-to-stash', 'stash-to-bag', or null
   */
  function _renderSlotGrid(ctx, items, totalSlots, cols, slotSize, gridX, gridY, rows, slotBase, clickAction) {
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col;
        if (idx >= totalSlots) break;
        var sx = gridX + col * (slotSize + 4);
        var sy = gridY + row * (slotSize + 4);
        var item = items[idx];

        if (item) {
          var isHov = (_hoverSlot === (slotBase + idx));
          var isCard = item._bagStored || (item.suit !== undefined && item.type === 'card');

          if (isCard) {
            // Cards in bag/stash: resource-tinted + purple glow
            var _src = _getCardResColor(item);
            ctx.fillStyle = isHov
              ? 'rgba(' + _src.r + ',' + _src.g + ',' + _src.b + ',0.14)'
              : 'rgba(128,0,255,0.06)';
            _roundRectFill(ctx, sx, sy, slotSize, slotSize, 4);
            ctx.strokeStyle = isHov
              ? 'rgba(' + _src.r + ',' + _src.g + ',' + _src.b + ',0.6)'
              : 'rgba(180,100,255,0.3)';
          } else {
            // Items: standard dark slot
            ctx.fillStyle = isHov ? 'rgba(51,255,136,0.08)' : COL.slot_bg;
            _roundRectFill(ctx, sx, sy, slotSize, slotSize, 4);
            ctx.strokeStyle = isHov ? COL.accent : 'rgba(255,255,255,0.15)';
          }
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, sx, sy, slotSize, slotSize, 4);

          ctx.font = Math.max(10, Math.floor(slotSize * 0.5)) + 'px serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(item.emoji || '?', sx + slotSize / 2, sy + slotSize / 2 + 2);

          ctx.font = Math.max(5, Math.floor(slotSize * 0.12)) + 'px monospace';
          ctx.fillStyle = isCard ? '#f0d070' : COL.text;
          var nm = item.name || '';
          if (nm.length > 7) nm = nm.substring(0, 6) + '\u2026';
          ctx.fillText(nm, sx + slotSize / 2, sy + slotSize - 2);

          if (clickAction) {
            _hitZones.push({ x: sx, y: sy, w: slotSize, h: slotSize, slot: slotBase + idx, action: clickAction });
          }
        } else {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          _roundRectStroke(ctx, sx, sy, slotSize, slotSize, 4);
          ctx.setLineDash([]);
        }
      }
    }
  }

  function _renderShopSell(ctx, x, y, w, h) {
    var ty = _drawTitle(ctx, x, y, w, i18n.t('shop.sell_title', 'SELL'), '💰');
    var factionId = (typeof Shop !== 'undefined') ? Shop.getCurrentFaction() : null;

    // Currency display
    ctx.fillStyle = COL.currency;
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('💰 ' + Player.state().currency, x + w - 8, ty + 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    ctx.font = '12px monospace';
    ctx.fillText(i18n.t('shop.sell_hint', 'Click to sell'), x + w / 2, ty + 12);
    ty += 20;

    // ── Card sell row (hand cards) ──────────────────────────────
    ctx.fillStyle = COL.dim;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CARDS', x + 8, ty + 8);
    ty += 12;

    var SELL_VALUE = { common: 12, uncommon: 24, rare: 40, epic: 72, legendary: 120 };
    var RARITY_COL = {
      common: '#aaa', uncommon: '#4cf', rare: '#c8f',
      epic: '#fa4', legendary: '#ff0'
    };

    var hand = CardAuthority.getHand();
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
    var bag = CardAuthority.getBag();
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
    ctx.font = '11px monospace';
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
      ctx.font = '12px monospace';
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
    ctx.font = '11px monospace';
    ctx.fillText('[W/S] Select   [Scroll] Adjust   [←/→] Switch pane   [ESC] Leave', x + w / 2, y + h - 8);
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

  /**
   * Toggle a settings boolean by key (screen shake, show FPS, minimap).
   * Called by game.js when a toggle row is clicked.
   */
  function handleSettingsToggle(key) {
    var toggleDefs = [
      { key: 'screenShake', default: true },
      { key: 'showFps', default: false },
      { key: 'minimapVisible', default: true }
    ];
    for (var i = 0; i < toggleDefs.length; i++) {
      if (toggleDefs[i].key === key) {
        var cur = _settingsState[key] !== undefined ? _settingsState[key] : toggleDefs[i].default;
        _settingsState[key] = !cur;
        // Wire side effects
        if (key === 'minimapVisible' && typeof Minimap !== 'undefined') {
          if (_settingsState[key]) Minimap.show(); else Minimap.hide();
        }
        return;
      }
    }
  }

  /**
   * Select a specific settings row by index.
   * Called when a slider track is clicked.
   */
  function handleSettingsSelectRow(rowIdx) {
    _settingsState.row = rowIdx;
  }

  // ── Renderer ─────────────────────────────────────────────────────

  /**
   * All contexts: system settings + exit option.
   * Input: W/S navigate sliders, scroll wheel adjusts value.
   * ←/→ and Q/E rotate the box away from this face (handled in game.js).
   */
  function renderFace3(ctx, x, y, w, h, context) {
    var S = Math.min(w, h) / 400;
    var ty = _drawTitle(ctx, x, y, w, i18n.t('menu.face3', 'SYSTEM'), '⚙️', S);

    var F_BODY    = Math.max(10, Math.round(14 * S));
    var F_SMALL   = Math.max(9, Math.round(13 * S));
    var F_SECTION = Math.max(9, Math.round(12 * S));
    var F_HINT    = Math.max(9, Math.round(13 * S));
    var PAD       = Math.round(16 * S);

    var listX  = x + PAD;
    var trackW = w - PAD * 3;
    var rowH   = Math.max(30, Math.round(44 * S));
    var ty2    = ty + Math.round(6 * S);

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
        ctx.fillRect(x + 6, sy - 2, w - 12, rowH - Math.round(4 * S));

        ctx.fillStyle = COL.accent;
        ctx.font = 'bold ' + F_BODY + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('▶', x + Math.round(6 * S), sy + Math.round(14 * S));
      }

      // Label
      ctx.font = (selected ? 'bold ' : '') + F_BODY + 'px monospace';
      ctx.fillStyle = selected ? COL.accent : COL.dim;
      ctx.textAlign = 'left';
      ctx.fillText(i18n.t(def.labelKey, def.label), listX + Math.round(14 * S), sy + Math.round(14 * S));

      // Value badge (right-aligned)
      ctx.font = 'bold ' + F_BODY + 'px monospace';
      ctx.fillStyle = selected ? COL.accent : COL.text;
      ctx.textAlign = 'right';
      ctx.fillText(val + '%', listX + trackW + Math.round(6 * S), sy + Math.round(14 * S));

      // Slider track
      var trackY  = sy + Math.round(22 * S);
      var trackH  = Math.max(6, Math.round(9 * S));
      var fillW   = Math.round(trackW * (val / 100));

      // Track background
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      _roundRectFill(ctx, listX + Math.round(14 * S), trackY, trackW, trackH, Math.round(3 * S));

      // Track fill — gradient from dim to accent when selected
      if (fillW > 0) {
        if (selected) {
          var grad = ctx.createLinearGradient(listX + Math.round(14 * S), 0, listX + Math.round(14 * S) + fillW, 0);
          grad.addColorStop(0, 'rgba(200,160,60,0.7)');
          grad.addColorStop(1, COL.accent);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = 'rgba(180,140,50,0.55)';
        }
        _roundRectFill(ctx, listX + Math.round(14 * S), trackY, fillW, trackH, Math.round(3 * S));
      }

      // Thumb pip at fill end
      if (selected && fillW > 0) {
        var thumbW = Math.max(4, Math.round(5 * S));
        ctx.fillStyle = '#fff';
        _roundRectFill(ctx, listX + Math.round(14 * S) + fillW - thumbW / 2,
                       trackY - Math.round(2 * S), thumbW, trackH + Math.round(4 * S),
                       Math.round(2 * S));
      }

      // Hit zone for slider click-to-set
      _hitZones.push({
        x: listX + Math.round(14 * S), y: trackY - 2,
        w: trackW, h: trackH + 4,
        slot: 800 + s, action: 'slider_click'
      });

      // Nudge hint on selected row
      if (selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = F_SECTION + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('\u2190 / \u2192 adjust    scroll fine-tune', x + w / 2, trackY + trackH + Math.round(12 * S));
      }
    }

    // ── Language ──────────────────────────────────────────────────
    var langY = ty2 + _SLIDER_DEFS.length * rowH + Math.round(6 * S);
    ctx.strokeStyle = COL.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, langY - Math.round(4 * S));
    ctx.lineTo(x + w - 10, langY - Math.round(4 * S));
    ctx.stroke();

    ctx.fillStyle = COL.dim;
    ctx.font = F_BODY + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      i18n.t('settings.language', 'Language') + ':  ' +
      i18n.t('settings.lang_en', 'English'),
      listX + Math.round(14 * S), langY + Math.round(10 * S)
    );

    // ── Toggle settings ───────────────────────────────────────────
    var toggleRowH = Math.max(18, Math.round(22 * S));
    var toggleY = langY + Math.round(26 * S);
    var toggleDefs = [
      { label: 'Screen Shake', key: 'screenShake', default: true },
      { label: 'Show FPS', key: 'showFps', default: false },
      { label: 'Minimap Visible', key: 'minimapVisible', default: true }
    ];

    for (var ti = 0; ti < toggleDefs.length; ti++) {
      var td = toggleDefs[ti];
      var togY = toggleY + ti * toggleRowH;
      var togVal = _settingsState[td.key] !== undefined ? _settingsState[td.key] : td.default;
      var togSelected = (_settingsState.row === _SLIDER_DEFS.length + ti);
      var togHover = (_hoverSlot === (810 + ti));

      if (togSelected || togHover) {
        ctx.fillStyle = togSelected ? 'rgba(240,208,112,0.10)' : 'rgba(240,208,112,0.06)';
        ctx.fillRect(x + 6, togY - 2, w - 12, toggleRowH - 2);
      }

      ctx.fillStyle = (togSelected || togHover) ? COL.accent : COL.dim;
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'left';
      ctx.fillText((togSelected ? '\u25B6 ' : '  ') + td.label, listX + Math.round(14 * S), togY + Math.round(10 * S));
      ctx.textAlign = 'right';
      ctx.fillStyle = togVal ? 'rgba(80,220,120,0.9)' : 'rgba(180,80,80,0.7)';
      ctx.fillText(togVal ? 'ON' : 'OFF', listX + trackW + Math.round(6 * S), togY + Math.round(10 * S));

      // Hit zone for toggle click
      _hitZones.push({
        x: x + 6, y: togY - 2,
        w: w - 12, h: toggleRowH - 2,
        slot: 810 + ti, action: 'toggle', toggleKey: td.key
      });
    }

    // ── Controls reference ────────────────────────────────────────
    var ctrlY = toggleY + toggleDefs.length * toggleRowH + Math.round(8 * S);
    ctx.strokeStyle = COL.divider;
    ctx.beginPath();
    ctx.moveTo(x + 10, ctrlY - Math.round(4 * S));
    ctx.lineTo(x + w - 10, ctrlY - Math.round(4 * S));
    ctx.stroke();

    ctx.fillStyle = COL.dim;
    ctx.font = F_SECTION + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CONTROLS', listX + Math.round(14 * S), ctrlY + Math.round(6 * S));
    ctrlY += Math.round(14 * S);

    var controls = [
      ['WASD / Arrows', 'Move & Turn'],
      ['F / Space', 'Interact'],
      ['Q / E', 'Browse panes'],
      ['ESC', 'Pause / Resume'],
      ['1-5', 'Quick-select']
    ];

    var ctrlRowH = Math.max(10, Math.round(13 * S));
    ctx.font = F_SECTION + 'px monospace';
    for (var ci = 0; ci < controls.length; ci++) {
      var cY = ctrlY + ci * ctrlRowH;
      ctx.fillStyle = 'rgba(240,208,112,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(controls[ci][0], listX + Math.round(14 * S), cY + Math.round(4 * S));
      ctx.fillStyle = COL.dim;
      ctx.textAlign = 'right';
      ctx.fillText(controls[ci][1], listX + trackW + Math.round(6 * S), cY + Math.round(4 * S));
    }

    // ── Exit options (clickable buttons) ──────────────────────────
    var exitY = y + h - Math.round(50 * S);
    ctx.strokeStyle = COL.divider;
    ctx.beginPath();
    ctx.moveTo(x + 10, exitY - Math.round(6 * S));
    ctx.lineTo(x + w - 10, exitY - Math.round(6 * S));
    ctx.stroke();

    var exitBtnW = Math.min(w - Math.round(24 * S), Math.round(200 * S));
    var exitBtnH = Math.max(20, Math.round(24 * S));
    var exitBtnX = x + (w - exitBtnW) / 2;

    if (context === 'pause') {
      // Return to Game button
      var resumeHov = (_hoverSlot === 820);
      ctx.fillStyle = resumeHov ? 'rgba(100,200,120,0.15)' : 'rgba(100,200,120,0.06)';
      _roundRectFill(ctx, exitBtnX, exitY, exitBtnW, exitBtnH, Math.round(4 * S));
      ctx.strokeStyle = resumeHov ? 'rgba(100,200,120,0.6)' : 'rgba(100,200,120,0.25)';
      ctx.lineWidth = resumeHov ? 2 : 1;
      _roundRectStroke(ctx, exitBtnX, exitY, exitBtnW, exitBtnH, Math.round(4 * S));
      ctx.fillStyle = resumeHov ? '#aaffaa' : COL.text;
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(i18n.t('menu.resume', 'Return to Game') + '  [ESC]', x + w / 2, exitY + exitBtnH * 0.65);
      _hitZones.push({ x: exitBtnX, y: exitY, w: exitBtnW, h: exitBtnH, slot: 820, action: 'resume' });

      // Quit to Title button
      var quitY = exitY + exitBtnH + Math.round(6 * S);
      var quitHov = (_hoverSlot === 821);
      ctx.fillStyle = quitHov ? 'rgba(200,80,80,0.15)' : 'rgba(200,80,80,0.06)';
      _roundRectFill(ctx, exitBtnX, quitY, exitBtnW, exitBtnH, Math.round(4 * S));
      ctx.strokeStyle = quitHov ? 'rgba(200,80,80,0.6)' : 'rgba(200,80,80,0.25)';
      ctx.lineWidth = quitHov ? 2 : 1;
      _roundRectStroke(ctx, exitBtnX, quitY, exitBtnW, exitBtnH, Math.round(4 * S));
      ctx.fillStyle = quitHov ? '#ff8888' : 'rgba(200,80,80,0.8)';
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(i18n.t('menu.quit_title', 'Quit to Title'), x + w / 2, quitY + exitBtnH * 0.65);
      _hitZones.push({ x: exitBtnX, y: quitY, w: exitBtnW, h: exitBtnH, slot: 821, action: 'quit_title' });
    } else {
      var closeHov = (_hoverSlot === 820);
      ctx.fillStyle = closeHov ? 'rgba(100,200,120,0.15)' : 'rgba(100,200,120,0.06)';
      _roundRectFill(ctx, exitBtnX, exitY, exitBtnW, exitBtnH, Math.round(4 * S));
      ctx.strokeStyle = closeHov ? 'rgba(100,200,120,0.6)' : 'rgba(100,200,120,0.25)';
      ctx.lineWidth = closeHov ? 2 : 1;
      _roundRectStroke(ctx, exitBtnX, exitY, exitBtnW, exitBtnH, Math.round(4 * S));
      ctx.fillStyle = closeHov ? '#aaffaa' : COL.text;
      ctx.font = F_BODY + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[ESC] ' + i18n.t('shop.close', 'Close'), x + w / 2, exitY + exitBtnH * 0.65);
      _hitZones.push({ x: exitBtnX, y: exitY, w: exitBtnW, h: exitBtnH, slot: 820, action: 'resume' });
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

  // ── DragDrop Integration (Gone-Rogue Pattern) ────────────────────
  //
  // Every inventory slot is BOTH a drag source AND a drop target.
  // Pointer-down on an occupied slot starts a drag with the item/card
  // as payload. Dropping onto a valid target zone completes the transfer.
  // The actual data mutation (remove from source, add to target) happens
  // in the onDrop callback — items are never removed until drop succeeds.

  // Zone ID tracking for cleanup
  var _registeredZoneIds = [];

  /** Helper: detect card stored in bag */
  function _isBagCard(item) {
    return item && (item._bagStored || (item.suit !== undefined && item.value !== undefined));
  }

  /** Helper: suit emoji lookup */
  var _SUIT_EMOJI_DD = { spade: '\u2660', club: '\u2663', diamond: '\u2666', heart: '\u2665' };

  /**
   * Tap-to-select handler. Called by DragDrop onTap when a slot is tapped
   * without dragging. Toggles selection or executes transfer if tapping
   * a valid target while another slot is selected.
   */
  function _handleSlotTap(zoneId, payload) {
    if (!payload) {
      // Tapped empty slot — if something selected, try to drop here
      if (_selectedPayload && _selectedZoneId) {
        var targetZone = DragDrop.getZone(zoneId);
        if (targetZone && targetZone.accepts && targetZone.accepts(_selectedPayload)) {
          if (targetZone.onDrop && targetZone.onDrop(_selectedPayload)) {
            // Transfer succeeded
            _selectedSlot = -1;
            _selectedPayload = null;
            _selectedZoneId = null;
            return;
          }
        }
      }
      _selectedSlot = -1;
      _selectedPayload = null;
      _selectedZoneId = null;
      return;
    }
    // Tapped an occupied slot
    if (_selectedZoneId === zoneId) {
      // Same slot — deselect
      _selectedSlot = -1;
      _selectedPayload = null;
      _selectedZoneId = null;
    } else if (_selectedPayload) {
      // Something else was selected — try to transfer to this slot's zone
      var tgtZone = DragDrop.getZone(zoneId);
      if (tgtZone && tgtZone.accepts && tgtZone.accepts(_selectedPayload)) {
        if (tgtZone.onDrop && tgtZone.onDrop(_selectedPayload)) {
          _selectedSlot = -1;
          _selectedPayload = null;
          _selectedZoneId = null;
          return;
        }
      }
      // Can't drop here — select this slot instead
      _selectedSlot = payload.index !== undefined ? payload.index : -1;
      _selectedPayload = payload;
      _selectedZoneId = zoneId;
    } else {
      // Nothing selected — select this slot
      _selectedSlot = payload.index !== undefined ? payload.index : -1;
      _selectedPayload = payload;
      _selectedZoneId = zoneId;
    }
  }

  /**
   * Register per-slot drag-drop zones for the inventory face.
   * Every occupied slot becomes a drag source AND every zone
   * becomes a drop target for the appropriate payload types.
   *
   * Called when MenuBox opens. Re-called each render frame to keep
   * zone bounds in sync with layout (zones are re-registered with
   * updated bounds + payload closures).
   */
  function registerDragZones() {
    if (typeof DragDrop === 'undefined') return;
    // Always rebuild — slots change every frame as items move
    unregisterDragZones();

    var equipped = CardAuthority.getEquipped();
    var bag = CardAuthority.getBag();
    var hand = CardAuthority.getHand();
    var collection = CardAuthority.getBackup();

    // ── Equip slots (3) — sources: drag item out. targets: accept items ──
    for (var ei = 0; ei < 3; ei++) {
      (function (slotIdx) {
        var zid = 'inv-eq-' + slotIdx;
        DragDrop.registerZone(zid, {
          x: 0, y: 0, w: 0, h: 0,  // Updated by _renderInventory
          dragPayload: function () {
            var cur = CardAuthority.getEquipped()[slotIdx];
            if (!cur) return null;
            return { type: 'item', zone: 'equip', index: slotIdx, data: cur,
                     emoji: cur.emoji || '\uD83D\uDCE6', label: cur.name };
          },
          accepts: function (p) {
            if (!p || p.zone === 'equip') return false;
            if (p.type !== 'item') return false;
            // Cards stored as items can't be equipped
            if (_isBagCard(p.data)) return false;
            return true;
          },
          onDrop: function (p) {
            if (!p || !p.data) return false;
            var item2 = p.data;
            // Safety: if slot has an item and bag is full, reject the drop
            var prev = CardAuthority.getEquipped()[slotIdx];
            if (prev && CardAuthority.getBag().length >= (CardAuthority.MAX_BAG || 12)) {
              if (typeof Toast !== 'undefined') Toast.show('\uD83C\uDF92 Bag full \u2014 unequip something first', 'warning');
              return false;
            }
            // Remove from source
            if (p.zone === 'bag') CardAuthority.removeFromBagById(item2.id);
            else if (p.zone === 'stash') CardAuthority.removeFromStashById(item2.id);
            // Swap: put existing back to bag
            if (prev) CardAuthority.addToBag(prev);
            CardAuthority.equip(slotIdx, item2);
            _refreshAfterDrag();
            return true;
          },
          onTap: function (payload) { _handleSlotTap('inv-eq-' + slotIdx, payload); }
        });
        _registeredZoneIds.push(zid);
      })(ei);
    }

    // ── Bag wheel slots (5 visible) — sources + targets ──
    for (var bi = 0; bi < 5; bi++) {
      (function (slotIdx) {
        var zid = 'inv-bag-' + slotIdx;
        DragDrop.registerZone(zid, {
          x: 0, y: 0, w: 0, h: 0,
          dragPayload: function () {
            var b = CardAuthority.getBag();
            var di = _bagOffset + slotIdx;
            var it = (di < b.length) ? b[di] : null;
            if (!it) return null;
            var isCard = _isBagCard(it);
            return {
              type: isCard ? 'card' : 'item',
              zone: 'bag', index: di, data: it,
              emoji: isCard ? '\uD83C\uDCCF' : (it.emoji || '\uD83D\uDCE6'),
              label: it.name
            };
          },
          accepts: function (p) {
            if (!p) return false;
            if (p.zone === 'bag') return false;  // No bag→bag
            if (CardAuthority.getBag().length >= CardAuthority.MAX_BAG) return false;
            return (p.type === 'item' || p.type === 'card');
          },
          onDrop: function (p) {
            if (!p || !p.data) return false;
            if (CardAuthority.getBag().length >= CardAuthority.MAX_BAG) return false;
            // Remove from source
            if (p.zone === 'equip') CardAuthority.equip(p.index, null);
            else if (p.zone === 'hand') CardAuthority.removeFromHand(p.index);
            else if (p.zone === 'deck') {
              CardAuthority.removeFromBackupById(p.data.id);
            }
            else if (p.zone === 'stash') CardAuthority.removeFromStashById(p.data.id);
            // Add to bag (cards get _bagStored flag)
            var d = p.data;
            if (p.type === 'card') d._bagStored = true;
            CardAuthority.addToBag(d);
            _refreshAfterDrag();
            return true;
          },
          onTap: function (payload) { _handleSlotTap('inv-bag-' + slotIdx, payload); }
        });
        _registeredZoneIds.push(zid);
      })(bi);
    }

    // ── Bag expander — accepts drops into first empty bag slot ──
    DragDrop.registerZone('inv-bag-expander', {
      x: 0, y: 0, w: 0, h: 0,
      active: false,  // Activated by _renderInventory when expander is visible
      accepts: function (p) {
        if (!p) return false;
        if (p.zone === 'bag') return false;
        if (CardAuthority.getBag().length >= (CardAuthority.MAX_BAG || 12)) return false;
        return (p.type === 'item' || p.type === 'card');
      },
      onDrop: function (p) {
        if (!p || !p.data) return false;
        if (CardAuthority.getBag().length >= (CardAuthority.MAX_BAG || 12)) return false;
        if (p.zone === 'equip') CardAuthority.equip(p.index, null);
        else if (p.zone === 'hand') CardAuthority.removeFromHand(p.index);
        else if (p.zone === 'deck') CardAuthority.removeFromBackupById(p.data.id);
        else if (p.zone === 'stash') CardAuthority.removeFromStashById(p.data.id);
        var d = p.data;
        if (p.type === 'card') d._bagStored = true;
        CardAuthority.addToBag(d);
        // Auto-expand after drop so player sees result
        _bagExpanded = true;
        _refreshAfterDrag();
        return true;
      },
      onTap: function () { _bagExpanded = !_bagExpanded; _bagOffset = 0; }
    });
    _registeredZoneIds.push('inv-bag-expander');

    // ── Hand card slots (5) — sources + targets ──
    for (var hi = 0; hi < 5; hi++) {
      (function (slotIdx) {
        var zid = 'inv-hand-' + slotIdx;
        DragDrop.registerZone(zid, {
          x: 0, y: 0, w: 0, h: 0,
          dragPayload: function () {
            var h = CardAuthority.getHand();
            var c = h[slotIdx];
            if (!c) return null;
            var suit = c.suit || '';
            return {
              type: 'card', zone: 'hand', index: slotIdx, data: c,
              emoji: _SUIT_EMOJI_DD[suit] || '\uD83C\uDCA0',
              label: c.name
            };
          },
          accepts: function (p) {
            if (!p) return false;
            if (p.zone === 'hand') return false;
            if (p.type !== 'card') return false;
            return true;  // Always accept — push-out handles overflow
          },
          onDrop: function (p) {
            if (!p || !p.data) return false;
            var h2 = CardAuthority.getHand();
            var maxH = CardAuthority.MAX_HAND || 5;
            // Push-out: if hand is full, bump last card to deck
            if (h2.length >= maxH) {
              var bumped = h2[h2.length - 1];
              CardAuthority.removeFromHand(h2.length - 1);
              CardAuthority.addToBackup(bumped);
              if (typeof Toast !== 'undefined') {
                Toast.show((bumped.name || 'Card') + ' \u2192 deck', 'info');
              }
            }
            // Remove from source
            if (p.zone === 'deck') {
              CardAuthority.removeFromBackupById(p.data.id);
            } else if (p.zone === 'bag') {
              CardAuthority.removeFromBagById(p.data.id);
              delete p.data._bagStored;
            }
            // Add to hand
            CardAuthority.addToHand(p.data);
            _refreshAfterDrag();
            return true;
          },
          onTap: function (payload) { _handleSlotTap('inv-hand-' + slotIdx, payload); }
        });
        _registeredZoneIds.push(zid);
      })(hi);
    }

    // ── Deck wheel slots (5 visible) — sources + targets ──
    for (var di = 0; di < 5; di++) {
      (function (slotIdx) {
        var zid = 'inv-deck-' + slotIdx;
        DragDrop.registerZone(zid, {
          x: 0, y: 0, w: 0, h: 0,
          dragPayload: function () {
            var col = CardAuthority.getBackup();
            var idx = _deckOffset + slotIdx;
            var c = (idx < col.length) ? col[idx] : null;
            if (!c) return null;
            var suit = c.suit || '';
            return {
              type: 'card', zone: 'deck', index: idx, data: c,
              emoji: _SUIT_EMOJI_DD[suit] || '\uD83C\uDCA0',
              label: c.name
            };
          },
          accepts: function (p) {
            if (!p) return false;
            if (p.zone === 'deck') return false;
            if (p.type !== 'card') return false;
            return true;  // Deck is unlimited
          },
          onDrop: function (p) {
            if (!p || !p.data) return false;
            if (p.type !== 'card') return false;
            // Remove from source
            if (p.zone === 'hand') CardAuthority.removeFromHand(p.index);
            else if (p.zone === 'bag') {
              CardAuthority.removeFromBagById(p.data.id);
              delete p.data._bagStored;
            }
            // Add to deck
            CardAuthority.addToBackup(p.data);
            _refreshAfterDrag();
            return true;
          },
          onTap: function (payload) { _handleSlotTap('inv-deck-' + slotIdx, payload); }
        });
        _registeredZoneIds.push(zid);
      })(di);
    }

    // ── Stash zone (bonfire only) ──
    DragDrop.registerZone(ZONE_STASH, {
      x: 0, y: 0, w: 0, h: 0,
      active: false,
      accepts: function (p) {
        if (!p || p.type !== 'item') return false;
        return CardAuthority.getStash().length < (CardAuthority.MAX_STASH || 20);
      },
      onDrop: function (p) {
        if (!p || !p.data) return false;
        if (p.zone === 'bag') CardAuthority.removeFromBagById(p.data.id);
        CardAuthority.addToStash(p.data);
        _refreshAfterDrag();
        return true;
      }
    });
    _registeredZoneIds.push(ZONE_STASH);

    // ── Sell zone (shop only) ──
    DragDrop.registerZone(ZONE_SELL, {
      x: 0, y: 0, w: 0, h: 0,
      active: false,
      accepts: function (p) {
        return p && (p.type === 'card' || p.type === 'item');
      },
      onDrop: function (p) {
        if (!p || !p.data || typeof Shop === 'undefined') return false;
        var SELL_VALUE = { common: 12, uncommon: 24, rare: 40, epic: 72, legendary: 120 };
        if (p.type === 'card') {
          var sv = SELL_VALUE[p.data.rarity] || 12;
          if (p.zone === 'hand') CardAuthority.removeFromHand(p.index);
          else if (p.zone === 'deck') CardAuthority.removeFromBackupById(p.data.id);
          else if (p.zone === 'bag') CardAuthority.removeFromBagById(p.data.id);
          CardAuthority.addGold(sv);
          if (typeof Toast !== 'undefined') Toast.show((p.data.emoji || '\uD83C\uDCA0') + ' sold +' + sv + 'g', 'loot');
        } else {
          var price = p.data.baseValue || 1;
          if (p.zone === 'bag') CardAuthority.removeFromBagById(p.data.id);
          else if (p.zone === 'equip') CardAuthority.equip(p.index, null);
          CardAuthority.addGold(price);
          if (typeof Toast !== 'undefined') Toast.show((p.data.emoji || '\uD83D\uDCE6') + ' sold +' + price + 'g', 'loot');
        }
        _refreshAfterDrag();
        return true;
      }
    });
    _registeredZoneIds.push(ZONE_SELL);

    // ── Incinerator zone (always active on inventory face) ──
    DragDrop.registerZone(ZONE_INCIN, {
      x: 0, y: 0, w: 0, h: 0,
      accepts: function (p) {
        return p && (p.type === 'card' || p.type === 'item');
      },
      onHover: function () {
        // Phase 1 — tease: fire-flicker on hover
        if (typeof InventoryOverlay !== 'undefined') {
          InventoryOverlay.incineratorTease();
        }
      },
      onLeave: function () {
        // Cancel tease if drag leaves without dropping
        if (typeof InventoryOverlay !== 'undefined') {
          InventoryOverlay.incineratorCancelTease();
        }
      },
      onDrop: function (p) {
        if (!p || !p.data) return false;
        // Phase 2 — burn: scale pulse + rumble SFX
        if (typeof InventoryOverlay !== 'undefined') {
          InventoryOverlay.incineratorBurn();
        }
        // Remove from source
        if (p.zone === 'hand') CardAuthority.removeFromHand(p.index);
        else if (p.zone === 'deck') CardAuthority.removeFromBackupById(p.data.id);
        else if (p.zone === 'bag') CardAuthority.removeFromBagById(p.data.id);
        else if (p.zone === 'equip') CardAuthority.equip(p.index, null);
        if (typeof Toast !== 'undefined') {
          Toast.show('\uD83D\uDD25 ' + (p.data.name || 'Item') + ' destroyed', 'warning');
        }
        _refreshAfterDrag();
        return true;
      },
      onTap: function () { _handleSlotTap(ZONE_INCIN, null); }
    });
    _registeredZoneIds.push(ZONE_INCIN);

    // ── Mount inventory overlay (DOM companion layer) ──
    if (typeof InventoryOverlay !== 'undefined') {
      InventoryOverlay.mount();
    }

    _dragZonesRegistered = true;
  }

  /** Post-drag refresh: update panels and HUD */
  function _refreshAfterDrag() {
    if (typeof HUD !== 'undefined') HUD.updatePlayer(Player.state());
    if (typeof NchWidget !== 'undefined') NchWidget.refresh();
    if (typeof QuickBar !== 'undefined') QuickBar.refresh();
    if (typeof StatusBar !== 'undefined') StatusBar.refresh();
  }

  /**
   * Unregister all inventory drag-drop zones.
   */
  function unregisterDragZones() {
    // Unmount DOM overlay companion
    if (typeof InventoryOverlay !== 'undefined') {
      InventoryOverlay.unmount();
    }
    if (typeof DragDrop === 'undefined') return;
    for (var i = 0; i < _registeredZoneIds.length; i++) {
      DragDrop.removeZone(_registeredZoneIds[i]);
    }
    _registeredZoneIds = [];
    _dragZonesRegistered = false;
    _selectedSlot = -1;
    _selectedPayload = null;
    _selectedZoneId = null;
  }

  /**
   * Update drag zone bounds from the last _renderInventory layout.
   * Called at the end of _renderInventory to sync zone positions with
   * the canvas slot positions. Stores layout data in module-level vars
   * so registerDragZones can re-register with correct bounds next frame.
   */
  var _lastInvLayout = null;

  function _storeInvLayout(layout) {
    _lastInvLayout = layout;
    _syncDragZoneBounds();
    // Sync DOM overlay positions + combat lock check
    if (typeof InventoryOverlay !== 'undefined' && InventoryOverlay.isMounted()) {
      InventoryOverlay.sync(layout);
      InventoryOverlay.updateCombatLock();
    }
  }

  function _syncDragZoneBounds() {
    if (!_lastInvLayout || typeof DragDrop === 'undefined' || !_dragZonesRegistered) return;
    var L = _lastInvLayout;
    // Equip slots
    for (var ei = 0; ei < 3; ei++) {
      DragDrop.updateZone('inv-eq-' + ei, {
        x: L.eqSlots[ei].x, y: L.eqSlots[ei].y,
        w: L.eqSlots[ei].w, h: L.eqSlots[ei].h
      });
    }
    // Bag wheel slots
    for (var bi = 0; bi < 5; bi++) {
      DragDrop.updateZone('inv-bag-' + bi, {
        x: L.bagSlots[bi].x, y: L.bagSlots[bi].y,
        w: L.bagSlots[bi].w, h: L.bagSlots[bi].h
      });
    }
    // Hand slots
    for (var hi = 0; hi < 5; hi++) {
      DragDrop.updateZone('inv-hand-' + hi, {
        x: L.handSlots[hi].x, y: L.handSlots[hi].y,
        w: L.handSlots[hi].w, h: L.handSlots[hi].h
      });
    }
    // Deck wheel slots
    for (var di = 0; di < 5; di++) {
      DragDrop.updateZone('inv-deck-' + di, {
        x: L.deckSlots[di].x, y: L.deckSlots[di].y,
        w: L.deckSlots[di].w, h: L.deckSlots[di].h
      });
    }
    // Incinerator
    if (L.incin) {
      DragDrop.updateZone(ZONE_INCIN, {
        x: L.incin.x, y: L.incin.y,
        w: L.incin.w, h: L.incin.h
      });
    }
  }

  /**
   * Draw pulsing highlight borders on all valid drop targets
   * when a slot is tap-selected.
   */
  function _drawSelectionHighlights(ctx) {
    if (!_selectedPayload || !_lastInvLayout || typeof DragDrop === 'undefined') return;
    var L = _lastInvLayout;
    var t = Date.now();
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.006);  // 0..1 pulsing
    var alpha = 0.3 + 0.5 * pulse;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 180, ' + alpha + ')';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 3]);

    // Check each zone type
    var allZones = [
      { prefix: 'inv-eq-', slots: L.eqSlots, count: 3 },
      { prefix: 'inv-bag-', slots: L.bagSlots, count: 5 },
      { prefix: 'inv-hand-', slots: L.handSlots, count: 5 },
      { prefix: 'inv-deck-', slots: L.deckSlots, count: 5 }
    ];
    for (var g = 0; g < allZones.length; g++) {
      var group = allZones[g];
      for (var s = 0; s < group.count; s++) {
        var zid = group.prefix + s;
        if (zid === _selectedZoneId) continue;  // Don't highlight the source
        var zone = DragDrop.getZone(zid);
        if (zone && zone.accepts && zone.accepts(_selectedPayload)) {
          var sl = group.slots[s];
          ctx.strokeRect(sl.x - 2, sl.y - 2, sl.w + 4, sl.h + 4);
        }
      }
    }
    // Incinerator highlight
    if (L.incin && ZONE_INCIN !== _selectedZoneId) {
      var incZone = DragDrop.getZone(ZONE_INCIN);
      if (incZone && incZone.accepts && incZone.accepts(_selectedPayload)) {
        ctx.strokeStyle = 'rgba(255, 80, 40, ' + alpha + ')';
        ctx.strokeRect(L.incin.x - 2, L.incin.y - 2, L.incin.w + 4, L.incin.h + 4);
      }
    }
    // Draw a solid highlight ring on the selected source
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.9)';
    ctx.lineWidth = 2;
    // Find the selected slot bounds
    var selBounds = null;
    if (_selectedZoneId) {
      for (var g2 = 0; g2 < allZones.length; g2++) {
        for (var s2 = 0; s2 < allZones[g2].count; s2++) {
          if (allZones[g2].prefix + s2 === _selectedZoneId) {
            selBounds = allZones[g2].slots[s2];
            break;
          }
        }
        if (selBounds) break;
      }
    }
    if (selBounds) {
      ctx.strokeRect(selBounds.x - 1, selBounds.y - 1, selBounds.w + 2, selBounds.h + 2);
    }
    ctx.restore();
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

  // ── Inventory Wheel Scroll/Focus API ─────────────────────────────

  function scrollBag(delta) {
    // Scroll is now clamped by _renderInventory each frame based on
    // dynamic visible count, so just apply delta and let render clamp.
    _bagOffset = Math.max(0, _bagOffset + delta);
  }

  function scrollDeck(delta) {
    _deckOffset = Math.max(0, _deckOffset + delta);
  }

  function scrollFocused(delta) {
    if (_invFocus === 'bag') scrollBag(delta);
    else scrollDeck(delta);
  }

  function toggleInvFocus() {
    _invFocus = (_invFocus === 'bag') ? 'deck' : 'bag';
  }

  function setInvFocus(focus) {
    if (focus === 'bag' || focus === 'deck') _invFocus = focus;
  }

  function toggleBagExpand() {
    _bagExpanded = !_bagExpanded;
    _bagOffset = 0; // Reset scroll on toggle
  }

  function toggleDeckExpand() {
    _deckExpanded = !_deckExpanded;
    _deckOffset = 0;
  }

  /**
   * Handle a card dropped from the CardFan external drag system.
   * Converts screen coordinates to canvas coordinates and hit-tests
   * against the inventory layout zones.
   *
   * @param {Object} info - { cardIdx, card, screenX, screenY }
   * @returns {boolean} True if the drop was handled.
   */
  function handleExternalDrop(info) {
    if (!_lastInvLayout || !info || !info.card) return false;

    // Convert screen (client) coordinates to canvas coordinates
    var canvas = MenuBox.getCanvas ? MenuBox.getCanvas() : null;
    if (!canvas) return false;
    var rect = canvas.getBoundingClientRect();
    var cx = (info.screenX - rect.left) * (canvas.width / rect.width);
    var cy = (info.screenY - rect.top)  * (canvas.height / rect.height);

    var L = _lastInvLayout;
    var card = info.card;

    // Hit test: bag slots (card-in-bag / Joker Vault)
    if (L.bagSlots) {
      for (var bi = 0; bi < L.bagSlots.length; bi++) {
        var bs = L.bagSlots[bi];
        if (cx >= bs.x && cx <= bs.x + bs.w && cy >= bs.y && cy <= bs.y + bs.h) {
          // Card → bag (Joker Vault): store card as item in bag
          if (typeof CardAuthority !== 'undefined') {
            var bagCard = { id: card.id, name: card.name, emoji: card.emoji || '🃏',
                           type: 'card', suit: card.suit, _bagStored: true, _cardRef: card };
            if (!CardAuthority.addToBag(bagCard)) {
              if (typeof Toast !== 'undefined') Toast.show('Bag full — make room first', 'warning');
              return false;
            }
            // Remove from hand
            CardAuthority.removeFromHand(info.cardIdx);
            if (typeof Toast !== 'undefined') Toast.show('🃏 Card stashed in bag', 'info');
            if (typeof StatusBar !== 'undefined') { StatusBar.refresh(); }
            return true;
          }
          return false;
        }
      }
    }

    // Hit test: deck wheel slots (return card to collection)
    if (L.deckSlots) {
      for (var di = 0; di < L.deckSlots.length; di++) {
        var ds = L.deckSlots[di];
        if (cx >= ds.x && cx <= ds.x + ds.w && cy >= ds.y && cy <= ds.y + ds.h) {
          var moved = CardAuthority.moveHandToBackup(info.cardIdx);
          if (moved) {
            if (typeof Toast !== 'undefined') Toast.show('🃏 Card returned to deck', 'info');
            if (typeof StatusBar !== 'undefined') { StatusBar.refresh(); }
            return true;
          } else {
            if (typeof Toast !== 'undefined') Toast.show('Deck full (' + CardAuthority.MAX_BACKUP + ')', 'warning');
            return false;
          }
        }
      }
    }

    // Hit test: incinerator
    if (L.incin) {
      var inc = L.incin;
      if (cx >= inc.x && cx <= inc.x + inc.w && cy >= inc.y && cy <= inc.y + inc.h) {
        CardAuthority.removeFromHand(info.cardIdx);
        if (typeof Toast !== 'undefined') Toast.show('🔥 Card destroyed', 'warning');
        if (typeof StatusBar !== 'undefined') { StatusBar.refresh(); }
        return true;
      }
    }

    // Hit test: equip slots — cards can't equip, reject
    // (items-only slots, card drops are invalid here)

    return false;
  }

  return {
    renderFace0:          renderFace0,
    renderFace1:          renderFace1,
    renderFace2:          renderFace2,
    renderFace3:          renderFace3,
    registerAll:          registerAll,
    handleSettingsNav:       handleSettingsNav,
    handleSettingsAdjust:    handleSettingsAdjust,
    handleSettingsToggle:    handleSettingsToggle,
    handleSettingsSelectRow: handleSettingsSelectRow,
    resetSettings:           resetSettings,
    clearHitZones:        clearHitZones,
    updateHover:          updateHover,
    handlePointerClick:   handlePointerClick,

    // DragDrop integration
    registerDragZones:    registerDragZones,
    unregisterDragZones:  unregisterDragZones,

    // External drop (CardFan → inventory zones)
    handleExternalDrop:   handleExternalDrop,

    // Inventory wheel scroll/focus
    scrollBag:            scrollBag,
    scrollDeck:           scrollDeck,
    scrollFocused:        scrollFocused,
    toggleInvFocus:       toggleInvFocus,
    setInvFocus:          setInvFocus,
    toggleBagExpand:      toggleBagExpand,
    toggleDeckExpand:     toggleDeckExpand,

    // State getters
    getInvFocus:          function () { return _invFocus; },
    getBagOffset:         function () { return _bagOffset; },
    getDeckOffset:        function () { return _deckOffset; },
    isBagExpanded:        function () { return _bagExpanded; },
    isDeckExpanded:       function () { return _deckExpanded; }
  };
})();

/**
 * Shop — faction card shop: inventory generation, buy, sell, reputation.
 *
 * Each TILES.SHOP tile on the floor belongs to one of the three factions.
 * The shop generates an inventory of 5 cards from that faction's pool,
 * filtered by the player's current rep tier with that faction.
 *
 * Inventory is cached per floor-open (re-randomised on each new floor
 * or when the player re-enters the shop after a full floor transition).
 *
 * Pricing:
 *   Buy  price = RARITY_BASE × repDiscount[tier] × floorScale
 *   Sell price = base card rarity value × 0.40 (40 %) — no faction bonus
 *
 * Reputation is stored as item-sold counts on Player flags, managed via
 * Salvage.getRepTier() / Salvage.recordSale().
 *
 * Public API:
 *   Shop.open(factionId, floor)  — set faction, build inventory, mark open
 *   Shop.close()                 — clear open state (keeps cache)
 *   Shop.reset()                 — full reset (new floor)
 *   Shop.getInventory()          — [{card, price, sold}] — the 5 buy slots
 *   Shop.buy(slotIndex)          — buy slot N; returns {ok, reason}
 *   Shop.sell(cardId)            — sell one card from collection; returns {ok, amount}
 *   Shop.getCurrentFaction()     — active faction id string
 *   Shop.getRepTier()            — player's rep tier with current faction (0-3)
 *   Shop.getFactionLabel(id)     — display name for a faction id
 *   Shop.getFactionEmoji(id)     — emoji for a faction id
 *   Shop.isOpen()                — true while shop MenuBox is shown
 *
 * S0.3 REWIRE: buy/sell/sellPart now use CardTransfer for all inventory
 * mutations instead of directly calling Player.spendCurrency/addCurrency
 * and CardSystem.addCard/removeCard.
 *
 * Layer 3 — depends on: CardSystem (registry), CardAuthority, CardTransfer,
 *           Salvage, Player (flags only), SeededRNG, LootTables
 */
var Shop = (function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────

  var INVENTORY_SIZE = 5;

  /** Base gold cost per rarity before tier discount and floor scaling. */
  var RARITY_BASE = {
    common:    30,
    uncommon:  60,
    rare:     100,
    epic:     180,
    legendary: 300
  };

  /** Sell return fraction of base rarity price (always fixed, no modifiers). */
  var SELL_FRACTION = 0.40;

  /** Price multipliers by rep tier (0 = stranger, 3 = trusted ally). */
  var REP_DISCOUNT = [1.0, 0.90, 0.80, 0.70];

  /** Display data for each faction. */
  var FACTION_META = {
    tide:      { label: 'Tide Council',  emoji: '🐉' },
    foundry:   { label: 'The Foundry',   emoji: '⚙️' },
    admiralty: { label: 'The Admiralty', emoji: '🌊' }
  };

  // ── Supply stock (DEPTH3 §5) ───────────────────────────────────────
  // Faction-split supply catalogs force players to visit multiple shops
  // to fully restock for a dungeon run. SUPPLY_STOCK is the universal
  // fallback (used when faction is unknown). FACTION_SUPPLIES is the
  // canonical source; getSupplyStock() returns the correct list for the
  // currently-open faction.
  //
  // Design intent (shop-hopping pressure):
  //   Tide    (1.1) — food/HP fillers, water, basic cleaning, bone powder,
  //                   silk spiders. Cheapest overall; good first-stop.
  //   Foundry (2.3) — battery/energy fillers, TORCH OIL (exclusive),
  //                   traps, mid-tier mop. Mandatory if dungeons are dark.
  //   Admiralty (3.2) — scroll/gem fillers, premium scrub brush
  //                     (exclusive), corpse powder, trap kits, spiders.
  //                     Required for clean full-clears and deep crates.
  //
  // Exclusives create hard dependencies:
  //   Torch Oil  → Foundry only   (lit torches = visibility in depth-3+)
  //   Scrub Brush → Admiralty only (fastest cleaning; needed for time pressure)
  //   Dead Cell  → Foundry only   (BATTERY crate slots need this)
  //   Glass Bead → Admiralty only  (GEM crate slots need this)

  /** Universal fallback — used when faction is null/unknown. */
  var SUPPLY_STOCK = [
    { id: 'ITM-080', name: 'Stale Rations',  emoji: '🍞', shopPrice: 2, category: 'food',    subtype: 'supply', crateFillTag: 'HP_FOOD',  desc: 'Barely edible. Fills an HP crate slot.' },
    { id: 'ITM-085', name: 'Generic Salvage',emoji: '🦴', shopPrice: 3, category: 'salvage', subtype: 'supply', crateFillTag: 'WILDCARD', desc: 'Fits any crate slot. The duct tape of supplies.' },
    { id: 'ITM-087', name: 'Water Bottle',   emoji: '💧', shopPrice: 1, category: 'water',   subtype: 'supply', desc: 'Drink, clean, or douse. Never wrong to buy.' },
    { id: 'ITM-088', name: 'Cleaning Rag',   emoji: '🧹', shopPrice: 1, category: 'tool',    subtype: 'rag',    desc: 'Basic cleaning tool. 3 uses, slow.' },
    { id: 'ITM-091', name: 'Bone Powder',    emoji: '💀', shopPrice: 3, category: 'corpse',  subtype: 'supply', desc: 'Corpse processing reagent.' },
    { id: 'ITM-092', name: 'Trap Spring',    emoji: '⚙️', shopPrice: 2, category: 'trap',    subtype: 'supply', desc: 'Re-arms a spent trap.' }
  ];

  /**
   * Per-faction supply catalogs.
   *
   * Tide Council (Floor 1.1 — Coral Bazaar)
   *   Best for: HP crate fillers, energy tonics, cleaning basics,
   *             corpse powder, silk spiders. Cheapest first-stop.
   *
   * The Foundry (Floor 2.3 — Armorer's Workshop)
   *   Best for: battery crates, EXCLUSIVE torch oil, traps.
   *   Players who skip Foundry cannot relight torches.
   *
   * The Admiralty (Floor 3.2 — Quartermaster's Shop)
   *   Best for: scroll + gem crates, EXCLUSIVE scrub brush,
   *             premium trap kits, silk spiders for garrison runs.
   */
  var FACTION_SUPPLIES = {

    // ── Tide Council ── food biome, coastal territory ───────────────
    tide: [
      // Crate fillers (Tide biomes: cellar/coral → food + energy)
      { id: 'ITM-080', name: 'Stale Rations',  emoji: '🍞', shopPrice: 2, category: 'food',    subtype: 'supply', crateFillTag: 'HP_FOOD',  desc: 'Barely edible. Fills an HP crate slot.' },
      { id: 'ITM-082', name: 'Weak Tonic',      emoji: '🧪', shopPrice: 2, category: 'energy',  subtype: 'supply', crateFillTag: 'ENERGY',   desc: 'Fizzy and flat. Fills an energy crate slot.' },
      { id: 'ITM-083', name: 'Scrap Parchment', emoji: '📜', shopPrice: 4, category: 'scroll',  subtype: 'supply', crateFillTag: 'SCROLL',   desc: 'Blank but official. Fills a scroll crate slot.' },
      // Universal wildcard — sold everywhere
      { id: 'ITM-085', name: 'Generic Salvage', emoji: '🦴', shopPrice: 3, category: 'salvage', subtype: 'supply', crateFillTag: 'WILDCARD', desc: 'Fits any crate slot. The duct tape of supplies.' },
      // Cleaning & utility
      { id: 'ITM-087', name: 'Water Bottle',    emoji: '💧', shopPrice: 1, category: 'water',   subtype: 'supply', desc: 'Drink, clean, or douse. Never wrong to buy.' },
      { id: 'ITM-088', name: 'Cleaning Rag',    emoji: '🧹', shopPrice: 1, category: 'tool',    subtype: 'rag',    desc: 'Basic cleaning tool. 3 uses, slow.' },
      // Corpse processing (Tide deals in monster biology)
      { id: 'ITM-091', name: 'Bone Powder',     emoji: '💀', shopPrice: 3, category: 'corpse',  subtype: 'supply', desc: 'Corpse processing reagent.' },
      // Cobweb deployment (Tide holds the coastal/cellar territory)
      { id: 'ITM-115', name: 'Silk Spider',     emoji: '🕷️', shopPrice: 5, category: 'cobweb',  subtype: 'supply', desc: 'Deploy at a corridor choke for a cobweb. +2g on install.' }
    ],

    // ── The Foundry ── mechanical biome, torch-lit industry ─────────
    foundry: [
      // Crate fillers (Foundry biomes: foundry/sealab → battery + energy)
      { id: 'ITM-081', name: 'Dead Cell',        emoji: '🔋', shopPrice: 3, category: 'battery', subtype: 'supply', crateFillTag: 'BATTERY',  desc: 'Drained but accepted by crate scanners.' },
      { id: 'ITM-082', name: 'Weak Tonic',       emoji: '🧪', shopPrice: 2, category: 'energy',  subtype: 'supply', crateFillTag: 'ENERGY',   desc: 'Fizzy and flat. Fills an energy crate slot.' },
      // Universal wildcard
      { id: 'ITM-085', name: 'Generic Salvage',  emoji: '🦴', shopPrice: 3, category: 'salvage', subtype: 'supply', crateFillTag: 'WILDCARD', desc: 'Fits any crate slot. The duct tape of supplies.' },
      // EXCLUSIVE: Torch Oil — only the Foundry fuels torches.
      // Players cannot relight TORCH_UNLIT tiles without visiting here.
      { id: 'ITM-086', name: 'Torch Oil',        emoji: '🛢️', shopPrice: 3, category: 'fuel',    subtype: 'supply', desc: 'Refuels a torch. 3 units of fuel. Foundry exclusive.' },
      // Cleaning (mid-tier)
      { id: 'ITM-089', name: 'Mop Head',         emoji: '🧹', shopPrice: 4, category: 'tool',    subtype: 'mop',    desc: 'Mid-tier clean speed. 5 uses.' },
      // Trap rearm (Foundry manufactures the hardware)
      { id: 'ITM-092', name: 'Trap Spring',      emoji: '⚙️', shopPrice: 2, category: 'trap',    subtype: 'supply', desc: 'Re-arms a spent trap.' },
      { id: 'ITM-116', name: 'Trap Kit',         emoji: '🪜', shopPrice: 3, category: 'trap',    subtype: 'supply', desc: 'Re-arms a consumed trap. Sturdier than a loose spring.' }
    ],

    // ── The Admiralty ── garrison/sealab biome, premium military ────
    admiralty: [
      // Crate fillers (Admiralty biomes: garrison/sealab → scroll + gem)
      { id: 'ITM-083', name: 'Scrap Parchment',  emoji: '📜', shopPrice: 4, category: 'scroll',  subtype: 'supply', crateFillTag: 'SCROLL',   desc: 'Blank but official. Fills a scroll crate slot.' },
      { id: 'ITM-084', name: 'Glass Bead',        emoji: '💎', shopPrice: 5, category: 'gem',     subtype: 'supply', crateFillTag: 'GEM',      desc: 'Pretty enough for a crate frame.' },
      // Universal wildcard
      { id: 'ITM-085', name: 'Generic Salvage',   emoji: '🦴', shopPrice: 3, category: 'salvage', subtype: 'supply', crateFillTag: 'WILDCARD', desc: 'Fits any crate slot. The duct tape of supplies.' },
      // Cleaning (basic rag + EXCLUSIVE premium brush)
      { id: 'ITM-088', name: 'Cleaning Rag',      emoji: '🧹', shopPrice: 1, category: 'tool',    subtype: 'rag',    desc: 'Basic cleaning tool. 3 uses, slow.' },
      { id: 'ITM-090', name: 'Scrub Brush',       emoji: '🧹', shopPrice: 8, category: 'tool',    subtype: 'brush',  desc: 'Fast cleaning. 8 uses. Worth every coin. Admiralty exclusive.' },
      // Corpse processing (military mandate — clear the fallen)
      { id: 'ITM-091', name: 'Bone Powder',       emoji: '💀', shopPrice: 3, category: 'corpse',  subtype: 'supply', desc: 'Corpse processing reagent.' },
      // Trap kit (garrison defenses are Admiralty responsibility)
      { id: 'ITM-116', name: 'Trap Kit',          emoji: '🪜', shopPrice: 3, category: 'trap',    subtype: 'supply', desc: 'Re-arms a consumed trap. Sturdier than a loose spring.' },
      // Cobweb deployment (west wing of garrison is spider territory)
      { id: 'ITM-115', name: 'Silk Spider',       emoji: '🕷️', shopPrice: 5, category: 'cobweb',  subtype: 'supply', desc: 'Deploy at a corridor choke for a cobweb. +2g on install.' }
    ]
  };

  /**
   * Refresh cycle per faction: how many days between inventory rehydrations,
   * and which day-offset the cycle starts on.
   *
   *   Tide:      every 2 days, offset 0  (Days 0,2,4,6,8…)
   *   Foundry:   every 3 days, offset 1  (Days 1,4,7,10…)
   *   Admiralty: every 4 days, offset 2  (Days 2,6,10…)
   *
   * Staggered offsets mean all three shops are never fresh on the same
   * day — there is always pressure to buy now vs. wait for a refresh.
   */
  var FACTION_CYCLE = {
    tide:      { period: 2, offset: 0 },
    foundry:   { period: 3, offset: 1 },
    admiralty: { period: 4, offset: 2 }
  };

  // ── Internal state ────────────────────────────────────────────────

  var _factionId   = null;   // Currently-open faction
  var _floor       = 1;
  var _inventory   = [];     // [{card, price, sold}]  — 5 slots
  var _open        = false;
  var _cacheKey    = null;   // faction+'_'+floor — detect when to rebuild

  // ── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Return which refresh cycle index a faction is currently on.
   * The cache key includes this so _buildInventory() is re-run when
   * the faction's scheduled cycle ticks over (even mid-session).
   *
   * @param {string} factionId
   * @param {number} day — current game day (integer)
   * @returns {number} monotonically increasing cycle index
   */
  function _getCycleIndex(factionId, day) {
    var cfg = FACTION_CYCLE[factionId];
    if (!cfg || cfg.period <= 0) return 0;
    return Math.floor(Math.max(0, day - cfg.offset) / cfg.period);
  }

  /**
   * Open the shop for a given faction and floor.
   * Rebuilds card inventory when faction, floor, rep tier, OR the
   * faction's day-based refresh cycle changes.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   * @param {number} floor
   */
  function open(factionId, floor) {
    _factionId = factionId || 'tide';
    _floor     = floor || 1;
    _open      = true;

    var repTier  = getRepTier();
    var day      = (typeof DayCycle !== 'undefined' && DayCycle.getDay) ? DayCycle.getDay() : 0;
    var cycleIdx = _getCycleIndex(_factionId, day);
    var key = _factionId + '_' + _floor + '_' + repTier + '_' + cycleIdx;
    if (key !== _cacheKey) {
      _buildInventory();
      _cacheKey = key;
    }
  }

  /** Mark the shop as closed (inventory cache retained for the floor). */
  function close() {
    _open = false;
  }

  /** Full reset — call on every floor transition. */
  function reset() {
    _factionId = null;
    _floor     = 1;
    _inventory = [];
    _open      = false;
    _cacheKey  = null;
  }

  // ── Inventory generation ──────────────────────────────────────────

  /**
   * Build a fresh inventory of INVENTORY_SIZE card slots.
   * Uses CardSystem.getByPool(factionId, repTier) to fetch eligible cards,
   * then picks up to 5 by weighted rarity (rare cards appear less often).
   */
  function _buildInventory() {
    _inventory = [];

    var repTier = getRepTier();
    var pool    = (typeof CardSystem !== 'undefined')
                ? CardSystem.getByPool(_factionId, repTier)
                : [];

    if (!pool.length) {
      // Empty faction pool — fill with placeholder "Sold Out" slots
      for (var s = 0; s < INVENTORY_SIZE; s++) {
        _inventory.push({ card: null, price: 0, sold: true });
      }
      console.warn('[Shop] No cards in pool for faction=' + _factionId + ' tier=' + repTier);
      return;
    }

    // Weight by inverse rarity: common appears more than rare, etc.
    var RARITY_WEIGHT = { common: 8, uncommon: 4, rare: 2, epic: 1, legendary: 1 };
    var weighted = [];
    for (var i = 0; i < pool.length; i++) {
      var w = RARITY_WEIGHT[pool[i].rarity] || 4;
      weighted.push({ card: pool[i], weight: w });
    }

    // Pick without replacement until we have INVENTORY_SIZE or pool exhausted
    var picked = [];
    var remaining = weighted.slice();
    var picks = Math.min(INVENTORY_SIZE, remaining.length);

    for (var p = 0; p < picks; p++) {
      var total = remaining.reduce(function (s, e) { return s + e.weight; }, 0);
      var r = SeededRNG.random() * total;
      for (var j = 0; j < remaining.length; j++) {
        r -= remaining[j].weight;
        if (r <= 0) {
          picked.push(remaining[j].card);
          remaining.splice(j, 1);
          break;
        }
      }
    }

    // Build slots
    var floorScale = _getFloorScale(_floor);
    for (var k = 0; k < INVENTORY_SIZE; k++) {
      var card = picked[k] || null;
      var price = card ? _calcBuyPrice(card, repTier, floorScale) : 0;
      _inventory.push({ card: card, price: price, sold: (card === null) });
    }
  }

  // ── Pricing helpers ───────────────────────────────────────────────

  /**
   * Calculate the buy price for a card at this tier and floor.
   * @param {Object} card
   * @param {number} repTier
   * @param {number} floorScale
   * @returns {number} Gold cost (rounded, minimum 1)
   */
  function _calcBuyPrice(card, repTier, floorScale) {
    var base     = RARITY_BASE[card.rarity] || RARITY_BASE.common;
    var discount = REP_DISCOUNT[Math.min(repTier, 3)];
    return Math.max(1, Math.round(base * discount * floorScale));
  }

  /**
   * Calculate the sell return for a card (from player's collection).
   * Always 40 % of base rarity price — no faction modifier.
   * @param {Object} card
   * @returns {number}
   */
  function _calcSellPrice(card) {
    var base = RARITY_BASE[card.rarity] || RARITY_BASE.common;
    return Math.max(1, Math.floor(base * SELL_FRACTION));
  }

  /**
   * Floor scaling: mirrors loot-tables.json floor_currency_scale.
   * Pulls from LootTables if available, else uses a compact local table.
   */
  function _getFloorScale(floor) {
    if (typeof LootTables !== 'undefined' && LootTables.rollGold) {
      // Proxy: LootTables exposes _floorScale internally, but not directly.
      // We replicate the same table here for Shop independence.
    }
    var TABLE = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2, 6: 2.7, 7: 3.1, 8: 3.5 };
    return TABLE[floor] || TABLE[8];
  }

  // ── Transactions ──────────────────────────────────────────────────

  /**
   * Attempt to buy the card at slot index (0-based).
   *
   * @param {number} slotIndex - 0 through INVENTORY_SIZE-1
   * @returns {Object} { ok: bool, reason?: string, card?, cost? }
   */
  function buy(slotIndex) {
    if (!_open) return { ok: false, reason: 'shop_closed' };

    var slot = _inventory[slotIndex];
    if (!slot || !slot.card || slot.sold) {
      return { ok: false, reason: 'sold_out' };
    }

    // Use CardTransfer for atomic buy (gold deduction + card add + rollback)
    var result = CardTransfer.buyCard(slot.card.id, slot.price);
    if (!result.success) {
      var reason = result.reason;
      if (reason === 'insufficient_gold') {
        return { ok: false, reason: 'no_gold', needed: slot.price - CardAuthority.getGold() };
      }
      return { ok: false, reason: reason };
    }

    // Mark slot as sold
    var bought = slot.card;
    slot.sold  = true;
    slot.card  = null;

    console.log('[Shop] Bought ' + bought.name + ' for ' + slot.price + 'g (' + _factionId + ')');

    return { ok: true, card: bought, cost: slot.price };
  }

  /**
   * Sell one card from the player's collection by id.
   * Removes one copy from collection and awards gold.
   *
   * @param {string} cardId - ACT-### card id
   * @returns {Object} { ok: bool, amount?: number, reason?: string }
   */
  function sell(cardId) {
    if (!_open) return { ok: false, reason: 'shop_closed' };

    // Look up card definition
    var card = (typeof CardSystem !== 'undefined') ? CardSystem.getById(cardId) : null;
    if (!card) return { ok: false, reason: 'unknown_card' };

    // Use CardTransfer for atomic sell (card removal + gold award)
    var amount = _calcSellPrice(card);
    var result = CardTransfer.sellFromBackup(cardId, amount);
    if (!result.success) return { ok: false, reason: result.reason || 'not_in_collection' };

    // Record sale for faction reputation (card sales count toward rep too)
    var repResult = null;
    if (_factionId && typeof Salvage !== 'undefined' && Salvage.recordSale) {
      repResult = Salvage.recordSale(
        _factionId,
        Player.getFlag.bind(Player),
        Player.setFlag.bind(Player)
      );
    }

    console.log('[Shop] Sold ' + card.name + ' for ' + amount + 'g');
    return { ok: true, amount: amount, repResult: repResult };
  }

  /**
   * Sell a salvage part from the player's bag at the current faction shop.
   * Removes item from Player.bag, awards faction-adjusted gold, and
   * records the sale for reputation progression.
   *
   * Bridges: Player.bag → Salvage.getSellPrice → Player.addCurrency
   *          + Salvage.recordSale → faction rep tier.
   *
   * @param {string} itemId - Unique item id (e.g. "scale_1709345678901")
   * @returns {Object} { ok, amount?, repResult?, reason? }
   */
  function sellPart(itemId) {
    if (!_open) return { ok: false, reason: 'shop_closed' };
    if (!_factionId) return { ok: false, reason: 'no_faction' };

    // Find item in bag via CardAuthority (read-only copy)
    var bag = CardAuthority.getBag();
    var item = null;
    for (var i = 0; i < bag.length; i++) {
      if (bag[i] && bag[i].id === itemId) {
        item = bag[i];
        break;
      }
    }
    if (!item) return { ok: false, reason: 'not_in_bag' };

    // Calculate faction-adjusted price
    var amount = (typeof Salvage !== 'undefined')
      ? Salvage.getSellPrice(item, _factionId)
      : (item.baseValue || 1);

    // Use CardTransfer for atomic sell (bag removal + gold award)
    var result = CardTransfer.sellFromBagById(itemId, amount);
    if (!result.success) return { ok: false, reason: result.reason || 'sell_failed' };

    // Record sale for faction reputation
    var repResult = null;
    if (typeof Salvage !== 'undefined' && Salvage.recordSale) {
      repResult = Salvage.recordSale(
        _factionId,
        Player.getFlag.bind(Player),
        Player.setFlag.bind(Player)
      );
    }

    console.log('[Shop] Sold part ' + item.name + ' for ' + amount + 'g (' + _factionId + ')');

    return { ok: true, amount: amount, repResult: repResult };
  }

  // ── Supply purchases (DEPTH3 §5) ─────────────────────────────────

  /**
   * Buy a supply item by index into the current faction's supply list.
   * Unlimited stock — never sells out. Deducts gold, adds item to bag.
   *
   * @param {number} supplyIndex - Index into getSupplyStock() array
   * @returns {Object} { ok, reason?, item?, cost? }
   */
  function buySupply(supplyIndex) {
    if (!_open) return { ok: false, reason: 'shop_closed' };

    var stock    = getSupplyStock();
    var template = stock[supplyIndex];
    if (!template) return { ok: false, reason: 'invalid_supply' };

    var price = template.shopPrice || 1;
    var gold = CardAuthority.getGold();
    if (gold < price) {
      return { ok: false, reason: 'no_gold', needed: price - gold };
    }

    // Check bag capacity
    if (CardAuthority.getBagSize() >= CardAuthority.getMaxBag()) {
      return { ok: false, reason: 'bag_full' };
    }

    // Deduct gold
    CardAuthority.spendGold(price);

    // Create a fresh item instance from the template
    var item = {
      id: template.id,
      name: template.name,
      emoji: template.emoji,
      category: template.category,
      subtype: template.subtype,
      type: 'supply',
      shopPrice: template.shopPrice
    };
    if (template.crateFillTag) item.crateFillTag = template.crateFillTag;

    // Add to bag
    CardAuthority.addToBag(item);

    return { ok: true, item: item, cost: price };
  }

  /**
   * Get the supply stock list for the currently-open faction.
   * Returns the faction-specific catalog from FACTION_SUPPLIES, or the
   * universal SUPPLY_STOCK fallback when faction is unknown/unset.
   * Unlimited stock — items in this list never sell out.
   * @returns {Array}
   */
  function getSupplyStock() {
    return FACTION_SUPPLIES[_factionId] || SUPPLY_STOCK;
  }

  // ── Reputation ────────────────────────────────────────────────────

  /**
   * Get the player's reputation tier with the current faction.
   * Delegates to Salvage.getRepTier() which reads Player flags.
   * @returns {number} 0–3
   */
  function getRepTier() {
    if (!_factionId) return 0;
    if (typeof Salvage === 'undefined' || !Salvage.getRepTier) return 0;
    return Salvage.getRepTier(_factionId, Player.getFlag.bind(Player));
  }

  /**
   * Get a summary of rep tiers for all three factions at once.
   * Used by menu-faces.js Face 0 faction overview panel.
   * @returns {Object} { tide: n, foundry: n, admiralty: n }
   */
  function getAllRepTiers() {
    var factions = ['tide', 'foundry', 'admiralty'];
    var result = {};
    for (var i = 0; i < factions.length; i++) {
      var fid = factions[i];
      if (typeof Salvage !== 'undefined' && Salvage.getRepTier) {
        result[fid] = Salvage.getRepTier(fid, Player.getFlag.bind(Player));
      } else {
        result[fid] = 0;
      }
    }
    return result;
  }

  // ── Accessors ─────────────────────────────────────────────────────

  /** Live inventory array (do not mutate). */
  function getInventory() { return _inventory; }

  /** Active faction id, or null if shop not opened yet. */
  function getCurrentFaction() { return _factionId; }

  /** True while the shop menu is shown. */
  function isOpen() { return _open; }

  /**
   * Display label for a faction id.
   * @param {string} id
   * @returns {string}
   */
  function getFactionLabel(id) {
    return (FACTION_META[id] && FACTION_META[id].label) || id || 'Unknown';
  }

  /**
   * Emoji for a faction id.
   * @param {string} id
   * @returns {string}
   */
  function getFactionEmoji(id) {
    return (FACTION_META[id] && FACTION_META[id].emoji) || '🏪';
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    open:              open,
    close:             close,
    reset:             reset,
    getInventory:      getInventory,
    buy:               buy,
    sell:              sell,
    sellPart:          sellPart,
    getCurrentFaction: getCurrentFaction,
    getRepTier:        getRepTier,
    getAllRepTiers:     getAllRepTiers,
    getFactionLabel:   getFactionLabel,
    getFactionEmoji:   getFactionEmoji,
    isOpen:            isOpen,
    getCardSellPrice:  _calcSellPrice,
    buySupply:         buySupply,
    getSupplyStock:    getSupplyStock,
    SUPPLY_STOCK:      SUPPLY_STOCK
  };
})();

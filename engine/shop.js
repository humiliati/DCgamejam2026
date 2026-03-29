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
 * Layer 3 — depends on: CardSystem, Salvage, Player, SeededRNG, LootTables
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

  // ── Internal state ────────────────────────────────────────────────

  var _factionId   = null;   // Currently-open faction
  var _floor       = 1;
  var _inventory   = [];     // [{card, price, sold}]  — 5 slots
  var _open        = false;
  var _cacheKey    = null;   // faction+'_'+floor — detect when to rebuild

  // ── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Open the shop for a given faction and floor.
   * Rebuilds inventory only if faction or floor changed.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   * @param {number} floor
   */
  function open(factionId, floor) {
    _factionId = factionId || 'tide';
    _floor     = floor || 1;
    _open      = true;

    var key = _factionId + '_' + _floor;
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

    var ps = Player.state();
    if (ps.currency < slot.price) {
      return { ok: false, reason: 'no_gold', needed: slot.price - ps.currency };
    }

    // Deduct gold
    Player.spendCurrency(slot.price);

    // Add card to player's collection
    CardSystem.addCard(slot.card.id);

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

    // Remove from collection
    var removed = CardSystem.removeCard(cardId);
    if (!removed) return { ok: false, reason: 'not_in_collection' };

    var amount = _calcSellPrice(card);
    Player.addCurrency(amount);

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

    // Find item in player bag
    var bag = Player.state().bag;
    var itemIdx = -1;
    var item = null;
    for (var i = 0; i < bag.length; i++) {
      if (bag[i] && bag[i].id === itemId) {
        itemIdx = i;
        item = bag[i];
        break;
      }
    }
    if (!item) return { ok: false, reason: 'not_in_bag' };

    // Calculate faction-adjusted price
    var amount = (typeof Salvage !== 'undefined')
      ? Salvage.getSellPrice(item, _factionId)
      : (item.baseValue || 1);

    // Remove from bag
    bag.splice(itemIdx, 1);

    // Award gold
    Player.addCurrency(amount);

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
    isOpen:            isOpen
  };
})();

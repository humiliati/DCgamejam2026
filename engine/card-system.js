/**
 * CardSystem — card registry loader, collection management, hand draw.
 *
 * Loads the full card registry from data/cards.json via synchronous XHR
 * (same rationale as LootTables: avoids async cascade on webOS startup).
 *
 * Terminology:
 *   _registry   — all cards parsed from JSON (read-only reference data)
 *   _collection — cards the player currently owns (starts as starter deck)
 *   _deck       — shuffled draw pile built from _collection
 *   _hand       — cards drawn and available to play this turn
 *
 * Public API:
 *   CardSystem.init()                        — load JSON, build starter deck
 *   CardSystem.resetDeck()                   — reshuffle _collection into _deck
 *   CardSystem.drawHand([count])             — draw N cards (default 5)
 *   CardSystem.getHand()                     — current hand array
 *   CardSystem.playFromHand(index)           — remove & return card from hand
 *   CardSystem.addCard(cardId|cardObj)       — add card to player collection
 *   CardSystem.removeCard(cardId)            — remove one copy from collection
 *   CardSystem.getCollection()               — player's owned cards
 *   CardSystem.getById(id)                   — look up registry entry by ACT-### id
 *   CardSystem.getByPool(factionId, repTier) — shop inventory: cards for this faction/tier
 *   CardSystem.getBiomeDrops(biome)          — cards that can drop in a biome (chests/enemies)
 *   CardSystem.getAllRegistry()              — full card registry array
 *
 * Layer 2 — depends on: SeededRNG (rng.js)
 */
var CardSystem = (function () {
  'use strict';

  // ── Internal state ────────────────────────────────────────────────

  var _registry   = [];   // Full card definitions from JSON
  var _byId       = {};   // Fast lookup: id → card def
  var _collection = [];   // Player's owned card copies
  var _deck       = [];   // Shuffled draw pile
  var _hand       = [];   // Cards in current hand
  var _loaded     = false;

  // ── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Load data/cards.json via synchronous XHR and seed the player's
   * starter deck from cards flagged { starterDeck: true }.
   * Safe to call multiple times — re-entrant guard via _loaded.
   */
  function init() {
    _loadRegistry();
    _buildStarterCollection();
    resetDeck();
  }

  function _loadRegistry() {
    if (_loaded) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/cards.json', false);  // Sync — intentional; see header comment
      xhr.send();
      if (xhr.status === 200) {
        var parsed = JSON.parse(xhr.responseText);
        // Accept either a bare array or { cards: [...] } envelope
        _registry = Array.isArray(parsed) ? parsed
                  : (Array.isArray(parsed.cards) ? parsed.cards : []);
        _buildIndex();
        _loaded = true;
        console.log('[CardSystem] Loaded ' + _registry.length + ' cards from cards.json');
      } else {
        console.warn('[CardSystem] HTTP ' + xhr.status + ' — using hardcoded fallback deck');
        _registry = _fallbackRegistry();
        _buildIndex();
        _loaded = true;
      }
    } catch (e) {
      console.error('[CardSystem] Load failed:', e);
      _registry = _fallbackRegistry();
      _buildIndex();
      _loaded = true;
    }
  }

  function _buildIndex() {
    _byId = {};
    for (var i = 0; i < _registry.length; i++) {
      _byId[_registry[i].id] = _registry[i];
    }
  }

  function _buildStarterCollection() {
    _collection = [];
    for (var i = 0; i < _registry.length; i++) {
      if (_registry[i].starterDeck) {
        _collection.push(_registry[i]);
      }
    }
    // Guarantee at least one playable card if JSON is empty or malformed
    if (_collection.length === 0) {
      _collection = _fallbackRegistry();
    }
  }

  // ── Fallback (bare minimum if JSON unavailable) ───────────────────

  function _fallbackRegistry() {
    return [
      { id: 'ACT-001', name: 'Slash',   emoji: '⚔️',  suit: 'spade', rarity: 'common',
        cost: { type: 'free', value: 0 }, effects: [{ type: 'damage', value: 2, target: 'enemy' }],
        synergyTags: ['melee', 'spade'], shopPool: [], biomeDrops: [], dropTier: 0,
        starterDeck: true, description: 'Deal 2 ♠ damage.' },
      { id: 'ACT-002', name: 'Block',   emoji: '🛡️',  suit: 'spade', rarity: 'common',
        cost: { type: 'free', value: 0 }, effects: [{ type: 'defense', value: 2, target: 'self' }],
        synergyTags: ['defensive', 'spade'], shopPool: [], biomeDrops: [], dropTier: 0,
        starterDeck: true, description: 'Gain 2 defense.' },
      { id: 'ACT-003', name: 'Bandage', emoji: '🩹',  suit: 'heart', rarity: 'common',
        cost: { type: 'free', value: 0 }, effects: [{ type: 'hot', value: 1, ticks: 3, target: 'self' }],
        synergyTags: ['medical', 'heart'], shopPool: [], biomeDrops: [], dropTier: 0,
        starterDeck: true, description: 'Heal 1 HP for 3 moves.' },
      { id: 'ACT-004', name: 'Arrow',   emoji: '🏹',  suit: 'spade', rarity: 'common',
        cost: { type: 'free', value: 0 }, effects: [{ type: 'damage', value: 3, target: 'enemy' }],
        synergyTags: ['ranged', 'spade'], shopPool: [], biomeDrops: [], dropTier: 0,
        starterDeck: true, description: 'Deal 3 ranged damage.' },
      { id: 'ACT-005', name: 'Bash',    emoji: '🔨',  suit: 'club', rarity: 'common',
        cost: { type: 'free', value: 0 }, effects: [{ type: 'damage', value: 4, target: 'enemy' }, { type: 'stun', value: 1, target: 'enemy' }],
        synergyTags: ['melee', 'stun', 'club'], shopPool: [], biomeDrops: [], dropTier: 0,
        starterDeck: true, description: 'Deal 4 ♣ damage. Stun 1 turn.' }
    ];
  }

  // ── Deck & hand management ────────────────────────────────────────

  /** Reshuffle the player's collection into a fresh draw pile. */
  function resetDeck() {
    _deck = _collection.slice();
    SeededRNG.shuffle(_deck);
    _hand = [];
  }

  /**
   * Draw N cards into _hand (default 5). Recycles deck when exhausted.
   * @param {number} [count=5]
   * @returns {Array} The new hand.
   */
  function drawHand(count) {
    count = count || 5;
    _hand = [];
    for (var i = 0; i < count; i++) {
      if (_deck.length === 0) {
        // Reshuffle — don't clear _hand, just replenish _deck
        _deck = _collection.slice();
        SeededRNG.shuffle(_deck);
      }
      if (_deck.length > 0) _hand.push(_deck.pop());
    }
    return _hand;
  }

  /** Return the current hand without modifying it. */
  function getHand() { return _hand; }

  /**
   * Remove and return the card at hand[index], or null if out of bounds.
   * @param {number} index
   * @returns {Object|null}
   */
  function playFromHand(index) {
    if (index < 0 || index >= _hand.length) return null;
    return _hand.splice(index, 1)[0];
  }

  /**
   * Resolve a stack of cards from hand — stack-based combat play.
   * Persistent cards return to hand; expendable cards are consumed.
   *
   * @param {Array} stackEntries - [{ card, handIndex }] from CardStack
   * @returns {{ expended: Array, retained: Array }}
   */
  function playStack(stackEntries) {
    // Sort by hand index descending so splices don't shift earlier indices
    var sorted = stackEntries.slice().sort(function (a, b) {
      return b.handIndex - a.handIndex;
    });

    var expended = [];
    var retained = [];

    for (var i = 0; i < sorted.length; i++) {
      var entry = sorted[i];
      var card = entry.card;
      var isPersist = card.persistent === true ||
                      (card.cost && card.cost.persistent === true);

      if (isPersist) {
        // Persistent: card stays in hand (don't splice)
        retained.push(card);
      } else {
        // Expendable: remove from hand
        if (entry.handIndex >= 0 && entry.handIndex < _hand.length) {
          _hand.splice(entry.handIndex, 1);
        }
        expended.push(card);
      }
    }

    return { expended: expended, retained: retained };
  }

  /**
   * Draw N cards from the deck into hand (top-up, not replace).
   * Used for per-turn draw during combat (Gone Rogue pattern).
   *
   * @param {number} [count=1]
   * @returns {Array} Newly drawn cards
   */
  function drawToHand(count) {
    count = count || 1;
    var drawn = [];
    for (var i = 0; i < count; i++) {
      if (_deck.length === 0) {
        // Reshuffle collection into deck (minus cards currently in hand)
        var handIds = {};
        for (var h = 0; h < _hand.length; h++) {
          handIds[_hand[h].id] = (handIds[_hand[h].id] || 0) + 1;
        }
        _deck = [];
        for (var c = 0; c < _collection.length; c++) {
          var cid = _collection[c].id;
          if (handIds[cid] && handIds[cid] > 0) {
            handIds[cid]--;
          } else {
            _deck.push(_collection[c]);
          }
        }
        SeededRNG.shuffle(_deck);
        if (_deck.length === 0) break;  // Collection exhausted
      }
      var card = _deck.pop();
      _hand.push(card);
      drawn.push(card);
    }
    return drawn;
  }

  // ── Collection mutation ───────────────────────────────────────────

  /**
   * Add a card to the player's collection.
   * Accepts a card id string (ACT-###) or a full card object.
   * @param {string|Object} cardOrId
   * @returns {boolean} True if the card was found and added.
   */
  function addCard(cardOrId) {
    var card = (typeof cardOrId === 'string') ? _byId[cardOrId] : cardOrId;
    if (!card) {
      console.warn('[CardSystem] addCard: unknown id', cardOrId);
      return false;
    }
    _collection.push(card);
    return true;
  }

  /**
   * Remove one copy of a card (by id) from the player's collection.
   * Does not affect the current _deck or _hand mid-combat.
   * @param {string} cardId
   * @returns {boolean} True if a copy was removed.
   */
  function removeCard(cardId) {
    for (var i = 0; i < _collection.length; i++) {
      if (_collection[i].id === cardId) {
        _collection.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** Return the player's owned card array (live reference — do not mutate). */
  function getCollection() { return _collection; }

  // ── Registry queries ──────────────────────────────────────────────

  /**
   * Look up a card definition by ACT-### id.
   * @param {string} id
   * @returns {Object|null}
   */
  function getById(id) {
    return _byId[id] || null;
  }

  /**
   * Return all cards available in a faction's shop at a given reputation tier.
   * Filters: shopPool includes factionId AND dropTier <= repTier.
   *
   * @param {string} factionId - 'tide' | 'foundry' | 'admiralty'
   * @param {number} repTier   - 0–3 (player's current rep with this faction)
   * @returns {Array}          Array of card definitions
   */
  function getByPool(factionId, repTier) {
    if (!_loaded) _loadRegistry();
    repTier = repTier || 0;
    return _registry.filter(function (c) {
      return Array.isArray(c.shopPool) &&
             c.shopPool.indexOf(factionId) !== -1 &&
             (c.dropTier || 0) <= repTier;
    });
  }

  /**
   * Return cards that can drop in a given biome (from chests or enemy kills).
   * @param {string} biome - 'cellar' | 'foundry' | 'sealab'
   * @returns {Array}
   */
  function getBiomeDrops(biome) {
    if (!_loaded) _loadRegistry();
    return _registry.filter(function (c) {
      return Array.isArray(c.biomeDrops) && c.biomeDrops.indexOf(biome) !== -1;
    });
  }

  /** Return the full raw registry (for editor / debug overlays). */
  function getAllRegistry() {
    if (!_loaded) _loadRegistry();
    return _registry;
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    init:          init,
    resetDeck:     resetDeck,
    drawHand:      drawHand,
    getHand:       getHand,
    playFromHand:  playFromHand,
    playStack:     playStack,
    drawToHand:    drawToHand,
    addCard:       addCard,
    removeCard:    removeCard,
    getCollection: getCollection,
    getById:       getById,
    getByPool:     getByPool,
    getBiomeDrops: getBiomeDrops,
    getAllRegistry: getAllRegistry,
    // Legacy alias kept for any caller that used getAllCards()
    getAllCards:    getCollection
  };
})();

/**
 * CardSystem — READ-ONLY card definition registry.
 *
 * S0.3 REWIRE: All mutable state (hand, collection, deck, gold) has been
 * moved to CardAuthority (S0.1). All transfers go through CardTransfer (S0.2).
 * CardSystem is now a pure registry loader — no mutable state, no events.
 *
 * Loads the full card registry from data/cards.json via synchronous XHR
 * (same rationale as LootTables: avoids async cascade on webOS startup).
 *
 * Public API (registry queries):
 *   CardSystem.init()                        — load JSON registry
 *   CardSystem.getById(id)                   — look up card def by ACT-### id
 *   CardSystem.getByPool(factionId, repTier) — shop inventory for faction/tier
 *   CardSystem.getBiomeDrops(biome)          — cards that drop in a biome
 *   CardSystem.getAllRegistry()              — full card registry array
 *
 * Proxy stubs (forward to CardAuthority for backward compat):
 *   CardSystem.getHand()           → CardAuthority.getHand()
 *   CardSystem.drawHand(n)         → CardAuthority.drawHand(n)
 *   CardSystem.drawToHand(n)       → CardAuthority.drawToHand(n)
 *   CardSystem.drawWithOverflow()  → CardAuthority.drawWithOverflow()
 *   CardSystem.playFromHand(i)     → CardAuthority.removeFromHand(i)
 *   CardSystem.playStack(entries)  → CardAuthority.playStack(entries)
 *   CardSystem.pushToHand(card)    → CardAuthority.addToHand(card)
 *   CardSystem.resetDeck()         → CardAuthority.resetDeck()
 *   CardSystem.addCard(c)          → CardAuthority.addToBackup(hydrated)
 *   CardSystem.removeCard(id)      → CardAuthority.removeFromBackupById(id)
 *   CardSystem.getCollection()     → CardAuthority.getBackup()
 *   CardSystem.getCollectionSize() → CardAuthority.getBackupSize()
 *   CardSystem.getDeckSize()       → CardAuthority.getDeckSize()
 *   CardSystem.failstateWipe()     → CardAuthority.failstateWipe()
 *   CardSystem.on/off(type, fn)    → CardAuthority.on/off(type, fn)
 *   CardSystem.moveHandToCollection(i) → CardAuthority.moveHandToBackup(i)
 *   CardSystem.moveCollectionToHand(i) → CardAuthority.moveBackupToHand(i)
 *
 * These proxies log deprecation warnings so callers can be tracked and
 * migrated in subsequent sprints. They will be removed in S0.5.
 *
 * Layer 1 — depends on: nothing (registry is self-contained)
 *
 * @see engine/card-authority.js (S0.1 — state owner)
 * @see engine/card-transfer.js  (S0.2 — validated transfers)
 */
var CardSystem = (function () {
  'use strict';

  // ── Constants (kept for backward compat — also in CardAuthority) ───

  var MAX_HAND       = 5;
  var MAX_COLLECTION = 30;

  // ── Registry state (the only state this module still owns) ────────

  var _registry = [];   // Full card definitions from JSON
  var _byId     = {};   // Fast lookup: id → card def
  var _loaded   = false;

  // ── Deprecation logger ────────────────────────────────────────────

  var _warned = {};
  function _deprecate(method) {
    if (!_warned[method]) {
      _warned[method] = true;
      console.warn('[CardSystem] DEPRECATED: ' + method + '() — use CardAuthority/CardTransfer instead');
    }
  }

  // ── Registry loading ──────────────────────────────────────────────

  function _loadRegistry() {
    if (_loaded) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/cards.json', false);  // Sync — intentional; see header comment
      xhr.send();
      if (xhr.status === 200) {
        var parsed = JSON.parse(xhr.responseText);
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
      { id: 'ACT-003', name: 'Bandage', emoji: '💊',  suit: 'heart', rarity: 'common',
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

  // ── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Load data/cards.json registry. Seed CardAuthority's backup deck
   * from cards flagged { starterDeck: true }.
   */
  function init() {
    _loadRegistry();

    // Seed CardAuthority backup with starter deck if available
    if (typeof CardAuthority !== 'undefined') {
      var starters = [];
      for (var i = 0; i < _registry.length; i++) {
        if (_registry[i].starterDeck) {
          starters.push(_registry[i]);
        }
      }
      if (starters.length === 0) starters = _fallbackRegistry();
      for (var s = 0; s < starters.length; s++) {
        CardAuthority.addToBackup(starters[s]);
      }
      CardAuthority.resetDeck();
    }
  }

  // ── Registry queries (the real API) ───────────────────────────────

  function getById(id) {
    if (!_loaded) _loadRegistry();
    return _byId[id] || null;
  }

  function getByPool(factionId, repTier) {
    if (!_loaded) _loadRegistry();
    repTier = repTier || 0;
    return _registry.filter(function (c) {
      return Array.isArray(c.shopPool) &&
             c.shopPool.indexOf(factionId) !== -1 &&
             (c.dropTier || 0) <= repTier;
    });
  }

  function getBiomeDrops(biome) {
    if (!_loaded) _loadRegistry();
    return _registry.filter(function (c) {
      return Array.isArray(c.biomeDrops) && c.biomeDrops.indexOf(biome) !== -1;
    });
  }

  function getAllRegistry() {
    if (!_loaded) _loadRegistry();
    return _registry;
  }

  // ── Proxy stubs (forward to CardAuthority, log deprecation) ───────
  //
  // These exist so un-rewired callers don't break immediately.
  // Each logs a one-time warning to aid migration tracking.

  function getHand() {
    _deprecate('getHand');
    return CardAuthority.getHand();
  }

  function drawHand(count) {
    _deprecate('drawHand');
    return CardAuthority.drawHand(count);
  }

  function drawToHand(count) {
    _deprecate('drawToHand');
    return CardAuthority.drawToHand(count);
  }

  function drawWithOverflow(maxHand, maxCollection) {
    _deprecate('drawWithOverflow');
    return CardAuthority.drawWithOverflow(maxHand, maxCollection);
  }

  function playFromHand(index) {
    _deprecate('playFromHand');
    return CardAuthority.removeFromHand(index);
  }

  function playStack(stackEntries) {
    _deprecate('playStack');
    return CardAuthority.playStack(stackEntries);
  }

  function pushToHand(card) {
    _deprecate('pushToHand');
    return CardAuthority.addToHand(card);
  }

  function resetDeck() {
    _deprecate('resetDeck');
    CardAuthority.resetDeck();
  }

  function addCard(cardOrId) {
    _deprecate('addCard');
    var card = (typeof cardOrId === 'string') ? getById(cardOrId) : cardOrId;
    if (!card) return false;
    return CardAuthority.addToBackup(card);
  }

  function removeCard(cardId) {
    _deprecate('removeCard');
    return CardAuthority.removeFromBackupById(cardId);
  }

  function getCollection() {
    _deprecate('getCollection');
    return CardAuthority.getBackup();
  }

  function getCollectionSize() {
    _deprecate('getCollectionSize');
    return CardAuthority.getBackupSize();
  }

  function getDeckSize() {
    _deprecate('getDeckSize');
    return CardAuthority.getDeckSize();
  }

  function moveHandToCollection(handIndex) {
    _deprecate('moveHandToCollection');
    return CardAuthority.moveHandToBackup(handIndex);
  }

  function moveCollectionToHand(collectionIndex) {
    _deprecate('moveCollectionToHand');
    return CardAuthority.moveBackupToHand(collectionIndex);
  }

  function failstateWipe() {
    _deprecate('failstateWipe');
    return CardAuthority.failstateWipe();
  }

  function on(type, fn) {
    _deprecate('on');
    CardAuthority.on(type, fn);
  }

  function off(type, fn) {
    _deprecate('off');
    CardAuthority.off(type, fn);
  }

  // Also handle emitHandChanged (called by card-fan.js after reorder)
  function emitHandChanged() {
    _deprecate('emitHandChanged');
    // CardAuthority events handle this — no-op proxy
  }

  // ── Public API ────────────────────────────────────────────────────

  return {
    // ── Constants (backward compat) ──
    MAX_HAND:       MAX_HAND,
    MAX_COLLECTION: MAX_COLLECTION,

    // ── Lifecycle ──
    init: init,

    // ── Registry queries (the real API) ──
    getById:        getById,
    getByPool:      getByPool,
    getBiomeDrops:  getBiomeDrops,
    getAllRegistry:  getAllRegistry,

    // ── Proxy stubs (deprecated — use CardAuthority/CardTransfer) ──
    resetDeck:            resetDeck,
    drawHand:             drawHand,
    getHand:              getHand,
    playFromHand:         playFromHand,
    playStack:            playStack,
    drawToHand:           drawToHand,
    drawWithOverflow:     drawWithOverflow,
    pushToHand:           pushToHand,
    addCard:              addCard,
    removeCard:           removeCard,
    getCollection:        getCollection,
    getCollectionSize:    getCollectionSize,
    getDeckSize:          getDeckSize,
    moveHandToCollection: moveHandToCollection,
    moveCollectionToHand: moveCollectionToHand,
    failstateWipe:        failstateWipe,
    on:                   on,
    off:                  off,
    emitHandChanged:      emitHandChanged,

    // Legacy alias
    getAllCards: getCollection
  };
})();

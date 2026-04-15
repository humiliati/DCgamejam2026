/**
 * CardSystem — READ-ONLY card definition registry.
 *
 * Loads the full card registry from data/cards.json via synchronous XHR
 * (same rationale as LootTables: avoids async cascade on webOS startup).
 * Seeds CardAuthority's backup deck with starter cards on init().
 *
 * S0.5: All proxy stubs stripped. Mutable state lives in CardAuthority,
 * transfers go through CardTransfer. This module is now a pure registry.
 *
 * Public API:
 *   CardSystem.init()                        — load JSON, seed starter deck
 *   CardSystem.getById(id)                   — look up card def by ACT-### id
 *   CardSystem.getByPool(factionId, repTier) — shop inventory for faction/tier
 *   CardSystem.getBiomeDrops(biome)          — cards that drop in a biome
 *   CardSystem.getAllRegistry()              — full card registry array
 *
 * Layer 1 — depends on: CardAuthority (for starter deck seeding at init)
 *
 * @see engine/card-authority.js (S0.1 — state owner)
 * @see engine/card-transfer.js  (S0.2 — validated transfers)
 */
var CardSystem = (function () {
  'use strict';

  // ── Registry state ────────────────────────────────────────────────

  var _registry = [];   // Full card definitions from JSON
  var _byId     = {};   // Fast lookup: id → card def
  var _loaded   = false;

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
  /**
   * Idempotent registry init — safe to call on every GAMEPLAY enter,
   * including after loads. Must NEVER mutate CardAuthority or Player.
   *
   * Starter inventory is explicitly NOT seeded here — see seedStarter().
   * Conflating the two caused the "duplicate gold / duplicate bag items
   * on resume" bug; keep them separate.
   */
  function init() {
    _loadRegistry();
  }

  /**
   * Destructive fresh-run seed — adds starter deck, 15g, and starter
   * bag consumables to CardAuthority. Call EXACTLY once per new run,
   * from the fresh-deploy branch of Game._initGameplay. Never from a
   * load path or a retry path (Player.reset() / CardAuthority state
   * from the save slot is the source of truth there).
   */
  function seedStarter() {
    if (typeof CardAuthority === 'undefined') return;

    if (!_loaded) _loadRegistry();

    // Starter deck — cards flagged { starterDeck: true } in cards.json
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

    // Starter gold — 15g flat for all classes.
    // Class multiplier hook reserved for future per-class tuning.
    CardAuthority.addGold(15);

    // Starter embellishment consumables — 16 Silk Spiders + 2 Trap Kits.
    // Each addToBag call gets a fresh object literal so bag slots are
    // independent references (no shared-state aliasing).
    for (var si = 0; si < 16; si++) {
      CardAuthority.addToBag({ id: 'ITM-115', name: 'Silk Spider', emoji: '\uD83D\uDD77\uFE0F', type: 'consumable', subtype: 'supply' });
    }
    CardAuthority.addToBag({ id: 'ITM-116', name: 'Trap Kit', emoji: '\uD83E\uDE9C', type: 'consumable', subtype: 'supply' });
    CardAuthority.addToBag({ id: 'ITM-116', name: 'Trap Kit', emoji: '\uD83E\uDE9C', type: 'consumable', subtype: 'supply' });
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

  // ── Public API ────────────────────────────────────────────────────
  //
  // S0.5: All proxy stubs removed. CardSystem is now a pure registry.
  // Mutable state lives in CardAuthority. Transfers go through CardTransfer.

  return {
    // ── Lifecycle ──
    init:         init,
    seedStarter:  seedStarter,

    // ── Registry queries ──
    getById:        getById,
    getByPool:      getByPool,
    getBiomeDrops:  getBiomeDrops,
    getAllRegistry:  getAllRegistry
  };
})();

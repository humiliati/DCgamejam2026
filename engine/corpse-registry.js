/**
 * CorpseRegistry — persistent corpse entity store (A2 evolution).
 *
 * Replaces the simple TILES.CORPSE grid scan with rich per-corpse data.
 * Corpses retain their defeated sprite (folded origami / Paper Mario style),
 * only transitioning to bone 🦴 when looted dry via Salvage.
 *
 * Hydration/restock slots mirror the crate system (Phase B stub) so that
 * corpses can be reanimated as friendly NPCs hostile to heroes.
 *
 * Layer 1 — depends on: EnemySprites (pose registry), TILES
 */
var CorpseRegistry = (function () {
  'use strict';

  // ── Storage ─────────────────────────────────────────────────────────
  // Keyed by "floorId:x:y" → corpse entity
  var _corpses = {};

  // ── Loot states ─────────────────────────────────────────────────────
  var LOOT_STATE = {
    FULL:    'full',     // Untouched — full harvests remain
    PARTIAL: 'partial',  // Some harvests taken
    DRY:     'dry'       // Looted dry — shows bone emoji
  };

  // ── Key helper ──────────────────────────────────────────────────────

  function _key(x, y, floorId) {
    return floorId + ':' + x + ':' + y;
  }

  // ── Registration ────────────────────────────────────────────────────

  /**
   * Register a new corpse when an enemy dies.
   * Called by CombatBridge after death animation completes.
   *
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {string} floorId - Current floor ID
   * @param {Object} enemy - The defeated enemy entity
   * @returns {Object} The registered corpse entity
   */
  function register(x, y, floorId, enemy) {
    var enemyType = (enemy.type || enemy.name || 'unknown').toLowerCase();

    // Get corpse emoji from EnemySprites pose registry
    var corpseEmoji = '💀'; // fallback
    if (typeof EnemySprites !== 'undefined') {
      corpseEmoji = EnemySprites.getEmoji(enemyType, 'corpse', enemy.emoji || '💀');
    }

    // Resolve stack definition for pile rendering
    var stackDef = null;
    if (typeof EnemySprites !== 'undefined') {
      stackDef = EnemySprites.getStack(enemyType);
    }

    // Seed for deterministic pile scatter direction
    var seed = 0;
    for (var ci = 0; ci < enemyType.length; ci++) seed += enemyType.charCodeAt(ci);

    var corpse = {
      x: x,
      y: y,
      floorId: floorId,
      enemyType: enemyType,
      enemyName: enemy.name || 'Unknown',
      // Visual state
      emoji: enemy.emoji || '💀',         // Living emoji (for reanimation)
      corpseEmoji: corpseEmoji,            // Corpse pose emoji (shown when folded)
      boneEmoji: '🦴',                     // Dry/looted emoji
      displayEmoji: corpseEmoji,           // Current display — starts as corpse pose
      // Stack data for pile rendering
      stackDef: stackDef,                  // Full stack definition (null = legacy)
      pileSeed: seed,                      // Scatter direction seed
      // Loot tracking
      lootState: LOOT_STATE.FULL,
      // Hydration / restock slots (Phase B stub — mirrors crate system)
      hydrationSlots: [],
      maxHydrationSlots: 3,
      // Reanimation
      reanimated: false,
      friendly: false,                     // When reanimated: friendly to player
      reanimHp: Math.max(1, Math.floor((enemy.maxHp || 5) * 0.5)),
      reanimStr: Math.max(1, Math.floor((enemy.str || 1) * 0.6)),
      // Death metadata
      deathType: (typeof EnemySprites !== 'undefined')
        ? EnemySprites.getDeathType(enemy)
        : 'fold',
      tags: enemy.tags ? enemy.tags.slice() : [],
      isElite: enemy.isElite || false
    };

    var key = _key(x, y, floorId);
    _corpses[key] = corpse;

    // Auto-create corpse stock container in CrateSystem (Phase B)
    if (typeof CrateSystem !== 'undefined') {
      var biome = _resolveBiome(floorId);
      var suit = enemy.suit || 'spade';
      CrateSystem.createCorpse(x, y, floorId, biome, suit);
    }

    return corpse;
  }

  // Biome resolution helper (mirrors EnemyAI._resolveBiome)
  function _resolveBiome(floorId) {
    var parts = String(floorId).split('.');
    var depth = parts.length;
    if (depth < 3) return 'cellar';
    var level = parseInt(parts[parts.length - 1], 10) || 1;
    if (level <= 2) return 'cellar';
    if (level <= 5) return 'foundry';
    return 'sealab';
  }

  // ── Queries ─────────────────────────────────────────────────────────

  /**
   * Get corpse entity at a specific tile.
   * @returns {Object|null}
   */
  function getCorpseAt(x, y, floorId) {
    return _corpses[_key(x, y, floorId)] || null;
  }

  /**
   * Get all corpses on a floor (for sprite building).
   * @param {string} floorId
   * @returns {Array} Array of corpse entities
   */
  function getAllCorpses(floorId) {
    var result = [];
    var prefix = floorId + ':';
    for (var key in _corpses) {
      if (_corpses.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
        result.push(_corpses[key]);
      }
    }
    return result;
  }

  /**
   * Check if a corpse exists at a tile.
   */
  function hasCorpse(x, y, floorId) {
    return !!_corpses[_key(x, y, floorId)];
  }

  // ── Loot state management ──────────────────────────────────────────

  /**
   * Update loot state. When 'dry', display emoji transitions to bone.
   * Called by game.js harvest handler via Salvage integration.
   */
  function setLootState(x, y, floorId, state) {
    var corpse = _corpses[_key(x, y, floorId)];
    if (!corpse) return;

    corpse.lootState = state;

    if (state === LOOT_STATE.DRY) {
      // Looted dry — show bone
      corpse.displayEmoji = corpse.boneEmoji;
    } else if (state === LOOT_STATE.FULL) {
      // Restocked — revert to corpse emoji
      corpse.displayEmoji = corpse.corpseEmoji;
    }
    // PARTIAL keeps current corpse emoji
  }

  /**
   * Get the display emoji for a corpse (respects loot state).
   */
  function getDisplayEmoji(x, y, floorId) {
    var corpse = _corpses[_key(x, y, floorId)];
    if (!corpse) return '🦴';
    return corpse.displayEmoji;
  }

  // ── Hydration / Restock (Phase B stubs) ────────────────────────────

  /**
   * Add a hydration item to a corpse's restock slots.
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @param {Object} item - Item to add to hydration slot
   * @returns {boolean} true if slot was available
   */
  function addHydration(x, y, floorId, item) {
    var corpse = _corpses[_key(x, y, floorId)];
    if (!corpse) return false;
    if (corpse.hydrationSlots.length >= corpse.maxHydrationSlots) return false;
    corpse.hydrationSlots.push(item);
    return true;
  }

  /**
   * Check if corpse is fully hydrated (all slots filled).
   */
  function isFullyHydrated(x, y, floorId) {
    var corpse = _corpses[_key(x, y, floorId)];
    if (!corpse) return false;
    return corpse.hydrationSlots.length >= corpse.maxHydrationSlots;
  }

  /**
   * Reanimate a corpse as a friendly NPC.
   * Requires the CrateSystem container to be sealed with a matching suit card.
   * Falls back to legacy hydration slot check if CrateSystem is unavailable.
   *
   * @returns {Object|null} The reanimated entity data, or null if not ready
   */
  function reanimate(x, y, floorId) {
    var corpse = _corpses[_key(x, y, floorId)];
    if (!corpse) return null;
    if (corpse.reanimated) return null;

    // Primary path: CrateSystem corpse stock must be sealed with suit card match
    if (typeof CrateSystem !== 'undefined') {
      var container = CrateSystem.getContainer(x, y, floorId);
      if (!container || !container.sealed) return null;
      // Check suit card slot was matched
      var hasSuitMatch = false;
      for (var i = 0; i < container.slots.length; i++) {
        if (container.slots[i].frameTag === CrateSystem.FRAME.SUIT_CARD && container.slots[i].matched) {
          hasSuitMatch = true;
          break;
        }
      }
      if (!hasSuitMatch) return null;
    } else {
      // Legacy fallback: hydration slots
      if (corpse.hydrationSlots.length < corpse.maxHydrationSlots) return null;
    }

    corpse.reanimated = true;
    corpse.friendly = true;
    // Revert display to living emoji (they're alive again)
    corpse.displayEmoji = corpse.emoji;

    return {
      x: corpse.x,
      y: corpse.y,
      name: corpse.enemyName,
      emoji: corpse.emoji,
      type: corpse.enemyType,
      hp: corpse.reanimHp,
      str: corpse.reanimStr,
      friendly: true,
      tags: corpse.tags
    };
  }

  // ── Floor management ───────────────────────────────────────────────

  /**
   * Remove a specific corpse (e.g. fully looted + cleared).
   */
  function remove(x, y, floorId) {
    delete _corpses[_key(x, y, floorId)];
  }

  /**
   * Clear all corpses for a floor (floor reset).
   */
  function clearFloor(floorId) {
    var prefix = floorId + ':';
    for (var key in _corpses) {
      if (_corpses.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
        delete _corpses[key];
      }
    }
  }

  /**
   * Clear all corpses (full reset).
   */
  function clearAll() {
    _corpses = {};
  }

  // ── Sprite data helper (for game.js sprite building) ───────────────

  /**
   * Build sprite descriptors for all corpses on a floor.
   * Returns array ready to push into the _sprites list.
   *
   * @param {string} floorId
   * @returns {Array} Sprite objects with groundLevel, tilt flags
   */
  // Pile layout constants (match DeathAnim pile positions)
  var PILE_X = [-0.3, 0.1, 0.35];
  var PILE_Y = [0.15, 0.0, -0.1];
  var PILE_ROT = [0.17, 0.11, 0.05]; // resting rotation per slot

  function buildSprites(floorId) {
    var corpses = getAllCorpses(floorId);
    var sprites = [];

    for (var i = 0; i < corpses.length; i++) {
      var c = corpses[i];
      // Skip reanimated corpses — they become living NPCs handled elsewhere
      if (c.reanimated) continue;

      if (c.stackDef && c.lootState !== LOOT_STATE.DRY) {
        // Stack corpse: render as scattered pile of slot emojis
        var dir = (c.pileSeed % 2 === 0) ? 1 : -1;
        var slots = [c.stackDef.head, c.stackDef.torso, c.stackDef.legs];
        sprites.push({
          x: c.x,
          y: c.y,
          emoji: c.displayEmoji,       // Fallback
          corpseStack: {               // Pile layout for raycaster
            slots: slots,
            dir: dir,
            pileX: PILE_X,
            pileY: PILE_Y,
            pileRot: PILE_ROT,
            hat: c.stackDef.hat || null,
            hatScale: c.stackDef.hatScale || 0.5,
            frontWeapon: c.stackDef.frontWeapon || null,
            frontWeaponScale: c.stackDef.frontWeaponScale || 0.65
          },
          scale: 0.35,
          groundLevel: true,
          groundTilt: true,
          facing: null,
          awareness: undefined,
          isCorpse: true,
          lootState: c.lootState
        });
      } else {
        // Legacy single-emoji corpse or dry bone
        sprites.push({
          x: c.x,
          y: c.y,
          emoji: c.displayEmoji,
          scale: 0.35,
          groundLevel: true,
          groundTilt: true,
          facing: null,
          awareness: undefined,
          isCorpse: true,
          lootState: c.lootState
        });
      }
    }

    return sprites;
  }

  // ── Public API ──────────────────────────────────────────────────────
  return {
    LOOT_STATE:       LOOT_STATE,
    register:         register,
    getCorpseAt:      getCorpseAt,
    getAllCorpses:     getAllCorpses,
    hasCorpse:        hasCorpse,
    setLootState:     setLootState,
    getDisplayEmoji:  getDisplayEmoji,
    addHydration:     addHydration,
    isFullyHydrated:  isFullyHydrated,
    reanimate:        reanimate,
    remove:           remove,
    clearFloor:       clearFloor,
    clearAll:         clearAll,
    buildSprites:     buildSprites
  };
})();

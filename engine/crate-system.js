/**
 * CrateSystem — unified slot-based container logic for crates, corpse stocks, AND chests.
 *
 * All container types share identical slot anatomy:
 *   • 2–5 framed slots (crates avg 3, corpses avg 2, chests avg 3)
 *   • Each slot has a frame tag hinting the resource category
 *
 * Three resource flow directions:
 *   • CRATE:  Slots barely hydrated. Player DEPOSITS items to earn restock credit.
 *   • CORPSE: Same as crate but with SUIT_CARD slot for reanimation.
 *   • CHEST:  Slots pre-filled with loot. Player WITHDRAWS items into inventory.
 *
 * Chests yield something FOR the player. Crates expect something FROM the player.
 * Both use the same peek interaction pattern for consistent feel.
 *
 * Layer 1 — depends on: SeededRNG, TILES
 */
var CrateSystem = (function () {
  'use strict';

  // ── Frame tag definitions ──────────────────────────────────────────
  // Each tag maps to a resource color for the slot border and a matcher
  // function that tests whether an item "matches" the frame.

  var FRAME = {
    HP_FOOD:    'hp_food',
    ENERGY:     'energy_food',
    BATTERY:    'battery',
    SCROLL:     'scroll',
    GEM:        'gem',
    WILDCARD:   'wildcard',
    SUIT_CARD:  'suit_card'    // Corpse-only: requires matching suit combat card
  };

  // Frame → display color (RESOURCE_COLOR canonical palette)
  var FRAME_COLOR = {};
  FRAME_COLOR[FRAME.HP_FOOD]   = '#FF6B9D';   // ♥ Pink
  FRAME_COLOR[FRAME.ENERGY]    = '#00D4FF';   // ♣ Blue
  FRAME_COLOR[FRAME.BATTERY]   = '#00FFA6';   // ♦ Green
  FRAME_COLOR[FRAME.SCROLL]    = '#C080FF';   // Purple
  FRAME_COLOR[FRAME.GEM]       = '#FFD700';   // Gold
  FRAME_COLOR[FRAME.WILDCARD]  = '#BBBBBB';   // Grey/white
  FRAME_COLOR[FRAME.SUIT_CARD] = '#FF4466';   // Deep red (sacrifice)

  // Suit card frame colors (override SUIT_CARD when suit is known)
  var SUIT_FRAME_COLOR = {
    spade:   '#B4AA96',   // Grey
    club:    '#00D4FF',   // Electric blue
    diamond: '#00FFA6',   // Toxic green
    heart:   '#FF6B9D'    // Vibrant pink
  };

  // Suit emoji for display in suit card slot frames
  var SUIT_EMOJI = {
    spade:   '♠',
    club:    '♣',
    diamond: '♦',
    heart:   '♥'
  };

  // ── Frame weight tables (biome-specific crate frame distribution) ──

  var CRATE_FRAME_WEIGHTS = {
    cellar:  [FRAME.HP_FOOD, FRAME.HP_FOOD, FRAME.BATTERY, FRAME.SCROLL, FRAME.GEM, FRAME.WILDCARD],
    foundry: [FRAME.BATTERY, FRAME.BATTERY, FRAME.ENERGY, FRAME.SCROLL, FRAME.GEM, FRAME.WILDCARD],
    sealab:  [FRAME.ENERGY, FRAME.ENERGY, FRAME.BATTERY, FRAME.SCROLL, FRAME.GEM, FRAME.WILDCARD]
  };

  // Chest loot pools — what the player withdraws (richer than crate hydration)
  var CHEST_FRAME_WEIGHTS = {
    cellar:    [FRAME.HP_FOOD, FRAME.BATTERY, FRAME.SCROLL, FRAME.GEM, FRAME.WILDCARD],
    foundry:   [FRAME.BATTERY, FRAME.ENERGY, FRAME.GEM, FRAME.SCROLL, FRAME.WILDCARD],
    sealab:    [FRAME.ENERGY, FRAME.HP_FOOD, FRAME.GEM, FRAME.SCROLL, FRAME.WILDCARD],
    home:      [FRAME.HP_FOOD, FRAME.BATTERY, FRAME.WILDCARD],
    exterior:  [FRAME.HP_FOOD, FRAME.BATTERY, FRAME.GEM, FRAME.WILDCARD]
  };

  // Corpse stocks use a smaller frame pool + guaranteed suit card slot
  var CORPSE_FRAME_WEIGHTS = {
    cellar:  [FRAME.HP_FOOD, FRAME.BATTERY, FRAME.WILDCARD],
    foundry: [FRAME.BATTERY, FRAME.ENERGY, FRAME.WILDCARD],
    sealab:  [FRAME.ENERGY, FRAME.HP_FOOD, FRAME.WILDCARD]
  };

  // ── Container types ────────────────────────────────────────────────

  var TYPE = {
    CRATE:  'crate',
    CORPSE: 'corpse',
    CHEST:  'chest'
  };

  // ── Container registry ─────────────────────────────────────────────
  // Keyed by "floorId:x:y" → container object
  var _containers = {};

  function _key(x, y, floorId) {
    return floorId + ':' + x + ':' + y;
  }

  // ── ReadinessCalc event-bus bridge (DOC-109 Phase 1 wiring) ──────
  // Crate / corpse / chest mutations feed both getReadinessByType.crate
  // and .corpse — the primary core-score and extra-credit drivers for
  // most floors. Microtask coalesces (e.g. seal + coin award emits once).
  function _markDirty(floorId) {
    if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.markDirty) {
      ReadinessCalc.markDirty(floorId);
    }
  }

  // ── Container creation ─────────────────────────────────────────────

  /**
   * Create slot data for a crate container.
   *
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {string} floorId
   * @param {string} biome - 'cellar' | 'foundry' | 'sealab'
   * @returns {Object} Container entity
   */
  function createCrate(x, y, floorId, biome) {
    biome = biome || 'cellar';
    var slotCount = SeededRNG.randInt(2, 5);
    var frames = CRATE_FRAME_WEIGHTS[biome] || CRATE_FRAME_WEIGHTS.cellar;
    var slots = _generateSlots(slotCount, frames);

    // Hydrate 30–70% of slots with generic filler items
    var fillCount = Math.floor(slotCount * (0.3 + SeededRNG.random() * 0.4));
    for (var i = 0; i < fillCount && i < slots.length; i++) {
      slots[i].filled = true;
      slots[i].item = _hydrateItem(slots[i].frameTag, biome);
      slots[i].matched = true; // Pre-filled items always "match"
    }

    var container = {
      type: TYPE.CRATE,
      x: x,
      y: y,
      floorId: floorId,
      biome: biome,
      slots: slots,
      sealed: false,
      sealReward: null,
      coinTotal: 0
    };

    _containers[_key(x, y, floorId)] = container;
    return container;
  }

  /**
   * Create slot data for a corpse stock container.
   * Always includes one SUIT_CARD slot requiring a matching suit combat card.
   *
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {string} floorId
   * @param {string} biome - 'cellar' | 'foundry' | 'sealab'
   * @param {string} suit  - 'spade' | 'club' | 'diamond' | 'heart'
   * @returns {Object} Container entity
   */
  function createCorpse(x, y, floorId, biome, suit) {
    biome = biome || 'cellar';
    suit  = suit  || 'spade';

    // Corpse stocks are smaller: 2–3 resource slots + 1 suit card slot
    var resourceCount = SeededRNG.randInt(1, 2);
    var frames = CORPSE_FRAME_WEIGHTS[biome] || CORPSE_FRAME_WEIGHTS.cellar;
    var slots = _generateSlots(resourceCount, frames);

    // Add the mandatory suit card slot (always last, always empty)
    slots.push({
      frameTag: FRAME.SUIT_CARD,
      suit: suit,
      filled: false,
      item: null,
      matched: false
    });

    // Corpse stocks spawn with 0–1 pre-filled resource slots (less hydration)
    var fillCount = Math.floor(resourceCount * SeededRNG.random() * 0.5);
    for (var i = 0; i < fillCount && i < resourceCount; i++) {
      slots[i].filled = true;
      slots[i].item = _hydrateItem(slots[i].frameTag, biome);
      slots[i].matched = true;
    }

    var container = {
      type: TYPE.CORPSE,
      x: x,
      y: y,
      floorId: floorId,
      biome: biome,
      suit: suit,
      slots: slots,
      sealed: false,
      sealReward: null,
      coinTotal: 0
    };

    _containers[_key(x, y, floorId)] = container;
    return container;
  }

  /**
   * Create slot data for a treasure chest (player WITHDRAWS loot).
   * All slots start filled with good loot — the opposite of crate hydration.
   *
   * @param {number} x - Grid X
   * @param {number} y - Grid Y
   * @param {string} floorId
   * @param {string} biome
   * @param {Object} [opts] - Optional overrides
   * @param {Array}  [opts.fixedSlots] - Exact slot contents (for work-keys chest etc.)
   * @returns {Object} Container entity
   */
  /**
   * Create a CHEST container.
   *
   * Depth-based behaviour contract:
   *   floorN / floorN.N (depth 1-2): Passive storage. Lightly hydrated
   *     with 1-5 slots. No demand to refill empty slots. Player withdraws
   *     loot and walks away.
   *   floorN.N.N (depth 3+): Dungeon restocking. Slots must be filled as
   *     part of the cleaning circuit. demandRefill = true.
   *
   * opts.stash = true creates a large-capacity stash chest (home storage).
   * opts.fixedSlots overrides automatic slot generation.
   * opts.slotCount overrides the default random 1-5 range.
   */
  function createChest(x, y, floorId, biome, opts) {
    biome = biome || 'cellar';
    opts = opts || {};

    var depth = floorId ? floorId.split('.').length : 1;

    var slots;
    if (opts.fixedSlots) {
      // Special chests (work-keys, quest items) specify exact contents.
      // Each slot can carry fixed: true (never rehydrates) or default false.
      slots = opts.fixedSlots;
      for (var fi = 0; fi < slots.length; fi++) {
        if (typeof slots[fi].fixed === 'undefined') slots[fi].fixed = false;
      }
    } else if (opts.stash) {
      // Large stash chest — many empty slots for player storage
      var stashCount = opts.slotCount || 256;
      slots = [];
      for (var si = 0; si < stashCount; si++) {
        slots.push({
          frameTag: 'stash',
          suit: null,
          filled: false,
          item: null,
          matched: false
        });
      }
    } else {
      // Depth-based default slot count:
      //   depth 1 (floorN surface): 1-5 slots
      //   depth 2 (floorN.N interior): 8-12 slots (bigger persistent chests)
      //   depth 3+ (floorN.N.N dungeon): 1-5 slots (restocking targets)
      var defaultCount;
      if (depth === 2) {
        defaultCount = SeededRNG.randInt(8, 12);
      } else {
        defaultCount = SeededRNG.randInt(1, 5);
      }
      var slotCount = opts.slotCount || defaultCount;
      var frames = CHEST_FRAME_WEIGHTS[biome] || CHEST_FRAME_WEIGHTS.cellar;
      slots = _generateSlots(slotCount, frames);

      // All slots start filled with loot (player withdraws)
      for (var i = 0; i < slots.length; i++) {
        slots[i].filled = true;
        slots[i].item = _hydrateChestLoot(slots[i].frameTag, biome, floorId);
        slots[i].matched = true;
      }
    }

    // SC-B: Two-phase chest lifecycle.
    //   'loot'      — freshly spawned, slots filled, player withdraws.
    //   'empty'     — all loot taken; D3+ chests become restockable.
    //   'restocked' — D3+ only: refilled via RestockSurface, sealed.
    //   'stash'     — permanent home storage, never transitions.
    var phase = opts.stash ? 'stash' : 'loot';

    var container = {
      type: TYPE.CHEST,
      x: x,
      y: y,
      floorId: floorId,
      biome: biome,
      slots: slots,
      sealed: false,          // Not used for chests (depleted instead)
      depleted: false,        // True when all slots emptied
      phase: phase,           // SC-B lifecycle phase
      lootedDay: null,        // SC-B+: day chest was fully looted (for rehydration)
      sealReward: null,
      coinTotal: 0,
      stash: !!opts.stash,    // True for home stash chests
      demandRefill: depth >= 3  // Dungeon chests demand slot refilling
    };

    _containers[_key(x, y, floorId)] = container;
    return container;
  }

  // ── SC-D: D2 Storage Crate (chest-like withdraw container) ─────────

  var STORAGE_REFILL_COOLDOWN = 1;  // days — refill each morning

  /**
   * Create a D2 storage crate — biome-specific, withdraw-only, daily refill.
   * Internally a TYPE.CHEST so all existing withdraw / phase / rehydration
   * logic applies. The `storage` flag distinguishes it from real chests.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @param {string} biome
   * @returns {Object} Container entity
   */
  function createStorageCrate(x, y, floorId, biome) {
    biome = biome || 'cellar';

    var slotCount = SeededRNG.randInt(4, 8);
    var frames = CRATE_FRAME_WEIGHTS[biome] || CRATE_FRAME_WEIGHTS.cellar;
    var slots = _generateSlots(slotCount, frames);

    // All slots start filled — player withdraws
    for (var i = 0; i < slots.length; i++) {
      slots[i].filled = true;
      slots[i].item = _hydrateChestLoot(slots[i].frameTag, biome, floorId);
      slots[i].matched = true;
    }

    var container = {
      type: TYPE.CHEST,         // Reuse CHEST type for withdraw routing
      x: x,
      y: y,
      floorId: floorId,
      biome: biome,
      slots: slots,
      sealed: false,
      depleted: false,
      phase: 'loot',
      lootedDay: null,
      sealReward: null,
      coinTotal: 0,
      stash: false,
      storage: true,            // SC-D marker: breakable-tile storage, daily refill
      demandRefill: false       // No deposit mode — withdraw-only
    };

    _containers[_key(x, y, floorId)] = container;
    return container;
  }

  // ── Slot generation ────────────────────────────────────────────────

  function _generateSlots(count, framePalette) {
    var slots = [];
    for (var i = 0; i < count; i++) {
      var tag = framePalette[Math.floor(SeededRNG.random() * framePalette.length)];
      slots.push({
        frameTag: tag,
        suit: null,           // Only set for SUIT_CARD slots
        filled: false,
        item: null,
        matched: false,
        fixed: false          // SC-B+: non-fixed slots rehydrate after cooldown
      });
    }
    return slots;
  }

  // ── Hydration (pre-fill) ───────────────────────────────────────────

  function _hydrateItem(frameTag, biome) {
    // Generate a generic filler item appropriate to the frame tag.
    // These are simple item stubs — the full item system resolves them later.
    var item = { id: 'hydrated_' + frameTag, name: '', emoji: '', category: frameTag };

    switch (frameTag) {
      case FRAME.HP_FOOD:
        item.name = 'Stale Bread';
        item.emoji = '🍞';
        break;
      case FRAME.ENERGY:
        item.name = 'Weak Tonic';
        item.emoji = '🧪';
        break;
      case FRAME.BATTERY:
        item.name = 'Dead Cell';
        item.emoji = '🔋';
        break;
      case FRAME.SCROLL:
        item.name = 'Torn Scroll';
        item.emoji = '📜';
        break;
      case FRAME.GEM:
        item.name = 'Chipped Gem';
        item.emoji = '💎';
        break;
      default:
        item.name = 'Bone Fragment';
        item.emoji = '🦴';
        break;
    }

    return item;
  }

  // ── Chest loot hydration (richer than crate filler) ────────────────

  function _hydrateChestLoot(frameTag, biome, floorId) {
    var item = { id: 'chest_' + frameTag, name: '', emoji: '', category: frameTag };

    switch (frameTag) {
      case FRAME.HP_FOOD:
        item.name = 'Hearty Ration';
        item.emoji = '🥩';
        item.value = 3;
        break;
      case FRAME.ENERGY:
        item.name = 'Strong Tonic';
        item.emoji = '⚗️';
        item.value = 3;
        break;
      case FRAME.BATTERY:
        item.name = 'Charged Cell';
        item.emoji = '🔋';
        item.value = 2;
        break;
      case FRAME.SCROLL:
        item.name = 'Sealed Letter';
        item.emoji = '📜';
        item.value = 4;
        break;
      case FRAME.GEM:
        item.name = 'Rough Gem';
        item.emoji = '💎';
        item.value = 5;
        break;
      default:
        item.name = 'Trinket';
        item.emoji = '🪙';
        item.value = 2;
        break;
    }

    return item;
  }

  // ── Withdraw slot (CHEST only) ─────────────────────────────────────

  /**
   * Withdraw a filled slot's item into the player's inventory.
   * Opposite of fillSlot — removes item from container slot.
   *
   * @param {number} x - Container grid X
   * @param {number} y - Container grid Y
   * @param {string} floorId
   * @param {number} slotIndex - Which slot to withdraw from
   * @returns {Object|null} The withdrawn item, or null if unavailable
   */
  function withdrawSlot(x, y, floorId, slotIndex) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.type !== TYPE.CHEST) return null;
    if (c.depleted) return null;

    var slot = c.slots[slotIndex];
    if (!slot || !slot.filled) return null;

    var item = slot.item;
    slot.filled = false;
    slot.item = null;
    slot.matched = false;

    // Check if chest is now depleted (all slots empty).
    // Stash chests are permanent furniture — never mark depleted.
    if (!c.stash) {
      var allEmpty = true;
      for (var i = 0; i < c.slots.length; i++) {
        if (c.slots[i].filled) { allEmpty = false; break; }
      }
      if (allEmpty) {
        c.depleted = true;
        // SC-B: transition loot → empty when last item withdrawn.
        if (c.phase === 'loot') c.phase = 'empty';
        // SC-B+: stamp the day for rehydration cooldown.
        var _curDay = (typeof DayCycle !== 'undefined') ? DayCycle.getDay() : 0;
        c.lootedDay = _curDay;
      }
    }

    _markDirty(floorId);
    return item;
  }

  /**
   * Check if a chest container is fully depleted.
   */
  function isDepleted(x, y, floorId) {
    var c = _containers[_key(x, y, floorId)];
    return c && c.type === TYPE.CHEST && c.depleted;
  }

  // ── Fill slot ──────────────────────────────────────────────────────

  /**
   * Fill an empty slot with an item from the player's bag.
   *
   * @param {number} x - Container grid X
   * @param {number} y - Container grid Y
   * @param {string} floorId
   * @param {number} slotIndex - Which slot to fill
   * @param {Object} item - Item from Player.bag or card from Player.hand
   * @returns {Object|null} { coins, matched, suitMatch } or null if slot unavailable
   */
  function fillSlot(x, y, floorId, slotIndex, item) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.sealed) return null;

    var slot = c.slots[slotIndex];
    if (!slot || slot.filled) return null;

    // Suit card slot: validate suit match
    if (slot.frameTag === FRAME.SUIT_CARD) {
      if (!item || !item.suit) return null; // Must be a combat card with suit
      var suitMatch = (item.suit === slot.suit);
      slot.filled = true;
      slot.item = item;
      slot.matched = suitMatch;

      // Suit card slots yield 0 coins (the reward is reanimation)
      _markDirty(floorId);
      return { coins: 0, matched: suitMatch, suitMatch: suitMatch };
    }

    // Resource slot: any item fills, frame match gives bonus
    slot.filled = true;
    slot.item = item;

    var matched = _doesItemMatch(item, slot.frameTag);
    slot.matched = matched;

    // Coin yield
    var coins = 1; // Base: mismatched
    if (matched) {
      coins = c.type === TYPE.CRATE ? SeededRNG.randInt(2, 3) : SeededRNG.randInt(1, 2);
      // Rare+ items in matched frame: bonus
      if (item.rarity && (item.rarity === 'uncommon' || item.rarity === 'rare' || item.rarity === 'legendary')) {
        coins = c.type === TYPE.CRATE ? SeededRNG.randInt(3, 5) : SeededRNG.randInt(2, 3);
      }
    }

    c.coinTotal += coins;
    _markDirty(floorId);
    return { coins: coins, matched: matched, suitMatch: false };
  }

  // ── Frame matching ─────────────────────────────────────────────────

  function _doesItemMatch(item, frameTag) {
    if (frameTag === FRAME.WILDCARD) return true;
    if (!item) return false;

    // crateFillTag match (supply consumables + detritus drops from items.json)
    if (item.crateFillTag && item.crateFillTag === frameTag) return true;
    // WILDCARD crateFillTag fills any slot
    if (item.crateFillTag === 'WILDCARD') return true;

    if (!item.category) return false;

    // Direct category match
    if (item.category === frameTag) return true;

    // Alias matching (e.g. 'food' matches hp_food or energy_food)
    if (frameTag === FRAME.HP_FOOD && (item.category === 'food' || item.subtype === 'food')) return true;
    if (frameTag === FRAME.ENERGY && (item.category === 'energy' || item.subtype === 'tonic')) return true;
    if (frameTag === FRAME.BATTERY && item.category === 'battery') return true;
    if (frameTag === FRAME.SCROLL && item.category === 'scroll') return true;
    if (frameTag === FRAME.GEM && (item.category === 'gem' || item.category === 'currency')) return true;

    // Salvage parts match wildcard-ish (bones go anywhere)
    if (item.category === 'salvage') return frameTag === FRAME.WILDCARD;

    return false;
  }

  // ── Seal container ─────────────────────────────────────────────────

  /**
   * Check if all slots are filled (ready to seal).
   */
  function canSeal(x, y, floorId) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.sealed) return false;
    for (var i = 0; i < c.slots.length; i++) {
      if (!c.slots[i].filled) return false;
    }
    return true;
  }

  /**
   * Seal the container. Awards flat bonus + d100 reward roll.
   *
   * @returns {Object|null} { bonusCoins, totalCoins, reward, canReanimate }
   */
  function seal(x, y, floorId) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.sealed) return null;
    if (!canSeal(x, y, floorId)) return null;

    c.sealed = true;

    // Flat seal bonus
    var bonus = (c.type === TYPE.CRATE) ? 5 : 3;
    c.coinTotal += bonus;

    // d100 reward roll
    var roll = SeededRNG.randInt(1, 100);
    var reward = _resolveSealReward(roll, c.type);
    c.sealReward = reward;

    // Check reanimation eligibility (corpse stocks only)
    var canReanimate = false;
    if (c.type === TYPE.CORPSE) {
      // Must have a matched suit card in the suit slot
      for (var i = 0; i < c.slots.length; i++) {
        if (c.slots[i].frameTag === FRAME.SUIT_CARD && c.slots[i].matched) {
          canReanimate = true;
          break;
        }
      }
    }

    _markDirty(floorId);
    return {
      bonusCoins: bonus,
      totalCoins: c.coinTotal,
      reward: reward,
      canReanimate: canReanimate,
      containerType: c.type
    };
  }

  /**
   * Force-seal a partially filled container. Awards reduced coins
   * proportional to filled slots. Unfilled slots are left empty.
   *
   * @returns {Object|null} { bonusCoins, totalCoins, reward, canReanimate }
   */
  function forceSeal(x, y, floorId) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.sealed) return null;

    // Count filled vs total
    var filled = 0;
    for (var i = 0; i < c.slots.length; i++) {
      if (c.slots[i].filled) filled++;
    }
    if (filled === 0) return null; // Can't seal with nothing

    c.sealed = true;

    // Reduced flat seal bonus proportional to fill ratio
    var fullBonus = (c.type === TYPE.CRATE) ? 5 : 3;
    var ratio = filled / c.slots.length;
    var bonus = Math.max(1, Math.round(fullBonus * ratio));
    c.coinTotal += bonus;

    // No d100 reward roll for partial seals — just the coins
    c.sealReward = { type: 'nothing' };

    // Check reanimation eligibility (corpse stocks only, still requires suit card)
    var canReanimate = false;
    if (c.type === TYPE.CORPSE) {
      for (var j = 0; j < c.slots.length; j++) {
        if (c.slots[j].frameTag === FRAME.SUIT_CARD && c.slots[j].matched) {
          canReanimate = true;
          break;
        }
      }
    }

    _markDirty(floorId);
    return {
      bonusCoins: bonus,
      totalCoins: c.coinTotal,
      reward: c.sealReward,
      canReanimate: canReanimate,
      containerType: c.type
    };
  }

  // ── Seal reward table (d100) ───────────────────────────────────────

  function _resolveSealReward(roll, containerType) {
    // Crate rewards are richer; corpse rewards are humbler
    if (containerType === TYPE.CRATE) {
      if (roll <= 50) return { type: 'nothing' };
      if (roll <= 75) return { type: 'bonus_coins', amount: 5 };
      if (roll <= 88) return { type: 'card', rarity: 'common' };
      if (roll <= 95) return { type: 'card', rarity: 'uncommon' };
      if (roll <= 99) return { type: 'card', rarity: 'rare' };
      return { type: 'card', rarity: 'legendary' };
    }
    // Corpse stock: no card rewards (the reward IS reanimation)
    if (roll <= 60) return { type: 'nothing' };
    if (roll <= 85) return { type: 'bonus_coins', amount: 3 };
    if (roll <= 95) return { type: 'salvage', part: 'bone' };
    return { type: 'bonus_coins', amount: 8 };
  }

  // ── Accessors ──────────────────────────────────────────────────────

  function getContainer(x, y, floorId) {
    return _containers[_key(x, y, floorId)] || null;
  }

  function hasContainer(x, y, floorId) {
    return !!_containers[_key(x, y, floorId)];
  }

  /**
   * Get all containers on a floor (for readiness calculation).
   */
  function getAllOnFloor(floorId) {
    var result = [];
    var prefix = floorId + ':';
    for (var key in _containers) {
      if (_containers.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
        result.push(_containers[key]);
      }
    }
    return result;
  }

  /**
   * Calculate floor readiness contribution from containers.
   * Returns 0.0–1.0 (percentage of sealed containers).
   */
  function getReadiness(floorId) {
    var all = getAllOnFloor(floorId);
    if (all.length === 0) return 1.0; // No containers = fully ready
    var sealed = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].sealed) sealed++;
    }
    return sealed / all.length;
  }

  /**
   * Get crate readiness (crates only) and corpse readiness (corpses only)
   * as separate scores for weighted readiness calculation.
   */
  function getReadinessByType(floorId) {
    var all = getAllOnFloor(floorId);
    var crateTotal = 0, crateSealed = 0;
    var corpseTotal = 0, corpseSealed = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].type === TYPE.CRATE) {
        crateTotal++;
        if (all[i].sealed) crateSealed++;
      } else if (all[i].type === TYPE.CORPSE) {
        corpseTotal++;
        if (all[i].sealed) corpseSealed++;
      }
      // TYPE.CHEST excluded — chests don't seal and shouldn't
      // dilute crate or corpse readiness scores.
    }
    return {
      crate:  crateTotal  > 0 ? crateSealed  / crateTotal  : 1.0,
      corpse: corpseTotal > 0 ? corpseSealed / corpseTotal : 1.0
    };
  }

  // ── Floor lifecycle ────────────────────────────────────────────────

  function clearFloor(floorId) {
    var prefix = floorId + ':';
    for (var key in _containers) {
      if (_containers.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
        delete _containers[key];
      }
    }
    _markDirty(floorId);
  }

  function clearAll() {
    _containers = {};
    if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.invalidate) {
      ReadinessCalc.invalidate();
    }
  }

  // ── Slot info helpers (for UI) ─────────────────────────────────────

  /**
   * Get display info for a slot (frame color, label, filled state).
   */
  function getSlotDisplay(slot) {
    var color = FRAME_COLOR[slot.frameTag] || FRAME_COLOR[FRAME.WILDCARD];

    // Suit card slots use the suit-specific color
    if (slot.frameTag === FRAME.SUIT_CARD && slot.suit && SUIT_FRAME_COLOR[slot.suit]) {
      color = SUIT_FRAME_COLOR[slot.suit];
    }

    var label = slot.frameTag;
    if (slot.frameTag === FRAME.SUIT_CARD && slot.suit) {
      label = (SUIT_EMOJI[slot.suit] || '?') + ' card';
    }

    return {
      color: color,
      label: label,
      filled: slot.filled,
      matched: slot.matched,
      emoji: slot.item ? (slot.item.emoji || '?') : '',
      suitEmoji: (slot.frameTag === FRAME.SUIT_CARD && slot.suit) ? SUIT_EMOJI[slot.suit] : null
    };
  }

  // ── SC-B+: Chest rehydration ────────────────────────────────────────

  var REHYDRATE_COOLDOWN = 7;  // days until a looted chest refills

  /**
   * True if floorId belongs to the player's home building (floor 1 tree).
   * Home chests are permanent storage — they never rehydrate.
   */
  function _isHomeFloor(floorId) {
    if (!floorId) return false;
    return String(floorId).split('.')[0] === '1';
  }

  /**
   * Attempt to rehydrate a single chest or storage crate.
   * Eligible: depleted, non-stash, non-home, depth 1-2, past cooldown.
   *   Chests: 7-day cooldown (REHYDRATE_COOLDOWN).
   *   Storage crates: 1-day cooldown (STORAGE_REFILL_COOLDOWN).
   * Non-fixed slots get fresh random loot. Fixed slots stay empty forever.
   * Returns true if the container was rehydrated.
   */
  function tryRehydrate(x, y, floorId) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.type !== TYPE.CHEST) return false;
    if (!c.depleted || c.stash) return false;

    var depth = floorId ? String(floorId).split('.').length : 1;
    if (depth >= 3) return false;           // D3+ uses restock, not rehydration
    if (_isHomeFloor(floorId)) return false; // Home chests are permanent

    if (c.lootedDay === null || c.lootedDay === undefined) return false;
    var currentDay = (typeof DayCycle !== 'undefined') ? DayCycle.getDay() : 0;
    // SC-D: Storage crates refill daily, regular chests refill weekly
    var cooldown = c.storage ? STORAGE_REFILL_COOLDOWN : REHYDRATE_COOLDOWN;
    if (currentDay < c.lootedDay + cooldown) return false;

    // Storage crates use crate frame weights; chests use chest frame weights
    var frames = c.storage
      ? (CRATE_FRAME_WEIGHTS[c.biome] || CRATE_FRAME_WEIGHTS.cellar)
      : (CHEST_FRAME_WEIGHTS[c.biome] || CHEST_FRAME_WEIGHTS.cellar);
    var rehydrated = 0;
    for (var i = 0; i < c.slots.length; i++) {
      var slot = c.slots[i];
      if (slot.fixed) continue;  // Quest items / hand-authored — never come back

      // Re-roll frame tag so loot variety changes each cycle
      var newTag = frames[Math.floor(SeededRNG.random() * frames.length)];
      slot.frameTag = newTag;
      slot.filled = true;
      slot.item = _hydrateChestLoot(newTag, c.biome, floorId);
      slot.matched = true;
      rehydrated++;
    }

    if (rehydrated > 0) {
      c.depleted = false;
      c.phase = 'loot';
      c.lootedDay = null;  // Reset stamp for next cycle
      _markDirty(floorId);
    }

    return rehydrated > 0;
  }

  /**
   * Scan all containers on a floor and rehydrate any eligible chests.
   * Called on floor load (game.js IO-8 path) so the player sees fresh
   * loot when returning to a previously-looted surface/interior floor.
   */
  function rehydrateFloor(floorId) {
    var count = 0;
    for (var key in _containers) {
      if (!_containers.hasOwnProperty(key)) continue;
      var c = _containers[key];
      if (c.floorId !== floorId) continue;
      if (c.type !== TYPE.CHEST) continue;
      if (tryRehydrate(c.x, c.y, floorId)) count++;
    }
    return count;
  }

  // ── SC-B: Phase accessors ───────────────────────────────────────────

  /**
   * Get the lifecycle phase of a chest container.
   * Returns 'loot', 'empty', 'restocked', 'stash', or null (non-chest / missing).
   */
  function getPhase(x, y, floorId) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.type !== TYPE.CHEST) return null;
    return c.phase || 'loot';   // Backwards compat: old containers lack .phase
  }

  /**
   * Advance a chest's lifecycle phase. Only valid transitions are enforced:
   *   loot → empty  (automatic via withdrawSlot)
   *   empty → restocked  (when RestockSurface completes)
   * Stash chests never transition.
   */
  function setPhase(x, y, floorId, newPhase) {
    var c = _containers[_key(x, y, floorId)];
    if (!c || c.type !== TYPE.CHEST || c.stash) return false;
    var valid = (c.phase === 'loot' && newPhase === 'empty') ||
                (c.phase === 'empty' && newPhase === 'restocked');
    if (!valid) return false;
    c.phase = newPhase;
    return true;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    FRAME:          FRAME,
    FRAME_COLOR:    FRAME_COLOR,
    SUIT_FRAME_COLOR: SUIT_FRAME_COLOR,
    SUIT_EMOJI:     SUIT_EMOJI,
    TYPE:           TYPE,
    createCrate:    createCrate,
    createCorpse:   createCorpse,
    createChest:        createChest,
    createStorageCrate: createStorageCrate,
    STORAGE_REFILL_COOLDOWN: STORAGE_REFILL_COOLDOWN,
    fillSlot:       fillSlot,
    withdrawSlot:   withdrawSlot,
    isDepleted:     isDepleted,
    canSeal:        canSeal,
    seal:           seal,
    forceSeal:      forceSeal,
    getContainer:   getContainer,
    hasContainer:   hasContainer,
    getAllOnFloor:   getAllOnFloor,
    getReadiness:   getReadiness,
    getReadinessByType: getReadinessByType,
    getSlotDisplay: getSlotDisplay,
    doesItemMatch:  _doesItemMatch,
    getPhase:       getPhase,
    setPhase:       setPhase,
    tryRehydrate:   tryRehydrate,
    rehydrateFloor: rehydrateFloor,
    REHYDRATE_COOLDOWN: REHYDRATE_COOLDOWN,
    clearFloor:     clearFloor,
    clearAll:       clearAll,

    // ── M2.3 save/load hooks ────────────────────────────────────────
    // Return a deep-cloned array of all containers on `floorId`. Fields
    // are already JSON-safe (type/x/y/floorId/biome/slots/sealed/…), so
    // a structured clone is sufficient. SaveState folds this into
    // floors[floorId].containers.
    serializeFloor: function (floorId) {
      var list = [];
      var prefix = floorId + ':';
      for (var key in _containers) {
        if (_containers.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
          list.push(JSON.parse(JSON.stringify(_containers[key])));
        }
      }
      return list;
    },

    // Wipe the current floor's containers and re-install the saved ones
    // verbatim. Called by SaveState as each floor is regenerated during
    // load (authored grid + restored containers = full state).
    deserializeFloor: function (floorId, list) {
      clearFloor(floorId);
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c || typeof c.x !== 'number') continue;
        // Force floorId to match the key we're inserting under, in case
        // a save was moved between slots or the id differs.
        c.floorId = floorId;
        _containers[floorId + ':' + c.x + ':' + c.y] = c;
      }
    }
  };
})();

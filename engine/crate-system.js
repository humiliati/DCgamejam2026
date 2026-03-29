/**
 * CrateSystem — unified slot-based container logic for crates AND corpse stocks.
 *
 * Both container types share identical slot anatomy:
 *   • 2–5 framed slots (crates avg 3, corpses avg 2)
 *   • Each slot has a frame tag hinting the ideal item category
 *   • ANY item fills ANY slot; frame-match gives bonus coins
 *   • Sealing all slots awards flat bonus + d100 reward roll
 *
 * Differences:
 *   • Crates yield more loot (higher coin/slot, bigger seal bonus)
 *   • Corpse stocks yield less loot but include a SUIT CARD slot
 *   • Filling the suit card slot with a matching suit card enables
 *     reanimation → friendly NPC + readiness contribution
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

  // Corpse stocks use a smaller frame pool + guaranteed suit card slot
  var CORPSE_FRAME_WEIGHTS = {
    cellar:  [FRAME.HP_FOOD, FRAME.BATTERY, FRAME.WILDCARD],
    foundry: [FRAME.BATTERY, FRAME.ENERGY, FRAME.WILDCARD],
    sealab:  [FRAME.ENERGY, FRAME.HP_FOOD, FRAME.WILDCARD]
  };

  // ── Container types ────────────────────────────────────────────────

  var TYPE = {
    CRATE:  'crate',
    CORPSE: 'corpse'
  };

  // ── Container registry ─────────────────────────────────────────────
  // Keyed by "floorId:x:y" → container object
  var _containers = {};

  function _key(x, y, floorId) {
    return floorId + ':' + x + ':' + y;
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
        matched: false
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
    return { coins: coins, matched: matched, suitMatch: false };
  }

  // ── Frame matching ─────────────────────────────────────────────────

  function _doesItemMatch(item, frameTag) {
    if (frameTag === FRAME.WILDCARD) return true;
    if (!item || !item.category) return false;

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

    return {
      bonusCoins: bonus,
      totalCoins: c.coinTotal,
      reward: reward,
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
      } else {
        corpseTotal++;
        if (all[i].sealed) corpseSealed++;
      }
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
  }

  function clearAll() {
    _containers = {};
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

  // ── Public API ─────────────────────────────────────────────────────

  return {
    FRAME:          FRAME,
    FRAME_COLOR:    FRAME_COLOR,
    SUIT_FRAME_COLOR: SUIT_FRAME_COLOR,
    SUIT_EMOJI:     SUIT_EMOJI,
    TYPE:           TYPE,
    createCrate:    createCrate,
    createCorpse:   createCorpse,
    fillSlot:       fillSlot,
    canSeal:        canSeal,
    seal:           seal,
    getContainer:   getContainer,
    hasContainer:   hasContainer,
    getAllOnFloor:   getAllOnFloor,
    getReadiness:   getReadiness,
    getReadinessByType: getReadinessByType,
    getSlotDisplay: getSlotDisplay,
    clearFloor:     clearFloor,
    clearAll:       clearAll
  };
})();

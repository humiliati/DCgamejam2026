/**
 * CardAuthority — Single source of truth for all card and item state.
 *
 * Ported from EyesOnly's CardStateAuthority + GAMESTATE pattern.
 * NO other module should hold mutable card/item state.
 * All reads go through accessors (return shallow copies).
 * All mutations go through methods here → emit events → UI re-renders.
 *
 * Containers:
 *   hand     — max 5, cards playable in combat
 *   backup   — max 30, player's owned card pool (draw pile source)
 *   bag      — max 12, items + salvage parts + Joker Vault cards
 *   stash    — max 20, persistent storage (survives death)
 *   equipped — 3 slots: [weapon, consumable, key]
 *   gold     — currency (integer)
 *
 * Death tiers (from DOC-45 §14):
 *   VULNERABLE — hand, backup, equipped, bag items (NOT bag cards)
 *   SAFE       — stash, bag cards (Joker Vault, purple glow)
 *   Gold       — 50% penalty
 *
 * Events emitted:
 *   hand:changed, backup:changed, bag:changed, stash:changed,
 *   equipped:changed, gold:changed, collection:full, death:reset,
 *   draw:executed
 *
 * Layer 1 — depends on: SeededRNG (rng.js) for deck shuffle only
 *
 * @see EyesOnly/public/js/card-state-authority.js
 * @see EyesOnly/public/js/gamestate.js
 * @see docs/INVENTORY_CARD_MENU_REWORK.md (DOC-46)
 * @see docs/INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md (DOC-45) §14
 */
var CardAuthority = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  CONSTANTS
  // ═══════════════════════════════════════════════════════════════════

  var MAX_HAND    = 5;
  var MAX_BACKUP  = 30;   // D1: expandable via equip items post-jam
  var BASE_BAG    = 21;   // DEPTH3 §4: was 12, now 21+N (N from equipped bag_slots)
  var MAX_BAG     = BASE_BAG;  // Legacy compat — use getMaxBag() for live value
  var MAX_STASH   = 20;
  var EQUIP_SLOTS = 3;    // 0=weapon, 1=consumable, 2=key

  // ── Suit / Resource color constants ────────────────────────────────
  // Canonical source — replaces duplicates in CardRenderer, CardDraw,
  // MenuFaces, CardFan. From EyesOnly RESOURCE_COLOR_SYSTEM.
  var SUIT_DATA = {
    spade:   { sym: '\u2660', color: 'rgba(180,170,150,0.85)', res: 'free'    },
    club:    { sym: '\u2663', color: '#00D4FF',                 res: 'energy'  },
    diamond: { sym: '\u2666', color: '#00FFA6',                 res: 'battery' },
    heart:   { sym: '\u2665', color: '#FF6B9D',                 res: 'hp'      }
  };

  var RES_COLORS = {
    energy:   { r: 0,   g: 212, b: 255 },
    battery:  { r: 0,   g: 255, b: 166 },
    hp:       { r: 255, g: 107, b: 157 },
    currency: { r: 255, g: 255, b: 0   },
    xp:       { r: 200, g: 143, b: 255 },
    fatigue:  { r: 160, g: 82,  b: 45  },
    focus:    { r: 255, g: 249, b: 176 },
    ammo:     { r: 218, g: 112, b: 214 },
    key_ammo: { r: 255, g: 138, b: 61  },
    cards:    { r: 128, g: 0,   b: 128 },
    free:     { r: 180, g: 170, b: 150 }
  };

  var QUALITY_COLORS = {
    cracked:      '#666',
    worn:         '#999',
    standard:     '#fff',
    fine:         '#4fc3f7',
    superior:     '#ffeb3b',
    elite:        '#ff9800',
    masterwork:   '#ffd700',
    near_perfect: '#8bc34a',
    perfect:      '#9c27b0'
  };

  // ═══════════════════════════════════════════════════════════════════
  //  THE ONLY MUTABLE CARD/ITEM STATE IN THE GAME
  // ═══════════════════════════════════════════════════════════════════

  var _state = {
    hand:     [],                       // CardObj[] — max MAX_HAND
    backup:   [],                       // CardObj[] — player's owned card pool
    deck:     [],                       // CardObj[] — shuffled draw pile (subset of backup)
    bag:      [],                       // ItemOrCardObj[] — max MAX_BAG
    stash:    [],                       // ItemOrCardObj[] — max MAX_STASH
    equipped: [null, null, null],       // [weapon, consumable, key]
    gold:     0
  };

  // ═══════════════════════════════════════════════════════════════════
  //  EVENT SYSTEM (EyesOnly CSA pattern: on/off/_emit + wildcard)
  // ═══════════════════════════════════════════════════════════════════

  var _listeners = {};

  function on(type, fn) {
    if (!type || typeof fn !== 'function') return;
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(fn);
  }

  function off(type, fn) {
    var arr = _listeners[type];
    if (!arr) return;
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i] === fn) arr.splice(i, 1);
    }
  }

  function _emit(type, payload) {
    var fns = _listeners[type];
    if (fns) {
      for (var i = 0; i < fns.length; i++) {
        try { fns[i](payload); } catch (e) {
          console.warn('[CardAuthority] listener error on "' + type + '":', e);
        }
      }
    }
    // Wildcard listeners (for debug / logging)
    var wild = _listeners['*'];
    if (wild) {
      for (var j = 0; j < wild.length; j++) {
        try { wild[j]({ type: type, payload: payload }); } catch (e2) { /* suppress */ }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CARD HYDRATION
  // ═══════════════════════════════════════════════════════════════════
  //
  // DG stores full card objects in containers (not CardRefs like EyesOnly).
  // This is intentional — DG has no CI-* dynamic instance system yet.
  // hydrateCard() resolves an id string to a full card definition from
  // CardSystem's registry. Used for loot pickup, shop buy, etc.

  function hydrateCard(idOrRef) {
    if (!idOrRef) return null;
    var id = (typeof idOrRef === 'string') ? idOrRef : idOrRef.id;
    if (!id) return null;
    if (typeof CardSystem !== 'undefined' && CardSystem.getById) {
      return CardSystem.getById(id);
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RESOURCE COLOR HELPERS
  // ═══════════════════════════════════════════════════════════════════
  //
  // Canonical color resolution — all modules should call these instead
  // of duplicating the lookup logic.

  /**
   * Resolve a card's resource color { r, g, b }.
   * Priority: explicit resource → suit resource → fallback 'cards'.
   * @param {Object} card
   * @returns {{ r: number, g: number, b: number }}
   */
  function getCardResColor(card) {
    if (!card) return RES_COLORS.cards;
    var res = card.resource || card.costResource || null;
    if (res && RES_COLORS[res]) return RES_COLORS[res];
    if (card.suit && SUIT_DATA[card.suit]) {
      var suitRes = SUIT_DATA[card.suit].res;
      return RES_COLORS[suitRes] || RES_COLORS.cards;
    }
    return RES_COLORS.cards;
  }

  /**
   * Resolve a card's suit data { sym, color, res } or null.
   * @param {Object} card
   * @returns {Object|null}
   */
  function getCardSuitData(card) {
    if (!card || !card.suit) return null;
    return SUIT_DATA[card.suit] || null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ACCESSORS (read-only shallow copies — safe for UI to hold)
  // ═══════════════════════════════════════════════════════════════════

  function getHand()       { return _state.hand.slice(); }
  function getHandSize()   { return _state.hand.length; }
  function getBackup()     { return _state.backup.slice(); }
  function getBackupSize() { return _state.backup.length; }
  function getDeckSize()   { return _state.deck.length; }
  function getBag()        { return _state.bag.slice(); }
  function getBagSize()    { return _state.bag.length; }
  function getStash()      { return _state.stash.slice(); }
  function getStashSize()  { return _state.stash.length; }
  function getEquipped()   { return _state.equipped.slice(); }
  function getEquipSlot(i) { return (i >= 0 && i < EQUIP_SLOTS) ? _state.equipped[i] : null; }
  function getGold()       { return _state.gold; }

  /**
   * Get the hand array by direct reference (for combat-engine hot path).
   * ONLY CombatEngine/CardStack should use this. Everyone else: getHand().
   * @returns {Array} Live reference — mutations are your responsibility.
   */
  function _getHandDirect() { return _state.hand; }

  /**
   * Get the deck array by direct reference (for draw operations).
   * @returns {Array}
   */
  function _getDeckDirect() { return _state.deck; }

  // ═══════════════════════════════════════════════════════════════════
  //  HAND MUTATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Add a card to the hand. Returns false if hand is full.
   * @param {Object} card — full card object
   * @returns {boolean}
   */
  function addToHand(card) {
    if (!card) return false;
    if (_state.hand.length >= MAX_HAND) return false;
    _state.hand.push(card);
    _emit('hand:changed', { hand: getHand() });
    return true;
  }

  /**
   * Remove and return the card at hand[index].
   * @param {number} index
   * @returns {Object|null}
   */
  function removeFromHand(index) {
    if (index < 0 || index >= _state.hand.length) return null;
    var card = _state.hand.splice(index, 1)[0];
    _emit('hand:changed', { hand: getHand() });
    return card;
  }

  /**
   * Replace the entire hand (used by drawHand).
   * @param {Array} cards
   */
  function _setHand(cards) {
    _state.hand = cards;
    _emit('hand:changed', { hand: getHand() });
  }

  /**
   * Check if a card id is in the hand.
   * @param {string} id
   * @returns {boolean}
   */
  function handContains(id) {
    for (var i = 0; i < _state.hand.length; i++) {
      if (_state.hand[i].id === id) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BACKUP (COLLECTION) MUTATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Add a card to the backup deck. Returns false if at capacity.
   * Accepts a card id string or full card object.
   * @param {string|Object} cardOrId
   * @returns {boolean}
   */
  function addToBackup(cardOrId) {
    if (_state.backup.length >= MAX_BACKUP) {
      _emit('collection:full', { card: cardOrId, max: MAX_BACKUP });
      return false;
    }
    var card = (typeof cardOrId === 'string') ? hydrateCard(cardOrId) : cardOrId;
    if (!card) return false;
    _state.backup.push(card);
    _emit('backup:changed', { backup: getBackup() });
    return true;
  }

  /**
   * Remove one copy of a card from backup by index.
   * @param {number} index
   * @returns {Object|null}
   */
  function removeFromBackup(index) {
    if (index < 0 || index >= _state.backup.length) return null;
    var card = _state.backup.splice(index, 1)[0];
    _emit('backup:changed', { backup: getBackup() });
    return card;
  }

  /**
   * Remove one copy of a card from backup by id.
   * @param {string} cardId
   * @returns {boolean}
   */
  function removeFromBackupById(cardId) {
    for (var i = 0; i < _state.backup.length; i++) {
      if (_state.backup[i].id === cardId) {
        _state.backup.splice(i, 1);
        _emit('backup:changed', { backup: getBackup() });
        return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DECK MANAGEMENT (draw pile — shuffled from backup)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Rebuild the draw pile from current backup, excluding cards in hand.
   * Called at combat start, floor transition, and after death reset.
   */
  function resetDeck() {
    // Return any cards currently in hand back to backup before clearing,
    // so they are not permanently lost on floor transitions.
    for (var h = 0; h < _state.hand.length; h++) {
      if (_state.hand[h]) _state.backup.push(_state.hand[h]);
    }
    _state.deck = _state.backup.slice();
    if (typeof SeededRNG !== 'undefined' && SeededRNG.shuffle) {
      SeededRNG.shuffle(_state.deck);
    }
    _state.hand = [];
    _emit('hand:changed', { hand: [] });
  }

  /**
   * Draw N cards into hand (replace, not append). Standard combat open.
   * @param {number} [count=5]
   * @returns {Array} The new hand.
   */
  function drawHand(count) {
    count = count || MAX_HAND;
    var hand = [];
    for (var i = 0; i < count; i++) {
      if (_state.deck.length === 0) {
        // Reshuffle backup minus what's already drawn
        _rebuildDeck(hand);
      }
      if (_state.deck.length > 0) {
        hand.push(_state.deck.pop());
      }
    }
    _state.hand = hand;
    _emit('hand:changed', { hand: getHand() });
    // Card deal sound (new hand drawn)
    if (typeof AudioSystem !== 'undefined') AudioSystem.playRandom('card-deal', { volume: 0.45 });
    return hand;
  }

  /**
   * Draw N cards into hand (append, not replace). Per-turn top-up.
   * @param {number} [count=1]
   * @returns {Array} Newly drawn cards.
   */
  function drawToHand(count) {
    count = count || 1;
    var drawn = [];
    for (var i = 0; i < count; i++) {
      if (_state.deck.length === 0) {
        _rebuildDeck(_state.hand);
      }
      if (_state.deck.length === 0) break;
      var card = _state.deck.pop();
      _state.hand.push(card);
      drawn.push(card);
    }
    if (drawn.length > 0) {
      _emit('hand:changed', { hand: getHand() });
      _emit('draw:executed', { drawn: drawn });
    }
    return drawn;
  }

  /**
   * Draw with overflow cascade (Gone-Rogue pattern):
   *   1. Hand full → bump last card to backup
   *   2. Backup full → incinerate the bumped card
   *   3. Draw new card into freed hand slot
   *
   * @returns {{ drawn: Object|null, bumped: Object|null, incinerated: Object|null }}
   */
  function drawWithOverflow() {
    var result = { drawn: null, bumped: null, incinerated: null };

    if (_state.deck.length === 0) {
      _rebuildDeck(_state.hand);
    }
    if (_state.deck.length === 0) return result;

    // Overflow cascade
    if (_state.hand.length >= MAX_HAND) {
      var bumped = _state.hand.pop();
      result.bumped = bumped;
      if (_state.backup.length >= MAX_BACKUP) {
        result.incinerated = bumped;
      } else {
        _state.backup.push(bumped);
      }
    }

    var card = _state.deck.pop();
    _state.hand.push(card);
    result.drawn = card;

    _emit('hand:changed', { hand: getHand() });
    if (result.bumped || result.incinerated) {
      _emit('backup:changed', { backup: getBackup() });
    }
    return result;
  }

  /**
   * Rebuild deck from backup, excluding cards already in a given hand array.
   * @param {Array} excludeHand — cards to not include in the new deck
   * @private
   */
  function _rebuildDeck(excludeHand) {
    var handIds = {};
    for (var h = 0; h < excludeHand.length; h++) {
      var hid = excludeHand[h].id;
      handIds[hid] = (handIds[hid] || 0) + 1;
    }
    _state.deck = [];
    for (var c = 0; c < _state.backup.length; c++) {
      var cid = _state.backup[c].id;
      if (handIds[cid] && handIds[cid] > 0) {
        handIds[cid]--;
      } else {
        _state.deck.push(_state.backup[c]);
      }
    }
    if (typeof SeededRNG !== 'undefined' && SeededRNG.shuffle) {
      SeededRNG.shuffle(_state.deck);
    }
    // Deck shuffle sound
    if (typeof AudioSystem !== 'undefined') AudioSystem.playRandom('card-shuffle', { volume: 0.4 });
  }

  /**
   * Resolve a stack of cards from hand — stack-based combat play.
   * Persistent cards return to hand; expendable cards are consumed.
   *
   * @param {Array} stackEntries - [{ card, handIndex }] from CardStack
   * @returns {{ expended: Array, retained: Array }}
   */
  function playStack(stackEntries) {
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
        retained.push(card);
      } else {
        if (entry.handIndex >= 0 && entry.handIndex < _state.hand.length) {
          _state.hand.splice(entry.handIndex, 1);
        }
        expended.push(card);
      }
    }
    _emit('hand:changed', { hand: getHand() });
    return { expended: expended, retained: retained };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BAG MUTATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get the current max bag size: BASE_BAG + sum of bag_slots from equipped items.
   * DEPTH3 §4: base 21 + N (N from equipped passive item effects).
   * @returns {number}
   */
  function getMaxBag() {
    var bonus = 0;
    for (var i = 0; i < EQUIP_SLOTS; i++) {
      var eq = _state.equipped[i];
      if (eq && eq.effects) {
        for (var j = 0; j < eq.effects.length; j++) {
          if (eq.effects[j].type === 'bag_slots') {
            bonus += (eq.effects[j].value || 0);
          }
        }
      }
    }
    return BASE_BAG + bonus;
  }

  /**
   * Add an item or card to the bag. Returns false if bag is full.
   * @param {Object} item
   * @returns {boolean}
   */
  function addToBag(item) {
    if (!item) return false;
    if (_state.bag.length >= getMaxBag()) return false;
    _state.bag.push(item);
    _emit('bag:changed', { bag: getBag() });
    return true;
  }

  /**
   * Remove and return item at bag[index].
   * @param {number} index
   * @returns {Object|null}
   */
  function removeFromBag(index) {
    if (index < 0 || index >= _state.bag.length) return null;
    var item = _state.bag.splice(index, 1)[0];
    _emit('bag:changed', { bag: getBag() });
    return item;
  }

  /**
   * Remove first item matching id from bag.
   * @param {string} id
   * @returns {Object|null}
   */
  function removeFromBagById(id) {
    for (var i = 0; i < _state.bag.length; i++) {
      if (_state.bag[i].id === id) {
        var item = _state.bag.splice(i, 1)[0];
        _emit('bag:changed', { bag: getBag() });
        return item;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STASH MUTATIONS (survives death)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Add an item or card to the stash. Returns false if full.
   * @param {Object} item
   * @returns {boolean}
   */
  function addToStash(item) {
    if (!item) return false;
    if (_state.stash.length >= MAX_STASH) return false;
    _state.stash.push(item);
    _emit('stash:changed', { stash: getStash() });
    return true;
  }

  /**
   * Remove and return item at stash[index].
   * @param {number} index
   * @returns {Object|null}
   */
  function removeFromStash(index) {
    if (index < 0 || index >= _state.stash.length) return null;
    var item = _state.stash.splice(index, 1)[0];
    _emit('stash:changed', { stash: getStash() });
    return item;
  }

  /**
   * Remove first item matching id from stash.
   * @param {string} id
   * @returns {Object|null}
   */
  function removeFromStashById(id) {
    for (var i = 0; i < _state.stash.length; i++) {
      if (_state.stash[i].id === id) {
        var item = _state.stash.splice(i, 1)[0];
        _emit('stash:changed', { stash: getStash() });
        return item;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EQUIPPED MUTATIONS (3 quick-slots)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Equip an item into a slot. Returns the previously equipped item (or null).
   * Does NOT validate type matching — CardTransfer handles that.
   * @param {number} slot — 0=weapon, 1=consumable, 2=key
   * @param {Object} item
   * @returns {Object|null} Previously equipped item.
   */
  function equip(slot, item) {
    if (slot < 0 || slot >= EQUIP_SLOTS) return null;
    var prev = _state.equipped[slot];
    _state.equipped[slot] = item || null;
    _emit('equipped:changed', { slot: slot, item: item, prev: prev, equipped: getEquipped() });
    return prev;
  }

  /**
   * Unequip an item from a slot. Returns the item.
   * @param {number} slot
   * @returns {Object|null}
   */
  function unequip(slot) {
    if (slot < 0 || slot >= EQUIP_SLOTS) return null;
    var item = _state.equipped[slot];
    _state.equipped[slot] = null;
    _emit('equipped:changed', { slot: slot, item: null, prev: item, equipped: getEquipped() });
    return item;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  GOLD MUTATIONS
  // ═══════════════════════════════════════════════════════════════════

  function addGold(amount) {
    if (amount <= 0) return;
    _state.gold += amount;
    _emit('gold:changed', { gold: _state.gold, delta: amount });
  }

  /**
   * Spend gold. Returns false if insufficient funds.
   * @param {number} amount
   * @returns {boolean}
   */
  function spendGold(amount) {
    if (amount <= 0) return true;
    if (_state.gold < amount) return false;
    _state.gold -= amount;
    _emit('gold:changed', { gold: _state.gold, delta: -amount });
    return true;
  }

  function setGold(amount) {
    _state.gold = Math.max(0, amount);
    _emit('gold:changed', { gold: _state.gold, delta: 0 });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TRANSFER HELPERS (hand ↔ backup)
  // ═══════════════════════════════════════════════════════════════════
  //
  // Full cross-zone transfers live in CardTransfer (S0.2).
  // These are the primitive moves that CardTransfer composes.

  /**
   * Move a card from hand back to backup.
   * @param {number} handIndex
   * @returns {Object|null} The moved card, or null on failure.
   */
  function moveHandToBackup(handIndex) {
    if (handIndex < 0 || handIndex >= _state.hand.length) return null;
    if (_state.backup.length >= MAX_BACKUP) return null;
    var card = _state.hand.splice(handIndex, 1)[0];
    _state.backup.push(card);
    _emit('hand:changed', { hand: getHand() });
    _emit('backup:changed', { backup: getBackup() });
    return card;
  }

  /**
   * Move a card from backup to hand.
   * @param {number} backupIndex
   * @returns {Object|null} The moved card, or null on failure.
   */
  function moveBackupToHand(backupIndex) {
    if (backupIndex < 0 || backupIndex >= _state.backup.length) return null;
    if (_state.hand.length >= MAX_HAND) return null;
    var card = _state.backup.splice(backupIndex, 1)[0];
    _state.hand.push(card);
    // Also remove from deck if present
    for (var d = _state.deck.length - 1; d >= 0; d--) {
      if (_state.deck[d] === card) { _state.deck.splice(d, 1); break; }
    }
    _emit('hand:changed', { hand: getHand() });
    _emit('backup:changed', { backup: getBackup() });
    return card;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DEATH RESET (DOC-45 §14 Failstate Cascade)
  // ═══════════════════════════════════════════════════════════════════
  //
  // Certain failstates (death, curse, etc.) wipe vulnerable containers.
  // Bag cards with _isJokerVault flag survive (purple glow / immune).
  //
  // Returns the dropped items for scatter / loot spill.

  /**
   * Execute a failstate wipe.
   * @returns {{ cards: Array, items: Array, gold: number }}
   */
  function failstateWipe() {
    var dropped = { cards: [], items: [], gold: 0 };

    // 50% currency penalty
    var penalty = Math.floor(_state.gold * 0.5);
    dropped.gold = penalty;
    _state.gold -= penalty;

    // Hand cards → dropped
    for (var h = 0; h < _state.hand.length; h++) {
      dropped.cards.push(_state.hand[h]);
    }
    _state.hand = [];

    // Backup cards → dropped
    for (var b = 0; b < _state.backup.length; b++) {
      dropped.cards.push(_state.backup[b]);
    }
    _state.backup = [];
    _state.deck = [];

    // Equipped items → dropped
    for (var e = 0; e < EQUIP_SLOTS; e++) {
      if (_state.equipped[e]) {
        dropped.items.push(_state.equipped[e]);
        _state.equipped[e] = null;
      }
    }

    // Bag: items drop, cards with Joker Vault flag survive
    var survivingBag = [];
    for (var i = 0; i < _state.bag.length; i++) {
      var item = _state.bag[i];
      if (item._isJokerVault) {
        survivingBag.push(item);
      } else {
        dropped.items.push(item);
      }
    }
    _state.bag = survivingBag;

    // Stash survives — untouched

    // Emit all change events
    _emit('hand:changed', { hand: [] });
    _emit('backup:changed', { backup: [] });
    _emit('equipped:changed', { slot: -1, item: null, prev: null, equipped: getEquipped() });
    _emit('bag:changed', { bag: getBag() });
    _emit('gold:changed', { gold: _state.gold, delta: -penalty });
    _emit('death:reset', { dropped: dropped });

    return dropped;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  INITIALIZATION (migrate from legacy Player/CardSystem state)
  // ═══════════════════════════════════════════════════════════════════

  var _initialized = false;

  /**
   * Initialize CardAuthority. Called once from Game.init().
   * CardSystem.init() seeds the starter deck via addToBackup/resetDeck.
   */
  function init() {
    if (_initialized) return;

    // S0.5: CardAuthority is the sole owner of inventory state from boot.
    // CardSystem.init() seeds the starter deck via addToBackup/resetDeck.
    // No absorb needed.

    _initialized = true;
    console.log('[CardAuthority] Initialized — hand:' + _state.hand.length +
                ' backup:' + _state.backup.length + ' bag:' + _state.bag.length +
                ' stash:' + _state.stash.length + ' gold:' + _state.gold);
  }

  /**
   * Reset to fresh-game state. Used by Game.reset() / new game.
   */
  function reset() {
    _state.hand = [];
    _state.backup = [];
    _state.deck = [];
    _state.bag = [];
    _state.stash = [];
    _state.equipped = [null, null, null];
    _state.gold = 0;
    _initialized = false;

    _emit('hand:changed', { hand: [] });
    _emit('backup:changed', { backup: [] });
    _emit('bag:changed', { bag: [] });
    _emit('stash:changed', { stash: [] });
    _emit('equipped:changed', { slot: -1, item: null, prev: null, equipped: getEquipped() });
    _emit('gold:changed', { gold: 0, delta: 0 });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SERIALIZATION (save/load)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Serialize all container state for save.
   * @returns {Object} Deep copy of _state.
   */
  function serialize() {
    return JSON.parse(JSON.stringify(_state));
  }

  /**
   * Deserialize saved state and emit all change events.
   * @param {Object} data — previously serialized state
   */
  function deserialize(data) {
    if (!data) return;
    _state.hand     = Array.isArray(data.hand)     ? data.hand     : [];
    _state.backup   = Array.isArray(data.backup)   ? data.backup   : [];
    _state.deck     = Array.isArray(data.deck)     ? data.deck     : [];
    _state.bag      = Array.isArray(data.bag)      ? data.bag      : [];
    _state.stash    = Array.isArray(data.stash)    ? data.stash    : [];
    _state.equipped = Array.isArray(data.equipped)  ? data.equipped  : [null, null, null];
    _state.gold     = (typeof data.gold === 'number') ? data.gold : 0;
    _initialized = true;

    _emit('hand:changed',     { hand: getHand() });
    _emit('backup:changed',   { backup: getBackup() });
    _emit('bag:changed',      { bag: getBag() });
    _emit('stash:changed',    { stash: getStash() });
    _emit('equipped:changed', { slot: -1, item: null, prev: null, equipped: getEquipped() });
    _emit('gold:changed',     { gold: _state.gold, delta: 0 });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  return {
    // ── Constants ──
    MAX_HAND:       MAX_HAND,
    MAX_BACKUP:     MAX_BACKUP,
    MAX_BAG:        MAX_BAG,       // Legacy constant (21). Use getMaxBag() for live value
    getMaxBag:      getMaxBag,     // DEPTH3 §4: BASE_BAG + equipped bag_slots
    MAX_STASH:      MAX_STASH,
    EQUIP_SLOTS:    EQUIP_SLOTS,

    // ── Shared color/suit constants (canonical source) ──
    SUIT_DATA:      SUIT_DATA,
    RES_COLORS:     RES_COLORS,
    QUALITY_COLORS: QUALITY_COLORS,

    // ── Color helpers ──
    getCardResColor:  getCardResColor,
    getCardSuitData:  getCardSuitData,

    // ── Hydration ──
    hydrateCard:    hydrateCard,

    // ── Accessors ──
    getHand:        getHand,
    getHandSize:    getHandSize,
    getBackup:      getBackup,
    getBackupSize:  getBackupSize,
    getDeckSize:    getDeckSize,
    getBag:         getBag,
    getBagSize:     getBagSize,
    getStash:       getStash,
    getStashSize:   getStashSize,
    getEquipped:    getEquipped,
    getEquipSlot:   getEquipSlot,
    getGold:        getGold,

    // ── Internal accessors (combat hot path only) ──
    _getHandDirect: _getHandDirect,
    _getDeckDirect: _getDeckDirect,

    // ── Hand mutations ──
    addToHand:      addToHand,
    removeFromHand: removeFromHand,
    handContains:   handContains,

    // ── Backup mutations ──
    addToBackup:          addToBackup,
    removeFromBackup:     removeFromBackup,
    removeFromBackupById: removeFromBackupById,

    // ── Deck / draw ──
    resetDeck:        resetDeck,
    drawHand:         drawHand,
    drawToHand:       drawToHand,
    drawWithOverflow: drawWithOverflow,
    playStack:        playStack,

    // ── Bag mutations ──
    addToBag:         addToBag,
    removeFromBag:    removeFromBag,
    removeFromBagById: removeFromBagById,

    // ── Stash mutations ──
    addToStash:         addToStash,
    removeFromStash:    removeFromStash,
    removeFromStashById: removeFromStashById,

    // ── Equipped mutations ──
    equip:    equip,
    unequip:  unequip,

    // ── Gold mutations ──
    addGold:    addGold,
    spendGold:  spendGold,
    setGold:    setGold,

    // ── Transfer helpers (hand ↔ backup) ──
    moveHandToBackup:  moveHandToBackup,
    moveBackupToHand:  moveBackupToHand,

    // ── Lifecycle ──
    init:            init,
    reset:           reset,
    failstateWipe:   failstateWipe,
    serialize:       serialize,
    deserialize:     deserialize,

    // ── Events ──
    on:  on,
    off: off
  };
})();

/**
 * CardTransfer — Validated zone-to-zone transfers with rollback.
 *
 * Every inventory transfer in the game goes through this module.
 * No module should directly splice Player.bag, call CardSystem.addCard,
 * or mutate Player.equipped. Instead, call CardTransfer methods.
 *
 * Transfer pattern (from EyesOnly CardTransferManager):
 *   1. Remove from source via CardAuthority
 *   2. Validate target accepts the item
 *   3. Add to target via CardAuthority
 *   4. If add fails → rollback (put it back in source)
 *   5. Return { success: bool, reason?: string, item?: Object }
 *
 * Context gates:
 *   - COMBAT: only hand reorder + equip use allowed
 *   - BONFIRE: stash access enabled
 *   - EXPLORE: most transfers allowed, stash blocked
 *
 * Equip slot mapping (from items.json):
 *   Slot 0 = 'active'  (weapons, tools)
 *   Slot 1 = 'passive' (buffs, accessories)
 *   Slot 2 = 'key'     (quest keys, gate keys)
 *
 * Drop Zone Registry:
 *   Canvas-based zones register with { id, accepts(drag), onDrop(drag) }.
 *   CardFan external drag and MenuInventory both hit-test this registry.
 *
 * Layer 1 — depends on: CardAuthority (S0.1)
 *
 * @see EyesOnly/public/js/card-transfer-manager.js
 * @see docs/INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md (DOC-45) §4b, §7
 * @see docs/INVENTORY_CARD_MENU_REWORK.md (DOC-46) §3
 */
var CardTransfer = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  EQUIP SLOT RESOLUTION
  // ═══════════════════════════════════════════════════════════════════

  // items.json uses 'equipSlot': 'active'|'passive'|'key'|'none'
  // Legacy test harness uses 'type': 'weapon'|'consumable'|'key'
  var SLOT_MAP = {
    active:     0,
    weapon:     0,
    passive:    1,
    consumable: 1,
    key:        2
  };

  /**
   * Resolve the equip slot index for an item. Returns -1 if not equippable.
   * @param {Object} item
   * @returns {number} 0, 1, 2, or -1
   */
  function resolveEquipSlot(item) {
    if (!item) return -1;
    // Primary: equipSlot field from items.json
    if (item.equipSlot && SLOT_MAP[item.equipSlot] !== undefined) {
      return SLOT_MAP[item.equipSlot];
    }
    // Fallback: type field from legacy/test data
    if (item.type && SLOT_MAP[item.type] !== undefined) {
      return SLOT_MAP[item.type];
    }
    return -1;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CONTEXT STATE
  // ═══════════════════════════════════════════════════════════════════
  //
  // External modules set the context via setContext(). CardTransfer
  // uses it to gate transfers (e.g., stash only at bonfire, no deck
  // management in combat).

  var CONTEXTS = {
    EXPLORE: 'explore',
    COMBAT:  'combat',
    BONFIRE: 'bonfire',
    SHOP:    'shop'
  };

  var _context = CONTEXTS.EXPLORE;

  function setContext(ctx) {
    _context = ctx || CONTEXTS.EXPLORE;
  }

  function getContext() {
    return _context;
  }

  function _inCombat() {
    return _context === CONTEXTS.COMBAT;
  }

  function _atBonfire() {
    return _context === CONTEXTS.BONFIRE;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RESULT FACTORY
  // ═══════════════════════════════════════════════════════════════════

  function _ok(item, extra) {
    var r = { success: true, item: item };
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) r[k] = extra[k];
      }
    }
    return r;
  }

  function _fail(reason) {
    return { success: false, reason: reason };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HAND ↔ BACKUP (DECK/COLLECTION)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Move card from hand to backup (return to collection).
   * Blocked during combat.
   */
  function handToBackup(handIndex) {
    if (_inCombat()) return _fail('combat_blocked');
    var card = CardAuthority.moveHandToBackup(handIndex);
    if (!card) return _fail('invalid_index_or_backup_full');
    return _ok(card);
  }

  /**
   * Move card from backup to hand (draw specific card).
   * Blocked during combat (use drawToHand for combat draws).
   */
  function backupToHand(backupIndex) {
    if (_inCombat()) return _fail('combat_blocked');
    var card = CardAuthority.moveBackupToHand(backupIndex);
    if (!card) return _fail('invalid_index_or_hand_full');
    return _ok(card);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HAND ↔ BAG (card-in-bag = Joker Vault)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Move card from hand to bag (Joker Vault storage).
   * The card gets _isJokerVault flag → survives failstate.
   * Blocked during combat.
   */
  function handToBag(handIndex) {
    if (_inCombat()) return _fail('combat_blocked');
    var card = CardAuthority.removeFromHand(handIndex);
    if (!card) return _fail('invalid_index');
    // Tag as Joker Vault (survives death wipe)
    card._isJokerVault = true;
    if (!CardAuthority.addToBag(card)) {
      // Rollback — remove tag, put back in hand
      delete card._isJokerVault;
      CardAuthority.addToHand(card);
      return _fail('bag_full');
    }
    return _ok(card);
  }

  /**
   * Move a card from bag back to hand (retrieve from Joker Vault).
   * Only works on items flagged as Joker Vault cards.
   * Blocked during combat.
   */
  function bagCardToHand(bagIndex) {
    if (_inCombat()) return _fail('combat_blocked');
    var bag = CardAuthority.getBag();
    if (bagIndex < 0 || bagIndex >= bag.length) return _fail('invalid_index');
    var item = bag[bagIndex];
    if (!item || !item._isJokerVault) return _fail('not_a_card');

    var card = CardAuthority.removeFromBag(bagIndex);
    if (!card) return _fail('invalid_index');
    // Clear Joker Vault flag when returning to hand
    delete card._isJokerVault;
    if (!CardAuthority.addToHand(card)) {
      // Rollback — re-tag and put back in bag
      card._isJokerVault = true;
      CardAuthority.addToBag(card);
      return _fail('hand_full');
    }
    return _ok(card);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BAG ↔ STASH (bonfire-only vault access)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Move item from bag to stash. Bonfire context required.
   */
  function bagToStash(bagIndex) {
    if (!_atBonfire()) return _fail('not_at_bonfire');
    var item = CardAuthority.removeFromBag(bagIndex);
    if (!item) return _fail('invalid_index');
    if (!CardAuthority.addToStash(item)) {
      CardAuthority.addToBag(item);
      return _fail('stash_full');
    }
    return _ok(item);
  }

  /**
   * Move item from stash to bag. Bonfire context required.
   */
  function stashToBag(stashIndex) {
    if (!_atBonfire()) return _fail('not_at_bonfire');
    var item = CardAuthority.removeFromStash(stashIndex);
    if (!item) return _fail('invalid_index');
    if (!CardAuthority.addToBag(item)) {
      CardAuthority.addToStash(item);
      return _fail('bag_full');
    }
    return _ok(item);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BAG ↔ EQUIPPED (equip / unequip)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Equip an item from bag into the appropriate slot.
   * Slot is auto-resolved from item.equipSlot or item.type.
   * If the slot is occupied, the old item swaps back to bag.
   * @param {number} bagIndex
   * @param {number} [slotOverride] — force a specific slot (skip auto-resolve)
   * @returns {Object} { success, item, prev?, reason? }
   */
  function bagToEquip(bagIndex, slotOverride) {
    var bag = CardAuthority.getBag();
    if (bagIndex < 0 || bagIndex >= bag.length) return _fail('invalid_index');

    var item = bag[bagIndex];
    var slot = (typeof slotOverride === 'number') ? slotOverride : resolveEquipSlot(item);
    if (slot < 0) return _fail('not_equippable');

    // Remove from bag first
    var removed = CardAuthority.removeFromBag(bagIndex);
    if (!removed) return _fail('invalid_index');

    // Equip — get previous occupant
    var prev = CardAuthority.equip(slot, removed);

    // If there was a previous item, put it back in bag
    if (prev) {
      if (!CardAuthority.addToBag(prev)) {
        // Bag is full (shouldn't happen — we just removed one), rollback
        CardAuthority.equip(slot, prev);
        CardAuthority.addToBag(removed);
        return _fail('bag_full');
      }
    }

    return _ok(removed, { prev: prev, slot: slot });
  }

  /**
   * Unequip an item from a slot back to bag.
   * @param {number} slot — 0, 1, or 2
   */
  function equipToBag(slot) {
    var item = CardAuthority.getEquipSlot(slot);
    if (!item) return _fail('slot_empty');
    if (CardAuthority.getBagSize() >= CardAuthority.MAX_BAG) return _fail('bag_full');

    CardAuthority.unequip(slot);
    CardAuthority.addToBag(item);
    return _ok(item, { slot: slot });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STASH ↔ EQUIPPED (direct equip from stash at bonfire)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Equip an item directly from stash. Bonfire context required.
   * Previous occupant goes to bag (or stash if bag full).
   */
  function stashToEquip(stashIndex, slotOverride) {
    if (!_atBonfire()) return _fail('not_at_bonfire');

    var stash = CardAuthority.getStash();
    if (stashIndex < 0 || stashIndex >= stash.length) return _fail('invalid_index');

    var item = stash[stashIndex];
    var slot = (typeof slotOverride === 'number') ? slotOverride : resolveEquipSlot(item);
    if (slot < 0) return _fail('not_equippable');

    var removed = CardAuthority.removeFromStash(stashIndex);
    if (!removed) return _fail('invalid_index');

    var prev = CardAuthority.equip(slot, removed);

    // Route displaced item: bag first, stash second
    if (prev) {
      if (!CardAuthority.addToBag(prev)) {
        if (!CardAuthority.addToStash(prev)) {
          // Both full — rollback
          CardAuthority.equip(slot, prev);
          CardAuthority.addToStash(removed);
          return _fail('no_room_for_displaced');
        }
      }
    }

    return _ok(removed, { prev: prev, slot: slot });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HAND / BACKUP → STASH (bonfire card stashing)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Move card from hand to stash. Bonfire context required.
   */
  function handToStash(handIndex) {
    if (!_atBonfire()) return _fail('not_at_bonfire');
    var card = CardAuthority.removeFromHand(handIndex);
    if (!card) return _fail('invalid_index');
    if (!CardAuthority.addToStash(card)) {
      CardAuthority.addToHand(card);
      return _fail('stash_full');
    }
    return _ok(card);
  }

  /**
   * Move card from backup to stash. Bonfire context required.
   */
  function backupToStash(backupIndex) {
    if (!_atBonfire()) return _fail('not_at_bonfire');
    var card = CardAuthority.removeFromBackup(backupIndex);
    if (!card) return _fail('invalid_index');
    if (!CardAuthority.addToStash(card)) {
      CardAuthority.addToBackup(card);
      return _fail('stash_full');
    }
    return _ok(card);
  }

  /**
   * Move card from stash to hand. Bonfire context required.
   */
  function stashToHand(stashIndex) {
    if (!_atBonfire()) return _fail('not_at_bonfire');
    var card = CardAuthority.removeFromStash(stashIndex);
    if (!card) return _fail('invalid_index');
    if (!CardAuthority.addToHand(card)) {
      CardAuthority.addToStash(card);
      return _fail('hand_full');
    }
    return _ok(card);
  }

  /**
   * Move card from stash to backup. Bonfire context required.
   */
  function stashToBackup(stashIndex) {
    if (!_atBonfire()) return _fail('not_at_bonfire');
    var card = CardAuthority.removeFromStash(stashIndex);
    if (!card) return _fail('invalid_index');
    if (!CardAuthority.addToBackup(card)) {
      CardAuthority.addToStash(card);
      return _fail('backup_full');
    }
    return _ok(card);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LOOT → BAG (salvage pickup from corpse/crate/world)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Pick up a loot item into the bag.
   * @param {Object} item — full item/card object from loot source
   * @returns {Object}
   */
  function lootToBag(item) {
    if (!item) return _fail('no_item');
    if (!CardAuthority.addToBag(item)) {
      return _fail('bag_full');
    }
    return _ok(item);
  }

  /**
   * Pick up a card into backup (collection).
   * Used for: chest card drops, combat rewards, quest rewards.
   * @param {Object|string} cardOrId
   */
  function lootToBackup(cardOrId) {
    if (!cardOrId) return _fail('no_card');
    if (!CardAuthority.addToBackup(cardOrId)) {
      return _fail('backup_full');
    }
    var card = (typeof cardOrId === 'string') ? CardAuthority.hydrateCard(cardOrId) : cardOrId;
    return _ok(card);
  }

  /**
   * Pick up gold from loot source.
   * @param {number} amount
   */
  function lootGold(amount) {
    if (!amount || amount <= 0) return _fail('no_gold');
    CardAuthority.addGold(amount);
    return _ok(null, { gold: amount });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SHOP TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Buy a card from shop → add to backup.
   * @param {string} cardId
   * @param {number} cost
   * @returns {Object}
   */
  function buyCard(cardId, cost) {
    if (!CardAuthority.spendGold(cost)) {
      return _fail('insufficient_gold');
    }
    var card = CardAuthority.hydrateCard(cardId);
    if (!CardAuthority.addToBackup(card || { id: cardId })) {
      // Rollback — refund gold
      CardAuthority.addGold(cost);
      return _fail('backup_full');
    }
    return _ok(card, { cost: cost });
  }

  /**
   * Sell a card from hand at shop.
   * @param {number} handIndex
   * @param {number} value — gold to receive
   * @returns {Object}
   */
  function sellFromHand(handIndex, value) {
    if (_inCombat()) return _fail('combat_blocked');
    var card = CardAuthority.removeFromHand(handIndex);
    if (!card) return _fail('invalid_index');
    CardAuthority.addGold(value);
    return _ok(card, { gold: value });
  }

  /**
   * Sell a card from backup at shop.
   * @param {string} cardId
   * @param {number} value — gold to receive
   * @returns {Object}
   */
  function sellFromBackup(cardId, value) {
    if (_inCombat()) return _fail('combat_blocked');
    if (!CardAuthority.removeFromBackupById(cardId)) {
      return _fail('not_in_backup');
    }
    CardAuthority.addGold(value);
    return _ok({ id: cardId }, { gold: value });
  }

  /**
   * Sell an item from bag at shop.
   * @param {number} bagIndex
   * @param {number} value — gold to receive
   * @returns {Object}
   */
  function sellFromBag(bagIndex, value) {
    var item = CardAuthority.removeFromBag(bagIndex);
    if (!item) return _fail('invalid_index');
    CardAuthority.addGold(value);
    return _ok(item, { gold: value });
  }

  /**
   * Sell an item from bag by id (for salvage parts).
   * @param {string} itemId
   * @param {number} value
   * @returns {Object}
   */
  function sellFromBagById(itemId, value) {
    var item = CardAuthority.removeFromBagById(itemId);
    if (!item) return _fail('not_in_bag');
    CardAuthority.addGold(value);
    return _ok(item, { gold: value });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  INCINERATOR (destroy item/card for partial refund)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Destroy an item or card from any source zone.
   * @param {string} zone — 'hand' | 'bag' | 'backup' | 'equip'
   * @param {number} index — index in source container (or slot for equip)
   * @param {number} [refund=0] — gold to refund
   * @returns {Object}
   */
  function incinerate(zone, index, refund) {
    var item = null;

    switch (zone) {
      case 'hand':
        if (_inCombat()) return _fail('combat_blocked');
        item = CardAuthority.removeFromHand(index);
        break;
      case 'bag':
        item = CardAuthority.removeFromBag(index);
        break;
      case 'backup':
        if (_inCombat()) return _fail('combat_blocked');
        item = CardAuthority.removeFromBackup(index);
        break;
      case 'equip':
        item = CardAuthority.unequip(index);
        break;
      default:
        return _fail('invalid_zone');
    }

    if (!item) return _fail('invalid_index');

    if (refund && refund > 0) {
      CardAuthority.addGold(refund);
    }

    return _ok(item, { refund: refund || 0, zone: zone });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DROP ZONE REGISTRY (canvas-based hit testing)
  // ═══════════════════════════════════════════════════════════════════
  //
  // Zones register with { id, accepts(drag), onDrop(drag), bounds? }.
  // MenuInventory and CardFan external drag both hit-test this registry.
  // Replaces the ghost _dragZonesRegistered flag in menu-faces.js.

  var _dropZones = [];

  /**
   * Register a drop zone.
   * @param {Object} zone — { id: string, accepts: fn(drag) → bool, onDrop: fn(drag) }
   */
  function registerDropZone(zone) {
    if (!zone || !zone.id) return;
    // Replace existing zone with same id
    for (var i = 0; i < _dropZones.length; i++) {
      if (_dropZones[i].id === zone.id) {
        _dropZones[i] = zone;
        return;
      }
    }
    _dropZones.push(zone);
  }

  /**
   * Unregister a drop zone by id.
   * @param {string} id
   */
  function unregisterDropZone(id) {
    for (var i = _dropZones.length - 1; i >= 0; i--) {
      if (_dropZones[i].id === id) {
        _dropZones.splice(i, 1);
        return;
      }
    }
  }

  /**
   * Unregister all drop zones (used on context change).
   */
  function clearDropZones() {
    _dropZones = [];
  }

  /**
   * Find a drop zone by id.
   * @param {string} id
   * @returns {Object|null}
   */
  function findZone(id) {
    for (var i = 0; i < _dropZones.length; i++) {
      if (_dropZones[i].id === id) return _dropZones[i];
    }
    return null;
  }

  /**
   * Get all registered drop zones (for hit-testing).
   * @returns {Array}
   */
  function getDropZones() {
    return _dropZones;
  }

  /**
   * Hit-test a drag payload against all registered zones.
   * Returns the first zone whose accepts() returns true, or null.
   * @param {Object} drag — { source, index, card/item, ... }
   * @returns {Object|null}
   */
  function hitTest(drag) {
    for (var i = 0; i < _dropZones.length; i++) {
      var zone = _dropZones[i];
      if (zone.accepts && zone.accepts(drag)) {
        return zone;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DROP ZONE FACTORIES (EyesOnly pattern: pre-built zone configs)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create standard drop handlers for the hand fan zone.
   * Accepts: backup → hand, stash → hand (at bonfire)
   */
  function createHandZoneHandlers() {
    return {
      id: 'hand',
      accepts: function (drag) {
        if (_inCombat()) return false;
        return (drag.source === 'backup' || drag.source === 'bag-card' ||
                (drag.source === 'stash' && _atBonfire()));
      },
      onDrop: function (drag) {
        if (drag.source === 'backup') return backupToHand(drag.index);
        if (drag.source === 'bag-card') return bagCardToHand(drag.index);
        if (drag.source === 'stash') return stashToHand(drag.index);
        return _fail('invalid_source');
      }
    };
  }

  /**
   * Create standard drop handlers for the backup (deck/collection) zone.
   * Accepts: hand → backup, stash → backup (at bonfire)
   */
  function createBackupZoneHandlers() {
    return {
      id: 'backup',
      accepts: function (drag) {
        if (_inCombat()) return false;
        return (drag.source === 'hand' ||
                (drag.source === 'stash' && _atBonfire()));
      },
      onDrop: function (drag) {
        if (drag.source === 'hand') return handToBackup(drag.index);
        if (drag.source === 'stash') return stashToBackup(drag.index);
        return _fail('invalid_source');
      }
    };
  }

  /**
   * Create standard drop handlers for the bag zone.
   * Accepts: hand → bag (Joker Vault), equip → bag, stash → bag (bonfire)
   */
  function createBagZoneHandlers() {
    return {
      id: 'bag',
      accepts: function (drag) {
        if (_inCombat()) return false;
        return (drag.source === 'hand' || drag.source === 'equip' ||
                (drag.source === 'stash' && _atBonfire()));
      },
      onDrop: function (drag) {
        if (drag.source === 'hand') return handToBag(drag.index);
        if (drag.source === 'equip') return equipToBag(drag.index);
        if (drag.source === 'stash') return stashToBag(drag.index);
        return _fail('invalid_source');
      }
    };
  }

  /**
   * Create standard drop handlers for the stash zone (bonfire only).
   * Accepts: bag → stash, hand → stash, backup → stash
   */
  function createStashZoneHandlers() {
    return {
      id: 'stash',
      accepts: function (drag) {
        if (!_atBonfire()) return false;
        return (drag.source === 'bag' || drag.source === 'hand' || drag.source === 'backup');
      },
      onDrop: function (drag) {
        if (drag.source === 'bag') return bagToStash(drag.index);
        if (drag.source === 'hand') return handToStash(drag.index);
        if (drag.source === 'backup') return backupToStash(drag.index);
        return _fail('invalid_source');
      }
    };
  }

  /**
   * Create standard drop handlers for equip slots.
   * Accepts: bag → equip (type-matched), stash → equip (bonfire)
   */
  function createEquipZoneHandlers() {
    return {
      id: 'equip',
      accepts: function (drag) {
        if (drag.source !== 'bag' && drag.source !== 'stash') return false;
        if (drag.source === 'stash' && !_atBonfire()) return false;
        // Check item is equippable
        var item = drag.data || drag.item;
        return resolveEquipSlot(item) >= 0;
      },
      onDrop: function (drag) {
        if (drag.source === 'bag') return bagToEquip(drag.index, drag.slotOverride);
        if (drag.source === 'stash') return stashToEquip(drag.index, drag.slotOverride);
        return _fail('invalid_source');
      }
    };
  }

  /**
   * Create standard drop handlers for the incinerator zone.
   * Accepts: anything except stash (stash is sacred).
   */
  function createIncineratorZoneHandlers() {
    return {
      id: 'incinerator',
      accepts: function (drag) {
        // Cannot incinerate stash items — stash is safe
        if (drag.source === 'stash') return false;
        // Cannot manage deck during combat
        if (_inCombat() && (drag.source === 'backup' || drag.source === 'hand')) return false;
        return true;
      },
      onDrop: function (drag) {
        return incinerate(drag.source, drag.index, drag.refund || 0);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CONVENIENCE: Register all standard zones at once
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Register the 6 standard drop zones. Called by MenuInventory on open.
   */
  function registerStandardZones() {
    registerDropZone(createHandZoneHandlers());
    registerDropZone(createBackupZoneHandlers());
    registerDropZone(createBagZoneHandlers());
    registerDropZone(createStashZoneHandlers());
    registerDropZone(createEquipZoneHandlers());
    registerDropZone(createIncineratorZoneHandlers());
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  return {
    // ── Constants ──
    CONTEXTS: CONTEXTS,
    SLOT_MAP: SLOT_MAP,

    // ── Context ──
    setContext:  setContext,
    getContext:  getContext,

    // ── Equip slot resolution ──
    resolveEquipSlot: resolveEquipSlot,

    // ── Hand ↔ Backup ──
    handToBackup: handToBackup,
    backupToHand: backupToHand,

    // ── Hand ↔ Bag (Joker Vault) ──
    handToBag:     handToBag,
    bagCardToHand: bagCardToHand,

    // ── Bag ↔ Stash (bonfire) ──
    bagToStash: bagToStash,
    stashToBag: stashToBag,

    // ── Bag ↔ Equip ──
    bagToEquip: bagToEquip,
    equipToBag: equipToBag,

    // ── Stash ↔ Equip (bonfire) ──
    stashToEquip: stashToEquip,

    // ── Hand/Backup → Stash (bonfire) ──
    handToStash:    handToStash,
    backupToStash:  backupToStash,
    stashToHand:    stashToHand,
    stashToBackup:  stashToBackup,

    // ── Loot pickup ──
    lootToBag:    lootToBag,
    lootToBackup: lootToBackup,
    lootGold:     lootGold,

    // ── Shop transactions ──
    buyCard:         buyCard,
    sellFromHand:    sellFromHand,
    sellFromBackup:  sellFromBackup,
    sellFromBag:     sellFromBag,
    sellFromBagById: sellFromBagById,

    // ── Incinerator ──
    incinerate: incinerate,

    // ── Drop Zone Registry ──
    registerDropZone:   registerDropZone,
    unregisterDropZone: unregisterDropZone,
    clearDropZones:     clearDropZones,
    findZone:           findZone,
    getDropZones:       getDropZones,
    hitTest:            hitTest,

    // ── Drop Zone Factories ──
    createHandZoneHandlers:         createHandZoneHandlers,
    createBackupZoneHandlers:       createBackupZoneHandlers,
    createBagZoneHandlers:          createBagZoneHandlers,
    createStashZoneHandlers:        createStashZoneHandlers,
    createEquipZoneHandlers:        createEquipZoneHandlers,
    createIncineratorZoneHandlers:  createIncineratorZoneHandlers,
    registerStandardZones:          registerStandardZones
  };
})();

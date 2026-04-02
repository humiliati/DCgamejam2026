# Inventory, Card & Menu Rework — Kill the Redundancy

> **Created:** 2026-04-01
> **Problem:** 3-4 competing storage models, unregistered drag-drop zones, two card renderers, direct state mutations bypassing encapsulation. Every "fix" adds another layer of bugs because the foundation is fractured.
> **Solution:** Port EyesOnly's proven architecture — single state authority, event-driven reactivity, stateless delegates, drop zone registry — into DG's IIFE module pattern.

---

## What's Wrong (The Audit)

### Storage Fragmentation

Cards live in 3+ places simultaneously:

| Location | Owner | What's There | Problem |
|----------|-------|-------------|---------|
| `CardSystem._hand[]` | CardSystem | Canonical hand | Correct source |
| `Player._state.hand[]` | Player | Fallback hand | **Diverges on death/reset** |
| `CardSystem._collection[]` | CardSystem | Backup deck | Correct source |
| `Player._state.bag[]` | Player | Items + salvage parts | **Shop directly splices this** |
| `Player._state.stash[]` | Player | Persistent storage | No UI renders this |
| `Player._state.equipped[]` | Player | Quick-slots | No UI renders this |
| `Salvage._stagedLoot[]` | Salvage | Corpse contents | **takeLoot() doesn't add to bag** |
| `Shop._inventory[]` | Shop | Shop stock | **addCard() goes to collection, not hand** |

Player.getHand() tries to proxy to CardSystem but falls back to its own `_state.hand` — meaning after death, CardSystem and Player disagree about what's in the hand.

### Drag-Drop Is Declared But Never Wired

```javascript
// MenuFaces — zones exist as strings
var ZONE_EQUIP = 'inv-equip';
var ZONE_BAG   = 'inv-bag';
var _dragZonesRegistered = false;  // ← NEVER SET TO TRUE

// CardFan — handler exists as null
var _externalDropHandler = null;   // ← NEVER ASSIGNED
```

No module registers drop zones. No module assigns a drop handler. The infrastructure is ghost code.

### Two Card Renderers

| Module | Technology | Used By |
|--------|-----------|---------|
| CardDraw (card-draw.js, 576 lines) | Canvas 2D, 3 LOD tiers | CardFan (combat hand) |
| CardRenderer (card-renderer.js, 793 lines) | DOM + CSS injection | Nothing visible |

Both define `SUIT_DATA`, `RES_COLORS`, and card layout independently. Colors diverge. MenuFaces can't use CardRenderer (DOM) because it renders on a canvas context.

### Direct Mutations Bypass Encapsulation

```javascript
// Shop.sellPart() — line 309
bag.splice(itemIdx, 1);  // Directly mutates Player's bag array

// Player.onDeath()
_state.hand = [];  // Clears Player copy but CardSystem._hand may still have cards
```

---

## What EyesOnly Got Right

### Single Source of Truth: GAMESTATE

All mutable card/item state lives in ONE object. No module holds its own copy. Every read goes through one accessor layer (CardStateAuthority). Every write goes through one mutation layer (GAMESTATE methods).

### CardRef Minimalism

Hand, backup, vault — every container stores the same minimal reference:
```javascript
{ id: 'ACT-042', qty: 1, meta: null }
```

Full card data is never duplicated. `hydrateCard(ref)` resolves the ID to a complete definition on demand from 3 sources in priority order (dynamic instances → static registry → fallback snapshot).

### Events > Polling

Every state change emits a typed event. UI subscribes. No module needs to poll or cache:
```
hand:changed → CardFan re-renders
backup:changed → MenuFaces deck section re-renders
vault:changed → MenuFaces stash section re-renders
```

### Stateless Delegates

CardPlaySystem, CardTransferManager, CardDisposalSystem — none hold state. They're pure functions that read from GAMESTATE, validate, mutate GAMESTATE, and emit events. No local caches to diverge.

### Drop Zone Registry

```javascript
registerDropZone(element, {
  id: 'zone-bag',
  accepts: function(drag) { return drag.type === 'card'; },
  onDrop: function(drag) { transferToBackup(drag.cardId); }
});
```

Zones register themselves. The drag controller hit-tests registered zones. New zones (shop sell, bonfire stash, debrief incinerator) register the same way.

---

## The Rework Plan

### What Dies

These modules get **deleted entirely** — not refactored, deleted:

| Module | Lines | Why It Dies |
|--------|-------|-------------|
| `Player._state.hand[]` (fallback) | ~20 | Divergent copy of CardSystem state |
| `CardRenderer` (card-renderer.js) | 793 | DOM-based renderer nobody calls; colors duplicate CardDraw |
| `MenuFaces` (menu-faces.js) | ~2000+ | Rebuilt from scratch — current version has undefined constants, unregistered zones, illegible sizing |
| `CardStack` (card-stack.js) | 472 | Overlaps with CardSystem hand management |

**Total killed: ~3,300 lines of bug-generating redundancy.**

### What Gets Ported From EyesOnly

| EyesOnly Module | DG Module Name | Lines | What It Brings |
|----------------|---------------|-------|----------------|
| CardStateAuthority pattern | `engine/card-authority.js` | ~400 | Single read/write gateway for all card state |
| CardTransferManager pattern | `engine/card-transfer.js` | ~300 | Zone-to-zone transfers with validation |
| Drop zone registry from CardDragController | integrated into `card-authority.js` | ~150 | `registerDropZone()`, hit-testing, drag lifecycle |
| hydrateCard() pattern | integrated into `card-authority.js` | ~80 | Single hydration point for card ID → full definition |
| Event emitter pattern | integrated into `card-authority.js` | ~50 | `on(type, fn)`, `off(type, fn)`, `_emit(type, payload)` |

### What Gets Kept From DG

| Module | Lines | Why It Stays |
|--------|-------|-------------|
| `CardSystem` (card-system.js) | 556 | Registry, collection, deck — refactored to delegate to CardAuthority |
| `CardDraw` (card-draw.js) | 576 | Canvas card renderer with LOD tiers — becomes THE ONLY card renderer |
| `CardFan` (card-fan.js) | 1,498 | Combat hand fan — refactored to use CardAuthority events |
| `CombatEngine` (combat-engine.js) | 520 | Combat resolution — untouched |
| `CombatBridge` (combat-bridge.js) | 891 | Combat → UI bridge — minor refactor for CardAuthority |
| `Player` (player.js) | — | HP, position, stats — stripped of card/item storage |
| `Salvage` (salvage.js) | — | Corpse harvesting — refactored to use CardAuthority transfers |
| `Shop` (shop.js) | — | Purchases — refactored to use CardAuthority transfers |
| `LootTables` (loot-tables.js) | 260 | Drop tables — untouched |
| `MenuBox` (menu-box.js) | — | 4-face rotating container — untouched |

### What Gets Built New

| Module | Est. Lines | Purpose |
|--------|-----------|---------|
| `engine/card-authority.js` | ~500 | Single source of truth for all card/item state |
| `engine/card-transfer.js` | ~300 | Validated zone-to-zone transfers + drop zone registry |
| `engine/menu-inventory.js` | ~800 | New pause menu inventory surface (replaces menu-faces.js) |

---

## New Architecture

### CardAuthority (The Single Source of Truth)

```javascript
var CardAuthority = (function() {
  'use strict';

  // ═══════════════════════════════════════════
  // THE ONLY MUTABLE CARD/ITEM STATE IN THE GAME
  // ═══════════════════════════════════════════
  var _state = {
    hand:     [],  // max 5 — cards playable in combat
    backup:   [],  // max 25 — draw pile
    bag:      [],  // max 12 — items, salvage parts, consumables
    stash:    [],  // max 20 — persistent storage (survives death)
    equipped: [null, null, null],  // 3 quick-slots
    gold:     0
  };

  var MAX_HAND    = 5;
  var MAX_BACKUP  = 25;
  var MAX_BAG     = 12;
  var MAX_STASH   = 20;
  var EQUIP_SLOTS = 3;

  // ── Event System ──
  var _listeners = {};

  function on(type, fn) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(fn);
  }

  function off(type, fn) {
    var arr = _listeners[type];
    if (arr) {
      var idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  function _emit(type, payload) {
    var fns = _listeners[type] || [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](payload); } catch (e) { console.error('CardAuthority event error:', e); }
    }
    // Wildcard listeners
    var wild = _listeners['*'] || [];
    for (var j = 0; j < wild.length; j++) {
      try { wild[j]({ type: type, payload: payload }); } catch (e) {}
    }
  }

  // ── Card Hydration ──
  // CardRef: { id: string, qty: number }
  // Resolve ID → full card definition from CardSystem registry
  function hydrateCard(ref) {
    if (!ref || !ref.id) return null;
    var card = CardSystem.getCardById(ref.id);
    if (!card) return null;
    return Object.assign({}, card, { qty: ref.qty || 1 });
  }

  // ── Accessors (read-only snapshots) ──
  function getHand()     { return _state.hand.slice(); }
  function getBackup()   { return _state.backup.slice(); }
  function getBag()      { return _state.bag.slice(); }
  function getStash()    { return _state.stash.slice(); }
  function getEquipped() { return _state.equipped.slice(); }
  function getGold()     { return _state.gold; }

  // ── Mutations (all emit events) ──
  function addToHand(ref) {
    if (_state.hand.length >= MAX_HAND) return false;
    _state.hand.push(ref);
    _emit('hand:changed', { hand: getHand() });
    return true;
  }

  function removeFromHand(index) {
    if (index < 0 || index >= _state.hand.length) return null;
    var removed = _state.hand.splice(index, 1)[0];
    _emit('hand:changed', { hand: getHand() });
    return removed;
  }

  function addToBag(ref) {
    if (_state.bag.length >= MAX_BAG) return false;
    _state.bag.push(ref);
    _emit('bag:changed', { bag: getBag() });
    return true;
  }

  function removeFromBag(index) {
    if (index < 0 || index >= _state.bag.length) return null;
    var removed = _state.bag.splice(index, 1)[0];
    _emit('bag:changed', { bag: getBag() });
    return removed;
  }

  // ... addToStash, removeFromStash, equip, unequip, addGold, etc.

  // ── Death Reset ──
  function onDeath() {
    // Tier 1: lost on death
    _state.hand = [];
    _state.backup = [];
    _state.bag = [];
    _state.gold = Math.floor(_state.gold * 0.5);  // Lose half gold
    // Tier 2: survives
    // _state.equipped stays
    // Tier 3: permanent
    // _state.stash stays
    _emit('hand:changed', { hand: [] });
    _emit('backup:changed', { backup: [] });
    _emit('bag:changed', { bag: [] });
    _emit('death:reset', {});
  }

  // ── Serialization ──
  function serialize() { return JSON.parse(JSON.stringify(_state)); }
  function deserialize(data) {
    _state = data;
    _emit('hand:changed', { hand: getHand() });
    _emit('backup:changed', { backup: getBackup() });
    _emit('bag:changed', { bag: getBag() });
  }

  return Object.freeze({
    // Accessors
    getHand: getHand, getBackup: getBackup, getBag: getBag,
    getStash: getStash, getEquipped: getEquipped, getGold: getGold,
    hydrateCard: hydrateCard,
    // Mutations
    addToHand: addToHand, removeFromHand: removeFromHand,
    addToBag: addToBag, removeFromBag: removeFromBag,
    addToStash: addToStash, removeFromStash: removeFromStash,
    equip: equip, unequip: unequip,
    addGold: addGold, spendGold: spendGold,
    addToBackup: addToBackup, removeFromBackup: removeFromBackup,
    drawFromBackup: drawFromBackup,
    // Lifecycle
    onDeath: onDeath, serialize: serialize, deserialize: deserialize,
    // Events
    on: on, off: off,
    // Constants
    MAX_HAND: MAX_HAND, MAX_BACKUP: MAX_BACKUP,
    MAX_BAG: MAX_BAG, MAX_STASH: MAX_STASH
  });
})();
```

**The rule:** Nothing touches `_state` except CardAuthority's own methods. Player.js, Shop.js, Salvage.js, MenuInventory — they all call CardAuthority methods. No direct array mutations anywhere.

### CardTransfer (Validated Zone-to-Zone Moves)

```javascript
var CardTransfer = (function() {
  'use strict';

  // Every transfer is: source zone + index → target zone
  // Every transfer validates capacity and emits events

  function handToBag(handIndex) {
    var ref = CardAuthority.removeFromHand(handIndex);
    if (!ref) return { success: false, reason: 'invalid_index' };
    if (!CardAuthority.addToBag(ref)) {
      // Bag full — put it back
      CardAuthority.addToHand(ref);
      return { success: false, reason: 'bag_full' };
    }
    return { success: true, item: ref };
  }

  function bagToHand(bagIndex) {
    var ref = CardAuthority.removeFromBag(bagIndex);
    if (!ref) return { success: false, reason: 'invalid_index' };
    if (!CardAuthority.addToHand(ref)) {
      CardAuthority.addToBag(ref);
      return { success: false, reason: 'hand_full' };
    }
    return { success: true, item: ref };
  }

  function bagToStash(bagIndex) { /* same pattern with rollback */ }
  function stashToBag(stashIndex) { /* same pattern with rollback */ }
  function bagToEquip(bagIndex, slot) { /* swap if slot occupied */ }
  function equipToBag(slot) { /* same pattern */ }

  // Salvage: corpse → bag
  function lootToBag(stagedItem) {
    if (!CardAuthority.addToBag(stagedItem)) {
      return { success: false, reason: 'bag_full' };
    }
    return { success: true, item: stagedItem };
  }

  // Shop: buy card → backup, sell from bag → gold
  function buyCard(cardId, cost) {
    if (CardAuthority.getGold() < cost) return { success: false, reason: 'insufficient_gold' };
    CardAuthority.spendGold(cost);
    CardAuthority.addToBackup({ id: cardId, qty: 1 });
    return { success: true };
  }

  function sellFromBag(bagIndex, value) {
    var ref = CardAuthority.removeFromBag(bagIndex);
    if (!ref) return { success: false, reason: 'invalid_index' };
    CardAuthority.addGold(value);
    return { success: true, item: ref, gold: value };
  }

  // ── Drop Zone Registry ──
  var _dropZones = [];

  function registerDropZone(id, accepts, onDrop) {
    _dropZones.push({ id: id, accepts: accepts, onDrop: onDrop });
  }

  function getDropZones() { return _dropZones; }

  function findZone(id) {
    for (var i = 0; i < _dropZones.length; i++) {
      if (_dropZones[i].id === id) return _dropZones[i];
    }
    return null;
  }

  return Object.freeze({
    handToBag: handToBag, bagToHand: bagToHand,
    bagToStash: bagToStash, stashToBag: stashToBag,
    bagToEquip: bagToEquip, equipToBag: equipToBag,
    lootToBag: lootToBag,
    buyCard: buyCard, sellFromBag: sellFromBag,
    registerDropZone: registerDropZone,
    getDropZones: getDropZones, findZone: findZone
  });
})();
```

**The rule:** Every transfer validates, executes, and returns `{ success, reason }`. Failed transfers roll back automatically. No orphaned items.

### MenuInventory (The New Pause Menu Surface)

Replaces `menu-faces.js` entirely. Canvas-rendered on the MenuBox face. Uses CardDraw as the ONLY card renderer.

```
┌─────────────────────────────────────────────┐
│  INVENTORY                         [E] Close │
├─────────────────────────────────────────────┤
│                                              │
│  ◆ EQUIPPED                                  │
│  ┌────┐ ┌────┐ ┌────┐                       │
│  │ 🗡️ │ │ 🛡️ │ │ 🔑 │   ← 3 equip slots    │
│  │Blade│ │    │ │    │                       │
│  └────┘ └────┘ └────┘                       │
│                                              │
│  ◆ BAG (4/12)                    💰 85g      │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │
│  │🛢️  │ │⚗️  │ │🔧  │ │📜  │               │
│  │Fuel │ │Pot │ │Kit │ │Map │               │
│  └────┘ └────┘ └────┘ └────┘               │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │
│  │    │ │    │ │    │ │    │  ← 12 slots    │
│  │    │ │    │ │    │ │    │                 │
│  └────┘ └────┘ └────┘ └────┘               │
│                                              │
│  ◆ HAND (3/5)                                │
│  ┌──────┐ ┌──────┐ ┌──────┐                 │
│  │♠ Bash│ │♣ Blk │ │♦ Arrw│  ← CardDraw     │
│  │ ATK 4│ │ DEF 3│ │ ATK 2│    MEDIUM LOD    │
│  └──────┘ └──────┘ └──────┘                 │
│                                              │
│  ◆ DECK (10)  ◆ STASH (2/20)               │
│  [Browse Deck]  [Open Stash]  ← sub-views   │
│                                              │
│  ► Select item, then press E to use          │
│  ► Drag between zones to transfer            │
└─────────────────────────────────────────────┘
```

**Rendering rules:**
- All cards rendered via `CardDraw.draw(ctx, card, x, y, lod)` — ONE renderer, ONE color scheme
- Item slots rendered as bordered rectangles with emoji + label
- Selected item has highlight border + tooltip below
- Equipped slots use MEDIUM LOD (80×112)
- Bag slots use SMALL LOD (48×48) — grid layout, 4 columns
- Hand cards use MEDIUM LOD
- Deck/Stash are sub-views (scroll lists) opened by pressing left/right

**Interaction model:**
- Arrow keys / WASD navigate between slots (grid navigation)
- E key: use/equip selected item
- Q key: drop/sell selected item (context-dependent)
- Number keys 1-3: quick-equip to slot
- Drag pointer: initiate drag → highlight valid drop zones → drop to transfer

**Drop zone registration (in Game.init):**

```javascript
CardTransfer.registerDropZone('equip-0',
  function(drag) { return drag.type === 'item' && drag.ref.equipSlot; },
  function(drag) { CardTransfer.bagToEquip(drag.sourceIndex, 0); }
);
CardTransfer.registerDropZone('equip-1', ...);
CardTransfer.registerDropZone('equip-2', ...);
CardTransfer.registerDropZone('bag',
  function(drag) { return true; },  // Bag accepts anything
  function(drag) {
    if (drag.source === 'hand') CardTransfer.handToBag(drag.sourceIndex);
    if (drag.source === 'stash') CardTransfer.stashToBag(drag.sourceIndex);
    if (drag.source === 'equip') CardTransfer.equipToBag(drag.sourceSlot);
  }
);
CardTransfer.registerDropZone('stash',
  function(drag) { return MenuBox.getContext() === 'bonfire'; },
  function(drag) { CardTransfer.bagToStash(drag.sourceIndex); }
);
```

---

## Refactors to Existing Modules

### Player.js — Strip Card/Item State

**Remove:**
- `_state.hand[]` — moved to CardAuthority
- `_state.bag[]` — moved to CardAuthority
- `_state.stash[]` — moved to CardAuthority
- `_state.equipped[]` — moved to CardAuthority
- `_state.gold` — moved to CardAuthority
- All `getHand()`, `addToBag()`, `removeFromBag()`, `equip()`, `unequip()` methods
- The `getHand()` proxy-with-fallback pattern

**Keep:**
- HP, maxHP, energy, battery
- Position (x, y), direction, lookOffset
- Stats (STR, DEX, STL)
- Status effects
- Class, callsign

**Player becomes:** Pure character stats + position. No inventory.

### CardSystem.js — Delegate to CardAuthority

**Remove:**
- `_hand[]` and `_collection[]` private arrays
- `getHand()`, `drawHand()`, `playFromHand()`, `pushToHand()` methods
- The internal event emitter (`_emit`, `_listeners`, `on`, `off`)

**Keep:**
- Card registry loading (`_cards` from data/cards.json)
- `getCardById(id)` — static card definition lookup
- `init()` — loads card definitions

**CardSystem becomes:** Read-only card definition registry. No mutable state.

### CardFan.js — Subscribe to CardAuthority Events

**Remove:**
- Direct reads from `CardSystem.getHand()` during render
- Internal `_externalDropHandler` (use CardTransfer drop zones instead)

**Add:**
- `CardAuthority.on('hand:changed', function() { _needsRedraw = true; })`
- Read from `CardAuthority.getHand()` instead of `CardSystem.getHand()`
- On card drag-out, call `CardTransfer.handToBag(index)` or `CardTransfer.handToBackup(index)`

### Salvage.js — Use CardTransfer

**Remove:**
- `takeLoot()` returning item with no destination

**Replace with:**
```javascript
function takeLoot(index) {
  var item = _stagedLoot[index];
  if (!item) return { success: false, reason: 'invalid_index' };
  var result = CardTransfer.lootToBag(item);
  if (result.success) {
    _stagedLoot.splice(index, 1);
  }
  return result;  // { success: true/false, reason: 'bag_full' }
}
```

Caller gets a clear result. No orphaned items.

### Shop.js — Use CardTransfer

**Remove:**
- Direct `bag.splice(itemIdx, 1)` mutation
- Direct `CardSystem.addCard()` call

**Replace with:**
```javascript
function buyCard(shopIndex) {
  var listing = _inventory[shopIndex];
  if (!listing) return { success: false, reason: 'invalid' };
  return CardTransfer.buyCard(listing.cardId, listing.cost);
}

function sellFromBag(bagIndex) {
  var bag = CardAuthority.getBag();
  var item = bag[bagIndex];
  if (!item) return { success: false, reason: 'invalid' };
  var value = _calculateSellValue(item, _factionId);
  return CardTransfer.sellFromBag(bagIndex, value);
}
```

### CombatBridge.js — Minor Rewire

Replace `CardSystem.getHand()` calls with `CardAuthority.getHand()`. Replace `CardSystem.playFromHand(index)` with `CardAuthority.removeFromHand(index)` + effect resolution.

### HUD.js — Subscribe to Events

```javascript
// In Game.init(), after CardAuthority is available:
CardAuthority.on('hand:changed', function(payload) {
  HUD.setHandCount(payload.hand.length);
});
CardAuthority.on('bag:changed', function() {
  HUD.setBagCount(CardAuthority.getBag().length);
});
CardAuthority.on('gold:changed', function() {
  HUD.setGold(CardAuthority.getGold());
});
```

No more polling. HUD updates reactively.

---

## Script Load Order

```html
<!-- Layer 0: Foundations -->
<script src="engine/tiles.js"></script>
<script src="engine/seeded-rng.js"></script>
<script src="engine/i18n.js"></script>
<script src="engine/audio-system.js"></script>

<!-- Layer 1: Core systems -->
<script src="engine/card-system.js"></script>       <!-- Registry only, no state -->
<script src="engine/card-authority.js"></script>     <!-- NEW: single state owner -->
<script src="engine/card-transfer.js"></script>      <!-- NEW: validated transfers -->
<script src="engine/card-draw.js"></script>           <!-- THE card renderer -->
<!-- ... other Layer 1 modules ... -->

<!-- Layer 2: Rendering + UI -->
<script src="engine/card-fan.js"></script>            <!-- Reads from CardAuthority -->
<script src="engine/menu-box.js"></script>
<script src="engine/menu-inventory.js"></script>     <!-- NEW: replaces menu-faces.js -->
<script src="engine/hud.js"></script>
<!-- ... other Layer 2 modules ... -->

<!-- REMOVED: -->
<!-- <script src="engine/card-renderer.js"></script>   DELETED -->
<!-- <script src="engine/card-stack.js"></script>       DELETED -->
<!-- <script src="engine/menu-faces.js"></script>       DELETED -->
```

---

## Execution Order

### Step 1: Build CardAuthority + CardTransfer (4h)

Create the two new modules. Test with console: `CardAuthority.addToHand({id:'ACT-001', qty:1})` → `CardAuthority.getHand()` returns the card → `CardTransfer.handToBag(0)` moves it → events fire.

### Step 2: Rewire existing modules (3h)

- Strip Player.js of card/item state
- Point CardFan at CardAuthority
- Point Salvage at CardTransfer
- Point Shop at CardTransfer
- Point CombatBridge at CardAuthority
- Point HUD at CardAuthority events

Test: game boots, combat works, salvage works, shop works. No visual changes yet.

### Step 3: Build MenuInventory (5h)

New pause menu surface from scratch using CardDraw for all card rendering. Grid navigation, slot selection, tooltips. Wire drop zones for drag-drop.

### Step 4: Delete dead code (1h)

- Delete card-renderer.js
- Delete card-stack.js
- Delete menu-faces.js
- Remove Player's card/item state and proxy methods
- Remove CardSystem's hand/collection arrays
- Remove all `<script>` tags for deleted files

### Step 5: Verify no regressions (2h)

Play through Floor 0 → 1 → 1.1 → 1.3 → 1.3.1. Check:
- Cards draw during combat
- Cards play correctly (suit advantage, damage resolution)
- Salvage from corpse goes to bag
- Shop buy/sell works
- Pause menu shows inventory correctly
- Card sizes are legible
- Equip/unequip works
- Death resets correctly (lose hand/bag, keep stash)
- Bonfire stash transfer works

**Total: ~15h**

---

## What This Fixes

| Bug | Root Cause | How Rework Fixes It |
|-----|-----------|-------------------|
| Drag-drop not working | Zones declared, never registered | CardTransfer.registerDropZone() wired in Game.init() |
| Cards illegible in menu | Two renderers, one DOM-based unused | Single renderer: CardDraw (canvas, 3 LOD tiers) |
| Menu card sizes don't match hand | CardRenderer vs CardDraw | Same CardDraw with same LOD at same sizes |
| Inventory invisible | MenuFaces rendering incomplete | MenuInventory built from scratch |
| Salvage items disappear | takeLoot() returns item, nobody adds to bag | CardTransfer.lootToBag() with rollback |
| Shop breaks bag | Direct splice mutation | CardTransfer.sellFromBag() with event emission |
| Death desyncs hand | Player._state.hand vs CardSystem._hand | One source: CardAuthority._state.hand |
| HUD doesn't update | No event subscriptions | CardAuthority.on('hand:changed', ...) |
| Stash inaccessible | No UI renders stash | MenuInventory stash sub-view |
| Equipped items invisible | No UI renders equipped | MenuInventory equipped slots with MEDIUM LOD |

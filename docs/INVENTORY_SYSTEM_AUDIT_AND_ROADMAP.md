# INVENTORY SYSTEM AUDIT & ROADMAP

**Date**: 2026-03-31
**Status**: ✅ RESOLVED — Sprint 0 completed 2026-04-01. All issues addressed.
**Priority**: CRITICAL — game-blocking bugs, broken UI, non-functional containers
**Deadline**: April 5 (jam submission)

---

## 1. PURPOSE

This document is the single source of truth for the inventory system overhaul. Previous passes introduced regressions and inconsistencies. This audit maps every DG container, method, and UI element against the working EyesOnly reference implementation, identifies every gap, and defines a zero-ambiguity fix plan.

Nothing gets coded until this document is reviewed and agreed on.

---

## 2. CONTAINER MAPPING: DG ↔ EYESONLY

### 2.1 Container Correspondence

| DG Container | Max | EyesOnly Equivalent | Max | Match? | Notes |
|---|---|---|---|---|---|
| `CardSystem._hand` (proxied via Player) | 5 | `CardStateAuthority.hand` | 5 | ✅ Size match | DG proxies through Player.getHand() → CardSystem.getHand() |
| `CardSystem._collection` | ∞ | `CardStateAuthority.backup` | 25 | ❌ No cap | DG "collection" = all owned cards. EO "backup" = capped at 25. DG needs a MAX_COLLECTION constant. |
| `CardSystem._deck` | — | (implicit shuffle of backup) | — | ⚠️ Conceptual diff | DG has separate _deck (draw pile) vs _collection (all owned). EO shuffles backup directly. |
| `Player._state.bag` | 12 | `GAMESTATE.looseInventory` | varies | ⚠️ Partial | DG bag = items + cards. EO loose = items only. Cards live in CSA. |
| `Player._state.stash` | 20 | `GAMESTATE.persistentInventory` | varies | ⚠️ Partial | DG stash = death-safe. EO persistent = bonfire-stashed. Similar purpose. |
| `Player._state.equipped` | 3 slots | `GAMESTATE.activeItem` (single) | 1 | ❌ Different | DG has 3 equip slots (weapon/consumable/key). EO has 1 active item + draw modifier. |

### 2.2 Critical Terminology Mismatch

The status bar and UI use confusing labels:

| UI Label | What it actually shows | What it SHOULD show | EyesOnly equivalent |
|---|---|---|---|
| `🃏 DECK 3/15` | hand.length / _deck.length (draw pile remaining) | hand.length / _collection.length (total owned) | "BACKUP DECK (5/25)" = backup count / max |
| `🎒 BAG 5/12` | bag.length / MAX_BAG | ✅ Correct | N/A (EO uses looseInventory differently) |
| DECK button | Opens Face 3 (SYSTEM) | Should open Face 2 (INVENTORY) | N/A |

### 2.3 The "Deck" Identity Crisis

DG has THREE related concepts that all get called "deck":

1. **`_collection`** — All cards the player owns (superset). Grows when player finds/buys cards.
2. **`_deck`** — The shuffled draw pile, built from `_collection`. Shrinks as cards are drawn.
3. **`_hand`** — Cards currently drawn and playable.

EyesOnly has a cleaner model:

1. **`backup`** — Capped pool of owned cards (max 25). Player manages this directly.
2. **`hand`** — Drawn cards (max 5). Drawn FROM backup.
3. **`vault`** — Long-term storage (max 20). Survives death. Cards transferred in/out manually.

**Decision needed**: Should DG adopt EyesOnly's backup/vault split, or keep collection/deck/hand? The current model works for combat draws but makes the "deck management" UI confusing because the player never directly manages `_collection` — they only see `_hand` and the scrollable deck wheel on Face 2.

**Recommended approach**: Keep DG's collection/deck/hand for combat mechanics, but rename the UI labels:
- Status bar: `🃏 HAND 3 · DECK 25` (hand count, then total collection)
- Face 2 deck wheel header: "COLLECTION (25 cards)" not "DECK"
- The draw pile is an internal mechanic, never shown to the player

---

## 3. CONFIRMED BUGS (from screenshot + code audit)

### BUG-1: DECK button opens SYSTEM menu (Face 3) instead of INVENTORY (Face 2)

**File**: `engine/status-bar.js`, line 145
**Current code**: `Game.requestPause('pause', 3);`
**Fix**: Change `3` → `2`
**Severity**: HIGH — player can't access deck management via the DECK button
**One-line fix**: Yes

### BUG-2: Deck quantity denominator shows draw pile, not total collection

**File**: `engine/status-bar.js`, lines 204-212
**Current code**:
```javascript
handSize = CardSystem.getHand().length;    // e.g. 3
deckSize = CardSystem.getDeckSize();        // draw pile remaining, e.g. 15
// Displays "🃏 DECK 3/15"
```
**Problem**: `getDeckSize()` returns `_deck.length` (remaining draw pile). After drawing 5 cards from a 20-card collection, it shows "5/15" instead of "5/20". The denominator should be total owned cards.
**Fix**: Use `CardSystem.getCollection().length` for denominator
**Alternative**: Show two numbers: `🃏 HAND 5 · DECK 20`
**Severity**: MEDIUM — misleading count, player thinks they're losing cards

### BUG-3: No card drag from hand fan to bag/deck

**File**: `engine/card-fan.js`
**Current behavior**: Card fan supports three pointer interactions:
1. Swipe-up-to-fire (combat) → `_handleSwipeFire()`
2. Drag-to-stack (combat, onto another card) → `_handleDragToStack()`
3. Reorder (drag within fan) → `_handleReorder()`

**Missing**: No drop zone outside the fan. Player cannot drag a card from the fan to the bag, deck, or incinerator. The fan is a closed system.
**EyesOnly equivalent**: `HandFanComponent` delegates drag to `CardDragController`, which manages a global drop zone registry. Ghost element follows cursor across all zones (hand-fan, backup-halo, vault, map, etc.).
**Fix required**: Either:
- (A) Extend CardFan to emit drag events that Face 2 drop zones can receive, OR
- (B) Build a CardDragController equivalent that owns cross-zone drag state

**Severity**: CRITICAL — inventory management is impossible without this

### BUG-4: Debrief feed displays redundant time that doesn't update

**File**: `engine/debrief-feed.js`
**Issue**: Time row in debrief feed is static/redundant with the weekly time indicator in the HUD.
**EyesOnly reference**: Debrief feed has NO time display. Only resource rows with block character bars.
**Fix**: Remove time row from debrief feed entirely.
**Severity**: LOW (cosmetic)

### BUG-5: Debrief feed contents illegibly small

**File**: `engine/debrief-feed.js`
**EyesOnly reference**: Uses container-query scaling: `font-size: clamp(8px, 12cqh, 56px)`. Block character bars (█▒░) with resource-colored text.
**Fix**: Adopt EyesOnly's `clamp()` font sizing and container-query-based scaling.
**Severity**: MEDIUM (usability)

### BUG-6: NPCs rendering as transparent outlines

**File**: Likely `engine/raycaster.js` or sprite rendering pipeline
**Issue**: NPC sprites show only their outline/overlay with a transparent body.
**Root cause**: TBD — needs raycaster sprite alpha investigation
**Severity**: HIGH (visual)

### BUG-7: Dispatcher interaction broken

**File**: `engine/interact-prompt.js` or NPC interaction handler
**Issue**: "ok to talk" prompt appears but clicking does nothing. No barks or dialogue print.
**Additional**: If an NPC has no barks/dialogue, the "ok to talk" prompt should not appear at all.
**Severity**: HIGH (blocks story progression)

### BUG-8: All non-HUD menus/panels too small

**Files**: `engine/menu-faces.js`, `engine/menu-box.js`
**Issue**: Pause menu, system menu, inventory, shop, bonfire — all render at tiny sizes relative to screen.
**Fix**: Scale MenuBox dimensions and Face renderers to fill more of the viewport.
**Severity**: HIGH (usability)

### BUG-9: No bonfire markers on exterior minimap

**File**: `engine/minimap.js`
**Issue**: Bonfire tiles not rendered distinctly on the minimap at exterior floors.
**Fix**: Add bonfire tile color/icon to minimap tile rendering.
**Severity**: LOW (QoL)

---

## 4. EYESONLY ARCHITECTURE REFERENCE

### 4.1 CardStateAuthority (CSA) — The Pattern DG Should Follow

**Single source of truth** for all card state. Three containers:

| Container | Max | Purpose |
|---|---|---|
| Hand | 5 | Active cards for play |
| Backup | 25 | Draw pool, player-managed |
| Vault | 20 | Persistent storage, survives death |

**Event system**: `hand:changed`, `backup:changed`, `vault:changed`, `draw:executed`, `draw:reset`, `draw:rejected`, `equipped:changed`, `transfer:rejected`

**Key methods for transfers**:
- `moveBackupToHand(backupIndex)` — draw specific card
- `moveHandToBackup(handIndex)` — return card to backup
- `moveHandToVault(handIndex)` — stash card permanently
- `moveVaultToHand(cardId, qty)` — retrieve from vault
- `cascadeBackupToHandTop()` — auto-draw with overflow handling
- `drawFromBackup(selectedIndex, mode)` — combat draw with turn limits
- `addCardWithOverflow(cardId, qty)` — loot pickup with cascade

**DG equivalent needed**: CardSystem already has `_hand`, `_collection`, `_deck`. It needs:
- A `MAX_COLLECTION` constant (recommend 25-30)
- Transfer methods: `moveCollectionToHand(index)`, `moveHandToCollection(index)`
- Event emission on state changes (or callback hooks Game.js can wire)
- Overflow cascade matching EyesOnly's pattern

### 4.2 CardTransferManager (CTM) — The Missing Piece

DG has NO equivalent. This is the #1 gap.

**What it does**: Orchestrates all cross-container transfers with validation. Provides:
- Drop zone registry: `{ element, id, accepts(drag), onDrop(drag, event) }`
- Factory methods for each zone type: `createHandFanDropHandlers()`, `createBackupDropHandlers()`, etc.
- Context filtering: combat vs exploration restrictions
- Ghost element management during drag

**DG currently handles this inline** in `menu-faces.js` lines 2326-2601 with `registerDragZones()` / `unregisterDragZones()`. The logic is tightly coupled to Face 2 rendering and rebuilds every frame.

**Fix plan**: Extract transfer logic from menu-faces.js into a new `engine/card-transfer.js` module (Layer 1), or keep inline but fix the actual transfer bugs.

### 4.3 NonCombatHUD (NCH) Three-Zone Expanded View

EyesOnly's deck management UI when expanded:

```
┌──────────────────────────────┐
│ EQUIPPED HAND      [item] [X]│  ← Zone 1: data-dropzone="hand"
│ [card][card][card][card][card]│
├──────────────────────────────┤
│ BACKUP DECK (5/25) [🔀][sort]│  ← Zone 2: data-dropzone="backup"
│ [scrollable card list]       │
├──────────────────────────────┤
│ CARD VAULT (3/20)            │  ← Zone 3: data-dropzone="vault"
│ [grid of vault cards]        │     "survives death · shared"
└──────────────────────────────┘
```

**Count format**: `BACKUP DECK (5/25)` — current count / max capacity.

**DG equivalent**: Face 2's `_renderInventory()` layout:

```
┌──────────────────────────────┐
│ EQUIPPED [⚔️][🧪][🔑]       │  ← 3 equip slots (EO has 1)
├──────────────────────────────┤
│ BAG ◀ [5 visible] ▶         │  ← Scrollable wheel (EO: no bag for cards)
├──────────────────────────────┤
│ HAND [card][card]...[card]   │  ← 5 card slots
├──────────────────────────────┤
│ DECK ◀ [5 visible] ▶        │  ← Scrollable wheel of collection
├──────────────────────────────┤
│ [🔥 Incinerator]  💰 50g    │  ← Destroy + currency
└──────────────────────────────┘
```

**Mapping**:
- EO Hand → DG Hand ✅
- EO Backup Deck → DG Deck Wheel (collection) ⚠️ (no max, no count display)
- EO Vault → DG Stash (only in bonfire context) ⚠️
- EO Equipped → DG Equipped ✅ (DG has 3 slots vs EO's 1)

### 4.4 CardDragController — The Drag System DG Needs

EyesOnly's unified pointer-based drag:
- **Drop zone registry**: Zones have `{ id, accepts, onDrop, contexts }`. Zone only active if current context matches.
- **Ghost element**: Clone at z-index 10000, follows cursor, scale 0.90, opacity 0.92
- **Hit testing**: `elementFromPoint()` with ghost hidden temporarily
- **Context filtering**: `['combat', 'exploration', 'nch-open', 'shop-open']`
- **Animations**: Ghost return-to-slot, placeholder collapse

DG's card-fan.js has pointer drag, but it's closed — no external drop zones. Face 2's drag zones use a separate `_dragZones[]` array with canvas-based hit testing (not DOM-based).

**Gap**: These two drag systems don't talk to each other. Card-fan drag cannot target Face 2 zones. Face 2 zones cannot receive from card-fan.

### 4.5 BackupActionContainer — Left Column Quick-Access

EyesOnly shows 6 slots in a left column:
- Slots 0-4: Top 5 cards from backup deck (or items, toggled)
- Slot 5: Mode toggle ("Cards →" / "← Items") or combat draw button ("DRAW x2")

**DG equivalent**: The status bar DECK button + Face 2 deck wheel. No left-column quick-access equivalent exists.

**Decision**: Skip this for jam. The DECK button → Face 2 deck wheel is sufficient for the April 5 deadline. Post-jam, consider a sidebar quick-access panel.

---

## 5. AGREED EXCEPTIONS FROM EYESONLY

These are deliberate differences, not bugs:

| # | DG Difference | Rationale |
|---|---|---|
| 1 | 3 equip slots (weapon/consumable/key) vs EO's 1 active item | DG's class system needs weapon + consumable + key slots |
| 2 | Bag holds items AND cards vs EO's items-only loose inventory | DG "card-in-bag" is a design feature (Joker Vault concept) |
| 3 | No left-column backup container | Jam scope — DECK button + Face 2 wheel is sufficient |
| 4 | No vault in non-bonfire context | DG stash only accessible at bonfires (intentional) |
| 5 | Canvas-based drag zones (not DOM) | DG renders inventory on canvas, not HTML. Different hit-testing required. |
| 6 | No container-query CSS | DG UI is canvas-rendered, not DOM. Scaling must be manual. |
| 7 | Collection uncapped (vs EO backup max 25) | TBD — may add MAX_COLLECTION=30 post-audit |

---

## 6. FIX PLAN — ORDERED BY PRIORITY

### Phase 1: One-Line Fixes (30 minutes)

**1a. DECK button → Face 2**
File: `engine/status-bar.js` line 145
Change: `Game.requestPause('pause', 3)` → `Game.requestPause('pause', 2)`

**1b. Deck quantity denominator**
File: `engine/status-bar.js` line 212
Change: `deckSize = CardSystem.getDeckSize()` → `deckSize = CardSystem.getCollection().length`
Display becomes: `🃏 DECK 3/25` (hand size / total owned)

**1c. Add getCollectionSize() to CardSystem public API**
File: `engine/card-system.js`
Add: `function getCollectionSize() { return _collection.length; }`
Expose in return block.

### Phase 2: Debrief Feed Fixes (1 hour)

**2a. Remove redundant time row**
**2b. Scale up resource rows** — adopt `clamp()`-style scaling based on container height
**2c. Match EyesOnly block character bar format** (█▒░ resource bars)

### Phase 3: Menu/Panel Scaling (1 hour)

**3a. Increase MenuBox viewport fill** — current render is too small
**3b. Scale Face 2 inventory slot sizes** — equip slots, bag wheel, hand slots, deck wheel
**3c. Increase font sizes across all menu faces**
**3d. Scale hit zones to match visual sizes**

### Phase 4: Cross-Zone Card Drag (2-3 hours) — CRITICAL

This is the make-or-break feature. Without it, the inventory is non-functional.

**4a. Extend CardFan pointer events to emit external drag**
When a card is dragged outside the fan bounds, transition from "reorder mode" to "transfer mode":
- Create ghost element (emoji + card name overlay)
- Track pointer position against Face 2 drag zones
- On release over a valid zone, execute transfer

**4b. Define transfer matrix** (what can go where):

| From → To | Hand | Bag | Deck (Collection) | Equipped | Stash | Incinerator |
|---|---|---|---|---|---|---|
| **Hand** | reorder | ✅ if card-in-bag allowed | ✅ always | ❌ cards don't equip | ✅ bonfire only | ✅ destroy |
| **Bag** | ❌ items stay in bag | reorder | ❌ items aren't cards | ✅ type-match | ✅ bonfire only | ✅ destroy |
| **Deck** | ✅ draw to hand | ✅ card-in-bag | reorder | ❌ | ✅ bonfire only | ✅ destroy |
| **Equipped** | ❌ | ✅ unequip→bag | ❌ | swap slots | ✅ bonfire only | ✅ destroy |
| **Stash** | ❌ | ✅ retrieve | ❌ | ✅ equip direct | N/A | ❌ stash is safe |

**4c. Implement transfer validation in CardSystem/Player**
Add methods:
- `CardSystem.moveToCollection(handIndex)` — return card from hand to collection
- `CardSystem.moveToHand(collectionIndex)` — draw specific card from collection to hand
- `Player.cardToBag(card)` — store card object in bag (card-in-bag)
- `Player.bagToHand(bagIndex)` — if item is a stored card, move to hand

**4d. Wire Face 2 drag zones to accept CardFan drag events**
The canvas-based hit testing in `_syncDragZoneBounds()` / `_hitDragZone()` must respond to pointer events originating from the card fan overlay.

### Phase 5: NPC + Sprite Fixes (1-2 hours)

**5a. NPC transparent rendering** — investigate sprite alpha pipeline
**5b. Dispatcher interaction** — trace engageTalk → DialogBox flow
**5c. Gate "ok to talk" on NPC having barks/dialogue**

### Phase 6: Minimap + Polish (30 minutes)

**6a. Bonfire markers on exterior minimap**
**6b. Any remaining visual polish**

---

## 7. TRANSFER VALIDATION RULES

Every transfer must check:

1. **Source exists**: Item/card at the specified index actually exists
2. **Target capacity**: Destination container is not full
3. **Type compatibility**: Cards go to card containers, items go to item containers (exception: card-in-bag)
4. **Equip type match**: Weapon→slot 0, consumable→slot 1, key→slot 2
5. **Context gate**: Stash transfers only at bonfire
6. **Combat gate**: No deck/bag transfers during combat (hand/equip only)

### Validation Error Responses

| Check Failed | UI Response |
|---|---|
| Target full | Toast: "Bag full — make room first" |
| Type mismatch | Toast: "Can't equip that here" |
| Wrong context | Toast: "Visit a bonfire to access stash" |
| Combat blocked | Toast: "Can't manage deck during combat" |
| Source empty | Silent fail (no-op) |

---

## 8. DECK QUANTITY DISPLAY — FINAL SPECIFICATION

### Status Bar (always visible)
Format: `🃏 DECK X/Y`
- X = `CardSystem.getHand().length` (cards in hand)
- Y = `CardSystem.getCollection().length` (total owned cards)
- Example: `🃏 DECK 3/25`

### Face 2 Deck Wheel Header
Format: `DECK (Y cards · Z in draw pile)`
- Y = total collection size
- Z = remaining draw pile
- Example: `DECK (25 cards · 17 in draw pile)`

### Face 2 Hand Section Header
Format: `HAND (X/5)`
- X = current hand size
- Example: `HAND (3/5)`

---

## 9. TEST HARNESS STATUS

### Current: `tests/inventory-test.html`

**What works**: Mock data, 7 drag zones (hand/deck/bag/equip/stash/shop/incinerator), basic HTML5 drag transfer logging, visual zone hover effects.

**What's broken/missing**:
- Uses HTML5 drag events (`dragstart`/`drop`) — DG game uses canvas + pointer events
- No CardSystem mock — hand operations don't go through the proxy
- No overflow cascade testing
- No combat context testing
- Transfer validation doesn't match actual game rules

**Recommended approach**: Don't delete — fix incrementally:
1. Add CardSystem mock with getHand/getCollection/getDeckSize
2. Add overflow cascade test (hand full → bump to collection)
3. Add capacity validation (bag full rejection)
4. Add type matching (equip slot validation)
5. Add a "game mode" toggle (combat/explore/bonfire) to test context gates

---

## 10. FILES THAT WILL BE MODIFIED

| File | Changes | Phase |
|---|---|---|
| `engine/status-bar.js` | DECK button → Face 2; deck quantity fix | 1 |
| `engine/card-system.js` | Add getCollectionSize(); possibly moveToCollection/moveToHand | 1, 4 |
| `engine/debrief-feed.js` | Remove time row; scale up | 2 |
| `engine/menu-box.js` | Increase viewport fill | 3 |
| `engine/menu-faces.js` | Scale slot sizes, font sizes, hit zones; fix drag zone wiring | 3, 4 |
| `engine/card-fan.js` | External drag emission; ghost element | 4 |
| `engine/player.js` | cardToBag/bagToHand transfer methods | 4 |
| `engine/interact-prompt.js` | Gate "ok to talk" on dialogue availability | 5 |
| `engine/raycaster.js` | NPC sprite alpha fix | 5 |
| `engine/minimap.js` | Bonfire tile rendering | 6 |
| `tests/inventory-test.html` | CardSystem mock; validation tests | 4 |

---

## 11. EYESONLY CODE TO PORT (verbatim or adapted)

### Must port (adapted for canvas/IIFE):
1. **CSA event pattern** → Add `onChange` callback array to CardSystem. Fire on hand/collection mutations.
2. **Transfer validation** → Port CTM's `accepts()` logic into a new `_canTransfer(from, to, item)` function.
3. **Overflow cascade** → Already partially implemented in `CardSystem.drawWithOverflow()`. Verify it matches EyesOnly's `addCardWithOverflow()`.
4. **Ghost element during drag** → Port CDC's ghost creation: fixed-position div, z-index 10000, scale 0.90, opacity 0.92.

### Skip for jam:
1. BackupActionContainer (left column 6-slot) — use DECK button instead
2. NCH porthole/capsule morph — no equivalent UI needed
3. DO NOT SKIP: Vault separate from stash — DG stash IS a new vault, inventory bag for items is a reduced carrying capacity version of stash vault which is lost on failstate
4. DO NOT SKIP: Reserve slots / STR combat draw system - We match eyesonly only difference is how turns resolve (eyesonly = timer expires per round , DG = player sends hand fan selection when they agressively throw on the cards or click a "commit turn" button)  
5. Lens system / coin cards / theme selector — EyesOnly-specific

---

## 12. CONSISTENCY CHECKLIST

Before marking inventory "done", every row must be ✅:

| # | Check | Status |
|---|---|---|
| 1 | DECK button opens Face 2 (Inventory) | ✅ Fixed (status-bar.js: 3→2) |
| 2 | DECK quantity shows hand/collection (not hand/drawPile) | ✅ Fixed (getCollection().length) |
| 3 | BAG quantity shows bag.length/MAX_BAG | ✅ Works |
| 4 | Cards can be dragged from hand fan to bag | ✅ Wired (external drop → bag zone) |
| 5 | Cards can be dragged from hand fan to deck (collection) | ✅ Wired (external drop → deck zone) |
| 6 | Cards can be dragged from deck wheel to hand | ⚠️ Click-to-draw exists; drag TBD |
| 7 | Items can be dragged from bag to equip slots | ⚠️ Works in Face 2 canvas drag |
| 8 | Items can be dragged from equip to bag | ⚠️ Works in Face 2 canvas drag |
| 9 | Overflow cascade: hand full → bump last card to collection | ✅ drawWithOverflow + events |
| 10 | Incinerator destroys cards from fan | ✅ Wired (external drop → incinerator) |
| 11 | Stash accessible only at interior bonfire (N.N) | ✅ _hasVaultAccess() depth check |
| 12 | Combat blocks external fan drag | ✅ _inCombat() guard on external drag |
| 13 | Equip slot type validation (weapon/consumable/key) | ❌ No type check in equipDirect |
| 14 | Face 2 slot sizes readable (not tiny) | ❌ Deferred to Phase 3 |
| 15 | Test harness passes all transfer scenarios | ❌ Needs update |
| 16 | CardSystem events fire on mutations | ✅ on/off/emit wired |
| 17 | MAX_COLLECTION=30 enforced | ✅ addCard() rejects at cap |
| 18 | Vault two-panel (bag↔stash) renders at bonfire | ✅ _renderBag() two-panel layout |
| 19 | failstateWipe() clears hand + collection | ✅ New method on CardSystem |

---

## 13. DECISION LOG

Decisions that need explicit agreement before implementation:

| # | Question | Proposed Answer | Agreed? |
|---|---|---|---|
| D1 | Cap collection at 30? | Yes — MAX_COLLECTION=30 with equipable items to expand the max, matches EyesOnly's 25 backup + margin | |
| D2 | Card-in-bag: keep this feature? | Yes — it's a design feature (Joker Vault). Cards stored in bag render with purple glow, immune from failstate while certain failstates empty the equipped hand and backup deck, equipped items. | |
| D3 | Rename "DECK" to "COLLECTION" in UI? | No — "DECK" is more intuitive for players. Internal var stays _collection. | |
| D4 | Port EyesOnly's event system to CardSystem? | Yes, lightweight: add _listeners array, fire('hand:changed') on mutations. | ✅ |
| D5 | Build standalone CardDragController module? | No for jam — extend card-fan.js + menu-faces.js inline. Post-jam: extract to module. | ✅ |
| D6 | 3 equip slots vs EyesOnly's 1? | Keep 3. DG class system needs weapon + consumable + key. | ✅ |
| D7 | Stash only at bonfires? | Yes — vault is a chest peek on bonfire-adjacent tiles. Peek opens bag rows + stash grid for drag-drop + keyboard. | ✅ |

---

## 14. AGREED CONTAINER HIERARCHY (post-review)

```
VULNERABLE TO FAILSTATE          SAFE FROM FAILSTATE
─────────────────────────        ────────────────────

Hand (5 cards)                   Bag card slots (Joker Vault)
  ↕ shallow pocket of              Cards stored in bag render
Backup Deck (30 cards max)          with purple glow — immune
  expandable via equip items        from failstate wipes

Bag (12 items+cards)             Vault / Stash (20 slots)
  ↕ items + Joker Vault cards      Bonfire-adjacent chest peek
Equipped (3 slots)                  Keyboard + drag-drop
  weapon / consumable / key         between bag rows and
                                    stash grid
```

### Failstate cascade
Certain failstates (death, curse, etc.) can empty:
- Equipped hand (cards)
- Backup deck (cards)
- Equipped items (3 slots)
- Bag items (NOT cards — Joker Vault protects them)

Vault/stash is always safe.

### Vault access flow
**NOT all bonfires have vault chests.** Only applicable floor N.N (interior) bonfires have stash chests. Waypoints in N.N.N dungeons and N exterior campgrounds do NOT have stash chests.

1. Player stands adjacent to bonfire tile with vault chest (interior floors only)
2. InteractPrompt shows "Open Vault" (or similar)
3. Confirmation opens a **peek overlay** (PeekSlots-style):
   - Left side: inventory bag rows (scrollable)
   - Right side: stash grid (20 slots)
   - Drag-drop between the two surfaces
   - Keyboard bindings for slot selection + transfer
4. Close peek to return to game

### Combat draw resolution (DG vs EyesOnly)
- **EyesOnly**: Timer expires per round, auto-resolves
- **DG**: Player manually sends hand fan selection — either aggressively throw cards or click "commit turn" button
- Reserve slots / backup draw system must still match EyesOnly's structure

---

*End of audit. Decisions D1-D7 agreed. Implementation begins with Phase 1.*
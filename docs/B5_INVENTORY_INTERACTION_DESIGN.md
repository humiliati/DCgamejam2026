# B5 — Inventory Interaction Design (Expanded Scope)

**Created**: 2026-03-29
**Updated**: 2026-04-01 (S0.3.9 audit complete, EyesOnly visual patterns documented)
**Cross-Roadmap**: Phase B, Task B5 (expanded from "Shop round-trip" to full inventory interaction audit)
**Depends on**: S0.4 MenuInventory (provides surface + drop zones), CardAuthority, CardTransfer, DragDrop, CrateSystem
**Design refs**: EyesOnly CARD_ZONE_AUDIT.md, HAND_FAN_AND_CARD_DEPLOYMENT.md, HAND_FAN_NONCOMBAT_AND_CARD_DEPLOYMENT.md
**EyesOnly refs**: commerce-drag-drop.css, card-disposal-system.js, nch-overlay.css (visual source of truth)

---

## Problem Statement

The game has 8 inventory zones but only 3 transfer pathways are implemented (bag↔equip, bag→shop sell, floor→bag). Late-game Gleaner play requires constant inventory shuffling: priming card hands for suit-matched encounters, depositing cards into corpse stock suit slots, buying restock supplies, disposing of junk to free bag space, and storing valuable cards through death-safe stash. The current click-only MenuBox system can't support the throughput or tactile feel this needs.

Every zone-to-zone transfer must be designed as a concerted, deliberate inventory management action — no stacking items, no auto-sort. The player is a dungeon janitor methodically preparing their loadout.

---

## Zone Map (8 Zones)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│  │  HAND    │    │  BACKUP  │    │   BAG    │    │  STASH   │       │
│  │ (5 max)  │◄──►│  DECK    │◄──►│ (12 max) │◄──►│ (20 max) │       │
│  │ CardRef  │    │ CardRef  │    │ ItemRef  │    │ ItemRef  │       │
│  │ NCH/Fan  │    │ Collection│   │ MenuBox  │    │ Bonfire  │       │
│  └──┬───┬───┘    └──────────┘    └──┬───┬───┘    └──────────┘       │
│     │   │                           │   │                             │
│     │   ▼                           │   ▼                             │
│     │ ┌──────────┐             ┌──────────┐    ┌──────────┐         │
│     │ │ CRATE    │             │ EQUIPPED │    │ DEBRIEF  │         │
│     │ │ SLOTS    │             │  (3 max) │    │  FEED    │         │
│     │ │ CrateUI  │             │ QuickBar │    │Incinerator│        │
│     │ └──────────┘             └──────────┘    └──────────┘         │
│     │                                                                 │
│     ▼                                                                 │
│  ┌──────────┐    ┌──────────┐                                        │
│  │ CORPSE   │    │  SHOP    │                                        │
│  │ SUIT SLOT│    │ (5 cards)│                                        │
│  │ CrateUI  │    │ Faction  │                                        │
│  └──────────┘    └──────────┘                                        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Zone Definitions

| Zone | Container | Max | Survives Death | UI Location |
|------|-----------|-----|----------------|-------------|
| **HAND** | CardRef[] | 5 | NO | NCH Widget (explore), CardFan (combat) |
| **BACKUP DECK** | CardRef[] (collection) | unlimited | YES (collection) | MenuBox face, NCH badge |
| **BAG** | ItemRef[] | 12 | NO | MenuBox face |
| **STASH** | ItemRef[] | 20 | YES | MenuBox face (bonfire only) |
| **EQUIPPED** | [weapon, consumable, key] | 3 | NO | QuickBar overlay |
| **CRATE SLOTS** | CrateSystem slots | per crate | N/A (floor state) | CrateUI overlay |
| **CORPSE SUIT SLOT** | CrateSystem slot (SUIT_CARD) | 1 per corpse | N/A | CrateUI overlay |
| **SHOP** | Card inventory | 5 | N/A | MenuBox face |
| **DEBRIEF FEED** | Disposal sink | N/A | N/A | DebriefFeed panel |

---

## Transfer Matrix

Every legal zone-to-zone transfer. Transfers not listed are NOT allowed.

### Card Transfers

| From | To | When | Method | Cost | Notes |
|------|----|------|--------|------|-------|
| **HAND → BACKUP** | Anytime (not combat) | Drag card to NCH deck badge | Free | Removes from active hand, returns to collection |
| **BACKUP → HAND** | Anytime (not combat) | Drag from backup list to hand | Free | Fails if hand full (5) |
| **HAND → CORPSE SUIT SLOT** | Facing corpse + CrateUI open | Press slot number key | Sacrifices card | Must match corpse suit (♠♣♦♥) |
| **HAND → DEBRIEF (dispose)** | Anytime (not combat) | Drag card to debrief feed | Permanent destroy | Yields small coin refund (10% base value) |
| **BACKUP → DEBRIEF (dispose)** | MenuBox open | Drag card to debrief panel | Permanent destroy | Yields small coin refund |
| **SHOP → BACKUP** | Shop MenuBox face | Click buy | Costs gold | Adds to collection, auto-deals if hand < 5 |
| **BACKUP → SHOP (sell)** | Shop MenuBox face | Drag card to sell zone | Yields gold (40% base) | Removes from collection |
| **FLOOR PICKUP → HAND** | Walk over card drop | Auto | Free | If hand full → overflow to backup deck |
| **FLOOR PICKUP → BACKUP** | Walk over (hand full) | Auto overflow | Free | Toast: "deck +1" |

### Item Transfers

| From | To | When | Method | Cost | Notes |
|------|----|------|--------|------|-------|
| **BAG → EQUIPPED** | MenuBox open | Click item or drag to slot | Free | Swaps if slot occupied |
| **EQUIPPED → BAG** | MenuBox open | Click equipped slot | Free | Fails if bag full |
| **BAG → STASH** | Bonfire MenuBox | Click/drag item to stash panel | Free | Fails if stash full |
| **STASH → BAG** | Bonfire MenuBox | Click/drag item from stash | Free | Fails if bag full |
| **BAG → CRATE SLOT** | CrateUI open | Press slot number key | Consumes item | Frame match = bonus coins |
| **BAG → SHOP (sell salvage)** | Shop MenuBox face | Drag/click sell | Yields gold + rep | Faction price multiplier applies |
| **BAG → DEBRIEF (dispose)** | Anytime | Drag item to debrief feed | Permanent destroy | Yields small scrap value or nothing |
| **FLOOR PICKUP → BAG** | Walk over item | Auto | Free | If bag full → bounce prompt |
| **EQUIPPED → DEBRIEF (dispose)** | MenuBox open | Drag equipped to debrief | Permanent destroy | Unequips + destroys |

---

## EyesOnly Visual Reference (Source of Truth)

DG's menu inventory must match Gone Rogue's NCH overlay interaction feel. The following
patterns from EyesOnly are canonical — we port the visual language, adapted for DG's
canvas-overlay hybrid rendering.

### Ghost Cursor (card-disposal-system.js)

Touch drag creates a floating emoji ghost at the finger/pointer position:
- 12px movement threshold before ghost appears (prevents accidental drags on tap)
- Ghost: `position:fixed; z-index:999999; pointer-events:none; font-size:2.2em; opacity:0.85`
- Drop shadow: `filter:drop-shadow(0 0 8px rgba(255,120,0,0.6))`
- Smooth follow: `transition:transform 80ms ease`
- Source element gets `.card-dragging` class (opacity:0.5, scale:0.95)
- On release: ghost removed, source class cleaned, drop zone hit-tested via bounding rect

DG adaptation: DragDrop.js already has pointer capture + zone hit-testing. Add ghost
element creation to `DragDrop.startDrag()` using same CSS. Canvas items need a DOM
ghost overlay since canvas elements aren't draggable.

### Drop Zone Highlighting (commerce-drag-drop.css)

Each zone type has a context-dependent visual state when a drag hovers over it:

| Context | CSS Class | Border | Glow | Icon | Animation |
|---------|-----------|--------|------|------|-----------|
| Buying | `context-buying` | 2px solid #FFD700 | gold 20px | 💰 48px | money-bob (1.5s bounce) |
| Selling/Incinerator | `context-selling` | 2px solid #FF6B35 | orange 20px | 🔥 48px | fire-flicker (0.3s) |
| Disposing | `context-disposing` | 2px solid rgba(255,107,53,0.45) | orange 14px | ♻️ 42px | recycle-bob (1.2s) |
| Disabled (combat) | `context-disabled` | 1px dashed #606060 | none | ⛔ 36px | none, opacity:0.6 |

Applicable drop zones: `drop-zone-active` with `gentle-pulse` animation (1.5s opacity oscillation).
Each target type gets its own highlight color: bag=purple, equip=orange, hand=green, debrief=red/orange.

DG adaptation: These map directly to CSS classes on overlay DOM elements positioned
above the canvas. MenuInventory renders grids on canvas but each zone has a transparent
DOM overlay div registered with DragDrop for hit-testing + CSS feedback.

### Incinerator Tease → Burn Sequence (card-disposal-system.js + commerce-drag-drop.css)

Two-phase visual feedback:

**Phase 1 — Hover tease**: While dragging over debrief feed, `context-selling` class applied.
Orange gradient background, 🔥 emoji at 48px with fire-flicker keyframes (0.3s infinite,
hue-rotate oscillation ±10deg, opacity 0.4–0.7). "DROP TO SELL" label at bottom in
monospace. The fire-flicker is the "tease" — it signals danger without committing.

**Phase 2 — Burn commit**: On drop, `incinerator-active` class triggers `incinerator-burn`
keyframes (0.6s ease-out): orange→deep red→orange→transparent with 1.08 scale pulse.
Simultaneously: `AudioSystem.play('rumble-1', { volume: 0.4 })` for the bass rumble SFX.
After 400ms timeout, `incinerator-active` class removed.

DG adaptation: DebriefFeed panel is already a DOM element. Wire as DragDrop zone.
On hover: apply `context-disposing` (we use disposing, not selling — DG disposal is
permanent destruction, not a sale). On drop: apply `incinerator-active` + rumble SFX.
We already have `AudioSystem.play()` and `ParticleFX` — add a `ParticleFX.incinerateBurst()`
for ember particles rising from the debrief panel on commit.

### Combat Lock (card-disposal-system.js)

Gone Rogue checks `GoneRogue.isStrCombatActive()` to change debrief behavior in combat.
During STR combat: debrief becomes discard-to-backup (not destroy), self-cast cards get
a separate green glow path.

DG's combat lock is stricter: during combat, the entire menu inventory is read-only.
Player enters pause menu during combat → all zones render with `context-disabled` styling
(dashed border, ⛔ icon, 0.6 opacity). The ONLY allowed interaction is hand card sorting
within the CardFan (drag to reorder). No bag access, no equip changes, no disposal.
Rationale: combat uses 1+itemN card draw after each attack — allowing menu access to
draw cards would break the combat economy.

Gate: `CombatBridge.isInCombat()` — checked by MenuInventory on open AND by DragDrop
zone `accepts()` callbacks.

---

## Debrief Feed as Incinerator

The Debrief Feed (existing right-side scrolling log) doubles as a disposal/incinerator drop zone.
Visual treatment matches EyesOnly `commerce-drag-drop.css` patterns described above.

### Disposal Mechanics
- Drag any card or item over the debrief feed panel → Phase 1 tease (fire-flicker + orange glow)
- Release → Phase 2 burn (incinerator-burn 0.6s + rumble-1 SFX + ember particles)
- On burn: item destroyed permanently via CardTransfer, small coin refund for cards (10% rarity base), nothing for junk items
- Disposed items log to debrief feed as: `"🔥 Disposed: [emoji] [name]"`
- Savage shortcut: hold Shift + click item in any zone = instant dispose (no drag needed, skips tease)

### Auto-Dispose on Pickup Overflow
When a new card is picked up and hand is full:
1. Card auto-goes to backup deck (collection)
2. If backup deck exceeds soft cap (25 cards): Toast warning "Deck overflow — consider disposing"
3. No auto-dispose — player always chooses what to cut

### Death Drops vs Stash
On death (Player.onDeath() → CardAuthority.failstateWipe()):
- HAND cards lost (Tier 1 vulnerable)
- BAG items lost (Tier 1 vulnerable)
- EQUIPPED items lost (Tier 1 vulnerable)
- STASH survives intact (Tier 3 death-safe)
- BACKUP DECK (collection) survives intact (Tier 3 death-safe)
- Joker Vault tagged cards in bag survive (special Tier 3 tag)

---

## Interaction Modes by Context

### 1. Exploration (Walking Around)
- **NCH Widget visible**: shows joker stack, bag/deck badges
- **Click NCH**: toggles CardFan overlay (non-combat fan)
- **Drag from CardFan**: reorder cards in hand, or drag to debrief to dispose
- **Quick-bar clicks**: use consumable, show weapon stats

### 2. Pause Menu (MenuBox Open)
- **Face 0: Inventory**: bag grid (12 slots) + equipped row (3 slots)
  - Click bag item → equip to matching slot (or swap)
  - Click equipped → unequip to bag
  - Drag item → debrief feed to dispose
- **Face 1: Deck**: backup deck grid + hand preview
  - Click backup card → move to hand (if space)
  - Click hand card → return to backup
  - Drag card → debrief to dispose
- **Face 2: (context)**: bonfire stash / shop / crate slots
  - Bonfire: bag↔stash transfers
  - Shop: buy cards, sell salvage/cards
  - Crate/Corpse: slot fill interface (delegates to CrateUI)

### 3. Crate/Corpse Interaction (CrateUI Open)
- Number keys 1-5: fill slots sequentially
  - Resource slots: pulls first bag item
  - Suit card slot: searches hand for matching suit card
- S key: seal container when all slots filled
- ESC: close CrateUI
- Future: drag from bag/hand directly to slot boxes

### 4. Combat (CardFan Active)
- All inventory transfers LOCKED — menu zones render `context-disabled`
  - Card sorting within hand (drag to reorder) is the ONLY allowed interaction
  - Card fire (swipe-drop pairing for synergies) happens in the combat UI, not the menu
  - No bag access, no equip changes, no disposal, no deck draws from menu
  - QuickBar consumable use still allowed (slot 1 — does not go through menu)
  - Rationale: combat draws 1+itemN cards per attack; menu draw access breaks economy

### 5. Shop (MenuBox Shop Face)
- Browse 5 faction cards, click to buy
- Drag bag items to sell zone for gold + rep
- Drag backup cards to sell zone for gold (40% base)
- No direct hand→shop (must go hand→backup→sell)

---

## S0.4 → B5 Dependency Chain

S0.4 builds the MenuInventory surface and combat lock. B5 wires all the interaction
pathways on top of it. B5 is scheduled for the jam after mechanics prototyping.

**S0.4 delivers (before B5 can start):**
- S0.4a: `inventory-drag.css` — ghost cursor, zone glow, incinerator tease/burn, combat-disabled CSS
- S0.4b: `menu-inventory.js` — new IIFE replacing menu-faces.js Face 2, canvas grids + DOM overlay zones
- S0.4c: Incinerator drop zone wired to DebriefFeed panel
- S0.4d: Combat lock gate (`CombatBridge.isInCombat()` disables all menu interactions)

**B5 builds on S0.4:**
- B5.1–B5.7 wire zone-to-zone transfers using the surface S0.4 provides
- B5.8 test launcher validates the whole system end-to-end

---

## Implementation Phases (B5 Breakdown)

All phases assume S0.4 is complete (MenuInventory surface exists, DragDrop ghost cursor
works, incinerator CSS is ported, combat lock gate is in place).

### B5.1 — Wire All DragDrop Zones (2h)
Register every zone with DragDrop using CardTransfer for validation:
- Bag slots (12): accepts items from equipped/stash/floor, drag-out to equip/stash/debrief
- Equipped slots (3): accepts items from bag, drag-out to bag/debrief
- Deck grid: accepts cards from hand, drag-out to hand/debrief
- Hand preview (5): accepts cards from deck, drag-out to deck/debrief/corpse-suit-slot
- Stash panel (bonfire only, 20): accepts items from bag, drag-out to bag
- Each zone's `accepts()` callback checks CardTransfer context gates

### B5.2 — Debrief Incinerator Wiring (1h)
Wire the incinerator drop zone that S0.4c created:
- Card disposal: `CardTransfer.disposeCard(cardId)` → 10% rarity base coin refund via `CardTransfer.lootGold()`
- Item disposal: `CardAuthority.removeFromBagById(id)` → 0 coin refund (junk)
- Equipped disposal: `CardTransfer.equipToBag()` first → then destroy from bag
- Shift+click shortcut: bypass drag, instant dispose with same burn animation
- Key item guard: `item.equipSlot === 'key'` → reject with shake animation

### B5.3 — Inventory Face Interaction Polish (2h)
Wire click and drag interactions on the S0.4b MenuInventory surface:
- Click bag item → `CardTransfer.bagToEquip(index, slotIndex)` (auto-match slot type)
- Click equipped → `CardTransfer.equipToBag(slotIndex)` (swap if bag has matching)
- Drag bag item to equipped slot → validate slot match, swap if occupied
- Drag equipped to bag → unequip
- Bonfire context: show stash panel, enable bag↔stash transfers
- All transfers fire CardAuthority events → MenuInventory re-renders reactively

### B5.4 — Deck Management Interactions (1.5h)
Wire click and drag on the deck grid / hand preview:
- Click backup card → `CardTransfer.backupToHand(cardId)` (fails if hand full)
- Click hand card → `CardTransfer.handToBackup(index)` (returns to collection)
- Drag backup card to hand slot → same as click but with ghost + zone glow
- Sort buttons: by suit, by rarity, by cost (reads from CardAuthority, re-renders grid)
- Deck count badge updates via `CardAuthority.on('backup:changed', ...)`

### B5.5 — Shop Round-Trip Polish (1.5h)
Extend shop MenuBox face:
- Drag bag items to sell zone → `CardTransfer.sellFromBagById(id, price)` + coin VFX
- Drag backup cards to sell zone → `CardTransfer.sellFromBackup(cardId, price)` + coin VFX
- Visual sell price preview on hover (faction multiplier applied)
- Rep tier progress bar (reads Salvage.getRepTier())
- Restock supplies: shop stocks frame-appropriate items by biome + rep tier

### B5.6 — CrateUI Drag Integration (1h)
Extend CrateUI (already has PeekSlots DragDrop wiring from S0.3):
- Validate: S0.3 drag path works via PeekSlots onDrop → CardAuthority
- Validate: S0.3.9 number-key path works via CrateUI._fillFromBag → CardAuthority
- Add visual: compatible slots highlight with `drop-zone-active` when drag hovers
- Add visual: incompatible slots dim with context-disabled when drag hovers

### B5.7 — NCH Card Shuttle (1h)
Extend NCH Widget:
- Drag card from CardFan → NCH deck badge = `CardTransfer.handToBackup(index)`
- Drag from NCH → open space = `CardTransfer.backupToHand(cardId)`
- Badge updates via `CardAuthority.on('hand:changed')` + `CardAuthority.on('backup:changed')`

### B5.8 — Test Launcher (2h)
New `tests/inventory-test.html`:
- Standalone page that loads all Layer 0-2 engine modules via script tags
- Pre-populates via CardAuthority: 5 cards in hand, 3 in backup, 8 items in bag, 3 equipped, 4 in stash
- Mock CrateSystem container at (5,5), mock corpse at (7,7) with ♠ suit slot
- Mock shop with 5 faction cards
- Visual zone layout matching the zone map diagram
- Drag between all zones, verify CardTransfer validates and CardAuthority state updates
- Console log of every zone-to-zone transfer with before/after state
- Agent-testable: `data-testid` attributes on all zones, `window.__transferLog[]`, `window.__inventoryState()`

---

## Test Launcher Specification

```
tests/inventory-test.html
├── Loads: all Layer 0-3 engine modules via <script> tags
│   (card-authority, card-transfer, drag-drop, menu-inventory, debrief-feed)
├── Mock data (seeded via CardAuthority):
│   ├── 5 starter cards (ACT-001 through ACT-005) in hand
│   ├── 3 cards in backup deck (ACT-006, ACT-007, ACT-008)
│   ├── 8 items in bag (2 food, 2 battery, 2 salvage, 1 weapon, 1 key)
│   ├── 1 equipped weapon, 1 equipped consumable
│   ├── 4 items in stash
│   ├── Mock crate at (5,5) with 3 slots (1 filled, 2 empty)
│   ├── Mock corpse at (7,7) with 2 resource slots + 1 ♠ suit card slot
│   └── Mock shop with 5 faction cards
├── Layout:
│   ├── Left panel: Hand (5 cards) + Backup deck grid
│   ├── Center panel: Bag (4×3 grid) + Equipped (3 slots)
│   ├── Right panel: Debrief feed (incinerator)
│   ├── Bottom left: Crate slots + Corpse slots
│   ├── Bottom right: Shop cards + sell zone
│   └── Top: Stash panel (bonfire context toggle)
├── Interactions:
│   ├── Drag-drop between all zones (ghost cursor, zone glow)
│   ├── Click fallbacks for every transfer
│   ├── Incinerator: tease on hover, burn on drop, rumble SFX
│   ├── Combat lock toggle button (simulates CombatBridge.isInCombat)
│   └── Console transfer log
└── Agent testing:
    ├── All zones have data-testid attributes
    ├── Transfer log exposed as window.__transferLog[]
    └── State snapshot: window.__inventoryState()
```

---

## Total Estimate

| Sub-task | Hours | Timing | Prereq |
|----------|-------|--------|--------|
| B5.1 Wire all DragDrop zones | 2h | JAM (first) | S0.4a+b |
| B5.2 Debrief incinerator wiring | 1h | JAM | S0.4c |
| B5.3 Inventory face interaction polish | 2h | JAM | B5.1 |
| B5.4 Deck management interactions | 1.5h | JAM | B5.1 |
| B5.5 Shop round-trip polish | 1.5h | JAM | B5.1 |
| B5.6 CrateUI drag integration | 1h | JAM (validate only) | S0.3.9 ✓ |
| B5.7 NCH card shuttle | 1h | POLISH | B5.4 |
| B5.8 Test launcher | 2h | JAM (early) | S0.4 |

**JAM total**: ~11h (B5.1–B5.6 + B5.8)
**Full total**: ~12h

---

## Card Suit Field Availability

Cards in `data/cards.json` carry a `suit` field: `"spade"`, `"club"`, `"diamond"`, `"heart"`.
This is the field checked by CrateSystem `fillSlot()` when validating suit card slot deposits.
Players must sacrifice a card matching the corpse's suit to enable reanimation — a deliberate deck-management tradeoff.

---

## Anti-Patterns (DO NOT)

- **DO NOT** auto-stack items in bag (each item is individual, no quantity merge)
- **DO NOT** auto-sort inventory (player arranges deliberately)
- **DO NOT** allow transfers during combat (except hand card sorting within CardFan)
  - Combat uses 1+itemN card draw after each attack. Menu access to draw cards breaks economy.
  - All menu zones render with `context-disabled` (⛔, dashed border, 0.6 opacity)
  - Gate: `CombatBridge.isInCombat()` checked at zone `accepts()` AND MenuInventory open
- **DO NOT** allow re-opening sealed crates (CrateSystem.sealed is permanent)
- **DO NOT** dispose of key items (`equipSlot === 'key'` → reject with shake animation)
- **DO NOT** auto-dispose backup deck cards on pickup overflow
- **DO NOT** bypass disposal confirmation (except Shift+click shortcut)
- **DO NOT** use Player.addCurrency/removeFromBag/removeFromHand directly — all transfers through CardTransfer/CardAuthority (S0.3.9 uniformity audit enforced this)
- **DO NOT** duplicate the incinerator icon in the menu — the HUD's debrief panel IS the incinerator (no redundant menu button)

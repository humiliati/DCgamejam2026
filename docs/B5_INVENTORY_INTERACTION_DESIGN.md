# B5 — Inventory Interaction Design (Expanded Scope)

**Created**: 2026-03-29
**Cross-Roadmap**: Phase B, Task B5 (expanded from "Shop round-trip" to full inventory interaction audit)
**Depends on**: B1–B4b (crate/corpse slot system), CardSystem, Player, CardFan, NCH Widget, Shop, MenuBox
**Design refs**: EyesOnly CARD_ZONE_AUDIT.md, HAND_FAN_AND_CARD_DEPLOYMENT.md, HAND_FAN_NONCOMBAT_AND_CARD_DEPLOYMENT.md

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

## Debrief Feed as Incinerator

The Debrief Feed (existing right-side scrolling log) doubles as a disposal/incinerator drop zone:

### Disposal Mechanics
- Drag any card or item over the debrief feed panel → visual "burn" affordance (orange glow, 🔥 emoji pulse)
- Release → confirmation prompt: "Dispose of [item]? (Y/N)"
- On confirm: item destroyed permanently, small coin refund for cards (10% rarity base), nothing for junk items
- Disposed items log to debrief feed as: `"🔥 Disposed: [emoji] [name]"`
- Savage shortcut: hold Shift + click item in any zone = instant dispose (no drag needed)

### Auto-Dispose on Pickup Overflow
When a new card is picked up and hand is full:
1. Card auto-goes to backup deck (collection)
2. If backup deck exceeds soft cap (25 cards): Toast warning "Deck overflow — consider disposing"
3. No auto-dispose — player always chooses what to cut

### Death Drops vs Stash
On death (Player.onDeath()):
- HAND cards scattered as floor pickups (recoverable next run)
- BAG items scattered as floor pickups
- EQUIPPED items scattered
- STASH survives intact (death-safe)
- BACKUP DECK (collection) survives intact

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
- All inventory transfers LOCKED except:
  - Card selection/stacking within hand
  - Card fire (swipe up or stack commit)
  - No bag access, no equip changes, no disposal
  - QuickBar consumable use still allowed (slot 1)

### 5. Shop (MenuBox Shop Face)
- Browse 5 faction cards, click to buy
- Drag bag items to sell zone for gold + rep
- Drag backup cards to sell zone for gold (40% base)
- No direct hand→shop (must go hand→backup→sell)

---

## Implementation Phases (B5 Breakdown)

### B5.1 — Drag-Drop Infrastructure (3h)
New `engine/drag-drop.js` (Layer 2): unified pointer-based drag system.
- Ghost element rendering (card or item emoji at pointer)
- Drop zone registration (debrief feed, equip slots, crate slots, sell zone, etc.)
- Hit testing against registered zones
- Accept/reject feedback (green glow vs red shake)
- Long-press detection for mobile (300ms threshold)
- Used by: CardFan, MenuBox faces, CrateUI, NCH Widget

### B5.2 — Debrief Incinerator Zone (1.5h)
Extend `engine/debrief-feed.js`:
- Register as drag-drop target zone
- Burn affordance animation (glow + 🔥)
- Dispose confirmation prompt
- Coin refund logic (cards = 10% rarity base, items = 0)
- Shift+click shortcut for instant dispose

### B5.3 — MenuBox Inventory Face Rebuild (3h)
Rewrite `engine/menu-faces.js` inventory face:
- Bag grid (4×3 = 12 slots) with drag-out support
- Equipped row (3 slots) with drag-in/out
- Visual: item emoji + rarity border color + quantity badge
- Drag to equip slot = equip, drag out = unequip
- Drag to debrief = dispose
- Context switching: bonfire shows stash panel alongside bag

### B5.4 — Deck Management Face (2h)
New MenuBox face for backup deck:
- Scrollable card grid showing collection
- Hand preview row (5 slots) above
- Click to shuttle cards between backup ↔ hand
- Drag to debrief to dispose
- Sort buttons: by suit, by rarity, by cost

### B5.5 — Shop Round-Trip Polish (1.5h)
Extend shop MenuBox face:
- Drag-to-sell zone (bag items + backup cards)
- Visual sell price preview on hover
- Rep tier progress bar
- "Buy restock supplies" — shop stocks frame-appropriate items
  (hp_food items when Cellar rep tier ≥ 1, etc.)

### B5.6 — CrateUI Drag Integration (1h)
Extend CrateUI:
- Register slot boxes as drag-drop targets
- Drag from bag → resource slot (instead of number keys only)
- Drag from hand → suit card slot
- Visual: slot highlights when compatible drag hovers

### B5.7 — NCH Card Shuttle (1h)
Extend NCH Widget:
- Drag card from CardFan → NCH deck badge = return to backup
- Drag from NCH → open space = deal to hand
- Badge updates on every transfer

### B5.8 — Test Launcher (2h)
New `tests/inventory-test.html`:
- Standalone page that loads all engine modules
- Pre-populates: 5 cards in hand, 8 items in bag, 3 equipped, mock shop, mock crate
- Visual zone layout matching the zone map diagram above
- Drag between all zones, verify transfers
- Console log of every zone-to-zone transfer with before/after state
- Agent-testable: can be driven by Kapture/Chrome automation

---

## Test Launcher Specification

```
tests/inventory-test.html
├── Loads: all Layer 0-2 engine modules via <script> tags
├── Mock data:
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
│   ├── Drag-drop between all zones
│   ├── Click fallbacks for every transfer
│   ├── Visual feedback (ghost, glow, shake)
│   └── Console transfer log
└── Agent testing:
    ├── All zones have data-testid attributes
    ├── Transfer log exposed as window.__transferLog[]
    └── State snapshot: window.__inventoryState()
```

---

## Total Estimate

| Sub-task | Hours | Priority |
|----------|-------|----------|
| B5.1 Drag-drop infrastructure | 3h | JAM (needed for all interactions) |
| B5.2 Debrief incinerator | 1.5h | JAM (disposal is core loop) |
| B5.3 Inventory face rebuild | 3h | JAM (bag management is core) |
| B5.4 Deck management face | 2h | JAM (card shuffling is core) |
| B5.5 Shop round-trip | 1.5h | JAM (economy loop) |
| B5.6 CrateUI drag integration | 1h | POLISH (number keys work for jam) |
| B5.7 NCH card shuttle | 1h | POLISH (click fallback works) |
| B5.8 Test launcher | 2h | JAM (enables agent testing) |

**JAM total**: ~12h (B5.1–B5.5 + B5.8)
**Full total**: ~15h

---

## Card Suit Field Availability

Cards in `data/cards.json` carry a `suit` field: `"spade"`, `"club"`, `"diamond"`, `"heart"`.
This is the field checked by CrateSystem `fillSlot()` when validating suit card slot deposits.
Players must sacrifice a card matching the corpse's suit to enable reanimation — a deliberate deck-management tradeoff.

---

## Anti-Patterns (DO NOT)

- **DO NOT** auto-stack items in bag (each item is individual, no quantity merge)
- **DO NOT** auto-sort inventory (player arranges deliberately)
- **DO NOT** allow transfers during combat (except consumable use)
- **DO NOT** allow re-opening sealed crates
- **DO NOT** dispose of key items (gated check in disposal confirm)
- **DO NOT** auto-dispose backup deck cards on pickup overflow
- **DO NOT** bypass disposal confirmation (except Shift+click shortcut)

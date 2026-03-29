# B6 — Slot Wheel & Transaction Layout Design

**Created**: 2026-03-29
**Cross-Roadmap**: Phase B, Task B6 (slot wheel scroll containers + unified transaction tableaux)
**Depends on**: B5 (inventory interaction + DragDrop), CrateUI, PeekSlots, NchWidget, MenuFaces, QuickBar
**Design refs**: EyesOnly games.html scroll inventory, EyesOnly reserve-slots.js cycle pattern, EyesOnly backup-action-container.js card-in-vault joker rendering

---

## Problem Statement

Number keys 1-5 map to a 5-slot visible window, but the player's bag holds 12 items and the backup deck is unlimited. There's no way to reach items beyond position 5 during slot-filling, shop selling, or any quick-access context. The pause-menu inventory face (MenuFaces face 2) renders the full 4×3 bag grid and 5-card hand, but that's only accessible in the pause screen — not during gameplay transactions like crate restocking or shop browsing.

We need a **SlotWheel** component: a 5-visible-at-a-time scroll container that can be instantiated for bag contents and deck contents independently. Keys 1-5 always fire against whatever's visible in the wheel window. Scrolling (mouse wheel, LG Magic Remote scroll, Q/E shoulder keys) advances the window to reveal concealed items. The wheel collapses when empty regions trail the visible set, and expands as new items scroll into view.

Additionally, cards can be stored in the item bag (gone-rogue card vault pattern). When a CardRef lives in the bag instead of the hand/deck, it renders with a 🃏 joker emoji to distinguish it from ItemRefs. Cards in the bag cannot be equipped to QuickBar slots but CAN be dragged/keyed into corpse suit slots or sold at shops.

---

## SlotWheel Component

### Visual Model

```
         ┌─ scroll indicator (left)
         │
    ◀  [1][2][3][4][5]  ▶
    │                     │
    │   5 visible slots   │
    │   numbered 1-5      │
    └─ scroll indicator (right)

    Underlying data: [ item0, item1, item2, item3, item4, item5, ... itemN ]
                       ▲─────────────────────────▲
                       _offset                    _offset + 4
```

### Behaviour

- **Fixed 5-slot viewport** over a variable-length array
- **`_offset`** tracks the first visible index (0-based)
- Keys 1-5 always address `data[_offset + 0]` through `data[_offset + 4]`
- **Scroll left**: `_offset = max(0, _offset - 1)` — reveals earlier items
- **Scroll right**: `_offset = min(data.length - 5, _offset + 1)` — reveals later items
- **Clamp**: If `data.length <= 5`, offset stays 0 and no scroll indicators render
- **Empty trailing slots**: If `_offset + 5 > data.length`, the rightmost slots render as dim empty placeholders (no slot number label, just the frame)
- **Scroll indicators**: Left chevron `◀` visible when `_offset > 0`, right chevron `▶` visible when `_offset + 5 < data.length`. Both chevrons are clickable/tappable for Magic Remote.

### Scroll Input

| Input | Context | Action |
|-------|---------|--------|
| Mouse wheel up/left | Wheel focused | Scroll left (offset - 1) |
| Mouse wheel down/right | Wheel focused | Scroll right (offset + 1) |
| Q key | Transaction active | Scroll left |
| E key | Transaction active | Scroll right |
| Click left chevron | Always | Scroll left |
| Click right chevron | Always | Scroll right |
| LG Magic Remote scroll | Wheel focused | Same as mouse wheel |
| Drag near edge | During DragDrop | Auto-scroll (EyesOnly EDGE_ZONE pattern, 50px threshold) |

### Rendering

Canvas-based (matches CrateUI). Each slot is a 48×48 box with 8px gap:

```
┌──────────────────────────────────────────────────┐
│ ◀  [ 🧪 ][ 🗡️ ][ 🃏 ][ 📦 ][    ]  ▶   bag 7/12 │
│     1      2      3      4     5                  │
└──────────────────────────────────────────────────┘
```

- **Occupied slot**: Item/card emoji centred, slot number below, full-brightness border
- **Empty slot**: Dim frame, no number label, 30% alpha interior
- **Joker card in bag**: 🃏 emoji with a subtle purple inner glow to signal "this is a card, not an item"
- **Selected slot** (keyboard hover): Gold border highlight, slot number brightens
- **Count badge**: Right-aligned `"bag 7/12"` or `"deck 23"` — always visible

### Data Sources

| Wheel ID | Data Source | Max | Contains |
|----------|-------------|-----|----------|
| `bag` | `Player.state().bag` | 12 | ItemRef[] + CardRef[] (joker-wrapped) |
| `deck` | `CardSystem.getCollection()` | ∞ | CardRef[] |
| `hand` | `CardSystem.getHand()` | 5 | CardRef[] (no scroll needed, always ≤5) |

The **hand** never needs a wheel — it's always ≤5 and renders as the free-floating NCH widget. But for transaction layouts, the hand's 5 cards are displayed inline alongside the bag/deck wheels.

---

## Card-in-Bag Storage (Joker Vault)

### Rules

1. Cards (CardRef objects with `.suit` and `.value`) can be placed in the bag via drag-drop or explicit "stow" action
2. When in the bag, a card renders with 🃏 emoji instead of its original emoji
3. Cards in bag **cannot** be equipped to QuickBar weapon/consumable/key slots
4. Cards in bag **can** be:
   - Dragged to corpse suit slots (if suit matches)
   - Sold at shops (card value pricing)
   - Moved back to hand (if hand has room) via drag or key action
   - Incinerated via debrief feed drop
5. `Player.addToBag(card)` wraps the card: sets `card._bagStored = true`
6. `Player.removeFromBag(card.id)` returns the original CardRef

### Detection

```javascript
// In SlotWheel render:
var isCard = item.suit !== undefined || item._bagStored === true;
var emoji = isCard ? '🃏' : (item.emoji || '📦');
var glowColor = isCard ? 'rgba(128,0,255,0.3)' : null;
```

### Transfer Rules Update (B5 matrix extension)

| From | To | Card-in-bag rule |
|------|----|-----------------|
| Hand → Bag | `Player.removeFromHand(i)` then `Player.addToBag(card)` | Card gets `_bagStored = true` |
| Bag → Hand | `Player.removeFromBag(id)` then `Player.addToHand(card)` | Card loses `_bagStored`, returns to hand |
| Bag → Crate Suit Slot | `Player.removeFromBag(id)` then `CrateSystem.fillSlot()` | Suit must match; valid even for joker-stored cards |
| Bag → Shop Sell | `Player.removeFromBag(id)` then sell pricing | Uses card value, not item value |
| Bag → Incinerator | `Player.removeFromBag(id)` | 10% card value refund (same as hand card incineration) |
| Deck → Bag | `CardSystem.removeCard(id)` then `Player.addToBag(card)` | Card moves from collection to bag with joker display |

---

## Transaction Tableaux

A "tableau" is the full layout of interactive wheels and widgets shown during a specific economic context. The game has three primary tableau contexts:

### 1. Restock Tableau (Crate/Corpse Fill)

Shown during PeekSlots FILLING state. Player fills container slots from bag and hand.

```
┌────────────────────────────────────────────────────────────────┐
│                      GAME VIEWPORT (dimmed)                     │
│                                                                  │
│                    ┌─────────────────────┐                      │
│                    │   CONTAINER SLOTS    │  ← CrateUI          │
│                    │  [♠][♦][📦][📦][♣]  │     (static target)  │
│                    │   1  2  3   4   5    │                      │
│                    └─────────────────────┘                      │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │ BAG WHEEL                                 │                   │
│  │ ◀  [ 🧪 ][ 🗡️ ][ 🃏 ][ 📦 ][    ]  ▶  │  ← keys 1-5      │
│  │     1      2      3      4     5          │    fill container │
│  │                                bag 7/12   │    from visible   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
│  ┌────────────────────────────┐     ┌──────┐                    │
│  │ HAND (NCH expanded)        │     │ DECK │                    │
│  │ [♠A][♦3][♣K][♥7][  ]      │     │  23  │  ← badge only     │
│  └────────────────────────────┘     └──────┘                    │
│                                                                  │
│  [STATUS BAR]  [QUICK BAR: ⚔️ 🧪 🔑]                           │
└────────────────────────────────────────────────────────────────┘
```

**Input routing during Restock**:
- **Keys 1-5**: Fire against **BAG WHEEL** visible slots → auto-fill the first empty container slot that accepts the item type
- **Q/E**: Scroll bag wheel left/right
- **Click/drag bag slot → container slot**: DragDrop transfer
- **Click/drag hand card → container suit slot**: DragDrop transfer (suit card filling)
- **S**: Seal container
- **ESC**: Cancel and close

**Why bag wheel is primary**: Most restock operations need resource items from the bag. Suit card slots are fewer (1-2 per container) and the hand is always ≤5, so the player can see all hand cards in the NCH expanded strip without scrolling. The bag is the bottleneck that needs the wheel.

### 2. Shop Tableau (Buy/Sell/Browse)

Shown during MenuBox PAUSE with shop context. Player browses vendor stock, buys cards, sells items/cards.

```
┌────────────────────────────────────────────────────────────────┐
│                     VENDOR STOCK (face 1)                       │
│  [♠A $30][♦5 $15][♣Q $25][♥2 $10][♠9 $20]                    │
│   1       2       3       4       5        ← keys 1-5 = buy   │
│                                                                  │
│─────────────────── face rotation ──────────────────────────────│
│                                                                  │
│                     SELL VIEW (face 2)                           │
│                                                                  │
│  BAG WHEEL ── sell items/cards                                  │
│  ◀  [ 🧪 ][ 🗡️ ][ 🃏 ][ 📦 ][    ]  ▶        bag 7/12       │
│      1      2      3      4     5     ← keys 1-5 = sell        │
│                                                                  │
│  DECK WHEEL ── sell backup cards                                │
│  ◀  [ ♠A ][ ♦3 ][ ♣K ][ ♥7 ][ ♠9 ]  ▶       deck 23         │
│      1      2      3      4     5     ← keys 1-5 = sell        │
│                                          (only when focused)    │
│                                                                  │
│  HAND ── free-floating, browse only                             │
│  [♠A][♦3][♣K][♥7][  ]                                          │
│                                                                  │
│  ──────────────── wheel focus toggle ──────────────────────────│
│  TAB or click wheel header to switch active wheel               │
│  Active wheel has gold border + "◆" focus marker                │
│  Inactive wheel is dimmed (50% alpha) + keys don't fire it     │
└────────────────────────────────────────────────────────────────┘
```

**Input routing during Shop Sell**:
- **Keys 1-5**: Fire against the **focused wheel** (bag or deck)
- **TAB**: Toggle wheel focus between bag and deck
- **Q/E**: Scroll the focused wheel
- **Click on wheel header**: Focus that wheel
- **Drag from wheel to vendor area**: Sell transfer (with confirm toast)

**Wheel focus model**: Only one wheel is "active" at a time. The active wheel has a gold border and responds to number keys. The inactive wheel is rendered at 50% alpha. TAB toggles focus. This prevents ambiguity about which container 1-5 addresses.

### 3. Stash Tableau (Bonfire)

Shown during MenuBox PAUSE with bonfire context. Player moves items between bag and death-safe stash.

```
┌────────────────────────────────────────────────────────────────┐
│                    STASH VIEW (face 0)                          │
│                                                                  │
│  STASH WHEEL ── death-safe storage                              │
│  ◀  [ 🗡️ ][ 📦 ][ 🧪 ][    ][    ]  ▶      stash 3/20       │
│      1      2      3     4     5                                │
│                                                                  │
│  BAG WHEEL ── current inventory                                 │
│  ◀  [ 🧪 ][ 🗡️ ][ 🃏 ][ 📦 ][    ]  ▶      bag 7/12        │
│      1      2      3      4     5                               │
│                                                                  │
│  TAB to toggle focus ── drag between wheels to transfer         │
└────────────────────────────────────────────────────────────────┘
```

Same focus model as shop: TAB toggles, gold border on active wheel, keys 1-5 fire "transfer to the other wheel" on the active wheel's visible item.

---

## SlotWheel Module API

### Constructor Pattern

SlotWheel is a **factory**, not a singleton. Each tableau instantiates 1-3 wheel instances.

```javascript
// engine/slot-wheel.js (Layer 2)
var SlotWheel = (function () {
  'use strict';

  /**
   * Create a new wheel instance.
   * @param {Object} opts
   * @param {string}   opts.id       - Unique ID ('bag', 'deck', 'stash')
   * @param {Function} opts.getData  - Returns current data array
   * @param {Function} opts.getLabel - Returns count label string
   * @param {number}   opts.y        - Vertical position (canvas px)
   * @param {number}   opts.vpW      - Viewport width
   * @param {string}   [opts.emptyLabel] - Label for empty state ('bag 0/12')
   * @returns {WheelInstance}
   */
  function create(opts) { ... }

  return { create: create };
})();
```

### WheelInstance Methods

```javascript
{
  render:       function (ctx),           // Draw the wheel at its position
  scroll:       function (delta),          // delta: -1 (left) or +1 (right)
  getVisibleItem: function (slotIdx),      // Returns data[_offset + slotIdx] or null
  getVisibleItems: function (),            // Returns array of 5 (or fewer) visible items
  getOffset:    function (),               // Current scroll offset
  getDataLength: function (),              // Total items in source
  hitTest:      function (px, py),         // Returns {slot: 0-4, chevron: 'left'|'right'|null}
  setFocused:   function (bool),           // Gold border + key-responsive
  isFocused:    function (),
  registerDragZones: function (),          // Register DragDrop zones for each visible slot
  unregisterDragZones: function (),
  updateLayout: function (vpW, y),         // Reposition after resize
  getSlotBounds: function (slotIdx),       // Returns {x, y, w, h} for slot
  destroy:      function ()                // Cleanup
}
```

### Rendering Details

**Slot box** (48×48, 6px radius, 8px gap):
- Border: `rgba(180,180,160,0.7)` normal, `rgba(255,215,0,0.9)` focused
- Interior occupied: 80% alpha, emoji 22px centred
- Interior empty: 30% alpha, dim frame only
- Slot number: 11px monospace, centred below slot, `rgba(200,200,180,0.6)`
- Joker card glow: `rgba(128,0,255,0.15)` radial fill inside slot

**Chevrons** (16×48 hit boxes):
- Left: `◀` character, 16px, left of slot row
- Right: `▶` character, 16px, right of slot row
- Dim when at scroll limit (30% alpha), bright when scrollable (80% alpha)
- Click hit zone: 24×48 (generous for Magic Remote pointer)

**Count badge**: Right-aligned, 11px monospace, `rgba(200,200,180,0.5)`

**Focus ring** (when `setFocused(true)`):
- 2px gold border around entire wheel row
- `◆` diamond marker left of first slot
- Slots respond to number keys
- Non-focused wheel renders at 50% globalAlpha

---

## Auto-Fill Routing (Keys 1-5 During Restock)

When a number key fires during PeekSlots FILLING state:

```
1. Get item from BAG WHEEL visible slot: item = bagWheel.getVisibleItem(keyIdx)
2. If item is null → Toast "Empty slot" → return
3. Determine target container slot:
   a. If item is a card (has .suit):
      - Find first unfilled SUIT_CARD slot with matching suit
      - If none → Toast "No matching suit slot" → return
   b. If item is a resource:
      - Find first unfilled RESOURCE slot
      - If none → Toast "No empty resource slot" → return
4. Remove item from bag: Player.removeFromBag(item.id)
5. Fill slot: CrateSystem.fillSlot(x, y, floorId, targetSlotIdx, item)
6. Refresh bag wheel (data changed, slot may shift)
7. Toast confirmation
```

This replaces CrateUI's current `_fillFromBag` logic which always takes `bag[0]`. Now it takes the item the player has scrolled to and selected with a number key — deliberate, not automatic.

**Hand cards during restock**: Suit card slots can also be filled from the hand. But hand cards are always visible (≤5) in the expanded NCH strip. The player can:
- **Click** a hand card, then click a suit slot (two-click transfer)
- **Drag** from hand card to suit slot (DragDrop)
- **Keyboard shortcut**: Hold SHIFT + number key to address hand instead of bag wheel

### SHIFT modifier

During restock, SHIFT+1 through SHIFT+5 addresses the **hand** instead of the bag wheel. This is the keyboard equivalent of "pick from hand, drop on slot."

```
SHIFT + 1-5 → hand[idx] → find matching suit slot → fill
1-5 alone   → bagWheel.getVisibleItem(idx) → find slot → fill
```

---

## Hand Widget During Transactions

The NCH widget expands into a horizontal card strip during transaction tableaux. This "expanded NCH" shows all hand cards (up to 5) as full-size 32×44 card tiles, not the stacked joker capsule.

```
Normal NCH (explore):    🃏🃏🃏  (stacked jokers, badge counts)
Expanded NCH (restock):  [♠A][♦3][♣K][♥7][  ]  (individual card tiles)
```

**NchWidget.expandForTransaction()**: Switches render mode from stack to strip. Cards become individually clickable and draggable. Position shifts to sit below the bag wheel (or wherever the tableau layout places it).

**NchWidget.collapseFromTransaction()**: Returns to normal stacked capsule.

The hand strip does NOT need a wheel — it's always ≤5 cards. But each card tile registers a DragDrop zone (source, not target) so cards can be dragged onto container suit slots.

---

## LG Magic Remote Compatibility

Every interaction must be achievable by:
1. **D-pad arrow keys** (mapped to Q/E for scroll, 1-5 on OK button after highlight)
2. **Pointer click** (Magic Remote IR cursor)
3. **Scroll wheel** (Magic Remote wheel = mouse wheel events)

### Click Targets (minimum 44×44 px)

| Target | Min Size | Action |
|--------|----------|--------|
| Wheel slot box | 48×48 | Select item (fire key equivalent) |
| Wheel chevron | 24×48 | Scroll wheel by 1 |
| Wheel header/label | 120×24 | Focus this wheel |
| Hand card tile | 32×44 | Begin drag or click-select |
| Container slot | 48×48 | Drop target (DragDrop) |

### D-pad Navigation During Transaction

When the player has a Magic Remote with no pointer (D-pad only mode):

- **Up/Down**: Move focus between wheels (bag ↔ deck) or between wheel and container
- **Left/Right**: Scroll the focused wheel
- **OK button**: Fire the highlighted slot (equivalent to number key)
- **Back button**: ESC equivalent (close transaction)

This is post-jam polish. For the jam build, pointer + keyboard are sufficient.

---

## Implementation Phases

### Phase 1 — SlotWheel Module (Jam Priority)

1. Create `engine/slot-wheel.js` (Layer 2)
2. Factory pattern: `SlotWheel.create(opts)` returns WheelInstance
3. Canvas rendering: 5 slots + chevrons + count badge + focus ring
4. Scroll logic: offset clamping, chevron visibility
5. Hit testing: slot click, chevron click
6. Joker card detection and purple glow rendering

### Phase 2 — Restock Tableau Integration

1. Modify PeekSlots to create a bag wheel on `tryOpen()`
2. Expand NCH widget into card strip during FILLING state
3. Reroute keys 1-5 through bag wheel's `getVisibleItem()` instead of `CrateUI._fillFromBag()`
4. Register bag wheel slots as DragDrop sources (not just targets)
5. Wire Q/E to scroll the bag wheel during FILLING

### Phase 3 — Shop Tableau Integration

1. Modify MenuFaces face 2 (sell view) to use bag wheel + deck wheel
2. Implement TAB focus toggle between bag and deck wheels
3. Wire keys 1-5 to sell from focused wheel
4. Shop face 1 (buy) keeps its current 5-card vendor display

### Phase 4 — Stash Tableau Integration

1. Modify MenuFaces bonfire face to use stash wheel + bag wheel
2. TAB focus toggle
3. Keys 1-5 = transfer from focused wheel to the other

### Phase 5 — Card-in-Bag Storage

1. Add `_bagStored` flag to cards placed in bag
2. Update SlotWheel rendering to detect cards and show joker emoji
3. Update PeekSlots DragDrop accepts to handle joker-stored cards for suit slots
4. Update shop sell pricing to use card value for bag-stored cards

### Phase 6 — Polish (Post-Jam)

1. SHIFT+1-5 hand shortcut during restock
2. Auto-scroll during drag (edge zone detection)
3. D-pad navigation for Magic Remote
4. Scroll animation (smooth offset interpolation instead of snap)
5. Category collapsing for large decks (group by suit, show suit header tabs)

---

## File Plan

| File | Layer | Type | Purpose |
|------|-------|------|---------|
| `engine/slot-wheel.js` | 2 | NEW | SlotWheel factory — canvas scroll containers |
| `engine/peek-slots.js` | 3 | MODIFY | Create bag wheel on FILLING, route keys through wheel |
| `engine/nch-widget.js` | 2 | MODIFY | Add expandForTransaction/collapseFromTransaction |
| `engine/menu-faces.js` | 3 | MODIFY | Shop sell + stash faces use wheels instead of grids |
| `engine/game.js` | 4 | MODIFY | Wire Q/E scroll + TAB focus + SHIFT modifier |
| `engine/player.js` | 3 | MODIFY | `_bagStored` flag on cards placed in bag |
| `engine/crate-ui.js` | 2 | MODIFY | Remove `_fillFromBag` (SlotWheel handles routing) |

---

## Interaction Matrix Extension

Extending the B5 transfer matrix with SlotWheel awareness:

| Action | Source | Target | Wheel Role |
|--------|--------|--------|------------|
| Key 1-5 (restock) | Bag wheel visible slot | First matching container slot | Bag wheel provides item |
| SHIFT+Key 1-5 (restock) | Hand card | Matching suit slot | Hand strip provides card |
| Key 1-5 (shop sell) | Focused wheel slot | Shop (sold for gold) | Active wheel provides item/card |
| Key 1-5 (stash) | Focused wheel slot | Other wheel (transfer) | Active wheel provides item |
| Q/E (any tableau) | — | — | Scroll active wheel |
| TAB (shop/stash) | — | — | Toggle wheel focus |
| Click slot (any) | Wheel slot | Context-dependent | Same as key for that slot |
| Drag from wheel slot | Wheel slot | DragDrop target zone | Wheel slot = drag source |

---

## Open Questions

1. **Deck wheel card emoji**: Should deck cards show their actual suit emoji (♠A) or a uniform back-of-card emoji? Actual suit is more informative for sell decisions.
2. **Bag capacity expansion**: If cards stored in bag count toward the 12-item max, bag space becomes precious. Should card-in-bag have a separate sub-capacity? Or rely on the player managing space deliberately (janitor theme)?
3. **Category tabs for large decks**: Post-jam, decks could group by suit with tab headers (♠ ♦ ♣ ♥). Each tab is its own 5-slot sub-wheel. Overkill for jam?
4. **Wheel position during combat**: Should bag wheel appear during combat for consumable use? Currently combat only shows CardFan. Probably post-jam scope.

# UI Roadmap — General UI Systems

> Pre-jam engine work. The rules explicitly allow "general UI" to be
> pre-built. These are reusable UI components that any dungeon crawler
> needs — dialog boxes, inventory, pause menu, notification toasts.
> Content that goes INTO these systems is jam work.
>
> **Note:** The pause menu and inventory screen are now faces of the
> rotating box menu system described in `GAME_FLOW_ROADMAP.md`. This
> document covers the remaining standalone UI components (dialog box,
> toasts) and the inventory data model that feeds into MenuBox Face 2.

---

## Current UI State

The game has:
- HUD overlay (HP bar, energy bar, floor label, advantage text)
- Card tray (5 clickable card slots)
- Combat overlay (text log)
- Floor transition overlay (fade to black + label)
- Minimap canvas (160×160)

The game does NOT have:
- Dialog/message box system
- Notification toasts (item pickup, quest update)
- Inventory data model (items, consumables, equipment)
- NPC interaction framework
- i18n string lookup layer

Handled by the rotating box menu (see `GAME_FLOW_ROADMAP.md`):
- Pause menu → MenuBox (all 4 faces)
- Inventory screen → MenuBox Face 2
- Character stat screen → MenuBox Face 1
- System settings → MenuBox Face 3

---

## Priority Order

### P0: Dialog Box (blocks NPC interaction, item descriptions, lore)

A centered text box that displays narrative text, item descriptions, or
NPC dialog. Most fundamental UI component — used everywhere.

**Behavior:**
- Appears over gameplay (semi-transparent background dims the 3D view)
- Typewriter text reveal (configurable speed, skip on click/Enter)
- Speaker name label (optional, for NPC dialog)
- Speaker portrait placeholder (optional, 64×64 slot)
- "Continue" prompt at bottom (Enter/click to advance)
- Multi-page support (array of text pages, auto-advance)
- Callback on close (for triggering events after dialog)

**Module:** `engine/dialog-box.js` (Layer 2, after HUD)

**API:**
```javascript
DialogBox.show({ text, speaker, portrait, pages, onClose })
DialogBox.advance()          // next page or close
DialogBox.isOpen()           // blocks movement input
DialogBox.setSpeed(cps)      // chars per second (default 40)
```

**InputPoll integration:** When `DialogBox.isOpen()` returns true,
movement input is suppressed. Enter/Space advances dialog.

Estimated size: ~100 lines + ~30 lines HTML/CSS.

---

### P1: Notification Toast (blocks item pickup feedback, quest updates)

Small non-blocking messages that appear briefly at the top or bottom of
the viewport. "Picked up: Iron Key", "Quest Updated", "+5 HP".

**Behavior:**
- Slides in from top-right, auto-dismisses after 2.5s
- Stacks up to 3 visible toasts
- Color-coded: green (item), blue (quest), yellow (warning), red (damage)
- Icon slot (emoji or small sprite)
- Does NOT block gameplay input

**Module:** `engine/toast.js` (Layer 2, after HUD)

**API:**
```javascript
Toast.show({ text, icon, color, duration })
Toast.clear()
```

Estimated size: ~60 lines + ~20 lines CSS.

---

### P2: Inventory Data Model (blocks item management in MenuBox Face 2)

**→ Now fully specified in `HUD_ROADMAP.md`.** The inventory model
expanded beyond a simple item list into a multi-container system
(hand / bag / stash / equipped) with death-drop mechanics borrowed
from EyesOnly. See HUD_ROADMAP for the complete Player API, item
reference format, and death scatter behavior.

Estimated size: ~80 lines added to player.js.

---

### P3: Pause Menu & Inventory Screen

**Now handled by the rotating box menu** — see `GAME_FLOW_ROADMAP.md`.
MenuBox Face 0 (minimap), Face 1 (skills/journal), Face 2 (inventory),
Face 3 (system settings). No separate modules needed for these screens.

Each face has a thin content provider (~80 lines each) that reads game
state and populates DOM when the menu opens.

---

### P4: NPC Interaction UI (stretch — uses DialogBox)

Not a separate module — it's content-layer logic that uses DialogBox.
When the player interacts with an NPC tile, FloorManager looks up the
NPC's dialog script and feeds it to DialogBox. This is jam work, but
it requires DialogBox (P0) to exist.

**Data model:**
```javascript
// In floor template data:
npcs: [
  { x: 5, y: 3, name: 'Clerk', emoji: '👤',
    dialog: ['Welcome to Baker\'s Brew.', 'The corkboard has your briefing.'],
    onClose: 'trigger_quest_briefing' }
]
```

---

### P5: Shop Core ✅ (COMPLETE)

Three-face shop MenuBox driven by `engine/shop.js` and real
`engine/card-system.js` JSON loading. Fully wired as of the Phase 2
shop implementation pass. See `engine/shop.js` for the public API.

- Face 0: Faction rep panel (all 3 factions, tier badge, gold)
- Face 1: Buy — 5 live inventory slots from `Shop.getInventory()`
- Face 2: Sell — 5 hand cards with 40% rarity-based return value
- `[1-5]` keys buy/sell; `Shop.close()` fires on MenuBox dismiss
- `Shop.reset()` on every floor transition (inventory cache cleared)

---

### P6: Vendor NPC Dialogue & Bulk Sale Flow

The gleaning loop depends on the shop visit feeling rewarding and
reactive — the vendor must *respond* to what you haul in. This phase
adds a scripted dialogue layer that fires around shop transactions.

#### 6a: Vendor Greeting Dialogue (on shop enter)

When the player approaches a TILES.SHOP and presses interact, before
the MenuBox opens, a short DialogBox sequence plays. Content is keyed
on current faction rep tier and visit count:

```
Tier 0 (Stranger):   "Hmm. You're not a usual face around here."
Tier 1 (Associate):  "Ah, the scavenger. Let's see what you've got."
Tier 2 (Ally):       "Back already? The good stuff's not cheap, you know."
Tier 3 (Trusted):    "The hero made a mess upstairs again — I assume."
```

Each faction has distinct flavour (Tide = nautical-mystical; Foundry
= industrial-brusque; Admiralty = coldly academic). Dialogue scripts
live in `data/strings/en.js` under `shop.greet.*` keys. The greeting
fires once per shop visit; re-entering the same shop before a floor
transition skips the greeting.

**Implementation notes:**
- `Shop.open()` sets `_visitCount++` per faction per floor
- `game.js` SHOP handler: if `Shop.getVisitCount() === 1`, play greeting
  DialogBox, then `onClose` opens the MenuBox
- Greeting line selected by `Shop.getRepTier()` at time of entry
- One `DialogBox.show()` call before `ScreenManager.toPause()`

Estimated: ~40 lines dialogue strings in en.js, ~15 lines game.js change.

#### 6b: Bulk-Sell Flow (Sell All / Multi-Select)

The 5-slot Face 2 sell pane is a bottleneck for players with a full bag
of salvage parts. Bulk-sell bypasses the slot-by-slot flow for items
below a rarity threshold.

**"Sell Common" quick action:**
- In Face 2 (sell pane), pressing `[X]` (or a dedicated key) triggers
  a confirmation: "Sell all common & uncommon cards? (+NNg)"
- Confirmation uses a DialogBox.show() with `pages: 1` and yes/no
  handled via key press (Enter = confirm, ESC = cancel)
- On confirm: `Shop.sellBulk(['common','uncommon'])` is called, which
  iterates `CardSystem.getCollection()`, removes all cards at those
  rarities, sums their 40% sell values, adds gold, returns summary

**Summary toast:**
After bulk-sell completes: `"Sold 7 cards for 184g 💰"` toast in loot
color. Followed by a 1-line vendor reaction DialogBox (no typewriter,
instant display, auto-dismiss after 1.5s via `duration` parameter):
```
"Not bad. Come back when you have the rare stuff."  [Foundry, Tier 1]
"The Council values your contribution."             [Tide, Tier 2]
```

**New `Shop.sellBulk(rarities)` method** (add to shop.js):
```javascript
function sellBulk(rarities) {
  // Iterate collection, sell all cards matching rarity array
  // Returns { count, total, cards[] }
}
```

Estimated: ~40 lines shop.js, ~30 lines game.js, ~20 strings, ~10 CSS.

#### 6c: Reputation Tier-Up Ceremony

When a sale (single or bulk) pushes the player's faction rep over a
tier threshold, a moment of ceremony happens before the post-sale
toast:

1. `Salvage.recordSale()` detects `tierChanged: true`
2. A dedicated "rep up" DialogBox fires (faction-specific congratulation)
3. HUD updates (if battery/resource strip ever shows faction badges)
4. Toast: `"🐉 Tide Council — Ally (Tier 2) unlocked!"`
5. Shop inventory rebuilds immediately (higher tier = more cards unlock)

The tier-up dialogue is more elaborate than a greeting — two pages:
```
Page 1: "You've earned it. The Tide Council recognizes you as an Ally."
Page 2: "Our reserves are open to you. Don't squander it."
```

New string keys: `shop.tier_up.tide.1` through `shop.tier_up.admiralty.3`
(3 factions × 3 tier thresholds = 9 dialogue entries × 2 pages = 18 strings).

Estimated: ~18 string entries, ~25 lines game.js glue.

---

### P7: Shop-as-Hub Polish (Gleaner Pacing Loop)

The core rhythm of DG is **dungeon → haul → sell → upgrade → repeat**.
Between biome runs, the shop is the primary beat of the pacing loop.
It should feel like returning to a home base — slightly different each
time, reactive to what the player has done.

#### 7a: Bag-Fullness HUD Badge

A small numeric badge on the quick-bar or status strip showing how many
sellable items the player is carrying vs. max bag capacity. Designed to
create urgency: "I need to go sell soon."

```
  Bag: ██████░░░░░░  7 / 12
```

- Only appears when `Player.getBag().length > 6` (above half capacity)
- Pulses amber when at 10+ items ("almost full")
- Pulses red when at 12/12 ("full — can't pick up more")
- Lives in `HUD.updateBag(count, max)` (new method)
- DOM element: a small badge under the quick-bar, bottom-left

See HUD_ROADMAP.md for the DOM/CSS spec.

#### 7b: Sell-All Toast with Haul Commentary

After a successful sell (single or bulk), the vendor has a reactive
comment based on what the player is selling. This is not a DialogBox —
it's a single-line toast with a different color from the currency toast,
and a short vendor attribution line:

```
"Quite a haul." — The Foundry  [+148g]
```

The commentary pool is a small weighted array per faction per category:
- **Undead parts** (cellar biome): 3 lines per faction per tier (36 total)
- **Construct parts** (foundry biome): 3 lines
- **Marine specimens** (sealab biome): 3 lines
- **Cross-category mix** (when selling multiple types): 3 generic lines

These live in `data/strings/en.js` under `shop.haul_comment.*` keys.
Selection is random (use `SeededRNG.pick()`) from the tier-appropriate
pool for the current faction.

**Implementation:** `Shop.getHaulComment(factionId, repTier, profile)`
returns a string from the pool. Called by `_shopBuy` / `_shopSellBulk`
after the transaction resolves.

Estimated: ~50 string entries, ~20 lines shop.js, ~10 lines game.js.

#### 7c: Per-Floor Shop State & Restock Ticker

When the player re-enters the shop on the same floor (without a floor
transition), the sold-out slots stay sold-out. But when they return
on a *new* floor, inventory is rebuilt fresh.

A visual "RESTOCKED" banner flashes briefly on Face 1 when the player
opens the shop for the first time on a new floor (i.e., after a floor
transition), signaling that inventory has refreshed. Rendered as a
canvas-drawn badge in `_renderShopBuy()` that fades over 1.5s.

Additionally, Face 0 (faction overview) shows a `↻ RESTOCKED` badge
next to the faction emoji on floors after a transition.

**State tracking:** Add `_lastOpenFloor` to shop.js; compare with
`FloorManager.getFloorNum()` on `open()`. If different, set a
`_restocked` flag that Face 0 and Face 1 can read.

Estimated: ~15 lines shop.js, ~20 lines menu-faces.js.

#### 7d: Wandering Vendor (ENM-091)

ENM-091 (Wandering Vendor) is defined in `data/enemies.json` as a
cross-biome, non-lethal NPC that triggers a shop interaction. On
interaction:

1. `EnemyAI` detects the entity as `nonLethal` — no combat
2. `game.js` `_interact()` detects the Vendor NPC flag instead of
   `TILES.SHOP` tile, but falls through to the same shop flow
3. Faction is randomly assigned at spawn (SeededRNG.pick of all three)
4. Inventory is a 3-slot reduced version (not 5) at the player's current
   floor rep tier
5. Greeting uses a unique dialogue script (`shop.wanderer.greet.*`)
   that acknowledges the dungeon context: "Rough down here, isn't it?
   I've got a few things — not asking questions about where they're from."

The Wandering Vendor carries cross-biome rare/epic cards from
`shopPool: ["tide","foundry","admiralty"]` regardless of floor biome.

**Implementation path:**
- `EnemyAI` needs `nonLethal: true` handling that triggers dialogue
  instead of combat (add `onNonLethalContact` callback in enemy-ai-system.js)
- `game.js` wires the callback to `Shop.open()` with a 'wanderer'
  faction mode flag
- `Shop.open()` extended: `open(factionId, floor, opts)` where
  `opts.inventorySize = 3` and `opts.mode = 'wanderer'`

Estimated: ~30 lines enemy-ai, ~20 lines game.js, ~10 strings.

---

### P8: Post-Jam Shop Systems (Stretch)

These require act-structure work that's out of jam scope but the hooks
should be designed for from day one.

**Faction rivalry pricing:** If the player's Foundry rep is Tier 2+
but Tide rep is Tier 0, the Foundry vendor occasionally offers a
"loyalty discount" on a random item (price × 0.85). Implemented as a
per-inventory-slot modifier flag `{ ..., rivalDiscount: true }`.

**Trade route mechanic:** Carrying a specific part type to the "wrong"
faction (e.g., marine specimens to The Foundry) unlocks a bonus sell
price (×1.4) once per floor, with a unique comment: "We don't usually
deal in scales, but these are… curious." Adds depth to the gleaning
decision: who do I sell *this* to?

**Shop restocking mid-run:** After completing a biome boss fight, the
faction shop for that biome's affiliation gets a special one-time
"champion's stock" — 3 rare/epic cards added above the normal 5 slots.
Requires `Shop.addBonusSlots(cards)` method.

**Black market access:** At Tier 3 with any faction, a hidden 6th slot
appears in Face 1 — cards with `shopPool: ["black_market"]` that have
unusual cost types (hp, battery) or cross-faction effects. Visual
treatment: slot has a dark background, no key label shown until hovered.

---

## Module Load Order

Standalone UI modules go in Layer 2 (after HUD, before GameLoop).
MenuBox and ScreenManager are also Layer 2 — see `GAME_FLOW_ROADMAP.md`
for the full load order including i18n (Layer 0) and string data (Layer 5).

```html
<!-- Layer 2: Rendering + UI -->
<script src="engine/raycaster.js"></script>
<script src="engine/minimap.js"></script>
<script src="engine/hud.js"></script>
<script src="engine/dialog-box.js"></script>      <!-- NEW P0 -->
<script src="engine/toast.js"></script>            <!-- NEW P1 -->
<script src="engine/menu-box.js"></script>         <!-- NEW (GAME_FLOW_ROADMAP) -->
<script src="engine/screen-manager.js"></script>   <!-- NEW (GAME_FLOW_ROADMAP) -->
<script src="engine/game-loop.js"></script>
```

---

## Input Blocking Hierarchy

**→ Canonical hierarchy is in `HUD_ROADMAP.md`** (includes CardFan
and InteractPrompt layers added with the gameplay HUD redesign).

Summary (highest priority first):

1. **MenuBox** (PAUSE or TITLE mode) — blocks all gameplay input; Q/E rotate faces, ESC closes
2. **DialogBox** — blocks movement, Enter/Space advances
3. **CardFan** — pointer selects cards, OK plays, Tab/ESC closes
4. **InteractPrompt** — OK triggers interaction on facing tile
5. **CombatEngine** — combat state, delegates card play to CardFan
6. **FloorTransition** — blocks all input during transition
7. **Normal gameplay** — WASD movement, mouse look, pointer events

```javascript
function poll() {
  if (MenuBox.isOpen()) return;
  if (DialogBox.isOpen()) { _pollDialog(); return; }
  if (CardFan.isOpen()) { _pollCardFan(); return; }
  if (_isBlocked()) return;        // combat, transition
  _pollInteract();
  _pollMovement();
  _pollActions();
}
```

Note: when MenuBox is open, Q/E rotate faces instead of turning the
player. ESC closes the menu instead of opening it. This input context
switch is handled inside MenuBox, not InputPoll.

---

## CSS Strategy

All UI overlays use the same z-index stack:
```css
#viewport          { z-index: 0; }
#combat-overlay    { z-index: 10; }
.dialog-box        { z-index: 20; }
.inventory-screen  { z-index: 25; }
.toast-container   { z-index: 30; }
.screen            { z-index: 50; }  /* title, game-over, victory, pause */
#floor-transition  { z-index: 100; } /* always on top */
```

---

## Total Estimated Size (This Document Only)

| Module | Lines (JS) | Lines (HTML/CSS) |
|--------|-----------|-------------------|
| dialog-box.js | ~100 | ~30 |
| toast.js | ~60 | ~20 |
| Player inventory methods | ~60 | — |
| **Total** | **~220** | **~50** |

The MenuBox, ScreenManager, i18n, and face content providers add another
~850 lines — see `GAME_FLOW_ROADMAP.md` for that breakdown.

All pre-jam engine plumbing. Zero game content. Theme-agnostic.

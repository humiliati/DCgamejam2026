# HUD Roadmap — Gameplay Overlay, Card Fan, and Inventory Model

> Pre-jam engine work. The HUD is "general UI" — reusable dungeon
> crawler plumbing with zero theme/content dependency. Card interaction
> mechanics, inventory data model, status display, and minimap embed
> are all engine-level systems that any dungeon crawler would ship.
>
> **Key reference:** EyesOnly's `hand-fan-component.js` (1799 lines),
> `nch-overlay.js`, `gamestate.js` inventory containers, and
> `death-exit-system.js` loot scatter. We're extracting the
> architectural patterns — not the code — and rebuilding at 1/10th
> the size for a jam-scoped canvas-first engine.

---

## Current State

The HUD is a minimal DOM overlay:

- **Top-left:** HP bar + Energy bar (numeric + colored fill)
- **Top-right:** Floor label + Advantage text
- **Bottom-right:** 160×160 minimap canvas
- **Bottom:** Card tray — 5 DOM `<div>` slots, click to play in combat

Problems:

1. **Card tray is always visible** — wastes screen space during
   exploration. Should appear only during combat or on demand.
2. **No player portrait** — no visual identity for the character.
3. **No equipped item display** — the player has no idea what they're
   carrying during exploration.
4. **Card interaction is click-only** — no support for Magic Remote
   pointer hover, hold-to-target, or fan-out selection.
5. **No world interaction widget** — no way to "use" a held item on
   an NPC, door, or environmental object without opening a full menu.
6. **Inventory lives nowhere** — Player module has no item storage.
   Cards exist in CardSystem but aren't tied to a persistent/transient
   split.

---

## Target: Layered HUD with Contextual Card Fan

The gameplay HUD is three layers, each with distinct visibility rules:

```
Layer 3 (top):   STATUS STRIP         ← always visible
Layer 2 (mid):   INTERACTION FAN      ← contextual (combat, inspect, use)
Layer 1 (bot):   QUICK BAR            ← always visible, compact
Layer 0:         3D VIEWPORT          ← raycaster canvas
```

### What the Player Sees

**Exploring a street:**
Top-left shows a small portrait frame (48×48 emoji or sprite),
HP/energy bars beside it. Top-right shows floor label and a compass
heading. Bottom-left shows 3 quick-slots (equipped weapon, consumable,
key item) as small icon tiles. Bottom-right shows the minimap. The
center of the screen is clean — no cards, no overlays.

**Approaching an NPC or interactable:**
A small "interact" prompt appears above the quick bar:
`[OK] Talk` or `[OK] Open`. Pressing OK triggers DialogBox or a
chest/door event.

**Entering combat:**
The card fan sweeps up from the bottom — an arc of 3-5 cards that
fans outward like a hand of playing cards. The Magic Remote pointer
hovers over cards; selected card lifts and highlights. Press OK to
play. The fan is canvas-rendered (not DOM), composited over the 3D
viewport at the same layer as the combat overlay.

**Using an item on the world:**
Hold OK on a quick-slot item → the item "lifts" from the quick bar
and a targeting reticle appears in the viewport center. Release OK
to use the item on whatever is in front of the player. This is the
simplified version of EyesOnly's press-and-hold targeting from the
hand fan component.

---

## Component Breakdown

### 1. Status Strip (always visible)

Top-of-screen persistent status bar. Replaces the current `#hud`
div with a more structured layout.

```
┌─────────────────────────────────────────────────────────┐
│ [😀] ██████░░ 8/10 HP   ████░░ 3/5 EN  │  Cedar St ▸ N │
│  portrait   hp bar        energy bar    │  floor  compass│
└─────────────────────────────────────────────────────────┘
```

**Left cluster:**
- Portrait frame: 48×48 canvas, renders player emoji or sprite
- HP bar: same as current but wider (160px), with damage flash
- Energy bar: 100px, blue fill
- Buff/debuff icon row (post-jam): small 16×16 icons below bars

**Right cluster:**
- Floor label: "Cedar St" or "Baker's Brew B1"
- Compass: single letter (N/S/E/W) with subtle rotation indicator
- Advantage tag: "AMBUSH" / "ALERT" — only during combat

**Implementation:** Stays as DOM overlay. The status strip has no
interactivity (pointer-events: none except portrait for future
character sheet shortcut). Renders above the 3D viewport.

Estimated: ~30 lines HTML/CSS restructure + ~15 lines HUD.js update.

---

### 2. Quick Bar (always visible, bottom-left)

Three compact item slots anchored bottom-left, mirroring the minimap
on bottom-right. Shows the player's active loadout at a glance.

```
┌────────────────┐
│ [⚔️] [🧪] [🔑] │   ← 3 slots: weapon, consumable, key item
│  W    C    K   │   ← slot labels (keyboard shortcuts post-jam)
└────────────────┘
```

**Slot types:**
- Slot 0 (Weapon): active weapon or "fists" default
- Slot 1 (Consumable): potion, food, scroll — use on self
- Slot 2 (Key): quest item, key, tool — use on world

**Behavior:**
- Each slot shows the item's emoji + a 1-line name underneath
- Empty slots show a dim outline with the slot type label
- Clicking a slot (or pressing its number key 1/2/3) uses the item:
  - Weapon: no immediate effect (passive stat bonus, shown in combat)
  - Consumable: immediate use (heal, buff) with toast notification
  - Key: enters "targeting mode" — use on the facing tile
- Magic Remote: point at slot, press OK to use

**Quick-slot assignment** happens in the pause menu (Face 2). During
gameplay, the quick bar is read-only — you use what's equipped, you
don't rearrange mid-combat.

**Implementation:** DOM overlay, positioned absolute bottom-left.
Reads from Player.equipped() (new API, see Inventory Model below).

Estimated: ~40 lines HTML/CSS + ~30 lines quick-bar.js.

---

### 3. Card Fan (contextual — combat and special interactions)

This is the EyesOnly hand-fan-component distilled to its core
interaction model, rebuilt as a canvas-rendered arc for pointer
devices.

#### When It Appears

The fan is NOT always visible. It sweeps in when:
- **Combat starts** → fan rises from bottom with the player's hand
- **Special interaction** → e.g., offering an item to an NPC, playing
  a card at a puzzle lock, presenting credentials
- **Manual summon** → press Tab/shoulder-button to inspect hand

The fan sweeps OUT when:
- Combat ends (victory/defeat/flee)
- Special interaction resolves
- Player presses Tab again or ESC

#### Fan Layout

```
                    card 2 (center)
                   ╱    ╲
              card 1      card 3
             ╱                  ╲
        card 0                    card 4
       ╱                              ╲
  ────────────────────────────────────────  ← bottom edge of viewport
```

Cards fan outward from a pivot point below the bottom edge of the
viewport (the "hand" position). Each card is rotated around the pivot
so the fan forms an arc of ~60°. The center card is vertical; outer
cards tilt outward.

**Card rendering:** Each card is a small rectangular sprite drawn on
the raycaster canvas (not DOM). Card face shows:
- Emoji icon (large, center)
- Card name (small, bottom)
- Card border color (type-coded: red=attack, blue=defense, green=heal)
- Slight drop shadow

**Hover/select:** Magic Remote pointer position is checked against
each card's bounding polygon. Hovered card:
- Lifts upward by 20px
- Scales up slightly (1.1×)
- Shows a tooltip above: card name + brief effect text

**Play card:** Press OK on hovered card → card flies forward toward
viewport center (200ms ease-out), triggers CombatEngine.playCard(),
card disappears from fan, remaining cards re-fan to fill gap.

**Card draw animation:** When fan opens, cards deal out one at a time
from a deck icon at bottom-right (50ms stagger per card). Satisfying
"shlick shlick shlick" feel.

#### EyesOnly Mechanics Adapted

From `hand-fan-component.js`:
- **Press-and-hold targeting** (180ms threshold) → adapted: hold OK
  on a card to enter targeting mode (aim at an enemy or tile). Release
  to play. This replaces click-to-play for cards with targeted effects.
- **Tooltip dwell** (500ms, <8px movement) → adapted: hover a card
  for 500ms without moving the pointer to show extended description.
- **Fan overlap** (30% in EyesOnly) → we use angular overlap instead
  since our cards arc rather than stack horizontally. ~12° per card
  with 5 cards = 60° total arc.
- **Animation phases** (idle, commit, resolve, repopulate) → same
  lifecycle: fan idles during selection, played card commits forward,
  combat resolves, then hand repopulates from backup deck if applicable.

#### Module: `engine/card-fan.js` (Layer 2, after HUD)

```javascript
CardFan.init(canvas)               // Bind to raycaster canvas
CardFan.open(hand, opts)           // Fan in with cards from hand array
CardFan.close()                    // Fan out (sweep down)
CardFan.isOpen()                   // → boolean (blocks normal input)
CardFan.render(ctx, w, h, pointer) // Draw fan state (called by GameLoop)
CardFan.hitTest(px, py)            // → card index or -1
CardFan.selectCard(index)          // Highlight + lift card
CardFan.playCard(index)            // Animate card forward, return card obj
CardFan.setHand(hand)              // Update hand mid-combat (after draw)
```

**Input integration:** When `CardFan.isOpen()`, InputPoll routes
pointer events to CardFan instead of normal movement. OK button
plays selected card. Back/ESC closes fan.

Estimated: ~200 lines (fan geometry, render, animation, hit-test).

---

### 4. Interact Prompt (contextual — exploration)

When the player faces an interactable tile (NPC, chest, door, sign),
a small prompt appears above the quick bar:

```
         ┌─────────────┐
         │  [OK] Talk   │
         └─────────────┘
```

**Detection:** Each frame, the tile directly in front of the player
is checked against an interactable registry (NPCs, chests, signs,
locked doors). If interactable, the prompt appears with context-
appropriate text.

**Behavior:**
- Fade in over 150ms when an interactable enters facing range
- Fade out over 100ms when player turns away or steps back
- Pressing OK triggers the interaction (DialogBox, chest open, etc.)
- If the player has a key item equipped in quick-slot 2 and faces a
  locked door, the prompt changes to "[OK] Use [🔑 Iron Key]"

**Implementation:** Small DOM element, positioned absolute bottom-
center, above the card fan layer. Reads from FloorManager's tile
data + Player's equipped items.

Estimated: ~30 lines interact-prompt.js + ~15 lines CSS.

---

### 5. Combat Overlay (reworked)

The current combat overlay is a transparent div with a text log.
With the card fan handling card interaction, the combat overlay
becomes a status display:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│           [👹 Goblin Scout]   HP ██████░░ 6/8          │
│                                                         │
│                                                         │
│    Round 2 — AMBUSH                                     │
│    "You dealt 4 damage. Goblin dealt 1 damage."         │
│                                                         │
│                ╱ card 1 ╲                               │
│           ╱ card 0    card 2 ╲                          │
│      ─────────────────────────────────                  │
└─────────────────────────────────────────────────────────┘
```

**Top third:** Enemy portrait (emoji, large), name, HP bar.
**Middle:** Round counter, advantage tag, combat log (last 2 actions).
**Bottom third:** Card fan (canvas-rendered, see above).

The combat overlay is a semi-transparent div that tints the viewport
(rgba 0,0,0,0.2) and hosts the enemy info DOM elements. The card fan
renders on the canvas underneath this overlay.

Estimated: ~20 lines HTML/CSS restructure.

---

## Inventory Data Model

Extracted from EyesOnly's three-container architecture, simplified
for jam scope.

### EyesOnly's Model (reference)

| Container | Slots | Death | Access |
|-----------|-------|-------|--------|
| `inventoryPersistent` | 9-12 | Survives | Bonfire only |
| `cardsInHand` | 5 | Lost (scattered) | Always (combat) |
| `backupCards` | 25 | Lost (scattered) | Pause menu |
| `persistentCards` | ∞ | Survives | Street mode |

### Our Model (jam scope)

| Container | Slots | Death | Access | Maps to |
|-----------|-------|-------|--------|---------|
| `hand` | 5 | Lost | Combat (card fan) | Card fan widget |
| `bag` | 12 | Lost | Pause (Face 2) | MenuBox Face 2 |
| `stash` | 20 | Survives | Bonfire floors | MenuBox Face 2 |
| `equipped` | 3 | Lost | Always (quick bar) | Quick bar |
| `currency` | — | 50% lost | Always (status) | Status strip |

**Hand:** The 5 cards available for combat. Drawn from bag/stash at
bonfire or found as loot. Lost on death — scattered on the floor as
pickup-able loot tiles (Souls-like corpse run).

**Bag:** General inventory. Consumables, keys, cards not in hand,
quest items. Accessible from pause menu Face 2. Lost on death.

**Stash:** Persistent storage. Items deposited at bonfire floors.
Survives death. This is the player's "safe" storage — the tension
between carrying items in the bag (useful but losable) vs. stashing
them (safe but inaccessible mid-dungeon).

**Equipped:** 3 quick-slot items (weapon, consumable, key). Subset
of bag — equipping an item moves it from bag to equipped. Lost on
death with the rest of the bag.

**Currency:** Numeric counter. 50% penalty on death (matching
EyesOnly's model).

### Player Module Extensions

```javascript
// New state fields in Player._state:
hand: [],           // CardRef[] — max 5
bag: [],            // ItemRef[] — max 12
stash: [],          // ItemRef[] — max 20
equipped: [null, null, null],  // [weapon, consumable, key]

// New API:
Player.getHand()              // → hand array (for CardFan)
Player.getBag()               // → bag array (for MenuBox Face 2)
Player.getStash()             // → stash array
Player.getEquipped()          // → equipped array (for QuickBar)

Player.addToHand(card)        // → boolean (false if full)
Player.removeFromHand(index)  // → card or null
Player.addToBag(item)         // → boolean (false if full)
Player.removeFromBag(id)      // → item or null
Player.addToStash(item)       // → boolean (false if full)
Player.removeFromStash(id)    // → item or null

Player.equip(bagIndex, slot)  // Move item from bag to equipped slot
Player.unequip(slot)          // Move item from equipped back to bag

Player.useItem(slot)          // Use equipped item (apply effects, remove if consumable)
Player.hasItem(id)            // → boolean (checks bag + equipped + hand)

// Death handler:
Player.onDeath()              // → { dropped: [...] } — clears hand/bag/equipped, returns dropped items for scatter
Player.applyCurrencyPenalty()  // Halves currency
```

### Item/Card Reference Format

```javascript
// ItemRef (bag, stash, equipped):
{
  id: 'potion_hp_1',
  name: 'Health Potion',
  emoji: '🧪',
  type: 'consumable',   // consumable | key | equipment | lore
  effects: [{ type: 'hp', value: 5 }],
  description: 'Restores 5 HP.'
}

// CardRef (hand):
{
  id: 'card_slash',
  name: 'Slash',
  emoji: '⚔️',
  type: 'attack',       // attack | defense | heal | utility
  effects: [{ type: 'damage', value: 3 }],
  description: 'Deal 3 damage to the enemy.',
  border: '#c44'        // visual border color for fan rendering
}
```

This matches the existing CombatEngine.playCard() interface (card
objects with `effects` array) so combat doesn't need to change.

Estimated: ~80 lines added to player.js.

---

## Death & Loot Scatter

When the player dies:

1. `Player.onDeath()` collects all items from hand + bag + equipped
2. Items are placed as pickup tiles at the death location
3. `Player.applyCurrencyPenalty()` halves currency
4. Stash is untouched
5. Player respawns at the last bonfire floor (or floor 1 entrance)
6. Dropped items persist until the player retrieves them or dies again
   (second death without retrieval = items gone permanently)

This is a simplified version of EyesOnly's `_scatterPlayerInventory()`
with 60-second decay replaced by "persist until next death" — simpler
for a jam game, still creates tension.

**Implementation:** ~40 lines in a new `death-handler.js` or added to
`combat-bridge.js`.

---

## Minimap Integration

The minimap currently sits as a standalone 160×160 canvas at bottom-
right. In the new HUD:

**Gameplay mode:** Minimap stays at bottom-right, unchanged. It's
small, unobtrusive, shows explored tiles + player arrow.

**Pause menu (Face 0):** Minimap scales up to fill the face's content
area. Same data, bigger canvas. Interactive: hover over rooms to see
labels (post-jam: click for fast-travel).

The Minimap module needs one new method:

```javascript
Minimap.renderToCanvas(targetCanvas, w, h)  // Render at arbitrary size
```

Currently it renders to `#minimap` at fixed 160×160. The new method
lets MenuBox Face 0 call `Minimap.renderToCanvas(faceCanvas, 400, 400)`
for the scaled-up pause view.

Estimated: ~15 lines added to minimap.js.

---

## Input Blocking Hierarchy (Updated)

With the card fan and interact prompt added, the full input priority:

```
1. MenuBox          — ESC opens/closes, Q/E rotate, pointer on faces
2. DialogBox        — Enter/Space advances, blocks movement
3. CardFan          — pointer selects cards, OK plays, Tab/ESC closes
4. InteractPrompt   — OK triggers interaction
5. CombatEngine     — (combat state, delegates to CardFan for card play)
6. FloorTransition  — blocks all input during transition
7. Normal gameplay  — WASD movement, mouse look, pointer events
```

InputPoll.poll() updated check order:

```javascript
function poll() {
  if (MenuBox.isOpen()) return;
  if (DialogBox.isOpen()) { _pollDialog(); return; }
  if (CardFan.isOpen()) { _pollCardFan(); return; }
  if (_isBlocked()) return;
  _pollInteract();   // check for interact prompt
  _pollMovement();
  _pollActions();
}
```

---

## Module Load Order (Updated)

```html
<!-- Layer 2: Rendering + UI -->
<script src="engine/skybox.js"></script>
<script src="engine/raycaster.js"></script>
<script src="engine/minimap.js"></script>
<script src="engine/hud.js"></script>
<script src="engine/dialog-box.js"></script>
<script src="engine/toast.js"></script>
<script src="engine/card-fan.js"></script>         <!-- NEW -->
<script src="engine/interact-prompt.js"></script>   <!-- NEW -->
<script src="engine/transition-fx.js"></script>
<script src="engine/menu-box.js"></script>
<script src="engine/screen-manager.js"></script>
<script src="engine/game-loop.js"></script>
```

CardFan loads after HUD (reads player state), before GameLoop (GameLoop
calls `CardFan.render()` in the render pipeline).

---

## DOM Structure (Updated)

```html
<div id="viewport">
  <canvas id="view-canvas"></canvas>
  <canvas id="transition-canvas"></canvas>

  <!-- Status strip (top) -->
  <div id="hud">
    <div id="hud-left">
      <div id="hud-portrait">😀</div>
      <div id="hud-bars">
        <div>HP: <span id="hud-hp">10/10</span></div>
        <div class="hud-bar-bg"><div class="hud-bar hud-hp-bar" id="hud-hp-fill"></div></div>
        <div>EN: <span id="hud-energy">5/5</span></div>
        <div class="hud-bar-bg"><div class="hud-bar hud-energy-bar" id="hud-energy-fill"></div></div>
      </div>
    </div>
    <div id="hud-right">
      <div id="hud-floor">Cedar St</div>
      <div id="hud-compass">N</div>
      <div id="hud-advantage"></div>
    </div>
  </div>

  <!-- Quick bar (bottom-left) -->
  <div id="quick-bar">
    <div class="quick-slot" id="quick-0"><span>⚔️</span><span class="slot-label">W</span></div>
    <div class="quick-slot" id="quick-1"><span>🧪</span><span class="slot-label">C</span></div>
    <div class="quick-slot" id="quick-2"><span>🔑</span><span class="slot-label">K</span></div>
  </div>

  <!-- Interact prompt (bottom-center, contextual) -->
  <div id="interact-prompt" class="hidden">
    <span id="interact-key">[OK]</span>
    <span id="interact-action">Talk</span>
  </div>

  <!-- Combat overlay (tint + enemy info, contextual) -->
  <div id="combat-overlay">
    <div id="enemy-info">
      <span id="enemy-portrait">👹</span>
      <span id="enemy-name">Goblin</span>
      <div class="hud-bar-bg"><div class="hud-bar hud-enemy-hp" id="enemy-hp-fill"></div></div>
    </div>
    <div id="combat-log"></div>
  </div>

  <!-- Minimap (bottom-right) -->
  <canvas id="minimap"></canvas>

  <!-- Floor transition -->
  <div id="floor-transition">
    <span id="floor-transition-text"></span>
  </div>
</div>

<!-- Card tray removed — replaced by CardFan (canvas-rendered) -->
```

---

## CSS z-index Stack (Updated)

```css
#view-canvas          { z-index: 0; }
#transition-canvas    { z-index: 15; }
#combat-overlay       { z-index: 10; }
#interact-prompt      { z-index: 12; }
#quick-bar            { z-index: 12; }
.dialog-box           { z-index: 20; }
.toast-container      { z-index: 30; }
.screen               { z-index: 50; }
#floor-transition     { z-index: 100; }
```

Note: CardFan renders directly on `#view-canvas` (canvas drawing, not
DOM), so it has no z-index. It composites as part of the render
pipeline, after walls/sprites but before the DOM overlay layers.

---

## Estimated Size

| Component | Lines (JS) | Lines (HTML/CSS) |
|-----------|-----------|-------------------|
| Status strip restructure | ~15 (HUD.js update) | ~30 |
| Quick bar | ~30 | ~25 |
| Card fan | ~200 | — (canvas) |
| Interact prompt | ~30 | ~15 |
| Combat overlay restructure | ~20 | ~20 |
| Player inventory model | ~80 | — |
| Death handler | ~40 | — |
| Minimap.renderToCanvas() | ~15 | — |
| **Total** | **~430** | **~90** |

---

## Jam Scope vs Post-Jam

### Jam (April 5)

- Status strip with portrait, HP/energy bars, floor label, compass
- Quick bar with 3 equipped slots (use on click/OK)
- Card fan for combat (canvas-rendered arc, hover-select, OK-play)
- Interact prompt for NPCs/chests/doors
- Inventory model: hand (5), bag (12), equipped (3)
- Death drops hand + bag + equipped on floor, currency 50% penalty
- Combat overlay with enemy info + card fan

### Post-Jam

- Stash system (bonfire deposit/withdraw UI in Face 2)
- Press-and-hold targeting for cards with targeted effects
- Card draw animation (deal-out from deck icon)
- Tooltip dwell (500ms hover for card descriptions)
- Buff/debuff icon row below status bars
- Quick bar rearrangement via drag (pause menu)
- Loot sparkle VFX on dropped item tiles
- Corpse run timer (decay after N minutes instead of "next death")
- Party system: multiple portraits + bars in status strip
- NCH-style radial context menu (Magic Remote optimized)

---

## What This Replaces

- **`#card-tray` div** → removed entirely. Card interaction moves to
  the canvas-rendered CardFan. The 72px-tall bottom bar disappears,
  giving the viewport full height.
- **Current `#hud` layout** → restructured with portrait + compass.
  Same module (hud.js), expanded.
- **CombatBridge card slot click handlers** → replaced by CardFan
  input routing. CombatBridge calls `CardFan.open(hand)` on combat
  start instead of updating DOM card slots.

---

## Relationship to Other Roadmaps

- **GAME_FLOW_ROADMAP.md** — MenuBox Face 2 (inventory screen) reads
  from `Player.getBag()` and `Player.getStash()`. Face 0 uses
  `Minimap.renderToCanvas()` for scaled-up map. Input hierarchy
  updated to include CardFan.
- **UI_ROADMAP.md** — DialogBox (P0) is triggered by InteractPrompt.
  Toast (P1) fires on item pickup/use. Inventory model (P2) is now
  defined here instead of UI_ROADMAP.
- **DOOR_EFFECTS_ROADMAP.md** — TransitionFX runs during floor changes;
  CardFan auto-closes if open when a transition starts.
- **TEXTURE_ROADMAP.md** — Item pickup tiles on the floor (death drops)
  will need a pickup sprite or glow texture (post-jam visual polish).

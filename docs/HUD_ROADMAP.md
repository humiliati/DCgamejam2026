# HUD Roadmap — Retro-Futuristic Terminal Interface

> **Theme:** Retro-futuristic command terminal. CRT phosphor glow,
> monospace text, scanline overlays, pip-style gauges. All UI evokes
> a Cold War briefing room terminal crossed with a dungeon field kit.
>
> **Interaction mandate:** Every element must be clickable or
> draggable. Keyboard shortcuts are accelerators, never requirements.
> LG Magic Remote pointer is the primary input device.
>
> **Key references:**
> - EyesOnly `debrief-feed-controller.js` — catch-all display + avatar
> - EyesOnly `hand-fan-component.js` — click/drag card interaction
> - EyesOnly `card-drag-controller.js` — unified pointer drag system
> - EyesOnly `UI-CANON.md` — ASCII layout canon
> - EyesOnly `crt.css` — phosphor/scanline visual effects

---

## ASCII Layout Canon

### Gameplay Mode (Exploration)

```
┌─────────────────────────────────────────────────────────────────┐
│ DEBRIEF ┊  3D VIEWPORT                                         │
│ FEED    ┊  (raycaster canvas)                                  │
│         ┊                                                       │
│ ┌─────┐ ┊                                                       │
│ │ MOK │ ┊                                                       │
│ │ AVA │ ┊                                                       │
│ │ TAR │ ┊                                            ┌────────┐ │
│ └─────┘ ┊                                            │MINIMAP │ │
│ HP ████ ┊                                            │ 80×80  │ │
│ EN ██░░ ┊                                            │(toggle)│ │
│ ◈◈◈░░░ ┊                                            └────────┘ │
│ 💰 47   ┊                                                       │
│         ┊           ┌──────────────┐                            │
│ ┌─────┐ ┊           │  [OK] Talk   │   ← interact prompt       │
│ │QUICK│ ┊           └──────────────┘                            │
│ │ BAR │ ┊  ┌──────────────────────────────────────────┐         │
│ │⚔🧪🔑│ ┊  │          CARD TRAY (5 slots)             │         │
│ └─────┘ ┊  └──────────────────────────────────────────┘         │
├─────────┴───────────────────────────────────────────────────────┤
│ [DEBRIEF] [MAP] [BAG 7/12]  ───  Floor 3 · Cedar St · ▸ N     │
│                          STATUS BAR                              │
└─────────────────────────────────────────────────────────────────┘
```

### Gameplay Mode (Combat)

```
┌─────────────────────────────────────────────────────────────────┐
│ DEBRIEF ┊  3D VIEWPORT (dimmed)                                 │
│ FEED    ┊                                                       │
│         ┊         ┌──────────────────────┐                      │
│ ┌─────┐ ┊         │  👹 Goblin Scout     │                      │
│ │ MOK │ ┊         │  HP ██████░░ 6/8     │                      │
│ │ AVA │ ┊         │  Round 2 — AMBUSH    │                      │
│ │ TAR │ ┊         └──────────────────────┘                      │
│ └─────┘ ┊                                                       │
│ HP ████ ┊                                                       │
│ EN ██░░ ┊                                                       │
│ ◈◈◈░░░ ┊                                                       │
│ 💰 47   ┊                                                       │
│         ┊                                                       │
│ ┌─────┐ ┊           ╱ card2 ╲                                   │
│ │QUICK│ ┊      ╱ card1    card3 ╲                               │
│ │ BAR │ ┊  ╱ card0          card4 ╲  ← CARD FAN (click to play)│
│ │⚔🧪🔑│ ┊  ─────────────────────────  [drag to dispose/sell]   │
│ └─────┘ ┊                                                       │
├─────────┴───────────────────────────────────────────────────────┤
│ [DEBRIEF] [FLEE] [BAG 7/12]  ───  Round 2 · AMBUSH · ⚡3 EN   │
└─────────────────────────────────────────────────────────────────┘
```

### Pause Mode (MenuBox Open)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│          ┌──────────────────────────────────────────┐           │
│          │  ░░░░░░ BLUR BORDER ░░░░░░░░░░░░░░░░░░  │           │
│          │  ░░┌──────────────────────────────────┐░  │           │
│          │  ░░│                                  │░  │           │
│          │  ░░│     FACE CONTENT                 │░  │           │
│          │  ░░│     (click/drag interactive)     │░  │           │
│          │  ░░│                                  │░  │           │
│          │  ░░└──────────────────────────────────┘░  │           │
│          │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │           │
│          └──────────────────────────────────────────┘           │
│                      ◀  ● ○ ○ ○  ▶                              │
│                      [Q]  face dots [E]   ← click arrows too    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ [ESC Close] [Q ◀] [E ▶]  ───  Face 0: Map · PAUSED             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Debrief Feed (Left Column)

Adapted from EyesOnly's `debrief-feed-controller.js`. A persistent
left-column panel that cycles between display modes on click/tap.
Retro-futuristic CRT terminal aesthetic.

**Three display modes (click to cycle):**

| Mode | Content | When |
|------|---------|------|
| **MOK Avatar** | Character portrait + expression state | Default |
| **Resources** | HP/EN/BAT gauges, status conditions, buffs | Toggle |
| **Feed** | Combat log, event history, loot summary scroll | Toggle |

**MOK Avatar mode (default):**
```
┌─────────┐
│  ┌───┐  │
│  │🗡️ │  │  ← avatar emoji (class-based)
│  │   │  │     callsign below
│  └───┘  │
│  ROOK   │
│  Blade  │  ← class name
│ ──────  │
│ HP ████ │  ← compact gauge row
│ EN ██░░ │
│ ◈◈◈░░░ │
│ 💰 47   │
│ ──────  │
│ STR 7   │  ← stat readout (CRT green)
│ DEX 4   │
│ STL 3   │
└─────────┘
```

The avatar reacts to game events (damage flash, heal pulse, level-up
glow). Expression state follows EyesOnly's `MOKStateMachine` pattern
but simplified: idle, hurt, happy, alert, dead.

**Resources mode:**
```
┌─────────┐
│ SYSTEMS │  ← CRT header
│ ──────  │
│ HP  8/10│
│ ████████│  ← full-width bar, ghost trail on damage
│ EN  3/5 │
│ ████░░░░│
│ BAT 3/5 │
│ ◈◈◈◇◇  │  ← pip display
│ ──────  │
│ 💰 47g  │
│ 🎒 7/12 │  ← bag capacity
│ ──────  │
│ BUFFS   │
│ [none]  │
└─────────┘
```

**Feed mode (combat log / event history):**
```
┌─────────┐
│ >FEED   │  ← CRT header with cursor blink
│ ──────  │
│ You slsh│  ← truncated monospace lines
│ Gob -4HP│     newest at bottom
│ Gob att │
│ You -1HP│
│ Chest!  │
│ +Gold 5 │
│ +◈ Bat 2│
│ ──────  │
│ [CLEAR] │  ← click to clear
└─────────┘
```

**Implementation:** DOM panel, `position: absolute; left: 0; top: 0;
bottom: STATUS_BAR_H`. CRT styling via CSS variables (`--phosphor`,
`--scanline-opacity`). Click anywhere to cycle modes.

**Sizing:** Width `120px` at 480px viewport, scales via `clamp()`.
On webOS TV (1920px), stretches to `240px`.

**Module:** `engine/debrief-feed.js` (Layer 2, ~150 lines)

---

### 2. Status Bar (Bottom Strip)

Persistent bottom bar replacing the current `#hud` div. Contains
clickable buttons and status readout.

```
┌──────────────────────────────────────────────────────────────────┐
│ [DEBRIEF] [MAP] [BAG 7/12]  ───  Floor 3 · Cedar St · ▸ N      │
└──────────────────────────────────────────────────────────────────┘
```

**Left cluster (clickable buttons):**

| Button | Click action | Visual |
|--------|-------------|--------|
| `[DEBRIEF]` | Cycle debrief feed mode | Toggles MOK→Resources→Feed |
| `[MAP]` | Toggle minimap overlay | Shows/hides 80×80 corner map |
| `[BAG 7/12]` | Open pause menu at Face 2 | Amber pulse when >75% full |

**Right cluster (status readout):**
- Floor number + name
- Compass heading (N/S/E/W)
- Combat: round counter + advantage tag + energy remaining

**Implementation:** DOM overlay, `position: fixed; bottom: 0`.
Height: `28px`. All buttons are `<button>` elements with click handlers.
Keyboard shortcuts are displayed as tooltips on hover.

**Module:** Integrated into `engine/hud.js` restructure (~40 lines)

---

### 3. Quick Bar (Left Column, Below Debrief)

Three equipped-item slots anchored below the debrief feed panel.
Each slot is **clickable** (use item) and **drag-droppable** (swap
items by dragging from pause menu Face 2).

```
┌───┐
│ ⚔️│  Slot 0: Weapon (passive stat bonus)
├───┤
│ 🧪│  Slot 1: Consumable (click = use on self)
├───┤
│ 🔑│  Slot 2: Key item (click = use on facing tile)
└───┘
```

**Click behavior:**
- Slot 0 (Weapon): Shows weapon stats tooltip (no immediate effect)
- Slot 1 (Consumable): Uses item immediately (heal, buff) + toast
- Slot 2 (Key): Enters targeting mode — reticle on viewport center

**Drag behavior (post-jam):**
- Drag item FROM quick bar → back to bag (unequip)
- Drag item FROM Face 2 bag grid → onto quick slot (equip)
- Invalid drops bounce back with shake animation

**Module:** `engine/quick-bar.js` (Layer 2, ~50 lines)

---

### 4. Minimap (Toggle Overlay, Bottom-Right)

**Default: HIDDEN.** Player clicks `[MAP]` button or presses `M` to
toggle the 80×80 corner minimap on/off.

**Mini mode (80×80, corner):**
Standard fog-of-war map, player arrow, enemy blips. `pointer-events:
none` — purely informational.

**Full mode (Face 0 of MenuBox):**
Interactive click-to-path map adapted from EyesOnly's `tap-move-system`:

| Click target | Action |
|-------------|--------|
| Explored floor tile | A* pathfind → auto-walk player to tile |
| Unexplored tile | No action (fog) |
| Stair marker | Same as clicking the tile (path to it) |
| Enemy blip | Path to adjacent tile (one step away) |

**Path visualization:** A dotted line (fishing-path style from
gone-rogue) draws from player position to target tile, showing the
calculated A* route. Line fades as the player walks it.

**Auto-walk:** Player automatically steps along the path at normal
walk speed. Any manual input (WASD, click elsewhere) cancels the
auto-walk. Combat encounter along the path also cancels it.

**Module:** Extend `engine/minimap.js` with `handleClick(x, y)` and
`renderPath()`. Auto-walk integration in `engine/input-poll.js`.

---

### 5. Card Fan (Combat + Interaction)

Canvas-rendered arc of 3-5 cards. **Every card is clickable.** Fan
appears during combat and special interactions.

**Click interaction:**
- Click card → select (lift + highlight)
- Click selected card again → play it
- Click different card → switch selection
- Double-click card → play immediately (speed shortcut)

**Drag interaction (adapted from gone-rogue `card-drag-controller`):**
- Drag card out of fan → enters targeting mode
  - Drop on viewport → play card on faced enemy
  - Drop on debrief feed → dispose/incinerate card
  - Drop on quick bar slot → equip (if equipment card)
  - Drop outside all zones → cancel (card returns to fan)

**Drag visual feedback:**
- Ghost element follows pointer (90% scale, slight shadow)
- Source slot shows dotted placeholder
- Valid drop zones highlight on hover (gone-rogue pattern)
- Invalid zones show red tint + shake on drop attempt

**Drop zone registry (from `card-drag-controller.js` pattern):**

| Zone ID | Element | Accepts | Context |
|---------|---------|---------|---------|
| `fan` | Card fan area | Reorder | combat |
| `debrief` | Debrief feed | Dispose | combat, explore |
| `quick` | Quick bar slots | Equip cards | explore |
| `shop` | Shop face (Face 1) | Sell | shop-open |
| `viewport` | 3D canvas | Play/target | combat |

**Module:** `engine/card-fan.js` (existing, extend with drag) +
`engine/card-drag.js` (new, ~120 lines — unified pointer drag)

---

### 6. Card Drag Controller

Unified drag system adapted from EyesOnly's `card-drag-controller.js`.
Uses Pointer Events (`pointerdown/pointermove/pointerup`) for
cross-device compatibility (mouse, touch, Magic Remote).

**Drag state machine:**
```
IDLE → (pointerdown, 150ms hold) → DRAGGING → (pointerup) → DROP_CHECK
  ↑                                    ↓                         ↓
  └──────────── CANCEL ←──────────────┘      → DEPLOY (valid zone)
                                              → RETURN (invalid/cancel)
```

**150ms hold threshold** prevents accidental drags from click-select.
Quick taps always register as clicks, not drag initiations.

**Ghost element:**
- Fixed-position DOM clone of the dragged card
- `transform: scale(0.9)`, slight drop shadow
- Moves with pointer: `style.left/top` updated on pointermove
- Removed on drop or cancel

**Drop zone detection:**
- `document.elementsFromPoint(x, y)` to find zone under pointer
- Zones register with `CardDrag.registerZone(el, config)`
- Zone `config`: `{ id, accepts, onDragOver, onDragLeave, onDrop }`

**Module:** `engine/card-drag.js` (Layer 2, ~120 lines)

---

### 7. Popup / Overlay Click Requirements

**Every popup and overlay must have click/tap targets for all actions.**
Keyboard shortcuts exist as accelerators but are never the only way.

| Popup | Current input | Required click targets |
|-------|--------------|----------------------|
| **Harvest (corpse loot)** | `[1-5]` keys only | Click each loot slot to take |
| **Shop buy** | `[1-5]` keys only | Click each inventory slot to buy |
| **Shop sell** | `[1-5]` keys only | Click each hand card to sell |
| **MenuBox Face 2 (bag)** | No interaction yet | Click item → context menu (use/equip/drop) |
| **MenuBox Face 3 (settings)** | W/S + ←/→ keys | Click slider track to jump, drag thumb |
| **Combat card play** | Number keys | Click card in fan (see above) |
| **Dialog advance** | Enter/Space | Click dialog box anywhere |
| **Interact prompt** | Enter/Space | Click prompt itself |
| **Floor transition** | Auto | — (no interaction needed) |
| **Game over retry** | Enter | Click "Retry" / "Title" buttons |
| **Victory continue** | Enter | Click "Continue" button |

**Implementation priority (jam):** Harvest click, shop click, card fan
click, dialog click, game-over/victory click. These are the flows where
keyboard-only currently blocks LG Remote users.

---

### 8. CRT Visual Theme (CSS Layer)

Retro-futuristic terminal aesthetic applied to all HUD elements.
Adapted from EyesOnly's `crt.css` + `terminal-polish.css`.

**CSS custom properties:**
```css
:root {
  --phosphor:       #33ff88;          /* Primary UI color (green) */
  --phosphor-dim:   #1a8844;
  --phosphor-bright:#66ffaa;
  --phosphor-glow:  rgba(51,255,136,0.3);
  --bg-terminal:    #080c08;
  --bg-panel:       rgba(8,12,8,0.85);
  --scanline-opacity: 0.06;
  --scanline-speed: 8s;
  --font-terminal:  'Courier New', monospace;
  --border-terminal: 1px solid var(--phosphor-dim);
}
```

**Visual effects (CSS-only, no JS):**
- **Scanlines:** `::after` pseudo-element on debrief feed with
  repeating linear-gradient (2px bars), animated vertical scroll
- **Text glow:** `text-shadow: 0 0 4px var(--phosphor-glow)` on
  all monospace text in debrief and status bar
- **Panel borders:** 1px solid dim phosphor with subtle inset shadow
- **Gauge fills:** Linear gradient from `--phosphor-dim` to
  `--phosphor-bright`, pulsing on low HP
- **Cursor blink:** Feed mode header shows `▌` cursor, 1s blink

**Applied to:**
- Debrief feed panel (all modes)
- Status bar bottom strip
- Quick bar item slots
- Toast notifications
- Interact prompt
- MenuBox face content (when rendering text)

**NOT applied to:**
- 3D viewport (raycaster canvas)
- Card fan (has its own card art style)
- Splash/title screens (have their own cube aesthetic)

**Module:** Pure CSS in `index.html` `<style>` block. No JS needed.

---

## Inventory Data Model

### Container Architecture (adapted from EyesOnly)

| Container | Slots | Death | Access | Click/Drag |
|-----------|-------|-------|--------|------------|
| `hand` | 5 | Lost | Combat (card fan) | Click play, drag dispose |
| `bag` | 12 | Lost | Pause Face 2 | Click use, drag equip/sell |
| `stash` | 20 | Survives | Bonfire Face 2 | Click move, drag to bag |
| `equipped` | 3 | Lost | Quick bar | Click use, drag unequip |
| `currency` | — | 50% lost | Status bar | — |

### Drag Routes Between Containers

```
              ┌─────────────────────────┐
              │   CARD FAN (hand, 5)    │
              │   drag → debrief = dispose
              │   drag → viewport = play │
              └────────┬────────────────┘
                       │ drag to bag
              ┌────────▼────────────────┐
              │   BAG (12 slots)        │
              │   drag → quick = equip  │
              │   drag → stash = store  │
              │   drag → debrief = trash│
              │   drag → shop = sell    │
              └────────┬────────────────┘
                       │ drag to stash
              ┌────────▼────────────────┐
              │   STASH (20 slots)      │
              │   drag → bag = withdraw │
              │   (bonfire floors only) │
              └─────────────────────────┘
```

### Player Module Extensions

```javascript
// New state fields:
hand: [],           // CardRef[] — max 5
bag: [],            // ItemRef[] — max 12
stash: [],          // ItemRef[] — max 20
equipped: [null, null, null],  // [weapon, consumable, key]

// New API (all clickable/draggable flows call these):
Player.addToHand(card)        // → boolean
Player.removeFromHand(index)  // → card or null
Player.addToBag(item)         // → boolean
Player.removeFromBag(id)      // → item or null
Player.equip(bagIndex, slot)  // bag → equipped
Player.unequip(slot)          // equipped → bag
Player.useItem(slot)          // apply effects, consume

// Death:
Player.onDeath()              // → { dropped: [...] }
Player.applyCurrencyPenalty() // halves currency
```

---

## Debrief Feed as Video Player

The debrief feed's third mode plays ambient theme video, adapted from
EyesOnly's theme-mapped video system. For Dungeon Gleaner this means:

**Video sources (per biome):**
- Cedar Street: rain on cobblestone, lantern flicker
- Foundry: molten metal pour, steam vents
- Sealab: underwater porthole, bioluminescence

**Implementation:** `<video>` element inside the debrief panel DOM,
hidden except in video mode. Plays muted by default (unmute via
settings Face 3). Loop enabled. Source swaps on biome change.

**Catch-all button behavior:**
The debrief panel itself is the "catch-all button" — click it to cycle
through modes (MOK → Resources → Feed → Video → MOK). This mirrors
EyesOnly's cycle behavior. Long-press on debrief opens the full-screen
MenuBox at Face 1 (journal/stats) as a shortcut.

---

## Interactive Minimap — Click-to-Path

Adapted from EyesOnly's `tap-move-system.js` + `gone-rogue-movement.js`.

### Full-Size Map (Face 0 of MenuBox)

When the MenuBox opens to Face 0, the minimap renders at full face
size (~400×400) with clickable tiles:

**Click flow:**
1. Player clicks an explored tile on the map
2. A* pathfind calculates route from player to target
3. Dotted path line draws on the map (fishing-path style)
4. Dialog: "Auto-walk to this tile? [OK] [Cancel]"
5. On confirm: MenuBox closes, player auto-walks the path

**Path rendering (fishing-path style from gone-rogue):**
```
  Player ──╌╌╌╌─── ●  ← waypoints as dots
                    │
                    ● ── target tile (highlighted)
```

Dotted line rendered in a bright color (`--phosphor`) on the minimap
canvas. Each segment is a 2px dash with 2px gap. The path animates
(marching ants) while auto-walk is active.

**Auto-walk integration:**
- New flag: `InputPoll._autoWalking = true`
- Each game tick, if `_autoWalking`, pop next step from path and
  call `MovementController.stepForward/Left/Right/Back` accordingly
- Cancel conditions: any manual input, combat encounter, destination
  reached, path blocked (door closed after pathfind)

**Module:** Extend `engine/minimap.js` with:
```javascript
Minimap.handleClick(canvasX, canvasY)  // → {tileX, tileY} or null
Minimap.setPath(steps)                 // [{x,y}...] for rendering
Minimap.clearPath()
Minimap.renderPath(ctx)                // dotted line overlay
```

---

## Death & Loot Scatter

Same as previous roadmap. Items from hand + bag + equipped scatter as
pickup tiles at death location. 50% currency penalty. Stash untouched.
Second death without retrieval = items gone.

---

## Implementation Priority

### Phase 1 — Click Everything (jam blocker)
- [ ] Harvest overlay: click slots to take loot
- [ ] Shop buy/sell: click slots to buy/sell
- [ ] Game over/victory: click buttons
- [ ] Dialog: click to advance
- [ ] Card fan: click to select + play

### Phase 2 — Debrief Feed + CRT Theme
- [ ] Debrief feed panel (3 modes: MOK, resources, feed)
- [ ] CRT CSS variables + scanline overlay
- [ ] Status bar restructure (bottom strip with buttons)
- [ ] Quick bar (3 equipped slots, clickable)

### Phase 3 — Drag System
- [ ] Card drag controller (pointer events)
- [ ] Drop zone registry
- [ ] Fan → debrief disposal
- [ ] Bag → quick bar equip
- [ ] Bag → shop sell

### Phase 4 — Interactive Minimap
- [ ] Full-size map in Face 0 with click detection
- [ ] A* path visualization (dotted fishing-path)
- [ ] Auto-walk integration
- [ ] Cancel on manual input / combat

### Phase 5 — Polish
- [ ] Debrief video mode (biome ambient)
- [ ] MOK expression state machine
- [ ] Ghost bar (HP damage trail)
- [ ] Bag capacity pulsing
- [ ] Typed pickup toasts (gold/battery/food)

---

## Estimated Size

| Component | Lines (JS) | Lines (CSS) |
|-----------|-----------|-------------|
| Debrief feed | ~150 | ~80 |
| Status bar restructure | ~40 | ~30 |
| Quick bar | ~50 | ~25 |
| Card fan click/select | ~40 (extend existing) | — |
| Card drag controller | ~120 | ~20 |
| CRT theme | — | ~60 |
| Click targets (harvest/shop/etc) | ~60 | — |
| Interactive minimap | ~80 | — |
| Player inventory model | ~80 | — |
| **Total** | **~620** | **~215** |

---

## Module Load Order (Updated)

```html
<!-- Layer 2: Rendering + UI -->
<script src="engine/skybox.js"></script>
<script src="engine/raycaster.js"></script>
<script src="engine/minimap.js"></script>
<script src="engine/hud.js"></script>
<script src="engine/debrief-feed.js"></script>    <!-- NEW -->
<script src="engine/quick-bar.js"></script>       <!-- NEW -->
<script src="engine/dialog-box.js"></script>
<script src="engine/toast.js"></script>
<script src="engine/card-fan.js"></script>
<script src="engine/card-drag.js"></script>       <!-- NEW -->
<script src="engine/interact-prompt.js"></script>
<script src="engine/transition-fx.js"></script>
<script src="engine/screen-manager.js"></script>
<script src="engine/menu-box.js"></script>
<script src="engine/box-anim.js"></script>
<script src="engine/splash-screen.js"></script>
<script src="engine/game-loop.js"></script>
```

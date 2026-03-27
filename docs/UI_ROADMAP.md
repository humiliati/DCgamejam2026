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

### P5: Shop/Trade UI (post-jam stretch)

Grid display of purchasable items. Currency check. Buy/sell flow.
Reuses inventory grid layout with a "Buy" column and "Sell" column.
Not needed for jam — can use DialogBox + item grant for shops.

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

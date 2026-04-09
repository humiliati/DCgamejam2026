# Peek System Roadmap
## Dungeon Gleaner â€” DC Jam 2026
### Version 1.5 - April 8, 2026

Standard Peek Architecture Â· Variant Registry Â· Animation Pipeline Â· Juice Budget

---

## 1. Problem Statement

The game currently has **9 separate peek modules** (~2,200 lines) that share 80%+ identical logic:

| Module | Lines | Tile | Box Variant | Unique Feature |
|--------|-------|------|-------------|----------------|
| DoorPeek | 263 | DOOR/STAIRS/DOOR_BACK/DOOR_EXIT | door | Direction label, target floor |
| LockedDoorPeek | 213 | LOCKED_DOOR | locked | Shake + reshake loop |
| CratePeek | 195 | BREAKABLE | crate | "? LOOT ?" label |
| ChestPeek | 190 | CHEST | chest | Loot preview |
| CorpsePeek | 227 | CORPSE | coffin | Enemy data, loot state |
| MerchantPeek | 239 | SHOP | button | Faction, price hints |
| BookshelfPeek | 246 | BOOKSHELF | button | Book title, text snippet |
| BarCounterPeek | 293 | BAR_COUNTER | button | Drink name, effect preview |
| PuzzlePeek | 395 | PUZZLE | custom | Interactive sliding tiles |

Every module duplicates: facing detection, debounce timer, show/hide lifecycle, container creation, sub-label management, BoxAnim wiring, opacity transitions. Bug fixes (like the crate-peek stuck issue) must be applied to each copy independently.

---

## 2. Target Architecture

One `PeekSystem` module + a variant registry. Each tile type registers a **peek descriptor** that tells PeekSystem how to render, what label to show, and what custom behavior to run.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PeekSystem (Layer 2)                                     â”‚
â”‚                                                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ FacingCheck â”‚â†’ â”‚ Debounce     â”‚â†’ â”‚ Lifecycle FSM    â”‚ â”‚
â”‚  â”‚ (per frame) â”‚  â”‚ (configurableâ”‚  â”‚ IDLE â†’ SHOWING â†’ â”‚ â”‚
â”‚  â”‚             â”‚  â”‚  per variant)â”‚  â”‚ OPEN â†’ CLOSING â†’ â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚ IDLE             â”‚ â”‚
â”‚                                     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚ Variant Registry                                  â”‚    â”‚
â”‚  â”‚ { DOOR: doorDescriptor, CHEST: chestDescriptor, } â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ BoxAnim      â”‚  â”‚ LabelRendererâ”‚  â”‚ JuiceLayer     â”‚  â”‚
â”‚  â”‚ (3D box)     â”‚  â”‚ (inner+sub)  â”‚  â”‚ (glow, shake,  â”‚  â”‚
â”‚  â”‚              â”‚  â”‚              â”‚  â”‚  particles)    â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 2.1 PeekDescriptor Schema

```javascript
PeekSystem.register(TILES.DOOR, {
  // â”€â”€ Identity â”€â”€
  variant:     'door',           // BoxAnim variant name
  tileMatch:   function (tile) { return TILES.isDoor(tile); },
                                 // Custom match (OR use exact tile value)

  // â”€â”€ Timing â”€â”€
  showDelay:   300,              // ms debounce before appearing
  openDelay:   150,              // ms after appear before lid opens
  holdTime:    0,                // 0 = hold while facing, >0 = auto-dismiss

  // â”€â”€ Labels â”€â”€
  innerLabel:  function (ctx) { return ctx.targetLabel || 'â–º Enter'; },
  subLabel:    function (ctx) {
    return 'exiting ' + ctx.currentLabel + '\nâ†³' + ctx.targetLabel;
  },

  // â”€â”€ Colors â”€â”€
  glowColor:   function (ctx) { return ctx.isRetreat ? 'rgba(180,220,255,0.5)' : 'rgba(220,200,160,0.5)'; },
  labelColor:  function (ctx) { return ctx.isRetreat ? '#c0d8f0' : '#dcc8a0'; },

  // â”€â”€ Juice â”€â”€
  juice: {
    entryAnim:   'fade',         // 'fade' | 'pop' | 'slide-up' | 'slam'
    openAnim:    'swing',        // 'swing' | 'slide-off' | 'flip' | 'shatter'
    glowPulse:   true,           // Pulsing glow while open
    particles:   null,           // null | 'sparkle' | 'dust' | 'embers'
    sound:       'peek_door',    // AudioSystem key
    haptic:      'light',        // 'none' | 'light' | 'medium' | 'heavy'
  },

  // â”€â”€ Context builder â”€â”€
  buildContext: function (tile, fx, fy, floorData) {
    // Return an object with whatever data this variant needs.
    // PeekSystem passes it to all label/color functions.
    var currentId = FloorManager.getFloor();
    var targetId  = _resolveTarget(tile, fx, fy, floorData);
    return {
      tile: tile, fx: fx, fy: fy,
      currentLabel: FloorManager.getFloorLabel(currentId) || currentId,
      targetLabel:  FloorManager.getFloorLabel(targetId) || targetId,
      isRetreat:    tile === TILES.DOOR_BACK || tile === TILES.DOOR_EXIT || tile === TILES.STAIRS_UP
    };
  },

  // â”€â”€ Custom lifecycle hooks (optional) â”€â”€
  onShow:      null,             // function(ctx, boxId) â€” after box created
  onOpen:      null,             // function(ctx, boxId) â€” after lid opens
  onHide:      null,             // function(ctx, boxId) â€” cleanup
  onInteract:  null              // function(ctx, boxId) â€” player pressed OK while peeking
});
```

### 2.2 Lifecycle FSM

```
IDLE â”€â”€(facing match + debounce)â”€â”€â†’ SHOWING â”€â”€(openDelay)â”€â”€â†’ OPEN
  â†‘                                                            â”‚
  â”‚         â”Œâ”€â”€(face away / move / interact)â”€â”€â”                â”‚
  â”‚         â†“                                  â”‚               â”‚
  â””â”€â”€ IDLE â†â”€â”€ CLOSING â†â”€(fade/close anim)â”€â”€â”€â”€â”˜â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

States:
- **IDLE**: No peek active. Runs facing check every frame. Accumulates debounce timer when facing a registered tile.
- **SHOWING**: BoxAnim created, container fading in. Lid still closed.
- **OPEN**: Lid open, labels visible, glow pulsing. Holds as long as player faces the tile.
- **CLOSING**: Player turned away or moved. Close animation playing. BoxAnim.close() called. After fade completes â†’ IDLE.

Key invariant: **only one peek active at a time.** If the player faces a new tile while a peek is OPEN, the system transitions through CLOSING first (fast-path: 100ms) before starting the new peek.

---

## 3. Juice Budget

Each peek variant gets a juice budget â€” a set of micro-animations that make the interaction feel physical and satisfying. The system provides these as composable building blocks, not per-variant code.

### 3.1 Entry Animations

| Animation | Description | Best For |
|-----------|-------------|----------|
| `fade` | Simple opacity 0â†’1 (default) | Subtle peeks (bookshelf, bar) |
| `pop` | Scale 0.7â†’1.0 with overshoot ease | Loot peeks (chest, crate, corpse) |
| `slide-up` | Translate from +30px below with ease-out | Door/stair peeks |
| `slam` | Scale 1.3â†’1.0 with bounce, screen shake 2px | Boss doors, locked doors |

### 3.2 Open Animations

| Animation | Description | Best For |
|-----------|-------------|----------|
| `swing` | Lid rotates on Y-axis hinge (current door behavior) | Doors, gates |
| `slide-off` | Lid translates right and fades (current crate behavior) | Crates, chests |
| `flip` | Lid flips 180Â° on X-axis (book opening) | Bookshelves |
| `shatter` | Lid fragments into 4 pieces that fly outward | Breakables (post-smash) |

### 3.3 Glow System

The glow layer renders beneath the 3D box and responds to state:

| State | Glow Behavior |
|-------|---------------|
| SHOWING | Glow fades in from 0% to base intensity |
| OPEN | Glow pulses between 80%-120% intensity (sine wave, 2s period) |
| OPEN + hovered | Glow brightens to 150%, pulse speeds to 1s |
| CLOSING | Glow fades to 0% over 200ms |

The glow uses the volumetric multi-layer system (dual `::before` / `::after` pseudo-elements at different Z-depths + per-face rim-light via `box-shadow`).

### 3.4 Particle Layer

Optional particle emitter anchored to the box center. Small emoji or glyph particles that drift upward and fade.

| Particle Set | Emojis | Rate | For |
|-------------|--------|------|-----|
| `sparkle` | âœ¨ â­ | 2/s | Chests, rare loot |
| `dust` | Â· â€¢ | 3/s | Crates, corpses, old books |
| `embers` | ðŸ”¥ ðŸ’« | 1.5/s | Bonfires, forges |
| `smoke` | ðŸ’¨ | 1/s | Locked doors (frustration) |

Implementation: Canvas-rendered particle array (max 12). Each particle: `{ x, y, vx, vy, life, maxLife, emoji, size }`. Updated in PeekSystem.update(), rendered after the DOM box in the canvas overlay pass.

### 3.5 Sound Design

Each peek fires a short SFX on show and open:

| Event | Sound | Notes |
|-------|-------|-------|
| SHOWING | `peek_whoosh` | Soft air-push, 80ms, indicates something appeared |
| OPEN (door) | `peek_creak` | Wood creak, 200ms |
| OPEN (chest) | `peek_latch` | Metal latch click, 100ms |
| OPEN (crate) | `peek_slide` | Wood-on-wood slide, 150ms |
| OPEN (book) | `peek_page` | Page turn, 120ms |
| CLOSING | `peek_settle` | Soft thud, 60ms |
| SHAKE (locked) | `peek_rattle` | Chain rattle, 300ms |

These are placeholder keys â€” AudioSystem resolves them at runtime. Post-jam: generate procedural SFX with Web Audio oscillators.

---

## 4. Label System

### 4.1 Inner Label

Rendered inside the box's glow area (`.box3d-glow`). The descriptor's `innerLabel(ctx)` returns a string. PeekSystem creates a `<span>` with the variant's `labelColor`.

Font scaling rules:
- Short labels (â‰¤8 chars): bold 28px
- Medium labels (â‰¤16 chars): bold 22px
- Long labels (>16 chars): 18px, may wrap

### 4.2 Sub-Label

Rendered below the box as a DOM element. Two rows, left-aligned, monospace.

Row 1: Context line (e.g., "exiting The Promenade", "breakable crate", "Bone Sentinel corpse")
Row 2: Action hint (e.g., "â†³ The Approach", "â†’ press [OK] to smash", "â†’ harvest remains")

The sub-label fades in 300ms after the lid opens. Font size: 38px (scaled from current 200% pass). Color: variant-specific with 0â†’0.9 opacity transition.

**Action hints must tell the player HOW to interact.** Not just "smash to loot" but "press [OK] to smash" or "hold [OK] to harvest". The control scheme is visible in the hint.

### 4.3 Tooltip Integration

When a peek opens, PeekSystem also pushes a one-line summary to `StatusBar.pushTooltip()` so the tooltip history captures every peek the player saw. This creates a breadcrumb trail: "Looked at: DOOR â†’ The Approach", "Saw: breakable crate", "Found: Bone Sentinel corpse (42g)".

---

## 5. InteractPrompt Integration

The InteractPrompt and PeekSystem are complementary:

- **InteractPrompt** = bottom-center bar saying "[OK] Enter â†’ The Approach" â€” tells the player what pressing OK will do.
- **PeekSystem** = center-screen 3D box preview â€” shows the player what's behind the tile.

Both fire when facing the same tile. Both dismiss when the player turns away.

Key rule: **PeekSystem never blocks InteractPrompt.** The peek container has `pointer-events: none`. The interact prompt's click zone is always active. The visual stacking is: peek box (center) above raycaster, interact prompt (bottom-center) above peek glow but below status bar.

When the player presses OK while a peek is open, PeekSystem fires the descriptor's `onInteract()` hook before the normal interaction. This allows peeks to play a closing animation synchronized with the interaction (e.g., door peek swings fully open as the transition starts).

---

## 6. Variant Catalog

### 6.1 Door Peek (DOOR, DOOR_BACK, DOOR_EXIT, STAIRS_DN, STAIRS_UP)

- **Box**: door variant (wooden lid, stone frame)
- **Inner label**: Target floor name
- **Sub-label**: "exiting [current] â†³ [target]"
- **Glow**: warm amber (advance) / cool blue (retreat) / crimson (boss)
- **Entry**: slide-up
- **Open**: swing (Y-axis hinge)
- **Juice**: Faint draft particles (dust) blow from the opening

### 6.2 Locked Door Peek (LOCKED_DOOR)

- **Box**: locked variant (crimson glow, iron texture)
- **Inner label**: ðŸ”’ + lock name
- **Sub-label**: "requires [key name]"
- **Glow**: pulsing crimson
- **Entry**: slam (bounce + screen shake)
- **Open**: does NOT open â€” instead, shake animation fires on Y-axis
- **Juice**: Smoke particles, chain rattle SFX, reshake every 2s while facing
- **Special**: No `onInteract` â€” pressing OK triggers shake + Toast("Locked")

### 6.3 Crate Peek (BREAKABLE)

- **Box**: crate variant (wood planks, cross-grain lid)
- **Inner label**: "? LOOT ?" (amber)
- **Sub-label**: "breakable crate â†’ press [OK] to smash"
- **Glow**: warm amber
- **Entry**: pop (scale overshoot)
- **Open**: slide-off (lid slides right)
- **Juice**: Dust particles on open, wood-slide SFX
- **Special**: After smash, lid shatters â€” transition to loot state

### 6.4 Chest Peek (CHEST)

- **Box**: chest variant (ornate, gold trim)
- **Inner label**: Loot preview (top item or "?" if sealed)
- **Sub-label**: "treasure chest â†’ press [OK] to open"
- **Glow**: gold
- **Entry**: pop
- **Open**: flip (lid opens upward on X-axis hinge)
- **Juice**: Sparkle particles when opened, latch-click SFX

### 6.5 Corpse Peek (CORPSE)

- **Box**: coffin variant (dark wood, bone accents)
- **Inner label**: Enemy name + emoji
- **Sub-label**: "[enemy] corpse â†’ press [OK] to harvest"
- **Glow**: spectral green (fresh) / bone white (dry)
- **Entry**: fade
- **Open**: slide-off (coffin lid slides)
- **Juice**: Dust particles, loot value hint in sub-label ("~42g")

### 6.6 Shop/Merchant Peek (SHOP)

- **Box**: button variant (merchant stall frame)
- **Inner label**: Shop name + faction emoji
- **Sub-label**: "[faction] merchant â†’ press [OK] to browse"
- **Glow**: faction-colored
- **Entry**: pop
- **Open**: swing
- **Juice**: None (clean, professional)

### 6.7 Bookshelf Peek (BOOKSHELF)

- **Box**: button variant (book spines texture)
- **Inner label**: Book title
- **Sub-label**: First line of text snippet
- **Glow**: warm parchment
- **Entry**: fade
- **Open**: flip (book opening)
- **Juice**: Page-turn SFX, paper-dust particles

### 6.8 Bar Counter Peek (BAR_COUNTER)

- **Box**: button variant (dark wood, glass texture)
- **Inner label**: Drink name + emoji
- **Sub-label**: "[drink] â†’ press [OK] to order ([price]g)"
- **Glow**: amber/copper
- **Entry**: fade
- **Open**: slide-off
- **Juice**: Liquid-slosh SFX (future)

### 6.9 Puzzle Peek (PUZZLE)

- **Box**: custom (no BoxAnim â€” uses own interactive overlay)
- **Inner label**: Puzzle state indicator
- **Sub-label**: "sliding puzzle â†’ press [OK] to attempt"
- **Glow**: electric blue
- **Entry**: slam
- **Open**: N/A (puzzle overlay replaces box)
- **Juice**: Electric hum SFX
- **Special**: PuzzlePeek remains its own module due to interactive sliding-tile gameplay. PeekSystem handles the facing/debounce/show lifecycle but delegates rendering to PuzzlePeek's custom overlay.

---

## 7. Migration Plan

### Phase 1: Core PeekSystem Module (2-3 hours)

1. Create `engine/peek-system.js` (Layer 2, after BoxAnim)
2. Implement: variant registry, facing check, debounce FSM, container management, label renderer
3. Register the door variant as proof-of-concept
4. Wire into game.js render loop (single `PeekSystem.update(frameDt)` call replaces all individual peek updates)
5. Verify door peek works identically to current DoorPeek

### Phase 2: Migrate Variants (2-3 hours)

Migrate one variant at a time, testing each:
1. DoorPeek â†’ door descriptor
2. LockedDoorPeek â†’ locked descriptor
3. CratePeek â†’ crate descriptor (fix stuck bug via shared FSM)
4. ChestPeek â†’ chest descriptor
5. CorpsePeek â†’ corpse descriptor
6. MerchantPeek â†’ merchant descriptor
7. BookshelfPeek â†’ bookshelf descriptor
8. BarCounterPeek â†’ bar-counter descriptor
9. PuzzlePeek â†’ hybrid (PeekSystem lifecycle + custom render delegate)

Each migration: register descriptor, remove old module from index.html, test.

### Phase 3: Juice Layer (1-2 hours)

1. Implement entry animation variants (pop, slide-up, slam)
2. Implement open animation variants (already exist in CSS, just parameterize)
3. Implement particle emitter (canvas-rendered, 12-particle pool)
4. Wire SFX keys to AudioSystem
5. Add glow pulse (already exists, just standardize timing)

### Phase 4: Tooltip + InteractPrompt Integration (1 hour)

1. PeekSystem.onShow â†’ `StatusBar.pushTooltip()` for history breadcrumbs
2. PeekSystem.onInteract â†’ synchronized close animation
3. Sub-label action hints include control scheme ("[OK]")

### Phase 5: Cleanup (30 min)

1. Delete 9 old peek modules
2. Remove 9 `<script>` tags from index.html
3. Add 1 `<script>` tag for peek-system.js
4. Net reduction: ~2,200 lines â†’ ~600 lines (one module + descriptors)

**Total estimated: 7-10 hours** (post-jam polish pass, not jam-critical)

---

## 8. Non-Goals (Jam Scope)

These are explicitly deferred to post-jam:

- **Haptic feedback**: WebOS Magic Remote rumble integration
- **Procedural SFX**: Web Audio oscillator-based peek sounds
- **Peek stacking**: Multiple peeks visible simultaneously (e.g., corpse on top of crate)
- **Peek memory**: "Last peeked" indicator on minimap tiles
- **Peek animation blending**: Smooth transitions between peek variants without going through IDLE

---

## Â§ Cross-References

| Section | Links To | Relationship |
|---------|----------|-------------|
| Â§2 Architecture | engine/box-anim.js | BoxAnim provides the 3D box primitives |
| Â§4 Labels | engine/interact-prompt.js | Complementary â€” prompt shows action, peek shows preview |
| Â§4.3 Tooltip | engine/status-bar.js | StatusBar.pushTooltip() for history |
| Â§5 Integration | engine/game.js render loop | Single update call replaces 9 individual calls |
| Â§6 Variants | engine/tiles.js | TILES constants drive variant matching |
| Â§7 Migration | index.html script order | Layer 2 insertion point |

---

## 9. PeekSlots Chest-Awareness (Implemented Apr 3)

The PeekSlots bridge module (which wraps CrateUI for crate/corpse/chest interactions) has been updated with container-type awareness. This work is **prerequisite context** for the PeekSystem unification â€” the chest-specific behaviors documented here must be preserved when migrating to peek descriptors.

### 9.1 Problem

PeekSlots originally treated all CrateSystem containers identically: register DragDrop deposit zones, allow seal flow, allow S-key seal shortcut. This leaked dungeon cleaning-circuit mechanics (fill notifications, seal prompts) into withdraw-only chest containers on surface/interior floors.

### 9.2 Changes

**DragDrop zone gating** â€” `tryOpen()` only registers deposit zones when the container is deposit-mode:

```javascript
var isDepositMode = (container.type !== CrateSystem.TYPE.CHEST) ||
                    container.demandRefill;
```

- CRATE / CORPSE â†’ always deposit-mode (cleaning circuit)
- CHEST with `demandRefill === true` (depth 3+ dungeon chests) â†’ deposit-mode (cleaning circuit applies)
- CHEST with `demandRefill === false` (surface/interior) â†’ withdraw-only, no DragDrop zones

**Seal flow blocked** â€” `trySeal()` returns false for all CHEST types:

```javascript
if (_container && _container.type === CrateSystem.TYPE.CHEST) return false;
```

**S-key ignored** â€” `handleKey()` suppresses the seal shortcut for chests:

```javascript
if (key === 'KeyS' || key === 's') {
  if (_container && _container.type === CrateSystem.TYPE.CHEST) return false;
  return trySeal();
}
```

### 9.3 Depth-Based Chest Behavior Contract

| Depth | Floor Example | Slots | Mode | DragDrop Zones | Seal | Deplete |
|-------|---------------|-------|------|----------------|------|---------|
| 1 (surface) | Floor 0, 1 | 1-5 | withdraw | âœ— | âœ— | âœ“ (on empty) |
| 2 (interior) | Floor 1.6 Home | 8-12 / 256 (stash) | withdraw | âœ— | âœ— | âœ— (stash) / âœ“ |
| 3+ (dungeon) | Floor 3+ | 1-5 | withdraw + refill | âœ“ | âœ— | âœ“ (on empty) |

### 9.4 Implications for PeekSystem Migration

When migrating ChestPeek to a PeekSystem descriptor (Â§7 Phase 2, step 4), the descriptor's `onInteract` hook must:

1. Check `CrateSystem.getContainer()` for the faced tile
2. Route to `PeekSlots.tryOpen()` which already handles all chest-awareness logic
3. The descriptor should NOT independently register DragDrop zones â€” PeekSlots owns that decision
4. Seal-related juice (the "sealed" close animation) should be skipped for CHEST variant peeks

The PeekSystem's variant catalog (Â§6.4 Chest Peek) should be updated to note:

- **Sub-label**: Should reflect depth context â€” "treasure chest â†’ press [OK] to open" (surface) vs "supply chest â†’ press [OK] to open / drag to restock" (dungeon)
- **Juice**: Sparkle particles only for first-open (non-depleted). Depleted chests get dust particles.
- **Special**: Stash chests (home, 256 slots) route to CrateUI grid renderer, not the standard peek box. The peek box should still appear for the facing/debounce cycle but the `onInteract` hands off to the full CrateUI overlay.

### 9.5 CrateUI Stash Grid (New Renderer)

CrateUI gained a scrollable 8-column grid renderer for stash containers (256 slots). This is relevant to PeekSystem because the stash interaction bypasses the standard peekâ†’interact flow:

- 8-column grid, 4 visible rows, 48px slots
- Arrow keys + PageUp/Down for scrolling, smooth interpolation
- Click-to-withdraw only (no number keys â€” too many slots)
- Filled/empty count in title bar, scrollbar thumb on right edge
- `_slotRects[]` array stores screen-space hit-test rectangles for pointer interaction

When PeekSystem unification happens, the stash flow should be: PeekSystem facing check â†’ ChestPeek descriptor fires â†’ `onInteract` opens CrateUI in stash-grid mode â†’ PeekSystem transitions to a "delegated" state (similar to PuzzlePeek in Â§6.9).

---


## 10. BoxForge-Driven Geometry Recovery And Polish

The jam build shipped with known peek geometry drift/jank due to time constraints.
Post-jam, all peek geometry and animation polish should be authored through BoxForge.

### 10.1 Tool Sources

- Deployed reference tool: `C:\Users\hughe\.openclaw\workspace\BOXFORGE\boxforge.html`
- Current project tool: `C:\Users\hughe\.openclaw\workspace\LG Apps\Games\DCgamejam2026\tools\boxforge.html`
- Companion previews: `tools/peek-workbench.html`, `tools/chest.test.html`, `tools/bookshelf.test.html`

Rule: use the project-local BoxForge as the active authoring surface, and compare
against the deployed reference when behavior diverges.

### 10.2 Required Workflow For Every Peek Variant

1. Open the variant in BoxForge and set baseline dimensions/hinge/face transforms.
2. Validate motion states: `show`, `open`, `hold`, `close`, and interrupted close.
3. Validate label-safe regions: inner label, sub-label, and multi-button overlay bounds.
4. Export CSS/transform values and apply to BoxAnim/peek descriptor configuration.
5. Run in-game at least once on desktop + once in target viewport scale.

### 10.3 Geometry Acceptance Gates

- No clipping between lid/box faces at any keyframe.
- No camera-facing skew drift during `open->hold`.
- Label text remains readable at minimum HUD scale.
- Multi-button overlays do not overlap the animated geometry.
- Fast retarget (turn from one interactive tile to another) does not leave orphan transforms.

---

## 11. New Interactive Tile Peek Coverage (Including Living Infrastructure)

All interactive or semi-interactive new tiles must be represented in the
PeekSystem registry and designed in BoxForge if they use animated geometry.

### 11.1 Living Infrastructure (Runtime IDs 40-48)

| Tile | ID | Interaction Capacity | Peek Requirement | BoxForge Priority |
|------|----|----------------------|------------------|-------------------|
| WELL | 40 | social/info | Single-action peek + context line | High |
| BENCH | 41 | rest/social | Context-gated: nap action peek (rest) or social full peek (NPC). See §13.7.2. | Medium |
| NOTICE_BOARD | 42 | errands/multi-choice | Multi-button menu overlay | High |
| ANVIL | 43 | work/duty actions | Multi-button crafting/work overlay | High |
| BARREL | 44 | inspect/loot/work | Single-action or dual-action | Medium |
| CHARGING_CRADLE | 45 | construct rest/assign | Multi-button (assign/wake/inspect) | High |
| SWITCHBOARD | 46 | routing/duty/config | Multi-button control panel overlay | High |
| SOUP_KITCHEN | 47 | eat/share/ration | Multi-button service overlay | High |
| COT | 48 | rest/reassign | Context-gated: nap action peek (2h, clear TIRED). See §13.7.2 Tier 2. | Medium |

### 11.2 Planned Creature/Economy Tiles (IDs 49-59)

Design these peek variants now in BoxForge even if runtime wiring is pending.

| Range | Category | Peek Focus |
|-------|----------|-----------|
| 49-54 | Creature verb tiles | state readability (occupied/empty/claimed), low-button overlays |
| 55-59 | Economy processing tiles | work-order style multi-button overlays and status readouts |

---

## 12. Multi-Button Overlay Standard

Some peeks now require more than one button (especially living infrastructure).
To avoid ad hoc layouts, enforce a shared overlay pattern:

- Top: title + state chip
- Middle: 2-4 primary action buttons
- Bottom: contextual hint row + `[OK]/[BACK]` guidance

Button limits:
- Preferred: 2-3 buttons
- Maximum: 4 buttons (beyond this, open a full screen panel)

All multi-button variants must be prototyped in BoxForge before implementation.

---

## 13. Micro-Peek System (No Screen Takeover)

Not every peek justifies a full-screen modal with lifecycle FSM, lid animation, and label overlays. When a player **steps onto** a walkable tile that has a transient visual consequence (damage, healing, pickup, environmental effect), the game plays a **micro-peek**: a short animation overlay in the viewport center that conveys the event without halting movement or opening a menu.

The door peek is the architectural model here — it proves the DOM overlay + BoxAnim pipeline works — but micro-peeks strip it down to the bare essentials: no FSM states, no debounce, no OPEN/CLOSING cycle, no label system. Fire and forget.

### 13.1 Micro-Peek Architecture

```
Player steps on tile
       │
       ▼
HazardSystem.checkTile()          ◄── existing damage/effect logic (unchanged)
       │
       ├── apply HP/energy/status ──► HUD bar updates, combat log emoji line
       │
       └── PeekSystem.microPeek({     ◄── NEW: visual overlay call
             variant: 'caltrop',
             duration: 600,
             entryAnim: 'pop',
             particles: 'dust',
             sound: 'peek_crunch'
           })
```

Key rules:

- Micro-peeks are **non-blocking**: the player keeps moving, the overlay plays on top.
- Micro-peeks are **auto-dismissing**: they fade out after `duration` ms (no facing check).
- Only **one micro-peek at a time**. If a new one fires before the old one fades, the old one is killed instantly (no close animation).
- Micro-peeks do **not** open a lid, do not show labels, do not fire `onInteract`. They exist purely for visual + audio feedback.
- Micro-peeks are authored in BoxForge as single-phase (P1) variants. The phase animation (squish, bounce, poke) carries the "impact" feel. P2/P3 are unused.

### 13.2 MicroPeekDescriptor Schema

```javascript
PeekSystem.registerMicro(TILES.TRAP, {
  variant:    'caltrop',        // BoxForge-authored variant name
  duration:   600,              // ms total display time
  entryAnim:  'pop',           // 'pop' | 'slam' | 'fade'
  exitAnim:   'fade',          // 'fade' | 'shrink'
  particles:  'dust',          // null | 'dust' | 'embers' | 'sparkle' | 'smoke' | 'splash' | 'poison'
  sound:      'peek_crunch',   // AudioSystem key
  scale:      0.6,             // viewport scale (micro-peeks are smaller than full peeks)
  offsetY:    -20,             // nudge up from center (avoid obscuring player)

  // Optional: dynamic override based on game state
  override: function(tile, x, y) {
    // Return partial descriptor to merge, or null to suppress
    return null;
  }
});
```

### 13.3 Step-On Micro-Peek Variants

#### 13.3.1 Hazard Tiles (Walkable, Damage On Entry)

| Tile | ID | Variant | BoxForge Shape | Entry | Duration | Particles | Sound | Visual Description |
|------|----|---------|----------------|-------|----------|-----------|-------|-------------------|
| TRAP | 8 | `caltrop` | Pyramid (inverted, 4-face, brass) | pop | 600ms | dust | `peek_crunch` | Inverted tetrahedron bounces up from floor — caltrops scattering. Poke animation for stabbing impact. |
| FIRE | 15 | `flame-burst` | Orb (fire palette, 7 rings) | slam | 500ms | embers | `peek_sizzle` | Fire orb erupts at foot level, squish animation pulses outward. |
| SPIKES | 16 | `spike-jab` | Pyramid (triple, stacked, iron) | slam | 700ms | dust | `peek_stab` | Three nested inverted pyramids thrust upward in sequence. Shake intensity matches 3-damage severity. |
| POISON | 17 | `toxic-cloud` | Orb (poison palette, 5 rings, ember state) | fade | 800ms | poison | `peek_hiss` | Sickly green orb blooms with low opacity slices. Longer duration reflects lingering poison + energy drain. |

#### 13.3.2 Beneficial Step-On Tiles

| Tile | ID | Variant | BoxForge Shape | Entry | Duration | Particles | Sound | Visual Description |
|------|----|---------|----------------|-------|----------|-----------|-------|-------------------|
| BONFIRE | 18 | `flame-rest` | Orb (ember→fire palette, 9 rings) | fade | 900ms | embers | `peek_campfire` | Warm orb rises gently from the fire pit. P1 uses ember state (soft glow), transitions visually warmer. Longer hold so player registers the safe-zone. |
| WATER | 9 | `splash` | Orb (ice palette, 3 rings, unlit state) | pop | 400ms | splash | `peek_splash` | Translucent blue orb pops at feet with low ring count for a liquid feel. Quick splash — water is non-threatening. |
| COLLECTIBLE | 20 | `pickup-flash` | Box (tiny, gold trim, no lid) | pop | 350ms | sparkle | `peek_coin` | Tiny gold box pops and immediately fades — blink-and-you'll-miss-it confirmation. Walk-over pickup should feel instant. |
| DETRITUS | 39 | `scrap-grab` | Box (small, wood plank, slide-off lid) | pop | 400ms | dust | `peek_rustle` | Small crate-like box pops with lid sliding off. Communicates "you picked something up from the mess." |

#### 13.3.3 Environmental Ambience Tiles (Walkable, No Damage)

| Tile | ID | Variant | BoxForge Shape | Entry | Duration | Particles | Sound | Visual Description |
|------|----|---------|----------------|-------|----------|-----------|-------|-------------------|
| ROAD | 32 | — | No micro-peek | — | — | — | — | Standard walkable, no feedback needed. |
| PATH | 33 | — | No micro-peek | — | — | — | — | Standard walkable, no feedback needed. |
| GRASS | 34 | `grass-rustle` | — (sprite only) | — | 250ms | — | `peek_rustle` | Optional: faint green particle puff at feet. No BoxForge geometry — CSS sprite overlay only. Deferred to polish pass. |

### 13.4 Face-To Passive Micro-Peeks (Opaque Tiles Without Menus)

Some opaque tiles deserve a brief visual acknowledgment when the player faces them, even though they have no menu or interactive flow. These use the standard PeekSystem facing check but skip the full lifecycle — they show a micro-peek on face, dismiss on turn-away, with no OPEN state or labels.

**Note:** Several tiles previously listed here have been reclassified as context-gated peeks (§13.7) or full peeks. TORCH_LIT, TORCH_UNLIT, BED, BONFIRE, HEARTH, and COT now have conditional peek logic based on game state (inventory, ownership, tile context). See §13.7 for the full context-gate specifications.

| Tile | ID | Variant | BoxForge Shape | Trigger | Duration | Particles | Notes |
|------|----|---------|----------------|---------|----------|-----------|-------|
| TREE | 21 | — | No peek | — | — | — | Tall obstacle, not interactive. |
| SHRUB | 22 | — | No peek | — | — | — | Half-wall, not interactive. |
| PILLAR | 10 | — | No peek | — | — | — | Structural, not interactive. |
| FENCE | 35 | — | No peek | — | — | — | Railing, not interactive. |
| TABLE | 28 | `table-inspect` | Box (half-height, wood) | face | 600ms | — | Brief inspection peek. Tables are flavor objects currently. |
| DUMP_TRUCK | 38 | `truck-inspect` | Box (large, metal texture) | face | hold | — | Pressure wash truck — brief box peek showing the vehicle. Could later gain a "use equipment" menu. |
| MAILBOX | 37 | `mailbox-peek` | Box (small, wood, top hinge) | face | hold | — | Lid pops open to show contents. Transitions to full peek if mail system is implemented. |
| TERMINAL | 36 | `terminal-boot` | Box (desk-height, green glow) | face | hold | — | CRT screen flickers on. Will likely upgrade to full peek with readout text. |

### 13.5 HP / UI Audit Checklist

When implementing micro-peeks, each step-on tile must be audited to confirm the underlying game logic actually fires and the HUD reflects the change. The micro-peek is purely visual — if the HP bar doesn't move, the peek is lying to the player.

#### Per-Tile Audit Steps

For every step-on micro-peek variant, verify:

- [ ] **HP delta fires**: `HazardSystem.checkTile()` applies the documented damage (TRAP:1, FIRE:2, SPIKES:3, POISON:1). Step on the tile in-game and confirm the HP bar decreases by the correct amount.
- [ ] **Energy delta fires** (POISON only): Energy bar decreases by 1 in addition to HP.
- [ ] **HUD bar color responds**: HP bar turns red below 30%, orange below 60%. Confirm the bar visually updates on the same frame the micro-peek fires, not one frame later.
- [ ] **Combat log line appears**: The emoji + damage string ("⚙️ TRAP! -1 HP") renders in the HUD combat log. Confirm it doesn't get swallowed by a concurrent peek animation.
- [ ] **Status effects apply**: POISON should apply a poison debuff icon. FIRE may apply a burn. Verify the status icon row updates.
- [ ] **Death routing works**: If HP reaches 0, confirm depth-aware death handling fires (depth 1-2: bonfire respawn + 25% gold penalty + debuffs; depth 3+: permadeath → hero cycle shift). The micro-peek should be killed instantly on death — no orphan overlay.
- [ ] **Bonfire rest works**: Stepping on BONFIRE tile, then pressing OK via InteractPrompt, triggers `restAtBonfire()`. Verify HP restores, time advances, WELL_RESTED buff applies (exterior) or brief rest fires (dungeon). Micro-peek should coexist with the InteractPrompt without z-index conflict.
- [ ] **Collectible pickup works**: Walking over COLLECTIBLE/DETRITUS actually adds the item to inventory via `WorldItems`. Micro-peek fires on the same frame. Verify the pickup toast and the micro-peek don't visually collide.
- [ ] **Audio plays**: The micro-peek sound key resolves in AudioSystem and doesn't conflict with the HazardSystem's existing `zap` SFX. Decide: layer both sounds, or let the micro-peek sound replace the hazard sound.
- [ ] **Tile consumption**: TRAP becomes EMPTY after stepping on it. Confirm the micro-peek doesn't re-fire if the player steps off and back onto the now-empty tile.
- [ ] **No double-fire**: Micro-peek fires exactly once per tile entry. Moving within the same tile (turning in place) does not re-trigger.

#### Global Audit Steps

- [ ] **Micro-peek + full peek coexistence**: If a player steps on a TRAP tile while facing a DOOR tile, the micro-peek (caltrop) plays simultaneously with the full door peek. Confirm no z-index collision, no FSM confusion.
- [ ] **Rapid step-on sequence**: Walking quickly over TRAP → FIRE → SPIKES in consecutive tiles. Confirm each micro-peek fires and auto-dismisses correctly, with the "only one at a time" kill rule working.
- [ ] **Performance**: Micro-peeks with particles (embers, dust) must not drop frames. Budget: max 8 particles per micro-peek, canvas-rendered, pooled from the existing particle system (§3.4).
- [ ] **Magic Remote compatibility**: Micro-peeks must not steal focus from the InteractPrompt or any button overlay. `pointer-events: none` on the micro-peek container.

### 13.6 Micro-Peek BoxForge Authoring Notes

All micro-peek variants should be authored in BoxForge with these conventions:

- Use **P1 only** (idle phase). P2/P3 are unused since micro-peeks have no hover/open states.
- Set the **phaseAnim** to carry the impact feel: squish for impacts (caltrop, spikes), bounce for pops (collectible, detritus), poke for eruptions (fire, poison).
- Keep geometry **small**: 40-80px base size for step-on peeks, 60-120px for face-to peeks. The `scale: 0.6` in the descriptor further reduces viewport footprint.
- For **orb variants** (fire, poison, water, torch): author the orb as the primary element. No box shell needed.
- For **pyramid variants** (caltrop, spikes): author as inverted pyramids. Use the `invert` flag in BoxForge.
- For **box variants** (collectible, detritus, mailbox, terminal): author as minimal boxes with the appropriate texture. Lid animation is unused for step-on peeks but can be set for face-to variants.
- Export the CSS from BoxForge and store it alongside the peek descriptor registration in `peek-system.js`.

### 13.7 Context-Gated Peeks (Conditional Classification)

Some tiles do not have a single fixed peek type. Their classification depends on game state: player inventory, tile ownership, world flags, or tile phase. The PeekSystem must evaluate a gate function before choosing which peek path to follow.

#### 13.7.1 Torch Tiles — Inventory-Gated Two-Phase Loop

Torches are the cleaning loop's primary lighting verb. A lit torch must be extinguished before it can be restocked. The peek type depends on torch state AND player inventory.

**TORCH_LIT (30) — Conditional gate peek:**

| Condition | Peek Type | Variant | Interaction |
|-----------|-----------|---------|-------------|
| Player has water container or pressure hose equipped | **one-button action peek** | `torch-extinguish` | Single button: "Extinguish". On activate: tile mutates TORCH_LIT→TORCH_UNLIT, light source removed. |
| Player has NO water/hose | **passive micro face-to** | `torch-glow` | Warm glow orb (fire palette, 5 rings). No action available — player sees the flame but cannot interact. Dismiss on turn-away. |

**Phase animations for TORCH_LIT orb:**
- P1 idle: `lit` state — full fire palette, 7 rings, spin animation. The flame is alive.
- P1 hover: `ember` state — fire palette dims to ember, 5 rings. The flame flickers lower.
- P1 activation: `smoke` state — fire palette shifts to grey/white wisps, 3 rings. Extinguish in progress.

**TORCH_UNLIT (31) — Full peek (3-slot restock menu):**

Always a **full peek** — TorchPeek opens the 3-slot fuel UI (see `torch-peek.js`, `torch-state.js`). Player fills slots with fuel items from inventory. Biome-matched fuel scores higher readiness.

| Peek Type | Variant | BoxForge Shape | Interaction |
|-----------|---------|----------------|-------------|
| **full peek** | `torch-restock` | Box (wall bracket, 3 slot indicators) | Number keys 1-3 to select slot, drag fuel from inventory. Slot states: empty→fuel_dry→fuel_hydrated. |

**Phase animations for TORCH_UNLIT orb:**
- P1 idle: `ember` state — residual warmth, faint orange glow, 3 rings. The bracket still has heat.
- P1 hover: `smoke` state — grey wisps drift upward, 2 rings. The torch is cooling.
- P1 activation: no orb — bare handle/bracket geometry only. All fuel consumed or being placed. The BoxForge variant shows the iron bracket with empty slot indicators.

**Design intent:** The two-phase loop (extinguish → restock) means the player interacts with each torch twice. The extinguish step is quick (one button, micro-peek feel) while the restock step is deliberate (full peek, fuel management). Pressure washing skips the careful extinguish but ruins fuel state — see `LIGHT_AND_TORCH_ROADMAP.md` §3c.

#### 13.7.2 Rest Tiles — Ownership-Gated Two-Tier System

Rest tiles fall into two tiers based on whether the player owns/is assigned to the rest location. This distinction matters narratively (Act 2 housing reassignment, §5.4 of `ACT2_NARRATIVE_OUTLINE.md`) and mechanically (day advance is irreversible).

**Tier 1 — Full Rest (owned/assigned, irreversible day advance):**

| Tile | Condition | Peek Type | Time Cost | Effects | Verb |
|------|-----------|-----------|-----------|---------|------|
| BED (27) | `housing_status` includes this bed's floor | **full peek** | 8h (advance to dawn) | Full HP/energy, clear TIRED, grant WELL_RESTED (before midnight) | "Sleep" |
| HEARTH (29) | On player's assigned housing floor | **full peek** (multi-button: Rest / Incinerate) | 8h (advance to dawn) | Same as owned BED + incinerator access | "Rest" |

Owned bed and hearth share identical rest mechanics with BedPeek: day counter display, hero arrival countdown, `[F] Sleep → Advance to Dawn` confirmation, full TransitionFX fade. These are the only tiles that grant WELL_RESTED.

**Tier 2 — Nap (public/unassigned, partial rest, time cost 1-5h):**

| Tile | Condition | Peek Type | Time Cost | Effects | Verb |
|------|-----------|-----------|-----------|---------|------|
| BONFIRE (18) | Always nap tier | **one-button action peek** | 3h | Full HP/energy, clear TIRED, NO WELL_RESTED, set respawn point | "Nap" |
| BED (27) | NOT on player's assigned floor | **one-button action peek** or micro face-to | 2h | Clear TIRED only (partial heal: 50% HP), NO WELL_RESTED | "Nap" |
| COT (48) | Always nap tier | **one-button action peek** | 2h | Clear TIRED only (partial heal: 30% HP), NO WELL_RESTED | "Nap" |
| BENCH (41) | Always nap tier | **one-button action peek** | 1h | Clear TIRED only (no heal), NO WELL_RESTED | "Sit & Rest" |
| HEARTH (29) | NOT on player's assigned floor | **one-button action peek** | 3h | Full HP/energy, clear TIRED, NO WELL_RESTED + incinerator | "Rest" |

**Nap time costs ranked:** Bench (1h) < Cot/non-owned Bed (2h) < Bonfire/non-owned Hearth (3h). Lower time cost = less recovery. The player trades rest quality for time preservation.

**Ownership gate implementation:**

```javascript
function isOwnedRestTile(tile, floorId) {
  var housingFloor = Player.getFlag('housing_floor');  // e.g. "1.6", "3.2", etc.
  if (!housingFloor) return false;
  return floorId === housingFloor && (tile === TILES.BED || tile === TILES.HEARTH);
}
```

The `housing_floor` flag tracks the player's current assigned quarters. It starts as `"1.6"` (HomeBnB), changes during Act 2 Move Night (see `ACT2_NARRATIVE_OUTLINE.md` §5.4), and can be reclaimed in Act 3. When `housing_status === 'reassigned'` and the player hasn't yet moved, `housing_floor` updates to the new assignment.

#### 13.7.3 Curfew-Nap Failstate

If a nap's time cost would push the clock past curfew (02:00), the game must handle the edge case. Two possible outcomes depending on location:

**Option A — Wake Groggy (safe location nap):**
If the player naps at a tile inside a building (depth 2) or at an exterior bonfire with a tent billboard, they wake at the nap tile with the GROGGY debuff (`walkTimeMult 1.25`, 1-day duration). The nap consumed all remaining night hours. The player overslept but is safe.

**Option B — Hero Rescue Failstate (unsafe location nap):**
If the player naps on a public bench, cot in an open area, or any rest tile on an exterior floor without shelter, curfew enforcement triggers. The heroes find the player passed out and return them to their assigned housing. This is the Stardew Valley collapse: fade to black, wake up at home, lose a percentage of gold (10%), gain GROGGY debuff.

**Gate logic:**

```javascript
function napCurfewCheck(tile, floorId, napHours) {
  var hoursUntilCurfew = DayCycle.hoursUntilCurfew();
  if (napHours <= hoursUntilCurfew) return 'safe';  // nap fits, no problem

  var depth = FloorManager.getDepth(floorId);
  var isSheltered = (depth === 2) ||
                    (tile === TILES.BONFIRE) ||
                    (tile === TILES.HEARTH);
  return isSheltered ? 'groggy' : 'rescue';
}
```

**Bonfire and hearth count as sheltered** because bonfires have tent billboards (⛺) and hearths are indoors by definition. Benches and cots in open areas do not.

**UI flow for curfew-nap:**
1. Player faces rest tile, presses interact
2. One-button action peek shows "Nap (Xh)" button
3. If `napCurfewCheck` returns `'groggy'`: button text changes to "Nap (⚠️ past curfew — wake groggy)"
4. If `napCurfewCheck` returns `'rescue'`: button text changes to "Nap (⚠️ heroes will find you)" or button is disabled with warning toast
5. Player confirms or cancels

#### 13.7.4 Phase Animation Contract for Rest Tiles

Rest tile BoxForge variants use phase animations to communicate rest availability:

**BONFIRE (18) orb phases:**
- P1 idle: `lit` state — fire palette, 9 rings. The dragonfire burns steadily.
- P1 hover: `ember` state — fire dims, warmer tone. Approaching the warmth.
- P1 activation: `rest` state — fire palette shifts to golden amber, slow pulse. Resting.

**HEARTH (29) orb phases (non-owned):**
- Same as BONFIRE but with 7 rings and stone-frame box attachment.

**BED (27) phases (non-owned, nap mode):**
- P1 idle: no orb — just the low box with fabric texture. Passive furniture.
- P1 hover: subtle warm glow emanates from box. The bed looks inviting.
- P1 activation: brief sleep-cloud sprite overlay (zzz). Quick nap animation.

**COT (48) phases:**
- P1 idle: no orb — flat canvas box, drab texture. Spartan.
- P1 hover: faint warm glow. Less inviting than bed.
- P1 activation: same sleep-cloud as bed but smaller/shorter.

**BENCH (41) phases:**
- P1 idle: no orb — low-profile box. Just a bench.
- P1 hover: no change. Benches don't beckon.
- P1 activation: player sits down sprite overlay (brief, 400ms).

---

## 14. Full Micro-Peek Tile Coverage Matrix

Every tile in the game (IDs 0-48) categorized by peek type. This is the single source of truth for which tiles get which kind of peek feedback.

| ID | Tile | Walkable | Peek Type | Variant | Section Reference |
|----|------|----------|-----------|---------|-------------------|
| 0 | EMPTY | yes | none | — | — |
| 1 | WALL | no | none | — | — |
| 2 | DOOR | walk-through | **full peek** | door | §6.1 |
| 3 | DOOR_BACK | walk-through | **full peek** | door | §6.1 |
| 4 | DOOR_EXIT | walk-through | **full peek** | door | §6.1 |
| 5 | STAIRS_DN | walk-through | **full peek** | door | §6.1 |
| 6 | STAIRS_UP | walk-through | **full peek** | door | §6.1 |
| 7 | CHEST | no | **full peek** | chest | §6.4 |
| 8 | TRAP | yes | **micro step-on** | caltrop | §13.3.1 |
| 9 | WATER | yes | **micro step-on** | splash | §13.3.2 |
| 10 | PILLAR | no | none | — | §13.4 |
| 11 | BREAKABLE | no | **full peek** | crate | §6.3 |
| 12 | SHOP | walk-through | **full peek** | merchant | §6.6 |
| 13 | SPAWN | yes | none | — | — |
| 14 | BOSS_DOOR | walk-through | **full peek** | door (boss) | §6.1 |
| 15 | FIRE | yes | **micro step-on** | flame-burst | §13.3.1 |
| 16 | SPIKES | yes | **micro step-on** | spike-jab | §13.3.1 |
| 17 | POISON | yes | **micro step-on** | toxic-cloud | §13.3.1 |
| 18 | BONFIRE | no | **context-gated**: nap-tier one-button action peek (all contexts) | flame-rest | §13.7.2 |
| 19 | CORPSE | no | **full peek** | corpse | §6.5 |
| 20 | COLLECTIBLE | yes | **micro step-on** | pickup-flash | §13.3.2 |
| 21 | TREE | no | none | — | §13.4 |
| 22 | SHRUB | no | none | — | §13.4 |
| 23 | PUZZLE | yes | **full peek** (delegated) | puzzle | §6.9 |
| 24 | LOCKED_DOOR | no | **full peek** | locked | §6.2 |
| 25 | BOOKSHELF | no | **full peek** | bookshelf | §6.7 |
| 26 | BAR_COUNTER | no | **full peek** | bar-counter | §6.8 |
| 27 | BED | no | **context-gated**: full peek if owned (§13.7.2 Tier 1), nap action peek if not owned (§13.7.2 Tier 2) | bed-rest / bed-sleep | §13.7.2 |
| 28 | TABLE | no | **micro face-to** | table-inspect | §13.4 |
| 29 | HEARTH | no | **context-gated**: full peek if owned (Rest/Incinerate, §13.7.2 Tier 1), nap action peek if not owned (§13.7.2 Tier 2) | hearth-glow / hearth-rest | §13.7.2 |
| 30 | TORCH_LIT | no | **context-gated**: one-button action peek if player has water/hose (§13.7.1), passive micro face-to if not | torch-extinguish / torch-glow | §13.7.1 |
| 31 | TORCH_UNLIT | no | **full peek** (3-slot restock menu) | torch-restock | §13.7.1 |
| 32 | ROAD | yes | none | — | §13.3.3 |
| 33 | PATH | yes | none | — | §13.3.3 |
| 34 | GRASS | yes | none (deferred) | grass-rustle | §13.3.3 |
| 35 | FENCE | no | none | — | §13.4 |
| 36 | TERMINAL | no | **micro face-to** → full peek | terminal-boot | §13.4 |
| 37 | MAILBOX | no | **micro face-to** → full peek | mailbox-peek | §13.4 |
| 38 | DUMP_TRUCK | no | **micro face-to** | truck-inspect | §13.4 |
| 39 | DETRITUS | yes | **micro step-on** | scrap-grab | §13.3.2 |
| 40 | WELL | no | **full peek** | well | §11.1 |
| 41 | BENCH | no | **context-gated**: nap-tier one-button action peek (rest verb, §13.7.2 Tier 2) + social full peek (if NPC present) | bench-rest / bench-social | §13.7.2, §11.1 |
| 42 | NOTICE_BOARD | no | **full peek** | notice-board | §11.1 |
| 43 | ANVIL | no | **full peek** | anvil | §11.1 |
| 44 | BARREL | no | **full peek** | barrel | §11.1 |
| 45 | CHARGING_CRADLE | no | **full peek** | charging-cradle | §11.1 |
| 46 | SWITCHBOARD | no | **full peek** | switchboard | §11.1 |
| 47 | SOUP_KITCHEN | no | **full peek** | soup-kitchen | §11.1 |
| 48 | COT | no | **context-gated**: nap-tier one-button action peek (rest verb, §13.7.2 Tier 2) | cot-nap | §13.7.2, §11.1 |

---

## 15. Proposed Tile Peek Registry (IDs 49–75+)

Cross-referenced from five design roadmaps. Every proposed tile beyond the current runtime set (0–48) is cataloged here with its peek classification, BoxForge authoring requirements, and source document. This section replaces ad-hoc notes scattered across roadmaps with a single authoritative peek plan.

**Source documents:**

- `ARCHITECTURAL_SHAPES_ROADMAP.md` — roofs, awnings, platforms, wall-mounted props, windows (IDs 60–75+)
- `LIVING_INFRASTRUCTURE_BLOCKOUT.md` — creature verb tiles, economy pipeline (IDs 49–59)
- `D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md` — creature capacity, verb-field propagation rules
- `cozy_interiors_design.md` — future minigame tiles (no IDs assigned), interior interaction refinements
- `textures_roadmap.md` — texture status, missing assets, rendering geometry type per tile

### 15.1 Dungeon Creature Verb Tiles (IDs 49–54)

These tiles are the behavioral anchors for the dungeon creature AI. Most are walkable floor markings or low-profile props. Peek requirements vary: some need micro-peeks for step-on feedback when the player cleans them; others need a brief face-to inspection peek to communicate their state.

| ID | Tile | Walk | Opaque | Peek Type | Variant | BoxForge Shape | Interaction Notes |
|----|------|------|--------|-----------|---------|----------------|-------------------|
| 49 | ROOST | yes | no | **micro step-on** | `roost-scatter` | — (sprite overlay) | Overhead anchor for flying creatures. Player stepping beneath triggers startled-scatter micro-peek: bat/wing sprites burst outward. No 3D geometry — pure particle/sprite effect. Cleaning the roost removes creature rest anchor. |
| 50 | NEST | no | yes | **micro face-to** | `nest-inspect` | Box (low, debris texture, no lid) | Ground creature rest + eat node. Face-to peek shows nest occupancy state (empty/occupied/capacity). Player can clean for readiness bonus — cleaning peek shows sweep animation. Capacity: 2 creatures, 4-tick cooldown. |
| 51 | DEN | no | yes | **micro face-to** | `den-inspect` | Box (mid-height, hollow interior) | Pack creature congregation point. Face-to shows den state and creature count. Larger than nest — box variant should convey alcove/hollow shape. Capacity: 3 creatures, 6-tick cooldown. |
| 52 | FUNGAL_PATCH | yes | no | **micro step-on** | `fungal-glow` | Orb (poison palette but green-blue, unlit state, 3 rings) | Bioluminescent floor growth — eat source for organic creatures. Step-on micro-peek: soft green orb blooms at feet (250ms). Player can clean for readiness bonus but removes creature eat-node — tension mechanic. Also serves as weak 2-tile light source. |
| 53 | ENERGY_CONDUIT | no | yes | **full peek** | `conduit` | Box (tall, metal texture) + Pyramid (spark, spinning) | Construct recharge station. Full peek with multi-button: Inspect / Disable / Harvest. Sparking pyramid attachment on box conveys electrical hazard. Capacity: 1 construct, 8-tick cooldown, radius-3 pushback. Dungeon equivalent of CHARGING_CRADLE(45). |
| 54 | TERRITORIAL_MARK | yes | no | **micro step-on** | `mark-scuff` | — (floor decal overlay) | Guard patrol anchor. Step-on micro-peek: brief scorch/claw mark highlight (300ms). Cleaning removes guard's anchor point, making patrol unpredictable. No 3D geometry — CSS overlay effect. |

### 15.2 Economy & Corpse Recovery Pipeline (IDs 55–59)

Medical and processing infrastructure for the corpse recovery economy. All are opaque face-to tiles with full peek overlays showing work-station status and duty actions.

| ID | Tile | Walk | Opaque | Peek Type | Variant | BoxForge Shape | Interaction Notes |
|----|------|------|--------|-----------|---------|----------------|-------------------|
| 55 | STRETCHER_DOCK | no | yes | **full peek** | `stretcher` | Box (low, canvas + metal frame) | Medic staging point. Full peek: single-action "Dispatch Medic" or status readout showing queue. Located in Clinic/Triage (Floor 2). |
| 56 | TRIAGE_BED | no | yes | **full peek** | `triage-bed` | Box (mid-height, white fabric, red cross) | Clinical processing station. Full peek: multi-button Examine / Treat / Transfer. 2 beds per clinic. Medic duty anchor tile. |
| 57 | MORGUE_TABLE | no | yes | **full peek** | `morgue-slab` | Box (mid-height, stone/metal, no lid) | Corpse conversion surface. Full peek: multi-button Process / Preserve / Release. Located in Morgue (Floor 3) and Black Market Chop Room (hidden dungeon). |
| 58 | INCINERATOR | no | yes | **full peek** | `incinerator` | Box (tall, iron grate) + Orb (fire, ember state) | Corpse disposal + construct heat source. Full peek: multi-button Incinerate / Harvest Ash / Inspect. Fire orb attachment conveys active burn. Shared with Smelter access. |
| 59 | REFRIG_LOCKER | no | yes | **full peek** | `refrig-locker` | Box (tall, metal panel, top-hinge lid) | Cold storage / preservation. Full peek: single-action Open or inventory grid (like stash chest). Prevents decay. Located in Morgue and Clinic. |

### 15.3 Architectural Shapes — Peaked Roofs (IDs 60–64)

Solid roof tiles forming pitched skylines. All are passive, non-interactive, opaque walls with no peek of any kind. Listed here for completeness.

| ID | Tile | Walk | Opaque | Peek Type | Notes |
|----|------|------|--------|-----------|-------|
| 60 | ROOF_EAVE_L | no | yes | **none** | Left eave, 0.20× height. Passive skyline geometry. |
| 61 | ROOF_SLOPE_L | no | yes | **none** | Left slope, 0.25× height. |
| 62 | ROOF_PEAK | no | yes | **none** | Ridge beam, 0.30× height. |
| 63 | ROOF_SLOPE_R | no | yes | **none** | Right slope, mirror of 61. |
| 64 | ROOF_EAVE_R | no | yes | **none** | Right eave, mirror of 60. |

### 15.4 Architectural Shapes — Awnings, Platforms, Wall Props (IDs 65–69)

Mixed architectural elements. Platforms (STOOP, DECK) are walkable and may warrant a subtle step-on micro-peek for elevation feedback. Wall-mounted props are cosmetic.

| ID | Tile | Walk | Opaque | Peek Type | Variant | Notes |
|----|------|------|--------|-----------|---------|-------|
| 65 | AWNING | no | yes | **none** | — | Thin horizontal beam/canopy above doors. Purely visual. |
| 66 | STOOP | yes | no | **micro step-on** (deferred) | `step-up` | Raised entry platform. Optional: subtle elevation-change micro-peek (100ms pop). Low priority — may never need a peek. |
| 67 | DECK | yes | no | **micro step-on** (deferred) | `step-up` | Raised boardwalk platform. Same deferred treatment as STOOP. |
| 68 | WALL_PLANTER | no | yes | **none** | — | Cosmetic wall-mounted planter. No interaction. |
| 69 | WALL_HVAC | no | yes | **none** | — | Cosmetic wall-mounted AC unit. No interaction. |

### 15.5 Architectural Shapes — Interior Windows (IDs 70–75+)

Painted-on window textures composited onto wall tiles. All are non-interactive, non-walkable, opaque. No peek needed. Future phases (true window transparency) would remain peek-less.

| ID | Tile | Walk | Opaque | Peek Type | Notes |
|----|------|------|--------|-----------|-------|
| 70 | WALL_WINDOW_WARM | no | yes | **none** | Lit window (tavern glow). Optional animated flicker. |
| 71 | WALL_WINDOW_DARK | no | yes | **none** | Unlit window (closed/night). |
| 72 | WALL_WINDOW_SKY | no | yes | **none** | Upper story facing out. Optional cloud drift. |
| 73 | WALL_WINDOW_STAINED | no | yes | **none** | Cathedral stained glass. |
| 74 | WALL_WINDOW_SHUTTER | no | yes | **none** | Closed shuttered window. |

### 15.6 Future Minigame & Cozy Interior Tiles (No IDs Assigned)

From `cozy_interiors_design.md`. These are post-jam interactive tiles that will need full peeks with custom render delegates (like PuzzlePeek in §6.9). No IDs are assigned yet — they will draw from the 75+ range when implemented.

| Tile | Peek Type | Variant | BoxForge Shape | Interaction Notes |
|------|-----------|---------|----------------|-------------------|
| CARD_TABLE | **full peek** (delegated) | `card-table` | Box (table height, green felt) | Minigame: sort cards by suit/power for stat bonus. Custom overlay like PuzzlePeek. Location: Guild break room (Floor 1.3). |
| TROPHY_SHELF | **full peek** | `trophy-shelf` | Box (tall, glass front, shelves) | Display: view achievement emojis + cumulative bonuses. Location: Home (Floor 1.6). |
| COOKING_POT | **full peek** (delegated) | `cooking-pot` | Box (mid-height, iron pot) + Orb (fire, small) | Minigame: 2-ingredient recipe combination for stat effects. Location: Inn kitchen. |
| MUSIC_BOX | **micro face-to** | `music-box` | Box (small, ornate, top hinge lid) | Ambient: lid pops open, melody plays, subtle stat modifier. Location: Home (Floor 1.6). |

### 15.7 Billboard Sprites (No Tile IDs — Placed via Sprite System)

From `ARCHITECTURAL_SHAPES_ROADMAP.md` Phase 6. These are fractional-grid sprites, not tile-based, so they don't get tile IDs or peek registrations. Listed for completeness.

Potted plant, bench (sprite), lamp post, hanging sign, rain barrel — all cosmetic, no interaction, no peek.

---

## 16. Cross-Reference Summary

Total peek coverage across all current and proposed tiles (IDs 0–74, plus unassigned minigame tiles):

| Peek Type | Count | Tile IDs |
|-----------|-------|----------|
| **Full peek** (screen takeover, FSM, labels, menu) | 19 | 2-6, 7, 11, 12, 14, 19, 23, 24, 25, 26, 31, 40, 42-47, 53, 55-59 |
| **Full peek — delegated** (PeekSystem lifecycle + custom render) | 3 | 23 (puzzle), CARD_TABLE, COOKING_POT |
| **Context-gated** (peek type depends on game state) | 7 | 18 (bonfire), 27 (bed), 29 (hearth), 30 (torch_lit), 41 (bench), 44 (barrel), 48 (cot) |
| **Micro step-on** (fire-and-forget, auto-dismiss) | 10 | 8, 9, 15, 16, 17, 20, 39, 49, 52, 54 |
| **Micro face-to** (hold while facing, no menu) | 6 | 28, 36, 37, 38, 50, 51, MUSIC_BOX |
| **Micro step-on — deferred** (low priority, may skip) | 2 | 66, 67 |
| **None** (passive, cosmetic, structural) | ~20 | 0, 1, 10, 13, 21, 22, 32-35, 60-65, 68-74 |
| **Full peek — future** (needs ID assignment) | 2 | TROPHY_SHELF, COOKING_POT |

**Context-gated breakdown:** TORCH_LIT(30) = inventory gate (water/hose → action peek, else passive micro). TORCH_UNLIT(31) = always full peek. BED(27) = ownership gate (owned → full peek sleep, else nap action). HEARTH(29) = ownership gate (owned → full peek rest+incinerate, else nap action). BONFIRE(18) = always nap-tier action peek. BENCH(41) = nap action + social verb dual. COT(48) = always nap-tier action peek.

**Total tiles requiring BoxForge authoring:** ~46 variants (19 full + 3 delegated + 7 context-gated × ~2 variants each + 10 micro step-on + 6 micro face-to).

**Source documents to keep synchronized:**

| Document | Tile Range | Relationship to This Roadmap |
|----------|------------|------------------------------|
| `ARCHITECTURAL_SHAPES_ROADMAP.md` | 60–74+ | §15.3–15.5: peek classification (mostly "none") |
| `LIVING_INFRASTRUCTURE_BLOCKOUT.md` | 49–59 | §15.1–15.2: creature + economy peek descriptors |
| `D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md` | 49–54 | §15.1: capacity/cooldown rules affect peek state display |
| `cozy_interiors_design.md` | 25, 26, 27+ | §15.6: minigame tiles, interior interaction refinements |
| `textures_roadmap.md` | 0–59 | §14: texture availability gates BoxForge authoring |

---

## 17. Migration Addendum (Post-Jam)

Add these phases after Section 7 migration:

### Phase 6: BoxForge Pass For All Active Peek Variants

1. Rebuild geometry profiles for all existing peek variants (§6.1–6.9) in BoxForge.
2. Patch descriptor/BoxAnim values from exported tool settings.
3. Run visual verification on all currently interactive tiles plus IDs `40-48`.
4. Pre-author templates for IDs `49-59` to reduce future integration friction.

### Phase 7: Micro-Peek Implementation

1. Add `PeekSystem.microPeek(descriptor)` method — fire-and-forget overlay with auto-dismiss timer.
2. Author all step-on micro-peek variants in BoxForge (§13.3.1, §13.3.2): caltrop, flame-burst, spike-jab, toxic-cloud, flame-rest, splash, pickup-flash, scrap-grab.
3. Wire into `HazardSystem.checkTile()` — call `PeekSystem.microPeek()` immediately after damage/effect application.
4. Author face-to micro-peek variants in BoxForge (§13.4): torch-glow, torch-dead, bed-rest, hearth-glow, table-inspect, truck-inspect, mailbox-peek, terminal-boot.
5. Wire face-to micro-peeks into `PeekSystem.update()` with simplified facing check (no debounce, no FSM — just show/hide).
6. Run HP/UI audit checklist (§13.5) for every step-on variant.

### Phase 8: Dungeon Creature + Economy Tile Peeks

1. Author creature verb tile peek variants in BoxForge (§15.1): nest-inspect, den-inspect, conduit (full peek with pyramid attachment), roost-scatter (sprite), fungal-glow (orb), mark-scuff (overlay).
2. Register creature tile descriptors in PeekSystem. ENERGY_CONDUIT(53) gets a full peek with multi-button (Inspect/Disable/Harvest). Others get micro-peek registrations.
3. Author economy tile peek variants in BoxForge (§15.2): stretcher, triage-bed, morgue-slab, incinerator (box + fire orb attachment), refrig-locker.
4. Register economy tile descriptors with multi-button overlay patterns (§12).
5. Validate creature tile micro-peeks coexist with dungeon hazard micro-peeks (player steps on FUNGAL_PATCH while TRAP is adjacent — no collision).

### Phase 9: Minigame + Cozy Interior Tile Peeks

1. Assign tile IDs to CARD_TABLE, TROPHY_SHELF, COOKING_POT, MUSIC_BOX from the 75+ range.
2. Author BoxForge variants for each.
3. CARD_TABLE and COOKING_POT use delegated peek pattern (like PuzzlePeek §6.9) — PeekSystem lifecycle with custom render overlay.
4. TROPHY_SHELF uses standard full peek with scrollable content.
5. MUSIC_BOX uses micro face-to with audio trigger.

### Phase 10: Particle + Audio Polish

1. Add new particle sets: `splash` (blue droplets), `poison` (green wisps), `sparks` (yellow-white for conduit), `scatter` (brown wing-beat for roost).
2. Add new SFX keys: `peek_crunch`, `peek_sizzle`, `peek_stab`, `peek_hiss`, `peek_campfire`, `peek_splash`, `peek_coin`, `peek_rustle`, `peek_spark`, `peek_scatter`, `peek_sweep`.
3. Verify micro-peek + full peek audio layering (no clipping, no cancellation).

Output artifacts:
- A checked-in BoxForge preset list (JSON or documented values) per peek variant.
- Completed HP/UI audit checklist with pass/fail per tile.
- Cross-reference validation: every tile ID 0–74+ has an explicit peek classification in §14 or §15.

---

*End of Document — v1.5 (updated Apr 8: §13.7 context-gated peeks for torches and rest tiles, ownership-gated rest tier system, curfew-nap failstate design, phase animation contracts, corrected §14 coverage matrix and §16 summary counts)*
       
# Peek System Roadmap
## Dungeon Gleaner — DC Jam 2026
### Version 1.0 — March 30, 2026

Standard Peek Architecture · Variant Registry · Animation Pipeline · Juice Budget

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
┌─────────────────────────────────────────────────────────┐
│ PeekSystem (Layer 2)                                     │
│                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ FacingCheck │→ │ Debounce     │→ │ Lifecycle FSM    │ │
│  │ (per frame) │  │ (configurable│  │ IDLE → SHOWING → │ │
│  │             │  │  per variant)│  │ OPEN → CLOSING → │ │
│  └────────────┘  └──────────────┘  │ IDLE             │ │
│                                     └──────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Variant Registry                                  │    │
│  │ { DOOR: doorDescriptor, CHEST: chestDescriptor, } │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ BoxAnim      │  │ LabelRenderer│  │ JuiceLayer     │  │
│  │ (3D box)     │  │ (inner+sub)  │  │ (glow, shake,  │  │
│  │              │  │              │  │  particles)    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.1 PeekDescriptor Schema

```javascript
PeekSystem.register(TILES.DOOR, {
  // ── Identity ──
  variant:     'door',           // BoxAnim variant name
  tileMatch:   function (tile) { return TILES.isDoor(tile); },
                                 // Custom match (OR use exact tile value)

  // ── Timing ──
  showDelay:   300,              // ms debounce before appearing
  openDelay:   150,              // ms after appear before lid opens
  holdTime:    0,                // 0 = hold while facing, >0 = auto-dismiss

  // ── Labels ──
  innerLabel:  function (ctx) { return ctx.targetLabel || '► Enter'; },
  subLabel:    function (ctx) {
    return 'exiting ' + ctx.currentLabel + '\n↳' + ctx.targetLabel;
  },

  // ── Colors ──
  glowColor:   function (ctx) { return ctx.isRetreat ? 'rgba(180,220,255,0.5)' : 'rgba(220,200,160,0.5)'; },
  labelColor:  function (ctx) { return ctx.isRetreat ? '#c0d8f0' : '#dcc8a0'; },

  // ── Juice ──
  juice: {
    entryAnim:   'fade',         // 'fade' | 'pop' | 'slide-up' | 'slam'
    openAnim:    'swing',        // 'swing' | 'slide-off' | 'flip' | 'shatter'
    glowPulse:   true,           // Pulsing glow while open
    particles:   null,           // null | 'sparkle' | 'dust' | 'embers'
    sound:       'peek_door',    // AudioSystem key
    haptic:      'light',        // 'none' | 'light' | 'medium' | 'heavy'
  },

  // ── Context builder ──
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

  // ── Custom lifecycle hooks (optional) ──
  onShow:      null,             // function(ctx, boxId) — after box created
  onOpen:      null,             // function(ctx, boxId) — after lid opens
  onHide:      null,             // function(ctx, boxId) — cleanup
  onInteract:  null              // function(ctx, boxId) — player pressed OK while peeking
});
```

### 2.2 Lifecycle FSM

```
IDLE ──(facing match + debounce)──→ SHOWING ──(openDelay)──→ OPEN
  ↑                                                            │
  │         ┌──(face away / move / interact)──┐                │
  │         ↓                                  │               │
  └── IDLE ←── CLOSING ←─(fade/close anim)────┘───────────────┘
```

States:
- **IDLE**: No peek active. Runs facing check every frame. Accumulates debounce timer when facing a registered tile.
- **SHOWING**: BoxAnim created, container fading in. Lid still closed.
- **OPEN**: Lid open, labels visible, glow pulsing. Holds as long as player faces the tile.
- **CLOSING**: Player turned away or moved. Close animation playing. BoxAnim.close() called. After fade completes → IDLE.

Key invariant: **only one peek active at a time.** If the player faces a new tile while a peek is OPEN, the system transitions through CLOSING first (fast-path: 100ms) before starting the new peek.

---

## 3. Juice Budget

Each peek variant gets a juice budget — a set of micro-animations that make the interaction feel physical and satisfying. The system provides these as composable building blocks, not per-variant code.

### 3.1 Entry Animations

| Animation | Description | Best For |
|-----------|-------------|----------|
| `fade` | Simple opacity 0→1 (default) | Subtle peeks (bookshelf, bar) |
| `pop` | Scale 0.7→1.0 with overshoot ease | Loot peeks (chest, crate, corpse) |
| `slide-up` | Translate from +30px below with ease-out | Door/stair peeks |
| `slam` | Scale 1.3→1.0 with bounce, screen shake 2px | Boss doors, locked doors |

### 3.2 Open Animations

| Animation | Description | Best For |
|-----------|-------------|----------|
| `swing` | Lid rotates on Y-axis hinge (current door behavior) | Doors, gates |
| `slide-off` | Lid translates right and fades (current crate behavior) | Crates, chests |
| `flip` | Lid flips 180° on X-axis (book opening) | Bookshelves |
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
| `sparkle` | ✨ ⭐ | 2/s | Chests, rare loot |
| `dust` | · • | 3/s | Crates, corpses, old books |
| `embers` | 🔥 💫 | 1.5/s | Bonfires, forges |
| `smoke` | 💨 | 1/s | Locked doors (frustration) |

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

These are placeholder keys — AudioSystem resolves them at runtime. Post-jam: generate procedural SFX with Web Audio oscillators.

---

## 4. Label System

### 4.1 Inner Label

Rendered inside the box's glow area (`.box3d-glow`). The descriptor's `innerLabel(ctx)` returns a string. PeekSystem creates a `<span>` with the variant's `labelColor`.

Font scaling rules:
- Short labels (≤8 chars): bold 28px
- Medium labels (≤16 chars): bold 22px
- Long labels (>16 chars): 18px, may wrap

### 4.2 Sub-Label

Rendered below the box as a DOM element. Two rows, left-aligned, monospace.

Row 1: Context line (e.g., "exiting The Promenade", "breakable crate", "Bone Sentinel corpse")
Row 2: Action hint (e.g., "↳ The Approach", "→ press [OK] to smash", "→ harvest remains")

The sub-label fades in 300ms after the lid opens. Font size: 38px (scaled from current 200% pass). Color: variant-specific with 0→0.9 opacity transition.

**Action hints must tell the player HOW to interact.** Not just "smash to loot" but "press [OK] to smash" or "hold [OK] to harvest". The control scheme is visible in the hint.

### 4.3 Tooltip Integration

When a peek opens, PeekSystem also pushes a one-line summary to `StatusBar.pushTooltip()` so the tooltip history captures every peek the player saw. This creates a breadcrumb trail: "Looked at: DOOR → The Approach", "Saw: breakable crate", "Found: Bone Sentinel corpse (42g)".

---

## 5. InteractPrompt Integration

The InteractPrompt and PeekSystem are complementary:

- **InteractPrompt** = bottom-center bar saying "[OK] Enter → The Approach" — tells the player what pressing OK will do.
- **PeekSystem** = center-screen 3D box preview — shows the player what's behind the tile.

Both fire when facing the same tile. Both dismiss when the player turns away.

Key rule: **PeekSystem never blocks InteractPrompt.** The peek container has `pointer-events: none`. The interact prompt's click zone is always active. The visual stacking is: peek box (center) above raycaster, interact prompt (bottom-center) above peek glow but below status bar.

When the player presses OK while a peek is open, PeekSystem fires the descriptor's `onInteract()` hook before the normal interaction. This allows peeks to play a closing animation synchronized with the interaction (e.g., door peek swings fully open as the transition starts).

---

## 6. Variant Catalog

### 6.1 Door Peek (DOOR, DOOR_BACK, DOOR_EXIT, STAIRS_DN, STAIRS_UP)

- **Box**: door variant (wooden lid, stone frame)
- **Inner label**: Target floor name
- **Sub-label**: "exiting [current] ↳ [target]"
- **Glow**: warm amber (advance) / cool blue (retreat) / crimson (boss)
- **Entry**: slide-up
- **Open**: swing (Y-axis hinge)
- **Juice**: Faint draft particles (dust) blow from the opening

### 6.2 Locked Door Peek (LOCKED_DOOR)

- **Box**: locked variant (crimson glow, iron texture)
- **Inner label**: 🔒 + lock name
- **Sub-label**: "requires [key name]"
- **Glow**: pulsing crimson
- **Entry**: slam (bounce + screen shake)
- **Open**: does NOT open — instead, shake animation fires on Y-axis
- **Juice**: Smoke particles, chain rattle SFX, reshake every 2s while facing
- **Special**: No `onInteract` — pressing OK triggers shake + Toast("Locked")

### 6.3 Crate Peek (BREAKABLE)

- **Box**: crate variant (wood planks, cross-grain lid)
- **Inner label**: "? LOOT ?" (amber)
- **Sub-label**: "breakable crate → press [OK] to smash"
- **Glow**: warm amber
- **Entry**: pop (scale overshoot)
- **Open**: slide-off (lid slides right)
- **Juice**: Dust particles on open, wood-slide SFX
- **Special**: After smash, lid shatters — transition to loot state

### 6.4 Chest Peek (CHEST)

- **Box**: chest variant (ornate, gold trim)
- **Inner label**: Loot preview (top item or "?" if sealed)
- **Sub-label**: "treasure chest → press [OK] to open"
- **Glow**: gold
- **Entry**: pop
- **Open**: flip (lid opens upward on X-axis hinge)
- **Juice**: Sparkle particles when opened, latch-click SFX

### 6.5 Corpse Peek (CORPSE)

- **Box**: coffin variant (dark wood, bone accents)
- **Inner label**: Enemy name + emoji
- **Sub-label**: "[enemy] corpse → press [OK] to harvest"
- **Glow**: spectral green (fresh) / bone white (dry)
- **Entry**: fade
- **Open**: slide-off (coffin lid slides)
- **Juice**: Dust particles, loot value hint in sub-label ("~42g")

### 6.6 Shop/Merchant Peek (SHOP)

- **Box**: button variant (merchant stall frame)
- **Inner label**: Shop name + faction emoji
- **Sub-label**: "[faction] merchant → press [OK] to browse"
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
- **Sub-label**: "[drink] → press [OK] to order ([price]g)"
- **Glow**: amber/copper
- **Entry**: fade
- **Open**: slide-off
- **Juice**: Liquid-slosh SFX (future)

### 6.9 Puzzle Peek (PUZZLE)

- **Box**: custom (no BoxAnim — uses own interactive overlay)
- **Inner label**: Puzzle state indicator
- **Sub-label**: "sliding puzzle → press [OK] to attempt"
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
1. DoorPeek → door descriptor
2. LockedDoorPeek → locked descriptor
3. CratePeek → crate descriptor (fix stuck bug via shared FSM)
4. ChestPeek → chest descriptor
5. CorpsePeek → corpse descriptor
6. MerchantPeek → merchant descriptor
7. BookshelfPeek → bookshelf descriptor
8. BarCounterPeek → bar-counter descriptor
9. PuzzlePeek → hybrid (PeekSystem lifecycle + custom render delegate)

Each migration: register descriptor, remove old module from index.html, test.

### Phase 3: Juice Layer (1-2 hours)

1. Implement entry animation variants (pop, slide-up, slam)
2. Implement open animation variants (already exist in CSS, just parameterize)
3. Implement particle emitter (canvas-rendered, 12-particle pool)
4. Wire SFX keys to AudioSystem
5. Add glow pulse (already exists, just standardize timing)

### Phase 4: Tooltip + InteractPrompt Integration (1 hour)

1. PeekSystem.onShow → `StatusBar.pushTooltip()` for history breadcrumbs
2. PeekSystem.onInteract → synchronized close animation
3. Sub-label action hints include control scheme ("[OK]")

### Phase 5: Cleanup (30 min)

1. Delete 9 old peek modules
2. Remove 9 `<script>` tags from index.html
3. Add 1 `<script>` tag for peek-system.js
4. Net reduction: ~2,200 lines → ~600 lines (one module + descriptors)

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

## § Cross-References

| Section | Links To | Relationship |
|---------|----------|-------------|
| §2 Architecture | engine/box-anim.js | BoxAnim provides the 3D box primitives |
| §4 Labels | engine/interact-prompt.js | Complementary — prompt shows action, peek shows preview |
| §4.3 Tooltip | engine/status-bar.js | StatusBar.pushTooltip() for history |
| §5 Integration | engine/game.js render loop | Single update call replaces 9 individual calls |
| §6 Variants | engine/tiles.js | TILES constants drive variant matching |
| §7 Migration | index.html script order | Layer 2 insertion point |

---

*End of Document — v1.0*

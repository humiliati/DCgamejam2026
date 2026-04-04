# Interactive Objects Audit — Rendering & Interaction

**Created**: 2026-04-03
**Scope**: Every non-WALL opaque tile that the player can see, face, or walk onto.
**Goal**: Ensure every interactive object has correct height, texture, interaction mode, and visual composition.

---

## Critical Bug Fixed: Biome Override Erasure

**Root cause**: When a biome provides its own `tileWallHeights` object in floor-manager.js,
it **completely replaces** the base contract defaults via `opts.tileWallHeights || { ... }`.
Tiles that relied on the base defaults (BONFIRE, FENCE, MAILBOX) lost their intended heights
in every biome that provided overrides — which was all of them.

**Fix**: Each biome's `tileWallHeights` now explicitly includes ALL tiles that need non-default
heights, not just the biome-specific ones. The base contract defaults serve as fallback only
when no biome data is provided.

**Same issue affects `textures`**: Biome texture overrides also replace the base entirely.
Tiles like BONFIRE (18), FENCE (35), MAILBOX (37) had no texture in biome overrides and
rendered as flat-color fallback. Fixed by adding texture entries to all exterior biomes.

---

## Critical Bug Fixed: Bonfire Menu Trap

**Root cause**: `_interact()` in game.js had no cooldown after the bonfire menu closed.
On LG Magic Remote, the OK button is used for both menu navigation and world interaction.
After closing the bonfire menu, the player is still facing the bonfire tile. The next OK
press immediately calls `restAtBonfire()` again — advancing the day, restoring HP, and
reopening the menu in an inescapable loop.

**Fix**: 800ms interaction cooldown (`_bonfireCooldownMs`) set when bonfire menu closes.
Checked in `_interact()` before the BONFIRE/HEARTH/BED case. Drained in `_tick()`.
Player can still turn and walk away during cooldown — only the interact is gated.

---

## Tile-by-Tile Audit

### Legend

- **Height**: tileWallHeights multiplier (relative to 1.0× base)
- **Ext**: Exterior biomes (exterior, promenade, lantern)
- **Int**: Interior biomes (home, inn, bazaar, office, watchpost, cellar_entry)
- **Dun**: Dungeon biomes (catacomb, cellar, foundry, sealab)
- ✅ = correct | ⚠️ = fixed this session | ❌ = still needs work | — = N/A (tile doesn't appear)

| Tile | ID | Walk | Opaq | Ext Height | Int Height | Dun Height | Texture | Visual Composition | Status |
|------|----|------|------|------------|------------|------------|---------|-------------------|--------|
| WALL | 1 | ✗ | ✓ | 3.5 | 2.0 | 1.0 | Per-biome | Solid wall | ✅ |
| DOOR | 2 | ✓ | ✗ | 3.5 | 2.0 | 1.0 | Per-biome | Auto-transition on step | ✅ |
| DOOR_BACK | 3 | ✓ | ✗ | 3.5 | 2.0 | 1.0 | Per-biome | Auto-transition on step | ✅ |
| DOOR_EXIT | 4 | ✓ | ✗ | 3.5 | 2.0 | 1.0 | Per-biome | Auto-transition on step | ✅ |
| STAIRS_DN | 5 | ✓ | ✗ | 3.5 | 2.0 | 1.0 | stairs_down | Auto-transition on step | ✅ |
| STAIRS_UP | 6 | ✓ | ✗ | 3.5 | 2.0 | 1.0 | stairs_up | Auto-transition on step | ✅ |
| CHEST | 7 | ✓ | ✗ | 1.0 | **0.7** ⚠️ | **0.65** ⚠️ | Per-biome | Auto-open on step + F-interact | ⚠️ Fixed |
| PILLAR | 10 | ✗ | ✓ | 1.5 | Per-biome | 1.0 | Per-biome | Decorative column | ✅ |
| BREAKABLE | 11 | ✗ | ✓ | 1.0 | 2.0 | **0.6** ⚠️ | crate_wood | Destructible crate | ⚠️ Partial |
| BONFIRE | 18 | ✓ | ✗ | **0.3** ⚠️ | 0.3 | 0.3 | **bonfire_ring** ⚠️ | Short stone ring + fire sprite + tent billboard | ⚠️ Fixed |
| TREE | 21 | ✗ | ✓ | 2.5 | — | — | tree_trunk | Solid trunk, perimeter backdrop | ✅ |
| SHRUB | 22 | ✗ | ✓ | 0.5 | — | — | shrub | Half-height, player sees over | ✅ |
| BOOKSHELF | 25 | ✗ | ✓ | — | 2.0 | — | wood_dark | Floor-to-ceiling shelves, TorchPeek overlay | ✅ |
| BAR_COUNTER | 26 | ✗ | ✓ | — | 0.8 (inn) | — | wood_dark | Counter height, tap interaction | ✅ |
| BED | 27 | ✗ | ✓ | — | 0.6 | — | bed_quilt | Low bed, BedPeek overlay for home | ✅ |
| TABLE | 28 | ✗ | ✓ | — | 0.7 | — | table_wood | Half-height, cozy inspection toast | ✅ |
| HEARTH | 29 | ✗ | ✓ | — | **2.5** | 1.0 | **hearth_riverrock** ⚠️ | Step-fill cavity (offset -0.18) + decor_hearth_fire + glow. Home: floor-to-ceiling chimney (2.5×) | ✅ Fixed |
| TORCH_LIT | 30 | ✗ | ✓ | 1.0 | 2.0 | 1.0 | torch_bracket_lit | Wall segment w/ torch decor + warm glow | ❌ See below |
| TORCH_UNLIT | 31 | ✗ | ✓ | 1.0 | 2.0 | 1.0 | torch_bracket_unlit | Wall segment w/ charred bracket | ❌ See below |
| FENCE | 35 | ✗ | ✓ | **0.4** ⚠️ | — | — | **fence_wood** ⚠️ | Half-height railing, player sees over | ⚠️ Fixed |
| TERMINAL | 36 | ✗ | ✓ | — | 0.6 | 0.6 | terminal_screen | Half-wall desk + CRT decor + sickly glow | ✅ |
| MAILBOX | 37 | ✗ | ✓ | **0.25** ⚠️ | — | — | **stone_rough** ⚠️ | Short stone base + MailboxSprites emoji billboard | ⚠️ Fixed |

---

## Remaining Issues

### TORCH_LIT / TORCH_UNLIT (30, 31) — No height fix needed, but visual issue

Torches are wall-mounted — they ARE wall segments with a torch bracket texture. Their
height should match the surrounding WALL tiles in each context:

- **Exterior**: Base wallHeight 1.0 → torches at 1.0. But biome WALL is 3.5. Torch tiles
  render at 1.0 next to 3.5 walls = tiny cube problem. **Not yet on any floor grid** —
  torches are dungeon-only in current content. When exterior torches are added, they'll
  need biome-specific heights matching WALL.
- **Interior**: Base wallHeight 2.0 → torches at 2.0 → matches walls. ✅
- **Dungeon**: Base wallHeight 1.0 → torches at 1.0 → matches walls. ✅

**Action**: No fix needed now. When torch tiles are added to exterior floors, add
`30: 3.5, 31: 3.5` to exterior biome tileWallHeights.

### BREAKABLE (11) — Partial fix

Fixed in dungeon biomes (0.6×). Not yet in interior biomes (defaults to 2.0× = full wall).
Breakables don't currently appear in interior floors, but if added, they'll need height entries.

### CHEST (7) — Unified Container System ✅ COMPLETE (Apr 3)

**Design decision**: Chests and crates use the **same peek interaction wrapper** with
**opposite resource flow**:

| | CRATE (BREAKABLE) | CHEST (small) | CHEST (stash) |
|---|---|---|---|
| **Resource flow** | Player deposits INTO slots | Player withdraws FROM slots | Player withdraws FROM slots |
| **Initial state** | Barely hydrated (30-70% pre-filled with junk) | Fully loaded (all slots filled with loot) | 256 empty slots + pre-loaded items |
| **Player action** | Fill empty slots from bag to earn restock credit | Take items from filled slots into inventory | Click to withdraw, arrow keys to scroll |
| **Seal/Complete** | All slots filled → seal → coin reward + d100 bonus | All slots emptied → chest depleted (tile persists) | Never depletes — permanent furniture |
| **Break risk** | Crate can break, destroying contents + restock chance | N/A — chests don't break | N/A |
| **Readiness** | Contributes to floor readiness score | No readiness contribution | No readiness contribution |
| **Interaction feel** | "This expects something from me" | "This yields something for me" | "My storage" |

**Depth-based chest behavior contract** (Apr 3):

| Depth | Floor pattern | Slot count | demandRefill | DragDrop zones | Seal | Behavior |
|-------|-------------|-----------|-------------|---------------|------|----------|
| 1 | floorN (surface) | 1-5 | false | None (withdraw-only) | No | Passive loot, walk away after taking |
| 2 | floorN.N (interior) | 8-12 | false | None (withdraw-only) | No | Persistent furniture, bigger capacity |
| 3+ | floorN.N.N (dungeon) | 1-5 | true | Registered (deposit+withdraw) | No | Restocking target, part of cleaning circuit |
| stash | Floor 1.6 home (19,3) | 256 | false | None (withdraw-only) | No | Scrollable grid UI, never depletes |

**Implementation** (all complete):
1. CHEST non-walkable, F-interact only — `PeekSlots.tryOpen()` → `CrateUI` ✅
2. CrateSystem TYPE.CHEST with `stash` and `demandRefill` flags ✅
3. CrateUI withdraw mode (number keys for small, click for all, grid for stash) ✅
4. CrateUI pointer/click handling via `_slotRects` hit-test array ✅
5. CrateUI scrollable 8-column grid renderer for stash containers ✅
6. PeekSlots chest-aware: skips DragDrop zones + seal for non-demandRefill chests ✅
7. Legacy `CombatBridge.openChest()` fallback removed ✅
8. Chests never disappear from grid — `depleted` flag for visual, tile persists ✅
9. Stash chests never marked depleted (permanent furniture) ✅
10. Work-keys chest at (19,3) uses `{ stash: true }` with key in slot 0 ✅

### Interaction Modes Summary

| Mode | Tiles | Trigger | Notes |
|------|-------|---------|-------|
| Step-on auto | DOOR, DOOR_BACK, DOOR_EXIT, STAIRS_DN, STAIRS_UP | Walk onto tile | Floor transition |
| ~~Step-on auto~~ | ~~CHEST~~ | ~~Walk onto tile~~ | ~~CombatBridge.openChest~~ **REMOVED — Apr 3** |
| F-interact (facing) | CHEST | Press OK while adjacent | PeekSlots → CrateUI withdraw mode |
| Step-on auto | COLLECTIBLE | Walk onto tile | WorldItems pickup, tile cleared |
| Step-on auto | Hazards (FIRE, TRAP, SPIKES, POISON) | Walk onto tile | Damage/death |
| F-interact (facing) | BONFIRE, HEARTH, BED | Press OK while adjacent | Opens bonfire menu (rest executes from menu button, NOT on interact). 🔥 icon. 800ms cooldown. |
| F-interact (facing) | TABLE | Press OK while adjacent | Cozy quip toast |
| F-interact (facing) | SHOP | Press OK while adjacent | Shop menu |
| F-interact (facing) | BOOKSHELF | Press OK while adjacent | TorchPeek overlay |
| F-interact (facing) | BAR_COUNTER | Press OK while adjacent | Tap boost |
| F-interact (facing) | MAILBOX | Press OK while adjacent | MailboxPeek overlay |
| F-interact (facing) | TERMINAL | Press OK while adjacent | TorchPeek overlay |
| Peek auto-show | BED (home) | Face from adjacent + debounce | BedPeek overlay with sleep gating |
| Peek auto-show | BOOKSHELF | Face from adjacent | TorchPeek overlay |
| NPC interact | AMBIENT | Press OK | Bark cycle |
| NPC interact | INTERACTIVE | Press OK | StatusBar inline dialogue |
| NPC interact | VENDOR | Press OK | Shop menu |
| NPC interact | DISPATCHER | Press OK | Dialogue tree or gate logic |

---

## Files Changed This Session

| File | Changes |
|------|---------|
| `engine/game.js` | Bonfire interaction cooldown (`_bonfireCooldownMs`) |
| `engine/floor-manager.js` | tileWallHeights + textures for all biomes (BONFIRE, FENCE, MAILBOX, CHEST, BREAKABLE) |
| `engine/texture-atlas.js` | Hearth porthole (transparent arch), `decor_hearth_fire` sprite, bonfire_ring porthole |
| `engine/raycaster.js` | Cavity pre-fill for HEARTH + BONFIRE, wobble animation, short wall back-face injection |
| `engine/floor-manager.js` | Bonfire wallDecor updated: `decor_hearth_fire` (was `decor_torch`) |
| `engine/mailbox-sprites.js` | Fixed double +0.5 sprite offset (corner → center) |
| `engine/bonfire-sprites.js` | Fixed double +0.5 sprite offset (corner → center) |
| `docs/LIGHT_AND_TORCH_ROADMAP.md` | Sprite-inside-wall technique (§2.5a-c) |
| `docs/BONFIRE_POLISH_STEPS.md` | Updated HEARTH visual description |
| `docs/PRESSURE_WASHING_ROADMAP.md` | Cross-ref to sprite-inside-wall for truck hose bay |

---

## Session 2 Fixes (sprite-inside-wall pass 2)

### Billboard sprite centering fix
Both `MailboxSprites` and `BonfireSprites` were adding `+0.5` to grid coordinates, but `_renderSprites` in the raycaster also adds `+0.5` for centering. This caused sprites to render at the tile CORNER (gx+1.0, gy+1.0) instead of center. Fixed by removing the redundant offset from both sprite builders.

---

## Session 3 Fixes (step-fill cavity pivot)

### Alpha-porthole approach abandoned
The sprite-inside-wall technique using alpha-transparent portholes in textures
with cavity pre-fill produced a flat "painted-on" result. The fire sprite on the
wall face completely covered the porthole area, negating any depth illusion.
Back-face injection for short walls also caused regressions (counter/table tops
stopped rendering). Both features reverted.

### Step-fill cavity technique adopted
Observation: PILLARs with `tileHeightOffset: 1.0` accidentally created the most
convincing cavity illusion in the engine via the step-fill (Doom rule). The gap
between the displaced wall and the floor plane reads as genuine depth with parallax.

Applied intentionally to HEARTH and BONFIRE:
- **HEARTH**: `tileHeightOffset: -0.35` in home biome. Fully opaque `hearth_riverrock`
  texture (porthole alpha removed). Fire sprite + glow composited in the step-fill
  lip band above the sunken wall column.
- **BONFIRE**: `tileHeightOffset: -0.25` in all exterior biomes. Fully opaque
  `bonfire_ring` texture. Same cavity rendering pipeline.
- **PILLAR**: `tileHeightOffset: 0` (was 1.0) — no longer floating above the floor.

### Raycaster changes
- Removed: cavity pre-fill blocks (front layer + back layer)
- Removed: short wall back-face injection (`_needBackFace` logic)
- Added: fire cavity rendering in sunken step-fill section — dark fill + fire
  sprite drawImage + warm glow overlay for HEARTH/BONFIRE tiles
- Added: `cavityBand` skip in `_renderWallDecor` — prevents double-rendering
  fire sprites on both the wall face and the cavity band

### Files changed
| File | Changes |
|------|---------|
| `engine/raycaster.js` | Removed cavity pre-fill, back-face injection. Added step-fill cavity rendering |
| `engine/texture-atlas.js` | Reverted hearth_riverrock + bonfire_ring to fully opaque (no portholes) |
| `engine/floor-manager.js` | PILLAR offset→0, HEARTH offset→-0.35, BONFIRE offset→-0.25, cavityBand flag |

---

## Session 4 Fixes (Apr 3 — chest persistence, bonfire decouple, toast, stash grid)

### Chest system overhaul
- Chests never disappear from grid — `depleted` flag marks empty, CHEST tile persists as furniture
- Depth-based behavior contract: surface/interior chests (depth 1-2) are withdraw-only, dungeon chests (depth 3+) demand refilling
- Home chest at (19,3) uses `{ stash: true }` — 256 empty slots with work keys pre-loaded in slot 0
- Stash chests never marked depleted (permanent furniture)
- CrateUI gains scrollable 8-column grid renderer for stash containers (arrow keys/PageUp/Down scroll)
- CrateUI pointer/click handling via `_slotRects` hit-test for Magic Remote support
- Interior chests (floorN.N, depth 2) now get 8-12 slots instead of 1-5

### PeekSlots chest-awareness
- DragDrop deposit zones only register for crates, corpses, and dungeon chests with `demandRefill === true`
- Surface/interior chests: no deposit zones, no seal flow, no "Fill all slots first!" toast
- S key ignored for all chest containers (seal is a crate/corpse mechanic)

### Bonfire interaction decoupling
- Bonfire interact opens menu only — rest executes from menu button, not on interact
- InteractPrompt icon changed from 🐉 to 🔥 (3 locations: BONFIRE, HEARTH, depth-override)
- HazardSystem.clearLastRestResult() called on menu open (pre/post rest state tracking)
- HEARTH tileWallHeight in home biome changed to 2.5 (floor-to-ceiling chimney effect)

### InteractPrompt repositioning
- Changed from fixed `BOX_Y_OFF = 200` (px from bottom) to `BOX_Y_FRAC = 0.60` (fraction of viewport height)
- Popup now sits at 60% viewport height — above tooltip footer bar, below freelook ring

### Toast repositioning
- Regular toasts moved from top-right (under minimap) to center-anchor below freelook ring
- Position: `vpH/2 + ringRadius + 10px`, centered horizontally
- Slide-in replaced with fade-in animation
- Fixed bug where centered toasts wouldn't render without regular toasts active

### Quest objective 3-phase system
- Phase 0 (dispatcher not done): Floor 0→door, Floor 1→dispatcher position
- Phase 1 (dispatcher done, no keys): Floor 1→home door, Floor 1.6→chest
- Phase 2 (keys obtained): Floor 1→east gate, Floor 2→STAIRS_DN

### Files changed
| File | Changes |
|------|---------|
| `engine/crate-system.js` | Depth-based slot counts (depth 2: 8-12), stash depletion guard, `demandRefill` flag |
| `engine/crate-ui.js` | Stash grid renderer, scroll state, pointer click handling, _slotRects for all layouts |
| `engine/peek-slots.js` | Chest-aware: skip DragDrop for non-demandRefill, skip seal for chest type |
| `engine/toast.js` | Center-anchor positioning below freelook ring, fade-in, centered toast render fix |
| `engine/game.js` | Bonfire decouple, quest 3-phase, legacy openChest removal, CrateUI click wiring |
| `engine/interact-prompt.js` | 🐉→🔥 icon, BOX_Y_FRAC repositioning |
| `engine/menu-faces.js` | Face 0 pre/post rest states, 🔥 title emoji |
| `engine/hazard-system.js` | clearLastRestResult() public API |
| `engine/floor-manager.js` | HEARTH 2.5× in home biome |
| `engine/chest-peek.js` | Sublabel "→ take loot", depleted "— empty" |
| `docs/LIGHT_AND_TORCH_ROADMAP.md` | Replaced §2.5a-d with step-fill cavity documentation |

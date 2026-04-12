# Door Architecture Roadmap

**Status**: Active — Phase 0 ✅, Phase 1 ✅, Phase 1.5 ✅, Phase 2 ✅  
**Last updated**: 2026-04-12  
**Depends on**: Raycast Freeform Upgrade (shipped), Living Windows (Phase 0–1 shipped), Texture Atlas  
**Cross-refs**: `LIVING_WINDOWS_ROADMAP.md`, `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md`, `ARCHITECTURAL_SHAPES_ROADMAP.md`

---

## 1. Problem Statement

Every door in the game is a Wile E. Coyote painted tunnel. A single limestone arch texture
(`arch_brick` / `door_wood`) is stamped onto every building regardless of construction material —
red brick taverns, grey stone watchtowers, bleached wood beach shacks all share the same
door face. The arch occupies a full tile and forces the wall column to shrink to door height,
creating a squat notch in an otherwise 3.5-unit facade.

Three discrete problems:

1. **One arch to rule them all.** The exterior ARCH_DOORWAY (71) always renders
   `arch_brick`. A wood-plank building should have a plank-frame door; a red-brick
   building should have a brick arch; a stone building should have a stone surround.
   `computeDoorHeights` already distinguishes entrance doors from archway gates —
   the texture system should do the same.

2. **Doors flatten buildings.** When a standard DOOR tile (2/3/4) sits on a 3.5-unit
   exterior wall, `computeDoorHeights` caps it to 1.75 (half facade). That's better
   than a full-height door, but the entire tile column still draws at 1.75 — the wall
   above the door vanishes. The player reads this as "the building is 1.75 units tall
   here." We need doors that EMBED within a full-height wall column: a 1.0-unit door
   opening punched into a 3.5-unit facade, identical to how WINDOW_TAVERN punches a
   0.75-unit glass slot into the same 3.5-unit wall.

3. **Interior stairs are grey cubes.** FloorN.N vertical transitions (STAIRS_DN / STAIRS_UP)
   render as featureless wall columns with a flat texture. These should read as
   trapdoors with ladder rungs — hatch in the floor for descent, hatch in the ceiling
   for ascent. The freeform system can model this: the "cavity" is the ladder shaft,
   the bands are the floor/ceiling slab surrounding the hatch.

---

## 2. Design Axiom

**A door is a hole in a wall, not a wall that is also a hole.**

The wall comes first. The door is cut into it. The cut matches the wall's material —
brick arch in brick, wood frame in wood. The wall's height never changes because of the
door; the door lives INSIDE the wall's column, the way a window lives inside a window
tile's column.

---

## 3. Door Taxonomy

### 3.1 Exterior Building Entrance (new: DOOR_FACADE)

The flagship deliverable. A freeform tile at full facade height (3.5 units) with a
door-shaped cavity cut at ground level. Replaces the current "short DOOR tile" +
`computeDoorHeights` approach for N→N.N transitions on exterior floors.

```
  ┌─────────────┐  ← 3.5 units (lintel + upper floors)
  │  wall tex    │     hUpper: ~2.20
  │             │
  │  ┌───────┐  │  ← ~1.30 units (door opening)
  │  │ door  │  │     cavity with gap filler
  │  │ face  │  │     (dark interior + door frame + threshold)
  │  └───────┘  │  ← ~0.00 (ground, thin sill)
  └─────────────┘     hLower: ~0.00 (no sill, door meets floor)
```

- **tileWallHeights**: 3.5 (matches WALL — no height notch)
- **tileFreeform**: `{ hUpper: 2.20, hLower: 0.00, fillGap: 'facade_door' }`
- **Gap filler** (`facade_door`): renders the door opening — dark interior wash,
  door-frame border in the building's trim colour, optional threshold step.
  Exterior face shows the door; interior face is transparent (same pattern as
  WINDOW_TAVERN). Side faces fill with wall masonry.
- **Texture**: inherits the building's wall texture for the lintel/upper-floor bands
  (same per-tile override pattern as `WindowSprites.getWallTexture`).
- **DoorAnimator integration**: the cavity region is what animates. The split/reveal
  animation plays inside the gap band. Upper and lower wall bands stay static.

### 3.2 Exterior Archway Gate (existing: ARCH_DOORWAY, tile 71)

Already freeform with alpha-mask cutout. Currently uses `arch_brick` everywhere.

**Upgrade**: per-building texture override via a `DoorRegistry` (mirrors
`BuildingRegistry` for windows). Each building declares its arch texture ID:
`arch_brick`, `arch_wood`, `arch_stone`, `arch_iron`.

### 3.3 Interior Room Door (existing: DOOR/DOOR_BACK/DOOR_EXIT, tiles 2/3/4)

Standard room-to-room doors on interior floors (N.N). Currently render at full
interior wall height (2.0) with `door_wood` texture. These are fine as-is for
room partitions — the wall IS the door. No freeform conversion needed for Phase 0.

**Future**: freeform variant with a transom window above the door (upper band =
wall + transom glass, cavity = door, lower band = threshold). Low priority.

### 3.4 Interior Vertical Transition — Trapdoor (new: TRAPDOOR_DN / TRAPDOOR_UP)

New tile types for N.N → N.N.N vertical movement. Freeform tiles that render as a
hatch in the floor or ceiling.

**TRAPDOOR_DN** (descend):
```
  ┌─────────────┐  ← wall height (2.0 interior)
  │  wall tex    │     hUpper: ~1.50 (wall above hatch)
  │             │
  │  ┌───────┐  │  ← ~0.50 unit hatch opening
  │  │ hatch │  │     cavity: ladder rungs + dark shaft
  │  └───────┘  │
  │  floor slab │     hLower: ~0.00 (floor around the hole)
  └─────────────┘
```

Gap filler (`trapdoor_shaft`): dark vertical shaft with ladder-rung cross bars.
Height offset: negative (sunken, Doom rule — the hatch reads as a hole in the floor).

**TRAPDOOR_UP** (ascend):
Same freeform structure but the cavity sits at the TOP of the column (high hUpper
is minimal, hLower is large). Height offset: positive (raised — the hatch reads as
a hole in the ceiling reached by climbing).

Gap filler: same `trapdoor_shaft` but with upward-looking perspective cue
(lighter at top, darker at bottom).

### 3.5 Boss Door / Locked Door

Existing tile types (14, 24) that already have dedicated textures (`door_iron`).
These stay as single-column tiles but gain per-biome texture variants:
`door_iron_rusty`, `door_iron_ornate`, `door_chain`. Texture selection via
biome override in SpatialContract.

---

## 4. Module Architecture

### 4.1 DoorRegistry (new module, Layer 1)

Mirrors `BuildingRegistry` from Living Windows. A data module that maps
`"x,y"` → door metadata for the current floor.

```javascript
var DoorRegistry = (function() {
  'use strict';

  var _doors = {};  // 'x,y' → { wallTex, frameTex, frameColor, archStyle }

  function register(x, y, info) {
    _doors[x + ',' + y] = info;
  }

  function get(x, y) {
    return _doors[x + ',' + y] || null;
  }

  function clear() { _doors = {}; }

  return Object.freeze({
    register: register,
    get: get,
    clear: clear
  });
})();
```

Populated by FloorManager during floor generation. Each building in the floor
data can declare its door style alongside its `windowFaces` and `windowScenes`:

```javascript
doorStyles: {
  '15,8': { wallTex: 'brick_red', frameTex: 'frame_wood_dark', archStyle: 'pointed' },
  '22,8': { wallTex: 'plank_oak', frameTex: 'frame_wood_light', archStyle: 'flat' }
}
```

### 4.2 Facade Door Gap Filler (new, registered from DoorSprites Layer 1)

Registered via `Raycaster.registerFreeformGapFiller('facade_door', fn)`.
Same pattern as `_windowTavernInteriorFiller`. Three face treatments:

- **Exterior face**: dark interior wash + door frame border + optional
  signage/knocker detail. Frame colour from DoorRegistry.
- **Interior face**: transparent (player inside building doesn't see a
  door back — they see the DOOR_EXIT tile on the interior floor).
- **Side faces**: wall masonry fill (same as window perpendicular faces).

### 4.3 Trapdoor Gap Filler (new, registered from DoorSprites Layer 1)

Registered as `'trapdoor_shaft'`. Renders ladder rungs as horizontal
mullion-style bars spaced evenly through the cavity. Dark gradient wash
behind the rungs. Direction-aware: TRAPDOOR_DN is dark at bottom (looking
down), TRAPDOOR_UP is dark at top (looking up into ceiling).

### 4.4 Texture Atlas Additions

New procedural textures keyed to building materials:

| ID | Description | Used by |
|---|---|---|
| `arch_wood` | Wood-plank arch surround | Driftwood Inn, beach buildings |
| `arch_stone` | Grey stone arch | Watchman's Post, civic buildings |
| `arch_redbrick` | Red brick arch | Coral Bazaar |
| `door_plank` | Plank door face (for gap filler) | Wood buildings |
| `door_studded` | Iron-studded oak door | Civic / military buildings |
| `trapdoor_wood` | Wood hatch with iron bands | Interior trapdoors |
| `ladder_rungs` | Repeating rung pattern | Trapdoor gap filler |

### 4.5 SpatialContract Changes

**Exterior contracts** gain new entries:

```javascript
tileFreeform: {
  // DOOR_FACADE (new tile constant, e.g. 74)
  74: Object.freeze({
    hUpper: 2.20,    // lintel + upper floors (3.5 - 1.30 door - 0.00 sill)
    hLower: 0.00,    // no sill — door meets ground
    fillGap: 'facade_door'
  })
}

tileWallHeights: {
  74: 3.5  // matches WALL — no facade notch
}
```

**Interior contracts** gain:

```javascript
tileFreeform: {
  // TRAPDOOR_DN (new tile constant, e.g. 75)
  75: Object.freeze({
    hUpper: 1.50,
    hLower: 0.00,
    fillGap: 'trapdoor_shaft'
  }),
  // TRAPDOOR_UP (new tile constant, e.g. 76)
  76: Object.freeze({
    hUpper: 0.00,
    hLower: 1.50,
    fillGap: 'trapdoor_shaft'
  })
}

tileHeightOffsets: {
  75: -0.10,  // sunken — hole in the floor
  76:  0.10   // raised — hatch in the ceiling
}
```

---

## 5. Phased Implementation

### Phase 0 — Per-building door/arch textures ✅ SHIPPED

**Goal**: Door tiles get building-specific wall textures instead of universal
`arch_brick` / `door_wood`.

**Delivered** (pre-DOOR_FACADE, via `DoorSprites` module):
1. `DoorSprites` module (Layer 0 IIFE) — `"x,y"` → texture ID cache + exterior
   face cache. Public API: `setTexture`, `getWallTexture`, `setExteriorFace`,
   `getExteriorFace`, `clear`. Gap filler registration via `ensureFillerRegistered`.
2. Raycaster texture-override hook at column render time — DOOR, DOOR_BACK,
   DOOR_EXIT, ARCH_DOORWAY, and DOOR_FACADE all consult `DoorSprites.getWallTexture()`
   before falling back to the contract's default texture.
3. FloorManager populates DoorSprites per-floor from building data during generation.

**What changed vs. plan**: DoorRegistry was folded into DoorSprites (single module
handles both texture overrides and gap fillers). The per-building `doorStyles` map
in floor data was replaced by direct `DoorSprites.setTexture()` calls in FloorManager's
building-iteration loop, reading `wallTex` from BuildingRegistry.

### Phase 1 — Embedded facade door (DOOR_FACADE) ✅ SHIPPED (proof-of-concept)

**Goal**: Buildings get a door embedded in a full-height wall column. The wall
stays 3.5 units; the door is a cavity in the lower portion.

**Delivered** (Gleaner's Home at Promenade `22,27` as proof-of-concept):

1. **TILES constant 74** — `DOOR_FACADE` added to `isDoor()`, `isOpaque()`,
   `isWalkable()`, `isFreeform()`. Excluded from back-face injection in the
   N-layer back-collection loop (same pattern as WINDOW_TAVERN).
2. **SpatialContract entries** across all three constructors:
   - Exterior: `tileFreeform 74 → { hUpper: 2.20, hLower: 0.00, fillGap: 'facade_door' }`,
     `tileWallHeights 74 → 3.5`, texture `'concrete'` (per-tile override replaces).
   - Interior: `tileFreeform 74 → { hUpper: 0.70, hLower: 0.00, fillGap: 'facade_door' }`,
     `tileWallHeights 74 → 2.5`, texture `'wood_plank'`.
   - Both: `tileFloorTextures 74 → 'floor_stone'`.
3. **`facade_door` gap filler** in DoorSprites — three-face model:
   - **Exterior face**: 3-band vertical dark-interior wash (ambient spill → mid
     dark → deep shadow) + door frame border lines (dark brown jamb edges + lintel
     bottom). O(1) per column — batch `fillRect` calls, no per-pixel loop.
   - **Interior face**: transparent return (back layers show through).
   - **Side faces**: opaque masonry fill (seals tile edges against cavity leaking).
4. **Exterior face auto-detection** + `doorFaces` explicit override: FloorManager
   scans 4 cardinal neighbors for walkable non-door tiles to determine street side.
   Ambiguous cases resolved via floor data `doorFaces: { '22,27': 3 }` map.
5. **DoorContracts spawn fallback**: `applyContract()` now tries `doorExit` →
   `doorEntry` before falling back to `rooms[0]` when stairsUp/stairsDn are null,
   fixing debug-harness spawns on exterior floors.
6. **Floor transition**: bidirectional — Promenade `22,27` ↔ Gleaner's Home `1.6`
   works. "Enter" interact prompt shows at correct distance.

**Remaining from original plan**:
- ~~DoorAnimator cavity-aware split~~ → deferred to Phase 4
- ~~`computeDoorHeights` skip~~ → DOOR_FACADE doesn't use `computeDoorHeights`
  at all; it's fully managed by the freeform system
- Stamp-out to remaining buildings → Phase 3

**Known issues fixed during implementation**:
- FPS drop (1–3 FPS) from per-pixel gap filler: replaced O(gapH) `fillRect(1,1)`
  loop with 3-band batch fill (~6–8 calls per column). FPS recovered to 14–17.
- Debug spawn landing inside Coral Bazaar walls: doorExit/doorEntry fallback chain.
- Exterior face detection picking wrong direction on south-pod buildings.

### Phase 1.5 — Recessed door face (Wolfenstein thin-wall offset) ✅ SHIPPED

**Goal**: The DOOR_FACADE portal sits back inside the tile instead of flush with
the adjacent wall plane. This produces visible jamb walls on either side and a
depth-correct parallax effect when the player strafes past the door. Real
doorways are recessed — the door face lives inside the wall thickness.

**Technique**: Classic Wolfenstein 3D thin-wall offset applied to the freeform
pipeline. After perpDist is calculated for a DOOR_FACADE hit on the exterior
face, the raycaster advances the ray by `_recessD` world units into the tile.
If the ray stays within the tile at that depth, perpDist increases → the door
face (lintel + cavity) renders at a greater distance than surrounding walls.
If the ray exits through a perpendicular tile boundary before reaching the
inset plane, that column renders as a solid jamb wall.

**Implementation** (`engine/raycaster.js`):

```
After perpDist = Math.abs(perpDist):

  1. Detect DOOR_FACADE + exterior face via DoorSprites.getExteriorFace()
  2. Compute _rPD = perpDist + _recessD / |rayDirComponent|
  3. Check: does ray at _rPD stay within [mapX..mapX+1, mapY..mapY+1]?
     YES → perpDist = _rPD  (door face renders recessed)
     NO  → _facadeJamb = true; perpDist = jamb crossing distance;
           side flips (X→Y or Y→X)

Downstream effects of _facadeJamb = true:
  - Z-buffer: overridden to perpDist (solid occlusion, not see-through)
  - freeformCfg: nulled → column renders as solid textured wall (no cavity)
  - wallX: recalculated automatically from new perpDist + side
  - Texture: uses DoorSprites.getWallTexture() (building material)
```

**Tunable**: `_recessD = 0.25` world units (quarter-tile depth). Adjustable per
building via future DoorRegistry metadata.

**Visual result**:
```
  Street-side view (looking at door head-on):
  ┌─────────────────────────┐
  │  WALL │ door face │ WALL │   ← lintel band (recessed)
  │       │  (deeper) │      │
  │  WALL │  portal   │ WALL │   ← cavity (recessed)
  │       │  (deeper) │      │
  └───────┴───────────┴──────┘
          ↑ jamb    jamb ↑

  Angled view (strafing past):
  ┌────────────┬──────┐
  │ WALL       │▓▓▓▓▓▓│ ← jamb visible as solid masonry strip
  │            │ door │
  │ WALL       │▓▓▓▓▓▓│
  └────────────┴──────┘
```

**Status**: Complete. Recess visible and confirmed in browser. File truncation
repaired.

**Files modified**: `engine/raycaster.js` (recess block after perpDist
calculation, ~45 lines).

### Phase 2 — Interior trapdoors (TRAPDOOR_DN / TRAPDOOR_UP) ✅ SHIPPED

**Goal**: Vertical transitions inside buildings render as floor/ceiling hatches
with ladder rungs instead of featureless grey cubes.

**Work** (all complete):
1. ✅ Added `TRAPDOOR_DN` (75) and `TRAPDOOR_UP` (76) to TILES. Added to `isDoor()`,
   `isOpaque()`, `isFreeform()`, `isWalkable()`. Excluded from back-face collection
   and DoorAnimator skip guard in raycaster
2. ✅ Added tileFreeform, tileHeightOffsets, tileWallHeights, textures, and
   tileFloorTextures for both tiles on interior and nestedDungeon contracts
3. ✅ Implemented `trapdoor_shaft` gap filler in door-sprites.js — 3-band dark
   gradient, 4 ladder rungs in center 60%, hatch frame border.
   Direction-aware via `info.hitTile === 75`
4. ✅ Wired floor-transition.js, interact-prompt.js, minimap.js, game.js,
   door-peek.js, dispatcher-choreography.js to recognize TRAPDOOR tiles
5. ✅ GridGen accepts `stairDnTile` / `stairUpTile` overrides. FloorManager
   passes `TILES.TRAPDOOR_DN` for depth-2 floors and `TILES.TRAPDOOR_UP`
   for depth-3 floors. All depth-2 interior floors now generate trapdoors
   instead of featureless stair cubes
6. ✅ Removed dead `5: -0.12` tileHeightOffset entries from depth-2 floor
   contracts (1.3, 2.2, Ironhold garrison) — trapdoor offsets come from
   the interior/nestedDungeon base constructors

**Acceptance**: Descending into the Soft Cellar shows a hatch in the floor with
ladder rungs. Ascending back shows a hatch in the ceiling. Grey cube is gone.

### Phase 3 — Stamp-out & per-biome defaults

**Goal**: Every building in the world map has correct door styles. New buildings
can be added with a 3-step recipe.

**Work**:
1. Define default door styles per biome in SpatialContract options:
   `defaultDoorStyle: { wallTex: 'brick_red', frameTex: 'frame_wood_dark' }`
2. DoorRegistry falls back to biome default when no per-tile override exists
3. Convert ALL remaining buildings to appropriate door types:
   - Gleaner's Home (1.6): wood plank facade door
   - Dispatcher's Office (2.1): stone facade door with iron frame
   - Watchman's Post (2.2): heavy stone arch
4. Convert all interior vertical transitions to trapdoors
5. Update boss doors with per-biome texture variants

**3-step stamp-out recipe for new buildings**:
1. Place `DOOR_FACADE` (74) tile in the building footprint on the floor grid
2. Add a `doorStyles` entry for that tile coordinate with `wallTex` and `frameTex`
3. Add a `doorTargets` entry mapping the tile to the interior floor ID

No engine changes needed. No new modules. Just data.

### Phase 4 — Polish & animation refinement

**Goal**: Door opening animation plays correctly within the freeform cavity.
Detail passes on door frame rendering.

**Work**:
1. DoorAnimator cavity-aware split: the two halves of the door texture slide
   up into the lintel and down into the sill (or left/right for side-opening)
   within the gap band only — the surrounding wall bands never move
2. Door knocker / handle detail in gap filler (small opaque element at
   mid-height, similar to window mullion)
3. Threshold step rendering: thin horizontal bar at gap bottom (like
   the window frame lines) to sell the "step over the threshold" read
4. Interior door transom variant: glass panel above the door (stretch goal —
   requires a second freeform band or a nested gap)

---

## 6. Touch List

| File | Phase | Status | Change |
|---|---|---|---|
| `engine/tiles.js` | 1 | ✅ | DOOR_FACADE (74) in `isDoor`, `isOpaque`, `isWalkable`, `isFreeform` |
| `engine/tiles.js` | 2 | ✅ | TRAPDOOR_DN (75), TRAPDOOR_UP (76) in isDoor, isOpaque, isWalkable, isFreeform |
| `engine/spatial-contract.js` | 1 | ✅ | tileFreeform, tileWallHeights, tileFloorTextures, textures for 74 across all 3 constructors |
| `engine/spatial-contract.js` | 2 | ✅ | TRAPDOOR entries (tileFreeform, offsets, textures) on interior + nestedDungeon |
| `engine/spatial-contract.js` | 3 | pending | Per-biome door defaults |
| `engine/door-sprites.js` | 0,1 | ✅ | Layer 0 IIFE. Texture cache + exterior face cache + `facade_door` gap filler (3-face, batch-rendered) |
| `engine/door-sprites.js` | 2 | ✅ | `trapdoor_shaft` gap filler (3-band gradient, 4 ladder rungs, hatch frame) |
| `engine/raycaster.js` | 0,1 | ✅ | Texture override hook for DOOR/ARCH/DOOR_FACADE. DOOR_FACADE excluded from back-face injection. Z-bypass for freeform |
| `engine/raycaster.js` | 1.5 | ✅ | Wolfenstein recess: perpDist inset, jamb detection, z-buffer fix, freeform suppression for jambs |
| `engine/raycaster.js` | 2 | ✅ | TRAPDOOR_DN/UP in back-face exclusion + DoorAnimator skip guard |
| `engine/door-contracts.js` | 1 | ✅ | Spawn fallback: doorExit → doorEntry → rooms[0] chain |
| `engine/floor-transition.js` | 2 | ✅ | TRAPDOOR_DN/UP in useStairs + tryInteractStairs |
| `engine/interact-prompt.js` | 2 | ✅ | ACTION_MAP entries for TRAPDOOR_DN/UP |
| `engine/minimap.js` | 2 | ✅ | Trapdoor tile coloring + chevron overlays |
| `engine/game.js` | 2 | ✅ | TRAPDOOR_UP in curfew isDoorExit check |
| `engine/door-peek.js` | 2 | ✅ | TRAPDOOR checks in isDoor filter, direction, labels |
| `engine/dispatcher-choreography.js` | 2 | ✅ | TRAPDOOR_DN in gate door scan |
| `engine/grid-gen.js` | 2 | ✅ | stairDnTile/stairUpTile overrides for depth-aware tile placement |
| `engine/floor-manager.js` | 1 | ✅ | `doorFaces` map for explicit exterior-face overrides. DoorSprites population during generation |
| `engine/floor-manager.js` | 2 | ✅ | Depth-2→TRAPDOOR_DN, depth-3→TRAPDOOR_UP in GridGen call. Stair tracking includes trapdoors |
| `engine/floor-manager.js` | 3 | pending | Stamp-out remaining buildings to DOOR_FACADE |
| `engine/door-animator.js` | 4 | pending | Cavity-aware animation for DOOR_FACADE |
| `index.html` | 0 | ✅ | `<script>` for `engine/door-sprites.js` in Layer 0 |

---

## 7. Open Questions

1. ~~**DOOR_FACADE tile constant**: Proposed 74~~ → **RESOLVED.** Tile 74
   confirmed, no collision. Registered in TILES, all three SpatialContract
   constructors, and the raycaster's texture/freeform paths.

2. **DoorAnimator cavity split**: The current DoorAnimator uses a full-column
   split/portcullis animation. The raycaster already skips DoorAnimator for
   DOOR_FACADE tiles (`hitTile !== TILES.DOOR_FACADE` guard at the
   `isAnimatingTile` check). Phase 4 will implement cavity-aware animation
   that plays inside the gap band only. DoorAnimator does NOT currently
   receive freeformCfg — it will need a new parameter path.

3. **Trapdoor collision**: Standard doors have collision based on door state.
   Trapdoors in the floor need a different collision model — the player walks
   ONTO the tile and interacts (press E), then drops through. This may need
   a custom interaction check in InteractPrompt rather than the existing
   "tile ahead is a door" pattern.

4. ~~**Interior door-on-wall**~~ → **RESOLVED.** The interior contract has its
   own DOOR_FACADE freeform config: `{ hUpper: 0.70, hLower: 0.00 }` at
   `tileWallHeights: 2.5`. Same tile type, depth-aware band sizing via
   per-constructor SpatialContract entries.

5. ~~**ARCH_DOORWAY persistence**~~ → **RESOLVED.** ARCH_DOORWAY stays for true
   archway gates (courtyard entrances, district transitions). DOOR_FACADE is
   for building doors. Both coexist — different tile types, different freeform
   configs, different gap fillers.

6. **Recess depth tuning** (new): `_recessD = 0.25` is hardcoded in the
   raycaster. Should this be per-building via DoorRegistry metadata? Deep
   recesses for stone buildings, shallow for wood shacks? Or is a global
   constant sufficient for the visual language?

7. **Recess + back-layer overhead** (new): The `_fgIsFreeformSeeThrough` flag
   is set before the recess check (during N-layer collection). For jamb
   columns, back layers were collected but are painted over by the solid
   jamb wall — wasted work. Could gate back-layer collection on "is this a
   jamb?" but the flag is set 100 lines earlier. Low priority — jamb columns
   are a small fraction of the viewport.

8. **Raycaster file truncation** (new, blocking): The Edit tool truncated the
   tail of `engine/raycaster.js` during the recess insertion. The
   `castScreenRay` function and the module's `return` block are cut off.
   Must be repaired from git HEAD before testing.

---

## 8. Out of Scope

- **Door physics / swing animation**: Doors don't physically swing open on a
  hinge. The split/reveal animation is the visual language of this engine.
- **Double doors**: Two-tile-wide openings. Future architectural shapes work.
- **Sliding doors**: Sci-fi / retrofuturism style. Separate tile type if needed.
- **Per-NPC door access**: Faction-locked doors are a gameplay system, not a
  rendering system. This roadmap covers visual representation only.

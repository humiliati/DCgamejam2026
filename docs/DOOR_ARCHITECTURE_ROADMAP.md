# Door Architecture Roadmap

**Status**: Active — Phase 0 ✅, Phase 1 ✅, Phase 1.5 ✅, Phase 2 ✅ (visual upgrade shipped), Phase 5A ✅, Phase 5B–D specced, **Phase 6A ✅ (double doors), Phase 6B ✅ (great arches) — Phase 3 stamp-out unblocked**  
**Last updated**: 2026-04-13  
**Depends on**: Raycast Freeform Upgrade (shipped), Living Windows (Phase 0–1 shipped), Texture Atlas  
**Cross-refs**: `LIVING_WINDOWS_ROADMAP.md`, `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md`, `ARCHITECTURAL_SHAPES_ROADMAP.md` (Phase 9 — Octagonal Columns), `TRAPDOOR_ARCHITECTURE_ROADMAP.md` (detailed trapdoor visual tiers), `BLOCKOUT_REFRESH_PLAN.docx` §5 (Boss Doors — blocked on Phase 6)

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

Already freeform with alpha-mask cutout (`gapTexAlpha: true`, `fillGap:
'_transparent'`). Currently uses `arch_brick` everywhere.

**Upgrade**: per-building texture override via a `DoorRegistry` (mirrors
`BuildingRegistry` for windows). Each building declares its arch texture ID:
`arch_brick`, `arch_wood`, `arch_stone`, `arch_iron`.

For **floor-to-floor transitional gates** (N→N, same depth), paired
ARCH_DOORWAY tiles render as one wide 2-tile arch with a single continuous
see-through portal. See **Phase 6B** (Great Arches). The Floor 0→1 Roman
Arch is the flagship example.

### 3.3 Interior Room Door (existing: DOOR/DOOR_BACK/DOOR_EXIT, tiles 2/3/4)

Standard room-to-room doors on interior floors (N.N). Currently render at full
interior wall height (2.0) with `door_wood` texture. These are fine as-is for
room partitions — the wall IS the door. No freeform conversion needed for Phase 0.

**Future**: freeform variant with a transom window above the door (upper band =
wall + transom glass, cavity = door, lower band = threshold). Low priority.

### 3.4 Interior Vertical Transition — Trapdoor (TRAPDOOR_DN / TRAPDOOR_UP) ✅ SHIPPED

Freeform tiles for N.N → N.N.N vertical movement. Render as a see-through shaft
with a hatch-lid frame and a ladder inside — follows the HEARTH fire-cavity pattern
(transparent gap, wall decor sprite inside, z-buffer bypass).

**TRAPDOOR_DN** (descend):
```
  ┌─────────────┐  ← wall height (2.0 interior / 1.2 dungeon)
  │ trapdoor_lid│     hUpper: 0.40 / 0.30 (hatch rim — player peers over)
  │  ┌───────┐  │
  │  │ shaft │  │  ← cavity: 1.60 / 0.90 units (see-through)
  │  │🪜     │  │     cool-dark tint + decor_ladder wall sprite
  │  │       │  │     back-layer walls visible through transparency
  │  └───────┘  │
  └─────────────┘     hLower: 0.00 (cavity reaches floor)
```

**TRAPDOOR_UP** (ascend):
```
  ┌─────────────┐
  │  ┌───────┐  │     hUpper: 0.00 (cavity reaches ceiling)
  │  │       │  │
  │  │ shaft │  │  ← cavity: 1.60 / 0.90 units (see-through)
  │  │🪜     │  │     tint darkens toward top (looking up into shadow)
  │  └───────┘  │
  │ trapdoor_lid│     hLower: 0.40 / 0.30 (floor-level hatch frame)
  └─────────────┘
```

- **Gap filler** (`trapdoor_shaft`): hearth-pattern transparent overlay — direction-
  aware cool-blue-grey depth tint + dark timber frame border. No opaque paint.
- **Ladder**: `decor_ladder` wall decor sprite on all walkable-neighbor faces.
  32×32 alpha-transparent texture (2 rails, 5 rungs, iron bolts). anchorV shifts
  per direction (0.35 DN, 0.65 UP).
- **Wall texture**: `trapdoor_lid` — planked wood hatch with iron hinges/pull ring.
- **Height offsets**: -0.10 DN (sunken), +0.10 UP (raised).

See `TRAPDOOR_ARCHITECTURE_ROADMAP.md` for the full tier breakdown.

### 3.5 Boss Door / Locked Door

Existing tile type (14) with dedicated texture (`door_iron`). Single-tile
boss doors gain per-biome texture variants (`door_iron_rusty`,
`door_iron_ornate`, `door_chain`) via biome override in SpatialContract.

For **grand boss gates** (dungeon entrances, end-of-act doors), boss doors
convert to paired DOOR_FACADE tiles rendering as one 2-tile-wide double
door. See **Phase 6** for the full double-door spec. The lock/unlock
system applies to the pair as a unit.

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

### 4.3 Trapdoor Gap Filler (DoorSprites Layer 1) ✅ SHIPPED

Registered as `'trapdoor_shaft'`. Hearth-pattern transparent cavity — paints
only a semi-transparent cool-blue-grey depth tint (`rgba(15,20,30,α)`) and a
dark timber frame border over whatever back-layer content was already rendered.
Direction-aware: TRAPDOOR_DN darkens toward bottom (looking into abyss),
TRAPDOOR_UP darkens toward top (looking into shadow). The ladder is NOT drawn
by the gap filler — it's a `decor_ladder` wall decor sprite registered by
FloorManager (same pattern as HEARTH dragonfire).

### 4.4 Texture Atlas Additions

Procedural textures keyed to building materials and door types:

| ID | Size | Description | Status |
|---|---|---|---|
| `arch_wood` | 64×64 | Wood-plank arch surround | ✅ Shipped |
| `arch_stone` | 64×64 | Grey stone arch | ✅ Shipped |
| `arch_redbrick` | 64×64 | Red brick arch | ✅ Shipped |
| `door_panel_wood` | 64×64 | Warm oak door panel (Driftwood Inn) | ✅ Shipped |
| `door_panel_dark` | 64×64 | Worn dark wood panel (Gleaner's Home) | ✅ Shipped |
| `door_panel_studded` | 64×64 | Iron-studded oak panel (Watchman's) | ✅ Shipped |
| `door_panel_glass` | 64×64 | Frosted glass insert (Coral Bazaar) | ✅ Shipped |
| `door_panel_iron` | 64×64 | Riveted iron plate (Dispatcher's) | ✅ Shipped |
| `door_panel_oiled` | 64×64 | Oiled wood panel | ✅ Shipped |
| `door_panel_charcoal` | 64×64 | Charcoal dark panel | ✅ Shipped |
| `door_panel_ironbound` | 64×64 | Iron-banded plank panel | ✅ Shipped |
| `door_lightbrick` | 64×64 | Light brick surround | ✅ Shipped |
| `door_metal` | 64×64 | Brushed steel surround | ✅ Shipped |
| `door_cathedral` | 64×64 | Carved stone surround | ✅ Shipped |
| `trapdoor_lid` | 64×64 | Planked wood hatch with iron hinges | ✅ Shipped |
| `decor_ladder` | 32×32 | Alpha-transparent ladder sprite (rails+rungs) | ✅ Shipped |

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

**Interior contracts** (actual shipped values):

```javascript
tileFreeform: {
  // TRAPDOOR_DN (75) — cavity-dominant: small lid on top, large shaft below
  75: Object.freeze({ hUpper: 0.40, hLower: 0.00, fillGap: 'trapdoor_shaft' }),
  // TRAPDOOR_UP (76) — cavity-dominant: large shaft above, small frame below
  76: Object.freeze({ hUpper: 0.00, hLower: 0.40, fillGap: 'trapdoor_shaft' })
}
// Nested dungeon (depth 3, wallH 1.2): hUpper/hLower = 0.30 (same pattern)

tileHeightOffsets: {
  75: -0.10,  // sunken — hole in the floor
  76:  0.10   // raised — hatch in the ceiling
}

textures: {
  75: 'trapdoor_lid',   // planked wood hatch with iron hardware
  76: 'trapdoor_lid'
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

**Status**: Implemented. Raycaster recess block in place; visual browser test
pending.

**Files modified**: `engine/raycaster.js` (recess block after perpDist
calculation, ~45 lines; z-buffer override for jamb columns; freeformCfg
suppression for jamb columns).

### Phase 2 — Interior trapdoors (TRAPDOOR_DN / TRAPDOOR_UP) ✅ SHIPPED + VISUAL UPGRADE

**Goal**: Vertical transitions inside buildings render as see-through shaft
hatches with ladder sprites instead of featureless grey cubes.

**Work — original implementation** (all complete):
1. ✅ Added `TRAPDOOR_DN` (75) and `TRAPDOOR_UP` (76) to TILES. Added to `isDoor()`,
   `isOpaque()`, `isFreeform()`, `isWalkable()`. Excluded from DoorAnimator skip
   guard in raycaster
2. ✅ Added tileFreeform, tileHeightOffsets, tileWallHeights, textures, and
   tileFloorTextures for both tiles on interior and nestedDungeon contracts
3. ✅ Wired floor-transition.js, interact-prompt.js, minimap.js, game.js,
   door-peek.js, dispatcher-choreography.js to recognize TRAPDOOR tiles
4. ✅ GridGen accepts `stairDnTile` / `stairUpTile` overrides. FloorManager
   passes `TILES.TRAPDOOR_DN` for depth-2 floors and `TILES.TRAPDOOR_UP`
   for depth-3 floors. All depth-2 interior floors now generate trapdoors
   instead of featureless stair cubes
5. ✅ Removed dead `5: -0.12` tileHeightOffset entries from depth-2 floor
   contracts (1.3, 2.2, Ironhold garrison) — trapdoor offsets come from
   the interior/nestedDungeon base constructors

**Work — visual upgrade** (HEARTH-pattern rewrite):
6. ✅ Rebalanced freeform splits — cavity now 75–80% of wall height (was ~15%).
   Interior: hUpper/hLower 0.40, dungeon: 0.30. Lip is the hatch frame, cavity
   is the shaft.
7. ✅ Made cavity see-through — removed TRAPDOOR tiles from raycaster back-face
   injection exception list. Back-layer walls now render behind trapdoor tiles
   (same N-layer collection as HEARTH). Z-bypass already active via isFreeform.
8. ✅ Rewrote `trapdoor_shaft` gap filler — transparent cool-dark tint overlay
   replacing opaque 3-band gradient. Direction-aware depth wash + timber frame
   border. No ladder in gap filler (moved to wall decor).
9. ✅ Added `decor_ladder` wall decor sprite (32×32, alpha-transparent rails +
   rungs + iron bolts). Registered on all walkable-neighbor faces of TRAPDOOR
   tiles by FloorManager. anchorV direction-aware (0.35 DN, 0.65 UP).
10. ✅ Added `trapdoor_lid` wall texture (64×64, planked wood with iron hinges +
    pull ring). Replaced `wood_plank` on tile 75/76 in all three biome contracts.

**Acceptance**: The shaft reads as a transparent opening in the floor/ceiling
with a visible ladder inside and a wood-and-iron hatch frame. Back-layer walls
show through the cavity. The ladder parallaxes correctly on all four approach
faces. Direction-aware tinting sells "looking down" vs "looking up."

**Files modified (visual upgrade)**: `engine/spatial-contract.js`,
`engine/raycaster.js`, `engine/door-sprites.js`, `engine/texture-atlas.js`,
`engine/floor-manager.js`. Full tier breakdown in `TRAPDOOR_ARCHITECTURE_ROADMAP.md`.

**Remaining**: Pedestal mask for solid band (Tier 6), biome-variant texture
stamps (Tier 7), animation/SFX polish (Tier 8). See trapdoor roadmap.

### Phase 3 — Stamp-out & per-biome defaults

**Goal**: Every building in the world map has correct door styles. New buildings
can be added with a 3-step recipe.

**Texture palette** (available for assignment — all shipped):
- Door panels: `door_panel_wood`, `door_panel_dark`, `door_panel_studded`,
  `door_panel_glass`, `door_panel_iron`, `door_panel_oiled`,
  `door_panel_charcoal`, `door_panel_ironbound`
- Door surrounds: `door_wood`, `door_lightbrick`, `door_metal`, `door_cathedral`

**Work**:
1. Define default door styles per biome in SpatialContract options:
   `defaultDoorStyle: { wallTex: 'brick_red', frameTex: 'door_lightbrick', panelTex: 'door_panel_wood' }`
2. DoorSprites falls back to biome default when no per-tile override exists
3. Convert ALL remaining buildings to DOOR_FACADE with appropriate textures:
   - Gleaner's Home (1.6): ✅ already has DOOR_FACADE proof-of-concept
   - Coral Bazaar (1.1): `door_panel_glass` + `door_lightbrick`
   - Driftwood Inn (1.2): `door_panel_wood` + `door_wood`
   - Dispatcher's Office (2.1): `door_panel_iron` + `door_metal`
   - Watchman's Post (2.2): `door_panel_studded` + `door_cathedral`
4. ✅ Convert all interior vertical transitions to trapdoors — DONE (GridGen
   stairDnTile/stairUpTile overrides). All depth-2 floors generate TRAPDOOR_DN,
   all depth-3 floors generate TRAPDOOR_UP. Visual upgrade shipped.
5. Update boss doors with per-biome texture variants

**3-step stamp-out recipe for new buildings**:
1. Place `DOOR_FACADE` (74) tile in the building footprint on the floor grid
2. Add a `doorStyles` entry for that tile coordinate with `wallTex` and `panelTex`
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

### Phase 5 — Cavity Sprite Content (beyond the dark gradient)

**Goal**: The recessed door cavity renders actual visual content instead of
the current 3-band dark gradient. The dark square is a placeholder — most
doors in the world should show a recognizable door face, and in some cases
a scene behind the door.

**Motivation**: The recess from Phase 1.5 moves the door face into the tile,
creating a convincing 3D pocket. But the pocket is currently filled with a
flat dark wash. The player reads "dark hole in wall." We want the player to
read "actual door" or "glimpse of interior."

**Content tiers** (progressive, each tier builds on the previous):

#### Tier A — Door panel texture ✅ SHIPPED

The gap filler samples a door-panel texture from TextureAtlas instead of
computing a procedural gradient. The texture is a 64×64 canvas showing
wooden planks with a handle, iron studs, or a glass panel — depending on
the building.

**Delivered:**

1. **`_doorPanels` cache** in DoorSprites — `"x,y"` → texture ID, with
   `setDoorPanel()` / `getDoorPanel()` public API. Cleared on floor switch.
2. **`_facadeDoorFiller` Tier A path** — on exterior face, looks up panel
   texture via `getDoorPanel()`. If found: `ctx.drawImage()` for 1px column
   sampling (same technique as the lintel band), then side shading (side=1
   gets 0.25 overlay), fog+brightness overlay. If no texture: falls back to
   existing 3-band dark gradient. Door frame overlay (jamb edges + lintel
   bottom + threshold bottom) drawn on top of both paths.
3. **`_genDoorPanel()` texture generator** in TextureAtlas — per-pixel
   procedural texture with vertical wood planks, grain bands, knots, frame
   border, handle (brass/iron rectangle at 55% height), hinges (iron
   rectangles at top/bottom left). Variants via parameters:
   - `studs: true` — iron stud grid overlay (military/fortress)
   - `glassInsert: true` — frosted amber glass in upper half (shops)
   - `ironPlate: true` — riveted iron plate with horizontal seams
4. **Five panel textures** registered in `_generateAll()`:
   - `door_panel_wood` — warm oak (Driftwood Inn)
   - `door_panel_dark` — worn dark wood (Gleaner's Home)
   - `door_panel_studded` — heavy oak + iron studs (Storm Shelter, Watchman's)
   - `door_panel_glass` — frosted glass insert (Coral Bazaar)
   - `door_panel_iron` — riveted iron plate (Dispatcher's Office)
5. **`doorPanel` field** added to all BuildingRegistry records. FloorManager
   populates `DoorSprites.setDoorPanel()` during building iteration for
   DOOR_FACADE tiles, same pattern as `setTexture()`.

**Files modified**: `engine/door-sprites.js` (cache + gap filler Tier A path),
`engine/texture-atlas.js` (`_genDoorPanel` + 5 texture registrations),
`engine/building-registry.js` (`doorPanel` field on 6 buildings),
`engine/floor-manager.js` (`setDoorPanel()` call in building iteration).

#### Tier B — Interior scene glimpse (~80 lines)

When a building's door is "ajar" or the player has visited the interior,
the gap filler composites a faint interior scene behind the door panel.
Same pattern as WINDOW_TAVERN's gap filler showing amber glow + furniture
silhouettes behind the glass.

```
Gap filler logic (tier B):
  1. Draw door panel texture (tier A)
  2. If door state is OPEN or VISITED:
     - Blend door panel at 40% opacity (semi-transparent)
     - Behind it: warm amber wash + furniture silhouettes
       sampled from a scene texture
  3. If door state is CLOSED:
     - Draw door panel at full opacity (tier A only)
```

Scene textures: reuse the WINDOW_TAVERN interior scene system. Each
building declares a `doorScene` alongside `windowScenes` in its
BuildingRegistry entry.

#### Tier C — Live interior peek (~120 lines, stretch)

The cavity shows a **live view** of the floor behind the door. The gap
filler casts a secondary mini-raycast from the door position into the
interior floor's grid, rendering a few columns of interior wall/floor
into the cavity region.

Expensive (secondary raycast per column, ~40–60 columns) but gated to
fire only when the player is within 3 tiles. At distance, fall back to
tier B (static scene).

Performance budget: ~40 secondary casts × ~8 DDA steps = ~320 extra steps
per frame at close range. Viable but needs profiling on webOS.

**Generalization**: This technique applies to any freeform cavity.
Trapdoor shafts (Phase 2) could show the floor below. Arch doorways
could show the courtyard beyond. The cavity is a viewport into another
world — the gap filler is the compositor.

#### Tier D — NPC silhouette in doorway (stretch)

When an NPC stands near the interior side of a door, render their sprite
silhouette inside the door cavity. The NPC billboard system already
depth-sorts and z-clips — this tier connects the sprite pass to the
cavity region.

After the gap filler paints door content, check if any NPC sprites in
the interior floor are within 2 tiles of the door. If yes, project their
sprite into the cavity's screen region with z-clipping against the
cavity bounds. The sprite renders at reduced brightness (interior
lighting) and is depth-sorted behind the door panel if the door is
partially open.

Performance: one distance check per NPC per door-cavity column. With
≤5 NPCs and ~40 cavity columns, this is ~200 comparisons per frame —
negligible. The sprite projection reuses the existing billboard renderer
with a constrained screen rect.

---

### Phase 6A — Double Doors (Multi-Tile Coordinated Rendering) ✅ SHIPPED

**Status**: Complete — infrastructure shipped, UV continuity bug fixed 2026-04-13
**Priority**: HIGH — blocks Phase 3 stamp-out for boss doors
**Difficulty**: Medium — data coordination, not renderer architecture
**Estimated size**: ~120 lines (DoorSprites pairing + gap filler UV split +
contract wiring)
**Prerequisite**: Phase 1.5 (DOOR_FACADE recess — **SHIPPED**), Phase 5A
(door panel textures — **SHIPPED**)
**Cross-ref**: `BLOCKOUT_REFRESH_PLAN.docx` §5 (Boss Doors), `ARCHITECTURAL_SHAPES_ROADMAP.md`

#### Problem

Boss doors and grand entrances need to be **2 tiles wide**. The current
DOOR_FACADE is a single-tile freeform column: one recess, one gap filler,
one door panel. A single tile at 64×64 texture resolution can render a
convincing single door, but a boss gate — iron double doors with a center
seam, ornate knockers on each leaf, flanked by heavy stone pillars — needs
two tiles worth of screen width.

The raycaster has no concept of multi-tile rendering. Each column resolves
to one tile hit, independently. Two adjacent DOOR_FACADE tiles currently
render as two separate identical doors side by side — not one wide door.

#### Design principle

**The raycaster stays single-tile. The coordination lives in data.**

We do NOT modify the raycaster inner loop to span tiles. Instead:

1. Two adjacent tiles each render their own freeform column (recess,
   cavity, gap filler) — this already works.
2. The **gap filler** for each tile knows it's the LEFT or RIGHT leaf of
   a pair and samples the correct half of a wide door texture.
3. **DoorSprites** stores the pairing metadata so the gap filler can
   look up its partner.

This is the same pattern as the roof moat system (multiple tiles
composing a visual unit via coordinated data, not renderer changes).

#### Architecture

##### DoorSprites pairing registry (~30 lines)

New cache in DoorSprites:

```javascript
// "x,y" → { partner: "px,py", side: 'left'|'right' }
var _doorPairs = {};

function setPairInfo(x, y, partnerX, partnerY, side) {
  _doorPairs[x + ',' + y] = {
    partner: partnerX + ',' + partnerY,
    side: side   // 'left' or 'right' relative to exterior face
  };
}

function getPairInfo(x, y) {
  return _doorPairs[x + ',' + y] || null;
}
```

Cleared on floor switch alongside other caches.

##### Wide door panel textures (~25 lines in TextureAtlas)

Double-door panels are 128×64 textures (2:1 aspect). The left tile's gap
filler samples columns 0–63 (left leaf); the right tile samples columns
64–127 (right leaf). Each leaf has its own knocker/handle, and the center
seam runs down the middle.

```javascript
// _genDoubleDoorPanel(id, params) — 128×64 procedural texture
// Left leaf: handle at col ~20, hinge plates at left edge
// Right leaf: handle at col ~108, hinge plates at right edge
// Center seam: 2px dark line at col 63–64
// Iron banding across both leaves for boss variant
```

Registered variants:
- `double_door_iron` — heavy iron plate, riveted, center seam, twin knockers
- `double_door_wood` — grand oak, iron banding, center pull handles
- `double_door_ornate` — cathedral style, decorative panels, brass fixtures

##### Gap filler UV coordination (~30 lines)

In `_facadeDoorFiller`, after the existing door panel sampling:

```javascript
var pair = DoorSprites.getPairInfo(info.mapX, info.mapY);
if (pair) {
  // Use wide texture instead of standard panel
  var wideTexId = DoorSprites.getDoubleDoorPanel(info.mapX, info.mapY);
  var wideTex = TextureAtlas.getTexture(wideTexId);
  if (wideTex) {
    // Standard wallX is 0–1 across this tile's face
    // Remap to 0–0.5 (left leaf) or 0.5–1 (right leaf)
    var texU;
    if (pair.side === 'left') {
      texU = wallX * 0.5;           // columns 0–63 of 128-wide tex
    } else {
      texU = 0.5 + wallX * 0.5;    // columns 64–127
    }
    var srcX = Math.floor(texU * 128);
    // ... sample wide texture at srcX instead of standard panel
  }
}
```

The `wallX` value from the raycaster already gives 0–1 across each tile's
face. The UV remap is pure arithmetic — no raycaster changes.

##### Floor data wiring (~25 lines in FloorManager)

During floor generation, when FloorManager encounters two adjacent
DOOR_FACADE (or new DOUBLE_DOOR) tiles sharing the same exterior face:

```javascript
// Scan for horizontal pairs (same Y, adjacent X, same exterior face)
// and vertical pairs (same X, adjacent Y, same exterior face)
for each DOOR_FACADE tile at (x, y):
  check (x+1, y) — if also DOOR_FACADE with same exteriorFace:
    DoorSprites.setPairInfo(x, y, x+1, y, 'left');
    DoorSprites.setPairInfo(x+1, y, x, y, 'right');
  check (x, y+1) — if also DOOR_FACADE with same exteriorFace:
    DoorSprites.setPairInfo(x, y, x, y+1, 'left');
    DoorSprites.setPairInfo(x, y+1, x, y, 'right');
```

"Left" and "right" are relative to the exterior face direction:
- East-facing pair: north tile = left, south tile = right
- South-facing pair: east tile = left, west tile = right
- (Follows the convention of the player looking at the door from outside)

##### Recess continuity

When two adjacent tiles both have DOOR_FACADE recess, the shared edge
between them is a jamb wall (the ray exits one tile laterally into the
neighboring tile). For a double door, this center jamb should NOT render —
the two recesses should merge into one continuous cavity.

Solution: add a `suppressJamb` flag to DoorSprites pairing data. When the
raycaster's recess block detects a jamb hit, check if the adjacent tile
is the pair partner. If yes, continue the ray into the partner tile's
recess instead of rendering a jamb wall.

```javascript
// In raycaster recess block, jamb branch:
if (_recessJamb && _rfCfg && _rfCfg.recessAllFaces !== true) {
  // Check if the adjacent tile is our double-door partner
  var adjX = mapX + (side === 0 ? stepX : 0);
  var adjY = mapY + (side === 1 ? stepY : 0);
  var pairInfo = DoorSprites.getPairInfo(mapX, mapY);
  if (pairInfo && pairInfo.partner === adjX + ',' + adjY) {
    // Suppress jamb — continue ray into partner's recess
    // The partner tile will handle its own recess depth
    _recessJamb = false;
    // Don't flip side or modify perpDist — let DDA continue
    // The next iteration will hit the partner tile and apply its recess
  }
}
```

This is the only raycaster-level change in the entire double-door system:
~8 lines in the jamb branch, gated behind a pair lookup.

##### DoorAnimator coordination

Both tiles animate together. When the player interacts with either tile,
DoorAnimator starts the open sequence on both. The existing
`DoorAnimator.beginOpen(x, y)` call gets a paired variant:

```javascript
// If the interacted tile has a partner, animate both
var pair = DoorSprites.getPairInfo(x, y);
if (pair) {
  var pCoords = pair.partner.split(',');
  DoorAnimator.beginOpen(parseInt(pCoords[0]), parseInt(pCoords[1]));
}
```

The two leaves split outward (left leaf slides left, right leaf slides
right) within their respective cavities.

#### New tile type (optional)

A dedicated `DOUBLE_DOOR` tile type is optional. The pairing system works
with two adjacent `DOOR_FACADE` tiles — no new tile ID needed. However, a
`BOSS_GATE` tile (reusing ID 14 or a new ID) could carry the double-door
semantics implicitly: any BOSS_GATE tile auto-pairs with an adjacent
BOSS_GATE.

Decision: keep using `DOOR_FACADE` (74) for both single and double doors.
The pairing is data-driven (FloorManager detects adjacency), not
tile-type-driven. This avoids burning a tile ID and keeps the system
flexible (any two adjacent DOOR_FACADE tiles can be paired).

#### Template usage

```
  Floor template (top-down, south-facing building):

  W  W  W  W  W  W  W        back wall
  W  .  .  .  .  .  W        interior
  W  .  .  .  .  .  W
  W  W  DF DF  W  W  W        DF = DOOR_FACADE (paired double door)
```

FloorManager scans the front face, finds two adjacent DOOR_FACADE tiles
sharing an exterior face (south), registers the pair. Each tile gets its
half of `double_door_iron`. The player sees one wide iron gate with a
center seam.

#### Boss door integration

Existing BOSS_DOOR tiles (14) that need the double-door treatment get
converted to paired DOOR_FACADE in the floor template. The lock/unlock
system (`FloorTransition._tryUnlockDoor`) checks both tiles — unlocking
one unlocks the pair.

The `door_locked` texture (chains + padlock) also needs a wide variant:
`double_door_locked` (128×64) with chains spanning both leaves and a
single padlock at the center seam.

#### Acceptance criteria (double door)

1. Two adjacent DOOR_FACADE tiles with the same exterior face render as
   one continuous double door — no visible seam at the tile boundary
   (the center seam is part of the door texture, not a rendering artifact)
2. Recess merges across the pair — no jamb wall between the two tiles
3. Door panel texture is a single 128×64 image split across both tiles
4. DoorAnimator opens both leaves simultaneously (left goes left, right
   goes right)
5. Lock/unlock applies to the pair as a unit
6. Works with existing door SFX system (one sound, not two)

#### Delivered (Phase 6A + 6B combined)

**All infrastructure shipped** across prior sessions. The full pipeline:

1. ✅ **DoorSprites pairing registry** — `_doorPairs` cache, `setPairInfo()`,
   `getPairInfo()`, `_doubleDoorPanels` cache, `setDoubleDoorPanel()`,
   `getDoubleDoorPanel()`. Cleared on floor switch.
2. ✅ **Wide textures** in TextureAtlas — `_genDoubleDoorPanel()` (128×64)
   producing `double_door_iron`, `double_door_wood`, `double_door_ornate`.
   `_genWideArch()` (128×64) producing `arch_wide_brick`, `arch_wide_stone`,
   `arch_wide_iron`. Same parabolic cutout algorithm scaled to 128 width.
3. ✅ **Gap filler UV coordination** — `_facadeDoorFiller` detects paired tiles
   via `getPairInfo()`, swaps to wide texture via `getDoubleDoorPanel()`,
   remaps `wallX` to left half (0–0.5) or right half (0.5–1). Frame jamb
   drawing suppressed on the inner edge of paired tiles.
4. ✅ **Alpha-mask UV remap** — Raycaster freeform path (line 1547) detects
   paired `gapTexAlpha` tiles, swaps to wide arch texture, remaps `texX`
   to the correct half. `_computeAlphaRange` then samples the wide texture's
   alpha channel, producing one continuous arch curve across both tiles.
5. ✅ **Raycaster jamb suppression** — Recess block (line 1243) checks if the
   adjacent tile at the jamb exit is the double-door partner. If yes,
   suppresses the jamb wall and continues with the inset depth.
6. ✅ **FloorManager pair detection** — Horizontal scan (`_px`/`_px+1`) and
   vertical scan (`_py`/`_py+1`) detect adjacent DOOR_FACADE or ARCH_DOORWAY
   tiles sharing the same exterior face. Registers pairs and assigns wide
   textures (`arch_wide_brick` for arches, `double_door_wood` for doors).

**Bug fix (2026-04-13): UV continuity in pair side assignment.**
The original side assignment tried to match player-relative left/right per
face direction, which broke UV continuity at tile boundaries. For vertical
pairs on west-facing walls (Floor 0 arches), north tile got `'right'` and
south got `'left'` — at the join, wallX=1 mapped to texture column 127
(right pillar) next to wallX=0 mapping to column 0 (left pillar), producing
a `/\/\` double-arch instead of a single `/ \`. Fix: side assignment now
follows UV continuity unconditionally — west/north tile is always `'left'`
(wallX=1 → U=0.5), east/south tile is always `'right'` (wallX=0 → U=0.5).
Arch textures are symmetric so visual orientation is unaffected.

**Known limitation**: 4-tile clusters (2×2 ARCH_DOORWAY grids like Floor 0)
undergo two pairing passes — horizontal pairs are overwritten by vertical
pairs. The final pairing is all-vertical, which is correct for west-facing
arches but may produce visual artifacts where front/back pairs interact
(porthole tearing). Not worth fixing unless a specific floor design needs it.

**Files modified**: `engine/floor-manager.js` (pair side assignment fix),
`engine/door-sprites.js` (pairing caches + gap filler UV — shipped prior),
`engine/raycaster.js` (jamb suppression + alpha UV remap — shipped prior),
`engine/texture-atlas.js` (wide textures — shipped prior).

---

#### Phase 6B — Great Arches (Floor N→N Transitional Porthole Pairs) ✅ SHIPPED

**Status**: Complete — shares 6A infrastructure; UV continuity fix applied 2026-04-13
**Priority**: HIGH — same infrastructure as 6A, needed for Floor 0→1 gate
**Difficulty**: Low once Phase 6A ships — reuses pairing + UV split
**Estimated size**: ~40 lines (wide arch texture + pairing for ARCH_DOORWAY)

##### Problem

Floor-to-floor transitions on exterior maps (N→N, same depth) use grand
archway gates — the Roman Arch from Floor 0 to Floor 1 is the canonical
example. These are currently two adjacent DOOR tiles at (44,17) and (44,18)
that render as two independent single-tile arches side by side. The player
reads "two narrow doorways" instead of "one grand stone gate."

The ARCH_DOORWAY tile (71) already solves the single-tile version: a
freeform alpha-mask arch cutout (`gapTexAlpha: true`) with transparent
fill — the destination floor shows through the arch opening. But one tile
wide, the arch reads as a narrow passage. A great arch needs to be 2 tiles
wide: one continuous stone surround framing one wide see-through portal.

##### Design: same pairing, no door leaves

A great arch is a double door with no door panel and no animation. The
pairing infrastructure from Phase 6A applies directly:

| Aspect | Double Door (6A) | Great Arch (6B) |
|---|---|---|
| Tile type | DOOR_FACADE (74) | ARCH_DOORWAY (71) |
| Pairing registry | DoorSprites `_doorPairs` | Same registry, same API |
| UV split | 128×64 door panel, L/R leaves | 128×64 arch texture, L/R halves |
| Cavity content | Door panel texture (opaque) | `_transparent` (see-through portal) |
| Alpha mask | Not used (flat hUpper/hLower) | `gapTexAlpha: true` — wide arch curve |
| Recess | Yes (Wolfenstein thin-wall) | Yes (same recess, same jamb suppression) |
| DoorAnimator | Yes (leaves split open) | No (always open — walkthrough arch) |
| Lock/unlock | Yes (boss doors) | No (always passable) |

The key difference: the alpha-mask arch profile needs a **wide variant**.
The current `arch_brick` texture is 64×64 with a parabolic alpha cutout
sized for a single tile. A great arch needs a 128×64 texture where the
alpha cutout spans the full width — a single wide parabola, not two
narrow ones side by side.

##### Wide arch texture (~25 lines in TextureAtlas)

```javascript
// _genWideArch(id, params) — 128×64 procedural texture with alpha channel
// Stone/brick surround filling the full 128×64 area.
// Parabolic alpha cutout centered at column 64, spanning columns ~8–120,
// reaching from row ~10 (apex) to row 63 (ground).
// The cutout α channel drives per-column gap rendering:
//   Left tile samples columns 0–63 (left half of arch + left pillar)
//   Right tile samples columns 64–127 (right half + right pillar)
// Pillar width: ~8px on each side (stone columns flanking the opening)
// Keystone: 6×4px opaque block at (62–65, 10–13) at arch apex
```

Registered variants:
- `arch_wide_brick` — sandstone brick, warm tones (Floor 0→1 Roman gate)
- `arch_wide_stone` — cool grey dressed stone (formal/institutional)
- `arch_wide_iron` — iron-banded stone (industrial/military)

##### Alpha-mask UV coordination

The raycaster's `_computeAlphaRange` already reads the alpha channel of
the tile's wall texture to determine the per-column transparent range.
For paired ARCH_DOORWAY tiles, the UV remap from Phase 6A applies:

```javascript
// In the alpha-mask sampling path, before computing texU:
var pair = DoorSprites.getPairInfo(mapX, mapY);
if (pair) {
  // Remap wallX from 0–1 (single tile) to 0–0.5 or 0.5–1 (wide texture)
  if (pair.side === 'left')  texU = wallX * 0.5;
  else                       texU = 0.5 + wallX * 0.5;
  // Sample alpha from the 128-wide texture at the remapped column
}
```

This means the arch curve is sampled from the wide texture — left tile
gets the left half of the parabola, right tile gets the right half. The
player sees one continuous arch opening. The transparent region behind
the arch shows back-layer walls / sky / the destination floor, same as
the single-tile ARCH_DOORWAY.

##### Jamb suppression

Same as Phase 6A: the shared edge between paired ARCH_DOORWAY tiles
suppresses the center jamb wall. The two recesses merge into one
continuous portal. Without this, a vertical stone pillar renders between
the two halves of the arch — breaking the wide opening.

##### Floor data wiring

FloorManager's pairing scan from Phase 6A already detects adjacent
freeform tiles. ARCH_DOORWAY tiles participate in the same scan:

```javascript
// Existing Phase 6A scan, extended:
for each DOOR_FACADE or ARCH_DOORWAY tile at (x, y):
  check adjacent tile — if same type with same exteriorFace:
    register pair
```

The wide arch texture is assigned via the existing DoorSprites texture
override system (`setTexture(x, y, 'arch_wide_brick')`). FloorManager
sets this when it detects a paired ARCH_DOORWAY.

##### Floor 0 Roman Arch conversion

The existing Floor 0 blockout has:
```
DOOR (44,17) — Roman arch → Floor 1
DOOR (44,18) — Roman arch lower tile → Floor 1
```

Convert to:
```
ARCH_DOORWAY (44,17) — paired, left half, arch_wide_brick
ARCH_DOORWAY (44,18) — paired, right half, arch_wide_brick
doorTargets: { "44,17": "1", "44,18": "1" }
```

Both tiles transition to Floor 1. The player walks through a single wide
stone arch with a see-through portal showing the Promenade beyond.

##### Future great arches

| Location | Transition | Notes |
|---|---|---|
| Floor 0 → Floor 1 | The Approach → The Promenade | Roman gate (flagship) |
| Floor 1 → Floor 2 | The Promenade → Lantern Row | Commercial district gate |
| Floor 2 → Floor 3 | Lantern Row → (future) | District boundary arch |
| Floor 3 → Floor 4 | (future) | Grand Arch from title screen |

The title screen's "Grand Arch" (Layer 3 in the parallax horizon) is the
Floor 3→4 gate. When the player finally reaches it in-game, it should
match the title screen's visual language: stone pillars, cyan arch glow,
wide portal framing the destination.

#### Acceptance criteria (great arches)

1. Two adjacent ARCH_DOORWAY tiles render as one continuous wide arch —
   single parabolic opening spanning both tiles, no center pillar
2. Alpha-mask arch curve samples from a 128×64 wide texture, UV-split
   across the pair
3. Transparent portal shows back-layer content (sky, destination floor
   walls) through the opening — same as single-tile ARCH_DOORWAY
4. Recess merges across the pair — no jamb at the shared tile edge
5. Floor transition triggers from either tile, targeting the same floor
6. No DoorAnimator involvement (always open, walkthrough)
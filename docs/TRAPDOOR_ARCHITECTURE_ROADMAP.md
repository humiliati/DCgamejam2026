# Trapdoor Architecture Roadmap

**Status**: Active — Tiers 1–5 shipped (first pass), Tiers 6–8 specced  
**Last updated**: 2026-04-12  
**Depends on**: Raycast Freeform Upgrade (shipped), Texture Atlas, Door Architecture Roadmap Phase 2  
**Cross-refs**: `DOOR_ARCHITECTURE_ROADMAP.md` (Phase 2 — trapdoor audit), `BLOCKOUT_REFRESH_PLAN.docx`

---

## 1. Problem Statement

Trapdoor tiles (TRAPDOOR_DN 75, TRAPDOOR_UP 76) rendered as a 90% wood wall
with a 10% black sliver on top — an opaque freeform column where almost all
the wall height went to the solid band and the shaft cavity was a thin dark
strip with single-pixel ladder rungs. The player reads "wooden wall with a
dark line" instead of "hatch in the floor/ceiling with a ladder descending
into darkness."

The target: trapdoors should read like the HEARTH tile's chimney — a see-
through cavity occupying most of the column, with a small timber lip framing
the opening, a hatch lid texture on the solid band, a transparent shaft
showing back-layer walls, and a ladder sprite rendered inside the cavity
with proper parallax.

---

## 2. Design Axiom

A trapdoor is a hole in the floor with a ladder in it, not a wall with a
dark stripe painted on.

---

## 3. Reference Pattern: HEARTH Fire Cavity

The HEARTH tile (29) is the architectural template:

- **Freeform split**: hUpper 0.80 (mantle), hLower 0.40 (base), leaving a
  generous 1.30-unit fire cavity on a 2.5-tall chimney.
- **See-through cavity**: `hearth_fire` gap filler paints only a semi-
  transparent amber tint over whatever the back-layer collector already
  rendered behind the tile. The cavity is literally transparent.
- **Billboard sprite**: BonfireSprites emits a dragonfire emoji at the tile
  center. Z-buffer bypass (via `isFreeform`) lets the sprite render through
  the front face distance.
- **Wall decor**: `decor_hearth_fire` texture registered on all walkable-
  neighbor faces via FloorManager's decor loop. Per-column alpha sampling.
- **Pedestal mask**: Solid lower band writes `_zBufferPedTopY` so sprites
  behind the hearth get their bottom half clipped at the stone rim — no
  ghosting through the masonry.

Trapdoors adopt this pattern wholesale.

---

## 4. Phased Implementation

### Tier 1 — Rebalance freeform split ✅ SHIPPED

**Goal**: The cavity is the dominant visual, not a sliver.

**Changes** (`engine/spatial-contract.js`):

| Contract | Tile | Before | After | Cavity |
|---|---|---|---|---|
| Interior (depth 2, wallH 2.0) | TRAPDOOR_DN | hUpper 1.50, hLower 0.00 | hUpper 0.40, hLower 0.00 | 1.60 units (80%) |
| Interior (depth 2, wallH 2.0) | TRAPDOOR_UP | hUpper 0.00, hLower 1.50 | hUpper 0.00, hLower 0.40 | 1.60 units (80%) |
| Nested dungeon (depth 3, wallH 1.2) | TRAPDOOR_DN | hUpper 1.00, hLower 0.00 | hUpper 0.30, hLower 0.00 | 0.90 units (75%) |
| Nested dungeon (depth 3, wallH 1.2) | TRAPDOOR_UP | hUpper 0.00, hLower 1.00 | hUpper 0.00, hLower 0.30 | 0.90 units (75%) |

DN tiles: solid lip on TOP (hatch rim the player peers over), cavity below.
UP tiles: solid lip on BOTTOM (floor-level frame beneath the opening), cavity above.

### Tier 2 — Hatch lid texture ✅ SHIPPED

**Goal**: The solid band reads as an actual hatch door, not generic wood.

**Changes**:

- `engine/texture-atlas.js`: New `_genTrapdoorLid()` generator (64×64 wall
  texture). Horizontal planked wood with 2px iron frame border, two hinge
  plates on the left edge, iron bolts at hinge centers, and a pull ring
  handle right of center. Per-plank color shift and grain variation for
  visual interest.
- `engine/spatial-contract.js`: Wall texture for tiles 75/76 changed from
  `'wood_plank'` to `'trapdoor_lid'` in all three biome contracts (exterior,
  interior, nested dungeon).

**Texture ID**: `trapdoor_lid`  
**Parameters**: `baseR/G/B` (wood), `hingeR/G/B` (iron plates), `boltR/G/B`
(bolt dots), `handleR/G/B` (pull ring). Proc gen can stamp out biome variants
by passing different color params.

### Tier 3 — See-through shaft cavity ✅ SHIPPED

**Goal**: The shaft is transparent. Back-layer walls render behind the
trapdoor tile. A cool-dark tint sells depth.

**Changes**:

- `engine/raycaster.js` (line ~942): Removed `TRAPDOOR_DN` and `TRAPDOOR_UP`
  from the back-face injection exception list. Trapdoors now get the same
  N-layer back-collection as HEARTH — walls behind the tile are gathered and
  painted before the freeform foreground. Z-buffer bypass was already active
  via `TILES.isFreeform()`.

- `engine/door-sprites.js`: Rewrote `_trapdoorShaftFiller` from scratch.

  **Old**: Opaque 3-band dark gradient + 4 single-pixel ladder rungs + dark
  frame border. Painted solid black over the cavity, defeating transparency.

  **New**: Hearth-pattern transparent overlay. Three layers:
  1. **Direction-aware depth tint** — two-band semi-transparent cool-blue-grey
     overlay (`rgba(15,20,30,α)`). DN tiles: lighter near top (opening),
     darker toward bottom (abyss). UP tiles: inverted. Alpha scales with
     brightness and fog for distance fadeout.
  2. **Timber frame border** — 8% edge strips on left/right + 1px top/bottom
     lines. Dark semi-transparent (`rgba(20,15,10,α)`), not opaque.
  3. **No ladder rungs** — the ladder is now a wall decor sprite (Tier 4).

### Tier 4 — Ladder wall decor sprite ✅ SHIPPED

**Goal**: A visible ladder inside the shaft with proper per-column alpha
rendering and face-aware placement.

**Approach chosen**: Wall decor system (not billboard). The ladder paints on
each visible face of the trapdoor tile via the existing `_renderWallDecor`
path. This means the ladder is visible from all four approach angles, each
face shows its own perspective-correct column sampling, and alpha transparency
lets the see-through shaft show between rails and rungs.

**Changes**:

- `engine/texture-atlas.js`: New `_genLadder()` generator (32×32 decor
  sprite). Two vertical rails (3px wide, 56% span) + 5 evenly-spaced
  horizontal rungs + iron bolt dots at each rail/rung joint. Fully
  transparent background (a=0) outside the wood elements. Vertical grain
  on rails, horizontal grain on rungs, alternating light/dark bands.

  **Texture ID**: `decor_ladder`  
  **Parameters**: `railR/G/B` (dark oak), `rungR/G/B` (lighter wood),
  `boltR/G/B` (iron). Proc gen can stamp out variants.

- `engine/floor-manager.js`: New decor registration loop after the
  HEARTH/BONFIRE block. Scans grid for TRAPDOOR_DN/UP tiles, finds walkable
  neighbor faces, registers `decor_ladder` on each face.

  **anchorV** is direction-aware:
  - TRAPDOOR_DN → `0.35` (cavity at bottom of column, ladder anchored low)
  - TRAPDOOR_UP → `0.65` (cavity at top of column, ladder anchored high)

  **anchorU**: `0.5` (centered), **scale**: `0.55` (fills most of cavity).

### Tier 5 — Direction-aware rendering ✅ SHIPPED

**Goal**: DN and UP trapdoors read differently — "looking down into a hole"
vs "looking up at a hatch."

Implemented across Tiers 1–4:

- **Freeform split**: DN has rim on top, cavity below. UP has rim on bottom,
  cavity above. (Tier 1)
- **Gap filler tint**: DN darkens toward bottom. UP darkens toward top.
  (Tier 3)
- **Ladder anchorV**: DN anchored at 0.35, UP at 0.65. (Tier 4)
- **Height offsets**: DN sunken -0.10 (hole in floor feel), UP raised +0.10
  (ceiling hatch feel). (Pre-existing, unchanged)

---

## 5. Remaining Work

### Tier 6 — Pedestal mask for solid band

**Status**: Specced, not yet implemented.

**Problem**: The HEARTH writes `_zBufferPedTopY[col]` for its solid lower
band so sprites behind the hearth get bottom-clipped at the stone rim.
Trapdoors don't do this yet. A sprite standing behind a trapdoor tile could
ghost through the solid hatch-lid band.

**Work**:
1. In the raycaster's freeform foreground helper, after rendering the solid
   band for TRAPDOOR tiles, write `_zBufferPedTopY[col]` at the band's top
   screen row (for DN: top of column; for UP: bottom of cavity).
2. Verify sprite clipping works for enemies/NPCs visible through the shaft.

**Risk**: Low. The pedestal mask path already exists for HEARTH and
CITY_BONFIRE. Trapdoors just need to opt in.

### Tier 7 — Biome-variant texture stamps

**Status**: Specced, not yet implemented.

**Goal**: Different dungeon biomes get different ladder and hatch lid looks.
The generators already accept color parameters — this tier wires per-biome
defaults.

**Work**:
1. Define `defaultTrapdoorStyle` in SpatialContract options:
   ```
   defaultTrapdoorStyle: {
     lidTex: 'trapdoor_lid',       // or 'trapdoor_lid_iron', etc.
     ladderTex: 'decor_ladder',    // or 'decor_ladder_rope', etc.
   }
   ```
2. Register biome-specific texture variants in `_generateAll()`:
   - `trapdoor_lid_iron` — riveted iron plate hatch (Ironhold dungeons)
   - `trapdoor_lid_stone` — heavy stone slab (ancient ruins)
   - `decor_ladder_rope` — rope ladder with wood rungs (cave biomes)
   - `decor_ladder_iron` — iron rungs bolted to stone (fortress biomes)
3. FloorManager reads `defaultTrapdoorStyle` from the contract and passes
   the appropriate texture IDs to `DoorSprites.setTexture()` and the decor
   registration loop.

**3-step stamp-out recipe for new biomes**:
1. Call `_genTrapdoorLid('trapdoor_lid_X', { ... })` with biome colors
2. Call `_genLadder('decor_ladder_X', { ... })` with biome colors
3. Set `defaultTrapdoorStyle` in the biome's SpatialContract constructor

No engine changes needed. Just data.

### Tier 8 — Animation and polish (stretch)

**Status**: Specced, not yet implemented.

**Goal**: Hatch lid opening animation and ladder interaction feedback.

**Work**:
1. **Hatch open/close animation**: When the player interacts with a trapdoor,
   the solid band (lid) splits or slides, similar to DoorAnimator's cavity-
   aware split (Door Architecture Roadmap Phase 4). The lid texture slides
   up into the cavity (UP) or down below the frame (DN) over 300ms.
2. **Ladder climb SFX**: Wood creak + boot-on-rung sequence triggered by
   FloorTransition when the source tile is a trapdoor. Follows the
   DoorContractAudio three-phase timing pattern.
3. **Ladder sway**: Subtle horizontal wallX offset on the decor sprite when
   the player is within 2 tiles, simulating weight on the ladder. Same
   `wobble` parameter as hearth fire sprites.
4. **Shaft ambient**: Faint wind/echo audio loop while standing adjacent to
   a trapdoor tile, volume scaled by shaft depth (deeper dungeon floors =
   louder echo). Managed by a new `TrapdoorAmbient` audio channel or reuse
   of the existing environmental audio system.

---

## 6. Files Modified (Tiers 1–5)

| File | Changes |
|---|---|
| `engine/spatial-contract.js` | Rebalanced tileFreeform for 75/76 in interior + nestedDungeon contracts. Changed wall texture from `wood_plank` to `trapdoor_lid` in all 3 biome contracts. |
| `engine/raycaster.js` | Removed TRAPDOOR_DN/UP from back-face injection exception (line ~942). |
| `engine/door-sprites.js` | Rewrote `_trapdoorShaftFiller` as transparent cool-tint overlay. |
| `engine/texture-atlas.js` | Added `_genLadder()` (32×32 decor), `_genTrapdoorLid()` (64×64 wall). Registered `decor_ladder` and `trapdoor_lid` in `_generateAll()`. |
| `engine/floor-manager.js` | Added trapdoor ladder decor registration loop after HEARTH/BONFIRE block. |

---

## 7. Proc Gen Integration

The entire trapdoor visual system is automatic. To add a trapdoor to any
generated floor:

1. Place `TRAPDOOR_DN` (75) or `TRAPDOOR_UP` (76) on the grid
2. Done.

The SpatialContract provides the freeform split, wall texture, height offset,
and floor texture. FloorManager's decor loop auto-registers the ladder sprite
on walkable-neighbor faces. The raycaster's freeform path renders the
transparent cavity with depth tint. No per-tile overrides needed.

GridGen already handles this: `stairDnTile` / `stairUpTile` overrides in
FloorManager pass `TILES.TRAPDOOR_DN` for depth-2 floors and
`TILES.TRAPDOOR_UP` for depth-3 floors. All generated interior/dungeon
floors get trapdoors automatically.

For biome customization (Tier 7), the contract's `defaultTrapdoorStyle` will
let each biome specify lid and ladder texture variants without touching the
generation code.

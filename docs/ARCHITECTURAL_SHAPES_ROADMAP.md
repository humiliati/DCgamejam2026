# Architectural Shapes Roadmap

> Adding peaked roofs, eaves, stoops, wall-mounted fixtures, and windows
> to a Wolfenstein-style DDA raycaster  without leaving Canvas 2D.

**Prerequisite reads:** `CLAUDE.md` (module conventions), `TEXTURE_ROADMAP.md`
(texture system + height offsets), `SpatialContract` (rendering rules),
`Raycaster` (wall/floor/sprite pipeline).

> **2026-04-10 — Phases 7 & 8 superseded.** Multi-segment column work
> and per-column alpha masks shipped as the freeform rendering system.
> See **`RAYCAST_FREEFORM_UPGRADE_ROADMAP.md`**.
>
> **2026-04-12 — Phase 1 pivoted.** Peaked roofs (graduated height
> offsets) replaced by the **roof moat** system: floating tile strips
> at building-top altitude, proven with tree canopy rings and
> PERGOLA_BEAM lattices. Phase 9 (octagonal columns) scoped to tree
> trunk rendering via all-face recess of the shipped DOOR_FACADE
> technique. Phases 2–6 unchanged.

---

## Engine Summary for Outside Contributors

Dungeon Gleaner uses a **single-hit DDA raycaster** on Canvas 2D. 480 rays
per frame at 60fps, each resolving to one textured wall column via
`ctx.drawImage()` (1px-wide texture strip stretched vertically). No WebGL,
no build tools, no external dependencies  vanilla JS IIFEs loaded by
`<script>` tag order.

### What the renderer already supports

| Capability | Mechanism |
|---|---|
| **Per-tile wall height** | `tileWallHeights` in SpatialContract  multiplier on base wallHeight per tile type. SHRUB=0.5, FENCE=0.4, BONFIRE=0.3. |
| **Per-tile vertical offset** | `tileHeightOffsets` in SpatialContract  positive=raised, negative=sunken. Step fill drawn in the gap (sampled from texture edge for biome-correct color). |
| **N-layer compositing** | Up to 6 background layers per column via multi-hit DDA (`_layerBuf[6]`, `_MAX_BG_STEPS=24`), rendered back-to-front (painter's algorithm). Short foreground walls reveal layers behind them. **IMPLEMENTED.** |
| **Procedural textures** | 59+ textures (64×64 walls/floors, 32×32 décor sprites), generated at init. Brick, stone, wood, metal, door, stair, floor, hazard, infrastructure, and décor variants. Each tile type maps to a texture ID per biome. |
| **Animated textures** | `TextureAtlas.tick(dt)` composites per-frame pixel data into masked texture regions. Used for sealab portholes (ocean scene behind riveted glass). |
| **Floor casting** | ImageData buffer, per-tile texture override, ~64K texel lookups/frame. No ceiling casting (gradient only). |
| **Billboard sprites** | Depth-sorted, Z-buffered, emoji or triple-slot stacks. Euler flattening, facing darkness, glow halos, counter-occlusion clipping. |
| **Per-column Z-buffer** | Sprites test `_zBuffer[col]` against wall distance for occlusion. |
| **Three fog models** | FADE (exterior), CLAMP (interior), DARKNESS (dungeon)  driven by SpatialContract. |

### The fundamental constraint

Each screen column resolves to **one wall segment at one height**. There is
no support for multiple vertically-stacked wall segments in the same column
(no "upper wall / gap / lower wall"). A wall column is either fully opaque
or absent. The N-layer system stacks walls **in depth** (behind each other),
not **in height** (above each other).

This means: transparent holes in walls (true windows, arched doorways with
visible sky above) require a **multi-segment column renderer**  a
significant architectural change to the inner loop. Everything in the "easy
targets" section below works within the existing single-segment model.

### Coordinate system and orientation

+Y = south (screen down). Direction indices: 0=East, 1=South, 2=West,
3=North. The raycaster casts from player position using `rayDirX`/`rayDirY`
computed from player angle + per-column FOV offset. Side 0 = vertical grid
line hit (east/west face), Side 1 = horizontal grid line hit (north/south
face). `wallX` is the fractional U coordinate along the hit face (01).

### Existing height knobs (detail)

**`tileWallHeights[tileType]`**  Multiplier on contract `wallHeight`. A
value of 0.5 renders the wall strip at half the normal height. The raycaster
computes `lineHeight` using `baseWallH * tileWallHeight / perpDist`. Short
walls reveal the sky/ceiling/layers behind them. Currently used for SHRUB
(0.5), FENCE (0.4), BONFIRE (0.3), MAILBOX (0.5), DUMP_TRUCK (0.5),
interior WALL (2.5), TERMINAL (0.6).

**`tileHeightOffsets[tileType]`**  Vertical displacement from floor plane.
Computed as `vertShift = floor((h * offset) / perpDist)`. Positive offset
shifts the wall strip downward (raised platform  step visible below).
Negative offset shifts upward (sunken recess  lip visible above). The gap
is filled with `stepColor` sampled from the texture edge pixel for
biome-correct tinting. Currently used for STAIRS_DN (0.12), STAIRS_UP
(+0.06), BOSS_DOOR (+0.15), HEARTH (0.40 with fire-cavity sandwich
rendering).

**These two knobs compose.** A tile can be both short (0.4 height) and
raised (+0.10 offset). This combination produces a low wall floating above
the floor plane  useful for awnings, railings on decks, window sills.

---

## Phase 1 — Roof Moat System (Floating Strips + Canopy Rings)

> **2026-04-12 — Peaked roofs superseded.** The original graduated-height-
> offset approach (ROOF_EAVE → ROOF_SLOPE → ROOF_PEAK) has been replaced by
> the **roof moat** system: floating tile strips at building-top altitude
> that create rooflines, canopies, and parapets. This pattern was proven
> with tree canopy rings (CANOPY/CANOPY_MOSS) and the PERGOLA_BEAM lattice,
> and borrows the canales principle — water-spout-like structural projections
> that break the flat roofline and read as depth from any approach angle.

**Status:** Tile types SHIPPED, rendering SHIPPED, placement in progress.
**Difficulty:** Easy — pure data (tile placement in templates + contract tuning).

### Shipped tile types

| Constant | ID | wallHeight | heightOffset | Rendering | Notes |
|---|---|---|---|---|---|
| `ROOF_EAVE_L` | 60 | 0.20 | 2.8 | Float (thin strip) | Left eave |
| `ROOF_SLOPE_L` | 61 | 0.25 | 3.0 | Float (thin strip) | Left slope |
| `ROOF_PEAK` | 62 | 0.30 | 3.2 | Float (thin strip) | Ridge beam |
| `ROOF_SLOPE_R` | 63 | 0.25 | 3.0 | Float (thin strip) | Right slope |
| `ROOF_EAVE_R` | 64 | 0.20 | 2.8 | Float (thin strip) | Right eave |
| `CANOPY` | 65 | 0.25 | 2.0 | Float (opaque lid) | Tree canopy ring |
| `CANOPY_MOSS` | 66 | 0.25 | 2.0 | Float (translucent) | Swamp canopy |
| `ROOF_CRENEL` | 67 | 0.50 | 3.0 | Float (toothed) | Crenellated rampart |
| `PERGOLA` | 68 | 0.50 | 2.5 | Float + back-face | Open-air beam lattice |
| `CITY_BONFIRE` | 69 | 2.0 | — | Freeform column | Pyre (pedestal + fire + hood) |
| `PERGOLA_BEAM` | 70 | 2.0 | — | Freeform canopy | Beam landing on pyre hood |

### Design principle: the roof moat

A "roof moat" is a ring of floating tiles placed at building-top altitude.
From the player's ground-level perspective, the ring reads as a continuous
roofline with visible depth — the gap between the floating strip and the
building wall behind it creates a shadow channel (the "moat"). This is
superior to the original peaked-roof approach for three reasons:

1. **Reads from all approach angles.** Graduated height offsets only
   produced a convincing roofline from one direction. Floating strips at
   constant altitude work from every angle — the player always sees the
   strip silhouetted against sky or taller background geometry.

2. **Canales-style projections.** Mixing tile types at different offsets
   along the ring (eave at 2.8, crenel at 3.0, pergola at 2.5) creates
   the irregular projecting-beam roofline of adobe/pueblo architecture.
   The visual rhythm is more interesting than a smooth graduated slope.

3. **Proven with tree canopies.** CANOPY tiles at offset 2.0 already
   render convincingly as leafy crowns floating above trunk columns. The
   same technique at offset 2.8–3.2 produces building roofs. PERGOLA_BEAM
   (freeform, transparent gap) proves that the system supports see-through
   lattice structures at altitude.

### Remaining work

- Place roof moat rings on Promenade and Lantern Row building templates
- Tune per-building heightOffset variation for architectural variety
- Add `roof_shingle`, `roof_slate`, `roof_thatch` textures for the
  floating strips (currently using default wall textures)
- Canales detail: composite textures with protruding beam / drain channel
  painted into the strip face

---

## Phase 2  Eaves & Awnings Over Doors (Data + Minor Texture Work)

**Difficulty:** Easy  same height-offset mechanism as roofs.
**Estimated size:** ~40 lines (tile defs + texture generators).

### Concept

An eave is a horizontal beam projecting above a door. In column-based
rendering, we can't project geometry outward from the wall plane. Instead,
we use a tile above (or flanking) the door with a contrasting texture at a
slight positive offset, and a dark step fill that reads as shadow.

### Approach A: Dedicated eave tile above door

```
AWNING = 65   // Horizontal beam / awning / eave
```

| Property | Value | Effect |
|---|---|---|
| tileWallHeights | 0.15 | Very thin strip |
| tileHeightOffsets | +0.20 | Floats above the door's height |
| Texture | `wood_beam` | Dark horizontal wood grain |
| stepColor | Dark (sampled) | Shadow band below the beam |

Place AWNING tiles in the template row above door tiles. The player sees a
dark beam floating above the door with shadow underneath. The door tile's
own height offset (+0.15 for BOSS_DOOR, 0 for normal DOOR) creates vertical
separation.

### Approach B: Texture-painted eave on the wall above the door

For buildings where there is no separate tile row above the door (the door
is at the top of the building face), paint an eave into the wall texture
itself. Create a `wall_with_eave` texture variant: the top 812 rows of
the 6464 texture show a protruding beam with shadow hatching below it.
When the raycaster samples this texture, the eave is baked into every
column.

This is the porthole pattern  visual detail composited into the texture
surface, not separate geometry.

### New textures

| Texture ID | Pattern | Notes |
|---|---|---|
| `wood_beam` | Dark horizontal plank with shadow edge | Awning / eave strip |
| `awning_striped` | Alternating colored stripes (café awning) | Boardwalk shops |
| `wall_brick_eave` | `brick_light` base with protruding beam at top 12px | Composite variant |

---

## Phase 3  Stoops & Decks (Data + Floor Texture)

**Difficulty:** Easy to moderate  data-driven for basic stoops, requires
floor-texture tricks for extended decks.
**Estimated size:** ~50 lines (tile defs + floor texture entries).

### Stoops (raised step before a door)

A stoop is a single tile in front of a door with a positive height offset.
The step fill reads as the platform surface.

```
STOOP = 66   // Raised entry step
```

| Property | Value | Effect |
|---|---|---|
| tileWallHeights | 0.08 | Nearly flat  just a step lip |
| tileHeightOffsets | +0.10 | Raised above ground plane |
| Texture | `stone_rough` or `concrete` | Matches building material |
| Floor texture override | `floor_stone_step` | Lighter stone for the step surface |

The stoop tile is **walkable** (player steps onto it to reach the door).
Its short wall height + positive offset produces a thin raised lip. The
floor texture override on the stoop tile differentiates it from surrounding
ground.

### Decks (multi-tile raised platform)

A deck is several stoop-like tiles forming a raised area. All deck tiles
share the same offset and floor texture. Railing tiles (FENCE, 0.4 height)
at the edges complete the look.

```
Template layout (top-down):

  F  F  F  F  F      FENCE railing (short wall, blocks movement)
  F  DK DK DK F      DECK walkable tiles
  F  DK DK DK F
  .  .  ST .  .      STOOP entry step (single tile, walkable)
  .  .  .  .  .      ground
```

Where DK = DECK tile (walkable, positive offset, boardwalk floor texture),
ST = STOOP (transitional step), F = FENCE (existing tile, 0.4 height).

```
DECK = 67   // Raised platform tile (walkable)
```

| Property | Value | Effect |
|---|---|---|
| tileWallHeights | 0.08 | Minimal lip |
| tileHeightOffsets | +0.10 | Same as stoop  continuous platform |
| Floor texture override | `floor_boardwalk` | Warm wood planking |

### Limitation

The deck has no visible **thickness** from the side. A player standing at
ground level looking at the deck edge sees the step fill (a colored band)
but not a 3D platform. The floor casting always renders at Y=0  there is
no elevated floor plane. The visual reads as "raised ground" rather than
"freestanding platform." This is acceptable for stoops and porches but
would not convincingly render a second-story balcony.

---

## Phase 4  Wall-Mounted Boxes (Texture Compositing)

**Difficulty:** Moderate  new texture variants, no renderer changes.
**Estimated size:** ~120 lines (texture generators for composite wall textures).

### Concept

HVAC units, planters, window boxes, and signage attached to building walls.
The raycaster cannot place geometry on a wall face at an arbitrary position,
but it CAN render a wall texture that has these objects painted onto it.

This is the same pattern as the porthole system: visual detail composited
into the wall texture. The object is parallax-correct (it slides naturally
as the player strafes past) with no rotation issue.

### Implementation

Create composite wall texture variants in `TextureAtlas`:

| Texture ID | Base | Overlay | Notes |
|---|---|---|---|
| `wall_brick_planter` | `brick_light` | Green planter box at row 4056 | Under-window flower box |
| `wall_brick_hvac` | `brick_light` | Grey metal unit at row 4460 | Street-facing AC unit |
| `wall_concrete_vent` | `concrete` | Horizontal slat grate at row 3244 | Ventilation cover |
| `wall_wood_sign` | `wood_plank` | Colored rectangle at row 828 | Shop signage |
| `wall_brick_mailslot` | `brick_light` | Small brass rectangle at row 3642 | Letter slot |

Each generator calls the base texture generator first, then composites the
overlay detail onto the canvas. The overlay is a small procedural drawing
(rectangle with border, slat lines for vents, leaf shapes for planters).

### Biome assignment

Map these composite textures to specific tile types or wall positions in
floor templates. Options:

**Option A — New tile types:** `WALL_PLANTER = 68`, `WALL_HVAC = 69`, etc.
Each maps to its composite texture in SpatialContract. Place them in
templates where you want the detail. Pro: explicit, easy to reason about.
Con: burns tile type IDs for purely cosmetic variation.

**Option B  Wall decor texture randomizer:** During floor generation,
randomly assign composite wall texture variants to eligible WALL tiles
(e.g., 20% of exterior walls facing the street get a planter, 10% get
HVAC). Store the per-cell texture override in a parallel grid read by the
raycaster. Pro: organic variety without new tile types. Con: requires a
per-cell texture override grid (new data structure, ~30 lines).

**Recommendation:** Option A for hand-authored templates (Phase 1 floors
like The Promenade), Option B for proc-gen exteriors (future districts).
Start with Option A.

### Limitations

The object is flat  no shadow projection, no depth. A planter box on a
wall face has no visible bottom or side profile. At the chunky pixel-art
scale (6464 textures at 480px viewport), this reads fine for small
fixtures. For larger objects (a full window box with trailing vines), the
flat rendering may feel unconvincing.

Animated variants (dripping AC unit, swaying planter) would use the
porthole animation system (`tick(dt)` + pixel mask). Budget: ~4K pixel
writes/frame per animated composite texture  negligible.

---

## Phase 5  Interior Windows (Painted-On, Porthole Pattern)

**Difficulty:** Moderate  extends the animated texture system.
**Estimated size:** ~150 lines (texture generators + optional tick animation).

### Concept

Windows inside buildings, rendered as painted-on texture detail  not
transparent holes. The player sees a window frame with an interior scene
(warm glow, curtains, furniture silhouettes) or an exterior scene (sky
gradient, distant buildings) composited into the wall texture.

This is the porthole pattern generalized. The porthole shows an animated
ocean scene behind riveted glass. Interior windows show a painted diorama
behind mullioned glass.

### New textures

| Texture ID | Frame | Scene | Animated | Notes |
|---|---|---|---|---|
| `window_warm` | Wood mullion cross | Warm amber glow, curtain silhouette | Optional flicker | Tavern / inn window |
| `window_dark` | Wood mullion cross | Dark interior, faint furniture shadow | No | Closed shop / night |
| `window_sky` | Stone sill + lintel | Sky gradient, cloud wisps | Optional drift | Upper story, facing out |
| `window_stained` | Lead came grid | Colored glass panels (red/blue/gold) | No | Cathedral / guild hall |
| `window_shutter` | Wood frame | Closed wooden shutters (plank texture) | No | Residential, secured |

### Implementation

Each window texture is a 6464 canvas:

1. Generate the base wall texture (brick, stone, wood) as background
2. Define a rectangular window region (e.g., rows 848, cols 1648)
3. Draw the frame (mullion cross, sill, lintel) as darker rectangles
4. Fill the interior region with the scene:
   - **Static:** gradient + silhouette shapes composited at init
   - **Animated:** register with `_portholes` array for per-frame
     compositing (warm flicker = modulate glow brightness with torch
     flicker function, cloud drift = horizontal pixel offset)

### Wall texture assignment

Create composite wall-with-window textures:

```
wall_brick_window_warm  = brick_light base + window_warm overlay
wall_stone_window_sky   = stone_rough base + window_sky overlay
wall_wood_window_dark   = wood_plank base + window_dark overlay
```

Map to new tile types (`WALL_WINDOW_WARM = 70`, etc.) or use the per-cell
texture randomizer from Phase 4 Option B.

### What this achieves

From a distance: the player sees building facades with warm-lit windows
punctuating dark walls. The scene reads as "inhabited building with
interior life." Strafing past the building, the window slides naturally
(parallax-correct UV sampling). The warm glow flicker adds life without
any renderer changes.

From close range: the painted-on scene is clearly a flat diorama. The
player cannot see their actual surroundings through the window. This is
the same limitation as the porthole  and the porthole reads convincingly
in practice because the animated detail holds attention.

### What this does NOT achieve

The player cannot look *through* a window to see the room/sky behind it.
The window shows a predetermined scene, not a live view. For most gameplay
contexts (walking past building facades on the boardwalk), this is
sufficient. For windows where the player expects to see a specific interior
(looking into the card shop from outside), it breaks the illusion.

True transparency requires Phase 7 (multi-segment columns).

---

## Phase 6  Billboard Architectural Props (Sprite System)

**Difficulty:** Moderate  extends sprite rendering, no raycaster changes.
**Estimated size:** ~80 lines (new sprite types + placement logic).

### Concept

Freestanding or wall-adjacent architectural details rendered as billboard
sprites: potted plants, benches, lamp posts, barrel clusters, hanging
signs, awning poles. These are placed at fractional grid positions near
walls and depth-sorted naturally by the existing sprite system.

### New sprite categories

| Sprite | Position | Scale | Notes |
|---|---|---|---|
| Potted plant | (x+0.15, y) near wall | 0.4 | Emoji or texture billboard |
| Bench | (x+0.5, y+0.3) sidewalk | 0.35 | Long horizontal sprite |
| Lamp post | (x+0.5, y) street edge | 0.9 | Tall, thin, glow halo |
| Hanging sign | (x+0.1, y) near wall | 0.3 | Small rectangle + bracket |
| Rain barrel | (x+0.2, y) near wall | 0.35 | Short cylindrical shape |

### Wall-facing flag

Add a `wallFacing` property to sprite data. When set, the sprite suppresses
Euler flattening and renders at constant width regardless of viewing angle.
This prevents wall-adjacent objects from narrowing when viewed from the
side, which breaks the illusion of a box attached to a wall.

Implementation: in the sprite render loop, skip the
`flatScale = 0.55 + 0.45 * dot²` calculation when `wallFacing` is true.
Use `flatScale = 1.0` instead. ~3 lines changed in raycaster sprite
rendering.

### Placement

Floor templates specify sprite positions in their JSON data. Proc-gen
floors use placement rules: "place lamp post every 3 tiles along ROAD
edges," "place potted plant at 30% of shop door tiles."

### Limitations

Billboards always face the camera. A bench viewed from the end looks
identical to a bench viewed from the side. The `wallFacing` flag helps
for wall-mounted objects but doesn't solve freestanding furniture.

For the chunky pixel-art scale, this is acceptable  Wolfenstein used the
same trick for table lamps, potted plants, and chandeliers. The player's
brain fills in the 3D shape.

---

## Phase 7 — True Window Transparency ⛔ SUPERSEDED

> **Superseded by `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md`.**
> The multi-segment column renderer, per-column alpha masks, and Z-buffer
> bypass described here shipped as the **freeform rendering system**. Tiles
> opt in via `tileFreeform` in SpatialContract; the raycaster renders upper
> band → transparent cavity → lower band with per-column gap fillers and
> Z-buffer bypass for sprite visibility through cavities. Currently used by
> DOOR_FACADE, WINDOW_TAVERN, HEARTH, BONFIRE, TRAPDOOR_DN/UP, PORTHOLE,
> CITY_BONFIRE, and PERGOLA_BEAM.
>
> No further work planned under this phase. See the freeform roadmap for
> remaining tiers (secondary raycast through cavities, animated gap fillers).

---

## Phase 8 — Arched Doorways & Shaped Openings ⛔ SUPERSEDED

> **Superseded by `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md`.**
> Per-column alpha ranges (arch curves, irregular openings) are a future
> tier of the freeform system, not a standalone phase. The freeform
> architecture already supports per-tile hUpper/hLower splits; extending
> to per-column variable splits is the natural next step when art direction
> demands curved openings.
>
> No further work planned under this phase.

---

## Implementation Priority

```
POST-JAM POLISH — updated 2026-04-12

 Phase 1: Roof Moat System  ✔ TILES SHIPPED, placement in progress
    11 tile types shipped (60–70): eaves, slopes, peak, canopy,
      canopy_moss, crenel, pergola, city_bonfire, pergola_beam
    Remaining: template placement, roof textures, canales detail

 Phase 2: Eaves & Awnings 
    1 new tile type (AWNING)
    2 beam textures + composite wall-with-eave variants
    Place above doors in existing templates

 Phase 3: Stoops & Decks 
    2 new tile types (STOOP, DECK)
    Floor texture overrides for platform surface
    Railing via existing FENCE tile

 Phase 4: Wall-Mounted Boxes 
    5 composite wall texture variants
    New tile types or per-cell texture randomizer
    Place in Promenade/Lantern Row templates

 Phase 5: Painted-On Windows  (huge atmosphere gain)
    5 window textures (warm, dark, sky, stained, shutter)
    Composite wall-with-window textures
    Optional animated warm glow via porthole system

 Phase 6: Billboard Props 
    wallFacing flag (~3 lines in raycaster)
    5 prop sprite definitions
    Placement rules for templates + proc-gen

 Phase 9: Octagonal Tree Trunks  (medium priority)
    Stage 1: recessAllFaces flag + isExteriorHit gate bypass (~18 lines)
    Stage 2: chamferCorners diagonal planes in jamb branch (~35 lines)
    Reference: raycast.js-master WALL_DIAG + getIntersect
    chamferTexture / jambTexture for bark on corner + face columns
    Wire up tree tiles + CANOPY rings in templates

   ⛔ superseded — no further work ───────────────────

 Phase 7: True Window Transparency → RAYCAST_FREEFORM_UPGRADE_ROADMAP.md
 Phase 8: Arched Openings → RAYCAST_FREEFORM_UPGRADE_ROADMAP.md
```

---

## Phase 9 — Octagonal Columns / Tree Trunks (Recess Generalization)

**Priority:** Medium — primary use case is round tree trunk columns.
**Difficulty:** Medium — extends DOOR_FACADE recess to all four faces, adds
diagonal corner planes adapted from `raycast.js-master` WALL_DIAG.
**Estimated size:** ~90 lines (all-face recess ~18, diagonal chamfer ~35,
textures ~15, contract wiring ~20).
**Prerequisite**: Phase 1.5 of `DOOR_ARCHITECTURE_ROADMAP.md` (Wolfenstein
thin-wall offset for DOOR_FACADE — **SHIPPED**).

### Problem

Trees, stone pillars, and decorative columns all occupy a full grid tile. In
the raycaster they render as **square pillars** — the ray hits the tile
boundary and the wall face is flush with adjacent geometry. This is fine for
walls but wrong for cylindrical/organic objects. Tree trunks are the most
visible offender — a CANOPY ring floating above a square column reads as
"box with hat" rather than "tree."

### Insight: recess on all four faces

The DOOR_FACADE recess offsets perpDist by `_recessD` on the **exterior face
only**, producing visible jamb walls on either side. The gate is at
`raycaster.js` line 1225–1227:

```javascript
if (TILES.isFreeform(hitTile) &&
    typeof DoorSprites !== 'undefined' && DoorSprites.isExteriorHit &&
    DoorSprites.isExteriorHit(mapX, mapY, side, stepX, stepY)) {
```

If we apply the same inset to **all four faces** of a tile, every approach
angle sees the wall face recessed into the tile interior. The corners of the
tile — where a ray enters one face but exits through the adjacent face before
reaching the inset — render as jamb walls. The visual result: the tile's
silhouette is no longer a square.

### Two-stage cross-section: plus profile → octagonal chamfer

The implementation builds in two stages. Stage 1 (all-face recess) gets
the silhouette off the tile boundary. Stage 2 (diagonal chamfer) rounds
the corners. Both stages ship together — a plus-shaped tree trunk doesn't
read as round.

**Stage 1 — Recessed square (plus/cross profile):**

Apply the existing recess math to all 4 faces. No new raycaster geometry —
just bypass the `isExteriorHit` gate for tiles flagged as columns.

```
  Plan view (top-down, tile boundary = outer box):
  ┌─────┬─────┬─────┐
  │jamb │ face│jamb │    Each face is recessed by d units.
  ├─────┘     └─────┤    Corner regions render as jamb walls
  │                  │    (perpendicular face at the tile boundary).
  │    recessed      │
  │    column face   │    Result: plus-shaped cross-section.
  │                  │
  ├─────┐     ┌─────┤
  │jamb │ face│jamb │
  └─────┴─────┴─────┘
```

**Stage 2 — Chamfered octagon (diagonal corner planes):**

Replace the axis-aligned jamb walls with 45° diagonal faces. When a ray
enters the corner zone (the region that would be a jamb in Stage 1),
compute intersection with a diagonal line segment connecting the inset
points of the two adjacent faces. The column renders at the diagonal hit
depth with texture U sampled from the parametric position along the segment.

```
  Plan view (octagonal cross-section):
  ┌───┬───────┬───┐
  │  ╱         ╲  │    Corner zones render as diagonal faces.
  │╱             ╲│    d = recess depth (0.20 for trees).
  │               │    Diagonal endpoints:
  │   column      │      NE corner: (1-d, 0) → (1, d)
  │   face        │      SE corner: (1, 1-d) → (1-d, 1)
  │               │      SW corner: (d, 1) → (0, 1-d)
  │╲             ╱│      NW corner: (0, d) → (d, 0)
  │  ╲         ╱  │
  └───┴───────┴───┘
```

The result: an 8-sided cross-section. At the 64×64 pixel-art scale this
reads as round. Tree trunks get organic silhouettes from every angle.

### Reference implementation

`raycast.js-master` already ships diagonal walls (`WALL_DIAG` type) with
the exact math we need:

- **`OFFSET_DIAG_WALLS`** (line 372): 4 diagonal orientations defined as
  endpoint pairs `[[x0,y0],[x1,y1]]` within a tile.
- **`getIntersect`** (line 477): line-line intersection via 2D cross
  product. Takes two line segments, returns intersection point or null.
- **Rendering** (line 1841–1877): compute intersection, check visibility
  via `pointVsRect`, sample texture U from `(hitX - x0) / (x1 - x0)`.

For octagonal columns, we adapt this pattern: instead of one diagonal per
tile (WALL_DIAG), we have 4 diagonals (one per corner), and we only test
the corner that the jamb detection identified. The diagonal replaces the
jamb — same column, different geometry.

### Implementation plan

**Step 1 — Contract flag: `recessAllFaces`** (~10 lines)

Add `recessAllFaces: true` to the freeform config in SpatialContract.
DOOR_FACADE keeps `recessAllFaces: false` (exterior-only, as shipped).
Tree trunk tiles opt in.

```javascript
// In SpatialContract tileFreeform for tree trunk tile:
TILES.TREE_TRUNK: Object.freeze({
  hUpper: 0.0, hLower: 0.0,   // no freeform bands (solid column)
  recessD: 0.20,               // inset depth
  recessAllFaces: true,         // recess on all 4 faces
  chamferCorners: true          // diagonal corner planes (Stage 2)
})
```

**Step 2 — Raycaster: all-face recess gate** (~8 lines)

In the recess block (`raycaster.js` line 1225), add an alternative path:

```javascript
var _rfCfg = (_contract) ? SpatialContract.getTileFreeform(_contract, hitTile) : null;
var _allFaceRecess = _rfCfg && _rfCfg.recessAllFaces;

if (TILES.isFreeform(hitTile) && (
    _allFaceRecess ||
    (typeof DoorSprites !== 'undefined' && DoorSprites.isExteriorHit &&
     DoorSprites.isExteriorHit(mapX, mapY, side, stepX, stepY))
)) {
```

When `recessAllFaces` is true, every face is treated as an exterior hit.
The rest of the recess math (perpDist advance, jamb detection, side flip)
works identically — no changes needed downstream.

**Step 3 — Raycaster: diagonal chamfer in jamb branch** (~35 lines)

When the existing recess block detects a jamb hit (ray exits tile
laterally before reaching inset plane), and `chamferCorners` is true,
replace the axis-aligned jamb with a diagonal intersection:

```javascript
// Inside the jamb branch (line 1241), after _recessJamb = true:
if (_rfCfg && _rfCfg.chamferCorners) {
  // Identify which corner based on entry face (side) and exit direction
  var d = _recessD;
  var cx0, cy0, cx1, cy1; // diagonal segment endpoints (tile-local)
  if (side === 0 && stepY > 0)      { cx0 = 1-d; cy0 = 0; cx1 = 1; cy1 = d; } // NE
  else if (side === 0 && stepY <= 0) { cx0 = 1; cy0 = 1-d; cx1 = 1-d; cy1 = 1; } // SE
  else if (side === 1 && stepX > 0)  { cx0 = 0; cy0 = d; cx1 = d; cy1 = 0; } // NW
  else                               { cx0 = d; cy0 = 1; cx1 = 0; cy1 = 1-d; } // SW
  // ... (select correct corner based on side + step direction)

  // Ray-line intersection (adapted from raycast.js-master getIntersect)
  var wx0 = mapX + cx0, wy0 = mapY + cy0;
  var wx1 = mapX + cx1, wy1 = mapY + cy1;
  var seg = [wx1 - wx0, wy1 - wy0];
  var orig = [wx0 - px, wy0 - py];
  var ray = [rayDirX, rayDirY];
  var denom = seg[0] * ray[1] - seg[1] * ray[0];
  if (Math.abs(denom) > 1e-10) {
    var t = (orig[0] * ray[1] - orig[1] * ray[0]) / denom;
    if (t >= 0 && t <= 1) {
      var hitPx = wx0 + t * seg[0];
      var hitPy = wy0 + t * seg[1];
      perpDist = Math.abs((hitPx - px) * ... ); // perpendicular projection
      wallX = t; // texture U from parametric position on diagonal
      _recessJamb = true; // still a jamb for z-buffer purposes
      // side stays as-is — the diagonal face uses the chamfer texture
    }
  }
}
```

The corner selection logic maps `(side, stepX, stepY)` to one of 4
diagonal segments. The 8 possible `(side, stepDirection)` combinations
map to 4 corners (two entry faces per corner). The exact mapping needs
validation against the coordinate system (+Y = south), but the reference
engine's `OFFSET_DIAG_WALLS` provides the template.

**Step 4 — Chamfer texture + jamb texture** (~15 lines)

Add `chamferTexture` and `jambTexture` fields to the freeform config.
DOOR_FACADE jambs render as masonry (tile's wall texture — unchanged).
Tree trunk chamfer faces render as bark. Falls back to the tile's wall
texture if unset.

**Step 5 — Wire up tree trunk tiles** (~20 lines)

Register tree tiles with the full freeform config. Place CANOPY rings
above them in templates. The visual result: a bark-textured octagonal
column with a leafy canopy floating at altitude — reads as a tree.

### Collision note

The DDA grid is still square — the player's collision AABB tests against
the full tile boundary, not the octagonal silhouette. The player cannot
walk into the recessed corners. This is conservative (the collision box
is larger than the visual shape) and matches DOOR_FACADE behavior (the
player can't walk into the door recess). For tree trunks this is correct —
you don't walk into a tree trunk.

If future use cases need tight collision (walking between octagonal
pillars in a colonnade), the collision system would need diagonal wall
checks adapted from `raycast.js-master`'s `c_collision.js` (line 197+).
Not needed for trees.

### Use cases (priority order)

1. **Tree trunks** — primary motivation. CANOPY above, octagonal trunk below.
2. **Stone pillars** — dungeon support columns, temple pillars.
3. **Lamp posts** — tall thin columns (high recessD, very short wallHeight).
4. **Round towers** — exterior tower silhouettes with large recessD.
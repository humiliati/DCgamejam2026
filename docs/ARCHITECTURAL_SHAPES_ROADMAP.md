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
>
> **2026-04-14 — Stale-refresh pass.** Phase 5 (Painted-On Windows)
> **superseded** — see the shipped window-tile family
> (`WINDOW_SHOP`/`BAY`/`SLIT`/`ALCOVE`/`COMMERCIAL`/`ARROWSLIT`/`MURDERHOLE`)
> plus EmojiMount cavity vignettes in `LIVING_WINDOWS_ROADMAP.md`.
> Phase 9 tree-trunk target updated to **true circular bases** (the
> chamfered octagon was a good stepping stone but the real goal is a
> ray-vs-circle equation per tile); an alternative **untested 4-tile
> column cluster** pattern is queued. Added a new **Living
> Architecture Primitives** section, a **Tile Predicates** reference,
> and a **Dependencies for Open-Building NPC Flow** punch list
> tracking the pergola-as-NPC-shuffler work. Cross-refs to
> `LIVING_WINDOWS_ROADMAP.md` phases 6–12 and `PROXY_ZONE_DESIGN.md`
> added where relevant.

---

## Cross-Reference Map

This roadmap covers **shapes and silhouettes** — the envelopes the renderer
projects. The consumers of those shapes live in other docs:

| Doc | Consumes |
|---|---|
| `LIVING_WINDOWS_ROADMAP.md` | Window tile family + EmojiMount cavity scenes (replaces the old Phase 5 painted-on pattern). Phases 6–12: EmojiMount port, surface-mount tiles (TABLE/COUNTER/COFFEE_TABLE), blockout authoring, patrons, hours, polish, proxy zones. |
| `PROXY_ZONE_DESIGN.md` | Inverse facade — interior floors N.N with windows looking out at pasted floor-N exterior tiles + parent skybox substitution. Depends on the open-sky predicate (see Tile Predicates below). |
| `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md` | Multi-segment columns, per-column alpha, Z-buffer bypass. Consumed by PERGOLA_BEAM, WINDOW_*, HEARTH, BONFIRE, CITY_BONFIRE, DOOR_FACADE, PORTHOLE, TRAPDOOR_*. |
| `DOOR_ARCHITECTURE_ROADMAP.md` | Wolfenstein thin-wall offset for DOOR_FACADE (shipped). Phase 9 tree-trunk recess builds directly on this. |

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

## Living Architecture Primitives

The shipped kit below is what "open buildings composed mostly of windows
and beams" is built from. These primitives are the substrate Living
Architecture (NPCs shuffling through semi-enclosed spaces) stands on.

| Primitive | Tile(s) | Role | Status |
|---|---|---|---|
| **Pergola deck** | `PERGOLA` (68) | Walkable floor with open-sky roofing; back-face sampling for shaded edges. | Shipped, used on floor 1 plaza. |
| **Pergola beam** | `PERGOLA_BEAM` (70) | Freeform top-anchored beam at chimney elevation (`hUpper>0, hLower=0`). Lands on `CITY_BONFIRE` hood, rings the pyre. | Shipped, 8-cell ring around floor-1 bonfire. |
| **City bonfire** | `CITY_BONFIRE` (69) | Freeform pyre (pedestal + fire cavity + hood) — the pergola's structural anchor. | Shipped, floor 1. |
| **Canopy ring** | `CANOPY` (65), `CANOPY_MOSS` (66) | Floating opaque/translucent lid at altitude. Original use: tree canopies. Generalized: any roofline moat. | Shipped, rendering; placement in progress. |
| **Window tile family** | `WINDOW_SHOP`, `WINDOW_BAY`, `WINDOW_SLIT`, `WINDOW_ALCOVE`, `WINDOW_COMMERCIAL`, `WINDOW_ARROWSLIT`, `WINDOW_MURDERHOLE` | Freeform cavity walls. EmojiMount binds cavity vignettes. Face-aware tint (amber/cyan) drives day-night orientation. | Shipped tiles; EmojiMount port in flight (Phase 6 of LIVING_WINDOWS). |
| **Fence** | `FENCE` | Low wall (0.4× height) — waist-high barrier, walkable from sprite pass but blocks DDA ray termination only partially. Used as pergola infill / deck railing. | Shipped. |
| **Canales / roof crenel** | `ROOF_CRENEL` (67) | Toothed rampart strip — breaks flat rooflines so they read as depth from any angle. | Shipped tile, placement in progress. |

### Why these matter to Living Architecture

Open buildings let NPCs path through a tile while the tile still reads as
"roofed" or "enclosed" from a distance. `PERGOLA` deck tiles are
walkable; `PERGOLA_BEAM` is rendered from the top of the 2.0-unit column
(no ground-level occlusion); `FENCE` is shin-high. A plaza ringed by
pergola beams + fence segments + bonfire hood is a structured social
space the NPCs can diffuse through without pathing breaking — that's
the substrate the Living Architecture design depends on.

Cross-ref: `LIVING_WINDOWS_ROADMAP.md` §Phase 12 (proxy zones) uses
this same kit on the interior side — interior floors get the pergola
beam + window family mirrored with parent-floor skybox substitution.

---

## Tile Predicates (shipped)

The tile-class predicates below are the vocabulary the raycaster and
floor generator use to reason about shapes without hard-coded tile IDs.
Most live in `engine/tiles.js`; a few are contract-driven.

| Predicate | Location | Used for |
|---|---|---|
| `TILES.isOpaque(t)` | `tiles.js` | DDA termination — does the ray stop here? |
| `TILES.isWalkable(t)` | `tiles.js` | Player + NPC movement, AI pathing. |
| `TILES.isFreeform(t)` | `tiles.js` | Raycaster routes to multi-segment column pipeline. |
| `TILES.isWindow(t)` | `tiles.js` | Window tile family gate for EmojiMount cavity binding. |
| `TILES.hasFlatTopCap(t)` | `tiles.js` | Top-plane cap rendering for STOOP/DECK + counter-top surface mounts. |
| `TILES.hasVoidCap(t)` | `tiles.js` | Signals "no ceiling above this tile" — dungeon punch-throughs. |
| `SpatialContract.tileFaceWallHeights` | `spatial-contract.js` | Per-face height override (front vs. back inferred from walkable neighbor). Shipped for TERMINAL; available to any tile. |

### Predicates in flight (not yet shipped)

| Predicate | Planned for | Reference |
|---|---|---|
| `TILES.hasOpenSky(t)` | Proxy zones — ceiling-pass branch paints parent-floor skybox. | `PROXY_ZONE_DESIGN.md` §3 |
| `tileFaceFreeform(contract, tile, face)` | One-sided pergola (dropping `hLower` to floor on one face while keeping the other as open beam). See Dependencies punch list below. | (not yet scoped) |

---

## Dependencies for Open-Building NPC Flow

"We're mostly successful" on the open-building primitives. This table
tracks the dependencies for using them as NPC shuffle-through spaces:

| # | Dependency | Status | Notes |
|---|---|---|---|
| 1 | **Sprite occlusion under PERGOLA_BEAM** | ✅ Verified on floor 1 at `CITY_BONFIRE` plaza | Sprites render correctly beneath the 8-cell beam ring. Z-buffer bypass + pedestal-occlusion logic holds up. |
| 2 | **NPC pathing across PERGOLA tiles** | ⚠️ Untested | No NPC has actually walked across a PERGOLA deck cell yet. Need a scripted stroll — if `isWalkable(PERGOLA)` is true and freeform rendering doesn't spuriously clip the sprite while the NPC is mid-tile, we're fine. Should hold but wants confirmation before Living Architecture leans on it. |
| 3 | **NPC pathing under PERGOLA_BEAM** | ⚠️ Untested | PERGOLA_BEAM is freeform with `hLower=0` — ground is clear. Same confirmation as #2 — need an NPC to cross a beam-tile column to verify sprite Y-clip and AI awareness cones aren't tripped by the overhead band. |
| 4 | **PERGOLA_BEAM × `tileFaceWallHeights`** | 🟡 Partial — need `tileFaceFreeform` for true one-sided pergola | `getWallHeight()` at `spatial-contract.js:885` already accepts face + grid and is called with both at `raycaster.js:1316` — so the **total column altitude** (the 2.0 in `tileWallHeights[70]`) honors per-face overrides today. BUT the freeform band split (`hUpper`/`hLower`) comes from `getTileFreeform(contract, tile)` which is tile-type-keyed only. A one-sided pergola (beam closed to the floor on one face, open canopy on the other) needs a new `getTileFreeformFace(contract, tile, face)` resolver threaded into raycaster.js:1254, 1347, 1419, 2920. ~20 lines. Not scoped yet. |
| 5 | **AI awareness cones through window tiles** | ⚠️ Untested | Enemies on floor N.N looking at the player through `WINDOW_COMMERCIAL` — current visibility check is wall-blocked (`isOpaque`). Window tiles are freeform-cavity, not opaque, so the cone *should* see through. Needs a sight-line test before Proxy Zone patrons lean on it. |
| 6 | **Billboard `wallFacing` flag for NPCs at pergola edges** | ⚠️ Deferred | Bench sprites benefit from `wallFacing` (Phase 6 of this doc). NPCs standing at a pergola column have the same issue — narrow when viewed from the side. Decide per-NPC or wire globally. |
| 7 | **Fog-profile inheritance through windows** | 🟡 Designed, not shipped | `fogProfile: 'parent'` window config exists in `PROXY_ZONE_DESIGN.md` §3 but the raycaster fog lookup is still CLAMP-for-interior. Blocks Proxy Zone long-range visibility. |

Items 2, 3, and 5 unblock by scheduling one scripted NPC walk — a
patrolling dialogue NPC crossing `(23,16) → (24,16) → (25,16)` (the
PERGOLA_BEAM ring + CITY_BONFIRE cell on floor 1) and looking at the
player through the inn window would verify all three in a single
session.

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

### Status (2026-04-14)  Shipped with curb tuning and top-plane cap

Phase 3 landed in three passes driven by in-browser playtests.

**Tile IDs.** `STOOP = 86`, `DECK = 87` (the planned 66/67 slots were
taken by the time we shipped  no behavioural change from the roadmap
spec). Both are `T.isWalkable` and participate in a new
`T.isStep` predicate used by the raycaster.

**Walkable hit test.** Walkable non-opaque tiles were being skipped
entirely by the DDA (only opaque tiles and `isDoor` tiles registered
as hits), so the roadmap's "thin lip" never produced a visible
silhouette  the floor-texture override rendered but no vertical column
drew. Added a third branch to the front-hit loop in `raycaster.js`:
`else if (TILES.isStep && TILES.isStep(tile)) { hit = true; ... }`.
Step tiles now produce a proper wall column with the contract's short
wallHeight + positive heightOffset.

**Curb sizing.** The roadmap's 0.08 × 0.10 values produced a stoop
that sat taller than the player's stride  reading as "stair" rather
than "sidewalk curb"  and required a head-raise on step-on that we
weren't implementing. Halved both values: `tileWallHeights[86/87] =
0.04`, `tileHeightOffsets[86/87] = 0.04`. The slab now spans world
0.02  0.06, matching the skirt-band thickness beneath it and reading
as a kerb.

**Textures.** Assigned `textures[86] = 'stone_rough'`,
`textures[87] = 'wood_plank'` on the exterior contract. The lip face
now samples a real tiled wall texture via `drawImage` instead of
rendering as a flat `stepColor` band.

**Top-plane cap.** The naive cap attempt (fillRect from horizon to
drawStart, sampled by `wallX`) produced vertical-stripe artifacts
because `wallX` is a 1D U along the hit face, not a parametrisation of
a horizontal surface. Replaced with a per-row floor projection mirrored
from `RaycasterFloor`: for each screen row between the horizon and
drawStart, `rowDist = trueHalfH * (baseWallH - 2*topElev) / rowFromCenter`
(same formula with eye-above-surface reduced by `topElev`), project
into world (floorX, floorY), footprint-test against `TILES.isStep`,
sample the tile's floor texture at `floorX*texW mod texW`. Distance-lit
with a slightly lifted falloff so horizontal tops read a touch brighter
than the ground.

**Placement.** 3-tile landing on Floor 1 Promenade at row 26, cols
2123, in front of the Gleaner's Home DOOR_FACADE. Documented in
`BLOCKOUT_REFRESH_PLAN.docx §1.2`.

### Known quirks (deferred)

These are tracked but not blockers for the stoop shipping:

1. **Lip face brick texture reads as micro-bricks.** `stone_rough` at
   0.04 world units tall samples only the top sliver of a 64×64
   texture; the repeating brick/joint pattern at that scale looks like
   a noise band. At curb thickness the face wants a single horizontal
   seam (stone) or a single horizontal board edge (wood), not a full
   brick wall. **Fix:** short-tile texture variants
   `stone_curb_lip` (one horizontal seam at 50% height, coarse stone
   banding otherwise) and `wood_plank_edge` (single board edge, grain
   parallel to seam). Register in `TextureAtlas` and point the contract
   at them for step tiles  no renderer change needed.

2. **Skirt band visible under the lip.** The Doom-rule step-fill
   (`drawEnd+1`  `flatBottom` range filled with `stepColor` at 70%
   brightness) still renders even though the cap + face read as a
   complete curb. At curb thickness the skirt reads as a faint dark
   band below the kerb and is actually a useful shadow cue  **keep
   it**, but expose it as a tool (see follow-up #4 below).

3. **Back-layer occlusion by SHRUB/FENCE.** When a STOOP sits behind a
   half-height opaque tile (SHRUB 0.5×, FENCE 0.4×), the stoop lip
   flattens out  its column never renders. Root cause: the back-layer
   collection loop's `_cTSolid` test only accepts opaque + door tiles
   (`TILES.isOpaque(_cT) || TILES.isDoor(_cT)`). Step tiles are
   neither, so they're skipped as back layers even though they would
   add visible pixels above the half-height foreground.
   **Fix:** add `TILES.isStep(_cT)` to `_cTSolid` in `raycaster.js`
   (~line 933). Same change should also guard the layer collector's
   `_fgIsFreeformSeeThrough`/`_maxTop` logic so the lip silhouette
   contributes correctly.

### Follow-ups that unlock a wider tile family

The curb work established the **thin-slab tile pattern** (walkable,
short wallHeight, positive heightOffset, top-plane cap via per-row
floor projection). The same pattern unlocks several short tiles we
want:

1. **Coffee table** (0.30× tall, +0.00 offset  or +0.15/+0.15 split
   for a floating look; see follow-up #4). Sits below the 0.4 TABLE,
   different silhouette.
2. **Footstool / ottoman** (0.25× tall).
3. **Floor cushion** (0.08× tall, sampled as fabric for the top cap).
4. **Sidewalk plinth** (0.15× tall) for display pedestals.
5. **Low planter wall** (0.20× tall, opaque  blocks movement,
   non-step, but shares the top-cap pattern via `isFloatingLid`).

Each is a tile-id + contract entry + one new texture, no renderer work
after the back-layer-gate fix below.

### Follow-up: legs / floating effect for existing short furnishings

TABLE (0.4×), BED (0.6×), CHEST (0.65×), BAR_COUNTER (0.8×) currently
read as solid blocks down to the floor because they have no
heightOffset  the wall face meets the ground without a gap. Repurpose
the step-fill skirt (already rendered for `heightOffset > 0` and
`heightOffset < 0`) to simulate table legs and bed frames:

- **Option A  heightOffset > 0 with reduced wallHeight.** Keep the
  top at the same world height, shrink wallHeight, put the difference
  into heightOffset. For TABLE: swap `(wallHeight 0.4, offset 0)` for
  `(wallHeight 0.08, offset 0.36)`. The skirt fills from the bottom
  of the wall (world 0.32) down to the ground (world 0) in `stepColor`
   that band can be sampled to read as table legs (darker, narrower
  visual) instead of the solid side we have today.
- **Option B  skirt-aware "legs" texture.** Instead of a flat
  `stepColor` fill, draw a procedural legs band: four vertical dark
  strips per tile at leg positions, transparent between them. Requires
  a new renderer branch in the skirt fill (`stepColor` replaced with a
  sampled "legs" texture when the contract flags the tile as
  `legsSkirt: true`).

Option A is zero-renderer-change, just contract tuning; Option B is
where the visual actually reads as "table on legs" rather than "block
with a darker bottom." Start with A for BED and TABLE to validate the
silhouette, then do B for CHEST and BAR_COUNTER which need distinct
leg geometry.

### Follow-up #4 shipped

Interior furniture tiles now have explicit height entries in
`SpatialContract.interior()`:

- **CHEST (7):** `wallHeight 0.60`, no offset — chest-lid on the floor,
  no legs (lids don't float).
- **BAR_COUNTER (26):** `wallHeight 0.80`, no offset — solid bar with
  kickplate, reads as counter-to-floor.
- **BED (27):** `wallHeight 0.45`, `heightOffset +0.15` — mattress
  floats above the floor; step-fill skirt paints the under-bed shadow
  (bed-frame leg zone 0–0.15 world units).
- **TABLE (28):** `wallHeight 0.35`, `heightOffset +0.30` — tabletop
  hovers; step-fill skirt paints the under-table shadow (leg zone
  0–0.30). The silhouette reads as "table on legs" at distance and as
  "floating slab with shadow underneath" up close.

The existing `heightOffset > 0` step-fill branch in `raycaster.js`
(~line 1846) samples `tex.height - 1` (bottom edge of the wall
texture) at 70% brightness, which naturally gives each tile a darker
band matching its material (dark-wood legs under TABLE, stone-grey
frame under BED).

Known follow-ups (still deferred):

- **Lip micro-brick.** The cap block at line 2062 samples via `wallX`
  (1D U along hit face), producing faint vertical stripes on the
  tabletop. Same fix as the stoop cap (per-row floor projection from
  RaycasterFloor math) would clean this up but isn't jam-critical.
- **True-leg geometry (Option B).** For distinct four-leg silhouettes
  (CHEST on ball feet, BAR_COUNTER on turned posts), the renderer
  would need a dedicated leg branch that drew N vertical strips of
  skirt rather than a solid band. Still deferred per roadmap.

### Follow-up summary (post-jam)

| # | Task | Effort | Unblocks |
|---|---|---|---|
| 1 | Short-tile texture variants (`stone_curb_lip`, `wood_plank_edge`, fabric for cushion, etc.) | ~60 lines TextureAtlas | Cleaner lip face on all thin slabs |
| 2 | Add `TILES.isStep` to back-layer `_cTSolid` gate | ~5 lines raycaster.js | Stoops behind shrubs/fences |
| 3 | Coffee table, ottoman, cushion, plinth tile defs | ~30 lines tiles.js + contract | Thin-slab interior furniture |
| 4 | ✅ Legs skirt for TABLE/BED (Option A tuning) | shipped — see note below | Furniture stops reading as blocks |
| 5 | Legs skirt renderer branch (Option B for CHEST) | ~40 lines raycaster.js | CHEST/BAR_COUNTER leg silhouettes |
| 6 | Window-vignette billboard bug (pre-existing, unrelated to curb work) | TBD  likely raycaster refactor regression | Windows render correctly at all ranges |

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

## Phase 5 — Interior Windows (Painted-On, Porthole Pattern) ⛔ SUPERSEDED

> **Superseded by the real window-tile family + EmojiMount.**
> The painted-on diorama approach is obsolete. We now ship true
> freeform-cavity window tiles (`WINDOW_SHOP`, `WINDOW_BAY`,
> `WINDOW_SLIT`, `WINDOW_ALCOVE`, `WINDOW_COMMERCIAL`,
> `WINDOW_ARROWSLIT`, `WINDOW_MURDERHOLE`) with EmojiMount cavity
> vignettes driving interior/exterior scene content. Face-aware tint
> (amber inside-looking-out lamp glow; cyan outside-looking-in
> daylight) is wired to DayCycle. For interior-floor windows that
> need a live view back at the exterior, see the proxy zone system
> (`PROXY_ZONE_DESIGN.md`).
>
> See `LIVING_WINDOWS_ROADMAP.md` phases 6 (EmojiMount port), 7
> (surface-mount tiles), 8 (blockout authoring), 9–11 (patrons,
> hours, polish), and 12 (exterior proxy zones).
>
> The original painted-on plan is preserved below **for historical
> reference only** — the porthole animation technique is still used
> by `PORTHOLE` tiles in the sealab biome, but no new window tiles
> will be built on this pattern.

---

## Phase 5 (Historical) — Interior Windows (Painted-On, Porthole Pattern)

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

 Phase 5: Painted-On Windows  ⛔ SUPERSEDED
    → Real window-tile family + EmojiMount cavity vignettes
    → See LIVING_WINDOWS_ROADMAP.md phases 6–12
    → Proxy zones: PROXY_ZONE_DESIGN.md

 Phase 6: Billboard Props 
    wallFacing flag (~3 lines in raycaster)
    5 prop sprite definitions
    Placement rules for templates + proc-gen

 Phase 9: Circular Tree Trunks + Quad Pillars  ✔ SHIPPED 2026-04-14
    ray-vs-circle DDA + back-layer path in raycaster.js
    tileShapes protocol in SpatialContract (getTileShape)
    'circle' applied to: TREE, CANOPY, CANOPY_MOSS, PILLAR
    'circle4' (new): PILLAR_QUAD — 2×2 sub-pillar cluster
    Square-silhouette siblings: TREE_SQ, CANOPY_MOSS_SQ (dungeon)
    Future: per-tile radius override, shape-aware collision

   ⛔ superseded — no further work ───────────────────

 Phase 7: True Window Transparency → RAYCAST_FREEFORM_UPGRADE_ROADMAP.md
 Phase 8: Arched Openings → RAYCAST_FREEFORM_UPGRADE_ROADMAP.md
```

---

## Phase 9 — Circular Tree Trunks + Quad Pillars ✅ SHIPPED (2026-04-14)

**Status:** Shipped via the ray-vs-circle path in `engine/raycaster.js`
+ `SpatialContract.tileShapes` routing. The chamfered-octagon stepping-stone
described below is retained for historical reference but will not be built.

### What shipped

**Shape protocol** — `SpatialContract.tileShapes` is a per-contract map
from tile-type → shape kind (`'circle'`, `'circle4'`, or absent = square).
Accessed at render time via `SpatialContract.getTileShape(contract, tile)`.
Plumbed into both the primary DDA hit branch and the N-layer back-layer
collector so circle tiles behave identically whether in front of or
behind other geometry.

**`'circle'` (ray-vs-inscribed-circle)** — `_CIRCLE_R = 0.45` (in raycaster.js).
On hit: override perpDist to the camera-forward projection of the hit
point (`(hx-px)*pdCos + (hy-py)*pdSin`), set `wallX` via
`(atan2(dy,dx) + π) / (2π)` so the texture wraps around the circumference.
On miss: DDA walks past the tile so the player can peek through the
~0.05 corner gaps between adjacent round tiles. Applied to:

| Tile | Contract | Use |
|---|---|---|
| `TREE` (21) | exterior | Round tree trunks |
| `CANOPY` (65) | exterior | Round leaf pads (floating disc above trunk) |
| `CANOPY_MOSS` (66) | exterior | Round hanging-moss clumps |
| `PILLAR` (10) | exterior + interior | Round architectural columns / lamp-post shafts |

**`'circle4'` (2×2 sub-pillar cluster)** — `_CIRCLE4_R = 0.2`,
`_CIRCLE4_OFF = 0.25`. Four sub-circles at (±0.25, ±0.25) from tile
centre, radius 0.2 each. Ray solves all four, keeps the nearest positive-t
hit; the winning sub-centre populates the same `_circleCX/CY/HX/HY`
channels used by single-circle so perpDist / wallX work unchanged.
Diagonal gaps between sub-pillars are sight-permeable (tile stays
non-walkable via `isOpaque`). Applied to:

| Tile | Contract | Use |
|---|---|---|
| `PILLAR_QUAD` (88) | exterior + interior | Quad-colonnade accents, shrine bases, see-through chokepoints |

**Square-silhouette sibling tiles** — for places where a square footprint
is the right read:

| Tile | Purpose |
|---|---|
| `TREE_SQ` (85) | Dense treelines / grove-fill. Ring perimeter with round TREE, fill interior with TREE_SQ for a soft silhouette around a solid mass. |
| `CANOPY_MOSS_SQ` (84) | Dungeon ceiling-beam moss. Wired into `nestedDungeon()` base at offset 0.85, 0.25-thick slab tucked against a 1.2-tall dungeon wall. |

### What's left (future work, not blocking)

- **Per-tile radius override** — `tileShapes` values are strings today.
  Promoting to `{ kind: 'circle', r: 0.4 }` objects would let individual
  biomes carry different trunk thicknesses (thin sapling / fat oak) and
  let PILLAR_QUAD tune `(r, off)` independently from TREE. ~15 lines.
- **Circle collision** — the player's collision AABB still tests the
  full tile boundary, so you can't physically walk between the diagonal
  gaps of a PILLAR_QUAD. Matches the DOOR_FACADE precedent. Upgrade
  path: per-shape collision test in `MovementController` or at the
  grid-gen level. Not scoped.
- **Shape-aware wall decor** — billboard sprites mounted on circle
  tiles (torches on a round column) still position against the square
  tile boundary. Visible on close approach. Low priority.

### Historical — chamfered octagon (not shipping)

The chamfered-8-gon path below was the original Phase 9 plan. Kept for
contributors wondering why there's a `WALL_DIAG` reference in
`raycast.js-master` — we studied it, and the ray-circle path was
cheaper per column (one sqrt + one atan2 vs. a line-segment intersection
and a pointVsRect check per corner).

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
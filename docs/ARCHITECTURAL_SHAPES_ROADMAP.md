# Architectural Shapes Roadmap

> Adding peaked roofs, eaves, stoops, wall-mounted fixtures, and windows
> to a Wolfenstein-style DDA raycaster  without leaving Canvas 2D.

**Prerequisite reads:** `CLAUDE.md` (module conventions), `TEXTURE_ROADMAP.md`
(texture system + height offsets), `SpatialContract` (rendering rules),
`Raycaster` (wall/floor/sprite pipeline).

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

## Phase 1  Peaked Roofs (Data-Only, No Renderer Changes)

**Difficulty:** Easy  pure tile data + new textures.
**Estimated size:** ~60 lines (tile defs + texture generators + contract entries).

### Concept

A peaked roof is a row of tiles where the height offset graduates from
low at the eaves to high at the ridge. Combined with a short wall height
(the roof is a thin strip, not a full wall), the player reads a triangular
roofline against the sky.

### New tile types

```
ROOF_EAVE_L   = 60   // Left eave — lowest roof point
ROOF_SLOPE_L  = 61   // Left slope — intermediate
ROOF_PEAK     = 62   // Ridge — highest point
ROOF_SLOPE_R  = 63   // Right slope — intermediate
ROOF_EAVE_R   = 64   // Right eave — lowest roof point
```
> **Note (Apr 9 2026):** IDs 40-48 are occupied by living infrastructure,
> 49-59 reserved for dungeon/economy tiles. Architectural shapes start at 60.

All are solid (block movement, block LOS) and non-interactable.

### Height profile

| Tile | tileWallHeights | tileHeightOffsets | Visual effect |
|---|---|---|---|
| ROOF_EAVE_L | 0.20 | +0.05 | Thin strip, barely raised  eave overhang |
| ROOF_SLOPE_L | 0.25 | +0.15 | Slightly taller, higher  ascending slope |
| ROOF_PEAK | 0.30 | +0.30 | Thickest strip, highest  ridge beam |
| ROOF_SLOPE_R | 0.25 | +0.15 | Mirror of SLOPE_L |
| ROOF_EAVE_R | 0.20 | +0.05 | Mirror of EAVE_L |

The step fill below each roof tile reads as the underside shadow of the
overhang. Use a dark `stepColor` or sample from a dark texture edge.

### New textures

| Texture ID | Pattern | Notes |
|---|---|---|
| `roof_shingle` | Overlapping rows of angled shingles, warm terracotta | Main roof surface |
| `roof_slate` | Flat rectangular slate tiles, cool grey | Dungeon/institutional variant |
| `roof_thatch` | Irregular straw bundles, golden | Tavern/rustic variant |

Each is 6464 procedural, tiling horizontally. The texture wraps across
adjacent roof tiles so the shingle pattern reads continuously.

### Floor template usage

In a floor template, a building with a peaked roof facing the player might
look like (top-down, player approaches from below):

```
  W  W  W  W  W  W  W        back wall
  W  .  .  .  .  .  W        interior
  W  .  .  .  .  .  W
  W  .  .  D  .  .  W        D = door
  RL RS RP RP RP RS RR       roof tiles (player sees this row as roofline)
```

The player sees the roof row as a peaked silhouette above the door. The
building walls behind rise to full height. The N-layer system reveals the
taller back wall through the gaps above the short roof tiles.

### Eave drip line (bonus)

The step-fill gap below ROOF_EAVE tiles can use a distinct color  a wet
slate or moss green  to imply a drip line where rain runs off the eave.
This is pure `stepColor` override, zero rendering cost.

### What this does NOT solve

The roof is only visible from one direction (the row facing the player).
From the side, the player sees individual roof tiles at different heights,
not a continuous slope. This is a fundamental raycaster limitation  walls
are axis-aligned, so a diagonal roofline can only be approximated as a
staircase of discrete tiles. At the 6464 texture scale and the chunky
pixel-art aesthetic, this reads acceptably as a stepped gable.

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

## Phase 7  True Window Transparency (Multi-Segment Columns)

**Difficulty:** Hard  architectural change to raycaster inner loop.
**Estimated effort:** 35 days focused work + performance validation.
**Estimated size:** ~300 lines (raycaster refactor + texture alpha system).

### Why this is hard

The current raycaster resolves each column to a single wall hit:

```
DDA loop  first opaque tile hit  compute geometry  draw one strip
```

True transparency requires:

```
DDA loop  first tile hit  check if texture has transparent band 
  if yes: draw upper wall segment, skip transparent band, draw lower
  wall segment, cast secondary ray through gap for background content 
  if no: draw as before
```

This multiplies the per-column work. Every column potentially needs 23
wall segments instead of 1. The transparent band must be defined per-texture
(not per-tile), and the background content behind the gap must be resolved
(sky? interior wall color? secondary raycast?).

### Proposed architecture

#### Texture alpha masks

Each texture optionally carries a **row-range alpha mask**: an array of
booleans per row indicating which rows are transparent. For a window
texture, rows 1244 might be transparent (the glass area), while 011
(lintel) and 4563 (sill + wall below) are opaque.

```javascript
// In TextureAtlas, per texture:
texture.alphaMask = new Uint8Array(64);  // 0 = opaque, 1 = transparent
// Window: rows 12-44 are transparent
for (var r = 12; r <= 44; r++) texture.alphaMask[r] = 1;
```

#### Multi-segment column renderer

Replace the single `drawImage` call with a segment loop:

```javascript
// Pseudo-code for one column:
var texRowTop = mapScreenToTexRow(drawStart);
var texRowBot = mapScreenToTexRow(drawEnd);
var segments = splitByAlpha(texture.alphaMask, texRowTop, texRowBot);

for (var s = 0; s < segments.length; s++) {
  if (segments[s].opaque) {
    // Draw wall texture strip for this row range
    ctx.drawImage(tex.canvas, texX, segments[s].srcY, 1, segments[s].srcH,
                  col, segments[s].dstY, 1, segments[s].dstH);
  } else {
    // Transparent band  render background content
    renderWindowBackground(col, segments[s].dstY, segments[s].dstH, ...);
  }
}
```

#### Background content behind transparent band

Three options, in order of complexity:

1. **Flat color fill:** Fill transparent band with a solid color
   (sky blue for exterior windows, dark amber for interior glow).
   Cheapest, reads OK at distance. ~5 lines.

2. **Sky/ceiling gradient sample:** Sample the skybox or ceiling gradient
   at the transparent band's screen position. Integrates with existing
   sky rendering. ~15 lines.

3. **Secondary raycast:** Continue the DDA through the transparent tile
   and render whatever is behind it (interior wall, deeper building, sky).
   This is the "correct" solution but doubles the ray cost for every
   transparent column. ~80 lines + performance risk.

**Recommendation:** Start with option 2 (sky gradient) for exterior
windows. Option 3 only if the gameplay requires seeing actual rooms
through windows.

### Performance concerns

At 480 columns/frame, if 20% of columns hit a transparent texture (a
building facade fills ~96 columns), the segment loop adds ~96 extra
`drawImage` calls per frame + 96 background fills. Total overhead: ~5%
of frame budget. Acceptable.

The danger is option 3 (secondary raycast): 96 additional DDA traversals
per frame could push the frame time past 16ms on webOS TV hardware.
Profile before committing.

### Z-buffer implications

The Z-buffer stores one depth per column. With multi-segment rendering,
sprites behind a transparent band should be visible through the gap but
occluded by the opaque segments. This requires either:

- Per-pixel Z-buffer (expensive  480  screenHeight entries)
- Per-segment Z-buffer update (set zBuffer to wall distance for opaque
  segments, set to infinity/far for transparent segments so sprites show
  through)

The per-segment approach is simpler and sufficient: after rendering a
transparent column, temporarily set `_zBuffer[col] = Infinity` so sprites
behind the window are visible, then restore it after the sprite pass.
This has edge cases (sprite partially behind opaque wall, partially
behind window) but is acceptable for the visual quality target.

### Prerequisite

Phase 5 (painted-on windows) should ship first. The texture infrastructure
(window frame + scene compositing) is reused here  the only change is
that the scene region becomes transparent instead of painted.

---

## Phase 8  Arched Doorways & Shaped Openings (Hard, Future)

**Difficulty:** Very hard  per-pixel alpha in wall columns.
**Estimated effort:** 57 days.

### Why this is harder than Phase 7

Phase 7 uses row-range transparency (a horizontal band). An arched doorway
requires **per-pixel transparency**: the top of the door opening is curved,
so each column has a different transparent row range. The arch shape must
be encoded per-texture-column, not per-texture-row.

### Proposed approach

Replace the row-range alpha mask with a **per-column alpha range**:

```javascript
// Per texture column, store the transparent row range:
texture.alphaRanges = new Array(64);  // one per texture column
// Arch: wider opening at bottom, narrowing at top
for (var c = 0; c < 64; c++) {
  var archTop = computeArchCurve(c);  // parabola or semicircle
  texture.alphaRanges[c] = { top: archTop, bot: 52 };
}
```

The multi-segment renderer from Phase 7 reads the per-column range instead
of a uniform row range. Each column gets its own segment split, creating
the arch shape.

### Performance

Same as Phase 7 but with per-column alpha lookup instead of shared row
range. Marginal additional cost (~1 array access per column). The real
cost is implementation complexity and testing.

### Use cases

- Arched doorways on cathedral/guild buildings
- Rounded window tops (Gothic architecture)
- Irregular openings (cave mouths, broken walls)

---

## Implementation Priority

```
POST-JAM POLISH

 Phase 1: Peaked Roofs  (highest impact, zero renderer risk)
    5 new tile types + height profiles
    3 roof textures (shingle, slate, thatch)
    Template placement for Promenade + Lantern Row buildings

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
    Prerequisite for Phase 7

 Phase 6: Billboard Props 
    wallFacing flag (~3 lines in raycaster)
    5 prop sprite definitions
    Placement rules for templates + proc-gen

   difficulty cliff 

 Phase 7: True Window Transparency  (high payoff, high risk)
    Texture alpha masks
    Multi-segment column renderer
    Background content behind transparent band
    Z-buffer segment handling
    Performance validation on webOS TV

 Phase 8: Arched Openings  (niche, very expensive)
     Per-column alpha ranges
     Arch curve computation
     Only if Phase 7 is stable and the art direction demands it
```

---

## Cross-References

### TEXTURE_ROADMAP.md

- **Layer 2 (Wall Decor)** is now **SHIPPED** with 13 décor sprites and
  auto-placement in FloorManager. Phase 4 can use either the wall décor
  system for per-face fixture placement OR composite textures.
- **Layer 3 (Emitter Lights)** would enhance Phase 5 windows: a lit
  window texture could register a warm-colored emitter at its wall
  position, casting glow onto nearby floor tiles.

### Biome Plan

- Promenade (floor "1") and Lantern Row (floor "2") are the primary
  beneficiaries of Phases 15. Their building facades face the player
  along street corridors  peaked roofs and lit windows define the
  streetscape.
- Dungeon floors (depth 3+) primarily benefit from Phase 6 (props) and
  Phase 7 (windows into adjacent chambers).

### SpatialContract

All new tile types in Phases 13 must be registered in all three contract
constructors (exterior, interior, nestedDungeon) with appropriate height
profiles. Exterior gets the full range; interior and dungeon may use
subsets. Biome overrides can remap textures per-district.

---

## Tile ID Budget (Updated Apr 9 2026)

Canonical tile allocation tracked in
`TEXTURE_ROADMAP.md` → `Tile Asset Matrix (Canonical 0-59)`.

Current allocation:
- `0-48`: Runtime tile constants (all textures shipped, 0 missing keys).
- `49-59`: Reserved for planned dungeon creature verb tiles (49-54) and
  economy tiles (55-59) per LIVING_INFRASTRUCTURE_BLOCKOUT.md.
- `60+`: **Architectural shapes** — roof (60-64), awning (65), stoop (66),
  deck (67), wall variants (68+), window tiles (70+).

All phase descriptions in this doc have been updated to use 60+ IDs.

### Recommended ID Strategy

1. Use `60+` for any new architectural tile constants.
2. Prefer texture variants and per-cell texture overrides before consuming new IDs.
3. Only mint new IDs when geometry/collision behavior differs (not just visual variation).

### Architectural Candidates (Reserved Range)

| Suggested ID | Name | Phase | Walkable | Opaque |
|---|---|---|---|---|
| 60 | ROOF_EAVE_L | 1 | No | Yes |
| 61 | ROOF_SLOPE_L | 1 | No | Yes |
| 62 | ROOF_PEAK | 1 | No | Yes |
| 63 | ROOF_SLOPE_R | 1 | No | Yes |
| 64 | ROOF_EAVE_R | 1 | No | Yes |
| 65 | AWNING | 2 | No | Yes |
| 66 | STOOP | 3 | Yes | No |
| 67 | DECK | 3 | Yes | No |
| 68 | WALL_PLANTER | 4 | No | Yes |
| 69 | WALL_HVAC | 4 | No | Yes |
| 70 | WALL_WINDOW_WARM | 5 | No | Yes |

Additional window variants (`WALL_WINDOW_DARK`, `WALL_WINDOW_SKY`, etc.) should
continue from `71+`.

### Inclusion In Architectural Scope

From the canonical matrix, these existing IDs should be referenced directly in
architectural phases (do not duplicate IDs):
- `35` FENCE (railings, deck edges)
- `37` MAILBOX and `38` DUMP_TRUCK (billboard+short-wall mixed geometry patterns)
- `40-48` living-infrastructure fixtures (short/full architecture props)
- `58-59` economy heavy fixtures (full-height industrial forms)

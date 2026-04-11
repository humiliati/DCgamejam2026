# Raycast Freeform Upgrade Roadmap
## Sandwich walls, hearth cavities, pergola-moated bonfires, arches, portholes

> Adapting techniques from the `raycast.js-master` reference engine to
> Dungeon Gleaner's N-layer DDA raycaster. This roadmap defines the
> phased path from our current single-segment column model to a
> multi-segment / freeform block column model capable of rendering
> true cutouts (hearth cavities, arched doorways, windows, portholes).

**Prerequisite reads:**
- `CLAUDE.md` (module conventions)
- `NLAYER_RAYCASTER_ROADMAP.md` (current N-layer compositor)
- `ARCHITECTURAL_SHAPES_ROADMAP.md` (Phase 7/8 stubs this roadmap replaces)
- `TEXTURE_ROADMAP.md` (texture atlas, alpha channel readiness)
- Reference source: `raycast.js-master/src/engine/raycast.js`
  (`col_freeformTile` at line 2397, `getFreeformTileCollnData` and the
  DDA dispatch around line 1891)

**Status:** Phases 0, 1, 2 (2a CITY_BONFIRE, 2b PERGOLA_BEAM,
2c DUMP_TRUCK), and **4 (WINDOW_TAVERN)** **SHIPPED** as of 2026-04-10.
Phase 3 (alpha-mask freeform — arches + portholes) is the only
unshipped core phase; Phase 5 (secondary raycast + polish) remains a
stretch goal. Authored 2026-04-10 in response to the hearth
sandwich-rendering limitation (the fire cavity previously read as
opaque because it was painted into a step-fill lip, not a true
transparent band in the wall column).

### Shipped capabilities

- `TILES.isFreeform(tile)` predicate (`engine/tiles.js`) — opt-in flag
  for tiles that should render via the two-segment path.
- `SpatialContract.getTileFreeform(contract, tile)` accessor +
  `tileFreeform` table per contract (`engine/spatial-contract.js`).
  Interior contract registers HEARTH (29) at `{hUpper: 0.80, hLower:
  0.40}`; the sum must stay below the tile's `wallHeightMult` or the
  renderer degrades to a solid two-band fallback.
- Foreground two-segment render via `_renderFreeformForeground`
  (`engine/raycaster.js ~line 1291`): mantle band + transparent cavity
  + base band, fog and side shading baked per band.
- Back-layer two-segment render in `_renderBackLayer` (~line 2000):
  back-hit HEARTHs and injected back-face HEARTHs both render
  freeform so the cavity stays transparent from either side.
- `_freeformEnabled` kill switch + `?freeform=0|1` URL override.
- Debug trace (`?debug=1` + `P`) dumps per-column layer data including
  freeform flag state.
- HEARTH's legacy `heightOffset` displacement is suppressed when the
  freeform config is active (only the segment split drives geometry).
- `_needBackFace` path wired through freeform tiles so the opposing
  brick band renders behind a HEARTH the player walks past.
- **Shared gap-filler registry** (`engine/raycaster.js`,
  `registerFreeformGapFiller(key, fn)` on the public API). Freeform
  contract entries carry an optional `fillGap: 'key'` slot; the
  raycaster's cavity path dispatches through the registry instead of
  branching on tile type. Built-in fillers: `_default` (dim placeholder,
  makes unstyled cavities visible during dev), `_transparent` (no-op,
  used by PERGOLA_BEAM for literal see-through canopies),
  `hearth_fire` (warm amber glow over back layers),
  `city_bonfire_fire` (animated per-column flame gradient), and
  `truck_spool_cavity` (subtle cool-blue tint over back layers for
  the DUMP_TRUCK hose slot). Future tiles (WELL, ARCH_DOORWAY,
  PORTHOLE) register their own fillers from Layer-3 modules without
  editing raycaster.js. See §3.5.1.
- **Freeform tiles carry side-face wallDecor** — as of Phase 2c
  (DUMP_TRUCK) the freeform foreground render path calls
  `_renderWallDecor` on the hit column, so `decor_*` sprites
  anchored to freeform tile faces render correctly. Previously the
  call only happened on the non-freeform else branch, which meant
  any freeform tile with wall-mounted hardware (wheels, grates,
  signs) would silently drop its decor.

### What Phase 1 intentionally did NOT ship

- The alpha-mask pipeline (reserved for Phase 3 — arches + portholes).
- Gap content Tier B sprite billboarding is not yet wired to HEARTH.
  Today the cavity shows through to whatever back geometry the DDA
  collected, which is correct compositing but means the fire itself
  is still painted via the existing `decor_hearth_fire` cavity draw
  from inside `_renderFreeformForeground`, not a true billboard.
  Revisit in Phase 2 or earlier if needed.
- Secondary raycast / Tier C gap content (reserved for Phase 5).

---

## 1. Why we need this

### The wall we keep running into

Today the raycaster resolves each screen column to a single textured
wall strip plus a vertical offset. The "sandwich" look for HEARTH is
actually a step-fill lip repainted with dark cavity + fire sprite +
mantle band — a clever trick, but the column is still fully opaque. The
player cannot see the hearth's warm light spilling past the brickwork,
cannot see a dragon silhouette through a fire cavity, cannot see the
far wall of a room through an arched doorway.

The same limitation blocks five features on the biome plan:

1. **Hearth with real cavity** — brick panes above, fire + dragon emoji
   in the middle, brick hearth base below. Needs a transparent band
   inside a wall column.
2. **Civilized bonfire for Lantern Row / plaza floors** — ~3 tile tall
   brick column with a pergola moat at 2.95 tiles. The vertical column
   needs a true tall freeform tile (currently hacked via FLOOR→wall
   offset math).
3. **Arched doorways** on cathedrals, dispatcher's office, foyer —
   per-column curved transparent band.
4. **Windows** with an interior scene visible through them — row-range
   transparent band.
5. **Portholes** that show animated content behind — a mask technique
   we already have in TextureAtlas but never plumbed into an opening.

### The reference already solved this

`raycast.js-master` ships "free-form blocks" as a first-class tile
category. Each freeform tile contributes a collision record that
carries **`hUpper[0/1]`** (front/rear upper wall portion world-height)
and **`hLower[0/1]`** (front/rear lower wall portion world-height).
The renderer draws the upper portion from the ceiling down, the lower
portion from the floor up, and leaves a gap in between. The gap fills
with ceiling visplane + floor visplane (or whatever lies behind the
tile in our compositor), and the DDA continues past the freeform hit
so non-solid geometry stacks correctly in a per-column depth buffer.

That is exactly the sandwich we want. It is also the arch, the window,
and the porthole — they all reduce to "upper band + gap + lower band"
once the gap shape is driven by a texture alpha mask.

---

## 2. What our engine already has

Dungeon Gleaner's N-layer compositor is much closer to the reference
than it looks. The gap analysis:

| Capability | Reference | Dungeon Gleaner today |
|---|---|---|
| DDA continues past partial hits | Yes, `depthBuffer.push(collnData)` and the tracer keeps advancing | Partial — N-layer collects up to 6 "layer" hits but each layer is still a single full-height strip |
| Back-to-front column render | Yes, iterates `depthBuffer` in reverse | Yes, `_renderBackLayer()` paints layer `_lc-1 .. 0` |
| Per-tile vertical offset | World-space `hUpper` / `hLower` | Step-fill `heightOffset` (+ raised, − sunken) scaled per column |
| Per-tile wall height multiplier | Implicit in `hUpper + hLower` | `tileWallHeights[tile]` on contract |
| Per-texture alpha sampling | Yes, `tAlpha = texBitmap[offTexel + 3]` in `col_floor` / `col_ceiling` | No — wall blits use `ctx.drawImage` which does its own alpha but nothing reads the channel to steer geometry |
| Freeform tile dispatch | `TYPE_TILES.FREEFORM` branch in DDA | Not implemented |
| Multi-segment wall column | `col_freeformTile` draws upper + lower as two calls | Not implemented — single `drawImage` per column per layer |
| Column occlusion table | `{ top, bottom }` passed to each draw | `_zBuffer[col]` only (distance, not screen-row range) |

**Takeaways:**
- Our N-layer stack is the structural equivalent of the reference's
  `depthBuffer`. We already continue-past for partial hits (short walls,
  canopy tiles, crenel tiles); the DDA logic is in place.
- What we lack is the **two-segment draw per layer**. Today each layer
  record resolves to one `drawImage`. We need each layer record to
  optionally resolve to two strips with a gap.
- We lack a **per-column occlusion table** (`{top, bot}` on the
  raycaster's own state). The reference clips with explicit row bounds
  per draw call. Our back-to-front compositor leans on painter's
  algorithm and `_maxTop` instead. The gap in a freeform tile is what
  forces the occlusion table to become explicit — painter's alone is
  not enough because a strip drawn over the gap must not overwrite the
  far geometry that the gap is exposing.

---

## 3. Design: Two-Segment Wall Layers

### 3.1. Tile data model

New per-tile config slots on SpatialContract (opt-in; absence means
"single-segment like today"):

```javascript
// spatial-contract.js
tileFreeform: {
  [TILES.HEARTH]: {
    hUpper: 0.65,   // world-height of upper brick band, top-anchored
    hLower: 0.00,   // world-height of lower brick base, floor-anchored
    gapTexAlpha: false,  // true → gap shape driven by texture alpha
  },
  [TILES.PERGOLA_BEAM]: {
    hUpper: 0.12,   // thin cross-beam
    hLower: 0.00,
  },
  [TILES.CIVILIZED_BONFIRE]: {
    hUpper: 0.00,   // no upper cap
    hLower: 3.00,   // 3-tile tall brick column (stovepipe)
  },
  [TILES.ARCH_DOORWAY]: {
    hUpper: 0.40,
    hLower: 0.00,
    gapTexAlpha: true,  // curved top driven by texture alpha mask
  },
  [TILES.WINDOW_TAVERN]: {
    hUpper: 0.85,
    hLower: 0.40,
  },
},
```

Semantics:
- `hUpper` measures from the ceiling plane **down** toward the floor.
  `0.65` means "the upper brick band occupies the topmost 0.65 units
  of the world-height column."
- `hLower` measures from the floor plane **up** toward the ceiling.
- `hUpper + hLower < wallHeight` means there is a gap. `hUpper +
  hLower >= wallHeight` means the block is solid (degenerate case —
  equivalent to a normal wall).
- `gapTexAlpha: true` overrides the flat row-range split with a
  per-column sampled alpha mask from the tile's wall texture. This
  becomes the path for arches and irregular openings.

Tile-type predicate:

```javascript
TILES.isFreeform = function (tile) {
  return tile === TILES.HEARTH ||
         tile === TILES.CIVILIZED_BONFIRE ||
         tile === TILES.ARCH_DOORWAY ||
         tile === TILES.WINDOW_TAVERN ||
         tile === TILES.PERGOLA_BEAM;
};
```

### 3.2. Per-layer record extension

The layer buffer currently records `{ mx, my, sd, tile }`. Extend it to
optionally carry the freeform split on a pre-resolved basis:

```javascript
_layerBuf[i] = {
  mx, my, sd, tile,
  // Single-segment (legacy) layers leave these null.
  fUpperWorld: null,  // upper brick band world-height
  fLowerWorld: null,  // lower brick base world-height
  fGapAlpha:   null,  // optional per-column alpha mask texture ref
};
```

When DDA hits a freeform tile, the raycaster looks up
`contract.tileFreeform[tile]` and stores the resolved values on the
layer record. When the compositor later renders that layer, a helper
decides between single-segment and two-segment draw paths.

### 3.3. Two-segment draw math

Given a layer's `lineHeight`, `drawStart`, `drawEnd` (the would-be
single-segment rect) and world-height `wallHeight`, the two portions
project to screen rows like this:

```javascript
function _projectFreeformSegments(layer, lineHeight, drawStart, drawEnd, wallHeight) {
  var fU = layer.fUpperWorld;  // world units, top-down
  var fL = layer.fLowerWorld;  // world units, bottom-up
  // Fractional heights within the tile's full world-height
  var uFrac = fU / wallHeight;
  var lFrac = fL / wallHeight;
  // Screen-space rects
  var upperTop    = drawStart;
  var upperBot    = drawStart + Math.floor(lineHeight * uFrac);
  var lowerBot    = drawEnd;
  var lowerTop    = drawEnd   - Math.floor(lineHeight * lFrac);
  // Gap: [upperBot+1 .. lowerTop-1]
  return { upperTop, upperBot, lowerTop, lowerBot };
}
```

Each segment is then blitted from the wall texture with its own UV
range:

```javascript
// Upper portion: source V is 0..uFrac of texture height
var srcYU = 0;
var srcHU = Math.floor(tex.height * uFrac);
ctx.drawImage(tex.canvas, texX, srcYU, 1, srcHU,
              col, upperTop, 1, upperBot - upperTop);

// Lower portion: source V is (1-lFrac)..1 of texture height
var srcYL = Math.floor(tex.height * (1 - lFrac));
var srcHL = tex.height - srcYL;
ctx.drawImage(tex.canvas, texX, srcYL, 1, srcHL,
              col, lowerTop, 1, lowerBot - lowerTop);
```

The gap rows are simply not written — whatever the compositor already
painted into that column (floor pre-pass + any back layers already
rendered) shows through. This works because of painter's algorithm:
freeform layers are drawn in back-to-front order alongside the rest,
and any layer that needs to appear **behind** the freeform gap has
already been rasterized underneath by the time the freeform draw runs.

### 3.4. Occlusion table

Single-segment painter's algorithm is insufficient for freeform layers.
If a farther back-layer wall peeks through the gap, we must not let the
**nearer** freeform tile's lower-segment `drawImage` overpaint the far
wall in the gap rows. Today we hard-rely on draw order; with freeform
that is no longer enough because a single logical "layer" occupies two
disjoint row ranges plus a gap.

Fix: add a per-column dirty-range tracker used by the freeform draw
path only:

```javascript
var _colDirty = new Int16Array(w * 2);  // [topDirty, botDirty] per col
// Before each column:
_colDirty[col * 2]     = 0;
_colDirty[col * 2 + 1] = h;
```

When drawing a back layer through the freeform gap, clip its rect
against `_colDirty[col*2 .. col*2+1]` in addition to the usual
`drawStart/drawEnd`. After drawing the freeform upper segment, mark
`_colDirty[col*2] = upperBot + 1`. After drawing the lower segment,
mark `_colDirty[col*2 + 1] = lowerTop`. Subsequent back layers (drawn
later, farther from viewer) must respect these dirty bounds when their
row range overlaps the gap.

This is a small extension to `_renderBackLayer()` — ~40 lines — and
only the freeform path pays the cost.

### 3.5. Gap content — three tiers

Tier A — **empty gap** (the simplest shipping path). The gap just
shows whatever the N-layer stack put behind the freeform tile. Good
enough for civilized bonfire + pergola moat, where the gap reveals
adjacent floor and the flame emoji sprite is a billboard.

Tier B — **billboard filler**. A sprite anchored to the freeform tile's
cell renders in the gap via the existing sprite pipeline. Good enough
for HEARTH (fire + dragon emoji), PORTHOLE (ocean animation billboard),
WINDOW with a painted interior scene.

Tier C — **secondary raycast**. Continue the DDA through the freeform
cell and render the next solid hit's texture column into the gap rows.
Deferred to a later phase — unnecessary for any jam+1 feature and
doubles per-column work.

We commit to Tier A+B for all shipping phases below. Tier C is listed
for completeness only.

### 3.5.1. Shared gap-filler registry (Phase 1.5 — SHIPPED)

The cavity path in `_renderFreeformForeground` used to hard-code a
`if (hitTile === HEARTH) { … warm glow … }` branch. That did not
scale: WELL (water surface), DUMP_TRUCK (trash fill), CIVILIZED_BONFIRE
(fire column), and future interactive props all need their own cavity
pass, and none of them should have to touch raycaster.js.

Phase 1.5 extracted the cavity branch into a **string-keyed registry**:

```javascript
// raycaster.js (module-private)
var _gapFillers = {
  _default: function (ctx, col, gapStart, gapH, info) { … dim wash … },
  hearth_fire: function (ctx, col, gapStart, gapH, info) { … glow … }
};

function registerFreeformGapFiller(key, fn) { _gapFillers[key] = fn; }

// Exposed on the public API:
return { …, registerFreeformGapFiller: registerFreeformGapFiller };
```

Contracts reference fillers by **string key**, not by function reference,
so Layer-1 `spatial-contract.js` never needs to reach into Layer-2
`raycaster.js`:

```javascript
// spatial-contract.js interior() tileFreeform
29: Object.freeze({ hUpper: 0.80, hLower: 0.40, fillGap: 'hearth_fire' })
```

Filler signature: `function (ctx, col, gapStart, gapH, info)` where
`info` is a shared zero-alloc `_gapInfo` object carrying the full
per-column context the cavity pass had inline: `brightness`,
`fogFactor`, `fogColor`, `tintStr/Idx/RGB`, `mapX/Y`, `side`,
`perpDist`, `hitTile`, `wallX`, `wallTop`, `lineH`, `halfH`, `screenH`,
`wallHeightMult`, and `gapWorldH` (cavity extent in world units — handy
for reflection offset on a water surface). Fillers **must** treat
`info` as read-only and **must not** cache references past the call —
the fields change as the renderer sweeps the column buffer.

#### Registering a new filler from a Layer-3 module

Any Layer-3 module that owns an interactive cavity tile (well, dump
truck, civilized bonfire, mailbox, soup kitchen, etc.) registers its
filler during init:

```javascript
// engine/well-sprites.js (Layer 3)
var WellSprites = (function () {
  'use strict';

  function init() {
    if (typeof Raycaster === 'undefined') return;
    Raycaster.registerFreeformGapFiller('well_water', function (ctx, col, gapStart, gapH, info) {
      // Dark water base — slight blue tint, fog-blended.
      ctx.fillStyle = _applyFog('#0a1824', info.fogFactor, info.brightness * 0.6);
      ctx.fillRect(col, gapStart, 1, gapH);
      // Subtle caustic shimmer near the top of the cavity.
      var shimmerH = Math.max(1, Math.floor(gapH * 0.12));
      var sA = 0.15 * info.brightness * (1 - info.fogFactor);
      if (sA > 0.01) {
        ctx.fillStyle = 'rgba(140,200,230,' + sA.toFixed(3) + ')';
        ctx.fillRect(col, gapStart, 1, shimmerH);
      }
    });
  }

  return { init: init };
})();
```

Then the interior (or exterior) contract just declares the tile and
the filler key:

```javascript
// spatial-contract.js exterior() tileFreeform
40: Object.freeze({ hUpper: 0.0, hLower: 0.5, fillGap: 'well_water' }),
38: Object.freeze({ hUpper: 0.0, hLower: 0.6, fillGap: 'dump_truck_bed' })
```

#### Invariants and expectations

- **Keys are strings.** The registry dispatch is a plain object lookup,
  so unknown keys fall back to `_default` silently — the cavity will
  render as a dim placeholder until the owning module registers. That
  is the intended dev-time signal that "a tile's filler hasn't been
  wired up yet."
- **Fillers run in the column hot path.** Budget: ≤3 `fillRect` calls
  per column, no allocations, no trig. Anything more expensive
  (animated noise, per-pixel sampling) belongs on a billboard sprite,
  not the gap pass.
- **Zero-alloc contract.** `_gapInfo` is a single shared object reused
  for every column every frame. Fillers mutate nothing on it.
- **No z-buffer writes inside a filler.** The cavity sits in front of
  whatever the back-layer pass drew; painter's algorithm handles
  compositing. Fillers only paint pixels.
- **Fillers are strictly additive to the cavity.** Opaque water, solid
  trash fill, warm glow, etc. — all written with simple `fillRect`
  stripes. The see-through behavior (sky / back geometry showing
  through) is the `_default` case when no filler key is set.

#### Migration checklist for new interactive cavity tiles

1. Add the tile constant to `engine/tiles.js` and extend
   `TILES.isFreeform()` to include it.
2. Add the freeform entry to the relevant contract's `tileFreeform`
   table in `engine/spatial-contract.js`, including `fillGap: 'key'`.
3. Create (or extend) a Layer-3 module that owns the tile's behavior
   and register its filler in `init()` via
   `Raycaster.registerFreeformGapFiller('key', fn)`.
4. Wire the module's `init()` into `Game.init` (Layer 4) after the
   raycaster has been initialized.
5. Sprite billboarding (fire, water caustic, trash pile) stays on the
   existing sprite pipeline. The gap filler is **background wash**,
   not the iconography.

This pattern is what unblocks the Phase 2 civilized bonfire + pergola
moat (`fire_column` filler), Phase 3 arches and portholes
(`arch_interior`, `porthole_ocean`), and the jam-adjacent living
infrastructure tiles from DOC-83 §13 (`well_water`, `dump_truck_bed`,
`soup_kitchen_broth`, `mailbox_slot`, etc.) without another
raycaster.js edit per feature.

### 3.6. Alpha-mask gaps (arches, portholes)

When `gapTexAlpha: true`, the split is not a flat row range but is
driven per-column by sampling the texture's alpha channel at `texX`:

```javascript
function _computeAlphaRange(tex, texX) {
  var h = tex.height;
  var bitmap = tex.data;  // Uint8ClampedArray RGBA
  var topOpaque = 0;
  var botOpaque = h - 1;
  // Walk down from top until first transparent pixel
  for (var y = 0; y < h; y++) {
    if (bitmap[(y * tex.width + texX) * 4 + 3] < 128) break;
    topOpaque = y;
  }
  // Walk up from bottom until first transparent pixel
  for (var y2 = h - 1; y2 >= 0; y2--) {
    if (bitmap[(y2 * tex.width + texX) * 4 + 3] < 128) break;
    botOpaque = y2;
  }
  return { top: topOpaque, bot: botOpaque };
}
```

This gives an arched profile for free: the upper segment's height
varies per column based on the alpha silhouette baked into the
texture. Columns through the center of the arch have a tiny upper
segment (the curve is high), columns at the arch's edge have a tall
upper segment (the curve is low). No trig, no special-case code — the
artist draws the arch shape into the texture's alpha channel and the
raycaster reads it.

We already have the machinery for this: `TextureAtlas._genBrick` etc.
all produce `ImageData` with a 4-channel buffer. We simply need to
stop assuming alpha is always 255 and write transparent pixels where
the opening should be.

---

## 4. Phased implementation plan

### Phase 0 — Instrumentation (1 day, prerequisite) ✅ SHIPPED

Goal: measure before cutting.

- Add a debug overlay that dumps per-column layer count and freeform
  tile hit rate each frame.
- Capture baseline frame time on the Approach floor and Promenade
  (target: ≤ 16 ms / frame at 480 rays).
- Document expected frame cost budget for the freeform path:
  ~1 extra `drawImage` per freeform column + 1 alpha sample per column
  for Phase 3.
- Commit the debug overlay behind a `?debug=freeform` URL flag.

**Deliverables:** `engine/debug-overlay.js` freeform panel, baseline
perf numbers committed to this doc.

### Phase 1 — Two-segment wall layer (3 days) ✅ SHIPPED

Goal: replace the HEARTH step-fill hack with a real two-segment
column render. No texture alpha yet.

- Add `tileFreeform` table to SpatialContract. Register HEARTH with
  `hUpper = 0.65`, `hLower = 0.0`. (Upper brick band only — the "base"
  below the fire is handled by the normal wall column continuing past
  the gap to the floor.)
- Extend `_layerBuf` records with `fUpperWorld` / `fLowerWorld`.
- Teach the DDA to populate those fields when it encounters a freeform
  tile via `contract.tileFreeform[tile]`.
- Implement `_renderFreeformLayer(layer, col, …)` using the segment
  math from §3.3. Keep the mantle-edge shading from the current hearth
  code (the dark line separating mantle from cavity).
- Add the per-column occlusion table from §3.4. Wire it into
  `_renderBackLayer()` so back layers respect freeform gap bounds.
- Rip out the HEARTH step-fill branch (lines ~788–865 in raycaster.js)
  once the new path produces visually equivalent or better output.
- Billboard the existing `decor_hearth_fire` sprite + dragon emoji at
  the HEARTH cell's center so they render in the gap via the existing
  sprite pipeline (Tier B content).

**Acceptance:**
- HEARTH in Gleaner's Home (`1.6`) renders with brick mantle above,
  visible fire + glow in the gap, brick base below.
- Walking around the HEARTH: the gap correctly shows floor /
  background walls peeking through from the sides as parallax shifts.
- Performance within 1 ms of Phase 0 baseline.

### Phase 2 — Freeform exterior structures (2 days) ✅ SHIPPED (2026-04-10)

Goal: community pyre (CITY_BONFIRE) + pergola beam (PERGOLA_BEAM)
on the Promenade (`1`), Lantern Row (`2`), and Dispatcher's Office
plaza (`2.1` approach). Extended during the phase with a third
freeform exterior tile, the pressure-wash DUMP_TRUCK (Phase 2c),
which stress-tested the pattern against dynamic grid mutation and
side-face wallDecor. Three sub-phases, all shipped 2026-04-10.

#### Phase 2a — CITY_BONFIRE ✅ SHIPPED (2026-04-10)

Tile name: `CITY_BONFIRE` (69). Thematic framing: an Olympic-model
community pyre kept burning during the games, anchoring the main
plaza on every exterior floor. The pyre is the first freeform tile
that is NOT an interior cavity — it extends the pattern to
exterior-contract columns with wallHeightMult > 1.

**Tile spec:**

| Tile | ID | `wallHeightMult` | `hUpper` | `hLower` | `fillGap` | Notes |
|---|---|---|---|---|---|---|
| CITY_BONFIRE | 69 | 3.0 | 0.0 | 1.2 | `city_bonfire_fire` | Pale limestone pedestal + animated flame column |

Geometry reading top-down: the column is 3.0 world units tall. The
top 1.8 units are a see-through cavity (no upper cap — exterior
contracts have no ceiling plane) filled with the `city_bonfire_fire`
gradient. The bottom 1.2 units are the `city_bonfire_stone` pedestal
(chiseled limestone, warm cream tint). Walking around it, the
pedestal reads as a waist-high ceremonial block and the flame rises
into the skybox.

**What shipped:**

- `TILES.CITY_BONFIRE = 69` + `isFreeform` + `isOpaque` entries.
- `SpatialContract.exterior()` gains a `tileFreeform` table with the
  CITY_BONFIRE entry, plus `textures[69] = 'city_bonfire_stone'`,
  `tileFloorTextures[69] = 'floor_cobble'`, `tileWallHeights[69] = 3.0`,
  and `tileHeightOffsets[69] = 0` (defensive — freeform path
  suppresses Doom-rule offset when the config is active).
- `TextureAtlas` generates `city_bonfire_stone` via `_genStone` with a
  warm cream palette (baseR/G/B 162/148/118, variance 24) so the
  carved blocks read as ceremonial masonry, not rubble.
- `Raycaster` registers the `city_bonfire_fire` gap filler in
  `_gapFillers`. The filler draws a vertical `createLinearGradient`
  per column, anchored to the UNCLIPPED gap extents so band
  proportions stay correct at close range (the gradient doesn't
  squish when the viewport clips the pyre top). Color stops: hot
  white-yellow core at the pedestal top, yellow-orange body, warm
  orange mid, red-orange upper body, transparent red crown (sky
  shows through the top). Per-column flicker phases via
  `Date.now() * 0.012 + col * 0.31 + mapX * 1.7 + mapY * 2.9` so
  adjacent columns and adjacent pyres desynchronise naturally.
- `_gapInfo` extended with a frozen `ff` reference so fillers can
  read the active tile's `hUpper`/`hLower` to compute unclipped band
  boundaries.
- Test placement on the Promenade (`1`) at cell `(24,16)` — north
  path shoulder directly adjacent to the existing BONFIRE(24,17),
  forming a combined rest plaza visible from spawn `(4,17)` on the
  main east-west road.

**Pending follow-ups for Phase 2a:**

- Interact prompt: let the player use the pyre as a rest point, same
  contract as BONFIRE. Currently the placement is render-only.
- Minimap glyph: add a dedicated marker so the pyre reads distinctly
  from the lower BONFIRE ring.
- Sprite pass: optional smoke billboard above the flame column for
  distance readability (the gradient alone reads great up close but
  can blend into a warm sunset at > 15 tiles).

#### Phase 2b — PERGOLA_BEAM ✅ SHIPPED

Tile name: `PERGOLA_BEAM` (70). Mirror of CITY_BONFIRE but intentionally
thinner: a freeform tile with a TOP band only (`hUpper = 0.20`,
`hLower = 0.0`, `wallHeightMult = 2.0`). Shipped with three refinements
after initial in-browser testing:

1. **Thickness cut from 0.80 → 0.27 → 0.20** across two passes. The
   first build used 0.80 (matching the CITY_BONFIRE chimney exactly)
   which read as a second full-mass slab instead of a canopy. The
   second pass dropped to 0.27 (≈ 1/3 the chimney) which read
   correctly as delicate lattice. The third pass dropped to 0.20
   (≈ 1/4 the chimney) after the parent CITY_BONFIRE column shrank
   from 3.0 → 2.0 tall (see refinement #3 below) — a thinner rail
   reads better at the lower absolute elevation.
2. **`fillGap` switched from `'_default'` to `'_transparent'`** — the
   `_default` filler paints dim fog-tinted `#141414` across the
   cavity, which rendered the entire "under the canopy" area as a
   solid black cube at near distances. A new no-op `_transparent`
   filler was added in `engine/raycaster.js` so the sky prepass
   (above horizon) and floor cast (below horizon) show through the
   gap untouched. Use this filler for any future freeform tile that
   wants a literal see-through cavity instead of a registered overlay.
3. **Both PERGOLA_BEAM and CITY_BONFIRE dropped from 3.0 → 2.0 tall**
   so the fire cavity shrank from 1.70 → 0.70 world units — a narrow
   "controlled window" look instead of a towering column of flame.
   The chimney bottom now sits at world Y=1.20 (was 2.20) — it
   "starts sooner" in the vertical order, which feels closer and
   more believable for a plaza structure the player walks around.
   PERGOLA_BEAM's canopy followed, landing at 1.80–2.00 instead of
   2.73–3.00.

Also resolves the "thin sliver vanishes at distance" open question
differently than expected — at 0.20 world units the band projects
to ~2–3 px at 12 tiles, which is still readable because the beam
sits in the sky band against the parallax layers (high contrast),
not in the fogged wall band.

Final tile spec:

| Tile | ID | `wallHeightMult` | `hUpper` | `hLower` | `fillGap` | Notes |
|---|---|---|---|---|---|---|
| PERGOLA_BEAM | 70 | 2.0 | 0.20 | 0.0 | `_transparent` | Thin top-anchored canopy (~1/4 chimney thickness), literal see-through cavity below |
| CITY_BONFIRE (updated) | 69 | 2.0 | 0.80 | 0.50 | `city_bonfire_fire` | Pyre shortened from 3.0 → 2.0; fire window narrowed 1.70 → 0.70 |

Ship notes:

1. Tile constant added to `tiles.js`. Predicates: `isOpaque` (so the
   DDA registers a hit and feeds the freeform path), `isWalkable`
   (player walks under the canopy), `isFreeform` (routes to the
   two-segment wall renderer).
2. Registered in `SpatialContract.exterior()`: `tileFreeform[70] =
   { hUpper: 0.80, hLower: 0.0, fillGap: '_default' }`,
   `tileWallHeights[70] = 3.0`, `tileHeightOffsets[70] = 0`,
   `textures[70] = 'pergola_beam'` (shared with the PERGOLA slab),
   `tileFloorTextures[70] = 'floor_cobble'`.
3. No custom gap filler — `_default` produces a transparent cavity
   which is exactly what the pergola wants. The beam is the only
   painted band; everything below is sky / plaza floor.
4. Placement on the Promenade (`1`): 7 beam cells ringing the
   CITY_BONFIRE at (24,16) — rows 15/16/17, cols 23/24/25,
   skipping the pyre at (24,16) and the BONFIRE at (24,17). The
   open south gap at (24,17) lets the combined plaza read as a
   "greater hearth with a plaza pavilion that opens toward the main
   road."
5. Future placement: 4 cells flanking the Dispatcher's Office
   (`2.1`) approach once Lantern Row exterior is dressed.

**Follow-ups still to do:**

- Back-layer collection past the CITY_BONFIRE: verify via
  `?debug=1` + `P` trace that a ray passing through both the
  bonfire moat AND a pergola beam behind it reports both layers in
  the right compositor order. Should work for free via the existing
  `_fgIsFreeformSeeThrough` flag but not yet confirmed.
- In-browser screenshot verification on the Promenade spawn.

#### Phase 2c — DUMP_TRUCK ✅ SHIPPED (2026-04-10)

Tile name: `DUMP_TRUCK` (38). Thematic framing: the Gleaner's
pressure-wash rig, dispatched to a new plaza cell each day via the
scheduled node circuit. Visual goal: "HEARTH-stature" boxy vehicle
with a low ground-level slot revealing the hose reel inside. This
is the first freeform exterior tile that is both **animated by a
dynamic spawner** (grid mutates at day rollover) and **carries
side-face wallDecor** (wheel sprites on the four floor-adjacent
panes).

**Final tile spec:**

| Tile | ID | `wallHeightMult` | `hUpper` | `hLower` | `fillGap` | Notes |
|---|---|---|---|---|---|---|
| DUMP_TRUCK | 38 | 2.0 | 1.50 | 0.10 | `truck_spool_cavity` | 3-band silhouette, see-through cavity at world Y 0.10–0.50 |

Band layout (reading bottom-up on a 2.0-tall face):

- **0.00 → 0.10** — bumper strip (solid `truck_body` texture)
- **0.10 → 0.50** — spool cavity (transparent, subtle cool-blue tint)
- **0.50 → 2.00** — upper chassis (solid `truck_body` texture, the
  dominant visual mass that gives the truck its "HEARTH stature")

**What shipped:**

- `TILES.DUMP_TRUCK` added to `isFreeform` so the two-segment path
  activates. Tile constant was pre-existing but was previously
  rendered as a short 0.5-tall box with a floating hose emoji.
- `SpatialContract.exterior()` gains a `tileFreeform[38]` entry
  with the above dimensions. The base `tileWallHeights[38]` is 2.0,
  but — critically — every biome that declares its own
  `tileWallHeights` must also declare `38: 2.0` because
  `_mergeTileTable` is a shallow overwrite. Three biomes
  (`approach`, `promenade`, `lantern`) previously carried `38: 0.5`
  which clobbered the freeform geometry and produced a half-tile
  truck — fixed in this pass, with warning comments left in-line.
- `Raycaster` registers the `truck_spool_cavity` gap filler as a
  **transparent mirror of `hearth_fire`**: the filler paints
  nothing but a faint cool-blue `rgba(70,130,200,~0.10)` tint that
  scales with brightness and inverse fog, so the back layers
  (floor / skybox / far geometry) show through the slot cleanly.
  An earlier iteration painted an opaque back wall + blitted the
  hose texture, which read as "a bright blue rubber band around
  the whole truck" and was rewritten per in-browser feedback.
- `DumpTruckSprites` (Layer 3) emits a 🧵 billboard at the tile
  center with a 🔧 overlay, scale 0.55, `groundLevel: true` so the
  sprite center shifts down ~35% of screen height and lands inside
  the low cavity instead of at eye level. Slow mechanical bob
  (BOB_AMP 0.4, BOB_PERIOD 2400 ms). Mirrors the BonfireSprites
  HEARTH pattern — the reel renders via the z-bypass sprite path
  even though the truck's front face is closer to the camera.
- `game.js` sprite compilation carries the `groundLevel` and
  `noFogFade` flags through into `_sprites.push()`. A prior version
  was stripping both fields during the copy, which would have left
  the reel floating at eye level even with the correct source data.
- Wall decor on the four side faces: two `decor_truck_wheel`
  sprites per face at `anchorU: 0.22/0.78, anchorV: 0.09, scale:
  0.15`. The wheel sprites span world Y 0.03–0.33, **intentionally
  straddling** the cavity floor (0.10) for a "wheel arches cut into
  the body" read — with only 0.10 world units of solid bumper
  below the cavity there's nowhere else for a readable-sized wheel
  to go. Paint order (wall texture → cavity tint → wallDecor →
  sprites) lets the wheels draw on top of the transparent cavity
  tint without obscuring the reel billboard.
- Wall decor is built in two places that MUST stay in sync:
  (a) `_buildWallDecorFromGrid` in `floor-manager.js` runs at
  floor generation, and (b) the new `rebuildDumpTruckDecor(floorId,
  x, y, mode)` helper is the live-update mirror called by the
  `DumpTruckSpawner` whenever the truck is stamped onto a new cell
  or cleared off the old one at day rollover. The helper strips
  existing `decor_truck_wheel` entries first so re-stamping is
  idempotent.
- `Raycaster._renderFreeformForeground` now calls
  `_renderWallDecor` for freeform tiles (previously wallDecor
  only ran in the non-freeform else branch). This is what makes
  the wheels visible on the 2.0-tall freeform truck body.
- `DumpTruckSpawner._clearTruckTiles` and `_placeTruckTiles` bracket
  the grid mutation with `rebuildDumpTruckDecor('clear' / 'stamp')`
  calls so the wallDecor cache stays consistent with the live grid
  across the day cycle.

**Regressions caught and fixed during the phase:**

1. **Half-tile tall truck on non-base biomes** — biome-level
   `tileWallHeights` shallow-merge clobbered the freeform geometry.
   Fixed by updating all three exterior biome tables; the fix is
   documented with a "WARNING" comment so future biome additions
   remember the merge contract.
2. **Opaque "rubber band" slice** — first iteration painted the
   hose texture column into an opaque back wall, reading as a
   painted emoji band on the truck face. Rewritten to fully
   transparent per HEARTH pattern.
3. **Missing HEARTH air intake grate** — while restoring
   `_renderWallDecor` for the freeform branch we pulled the
   `decor_grate` sprite back into the render path. The grate was
   originally anchored at `anchorV: 0.35, scale: 0.20` back when
   the HEARTH had a narrow fire cavity, and now lands inside the
   cavity (world Y 0.50–0.90 on a 2.0-tall face, squarely in the
   0.40–1.20 fire band) where it floats over the dragonfire emoji.
   Stopgap fix: squished the grate up to `anchorV: 0.94, scale:
   0.10` so it sits flush under the mantle ceiling, clear of the
   cavity. Needs a proper hUpper/hLower-aware anchoring pass in
   a later phase — **see open item below**.

**Open items:**

- `decor_grate` on HEARTH is currently hand-anchored to the top of
  the mantle band with a numeric `anchorV`. Any future change to
  HEARTH's `hUpper` / `hLower` will drift the grate out of place
  again. Correct fix: add an optional `anchorBand: 'upper' |
  'lower' | 'cavity'` field to wallDecor entries so the anchor
  resolves against the freeform band extents at render time rather
  than against the raw wall face. Track as a polish item for the
  Phase 3 / Phase 4 work.
- `SpatialContract.exterior()` merge semantics for `tileWallHeights`
  are a trap. Biomes that add their own height tables must declare
  the freeform tile heights explicitly or lose them. Consider
  changing the merge to deep-merge only the freeform-tile subset,
  or add a lint pass that fails floor-manager init if a freeform
  tile's height multiplier drops below `hUpper + hLower`.
- Minimap glyph: the truck reads identically to a wall on the
  minimap. Should get a dedicated icon before ship.

**Acceptance for Phase 2 (both tiles):**

- Plaza on Lantern Row renders the city bonfire with the pergola
  canopy ringing it. Sky visible through the gaps between beams.
- Player can walk around the bonfire, see it from all sides, see the
  pergola beams correctly floating at the canopy height with the
  flame column passing through.
- N-layer back collection reports ≥ 2 layers per column in
  bonfire-through-pergola lookdowns.
- Frame time stays within 1 ms of the Phase 1 baseline.

### Phase 3 — Alpha-mask freeform (arches + portholes) (3 days)

Goal: per-column gap profile driven by texture alpha. Enables arched
doorways and circular portholes.

- Extend `TextureAtlas` to support writing alpha = 0 pixels. (Today
  everything is opaque — we just need to stop forcing α = 255 in the
  generators.)
- Add `_computeAlphaRange(tex, texX)` helper that walks the column and
  returns `{top, bot}` opaque ranges, cached per-texture.
- Teach `_renderFreeformLayer` to consult the alpha range per column
  when `fGapAlpha` is set.
- New tile `ARCH_DOORWAY` (71) — texture is the wall-with-arch cutout
  (upper brickwork with a parabolic transparent arch). `fGapAlpha =
  true`. `hLower = 0`.
- New tile `PORTHOLE` (72) — texture is a brick wall with a circular
  transparent cutout. Billboard the existing sealab ocean animation
  sprite at the cell center (Tier B gap content).
- Place arched doorway on the Dispatcher's Office (`2.1`) and Foyer,
  and a row of portholes on the Seaway biome walls.

**Acceptance:**
- Arch renders with curved top; player sees interior / adjacent space
  through the arch while ray-sweep past it.
- Porthole renders with circular opening; ocean billboard visible
  through the hole.
- Existing wall rendering unaffected (alpha stays 255 everywhere
  except the dedicated freeform textures).

### Phase 4 — Windows with interior scenes — SHIPPED (2026-04-10)

Goal: tavern / shop windows show a painted interior scene visible
from the street.

**What shipped:**

| Piece | Implementation |
|-------|----------------|
| Tile constant | `TILES.WINDOW_TAVERN = 73` in `engine/tiles.js`, added to `isOpaque` + `isFreeform` predicates. |
| Freeform geometry | `tileFreeform[73] = { hUpper: 1.85, hLower: 0.90, fillGap: 'window_tavern_interior' }` — three-band sandwich sized to the 3.5-unit exterior WALL height (all three exterior biomes set WALL=3.5). Sill 0.00→0.90 / glass slot 0.90→1.65 (eye-level, 0.75 units around the 1.0-unit camera height) / lintel+upper 1.65→3.50. |
| Wall height override | `tileWallHeights[73] = 3.5` in base exterior() — matches WALL so the window cuts into the facade plane without creating a notch. |
| Textures | Sill + lintel share `'wood_plank'`; glass slot is painted by the gap filler (no texture lookup). |
| Gap filler | `window_tavern_interior` in `raycaster.js` — transparent cavity with a warm amber (255/180/60 @ 14% alpha) sodium-lamp wash over whatever the back layers have drawn. Mirrors the hearth_fire / truck_spool_cavity see-through pattern exactly. |
| Interior billboard | New Layer 3 module `engine/window-sprites.js` — `WindowSprites.buildSprites()` emits a 🍺 glyph at every WINDOW_TAVERN tile, scaled 0.42 with a warm amber glow. No `groundLevel` flag: the cavity center (world Y 1.275) sits just above the 1.0 eye level, so default halfH-anchored placement lands the glyph near the bottom of the slot (where a bar patron leaning on the counter would be). Per-floor cache identical to BonfireSprites / DumpTruckSprites. |
| Game wiring | Sprite compilation loop in `game.js` pushes WindowSprites output into `_sprites` with `groundLevel` and `noFogFade` flags copied (learned from the DUMP_TRUCK sprite-field-strip bug). |
| Placements | Promenade floor `1`: Coral Bazaar (9,8)(11,8) flanking DOOR(10,8) + Driftwood Inn (21,8)(23,8) flanking DOOR(22,8). Both south facades face the road corridor so the player sees lit interiors while walking east/west along the main plaza path. |

**Acceptance:**
- Windows on interior-building exteriors show a glowing interior
  scene; scene parallaxes correctly as player strafes past. ✅
- Interior buildings remain enterable via their doors; the window is
  purely decorative (no secondary raycast yet). ✅

**Open items:**

- **Per-biome wallHeight scale mismatch** — the 3.5-unit column is
  correct for approach/promenade/lantern, but if a future interior
  biome tries to place a WINDOW_TAVERN on a 2.5-unit interior wall the
  freeform bands (summing to 3.5) would overrun the column. A proper
  fix is to express bands as fractions of `tileWallHeight` rather than
  absolute world units, or to add a second tile constant
  (WINDOW_INTERIOR) with its own freeform entry. Punt to Phase 5 polish.
- **Bazaar window thematic mismatch** — the 🍺 glyph reads as "tavern"
  but we placed it on Coral Bazaar too (a card shop). Consider adding a
  WINDOW_BAZAAR variant emitting a 🃏 or 💎 sprite, or a per-building
  sprite override so WindowSprites consults a tile-centric lookup
  table. For now the bazaar windows read as "warm glowing merchant
  storefront" which is acceptable.
- **Minimap glyph** — minimap renders WINDOW_TAVERN as a generic wall
  tile. A small amber pixel would sell the placement at a glance.

### Phase 5 — Polish + secondary raycast (stretch, 3 days)

Only if needed for visual parity with the reference.

- Tier C gap content: when a freeform gap has no billboard filler,
  continue the DDA past the freeform cell and draw the next solid
  hit's column into the gap rows. Gives "look through the arch and
  see the actual room beyond" fidelity.
- Per-tile cost budget: ≤ 1.5 ms total frame overhead on webOS TV
  target hardware.
- Profile on the actual LG Magic Remote target; drop Tier C if it
  pushes past 16 ms.

---

## 5. Module touch list

Files that change:

```
engine/tiles.js                +5 tile constants, isFreeform predicate
engine/spatial-contract.js     +tileFreeform table per biome
engine/floor-manager.js        +biome registrations for new tiles
engine/texture-atlas.js        +alpha-writable generators, alpha range cache
engine/raycaster.js            +_renderFreeformLayer, _colDirty occlusion table,
                                 freeform branch in _renderBackLayer
engine/debug-overlay.js        new — freeform panel
docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md  (this file)
```

Files that are intentionally **not** touched:
- `movement-controller.js`, `pathfind.js`: freeform tiles are either
  walkable or opaque at the tile level. Collision stays grid-based.
- `minimap.js`: freeform tiles render to the minimap as normal walls
  (no cutout indication at 2×2 pixels).
- `hud.js`, `interact-prompt.js`: unchanged.

---

## 6. Migration story for current HEARTH implementation

The existing HEARTH fire-cavity code in `raycaster.js` (approx. lines
778–869) is load-bearing today and must keep working until Phase 1
is visually verified. Migration path:

1. Land Phase 1 behind a feature flag (`RaycasterDebug.useFreeform =
   false` by default).
2. Flip the flag on Gleaner's Home only. Visually verify under all
   lighting / fog conditions.
3. Flip on all floors. Delete the step-fill HEARTH branch.
4. Move the mantle-band shading code into `_renderFreeformLayer` as
   reusable polish (it is genuinely good pixel art and should survive
   the architectural change).

---

## 7. Open questions / risks

- **Canvas 2D `drawImage` cost**: Two draws per freeform column instead
  of one. At ~96 freeform columns/frame peak (1 HEARTH + 1 arch + a
  row of portholes visible together), that's ~96 extra draws. Profile
  first, commit second.
- **Occlusion table memory churn**: `_colDirty` is `w*2 = 1600` Int16s
  per frame. Cheap to zero-fill, but make sure we don't allocate per
  frame.
- **Alpha-mask cache invalidation**: `_computeAlphaRange` is called
  per column per frame. Cache per-texture (per-texX) at atlas init —
  alpha ranges don't change after the texture is baked.
- **webOS TV target**: Frame budget is the hard constraint. If Phase 3
  pushes past 16 ms, drop the alpha-mask path and stick with row-range
  gaps (Phase 1/2/4). Arched doorways become decorative sprites.

---

## 8. Reference material cross-walk

Quick lookup table for contributors reading the reference source:

| Concept in this doc | Reference file : line | Reference function |
|---|---|---|
| DDA dispatch for freeform tiles | `raycast.js:1891` | inline branch `TYPE_TILES.FREEFORM` |
| Freeform collision data | ~line 1891 | `getFreeformTileCollnData` |
| Two-segment column draw | `raycast.js:2397` | `col_freeformTile` |
| `hUpper` / `hLower` semantics | `raycast.js:2409-2410` | — |
| Upper portion y-projection | `raycast.js:2422-2424` | — |
| Lower portion y-projection | `raycast.js:2426-2428` | — |
| Alpha channel read in flat sampler | `raycast.js:2202, 2345` | `col_floor`, `col_ceiling` |
| Gap floor / ceiling visplane draw | `raycast.js:2474-2540` | `col_freeformTile` (inner) |
| Column occlusion struct | passed as `{ top, bottom }` on every draw call | — |
| `H_MAX_WORLD` world-height constant | `raycast.js:2405` | — |

Our equivalents (after this roadmap ships):

| Concept | Dungeon Gleaner path |
|---|---|
| DDA hit collector | `raycaster.js :: _layerBuf` |
| Freeform tile flag | `tiles.js :: TILES.isFreeform` |
| Freeform tile config | `spatial-contract.js :: tileFreeform` |
| Two-segment draw | `raycaster.js :: _renderFreeformLayer` |
| Alpha range cache | `texture-atlas.js :: _alphaRangeCache` |
| Column occlusion table | `raycaster.js :: _colDirty` |
| Gap filler sprites | existing sprite pipeline, billboard anchored to cell |

---

## 9. Out of scope

- Sloped floors / stairs as true 3D geometry (the reference supports
  this via `isSlopedFlat` in `col_floor`/`col_ceiling` — we keep our
  grid-snapped stairs with height offsets).
- Per-pixel Z-buffer (reference uses per-column only; we stay per
  column).
- Camera pitch / viewport tilt (reference supports 1.5° of tilt; we
  stay locked at horizon for the jam build, revisit post-jam).
- Mirror / reflection surfaces.
- Volumetric lighting through the freeform gap (a tempting follow-up
  for hearth warmth, but firmly out of scope for this roadmap).

---

## 10. Acceptance for the roadmap itself

This roadmap is "done" when:

1. Phase 1 ships and HEARTH in Gleaner's Home shows a visible fire
   cavity with brick mantle above and base below — verified on at
   least three fog conditions (CLAMP, FADE, DARKNESS).
2. Phase 2 ships and Lantern Row has a civilized bonfire with pergola
   moat the player can walk around.
3. At least Phase 3 OR Phase 4 ships (arches or windows — either
   demonstrates the alpha-mask path and proves the pipeline).
4. Frame time stays within 17 ms on the webOS TV target on the most
   freeform-dense floor.

Until all of the above, this doc stays under "planning." Updates go
inline (don't fork a new doc).

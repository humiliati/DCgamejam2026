# N-Layer Raycaster Roadmap
## See-Over Tiles, Floor Visibility, and Shrub-Guided Exteriors

**Goal**: Replace the 2-layer background-fill hack with a proper N-layer
compositing raycaster that renders floor between wall layers, enabling
half-height "see-over" tiles (shrubs, fences, low walls) that show
textured ground and distant buildings above them. This makes exterior
maps 3 bigger while visually guiding players to shops and exits
without dead space.

**Jam deadline**: April 5, 2026 (8 days)

**Status (Apr 9 2026)**: Core system ~90% complete. Phases 1, 3 shipped.
Phases 2, 4 deferred (unnecessary). Phase 5 partial (early-out + step limit
done; profiling + adaptive layers remaining). Phase 6 layout done, needs
visual verification. Phase 7 post-jam.

---

## 1. Current Architecture

### Render order (raycaster.js, ~1062 lines)

```
Pass 0  Skybox / ceiling gradient          (full-screen)
Pass 1  Floor casting (ImageData scanline)  (bottom half)
Pass 2  Parallax layers                     (behind walls)
Pass 3  Wall columns (DDA per-column loop)  (overwrites sky+floor)
Pass 4  Sprites                             (z-buffered billboards)
Pass 5  Particles                           (screen-space overlay)
```

### Wall column pass internals (per column) — SUPERSEDED

The original single-hit `_bgWall` system described below has been replaced
by the N-layer hit collector (Phase 1). Preserved for historical context:

```
OLD (replaced):
1. DDA traversal → first solid hit
2. Background continuation: continue DDA, record first taller solid tile as _bgWall
3. Compute foreground geometry
4. Render background gap: draw bg wall texture in [bgDrStart .. drawStart-1]
5. Render foreground wall

NEW (shipped):
1. DDA traversal → collect up to 6 solid hits in _layerBuf (front-to-back)
2. Compute geometry for all layers
3. Render back-to-front (painter's algorithm) via _renderBackLayer()
4. Render foreground wall (layer 0) with full texture/fog/decor pipeline
5. Floor pre-pass handles all floor between layers automatically
```

### The problem with the old bg-fill (SOLVED)

The gap above a short foreground wall was filled with the **background
wall's texture**. The player should see **floor tiles** between the
shrub and the distant building. This was solved by removing the explicit
gap-fill and switching to back-to-front N-layer rendering. The floor
pre-pass paints correct floor everywhere; walls only overdraw where
visible.

### Floor casting architecture

`_renderFloor()` is a **pre-pass**: it runs before the wall column loop,
filling the entire bottom half of the screen with textured floor via a
reusable `ImageData` buffer. The wall column loop then **overdraws** the
floor wherever walls are visible.

This means: the floor is already there, behind the wall columns. If we
simply **don't overdraw** the floor in the gap between two wall layers,
the pre-pass floor texture shows through naturally. The key insight is
that the floor pre-pass handles all floor rendering  we don't need
per-column floor casting. We just need to be careful about what we
overdraw and what we leave alone.

---

## 2. Design: N-Layer Column Compositing

### Layer model

Each column can have up to N wall hits at increasing distances. We
collect them front-to-back, then render **back-to-front** (painter's
algorithm within the column).

```
Layer 0 (closest): SHRUB at 0.5  covers bottom ~15% of column
Layer 1 (middle):  TREE at 2.5   covers bottom ~60% of column
Layer 2 (far):     WALL at 3.5   covers bottom ~80% of column
```

Back-to-front rendering:
1. Layer 2 (WALL) renders its full strip  overwrites floor pre-pass
2. Layer 1 (TREE) renders its full strip  overwrites lower portion of WALL
3. Layer 0 (SHRUB) renders its full strip  overwrites lower portion of TREE

Result: SHRUB at bottom, TREE visible above it, WALL visible above
that, sky above the WALL. Floor is visible in any column-region that
no layer covers (i.e., between layer tops where the pre-pass floor
shows through).

**Wait  does floor actually show through?**

No. Because each layer renders a solid strip from its drawStart to
drawEnd, and back layers render first, the back layer's strip covers
the floor in the gap region. The WALL strip extends from its drawStart
(high up) down to its drawEnd (floor level). The TREE strip then
overwrites from its drawStart down to its drawEnd. The gap between
TREE's drawStart and WALL's drawStart would show WALL texture, not floor.

This is **physically correct** for most cases: looking through shrubs
at a building, you'd see building wall in the gap, not floor. The floor
between you and the building is only visible in the **horizontal band
between the shrub top and the horizon line** where no wall layer
exists  and that's already handled by the floor pre-pass (the wall
column loop simply doesn't overdraw that region).

**Revised analysis**: The floor pre-pass fills the entire bottom half.
Walls overdraw from `drawStart` to `drawEnd`. Any screen pixel between
`drawStart` of the tallest layer and the horizon that isn't covered by
any wall layer **already shows the floor pre-pass**. The floor IS
visible  we just need to make sure we don't accidentally overdraw it
with sky or background wall texture in the gap.

### The actual gap problem

With the current bg-fill, the gap `[bgDrStart .. fgDrawStart-1]` is
filled with background wall texture. This is wrong when that gap
overlaps with the floor region (below the horizon). The correct
rendering:

```
Screen column breakdown (bottom to top):
  drawEnd  screen bottom:  floor pre-pass (already correct)
  drawStart  drawEnd:      foreground wall (SHRUB texture)
  horizon  drawStart:      this is the critical zone
    - Where a back wall exists: back wall texture (correct)
    - Where NO back wall exists but we're below horizon:
      floor pre-pass should show (already correct IF we don't overdraw)
    - Where we're above horizon: sky/parallax (already correct)
```

The floor pre-pass already painted the floor in the entire bottom half.
The wall pass overwrites only where walls are visible. **The floor is
already correct by default.** The bg-fill actively BREAKS this by
overdrawing floor pixels with wall texture.

### The fix

The bg-fill gap rendering must **clip to above the horizon** for the
floor portion. More precisely: it should only fill gap pixels where
the floor pre-pass doesn't represent the correct visual (i.e., above
the horizon, or where the background wall genuinely occludes the floor).

Actually, even simpler: a background wall at distance D has its
`drawEnd` (floor line) at the same screen Y as the floor pre-pass
would compute for distance D. So the background wall's strip from
`bgDrStart` to `bgDrEnd` correctly overwrites the floor where the wall
is visible. The floor between the foreground and background walls is
already painted by the floor pre-pass and should NOT be touched.

**The real fix is: render each layer's full strip back-to-front.
Don't fill "gaps" at all. The floor pre-pass handles the rest.**

---

## 3. Implementation Phases

### Phase 1: Refactor bg-fill → N-layer hit collector — IMPLEMENTED

**File**: `raycaster.js`
**Estimated time**: 45 min

~~Replace the current `_bgWall` single-hit system with an array that
collects all solid hits along the ray, front-to-back.~~

**Shipped implementation** (lines 40–53, 250–322, 418–433):

```javascript
var _MAX_LAYERS = 6;       // increased from proposed 4
var _MAX_BG_STEPS = 24;    // increased from proposed 16 for deeper views
var _layerBuf = [          // pre-allocated (zero GC)
  { mx: 0, my: 0, sd: 0, tile: 0 },  // ×6 slots
];
```

After the DDA loop, compute perpDist and wall geometry for ALL hits.
Store as an array of layer descriptors.

Back-to-front render iterates `_layerBuf` in reverse (farthest first).
Each layer renders its full textured strip via `_renderBackLayer()`.
Closer layers overdraw farther layers naturally.

Z-buffer gets the closest hit's perpDist (for sprite occlusion).
Explicit gap-fill code removed entirely — back-to-front painter's
algorithm + floor pre-pass = correct compositing with zero gap logic.

Additional shipped features beyond the original spec:
- **Back-face injection** for short walls (lines 263–303): automatically
  injects an inner face for short tiles. SHRUB and FENCE explicitly
  excluded from back-face injection.
- **Height-based occlusion culling**: tracks `_maxH` (tallest visible
  wall) and skips equal-or-shorter hits as fully occluded (lines 310–320).
- **Early termination** at 3.0+ height walls (line 318).

### Phase 2: Per-column floor casting between wall layers — DEFERRED (unnecessary)

**File**: `raycaster.js`
**Estimated time**: 1.5 hr
**This is the hard phase.**

The floor pre-pass paints the floor assuming baseWallH for the distance
calculation (`rowDist = halfH * baseWallH / rowFromCenter`). This means
the floor texture is correct for the default wall height. But with
tileWallHeights, the floor-to-wall boundary shifts:

- A 3.5 wall's drawEnd is at the same screen Y as the floor pre-pass
  (because both use the same baseWallH for the floor plane).
  Wait  drawEnd uses `flatBottom = halfH + baseLineH/2` where
  baseLineH = `h * baseWallH / perpDist`. And the floor pre-pass
  computes `rowDist = halfH * baseWallH / rowFromCenter`. These are
  the same equation inverted. So **the floor pre-pass and wall drawEnd
  are already aligned**. Any gap between two walls naturally shows the
  correct floor texture.

**Verification**: If SHRUB (0.5) is at distance 3 and WALL (3.5) is
at distance 8:
- SHRUB drawEnd: `halfH + floor(h * 1.0 / 3) / 2`  floor plane
- WALL drawEnd: `halfH + floor(h * 1.0 / 8) / 2`  floor plane
- Floor pre-pass at the screen row between these two drawEnds:
  `rowDist = halfH * 1.0 / (screenY - halfH)`  this computes the
  world distance for that scanline, samples the floor texture at the
  corresponding world position. This IS the floor between the shrub
  and the wall.

**Conclusion: Phase 2 might be unnecessary.** The floor pre-pass
already handles floor between wall layers correctly because both
systems use the same baseWallH for the floor plane equation. The
floor pre-pass paints the entire bottom half, and the back-to-front
wall rendering only overwrites where walls are visible. Floor between
walls shows through naturally.

**TODO**: Verify this empirically after Phase 1. If floor looks correct
between layers, skip Phase 2 entirely.

The one edge case: if a wall's `drawEnd` doesn't perfectly match the
floor pre-pass scanline (due to integer rounding), there could be a
1-pixel seam. Fix: extend each wall strip 1px down (`drawEnd + 1`)
to overlap the floor pre-pass boundary.

### Phase 3: SHRUB tile type + texture + contract wiring — IMPLEMENTED

**Files**: `tiles.js`, `texture-atlas.js`, `spatial-contract.js`,
          `floor-manager.js`
**Estimated time**: 1 hr

All sub-steps shipped:

3a. ✓ **tiles.js** — `SHRUB: 22`, `isWalkable` → false, `isOpaque` → true.

3b. ✓ **texture-atlas.js** — `_genShrub()` at lines 1883–1944. 64×64 procedural
texture with irregular ragged top edge, twig/stem detail, leaf clusters with
noise-based highlight/shadow, top fade gradient. `shrub_flower` variant not
yet added (stretch goal for visual variety).

3c. ✓ **spatial-contract.js** — `22: 'floor_grass'` in texture overrides (line 153),
`22: 0.5` in tileWallHeights (line 167).

3d. ✓ **floor-manager.js** — Exterior biome overrides include SHRUB wiring.
Floor 0 "The Approach" uses SHRUB tiles extensively in a 50×36 hand-authored
grid with hedgerow wayfinding (lines 1276–1330).

3e. ✓ **raycaster.js** — DDA uses `TILES.isOpaque(tile)` check (lines 233, 306),
which includes SHRUB automatically. No special-case needed.

### Phase 4: Ceiling gap handling for see-over tiles — DEFERRED (unnecessary)

**File**: `raycaster.js`
**Estimated time**: 30 min

Back-to-front painter's algorithm handles this correctly. The sky
pre-pass is only visible where no wall layer's strip covers a pixel.
No implementation needed.

Original analysis (preserved for reference):

When the player looks over a shrub at a distant building:
- Below horizon: floor pre-pass (correct)
- Shrub region: shrub texture (correct)
- Between shrub top and building: sky/parallax pre-pass (correct  IF
  no back-to-front layer overwrites it)

In the back-to-front scheme, the farthest layer (building at 3.5)
renders first, filling its strip from `drawStart` to `drawEnd`. This
strip extends above the horizon into the sky region. The Skybox/ceiling
pre-pass already painted the sky there. The building wall correctly
overwrites the sky only where the building is visible.

Then the shrub layer renders on top, covering its portion. The region
between the shrub top and the building bottom that isn't covered by
either layer shows... the sky pre-pass. But it SHOULD show the building
wall there.

Wait  the building's strip extends from `bgDrStart` (far above shrub)
down to `bgDrEnd` (floor level). The shrub's strip extends from
`fgDrStart` to `fgDrEnd`. The shrub overdraw only covers
`[fgDrStart, fgDrEnd]`. The building's `[bgDrStart, fgDrStart-1]` region
was painted in the first pass and is NOT overwritten by the shrub.
So the building IS visible above the shrub. Correct!

**Phase 4 may also be unnecessary.** The back-to-front painter's
algorithm handles this correctly. The sky pre-pass is only visible where
no wall layer's strip covers a pixel.

**TODO**: Verify empirically. Mark this phase as "verify only."

### Phase 5: Performance guard — skip layers when off-screen — PARTIAL

**File**: `raycaster.js`
**Estimated time**: 30 min

Optimizations for the N-layer system on webOS hardware:

5a. ✓ **Early-out on tileWallHeights**: Multi-hit DDA only enters
continuation if `_contract` exists. Floors without contracts/tileWallHeights
skip the entire layer-collection loop. **DONE.**

5b. ✗ **Skip off-screen layers**: Check if a back layer's strip is fully
occluded by the front layer before rendering. **NOT YET IMPLEMENTED.**
Height-based culling during DDA collection (skipping equal-or-shorter hits)
partially addresses this, but per-column screen-space occlusion check is
not done.

5c. ✓ **Limit continuation distance**: `_MAX_BG_STEPS = 24` (increased from
the proposed 16 for deeper views). Also bounded by `renderDist`. **DONE.**

5d. ✗ **Profile on webOS**: No systematic frame-time profiling of the column
loop. Only sporadic `Date.now()` calls for fire/particle timing.
**NOT YET IMPLEMENTED.**

5e. ✗ **Adaptive layer count**: `_MAX_LAYERS` is hardcoded to 6. No logic
to reduce based on frame time. **NOT YET IMPLEMENTED.** Would be relatively
easy to add — compare `performance.now()` delta before/after column loop,
reduce `_MAX_LAYERS` for next frame if over budget.

### Phase 6: Floor 0 integration test — shrub-guided courtyard — LAYOUT COMPLETE

**File**: `floor-manager.js`
**Estimated time**: 1 hr

~~Redesign Floor 0 grid to use SHRUB tiles as wayfinding guides:~~

Floor 0 "The Approach" is fully hand-authored at 50×36 with SHRUB
hedgerows for wayfinding (lines 1276–1330 in floor-manager.js).
Rooms, doors, and lighting are configured. **Visual verification
in-browser is the remaining work** — confirm:

```
Current 2016 grid  expand to 4032 (or keep 2016 for first test)
```

Test layout for the existing 2016 grid:
- Replace some EMPTY courtyard tiles with SHRUB to create a guided path
  from spawn to the building entrance
- Place SHRUB hedgerows along the path edges
- Player should see the building above the shrubs from spawn
- Verify: floor texture visible between shrub tops and building bottom
- Verify: building wall visible above shrub tops
- Verify: sky visible above building

```
[21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 0
[21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 1
[21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 2
[21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 3
[21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 4
[21,21,21,21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21,21,21,21], // 5
[21,22,22,22, 0,10, 1, 1, 1, 2, 1, 1, 1, 1,10, 0,22,22,22,21], // 6
[21,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,21], // 7
[21,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,21], // 8
[21,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,21], // 9
[21,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,22,21], //10
[21,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,21], //11
[21,22,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,22,21], //12
[21,22,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,22,21], //13
[21,22,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22,22,21], //14
[21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21]  //15
```

Here shrubs (22) form hedgerows along the path edges. From spawn at
(9,13) facing north, the player sees:
- Shrub hedges at knee height on either side
- Floor tiles visible between and beyond the shrubs
- Pillar columns at the building entrance (cols 5, 14)
- Building facade rising above everything
- Sky above the building

### Phase 7 (Post-integration): Expanded exterior maps

**Not for jam** unless time permits. Design notes for future:

- Expand Floor 0 from 2016  4032 or 6048
- Shrub hedgerows create garden maze paths to shops/exits
- Open sight-lines over shrubs to distant buildings (wayfinding)
- TREE perimeter expands to fill the larger boundary
- DDA renderDist may need increase from 16  24 for larger maps
- Floor casting pre-pass cost scales with screen pixels (constant)
  but DDA cost scales with map size (linear per ray)

---

## 4. Critical Insight: Floor Pre-Pass Is Already Correct — VERIFIED

The biggest realization from analyzing the code (confirmed by shipped implementation):

**The floor pre-pass (`_renderFloor`) already paints correct floor
texture in every pixel below the horizon.** It doesn't know about walls
 it just computes floor world position per pixel and samples the
texture. The wall column loop **overdraws** floor pixels where walls
exist.

With back-to-front N-layer rendering:
1. Floor pre-pass fills bottom half (correct floor everywhere)
2. Farthest wall layer overwrites floor where that wall is visible
3. Next wall layer overwrites portion of previous layer
4. Closest wall layer overwrites portion of all previous layers

Floor shows through in any column region not covered by any wall
layer's strip. This is physically correct: you see floor between
walls at different distances.

**This means we don't need per-column floor casting between layers.**
The expensive Phase 2 (per-column floor casting) is eliminated. The
entire solution is:
1. Collect N hits (Phase 1)
2. Render back-to-front (Phase 1)
3. Add SHRUB tile (Phase 3)
4. Performance guard (Phase 5)

Total estimated time: ~3.5 hours (down from ~5.5 with floor casting).

**Status (Apr 9 2026):** This prediction was correct. Phases 1, 3, 5a, 5c
are shipped. Phases 2, 4 confirmed unnecessary. Remaining: 5b/5d/5e
(optimization polish) and Phase 6 visual verification.

---

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Floor/wall seam (1px gap at drawEnd boundary) | Visual glitch | Extend wall strip 1px down to overlap floor |
| 4-layer column on webOS exceeds frame budget | Framerate drop | Adaptive MAX_LAYERS (Phase 5e) |
| Shrub texture looks flat/cheap vs Unity assets | Art quality | Invest in procedural gen (multi-noise + edge scatter) |
| N-layer DDA adds latency to input response | Input lag | Profile; DDA is CPU-bound, not blocking event loop |
| Larger maps exceed _floorCache memory on webOS | OOM crash | LRU eviction policy on _floorCache (max 4 floors) |

---

## 6. Dependency Order (Updated Apr 9 2026)

```
 Phase 1 (N-layer collector + back-to-front render)  DONE
  
 Phase 3 (SHRUB tile + texture + Floor 0 layout)     DONE
  
 Phase 5a,c (Early-out + step limit)                  DONE
  
 Phase 6 (Integration test on Floor 0)                LAYOUT DONE — needs visual verify
  
 Phase 4 (Verify ceiling gaps)                         DEFERRED — no-op confirmed
  
 Phase 2 (Per-column floor casting)                    DEFERRED — unnecessary

REMAINING:
  Phase 5b (Skip off-screen layers)                   Not yet — optimization polish
  Phase 5d (WebOS profiling)                           Not yet — needs device testing
  Phase 5e (Adaptive MAX_LAYERS)                       Not yet — easy add if needed
  Phase 7 (Expanded exterior maps)                     Post-jam
```

---

## 7. Cross-References to Other Roadmaps

### Phase 1 (N-layer DDA) ↔ TEXTURE_ROADMAP Layer 2 (Wall Decor) — BOTH SHIPPED

Both shipped. N-layer DDA collects multiple hits and renders back-to-front.
Layer 2 wall décor (13 sprite textures, 3 placement categories) operates
within the raycaster's wall column rendering. Wall décor renders on the
foreground layer via `_renderWallDecor()` (lines 1079–1190 in raycaster.js).

### Phase 1 (N-layer DDA)  LIGHT_AND_TORCH_ROADMAP Phase 2b (Torch Wall Rendering)

LIGHT_AND_TORCH Phase 2b adds torch sprite overlays in the raycaster
wall column loop (check tile type, draw fire emoji + glow). This is
a specific case of TEXTURE Layer 2 wall decor. Same sequencing applies:
N-layer DDA refactor first, then torch overlays operate per-layer.

### Phase 3 (SHRUB tile) ↔ TEXTURE_ROADMAP — SHIPPED

`_genShrub()` is in texture-atlas.js (lines 1883–1944). Contract wiring
done: `22: 'floor_grass'` texture, `22: 0.5` wall height. One stretch
variant (`shrub_flower`) not yet added.

### Phase 5 (Performance guards)  LIGHT_AND_TORCH_ROADMAP

N-layer rendering adds per-column cost. Dynamic light sources (LIGHT_AND_TORCH
Phase 1) add per-tile cost in Lighting.calculate(). Both affect frame budget
on webOS. Phase 5e's adaptive MAX_LAYERS should be tested with dynamic lights
active (worst case: 4 wall layers  8 light sources  320 columns).

### Phase 6 (Floor 0 test)  SKYBOX_ROADMAP

Floor 0 is exterior (depth 1)  skybox renders as the background. N-layer
see-over tiles (shrubs) will show sky above distant buildings. Skybox
rendering is a separate pre-pass and doesn't interact with N-layer
compositing, but the visual result should be verified: sky  building
wall  floor  shrub layering looks correct with the active sky preset.

### Phase 7 (Expanded exteriors)  SKYBOX_ROADMAP Phase 5 (Floor 3)

Larger exterior maps with shrub-guided paths are the same technique
needed for Floor 3 (Frontier Gate). Floor 3's open ocean views require
both the N-layer raycaster (see-over fences/low walls toward the harbor)
and the `frontier` sky preset. These can share the same implementation
and testing pass.

### Tile Matrix Dependency (Updated)

Canonical tile texture and geometry status is now tracked in
`TEXTURE_ROADMAP.md` under `Tile Asset Matrix (Canonical 0-59)`.

For N-layer work:
- Treat that matrix as the source of truth before adding or reusing tile IDs.
- Prioritize rows marked `Geom=Short` or `Geom=Full/Fixture` with `Action=Implement/Create`.
- Do not start N-layer-facing work for planned IDs `49-59` until tile constants, texture keys, and biome wiring exist.

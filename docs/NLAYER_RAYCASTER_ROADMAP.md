# N-Layer Raycaster Roadmap
## See-Over Tiles, Floor Visibility, and Shrub-Guided Exteriors

**Goal**: Replace the 2-layer background-fill hack with a proper N-layer
compositing raycaster that renders floor between wall layers, enabling
half-height "see-over" tiles (shrubs, fences, low walls) that show
textured ground and distant buildings above them. This makes exterior
maps 3× bigger while visually guiding players to shops and exits
without dead space.

**Jam deadline**: April 5, 2026 (8 days)

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

### Wall column pass internals (per column)

```
1. DDA traversal → first solid hit (WALL, PILLAR, TREE, DOOR, BREAKABLE)
2. Background continuation (NEW — just added):
   - If contract has tileWallHeights, continue DDA up to 12 steps
   - Record first taller solid tile as _bgWall
3. Compute foreground: perpDist, wallHeightMult, lineHeight, drawStart/drawEnd
4. Render background gap: if _bgWall exists, draw bg wall texture in
   [bgDrStart .. drawStart-1] gap above foreground
5. Render foreground wall: texture or flat-color, fog, brightness, side shade
```

### The problem with the current bg-fill

The gap above a short foreground wall gets filled with the **background
wall's texture**. But physically, the player should see **floor tiles**
between the shrub and the distant building — not the building's wall
starting immediately above the shrub. At distance it's subpixel and
invisible. Up close to a shrub, the building wall appears to grow
directly out of the shrub top with no ground between them.

For "competing with Unity canned assets" quality, we need the floor
to show through in that gap zone.

### Floor casting architecture

`_renderFloor()` is a **pre-pass**: it runs before the wall column loop,
filling the entire bottom half of the screen with textured floor via a
reusable `ImageData` buffer. The wall column loop then **overdraws** the
floor wherever walls are visible.

This means: the floor is already there, behind the wall columns. If we
simply **don't overdraw** the floor in the gap between two wall layers,
the pre-pass floor texture shows through naturally. The key insight is
that the floor pre-pass handles all floor rendering — we don't need
per-column floor casting. We just need to be careful about what we
overdraw and what we leave alone.

---

## 2. Design: N-Layer Column Compositing

### Layer model

Each column can have up to N wall hits at increasing distances. We
collect them front-to-back, then render **back-to-front** (painter's
algorithm within the column).

```
Layer 0 (closest): SHRUB at 0.5× — covers bottom ~15% of column
Layer 1 (middle):  TREE at 2.5×  — covers bottom ~60% of column
Layer 2 (far):     WALL at 3.5×  — covers bottom ~80% of column
```

Back-to-front rendering:
1. Layer 2 (WALL) renders its full strip → overwrites floor pre-pass
2. Layer 1 (TREE) renders its full strip → overwrites lower portion of WALL
3. Layer 0 (SHRUB) renders its full strip → overwrites lower portion of TREE

Result: SHRUB at bottom, TREE visible above it, WALL visible above
that, sky above the WALL. Floor is visible in any column-region that
no layer covers (i.e., between layer tops where the pre-pass floor
shows through).

**Wait — does floor actually show through?**

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
exists — and that's already handled by the floor pre-pass (the wall
column loop simply doesn't overdraw that region).

**Revised analysis**: The floor pre-pass fills the entire bottom half.
Walls overdraw from `drawStart` to `drawEnd`. Any screen pixel between
`drawStart` of the tallest layer and the horizon that isn't covered by
any wall layer **already shows the floor pre-pass**. The floor IS
visible — we just need to make sure we don't accidentally overdraw it
with sky or background wall texture in the gap.

### The actual gap problem

With the current bg-fill, the gap `[bgDrStart .. fgDrawStart-1]` is
filled with background wall texture. This is wrong when that gap
overlaps with the floor region (below the horizon). The correct
rendering:

```
Screen column breakdown (bottom to top):
  drawEnd → screen bottom:  floor pre-pass (already correct)
  drawStart → drawEnd:      foreground wall (SHRUB texture)
  horizon → drawStart:      this is the critical zone
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

### Phase 1: Refactor bg-fill → N-layer hit collector

**File**: `raycaster.js`
**Estimated time**: 45 min

Replace the current `_bgWall` single-hit system with an array that
collects all solid hits along the ray, front-to-back.

```javascript
// Replace current bg-wall detection with:
var _hits = [];  // { mx, my, sd, tile, wh, perpDist }

// After first DDA hit, if contract has tileWallHeights:
//   Continue DDA, collecting ALL solid hits up to MAX_LAYERS (4)
//   Each hit records: grid coords, side, tile type, wall height
//   Stop when MAX_LAYERS reached or renderDist exceeded

var MAX_LAYERS = 4;  // shrub → pillar → tree → building
var _BG_MAX_STEPS = 16;
```

After the DDA loop, compute perpDist and wall geometry for ALL hits.
Store as an array of layer descriptors.

**Back-to-front render**: iterate `_hits` in reverse (farthest first).
Each layer renders its full textured strip from `drawStart` to
`drawEnd`. Closer layers overdraw farther layers naturally.

The z-buffer gets the **closest** hit's perpDist (for sprite occlusion).

Key change: **remove the explicit gap-fill code entirely**. Back-to-front
painter's algorithm + floor pre-pass = correct compositing with zero
gap logic.

### Phase 2: Per-column floor casting between wall layers

**File**: `raycaster.js`
**Estimated time**: 1.5 hr
**This is the hard phase.**

The floor pre-pass paints the floor assuming baseWallH for the distance
calculation (`rowDist = halfH * baseWallH / rowFromCenter`). This means
the floor texture is correct for the default wall height. But with
tileWallHeights, the floor-to-wall boundary shifts:

- A 3.5× wall's drawEnd is at the same screen Y as the floor pre-pass
  (because both use the same baseWallH for the floor plane).
  Wait — drawEnd uses `flatBottom = halfH + baseLineH/2` where
  baseLineH = `h * baseWallH / perpDist`. And the floor pre-pass
  computes `rowDist = halfH * baseWallH / rowFromCenter`. These are
  the same equation inverted. So **the floor pre-pass and wall drawEnd
  are already aligned**. Any gap between two walls naturally shows the
  correct floor texture.

**Verification**: If SHRUB (0.5×) is at distance 3 and WALL (3.5×) is
at distance 8:
- SHRUB drawEnd: `halfH + floor(h * 1.0 / 3) / 2` ← floor plane
- WALL drawEnd: `halfH + floor(h * 1.0 / 8) / 2` ← floor plane
- Floor pre-pass at the screen row between these two drawEnds:
  `rowDist = halfH * 1.0 / (screenY - halfH)` — this computes the
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

### Phase 3: SHRUB tile type + texture + contract wiring

**Files**: `tiles.js`, `texture-atlas.js`, `spatial-contract.js`,
          `floor-manager.js`
**Estimated time**: 1 hr

3a. **tiles.js** — Add SHRUB constant:
```javascript
SHRUB: 22   // Half-height vegetation — blocks movement, see-over
```
- `isWalkable`: false (blocks movement → guides player)
- `isOpaque`: true (blocks minimap LOS)
- NOT a door type

3b. **texture-atlas.js** — Add `_genShrub()` procedural texture:
- Bottom 60%: dense tangled branches (brown/dark green)
- Top 40%: leafy canopy with irregular top edge (varied greens)
- Reads similar to tree_trunk but shorter, bushier, more horizontal
  branching pattern
- Also add `shrub_flower` variant (same base + pink/white dot scatter)
  for visual variety in guided paths

3c. **spatial-contract.js** — No changes needed (tileWallHeights and
textures are passed through from biome overrides, not hardcoded)

3d. **floor-manager.js** — Add to exterior/promenade biome overrides:
```javascript
textures: { ..., 22: 'shrub' },
tileWallHeights: { ..., 22: 0.5 }  // Half-height: player sees over
```

3e. **raycaster.js DDA** — Add SHRUB to hit detection:
```javascript
if (tile === TILES.WALL || tile === TILES.PILLAR ||
    tile === TILES.BREAKABLE || tile === TILES.TREE ||
    tile === TILES.SHRUB) {
  // solid hit
}
```

### Phase 4: Ceiling gap handling for see-over tiles

**File**: `raycaster.js`
**Estimated time**: 30 min

When the player looks over a shrub at a distant building:
- Below horizon: floor pre-pass (correct)
- Shrub region: shrub texture (correct)
- Between shrub top and building: sky/parallax pre-pass (correct — IF
  no back-to-front layer overwrites it)

In the back-to-front scheme, the farthest layer (building at 3.5×)
renders first, filling its strip from `drawStart` to `drawEnd`. This
strip extends above the horizon into the sky region. The Skybox/ceiling
pre-pass already painted the sky there. The building wall correctly
overwrites the sky only where the building is visible.

Then the shrub layer renders on top, covering its portion. The region
between the shrub top and the building bottom that isn't covered by
either layer shows... the sky pre-pass. But it SHOULD show the building
wall there.

Wait — the building's strip extends from `bgDrStart` (far above shrub)
down to `bgDrEnd` (floor level). The shrub's strip extends from
`fgDrStart` to `fgDrEnd`. The shrub overdraw only covers
`[fgDrStart, fgDrEnd]`. The building's `[bgDrStart, fgDrStart-1]` region
was painted in the first pass and is NOT overwritten by the shrub.
So the building IS visible above the shrub. Correct!

**Phase 4 may also be unnecessary.** The back-to-front painter's
algorithm handles this correctly. The sky pre-pass is only visible where
no wall layer's strip covers a pixel.

**TODO**: Verify empirically. Mark this phase as "verify only."

### Phase 5: Performance guard — skip layers when off-screen

**File**: `raycaster.js`
**Estimated time**: 30 min

Optimizations for the N-layer system on webOS hardware:

5a. **Early-out on tileWallHeights**: Only enter the multi-hit DDA
continuation if the contract has `tileWallHeights` (already implemented).
Floors without height variation have zero overhead.

5b. **Skip off-screen layers**: Before rendering a back layer, check if
its entire strip `[drawStart, drawEnd]` is fully occluded by the front
layer. If `bgDrStart >= fgDrStart`, the back layer is completely hidden
and can be skipped.

5c. **Limit continuation distance**: Cap the bg DDA continuation to
`_BG_MAX_STEPS = 16`. Any wall beyond 16 steps from the foreground hit
is too distant and fogged to matter visually.

5d. **Profile on webOS**: Time the column loop with `performance.now()`
across 100 frames. Target: <8ms for 320-column render at 30fps.
Budget per column: 25μs. Each extra layer adds ~3μs (perpDist calc +
texture drawImage). At 4 layers max, worst case is 12μs extra = 37μs/col.
320 columns × 37μs = 11.8ms. Tight but feasible at 30fps.

5e. **Adaptive layer count**: If frame time exceeds 12ms, reduce
MAX_LAYERS from 4 → 2 for the next frame (and log to console). This
lets large maps degrade gracefully on weak webOS hardware.

### Phase 6: Floor 0 integration test — shrub-guided courtyard

**File**: `floor-manager.js`
**Estimated time**: 1 hr

Redesign Floor 0 grid to use SHRUB tiles as wayfinding guides:

```
Current 20×16 grid → expand to 40×32 (or keep 20×16 for first test)
```

Test layout for the existing 20×16 grid:
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

- Expand Floor 0 from 20×16 → 40×32 or 60×48
- Shrub hedgerows create garden maze paths to shops/exits
- Open sight-lines over shrubs to distant buildings (wayfinding)
- TREE perimeter expands to fill the larger boundary
- DDA renderDist may need increase from 16 → 24 for larger maps
- Floor casting pre-pass cost scales with screen pixels (constant)
  but DDA cost scales with map size (linear per ray)

---

## 4. Critical Insight: Floor Pre-Pass Is Already Correct

The biggest realization from analyzing the code:

**The floor pre-pass (`_renderFloor`) already paints correct floor
texture in every pixel below the horizon.** It doesn't know about walls
— it just computes floor world position per pixel and samples the
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

## 6. Dependency Order

```
Phase 1 (N-layer collector + back-to-front render)
  ↓
Phase 3 (SHRUB tile + texture)  ←  can start in parallel after Phase 1 DDA change
  ↓
Phase 5 (Performance guards)
  ↓
Phase 6 (Integration test on Floor 0)
  ↓
Phase 4 (Verify ceiling gaps — likely no-op)
```

Phase 2 (per-column floor casting) is **deferred** — only needed if
empirical testing reveals floor pre-pass inadequacy.

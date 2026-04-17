# Rung 2C — 3D Viewport Floor Decal Spec

**Created**: 2026-04-17 | **Status**: Contractor spec, ready for implementation
**Parent**: `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` §5 (Rung 2C) and §11.3 (rendering choice)
**Companion**: `PRESSURE_WASH_SYSTEM.md` (current shipped state), `PRESSURE_WASHING_ROADMAP.md` §11 (Rung ladder supersedes PW-4/PW-5 plan)
**Prerequisites shipped**: Rung 2A (HoseDecal ledger), Rung 2B (minimap stripe renderer)
**Feel-check gate**: Rungs 2A+2B must read cleanly at 160×160 minimap before this ships — if edge-midpoint joints look ragged or the U-turn stub reads like a wart, tune the minimap version before committing to the 3D work.

---

## 1. Goal (one-liner)

Render the player's entire hose path as a cyan-green stripe decal on the 3D viewport floor, visible behind the player as they laid it, at a per-frame cost cheap enough that **no distance culling is required**. Memory is fixed-shape per tile and bounded by path length, not screen count.

---

## 2. What ships

- A new `Uint8Array` bitmap cache owned by `HoseDecal`, one bitmap per visited tile, at 16×16 subcells × 2 channels (coverage + intensity, 512 bytes/tile).
- A single rasterization primitive `_paintStripe(bmp, fromEdge, toEdge, intensity)` that handles all six visit shapes via endpoint geometry.
- Incremental writes on every HoseState step; full per-tile rebuild on pop (reel-up) and on rare topology changes.
- A ~25-line block added to `raycaster-floor.js` inside the per-pixel floor loop, structurally identical to the existing grime branch at lines 347–365. Uses the same tile-boundary cache (`prevTileGX/prevTileGY`) so lookup cost is amortized across the row.
- Age-derived brightness falloff computed in the floor sampler from a per-tile `visitIndexAtPaint` scalar snapshot, not stored in the bitmap.
- Pressure (kink) derived brightness applied as a global multiplier, snapshotted once per `renderFloor` call.
- A Node-side test harness (`outputs/hose-decal-raster-test.js`) exercising the 6 visit shapes + seamless-edge adjacency + pop-rebuild correctness.

## 3. What does NOT ship in 2C

- Flow-propagation simulation (channel 1 is allocated but stays at 0 or mirrors coverage; no decay/propagation tick runs in 2C — reserved for Rung 2E).
- Gameplay effect from crossed tiles (Rung 2E — cosmetic stripe thickening on cross OK, mechanical bite is out).
- Enemy/door pinching of hose tiles (Rung 2E).
- Detached hose / hose as independent entity (post-jam).
- Wall decals (hose is floor-only at this rung).
- Distance culling or tile-radius gate around the player — **removed from scope on the 2026-04-17 design pass; full-path rendering is the contract.**

---

## 3. Architecture decisions (locked on 2026-04-17)

| Decision | Choice | Rationale |
|---|---|---|
| Bitmap resolution | **16×16** | Matches wall-grime density; ≥3-subcell stripe width reads cleanly; 24/32 bump only if aliasing warrants it post-ship. |
| Channels | **2 (coverage + intensity)** | Committed now to avoid rewrite when Rung 2E/2F add flow simulation. Channel 1 is painted to 0 in 2C (or mirrors coverage — implementation-team call) but is architecturally reserved. |
| Byte layout | **Interleaved** — `data[(y*res + x)*2 + c]` | One sequential memory read fetches both channels; planar would split them 256 bytes apart at 16×16 and burn the L1 fetch. |
| Bitmap ownership | **HoseDecal (Layer 1)** | The ledger and its rasterized view live in the same module — mutation points are already there. No new Layer 2 consumer needed. |
| Rasterization | **Incremental writes on step, full rebuild on pop** | Step fires one `_paintStripe` call; pop invokes `_rebuildTile` against the remaining visits. Max-combine on channel 0 makes step writes idempotent, so crossings compose naturally. |
| Stripe primitive | **Thickened DDA line segment, no Béziers** | At 16×16 sub-pixel precision, a thick polyline through `edge → center → edge` rasterizes indistinguishably from a Bézier and is 3× cheaper to compute. Shape dispatch (straight / elbow / U-turn / stub / seed) is handled by endpoint selection, not by separate rasterizers. |
| Floor sampler integration | **Inline block after grime branch** | Pattern mirrors grime exactly: tile-boundary cache, sub-cell UV lookup, `r/g/b` alpha blend into the ImageData buffer. No canvas composite pipeline, no `ctx.drawImage`. |
| Fog application | **Applied normally via existing `invFog`/`rowFog`** | Hose stripes fade with fog same as everything else — bright near player, dims behind. Doubles as free gameplay feedback. |
| Age-derived brightness | **Computed in floor sampler, not stored in bitmap** | Per-tile `visitIndexAtPaint` scalar subtracted from per-frame head index snapshot; floor sampler computes falloff. Keeps bitmap a pure rendering asset and avoids periodic rebake of all visited tiles. |
| Kink-derived brightness | **Global multiplier, snapshotted per frame** | `pressureMult = HoseState.getPressureMult()` read once at `renderFloor` entry. Applied alongside the age multiplier. |
| Slab packing / memory pooling | **Deferred** | 200-tile footprint is 100 KB — fits L2 on every target SoC. Reopen if we go multi-hose (co-op) or procgen maps >32×32. |

---

## 4. Data model

### 4.1 The per-tile bitmap

```js
// HoseDecal-internal, one per visited tile
{
  data: Uint8Array(HOSE_RES * HOSE_RES * 2),  // interleaved (cov, int)
  visitIndexAtPaint: Number,                   // scalar — monotonic head index
                                               // when this tile was most recently touched
  dirty: false                                 // true → needs rebuild on next getBitmap()
}
```

Constants in `hose-decal.js`:

```js
var HOSE_RES = 16;                 // subcells per tile axis
var HOSE_STRIPE_HALFW = 2;         // subcells — half-width of the stripe mask (4-wide)
var HOSE_STUB_DEPTH = 6;           // subcells — how far a U-turn / head-stub penetrates
```

### 4.2 Cache storage

Add to HoseDecal's existing `_floors[floorId][tileKey]` tile record:

```js
{
  visits: [...],
  crossCount: n,
  // new fields for 2C:
  bmp: null,                         // lazy — created on first getBitmap() call
  visitIndexAtPaint: -1,             // tracks the head snapshot at last rebuild
  dirty: true                        // initially dirty; flipped false by _rebuildTile
}
```

Tile records with zero visits stay on the existing prune path — the bmp pointer drops with them.

### 4.3 Per-floor head index

HoseDecal already tracks `_nextVisitIndex` (monotonic). The "head visit index" for a floor is `_visitSequence[_visitSequence.length - 1].visitIndex` when `visitSequence` is non-empty. Expose a new `getHeadVisitIndex(floorId)` that returns the max visitIndex across that floor's tile records, or `-1` if no visits.

### 4.4 Memory budget

| Path length | Per-tile bytes (bmp + scalars) | Total |
|---|---|---|
| 50 tiles | 520 | 26 KB |
| 200 tiles | 520 | 104 KB |
| 500 tiles | 520 | 260 KB |

500-tile footprint is a worst-case upper bound — a full-zigzag 24×24 dungeon visits at most 576 tiles, and `clearFloor()` drops the whole floor's allocation on detach. Well inside the Layer 1 budget.

---

## 5. HoseDecal API additions

### 5.1 Public

```js
/**
 * Get the rasterized 16×16×2 bitmap for a tile, or null if that tile
 * has no visits on this floor. Lazily rebuilds on first call after
 * mutation; otherwise returns the cached reference.
 *
 * Returned object is owned by HoseDecal — callers must not mutate.
 *
 * @param {string} floorId
 * @param {number} x, y - tile grid coordinates
 * @returns {{data: Uint8Array, visitIndexAtPaint: number} | null}
 */
function getBitmap(floorId, x, y) { ... }

/**
 * Per-floor maximum visitIndex. Used by floor sampler to compute
 * age-since-head per tile. Returns -1 if the floor has no visits.
 *
 * @param {string} floorId
 * @returns {number}
 */
function getHeadVisitIndex(floorId) { ... }
```

Expose both in the frozen return block.

### 5.2 Internal

```js
/**
 * Paint a single visit's stripe into the tile bitmap using max-combine.
 * Idempotent — calling twice with the same args leaves the bitmap unchanged.
 *
 * fromEdge / toEdge are direction indices 0..3 (E/S/W/N) or -1 for
 * "open end" (origin seed has both -1; head stub has exit = -1; tail
 * stub has entry = -1).
 */
function _paintStripe(bmp, fromEdge, toEdge, intensity) { ... }

/**
 * Rebuild a tile's bitmap from its full visit list. Called on pop,
 * on the rare visit-list edit, and lazily when `dirty` is set.
 */
function _rebuildTile(tileRec) { ... }

/**
 * Bump visitIndexAtPaint on the head tile. Called from _appendStep
 * after a new visit lands. Uses the current _nextVisitIndex.
 */
function _markHeadPainted(tileRec, visitIndex) { ... }
```

---

## 6. Rasterization — the `_paintStripe` primitive

### 6.1 Edge-midpoint table (16×16)

```js
// Direction index → tile-local subcell coordinate of the edge midpoint.
// Order: 0=E, 1=S, 2=W, 3=N. CLAUDE.md direction convention.
var EDGE_PT = [
  { x: HOSE_RES - 1, y: HOSE_RES >> 1 },  // E — right edge, mid row
  { x: HOSE_RES >> 1, y: HOSE_RES - 1 },  // S — bottom edge, mid col
  { x: 0,             y: HOSE_RES >> 1 }, // W — left edge, mid row
  { x: HOSE_RES >> 1, y: 0 }              // N — top edge, mid col
];
var CENTER_PT = { x: HOSE_RES >> 1, y: HOSE_RES >> 1 };  // (8, 8)
```

### 6.2 Shape dispatch (via endpoint selection)

| `fromEdge` | `toEdge` | Visual meaning | Endpoints fed to raster |
|---|---|---|---|
| -1 | -1 | Origin seed (truck, no motion) | `_paintDisc(CENTER_PT, HOSE_STRIPE_HALFW + 1, intensity)` |
| -1 | `d` | Tail stub (start of strand) | Line `CENTER_PT → EDGE_PT[d]` |
| `d` | -1 | Head of hose (player here now) | Line `EDGE_PT[d] → CENTER_PT` + pulse halo flag |
| `d` | `(d+2) % 4` | Straight through | Line `EDGE_PT[d] → EDGE_PT[oppositeD]` |
| `d` | `d` | U-turn | Line `EDGE_PT[d] → stubPt` where `stubPt` sits `HOSE_STUB_DEPTH` subcells inward along the inward normal |
| `d` | `e` (perpendicular) | 90° elbow | Two lines: `EDGE_PT[d] → CENTER_PT` and `CENTER_PT → EDGE_PT[e]` |

The "head pulse halo" is **not** written into the bitmap — it's a render-time effect handled in the floor sampler using `visitIndexAtPaint === headVisitIndex` as the gate. Keeps the bitmap purely geometric.

### 6.3 The thickened-line rasterizer

```js
function _paintLine(bmp, x1, y1, x2, y2, halfW, intensity) {
  var dx = x2 - x1, dy = y2 - y1;
  var len = Math.max(Math.abs(dx), Math.abs(dy));
  if (len === 0) { _paintDisc(bmp, x1, y1, halfW, intensity); return; }
  var stepX = dx / len, stepY = dy / len;
  var halfWSq = halfW * halfW;

  for (var t = 0; t <= len; t++) {
    var cx = x1 + stepX * t;
    var cy = y1 + stepY * t;

    var minX = Math.max(0, Math.floor(cx - halfW));
    var maxX = Math.min(HOSE_RES - 1, Math.ceil (cx + halfW));
    var minY = Math.max(0, Math.floor(cy - halfW));
    var maxY = Math.min(HOSE_RES - 1, Math.ceil (cy + halfW));

    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var ddx = x - cx, ddy = y - cy;
        if (ddx * ddx + ddy * ddy > halfWSq) continue;  // circle mask
        var idx = (y * HOSE_RES + x) * 2;
        if (bmp[idx    ] < intensity) bmp[idx    ] = intensity;  // coverage
        if (bmp[idx + 1] < intensity) bmp[idx + 1] = intensity;  // intensity (mirrors for 2C)
      }
    }
  }
}

function _paintDisc(bmp, cx, cy, r, intensity) {
  // Same kernel with t-loop of length 1
  _paintLine(bmp, cx, cy, cx, cy, r, intensity);
}
```

Cost per full-tile straight stripe: ~16 t-steps × ~25 subcells/step = 400 ops. U-turn is ~half that. Completely negligible per mutation.

### 6.4 Edge-midpoint adjacency invariant (3D)

At 16×16 with stripe half-width 2, a stripe terminating at tile A's east edge paints subcells `(x=15, y∈{6,7,8,9})`. Tile B one tile east paints its west edge at `(x=0, y∈{6,7,8,9})`. When the floor sampler crosses from A to B at world-y = tile-y + 8.0/16 = 0.5, it reads subcell y=8 on both sides — the same rows fetched on both halves of the seam, so the stripe is unbroken. **Carry over the adjacency assertion from `outputs/hose-overlay-test.js` into the raster harness.**

---

## 7. Floor sampler diff — `engine/raycaster-floor.js`

### 7.1 Insertion point

The hose block slots in **right after** the grime branch (current lines 347–372, between `cachedFloorGrime` handling and the `// Apply fog` comment at line 376). Uses the same `prevTileGX`/`prevTileGY` cache — extend it with hose-side fields.

### 7.2 Per-row snapshot additions

Add near line 177 (next to `bloodFloorId`):

```js
var hoseFloorId = (typeof HoseDecal !== 'undefined') ? bloodFloorId : null;
var hoseHeadIdx = hoseFloorId ? HoseDecal.getHeadVisitIndex(hoseFloorId) : -1;
var hosePressure = (typeof HoseState !== 'undefined' && HoseState.getPressureMult)
  ? HoseState.getPressureMult() : 1.0;
var HOSE_R = 40, HOSE_G = 220, HOSE_B = 200;   // cyan-green stripe color
var HOSE_HEAD_R = 140, HOSE_HEAD_G = 255, HOSE_HEAD_B = 230;  // head pulse tint
var HOSE_AGE_FALLOFF_STEPS = 30;   // hose fades to floor over 30 visits behind head
var HOSE_MIN_BRIGHT = 0.28;        // floor brightness past the falloff tail
```

Yes, we're reusing `bloodFloorId` as the decal floor id — same conceptual anchor (current CleaningSystem floor == current playable floor). Rename the module-level snapshot if it reads awkwardly; don't duplicate the fetch.

### 7.3 Per-tile cache extension

Extend the cache invalidation block at lines 339–345:

```js
if (tileGX !== prevTileGX || tileGY !== prevTileGY) {
  cachedBlood       = CleaningSystem.getBlood(tileGX, tileGY, bloodFloorId);
  cachedFloorGrime  = _hasGrimeGrid ? GrimeGrid.get(bloodFloorId, tileGX, tileGY) : null;
  cachedHoseBmp     = hoseFloorId ? HoseDecal.getBitmap(hoseFloorId, tileGX, tileGY) : null;
  cachedHoseAgeMul  = 1.0;  // computed below when cachedHoseBmp != null
  if (cachedHoseBmp) {
    var age = hoseHeadIdx - cachedHoseBmp.visitIndexAtPaint;
    var ageLerp = 1 - Math.min(1, age / HOSE_AGE_FALLOFF_STEPS);
    cachedHoseAgeMul = HOSE_MIN_BRIGHT + (1 - HOSE_MIN_BRIGHT) * ageLerp;
    cachedHoseIsHead = (age === 0);
  }
  prevTileGX = tileGX;
  prevTileGY = tileGY;
}
```

### 7.4 Per-pixel hose block

Inserted after the grime `if/else` block closes (after line 372, before the `// Apply fog` comment on line 376):

```js
// ── Hose decal (Rung 2C) — floor-painting visit stripe ──
// Bitmap is 16×16×2 interleaved (coverage, intensity). Coverage gates
// the blend; intensity is the raster strength (255 on the stripe body,
// 0 off it). Age and kink multipliers are per-tile / per-frame.
if (cachedHoseBmp) {
  var hx = Math.floor(floorFracX * HOSE_RES);
  var hy = Math.floor(floorFracY * HOSE_RES);
  if (hx >= HOSE_RES) hx = HOSE_RES - 1;
  if (hy >= HOSE_RES) hy = HOSE_RES - 1;
  if (hx < 0) hx = 0;
  if (hy < 0) hy = 0;
  var hIdx = (hy * HOSE_RES + hx) * 2;
  var hCov = cachedHoseBmp.data[hIdx];
  if (hCov > 0) {
    var hStrength = (hCov / 255) * cachedHoseAgeMul * hosePressure;
    var hrC = cachedHoseIsHead ? HOSE_HEAD_R : HOSE_R;
    var hgC = cachedHoseIsHead ? HOSE_HEAD_G : HOSE_G;
    var hbC = cachedHoseIsHead ? HOSE_HEAD_B : HOSE_B;
    r = r * (1 - hStrength) + hrC * hStrength;
    g = g * (1 - hStrength) + hgC * hStrength;
    b = b * (1 - hStrength) + hbC * hStrength;
  }
}
```

Note that `floorFracX`/`floorFracY` are already computed inside the grime branch at lines 350–351. They need to be hoisted above both grime and hose blocks so either can consume them. Trivial refactor — single-line scope change.

### 7.5 Fog

**Nothing to do.** The existing `if (rowFog > 0.01)` block at line 376 applies *after* our hose blend, so hose naturally fades with fog identically to floor texture and grime. Bright near player, dim at distance — zero additional code.

### 7.6 Wall decals

Out of scope for 2C — hose is floor-only. `_drawTiledColumn` in `raycaster.js` is untouched. Wall decals (if we ever want them) would be a Rung 2G / post-jam addition.

---

## 8. Intensity derivation (Rung 2C form)

For 2C, channel 1 of the bitmap **mirrors channel 0** — `_paintStripe` writes the same value to both. The floor sampler only reads channel 0 (`hIdx`, not `hIdx + 1`). This is intentional:

- Channel 1 is reserved for Rung 2E's flow-propagation state. Writing `cov` there now costs one extra `bmp[i+1] = v` per raster pixel and guarantees the channel is initialized when 2E lights up.
- The age-based brightness falloff is computed per-tile in the floor sampler from `visitIndexAtPaint`, not from channel 1. Keeps the bitmap a pure rendering asset — no periodic rebake of all tiles as the head advances.

When Rung 2E lands:
- Channel 0 stays immutable once laid (coverage is player-history).
- Channel 1 becomes the live pressure field — driven by a propagation tick from the truck outward, decayed on crossings, zeroed on pinch.
- The floor sampler sources brightness from channel 1 * age-mult * pressure-mult. Age-mult becomes optional or merges into channel 1 semantics.

This staging means 2C ships without any simulation loop while the data shape is already correct for 2E.

---

## 9. Wiring & load order

### 9.1 index.html

No new `<script>` tag. `HoseDecal` is already loaded at Layer 1 (it shipped with Rung 2A). The new exports (`getBitmap`, `getHeadVisitIndex`) attach to the existing frozen return object.

### 9.2 HoseState event hooks

Already wired in Rung 2A via `_wireHoseState()`. No changes. The existing `_appendStep` / `_popLast` / `_clear` call sites get the new raster calls injected:

```js
function _appendStep(nx, ny, nfloorId) {
  // ... existing ledger-mutation code ...

  // NEW — Rung 2C: incremental raster of the two tiles whose shape
  // just changed (the previous head, whose exit edge is now filled in,
  // and the new head, whose entry edge just came alive).
  if (prevHeadTileRec) {
    _paintStripe(_getOrInitBmp(prevHeadTileRec),
                 prevEntryDir,   // entry of the previous visit (unchanged)
                 exitDirToNewTile,
                 255);
    prevHeadTileRec.visitIndexAtPaint = prevVisitIndex;
  }
  var newTileRec = _getOrMakeTile(nfloorId, _tileKey(nx, ny));
  _paintStripe(_getOrInitBmp(newTileRec),
               entryDirFromPrevTile,
               -1,  // head — no exit yet
               255);
  newTileRec.visitIndexAtPaint = newVisitIndex;
  _bump();
}

function _popLast() {
  // ... existing pop code ...

  // NEW — Rung 2C: the tile we just popped from (the old head) has
  // one fewer visit; the tile BEFORE it (now the new head) had its
  // exit filled in before, needs it un-filled. Simplest path:
  // full _rebuildTile on both affected tiles.
  if (oldHeadTileRec) _rebuildTile(oldHeadTileRec);
  if (newHeadTileRec) _rebuildTile(newHeadTileRec);
  _bump();
}
```

`_getOrInitBmp(tileRec)` allocates the `Uint8Array` on first access and returns `tileRec.bmp`. `_rebuildTile` zeros the bitmap, iterates `tileRec.visits`, and calls `_paintStripe` once per visit.

### 9.3 Raycaster bind block

No changes. `raycaster-floor.js` already uses `typeof HoseDecal !== 'undefined'` style guards for GrimeGrid — same pattern for HoseDecal. The binding mechanism at `raycaster.js` line ~(Raycaster core bind) is untouched.

---

## 10. Test harness

### 10.1 `outputs/hose-decal-raster-test.js`

Parallels `outputs/hose-decal-test.js` (Rung 2A, 35/35) and `outputs/hose-overlay-test.js` (Rung 2B, 27/27). Node-runnable, no DOM.

Required assertions (target: 25+):

| Test | Asserts |
|---|---|
| `paintStripe straight E→W` | Row y=8 at columns 0..15 all have cov=255; rows 0..5 and 11..15 all 0 |
| `paintStripe elbow W→N` | Column 8 rows 0..8 filled, row 8 columns 0..8 filled, other quadrants empty |
| `paintStripe U-turn E→E` | Column 15 rows 6..9 filled; fill tapers to ~col 9 rows 6..9 (stub depth) |
| `paintStripe seed (both null)` | Disc at center; no edge pixels |
| `paintStripe head stub (toEdge=-1, fromEdge=W)` | Cols 0..8 row 8 filled; cols 9..15 empty |
| `paintStripe is idempotent` | Second call with same args produces bit-identical bitmap |
| `paintStripe max-combines` | Two different stripes into same tile → both shapes visible |
| `_rebuildTile after pop` | Paint straight + elbow; pop elbow visit; elbow pixels gone, straight pixels retained |
| Adjacency invariant E↔W | Tile A east edge y=8 cov == tile B west edge y=8 cov after two straight steps |
| Adjacency invariant S↔N | Same as above on the perpendicular axis |
| `getHeadVisitIndex` | Returns max visit index across the floor; -1 on empty |
| `visitIndexAtPaint` updates | After 5 steps, head tile index is 5; 3-behind-head tile index is 2 |
| `clearFloor` drops bitmaps | All tile records on that floor gone; other floors untouched |

### 10.2 Visual feel-check

Launch the game via the Rung 0 test harness (`hose=1&nozzle=fan&grime=1&hoseInf=1`) on floors 2.2 → 2.2.1 → 2.2.2. Walk a recognizable shape (U, spiral, zigzag with crossings). Confirm:

- Stripe reads as a clear cyan-green line under the player's feet
- Turns look like elbows, not blobs
- Head-of-hose tile pulses brighter than trail
- Fog fades the far end correctly
- Crossings show overlapping stripes (the "X" on minimap translates to a composed-stripe shape on the floor)
- No flicker / no strobe as player walks

---

## 11. Perf gate

### 11.1 Target

**≤1.0 ms added per frame at 960×540 on Hero's Wake B2 with a 100-tile hose trail visible.** Tighter than the brief's original 1.5 ms budget — possible because we dropped the Canvas2D composite path entirely.

### 11.2 Measurement protocol

1. Ship Rung 2C with a feature flag `HoseDecal._RUNG_2C_RENDER` defaulting to true.
2. In the test harness, add a `t-hose3DOff` toggle that sets the flag to false.
3. Capture 30-second frametime samples on 2.2.2 (deepest current dungeon) with:
   - Flag ON, no hose (`hose=0`) — baseline
   - Flag ON, 100-tile hose visible — measurement
   - Flag OFF, 100-tile hose in state — verify flag actually gates it
4. Use `engine/debug-perf-monitor.js` rolling average (already exists).
5. Delta between the two ON cases must be ≤1.0 ms at 50th percentile, ≤2.0 ms at 99th percentile.

### 11.3 Fallback if we blow the budget

In priority order:

1. **Drop the intensity-channel write from `_paintLine`** — saves one `bmp[i+1] = v` per raster pixel. Costs us ~10% raster throughput, buys nothing at runtime since 2C doesn't read it anyway.
2. **Skip the hose block entirely for `rowFog > 0.7`** — fog-washed tiles at the edge of visibility contribute almost nothing and can early-out. Two-line patch at the top of the per-pixel hose block.
3. **Halve resolution to 8×8** — memory drops 4×, raster cost drops 4×, stripe width becomes 2 subcells which is right at the readability threshold. Only if 1+2 aren't enough.
4. **6-tile radius cull around the player** — only activated as an emergency brake. User's directive is full-path rendering so we treat this as a last-resort escape hatch.

Document the final measured numbers in this spec after implementation.

---

## 12. Done criteria

1. Walking onto 2.2.1 with a hose attached (via harness `hose=1`) produces a visible cyan-green stripe under the player; turning a corner produces an elbow stripe one tile back.
2. U-turn: enter a dead-end and back out → the dead-end tile shows a stub, not a full straight-through.
3. Crossed tile: step onto your own path → overlaid stripes render both paths, with a head-pulse on the current tile.
4. Pop / reel-retract: `HoseState.popLastStep()` clears the 3D decal from the popped tile; neighboring tile's exit stripe reverts to a head stub.
5. Head-of-hose tile is visibly brighter than trailing tiles; brightness falls off over ~30 steps behind the player.
6. Kinked hose (force 2–3 kinks via the harness) visibly desaturates the whole decal globally.
7. Full path rendering — walking a 100-tile trail through 2.2.2 shows the entire trail on screen (no distance cull), with no frame-rate regression past the 1.0 ms budget.
8. `outputs/hose-decal-raster-test.js` passes 25/25 assertions.
9. All existing tests still pass: `outputs/hose-decal-test.js` (35/35), `outputs/hose-overlay-test.js` (27/27).
10. `detach` / `clearFloor` on a floor drops all bitmap allocations for that floor (verify via `debugSnapshot` count).

---

## 13. Out of scope for Rung 2C

- Flow-propagation simulation on channel 1 (Rung 2E).
- Gameplay effect from crossed tiles / self-squeeze (Rung 2E).
- Enemy/door interactions with the hose (Rung 2E).
- Procgen contracts keyed on hose pathing (Rung 2F).
- Wall-side decals (post-jam at earliest).
- Co-op / multi-hose support (post-jam).
- Detached hose as independent entity (post-jam).
- Material-aware hiss audio (Rung 3 — can land in parallel, no dependency).

---

## 14. Estimated effort

| Task | Estimate |
|---|---|
| HoseDecal bitmap cache + `_paintStripe` + `_paintLine` + `_rebuildTile` | 2.5h |
| Wire into `_appendStep` / `_popLast` / `_clear` | 1h |
| Raster test harness (`outputs/hose-decal-raster-test.js`) | 1.5h |
| `raycaster-floor.js` floor-sampler diff + snapshot hoisting | 1h |
| Visual feel-check in-browser + tuning (stripe width / color / falloff) | 2h |
| Perf measurement + documentation in this spec | 1h |
| **Total** | **~9h (≈1 full dev day)** |

Matches the brief's §11.7 estimate for Rung 2C ("1 day"). No surprises expected — architecture is a clone of the shipped grime path with a different data source.

---

## 15. Risks & gotchas

- **`floorFracX`/`floorFracY` scoping.** Currently computed inside the grime branch (lines 350–351). Hoisting them above both grime and hose branches is a one-line scope move but requires care with the `if (cachedFloorGrime)` / `else if (cachedBlood > 0)` structure. Ensure they're still only computed when needed — don't pay the subtraction for tiles with no grime AND no hose.
- **Max-combine semantics on crossings.** `_paintStripe` uses `max` on both channels. If a later visit paints a straight stripe through a tile where an earlier visit drew an elbow, the max-combined result shows both shapes overlaid. That's the "X on crossed tiles" behavior we want. **But** it means full rebuild from the ledger on pop is mandatory — you cannot subtract a stripe from a max-combined bitmap.
- **Head pulse visibility.** Head-pulse tint (HOSE_HEAD_R/G/B) is applied when `cachedHoseIsHead === true`, which requires `visitIndexAtPaint === hoseHeadIdx`. Make sure `_appendStep` updates the NEW head's `visitIndexAtPaint` to the new max index BEFORE `_bump()` fires the version change — otherwise the floor sampler may read a stale `getHeadVisitIndex()` and the pulse won't match.
- **Floor transitions.** `HoseState.onFloorEnter()` is the seam where the current floor's visits pause and a new strand starts on the next floor. `HoseDecal` already handles this; confirm the new bitmap cache survives the transition (it's keyed by floorId → tileKey, so it should). Add a test case.
- **ImageData allocation churn.** `_floorImgData` is already reused at `raycaster-floor.js` line 133. We're writing into the same buffer — no new `createImageData` calls. Verify no hose code paths accidentally allocate per frame.
- **GC pressure from tile record growth.** On a long-session floor (500 visits), `_floors[floorId]` may carry 500 tile records each holding a 512-byte Uint8Array. That's 500 small allocations on first visit. Consider a pre-allocated pool if profiling shows minor-GC spikes — defer until measured.

---

## 16. Cross-references

- `ADR-001-PRESSURE_WASHER_FPS_WEAPON.md` — nozzle + projectile model. Splatter-on-wall from `PWProjectile` calls into `HoseDecal._paintStripe`, so this spec's max-combine additive semantics must remain tolerant of a second writer. No structural change required; flagged here so future edits don't introduce a single-writer assumption.
- `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` §5 (Rung 2C entry), §11.3 (rendering choice rationale), §11.7 (ladder hour table).
- `PRESSURE_WASH_SYSTEM.md` §7 File Map (add `hose-decal.js` extension note after 2C ships), §10 Active Work.
- `PRESSURE_WASHING_ROADMAP.md` §11 Execution Plan (supersedes PW-4/PW-5 to Rung 8/9; Rung 2C lands between shipped 2B and future 2D).
- `CLAUDE.md` "Direction convention" (0=E, 1=S, 2=W, 3=N — drives `EDGE_PT` table).
- `engine/hose-decal.js` (Layer 1, Rung 2A).
- `engine/hose-overlay.js` (Layer 2, Rung 2B — shape dispatch is the reference implementation for 2C's `_paintStripe` endpoints).
- `engine/raycaster-floor.js` (Layer 2 — target of the diff in §7).
- `engine/grime-grid.js` / `raycaster-floor.js` lines 347–365 (reference pattern for tile-cached sub-cell sampling).
- `outputs/hose-decal-test.js` (Rung 2A, 35/35).
- `outputs/hose-overlay-test.js` (Rung 2B, 27/27).

---

**When 2C lands, update this doc's header to `Status: Shipped YYYY-MM-DD` and append the measured perf numbers to §11.**

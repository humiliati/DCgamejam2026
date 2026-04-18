# DOC-117 Tier 1 Sprite Taxonomy

**Status**: Design spec — authored 2026-04-17, prerequisite to Tier 1
sprite implementation (§8a step 2 of `docs/ADJACENT_TILE_DECOR_SPEC.md`).

**Audience**: Agents or humans implementing the 19 Tier 1 adjacent-decor
sprites. Read this before touching `engine/texture-atlas.js`.

**Why this exists**: The 19 Tier 1 sprites cluster into a handful of
procedural archetypes. Writing each sprite as an independent pixel
shader (the current TextureAtlas convention) works, but duplicates
geometry logic across every sprite that's "three small scattered shapes"
or "two diagonal strokes". A six-primitive helper layer lets each sprite
collapse to 10–30 lines of composition — cleaner Tier 2/3 reuse and
easier palette iteration.

The taxonomy does **not** replace the `_createTexture(id, w, h, pixelFn)`
primitive. It adds a second primitive tier — **pixel-test helpers** that
run inside `pixelFn` and return coverage + structural hints, not colors.
The outer sprite generator still owns palette and composition order.

---

## 1. Archetype map (19 sprites → 6 archetypes)

| Archetype | Sprite | Source tile | Placement |
|---|---|---|---|
| **A. Scatter** | `decor_feather_single` | ROOST | floor |
| A | `decor_feather_tuft` | ROOST | floor |
| A | `decor_dragon_scale` | ROOST | floor |
| A | `decor_bone_shard_floor` | NEST, DEN | floor |
| A | `decor_gnawed_bone` | DEN | floor |
| A | `decor_fur_tuft` | DEN | floor |
| A | `decor_copper_filings_floor` | ENERGY_CONDUIT | floor |
| A | `decor_blood_dot_floor` | TERRITORIAL_MARK | floor |
| **B. Slash** | `decor_scratch_kneehigh` | DEN, ROOST | wall |
| B | `decor_claw_gouge_masonry` | DEN, ROOST | wall |
| B | `decor_scratch_parallel_wall` | TERRITORIAL_MARK | wall |
| B | `decor_stick_bundle_floor` | NEST | floor |
| **C. Streak** | `decor_guano_streak_wall` | ROOST | wall |
| C | `decor_brass_pipe_run_wall` | ENERGY_CONDUIT | wall |
| **D. Blob** | `decor_fungus_climb_wall` | FUNGAL_PATCH | wall |
| D | `decor_spore_puff_floor` | FUNGAL_PATCH | floor |
| D | `decor_oil_stain_floor` | ENERGY_CONDUIT | floor |
| **E. Thread** | `decor_mycelium_thread_wall` | FUNGAL_PATCH | wall |
| **F. Plate** | `decor_warning_sign_plate` | ENERGY_CONDUIT | wall |

Totals: A=8, B=4, C=2, D=3, E=1, F=1.

---

## 2. Primitive catalog

All primitives live at the top of `engine/texture-atlas.js` immediately
after `_clamp()` (around line 1146). Each is a **pure pixel test** — it
receives the current `(x, y)` and a config object, and returns a
**coverage record** that the sprite generator interprets through its
palette.

Primitives never allocate per-pixel (closures + arrays created once in
the config object, read-only inside). They never call `_createTexture`;
they are designed to be called from *inside* a `pixelFn`.

### 2.1 Coverage record

Shared return shape:

```js
// Opaque hit:
{ hit: true, alpha: 0..1, depth: 0..1, layer: 'core'|'edge'|'detail' }
// No coverage (fall through to next primitive or transparent):
{ hit: false }
```

- `alpha` — normalized coverage (0 = no coverage, 1 = fully covered).
  Multiply by palette alpha (typically 180–255) when writing rgba.
- `depth` — normalized radial/perpendicular distance into the shape
  (0 = center/core, 1 = edge). Lets the sprite pick palette tiers
  (deep vs. rim color) without the primitive knowing palette.
- `layer` — hint for palette dispatch when a single primitive produces
  multiple visual tiers (e.g. slash core vs. slash edge).

### 2.2 The six primitives

#### A. `_pxScatter(x, y, cfg)` — hash-placed item field

Deterministically places N small shapes at hash-selected positions.
One primitive covers feathers, bones, scales, filings, blood dots, and
fur tufts — the shape generator is swapped via `cfg.item`.

```js
/**
 * cfg = {
 *   count:     int     — number of items to place (3..12)
 *   seed:      int     — hash salt (keeps sprite variants distinct)
 *   bounds:    {x0,y0,x1,y1}  — axis-aligned bounding box
 *   item:      'dot'|'teardrop'|'ellipse'|'diamond'|'stick'
 *   itemR:     int     — base radius/half-extent (2..6 typical)
 *   itemJitter: 0..1   — radius variance (0 = uniform, 1 = ±itemR)
 *   rotate:    bool    — random rotation per item (meaningful for stick/teardrop)
 * }
 * Returns coverage record. Iterates cfg.count items per pixel (O(count));
 * since count ≤ 12 and textures are 32×32, total cost stays under ~12k ops.
 */
```

Item-shape contract: each `item` string maps to a pixel test
`(localX, localY, halfExtent, rotRad) → {hit, alpha, depth}` in the
scatter dispatch table (defined once inside `_pxScatter`, not per call).

#### B. `_pxSlash(x, y, cfg)` — parametric diagonal strokes

Parameterized line distance test for 2–5 parallel/crossing strokes.
Covers kneehigh scratches, claw gouges, stick bundles.

```js
/**
 * cfg = {
 *   strokes: [  // 2..5 entries
 *     { x0, y0, x1, y1, coreW, edgeW }  // endpoints + width bands
 *   ],
 *   straight: bool  // when true, strokes rendered as exact line segments;
 *                   // when false, endpoints jittered ±1 per ~3px along length
 * }
 * Returns coverage record — layer='core' inside coreW, 'edge' inside edgeW.
 * Uses perpendicular-distance-to-segment test.
 */
```

Derives from the pattern in `_genWarningScratches` (texture-atlas.js
line 5055). That function hardcodes 3 parallel diagonals; `_pxSlash`
generalizes to arbitrary endpoints and stroke counts.

#### C. `_pxStreak(x, y, cfg)` — vertical column with y-progression

Drips, guano streaks, pipe runs — a vertical column whose width and
color fade along the y axis. Supports per-row horizontal jitter for
"organic drip" look, or straight columns for "fabricated pipe" look.

```js
/**
 * cfg = {
 *   cx:        int     — anchor x (usually S*0.5)
 *   yStart:    int     — top of streak
 *   yEnd:      int     — bottom of streak
 *   widthFn:   (progress) => int  // progress 0..1 along (yStart,yEnd)
 *   jitterAmp: 0..4    — per-3px-row horizontal wobble (0 = straight pipe)
 *   jitterSeed: int
 *   hardEdge:  bool    // true = sharp-edged pipe; false = soft gradient edge
 * }
 * Returns coverage record. depth is normalized perpendicular distance
 * to the (possibly jittered) center line. layer='core' at dist<1px,
 * 'edge' between 1..width.
 */
```

Derives from `_genAcidDrip` and `_genWaterStain` patterns.

#### D. `_pxBlob(x, y, cfg)` — noise-edged ellipse

Organic patches: fungus, oil stain, spore puff. Noise-modulated radius
from a center, optional tendril extrusion at high-frequency angle
harmonics.

```js
/**
 * cfg = {
 *   cx, cy:    int     — center
 *   rX, rY:    int     — ellipse semi-axes
 *   noiseAmp:  0..8    — radius jitter magnitude
 *   noiseSeed: int
 *   tendrils:  int     — 0 = smooth blob; >0 = N radial tendril lobes
 *   tendrilThresh: 0..1  // tendril activation cutoff (higher = fewer)
 * }
 * Returns coverage record. depth 0 at center, 1 at noise-edge.
 * When a tendril extends beyond the main blob, its depth caps at 1.0
 * with layer='detail'.
 */
```

Derives from `_genMoss` (line 5228) and `_genScorch` patterns.

#### E. `_pxThread(x, y, cfg)` — recursive branching line

Mycelium-style fractal. One primitive for the one Tier 1 sprite that
needs it, but carries its weight because Tier 2 adds vein/ivy/wire
variants.

```js
/**
 * cfg = {
 *   rootX, rootY:  int    — starting point
 *   rootAngle:     rad    — initial growth direction
 *   segmentLen:    int    — segment length (3..8px)
 *   depth:         int    — recursion depth (3..5)
 *   branchProb:    0..1   — chance per segment to spawn a side branch
 *   angleSpread:   rad    — side-branch deviation from parent
 *   seed:          int
 *   widthAt:       (depth) => int  // depth 0 = root, increasing = leaves
 * }
 * Builds branch tree once per call (memoize on seed+root+depth). Returns
 * coverage record where 'depth' is the tree depth (0=trunk, higher=tips).
 * Tree cache keyed on cfg identity — primitives receiving the same cfg
 * object reuse the computed tree.
 */
```

No direct pre-existing analogue in texture-atlas.js; the closest is
`_genCobweb` (radial strands) which is simpler (no recursion).

#### F. `_pxPlate(x, y, cfg)` — rectangular bounded region with bevel

Metal sign plates, placards. Inner coordinates + edge/bevel tests so
the sprite can render its own symbols (triangle, lightning bolt, etc.)
on top.

```js
/**
 * cfg = {
 *   bounds:  {x0, y0, x1, y1}  — plate rectangle
 *   borderW: int               — border thickness (1..3)
 *   bevelW:  int               — inner bevel bright edge (0..2)
 * }
 * Returns coverage record with extra fields:
 *   { hit, alpha, depth, layer, localX, localY, innerW, innerH }
 * where localX/Y are coordinates inside the inner area (post-border),
 * innerW/H are the inner-area dimensions. Sprite uses those for symbol
 * placement (triangle, exclamation mark).
 * layer = 'border' | 'bevel' | 'inner'.
 */
```

No direct analogue; `_genWantedPoster` (line 5085) is the closest
pattern but combines plate + text in one function. `_pxPlate` extracts
just the plate geometry.

---

## 3. Composition layer

Each Tier 1 sprite generator becomes:

```js
function _genDecorXxx(id, p) {
  var cfg = { /* primitive config, built once */ };
  _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
    var hit = _pxSomething(x, y, cfg);
    if (!hit.hit) return { r: 0, g: 0, b: 0, a: 0 };
    // Pick palette based on hit.layer / hit.depth
    // Return rgba with _clamp()
  });
}
```

For sprites with two visual layers (core + edge, or blob + tendril),
the pixelFn calls primitives in priority order:

```js
function _genDecorOilStain(id, p) {
  var blobCfg = { cx: 16, cy: 16, rX: 10, rY: 8, noiseAmp: 3, ... };
  _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
    var b = _pxBlob(x, y, blobCfg);
    if (!b.hit) return { r: 0, g: 0, b: 0, a: 0 };
    // Darker toward core (high oil depth), lighter at noise edge
    var coreBias = 1 - b.depth;
    var alpha = 210 * b.alpha;
    var pn = (_hash(x + 17100, y + 17101) - 0.5) * 6;
    return {
      r: _clamp(p.darkR * (0.7 + coreBias * 0.3) + pn),
      g: _clamp(p.darkG * (0.7 + coreBias * 0.3) + pn),
      b: _clamp(p.darkB * (0.7 + coreBias * 0.3) + pn * 0.5),
      a: _clamp(alpha)
    };
  });
}
```

---

## 4. Worked examples — 3 sprites

### 4.1 `decor_feather_single` (Archetype A — Scatter, single item)

Degenerate case: scatter with count=1. Still uses `_pxScatter` so
Tier 2 variants can extend trivially.

```js
function _genDecorFeatherSingle(id, p) {
  var cfg = {
    count: 1, seed: 17200,
    bounds: { x0: 10, y0: 10, x1: 22, y1: 22 },
    item: 'teardrop', itemR: 5, itemJitter: 0.3, rotate: true
  };
  _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
    var h = _pxScatter(x, y, cfg);
    if (!h.hit) return { r: 0, g: 0, b: 0, a: 0 };
    var pn = (_hash(x + 17300, y + 17301) - 0.5) * 6;
    // Depth: 0 = spine, 1 = vane edge. Spine darker, vane lighter.
    var body = 1 - h.depth * 0.4;
    return {
      r: _clamp(p.featherR * body + pn),
      g: _clamp(p.featherG * body + pn),
      b: _clamp(p.featherB * body + pn),
      a: _clamp(220 * h.alpha)
    };
  });
}
```

~18 lines.

### 4.2 `decor_scratch_kneehigh` (Archetype B — Slash, 3 parallel strokes)

```js
function _genDecorScratchKneehigh(id, p) {
  var cfg = {
    strokes: [
      { x0:  6, y0: 18, x1: 16, y1: 22, coreW: 0.9, edgeW: 2.2 },
      { x0: 10, y0: 16, x1: 22, y1: 20, coreW: 0.9, edgeW: 2.2 },
      { x0: 14, y0: 20, x1: 26, y1: 24, coreW: 0.7, edgeW: 1.8 }
    ],
    straight: false
  };
  _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
    var h = _pxSlash(x, y, cfg);
    if (!h.hit) return { r: 0, g: 0, b: 0, a: 0 };
    if (h.layer === 'core') {
      return {
        r: _clamp(p.deepR), g: _clamp(p.deepG), b: _clamp(p.deepB),
        a: _clamp(220 * h.alpha)
      };
    }
    // edge
    return {
      r: _clamp(p.scratchR), g: _clamp(p.scratchG), b: _clamp(p.scratchB),
      a: _clamp(180 * h.alpha)
    };
  });
}
```

~22 lines. Compare with `_genWarningScratches` (26 lines, hardcoded
geometry). The win is configurability — scratch variants become pure
config changes, no new generator function.

### 4.3 `decor_fungus_climb_wall` (Archetype D — Blob + Thread composition)

The only Tier 1 sprite that needs **two primitives** in one pixelFn —
a main fungal body (blob) plus upward tendril shoots (thread).

```js
function _genDecorFungusClimb(id, p) {
  var blob = { cx: 16, cy: 20, rX: 9, rY: 7, noiseAmp: 4, noiseSeed: 17400, tendrils: 3, tendrilThresh: 0.75 };
  var thread = { rootX: 16, rootY: 14, rootAngle: -Math.PI/2, segmentLen: 4, depth: 4, branchProb: 0.35, angleSpread: 0.6, seed: 17401, widthAt: function(d){return d===0 ? 2 : 1;} };

  _createTexture(id, DECOR_SIZE, DECOR_SIZE, function (x, y) {
    // Thread takes priority — it's the detail reaching up from the blob
    var t = _pxThread(x, y, thread);
    if (t.hit) {
      return {
        r: _clamp(p.rootR), g: _clamp(p.rootG), b: _clamp(p.rootB),
        a: _clamp(200 * t.alpha)
      };
    }
    var b = _pxBlob(x, y, blob);
    if (!b.hit) return { r: 0, g: 0, b: 0, a: 0 };
    var isHi = _hash(x * 3 + 17500, y * 3 + 17501) > 0.7;
    var pn = (_hash(x + 17600, y + 17601) - 0.5) * 8;
    return {
      r: _clamp((isHi ? p.hiR : p.baseR) + pn * 0.5),
      g: _clamp((isHi ? p.hiG : p.baseG) + pn),
      b: _clamp((isHi ? p.hiB : p.baseB) + pn * 0.3),
      a: _clamp(220 * (1 - b.depth * 0.4))
    };
  });
}
```

~28 lines. The equivalent hand-written version would be ~60 lines
(the pattern in `_genMoss` is 30 lines for blob-only; adding threads
doubles it). Primitive reuse cuts the line count in half.

---

## 5. File placement

### 5.1 Where primitives live

**Decision**: keep primitives in `engine/texture-atlas.js` alongside
the existing shared helpers (`_createTexture`, `_hash`, `_clamp`) — do
**not** extract to a separate `texture-atlas-decor-primitives.js`.

Rationale:
- TextureAtlas is one large IIFE; primitives must share the closure to
  access `_hash` and `_clamp`. Extracting means either exporting those
  (bloats the public API) or duplicating them.
- The 6 primitives add ~250 lines to a ~7500-line file. Below the
  budget-check threshold, no risk to CI.
- Tier 2/3 generators live in the same file, so co-located primitives
  are trivially available to later work.

### 5.2 Where generators live

New Tier 1 sprite generators go in a new `// ── Tier 1 adjacent decor
──` section of texture-atlas.js, after the DOC-115 verb-node textures
(around line 7100, before `// ── Public API`). One section keeps all
19 generators colocated for cross-reference during implementation.

### 5.3 Where sprite IDs are registered

Generator invocations (`_genDecorFeatherSingle('decor_feather_single', {...})`)
go in the `_registerAllDecor()` block — find the existing decor
registration pattern around line 700 and extend with a `// ── Tier 1
adjacent decor ──` subsection.

---

## 6. Implementation sequencing

Recommended order when implementing Tier 1 sprites:

1. **Build the six primitives** (one commit). Write each with 2–3
   unit-level inline asserts — since we don't have a test runner, the
   verification is visual: register a temporary debug texture that
   uses the primitive at known coords and eyeball the canvas in the
   World Designer preview. Remove debug textures before commit.

2. **Scatter batch** (one commit, 8 sprites) — feathers, bones,
   scales, filings, fur tufts, blood dots, gnawed bone. All exercise
   `_pxScatter`; collectively they validate the primitive handles 1–12
   items cleanly.

3. **Slash batch** (one commit, 4 sprites) — scratches ×3, stick
   bundle. Validates `_pxSlash` with both `straight:true` and
   `straight:false` configs.

4. **Blob batch** (one commit, 3 sprites) — oil stain, spore puff,
   fungus climb (the last also exercises thread).

5. **Streak batch** (one commit, 2 sprites) — guano streak
   (jittered), brass pipe run (straight). Validates `_pxStreak` on
   both organic and fabricated looks.

6. **Singletons** (one commit, 2 sprites) — mycelium thread, warning
   plate. Validates `_pxThread` and `_pxPlate`.

7. **AdjacentDecorMap wiring** (one commit) — populate the empty
   catalogs in `engine/adjacent-decor-map.js` referencing the 19 IDs.
   First live end-to-end test of the whole DOC-117 pipeline.

Each batch is its own commit so truncation/cache bugs (CLAUDE.md
§Sandbox mount gotcha) are easy to bisect if they surface.

---

## 7. Tier 2/3 extension notes

The primitive catalog was sized for Tier 1, but Tier 2/3 sprites
(§5b, §5c of DOC-117) can mostly be expressed as new configs over the
same primitives:

- **Tier 2 `decor_moss_climb_advanced`** → `_pxBlob` with
  `tendrils: 5, noiseAmp: 5` (today's Tier 1 fungus uses 3, 4).
- **Tier 2 `decor_electrical_arc`** → new primitive
  `_pxJagged(x, y, cfg)` for lightning-bolt paths. Additive to the
  catalog; no refactor of Tier 1.
- **Tier 3 `decor_sigil_inscription`** → combines `_pxPlate` (plaque
  backing) + `_pxThread` with a very shallow tree (runes).

When a Tier 2/3 sprite needs a new archetype, add a new primitive —
don't overfit existing ones. The six primitives above are
**composable** (any sprite can call multiple), but each primitive is
single-purpose. Keep it that way.

---

## 8. Open questions deferred to implementation

- **Tree memoization for `_pxThread`**: the first draft should build
  the branch tree in the pixelFn's closure once, then share across
  all pixel evaluations. If that proves fiddly, fall back to building
  once per pixel (still O(branches) per pixel) — 32×32 ≤ 1024 pixels,
  and thread branches ≤ ~20, so worst case ~20k ops for the whole
  sprite. Acceptable but wasteful; prefer the closure approach.

- **Seed conventions**: each primitive accepts its own seed, so
  sprites that use multiple primitives must seed them distinctly.
  Convention: sprite-prefix seeds in the 17000–17999 range (avoiding
  collisions with existing texture-atlas hash salts in 14000–16999).
  Document the assigned range per sprite in a comment above its
  generator.

- **DECOR_SIZE vs. custom sizes**: all Tier 1 sprites use the standard
  32×32 `DECOR_SIZE`. If a future sprite needs a different size (tall
  skinny streak, very wide horizontal band), the primitive APIs are
  size-agnostic — they take absolute pixel coordinates and bounds.
  No change needed to the primitive signatures.

---

## 9. Hand-off

When this taxonomy lands in the repo, update:

- `docs/ADJACENT_TILE_DECOR_SPEC.md` §8a step 2 — cross-reference
  this document as the design contract for sprite implementation.
- `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` — register this file as
  DOC-117a (Tier 1 sprite taxonomy addendum).

Implementation can begin as soon as this doc is reviewed. The first
implementation commit should be the six primitives (§6 step 1) with
visual verification via a throwaway debug texture.

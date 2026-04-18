# Adjacent Tile Decor System — DOC-117

> Spec for spawning small environmental sprites on the tiles that
> neighbor ecology-carrying tiles. Tier 1 covers DOC-115 creature
> verb-nodes. Tier 2 extends the same system to botanical neighbors
> (shrubs seeding clover into adjacent grass, trees dropping
> mushrooms on adjacent dirt). Tier 3 extends further to
> infrastructure and street tiles (fences, pillars, water edges,
> bonfires, debris piles). These decorations "tie" each ecology tile
> into its surroundings so the tile reads as lived-in rather than
> dropped-in.
> Drafted 2026-04-17. Expanded 2026-04-17 with Tier 2 + Tier 3.
> Extends the Raycaster wall-decor map.

---

## Problem statement

The DOC-115 creature tiles (ROOST, NEST, DEN, FUNGAL_PATCH,
ENERGY_CONDUIT, TERRITORIAL_MARK) all render correctly in isolation
but have no *footprint* on the tiles around them. A nest with no stray
bones in the corridor, a roost with no feather drifts, an energy
conduit with no pipe continuation — these read as stickers stuck to
the floor rather than infrastructure that belongs there.

The same problem generalises beyond creature tiles. A SHRUB with no
wild-flowers bleeding into the adjacent GRASS tiles reads as a
prefab hedge. A TREE with no fallen leaves or mushrooms sprouting on
adjacent dirt reads as a lollipop prop. A FENCE with no grass
overgrowth at its base reads as a hedge-trimmer-perfect barrier. A
WATER tile with nothing reedy at its edge reads as a teal rectangle.

The fix is a single data-driven decor spawner that, at floor-load
time, reads a per-source-tile config and scatters sprite props onto
adjacent floor + wall positions. The spawner can optionally filter
by **neighbor tile type**, so (e.g.) clover only scatters onto GRASS
and not onto WALL or ROAD. Deterministic per floor seed, so revisits
are stable and no save-state bloat is needed.

### Scope tiers

The system rolls out in three ecology tiers. Each tier is an
independent slice with its own sprite catalog and acceptance bar —
Tier 1 ships first because it's blocking DOC-118 ledger hooks; Tier
2 and 3 are "visual polish" layers that dramatically increase
environmental readability but are not on the critical path.

| Tier | Source tiles | Target tiles | Purpose |
|---|---|---|---|
| **Tier 1** — Creature ecology | ROOST (49), NEST (50), DEN (51), FUNGAL_PATCH (52), ENERGY_CONDUIT (53), TERRITORIAL_MARK (54) | any walkable neighbor | Creature presence bleeds into corridors (feathers, bones, pipe runs) |
| **Tier 2** — Botanical | SHRUB (22), TREE (21), TREE_SQ (85) | GRASS (34), PATH (33), ROAD (32) | Flora seeds flowers + mushrooms + leaf litter into neighboring ground |
| **Tier 3** — Infrastructure & street | FENCE (35), PILLAR (10), WATER (9), BONFIRE (18), CITY_BONFIRE (69), DETRITUS (39) | varies per source | Built environment bleeds overgrowth, ash, reeds, dust into neighbors |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped |
| 🟡 | Specced — pending |
| ⬜ | Open design question |

---

## 1. Decor catalog — Tier 1: Creature ecology

For each creature tile, a config lists sprites to scatter on neighbors.
Placement is one of four positions per neighbor: `floor` (flat on
floor), `wall-knee` (lower 30% of wall face), `wall-mid` (middle 40%),
`wall-top` (upper 30%, ceiling-adjacent).

Tier 1 entries do NOT set a `neighborTiles` filter — any walkable
neighbor qualifies. Tier 2 and Tier 3 entries (§1g onward) DO set
`neighborTiles` so decor only lands on thematically-correct targets
(clover on grass, ash on dirt, etc.).

### 1a. ROOST (49) — flying creature anchor

| Sprite | Placement | Rate | Direction filter | Notes |
|--------|-----------|------|------------------|-------|
| `decor_feather_single` | floor | 18% | cardinal | 1–3 colour variants, rotation random |
| `decor_feather_tuft` | floor | 6% | cardinal | Cluster of 2–3 feathers |
| `decor_guano_streak_wall` | wall-mid | 30% | facing-tile | Dripping stain down the wall face below the perch |
| `decor_dragon_scale` | floor | 2% | cardinal | Depth ≥ 4 only — conspiracy breadcrumb |

### 1b. NEST (50) — ground creature home

| Sprite | Placement | Rate | Direction filter | Notes |
|--------|-----------|------|------------------|-------|
| `decor_bone_shard_floor` | floor | 22% | cardinal | Small bone fragments |
| `decor_stick_bundle_floor` | floor | 10% | cardinal | Overflow debris from the nest |
| `decor_scratch_kneehigh` | wall-knee | 15% | cardinal | Short claw scratches at knee height |

### 1c. DEN (51) — pack predator alcove

| Sprite | Placement | Rate | Direction filter | Notes |
|--------|-----------|------|------------------|-------|
| `decor_claw_gouge_masonry` | wall-mid | 40% | adjacent-only | Twin parallel gouges next to the alcove mouth |
| `decor_gnawed_bone` | floor | 25% | front 1-tile | In the "kill zone" directly in front of the den |
| `decor_fur_tuft` | floor | 8% | cardinal | Shed fur drifts |

### 1d. FUNGAL_PATCH (52) — bioluminescent symbiote

| Sprite | Placement | Rate | Direction filter | Notes |
|--------|-----------|------|------------------|-------|
| `decor_fungus_climb_wall` | wall-knee | 35% | cardinal | Mini cap cluster climbing the wall |
| `decor_spore_puff_floor` | floor | 20% | cardinal | Dried spore smear |
| `decor_mycelium_thread_wall` | wall-mid | 15% | cardinal | Thin pale line tracing the wall |

### 1e. ENERGY_CONDUIT (53) — retrofuturist infrastructure

| Sprite | Placement | Rate | Direction filter | Notes |
|--------|-----------|------|------------------|-------|
| `decor_brass_pipe_run_wall` | wall-mid | 60% | inline | Pipe continues along the wall; prefers tiles that are already wall-aligned with the conduit |
| `decor_oil_stain_floor` | floor | 25% | cardinal | Copper-tinted sheen |
| `decor_copper_filings_floor` | floor | 12% | cardinal | Tiny metallic specks |
| `decor_warning_sign_plate` | wall-top | 5% | facing-tile | "DANGER HIGH CURRENT" embossed plate |

### 1f. TERRITORIAL_MARK (54) — alpha creature claim

| Sprite | Placement | Rate | Direction filter | Notes |
|--------|-----------|------|------------------|-------|
| `decor_scratch_parallel_wall` | wall-mid | 35% | cardinal | Echoes the floor gouges on the vertical surface |
| `decor_blood_dot_floor` | floor | 18% | cardinal | Dried splatter |

---

## 1.5. Decor catalog — Tier 2: Botanical

Botanical tiles (shrubs, trees) seed flora decor onto walkable ground
neighbors. Every Tier 2 entry specifies `neighborTiles` so the decor
only lands on GRASS / PATH / ROAD, never on WALL / stone / etc.

### 1g. SHRUB (22) — hedge, low botanical anchor

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_white_clover_floor` | floor | 28% | cardinal | GRASS (34) | 3-petal white clover cluster; hedge-adjacent wildflower |
| `decor_grass_tuft_floor` | floor | 20% | cardinal | GRASS (34), PATH (33) | Unkempt grass escapes the hedge line |
| `decor_fallen_leaf_floor` | floor | 12% | all | GRASS (34), PATH (33), ROAD (32) | Small leaf drifts; biome-tinted to match the shrub's palette |
| `decor_twig_bundle_floor` | floor | 6% | cardinal | GRASS (34), PATH (33) | Broken-off twigs; reads as "gardener never came by" |

### 1h. TREE (21) / TREE_SQ (85) — canopy, tall botanical anchor

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_mushroom_cluster_floor` | floor | 22% | cardinal | GRASS (34), DETRITUS (39) | 2–4 mushroom caps at the tree's base; biome-tinted (red/brown/yellow) |
| `decor_acorn_seed_floor` | floor | 18% | all | GRASS (34), PATH (33) | Small seed pod; dense clusters right under the tree |
| `decor_leaf_litter_floor` | floor | 35% | all | GRASS (34), PATH (33), ROAD (32) | Multi-leaf floor decal; heavier drop directly under the tree |
| `decor_moss_patch_floor` | floor | 14% | cardinal | GRASS (34) | Green moss spread on shaded ground; prefer shaded side (north-facing neighbor) |
| `decor_fallen_branch_floor` | floor | 4% | adjacent-only | GRASS (34), PATH (33) | Larger dead branch; rare, placement breaks up leaf litter |

Both TREE and TREE_SQ share the same config — the square variant is a
rendering-shape distinction, not an ecology distinction. The decor
spawner keys off the tile ID, so both entries must register.

---

## 1.7. Decor catalog — Tier 3: Infrastructure & street

Built-environment tiles that bleed their material signatures into
neighbors. These are the "most polish, least obligation" tier — each
row is individually justifiable but the tier as a whole is post-Tier-2.

### 1i. FENCE (35) — basepath overgrowth

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_grass_tuft_floor` | floor | 30% | cardinal | GRASS (34), PATH (33) | Grass that escapes past the fence line at the base |
| `decor_vine_climb_wall` | wall-knee | 18% | facing-tile | WALL (1), FENCE (35) | Climbing vine on the fence face itself — same tile (self-decor) |
| `decor_white_clover_floor` | floor | 8% | cardinal | GRASS (34) | Sparse clover spread along the fence base (shares Tier 2 sprite) |

### 1j. PILLAR (10) — stonework ivy

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_ivy_climb_wall` | wall-mid | 25% | cardinal | WALL (1), PILLAR (10) | Ivy sprouts on the column itself + adjacent wall; opaque-adjacent only |
| `decor_stone_chip_floor` | floor | 15% | cardinal | ROAD (32), PATH (33), GRASS (34) | Small masonry chip from weathering |
| `decor_moss_patch_floor` | floor | 12% | cardinal | GRASS (34) | Moss on the shaded side of the column's footprint |

### 1k. WATER (9) — wet-edge flora

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_reed_tuft_floor` | floor | 40% | cardinal | GRASS (34), PATH (33) | Tall reeds at the water's edge |
| `decor_lily_pad_floor` | floor | 22% | cardinal | WATER (9) | Self-decor; lily pads drift into the same water tile's neighbors when walkable |
| `decor_wet_soil_floor` | floor | 18% | cardinal | GRASS (34), PATH (33), ROAD (32) | Damp sheen floor texture overlay; darker than surrounding dry ground |
| `decor_dragonfly_hover` | wall-top | 4% | cardinal | (any) | Rare ambient dragonfly silhouette — biome-specific dragon-conspiracy breadcrumb in depth ≥ 3 |

### 1l. BONFIRE (18) / CITY_BONFIRE (69) — ash ring + embers

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_ash_scatter_floor` | floor | 45% | cardinal | ROAD (32), PATH (33), GRASS (34) | Grey ash spread — heavier on windward side if wind direction is set |
| `decor_ember_chunk_floor` | floor | 12% | cardinal | ROAD (32), PATH (33) | Small orange ember; rare pulsing glow variant at night |
| `decor_scorch_mark_floor` | floor | 22% | adjacent-only | ROAD (32), PATH (33), GRASS (34) | Dark charred patch right at the bonfire's edge |

### 1m. DETRITUS (39) — dust spread

| Sprite | Placement | Rate | Direction filter | Neighbor tiles | Notes |
|--------|-----------|------|------------------|----------------|-------|
| `decor_dust_smear_floor` | floor | 35% | cardinal | ROAD (32), PATH (33) | Fine dust tracked outward from the debris pile |
| `decor_paper_scrap_floor` | floor | 10% | all | ROAD (32), PATH (33), GRASS (34) | Wind-blown paper fragment; biome-tinted |

---

## 2. Data schema

Config lives in `engine/adjacent-decor-map.js` (new Layer 1 module):

```js
var AdjacentDecorMap = (function () {
  'use strict';

  var T = TILES; // shorthand — Layer 0 tile constants

  var MAP = {
    // ── Tier 1 — Creature ecology (no neighborTiles filter) ────────
    49: [ // ROOST
      { sprite: 'decor_feather_single',    placement: 'floor',    rate: 0.18, directions: 'cardinal' },
      { sprite: 'decor_feather_tuft',      placement: 'floor',    rate: 0.06, directions: 'cardinal' },
      { sprite: 'decor_guano_streak_wall', placement: 'wall-mid', rate: 0.30, directions: 'facing-tile' },
      { sprite: 'decor_dragon_scale',      placement: 'floor',    rate: 0.02, directions: 'cardinal', minDepth: 4 }
    ],
    // … 50 NEST, 51 DEN, 52 FUNGAL_PATCH, 53 ENERGY_CONDUIT, 54 TERRITORIAL_MARK

    // ── Tier 2 — Botanical (neighborTiles required) ────────────────
    22: [ // SHRUB
      { sprite: 'decor_white_clover_floor',  placement: 'floor', rate: 0.28, directions: 'cardinal', neighborTiles: [T.GRASS] },
      { sprite: 'decor_grass_tuft_floor',    placement: 'floor', rate: 0.20, directions: 'cardinal', neighborTiles: [T.GRASS, T.PATH] },
      { sprite: 'decor_fallen_leaf_floor',   placement: 'floor', rate: 0.12, directions: 'all',      neighborTiles: [T.GRASS, T.PATH, T.ROAD] },
      { sprite: 'decor_twig_bundle_floor',   placement: 'floor', rate: 0.06, directions: 'cardinal', neighborTiles: [T.GRASS, T.PATH] }
    ],
    21: [ // TREE
      { sprite: 'decor_mushroom_cluster_floor', placement: 'floor', rate: 0.22, directions: 'cardinal',      neighborTiles: [T.GRASS, T.DETRITUS] },
      { sprite: 'decor_acorn_seed_floor',       placement: 'floor', rate: 0.18, directions: 'all',           neighborTiles: [T.GRASS, T.PATH] },
      { sprite: 'decor_leaf_litter_floor',      placement: 'floor', rate: 0.35, directions: 'all',           neighborTiles: [T.GRASS, T.PATH, T.ROAD] },
      { sprite: 'decor_moss_patch_floor',       placement: 'floor', rate: 0.14, directions: 'cardinal',      neighborTiles: [T.GRASS] },
      { sprite: 'decor_fallen_branch_floor',    placement: 'floor', rate: 0.04, directions: 'adjacent-only', neighborTiles: [T.GRASS, T.PATH] }
    ],
    // TREE_SQ (85) reuses TREE's list by alias — see _aliasTo below.

    // ── Tier 3 — Infrastructure & street ───────────────────────────
    // 35 FENCE, 10 PILLAR, 9 WATER, 18 BONFIRE, 69 CITY_BONFIRE, 39 DETRITUS
    // see §1i–§1m for full rows
  };

  // Alias TREE_SQ (85) to TREE (21) — same ecology, different shape.
  // Documented in spec §1h. If additional aliases accumulate, promote
  // this to a dedicated _aliases map keyed by sourceTileId → canonTileId.
  MAP[85] = MAP[21];

  function getConfig(tileId) { return MAP[tileId] || []; }
  return Object.freeze({ getConfig });
})();
```

The map is the whole module surface — a single `getConfig(tileId)`
query. No state. No side effects.

### 2a. Schema fields

| Field | Type | Required? | Semantics |
|-------|------|-----------|-----------|
| `sprite` | string | ✅ | Sprite ID registered with TextureAtlas or the sprite atlas |
| `placement` | enum | ✅ | `floor` \| `wall-knee` \| `wall-mid` \| `wall-top` |
| `rate` | 0-1 float | ✅ | Independent Bernoulli probability per candidate neighbor |
| `directions` | enum | ✅ | `cardinal` \| `adjacent-only` \| `facing-tile` \| `inline` \| `front 1-tile` \| `all` |
| `neighborTiles` | int[] | ⬜ optional | If set, decor only spawns when the neighbor's tile ID is in the list. If absent, any walkable neighbor qualifies (Tier 1 default) |
| `minDepth` | int | ⬜ optional | Only spawns on floors at this depth or deeper; used for conspiracy-layer breadcrumbs (e.g., dragon scales only show on depth ≥ 4) |
| `biomeTint` | bool | ⬜ optional | If true, sprite is tinted with the biome's accent colour. Default `false` (raw sprite colour). See §9 open questions |

**Absent `neighborTiles`**: Tier 1 entries leave the field unset.
Semantics: the spawner falls back to the same "walkable + non-opaque"
check it already uses for TileHeight offsets. This matches existing
creature-tile behaviour — feathers fall on any walkable floor around
a ROOST regardless of whether that floor is ROAD, PATH, GRASS, or
dungeon stone.

**Present `neighborTiles`**: Tier 2 and Tier 3 entries set the field.
Semantics: the neighbor must also be walkable AND its tile ID must
be in the list. Order doesn't matter; a short allowlist is the
canonical form. Avoid exclusion-style lists (no `neighborTilesExclude`)
to keep the predicate a single pass.

**Self-decor**: some entries target the source tile itself (e.g.,
FENCE's `decor_vine_climb_wall` uses `neighborTiles: [T.WALL, T.FENCE]`
so vines can climb the fence's own face). The spawner treats the
source tile as its own neighbor for this purpose when `directions`
is `facing-tile`. Documented in §1i.

---

## 3. Spawn pass — floor load time

After `FloorManager.generate()` populates the grid, run:

```
for each tile T in grid:
  cfg = AdjacentDecorMap.getConfig(T.tileId)
  for each entry E in cfg:
    if E.minDepth && floorDepth < E.minDepth: continue
    for each neighbor N in filterByDirection(T, E.directions):
      // ── Neighbor-type filter (Tier 2 / Tier 3) ──
      if E.neighborTiles && !E.neighborTiles.includes(N.tileId):
        continue
      // Filter rejection does NOT advance the per-(T,N,entryIndex)
      // RNG stream — it's a pre-roll guard, so neighborTiles can be
      // added/removed later without shifting the seeded outputs on
      // other neighbors. Determinism survives config edits at the
      // granularity of "sprite identity per spawned cell."
      // ──────────────────────────────────────────
      roll = seededRNG(T.x, T.y, N.x, N.y, entryIndex)
      if roll < E.rate:
        spawnDecor(E.sprite, N, E.placement)
```

`seededRNG` is derived from the floor master seed + the coordinate
tuple. Consequences:

1. Decor is **deterministic** per floor. Revisits look identical.
2. **No save bloat** — regenerated on each floor load from the seed.
3. Blockout-visualizer preview can invoke the same pass to show the
   decor in-editor (phase 2).
4. **Filter edits don't shift other decor.** Adding GRASS to an
   entry's `neighborTiles` list only *reveals* new spawn sites where
   the roll was already rolled — it doesn't bump RNG consumption
   elsewhere on the floor.

Decor entries land in the Raycaster's existing `_wallDecorMap` plus a
new sibling `_floorDecorMap`. Rendering already works for wall decor;
we're extending the map, not inventing a new path.

---

## 4. Placement math

Wall-placement V-range (0 = top of wall):

| Placement | V-range |
|-----------|---------|
| `wall-top` | 0.00 – 0.30 |
| `wall-mid` | 0.30 – 0.70 |
| `wall-knee` | 0.70 – 1.00 |

Sprite U-center jittered ±0.15 per instance so stacked entries don't
rigid-stamp every tile.

Floor placement: seeded `(x, y)` inside the tile bounds with a 4px
edge inset so decor can't clip into adjacent walls.

`directions` enum values (the term "source tile" is the Tier-1 creature
tile, Tier-2 botanical tile, or Tier-3 infrastructure tile being
decorated around):

- `cardinal` — the four cardinal neighbors (N/S/E/W) of the source tile.
- `adjacent-only` — the four tiles sharing an edge with the source
  tile, regardless of walkability.
- `facing-tile` — the neighbor that faces the source tile's "front"
  (requires the tile to declare `primaryFacing` in its contract entry).
  Also used for self-decor when combined with `neighborTiles: [sourceTileId]`
  — see §2a self-decor note.
- `inline` — neighbors that form a line through the source tile; used
  for ENERGY_CONDUIT pipe-runs that should continue the wall the
  conduit is mounted on, and for WATER lily-pad drift across a water
  channel.
- `front 1-tile` — the single tile in the direction of the source
  tile's primary facing.
- `all` — all 8 neighbors including diagonals.

---

## 5. Required new sprites

### 5a. Tier 1 sprite catalog (Creature ecology — 19 sprites)

| Batch | Sprites |
|-------|---------|
| **Feathers + guano** (ROOST) | `decor_feather_single`, `decor_feather_tuft`, `decor_guano_streak_wall`, `decor_dragon_scale` |
| **Debris** (NEST, DEN) | `decor_bone_shard_floor`, `decor_stick_bundle_floor`, `decor_gnawed_bone`, `decor_fur_tuft` |
| **Scratches** (NEST, DEN, TERRITORIAL_MARK) | `decor_scratch_kneehigh`, `decor_claw_gouge_masonry`, `decor_scratch_parallel_wall` |
| **Fungal spread** (FUNGAL_PATCH) | `decor_fungus_climb_wall`, `decor_spore_puff_floor`, `decor_mycelium_thread_wall` |
| **Conduit infrastructure** (ENERGY_CONDUIT) | `decor_brass_pipe_run_wall`, `decor_oil_stain_floor`, `decor_copper_filings_floor`, `decor_warning_sign_plate` |
| **Blood** (TERRITORIAL_MARK) | `decor_blood_dot_floor` |

### 5b. Tier 2 sprite catalog (Botanical — 9 sprites)

| Batch | Sprites |
|-------|---------|
| **Flora flowers** (SHRUB) | `decor_white_clover_floor`, `decor_grass_tuft_floor` |
| **Leaf litter** (SHRUB, TREE) | `decor_fallen_leaf_floor`, `decor_leaf_litter_floor`, `decor_twig_bundle_floor` |
| **Tree-base flora** (TREE) | `decor_mushroom_cluster_floor`, `decor_acorn_seed_floor`, `decor_moss_patch_floor`, `decor_fallen_branch_floor` |

### 5c. Tier 3 sprite catalog (Infrastructure & street — 12 new sprites)

| Batch | Sprites |
|-------|---------|
| **Overgrowth** (FENCE, PILLAR) | `decor_vine_climb_wall`, `decor_ivy_climb_wall` |
| **Masonry weathering** (PILLAR) | `decor_stone_chip_floor` (reuses Tier 2 `decor_moss_patch_floor`) |
| **Wet-edge flora** (WATER) | `decor_reed_tuft_floor`, `decor_lily_pad_floor`, `decor_wet_soil_floor`, `decor_dragonfly_hover` |
| **Fire scatter** (BONFIRE, CITY_BONFIRE) | `decor_ash_scatter_floor`, `decor_ember_chunk_floor`, `decor_scorch_mark_floor` |
| **Dust spread** (DETRITUS) | `decor_dust_smear_floor`, `decor_paper_scrap_floor` |

### 5d. Sprite sharing across tiers

Several sprites are intentionally reused across tiers so the visual
library stays compact. The full authoring roster is **40 unique
sprites** (Tier 1 = 19, Tier 2 = 9, Tier 3 = 12 new). Tier 3 also
references 3 sprites already authored in Tier 2 (`decor_grass_tuft_floor`,
`decor_white_clover_floor`, `decor_moss_patch_floor`) — those count
once toward the 40, not twice. Shared sprites:

| Sprite | Authored in | Reused in | Used by |
|--------|-------------|-----------|---------|
| `decor_grass_tuft_floor` | T2 (SHRUB) | T3 (FENCE) | SHRUB, FENCE |
| `decor_white_clover_floor` | T2 (SHRUB) | T3 (FENCE) | SHRUB, FENCE |
| `decor_moss_patch_floor` | T2 (TREE) | T3 (PILLAR) | TREE, PILLAR |

### 5e. Authoring cost + format

All procedural via TextureAtlas — no hand-painted art required. Most
are 16×16 or 24×24 pixel art; wall-run pipes and guano streaks are
24×64 (vertical aspect); `decor_leaf_litter_floor` is 48×48 (larger
footprint so it carpets the cell). Authoring time estimate: ~45
minutes per sprite average.

- Tier 1: 19 sprites × 45 min ≈ 14 hours
- Tier 2: 9 sprites × 45 min ≈ 7 hours
- Tier 3: 12 new sprites × 45 min ≈ 9 hours (several are variations
  on existing patterns — ash is a tinted `decor_dust_*`, ember is a
  glow-pass over `decor_copper_filings_floor`, so effective cost
  trends lower than the raw 9 hours if the variant pipeline is set
  up first)

**Total full-roster authoring**: ~30 hours across three tiers.
Tier 1 alone is the Jam-scope budget (~14h); Tier 2 is post-Jam
polish week 1 (+7h); Tier 3 is post-Jam polish week 2+ (+9h).

---

## 6. Reactive decor states (Phase 2)

Decor responds to world events:

| Trigger | Decor response |
|---------|----------------|
| Creature killed in tile | +50% ambient-blood decor in the kill tile (30s decay) |
| Nest destroyed | Scatter +8 `decor_bone_shard_floor` in a 2-tile radius |
| Conduit DEAD (DOC-119) | All `decor_brass_pipe_run_wall` on the same floor drop their cyan-glow overlay |
| Pressure washer hits decor | Decor converts to `decor_wet_*` variant for 2 min, then despawns |
| Fungal patch killed | `decor_fungus_climb_wall` on adjacent walls wilt (texture swap) within 5s |

This ties directly into DOC-119 (conduit hazard) and DOC-118 (cleaning
ledger) — every decor hit by the washer logs a low-weight cleanup
event.

---

## 7. Performance budget

Upper bound by tier (20×20 floor):

| Tier | Source tile density | Decor instances (est.) |
|------|--------------------:|----------------------:|
| Tier 1 (creature) | ~15 tiles | ~12 instances |
| Tier 2 (botanical) | ~20 tiles (SHRUB+TREE on exterior) | ~30 instances |
| Tier 3 (infra) | ~25 tiles (FENCE+PILLAR+WATER+BONFIRE+DETRITUS) | ~45 instances |
| **Combined** | ~60 source tiles | **~85 decor instances** |

Raycaster sprite system handles 100+ instances already, so the
combined Tier 1+2+3 load stays within budget on exterior floors
(the densest case). Dungeon floors are mostly Tier 1 only and stay
near the ~12 instance baseline.

Distance cull: decor beyond 8 tiles from the player is skipped in the
render pass. Spawn is one-shot at floor load and unaffected.
Existing sprite-cull logic handles the per-frame culling cost.

Memory: each entry is a fixed-shape object (`{spriteId, x, y, placement, uvJitter}`),
~48 bytes. 85 entries × 48B = ~4KB per floor at the upper bound.
Negligible.

If the combined Tier 1+2+3 load starts exceeding the sprite cap on
dense exterior floors, the first lever is to reduce Tier 3 rates on
the high-density ground-cover entries (`decor_ash_scatter_floor`,
`decor_leaf_litter_floor`, `decor_wet_soil_floor`) — these are the
biggest instance-count contributors by design.

---

## 8. Priority order

### 8a. Tier 1 rollout (Jam scope)

1. **Data scaffolding** — `AdjacentDecorMap` module + schema + floor-
   load spawn pass wired to an empty sprite list so the pipe is
   exercised before any art lands. Blocking for DOC-118 ledger hooks.
2. **Feather + bone + scratch sprites** — highest-impact visual
   return per sprite authored, simple procedural generators. **See
   [`DOC-117_TIER1_SPRITE_TAXONOMY.md`](DOC-117_TIER1_SPRITE_TAXONOMY.md)**
   for the six-primitive helper design that all 19 Tier 1 sprites
   compose over. Implementation must start with the primitives before
   any sprite generator is written.
3. **Fungal spread + blood decor** — next visual-impact tier. Fungal
   wall-climb needs a gradient-blend against existing fog that's
   worth getting right.
4. **Conduit infrastructure decor** — pairs with DOC-119 so the dead-
   state propagation reads correctly across a hallway.

### 8b. Tier 2 rollout (post-Jam polish — botanical)

5. **Add `neighborTiles` field to schema** — spawn-pass guard before
   any Tier 2/3 sprite can land. Filter-rejection determinism rule
   (see §3) must ship with it.
6. **SHRUB botanical (§1g)** — clover + grass tuft + fallen leaf.
   Exterior boardwalk tile reads (Promenade floor "1") benefit the
   most; add SHRUB tiles near hedgerows to exercise the system.
7. **TREE botanical (§1h)** — mushroom cluster + acorn + leaf litter +
   moss patch + fallen branch. Higher sprite count but all share the
   "small forest-floor decal" authoring archetype.

### 8c. Tier 3 rollout (post-Jam polish — infrastructure)

8. **FENCE + PILLAR overgrowth (§1i, §1j)** — vine / ivy climbers +
   stone chips. The first *self-decor* case (vines on the fence's
   own face) exercises the `directions: facing-tile` + `neighborTiles:
   [T.FENCE]` combination.
9. **WATER wet-edge (§1k)** — reeds, lily pads, wet soil, dragonfly.
   Biome-tint handling (see §9) lands here because dragonfly silhouette
   must vary by biome to read as "correct" flora.
10. **BONFIRE / CITY_BONFIRE ash ring (§1l)** — ash + embers + scorch
    marks. Pairs with the existing CITY_BONFIRE freeform tile on the
    Promenade so the town-square bonfire gets its footprint on day 1.
11. **DETRITUS dust spread (§1m)** — dust smears + paper scraps. Small
    tier but ties DOC-118 evidence ledger's most-frequent cleanup
    events into a visual signature.

### 8d. Ongoing / cross-tier

12. **Reactive decor states (phase 2)** — post-Jam. See §6.
13. **Extended `directions` modes** (`inline`, `primaryFacing`) — needed
    for conduit pipe-runs + WATER lily pads; non-blocking for the other
    tiles which can ship with `cardinal` only.
14. **Blockout-visualizer preview pass** — run the same spawn logic in
    `tools/blockout-visualizer.html` so authors can see decor
    in-editor without loading the game.

---

## 9. Open questions

### 9a. Tier 1 (creature ecology) — originally drafted

- **Do decor sprites block `isWalkable`?** Default: no. They're cosmetic.
  Revisit if playtesters trip over the illusion.
- **Save-state stability.** If the spawn seed derivation changes
  between versions, players on save games see their decor shift. Pin
  the algorithm or version the seed input — either approach is fine,
  but pick one before the first public build.

### 9b. Tier 2 / Tier 3 filter + self-decor

- **`neighborTiles` determinism — pre-roll guard vs. post-roll drop.**
  The spec (§3) pins the filter as a **pre-roll guard**: a rejected
  neighbor does not consume an RNG draw, so tweaking the allowlist
  later doesn't ripple through unrelated decor placements. Alternative
  is a post-roll drop (always roll, then discard if the neighbor tile
  doesn't match) which would make rate math easier to reason about at
  the cost of breaking determinism on every config edit. Pre-roll wins
  as long as we don't need "effective rate = declared rate" semantics.
  Revisit if playtest tuning is ever blocked on this.
- **Self-decor semantics — does the source tile count as its own
  neighbor?** Currently specced via the `directions: facing-tile` +
  `neighborTiles: [sourceTileId]` combination (see §1i FENCE vines,
  §1k WATER lily pads). Open: should we add an explicit
  `directions: self` mode, or is overloading `facing-tile` + the
  neighborTiles allowlist clear enough? Lean toward keeping the
  combination — adding a mode for a rare case duplicates surface area.
- **Multi-source overlap — a GRASS tile neighboring both a SHRUB and
  a TREE.** Both configs roll independently on the shared neighbor.
  This is the intended behaviour (layered flora reads as denser
  ecology), but rates were tuned assuming single-source. If playtest
  shows overcrowding at SHRUB/TREE intersections, introduce a per-
  neighbor max-decor cap (post-roll pruning, deterministic by
  `(x,y)` hash of neighbor cell).

### 9c. Biome tint handling

- **Which Tier 2 sprites tint with biome accent?** Mushrooms vary
  convincingly across biomes (red/brown/yellow caps), so
  `decor_mushroom_cluster_floor` should set `biomeTint: true`. Leaf
  litter, fallen leaves, and moss should also tint (green moss in
  forest biome, brown moss in crypt biome). Acorns, twigs, and
  branches stay neutral (wood brown). White clover stays white
  (it's the visual signature). Decide-and-document per sprite before
  authoring, not during authoring.
- **Tier 3 tint rules.** Stone chips, reeds, lily pads → neutral.
  Ash, ember, scorch → fixed palette (fire doesn't tint by biome).
  Vines / ivy → tint with biome's foliage accent. Dust / paper
  scraps → tint with biome's floor accent.
- **Tint source.** Read from `tools/biome-map.json` at floor load and
  cache on the Raycaster. No per-frame lookup.

### 9d. Rollout-level

- **Authoring order for Tier 2 sprites — procedural vs. hand-tuned.**
  All Tier 2 sprites can be generated by the same procedural pipeline
  as Tier 1 creature decor (TextureAtlas), but mushrooms and clover
  may benefit from a hand-tuned base sprite that the tint layer then
  recolours. 45 min/sprite average assumes mixed approach.
- **Tier 3 trigger timing vs. DOC-118.** DOC-118 ledger hooks assume
  Tier 1 is live; Tier 3 `decor_scorch_mark_floor` under BONFIRE is
  the first decor that could be cleaned by the washer for a cleanup
  credit. Confirm the ledger weights for tier-3 sprites before
  shipping — ash scatter should be a high-frequency, low-value entry.

---

## 10. Reference material

- Creature tiles (Tier 1 source): DOC-115 §2a, §2b
- Botanical + infrastructure tile constants (Tier 2 / Tier 3 sources +
  targets): `engine/tiles.js` — TILES.TREE (21), TREE_SQ (85),
  SHRUB (22), FENCE (35), PILLAR (10), WATER (9), BONFIRE (18),
  CITY_BONFIRE (69), DETRITUS (39), GRASS (34), PATH (33), ROAD (32)
- Environmental-tile audit justifying Tier 3 source selection:
  DOC-112 §3.9 (`docs/BOXFORGE_PEEK_COVERAGE_MATRIX.md`)
- Raycaster wall-decor map hook: `engine/raycaster.js` — look for the
  existing `_wallDecorMap` getter in the `bind({ getters })` block,
  extend with `_floorDecorMap`
- Sprite rendering: `engine/raycaster-sprites.js`
- Seed RNG: `engine/seeded-rng.js` (Layer 0)
- Texture generator pattern: DOC-115 §2c
- Biome accent source (Tier 2 / Tier 3 tint): `tools/biome-map.json`
  — 12 biomes, each with `palette.accent` and `palette.foliage`
  entries. Spawn pass resolves the tint once per floor at load time.
- Hazard interaction: DOC-119 §7 (arc-lightning particle reuses the
  polyline rendering path this spec introduces). Note: DOC-119 was
  originally drafted as DOC-116, renumbered when GATE_TAXONOMY.md
  took DOC-116.
- Cleanup telemetry: DOC-118 §2 (decor-washed events log as
  low-weight ledger entries; Tier 3 ash + dust are the highest-
  frequency cleanup source → confirm ledger weights before shipping)
- Authoring pipeline — blockout-visualizer preview pass slot:
  `tools/blockout-visualizer.html` (§8d item 14 adds the
  in-editor render hook)

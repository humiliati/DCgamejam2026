# Adjacent Tile Decor System — DOC-117

> Spec for spawning small environmental sprites on the tiles that
> neighbor DOC-115 creature verb-nodes (and, later, other ecology
> tiles). These decorations "tie" each creature presence into its
> surroundings so the tile reads as lived-in rather than dropped-in.
> Drafted 2026-04-17. Extends the Raycaster wall-decor map.

---

## Problem statement

The DOC-115 creature tiles (ROOST, NEST, DEN, FUNGAL_PATCH,
ENERGY_CONDUIT, TERRITORIAL_MARK) all render correctly in isolation
but have no *footprint* on the tiles around them. A nest with no stray
bones in the corridor, a roost with no feather drifts, an energy
conduit with no pipe continuation — these read as stickers stuck to
the floor rather than infrastructure that belongs there.

The fix is a data-driven decor spawner that, at floor-load time,
reads a per-creature-tile config and scatters sprite props onto
adjacent floor + wall positions. Deterministic per floor seed, so
revisits are stable and no save-state bloat is needed.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped |
| 🟡 | Specced — pending |
| ⬜ | Open design question |

---

## 1. Decor catalog

For each creature tile, a config lists sprites to scatter on neighbors.
Placement is one of four positions per neighbor: `floor` (flat on
floor), `wall-knee` (lower 30% of wall face), `wall-mid` (middle 40%),
`wall-top` (upper 30%, ceiling-adjacent).

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

## 2. Data schema

Config lives in `engine/adjacent-decor-map.js` (new Layer 1 module):

```js
var AdjacentDecorMap = (function () {
  'use strict';

  var MAP = {
    49: [ // ROOST
      { sprite: 'decor_feather_single',    placement: 'floor',    rate: 0.18, directions: 'cardinal' },
      { sprite: 'decor_feather_tuft',      placement: 'floor',    rate: 0.06, directions: 'cardinal' },
      { sprite: 'decor_guano_streak_wall', placement: 'wall-mid', rate: 0.30, directions: 'facing-tile' },
      { sprite: 'decor_dragon_scale',      placement: 'floor',    rate: 0.02, directions: 'cardinal', minDepth: 4 }
    ],
    // … 50 NEST, 51 DEN, 52 FUNGAL_PATCH, 53 ENERGY_CONDUIT, 54 TERRITORIAL_MARK
  };

  function getConfig(tileId) { return MAP[tileId] || []; }
  return Object.freeze({ getConfig });
})();
```

The map is the whole module surface — a single `getConfig(tileId)`
query. No state. No side effects.

---

## 3. Spawn pass — floor load time

After `FloorManager.generate()` populates the grid, run:

```
for each tile T in grid:
  cfg = AdjacentDecorMap.getConfig(T.tileId)
  for each entry E in cfg:
    if E.minDepth && floorDepth < E.minDepth: continue
    for each neighbor N in filterByDirection(T, E.directions):
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

`directions` enum values:

- `cardinal` — the four cardinal neighbors (N/S/E/W).
- `adjacent-only` — the four tiles sharing an edge with the creature
  tile, regardless of walkability.
- `facing-tile` — the neighbor that faces the creature tile's "front"
  (requires the tile to declare `primaryFacing` in its contract entry).
- `inline` — neighbors that form a line through the creature tile;
  used for ENERGY_CONDUIT pipe-runs that should continue the wall
  the conduit is mounted on.
- `front 1-tile` — the single tile in the direction of the tile's
  primary facing.
- `all` — all 8 neighbors including diagonals.

---

## 5. Required new sprites

19 new sprites total, grouped for batch authoring:

| Batch | Sprites |
|-------|---------|
| **Feathers + guano** (ROOST) | `decor_feather_single`, `decor_feather_tuft`, `decor_guano_streak_wall`, `decor_dragon_scale` |
| **Debris** (NEST, DEN) | `decor_bone_shard_floor`, `decor_stick_bundle_floor`, `decor_gnawed_bone`, `decor_fur_tuft` |
| **Scratches** (NEST, DEN, TERRITORIAL_MARK) | `decor_scratch_kneehigh`, `decor_claw_gouge_masonry`, `decor_scratch_parallel_wall` |
| **Fungal spread** (FUNGAL_PATCH) | `decor_fungus_climb_wall`, `decor_spore_puff_floor`, `decor_mycelium_thread_wall` |
| **Conduit infrastructure** (ENERGY_CONDUIT) | `decor_brass_pipe_run_wall`, `decor_oil_stain_floor`, `decor_copper_filings_floor`, `decor_warning_sign_plate` |
| **Blood** (TERRITORIAL_MARK) | `decor_blood_dot_floor` |

All procedural via TextureAtlas — no hand-painted art required. Most
are 16×16 or 24×24; wall-run pipes and guano streaks are 24×64
(vertical aspect). Authoring time estimate: ~45 minutes per sprite
average, so ~14 hours total.

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

Upper bound: a 20×20 dungeon with 15 creature tiles × 4 neighbors ×
~0.2 decor entries = ~12 decor instances per floor. Raycaster sprite
system handles 100+ instances already; well within budget.

Distance cull: decor beyond 8 tiles from the player is skipped in the
render pass. Spawn is one-shot at floor load and unaffected.
Existing sprite-cull logic handles the per-frame culling cost.

Memory: each entry is a fixed-shape object (`{spriteId, x, y, placement, uvJitter}`),
~48 bytes. 12 entries × 48B = 576 bytes per floor. Negligible.

---

## 8. Priority order

1. **Data scaffolding** — `AdjacentDecorMap` module + schema + floor-
   load spawn pass wired to an empty sprite list so the pipe is
   exercised before any art lands.
2. **Feather + bone + scratch sprites** — highest-impact visual
   return per sprite authored, simple procedural generators.
3. **Fungal spread + blood decor** — next visual-impact tier. Fungal
   wall-climb needs a gradient-blend against existing fog that's
   worth getting right.
4. **Conduit infrastructure decor** — pairs with DOC-119 so the dead-
   state propagation reads correctly across a hallway.
5. **Reactive decor states (phase 2)** — post-Jam.
6. **Extended `directions` modes** (`inline`, `primaryFacing`) — needed
   for conduit pipe-runs; non-blocking for the other tiles which can
   ship with `cardinal` only.

---

## 9. Open questions

- **Do decor sprites block `isWalkable`?** Default: no. They're cosmetic.
  Revisit if playtesters trip over the illusion.
- **How do decor sprites interact with biome palette tinting?** Fungal
  decor should tint with the biome's accent; conduit decor should
  not. Spec a per-sprite `biomeTint: boolean` flag.
- **Save-state stability.** If the spawn seed derivation changes
  between versions, players on save games see their decor shift. Pin
  the algorithm or version the seed input — either approach is fine,
  but pick one before the first public build.

---

## 10. Reference material

- Creature tiles: DOC-115 §2a, §2b
- Raycaster wall-decor map hook: `engine/raycaster.js` — look for the
  existing `_wallDecorMap` getter in the `bind({ getters })` block,
  extend with `_floorDecorMap`
- Sprite rendering: `engine/raycaster-sprites.js`
- Seed RNG: `engine/seeded-rng.js` (Layer 0)
- Texture generator pattern: DOC-115 §2c
- Hazard interaction: DOC-116 §7 (arc-lightning particle reuses the
  polyline rendering path this spec introduces)
- Cleanup telemetry: DOC-118 §2 (decor-washed events log as
  low-weight ledger entries)

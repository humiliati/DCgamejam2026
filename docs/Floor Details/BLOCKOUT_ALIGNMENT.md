# Blockout Alignment: Vision vs Implementation

## The Density Ramp (Setting Identity)

```
Floor 0:  CAMPGROUND         — sparse, natural, introductory
Floor 1:  LOW-DENSITY RES    — small town, a few buildings, bonfire plaza
Floor 2:  BALMORA COMMERCIAL — high-density civic grid, 8+ buildings, multi-lane NPC traffic
Floor 3:  VIVEC GRAND        — ceremonial promenade, parallel lanes, horizon edge, great gate
```

This is the Morrowind progression: Seyda Neen → Balmora → Vivec. Each floor doubles the density, complexity, and sense of civilization.

---

## Gap Analysis

### Floor 0 — The Approach (Campground) ✅ MOSTLY ALIGNED with ascii bare minimum

**Vision** (FLOOR0_BLOCKOUT): Campground clearing, tree perimeter, 6 small structures (tree cluster, campfire, shack, house, facade/door to Floor 1).

**Actual** (40×30 in floor-manager.js): Tree perimeter ✓, campfire nooks ✓, central bonfire ✓, pillar arcades ✓, shrub funnel narrowing toward DOOR ✓, single gate to Floor 1 ✓.

**Gaps**:
- Blockout shows 6 distinct labeled structures (TREE CLST, CAMP FIRE, SHACK BLD, HOUSE BLD). Actual has no freestanding building footprints — just campfire alcoves in shrub walls.
- Blockout envisions these as small rectangles with `--` door gaps. Actual uses open alcoves, not enclosed rooms.
- Missing: 2-3 small shack-like enclosed structures (even if just 3×3 wall rooms with a door gap) to read as "buildings you can peek into" before entering Floor 1's real buildings.

**Severity**: Low. Current layout reads as campground. Adding 2-3 enclosed shack footprints would complete it.

**Proposed changes**:
- Convert 2 of the campfire alcoves (rows 8-10 and rows 18-19) into enclosed 4×3 shack rooms with DOOR gaps
- Keep the rest as open campfire clearings
- No gameplay change needed — just wall+door tiles

---

### Floor 1 — The Promenade ⚠️ PARTIALLY ALIGNED (identity mismatch)

**Vision** (FLOOR1_BLOCKOUT): **Balmora-like civic grid** — 8 named buildings (Market Court, Forge Yard, Guild Hall, Tavern, Housing Block, Archive, Temple, Shops Row), center shrub spine as navigational bridge, multi-lane NPC traffic, faction-emitting buildings, **grand facade/arch** to Floor 2.

**Actual** (40×30): Only **4 buildings** (Coral Bazaar NW, Driftwood Inn NE, Cellar Entrance W, Gleaner's Home E). Central bonfire plaza. Pillar arcades. Shrub funnel south. South gate with EXIT→Floor 0 and GATE→Floor 2.

**BUT** — the blockout labels Floor 1 as the high-density commercial zone. The actual Floor 1 is more "low-density residential" in feel. The density ramp says Floor 1 should be the stepping stone BETWEEN campground and Balmora.

**Resolution**: The current Floor 1 IS the right scale for "low-density residential" — the label in the blockout was aspirational for a later pass. The real Balmora-density floor should be Floor 2 (Lantern Row), which is currently way too small.

**Proposed changes for Floor 1 (keep as low-res)**:
- Rename biome concept to "Boardwalk Village" (not "Promenade" which implies grand)
- Add 2 more building footprints: a **Noticeboard Pavilion** (4×3, open-front, lore point) and a **Well/Fountain** landmark (pillar cluster replacing some open space)
- Bring total to 6 buildings (still half of Balmora scale — correct for ramp)
- **Boardwalk fence rail** on south/west map edges — FENCE tiles (0.4× half-wall, wooden rail) facing the ocean. Player looks over the rail at the ocean-depth skybox below, creating the impression of an elevated boardwalk above water. See "Boardwalk Fence Rail" section below for full rendering spec.
- The south gate should feel like passing from residential into a commercial district

**Severity**: Medium. Scale is fine, density needs a small bump, naming needs realignment.

---

### Floor 2 — Lantern Row 🔴 SEVERELY UNDERSIZED

**Vision** (FLOOR1_BLOCKOUT as the Balmora equivalent): 8 buildings, center spine, multi-lane NPC traffic, grand facade to Floor 2. FLOOR2_BLOCKOUT as promenade: longitudinal axis, grove side vs horizon side, parallel lanes.

**Actual** (24×16): Tiny. Only 2 buildings (Dispatcher's Office, Watchman's Post), 1 shop stall, 1 bonfire. Single-lane open plaza. Tree perimeter. No lanes, no axis, no horizon.

**This is the critical gap.** Floor 2 is supposed to be where civilization hits its peak density — the Balmora moment. Currently it's smaller than Floor 0.

**Proposed rebuild** (target: 48×32 or larger):

The blockout vision combines the best of FLOOR1_BLOCKOUT (Balmora grid) and FLOOR2_BLOCKOUT (promenade axis):

```
Floor 2 should be a COMMERCIAL HIGH-DENSITY district:
- 48×32 grid minimum (2× current width, 2× current height)
- Center spine: wide cobblestone artery (3-tile-wide walkable lane)
- North row: 4 building facades (Dispatcher's Office, Armorer, Chandler, Faction HQ)
- South row: 4 building facades (Watchman's Post, Apothecary, Cartographer, Tea House)
- Pillar arcades lining the spine (lantern posts = pillar tiles)
- SHOP stalls between buildings (market stall tiles)
- Shrub-fenced side alleys connecting to optional nooks
- West entry: gate from Floor 1 (DOOR_EXIT)
- East end: GRAND FACADE/ARCH to Floor 3 (DOOR → "3")
- Central bonfire at plaza intersection
- NPC density: 8-12 spawn points along the spine
```

This matches the FLOOR1_BLOCKOUT's 8-building grid with a main artery and the FLOOR2_BLOCKOUT's directional axis.

**Severity**: Critical. This is the biggest gap between vision and implementation.

---

### Floor 3 — Frontier Gate 🔴 NOT IMPLEMENTED

**Vision** (FLOOR3_BLOCKOUT): Frontier wilds — campground echo (bonfire + supply shack), sparse shack rows, very few NPCs, roaming enemies, locked gate to Floor 4. "You're no longer in a system — you're at the edge of one."

**Actual**: Floor "3" doesn't exist as an implemented exterior. Only referenced in CLAUDE.md as future content.

**Proposed implementation** (target: 48×32):

```
Floor 3 should be the DECOMPRESSION zone after Balmora density:
- Boardwalk entry stub (narrow 4-tile-wide path from Floor 2's gate)
- Tree line break → open into expansive clearing
- Central bonfire clearing (echoes Floor 0 campground)
- 1 supply shack (small building, 4×3)
- 4 sparse shack/tent footprints along a loose dirt path
- Very wide spacing between structures (isolation feeling)
- Outer boundary: soft tree line (not wall, more porous)
- South/East: locked gate to Floor 4 (BOSS_DOOR or locked DOOR)
- Enemy spawn zones (x markers in blockout → TILES that trigger encounters)
- NPC density: 2-3 maximum (scavenger, watch, caretaker)
```

**Severity**: High. Needed for Act 1 narrative completion (Floor 3 = frontier before the deep vaults).

---

## Priority Order

1. **Floor 2 rebuild** (critical — this is the Balmora moment, currently 24×16 → needs 48×32+)
2. **Floor 3 creation** (high — needed for the density decompression and narrative closure)
3. **Floor 1 density bump** (medium — add 2 buildings, rename to "village")
4. **Floor 0 shack footprints** (low — add 2-3 enclosed rooms to existing alcoves)

## Floor Tile Texture Composition ✅ A4.5 DONE

The exterior floors need 3 distinct walkable surface types to create
readable ground planes. The raycaster already supports per-tile floor
textures via `tileFloorTextures` in the spatial contract.

### Three walkable tile types ✅ Implemented

| Tile | Constant | Floor Texture | Use | Status |
|------|----------|---------------|-----|--------|
| ROAD | `TILES.ROAD = 32` | `floor_cobble` (existing) | Main avenues, civic spines | ✅ Done |
| PATH | `TILES.PATH = 33` | `floor_dirt` (existing) | Connecting trails, alleys | ✅ Done |
| GRASS | `TILES.GRASS = 34` | `floor_grass` (existing) | Open meadows, camp clearings | ✅ Done |

All three are walkable (`isWalkable: true`), non-opaque. They differ
only in which floor texture the raycaster samples. The existing
`tileFloorTextures` contract field handles this without raycaster changes.

### Blockout implications

Floor 0 (Campground): GRASS dominant, PATH for trails between camps,
ROAD for the paved approach to the building entrance.

Floor 1 (Boardwalk Village): ROAD for main walkways between buildings,
PATH for side alleys and shortcuts, GRASS around building perimeters.

Floor 2 (Lantern Row): ROAD dominant (civic grid), PATH for narrow
side alleys, minimal GRASS (urban).

Floor 3 (Frontier Gate): PATH dominant, GRASS for clearings, ROAD
only for the entry stub from Floor 2.

### Tile transition blending (POST-JAM stretch goal, 4-6h)

At tile boundaries, the floor texture should bleed contextually:

- **Grass → Dirt**: Dense Grey-Scott reaction-diffusion vein pattern
  (grass creeps heavily onto dirt edges). Uses the same algorithm as
  the existing `floor_grass_stone` texture.
- **Grass → Road**: Light Grey-Scott (grass barely encroaches on cobble).
- **Dirt → Road**: Thin dust scatter at boundary (no Grey-Scott, just
  noise falloff).

**Architecture**: Pre-compute transition textures at init time. For each
tile, check its 4 neighbors. If a neighbor has a different surface type,
select a pre-blended edge texture instead of the base texture. This
avoids per-pixel neighbor lookups in the floor casting hot loop.

Transition texture set: ~12 variants (3 types × 4 edges, some symmetric).
Generated by TextureAtlas using the Grey-Scott pipeline already proven
in `floor_grass_stone`.

**Cost**: ~4-6h implementation. The pre-computed approach has zero
runtime cost — same per-pixel texture lookup, just smarter selection.

### Clover meadow + bee particles (POST-JAM delight feature, 2-3h)

When 5+ GRASS tiles form a contiguous cluster (flood-fill detect at
floor setup), spawn a `CLOVER` variant at the cluster center:

- Floor texture: `floor_clover` (grass base + white clover flowers)
- Particle emitter: 2-3 bee-like particles orbiting the tile at 150%
  tile radius. World-anchored (project through sprite math), z-buffered.
- Particles use the existing raycaster particle pool but with a
  world-position anchor instead of screen-space spawn.

This is pure atmospheric polish — no gameplay impact. Document for
post-jam.

---

## Boardwalk Fence Rail — Half-Wall See-Through Structure ✅ A4.5 (jam scope)

Floor 1 (Boardwalk Village) needs a water-facing edge that reads as an
elevated boardwalk with a railing. The player should be able to look
*over* the fence rail at the ocean floor skybox below and the sky skybox
above, creating the impression of significant elevation above water. Looking
*along* the fence rail from one end should produce a strong parallax depth
cue — many short wall columns receding into the distance, each showing sky
and ocean between posts.

### Tile type: FENCE

```
TILES.FENCE = 35
isWalkable: false   (blocks movement — you can't walk off the boardwalk)
isOpaque:   true    (blocks raycasting — short but solid, triggers N-layer)
```

A FENCE tile is a half-wall like SHRUB, but its visual identity is
architectural (wooden rail, metal pipe, chainlink mesh) rather than organic.

### Wall height and rendering model

```
tileWallHeights[TILES.FENCE] = 0.4   (40% of contract wallHeight)
```

At 0.4× height, the fence rail sits below the player's eye line. The
N-layer DDA already handles this: the raycaster hits the short fence,
records it as layer 0, then continues stepping through the grid. Behind
the fence there is no wall — the ray terminates at max distance, and the
back-to-front renderer paints the skybox first, then overlays the short
fence column. The upper 60% of the column shows sky + ocean naturally.

This is the same rendering path that SHRUB (0.5×) uses today. No
raycaster architecture changes needed.

### Fence texture variants

Three material variants, selected per-floor or per-tile via the spatial
contract texture overrides:

| Variant | Texture ID | Visual | Primary Floor |
|---------|-----------|--------|---------------|
| Wooden rail | `fence_wood` | Horizontal planks, dark stain, post verticals every 25% width | Floor 1 (Boardwalk Village) |
| Metal pipe | `fence_metal` | Thin horizontal bars, weathered grey, riveted posts | Floor 2 (Lantern Row rooftops) |
| Chainlink web | `fence_chain` | Diamond mesh pattern with alpha transparency, metal frame | Floor 3 (Frontier perimeter) |

All three are generated by TextureAtlas at WALL_SIZE resolution. The
wooden and metal variants are fully opaque textures — the "see-over"
effect comes from the half-height rendering alone.

### Chainlink mesh: alpha-transparent fence texture

The chainlink variant (`fence_chain`) has **per-pixel alpha** in the
mesh area — the diamond wire pattern is opaque but the gaps between
wires are transparent. This lets the player see the skybox *through*
the fence, not just *over* it.

**Rendering dependency**: The current raycaster draws wall columns as
opaque strips (`drawImage` with no alpha compositing). Rendering a
wall texture with transparent pixels requires the same per-column
alpha blend pass described in COBWEB_TRAP_STRATEGY_ROADMAP Phase 4.2
("third-space rendering"). Specifically:

1. The N-layer back-to-front loop already paints background layers
   (skybox, distant walls) before foreground layers.
2. For tiles flagged as `alphaWall: true` in the spatial contract,
   the foreground wall draw uses `globalCompositeOperation = 'source-over'`
   instead of the opaque fast path, allowing transparent pixels in the
   wall texture to reveal the already-painted background.
3. This is the same code path cobweb sail rendering will need
   (COBWEB Phase 4.2). Implementing it for fence_chain unblocks cobwebs
   for free.

**Jam scope**: Wooden rail (fully opaque, no alpha path needed) is the
jam-scope deliverable for Floor 1. Chainlink mesh is post-jam polish
sharing the cobweb alpha pipeline.

### Procedural texture generation

```
_genFenceWood(id, opts):
  - WALL_SIZE × WALL_SIZE canvas
  - 3 horizontal plank bands (each ~30% of height, dark wood grain)
  - 2 vertical posts at x=0 and x=75% (thicker, darker)
  - Subtle grain noise per plank (reuse wood noise from existing textures)
  - Top rail highlight (1px lighter strip at y=0)

_genFenceChain(id, opts):
  - WALL_SIZE × WALL_SIZE canvas
  - Metal frame: 2px border on all sides (opaque grey)
  - Diamond mesh: for each pixel, compute (x+y)%period and (x-y)%period
    — pixel is opaque wire if either modulus < wireWidth, else alpha=0
  - Wire color: dark grey with subtle highlight on NW-facing diagonals
  - Frame posts at x=0 and x=75% (same rhythm as wood variant)
```

### Blockout placement

Floor 1 (Boardwalk Village): FENCE tiles line the **south and west edges**
of the map grid, forming the boardwalk railing. The ocean is "below" —
the exterior skybox renders ocean-floor tones at the bottom and sky at
the top. Buildings sit on the north/east side of the walkways, fence
rail on the water side.

```
Schematic (Floor 1 south edge, top-down):
  ROAD ROAD ROAD ROAD ROAD ROAD    ← main boardwalk path
  FENCE FENCE FENCE FENCE FENCE    ← railing facing water
  (skybox ocean below)
```

Floor 3 (Frontier Gate): Sparse FENCE segments along the perimeter where
the settlement meets the wild — chainlink variant, with gaps (missing
fence tiles) implying decay and breach points.

### Elevation impression

The boardwalk's "height above water" feeling comes from three combined
cues, none of which require actual multi-level geometry:

1. **Half-height fence**: 0.4× wall height means the rail sits well
   below the horizon. Looking over it, the player's gaze falls to the
   lower portion of the skybox — which should be painted as deep ocean
   or distant water surface (handled by skybox preset per floor).

2. **Parallax along the rail**: A long row of FENCE tiles creates many
   short wall columns that recede to a vanishing point. Between each
   post, the sky/ocean is visible. This rhythmic occlusion pattern
   reads as "elevated walkway with gaps in the railing" — the same
   depth cue as looking down a real pier railing.

3. **Floor texture contrast**: The boardwalk path (ROAD tiles) uses a
   wood-plank floor texture (`floor_boardwalk` — new, see Texture Atlas
   Needs). The floor texture stops at the fence tile. Beyond the fence,
   there is no floor — just the skybox void. This hard edge between
   solid flooring and void reinforces the elevation drop-off.

### Skybox contract for ocean visibility

The exterior spatial contracts need a skybox preset that reads as
"elevated above water":

```
Floor 1 skybox: {
  skyTop:    '#4a7fb5',   // bright day sky
  skyBottom: '#87CEEB',   // lighter horizon
  floorTop:  '#1a3a5c',  // deep ocean (near horizon)
  floorBottom: '#0a1a2e' // abyss (directly below)
}
```

The existing skybox renderer paints `floorTop → floorBottom` as a
gradient below the horizon. When the player looks over a half-height
fence, the floor gradient is visible in the gap — reading as ocean
depth below the boardwalk.

### Raycaster dependency summary

| Dependency | Status | Step |
|------------|--------|------|
| N-layer multi-hit DDA (continues past short walls) | ✅ Done | A1 |
| tileWallHeights per-tile height override | ✅ Done | A2 |
| Back-to-front layer compositing | ✅ Done | A1 |
| Half-height wall bottom-anchored rendering | ✅ Done | A2 (SHRUB) |
| FENCE tile constant + isOpaque registration | ✅ Done | A4.5 |
| `fence_wood` procedural texture | ✅ Done | A4.5 |
| Opaque half-wall fence rendering (wooden rail) | ✅ Free | Already works via tileWallHeights |
| Alpha-transparent wall texture path | Needed (post-jam) | Shared with Cobweb Phase 4.2 |
| `fence_chain` procedural texture | Needed (post-jam) | After alpha wall path |
| `floor_boardwalk` floor texture | ✅ Done | A4.5 |
| Ocean-depth skybox preset for Floor 1 | Needed | B1 (skybox presets) |

---

## Texture Atlas Needs (New)

For the expanded floors, new textures needed:

- **Cobblestone road** — for Floor 2 spine (distinct from dirt path)
- **Market stall awning** — for SHOP tiles in Floor 2 (colored canvas texture)
- **Lantern post** — variant pillar texture with warm glow (Floor 2 identity)
- **Gate/arch stonework** — for Floor 2→3 grand facade (ceremonial, overscaled)
- **Frontier dirt** — for Floor 3 ground (degraded, wild, not cobble)
- **Tent canvas** — for Floor 3 shack buildings (not the same stone as town)
- **Locked gate iron** — for Floor 3→4 locked passage (heavy, intentional)
- **Wooden fence rail** (`fence_wood`) — for Floor 1 boardwalk railing (horizontal planks + posts) ✅ Done (A4.5)
- **Chainlink fence** (`fence_chain`) — for Floor 3 perimeter (diamond mesh + alpha, post-jam)
- **Metal pipe fence** (`fence_metal`) — for Floor 2 rooftop edges (thin bars, rivets, post-jam)
- **Boardwalk planks** (`floor_boardwalk`) — wood-plank floor texture for elevated walkway surface ✅ Done (A4.5)

## NPC Density Ramp

| Floor | NPCs | Verb Palette | Traffic Pattern |
|-------|------|-------------|-----------------|
| 0 | 1-2 | idle, observe | stationary near campfires |
| 1 | 3-5 | walk, barter, idle | short loops between buildings |
| 2 | 8-12 | trade, haul, patrol, recruit, pray | multi-lane spine traffic, faction territories |
| 3 | 2-3 | watch, scavenge, tend | long slow patrols, high idle time |

## Building Archetype Templates

### Small (Floor 0, 3): 4×3 or 5×3
```
1 1 1 1
1 0 0 1
1 0 2 1   ← door on south face
```

### Medium (Floor 1): 6×4 or 8×4
```
1 1 1 1 1 1
1 0 0 0 0 1
1 0 0 0 0 1
1 1 2 1 1 1   ← door on south face
```

### Large (Floor 2): 8×6 (L-shape, T-shape, courtyard variations)
```
1 1 1 1 1 1 1 1
1 0 0 0 0 0 0 1
1 0 0 0 0 0 0 1
1 0 0 0 1 1 1 1   ← L-shape
1 0 0 0 0 0 0 1
1 1 1 2 1 1 1 1
```

These templates get composed into interiors as floor N.N children.

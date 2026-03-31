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

### Floor 0 — The Approach (Campground) ✅ MOSTLY ALIGNED

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

## Texture Atlas Needs (New)

For the expanded floors, new textures needed:

- **Cobblestone road** — for Floor 2 spine (distinct from dirt path)
- **Market stall awning** — for SHOP tiles in Floor 2 (colored canvas texture)
- **Lantern post** — variant pillar texture with warm glow (Floor 2 identity)
- **Gate/arch stonework** — for Floor 2→3 grand facade (ceremonial, overscaled)
- **Frontier dirt** — for Floor 3 ground (degraded, wild, not cobble)
- **Tent canvas** — for Floor 3 shack buildings (not the same stone as town)
- **Locked gate iron** — for Floor 3→4 locked passage (heavy, intentional)

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

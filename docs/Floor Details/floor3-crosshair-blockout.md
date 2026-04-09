# Floor 3 — The Garrison (Crosshair Blockout)

> **Grid**: 52×52  |  **Biome**: frontier  |  **Authored**: hand
> **Spawn**: west arm, facing EAST  |  **Entry**: DOOR_EXIT(west) → Floor 2
> **Exits**: DOOR(north facade) → Floor 3.1 (Armory/Barracks),
>            DOOR(east arch) → Floor 4 (Vivec)

---

## Shape — Top-Down Crosshair

The floor reads as a + shape. Four arms radiate from a central hub.
Player enters from the west (arriving from Floor 2 east gate).

```
                    NORTH ARM
              ┌─────────────────┐
              │ TT   FACADE   ~~│  ← trees left, water right
              │ TT     D     ~~│     facade door → Floor 3.1
              │ TT   #####  BB~│     (Armory / Barracks)
              │ TT   .....  BB~│
              │ TT   .....  ~~│
              │ TT   .....  ~~│
              │ forest  | water│
              │  cozy   | bwalk│
              └────┐    │  ┌───┘
                   │    │  │
     WEST ARM      │ CENTER│       EAST ARM
  ┌────────────────┤    │  ├──────────────────────┐
  │                │    │  │   HHHHHHHHHHHHHHHHHHHH│  ← highway (wide)
  │  entry path    │ ██████│   HHHHHHHHHHHHHHHHHHHH│
  │  from Floor 2  │ █ ⌂ █│   HHHHHHHHHHHHHHHHHHHH│
  │  X─────────────│ █TOWR█│───HHHHHHHHHHHHHH##D##│  → GRAND ARCH → F4
  │  (gate)        │ ██████│   ....................│
  │                │ SLUM  │   BBBBBBBBBBBBBBBBBBBB│  ← boardwalk below hwy
  │                │ ring  │   FFFFFFFFFFFFFFFFFFFF│  ← fence along bottom
  └────────────────┤       ├──────────────────────┘
                   │       │
              ┌────┘       └───┐
              │   SOUTH ARM    │
              │                │
              │   FBBBBBBBF    │  ← narrow boardwalk pier
              │   F       F    │
              │   F       F    │
              │   F       F    │
              │   F  CCC  F    │  ← crates (dead end)
              │   F   @   F    │  ← fisherman NPC
              │   FFFFFFFFF    │
              │   ~~~~~~~~~~~  │  ← water beneath
              └────────────────┘
```

---

## Arm Specs

### CENTER — Guard Tower + Slum Ring (~16×16)
```
  rows 18–33, cols 18–33

  TTTTTTTTTTTTTTTT
  T..............T
  T..##..##..##..T
  T..#...#...#...T    ← slum shacks (irregular WALL clusters)
  T..##..##..##..T
  T..............T
  T....######....T
  T....#    #....T
  T....# ⌂  #....T    ← GUARD TOWER (nested WALL box, maybe PILLAR corners)
  T....#    #....T
  T....######....T
  T..............T
  T..##..##..##..T
  T..#...#...#...T    ← more slum shacks
  T..##..##..##..T
  T..............T
```
- Tower: 6×6 WALL structure at dead center, PILLAR corners
- Slum ring: scattered 2×3 and 3×2 WALL clusters (shacks) in the ring
- Floor: PATH (dirt/worn planks) — gritty, not clean cobblestone
- Bonfire near tower? Or save that for south boardwalk atmosphere
- **No nested interior for the tower** (jam scope). It's a landmark, not enterable.

### WEST ARM — Entry from Floor 2 (~18 wide × 8 tall)
```
  rows 22–29, cols 0–17

  TTTTTTTTTTTTTTTTTT
  T................T
  T.PPPPPPPPPPPPP.T    ← path corridor (dirt, worn)
  XD.............→ CENTER    ← DOOR_EXIT at (0, 25)/(0, 26) → Floor 2
  XD.............→ CENTER
  T.PPPPPPPPPPPPP.T
  T................T
  TTTTTTTTTTTTTTTT
```
- Narrow-ish entry path flanked by TREE border
- DOOR_EXIT tiles at western edge → Floor 2
- PATH tiles as the main walking surface
- Shrub / tree lining both sides
- This is the "tight boardwalk entry → tree break" threshold from the old concept doc

### EAST ARM — Highway to Vivec (~18 wide × 12 tall)
```
  rows 20–31, cols 35–51

  TTTTTTTTTTTTTTTTTT
  T................T
  T.HHHHHHHHHHH.###T
  T.HHHHHHHHHHH.#D#T    ← GRAND ARCH facade, DOOR at ~(50, 25) → Floor 4
  T.HHHHHHHHHHH.###T
  T.HHHHHHHHHHH....T    ← highway = 4-wide ROAD
  T................T
  T.BBBBBBBBBBBBBBBT    ← boardwalk strip (PATH, floor_boardwalk texture)
  T.FFFFFFFFFFFFF.T    ← fence railing along south edge
  T.~~~~~~~~~~~~~.T    ← water visible below fence
  T.~~~~~~~~~~~~~.T
  TTTTTTTTTTTTTTTTTT
```
- ROAD tiles 4 wide (the highway — dominant forward pull)
- PATH boardwalk strip 2 wide below highway
- FENCE railing along south edge of boardwalk
- WATER tiles below fence (connects to Floor 2's waterfront visually)
- Grand arch: WALL facade with DOOR at east end → Floor 4
- This is THE pull — wide, clean, inevitable. Vivec parallax visible through arch.

### NORTH ARM — Split: Forest West / Water East (~16 wide × 18 tall)
```
  rows 0–17, cols 18–33

  TTTTTTTTTTTTTTTT      ← tree border
  TT...........~~T
  TT..FACADE...~~T      ← building facade with DOOR → Floor 3.1
  TT..##D####.BB~T         (Armory + Barracks, nested interior)
  TT..........BB~T
  TT..........~~T
  TT..........~~T
  TT forest   ~~T      ← left half: TREE + SHRUB + GRASS (cozy)
  TT          ~~T      ← right half: WATER + BOARDWALK edge
  TT..........~~T
  TT..........~~T
  TT..........~~T
  TT..........~~T
  TT..........~~T
  T...path.....BT      ← connects to center hub
  T...path.....BT
  T.............T
  TTTTTTTTTTTTTTTT
```
- Left (west) columns: dense TREE + SHRUB — cozy forest, Floor 0 callback
- Right (east) columns: WATER tiles with BOARDWALK (PATH) strip and FENCE edge
- North terminus: WALL facade flanked by trees (left) and water (right)
- DOOR in facade → Floor 3.1 (Armory / Barracks interior)
- The split identity: nature reclaiming vs. military waterfront

### SOUTH ARM — Boardwalk Pier Dead-End (~8 wide × 18 tall)
```
  rows 34–51, cols 22–29

  ........        ← connects to center hub
  FFFBBBBFFF      ← fence + boardwalk entry
  ~~F    F~~
  ~~F    F~~      ← narrow fenced boardwalk over water
  ~~F    F~~
  ~~F    F~~
  ~~F    F~~
  ~~F CC F~~      ← crates (BREAKABLE or just WALL clusters)
  ~~F @  F~~      ← fisherman NPC position
  ~~FFFFFF~~      ← fence closure (dead end)
  ~~~~~~~~~~      ← open water
  ~~~~~~~~~~
```
- Narrow pier: 4 walkable tiles wide + FENCE on both sides + WATER flanking
- Dead-end: fence closure at bottom, crates blocking the terminus
- Fisherman NPC: stationary, facing south (looking out over water)
- Tone: melancholy, memory space. "Used to be full."
- No exit. This arm is purely atmospheric.

---

## Tile Budget

| Zone | Approx Area | Primary Tiles |
|------|-------------|---------------|
| Center (tower + slum) | 16×16 = 256 | WALL, PATH, PILLAR |
| West arm (entry) | 18×8 = 144 | PATH, TREE, DOOR_EXIT |
| East arm (highway) | 18×12 = 216 | ROAD, PATH, FENCE, WATER, WALL (arch) |
| North arm (split) | 16×18 = 288 | TREE, SHRUB, GRASS, WATER, PATH, WALL (facade) |
| South arm (pier) | 8×18 = 144 | FENCE, PATH, WATER, WALL (crates) |
| Tree perimeter / fill | ~1400 | TREE (border), WATER (corners) |
| **Total** | **52×52 = 2704** | |

---

## Door Wiring

| Position | Target | Notes |
|----------|--------|-------|
| (0, 25), (0, 26) | Floor 2 | DOOR_EXIT — west gate back to Lantern Row |
| (~25, 3) | Floor 3.1 | DOOR — north facade into Armory/Barracks |
| (~50, 25) | Floor 4 | DOOR — grand arch east into Vivec |

---

## Open Questions

1. **Tower enterable?** Currently NO (jam scope). Just a tall WALL landmark
   with PILLAR corners. Could add nested interior post-jam.
2. **Slum shack interiors?** NO. They're solid WALL clusters for atmosphere.
   Player weaves between them, doesn't enter.
3. **FloorNNN branching**: Floor 3.1 (Armory) is a nested interior, same
   pattern as Floor 2.1/2.2. But the concept doc mentioned Floor 3 having
   exterior branches (forest zone that *feels* like a separate floor).
   Solving the exterior→exterior transition (floorNNN) is post-jam.
4. **Grid size**: 52×52 suggested. Could shrink to 48×48 if the arms feel
   too long. The crosshair shape means ~40% of tiles are tree/water fill
   (the "negative space" corners between arms).
5. **Biome**: `frontier` is registered in floor-manager but has no textures
   defined yet. Needs a new skybox preset with the Vivec parallax.

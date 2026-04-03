# Floor 1 — The Promenade (Blockout)

> **Grid**: 50×36  |  **Biome**: exterior  |  **Authored**: hand
> **Spawn**: (4, 17) facing EAST  |  **Exit**: DOOR(48, 17) → Floor 2
> **Contract**: `exterior({ label: 'The Promenade', wallHeight: 1.0, renderDistance: 24, fogDistance: 20, gridSize: { w: 50, h: 36 }, skyPreset: 'sunset' })`

## Narrative Context

Player arrives from Floor 0 through the roman arch gate. The western
wall (cols 0–1) is a thick border with two EXIT doors (2,17) and (2,18)
leading back to The Approach. The eastern end has a gate at (48,17) and
(48,18) leading to Floor 2 (Lantern Row), but the Dispatcher NPC
blocks passage until the player has collected their keys from the
Gleaner's Home (1.6) in the south-center pod.

The Promenade is a small residential town with sunset lighting — warmer
and more settled than Floor 0's cedar-toned wilderness. Six pods branch
off the central E-W road (3 north, 3 south). Buildings occupy the NW,
NC, SW, and SC pods. The NE and SE pods use decorative elements
(noticeboard pavilion, well/fountain) instead of full structures. The
road is 2 tiles wide (rows 17–18). Path shoulders run along rows 16 and
19, with N-S path stubs connecting each pod to the road.

The perimeter shifts from trees (west) through shrubs (middle) to fence
(east), selling the transition from wilderness into a more urban area
as the player moves toward Lantern Row.

## Zone Descriptions

### Zone 1 — Western Border (cols 0–1)

Thick WALL columns forming the western boundary. Two DOOR_EXIT tiles at
(2,17) and (2,18) lead back to Floor 0. Gate pillars at (2,15) and
(2,20) flank the road approach.

### Zone 2 — NW Pod: Coral Bazaar (cols 5–16, rows 3–13)

Shrub-enclosed meadow with a 6×4 stone building (walls at rows 5–8,
cols 7–12). DOOR at (10,8) → Floor 1.1. Path stub runs south from
the building to the road at cols 10–11. A tree accent sits at (7,10)
near the path approach.

### Zone 3 — NC Pod: Driftwood Inn (cols 17–28, rows 3–13)

Mirror of the NW pod. 6×4 building (walls at rows 5–8, cols 19–24).
DOOR at (22,8) → Floor 1.2. Bonfire at (22,11) just south of the
building. Path stubs at cols 22–23 connect to road.

### Zone 4 — NE Pod: Noticeboard Pavilion (cols 33–44, rows 3–13)

Open pod with no full building. Four pillar tiles at (37,6), (39,6),
(37,8), (39,8) frame a central board tile at (38,7). Tree accents at
(35,5), (41,5), (35,7), (41,7), (35,9), (41,9) provide vertical
rhythm. Path stubs at cols 36–37 connect south.

### Zone 5 — SW Pod: Storm Shelter (cols 5–16, rows 23–32)

Municipal civil defense shelter. 4×3 building (walls at rows 27–29,
cols 8–11). DOOR at (10,27) → Floor 1.3. Above ground reads as a small
civic structure — cots, faded evacuation posters, a dead emergency radio.
The basement (1.3.1) is the faction-aligned dungeon; whatever faction
controls it moved in after the shelter fell out of use. The building
itself is faction-neutral municipal infrastructure — no narrative
conflict with Gleaners passing through. Tree accent at (7,24). Path
stubs at cols 10–11 connect north to road.

### Zone 6 — SC Pod: Gleaner's Home (cols 17–28, rows 23–32)

Player's assigned bunk. 4×3 building (walls at rows 27–29, cols 20–23).
DOOR at (22,27) → Floor 1.6. MAILBOX at (22,25) — 2 tiles north of the
door on the path approach. Bonfire at (19,24) in the western corner of
the pod. Path stubs at cols 22–23 connect north to road.

The Dispatcher directs the player here to collect keys and assignment
card before Floor 2 access is granted.

### Zone 7 — SE Pod: Well/Fountain (cols 33–44, rows 23–32)

Open pod with a pillar cluster at (38,27), (39,27), (38,28), (39,28)
representing a well or fountain landmark. Tree accents at (35,24),
(41,24), (35,27), (41,27), (35,29), (41,29). Path stubs at cols 36–37
connect north.

### Zone 8 — Road Corridor (rows 15–20, full width)

Central E-W spine. Road tiles (32) on rows 17–18 from the west gate to
the east gate. Path shoulders (33) on rows 16 and 19. Pillar arcades on
rows 14 and 21 with pillars at regular intervals (cols 8, 14, 20, 26,
34, 40) flanking the path stubs. Gate pillars at (2,15), (2,20) west
and (47,15), (47,20) east.

Bonfire at (24,17) sits on the road as a mid-promenade rest point.
Road is 2-wide so the player can walk past on row 18.

### Zone 9 — Eastern Gate (cols 45–49)

Fence-bordered approach to Floor 2. Two DOOR tiles at (48,17) and
(48,18) lead to Lantern Row. Floor tiles flank the doors at (47,17),
(47,18) and (49,17), (49,18). The Dispatcher NPC at (42,17) patrols
this approach and blocks passage until quest conditions are met.

## Key Tiles

| Tile | ID | Texture | Height | Notes |
|------|----|---------|--------|-------|
| FLOOR | 0 | — | — | Open ground inside pods |
| WALL | 1 | stone_rough | 2.0 | Building walls, border walls |
| DOOR | 2 | — | — | Forward doors to interiors / Floor 2 |
| DOOR_EXIT | 4 | — | — | Back to Floor 0 |
| PILLAR | 10 | stone_rough | 1.5 | Decorative arcade columns |
| BONFIRE | 18 | — | — | Rest points (3 total) |
| TREE | 21 | bark_oak | 2.0 | Border + accents (full-height, blocking) |
| SHRUB | 22 | hedge_leaf | 0.5 | Half-height pod walls (see-over) |
| ROAD | 32 | floor_cobble | — | E-W cobblestone avenue |
| PATH | 33 | floor_dirt | — | Dirt shoulders and N-S stubs |
| FENCE | 35 | fence_plank | 0.4 | East perimeter (urban transition) |
| MAILBOX | 37 | — | — | Outside Gleaner's Home (22,25) |

## NPC Placement

| ID | Type | Position | Patrol | Dialogue Tree | Notes |
|----|------|----------|--------|---------------|-------|
| floor1_bazaar_vendor | INTERACTIVE | (10,10) | — | 7 nodes | Bazaar approach, shop info |
| floor1_tide_1 | AMBIENT | (22,10) | (16,10)→(28,10) | — | Tide Scholar, north path |
| floor1_foundry_1 | AMBIENT | (38,10) | (34,10)→(42,10) | — | Foundry Rep, NE pod area |
| floor1_admiralty_1 | AMBIENT | (20,22) | (14,22)→(26,22) | — | Admiralty Officer, south arcade |
| floor1_lamplighter | AMBIENT | (30,16) | (24,16)→(36,16) | — | Road shoulder patrol |
| floor1_dispatcher | DISPATCHER | (42,17) | — | 13 nodes | Blocks east gate, redirects to 1.6 |

## Door Targets

| Position | Target | Type | Description |
|----------|--------|------|-------------|
| (2,17) | 0 | EXIT | Back to Floor 0 (The Approach) |
| (2,18) | 0 | EXIT | Back to Floor 0 (The Approach) |
| (10,8) | 1.1 | DOOR | Coral Bazaar interior |
| (22,8) | 1.2 | DOOR | Driftwood Inn interior |
| (10,27) | 1.3 | DOOR | Storm Shelter (civic, basement dungeon at 1.3.1) |
| (22,27) | 1.6 | DOOR | Gleaner's Home interior |
| (48,17) | 2 | DOOR | Floor 2 — Lantern Row |
| (48,18) | 2 | DOOR | Floor 2 — Lantern Row |

## Perimeter Transition

The border sells a west-to-east rural→urban gradient:

- **Cols 0–19**: Tree border (tile 21) — continuation of Floor 0's natural setting
- **Cols 20–35**: Shrub border (tile 22) — half-height transitional hedges
- **Cols 36–49**: Fence border (tile 35) — short planks, urban feel toward Lantern Row

Applied to rows 0–1, 34–35 (top/bottom) and columns 0, 49 (left/right)
with inner shrub corridors forming the pod enclosure walls.

## Blockout Pass Checklist

- [x] 50×36 grid authored (36 rows × 50 cols verified)
- [x] Spawn (4,17) on ROAD tile, facing EAST
- [x] 8 doors wired (2 EXIT → 0, 4 DOOR → interiors, 2 DOOR → Floor 2)
- [x] Perimeter transition tree→shrub→fence
- [x] 6 pods with C-gap openings (N pods open south, S pods open north)
- [x] 4 buildings placed inside pods (Bazaar, Inn, Storm Shelter, Home)
- [x] 2 landmark pods (Noticeboard pillars, Well pillars)
- [x] Mailbox at (22,25) — 2 tiles north of Gleaner's Home door
- [x] 3 bonfires placed (22,11), (24,17), (19,24)
- [x] Road continuous E-W on rows 17–18 with path shoulders on 16, 19
- [x] 6 NPCs placed on walkable tiles (admiralty shifted to row 22)
- [x] Dispatcher blocks east gate with 13-node dialogue tree
- [x] Bazaar vendor has 7-node dialogue tree
- [x] Spatial contract updated: gridSize {w:50, h:36}, skyPreset 'sunset'
- [x] Syntax check passed (node -c) for floor-manager.js, npc-system.js, game.js
- [x] SW pod building finalized: Storm Shelter (faction-neutral civic, basement dungeon)
- [ ] Playtest: walk spawn→home→dispatcher round-trip
- [ ] Playtest: enter all 4 building doors
- [ ] Art pass: assign final textures to all tile types

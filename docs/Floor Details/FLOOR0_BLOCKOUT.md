# Floor 0 — The Approach (Blockout)

> **Grid**: 50×36  |  **Biome**: exterior  |  **Authored**: hand
> **Spawn**: (4, 17) facing EAST  |  **Exit**: DOOR(44, 17) → Floor 1
> **Contract**: `exterior({ label: 'The Approach', wallHeight: 1.0, renderDistance: 24, fogDistance: 20, gridSize: { w: 50, h: 36 }, skyPreset: 'cedar' })`

## Narrative Context

Player was just dropped off by the "DRAGON" truck (deploy cutscene car) on the
E-W road near the western overpass wall. Behind them: a concrete overpass
(cols 0–1) spans north–south. The truck drove off through the overpass gap —
the wall sells the "highway underpass drop-off" feel. The player can't go back.

The deploy cutscene crossfades: as the car fades out, the 3D world fades in.
First monologue fires: `deploy_dropoff` sequence (4 lines, MonologuePeek).

The floor reads as a small-town interstate exit ramp settlement — part
campground, part fledgling residential pocket. An E-W cobblestone road runs
through the center. Six shrub-walled meadow pods (3 across × 2 down) branch
off via dirt paths north and south of the road. An east facade of varying-
thickness industrial buildings runs the full height of the map, with a roman
arch gate in the center (aligned with the road) leading to Floor 1 (The
Promenade). Two 0.5 doors in the facade lead to building interiors.

## Structure Spec

```
Legend:
  W - overpass wall (cols 0-1)
  T - tree border (2 rows top/bottom, 3 cols east, col 2 spacer)
  # - shrub walls (half-height, C-shaped pod enclosures + perimeter)
  | - facade building tiles (WALL, varying thickness/height)
  X - door (DOOR tile)
  R - road (E-W, rows 17-18)
  p - path (shoulders rows 16,19; N-S stubs at pod gaps)
  , - grass (meadow fill)
  * - bonfire
  P - pillar (flanking arch)

  Pod layout: 3 across × 2 down, each 8w × 10h shrub-walled
  North pods open SOUTH, south pods open NORTH (2-tile gap)

  W T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T
  W T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T
  W T # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # , , | | | | T T T
  W T # , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , | | | | T T T
  W T # , # # # # # # # # , , # # # # # # # # , , # # # # # # # # , , , , , , , , , , , | | | | T T T
  W T # , # , , , , , , , # , , # , , , , , , , # , , # , , , , , , , # , , , , , , , , , , , | | | | T T T
  W T # , # , T T , , , # , , # , , , , , , , # , , # , W W W W , # , , , , , , , , , , | | | | | | T T T
  W T # , # , T , , , , , # , , # , , , T , , , # , , # , W , , W , # , , , , , , , , , , | | X | | | T T T
  W T # , # , , T , , , , # , , # , , * , , , , # , , # , W , , W , # , , , , , , , , , , | | | | | | T T T
  W T # , # , T , , , , , # , , # , , , , , , , # , , # , W X W W , # , , , , , , , , , , | | | | | | T T T
  W T # , # , , , , , , , # , , # , T , , , , , # , , # , , , , , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # , , , , , , , # , , # , , , , , , , # , , # , , , * , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # , , , , , , , # , , # , , , , , , , # , , # , , , , , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # # # , , # # # , , # # # , , # # # , , # # # , , # # # , , , , , , , , , , | | | | | | T T T
  W T # , , , , , p p , , , , , , , , , p p , , , , , , , , , p p , , , , , , , , , , , , | | | | | | T T T
  W T # , , , , , p p , , , , , , , , , p p , , , , , , , , , p p , , , , , , , , , , , P P | | | | T T T
  W T # p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p | | T T T
  W T # R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R X | | T T T
  W T # R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R R X | | T T T
  W T # p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p p | | T T T
  W T # , , , , , p p , , , , , , , , , p p , , , , , , , , , p p , , , , , , , , , , , P P | | | | T T T
  W T # , , , , , p p , , , , , , , , , p p , , , , , , , , , p p , , , , , , , , , , , | | | | | | T T T
  W T # , # # # , , # # # , , # # # , , # # # , , # # # , , # # # , , , , , , , , , , | | | | | | T T T
  W T # , # , , , , , , , # , , # , , , , , , , # , , # , , , , , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # , , , , M , , # , , # , , , , , , , # , , # , , , , , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # , W X W W , , # , , # , , T , * , , # , , # , , T , , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # , W , , W , , # , , # , , , T , , , # , , # , , , T , , , # , , , , , , , , , , | | | | | | T T T
  W T # , # , W , , W , , # , , # , T , , , , , # , , # , , T , , , , # , , , , , , , , , , | , , , | | T T T
  W T # , # , W W W W , , # , , # , , , , , , , # , , # , , , , T , , # , , , , , , , , , , | X , , | | T T T
  W T # , # , , , , , , , # , , # , , , , , , , # , , # , , , , , , , # , , , , , , , , , , | , , , | | T T T
  W T # , # , , , , , , , # , , # , , , , , , , # , , # , , , , , , , # , , , , , , , , , , , , | | | | T T T
  W T # , # # # # # # # # , , # # # # # # # # , , # # # # # # # # , , , , , , , , , , , , | | | | T T T
  W T # , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , . | | | | T T T
  W T # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # , , | | | | T T T
  W T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T
  W T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T
```

## Layout Grid Reference

```
     0         1         2         3         4
     0123456789012345678901234567890123456789012345678 9
  0  WWTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   overpass + tree border
  1  WWTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   overpass + tree border
  2  WWT##################################,,WWWWTTT       shrub N + facade thin
  3  WWT#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,WWWWTTT    open interior
  4  WWT#,########,,########,,########,,,,,,,,WWWWTTT    pod tops
  5  WWT#,#,,,,,,#,,#,,,,,,#,,#,,,,,,#,,,,,,,,WWWWTTT
  6  WWT#,#,TT,,,#,,#,,,,,,#,,#,WWWW,#,,,,,,WWWWWWTTT   shack top + facade widens
  7  WWT#,#,T,,,,#,,#,,,T,,#,,#,W,,W,#,,,,,,WWDWWWTTT   DOOR(43,7)→0.5.1
  8  WWT#,#,,T,,,#,,#,,*,,,#,,#,W,,W,#,,,,,,WWWWWWTTT   campfire(18,8)
  9  WWT#,#,T,,,,#,,#,,,,,,#,,#,WDWW,#,,,,,,WWWWWWTTT   shack DOOR(28,9)
 10  WWT#,#,,,,,,#,,#,T,,,,#,,#,,,,,,#,,,,,,WWWWWWTTT
 11  WWT#,#,,,,,,#,,#,,,,,,#,,#,,,*,,#,,,,,,WWWWWWTTT   bonfire(29,11)
 12  WWT#,#,,,,,,#,,#,,,,,,#,,#,,,,,,#,,,,,,WWWWWWTTT
 13  WWT#,###,,###,,###,,###,,###,,###,,,,,,WWWWWWTTT    pod bottoms (C-gaps)
 14  WWT#,,,,pp,,,,,,,,pp,,,,,,,,pp,,,,,,,,,WWWWWWTTT    N-S path stubs
 15  WWT#,,,,pp,,,,,,,,pp,,,,,,,,pp,,,,,,,,,PPWWWWTTT    pillars(41,15)(42,15)
 16  WWT#pppppppppppppppppppppppppppppppppppppppWWTTT    path shoulder N
 17  WWT#RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRDWWTTT    ★ ROAD + DOOR(44,17)
 18  WWT#RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRDWWTTT    ★ ROAD + DOOR(44,18)
 19  WWT#pppppppppppppppppppppppppppppppppppppppWWTTT    path shoulder S
 20  WWT#,,,,pp,,,,,,,,pp,,,,,,,,pp,,,,,,,,,PPWWWWTTT    pillars(41,20)(42,20)
 21  WWT#,,,,pp,,,,,,,,pp,,,,,,,,pp,,,,,,,,,WWWWWWTTT    S-N path stubs
 22  WWT#,###,,###,,###,,###,,###,,###,,,,,,WWWWWWTTT    pod tops (open N)
 23  WWT#,#,,,,,,#,,#,,,,,,#,,#,,,,,,#,,,,,,WWWWWWTTT
 24  WWT#,#,,,,M,#,,#,,,,,,#,,#,,,,,,#,,,,,,WWWWWWTTT    mailbox(10,24)
 25  WWT#,#,WDWW,#,,#,,T,*,#,,#,,T,,,#,,,,,,WWWWWWTTT    house DOOR(8,25), bonfire(20,25)
 26  WWT#,#,W,,W,#,,#,,,T,,#,,#,,,T,,#,,,,,,WWWWWWTTT
 27  WWT#,#,W,,W,#,,#,T,,,,#,,#,,T,,,#,,,,,,W,,,WWTTT    facade courtyard opens
 28  WWT#,#,WWWW,#,,#,,,,,,#,,#,,,,T,#,,,,,,WD,,WWTTT    DOOR(42,28)→0.5.2
 29  WWT#,#,,,,,,#,,#,,,,,,#,,#,,,,,,#,,,,,,W,,,WWTTT
 30  WWT#,#,,,,,,#,,#,,,,,,#,,#,,,,,,#,,,,,,,,WWWWTTT
 31  WWT#,########,,########,,########,,,,,,,,WWWWTTT    pod bottoms (closed)
 32  WWT#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,.WWWWTTT    chest(42,32)
 33  WWT##################################,,WWWWTTT       shrub S + facade
 34  WWTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border
 35  WWTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border
```

Legend: `T`=tree(21) `#`=shrub(22) `P`=pillar(10) `W`=wall(1)
`R`=road(32) `p`=path(33) `,`=grass(34) `F`=fence(35) `M`=mailbox(37)
`D`=door(2) `*`=bonfire(18) `.`=empty(0, chest placeholder)

*Note: ASCII is schematic — refer to the grid array in floor-manager.js for
exact tile placement. Each cell in the array = 1 tile.*

## Zones

### 1. West Overpass (cols 0–2)
Concrete overpass wall (cols 0–1) + tree spacer (col 2). Runs full height.
The narrative device from the deploy cutscene — player was dropped off here.
Impassable barrier preventing backtracking.

### 2. NW Meadow Pod — Tree Cluster (cols 5–12, rows 4–13)
8×10 shrub-walled enclosure, C-shape opening SOUTH. Filled with scattered
trees for visual density and shade. No structures. NPC pathing pass-through.

### 3. NC Meadow Pod — Campground Bonfire (cols 15–22, rows 4–13)
8×10 shrub-walled enclosure, C-shape opening SOUTH. Central campfire at
(18,8). Shade tree at (19,7). This is the primary gathering spot — NPCs
congregate here. Interactive Traveler NPC at campfire.

### 4. NE Meadow Pod — Shack (cols 25–32, rows 4–13)
8×10 shrub-walled enclosure, C-shape opening SOUTH. Contains a 4×4 shack
building (WALL, cols 27–30, rows 6–9) with DOOR at (28,9) → Floor 0.5.2.
Bonfire at (29,11) outside the shack. Old Camper NPC.

### 5. SW Meadow Pod — House (cols 5–12, rows 22–31)
8×10 shrub-walled enclosure, C-shape opening NORTH. Contains a 4×4 house
building (WALL, cols 7–10, rows 25–28) with DOOR at (8,25) → Floor 0.5.3.
Mailbox at (10,24). Dozing Vagrant NPC. This is the "residential" pocket.

### 6. SC Meadow Pod — Tree Cluster + Bonfire (cols 15–22, rows 22–31)
8×10 shrub-walled enclosure, C-shape opening NORTH. Scattered trees with
a bonfire at (20,25). Off-duty Gleaner NPC — talkable, hints about the
dispatcher and the town beyond the arch.

### 7. SE Meadow Pod — Tree Cluster (cols 25–32, rows 22–31)
8×10 shrub-walled enclosure, C-shape opening NORTH. Dense tree cover.
No structures. Provides visual symmetry with NW pod.

### 8. Central E-W Road Corridor (rows 14–21, cols 4–44)
Cobblestone road (rows 17–18) with path shoulders (rows 16, 19). N-S path
stubs at cols 8–9, 18–19, 28–29 connect to pod openings. The road runs
unbroken from the overpass (col 4) to the facade arch (col 44). This is the
player's primary navigation axis. Groundskeeper NPC patrols the north
shoulder. Campfire Cook NPC near the facade approach.

### 9. East Facade (cols 41–46, rows 2–33)
Industrial building row facade. WALL tiles of varying thickness:
- **Thin sections** (cols 43–46): rows 2–5 and rows 30–33
- **Deep sections** (cols 41–46): rows 6–13 and rows 22–29
- **Roman Arch**: 2-tile opening at (44,17) and (44,18), aligned with road.
  DOOR → Floor 1 (The Promenade). Flanked by PILLAR pairs at (41,15),
  (42,15), (41,20), (42,20).
- **Upper 0.5 door**: DOOR(43,7) → Floor 0.5.1 (building interior)
- **Lower courtyard**: carved grass pocket (cols 42–44, rows 27–29) with
  DOOR(42,28) → Floor 0.5.4 (building interior)
- **Chest gap**: EMPTY tile at (42,32) accessible through gap between shrub
  perimeter and tree border in the SE corner.

## Key Tiles

| Tile | Position(s) | Purpose |
|------|-------------|---------|
| DOOR | (44, 17) | Roman arch → Floor 1 (The Promenade) |
| DOOR | (44, 18) | Roman arch lower tile → Floor 1 |
| DOOR | (43, 7) | Upper facade building → Floor 0.5.1 |
| DOOR | (28, 9) | NE shack interior → Floor 0.5.2 |
| DOOR | (8, 25) | SW house interior → Floor 0.5.3 |
| DOOR | (42, 28) | Lower facade courtyard → Floor 0.5.4 |
| BONFIRE | (18, 8) | NC pod campfire |
| BONFIRE | (29, 11) | NE pod, outside shack |
| BONFIRE | (20, 25) | SC pod clearing |
| PILLAR | (41,15), (42,15) | Arch flanking (north) |
| PILLAR | (41,20), (42,20) | Arch flanking (south) |
| MAILBOX | (10, 24) | SW pod, near house |
| ROAD | rows 17–18, cols 4–44 | Primary E-W road |
| PATH | rows 16, 19 (shoulders) | Road shoulders |
| PATH | cols 8–9, 18–19, 28–29 (stubs) | Pod connections |
| WALL | cols 0–1, rows 0–35 | Overpass (west border) |
| WALL | cols 41–46, rows 2–33 | East facade block |
| SHRUB | perimeter + 6 pod enclosures | Half-height see-over walls |
| EMPTY | (42, 32) | Chest placeholder (world-item) |
| SPAWN | (4, 17) | Player spawn, facing EAST |

## NPC Placement (6 NPCs)

**Design intent**: Player spawns ALONE. Cols 4–12 are empty — eerie silence
after the deploy cutscene. First NPC encounter at col 18 (NC pod path stub).
NPCs progressively reveal setting via dialogue trees.

| ID | Name | Type | Position | Dialogue Tree | Notes |
|----|------|------|----------|---------------|-------|
| floor0_drifter | Campfire Drifter | INTERACTIVE | (18,14) | Yes (15 nodes) | First encounter. Setting, environment, why people camp here, Gleaner hint. |
| floor0_laborer | Laid-off Laborer | INTERACTIVE | (19,25) | Yes (22 nodes) | SC bonfire. Industries, Foundry layoffs, homelessness, faction critique. |
| floor0_hermit | Raving Hermit | INTERACTIVE | (30,11) | Yes (43 nodes) | NE shack. Pandas, dragon elites, existential crisis, fourth-wall breaks. |
| floor0_vagrant | Dozing Vagrant | AMBIENT | (9,24) | No (barks only) | SW pod near house. Ambient backdrop, sleeping-rough vibe. |
| floor0_worker | Groundskeeper | AMBIENT | (22,16) | No (barks only) | Patrols N shoulder (22,16)→(35,16). Someone barely maintains this. |
| floor0_loiterer | Facade Loiterer | AMBIENT | (37,17) | No (barks only) | Road near arch. Last NPC before Floor 1 door. |

## Blockout Pass Checklist

- [x] Grid geometry authored in floor-manager.js (50×36, verified)
- [x] Spawn position (4,17) on ROAD, facing EAST
- [x] Door wiring: DOOR(44,17)+(44,18) → Floor 1
- [x] Door wiring: DOOR(43,7) → Floor 0.5.1
- [x] Door wiring: DOOR(28,9) → Floor 0.5.2 (NE shack)
- [x] Door wiring: DOOR(8,25) → Floor 0.5.3 (SW house)
- [x] Door wiring: DOOR(42,28) → Floor 0.5.4 (courtyard)
- [x] Road spine continuous E-W (rows 17–18, cols 4–44)
- [x] Path shoulders + N-S stubs to all 6 pods
- [x] Overpass wall (cols 0–1) full height
- [x] East facade (cols 41–46) with roman arch + 2 half-doors
- [x] 6 shrub-walled meadow pods (3×2 arrangement)
- [x] NE shack (4×4) with door
- [x] SW house (4×4) with door and mailbox
- [x] 3 bonfires distributed across pods
- [x] Grass fills all open meadow areas
- [x] Room definitions cover 8 zones
- [x] Spatial contract gridSize updated to 50×36
- [x] NPC positions updated for new grid (6 NPCs, spawn buffer cols 4–12)
- [x] Dialogue trees registered: Drifter (15 nodes), Laborer (22 nodes), Hermit (43 nodes)
- [x] Chest placeholder at (42,32)
- [ ] Texture assignment: road vs path vs grass boundaries
- [ ] Overpass concrete texture (distinct from building facade walls)
- [ ] Facade industrial building textures (varying visual)
- [ ] Pillar arcade visual style
- [ ] Campfire ambient particles
- [ ] Tree canopy overhead shadow
- [ ] Shack / house interior textures
- [ ] Fence rendering style (if any fences added)
- [x] NPC dialogue trees wired (3 INTERACTIVE NPCs with full branching trees)
- [ ] Intro walk pathing (IntroWalk module) — E-W orientation
- [ ] deploy_dropoff monologue timing vs intro walk
- [ ] Floor 0.5.1–0.5.4 interior grid authoring
- [ ] Chest world-item registration at (42,32)

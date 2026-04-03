# Floor 0 — The Approach (Blockout)

> **Grid**: 40×30  |  **Biome**: exterior  |  **Authored**: hand
> **Spawn**: (19, 26) facing NORTH  |  **Exit**: DOOR(19, 5) → Floor 1
> **Contract**: `exterior({ label: 'The Approach', wallHeight: 1.0, renderDistance: 24, fogDistance: 20, skyPreset: 'cedar' })`

## Narrative Context

Player was just dropped off by the "DRAGON" truck (deploy cutscene car) on a
3-tile-wide road strip (cols 18–20, row 26) facing north. Behind them: a
concrete overpass wall (rows 27–28) spans east-west with the road cutting
through a 3-tile gap flanked by pillar columns. The truck drove off through
that gap — the wall sells the "highway underpass drop-off" feel. The player
can't go back.

The deploy cutscene crossfades: as the car fades out, the 3D world fades in.
First monologue fires: `deploy_dropoff` sequence (4 lines, MonologuePeek).

The floor reads as a small-town interstate exit ramp settlement — part
campground, part fledgling residential pocket. A cobblestone road runs the
full length north–south. Dirt paths branch off toward encampment shacks on the
west and a fenced residential house on the east. Meadow grass fills every open
space. The player follows the road north through a Roman-arch gate arcade into
Floor 1 (The Promenade).

## Layout Overview Structure Spec

legend
#- "C" shaped # around each [TREE CLST] represent shrubs, turning each [NODE] into a little walled meadow or yard for a shack. npcs travel between these little walled meadows to interact. 
T - tree clusters are rendered as T, two tiles tall parameter walls and column accents for meadows
O - overpass, narrative device from title screen
| - facade building tiles
X - door to floorN+
- - paved or dirt road (different from this area's grass floors)
B - bonfire tile

this blockout is designed to capture a need to guide new players towards the door while remaining easter egg or multiplayer arena viable. this is the run down homeless encamp overrun suburb outside of the town near the boardwalk

O T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T
O ###################################################################|## T
O #                                                            npc   | # T
O # ########################################### #####################| # T
O   #                                                 ||             | # T
O   #   ########      ########      ########          ||             | # T
O   #   #      #      #  B   #      #      #      #   ||             | # T
O   #   # TREE #      # CAMP #      #SHACK#           ||             | # T
O   #   # CLST #      #FIRE  #      # BLD #            ------        | # T
O   #   #      #      #      #      #  B   #                         | # T
O   #   ####--##      ####--##      ####--##                         | # T
O   #        -             -             -                           | # T 
O   #------PLAYER -> ------+-------------+---------------------------| # T
O   #        -             -             -              floor1door: X  # T
O   #   ####--##      ####--##      ####--##                         | # T
O   #   #      #      #      #      #      #               #         | # T
O   #   #HOUSE #      # TREE #      # TREE #                         | # T
O   #   # BLD  #      # CLST #      # CLST #                         | # T
O   #   #      #      #      #      #      #       ________________  | # T
O   #   ########      ########      ########       |                 | # T
O   #                                              |                 | # T
O   #                                              ||  ^             | # T
O   #                                              ||  FACADE        | # T
O   #                                              ||                | # T
O   ############################################# ###################| # T
O      chest                                                         | # T
O ###################################################################|## T 
O T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T T
O

## Layout Overview floor and details suggestions *** ROW 4 (DOOR) needs to be imbeded in gate arcade at ROW 2, as wide as the road and tall enough for vehicles not standing aloof

```
     0         1         2         3
     0123456789012345678901234567890123456789
  0  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border
  1  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border
  2  TT,,,,,,PP WALL PP,,RRR,,PP WALL PP,,,,TT   gate arcade (arch wings)
  3  TT,,,,,,,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,TT   open approach
  4  TT,,,,,,,,PP,,,,,,pRRRp,,,,,,,,PP,,,,,,TT   pillar waypoints
  5  TT,,,,,,,,,,,,,,,,pRDRp,,,,,,,,,,,,,,,,TT   ★ DOOR (19,5) gate threshold
  6  TT,,,,,,,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,TT   open
  7  TT,,,,pp,,TT,,,,,,pRRRp,,,,,,TT,,pp,,,,TT   path branches + trees
  8  TT,,pWWWW,TT,,,,,,pRRRp,,,,,,TT,,,,p,,,,TT   W encampment shack 1 (top)
  9  TT,,pW  W,,,,,*,,,pRRRp,,,,,,,,,,,*,,,,,TT   campfires (14,9) (31,9)
 10  TT,,pW DW,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,,TT   shack 1 door (7,10)
 11  TT,,,,,,,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,,TT   open
 12  TT,,,,,,,,,TT,,,*,pRRRp,,,,,TT,,,,,,,,,,TT   central campfire (15,12)
 13  TT,,,,,,,,,TT,,,,,pRRRppppp,TT,,,,,,,,,,TT   path branch east
 14  TT,,,,pp,,,,,,,,,,pRRRp,,,,,FWWWWWF,,,,TT   E house top + fence
 15  TT,,pWWWW,,,,,,,,,pRRRp,,,MFW    WF,,,,TT   mailbox (26,15)
 16  TT,,pW  W,,,,,,,,,pRRRp,,,,FW    WF,,,,TT   house interior
 17  TT,,pW DW,,,,,,,,,pRRRp,,ppFWW DW WF,,,,TT   shack 2 door (7,17), house door (30,17)
 18  TT,,,,,,,,,,,,,,,,,pRRRp,,,,,,,p,,,,,,,,,TT   path connector
 19  TT,,,,,*,,,TT,,,,,pRRRp,,,,,,,,,,,,TT,,,,TT   W campfire (7,19)
 20  TT,,,,,,,,TT,,,,,pRRRp,,,,,,,,,,,,TT,,,,TT   trees
 21  TT,,,,,,,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,,TT   open meadow
 22  TTSH,,,,,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,SHTT   shrub narrows begin
 23  TTSH,,,,,,,,,,,,,,pRRRp,,,,,,,,,,,,,,,,SHTT   funnel
 24  TTSH,,,,,,,,,,,,,,pRRRp,*,,,,,,,,,,,,,,SHTT   S campfire (23,24)
 25  TTSH,,,,,,,,,,,,,,,RRR,,,,,,,,,,,,,,,,,SHTT   road widens, no path shoulder
 26  TTSH,,,,,,,,,,,,,,,RRR,,,,,,,,,,,,,,,,,SHTT   ★ SPAWN ROW (19,26) road
 27  TTWWWWWWWWWWWWWWWWPRRR pWWWWWWWWWWWWWWWWTT   overpass wall + pillar cols
 28  TTWWWWWWWWWWWWWWWWW RRR WWWWWWWWWWWWWWWWWTT   overpass depth
 29  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border
```

Legend: `TT`=tree(21) `SH`=shrub(22) `PP`/`P`=pillar(10) `WW`/`W`=wall(1)
`RR`/`R`=road(32) `p`=path(33) `,`=grass(34) `F`=fence(35) `M`=mailbox(37)
`D`=door(2) `*`=bonfire(18)

*Note: ASCII is schematic — refer to the grid array in floor-manager.js for
exact tile placement. Each cell in the array = 1 tile.*

## Zones

### 1. Gate Arcade (rows 2–6)
Roman-arch entrance to Floor 1. Two wall wings with pillar endpoints frame
a wide opening. The road passes through; DOOR(19,5) sits in the road as the
gate threshold. Pillar waypoints at (10,4) and (29,4) create a colonnade feel.
**Not a building** — the player walks through an archway from the campground
into town.

### 2. West Encampment (cols 3–12, rows 7–20)
Two small shacks (4×3 footprint, path-wrapped):
- **Shack 1** (cols 5–8, rows 8–10) — door at (7,10)
- **Shack 2** (cols 5–8, rows 15–17) — door at (7,17)

Campfires at (14,9), (15,12), and (7,19) dot the area between shacks.
Scattered trees provide shade and break sightlines. Dirt paths connect shack
entrances back to the main road. This is the "encampment" — transient,
makeshift, humble.

### 3. East Residential (cols 26–34, rows 14–18)
One house (6×4 footprint) with a fenced yard:
- **House** (cols 28–32, rows 14–17) — door at (30,17)
- **Fence** runs cols 27 and 33, rows 14–17
- **Mailbox** at (26,15) on the path approach

A campfire at (31,9) sits in the meadow northeast of the house. A dirt path
branches east from the road at row 13 to reach the house. This is the
"residential" pocket — established, fenced, a contrast to the encampment.

### 4. Central Spine (cols 17–21, rows 2–28)
Cobblestone road (cols 18–20) with dirt path shoulders (cols 17, 21). Runs
unbroken from the gate arcade to the overpass. The road narrows to no
shoulders near the spawn approach (rows 25–26). This is the player's primary
navigation axis.

### 5. Spawn Approach (rows 22–28)
Shrub borders on east and west edges tighten the view. South campfire at
(23,24). The road widens at rows 25–26 (no path shoulders) for the spawn
drop-off area. Overpass wall at rows 27–28 with ROAD gap (cols 18–20) and
pillar columns at (17,27) and (21,27). The tree border at row 29 is the hard
southern boundary.

## Key Tiles

| Tile | Position(s) | Purpose |
|------|-------------|---------|
| DOOR | (19, 5) | Gate threshold to Floor 1 (The Promenade) |
| DOOR | (7, 10) | West encampment shack 1 entrance |
| DOOR | (7, 17) | West encampment shack 2 entrance |
| DOOR | (30, 17) | East residential house entrance |
| BONFIRE | (14, 9) | North campfire, between shacks and road |
| BONFIRE | (31, 9) | Northeast meadow campfire |
| BONFIRE | (15, 12) | Central campfire, road-adjacent |
| BONFIRE | (7, 19) | West campfire, south of shack 2 |
| BONFIRE | (23, 24) | South campfire, near spawn approach |
| PILLAR | (8,2), (15,2), (23,2), (30,2) | Gate arcade arch endpoints |
| PILLAR | (10,4), (29,4) | Colonnade waypoints |
| PILLAR | (17,27), (21,27) | Overpass columns flanking road gap |
| MAILBOX | (26, 15) | Residential house mailbox |
| FENCE | (27,14–17), (33,14–17) | Residential yard boundary |
| ROAD | cols 18–20, rows 2–28 | Primary road spine |
| PATH | cols 17, 21 (most rows) | Road shoulders / trail branches |
| WALL | rows 27–28 (full width) | Overpass / highway barrier |

## NPC Placement (Target: 1–2 idle)

Per BLOCKOUT_ALIGNMENT, Floor 0 supports 1–2 idle NPCs near campfires.

- **Campfire NPC** — encampment resident at (14,9) or (7,19). Idle, warming
  hands. Dialogue: small talk about the neighborhood, hints about the
  dispatcher.
- **Residential NPC** — house resident visible through fence or near mailbox.
  Dialogue: complaints about the encampment, local gossip, mild hostility
  toward transients.

## Blockout Pass Checklist

- [x] Grid geometry authored in floor-manager.js (40×30, verified)
- [x] Spawn position (19,26) on ROAD, facing NORTH
- [x] Door wiring: DOOR(19,5) → Floor 1
- [x] Road spine continuous (rows 2–28, cols 18–20)
- [x] Path shoulders branching to encampment and residential zones
- [x] Overpass wall (rows 27–28) with road gap + pillar columns
- [x] Gate arcade (row 2) — Roman-arch wall wings, NOT a building facade
- [x] West encampment: 2 small shacks (4×3) with doors
- [x] East residential: 1 house (6×4) with fence yard and mailbox
- [x] 5 campfires distributed across zones
- [x] Grass fills all open meadow areas
- [x] Room definitions cover 5 zones
- [ ] Texture assignment: road vs path vs grass boundaries
- [ ] Overpass concrete texture (distinct from building facade walls)
- [ ] Pillar arcade visual style
- [ ] Campfire ambient particles
- [ ] Tree canopy overhead shadow
- [ ] Shack / house interior textures
- [ ] Fence rendering style
- [ ] NPC placement and dialogue wiring
- [ ] Intro walk pathing (IntroWalk module)
- [ ] deploy_dropoff monologue timing vs intro walk

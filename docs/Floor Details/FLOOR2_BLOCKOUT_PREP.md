# Floor 2 — Lantern Row (Blockout)

> **Grid**: 50×36  |  **Biome**: exterior  |  **Authored**: hand
> **Spawn**: (4, 12) facing EAST  |  **Exit**: DOOR(49, 12) → Floor 3
> **Contract**: `exterior({ label: 'Lantern Row', wallHeight: 1.0, renderDistance: 24, fogDistance: 20, gridSize: { w: 50, h: 36 }, skyPreset: 'lantern' })`

## Narrative Context

Player arrives from Floor 1 through gates on the western edge. Lantern Row
is the peak civilization moment in the density ramp — high-density commercial
boardwalk district. The player has walked through quiet campground (Floor 0)
and small residential village (Floor 1). Floor 2 is where civilization hits
them: density, noise, faction presence, commerce. Then Floor 3 strips it all
away again.

The floor reads as a waterfront commercial boardwalk — a long east-west
promenade with building facades lining the north side, a central paved road,
and a boardwalk district extending south over open water. Narrow boardwalk
fingers jut out from the main east-west spine into the water, enclosed by
fence railings. The water horizon is the dominant visual of the southern half.

The perimeter transition continues Floor 1's rural→urban gradient: the north
edge is shrubs and tree cover backing the building facades; the south edge is
open water with no hard boundary — the world breathes outward.

---

## Structure Spec

```
Legend:
  | - building facade (WALL tiles, varying depth)
  S - shrub (half-height, see-over, backing buildings)
  T - tree (full-height border accents)
  R - road / pavement (E-W, rows 12-13, gray)
  X - gate (DOOR_EXIT west, DOOR east)
  p - path (road shoulders, rows 11 and 14)
  B - boardwalk (yellow planks, walkable)
  F - fence railing (dark, half-height, non-walkable)
  ~ - water (NO FLOOR TILE — biome sub-horizon renders)
  * - bonfire
  P - pillar (lantern posts flanking road)
  G - shrub/green accent on building facade
  D - door (DOOR tile into building interior)

  North half: buildings + road (civilization layer)
  South half: boardwalk over water (commercial/social layer)

     0         1         2         3         4
     0123456789012345678901234567890123456789012345678 9

  0  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border N
  1  TSSSSSSSSSSSSSSSSSSSSSSSTTSSSSSSSSSSSSSSSSSSSSSSST   shrub backing
  2  T|||||G||||||G|||||||||TTT||||||||||||||||||||G||T   building facades row 1
  3  T|   G||    G||       |T|  ||  ||  ||  ||||  G||T   building interiors
  4  T|   |||    |||   D   |T|  ||  ||  ||  ||||   ||T   doors face south
  5  T|||||||||||||||||X||||||||||||||||||||||||||||||T   facade south wall
  6  TSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSST   shrub strip S of buildings
  7  T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T   grass buffer
  8  T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T   grass buffer
  9  T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T   grass buffer
 10  TPP,,,,,,,,,,PP,,,,,,,,PP,,,,,,,,PP,,,,,,,,PP,,PPT   pillar/lantern arcade
 11  Tppppppppppppppppppppppppppppppppppppppppppppppppt   path shoulder N
 12  XRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRX   ★ ROAD + gates
 13  XRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRX   ★ ROAD + gates
 14  Tppppppppppppppppppppppppppppppppppppppppppppppppt   path shoulder S
 15  TFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFT   fence railing (main E-W spine)
 16  T~FBBBBBF~~FBBBBBF~~FBBBBBF~~FBBBF*BBBF~~FBBBF~T   boardwalk appendages row 1
 17  T~F     F~~F     F~~F     F~~F   F*   F~~F   F~T   boardwalk interior
 18  T~F     F~~F     F~~F     F~~F   FFFFF~~F   F~T   boardwalk interior
 19  T~FBBBBBF~~FBBBBBF~~FBBBBBF~~F~~~~~~~~~~~~F   F~T   boardwalk bases
 20  T~FFFFFFF~~FFFFFFF~~FFFFFFF~~F~~~~~~~~~~~~FFFFF~T   fence closures
 21  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 22  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 23  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 24  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 25  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water  (sub-horizon)
 26  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 27  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 28  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 29  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 30  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 31  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 32  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 33  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 34  T~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   water
 35  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT   tree border S (water continues)
```

*Note: ASCII is schematic — the boardwalk appendage layout from the reference
image shows ~6 fenced boardwalk fingers jutting south from the main E-W fence
spine, with water visible between them. The bonfire sits on a wider central
appendage. Refer to the grid array in floor-manager.js for exact tile
placement.*

---

## Zones

### 1. North Building Facades (rows 0–6, full width)

Tree border (row 0) + shrub backing (row 1) + building facade block
(rows 2–5) + shrub strip (row 6). The facade runs the full width with
8+ building units of varying depth. Buildings face south toward the road.
DOOR tiles on row 4/5 lead to interior floors (2.1 through 2.8).

Building types (west to east):
- **2.1 Dispatcher's Office** (cols 5–10) — BPRD handler contact point
- **2.2 Watchman's Post** (cols 12–17) — local authority, faction tension
- **2.3 Armorer** (cols 20–24) — equipment vendor
- **2.4 Chandler** (cols 26–30) — supplies and sundries
- **2.5 Apothecary** (cols 32–36) — remedies vendor
- **2.6 Cartographer** (cols 38–42) — maps and intel
- **2.7 Tea House** (cols 44–48) — social hub, lore delivery, neutral ground

Shrub accents (G in diagram) break up the facade line and provide green
rhythm between storefronts. Tree accent at the center (cols 23–25) marks
the visual midpoint.

### 2. Road Corridor (rows 7–14)

Grass buffer (rows 7–9) separates buildings from the road approach.
Pillar/lantern arcade (row 10) with pillars at regular intervals (every
8 cols) flanking the approach — warm-glow lantern posts.

Cobblestone road (rows 12–13) runs unbroken E-W, 2 tiles wide. Path
shoulders (rows 11, 14) as dirt approaches.

**West gate**: DOOR_EXIT at (0, 12) and (0, 13) → Floor 1
**East gate**: DOOR at (49, 12) and (49, 13) → Floor 3

### 3. Main Boardwalk Spine (row 15)

Continuous east-west fence railing (FENCE tiles, row 15) marks the
transition from land to boardwalk. This is the "horizon line" — everything
south of this fence is boardwalk over water. Gates/gaps in the fence at
regular intervals allow access to the boardwalk fingers below.

### 4. Boardwalk Appendages (rows 16–20)

Narrow fenced boardwalk fingers extend south from the main spine into
the water. Each appendage is 5–7 tiles wide, enclosed on all sides by
FENCE railing, with BOARDWALK (planks) as the walkable surface. Water
tiles (~) fill the gaps between appendages.

The reference image shows approximately 6 appendages:
- 4 uniform narrow fingers (5 tiles wide each)
- 1 wider central platform with BONFIRE (the social gathering point)
- 1 longer eastern finger (dock/pier feel)

NPCs congregate on these appendages — the boardwalk is the social layer
of Floor 2, contrasting with the commercial north side.

### 5. Water Horizon (rows 21–35)

**No floor tiles.** The entire southern expanse below the boardwalk
appendages is EMPTY (tile 0) with no biome floor mapping. The biome's
sub-horizon gradient renders through the gaps — water color, fog, depth.
This is the visual payoff: the player looks south past fence railings and
sees open water stretching to the fog line.

See §8 (Water Floor Engineering) for implementation details.

---

## Key Tiles

| Tile | Position(s) | Purpose |
|------|-------------|---------|
| DOOR_EXIT | (0, 12), (0, 13) | West gate → Floor 1 |
| DOOR | (49, 12), (49, 13) | East gate → Floor 3 (Great Gate) |
| DOOR | row 4–5, various cols | 7 building interior doors → Floors 2.1–2.7 |
| BONFIRE | (~25, 17) | Central boardwalk appendage gathering point |
| PILLAR | row 10, every 8 cols | Lantern post arcade flanking road |
| ROAD | rows 12–13, cols 1–48 | Primary E-W cobblestone road |
| PATH | rows 11, 14, cols 1–48 | Dirt road shoulders |
| WALL | rows 2–5, full width | North building facades |
| SHRUB | rows 1, 6 | Building backing + facade strip |
| FENCE | row 15 + appendage perimeters | Boardwalk railings over water |
| BOARDWALK | rows 16–20 (appendage interiors) | Walkable plank surface |
| TREE | rows 0, 35; col 0, col 49 | Border + accent |
| EMPTY | rows 21–34 (water zone) | No floor tile — sub-horizon renders |
| SPAWN | (4, 12) | Player spawn, facing EAST |

---

## NPC Placement (10 NPCs)

**Design intent**: Floor 2 NPCs follow the same structural conventions as
Floor 0 and Floor 1 — a mix of AMBIENT patrol bodies with proximity barks
and INTERACTIVE talkable characters with dialogue trees. Each NPC is
defined by a primary **verb** that drives their patrol path, bark pool,
and visual identity. The boardwalk/city environment gives them distinct
flavor without breaking the established NPC taxonomy.

Floor 0 has 6 NPCs (3 INTERACTIVE, 3 AMBIENT) across a sparse campground.
Floor 1 has 6 NPCs (2 INTERACTIVE, 4 AMBIENT) across a residential village.
Floor 2 scales to 10 NPCs (3 INTERACTIVE, 6 AMBIENT, 1 VENDOR) across a
dense commercial boardwalk — the density jump sells the civilization peak.

### Verb Palette

Each NPC's verb determines their movement pattern, bark tone, and
contribution to the floor's atmosphere:

| Verb | Movement | Bark Tone | Zone |
|------|----------|-----------|------|
| **hawk** | Stationary near stall | Loud, commercial, call-outs | Road corridor |
| **patrol** | 2-pt loop along road | Authoritative, terse | Road corridor |
| **haul** | 2-pt loop, road→boardwalk | Labored, muttering | Road + boardwalk |
| **loiter** | Slow 2-pt drift on boardwalk | Idle chatter, observations | Boardwalk appendage |
| **fish** | Stationary on appendage edge | Quiet, reflective, weather talk | Boardwalk appendage |
| **mend** | Stationary near fence | Focused, task-oriented | Boardwalk spine |
| **gawk** | Slow 2-pt drift near buildings | Impressed, tourist-like | Road corridor |
| **drink** | Stationary near bonfire | Social, rowdy, stories | Boardwalk bonfire |
| **sweep** | 2-pt loop along path shoulder | Muttering, custodial | Road shoulders |
| **wait** | Stationary near gate | Anxious, anticipatory | East gate approach |

### NPC Roster

| ID | Name | Type | Verb | Position | Patrol | Bark Pool | Notes |
|----|------|------|------|----------|--------|-----------|-------|
| floor2_crier | Boardwalk Crier | AMBIENT | hawk | (12, 11) | — | `ambient.lanternrow.crier` | Stationary on N path shoulder. Calls out deals, news. First NPC heard on approach from west gate. |
| floor2_watchman | Lantern Watchman | AMBIENT | patrol | (20, 12) | (10,12)→(30,12) | `ambient.lanternrow.patrol` | Road patrol, E-W sweep. Authoritative barks about order and curfew. |
| floor2_hauler | Dock Hauler | AMBIENT | haul | (35, 14) | (35,14)→(35,18) | `ambient.lanternrow.hauler` | N-S path: road shoulder down to boardwalk appendage. Grunts, load complaints. |
| floor2_mender | Fence Mender | AMBIENT | mend | (18, 15) | — | `ambient.lanternrow.mender` | Stationary on boardwalk spine fence. Mutters about salt rot, repairs. |
| floor2_fisher | Old Fisher | INTERACTIVE | fish | (8, 18) | — | `npc.fisher.ambient` | Stationary on western boardwalk appendage edge. 12-node dialogue tree: weather, tides, what's below the boardwalk, old stories about when the water rose. Hints about Floor 3. |
| floor2_drinker | Bonfire Regular | INTERACTIVE | drink | (26, 17) | — | `npc.drinker.ambient` | At the boardwalk bonfire. 18-node dialogue tree: local gossip, faction rumors, who controls what, complaints about the Watchman. Lore delivery point (replaces Tea House role). |
| floor2_sweeper | Boardwalk Sweeper | AMBIENT | sweep | (40, 11) | (34,11)→(46,11) | `ambient.lanternrow.sweeper` | N path shoulder patrol. Custodial muttering, observations about foot traffic. Parallels Floor 0's Groundskeeper. |
| floor2_tourist | Wide-eyed Arrival | AMBIENT | gawk | (6, 12) | (4,12)→(14,12) | `ambient.lanternrow.tourist` | Slow road drift near west gate. Impressed barks about buildings, scale. Mirrors the player's own arrival experience. |
| floor2_vendor | Chandler's Clerk | VENDOR | hawk | (28, 11) | — | `npc.chandler.ambient` | Stationary on N path shoulder outside Chandler door. Shop system: supplies faction. Proximity bark + shop greeting. |
| floor2_gatekeeper | Gate Warden | INTERACTIVE | wait | (44, 12) | — | `npc.gatekeeper.ambient` | Near east gate approach. 15-node dialogue tree: what lies beyond (Floor 3), warnings about the frontier, faction politics at the border. Blocks passage until quest condition met (parallels Floor 1 Dispatcher pattern). |

### Bark Pool Definitions

All bark text lives in `data/barks/en.js`. No literal strings in engine files.

```
ambient.lanternrow              — General boardwalk passerby (floor-arrival ambient)
ambient.lanternrow.crier        — Boardwalk Crier call-outs (commercial, loud)
ambient.lanternrow.patrol       — Watchman patrol barks (order, authority)
ambient.lanternrow.hauler       — Dock Hauler grunts (labor, complaint)
ambient.lanternrow.mender       — Fence Mender mutters (repair, salt, weather)
ambient.lanternrow.sweeper      — Sweeper observations (foot traffic, mess)
ambient.lanternrow.tourist      — Tourist impressions (awe, scale, questions)
npc.fisher.ambient              — Old Fisher proximity (weather, tides)
npc.fisher.greeting             — Old Fisher interact (full dialogue tree)
npc.drinker.ambient             — Bonfire Regular proximity (gossip snippets)
npc.drinker.greeting            — Bonfire Regular interact (full dialogue tree)
npc.chandler.ambient            — Chandler's Clerk call-out (wares, deals)
npc.chandler.greeting           — Chandler's Clerk shop greeting
npc.gatekeeper.ambient          — Gate Warden proximity (frontier warnings)
npc.gatekeeper.greeting         — Gate Warden interact (full dialogue tree)
```

### Sample Barks (Representative — Full Pools in en.js)

**Boardwalk Crier** (hawk):
- `🗣️ "Fresh catch! Lanterns! Maps of the frontier!"`
- `🗣️ "Step up, step up — the Chandler's got salt rope on discount!"`
- `🗣️ "News from the gate — another party went through yesterday!"`

**Lantern Watchman** (patrol):
- `🗣️ "Keep it moving. No loitering on the main road."`
- `🗣️ "Curfew's at last lantern. Don't make me repeat it."`
- `🗣️ "...seen worse crowds. At least nobody's fighting today."`

**Dock Hauler** (haul):
- `🗣️ "...heavier every trip... who ordered this much salt?"`
- `🗣️ "Back's gonna go before the boardwalk does."`
- `🗣️ "One more load. Just one more."`

**Fence Mender** (mend):
- `🗣️ "Salt eats everything out here. Every rail, every nail."`
- `🗣️ "...replace it Tuesday, rotted by Friday..."`
- `🗣️ "Least the view's good while I work."`

**Old Fisher** (fish — proximity):
- `🗣️ "...nothing biting today..."`
- `🗣️ "Water's different color since last week. Darker."`
- `🗣️ "Used to be you could see the bottom."`

**Bonfire Regular** (drink — proximity):
- `🗣️ "Pull up a crate, the fire's good tonight."`
- `🗣️ "You hear about what came through the east gate?"`
- `🗣️ "...Watchman thinks he runs this place..."`

**Boardwalk Sweeper** (sweep):
- `🗣️ "...fish scales everywhere... every single day..."`
- `🗣️ "Traffic's heavier than usual. Something's up."`
- `🗣️ "Nobody notices clean planks. Everybody notices dirty ones."`

**Wide-eyed Arrival** (gawk):
- `🗣️ "...this is Lantern Row? It's bigger than I imagined..."`
- `🗣️ "Look at all the buildings. How many people live here?"`
- `🗣️ "...they said the boardwalk goes right over the water..."`

**Gate Warden** (wait — proximity):
- `🗣️ "Road east gets wild. Make sure you're ready."`
- `🗣️ "...been quiet from the other side today. Too quiet."`
- `🗣️ "Not everyone who goes through comes back."`

---

## NPC Shuffle System (Verb-Driven Movement)

NPCs on Floor 2 should create visible multi-lane traffic that sells the
"bustling commercial boardwalk" feel. The shuffle is driven by each NPC's
verb, not by time-of-day schedules (schedules are post-jam scope).

**Shuffle rules:**
1. **AMBIENT patrol NPCs** (watchman, hauler, sweeper, tourist) use
   `_patrolPoints` 2-point bounce at 1200ms/step (same as Floor 0/1).
2. **Stationary NPCs** (crier, mender, fisher, drinker, vendor, gatekeeper)
   stay put but fire proximity barks at `barkRadius: 4` tiles.
3. **Cross-lane hauler** is the only NPC that moves N-S (road→boardwalk),
   creating visible vertical traffic against the dominant E-W flow.
4. **Density layering**: road corridor has 5 NPCs (crier, watchman, sweeper,
   tourist, vendor), boardwalk has 4 (hauler endpoint, mender, fisher,
   drinker), gate approach has 1 (gatekeeper). The road feels busy; the
   boardwalk feels social; the gate feels ominous.

**Bark collision avoidance**: NpcSystem's per-NPC `_barkTimer` (3000ms
default) prevents overlapping barks. With 10 NPCs, the ambient sound
layer self-regulates — the player hears 1 bark every ~2–3 seconds as
they walk the spine, creating a continuous murmur without cacophony.

---

## Water Floor Engineering

### The Problem

The attached reference image shows the southern half of Floor 2 as open
water (blue). The boardwalk appendages (yellow with fence railings) extend
over this water. Between and below the appendages, the player should see
water stretching to the horizon — not floor tiles.

### The Solution: No-Tile Water Zone

**Tile value**: All water-zone cells (rows 21–34, and gaps between
boardwalk appendages in rows 16–20) are set to `TILES.EMPTY` (0).

**Current behavior** (from `floor-generator.js` line 65):
```javascript
if ((tile === ctx.TILES.EMPTY || tile === ctx.TILES.GRASS) && biome.floorTiles) {
  row.push(pickWeightedChar(biome.floorTiles, ctx));
}
```

Currently, EMPTY tiles get mapped to the biome's `floorTiles` array — they
render as floor surface. For the water effect, we need EMPTY tiles in the
water zone to **skip floor tile assignment** and instead show the biome's
sub-horizon color/gradient.

### Implementation: Biome Fallback Guards

Three changes are needed to make the water horizon work:

**Guard 1 — New tile type: WATER (tile ID TBD, suggest 40)**

Add a `TILES.WATER` constant that the visual grid builder treats differently
from EMPTY. Water tiles are non-walkable (collision = wall) but visually
transparent to the floor layer.

```javascript
// In floor-generator.js buildBiomeVisualGrid():
if (tile === ctx.TILES.WATER) {
  row.push(null);  // No floor character — sub-horizon shows through
  continue;
}
```

**Guard 2 — Biome sub-horizon color for 'lantern' preset**

The `lantern` sky preset needs a `subHorizonColor` field in `biomes.json`
that the background gradient painter uses for null-floor tiles:

```json
{
  "id": "lantern_row",
  "skyPreset": "lantern",
  "floorTiles": [{ "char": ".", "weight": 100 }],
  "subHorizonColor": "#1a4a6b",
  "subHorizonGradient": ["#1a4a6b", "#0d2b3e", "#061520"],
  "subHorizonFog": 0.7
}
```

**Guard 3 — Background color builder respects null-floor tiles**

In `buildBiomeBackgroundColors()`, when a tile's visual grid entry is
`null`, use the `subHorizonColor` instead of the normal floor gradient:

```javascript
// In floor-generator.js buildBiomeBackgroundColors():
if (biomeVisualGrid[y][x] === null && biome.subHorizonColor) {
  bgRow.push(biome.subHorizonColor);
} else {
  bgRow.push(computeGradientColor(x, y, biome));
}
```

### Rendering Order (Fence Rail → Water)

The 3D raycaster already renders walls/fences at their height, then the
floor behind them. For boardwalk appendages:

1. **FENCE tiles** (railing) render as half-height walls (0.4 height).
2. **BOARDWALK tiles** inside the fence render as floor with plank texture.
3. **WATER tiles** between appendages render as sub-horizon color — no
   floor surface, no wall, just the biome gradient showing through.

The player standing on a boardwalk appendage and looking south through
the fence railing will see: fence rail (foreground) → water color
(background, no floor). This creates the "boardwalk over water" effect.

### Collision Behavior

| Tile | Walkable | Visual | Raycaster |
|------|----------|--------|-----------|
| BOARDWALK | Yes | Plank texture | Floor surface |
| FENCE | No | Half-height rail | Short wall (0.4h) |
| WATER | No | None (sub-horizon) | No wall, no floor |
| ROAD | Yes | Cobblestone | Floor surface |
| PATH | Yes | Dirt | Floor surface |

### Files to Modify

| File | Change |
|------|--------|
| `engine/floor-manager.js` | Add TILES.WATER constant; author Floor 2 grid with water tiles |
| `public/js/floor-generator.js` | Guard 1 (null visual for WATER), Guard 3 (subHorizon bg color) |
| `public/data/gone-rogue/biomes.json` | Add `lantern_row` biome with subHorizonColor/Gradient/Fog |
| `public/js/biome-config.js` | Register `lantern` sky preset if not exists |

---

## Texture Atlas Needs (Floor 2 Specific)

| Texture | ID | Status | Notes |
|---------|-----|--------|-------|
| Cobblestone road | `floor_cobble` | ✅ Exists | Main road surface (rows 12–13) |
| Boardwalk planks | `floor_plank` | **Needed** | Warm wood, weathered, salt-stained |
| Lantern post | `pillar_lantern` | **Needed** | Warm-glow variant PILLAR texture |
| Fence railing | `fence_plank` | ✅ Exists | Dark half-height rail (salt-worn variant) |
| Gate arch | `gate_stone` | **Needed** | East gate to Floor 3 (overscaled, ceremonial) |
| Water sub-horizon | `sub_water` | **Needed** | Gradient color, not a tile texture — biome bg |
| Building facade | `wall_stone_commercial` | **Needed** | Varied storefronts |

---

## Existing Systems That Floor 2 Uses

All of these are implemented and tested:

- **NpcSystem** — AMBIENT/INTERACTIVE/VENDOR/DISPATCHER types, patrol,
  proximity barks, interact dispatch (same system as Floor 0/1 NPCs)
- **BarkLibrary** — faction-tagged bark pools, cooldown anti-repeat,
  one-shot lines, weighted random
- **CrateSystem** — chests at depth 2 get 8-12 slots, withdraw-only
- **Bonfire/HazardSystem** — boardwalk bonfire rest point, menu-first
- **Shop System** — faction card shop with buy/sell, rep tiers
- **InteractPrompt** — context-sensitive hints for all interactable tiles
- **Toast** — center-anchored below freelook ring
- **3-phase quest target** — Phase 1 (keys) targets will need Floor 2 coords

---

## Blockout Pass Checklist

- [ ] Grid size: 50×36 (matching Floor 0 and Floor 1 dimensions)
- [ ] Road spine: rows 12–13, 2 tiles wide, continuous E-W
- [ ] Path shoulders: rows 11, 14
- [ ] Pillar/lantern arcade: row 10, pillars every 8 cols
- [ ] Building facades: rows 2–5, 7 buildings with DOOR tiles
- [ ] Shrub strips: rows 1, 6 (backing + facade separation)
- [ ] West gate: DOOR_EXIT (0,12), (0,13) → Floor 1
- [ ] East gate: DOOR (49,12), (49,13) → Floor 3
- [ ] Main boardwalk spine: row 15 (continuous FENCE)
- [ ] Boardwalk appendages: rows 16–20, 6 fenced fingers over water
- [ ] Bonfire: central boardwalk appendage (~25, 17)
- [ ] Water zone: rows 21–34 all WATER tiles (no floor)
- [ ] Water gaps between appendages: WATER tiles in rows 16–20
- [ ] TILES.WATER constant added to floor-manager.js
- [ ] Biome `lantern_row` added to biomes.json with subHorizonColor
- [ ] floor-generator.js Guards 1–3 implemented
- [ ] 10 NPC definitions registered in npc-system.js
- [ ] 14 bark pools registered in data/barks/en.js
- [ ] 3 dialogue trees authored (Fisher 12-node, Drinker 18-node, Gatekeeper 15-node)
- [ ] Gate Warden blocks east gate (Dispatcher pattern from Floor 1)
- [ ] Chandler vendor wired to shop system
- [ ] Spatial contract updated: gridSize {w:50, h:36}, skyPreset 'lantern'
- [ ] Playtest: walk west gate → road → boardwalk → bonfire → east gate
- [ ] Playtest: enter all 7 building doors
- [ ] Playtest: verify water renders behind fence railings on boardwalk
- [ ] Art pass: assign final textures to all tile types

---

*Blockout prep compiled Apr 3 — ready for grid authoring session.*

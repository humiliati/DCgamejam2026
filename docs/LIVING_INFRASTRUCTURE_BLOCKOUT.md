# Living Infrastructure Blockout — Floor-by-Floor Building & Verb-Node Plan

> **DOC-84** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-04-08
> **Status**: Design — blockout reference, not yet implemented
> **Depends on**: DOC-83 (VERB_FIELD_NPC_ROADMAP §13-18), INTERACTIVE_OBJECTS_AUDIT, ACT2_NARRATIVE_OUTLINE (§4 faction lock, §5.4 housing reassignment), floor-blockout files
> **Purpose**: Concrete placement guide for new buildings, verb nodes, and living infrastructure tiles on every exterior floor. This document bridges the abstract roadmap designs into grid-coordinate-aware blockout work.

---

## Table of Contents

1. [Tile Prerequisites](#1-tile-prerequisites)
2. [Building Interior Templates](#2-building-interior-templates)
3. [Floor 0 — The Approach](#3-floor-0--the-approach)
4. [Floor 1 — The Promenade](#4-floor-1--the-promenade)
5. [Floor 2 — Lantern Row](#5-floor-2--lantern-row)
6. [Floor 3 — The Garrison](#6-floor-3--the-garrison)
7. [Floor 4 — The City (Future)](#7-floor-4--the-city-future)
8. [Verb-Node Registration Summary](#8-verb-node-registration-summary)
9. [Dependencies & Phase Order](#9-dependencies--phase-order)
10. [Trap & Cobweb Integration](#10-trap--cobweb-integration)
11. [Anti-Mush Invariants & Debug Tooling](#11-anti-mush-invariants--debug-tooling)
12. [Dungeon Creature Verb Tiles](#12-dungeon-creature-verb-tiles)
13. [Failure Modes, Risks & Emergent Features](#13-failure-modes-risks--emergent-features)
14. [Corpse Recovery Loop](#14-corpse-recovery-loop)
15. [Faction Relationship Model](#15-faction-relationship-model)
16. [Relationship-Driven Verb Morphing](#16-relationship-driven-verb-morphing)
17. [Economy Interior Templates & Tile IDs](#17-economy-interior-templates--tile-ids)

---

## 1. Tile Prerequisites

Before any blockout work begins, these tile IDs must be added to `engine/tiles.js`. All are opaque, non-walkable furniture tiles unless noted.

### 1.1 Tile ID Registry

| ID | Name | Walk | Opaq | Height | Texture Key | Satisfies Verb | Biomes |
|----|------|------|------|--------|-------------|----------------|--------|
| 40 | WELL | ✗ | ✓ | 0.5× | `well_stone` | social | exterior, promenade, lantern, frontier |
| 41 | BENCH | ✗ | ✓ | 0.35× | `bench_wood` (ext) / `bench_cushion` (int) | social + rest | all exterior + inn, tea house |
| 42 | NOTICE_BOARD | ✗ | ✓ | 1.2× | `notice_board_wood` | errands | exterior, promenade, lantern, frontier |
| 43 | ANVIL | ✗ | ✓ | 0.5× | `anvil_iron` | duty (work_station) | shop (foundry), foundry dungeon, smelter |
| 44 | BARREL | ✗ | ✓ | 0.6× | `barrel_wood` | errands / work_station | all biomes |
| 45 | CHARGING_CRADLE | ✗ | ✓ | 0.8× | `charging_cradle` | rest (construct-only) | construct_bay, garage, clockworks |
| 46 | SWITCHBOARD | ✗ | ✓ | 1.0× | `switchboard_panel` | duty (work_station) | signal, relay |
| 47 | SOUP_KITCHEN | ✗ | ✓ | 0.7× | `soup_cauldron` | eat | exterior, promenade, lantern, frontier |
| 48 | COT | ✗ | ✓ | 0.3× | `cot_canvas` | rest | exterior, barracks, watchpost, garrison |

### 1.2 tiles.js Changes Required

```javascript
// After DETRITUS: 39
WELL:            40,   // Exterior well — social gathering node, stone rim + dark water
BENCH:           41,   // Bench seating — social + rest dual-verb, low profile
NOTICE_BOARD:    42,   // Exterior notice board — errands verb, pinned parchment
ANVIL:           43,   // Foundry anvil — duty/work_station for smiths
BARREL:          44,   // Wooden barrel — generic errands/work prop
CHARGING_CRADLE: 45,   // Construct charging station — rest for mechanical entities
SWITCHBOARD:     46,   // Signal switchboard — duty/work_station for comms operators
SOUP_KITCHEN:    47,   // Soup cauldron on brazier — eat verb satisfier
COT:             48    // Canvas bedroll on low frame — rest verb, overflow housing
```

Update `isWalkable()`: None of these are walkable.
Update `isOpaque()`: All are opaque (block movement + LOS).

### 1.3 Biome Texture Entries Required

Each biome that uses a new tile needs height + texture entries in `floor-manager.js` `getFloorContract()`:

| Biome | Tiles Used | tileWallHeights | textures |
|-------|-----------|-----------------|----------|
| `exterior` | COT, SOUP_KITCHEN | `48: 0.3, 47: 0.7` | `48: 'cot_canvas', 47: 'soup_cauldron'` |
| `promenade` | WELL, BENCH, NOTICE_BOARD, SOUP_KITCHEN, COT | `40: 0.5, 41: 0.35, 42: 1.2, 47: 0.7, 48: 0.3` | matching texture keys |
| `lantern` | WELL, BENCH, NOTICE_BOARD, SOUP_KITCHEN, COT, BARREL | same pattern | same pattern |
| `frontier` | WELL, BENCH, NOTICE_BOARD, SOUP_KITCHEN, COT, ANVIL, BARREL | same pattern | same pattern |
| `inn` | BENCH | `41: 0.35` | `41: 'bench_cushion'` |
| `shop` | ANVIL, BARREL | `43: 0.5, 44: 0.6` | matching |
| `watchpost` | COT | `48: 0.3` | `48: 'cot_canvas'` |
| `smelter` | ANVIL, BARREL | `43: 0.5, 44: 0.6` | matching |
| `clockworks` | CHARGING_CRADLE, BARREL | `45: 0.8, 44: 0.6` | matching |
| `garage` | CHARGING_CRADLE, COT | `45: 0.8, 48: 0.3` | matching |
| `signal` | SWITCHBOARD | `46: 1.0` | `46: 'switchboard_panel'` |
| `relay` | SWITCHBOARD | `46: 1.0` | `46: 'switchboard_panel'` |

### 1.4 Texture Assets Needed

| Texture Key | Description | Priority |
|-------------|-------------|----------|
| `well_stone` | Circular stone rim, dark water center. Top-down reads as round. | High — Floor 1 town square |
| `bench_wood` | Simple plank seat on two posts. Side-on profile. | High — ubiquitous |
| `bench_cushion` | Interior variant, padded seat. Warmer tones. | Medium — inn/tea house only |
| `notice_board_wood` | Two posts, crossbar, pinned parchment sheets. | High — exterior errands |
| `anvil_iron` | Dark iron block on stone pedestal. | Medium — Foundry interiors |
| `barrel_wood` | Banded oak barrel. Classic RPG prop. | Low — can use existing crate texture initially |
| `charging_cradle` | Metal frame with conduit cables, dim amber status LED. | Medium — construct buildings |
| `switchboard_panel` | Brass toggle switches, patch cables, indicator lights. Retrofuturistic. | Medium — signal buildings |
| `soup_cauldron` | Iron pot on brazier stand. Steam emoji sprite optional. | High — living infrastructure |
| `cot_canvas` | Rolled bedding on low wooden frame. Drab canvas. | High — living infrastructure |

**Reuse opportunity**: `barrel_wood` can initially reuse `crate_wood` (BREAKABLE texture). `bench_wood` can initially reuse `table_wood` (TABLE texture) at reduced height. This defers 2 of 10 texture commissions.

---

## 2. Building Interior Templates

**Authoring note.** The templates below are source-of-truth *shapes*, but the day-to-day cut happens inside the **Blockout Visualizer** (`tools/blockout-visualizer.html`) — not by editing `engine/floor-blockout-*.js` by hand. Paint / rect / lasso / stamp the interior, set spawn + door targets via the Meta panel (`M`), validate, then `Ctrl+S` writes `GRID`, `SPAWN`, and `doorTargets` back into the floor-builder file. For batch work or agent drivers, use `window.BO.run({action,...})` in the browser or `node tools/blockout-cli.js <action>`. See `tools/BO-V README.md` — particularly the "What this tool is / isn't" and "Workflows for AI agents" sections — before starting a slice. The **world-designer → BO-V seed payload** flow (planned in `tools/short-roadmap.md`) will eventually scaffold a new building node with biome defaults + pinned door targets and open BO-V on the seeded grid; until then, pick the closest existing template below, duplicate, and edit in BO-V.

New buildings follow standardized templates based on existing interior patterns. All interiors use the same IIFE floor-builder pattern as existing blockouts.

### 2.1 Template: Shop (16×12)

Used by: existing 2.3-2.7, 3.2. Reusable for new shops.

```
     0123456789012345
  0  1111111111111111    N wall
  1  1..25..25..25..1    BOOKSHELF shelves along walls
  2  1..............1    
  3  1...26..12.....1    BAR_COUNTER + SHOP tile
  4  1..............1    Open floor
  5  1..............1    
  6  1..............1    
  7  1..............1    
  8  1..............1    
  9  1..10......10..1    Pillar-flanked entry vestibule
 10  1......SS......1    Spawn area (S = player spawn zone)
 11  1111114111111111    DOOR_EXIT (4) at center

Tiles: 1=WALL, 4=DOOR_EXIT, 10=PILLAR, 12=SHOP, 25=BOOKSHELF, 26=BAR_COUNTER
```

### 2.2 Template: Apartment (8×8)

New. Minimal living space for citizen NPCs. 2 beds, 1 table, 1 hearth.

```
     01234567
  0  11111111    N wall
  1  1.29...1    HEARTH (fireplace)
  2  1......1    
  3  1.28...1    TABLE
  4  1......1    
  5  1.27.27.1   BED × 2
  6  1......1    Entry
  7  11114111    DOOR_EXIT (4)

Tiles: 27=BED, 28=TABLE, 29=HEARTH
Verb nodes: bonfire(hearth), bench(table), rest_spot(bed×2)
```

**NPC capacity**: 2 citizen NPCs per apartment. Rest verb pulls them home at night. Duty/social pulls them out during the day.

### 2.3 Template: Barracks (14×10)

New. Shared sleeping quarters with communal area. For guard/worker NPCs.

```
     01234567890123
  0  11111111111111    N wall
  1  1.48.48.48.48.1   COT × 4 (sleeping area)
  2  1............1    
  3  1............1    
  4  1....29......1    HEARTH (warmth)
  5  1............1    
  6  1.41....41...1    BENCH × 2 (common area)
  7  1............1    
  8  1......SS....1    Spawn
  9  11111114111111    DOOR_EXIT

Tiles: 29=HEARTH, 41=BENCH, 48=COT
Verb nodes: rest_spot(cot×4), bonfire(hearth), bench(bench×2)
```

**NPC capacity**: 4 NPCs. Shift workers cycle between duty posts and barracks rest.

### 2.4 Template: Soup Kitchen (12×8)

New. Communal feeding station. Exterior or semi-enclosed.

```
     012345678901
  0  111111111111    N wall (or FENCE for open-air variant)
  1  1.47.47....1    SOUP_KITCHEN × 2 (serving cauldrons)
  2  1..........1    
  3  1.41..41...1    BENCH × 2 (eating area)
  4  1..........1    
  5  1.41..41...1    BENCH × 2 (more seating)
  6  1....SS....1    Entry
  7  111114111111    DOOR_EXIT (or open entrance)

Tiles: 41=BENCH, 47=SOUP_KITCHEN
Verb nodes: eat(soup_kitchen×2), bench(bench×4), rest_spot(bench as dual-verb)
```

**NPC capacity**: 6-8 during meal rushes. Eat verb convergence creates visible crowds.

### 2.5 Template: Workshop (16×14)

New. For Clockmaster's, Signal Office, Gazette. Larger than a shop, with work areas.

```
     0123456789012345
  0  1111111111111111    N wall
  1  1..25..46..25..1    BOOKSHELF + SWITCHBOARD (or ANVIL, varies)
  2  1..............1    
  3  1...26....26...1    BAR_COUNTER work surfaces × 2
  4  1..............1    
  5  1..............1    Work floor
  6  1.....28.......1    TABLE (break area)
  7  1..............1    
  8  1..41..........1    BENCH (rest corner)
  9  1..............1    
 10  1..............1    
 11  1..............1    
 12  1..10......10..1    Pillar vestibule
 13  1111114111111111    DOOR_EXIT

Tiles vary by building. SWITCHBOARD(46) for Signal Office, ANVIL(43) for Clockmaster's.
Verb nodes: work_station(counter×2), bulletin_board(bookshelf), bench(table+bench), rest_spot(bench)
```

### 2.6 Template: Construct Bay (14×10)

New. Charging stations and repair benches for mechanical entities.

```
     01234567890123
  0  11111111111111    N wall
  1  1.45..45..45.1    CHARGING_CRADLE × 3 (rest bays)
  2  1............1    
  3  1............1    
  4  1...26...43..1    BAR_COUNTER (repair bench) + ANVIL (tools)
  5  1............1    
  6  1............1    
  7  1............1    
  8  1......SS....1    Spawn
  9  11111114111111    DOOR_EXIT

Tiles: 26=BAR_COUNTER, 43=ANVIL, 45=CHARGING_CRADLE
Verb nodes: rest_spot(cradle×3), work_station(counter+anvil)
```

**Construct capacity**: 3 charging cradles = 3 reanimated constructs can settle here.

---

## 3. Floor 0 — The Approach

### 3.1 Current State

50×36 exterior. Biome: `exterior` (red brick, evening). Tutorial corridor leading east to Floor 1.

**Existing interactive tiles**:
- BONFIRE(18,8) — NC campground
- BONFIRE(29,11) — NE shack area  
- BONFIRE(20,25) — SC pod
- MAILBOX(10,24) — SW pod
- CHEST(42,32) — SE loot
- DOOR(44,17)+(44,18) → Floor 1

**Deferred facades** (solid WALL blocks, no DOOR):
- **NE Shack** — rows 6-9, cols 27-30 (4×4 wall block)
- **SW House** — rows 25-28, cols 7-10 (4×4 wall block)

**Existing verb nodes** (verb-nodes.js):
- `approach_campfire` (bonfire, 18,14) — NOTE: coordinates don't match actual BONFIRE at (18,8). Needs correction.
- `approach_facade` (rest_spot, 37,17)

### 3.2 Planned Changes

#### 3.2a Open Deferred Facades

Convert the NE shack and SW house from solid wall blocks to building entrances:

**NE Shack → Vagrant's Shack (Floor 0.1)**
- Location: Replace WALL at approximately (29,8) with DOOR tile → Floor 0.1
- Interior template: Apartment (8×8), biome `shack`
- Contents: 1 COT, 1 HEARTH (oil drum fire), 1 BARREL
- Verb nodes: rest_spot(cot), bonfire(hearth)
- NPC: 1 ambient drifter (archetype: `drunk` — high social, orbits between shack hearth and NC campfire)

**SW House → Relay Station (Floor 0.2)**
- Location: Replace WALL at approximately (9,27) with DOOR tile → Floor 0.2
- Interior template: Workshop (16×14) scaled down to (10×8), biome `relay`
- Contents: 1 SWITCHBOARD, 1 TERMINAL, 1 COT, 1 BENCH
- Verb nodes: work_station(switchboard), bulletin_board(terminal), rest_spot(cot)
- NPC: 0-1 ambient radio operator (archetype: `telegraph_op` — high duty, rarely leaves)

#### 3.2b Add Living Infrastructure to Exterior

**Cot cluster** — Place 2 COT tiles near the NC campground:
- COT at (16,9) and (17,9) — adjacent to existing BONFIRE(18,8)
- These serve as the Approach's overflow sleeping area. The drifter NPC and any T1 reanimated creatures heading back to Floor 0 have somewhere to rest.

**Soup kitchen** — NOT placed on Floor 0. The Approach is too sparse/rural for communal feeding. NPCs "eat" at bonfires (bonfire satisfies eat verb at reduced effectiveness on Floor 0).

#### 3.2c Updated Verb Nodes

```javascript
// Corrected and expanded Floor 0 verb nodes
register('0', [
  // Social — campfires
  { id: 'approach_campfire_nc',  type: 'bonfire',       x: 18, y: 8  },
  { id: 'approach_campfire_ne',  type: 'bonfire',       x: 29, y: 11 },
  { id: 'approach_campfire_sc',  type: 'bonfire',       x: 20, y: 25 },

  // Rest — cots near NC campfire
  { id: 'approach_cot_a',       type: 'rest_spot',     x: 16, y: 9  },
  { id: 'approach_cot_b',       type: 'rest_spot',     x: 17, y: 9  },

  // Errands — mailbox
  { id: 'approach_mailbox',     type: 'bulletin_board', x: 10, y: 24 },

  // Rest — facade area (existing, corrected position)
  { id: 'approach_facade_rest', type: 'rest_spot',     x: 37, y: 17 }
]);
```

**Node count**: 7 (was 2). Covers social ×3, rest ×3, errands ×1.

### 3.3 Floor 0 Blockout Sketch

```
Legend: B=BONFIRE  C=COT  M=MAILBOX  D=DOOR(→F1)  d=DOOR(→interior)
        ·=walkable  █=wall  ▓=tree  ░=shrub  ═=road

         NW meadow    NC campground    NE shack
         ▓▓▓▓▓▓▓      ▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓
         ▓····▓▓      ▓··B··▓         ▓█d██▓▓   ← DOOR to 0.1
         ▓····▓▓      ▓·CC··▓         ▓····▓▓
         ▓····▓▓      ▓·····▓         ▓····▓▓
         ░░░░░░░      ░░░░░░░         ░░░░░░░

    ═══════════════════════════════════════DD    → Floor 1
    ═══════════════════════════════════════DD

         SW house     SC bonfire       SE trees
         ▓▓▓▓▓▓▓      ▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓
         ▓█d██▓▓      ▓··B··▓         ▓····▓▓
         ▓····▓▓      ▓·····▓         ▓····▓▓
         ▓·M··▓▓      ▓·····▓         ▓····▓▓
         ░░░░░░░      ░░░░░░░         ░░░░░░░
```

---

## 4. Floor 1 — The Promenade

### 4.1 Current State

50×36 exterior. Biome: `promenade` (marble sunset). Main village hub with 4 building pods.

**Existing buildings** (all doors occupied):
- NW pod: Bazaar DOOR(10,8) → 1.1
- NC pod: Inn DOOR(22,8) → 1.2
- SW pod: Storm Shelter DOOR(10,27) → 1.3
- SC pod: Home DOOR(22,27) → 1.6
- West gate: DOOR_EXIT(2,17)+(2,18) → Floor 0
- East gate: DOOR(48,17)+(48,18) → Floor 2

**Existing interactive tiles**: BONFIRE(24,17) on central road, MAILBOX(22,25), DUMP_TRUCK(30,26)

**Existing verb nodes**: 13 nodes registered (bonfire, well, benches, shop entrances, faction posts, work station, rest spot)

**Available space for new infrastructure** (no new building facades — all 4 pods are taken):
- NE cluster (cols 33-44, rows 3-13): Open area with noticeboard pillars. Room for outdoor furniture.
- SE cluster (cols 33-44, rows 23-31): Open area with well pillars. Room for outdoor furniture.
- Road corridor margins (rows 14-15, 20-21): Pillar arcades with open tiles between pillars.
- South pod interiors (rows 24-31): Open space within pod boundaries.

### 4.2 Planned Changes

Floor 1 has **no room for new building facades** — the 4 pod slots are taken. Instead, living infrastructure goes on the **exterior** as outdoor furniture:

#### 4.2a Town Square Congregation (NE cluster area)

The NE cluster (noticeboard pavilion area, centered ~38,7) becomes a town square with:

- SOUP_KITCHEN at (36,10) — outdoor cauldron near the noticeboard
- BENCH at (34,6) and (36,6) — seating facing the noticeboard
- WELL already registered as verb node at (34,24) — keep as-is in SE

This creates a **congregation template** (§17.3): the noticeboard (errands), soup kitchen (eat), and benches (social+rest) are within 4 tiles of each other. NPCs on different verb motivations converge here.

#### 4.2b Cot Row (road corridor south margin)

Place COT tiles along the southern pillar arcade (row 21-22 area), tucked against building facades:

- COT at (8,21), (14,21), (26,21) — 3 cots spaced along the south arcade
- These represent the Promenade's overflow housing. Workers who can't afford inn rooms sleep under the arcade.
- Visible at night: occupied cots. Visible during the day: empty cots (NPCs at duty/social).

#### 4.2c Existing Interior Updates

No new interiors needed on Floor 1. But existing interiors get verb-node additions for living infrastructure:

**Floor 1.2 (Driftwood Inn)** — add eat verb coverage:
- Existing BAR_COUNTER and TABLE already serve as eat-verb satisfiers (§17.2 food node table)
- Register `inn_bar` as eat-satisfiable: add to `eat` verb's satisfier list: `['mess_hall', 'soup_kitchen', 'bar_counter', 'bonfire']`
- No grid changes needed — just verb-node type expansion

**Floor 1.6 (Gleaner's Home)** — no changes. Player-only space.

#### 4.2d Updated Verb Nodes

```javascript
// Expanded Floor 1 verb nodes (additions to existing 13)
register('1', [
  // ... existing 13 nodes unchanged ...

  // NEW — Eat nodes
  { id: 'promenade_soup',       type: 'soup_kitchen',  x: 36, y: 10 },

  // NEW — Congregation benches (NE town square)
  { id: 'promenade_bench_ne_a', type: 'bench',         x: 34, y: 6  },
  { id: 'promenade_bench_ne_b', type: 'bench',         x: 36, y: 6  },

  // NEW — Cot row (south arcade)
  { id: 'promenade_cot_a',     type: 'rest_spot',     x: 8,  y: 21 },
  { id: 'promenade_cot_b',     type: 'rest_spot',     x: 14, y: 21 },
  { id: 'promenade_cot_c',     type: 'rest_spot',     x: 26, y: 21 }
]);
```

**Node count**: 19 (was 13). Adds eat ×1, bench ×2, rest ×3.

### 4.3 Floor 1 Blockout Sketch (additions only)

```
Legend: S=SOUP_KITCHEN  b=BENCH(new)  c=COT(new)  ★=existing node

         NW: Bazaar      NC: Inn         NE: Town Square (new congregation)
         ┌──D──┐         ┌──D──┐         b·b·····
         │     │         │     │         ····42··    42=NOTICE_BOARD(existing)
         └─────┘         └─────┘         ··S·····    S=SOUP_KITCHEN(36,10)
                                          ········

    ──★bonfire════════════════════════════════──    central road
    ════════════════════════════════════════════

         c·····c         ·····c          ·······     c=COTs along south arcade
         SW: Shelter     SC: Home        SE: Well
         ┌──D──┐         ┌──D──┐         ··★well·
         │     │         │     │         ········
         └─────┘         └─────┘         ········
```

---

## 5. Floor 2 — Lantern Row

### 5.1 Current State

50×36 hand-authored exterior. Biome: `lantern` (warm brick commercial). Source: `floor-blockout-2.js`.

**Existing buildings** (7 interiors, all doors in north facade row):
- 2.1 Dispatcher's Office (cols 5-10)
- 2.2 Watchman's Post (cols 12-17)
- 2.3 Armorer's Workshop (cols 20-24)
- 2.4 Chandler's Shop (cols 26-30)
- 2.5 Apothecary (cols 32-36)
- 2.6 Cartographer (cols 38-42)
- 2.7 Tea House (cols 44-48)

**Layout**: North facade strip (rows 2-5) with 7 building doors at row 5. Central road corridor (rows 7-14) with pillar arcades and shop stalls at row 11. South half (rows 15-35) is fenced boardwalk fingers over WATER.

**Gates**: West DOOR_EXIT(0,12) → Floor 1. East DOOR(49,12) → Floor 3.

**Existing verb nodes**: NONE registered for Floor 2.

### 5.2 Planned Changes

#### 5.2a New Buildings (3 interiors)

Floor 2's north facade has 7 buildings packed tight (cols 5-48). There's no room for additional building facades in the existing row. Instead, new buildings go on the **south boardwalk** — the finger-piers over water currently serve as decorative dead-ends but can host small enclosed structures at their tips:

**Signal Office (Floor 2.8)** — South boardwalk, westernmost finger
- Exterior: Add DOOR tile at finger terminus (approx cols 8-12, row 28)
- Interior: Workshop template (16×14), biome `signal`
- Contents: SWITCHBOARD ×2, TERMINAL ×1, COT ×1, BENCH ×1
- Verb nodes: work_station(switchboard×2), bulletin_board(terminal), rest_spot(cot)
- NPCs: 1 telegraph operator (duty: switchboard), 1 courier (cross-floor, errands-heavy)

**Gazette Pressroom (Floor 2.9)** — South boardwalk, second finger
- Exterior: Add DOOR tile at finger terminus (approx cols 18-22, row 28)
- Interior: Workshop template (16×14) scaled to (12×10), biome `pressroom`
- Contents: BAR_COUNTER ×1 (printing press), BOOKSHELF ×2, BENCH ×1
- Verb nodes: work_station(counter), bulletin_board(bookshelf), bench(bench)
- NPCs: 1 typesetter (duty: printing press, occasionally checks exterior notice board)

**Construct Bay (Floor 2.10)** — South boardwalk, central finger (widest)
- Exterior: Add DOOR tile at central boardwalk terminus (approx cols 30-34, row 28)
- Interior: Construct Bay template (14×10), biome `construct_bay`
- Contents: CHARGING_CRADLE ×3, BAR_COUNTER ×1, ANVIL ×1
- Verb nodes: rest_spot(cradle×3), work_station(counter, anvil)
- NPCs: 0 native — **destination floor for reanimated constructs from Deepwatch (2.2.N)**

#### 5.2b Living Infrastructure on Exterior

**Soup kitchen** — Place SOUP_KITCHEN tile on the central boardwalk near the main bonfire:
- SOUP_KITCHEN at approximately (31,15) — on the main boardwalk, 2 tiles south of road corridor
- Creates a meal congregation point near the existing bonfire at (33,17)

**Cot row** — Place COT tiles along the north facade, between building doors:
- COT at (11,6), (18,6), (25,6), (31,6), (37,6), (43,6) — 6 cots in the alcoves between facades
- Workers who serve the 7 shops sleep right outside their workplace

**Notice boards** — Place NOTICE_BOARD tiles at road corridor pillar gaps:
- NOTICE_BOARD at (15,10) and (35,10) — two boards flanking the road, near shop stalls
- Errands verb satisfiers for NPCs who browse notices

**Benches** — Place BENCH tiles on boardwalk overlooks:
- BENCH at (10,18), (24,18), (40,18) — 3 benches on the boardwalk, facing the water
- Social + rest dual-verb. NPCs take breaks overlooking the harbour.

#### 5.2c Verb Node Registration (NEW — Floor 2 has zero nodes currently)

```javascript
register('2', [
  // Social
  { id: 'lantern_bonfire',       type: 'bonfire',        x: 33, y: 17 },
  { id: 'lantern_bench_w',       type: 'bench',          x: 10, y: 18 },
  { id: 'lantern_bench_c',       type: 'bench',          x: 24, y: 18 },
  { id: 'lantern_bench_e',       type: 'bench',          x: 40, y: 18 },

  // Errands
  { id: 'lantern_notice_w',      type: 'bulletin_board',  x: 15, y: 10 },
  { id: 'lantern_notice_e',      type: 'bulletin_board',  x: 35, y: 10 },
  { id: 'lantern_shop_dispatcher', type: 'shop_entrance', x: 7,  y: 5  },
  { id: 'lantern_shop_armorer',  type: 'shop_entrance',  x: 22, y: 5  },
  { id: 'lantern_shop_chandler', type: 'shop_entrance',  x: 28, y: 5  },
  { id: 'lantern_shop_apothecary', type: 'shop_entrance', x: 34, y: 5 },
  { id: 'lantern_shop_cartographer', type: 'shop_entrance', x: 40, y: 5 },
  { id: 'lantern_shop_teahouse', type: 'shop_entrance',  x: 46, y: 5  },

  // Duty
  { id: 'lantern_tide_post',     type: 'faction_post',   x: 8,  y: 12, faction: 'tide' },
  { id: 'lantern_foundry_post',  type: 'faction_post',   x: 22, y: 12, faction: 'foundry' },
  { id: 'lantern_admiralty_post', type: 'faction_post',  x: 40, y: 12, faction: 'admiralty' },

  // Eat
  { id: 'lantern_soup',          type: 'soup_kitchen',   x: 31, y: 15 },

  // Rest
  { id: 'lantern_cot_a',         type: 'rest_spot',      x: 11, y: 6  },
  { id: 'lantern_cot_b',         type: 'rest_spot',      x: 18, y: 6  },
  { id: 'lantern_cot_c',         type: 'rest_spot',      x: 25, y: 6  },
  { id: 'lantern_cot_d',         type: 'rest_spot',      x: 31, y: 6  },
  { id: 'lantern_cot_e',         type: 'rest_spot',      x: 37, y: 6  },
  { id: 'lantern_cot_f',         type: 'rest_spot',      x: 43, y: 6  }
]);
```

**Node count**: 22. Covers social ×4, errands ×8, duty ×3, eat ×1, rest ×6.

### 5.3 Existing Interior Updates

**Floor 2.2 (Watchman's Post)** — Add barracks verb nodes:
- Existing bonfire and planning table get verb-node registrations
- Add COT tiles to west armory room (guard bunks) — 2-3 COTs against north wall
- Register rest_spot nodes for COTs

**Floor 2.7 (Tea House)** — Already a natural congregation space:
- Register existing TABLE tiles as bench-type verb nodes (social + rest)
- Register HEARTH as bonfire (social + eat)
- This makes the Tea House a primary indoor meal congregation point

---

## 6. Floor 3 — The Garrison

### 6.1 Current State

52×52 hand-authored exterior. Biome: `frontier` (cool indigo dusk). Source: `floor-blockout-3.js`. Crosshair layout with center guard tower + 4 arms.

**Existing buildings**:
- 3.1 Armory/Barracks: DOOR at (25,1) — north arm
- 3.2 Quartermaster's Shop: DOOR at (31,20) — NE shack

**Key landmarks**:
- Center: 6×6 guard tower + scattered slum shacks
- North arm: Forest clearing with bonfire at (23,6), boardwalk east
- West arm: Entry corridor, DOOR_EXIT(0,25)+(0,26) → Floor 2
- East arm: 4-wide ROAD highway, LOCKED_DOOR(51,25)+(51,26) → Floor 4 (requires rent receipt)
- South arm: Fenced boardwalk pier, crates at terminus

**Existing verb nodes**: NONE registered for Floor 3.

### 6.2 Planned Changes

Floor 3 has the most expansion room — the 52×52 grid is sparsely populated. The crosshair layout creates 4 natural zones for new buildings.

#### 6.2a New Buildings (4 interiors)

**Clockmaster's Workshop (Floor 3.3)** — East arm, north side of highway
- Exterior: Add building facade + DOOR at approximately (40,20) — north side of east ROAD
- Interior: Workshop template (16×14), biome `clockworks`
- Contents: BAR_COUNTER ×2 (mainspring bench, gear lathe), ANVIL ×1 (calibration table), CHARGING_CRADLE ×1, BENCH ×1, BOOKSHELF ×1 (schematic board)
- Verb nodes: work_station(counter×2, anvil), rest_spot(cradle, bench), bulletin_board(bookshelf)
- NPCs: 1 interactive Clockmaster, 1 ambient apprentice
- **Special**: Reanimated construct arrival point. Clockmaster has one-shot recognition bark.

**Smelter (Floor 3.4)** — Center area, south of guard tower
- Exterior: Add building facade + DOOR at approximately (24,34) — north end of south arm
- Interior: Workshop template (16×14), biome `smelter`
- Contents: HEARTH ×1 (furnace at 3× height), ANVIL ×1, BAR_COUNTER ×1 (mold bench), BARREL ×3
- Verb nodes: bonfire(furnace), work_station(anvil, counter), rest_spot(near furnace warmth)
- NPCs: 1 ambient smelter hand
- **Special**: Supply chain terminus — Foundry materials flow up from Ironhold through here.

**Automaton Garage (Floor 3.5)** — East arm, south side of highway
- Exterior: Add building facade + DOOR at approximately (40,30) — south side of east ROAD, across from Clockmaster's
- Interior: Construct Bay template (14×10), biome `garage`
- Contents: CHARGING_CRADLE ×3, BAR_COUNTER ×1 (tool rack), COT ×1 (mechanic's pallet)
- Verb nodes: rest_spot(cradle×3, cot), work_station(counter)
- NPCs: 1 ambient mechanic
- **Special**: Primary reanimated construct destination. Constructs from Ironhold Depths (3.1.N) settle here.

**Slum Soup Kitchen (Floor 3.6)** — Center area, west of guard tower
- Exterior: Add open-air structure (FENCE perimeter, no solid walls) at approximately (14,24)
- Interior: Soup Kitchen template (12×8), biome `frontier` (outdoor variant — FENCE not WALL)
- Contents: SOUP_KITCHEN ×2, BENCH ×4
- Verb nodes: eat(soup_kitchen×2), bench(bench×4)
- NPCs: 0-1 ambient cook
- **Special**: Open-air — no DOOR, just a FENCE gap entrance. Slum residents drift in to eat.

#### 6.2b Living Infrastructure on Exterior

**Cot clusters** — Scattered among center slum shacks:
- COT at (20,22), (21,22), (26,28), (27,28) — 4 cots near the guard tower
- COT at (22,8), (24,8) — 2 cots near the north bonfire clearing
- Total: 6 exterior cots. The Garrison is rough — people sleep outside.

**Notice board** — Near the east highway entrance:
- NOTICE_BOARD at (36,25) — on the highway approach to the LOCKED_DOOR
- Errands node. NPCs check the board for news about the City (Floor 4).

**Well** — Center area near guard tower:
- WELL at (25,26) — south of the guard tower, center of the slum
- Secondary social node. Citizens gather at the well to draw water + gossip.

#### 6.2c Verb Node Registration

```javascript
register('3', [
  // Social
  { id: 'garrison_bonfire',       type: 'bonfire',        x: 23, y: 6  },
  { id: 'garrison_well',          type: 'well',           x: 25, y: 26 },

  // Errands
  { id: 'garrison_notice',        type: 'bulletin_board',  x: 36, y: 25 },
  { id: 'garrison_quartermaster', type: 'shop_entrance',  x: 31, y: 20 },
  { id: 'garrison_clockmaster',   type: 'shop_entrance',  x: 40, y: 20 },

  // Duty
  { id: 'garrison_foundry_post',  type: 'faction_post',   x: 30, y: 24, faction: 'foundry' },
  { id: 'garrison_admiralty_post', type: 'faction_post',  x: 20, y: 24, faction: 'admiralty' },

  // Eat
  { id: 'garrison_soup_a',        type: 'soup_kitchen',   x: 14, y: 24 },
  { id: 'garrison_soup_b',        type: 'soup_kitchen',   x: 15, y: 24 },

  // Rest
  { id: 'garrison_cot_a',         type: 'rest_spot',      x: 20, y: 22 },
  { id: 'garrison_cot_b',         type: 'rest_spot',      x: 21, y: 22 },
  { id: 'garrison_cot_c',         type: 'rest_spot',      x: 26, y: 28 },
  { id: 'garrison_cot_d',         type: 'rest_spot',      x: 27, y: 28 },
  { id: 'garrison_cot_north_a',   type: 'rest_spot',      x: 22, y: 8  },
  { id: 'garrison_cot_north_b',   type: 'rest_spot',      x: 24, y: 8  }
]);
```

**Node count**: 16. Covers social ×2, errands ×3, duty ×2, eat ×2, rest ×6.

---

## 7. Floor 4 — The City (Future)

Floor 4 doesn't exist yet. This section establishes the building vocabulary so earlier floors are designed with the endpoint in mind. No grid coordinates — this is structural planning only.

### 7.1 Layout Concept

- **Grid**: 64×64 (largest floor — reflects urban density)
- **Biome**: `city` — full retrofuturistic. Neon signage textures, pneumatic tube props, construct workers as ambient population.
- **Structure**: Grid street layout (contrast with Garrison's crosshair and Promenade's pod clusters). 4×4 city blocks separated by ROAD corridors.
- **Entry**: West gate from Floor 3 (via LOCKED_DOOR passage, requires rent receipt)
- **Exit**: East gate → Act 2 content or endgame

### 7.2 Planned Buildings

| Building | Floor ID | Template | Verb Role | Faction |
|----------|----------|----------|-----------|---------|
| Central Exchange | 4.1 | Workshop (16×14) | Errands hub — 4 work stations, 2 notice boards | Neutral |
| Broadcast Tower | 4.2 | Workshop (16×14) | Signal Office scaled up — comms nerve center | Admiralty |
| Construct Foundry | 4.3 | Construct Bay (14×10) ×2 | Mass production facility — 6 work stations, 4 cradles | Foundry |
| Transit Hub | 4.4 | Custom (20×16) | Cross-floor traversal nexus — 4 transit nodes | Neutral |
| City Apartments ×4 | 4.5-4.8 | Apartment (8×8) | Citizen housing — rest verb destination | Neutral |
| Grand Soup Hall | 4.9 | Soup Kitchen (12×8) ×2 | Main eat congregation — feeds the city | Neutral |
| Faction HQs ×3 | 4.10-4.12 | Workshop (16×14) | Act 2 faction headquarters | Tide/Foundry/Admiralty |

### 7.3 Living Infrastructure Density

Floor 4 should have the highest density of living infrastructure, reflecting genuine urban population:

- **Soup kitchens**: 2 exterior + 1 Grand Soup Hall interior
- **Cots**: 8-12 exterior, scattered along streets (homelessness in the shadow of progress)
- **Benches**: 6-8 along boulevards
- **Wells**: 1-2 public fountains (decorative but functional as social nodes)
- **Notice boards**: 4-6 at intersections
- **Congregation spaces**: 2-3 plaza clusters where eat + social + rest nodes overlap

---

## 8. Verb-Node Registration Summary

| Floor | Current Nodes | Planned Nodes | Delta | Priority |
|-------|--------------|---------------|-------|----------|
| 0 (Approach) | 2 | 7 | +5 | Medium — tutorial floor, sparse intentionally |
| 1 (Promenade) | 13 | 19 | +6 | High — main hub, needs eat + rest coverage |
| 1.1 (Bazaar) | 4 | 4 | 0 | Done |
| 1.2 (Inn) | 4 | 6 | +2 (eat nodes) | Medium — add eat verb to bar/hearth |
| 2 (Lantern Row) | 0 | 22 | +22 | **Critical — zero coverage currently** |
| 2.1-2.7 (interiors) | 0 | ~14 total | +14 | High — register existing furniture as nodes |
| 2.8-2.10 (new interiors) | 0 | ~10 total | +10 | Medium — requires building blockout first |
| 3 (Garrison) | 0 | 16 | +16 | **Critical — zero coverage currently** |
| 3.1-3.2 (existing interiors) | 0 | ~6 total | +6 | Medium — register existing furniture |
| 3.3-3.6 (new interiors) | 0 | ~16 total | +16 | Low — requires building blockout first |
| 4 (City) | 0 | ~40 planned | +40 | Future — Floor 4 doesn't exist yet |

**Total planned verb nodes**: ~157 across all floors (currently 23).

---

## 9. Dependencies & Phase Order

### 9.0 Authoring tooling dependency

The populations, archetypes, verb-nodes, enemy tiers, and bark pools referenced throughout this blockout are all authored through the seven-tool suite described in **`docs/NPC_TOOLING_ROADMAP.md` (DOC-110)**. Critical cross-links:

- §3 / §4 / §5 / §6 floor populations → produced by P1 NPC Designer + P7 Population Planner budget tracker
- §5.2c / §6.2c / §12.6 verb-node registration → P3 Verb-Node Stamper layer on blockout-visualizer (6 template stamps including `town_square`, `soup_kitchen_congregation`, `dungeon_rest_ring`)
- §12.3 creature verb-set definitions → P4 Archetype Studio + P5 Enemy Hydrator reanim-behavior tab
- §10.2 suppression-radius / §11 anti-mush invariants → P7 Population Planner coherence checks (`unsatisfiable-archetype`, `empty-bark-pool`, `broken-supply-chain`)
- §17 economy / supply-chain → P7 supply-chain trace overlay

Phase 0 of DOC-110 (schema + CLI + `data/npcs.json` extraction) should land before Step 3 below so that verb-node registration has a canonical NPC source to validate against.

### 9.1 Critical Path

```
Step 1: Add tile IDs 40-49 to tiles.js (§1)                          ✓ DONE
   ↓
Step 2: Add biome texture/height entries for new tiles (§1.3)        ✓ DONE
   ↓
Step 3: Register verb nodes for Floors 2 + 3 (§5.2c, §6.2c)
   ├── This unblocks Phase 4 (floor population) from DOC-83
   └── NPCs on Floors 2-3 can immediately start verb-field behavior
   ↓
Step 4: Place living infrastructure tiles on existing grids (§3.2b, §4.2, §5.2b, §6.2b)
   ├── COTs, SOUP_KITCHENs, BENCHes, NOTICEBOARDs on exterior floors
   ├── Requires Step 1 (tile IDs exist)
   └── CHECK: Validate no FIRE/POISON within suppression radius of eat/rest nodes (§10.2)
   ↓
Step 4b: Add cobweb viscosity property to cobweb-node.js (§10.3)
   ├── New field: viscosity multiplier per cobweb tile
   └── Enables verb-field attenuation through cobwebbed corridors
   ↓
Step 5: Open deferred facades on Floor 0 (§3.2a)
   └── Convert WALL→DOOR, author 0.1 and 0.2 interiors
   ↓
Step 6: Author new Floor 2 interiors (2.8, 2.9, 2.10) (§5.2a)
   └── Requires boardwalk finger modifications in floor-blockout-2.js
   ↓
Step 7: Author new Floor 3 interiors (3.3, 3.4, 3.5, 3.6) (§6.2a)
   └── Requires facade additions in floor-blockout-3.js
   ↓
Step 8: Add dungeon creature tile IDs 49-54 to tiles.js (§12.2)
   ├── ROOST, NEST, DEN, FUNGAL_PATCH, ENERGY_CONDUIT, TERRITORIAL_MARK
   └── Biome texture entries for cellar, foundry, sealab
   ↓
Step 9: Add creature verb-set definitions to enemy data (§12.3)
   └── Each enemy type maps to rest/eat/duty/social tile preferences
   ↓
Step 10: Integrate creature tile placement into D3 proc-gen (§12.6)
   ├── Placement rules per tile type
   └── Validation: every creature has ≥1 reachable verb tile
   ↓
Step 11: Add economy tile IDs 55-59 to tiles.js (§17.4)
   └── STRETCHER_DOCK, TRIAGE_BED, MORGUE_TABLE, INCINERATOR, REFRIG_LOCKER
   ↓
Step 12: Author economy building interiors (§17.2-17.3)
   ├── Clinic 2.11, Records Office 2.12 (Floor 2 boardwalk)
   ├── Morgue 3.7, Union Hall 3.8 (Floor 3 south/west)
   └── Black Market 3.1.2 (hidden dungeon interior)
   ↓
Step 13: Implement FactionRelations singleton (§15.2)
   ├── Trust/heat/debt triplet per directional pair
   └── Starting values from §15.2 lore table
   ↓
Step 14: Expand CorpseRegistry with recovery states (§14.2)
   ├── TAGGED, RECOVERED, PROCESSED, STOLEN, DECAYED
   └── Decay timer + medic dispatch trigger
   ↓
Step 15: Implement anti-mush invariants (§11.1-11.4)
   ├── Node capacity + overflow routing (§11.1)
   ├── Minimum flow injection (§11.2)
   ├── Congestion decay (§11.3)
   └── Sink cooldown breathe cycle (§11.4, §12.5)
   ↓
Step 16: Build debug overlay system (§11.5)
   └── 7-channel diagnostic renderer — required before tuning node placement
   ↓
Step 17: Add NPC memory system (§16.1)
   ├── Per-NPC rapport/respect/fear/ideology
   └── Verb weight morphing from memory (§16.3)
   ↓
Step 18: Daily faction simulation tick (§15.4)
   └── Event generation, schedule updates, dungeon condition changes
```

### 9.2 What Can Ship Independently

| Deliverable | Depends On | Effort | Impact |
|-------------|-----------|--------|--------|
| Tile IDs 40-49 in tiles.js | Nothing | 30m | ✓ DONE |
| Biome texture/height entries | Tile IDs | 30m | ✓ DONE |
| Floor 2 verb-node registration | Tile IDs | 30m | Activates verb-field on Lantern Row |
| Floor 3 verb-node registration | Tile IDs | 30m | Activates verb-field on Garrison |
| Floor 1 congregation + cots | Tile IDs | 30m | Visible meal rushes on main hub |
| Floor 0 exterior cots | Tile IDs | 15m | Minor — tutorial atmosphere |
| Cobweb viscosity property | cobweb-node.js exists | 1h | Enables §10.3 verb attenuation through webs |
| Trap suppression radius check | isHazard() exists | 30m | Validates §10.2 — no eat-nodes in poison zones |
| Floor 0 deferred facades | Tile IDs + interior authoring | 2h | Opens 2 new interiors |
| Floor 2 new interiors | Tile IDs + blockout modifications | 3h | 3 new buildings (Signal, Gazette, Construct Bay) |
| Floor 3 new interiors | Tile IDs + blockout modifications | 4h | 4 new buildings (Clockmaster's, Smelter, Garage, Soup Kitchen) |
| Dungeon creature tile IDs 49-54 | Nothing | 30m | Unblocks creature verb behavior underground |
| Creature verb-set definitions | Tile IDs 49-54 | 1h | Maps each enemy type to verb tile preferences |
| D3 proc-gen creature tile placement | Tile IDs + creature verb-sets | 2h | Integrates with D3 audit Phase 4 |
| Anti-mush invariants | Verb-field tick (DOC-83 §4) | 4h | Prevents silent system degradation (§11.1-11.4) |
| Debug overlay system | Renderer access | 3h | 7-channel diagnostic view (§11.5) — blocks tuning |

### 9.3 Recommended Order for Immediate Work

1. ~~**tiles.js** — add IDs 40-49 (30m)~~ ✓ DONE
2. ~~**floor-manager.js** — biome texture/height entries (30m)~~ ✓ DONE
3. **verb-nodes.js** — register Floor 2 + Floor 3 nodes (1h)
4. **Floor 1 grid** — place SOUP_KITCHEN, COT, BENCH tiles (30m)
5. **Floor 2 grid** — place exterior living infrastructure (30m)
6. **Floor 3 grid** — place exterior living infrastructure (30m)
7. **cobweb-node.js** — add viscosity property + verb attenuation hook (1h)
8. **Trap/node proximity audit** — verify no FIRE/POISON within suppression radius of eat/rest nodes across all floors (30m)

Total for steps 3-8: **~4h**. Steps 3-6 give every exterior floor verb-node coverage and visible living infrastructure. Steps 7-8 weave trap and cobweb dependencies into the verb-field so the system degrades gracefully from day one rather than requiring a retrofit later.

9. **tiles.js** — add dungeon creature tile IDs 49-54 (30m)
10. **enemies.json / enemy defs** — add creature verb-set mappings per enemy type (1h)

Total for steps 3-10: **~6.5h**. Steps 3-8 cover surface infrastructure. Steps 9-10 extend the verb-field vocabulary underground so that when the D3 proc-gen composer (audit Phase 4) lands, creature tiles are ready to place.

**Deferred until verb-field tick lands (DOC-83 §4)**: Anti-mush invariants (§11.1-11.4), debug overlay (§11.5), startle/formation system (§12.4), and dungeon sink cooldowns (§12.5). These can't be implemented until the verb-field propagation loop exists, but their *design* is locked here so the tick implementation accounts for capacity, cooldown, congestion, and creature disposition from the start.

---

## 10. Trap & Cobweb Integration

Living infrastructure shares floor space with existing trap (TRAP, FIRE, SPIKES, POISON) and cobweb (cobweb-node.js) systems. When verb-field NPCs path through areas containing these hazards, their **disposition** determines how they interact. This section defines the three disposition layers and the field-level effects of traps and cobwebs on verb propagation.

### 10.1 Disposition Layers

NPCs exist in one of three disposition states. Each state changes how the entity reads trap and cobweb field modifiers.

**Layer A — Friendly / Reanimated (T1-T3)**
- Low agency. Follows ambient verb gradients without self-preservation logic.
- **Traps**: Friendly NPCs do **not** avoid traps. A T1 wander-pathing skeleton will walk across SPIKES and take damage. T2/T3 NPCs with higher verb-field weight will route *around* hazards only if an equally attractive non-hazard path exists (prefer, not require).
- **Cobwebs**: Friendly NPCs treat cobwebs as **viscosity** — they slow down but don't stop. A reanimated creature drifting toward a soup kitchen node through a cobwebbed corridor arrives late, not never. Cobwebs do not block verb satisfaction, they delay it.
- **Design intent**: Friendlies are ambient furniture. They get hurt, they get stuck, and that's part of the aesthetic. The player can clean cobwebs to speed their workforce. Trap placement near verb nodes is a player optimization problem.

**Layer B — Hostile Unaware (patrol / verb-waypoint)**
- Follows lowest-resistance verb paths or patrol waypoints. Has self-preservation heuristics.
- **Traps**: Unaware hostiles emit a local **avoidance field** around known traps (traps they've "seen" — within LOS and within 4 tiles). They route around. If the only path goes through a trap, they take it but with a bark ("*sighs*") and reduced movement speed on the hazard tile.
- **Cobwebs**: Unaware hostiles treat cobwebs as minor impedance. They path through but their verb-field tick rate halves in cobwebbed tiles (verbs decay slower → they linger longer in webbed areas). This makes cobwebbed zones into **staging areas** where unaware enemies accumulate before dispersing.
- **Design intent**: Cobwebs become tactical geography. The player can leave webs intact to slow enemy patrols, or clear them to create faster routes for their own reanimated workers. Traps are obstacles enemies respect but can be forced through via kiting.

**Layer C — Hostile Alerted (chasing player)**
- Overrides verb gradient with direct pursuit vector. High urgency, low caution.
- **Traps**: Alerted hostiles **ignore** trap avoidance fields. They will chase the player across FIRE, SPIKES, and POISON. This is the kiting payoff — the player leads enemies through hazard corridors and the enemies take the damage.
- **Cobwebs**: Alerted hostiles are slowed by cobwebs (movement speed ×0.5 in webbed tiles) but do not break pursuit. Cobwebs become **kiting tools** — leading a chase through a dense web area buys the player time.
- **Design intent**: Combat rewards spatial awareness. The player who memorizes trap and cobweb placement can weaponize the dungeon against its own inhabitants.

### 10.2 Trap Field Effects on Verb Propagation

Traps are not just tile hazards — they modify the verb field around them:

| Trap Type | Field Effect | Radius | Disposition Affected |
|-----------|-------------|--------|---------------------|
| TRAP (generic) | Avoidance bias (verb weight −0.3 for movement toward trap) | 2 tiles | B only (A ignores, C ignores) |
| FIRE | Avoidance bias + blocks rest-verb propagation (too hot to sleep nearby) | 3 tiles | B + rest-verb for all |
| SPIKES | Strong avoidance bias (verb weight −0.6) | 1 tile (immediate neighbors) | B only |
| POISON | Avoidance bias + blocks eat-verb propagation (toxic atmosphere) | 4 tiles | B + eat-verb for all |

**Implication for blockout**: When placing SOUP_KITCHEN or COT tiles, ensure no POISON or FIRE trap is within the suppression radius. A soup kitchen next to a poison trap is a dead eat-node — NPCs will never satisfy eat there because the poison field suppresses eat-verb propagation.

### 10.3 Cobweb Viscosity Model

Cobwebs (managed by `cobweb-node.js`) apply a **viscosity multiplier** to any tile they occupy:

- **Movement speed**: ×0.5 for all entities (disposition-agnostic).
- **Verb propagation**: Verb-field influence passing *through* a cobwebbed tile is attenuated by 0.7× per webbed tile. A verb node's pull through 3 cobwebbed tiles reaches the far side at 0.7³ ≈ 0.34× strength.
- **Player cleaning**: Removing a cobweb instantly restores full propagation. This creates a visible "flow restoration" moment — NPCs downstream of the cleared web start moving faster within 1-2 ticks.

**Interaction with living infrastructure**: Cobwebs can spawn on any opaque tile, including new furniture tiles (BENCH, BARREL, NOTICE_BOARD). A cobwebbed NOTICE_BOARD still functions as an errands node but its pull radius is reduced. Cleaning infrastructure cobwebs is a maintenance verb the player performs to keep the economy flowing.

### 10.4 Dependencies

| Dependency | Blocks | Status |
|-----------|--------|--------|
| `cobweb-node.js` viscosity property | §10.3 propagation attenuation | Exists — needs `viscosity` field added |
| `tiles.js` `isHazard()` coverage | §10.2 field effects | Exists — covers TRAP, FIRE, SPIKES, POISON |
| Verb-field tick in NpcSystem | §10.1 disposition-aware trap avoidance | DOC-83 §4 — not yet implemented |
| Trap LOS detection for Layer B | §10.1 "seen trap" avoidance | New — ~1h, requires `isHazard()` + LOS check |

---

## 11. Anti-Mush Invariants & Debug Tooling

The verb-field system fails **quietly**. When it breaks, NPCs don't crash — they pile up at a clogged node, or stand motionless in a dead zone, or converge on a single soup kitchen while the rest of the world empties. These "mushy failures" are harder to catch than crashes. This section defines hard invariants that prevent silent degradation and the debug overlay needed to diagnose problems during development.

### 11.1 Invariant A — Throughput Guarantee (Anti-Clog)

Every verb-satisfying node (soup kitchen, cot, bench, work station) has a **capacity**. When occupancy exceeds capacity:

```
on_arrival(npc, node):
  if node.occupancy >= node.capacity:
    node.emit_repulsion(radius=3, strength=0.5)
    npc.redirect_to_nearest_alternative(node.verb_type)
```

- SOUP_KITCHEN capacity: 3 NPCs simultaneously. Excess redirects to next nearest eat-node.
- COT capacity: 1 NPC per cot tile. Full cots repel; NPCs seek the next rest_spot.
- BENCH capacity: 2 NPCs. Social verbs tolerate crowds better than rest.

**Why this matters**: Without this, the closest soup kitchen to a bonfire becomes a black hole. Every NPC routes there, none leave, the far side of the floor goes dead.

### 11.2 Invariant B — Minimum Flow (Anti-Stagnation)

Every tile on an active floor maintains a minimum verb-field pressure:

```
per_tick(tile):
  if tile.total_verb_pressure < MIN_THRESHOLD:
    tile.inject_background_pressure(amount=0.1, direction=nearest_node)
```

This prevents **dead zones** — regions where all verb gradients have decayed to zero because no node is close enough. The background pressure acts as a weak ambient current pushing NPCs toward *something* rather than letting them freeze in place.

**Floor-specific thresholds**: Floor 0 (sparse, tutorial) uses a lower MIN_THRESHOLD than Floor 3 (dense, many nodes). The threshold scales with verb-node density on the floor.

### 11.3 Invariant C — Congestion Decay

When more than 3 NPCs occupy a single tile or a 2×2 area:

```
per_tick(region):
  if region.npc_count > CONGESTION_LIMIT:
    for each npc in region:
      npc.add_repulsion_vector(random_outward, strength=0.3)
    region.verb_weights *= 0.8  // temporary verb suppression
```

Clumps self-dissolve within 4-6 ticks. NPCs scatter outward, then re-converge on different nodes. This creates a natural **pulse** pattern — gather, disperse, gather elsewhere — rather than a permanent mob.

### 11.4 Invariant D — Sink Cooldown (Breathe Cycle)

Verb-satisfying sinks (soup kitchens, charging cradles, work stations) cycle between active and cooldown states:

```
on_verb_satisfied(node):
  node.active = false
  node.emit_pushback_pulse(radius=2)
  after(cooldown_ticks):  // 3-5 ticks
    node.active = true
```

This prevents any single node from becoming a permanent attractor. The pushback pulse after consumption disperses the crowd, and the cooldown window lets other nodes attract NPCs. The result: NPCs **circulate** rather than camp.

**Soup kitchen example**: NPC arrives → eats (2 ticks) → kitchen deactivates → pushback clears the queue → kitchen reactivates → next NPC approaches. Visible as a rhythmic crowd pulse.

### 11.5 Debug Overlay Specification

A toggle-able visual overlay (dev-mode only) that renders verb-field state on top of the game view. Essential for tuning node placement during blockout.

| Channel | Visual | What It Shows |
|---------|--------|---------------|
| Pressure | Tile tint: blue (low) → red (high) | Total verb-field pressure per tile. Dead zones show as deep blue. |
| Flow direction | Small arrows per tile | Net verb gradient direction. Shows where NPCs will drift. |
| Verb weights | Colored dots (one per verb) | Which verbs are active at each tile. Eat=green, rest=purple, social=yellow, duty=red, errands=blue. |
| Congestion | Pulsing white brightness | Tiles with 2+ NPCs pulse brighter. 4+ NPCs pulse rapidly. |
| Trap suppression | Orange halo around hazard tiles | Shows the avoidance/suppression radius from §10.2. |
| Cobweb viscosity | Grey mesh overlay | Shows which tiles have viscosity modifiers from cobwebs. |
| Node capacity | Fill bar under node tile | Green = available capacity. Red = full (emitting repulsion). |

**Hotkey**: `F3` cycles through overlay channels. `Shift+F3` shows all channels simultaneously (noisy but useful for screenshots / bug reports).

### 11.6 Diagnostic Heuristics

When playtesting reveals mushy behavior, check in this order:

1. **NPCs stationary** → Toggle pressure overlay. If the NPC's tile is deep blue, it's a dead zone → check Invariant B threshold or add a nearby verb node.
2. **NPCs clumped at one node** → Toggle congestion overlay. If pulsing but not dispersing → check Invariant A capacity and Invariant C repulsion strength.
3. **One side of floor empty** → Toggle flow overlay. If arrows all point one direction → verb nodes are unevenly distributed. Rebalance per §8 coverage targets.
4. **NPCs ignoring a node** → Toggle trap suppression overlay. A nearby FIRE or POISON may be suppressing the verb. Move the hazard or the node.
5. **NPCs arriving very slowly** → Toggle cobweb overlay. Cobweb viscosity chains may be attenuating the node's pull. Clean path or boost node strength.

### 11.7 Dependencies

| Dependency | Blocks | Status |
|-----------|--------|--------|
| Verb-field tick (DOC-83 §4) | All invariants | Not yet implemented |
| Renderer overlay system | §11.5 debug overlay | New — ~3h for 7-channel system |
| Node capacity property | §11.1 throughput guarantee | New — add `capacity` field to VerbNodes schema |
| NPC `redirect_to_nearest_alternative()` | §11.1 overflow routing | New — ~2h, requires nearest-node query by verb type |
| Background pressure injector | §11.2 minimum flow | New — ~1h, runs per-tick on all tiles |

---

## 12. Dungeon Creature Verb Tiles

### 12.1 The Problem

All 29 original tile types (0-29) plus the 9 living infrastructure tiles (40-48) serve the **player** or **surface NPCs**. Dungeons (depth 3, `N.N.N`) have zero tiles that serve the creatures who live there. Monsters patrol between arbitrary waypoints in EMPTY(0) space. They don't eat, rest, congregate, or guard anything — they just ping-pong.

This means:
- Reanimated creatures on dungeon floors have nowhere to verb. `_assignWanderPath()` scans for BREAKABLE/BONFIRE/CHEST — player furniture — because nothing else exists.
- Dungeon sink cooldowns (§11.4) can't function underground because there are no sink nodes for creatures to arrive at, satisfy a verb, and cycle away from.
- The "bats resting in a grid formation then startling into flight" pattern has no tile anchor. Bats just… exist on EMPTY tiles with a STATIONARY path type.
- The living dungeon aesthetic stops at the dungeon threshold. Surface feels alive; underground feels mechanical.

### 12.2 New Dungeon Creature Tile IDs

| ID | Name | Walk | Opaq | Height | Texture Key | Creature Verb | Biome |
|----|------|------|------|--------|-------------|---------------|-------|
| 49 | ROOST | ✓ | ✗ | 0.0× | `roost_ceiling` | rest (flying creatures) | cellar, sealab cavern |
| 50 | NEST | ✗ | ✓ | 0.3× | `nest_debris` | rest + eat (ground creatures) | cellar, foundry vent |
| 51 | DEN | ✗ | ✓ | 0.5× | `den_hollow` | rest + social (pack creatures) | cellar, sealab |
| 52 | FUNGAL_PATCH | ✓ | ✗ | 0.0× | `fungal_glow` | eat (organic creatures) | cellar, sealab |
| 53 | ENERGY_CONDUIT | ✗ | ✓ | 0.8× | `conduit_spark` | eat + rest (constructs) | foundry, sealab lab |
| 54 | TERRITORIAL_MARK | ✓ | ✗ | 0.0× | `scorch_mark` | duty (guards/elites) | all dungeon biomes |

**Design notes per tile:**

**ROOST (49)** — Walkable, non-opaque. A ceiling anchor point rendered as subtle claw-marks or hanging geometry overhead. Creatures assigned to a roost rest there in grid formation (2×2 or 3×2 clusters). The roost is the "startled flight" origin: when an awareness event fires within range, all roosting creatures detach simultaneously and begin pathing. After the threat passes, they return. Walkable because it's overhead — the player walks beneath roosting bats.

**NEST (50)** — Non-walkable ground clutter. Piled debris, bones, shredded cloth. Rest + eat dual-verb: creatures return here to sleep and to consume prey. Dungeon Rats, Cobweb Crawlers, and Deep Crawlers use nests. When a nest's occupants are all killed, the nest becomes a CORPSE-like harvestable (salvage materials). When reanimated creatures need a rest destination on the same dungeon floor, nests are their first-choice target.

**DEN (51)** — Non-walkable hollowed alcove. Larger than a nest — supports 2-3 creatures. Rest + social dual-verb creates pack congregation. Slag Hounds, Rot Hounds use dens. A den with living occupants emits a weak social-verb field that attracts nearby pack members. A cleared den can be "claimed" by reanimated pack creatures who then guard it (duty verb upgrade on claim).

**FUNGAL_PATCH (52)** — Walkable, non-opaque. Bioluminescent growth on the floor. Eat-verb for organic creatures (Cave Toads feed here, Mold Wraiths absorb ambient spores). Also a weak light source — provides 2-tile dim illumination. Player can clean fungal patches for readiness, but doing so removes a creature eat-node. Tension: cleaning the dungeon starves its inhabitants, which is fine when they're hostile but becomes a problem once you've reanimated them.

**ENERGY_CONDUIT (53)** — Non-walkable mechanical fixture. Exposed conduit junction sparking with residual power. Eat + rest for constructs (Iron Golems, Clockwork Guards, Lab Drones recharge here). The foundry/sealab equivalent of CHARGING_CRADLE but cruder — dungeon infrastructure vs. maintained surface equipment. When a construct is reanimated, its first verb-field destination is the nearest ENERGY_CONDUIT, not surface-level CHARGING_CRADLE. Only after the dungeon conduit can't satisfy their need (cooldown, destroyed, too far) do they path upward to surface infrastructure.

**TERRITORIAL_MARK (54)** — Walkable, non-opaque. A scorch mark, claw gouge, or pheromone trail on the floor. Duty-verb for guard-type creatures. Bone Guards, Clockwork Guards, and Admiralty Enforcers patrol *to* and *from* their territorial marks rather than between arbitrary waypoints. This gives their patrol semantic meaning — they're guarding something. When the player cleans a territorial mark (readiness bonus), the guard who owned it loses their duty anchor and either re-marks nearby or shifts to rest/eat verbs, becoming less predictable.

### 12.3 Creature-to-Tile Verb Mapping

| Creature | Biome | Rest Tile | Eat Tile | Duty Tile | Social Tile |
|----------|-------|-----------|----------|-----------|-------------|
| Cobweb Crawler 🕷️ | Cellar | NEST | NEST (prey) | — | — |
| Shambling Corpse 🧟 | Cellar | — (doesn't rest) | FUNGAL_PATCH | TERRITORIAL_MARK | — |
| Dungeon Rat 🐀 | Cellar | NEST | FUNGAL_PATCH | — | NEST (colony) |
| Bone Guard 💀 | Cellar | — | — | TERRITORIAL_MARK | — |
| Mold Wraith 👻 | Cellar | — (drifts) | FUNGAL_PATCH | — | — |
| Cave Toad 🐸 | Cellar | DEN | FUNGAL_PATCH | — | DEN (mating) |
| Soot Imp 👺 | Foundry | NEST (vent) | ENERGY_CONDUIT (heat) | — | NEST (cluster) |
| Iron Golem 🦾 | Foundry | ENERGY_CONDUIT | ENERGY_CONDUIT | TERRITORIAL_MARK | — |
| Slag Hound 🐺 | Foundry | DEN | NEST (scrap) | — | DEN (pack) |
| Clockwork Guard ⚙️ | Foundry | ENERGY_CONDUIT | ENERGY_CONDUIT | TERRITORIAL_MARK | — |
| Ember Sprite ✨ | Foundry | — (floats) | ENERGY_CONDUIT | — | — |
| Tide Stalker 🦑 | Sealab | DEN | NEST (prey) | TERRITORIAL_MARK | — |
| Shock Eel 🐍 | Sealab | ROOST (ceiling coil) | FUNGAL_PATCH (brine) | — | — |
| Lab Drone 🔬 | Sealab | ENERGY_CONDUIT | ENERGY_CONDUIT | TERRITORIAL_MARK | — |
| Deep Crawler 🕷️ | Sealab | NEST | NEST (prey) | — | — |

**Creatures with no verb tiles** (by design): Bosses and elites use the arena itself as their verb space. The Bone Sovereign doesn't rest at a nest — they *are* the territorial anchor. Boss rooms don't need creature verb tiles; they need the boss's presence to suppress verb-field propagation in the chamber (everything defers to the boss).

### 12.4 Bat Roost Grid Formation (Worked Example)

The "bats resting then startling" pattern, concretely:

```
Roost cluster in a cellar corridor ceiling:

     0123456789
  0  1111111111    WALL ceiling (conceptual)
  1  1.RRRR...1    R = ROOST tiles (4 in a row)
  2  1.........1    walkable corridor below
  3  1.........1
  4  1111111111

State: RESTING
  - 4 Cobweb Crawlers (or bat-type variant) assigned to ROOST tiles
  - Each occupies one ROOST, facing downward
  - Rest verb satisfied; creatures are inert
  - Awareness check runs at reduced rate (every 3rd tick vs every tick)

Trigger: Player enters awareness radius (6 tiles) OR trap fires within 8 tiles OR combat bark within 10 tiles

State: STARTLED
  - All 4 creatures simultaneously set disposition → hostile_alerted
  - Each picks a scatter direction (away from trigger source)
  - 800ms burst movement (flee-then-reorient)
  - After scatter: transition to hostile_unaware, begin verb-field pathing
  - If threat clears (awareness decay), creatures path BACK to roost and re-enter RESTING

State: DISPLACED (roost destroyed or cleaned)
  - Creatures have no rest anchor
  - Shift to patrol-like behavior with elevated eat-verb (hungry, homeless bats)
  - More unpredictable — a feature, not a bug
```

This pattern generalizes: any creature type can have a "formation rest" at their designated tile, a startle trigger, and a displacement fallback. Rat nests work the same way (ground-level, smaller scatter radius). Golem conduit clusters work the same way (slower startle, longer return-to-rest delay).

### 12.5 Dungeon Sink Cooldown (Completing §11.4 Underground)

Surface sink cooldowns (§11.4) work because SOUP_KITCHEN and COT have capacity limits and breathe cycles. Underground, the same pattern applies to creature verb tiles:

| Sink Tile | Capacity | Cooldown | Pushback | Overflow Behavior |
|-----------|----------|----------|----------|-------------------|
| NEST | 2 creatures | 4 ticks after both slots used | Mild (radius 2) | Displaced creature seeks next NEST or DEN |
| DEN | 3 creatures | 6 ticks (pack social delays departure) | Gentle (radius 1) | Pack member circles nearby, re-enters |
| ROOST | 1 per tile, cluster of 4-6 | No cooldown (rest is passive) | Startle scatter only | Displaced creature patrols until threat passes |
| FUNGAL_PATCH | 2 feeders | 3 ticks (patch regrows) | None (walk-through tile) | Creature seeks next FUNGAL_PATCH |
| ENERGY_CONDUIT | 1 construct | 8 ticks (recharge cycle) | Strong (radius 3, sparks) | Construct seeks CHARGING_CRADLE upstairs (cross-floor!) |
| TERRITORIAL_MARK | 1 guard | No cooldown (continuous) | None | Guard re-marks if displaced |

**The ENERGY_CONDUIT → CHARGING_CRADLE overflow is the reanimation pipeline entry point.** When a reanimated construct's dungeon conduit is on cooldown or destroyed, it paths upstairs to surface infrastructure. This is how the dungeon-to-surface flow begins *organically* rather than being scripted.

### 12.6 Proc-Gen Placement Rules for D3

The D3 proc-gen contract (from the audit doc) needs creature verb tile placement rules:

```
Per generated N.N.N floor:
  - ROOST:            1-2 clusters of 3-5 tiles, ceiling corridors only, ≥8 tiles from entry
  - NEST:             2-4 singles or pairs, tucked into dead-ends or alcove corners
  - DEN:              0-1 per floor (rare), requires 3×2 minimum clear area
  - FUNGAL_PATCH:     3-6 scattered, ≥3 tiles apart, at least 1 near a NEST
  - ENERGY_CONDUIT:   1-2 on foundry/sealab floors, 0 on cellar floors
  - TERRITORIAL_MARK: 1 per guard-type enemy spawned, placed on their patrol midpoint

Validation invariant (add to §5 of D3 audit):
  - Every spawned creature must have ≥1 reachable verb tile matching its rest OR eat need.
  - If validation fails → inject a FUNGAL_PATCH at nearest dead-end (cheapest universal eat fallback).
```

### 12.7 Dependencies

| Dependency | Blocks | Status |
|-----------|--------|--------|
| Tile IDs 49-54 in `tiles.js` | All creature verb behavior underground | New — 30m |
| `isWalkable()` update (ROOST, FUNGAL_PATCH, TERRITORIAL_MARK are walkable) | Creature + player pathing | New — with tile IDs |
| `isOpaque()` update (NEST, DEN, ENERGY_CONDUIT are opaque) | LOS + raycaster | New — with tile IDs |
| Biome texture entries for cellar, foundry, sealab | Rendering | New — 30m |
| Creature verb-set definitions in `enemies.json` or enemy definitions | §12.3 mapping | New — 1h |
| D3 proc-gen placement pass | §12.6 rules | Integrates with D3 audit Phase 4 |
| Startle/formation system | §12.4 roost behavior | New — ~3h |
| EntityBrain contract (D3 audit Phase 0) | Disposition-aware verb resolution | Not yet implemented |

---

## 13. Failure Modes, Risks & Emergent Features

### 13.1 Pre-Emptive Failure Modes

These are the ways the combined living infrastructure + creature verb system can break. Each includes what it looks like, what causes it, and what invariant prevents it.

**F1 — The Ghost Floor**
*Symptom*: Player enters a dungeon floor and nothing moves. All enemies are clustered in one corner or standing frozen.
*Cause*: Proc-gen placed all creature verb tiles in one quadrant. Every creature's verb gradient points the same direction, so they all migrated there during the pre-spawn simulation tick.
*Prevention*: D3 placement rule §12.6 — verb tiles must be distributed across floor quadrants. Validation: no quadrant may contain >60% of a floor's creature verb tiles.

**F2 — The Extinction Spiral**
*Symptom*: Player cleans all FUNGAL_PATCHes and NEST debris for readiness. Reanimated creatures now have no eat/rest nodes. They path aimlessly, eventually clogging corridors (Invariant C triggers, they scatter, they clog again). The floor becomes a shuffling mob with no economic output.
*Cause*: Player optimized for readiness without understanding that creature verb tiles ARE the creature economy.
*Prevention*: Two-layer defense. First, FUNGAL_PATCHes regrow after 20 ticks (they're biological — cleaning is temporary). Second, at least 1 NEST per floor is flagged `permanent` — cleaning it yields readiness but doesn't remove the tile. The creature economy has a floor it can't fall below.
*Design note*: This is actually interesting tension. The player learns that over-cleaning starves their workforce. "Clean enough to function, dirty enough to feed" is an emergent optimization target.

**F3 — The Cross-Floor Stampede**
*Symptom*: All reanimated constructs on all dungeon floors simultaneously path to the same surface CHARGING_CRADLE because their ENERGY_CONDUITs all hit cooldown in the same tick.
*Cause*: Cooldown timers are synchronized. Every conduit was placed at the same proc-gen step, so they all cycle together.
*Prevention*: Stagger cooldown start times. Each ENERGY_CONDUIT's initial cooldown offset = `hash(floorId + tileX + tileY) % MAX_COOLDOWN`. Desynchronized cooldowns → desynchronized cross-floor migration → steady trickle, not stampede.

**F4 — The Roost Doom Loop**
*Symptom*: Bat cluster startles → scatters → threat decays → bats return to roost → player is still nearby → immediate re-startle → scatter → return → startle → infinite loop. The bats vibrate in place.
*Cause*: Awareness decay is faster than the return-to-roost travel time, so bats reach RESTING state while still inside the player's awareness trigger radius.
*Prevention*: Add a **roost lockout timer**. After startling, a roost is non-restable for 15 ticks regardless of awareness state. Bats must patrol for at least 15 ticks before they're allowed to re-roost. If the player is camping the roost, the bats remain in hostile_unaware patrol mode indefinitely — which is the correct tactical outcome (you've flushed them out).

**F5 — The Verb Desert**
*Symptom*: A reanimated creature on a proc-gen floor has no matching verb tile anywhere on the floor. It defaults to `_assignWanderPath()` legacy patrol — ping-pong between BREAKABLE/BONFIRE. It looks mechanical while everything else looks alive.
*Cause*: Proc-gen placed creature verb tiles for the wrong biome (e.g., ENERGY_CONDUITs on a cellar floor where only organic creatures spawn).
*Prevention*: The validation invariant in §12.6 — every spawned creature must have ≥1 reachable matching verb tile. If not, inject a FUNGAL_PATCH (universal organic eat fallback) or ENERGY_CONDUIT (universal construct fallback). This is the cheapest possible fix at gen-time.

**F6 — The Dungeon Drain**
*Symptom*: Every reanimated creature paths upstairs immediately. The dungeon empties out. Surface floors get overwhelmed with ex-dungeon creatures clogging surface infrastructure.
*Cause*: Dungeon verb tiles have lower verb-weight than surface tiles (surface SOUP_KITCHEN satisfies eat at 1.0×, dungeon FUNGAL_PATCH satisfies eat at 0.6×). Creatures always prefer the stronger signal.
*Prevention*: Cross-floor verb attenuation (DOC-83 §14). Verb-field signals from other floors are attenuated by 0.3× per floor boundary crossed. A surface soup kitchen's 1.0× eat signal reaches the dungeon as 0.3× — weaker than the local FUNGAL_PATCH's 0.6×. Creatures stay put unless their local options are exhausted or on cooldown. The cross-floor pull is a fallback, not a default.

**F7 — The Invisible Economy**
*Symptom*: Everything works correctly. Creatures verb around, sinks cycle, flows propagate. But the player doesn't notice. They just see "monsters walking around" with no readable pattern. The entire system is invisible.
*Cause*: No player-facing feedback for creature verb activity. The system is legible to the debug overlay but opaque to gameplay.
*Prevention*: This isn't a technical failure — it's a readability failure. Solutions in §13.3 (Emergent Features) below.

### 13.2 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tile count inflating beyond texture budget | High | Medium — 6 new tiles need 6 new textures | Reuse strategy: NEST→existing debris sprite, TERRITORIAL_MARK→existing scorch sprite, FUNGAL_PATCH→existing glow sprite. Only ROOST, DEN, ENERGY_CONDUIT need new art. |
| Creature verb ticks adding per-frame cost on D3 floors | Medium | High — dungeons have highest entity density | Budget: creature verb tick runs at ½ rate of surface NPC tick (every 2nd frame). Creatures are less responsive than surface NPCs, which reads as "animalistic" rather than "laggy". |
| Proc-gen validation rejects too many seeds | Low | Medium — slower floor generation | Set soft ceiling: max 3 re-rolls per floor. On 4th failure, spawn with partial invariant violations and tag floor as `degraded` for telemetry. |
| Player confusion: "why is cleaning bad now?" | Medium | High — contradicts tutorial "clean everything" | Tutorial floors (0, 1) have NO creature verb tiles. The tension only appears on Floor 2+ dungeons where the player has already internalized the reanimation loop. The shift from "clean everything" to "clean strategically" is a mid-game skill gate, not a tutorial contradiction. |
| Cross-floor pathing cost for reanimated creatures | Low | Medium — A* across floor boundaries is expensive | Shadow presence model (DOC-83 §14) — creatures don't pathfind across floors in real-time. They exit via STAIRS_UP and are resolved as a shadow presence on the destination floor, re-entering the verb-field there. |

### 13.3 Emergent Features Unlocked

Beyond the explicit vision (reanimated creatures → new fate → resources), dungeon creature verb tiles unlock gameplay patterns that weren't possible before:

**E1 — Tactical Cleaning as Creature Control**
The player can clean specific verb tiles to manipulate creature behavior. Clean the FUNGAL_PATCHes near a ROOST and the bats get hungry — they leave the roost to forage, exposing the corridor. Clean a TERRITORIAL_MARK and the guard loses their anchor — their patrol becomes erratic and exploitable. This turns the cleaning mechanic from "scrub for readiness points" into "reshape the dungeon's behavioral topology."

**E2 — Creature Infrastructure Sabotage (Hostile NPCs)**
Non-player heroes (hostile faction NPCs who also traverse dungeons) might destroy creature verb tiles during their own dungeon runs. The player returns to find a NEST smashed and displaced rats clogging a previously clear corridor. The dungeon's creature economy is *contested* — it changes between visits. This creates the Stardew Valley "the world moved while you were away" feeling underground.

**E3 — Reanimation Site Selection**
Where you reanimate a creature matters. Reanimate a Cobweb Crawler next to a NEST and it immediately settles in, starting its rest→eat→rest cycle. Reanimate it in a corridor with no verb tiles and it wanders aimlessly until it finds one (or paths upstairs). The player learns to reanimate near appropriate infrastructure — a spatial puzzle layered on top of the card-matching puzzle.

**E4 — Dungeon Ecosystem Readability**
Creature verb tiles make the dungeon ecosystem *visible*. A room with 3 FUNGAL_PATCHes and 2 NESTs reads as "creature habitat." A corridor with TERRITORIAL_MARKs reads as "guarded route." The player can scan a room and infer what lives there and what they're doing before encountering anything. This is the "Stardew readable routines" the D3 audit references — but underground.

**E5 — The Soylent Pipeline Gets Richer**
Currently the cage→shop pipeline is: reanimate → dispatch to shop → cage display → next-day resources. With dungeon verb tiles, a richer pipeline emerges: reanimate → creature verbs at dungeon NEST for 1-2 days (settling, feeding, producing ambient output) → creature's dungeon verb tile hits cooldown → creature paths to surface → enters surface economy → eventually routed to factional shop. The delay creates anticipation and the dungeon-stay phase creates visible "your workforce is growing" feedback.

**E6 — Emergency Flush Mechanic**
If the player triggers a trap chain near a ROOST cluster, the startle cascade flushes all roosting creatures simultaneously. This can be weaponized: set up a trap near a bat roost, lure a hostile elite into the trap, the trap fires, bats scatter into the elite's path creating chaos. The player orchestrated a multi-creature ambush using infrastructure, not combat stats.

**E7 — Floor Personality Amplification**
The D3 audit mentions seed tags (`kite-heavy`, `cleaning-heavy`, `mixed`). Creature verb tile ratios amplify these personalities. A `kite-heavy` floor gets more TERRITORIAL_MARKs (more guards to kite through traps) and fewer NESTs (less creature economy to maintain). A `cleaning-heavy` floor gets dense FUNGAL_PATCHes and NESTs (more to clean, but cleaning disrupts more creatures). The proc-gen seed tag directly controls the player's strategic tradeoffs.

### 13.4 Dependencies

| Dependency | Blocks | Effort |
|-----------|--------|--------|
| §12 creature tiles in tiles.js | All emergent features | 30m |
| Creature verb-set in enemy definitions | F5 prevention, E3-E5 | 1h |
| Proc-gen placement validation | F1, F5 prevention | Integrates with D3 audit Phase 4 |
| Cooldown desynchronization (hash offset) | F3 prevention | 30m |
| Roost lockout timer | F4 prevention | 30m |
| FUNGAL_PATCH regrowth timer | F2 prevention | 1h |
| Cross-floor verb attenuation (DOC-83 §14) | F6 prevention | Part of Phase 11 (~5h) |
| Creature activity bark/particle feedback | F7 (readability) | 2h |
| Startle cascade system (trap→roost chain) | E6 flush mechanic | 2h |

---

## 14. Corpse Recovery Loop

### 14.1 The Problem

Currently, corpses are player-only objects. The player finds them, harvests them, seals them, optionally reanimates them. If the player ignores a corpse, it sits on the floor forever (until `clearFloor()` on reload). Nobody else cares. There's no world reaction to a hallway full of dead monsters — no cleanup crew, no medical response, no faction consequence.

GTA2 solves this: ambulances dispatch to bodies, EMTs load them, and the bodies are removed. If the player blocks the ambulance or steals the body, the game reacts. We need the same loop — corpses that the world *processes* with or without the player.

### 14.2 Corpse State Expansion

Current states: `FULL → PARTIAL → DRY → REANIMATED`. Expand with recovery states:

```
FRESH ──────────────────────────────────────────────────────────┐
  │                                                              │
  ├─ player harvests ──→ PARTIAL ──→ DRY ──→ [player seals]    │
  │                                     │       ├─ REANIMATED   │
  │                                     │       └─ PROCESSED    │
  │                                     │           (legal)     │
  ├─ threshold hit ──→ TAGGED ──────────┤                       │
  │   (3+ corpses                       │                       │
  │    on floorN)                       │                       │
  │                                     │                       │
  └─ ignored (decay timer) ──→ DECAYED ─┘                       │
                                                                 │
TAGGED ──→ medic crew dispatched                                │
  │                                                              │
  ├─ crew arrives ──→ RECOVERED ──→ transported to Morgue       │
  │                       │                                      │
  │                       └─ player intercepts ──→ STOLEN       │
  │                                                              │
  └─ crew blocked/killed ──→ ABANDONED ──→ DECAYED              │
```

**New states:**

| State | Meaning | World Effect |
|-------|---------|-------------|
| TAGGED | Flagged for recovery by nearest faction | Medic crew spawns from Clinic/Morgue interior |
| RECOVERED | Loaded onto stretcher, in transit | Crew physically paths back to processing building |
| PROCESSED | Legally converted at Morgue | Faction gains salvage resources; shop stock refreshes |
| STOLEN | Player (or black market NPC) intercepted recovery | Illicit economy fed; faction trust drops |
| DECAYED | Ignored too long (30 ticks) | Tile becomes POISON hazard; district quality drops |
| ABANDONED | Recovery crew was blocked/killed | Corpse decays faster; faction heat rises |

### 14.3 Medic/Recovery Crew System

**Trigger**: When `CorpseRegistry.getFloorCount(floorId) >= CORPSE_THRESHOLD` (default: 3 fresh/tagged corpses on a single exterior floor), the **nearest faction's Clinic** dispatches a recovery crew.

**Crew composition**: 2 NPCs — 1 medic (carries stretcher), 1 escort (guard disposition). Both use verb-field pathing with a temporary `recovery` duty verb that overrides their normal verb set.

**Crew behavior**:
1. Spawn at Clinic/Triage interior door
2. Path to nearest TAGGED corpse on the target floor
3. Medic interacts with corpse (3-tick "load" animation) → state becomes RECOVERED
4. Crew paths back to Morgue/Processing interior
5. On arrival: corpse state → PROCESSED, faction gains resources, crew resumes normal verbs

**Faction assignment**: Corpse recovery is claimed by the faction with highest `trust` toward the district's dominant faction. If no faction has positive trust, corpses decay. This creates a visible consequence of faction neglect.

**Player interaction points**:
- **Help**: Escort the crew past hostiles → trust bonus with recovery faction
- **Ignore**: Neutral — system runs autonomously
- **Block**: Stand in crew's path or occupy the corpse → crew barks frustration, eventually abandons, heat rises
- **Steal**: Harvest or reanimate a TAGGED corpse before crew arrives → STOLEN state, trust penalty with claiming faction, black market trust bonus
- **Exploit**: Let corpses accumulate intentionally → forces faction to spend resources on recovery instead of other activities

### 14.4 Decay Mechanic

Corpses that remain FRESH or ABANDONED for 30 ticks → DECAYED. A decayed corpse:
- Tile becomes POISON(17) — area hazard, suppresses eat-verb within 4 tiles (§10.2)
- Nearby NPC verb weights shift: rest and social verbs suppressed within 3 tiles ("nobody wants to eat next to a rotting corpse")
- District quality metric decreases (feeds into §15 faction simulation tick)
- Player can clean the decay for readiness, but the original corpse loot is lost

**Design intent**: Decay is the punishment for ignoring corpses. It degrades the living infrastructure the player has been building. A soup kitchen next to a decayed corpse stops functioning as an eat node. This forces engagement with the corpse economy even if the player doesn't care about reanimation.

### 14.5 Tiles Required

| ID | Name | Walk | Opaq | Height | Texture Key | Verb | Biome |
|----|------|------|------|--------|-------------|------|-------|
| 55 | STRETCHER_DOCK | ✗ | ✓ | 0.4× | `stretcher_frame` | duty (medic staging) | clinic, morgue |
| 56 | TRIAGE_BED | ✗ | ✓ | 0.4× | `triage_bed` | duty (medical processing) | clinic |
| 57 | MORGUE_TABLE | ✗ | ✓ | 0.5× | `morgue_slab` | duty (corpse conversion) | morgue |
| 58 | INCINERATOR | ✗ | ✓ | 1.2× | `incinerator_grate` | duty (disposal) + eat (for constructs — waste heat) | morgue, smelter |
| 59 | REFRIG_LOCKER | ✗ | ✓ | 1.0× | `refrig_panel` | errands (corpse storage/preservation) | morgue, clinic |

**Reuse opportunities**: STRETCHER_DOCK can initially reuse `cot_canvas` at wider aspect. TRIAGE_BED can reuse `cot_canvas` with a tinted overlay. REFRIG_LOCKER can reuse `switchboard_panel` in cooler tones. Only MORGUE_TABLE and INCINERATOR need genuinely new textures.

---

## 15. Faction Relationship Model

### 15.1 Current State

Factions (Tide Council ♥, The Foundry ♦, The Admiralty ♣) exist only as card-system identifiers and vendor presets. There is **zero runtime relationship tracking** — no trust, no hostility, no memory of player alignment. Faction NPCs have `factionId` tags but these don't influence their verbs, barks, or behavior toward each other or the player.

### 15.2 Relationship Triplet

Track three values per directional pair. Stored in a `FactionRelations` singleton:

```javascript
// Per ordered pair (A → B), including (Faction → Player):
{
  trust:  0.0,   // −1.0 (hostile) to +1.0 (allied). Cooperation tendency.
  heat:   0.0,   // 0.0 (calm) to 1.0 (volatile). Conflict likelihood.
  debt:   0.0    // −1.0 (A owes B) to +1.0 (B owes A). Obligation/leverage.
}
```

**Matrix size**: 3 factions + player = 4 entities. 4×3 = 12 directional pairs. Each stores 3 floats. Total: 36 floats — trivial memory.

**Starting values** (reflect lore):

| From → To | Trust | Heat | Debt | Lore Reason |
|-----------|-------|------|------|-------------|
| Tide → Foundry | +0.1 | 0.2 | 0.0 | Uneasy trade partnership |
| Tide → Admiralty | −0.1 | 0.3 | +0.2 | Old grudge; Admiralty owes reparations |
| Foundry → Admiralty | +0.2 | 0.1 | −0.1 | Equipment contracts; Foundry in slight debt |
| Foundry → Tide | +0.1 | 0.1 | 0.0 | Neutral, business-focused |
| Admiralty → Tide | −0.2 | 0.4 | −0.2 | Tension; Admiralty refuses to pay |
| Admiralty → Foundry | +0.3 | 0.1 | +0.1 | Relies on Foundry equipment |
| All → Player | 0.0 | 0.0 | 0.0 | Unknown newcomer |

### 15.3 Update Triggers

Every meaningful player action updates the matrix. Updates propagate: if the player helps Faction A against Faction B, A→Player trust rises AND B→Player trust drops AND A→B heat rises.

| Player Action | Direct Effect | Ripple |
|---------------|---------------|--------|
| Clean/return bodies to Faction A's district | A→Player trust +0.1 | If bodies killed by B: A→B heat +0.05 |
| Loot corpse before medic crew arrives | All→Player trust −0.05 | Black market trust +0.1 (future) |
| Escort medic convoy safely | Recovery faction→Player trust +0.15 | Hostile faction heat toward player +0.05 |
| Reanimate enemy in Faction A's territory | A→Player trust −0.1 (necromancy taboo) | But A→Player debt +0.1 if reanimated creature contributes to A's economy |
| Complete factional shop quest | Quest faction→Player trust +0.2, debt −0.1 | Rival factions: heat toward quest faction +0.05 |
| Block/kill recovery crew | Crew's faction→Player trust −0.2, heat +0.15 | All factions: trust −0.05 (destabilizing) |
| Sell processed resources to faction | Buyer→Player trust +0.05, debt −0.05 | Competitors: heat toward buyer +0.02 |

### 15.4 District Simulation Tick

Once per in-game day (or every N real-time ticks during play), run a simulation pass:

```
daily_tick():
  // 1. Decay toward equilibrium
  for each pair:
    pair.heat *= 0.95    // tension cools 5% per day
    pair.debt *= 0.98    // debts slowly forgiven
    // trust does NOT decay — relationships persist

  // 2. Evaluate inter-faction events
  for each faction pair (A, B):
    tension = A→B.heat + B→A.heat
    cooperation = A→B.trust + B→A.trust
    leverage = abs(A→B.debt - B→A.debt)

    if tension > 1.2:
      queue_event('conflict', A, B)       // raid, sabotage, checkpoint
    elif cooperation > 1.0 and leverage < 0.3:
      queue_event('cooperation', A, B)    // joint cleanup, trade pact
    elif leverage > 0.6:
      queue_event('leverage', debtor, creditor)  // demand, ultimatum

  // 3. Pick 1-2 events from queue (don't spam)
  events = prioritize(event_queue, max=2)

  // 4. Apply event effects to world
  for each event:
    update_npc_schedules(event)
    update_dungeon_conditions(event)
    spawn_event_barks(event)
```

### 15.5 Event Types

| Event | Trigger | World Effect | Player Opportunity |
|-------|---------|-------------|-------------------|
| **Joint Cleanup Pact** | High cooperation | Both factions dispatch medic crews; faster corpse clearing | Help either crew for trust; play them against each other |
| **Checkpoint Crackdown** | High heat, one faction dominant | Dominant faction blocks transit between floors | Sneak past for respect; comply for trust; sabotage for rival trust |
| **Sabotage/Raid** | Very high heat | Faction NPCs damage rival infrastructure (destroy BENCH, vandalize NOTICE_BOARD) | Defend infrastructure for both factions' trust; join raid for aggressor trust |
| **Relief Convoy** | High debt, low heat | Debtor faction sends supply caravan | Escort for trust; raid for black market resources |
| **Strike/Protest** | High heat, low trust toward player | Faction NPCs refuse duty verb; congregate at NOTICE_BOARD with angry barks | Resolve grievance for massive trust; ignore and district quality drops |
| **Territorial Claim** | One faction's trust with player much higher than rivals | Favored faction expands verb-node coverage onto rival turf | Accept for favored faction's trust; resist for balance |

### 15.6 How Relationships Drive Verbs

The relationship matrix feeds directly into NPC verb weights:

```javascript
// In NPC verb-field tick, after base verb calculation:
function applyFactionRelationModifiers(npc, verbWeights) {
  const rel = FactionRelations.get(npc.factionId, 'player');

  // High trust → more social, trade, cooperative verbs
  if (rel.trust > 0.5) {
    verbWeights.social *= 1.3;
    verbWeights.errands *= 1.2;  // willing to run jobs for player
  }

  // High heat → avoidance, territorial verbs
  if (rel.heat > 0.6) {
    verbWeights.duty *= 1.4;     // guards more vigilant
    verbWeights.social *= 0.7;   // less chatty
  }

  // Debt → urgency verbs
  if (rel.debt > 0.4) {  // faction owes player
    verbWeights.errands *= 1.5;  // actively seeking to repay
  }
}
```

This means the same NPC gradually changes behavior as the player's relationship with their faction evolves. A Foundry worker who used to socialize at the well now patrols grimly because Foundry-Player heat spiked after the player stole a corpse from their medics.

---

## 16. Relationship-Driven Verb Morphing

### 16.1 Per-NPC Memory

Beyond the faction-level relationship matrix (§15), individual NPCs maintain a lightweight **memory** of their interactions with the player. This is the Stardew Valley layer — personal, not political.

```javascript
// Per NPC (not per faction), stored in NpcSystem entity state:
npcMemory = {
  rapport:   0.0,   // −1.0 to +1.0. Personal like/friendship.
  respect:   0.0,   // −1.0 to +1.0. Competence/reliability perception.
  fear:      0.0,   // 0.0 to 1.0. Threat/instability perception.
  ideology:  0.0    // −1.0 to +1.0. Alignment with player's faction behavior.
}
```

**Memory is per-NPC, faction relations are global.** A Tide Scholar with high personal rapport toward the player might still be wary because Tide→Player trust is low. The per-NPC memory modulates how the global faction stance is expressed individually.

### 16.2 Memory Update Triggers

| Interaction | Rapport | Respect | Fear | Ideology |
|-------------|---------|---------|------|----------|
| Talk to NPC (any dialogue) | +0.02 | — | — | — |
| Complete NPC's personal request | +0.1 | +0.1 | — | — |
| Clean near NPC's verb node | +0.03 | +0.05 | — | — |
| Fight/kill enemy near NPC | — | +0.05 | +0.02 | — |
| Reanimate enemy near NPC | — | +0.03 | +0.05 | ±0.1 (faction-dependent) |
| Block NPC's path repeatedly | −0.05 | — | +0.03 | — |
| Destroy infrastructure near NPC | −0.1 | −0.05 | +0.1 | −0.1 |
| Gift item to NPC (future) | +0.15 | — | — | — |
| NPC witnesses player steal corpse | −0.1 | +0.02 | +0.05 | −0.1 |

### 16.3 Verb Weight Morphing from Memory

NPC memory modifies verb weights independently of faction relations:

| Memory State | Verb Effect | Visible Behavior |
|-------------|-------------|-----------------|
| High rapport (>0.5) | social ×1.5 toward player, +confide bark pool | NPC seeks player out; shares gossip, tips, lore |
| High respect (>0.5) | errands ×1.3, +offer_job bark pool | NPC offers side quests, shares routes, covers for player |
| High fear (>0.6) | social ×0.3, +flee/avoid verb when player near | NPC actively avoids player; ducks into buildings |
| Ideology match (>0.5) | duty ×1.2 toward faction goals, +rally bark | NPC works harder for their faction, attributes success to player |
| Ideology mismatch (<−0.5) | social ×0.5, +argue/withhold bark pool | NPC debates player; refuses to share information; may rally others |
| Low rapport + high fear | All verbs suppressed near player; NPC routes around | The most visible morph — NPC actively reshapes their path to avoid the player |

### 16.4 Memory Persistence

NPC memory persists across floor transitions and play sessions (saved with `NpcSystem` state). It does NOT persist across floor reloads/resets (same scope as verb-node registrations). This means:
- Within a session, NPCs remember the player's behavior and gradually shift
- Between sessions, memory resets (acceptable for jam scope; persistence is a post-jam extension)
- Faction relations (§15) DO persist across sessions (stored separately in `FactionRelations` singleton)

### 16.5 The Calloused Normalcy Filter

Per the established tone: NPCs are calloused. High rapport doesn't make them grateful or warm — it makes them *less guarded*. A Foundry worker with high rapport doesn't say "thank you, friend!" They say "you're still here?" and then casually mention where the good scrap is.

Memory morph bark tone guide:

| Memory Level | Bark Tone |
|-------------|-----------|
| Rapport 0.0 (default) | Indifferent. "..." / "What." / "Busy." |
| Rapport +0.3 | Tolerant. "You again." / "Fine." / Points vaguely at something. |
| Rapport +0.6 | Familiar. "Oh—the rats are worse on 3 today." / Drops hint without being asked. |
| Rapport +0.9 | Trusted (rare). "Don't go past the checkpoint tonight." / Warns of faction event. |
| Rapport −0.3 | Curt. Turns away. Shorter bark cooldowns (dismissive). |
| Rapport −0.6 | Hostile. "Keep walking." / Actively blocks path. |
| Fear +0.6 | Tense. Flinches. Moves aside. Says nothing. |
| Fear +0.9 | Panic. Flees if player approaches within 3 tiles. |

---

## 17. Economy Interior Templates & Tile IDs

### 17.1 New Building Roster

These buildings support the corpse recovery loop (§14) and faction economy. They slot into existing floor plans alongside the living infrastructure buildings from §3-6.

| Building | Floor | Interior ID | Template Size | Faction | Primary Verb Role |
|----------|-------|-------------|---------------|---------|-------------------|
| Clinic / Triage | 2 (Lantern Row) | 2.11 | 12×10 | Neutral (nearest faction claims) | Medic dispatch, triage processing |
| Morgue / Processing | 3 (Garrison) | 3.7 | 14×10 | Foundry (industrial processing) | Corpse → legal resources conversion |
| Records Office | 2 (Lantern Row) | 2.12 | 10×8 | Admiralty (bureaucratic) | Body tags, bounty assignment, blame records |
| Union Hall / Canteen | 3 (Garrison) | 3.8 | 16×12 | Neutral | Worker congregation, rumor spread, eat + social hub |
| Black Market Chop Room | 3 dungeon (3.1.N or 3.2.N) | 3.1.2 or hidden | 10×8 | None (illicit) | Stolen corpse processing, contraband trade |

### 17.2 Floor Placement

**Floor 2 (Lantern Row)** — Already has 7 north facade shops (2.1-2.7) and 3 planned south boardwalk buildings (2.8-2.10). The boardwalk has 2 remaining finger-piers that can host small structures:

- **Clinic (2.11)** — 4th boardwalk finger (east), approx cols 38-44, row 28. DOOR at finger terminus. Makes sense here: close to the Tea House (2.7) and the commercial center. Medic crews dispatch from here toward any floor via transit nodes.
- **Records Office (2.12)** — 5th boardwalk finger (far east), approx cols 44-48, row 28. Or: repurpose part of the Dispatcher's Office (2.1) — the Dispatcher already handles administrative functions. Add a back room with EVIDENCE_LOCKER and PAY_WINDOW (reuse BAR_COUNTER + BOOKSHELF tiles).

**Floor 3 (Garrison)** — 52×52 grid with room. Currently: 3.1 (Armory), 3.2 (Quartermaster), 3.3-3.6 (planned from §6.2a).

- **Morgue (3.7)** — South arm terminus, approx (22,44). Dark, industrial. Near the Smelter (3.4) — shared INCINERATOR access. Foundry-affiliated: they process bodies with the same efficiency they process ore.
- **Union Hall (3.8)** — West arm, near entry corridor, approx (8,24). Large communal space. Workers arriving from Floor 2 pass through here first. Eat + social node density creates the game's largest congregation point outside the soup kitchens.

**Black Market** — NOT a surface building. Hidden within a dungeon depth floor (3.1.1 Ironhold or similar). Accessed through a concealed DOOR or destructible WALL. Discovery is a player milestone. Illicit economy runs in parallel to the legal corpse recovery pipeline.

### 17.3 Interior Templates

#### Template: Clinic / Triage (12×10)

```
     012345678901
  0  111111111111    N wall
  1  1.56.56....1    TRIAGE_BED × 2 (intake bays)
  2  1..........1
  3  1.55.......1    STRETCHER_DOCK (staging)
  4  1..........1
  5  1.59..25...1    REFRIG_LOCKER + BOOKSHELF (records)
  6  1..........1
  7  1.41..28...1    BENCH (waiting) + TABLE (admin)
  8  1....SS....1    Spawn
  9  111114111111    DOOR_EXIT

Verb nodes: duty(triage_bed×2, stretcher_dock), errands(refrig_locker), rest(bench)
NPC: 1-2 medics (verb: duty at triage, errands at locker; dispatch override when recovery triggered)
```

#### Template: Morgue / Processing (14×10)

```
     01234567890123
  0  11111111111111    N wall
  1  1.57..57.....1    MORGUE_TABLE × 2 (processing slabs)
  2  1............1
  3  1.59..59.....1    REFRIG_LOCKER × 2 (cold storage)
  4  1............1
  5  1........58..1    INCINERATOR (disposal)
  6  1............1
  7  1.26.........1    BAR_COUNTER (output bench — processed resources)
  8  1......SS....1    Spawn
  9  11111114111111    DOOR_EXIT

Verb nodes: duty(morgue_table×2, incinerator), errands(refrig_locker×2, counter)
NPC: 1 mortician (duty: processing), 1 assistant (errands: transport)
Faction: Foundry — industrial processing aesthetic, anvil-and-grate textures
```

#### Template: Union Hall / Canteen (16×12)

```
     0123456789012345
  0  1111111111111111    N wall
  1  1..47..47......1    SOUP_KITCHEN × 2 (canteen serving)
  2  1..............1
  3  1.41..41..41...1    BENCH × 3 (long tables)
  4  1..............1
  5  1.41..41..41...1    BENCH × 3 (more seating)
  6  1..............1
  7  1..42..........1    NOTICE_BOARD (union notices, faction jobs)
  8  1..............1
  9  1.29...........1    HEARTH (communal warmth)
 10  1......SS......1    Spawn
 11  1111114111111111    DOOR_EXIT

Verb nodes: eat(soup_kitchen×2), social(bench×6), errands(notice_board), rest(hearth)
NPC: 0-1 cook, ambient worker congregation (4-8 NPCs during meal rushes)
Faction: Neutral — all factions use; highest congregation density in the game
```

#### Template: Black Market Chop Room (10×8)

```
     0123456789
  0  1111111111    N wall (or BREAKABLE — hidden entrance)
  1  1.57.....1    MORGUE_TABLE (chop slab)
  2  1........1
  3  1.44.44..1    BARREL × 2 (contraband storage)
  4  1........1
  5  1.26.....1    BAR_COUNTER (illicit trade window)
  6  1....SS..1    Spawn
  7  1111141111    DOOR_EXIT (concealed)

Verb nodes: duty(morgue_table), errands(barrel×2, counter), trade_illicit(counter)
NPC: 1 black market operator (unique archetype: high stealth, no faction, trades stolen corpse materials)
Special: Only active if player has STOLEN corpses. Operator spawns on first stolen corpse delivery.
```

### 17.4 New Tile Summary

Tiles 55-59 (from §14.5) join the economy pipeline:

| ID | Name | Verb | Used In |
|----|------|------|---------|
| 55 | STRETCHER_DOCK | duty (medic staging) | Clinic |
| 56 | TRIAGE_BED | duty (medical processing) | Clinic |
| 57 | MORGUE_TABLE | duty (corpse conversion) | Morgue, Chop Room |
| 58 | INCINERATOR | duty (disposal) + eat (construct heat) | Morgue, Smelter |
| 59 | REFRIG_LOCKER | errands (storage/preservation) | Morgue, Clinic |

**Tiles NOT added** (reuse existing):
- PAY_WINDOW → BAR_COUNTER(26) with `payWindow` tag
- SUPPLY_CRATE_MEDICAL → BARREL(44) with `medical` tag
- NOTICE_BOARD_FACTION → NOTICE_BOARD(42) with `factionId` property
- EVIDENCE_LOCKER → BOOKSHELF(25) with `evidence` tag

This keeps the tile count at 60 (0-59) rather than inflating further. Tagged variants of existing tiles achieve the same verb-node differentiation without new texture commitments.

### 17.5 Dependencies

| Dependency | Blocks | Effort |
|-----------|--------|--------|
| Tile IDs 55-59 in tiles.js | All economy buildings | 30m |
| Biome entries for clinic, morgue, union_hall | Interior rendering | 30m |
| FactionRelations singleton (§15.2) | Medic dispatch faction assignment | 2h |
| CorpseRegistry state expansion (§14.2) | TAGGED/RECOVERED/PROCESSED/STOLEN/DECAYED states | 2h |
| Medic crew NPC archetype | Recovery loop | 2h |
| Black market operator archetype | Illicit economy | 1h |
| Floor 2 boardwalk finger blockout (2.11, 2.12) | Clinic + Records placement | 1h |
| Floor 3 south arm blockout (3.7, 3.8) | Morgue + Union Hall placement | 1h |

---

**Document Version**: 1.3
**Created**: 2026-04-08 | **Updated**: 2026-04-08
**Cross-references**: DOC-83 (VERB_FIELD_NPC_ROADMAP §13-18), ACT2_NARRATIVE_OUTLINE (§4 faction choice, §5 dispatcher arc, §5.4 housing reassignment), INTERACTIVE_OBJECTS_AUDIT (DOC-54), LIVING_INFRASTRUCTURE_BRAINSTORM (§10-11), D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP (§12-13), NPC_FACTION_BOOK_AUDIT (§15-16), enemies.json, corpse-actions.js, corpse-registry.js, npc-system.js
**Status**: Design — ready for blockout implementation

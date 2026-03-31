# Level Blockout Design — DOC-13

> **Version:** 1.0 — March 31, 2026
> **Status:** Phase 1 Complete (blockouts implemented); Phase 2 planned (art pass, NPC wiring)
> **Cross-refs:** TUTORIAL_WORLD_ROADMAP.md (DOC-5), COZY_INTERIORS_DESIGN.md (DOC-10), STREET_CHRONICLES_NARRATIVE_OUTLINE.md (DOC-11), Biome Plan.html (DOC-1)

---

## Table of Contents

1. [World Graph Summary](#1-world-graph-summary)
2. [Building Exterior Archetypes](#2-building-exterior-archetypes)
3. [Critical Path Accentuation Strategy](#3-critical-path-accentuation-strategy)
4. [Modular Interior Templates](#4-modular-interior-templates)
5. [Floor Blockout Specifications](#5-floor-blockout-specifications)
6. [New Texture Requirements](#6-new-texture-requirements)
7. [NPC Behavior and Placement Guidelines](#7-npc-behavior-and-placement-guidelines)
8. [Registration Architecture](#8-registration-architecture)
9. [Remaining Phases](#9-remaining-phases)

---

## 1. World Graph Summary

```
Floor "0"   The Approach     (ext, 20×16)  ← tutorial courtyard
  │
  ▼ DOOR (9,6)
Floor "1"   The Promenade    (ext, 20×16)  ← main town hub
  ├── DOOR (5,2)   → "1.1"  Coral Bazaar       (int, 16×12)
  │                           └── STAIRS_DN → "1.1.N" Coral Cellars (proc-gen)
  ├── DOOR (14,2)  → "1.2"  Driftwood Inn       (int, 20×16) ★ NEW
  ├── DOOR (3,7)   → "1.3"  Cellar Entrance     (int, 16×12) ★ NEW
  │                           └── STAIRS_DN → "1.3.1" Soft Cellar (proc-gen)
  ├── DOOR (17,7)  → "1.6"  Gleaner's Home      (int, 24×20)
  ├── EXIT (9,13)  → "0"    The Approach (back)
  └── GATE (11,13) → "2"    Lantern Row (critical path) ★ NEW
                              │
Floor "2"   Lantern Row      (ext, 32×24) ★ NEW — commercial district
  ├── DOOR (6,3)   → "2.1"  Dispatcher's Office (int, 16×12) ★ NEW
  ├── DOOR (25,3)  → "2.2"  Watchman's Post     (int, 18×14) ★ NEW
  │                           └── STAIRS_DN → "2.2.1" Hero's Wake B1 (proc-gen)
  │                                            └── DN → "2.2.2" Hero's Wake B2
  └── EXIT (15,21) → "1"    The Promenade (back)

Future:
Floor "3"   Frontier Gate    (ext, planned)
  ├── → "3.1"  Armory (int, planned)
  │             └── → "3.1.1"+ Deep Vaults (proc-gen)
  └── EXIT → "2"
```

---

## 2. Building Exterior Archetypes

### Shape Library

Buildings on exterior floors (`floorN`) use standardized shapes formed by WALL (1) tiles encircled by TREE (21) perimeter with SHRUB (22) borders as wayfinding hedgerows.

| Archetype | Shape | Grid Size | Use Cases | Notes |
|-----------|-------|-----------|-----------|-------|
| **Rect-S** | `▬` | 6×2 | Small shop, utility kiosk | Single DOOR on long side |
| **Rect-M** | `▬▬` | 8×3 | Inn entrance, office | Two-tile depth for solid facade |
| **Rect-L** | `▬▬▬` | 10×4 | Large shop, guild hall | Room for multiple DOORs |
| **L-shape** | `┘` | 8×6 | Corner building, hideout | Creates sheltered courtyard |
| **T-shape** | `┬` | 10×4 | Pavilion, market arcade | Central DOOR with wings |
| **U-shape** | `⊔` | 10×5 | Courtyard building, inn | Enclosed outdoor space |
| **Hash** | `#` | 8×8 | Fortified post, dungeon bldg | Inner corridor creates mystery |

### Size Per FloorN

| Exterior Floor | Primary Archetype | Building Count | Scale |
|---|---|---|---|
| Floor "0" (Approach) | Rect-L (single building) | 1 | 10×4 — tutorial facade |
| Floor "1" (Promenade) | Rect-M × 2 + Rect-S × 2 | 4 | 6×2 to 8×3 — cozy town |
| Floor "2" (Lantern Row) | Rect-L × 2 + T-shape × 1 | 3 | 8×3 to 10×4 — commercial |
| Floor "3" (Frontier) | Hash × 1 + L-shape × 1 | 2+ | 8×6 to 8×8 — fortified |

### Building Facade Rules

1. **Wall height 3.5×** — Multi-story facades tower over the 2.5× treeline, preventing sky gaps in the single-pass raycaster
2. **DOOR flush at facade height** — Door tiles share the wall's `tileWallHeight` for seamless archway rendering
3. **PILLAR accents at 1.5×** — Shorter decorative columns frame entrances without blocking sightlines
4. **SHRUB corridors at 0.5×** — Half-height hedges that the player can see over, creating gentle visual guidance without blocking exploration

---

## 3. Critical Path Accentuation Strategy

The critical route from `floorN → floorN` (the main progression path) must be the **loudest** visual destination while keeping all other building entrances accessible.

### Floor 0 → Floor 1 (Tutorial → Town)

- **Strategy:** Single building facade with one prominent DOOR. The hedge-funnel corridor naturally channels the player northward. No competing entrances.
- **Cues:** PILLAR columns flanking the DOOR. BONFIRE at mid-path draws attention but doesn't distract.

### Floor 1 → Floor 2 (Town → Commercial District)

- **Strategy:** South gate wall has two exits — a DOOR_EXIT (back to Floor 0) and a prominent GATE (forward to Floor 2). The gate is placed at (11,13), slightly east of center, creating a natural forward momentum.
- **Cues:**
  - The gate DOOR is visually distinct from the EXIT tile (descending porthole vs ascending)
  - Building entrances (Bazaar, Inn, Cellar) are positioned along the north and west edges, creating a "discover shops, then progress south" flow
  - The bonfire (9,7) sits at the plaza center, serving as a natural gathering point before the gate decision

### Floor 2 → Floor 2.2 → Floor 2.2.1 (Commercial → Dungeon)

- **Strategy:** Lantern Row boulevard uses SHRUB corridors to create a visual funnel toward the south. Two building facades at the north (Dispatcher's Office, Watchman's Post) frame the boulevard. The Watchman's Post (east) is the louder destination — it's the gateway to Hero's Wake.
- **Cues:**
  - Shrub borders (rows 8-10, 13-15) narrow the walking space toward center, creating a visual corridor
  - PILLAR pairs (lantern posts) mark the boulevard rhythm — players follow the lights
  - The BONFIRE at (15,9) sits in the boulevard center, inviting rest before the eastern dungeon entrance
  - Watchman's Post facade is identical in size to Dispatcher's Office, but the Post's lore content (hero warnings, military records) signals importance

### General Principles

1. **Width signals importance** — Critical path corridors are wider (8+ tiles) than side alleys (3-4 tiles)
2. **Pillar rhythm** — Lantern pillar pairs at regular intervals create a "follow the lights" effect
3. **Shrub funneling** — Half-height hedges nudge without blocking; players see buildings over the hedges but walk between them
4. **BONFIRE magnetism** — Rest points sit on the critical path, not in optional branches
5. **Door type distinction** — Advancing DOORs use descending porthole texture; retreating DOORs use ascending porthole texture. Players learn this visual language

---

## 4. Modular Interior Templates

### Template: Inn / Tavern (Floor 1.2 — Driftwood Inn)

```
Layout: 20×16 | 4 rooms | Biome: 'inn'

┌────────────────────┐
│ Hearth │  Taproom   │ Guest  │
│  nook  │  BAR_CTR   │  wing  │
│ HEARTH │  TABLEs    │  BEDs  │
│        │            │  shelf │
├────────┤            ├────────┤
│ [wall] │  corridor  │ [wall] │
│        │  PILLARs   │        │
│        │  entry     │        │
│        │  DOOR_EXIT │        │
└────────────────────┘
```

**Interaction inventory:**
- 4× BAR_COUNTER (26) — drink buffs, 3 taps per visit
- 1× HEARTH (29) — fireplace rest point
- 3× TABLE (28) — dining atmosphere
- 2× BED (27) — guest room rest
- 3× BOOKSHELF (25) — romance novels, dragon lore, tips
- 2× PILLAR (10) — entry hall decoration

### Template: Dungeon Gateway (Floor 1.3 — Cellar Entrance)

```
Layout: 16×12 | 2 rooms | Biome: 'cellar_entry'

┌──────────────────┐
│ shelf  stair_alc  shelf │
│        STAIRS_DN        │
│        [alcove]         │
│                         │
│ PILLAR  BONFIRE  PILLAR │
│        entry            │
│        DOOR_EXIT        │
└──────────────────┘
```

**Interaction inventory:**
- 1× STAIRS_DN (5) — descent to dungeon (1.3.1)
- 1× BONFIRE (18) — pre-dungeon rest
- 2× BOOKSHELF (25) — combat tips, lore
- 2× PILLAR (10) — lantern columns

### Template: Office / Guild (Floor 2.1 — Dispatcher's Office)

```
Layout: 16×12 | 2 rooms | Biome: 'office'

┌──────────────────┐
│ shelf            shelf │
│       dispatch         │
│ PILLAR TABLE×4  PILLAR │
│       [front]          │
│                        │
│ ──── divider ────      │
│ shelf  reception shelf │
│       DOOR_EXIT        │
└──────────────────┘
```

**Interaction inventory:**
- 4× TABLE (28) — dispatch desk (long counter)
- 4× BOOKSHELF (25) — filing shelves (guild charter, work orders, hero report)
- 2× PILLAR (10) — formal columns
- No rest point (deliberate — pressure to find an inn)

### Template: Military Post (Floor 2.2 — Watchman's Post)

```
Layout: 18×14 | 4 rooms | Biome: 'watchpost'

┌───────────────────────┐
│ Armory │ Descent │ Planning │
│ shelf  │ STAIRS  │  TABLE   │
│ CHEST  │   DN    │  shelves │
│ shelf  │         │          │
├────────┤         ├──────────┤
│ [wall] │ BONFIRE │  [wall]  │
│        │ PILLARs │          │
│        │ entry   │          │
│        │ EXIT    │          │
└───────────────────────┘
```

**Interaction inventory:**
- 1× STAIRS_DN (5) — descent to Hero's Wake (2.2.1)
- 1× BONFIRE (18) — pre-dungeon rest
- 1× CHEST (7) — supply cache
- 4× BOOKSHELF (25) — admiralty handbook, hero reports, dragon lore
- 1× TABLE (28) — planning table
- 2× PILLAR (10) — guard columns

---

## 5. Floor Blockout Specifications

### Floor 1.2 — Driftwood Inn

| Property | Value |
|---|---|
| File | `engine/floor-blockout-1-2.js` |
| Grid | 20×16 |
| Depth | 2 (interior) |
| Biome | `inn` |
| Wall texture | `wood_plank` |
| Floor texture | `floor_wood` |
| Ceiling | SOLID |
| Fog model | CLAMP |
| Time freeze | Yes |
| Parent door | Floor 1, DOOR at (14,2) |
| Exit door | (10,15) → Floor 1 |
| Rooms | 4: Hearth nook, Taproom, Guest wing, Entry hall |
| Books | 3: fiction_tides_of_passion, lore_dragon_history_1, tip_inn_bonfire |

### Floor 1.3 — Cellar Entrance

| Property | Value |
|---|---|
| File | `engine/floor-blockout-1-3.js` |
| Grid | 16×12 |
| Depth | 2 (interior) |
| Biome | `cellar_entry` |
| Wall texture | `stone_rough` |
| Floor texture | `floor_dirt` |
| Ceiling | SOLID |
| Fog model | CLAMP |
| Time freeze | Yes |
| Parent door | Floor 1, DOOR at (3,7) |
| Exit door | (7,10) → Floor 1 |
| Stairs down | (7,3) → Floor 1.3.1 (Soft Cellar, proc-gen) |
| Rooms | 2: Staging room, Entry hall |
| Books | 2: tip_combat, lore_dragon_history_2 |

### Floor 2 — Lantern Row

| Property | Value |
|---|---|
| File | `engine/floor-blockout-2.js` |
| Grid | 32×24 |
| Depth | 1 (exterior) |
| Biome | `lantern` |
| Wall texture | `brick_light` |
| Floor texture | `floor_cobble` |
| Ceiling | SKY |
| Fog model | FADE |
| Time freeze | No |
| Parent door | Floor 1, GATE at (11,13) |
| Exit door | (15,21) → Floor 1 |
| Building doors | (6,3) → Floor 2.1, (25,3) → Floor 2.2 |
| Rooms | 2: Main boulevard, South approach |
| Sky preset | `sunset` |

### Floor 2.1 — Dispatcher's Office

| Property | Value |
|---|---|
| File | `engine/floor-blockout-2-1.js` |
| Grid | 16×12 |
| Depth | 2 (interior) |
| Biome | `office` |
| Wall texture | `concrete` |
| Floor texture | `floor_stone` |
| Ceiling | SOLID |
| Fog model | CLAMP |
| Time freeze | Yes |
| Parent door | Floor 2, DOOR at (6,3) |
| Exit door | (7,10) → Floor 2 |
| Rooms | 2: Dispatch room, Reception |
| Books | 4: lore_gleaner_guild_charter, notice_work_order_template, tip_dispatch_protocol, lore_hero_arrival |

### Floor 2.2 — Watchman's Post

| Property | Value |
|---|---|
| File | `engine/floor-blockout-2-2.js` |
| Grid | 18×14 |
| Depth | 2 (interior) |
| Biome | `watchpost` |
| Wall texture | `stone_cathedral` |
| Floor texture | `floor_stone` |
| Ceiling | SOLID |
| Fog model | CLAMP |
| Time freeze | Yes |
| Parent door | Floor 2, DOOR at (25,3) |
| Exit door | (9,12) → Floor 2 |
| Stairs down | (9,2) → Floor 2.2.1 (Hero's Wake B1, proc-gen) |
| Rooms | 4: Armory, Descent hall, Planning room, Entry hall |
| Books | 4: manual_admiralty_handbook, lore_hero_arrival, notice_hero_registration, lore_dragon_history_2 |

---

## 6. New Texture Requirements

### Textures Currently Sufficient (no new art needed)

All blockout floors use **existing procedural textures** from TextureAtlas:

| Texture | Used In | Purpose |
|---|---|---|
| `wood_plank` | Inn walls | Warm tavern planks |
| `wood_dark` | Inn bar/shelves, Office shelves | Dark accent wood |
| `stone_rough` | Cellar Entry walls, Office pillars | Rough stone |
| `stone_cathedral` | Watchpost walls/pillars | Dressed cathedral stone |
| `concrete` | Office walls | Clean institutional stone |
| `brick_light` | Lantern Row facades | Light commercial brick |
| `door_wood` / variants | Inn/Office/Cellar doors | Standard wood doors |
| `door_iron` | Watchpost doors | Heavy iron gate |
| `door_cellar` | Cellar Entry doors/stairs | Cellar trapdoor style |
| `floor_wood` | Inn floors | Wooden boards |
| `floor_stone` | Office/Watchpost floors | Polished stone |
| `floor_dirt` | Cellar Entry floors | Dirt cellar floor |
| `floor_cobble` | Lantern Row floor | Cobblestone walkway |
| `pillar_stone` | Lantern Row pillars | Decorative stone columns |

### Future Texture Wishlist (Phase 2 Art Pass)

| Texture ID | Description | Priority | Used In |
|---|---|---|---|
| `brick_warm` | Amber-tinted brick for lantern-lit facades | Medium | Lantern Row |
| `door_office` | Formal office door with brass handle | Low | Dispatcher's Office |
| `door_iron_barred` | Barred iron gate for military post | Medium | Watchman's Post |
| `floor_carpet` | Woven carpet for inn interior | Low | Driftwood Inn |
| `floor_marble` | Polished marble for formal spaces | Low | Dispatcher's Office |
| `table_iron` | Iron planning table for military | Low | Watchman's Post |
| `weapon_rack` | Wall-mounted weapon display | Medium | Watchman's Post armory |
| `barrel` | Beer barrel / supply cask | Medium | Inn, Cellar Entrance |
| `lantern_post` | Tall lantern pillar texture | High | Lantern Row pillars |
| `signboard` | Hanging shop sign texture | Medium | All exterior building doors |

---

## 7. NPC Behavior and Placement Guidelines

### General Placement Rules

1. **Safe zone guarantee** — Depth 1-2 floors spawn zero enemies. NPCs are friendly or neutral.
2. **One NPC per room minimum** — Each distinct room should have at least one NPC (ambient or interactive) to feel alive.
3. **No patrol crossing doorways** — NPC patrol points must stay within their room's bounds. The 2-point bounce patrol reverses at walls.
4. **Bark radius 3-4 tiles** — NPCs bark when the player enters their radius. Use 3 tiles for interiors, 4 for exteriors.
5. **Step interval 2000-4000ms** — Slower patrols (3000-4000ms) for ambient atmosphere. Faster (2000ms) for guard/military NPCs.

### Per-Floor NPC Roster

#### Floor 1 — The Promenade (exterior)
| NPC | Type | Position | Patrol | Purpose |
|---|---|---|---|---|
| Market Crier | AMBIENT | (9,5) | (7,5)↔(11,5) | Atmospheric barks about shops |
| Town Guide | INTERACTIVE | (9,10) | (8,10)↔(10,10) | Tips about navigation |

#### Floor 1.2 — Driftwood Inn (interior)
| NPC | Type | Position | Patrol | Purpose |
|---|---|---|---|---|
| Bartender | VENDOR | (10,3) | stationary | Drink shop (bar counter) |
| Innkeeper | INTERACTIVE | (3,4) | (2,4)↔(4,4) | Room info, rumor hints |
| Patron | AMBIENT | (9,6) | (8,6)↔(11,6) | Atmospheric barks |

#### Floor 1.3 — Cellar Entrance (interior)
| NPC | Type | Position | Patrol | Purpose |
|---|---|---|---|---|
| Dungeon Guide | INTERACTIVE | (7,5) | (5,5)↔(9,5) | Warns about dungeon dangers |

#### Floor 2 — Lantern Row (exterior)
| NPC | Type | Position | Patrol | Purpose |
|---|---|---|---|---|
| Street Vendor | VENDOR | (15,12) | stationary | Supplies shop |
| Courier | AMBIENT | (15,7) | (10,7)↔(20,7) | Long patrol, atmosphere |
| Watchman | AMBIENT | (25,7) | (23,7)↔(27,7) | Patrols near Watchman's Post |

#### Floor 2.1 — Dispatcher's Office (interior)
| NPC | Type | Position | Patrol | Purpose |
|---|---|---|---|---|
| Dispatcher | DISPATCHER | (7,4) | stationary | Mission briefing, blocks passage |
| Filing Clerk | AMBIENT | (3,2) | (2,2)↔(6,2) | Files documents, atmosphere |

#### Floor 2.2 — Watchman's Post (interior)
| NPC | Type | Position | Patrol | Purpose |
|---|---|---|---|---|
| Shaken Watchman | INTERACTIVE | (9,4) | (8,4)↔(10,4) | Hero warning, dungeon intel |
| Guard | AMBIENT | (9,10) | (7,10)↔(11,10) | Entry hall patrol |

### Bark Pool Assignments

| Floor | Pool Key | Sample Barks |
|---|---|---|
| 1.2 Inn | `inn_patron` | "Another round!", "The hero passed through last week…" |
| 1.3 Cellar | `cellar_guide` | "It's dark down there. Bring a lantern." |
| 2 Lantern | `lantern_vendor` | "Fresh supplies! Get 'em while they last!" |
| 2.1 Office | `office_clerk` | "Form 7B, section 3… no, section 4…" |
| 2.2 Watchpost | `watchpost_guard` | "Something's wrong down there. The hero went in, but…" |

---

## 8. Registration Architecture

### FloorManager.registerFloorBuilder()

External blockout files register hand-authored floor builders via:

```javascript
FloorManager.registerFloorBuilder('1.2', function buildFloor12() {
  return {
    grid: [...],            // 2D array of TILES constants
    rooms: [...],           // Room definitions {x, y, w, h, cx, cy}
    doors: {                // Named door positions
      stairsUp: null,
      stairsDn: { x, y },  // or null
      doorExit: { x, y }
    },
    doorTargets: { 'x,y': 'targetFloorId' },
    gridW: W, gridH: H,
    biome: 'biome_name',
    shops: [],
    books: [{ x, y, bookId }]
  };
});
```

### Load Order

Blockout files load in `index.html` immediately after `floor-manager.js`:

```html
<script src="engine/floor-manager.js"></script>
<!-- Floor blockout files -->
<script src="engine/floor-blockout-1-2.js"></script>
<script src="engine/floor-blockout-1-3.js"></script>
<script src="engine/floor-blockout-2.js"></script>
<script src="engine/floor-blockout-2-1.js"></script>
<script src="engine/floor-blockout-2-2.js"></script>
```

### Priority Chain

1. Cache check (previously visited floor)
2. **Registered builder** (blockout file)
3. Hard-coded builder (floor-manager.js inline)
4. GridGen procedural fallback

---

## 9. Remaining Phases

### Phase 2 — Art Pass (Post-Jam)

- [ ] Commission unique textures per biome (see §6 wishlist)
- [ ] Add signboard textures for building entrances
- [ ] Create lantern pillar texture with glow effect
- [ ] Add barrel/cask furnishing texture for inn and cellar
- [ ] Implement weapon rack display for watchpost

### Phase 3 — NPC Wiring

- [ ] Register NPC definitions per floor via `NpcSystem.register()`
- [ ] Create bark pools for new biomes (inn_patron, cellar_guide, etc.)
- [ ] Add Dispatcher dialogue tree (mission briefing flow)
- [ ] Add Shaken Watchman dialogue tree (hero warning)
- [ ] Wire Bartender as VENDOR with drink menu

### Phase 4 — Floor Expansion

- [ ] Expand Floor 1 (The Promenade) from 20×16 to 32×24
- [ ] Add more optional buildings to Floor 1 (guild hall, mechanic, etc.)
- [ ] Block out Floor 3 (Frontier Gate) — 32×24 exterior
- [ ] Block out Floor 3.1 (Armory) — interior
- [ ] Block out Floor 3.1.1+ (Deep Vaults) — dungeon biome progression

### Phase 5 — Polish

- [ ] Tune SHRUB corridor widths for optimal player guidance
- [ ] Add COLLECTIBLE pickups along critical path (breadcrumb trail)
- [ ] Place CORPSE tiles in dungeon entry areas (hero's mess foreshadowing)
- [ ] Add environmental storytelling via furniture placement
- [ ] Tune fog distances and colors per biome for mood

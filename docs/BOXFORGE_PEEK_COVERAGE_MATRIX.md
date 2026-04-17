# BoxForge Peek Coverage Matrix (DOC-112)

**Status**: planning ¦ **Owner**: BoxForge pipeline ¦ **Generated**: 2026-04-17
**Feeds**: `BOXFORGE_AGENT_ROADMAP.md` Phase 5 — Peek-primitive stamps

This matrix is the single inventory of every peek the game needs, everywhere it shows up, and which BoxForge template slot each one maps to. It consolidates `INTERACTIVE_OBJECTS_AUDIT.md`, `MINIGAME_ROADMAP.md` / `MINIGAME_TILES.md`, `tools/tile-schema.json` (97 tiles), and the currently-wired peek modules in `engine/*-peek.js`.

The matrix exists so the BoxForge subagent can answer, for any tile or interaction: (a) is there a peek today? (b) if not, which stamp do I start from? (c) what shape does the final sidecar want to land on?

## 1. Template primitives (Phase 5 stamp sources)

Five of the 15 shipped sidecars are *primitives* — not wired to any tile, held as building blocks for Phase 5 stamps. These are NOT orphans; they are the stamp roster.

| Primitive | Shape | Derivation family | `bf apply-stamp` slot |
|---|---|---|---|
| `crate` | Box + hinged lid + interior panes | Any container with a lid | `stamp-box-lidded` |
| `torch` | Vertical pane stack w/ flame glow | Any light fixture or phase-animated vertical | `stamp-vertical-fixture` |
| `torch-box` | Box + top-mounted flame pane | Brazier, brazier-in-crate, anvil-with-coals | `stamp-braizer` |
| `torch-plus-orb` | Vertical + floating orb | Conduit, shrine-with-offering, charging-cradle | `stamp-fixture-plus-orb` |
| `pyramid` | Conic / tetrahedral with glow | Shrines, fungal mounds, altars, waypoints | `stamp-pyramid-shrine` |
| `orb` | Floating sphere | Orbs, crystal balls, floating collectibles | `stamp-orb-primitive` |
| `splash-cube` | Generic cube + splash phase | Placeholder / new tile scaffold | `stamp-splash-primitive` |

Plus the wired template sidecars that can *also* serve as stamps:

| Primitive | Derived-from | Derivation family | `bf apply-stamp` slot |
|---|---|---|---|
| `chest` | crate family | Treasure chests, coffins, trunks, sarcophagi, reliquaries | `stamp-chest` |
| `bookshelf` | vertical stack | Bookshelves, weapon racks, shelving units | `stamp-bookshelf` |
| `single-door` / `double-doors` / `locked-door` / `boss-door-plus-orb` | door family | All door variants | `stamp-door-*` |
| `corpse` | flat + sprite | Bodies on floor, triage beds with occupant | `stamp-flat-sprite` |
| `torch-peek` | torch + context | Context-gated vertical fixtures | `stamp-context-fixture` |

Total stamp roster: **12** (7 primitive + 5 wired archetypes).

## 2. Wired coverage today

| Peek module | Tiles it handles | Source sidecar | Type |
|---|---|---|---|
| `door-peek.js` | DOOR (2), DOOR_BACK (3), DOOR_EXIT (4), STAIRS_DN (5), STAIRS_UP (6), BOSS_DOOR (14) | single-door / double-doors / boss-door-plus-orb | action |
| `arch-peek.js` | ARCH_DOORWAY (71) | (inline, no sidecar yet) | micro |
| `locked-door-peek.js` | LOCKED_DOOR (24) | locked-door | action |
| `crate-peek.js` | BREAKABLE (11) | crate | full |
| `chest-peek.js` | CHEST (7) | chest | full |
| `corpse-peek.js` | CORPSE (19) | corpse | full |
| `torch-peek.js` | TORCH_LIT (30), TORCH_UNLIT (31) | torch-peek | context-gated |
| `merchant-peek.js` | SHOP (12) | *(no sidecar)* | full |
| `puzzle-peek.js` | PUZZLE (23) | *(no sidecar)* | action |
| `bookshelf-peek.js` | BOOKSHELF (25), TERMINAL (36) | bookshelf | full (+ CRT mode) |
| `bar-counter-peek.js` | BAR_COUNTER (26) | *(no sidecar)* | full |
| `bed-peek.js` | BED (27) | *(no sidecar)* | context-gated |
| `mailbox-peek.js` | MAILBOX (37) | *(no sidecar)* | full |
| `hose-peek.js` | DUMP_TRUCK (38) hose state | *(no sidecar)* | context-gated |
| `monologue-peek.js` | NPC dialogue lines | *(no sidecar)* | face-js |

Coverage hole to close while we're here: six wired peeks (`merchant`, `puzzle`, `bar-counter`, `bed`, `mailbox`, `hose`, plus `arch`) exist as engine modules but have no canonical sidecar. They should be ingested into `tools/templates/peeks/` so Phase 5 can reason about them as templates. This is deferred to Phase 3b (legacy CSS decoder).

## 3. Gap inventory — tiles that need a peek

Grouped by derivation family. Each row tells the agent exactly where to start.

### 3.1 Furnishing & hearth (furnish category)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| TABLE | 28 | `stamp-flat-sprite` | micro | cozy-quip toast on face; no menu |
| HEARTH | 29 | `stamp-braizer` | context-gated | phase = lit/cold; rest action when lit |

### 3.2 Infrastructure minigame stations (infra category)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| WELL | 40 | `stamp-vertical-fixture` | action | crank animation; pumps bucket |
| BENCH | 41 | `stamp-flat-sprite` | context-gated | nap action when tired |
| NOTICE_BOARD | 42 | `stamp-bookshelf` (flat variant) | action | arrangement puzzle entry |
| ANVIL | 43 | `stamp-braizer` | action | hammer/coal glow; forge entry |
| BARREL | 44 | `stamp-chest` (no lid / stave texture) | action | pour / tap sequence |
| CHARGING_CRADLE | 45 | `stamp-fixture-plus-orb` | action | calibration dial |
| SWITCHBOARD | 46 | `stamp-bookshelf` (upright panel variant) | full | routing-puzzle entry |
| SOUP_KITCHEN | 47 | `stamp-braizer` | action | ladle/pot simmer intro |
| COT | 48 | `stamp-flat-sprite` | context-gated | nap when tired |

### 3.3 Creature spawners (creature category)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| ROOST | 49 | `stamp-vertical-fixture` | context-gated | shows nest activity / scarecrow toggle |
| NEST | 50 | `stamp-flat-sprite` | action | sweep cleanup clicky |
| DEN | 51 | `stamp-box-lidded` (interior-cavity variant) | context-gated | growl state if occupied |
| FUNGAL_PATCH | 52 | `stamp-pyramid-shrine` | action | harvest-with-warning; tension bar |
| ENERGY_CONDUIT | 53 | `stamp-fixture-plus-orb` | context-gated | arcing/pulsing by charge |
| TERRITORIAL_MARK | 54 | `stamp-splash-primitive` | micro | paw-print / faction-sigil hint |

### 3.4 Economy / medical (economy category — dungeon scavenge ops)

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| STRETCHER_DOCK | 55 | `stamp-flat-sprite` | action | dock stretcher, unload bodies |
| TRIAGE_BED | 56 | `stamp-flat-sprite` | context-gated | occupied / empty |
| MORGUE_TABLE | 57 | `stamp-flat-sprite` | action | deposit body for report |
| INCINERATOR | 58 | `stamp-braizer` | action | burn sequence menu |
| REFRIG_LOCKER | 59 | `stamp-box-lidded` | action | cold-storage menu |

### 3.5 Light fixtures already partly covered

| Tile | ID | Start from stamp | Peek type | Notes |
|---|---|---|---|---|
| BONFIRE | 18 | `stamp-braizer` | context-gated | fire phase state; rest action; share torch behaviour |
| CITY_BONFIRE | 69 | `stamp-braizer` | context-gated | town-square variant of bonfire |

### 3.6 Trap family — NEW TILES + NEW PEEKS (per user request)

The schema currently ships only `TRAP (8)` as a generic placeholder plus instant-hazard tiles (`FIRE 15`, `SPIKES 16`, `POISON 17`) that need NO peek (no approach moment — the hazard fires on step). Gleaner's cleanup scope needs the *mechanism-before-fire* tiles, which do not exist in the schema yet.

Proposed new tiles + peeks. Existing max ID is 96 (PORTHOLE_OCEAN), so the trap family starts at 97:

| New tile | Proposed ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| TRAP_PRESSURE_PLATE | 97 | `stamp-flat-sprite` | action | disarm / pry plate; returns TRAP_DISARMED |
| TRAP_DART_LAUNCHER | 98 | `stamp-vertical-fixture` (wall-mount variant) | action | de-cock / remove dart; show aim line |
| TRAP_TRIPWIRE | 99 | `stamp-flat-sprite` (thin-strip variant) | micro | cut / step-over hint; reset mechanism |
| TRAP_SPIKE_PIT | 100 | `stamp-box-lidded` (open-pit interior variant) | action | board-over / retract spikes |
| TRAP_TELEPORT_DISC | 101 | `stamp-pyramid-shrine` (flat-disc variant) | context-gated | destination preview; deactivate rune |
| TRAP_TRAPDOOR_RIG | — | reuse TRAPDOOR_DN (75) | action | re-bolt trapdoor; Gleaner reset |
| COBWEB | 102 | `stamp-vertical-fixture` (translucent strand variant) | action | sweep + inspect (may drop harvest) |

All seven live under family **trap / hazard-mechanism**. Gleaner's cleanup narrative reads "re-arm for the next delve" rather than "disarm" — important for the UX tone in the peek copy.

### 3.7 Architectural / freeform that eventually want peeks

| Tile | ID | Start from stamp | Peek type | Behavior hook |
|---|---|---|---|---|
| TRAPDOOR_DN / _UP | 75 / 76 | `stamp-box-lidded` (floor-hatch variant) | action | open/close + descend prompt |
| WINDOW_* family | 72, 73, 77-83 | `stamp-flat-sprite` (lit variant) | micro | eavesdrop-on-NPC gag |
| PORTHOLE | 72 | `stamp-flat-sprite` (circular variant) | micro | sea-view vignette |
| ARCH_DOORWAY | 71 | `stamp-door-*` (open-arch variant) | micro | already has `arch-peek.js`; ingest to sidecar (Phase 3b) |

## 4. Minigame bookend coverage

Every minigame from `MINIGAME_ROADMAP.md` needs a peek as its "world-side bookend" — the approach moment before the player commits to the minigame screen. The minigame's closing peek (result card) typically reuses the same sidecar with a phase swap.

| Minigame | Opener tile | Peek family | Status |
|---|---|---|---|
| Lockpick (card suit test) | LOCKED_DOOR (24) | action | ✅ `locked-door` |
| Chest-loot | CHEST (7) | full | ✅ `chest` |
| Boss-seal orb | BOSS_DOOR (14) | action | ✅ `boss-door-plus-orb` |
| Bar counter order | BAR_COUNTER (26) | full | ✅ wired, needs sidecar (3b) |
| Well crank | WELL (40) | action | ❌ `stamp-vertical-fixture` |
| Soup ladle | SOUP_KITCHEN (47) | action | ❌ `stamp-braizer` |
| Anvil forge | ANVIL (43) | action | ❌ `stamp-braizer` |
| Barrel pour | BARREL (44) | action | ❌ `stamp-chest` (no-lid variant) |
| Fungal harvest | FUNGAL_PATCH (52) | action | ❌ `stamp-pyramid-shrine` |
| Cradle calibration | CHARGING_CRADLE (45) | action | ❌ `stamp-fixture-plus-orb` |
| Switchboard routing | SWITCHBOARD (46) | full | ❌ `stamp-bookshelf` |
| Notice arrange | NOTICE_BOARD (42) | action | ❌ `stamp-bookshelf` |
| Nest sweep | NEST (50) | action | ❌ `stamp-flat-sprite` |
| Trap reset clicky | every TRAP_* (3.6) | action | ❌ new family |
| Incinerator burn | INCINERATOR (58) | action | ❌ `stamp-braizer` |
| Morgue report | MORGUE_TABLE (57) | action | ❌ `stamp-flat-sprite` |

**10 minigame peeks wired today. 16+ still needed.**

## 5. Work queue for Phase 5 (stamp authoring order)

Prioritised so each slice unlocks more minigames per unit of stamp work:

1. **`stamp-braizer`** (from torch-box) — unlocks HEARTH, BONFIRE, CITY_BONFIRE, ANVIL, SOUP_KITCHEN, INCINERATOR (6 peeks).
2. **`stamp-flat-sprite`** (from corpse, flat horizontal + sprite overlay) — unlocks TABLE, BENCH, COT, NEST, STRETCHER_DOCK, TRIAGE_BED, MORGUE_TABLE, TRAP_PRESSURE_PLATE, TRAP_TRIPWIRE (9 peeks).
3. **`stamp-fixture-plus-orb`** (from torch-plus-orb) — unlocks CHARGING_CRADLE, ENERGY_CONDUIT (2 peeks).
4. **`stamp-vertical-fixture`** (from torch) — unlocks WELL, ROOST, TRAP_DART_LAUNCHER, COBWEB (4 peeks).
5. **`stamp-bookshelf`** (from bookshelf, upright-panel variant) — unlocks SWITCHBOARD, NOTICE_BOARD (2 peeks).
6. **`stamp-box-lidded`** (from crate, generalised) — unlocks BARREL, DEN, REFRIG_LOCKER, TRAP_SPIKE_PIT, TRAP_TRAPDOOR_RIG (5 peeks).
7. **`stamp-pyramid-shrine`** (from pyramid) — unlocks FUNGAL_PATCH, TRAP_TELEPORT_DISC (2 peeks).
8. **`stamp-splash-primitive`** (from splash-cube) — TERRITORIAL_MARK + scaffold for unplanned future tiles.

Eight stamps deliver peeks for **30 tiles**. The remaining coverage is sidecar-only (no new primitive needed): ingesting the six wired-but-sidecarless peeks (`merchant`, `puzzle`, `bar-counter`, `bed`, `mailbox`, `hose`, `arch`) into `tools/templates/peeks/` via Phase 3b CSS decode.

## 6. Schema additions required

Phase 5 cannot ship TRAP family peeks without first widening `tools/tile-schema.json`. Current max tile ID is 96 (PORTHOLE_OCEAN), so the new family slots into IDs 97-102:

- 97 TRAP_PRESSURE_PLATE (hazard)
- 98 TRAP_DART_LAUNCHER (hazard)
- 99 TRAP_TRIPWIRE (hazard)
- 100 TRAP_SPIKE_PIT (hazard)
- 101 TRAP_TELEPORT_DISC (hazard)
- 102 COBWEB (creature)

These lift the TRAP family from a single generic tile to a proper spread, matching how EyesOnly handles mechanism-before-fire. Schema extension is a prerequisite — belongs in an early Phase 5 slice labelled `5.0 schema widen`. After extension, tile count goes from 97 → 103 and `tools/extract-floors.js` must be re-run to regenerate `tools/tile-schema.json`.

## 7. Maintenance

- When a new tile is added to `tile-schema.json`, append a row to §3 of this doc.
- When a stamp is shipped in Phase 5, tick the corresponding row in §4 and update `BOXFORGE_AGENT_ROADMAP.md` §Phase 5.
- When a peek is ingested to `tools/templates/peeks/`, remove the "*(no sidecar)*" tag from §2.

## 8. Cross-references

- `docs/BOXFORGE_AGENT_ROADMAP.md` — Phase 5 stamps and Phase 3b legacy ingest
- `docs/INTERACTIVE_OBJECTS_AUDIT.md` — per-tile behaviour and status badges
- `docs/MINIGAME_ROADMAP.md` + `docs/MINIGAME_TILES.md` — minigame bookends
- `tools/tile-schema.json` — authoritative 97-tile list
- `tools/templates/peeks/` — canonical sidecars (15 today)

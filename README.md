# Dungeon Gleaner

A first-person dungeon crawler built for [DC Jam 2026](https://itch.io/jam/dcjam2026) (March 27 – April 5, 2026).

You are a **Nez-Ha** — a dungeon janitor working for a Necromancer on the wrong side of a fantasy economy. Legendary Heroes storm through dungeons, slaughter monsters, smash everything, loot the place, and vanish. You arrive after to clean up the mess — scrubbing walls, restocking crates, re-arming traps, reassembling dead monsters, and scrambling puzzles back to their unsolved state. All so the Necromancer can reset the dungeon and charge the next batch of adventurers for the privilege of "discovering" it.

Think **Power Wash Simulator** meets **Dungeon Keeper** from a minimum-wage perspective. The Skyrim dungeon keeper who refills the ancient crates with fresh cabbages and flowers? That's you.

The world is a small coastal **boardwalk town** — Miami Vice meets a fantasy fishing village. Chrome railings on marble promenades. Sunset gradients on stone walls. Neon sigils over old timber shop fronts. The aesthetic is **retrofuturistic fantasy**: a civilization that discovered magic before technology, and their architecture shows it.

## Jam themes (all four)

- **Dragons** — Ancient protectors being hunted by the Hero. The conspiracy at the core of the story.
- **Retrofuturism** — The entire visual identity. Vaporwave sunsets, chrome-and-marble architecture, synthwave color palettes.
- **Rock-Paper-Scissors** — Combat element triangle: FLAME > FROST > STORM > FLAME. Every card and enemy has an element.
- **Cleaning Up the Hero's Mess** — The entire game. Three loops: scrub dungeon tiles grid-by-grid, restock looted crates for coin rewards, and complete work orders to reset floors for the next Hero cycle. Combat cards are earned through labor, not combat — your deck is built crate by crate.

## Core gameplay loops

**The Cleaning Loop** — Grid-by-grid tile scrubbing. Every wall and floor has a condition (dirty/damaged/clean). Scrub tiles for coin rewards. Progressive cleaning tools from Rag to Pressure Washer. Magic Remote pointer for aimed cleaning.

**The Restocking Loop** — Crates have 2–5 item slots with color-coded frames hinting at the ideal item. Fill slots with dungeon junk (1 coin each) or shop-bought matching items (2–3 coins). Sealed crates pop bonus coins + a chance at combat cards, up to legendary tier.

**The Dungeon Reset Loop** — Work orders from the Gleaner's Guild: reach a readiness threshold per floor by cleaning tiles, restocking crates, re-arming traps, scrambling puzzles, reassembling monsters, and restoring secrets. Heroes arrive on patrol cycles to undo your work.

**The Shop Round-Trip** — Enter dungeon with empty bags → earn coins through labor → exit to surface shops → buy matching restock ingredients → re-enter for better yields. Kingdom Two Crowns–style coin economy.

## Running it

Open `index.html` in a browser. That's it.

WASD moves, Q/E turns, F interacts, period/comma for stairs, M toggles the minimap, 1-5 plays cards during combat.

## Architecture

50 vanilla JavaScript modules loaded via `<script>` tags in dependency order. Every module is a self-executing IIFE that attaches to a single global variable. No imports, no exports, no bundler — the browser is the runtime.

**Layer 0 — Foundations** (zero deps): `SeededRNG`, `TILES`, `i18n`, `AudioSystem`

**Layer 1 — Core systems**: `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardSystem`, `LootTables`, `WorldItems`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract`, `TextureAtlas`, `SessionStats`, `Salvage`, `BreakableSpawner`

**Layer 2 — Rendering + UI**: `UISprites`, `DoorAnimator`, `Skybox`, `Raycaster`, `Minimap`, `HUD`, `DialogBox`, `Toast`, `TransitionFX`, `CardFan`, `ScreenManager`, `MenuBox`, `SplashScreen`, `GameLoop`

**Layer 3 — Game modules**: `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `InteractPrompt`, `CombatBridge`, `HazardSystem`, `Shop`, `MenuFaces`, `TitleScreen`, `GameOverScreen`, `VictoryScreen`

**Layer 4 — Orchestrator**: `Game` (thin wiring shell)

**Layer 5 — Data**: `data/strings/en.js` (i18n string tables)

## World structure

The game uses a three-tier floor ID convention:

- `"N"` (depth 1) — outdoor districts (Promenade, Lantern Gardens, Frontier Gate)
- `"N.N"` (depth 2) — building interiors (Coral Bazaar, Gleaner's Guild, Driftwood Inn, etc.)
- `"N.N.N"` (depth 3) — dungeons beneath buildings (the Hero's mess, proc-gen)

Each depth has its own spatial contract governing wall height, fog model, render distance, ceiling type, and door transition sound sequences.

## Source lineage

| System | Source | Notes |
|---|---|---|
| Movement controller | dcexjam2025 `crawler_controller.ts` | Queued lerp, dual-queue, easeInOut |
| Door contracts | EyesOnly `door-contract-system.js` | Near-verbatim spawn protection |
| Door SFX grammar | EyesOnly `door-contract-audio.js` | Transition table by depth pairs |
| Enemy AI | EyesOnly `enemy-ai-system.js` | Patrol, awareness, chase |
| Combat engine | EyesOnly `str-combat-engine.js` | Simultaneous resolution |
| Card system | EyesOnly `card-system.js` | Hand management, cost validation |
| Synergy engine | EyesOnly `synergy-engine.js` | Tag-based combos |
| Floor generation | EyesOnly `floor-gen-core.js` | BSP rooms, A* corridors |
| Spatial contracts | Original | Three-tier fog/rendering rules |
| Raycaster | Original | DDA casting, textures, door animation |
| Skybox | Original | Procedural clouds, mountains, water |
| Dialog box | Original | Dual-mode canvas dialog system |
| Texture atlas | Original | Procedural 64×64 wall textures |

## Jam scope

3 exterior districts, 5–6 building interiors, 3 dungeons (one per district). Core loop: cleaning, crate restocking, and dungeon reset maintenance. Heroes patrol as environmental hazards. Late-game Hero boss encounters using combat decks earned through labor. Post-jam: Act 2 (dragon alliance), Act 3 (world map), LG webOS TV port.

## Design document

`docs/Biome Plan.html` is the living design doc — theme, palettes, enemy populations, spatial contracts, quest items, and module wiring are all defined there. Open it in a browser.

## Project structure

```
DCgamejam2026/
├── index.html          Single entry point
├── README.md           This file
├── CLAUDE.md           AI contributor conventions
├── docs/
│   ├── Biome Plan.html Living design doc (v4 — Dungeon Gleaner)
│   └── *.md            Subsystem roadmaps
├── engine/             50 IIFE modules
├── data/strings/       i18n string tables
└── assets/ui/          UI sprite images
```

## License

Jam entry. Engine code derived from EyesOnly (private) and dcexjam2025 (reference only). Not open source at this time.

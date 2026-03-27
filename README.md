# Dungeon Gleaner

A first-person dungeon crawler built for [DC Jam 2026](https://itch.io/jam/dcjam2026) (March 27 – April 5, 2026).

You are a **Nez-Ha** — a scavenger-cleaner who follows in the devastating wake of a legendary Hero. He storms through dungeons, slays monsters, smashes everything in sight, and vanishes. You arrive after to pick through the wreckage, loot what's left, and deal with the twitching, gurgling remnants he didn't finish off.

The world is a small coastal **boardwalk town** — Miami Vice meets a fantasy fishing village. Chrome railings on marble promenades. Sunset gradients on stone walls. Neon sigils over old timber shop fronts. The aesthetic is **retrofuturistic fantasy**: a civilization that discovered magic before technology, and their architecture shows it.

## Jam themes (all four)

- **Dragons** — Ancient protectors being hunted by the Hero. The conspiracy at the core of the story.
- **Retrofuturism** — The entire visual identity. Vaporwave sunsets, chrome-and-marble architecture, synthwave color palettes.
- **Rock-Paper-Scissors** — Combat element triangle: FLAME > FROST > STORM > FLAME. Every card and enemy has an element.
- **Cleaning Up the Hero's Mess** — The gameplay loop. Lootable corpses, half-dead remnants, environmental destruction.

## Running it

Open `index.html` in a browser. That's it.

WASD moves, Q/E turns, F interacts, period/comma for stairs, M toggles the minimap, 1-5 plays cards during combat.

## Architecture

47 vanilla JavaScript modules loaded via `<script>` tags in dependency order. Every module is a self-executing IIFE that attaches to a single global variable. No imports, no exports, no bundler — the browser is the runtime.

**Layer 0 — Foundations** (zero deps): `SeededRNG`, `TILES`, `i18n`, `AudioSystem`

**Layer 1 — Core systems**: `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardSystem`, `LootTables`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract`, `TextureAtlas`, `SessionStats`, `Salvage`

**Layer 2 — Rendering + UI**: `UISprites`, `DoorAnimator`, `Skybox`, `Raycaster`, `Minimap`, `HUD`, `DialogBox`, `Toast`, `TransitionFX`, `CardFan`, `ScreenManager`, `MenuBox`, `SplashScreen`, `GameLoop`

**Layer 3 — Game modules**: `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `InteractPrompt`, `CombatBridge`, `HazardSystem`, `MenuFaces`, `TitleScreen`, `GameOverScreen`, `VictoryScreen`

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

3 exterior districts, 5–6 building interiors, 3 dungeons (one per district), 1 boss encounter (the Hero). Post-jam: Act 2 (dragon alliance), Act 3 (world map), LG webOS TV port.

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
├── engine/             46 IIFE modules
├── data/strings/       i18n string tables
└── assets/ui/          UI sprite images
```

## License

Jam entry. Engine code derived from EyesOnly (private) and dcexjam2025 (reference only). Not open source at this time.

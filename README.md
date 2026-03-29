# Dungeon Gleaner

A first-person dungeon crawler built for [DC Jam 2026](https://itch.io/jam/dcjam2026) (March 27 – April 5, 2026).

You are **Operative Gleaner** — a licensed dungeon scavenger dispatched to a small coastal boardwalk town under orders from a shadowy agency. Your cover: clean up after **The Seeker**, a field operative who storms through dungeons, wipes out anything that moves, and vanishes without a debrief. Scrub the walls, restock the crates, re-arm the traps, reset the floors for the next cycle.

But the deeper you go, the stranger the evidence. The Seeker isn't hunting monsters — they're hunting *dragons*. Ancient protectors being systematically eliminated. Every dungeon floor hides another piece of a conspiracy running from the crooked Gleaner's Guild all the way up to the factions controlling the town: an old detective agency with a centuries-long vendetta, a hidden religious order protecting a secret they've kept for four hundred years, and a foreign intelligence operative who discovered the truth before you did.

Before deploying, you choose your **callsign** and **operative class** — the combination that defines your stat bonuses and playstyle for the run.

The world is a small coastal **boardwalk town** — a retrofuturistic fantasy port where a civilization that discovered magic before electricity built chrome railings onto marble promenades and hung neon sigils over old timber shop fronts. Vaporwave sunsets on stone walls. The aesthetic is **retrofuturistic fantasy**: ancient and futuristic at the same time.

## Jam themes (all four)

- **Dragons** — Ancient protectors being systematically hunted by The Seeker. The conspiracy at the core of the story — revealed floor by floor through environmental evidence, NPC dialogue, and faction interference.
- **Retrofuturism** — The entire visual identity. Vaporwave sunsets, chrome-and-marble architecture, synthwave color palettes. A world that feels simultaneously ancient and futuristic.
- **Rock-Paper-Scissors** — Combat suit triangle using playing card suits: ♣ Clubs (Wild/Force) > ♦ Diamonds (Crystal/Precision) > ♠ Spades (Earth/Steel) > ♣ Clubs (cycle). ♥ Hearts are neutral rule-breakers. Every card and enemy carries a suit alignment.
- **Cleaning Up the Hero's Mess** — The entire game. Three loops: scrub dungeon tiles grid-by-grid, restock looted crates for coin rewards, and complete work orders to reset floors for the next Seeker cycle. Combat cards are earned through labor, not combat — your deck is built crate by crate.

## Core gameplay loops

**The Cleaning Loop** — Grid-by-grid tile scrubbing. Every wall and floor has a condition (dirty/damaged/clean). Scrub tiles for coin rewards. Progressive cleaning tools from Rag to Pressure Washer. Magic Remote pointer for aimed cleaning.

**The Restocking Loop** — Crates have 2–5 item slots with color-coded frames hinting at the ideal item. Fill slots with dungeon junk (1 coin each) or shop-bought matching items (2–3 coins). Sealed crates pop bonus coins + a chance at combat cards, up to legendary tier.

**The Dungeon Reset Loop** — Work orders from the Gleaner's Guild: reach a readiness threshold per floor by cleaning tiles, restocking crates, re-arming traps, scrambling puzzles, reassembling fallen creatures, and restoring secrets. The Seeker arrives on patrol cycles to undo your work.

**The Shop Round-Trip** — Enter dungeon with empty bags → earn coins through labor → exit to surface shops → buy matching restock ingredients → re-enter for better yields. Coin-drip economy built on labor, not loot.

## Running it

Open `index.html` in a browser. That's it.

A **character creation flow** runs at startup: pick a callsign (operative codename) and a class (Blade, Ranger, Shadow, Sentinel, Seer, or Wildcard). WASD moves, Q/E turns, F interacts, period/comma for stairs, M toggles the minimap, 1-5 plays cards during combat.

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

3 exterior districts, 5–6 building interiors, 3 dungeons (one per district). Core loop: cleaning, crate restocking, and dungeon reset maintenance. The Seeker patrols as an environmental hazard. Late-game Seeker confrontations using combat decks earned through labor. Faction NPCs (BPRD handler, Gleaner's Guild, rival operatives) gate the conspiracy reveals. Post-jam: Act 2 (dragon alliance), Act 3 (world map), LG webOS TV port.

## Design document

`docs/Biome Plan.html` is the living design doc — theme, palettes, enemy populations, spatial contracts, quest items, and module wiring are all defined there. Open it in a browser.

## Project structure

```
DCgamejam2026/
├── index.html          Single entry point
├── README.md           This file
├── CLAUDE.md           AI contributor conventions
├── docs/
│   ├── Biome Plan.html Living design doc (v5 — Dungeon Gleaner)
│   └── *.md            Subsystem roadmaps
├── engine/             50 IIFE modules
├── data/strings/       i18n string tables
└── assets/ui/          UI sprite images
```

## License

Jam entry. Engine code derived from EyesOnly (private) and dcexjam2025 (reference only). Not open source at this time.

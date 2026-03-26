# DC Jam 2026 — First-Person Dungeon Crawler

A grid-based first-person dungeon crawler built for [DC Jam 2026](https://itch.io/jam/dcjam2026) (March 27 – April 5, 2026), with a post-jam target of publishing to the LG Content Store as a Magic Remote-driven webOS TV app.

## What this is

Pure HTML5/JavaScript. Zero build tools, zero frameworks, zero npm. Opens in a browser, runs on a TV. The engine is extracted from two prior codebases — EyesOnly (a ~155k-line production roguelike) and dcexjam2025 (a GLOV.js dungeon crawler by the Tower of Hats developer) — plus original systems written from scratch where neither source had what we needed.

The game: explore procedurally generated dungeon floors in first person. Enemies patrol with a stealth-awareness system. Combat is simultaneous-turn card-based, with synergy chains between card types. Descend deeper, get stronger cards, fight a boss. Classic dungeon crawl with a card combat twist.

## Running it

Open `index.html` in a browser. That's it.

WASD moves, Q/E turns, F interacts, period/comma for stairs, M toggles the minimap, 1-5 plays cards during combat.

## Architecture

27 vanilla JavaScript modules loaded via `<script>` tags in dependency order. Every module is a self-executing IIFE that attaches to a single global variable. No imports, no exports, no bundler — the browser is the runtime.

The load order is layered:

**Layer 0 — Foundations** (zero dependencies): `SeededRNG`, `TILES`, `AudioSystem`

**Layer 1 — Core systems**: `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardSystem`, `LootTables`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract`

**Layer 2 — Rendering**: `Raycaster`, `Minimap`, `HUD`, `GameLoop`

**Layer 3 — Game modules**: `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `CombatBridge`

**Layer 4 — Orchestrator**: `Game` (thin wiring shell — init, tick, render, callbacks)

## Source lineage

| System | Source | Extraction |
|---|---|---|
| Movement controller | dcexjam2025 `crawler_controller.ts` | Queued lerp, dual-queue, easeInOut, wall bump feedback |
| Door contracts | EyesOnly `door-contract-system.js` | Near-verbatim. Spawn protection, expanding ring search |
| Door SFX grammar | EyesOnly `door-contract-audio.js` | Transition table keyed by floor depth pairs |
| Enemy AI | EyesOnly `enemy-ai-system.js` | Patrol patterns, awareness states, sight cones |
| Combat engine | EyesOnly `str-combat-engine.js` | STR-based simultaneous resolution, advantage calc |
| Card system | EyesOnly `card-system.js` | Quality rolls, hand management, cost validation |
| Synergy engine | EyesOnly `synergy-engine.js` | Tag-based combos, cascade resolver |
| Floor generation | EyesOnly `floor-gen-core.js` | BSP room placement, A* corridors |
| Spatial contracts | Original | Three-tier floor hierarchy with per-depth fog/rendering rules |
| Raycaster | Original | DDA wall casting, fog models, parallax layers |
| Minimap | Original + dcexjam2025 patterns | Floor cache stack, fog-of-war, breadcrumb depth indicator |
| Pathfinding | dcexjam2025 `pathfind.ts` | BFS with wall/fog awareness |

## Floor hierarchy

The game uses EyesOnly's three-tier floor ID convention:

- `floorsN` (depth 1) — exterior/overworld
- `floorsN.N` (depth 2) — interior contrived spaces (buildings, taverns)
- `floorsN.N.N` (depth 3) — nested proc-gen dungeons

Each depth has its own spatial contract governing wall height, fog model, render distance, and ceiling type. Transitions between depths trigger different door sound sequences from `DoorContractAudio`.

## Jam scope vs post-jam

**Jam (by April 5):** 5-floor vertical slice. Proc-gen dungeon, card combat, synergies, enemy AI, audio, and a boss fight. Playable in browser via itch.io.

**Post-jam:** LG webOS TV port. Magic Remote as primary input (d-pad for movement, pointer for combat targeting, gyro gestures as stretch goal). Published to the LG Content Store as a free app.

## Project structure

```
dcjam2026/
├── index.html                 Single entry point
├── README.md                  This file
├── CLAUDE.md                  AI contributor conventions
├── docs/
│   └── ROADMAP.md             10-pass extraction roadmap
├── engine/                    27 IIFE modules
│   ├── rng.js                 Seeded PRNG
│   ├── tiles.js               Tile type constants
│   ├── audio-system.js        Web Audio playback
│   ├── grid-gen.js            BSP floor generator
│   ├── door-contracts.js      Floor transition spawn logic
│   ├── door-contract-audio.js Transition sound grammar
│   ├── lighting.js            Per-tile light map
│   ├── enemy-ai.js            Patrol, awareness, chase
│   ├── combat-engine.js       STR card combat
│   ├── synergy-engine.js      Card combo resolution
│   ├── card-system.js         Deck and hand management
│   ├── loot-tables.js         Drop table generation
│   ├── input.js               Keyboard abstraction + edges
│   ├── movement.js            Queued lerp grid movement
│   ├── pathfind.js            BFS grid pathfinder
│   ├── spatial-contract.js    Floor-type rendering rules
│   ├── raycaster.js           DDA first-person renderer
│   ├── minimap.js             Fog-of-war top-down map
│   ├── hud.js                 HP/energy/floor/card display
│   ├── game-loop.js           rAF + fixed tick loop
│   ├── player.js              Player state and stats
│   ├── mouse-look.js          Free-look offset
│   ├── floor-manager.js       Floor gen, cache, biomes
│   ├── floor-transition.js    SFX-sequenced transitions
│   ├── input-poll.js          Per-frame input polling
│   ├── combat-bridge.js       Combat/card/chest bridge
│   └── game.js                Thin orchestrator
├── data/                      JSON data files
├── audio/                     SFX and music assets
└── portal/                    Sound designer tool
```

## License

Jam entry. Engine code derived from EyesOnly (private) and dcexjam2025 (reference only). Not open source at this time.

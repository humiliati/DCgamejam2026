# Dungeon Gleaner

A first-person dungeon crawler built for [DC Jam 2026](https://itch.io/jam/dcjam2026) (March 27 -- April 5, 2026).

Someone has to restock the dungeons.

You are **Operative Gleaner** -- a licensed dungeon maintenance contractor dispatched to a small coastal boardwalk town. While the heroes kick down doors, slaughter everything that moves, and loot every crate in sight, somebody has to come in after and put it all back together. That somebody is you.

Scrub the walls. Restock the crates with fresh wheels of cheese. Re-arm the traps. Reset the floors for the next adventuring cycle. Earn your coin through honest labor -- not glory. Your combat deck isn't found in treasure chests; it's built crate by crate, mop by mop.

But the deeper you go, the stranger the evidence. The hero isn't just clearing monsters -- they're hunting *dragons*. Ancient protectors being systematically eliminated. Every dungeon floor hides another piece of a conspiracy running from the crooked Gleaner's Guild all the way up to the factions controlling the town.

## Jam themes (all four)

**Dragons** -- Ancient protectors being hunted by the hero. The conspiracy at the core of the story, revealed floor by floor through environmental evidence and NPC dialogue.

**Retrofuturism** -- The entire visual identity. A coastal boardwalk town where a civilization that discovered magic before electricity built chrome railings onto marble promenades and hung neon sigils over old timber shop fronts. Vaporwave sunsets on stone walls.

**Rock-Paper-Scissors** -- Combat suit triangle: Clubs (Wild/Force) > Diamonds (Crystal/Precision) > Spades (Earth/Steel) > Clubs. Hearts are neutral rule-breakers. Every card and enemy carries a suit alignment.

**Cleaning Up the Hero's Mess** -- The entire game. Three loops: scrub dungeon tiles, restock looted crates, and complete work orders to reset floors for the next adventurer cycle.

## How to play

### Running it

For development: run `python3 serve.py` or `node serve.js` from the game directory, then open `http://localhost:8080`.

For quick testing: open `index.html` directly in a browser (audio will not work on `file://` due to CORS -- use the local server).

On LG webOS: deploy via `ares-install` as usual. No CORS issues in production.

### Controls

| Action | Keyboard | Magic Remote / Mouse |
|---|---|---|
| Move | WASD | -- |
| Turn | Q / E | Pointer aim |
| Interact | F | Click |
| Stairs | . (down) / , (up) | Click prompt |
| Minimap | M | -- |
| Cards (combat) | 1-5 | Click card |
| Pause menu | Esc / P | -- |
| Menu navigate | Arrow keys | Scroll / Click |

A character creation flow runs at startup: pick a callsign (operative codename) and a class (Blade, Ranger, Shadow, Sentinel, Seer, or Wildcard).

## Core gameplay loops

**The Cleaning Loop** -- Grid-by-grid tile scrubbing. Every wall and floor surface has a condition state. Scrub tiles for coin rewards. Progressive cleaning tools from Rag to Pressure Washer. Magic Remote pointer for aimed cleaning.

**The Restocking Loop** -- Crates have 2-5 item slots with color-coded frames hinting at the ideal item. Fill slots with dungeon junk (1 coin each) or shop-bought matching items (2-3 coins). Sealed crates pop bonus coins plus a chance at combat cards.

**The Dungeon Reset Loop** -- Work orders from the Gleaner's Guild: reach a readiness threshold per floor by cleaning tiles, restocking crates, re-arming traps, scrambling puzzles, and restoring secrets. Heroes arrive on patrol cycles to undo your work.

**The Shop Round-Trip** -- Enter dungeon with empty bags, earn coins through labor, exit to surface shops, buy matching restock ingredients, re-enter for better yields.

## World structure

Three-tier floor ID convention:

- `"N"` (depth 1) -- outdoor districts (Promenade, Lantern Gardens, Frontier Gate)
- `"N.N"` (depth 2) -- building interiors (Coral Bazaar, Gleaner's Guild, Driftwood Inn)
- `"N.N.N"` (depth 3) -- dungeons beneath buildings (the Hero's mess, proc-gen)

Each depth has its own spatial contract governing wall height, fog model, render distance, ceiling type, and door transition sound sequences.

## Architecture

50+ vanilla JavaScript modules loaded via `<script>` tags in dependency order. Every module is a self-executing IIFE that attaches to a single global variable. No imports, no exports, no bundler -- the browser is the runtime.

**Layer 0** -- Foundations (zero deps): SeededRNG, TILES, i18n, AudioSystem

**Layer 1** -- Core systems: GridGen, DoorContracts, Lighting, EnemyAI, CombatEngine, SynergyEngine, CardSystem, LootTables, WorldItems, InputManager, MovementController, Pathfind, SpatialContract, TextureAtlas, SessionStats, Salvage, BreakableSpawner

**Layer 2** -- Rendering + UI: UISprites, DoorAnimator, Skybox, Raycaster, Minimap, HUD, DialogBox, Toast, TransitionFX, CardFan, ScreenManager, MenuBox, AudioMusicManager, SplashScreen, GameLoop

**Layer 3** -- Game modules: Player, MouseLook, FloorManager, FloorTransition, InputPoll, InteractPrompt, CombatBridge, HazardSystem, Shop, MenuFaces, TitleScreen, GameOverScreen, VictoryScreen

**Layer 4** -- Orchestrator: Game (thin wiring shell)

## Credits

**Game Design & Development** -- Stellar Aqua

**Player Controller, Camera, Character System** -- Tower of Hats

**Music** -- Bober @ Itch, Aliya Scott, Turtlebox

**Lighting & Rendering** -- Vinsidious

**AI Engineering & Debugging** -- Claude (Anthropic)

**Data Tables & Balancing** -- Minimax

**Brainstorming & Design Iteration** -- GPT (OpenAI)

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
| Texture atlas | Original | Procedural 64x64 wall textures |

## License

Built for DC Jam 2026. All original code and assets by the credited contributors.

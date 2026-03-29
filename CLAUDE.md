# CLAUDE.md — Contributor Conventions

This file tells Claude (and future contributors) how to work in this codebase.

## Project identity

**Dungeon Gleaner** — first-person dungeon crawler. You're a Nez-Ha (scavenger-cleaner) following in a legendary Hero's destructive wake through a retrofuturistic fantasy boardwalk town. Four DC Jam 2026 themes: Dragons, Retrofuturism, Rock-Paper-Scissors (Flame/Frost/Storm combat triangle), Cleaning Up the Hero's Mess.

Jam entry for DC Jam 2026 (March 27 – April 5, 2026). Post-jam target: LG Content Store webOS TV app driven by Magic Remote.

Deadline: playable by April 5. Post-jam polish and webOS packaging are separate passes.

The living design document is `docs/Biome Plan.html` (v4). It defines the world structure, biome palettes, enemy populations, quest items, and module wiring.

## Hard rules

- **Zero build tools.** No npm, no webpack, no esbuild, no TypeScript. The project is vanilla HTML5/JavaScript loaded via `<script>` tags. The browser is the only runtime.
- **IIFE module pattern.** Every engine file is `var ModuleName = (function() { 'use strict'; ... return { publicAPI }; })();` attaching to a single global. No ES modules, no require, no import.
- **Script load order is the dependency graph.** `index.html` loads scripts in 5 layers (0-4). A module can only reference globals defined by scripts loaded before it. Adding a new module means inserting it in the correct layer.
- **No external CDN dependencies at runtime.** Everything ships in the project folder. The game must work offline (webOS apps are local).

## Direction convention

The coordinate system uses +Y = south (screen down). Direction indices:

```
0 = EAST   (angle 0)
1 = SOUTH  (angle π/2)
2 = WEST   (angle π)
3 = NORTH  (angle -π/2)
```

Turn left = `(dir + 3) % 4` (CCW). Turn right = `(dir + 1) % 4` (CW). The raycaster uses radians; `MovementController.dirToAngle()` converts. DoorContracts returns radians from `Math.atan2()`; `Player.radianToDir()` converts back.

## Floor hierarchy

String floor IDs are the primary identifier throughout the codebase. There is NO integer `floorNum` — the string IS the identity.

- `"N"` = depth 1, **exterior** — skybox (no ceiling), 2× tall walls, FADE fog
- `"N.N"` = depth 2, **interior** — solid ceiling, 2× tall walls, CLAMP fog
- `"N.N.N"` = depth 3, **nested dungeon** — void ceiling, 1× tall walls, DARKNESS fog

Current world map:

```
"0"       The Approach       (exterior — tutorial courtyard)
"1"       The Promenade      (exterior — sunset boardwalk town)
"1.1"     Coral Bazaar       (interior — market hall)
"1.1.1"   Coral Cellars      (dungeon — first proc-gen level)
"1.1.2+"  deeper dungeon     (dungeon — proc-gen)
```

Future floors: `"2"` Lantern Gardens (ext), `"2.1"` Inn (int), `"3"` Frontier Gate (ext), `"3.1"` Armory (int).

### Floor ID navigation

FloorManager exposes tree-traversal helpers:

- `parentId("1.1")` → `"1"` (ascend)
- `childId("1", "1")` → `"1.1"` (descend)
- `nextSiblingId("1.1.1")` → `"1.1.2"` (deeper dungeon level)
- `prevSiblingId("1.1.2")` → `"1.1.1"` (shallower dungeon level)

### Door target resolution

Doors use explicit `doorTargets` map in floor data first, then fall back to convention:

- **DOOR** → `doorTargets[key]` or `childId(currentId, '1')`
- **DOOR_EXIT / DOOR_BACK** → `doorTargets[key]` or `parentId(currentId)`
- **STAIRS_DN** → depth ≥3: `nextSiblingId`, else `childId`
- **STAIRS_UP** → depth ≥3: `prevSiblingId`, else `parentId`

Explicit `doorTargets` are required for sibling-depth transitions (e.g. Promenade DOOR_EXIT → The Approach, both depth 1).

### Depth determines rendering

- **Depth 1 (exterior)**: `SpatialContract.exterior()` — skybox, FADE fog, parallax layers, no ceiling
- **Depth 2 (interior)**: `SpatialContract.interior()` — solid ceiling, CLAMP fog, wallHeight 2.0
- **Depth 3+ (dungeon)**: `SpatialContract.nestedDungeon()` — void ceiling, DARKNESS fog, wallHeight 1.0–1.2

## Module architecture

50 modules in `engine/`, organized in 6 load layers:

| Layer | Purpose | Modules |
|---|---|---|
| 0 | Zero-dependency foundations | `SeededRNG`, `TILES`, `i18n`, `AudioSystem` |
| 1 | Core systems | `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardSystem`, `LootTables`, `WorldItems`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract`, `TextureAtlas`, `SessionStats`, `Salvage`, `BreakableSpawner` |
| 2 | Rendering + UI | `UISprites`, `DoorAnimator`, `Skybox`, `Raycaster`, `Minimap`, `HUD`, `DialogBox`, `Toast`, `TransitionFX`, `CardFan`, `ScreenManager`, `MenuBox`, `SplashScreen`, `GameLoop` |
| 3 | Game modules | `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `InteractPrompt`, `CombatBridge`, `HazardSystem`, `Shop`, `MenuFaces`, `TitleScreen`, `GameOverScreen`, `VictoryScreen` |
| 4 | Orchestrator | `Game` |
| 5 | Data | `data/strings/en.js` |

`Game` (Layer 4) is a thin orchestrator. It owns init/tick/render and wires callbacks between modules. It contains no game logic.

## Adding a new module

1. Create `engine/your-module.js` using the IIFE pattern
2. Insert the `<script>` tag in `index.html` at the correct layer position
3. Only reference globals from modules loaded in earlier layers (or the same layer if the dependency loads first)
4. Expose a frozen public API via the return block
5. If the module needs to talk to another module at the same layer, wire through callbacks set by Game (Layer 4) — never create circular references

## Key subsystems to understand

**MovementController** — Queued lerp system ported from dcexjam2025. Dual-queue architecture: impulse_queue (raw input) and interp_queue (validated moves being animated). Runs at 60fps via `MC.tick(frameDt)` in the render loop. WALK_TIME=500ms, ROT_TIME=250ms. Double-time kicks in at queue depth > 3.

**SpatialContract** — Frozen config objects that govern both generation and rendering per floor type. Three constructors: `exterior()`, `interior()`, `nestedDungeon()`. The raycaster reads the contract every frame for fog, wall height, and distance clamping.

**DoorContractAudio** — Pure data module. Transition table keyed by `"srcDepth:tgtDepth"` returns a sound sequence array. Three-phase timing: DoorOpen (delay 0), Ascend/Descend (delay 250ms), DoorClose (delay 600ms). The pre-fade delay (350ms) ensures the player hears the door creak before the screen fades.

**FloorTransition** — State machine that orchestrates: cancel movement → play door SFX → pre-fade delay → show overlay → generate floor → fade in. Manages the Minimap floor cache stack (push on descend, pop on ascend).

**TextureAtlas** — Procedural texture generation and caching for wall rendering. Generates 64×64 pixel textures at init (brick, stone, wood, concrete, iron, pillar patterns). Each texture is an offscreen canvas + raw pixel data. SpatialContract maps tile types to texture IDs; the raycaster samples 1px-wide columns via `ctx.drawImage()`. When `getTexture()` returns null, the raycaster falls back to flat color (backward compatible). See `docs/TEXTURE_ROADMAP.md` for the 3-layer visual upgrade plan.

**Minimap** — 160x160 canvas with per-floor fog-of-war caching. `_floorCache` maps floor IDs to explored tile hashes. `_floorStack` tracks the breadcrumb path from surface to current depth. Stairs render as colored tiles with directional chevrons.

## Timing model

The game runs two loops:

- **Game tick** at 10fps (100ms interval) — enemy AI updates, awareness decay, aggro checks
- **Render loop** at requestAnimationFrame rate (60fps) — input polling, movement animation, raycaster draw, minimap draw

Movement interpolation runs in the render loop for smooth animation. Grid-based game logic (collision, tile interactions, combat) uses snapped integer positions from `MC.getGridPos()`.

## Tile height offsets (Doom rule)

Transition tiles render vertically displaced from the floor plane. This follows Doom's level design principle: important doors are never at ground level. The player reads elevation semantically before interacting.

Each spatial contract carries a `tileHeightOffsets` table keyed by TILES constant value. Positive offsets raise the wall column (step visible below), negative offsets sink it (lip visible above). The raycaster applies the offset per-column, scaling with distance to maintain perspective.

Design language by floor depth:

- **Exterior**: building doors raised +0.15, stairs down sunken -0.12, boss doors prominent at +0.25
- **Interior**: subtle room-to-room steps +0.05, trap-door stairs -0.08, elevated boss archway +0.12
- **Nested dungeon**: hole-in-floor stairs -0.10, rough steps up +0.05, chamber entrance +0.15

The step fill (the colored strip in the gap) uses the contract's `stepColor` at 70% brightness to read as a physical platform edge. Regular walls and empty tiles always have offset 0.

## Source codebases

**EyesOnly** (mounted at `/mnt/EyesOnly/`) — Production roguelike, ~155k lines. Source for door contracts, combat engine, card system, synergy engine, enemy AI, audio system, floor generation, lighting, and the sound designer portal. Extract patterns, not whole files — the monolith coupling needs stripping.

**dcexjam2025** (mounted at `/mnt/dcexjam2025/`) — GLOV.js dungeon crawler. Source for movement controller (CrawlerControllerQueued), minimap patterns (per-wall rendering, pathfind-to-click), and BFS pathfinding. TypeScript + GLOV.js framework — port the algorithms, not the code structure.

## Testing

No test framework. Open `index.html` in browser and play. Console logs prefixed with `[ModuleName]` for each system's init. Check the minimap, walk around, descend stairs, fight enemies.

## What not to do

- Don't add npm, package.json, or any build step
- Don't convert IIFEs to ES modules
- Don't add TypeScript
- Don't reference modules from a layer that loads after yours
- Don't put game logic in Game.js — it's a wiring shell, delegate to the owning module
- Don't use localStorage (webOS TV apps have unreliable storage — use in-memory state)
- Don't assume the raycaster convention matches standard math convention (+Y is south here, not north)

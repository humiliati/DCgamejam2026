# CLAUDE.md — Contributor Conventions

This file tells Claude (and future contributors) how to work in this codebase.

## Project identity

First-person grid-based dungeon crawler. Jam entry for DC Jam 2026 (March 27 – April 5, 2026). Post-jam target: LG Content Store webOS TV app driven by Magic Remote.

Deadline: vertical slice playable by April 5. Post-jam polish and webOS packaging are separate passes.

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

EyesOnly three-tier floor ID convention:

- `"N"` = depth 1, exterior/overworld
- `"N.N"` = depth 2, interior contrived (buildings, taverns)
- `"N.N.N"` = depth 3, nested proc-gen dungeon

Currently all playable floors use depth 3 IDs (`"1.1.1"`, `"1.1.2"`, etc.) until the world designer portal adds overworld and building layers.

Depth determines: fog model (FADE/CLAMP/DARKNESS), wall height, render distance, ceiling type, and door transition sound sequences.

## Module architecture

27 modules in `engine/`, organized in 5 load layers:

| Layer | Purpose | Modules |
|---|---|---|
| 0 | Zero-dependency foundations | `SeededRNG`, `TILES`, `AudioSystem` |
| 1 | Core systems | `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardSystem`, `LootTables`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract` |
| 2 | Rendering | `Raycaster`, `Minimap`, `HUD`, `GameLoop` |
| 3 | Game modules | `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `CombatBridge` |
| 4 | Orchestrator | `Game` |

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

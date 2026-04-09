# CLAUDE.md — Contributor Conventions

This file tells Claude (and future contributors) how to work in this codebase.

## Project identity

**Dungeon Gleaner** — first-person dungeon crawler. You are **Operative Gleaner**, a licensed dungeon scavenger dispatched to a retrofuturistic fantasy boardwalk town. Your job: clean up after the heroes and adventurers who storm through the dungeons beneath the town — scrub the walls, exstinguish torches, restock the crates, re-arm the traps, reset the floors. Four DC Jam 2026 themes: Dragons, Retrofuturism, Rock-Paper-Scissors (playing-card suit combat triangle: ♣/♦/♠/♥), Cleaning Up the Hero's Mess.

The **conspiracy layer** (contributor knowledge — revealed to the player gradually): Dragons are ancient protectors — not monsters. The hero you're cleaning up after is systematically eliminating them on behalf of factions with hidden agendas (a crooked detective agency, a religious order protecting a 400-year-old secret, a handler at the agency that sent you). As Gleaner cleans deeper floors, environmental evidence and NPC dialogue expose the truth. By the end of Act 1, Gleaner must choose a side.

The game opens with a **character creation flow** (title screen → callsign selection → operative class selection → deploy animation). Callsign is the player's operative codename; class sets starting stat bonuses (Blade/Ranger/Shadow/Sentinel/Seer/Wildcard).

Jam entry for DC Jam 2026 (March 27 – April 5, 2026). Post-jam target: April 25th fresh bug free version at the conclusion of Jam submission voting


Deadline: Winter 2026 for LG Content Store webOS TV app driven by Magic Remote.

The living design document is `docs/Biome Plan.html` (v5). It defines the world structure, biome palettes, enemy populations, quest items, and module wiring. `docs/STREET_CHRONICLES_NARRATIVE_OUTLINE.md` defines the faction structure, conspiracy arcs, and NPC roster.

## Hard rules

- **Zero build tools.** No npm, no webpack, no esbuild, no TypeScript. The project is vanilla HTML5/JavaScript loaded via `<script>` tags. The browser is the only runtime.
- **IIFE module pattern.** Every engine file is `var ModuleName = (function() { 'use strict'; ... return { publicAPI }; })();` attaching to a single global. No ES modules, no require, no import.
- **Script load order is the dependency graph.** `index.html` loads scripts in 5 layers (0-4). A module can only reference globals defined by scripts loaded before it. Adding a new module means inserting it in the correct layer.
- **No external CDN dependencies at runtime.** Everything ships in the project folder. The game must work offline (webOS apps are local).
- **Never scope-compromise the correct solution.** If the right answer is X, build X. Do not substitute a cheaper/simpler Z "for jam scope" or "for now." Scope-compromised implementations create layers of low-fidelity code that fail silently when composed together. A correct implementation that takes longer is always preferable to a shortcut that passes syntax checks but doesn't actually work. 
/////If the timeline is tight, cut features — don't cut corners on the features you do build.////////////


**Never fabricate when EyesOnly has a reference implementation.** EyesOnly is ALWAYS available at `EyesOnly/` within this repo (absolute path on the contributor's machine: `C:\Users\hughe\.openclaw\workspace\LG Apps\Games\DCgamejam2026\EyesOnly`). When a problem has already been solved in EyesOnly, READ that code and extract/adapt it. Do not invent a new algorithm, do not claim EyesOnly is "not mounted" or "not available," do not search GitHub or the web for something we already have locally. The path is `EyesOnly/public/js/` for game modules and `EyesOnly/public/data/gone-rogue/` for JSON configs. If you cannot find a file, use `find` or `ls` on the EyesOnly directory — it is always there. If EyesOnly has no suitable refrence material regroup with user on research and brainstorming.

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

- `"N"` = depth 1, **exterior** — skybox (no ceiling), .5-3× tall walls, FADE fog
- `"N.N"` = depth 2, **interior** — solid ceiling, 2× tall walls, CLAMP fog
- `"N.N.N"` = depth 3, **nested dungeon** — void ceiling, 1× tall walls, DARKNESS fog

Current world map:

```
"0"       The Approach        (exterior — tutorial courtyard)
"1"       The Promenade       (exterior — sunset boardwalk town)
"1.1"     Coral Bazaar        (interior — card shop)
"1.2"     Driftwood Inn       (interior — inn, overheal bonfire)
"1.3"     Cellar Entrance     (interior — soft dungeon building)
"1.6"     Gleaner's Home      (interior — player bunk, keyring)
"1.3.1"   Soft Cellar         (dungeon — tutorial trap, easy enemies)
"2"       Lantern Row         (exterior — commercial district, more shops)
"2.1"     Dispatcher's Office (interior — employer, mission briefing)
"2.2"     Watchman's Post     (interior — NPC, dungeon staging)
"2.2.1"   Hero's Wake B1      (dungeon — Hero reveal, high-level corpses)
"2.2.2"   Hero's Wake B2      (dungeon — deeper scavenge)
```

Future floors: 4+ and living infrastructure for 0-3

### Floor ID navigation

FloorManager exposes tree-traversal helpers:

- `parentId("1.1")` → `"1"` (ascend)
- `childId("1", "1")` → `"1.1"` (descend)
- `nextSiblingId("2.2.1")` → `"2.2.2"` (deeper dungeon level)
- `prevSiblingId("2.2.2")` → `"2.2.1"` (shallower dungeon level)

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

63 modules in `engine/`, organized in 7 load layers:

| Layer | Purpose | Modules |
|---|---|---|
| 0 | Zero-dependency foundations | `SeededRNG`, `TILES`, `i18n`, `AudioSystem` |
| 1 | Core systems | `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardAuthority`, `CardTransfer`, `CardSystem`, `LootTables`, `WorldItems`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract`, `TextureAtlas`, `SessionStats`, `Salvage`, `BreakableSpawner` |
| 2 | Rendering + UI | `UISprites`, `DoorAnimator`, `Skybox`, `Raycaster`, `Minimap`, `HUD`, `DialogBox`, `Toast`, `TransitionFX`, `CardFan`, `ScreenManager`, `MenuBox`, `SplashScreen`, `GameLoop` |
| 3 | Game modules | `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `InteractPrompt`, `CombatBridge`, `HazardSystem`, `Shop`, `MenuFaces`, `TitleScreen`, `GameOverScreen`, `VictoryScreen` |
| 3.5 | Extracted game helpers | `GameActions`, `WeekStrip`, `EquipActions`, `QuickFill`, `DeckActions`, `Incinerator`, `PickupActions`, `ShopActions`, `HomeEvents`, `HeroWake`, `CorpseActions`, `DispatcherChoreography`, `QuestWaypoint` |
| 4 | Orchestrator | `Game` |
| 5 | Data | `data/strings/en.js` |

Layer 3.5 modules were extracted from `game.js` in three phases (see `docs/GAME_JS_EXTRACTION_ROADMAP.md`). They are IIFEs that depend on Layer 0–3 globals via `typeof` guards. `GameActions` loads first (shared helpers: `refreshPanels`, `collapseAllPeeks`, `applyPickup`, gate state, canvas ref). Game (Layer 4) wires callbacks at init for any cross-module communication that would otherwise create circular deps.

`Game` (Layer 4) is a thin orchestrator. It owns init/tick/render and wires callbacks between modules. It contains no game logic.

## Adding a new module

1. Create `engine/your-module.js` using the IIFE pattern
2. Insert the `<script>` tag in `index.html` at the correct layer position
3. Only reference globals from modules loaded in earlier layers (or the same layer if the dependency loads first)
4. Expose a frozen public API via the return block
5. If the module needs to talk to another module at the same layer, wire through callbacks set by Game (Layer 4) — never create circular references

## Key subsystems to understand

**CardAuthority** — Single source of truth for all inventory/card state. Owns hand (5 cards), backup deck (30), draw deck, bag (12 items), stash (20), equipped (3 quick-slots), and gold. Event system (`on`/`off`/`_emit`) with 9 event types. All mutations go through CardAuthority methods — no module should directly splice arrays or mutate state. Constants `SUIT_DATA`, `RES_COLORS`, `QUALITY_COLORS` are canonical here (not CardRenderer). `CardTransfer` handles validated cross-zone moves with rollback. `CardSystem` is a pure card definition registry (loads cards.json, seeds starter deck). `Player` retains only position, stats, debuffs, flags, and compound item utilities (`useItem`, `hasItem`, `consumeItem`) that read from CardAuthority.

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

**EyesOnly** (mounted at `/mnt/EyesOnly/`) — Production roguelike, ~155k lines. Source for door contracts, combat engine, card system, synergy engine, enemy AI.

## Browser testing (Cowork sessions)

The game is a canvas-based HTML5 app. Testing in-browser requires specific setup:

1. **Use Claude in Chrome** (not Kapture) — Kapture doesn't connect to Brave.
2. **Brave is the default browser.** The extension name is still "Claude in Chrome" but it works in Brave.
3. **Enable file:// access**: Brave → `brave://extensions` → Claude in Chrome → Details → toggle "Allow access to file URLs". Without this, `read_page` and `javascript_tool` return permission errors on `file://` URLs.
4. **Navigating to file:// URLs**: The `navigate` tool prepends `https://` to bare paths. Instead, navigate to `example.com` first, then use `javascript_tool` with `window.location.href = 'file:///...'`. Or ask the user to paste the URL into the MCP tab group manually.
5. **Game file URL**: `file:///C:/Users/hughe/.openclaw/workspace/LG%20Apps/Games/DCgamejam2026/index.html`
6. **Canvas apps return empty from `read_page`** — use `javascript_tool` to query game state and `computer` action `screenshot` for visuals.
7. **Console errors**: Call `read_console_messages` once to start tracking, then reload the page to capture load-time errors.
8. **Tab group**: The game tab must be dragged into the Claude MCP tab group before tools can access it.
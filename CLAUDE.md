# CLAUDE.md — Contributor Conventions

This file tells Claude (and future contributors) how to work in this codebase.

## Environment

All paths below use `<repo-root>` as a placeholder for the game's checkout. On the maintainer's machine `<repo-root>` currently resolves to `C:\Users\hughe\Dev\Dungeon Gleaner Main\`. Treat any absolute path you see in older docs (e.g. `C:\Users\hughe\.openclaw\workspace\LG Apps\Games\DCgamejam2026\…`) as a stale reference to a prior checkout location — the content is what matters, not the literal path.

Sibling repos historically lived next to the game under the same parent directory. In the current checkout, `raycast.js-master/` is **nested inside `<repo-root>/`**, and `EyesOnly/` is not present in the working tree. If you need EyesOnly as a reference source, ask the user where it currently lives — don't fabricate based on old CLAUDE.md wording.

For the full CLI inventory (local serve, extractors, authoring CLIs, validators, harnesses, deploy scripts), see `<repo-root>/docs/CLI_TOOLS.md`.

## Project identity

**Dungeon Gleaner** — first-person dungeon crawler. You are **Operative Gleaner**, a licensed dungeon scavenger dispatched to a retrofuturistic fantasy boardwalk town. Your job: clean up after the heroes and adventurers who storm through the dungeons beneath the town — scrub the walls, exstinguish torches, restock the crates, re-arm the traps, reset the floors. Four DC Jam 2026 themes: Dragons, Retrofuturism, Rock-Paper-Scissors (playing-card suit combat triangle: ♣/♦/♠/♥), Cleaning Up the Hero's Mess.

The **conspiracy layer** (contributor knowledge — revealed to the player gradually): Dragons are ancient protectors — not monsters. The hero you're cleaning up after is systematically eliminating them on behalf of factions with hidden agendas (a crooked detective agency, a religious order protecting a 400-year-old secret, a handler at the agency that sent you). As Gleaner cleans deeper floors, environmental evidence and NPC dialogue expose the truth. By the end of Act 1, Gleaner must choose a side.

The game opens with a **character creation flow** (title screen → callsign selection → operative class selection → deploy animation). Callsign is the player's operative codename; class sets starting stat bonuses (Blade/Ranger/Shadow/Sentinel/Seer/Wildcard).

Jam entry for DC Jam 2026 (March 27 – April 5, 2026). Post-jam target: April 25th fresh bug free version at the conclusion of Jam submission voting


Deadline: Winter 2026 for LG Content Store webOS TV app driven by Magic Remote.

The living design document is `docs/Biome Plan.html` (v5). It defines the world structure, biome palettes, enemy populations, quest items, and module wiring. `docs/STREET_CHRONICLES_NARRATIVE_OUTLINE.md` defines the faction structure, conspiracy arcs, and NPC roster.

## Sandbox mount gotcha — DO NOT rewrite files based on stale bash reads

The Linux sandbox exposes the Windows source via a `bindfs` FUSE mount. **The mount caches file contents at session boot, and Edit-tool writes on the Windows side do NOT invalidate that cache.** This means `cat`, `wc -l`, `node --check`, `grep`, and any other bash-side read of a file that existed at session start may return a **stale, truncated, or older version** — even after you've edited it successfully this session.

Observed symptoms that trick agents:
- `node --check engine/foo.js` reports `Unexpected end of input` at a line number that doesn't exist in the real file
- `wc -l` shows fewer lines than the Read tool
- `stat` shows an mtime from days/weeks ago on a file you just edited
- Changes you know you made appear "missing" in bash output

**The Read tool is authoritative. Bash is not.** If bash disagrees with Read, trust Read.

**Do NOT**:
- Rewrite a file from scratch because bash says it's broken/truncated
- "Restore" content that bash claims is missing — it's almost certainly still there
- Treat `node --check` failures as ground truth on pre-existing files mid-session

**Workarounds if you genuinely need bash to see current content**:
1. Read the file with the Read tool, then Write it back over itself — the fresh inode forces a cache refresh
2. `cat > path << 'EOF' ... EOF` from bash with the known-current content (write-through works bidirectionally)
3. Files *created* this session via the Write tool appear fresh in bash — only *pre-existing* files are affected

`sudo sysctl vm.drop_caches`, remount, and `rm` on the mount are all blocked by the sandbox profile. There is no in-sandbox way to globally drop the bindfs cache.

## File truncation — recovery, not rewrite

Separate from the stale-read issue above, files in this repo occasionally end up **actually truncated on disk** — the tail of the file is missing content that was committed moments earlier. Pattern: agent edits → commit → later, the working-tree copy is N lines shorter than `HEAD:<file>`. `engine/game.js` was the most recent victim (4536 lines on disk vs. 4568 in HEAD, losing the Minimap-render block and boot closure).

**Best current theory on the mechanism.** This project runs multiple Claude agent worktrees under `.claude/worktrees/` (`busy-gould`, `competent-margulis`, `elegant-mendel`), each committing to its own `claude/*` branch but sharing the `.git/` directory through bindfs. A newer Windows git writes index extensions (e.g. the "k\xfby3" extension we saw) that the sandbox's git 2.34.1 can't parse, producing "index file corrupt" errors. Partial writes to the index and/or to files during that contention appear to be the underlying mechanism. The `.git/hooks/pre-commit` installed by code-review-graph is **not** the cause (it only runs read-only analysis), and the active hook (`tools/.githooks/pre-commit` via `core.hooksPath`) is the read-only file-size budget check in `tools/check-budgets.js` — also not the cause.

**If you suspect a file is truncated**, the recovery procedure is always:

1. **Never regenerate from scratch.** The content still exists in git.
2. Compare line counts: `git show HEAD:<path> | wc -l` vs. `wc -l <path>`. If HEAD is longer, the disk copy is truncated.
3. Restore: `git show HEAD:<path> > <path>`. Do **not** use `git checkout HEAD -- <path>` if the index is corrupt — it will fail.
4. Verify the hash: `git hash-object <path>` should match `git rev-parse HEAD:<path>`.

**If the git index is corrupt** (error: `index uses XXXX extension, which we do not understand` / `index file corrupt`), `rm .git/index` is blocked by the sandbox profile. Workaround: `mv .git/index .git/index.corrupt && git read-tree HEAD`. Same trick for stale `.git/index.lock` files left by aborted operations — `mv` aside instead of `rm`.

**Line-ending config is now pinned** (`core.autocrlf=false`, `core.safecrlf=warn`, `core.eol=lf` in `.git/config`). Don't change these without thinking hard — EOL conversion mid-write on Windows is a known way to produce short files with `* text=auto` in `.gitattributes`.

**Post-commit agent verification step.** After any commit that touches more than a few files, run:

```sh
for f in $(git diff --name-only HEAD~1 HEAD); do
  disk=$(wc -l < "$f" 2>/dev/null || echo 0)
  head=$(git show "HEAD:$f" 2>/dev/null | wc -l)
  [ "$disk" != "$head" ] && echo "MISMATCH $f disk=$disk head=$head"
done
```

Any `MISMATCH` line means that file got truncated post-commit — restore via step 3 above.

## Hard rules

- **Zero build tools.** No npm, no webpack, no esbuild, no TypeScript. The project is vanilla HTML5/JavaScript loaded via `<script>` tags. The browser is the only runtime.
- **IIFE module pattern.** Every engine file is `var ModuleName = (function() { 'use strict'; ... return { publicAPI }; })();` attaching to a single global. No ES modules, no require, no import.
- **Script load order is the dependency graph.** `index.html` loads scripts in 5 layers (0-4). A module can only reference globals defined by scripts loaded before it. Adding a new module means inserting it in the correct layer.
- **No external CDN dependencies at runtime.** Everything ships in the project folder. The game must work offline (webOS apps are local).
- **Never scope-compromise the correct solution.** If the right answer is X, build X. Do not substitute a cheaper/simpler Z "for jam scope" or "for now." Scope-compromised implementations create layers of low-fidelity code that fail silently when composed together. A correct implementation that takes longer is always preferable to a shortcut that passes syntax checks but doesn't actually work. 
/////If the timeline is tight, cut features — don't cut corners on the features you do build.////////////


**Never fabricate when EyesOnly or raycast.js-master has a reference implementation.** Reference source paths (relative to `<repo-root>`):

- `<repo-root>/raycast.js-master/src/` — raycasting / 3D rendering reference (DDA, texture mapping, skybox math). **Currently vendored inside the repo.**
- `<repo-root>/raycast.js-master/` — top of the reference repo (has its own `package.json`; see `docs/CLI_TOOLS.md` § "Reference repo").
- `<repo-root>/../EyesOnly/public/js/` — 2D game modules (production roguelike, ~155k lines). Source for door contracts, combat engine, card system, synergy engine, enemy AI.
- `<repo-root>/../EyesOnly/public/data/gone-rogue/` — JSON data configs.

**Availability note (2026-04-19):** EyesOnly is *not* present in the current working tree. If you need it as a reference, ask the user where it currently lives on disk — don't claim "not mounted" and don't search GitHub / the web for substitutes. Historically it lived as a sibling of this repo; that may no longer be true.

When a problem has already been solved in EyesOnly or raycast.js-master, READ that code and extract/adapt it. Do not invent a new algorithm when a local reference exists.

If you cannot find a reference file, use `find` / `ls` on the expected directory. If neither EyesOnly nor raycast.js-master has suitable material, regroup with the user on research and brainstorming.

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

stale picture of the world map:

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

Modules in `engine/`, organized in 7 load layers (Layer 2 now includes 6 raycaster sub-modules plus the core):

| Layer | Purpose | Modules |
|---|---|---|
| 0 | Zero-dependency foundations | `SeededRNG`, `TILES`, `i18n`, `AudioSystem`, `DoorSprites`, `QuestTypes` |
| 1 | Core systems | `GridGen`, `DoorContracts`, `DoorContractAudio`, `Lighting`, `EnemyAI`, `CombatEngine`, `SynergyEngine`, `CardAuthority`, `CardTransfer`, `CardSystem`, `LootTables`, `WorldItems`, `InputManager`, `MovementController`, `Pathfind`, `SpatialContract`, `TextureAtlas`, `SessionStats`, `Salvage`, `BreakableSpawner`, `QuestRegistry` |
| 2 | Rendering + UI | `UISprites`, `DoorAnimator`, `Skybox`, `RaycasterLighting`, `RaycasterTextures`, `RaycasterProjection`, `RaycasterFloor`, `RaycasterWalls`, `RaycasterSprites`, `Raycaster` (core), `Minimap`, `HUD`, `DialogBox`, `Toast`, `TransitionFX`, `CardFan`, `ScreenManager`, `MenuBox`, `SplashScreen`, `GameLoop` |
| 3 | Game modules | `Player`, `MouseLook`, `FloorManager`, `FloorTransition`, `InputPoll`, `InteractPrompt`, `CombatBridge`, `HazardSystem`, `Shop`, `MenuFaces`, `TitleScreen`, `GameOverScreen`, `VictoryScreen`, `QuestChain` |
| 3.5 | Extracted game helpers | `GameActions`, `WeekStrip`, `EquipActions`, `QuickFill`, `DeckActions`, `Incinerator`, `PickupActions`, `ShopActions`, `HomeEvents`, `HeroWake`, `CorpseActions`, `DispatcherChoreography`, `QuestWaypoint` (thin shim — cursor-fx only, see §Key subsystems) |
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

**DoorSprites** — Layer 0 module. Per-tile door texture cache (`"x,y"` → texture ID) and exterior face cache (`"x,y"` → face index 0–3). Owns the `facade_door` gap filler registered with the Raycaster for DOOR_FACADE freeform tiles. Three-face model: exterior face → dark interior portal with door frame; interior face → transparent; side faces → opaque masonry. Populated by FloorManager during floor generation.

**DoorContractAudio** — Pure data module. Transition table keyed by `"srcDepth:tgtDepth"` returns a sound sequence array. Three-phase timing: DoorOpen (delay 0), Ascend/Descend (delay 250ms), DoorClose (delay 600ms). The pre-fade delay (350ms) ensures the player hears the door creak before the screen fades.

**FloorTransition** — State machine that orchestrates: cancel movement → play door SFX → pre-fade delay → show overlay → generate floor → fade in. Manages the Minimap floor cache stack (push on descend, pop on ascend).

**TextureAtlas** — Procedural texture generation and caching for wall rendering. Generates 64×64 pixel textures at init (brick, stone, wood, concrete, iron, pillar patterns). Each texture is an offscreen canvas + raw pixel data. SpatialContract maps tile types to texture IDs; the raycaster samples 1px-wide columns via `ctx.drawImage()`. When `getTexture()` returns null, the raycaster falls back to flat color (backward compatible). See `docs/TEXTURE_ROADMAP.md` for the 3-layer visual upgrade plan.

**Raycaster (split)** — The raycaster is 7 IIFEs loaded in Layer 2: `RaycasterLighting` (fog/tint helpers), `RaycasterTextures` (gap fillers + alpha cache), `RaycasterProjection` (editor/tool screen-space APIs), `RaycasterFloor` (floor/parallax/weather), `RaycasterWalls` (column drawing + face tests), `RaycasterSprites` (sprites, particles, wall decor), and `Raycaster` core (DDA, freeform, back-layer, orchestration, ~2,758 lines). Sub-modules own their own state and read the core's z-buffer/pedestal-occlusion arrays + contract + wall-decor map via `bind({getters})` called once near the end of core's IIFE. Core exposes aliases at its top (e.g. `var _renderSprites = RaycasterSprites.renderSprites;`) so hotpath call sites stay cheap. See `docs/RAYCASTER_EXTRACTION_ROADMAP.md`; Phase 4 (splitting the per-column DDA hotpath) is deferred until after post-Jam voting and gated on ≤2% framerate regression.

**Minimap** — 160x160 canvas with per-floor fog-of-war caching. `_floorCache` maps floor IDs to explored tile hashes. `_floorStack` tracks the breadcrumb path from surface to current depth. Stairs render as colored tiles with directional chevrons. Since DOC-107 Phase 1, the pulsing quest diamond is pulled each frame via `_pullMarker()` which prefers `QuestChain.getCurrentMarker(FloorManager.getFloor())`; the legacy `setQuestTarget()` push API is retained as a back-compat fallback.

**QuestChain / QuestRegistry / QuestTypes** — Data-driven quest system (DOC-107). `QuestTypes` (Layer 0) holds frozen enums: `FACTIONS` (mss/pinkerton/jesuit/bprd), reputation tiers (hated→exalted), `WAYPOINT_KIND`, step kinds. `QuestRegistry` (Layer 1) loads `data/quests.json` via sync XHR, validates, and resolves anchors. Six anchor resolver types dispatch through `resolveAnchor(specOrId)`: `literal` (fixed floor+x+y), `floor-data` (queries cached floor data), `entity` (calls `Module.method(floorId)`), `npc` (looks up NPC by id/floorId), `dump-truck` (queries DumpTruckSpawner deploy site), `door-to` (finds doorTarget to a specific floor). Registry stays at Layer 1 via `setResolvers({getFloorData, getEntity, getNpcById, getDumpTruck, getCurrentFloorId})` callback injection at Game init — never imports Layer 3+ modules directly. `QuestChain` (Layer 3) owns per-quest step progress and the current-marker derivation. Predicate engine `_matches(predicate, evt)` dispatches the six external event methods: `onItemAcquired`, `onFlagChanged`, `onReadinessChange`, `onFloorArrive`, `onNpcTalk`, `onCombatKill`. `getCurrentMarker(floorId)` has a 3-priority fallback: pinned step override → resolved anchor → `_legacyNavigationMarker(floorId)` (the DOC-66 §2 five-phase state machine absorbed verbatim from the retired `QuestWaypoint.update()`). `ReputationBar` is scaffolded but deferred to Phase 3. See `docs/QUEST_SYSTEM_ROADMAP.md` (DOC-107) for the full phased rollout; Phases 0 + 0b + 1 shipped 2026-04-16.

**QuestWaypoint (thin shim)** — DOC-107 Phase 1 reduced this Layer-3.5 module to ~60 lines. `update()` delegates to `QuestChain.update()`. The only unique surface left is `evaluateCursorFxGating()` — dispatches the `WaterCursorFX` active/inactive toggle on floor depth (dungeon ≥ depth 3) + hose state. Delete the file entirely after the cursor-fx consolidation (moves the gating call into `cursor-fx.js`). Do not extend this module — new quest logic belongs in QuestChain.

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

## DOOR_FACADE recess (Wolfenstein thin-wall offset)

DOOR_FACADE tiles use a Wolfenstein 3D-style thin-wall technique to render the door face recessed inside the tile rather than flush with adjacent walls. After `perpDist` is calculated for a DOOR_FACADE hit on the exterior face, the raycaster advances the ray by `_recessD` (0.25) world units into the tile:

- **Inset hit** (ray stays within tile): `perpDist` increases → door face + lintel render at greater distance than surrounding walls, creating visible depth.
- **Jamb hit** (ray exits through perpendicular boundary): `_facadeJamb = true`, `side` flips, `perpDist` set to the side-exit crossing. Freeform rendering is suppressed → column renders as solid textured wall (the jamb masonry).

The recess block lives in `raycaster.js` between the `perpDist = Math.abs(perpDist)` line and the perpDist minimum clamp. `_facadeJamb` propagates to the z-buffer write (solid occlusion, not see-through) and the freeformCfg lookup (nulled for jamb columns). `DoorSprites.getExteriorFace()` identifies which face of the tile faces the street.

## Source codebases

**Raycast, action & 3D** (at `<repo-root>/raycast.js-master/`) — vertical lines of texture-mapped walls at constant-Z, perspective-correct texture-mapping for flat surfaces. An offscreen frame buffer optimizes per-pixel rendering. **This reference repo has its own code-review-graph** (`<repo-root>/raycast.js-master/.code-review-graph/graph.db`) — 33 files, 201 functions, 541 call edges, 27 communities, 48 flows. Build it with `python -m code_review_graph build` from inside `<repo-root>/raycast.js-master/`. When working in that subdirectory, the graph MCP server serves its graph instead of the main Dungeon Gleaner graph.

**EyesOnly** — Production roguelike, ~155k lines. Source for door contracts, combat engine, card system, synergy engine, enemy AI. Historical path `<repo-root>/../EyesOnly/`; **not present in the current working tree as of 2026-04-19** (see `## Environment` above). If you need it, ask the user where it lives now.

## Browser testing (Cowork sessions) ***ONLY TEST IN BROWSER IF ABSOLUTELY NECESSARY OR IF ASKED TO DO SO***

The game is a canvas-based HTML5 app. Testing in-browser requires specific setup:

1. **Use Claude in Chrome** (not Kapture) — Kapture doesn't connect to Brave.
2. **Brave is the default browser.** The extension name is still "Claude in Chrome" but it works in Brave.
3. **Enable file:// access**: Brave → `brave://extensions` → Claude in Chrome → Details → toggle "Allow access to file URLs". Without this, `read_page` and `javascript_tool` return permission errors on `file://` URLs.
4. **Navigating to file:// URLs**: The `navigate` tool prepends `https://` to bare paths. Instead, navigate to `example.com` first, then use `javascript_tool` with `window.location.href = 'file:///...'`. Or ask the user to paste the URL into the MCP tab group manually.
5. **Game file URL**: `file:///<repo-root-url-encoded>/index.html`. Example on the maintainer's current setup: `file:///C:/Users/hughe/Dev/Dungeon%20Gleaner%20Main/index.html`. Prefer `http://localhost:8080/index.html` served by `node serve.js` — `file://` disables audio fetch and many JSON loads.
6. **Canvas apps return empty from `read_page`** — use `javascript_tool` to query game state and `computer` action `screenshot` for visuals.
7. **Console errors**: Call `read_console_messages` once to start tracking, then reload the page to capture load-time errors.
8. **Tab group**: The game tab must be dragged into the Claude MCP tab group before tools can access it.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

## Document Graph (docs/, not code)

The code-review-graph above covers code. For navigating the **docs/** corpus
— especially when picking up a delegated slice of the current blockout arc —
use `docs/DOC_GRAPH_BLOCKOUT_ARC.md` (registered as DOC-104 in the TOC).

It's a Mermaid diagram centered on `BLOCKOUT_REFRESH_PLAN` with five clusters:
prerequisites (blue), implementation spec (green), engine file leaf nodes
(purple), downstream consumers (red), and verification/meta (grey). Solid
arrows = prerequisite, dashed = informs, dotted = downstream. Renders in
GitHub and VS Code preview.

Delegated-work reading order:

1. `docs/DOC_GRAPH_BLOCKOUT_ARC.md` to orient
2. Blue cluster (prereqs) in order
3. Green cluster spec docs your slice touches
4. `code-review-graph` MCP (`semantic_search_nodes`, `get_impact_radius`) **before** editing any engine file
5. Implement + verify via the grey cluster
6. Flag red-cluster docs that now need a revision pass

**Arc-scoped.** Full doc catalog lives at `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md`.
When the blockout arc closes, archive the graph and start a fresh one for the
next cluster (likely NPC refresh → living economy).

## Authoring pipeline (tools/)

The project ships a three-stage floor authoring pipeline that runs entirely in the browser or Node CLI. Every new floor — hand-authored or agent-generated — flows through these tools.

### World Designer (`tools/world-designer.html`)

Browser UI for creating new floor specs. Loads `tools/biome-map.json` (12 biomes with tile palettes) and `tools/tile-schema.json` (97 tiles). Outputs a **§3.1 seed payload** containing biome palette, required cells (spawn + doors), dimension budget, and narrative hints. The payload is passed to BO-V via `sessionStorage['pendingFloorSpec']`.

### Blockout Visualizer (`tools/blockout-visualizer.html`)

Browser-based tile editor for floor grids. Consumes §3.1 payloads from World Designer, renders biome-aware tile picker, enforces pinned-cell locks on required cells, and shows a required-cells checklist panel. Supports lasso, copy/paste across floors, undo/redo, and diff-based save to `engine/floor-blockout-*.js` IIFEs. Emits payload sidecar JSON to `tools/floor-payloads/`.

### Blockout CLI (`tools/blockout-cli.js`)

Node.js headless interface to the same operations. Key commands:

- `bo paint-rect`, `bo flood-fill`, `bo replace` — tile mutation
- `bo stamp-room`, `bo stamp-corridor`, `bo stamp-torch-ring`, `bo stamp-tunnel-corridor`, `bo stamp-porthole-wall`, `bo stamp-alcove-flank` — composite stamps
- `bo create-floor`, `bo set-biome`, `bo set-spawn`, `bo set-door-target` — floor lifecycle
- `bo render-ascii`, `bo describe-cell`, `bo diff-ascii` — inspection
- `bo validate`, `bo report-validation` — structural checks
- `bo ingest`, `bo emit` — IIFE ↔ floor-data round-trip
- `bo help <command>` — per-command docs (also `window.BO.help()` in browser)

All mutating commands honor `--dry-run` (Slice C1).

### Extract-Floors (`tools/extract-floors.js`)

Rebuilds `tools/floor-data.json` from `engine/floor-blockout-*.js` IIFEs. Also merges `tools/floor-payloads/*.json` sidecars into the output. Run before serving (`node tools/extract-floors.js`).

### Supporting data files

| File | Purpose |
|---|---|
| `tools/biome-map.json` | 12 biomes — tile palettes, accent tiles, breakable sets, wall heights |
| `tools/tile-schema.json` | 97 tiles — id, name, category, color, walkable/opaque flags |
| `tools/floor-data.json` | Generated — all floor grids + metadata (do not hand-edit) |
| `tools/stamps.json` | Saved stamp library for reuse across floors |
| `tools/floor-payloads/*.json` | Per-floor §3.1 payload sidecars |

### Agent workflow

See `agents.md` at the project root for the recommended multi-pass workflow when an agent creates or modifies floors. The workflow covers World Designer → BO-V/CLI → validate → extract-floors → engine IIFE.

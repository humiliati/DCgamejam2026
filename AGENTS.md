# agents.md — Agent Workflows for Dungeon Gleaner

How an AI agent (or a contributor following agent-style passes) creates new content for the game. This document covers the floor authoring pipeline, the sidequest creation workflow, known gaps, and what tools need to exist before an agent can work end-to-end without human intervention.

Read `CLAUDE.md` first — all contributor conventions apply to agents too.

## Environment

Paths in this document use `<repo-root>` as a placeholder for the game checkout (see `CLAUDE.md` § Environment for the concrete binding and for sibling-repo locations). The CLI surface agents invoke is cataloged in `<repo-root>/docs/CLI_TOOLS.md`; reach for that inventory before inventing a new tool call or assuming something exists.

**Before `git push` on any branch playtesters might pull:** run `bash scripts/stamp-build.sh` (or `just stamp-build` / `dg-stamp-build`) to regenerate `engine/game-build-stamp.js` — this is the string playtesters cite when reporting bugs. See `docs/BUILD_VERSION_POLICY.md` (DOC-129).

---

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

---

## Document Graph (for docs/, not code)

The code-review-graph above indexes code only. For navigating the **docs/**
corpus — especially when picking up a delegated slice of the blockout arc —
use the Mermaid document graph:

- **`docs/DOC_GRAPH_BLOCKOUT_ARC.md`** — visual map centered on
  `BLOCKOUT_REFRESH_PLAN` with five clusters:
  - **Prerequisites** (blue): LIVING_INFRASTRUCTURE_BLOCKOUT, MINIGAME_TILES,
    Biome Plan.html, BLOCKOUT_ALIGNMENT, ACT2_NARRATIVE_OUTLINE, STREET_CHRONICLES
  - **Implementation spec** (green): DOOR_ARCHITECTURE_ROADMAP,
    TRAPDOOR_ARCHITECTURE_ROADMAP, LIVING_WINDOWS_ROADMAP,
    RAYCASTER_EXTRACTION_ROADMAP, SPATIAL_CONTRACTS, PROXY_ZONE_DESIGN,
    WEATHER_MODULE_ROADMAP
  - **Engine files** (purple): raycaster.js + sub-modules, door-sprites.js,
    spatial-contract.js, floor-manager.js, tiles.js, building-registry.js
  - **Downstream** (red): NPC_REFRESH_PLAN, D3_AI_LIVING_INFRA_PROCGEN_AUDIT,
    DEPTH3_CLEANING_LOOP_BALANCE, HERO_FOYER_ENCOUNTER, COZY_INTERIORS_DESIGN,
    FLOOR2_BLOCKOUT_PREP, floor3-crosshair-blockout
  - **Meta** (grey): TEST_HARNESS_ROADMAP, SPATIAL_DEBUG_OVERLAY_VISION,
    PLAYTEST_AND_BLOCKOUT_PROCEDURE, DEBUG_NOTES_SCREENER, TOC, code-review-graph

Edge semantics: solid = prerequisite, dashed = informs, dotted = downstream.
Renders natively in GitHub and VS Code preview.

**Arc-scoped, not corpus-wide.** The full doc index lives in
`docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` (DOC-104 registers the graph).
Archive `DOC_GRAPH_BLOCKOUT_ARC.md` when the arc closes and start a fresh
arc graph for the next cluster (likely NPC refresh → living economy).

### Workflow for delegated blockout work

1. Open `docs/DOC_GRAPH_BLOCKOUT_ARC.md` — orient on where your slice sits.
2. Read the blue cluster docs in order.
3. Pull only the green-cluster spec docs your slice touches.
4. Hit `code-review-graph` (`semantic_search_nodes`, `get_impact_radius`)
   **before** opening any engine file.
5. Implement. Verify via the grey cluster (test harness + playtest procedure).
6. On handoff, flag any red-cluster docs that now need a revision pass.

---

## Floor authoring pipeline (what exists today)

Three tools, one data flow:

```
World Designer  ──§3.1 payload──▶  Blockout Visualizer / CLI  ──IIFE──▶  engine/
       │                                      │
       ▼                                      ▼
  biome-map.json                     floor-data.json (via extract-floors)
  tile-schema.json                   floor-payloads/*.json (sidecar)
```

### World Designer (`tools/world-designer.html`)

Creates the floor spec: floor ID, parent, depth, biome, dimensions, required cells, narrative hints. Loads `biome-map.json` (12 biomes) and `tile-schema.json` (97 tiles). Outputs a §3.1 seed payload to sessionStorage for BO-V consumption.

### Blockout Visualizer (`tools/blockout-visualizer.html`)

Browser tile editor. Consumes §3.1 payloads, renders biome-aware tile picker, enforces pinned-cell locks, required-cells checklist. Saves to `engine/floor-blockout-*.js` IIFEs. Emits payload sidecars to `tools/floor-payloads/`.

### Blockout CLI (`tools/blockout-cli.js`)

Headless Node interface. Same operations as BO-V but scriptable. Key commands grouped:

| Category | Commands |
|---|---|
| Tile mutation | `paint-rect`, `paint-line`, `flood-fill`, `replace` |
| Composite stamps | `stamp-room`, `stamp-corridor`, `stamp-torch-ring`, `stamp-tunnel-corridor`, `stamp-porthole-wall`, `stamp-alcove-flank` |
| Floor lifecycle | `create-floor`, `set-biome`, `set-spawn`, `set-door-target`, `place-entity` |
| Inspection | `render-ascii`, `describe-cell`, `diff-ascii`, `describe` |
| Validation | `validate`, `report-validation` |
| Round-trip | `ingest`, `emit` |
| Help | `help <command>` |

All mutating commands honor `--dry-run`. Run `bo help <command>` for per-command docs.

### Extract-Floors (`tools/extract-floors.js`)

Rebuilds `tools/floor-data.json` from all `engine/floor-blockout-*.js` IIFEs. Merges `tools/floor-payloads/*.json` sidecars. Run before serving or after any blockout change.

---

## Sidequest creation — the 3-5 pass workflow

Goal: an agent creates a new sidequest consisting of a building interior (floorN.N) with a nested dungeon (floorN.N.N), queued from a notice board or mailbox on the parent exterior (floorN). The entire flow should complete in 3-5 CLI/BO-V passes without manual intervention.

### Pass 0 — Spec & scaffold

Read the Biome Plan (`docs/Biome Plan.html`) and narrative outline (`docs/STREET_CHRONICLES_NARRATIVE_OUTLINE.md`) to understand the target biome, faction presence, and narrative hooks. Then:

1. `bo create-floor --id N.N --parent N --biome <biome> --width W --height H`
2. `bo create-floor --id N.N.N --parent N.N --biome <dungeon_biome> --width W --height H`
3. `bo set-spawn` on both floors
4. `bo set-door-target` to wire: parent exterior DOOR → N.N, N.N STAIRS_DN → N.N.N, N.N.N STAIRS_UP → N.N, N.N DOOR_EXIT → N

### Pass 1 — Interior blockout (floorN.N)

Lay out the building interior. Typical structure: entry vestibule, main room(s), stairs down to dungeon, notice board or NPC near the stairs. Use stamps for common patterns:

- `bo stamp-room` for rectangular rooms
- `bo stamp-corridor` for hallways between rooms
- `bo stamp-torch-ring` for atmospheric lighting

Place functional tiles: NOTICE_BOARD (triggers NoticeboardDecor dungeon preview), BONFIRE, CHEST, BOOKSHELF, NPC spawn positions.

### Pass 2 — Dungeon blockout (floorN.N.N)

Lay out the dungeon. Biome stamps for themed corridors:

- `bo stamp-tunnel-corridor` for submarine/mine biomes
- `bo stamp-porthole-wall` for ocean-facing tunnels
- `bo stamp-alcove-flank` for chamber side rooms

Place hazards, breakables, corpses (hero evidence), chests. Ensure STAIRS_UP connects back to N.N.

### Pass 3 — Validation & wiring

1. `bo validate --floor N.N` and `bo validate --floor N.N.N` — fix any structural issues
2. `bo render-ascii --floor N.N` and `bo render-ascii --floor N.N.N` — visual sanity check
3. `bo diff-ascii` — confirm changes are intentional
4. Wire the quest queue on the parent floor (see quest system gap below — this is the blocker)
5. `node tools/extract-floors.js` — rebuild floor-data.json

### Pass 4 (optional) — Polish & narrative

- Place NPC entities with dialogue trees pointing at the quest
- Add environmental storytelling (corpses, broken furniture, scorch marks)
- Tune breakable/chest placement for loot table balance
- Add wall decor entries for atmosphere

### Pass 5 (optional) — Smoke test

- Load the game, navigate to floorN, find the quest hook
- Enter floorN.N, descend to floorN.N.N
- Verify door transitions, spawn positions, enemy populations
- Check NoticeboardDecor renders the dungeon preview correctly

---

## The quest system gap (the obvious blocker)

> **Status note (2026-04-19):** This section was written before `QUEST_SYSTEM_ROADMAP.md` (DOC-107) landed. Phases 0 + 0b + 1 shipped on 2026-04-16 — `QuestRegistry` (Layer 1, loads `data/quests.json`, six anchor resolvers), `QuestChain` (Layer 3, per-quest step progress + current-marker derivation), and the six external event methods (`onItemAcquired`, `onFlagChanged`, `onReadinessChange`, `onFloorArrive`, `onNpcTalk`, `onCombatKill`) are all live. `QuestWaypoint` has been reduced to a ~60-line shim. See `CLAUDE.md` § QuestChain / QuestRegistry / QuestTypes for the current architecture. The "missing" items below should be re-read as **remaining phases** (reputation bar, quest-aware dialogue nodes, noticeboard/mailbox bindings) rather than greenfield work. Treat this section as a historical design brief; defer to `docs/QUEST_SYSTEM_ROADMAP.md` for what's actually outstanding.

The game currently has no declarative quest system. Quest progression is driven by hardcoded logic scattered across multiple modules. This is the single biggest blocker for agent-driven sidequest creation.

### What exists today

**Hardcoded quest flow** — `DispatcherChoreography` (Layer 3.5) owns the tutorial quest: the Dispatcher NPC rushes the player, forces a conversation, hands over work keys, and sets `Player.state().flags.dispatcher_met`. The entire flow is procedural callback chains wired from `Game.js`.

**QuestWaypoint** (Layer 3.5) — Minimap waypoint arrows. Knows how to resolve door positions across floors and point the player toward a target `{floorId, x, y}`. Currently hardwired to the Dispatcher quest target. Has dependency injection for `getDispatcherPhase` and `getDispatcherEntity` but no generic quest registry.

**DungeonSchedule** (Layer 1) — The hero schedule system. Three faction groups (Club/Spade/Diamond) on a 3-day rotation cycle. Side-quest dungeons are explicitly marked as NOT on the hero schedule. This is correct — sidequests should have their own trigger mechanism.

**NoticeboardDecor** (Layer 3.5) — Renders a minimap preview of the dungeon below a NOTICE_BOARD tile. Already blockout-agnostic (scans for STAIRS_DN within BFS radius). This is ready to use as a visual quest hook — the player sees the dungeon map pinned to the board.

**MailboxPeek** (Layer 3) — Report inbox system. Delivers reports from `DungeonSchedule` hero runs to the player's mailbox. Could be extended to deliver quest notices (e.g., "New work order posted for Cellar B2"). Currently only handles `DungeonSchedule` reports.

**NpcSystem** (Layer 3) — Five NPC types (AMBIENT, INTERACTIVE, VENDOR, DISPATCHER, HERO). Interactive NPCs can trigger dialogue trees. Could serve as quest givers if connected to a quest registry.

**NpcDialogueTrees** — Tree-structured dialogue with branching choices. Already supports `onChoice` callbacks and flag-setting. Missing: quest-aware nodes that check/set quest state.

**VerbNodes / DungeonVerbNodes** — Spatial verb field for NPC patrol behavior. Not quest-related but demonstrates the pattern of tile-driven behavior registration.

### What's missing

1. **Quest registry** — A data-driven list of quests with states (available → active → complete → rewarded). No module owns this. Every "quest" is an ad-hoc flag check in Game.js or DispatcherChoreography.

2. **Quest trigger system** — How does a quest become available? Currently: hardcoded checks against day count, player flags, and floor state. Needed: a declarative trigger table (e.g., "available when day >= 3 AND floor 1.3 visited AND flag X not set").

3. **Quest objective tracking** — What does "complete" mean for a sidequest? Currently: readiness percentage (DungeonSchedule/ReadinessCalc) for main dungeons. Sidequests need objective types: "visit tile X on floor Y", "clean N tiles", "collect item Z", "talk to NPC W".

4. **Quest reward dispatch** — What happens on completion? Currently: DungeonSchedule combo multiplier + mailbox report for main dungeons. Sidequests need: gold reward, card unlock, NPC dialogue state change, flag set.

5. **Quest ↔ Notice Board binding** — NoticeboardDecor shows dungeon previews but has no concept of quest state. Needed: notice boards that show "Available" / "In Progress" / "Complete" per quest, with the preview map only appearing when the quest is active.

6. **Quest ↔ Mailbox binding** — MailboxPeek delivers hero run reports. Needed: quest-posted notices ("New work order: Cellar B2 needs clearing") that appear in the mailbox when a quest becomes available.

7. **Quest-aware dialogue nodes** — NpcDialogueTrees supports branching but has no quest-state predicates. Needed: `{type: 'quest_check', questId, state, then, else}` nodes.

8. **Quest data files** — No `data/quests.json` or similar. Quest definitions would need: id, title, description, triggerConditions, objectives, rewards, npcGiver, floorIds, noticeBoard/mailbox config.

### Proposed architecture (sketch)

```
engine/quest-registry.js  (Layer 1)
  - Loads quests.json at init
  - State machine per quest: LOCKED → AVAILABLE → ACTIVE → COMPLETE → REWARDED
  - Event emitter: on('quest:available'), on('quest:complete'), etc.
  - Trigger evaluator: checks conditions each game tick
  - Objective tracker: receives tile-visit / clean / collect / talk events
  - Reward dispatcher: grants gold, cards, flags on completion

data/quests.json
  - Declarative quest definitions
  - Each quest: { id, title, description, triggers, objectives, rewards, hooks }
  - hooks.noticeboard: { floorId, tilePos } — where to show the quest notice
  - hooks.mailbox: { deliverOnAvailable: true, message: "..." }
  - hooks.npcGiver: { npcId, dialogueTree } — NPC that gives/tracks the quest

Wiring (Game.js Layer 4):
  - QuestRegistry.init(questData)
  - QuestRegistry.on('quest:available', fn) → NoticeboardDecor + MailboxPeek
  - QuestRegistry.on('quest:complete', fn) → reward dispatch
  - Player tile-visit events → QuestRegistry.onTileVisit(floorId, x, y)
  - NPC interact → QuestRegistry.onNpcTalk(npcId)
```

This is roughly a half-week build. Without it, every sidequest requires custom procedural wiring in Game.js — which is exactly the "hardcoded directions that keep drifting" problem.

---

## Tool gap analysis — what else agents need

Beyond the quest system, these tools/capabilities are missing for fully autonomous sidequest creation:

### Entity placement CLI

`bo place-entity` exists in help-meta but has limited implementation. Agents need to place NPCs (with type, patrol waypoints, dialogue tree reference) and enemies (with type, level, suit) via CLI. Currently entity data lives in the floor blockout IIFEs but the CLI can only manipulate the tile grid.

### Dialogue tree authoring

No tool for creating dialogue trees. `engine/npc-dialogue-trees.js` loads tree definitions but they're hardcoded per NPC. Needed: a `data/dialogue/*.json` format that agents can write, and a CLI command (`bo create-dialogue --npc <id> --tree <path>`) or at minimum a documented JSON schema.

### Loot table / item placement

`LootTables` and `WorldItems` handle item drops but configuration is in-code. Agents need a way to specify per-floor loot biases (e.g., "this dungeon drops more Crystal cards") without editing engine files.

### Readiness target configuration

`ReadinessCalc` computes floor readiness but target thresholds are in `DungeonSchedule.JAM_CONTRACTS`. Sidequests need their own readiness targets. This ties into the quest registry — each quest's objectives should define what "done" means.

### `bo validate` expanded rules (Track C, Slice C6 — done)

Three new validation rules landed in both browser and CLI:

- `door-no-target` (warn) — every door/stair tile needs a `doorTargets` entry
- `room-has-walls` (warn) — room rectangles should not contain WALL tiles
- `offset-no-height` (info, browser only) — tiles with `tileHeightOffsets` should have `tileWallHeights`

These catch structural errors that previously required manual inspection or in-browser testing.

### Smoke test automation

Pass 5 (smoke test) currently requires a human in the browser. Needed: a headless validation that loads the floor, checks door transitions resolve, spawn is reachable, and basic pathfinding works. This could be a Node script using the existing `FloorManager` + `Pathfind` modules in a VM sandbox (same pattern as `extract-floors.js`).

---

## Track C status (BO-V agent feedback closeouts)

From `tools/BO-V agent feedback.md` — field report from Floor 3.1.1 blockout identifying 5 blockers for agent-driven work.

| Slice | Description | Status |
|---|---|---|
| C1 | `--dry-run` for all mutating commands | Done |
| C2 | IIFE round-trip (`bo ingest` / `bo emit`) | Done (smoke test deferred to user terminal) |
| C3 | `bo help <command>` per-command docs | Done |
| C4 | Biome-specific stamps (tunnel, porthole, alcove) | Done (composability smoke test deferred) |
| C5 | IIFE-aware `render-ascii` | Done |
| C6 | `bo validate` expanded rules | Done |

Deferred smoke tests (C2 round-trip, C4 composability) are blocked by the bindfs mount stale-sync issue in the Cowork sandbox. They should pass when run from a real terminal.

---

## Recommended reading order for new agents

1. `CLAUDE.md` — contributor conventions, module architecture, hard rules, environment preamble
2. `docs/CLI_TOOLS.md` — every CLI the project ships (serve, extract, authoring, validate, smoke, deploy, MCP graphs)
3. `docs/Biome Plan.html` — world structure, biome palettes, enemy populations
4. `docs/STREET_CHRONICLES_NARRATIVE_OUTLINE.md` — factions, conspiracy, NPC roster
5. `tools/short-roadmap.md` — current track status, what's shipped, what's pending
6. This file (`agents.md`) — agent workflow, tool gaps, quest system design
7. `node <repo-root>/tools/blockout-cli.js help` — live command index from the authoring CLI itself
8. `docs/DOC_GRAPH_BLOCKOUT_ARC.md` — document dependency graph for the blockout arc (use this to partition delegated work across parallel Cowork sessions)
9. `docs/QUEST_SYSTEM_ROADMAP.md` — current quest-system phase status (supersedes the "quest system gap" section above)

For code navigation, use the code-review-graph MCP tools before Grep/Glob/Read (see CLAUDE.md § MCP Tools).

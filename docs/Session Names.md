Proposed multi-session Cowork fan-out
Drawn from docs/DOC_GRAPH_BLOCKOUT_ARC.md green-cluster spec slices, paired to minimize engine-file contention. Each session below is a self-contained brief — dispatch one Cowork session per row.
Session Alpha — Doors + Trapdoors (pair; both touch the same engine files)

Spec: DOOR_ARCHITECTURE_ROADMAP.md (DOC-88, Phase 3 stamp-out), TRAPDOOR_ARCHITECTURE_ROADMAP.md (DOC-89, Tiers 6–8).
Prereqs: Biome Plan.html, BLOCKOUT_ALIGNMENT.md, MINIGAME_TILES.md.
Engine files: engine/raycaster.js, engine/door-sprites.js, engine/floor-manager.js, engine/tiles.js.
Verification: TEST_HARNESS_ROADMAP.md, PLAYTEST_AND_BLOCKOUT_PROCEDURE.md; bo validate + node tests/test-dungeon-schedule.js.
Coordination: conflicts with Charlie on raycaster.js — serialize or coordinate column-owning ranges.

Session Bravo — Spatial Contracts + Proxy Zone (pair; both touch spatial-contract.js)

Spec: SPATIAL_CONTRACTS (referenced; confirm whether it's inlined in another doc — if not, this session may need to author one), PROXY_ZONE_DESIGN.md (DOC-93, design-only).
Prereqs: LIVING_INFRASTRUCTURE_BLOCKOUT.md, Biome Plan.html.
Engine files: engine/spatial-contract.js, engine/floor-manager.js.
Runs parallel with Alpha (no file overlap).

Session Charlie — Raycaster extraction finalization

Spec: RAYCASTER_EXTRACTION_ROADMAP.md (DOC-91). Phase 4 is gated on ≤2% framerate regression per CLAUDE.md — defer until after voting closes unless profiling is ready.
Engine files: engine/raycaster.js + 6 raycaster-*.js sub-modules.
Coordination: owns raycaster.js hotpath — Alpha and Charlie must not run concurrently without a merge discipline.
Verification: test-harness.html with DebugPerfMonitor (DOC-96 Phase 0).

Session Delta — Living Windows + Weather (pair; largely independent)

Spec: LIVING_WINDOWS_ROADMAP.md (DOC-92, Phase 6 EmojiMount port), WEATHER_MODULE_ROADMAP.md (DOC-101, planning).
Prereqs: Biome Plan.html.
Engine files: engine/tiles.js (LWR); WMR is mostly exterior depth-1 additions — expect new files rather than heavy edits.
Runs parallel with Alpha, Bravo, Charlie.

Session Echo — Test harness + debug overlay + playtest procedure (meta / verification)

Spec: TEST_HARNESS_ROADMAP.md, SPATIAL_DEBUG_OVERLAY_VISION.md, PLAYTEST_AND_BLOCKOUT_PROCEDURE.md, DEBUG_NOTES_SCREENER.md.
No engine-file ownership — this session builds the verification harness the others will call.
Runs parallel with everything.

Coordination rules

Alpha ↔ Charlie must serialize on engine/raycaster.js. Let Alpha land first (door/trapdoor stamp-out) then run Charlie's Phase 4 extraction on a known-good base.
Each session should hit code-review-graph MCP (semantic_search_nodes, get_impact_radius) before editing any engine file.
Every session handoff flags downstream (red-cluster) docs that need a revision pass: NPC_REFRESH_PLAN, D3_AI_LIVING_INFRA_PROCGEN_AUDIT, DEPTH3_CLEANING_LOOP_BALANCE, HERO_FOYER_ENCOUNTER, COZY_INTERIORS_DESIGN, FLOOR2_BLOCKOUT_PREP, floor3-crosshair-blockout.
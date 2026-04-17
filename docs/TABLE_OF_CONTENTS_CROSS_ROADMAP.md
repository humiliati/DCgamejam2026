# Dungeon Gleaner - Cross-Roadmap Execution Order

**Created**: 2026-03-28 | **Updated**: 2026-04-17
**Status**: Post-jam - PW-1 through PW-5 complete, core design/implementation docs indexed, DOC-107 Phases 0 + 0b + 1 + 2 + 3 + 4 + 5 + 5b + 6 shipped, **stale roadmap triage complete** (20+ orphaned docs absorbed into DOC-105 waves)
**Goal**: Polish, post-jam vision execution, LG webOS deployment readiness

---

## Quick Reference - All Documents

Active and in-progress docs float to the top. Each entry links to its detailed section below.
Brainstorming and publishing-only docs are intentionally excluded from this index.

### Active - Jam Sprint (Apr 2-5)

| # | Document | Status | Folder |
|---|----------|--------|--------|
| DOC-82 | [POST_JAM_EXECUTION_ORDER.md](#doc-82-post_jam_execution_ordermd) | ðŸ”´ Active â€” P1–P5 complete (closed ledger) — DOC-105 is the active execution plan | docs/ |
| DOC-32 | [UNIFIED_EXECUTION_ORDER.md (v3)](#doc-32-unified_execution_ordermd-v3) | ðŸŸ¢ Sprint 0 âœ…, Tracks A/B/PW âœ… (superseded by DOC-82; archive candidate — see DOC-105 Appendix A) | docs/ |
| DOC-1 | [GAP_COVERAGE_TO_DEPLOYABILITY.md](#doc-1-gap_coverage_to_deployabilitymd) | ðŸŸ¡ T0 âœ…, T1 4/6, T2 0/6 — T2 → DOC-105 Wave 5 | docs/ |
| DOC-3 | [GONE_ROGUE_ASSET_UTILIZATION_ROADMAP.md](#doc-3-gone_rogue_asset_utilization_roadmapmd) | ðŸŸ¢ Pass 1â€“3 âœ…, Pass 4 post-jam | docs/ |
| DOC-17 | [SKYBOX_ROADMAP.md (v2)](#doc-17-skybox_roadmapmd-v2) | ðŸŸ¢ Ph 1â€“4 âœ…, Ph 5 after F3 blockout | docs/ |
| DOC-33 | [GAP_ANALYSIS.md](#doc-33-gap_analysismd) | ðŸŸ¡ Living audit — needs refresh pass → DOC-105 Wave 5 | docs/ |
| DOC-35 | [DEBUG_NOTES_SCREENER.md](#doc-35-debug_notes_screenermd) | ðŸŸ¡ Living checklist | docs/ |
| DOC-29 | [hud-ui-debugging-notes.md](#doc-29-hud-ui-debugging-notesmd) | ðŸŸ¡ Living debug log | docs/ |
| DOC-53 | [PLAYTEST_AND_BLOCKOUT_PROCEDURE.md](#doc-53-playtest_and_blockout_proceduremd) | ðŸŸ¢ Blockout order + playtest cycle + tester guide | docs/ |
| DOC-54 | [INTERACTIVE_OBJECTS_AUDIT.md](#doc-54-interactive_objects_auditmd) | ðŸŸ¢ Tile-by-tile render/interact audit, biome override bug, bonfire menu trap | docs/ |
| DOC-86 | [LEGACY_ROADMAP_CRITICAL_PATH.md](#doc-86-legacy_roadmap_critical_pathmd) | Active - canonical critical path for legacy roadmap triage + missing dependency closure (tiles/textures/contracts) | docs/ |

| DOC-66 | [quest-marker-audit.md](#doc-66-quest-marker-auditmd) | Active - quest marker regression audit + patch history + rework spec | docs/ |

### Design Bibles And Core Loop

| # | Document | Folder |
|---|----------|--------|
| DOC-4 | [Biome Plan.html](#doc-4-biome-planhtml) | docs/ |
| DOC-7 | [CORE_GAME_LOOP_AND_JUICE.md](#doc-7-core_game_loop_and_juicemd) | docs/ |
| DOC-2 | [TUTORIAL_WORLD_ROADMAP.md](#doc-2-tutorial_world_roadmapmd) | docs/ |
| DOC-13 | [STREET_CHRONICLES_NARRATIVE_OUTLINE.md](#doc-13-street_chronicles_narrative_outlinemd) | docs/ |
| DOC-8 | [VISUAL_OVERHAUL.md](#doc-8-visual_overhaulmd) | docs/ |
| DOC-34 | [UNIFIED_UI_OVERHAUL.md](#doc-34-unified_ui_overhaulmd) | docs/ |
| DOC-27 | [JAM_COMPLIANCE.md](#doc-27-jam_compliancemd) | docs/ |
| DOC-56 | [RESOURCE_DESIGN.md](#doc-56-resource_designmd) | docs/ |
| DOC-74 | [ACT2_NARRATIVE_OUTLINE.md](#doc-74-act2_narrative_outlinemd) | docs/ |
| DOC-75 | [HERO_FOYER_ENCOUNTER.md](#doc-75-hero_foyer_encountermd) | docs/ |
| DOC-76 | [gameover.md](#doc-76-gameovermd) | docs/ |
| DOC-113 | [SPRINT_DUNGEON_DESIGN.md](#doc-113-sprint_dungeon_designmd) — Sprint dungeon / hero approach timer design. Fourth dungeon archetype (`fetch` strategy): timed maze navigation, hero sentinel→pursuit on timer expiry, act-based hero scaling (impractical Acts 1–2, viable Act 3), secondary exits, cobweb escape barriers. Procgen `fetch` topology (tree-structured BSP, zero extra connections, dead-end decoys). Recipe schema additions (`timer`, `decoyCount`, `secondaryExit`). Quest integration via `kind:"fetch"` step + `onTimerExpired` 9th event entry point. Depends on DOC-107, DOC-75, DOC-74, DOC-13, DOC-31b. **Phase A shipped** (recipe schema `fetch` strategy + `timer` + `decoyCount` + `secondaryExit` + `_applyFetchStrategy` decorator in `procgen.js` with tree-topology BSP, BFS-based objective placement at farthest leaf, secondary exit in non-critical-path leaf, dead-end branch stubs with decoy containers + `sprint-cellar.json` starter recipe); **Phase B shipped** (`QuestTypes.WAYPOINT_KIND.FETCH` enum + `kind:'fetch'` predicate in `QuestChain._matches` with itemId + optional floorId gate + `onItemAcquired` dual fan-out to `kind:'item'` + `kind:'fetch'` events + 2 sprint sidequests in `data/quests.json`: `side.1.3.1.cellar_fetch` npc→fetch ITM-042 75s seeker→npc, `side.2.2.1.wake_dispatch` npc→fetch ITM-061 90s crusader→npc + 20 i18n keys: per-quest title/hook/summary/step labels + timer UI chrome + act-flavored hero spawn toasts); **Phase C-engine shipped** (`_timer` state + `_computeZone` zone classifier + `_startTimer`/`_cancelTimer`/`_tickTimerInternal` with 6-system pause contract + `tickTimer`/`getActiveTimer`/`onTimerExpired` public API in frozen exports + advance() auto-start on fetch step + complete/fail/expire auto-cancel + onFloorArrive floor-leave cancel + Game.js `_renderGameplay` per-frame `tickTimer(frameDt)` call + 5 timer events: start/tick/zone/expired/cancel + 28/28 unit assertions pass); **Phase C-UI shipped 2026-04-17** (DebriefFeed `showTimer`/`updateTimer`/`hideTimer`/`getTimerState` + `_renderTimerRow` rendering above the DOC-109 category wrapper + zone-color CSS `.df-timer-zone-{green,yellow,red,expired}` + `@keyframes df-timer-pulse`/`throb`/`paused-blink`/`shatter` + `.df-timer-paused` override + expired-state DOM swap with hero-name fallback per archetype + Game.init QuestChain→DebriefFeed event wiring on all five timer events + `Math.ceil(ms/1000)` mm:ss format + `tools/_sprint-timer-cache/verify-timer.js` 84/84 green across 5 groups (G1 state 32 / G2 zone 12 / G3 format 16 / G4 expired 15 / G5 paused 9), DOC-109 Phase 0+1+2 regressions re-run clean 120/120, handoff contract satisfied unchanged; see `SPRINT_TIMER_UI_HANDOFF.md` Closure Summary); Phases D–E (hero pursuit, polish) pending. | docs/ |
| DOC-107 | [QUEST_SYSTEM_ROADMAP.md](#doc-107-quest_system_roadmapmd) — Post-jam canonical quest system: QuestChain + QuestRegistry + ReputationBar (WoW-style faction/NPC standing) + Journal re-wire + settings toggles. Supersedes DOC-66 §6 post-jam spec. **Phases 0 + 0b + 1 + 2 + 3 + 4 + 5 + 5b + 6 shipped 2026-04-17** — QuestTypes/QuestRegistry/QuestChain live; QuestWaypoint reduced to cursor-fx shim; 3 named anchors in `quests.json`; Minimap pull-based marker wired; agent-facing CLI (`add-quest`/`place-waypoint`/`validate-quest`) + sidecar merge shipped; Journal UI rewired with `QuestChain.getJournalEntries()` + nav-hint i18n + completed-quests BOOKS pane; Face-3 Settings Quest subsection with 4 toggles (markers / hint verbosity / waypoint flair / sidequest opt-in) persisted to `localStorage['gleaner_settings_v1']` via `QuestChain.setUIPrefs()` + 90s Subtle idle gate in `getCurrentMarker()` + `_filterIdsByOptIn()` sidequest suppression, 10/10 Node harness assertions pass; Phase 5 Minigame sidequest adapter shipped — `QuestChain.onMinigameExit(kindId, reason, payload)` 7th event entry point + `kind:'minigame'` predicate (kindId/reason/subTargetId/floorId filters) + count-gated advance with partial waypoint events + `PickupActions.onMinigameExit` fan-out layer + SpraySystem tile-clean callback + `side.1.3.1.pentagram_wash` demo sidequest (count:3), 37/37 Node contract-harness assertions pass; Phase 3 Reputation bars shipped — `QuestTypes.WAYPOINT_KIND.REPUTATION_TIER` enum + `QuestChain.onReputationTierCross(factionId, fromTier, toTier)` 8th event entry point + `kind:'reputation-tier'` predicate (factionId + toTier exact match + optional direction gate `'up'`/`'down'`/`'any'`, default up) + `DebriefFeed` faction-row API (expand/collapse/updateFaction) with reveal/bump/tier-cross keyframe juice + `DispatcherChoreography.init({onComplete})` first-time hook bumping BPRD by +100 favor and auto-expanding the debrief row + full Game.init fan-out wiring + four faction × six tier i18n keys in `data/strings/en.js`, 47/47 Node contract-harness assertions pass; Phase 5b sidequest content batch shipped (data-only) — expanded `data/quests.json` from 1 demo to 4 sidequests (`side.1.2.innkeeper_bottles` npc→floor→combat ENM-003 ×3→npc branch, `side.1.3.cellar_owner_mop` npc→item ITM-089→readiness, `side.2.2.watchman_roll_call` npc→floor→floor→flag heroWakeArrival with prereq gateUnlocked=true) stretching the remaining non-minigame predicate surface (npc / floor / item / combat / readiness / flag / prereq), 21 new i18n keys under `quest.sidequest.*`, grounded in real NPC / enemy / item ids so predicates match live events the moment the pending `onNpcTalk` / `onCombatKill` / generic `onItemAcquired` fan-outs land; 88/88 Node harness assertions pass across 5 groups (structural, per-quest, i18n coverage, event-stream simulation, cross-quest isolation); Phase 6 distributed floor-sidecar anchors shipped — `tools/floor-payloads/*.quest.json` sidecar schema (`{version, floorId, quests[], anchors{}}`) + `tools/extract-floors.js` emits slim runtime `data/quest-sidecars.js` (`window.QUEST_SIDECARS = {anchors, anchorSources, floorQuests, anchorCount, collisionCount, generated}`) loaded at Layer 0 before QuestRegistry + FloorManager `getDistributedAnchors()`/`getDistributedAnchorSources()`/`getQuestAnchors()` read-through hooks + `QuestRegistry.init(payload, floorAnchors, distributedAnchors)` third-param union with source tagging (`'central'`/`'distributed'`), collision-logging (`anchor-collision` with central-wins policy), malformed-spec rejection (`anchor-malformed`), and fail-fast `_validateQuestAnchors()` walking every quest step's `target.anchor` + `advanceWhen.anchor` surfacing `unresolved-anchor` errors + `init()` returning false when `_initErrors[]` non-empty, new exports `getAnchorSource`/`listCentralAnchors`/`listDistributedAnchors`/`getInitErrors` + `summary()` exposes `centralAnchorCount`/`distributedAnchorCount`/`initErrorCount`, two Act 1 test anchors migrated (`pentagram_chamber` on floor 1.3.1, `home_work_keys_chest` on floor 1.6), 62/62 Node fresh-inode harness assertions pass across 4 groups (sidecar emission, JSON shape + cross-sidecar collision, registry union + source tagging + resolveAnchor, fail-fast error surfacing). Phase 7 (Act-2 content load-in) pending. | docs/ |

### Engine And Renderer Roadmaps

| # | Document | Folder |
|---|----------|--------|
| DOC-18 | [NLAYER_RAYCASTER_ROADMAP.md](#doc-18-nlayer_raycaster_roadmapmd) | docs/ |
| DOC-14 | [TEXTURE_ROADMAP.md](#doc-14-texture_roadmapmd) | docs/ |
| DOC-31a | [LIGHT_AND_TORCH_ROADMAP.md](#doc-31-light_and_torch_roadmapmd) | docs/ |
| DOC-38 | [PLAYER_CONTROLLER_ROADMAP.md](#doc-38-player_controller_roadmapmd) | docs/ |
| DOC-37 | [INPUT_CONTROLLER_ROADMAP.md](#doc-37-input_controller_roadmapmd) | docs/ |
| DOC-54 | [INTERACTIVE_OBJECTS_AUDIT.md](#doc-54-interactive_objects_auditmd) | docs/ |
| DOC-19 | [DOOR_EFFECTS_ROADMAP.md](#doc-19-door_effects_roadmapmd) | docs/ |
| DOC-72 | [GAME_JS_EXTRACTION_ROADMAP.md](#doc-72-game_js_extraction_roadmapmd) | docs/ |
| DOC-73 | [ARCHITECTURAL_SHAPES_ROADMAP.md](#doc-73-architectural_shapes_roadmapmd) | docs/ |
| DOC-87 | [RAYCAST_FREEFORM_UPGRADE_ROADMAP.md](#doc-87-raycast_freeform_upgrade_roadmapmd) — freeform wall blocks (hearth sandwich, civilized bonfire + pergola moat, arches, portholes) modelled on raycast.js-master reference | docs/ |
| DOC-88 | [DOOR_ARCHITECTURE_ROADMAP.md](#doc-88-door_architecture_roadmapmd) — Phase 0–2 + 5A + 6A/6B shipped (DOOR_FACADE, trapdoors, double doors, great arches); Phase 3 stamp-out unblocked | docs/ |
| DOC-89 | [TRAPDOOR_ARCHITECTURE_ROADMAP.md](#doc-89-trapdoor_architecture_roadmapmd) — Tiers 1–5 shipped (first pass), Tiers 6–8 specced; TRAPDOOR_DN/UP freeform + ladder shaft filler | docs/ |
| DOC-91 | [RAYCASTER_EXTRACTION_ROADMAP.md](#doc-91-raycaster_extraction_roadmapmd) — Phases 1–3 complete (raycaster split from 4,729 → 2,758 lines across 7 IIFEs); Phase 4 deferred post-Jam | docs/ |
| DOC-92 | [LIVING_WINDOWS_ROADMAP.md](#doc-92-living_windows_roadmapmd) — Phase 0–2.5 shipped (SHOP/BAY/SLIT/ALCOVE/COMMERCIAL + corner bitmask); Phase 6 EmojiMount port next | docs/ |
| DOC-93 | [PROXY_ZONE_DESIGN.md](#doc-93-proxy_zone_designmd) — Phase 12 of LIVING_WINDOWS: interior windows looking out onto pasted exterior slices (design only) | docs/ |
| DOC-94 | [SPATIAL_DEBUG_OVERLAY_VISION.md](#doc-94-spatial_debug_overlay_visionmd) — vision doc for world-space debug overlay (tile geometry, raycast trace, contributor comms) | docs/ |
| DOC-95 | [MINIGAME_TILES.md](#doc-95-minigame_tilesmd) — tile-by-tile clicky-minigame survey (WELL, BAR_COUNTER, etc.) for §11.1/§15 living-infra tiles | docs/ |
| DOC-96 | [TEST_HARNESS_ROADMAP.md](#doc-96-test_harness_roadmapmd) — Phase 0 shipped: DebugPerfMonitor (FPS, frame time, stutter log, subsystem probes) via test-harness.html | docs/ |
| DOC-101 | [WEATHER_MODULE_ROADMAP.md](#doc-101-weather_module_roadmapmd) — Planning: per-floor weather system (haze/rain/wind/debris) at configurable Z-depth in 3D viewport, punch-through terminus | docs/ |
| DOC-104 | [DOC_GRAPH_BLOCKOUT_ARC.md](#doc-104-doc_graph_blockout_arcmd) — Mermaid document graph for the blockout refresh arc: prereqs → spec → engine files → downstream consumers; reading order for delegated engineers | docs/ |
| DOC-105 | [POST_JAM_FOLLOWUP_ROADMAP.md](#doc-105-post_jam_followup_roadmapmd) — **Active execution plan.** Consolidates deferred items from DOC-62/82/86/17/19/48/88/89/91/92 + legacy carryovers + **20+ stale roadmaps triaged 2026-04-17** into 6 ordered waves aligned with Blockout → NPC → Living Shops arc. See Appendix A for full triage ledger. | docs/ |
| DOC-106 | [RAYCASTER_PAUSE_RESUME_ADR.md](#doc-106-raycaster_pause_resume_adrmd) — ADR for Raycaster.pause()/resume()/isPaused()/getPausedFrame() API; blocks `viewportMode: 'takeover'` minigames (MINIGAME_ROADMAP §4.6); ~150 LOC across 4 files | docs/ |
| DOC-108 | [TRACK_GRAPH_TERMINUS.md](#doc-108-track_graph_terminusmd) — **Delegation track graph through project terminus.** Six tracks (World, Renderer, NPC/Narrative, Economy, Platform, Tooling) with Mermaid dependency graph, roadmap sets per node, cross-track interfaces, critical path analysis, milestone timeline through Winter 2026 LG ship. GDD five-pillar anchor. Complements DOC-105 (wave sequencing) and DOC-104 (arc reading graph). | docs/ |
| DOC-109 | [DEBRIEF_FEED_CATEGORIES_ROADMAP.md](#doc-109-debrief_feed_categories_roadmapmd) — **HUD debrief-feed category wrapper (Roadmap A).** Two expandable categories (Readiness, Relationships) collapsing 3 dungeon readiness bars + 4 factions + N NPCs into EyesOnly-style rows where most-recently-updated subject stays visible when collapsed and expansion auto-retracts on new activity. Extends ReputationBar with `subject:id` namespacing for NPC favor, adds ReadinessCalc event bus, migrates existing per-faction `expanded` flags. **Phases 0 + 1 + 2 shipped 2026-04-17** — Phase 0: ReputationBar subject-kind namespace (`faction:id`/`npc:id`), 51/51 harness green, Function.length-based 3-arg back-compat. Phase 1: ReadinessCalc event bus (`on`/`off`/`markDirty`/`getGroupScore`/`invalidate`, microtask-debounced via `Promise.resolve().then`, DungeonSchedule group aggregation), 32/32 harness green, **including core-feeder callsite wiring** — `_markDirty(floorId)` installed in all 5 CORE_FEEDERS (cleaning-system, torch-state, trap-rearm, cobweb-system, crate-system) at every state-mutation site plus `invalidate()` on global `reset()`/`clearAll()`. Secondary feeders (breakable-spawner, spray-system, corpse-actions, torch-ring) deferred to Phase 3 audit. Phase 2: DebriefFeed `_categories` wrapper scaffold — readiness + relationships categories with `revealCategory`/`expandCategory`/`collapseCategory`/`toggleCategory`/`updateReadiness`/`updateRelationship` public surface; faction rows migrated under `'faction:<id>'` row-ID namespace; legacy `expandFaction`/`collapseFaction`/`updateFaction`/`getFactionState` delegate through `_categories.relationships`; 37/37 harness green (G1: 11, G2: 6, G3: 6, G4: 9, G5: 5) via `verify-phase2-final.js` fresh-inode mirror pattern. Phases 3–7 still scoped. Companion doc Roadmap B = future DOC-114 JOURNAL_V2 pause-menu detail views. | docs/ |

### Card, Inventory And Combat

| # | Document | Folder | Exec Slot |
|---|----------|--------|-----------|
| DOC-46 | [INVENTORY_CARD_MENU_REWORK.md](#doc-46-inventory_card_menu_reworkmd) | docs/ | — |
| DOC-45 | [INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md](#doc-45-inventory_system_audit_and_roadmapmd) | docs/ | ✅ Resolved Apr 1 — archive candidate |
| DOC-26 | [UNIFIED_INVENTORY_METADATA_CONTRACT.md](#doc-26-unified_inventory_metadata_contractmd) | docs/ | — |
| DOC-24 | [B5_INVENTORY_INTERACTION_DESIGN.md](#doc-24-b5_inventory_interaction_designmd) | docs/ | — |
| DOC-25 | [B6_SLOT_WHEEL_AND_TRANSACTION_LAYOUT.md](#doc-25-b6_slot_wheel_and_transaction_layoutmd) | docs/ | — |
| DOC-36 | [FACE2_INVENTORY_POLISH.md](#doc-36-face2_inventory_polishmd) | docs/ | — |
| DOC-20 | [COMBAT_DRAG_SYSTEM.md](#doc-20-combat_drag_systemmd) | docs/ | — |
| DOC-16 | [SUIT_SYSTEM_ROADMAP.md](#doc-16-suit_system_roadmapmd) | docs/ | 8/12 passes — remaining → DOC-105 Wave 4 |
| DOC-57 | [CRATEUI_INTERACTION_OVERHAUL.md](#doc-57-crateui_interaction_overhaulmd) | docs/ | → DOC-105 Wave 4 |

### HUD, UI And Menus

| # | Document | Folder | Status |
|---|----------|--------|--------|
| DOC-22 | [HUD_ROADMAP.md](#doc-22-hud_roadmapmd) | docs/ | → DOC-105 Wave 6 |
| DOC-23 | [UI_ROADMAP.md](#doc-23-ui_roadmapmd) | docs/ | → DOC-105 Wave 6 |
| DOC-21 | [GAME_FLOW_ROADMAP.md](#doc-21-game_flow_roadmapmd) | docs/ | → DOC-105 Wave 6 |
| DOC-32b | [TOOLTIP_BARK_ROADMAP.md](#doc-32-tooltip_bark_roadmapmd) | docs/ | → DOC-105 Wave 3 |
| DOC-12 | [PEEK_SYSTEM_ROADMAP.md](#doc-12-peek_system_roadmapmd) | docs/ | → DOC-105 Wave 6 |
| DOC-51 | [CINEMATIC_CAMERA_ROADMAP](#doc-51-cinematic-camera) | engine/cinematic-camera.js | Engine built, 3/7 presets wired |
| DOC-55 | [MENU_INTERACTIONS_CATALOG.md](#doc-55-menu_interactions_catalogmd) | docs/ | Active |
| DOC-29 | [hud-ui-debugging-notes.md](#doc-29-hud-ui-debugging-notesmd) | docs/ | Reference |
| DOC-58 | [PEEK_BOX_VISUAL_AUDIT.md](#doc-58-peek_box_visual_auditmd) | docs/ | â€” |
| DOC-77 | [BOX_EDITOR_PRODUCT_ROADMAP.md](#doc-77-box_editor_product_roadmapmd) | docs/ | â€” |
| DOC-78 | [PEEK_WORKBENCH_SCOPE.md](#doc-78-peek_workbench_scopemd) | docs/ | â€” |
| DOC-98 | [BOXFORGE_AUDIT.md](#doc-98-boxforge_auditmd) | docs/ | Audit of tools/peek-workbench.html (7,074 lines) — color selectors, sidebar wiring, export pipeline |
| DOC-99 | [BOXFORGE_NEXT_STEPS.md](#doc-99-boxforge_next_stepsmd) | docs/ | Enhancement plan — peek system support (orbs, phases, sub-attachments, templates) |
| DOC-100 | [BOXFORGE_TOOLS_ROADMAP.md](#doc-100-boxforge_tools_roadmapmd) | docs/ | Active — items 1–5 complete, 6–8 in planning; tools/peek-workbench.html ↔ tools/boxforge.html |
| DOC-112 | [BOXFORGE_PEEK_COVERAGE_MATRIX.md](BOXFORGE_PEEK_COVERAGE_MATRIX.md) | docs/ | Canonical tile × peek × stamp inventory. 97 tiles mapped to 12 stamp slots (7 primitive + 5 wired archetypes); 30 unwired tiles queued across 8 stamps. Drives `BOXFORGE_AGENT_ROADMAP` Phase 5 (stamp authoring order) + Phase 5.0 schema widen (6 new tiles for the trap family: TRAP_PRESSURE_PLATE 97, TRAP_DART_LAUNCHER 98, TRAP_TRIPWIRE 99, TRAP_SPIKE_PIT 100, TRAP_TELEPORT_DISC 101, COBWEB 102). |

### Gleaner Systems (Cleaning, Restocking, Traps)

| # | Document | Folder | Exec Slot |
|---|----------|--------|-----------|
| DOC-48 | [PRESSURE_WASHING_ROADMAP.md](#doc-48-pressure_washing_roadmapmd) | docs/ | PW-1–5 ✅; gauge → Wave 2, gyro → Wave 5 |
| DOC-67 | [PRESSURE_WASH_SYSTEM.md](#doc-67-pressure_wash_systemmd) | docs/ | — |
| DOC-31b | [COBWEB_TRAP_STRATEGY_ROADMAP.md](#doc-31-cobweb_trap_strategy_roadmapmd) | docs/ | Ph 1–2 ✅; Ph 3/5–7 → Wave 1 |
| DOC-30 | [BONFIRE_POLISH_STEPS.md](#doc-30-bonfire_polish_stepsmd) | docs/ | Warp threshold → Wave 2 (DOC-52 dep) |
| DOC-39 | [SHOP_REFRESH_ECONOMY.md](#doc-39-shop_refresh_economymd) | docs/ | → Wave 4 (shop refresh spec) |
| DOC-52 | [READINESS_BAR_ROADMAP.md](#doc-52-readiness_bar_roadmapmd) | docs/ | → Wave 2 (constellation FX + reporting) |
| DOC-59 | [DEPTH3_CLEANING_LOOP_BALANCE.md](#doc-59-depth3_cleaning_loop_balancemd) | docs/ | → Wave 3 (D3-specific tuning) |
| DOC-68 | [CHEST_RESTOCK_AND_WORK_ORDERS.md](#doc-68-chest_restock_and_work_ordersmd) | docs/ | — |
| DOC-69 | [RESTOCK_AUDIT.md](#doc-69-restock_auditmd) | docs/ | RS-1–5 ✅; reference only |
| DOC-70 | [UNIFIED_RESTOCK_SURFACE_ROADMAP.md](#doc-70-unified_restock_surface_roadmapmd) | docs/ | — |
| DOC-71 | [SPATIAL_CONTRACTS.md](#doc-71-spatial_contractsmd) | docs/ | — |
| DOC-97 | [FATIGUE_SYSTEM_ROADMAP.md](#doc-97-fatigue_system_roadmapmd) | docs/ | → Wave 6 (deferred polish) |

### NPCs, Barks And Audio

| # | Document | Folder | Exec Slot |
|---|----------|--------|-----------|
| DOC-9 | [NPC_SYSTEM_ROADMAP.md](#doc-9-npc_system_roadmapmd) | docs/ | → Wave 3 (NPC Refresh spec source) |
| DOC-11 | [NPC_FACTION_BOOK_AUDIT.md](#doc-11-npc_faction_book_auditmd) | docs/ | — |
| DOC-10 | [COZY_INTERIORS_DESIGN.md](#doc-10-cozy_interiors_designmd) | docs/ | — |
| DOC-6 | [AUDIO_ENGINE.md](#doc-6-audio_enginemd) | docs/ | — |
| DOC-50 | [SPATIAL_AUDIO_BARK_ROADMAP.md](#doc-50-spatial_audio_bark_roadmapmd) | docs/ | → Wave 5 (stereo panning → Phase G) |
| DOC-44 | [EYESONLYS_TOOLTIP_SPACE_CANON.md](#doc-44-eyesonlys_tooltip_space_canonmd) | docs/ |
| DOC-60 | [AUDIO_SFX_COMMISSIONING_AUDIT.docx](#doc-60-audio_sfx_commissioning_auditdocx) | docs/ |
| DOC-81 | [AUDIO_COMMISSIONING.md](#doc-81-audio_commissioningmd) | EyesOnly/docs/ |
| DOC-83 | [VERB_FIELD_NPC_ROADMAP.md](#doc-83-verb_field_npc_roadmapmd) â€” v1.3: +tile catalog, +cross-floor, +reanimated verbs, +living infra, +reanim tiers | docs/ |
| DOC-84 | [LIVING_INFRASTRUCTURE_BLOCKOUT.md](#doc-84-living_infrastructure_blockoutmd) â€” v1.3: tiles 40-59, trap/cobweb/creature verbs, anti-mush invariants, corpse recovery loop, faction relations (trust/heat/debt), NPC memory morphing, economy buildings (Clinic, Morgue, Union Hall, Chop Room) | docs/ |
| DOC-85 | [D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md](#doc-85-d3_ai_living_infra_procgen_audit_roadmapmd) â€” depth-3 reliability contract (dispositions, reanimation reprioritization, puzzle-layer proc-gen invariants, acceptance tests) | docs/ |
| DOC-110 | [NPC_TOOLING_ROADMAP.md](#doc-110-npc_tooling_roadmapmd) — seven-tool authoring suite: P1 NPC Designer, P2 Bark Workbench, P3 Verb-Node Stamper (blockout-visualizer layer), P4 Archetype Studio, P5 Enemy Hydrator, P6 NPC Sprite Studio, P7 Population Planner. Phase 0 = actor schema + npc-cli + `data/npcs.json` extraction | docs/ | → Wave 3 (NPC Refresh tooling source) |
| DOC-111 | [NPC_TOOLING_DEPENDENCY_AUDIT.md](NPC_TOOLING_DEPENDENCY_AUDIT.md) — cross-roadmap dependency audit for DOC-110: ten hard schema commitments from DOC-9 / DOC-83 / DOC-79 / DOC-107 / DOC-32b / SPATIAL_AUDIO / ACT2 / LIVING_INFRASTRUCTURE / D3 audit / POST_JAM; eight schema fields missing from current P0; recommended P1‖P3 parallel sequencing; 11 mid-build risks catalogued. **Read before DOC-110 Phase 0 Chapter 4 closes.** | docs/ | → DOC-110 prerequisite |

### Sprites And Visual Assets

| # | Document | Folder | Exec Slot |
|---|----------|--------|-----------|
| DOC-15 | [SPRITE_STACK_ROADMAP.md](#doc-15-sprite_stack_roadmapmd) | docs/ | → Wave 6 (blocked on artist sprites) |
| DOC-40 | [SPRITE_COMMISSIONING_MAP.md](#doc-40-sprite_commissioning_mapmd) | docs/ | — |
| DOC-41 | [SPRITE_LIBRARY_PLAN.md](#doc-41-sprite_library_planmd) | docs/ | → Wave 6 (particle FX) |
| DOC-42 | [SPRITE_STUB_ROADMAP.md](#doc-42-sprite_stub_roadmapmd) | docs/ | → Wave 6 (emoji-to-artist migration) |

### Level Design And Blockouts

| # | Document | Folder |
|---|----------|--------|
| DOC-43 | [AGENT_BLOCKOUT_INSTRUCTIONS.md](#doc-43-agent_blockout_instructionsmd) | docs/ |
| DOC-49 | [BLOCKOUT_ALIGNMENT.md](#doc-49-blockout_alignmentmd) | docs/ |
| â€” | FLOOR0_BLOCKOUT.md | docs/ |
| â€” | FLOOR1_BLOCKOUT.md | docs/ |
| â€” | FLOOR2_BLOCKOUT.md | docs/ |
| DOC-61 | [FLOOR2_BLOCKOUT_PREP.md](#doc-61-floor2_blockout_prepmd) | docs/ |
| â€” | FLOOR3_BLOCKOUT.md | docs/ |
| DOC-79 | [floor3-crosshair-blockout.md](#doc-79-floor3-crosshair-blockoutmd) | docs/ |
| DOC-80 | [SEAWAY_FLOOR_DESIGN.md](#doc-80-seaway_floor_designmd) | docs/ |

### EyesOnly Convergence And Legacy

| # | Document | Folder |
|---|----------|--------|
| DOC-47 | [EYESONLY_3D_ROADMAP.md](#doc-47-eyesonly_3d_roadmapmd) | docs/ |
| DOC-5 | [Dungeon_Gleaner_Base_Engine_Audit.docx](#doc-5-dungeon_gleaner_base_engine_auditdocx) | docs/ |
| DOC-28 | [ROADMAP.md](#doc-28-roadmapmd) | docs/ |

### FIX_AND_BUGS

| Document | Folder |
|----------|--------|
| FIX_BONFIRE_BILLBOARD_SPRITES.md | docs/FIX_AND_BUGS/ |
| FIX_CARD_DRAG_DROP.md | docs/FIX_AND_BUGS/ |
| FIX_CARD_FAN_POSITION.md | docs/FIX_AND_BUGS/ |
| FIX_DEBRIEF_CRT_STYLING.md | docs/FIX_AND_BUGS/ |
| FIX_STATUS_BAR_EMOJI_AND_DECK.md | docs/FIX_AND_BUGS/ |
| FIX_SUIT_SYMBOLS_IN_PORTHOLES.md | docs/FIX_AND_BUGS/ |
| FIX_VIEWPORT_BLUR_SCOPING.md | docs/FIX_AND_BUGS/ |
| CHEST_PLAYTEST_DEBUG.md | docs/ |

### Archive And Misc

| Document | Folder |
|----------|--------|
| CSS_TO_USE.md | docs/ |
| DOC-62 | [POST_JAM_ITEM_ROADMAP.md](#doc-62-post_jam_item_roadmapmd) | docs/ |
| â€” | vivec-parallax-concept.html | docs/ |

---

## Outstanding And Post-Jam Considerations

### Current arc — Living Shops & Economy → weighted dungeon loot

The recent architectural cluster (DOC-88 doors / DOC-89 trapdoors / DOC-92 living windows /
DOC-93 proxy zones / DOC-94 spatial debug / DOC-95 minigame tiles / DOC-101 weather) was
ramp-up to give dungeon activity feedback more surface to display. The arc now pivots to
**DOC-84 LIVING_INFRASTRUCTURE_BLOCKOUT** + **DOC-74 ACT2_NARRATIVE_OUTLINE** as the
north stars. Two new plans are coming next week:

- **BLOCKOUT_REFRESH_PLAN** (upcoming) — reserve **DOC-102**. Expands the dungeon tile
  library, locks in architecture, drops verb-nodes + exterior living-infra tiles across
  Floors 0–3, flags remaining ramp-up debug items for ship.
- **NPC_REFRESH_PLAN** (upcoming, follows BLOCKOUT) — reserve **DOC-103**. Populates
  per-NPC memories, creature verb-sets, faction relations matrix, Act 2 dispatcher/contact
  choreography. Target: living shops & economy visible before circling back to dungeoning.
- **QUEST_SYSTEM_ROADMAP** (published 2026-04-16, follows NPC_REFRESH) — **DOC-107**. Replaces
  imperative `QuestWaypoint` + hardcoded objectives with a data-driven QuestChain module,
  registry JSON, ReputationBar (WoW-style faction/NPC standing evolving from readiness),
  Journal re-wire, and system-settings toggles (markers on/off, hint verbosity, sidequest
  opt-in). Parallel-track integration specs for pressure-washing, map editor, and minigame
  owners included inline. **Phases 0 + 0b + 1 + 2 + 3 + 4 + 5 + 5b + 6 shipped 2026-04-17** — engine cutover
  complete + Journal rewired + Settings panel wired + Minigame adapter live + Reputation bars wired
  into debrief feed + sidequest roster expanded from 1 demo to 4 (content-only, predicate surface
  coverage: npc/floor/item/combat/readiness/flag/prereq): QuestTypes (L0), QuestRegistry (L1) with six anchor resolvers, QuestChain (L3)
  with predicate engine + DOC-66 §2 navigation state machine absorbed, `getJournalEntries()` +
  `getUIPrefs/setUIPrefs/loadUIPrefs` + `onMinigameExit(kindId, reason, payload)` +
  `onReputationTierCross(factionId, fromTier, toTier)` on the frozen public API; three named anchors
  migrated into `data/quests.json`; four game.js call-site fan-outs; Minimap pull-based marker
  via `getCurrentMarker()` now gated by `markers` master switch, `hintVerbosity`
  (off/subtle-with-90s-idle-gate/explicit), and `sidequestOptIn` filter; QuestWaypoint reduced
  to a ~60-line cursor-fx shim; Face-3 Settings Quest subsection (1 toggle + 3 cycles,
  slots 850–853) persists to `localStorage['gleaner_settings_v1'].quest`; Phase 5 adds a
  `kind:'minigame'` predicate shape (kindId / reason / subTargetId / floorId filters),
  count-gated advance emitting partial waypoint events until the Nth match, `PickupActions`
  fan-out layer with its own `.on/.off` listener registry, SpraySystem tile-clean callback wired
  through Game.init, and a demo `side.1.3.1.pentagram_wash` sidequest (count:3), 37/37 Node
  contract-harness assertions pass; Phase 3 adds a `kind:'reputation-tier'` predicate (factionId +
  toTier exact match + optional `'up'`/`'down'`/`'any'` direction gate, default up),
  `WAYPOINT_KIND.REPUTATION_TIER` enum, a faction-row API on `DebriefFeed`
  (`expandFaction` / `collapseFaction` / `updateFaction` / `getFactionState`) rendered below buffs
  with per-tier bar fill and three stackable keyframe animations (reveal / bump / tier-cross gold-
  flash), `DispatcherChoreography.init({onComplete})` first-time hook bumping BPRD favor by +100
  and auto-expanding the debrief row at the end of the dispatch encounter, full `ReputationBar →
  DebriefFeed + QuestChain` fan-out in Game.init (both tier-cross and favor-change wired), and
  four-faction × six-tier i18n keys — 47/47 Node contract-harness assertions pass. A follow-on
  display-layer rename re-maps the player-facing labels to Biome Plan §19.1 canonical names with
  suit glyphs: `bprd → The Necromancer ♥` (employer, outside triangle), `mss → Tide Council ♠`
  (Coral Cellars), `pinkerton → Foundry Collective ♦` (Ironhold Depths), `jesuit → The Admiralty ♣`
  (Lamplit Catacombs); internal `QuestTypes.FACTIONS` ids unchanged (save/predicate stability);
  `_factionRow` now renders an ivory `.df-faction-suit` chip before the name with card-suit-color
  glyph; color palette re-tuned to biome palettes; standalone `tools/_phase3-cache/verify-rename.js`
  harness (6 groups) verifies the rename. Phase 6 adds `tools/floor-payloads/*.quest.json`
  distributed floor-sidecar anchors (`{version, floorId, quests[], anchors{}}`) — `tools/extract-floors.js`
  emits a slim runtime `data/quest-sidecars.js` (`window.QUEST_SIDECARS = {anchors, anchorSources,
  floorQuests, anchorCount, collisionCount, generated}`) loaded at Layer 0 before QuestRegistry;
  FloorManager exposes `getQuestAnchors()` / `getDistributedAnchors()` / `getDistributedAnchorSources()`
  read-throughs; `QuestRegistry.init(payload, floorAnchors, distributedAnchors)` unions central +
  distributed anchors with source tagging (`'central'` / `'distributed'`), collision-logging
  (`anchor-collision`, central-wins policy), malformed-spec rejection (`anchor-malformed`), and fail-fast
  `_validateQuestAnchors()` walking every step's `target.anchor` + `advanceWhen.anchor` surfacing
  `unresolved-anchor` errors; `init()` returns false when `_initErrors[]` non-empty; new exports
  `getAnchorSource` / `listCentralAnchors` / `listDistributedAnchors` / `getInitErrors` +
  `summary()` exposes `centralAnchorCount` / `distributedAnchorCount` / `initErrorCount`; two Act 1
  test anchors migrated into sidecars (`pentagram_chamber` → `1.3.1.quest.json`, `home_work_keys_chest`
  → `1.6.quest.json`); 62/62 Node fresh-inode harness assertions pass (sidecar emission /
  JSON shape + cross-sidecar collision / registry union + source tagging + resolveAnchor /
  fail-fast error surfacing). Phase 7 (Act-2 content load-in) remains, purely data-only.
  DOC-66 §7 live-browser verification walk still pending.

### Primary outstanding execution priorities

> **Canonical execution plan: `POST_JAM_FOLLOWUP_ROADMAP.md` (DOC-105)**. The numbered list below is a summary — see DOC-105 for wave sequencing, gates, and exit criteria. Items marked *(→ Wave N)* show their DOC-105 wave assignment.

1. ~~Run DOC-82 POST_JAM_EXECUTION_ORDER.md as the active patch plan (P1–P5).~~ ✅ Complete — DOC-82 is a closed ledger. DOC-105 is the active plan.
2. **Expand dungeon tile library** — DOC-84 §12.2 creature tiles 49–54 *(→ Wave 1)*
3. **Expand DOC-95 MINIGAME_TILES** — Tier 1 order + Tier 2 UI flow *(→ Wave 1)*
4. **Register verb-nodes on Floors 2 & 3** (DOC-84 §5.2c/§6.2c) *(→ Wave 1)*
5. Implement DOC-74 Act 2 housing reassignment arc *(→ Wave 4 CP5)*
6. Execute depth-3 reliability work from DOC-85 *(→ Wave 3)*
7. Cross-floor verb attenuation (DOC-83 Phase 11) *(→ Wave 3)*
8. Close legacy carryovers *(→ Wave 5)*:
   - E1/E2 (hero boss encounter + hero deck)
   - E5.8/E5.9/E5.10 (chest interaction + playtest gate)
   - Phase F (economy tuning + tool progression) — DOC-39 is the spec *(→ Wave 4)*
   - Phase G (audio, LG validation, submission polish)
9. Run DOC-86 critical path sequencing *(→ Wave 1–2 gates)*

### Stale roadmap triage (2026-04-17)

20+ docs created before April 8 had open work with no execution slot. All have been triaged and absorbed into DOC-105 waves. Key assignments:

| Doc | Wave | Summary |
|-----|------|---------|
| DOC-31b Cobweb/Trap Strategy | Wave 1 | Phases 3/5–7 feed blockout readiness |
| DOC-52 Readiness Bar | Wave 2 | Constellation-tracer FX + reporting engine |
| DOC-9 NPC System | Wave 3 | Spec source for NPC Refresh (§5–§9) |
| DOC-32b Tooltip Bark | Wave 3 | Scrollable log + inline choices |
| DOC-59 D3 Cleaning Balance | Wave 3 | Depth-3 specific tuning |
| DOC-39 Shop Refresh Economy | Wave 4 | Staggered shop cycles — THE shop spec |
| DOC-16 Suit System | Wave 4 | 4 remaining passes, suit synergies |
| DOC-57 CrateUI Overhaul | Wave 4 | Work order integration |
| DOC-1 Gap Coverage T2 | Wave 5 | Deployability checklist |
| DOC-50 Spatial Audio Bark | Wave 5 | Stereo panning for Phase G audio |
| DOC-37 Input Controller | Wave 5 | Magic Remote gaps → Phase G |
| DOC-15/42/41 Sprite system | Wave 6 | Blocked on artist sprites |
| DOC-22/23 HUD/UI | Wave 6 | No phases sequenced, visual polish |

Full triage ledger: DOC-105 Appendix A.
Archive candidates: DOC-45 (INVENTORY_SYSTEM_AUDIT — resolved), DOC-32 (UNIFIED_EXECUTION_ORDER — superseded), DOC-27 (JAM_COMPLIANCE — jam submitted).

### Recently shipped / archived

- **DOC-90 RECESS_REPAIR_ROADMAP** — repair shipped 2026-04-14; folds back into DOC-88
  Phase 1.5 as the canonical recess reference. Removed from active engine table.

## Archived Detail

The full per-document scope inventory, completed exe
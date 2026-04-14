# Dungeon Gleaner - Cross-Roadmap Execution Order

**Created**: 2026-03-28 | **Updated**: 2026-04-14
**Status**: Post-jam - PW-1 through PW-5 complete, core design/implementation docs indexed
**Goal**: Polish, post-jam vision execution, LG webOS deployment readiness

---

## Quick Reference - All Documents

Active and in-progress docs float to the top. Each entry links to its detailed section below.
Brainstorming and publishing-only docs are intentionally excluded from this index.

### Active - Jam Sprint (Apr 2-5)

| # | Document | Status | Folder |
|---|----------|--------|--------|
| DOC-82 | [POST_JAM_EXECUTION_ORDER.md](#doc-82-post_jam_execution_ordermd) | ðŸ”´ Active â€” patch target 2026-04-25 | docs/ |
| DOC-32 | [UNIFIED_EXECUTION_ORDER.md (v3)](#doc-32-unified_execution_ordermd-v3) | ðŸŸ¢ Sprint 0 âœ…, Tracks A/B/PW âœ… (superseded by DOC-82) | docs/ |
| DOC-1 | [GAP_COVERAGE_TO_DEPLOYABILITY.md](#doc-1-gap_coverage_to_deployabilitymd) | ðŸŸ¡ T0 âœ…, T1 4/6, T2 0/6 | docs/ |
| DOC-3 | [GONE_ROGUE_ASSET_UTILIZATION_ROADMAP.md](#doc-3-gone_rogue_asset_utilization_roadmapmd) | ðŸŸ¢ Pass 1â€“3 âœ…, Pass 4 post-jam | docs/ |
| DOC-17 | [SKYBOX_ROADMAP.md (v2)](#doc-17-skybox_roadmapmd-v2) | ðŸŸ¢ Ph 1â€“4 âœ…, Ph 5 after F3 blockout | docs/ |
| DOC-33 | [GAP_ANALYSIS.md](#doc-33-gap_analysismd) | ðŸŸ¡ Living audit | docs/ |
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
| DOC-90 | [RECESS_REPAIR_ROADMAP.md](#doc-90-recess_repair_roadmapmd) — **BLOCKING**: reinstate Wolfenstein thin-wall recess block in raycaster.js lost during trapdoor session | docs/ |
| DOC-91 | [RAYCASTER_EXTRACTION_ROADMAP.md](#doc-91-raycaster_extraction_roadmapmd) — Phases 1–3 complete (raycaster split from 4,729 → 2,758 lines across 7 IIFEs); Phase 4 deferred post-Jam | docs/ |
| DOC-92 | [LIVING_WINDOWS_ROADMAP.md](#doc-92-living_windows_roadmapmd) — Phase 0–2.5 shipped (SHOP/BAY/SLIT/ALCOVE/COMMERCIAL + corner bitmask); Phase 6 EmojiMount port next | docs/ |
| DOC-93 | [PROXY_ZONE_DESIGN.md](#doc-93-proxy_zone_designmd) — Phase 12 of LIVING_WINDOWS: interior windows looking out onto pasted exterior slices (design only) | docs/ |
| DOC-94 | [SPATIAL_DEBUG_OVERLAY_VISION.md](#doc-94-spatial_debug_overlay_visionmd) — vision doc for world-space debug overlay (tile geometry, raycast trace, contributor comms) | docs/ |
| DOC-95 | [MINIGAME_TILES.md](#doc-95-minigame_tilesmd) — tile-by-tile clicky-minigame survey (WELL, BAR_COUNTER, etc.) for §11.1/§15 living-infra tiles | docs/ |
| DOC-96 | [TEST_HARNESS_ROADMAP.md](#doc-96-test_harness_roadmapmd) — Phase 0 shipped: DebugPerfMonitor (FPS, frame time, stutter log, subsystem probes) via test-harness.html | docs/ |
| DOC-101 | [WEATHER_MODULE_ROADMAP.md](#doc-101-weather_module_roadmapmd) — Planning: per-floor weather system (haze/rain/wind/debris) at configurable Z-depth in 3D viewport, punch-through terminus | docs/ |

### Card, Inventory And Combat

| # | Document | Folder |
|---|----------|--------|
| DOC-46 | [INVENTORY_CARD_MENU_REWORK.md](#doc-46-inventory_card_menu_reworkmd) | docs/ |
| DOC-45 | [INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md](#doc-45-inventory_system_audit_and_roadmapmd) | docs/ |
| DOC-26 | [UNIFIED_INVENTORY_METADATA_CONTRACT.md](#doc-26-unified_inventory_metadata_contractmd) | docs/ |
| DOC-24 | [B5_INVENTORY_INTERACTION_DESIGN.md](#doc-24-b5_inventory_interaction_designmd) | docs/ |
| DOC-25 | [B6_SLOT_WHEEL_AND_TRANSACTION_LAYOUT.md](#doc-25-b6_slot_wheel_and_transaction_layoutmd) | docs/ |
| DOC-36 | [FACE2_INVENTORY_POLISH.md](#doc-36-face2_inventory_polishmd) | docs/ |
| DOC-20 | [COMBAT_DRAG_SYSTEM.md](#doc-20-combat_drag_systemmd) | docs/ |
| DOC-16 | [SUIT_SYSTEM_ROADMAP.md](#doc-16-suit_system_roadmapmd) | docs/ |
| DOC-57 | [CRATEUI_INTERACTION_OVERHAUL.md](#doc-57-crateui_interaction_overhaulmd) | docs/ |

### HUD, UI And Menus

| # | Document | Folder | Status |
|---|----------|--------|--------|
| DOC-22 | [HUD_ROADMAP.md](#doc-22-hud_roadmapmd) | docs/ | Active |
| DOC-23 | [UI_ROADMAP.md](#doc-23-ui_roadmapmd) | docs/ | Active |
| DOC-21 | [GAME_FLOW_ROADMAP.md](#doc-21-game_flow_roadmapmd) | docs/ | Active |
| DOC-32b | [TOOLTIP_BARK_ROADMAP.md](#doc-32-tooltip_bark_roadmapmd) | docs/ | Active |
| DOC-12 | [PEEK_SYSTEM_ROADMAP.md](#doc-12-peek_system_roadmapmd) | docs/ | Active |
| DOC-51 | [CINEMATIC_CAMERA_ROADMAP](#doc-51-cinematic-camera) | engine/cinematic-camera.js | Engine built, 3/7 presets wired |
| DOC-55 | [MENU_INTERACTIONS_CATALOG.md](#doc-55-menu_interactions_catalogmd) | docs/ | Active |
| DOC-29 | [hud-ui-debugging-notes.md](#doc-29-hud-ui-debugging-notesmd) | docs/ | Reference |
| DOC-58 | [PEEK_BOX_VISUAL_AUDIT.md](#doc-58-peek_box_visual_auditmd) | docs/ | â€” |
| DOC-77 | [BOX_EDITOR_PRODUCT_ROADMAP.md](#doc-77-box_editor_product_roadmapmd) | docs/ | â€” |
| DOC-78 | [PEEK_WORKBENCH_SCOPE.md](#doc-78-peek_workbench_scopemd) | docs/ | â€” |
| DOC-98 | [BOXFORGE_AUDIT.md](#doc-98-boxforge_auditmd) | docs/ | Audit of tools/peek-workbench.html (7,074 lines) — color selectors, sidebar wiring, export pipeline |
| DOC-99 | [BOXFORGE_NEXT_STEPS.md](#doc-99-boxforge_next_stepsmd) | docs/ | Enhancement plan — peek system support (orbs, phases, sub-attachments, templates) |
| DOC-100 | [BOXFORGE_TOOLS_ROADMAP.md](#doc-100-boxforge_tools_roadmapmd) | docs/ | Active — items 1–5 complete, 6–8 in planning; tools/peek-workbench.html ↔ tools/boxforge.html |

### Gleaner Systems (Cleaning, Restocking, Traps)

| # | Document | Folder |
|---|----------|--------|
| DOC-48 | [PRESSURE_WASHING_ROADMAP.md](#doc-48-pressure_washing_roadmapmd) | docs/ |
| DOC-67 | [PRESSURE_WASH_SYSTEM.md](#doc-67-pressure_wash_systemmd) | docs/ |
| DOC-31b | [COBWEB_TRAP_STRATEGY_ROADMAP.md](#doc-31-cobweb_trap_strategy_roadmapmd) | docs/ |
| DOC-30 | [BONFIRE_POLISH_STEPS.md](#doc-30-bonfire_polish_stepsmd) | docs/ |
| DOC-39 | [SHOP_REFRESH_ECONOMY.md](#doc-39-shop_refresh_economymd) | docs/ |
| DOC-52 | [READINESS_BAR_ROADMAP.md](#doc-52-readiness_bar_roadmapmd) | docs/ |
| DOC-59 | [DEPTH3_CLEANING_LOOP_BALANCE.md](#doc-59-depth3_cleaning_loop_balancemd) | docs/ |
| DOC-68 | [CHEST_RESTOCK_AND_WORK_ORDERS.md](#doc-68-chest_restock_and_work_ordersmd) | docs/ |
| DOC-69 | [RESTOCK_AUDIT.md](#doc-69-restock_auditmd) | docs/ |
| DOC-70 | [UNIFIED_RESTOCK_SURFACE_ROADMAP.md](#doc-70-unified_restock_surface_roadmapmd) | docs/ |
| DOC-71 | [SPATIAL_CONTRACTS.md](#doc-71-spatial_contractsmd) | docs/ |
| DOC-97 | [FATIGUE_SYSTEM_ROADMAP.md](#doc-97-fatigue_system_roadmapmd) | docs/ |

### NPCs, Barks And Audio

| # | Document | Folder |
|---|----------|--------|
| DOC-9 | [NPC_SYSTEM_ROADMAP.md](#doc-9-npc_system_roadmapmd) | docs/ |
| DOC-11 | [NPC_FACTION_BOOK_AUDIT.md](#doc-11-npc_faction_book_auditmd) | docs/ |
| DOC-10 | [COZY_INTERIORS_DESIGN.md](#doc-10-cozy_interiors_designmd) | docs/ |
| DOC-6 | [AUDIO_ENGINE.md](#doc-6-audio_enginemd) | docs/ |
| DOC-50 | [SPATIAL_AUDIO_BARK_ROADMAP.md](#doc-50-spatial_audio_bark_roadmapmd) | docs/ |
| DOC-44 | [EYESONLYS_TOOLTIP_SPACE_CANON.md](#doc-44-eyesonlys_tooltip_space_canonmd) | docs/ |
| DOC-60 | [AUDIO_SFX_COMMISSIONING_AUDIT.docx](#doc-60-audio_sfx_commissioning_auditdocx) | docs/ |
| DOC-81 | [AUDIO_COMMISSIONING.md](#doc-81-audio_commissioningmd) | EyesOnly/docs/ |
| DOC-83 | [VERB_FIELD_NPC_ROADMAP.md](#doc-83-verb_field_npc_roadmapmd) â€” v1.3: +tile catalog, +cross-floor, +reanimated verbs, +living infra, +reanim tiers | docs/ |
| DOC-84 | [LIVING_INFRASTRUCTURE_BLOCKOUT.md](#doc-84-living_infrastructure_blockoutmd) â€” v1.3: tiles 40-59, trap/cobweb/creature verbs, anti-mush invariants, corpse recovery loop, faction relations (trust/heat/debt), NPC memory morphing, economy buildings (Clinic, Morgue, Union Hall, Chop Room) | docs/ |
| DOC-85 | [D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md](#doc-85-d3_ai_living_infra_procgen_audit_roadmapmd) â€” depth-3 reliability contract (dispositions, reanimation reprioritization, puzzle-layer proc-gen invariants, acceptance tests) | docs/ |

### Sprites And Visual Assets

| # | Document | Folder |
|---|----------|--------|
| DOC-15 | [SPRITE_STACK_ROADMAP.md](#doc-15-sprite_stack_roadmapmd) | docs/ |
| DOC-40 | [SPRITE_COMMISSIONING_MAP.md](#doc-40-sprite_commissioning_mapmd) | docs/ |
| DOC-41 | [SPRITE_LIBRARY_PLAN.md](#doc-41-sprite_library_planmd) | docs/ |
| DOC-42 | [SPRITE_STUB_ROADMAP.md](#doc-42-sprite_stub_roadmapmd) | docs/ |

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

Primary outstanding execution priorities:

1. Run DOC-82 POST_JAM_EXECUTION_ORDER.md as the active patch plan (P1-P5).
2. Close legacy carryovers from archived jam plan:
   - E1/E2 (hero boss encounter + hero deck)
   - E5.8/E5.9/E5.10 (chest interaction + playtest gate)
   - Phase F (economy tuning + tool progression)
   - Phase G (audio, LG validation, submission polish)
3. Implement Act 2 housing reassignment arc (DOC-74 §5.4) with corresponding interior/living-infrastructure hooks (DOC-10, DOC-84).
4. Execute depth-3 reliability work from DOC-85 (AI disposition contract, proc-gen invariants, acceptance tests).
5. Run DOC-86 critical path sequencing for legacy roadmap triage and dependency closure before new renderer/living-infra expansions.

## Archived Detail

The full per-document scope inventory, completed execution-order history, and expanded cross-reference notes are archived at:

- docs/Archive/CROSS_ROADMAP_EXECUTION_ARCHIVE.md

---

## Cross-Reference Key

| Tag | Meaning |
|-----|---------|
| -> DOC-N §X | See document N, section X for details |
| <- DOC-N §X | This section is referenced by document N, section X |
| ⊕ PHASE X.N | Maps to cross-roadmap phase/task |
| Complete | Already complete |
| Active | In progress this sprint |
| Deferred | Blocked or post-jam |

---

*This document is the lightweight entry point for project documentation. For historical detail and completed execution records, see docs/Archive/CROSS_ROADMAP_EXECUTION_ARCHIVE.md.*

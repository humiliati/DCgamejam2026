# Dungeon Gleaner — Cross-Roadmap Execution Order

**Created**: 2026-03-28 | **Updated**: 2026-04-03
**Jam Deadline**: April 5, 2026 (2 days remaining)
**Goal**: Somewhat playable prototype → debug, smooth, and raise with designer portals through final week

---

## Quick Reference — All Documents

Active and in-progress docs float to the top. Each entry links to its detailed section below.

### 🔥 Active — Jam Sprint (Apr 2–5)

| # | Document | Status | Folder |
|---|----------|--------|--------|
| DOC-32 | [UNIFIED_EXECUTION_ORDER.md (v3)](#doc-32-unified_execution_ordermd-v3) | 🟢 Sprint 0 ✅, Tracks A/B active | docs/ |
| DOC-1 | [GAP_COVERAGE_TO_DEPLOYABILITY.md](#doc-1-gap_coverage_to_deployabilitymd) | 🟡 T0 ✅, T1 4/6, T2 0/6 | docs/ |
| DOC-3 | [GONE_ROGUE_ASSET_UTILIZATION_ROADMAP.md](#doc-3-gone_rogue_asset_utilization_roadmapmd) | 🟢 Pass 1–3 ✅, Pass 4 post-jam | docs/ |
| DOC-17 | [SKYBOX_ROADMAP.md (v2)](#doc-17-skybox_roadmapmd-v2) | 🟢 Ph 1–4 ✅, Ph 5 after F3 blockout | docs/ |
| DOC-33 | [GAP_ANALYSIS.md](#doc-33-gap_analysismd) | 🟡 Living audit | docs/ |
| DOC-35 | [DEBUG_NOTES_SCREENER.md](#doc-35-debug_notes_screenermd) | 🟡 Living checklist | docs/ |
| DOC-29 | [hud-ui-debugging-notes.md](#doc-29-hud-ui-debugging-notesmd) | 🟡 Living debug log | docs/ |
| DOC-53 | [PLAYTEST_AND_BLOCKOUT_PROCEDURE.md](#doc-53-playtest_and_blockout_proceduremd) | 🟢 Blockout order + playtest cycle + tester guide | docs/ |
| DOC-54 | [INTERACTIVE_OBJECTS_AUDIT.md](#doc-54-interactive_objects_auditmd) | 🟢 Tile-by-tile render/interact audit, biome override bug, bonfire menu trap | docs/ |
| DOC-55 | [MENU_INTERACTIONS_CATALOG.md](#doc-55-menu_interactions_catalogmd) | 🟡 Complete interaction catalog for 4-face menu, StatusBar, system settings | docs/ |

### 📐 Design Bibles & Core Loop

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

### 🧱 Engine & Renderer Roadmaps

| # | Document | Folder |
|---|----------|--------|
| DOC-18 | [NLAYER_RAYCASTER_ROADMAP.md](#doc-18-nlayer_raycaster_roadmapmd) | docs/ |
| DOC-14 | [TEXTURE_ROADMAP.md](#doc-14-texture_roadmapmd) | docs/ |
| DOC-31a | [LIGHT_AND_TORCH_ROADMAP.md](#doc-31-light_and_torch_roadmapmd) | docs/ |
| DOC-38 | [PLAYER_CONTROLLER_ROADMAP.md](#doc-38-player_controller_roadmapmd) | docs/ |
| DOC-37 | [INPUT_CONTROLLER_ROADMAP.md](#doc-37-input_controller_roadmapmd) | docs/ |
| DOC-54 | [INTERACTIVE_OBJECTS_AUDIT.md](#doc-54-interactive_objects_auditmd) | docs/ |
| DOC-19 | [DOOR_EFFECTS_ROADMAP.md](#doc-19-door_effects_roadmapmd) | docs/ |

### 🎴 Card, Inventory & Combat

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

### 🗺️ HUD, UI & Menus

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
| DOC-58 | [PEEK_BOX_VISUAL_AUDIT.md](#doc-58-peek_box_visual_auditmd) | docs/ | — |

**§ Cinematic Camera — cross-cutting wiring status (updated Apr 2, 2026)**

CinematicCamera module exists (446 lines, 7 presets). Letterbox bars, FOV zoom, shake, focus angle override, input lock all coded. Turn-and-face ✅ fixed, clothes overlay ✅ fixed (per-slot tint via offscreen canvas).

| Preset | Consumer | Wired? | Blocker |
|--------|----------|--------|---------|
| `combat_lock` | Combat encounter start | ✅ | CombatBridge._beginCombat() → start, _onCombatEnd() → close |
| `dispatcher_grab` | NPC dispatcher → forced 180° + dialogue | ✅ | Proximity choreography + MC.startTurn() + Player.setDir() |
| `monologue` | MonologuePeek intrusive thoughts | ❌ | Needs MonologuePeek.play() caller with specific sequence |
| `morning_recap` | Bonfire dawn wake-up → day recap | ✅ | MonologuePeek.play() passes `cameraPreset: 'morning_recap'` (wide 22% bars, 1.05× FOV) |
| `boss_entrance` | Boss chamber entry | ❌ | No boss rooms in jam build |
| `peek` | Tile peek enhancement | ❌ | Needs PeekSystem integration |
| `dragonfire_dialogue` | Dragonfire dialogue tree / bark dispatch | ⏸️ POST-JAM | Deferred — not needed for jam-submittable loop |

**Jam priority (updated Apr 2):** ~~Fix turn-and-face~~ ✅ → ~~wire dispatcher_grab~~ ✅ → ~~wire morning_recap~~ ✅ → ~~combat_lock~~ ✅. 3/7 wired — remaining presets (dragonfire_dialogue, boss_entrance, peek) deferred to post-jam.

### 🧹 Gleaner Systems (Cleaning, Restocking, Traps)

| # | Document | Folder |
|---|----------|--------|
| DOC-48 | [PRESSURE_WASHING_ROADMAP.md](#doc-48-pressure_washing_roadmapmd) | docs/ |
| DOC-31b | [COBWEB_TRAP_STRATEGY_ROADMAP.md](#doc-31-cobweb_trap_strategy_roadmapmd) | docs/ |
| DOC-30 | [BONFIRE_POLISH_STEPS.md](#doc-30-bonfire_polish_stepsmd) | docs/ |
| DOC-39 | [SHOP_REFRESH_ECONOMY.md](#doc-39-shop_refresh_economymd) | docs/ |
| DOC-52 | [READINESS_BAR_ROADMAP.md](#doc-52-readiness_bar_roadmapmd) | docs/ |
| DOC-59 | [DEPTH3_CLEANING_LOOP_BALANCE.md](#doc-59-depth3_cleaning_loop_balancemd) | docs/ |
| — | [BONFIRE_BRAINSTORMING.md](#bonfire_brainstormingmd) | docs/ |

### 👤 NPCs, Barks & Audio

| # | Document | Folder |
|---|----------|--------|
| DOC-9 | [NPC_SYSTEM_ROADMAP.md](#doc-9-npc_system_roadmapmd) | docs/ |
| DOC-11 | [NPC_FACTION_BOOK_AUDIT.md](#doc-11-npc_faction_book_auditmd) | docs/ |
| DOC-10 | [COZY_INTERIORS_DESIGN.md](#doc-10-cozy_interiors_designmd) | docs/ |
| DOC-6 | [AUDIO_ENGINE.md](#doc-6-audio_enginemd) | docs/ |
| DOC-50 | [SPATIAL_AUDIO_BARK_ROADMAP.md](#doc-50-spatial_audio_bark_roadmapmd) | docs/ |
| DOC-44 | [EYESONLYS_TOOLTIP_SPACE_CANON.md](#doc-44-eyesonlys_tooltip_space_canonmd) | docs/ |
| DOC-60 | [AUDIO_SFX_COMMISSIONING_AUDIT.docx](#doc-60-audio_sfx_commissioning_auditdocx) | docs/ |

### 🎨 Sprites & Visual Assets

| # | Document | Folder |
|---|----------|--------|
| DOC-15 | [SPRITE_STACK_ROADMAP.md](#doc-15-sprite_stack_roadmapmd) | docs/ |
| DOC-40 | [SPRITE_COMMISSIONING_MAP.md](#doc-40-sprite_commissioning_mapmd) | docs/ |
| DOC-41 | [SPRITE_LIBRARY_PLAN.md](#doc-41-sprite_library_planmd) | docs/ |
| DOC-42 | [SPRITE_STUB_ROADMAP.md](#doc-42-sprite_stub_roadmapmd) | docs/ |

### 🏗️ Level Design & Blockouts

| # | Document | Folder |
|---|----------|--------|
| DOC-43 | [AGENT_BLOCKOUT_INSTRUCTIONS.md](#doc-43-agent_blockout_instructionsmd) | docs/ |
| DOC-49 | [BLOCKOUT_ALIGNMENT.md](#doc-49-blockout_alignmentmd) | docs/ |
| — | FLOOR0_BLOCKOUT.md | docs/ |
| — | FLOOR1_BLOCKOUT.md | docs/ |
| — | FLOOR2_BLOCKOUT.md | docs/ |
| DOC-61 | [FLOOR2_BLOCKOUT_PREP.md](#doc-61-floor2_blockout_prepmd) | docs/ |
| — | FLOOR3_BLOCKOUT.md | docs/ |

### 🔀 EyesOnly Convergence & Legacy

| # | Document | Folder |
|---|----------|--------|
| DOC-47 | [EYESONLY_3D_ROADMAP.md](#doc-47-eyesonly_3d_roadmapmd) | docs/ |
| DOC-5 | [Dungeon_Gleaner_Base_Engine_Audit.docx](#doc-5-dungeon_gleaner_base_engine_auditdocx) | docs/ |
| DOC-28 | [ROADMAP.md](#doc-28-roadmapmd) | docs/ |

### 🐛 FIX_AND_BUGS/

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

### 📦 Archive/ & Misc

| Document | Folder |
|----------|--------|
| PRESSURE_WASHING_BRAINSTORM.md | docs/Archive/ |
| CSS_TO_USE.md | docs/ |
| DOC-62 | [POST_JAM_ITEM_ROADMAP.md](#doc-62-post_jam_item_roadmapmd) | docs/ |

### 📤 Submission & Release

| # | Document | Status | Folder |
|---|----------|--------|--------|
| DOC-63 | [itch-game-page.md](#doc-63-itch-game-pagemd) | 🟡 Live copy | docs/ |
| DOC-64 | [itch-submission-kit.md](#doc-64-itch-submission-kitmd) | 🟢 Updated (audio fix Apr 4) | docs/ |
| DOC-65 | [pre-flight-walk.md](#doc-65-pre-flight-walkmd) | 🟡 Living checklist | docs/ |
| DOC-66 | [quest-marker-audit.md](#doc-66-quest-marker-auditmd) | 🟢 Audit + patch + post-jam spec | docs/ |

---

## Detailed Document Index

All documents with scope summaries and section inventories. Each document now includes a **§ Cross-References** appendix that links back here and to sibling docs.

### DOC-1: GAP_COVERAGE_TO_DEPLOYABILITY.md
> **Scope**: System inventory, bug fixes, gap analysis against EyesOnly patterns, and tiered execution to deployability.

| Section | Content |
|---------|---------|
| System Inventory | 17 modules (~7,500 lines), all ✅ Live |
| Bugs Fixed | B1–B5 (currency, hand dup, salvage sell, rep, game handler) |
| Gap Analysis | 10 EyesOnly alignment checks (identity, hydration, transfer, etc.) |
| **Tier 0** | Critical path jam blockers — **8/8 ✅ COMPLETE** |
| **Tier 1** | Combat polish — **6/6 ✅ COMPLETE** (T1.4 toast ✅, T1.5 EnemyIntent ✅, T1.6 CorpseRegistry ✅) |
| **Tier 2** | Economy loop closure — **0/6 done** (T2.1–T2.6 all pending) |
| **Tier 3** | Post-jam architecture — 0/10, deferred |
| Sprint Schedule | Daily plan Mar 28 → Apr 5 |
| Data Mutation Map | 13/15 paths wired |

### DOC-2: TUTORIAL_WORLD_ROADMAP.md
> **Scope**: World graph, floor registry, gate system, floor designs, economy tuning, and Gleaner pivot phases.

| Section | Content |
|---------|---------|
| §1 Overview | Environmental teaching philosophy |
| §2 World Graph | Floor 0 → 1 → 1.1/1.2/1.3/1.6 → 1.3.1 → 2 → 2.1/2.2 → 2.2.1/2.2.2 → 3 hierarchy |
| §3 Floor Registry | 15 floors + connection edges (includes Floor 1.6 Gleaner's Home) |
| §4 Gate-Contract System | Gate taxonomy, full-span rule, floor state tracking |
| §5 Floor Designs | 5.1–5.8 individual floor specs (Approach → Frontier) |
| §6 Hero Reveal | The Moment, Hero Entity, Wake of Carnage |
| §7 Economy Tuning | Kenshi scavenger start, 5-card lean, loot/bonfire/death semantics |
| §8 FloorManager Redesign | World graph registry, migration phases A/B, tile constants |
| §9 Original Phases | Phase 1–8 (15–24h, pre-pivot) |
| §10 Player Journey | Expected flow loops |
| §11 Gone Rogue Patterns | Asset reuse table |
| §12 Jam Timeline | Risk assessment |
| **§13 Gleaner Pivot** | Cleaning Loop, Restocking Loop, Dungeon Reset Loop |
| **§14 Hero Path System** | 4 hero types, patrol routes, AI, stealth mechanics |
| **§15 Pressure Wash Simulator** | Per-texel grime, cleaning tools, contracts |
| **§16 Revised Phases** | Phase 0 (Pre-Phase) + Phase 1–8 reordered for Gleaner pivot |
| **§17 Revised Player Journey** | Pre-phase send-off → three-act progression |
| **§18 Pre-Phase 0 — Morning Send-Off** | Bark system, Dispatcher gate NPC, Floor 1.6 home, key gate mechanic, narrative alignment, pillar juice |

### DOC-3: GONE_ROGUE_ASSET_UTILIZATION_ROADMAP.md
> **Scope**: Maps every Gone Rogue JS module to PORTED / PORT NOW / PORT LATER / OUT OF SCOPE.

| Section | Content |
|---------|---------|
| ✅ PORTED | 7 modules already running (rng, synergy, cards, enemy-ai, audio, splash, status) |
| ✅ PORT NOW Complete | 6 extractions done (world-items, loot-tables, breakable-spawner, pickup, food, HOT) |
| ✅ Found Complete | 3 already ported (overhead-animator, shop, loot-spill) |
| **✅ Pass 3 — Stealth** | stealth-system.js ✅, awareness-config.js ✅, minimap cones ✅ |
| 🛠️ Post-Jam | pet-follower, puzzle-state |
| ❌ Out of Scope | 15 modules (ARG, multiplayer, auth, constellation, etc.) |
| Data File Status | items ✅, enemies ✅, loot-tables ✅, cards ✅, strings ✅ |

### DOC-4: Biome Plan.html
> **Scope**: Living design bible — premise, themes, renderer, spatial contracts, biomes, enemies, bosses, suits, and Gleaner systems.

| Section | Content |
|---------|---------|
| §1 Premise | Dungeon Gleaner — janitor sim framing |
| §2 Themes | Suit system integration, three gameplay loops |
| §3 Renderer Fidelity | Retrofuturism visual philosophy, color-driven design |
| §4 Floor ID & Spatial Contracts | Convention, tile height offsets (Doom Rule) |
| §5 Boardwalk Town | Floors "1"–"3" (Promenade, Lantern Gardens, Frontier Gate) |
| §6 Building Interiors | Shop/inn/armory contracts, interior presets |
| §7 Dungeons | Environmental storytelling, dungeon contracts |
| §8 Opening Scene | First dungeon scripted sequence (floor "0.1.1") |
| §9 Boss Encounters | Hero as boss, Hero combat deck (♠♣♦♥) |
| §10 RPS Combat Suits | ♣>♦>♠>♣, ♥ neutral, biome alignment |
| §11 Biome Palettes | District/Interior/Dungeon wall colors |
| §12 Enemy Populations | Lootable corpses, living remnants, density tables |
| §13 Quest Items | Narrative gating items |
| §14 EyesOnly Asset Map | What we reuse vs. not |
| §15 New Work | Jam-scope new content |
| §16 Module Wiring | Data flow diagrams |
| **§17 Gleaner Maintenance** | 17.1 Cleaning, 17.2 Restocking, 17.3 Dungeon Reset |
| **§18 Hero Path & Stealth** | 18.1 Types, 18.2 Patrols, 18.3 Sight Cones, 18.4 Encounters |
| **§19 Faction Economy** | 19.1 Factions, 19.2 Rep, 19.3 Necromancer, 19.4 Dragon Conspiracy, 19.5 Story Arcs |

### DOC-5: Dungeon_Gleaner_Base_Engine_Audit.docx
> **Scope**: Feature audit of the glov base engine — Necessities, Features, QOL — cataloging what's present, needed, or replaced.

| Section | Content |
|---------|---------|
| 1. Necessities | 1.1 Movement, 1.2 Combat, 1.3 Level Gen, 1.4 Rendering |
| 2. Features | 2.1 Card/Inventory, 2.2 Enemy AI, 2.3 Multiplayer/Network, 2.4 Audio |
| 3. QOL | 3.1 Save/Load, 3.2 UI/Accessibility, 3.3 Input/Controls, 3.4 Visual Polish, 3.5 Customization |
| 4. Strip/Defer | 4.1 Multiplayer infra, 4.2 Legacy combat, 4.3 Post-jam polish |
| 5. Sprint Mapping | 5.1 Already done, 5.2 This sprint, 5.3 Final sprint |

### DOC-6: AUDIO_ENGINE.md
> **Scope**: Audio engine reference — Web Audio bus architecture, spatial envelope pattern (door contracts), SFX wiring inventory, modification guide, future spatial audio plan.

| Section | Content |
|---------|---------|
| Architecture | Web Audio API bus (master → sfx/bgm), codec, manifest |
| Playback API | play(), playRandom(), playSequence(), playMusic(), preloadCategory() |
| Door Contract Audio | Three-phase spatial envelope pattern, timing model, design principles |
| SFX Inventory | Current wiring table (18 triggers), unwired future table (13 triggers) |
| Spatial Audio | Distance attenuation proposal for enemy/hero footsteps (Phase D) |
| Modification Guide | Adding SFX, sequences, music tracks, tuning volume levels |

### DOC-7: CORE_GAME_LOOP_AND_JUICE.md
> **Scope**: Core loop design doc. Covers the three toyful pillars (Clean / Restock / Endure), Kingdom Two Crowns economy model, narrative hero cycle (3-day cadence + Taskmaster NPC), Stardew Valley day/night pressure with skybox transitions, death/home/debuff system, peek interaction expansion, dungeon persistence & multi-floor maintenance, hero run mailbox reports with dungeon thumbnails, dungeon reset element catalog, daily vermin refresh & reanimation economy, and fail state narrative design (death hero-rescue, curfew NPC wink, humiliation gradient).

| Section | Content |
|---------|---------|
| §1 One-Line Pitch | The janitor framing and central tension |
| §2 Three Core Pillars | Clean, Restock, Endure — one-liners and primary verbs |
| §3 Kingdom Two Crowns Economy | Drip→jackpot structure, visible economy (7-category readiness), "just one more crate" pull |
| §4 Hero Cycle — Narrative Deploy | 3-day cadence, Taskmaster NPC, implied deploy via mail/barks/dungeon re-entry, payout tiers |
| §5 Day/Night Cycle — Living World Pressure | Skybox transitions, player home, clock mechanics, sleep/death/curfew/debuffs, bonfire role, **interior time-freeze rule** |
| §6 Juice Inventory | Per-pillar juice tables: Clean, Restock, Hero Cycle, Day/Night, Ambient/Meta, Pre-Phase, **Cozy Interior (§6.7)** |
| §7 Pressure Gradient | Readiness target escalation per hero cycle |
| §8 3-Day Cycle Session Rhythm | The "one more cycle" pull, daily structure |
| §9 Implementation Notes | Module mapping table + jam-scope priority order |
| §10 Design Axioms | Seven guiding principles (expanded: "home is heartbeat", "discovery over declaration") |
| §11 Peek Interaction Expansion | Bed, Mailbox, Job Board, Taskmaster, Bonfire peek specs with mockup layouts, **Bookshelf Peek (§11.6)**, **Bar Counter Peek (§11.7)** |
| §12 Time Cycle Accommodation Inventory | Fits naturally / requires adaptation / deferred tables, time-aware peek summary |
| §13 Dungeon Persistence & Multi-Floor Maintenance | Work persists across days, dungeon difficulty tiers, hero chain penetration depth |
| §14 Hero Run Report — Mailbox Detail Design | Dungeon thumbnail cards, report tone by readiness, activity breakdown icons |
| §15 Dungeon Reset Elements | Corpse cleanup, puzzle re-scramble, door relock, button reset, persistence rules |
| §16 Daily Vermin Refresh & Reanimation Economy | Vermin spawn nodes, reanimation flow, value hierarchy, friendly NPC behavior, 2-day walkthrough |
| §17 Fail States — Death & Curfew Narrative | Hero rescue on death (cycle shift, halved payout, rescue mail variant), curfew NPC wink, humiliation gradient, NPC bark pool |

### DOC-8: VISUAL_OVERHAUL.md
> **Scope**: Visual pivot design doc. Shifts the aesthetic from combat-operative/CRT terminal to clinical-hazmat/corporate-paperwork/powerwash style. Covers the ironic gap (operative naming for janitor work), complete UI palette swap (phosphor green → paper/ink/clipboard), HUD redesign (geriatric size, ruled-paper texture, labeled form fields, plastic tool indicators), title screen as corporate onboarding forms, card fan as laminated playing cards, exterior biome palette nudges (brighter, higher contrast), MenuBox as tabbed binder, typography scale and font stack, player archetype visual refresh (janitor descriptions), and splash screen as hazmat warning label.

| Section | Content |
|---------|---------|
| §1 Design Philosophy | The ironic gap — operative naming for janitor work, three visual pillars, tone calibration |
| §2 Color System Overhaul | Paper/ink/pencil palette replacing CRT phosphor, suit colours retained + brightened |
| §3 HUD Redesign | Geriatric size, clipboard-backed form layout, ruled-paper lines, plastic tool indicators |
| §4 Title Screen Pivot | Corporate onboarding flow — cover letter, name badge (Form 1A), assignment form (Form 1B), shift punch-in |
| §5 Card Fan Visual Refresh | Laminated playing cards on paper, suit corner pips, stencil art style |
| §6 Biome Palette Nudges | Per-floor hex adjustments for all 4 exterior floors — brighter, warmer, higher contrast |
| §7 MenuBox / Pause Screen | Binder aesthetic — tabbed sections, paper on brown backing board |
| §8 Typography | Font stack (form/label/handwrite), geriatric size scale, ruled-paper CSS effect |
| §9 Player Archetype Visual Identity | Class emoji + description refresh — janitor-themed, ironic operative naming maintained |
| §10 Splash Screen Pivot | Hazmat warning label — yellow background, diagonal stripes, stencil title |
| §11 Implementation Priority | Jam-scope (7.5h) vs post-jam changes, per-module estimates |
| §12 Design Axioms | Seven visual-specific axioms (clipboard is the frame, ink on paper, bigger is funner) |

### DOC-9: NPC_SYSTEM_ROADMAP.md
> **Scope**: Full NPC type taxonomy, Fable-style bark system implementation record, and roadmaps for interactive NPCs, vendors, Dispatcher NPCs, Hero rovers, and building interior NPC assignment. Documents what is implemented (Phase A.0) and what is roadmapped (Phases B–D).

| Section | Content |
|---------|---------|
| §1 Overview | Layered NPC architecture: bark pools → patrol bodies → interaction verbs → encounter scripting |
| §2 NPC Type Taxonomy | Table: AMBIENT / INTERACTIVE / VENDOR / DISPATCHER / HERO movement, interaction, bark, rarity |
| §3 Bark System Architecture | BarkLibrary API, pool key convention, firing hierarchy, how to add pools |
| **§4 Implemented: NpcSystem.js** | API, entity field schema, built-in populations table, game.js wiring hooks |
| §5 Roadmap: Interactive NPCs | DialogBox.startConversation() format, planned NPCs (Guild Clerk, Archivist, Old Gleaner), task table |
| §6 Roadmap: Vendors | Current state, target state, per-faction bark pools needed, task table |
| §7 Roadmap: Dispatcher NPCs | Current gate-encounter implementation, force-facing mechanic spec, future Dispatcher instances |
| §8 Roadmap: Hero NPCs | Hero types (Fighter/Rogue/Mage/Paladin), movement model (Pathfind-based), sight cone, implementation tasks |
| §9 Roadmap: Building Interior NPCs | Per-building NPC roster table, homeFloor assignment pattern, task table |
| §10 Module & File Map | Implemented vs roadmapped file table with phases |
| §11 Bare Minimum Deployment Checklist | What must work for April 5 jam submission |
| §12 Cross-References | Links to other doc sections and engine files |

### DOC-10: COZY_INTERIORS_DESIGN.md
> **Scope**: Cozy interior design doc. Covers the Safety Contract (buildings as havens), the time-freeze rule for depth-2 floors, interior interaction taxonomy (bookshelf/bar counter/vendor/NPC/furniture), per-building interaction inventories, cozy minigame stubs (post-jam), book/document data schema, peek overlay module specs, interior juice palette, and implementation roadmap.

| Section | Content |
|---------|---------|
| §1 Overview — Safety Contract | Four channels of safety (time freeze, warm aesthetics, low-stakes interactions, tonal bark shift), design axiom |
| §2 Time-Freeze Rule | Depth-2 = frozen, depth-1/3 = normal; implementation spec (`DayCycle.setPaused`), edge cases, HUD indicator |
| §3 Interior Interaction Taxonomy | Five categories (bookshelf/bar/vendor/NPC/furniture) with tempo diversity principle |
| §4 Bookshelf Interactions | BOOKSHELF tile (25) properties, BookshelfPeek module, content categories, conspiracy drip strategy |
| §5 Bar Counter Interactions | BAR_COUNTER tile (26) properties, BarCounterPeek module, per-biome drink menus, "micro-bonfire" design intent |
| §6 Per-Building Interaction Inventory | Full tile inventories for Entry Lobby, Bazaar, Inn, Guild, Home, Watchman's Post |
| §7 Cozy Minigame Stubs | Post-jam roadmap: card sorting table, trophy shelf, cooking pot, notice board puzzle, music box |
| §8 Book & Document Data Schema | `data/books.json` format spec, current catalog (52 books), how to add new books |
| §9 Peek Overlay Module Specs | BookshelfPeek API table + BarCounterPeek API table with full method signatures |
| §10 Juice — Interiors Feel Like Home | Time-freeze juice, bookshelf juice, bar counter juice, building ambient juice |
| §11 Implementation Status & Roadmap | Phase A.0 (complete), Phase B (day cycle + home), Phase C (interior polish), Post-jam (minigames) |
| §12 Cross-References | Links to DOC-7/DOC-2/DOC-9 sections and engine files |

### DOC-11: NPC_FACTION_BOOK_AUDIT.md
> **Scope**: Comprehensive audit of books.json content/placement, NPC faction uniforms (GTA2-style gangs), choreographed NPC dialogue, faction HQ buildings, and NPC-to-NPC world-building barks. 5-phase implementation roadmap.

| Section | Content |
|---------|---------|
| §1 Books Audit | 52-book catalog review, non-fiction wrapping problem, bookshelf placement requirements, fix list |
| §2 NPC Faction System | Faction uniform design (tide/foundry/admiralty role templates), NPC population targets, faction HQ buildings |
| §3 World-Building Barks | NPC-to-NPC dialogue philosophy, bark categories, choreographed 2-NPC encounters, faction interaction behaviors |
| §4 Implementation Roadmap | Phase 1 (books fix), Phase 2 (uniforms), Phase 3 (barks), Phase 4 (encounters), Phase 5 (faction HQs) |
| §5 Cross-References | Links to books.json, npc-composer.js, bark-library.js, npc-system.js |

### DOC-12: PEEK_SYSTEM_ROADMAP.md
> **Scope**: Consolidation plan for 9 duplicate peek overlay modules (~2,200 lines) into a unified PeekSystem with variant registry, lifecycle FSM, juice budget, and label system.

| Section | Content |
|---------|---------|
| §1 Architecture | PeekDescriptor schema, variant registry, lifecycle FSM (IDLE→SHOWING→OPEN→CLOSING) |
| §2 Juice Budget | Entry/open animations, glow system, particles, SFX per variant |
| §3 Label System | InteractPrompt integration, contextual labels by tile type |
| §4 Variant Catalog | All 9 tile types: door, crate, chest, corpse, merchant, bookshelf, bar, bonfire, NPC |
| §5 Migration Plan | 5-phase migration from individual modules to unified PeekSystem |

### DOC-13: STREET_CHRONICLES_NARRATIVE_OUTLINE.md
> **Scope**: Core narrative structure — MSS operative cover, three-faction conspiracy (Tide Council, Foundry Collective, Admiralty), dragon compact, and the Gleaner's role in the conspiracy.

### DOC-14: TEXTURE_ROADMAP.md
> **Scope**: 3-layer visual upgrade plan — flat-colored Wolfenstein walls → Octopath Traveller-style pixel-art textures. Procedural 64×64 texture generation and caching. Layer 2 (wall decor) and Layer 3 (sprite light emitters) are shared implementations with LIGHT_AND_TORCH_ROADMAP — see cross-references section at bottom of doc.

### DOC-15: SPRITE_STACK_ROADMAP.md
> **Scope**: Triple-emoji sprite composition system (head/torso/legs) with layered accessories, replacing single-emoji rendering for NPCs and enemies.

### DOC-16: SUIT_SYSTEM_ROADMAP.md
> **Scope**: Playing card suit element system — RPS combat triangle (♣>♦>♠>♣), ♥ as rule-breaker/healing, biome suit alignment.

### DOC-17: SKYBOX_ROADMAP.md (v2)
> **Scope**: v1 parallax sky complete. v2 adds day/night cycle (sky color cycling, celestial bodies, star parallax, time widget), Floor 3 ocean sky, weather system. Cross-references LIGHT_AND_TORCH for building entrance glow, TEXTURE for frontier biome.

### DOC-18: NLAYER_RAYCASTER_ROADMAP.md
> **Scope**: N-layer compositing for half-height see-over tiles, floor visibility, and exterior map depth. Replaces 2-layer background hack. Cross-references TEXTURE Layer 2 (shared raycaster loop) and LIGHT_AND_TORCH (shared frame budget).

### DOC-31: LIGHT_AND_TORCH_ROADMAP.md
> **Scope**: Dynamic light sources in Lighting.js, torch wall sprites, extinguish/refuel game loop. Phase 1 ≡ TEXTURE Layer 3 (same implementation). Phase 2 consumes TEXTURE Layer 2 wall decor model.
> **Phase 1 ✅ DONE**: Tint palette system (NONE/WARM/SICKLY), quadratic falloff, flicker animation (torch/bonfire/steady), per-tile tint index + intensity maps, raycaster integration with `_tintedDark()` overlay, TERMINAL tile (36) with sickly green glow + CRT wall texture + decor sprite + BookshelfPeek terminal category routing, 5 terminal books in books.json, interior auto-electric lights (Doom sector model).
> **Phase 6 (post-jam)**: Ceiling light fixture sprites — requires ceiling casting pass or ceiling-mounted billboard system in raycaster. Seams documented in roadmap §6a–6d.

### DOC-32: UNIFIED_EXECUTION_ORDER.md (v3)
> **Scope**: Single source of truth for implementation sequencing across ALL roadmaps. Sprint 0 (inventory/card/menu rework, 15h) as prerequisite → three parallel tracks (A: raycaster/texture/lighting, B: skybox/day-night, PW: pressure washing/hose) → Floor 3 convergence → EyesOnly convergence sprints S1–S5 (33h). Track PW cross-depends on Track A step A7 (torch slot model) for torch-hit wiring. References DOC-46, DOC-47, DOC-48.

### DOC-19: DOOR_EFFECTS_ROADMAP.md
> **Scope**: Three-phase visual door transition effects (approach/pass/exit) replacing hard-cut black loading screens.

### DOC-20: COMBAT_DRAG_SYSTEM.md
> **Scope**: Drag-and-drop card interactions for reordering, stack building, and synergy matching in the hand fan during combat.

### DOC-21: GAME_FLOW_ROADMAP.md
> **Scope**: Pause menu 4-face rotating box (minimap/items/gear/system), screen state transitions, ScreenManager wiring.

### DOC-22: HUD_ROADMAP.md
> **Scope**: Terminal-themed HUD layout — ASCII canon, status bars, card tray, minimap, quick-bar, interaction mandate.

### DOC-23: UI_ROADMAP.md
> **Scope**: Reusable UI components (DialogBox, Toast, inventory data model) feeding into the rotating box menu system.

### DOC-24: B5_INVENTORY_INTERACTION_DESIGN.md
> **Scope**: 8-zone inventory system with drag-drop transfers between hand, backup deck, bag, and stash for card loadout management.

### DOC-25: B6_SLOT_WHEEL_AND_TRANSACTION_LAYOUT.md
> **Scope**: Scrolling 5-slot SlotWheel widget for bag/deck items beyond position 5, card rendering in inventory views.

### DOC-26: UNIFIED_INVENTORY_METADATA_CONTRACT.md
> **Scope**: Canonical item/card/collectible schema — registries in items.json, cards.json, enemies.json, loot-tables.json.

### DOC-27: JAM_COMPLIANCE.md
> **Scope**: DC Jam 2026 mandatory requirement audit — first-person, grid movement, keyboard controls, procedural dungeons, combat, cards, inventory.

### DOC-28: ROADMAP.md
> **Scope**: Original 8-pass extraction roadmap from EyesOnly scaffold to playable dungeon crawler.

### DOC-29: hud-ui-debugging-notes.md
> **Scope**: Active debugging priorities — minimap embedding, floor label repositioning, battery display, NCH widget, bag menu.

### DOC-30: BONFIRE_POLISH_STEPS.md
> **Scope**: Bonfire & hearth interaction audit and polish roadmap. Covers: current-state audit of all bonfire interactions (waypoint, stash, rest, warp, incinerator), tile types (BONFIRE/HEARTH/BED), MenuBox bonfire context (4 faces), day/night cycle integration, visual distinction by depth tier, UI polish, waypoint/warp network expansion, and interaction differentiation (exterior campfire vs dungeon hearth vs home bed). Cross-references 10 related docs.

| Section | Content | Status |
|---|---|---|
| Current State Audit | Tile types, interaction flow, MenuBox faces, stash, incinerator, lighting, generation | Reference |
| §1 Exterior Campfire Blockout | C-shape shrub ring, tent billboard, stone ring wall | ✅ DONE |
| §2 Dungeon Hearth | HEARTH tile in gen, riverrock texture, warm glow | ✅ DONE |
| §3 Fire Emoji Sprite Overlay | Bobbing 🔥 billboard sprite, glow, scatter sparks | Post-jam |
| §4 Crackle Audio | `fire_crackle` proximity loop, volume scaling | Stub ✅ |
| §5 Media Asset Encoding | ffmpeg encode from EyesOnly MEDIA_ASSETS | Manual |
| §6 Debrief Incinerator | DragDrop zone, rarity refund, glow animation | ✅ DONE |
| §7 Day/Night Cycle Integration | 6 tasks (7a–7f): rest-until-dawn (jam), WELL_RESTED/TIRED, glow scaling, morning recap, week-strip fix | ✅ COMPLETE |
| §8 Visual Distinction by Depth | 6 tasks (8a–8f): 3 glow tiers (campfire/home/dungeon), nervous flicker, smoke/ember particles | Planned |
| §9 Bonfire UI Polish | 7 tasks (9a–9g): animated fire emoji, status cleared/gained, waypoint toast, stash hints, warp confirm | Planned |
| §10 Waypoint & Warp Network | Bonfire-to-bonfire warp, warp cost, minimap icons, discovery toast | Post-jam |
| §11 Interaction Differentiation | Exterior vs dungeon vs home: time advance, WELL_RESTED, safety, unique verbs | Planned |
| §12 Cross-References | 10 entries linking DOC-7, DOC-17, DOC-31a, DOC-14, DOC-21, DOC-2, DOC-10, DOC-46, DOC-6, DOC-50 | Reference |

### DOC-32: TOOLTIP_BARK_ROADMAP.md
> **Scope**: Tooltip history system, NPC bark delivery, speech gesture rendering (KaomojiCapsule), depth-scaled bark radius, dialogue ping-pong, and post-jam tooltip space vision. References EyesOnly TOOLTIP_SPACE_CANON.md for production target.

| Section | Content |
|---|---|
| S1–S7 (Jam) | Toast→StatusBar bridge, card/deck tooltips, depth bark radius, speech capsule, ping-pong, WorldPopup, UI polish | ✅ DONE |
| Phase 1 | Clickable tooltip replies (inline NPC dialogue choices) | Planned |
| Phase 2 | NPC bark content audit against narrative outline | Planned |
| Phase 3 | Bark gesture variety (context kaomoji per NPC type) | Planned |
| Phase 4 | Tooltip filtering & search (category tabs, text search) | Planned |
| Phase 5 | Spatial audio bark attenuation (distance opacity, stereo pan) | Planned |
| Phase 6 | EyesOnly Tooltip Space Canon port (full production spec) | Far future |

### DOC-50: SPATIAL_AUDIO_BARK_ROADMAP.md
> **Scope**: Post-jam unified directional audio + visual bark system. SpatialDir resolver (pure math), AudioSystem StereoPannerNode panning, viewport direction ring (SVG, 8-axis), directional bark popups, enemy proximity audio, ambient spatial sources, muffled door BGM (OoT BiquadFilterNode lowpass pattern), biome music continuity (same-biome adjust vs cross-biome crossfade vs dungeon hard-switch). Extends DOC-6 AUDIO_ENGINE and DOC-32 TOOLTIP_BARK_ROADMAP Phase 5.

| Section | Content |
|---|---|
| Phase 0 | SpatialDir resolver — angle, distance, cardinal, pan from world position (1h) |
| Phase 1 | AudioSystem StereoPannerNode panning with `position` option (2h) |
| Phase 2 | Viewport direction ring — SVG, 8 fixed axis positions, reticle dual-purpose (2h) |
| Phase 3 | Directional bark popups — NPC srcX/srcY forwarding, off-screen suppression (2.5h) |
| Phase 4 | Enemy proximity audio — footstep spatial, threat ring indicators (1.5h) |
| Phase 5 | Ambient spatial sources — bonfire, torch, ocean, door barks (1h) |
| Phase 6 | Muffled door BGM — OoT pattern, BiquadFilterNode lowpass, bgmLeak spatial contract, crossfade on entry (1.5h) |
| Phase 7 | Biome music continuity — same-biome adjust, cross-biome crossfade, dungeon hard-switch (1h) |
| Design Decisions | Ring (not compass bar), exaggerated pan ×1.3, 8-axis fixed positions, reticle dual-purpose |
| Cross-References | 16 entries linking DOC-6, DOC-7, DOC-9, DOC-10, DOC-11, DOC-30, DOC-32, engine files |

### DOC-31: COBWEB_TRAP_STRATEGY_ROADMAP.md
> **Scope**: Strategic design roadmap for cobweb and trap embellishment systems. Covers: the "clean inward, arm outward" loop, self-trigger penalty mechanics, economic resource costs (Silk Spider, Trap Kit), proc-gen contract bonus objectives, windsail cobweb visual upgrade with third-space rendering and hover interaction, reinforced web/trap tiers, enemy pathfinding integration, and cobweb ecology far-future vision.

| Section | Content |
|---|---|
| Phase 1 (Jam) | Trap re-arm + cobweb deploy + self-trigger cycle | ✅ DONE |
| Phase 2 | Economic cost — Silk Spider, Trap Kit consumables | Planned |
| Phase 3 | Proc-gen contract bonus objectives | Planned |
| Phase 4 | Windsail visual — third-space texture, billow anim, hover | Planned |
| Phase 5 | Reinforced variants — web tiers, trap tiers | Planned |
| Phase 6 | Enemy pathfinding — AI avoidance, awareness events | Planned |
| Phase 7 | Cobweb ecology — nesting, web networks, environmental | Far future |

### DOC-33: GAP_ANALYSIS.md
> **Scope**: Comprehensive cross-phase status audit of implemented features against design roadmap, with task completion tracking through jam deadline. Sprint-level gap inventory referenced by Phase C.5 tasks.

### DOC-34: UNIFIED_UI_OVERHAUL.md
> **Scope**: Consolidated design system unifying the paper/hazmat/CRT aesthetic trichotomy — color palette, sizing scale, font hierarchy, and component styling across HUD, menus, and overlays.

### DOC-35: DEBUG_NOTES_SCREENER.md
> **Scope**: Active UI polish and debugging checklist — title screen, class selection, settings menu styling, in-game HUD issues, and interaction bugs. Living document updated per debug pass.

### DOC-53: PLAYTEST_AND_BLOCKOUT_PROCEDURE.md
> **Scope**: Pre-submission sprint procedure. Jam-scope audit results (130 files, no competing systems, index.html truncation fix), blockout execution order (Pass 1: exteriors → Pass 2: interiors → Pass 3: dungeons, pressure wash parallel), regimented playtest→debug→fix cycle with 9 scenarios (A–I), contracted playtester guide (setup, reporting template, known limitations vs real bugs), bug triage template (repurposed from DEBUG_NOTES_SCREENER format), stale feedback filter for April 2 pulls.

### DOC-36: FACE2_INVENTORY_POLISH.md
> **Scope**: Known issues and interaction improvements for the inventory UI (MenuBox Face 2) — slot sizing, drag-drop conflicts, affordance clarity, and visual feedback.

### DOC-37: INPUT_CONTROLLER_ROADMAP.md
> **Scope**: Input parity audit for keyboard, click, and D-pad controls. Identified gaps, gamepad support plan, and Magic Remote mapping notes.

### DOC-38: PLAYER_CONTROLLER_ROADMAP.md
> **Scope**: Movement controller architecture reference — dual-queue lerp system, interpolation model, speed tuning benchmarks, and collision edge cases.

### DOC-39: SHOP_REFRESH_ECONOMY.md
> **Scope**: Staggered inventory refresh mechanics across faction shops — scarcity-driven economy, purchasing urgency, and restock timing per hero cycle.

### DOC-40: SPRITE_COMMISSIONING_MAP.md
> **Scope**: Artist brief for sprite replacements prioritized by rendering need — critical visual clarity fixes, NPC/enemy portraits, and particle effects.

### DOC-41: SPRITE_LIBRARY_PLAN.md
> **Scope**: Sprite asset budget and jam-reasonable animation frame specifications — coin flip, smoke, light-burst particles, and NPC idle cycles.

### DOC-42: SPRITE_STUB_ROADMAP.md
> **Scope**: Code-side implementation plan for layering artist PNG sprites with emoji fallback across raycaster, particle system, and UI components.

### DOC-43: AGENT_BLOCKOUT_INSTRUCTIONS.md
> **Scope**: Level design guidelines for creating modular, interconnected floor spaces — building archetypes, critical-path navigation, and spatial composition rules.

### DOC-49: BLOCKOUT_ALIGNMENT.md
> **Scope**: Gap analysis between floor blockout vision (Morrowind density ramp: Seyda Neen→Balmora→Vivec) and current implementation. Floor 0-3 proposed changes, density ramp, NPC counts, building archetype templates.
> **Floor tile texture composition ✅ A4.5**: ROAD/PATH/GRASS walkable tile types with tileFloorTextures contract wiring. Transition blending (Grey-Scott) POST-JAM.
> **Boardwalk fence rail ✅ A4.5**: FENCE tile (35), 0.4× half-wall, fence_wood + floor_boardwalk textures. Chainlink/metal POST-JAM (alpha wall path dependency).
> **Bonfire rework ✅ A4.5**: 0.3× stone ring with cavity glow. Cross-refs LIGHT_AND_TORCH Phase 2.5.

### DOC-44: EYESONLYS_TOOLTIP_SPACE_CANON.md
> **Scope**: Production-target reference from EyesOnly — responsive tooltip and NPC dialogue system dimensions for desktop, tablet, and mobile breakpoints.

### DOC-45: INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md
> **Scope**: Comprehensive audit mapping DG containers to EyesOnly, 9 confirmed bugs, 6-phase fix plan, transfer matrix, consistency checklist, decision log.

### DOC-48: PRESSURE_WASHING_ROADMAP.md
> **Scope**: Pressure washing system — hose pickup from cleaning truck (hero day spawn), sub-tile grime grids (4×4 floor, 16×16 wall), brush/spray interaction with nozzle items, hose path recording with kink detection (0.7× pressure stacking), "roll up hose" retrace-path auto-exit via repurposed MinimapNav, minimap click distance gate (5+itemN), torch extinguish via spray (zero fuel hydration — intentionally inferior to TorchPeek careful method), cleaning truck as BPRD-style vehicle with bobbing 🧵 cutout. EyesOnly RopeManager explicitly rejected in favor of MinimapNav + MC movement queue.

| Section | Content |
|---|---|
| §1 Design Vision | Core fantasy, hose-as-optional-upgrade |
| §2 Hose Object | Truck spawn, HosePeek, HoseState lifecycle, building validation, energy cost |
| §3 Hose Path | Trail recording, kink detection, minimap overlay |
| §4 Roll Up Hose | Reel-in auto-exit, retraces recorded path, MinimapNav distance gate |
| §5 Sub-Tile Grime Grid | Dual resolution (4×4 floor, 16×16 wall), rendering as translucent tint |
| §6 Beam/Spray Interaction | Aiming, brush kernels, nozzle modifiers, pressure/kink effect |
| §7 Torch Extinguish | Hose spray extinguish (zero hydration), adjacent splash, dependency on LIGHT_AND_TORCH Phase 3 |
| §8 Nozzle Items | Fan nozzle, Cyclone nozzle, equip slot |
| §9 Readiness Integration | GrimeGrid fractional cleanliness → CleaningSystem |
| §10 Module Plan | 6 new modules, 9 modified modules, RopeManager rejection |
| §11 Execution Plan | PW-1 through PW-5 (~12.5h), Track A cross-dependency at PW-3 |
| §12 Post-Jam Vision | Saddle mirror, volumetrics, gyroscope, phase-locked grime |
| §13 Cross-References | LIGHT_AND_TORCH, INVENTORY_CARD_MENU_REWORK, UNIFIED_EXECUTION_ORDER |

### DOC-46: INVENTORY_CARD_MENU_REWORK.md
> **Scope**: Full architecture rework replacing DG's fragmented card/inventory/menu systems. Audit of 3–4 competing storage models, two card renderers (CardDraw canvas vs CardRenderer DOM), unregistered drag-drop zones, and direct state mutations. Ports EyesOnly's CardStateAuthority pattern → CardAuthority (single read/write gateway, event emitter, serialize/deserialize, death reset with tiered persistence). CardTransfer (validated zone-to-zone moves with rollback, drop zone registry). MenuInventory (new pause menu surface, grid navigation, CardDraw as sole renderer). 5-step execution plan (~15h): build authority+transfer → rewire existing → build MenuInventory → delete dead code → regression test. Bug-to-fix mapping traces every visible bug to architectural root cause. **Sprint 0 prerequisite** — blocks all visual roadmap tracks and EyesOnly convergence sprints.

| Section | Content |
|---|---|
| §1 Audit | Storage fragmentation analysis, drag-drop ghost code, renderer duplication |
| §2 CardAuthority | State shape, event system, serialization, death reset, EyesOnly pattern source |
| §3 CardTransfer | Zone-to-zone validation, rollback, drop zone registry, transfer functions |
| §4 MenuInventory | ASCII layout mockup, grid navigation, CardDraw rendering, zone registration |
| §5 Refactor Specs | Player.js, CardSystem.js, CardFan.js, Salvage.js, Shop.js, HUD.js rewire |
| §6 Execution Plan | 5 steps, 15h total, load order update, deleted files list |
| §7 Bug Mapping | Each visible bug → architectural root cause → rework fix |

### DOC-47: EYESONLY_3D_ROADMAP.md
> **Scope**: Convergence roadmap — DG's engine (raycaster, skybox, minimap, movement, camera, inputs, N-layer) + DG's narrative (conspiracy, factions, Gleaner pivot, cleaning loops) + EyesOnly's proven game systems (LightingSystem, TagSynergyEngine, EnemyIntentSystem, StatusEffects, card quality tiers, loot scatter, save/load, audio stems). Only ONE DG module replaced (lighting.js 63 lines → EyesOnly LightingSystem 1,106 lines); everything else additive. Sprint structure: S0 (15h inventory/card/menu rework) → S1 (7h EyesOnly extractions) → S2 (7h combat rewire) → S3 (10h engine polish) → S4 (5h cleaning loop wire) → S5 (4h narrative + ship) = 48h total.

| Section | Content |
|---|---|
| §1 What Stays from DG | 16 engine modules (raycaster, skybox, minimap, movement, etc.) |
| §2 What Comes from EyesOnly | LightingSystem, TagSynergyEngine, EnemyIntentSystem, card quality, loot scatter, save/load, audio |
| §3 Sprint 0 | Inventory/Card/Menu Rework (prerequisite, references DOC-46) |
| §4 Sprint 1 | EyesOnly system extractions (IIFE adaptation, API mapping) |
| §5 Sprint 2 | Combat rewire (intent→telegraph→resolve, synergy combos) |
| §6 Sprint 3 | Engine polish (loot, save/load, audio, proc-gen) |
| §7 Sprint 4 | Cleaning loop wire (tool quality, torch system) |
| §8 Sprint 5 | Narrative + ship (factions, conspiracy, Act 1 choice) |

### DOC-51: CINEMATIC_CAMERA (engine/cinematic-camera.js)
> **Scope**: OoT-inspired letterbox + focus lock system. Black bars slide in top/bottom, viewport narrows, FOV zooms, camera can shake or lock onto a target angle. Renders after raycaster, before HUD. 310 lines, 6 presets built, 0 fully wired. Cross-cutting — consumed by combat, NPC dialogue, MonologuePeek, Dragonfire bonfire, boss rooms, and peek system.

| Section | Content | Status |
|---|---|---|
| Engine module | cinematic-camera.js — state machine, bar animation, FOV lerp, focus lerp, shake decay, auto-close | ✅ Built |
| Preset: combat_lock | Fast bars (12%), slight FOV zoom, no input lock | ✅ Defined, ✅ **Wired** (CombatBridge._beginCombat → start, _onCombatEnd → close) |
| Preset: dispatcher_grab | Medium bars (15%), forced turn, input lock, 3s duration | ✅ Defined, ✅ **Wired** (proximity choreography + forced turn) |
| Preset: monologue | Thick bars (18%), slow slide, no camera move, input lock | ✅ Defined, ❌ Not wired |
| Preset: morning_recap | Very thick bars (22%), dreamy FOV wide, input lock | ✅ Defined, ✅ Wired (game.js §7f → MonologuePeek) |
| Preset: boss_entrance | Thick bars + shake (6px), fast slam, strong zoom | ✅ Defined, ❌ Not wired |
| Preset: peek | Thin bars (8%), subtle FOV, no input lock | ✅ Defined, ❌ Not wired |
| Preset: dragonfire_dialogue | **NEW** — Dragonfire triggers dialogue tree through fire | ❌ Not yet defined |
| NPC turn-and-face | MC.startTurn() + Player.setDir() from grab choreography | ✅ **Fixed** — forced turn via MovementController, not camera focus angle |
| NPC translucency | Clothes color overlay (per-slot tint via offscreen canvas + source-atop) | ✅ **Fixed** — per-slot tinting replaces full-stack overlay |

**Blockers:** ~~NPC turn-and-face regression~~ FIXED. ~~Clothes overlay translucency~~ FIXED (per-slot tint). No remaining blockers for cinematic wiring.

**Jam priority:** ~~Fix turn-and-face~~ ✅ → ~~wire dispatcher_grab to Tutorial gate 2~~ ✅ → ~~wire morning_recap to §7f flag~~ ✅ → ~~wire combat_lock~~ ✅. 3/7 wired — sufficient for jam.

**Post-jam:** dragonfire_dialogue, boss_entrance, peek.

---

### DOC-52: READINESS_BAR_ROADMAP.md
> **Scope**: Full readiness system design — bar visual FX (constellation tracer port), two-tier scoring model (core 0–100% + extra credit 0–100% = 0–200% overhealing), staggered dungeon schedule, death-shift mechanics, combo multiplier, heart dungeon confrontation, and DungeonSchedule module architecture. Covers the jam's conflict-resolution/win-state requirement.

| Section | Content | Status |
|---|---|---|
| §1 Readiness Bar Visual Design | Canvas bar constants, constellation tracer FX, interaction sweep / fill pump / rescind slide animations, overhealing glow | 📐 Spec done |
| §2 Readiness Score Model | Core weights (crate 35%, clean 25%, torch 20%, trap 20%), extra credit weights (corpse 30%, cobweb 15%, overclean 10%, vermin/puzzle/doors/suit stubs) | ✅ ReadinessCalc refactored |
| §3 Bonfire Warp Threshold | Core score gating for dragonfire warp, advance-to-next-dungeon flow | ✅ menu-faces.js updated |
| §4 Morning Report & Mailbox | Hero-day reporting engine, dependency chain, mailbox-peek integration | 📐 Spec done |
| §5 Revolving Mini Win-State | Cycle Report Card (0–5 stars), escalating targets, victory/failure conditions | 📐 Spec done |
| §6 Dependency Graph | Full system dependency DAG | 📐 Spec done |
| §7 Implementation Priority | R-1 through R-6 phased plan, R-3 = DungeonSchedule module | 📐 Spec done |
| §8 Cross-References | Links to DOC-7, DOC-2, DOC-30, DOC-22, DOC-11 | Reference |
| §9 Staggered Dungeon Schedule | Groups A/B/C, 8-day jam arc timeline, DungeonContract data model | 📐 Spec done |
| §10 Death-Shift Mechanics | Per-group rules, narrative justification, 5 edge cases | 📐 Spec done |
| §11 Combo Multiplier | Porta-john clipboard streak, 1.0x→1.3x rules, payout examples, dispatcher board juice | 📐 Spec done |
| §12 Heart Dungeon | Floor 0.N.N, employer faction (♥), Day 8 confrontation, 4 ending variants | 📐 Spec done |
| §13 DungeonSchedule Module | Layer 1 module shape, integration points, JAM_CONTRACTS config | ✅ Built + tested |
| §14 Mailbox System | Physical exterior tile (bonfire pattern), interior history peek (bookshelf pattern), MailboxPeek refactor, R-5a phase plan | 📐 Spec done |

**Implementation**: `engine/readiness-calc.js` (✅ refactored), `engine/hud.js` (✅ bar rendering), `engine/dungeon-schedule.js` (✅ built + 26 tests pass), `engine/mailbox-peek.js` (🔨 refactor pending §14)
**Design refs**: DOC-7 §5 (economy/day loop), DOC-2 §16 (dungeon reset), DOC-30 (bonfire), DOC-22 (HUD layout), DOC-11 (factions)

### DOC-54: INTERACTIVE_OBJECTS_AUDIT.md
> **Scope**: Tile-by-tile rendering and interaction audit for every non-WALL opaque tile. Created during the sprite-inside-wall → step-fill cavity pivot. Documents two critical bugs fixed (biome override erasure, bonfire menu trap), full height/texture/interaction-mode matrix across exterior/interior/dungeon biomes, and remaining issues (CHEST walk-on inconsistency, TORCH exterior height mismatch, BREAKABLE interior height).

| Section | Content | Status |
|---|---|---|
| Critical Bug: Biome Override Erasure | `tileWallHeights` replacing base defaults entirely — all biomes now explicit | ⚠️ Fixed |
| Critical Bug: Bonfire Menu Trap | No interaction cooldown after menu close → inescapable re-open loop on LG | ⚠️ Fixed |
| Tile-by-Tile Audit | 20-tile matrix: ID, walkability, opacity, height per biome, texture, visual composition | ✅ Reference |
| Remaining Issues | CHEST walk-on vs short-wall, TORCH exterior height, BREAKABLE interior height | ❌ Open |
| Interaction Modes Summary | Step-on auto, F-interact, Peek auto-show, NPC interact — full trigger matrix | ✅ Reference |
| Session 2 Fixes | Billboard sprite centering (double +0.5 offset in mailbox/bonfire sprites) | ⚠️ Fixed |
| Session 3 Fixes | Alpha-porthole abandoned → step-fill cavity technique adopted for HEARTH/BONFIRE | ⚠️ Fixed |
| Files Changed | 10 engine files + 3 docs across 3 sessions | Reference |

**Cross-refs**: DOC-31a (step-fill cavity §2.5), DOC-30 (bonfire polish), DOC-49 (blockout alignment), DOC-55 (interaction catalog)

### DOC-55: MENU_INTERACTIONS_CATALOG.md
> **Scope**: Complete interaction catalog for the 4-face rotating box menu (minimap/context, inventory, gear/journal, system settings), HUD footer bar (StatusBar), and all peek overlays. Every clickable element, display-only element, and stub-needed element with status (complete/stub/wired). Generated during Sprint 0 visual overhaul.

| Section | Content |
|---|---|
| Face 0 — Minimap/Context | Pause, Bonfire, Shop, Harvest contexts — map display, warp button, faction rows |
| Face 1 — Inventory | Card slots, bag grid, equipped quick-slots, drag-drop zones, sell parts |
| Face 2 — Journal/Gear | Work orders, stat page, settings stubs |
| Face 3 — System Settings | Volume, controls, quit stubs |
| StatusBar Footer | Tooltip feed, HP/energy pips, battery, currency |
| Peek Overlays | Per-tile peek trigger catalog cross-referenced with DOC-54 interaction modes |

**Cross-refs**: DOC-21 (game flow), DOC-36 (Face 2 polish), DOC-54 (interaction audit), DOC-12 (peek system)

### BONFIRE_BRAINSTORMING.md (companion to DOC-30)
> **Scope**: Design brainstorming session for bonfire contextual contracts — baseline bonfire primitive + paired context providers (NPC/object/tile). Establishes the "bonfire = anchor, context = permissions" model that DOC-30 §11 implements. Covers waypoint/stash/time-advance gating by context type (campground, inn, home, dungeon deep).

### DOC-56: RESOURCE_DESIGN.md
> **Scope**: Economy primitives — gold, battery, food, and any secondary resources. Mint rates, drop tables, bonfire exchange values, tool durability costs. Design reference for balancing the Gleaner's daily budget against dungeon readiness thresholds.

**Cross-refs**: DOC-39 (shop economy), DOC-7 (core loop), DOC-1 (T2 economy tier)

### DOC-57: CRATEUI_INTERACTION_OVERHAUL.md
> **Scope**: CrateUI visual and interaction overhaul. Covers the peek-slot withdraw flow, grid layout changes, drag-to-reorder within crate, and integration with the unified inventory metadata contract (DOC-26). The canonical reference for crate open/close lifecycle and slot hydration.

**Cross-refs**: DOC-45 (inventory audit), DOC-26 (metadata contract), DOC-55 (interaction catalog)

### DOC-58: PEEK_BOX_VISUAL_AUDIT.md
> **Scope**: Visual audit of all PeekBox variants (chest peek, item inspect, tile peek, entity inspect). Documents render size, border style, typography, icon placement, and close/confirm button layout. Identifies inconsistencies vs the EyesOnly tooltip canon.

**Cross-refs**: DOC-44 (tooltip space canon), DOC-12 (peek system), DOC-55 (interaction catalog)

### DOC-59: DEPTH3_CLEANING_LOOP_BALANCE.md
> **Scope**: Depth-3 (Ironhold B3) cleaning loop balance spec. Detritus breakable counts, indestructible crate placement, weight override rules, bag-capacity formula (21+N items), and the "tempo quick-fill" heuristic for high-pressure cleaning runs. See memory file design_depth3_loop.

**Cross-refs**: DOC-52 (readiness bar), DOC-48 (pressure wash), DOC-1 (T2 balance)

### DOC-60: AUDIO_SFX_COMMISSIONING_AUDIT.docx
> **Scope**: SFX commissioning audit — maps every in-engine AudioSystem.play() call key to its source file status (✅ shipped / 🔸 stub / ❌ missing). Includes priority tier (jam-critical vs post-jam), suggested substitute keys for stubs, and notes from the audio CORS fix pass.

**Cross-refs**: DOC-6 (audio engine), DOC-50 (spatial bark), docs/itch-submission-kit.md (audio size budget)

### DOC-61: FLOOR2_BLOCKOUT_PREP.md
> **Scope**: Pre-blockout planning notes for Floor 2 (Lantern Row). Covers six-pod layout proposal, NPC placement, connection edges to Floor 2.1 (Vaultmaster's Sanctum) and Floor 2.2 (Watchman's Post / Hero's Wake), and prerequisite fixes needed before blockout begins.

**Cross-refs**: DOC-49 (blockout alignment), FLOOR2_BLOCKOUT.md

### DOC-62: POST_JAM_ITEM_ROADMAP.md
> **Scope**: Post-jam item expansion roadmap. New consumable categories, tool tiers, equipment slots, crafting primitives, and the full item-metadata contract extensions needed for multi-dungeon arc replayability. Deferred from jam build — no jam-deadline dependency.

**Cross-refs**: DOC-26 (metadata contract), DOC-45 (inventory audit)

### DOC-63: itch-game-page.md
> **Scope**: itch.io game page copy — title blurb, long description, tags, content warnings, screenshots/GIF list. Living doc: should match whatever is live on the itch page at time of submission.

**Cross-refs**: DOC-64 (submission kit), DOC-27 (jam compliance)

### DOC-64: itch-submission-kit.md
> **Scope**: Build + upload checklist for the itch.io submission. Zip command, exclusion list (with explicit note to NOT exclude `media_assets/audio/` — that's the audio manifest basePath), expected payload size (~50 MB / ~585 files), and troubleshooting entries for CORS, audio-on-itch, and upload-rejected-for-size errors. Updated 2026-04-04 (audio exclusion fix).

**Cross-refs**: DOC-63 (page copy), DOC-65 (pre-flight), DOC-6 (audio engine)

### DOC-65: pre-flight-walk.md
> **Scope**: Jam-day pre-flight checklist generated by cross-referencing GAP_ANALYSIS, CORE_GAME_LOOP_AND_JUICE, Tutorial_world_roadmap, and itch-submission-kit. Red flags, go/no-go criteria, and ordered verification steps to run in the last 20 hours before submission.

**Cross-refs**: DOC-33 (gap analysis), DOC-7 (core loop), DOC-2 (tutorial world), DOC-64 (submission kit)

### DOC-66: quest-marker-audit.md
> **Scope**: Quest marker system audit — root-cause of the "lost between floors" regression, phase-by-phase null-drop analysis, jam-day patch description (applied 2026-04-04 to `_updateQuestTarget()` in game.js), and post-jam rework spec for a data-driven `QuestChain` module anchored to `DumpTruckSpawner`. Includes a five-path verification walk.

**Cross-refs**: engine/game.js (`_updateQuestTarget`), engine/dungeon-schedule.js, engine/dump-truck-spawner.js, engine/minimap.js

---

## Cross-Roadmap Execution Order

Phases are dependency-ordered. Each phase lists its source document, section reference, estimated hours, and what it unblocks. **All phases must complete for a playable prototype.**

Total estimate: **~42–52 hours across 8 days** (5–6.5h/day average).

---

### 🟢 PHASE A.0 — Pre-Phase: Morning Send-Off & Key Gate *(new)*
> Initial player experience: scripted walk → ambient barks → Dispatcher gate → home fetch → dungeon unlocks.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| A0.1 | `engine/bark-library.js` — Fable-style bark engine | DOC-2 TUTORIAL | §18.3 | 1.5h | ✅ DONE |
| A0.2 | `data/barks/en.js` — all bark text pools | DOC-2 TUTORIAL | §18.3 | 1h | ✅ DONE |
| A0.3 | `intro-walk.js` — `bark` step type + `HOME_DEPARTURE` sequence | DOC-2 TUTORIAL | §18.6 | 30m | ✅ DONE |
| A0.4 | `npc-composer.js` — `dispatcher` vendor preset | DOC-2 TUTORIAL | §18.4 | 15m | ✅ DONE |
| A0.5 | `floor-manager.js` — Floor 1.6 + home biome + DOOR(17,7) | DOC-2 TUTORIAL | §18.5 | 1h | ✅ DONE |
| A0.6 | `game.js` — BarkLibrary.setDisplay(), _onFloorArrive(), Dispatcher spawn, key-check | DOC-2 TUTORIAL | §18.3/18.4 | 1.5h | ✅ DONE |
| A0.7 | Polish: Dispatcher despawn animation, `npc.dispatcher.gate.unlocked` bark | DOC-2 TUTORIAL | §18.7 | 30m | Post-jam |

**New files**: `engine/bark-library.js` (Layer 1), `data/barks/en.js` (Layer 5)
**Modified**: `engine/intro-walk.js`, `engine/npc-composer.js`, `engine/floor-manager.js`, `engine/game.js`, `index.html`

**Phase A.0 total**: ~5.75h (A0.1–A0.6 complete, A0.7 post-jam polish)
**Unblocks**: Phase A (combat system can now place enemies in a world the player can actually reach), Phase B (crate economy lands in a dungeon the player enters correctly)
**Design refs**: DOC-2 §18, DOC-JUICE §5.2, §6.6

---

### 🟢 PHASE A — Combat Finish & Stealth Extraction (Day 1: Mar 28) ✅ COMPLETE
> Parallel work: close remaining combat gaps while extracting stealth system.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| A1 | Enemy attack telegraph | DOC-1 GAP | T1.5 | 2h | ✅ DONE (EnemyIntent module + CombatBridge integration) |
| A2 | Death anim → corpse tile | DOC-1 GAP | T1.6 | 1h | ✅ DONE (DeathAnim → CorpseRegistry → grid placement) |
| A3 | Extract stealth-system.js | DOC-3 GONE_ROGUE | Pass 3.9 | 2h | ✅ DONE |
| A4 | Extract awareness-config.js | DOC-3 GONE_ROGUE | Pass 3.10 | 30m | ✅ DONE |
| A5 | ~~Minimap sight cones~~ | DOC-3 GONE_ROGUE | Pass 3.11 | ~~2h~~ | **✅ DONE** |
| A6 | ~~HUD 2× scale~~ | DOC-5 AUDIT | 3.2 UI | ~~1h~~ | **✅ DONE** |

**Phase A total**: ALL 6 TASKS COMPLETE ✅
**Unblocks**: Phase B (crate system needs corpse tiles for monster reassembly), Phase D (stealth extraction enables Hero AI)

---

### 🟠 PHASE B — Crate & Corpse Slot System & Restocking Loop (Days 2–3: Mar 29–30)
> **Critical path.** The Gleaner pivot's core mechanic. Container, puzzle, and vendor interaction is the game.

| # | Task | Source Doc | Section | Est. | Status |
|---|------|-----------|---------|------|--------|
| B1 | Unified slot schema: crate-system.js (crates + corpse stocks) | DOC-2 TUTORIAL | §16 Phase 1 | 3h | ✅ |
| B2 | Slot UI: crate-ui.js (canvas-rendered framed boxes) | DOC-2 TUTORIAL | §16 Phase 1 | 1h | ✅ |
| B3 | Frame→resource color mapping + hydration + suit card slot | DOC-4 BIOME | §17.2 | 1h | ✅ |
| B4 | Seal reward d100 table + corpse reanimation path | DOC-2 TUTORIAL | §13.2 | 30m | ✅ |
| B4b | Corpse-peek.js (BoxAnim coffin reveal for CORPSE tiles) | DOC-4 BIOME | §17.2 | 1h | ✅ |
| B5 | Shop round-trip: buy restock supplies | DOC-1 GAP | T2 (implicit) | 1h | ✅ |
| B6 | Bag inventory viewer | DOC-1 GAP | T2.1 | 2h | ✅ |
| B7 | Stash transfer at bonfire | DOC-1 GAP | T2.2 | 1h | ✅ |

**Phase B: ALL TASKS COMPLETE.** B1–B4b implemented; B5–B7 verified as already built. Corpse stocks are functionally identical to crates but:
- Yield less loot (1–2 coins/slot vs 2–3, +3 seal bonus vs +5)
- Include a mandatory **suit card slot** requiring a matching ♠♣♦♥ combat card
- Sealing with matched suit card enables **reanimation → friendly NPC**
- Contribute to floor readiness score (25% weight alongside crate readiness)

**New files**: `engine/crate-system.js` (Layer 1), `engine/crate-ui.js` (Layer 2), `engine/corpse-peek.js` (Layer 3)
**Modified**: `corpse-registry.js` (auto-creates corpse stock + suit-gated reanimate), `breakable-spawner.js` (auto-creates crate containers), `interact-prompt.js` (Gleaner mode labels), `grid-gen.js` (floorId passthrough), `floor-manager.js` (floorId in opts)

**Phase B total**: ~9.5h — **ALL COMPLETE** ✅
**Unblocks**: Phase C (cleaning needs working crate economy), Phase E (hero encounters need restockable dungeon)
**Design refs**: DOC-4 §17.2 (crate slot schema), DOC-2 §13 (Gleaner pivot data structures)

**Phase B NPC add-ons** (see DOC-9 §6, §9):
- Vendor ambient barks + proximity bark trigger (DOC-9 §6.4) — 45m
- Register Floor 1.3 (Gleaner's Guild) interior NPCs (DOC-9 §9.4) — 30m
- Guild Clerk dialogue tree `data/dialogues/guild-clerk.js` (DOC-9 §5.3) — 1h

---

### 🟡 PHASE C — Tile Cleaning & Dungeon Reset (Days 3–4: Mar 30–31)
> The second and third gameplay loops. Grid-by-grid cleaning + readiness score.

| # | Task | Source Doc | Section | Est. | Depends On | Status |
|---|------|-----------|---------|------|------------|--------|
| C1 | Tile condition states + cleaning-system.js | DOC-2 TUTORIAL | §16 Phase 2 | 2h | — | ✅ DONE |
| C2 | Blood rendering in raycaster + readiness HUD bar | DOC-4 BIOME | §17.1 | 1.5h | C1 | ✅ DONE |
| C3 | Progressive cleaning tools (scrub speed scales with equipped tool) | DOC-2 TUTORIAL | §15 | 1h | C1 | ✅ DONE |
| C4 | Dungeon reset tasks: work-order-system.js | DOC-2 TUTORIAL | §16 Phase 3 | 2h | B1 | ✅ DONE |
| C5 | Readiness score — **REFACTORED Apr 2**: two-tier core/extra model, 0–200% overhealing, `getCoreScore()` for warp/contracts, `getExtraScore()` for bonus. See READINESS_BAR_ROADMAP.md | DOC-4 BIOME | §17.3 | 1h | C1, C4 | ✅ DONE (refactored) |
| C6 | Floor deck reshuffle on transition | DOC-1 GAP | T2.4 | 30m | — | ✅ DONE |
| C7 | Trap re-arm mechanic + cobweb module wiring | DOC-2 TUTORIAL | §16 | 30m | C1 | ✅ DONE |
| C8 | Wire work orders into game flow (post on arrive, evaluate on return) | DOC-2 TUTORIAL | §16 Phase 3 | 45m | C4 | ✅ DONE |

**Phase C status**: **ALL 8 TASKS COMPLETE** ✅. Blood rendering, HUD readiness bar, progressive cleaning tools, trap re-arm, cobweb system wiring, and work order game flow all operational.
**Unblocks**: Phase E (fully maintainable dungeon for Heroes to trash), Phase F (cleaning tools need progression unlock)
**Design refs**: DOC-4 §17.1 (cleaning), §17.3 (readiness), DOC-2 §15 (pressure wash), DOC-30 (bonfire polish), DOC-31 (cobweb/trap strategy)

---

### 🔴 PHASE C.5 — Stardew Day Loop & Status Effects (Days 3–4: Mar 30–31)
> **Critical path.** The Stardew Valley-style day loop that gives meaning to time, sleep, hero cycles, and consequences. Without this, the cleaning/restocking mechanics have no temporal pressure. Sourced from GAP_ANALYSIS.md.

| # | Task | Source Doc | Section | Est. | Status |
|---|------|-----------|---------|------|--------|
| C5.1 | `bed-peek.js` — Sleep verb, day advancement, fade-to-black → dawn | GAP_ANALYSIS | G1/Sprint 1 | 2h | ✅ DONE |
| C5.2 | `hero-run.js` — Overnight hero-run calculator (4 hero types, carnage, payout tiers) | GAP_ANALYSIS | G4/Sprint 1 | 2h | ✅ DONE |
| C5.3 | `mailbox-peek.js` — Accumulated report stack, staggered payout juice | GAP_ANALYSIS | G3/Sprint 2 | 3h | ✅ DONE |
| C5.4 | HUD day/cycle counter — "Day 2 (1/3) ⚔️ HERO DAY" with time display | GAP_ANALYSIS | G12 | 1h | ✅ DONE |
| C5.5 | `game.js` — Sprint 1+2 wiring (BedPeek↔HeroRun↔MailboxPeek pipeline) | GAP_ANALYSIS | Sprint 1-2 | 2h | ✅ DONE |
| C5.6 | `status-effect.js` — Modular buff/debuff registry (6 built-in effects, paired transitions, stat aggregators) | GAP_ANALYSIS | G5 | 2h | ✅ DONE |
| C5.7 | `status-effect-hud.js` — Buff/debuff icon rows in debrief feed, flash animations, click-for-tooltip | GAP_ANALYSIS | G5 | 1.5h | ✅ DONE |
| C5.8 | DayCycle tired/curfew split — `setOnTired` (21:00 wolf howl) + `setOnCurfew` (02:00 forced home) | GAP_ANALYSIS | G6 | 1h | ✅ DONE |
| C5.9 | WELL_RESTED ↔ TIRED paired daily cycle — sun buff by day, moon debuff at night | DOC-7 JUICE | §5.5 | 1h | ✅ DONE |
| C5.10 | Curfew card confiscation on lethal floors (depth 3+) — hero pockets a card | GAP_ANALYSIS | G6 | 30m | ✅ DONE |
| C5.11 | Depth-2 exit guard — DialogBox confirmation when leaving interior during curfew hours | DOC-10 COZY | §2 | 30m | ✅ DONE |
| C5.12 | Home door rest shortcut — rest at front door when TIRED (depth-1, no time-freeze) | DOC-7 JUICE | §5.5 | 30m | ✅ DONE |
| C5.13 | BedPeek clock fix — unpause DayCycle for REST, grant WELL_RESTED if sleep < 23:00 | DOC-10 COZY | §2 | 30m | ✅ DONE |
| C5.14 | Death → home rescue — both depths, StatusEffect debuffs, hero narrative Toasts | GAP_ANALYSIS | G11 | 1h | ✅ DONE |
| C5.15 | Player.js stat delegation — `getWalkTimeMultiplier`/`getCleanEfficiencyMod` → StatusEffect | GAP_ANALYSIS | G5 | 15m | ✅ DONE |
| C5.16 | Day 0 hero-run guard — skip overnight run on day 0 (pre-existing carnage) | GAP_ANALYSIS | Sprint 4 | 15m | ✅ DONE |
| C5.17 | Dispatcher gate → DialogBox dialogue tree — 3-branch contextual conversation | GAP_ANALYSIS | G7/Sprint 4 | 45m | ✅ DONE |
| C5.18 | Verify B1-B4 cooperates with day/night cycle (crate/corpse peeks, bonfire rest) | — | — | 30m | ✅ DONE (all isolated; added PeekSlots.close() to curfew + death rescue) |
| C5.19 | B5: Shop round-trip (buy restock supplies wired to economy) | DOC-1 GAP | T2 | 0h | ✅ DONE (already built: 3-face shop MenuBox, _shopBuy/_shopSellFromHand/_shopSellPart) |
| C5.20 | B6: Bag inventory viewer (minimal peek showing bag contents) | DOC-1 GAP | T2.1 | 0h | ✅ DONE (already built: unified inventory face with equipped/bag/hand/deck/incinerator) |

**New files**: `engine/status-effect.js` (Layer 1), `engine/status-effect-hud.js` (Layer 2), `engine/bed-peek.js` (Layer 3), `engine/mailbox-peek.js` (Layer 3), `engine/hero-run.js` (Layer 1)
**Modified**: `engine/game.js` (heavy wiring + PeekSlots close guards), `engine/day-cycle.js` (tired/curfew split, interior time-freeze), `engine/player.js` (debuff system + StatusEffect delegation), `engine/hazard-system.js` (death→home rescue), `index.html` (4 new script tags)

**Phase C.5 status**: **20/20 TASKS COMPLETE** ✅ — PHASE CLOSED.
**Unblocks**: Phase D (hero AI needs working day loop for Hero Day scheduling), Phase E (faction economy needs shop wiring), Phase F (economy tuning needs StatusEffect modifiers)
**Design refs**: GAP_ANALYSIS.md (full gap analysis), DOC-7 §5 (day/night), §17 (death/curfew), DOC-10 §2 (time-freeze)

---

### 🟢 PHASE D — Hero AI & Patrol Routes (Days 4–5: Mar 31 – Apr 1) ✅ COMPLETE
> Heroes enter the dungeon. The stealth tension begins. (Pivoted to abstract carnage model.)

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| D1 | hero-system.js: 4 hero types (Seeker/Scholar/Shadow/Crusader) | DOC-2 TUTORIAL | §14, §16 Phase 4 | 2h | ✅ DONE (full type defs, carnage signatures, visual props) |
| D2 | Patrol route generation (waypoint graph on grid) | DOC-4 BIOME | §18.2 | 1.5h | ✅ DONE (abstract: generateCarnageManifest() replaces real-time patrol) |
| D3 | 60° sight cone detection + Bresenham LOS | DOC-3 GONE_ROGUE | enemy-ai.js (ported) | 1h | ✅ DONE (EnemyAI + AwarenessConfig for regular enemies) |
| D4 | Detection state machine (stealth bonuses applied) | DOC-4 BIOME | §18.3 | 1.5h | ✅ DONE (4-state UNAWARE→SUSPICIOUS→ALERTED→ENGAGED) |
| D5 | Hero cycle timer (10min default, escalating) | DOC-2 TUTORIAL | §14 | 30m | ✅ DONE (3-day DayCycle interval, hero type cycling) |
| D6 | "Wake of Carnage" — Heroes break crates, kill monsters, loot | DOC-2 TUTORIAL | §6.3 | 1.5h | ✅ DONE (carnage manifest + overnight hero run + mailbox reports) |

**Phase D total**: ALL 6 TASKS COMPLETE ✅ (architectural pivot: abstract carnage instead of real-time patrol)
**Unblocks**: Phase E (boss encounters need working Hero AI), playtest loop (stealth + maintenance = core game)
**Design refs**: DOC-4 §18 (full hero system), DOC-2 §6 (hero reveal), §14 (hero path)

---

### 🔵 PHASE E — Hero Encounters & Faction Economy (Days 5–6: Apr 1–2)
> Late-game combat, faction rep, and narrative hooks.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| E1 | Hero boss fight mechanics (3 stages: flee → ambush → duel) | DOC-2 TUTORIAL | §16 Phase 6 | 2h | ❌ NOT STARTED — no 3-stage encounter code |
| E2 | Hero combat deck (Cleave ♠, Force Ward ♣, Precision Strike ♦, Dragon Slayer ♥) | DOC-4 BIOME | §9 | 1h | ❌ NOT STARTED — card data documented only |
| E3 | Faction rep tier unlock feedback | DOC-1 GAP | T2.3 | 1h | ⚠️ PARTIAL — repTier gating works, no unlock toast |
| E4 | Faction shop inventory gating (Tide/Foundry/Admiralty) | DOC-4 BIOME | §19.2 | 1h | ✅ DONE (getByPool + dropTier filtering) |
| E5 | Victory / Game Over stat summaries | DOC-1 GAP | T2.5 | 1h | ✅ DONE (victory-screen.js + game-over-screen.js) |
| E6 | NCH widget drag-to-reorder | DOC-1 GAP | T2.6 | 1.5h | ✅ DONE (widget drag-to-move + CardFan drag-to-reorder both implemented) |

**Phase E status**: E4/E5/E6 complete, E3 partial (rep toast), **E1/E2 are new work** (~3h for jam-scope boss encounter)
**Unblocks**: Phase F (economy tuning needs faction system wired)
**Design refs**: DOC-4 §9 (bosses), §19 (faction economy), DOC-2 §6 (hero reveal)

---

### 🟢 PHASE E.5 — Interactive Objects Audit Fixes + Playtest Gate (Apr 3)
> Audit-driven fixes from DOC-54. Playtest gate: walk the full dispatcher→home→chest→key flow with no competing systems, no redundant triggers, correct 3D rendering, and clean peek menu lifecycle.

| # | Task | Source Doc | Section | Est. | Status |
|---|------|-----------|---------|------|--------|
| E5.1 | Biome override erasure fix — all biomes explicitly declare all tile heights/textures | DOC-54 | Critical Bug 1 | — | ✅ DONE |
| E5.2 | Bonfire menu trap — 800ms interaction cooldown after bonfire menu close | DOC-54 | Critical Bug 2 | — | ✅ DONE |
| E5.3 | Sprite centering — remove double +0.5 offset in mailbox/bonfire sprites | DOC-54 | Session 2 | — | ✅ DONE |
| E5.4 | Step-fill cavity pivot — HEARTH/BONFIRE use step-fill instead of alpha porthole | DOC-54 | Session 3 | — | ✅ DONE |
| E5.5 | Hearth sandwich rendering — mantle stone + fire cavity + base stone three-zone column | DOC-54 + DOC-31a | §2.5 | — | ✅ DONE |
| E5.6 | Short-wall cap rendering — TABLE, BED, CHEST, BAR_COUNTER lid surface | DOC-54 | Tile audit | — | ✅ DONE |
| E5.7 | noFogFade flag — interactive sprites (mailbox, bonfire) stay opaque through fog | DOC-54 | Tile audit | — | ✅ DONE |
| E5.8 | CHEST interaction mode — resolve walk-on vs F-interact dual trigger; ensure ChestPeek shows before CombatBridge.openChest fires; no redundant open paths | DOC-54 | Remaining Issues | 1h | ❌ OPEN |
| E5.9 | Work keys chest (Floor 1.6) — 3D viewport renders chest at correct height, ChestPeek shows label, F-interact triggers _onPickupWorkKeys, gate unlocks | DOC-54 + DOC-55 | — | 30m | ❌ OPEN |
| E5.10 | **PLAYTEST GATE**: Dispatcher dialogue on Floor 1 → walk to home → enter Floor 1.6 → face chest → ChestPeek overlay visible → F-interact → key acquired → gate unlocked → re-enter Floor 1 freely | DOC-53 | Scenario A | 30m | ❌ OPEN |

**Phase E.5 status**: 7/10 done (audit fixes shipped), 3 remaining (chest interaction cleanup + playtest gate)
**Unblocks**: Phase G playtesting — cannot run Scenario A-I without clean chest interaction flow
**Design refs**: DOC-54 (audit), DOC-55 (menu catalog), DOC-53 (playtest procedure), DOC-12 (peek system)

---

### 🟣 PHASE F — Economy Tuning & Tool Progression (Days 6–7: Apr 2–3)
> Balance pass. Make the three loops feel rewarding. Gate tool upgrades to guild rank.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| F1 | Cleaning tool progression unlock (guild ranks) | DOC-2 TUTORIAL | §16 Phase 7 | 2h | C3, E3 |
| F2 | Pressure Washer + Enchanted Broom (late-game tools) | DOC-2 TUTORIAL | §15 | 1h | F1 |
| F3 | Economy balancing: coin yield, crate reward curves, shop pricing | DOC-2 TUTORIAL | §16 Phase 8 | 1.5h | B1–B5, E3–E4 |
| F4 | Work order contract system (bonus objectives) | DOC-4 BIOME | §17.3 | 1h | C4, C5 |
| F5 | Tuning levers pass (7 knobs from §7.7) | DOC-2 TUTORIAL | §7.7 | 1h | F3 |

**Phase F total**: ~6.5h
**Unblocks**: Phase G (tuned economy enables meaningful playtesting)
**Design refs**: DOC-2 §7 (economy tuning), §15 (tools), DOC-4 §17.3 (contracts)

---

### ⚪ PHASE G — Audio, LG Validation & Submission Polish (Days 7–8: Apr 3–5)
> Ship it. Audio pass, webOS validation, final playtesting.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| G1 | Audio asset wiring (6 card SFX + suit-keyed hits) | DOC-5 AUDIT | 2.4, Sprint 5.2 | 2h | — |
| G2 | Biome visual pass (Cellar♠ / Foundry♦ / Sealab♣ wall colors) | DOC-4 BIOME | §11 | 2h | — |
| G3 | LG webOS WebGL context validation | DOC-5 AUDIT | 1.4 | 1h | — |
| G4 | Magic Remote input mapping (gyro pointer → card drag, movement) | DOC-5 AUDIT | 1.1, 3.3 | 2h | — |
| G5 | Save/load persistence (localStorage on webOS) | DOC-5 AUDIT | 3.1 | 1h | — |
| G6 | Opening scene alignment (floor "0.1.1" 7-step sequence) | DOC-4 BIOME | §8 | 1h | B1, D1 |
| G7 | Final playtest + balance hotfixes | ALL DOCS | — | 2h | A–F complete |
| G8 | Submission build + webOS packaging | DOC-5 AUDIT | Sprint 5.3 | 1h | G1–G7 |

**Phase G total**: ~12h
**Unblocks**: **SUBMISSION** (April 5)

---

## Dependency Graph (Visual)

```
         ┌─ A1 Telegraph ──┐
         ├─ A2 Corpse tile ─┤
PHASE A ─┤                  ├──► PHASE B (Crate System) ─── B1-B4b ✅
         ├─ A3 Stealth.js ──┤        │
         └─ A4 Awareness ───┘        │
              │                       ▼
              │               PHASE C (Cleaning + Reset) ── ALL ✅
              │                       │
              │                       ▼
              │               PHASE C.5 (Stardew Loop + StatusEffect) ── 20/20 ✅ CLOSED
              │                       │
              ▼                       │
         PHASE D (Hero AI) ◄──────────┘
              │
              ▼
         PHASE E (Encounters + Factions)
              │
              ▼
         PHASE E.5 (Interactive Objects Audit + Playtest Gate) ←── DOC-54 audit
              │         E5.8 chest interaction cleanup
              │         E5.9 work keys chest validation
              │         E5.10 PLAYTEST GATE: dispatcher→home→chest→key
              ▼
         PHASE F (Economy Tuning)
              │
              ▼
         PHASE G (Audio + LG + Ship)
              │
              ▼
         ┌─────────────┐
         │  SUBMISSION  │
         │   Apr 5      │
         └─────────────┘
```

**Parallel lanes**: Phases B and D can overlap once A completes.
Phase C can start alongside late Phase B (C1 has no B dependency).
Phase G audio/visual tasks (G1, G2) can start any time as background work.

---

## Daily Schedule (Suggested)

| Day | Date | Primary Phase | Hours | Milestone |
|-----|------|--------------|-------|-----------|
| 1 | Mar 28 | **A** (Combat + Stealth extraction) | 5.5h | Stealth system extracted, combat polish done |
| 2 | Mar 29 | **B** start (Crate schema, slot UI, hydration) | 6h | Crate filling works end-to-end |
| 3 | Mar 30 | **B** finish + **C** start (Bag viewer, cleaning system) | 6h | Restocking loop playable, cleaning tiles work |
| 4 | Mar 31 | **C** finish + **D** start (Dungeon reset, Hero types) | 6h | All 3 maintenance loops functional |
| 5 | Apr 1 | **D** finish (Patrol, sight cones, stealth detection) | 5h | Heroes patrol with working stealth |
| 6 | Apr 2 | **E** (Boss fights, factions, victory stats) | 6h | Full combat + economy loop |
| 7 | Apr 3 | **F** (Economy tuning, tool progression) | 5h | Balanced prototype |
| 8 | Apr 4–5 | **G** (Audio, LG, playtest, submit) | 8h | **Ship it** |

---

## Cross-Reference Key

Each document's **§ Cross-References** appendix uses these tags:

| Tag | Meaning |
|-----|---------|
| `→ DOC-N §X` | "See document N, section X for details" |
| `← DOC-N §X` | "This section is referenced by document N, section X" |
| `⊕ PHASE X.N` | "This maps to cross-roadmap Phase X, task N" |
| `✅` | Already complete |
| `🔄` | In progress this sprint |
| `❌` | Blocked or deferred |

---

## Post-Prototype: Designer Portal Week (Apr 5–12)

Once the playable prototype ships, the next week focuses on:

1. **Designer portals**: Expose tuning levers (economy, hero timing, cleaning speed) via in-game debug panel
2. **Content pipeline**: Enable fast biome/floor iteration without code changes
3. **Playtest feedback integration**: Bug triage + balance hotfixes
4. **DOC-1 Tier 3** items: CardRef abstraction, event bus, save/load, i18n
5. **DOC-3 Pass 4**: Companion system if time permits
6. **DOC-4 §19.4–19.5**: Dragon Conspiracy narrative arcs (economy-gated)

---

## ⚡ Easy Targets — Quick Wins Before Submission

Tasks with clear scope, short estimated time, and no deep dependency chain. Good candidates for the last debug budget.

| ID | Task | Est. | Source | Status |
|----|------|------|--------|--------|
| E5.8 | **CHEST interaction dedup** — resolve walk-on vs F-interact dual trigger; ChestPeek shows before CombatBridge fires; no redundant open paths | 1h | DOC-54 Remaining Issues | ❌ OPEN |
| E5.9 | **Work keys chest (Floor 1.6)** — chest renders at correct height in 3D viewport, ChestPeek label shows, F-interact fires `_onPickupWorkKeys`, gate unlocks reliably | 30m | DOC-54 + DOC-55 | ❌ OPEN |
| E5.10 | **Playtest gate A** — full walk: dispatcher dialogue → home door → enter 1.6 → face chest → peek visible → F-interact → key acquired → gate unlocked → re-enter Floor 1 freely | 30m | DOC-53 Scenario A | ❌ OPEN |
| T1.5 | **Combat telegraph** — EnemyIntent module + CombatBridge + Raycaster + KaomojiCapsule all wired | ? | DOC-1 T1.5 | ✅ DONE |
| T1.6 | **Corpse system** — CorpseRegistry + CorpsePeek + CombatBridge death pipeline wired | ? | DOC-1 T1.6 | ✅ DONE |
| E3 | **Faction rep tier unlock toast** — tierChanged → Toast + ParticleFX.levelUp() in both sell paths | small | DOC-1 T2.3 | ✅ DONE |
| — | **CinematicCamera: peek preset wiring** — start('peek') on BookshelfPeek/TorchPeek open; close() in ESC intercepts | small | DOC-51 | ✅ DONE (2026-04-04) |
| — | **CinematicCamera: monologue preset wiring** — wired internally by MonologuePeek.play() default | small | DOC-51 | ✅ DONE (existing) |
| — | **Tutorial_world_roadmap §5.2 sync** — six-pod 50×36 layout, door coords, beat narrative updated | 20m | DOC-2 §5.2 | ✅ DONE (2026-04-04) |
| — | **Quest marker live test** — walk E5.8/E5.9/E5.10 with quest diamond visible throughout | 30m | DOC-66 §7 | ⏭ SKIPPED (jam day) |

*Updated: 2026-04-04*

---

*This document is the single entry point for sprint planning. When in doubt about what to work on next, consult the Phase table above and pick the lowest-lettered phase with unfinished ta
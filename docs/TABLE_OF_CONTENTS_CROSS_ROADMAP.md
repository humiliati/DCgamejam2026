# Dungeon Gleaner — Cross-Roadmap Execution Order

**Created**: 2026-03-28 | **Updated**: 2026-03-30
**Jam Deadline**: April 5, 2026 (6 days remaining)
**Goal**: Somewhat playable prototype → debug, smooth, and raise with designer portals through final week

---

## Master Document Index

All five design documents, their scope, and section inventories. Each document now includes a **§ Cross-References** appendix that links back here and to sibling docs.

### DOC-1: GAP_COVERAGE_TO_DEPLOYABILITY.md
> **Scope**: System inventory, bug fixes, gap analysis against EyesOnly patterns, and tiered execution to deployability.

| Section | Content |
|---------|---------|
| System Inventory | 17 modules (~7,500 lines), all ✅ Live |
| Bugs Fixed | B1–B5 (currency, hand dup, salvage sell, rep, game handler) |
| Gap Analysis | 10 EyesOnly alignment checks (identity, hydration, transfer, etc.) |
| **Tier 0** | Critical path jam blockers — **8/8 ✅ COMPLETE** |
| **Tier 1** | Combat polish — **4/6 done** (T1.4 toast ✅, T1.5 telegraph ❌, T1.6 corpse ❌) |
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
| **🔄 Pass 3 — Stealth** | stealth-system.js (2h), awareness-config.js (30min), minimap cones (✅ done) |
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
> **Scope**: 3-layer visual upgrade plan — flat-colored Wolfenstein walls → Octopath Traveller-style pixel-art textures. Procedural 64×64 texture generation and caching.

### DOC-15: SPRITE_STACK_ROADMAP.md
> **Scope**: Triple-emoji sprite composition system (head/torso/legs) with layered accessories, replacing single-emoji rendering for NPCs and enemies.

### DOC-16: SUIT_SYSTEM_ROADMAP.md
> **Scope**: Playing card suit element system — RPS combat triangle (♣>♦>♠>♣), ♥ as rule-breaker/healing, biome suit alignment.

### DOC-17: SKYBOX_ROADMAP.md
> **Scope**: Parallax sky, cloud layers, and water reflections replacing flat gradient backgrounds on exterior floors.

### DOC-18: NLAYER_RAYCASTER_ROADMAP.md
> **Scope**: N-layer compositing for half-height see-over tiles, floor visibility, and exterior map depth. Replaces 2-layer background hack.

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

### 🔴 PHASE A — Combat Finish & Stealth Extraction (Day 1: Mar 28)
> Parallel work: close remaining combat gaps while extracting stealth system.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| A1 | Enemy attack telegraph | DOC-1 GAP | T1.5 | 2h | T0 ✅ |
| A2 | Death anim → corpse tile | DOC-1 GAP | T1.6 | 1h | T0 ✅ |
| A3 | Extract stealth-system.js | DOC-3 GONE_ROGUE | Pass 3.9 | 2h | Pass 1-2 ✅ |
| A4 | Extract awareness-config.js | DOC-3 GONE_ROGUE | Pass 3.10 | 30m | Pass 1-2 ✅ |
| A5 | ~~Minimap sight cones~~ | DOC-3 GONE_ROGUE | Pass 3.11 | ~~2h~~ | **✅ DONE** |
| A6 | ~~HUD 2× scale~~ | DOC-5 AUDIT | 3.2 UI | ~~1h~~ | **✅ DONE** |

**Phase A total**: ~5.5h (A5, A6 already complete)
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
| B5 | Shop round-trip: buy restock supplies | DOC-1 GAP | T2 (implicit) | 1h | — |
| B6 | Bag inventory viewer | DOC-1 GAP | T2.1 | 2h | — |
| B7 | Stash transfer at bonfire | DOC-1 GAP | T2.2 | 1h | — |

**B1–B4b implemented.** Corpse stocks are functionally identical to crates but:
- Yield less loot (1–2 coins/slot vs 2–3, +3 seal bonus vs +5)
- Include a mandatory **suit card slot** requiring a matching ♠♣♦♥ combat card
- Sealing with matched suit card enables **reanimation → friendly NPC**
- Contribute to floor readiness score (25% weight alongside crate readiness)

**New files**: `engine/crate-system.js` (Layer 1), `engine/crate-ui.js` (Layer 2), `engine/corpse-peek.js` (Layer 3)
**Modified**: `corpse-registry.js` (auto-creates corpse stock + suit-gated reanimate), `breakable-spawner.js` (auto-creates crate containers), `interact-prompt.js` (Gleaner mode labels), `grid-gen.js` (floorId passthrough), `floor-manager.js` (floorId in opts)

**Phase B total**: ~9.5h (~6.5h complete, ~4h remaining for B5–B7)
**Unblocks**: Phase C (cleaning needs working crate economy), Phase E (hero encounters need restockable dungeon)
**Design refs**: DOC-4 §17.2 (crate slot schema), DOC-2 §13 (Gleaner pivot data structures)

**Phase B NPC add-ons** (see DOC-9 §6, §9):
- Vendor ambient barks + proximity bark trigger (DOC-9 §6.4) — 45m
- Register Floor 1.3 (Gleaner's Guild) interior NPCs (DOC-9 §9.4) — 30m
- Guild Clerk dialogue tree `data/dialogues/guild-clerk.js` (DOC-9 §5.3) — 1h

---

### 🟡 PHASE C — Tile Cleaning & Dungeon Reset (Days 3–4: Mar 30–31)
> The second and third gameplay loops. Grid-by-grid cleaning + readiness score.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| C1 | Tile condition states + cleaning-system.js | DOC-2 TUTORIAL | §16 Phase 2 | 2h | — |
| C2 | Texture-atlas dirty/clean variants (64×64) | DOC-4 BIOME | §17.1 | 1.5h | C1 |
| C3 | Progressive cleaning tools (Rag → Mop → Brush) | DOC-2 TUTORIAL | §15 | 1h | C1 |
| C4 | Dungeon reset tasks: work-order-system.js | DOC-2 TUTORIAL | §16 Phase 3 | 2h | B1 |
| C5 | Readiness score (weighted: crates 40%, clean 30%, traps 20%, puzzles 10%) | DOC-4 BIOME | §17.3 | 1h | C1, C4 |
| C6 | Floor deck reshuffle on transition | DOC-1 GAP | T2.4 | 30m | — |

**Phase C total**: ~8h
**Unblocks**: Phase E (fully maintainable dungeon for Heroes to trash), Phase F (cleaning tools need progression unlock)
**Design refs**: DOC-4 §17.1 (cleaning), §17.3 (readiness), DOC-2 §15 (pressure wash)

---

### 🟢 PHASE D — Hero AI & Patrol Routes (Days 4–5: Mar 31 – Apr 1)
> Heroes enter the dungeon. The stealth tension begins.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| D1 | hero-system.js: 4 hero types (Seeker/Scholar/Shadow/Crusader) | DOC-2 TUTORIAL | §14, §16 Phase 4 | 2h | A3 (stealth extraction) |
| D2 | Patrol route generation (waypoint graph on grid) | DOC-4 BIOME | §18.2 | 1.5h | D1 |
| D3 | 60° sight cone detection + Bresenham LOS | DOC-3 GONE_ROGUE | enemy-ai.js (ported) | 1h | A3, A4 |
| D4 | Detection state machine (stealth bonuses applied) | DOC-4 BIOME | §18.3 | 1.5h | A3, A4, D3 |
| D5 | Hero cycle timer (10min default, escalating) | DOC-2 TUTORIAL | §14 | 30m | D1 |
| D6 | "Wake of Carnage" — Heroes break crates, kill monsters, loot | DOC-2 TUTORIAL | §6.3 | 1.5h | D1, B1 |

**Phase D total**: ~8h
**Unblocks**: Phase E (boss encounters need working Hero AI), playtest loop (stealth + maintenance = core game)
**Design refs**: DOC-4 §18 (full hero system), DOC-2 §6 (hero reveal), §14 (hero path)

---

### 🔵 PHASE E — Hero Encounters & Faction Economy (Days 5–6: Apr 1–2)
> Late-game combat, faction rep, and narrative hooks.

| # | Task | Source Doc | Section | Est. | Depends On |
|---|------|-----------|---------|------|------------|
| E1 | Hero boss fight mechanics (3 stages: flee → ambush → duel) | DOC-2 TUTORIAL | §16 Phase 6 | 2h | D1–D4 |
| E2 | Hero combat deck (Cleave ♠, Force Ward ♣, Precision Strike ♦, Dragon Slayer ♥) | DOC-4 BIOME | §9 | 1h | E1 |
| E3 | Faction rep tier unlock feedback | DOC-1 GAP | T2.3 | 1h | B5 |
| E4 | Faction shop inventory gating (Tide/Foundry/Admiralty) | DOC-4 BIOME | §19.2 | 1h | E3 |
| E5 | Victory / Game Over stat summaries | DOC-1 GAP | T2.5 | 1h | — |
| E6 | NCH widget drag-to-reorder | DOC-1 GAP | T2.6 | 1.5h | — |

**Phase E total**: ~7.5h
**Unblocks**: Phase F (economy tuning needs faction system wired)
**Design refs**: DOC-4 §9 (bosses), §19 (faction economy), DOC-2 §6 (hero reveal)

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
PHASE A ─┤                  ├──► PHASE B (Crate System)
         ├─ A3 Stealth.js ──┤        │
         └─ A4 Awareness ───┘        │
              │                       ▼
              │               PHASE C (Cleaning + Reset)
              │                       │
              ▼                       │
         PHASE D (Hero AI) ◄──────────┘
              │
              ▼
         PHASE E (Encounters + Factions)
              │
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

*This document is the single entry point for sprint planning. When in doubt about what to work on next, consult the Phase table above and pick the lowest-lettered phase with unfinished ta
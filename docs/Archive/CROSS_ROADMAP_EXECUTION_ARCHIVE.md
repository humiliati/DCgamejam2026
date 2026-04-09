# Cross Roadmap Execution Archive

Source: docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md
Archived on: 2026-04-08
Purpose: Preserve completed/verbose execution-order material and full detailed index extracted from the main ToC.

---
## Detailed Document Index

All documents with scope summaries and section inventories. Each document now includes a **Â§ Cross-References** appendix that links back here and to sibling docs.

### DOC-1: GAP_COVERAGE_TO_DEPLOYABILITY.md
> **Scope**: System inventory, bug fixes, gap analysis against EyesOnly patterns, and tiered execution to deployability.

| Section | Content |
|---------|---------|
| System Inventory | 17 modules (~7,500 lines), all âœ… Live |
| Bugs Fixed | B1â€“B5 (currency, hand dup, salvage sell, rep, game handler) |
| Gap Analysis | 10 EyesOnly alignment checks (identity, hydration, transfer, etc.) |
| **Tier 0** | Critical path jam blockers â€” **8/8 âœ… COMPLETE** |
| **Tier 1** | Combat polish â€” **6/6 âœ… COMPLETE** (T1.4 toast âœ…, T1.5 EnemyIntent âœ…, T1.6 CorpseRegistry âœ…) |
| **Tier 2** | Economy loop closure â€” **0/6 done** (T2.1â€“T2.6 all pending) |
| **Tier 3** | Post-jam architecture â€” 0/10, deferred |
| Sprint Schedule | Daily plan Mar 28 â†’ Apr 5 |
| Data Mutation Map | 13/15 paths wired |

### DOC-2: TUTORIAL_WORLD_ROADMAP.md
> **Scope**: World graph, floor registry, gate system, floor designs, economy tuning, and Gleaner pivot phases.

| Section | Content |
|---------|---------|
| Â§1 Overview | Environmental teaching philosophy |
| Â§2 World Graph | Floor 0 â†’ 1 â†’ 1.1/1.2/1.3/1.6 â†’ 1.3.1 â†’ 2 â†’ 2.1/2.2 â†’ 2.2.1/2.2.2 â†’ 3 hierarchy |
| Â§3 Floor Registry | 15 floors + connection edges (includes Floor 1.6 Gleaner's Home) |
| Â§4 Gate-Contract System | Gate taxonomy, full-span rule, floor state tracking |
| Â§5 Floor Designs | 5.1â€“5.8 individual floor specs (Approach â†’ Frontier) |
| Â§6 Hero Reveal | The Moment, Hero Entity, Wake of Carnage |
| Â§7 Economy Tuning | Kenshi scavenger start, 5-card lean, loot/bonfire/death semantics |
| Â§8 FloorManager Redesign | World graph registry, migration phases A/B, tile constants |
| Â§9 Original Phases | Phase 1â€“8 (15â€“24h, pre-pivot) |
| Â§10 Player Journey | Expected flow loops |
| Â§11 Gone Rogue Patterns | Asset reuse table |
| Â§12 Jam Timeline | Risk assessment |
| **Â§13 Gleaner Pivot** | Cleaning Loop, Restocking Loop, Dungeon Reset Loop |
| **Â§14 Hero Path System** | 4 hero types, patrol routes, AI, stealth mechanics |
| **Â§15 Pressure Wash Simulator** | Per-texel grime, cleaning tools, contracts |
| **Â§16 Revised Phases** | Phase 0 (Pre-Phase) + Phase 1â€“8 reordered for Gleaner pivot |
| **Â§17 Revised Player Journey** | Pre-phase send-off â†’ three-act progression |
| **Â§18 Pre-Phase 0 â€” Morning Send-Off** | Bark system, Dispatcher gate NPC, Floor 1.6 home, key gate mechanic, narrative alignment, pillar juice |

### DOC-3: GONE_ROGUE_ASSET_UTILIZATION_ROADMAP.md
> **Scope**: Maps every Gone Rogue JS module to PORTED / PORT NOW / PORT LATER / OUT OF SCOPE.

| Section | Content |
|---------|---------|
| âœ… PORTED | 7 modules already running (rng, synergy, cards, enemy-ai, audio, splash, status) |
| âœ… PORT NOW Complete | 6 extractions done (world-items, loot-tables, breakable-spawner, pickup, food, HOT) |
| âœ… Found Complete | 3 already ported (overhead-animator, shop, loot-spill) |
| **âœ… Pass 3 â€” Stealth** | stealth-system.js âœ…, awareness-config.js âœ…, minimap cones âœ… |
| ðŸ› ï¸ Post-Jam | pet-follower, puzzle-state |
| âŒ Out of Scope | 15 modules (ARG, multiplayer, auth, constellation, etc.) |
| Data File Status | items âœ…, enemies âœ…, loot-tables âœ…, cards âœ…, strings âœ… |

### DOC-4: Biome Plan.html
> **Scope**: Living design bible â€” premise, themes, renderer, spatial contracts, biomes, enemies, bosses, suits, and Gleaner systems.

| Section | Content |
|---------|---------|
| Â§1 Premise | Dungeon Gleaner â€” janitor sim framing |
| Â§2 Themes | Suit system integration, three gameplay loops |
| Â§3 Renderer Fidelity | Retrofuturism visual philosophy, color-driven design |
| Â§4 Floor ID & Spatial Contracts | Convention, tile height offsets (Doom Rule) |
| Â§5 Boardwalk Town | Floors "1"â€“"3" (Promenade, Lantern Gardens, Frontier Gate) |
| Â§6 Building Interiors | Shop/inn/armory contracts, interior presets |
| Â§7 Dungeons | Environmental storytelling, dungeon contracts |
| Â§8 Opening Scene | First dungeon scripted sequence (floor "0.1.1") |
| Â§9 Boss Encounters | Hero as boss, Hero combat deck (â™ â™£â™¦â™¥) |
| Â§10 RPS Combat Suits | â™£>â™¦>â™ >â™£, â™¥ neutral, biome alignment |
| Â§11 Biome Palettes | District/Interior/Dungeon wall colors |
| Â§12 Enemy Populations | Lootable corpses, living remnants, density tables |
| Â§13 Quest Items | Narrative gating items |
| Â§14 EyesOnly Asset Map | What we reuse vs. not |
| Â§15 New Work | Jam-scope new content |
| Â§16 Module Wiring | Data flow diagrams |
| **Â§17 Gleaner Maintenance** | 17.1 Cleaning, 17.2 Restocking, 17.3 Dungeon Reset |
| **Â§18 Hero Path & Stealth** | 18.1 Types, 18.2 Patrols, 18.3 Sight Cones, 18.4 Encounters |
| **Â§19 Faction Economy** | 19.1 Factions, 19.2 Rep, 19.3 Necromancer, 19.4 Dragon Conspiracy, 19.5 Story Arcs |

### DOC-5: Dungeon_Gleaner_Base_Engine_Audit.docx
> **Scope**: Feature audit of the glov base engine â€” Necessities, Features, QOL â€” cataloging what's present, needed, or replaced.

| Section | Content |
|---------|---------|
| 1. Necessities | 1.1 Movement, 1.2 Combat, 1.3 Level Gen, 1.4 Rendering |
| 2. Features | 2.1 Card/Inventory, 2.2 Enemy AI, 2.3 Multiplayer/Network, 2.4 Audio |
| 3. QOL | 3.1 Save/Load, 3.2 UI/Accessibility, 3.3 Input/Controls, 3.4 Visual Polish, 3.5 Customization |
| 4. Strip/Defer | 4.1 Multiplayer infra, 4.2 Legacy combat, 4.3 Post-jam polish |
| 5. Sprint Mapping | 5.1 Already done, 5.2 This sprint, 5.3 Final sprint |

### DOC-6: AUDIO_ENGINE.md
> **Scope**: Audio engine reference â€” Web Audio bus architecture, spatial envelope pattern (door contracts), SFX wiring inventory, modification guide, future spatial audio plan.

| Section | Content |
|---------|---------|
| Architecture | Web Audio API bus (master â†’ sfx/bgm), codec, manifest |
| Playback API | play(), playRandom(), playSequence(), playMusic(), preloadCategory() |
| Door Contract Audio | Three-phase spatial envelope pattern, timing model, design principles |
| SFX Inventory | Current wiring table (18 triggers), unwired future table (13 triggers) |
| Spatial Audio | Distance attenuation proposal for enemy/hero footsteps (Phase D) |
| Modification Guide | Adding SFX, sequences, music tracks, tuning volume levels |

### DOC-7: CORE_GAME_LOOP_AND_JUICE.md
> **Scope**: Core loop design doc. Covers the three toyful pillars (Clean / Restock / Endure), Kingdom Two Crowns economy model, narrative hero cycle (3-day cadence + Taskmaster NPC), Stardew Valley day/night pressure with skybox transitions, death/home/debuff system, peek interaction expansion, dungeon persistence & multi-floor maintenance, hero run mailbox reports with dungeon thumbnails, dungeon reset element catalog, daily vermin refresh & reanimation economy, and fail state narrative design (death hero-rescue, curfew NPC wink, humiliation gradient).

| Section | Content |
|---------|---------|
| Â§1 One-Line Pitch | The janitor framing and central tension |
| Â§2 Three Core Pillars | Clean, Restock, Endure â€” one-liners and primary verbs |
| Â§3 Kingdom Two Crowns Economy | Dripâ†’jackpot structure, visible economy (7-category readiness), "just one more crate" pull |
| Â§4 Hero Cycle â€” Narrative Deploy | 3-day cadence, Taskmaster NPC, implied deploy via mail/barks/dungeon re-entry, payout tiers |
| Â§5 Day/Night Cycle â€” Living World Pressure | Skybox transitions, player home, clock mechanics, sleep/death/curfew/debuffs, bonfire role, **interior time-freeze rule** |
| Â§6 Juice Inventory | Per-pillar juice tables: Clean, Restock, Hero Cycle, Day/Night, Ambient/Meta, Pre-Phase, **Cozy Interior (Â§6.7)** |
| Â§7 Pressure Gradient | Readiness target escalation per hero cycle |
| Â§8 3-Day Cycle Session Rhythm | The "one more cycle" pull, daily structure |
| Â§9 Implementation Notes | Module mapping table + jam-scope priority order |
| Â§10 Design Axioms | Seven guiding principles (expanded: "home is heartbeat", "discovery over declaration") |
| Â§11 Peek Interaction Expansion | Bed, Mailbox, Job Board, Taskmaster, Bonfire peek specs with mockup layouts, **Bookshelf Peek (Â§11.6)**, **Bar Counter Peek (Â§11.7)** |
| Â§12 Time Cycle Accommodation Inventory | Fits naturally / requires adaptation / deferred tables, time-aware peek summary |
| Â§13 Dungeon Persistence & Multi-Floor Maintenance | Work persists across days, dungeon difficulty tiers, hero chain penetration depth |
| Â§14 Hero Run Report â€” Mailbox Detail Design | Dungeon thumbnail cards, report tone by readiness, activity breakdown icons |
| Â§15 Dungeon Reset Elements | Corpse cleanup, puzzle re-scramble, door relock, button reset, persistence rules |
| Â§16 Daily Vermin Refresh & Reanimation Economy | Vermin spawn nodes, reanimation flow, value hierarchy, friendly NPC behavior, 2-day walkthrough |
| Â§17 Fail States â€” Death & Curfew Narrative | Hero rescue on death (cycle shift, halved payout, rescue mail variant), curfew NPC wink, humiliation gradient, NPC bark pool |

### DOC-8: VISUAL_OVERHAUL.md
> **Scope**: Visual pivot design doc. Shifts the aesthetic from combat-operative/CRT terminal to clinical-hazmat/corporate-paperwork/powerwash style. Covers the ironic gap (operative naming for janitor work), complete UI palette swap (phosphor green â†’ paper/ink/clipboard), HUD redesign (geriatric size, ruled-paper texture, labeled form fields, plastic tool indicators), title screen as corporate onboarding forms, card fan as laminated playing cards, exterior biome palette nudges (brighter, higher contrast), MenuBox as tabbed binder, typography scale and font stack, player archetype visual refresh (janitor descriptions), and splash screen as hazmat warning label.

| Section | Content |
|---------|---------|
| Â§1 Design Philosophy | The ironic gap â€” operative naming for janitor work, three visual pillars, tone calibration |
| Â§2 Color System Overhaul | Paper/ink/pencil palette replacing CRT phosphor, suit colours retained + brightened |
| Â§3 HUD Redesign | Geriatric size, clipboard-backed form layout, ruled-paper lines, plastic tool indicators |
| Â§4 Title Screen Pivot | Corporate onboarding flow â€” cover letter, name badge (Form 1A), assignment form (Form 1B), shift punch-in |
| Â§5 Card Fan Visual Refresh | Laminated playing cards on paper, suit corner pips, stencil art style |
| Â§6 Biome Palette Nudges | Per-floor hex adjustments for all 4 exterior floors â€” brighter, warmer, higher contrast |
| Â§7 MenuBox / Pause Screen | Binder aesthetic â€” tabbed sections, paper on brown backing board |
| Â§8 Typography | Font stack (form/label/handwrite), geriatric size scale, ruled-paper CSS effect |
| Â§9 Player Archetype Visual Identity | Class emoji + description refresh â€” janitor-themed, ironic operative naming maintained |
| Â§10 Splash Screen Pivot | Hazmat warning label â€” yellow background, diagonal stripes, stencil title |
| Â§11 Implementation Priority | Jam-scope (7.5h) vs post-jam changes, per-module estimates |
| Â§12 Design Axioms | Seven visual-specific axioms (clipboard is the frame, ink on paper, bigger is funner) |

### DOC-9: NPC_SYSTEM_ROADMAP.md
> **Scope**: Full NPC type taxonomy, Fable-style bark system implementation record, and roadmaps for interactive NPCs, vendors, Dispatcher NPCs, Hero rovers, and building interior NPC assignment. Documents what is implemented (Phase A.0) and what is roadmapped (Phases Bâ€“D).

| Section | Content |
|---------|---------|
| Â§1 Overview | Layered NPC architecture: bark pools â†’ patrol bodies â†’ interaction verbs â†’ encounter scripting |
| Â§2 NPC Type Taxonomy | Table: AMBIENT / INTERACTIVE / VENDOR / DISPATCHER / HERO movement, interaction, bark, rarity |
| Â§3 Bark System Architecture | BarkLibrary API, pool key convention, firing hierarchy, how to add pools |
| **Â§4 Implemented: NpcSystem.js** | API, entity field schema, built-in populations table, game.js wiring hooks |
| Â§5 Roadmap: Interactive NPCs | DialogBox.startConversation() format, planned NPCs (Guild Clerk, Archivist, Old Gleaner), task table |
| Â§6 Roadmap: Vendors | Current state, target state, per-faction bark pools needed, task table |
| Â§7 Roadmap: Dispatcher NPCs | Current gate-encounter implementation, force-facing mechanic spec, future Dispatcher instances |
| Â§8 Roadmap: Hero NPCs | Hero types (Fighter/Rogue/Mage/Paladin), movement model (Pathfind-based), sight cone, implementation tasks |
| Â§9 Roadmap: Building Interior NPCs | Per-building NPC roster table, homeFloor assignment pattern, task table |
| Â§10 Module & File Map | Implemented vs roadmapped file table with phases |
| Â§11 Bare Minimum Deployment Checklist | What must work for April 5 jam submission |
| Â§12 Cross-References | Links to other doc sections and engine files |

### DOC-10: COZY_INTERIORS_DESIGN.md
> **Scope**: Cozy interior design doc. Covers the Safety Contract (buildings as havens), the time-freeze rule for depth-2 floors, interior interaction taxonomy (bookshelf/bar counter/vendor/NPC/furniture), per-building interaction inventories, cozy minigame stubs (post-jam), book/document data schema, peek overlay module specs, interior juice palette, and implementation roadmap.

| Section | Content |
|---------|---------|
| Â§1 Overview â€” Safety Contract | Four channels of safety (time freeze, warm aesthetics, low-stakes interactions, tonal bark shift), design axiom |
| Â§2 Time-Freeze Rule | Depth-2 = frozen, depth-1/3 = normal; implementation spec (`DayCycle.setPaused`), edge cases, HUD indicator |
| Â§3 Interior Interaction Taxonomy | Five categories (bookshelf/bar/vendor/NPC/furniture) with tempo diversity principle |
| Â§4 Bookshelf Interactions | BOOKSHELF tile (25) properties, BookshelfPeek module, content categories, conspiracy drip strategy |
| Â§5 Bar Counter Interactions | BAR_COUNTER tile (26) properties, BarCounterPeek module, per-biome drink menus, "micro-bonfire" design intent |
| Â§6 Per-Building Interaction Inventory | Full tile inventories for Entry Lobby, Bazaar, Inn, Guild, Home, Watchman's Post |
| Â§7 Cozy Minigame Stubs | Post-jam roadmap: card sorting table, trophy shelf, cooking pot, notice board puzzle, music box |
| Â§8 Book & Document Data Schema | `data/books.json` format spec, current catalog (52 books), how to add new books |
| Â§9 Peek Overlay Module Specs | BookshelfPeek API table + BarCounterPeek API table with full method signatures |
| Â§10 Juice â€” Interiors Feel Like Home | Time-freeze juice, bookshelf juice, bar counter juice, building ambient juice |
| Â§11 Implementation Status & Roadmap | Phase A.0 (complete), Phase B (day cycle + home), Phase C (interior polish), Post-jam (minigames) |
| Â§12 Cross-References | Links to DOC-7/DOC-2/DOC-9 sections and engine files |

### DOC-11: NPC_FACTION_BOOK_AUDIT.md
> **Scope**: Comprehensive audit of books.json content/placement, NPC faction uniforms (GTA2-style gangs), choreographed NPC dialogue, faction HQ buildings, and NPC-to-NPC world-building barks. 5-phase implementation roadmap.

| Section | Content |
|---------|---------|
| Â§1 Books Audit | 52-book catalog review, non-fiction wrapping problem, bookshelf placement requirements, fix list |
| Â§2 NPC Faction System | Faction uniform design (tide/foundry/admiralty role templates), NPC population targets, faction HQ buildings |
| Â§3 World-Building Barks | NPC-to-NPC dialogue philosophy, bark categories, choreographed 2-NPC encounters, faction interaction behaviors |
| Â§4 Implementation Roadmap | Phase 1 (books fix), Phase 2 (uniforms), Phase 3 (barks), Phase 4 (encounters), Phase 5 (faction HQs) |
| Â§5 Cross-References | Links to books.json, npc-composer.js, bark-library.js, npc-system.js |

### DOC-12: PEEK_SYSTEM_ROADMAP.md
> **Scope**: Consolidation plan for 9 duplicate peek overlay modules (~2,200 lines) into a unified PeekSystem with variant registry, lifecycle FSM, juice budget, and label system.

| Section | Content |
|---------|---------|
| Â§1 Architecture | PeekDescriptor schema, variant registry, lifecycle FSM (IDLEâ†’SHOWINGâ†’OPENâ†’CLOSING) |
| Â§2 Juice Budget | Entry/open animations, glow system, particles, SFX per variant |
| Â§3 Label System | InteractPrompt integration, contextual labels by tile type |
| Â§4 Variant Catalog | All 9 tile types: door, crate, chest, corpse, merchant, bookshelf, bar, bonfire, NPC |
| Â§5 Migration Plan | 5-phase migration from individual modules to unified PeekSystem |

### DOC-13: STREET_CHRONICLES_NARRATIVE_OUTLINE.md
> **Scope**: Core narrative structure â€” MSS operative cover, three-faction conspiracy (Tide Council, Foundry Collective, Admiralty), dragon compact, and the Gleaner's role in the conspiracy.

### DOC-14: TEXTURE_ROADMAP.md
> **Scope**: 3-layer visual upgrade plan â€” flat-colored Wolfenstein walls â†’ Octopath Traveller-style pixel-art textures. Procedural 64Ã—64 texture generation and caching. Layer 2 (wall decor) and Layer 3 (sprite light emitters) are shared implementations with LIGHT_AND_TORCH_ROADMAP â€” see cross-references section at bottom of doc.

### DOC-15: SPRITE_STACK_ROADMAP.md
> **Scope**: Triple-emoji sprite composition system (head/torso/legs) with layered accessories, replacing single-emoji rendering for NPCs and enemies.

### DOC-16: SUIT_SYSTEM_ROADMAP.md
> **Scope**: Playing card suit element system â€” RPS combat triangle (â™£>â™¦>â™ >â™£), â™¥ as rule-breaker/healing, biome suit alignment.

### DOC-17: SKYBOX_ROADMAP.md (v2)
> **Scope**: v1 parallax sky complete. v2 adds day/night cycle (sky color cycling, celestial bodies, star parallax, time widget), Floor 3 ocean sky, weather system. Cross-references LIGHT_AND_TORCH for building entrance glow, TEXTURE for frontier biome.

### DOC-18: NLAYER_RAYCASTER_ROADMAP.md
> **Scope**: N-layer compositing for half-height see-over tiles, floor visibility, and exterior map depth. Replaces 2-layer background hack. Cross-references TEXTURE Layer 2 (shared raycaster loop) and LIGHT_AND_TORCH (shared frame budget).

### DOC-31: LIGHT_AND_TORCH_ROADMAP.md
> **Scope**: Dynamic light sources in Lighting.js, torch wall sprites, extinguish/refuel game loop. Phase 1 â‰¡ TEXTURE Layer 3 (same implementation). Phase 2 consumes TEXTURE Layer 2 wall decor model.
> **Phase 1 âœ… DONE**: Tint palette system (NONE/WARM/SICKLY), quadratic falloff, flicker animation (torch/bonfire/steady), per-tile tint index + intensity maps, raycaster integration with `_tintedDark()` overlay, TERMINAL tile (36) with sickly green glow + CRT wall texture + decor sprite + BookshelfPeek terminal category routing, 5 terminal books in books.json, interior auto-electric lights (Doom sector model).
> **Phase 6 (post-jam)**: Ceiling light fixture sprites â€” requires ceiling casting pass or ceiling-mounted billboard system in raycaster. Seams documented in roadmap Â§6aâ€“6d.

### DOC-32: UNIFIED_EXECUTION_ORDER.md (v3)
> **Scope**: Single source of truth for implementation sequencing across ALL roadmaps. Sprint 0 (inventory/card/menu rework, 15h) as prerequisite â†’ three parallel tracks (A: raycaster/texture/lighting, B: skybox/day-night, PW: pressure washing/hose) â†’ Floor 3 convergence â†’ EyesOnly convergence sprints S1â€“S5 (33h). Track PW cross-depends on Track A step A7 (torch slot model) for torch-hit wiring. References DOC-46, DOC-47, DOC-48.

### DOC-19: DOOR_EFFECTS_ROADMAP.md
> **Scope**: Three-phase visual door transition effects (approach/pass/exit) replacing hard-cut black loading screens.

### DOC-20: COMBAT_DRAG_SYSTEM.md
> **Scope**: Drag-and-drop card interactions for reordering, stack building, and synergy matching in the hand fan during combat.

### DOC-21: GAME_FLOW_ROADMAP.md
> **Scope**: Pause menu 4-face rotating box (minimap/items/gear/system), screen state transitions, ScreenManager wiring.

### DOC-22: HUD_ROADMAP.md
> **Scope**: Terminal-themed HUD layout â€” ASCII canon, status bars, card tray, minimap, quick-bar, interaction mandate.

### DOC-23: UI_ROADMAP.md
> **Scope**: Reusable UI components (DialogBox, Toast, inventory data model) feeding into the rotating box menu system.

### DOC-24: B5_INVENTORY_INTERACTION_DESIGN.md
> **Scope**: 8-zone inventory system with drag-drop transfers between hand, backup deck, bag, and stash for card loadout management.

### DOC-25: B6_SLOT_WHEEL_AND_TRANSACTION_LAYOUT.md
> **Scope**: Scrolling 5-slot SlotWheel widget for bag/deck items beyond position 5, card rendering in inventory views.

### DOC-26: UNIFIED_INVENTORY_METADATA_CONTRACT.md
> **Scope**: Canonical item/card/collectible schema â€” registries in items.json, cards.json, enemies.json, loot-tables.json.

### DOC-27: JAM_COMPLIANCE.md
> **Scope**: DC Jam 2026 mandatory requirement audit â€” first-person, grid movement, keyboard controls, procedural dungeons, combat, cards, inventory.

### DOC-28: ROADMAP.md
> **Scope**: Original 8-pass extraction roadmap from EyesOnly scaffold to playable dungeon crawler.

### DOC-29: hud-ui-debugging-notes.md
> **Scope**: Active debugging priorities â€” minimap embedding, floor label repositioning, battery display, NCH widget, bag menu.

### DOC-30: BONFIRE_POLISH_STEPS.md
> **Scope**: Bonfire & hearth interaction audit and polish roadmap. Covers: current-state audit of all bonfire interactions (waypoint, stash, rest, warp, incinerator), tile types (BONFIRE/HEARTH/BED), MenuBox bonfire context (4 faces), day/night cycle integration, visual distinction by depth tier, UI polish, waypoint/warp network expansion, and interaction differentiation (exterior campfire vs dungeon hearth vs home bed). Cross-references 10 related docs.

| Section | Content | Status |
|---|---|---|
| Current State Audit | Tile types, interaction flow, MenuBox faces, stash, incinerator, lighting, generation | Reference |
| Â§1 Exterior Campfire Blockout | C-shape shrub ring, tent billboard, stone ring wall | âœ… DONE |
| Â§2 Dungeon Hearth | HEARTH tile in gen, riverrock texture, warm glow | âœ… DONE |
| Â§3 Fire Emoji Sprite Overlay | Bobbing ðŸ”¥ billboard sprite, glow, scatter sparks | Post-jam |
| Â§4 Crackle Audio | `fire_crackle` proximity loop, volume scaling | Stub âœ… |
| Â§5 Media Asset Encoding | ffmpeg encode from EyesOnly MEDIA_ASSETS | Manual |
| Â§6 Debrief Incinerator | DragDrop zone, rarity refund, glow animation | âœ… DONE |
| Â§7 Day/Night Cycle Integration | 6 tasks (7aâ€“7f): rest-until-dawn (jam), WELL_RESTED/TIRED, glow scaling, morning recap, week-strip fix | âœ… COMPLETE |
| Â§8 Visual Distinction by Depth | 6 tasks (8aâ€“8f): 3 glow tiers (campfire/home/dungeon), nervous flicker, smoke/ember particles | Planned |
| Â§9 Bonfire UI Polish | 7 tasks (9aâ€“9g): animated fire emoji, status cleared/gained, waypoint toast, stash hints, warp confirm | Planned |
| Â§10 Waypoint & Warp Network | Bonfire-to-bonfire warp, warp cost, minimap icons, discovery toast | Post-jam |
| Â§11 Interaction Differentiation | Exterior vs dungeon vs home: time advance, WELL_RESTED, safety, unique verbs | Planned |
| Â§12 Cross-References | 10 entries linking DOC-7, DOC-17, DOC-31a, DOC-14, DOC-21, DOC-2, DOC-10, DOC-46, DOC-6, DOC-50 | Reference |

### DOC-32: TOOLTIP_BARK_ROADMAP.md
> **Scope**: Tooltip history system, NPC bark delivery, speech gesture rendering (KaomojiCapsule), depth-scaled bark radius, dialogue ping-pong, and post-jam tooltip space vision. References EyesOnly TOOLTIP_SPACE_CANON.md for production target.

| Section | Content |
|---|---|
| S1â€“S7 (Jam) | Toastâ†’StatusBar bridge, card/deck tooltips, depth bark radius, speech capsule, ping-pong, WorldPopup, UI polish | âœ… DONE |
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
| Phase 0 | SpatialDir resolver â€” angle, distance, cardinal, pan from world position (1h) |
| Phase 1 | AudioSystem StereoPannerNode panning with `position` option (2h) |
| Phase 2 | Viewport direction ring â€” SVG, 8 fixed axis positions, reticle dual-purpose (2h) |
| Phase 3 | Directional bark popups â€” NPC srcX/srcY forwarding, off-screen suppression (2.5h) |
| Phase 4 | Enemy proximity audio â€” footstep spatial, threat ring indicators (1.5h) |
| Phase 5 | Ambient spatial sources â€” bonfire, torch, ocean, door barks (1h) |
| Phase 6 | Muffled door BGM â€” OoT pattern, BiquadFilterNode lowpass, bgmLeak spatial contract, crossfade on entry (1.5h) |
| Phase 7 | Biome music continuity â€” same-biome adjust, cross-biome crossfade, dungeon hard-switch (1h) |
| Design Decisions | Ring (not compass bar), exaggerated pan Ã—1.3, 8-axis fixed positions, reticle dual-purpose |
| Cross-References | 16 entries linking DOC-6, DOC-7, DOC-9, DOC-10, DOC-11, DOC-30, DOC-32, engine files |

### DOC-31: COBWEB_TRAP_STRATEGY_ROADMAP.md
> **Scope**: Strategic design roadmap for cobweb and trap embellishment systems. Covers: the "clean inward, arm outward" loop, self-trigger penalty mechanics, economic resource costs (Silk Spider, Trap Kit), proc-gen contract bonus objectives, windsail cobweb visual upgrade with third-space rendering and hover interaction, reinforced web/trap tiers, enemy pathfinding integration, and cobweb ecology far-future vision.

| Section | Content |
|---|---|
| Phase 1 (Jam) | Trap re-arm + cobweb deploy + self-trigger cycle | âœ… DONE |
| Phase 2 | Economic cost â€” Silk Spider, Trap Kit consumables | Planned |
| Phase 3 | Proc-gen contract bonus objectives | Planned |
| Phase 4 | Windsail visual â€” third-space texture, billow anim, hover | Planned |
| Phase 5 | Reinforced variants â€” web tiers, trap tiers | Planned |
| Phase 6 | Enemy pathfinding â€” AI avoidance, awareness events | Planned |
| Phase 7 | Cobweb ecology â€” nesting, web networks, environmental | Far future |

### DOC-33: GAP_ANALYSIS.md
> **Scope**: Comprehensive cross-phase status audit of implemented features against design roadmap, with task completion tracking through jam deadline. Sprint-level gap inventory referenced by Phase C.5 tasks.

### DOC-34: UNIFIED_UI_OVERHAUL.md
> **Scope**: Consolidated design system unifying the paper/hazmat/CRT aesthetic trichotomy â€” color palette, sizing scale, font hierarchy, and component styling across HUD, menus, and overlays.

### DOC-35: DEBUG_NOTES_SCREENER.md
> **Scope**: Active UI polish and debugging checklist â€” title screen, class selection, settings menu styling, in-game HUD issues, and interaction bugs. Living document updated per debug pass.

### DOC-53: PLAYTEST_AND_BLOCKOUT_PROCEDURE.md
> **Scope**: Pre-submission sprint procedure. Jam-scope audit results (130 files, no competing systems, index.html truncation fix), blockout execution order (Pass 1: exteriors â†’ Pass 2: interiors â†’ Pass 3: dungeons, pressure wash parallel), regimented playtestâ†’debugâ†’fix cycle with 9 scenarios (Aâ€“I), contracted playtester guide (setup, reporting template, known limitations vs real bugs), bug triage template (repurposed from DEBUG_NOTES_SCREENER format), stale feedback filter for April 2 pulls.

### DOC-36: FACE2_INVENTORY_POLISH.md
> **Scope**: Known issues and interaction improvements for the inventory UI (MenuBox Face 2) â€” slot sizing, drag-drop conflicts, affordance clarity, and visual feedback.

### DOC-37: INPUT_CONTROLLER_ROADMAP.md
> **Scope**: Input parity audit for keyboard, click, and D-pad controls. Identified gaps, gamepad support plan, and Magic Remote mapping notes.

### DOC-38: PLAYER_CONTROLLER_ROADMAP.md
> **Scope**: Movement controller architecture reference â€” dual-queue lerp system, interpolation model, speed tuning benchmarks, and collision edge cases.

### DOC-39: SHOP_REFRESH_ECONOMY.md
> **Scope**: Staggered inventory refresh mechanics across faction shops â€” scarcity-driven economy, purchasing urgency, and restock timing per hero cycle.

### DOC-40: SPRITE_COMMISSIONING_MAP.md
> **Scope**: Artist brief for sprite replacements prioritized by rendering need â€” critical visual clarity fixes, NPC/enemy portraits, and particle effects.

### DOC-41: SPRITE_LIBRARY_PLAN.md
> **Scope**: Sprite asset budget and jam-reasonable animation frame specifications â€” coin flip, smoke, light-burst particles, and NPC idle cycles.

### DOC-42: SPRITE_STUB_ROADMAP.md
> **Scope**: Code-side implementation plan for layering artist PNG sprites with emoji fallback across raycaster, particle system, and UI components.

### DOC-43: AGENT_BLOCKOUT_INSTRUCTIONS.md
> **Scope**: Level design guidelines for creating modular, interconnected floor spaces â€” building archetypes, critical-path navigation, and spatial composition rules.

### DOC-49: BLOCKOUT_ALIGNMENT.md
> **Scope**: Gap analysis between floor blockout vision (Morrowind density ramp: Seyda Neenâ†’Balmoraâ†’Vivec) and current implementation. Floor 0-3 proposed changes, density ramp, NPC counts, building archetype templates.
> **Floor tile texture composition âœ… A4.5**: ROAD/PATH/GRASS walkable tile types with tileFloorTextures contract wiring. Transition blending (Grey-Scott) POST-JAM.
> **Boardwalk fence rail âœ… A4.5**: FENCE tile (35), 0.4Ã— half-wall, fence_wood + floor_boardwalk textures. Chainlink/metal POST-JAM (alpha wall path dependency).
> **Bonfire rework âœ… A4.5**: 0.3Ã— stone ring with cavity glow. Cross-refs LIGHT_AND_TORCH Phase 2.5.

### DOC-44: EYESONLYS_TOOLTIP_SPACE_CANON.md
> **Scope**: Production-target reference from EyesOnly â€” responsive tooltip and NPC dialogue system dimensions for desktop, tablet, and mobile breakpoints.

### DOC-45: INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md
> **Scope**: Comprehensive audit mapping DG containers to EyesOnly, 9 confirmed bugs, 6-phase fix plan, transfer matrix, consistency checklist, decision log.

### DOC-48: PRESSURE_WASHING_ROADMAP.md
> **Scope**: Pressure washing system â€” hose pickup from cleaning truck (hero day spawn), sub-tile grime grids (4Ã—4 floor, 16Ã—16 wall), brush/spray interaction with nozzle items, hose path recording with kink detection (0.7Ã— pressure stacking), "roll up hose" retrace-path auto-exit via repurposed MinimapNav, minimap click distance gate (5+itemN), torch extinguish via spray (zero fuel hydration â€” intentionally inferior to TorchPeek careful method), cleaning truck as BPRD-style vehicle with bobbing ðŸ§µ cutout. EyesOnly RopeManager explicitly rejected in favor of MinimapNav + MC movement queue.

| Section | Content |
|---|---|
| Â§1 Design Vision | Core fantasy, hose-as-optional-upgrade |
| Â§2 Hose Object | Truck spawn, HosePeek, HoseState lifecycle, building validation, energy cost |
| Â§3 Hose Path | Trail recording, kink detection, minimap overlay |
| Â§4 Roll Up Hose | Reel-in auto-exit, retraces recorded path, MinimapNav distance gate |
| Â§5 Sub-Tile Grime Grid | Dual resolution (4Ã—4 floor, 16Ã—16 wall), rendering as translucent tint |
| Â§6 Beam/Spray Interaction | Aiming, brush kernels, nozzle modifiers, pressure/kink effect |
| Â§7 Torch Extinguish | Hose spray extinguish (zero hydration), adjacent splash, dependency on LIGHT_AND_TORCH Phase 3 |
| Â§8 Nozzle Items | Fan nozzle, Cyclone nozzle, equip slot |
| Â§9 Readiness Integration | GrimeGrid fractional cleanliness â†’ CleaningSystem |
| Â§10 Module Plan | 6 new modules, 9 modified modules, RopeManager rejection |
| Â§11 Execution Plan | PW-1 through PW-5 (~12.5h), Track A cross-dependency at PW-3 |
| Â§12 Post-Jam Vision | Saddle mirror, volumetrics, gyroscope, phase-locked grime |
| Â§13 Cross-References | LIGHT_AND_TORCH, INVENTORY_CARD_MENU_REWORK, UNIFIED_EXECUTION_ORDER |

### DOC-46: INVENTORY_CARD_MENU_REWORK.md
> **Scope**: Full architecture rework replacing DG's fragmented card/inventory/menu systems. Audit of 3â€“4 competing storage models, two card renderers (CardDraw canvas vs CardRenderer DOM), unregistered drag-drop zones, and direct state mutations. Ports EyesOnly's CardStateAuthority pattern â†’ CardAuthority (single read/write gateway, event emitter, serialize/deserialize, death reset with tiered persistence). CardTransfer (validated zone-to-zone moves with rollback, drop zone registry). MenuInventory (new pause menu surface, grid navigation, CardDraw as sole renderer). 5-step execution plan (~15h): build authority+transfer â†’ rewire existing â†’ build MenuInventory â†’ delete dead code â†’ regression test. Bug-to-fix mapping traces every visible bug to architectural root cause. **Sprint 0 prerequisite** â€” blocks all visual roadmap tracks and EyesOnly convergence sprints.

| Section | Content |
|---|---|
| Â§1 Audit | Storage fragmentation analysis, drag-drop ghost code, renderer duplication |
| Â§2 CardAuthority | State shape, event system, serialization, death reset, EyesOnly pattern source |
| Â§3 CardTransfer | Zone-to-zone validation, rollback, drop zone registry, transfer functions |
| Â§4 MenuInventory | ASCII layout mockup, grid navigation, CardDraw rendering, zone registration |
| Â§5 Refactor Specs | Player.js, CardSystem.js, CardFan.js, Salvage.js, Shop.js, HUD.js rewire |
| Â§6 Execution Plan | 5 steps, 15h total, load order update, deleted files list |
| Â§7 Bug Mapping | Each visible bug â†’ architectural root cause â†’ rework fix |

### DOC-47: EYESONLY_3D_ROADMAP.md
> **Scope**: Convergence roadmap â€” DG's engine (raycaster, skybox, minimap, movement, camera, inputs, N-layer) + DG's narrative (conspiracy, factions, Gleaner pivot, cleaning loops) + EyesOnly's proven game systems (LightingSystem, TagSynergyEngine, EnemyIntentSystem, StatusEffects, card quality tiers, loot scatter, save/load, audio stems). Only ONE DG module replaced (lighting.js 63 lines â†’ EyesOnly LightingSystem 1,106 lines); everything else additive. Sprint structure: S0 (15h inventory/card/menu rework) â†’ S1 (7h EyesOnly extractions) â†’ S2 (7h combat rewire) â†’ S3 (10h engine polish) â†’ S4 (5h cleaning loop wire) â†’ S5 (4h narrative + ship) = 48h total.

| Section | Content |
|---|---|
| Â§1 What Stays from DG | 16 engine modules (raycaster, skybox, minimap, movement, etc.) |
| Â§2 What Comes from EyesOnly | LightingSystem, TagSynergyEngine, EnemyIntentSystem, card quality, loot scatter, save/load, audio |
| Â§3 Sprint 0 | Inventory/Card/Menu Rework (prerequisite, references DOC-46) |
| Â§4 Sprint 1 | EyesOnly system extractions (IIFE adaptation, API mapping) |
| Â§5 Sprint 2 | Combat rewire (intentâ†’telegraphâ†’resolve, synergy combos) |
| Â§6 Sprint 3 | Engine polish (loot, save/load, audio, proc-gen) |
| Â§7 Sprint 4 | Cleaning loop wire (tool quality, torch system) |
| Â§8 Sprint 5 | Narrative + ship (factions, conspiracy, Act 1 choice) |

### DOC-51: CINEMATIC_CAMERA (engine/cinematic-camera.js)
> **Scope**: OoT-inspired letterbox + focus lock system. Black bars slide in top/bottom, viewport narrows, FOV zooms, camera can shake or lock onto a target angle. Renders after raycaster, before HUD. 310 lines, 6 presets built, 0 fully wired. Cross-cutting â€” consumed by combat, NPC dialogue, MonologuePeek, Dragonfire bonfire, boss rooms, and peek system.

| Section | Content | Status |
|---|---|---|
| Engine module | cinematic-camera.js â€” state machine, bar animation, FOV lerp, focus lerp, shake decay, auto-close | âœ… Built |
| Preset: combat_lock | Fast bars (12%), slight FOV zoom, no input lock | âœ… Defined, âœ… **Wired** (CombatBridge._beginCombat â†’ start, _onCombatEnd â†’ close) |
| Preset: dispatcher_grab | Medium bars (15%), forced turn, input lock, 3s duration | âœ… Defined, âœ… **Wired** (proximity choreography + forced turn) |
| Preset: monologue | Thick bars (18%), slow slide, no camera move, input lock | âœ… Defined, âŒ Not wired |
| Preset: morning_recap | Very thick bars (22%), dreamy FOV wide, input lock | âœ… Defined, âœ… Wired (game.js Â§7f â†’ MonologuePeek) |
| Preset: boss_entrance | Thick bars + shake (6px), fast slam, strong zoom | âœ… Defined, âŒ Not wired |
| Preset: peek | Thin bars (8%), subtle FOV, no input lock | âœ… Defined, âŒ Not wired |
| Preset: dragonfire_dialogue | **NEW** â€” Dragonfire triggers dialogue tree through fire | âŒ Not yet defined |
| NPC turn-and-face | MC.startTurn() + Player.setDir() from grab choreography | âœ… **Fixed** â€” forced turn via MovementController, not camera focus angle |
| NPC translucency | Clothes color overlay (per-slot tint via offscreen canvas + source-atop) | âœ… **Fixed** â€” per-slot tinting replaces full-stack overlay |

**Blockers:** ~~NPC turn-and-face regression~~ FIXED. ~~Clothes overlay translucency~~ FIXED (per-slot tint). No remaining blockers for cinematic wiring.

**Jam priority:** ~~Fix turn-and-face~~ âœ… â†’ ~~wire dispatcher_grab to Tutorial gate 2~~ âœ… â†’ ~~wire morning_recap to Â§7f flag~~ âœ… â†’ ~~wire combat_lock~~ âœ…. 3/7 wired â€” sufficient for jam.

**Post-jam:** dragonfire_dialogue, boss_entrance, peek.

---

### DOC-52: READINESS_BAR_ROADMAP.md
> **Scope**: Full readiness system design â€” bar visual FX (constellation tracer port), two-tier scoring model (core 0â€“100% + extra credit 0â€“100% = 0â€“200% overhealing), staggered dungeon schedule, death-shift mechanics, combo multiplier, heart dungeon confrontation, and DungeonSchedule module architecture. Covers the jam's conflict-resolution/win-state requirement.

| Section | Content | Status |
|---|---|---|
| Â§1 Readiness Bar Visual Design | Canvas bar constants, constellation tracer FX, interaction sweep / fill pump / rescind slide animations, overhealing glow | ðŸ“ Spec done |
| Â§2 Readiness Score Model | Core weights (crate 35%, clean 25%, torch 20%, trap 20%), extra credit weights (corpse 30%, cobweb 15%, overclean 10%, vermin/puzzle/doors/suit stubs) | âœ… ReadinessCalc refactored |
| Â§3 Bonfire Warp Threshold | Core score gating for dragonfire warp, advance-to-next-dungeon flow | âœ… menu-faces.js updated |
| Â§4 Morning Report & Mailbox | Hero-day reporting engine, dependency chain, mailbox-peek integration | ðŸ“ Spec done |
| Â§5 Revolving Mini Win-State | Cycle Report Card (0â€“5 stars), escalating targets, victory/failure conditions | ðŸ“ Spec done |
| Â§6 Dependency Graph | Full system dependency DAG | ðŸ“ Spec done |
| Â§7 Implementation Priority | R-1 through R-6 phased plan, R-3 = DungeonSchedule module | ðŸ“ Spec done |
| Â§8 Cross-References | Links to DOC-7, DOC-2, DOC-30, DOC-22, DOC-11 | Reference |
| Â§9 Staggered Dungeon Schedule | Groups A/B/C, 8-day jam arc timeline, DungeonContract data model | ðŸ“ Spec done |
| Â§10 Death-Shift Mechanics | Per-group rules, narrative justification, 5 edge cases | ðŸ“ Spec done |
| Â§11 Combo Multiplier | Porta-john clipboard streak, 1.0xâ†’1.3x rules, payout examples, dispatcher board juice | ðŸ“ Spec done |
| Â§12 Heart Dungeon | Floor 0.N.N, employer faction (â™¥), Day 8 confrontation, 4 ending variants | ðŸ“ Spec done |
| Â§13 DungeonSchedule Module | Layer 1 module shape, integration points, JAM_CONTRACTS config | âœ… Built + tested |
| Â§14 Mailbox System | Physical exterior tile (bonfire pattern), interior history peek (bookshelf pattern), MailboxPeek refactor, R-5a phase plan | ðŸ“ Spec done |

**Implementation**: `engine/readiness-calc.js` (âœ… refactored), `engine/hud.js` (âœ… bar rendering), `engine/dungeon-schedule.js` (âœ… built + 26 tests pass), `engine/mailbox-peek.js` (ðŸ”¨ refactor pending Â§14)
**Design refs**: DOC-7 Â§5 (economy/day loop), DOC-2 Â§16 (dungeon reset), DOC-30 (bonfire), DOC-22 (HUD layout), DOC-11 (factions)

### DOC-54: INTERACTIVE_OBJECTS_AUDIT.md
> **Scope**: Tile-by-tile rendering and interaction audit for every non-WALL opaque tile. Created during the sprite-inside-wall â†’ step-fill cavity pivot. Documents two critical bugs fixed (biome override erasure, bonfire menu trap), full height/texture/interaction-mode matrix across exterior/interior/dungeon biomes, and remaining issues (CHEST walk-on inconsistency, TORCH exterior height mismatch, BREAKABLE interior height).

| Section | Content | Status |
|---|---|---|
| Critical Bug: Biome Override Erasure | `tileWallHeights` replacing base defaults entirely â€” all biomes now explicit | âš ï¸ Fixed |
| Critical Bug: Bonfire Menu Trap | No interaction cooldown after menu close â†’ inescapable re-open loop on LG | âš ï¸ Fixed |
| Tile-by-Tile Audit | 20-tile matrix: ID, walkability, opacity, height per biome, texture, visual composition | âœ… Reference |
| Remaining Issues | CHEST walk-on vs short-wall, TORCH exterior height, BREAKABLE interior height | âŒ Open |
| Interaction Modes Summary | Step-on auto, F-interact, Peek auto-show, NPC interact â€” full trigger matrix | âœ… Reference |
| Session 2 Fixes | Billboard sprite centering (double +0.5 offset in mailbox/bonfire sprites) | âš ï¸ Fixed |
| Session 3 Fixes | Alpha-porthole abandoned â†’ step-fill cavity technique adopted for HEARTH/BONFIRE | âš ï¸ Fixed |
| Files Changed | 10 engine files + 3 docs across 3 sessions | Reference |

**Cross-refs**: DOC-31a (step-fill cavity Â§2.5), DOC-30 (bonfire polish), DOC-49 (blockout alignment), DOC-55 (interaction catalog)

### DOC-55: MENU_INTERACTIONS_CATALOG.md
> **Scope**: Complete interaction catalog for the 4-face rotating box menu (minimap/context, inventory, gear/journal, system settings), HUD footer bar (StatusBar), and all peek overlays. Every clickable element, display-only element, and stub-needed element with status (complete/stub/wired). Generated during Sprint 0 visual overhaul.

| Section | Content |
|---|---|
| Face 0 â€” Minimap/Context | Pause, Bonfire, Shop, Harvest contexts â€” map display, warp button, faction rows |
| Face 1 â€” Inventory | Card slots, bag grid, equipped quick-slots, drag-drop zones, sell parts |
| Face 2 â€” Journal/Gear | Work orders, stat page, settings stubs |
| Face 3 â€” System Settings | Volume, controls, quit stubs |
| StatusBar Footer | Tooltip feed, HP/energy pips, battery, currency |
| Peek Overlays | Per-tile peek trigger catalog cross-referenced with DOC-54 interaction modes |

**Cross-refs**: DOC-21 (game flow), DOC-36 (Face 2 polish), DOC-54 (interaction audit), DOC-12 (peek system)

### DOC-56: RESOURCE_DESIGN.md
> **Scope**: Economy primitives â€” gold, battery, food, and any secondary resources. Mint rates, drop tables, bonfire exchange values, tool durability costs. Design reference for balancing the Gleaner's daily budget against dungeon readiness thresholds.

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
> **Scope**: SFX commissioning audit â€” maps every in-engine AudioSystem.play() call key to its source file status (âœ… shipped / ðŸ”¸ stub / âŒ missing). Includes priority tier (jam-critical vs post-jam), suggested substitute keys for stubs, and notes from the audio CORS fix pass.

**Cross-refs**: DOC-6 (audio engine), DOC-50 (spatial bark), docs/itch-submission-kit.md (audio size budget)

### DOC-61: FLOOR2_BLOCKOUT_PREP.md
> **Scope**: Pre-blockout planning notes for Floor 2 (Lantern Row). Covers six-pod layout proposal, NPC placement, connection edges to Floor 2.1 (Vaultmaster's Sanctum) and Floor 2.2 (Watchman's Post / Hero's Wake), and prerequisite fixes needed before blockout begins.

**Cross-refs**: DOC-49 (blockout alignment), FLOOR2_BLOCKOUT.md

### DOC-62: POST_JAM_ITEM_ROADMAP.md
> **Scope**: Post-jam item expansion roadmap. New consumable categories, tool tiers, equipment slots, crafting primitives, and the full item-metadata contract extensions needed for multi-dungeon arc replayability. Deferred from jam build â€” no jam-deadline dependency.

**Cross-refs**: DOC-26 (metadata contract), DOC-45 (inventory audit)

### DOC-66: quest-marker-audit.md
> **Scope**: Quest marker system audit â€” root-cause of the "lost between floors" regression, phase-by-phase null-drop analysis, jam-day patch description (applied 2026-04-04 to `_updateQuestTarget()` in game.js), and post-jam rework spec for a data-driven `QuestChain` module anchored to `DumpTruckSpawner`. Includes a five-path verification walk.

**Cross-refs**: engine/game.js (`_updateQuestTarget`), engine/dungeon-schedule.js, engine/dump-truck-spawner.js, engine/minimap.js

### DOC-67: PRESSURE_WASH_SYSTEM.md
> **Scope**: Living architectural reference for the pressure washing pipeline (grime grid, spray system, pointer-aim squeegee, stroke interpolation, nozzle resolution). Describes the full inputâ†’sprayâ†’grimeâ†’render data flow, gate chain, brush kernels, GrimeGrid 64Ã—64 wall resolution, velocity-dependent cleaning, and six future gyroscope integration points with signal definitions. Integration spec for Magic Remote test harness.

**Cross-refs**: DOC-48 (PW roadmap), DOC-81 (audio commissioning Â§5b), engine/spray-system.js, engine/grime-grid.js

### DOC-68: CHEST_RESTOCK_AND_WORK_ORDERS.md
> **Scope**: Chest restock system and work order mechanic design. Covers crate fill-tag taxonomy, work order generation from dungeon state, restock prioritization, and completion criteria for readiness scoring.

**Cross-refs**: DOC-59 (depth-3 balance), DOC-57 (CrateUI overhaul), DOC-52 (readiness bar)

### DOC-69: RESTOCK_AUDIT.md
> **Scope**: Comprehensive audit of all restock/maintenance interactions across the codebase. Maps every restockable surface to its current implementation status, identifies gaps, and proposes unification.

**Cross-refs**: DOC-70 (unified restock surface), DOC-68 (work orders), DOC-54 (interactive objects audit)

### DOC-70: UNIFIED_RESTOCK_SURFACE_ROADMAP.md
> **Scope**: Unified restock surface roadmap â€” collapses torch, crate, trap, cobweb, and cleaning surfaces into a single interaction contract with shared peek/fill/verify patterns. Reduces code duplication across RestockBridge, TorchPeek, CratePeek.

**Cross-refs**: DOC-69 (restock audit), DOC-12 (peek system), DOC-71 (spatial contracts)

### DOC-71: SPATIAL_CONTRACTS.md
> **Scope**: Spatial contracts audit â€” interactive tile behavior by floor depth. Maps every tile type to its render/interact/gate rules per biome, documents depth-gated progression, and establishes the contract between GridGen, FloorManager, and the interact prompt system.

**Cross-refs**: DOC-54 (interactive objects audit), DOC-2 (tutorial world Â§4), DOC-49 (blockout alignment)

### DOC-72: GAME_JS_EXTRACTION_ROADMAP.md
> **Scope**: game.js decomposition roadmap â€” extraction plan that reduced game.js from 7,592 to 5,075 lines. Documents each extracted module (combat-bridge, intro-walk, bark-library, etc.), extraction methodology, and remaining monolith sections flagged for future extraction.

**Cross-refs**: DOC-47 (EyesOnly 3D roadmap), DOC-1 (gap coverage), engine/game.js

### DOC-73: ARCHITECTURAL_SHAPES_ROADMAP.md
> **Scope**: Architectural shapes extension â€” peaked roofs, eaves, stoops, wall-mounted fixtures, and window openings for the raycaster. Extends the Doom-convention wall rendering with parametric geometry overlays.

**Cross-refs**: DOC-18 (N-layer raycaster), DOC-14 (texture roadmap), DOC-8 (visual overhaul)

### DOC-74: ACT2_NARRATIVE_OUTLINE.md
> **Scope**: Act 2 narrative outline â€” open city expansion, faction war escalation, and Seaway introduction. Covers the player's transition from dungeon janitor to faction operative, new floor graph extensions, and the dragon conspiracy reveal arc.

**Cross-refs**: DOC-13 (Street Chronicles), DOC-4 (Biome Plan Â§19), DOC-2 (tutorial world)

### DOC-75: HERO_FOYER_ENCOUNTER.md
> **Scope**: Hero Foyer encounter design spec for Floor 2.2.1 (Hero's Wake B1). First direct hero encounter, stealth check, combat-or-flee decision tree, and the narrative beat where the player witnesses hero carnage firsthand.

**Cross-refs**: DOC-2 (tutorial world Â§6), DOC-3 (Gone Rogue stealth), DOC-7 (core loop Â§6)

### DOC-76: gameover.md
> **Scope**: Hard game over design â€” failure states, death conditions, hero-rescue narrative, humiliation gradient, and restart flow. Defines what happens when HP hits zero, when curfew is violated, and the consequences escalation ladder.

**Cross-refs**: DOC-7 (core loop Â§5), DOC-21 (game flow), DOC-2 (tutorial world Â§17)

### DOC-77: BOX_EDITOR_PRODUCT_ROADMAP.md
> **Scope**: BoxForge â€” CSS 3D box geometry editor product roadmap. A designer tool for building and previewing the 4-face rotating box (pause menu, peek boxes, CrateUI) with live CSS transform output.

**Cross-refs**: DOC-55 (menu interactions catalog), DOC-58 (peek box visual audit)

### DOC-78: PEEK_WORKBENCH_SCOPE.md
> **Scope**: Peek workbench scope and status â€” developer tool for rapid iteration on peek box layouts. Live preview of TorchPeek, CratePeek, CorpsePeek, BedPeek with hot-reload slot editing.

**Cross-refs**: DOC-12 (peek system), DOC-58 (peek box visual audit), DOC-77 (box editor)

### DOC-79: floor3-crosshair-blockout.md
> **Scope**: Floor 3 (The Garrison) crosshair blockout â€” 52Ã—52 hand-authored grid, frontier biome. Room layout, connection edges, enemy placement zones, and key gate positions for the garrison level.

**Cross-refs**: FLOOR3_BLOCKOUT.md, DOC-49 (blockout alignment), DOC-43 (agent blockout instructions)

### DOC-80: SEAWAY_FLOOR_DESIGN.md
> **Scope**: Seaway floor design â€” Floors 0.1, 0.1.1, 0.1.2. The underground waterway connecting the town surface to the deeper dungeon network. Act 2 content, introduces water traversal and marine biome enemies.

**Cross-refs**: DOC-74 (Act 2 narrative), DOC-4 (Biome Plan Â§7), DOC-2 (tutorial world Â§2)

### DOC-81: AUDIO_COMMISSIONING.md
> **Scope**: Master audio commissioning document (EyesOnly). SFX specification tables with duration, volume, tonal description, and mix notes for all game audio. Includes Â§5b Pressure Washing Water SFX (13-row table covering spray loop, spray burst Ã—4, wall squeegee, tile-clean chime, hose attach/detach/snap/kink/drag/drip, reel start/done) with nozzle variant guidance and mix priority stack.

**Cross-refs**: DOC-6 (audio engine), DOC-60 (SFX commissioning audit), DOC-48 (PW roadmap), DOC-67 (PW system)

**Cross-refs**: engine/game.js (`_updateQuestTarget`), engine/dungeon-schedule.js, engine/dump-truck-spawner.js, engine/minimap.js

### DOC-82: POST_JAM_EXECUTION_ORDER.md
> **Scope**: Post-jam patch execution plan targeting voting deadline (~2026-04-25). Five phases: P1 Menu Usability (pause button, S-factor scaling, debrief legibility), P2 Interaction Polish (chest playtest gate, button routing, NPC dialogue), P3 Architecture Cleanup (card-renderer rewire, game.js extraction), P4 Systems Hardening (hose edge cases, readiness verification, crate hover), P5 Skybox Quick Wins (sky cycling, time widget). Supersedes DOC-32 jam-era sequencing. Estimated 17-22h total.

**Cross-refs**: DOC-32 (UNIFIED_EXECUTION_ORDER, superseded), DOC-54 (interactive objects audit), DOC-55 (menu interactions catalog), DOC-72 (game.js extraction), DOC-48 (PW roadmap)

### DOC-83: VERB_FIELD_NPC_ROADMAP.md
> **Scope**: Verb-field NPC system architecture — spatial node registry, need-decay verbs, encounter classification, bark semantics, cross-floor traversal model, reanimated creature verb integration, living infrastructure hooks, and reanimation tier model.

**Cross-refs**: DOC-9 (NPC system), DOC-74 (Act 2 faction lock), DOC-84 (living infrastructure blockout), DOC-11 (faction audit)

### DOC-84: LIVING_INFRASTRUCTURE_BLOCKOUT.md
> **Scope**: Floor-by-floor living infrastructure blockout — tiles, building templates, verb-node registrations, trap/cobweb disposition layers, anti-mush invariants, dungeon creature verb tiles, corpse recovery loop, faction relationship simulation, and economy-support interiors.

**Cross-refs**: DOC-83 (verb fields), DOC-74 (Act 2 faction lock + housing reassignment), DOC-10 (cozy interiors), DOC-11 (faction populations), DOC-59 (depth-3 cleaning loop)

### DOC-85: D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md
> **Scope**: Depth-3 reliability audit + roadmap. Defines unified AI disposition contract, reanimation reprioritization path, proc-gen puzzle-layer invariants, cobweb/trap/hose systemic coupling, and acceptance tests for reproducible dungeon behavior.

**Cross-refs**: DOC-84 (living infrastructure), DOC-83 (verb-field NPC), DOC-31 (cobweb/trap strategy), DOC-48/DOC-67 (pressure wash), DOC-74 (Act 2 narrative)
---

## Jam Sprint Execution History (Archived)

The full phase-by-phase execution plan (Phases A.0 through G, ~340 lines of task tables, dependency graph, and daily schedule) has been archived to `docs/Archive/JAM_SPRINT_EXECUTION_ORDER.md`. Below is the compressed summary.

| Phase | Scope | Status |
|-------|-------|--------|
| A.0 | Pre-Phase: Morning Send-Off & Key Gate (bark engine, dispatcher, home floor) | âœ… 6/7 done, A0.7 post-jam |
| A | Combat Finish & Stealth Extraction (telegraph, corpse, stealth, awareness, HUD) | âœ… 6/6 COMPLETE |
| B | Crate & Corpse Slot System & Restocking Loop | âœ… 7/7 COMPLETE |
| C | Tile Cleaning & Dungeon Reset (cleaning-system, readiness, traps, work orders) | âœ… 8/8 COMPLETE |
| C.5 | Stardew Day Loop & Status Effects (bed, hero-run, mailbox, day cycle, buffs) | âœ… 20/20 CLOSED |
| D | Hero AI & Patrol Routes (4 hero types, carnage manifest, detection FSM) | âœ… 6/6 COMPLETE |
| E | Hero Encounters & Faction Economy | 4/6 done â€” E1 (boss fight) and E2 (hero deck) NOT STARTED |
| E.5 | Interactive Objects Audit + Playtest Gate | 7/10 done â€” E5.8/E5.9/E5.10 OPEN |
| F | Economy Tuning & Tool Progression | Not started (5 tasks, ~6.5h) |
| G | Audio, LG Validation & Submission Polish | Not started (8 tasks, ~12h) |

**Open items carried forward**: E1/E2 (hero boss encounter), E5.8-E5.10 (chest interaction + playtest gate), all of Phase F and G.

---

## Cross-Reference Key

| Tag | Meaning |
|-----|---------|
| `â†’ DOC-N Â§X` | "See document N, section X for details" |
| `â† DOC-N Â§X` | "This section is referenced by document N, section X" |
| `âŠ• PHASE X.N` | "This maps to cross-roadmap Phase X, task N" |
| `âœ…` | Already complete |
| `ðŸ”„` | In progress this sprint |
| `âŒ` | Blocked or deferred |

---

*This document is the single entry point for project documentation. For the full jam sprint execution detail, see `docs/Archive/JAM_SPRINT_EXECUTION_ORDER.md`.*


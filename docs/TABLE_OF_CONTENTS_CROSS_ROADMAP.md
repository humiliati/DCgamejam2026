# Dungeon Gleaner — Cross-Roadmap Execution Order

**Created**: 2026-03-28
**Jam Deadline**: April 5, 2026 (8 days remaining)
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
| §2 World Graph | Floor 0 → 0.1 → 0.1.N → 1 → 1.N → 2 → 3 hierarchy |
| §3 Floor Registry | 14 floors + connection edges |
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
| **§16 Revised Phases** | Phase 1–8 reordered for Gleaner pivot |
| **§17 Revised Player Journey** | Three-act progression |

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

---

## Cross-Roadmap Execution Order

Phases are dependency-ordered. Each phase lists its source document, section reference, estimated hours, and what it unblocks. **All phases must complete for a playable prototype.**

Total estimate: **~42–52 hours across 8 days** (5–6.5h/day average).

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
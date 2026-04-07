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

> **Extraction note:** `_shopBuy()` was extracted from `game.js` to `engine/shop-actions.js` as `ShopActions.buy()`. `_onPickupWorkKeys()` was extracted to `engine/home-events.js` as `HomeEvents.onPickupWorkKeys()`.
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
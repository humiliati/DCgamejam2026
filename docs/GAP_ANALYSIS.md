# Dungeon Gleaner — Gap Analysis & Stardew Valley Gameflow Roadmap

**Created**: 2026-03-30
**Purpose**: Map the codebase against the design docs, identify what's built vs what's missing for the Stardew Valley-style day loop, catalog juice opportunities and edge cases, and prioritize the remaining work for jam deadline (April 5).

---

## 1. Cross-Roadmap Phase Status

### Phase A.0 — Pre-Phase: Morning Send-Off & Key Gate
**Status: COMPLETE** (A0.1–A0.6 all done)

| Task | Status | Notes |
|------|--------|-------|
| BarkLibrary engine | ✅ | Weighted pick, cooldown, oneShot, template substitution ({callsign}/{class}) |
| Bark data pools (en.js) | ✅ | 40+ pools including time-aware, Hero Day, muffled, class-specific |
| IntroWalk bark step + HOME_DEPARTURE | ✅ | Scripted walk sequences |
| NPC composer dispatcher preset | ✅ | NPC spawning works |
| Floor 1.6 (Gleaner's Home) | ✅ | 10×8 grid, bed, keys chest, mailbox tile, door exit |
| Game.js BarkLibrary wiring, Dispatcher spawn, key-check | ✅ | Gate flow functional |

### Phase A — Combat Finish & Stealth Extraction
**Status: COMPLETE** (all A1–A6 done)

| Task | Status | Notes |
|------|--------|-------|
| Enemy attack telegraph (T1.5) | ✅ | EnemyIntent module: expression system (😐→😠→🔥), stack card display, threat levels, CombatBridge integrated |
| Death anim → corpse tile (T1.6) | ✅ | DeathAnim fold/poof → grid[y][x]=TILES.CORPSE → CorpseRegistry.register() with full enemy metadata |
| stealth-system.js extraction | ✅ | Full StealthSystem with darkness/cover/apron/crouch |
| awareness-config.js extraction | ✅ | UNAWARE → SUSPICIOUS → ALERTED → ENGAGED |
| Minimap sight cones | ✅ | Done |
| HUD 2× scale | ✅ | Done |

### Phase B — Crate & Corpse Slot System
**Status: COMPLETE** (B1–B7 all done)

| Task | Status | Notes |
|------|--------|-------|
| Crate-system.js (unified slot schema) | ✅ | Crates + corpse stocks |
| Crate-ui.js (canvas rendering) | ✅ | Framed box interaction |
| Frame→resource + hydration + suit card slot | ✅ | Matched suit = reanimate |
| Seal reward d100 + corpse reanimation | ✅ | Working |
| Corpse-peek.js | ✅ | BoxAnim coffin reveal |
| Shop round-trip (buy restock supplies) | ✅ | B5 — 3-face MenuBox (info/buy/sell), _shopBuy/_shopSellFromHand/_shopSellPart handlers wired |
| Bag inventory viewer | ✅ | B6 — Unified inventory face: equipped slots, bag wheel, hand strip, deck wheel, incinerator, hover tooltips |
| Stash transfer at bonfire | ✅ | B7 — Stash face in bonfire context, bag→stash face, DragDrop zones registered |

### Phase C — Tile Cleaning & Dungeon Reset
**Status: COMPLETE** (C1–C8 all done)

All 8 tasks done: blood rendering, HUD readiness bar, progressive cleaning tools, work order system, trap re-arm, cobweb wiring, floor deck reshuffle.

### Phase D — Hero AI & Patrol Routes
**Status: REIMAGINED** (abstract Hero Day system replaces real-time AI)

| Original Task | Current Status | Notes |
|---------------|---------------|-------|
| hero-system.js: 4 hero types | ✅ REIMAGINED | Abstract carnage manifests instead of real-time patrol |
| Patrol route generation | ⏭ DEFERRED | Abstracted — 1-2 pathing heroes per Hero Day is future work |
| 60° sight cone + Bresenham LOS | ✅ AVAILABLE | In enemy-ai.js, not used by hero system |
| Detection state machine | ⏭ DEFERRED | Stealth vs hero is post-Hero Day 0 feature |
| Hero cycle timer | ✅ REPLACED | DayCycle.isHeroDay() + 3-day HERO_DAY_INTERVAL |
| Wake of Carnage | ✅ | generateCarnageManifest() + applyCarnageIfHeroDay() |

**New systems built (not in original roadmap):**

| System | Module | Status |
|--------|--------|--------|
| Day/Night cycle (5 phases) | engine/day-cycle.js | ✅ |
| Floor-transition time advancement | engine/day-cycle.js | ✅ |
| Night-locked buildings | engine/day-cycle.js + floor-transition.js | ✅ |
| Atmosphere tinting (exterior fog) | engine/raycaster.js | ✅ |
| Time-aware bark routing | engine/npc-system.js | ✅ |
| Muffled bark through locked doors | engine/door-peek.js | ✅ |
| Hero Day economy barks | data/barks/en.js | ✅ |
| Callsign/class bark substitution | engine/bark-library.js | ✅ |
| Scripted hero entity (Floor 2.2.1) | engine/hero-system.js | ✅ |
| Abstract carnage manifests | engine/hero-system.js | ✅ |

### Phase E — Hero Encounters & Faction Economy
**Status: NOT STARTED**

All 6 tasks pending (E1–E6). Depends on D completion.

### Phase F — Economy Tuning & Tool Progression
**Status: NOT STARTED**

All 5 tasks pending (F1–F5). Depends on B/E completion.

### Phase G — Audio, LG Validation & Submission
**Status: NOT STARTED**

All 8 tasks pending (G1–G8). Background audio/visual work (G1, G2) can start any time.

---

## 2. The Stardew Valley Gameflow — Gap Assessment

The core loop described in DOC-7 §8 follows a Stardew Valley-style 3-day heartbeat. Here's what exists vs what's missing.

### 2.1 The Day Loop Model

```
MORNING:
  Wake at home (bed) ──────────────────── [MISSING: bed interaction]
  Check mailbox (hero reports) ─────────── [MISSING: mailbox system]
  Read work orders ─────────────────────── [EXISTS: work-order-system.js]
  Exit home → town ─────────────────────── [EXISTS: floor transition]

DAYTIME:
  Visit shops (buy supplies) ───────────── [COMPLETE: 3-face shop MenuBox, buy/sell/salvage wired]
  Descend to dungeon ───────────────────── [EXISTS: floor transitions]
  Clean / Restock / Endure ─────────────── [EXISTS: cleaning + crate + combat systems]
  Return to surface ────────────────────── [EXISTS: floor transitions]

EVENING:
  Dusk warning barks ───────────────────── [EXISTS: DayCycle phase callbacks]
  Shops close (night-lock) ─────────────── [EXISTS: night-lock system]
  Head home ────────────────────────────── [EXISTS: player can walk]

NIGHT:
  Sleep (advance to next dawn) ─────────── [MISSING: bed-peek.js]
  Hero run executes overnight (if Hero Day eve) ── [MISSING: overnight hero run]
  Mail delivered at dawn ───────────────── [MISSING: mailbox-peek.js]
```

### 2.2 The Sisyphus Loop (Non-Day-0 Hero Days)

```
Hero Day dawn:
  Player wakes in bed / inn bonfire ────── [MISSING: morning spawn routine]
  Mailbox notification (hero-run report) ── [MISSING: mailbox system]
  NPC Hero Day barks ──────────────────── [EXISTS: heroday bark pools]
  All dungeons re-carnaged ────────────── [EXISTS: carnage manifest system]
  1-2 dungeons have pathing heroes ────── [MISSING: pathing hero entities]
  Go to dungeon "like Sisyphus" ────────── [EXISTS: player traversal]
```

### 2.3 Critical Missing Systems (Dependency Order)

These are the systems that must exist for the Stardew loop to function. Ordered by what unblocks what.

| # | System | Blocks | Est. | Priority |
|---|--------|--------|------|----------|
| **G1** | **Rest mechanic (bed-peek.js)** | Morning routine, day advancement, entire day loop | 2h | 🔴 CRITICAL |
| **G2** | **Morning spawn routine** | Waking at home, mailbox check, day-start flow | 1.5h | 🔴 CRITICAL |
| **G3** | **Mailbox system (mailbox-peek.js)** | Hero-run feedback, payout delivery, juice moments | 3h | 🔴 CRITICAL |
| **G4** | **Overnight hero-run execution** | Mailbox reports, dungeon re-carnage, payout calc | 2h | 🔴 CRITICAL |
| **G5** | **Debuff system** | Death/curfew consequences, morning debuff display | 1.5h | 🟡 IMPORTANT |
| **G6** | **Curfew collapse** | Night-phase consequences, NPC wink the next morning | 1h | 🟡 IMPORTANT |
| **G7** | **Dispatcher dialogue tree** | Day 0 contextual choices (3-choice Morrowind-style) | 2h | 🟡 IMPORTANT |
| **G8** | **Taskmaster NPC (taskmaster-peek.js)** | Floor baiting, hero dispatch targeting | 2h | 🟠 MEDIUM |
| **G9** | **Job board peek (job-board-peek.js)** | Work order display, readiness targets | 1.5h | 🟠 MEDIUM |
| **G10** | **Pathing hero entities** | 1-2 dungeons with live heroes on Hero Day | 3h | 🟠 MEDIUM |
| **G11** | **Death → home respawn** | Death consequence loop (currently respawns at bonfire) | 1.5h | 🟡 IMPORTANT |
| **G12** | **HUD day/cycle counter** | Player awareness of time and hero schedule | 1h | 🟡 IMPORTANT |

**Total estimated for minimal Stardew loop: ~12h** (G1–G4 + G12)

---

## 3. Juice Opportunities Catalog

### 3.1 Accumulated Mailbox Payout (The Big One)

**Scenario:** Player fails to check mailbox for consecutive successful hero weeks. They open 3-4 mailboxes worth of reports at once.

**Implementation vision:**
- Mailbox tracks `_unreadReports[]` array. Each hero cycle appends a report.
- When the player opens the mailbox with N unread reports:
  1. Reports display one at a time (page through with A/D)
  2. After the last report: **PAYOUT EXPLOSION**
  3. All accumulated coins animate from mailbox to player total in a staggered burst
  4. Each coin has *clink* SFX with escalating pitch (coins per second increases)
  5. A rising counter shows total: `+34... +78... +142... +267 COINS!`
  6. At 5+ unread reports: screen shake, gold particle burst, triumphant 4-note fanfare
  7. Toast: "📬 That's a lot of back pay, Gleaner."
- **Design note:** This is the "sell all your crops at once" Stardew moment. The delay creates a jackpot that feels earned.

**Edge cases:**
- Cap unread reports at 10 (prevents memory issues with giant arrays)
- If player has 10 unread, next cycle's report overwrites oldest (FIFO)
- Death reports stack too — opening 3 death reports + 2 success reports creates a dramatic emotional arc
- Zero-payout reports (no floors baited, hero disappointed) still count as "read" and still appear in the stack

### 3.2 Hero Day Dawn Announcement

**Exists partially** (bark pools registered). Missing:
- Town bell SFX (3 tolls, distinct from dusk single toll)
- HUD `⚔️ HERO DAY` badge (3-second display)
- Sharper dawn skybox palette on Hero Days

### 3.3 First Perfect Run

**Missing entirely.** When readiness hits 100% for the first time:
- Full fanfare (4-note phrase)
- HUD glow on all sub-scores
- Rare card guaranteed in next mailbox
- NPC barks reference it: "I heard the Foundry's clean for the first time in decades."

### 3.4 Combo Seal

**Missing.** Sealing 3+ crates within 10 seconds triggers combo counter (`×2 COMBO`, `×3 COMBO`) with escalating SFX and coin multiplier. This is the cleaning equivalent of a Tetris chain.

### 3.5 Death → Hero Rescue Narrative

**Missing.** The most emotionally impactful fail state:
- Deep red screen → fade to black
- Low brass drone SFX
- Slow 2.0s fade-in at home with washed-out palette
- `HUMILIATED` badge before debuff icons load
- Red-bordered mailbox report with halved payouts
- Town NPCs reference rescue for 1 day

### 3.6 Curfew NPC Wink

**Missing.** Morning after curfew failure:
- Hero NPC standing outside player's front door
- Approach triggers wink emoji bark: "Rough night, Gleaner?"
- Jaunty bounce animation, chuckle SFX

### 3.7 Dungeon Re-entry After Hero Run

**Partially exists** (carnage manifests apply on floor arrival). Missing:
- Visual contrast: the dungeon should *look* dramatically different post-hero
- Low ominous chord on first step into trashed dungeon
- Staggered Toast narration of what the hero did exists but needs more drama

---

## 4. Edge Cases & Potential Problems

### 4.1 Time System Edge Cases

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| **Hero Day triggers during NIGHT phase** | Player is in a dungeon at night when Hero Day dawn should fire | DayCycle only advances via floor transitions, not real-time. Hero Day starts at next dawn after sleep. No issue — hero run is overnight between sleep and wake. |
| **Player never sleeps** | Game clock advances on floor transitions but never wraps to next day | Need a forced curfew at NIGHT→100% that auto-sleeps the player. Without this, the day never ends. |
| **Interior time-freeze + door transitions** | Player enters building at DUSK, time freezes, exits 30 floor-transitions later — still DUSK? | ✅ DayCycle already pauses on depth-2. Time resumes on exit. But: time should NOT advance for the building-enter transition itself. Currently `BUILDING_ENTER: 10` advances 10 minutes on entry. This means entering at 99% night could push past curfew during the "frozen" interior. **FIX: Skip time advance for depth-2 entries.** |
| **Rapid floor transition spam** | Player goes in/out of a building repeatedly to advance time quickly | Each transition advances 5-10 min. 6 round-trips = 1 hour. Not exploitable — it's slow enough to be boring. Low risk. |
| **Night-lock race condition** | Player starts floor transition to a building just as DayCycle ticks to DUSK | FloorTransition checks isNightLocked() before starting animation. The check is synchronous. No race — the state is consistent at check time. |
| **Sleep on Hero Day** | Player sleeps on Hero Day (day 0, 3, 6...). What happens? | Hero run should execute overnight. Player wakes to mailbox report. The hero-run logic must fire during the sleep→next-dawn transition. |

### 4.2 Mailbox System Edge Cases

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| **No floors baited for hero run** | Hero arrives but has nothing to do | Generate a "disappointed hero" report: "No floors marked. The Seeker wandered the town and left. No payout." Still counts as a hero cycle. |
| **Accumulated payout overflow** | 10 cycles × 200 coins = 2000 coins dumped at once | Cap visual animation at ~200 coins (batch the rest). Counter still shows full total. Juice scales with report count, not coin count. |
| **Player checks mailbox mid-day (no new mail)** | Disappointing interaction | Show "📭 No new mail. Next hero cycle: N days." — already spec'd in DOC-7 §11.2. |
| **Death report + normal report same cycle** | Player dies, hero rescues them, hero also runs dungeons | Single report with two sections: rescue narrative + dungeon results. Payout halved for the whole cycle. |
| **Player ignores mailbox forever** | Reports accumulate, coins never delivered | Coins should deposit automatically into player's account. Mailbox is just the *report* — the payout is ambient. Otherwise the player could softlock themselves economically. |

### 4.3 Gate State & Day Cycle Interactions

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| **Gate state persistence across days** | Does the Dispatcher respawn every day? | No. Gate unlock is permanent (single `_gateUnlocked` boolean). Day 0 only. |
| **Dispatcher position** | Currently at (5,2) — is this the Floor 1→2 gate? | **NEEDS VERIFICATION.** DOC-2 §4 says "south wall funnels to 2-3 tile passage." The Dispatcher should be at the narrowing, not arbitrary. Check Floor 1 grid. |
| **Key already obtained before bump** | Player finds home, gets keys, then bumps Dispatcher | Dispatcher dialogue needs 3 contextual branches: (1) "I have the key" → skip fetch, (2) "I heard it's unlocked" → skip fetch + go directly, (3) "OK where's home?" → standard redirect. This is the Morrowind-style dialogue tree. |
| **Player re-enters home after keys obtained** | Keys chest tile should be EMPTY | ✅ Already handled — `_checkWorkKeysChest` only fires if keys haven't been picked up. |

### 4.4 Hero System Edge Cases

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| **Carnage on non-dungeon floors** | Hero manifest applies to exterior/interior floors | ✅ Already guarded — `applyCarnageIfHeroDay` checks floor depth ≥ 3. |
| **Double carnage on same floor** | Player exits and re-enters dungeon on same Hero Day | ✅ Already guarded — `_carnageAppliedFloors` Set tracks per-session. |
| **Carnage applied floors reset** | `_carnageAppliedFloors` cleared between sessions? | Currently cleared on `HeroSystem.init()`. Needs to clear on new Hero Day start, which it does via DayCycle callback. ✅ |
| **Hero Day during sleep transition** | Player sleeps on Day 2 eve. Day 3 is Hero Day. Hero run must execute before player wakes. | Sleep→dawn transition must: (1) Advance day counter, (2) Check if new day is Hero Day, (3) Execute hero run against all baited floors, (4) Generate mailbox report, (5) Apply carnage manifests to floor caches, (6) THEN spawn player at home. |
| **No dungeon floors exist yet** | Hero Day on Day 0 — player hasn't reached any dungeons | Hero Day 0 is special: heroes are *already done* (the mess is pre-existing). Carnage is part of initial floor generation, not a runtime manifest. Need to ensure Day 0 hero cycle doesn't try to run a fresh carnage pass on floors the player hasn't visited. |

### 4.5 Combat & Death Edge Cases

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| **Death in depth-2 interior** | DOC-7 says respawn at home. Currently respawns at last bonfire. | HazardSystem needs modification: depth 1-2 death → FloorTransition to "1.6" + debuffs. Depth 3 death → same but with SHAKEN debuff. |
| **Death with no home floor visited** | Player dies on Day 0 before ever entering Floor 1.6 | Force-spawn at Floor 1.6 anyway. The home exists even if the player hasn't visited it. |
| **Stacked debuffs from consecutive deaths** | Player dies, wakes with GROGGY, goes back, dies again | Debuffs should not stack duration — refresh to full duration on re-application. SHAKEN from depth-3 death is separate and stacks with GROGGY/SORE. |

---

## 5. Dependency Graph for Remaining Work

```
                    ┌──────────────────────┐
                    │  REST MECHANIC (G1)   │ ← Blocks everything
                    │  bed-peek.js          │
                    │  Sleep → advance day  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
    ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
    │ OVERNIGHT HERO   │ │ MORNING      │ │ HUD DAY/CYCLE    │
    │ RUN (G4)        │ │ SPAWN (G2)   │ │ COUNTER (G12)    │
    │ Execute carnage  │ │ Wake at home │ │ "Day 2 of 3"     │
    │ Calculate payout │ │ Set phase    │ │ Hero Day badge   │
    └────────┬────────┘ └──────┬───────┘ └──────────────────┘
             │                 │
             ▼                 ▼
    ┌─────────────────┐ ┌──────────────┐
    │ MAILBOX SYSTEM   │ │ DEBUFFS (G5) │
    │ (G3)            │ │ GROGGY/SORE/ │
    │ Reports + payout │ │ HUMILIATED   │
    │ Accumulated juice│ │ Stat mods    │
    └────────┬────────┘ └──────┬───────┘
             │                 │
             ▼                 ▼
    ┌─────────────────┐ ┌──────────────┐
    │ DISPATCHER       │ │ CURFEW (G6)  │
    │ DIALOGUE (G7)   │ │ Auto-sleep   │
    │ 3-choice tree    │ │ + debuffs    │
    └─────────────────┘ └──────┬───────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │ DEATH → HOME     │
                    │ RESPAWN (G11)    │
                    │ Cycle shift      │
                    │ Rescue narrative │
                    └──────────────────┘
```

**Parallel lanes:**
- G12 (HUD counter) can start immediately — no dependencies
- G7 (Dispatcher dialogue) can start immediately — no dependencies
- G5 (Debuffs) can start after G1 (needs day advancement to tick durations)
- G3 (Mailbox) needs G4 (hero run data to display)
- G6 (Curfew) needs G1 (sleep mechanic) + G5 (debuff application)
- G11 (Death respawn) needs G5 (debuffs) + G2 (morning routine)

---

## 6. Recommended Build Order

### Sprint 1: The Heartbeat (4h) — BUILDS THE DAY LOOP ✅ COMPLETE
1. **bed-peek.js** — Sleep verb, day advancement, fade to black → dawn ✅
2. **Morning spawn routine** — Wake at home, set DayCycle to DAWN, trigger onDayChange callbacks ✅
3. **HUD day/cycle counter** — "Day 2 (1/3) 21:00" with Hero Day highlight ✅
4. **Wire sleep→Hero Day transition** — BedPeek → HeroRun → MailboxPeek pipeline ✅

### Sprint 2: The Payoff (3h) — DELIVERS FEEDBACK ✅ COMPLETE
5. **mailbox-peek.js** — Read hero-run reports, accumulated report stack, A/D paging ✅
6. **hero-run.js** — 4 hero types, carnage manifest, payout tiers, chain bonus ✅
7. **Payout animation** — Staggered Toast sequence, legendary style at 5+ reports ✅

### Sprint 3: The Stakes (3h) — ADDS CONSEQUENCES ✅ COMPLETE (expanded)
8. **status-effect.js** — Full modular buff/debuff registry (replaces ad-hoc Player.DEBUFFS) ✅
9. **status-effect-hud.js** — Buff/debuff icon rows in debrief feed, flash animations ✅
10. **WELL_RESTED ↔ TIRED daily cycle** — Sun buff (sleep < 23:00), moon debuff (21:00 trigger) ✅
11. **Curfew at 02:00** — Forced home, 25% currency, card confiscation on depth 3+ ✅
12. **Death → home respawn** — Both depths, StatusEffect debuffs, hero rescue narrative ✅
13. **Depth-2 exit guard** — DialogBox confirmation when leaving interior during curfew ✅
14. **Home door rest shortcut** — Rest at front door when TIRED (avoids time-freeze) ✅
15. **BedPeek clock fix** — Unpause for REST, grant WELL_RESTED, clear until_rest effects ✅

### Sprint 4 Light: Day 0 Polish (1h) — FIRST IMPRESSION ✅ COMPLETE
16. **Dispatcher gate → DialogBox** — 3-branch contextual dialogue (where's home / I have key / flavor skip) ✅
17. **Day 0 hero-run guard** — Skip overnight run on day 0 (pre-existing carnage) ✅

### Next: B-phase completion (C5.18–C5.20 in cross-roadmap)
18. **Verify B1-B4** cooperates with day/night cycle (crate/corpse peeks, bonfire rest) ⬜
19. **B5: Shop round-trip** — Buy restock supplies wired to economy ✅ (already implemented: 3-face shop MenuBox + all handlers)
20. **B6: Bag inventory viewer** — Minimal peek showing bag contents ✅ (already implemented: unified inventory face with bag/deck wheels)

---

## 7. What's Surprisingly Solid

Systems that already work well and need no changes for the Stardew loop:

- **DayCycle 5-phase system** — DAWN/MORNING/AFTERNOON/DUSK/NIGHT with correct time advancement on floor transitions
- **Night-lock buildings** — Shops/buildings inaccessible at night with muffled bark atmospherics
- **Atmosphere tinting** — Exterior fog color shifts with time of day
- **Carnage manifests** — Abstract hero destruction correctly generates per hero type
- **Work order system** — Posts on arrive, evaluates on return, readiness tracking
- **Cleaning system** — Blood rendering, progressive tools, readiness contribution
- **Crate system** — Slot fill, seal rewards, corpse stocks, suit-gated reanimate
- **Time-aware barks** — NPC system tries heroday/morning/dusk/night suffixed pools automatically
- **Hero Day economy barks** — Tourism-angle humor, callsign/class-aware backhanded compliments
- **Scripted hero entity** — Floor 2.2.1 Seeker walks away, speeds up on approach, despawns

---

## 8. What Could Go Wrong (Risk Register)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Sleep mechanic is too simple (just fade + increment) | Low | Low | Simple is fine for jam. Add debuff preview, Hero Day warning, etc. post-jam. |
| Mailbox report is text-heavy and boring | Medium | High | Use DOC-7 §14 thumbnail cards. Even a simplified version (emoji + numbers) is engaging. |
| Day loop feels grindy without enough variety | Medium | High | Hero type rotation + escalating readiness targets + NPC barks about player performance create variety. |
| Overnight hero run calculation is complex | Medium | Medium | Start with a simple model: for each baited floor, roll carnage manifest, calculate payout from readiness %. Dungeon thumbnails are post-jam. |
| Player doesn't understand the 3-day cycle | Medium | High | HUD counter is essential (G12). Also: Taskmaster clipboard, morning bark reminders. |
| Accumulated mailbox creates memory/performance issue | Low | Low | Cap at 10 reports (FIFO). Coin animations batch above 200. |
| Dispatcher dialogue tree is too complex for jam scope | Medium | Medium | Start with 2 branches (have key / don't have key). The "I heard it's unlocked" branch is flavor — can be bark-only. |

---

*This document is the gap analysis entry point. When planning a work session, consult §6 (Recommended Build Order) and pick the next sprint. Each sprint is self-contained and delivers a testable milestone.*

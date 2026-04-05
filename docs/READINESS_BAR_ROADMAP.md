# Readiness Bar — UI, Overhealing, Win State & Reporting Roadmap

**Created**: 2026-04-02
**Scope**: Readiness bar visual design (constellation-tracer FX), overhealing score model, bonfire warp threshold, morning/hero-day reporting engine, and revolving mini win-state for jam conflict resolution.
**Audience**: All team members.
**Dependencies**: readiness-calc.js, hud.js, status-bar.js, day-cycle.js, mailbox-peek.js, tiles.js, bonfire-sprites.js, bookshelf-peek.js, victory-screen.js, bonfire warp (§11c of BONFIRE_POLISH_STEPS), constellation-tracer.js (EyesOnly).

---

## 1. Readiness Bar — Visual Design

### 1.1 Where It Lives

The readiness bar is the game's central progress indicator. It renders on the HUD during dungeon floors (depth 3+) as a **horizontal bar** anchored below the debrief feed panel, above the status bar. It is the "kingdom wall" — the single number the player obsesses over (CORE_GAME_LOOP §3.2).

**HUD placement (ASCII):**
```
│ DEBRIEF ┊  3D VIEWPORT                    │
│ FEED    ┊                                  │
│         ┊                                  │
│ ┌─────┐ ┊                                  │
│ │ MOK │ ┊                                  │
│ └─────┘ ┊                                  │
│ HP ████ ┊                                  │
│ EN ██░░ ┊                                  │
│ ◈◈◈░░░ ┊                                  │
│ 💰 47   ┊                                  │
│ ─────── ┊                                  │
│ RDY ██████████████░░░░░░░░  67%  ←── HERE  │
│ ─────── ┊                                  │
```

On exterior floors (depth 1), the bar is **hidden** — no readiness to track topside. On Floor 1.6 (home), it appears only inside the mailbox peek as part of the report card. In the Taskmaster peek (§11.4 of CORE_GAME_LOOP), each floor's readiness is shown individually on the clipboard.

### 1.2 Constellation Line-Fill Physics (from EyesOnly)

The readiness bar borrows the **golden tether** visual from the EyesOnly constellation tracer's line-drawing physics. When readiness changes, the bar doesn't snap — it *traces* forward like a constellation being completed.

**Ported FX from `constellation-tracer.js`:**

| FX Element | Constellation Source | Readiness Bar Adaptation |
|------------|---------------------|--------------------------|
| Golden tether line | `_BASE_TETHER.color: rgba(212,168,67,0.85)` | Bar fill color: warm gold with soft glow |
| Glow halo | `_BASE_TETHER.glow: rgba(212,168,67,0.25)` | Outer edge bloom while filling |
| Snap flash | `_BASE_TETHER.snap: rgba(255,220,100,1.0)` | Bright flash when bar reaches a tier boundary |
| Idle shimmer | Starfield parallax twinkle | Filled portion gently pulses (sin-wave alpha ±5%) |

**Canvas implementation** (drawn on `view-canvas` during HUD pass):

```javascript
// Readiness bar constants
var RDY_BAR_X = 8;          // Left edge (below debrief)
var RDY_BAR_Y;              // Computed: debrief bottom + 8px
var RDY_BAR_W = 120;        // Full width
var RDY_BAR_H = 14;         // Height
var RDY_BAR_RAD = 4;        // Corner radius
var RDY_FILL_COLOR = 'rgba(212,168,67,0.85)';     // Gold tether
var RDY_GLOW_COLOR = 'rgba(212,168,67,0.25)';     // Soft bloom
var RDY_OVERHEAL_COLOR = 'rgba(100,220,180,0.85)'; // Teal for >100%
var RDY_BG_COLOR = 'rgba(20,18,14,0.7)';           // Dark track
```

### 1.3 Animated Behaviors

#### 1.3a Interaction Sweep (During Action)

When the player performs a readiness-affecting action (scrub tile, fill crate slot, rearm trap), the bar plays a **loading-animation sweep** at the leading edge:

- A brighter gold highlight (2px wide) sweeps left-to-right across the *projected new fill width* in 200ms
- The sweep uses the constellation snap color (`rgba(255,220,100,1.0)`)
- The bar doesn't actually fill yet — this is a **preview** of the incoming readiness

This gives the player instant visual feedback that "this action is doing something" before the math resolves.

#### 1.3b Fill Pump (On Activity Complete)

When the player completes an activity (seals a crate, finishes cleaning a tile, rearms a trap), the bar **pumps** to the new value:

- Bar lerps from old fill to new fill over 400ms (ease-out)
- Outer glow expands slightly during fill (scale 1.05×, 200ms)
- Glow contracts back to normal (200ms)
- A notch tone plays at 25%/50%/75% tier crossings (C, E, G — per CORE_GAME_LOOP §6.2)
- At 100%, full fanfare + all sub-score glow (CORE_GAME_LOOP §6.2)

#### 1.3c Rescind Slide (After Pump Settles)

The key visual innovation: **the bar slowly slides back after each pump** to reflect accurate readiness. This happens because individual actions overshoot their contribution momentarily (visual drama), then the weighted score settles.

Implementation: The bar actually fills to `displayValue = actualValue + overshoot`, where `overshoot` decays over 800ms back to 0. The player sees: pump up → hold 200ms → slow slide back.

Example: Player refuels a torch. Torch weight is 20% of score. One torch of three on the floor = 6.7% actual contribution. But the bar pumps to show +12% (visual emphasis), then slides back to the real +6.7% over the next second. Net feeling: the torch refuel felt impactful, but the bar is honest about where you really stand.

**Important**: The rescind never drops below the *previous* actual value. It only rescinds the overshoot. The bar always trends upward when the player is making progress.

#### 1.3d Overhealing Glow (>100%)

When readiness exceeds 100%, the fill color transitions from gold to **teal** (`rgba(100,220,180,0.85)`). The bar visually extends past its normal boundary using a different rendering approach:

- 0–100%: Gold fill within the track
- 100–200%: Teal fill that **overflows** the track, drawing a second smaller bar segment beneath the main bar (4px tall, same width scale)
- The overflow segment pulses more aggressively (sin-wave ±15%) to distinguish it from core readiness
- Text label switches from "67%" to "142% ★" (star indicates overhealing)

---

## 2. Readiness Score — Core vs Extra Credit

### 2.1 Problem

Current `ReadinessCalc` is hard-capped at 1.0. All five sub-scores are weighted to sum to exactly 1.0 (100%). The user's vision: a perfect dungeon should yield **~160–200%** readiness, with the "extra credit" mechanics contributing beyond 100%.

### 2.2 Solution: Two-Tier Score Model

**Tier 1 — Core Readiness (0–100%)**
These are the mechanics we're confident about. They define the minimum bar for a "ready" dungeon. A score of 100% means "this floor is fully prepped for heroes."

| Sub-score | Weight (of 100%) | Source Module | Status |
|-----------|------------------|---------------|--------|
| Crate restocking | 35% | CrateSystem.getReadinessByType().crate | ✅ Built |
| Blood cleaning | 25% | CleaningSystem.getReadiness() | ✅ Built |
| Torch prep | 20% | TorchState.getReadiness() | ✅ Built |
| Trap re-arm | 20% | TrapRearm.getReadiness() | ✅ Built |
| **Total** | **100%** | | |

**Tier 2 — Extra Credit (0–100% bonus, stacks on top)**
These are the mechanics that aren't fully worked out yet, or that represent "above and beyond" completionism. They register as bonus on top of 100%.

| Sub-score | Max Bonus | Source Module | Status |
|-----------|-----------|---------------|--------|
| Corpse processing / reanimate | +30% | CrateSystem.getReadinessByType().corpse | ✅ Built |
| Cobweb network intact | +15% | CobwebSystem.getIntact() | ✅ Built |
| Vermin repopulated | +10% | (planned — DailyVermin) | ❌ Not built |
| Puzzle scrambled | +15% | (planned — PuzzleState) | ❌ Not built |
| Doors relocked | +10% | (planned — DoorState) | ❌ Not built |
| Overclean bonus (>0.9 clean score) | +10% | CleaningSystem.getReadiness() | Can derive |
| Perfect suit-match seals | +10% | CrateSystem (suit bonus) | ❌ Not tracked |
| **Max Total** | **+100%** | | |

**Combined score range: 0–200%** (0.0–2.0 internally).

A realistic "really good" run might hit 130–160%. A perfectionist who does every possible thing on a floor reaches ~180–200%.

### 2.3 ReadinessCalc Refactor

```javascript
// New weight model
var CORE = {
  crate: 0.35,  // restocking
  clean: 0.25,  // blood/grime
  torch: 0.20,  // fuel state
  trap:  0.20   // re-armed
};
// Sum = 1.0 → core score is 0.0–1.0

var EXTRA = {
  corpse:    0.30,  // reanimate
  cobweb:    0.15,  // network intact
  vermin:    0.10,  // repopulated (stub 0 until built)
  puzzle:    0.15,  // scrambled (stub 0 until built)
  doors:     0.10,  // relocked (stub 0 until built)
  overclean: 0.10,  // clean > 0.9
  suitMatch: 0.10   // perfect seals (stub 0 until built)
};
// Sum = 1.0 → extra score is 0.0–1.0

// Total readiness = core + extra
// Range: 0.0 – 2.0 (displayed as 0% – 200%)
```

**Backward compatibility**: `getScore()` returns the full combined value (0.0–2.0). `meetsTarget()` still works — a 60% threshold means 0.6, which is entirely within core range. `getPercent()` returns "142%" etc. New `getCoreScore()` method returns only the 0.0–1.0 core portion for systems that need it (bonfire warp gating, payout tiers).

---

## 3. Bonfire Warp — Readiness Threshold

### 3.1 Current State (§11c of BONFIRE_POLISH_STEPS)

✅ Already implemented: Dungeon hearth (depth 3+) "Warp to Entrance" button is gated on `readiness >= 0.6`. This uses `ReadinessCalc.meetsTarget(floorId, 0.6)`.

### 3.2 Interaction with Overhealing

With the two-tier model, the warp threshold stays at **core readiness ≥ 60%**. The warp system should use `ReadinessCalc.getCoreScore()` (new method), not the combined score. Rationale: the player can't "cheese" the warp threshold by doing only extra-credit work while ignoring crates and torches.

### 3.3 Dragonfire Connection

The bonfire warp is powered by **residual dragon energy** (per biome-plan.html §1 rule box). The player doesn't know this. The threshold is narratively justified as: "the bonfire needs the dungeon to be sufficiently maintained for the dragon energy to stabilize a warp." This sets up the dragonfire_dialogue bonfire bark tutorialization (post-jam) where the bonfire gradually reveals its dragon nature as the player uses it more.

### 3.4 Advance to Next Dungeon

When a player achieves **core readiness ≥ 100%** on a floor AND there are ≥ 2 work days remaining before Hero Day, the bonfire rest face (Face 0) shows an additional option:

```
🐉 REST
  ✓ HP/EN restored
  ✓ Readiness: 104% ★

  [🔼 Warp to Entrance]
  [🔽 Advance to Next Floor]  ← NEW (only when core ≥ 100% + days remaining)
```

"Advance to Next Floor" warps the player to the entrance of the **next dungeon floor in the chain** (e.g., from 1.3.1 → 1.3.2). This floor has its own independent readiness bar starting at whatever state the heroes left it in.

**Guard conditions**:
- `ReadinessCalc.getCoreScore(currentFloorId) >= 1.0`
- `DayCycle.getDaysUntilHeroDay() >= 2`
- Next floor exists in the floor chain (`FloorManager.getNextFloorId()`)

This creates the revolving loop: finish one floor → advance → start the next → repeat until Hero Day.

---

## 4. Morning Report & Hero-Day Mailbox Reporting Engine

### 4.1 Current State

- **MailboxPeek** (`mailbox-peek.js`): ✅ Built. Renders hero-run reports at Floor 1.6 mailbox. Supports multi-report paging, coin collection with toast sequence, card drops.
- **DayCycle**: ✅ Built. Tracks day number, hero day interval (every 3 days), phase system.
- **MonologuePeek**: ✅ Built. Morning recap fires via `HazardSystem.consumeMorningRecap()` on bonfire menu close (§7f of BONFIRE_POLISH_STEPS).

### 4.2 Dependency Chain

```
ReadinessCalc.getScore(floorId)     ← each floor's readiness at hero arrival
       ↓
HeroRunSimulator.simulate(cycle)    ← NEW: deterministic hero behavior per type
       ↓                               (Fighter smashes, Scholar solves, etc.)
       ↓                               Uses readiness + hero type + baited list
       ↓
MailboxPeek.addReport(report)       ← existing: receives hero run results
       ↓
DayCycle → onHeroDayStart           ← trigger: hero day dawn
       ↓                               → HeroRunSimulator.simulate()
       ↓                               → MailboxPeek.addReport() per floor
       ↓
DayCycle → onDayChange              ← trigger: any new day dawn
       ↓                               → MorningReport.generate()
       ↓
MorningReport.generate()            ← NEW: summarizes yesterday's work
       ↓                               → ReadinessCalc snapshots per floor
       ↓                               → StatusBar.pushTooltip() or Toast
       ↓
MailboxPeek (hero day only)         ← existing: shows full hero run report
       ↓                               with floor-by-floor breakdown,
       ↓                               payout tiers, card drops
       ↓
VictoryScreen (end-of-jam trigger)  ← uses accumulated cycle data
```

### 4.3 What Needs Building

| Component | Est. | Status | Notes |
|-----------|------|--------|-------|
| **ReadinessCalc refactor** (core/extra split) | 30m | §2 of this doc | New getCoreScore(), getExtraScore(), updated getScore() |
| **ReadinessCalc snapshot** | 15m | Not started | `snapshotFloor(floorId)` — freeze readiness at hero arrival time |
| **HeroRunSimulator** | 2h | Not started | Deterministic hero behavior per type. Consumes readiness snapshot + floor data. Outputs: smashed crates, triggered traps, killed monsters, payout. Per CORE_GAME_LOOP §4.5 |
| **MorningReport** | 30m | Not started | Dawn tooltip/toast: "Day 2 of 3. Cedar Cellars: 67% ready. Coral Bazaar: 38% — needs work." |
| **MailboxPeek → HeroRunSimulator wiring** | 20m | Not started | On hero day dawn, simulate all baited floors, push reports |
| **Taskmaster → ReadinessCalc wiring** | 20m | Not started | Taskmaster peek shows core readiness per floor, bait toggles |
| **ReadinessBar HUD renderer** | 1.5h | Not started | Canvas bar with constellation FX (§1 of this doc) |
| **Advance to Next Floor** | 30m | Not started | Bonfire Face 0 option (§3.4) |
| **VictoryScreen stats extension** | 20m | Not started | Add readiness stats to victory overlay |

### 4.4 Readiness Bar Reset Behavior

**Per-floor, per-cycle**: Each floor's readiness resets to ~0% after a hero run (heroes trash the place). On work days, readiness only goes up from player actions. On hero day morning, the reporting engine:

1. Snapshots all floor readiness values
2. Runs `HeroRunSimulator` for each baited/qualifying floor
3. Generates payout per floor (using CORE_GAME_LOOP §4.6 tiers)
4. Resets floor readiness to post-hero state (partially trashed based on hero type)
5. Pushes reports to MailboxPeek

The player sees this as: wake up → check mailbox → read results → see new mess in dungeons → start the next cycle.

---

## 5. Revolving Mini Win-State — Jam Conflict Resolution

### 5.1 The Jam Requirement

> "Our game must have some conflict resolution, some win state."

The game's macro win-state is the full dragon conspiracy reveal (post-jam narrative). For the jam, we need a **revolving mini win-state** that reinforces player progress within each 3-day hero cycle.

### 5.2 Design: The Cycle Report Card

Each hero cycle (3 days) ends with a **Cycle Report Card** — a brief evaluation screen that appears when the player collects their mailbox payout on the morning after Hero Day. This IS the win-state moment.

**The conflict**: Heroes are coming whether you're ready or not. Can you prep the dungeons in time?
**The resolution**: The Cycle Report Card tells you how you did. You either met the readiness targets or you didn't. The consequences play out in your payout, your reputation, and the next cycle's difficulty.

**Cycle Report Card structure:**

```
┌───────────────────────────────────────────┐
│  📋 CYCLE 3 — HERO RUN RESULTS            │
│  ─────────────────────────────────────    │
│                                           │
│  ★★★☆☆  RATING: CLEAN RUN                │
│                                           │
│  Coral Cellars    72% ✓  +47 coins        │
│  Coral Bazaar     45% ✗  +0  coins        │
│  Boardwalk Ext.   88% ✓✓ +63 coins (150%) │
│  ─────────────────────────────────────    │
│  TOTAL:          +110 coins               │
│  CHAIN BONUS:    ✗ (Bazaar failed)        │
│  CARD DROP:      ♠ Strike (Common)        │
│  ─────────────────────────────────────    │
│  NEXT TARGET:    70% (Cycle 4)            │
│  HERO TYPE:      Scholar                  │
│  ─────────────────────────────────────    │
│  "Not bad, Gleaner. The Bazaar needs      │
│   work, but the Boardwalk was spotless."  │
│                                           │
│  [F] Continue to next cycle               │
└───────────────────────────────────────────┘
```

### 5.3 Star Rating (Win Tiers)

The star rating IS the win-state. It maps directly to CORE_GAME_LOOP §4.6 payout tiers:

| Stars | Condition | Payout | Tone |
|-------|-----------|--------|------|
| ☆☆☆☆☆ | All floors < 40% or no floors baited | 0 coins | "The heroes found nothing worth entering." |
| ★☆☆☆☆ | Average readiness 40–59% | 50% payout | "A rough run. The Guild is disappointed." |
| ★★☆☆☆ | Average readiness 60–69% | Standard payout | "Adequate. The heroes survived." |
| ★★★☆☆ | Average readiness 70–79% | Standard + 25% bonus | "Clean run. The Guild is pleased." |
| ★★★★☆ | Average readiness 80–89% | Standard + 50% bonus | "Excellent work, Gleaner." |
| ★★★★★ | Average readiness ≥ 90% | Double payout + rare card | "Perfect. The Taskmaster tips their hat." |

### 5.4 Revolving Escalation

Each cycle, the target increases (per CORE_GAME_LOOP §7):

```
Cycle 1: 60% target  →  3 stars = "you did it!"
Cycle 2: 65% target  →  3 stars requires more effort
Cycle 3: 70% target  →  must clean AND restock AND torch
Cycle 4: 75% target  →  new hero types, tighter margins
Cycle 5+: 80%+ target → expert maintenance required
```

The player's win-state is always: "Can I get 3+ stars this cycle?" The pressure ratchets up naturally. The game "ends" (for jam purposes) when the player either:

1. **Completes 3 full hero cycles** with ≥ 3 stars each → Victory Screen
2. **Fails 3 consecutive cycles** with ≤ 1 star → Game Over (gentle — "The Guild has reassigned you")

Both paths lead to the existing VictoryScreen / GameOver screen with cycle stats. This gives a natural 9–15 day game arc (3–5 cycles × 3 days each).

### 5.5 Implementation

| Component | Est. | Depends On |
|-----------|------|------------|
| CycleTracker module (tracks stars per cycle, win/lose conditions) | 45m | DayCycle, ReadinessCalc |
| Cycle Report Card UI (canvas overlay, similar to VictoryScreen) | 1h | CycleTracker, MailboxPeek |
| VictoryScreen extension (3-cycle win stats) | 20m | CycleTracker |
| GameOver "reassignment" variant | 15m | CycleTracker |
| Star rating calculation from readiness snapshots | 15m | ReadinessCalc snapshot |
| Escalating target per cycle | 10m | CycleTracker |

**Total for win-state system: ~2.5h**

---

## 6. Full Dependency Graph

```
constellation-tracer.js (FX reference)
       ↓ (visual porting)
ReadinessBar (HUD renderer)   ←── ReadinessCalc.getScore() + getBreakdown()
       ↓                              ↑
       │                         ReadinessCalc refactor
       │                         (core/extra split, >1.0 support)
       │                              ↑
       │                         CrateSystem, CleaningSystem,
       │                         TorchState, TrapRearm, CobwebSystem
       │
       │        ┌──────────────────────────────┐
       │        │  Bonfire Warp Threshold       │
       │        │  getCoreScore() >= 0.6        │ ← §11c BONFIRE_POLISH (✅ exists)
       │        │  Advance: getCoreScore() >= 1.0│ ← §3.4 this doc (NEW)
       │        └──────────────────────────────┘
       │
       │        ┌──────────────────────────────┐
       │        │  Morning Report               │ ← dawn tooltip/toast (NEW)
       │        │  MorningReport.generate()     │
       │        └───────────┬──────────────────┘
       │                    │
       │        ┌───────────▼──────────────────┐
       │        │  Hero Run Simulator           │ ← deterministic sim (NEW)
       │        │  HeroRunSimulator.simulate()  │
       │        └───────────┬──────────────────┘
       │                    │
       │        ┌───────────▼──────────────────┐
       │        │  MailboxPeek                  │ ← (✅ exists, refactor §14)
       │        │  ├─ Exterior: MAILBOX tile    │ ← bonfire pattern (§14.2)
       │        │  └─ Interior: history peek    │ ← bookshelf pattern (§14.3)
       │        └───────────┬──────────────────┘
       │                    │
       │        ┌───────────▼──────────────────┐
       │        │  Cycle Report Card            │ ← star rating win-state (NEW)
       │        │  CycleTracker + overlay UI    │
       │        └───────────┬──────────────────┘
       │                    │
       │        ┌───────────▼──────────────────┐
       │        │  Victory / Game Over          │ ← (✅ exists, extend with stats)
       │        └──────────────────────────────┘
```

---

## 7. Implementation Priority (Jam-Scope)

### Phase R-1: ReadinessCalc Refactor (30m) ✅
- Split weights into CORE and EXTRA tiers ✅
- `getScore()` returns 0.0–2.0 ✅
- `getCoreScore()` returns 0.0–1.0 ✅
- `getExtraScore()` returns 0.0–1.0 ✅
- Stubs for unbuilt extra-credit systems (return 0) ✅
- Update bonfire warp to use `getCoreScore()` ✅
- Parse-check ✅

### Phase R-2: ReadinessBar HUD Renderer (1.5h) ✅
- Canvas bar in hud.js — full animation state machine
- Gold fill with constellation tether color (`rgba(212,168,67,0.85)`)
- Interaction sweep (200ms bright highlight preview on action) ✅
- Fill pump (400ms ease-out lerp on score change + glow expansion) ✅
- Rescind slide (800ms overshoot decay with 200ms hold) ✅
- Overhealing teal overflow segment with aggressive pulse ✅
- Idle shimmer (sin-wave ±5% alpha on filled portion) ✅
- Percentage text label + star for overhealing ✅
- Tier crossing notch tones (stub audio: readiness-notch / readiness-fanfare) ✅
- Show/hide by floor depth (≥3 only) ✅
- Sweep triggers wired into CleaningSystem + TrapRearm in game.js ✅

### Phase R-3: DungeonSchedule Module (1.5h) ✅
- `dungeon-schedule.js` — per-group hero day state machine ✅
- Staggered hero day calendar (Groups A/B/C) ✅
- Death-shift: `onPlayerDeath(floorId)` pulls that group's hero day to tomorrow ✅
- Combo multiplier tracker (1.1x / 1.2x / 1.3x) ✅
- Heart dungeon exemption (combo-neutral) ✅
- Wire into DayCycle.onDayChange and HazardSystem death handler ✅
- Dispatcher board data API for UI ✅

### Phase R-4: Win-State System (2h) ✅
- Arc-complete check wired into DayCycle.onDayChange callback ✅
- Ending variant logic: good (combo ≥2) / neutral (mixed) / bad (all broken) ✅
- VictoryScreen extended: arc summary table, combo streak, group results, narrative text ✅
- GameOverScreen extended: "Reassigned" variant with arc summary + broken combo ✅
- Arc data injected into SessionStats for end screens ✅
- 2-second delay before end-state (lets final mailbox report land) ✅

### Phase R-5: Reporting Engine (1.5h) ✅
- MorningReport module (dawn tooltip with per-group status) ✅
- HeroRun.executeRun() called per-group by DungeonSchedule ✅
- MailboxPeek receives per-group reports (death-shifted = red border + halved) ✅
- Readiness bar reset after hero run — natural via ReadinessCalc.getScore() polling live state
- MorningReport wired into game.js DayCycle→DungeonSchedule callback chain ✅
- MorningReport.reset() called in _initGameplay for retry dedup ✅

### Phase R-5a: Mailbox Physical Tile & History (2.75h) ← §14 ✅
- `MAILBOX: 37` tile type in tiles.js + exterior placement on Floor 1 ✅
- MailboxPeek refactor: pending/collected split, dynamic position lookup ✅
- Exterior interaction: bonfire-pattern dwell → peek → collect flow ✅
- Interior history: bookshelf-peek paged DialogBox at Floor 1.6 ✅
- Report card renderer (pass/fail/shifted variants with breakdown) ✅
- Delivery notification (📬 emoji swap + Toast) ✅

### Phase R-6: Readiness Completion FX ✅
- HUD tier-4 crossing (score ≥ 1.0) fires "🔥 Dragonfire exit enabled!" Toast ✅
- Celebration FX: 18 coin/sparkle particles erupt + 8 twinkling 4-point stars ✅
- Bar pulses 3× with 12% scale throb during celebration ✅
- Extra credit (score > 1.0): single coin drip per increment ✅
- Warp threshold matched to Toast: 60% → 100% ✅
- Exterior→home warp (bonfire fast travel) disabled pending warp rules review ✅
- Legibility pass: all font minimums raised to 10px across menu faces ✅
- Victory/GameOver screen stats bumped to 14-16px for payoff impact ✅
- i18n string `readiness.exit_enabled` added ✅

### Post-Jam: Floor Progression (formerly R-6)
- Floor 4 door unlock — NOT a bonfire interaction
- Gate: all dungeon bonfires satisfied + NPC dialogue gate + hero encounter
- Bonfires are rest points only; the only valid bonfire warp is dungeon→parent
  (depth 3→2) gated on readiness ≥ threshold
- Warp rules matrix: define which transitions are doors vs. stairs vs. warps

### Post-Jam Polish
- Full constellation line-draw animation (node-by-node tracing)
- Sub-score breakdown hover/click on readiness bar
- Animated star rating reveal on Cycle Report Card
- HeroRunSimulator visual replay (optional: watch heroes trash your floor)
- Taskmaster peek with individual floor readiness bars
- Dispatcher board interactive peek (Floor 2.1 wall chart)
- Vermin, puzzle, door extra-credit subsystem implementations
- Perfect suit-match seal tracking for extra credit
- Multi-cycle support (post-jam: repeating 8-day arcs)

### Post-Jam: Readiness Journal (new feature)
- Click readiness bar → opens journal/map menu face
- Weekly readiness history: per-day-per-floor score array
- Tracks all dungeon floors across the arc in one view
- Needs: new menu face renderer, data model for daily snapshots,
  HUD click event wiring into MenuBox system
- Estimated: 3–4h implementation track

---

## 8. Cross-References

| Section | Links To | Relationship |
|---------|----------|--------------|
| §1 Visual | → EyesOnly constellation-tracer.js | Line-fill FX source |
| §1 Visual | → HUD_ROADMAP §2 Status Bar | Bar placement in HUD layout |
| §2 Score Model | → readiness-calc.js | Refactor target |
| §2 Score Model | → CORE_GAME_LOOP §3.2 | "Visible Economy" spec |
| §2 Score Model | → CORE_GAME_LOOP §16.5 | Restocking value pyramid (extra credit hierarchy) |
| §3 Bonfire Warp | → BONFIRE_POLISH_STEPS §11c | Existing warp gate (getCoreScore replaces getScore) |
| §3.3 Dragonfire | → Biome Plan §1 rule box | Dragon energy bonfire lore |
| §3.4 Advance | → CORE_GAME_LOOP §4.2 | 3-day hero cycle timing |
| §4 Reporting | → mailbox-peek.js | Existing report renderer |
| §4 Reporting | → day-cycle.js | Hero day triggers |
| §4 Reporting | → BONFIRE_POLISH §7f | Morning recap monologue |
| §5 Win-State | → CORE_GAME_LOOP §4.6 | Payout tiers → star mapping |
| §5 Win-State | → CORE_GAME_LOOP §7 | Pressure gradient escalation |
| §5 Win-State | → victory-screen.js | Existing win overlay |
| §6 Dependencies | → All of the above | Full graph |
| §9 Dungeon Schedule | → day-cycle.js | Consumes onDayChange, onHeroDayStart |
| §9 Dungeon Schedule | → hero-run.js | executeRun() called per-group |
| §9 Dungeon Schedule | → hazard-system.js | Death triggers onPlayerDeath() |
| §10 Death-Shift | → CORE_GAME_LOOP §17.2 | Hero rescue mechanic |
| §11 Combo | → Dispatcher Office (Floor 2.1) | Physical wall chart UI |
| §12 Heart Dungeon | → Biome Plan §1 | Dragon conspiracy, employer faction |
| §12 Heart Dungeon | → NPC_FACTION_BOOK_AUDIT §2 | Tide Council = ♥ Hearts |
| §14 Mailbox | → tiles.js, bonfire-sprites.js | New MAILBOX tile + emoji platform |
| §14 Mailbox | → bookshelf-peek.js | History peek pattern reference |
| §14 Mailbox | → mailbox-peek.js | Refactor: pending/collected split |
| §14 Mailbox | → CORE_GAME_LOOP §17.2 | Death penalty → report flavor |

---

## 9. Staggered Dungeon Schedule — Per-Group Hero Days

### 9.1 Design: Why Stagger?

The original design has a single global hero day every 3 days, hitting all
baited dungeons simultaneously. This creates a binary pass/fail moment every
3 days. With staggered per-group hero days, the player juggles **multiple
overlapping deadlines** across the 8-day jam arc. Each dungeon group has its
own hero day, creating a pressure cooker where the player must triage their
time across competing obligations.

### 9.2 Dungeon Groups (Jam Scope)

| Group | ID | Floors | Location | Hero Day | Hero Type |
|-------|----|--------|----------|----------|-----------|
| **A** | `soft_cellar` | 1.3.1 | Under Promenade | Day 2 | Seeker (⚔️) |
| **B** | `heros_wake` | 2.2.1, 2.2.2 | Under Lantern Row | Day 5 | Scholar (📖) |
| **C** | `heart` | 0.N.N | The Approach depths | Day 8 | Crusader (🛡️) |

Group C (Heart) is special — see §12.

### 9.3 The 8-Day Jam Arc

```
Day 0:  TUTORIAL — Player arrives, gets keys, enters first dungeon.
        All three contracts visible on dispatcher board.
        Group A deadline: 2 days away.
        ─────────────────────────────────────────────────────
Day 1:  WORK DAY — Prep Group A (Soft Cellar). Explore Group B.
        Group A deadline: tomorrow.
        ─────────────────────────────────────────────────────
Day 2:  ⚔️ GROUP A HERO DAY — Seeker runs Soft Cellar.
        Player works topside or starts prepping Group B.
        Results arrive in mailbox at dusk.
        ─────────────────────────────────────────────────────
Day 3:  WORK DAY — Group A results in mailbox. Soft Cellar trashed.
        Group B deadline: 2 days away.
        Begin Group B prep (Hero's Wake B1, B2).
        ─────────────────────────────────────────────────────
Day 4:  WORK DAY — Continue Group B prep. Optional: re-clean Group A
        for extra credit (no hero coming, but readiness still tracked).
        Group B deadline: tomorrow.
        ─────────────────────────────────────────────────────
Day 5:  ⚔️ GROUP B HERO DAY — Scholar runs Hero's Wake.
        Player works topside. Results at dusk.
        ─────────────────────────────────────────────────────
Day 6:  WORK DAY — Group B results in mailbox. Hero's Wake trashed.
        Group C (Heart) deadline: 2 days away.
        Final prep window.
        ─────────────────────────────────────────────────────
Day 7:  WORK DAY — Last chance to prep anything.
        Group C deadline: tomorrow.
        Dispatcher board shows full streak status.
        ─────────────────────────────────────────────────────
Day 8:  ⚔️ GROUP C — HEART DUNGEON / JAM END-STATE
        The Crusader enters Floor 0.N.N.
        This is the confrontation. See §12.
```

### 9.4 DungeonContract Data Model

Each group is tracked as a `DungeonContract`:

```javascript
{
  groupId:       'soft_cellar',       // stable identifier
  label:         'Soft Cellar',       // display name
  floorIds:      ['1.3.1'],           // floors in this group
  scheduledDay:  2,                   // original hero day
  actualDay:     2,                   // may shift earlier on death
  heroType:      'Seeker',            // which hero runs this group
  comboEligible: true,                // false for Heart dungeon
  resolved:      false,               // true after hero day fires
  onSchedule:    true,                // false if death-shifted
  result:        null                 // null | { report, stars }
}
```

---

## 10. Death-Shift — Per-Group Hero Day Acceleration

### 10.1 Rule

When the player dies in a dungeon belonging to group X:

1. Group X's `actualDay` shifts to **tomorrow** (`currentDay + 1`)
2. If `actualDay` was already tomorrow or earlier, no further shift
3. All other groups keep their original schedule — unaffected
4. Group X is marked `onSchedule: false` (combo broken for this group)
5. The hero who rescues the player runs Group X's floors at current readiness
6. Payout is **halved** (existing death penalty from CORE_GAME_LOOP §17.2)

### 10.2 Narrative Justification

The hero assigned to that dungeon group responds to the Gleaner's distress.
They enter the dungeon to rescue the Gleaner, and while they're in there,
they run their scheduled route early. The Guild doesn't waste a trip.

*"The Adventurer's Guild dispatched The Seeker to the Soft Cellar after
reports of an unconscious operative. While extracting the Gleaner, The
Seeker cleared the floor. Results have been filed."*

### 10.3 Edge Cases

**Death in a group that already resolved:**
Group A's hero day was Day 2, it's now Day 4, Group A already completed.
Player dies on Floor 1.3.1. No shift — Group A is already `resolved: true`.
Death still applies currency penalty, debuffs, and respawn. But no extra
hero run. The hero already came and went.

**Death in a group not yet on the schedule (far future):**
Player somehow reaches Floor 0.N.N (Heart) on Day 1 and dies there.
Heart dungeon `actualDay` shifts from 8 to 2 (tomorrow). The Crusader
comes early. This is a severe consequence but the player went where they
weren't supposed to.

**Multiple deaths, multiple shifts — convergence:**
Player dies in Group A on Day 0 (shift A: Day 2 → Day 1).
Player dies in Group B on Day 1 (shift B: Day 5 → Day 2).
Both groups now fire on Day 2. Multiple hero runs on the same morning.
Multiple mailbox reports arrive. This is the punishment: you're buried
under simultaneous deadlines you weren't ready for.

The mailbox stacks reports with a page counter (`1 of 3`). The dispatcher
board shows all groups as `⚠ EARLY` with red borders.

*"Rough week, Gleaner? The Guild had to send everyone at once."*

**Death on the same day as a scheduled hero day:**
Player dies on Day 2 in Floor 1.3.1 (Group A's scheduled hero day).
Group A was already going to fire today. The death doesn't shift anything —
`actualDay` is already `currentDay`. The hero run still happens, but the
death report is merged: the hero found the Gleaner during their scheduled
run. Payout is still halved.

**Curfew does NOT shift hero days:**
Per CORE_GAME_LOOP §5.6, curfew failure has no hero cycle effect. Only
death triggers the shift. This preserves the severity gradient.

---

## 11. Combo Multiplier — Cleaning Schedule Streak

### 11.1 The Porta-John Clipboard

The Dispatcher's Office (Floor 2.1) has a **wall-mounted cleaning schedule
tracker** — the dungeon equivalent of the restroom sign-in sheet on the
back of a bathroom door. Each dungeon group has a row. Each column is a
hero day. The chart fills in as hero days resolve.

```
┌──────────────────────────────────────────────────┐
│  📋 DUNGEON MAINTENANCE LOG                       │
│  ══════════════════════════════════════════════   │
│                                                   │
│  SOFT CELLAR (1.3.x)          Day 2              │
│  Target: 60%   Achieved: 72%  ✓ ON TIME          │
│  ─────────────────────────────────────────       │
│  HERO'S WAKE (2.2.x)          Day 5              │
│  Target: 60%   Achieved: ○ PENDING               │
│  ─────────────────────────────────────────       │
│  ♥ HEART (0.N.N)              Day 8              │
│  [Employer-managed — not on your schedule]        │
│  ══════════════════════════════════════════════   │
│                                                   │
│  STREAK: ★ (1 of 2)                              │
│  MULTIPLIER: 1.1×  ← ACTIVE                      │
│  ─────────────────────────────────────────       │
│  Next tier at 2 of 2: 1.2×                        │
│  ─────────────────────────────────────────       │
│  "On schedule so far. Don't blow it."             │
└──────────────────────────────────────────────────┘
```

### 11.2 Combo Rules

The combo counts consecutive **combo-eligible** groups resolved **on
schedule** (not death-shifted) with core readiness **≥ target**:

| Streak | Multiplier | Visual | Audio |
|--------|------------|--------|-------|
| 0 | 1.0× | — | — |
| 1 | 1.1× | ★ on board, gold pip | Soft chime |
| 2 | 1.2× | ★★, board glows amber | Rising two-note |
| 3+ | 1.3× (cap) | ★★★, board pulses gold | Fanfare chord |

**What breaks the combo:**
- A combo-eligible group resolves with core readiness **below target** → streak resets to 0
- A combo-eligible group is **death-shifted** (resolved early) → streak resets to 0

**What does NOT break the combo:**
- Heart dungeon (Group C, `comboEligible: false`) — exempt, invisible to streak
- A group resolving with readiness above target but death-shifted — still breaks (you weren't ready on time)

**Multiplier applies to:**
- Coin payout for the current group's hero run
- Retroactive bonus on previous groups in the same arc? **No.** The multiplier applies only to the group that completes the streak tier. This keeps math simple and the reward forward-looking.

### 11.3 Combo + Payout Example

```
Group A: 72% core (target 60%). On schedule. ★ streak = 1.
  Payout = base × 1.0 × 1.1 = 110% of normal.

Group B: 68% core (target 60%). On schedule. ★★ streak = 2.
  Payout = base × 1.0 × 1.2 = 120% of normal.

Group C: Heart (exempt). Streak preserved at 2.

Total arc: combo ★★ achieved. Jam end-state factors this into victory rating.
```

vs.

```
Group A: 72% core. On schedule. ★ streak = 1.
  Payout = base × 1.0 × 1.1 = 110%.

Group B: Player died on Day 3 in Hero's Wake. Death-shifted to Day 4.
  onSchedule = false. Streak broken → 0.
  Payout = base × 0.5 (death penalty) × 1.0 (no combo) = 50%.

Group C: Heart (exempt). Streak stays at 0.

Total arc: combo broken. Dispatcher board shows broken streak.
```

### 11.4 Dispatcher Board as Juice Surface

The board is a **read-only peek** — the player faces the wall chart in
Floor 2.1 and sees the current state. No interaction needed, just info.

Visual escalation per streak tier:

| Streak | Board Visual |
|--------|-------------|
| 0 | Flat clipboard, dim text, no glow |
| 1 | Gold checkmark on first row, subtle border glow |
| 2 | Both rows gold, clipboard has warm amber edge glow |
| 3 | All rows gold, clipboard pulses, "PERFECT RECORD" stamp |
| Broken | Red X on failed row, broken streak text, clipboard dims |

---

## 12. Heart Dungeon — Floor 0.N.N

### 12.1 The Employer's Dungeon

The Heart dungeon sits beneath Floor 0 (The Approach). It belongs to the
player's employer faction — the 🐉 Tide Council (♥ Hearts). The Tide
Council maintains this dungeon themselves; it is **not on the Gleaner's
cleaning schedule**.

The Heart dungeon does not appear on the dispatcher board as a task.
It does not count toward or against the combo streak. The player can
enter it optionally during work days, but there's no obligation to prep it.

### 12.2 Why It Exists (Narrative)

The Heart dungeon is where the dragon conspiracy lives. The bonfires
throughout the world are powered by residual dragon energy flowing up
from this dungeon. The Tide Council's "maintenance" is actually the
dragon cabal keeping their power infrastructure running. The player,
oblivious to all this, may wander in and notice things are... different.

### 12.3 Day 8 Confrontation (Jam End-State)

On Day 8, the Crusader (🛡️) hero enters Floor 0.N.N. Unlike normal hero
runs which are abstracted (carnage manifest), this one is **live**. The
player is in the dungeon when the hero arrives. This is the jam's climactic
conflict resolution moment.

**Possible end-states based on player's arc:**

| Player State | Confrontation | Ending |
|-------------|---------------|--------|
| Combo ★★+ (both groups on schedule, good readiness) | Hero acknowledges the Gleaner's competence. Brief standoff → mutual respect. | **Good ending**: "The Guild could use someone like you upstairs." |
| Combo broken or mixed results | Hero is dismissive. Runs past the Gleaner. | **Neutral ending**: "Out of my way, janitor." |
| All groups failed / death-shifted | Hero is hostile. The Gleaner is in the way of a rescue operation. | **Bad ending**: "You again? The Guild's filing your termination." |
| Player prepped Floor 0.N.N (optional) | Hero is surprised the dungeon is maintained. Suspicious. | **Secret ending hook**: "Wait... who told you about this place?" |

### 12.4 Heart Dungeon — Implementation Notes

- Floor 0.N.N generation: hand-authored or semi-procedural, unique biome
- The Crusader hero entity spawns as a visible NPC (like the Seeker glimpse
  at Floor 2.2.1) rather than an abstracted carnage manifest
- CinematicCamera preset for the confrontation (similar to `dispatcher_grab`)
- DialogBox branching tree based on `DungeonSchedule.getCombo()` and
  `DungeonSchedule.getArcSummary()`
- VictoryScreen receives the ending variant and displays accordingly

---

## 13. DungeonSchedule Module — Architecture

### 13.1 Module Shape

```
DungeonSchedule (Layer 1 — pure state, no DOM)
  ├── _contracts[]            — DungeonContract per group
  ├── _comboStreak            — consecutive on-schedule completions
  ├── _comboMultiplier        — 1.0 + (streak × 0.1), capped at 1.3
  │
  ├── init(config)            — set up contracts for the jam arc
  ├── onDayChange(day)        — check if any group's hero day arrived
  │   └── _resolveGroup(g)    — snapshot readiness → HeroRun → report
  ├── onPlayerDeath(floorId)  — find group → shift actualDay → mark !onSchedule
  │
  ├── getSchedule()           — full contract list for dispatcher board
  ├── getGroupForFloor(fId)   — which group owns this floor?
  ├── getCombo()              — { streak, multiplier, maxStreak }
  ├── getArcSummary()         — { groups[], combo, totalPayout }
  ├── getDaysUntilHeroDay(groupId) — for bonfire "advance" guard
  │
  └── JAM_CONTRACTS           — frozen default config for 8-day arc
```

### 13.2 Integration Points

| System | Integration | Direction |
|--------|------------|-----------|
| DayCycle | `DayCycle._onDayChange()` calls `DungeonSchedule.onDayChange(day)` | DayCycle → DS |
| HazardSystem | `_onPlayerDeath()` calls `DungeonSchedule.onPlayerDeath(floorId)` | Hazard → DS |
| HeroRun | `DungeonSchedule._resolveGroup()` calls `HeroRun.executeRun()` | DS → HeroRun |
| MailboxPeek | `_resolveGroup()` calls `MailboxPeek.addReport()` | DS → Mailbox |
| ReadinessCalc | `_resolveGroup()` calls `ReadinessCalc.snapshotFloor()` | DS → Readiness |
| Bonfire warp | Guard uses `DS.getDaysUntilHeroDay(groupId)` | Bonfire → DS |
| VictoryScreen | End-state reads `DS.getArcSummary()` | Victory → DS |
| Dispatcher board | Peek reads `DS.getSchedule()` and `DS.getCombo()` | UI → DS |

---

## 14. Mailbox System — Physical Tile, Interaction & History

### 14.1 Design Intent

The mailbox is the player's **report inbox** — a physical world object they
walk past every time they leave (or return to) their house. It replaces the
invisible "reports just appear" pattern with a tangible ritual: step outside,
check the mailbox, read your results. This mirrors real janitor culture
(checking the break-room clipboard, punching a time clock, finding a note
from your supervisor).

Two surfaces:

1. **Exterior Mailbox (Floor 1)** — a dwell-interact tile outside the
   player's front door. This is where new reports are delivered and
   collected. Follows the bonfire interaction pattern (emoji on a platform,
   dwell-detect, interact prompt).

2. **Interior Mailbox History (Floor 1.6)** — a bookshelf-peek interaction
   inside the player's home. All collected reports are filed here for
   review. Follows the bookshelf-peek pattern (dwell → DialogBox → A/D
   paging → Escape close).

### 14.2 Exterior Mailbox — Floor 1 (The Promenade)

#### 14.2.1 Tile Placement (Blockout-Agnostic)

The mailbox tile is placed relative to the **house door**, not at a
hardcoded grid position. The placement algorithm:

```
1. Look up the player's house door on Floor 1
   (currently at (34, 9), west-facing, doorTarget → '1.6')
2. The door approach tile is one step east: (33, 9)
3. Place mailbox one tile north of approach: (33, 8)
   - Fallback: one tile south (33, 10) if north is occupied
   - Fallback: scan adjacent EMPTY tiles in priority order: N, S, E
```

This makes the mailbox **visible from the approach path** — the player
walks toward the door and sees the mailbox beside it.

**New tile type:**

```javascript
MAILBOX: 37   // Exterior mailbox — blocks movement, interactable
```

Added to `tiles.js` T enum. Walkable: **no** (solid like PILLAR). The
player faces the mailbox from one tile away.

#### 14.2.2 Visual Rendering

The mailbox renders as an emoji-on-platform, following the bonfire pattern:

```
Platform:     1×1 tile, raised stone slab texture (same as bonfire base)
Emoji:        📫 (U+1F4EB — closed mailbox with raised flag)
              📬 (U+1F4EC — open with raised flag) when reports pending
              📪 (U+1F4EA — closed, flag down) when empty/collected
```

**Sprite sheet entry** (bonfire-sprites.js pattern):

| Frame | Emoji | Condition | Animation |
|-------|-------|-----------|-----------|
| mailbox_empty | 📪 | No pending reports | Static |
| mailbox_pending | 📬 | ≥1 uncollected report | Flag bob (±2px, 400ms sin) |
| mailbox_open | 📫 | Player has overlay open | Static (frozen during read) |

The flag-bob animation on pending state is the **"you have mail" tell** —
visible from several tiles away on the Promenade, drawing the player toward
the mailbox after a hero day resolves.

#### 14.2.3 Interaction Pattern (Bonfire-Like)

```
Player approaches mailbox tile → faces it from adjacent tile
  │
  ├─ Dwell 300ms → InteractPrompt shows "[F] Check Mailbox"
  │                 (Magic Remote: 56px target, pointer-friendly)
  │
  ├─ [F] pressed → MailboxPeek overlay opens
  │   ├─ Shows newest report (full DungeonSchedule report card)
  │   ├─ A/D to page between reports (if multiple pending)
  │   ├─ Footer: "1 of 3  |  [F] Collect All  |  [Esc] Close"
  │   ├─ [F] collects all → reports move to history, mailbox → 📪
  │   └─ [Esc] closes without collecting (reports stay pending)
  │
  └─ Player looks away → 200ms debounce → prompt hides
```

**Key difference from current mailbox-peek.js:** collecting does NOT
destroy reports. Reports are moved from `_pendingReports[]` to
`_collectedReports[]` (history). The current implementation clears them
entirely — this is the bug we fix.

#### 14.2.4 Report Delivery Timing

Reports arrive in the mailbox at the **end of the hero day** (after
DungeonSchedule._resolveGroup fires). The mailbox emoji switches from 📪
to 📬 with a brief flash (200ms white→gold fade). If the player is on
Floor 1 when a report arrives, a Toast fires:

```
📬 New report in your mailbox!
```

If the player is underground, the mailbox will be in 📬 state when they
return topside. No notification until they see the tile.

### 14.3 Interior Mailbox History — Floor 1.6 (Gleaner's Home)

#### 14.3.1 History Tile Placement

Inside the player's home, a **MAILBOX_HISTORY** interaction point is added.
This is NOT a new tile type — it reuses the existing PILLAR tile with a
floor-data override that marks it as a mailbox history point (same pattern
as bookshelf assignments via `floorData.books[]`).

```javascript
// In floor-data for Floor 1.6:
mailboxHistory: { x: 19, y: 6 }   // Position of history interaction
// (Currently the PILLAR tile — reused as a wall-mounted letter rack)
```

This position is blockout-agnostic in the same way bookshelves are: the
floor-data declares where the history lives, the system checks for it.

#### 14.3.2 Visual

The interior mailbox history renders as a wall-mounted letter rack:

```
📋 (U+1F4CB) — clipboard with papers
```

Displayed on the PILLAR tile face using the same emoji-on-wall technique
as bookshelves. The emoji is static — no animation needed (history is
always available, there's no "pending" state indoors).

#### 14.3.3 Interaction Pattern (Bookshelf-Peek)

```
Player approaches history tile → faces it from adjacent tile
  │
  ├─ Dwell 400ms → DialogBox opens (bookshelf-peek pattern)
  │   ├─ Title: "📋 Mailbox History"
  │   ├─ Shows most recent collected report
  │   ├─ A/D to page through all collected reports (newest first)
  │   ├─ Each page: full report card (group, readiness %, hero type,
  │   │             payout, on-schedule status, combo state)
  │   ├─ Footer: "Report 1 of 5  |  [A] ← [D] →  |  [Esc] Close"
  │   └─ [Esc] closes
  │
  └─ Player looks away → 200ms debounce → dialog hides
```

**No collect action** — history is read-only. The player can revisit any
report at any time. Reports are stored newest-first for easy access to
the most recent results.

#### 14.3.4 Report Card Format (Per Page)

```
┌──────────────────────────────────────────┐
│  ⚔️ SOFT CELLAR — Day 2 Report            │
│  ════════════════════════════════════     │
│                                           │
│  Hero: The Seeker                         │
│  Schedule: ✓ ON TIME (Day 2 of 2)        │
│  ─────────────────────────────────       │
│  Core Readiness: 72%  (target: 60%)      │
│  ├─ Crates:   ████████░░  80%            │
│  ├─ Clean:    ██████░░░░  60%            │
│  ├─ Torches:  ████████░░  80%            │
│  └─ Traps:    ██████░░░░  65%            │
│  ─────────────────────────────────       │
│  Status: ★ PASS                           │
│  Payout: 47 coin × 1.1 (combo ★)         │
│  Combo: ★ (1 of 2)                        │
│  ─────────────────────────────────       │
│  "Clean work, Gleaner. The Seeker had     │
│   a smooth run. Keep it up."              │
└──────────────────────────────────────────┘
```

Death-shifted reports get a red border and modified layout:

```
┌──── ⚠ EARLY DISPATCH ─────────────────────┐
│  ⚔️ SOFT CELLAR — Day 1 Report (shifted)   │
│  ════════════════════════════════════      │
│                                            │
│  Hero: The Seeker                          │
│  Schedule: ⚠ EARLY (Day 1 of 2)           │
│  ─────────────────────────────────        │
│  Core Readiness: 38%  (target: 60%)       │
│  [... breakdown ...]                       │
│  ─────────────────────────────────        │
│  Status: ✗ FAIL (below target + shifted)   │
│  Payout: 23 coin × 0.5 (death penalty)    │
│  Combo: BROKEN (streak reset)              │
│  ─────────────────────────────────        │
│  "The Seeker had to pull you out.          │
│   Not their best work — or yours."         │
└────────────────────────────────────────────┘
```

### 14.4 Data Model Changes

#### 14.4.1 MailboxPeek Module Refactor

Current `mailbox-peek.js` has a flat `_reports[]` array that is **cleared
on collect**. The refactored module splits into two arrays:

```javascript
var _pending   = [];    // Reports delivered but not yet collected
var _collected = [];    // All collected reports (history, newest-first)
var _maxHistory = 20;   // Cap history at 20 reports (oldest pruned)
```

**API changes:**

| Current | Refactored | Notes |
|---------|-----------|-------|
| `addReport(report)` | `addReport(report)` | Pushes to `_pending[]` (unchanged) |
| `_handleInteract()` → clears all | `collectAll()` | Moves `_pending[]` to front of `_collected[]` |
| — | `getHistory()` | Returns `_collected[]` (for history peek) |
| — | `getPendingCount()` | Returns `_pending.length` (for emoji state) |
| — | `hasPending()` | Boolean shortcut |

#### 14.4.2 Report Object Shape

Each report object (emitted by DungeonSchedule._resolveGroup) already has:

```javascript
{
  groupId:      'soft_cellar',
  label:        'Soft Cellar',
  heroType:     'Seeker',
  day:          2,
  scheduledDay: 2,
  onSchedule:   true,
  readiness:    0.72,
  target:       0.6,
  breakdown:    { crate: 0.80, clean: 0.60, torch: 0.80, trap: 0.65 },
  passed:       true,
  payout:       47,
  comboStreak:  1,
  comboMult:    1.1,
  flavor:       'Clean work, Gleaner. The Seeker had a smooth run.'
}
```

No structural changes needed to the report object. The only change is
that MailboxPeek preserves them instead of discarding on collect.

### 14.5 MAILBOX_POS Fix

Current `mailbox-peek.js` has a stale hardcoded position:

```javascript
var MAILBOX_POS = { x: 2, y: 5 };   // WRONG — doesn't match Floor 1.6
```

This must be updated to match the actual history tile position defined in
floor-data. The fix is to **read from floor-data** rather than hardcode:

```javascript
// Replace hardcoded MAILBOX_POS with dynamic lookup:
function _getMailboxPos(floorId) {
  var fd = FloorManager.getFloorData(floorId);
  if (fd && fd.mailboxHistory) return fd.mailboxHistory;
  // Legacy fallback for floors without mailboxHistory defined:
  return { x: 19, y: 6 };
}
```

The exterior mailbox uses a similar pattern — `_getExteriorMailboxPos()`
reads from floor-data or falls back to the computed house-door-adjacent
position.

### 14.6 Integration Points

| System | Integration | Direction |
|--------|------------|-----------|
| tiles.js | New `MAILBOX: 37` tile type | Definition |
| floor-manager.js | Floor 1 grid gets MAILBOX tile at computed pos | Floor data → Grid |
| floor-data (1.6) | `mailboxHistory: {x, y}` field | Floor data → MailboxPeek |
| interact-prompt.js | MAILBOX tile triggers "[F] Check Mailbox" | Prompt → Player |
| mailbox-peek.js | Refactored: pending/collected split, history API | Core module |
| DungeonSchedule | `_resolveGroup()` calls `MailboxPeek.addReport()` | DS → Mailbox (existing) |
| bonfire-sprites.js | Mailbox sprite frames (empty/pending/open) | Rendering |
| game.js | MailboxPeek.init() already wired | Init (existing) |
| BookshelfPeek | Pattern reference only — no code dependency | Design reference |

### 14.7 Implementation Plan

| Step | Component | Est. | Depends On |
|------|-----------|------|------------|
| M-1 | Add `MAILBOX: 37` to tiles.js, update walkability | 5m | — |
| M-2 | Refactor mailbox-peek.js: pending/collected split, history API, dynamic pos | 30m | M-1 |
| M-3 | Place MAILBOX tile on Floor 1 exterior (house-door-adjacent) | 15m | M-1 |
| M-4 | Mailbox sprite frames (emoji states: empty/pending/open, flag-bob anim) | 20m | M-1 |
| M-5 | Wire InteractPrompt for MAILBOX tile type | 10m | M-1, M-3 |
| M-6 | Exterior mailbox interaction (dwell → peek → collect flow) | 20m | M-2, M-5 |
| M-7 | Interior history peek at Floor 1.6 (bookshelf pattern, paged DialogBox) | 25m | M-2 |
| M-8 | Report card renderer (formatted report display, pass/fail/shifted variants) | 25m | M-2 |
| M-9 | Toast notification on report delivery (📬 emoji swap + flash) | 10m | M-2, M-4 |
| M-10 | Parse-check + test harness | 15m | M-1–M-9 |

**Total: ~2.75h**

### 14.8 Phase Insertion — Updated §7 Priority

Insert as **Phase R-5a** (between R-5 Reporting Engine and R-6 Advance):

```
Phase R-5a: Mailbox Physical Tile & History (2.75h)
  - MAILBOX tile type + exterior placement (M-1, M-3, M-4, M-5)
  - MailboxPeek refactor: pending/collected, dynamic pos (M-2)
  - Exterior interaction flow (M-6)
  - Interior history peek (M-7)
  - Report card renderer (M-8)
  - Delivery notification (M-9)
```

R-5 (Reporting Engine) supplies the reports. R-5a gives them a physical
home. R-6 (Advance Floor) depends on the mailbox being functional for
the "check results before advancing" guard.

### 14.9 Cross-References

| Section | Links To | Relationship |
|---------|----------|--------------|
| §14.2 Exterior | → tiles.js | New MAILBOX tile type |
| §14.2 Exterior | → bonfire-sprites.js | Emoji platform rendering pattern |
| §14.2.3 Interaction | → interact-prompt.js | Dwell-detect + prompt display |
| §14.3 History | → bookshelf-peek.js | A/D paging pattern reference |
| §14.3 History | → DialogBox | Overlay rendering |
| §14.4 Data | → mailbox-peek.js | Refactor target |
| §14.4 Data | → DungeonSchedule §13 | Report source |
| §14.5 Fix | → mailbox-peek.js MAILBOX_POS | Stale position bug |
| §14.7 Plan | → §7 Phase R-5a | Priority insertion |
| §14 Mailbox | → CORE_GAME_LOOP §17.2 | Death penalty → report flavor text |

---

## 15. Readiness Bar — Three-Bar Debrief Integration (post-jam target)

### 15.1 Intent

The single-floor canvas-rendered readiness bar is an interim placement.
The target UX groups **all active dungeon floors' readiness bars together**
inside the DebriefFeed left-column panel, with the **relevant bar
highlighted** according to scheduling context (player location, hero
location, hero day). The player should be able to glance at the debrief
feed and immediately see all three dungeon chains' prep state at once —
not rely on navigating between floors to poll each score.

### 15.2 Why Now Is Too Early

Building this before the core loop is finished would couple readiness UI
to DungeonSchedule hero tracking before either subsystem is stable. The
interim top-left canvas placement (§1.1 footnote) solves the immediate
minimap-collision bug, preserves all existing FX juice (pump/rescind/
sweep/celebration), and does not create throwaway work — the canvas FX
stack needs to be ported to DOM regardless when this slice lands.

### 15.3 Scope

Three horizontal bars stacked inside the DebriefFeed panel, one per
dungeon chain (currently 1.3, 1.4, 1.5 — expandable). Each bar:

- Shows that floor's core readiness as a DOM-backed `<div>` fill
- Shows the floor label and % next to the fill
- Has three visual states: **dim** (idle, no attention needed),
  **active** (the floor the player is currently on), **urgent** (hero
  day or hero currently running this chain)
- Plays a muted version of the existing pump/rescind/sweep FX via CSS
  transitions and keyframes (no canvas needed)
- The overhealing (teal >100%) segment extends past the track the same
  way §1.3d specifies

### 15.4 Highlight Rule

Only one bar is "urgent" at a time. Selection priority:

1. If a hero is currently running dungeon chain X → X is **urgent**
   (red/gold pulse, mirrors hero-progress in real time)
2. Else if today is the hero day for chain X → X is **urgent** (steady
   gold glow, player should focus prep here)
3. Else the bar for the player's **current floor** is **active**
   (no-op if none, e.g. player is on home floor)
4. All other bars are **dim**

Hero location and hero day come from `DungeonSchedule` — no new state
authority. DebriefFeed subscribes to DungeonSchedule tick events and
recomputes highlight state each frame it renders.

### 15.5 Tasks (not yet scheduled)

| Task | Est | Depends On | Notes |
|------|-----|------------|-------|
| Port canvas FX stack (pump, rescind, sweep, celeb coins, tier glow) to CSS | 2h | §1.3 preserved semantics | One keyframe per FX, driven by class toggles from JS |
| `ReadinessBar` DOM component (one instance per chain) | 1h | FX port | Accepts floorId + highlight state |
| DebriefFeed slot for three bars | 30m | DOM component | Added below pip-rows, above overhealing spillover area |
| DungeonSchedule → DebriefFeed highlight wiring | 45m | DungeonSchedule tick stability | Subscribe; no new state |
| Remove canvas `renderReadinessBar` + delete FX state from `hud.js` | 30m | All above | Clean up vestigial canvas path |
| Taskmaster peek reconciliation (shows per-floor readiness on clipboard) | 30m | §11.4 CORE_GAME_LOOP | Make sure numbers match |

**Total**: ~5h. Not in any current sprint — flagged by user 2026-04-05 as
"getting ahead of schedule". Revisit when the core loop (cleaning /
restocking / hero-day rotation) is stable and hero-location tracking in
DungeonSchedule has landed its final shape.

### 15.6 Interim State (shipping now)

- Canvas bar moved from top-right to top-left of viewport canvas
- No more minimap-frame occlusion
- All FX preserved
- Single bar, current floor only (no multi-floor grouping yet)
- Still gated on `depth >= 3` — only dungeon floors render the bar

# Playtest & Blockout Procedure — Pre-Submission Sprint

> **Created:** 2026-04-02 | **Target:** Playable build by April 5 (jam deadline)
> **Purpose:** Regimented blockout → playtest → debug → fix cycle. Single source of truth for what to build, how to test it, and how to report bugs.
> **Audience:** Internal team + contracted Fiverr playtesters pulling repo April 3+

---

## Table of Contents

1. [Jam-Scope Audit Summary](#1-jam-scope-audit-summary)
2. [Blockout Execution Order](#2-blockout-execution-order)
3. [Playtest Procedure (Debug Cycle)](#3-playtest-procedure-debug-cycle)
4. [Playtester's Guide (Contractor Edition)](#4-playtesters-guide-contractor-edition)
   - [4.4 GIF Capture & Console Dump (F8 / F9)](#44-gif-capture--console-dump-f8--f9)
5. [Bug Triage Template](#5-bug-triage-template)
6. [Known Issues vs. Stale Feedback](#6-known-issues-vs-stale-feedback)

---

## 1. Jam-Scope Audit Summary

### 1.1 System Health (as of April 2)

| Category | Result |
|----------|--------|
| Engine files on disk | 130 `.js` in `engine/` |
| Script tags in `index.html` | 125 (all load, no orphans) |
| Deprecated / unloaded files | 5 `floor-data-*.js` (replaced by `floor-blockout-*.js`) |
| Redundant / competing systems | **None found** |
| TODO/FIXME blocking jam work | **None** (4 post-jam stubs only) |
| `index.html` structural integrity | ✅ Fixed — was truncated at `<script src="eng`, now complete with game.js + data layer + closing tags |

### 1.2 System Separation (No Competing Modules)

| Concern | System A | System B | Verdict |
|---------|----------|----------|---------|
| "Both clean things" | CleaningSystem (blood splatter) | CobwebSystem (corridor webs) | **Complementary** — different tile types, different readiness channels |
| "Both track readiness" | ReadinessCalc (aggregate 0.0–2.0 score) | WorkOrderSystem (evaluate contracts, award coins) | **Producer → Consumer** — ReadinessCalc feeds WorkOrderSystem |
| "Both show reports" | MorningReport (dawn Toast) | MailboxPeek (history overlay) | **Different modality** — Toast is push notification, mailbox is pull interaction |
| "Both manage heroes" | HeroRun (stateless sim) | HeroSystem (applies grid damage) | **Sim → Applicator** — HeroRun generates results, HeroSystem writes them to floor |
| "Crate vs restocking" | CrateSystem (unified slots) | — | **Single system** — no separate restocking module |

### 1.3 Unfinished Post-Jam TODOs (Non-blocking)

| File | Line | TODO | Impact |
|------|------|------|--------|
| combat-bridge.js | 494 | Loot scatter tiles after combat | Loot works via world-items, scatter is cosmetic |
| dialog-box.js | 601 | Hit-test individual dialog buttons | Buttons work via keyboard; click hit-test is polish |
| game.js | 1602 | Convert Dispatcher to NpcSystem definition | Works as hardcoded NPC; refactor is cleanup |
| hazard-system.js | 284 | FloorManager.scatterLoot for env kills | Hazards damage player; loot from env kills is edge case |

### 1.4 Critical Fix Applied This Session

**index.html was truncated.** The file ended mid-tag (`<script src="eng`) — missing game.js, gif-recorder.js, data layer scripts, and `</body></html>`. This has been in the repo since commit `71367a8`. The truncation means **any playtester who pulled today's repo has a non-loading game.** Fixed now. This is the single most likely source of stale feedback reporting "blank screen" or "nothing loads."

---

## 2. Blockout Execution Order

### 2.1 Philosophy

Blockouts proceed **outside-in**: exteriors establish the world's spatial vocabulary (scale, density, texture palette, sightlines), interiors inherit that vocabulary at intimate scale (lighting, furniture, contents), dungeons stress-test it under gameplay pressure (pathing, cobwebs, contracts).

Pressure washing runs as a **parallel track** once interiors are stable — it needs walkable interiors with grime grids but doesn't block dungeon work.

### 2.2 Pass Schedule

```
PASS 1: Floor N (Exteriors)                    ← establishes style
  │  Floor 0 — The Approach (20×16 hand-authored)
  │  Floor 1 — The Promenade (40×30 hand-authored)
  │  Floor 2 — Lantern Row (32×24 proc-gen via SpatialContract)
  │  Floor 3 — Frontier Gate (proc-gen, future — verify generates)
  │
  │  CHECKLIST PER FLOOR:
  │    □ Walkable end-to-end (no stuck tiles, no invisible walls)
  │    □ All DOORs lead to correct targets (doorTargets map)
  │    □ Building facades visually read as buildings (wall texture)
  │    □ Texture palette consistent (ROAD/PATH/GRASS/FENCE tiles placed)
  │    □ Bonfire visible and interactable
  │    □ NPCs spawn and bark (NpcSystem populated)
  │    □ Skybox and fog match biome (FADE fog, SKY ceiling)
  │    □ Minimap renders correctly (rooms, doors, walls)
  │    □ No console errors on floor load
  │
PASS 2: Floor N.N (Interiors — template + verify)
  │  Floor 1.1 — Coral Bazaar (16×12 hand-authored, biome: bazaar)
  │  Floor 1.2 — Driftwood Inn (proc-gen, biome: inn)
  │  Floor 1.3 — Cellar Entrance (proc-gen, biome: cellar_entry)
  │  Floor 1.6 — Gleaner's Home (24×20 hand-authored, biome: home)
  │  Floor 2.1 — Dispatcher's Office (proc-gen, biome: guild)
  │  Floor 2.2 — Watchman's Post (proc-gen, biome: watchpost)
  │
  │  CHECKLIST PER FLOOR:
  │    □ Time freezes on entry (DayCycle.setPaused — HUD clock stops)
  │    □ Lighting feels warm/enclosed (CLAMP fog, SOLID ceiling)
  │    □ Bookshelves placed and readable (BookshelfPeek opens, pages turn)
  │    □ Bar counters work (3-tap drink cycle, Toast shows effect)
  │    □ Beds work (BedPeek opens, day advance functions)
  │    □ Mailbox works (MailboxPeek shows reports, emoji state correct)
  │    □ DOOR_EXIT returns to correct parent floor
  │    □ STAIRS_DN leads to correct dungeon (if applicable)
  │    □ Furniture tiles have correct wall heights (half-wall for counter/fence)
  │    □ Auto-placed bookshelves present with biome-correct books
  │    □ No console errors on floor load or interaction
  │
  │  ┌──────────────────────────────────────────────────────┐
  │  │  PARALLEL TRACK: Pressure Washing Roadmap            │
  │  │  (begins once Floor 1.2/1.6 interiors confirmed)     │
  │  │  See: docs/PRESSURE_WASHING_ROADMAP.md               │
  │  │  Phases: Hose pickup → grime grid → spray → rollup   │
  │  └──────────────────────────────────────────────────────┘
  │
PASS 3: Floor N.N.N (Dungeons — pathing strategy + contracts)
  │  Floor 1.3.1 — Soft Cellar (proc-gen, biome: cellar, depth 3)
  │  Floor 2.2.1 — Hero's Wake B1 (proc-gen, biome: catacomb, depth 3)
  │  Floor 2.2.2 — Hero's Wake B2 (proc-gen, biome: catacomb, depth 3)
  │
  │  CHECKLIST PER FLOOR:
  │    □ Generates without error (GridGen + SpatialContract)
  │    □ Rooms are connected (no isolated rooms — BSP pathfind check)
  │    □ STAIRS_UP exits to correct parent floor
  │    □ STAIRS_DN exits to correct child floor (if applicable)
  │    □ Enemies spawn at correct density for depth
  │    □ Enemy AI pathfinds to player (no stuck enemies)
  │    □ Cobwebs generate in corridors (CobwebSystem populates)
  │    □ Breakables spawn and are destructible
  │    □ Crates spawn and CratePeek opens (slot fill works)
  │    □ Torch tiles functional (TorchPeek lights/extinguishes)
  │    □ Cleaning system active (blood splatter scrub → coins)
  │    □ Readiness bar updates as player cleans/restocks
  │    □ Combat can be initiated and resolved
  │    □ Corpses lootable after combat (CorpsePeek → SalvageOverlay)
  │    □ FOG.DARKNESS + CEILING.VOID renders correctly
  │    □ No console errors during full dungeon run
  │
PASS 4: Playtest Full Loop (end-to-end)
  │  See §3 below for the debug cycle procedure.
  │
PASS 4+: Circle back to Floor N.N.N
     Post-playtest refinements:
       □ Pathing strategy tuning (corridor width, room connectivity)
       □ Cobweb contract density (per-biome web count targets)
       □ Enemy density curve (entry halls sparse → deep floors dense)
       □ Breakable / crate distribution balance
       □ Readiness scoring feels fair (not too easy, not grindy)
```

### 2.3 Texture Palette Reference (Established by Pass 1)

| Biome | Floor Texture | Wall Texture | Accent | Fog Color |
|-------|--------------|-------------|--------|-----------|
| exterior / approach | GRASS + PATH | stone_rough | TREE, SHRUB | blue-grey |
| promenade | ROAD + PATH | plank_warm, stone_brick | FENCE, PILLAR, BONFIRE | amber-gold |
| lantern | ROAD + PATH | stone_dark, plank_dark | PILLAR (lanterns), SHRUB | warm orange |
| bazaar | floor_tile | plank_warm, stone_brick | BOOKSHELF, BAR_COUNTER, BONFIRE | amber |
| inn | floor_boardwalk | plank_warm | BED, BAR_COUNTER, HEARTH, TABLE | deep amber |
| home | floor_boardwalk | plank_warm | BED, TABLE, HEARTH, CHEST, BOOKSHELF | golden |
| cellar_entry | floor_stone | stone_rough | STAIRS_DN, TORCH | dim amber |
| guild / office | floor_tile | plank_dark | BOOKSHELF, TABLE, PILLAR | warm grey |
| watchpost | floor_stone | stone_brick | BOOKSHELF, STAIRS_DN | cool grey |
| cellar (dungeon) | floor_stone | stone_rough | TORCH, COBWEB, BREAKABLE | near-black |
| catacomb (dungeon) | floor_stone | stone_dark | TORCH, COBWEB, CORPSE | pitch-black |

---

## 3. Playtest Procedure (Debug Cycle)

### 3.1 The Loop

```
┌─────────────────────────────────────────────┐
│  1. SERVE — start local HTTP server         │
│  2. PLAY  — walk the checklist scenario     │
│  3. LOG   — capture console + screenshot    │
│  4. FILE  — triage into bug template (§5)   │
│  5. FIX   — address P0/P1 immediately       │
│  6. HARD REFRESH — clear cache, repeat      │
└─────────────────────────────────────────────┘
```

### 3.2 Serve

```bash
# From project root:
cd Games/DCgamejam2026
python3 -m http.server 8080
# OR
npx serve -p 8080
```

Open `http://localhost:8080` in Chrome/Edge. Open DevTools (`F12`) → Console tab. Keep console open during entire session.

### 3.3 Playtest Scenarios (in order)

Each scenario has a **pass condition** and a **checklist**. Run them in order — each builds on the prior.

#### Scenario A: Cold Boot → Title Screen
1. Hard refresh (`Ctrl+Shift+R`)
2. Console should show no red errors
3. Title screen renders (splash → title with callsign input)
4. **Pass:** Title screen visible, no JS errors, music plays (if wired)

#### Scenario B: Character Creation → Floor 0
1. Enter callsign, select class
2. IntroWalk auto-walk fires on Floor 0
3. **Pass:** Auto-walk completes, player arrives at Floor 0 DOOR, NPCs bark

#### Scenario C: Floor 0 → Floor 1 (The Promenade)
1. Walk through DOOR to Floor 1
2. Verify floor transition animation plays
3. Explore: find all 4 building doors (Bazaar, Inn, Cellar, Home) + south gate
4. Check: bonfire at (19,13) is visible and interactable
5. Check: MAILBOX at (33,8) shows correct emoji state
6. **Pass:** All doors reachable, bonfire works, no stuck tiles, minimap correct

#### Scenario D: Enter Each Interior (Floors 1.1, 1.2, 1.3, 1.6)
1. Enter each building via DOOR
2. Verify: time freezes (HUD clock stops)
3. Verify: bookshelves readable, bar counters drinkable, bed rest works
4. Exit each via DOOR_EXIT → confirm return to Floor 1
5. Floor 1.6 special: find chest (keys), find mailbox history, find hearth
6. **Pass:** All 4 interiors load, contents work, exits return correctly

#### Scenario E: Gate → Floor 2 → Interiors (2.1, 2.2)
1. Walk to south gate (20,26) on Floor 1
2. Transition to Floor 2 (Lantern Row)
3. Enter Dispatcher's Office (2.1) and Watchman's Post (2.2)
4. Floor 2.2: find STAIRS_DN to dungeon
5. **Pass:** Floor 2 generates, interiors accessible, stairs lead to dungeon

#### Scenario F: Dungeon Run (Floor 2.2.1)
1. Descend stairs from Floor 2.2
2. Explore dungeon: enemies visible, cobwebs present, torches lit
3. Attempt combat: initiate fight with an enemy
4. Test: cleaning (scrub blood), restocking (fill crate), looting (corpse)
5. Check: readiness bar updates in HUD
6. Retreat via STAIRS_UP → confirm return to Floor 2.2
7. **Pass:** Full dungeon loop without crash, readiness tracks, combat resolves

#### Scenario G: Day Cycle + Readiness Completion
1. Rest at bonfire or bed to advance day
2. Check: morning report Toast fires at dawn
3. Check: mailbox receives hero run report
4. Play until readiness reaches 100%
5. Check: celebration FX (coin rain, star twinkle, bar pulse)
6. Check: "Dragonfire exit enabled" Toast appears
7. Check: bonfire warp to parent floor becomes available
8. **Pass:** Full day cycle → readiness → celebration → warp chain

#### Scenario H: Death + Game Over
1. Intentionally die to an enemy
2. Check: death animation, game over screen
3. Check: game over screen legible (14px+ fonts, column spacing)
4. Restart → verify state resets correctly
5. **Pass:** Clean death → game over → restart cycle

#### Scenario I: Victory Condition
1. Achieve readiness completion on a dungeon floor
2. Check: victory screen renders with correct stats
3. Check: victory screen legible (16px fonts, proper spacing)
4. **Pass:** Victory screen displays, stats accurate

### 3.4 Console Error Severity

| Severity | Console Pattern | Action |
|----------|----------------|--------|
| **P0 (Blocker)** | Red `Uncaught TypeError`, `ReferenceError`, blank screen | Stop playtest. Fix immediately. |
| **P1 (Major)** | Red error but game continues, broken interaction | File bug. Fix before next playtest round. |
| **P2 (Minor)** | Yellow `Warning`, cosmetic glitch, timing issue | File bug. Fix when P0/P1 clear. |
| **P3 (Polish)** | No error but "feels wrong" — animation, pacing, balance | Note in feedback. Post-jam unless trivial. |

---

## 4. Playtester's Guide (Contractor Edition)

> **For: Fiverr contracted playtesters pulling the repo**
> **Skill level assumed: Dev-literate (can use git, devtools, local server)**

### 4.1 Setup

```bash
# 1. Clone / pull the repo
git clone <repo-url>
cd LG\ Apps/Games/DCgamejam2026

# 2. Start a local server (pick one)
python3 -m http.server 8080
# or: npx serve -p 8080
# or: php -S localhost:8080

# 3. Open in Chrome or Edge
#    http://localhost:8080

# 4. Open DevTools (F12) → Console tab
#    KEEP THIS OPEN the entire session
```

> **⚠ If you pulled the repo before April 3:** Your `index.html` is truncated and the game will not load (blank screen). Run `git pull` to get the fix.

### 4.2 What to Test

Run the scenarios in §3.3 in order (A → I). For each scenario, note:

1. **Did it pass?** (yes/no)
2. **Console errors?** (copy-paste any red/yellow messages)
3. **Visual bugs?** (screenshot if possible)
4. **Feel issues?** (anything that felt wrong, slow, confusing, ugly)

### 4.3 How to Report

Create one file per session in: `docs/FIX_AND_BUGS/PLAYTEST_FEEDBACK/`

**Filename format:** `PT-YYYY-MM-DD-<yourname>.md`

**Use this template:**

```markdown
# Playtest Report — [Date] — [Your Name]

**Build:** `git log --oneline -1` output
**Browser:** Chrome XX / Edge XX / Firefox XX
**OS:** Windows / Mac / Linux
**Session duration:** ~XX minutes

## Scenario Results

| Scenario | Pass? | Notes |
|----------|-------|-------|
| A: Cold Boot | ✅ / ❌ | |
| B: Char Create → F0 | ✅ / ❌ | |
| C: F0 → F1 | ✅ / ❌ | |
| D: F1 Interiors | ✅ / ❌ | |
| E: Gate → F2 | ✅ / ❌ | |
| F: Dungeon Run | ✅ / ❌ | |
| G: Day Cycle + Readiness | ✅ / ❌ | |
| H: Death + Game Over | ✅ / ❌ | |
| I: Victory | ✅ / ❌ | |

## Bugs Found

### BUG-1: [Short title]
- **Severity:** P0 / P1 / P2 / P3
- **Scenario:** Which scenario (A-I)
- **Steps to reproduce:**
  1.
  2.
  3.
- **Expected:** What should happen
- **Actual:** What happened instead
- **Console output:** (paste errors)
- **Screenshot:** (attach if possible)

### BUG-2: ...

## General Feel / UX Notes

(Freeform — anything about pacing, readability, confusion, delight)
```

### 4.4 GIF Capture & Console Dump (F8 / F9)

The engine ships with a built-in GIF recorder for capturing low-res gameplay clips and a parallel console snapshot. Both files download automatically when triggered.

#### Quick Reference

| Key | Action | Output |
|-----|--------|--------|
| **F9** | Save last 6 seconds from rolling buffer | `dungeon-gleaner_last6s_<timestamp>.gif` + `.console.txt` |
| **F8** | Toggle manual recording (press once to start, again to stop) | `dungeon-gleaner_manual_<timestamp>.gif` + `.console.txt` |

**F9 is the primary capture key.** It grabs the last 6 seconds of gameplay from a rolling buffer that runs continuously. No need to "start" anything — just play, and when something interesting or broken happens, hit F9.

F8 is for longer manual recordings. Press F8 to start, play the scenario, press F8 again to stop. The full recording encodes and downloads.

#### Capture Settings (defaults)

| Setting | Value |
|---------|-------|
| Resolution | 480px wide (downscaled from game canvas) |
| Frame rate | 12 fps |
| Rolling buffer | 6 seconds (~72 frames) |
| GIF quality | 10 (gif.js scale — lower = better quality, slower) |
| Console window | Last 30 seconds of `log`, `info`, `warn`, `error`, `debug` |

#### Where Files Go — Set Your Download Folder to `tests/`

GIF and console files download via the browser's standard download mechanism. **To deposit captures directly into the repo's `tests/` folder:**

**Chrome / Edge:**
1. Open Settings → Downloads (or navigate to `chrome://settings/downloads`)
2. Set **Download location** to your local repo's `tests/` directory, e.g.:
   `C:\Users\<you>\...\DCgamejam2026\tests`
3. Toggle **"Ask where to save each file"** OFF

**Firefox:**
1. Open Settings → Files and Applications
2. Set **Save files to** → `DCgamejam2026\tests`

After this, every F9/F8 capture lands directly in `tests/` — ready to commit, attach to a bug report, or review.

#### What Gets Captured

Each F9/F8 produces **two files** with matching timestamps:

1. **`.gif`** — low-res gameplay recording (typically 100–500 KB for 6 seconds)
2. **`.console.txt`** — all console output from the same time window, formatted as:
   ```
   Dungeon Gleaner — console snapshot
   window: 142000ms .. 148000ms (performance.now)
   ---
   [142051ms] [log] [FloorManager] transitioned to floor 1
   [142200ms] [warn] [CobwebSystem] no valid corridor tiles
   [145300ms] [error] Uncaught TypeError: ...
   ```

The console dump is invaluable for bug reports — it captures the exact errors and system logs around the moment you hit F9, without needing to copy-paste from DevTools.

#### Tips for Playtesters

- **Hit F9 whenever you see a bug.** The rolling buffer means the last 6 seconds are always available. You don't lose anything by pressing it late.
- **Attach both files** (`.gif` + `.console.txt`) to your bug report in `docs/FIX_AND_BUGS/PLAYTEST_FEEDBACK/`.
- **F9 works during any game state** — title screen, gameplay, menus, combat, game over.
- **If F9 does nothing:** check the browser console for `[GifRecorder] ready`. If that message is missing, the `gif-recorder.js` or `engine/vendor/gif.js` script may not have loaded (see §1.4 about the index.html truncation fix).
- **Large recordings** (F8 over 30+ seconds) may take a few seconds to encode. Watch the console for `[GifRecorder] encoding… XX%` progress messages.

#### Technical Details (for devs)

The recorder lives in three files:

| File | Role |
|------|------|
| `engine/vendor/gif.js` | gif.js 0.2.0 — worker-based GIF encoder ([jnordberg/gif.js](https://github.com/jnordberg/gif.js)) |
| `engine/vendor/gif.worker.js` | Web Worker for frame encoding (spawns 2 workers by default) |
| `engine/gif-recorder.js` | Engine integration — hotkeys, rolling buffer, console capture, download logic |

Initialization happens in `game.js` during engine boot:
```javascript
GifRecorder.init(canvas, {
  fps: 12,
  maxWidth: 480,
  rollingEnabled: true,
  rollingSeconds: 6,
  quality: 10,
  workers: 2,
  captureConsole: true,
  consoleMaxSeconds: 30
});
```

The `tick()` method is called every frame from the main render loop, feeding canvas snapshots into the rolling buffer.

### 4.5 Things That Are NOT Bugs

These are known limitations for the jam build. Do **not** report them:

- NPC barks may repeat — bark pool is small for jam scope
- Shop prices are placeholder — economy not tuned
- No save system — state resets on page refresh
- Floor 3 / 3.1 / 3.1.1 are placeholder proc-gen — no hand-authored content
- Starter deck is not balanced — card tuning is post-blockout
- Some building facades are decorative (doors don't open) — future floors
- Pressure washing not yet implemented — parallel development track
- No sound effects on most interactions — audio pass is separate
- Dispatcher force-turn sequence not implemented — gate is passable without keys
- Hero walk controller on Floor 2.2.1 not implemented — no hero sprite in dungeon yet

### 4.6 Things That ARE Bugs (Report These)

- Blank screen / nothing loads (P0)
- Console errors in red (any)
- Stuck on a tile / can't move (P0)
- Door leads to wrong floor (P1)
- Interaction does nothing (P1 — which tile, which floor?)
- Text unreadable (too small, wrong color, clipped)
- Minimap doesn't match actual floor layout
- Readiness bar doesn't update after cleaning/restocking
- Day cycle doesn't advance after bed rest
- Combat softlocks (can't end turn, can't flee)
- Game over screen doesn't appear on death
- Visual corruption (textures wrong, sprites missing, z-fighting)

---

## 5. Bug Triage Template

Repurposed from `DEBUG_NOTES_SCREENER.md` format. New bugs go here after playtest triage.

**Status key:** ✅ Fixed | 🔧 In Progress | ❌ Open | 📋 Deferred | 🔴 P0 Blocker

```markdown
## PT-XX: [Short descriptive title] [STATUS]

**Reported:** [Date] by [who] | **Scenario:** [A-I]
**Severity:** P0 / P1 / P2 / P3

**Symptom:** What the tester saw.

**Root cause:** (filled by dev after investigation)

**Fix:** (filled by dev — files changed, approach taken)

**Verified:** [Date] — retested in scenario [X], passes.
```

### Triage Rules

1. **P0 (Blocker):** Fix immediately. Game doesn't load, player stuck, data loss. No playtest continues until P0 is clear.
2. **P1 (Major):** Fix before next playtest round. Core interaction broken, wrong floor transition, combat softlock.
3. **P2 (Minor):** Fix when P0/P1 are clear. Visual glitch, timing issue, font too small.
4. **P3 (Polish):** File and roadmap. Animation smoothness, juice, pacing. Post-jam unless trivial (<5 min fix).
5. **Duplicate:** Link to existing bug. Don't create a new entry.
6. **Not a bug:** Mark as "known limitation" and add to §4.4 if not already listed.

---

## 6. Known Issues vs. Stale Feedback

Playtesters who pulled the repo on April 2 (before the index.html fix) will have encountered a **non-functional build**. Their feedback should be re-evaluated:

### 6.1 Stale Feedback Filter

| Stale Report Pattern | Likely Cause | Status |
|---------------------|--------------|--------|
| "Blank screen" / "nothing renders" | index.html truncated — game.js never loaded | ✅ Fixed (index.html restored) |
| "Console: Uncaught SyntaxError" at end of file | Truncated `<script src="eng` tag | ✅ Fixed |
| "Game doesn't start" / "title screen missing" | Same root cause — game.js missing | ✅ Fixed |

**Action:** Any feedback from April 2 or earlier builds that matches these patterns can be closed. Ask the tester to `git pull` and re-test.

### 6.2 Feedback That May Still Be Valid

Stale pull testers who managed partial load (via browser cache or prior session) may have encountered real bugs unrelated to the truncation. Keep any feedback about:

- Specific interaction failures (bookshelf, bar counter, crate, combat)
- Visual issues (sprite rendering, texture problems, font legibility)
- Floor-specific problems (stuck tiles, wrong transitions)
- Balance / feel concerns (these don't depend on index.html)

Cross-reference against the scenario checklist in §3.3 and file as new bugs if reproducible on the fixed build.

---

## Cross-References

| Section | Links To | Relationship |
|---------|----------|-------------|
| §1 Audit | ROADMAP.md Pass 1-8 | System inventory source |
| §2 Blockouts | UNIFIED_EXECUTION_ORDER.md | Implementation sequencing |
| §2 Blockouts | spatial-contract.js | Contract dimensions/biomes |
| §2 Blockouts | PRESSURE_WASHING_ROADMAP.md | Parallel track |
| §3 Playtest | Tutorial_world_roadmap.md §4 | Playflow scenario source |
| §4 Playtester Guide | FIX_AND_BUGS/PLAYTEST_FEEDBACK/ | Output location |
| §5 Triage | DEBUG_NOTES_SCREENER.md | Template format source |
| §6 Stale Feedback | FIX_AND_BUGS/ (7 existing bug docs) | Prior bug context |

---

*End of Document — v1.0*

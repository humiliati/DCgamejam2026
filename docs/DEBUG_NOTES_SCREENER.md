# Debug Notes Screener

**Updated**: 2026-04-07 | **Status key**: ✅ Fixed | 🔧 In Progress | ❌ Open | 📋 Deferred

---

## DN-01: System menu sliders grab arrow keys ✅

**Reported**: Arrow keys used to flip between menu faces get captured by sound sliders on Face 3 (System). Player gets stuck on the settings pane.

**Root cause**: `game.js` lines 236-258 routed `turn_left`/`turn_right` directly to `MenuFaces.handleSettingsAdjust()` when Face 3 was active, with `return` preventing face rotation.

**Fix**: ←/→ arrows now always rotate faces (all faces including Face 3). Slider adjustment is done via scroll wheel (±10 per tick) and W/S navigates slider rows. Face 3 hint text updated to reflect new controls.

**Files changed**: `engine/game.js`, `engine/menu-faces.js`

---

## DN-02: Tooltip log history wrong order ✅

**Reported**: Expander button shows history wrong — oldest entry near the current row, newest at the top. Should be newest closest to current row with oldest fading off at top.

**Root cause**: `_history` array stores newest-first via `unshift()`, but `_rebuildHistory()` iterated forward (index 0 → length), putting newest at the DOM top. Since the history panel sits above the current row, newest should be at the DOM bottom.

**Fix**: Reversed iteration order in `_rebuildHistory()` — now iterates from `_history.length - 1` down to `end`, placing oldest at top and newest at bottom (closest to current row).

**File changed**: `engine/status-bar.js`

---

## DN-03: Debrief feed time redundant and doesn't update ✅

**Reported** (Figure 1): Time row in debrief feed is static/redundant with the weekly time indicator in HUD.

**Fix (P1.3)**: Time row removed. Header shows callsign only. Time lives in the minimap day counter.

**File**: `engine/debrief-feed.js`

---

## DN-04: Debrief feed contents illegibly small ✅

**Reported** (Figure 2): All debrief feed content too small to read.

**Fix (P1.3)**: Dynamic S-factor scaling — base font-size on `#debrief-feed` now computed from `panelWidth / 273` in JS. All child CSS font sizes converted to `em` units that inherit the dynamic base. Feed tail (last 2 events) embedded in unified view. Bar heights scale with S.

**Files**: `engine/debrief-feed.js`, `index.html` (CSS)

---

## DN-05: NPCs rendering as transparent outlines ✅

**Reported** (Figure 3): NPC sprites appear as transparent with only their overlays outlining them.

**Root cause**: Two issues combined:
1. **Directional facing shade** (raycaster.js lines 1410-1463) applies a radial center-fade gradient when sprites face away from the player. On exterior floors, this washes the center to fog color while keeping edges — producing the "transparent outline" effect.
2. **`friendly` flag not passed to sprite data** — game.js built sprite objects without the `e.friendly` property, so the raycaster couldn't exempt friendly NPCs from the aggressive back-facing silhouette.

**Fix**:
- Added `friendly: e.friendly` to the sprite push in game.js (line 3408)
- Added `!s.friendly` guard to directional shading in raycaster.js (line 1410) — friendly NPCs now skip all directional darkness overlays

**Files changed**: `engine/game.js`, `engine/raycaster.js`

---

## DN-06: Bonfire markers unclear on exterior minimap ✅

**Reported**: Bonfires need a visible marker on exterior minimap to prevent player confusion.

**Prior state**: Bonfire tile was already color-coded orange (`#f80`) in minimap.js, but at small tile sizes it was indistinguishable from other colored tiles.

**Fix**: Added bright yellow (`#ff4`) glow dot drawn over bonfire tiles when lit, providing a distinctive visual marker on the minimap.

**File changed**: `engine/minimap.js`

---

## DN-07: All non-HUD menus/panels too small ✅

**Reported**: Pause menu, systems menu, inventories, shops, bonfires, puzzles — all render at tiny sizes. Hilariously small click targets.

**Fix (P1.1 + P1.2)**: MenuBox `_renderFace()` padding now viewport-scaled (`vpScale = min(w,h)/400`). All face sub-renderers converted from hardcoded px fonts to S-factor or ts-relative scaling: `_drawSlot`, `_drawHoverTooltip`, `_renderDeckSection`, `_renderBag`, `_renderShopSell`, `_drawEmptyTile`, `_drawItemTile`, `_renderStash`, `_renderShopBuy`. Rarity dots, position offsets, and price tags also scaled.

**Files**: `engine/menu-box.js`, `engine/menu-faces.js`

---

## DN-08: Dispatcher interaction broken ✅ (partial) / 🔧

**Reported** (Figure 4): Dispatcher turn-around doesn't grab player properly. No NPC dialogue or barks printing anywhere. "ok to talk" shows but NPC does nothing.

**Root cause found**: InteractPrompt checked `e.friendly` to show "Talk" prompt, but game.js `_interact()` required `e.talkable`. An NPC with `friendly: true` but `talkable: false` would show the prompt but clicking did nothing.

**Fix applied**: InteractPrompt now requires BOTH `e.friendly && e.talkable` before showing the prompt (interact-prompt.js line 153).

**Remaining work**: Verify dispatcher has `talkable: true` set. Verify dialogue tree / bark pool is registered for dispatcher NPC. The dispatcher gate bump path (game.js `_onBump` → `_showDispatcherGateDialog`) is separate from the general NPC interact path — need to confirm both work.

> **Extraction note:** `_showDispatcherGateDialog()` was extracted from `game.js` to `engine/dispatcher-choreography.js` as `DispatcherChoreography.showDispatcherGateDialog()`.

**Files changed**: `engine/interact-prompt.js`

---

## DN-09: Tooltip clickable hyperlinks for NPC dialogue ✅

**Reported**: Need clickable hyperlinks in NPC dialogue. Dispatcher interaction should only be dismissible via dialogue choice hyperlinks.

**Fix (verified P2.4)**: Two complete dialogue systems in place:
1. `StatusBar.pushDialogue()` — inline DOM choices in tooltip history panel, click-delegated via `.sb-dialogue-choice` elements. Used by Dispatcher, vendors, ambient NPCs. Supports `showIf` flag gating, `effect.callback`, tree navigation, and walk-away detection.
2. `DialogBox.startConversation()` — canvas-rendered modal with pointer hover hit-testing. Used for signs, lore, item descriptions.

Dispatcher gate dialogue fully wired: `DispatcherChoreography.showDispatcherGateDialog()` → `StatusBar.pushDialogue(npc, tree, onEnd, {pinned: true})` → player clicks choice → `_onDialogueChoice(idx)` → effects fire → tree navigates or ends.

**Files**: `engine/status-bar.js`, `engine/dialog-box.js`, `engine/dispatcher-choreography.js`

---

## DN-10: DECK button opens System menu instead of Inventory ✅

**Reported** (Figure 5): Clicking DECK button pulls up Face 3 (SYSTEM) instead of Face 2 (INVENTORY).

**Fix**: `Game.requestPause('pause', 2, 'deck')` — now correctly passes face index 2. Fixed during Sprint 0 / CardAuthority migration.

**File**: `engine/status-bar.js`

---

## DN-11: Deck quantity denominator wrong ✅

**Reported** (Figure 5): Backup deck quantity display is broken.

**Fix**: Now uses `CardAuthority.getHandSize()` + `CardAuthority.getBackupSize()` for accurate `handSize / (handSize + backupSize)` display. Fixed during Sprint 0 / CardAuthority migration.

**File**: `engine/status-bar.js`

---

## DN-12: Inventory drag-drop non-functional (card fan ↔ bags) ❌

**Reported** (Figure 5): Need card drag from hand fan component to bag/deck buttons. Multiple failed passes at fixing this.

**Root cause**: Card fan (card-fan.js) is a closed drag system — supports reorder/stack/swipe-fire within the fan only. No external drop zones. Face 2 inventory (menu-faces.js) has its own canvas-based drag zones but they don't receive from the card fan. Two disconnected drag systems.

**Status**: Deferred to inventory roadmap Phase 4 (critical path, 2-3 hours). Full audit document: `docs/INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md`

**Files**: `engine/card-fan.js`, `engine/menu-faces.js`, `engine/player.js`

---

## DN-13: Tooltip aesthetic and function mismatch with EyesOnly 🔧

**Reported**: Tooltip needs to match EyesOnly identically where applicable. EyesOnly uses container-query responsive sizing, block character resource bars, idle animations.

**Status**: Partially addressed (history order fixed in DN-02). Remaining: scaling, resource bar format, aesthetic matching.

**File**: `engine/status-bar.js`

---

*Last reviewed: 2026-04-07 — P1 menu usability pass*

---

## Foxtrot.BlockoutRefreshAndFloorUpdate — Day 1 (2026-04-20)

**§7 per-floor checklist — Floors 0 → 3.1.N**

Pending. Scheduled Wed–Fri. Day 1 did not touch §7.

**Day-1 ledger**

- **Phase B — Driftwood Inn doorPanel**: `door_panel_wood` → `door_panel_oiled` (engine/building-registry.js:108). Landed clean. Validator + budgets unchanged vs 39-baseline.
- **Phase B — Gleaner's Home doorPanel**: `door_panel_dark` → `door_panel_charcoal` (engine/building-registry.js:146). Landed clean.
- **Phase C kickoff — Coral Bazaar DOOR → DOOR_FACADE**: `_FLOOR1_GRID[8][10]` flipped `2` → `74` (engine/floor-manager.js:1629) + `doorFaces '10,8': 1` added (face SOUTH, toward promenade road). Row-8 inline comment updated. `doorEntry` comment updated to DOOR_FACADE.
- **Phase C kickoff — Storm Shelter DOOR → DOOR_FACADE**: `_FLOOR1_GRID[27][10]` flipped `2` → `74` (engine/floor-manager.js:1648) + `doorFaces '10,27': 3` added (face NORTH, toward promenade road). Row-27 inline comment updated.
- **Validator re-run post-Phase-C**: `bo validate` = **39 issues (21 warn + 18 err)** — exact baseline match, zero regression. `check-budgets.js`: floor-manager.js at 3358 lines (WARN 3200 / cap 3600), no new FAIL. Phase B+C complete for Day 1.
- **Driftwood Inn DOOR → DOOR_FACADE**: NOT flipped Day 1 — Tue sprint target per DOC-130. Grid still shows `77,2,77` at cols 21-23 row 8.
- **DN-FOXTROT-03 recurrence**: The bindfs stale-read symptom re-triggered on engine/floor-manager.js mid-session (`node --check` + `wc -l` saw a 3349-line truncated view while Read tool showed the correct 3358-line file and `stat` reported the full byte count). Resolved by building a clean patched copy from `git show HEAD:engine/floor-manager.js` + re-applying the 4 logical edits via Python, then `cp`-ing over the mount. `git hash-object` + `node --check` agreed after; Read tool still agrees. Root cause likely same as DN-FOXTROT-03 — worth keeping the recovery recipe in mind for the rest of the sprint.

## DN-FOXTROT-01: Floor 1 exterior DOOR → DOOR_FACADE flip lives in a hand-authored grid, not tools/floor-payloads/ ✅

**Reported**: Phase C requires flipping grid tile id from `2` (DOOR) to `74` (DOOR_FACADE) at (10,8) Coral Bazaar and (10,27) Storm Shelter on Floor 1. Command's charter authorizes "Data/registry: engine/building-registry.js, floor payload JSON under tools/floor-payloads/" as Foxtrot's owned surface. But Floor 1 exterior has NOT been extracted to a floor-blockout-1.js — its GRID is still inline in `engine/floor-manager.js` `_FLOOR1_GRID` (lines 1618+). The BO-CLI mutates `tools/floor-data.json` (derived artifact), not the inline JS grid — and at runtime the engine loads the inline grid from floor-manager.js.

**Impact**: A Phase C grid-tile flip is a 4-character edit in floor-manager.js. That file is not listed in Foxtrot's owned files, but neither is it on the hard-no list (door-sprites.js, raycaster.js, interact-prompt.js). Scope fence reads "Registry data + doorFaces config only" — ambiguous whether a tile-id flip in a hand-authored grid counts as "registry data".

**Resolution (2026-04-20)**: User granted "license to edit where sensible" for Phase C grid flips. Coral Bazaar (10,8) and Storm Shelter (10,27) converted in-place via targeted Edit-tool calls to `_FLOOR1_GRID[8][10]` and `_FLOOR1_GRID[27][10]`, plus `doorFaces '10,8': 1` and `'10,27': 3` added to the Floor 1 return object. Driftwood Inn (22,8) deferred to Tue per sprint plan. `bo validate` post-edit: 39 issues (21 warn + 18 err) — exact baseline match, zero regression.

**Followup for post-jam**: Extract Floor 1 exterior to `engine/floor-blockout-1.js` + `tools/floor-payloads/1.json` so the authoring pipeline owns it the same way Floor 2, 2.1, 2.2, 3, 3.1 are owned. This removes the scope-ambiguity for future Foxtrot-style passes.

## DN-FOXTROT-02: Phase D Wolfenstein recess extension is in engine/raycaster.js (Alpha/Charlie fence) ❌

**Reported**: BLOCKOUT_REFRESH_PLAN.docx §4.3 Phase D extends the Wolfenstein thin-wall recess (currently DOOR_FACADE-only) to also trigger on PORTHOLE tiles. The recess machinery lives in `engine/raycaster.js` (line 1410 — `DOOR_FACADE recess (Wolfenstein thin-wall offset)`). Foxtrot's charter hard-fences raycaster.js as Alpha/Charlie territory.

**Impact**: Phase D cannot start Tue under current owned-files list. Either (a) Command re-owns the raycaster.js hunk to Foxtrot for this specific recess extension, (b) Alpha/Charlie picks up Phase D, or (c) Phase D is descoped from the patch sprint.

**Status**: Open. Reported to Command Day 1 EOD. Phase D Tue start depends on resolution.

## DN-FOXTROT-03: Edit-tool write padded building-registry.js with trailing NULs, breaking Node parse ✅

**Reported**: During Phase B edits, the working-tree version of `engine/building-registry.js` ended up with ~160 trailing NUL bytes after the final `})();`, causing `node --check` to fail with `SyntaxError: Invalid or unexpected token` at line 284. Read tool reported the file as 283 lines of clean JS (Phase B edits intact); `bash` saw the same JS followed by `^@` NULs. `wc -c` reported 12757 bytes vs 12556 bytes of real content.

**Reproducer**: Not cleanly reproducible — triggered after a second Edit tool call on the same file in the same turn. May be a race between the Windows host's file-write path and the sandbox mount's view. Also coincided with a stale `.git/index.lock` that blocked all git operations from bash.

**Root cause**: Unknown. Likely Windows-host file-write buffer not being committed before sandbox read, OR the Edit tool re-serializing the file at an incorrect byte count and leaving dead bytes.

**Fix applied Day 1**: Rewrote the full file via the Write tool, then stripped trailing NULs via Python (`while data[end-1] == 0: end -= 1`), then verified with `node --check` and a VM `runInContext` parse. Phase B edits preserved.

**Workaround for future sessions**: Prefer a single `Write` of the full file for non-trivial edits rather than multiple `Edit` calls, especially when the file contains box-drawing Unicode separators (`─`). After any edit, run `node --check <file>` before declaring a task done.

**Files**: `engine/building-registry.js` (self-healed), `.git/index.lock` (still stuck — blocks bash-side git).


---

# Voting-Period Patch Sprint — Daily Log

Running log maintained by **Command.QaAndIntegration** per DOC-130 sprint plan. Ship gate Sat 2026-04-25 EOD. Each day: what dispatched, what landed, section-level green/yellow/red status, seam risks.

## Day 1 — Mon 2026-04-20

**Baseline repo state (pre-sprint, head `ed797fb` — "Stamp build v0.14.2"):**

`bo validate`: **39 issues** (18 err / 21 warn). Pre-existing classes to NOT regress:
- **spawn-missing** × 14 — floors 1, 1.1, 1.2, 1.3, 1.6, 2.1, 2.2, 2.2.1, 2.2.2, 2.3, 2.4, 3.1, 3.2 (warn — these floors have no `spawn` tile; player materializes at default entry)
- **room-has-walls** × 16 — floors 0, 1, 1.1, 1.3, 2, 2.2, 3, 3.1, 3.1.1, 3.2, 99.1 (warn — enclosed rooms where engine can't resolve interior/exterior; Foxtrot §7 pass should reduce these)
- **door-target-missing** × 4 — floors 3 (door at 51,26 → missing "4"), 1.9 (door at 2,7 → missing "1.9.1"), 99.1 (door at 3,0 → missing "99") **(err)**
- **door-no-target** × 5 — (err)

`check-budgets.js`: **exit=1** (10 FAIL / 19 WARN entries, pre-existing LOC budget overruns). No patch-sprint work touches these FAIL files deeply; Command only tracks that we don't make any of them worse. Top offenders unchanged: `texture-atlas.js` 9700 (cap 7500), `game.js` 4923 (cap 4500).

**Build stamp**: `build 0.14.2 · ed797fb · 2026-04-20` — fresh post-jam stamp, generated 2026-04-20T18:14:55Z.

**Dispatch:**
- Foxtrot.BlockoutRefreshAndFloorUpdate → Phase B (BuildingRegistry contrast updates for Driftwood Inn + Gleaner's Home) + Phase C kickoff (Coral Bazaar / Storm Shelter DOOR_FACADE conversion).
- Golf.UiUnificationAndRefillAudit → ACTION_MAP audit in `engine/interact-prompt.js` + i18n survey; proposal for canonical verb ("Restock" vs "Refill" vs "Load") due by EOD Monday.

**Hotel**: not yet dispatched — partial block on Golf landing unified prompts (Tue–Wed).

**Open items for Day 1 decisions (user):**
1. Canonical refill verb
2. Pre-approve Juliet as stretch vs hold until Wed
3. Any Hotel interactions that are specced-but-not-implemented we should de-scope now

**Section status:** Foxtrot 🟢 dispatched · Golf 🟢 dispatched · Hotel ⚪ queued · India ⚪ queued · Command 🟢 active

**Seam watch notes:** Golf's ACTION_MAP edits will ripple into every tile that produces a refill-family prompt — Command greps `interact\.(fill|restock|refuel|grab_hose)` before Golf lands so the surface area is known. Foxtrot's DOOR_FACADE conversions potentially touch `door-sprites.js` (Alpha's engine file) — verify edits stay in registry/data space, not engine hotpath.

**Landed Day 1 — Foxtrot:**
- Phase B ×2 (Driftwood Inn + Gleaner's Home doorPanel in engine/building-registry.js).
- Phase C kickoff ×2 (Coral Bazaar 10,8 + Storm Shelter 10,27 flipped DOOR → DOOR_FACADE in engine/floor-manager.js `_FLOOR1_GRID`; doorFaces map extended with `'10,8': 1` and `'10,27': 3`). `door-sprites.js` NOT touched — the floor-manager.js dispatch (line ~2670) already auto-calls `DoorSprites.setTexture(x, y, building.wallTexture)` for DOOR_FACADE tiles whose coord matches a building record, so no per-tile texture wiring was needed. Scope fence held.
- Validator: 39 issues (21 warn + 18 err) — baseline match, zero regression. Budgets: no new FAIL; floor-manager.js 3358 lines still within WARN band (cap 3600).

**DN-FOXTROT-01 resolved** (user granted "license where sensible" for inline-grid edits). **DN-FOXTROT-02 still open** (Phase D Wolfenstein recess extension for PORTHOLE tiles — lives in raycaster.js, Alpha/Charlie fence; Tue Phase D start still contingent on Command decision).

**Landed Day 1 — Golf:**
- Full audit posted as `docs/GOLF_DAY1_AUDIT.md` (~220 lines, ~22 edit-site inventory across 10 files).
- Recommended canonical verb: `"Restock"`; canonical icon: `📦`. Rationale anchored on architecture name alignment (RestockSurface/RestockBridge/RestockWheel already use the word) + lore/dialogue already 100% on "Restock".
- Same-day Day-2 rename landed in working tree (uncommitted): `engine/interact-prompt.js` ACTION_MAP (5 entries), `data/strings/en.js` + `es.js` (aliases for deprecated keys + 3 new `restock.title.*` keys), `engine/torch-peek.js` (2 sites), `engine/crate-peek.js` (1 site), `engine/restock-surface.js` (torch-title unified).
- Verified `corpse-peek.js` and `chest-peek.js` were already on "Restock" pre-rename — no edit needed.
- Defensive grep sweep post-edit: zero live `'Refuel' / 'Fill Crate' / 'Grab Hose'` literals in `engine/`. Only remaining occurrences are deprecated i18n aliases (defensive fallback) and one inline breadcrumb comment in `crate-peek.js:888`.
- Scope fence clean: no touches to raycaster.js, door-sprites.js, tiles.js, building-registry.js, floor-manager.js, or tutorial interaction handlers.

**Validator delta (post-Foxtrot + post-Golf working tree):**
- `bo validate`: **39 issues** (21 warn + 18 err) — **exact baseline match, zero regression**.
- `check-budgets.js`: exit=1 (unchanged), top 10 FAILs identical to baseline. Golf's edits add <1 KB to `data/strings/en.js` (within WARN band); Foxtrot's 3 tile-id flips are net-zero bytes.
- `door-target-missing` ×4 unchanged (floors 3 x2, 1.9, 99.1). These are pre-existing and Foxtrot's §7 pass (Thu/Fri) should resolve them.

### Command decisions — end of Day 1

1. **DN-FOXTROT-02 (Phase D raycaster hunk) — SPLIT PHASE D.** Foxtrot owns the **data half** (place portholes as gates on Floor 0/1 per BLOCKOUT_REFRESH_PLAN §4.3). The **engine half** (extend the existing DOOR_FACADE Wolfenstein thin-wall recess at `raycaster.js:~1410` to also trigger on `PORTHOLE` tile id) is explicitly re-delegated to Foxtrot under a narrow license, same model as DN-FOXTROT-01's resolution. Alpha/Charlie remain paused; no conflict risk. Constraint: edit is scoped to the single recess-trigger branch — any deeper ray-geometry change stays out of scope and gets logged as a DN entry. If Foxtrot's landing regresses the ≤2% framerate budget on test-harness.html, revert and descope Phase D engine half.

2. **Golf rename approved and accepted.** Golf report's four "questions for Command" (verb / icon / per-tile hints / one-sprint alias) were all addressed in-session (the audit preempted my Day-2 call). The one-sprint alias deprecation window ratifies Golf's defensive choice. No further Golf work queued until Hotel smoke-tests in Wed playthrough surface anything.

3. **Commit hygiene:** Foxtrot's work is committed (`1842632`). Golf's rename is **uncommitted** in the working tree. Command recommends Golf commit land as a single logical commit on Tue morning with message referencing GOLF_DAY1_AUDIT.md, before Hotel dispatches. Also flagging for user: working tree has pre-existing dirty files unrelated to this sprint (`tools/verb-node-*` directory reorg, `tools/world-engine/`, `tools/world-designer.html`) — these should NOT be swept into Golf's commit. Suggested: `git add` explicit file list rather than `git add -A`.

4. **Juliet (stretch).** Not yet gated; Foxtrot Phase C + Phase D Tuesday pace will decide. Status: **held**, evaluate EOD Wednesday.

5. **Hotel dispatch.** Unblocked — Golf's unified prompts are present in the working tree; Hotel's Wed pressure-wash loop will see consistent `"Restock"` on crate/corpse/torch/truck. Dispatch brief drafting queued for Tue morning once Golf's commit lands. Hotel charter fences: polish only, not authoring — any systemic interaction bug discovered gets logged as a DN and handed back to an engineering section (Alpha/Charlie-descendant) post-patch, not fixed in-sprint.

### Day 1 section status (EOD)

- **Foxtrot** 🟢 Phase B ✓ + Phase C 2/3 ✓ (Driftwood Inn (22,8) converts Tue). On pace. Phase D engine-half authorized under narrow license.
- **Golf** 🟢 Day-1 audit ✓ + Day-2 rename landed ✓ (uncommitted). No remaining charter work until Hotel playthrough.
- **Hotel** ⚪ queued for Tue-morning dispatch (unblocked now that Golf has landed).
- **India** ⚪ queued for Sat 04-25 ship gate.
- **Juliet** ⚪ held (Wed evaluation).
- **Command** 🟢 active — seam check ✓, validator deltas ✓, DN-FOXTROT-02 decision ✓.

### Day 2 (Tue 2026-04-21) dispatch preview

- **Foxtrot**: Driftwood Inn (22,8) DOOR_FACADE conversion; Phase D data-half (Floor 0/1 porthole gate placement); Phase D engine-half (raycaster.js recess trigger extension to PORTHOLE). Framerate smoke on test-harness.html before commit.
- **Golf**: commit the Day-2 rename with inventory-style message. Manual smoke test in tutorial world (checklist already in `docs/GOLF_DAY1_AUDIT.md` §Smoke-test readiness, 12 steps). Tue evening: stand by for any Hotel feedback.
- **Hotel**: dispatch brief authored EOD Tue; charter focused on pressure-wash loop end-to-end (truck → hose grab → drag → clean grid → roll-up auto-exit).
- **Command**: validator dry-run after each section commit; Wed status report (green/yellow/red per section) with Juliet go/no-go.


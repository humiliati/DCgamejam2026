# Chest Playtest Debug Log — 2026-04-03

**Playtest route:** Floor 0 → Floor 1 (Promenade) → Floor 1.6 (Home) → Chest → Key pickup
**Resolution status:** All 6 bugs fixed. Additional systems built: depth-based chest contract, stash grid UI, PeekSlots chest-awareness.

---

## Findings

### BUG-1: Clicking on chest contents does nothing

**Severity:** Critical — blocks primary gameplay loop
**File:** `engine/crate-ui.js`

CrateUI is a canvas-rendered overlay that only processes keyboard input via `handleKey()`. There are zero mouse/pointer event handlers. The hint text says `[1-N] take item [ESC] close` but this is rendered small and easy to miss. Players on LG webOS will be using the Magic Remote pointer — which means this UI is currently unusable on the target platform.

**Root cause:** CrateUI was built for keyboard-first crate deposit flow. The withdraw mode (chest) was added to the same module but inherited the keyboard-only interaction. No pointer hit-test was added for slot boxes.

**Fix:** Add pointer/click handling to CrateUI for CHEST withdraw mode. Each rendered slot box has known screen coordinates (computed during `render()`). On pointer click, hit-test against slot rects and call `_withdrawToBag()` for the matched slot. This also needs DragDrop zone registration in PeekSlots for chest slots (currently only registered for crate/corpse deposit).

---

### BUG-2: Legacy openChest fallback fires — gold + tile destruction + "sealed" feel

**Severity:** Critical — legacy path stomps new system
**File:** `engine/game.js` line 4509-4510

When the player presses F on the chest, `PeekSlots.tryOpen()` opens the CrateUI overlay. But if the player interacts again (second F press, or if PeekSlots is in a non-IDLE state), `tryOpen()` returns false and the code falls through to `CombatBridge.openChest(fx, fy)` — the legacy auto-open path. This legacy function:

1. Immediately sets `grid[cy][cx] = TILES.EMPTY` (chest disappears)
2. Rolls random loot via `LootTables.rollBreakableLoot()`
3. Awards gold via `CardTransfer.lootGold()`
4. Increments `SessionStats.chestsOpened`

The player experienced: clicking didn't work → hit ESC (closes PeekSlots, returns to IDLE) → pressed F again → this time PeekSlots sees the container but it may be in a weird state → falls through to legacy → gold awarded, chest destroyed, no key delivered.

**Fix:** Remove the `CombatBridge.openChest(fx, fy)` fallback entirely from the CHEST tile block. If PeekSlots can't open (already sealed, depleted, or missing container), show a toast and return. The legacy path should never fire for CHEST tiles.

```javascript
if (tile === TILES.CHEST) {
  var chestFloorId = FloorManager.getCurrentFloorId();
  if (typeof PeekSlots !== 'undefined' && typeof CrateSystem !== 'undefined' &&
      CrateSystem.hasContainer(fx, fy, chestFloorId)) {
    PeekSlots.tryOpen(fx, fy, chestFloorId);
    return;  // Always return — no fallback
  }
  // No container at all — chest is decorative or already depleted
  return;
}
```

---

### BUG-3: Quest objective shows "get key" before meeting dispatcher

**Severity:** Medium — misleading but non-blocking
**File:** `engine/game.js` lines 4127-4159

`_updateQuestTarget()` has two phases: `!_gateUnlocked` (Phase 1: get keys) and `_gateUnlocked` (Phase 2: head to dungeon). There is no Phase 0 for "meet the dispatcher." On Floor 1, the quest marker immediately points at the Home door (34,9) even though the player hasn't encountered the Dispatcher NPC yet.

> **Extraction note:** `_updateQuestTarget()` was extracted from `game.js` to `engine/quest-waypoint.js` as `QuestWaypoint.update()`.

**Fix:** Split the pre-unlock phase using `_dispatcherPhase`:

```javascript
if (!_gateUnlocked) {
  if (_dispatcherPhase !== 'done') {
    // Phase 0: meet dispatcher — point at gate area
    if (floorId === '0') {
      Minimap.setQuestTarget({ x: 19, y: 5 });  // Door to Promenade
    } else if (floorId === '1') {
      Minimap.setQuestTarget({ x: 5, y: 2 });   // Dispatcher gate position
    } else {
      Minimap.setQuestTarget(null);
    }
  } else {
    // Phase 1: get work keys — existing logic
    if (floorId === '1') {
      Minimap.setQuestTarget({ x: 34, y: 9 });
    } else if (floorId === '1.6') {
      Minimap.setQuestTarget({ x: 19, y: 3 });
    } else {
      Minimap.setQuestTarget(null);
    }
  }
}
```

Also call `_updateQuestTarget()` at the end of the dispatcher dialogue completion handler so the marker updates immediately.

---

### BUG-4: Key type mismatch — door unlock will never find work keys

**Severity:** Critical — key→door system is broken
**Files:** `engine/crate-system.js` (createChest fixedSlots), `engine/player.js` (hasItemType), `engine/floor-transition.js` (tryInteractBossDoor)

The work-keys item is created with `type: 'key_item'`. The door unlock system calls `Player.hasItemType('key')` which does an exact match: `bag[j].type === 'key'`. These will never match.

**Fix options (pick one):**

A. Change the work-keys item type to `'key'` in the fixedSlots definition (game.js _onFloorArrive):
```javascript
item: { name: 'Work Keys', emoji: '🗝️', type: 'key', subtype: 'work_keys' }
```

B. Change `Player.hasItemType()` to do a prefix/contains match. This is riskier — it would match `'key_ring'`, `'key_fragment'`, etc. Probably fine for this game but not the cleanest.

**Recommendation:** Option A. Keep exact match semantics, fix the data.

---

### BUG-5: Floor 0 horizon rendering — far wall doesn't render

**Severity:** Low — cosmetic, not blocking playtest
**File:** Raycaster DDA / fog system

The door wall on Floor 0 is far enough away that it falls outside the draw distance or N-layer limit. The horizon bar renders instead, which looks goofy.

**Future fix (not for this sprint):** Add a fog/mist plane on the last renderable DDA tile that fades vertically (opaque at floor, transparent at sky). This masks the draw distance cutoff while preserving the sky above. Document as a Phase F visual polish task.

---

### BUG-6: Minimap still points to gone chest after depletion

**Severity:** Medium — confusing but non-blocking
**File:** `engine/game.js` (_updateQuestTarget)

After the chest tile is removed from the grid (depleted), `_updateQuestTarget()` still points at (19,3). The fix for BUG-3 partially addresses this — once `_gateUnlocked = true`, the quest target switches to Phase 2 (head to dungeon). But there's a timing gap: the key is withdrawn → `_onPickupWorkKeys()` fires → `_gateUnlocked = true` → but `_updateQuestTarget()` isn't called again until the next floor transition.

**Fix:** Call `_updateQuestTarget()` inside `_onPickupWorkKeys()` immediately after setting `_gateUnlocked = true`.

> **Extraction note:** `_onPickupWorkKeys()` was extracted from `game.js` to `engine/home-events.js` as `HomeEvents.onPickupWorkKeys()`.

---

## Edge Case: Infinite work-keys on re-enter home

**Status:** Already guarded.

The chest container scan in `_onFloorArrive()` checks `!CrateSystem.hasContainer(cx, cy, floorId)` before creating. CrateSystem containers persist in memory across floor transitions (`clearFloor()` is never called on Floor 1.6). Once the container is created, re-entering home finds the existing container and skips creation. Once the key slot is withdrawn, it stays empty.

Additional guard: the `!_gateUnlocked` condition on the fixedSlots branch means that even if the container were somehow destroyed, re-entering home after key pickup would create a generic chest (random loot) instead of a work-keys chest.

---

## Side Quest Concept: "Boss Visit" House Cleaning

**Concept:** A timed cleaning challenge set in the home (Floor 1.6).

The boss announces they're coming to inspect your living quarters. You have 30 minutes (real or game-time) to clean, organize, and restock your home. This reuses the existing cleaning circuit (CleaningSystem blood scrubbing, CrateSystem restocking, torch relighting) in a controlled home environment.

**Why this is jam-viable:**
- All core systems already exist (cleaning, restocking, torches, readiness calculation)
- Home floor is hand-authored (no procedural gen needed)
- Timer + readiness threshold = simple win condition
- NPC bark system already handles atmospheric pressure ("Boss arrives in 10 minutes!")
- Compact scope: one floor, known layout, existing mechanics

**Encapsulation for triage submittal:**
1. New module: `engine/boss-visit.js` (~150 lines)
   - `start()`: Seeds mess (blood, empty crates, dead torches) across Floor 1.6
   - `update(dt)`: Countdown timer, periodic boss barks
   - `evaluate()`: Check readiness threshold across cleaning/crate/torch systems
   - `end()`: Grade (A/B/C/F), reward payout, boss dialogue
2. Trigger: Mailbox letter on Day 3+ ("Inspection tomorrow!")
3. Activation: Sleep → wake up → boss visit active
4. Win condition: Home readiness ≥ 80% when timer expires
5. Reward: Gold bonus + unlocks a cosmetic or tool upgrade

**Dependencies:** CleaningSystem, CrateSystem, TorchState, WorkOrderSystem (for readiness calc), BarkLibrary, Timer/Clock system.

---

## Fix Priority Order / Resolution Status

1. **BUG-2** — ✅ FIXED: Legacy openChest fallback removed. `return` after PeekSlots.tryOpen(), no CombatBridge fallback.
2. **BUG-1** — ✅ FIXED: CrateUI gains `handleClick(px, py)` with `_slotRects` hit-test. Pointer click wired in game.js. Stash containers get full grid with click-to-withdraw.
3. **BUG-4** — ✅ FIXED: Work-keys item type changed to `'key'` (was `'key_item'`). `Player.hasItemType('key')` exact match now finds it.
4. **BUG-3** — ✅ FIXED: 3-phase quest system. Phase 0: dispatcher. Phase 1: keys. Phase 2: dungeon. `_updateQuestTarget()` called in dispatcher callback.
5. **BUG-6** — ✅ FIXED: `_updateQuestTarget()` called inside `_onPickupWorkKeys()` after `_gateUnlocked = true`.
6. **BUG-5** — Deferred (horizon fog — cosmetic, Phase F visual polish)

---

## Post-Fix Architecture (Apr 3)

### Depth-based chest behavior contract
- Surface (depth 1): 1-5 slots, withdraw-only, no refill demand
- Interior (depth 2): 8-12 slots, withdraw-only, persistent furniture
- Dungeon (depth 3+): 1-5 slots, refill demand (cleaning circuit), DragDrop zones active
- Stash (home): 256 slots, scrollable 8-column grid, never depletes

### PeekSlots chest-awareness
- DragDrop deposit zones only register for `demandRefill === true` containers
- Seal flow blocked for all CHEST types (seal is crate/corpse mechanic)
- S key ignored for chests in PeekSlots.handleKey()

### CrateUI stash grid
- 8-column grid with GRID_VIS_ROWS (4) visible rows
- Arrow keys + PageUp/Down for smooth scrolling
- Click-only withdrawal (no number keys for stash — too many slots)
- Filled/empty item count in title bar, scrollbar thumb on right edge

### Toast repositioning
- Notifications center-anchored below freelook ring (was top-right under minimap)
- Position: `vpH/2 + RING_FRAC * min(vpW,vpH) + 10px`, centered horizontally

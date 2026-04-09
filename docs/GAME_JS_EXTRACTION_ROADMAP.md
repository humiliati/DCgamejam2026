# game.js Extraction Roadmap

> **Status:** Complete — game.js is **5,075 lines** (down from 7,592).
> 2,517 lines extracted across 13 IIFE modules in 3 phases.
>
> **Phase 1** (6 modules, ~490 lines): game-actions.js, week-strip.js,
> equip-actions.js, quick-fill.js, deck-actions.js, incinerator.js
>
> **Phase 2** (4 modules, ~787 lines): pickup-actions.js, shop-actions.js,
> home-events.js, hero-wake.js
>
> **Phase 3** (3 modules, ~1,103 lines): corpse-actions.js,
> dispatcher-choreography.js, quest-waypoint.js
>
> EX-14 (_onFloorArrive slimming) deferred — it's already a thin
> orchestrator calling global modules + delegation stubs. Further
> extraction yields diminishing returns.

## Extraction cost model

Every function inside game.js lives in a single IIFE closure. Extraction cost
is determined by how many *internal* closures it touches — local variables and
functions that only exist inside that IIFE. References to global modules
(FloorManager, CrateSystem, Toast, etc.) are free.

| Rating | Internal closure deps | Effort |
|--------|----------------------|--------|
| EASY   | 0–2                  | Drop-in: copy out, expose via module, replace call sites |
| MEDIUM | 3–5                  | Needs a thin callback/config object passed at init        |
| HARD   | 6+                   | Requires refactoring shared state into its own module     |

---

## Shared closure interfaces

These internal symbols appear across 3+ extraction candidates. Exposing them
as a tiny shared-state module (or passing them at init) unlocks the most
extractions for the lowest cost.

| Symbol | Used by | Notes |
|--------|---------|-------|
| `_refreshPanels()` | Shop, Equip, Incinerator, Deck, Corpse | Calls HUD.refresh + MenuFaces.refresh — 3 lines |
| `_canvas` | Shop, Equip, Corpse, Home, ParticleFX spawn calls | DOM ref, trivially passed |
| `_applyPickup()` | Breakable Smash, Detritus Pickup | Bag-add + HUD update — ~60 lines |
| `_collapseAllPeeks()` | Vendor dialog, Corpse, Floor arrive | Calls .close() on all peek modules — ~15 lines |
| `_gateUnlocked` | Floor arrive, Home, Quest waypoint, Dispatcher | Boolean flag, read in 4 blocks, mutated in 1 |
| `_pendingMenuContext` | Vendor dialog, Corpse, Shop flow | String state for pause-menu routing |

**Recommendation:** Extract `_refreshPanels`, `_collapseAllPeeks`, and
`_applyPickup` into a small `engine/game-actions.js` helper module first.
This drops 3+ blocks from MEDIUM to EASY.

---

## Phase 1 — Easy wins (0–2 internal deps, ~490 lines saved)

These can be extracted as-is with minimal wiring. Do them first.

### EX-1: Equip / Unequip / Stash → `engine/equip-actions.js`
- **Lines:** 6550–6655 (~105 lines)
- **Functions:** `_equipFromBag`, `_unequipSlot`, `_bagToStash`, `_stashToBag`
- **Deps:** `_refreshPanels()`, `_canvas` — both resolved by game-actions.js
- **Consumers:** MenuFaces button callbacks (pass module functions at menu init)

### EX-2: Week-Strip / Day Counter → `engine/week-strip.js`
- **Lines:** 4454–4750 (~292 lines)
- **Functions:** `_initDayCounter`, `_buildHeroDayMap`, `_updateDayCounter`
- **Deps:** `_dayCounterEl` (DOM ref, created internally), constants (`_WEEK_DAYS`, `_DUNGEON_SUITS`, `_GROUP_SUITS`)
- **Notes:** Entirely self-contained display logic. Zero game-state mutation. Cleanest extraction in the file.

### EX-3: Quick-Fill Crate → `engine/quick-fill.js`
- **Lines:** 5785–5849 (~62 lines)
- **Functions:** `_quickFillCrate`
- **Deps:** 0–1 (all CrateSystem/CardAuthority calls are global)
- **Consumers:** game.js BREAKABLE interact path — replace with `QuickFill.fill(fx, fy, floorId)`

### EX-4: Bonfire Warp → fold into existing module
- **Lines:** 6659–6676 (~17 lines)
- **Functions:** `_warpToFloor`
- **Deps:** 0 — pure delegation to FloorTransition + ScreenManager
- **Notes:** Too small for its own file. Fold into `engine/bonfire-sprites.js` as `BonfireSprites.warp()` or a new `engine/bonfire-warp.js`.

### EX-5: Incinerator → `engine/incinerator.js`
- **Lines:** 6680–6710 (~29 lines)
- **Functions:** `_incinerateFromFocus`
- **Deps:** `_refreshPanels()` — resolved by game-actions.js

### EX-6: Deck Management → `engine/deck-actions.js`
- **Lines:** 6713–6760 (~45 lines)
- **Functions:** `_handToBackup`, `_backupToHand`
- **Deps:** `_refreshPanels()` — resolved by game-actions.js

**Phase 1 total: ~490 lines removed from game.js → ~7,100 remaining**

---

## Phase 2 — Medium extractions (3–5 deps, ~750 lines saved)

Each needs a small config/callback object passed at init or per-call.

### EX-7: Breakable Smash + Detritus Pickup → `engine/pickup-actions.js`
- **Lines:** 5849–5965 (~112 lines combined)
- **Functions:** `_smashBreakable`, `_collectDetritus`
- **Deps:** `_applyPickup()`, `MC` (MovementController ref)
- **Pattern:** Extract `_applyPickup` into game-actions.js first, then these two lift cleanly.

### EX-8: Shop Buy/Sell → `engine/shop-actions.js`
- **Lines:** 6375–6550 (~173 lines)
- **Functions:** `_shopBuy`, `_shopBuySupply`, `_shopSellFromHand`, `_shopSellPart`
- **Deps:** `_refreshPanels()`, `_canvas`
- **Notes:** Actually EASY once game-actions.js exists. Grouped here because Shop.js already exists — these are the buy/sell *transaction handlers* that bridge Shop UI ↔ CardAuthority.

### EX-9: Home Arrival / Overnight Hero Run → `engine/home-events.js`
- **Lines:** 4196–4460 (~250 lines)
- **Functions:** `_onArriveHome`, `_onPickupWorkKeys`, `_executeOvernightHeroRun`, `_doHomeDoorRest`, `_countTilesOfType`
- **Deps:** `_gateUnlocked` (read + write), `_dispatcherSpawnId` (const), `_canvas`
- **Pattern:** Pass `{ isGateUnlocked, setGateUnlocked, canvas }` at init.

### EX-10: Hero Wake Cinematic → `engine/hero-wake.js`
- **Lines:** 3472–3670 (~197 lines, includes Wounded Warden)
- **Functions:** `_onArriveHeroWake`, `_spawnWoundedWarden`
- **Deps:** `_heroWakeState` (complex object), `_previousFloorId`
- **Pattern:** Own the state object internally; game.js passes `previousFloorId` per-call.

**Phase 2 total: ~750 lines removed → ~6,350 remaining**

---

## Phase 3 — Hard extractions (6+ deps, ~925 lines saved)

These touch enough shared state that they need architectural prep work.

### EX-11: Corpse Harvest / Restock Menu → `engine/corpse-actions.js`
- **Lines:** 6048–6375 (~325 lines)
- **Functions:** `_harvestCorpse`, `_openCorpseMenu`, `_corpseDepositBagItem`, `_corpseDepositHandCard`, `_corpseSeal`, `_takeHarvestItem`
- **Deps:** `_corpsePendingX/Y/Floor` (3 state vars), `_pendingMenuContext`, `_collapseAllPeeks`, `_refreshPanels`, `_canvas`
- **Prereqs:** game-actions.js (for _refreshPanels, _collapseAllPeeks, _canvas). State vars can be owned internally.

### EX-12: Quest Waypoint → `engine/quest-waypoint.js`
- **Lines:** 4846–5180 (~332 lines)
- **Functions:** `_findDoorTo`, `_findProgressionDoorForward`, `_floorDepth`, `_evaluateCursorFxGating`, `_findCurrentDoorExit`, `_findTruckAnchorOnFloor`, `_commitQuestTarget`, `_updateQuestTarget`
- **Deps:** `_gateUnlocked`, `_dispatcherEntity`, `_dispatcherPhase`, `_lastQuestTarget`, `_EXTERIOR_CHAIN`
- **Prereqs:** Dispatcher state exposed or passed. `_floorDepth` is a pure utility — extract to a shared helper.

### EX-13: Dispatcher Choreography → `engine/dispatcher-choreography.js`
- **Lines:** 3682–4037 + state vars at 70–79 (~355+ lines)
- **Functions:** `_onArrivePromenade`, `_spawnDispatcherGate`, `_findGateDoorPos`, `_findSpawnBehind`, `_tickDispatcherChoreography`, `_showDispatcherGateDialog`
- **Deps:** 7–10 internal closure refs including `_gateUnlocked`, `_changeState`, 6 state vars, `MC`
- **Prereqs:** Needs `_gateUnlocked` exposed via game-actions.js. `_changeState` can be passed as callback. Most complex extraction in the file.

### EX-14: Floor Arrival Hooks → refactor `_onFloorArrive`
- **Lines:** 3213–3460 (~237 lines)
- **Functions:** `_onFloorArrive` (monolithic orchestrator)
- **Deps:** `_gateUnlocked`, `_previousFloorId`, `_ambientBarkTimer`, `_refreshPanels`
- **Notes:** This is an orchestration function — it delegates to 15+ global modules. After Phases 1–2, many of its sub-calls will already be in extracted modules. The remaining body becomes a thin dispatcher that can stay in game.js (~80 lines) or become an event-bus pattern.

**Phase 3 total: ~925 lines removed → ~5,425 remaining**

---

## Shared helper: `engine/game-actions.js` (extract first)

Before Phase 1, extract these three high-reuse closures into a small IIFE
module (~80 lines) that other extracted modules can depend on:

```
GameActions.refreshPanels()     — HUD + MenuFaces refresh
GameActions.collapseAllPeeks()  — close all peek overlays
GameActions.applyPickup(item)   — bag-add + HUD + toast
GameActions.getCanvas()         — DOM canvas ref
GameActions.isGateUnlocked()    — gate state reader
GameActions.setGateUnlocked(v)  — gate state writer
```

game.js calls `GameActions.init({ canvas, ... })` once during `_initGameplay`.
All extracted modules call `GameActions.*` instead of closed-over functions.

---

## Execution order

```
0. game-actions.js       (shared helpers — unlocks everything)
1. week-strip.js         (EX-2, 292 lines, zero game deps)
2. equip-actions.js      (EX-1, 105 lines)
3. quick-fill.js         (EX-3, 62 lines)
4. incinerator.js        (EX-5, 29 lines)
5. deck-actions.js       (EX-6, 45 lines)
6. bonfire warp fold-in  (EX-4, 17 lines)
   ── Phase 1 complete: ~490 lines saved ──
7. pickup-actions.js     (EX-7, 112 lines)
8. shop-actions.js       (EX-8, 173 lines)
9. home-events.js        (EX-9, 250 lines)
10. hero-wake.js         (EX-10, 197 lines)
    ── Phase 2 complete: ~1,240 lines saved total ──
11. corpse-actions.js    (EX-11, 325 lines)
12. quest-waypoint.js    (EX-12, 332 lines)
13. dispatcher.js        (EX-13, 355 lines)
14. _onFloorArrive slim  (EX-14, ~150 lines removed)
    ── Phase 3 complete: ~2,165 lines saved total ──
```

**Projected final game.js size: ~5,425 lines** (further reducible as
_interact and _render slim down from extracted call targets).

---

## Rules

1. Every extracted module is a Layer-2 IIFE with `typeof` guards — no hard deps.
2. game.js retains `_tick`, `_render`, `_interact`, `_onScreenChange`, and
   the public Game API. These are the irreducible core.
3. Extracted modules expose a flat public API on `window.*` — no nested
   namespaces.
4. Script load order in index.html: `game-actions.js` before all extracted
   modules, all extracted modules before `game.js`.
5. Each extraction is a single commit with a syntax-check gate.

---

---

## Post-jam P3 extraction assessment (2026-04-07)

game.js is currently 5,306 lines. Remaining large blocks:

| Block | Lines | Closure deps | Risk | Priority |
|---|---|---|---|---|
| NPC dialogue trees (1422–3035) | 1,614 | 0 — pure data objects | LOW | **P1 — extract** |
| _interact (3860–4460) | 601 | 8+ state vars, peek chain | HIGH | Skip |
| Render + sprites (4632–5230) | 599 | _canvas, sprite registry | MED | Defer |
| Input bindings (304–775) | 472 | ESC chain, peek intercepts | HIGH | Skip |

**Recommendation:** Extract NPC dialogue trees → `engine/npc-dialogue-trees.js`.
This is 1,614 lines of pure dialogue tree data with zero closure deps, zero
logic, zero game state mutation. The function `_registerNpcDialogueTrees()`
calls `NpcSystem.registerDialogue(id, tree)` for each NPC. The tree objects
reference global modules (Player, CardAuthority, Shop) via typeof guards
that are already in place. Drop-in extraction — move the function, call it
from game.js init.

**Projected result:** game.js drops to ~3,692 lines (30% reduction).

*Created: 2026-04-06 — SC-G session*
*Cross-ref: SPATIAL_CONTRACTS.md, UNIFIED_RESTOCK_SURFACE_ROADMAP.md*

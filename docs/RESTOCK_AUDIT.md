# Comprehensive Audit: Restock/Maintenance Interactions in DungeonGleaner

**Original Audit Date:** 2026-04-06
**Last Updated:** 2026-04-06 (post RS-1–RS-5, combat-safety fix, vendor dialog cleanup)
**Scope:** All peek modules managing inventory & container interaction, plus vendor shop flow
**Files Reviewed:** 10 peek modules, peek-slots bridge, restock-bridge, restock-surface, restock-wheel, supply-rows, crate-system, crate-ui, vendor-dialog, merchant-peek, menu-faces core

---

## Executive Summary

The dungeon crawler has **10 restock/maintenance interaction types** (9 original + vendor/shop) distributed across distinct UI layers. The Unified Restock Surface (RS-1–RS-5, completed 2026-04-06) consolidated the three deposit interactions — crate, torch, and corpse — into a shared RestockBridge → RestockSurface → RestockWheel pipeline with SupplyRows, replacing the old CrateUI canvas path for deposit mode. Chest deposit is partially wired (CrateSystem lifecycle exists, PeekSlots routing exists) but blocked at RestockBridge — planned for activation under the Work Order system (see `CHEST_RESTOCK_AND_WORK_ORDERS.md`).

The original audit's largest concern — MenuBox face context confusion and DragDrop zone timing — is resolved for the three deposit types. Remaining UX inconsistencies are concentrated in the non-deposit peeks (puzzle, bookshelf, bar counter, bed) which are autonomous overlays with no shared framework.

---

## Interaction Status Map

### Unified Restock Surface (RS-1–RS-5 COMPLETE)

These three interactions now share a common UI: RestockSurface (z-19 DOM overlay) with RestockWheel (left half, slot rendering) and SupplyRows (right half, available items). All route through RestockBridge for mode detection and face-turn tracking.

#### 1. CRATE (Breakable Tiles) — ✅ UNIFIED

| Category | Detail |
|----------|--------|
| **Tile Type** | `TILES.BREAKABLE` |
| **Peek Module** | `crate-peek.js` → delegates to RestockBridge |
| **Restock Surface Mode** | `'crate'` |
| **Interaction Flow** | ① Player faces breakable → CratePeek BoxAnim (400ms debounce) ② [Smash] button → game.js interact → RestockBridge.open(x,y,floorId,'crate') ③ RestockSurface opens: RestockWheel renders slots (left), SupplyRows shows bag items (right) ④ Player presses 1–5 or drags to fill slots ⑤ All filled → [S] seals, triggerSealVFX() celebration ⑥ Face-turn detection: turn away → 300ms debounce → auto-close; walk away → immediate close |
| **Backdrop** | BoxAnim 'crate' variant, 25% opacity, 0.55x scale |
| **Footer** | Per-slot number key labels via RestockWheel.getSlotLabels(), 48px min-height buttons for Magic Remote |

**Resolved issues**: MenuBox ambiguity eliminated (RestockSurface is explicit DOM overlay). DragDrop zone timing fixed (RestockWheel registers on mount). Bag visibility provided by SupplyRows. Seal celebration persists until player turns away (no forced 1.2s auto-dismiss). Number key labels visible in footer.

**Remaining issues**: CratePeek BoxAnim still renders independently before RestockSurface opens — two-step visual (box → surface) could be smoother.

---

#### 2. TORCH (Wall Torches) — ✅ UNIFIED

| Category | Detail |
|----------|--------|
| **Tile Type** | `TILES.TORCH_LIT` or `TILES.TORCH_UNLIT` |
| **Peek Module** | `torch-peek.js` → delegates to RestockBridge |
| **Restock Surface Mode** | `'torch'` |
| **Interaction Flow** | ① Player faces torch → TorchPeek debounce (350ms) ② RestockBridge.open(x,y,floorId,'torch') ③ RestockSurface opens with torch slot rendering ④ Hose extinguish path preserved as special-case |
| **Backdrop** | BoxAnim 'chest' variant (mapped from torch mode) |

**Resolved issues**: Bag visibility now provided by SupplyRows (player can see what they're holding). Slot UI is consistent with crate/corpse.

**Remaining issues**: Hose extinguish is still a special-case mechanic with no discoverable UI affordance. TorchPeek's original emoji slot indicators may still render briefly before RestockSurface takes over — needs verification.

---

#### 3. CORPSE (Fallen Creatures) — ✅ UNIFIED

| Category | Detail |
|----------|--------|
| **Tile Type** | `TILES.CORPSE` |
| **Peek Module** | `corpse-peek.js` → deposit path delegates to RestockBridge; harvest path uses legacy CorpseActions |
| **Restock Surface Mode** | `'corpse'` |
| **Interaction Flow** | ① Player faces corpse → CorpsePeek BoxAnim (350ms debounce) ② game.js checks RestockBridge.detectMode(): if 'corpse' (unsealed container) → RestockBridge.open() ③ If sealed/no container → legacy _openCorpseMenu() for harvest ④ Deposit path: RestockSurface opens, player fills slots, seals |
| **Backdrop** | BoxAnim 'chest' variant (mapped from corpse mode) |

**Resolved issues**: Mode routing is now explicit at the RestockBridge level — unsealed containers get deposit surface, sealed/missing get harvest menu. No more hidden state confusion inside a single peek module.

**Remaining issues**: Harvest vs deposit mode still not visually previewed before commit (coffin glow/color doesn't change). Sealed corpse checkmark visual still subtle.

---

### Planned for Unified Restock Surface

#### 4. CHEST (Treasure Chests) — 🔶 PARTIALLY WIRED, BLOCKED

| Category | Detail |
|----------|--------|
| **Current State** | Withdraw-only via PeekSlots → CrateUI (legacy canvas path) |
| **Tile Type** | `TILES.CHEST` |
| **Peek Module** | `chest-peek.js` |
| **What exists** | CrateSystem has `demandRefill: depth >= 3` on chest creation. Two-phase lifecycle (`loot → empty → restocked`) with `setPhase()` enforcing valid transitions. PeekSlots already routes `empty + demandRefill` chests to RestockBridge. |
| **What blocks it** | RestockBridge.detectMode() line 53: `"Chests are withdraw-only — not a restock interaction"` explicitly skips TYPE.CHEST. RestockWheel has no slot-specific item requirements. Chests can't seal (`canSeal` returns false for TYPE.CHEST). |
| **Planned activation** | `CHEST_RESTOCK_AND_WORK_ORDERS.md` Track C (C-1 through C-3, ~125 lines). Chest deposit becomes the primary target of the Work Order quest system. |

**Withdraw path** (current, stays): Player faces chest → BoxAnim → PeekSlots.tryOpen() → CrateUI opens in withdraw mode → player presses 1–5 to take items → chest depletes.

**Deposit path** (planned): Work order targets a depleted chest → `demandRefill` flipped → RestockBridge.detectMode() returns 'chest' → RestockSurface opens → player fills required items → seals → phase transitions to 'restocked' → work order completes.

---

### Vendor / Shop (Not a Peek — Dialogue Tree)

#### 10. VENDOR SHOP — ✅ FIXED (2026-04-06)

| Category | Detail |
|----------|--------|
| **Tile Type** | `TILES.SHOP` |
| **Modules** | `merchant-peek.js` (BoxAnim preview), `vendor-dialog.js` (dialogue tree), `shop.js` (card shop) |
| **Interaction Flow** | ① Player faces SHOP tile → MerchantPeek BoxAnim (350ms debounce) with faction-colored box, "Browse Wares" button, "Close" button ② Player interacts (Space/click) → game.js `_openVendorDialog()` → collapseAllPeeks() dismisses MerchantPeek → VendorDialog.open() pushes 3-choice dialogue tree to StatusBar: [Browse Wares] [Buy Supplies] [Leave] ③ "Browse Wares" → opens card shop via pause menu ④ "Buy Supplies" → inline supply purchase dialogue with per-item choices, multi-purchase loop ⑤ "Leave" → close, return to gameplay |

**Fixed issues (2026-04-06)**:

- MerchantPeek and VendorDialog no longer fight. `_openVendorDialog()` now calls `_collapseAllPeeks()` at entry, dismissing MerchantPeek before the dialogue tree opens.
- MerchantPeek.update() now bails out when `StatusBar.isDialogueActive()` is true, preventing the peek from re-showing over an active conversation after its 350ms debounce.
- "Sell All Junk" button removed from VendorDialog. The blind bulk-sell bypassed the shop UI and removed player agency. Selling happens through "Browse Wares" → shop interface. Dialogue tree is now a clean 3-choice: [Browse Wares] [Buy Supplies] [Leave].

**Remaining issues**: None critical. Rep tier-up ceremony fires on supply purchases. Card selling through the shop UI has its own rep tracking.

---

### Autonomous Peeks (No Shared Framework)

These interactions operate independently. They are not part of the restock pipeline and don't route through RestockBridge, PeekSlots, or CrateSystem. Each has its own overlay/dialogue implementation.

#### 5. PUZZLE (Sliding Tile Puzzle)

| Status | Unchanged since original audit |
|--------|-------------------------------|
| **Tile Type** | `TILES.PUZZLE` |
| **Module** | `puzzle-peek.js` |
| **UI** | Frosted DOM panel, autonomous |
| **Flow** | Face puzzle → 3×3 grid → slide tiles → 5+ moves enables reset → confirm → tile becomes EMPTY |

**Open issues**: "Disorganize" framing is thematic but unclear. 5-move threshold unexplained. No tooltip on tiles. Bespoke DOM overlay — future PeekShell candidate (see UNIFIED_RESTOCK_SURFACE_ROADMAP §8b).

---

#### 6. BOOKSHELF (Reading Books)

| Status | Unchanged since original audit |
|--------|-------------------------------|
| **Tile Type** | `TILES.BOOKSHELF` or `TILES.TERMINAL` |
| **Module** | `bookshelf-peek.js` |
| **UI** | DialogBox.show() |
| **Flow** | Face bookshelf → DialogBox opens → multi-page text → A/D to navigate → ESC to close |

**Open issues**: Multi-pane sharing with MailboxPeek undocumented. No visual distinction between bookshelf and terminal. Future PeekShell candidate.

---

#### 7. BAR COUNTER (Tavern Drinks)

| Status | Unchanged since original audit |
|--------|-------------------------------|
| **Tile Type** | `TILES.BAR_COUNTER` |
| **Module** | `bar-counter-peek.js` |
| **UI** | Toast billboard only |
| **Flow** | Face counter → Toast shows drink/effect/taps → OK to drink → effect applied → counter decrements |

**Open issues**: Speed boost is non-functional stub. Cleanse debuff action is vague. Biome-specific menus invisible to player. Minimal visual design — player might miss the interaction.

---

#### 8. BED (Sleep & Rest)

| Status | Unchanged since original audit |
|--------|-------------------------------|
| **Tile Type** | BED (hardcoded at Floor 1.6, position 2,2) |
| **Module** | `bed-peek.js` |
| **UI** | Bespoke overlay panel |
| **Flow** | Face bed → overlay with day counter + hero countdown → [F] to sleep → fade → advance time → heal → wake |

**Open issues**: Hardcoded location. WELL_RESTED condition unexplained. No advance hero-day warning (only same-day).

---

### 9. PEEK-SLOTS BRIDGE (Internal Orchestrator)

| Status | Role reduced — deposit interactions now bypass to RestockBridge |
|--------|--------------------------------------------------------------|
| **Module** | `peek-slots.js` |
| **Current role** | Routes by container type + chest lifecycle phase. Deposit-mode containers (crate, corpse, D3+ empty chests) delegate to RestockBridge. Withdraw-mode containers (loot-phase chests, stash chests) use legacy CrateUI path. Manages IDLE → FILLING → SEALED state transitions for both paths. |
| **trySeal()** | Prefers RestockSurface.triggerSealVFX() when surface is open, falls back to CrateUI.triggerSealVFX(). Tracks SessionStats.inc('containersSealed') and conditional SessionStats.inc('cratesSealed'). |

**Resolved issues**: DragDrop zone registration timing no longer a concern for deposit path (RestockWheel handles it). MenuBox ambiguity resolved (RestockSurface is the explicit overlay).

**Remaining role**: PeekSlots still orchestrates the chest withdraw path and the FILLING → SEALED state machine. When chest deposit activates (Work Order Track C), PeekSlots will route those chests to RestockBridge just like it already does for crates and corpses — the routing logic is already written at line 101–102.

---

## Summary Table: All 10 Interactions

| # | Interaction | Tile Type | Module | Pipeline | Status |
|---|-------------|-----------|--------|----------|--------|
| 1 | **Crate** | BREAKABLE | crate-peek.js | RestockBridge → RestockSurface | ✅ Unified |
| 2 | **Torch** | TORCH_LIT/UNLIT | torch-peek.js | RestockBridge → RestockSurface | ✅ Unified |
| 3 | **Corpse** | CORPSE | corpse-peek.js | RestockBridge → RestockSurface (deposit) / CorpseActions (harvest) | ✅ Unified |
| 4 | **Chest** | CHEST | chest-peek.js | PeekSlots → CrateUI (withdraw) / RestockBridge blocked (deposit) | 🔶 Planned |
| 5 | **Puzzle** | PUZZLE | puzzle-peek.js | Autonomous DOM panel | ⬜ Unchanged |
| 6 | **Bookshelf** | BOOKSHELF/TERMINAL | bookshelf-peek.js | DialogBox | ⬜ Unchanged |
| 7 | **Bar Counter** | BAR_COUNTER | bar-counter-peek.js | Toast billboard | ⬜ Unchanged |
| 8 | **Bed** | BED (hardcoded) | bed-peek.js | Autonomous overlay | ⬜ Unchanged |
| 9 | **Peek-Slots** | (internal) | peek-slots.js | Orchestrator / router | ✅ Updated |
| 10 | **Vendor** | SHOP | merchant-peek.js + vendor-dialog.js | MerchantPeek → VendorDialog → StatusBar | ✅ Fixed |

---

## Combat Safety (2026-04-06)

All peek/restock overlays now dismiss safely on state interrupts:

| Interrupt | Mechanism | Coverage |
|-----------|-----------|----------|
| **Combat entry** | `startCombat()` calls `GameActions.collapseAllPeeks()` before facing turn | RestockBridge, all peeks, CinematicCamera |
| **Pause / Inventory** | `_collapseAllPeeks()` before `ScreenManager.toPause()` | All peeks |
| **Vendor dialog** | `_collapseAllPeeks()` at start of `_openVendorDialog()` | MerchantPeek specifically |
| **Death rescue** | `_collapseAllPeeks()` before `FloorTransition.go()` | Both CombatBridge and HazardSystem paths |
| **Floor transition** | `GameActions.collapseAllPeeks()` in `FloorTransition.go()` (defense-in-depth) | All peeks |
| **MerchantPeek re-show guard** | `MerchantPeek.update()` bails when `StatusBar.isDialogueActive()` | Prevents peek re-appearing over dialogue |

`collapseAllPeeks()` order: RestockBridge + CinematicCamera first, then PeekSlots, TorchPeek, BookshelfPeek, CratePeek, CorpsePeek, MerchantPeek, PuzzlePeek.

---

## Resolved Issues from Original Audit

| Original Issue | Resolution |
|---------------|-----------|
| MenuBox face context confusion | Eliminated. RestockSurface is an explicit z-19 DOM overlay, not an implicit canvas hack. |
| DragDrop zone registration timing | Fixed. RestockWheel registers slot zones on mount. |
| Bag visibility inconsistency (crate/torch/corpse) | Fixed. SupplyRows provides consistent bag/supply context for all three deposit types. |
| Sealed state auto-dismiss after 1.2s | Fixed. RS-4 face-turn detection keeps surface open until player turns away (300ms debounce). |
| Number key labels not visible | Fixed. RS-4 added getSlotLabels() to footer hint line. |
| CratePeek "nothing apparently clickable" | Mitigated. CrateUI delegates to RestockBridge when available (RS-5 backward-compat wrapper). |
| TorchPeek no visible inventory context | Fixed. SupplyRows shows available items alongside torch slots. |
| CorpsePeek mode confusion | Improved. Deposit vs harvest routing is explicit at RestockBridge.detectMode() level. |
| SessionStats orphaned keys | Fixed. 11 missing keys added to reset(), 2 new keys added (slotsFilled, containersSealed). |
| Legacy CrateUI silent fills | Fixed. _fillFromBag() now captures result, shows Toast with coin amounts, plays audio. |
| MerchantPeek vs VendorDialog conflict | Fixed. collapseAllPeeks() at _openVendorDialog() entry + dialogue-active guard in MerchantPeek.update(). |
| VendorDialog "Sell All Junk" blind bulk-sell | Removed. Selling happens through shop UI where player reviews items. |

---

## Open Issues & Planned Work

### Remaining from Original Audit

- **ChestPeek withdraw path**: Still uses legacy CrateUI canvas. Semantic inversion (CrateUI opens but no deposit zones) persists for loot-phase chests. Will be addressed when chest deposit activates.
- **PuzzlePeek**: Bespoke DOM overlay. "Disorganize" framing unclear. Future PeekShell candidate.
- **BookshelfPeek**: DialogBox-based, inconsistent with peek framework. MailboxPeek multi-pane sharing undocumented. Future PeekShell candidate.
- **BarCounterPeek**: Minimal UI (Toast-only). Speed boost stub. Cleanse debuff vague.
- **BedPeek**: Hardcoded location. Bespoke overlay. WELL_RESTED condition unexplained.
- **Hose extinguish discoverability**: Special-case mechanic in TorchPeek with no UI affordance.

### Planned: Chest Deposit & Work Orders

See `CHEST_RESTOCK_AND_WORK_ORDERS.md` for full design. Summary:

- **Track C** (~125 lines): Wire RestockBridge 'chest' mode, per-chest demandRefill override, slot-specific item requirements, chest sealing. Prerequisite for any work orders.
- **Track W** (~1,300 lines, 7 phases): Work Order Registry evolving from dispatch contracts (Act 1) through faction missions (Act 2) to independent player-driven operations. Chest deposit becomes the primary quest verb.

### Planned: PeekShell

See UNIFIED_RESTOCK_SURFACE_ROADMAP §8b. A shared outer frame for autonomous peeks (puzzle, bookshelf, bar counter) to provide consistent chrome, close-button placement, and Magic Remote target sizing. ~4h estimate. Does NOT merge these peeks into the RestockSurface pipeline — they keep their own content rendering.

---

## File Paths

All under `engine/` in the project root:

| File | Role |
|------|------|
| `restock-bridge.js` | Mode detection, open/close routing, face-turn detection |
| `restock-surface.js` | Two-half DOM layout (wheel + supply rows), z-19 overlay |
| `restock-wheel.js` | Slot rendering, fill/seal logic, slot labels |
| `supply-rows.js` | Available items display, scroll arrows |
| `crate-system.js` | Container data model (crate/chest/corpse), slot fill/withdraw/seal |
| `crate-ui.js` | Legacy canvas path (backward-compat wrapper delegates to RestockBridge) |
| `peek-slots.js` | State machine orchestrator, routes deposit vs withdraw |
| `crate-peek.js` | BREAKABLE tile BoxAnim + action button |
| `torch-peek.js` | Torch tile BoxAnim + slot indicators |
| `corpse-peek.js` | CORPSE tile BoxAnim + harvest/restock routing |
| `chest-peek.js` | CHEST tile BoxAnim + withdraw UI |
| `puzzle-peek.js` | PUZZLE tile sliding grid |
| `bookshelf-peek.js` | BOOKSHELF/TERMINAL DialogBox reader |
| `bar-counter-peek.js` | BAR_COUNTER Toast-based drink UI |
| `bed-peek.js` | BED overlay (hardcoded home) |
| `merchant-peek.js` | SHOP tile BoxAnim preview |
| `vendor-dialog.js` | Vendor greeting + supply purchase dialogue tree |
| `game-actions.js` | collapseAllPeeks() — central peek dismissal |
| `combat-bridge.js` | startCombat() calls collapseAllPeeks() |
| `session-stats.js` | Stat tracking (11 orphaned keys fixed) |

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

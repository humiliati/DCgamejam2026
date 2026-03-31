# Debug Notes Screener

**Updated**: 2026-03-31 | **Status key**: ✅ Fixed | 🔧 In Progress | ❌ Open | 📋 Deferred

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

## DN-03: Debrief feed time redundant and doesn't update 📋

**Reported** (Figure 1): Time row in debrief feed is static/redundant with the weekly time indicator in HUD.

**EyesOnly reference**: Debrief feed has NO time display. Only resource rows with block character bars (█▒░).

**Status**: Deferred to inventory roadmap Phase 2. Remove time row entirely, match EyesOnly format.

**File**: `engine/debrief-feed.js`

---

## DN-04: Debrief feed contents illegibly small 📋

**Reported** (Figure 2): All debrief feed content too small to read.

**EyesOnly reference**: Uses container-query scaling `clamp(8px, 12cqh, 56px)`, block character bars with resource-colored text.

**Status**: Deferred to inventory roadmap Phase 2. Adopt clamp-style scaling based on container height.

**File**: `engine/debrief-feed.js`

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

## DN-07: All non-HUD menus/panels too small 📋

**Reported**: Pause menu, systems menu, inventories, shops, bonfires, puzzles — all render at tiny sizes. Hilariously small click targets.

**Current state**: MenuBox fills 70% viewport width × 80% viewport height (menu-box.js lines 414-416). Face renderers use hardcoded pixel sizes (equip slots 80×48px, bag slots 56px, hand slots 50×67.5px).

**Status**: Deferred to inventory roadmap Phase 3. Requires scaling up MenuBox dimensions and all Face renderer element sizes.

**Files**: `engine/menu-box.js`, `engine/menu-faces.js`

---

## DN-08: Dispatcher interaction broken ✅ (partial) / 🔧

**Reported** (Figure 4): Dispatcher turn-around doesn't grab player properly. No NPC dialogue or barks printing anywhere. "ok to talk" shows but NPC does nothing.

**Root cause found**: InteractPrompt checked `e.friendly` to show "Talk" prompt, but game.js `_interact()` required `e.talkable`. An NPC with `friendly: true` but `talkable: false` would show the prompt but clicking did nothing.

**Fix applied**: InteractPrompt now requires BOTH `e.friendly && e.talkable` before showing the prompt (interact-prompt.js line 153).

**Remaining work**: Verify dispatcher has `talkable: true` set. Verify dialogue tree / bark pool is registered for dispatcher NPC. The dispatcher gate bump path (game.js `_onBump` → `_showDispatcherGateDialog`) is separate from the general NPC interact path — need to confirm both work.

**Files changed**: `engine/interact-prompt.js`

---

## DN-09: Tooltip clickable hyperlinks for NPC dialogue 🔧

**Reported**: Need clickable hyperlinks in NPC dialogue. Dispatcher interaction should only be dismissible via dialogue choice hyperlinks: [Ok] [I have reason to believe the floor is unlocked] [Who are you, who am I?]

**Status**: Requires DialogBox to support clickable choice rendering. Currently DialogBox renders text but choice buttons may not be wired. Needs investigation into DialogBox.startConversation() choice callback chain.

**File**: `engine/dialog-box.js`, `engine/npc-system.js`

---

## DN-10: DECK button opens System menu instead of Inventory ❌

**Reported** (Figure 5): Clicking DECK button pulls up Face 3 (SYSTEM) instead of Face 2 (INVENTORY).

**Root cause**: `status-bar.js` line 145: `Game.requestPause('pause', 3)` — passes face index 3 instead of 2.

**Fix**: One-line change: `3` → `2`. Deferred to inventory roadmap Phase 1 (awaiting design decision sign-off).

**File**: `engine/status-bar.js`

---

## DN-11: Deck quantity denominator wrong ❌

**Reported** (Figure 5): Backup deck quantity display is broken.

**Root cause**: `status-bar.js` line 210-212 shows `handSize / deckSize` where `deckSize = CardSystem.getDeckSize()` returns `_deck.length` (remaining draw pile), not `_collection.length` (total owned cards). After drawing cards, denominator shrinks misleadingly.

**Fix**: Use `CardSystem.getCollection().length` for denominator. Deferred to inventory roadmap Phase 1.

**File**: `engine/status-bar.js`, `engine/card-system.js`

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

*Last reviewed: 2026-03-31 by audit session*

# FIX_CARD_DRAG_DROP.md — Card Drag-and-Drop Implementation

## Problem

Card drag-and-drop is the primary combat mechanic but isn't working from the user's perspective. Cards should be draggable to reorder in NCH (explore mode) and draggable to stack in combat. The code exists in `engine/card-fan.js` but doesn't produce visible results. Players cannot reorder their hand or create stacks.

## Root Cause Analysis

### PRIMARY BUG (Fixed 2026-04-02): DragDrop.registerZone drops critical properties

**The single root cause of "nothing responds to drag and drop":**

`DragDrop.registerZone(id, opts)` in `engine/drag-drop.js` only copied a fixed
whitelist of properties (`x, y, w, h, accepts, onDrop, onHover, onLeave, active`)
and silently dropped all other opts. Three critical properties were lost:

- **`dragPayload`** — function returning the drag source data. Without this,
  `_onPointerDown` checks `z.dragPayload` and finds `undefined`, so no drag
  session EVER starts from any inventory zone.
- **`onTap`** — tap callback for click-without-drag. Without this, tapping a
  slot to select/inspect does nothing.
- **`onDragCancel`** — cleanup callback when drag is rejected/cancelled.

MenuFaces (Face 2 inventory), QuickBar, and SlotWheel all pass these properties
in their `registerZone()` calls. DragDrop silently ate them. Every zone appeared
registered (visible in `DragDrop.getZoneIds()`) with correct bounds, but was
completely inert — no drags could originate, no taps could fire.

**Fix**: Added `dragPayload`, `onTap`, and `onDragCancel` to the property copy
in `registerZone()`.

### Secondary issues (pre-existing, lower priority)

1. **Pointer event coordinate transform** — CardFan binds pointer events to `_canvas` (the game canvas element passed in `init(canvas)`). The canvas receives raw pointer events but the coordinate transform from client→canvas space may be off depending on CSS scaling or canvas positioning. This causes hitTest to fail against the wrong coordinates.

2. **Drag dead zone too tight** — The drag system has a 4px dead zone (`DRAG_DEAD_ZONE = 4` in card-fan.js). At 2.5x explore scale, 4 canvas-pixels = ~1.6 CSS-pixels, which may be too tight and require excessive movement before drag activates.

3. **hitTest doesn't account for card rotation** — `hitTest()` uses simple axis-aligned bounding boxes (AABB) which don't account for card rotation. Cards are fanned at angles, so a rotated card's visual footprint doesn't match its axis-aligned box. The hit area is too small.

4. **Reorder mutates hand reference without callback** — Reorder works by splicing `_hand` array directly. `_hand` is a reference to CardSystem's hand. Need to verify CardSystem.getHand() returns a mutable reference or if it requires its own reorder API. External mutation may not trigger CardSystem state updates.

5. **No visual drag feedback during reorder** — Ghost element creation (`_showGhost()`) only activates for external drags (when pointer leaves the fan area upward). No visual feedback during normal card reorder drags within the fan — the card doesn't visually "lift" or follow the pointer.

6. **Silent stack failure on missing synergy tags** — In combat, `_handleDragToStack()` relies on `CardStack.canStack()` which checks shared synergy tags. If cards have no synergyTags at all, stacking fails silently with no feedback. Players don't understand why the stack didn't form.

7. **No inspection mode in combat** — `_handleTap()` in combat always tries to stack/unstack. There's no way to just "select" a card for inspection or read its effects without stacking it.

## Files to Modify

- `engine/card-fan.js` — pointer event handlers, hitTest collision, ghost feedback system, reorder logic
- `engine/card-stack.js` — canStack validation, synergy tag fallback logic
- `engine/game.js` — wiring check (ensure CardFan.init receives the correct canvas reference)

## Implementation Steps

### Step 1: Fix pointer coordinate transform
- In `card-fan.js` `init(canvas)`, compute and cache the canvas bounding rect and scale factor.
- In all pointer event handlers, convert `event.clientX/Y` to canvas-relative coordinates: `(clientX - rect.left) / scale`, `(clientY - rect.top) / scale`.
- Store the converted coordinates in `_pointerPos` and use those in hitTest.
- Verify that CSS `transform: scale(N)` on the canvas does not interfere. If it does, use `getBoundingClientRect()` to account for it.

### Step 2: Increase drag dead zone and hitTest hit area
- Change `DRAG_DEAD_ZONE = 4` to `DRAG_DEAD_ZONE = 8` to make drag activation easier.
- In `hitTest(px, py)`, instead of simple AABB collision, expand the hit box by 15% in all directions: `hitBox = { x: c.x - c.w/2 - padding, y: c.y - c.h/2 - padding, w: c.w + 2*padding, h: c.h + 2*padding }`.
- For optimal results, use oriented bounding box collision (OBB) that accounts for card rotation. At minimum, expand the AABB hit area.

### Step 3: Add visual drag feedback (ghost card)
- Add a `_dragGhost` object to track the dragged card state: `{ cardIdx, offsetX, offsetY, opacity }`.
- In `_handlePointerMove()`, when dragging is active within the fan, set `_dragGhost` to the dragged card's index.
- At the end of `render()`, if `_dragGhost` is set, draw the dragged card at the pointer position (offset by its center) with opacity 0.7 and a slight scale (1.05). Draw a semi-transparent gap/placeholder at the prospective drop slot.
- Update the drop position dynamically as the pointer moves. Use the fan angle to determine which card position the pointer is over.

### Step 4: Verify CardSystem hand mutation
- Check `engine/card-system.js` to see if `getHand()` returns a direct reference or a copy.
- If it returns a copy, add a `CardSystem.reorderHand(fromIdx, toIdx)` API that mutates the internal hand and triggers any necessary state updates.
- Update `_handlePointerUp()` reorder logic to call this API instead of directly splicing `_hand`.

### Step 5: Add synergy tag fallback and rejection feedback
- In `engine/card-stack.js` `canStack()`, modify the logic: if neither card has synergy tags, allow stacking by default (tutorial-friendly). Only reject if one card has tags and the other doesn't, or if they have no tags in common.
- In `_handleDragToStack()`, when a stack is rejected, trigger rejection feedback:
  - Play `AudioSystem.play("card-reject")` or a built-in reject sound.
  - Apply a shake animation to the dragged card: offset it ±5px horizontally for 200ms.
  - Show a tooltip/toast: "No shared tags" or "Incompatible cards".

### Step 6: Tap-to-inspect in combat mode
- Add an inspection mode state: `_inspectCardIdx = null`.
- Modify `_handleTap()`: if `_inspectCardIdx === idx`, toggle inspection (unselect). Otherwise, set `_inspectCardIdx = idx`.
- In inspection mode, render the inspected card larger (center screen) with its full text description and synergy tags highlighted.
- Dragging while inspecting cancels inspection and starts a drag.

### Step 7: Ensure canvas pointer-events
- Add CSS to the canvas element: `pointer-events: auto;` to ensure it receives pointer events even when DOM overlays (status bar, debrief dialog) are above it.
- Test that pointer events pass through overlays if needed, or adjust overlay z-index to be below the canvas.

## Acceptance Criteria

- **Reorder in explore mode**: Dragging a card from position 0 to position 2 visually lifts the card, shows a gap at the drop target, and updates the hand order. The order persists if the fan is closed and reopened.
- **Visual drag feedback**: Dragged card follows the pointer with slight transparency. A placeholder shows the prospective drop position.
- **Stack creation in combat**: Dragging card A onto card B creates a stack (visible overlap + glow effect). The CombatBridge is notified and combat proceeds.
- **Stack firing**: Swipe-up on a stacked card calls `CombatBridge.fireStack()` and plays the combined card effects.
- **Incompatible stack rejection**: Attempting to stack incompatible cards shows a shake animation + rejection sound + brief toast message.
- **Stack un-stacking**: Tapping on a stacked card un-stacks it (moves cards back to separate hand slots).
- **Inspection mode**: In combat, tapping a card (without dragging) selects it for inspection. A larger view shows all card details. Dragging while inspecting cancels inspection.
- **No crashes**: Drag operations don't crash when cards have missing or null properties.


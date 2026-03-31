# FIX_CARD_FAN_POSITION.md — Card Fan Visibility at Scaled Size

## Problem

Despite reducing `BASE_PIVOT_Y` from 60 to 20, cards are still buried at the bottom when the NCH overlay opens the card fan. Most of the card body (height ~200px at 2.5x scale) is below the visible viewport edge. Only the top 40-50 pixels of each card are visible above the status bar, making cards unreadable and uninteractable.

## Root Cause Analysis

The card fan layout uses a pivot-point-based arc system where cards are positioned on a circular arc below the screen viewport. At large scales (2.5x in explore mode), this geometry breaks:

1. **Pivot calculation compounds the problem**:
   - `PIVOT_Y_OFF = Math.floor(BASE_PIVOT_Y * modeScale)`
   - In explore mode: `PIVOT_Y_OFF = Math.floor(20 * 2.5) = 50`
   - This means the pivot is 50 pixels BELOW the viewport bottom (canvas.height = h).

2. **Pivot drives card positions**:
   - `_getCardPos()` calculates: `y = pivotY - Math.cos(c.angle) * radius`
   - Where: `pivotY = h + PIVOT_Y_OFF = h + 50`
   - And: `radius = PIVOT_Y_OFF + CARD_H * 0.3 = 50 + 60 = 110` (with CARD_H = 200)
   - For the center card (angle = 0): `y = (h+50) - cos(0)*110 = h+50-110 = h-60`
   - Card height is 200px. Center at y=h-60 means bottom edge at y=h-60+100 = h+40 — 40px BELOW viewport!

3. **Only partial card is visible**:
   - Card spans from y=h-160 to y=h+40.
   - Viewport is y=0 to y=h.
   - Only pixels from y=0 to y=h are drawn (top 160px of a 200px card). But the card CENTER is at h-60, so only ~60px above center (top 60+100=160px) are visible. Actually only top ~40px above viewport bottom are visible.
   - Status bar at viewport bottom (~40px tall) occludes the bottom visible portion of cards.

4. **COMBAT_LIFT helps in combat but not explore**:
   - In combat mode, `COMBAT_LIFT = 80` subtracts from PIVOT_Y_OFF, pushing pivot up.
   - Explore mode has no equivalent lift constant, so PIVOT_Y_OFF stays at 50, keeping pivot buried.

5. **Hover lift can push cards off-screen**:
   - When hovering a card, additional lift is applied, which can move the top of the card out of the viewport.

## Files to Modify

- `engine/card-fan.js` — `open()` method (layout initialization), `_getCardPos()` function, `BASE_PIVOT_Y` constant, and new `EXPLORE_LIFT` constant

## Implementation Steps

### Step 1: Add EXPLORE_LIFT constant
- Near the top of `card-fan.js`, add:
  ```javascript
  const EXPLORE_LIFT = 120; // Lifts cards in explore mode to be fully visible
  ```
- This constant mirrors `COMBAT_LIFT = 80` and provides upward displacement in non-combat contexts.

### Step 2: Decouple radius from PIVOT_Y_OFF
- The current design ties `radius` to `PIVOT_Y_OFF`, which creates instability when PIVOT_Y_OFF is negative.
- Add a separate arc radius constant:
  ```javascript
  const ARC_RADIUS = 110; // Fixed arc spread, independent of PIVOT_Y_OFF
  ```
- Or compute it safely: `const radius = Math.max(CARD_H * 0.6, Math.abs(PIVOT_Y_OFF) + CARD_H * 0.3);`

### Step 3: Update PIVOT_Y_OFF calculation in open()
- Change the pivot offset calculation to include lift:
  ```javascript
  const lift = inCombat ? COMBAT_LIFT : EXPLORE_LIFT;
  PIVOT_Y_OFF = Math.floor(BASE_PIVOT_Y * modeScale) - lift;
  ```
- Example: Explore mode with 2.5x scale: `PIVOT_Y_OFF = Math.floor(20 * 2.5) - 120 = 50 - 120 = -70`
- A negative PIVOT_Y_OFF means the pivot point is 70px ABOVE the viewport bottom — this is correct and allows cards to sit fully above the viewport.

### Step 4: Ensure radius is valid
- Guard against negative radius (which would invert the arc):
  ```javascript
  const radius = Math.max(CARD_H * 0.6, Math.abs(PIVOT_Y_OFF) + CARD_H * 0.3);
  ```
- This ensures radius is always at least 60% of card height.

### Step 5: Recalculate pivot coordinates
- `pivotY = canvas.height + PIVOT_Y_OFF`
- With EXPLORE_LIFT=120 and PIVOT_Y_OFF=-70: `pivotY = h - 70` (above viewport bottom)
- Center card: `y = (h-70) - cos(0)*radius = h-70-radius`. With radius=110: `y = h-180`. Card spans h-280 to h-80. Bottom edge is 80px above viewport bottom (above status bar).

### Step 6: Tune EXPLORE_LIFT value
- Start with EXPLORE_LIFT = 120 and test in-game.
- Adjust so that the bottom edge of center cards sits ~20-30px above the status bar (which is typically 40px tall).
- If cards are too high (cut off at top), reduce EXPLORE_LIFT. If too low (overlapping status bar), increase it.
- The goal: full card body visible, no clipping, readable text.

### Step 7: Test hover lift doesn't overflow
- When a hovered card gets additional `hoverLift` applied (e.g., +20px upward), verify the top doesn't leave the viewport.
- If needed, clamp the maximum upward displacement: `const maxHoverY = Math.max(baseY - 50, 0);`

### Step 8: Verify at multiple scales
- Test layout at:
  - Explore mode (scale 2.5x) — full card visibility
  - Combat mode (scale 2.0x) — full card visibility with COMBAT_LIFT
  - Mobile/responsive scales if applicable

## Acceptance Criteria

- In explore mode (NCH card fan open), full card bodies are visible above the status bar. No cards are clipped at the top or bottom.
- Cards still form a proper fan arc (not a flat row). Angle-based positioning is maintained.
- In combat mode, cards are similarly visible and properly positioned with COMBAT_LIFT.
- Hover lift animation doesn't push cards off-screen (top edge stays in viewport).
- Status bar (40px tall at viewport bottom) does not occlude any card content.
- Card text (title, cost, effect description) is legible within the visible card area.
- Drag and drop hitTest coordinates align with visible card positions (no offset mismatches).
- Layout remains stable across frame renders (no flickering or position jumps).


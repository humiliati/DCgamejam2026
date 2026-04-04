# CrateUI Interaction Overhaul — Click/Drag Tableau

**Created**: 2026-04-04
**Goal**: Make the crate/corpse/chest fill interface feel like a tactile card game on a TV-sized touch surface. Every action must be clickable with the Magic Remote pointer. Keyboard shortcuts are accelerators, not the only path.

---

## Current State (problems)

1. **Bag is invisible during fill**: Player presses number keys blind — no way to see what items they have or choose which to deposit. Must pause → open inventory → close → resume fill to check bag contents.

2. **Seal requires 'S' key**: No click target. On Magic Remote, S is a movement key. Player must know an unlabeled keyboard shortcut to complete the core gameplay loop.

3. **No auto-seal or seal prompt**: When all slots are filled, nothing visually changes except slot backgrounds. No "you're done — seal it!" call to action.

4. **No hover details**: Empty slots show frame tag labels but no explanation of what they want. Filled slots show emoji but no item name/stats.

5. **No selection highlight**: Clicking a bag item doesn't preview where it can go. Player must trial-and-error drag onto slots.

6. **Seal moment is underwhelming**: Toast + coinBurst/coinRain exist but no screen-level flash, no camera shake, no "achievement unlocked" feel.

---

## Target Experience

### Layout (deposit mode — crate/corpse/dungeon chest)

```
┌─────────────────────────────────────────────────┐
│                  viewport                        │
│                                                  │
│         ┌──────────────────────────┐             │
│         │    CRATE SLOTS (1-5)     │             │
│         │  [slot][slot][slot]...   │             │
│         │  frame labels below      │             │
│         └──────────────────────────┘             │
│                                                  │
│         ┌──────────────────────────┐             │
│         │  [★ SEAL ★] button       │  ← appears  │
│         │  (or greyed if unfilled) │    when all  │
│         └──────────────────────────┘    filled    │
│                                                  │
│    ── YOUR BAG ──────────────────────────        │
│    [item][item][item]...[item]  (scrollable)     │
│    hover → tooltip  |  click → select+highlight  │
│    drag → ghost follows pointer → drop on slot   │
│                                                  │
│                          [NCH widget]            │
└─────────────────────────────────────────────────┘
```

### Layout (withdraw mode — surface/interior chest)

```
┌─────────────────────────────────────────────────┐
│         ┌──────────────────────────┐             │
│         │    CHEST SLOTS (1-5)     │             │
│         │  [item][item][item]...   │             │
│         │  click to take           │             │
│         └──────────────────────────┘             │
│                                                  │
│         [ESC] Close                              │
└─────────────────────────────────────────────────┘
```

No bag strip for withdraw — player is taking, not giving.

---

## Implementation Plan

### Phase 1: Clickable Seal Button (CRITICAL — do now)

**File**: `engine/crate-ui.js`

Add a canvas-rendered `[★ SEAL ★]` button below the slot row:
- **Position**: Centered below slots, `PANEL_Y_FRAC * vpH + SLOT_SIZE + 30px`
- **States**:
  - Hidden (chest mode — chests don't seal)
  - Disabled/dim (not all slots filled) — grey text, no pointer-events
  - Ready/glowing (all slots filled) — gold border, pulsing glow, `cursor:pointer`
- **Click handler**: Add to `handleClick()` — hit-test the seal button rect, call `PeekSlots.trySeal()` if all filled
- **Hover**: Gold border brightens, slight scale
- **Visual**: `"★ SEAL ★"` text, 14px bold monospace, inside rounded rect
- **Also renders**: `[ESC] Close` button (smaller, dimmer) to the right

**Removes**: S-key as the ONLY path. S still works as accelerator.

### Phase 2: Bag Strip (CRITICAL — do now)

**File**: `engine/crate-ui.js` (render) + `engine/peek-slots.js` (DragDrop zones)

Render a horizontal bag strip below the seal button:
- **Position**: `sealButtonY + 50px`
- **Slot size**: 44×44px, 8px gap
- **Content**: Each bag item renders as emoji in a bordered box
- **Max visible**: 12 (BAG_MAX), scrollable if needed
- **Empty slots**: Dim outline, no content
- **Label**: "YOUR BAG" header (10px monospace, dim)

**DragDrop integration** (in peek-slots.js):
- Register each bag slot as a DragDrop **source** zone with `dragPayload` returning `{ type:'item', zone:'bag', index:i, data:item, emoji:item.emoji, label:item.name }`
- Existing crate slot zones already have `accepts()` and `onDrop()` handlers
- Ghost follows pointer, drops onto crate slots

**Click-to-fill shortcut**:
- Click a bag item → if exactly one empty matching slot exists, auto-fill it
- If multiple empty slots match, highlight the matching slots (selection state) and wait for slot click

### Phase 3: Hover Tooltips (medium — do now if time)

**File**: `engine/crate-ui.js`

When pointer hovers over:
- **Bag item**: Show tooltip with `item.name`, `item.category`, match indicator (✓/✗ per slot)
- **Empty crate slot**: Show tooltip with frame label, "needs: [category]", and how many matching items are in bag
- **Filled crate slot**: Show item name + match status

Tooltip: Canvas-rendered, 180×60px dark panel with 2 lines of text, positioned above hovered element.

### Phase 4: Selection Highlighting (medium — do now if time)

**State**: `_selectedBagIdx = -1` in CrateUI

When player clicks a bag item:
1. Set `_selectedBagIdx = i`
2. Highlight the selected bag slot (bright gold border)
3. Highlight all empty crate slots that would accept this item (green border pulse)
4. Dim non-matching empty slots (darker)
5. Second click on a highlighted crate slot → auto-fill from selected bag item
6. Click elsewhere or ESC → deselect

### Phase 5: Seal Satisfaction VFX (easy CSS + ParticleFX calls)

When seal triggers (after `CrateSystem.seal()` returns):

1. **White flash** (200ms): Full-viewport white overlay, opacity 0→0.8→0 ease-out
2. **Gold flash** (400ms, 100ms delay): Viewport tinted gold `rgba(255,200,60,0.3)` fade
3. **Coin rain** (already wired via `ParticleFX.coinRain`)
4. **Seal text**: Large "★ SEALED ★" text, gold, scales up from 0.5→1.2→1.0 with bounce
5. **Panel lock**: Slots show golden borders, filled indicators glow
6. **SFX**: Already plays `pickup-success` — could add a second `seal-fanfare` if available
7. **Camera shake**: Small 3-frame wobble (if camera API available)

**Canvas implementation**: Render flash overlays in CrateUI.render() during `_sealFlash > 0` window. The existing `_sealFlash = 800` timer can drive the sequence.

---

## Priority for Jam Deadline

| Item | Impact | Effort | Do Now? |
|------|--------|--------|---------|
| Clickable SEAL button | Critical | Small | ✅ YES |
| Bag strip (canvas render) | Critical | Medium | ✅ YES |
| Bag DragDrop source zones | High | Medium | ✅ YES |
| Click bag item → auto-fill | High | Small | ✅ YES |
| [ESC] Close button on canvas | Medium | Small | ✅ YES |
| Seal VFX (white/gold flash) | Medium | Small | ✅ YES |
| Hover tooltips | Nice | Medium | ⚠️ If time |
| Selection highlighting | Nice | Medium | ⚠️ If time |
| Camera shake on seal | Polish | Small | ❌ Post-jam |

---

## Files Modified

| File | Changes |
|------|---------|
| `engine/crate-ui.js` | Seal button render + hit-test, bag strip render, close button, seal VFX flash, tooltip (stretch) |
| `engine/peek-slots.js` | Bag DragDrop source zone registration, bag strip zone bounds update |
| `engine/game.js` | Route pointer clicks to CrateUI.handleClick when PeekSlots.isFilling() |

# Face 2 (Inventory) — Polish & Debug Backlog

Status: **Documented for future iteration** (needs dedicated test harness).

## Current capabilities

Face 2 renders different content per MenuBox context:

| Context   | Content                          |
|-----------|----------------------------------|
| `pause`   | Full inventory (equip + bag + hand + deck) |
| `harvest` | Same full inventory              |
| `bonfire` | Bag viewer (stash transfer)      |
| `shop`    | Shop sell pane                   |

### Sections in full inventory layout

1. **Equipped** (3 slots) — weapon / consumable / key. Click to unequip via CardAuthority.
2. **Bag** (12 max) — items + card-in-bag slots. Scroll via chevrons L/R or Q/E. Click to equip via CardAuthority.
3. **Hand** (5 card slots) — active combat cards in CardAuthority.hand. Click to move to backup via CardTransfer.
4. **Deck** (30 max) — backup/collection cards in CardAuthority.backup. Click to move to hand via CardTransfer.
5. **Incinerator** (drop zone) — drag items/cards here via CardTransfer to destroy.

### DragDrop integration (via CardTransfer)

All slots are both drag sources and drop targets. CardTransfer validates all moves; DragDrop captures raw `pointerdown/move/up` on the canvas with a 4px dead zone. The `onTap` path (click without drag) triggers `_handleSlotTap()` for tap-to-select transfer via CardTransfer.

**Authority**: All mutations go through CardAuthority → CardTransfer for validation and rollback.

Known concern: DragDrop's `pointerdown` listener fires on the same canvas as MenuBox nav buttons. Currently mitigated by `wasRecentPointerSession(200)` guard, but event ordering is fragile.

## Known issues to investigate

### Layout / rendering

- [ ] Slot sizing doesn't scale well at very small viewport sizes (< 400px wide)
- [ ] Card rarity border colors need contrast audit (dark backgrounds eat some colors)
- [ ] No tooltip on hover — item/card details only visible via name truncation
- [ ] Deck scroll indicators (chevrons) share styling with bag — should differentiate
- [ ] Empty slots lack affordance — dashed borders are too faint at 0.08 alpha

### Interaction / feel

- [ ] Tap-to-select highlight ring (`_drawSelectionHighlights`) pulsing could be faster
- [ ] No confirmation before incinerator destroy — one tap/drop = gone
- [ ] Equip swap when bag is full now shows toast, but the toast text is small in the overlay
- [ ] Scroll wheel support missing — only chevron clicks and Q/E
- [ ] Focus ring (`_invFocus`) for keyboard navigation: bag vs deck toggle needs clearer affordance
- [ ] Card-in-bag purple glow (0.12 alpha) may be too subtle

### DragDrop conflicts

- [ ] Drag ghost rendering overlaps with MenuBox face border — z-order issue
- [ ] Dropping an item while face is mid-snap-rotation could target wrong slot (layout moves during animation)
- [ ] Long-press threshold (300ms) may fight with MenuBox pointer click for nav arrows
- [ ] `_syncDragZoneBounds()` runs every render frame — verify no stale zone data during face transitions

### Stash / shop contexts

- [ ] Bonfire stash: slot count hardcoded, should reflect actual stash capacity
- [ ] Shop sell: no visual indication of sell price before committing
- [ ] Stash transfer animation is instant — should have brief slide or fade

## Test harness requirements

Face 2 needs its own isolated test page (`test/face2-test.html`) with:

1. Mock Player state (configurable bag size, equipped items, card hand/deck)
2. Mock CardSystem with sample cards of each rarity
3. Mock DragDrop with event logging
4. Viewport resize controls (test responsive layout)
5. Action log panel showing every hit zone click, drag start/drop, and slot mutation
6. Reset button to return to initial state

This allows rapid iteration without booting the full game loop.

## Priority order (suggested)

1. Incinerator confirmation (data loss risk)
2. DragDrop/nav button event conflict resolution
3. Tooltip on hover (item details)
4. Scroll wheel support
5. Layout scaling at small viewports
6. Stash/shop context polish

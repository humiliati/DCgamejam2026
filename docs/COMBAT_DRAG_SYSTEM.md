# Combat Drag System Design

## Overview

The combat card system uses drag-and-drop as the primary interaction method for card management, stacking, and firing. It draws from the Gone-Rogue pattern (EyesOnly splash-screen.js) with combat-specific extensions.

## Hand Fan Component

### Maximized Mode (Explore)
When the player clicks the NchWidget capsule, CardFan opens in **maximized mode**:
- Dark gradient backdrop covers bottom ~35% of the viewport canvas
- DOM elements (status-bar, quick-bar) fade to 15% opacity
- A round **minimize button** (▼) appears at z-index 20 near the backdrop edge
- Cards render at 2.5x base size (EXPLORE_SCALE) for easy inspection
- Clicking the minimize button closes the fan and restores all DOM elements

### Combat Mode
During combat, CardFan opens at 2.0x base size (COMBAT_SCALE) with 30px additional upward shift. The NchWidget goes to minimized combat capsule mode (opacity 0.3, non-interactive).

## Drag Interactions

### Reorder (Explore + Combat)
- Pointer-down on a card → 4px dead zone → drag starts
- Ghost card follows pointer with slight tilt
- Dropping on another card's position swaps their order in the hand array
- Audio: `card-snap`

### Stack Building (Combat Only)
- Drag card onto another card → creates 2-card stack (if shared synergy tags)
- Drag card onto existing stack → adds to stack (if compatible)
- Tap a card → adds to current stack / starts new stack
- Tap a stacked card → un-stacks it
- Stacked cards render with golden border, numbered badges, and glow background
- **Envelope highlights**: During drag, valid stacking partners show pulsing green dashed borders

### Stack Rejection
- Dropping on an incompatible card → `card-reject` audio, no stack created
- Red indicator bar shows on ghost card when hovering incompatible target

## Stack Firing

### Swipe-to-Fire Gesture
- Swipe card/stack upward (velocity > 0.3 px/ms, distance > 30px)
- Gesture velocity maps to thrust multiplier via ease-out curve
- **Base thrust cap: 1.05x** (intentionally low — flashy crit numbers inflate perceived effect)
- Items can raise the cap via `CardStack.setThrustCap(bonus)` — endgame items enable up to 1.5x
- Audio: `card-fire`

### Fire Animation (Toss Sequence)
1. **Stagger launch**: Each card in the stack launches from its fan position with 80ms stagger
2. **Flight**: Cards fly upward to the enemy's screen region (~18% from top) over 250ms with ease-out deceleration and slight spin
3. **Flash**: At impact, cards flash in their suit's resource color (♠ grey, ♣ blue, ♦ green, ♥ pink) for 200ms
4. **Resolution split**:
   - **Persistent cards** (cost resource as ammo): Retract back to fan position over 300ms with ease-in acceleration
   - **One-use cards** (expendable): Dissolve (fade + shrink + drift upward) over 400ms

### Resolution Flow
```
Swipe up detected
  → startFireAnim(stackCards) — visual toss begins
  → CombatBridge.fireStack(thrust) — game logic resolves
    → CombatEngine.fireStack(stackEffects, player)
    → CardSystem.playStack(stack) — partitions expended vs retained
    → CombatFX choreography (fan slide away, enemy lunge, HUD flash)
    → CardFan.close() during resolution
    → NchWidget.updateCombat({ cards, selectedIdx: -1 })
```

## Draw Mechanic

### Per-Turn Draw
Each combat round (stacking phase entry), the player can draw 1 card from the deck if `CombatEngine.canDraw()` returns true.

### Overflow Cascade (drawWithOverflow)
When drawing a card and the hand is full (5 cards):
1. **Bump**: Last card in hand (rightmost) → pushed to deck (collection)
2. **Overflow**: If deck is also at capacity → bumped card is incinerated
3. **Draw**: New card drawn from deck into the freed hand slot

Toast feedback:
- Draw: `📥 Drew [emoji] [name]`
- Bump: `[name] → deck (hand full)` (info)
- Incinerate: `🔥 [name] destroyed (overflow)` (warning)

## Combat Items
During combat, the only items available to the player are the 3 equipped items from the quick bar in the HUD. Bag items are not accessible during combat.

## Module Boundaries

| Module | Responsibility |
|--------|---------------|
| CardFan | Canvas rendering, drag/reorder, fire anim, maximize/minimize |
| CardStack | Stack building rules, synergy tag intersection, thrust calculation |
| CardAuthority | ✅ SOLE owner of all card state: hand(5), backup(30), deck, bag(12), stash(20), equipped(3), gold |
| CardTransfer | ✅ Handles all validated cross-zone transfers with rollback |
| CardSystem | ✅ Pure registry only: init(), getById/getByPool/getBiomeDrops/getAllRegistry. NO mutable state. |
| CombatBridge | Phase orchestration, draw-per-turn, fireStack dispatch (calls CardAuthority directly) |
| CombatEngine | Phase state machine, enemy beat timer |
| CombatFX | Viewport zoom, HUD flash, fan slide choreography |
| SynergyEngine | Suit RPS advantage, mono-suit bonus |
| NchWidget | DOM capsule, maximize trigger, combat mode switch |

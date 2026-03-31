# Player Controller Roadmap

Architecture reference, speed tuning plan, and polish backlog for the Dungeon Gleaner movement + input pipeline. Benchmarked against Glov.js `CrawlerControllerQueued` (dcexjam2025).

---

## 1  Architecture Overview

### Module Graph

```
InputManager (Layer 1)         — keydown/keyup event binding
    ↓
InputPoll (Layer 3)            — per-frame held-key polling
    ↓
MovementController (Layer 1)   — queued lerp grid movement
    ↓
Player (Layer 3)               — entity state, debuffs, inventory
    ↓
MouseLook (Layer 3)            — pointer → free-look offset
    ↓
Raycaster (Layer 2)            — renders at interpolated position
```

### Dual-Queue Architecture (ported from Glov)

```
User Input  →  impulse_queue (raw, unbounded)
                    ↓  promote one per frame
             interp_queue (validated, being animated)
                    ↓  easeInOut interpolation
             _renderX, _renderY, _renderAngle (smooth)
```

- **impulse_queue**: Buffers raw input instantly. Feels responsive because the action "registers" before collision is checked.
- **interp_queue**: One entry = one animation segment. Collision check happens at promotion time. If blocked → bump animation instead of move.
- **Double-time**: When queue depth > 3, the current segment halves its duration. Prevents "ice slide" lag on held keys.

### Key Repeat System

```
First press        → immediate move (downEdge)
Hold 400ms         → start repeating (KEY_REPEAT_DELAY)
Every 180ms after  → repeat move (KEY_REPEAT_RATE)
```

The `actionHash` tracks which *relative direction* is held (not absolute dx/dy), preventing the ice-slide bug where turning mid-hold mapped the same hash to a different grid direction.

---

## 2  Current Timing Constants

| Constant | Value | Purpose | Glov Equivalent |
|---|---|---|---|
| `WALK_TIME` | 320ms | Forward/back/strafe step | 500ms (base) |
| `ROT_TIME` | 350ms | 90° turn | 250ms |
| `BUMP_TIME` | 200ms | Wall-bump feedback | 200ms |
| `KEY_REPEAT_DELAY` | 400ms | Hold-to-repeat start | ~400ms |
| `KEY_REPEAT_RATE` | 180ms | Repeat interval | ~150ms |
| `BOB_AMPLITUDE` | 3.5px | Head bob half-swing | N/A (Glov has no bob) |
| `BOB_FREQUENCY` | 2 cycles/step | Bob oscillation rate | N/A |

### Design Rationale

- **WALK_TIME 320ms** (vs Glov's 500ms): 36% faster advance. Dungeon Gleaner is a cleaning sim — the operative walks briskly through cleared corridors. Matches the "snappy forward" feel competitors had in the playtester A/B.
- **ROT_TIME 350ms** (vs Glov's 250ms): 40% slower turns. Deliberate peek-and-reveal feel. When you turn a corner, you see the new corridor develop over a third of a second — just enough to register threat before committing.
- **Head bob**: Original enhancement. Glov doesn't have vertical oscillation during movement. Sells the first-person immersion (Doom/Eye of the Beholder lineage).

---

## 3  Easing Curve

### Before (Jam Build)
```js
easeInOut(t, 2)  // quadratic — smooth but slightly abrupt at endpoints
```

### After (Current)
```js
easeInOut(t, 3)  // cubic — matches Glov's smoothstep
```

The cubic curve has ~14% steeper midpoint acceleration. In practice this means:
- Snappier departure from standstill (less "sticky start")
- More natural dwell at the halfway point
- Crisper stop at destination (less "sliding into place")

The power parameter is per-segment, so double-time overrides can still pass `power=1` for instant catch-up.

---

## 4  Debuff Integration (GROGGY)

### Gap (Identified in Glov Audit)

`Player.getWalkTimeMultiplier()` was defined (returns cumulative `walkTimeMult` from active debuffs) but **not wired** into `MovementController.tick()`.

### Fix (Implemented)

```js
// movement.js tick(), inside the animation loop:
var walkMult = (typeof Player !== 'undefined' && Player.getWalkTimeMultiplier)
  ? Player.getWalkTimeMultiplier() : 1;
var totTime = next.actionType === ACTION_MOVE ? (WALK_TIME * walkMult) :
              next.actionType === ACTION_ROT ? ROT_TIME : BUMP_TIME;
```

**Effect**: When GROGGY is active (`walkTimeMult: 1.25`), walk time goes from 320ms → 400ms. Turns and bumps are unaffected — it's a movement debuff, not a reaction debuff. This matches Glov's approach where debuff multipliers only scale translation speed.

### Future Debuffs

The multiplier is cumulative (`mult *= def.walkTimeMult`), so stacking debuffs compound:
- GROGGY (1.25×) + hypothetical EXHAUSTED (1.5×) = 1.875× walk time
- Maximum should be capped at ~3× to prevent softlocks (TODO: add cap in `getWalkTimeMultiplier`)

---

## 5  Mouse Free-Look Acceleration

### Before (Linear)
```
offset = normalized × FREE_LOOK_RANGE
```
Small mouse movements and large sweeps produced proportional offsets. Felt flat — players couldn't make subtle peeks without overshooting.

### After (Accelerated + Smoothed)
```
accelerated = sign(n) × |n|^1.6 × FREE_LOOK_RANGE
smoothOffset += (target - smoothOffset) × 0.15
```

**ACCEL_POWER=1.6**: Center 50% of viewport maps to only ~30% of look range. The outer 25% on each side covers the remaining 70%. This means:
- Tiny mouse movements → subtle peek (great for scouting before committing to a turn)
- Large sweeps → fast scout of peripheral vision
- The exponent is lower than quadratic (2.0) to avoid a dead zone in the center

**SMOOTH_FACTOR=0.15**: Exponential lerp adds ~4 frames of lag at 60fps. This sells "head turning" — the view follows the mouse with slight inertia rather than snapping.

### Tuning Notes

| Parameter | Lower → | Higher → |
|---|---|---|
| `ACCEL_POWER` | More linear, less center precision | More center dead zone, faster edges |
| `SMOOTH_FACTOR` | More lag, floatier | Less lag, snappier |

Recommended range: ACCEL_POWER 1.3–2.0, SMOOTH_FACTOR 0.10–0.25.

### Future: Magic Remote Pointer

LG webOS Magic Remote sends pointer events via `window.onmousemove`. The same acceleration curve applies. The SMOOTH_FACTOR may need to increase to 0.20+ because the IR pointer is noisier than a desktop mouse.

---

## 6  Speed Matching Plan (Glov Parity)

### Current Delta

| Dimension | Ours | Glov | Delta | Action |
|---|---|---|---|---|
| Walk speed | 320ms | 500ms | -36% | Intentional — keep |
| Turn speed | 350ms | 250ms | +40% | Intentional — keep |
| Easing curve | cubic (3) | cubic (~3) | ≈0% | ✅ Matched |
| Debuff scaling | wired | wired | ≈0% | ✅ Matched |
| Free-look accel | 1.6 power | N/A | N/A | Original enhancement |
| Free-look smooth | 0.15 lerp | N/A | N/A | Original enhancement |
| Screen shake | none | per-hit | missing | Post-jam |
| Blend scheduling | none | CQC2 | missing | Post-jam (pits/ladders) |

### Remaining Speed Adjustments

1. **KEY_REPEAT_RATE 180ms → 150ms**: Glov repeats faster. Lower value means held-forward covers ground quicker in long corridors. Try 150ms and playtest — if it feels "twitchy", revert.

2. **Double-time threshold**: Currently triggers at queue depth > 3. Glov triggers at depth > 2 when progress < 0.5. Lowering our threshold would make held-forward feel more responsive in open areas.

3. **Strafe speed multiplier**: Consider `STRAFE_TIME = WALK_TIME × 1.15` (~368ms). Strafing slightly slower than forward makes "circling" combat feel more tactical. Glov does not differentiate — this is optional flavor.

---

## 7  Polish Backlog

### P0 — Before Submission (April 5)

- [x] GROGGY debuff wired to movement speed
- [x] Easing upgraded to cubic (Glov parity)
- [x] MouseLook acceleration curve + smoothing
- [ ] Playtest timing constants with conference call group

### P1 — Post-Jam Polish

- [ ] **Screen shake**: Camera offset on combat hit. Sinusoidal decay over ~300ms. Reads from `Player.state().screenShake` (amplitude, timer).
- [ ] **Strafe speed multiplier**: `STRAFE_TIME = WALK_TIME × 1.15` for tactical feel.
- [ ] **Walk time multiplier cap**: Prevent debuff stacking from exceeding 3× base walk time.
- [ ] **Footstep variation**: Pitch-shift left/right footsteps by ±5% for organic feel (already have alternating; need pitch param in AudioSystem.play).

### P2 — webOS / Content Store

- [ ] **Magic Remote smoothing**: Increase SMOOTH_FACTOR for IR pointer noise.
- [ ] **Gamepad right-stick**: Map stick deflection to free-look via deadzone + acceleration curve.
- [ ] **Blend scheduling (CrawlerControllerQueued2)**: Glov's advanced system for pit transitions and ladder animations. Required for vertical traversal FX.
- [ ] **Movement speed zones**: Tile-based speed modifiers (water=0.7×, ice=1.5×, mud=0.5×). Read from SpatialContract tile data.

### P3 — Nice-to-Have

- [ ] **View bob during strafe**: Currently only forward/back trigger bob. Add lateral sway on strafe.
- [ ] **Landing impact**: Brief camera dip on arriving at destination after stairs transition.
- [ ] **Breathing idle**: Micro-oscillation (~0.5px) when standing still. Sells "alive" feel.
- [ ] **Glov easing variants**: Port `easeIn()` and `easeOut()` (not just `easeInOut`) for asymmetric animations (e.g. fast start, slow stop on bump recovery).

---

## 8  File Reference

| File | Lines | Role |
|---|---|---|
| `engine/movement.js` | ~523 | Core queued lerp controller |
| `engine/mouse-look.js` | ~90 | Pointer → free-look with acceleration |
| `engine/input-poll.js` | ~200 | Per-frame held-key polling |
| `engine/input-manager.js` | ~150 | Keydown/keyup binding |
| `engine/player.js` | ~679 | Entity state, debuffs, inventory |
| `engine/dpad.js` | ~120 | HUD D-pad (6-button strafe layout) |
| `engine/raycaster.js` | ~800 | Reads interpolated position + bobY |
| `engine/game.js` | ~3400 | Wires callbacks between all of the above |

---

## 9  Appendix: Glov Comparison Matrix

Detailed audit results from the dcexjam2025 codebase comparison.

### Architecture Match

| Glov Pattern | Dungeon Gleaner | Status |
|---|---|---|
| `CrawlerControllerQueued` | `MovementController` | ✅ Ported |
| `impulse_queue` / `interp_queue` | Same names, same pattern | ✅ Identical |
| `MoveState` with action types | Same structure | ✅ Identical |
| Frame-rate independent dt tick | Same approach | ✅ Identical |
| Double-time acceleration | Same trigger logic | ✅ Identical |
| `easeInOut(t, power)` | Same function, upgraded to power=3 | ✅ Matched |

### Original Enhancements (Not in Glov)

| Feature | Benefit |
|---|---|
| Head bob (sinusoidal) | First-person immersion |
| MouseLook acceleration | Precise peeking |
| MouseLook smoothing | Natural head-turn feel |
| Alternating footstep SFX | Spatial audio feedback |
| Bump entity detection | Combat trigger on wall-bump |

### Missing from Glov (Intentionally Deferred)

| Feature | Reason |
|---|---|
| `CrawlerControllerQueued2` | Only needed for pits/ladders (no vertical traversal in Act 1) |
| Per-action easing variants | Not needed until asymmetric animations are designed |
| Screen shake | Combat FX — post-jam (P1 backlog) |
| Movement speed zones | Tile-based modifiers — post-jam (P2 backlog) |

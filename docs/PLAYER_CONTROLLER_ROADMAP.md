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

### After (Accelerated + Two-Stage Smoothed)
```
accelerated = sign(n) × |n|^1.8 × FREE_LOOK_RANGE
_lerp2(current, target):
  growing? → current += diff × 0.12   (SMOOTH_ATTACK)
  decaying? → current += diff × 0.06  (SMOOTH_DECAY)
```

**ACCEL_POWER=1.8** (updated from 1.6): Center dead zone + power curve. The ring-based dead center (`DEAD_CENTER_FRAC=0.60`) means the cursor must reach the outer 40% of the ring radius before free-look activates at all. Within the active band, the 1.8 power curve gives fine center precision and fast edge sweeps.

**Two-stage smoothing** (replaced single SMOOTH_FACTOR):

| Constant | Value | Purpose |
|---|---|---|
| `SMOOTH_ATTACK` | 0.12 | Lerp weight when offset is growing (snappier onset) |
| `SMOOTH_DECAY` | 0.06 | Lerp weight when offset is shrinking (gentle return) |
| `H_SPEED_MULT` | 0.45 | Horizontal yaw scaling (prevents tearing) |
| `DEAD_CENTER_FRAC` | 0.60 | Inner 60% of ring is dead zone |
| `HITBOX_RADIUS_FRAC` | 0.328 | Ring hitbox as fraction of min(canvasW, canvasH) |

The two-stage approach means entering free-look feels responsive (0.12 attack = ~6 frames to 50%) while returning to center feels smooth and natural (0.06 decay = ~12 frames to 50%).

### Additional features (current)
- **Gamepad right stick**: `_updateFromGamepad()` reads `InputManager.getGamepadRightStick()` through the same acceleration curve with independent sensitivity scaling (`GP_YAW_SPEED=0.85`, `GP_PITCH_SPEED=0.85`). Overrides mouse when stick is deflected.
- **Lock-on system**: `lockOn(yaw, pitch)` / `releaseLock()` — OoT Z-target style camera pan. Smoothly lerps toward target at `LOCK_LERP=0.06`. Mouse/gamepad input ignored during lock.
- **Vertical pitch**: Asymmetric range — more look-down (`PITCH_DOWN_MAX`) than look-up (`PITCH_UP_MAX`) for floor inspection. `invertY` toggle available.

### Known Issue: Onset Choppiness (⚠️ P1)

**Symptom**: Free-look feels choppy for the first ~0.5s after activation, then smooths out.

**Root cause**: `_lerp2()` uses **frame-rate-dependent fixed lerp weights**. The 0.12/0.06 factors assume consistent ~16.67ms frames. When frames are uneven (common during free-look activation as the browser recalculates layout or the OS serves files from a slow HDD), the smoothing converges at inconsistent real-time rates. A 50ms frame advances `0.12 × diff` — the same amount as a 16ms frame — creating visible stutters.

**Fix** (P1 backlog): Make `_lerp2` dt-aware:
```js
function _lerp2(current, target, dt) {
  var diff = target - current;
  var growing = Math.abs(target) > Math.abs(current);
  var base = growing ? SMOOTH_ATTACK : SMOOTH_DECAY;
  var factor = 1 - Math.pow(1 - base, dt / 16.667);
  var result = current + diff * factor;
  if (Math.abs(result) < 0.0005) result = 0;
  return result;
}
```
This makes convergence speed independent of frame rate. A 50ms frame would apply `1 - (1-0.12)^3 ≈ 0.32` — triple the correction — matching the real time elapsed.

**Requires**: Passing `frameDt` into `MouseLook.tick(dt)` from `_renderGameplay()` (currently called with no args).

### Tuning Notes

| Parameter | Lower → | Higher → |
|---|---|---|
| `ACCEL_POWER` | More linear, less center precision | More center dead zone, faster edges |
| `SMOOTH_ATTACK` | More lag entering free-look | Snappier onset, less "head turn" |
| `SMOOTH_DECAY` | Floatier return to center | Snappier return, less inertia |
| `H_SPEED_MULT` | Slower horizontal yaw | Faster horizontal, risk of tearing |

Recommended ranges: ACCEL_POWER 1.3–2.0, SMOOTH_ATTACK 0.08–0.20, SMOOTH_DECAY 0.04–0.12.

### Magic Remote Pointer (✅ Wired)

LG webOS Magic Remote sends pointer events via `window.onmousemove`. The same acceleration curve applies. The IR pointer is noisier than a desktop mouse — SMOOTH_ATTACK/DECAY may need tuning upward once we test on hardware. Input mapping wired in `engine/input.js` (WEBOS_KEYCODE_MAP, Phase 1 of INPUT_CONTROLLER_ROADMAP).

---

## 6  Speed Matching Plan (Glov Parity)

### Current Delta

| Dimension | Ours | Glov | Delta | Action |
|---|---|---|---|---|
| Walk speed | 320ms | 500ms | -36% | Intentional — keep |
| Turn speed | 350ms | 250ms | +40% | Intentional — keep |
| Easing curve | cubic (3) | cubic (~3) | ≈0% | ✅ Matched |
| Debuff scaling | wired | wired | ≈0% | ✅ Matched |
| Free-look accel | 1.8 power | N/A | N/A | Original enhancement |
| Free-look smooth | 0.12/0.06 dt-aware | N/A | N/A | ✅ Fixed — dt-independent lerp |
| Gamepad right stick | wired (0.85 sens) | N/A | N/A | ✅ Original enhancement |
| Lock-on camera | wired (0.06 lerp) | N/A | N/A | ✅ Original enhancement |
| Screen shake | sinusoidal decay | per-hit | ≈0% | ✅ Matched (300ms, damage-scaled) |
| Strafe speed | ×1.15 slower | same as walk | +15% | ✅ Tactical feel |
| Walk time cap | 3× max | N/A | N/A | ✅ Prevents softlock |
| Footstep pitch | ±5% L/R | N/A | N/A | ✅ Organic feel |
| Blend scheduling | none | CQC2 | missing | Post-jam (pits/ladders) |

### Remaining Speed Adjustments

1. **KEY_REPEAT_RATE 180ms → 150ms**: Glov repeats faster. Lower value means held-forward covers ground quicker in long corridors. Try 150ms and playtest — if it feels "twitchy", revert.

2. **Double-time threshold**: Currently triggers at queue depth > 3. Glov triggers at depth > 2 when progress < 0.5. Lowering our threshold would make held-forward feel more responsive in open areas.

3. **Strafe speed multiplier**: Consider `STRAFE_TIME = WALK_TIME × 1.15` (~368ms). Strafing slightly slower than forward makes "circling" combat feel more tactical. Glov does not differentiate — this is optional flavor.

---

## 7  Polish Backlog

### P0 — Before Submission (April 5) ✅

- [x] GROGGY debuff wired to movement speed
- [x] Easing upgraded to cubic (Glov parity)
- [x] MouseLook acceleration curve + smoothing
- [x] Playtest timing constants — constants held (320/350/200ms), felt right in jam playtests

### P1 — Post-Jam Polish (Patch Target: April 25)

- [x] **⚠️ Free-look dt-aware smoothing**: ✅ `_lerp2()` now dt-aware via `1 - pow(1-base, dt/16.667)`. `MouseLook.tick(dt)` receives `frameDt` from `_renderGameplay()`. Lock-on lerp also dt-corrected. 100ms clamp prevents spiral after tab-away.
- [x] **Screen shake**: ✅ `Player.triggerShake(amp, ms)` + `Player.tickShake(dt)` — sinusoidal × linear decay, 25Hz, 300ms. Triggered from combat-bridge.js at impact (both stack + legacy paths). Amplitude scales with enemy damage: `min(0.06, 0.015 + dmg × 0.005)`. Applied as yaw offset in Raycaster.render() call.
- [x] **Strafe speed multiplier**: ✅ `STRAFE_MULT = 1.15` — strafe moves take 368ms (vs 320ms forward). Flag set on MoveState in `startRelativeMove()`, applied in `tick()` totTime calculation.
- [x] **Walk time multiplier cap**: ✅ `MAX_WALK_TIME_MULT = 3.0` — `getWalkTimeMultiplier()` clamps cumulative debuff stacking. Prevents softlock from compound debuffs (e.g. GROGGY × EXHAUSTED × ...).
- [x] **Footstep variation**: ✅ Left foot pitches 0.95–1.00 (heavier), right foot 1.00–1.05 (lighter push-off). Uses AudioSystem `playbackRate` option. Per-step random within range for organic feel.

### P2 — webOS / Content Store

- [ ] **Magic Remote smoothing**: Tune SMOOTH_ATTACK/DECAY for IR pointer noise on actual hardware. Key mapping already wired (INPUT_CONTROLLER_ROADMAP Phase 1 ✅).
- [x] **Gamepad right-stick**: ✅ `_updateFromGamepad()` wired — same acceleration curve, independent sensitivity scaling (GP_YAW_SPEED/GP_PITCH_SPEED = 0.85).
- [ ] **Blend scheduling (CrawlerControllerQueued2)**: Glov's advanced system for pit transitions and ladder animations. Required for vertical traversal FX.
- [ ] **Movement speed zones**: Tile-based speed modifiers (water=0.7×, ice=1.5×, mud=0.5×). Read from SpatialContract tile data.

### P3 — Nice-to-Have

- [ ] **View bob during strafe**: Currently only forward/back trigger bob. Add lateral sway on strafe.
- [ ] **Landing impact**: Brief camera dip on arriving at destination after stairs transition.
- [ ] **Breathing idle**: Micro-oscillation (~0.5px) when standing still. Sells "alive" feel.
- [ ] **Glov easing variants**: Port `easeIn()` and `easeOut()` (not just `easeInOut`) for asymmetric animations (e.g. fast start, slow stop on bump recovery).

### Note: file:// vs Hosted Performance

Movement code is dt-aware (`MC.tick(frameDt)` uses real delta time for progress calculation) and should render smoothly regardless of frame rate. The choppiness observed when running from local HDD via `file://` is an environment issue — the browser's file I/O introduces irregular frame delays during initial asset loading and script parsing. Once assets are cached (as on itch.io via CDN), frame times stabilize. The dt-aware free-look fix (P1) will help mask the remaining onset stutter. No code changes needed for MovementController itself.

---

## 8  File Reference

| File | Lines | Role |
|---|---|---|
| `engine/movement.js` | ~523 | Core queued lerp controller (dt-aware) |
| `engine/mouse-look.js` | ~310 | Pointer + gamepad → free-look (accel + two-stage lerp + lock-on) |
| `engine/input-poll.js` | ~200 | Per-frame held-key polling |
| `engine/input.js` | ~300+ | InputManager: keydown/keyup + gamepad polling + WEBOS_KEYCODE_MAP |
| `engine/player.js` | ~679 | Entity state, debuffs, inventory |
| `engine/dpad.js` | ~120 | HUD D-pad (6-button strafe, keyboard highlight, Unicode symbols) |
| `engine/raycaster.js` | ~800 | Reads interpolated position + bobY |
| `engine/game.js` | ~3800 | Wires callbacks between all of the above |

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
| MouseLook acceleration (1.8 power) | Precise peeking with ring dead zone |
| MouseLook two-stage smoothing | Fast attack / slow decay = natural head-turn |
| Gamepad right-stick free-look | Same curve, independent sensitivity |
| Lock-on camera (OoT Z-target) | Smooth cinematic pans |
| Alternating footstep SFX | Spatial audio feedback |
| Bump entity detection | Combat trigger on wall-bump |
| HUD D-pad with keyboard highlight | Touch + keyboard unified input |
| webOS Magic Remote key mapping | LG TV native input support |

### Missing from Glov (Intentionally Deferred)

| Feature | Reason |
|---|---|
| `CrawlerControllerQueued2` | Only needed for pits/ladders (no vertical traversal in Act 1) |
| Per-action easing variants | Not needed until asymmetric animations are designed |
| Screen shake | Combat FX — post-jam (P1 backlog) |
| Movement speed zones | Tile-based modifiers — post-jam (P2 backlog) |

---

*Last updated: 2026-04-07 — P1 COMPLETE. All 5 items shipped: dt-aware free-look, screen shake, strafe mult, walk cap, footstep pitch. Updated §5-§9 throughout.*

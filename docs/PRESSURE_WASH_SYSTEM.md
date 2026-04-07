# PRESSURE_WASH_SYSTEM.md — Grime Grid, Spray, and Pointer-Aim Reference

> **Status:** Living document. Describes the pressure washing pipeline as implemented through PW-3.
> **Purpose:** Architectural reference for the grime/cleaning subsystems. Specifically structured to serve as the integration spec when building the LG Magic Remote test harness and expanding gyroscope/proprioceptive input.
> Last verified against codebase: 2026-04-06.

---

## 1. System Overview

Pressure washing is the core gameplay loop of the janitor sim. The player cleans grime from dungeon surfaces (floors and walls) using two input paths: manual scrub (d-pad tap, no hose) and continuous spray (hold OK with hose equipped). Wall cleaning via the hose is the primary high-fidelity interaction — it uses pointer-aim to map the Magic Remote cursor to a specific subcell on the wall's grime grid, creating an MS Paint eraser–style squeegee feel.

```
┌──────────────────────────────────────────────────────────────────────┐
│                     INPUT LAYER                                       │
│  InputManager.getPointer() → { x, y, active }                       │
│  InputManager.isDown('interact') → held boolean                      │
│  (Future: gyro angular velocity, gyro tilt, pressure sensor)         │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   SPRAY SYSTEM (spray-system.js)                      │
│                                                                       │
│  Gate chain:                                                          │
│    HoseState.isActive() → InputManager.isDown('interact') →          │
│    _facedTile() exists → not in combat/transition →                   │
│    no peek/menu overlay (TorchPeek, RestockBridge, CorpsePeek,       │
│    CratePeek)                                                         │
│                                                                       │
│  Every TICK_MS (100ms) while gates pass:                              │
│    1. _sweepCenter() resolves aim subcell                             │
│       ├─ Pointer active? → Raycaster.castScreenRay() → exact subcell │
│       └─ No pointer?     → Lissajous auto-sweep fallback             │
│    2. Determine surface type (wall vs floor) → brush radius + kernel  │
│    3. Apply cleaning:                                                 │
│       ├─ Pointer path: _strokeLine() Bresenham interpolation          │
│       │  with hard-edge kernel (cleanKernelHard)                      │
│       └─ Lissajous path: _applyBrush() with soft-falloff kernel      │
│    4. Legacy blood scrub (CleaningSystem.scrub, backward compat)      │
│    5. TorchHitResolver.onHoseHit() for collateral torch extinguish    │
│    6. WaterCursorFX burst at FX_BURST_MS intervals                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    GRIME GRID (grime-grid.js)                         │
│                                                                       │
│  Pure data layer — Uint8Array per tile, value 0 (clean) to 255       │
│  Resolution:                                                          │
│    Floor tiles: 4×4   (16 subcells) — coarse, walk-over cleaning     │
│    Wall tiles:  64×64  (4096 subcells) — fine-grain squeegee         │
│                                                                       │
│  Two kernel types:                                                    │
│    cleanKernel()     — Chebyshev distance, linear falloff (soft)     │
│    cleanKernelHard() — Euclidean circle mask, uniform strength       │
│                        (sharp edge, squeegee feel)                    │
│                                                                       │
│  Readiness query:                                                     │
│    getTileCleanliness(fId, x, y) → 0.0–1.0                          │
│    getFloorCleanliness(fId) → 0.0–1.0 (averaged across all grids)   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Pointer-Aim Pipeline (Wall Squeegee)

This is the primary interaction that will expand with gyroscope input. The current pipeline uses screen-space cursor position; the future pipeline will add angular velocity and tilt from the Magic Remote IMU.

### 2.1 Current: Screen-Space Pointer → Wall Subcell

```
InputManager.getPointer()
  → { x: screenPixelX, y: screenPixelY, active: true }
  ↓
Raycaster.castScreenRay(screenX, screenY, grid, gridW, gridH)
  → Fires single DDA ray from player eye through screen pixel
  → Returns: {
      tileX, tileY,      // which wall tile the ray hit
      wallU, wallV,       // UV coordinates on the face (0..1)
      perpDist,           // perpendicular distance for depth
      side,               // 0 = X-face, 1 = Y-face
      subX, subY,         // grime grid subcell at the hit point
      grimeRes            // resolution of the grid (64 for walls)
    }
  ↓
SpraySystem._sprayTick()
  → Compares current { subX, subY } to _prevAim
  → _strokeLine() Bresenham-interpolates between prev and current
  → At each interpolated subcell: hard-edge circular kernel applied
  → Strength distributed across stroke length:
      perPoint = strength / max(1, strokeLength / 3)
      Fast sweep → many subcells → thin coverage → need 2-3 passes
      Slow aim   → few subcells  → deep coverage → one pass cleans
```

### 2.2 Future: Gyroscope Angular Velocity → Brush Dynamics

**This section documents the integration points for when the LG Magic Remote test harness is functional.** The Magic Remote contains a 3-axis gyroscope and accelerometer. The WebOS `webOSMouse` or HID gyro events expose angular velocity (deg/s) and tilt orientation. These map to two gameplay-relevant signals:

**Signal 1: Nozzle sweep velocity (angular velocity around yaw axis)**

Currently derived implicitly from the distance between consecutive pointer-aim subcells per tick. With raw gyro data, this becomes a direct measurement.

Integration point in `spray-system.js`:
```
// HARNESS HOOK: Replace implicit velocity with direct gyro read
// Currently: velocity = distance(_prevAim, currentAim) / TICK_MS
// Future:    velocity = GyroInput.getYawRate()  // deg/s
//
// The velocity value feeds the per-point strength calculation in
// _strokeLine(). The math doesn't change — only the source of the
// velocity number. Higher angular velocity → more subcells traversed
// → lighter cleaning per subcell → multiple passes needed.
//
// Gyro advantage: sub-pixel velocity detection. Screen-space pointer
// quantizes to integer pixels, so very slow movements read as 0
// velocity until the cursor crosses a pixel boundary. Gyro reports
// continuous angular velocity even when the cursor hasn't moved a
// full pixel yet. This enables:
//   - Pressure-sensitive cleaning at very slow speeds
//   - Distinguishing "holding still" from "moving extremely slowly"
//   - Vibration/tremor detection for accessibility features
```

**Signal 2: Nozzle angle (pitch/roll tilt → spray cone shape)**

Currently the brush is a fixed-radius circle. With gyro tilt data, the spray cone can deform:

Integration point in `spray-system.js` (`_strokeLine` or new `_applyBrushGyro`):
```
// HARNESS HOOK: Tilt-responsive brush shape
// Currently: circular hard-edge kernel, radius = WALL_BRUSH_RADIUS (4)
// Future:    elliptical kernel where:
//   - Major axis direction = tilt direction (roll angle maps to rotation)
//   - Eccentricity = tilt magnitude (vertical remote = circle, tilted = ellipse)
//   - Fan nozzle interaction: tilt rotates the fan line orientation
//
// GyroInput.getRoll()  → brush rotation (0°–360°)
// GyroInput.getPitch() → brush eccentricity (0 = circle, ±45° = 2:1 ellipse)
//
// This gives the player proprioceptive control over the spray pattern.
// Tilting the remote sideways makes a horizontal squeegee stroke;
// pointing straight makes a round spot clean. Combined with physical
// arm movement for sweep, this creates the "real pressure washer" feel.
```

**Signal 3: Distance / Z-axis (accelerometer forward thrust → pressure)**

Integration point in `spray-system.js` (`_sprayTick` strength calculation):
```
// HARNESS HOOK: Physical pressure from forward thrust
// Currently: strength = BASE_STRENGTH * HoseState.getPressureMult() * effMult
// Future:    strength *= GyroInput.getForwardPressure()
//
// Forward acceleration spikes (jabbing the remote toward the TV)
// map to pressure boost. This replaces or augments HoseState pressure
// multiplier with a physical gesture. Requires:
//   - Low-pass filter on accelerometer Z to ignore noise
//   - Threshold gate to distinguish intentional jab from hand tremor
//   - Cooldown to prevent exploit (can't just shake the remote)
//
// GyroInput.getForwardPressure() → 0.5–2.0 multiplier
```

---

## 3. GrimeGrid Data Model

### 3.1 Storage

Keyed by `"floorId:x,y"` → `{ data: Uint8Array(res*res), res: number }`.

Allocation is lazy — grids are created by `CleaningSystem.seedFromCorpses()` when hero combat dirties tiles, or by `CleaningSystem._seedGrimeAround()` for carnage splatter.

### 3.2 Resolution Rationale

| Surface | Resolution | Subcells | Bytes/tile | Visual (1080p, 3-tile distance) |
|---------|-----------|----------|------------|-------------------------------|
| Floor   | 4×4       | 16       | 16         | ~100px per subcell (coarse, fine for walk-over) |
| Wall    | 64×64     | 4,096    | 4,096      | ~6-10px per subcell (fine, squeegee edge visible) |

Wall resolution was bumped from 16×16 to 64×64 specifically for the squeegee interaction. At 16×16, each subcell covered 25-40px — visible blocky bands, not clean edges. At 64×64, the brush stroke leaves a visually smooth stripe with a sharp boundary between clean and dirty areas.

Memory budget: 200 wall tiles × 4KB = 800KB per floor. Acceptable for LG webOS target (512MB+ RAM on all supported models).

### 3.3 Kernel Types

**cleanKernel (soft)** — used by manual scrub (CleaningSystem.scrub, non-hose path). Chebyshev distance with linear falloff from center. Creates gradual grime reduction — appropriate for the slower, per-click cleaning feel.

**cleanKernelHard (hard)** — used by hose spray (SpraySystem pointer-aim path). Euclidean circle mask, full strength inside radius, zero outside. Creates the sharp clean/dirty boundary that makes the squeegee stroke visible. This is what gives the "eraser tool" feel — you can see exactly where you've cleaned.

### 3.4 Rendering

The raycaster's per-pixel wall column renderer (`_drawTiledColumnPixel` in raycaster.js) reads the grime grid during rendering. For each screen pixel in a wall column, it maps the wall UV coordinate to the corresponding subcell and blends a brownish-green tint at up to 60% opacity:

```
grimeSubX = floor(wallU * grimeRes)   // constant per column (U from DDA)
grimeSubY = floor(wallV * grimeRes)   // varies per pixel row (V from projection)
alpha     = (grimeValue / 255) * 0.6  // max 60% opacity
pixel     = pixel * (1 - alpha) + grimeRGB * alpha
```

Grime tint color: RGB(82, 68, 46).

---

## 4. Brush Radius and Velocity Feel

### 4.1 Current Tuning

| Parameter | Wall (pointer-aim) | Floor (Lissajous) |
|-----------|-------------------|-------------------|
| Brush radius | 4 subcells (9-subcell diameter) | 1 subcell (3-subcell diameter) |
| Kernel type | Hard-edge (Euclidean circle) | Soft-falloff (Chebyshev) |
| Effective stripe width | ~56px at 3-tile distance | N/A (auto-sweep) |
| Base strength | 42 per tick | 42 per tick |
| Tick rate | 100ms | 100ms |

### 4.2 Velocity-Dependent Cleaning (Stroke Interpolation)

When the pointer moves between ticks, `_strokeLine()` Bresenham-interpolates between the previous and current aim subcell. The fixed strength budget is distributed across the stroke:

```
perPoint = strength / max(1, strokeLength / 3)
```

This creates natural multi-pass behavior:
- **Slow sweep** (1-3 subcells/tick): perPoint ≈ full strength → one pass cleans to zero
- **Medium sweep** (6-12 subcells/tick): perPoint ≈ half strength → 2 passes needed
- **Fast sweep** (20+ subcells/tick): perPoint ≈ quarter strength → 3-4 passes needed

The `/3` divisor is a feel constant. Lower values (like `/2`) would punish fast movement more. Higher values (like `/5`) would make speed nearly irrelevant. Current tuning rewards deliberate sweeping without making fast passes feel useless.

### 4.3 Future: Gyro-Tuned Feel Constants

```
// HARNESS HOOK: Adaptive feel constants from gyro signal quality
//
// The /3 divisor in perPoint calculation is tuned for screen-space
// pointer input, which quantizes position to integer pixels. Gyro
// angular velocity is continuous and higher-frequency. When gyro
// input is available:
//
//   - Replace strokeLength (discrete subcell count) with angular
//     displacement (continuous degrees) for smoother strength curve
//   - Adjust divisor based on gyro sample rate — higher rate means
//     each tick captures finer movement, so the divisor should scale
//   - Consider angular velocity histogram for adaptive difficulty:
//     players with steadier hands get slightly less punished by speed
//     (accessibility: reduces frustration for players with tremor)
```

---

## 5. Raycaster Pointer Query

`Raycaster.castScreenRay(screenX, screenY, grid, gridW, gridH)` was extracted from the render-loop DDA for the pointer-aim pipeline. It's a read-only query — no rendering side effects.

### 5.1 What It Does

1. Reconstructs player eye state from `MovementController.getRenderPos()` + `Player.state()` (position, direction, lookOffset, lookPitch)
2. Converts screen-space X to a ray angle using the FOV (π/3 = 60°)
3. Runs the same DDA traversal as the render loop (but single-ray, no layer collection)
4. Computes perpDist, wallU (horizontal face UV), wallV (vertical face UV from screenY → projection inversion)
5. Maps UV to grime grid subcell coordinates if a grid exists on the hit tile

### 5.2 What It Returns

```javascript
{
  tileX: number,     // grid X of the wall tile hit
  tileY: number,     // grid Y of the wall tile hit
  wallU: number,     // 0..1 horizontal position on the face
  wallV: number,     // 0..1 vertical position on the face
  perpDist: number,  // perpendicular distance (depth)
  side: number,      // 0 = X-face, 1 = Y-face
  subX: number,      // grime subcell column (0..grimeRes-1)
  subY: number,      // grime subcell row (0..grimeRes-1)
  grimeRes: number   // resolution of the grid (64 for walls, 4 for floors)
}
```

### 5.3 Future: Multi-Signal Aim Fusion

```
// HARNESS HOOK: Fuse screen pointer with gyro for aim refinement
//
// The current pipeline uses screen-space pointer position as the sole
// aim input. On LG webOS, the Magic Remote pointer position is derived
// from the gyroscope internally by the webOS pointer service. There is
// inherent latency and quantization in this conversion.
//
// With raw gyro access via the test harness, the aim pipeline could
// fuse both signals:
//
//   screenAim = Raycaster.castScreenRay(pointer.x, pointer.y, ...)
//   gyroAim   = GyroInput.getAimDelta()  // sub-pixel angular offset
//
//   fusedSubX = screenAim.subX + gyroAim.dx * grimeRes / FOV_degrees
//   fusedSubY = screenAim.subY + gyroAim.dy * grimeRes / verticalFOV
//
// This gives sub-pixel aim precision that the screen pointer alone
// cannot provide — the gyro catches movement between pixel boundaries.
// Particularly relevant at the 64×64 wall resolution where subcells
// are only 6-10px and the pointer may skip subcells during fast sweeps.
//
// Also enables: predictive aim (extrapolate gyro angular velocity to
// pre-compute next subcell), which can reduce perceived input latency
// by one frame for the grime rendering path.
```

---

## 6. Interact Priority Chain (Cleaning Context)

The interact chain in `game.js` determines what happens when the player presses OK while facing a tile. Cleaning-relevant priority (highest first):

1. **Navigation** (stairs, doors) — always resolves first
2. **NPCs** (dialogue trees)
3. **Friendly enemies** (bark) — SKIPPED when `HoseState.isActive()`
4. **Cobwebs**
5. **Hose spray gate** — if hose active AND tile grimy AND tile is NOT a torch → return early, SpraySystem handles via held input. This is the "hold OK to spray" gate.
6. **Loot** (CORPSE, DETRITUS, CHEST) — resolves before manual scrub so grimy tiles don't block reward pickup
7. **Manual scrub** (non-hose click-per-scrub cleaning)
8. **Trap re-arm**
9. **Tile-type switch** (bonfire, table, shop, torch menu, breakable, etc.)

The torch exemption at step 5 is critical: torch tiles skip the spray gate so OK opens TorchPeek (careful menu-based extinguish that preserves fuel). SpraySystem has peek gates that stop spray when TorchPeek is active. The result: tap OK on torch → menu opens (careful). Hold OK without menu → SpraySystem fires (destructive pressureWashExtinguish that ruins dry fuel).

---

## 7. File Map

| File | Layer | Role |
|------|-------|------|
| `engine/grime-grid.js` | 1 (data) | Uint8Array subcell storage, allocation, kernels, readiness queries |
| `engine/cleaning-system.js` | 2 | Legacy blood + GrimeGrid bridge, seedFromCorpses, isDirty, readiness blend |
| `engine/spray-system.js` | 3 | Continuous spray, pointer-aim, stroke interpolation, nozzle types, peek gates |
| `engine/raycaster.js` | 2 | Render-loop grime tinting, castScreenRay pointer query |
| `engine/torch-hit-resolver.js` | 3 | Collateral torch extinguish on spray (depth-3+ only) |
| `engine/torch-state.js` | 2 | Dual extinguish: pressureWashExtinguish (destructive) vs extinguish (careful) |
| `engine/hose-state.js` | 2 | Hose equip state, pressure multiplier |
| `engine/input.js` | 1 | getPointer(), isDown(), pointer active tracking |

---

## 8. Test Harness Integration Checklist

When the LG Magic Remote test harness is built, these are the integration points to wire up. Each is marked with `HARNESS HOOK` comments in the source.

| # | Signal | Source | Target | Section |
|---|--------|--------|--------|---------|
| 1 | Yaw angular velocity | GyroInput.getYawRate() | _strokeLine perPoint calc | §2.2 Signal 1 |
| 2 | Roll angle | GyroInput.getRoll() | Brush shape rotation (ellipse major axis) | §2.2 Signal 2 |
| 3 | Pitch angle | GyroInput.getPitch() | Brush eccentricity (circle → ellipse) | §2.2 Signal 2 |
| 4 | Forward acceleration | GyroInput.getForwardPressure() | Strength multiplier in _sprayTick | §2.2 Signal 3 |
| 5 | Sub-pixel aim delta | GyroInput.getAimDelta() | Fused aim in _sweepCenter | §5.3 |
| 6 | Angular velocity histogram | GyroInput analytics | Adaptive feel constants | §4.3 |

**Prerequisite:** A `GyroInput` module that reads raw gyro/accel from the webOS HID service, applies low-pass filtering, and exposes the above signals. This module does not exist yet. The HARNESS HOOK comments document where each signal feeds into the existing pipeline without requiring refactors — the current architecture was designed with these extension points in mind.

---

## 9. Nozzle Types (PW-5 Expansion)

Three nozzle types are defined but only `base` is active (nozzle equip slot not yet wired). Gyro input will differentiate these further.

| Nozzle | Radius | Shape | Wall Eff | Floor Eff | Gyro Interaction |
|--------|--------|-------|----------|-----------|------------------|
| base | 1 (floor) / 4 (wall) | circle | 1.0× | 1.0× | Standard — tilt changes eccentricity |
| fan | 2 | hline | 1.0× | 1.4× | Roll rotates the fan line orientation |
| cyclone | 1 | spiral (oscillating offset) | 0.8× | 1.0× | Gyro jitter amplifies spiral amplitude |

The fan nozzle is the strongest candidate for gyro interaction: physically rotating the remote rotates the cleaning line on the wall. Holding it flat → horizontal squeegee. Tilting 90° → vertical squeegee. This maps directly to how a real pressure washer fan tip works.

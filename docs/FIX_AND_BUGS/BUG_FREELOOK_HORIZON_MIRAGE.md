# BUG: Freelook Horizon Mirage (Low Priority)

**Status**: Known artifact — freelook only, no gameplay impact
**Filed**: 2026-04-12
**Priority**: Low — cosmetic, only visible during freelook pitch

---

## Symptom

When using the freelook ring to tilt the camera down toward the floor,
distant buildings/walls appear to "float" above the floor — a thin
bright band (sky color) is visible between the textured floor and the
wall bases at far range. The effect resembles a heat mirage where a
distant road appears to shimmer.

The artifact does NOT appear during normal gameplay (pitch = 0). It
only manifests when `Player.lookPitch` is non-zero via the freelook
ring or gamepad right stick.

## Root Cause

Raycaster pitch is simulated by shifting the horizon line (`halfH`).
The floor caster's distance formula has been corrected to use the true
projection center (`h/2`) so the math is accurate — `rowDist` at a
wall's base position equals `perpDist` in continuous math. However,
both the wall column renderer and the floor caster use integer
truncation (`Math.floor`) for pixel positioning:

- Wall bottom: `Math.floor(halfH + baseLineH / 2)`
- Floor row distance: `trueHalfH / (screenY - halfH)` where screenY
  is an integer

At far distances (perpDist > 15), `baseLineH` is only 2-4 pixels and
the integer rounding in both systems can diverge by 1-2 pixels. These
small per-column gaps are invisible at close range but accumulate into
a visible seam at the horizon where many wall columns share the same
row band.

## What Was Fixed (2026-04-12)

1. **Pitch clamp sign swap** (player.js): `setLookPitch` clamped
   `[-DOWN_MAX, +UP_MAX]` but MouseLook sends positive = look-down.
   The ranges were effectively swapped — look-up used the larger
   DOWN_MAX range (0.55) causing excessive star spreading, and
   look-down was limited to UP_MAX (0.35). Fixed to
   `[-UP_MAX, +DOWN_MAX]`.

2. **Pitch range tightened**: DOWN_MAX 0.55→0.38, UP_MAX 0.35→0.25.

3. **Floor distance anchored to true center** (raycaster.js): Changed
   `rowDist = halfH * baseWallH / rowFromCenter` to use `h/2` instead
   of `halfH`. This eliminates the non-linear distance scaling that
   caused the "jaw opening" gap. The remaining artifact is sub-pixel
   rounding only.

4. **Floor gradient fallback sizing** (raycaster.js): Fixed
   `fillRect(0, halfH, w, halfH)` → `fillRect(0, halfH, w, h - halfH)`
   so non-textured floors cover the full floor region when pitched.

## What Would Fix It Fully

Eliminating the remaining 1-2 pixel rounding gap would require:

- Floating-point wall bottom positioning (no `Math.floor` on
  `flatBottom`) with sub-pixel anti-aliased column edges
- Per-column floor caster alignment (the floor caster knows each
  column's wall endpoint and adjusts its first row to match)
- Or: true per-column variable horizon (each column has its own
  effective halfH derived from the wall hit at that column)

All of these are deep refactors into the hot column loop for a
freelook-only cosmetic artifact. Not justified for the patch window.

## Workaround

The artifact is less visible at dawn/dusk (sky and floor colors
converge near the horizon) and invisible during normal gameplay.
Players using freelook extensively will see it as a "heat mirage"
effect at far range — which is actually a reasonable visual metaphor
for the game's exterior biomes.

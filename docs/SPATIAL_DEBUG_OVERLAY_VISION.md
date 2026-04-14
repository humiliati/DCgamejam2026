# Spatial Debug Overlay — Vision

## The problem this solves

Contributors (and Claude) routinely discuss tile geometry in "world
units" — pedestal top at 0.54, emoji lift at 0.35, trapdoor depth at
-0.10 — as if every number lives in the same coordinate system. It
doesn't. Walls use one system (base-wallHeight units anchored at the
floor plane), sprite billboards use another (yAlt fed through a
sprite-projection transform that mixes billboard height, groundLevel
anchoring, fog band, and camera pitch), back-layers use a third
(heightOffset + wallHeightMult from the top of the foreground slab),
and floor-projected caps use yet another (trueHalfH × eyeScale ÷
rowFromCenter).

These four systems all nominally use "world Y," but their visual
output per input-unit is very different. When the rendered frame
disagrees with a contributor's mental model, we currently have no
way to tell which system was miscalibrated — we re-tune by eye,
iterate, and hope. This wastes time and ships subtly wrong art.

**The terminal pedestal episode** is the worst-case form of this
failure: a contributor specifies "pedestal top at 0.54, emoji seated
at 0.60," reads the screen, sees the emoji floating a foot above the
rim, "fixes" it by raising the lift value, and lands with the emoji
on the ceiling. The underlying bug was never geometry — it was two
parties talking past each other because the scales weren't visible.

## Vision

A **Spatial Debug Overlay** rendered into the main canvas behind the
HUD, toggled by a debug key (F2 or `dbg.spatial`). It makes world-Y
visible.

### Primary: global world-Y ruler

A vertical ruler painted on the left edge of the viewport, anchored
to the floor plane (world Y 0) and extending to the ceiling plane
(world Y wallHeight × wallHeightMult for the current floor). Ticks
every 0.1 world units, labels every 0.5. The ruler is projected
through the same raycaster transform the walls use, so its ticks
align with whatever the walls would show at those heights — if a
wall slab is authored at 0.54, its top edge lands exactly on the 0.5
tick +a nudge.

The ruler pulls its numbers from the current `SpatialContract` so it
automatically re-scales between exterior (tall walls, 2–3 units),
interior (2 units), and nested dungeon (1–1.2 units) floors.

### Secondary: per-tile cross-scale

A "spatial probe" helper invokable from the console:

```js
SpatialDebug.probe(gx, gy, { ruler: 'full', showCaps: true });
```

Activates a secondary ruler painted directly on the specified tile's
near face, with ticks in the **same coordinate system the tile
uses** (wall-native for walls, sprite-native for sprites, cap-native
for hasFlatTopCap tiles). Critically, each scale is *labeled with
which system it represents* — so a probe on TERMINAL shows:

```
┌─ pedestal wall ─┐   ┌─ sprite yAlt ─┐   ┌─ cap row-dist ─┐
│ 0.0  ████▬▬▬▬▬▬ │   │ −0.5 ▬▬▬▬▬▬▬▬ │   │ near  ▬▬▬▬▬▬▬▬ │
│ 0.2  ████▬▬▬▬▬▬ │   │  0.0 ▬▬▬▬▬▬▬▬ │   │ mid   ▬▬▬▬▬▬▬▬ │
│ 0.4  ████▬▬▬▬▬▬ │   │  0.5 ▬▬▬▬▬▬▬▬ │   │ far   ▬▬▬▬▬▬▬▬ │
│ 0.54 ▔▔▔▔▔top▔▔ │   │  1.0 ▬▬▬▬▬▬▬▬ │   │ ────────────── │
└─────────────────┘   └────────────────┘   └────────────────┘
```

Contributors can now say "the 💻 should sit at cap-row near, not at
sprite-yAlt 0.5" and everyone is looking at the same picture.

### Tertiary: sprite marker mode

With `SpatialDebug.markSprites = true`, every sprite pushed into
`_sprites[]` gets a small crosshair drawn at its billboard center and
a tag showing `(x, y, yAlt, scale, anchor)`. This catches the exact
bug we just hit — an emoji offset half a tile because of a double
`+0.5` — in seconds instead of iterations.

## Module shape

A single Layer-2 IIFE, `engine/spatial-debug.js`, depending only on
SpatialContract + TILES. Public API:

```js
SpatialDebug.setEnabled(bool)
SpatialDebug.probe(gx, gy, opts)       // or probe(null) to clear
SpatialDebug.markSprites = bool
SpatialDebug.render(ctx, camera)       // called once per frame by Game
```

All rendering lives behind `if (!_enabled) return;` early-outs — zero
cost in release, cheap in debug.

## What it buys us

1. **Coordinate-system disagreements surface instantly.** You can
   literally see that the `lift` scale and the `wallHeight` scale
   differ — no more "I said 0.5, why is it at 1.0."

2. **Spec-to-render round trip shrinks from ~5 iterations to 1.**
   The contributor states a number, the probe shows where that
   number lands on screen, the art either matches or doesn't. No
   guess-and-check.

3. **Regression detection.** Snapshot a probe at authoring time;
   compare on later loads. If a wallHeight contract change shifts
   the tile's silhouette, the probe diff is immediate.

4. **Documentation that doesn't rot.** Screenshots of probed tiles
   go into ARCHITECTURAL_SHAPES_ROADMAP as ground truth for each
   piece of furniture. When someone later asks "how tall is
   TABLE?", the answer is a picture, not a number in prose that may
   or may not match the current contract.

## Adjacent work

This doc should be folded into TEST_HARNESS_ROADMAP.md as a new
section. It's complementary to any visual-regression harness — the
overlay is the *authoring* tool, the harness is the *verification*
tool. Author with the overlay on, verify with snapshot diffs off.

## Definition of done (v1, scoped tight)

- Global world-Y ruler on the viewport's left edge, reading from the
  active SpatialContract. Toggles via `window.dbg.spatialRuler = true`.
- `SpatialDebug.probe(gx, gy)` paints a single scale on the tile's
  near face, labeled with the coord system the tile rendering
  actually uses.
- `SpatialDebug.markSprites` crosshair + tag overlay.
- Zero performance cost when disabled.

v2 can add multi-scale probes, snapshot diffing, and a small
authoring UI — but v1 alone would have saved us the terminal ping-
pong.

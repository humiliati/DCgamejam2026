# raycaster.js Extraction Roadmap

> **Status:** Proposed — raycaster.js is currently **4,729 lines / ~181 KB**
> in a single IIFE. `render()` alone spans lines 631–2181 (~1,550 lines) and
> interleaves DDA casting, wall drawing, back-layer collection, freeform
> cavities, door facade recess, and blit. Agent-assisted edits require
> loading most of the file into context to stay safe.
>
> **Goal:** Split the module into 5–7 focused IIFEs so agents can edit
> individual concerns without risking the per-column hotpath. Target
> core file size: ~2,000 lines.
>
> **Hard constraint:** Do not regress framerate. The per-column DDA loop
> runs ~960× per frame at native resolution. Any extraction that adds
> per-column allocation or indirection must be benchmarked before merge.

## Extraction cost model

Extraction cost is determined by how much *hotpath state* a function reads
or writes. References to global modules (SpatialContract, TextureAtlas,
DoorSprites, Lighting, etc.) are free.

| Rating | Hotpath state touched | Effort |
|--------|-----------------------|--------|
| EASY   | None (pure helpers, editor/tool APIs) | Drop-in: copy out, expose via module, replace call sites |
| MEDIUM | Reads but does not write `_zBuffer` / frame ctx | Needs a frame-context object threaded at render() entry |
| HARD   | Writes to or participates in per-column DDA | Requires careful API stitching; benchmark mandatory |

---

## Shared hotpath state

These closure variables gate what can be split and what must stay
co-located. Any extraction plan must explicitly decide how each is
accessed post-split.

| Symbol | Written by | Read by | Notes |
|--------|------------|---------|-------|
| `_zBuffer` | wall column draw (lines 1426, 2040) | sprite renderer, freeform occlusion | Per-column wall depth. Already exposed via `getZBuffer()`. |
| `_zBufferPedTopY` / `_zBufferPedDist` / `_zBufferPedMX` / `_zBufferPedMY` | freeform cavity render (HEARTH etc.) | sprite renderer (clips sprites behind pedestals) | Four parallel arrays; keep together. |
| `_layerBuf[]` | DDA back-hit collection (1055–1237) | `_renderBackLayer` (2967–3223) | Filled and consumed inside one frame. Fill + render **must stay in same module**. |
| `_renderGrid` / `_renderGridW` / `_renderGridH` | render() entry stash | freeform, floor caster, back-layer loop | Either thread as parameter or expose via core getter. |
| `_width` / `_height` / `_lastHalfH` | `_resize()` | almost every helper | Effectively constants per frame; pass in frame ctx. |
| `_contract` | `setContract()` | every helper | Immutable during a frame. Pass in frame ctx. |

**Recommendation:** Define a single `FrameContext` object that Core
builds once at `render()` entry and passes (by reference) to every
extracted sub-renderer. Shape:

```js
{
  ctx, width, height, halfH, zBuffer, pedZ, // wall-phase outputs
  grid, gridW, gridH, player, contract,     // immutable for frame
  fogColor, lightMap                        // lighting snapshot
}
```

This drops most MEDIUM items to EASY and is the single highest-leverage
piece of shared infrastructure. Build it before Phase 2.

---

## Phase 1 — Zero-risk extractions (~600 lines saved)

These touch no hotpath state and can be lifted nearly verbatim into
new Layer 2 IIFEs. Do them first to validate the split pattern.

### EX-1: Fog / tint helpers → `engine/raycaster-lighting.js`
- **Lines:** 4368–4425 (~80 lines)
- **Functions:** `_applyFogAndBrightness`, `_tintedDark`, `_parseGlowRGB`
- **Deps:** Lighting (global), DayCycle (global). Pure functions otherwise.
- **Consumers:** called by wall, floor, sprite, freeform rendering. Expose
  as `RaycasterLighting.applyFog(...)` etc.; Core re-exports in frame ctx
  if needed for inlined perf.

### EX-2: Texture gap fillers + alpha cache → `engine/raycaster-textures.js`
- **Lines:** 273–488 (~220 lines)
- **Functions:** `_computeAlphaRange`, `_clearAlphaRangeCache`, freeform
  gap filler registry
- **Public API moved:** `registerFreeformGapFiller`, `isFreeformEnabled`,
  `setFreeformEnabled`
- **Holds:** `_gapFillers`, `_alphaRangeCache`, `_freeformEnabled`
- **Consumers:** DoorSprites registers `facade_door` filler at init.
  Replace `Raycaster.registerFreeformGapFiller(...)` call sites with
  `RaycasterTextures.register(...)`.

### EX-3: Editor/tool projection → `engine/raycaster-projection.js`
- **Lines:** 4427–4710 (~290 lines)
- **Functions:** `castScreenRay`, `projectWorldToScreen`, `findTileScreenRange`
- **Deps:** `_canvas`, `_lastHalfH`, `_contract` — all read-only,
  threaded via init or frame ctx.
- **Consumers:** editor tooling + QuestWaypoint. Move the public API
  calls from `Raycaster.*` to `RaycasterProjection.*` (keep a thin
  shim on Raycaster for one release to ease transition).

**Phase 1 total: ~590 lines removed → core ~4,140 remaining.**
Public API on Raycaster shrinks by 5 methods.

---

## Phase 2 — Low-risk extractions (~900 lines saved)

Build `FrameContext` first. Each module below consumes it but does not
mutate shared hotpath state.

### EX-4: Floor / parallax / weather → `engine/raycaster-floor.js`
- **Lines:** 2186–2272, 3225–3428 (~490 lines)
- **Functions:** `_renderFloor`, `_renderParallax`, `_renderWeatherVeil`
- **Holds:** `_floorImgData`, `_floorBufW`, `_floorBufH` (private
  floor-gradient backing store)
- **Hotpath access:** reads `FrameContext` only; does not touch `_zBuffer`
  or `_layerBuf`. Clean consumer.
- **Consumers:** Core calls `RaycasterFloor.render(frameCtx)` once per
  frame, before sprite phase.
- **Risk:** Low. Self-contained floor-space math. Cache buffers stay
  module-local.

### EX-5: Wall column drawing → `engine/raycaster-walls.js`
- **Lines:** 2514–2730 (~400 lines)
- **Functions:** `_drawTiledColumn`, `_drawTiledColumnPixel`, `_hitFace`,
  `_crenelFaceVisible`
- **Holds:** `_wallColImgData`, `_wallColBuf`, `_wallColBufH` (grime
  backing buffer)
- **Hotpath access:** writes `_zBuffer` entry for the column being drawn.
  Core passes the z-buffer reference via `FrameContext`.
- **Consumers:** Core wall phase calls `RaycasterWalls.drawColumn(frameCtx, col, hit)`
- **Risk:** Low-medium. Texture sampling is well-isolated, but the
  column loop calls it ~960× per frame — profile before/after.

**Phase 2 total: another ~890 lines removed → core ~3,250 remaining.**

---

## Phase 3 — Medium extraction: sprites (~1,100 lines saved)

### EX-6: Sprite / particle / wall-decor rendering → `engine/raycaster-sprites.js`
- **Lines:** 3464–3863, 3865–4366 (~1,100 lines)
- **Functions:** `_renderSprites`, `_renderStack`, `_renderCorpsePile`,
  `_renderSubLayer`, `_renderWallDecor`, `_emitParticle`,
  `_updateAndRenderParticles`, `_ensureTintCanvas`, `_hueToRgb`
- **Holds:** `_tintCanvas`, `_tintCtx`, `_particles[]`, `_particleThrottle`,
  `_lastParticleTime`
- **Hotpath access:** *reads* `_zBuffer` and `_zBufferPed*` for occlusion.
  Never writes. Pass both via `FrameContext` (the pedestal arrays already
  need to be exposed so Core's freeform phase can populate them —
  freeform stays in Core for Phase 3).
- **Consumers:** Core calls `RaycasterSprites.render(frameCtx, sprites, dt)`
  after walls/freeform/back-layers are composited.
- **Risk:** Medium. Lots of per-sprite state (facing, bob, tint,
  awareness glyphs, stack FX) but all driven by input args. The main
  test: verify sprite occlusion behind pedestals (HEARTH, etc.) still
  clips at the correct row after the split.

**Phase 3 total: ~1,100 lines removed → core ~2,150 remaining.**

This is the biggest single win for agent tractability — the sprite
renderer is frequently the target of "tweak how X enemy displays" edits
that currently require loading the whole raycaster.

---

## Phase 4 — Optional: carve up the hotpath itself (DEFERRED)

> **Do not attempt before post-Jam voting (after April 25, 2026).**
> This phase touches the per-column DDA loop and can regress framerate
> if mis-shaped.

`render()` splits naturally into three phases on the same `FrameContext`:

- **CastPhase** — DDA front hits + back-layer collection (~650 lines)
- **WallPhase** — per-column wall draw + freeform foreground (~400 lines)
- **CompositePhase** — back layers + floating lids + sprite dispatch + blit (~300 lines)

Done correctly, these become three methods on `RaycasterCore` sharing
one long-lived `FrameContext` scratch object (allocated once, reset
per frame). Done poorly, per-frame object allocation tanks FPS.

**Gating criteria before starting Phase 4:**
1. Capture baseline: native-res framerate on webOS TV target hardware across all three fog types (exterior, interior, nested dungeon).
2. Prototype the split on a worktree; re-measure framerate.
3. Require ≤2% regression to merge. Otherwise revert and leave Core monolithic.

---

## Sequencing summary

| Phase | Target | Core after | Agent-tractability gain |
|-------|--------|------------|-------------------------|
| 1 | Lighting + Textures + Projection | ~4,140 | Public API surface shrinks; cold helpers isolated |
| 2 | Floor + Walls | ~3,250 | Wall-texture edits decoupled from DDA |
| 3 | Sprites | ~2,150 | **Biggest win** — sprite tweaks stop requiring raycaster context |
| 4 | Core split (deferred) | ~1,400 per file | Nice-to-have; framerate-gated |

Phases 1–3 can land in roughly one focused session each. Each PR
should include:

1. The new module file under `engine/raycaster-*.js`
2. `<script>` tag inserted in `index.html` at the correct layer (Layer 2 for all sub-renderers)
3. Old functions removed from raycaster.js; call sites updated
4. Manual smoke test on all three floor types (exterior / interior / nested dungeon) covering each fog mode (FADE / CLAMP / DARKNESS)
5. Verification via the code-review-graph: `detect_changes` should show no broken call edges

## Module dependency graph (post-refactor)

```
Layer 0: (unchanged)
Layer 1: (unchanged)
Layer 2:
  TextureAtlas
  Skybox
  RaycasterLighting    (Phase 1, new)
  RaycasterTextures    (Phase 1, new)
  RaycasterProjection  (Phase 1, new)
  RaycasterFloor       (Phase 2, new)
  RaycasterWalls       (Phase 2, new)
  RaycasterSprites     (Phase 3, new)
  Raycaster            (core — DDA + freeform + back-layer + orchestration)
  Minimap, HUD, ...
```

Raycaster remains the entry point. Sub-renderers are consumers of
`FrameContext`, not peers of Raycaster. No circular deps; each sub-module
can be edited in isolation.

## Out of scope

- Rewriting the DDA algorithm itself. The algorithm works; only its packaging changes.
- Porting to WebGL / WebGPU. Raycaster performance is acceptable on target hardware.
- Texture pipeline changes. TextureAtlas stays untouched.
- Any change that requires altering `SpatialContract` or floor data.

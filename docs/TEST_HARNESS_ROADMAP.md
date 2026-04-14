# Test Harness Roadmap

> **Status:** Phase 0 shipped — `DebugPerfMonitor` covers FPS, frame time,
> stutter log, scene counts, per-subsystem probes, floor-entry capture,
> event rates, DOM/heap deltas. Activated by `test-harness.html`'s
> *Resource tracker* checkbox via `?perfMon=1`.
>
> This doc covers the next two passes: deeper per-subsystem CPU
> attribution (closing the gaps in today's probe coverage) and a
> framerate regression harness that gates Phase 4 of the raycaster split.

## Where we are today

`engine/debug-perf-monitor.js` (~1,200 lines, Layer 5, dev-only):

- Rolling 10s frame window with fps/avg/min, worst-frame, stutter counter
- Stutter log (last 8 entries, timestamped, correlated with floor id + enemy count)
- Floor-entry warmup capture (first 60 frames after floor change, aggregated by probe label)
- Per-subsystem wall-clock probes via `instrumentEngine()` walking `_TARGETS`
- Event-rate counters for mouse/pointer/wheel/key/touch (catches runaway handlers)
- Scene counts + deltas (enemies, particles, DOM nodes) to catch compounding leaks
- Heap MB (Chromium only), canvas resolution, grid dims, animation count
- `copyReport()` emits a text report to clipboard

Activated by `DebugBoot` when URL contains `perfMon=1`. The harness UI
(`test-harness.html`) already has the *Resource tracker* checkbox wired.

## Known gaps

### G1. Core-aliased hotpath calls bypass shim wrapping

`engine/raycaster.js` captures the split sub-modules as closure-local
aliases at IIFE parse time:

```js
var _renderSprites            = RaycasterSprites.renderSprites;
var _renderWallDecor          = RaycasterSprites.renderWallDecor;
var _updateAndRenderParticles = RaycasterSprites.updateAndRenderParticles;
```

`DebugPerfMonitor.instrumentEngine()` handles frozen IIFEs by swapping
the `window.RaycasterSprites` global with an instrumented shim — but the
core's `_renderSprites` reference was captured against the *original*
frozen object and doesn't update. So calls from within `Raycaster.render`
bypass the probe. Only external callers (e.g. editor tools) get timed.

Today's `_TARGETS` entry for `RaycasterSprites`/`RaycasterFloor` is still
valuable (external paths get probed, and it documents intent), but we
don't yet have true per-subsystem attribution for the hotpath.

### G2. Wall-column timing is too hot to wrap per-call

`RaycasterWalls.drawTiledColumn` runs ~960× per frame at native res.
Wrapping with `performance.now()` adds measurable overhead (~1µs × 960
≈ 1ms/frame on mid-tier hardware — enough to distort the number it's
trying to measure). Today wall cost is folded into `Raycaster.render`
as a whole; we can't see wall vs. freeform vs. back-layer separately.

### G3. No deterministic baseline for regression testing

The monitor streams live numbers but doesn't *capture* them against a
known scene. Phase 4 of the raycaster split (`RAYCASTER_EXTRACTION_ROADMAP.md`
§Phase 4) explicitly gates on "≤2% framerate regression" — we have no
mechanism to produce that comparison today.

### G4. Target hardware is webOS TV, not the dev Chrome instance

All profiling currently runs on whatever Chromium the dev is using.
Phase 4's ≤2% gate is explicitly *on target hardware* (LG webOS TV).
The monitor needs a path to export its data off-device for comparison.

---

## Pass 1 — Deep per-subsystem CPU attribution

**Goal:** see per-phase cost of the render hotpath without distorting it.

### P1-A. In-module instrumentation gates

Rather than shim-wrapping from outside, add opt-in instrumentation gates
*inside* each raycaster sub-module and the core. Pattern:

```js
// In raycaster.js core, around each phase dispatch:
var _dpmProbe = (typeof DebugPerfMonitor !== 'undefined')
  ? DebugPerfMonitor.probe : null;

// inside render():
if (_dpmProbe) _dpmProbe.begin('Raycaster.floorPhase');
_renderFloor(frameCtx);
if (_dpmProbe) _dpmProbe.end('Raycaster.floorPhase');
```

Requires adding two new DebugPerfMonitor public methods:

```js
DebugPerfMonitor.probe.begin(label);  // pushes a timestamp onto a stack
DebugPerfMonitor.probe.end(label);    // pops, accrues into _probes[label]
```

These bypass the shim system entirely and feed the same `_probes`
bucket used by `instrumentEngine`. The core holds a cached `_dpmProbe`
reference so the cost in non-debug mode is one null check per phase
(~5 null checks per frame — negligible).

**Target labels** (10 phases inside `Raycaster.render`):
- `Raycaster.skybox`
- `Raycaster.parallax`
- `Raycaster.floorCast`
- `Raycaster.weatherVeil`
- `Raycaster.wallDDA`
- `Raycaster.wallDraw`
- `Raycaster.freeform`
- `Raycaster.backLayer`
- `Raycaster.sprites`
- `Raycaster.blit`

With 10 labels × 2 null-check gates per frame, overhead is in the
microsecond range.

### P1-B. Cohort counters for hot inner loops

For wall-column-style loops too hot for per-iteration timing: accumulate
a *counter*, not a duration, inside the loop; stamp a phase begin/end
*around* the loop. `DebugPerfMonitor` displays counter alongside ms, so
you can see "wallDraw: 4.2ms over 960 columns = 4.4µs/col." Catches
outlier frames that cast far more columns than usual (e.g. freeform
fallback storms).

New API:

```js
DebugPerfMonitor.probe.count(label, n);  // accrues n into calls bucket
```

### P1-C. GameLoop phase split

Today `GameLoop.tick` is one probe. Split into:
- `GameLoop.input`
- `GameLoop.aiTick`         (10Hz bucket)
- `GameLoop.render`         (60Hz bucket)
- `GameLoop.hudPaint`

Same gate pattern — two null checks per phase.

### P1-D. Cross-module probes for compound operations

Some slowdowns live at the boundary between modules (e.g. FloorManager
calling GrimeGrid, which calls back into Raycaster for tile coords).
Add named spans for:
- `FloorLoad.generate`        (BSP + A*)
- `FloorLoad.populate`        (enemies + items + doors)
- `FloorLoad.raycasterHydrate` (SpatialContract + TextureAtlas binding)
- `FloorTransition.fadeAndGo` (door SFX + fade + gen + fade)

These fire on transitions, not every frame — but they're responsible
for the 20-second warmup cliffs the entry-capture window was designed
to catch.

### P1-E. Deliverable

When Pass 1 lands, the Resource Monitor panel should show a *Render
Phases* section listing those 10 labels sorted descending by ms/f, so
a contributor opening any floor can immediately see "oh, freeform is
4.1ms/f on this floor, that's the drag."

---

## Pass 2 — Regression harness (Phase 4 gate)

**Goal:** produce a deterministic, comparable baseline capture so the
raycaster Phase 4 split can be gated on measured framerate regression.

### P2-A. Deterministic scene playback

Input: a JSON scene descriptor.

```json
{
  "id": "promenade-patrol-3s",
  "seed": 0xC0FFEE,
  "floor": "1",
  "spawn":     { "x": 14, "y": 10, "dir": 2 },
  "camera":    { "fov": 60, "halfH": 240 },
  "fogMode":   "FADE",
  "enemies":   "preset:patrol-heavy",
  "particles": "preset:torch-row",
  "route": [
    { "at": 0,    "action": "turnLeft" },
    { "at": 500,  "action": "walk" },
    { "at": 1500, "action": "walk" },
    { "at": 2000, "action": "turnRight" },
    { "at": 2500, "action": "walk" }
  ],
  "duration": 3000
}
```

Playback goes through a new module `engine/scene-player.js` (dev-only,
Layer 5) that:

1. Locks RNG seed.
2. Warps via `FloorTransition.go`.
3. Waits for floor-ready event.
4. Feeds synthesized input through `InputManager.injectEvent(...)` at
   the scheduled offsets.
5. Logs every frame's `DebugPerfMonitor.snapshot()` into a buffer.
6. At duration-end, emits a baseline record.

### P2-B. Baseline record format

```json
{
  "scene": "promenade-patrol-3s",
  "commit": "a1b2c3d",
  "branch": "raycaster-phase4",
  "ua": "...",
  "target": "webos-tv" | "chrome-dev",
  "frames": [ { "ms": 16.2, "probes": {...} }, ... ],
  "summary": {
    "fpsAvg": 58.3,
    "fpsMin": 44,
    "worstMs": 28.1,
    "stutters": 2,
    "probeMsPerFrame": {
      "Raycaster.wallDraw": 4.2,
      "Raycaster.sprites":  2.1,
      ...
    }
  }
}
```

### P2-C. Scene library

Minimum 6 scenes covering the full rendering matrix:
- `exterior-fade-light`      (floor "0", few sprites)
- `exterior-fade-heavy`      (floor "1", full NPC spawn + weather)
- `interior-clamp-light`     (floor "1.2")
- `interior-clamp-heavy`     (floor "2.1" with all dispatcher choreography)
- `nested-darkness-light`    (floor "1.3.1" near entry)
- `nested-darkness-heavy`    (floor "2.2.2" with hero-wake corpse pile)

Each scene runs 3 seconds. Scenes pass if `fpsMin` stays within
configured tolerance of the baseline.

### P2-D. Compare tool

`tools/perf-diff.html` (or CLI `tools/perf-diff.js`):

Input: two baseline records (before/after).
Output: side-by-side table with deltas, flagging any of:
- fpsAvg delta > 2%
- fpsMin delta > 5% (tail latency matters more than average)
- any probe ms/f delta > 10%
- new stutter events

Exit code for CLI mode so CI can gate merges on it.

### P2-E. webOS TV export path

On dev laptop: baselines save to `test/perf-baselines/<scene>.json` next
to the tree, committed.

On webOS TV device: no filesystem write from a webOS app. Options:
1. Display a QR code encoding the baseline (for small records)
2. Post to a local dev server the laptop runs (`python3 serve.py` already
   exists — extend with `POST /perf`)
3. Write to `localStorage`, retrieve over `chrome://inspect`

Recommend option 2 — minimal ceremony, already-present serve.py, works
headless over USB.

### P2-F. Deliverable

When Pass 2 lands, the Phase 4 raycaster split can be gated by:

```bash
git checkout main && node tools/perf-runner.js --out test/perf-baselines/main.json
git checkout raycaster-phase4 && node tools/perf-runner.js --out test/perf-baselines/phase4.json
node tools/perf-diff.js test/perf-baselines/main.json test/perf-baselines/phase4.json
# exits 0 if ≤2% regression, non-zero otherwise
```

---

## Sequencing

| Pass | Scope | Estimate | Depends on |
|------|-------|----------|------------|
| 0 ✅ | `DebugPerfMonitor` ships with live panel + per-subsystem probes via shim | done | — |
| 1 | In-module instrumentation gates; 10 render-phase labels; cohort counters; GameLoop split; cross-module compound spans | 1–2 sessions | Pass 0 |
| 2 | Deterministic scene player; baseline capture; compare tool; scene library; webOS export | 2–3 sessions | Pass 1 (for meaningful per-phase deltas) |

Pass 1 is pure in-module instrumentation — no new test infrastructure.
Pass 2 is new infrastructure (scene-player, baseline format, compare tool)
and depends on Pass 1 so the per-phase probe data in baseline records
is actually useful for attribution of any regression Pass 2 detects.

## Build-vs-contract decision

**Build in-house:**
- Pass 1 across the board. We own the raycaster split and know exactly
  where the phase boundaries are. The in-module gate pattern is two
  lines per insertion site; no specialist skillset required.
- `DebugPerfMonitor` probe API additions (`probe.begin/end/count`).
- Scene library content (knowing which floors + NPC configurations
  exercise which code paths).

**Hand back to test-harness contractor:**
- Pass 2 infrastructure (`scene-player.js`, baseline record format,
  compare tool, webOS export path). This is harness/testing-pipeline
  work with enough complexity to warrant a specialist — and the
  contractor already owns `test-harness.html` and its visual design
  language.
- Any profiling instrumentation that requires webOS-TV-specific APIs
  (if we discover `performance.memory` isn't available and we need to
  hook webOS native perf counters).

## Out of scope

- Rewriting `DebugPerfMonitor` display. The current panel is sized and
  styled for the dev-tools viewport; changes there have no perf gain.
- Real-user perf telemetry. The LG Content Store entitlement doesn't
  include analytics; everything here is dev-time only.
- Changing `test-harness.html`'s visual design. The *Resource tracker*
  checkbox is already wired correctly; no UI work needed.

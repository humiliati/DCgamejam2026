# ADR — Raycaster Pause / Resume for Takeover-Mode Minigames

**Status:** Proposed, 2026-04-16
**Depends on:** `MINIGAME_ROADMAP.md` §4.6 (world-pressure + viewport-mode axes)
**Blocks:** any Tier 2+ minigame declaring `viewportMode: 'takeover'`
**Owner:** engine / rendering

---

## 1. Context

`MINIGAME_ROADMAP.md` §4.6 introduces a `viewportMode` axis for captured-input minigames. Three values: `overlay` (raycaster keeps drawing under a floating minigame panel), `dimmed` (raycaster keeps drawing at 30-50% opacity with a vignette), and `takeover` (raycaster stops drawing entirely and the minigame owns the full viewport).

`takeover` exists because grid-based minigames (FUNGAL_HARVEST-as-minesweeper, TETRIS_STACK, LIGHTS_OUT, MATCH_THREE, etc.) need the ~10-14ms/frame that the raycaster currently spends on DDA, texture sampling, sprite compositing, and fog. Trying to render a dense minigame grid on top of a live 3D viewport will blow the frame budget, especially on webOS TV hardware where our target is 60fps at 1280×720.

The raycaster's current entry point is:

```js
// engine/game.js:4152 — inside the per-frame render loop
Raycaster.render(
  { x: renderPos.x, y: renderPos.y, dir: renderPos.angle + p.lookOffset + shakeOffset,
    pitch: p.lookPitch || 0, bobY: MC.getBobY() },
  floorData.grid, floorData.gridW, floorData.gridH,
  _sprites, lightMap
);
```

Several sibling renderers run immediately after and depend on the raycaster having just written the frame: `SpatialDebug`, `SpriteLayer`, `LightOrbs`, `SprayViewportFX`, `CobwebRenderer`, `CobwebNode`, `WorldPopup`. The z-buffer is exposed via `Raycaster.getZBuffer()` for occlusion tests in those modules.

World simulation (enemy AI at 10Hz, time progression, the §4.6 interrupt queue) must continue ticking during `takeover`. Only the *visual* render of the world is paused.

## 2. Decision

Add four public methods to the `Raycaster` IIFE's frozen return block. Add a gate in `game.js`'s render loop that skips the world-render layer cluster when the raycaster is paused. Do not extract a new "WorldRender" umbrella module — that's a larger refactor and we don't need it to ship `takeover`.

### 2.1 API

```js
Raycaster.pause()              // capture last frame, stop rendering, free frame budget
Raycaster.resume()             // release capture, resume rendering on next frame
Raycaster.isPaused()           // boolean — read from render loop + minigame modules
Raycaster.getPausedFrame()     // HTMLCanvasElement | null — the frozen still, for diegetic backdrops
```

- `pause()` is idempotent. Second call while paused is a no-op.
- `resume()` is idempotent. Call while not paused is a no-op.
- `getPausedFrame()` returns `null` when `!isPaused()`.
- The paused frame is captured by `drawImage()` onto a lazily-allocated offscreen `HTMLCanvasElement` sized to the main canvas. Not an `ImageData` — `drawImage` round-trips are faster than `putImageData` on all target browsers.
- On `resume()`, the offscreen canvas is *retained* (dimensioned once, reused) but its contents are no longer considered authoritative. This avoids allocation churn if a player bounces in and out of `takeover` minigames in a session.

### 2.2 Render loop gate

`game.js`'s render loop grows one branch around the world-render cluster:

```js
if (typeof Raycaster !== 'undefined' && Raycaster.isPaused()) {
  // Skip the entire world-render cluster:
  //   Raycaster.render, SpatialDebug, SpriteLayer, LightOrbs,
  //   SprayViewportFX, CobwebRenderer, CobwebNode, WorldPopup,
  //   WeatherSystem particle render
  // HUD + overlay renderers (MinigameExit, Toast, DialogBox, etc.)
  // continue to run as normal.
} else {
  WeatherSystem.tick(...);
  Raycaster.render(...);
  SpatialDebug.render(...);
  SpriteLayer.tick(...);
  LightOrbs.render(...);
  // ... etc.
}
```

**The paused frame is not drawn by the render loop.** The minigame that called `pause()` is responsible for deciding what backdrop to use — black, the frozen still, a blurred version of the still, or its own composition. If it wants the still, it calls `Raycaster.getPausedFrame()` and `drawImage`'s it onto the main canvas inside its own render pass. This keeps render responsibility unambiguous: when paused, the world draws nothing; the minigame owns the frame.

### 2.3 World-tick continues

`GameLoop` runs at 10Hz for game logic (enemy AI, awareness decay, time of day). That loop is not touched by this ADR. It keeps running during `pause()`. `MovementController.tick()` at 60fps inside the render loop also keeps running, so input queue drains and player rotation animations keep ticking even though nothing draws them — this matters because on `resume()` the world picks up exactly where it left off with no state seam.

### 2.4 Integration points

- **MinigameExit.mount()** — for any kind registered with `viewportMode: 'takeover'`, call `Raycaster.pause()` after the grace timer starts. The frame that gets captured is the frame right before the minigame UI starts compositing over it — which is what the player just saw, clean.
- **MinigameExit.unmount()** — always calls `Raycaster.resume()`. Idempotent safety net: even if the minigame's author forgot to handle resume, the exit contract does.
- **MinigameExit.raiseInterrupt() committed** — same path as user-initiated unmount; `onCommit` fires, `unmount()` runs, raycaster resumes before combat/dialogue takes over.
- **FloorTransition** — does *not* call `pause()`. Floor transitions have their own fade overlay and rely on the raycaster continuing to draw during the crossfade. This ADR's pause API is scoped to minigame takeovers.
- **Debug/perf monitor** — `debug-perf-monitor.js` instruments `Raycaster.render` call costs. When paused, it sees zero calls and should record the pause window as a separate line item ("paused: 12 frames, 200ms") rather than treating it as a 0ms-per-frame anomaly. Small change in the perf monitor's summary generator.

## 3. Consequences

### Positive

- Minigames in `takeover` mode get ~10-14ms of frame budget back. That's the entire raycaster hotpath, plus the sibling renderers that piggyback on its output.
- The pause/resume surface is small (four methods, one gate branch in the render loop). No sibling module has to know about takeover — they just don't run.
- The frozen still as a retained offscreen canvas means memory cost is bounded: one canvas = ~1-2MB for a 640×400 RGBA frame. Doesn't grow per minigame.
- Game world keeps simulating behind the scenes. Enemies still path, the interrupt queue still fires, audio still plays from world positions. The player's immersion channel during `takeover` is audio + the MinigameExit banner, which is consistent with §4.6.
- Resume has no visual seam — the world state that was already advancing shows up already-moved on the next drawn frame. No "world teleports" feeling.

### Negative

- Sibling renderers that rely on `Raycaster.getZBuffer()` (e.g. `CobwebRenderer`, `SpriteLayer` occlusion tests) will see stale z-buffer data if they somehow run during pause. The gate in `game.js` prevents this by skipping them, but any new sibling renderer needs to respect the pause contract. **Mitigation:** add a harness check — the harness runs `Raycaster.pause(); for each sibling renderer { assert renderer.render called 0 times }` during a takeover sweep.
- Player position + direction continue to update during `takeover` (MovementController still ticks). If an input leak lets WASD through to the movement queue during a captured-input minigame, the world advances invisibly and the player "teleports" on resume. **Mitigation:** `InputPoll` already consults `MinigameExit.isActive()` to gate movement input; verify this still holds with captures + takeover combined in the harness.
- Debug-perf-monitor needs a small adjustment to not treat paused frames as anomalies. ~20 lines.
- There's a risk of the offscreen canvas going stale on resize. **Mitigation:** on canvas resize (already handled by the existing `_onResize` path), invalidate and reallocate the offscreen on next `pause()`.

### Neutral

- DOM overlays (`SpriteLayer` CSS flames, `WorldPopup` DOM popups) keep their DOM nodes in place during pause but stop being repositioned. They'll appear frozen behind the minigame. This is fine for `takeover` (the minigame covers them) but would be visible for `overlay` / `dimmed` modes, which is why those modes do not pause the raycaster. The three-value axis makes this clean.

## 4. Alternatives considered

**Alternative A — leave the raycaster running at reduced resolution during takeover.**
`Raycaster.setRenderScale(0.5)` already exists. Drop the scale, let the grid minigame render on top. Rejected: saves ~4ms but still pays for DDA, texture sampling, z-buffer fills, sprite compositing that the minigame can't see. Also bakes a permanent visual downgrade into every takeover minigame (the tiny sliver of raycaster visible at edges would be chunky).

**Alternative B — introduce a full WorldRender umbrella module that owns Raycaster + all sibling renderers and gates them as a unit.**
Cleaner long-term API (one `WorldRender.pause()` instead of scattered gates). Rejected for now: bigger refactor, touches every file in the world-render cluster, and we can always promote to this later if the sibling list grows. Four methods on Raycaster + one gate in game.js gets us takeover shipping this arc.

**Alternative C — minigames always get a separate overlay canvas stacked on top of the main canvas via CSS z-index, no pause needed.**
Simple, but doesn't solve the frame-budget problem — the raycaster still runs, the GPU still composites both canvases every frame, and WebKit on webOS has historically had weak multi-canvas compositing. Rejected for the takeover use case. (This approach might still be right for `overlay` mode, but that's out of scope for this ADR.)

**Alternative D — capture via `ImageData` + `putImageData` instead of offscreen canvas + `drawImage`.**
Slightly smaller API surface (no retained canvas). Rejected: `putImageData` is ~3-5× slower on all target browsers and bypasses GPU compositing, which matters on frames where the minigame wants a blurred-still backdrop (blur via `ctx.filter` only works on `drawImage` sources).

## 5. Implementation checklist

- [ ] `engine/raycaster.js` — add `_paused`, `_pausedFrame` (offscreen canvas, lazily sized), `pause()`, `resume()`, `isPaused()`, `getPausedFrame()`. Expose in the return block. ~40 LOC.
- [ ] `engine/raycaster.js` — on canvas resize, invalidate `_pausedFrame` so it gets re-sized on next `pause()`. ~5 LOC.
- [ ] `engine/game.js` — wrap the world-render cluster (lines ~4148-4200 today) in an `if (!Raycaster.isPaused())` branch. Keep HUD/overlay/MinigameExit render calls outside the gate. ~10 LOC delta.
- [ ] `engine/minigame-exit.js` — in `mount()`, if the registered kind has `viewportMode === 'takeover'`, call `Raycaster.pause()` after grace starts. In `unmount()`, always call `Raycaster.resume()`. ~15 LOC.
- [ ] `engine/minigame-exit.js` — expose `getPausedFrame()` helper that proxies to the raycaster, so takeover kinds don't need to reach across modules for the backdrop.
- [ ] `engine/debug-perf-monitor.js` — treat paused frames as a separate line-item, not anomalies. ~20 LOC.
- [ ] `minigame-harness.js` (future §6 work) — harness check: during a simulated takeover sweep, assert no sibling world renderer fires, and assert resume restores state without a visible seam. ~30 LOC.
- [ ] Write a smoke test in the test-gallery floor (1.9) — mount a null takeover minigame, confirm raycaster stops, confirm world ticks continue, confirm resume is clean. ~20 LOC.

Total engineering cost estimate: small — ~150 LOC across four files, no new modules. Appropriate for a one-arc implementation before the first `takeover` kind (likely FUNGAL_HARVEST-as-minesweeper) needs it.

## 6. Open questions

- **Should `pause()` also pause the 10Hz `GameLoop` game tick?** Current answer: no. Enemy AI must keep ticking so the interrupt queue can fire mid-minigame. If a specific minigame wants a safe-zone feel, it should declare `worldPressure: 'invulnerable'` (which suppresses enemy aggression ticks per §4.6) rather than pausing the whole game loop.
- **Should `getPausedFrame()` offer a pre-blurred variant?** Current answer: no, let the minigame blur via `ctx.filter = 'blur(4px)'` before its own `drawImage` call. Keeps the raycaster's API surface minimal and lets each minigame tune its own backdrop feel.
- **Cross-floor invalidation** — if the player somehow triggers a floor transition during a takeover (they shouldn't, but `FloorTransition` is orchestrated elsewhere), the paused frame is from the wrong floor. Current answer: `FloorTransition.start()` should assert `!Raycaster.isPaused()` and warn if violated. The interrupt-queue design in §4.6 already prevents the reachable paths, but an assert catches regressions.

---

*When the first `viewportMode: 'takeover'` kind ships, promote this ADR from Proposed to Accepted and delete this line.*

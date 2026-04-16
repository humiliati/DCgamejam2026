# Pressure Washing — PWS Teardown & Polish Brief

**Created**: 2026-04-15 | **Author**: rework/refine planning pass
**Companion docs**: `PRESSURE_WASHING_ROADMAP.md` (original plan), `PRESSURE_WASH_SYSTEM.md` (what ships today), `MINIGAME_TILES.md` (next arc after this one).
**Chosen pillars**: Audio-visual juice + Methodical, low-stakes zen.
**Chosen gyro role**: Full proprioceptive rig — wire all six Magic Remote harness hooks.
**Working style**: attack easy targets, test, regroup up the chain, exhaust the PW roadmap, then pivot to `MINIGAME_TILES`.

---

## 1. Why Power Wash Simulator is actually a hit

PWS looks like a toy, but it ships three interlocking loops that feed each other. Most "relaxing cleaning games" get one and call it done; PWS gets all three and that is what pinned it to Steam charts and Game Pass front pages.

**Loop A — Stroke satisfaction (per second).** You pull the trigger, grime disappears where the cone lands. The dirty→clean transition is continuous, not stepped; you can see *exactly* where your last stroke ended. Water droplets streak off the surface, a pitched hiss modulates with the material underneath, and the background ambient drops slightly so your tool is the thing you hear. Every single second of holding the trigger returns a clear visual and audible delta. This is the zen pillar's atomic unit.

**Loop B — Object completion (per minute).** Each "object" (a chair, a pane of a fence, a hubcap) has a sub-percentage readout. You get a ping when an object crosses 100%, the object name briefly appears, and a soft chime confirms it. The list in the pause menu shrinks. This loop rewards methodical sweeping — *finish what you started before moving on* — and it is what turns the stroke loop into hours of play. Without it, PWS is screensaver-adjacent.

**Loop C — Job completion (per session).** A dirty scene becomes a clean scene. The whole van, playground, or firetruck goes from grimy to gleaming over 45 minutes. There's an end-of-job photo mode moment. Progression across jobs unlocks better tools.

**What PWS deliberately refuses to do.** No timer. No fail state. No enemy. No hunger. You can't damage anything. You can put the controller down mid-sweep, go to the bathroom, come back, and nothing will have changed. This is the low-stakes contract: the player's attention is earned, not demanded. Subtract that, and the stroke loop becomes work.

**The audio move nobody copies.** PWS uses ~5 distinct water-on-surface audio samples (wood, metal, glass, concrete, fabric) and crossfades between them based on surface material. The pitch shifts slightly with beam distance — nearer = higher, farther = duller. Grime level modulates the low-pass filter: caked grime sounds muffled, clean surfaces sound bright. All of this is happening constantly and almost none of it is ever consciously noticed. It's the single biggest reason the game feels tactile.

## 2. What Dungeon Gleaner already has (as of 2026-04-06)

Per `PRESSURE_WASH_SYSTEM.md`, PW-1 through PW-3 ship:

- Grime grid exists at 64×64 on walls, 4×4 on floors. Memory is fine.
- Hard-edge Euclidean kernel on walls, soft-falloff Chebyshev on floors. The MS-Paint-eraser "squeegee" feel is there when you aim.
- `castScreenRay()` gives us subcell-precise pointer aim. Bresenham stroke interpolation distributes strength across fast sweeps. Slow sweeps one-shot; fast sweeps need 2–3 passes. That velocity-aware feel is *already implemented* and it's the PWS Loop A primitive.
- `WaterCursorFX` particle system exists (180-droplet pool, cyan gradient droplets, gravity, friction, wobble) but is currently scoped to menu hover feedback, not the in-world spray.
- Grime tint renders per-pixel on wall columns. Clean regions pop visually.
- Torch extinguish via spray is wired, including the "destroys dry fuel" asymmetric penalty vs. careful TorchPeek.

What we **don't** have yet: the object-completion chime loop (Loop B), material-responsive audio (the thing that sells PWS), the reel-up exit (PW-4), the nozzle equip/variety (PW-5), and — critically for this effort — any gyro integration. `GyroInput` is a placeholder in comments only.

## 3. Gap analysis — what stands between us and "feels like PWS on a Magic Remote"

The stroke primitive is good. The loop hierarchy above it is thin. The audio pillar is missing entirely. The progress legibility loop depends on us defining what the "object" is in a dungeon-crawler context (PWS has discrete nameable objects; we have rooms of grime).

The good news: everything on this list is additive. Nothing requires re-architecting the grime grid or the raycaster hot path. The pipeline in `PRESSURE_WASH_SYSTEM.md` was designed with these hooks in mind.

| PWS pillar | Gleaner status | Effort to parity | Easy target? |
|---|---|---|---|
| Stroke continuous reveal | Shipped | — | — |
| Water droplet streak off beam point | Missing (FX only in menus) | S | **Yes — first target** |
| Surface-material hiss crossfade | Missing | M | Yes — second target |
| Pitch-shifted beam hiss | Missing | S | Yes — bundled with above |
| Grime-muffled → bright low-pass sweep | Missing | S | Yes — bundled |
| Per-subtarget % readout | Missing | M | Yes — third target |
| Completion chime on sub-target 100% | Missing | S | Yes — bundled with readout |
| Checklist of remaining sub-targets | Missing | M | Stretch — post-readout |
| Before/after snapshot | Missing | L | Post-jam |
| Nozzle variety with distinct feel | Scaffold only (fan/cyclone unused) | M | PW-5 |
| Reel-up auto-exit | Missing | M | PW-4 |
| **In-world hose body / tile decal path** | **Missing** — minimap polyline is the only visualization; floor carries nothing | **M** | **Yes — promoted ahead of audio (see §5 Rungs 2A–2F and §11)** |

## 4. The Magic Remote as the star — full proprioceptive rig

The pitch: **treat the LG Magic Remote like a Wii Remote made of water.** The player holds it the way they'd hold a real wand-style pressure washer — loose grip, dominant hand, pointed at the TV. Every physical signal the IMU emits maps to a spray property. This is what differentiates Dungeon Gleaner from PWS on any other platform and is the single strongest thing we have for LG Content Store pitch materials.

Six signals, all six wired. The signal list, tuning notes, and what each one buys us:

**Signal 1 — Yaw angular velocity → stroke speed.** Today `_strokeLength / 3` is computed from pixel distance between successive pointer samples. Replace the source: `velocity = GyroInput.getYawRate()` in deg/s. The stroke-length math is unchanged; only the input is continuous now instead of pixel-quantized. Payoff: at very slow sweeps (the *satisfying* ones), the game can distinguish "holding perfectly still" from "moving 0.3°/s" and reward the latter with continuous deep-clean ticks. The pointer alone can't see motion smaller than one pixel.

**Signal 2 — Roll angle → brush rotation.** The fan nozzle becomes a line, not a circle, and the line rotates with the remote. Hold flat → horizontal squeegee. Rotate 90° → vertical squeegee. This is the single most physical-feeling mapping on the list and is the demo-reel money shot. Cost: small refactor of `cleanKernelHard` to accept an orientation angle and stamp an elliptical/rect mask. Existing circle kernel is the `roll = 0` special case.

**Signal 3 — Pitch angle → brush eccentricity.** Tilting the remote up/down deforms the brush from circle toward ellipse. Pointing flat = round spot; tilted = pinched oval. Combines with Signal 2: roll + pitch together lets the player *sculpt* the spray cone in real time. The cone widens as you lift the tip — physically correct, and it reads instantly.

**Signal 4 — Forward acceleration (Z-thrust) → pressure boost.** Jab the remote toward the TV and the beam intensifies for a brief window. This is the "lean in" gesture and it's how the player signals commitment on a stubborn patch. Gated by a low-pass filter, a threshold, and a cooldown (no remote-shaking exploit). The reward is a 1.5–2.0× strength multiplier for ~500ms. Audio: deeper hiss, brighter hit. Visual: beam thickens, particles double. This is cathartic and you can feel it in your forearm.

**Signal 5 — Sub-pixel aim delta → aim fusion.** The webOS pointer service already converts gyro → screen position, but with latency and pixel quantization. Read the raw gyro delta in parallel and add it to the screen-derived subcell as a sub-pixel offset. Net effect: one fewer frame of latency and no skipped subcells during fast sweeps at the 64×64 wall resolution. Invisible individually; cumulative feel is "the beam is attached to my hand, not to the cursor".

**Signal 6 — Angular velocity histogram → adaptive feel.** Log the player's velocity distribution over a session. Players with steadier hands get a slightly gentler speed penalty; players with tremor get the same. This is the accessibility move and it's cheap — a rolling histogram updated every spray tick, used to bias the `/3` feel divisor.

**Graceful degradation.** All six signals fall back to today's screen-pointer pipeline if `GyroInput` is null or reports unavailable. Keyboard/gamepad players still get the game; gyro players get the wand.

## 5. The attack ladder (easiest → hardest)

Each rung lands independently, can be tested, and adds juice without regressing anything. Stop and regroup between rungs.

**Rung 1 — Beam-point water droplets.** [SHIPPED.] Repurpose `WaterCursorFX` (or fork a new `SprayDropletsFX` using the same pool pattern) to spawn droplets at the *in-world beam hit point* projected back to screen space, not at the pointer. Spray while active → a trail of cyan droplets fans off the hit subcell, arcs under gravity, fades. Budget 30–40 droplets on-screen. Trivially scoped, massive perceived-juice delta. Shipped via `engine/spray-droplets-fx.js`.

---

### Hose-drag visualization arc (Rungs 2A–2F)

**Rationale for reshuffle:** the dungeon-crawling frame gives us a verb PWS cannot have — *pathing your hose through a grid the camera can see*. The minimap already renders a polyline; the 3D viewport shows nothing on the floor. Before we deepen the stroke loop with audio, we land the primitive that unlocks crossed-hose puzzles, flow-squeeze mechanics, and procgen contracts keyed on hose pathing. Full design rationale in §11. Rungs 2A–2F land between Rung 1 and the audio work; everything on the audio/gyro/reel/nozzle side renumbers by two.

**Rung 2A — HoseDecal data module.** New Layer 1 IIFE `engine/hose-decal.js`. Data-only, no rendering. Extends the flat `{x, y, floorId}` path in `HoseState` into per-tile *visit records*: keyed by `"x,y,floorId"`, each value is `{ visits: [{ entryDir, exitDir, visitIndex }], crossCount }`. Hooks `HoseState.recordStep` and `HoseState.popLastStep` (subscribe to the existing hose events or add a pair of direct-call hooks; both modules are Layer 1 so either works) and updates the visit ledger on every step/retract. Public API: `getVisitsAt(x, y, floorId)`, `isCrossed(x, y, floorId)`, `iterateFloorVisits(floorId)`, `clearFloor(floorId)`. **This is the primitive everything else in the arc is built on.** Ship first — it's pure data, trivially testable, and unblocks 2B/2C/2D in parallel.

**Rung 2B — Minimap hose-stripe rendering.** Replace `HoseOverlay`'s polyline with per-tile stripes drawn from `HoseDecal`. Stripe geometry uses edge-midpoint convention for seamless tile-to-tile connections: entry-edge midpoint → tile center → exit-edge midpoint, via quadratic Bézier for 90° turns, straight line for straight-through, tight half-loop for U-turn. Half-stripe with pulsing glow marks the head of the hose (no exit direction yet). Crossed tiles (`crossCount ≥ 2`) get an X composed of two stripes plus a cyan flash on player step-on. Origin marker (truck) stays yellow as today. Zero raycaster touch; pure canvas2d. **This is the proof-of-concept for Rung 2C** — if edge-midpoint stripes read cleanly on the 160×160 minimap, the 3D version will read on the floor.

**Rung 2C — 3D viewport floor decals.** Extend `RaycasterFloor`'s per-column UV sampler to composite a per-tile 32×32 offscreen canvas over the floor texture. The canvas is owned by `HoseDecal` (one per visited tile, same data that feeds 2B but painted onto floor coordinates). Rendering route — *decal via floor sampler*, chosen over polyline/billboard alternatives — is the only option that preserves wall occlusion correctly, because the floor sampler already runs per-column behind the existing z-buffer. Cache the 32×32 canvas per tile; invalidate only on visit change for that tile. **Perf budget: ≤1.5 ms added to render on Hero's Wake B2** (deepest/densest test floor). If we blow the budget, fall back to a coarser 16×16 canvas or render only within 6 tiles of the player.

**Rung 2D — Player tile-step awareness.** Fire a tile-entry event when `MC` grid-snap crosses a tile boundary (MovementController already knows, just expose it). On entry, check `HoseDecal.isCrossed()` or `getVisitsAt()`. If the player is standing on their own hose: subtle "pinch" audio cue, ripple on the decal, and flip a `HoseState._localSqueeze` flag for the next N ticks. Hook consumed by `spray-system.js` as cosmetic pressure flutter for now — the mechanical bite lands in 2E.

**Rung 2E — Flow-squeeze gameplay.** Upgrade 2D's cosmetic squeeze into a mechanic. Stepping on a single-run tile: −10% pressure. Stepping on a crossed tile: −30% pressure. Heavy enemies or large breakables sitting on a crossed tile: −100% (beam stops until you move the obstruction or re-route). Numbers are first-draft and tune with playtesting. This is the gameplay axis PWS literally cannot have — *route your hose so your firing position isn't on your own line* — and it earns the arc its place ahead of audio work.

**Rung 2F — Procgen hose-pathing contracts.** Extend `SpatialContract` with hose-aware fields: `hoseBlockTiles` (tile types that refuse hose pathing — lava, pits, spike runs), `hoseCrossPenalty` (per-floor multiplier for 2E's squeeze), `maxFlatPathLen` (tiles of hose beyond which pressure falls off even without kinks). Floor generators start placing dungeon geometry with hose pathing in mind — chokepoints that force a cross, long halls that need zigzag retraction, doors that pinch the hose midway. **This is where the pressure-wash system stops being a sub-mechanic and becomes a primary puzzle axis of the dungeon.** It is also what turns the living infrastructure on 0–3 (per CLAUDE.md floor hierarchy) into pressure-wash level design, not just combat level design.

---

### Resume PWS pillar work (renumbered)

**Rung 3 — Material-aware hiss + pitch + low-pass.** [was Rung 2.] Add an `AudioSystem` spray channel. Pick 3 starter materials (stone/masonry, wood, metal) based on the wall texture atlas tag. Crossfade between 3 loops based on which material the hit tile maps to. Modulate pitch ±15% based on `perpDist` (nearer = higher). Modulate low-pass cutoff based on grime level under the beam (caked = 800Hz, clean = 8kHz). This is the single highest-leverage change on the *audio* side — it's what makes the game feel like PWS rather than a tech demo of PWS.

**Rung 4 — Sub-target percentage readout.** [was Rung 3.] Define "sub-target" as a connected grime component (flood-fill on wall tiles that share an edge and both carry a grime grid). Each sub-target gets an id, a discovered name from a procgen table ("north wall above the cellar door", "pew bench #2"), and a 0–100% readout that ticks up as you clean. HUD element: small bottom-right pill, only visible while beam is active, showing the currently-aimed sub-target and its %. Completion → soft chime + the name briefly swells and fades. **This is the Loop B primitive and it's what turns the stroke loop into session-length engagement.**

**Rung 5 — GyroInput module (Signals 1, 5 first).** [was Rung 4.] Build `engine/gyro-input.js` (Layer 0 or 1, data-only, IIFE). Expose `getYawRate()`, `getPitchRate()`, `getRollAngle()`, `getPitchAngle()`, `getForwardPressure()`, `getAimDelta()`. Back it initially with a **simulator** that derives these from keyboard/pointer when real gyro isn't present — this unblocks all subsequent gyro work without needing the webOS hardware in the loop. Wire Signal 1 and Signal 5 into `spray-system.js` behind a feature flag. Test in Brave with the simulator.

**Rung 6 — Signals 2 & 3 (roll/pitch-shaped brush).** [was Rung 5.] Teach `cleanKernelHard` to accept `{ rotation, eccentricity }`. Orient the stamp. Animate a matching on-screen reticle that shows brush shape (rotating oval). This is the demo-reel moment.

**Rung 7 — Signal 4 (forward-thrust pressure boost).** [was Rung 6.] Low-pass filter, threshold, cooldown. Visual: beam thickens, particle count doubles for ~500ms, audio drops a semitone and gains saturation. Clear UI tell (remote-jab icon pulses). This is the signature gesture.

**Rung 8 — PW-4 Reel-up auto-exit.** [was Rung 7.] With spray feeling good and the hose now a visible floor-painting entity (Rungs 2A–2F), the reel-up lands into a system the player actually wants to go back to *and can see retract behind them*. Reverse the HoseState path, feed to MC step-by-step, shrink the minimap stripe and 3D floor decal as the player retraces. Gate click-to-move distance on minimap to 5 tiles. Interruptible by combat. **Note:** the decal system from 2C is a prerequisite for the reel-up reading visually — the hose retracting on the floor is one of the satisfactions PWS can't offer and we should lean into it here.

**Rung 9 — PW-5 Nozzles with real identity.** [was Rung 8.] Fan = long line brush (Signal 2 rotates it). Cyclone = oscillating offset (Signal 7's thrust amplifies the oscillation). Prism (post-jam) = three beams. Turbo (post-jam) = narrow-and-fast. Register in CardAuthority, equip slot, loot tables.

**Rung 10 — Signal 6 (adaptive feel histogram).** [was Rung 9.] Cheap, invisible, huge accessibility win. Ships after everything else because it's a tuning knob, not a feature.

After Rung 10 the PW roadmap is exhausted. That's the fresh-post-jam milestone: a pressure-washing system whose stroke feels better than PWS on any other platform, whose hose is a visible dungeon-pathing element PWS can't have, whose audio sells the material under the beam, whose sub-target readout gives the player something to finish, whose remote integration is the actual reason you buy an LG TV to play it.

## 6. What the new PW roadmap looks like (draft)

When Rung 10 lands, archive `PRESSURE_WASHING_ROADMAP.md` and replace it with a forward-looking doc covering: re-contamination and grime regrowth, per-pixel residual streaking, volumetric beam fog (the signature post-jam look), phase-locked grime, sundog alignment mechanic, hidden sigils revealed only under specific beam modes, co-op mode (two Magic Remotes, two beams, one dungeon — obvious content-store marketing beat), trap re-arm via hose, and — new since the 2A–2F reshuffle — **dungeon puzzles built around hose pathing as a first-class geometry constraint** (room layouts that only have one un-crossed solution, timed pressure windows while hose pinch is active, boss arenas where the hose is the puzzle). Most of the older items are listed in §12 of the current roadmap as "post-jam vision" and can migrate directly; hose-pathing puzzles are a new pillar that grows out of Rung 2F.

## 7. Pivot to MINIGAME_TILES after PW exhausted

Per the survey in `MINIGAME_TILES.md`, the bar-counter clicky model has nine Tier-1 and Tier-2 candidates waiting. The strongest for carrying the pressure-wash framing are **NEST (sweep clicky)** and **DUMP_TRUCK (prime-the-pump)** — both share the cleaning verb family and can reuse `WaterCursorFX`, the surface-material audio system, and (for prime-the-pump) the Signal 4 thrust-gesture path. **WELL** and **ANVIL** are next in line because they establish the bar-counter phase model for interactions that *aren't* cleaning, which is what unblocks the rest of the tier.

Proposed minigame ladder after PW:
1. NEST (reuses most of PW audio + FX infrastructure — shortest path to a second "clicky" shipping)
2. WELL (establishes the bar-counter phase contract for non-cleaning verbs)
3. DUMP_TRUCK (prime-the-pump — ties the minigame tier back to the hose pickup flow, narrative payoff)
4. ANVIL (forge tap — new audio material, new particle palette, foundry flavor)
5. SOUP_KITCHEN, BARREL, FUNGAL_PATCH, CHARGING_CRADLE, SWITCHBOARD, NOTICE_BOARD, COOKING_POT — fill out the Tier-1/2 set.

But we don't commit to that ordering until PW Rung 10 ships; the current state of the game may reveal a different natural next target.

## 8. Open questions to regroup on

- **Sub-target discovery UX.** PWS labels objects like "chair, backrest, left". We can auto-label from tile position ("north wall, high") or hand-author names per floor. Auto is cheaper, hand-authored reads better in a narrative game. Probably: auto for jam, gradually replace with hand-authored as the conspiracy arc wants to drop dialog ("the stain above the cellar door — you notice it's shaped like…").
- **Audio sample source.** For material-aware hiss, do we record/synthesize our own or license a small pack? AudioSystem is vanilla WebAudio; both paths are open. Recommend synthesizing with the existing noise-generator helpers (already used elsewhere in the engine) — keeps the offline/LG Content Store ship contract clean.
- **Gyro simulator mapping.** For desktop testing, mouse X/Y deltas → yaw/pitch rate is obvious. What about roll? Probably Q/E or the scroll wheel. Forward thrust → spacebar hold. Document these in `docs/GYRO_SIMULATOR_KEYS.md` when the module lands.
- **Does the reel-up (Rung 7) benefit from a gyro gesture?** Probably yes — a "pull toward you" sustained thrust could trigger reel-start, matching the physical pump-to-wind metaphor. Worth a small experiment after Rung 6.

## 9. First concrete action out of this brief

**Rung 1 shipped.** `engine/spray-droplets-fx.js` landed with strokeVx/strokeVy-aware emission; `spray-system.js` _burstFx now drives it; viewport carry-tint + wet spatter round out the lens-level feel pass.

**Rung 2A shipped (2026-04-16).** `engine/hose-decal.js` landed at Layer 1, wired into `index.html` between `hose-state.js` and `hose-overlay.js`. Pure data module: per-tile visit ledger keyed `floorId → "x,y" → {visits: [{entryDir, exitDir, visitIndex}], crossCount}` with monotonic `visitIndex` for unambiguous retraction. Subscribes to `HoseState` events (attach/step/pop/detach); a new `pop` event was added to `HoseState._listeners` as a pure-additive change so `popLastStep()` notifies observers. Public API: `getVisitsAt`, `isCrossed`, `iterateFloorVisits`, `getHead`, `getTileCount`, `getVersion`, `rebuildFromState`, `clearFloor`, `debugSnapshot`, `reset`, `_wireHoseState`. Verified with a stubbed harness (`outputs/hose-decal-test.js`) across 8 canonical shapes — straight line, 90° turn, cross-back, single pop, full retract, detach/re-attach across floors, floor-transition strand break, `rebuildFromState` parity — 35/35 assertions pass. No rendering, no raycaster touch, no gameplay effect yet.

**Rung 2B shipped (2026-04-16).** `engine/hose-overlay.js` rewritten around `HoseDecal.iterateFloorVisits`. Per-visit dispatch table: solitary seed → dot at center; tail stub (`entry=null, exit=d`) → center→edge line; head stub (`entry=d, exit=null`) → edge→center line + pulsing cyan-green halo; straight through (`entry ⟂ exit` opposite) → edge→edge line; 90° elbow (`entry`, `exit` adjacent) → quadratic Bézier with control at tile center; U-turn (`entry == exit`) → cubic Bézier self-loop, depth 0.85 × tile, splay 0.75 × tile along the perpendicular axis. Crossed tiles (`crossCount >= 2`) overlay a cyan X on top of stacked stripes. Yellow origin marker preserved via `HoseState.getPathOnFloor()[0]` for parity with floor-transition landings. Legacy polyline renderer retained as the `HoseDecal === undefined` fallback so the minimap never goes dark during load-order debug. Verified with `outputs/hose-overlay-test.js` — a recording-canvas stub that logs every path command and asserts the expected primitive fires for each of the 6 visit shapes, plus the critical adjacency invariant: tile A's east-edge midpoint and tile B's west-edge midpoint land on the exact same pixel when B sits one tile east of A (27/27 assertions pass). Zero raycaster touch, zero gameplay effect yet.

**Rung 2A+2B pair ships complete.** Regroup before starting Rung 2C — *feel check*: does the tile-level stripe read on the 160×160 minimap at 1× and 2× zoom? If yes → go to Rung 2C (3D floor decals). If the edge-midpoint joints look ragged or the cubic U-turn reads like a wart, tune the stripe width / Bézier control points / splay factor before committing to the bigger 2C work.

**Next rung after the feel check: 2C — 3D viewport floor decals.** Push the same ledger into `RaycasterFloor` so the hose body is visible in the first-person view, not just the minimap. This is the rung that unlocks the procgen puzzle contracts described in §11 — "flow will always cross" constraints, forced-path chambers, dragon-room reel-out puzzles.

Regroup again after Rung 2C to validate perf on Hero's Wake B2 before committing to the gameplay mechanics in 2D–2F. *Then* Rung 3 (material audio) lands into a world where the hose is a visible floor-painting element, not just a polyline on the minimap.

---

## 10. Rung 0 — Test-Harness Pressure-Washing Toggles (contractor spec)

> **Handoff-ready for a high-context engineer.** Everything needed to implement is in this section. Reference context lives in §1–§9 above and in `PRESSURE_WASH_SYSTEM.md`, `test-harness.html`, `engine/debug-boot.js`, `engine/hose-state.js`, and `engine/spray-system.js`.

### 10.1 Goal (one-liner)

Add a **Pressure Washing** fieldset to `test-harness.html` that lets the operator drop into any floor with a hose already attached, optionally in **infinite mode** (no fatigue drain, no cancellation), with a **preselected nozzle** and a **live hotkey panel** in-game for swapping nozzles on the fly. Net result: iteration loop for Rungs 1–9 collapses from "reload → walk to truck → grab hose → descend" to "deploy → already spraying in ~2s, hot-swap nozzle with a keypress".

### 10.2 UX additions — `test-harness.html`

Insert a new fieldset **after** the existing `◇ Debug Toggles` fieldset (so pressure-wash settings stay grouped together and don't clutter the general toggles). Follow the same `<label class="toggle">` pattern used elsewhere.

```
◇ Pressure Washing
  [checkbox] Auto-attach hose on land        (t-hose)
             attaches HoseState to current building on deploy
  [checkbox] Infinite hose                    (t-hoseInf)
             disables fatigue drain, combat-cancel, and length
             penalty; forces pressureMult = 1.0 regardless of kinks
  [select]   Starting nozzle                  (sel-nozzle)
             options: base / cone / beam / fan / cyclone
             (matches NOZZLE_STATS keys in spray-system.js §59)
  [checkbox] Hotkey nozzle swap panel         (t-nozzlePanel)
             shows a small in-game overlay listing 1=base 2=cone
             3=beam 4=fan 5=cyclone; keypress calls
             SpraySystem.setNozzleType()
  [checkbox] Seed grime on land               (t-grime)
             force-allocates dense grime grids on nearby walls
             + floor tiles so there's something to spray
             immediately (calls CleaningSystem._seedGrimeAround
             on each tile within 4 of spawn)
```

### 10.3 URL contract additions

Extend `collect()` → `buildUrl()` in `test-harness.html` to emit these query params **only when ON** (keep URLs short). Extend `DebugBoot` in `engine/debug-boot.js` to read them and apply during the post-floor-land flow (right after `_topUpVitals()`, same section that today reads `PARAMS.gold`, `PARAMS.fullHp`, etc.).

| Param | Values | Applied by |
|---|---|---|
| `hose` | `1` | `DebugBoot._attachHose()` — calls `HoseState.attach(buildingId, floorId)` with the current floor's parent and own id. If current floor is exterior (depth 1), attach with `originBuildingId = currentFloorId`. |
| `hoseInf` | `1` | sets a new `HoseState._infiniteMode` flag (see §10.5); auto-enables `hose=1` |
| `nozzle` | `base`/`cone`/`beam`/`fan`/`cyclone` | `SpraySystem.setNozzleType(v)`. Guarded by `NOZZLE_STATS[v]` check (already in the setter). |
| `nozzlePanel` | `1` | mounts the overlay (§10.4) and installs keydown listener |
| `grime` | `1` | `DebugBoot._seedGrimeAroundPlayer(radius=4)` — walks the grid, calls the existing CleaningSystem seed helper on each adjacent grimeable tile |

### 10.4 In-game nozzle hotkey panel (HUD overlay)

New tiny module `engine/debug-nozzle-panel.js` (Layer 5, loaded after `debug-boot.js` in `index.html`; inert unless `PARAMS.nozzlePanel === '1'`).

Responsibilities:
- Mount a fixed-position `<div>` in the bottom-left of the document (outside the canvas) showing five rows: `1 base`, `2 cone`, `3 beam`, `4 fan`, `5 cyclone`. Highlight the currently-selected row by querying `SpraySystem.getNozzleType()` once per second (cheap — no per-frame cost).
- Install a single `keydown` listener on `window`. Keys `1`–`5` call `SpraySystem.setNozzleType(type)` and show a brief toast (`Toast.show('NOZZLE: ' + type)`). Ignore the event if any modal/menu is open (check existing `ScreenManager.current()` or simply the same gates SpraySystem uses internally).
- Style to match the rest of the harness-era debug UI: dark translucent bg, cyan border (`#2afce0`), yellow accent (`#fcff1a`) on the active row. Keep the whole panel ≤ 160px wide so it doesn't fight the minimap.

This panel is **live-swappable**: hitting `3` mid-spray should change the brush on the very next spray tick, because `SpraySystem` already re-resolves the nozzle family from `_nozzleType` every tick.

### 10.5 `HoseState` infinite-mode additions

New private flag in `engine/hose-state.js`:

```
var _infinite = false;
function setInfiniteMode(on) { _infinite = !!on; }
function isInfinite()        { return _infinite; }
```

Wire it into the three existing paths so infinite mode is a minimally invasive override:

1. **Fatigue drain** — in `recordStep()` near the drain calculation, early-return `{ kinked: false, drainThisStep: 0 }` when `_infinite`. Still push the path entry (for reel-up testing) but skip the drain accumulator.
2. **Cancel triggers** — in `onCombatDamage()` and the building-mismatch branch of `onFloorEnter()`, early-return when `_infinite` (hose survives damage and wrong-building descents).
3. **Pressure multiplier** — in `getPressureMult()`, return `1.0` when `_infinite` regardless of `_kinkCount`. This keeps the kink counter valid for display/debug but neutralizes its gameplay effect.

Expose `setInfiniteMode` and `isInfinite` in the public return block. Add a console log when infinite toggles on so the operator sees confirmation.

### 10.6 `DebugBoot` additions

In the `_applyFlags` call chain (around line 258–268 of `debug-boot.js`):

```js
if (PARAMS.hose === '1' || PARAMS.hoseInf === '1') _attachHose();
if (PARAMS.hoseInf === '1')                       HoseState.setInfiniteMode(true);
if (PARAMS.nozzle)                                SpraySystem.setNozzleType(PARAMS.nozzle);
if (PARAMS.grime === '1')                         _seedGrimeAroundPlayer(4);
```

`_attachHose()` implementation:
```js
function _attachHose() {
  if (typeof HoseState === 'undefined') return;
  var fId = FloorManager.currentId();
  // Use the parent floor as origin if we're inside a building,
  // otherwise the current floor id (exterior case).
  var originBuilding = FloorManager.parentId(fId) ? fId : fId;
  var originFloor    = FloorManager.parentId(fId) || fId;
  HoseState.attach(originBuilding, originFloor);
  console.log('[DebugBoot] hose attached', { originBuilding: originBuilding, originFloor: originFloor });
}
```

`_seedGrimeAroundPlayer(r)` walks grid tiles within Chebyshev distance `r` of `MC.getGridPos()` and calls `CleaningSystem._seedGrimeAround(x, y, intensity=200)` on each. If that helper is private, add a thin public wrapper named `CleaningSystem.debugSeedAt(x, y, intensity)` rather than reaching into the module.

### 10.7 localStorage persistence

Extend the `collect()` shape, the `ev`-in-form restore block (lines ~760–772), and the keys list to include: `hose`, `hoseInf`, `nozzle`, `nozzlePanel`, `grime`. Preserve the existing pattern — booleans via `document.getElementById('t-' + k).checked`, the select via `.value`.

### 10.8 Files touched

| File | Change |
|---|---|
| `test-harness.html` | New fieldset, new form state in `collect()`, new URL params in `buildUrl()`, restore logic in the localStorage block |
| `engine/debug-boot.js` | `_attachHose`, `_seedGrimeAroundPlayer`, four new `if (PARAMS.x)` lines in the apply chain |
| `engine/hose-state.js` | `_infinite` flag, `setInfiniteMode`, `isInfinite`, three early-returns in `recordStep` / `onCombatDamage` / `onFloorEnter` / `getPressureMult` |
| `engine/debug-nozzle-panel.js` | **New** Layer 5 module, ~80 LOC |
| `engine/cleaning-system.js` | Optional: expose `debugSeedAt(x, y, intensity)` public wrapper |
| `index.html` | One new `<script>` tag for `debug-nozzle-panel.js`, loaded after `debug-boot.js` |

### 10.9 Done criteria

1. Deploy from harness with `hose=1` + `nozzle=fan` → land on floor → console shows `[DebugBoot] hose attached` and `NOZZLE: fan`; pulling the trigger sprays a fan-shape immediately, no truck interaction required.
2. Deploy with `hoseInf=1` → take a hit in combat → hose stays attached. Walk into wrong building → hose stays. Kink the hose three times → `getPressureMult()` still returns 1.0, beam strength unchanged.
3. Deploy with `nozzlePanel=1` → bottom-left overlay visible showing five rows; press `3` → overlay highlights `beam`, next spray tick uses the beam kernel, toast reads `NOZZLE: beam`.
4. Deploy with `grime=1` → a roughly 9×9 area centred on the player has grime grids allocated at reasonable intensity (visible brown tint on walls within one tile-face of spawn).
5. Reload the harness page → all five new controls restore to last values from localStorage.
6. Harness without any of the new flags set → game behaves exactly as it does today (zero regression, all changes are additive and guarded by `PARAMS.*` checks).

### 10.10 Out of scope for Rung 0

- Gyro simulator keys (comes with Rung 4).
- Any changes to the hose minimap overlay, reel-up path, or truck sprite.
- Nozzle item registration in CardAuthority — this spec intentionally bypasses the card-inventory path via the direct `SpraySystem.setNozzleType()` call, because that's the whole point (shorter iteration loop, no walking to the shop).
- Per-floor grime presets. If we need specific grime layouts per-floor for a Rung, add a follow-up `grimePreset=<id>` param later — not required now.

### 10.11 Estimated effort

Roughly one focused half-day for an engineer who has already read `PRESSURE_WASH_SYSTEM.md` and the existing `debug-boot.js`. Breakdown: harness UI + URL wiring (1h), HoseState infinite mode + DebugBoot apply (1.5h), nozzle panel module (1h), grime seeding helper (0.5h), manual smoke test across the six done-criteria (1h).

### 10.12 Risks / gotchas to flag

- `HoseState.attach` emits an event; the existing subscribers (minimap overlay, HUD) should tolerate being attached "out of nowhere" without going through `HosePeek`. Verify no listener assumes a truck-tile context; if one does, add a `source: 'debugBoot'` field to the attach event and let listeners branch.
- `SpraySystem.setNozzleType` only accepts values in `NOZZLE_STATS`. The select's option list **must** exactly match those keys or the setter silently no-ops. Lock the option values to literal strings; do not let them diverge from `NOZZLE_STATS` keys.
- If Rung 8 (real nozzle identity) changes `_nozzleType` to be derived from `CardAuthority.getEquipped()` on every tick instead of cached, the hotkey panel will need to stuff a nozzle item into the equipped slot rather than call the setter directly. Keep the panel's call site in one function so that swap is a one-line change later.
- The hotkey listener must not fire when a text input is focused (harness-era debug consoles, chat widgets, etc.). Check `document.activeElement.tagName` against `INPUT`/`TEXTAREA`/`SELECT` and bail.

---

## 11. Hose as level-design primitive (Rungs 2A–2F rationale)

### 11.1 Why this moves ahead of audio

PWS's pillars — stroke satisfaction, object completion, job completion — are all *in-frame* loops. Everything happens within the camera. That's the ceiling of the genre, and it's why every PWS clone is a skin over the same verb.

Dungeon Gleaner has a verb PWS does not: **the hose has a body in a grid the camera can see.** Right now that body exists as a polyline on the minimap and nothing else — the floor of the 3D viewport is blank, the player cannot see their path in the world they actually occupy, and the hose isn't yet a geometric constraint the dungeon can be built around. Adding audio polish on top of that omission ships a system that sounds like PWS and plays like PWS minus one axis. Adding the hose body *first* ships a system that plays like a pressure-wash dungeon crawler — something Steam cannot offer.

The arc is scoped so that the data module (2A) and the minimap version (2B) are half a day together, land with zero raycaster changes, and unlock the 3D work (2C) and the mechanics (2D–2F) in the right order.

### 11.2 Data model — per-tile visit ledger

`HoseState._path` today is a flat array of `{x, y, floorId}` appended on every movement finish. It loses direction information at the tile boundary; the minimap polyline infers shape only because it connects tile centers in order.

`HoseDecal` (Rung 2A) sits next to `HoseState` and maintains a denser ledger:

```
tileKey "x,y,floorId" → {
  visits: [
    { entryDir, exitDir, visitIndex },
    { entryDir, exitDir, visitIndex },   // second visit → tile is crossed
    ...
  ],
  crossCount: 2
}
```

- **entryDir / exitDir** use the direction convention (0=EAST, 1=SOUTH, 2=WEST, 3=NORTH from CLAUDE.md). Derived from the previous/next tile at record-step time.
- **visitIndex** is a monotonically increasing counter so retraction (HoseReel popping from the tail) removes the right visit, not an arbitrary one.
- **crossCount** is `visits.length` — redundant but fast to read in the hot path (minimap render, spray squeeze check).

The head of the hose has `visits[last].exitDir = null` (we haven't left yet). This is how the stripe renderer knows to draw a half-stripe with the pulsing glow.

### 11.3 Rendering choice — decal via floor sampler

Three candidate approaches were considered for the 3D viewport (Rung 2C):

1. **Polyline in 3D** (project hose centers, draw a line). Rejected: doesn't occlude behind walls, ignores floor texture, looks like a UI overlay.
2. **Billboard sprites per tile** (quad facing up, hose texture). Rejected: billboards don't sit correctly on a flat floor, z-fight at tile boundaries, and lose perspective when the player looks down.
3. **Decal via floor sampler** — composite a 32×32 offscreen canvas per visited tile over the floor texture, inside the existing per-column UV sampler in `raycaster-floor.js`. **Chosen** because the floor sampler already runs per-column, already respects the z-buffer, and already reads floor tiles at sub-pixel UV — adding a textured overlay is a single `ctx.drawImage` into an offscreen canvas we then composite in the same sampler call.

The per-tile canvas is invalidated only when that tile's visit ledger changes (a new visit gets pushed or popped). On a typical floor the player visits ~50 tiles; 50 × 32×32 canvases is ~200KB total, well inside budget.

### 11.4 Stripe geometry — edge-midpoint convention

For stripes to tile seamlessly from one cell to the next, both tiles must agree on where the stripe touches the shared edge. The convention:

- **Entry point** = midpoint of the edge given by `entryDir` (e.g. entryDir=2/WEST → point (0, 0.5) in tile-local 0..1 coordinates).
- **Exit point** = midpoint of the edge given by `exitDir`.
- **Center control** = tile center (0.5, 0.5).

Stripe paths per turn type:

- **Straight through** (entry and exit on opposite edges): straight line from entry midpoint through center to exit midpoint.
- **90° turn**: quadratic Bézier with control at the center (gives a natural elbow).
- **U-turn** (entry and exit on same edge): tight half-loop — two Bézier curves forming a lollipop shape with the loop centered between the edge and the tile center.
- **Head of hose** (exitDir = null): half-stripe from entry midpoint to tile center, capped with a pulsing radial glow.
- **Crossed tile** (visits.length ≥ 2): render each visit's stripe independently; they naturally form an X where the two paths cross. Cyan flash on step-on.

Because every stripe touches an edge at the *midpoint*, the neighbor tile's stripe also touches that same point from the other side. No seams, no math.

### 11.5 Why this unlocks dungeon-pathing puzzles

Once the hose body is a visible floor-painting element with a crossing detector (Rung 2E), a set of level-design primitives becomes available that PWS cannot express:

- **Single-path rooms**: a room with chokepoints that admits exactly one un-crossed hose route to reach every grime target. Solving the room *is* finding that route.
- **Forced-cross rooms**: a room where some grime target is only reachable via a crossing — the player accepts the pressure penalty as a cost.
- **Pinch traps**: a door that closes mid-clean and crushes the hose on that tile → instant pressure loss until you walk back and free it.
- **Enemy-squeeze encounters**: a combat arena where enemies spawn on top of crossed tiles and their weight kills your pressure until you clear them — turning combat into "free the hose", not "DPS the mob".
- **Retraction puzzles**: a floor you can't exit until all grime is cleaned *and* the hose is fully retracted, which requires walking the path in reverse. Bad routes on the way out punish you on the way back.

None of these are possible with a polyline on the minimap. All of them become tractable once the decal is on the floor and the tile-entry event fires. This is why 2D–2F follow the rendering work so closely.

### 11.6 Procgen contracts (Rung 2F)

`SpatialContract` gets three new fields, keyed by tile type or per-floor:

- **`hoseBlockTiles`** (Set of tile type constants): tiles that refuse hose pathing outright. Lava, deep pits, spike runs, active torches. Attempting to cross one detaches the hose.
- **`hoseCrossPenalty`** (number, default 0.3): multiplier applied to Rung 2E's squeeze cost on this floor. Boss arenas might set this to 0.6 (crossings are brutal); a tutorial floor might set it to 0.1 (crossings barely matter).
- **`maxFlatPathLen`** (number, default 40): tile count of hose beyond which pressure falls off linearly toward 0, even without kinks. Represents hose resistance over length. Interacts with `PRESSURE_PER_KINK` in `HoseState`.

Floor generators then treat hose pathing as a generation constraint alongside room adjacency and loot placement. A generator can ask: "is there at least one solution where the player cleans every target with ≤1 crossing and ≤maxFlatPathLen tiles of hose run?" If not, reshape the floor.

This is where the arc comes full circle: the hose started as a resource (PW-2), became a path (PW-3 minimap polyline), becomes a visible floor element (2A–2C), becomes a puzzle mechanic (2D–2E), and finally becomes **a generation constraint the dungeon is shaped around (2F).** That's the upgrade from "PWS has a hose" to "Dungeon Gleaner's dungeons exist because of the hose".

### 11.7 Execution ladder recap

| Rung | Scope | Estimate | Raycaster touch | Ship gate |
|---|---|---|---|---|
| 2A | HoseDecal data module | 2h | No | Unit test ledger on simulated path |
| 2B | Minimap stripes | 2h | No | Visual check on 160×160 canvas |
| 2C | 3D floor decals | 1 day | Yes (floor sampler) | Perf ≤1.5ms on Hero's Wake B2 |
| 2D | Tile-step awareness | 3h | No | Squeeze cue fires reliably |
| 2E | Flow-squeeze mechanic | 1 day | No | Playtest — reads as a puzzle, not a nuisance |
| 2F | Procgen contracts | 1 day + tuning | No | First floor generated with a forced-cross target |

**A + B ship first as a pair** because they're the cheapest validation of the whole design — if the minimap stripes don't read, the 3D decal won't either. Everything after C is gated on perf, then on playtest, then on generator tuning. The PWS-pillar rungs (audio, sub-target, gyro) resume after 2F at the new Rung 3 position.


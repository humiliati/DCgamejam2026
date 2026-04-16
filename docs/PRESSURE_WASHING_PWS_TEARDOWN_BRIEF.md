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

**Rung 1 — Beam-point water droplets.** Repurpose `WaterCursorFX` (or fork a new `SprayDropletsFX` using the same pool pattern) to spawn droplets at the *in-world beam hit point* projected back to screen space, not at the pointer. Spray while active → a trail of cyan droplets fans off the hit subcell, arcs under gravity, fades. Budget 30–40 droplets on-screen. Trivially scoped, massive perceived-juice delta. **This is the first thing we ship.**

**Rung 2 — Material-aware hiss + pitch + low-pass.** Add an `AudioSystem` spray channel. Pick 3 starter materials (stone/masonry, wood, metal) based on the wall texture atlas tag. Crossfade between 3 loops based on which material the hit tile maps to. Modulate pitch ±15% based on `perpDist` (nearer = higher). Modulate low-pass cutoff based on grime level under the beam (caked = 800Hz, clean = 8kHz). This is the single highest-leverage change on the list — it's what makes the game feel like PWS rather than a tech demo of PWS.

**Rung 3 — Sub-target percentage readout.** Define "sub-target" as a connected grime component (flood-fill on wall tiles that share an edge and both carry a grime grid). Each sub-target gets an id, a discovered name from a procgen table ("north wall above the cellar door", "pew bench #2"), and a 0–100% readout that ticks up as you clean. HUD element: small bottom-right pill, only visible while beam is active, showing the currently-aimed sub-target and its %. Completion → soft chime + the name briefly swells and fades. **This is the Loop B primitive and it's what turns the stroke loop into session-length engagement.**

**Rung 4 — GyroInput module (Signals 1, 5 first).** Build `engine/gyro-input.js` (Layer 0 or 1, data-only, IIFE). Expose `getYawRate()`, `getPitchRate()`, `getRollAngle()`, `getPitchAngle()`, `getForwardPressure()`, `getAimDelta()`. Back it initially with a **simulator** that derives these from keyboard/pointer when real gyro isn't present — this unblocks all subsequent gyro work without needing the webOS hardware in the loop. Wire Signal 1 and Signal 5 into `spray-system.js` behind a feature flag. Test in Brave with the simulator. Now we have real integration points for the remote.

**Rung 5 — Signals 2 & 3 (roll/pitch-shaped brush).** Teach `cleanKernelHard` to accept `{ rotation, eccentricity }`. Orient the stamp. Animate a matching on-screen reticle that shows brush shape (rotating oval). This is the demo-reel moment. Test with simulator first (mouse drag = fake roll), then on actual hardware once harness lands.

**Rung 6 — Signal 4 (forward-thrust pressure boost).** Low-pass filter, threshold, cooldown. Visual: beam thickens, particle count doubles for ~500ms, audio drops a semitone and gains saturation. Clear UI tell (remote-jab icon pulses). This is the signature gesture.

**Rung 7 — PW-4 Reel-up auto-exit.** With spray feeling good, the reel-up lands into a system the player actually wants to go back to. Per the original roadmap: reverse path, feed to MC step-by-step, shrink the minimap line as the player retraces. Gate click-to-move distance on minimap to 5 tiles. Interruptible by combat.

**Rung 8 — PW-5 Nozzles with real identity.** Fan = long line brush (Signal 2 rotates it). Cyclone = oscillating offset (Signal 4 amplifies the oscillation). Prism (post-jam) = three beams. Turbo (post-jam) = narrow-and-fast. Register in CardAuthority, equip slot, loot tables.

**Rung 9 — Signal 6 (adaptive feel histogram).** Cheap, invisible, huge accessibility win. Ships after everything else because it's a tuning knob, not a feature.

After Rung 9 the PW roadmap is exhausted. That's the fresh-post-jam milestone: a pressure-washing system whose stroke feels better than PWS on any other platform, whose audio sells the material under the beam, whose sub-target readout gives the player something to finish, whose remote integration is the actual reason you buy an LG TV to play it.

## 6. What the new PW roadmap looks like (draft)

When Rung 9 lands, archive `PRESSURE_WASHING_ROADMAP.md` and replace it with a forward-looking doc covering: re-contamination and grime regrowth, per-pixel residual streaking, volumetric beam fog (the signature post-jam look), phase-locked grime, sundog alignment mechanic, hidden sigils revealed only under specific beam modes, co-op mode (two Magic Remotes, two beams, one dungeon — obvious content-store marketing beat), and trap re-arm via hose. Most of these are listed in §12 of the current roadmap as "post-jam vision" and can migrate directly.

## 7. Pivot to MINIGAME_TILES after PW exhausted

Per the survey in `MINIGAME_TILES.md`, the bar-counter clicky model has nine Tier-1 and Tier-2 candidates waiting. The strongest for carrying the pressure-wash framing are **NEST (sweep clicky)** and **DUMP_TRUCK (prime-the-pump)** — both share the cleaning verb family and can reuse `WaterCursorFX`, the surface-material audio system, and (for prime-the-pump) the Signal 4 thrust-gesture path. **WELL** and **ANVIL** are next in line because they establish the bar-counter phase model for interactions that *aren't* cleaning, which is what unblocks the rest of the tier.

Proposed minigame ladder after PW:
1. NEST (reuses most of PW audio + FX infrastructure — shortest path to a second "clicky" shipping)
2. WELL (establishes the bar-counter phase contract for non-cleaning verbs)
3. DUMP_TRUCK (prime-the-pump — ties the minigame tier back to the hose pickup flow, narrative payoff)
4. ANVIL (forge tap — new audio material, new particle palette, foundry flavor)
5. SOUP_KITCHEN, BARREL, FUNGAL_PATCH, CHARGING_CRADLE, SWITCHBOARD, NOTICE_BOARD, COOKING_POT — fill out the Tier-1/2 set.

But we don't commit to that ordering until PW Rung 9 ships; the current state of the game may reveal a different natural next target.

## 8. Open questions to regroup on

- **Sub-target discovery UX.** PWS labels objects like "chair, backrest, left". We can auto-label from tile position ("north wall, high") or hand-author names per floor. Auto is cheaper, hand-authored reads better in a narrative game. Probably: auto for jam, gradually replace with hand-authored as the conspiracy arc wants to drop dialog ("the stain above the cellar door — you notice it's shaped like…").
- **Audio sample source.** For material-aware hiss, do we record/synthesize our own or license a small pack? AudioSystem is vanilla WebAudio; both paths are open. Recommend synthesizing with the existing noise-generator helpers (already used elsewhere in the engine) — keeps the offline/LG Content Store ship contract clean.
- **Gyro simulator mapping.** For desktop testing, mouse X/Y deltas → yaw/pitch rate is obvious. What about roll? Probably Q/E or the scroll wheel. Forward thrust → spacebar hold. Document these in `docs/GYRO_SIMULATOR_KEYS.md` when the module lands.
- **Does the reel-up (Rung 7) benefit from a gyro gesture?** Probably yes — a "pull toward you" sustained thrust could trigger reel-start, matching the physical pump-to-wind metaphor. Worth a small experiment after Rung 6.

## 9. First concrete action out of this brief

**Rung 1 ships first.** Fork or extend `WaterCursorFX` into an in-world spray droplet system, spawn at the `castScreenRay()` hit point projected to screen, drive spawn rate from spray-active + stroke velocity, budget ~40 droplets. This is an afternoon of work, ships a visible juice win, and proves out the FX-at-beam-point pattern that Rungs 2 and 6 will reuse.

Regroup after Rung 1 to validate feel before committing to Rung 2's audio work.

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


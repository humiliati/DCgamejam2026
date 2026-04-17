# Electrocution Hazard System — DOC-119

> **Note (2026-04-17):** originally drafted as DOC-116, renumbered to DOC-119
> because DOC-116 was already claimed by `GATE_TAXONOMY.md`.

> Spec for turning ENERGY_CONDUIT (tile 53) into the game's first
> environmental hazard — our answer to the explosive-barrel archetype.
> Spraying the pressure washer at a conduit shocks Gleaner, repeated
> hits overload it, and wired conduit runs chain-react along a corridor.
> Drafted 2026-04-17. Follows from DOC-115 §2b.

---

## Design anchor — "the boardwalk TNT barrel"

Dungeon Gleaner doesn't have explosive breakables (no black-powder
kegs, no fire-crystal urns). We need a hazard archetype that punishes
careless play, rewards spatial awareness, and creates **choke-point
drama** — the moment where the player sees three conduits down a
corridor and realizes *one mistake lights up the whole hallway*.

The pressure washer is the carrier because:

- It's the core tool every playthrough uses constantly — muscle memory
  makes accidental spray plausible.
- It has reach and aim, which creates skill expression around *not*
  hitting a thing.
- Water + electricity is the clearest "bad idea" in any language — no
  tutorial required.

The washer + conduit pairing is diegetic *and* exportable. The same
HazardSystem entry points will later drive steam-pipe rupture, oil-slick
ignition, frost-sconce shattering. Conduits are the prototype.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped — runtime active in mainline |
| 🟡 | Specced — implementation pending |
| ⬜ | Design-phase — open questions remain |

---

## 1. State machine

ENERGY_CONDUIT tiles carry four runtime states:

| State | Visual | Audio | Interactable |
|-------|--------|-------|--------------|
| `NOMINAL` | `energy_conduit` (shipped ✅) — cyan slit, rare sparks | 60Hz hum loop, low gain | yes |
| `SHOCKED` | Same texture + 2-frame floor-wide desat flash | Zap + buzz sting | no (1s cooldown) |
| `OVERLOADING` | Alt texture `energy_conduit_overload` 🟡 — white-hot slit, rapid flicker | Rising tone + cracking electricity | no |
| `DEAD` | Alt texture `energy_conduit_dead` 🟡 — grey frame, black slit, no particles | Silent | no (permanent) |

Transitions:

- `NOMINAL → SHOCKED`: one washer hit. Auto-revert after 1.0s.
- `SHOCKED → OVERLOADING`: second hit within the cooldown window.
- `OVERLOADING → DEAD`: 2.5s after entering OVERLOADING. Unrecoverable for the run.
- `OVERLOADING → SHOCKED` (on neighbors): chain-pulse fires at 1.5s into
  the overload. Any NOMINAL conduit within 2 tiles jumps to SHOCKED
  (see §4).

Storage for the live state lives in a new per-floor override store
(`FloorManager.tileStateOverrides`, §6). Contract-level textures
remain static.

---

## 2. Pressure washer → conduit interaction

The washer is a raycast weapon. When a spray column hits a tile whose
current state is an ENERGY_CONDUIT variant, dispatch to
`HazardSystem.onWasherHit(tileX, tileY, srcPlayer)`.

### 2a. Nominal → Shocked (single hit)

Immediate effects on the player:

- **HP tick**: −8 (tunable via `HAZARD_CONFIG.conduit.hpOnShock`).
- **Stun**: movement + washer input locked for 0.6s.
- **Camera**: 8px random-walk shake for 0.4s.
- **HUD**: red vignette pulse, electric-bolt icon flashes at reticle.
- **Controller haptic**: short buzz on webOS Magic Remote rumble-capable
  models; gated behind a capability flag so it's a no-op otherwise.

Audio sequence via AudioSystem (queued three cues):

1. t=0: `sfx_washer_short_circuit` — sharp zap, high gain.
2. t=0.1: `sfx_gleaner_grunt_shock` — voice reaction.
3. t=0.3: `sfx_lantern_flicker` — ambient tell that the lights blipped.

Lighting: floor-wide lantern pulse via `Lighting.pulseAll(0.3, 800)` —
drop to 30% for 0.8s, recover linearly.

### 2b. Shocked → Overloading (second hit during cooldown)

Same as 2a but amplified:

- HP tick −12
- Stun 1.0s
- Conduit starts its 2.5s doom timer
- Audio: `sfx_conduit_overload_rising` — 2.5s rising tone that resolves
  into the DEAD-state silence
- Lighting: floor flicker at 3Hz for the overload duration

### 2c. Overloading → Dead

At t = 2.5s:

- Texture swap: `energy_conduit_overload` → `energy_conduit_dead`.
- Ambient hum stops.
- Audio: `sfx_conduit_pop` — sharp crack with decay.
- Lighting: floor-wide pulse-to-black for 0.3s, recover at **70%**. The
  conduit was *providing* some of the chamber's light — losing it
  dims the room permanently for the run.
- Construct ecology: `CombatEngine.drainCharge(floorId)` disables any
  charging-cradle-dependent enemy on the floor, marking them INERT for
  the run. This ties ENERGY_CONDUIT into the construct/charge loop
  already spec'd at tile 45 CHARGING_CRADLE — the dungeon's power
  grid is continuous.

---

## 3. Faction + readiness consequences

Using the DOC-115 triangle-choice model. All entries emit to the
DOC-118 Cleaning Evidence Ledger.

| Action | Readiness | MSS | Pinkerton | Jesuit | BPRD |
|--------|-----------|-----|-----------|--------|------|
| Single shock (self-damage, tile survives) | 0 | 0 | 0 | 0 | 0 |
| Conduit brought to DEAD | **−2** | −3 | 0 | **+2** | −8 |
| Cascade destroys 3+ conduits | **−5** | −8 | 0 | **+5** | **−15** |

Rationale:

- **Readiness penalty.** Destroying infrastructure is not cleaning, it's
  damage. Dispatcher docks pay.
- **MSS** resents property loss — they pay for the dungeon infrastructure.
- **Pinkerton** doesn't care about tech. Neutral.
- **Jesuit** is the *only* faction that *rewards* the cascade. Conspiracy
  layer: they distrust retrofuturist tech. The cascade rep boost is the
  only way to gain Jesuit rep through cleanup actions — a deliberate
  asymmetry that gives players an alternate faction lane if they commit
  to the cascade playstyle.
- **BPRD** studies conduits. Destroying them destroys research.

---

## 4. Chain reaction

When a conduit enters OVERLOADING, at t = 1.5s it fires a chain-pulse:

```
for neighbor in neighborsWithin(2 tiles, tile=ENERGY_CONDUIT, state=NOMINAL):
  neighbor.state = SHOCKED
  AudioSystem.play('sfx_conduit_arc', neighbor.pos)
  Particles.emit(ARC_LIGHTNING, from=source.center, to=neighbor.center)
```

The chain-pulsed neighbor is now in SHOCKED. If the washer is still
spraying when the arc arrives, or if the player panic-sprays again
in the next second, that neighbor enters OVERLOADING too — and the
cascade propagates.

Manhattan-distance 2 is the tuning knob. Tighter radius reduces the
cascade threat; looser radius makes even single-conduit rooms dangerous.

A well-placed corridor of conduits (the BLOCKOUT plan calls for
conduit runs in depth-3 floors) can wipe out a whole run's worth of
infrastructure in one panic-spray. That is the feature.

---

## 5. Required new textures

| ID | Purpose | Generator | Status |
|----|---------|-----------|--------|
| `energy_conduit_overload` | Overloading state — white slit, flicker | `_genEnergyConduitOverload` | 🟡 |
| `energy_conduit_dead` | Dead state — grey frame, black slit | `_genEnergyConduitDead` | 🟡 |

Both mirror the existing `_genEnergyConduit` structure (DOC-115 §2b).

- **Overload**: swap `p.glowHi*` to near-white (245/250/255), widen the
  slit to 6px, replace the spark-band stochastic hot/cold with all-hot,
  and double the cyan ambient bleed so the adjacent plate reads as
  arcing.
- **Dead**: replace the brass palette with its desaturated 50% sibling,
  fill the slit with `p.darkR/G/B`, drop the rivet highlight tier by one
  step (rivets still read but as cold metal).

Register both in the SpatialContract nested-dungeon `textures` lookup
via the runtime-override mechanism (§6) rather than a new tile ID.

---

## 6. Runtime tile-state storage

SpatialContract textures are keyed by tile ID, which is fine for
generation but wrong for per-instance hazard states. Proposed:
`FloorManager` gains a `tileStateOverrides: Map<"x,y", override>` where
`override = { textureId, wallHeight, hazardState, timerEndsAt }`.

The Raycaster's texture lookup — currently `contract.textures[tile]` —
gets an override check in front:

```
var k = x + ',' + y;
var ov = FloorManager.tileStateOverrides.get(k);
if (ov && ov.textureId) return TextureAtlas.get(ov.textureId);
return TextureAtlas.get(contract.textures[tile]);
```

This is a general-purpose mechanism. Subsequent hazards (steam pipes,
oil slicks, trap resets) reuse the same store. HazardSystem's tick
loop advances timers and purges expired entries (SHOCKED auto-revert
to NOMINAL after 1.0s removes its override).

Override state is *not* persisted on floor transitions — when the
player returns, conduits are restored to NOMINAL. DEAD is the only
terminal state and persists for the run via a separate floor-level
flag (`FloorManager.deadConduits: Set<"floorId:x,y">`).

---

## 7. Arc-lightning particle

New entry in the particle system:

```
ParticleTypes.ARC_LIGHTNING = {
  lifetimeMs: 200,
  geometry: 'polyline',         // new — existing particles are sprite-based
  segments: 4,
  jitterPx: 6,
  colorGradient: ['#60ffff', '#c0fcff'],
  widthPx: 2,
  fadeOut: 'cubic',
  coreCount: 1
};
```

Rendered via RaycasterSprites after the depth-sort but before the HUD
pass. Z-budget: any polyline segment further than the current z-buffer
column-entry is clipped, so arcs don't render through walls — this is
the same clipping pass already applied to wall-decor sprites.

---

## 8. Tunables — `HAZARD_CONFIG.conduit`

| Key | Default | Notes |
|-----|---------|-------|
| `hpOnShock` | 8 | Single-hit self-damage |
| `hpOnOverload` | 12 | Second-hit amplified damage |
| `stunShockMs` | 600 | Movement + washer locked |
| `stunOverloadMs` | 1000 | Longer — you're *really* zapped |
| `shockCooldownMs` | 1000 | Window where second hit triggers overload |
| `overloadDurationMs` | 2500 | Entering overload → DEAD |
| `chainDelayMs` | 1500 | Overload-in → chain-pulse fires |
| `chainRadiusTiles` | 2 | Manhattan distance to neighbor conduits |
| `floorLightDropOnDead` | 0.70 | Ambient light multiplier after DEAD |
| `cascadeRepThreshold` | 3 | Cascade-of-N triggers the amplified rep swing |

All tunables live in a single frozen config so QA can iterate without
touching module code.

---

## 9. Priority order

1. **New texture variants + override store** — unblocks everything
   else. `_genEnergyConduitOverload`, `_genEnergyConduitDead`,
   `FloorManager.tileStateOverrides` scaffolding.
2. **Single-hit shock path (Nominal → Shocked)** — MVP hazard. Player
   takes damage + stun + audio. No chain, no overload yet.
3. **Overload state + DEAD transition** — the breakable-barrel payoff.
   Floor lighting drop + construct disable.
4. **Chain reaction + arc-lightning particle** — the spectacle. High-
   impact but can ship after a playable MVP.
5. **Faction/readiness hooks** — emits to DOC-118 ledger. Low-risk,
   drops in once the state machine is stable.
6. **webOS Magic Remote haptic** — feature-flagged. Skip for Jam build,
   revisit for LG Content Store submission.

---

## 10. Open questions

- **Should DEAD conduits be cleanable?** Design instinct: no. They
  stay grey for the run and act as environmental storytelling
  ("Gleaner broke something here"). Revisit if players find this
  frustrating.
- **Can the conduit be disabled *without* cascading?** Consider an
  interact action (not washer) that carefully powers it down — costs
  an item, rewards the "clean" path. Not MVP.
- **Does water pooling on the floor *below* the conduit matter?**
  Narratively it should — a wet floor should conduct. Scope gate:
  only if floor-wetness already exists as a runtime flag.

---

## 11. Reference material

- Tile 53 texture + contract entries: DOC-115 §2b, §2d
- Existing hazard module: `engine/hazard-system.js` (extend, don't replace)
- Texture atlas pattern: `_genEnergyConduit` at `engine/texture-atlas.js`
- Lighting pulse API: `Lighting.pulseAll(intensity, durationMs)` — ✅ exists
- Audio cue loader: `AudioSystem.preload(id, url)` — ✅ exists, needs 6 new IDs
- Floor state persistence: FloorManager `_floorCache` (currently per-
  floor minimap fog; extend to `tileStateOverrides`)
- Evidence event sink: DOC-118 Cleaning Evidence Ledger
- Neighbor-decor interaction: DOC-117 Adjacent Tile Decor (dead-state
  cascade must drop the cyan-glow overlay on `decor_brass_pipe_run_wall`
  so the whole infrastructure reads as offline)

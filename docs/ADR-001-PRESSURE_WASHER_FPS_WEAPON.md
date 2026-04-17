# ADR-001: Pressure Washer as First-Person Weapon

**Status**: Accepted (pending implementation gates)
**Date**: 2026-04-17 (revised 2026-04-17 — see §Changelog)
**Deciders**: @ramoneez (lead), agents working the Pressure Washing rung ladder

Superseded by / Supersedes: (none — first ADR in the repo)

Related docs:

- `docs/PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` (Rung ladder + §11.7 hour budget)
- `docs/PRESSURE_WASHING_ROADMAP.md` (§11 execution plan, recently resynced)
- `docs/RUNG_2C_FLOOR_DECAL_SPEC.md` (floor decal — unaffected by this ADR, see §9)
- `docs/PRESSURE_WASH_SYSTEM.md` (active-work cross-ref)

Reference implementations cited (all local, per CLAUDE.md "Never fabricate when a reference exists"):

| Concern | Reference | File | Lines |
|---|---|---|---|
| Projectile state + advance loop | gone-rogue | `EyesOnly/public/js/projectile-system.js` | 1–597 |
| Fire-rate throttle + ammo check | gone-rogue | `EyesOnly/public/js/projectile-system.js` | 44–135 |
| Combat initiation on enemy hit | gone-rogue | `EyesOnly/public/js/projectile-system.js` | 316–332 |
| Weapon-facing indicator (2D) | gone-rogue | `EyesOnly/public/js/player-weapon-arrow.js` | 1–260 |
| FPS weapon sprite (screen-space) | raycast.js-master | `src/refactor/engine/r_draw.js` | 195–224 |
| Weapon bob + shoot animation | raycast.js-master | `src/refactor/engine/a_player.js` | 59–135 |
| Weapon-sprite render call site | raycast.js-master | `src/refactor/engine/r_render.js` | 204–213 |

---

## Context

The Pressure Washing system (Rungs 1 → 9) is building toward a moment-to-moment interaction where Gleaner holds a high-pressure hose, aims it, and modifies the world — scrubbing grime, resetting hazards, extinguishing torches, knocking breakables off ledges. Rung 1 (truck + hose deploy) shipped. Rungs 2A/2B (minimap ledger + stripe render) shipped 2026-04-16. Rung 2C (3D floor decal) is drafted as a spec and awaiting a feel-check gate before implementation.

Three forces are converging that make the shape of the core interaction explicit rather than implicit:

1. **The rig is already gun-shaped.** A pressure-washer nozzle with a trigger handle and a flexible supply line is ergonomically and visually a rifle. Every non-PW reference the player brings to the screen — Doom, Wolf3D, Duke3D, Quake, Dusk — lets them read the tool before they read a tutorial.
2. **Rung 8 (ex-PW-4 gyro) and Rung 9 (ex-PW-5 nozzle identity) both produce signals that need a display surface.** Pressure, kink level, flow rate, nozzle-pattern selection are all things the player must read continuously. A HUD text readout is the scope-compromised solution; a sprite that *embodies* those signals is the correct one.
3. **`raycast.js-master` already ships a screen-space weapon-sprite layer.** `R_DrawGlobalSprite` draws post-world, pre-HUD, with per-frame `locOnScreen` offsets — exactly the slot we need. `A_AnimateShoot` + `A_AnimateWalk` give us the bob-and-fire state machine verbatim.
4. **`EyesOnly/gone-rogue/projectile-system.js` already ships a full projectile system** with fire-rate throttle, ammo accounting, ricochet + decay, lerp rendering, and — critically for us — a **combat-initiation pattern** where a projectile carrying a `.card` reference calls `ctx.enterStrCombat(enemy, 'player_attack', projectile.card)` on contact.

The question isn't whether to add a weapon sprite. The question is **what states the nozzle moves through, what projectiles it emits, and how that system initiates combat** — and whether the "shoot the torch lights out" interaction is an emergent side effect or a deliberately designed hero moment.

---

## Decision

**Equip Gleaner with a Doom-style first-person nozzle sprite ("PWNozzle") driven by a three-state machine (absent / stowed / brandished), emitting Mario-Sunshine-style arcing, ricocheting water blobs via a new `PWProjectile` module adapted from gone-rogue's `ProjectileSystem`, powered by hose-energy drain (not per-shot ammo), toggled via a new `brandish` mode on `NchWidget`, and routing all torch-tile collisions into the already-shipped `TorchHitResolver.onHoseHit`.**

Anchor interaction: **water blobs that arc, bounce off walls and floors, paint the room with every splat, and incidentally knock torches out** — a Sunshine-feel spray that happens to surface the game's cleaning goals as an emergent consequence rather than a targeting exercise. The torch-snuff pipeline is entirely reused from existing code (`TorchHitResolver` + `TorchState`); this ADR just routes projectile hits into it.

### Module additions

| Module | Layer | Source analog | Purpose |
|---|---|---|---|
| `PWNozzle` | 2 (Rendering + UI) | raycast.js-master `A_Player` + `R_DrawGlobalSprite` | Screen-space nozzle sprite, bob animation, fire animation, state machine. Reads `HoseState`, `GyroInput`, `PWCursor`. |
| `PWProjectile` | 1 (Core systems) | EyesOnly `ProjectileSystem` | Water-jet state, advance loop, collision dispatch (wall / breakable / enemy / torch / hazard), lerp. |
| `PWFireController` | 3 (Game modules) | gone-rogue monolith glue | Wires input → brandished check → ammo/pressure spend → `PWProjectile.fire()`. One orchestrator that keeps `PWNozzle` and `PWProjectile` decoupled. |

No changes to `HoseDecal`, `HoseOverlay`, `HoseState`, or the planned Rung 2C floor decal. The nozzle sprite draws in the HUD layer above the raycaster output; projectiles render in the sprite plane below the nozzle. The three layers don't fight.

### Three-state nozzle machine

```
  ┌────────┐  hose attached   ┌────────┐  brandish trigger  ┌─────────────┐
  │ ABSENT │ ───────────────> │ STOWED │ ─────────────────> │ BRANDISHED  │
  └────────┘                  └────────┘                    └─────────────┘
       ^                           ^                                │
       │       hose detached       │                                │
       └───────────────────────────┴────────────────────────────────┘
                     holster trigger (also: card draw, combat)
```

**ABSENT** — no hose connected. No sprite. Default first-person view.

**STOWED** — hose connected, nozzle on hip at low-bob position. Sprite visible in bottom-left ~20% of screen (offset from center). Walk-bob applies. No projectile fire. Player is "hauling gear" — runs back to truck, navigates between tiles, interacts with NPCs. Card fan remains usable.

**BRANDISHED** — nozzle raised to classic center-shooting position. Pressure HUD ring activates around crosshair. Projectile fire enabled. Card fan **collapses** (can't hold a hand and aim a high-pressure hose). Walk-bob continues; fire-animation overrides it per shot.

Transitions STOWED → BRANDISHED:

- **Tap-to-toggle via the NchWidget brandish button.** This is the single, explicit, player-driven trigger. See "Brandish button — NchWidget third mode" below. No contextual auto-brandish — the player always chooses.

Transitions BRANDISHED → STOWED:

- **Tap the brandish button again** (same button toggles).
- **Card draw** (player pulls a card from the fan — implicit holster).
- **Combat initiation from outside** (an enemy intent resolves and strips control — implicit holster with a 200ms bob-down animation). The NchWidget itself also flips to `'combat'` mode here, so the brandish button disappears and card surface returns automatically.

#### Brandish button — NchWidget third mode

`engine/nch-widget.js` already ships a mode dispatch: `_mode = 'explore' | 'combat'`, with `enterCombat()` / `exitCombat()` swapping the widget surface via `_setModeClass()`. The joker-stack becomes a selectable card capsule in combat.

**Add a third mode: `'brandish'`**, triggered by `HoseState` attach + not-in-combat. When active, the joker-stack surface swaps to a single water-gun button (💧 or a dedicated pixel-art glyph — TBD during sprite pass). Tapping the button toggles `PWNozzle.setBrandished(true/false)`.

Mode precedence (highest first):

| Mode | Surface | Trigger |
|---|---|---|
| `combat` | Combat capsule (card emojis + selection) | `NchWidget.enterCombat()` called by combat system |
| `brandish` | Water-gun toggle button | `HoseState.isActive()` && `!inCombat` |
| `explore` | Joker stack (🃏 × hand size) | Default |

Transitions are event-driven — the widget already listens for `CardAuthority` events and combat-system hooks, so adding `HoseState` subscribers (`attach` / `detach`) to flip in and out of `brandish` is ≈ 15 lines of code. When brandish mode is active and the player taps, the widget visibly presses and the nozzle sprite animates into view (or out of view, on second tap).

The joker stack doesn't vanish — it compacts to a small badge on the widget. Card-hand size is still legible at a glance; tapping the badge opens the fan normally. This keeps the brandish button from stealing the card affordance.

**Why this is the right place for the button.** It's the only HUD element that already swaps its surface based on gameplay mode. Adding brandish makes it the canonical "what can I do right now" widget — joker = browse cards, dice-equivalent = select in combat, water-gun = toggle the nozzle. One widget, three modes, one input surface the player learns once.

### Projectile model: adapted `PWProjectile`

**Reference feel: Super Mario Sunshine FLUDD.** Water blobs arc under gravity, splatter on surfaces, bounce off walls and floor, and dissipate when they've "cleaned themselves up." Not laser-straight; not hitscan; not purely ballistic rifle rounds. Bouncy, playful, physics-obeying water.

Direct structural port of gone-rogue's `ProjectileSystem` with these amendments:

| gone-rogue field | PWProjectile field | Change |
|---|---|---|
| `_projectiles` (array) | `_jets` (array) | Rename — "projectile" in our lexicon conflicts with card projection language. |
| `speed: 1.6` | `speed: 1.8` | Slight bump. Still reads as a thrown fluid, not a bullet. |
| `range: 15` | `range: f(pressure) → 6–18 tiles` | Rung 9 pressure signal modulates range. |
| `power: 3` | `power: f(pressure, pattern)` | Low pressure + fan pattern = wide low-damage; high pressure + pencil pattern = narrow high-damage. |
| `bounces: 3` | `bounces: 3` (**retained**) | Water **does** ricochet — see "Bounce + arc model" below. |
| — (no gravity) | `gravityY: 0.08` (tile/frame²) | **NEW.** Per-frame velocity accretion on `vy`. Gives the arc. Tunable; start at 0.08 and playtest. |
| `glyph: '↑'` | (none) | First-person view has no ASCII glyph — sprite only. Water-blob sprite with 4–6 moving frames + splatter frame. |
| `card: <Card>` | (removed) | See "Ammo model" below — shots don't consume cards. Combat-initiation still routes through `CardAuthority`, but the card is drawn from the hand at enemy-contact time, not attached at fire time. |
| `state: 'flying' | 'ricochet' | 'exploding' | 'shrinking'` | `state: 'flying' | 'bouncing' | 'splatter' | 'dissipating'` | `bouncing` is a 60ms flash state mirroring gone-rogue's `ricochet`; `splatter` is terminal-on-enemy/torch; `dissipating` is the end-of-life atomize (graduated-shrink model ported from gone-rogue lines 282–293). |
| `_MAX_ACTIVE_PROJECTILES: 8` | `_MAX_ACTIVE_JETS: 6` | Slightly higher because jets live longer (they bounce). Still fire-rate-throttled. |
| `_BASE_FIRE_COOLDOWN_MS: 500` | `_BASE_FIRE_COOLDOWN_MS: 120` | Much faster cadence. Trigger-hold spams jets. |

Advance loop structure (reference: `projectile-system.js` lines 201–402) is copied nearly verbatim. The bounce branch (lines 258–294, graduated ricochet decay + shrink→poof) **stays** and is the anchor of the bounciness. The two real additions are gravity and splatter-paint.

#### Bounce + arc model (Mario Sunshine)

Each frame, after `nextFx/nextFy` is computed but before collision checks:

```js
jet.vy += GRAVITY_Y;          // arc downward
// (optional slight vx damping on each bounce to sell "energy loss")
```

Wall hit: mirror `vx` or `vy` per gone-rogue's axis-aware ricochet (lines 259–268), decrement `bounces`, fire 60ms `bouncing` flash, paint a splatter stamp at the impact tile via `HoseDecal._paintStripe(floorId, x, y, ...)`. Critically: paint **on every bounce**, not just on terminal contact. The trail of a ricocheting water blob is a legible paint record across multiple tiles.

Floor hit (when falling velocity crosses a tile boundary at `vy > 0` and the tile below is solid ground): same as wall but on the y-axis, with `bounces` decremented and a slightly larger splatter stamp (gravity amplifies the impact). At `bounces === 0` or distance-cap (gone-rogue's `_MAX_RANGE_AFTER_RICOCHET = 30`), transition to `dissipating` and shrink-to-zero per gone-rogue's exponential decay. Water "cleans itself up" by losing scale until a final `poof` splash at ~5% scale.

The key player-read: **a water blob fired at a wall arcs, plinks, bounces twice, falls to the floor, bounces once more, shrinks, and disappears — painting the decal at every bounce point.** That's the Sunshine feel, and it's almost free because gone-rogue's ricochet+decay state machine is already written.

**Friendly fire.** After the first bounce, gone-rogue's `projectile.owner` flips to `'ricochet'` (lines 271–274) and enables friendly-fire damage. We **keep** this for PWJets too — a bounced water blob can briefly annoy the player (1 knockback point) if they wander into their own ricochet. Reads as the Sunshine "spray yourself in the face" moment. Caps at knockback-only damage; no real HP cost.

#### Splatter as the decal-paint primitive

Every impact (wall, floor, enemy, torch) calls `HoseDecal._paintStripe(floorId, ix, iy, ...)` with a small 3-cell falloff centered on `(ix, iy)`. The stripe writer's max-combine additive semantics (spec'd in Rung 2C) mean repeated bounces on the same tile just saturate coverage — no double-counting, no subtraction needed.

The result on the floor is a **visible history of the shot**: arc-dotted splats trailing across three or four tiles, readable at a glance. This is what makes "the gun paints the room" rather than "the gun has an invisible hitscan." The Rung 2C spec's two-channel bitmap (coverage + intensity) already supports it without changes.

### Combat initiation — the gone-rogue pattern, adapted

Gone-rogue line 323:

```js
return { alive: true, action: ctx.enterStrCombat(enemy, 'player_attack', projectile.card) };
```

Our equivalent (in `PWProjectile._advanceJet`), **without a pre-attached card**:

```js
if (enemy && jet.owner === 'player') {
  jet.state = 'splatter';
  _addSplatter(nextX, nextY, jet);
  // Combat initiation at hit-time. The jet does NOT carry a card — cards
  // are not consumed per shot (see §Ammo model). Instead, CardAuthority
  // pulls the top-of-hand card on first enemy contact, as if the hit had
  // been a card play. If hand is empty, the hit still lands as a plain
  // physical strike (1 knockback + splatter).
  var resolution = CardAuthority.resolveProjectileHit({
    target: enemy,
    source: 'pw_jet',
    floorId: ctx.floorId,
    impact: { x: nextX, y: nextY },
    fallback: 'knockback_only'
  });
  return { alive: true, resolution: resolution };
}
```

Key differences from gone-rogue's direct `enterStrCombat`:

1. **Dungeon Gleaner routes combat through `CardAuthority`**, not a global combat dispatcher. The authority owns card state and emits events; combat modules subscribe.
2. **No per-shot card commit.** Ammo is energy, not cards (see §Ammo model). The jet is a cheap kinetic thing; it's only when it hits an *enemy* that `CardAuthority` is asked whether the hit should escalate into card-driven combat. If the player has cards, a card is drawn into the resolution; if not, it's a free knockback.
3. **Splatter paints on every bounce, not just terminal contact** — see "Splatter as the decal-paint primitive" above. A missed shot still leaves evidence.

### Torch interaction — reuse, don't rebuild

**Finding (2026-04-17 revision): the torch-extinguish pipeline is already built.** `engine/torch-hit-resolver.js` exists as a Layer 3 module with `onHoseHit(floorId, cx, cy)` that:

- Scans the aimed tile + 4 cardinal neighbors (`SPRAY_OFFSETS`) for `TILES.TORCH_LIT`
- Calls `TorchState.pressureWashExtinguish(floorId, x, y, grid)` — destroys dry fuel, sends flame to empty, preserves hydrated fuel (fuel-slot semantics are data-owned by `engine/torch-state.js`)
- Calls `Lighting.removeLightSource(x, y)` (the actual API — no `extinguishTorch` wrapper needed)
- Calls `FloorManager.syncTorchDecor(floorId, x, y, false)` to clear wall-decor cavity glow
- Calls `WaterCursorFX.spawnBurst(x, y, { count: 14, speedMult: 1.2, upward: false })`
- Plays `AudioSystem.play('steam-hiss', { volume: 0.45 })`
- Tracks `SessionStats.inc('torchesExtinguished', count)` and `torchSlotsRuined`
- Toasts `💨 Torch doused` (with ruined-fuel variant)
- **Gated to depth ≥ 3** (dungeon only — surface/interior torches are decorative infrastructure per SC-A)

The module's own docstring confirms the role: *"This module ships as a **pre-built clean interface** for PW-3's spray system. PW-3's spray delivery layer (cursor aim, brush kernels, input binding) doesn't exist yet — when it does, it calls `onHoseHit(...)` at the end of its spray-resolution tick and torches handle themselves."*

**Revised integration.** `PWProjectile._advanceJet`, on any wall / tile collision inside the dungeon (depth ≥ 3), calls `TorchHitResolver.onHoseHit(floorId, tileX, tileY)` **once** per impact — before or instead of the generic splatter branch. The resolver's 5-tile cardinal splash does the work; if no torch is in range, the call is a no-op and the generic splatter branch proceeds.

```js
// Inside PWProjectile._advanceJet, at the wall/tile-collision branch:
var depth = String(ctx.floorId || '').split('.').length;
if (depth >= 3 && typeof TorchHitResolver !== 'undefined') {
  TorchHitResolver.onHoseHit(ctx.floorId, nextX, nextY);
}
// …then proceed with the splatter / bounce / decal-paint branch below.
```

That's it. No new `Lighting.extinguishTorch` method, no new `TransitionFX.pulseDark`, no invented `SessionStats.increment` — all of those were scope-creep. The hero interaction is real because the machinery is real; the ADR just routes projectile hits into it.

**Out of scope for Rung 2G** (noted here so it doesn't get absorbed by mistake):

- Stealth-cone aggro loss — requires enemy-AI integration with the torch-extinguished state, and is a separate feature worth its own ADR. Revisit after Rung 8 / the enemy-intent pass.
- "Ritual torch" unlocks / dialog — narrative integration with STREET_CHRONICLES, not a projectile concern.
- Surface torch extinguishing (depths 1–2) — `TorchHitResolver` refuses it by design.

### Ammo model — energy bar, accelerated spend

**Shots are not cards. Shots are energy.** The existing `HoseState` energy model already has exactly the shape we need:

```
drain = BASE_DRAIN + (path.length * LENGTH_PENALTY) + (kinkCount * KINK_PENALTY)
```

(from `engine/hose-state.js` lines 28–41 — `BASE_DRAIN`, `LENGTH_PENALTY = f`, `KINK_PENALTY = 0.5`, `PRESSURE_PER_KINK = 0.7`, `MAX_PRESSURE = 1.0`).

The hose drains energy continuously while attached — that's the **idle drain** rate. Brandishing and firing adds a **spray drain** multiplier on top:

| State | Drain rate | Reads as |
|---|---|---|
| Hose attached, stowed | `1.0 × BASE_DRAIN + length + kink penalties` | Baseline — "the rig is running" |
| Hose attached, brandished, trigger idle | `1.3 × baseline` | "Pressure is built up, ready to fire" |
| Hose attached, brandished, trigger held | `3.0 × baseline` | "Spraying — burning energy fast" |

No ammo counter, no empty-clip sound, no card commit per shot. When energy hits zero, `HoseState` emits the existing `detach` event (or a new `depleted` event to distinguish), the hose retracts automatically, and the player has to walk back to the truck. The "ammo" UX is the **energy bar the player already watches** — we're adding a drain tap to a bar that already exists and is already legible.

Config constants (add to `HoseState` or new `PWFireController`):

| Constant | Default | Purpose |
|---|---|---|
| `SPRAY_DRAIN_MULT` | `3.0` | Multiplier applied to drain while trigger held |
| `BRANDISHED_IDLE_MULT` | `1.3` | Multiplier while brandished but not firing |
| `PRESSURE_MIN_TO_FIRE` | `0.15` | Below this `HoseState.getPressureMult()`, trigger-pull is suppressed (kink chokes the flow) |

This resolves open question 1 from the previous draft: **energy, not cards, not a separate ammo pool**. Combat cards still commit at hit-time via `CardAuthority.resolveProjectileHit` (see Combat initiation above) — that's orthogonal to ammo.

### Kink readout — gun jitter

The kink count is one of the most important PW signals and **has never had a real display surface.** Previously it shifted `HoseState.getPressureMult()` which dampened spray silently, or drew a dot on the minimap that the player rarely looked at.

**Decision: the nozzle sprite jitters in proportion to kink count.** Every frame, in `PWNozzle.render()`:

```js
var kinks = HoseState.getKinkCount();               // 0, 1, 2, 3+
var jitterAmp = Math.min(6, kinks * 1.8);           // px, capped
var dx = (Math.random() - 0.5) * jitterAmp * 2;
var dy = (Math.random() - 0.5) * jitterAmp * 2;
// Apply dx/dy to the sprite draw offset this frame only.
```

Reads as: "the hose is backing up, the nozzle kicks." At 0 kinks, the sprite is steady. At 1 kink, a visible shimmer. At 3+, the nozzle is visibly wrestling with the hose — unmistakable feedback that the player needs to retract. Combined with the existing `getPressureMult()` drop on fired jets (reduced range, reduced arc), the kink penalty becomes multi-sensory: the gun looks unstable and the jets travel shorter.

Tuning knob: `JITTER_AMP_PER_KINK = 1.8` in `PWNozzle`. Start at 1.8px/kink and playtest — the threshold for "distracting" vs "informative" is the gate.

**This resolves open question 3.** Jitter is the kink readout. No overlay needed. Post-jam, a hose-kink overlay remains a stretch goal if playtesters want more explicit info, but the jitter alone should carry it.

### Where the sprite bobs, fires, and occludes

Screen layout (reference: `raycast.js-master/r_draw.js:195-224` and `a_player.js:59-135`):

- Nozzle sprite is drawn **after** the world (walls/floor/sprites) and **before** the HUD layer. This slot is already wired in our `Raycaster` core — we add a single `PWNozzle.render(ctx)` call at the right place.
- `STOWED` sprite: bottom-left quadrant, offset ~35% left of center, bob-amplitude 12px.
- `BRANDISHED` sprite: bottom-center, roughly the lower 28% of the vertical viewport. Matches Doom's layout. Walk-bob 8px amplitude; fire-animation offsets +4px upward for frames 1–2 then snaps back.
- Fire animation is 4 frames at 60ms each = 240ms total (Rung 3 audio hooks on frame 1).
- Crosshair + `WaterCursorFX` draws **above** the nozzle — the cursor lives on top of the sprite, which reads as "I'm aiming through my sights."

### Layer sketch (top to bottom, what you see on screen)

```
┌──────────────────────────────────────────────┐
│ HUD (minimap, stats, card fan when stowed)   │  ← existing HUD layer
├──────────────────────────────────────────────┤
│ Crosshair + WaterCursorFX                    │  ← cursor-fx (existing)
├──────────────────────────────────────────────┤
│ PWNozzle sprite (stowed/brandished frames)   │  ← NEW — Layer 2
├──────────────────────────────────────────────┤
│ Muzzle flash / spray burst particles         │  ← NEW — sprite plane
├──────────────────────────────────────────────┤
│ PWJets (projectile sprites, lerp-rendered)   │  ← NEW — sprite plane
├──────────────────────────────────────────────┤
│ World: walls, floor decals, enemy sprites    │  ← Raycaster output
└──────────────────────────────────────────────┘
```

---

## Options Considered

### Option A — Status quo (no weapon sprite, cursor only)

| Dimension | Assessment |
|---|---|
| Implementation cost | $0 — already built |
| Read-the-tool clarity | Low. New players see a crosshair and wonder what tool they're using. |
| Retrofuturism theme fit | Weak. Nothing visually anchors Gleaner as a blue-collar operator. |
| Display surface for pressure/kink/flow | None — requires HUD text readouts or hidden UI. |
| Projectile support | Requires ground-up projectile system anyway. |
| Risk | Low but ceiling-limited. |

**Pros**: No new modules, no new sprites, no browser perf risk.
**Cons**: Scope-compromises the tool reading; every Rung 8/9 signal has to invent a new HUD indicator; breaks the "it looks like an old FPS" vision.

**Rejected** because it fails the "never scope-compromise the correct solution" rule in `CLAUDE.md` — the correct answer is visibly a weapon sprite, and we have the reference implementation sitting right there.

### Option B — Static nozzle overlay (no animation, no states)

| Dimension | Assessment |
|---|---|
| Implementation cost | Low — one PNG, one render call. |
| Read-the-tool clarity | Medium. "There's a tool" but no state reading. |
| Retrofuturism theme fit | Medium. Looks like a cheap mod, not a designed game. |
| Display surface | One fixed sprite — no bob, no fire animation, no pressure ring. |
| Projectile support | Orthogonal — same as Option A. |
| Risk | Low. |

**Pros**: Cheap. Lets us ship a visible tool without the state-machine cost.
**Cons**: The whole *point* of the weapon sprite is that it animates — bob sells motion, fire animation sells the shot, state-change sells the mode switch. A static sprite eats screen real estate without earning any of the gameplay benefit.

**Rejected** — 80% of the value of a weapon sprite is in the animation layer; stripping that is a scope-compromise that's harder to recover from than just building the full thing.

### Option C — Doom-style animated weapon sprite (CHOSEN)

| Dimension | Assessment |
|---|---|
| Implementation cost | ~1.5 dev days total (see §Action Items for breakdown) |
| Read-the-tool clarity | High — entire FPS-literate audience instantly recognizes the form. |
| Retrofuturism theme fit | Very high — Doom/Wolf3D/Duke3D are the exact reference this game wants. |
| Display surface | Full — pressure ring, kink jitter, brandish pose, fire animation, card-draw holster. |
| Projectile support | Native — `PWProjectile` + `PWNozzle` compose naturally. |
| Risk | Medium — adds state machine + three layer 2/3 modules, but all patterns are borrowed. |

**Pros**: Theme-correct, state-readable, projectile-native, and the reference code already exists in two local repos. Composes cleanly with existing cursor-fx, pressure, and card systems. Opens up hero interactions (torches) that wouldn't exist otherwise.

**Cons**: Occludes ~25% of lower-center screen in brandished state. New input binding (brandish/holster). Requires deciding card-fan-vs-brandished precedence. Adds another input mode to reason about (movement / cards / brandished-fire).

### Option D — Custom 3D nozzle model (in-world object, not screen-space sprite)

| Dimension | Assessment |
|---|---|
| Implementation cost | Very high — our raycaster doesn't render 3D meshes, only textured columns + sprites. Would require a meshlet system from scratch. |
| Read-the-tool clarity | High, but in a different register (immersive, not iconic). |
| Retrofuturism theme fit | Low — 3D models read as modern FPS, not retro. |
| Display surface | Full but hard-won. |
| Projectile support | Same as C. |
| Risk | High — new rendering path, unbounded perf cost, breaks the "vanilla raycaster" constraint. |

**Pros**: Looks expensive in a good way for a non-retro game.
**Cons**: Wrong genre, wrong tech, wrong budget.

**Rejected** — violates the "zero build tools" and "vanilla raycaster" constraints in `CLAUDE.md`.

---

## Trade-off Analysis

**Screen occlusion vs. tool legibility.** The brandished sprite eats ~25% of lower-center screen. This is exactly what Doom does. The cost is real — the floor decal system (Rung 2C) renders mostly behind the player, so the occluded region is mostly the 2-tile patch directly in front of Gleaner. That patch carries the *currently-aimed* decal, which the crosshair already highlights. Net: the occlusion is over tiles the cursor already draws attention to — not a net loss.

**Card fan vs. brandished mode.** Collapsing the card fan when brandished forces the player to choose "clean or fight" at any given moment. This constraint reads as a *gameplay decision*, not a UX bug. It also ensures the UI never overlaps (card fan is bottom-center; nozzle is bottom-center; they can't coexist). The cost is that a surprise enemy encounter mid-clean requires a deliberate holster to access cards — which is the right amount of friction because it forces the player to commit.

**Contextual vs. explicit brandish.** The hybrid (auto-brandish on adjacency + explicit brandish always available) has one genuine failure mode: **the player is adjacent to an active tile but wants to shoot a *different* target** (e.g., standing next to grime but aiming at a distant torch). Resolution: adjacency triggers auto-brandish; once brandished, aim is fully cursor-driven and the player can shoot anywhere in range. Auto-brandish only fails to trigger when the player is nowhere near active tiles — and in that case, explicit brandish is always one button-press away.

**Projectile hitscan vs. physical.** gone-rogue uses physical projectiles (speed, range, lerp). We inherit that directly. Hitscan (instant ray resolution) was considered and rejected because:

1. Gone-rogue's reference is physical — copying physical is cheaper than inventing hitscan.
2. Physical projectiles *look right* as a water jet — you see it travel and splatter. Hitscan would look like a laser.
3. Physical projectiles let Rung 9 pressure modulate range and arc (future: gravity on low-pressure shots) — hitscan has no such dimension.
4. Perf cost of physical is minimal at 4 active jets vs. 8 in gone-rogue.

**Combat via CardAuthority vs. direct dispatch.** The gone-rogue pattern calls `ctx.enterStrCombat()` directly from the projectile advance loop. We route through `CardAuthority.resolveProjectileHit()` instead. This costs one layer of indirection but gains: (a) card state stays consistent with the rest of the game, (b) projectile shots can be undone / refunded cleanly if combat rules reject them, (c) combat modules subscribe to events rather than being called directly — this is the architecture that already works everywhere else in this codebase.

---

## Consequences

### What becomes easier

- **Rung 8 (gyro pressure HUD)** — pressure ring draws around the crosshair inside the `PWNozzle` render call; no separate HUD layer.
- **Rung 9 (nozzle identity)** — pattern selection swaps the nozzle sprite tip; different sprites for pencil/fan/arc patterns read immediately.
- **Rung 3 (material audio)** — fire-animation frame 1 emits `AudioSystem.play('pw-fire', {...})`; no new hook needed.
- **"Shoot torches out"** — becomes a built-in interaction because torches are just a tile-type branch in the collision dispatch.
- **Retrofuturism theme** — visually locks in the moment you see the screen.
- **NPC dialog pacing** — nozzle auto-holsters when a dialog opens; card fan auto-restores. Mode management becomes invisible.

### What becomes harder

- **Input mode reasoning** — adds a third mode (brandished) on top of movement + cards. Requires one new binding and careful ordering of input handlers.
- **Testing coverage** — the state machine (ABSENT ↔ STOWED ↔ BRANDISHED) needs its own test file. Borrow the harness style from `tests/hose-decal.test.js`.
- **Sprite asset pipeline** — we need nozzle sprites. At minimum: 1 stowed frame, 1 brandished idle, 4 fire frames, 1 splatter-on-wall burst. 7 sprites total. Style: pixel-art, silhouette-first, warm-metal palette. Can be placeholder-drawn in the first pass.
- **Card fan coexistence** — card fan must collapse cleanly on brandish and restore cleanly on holster. This is mostly a CardFan module concern but lives on the boundary.

### What we'll need to revisit

- **Controller support (LG Magic Remote)** — the Winter 2026 webOS target drives aim via the Magic Remote pointer. Brandish/holster binding must be reachable on the remote. Review before the webOS port.
- **Accessibility** — a player who can't hold a trigger needs either a toggle-fire mode or hold-to-aim / tap-to-fire. Revisit at Rung 10 (controller) or sooner if feedback demands.
- **Friendly fire** — gone-rogue has ricochet friendly fire. We don't ricochet water, so friendly fire is out-of-scope for v1. If we add reflective surfaces later (mirror tiles?), the ricochet path from gone-rogue is a known, tested import.

### Cross-ripple into shipped + drafted work

- **`RUNG_2C_FLOOR_DECAL_SPEC.md`**: no structural change. Add a one-line note to §0/§1 that splatter from `PWProjectile` will write to `HoseDecal._paintStripe`, so the floor decal must remain tolerant of additive writes from a second caller. (Already true — the spec uses max-combine.)
- **`PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md`**: insert a new Rung (2.5 or 2G) between 2F and 3 for the nozzle/projectile work, OR expand Rung 8 to explicitly own nozzle rendering. Lean toward a new Rung so the budget is legible.
- **`PRESSURE_WASHING_ROADMAP.md`**: add ADR-001 to the cross-ref section.

---

## Action Items

Sized against the brief §11.7 hour budget (2A=2h, 2B=2h, 2C=1day, 2D=3h, 2E=1day, 2F=1day). Nozzle work fits between 2F and 8.

1. [ ] Create `engine/pw-nozzle.js` (Layer 2) — three-state machine (ABSENT/STOWED/BRANDISHED), sprite slots, walk-bob, fire animation, holster animation, per-frame jitter offset from `HoseState.getKinkCount()`. ~4h. Reference: `raycast.js-master/a_player.js:59-135`.
2. [ ] Create `engine/pw-projectile.js` (Layer 1) — adapt gone-rogue `projectile-system.js` verbatim. Keep ricochet + graduated decay (lines 258–294). Add `gravityY: 0.08` on `vy` per frame. Rename fields per §Decision table. Cap at `_MAX_ACTIVE_JETS = 6`, `_BASE_FIRE_COOLDOWN_MS = 120`. Paint `HoseDecal._paintStripe` on every bounce. ~4h.
3. [ ] Create `engine/pw-fire-controller.js` (Layer 3) — input → brandished-check → `HoseState` pressure check (`PRESSURE_MIN_TO_FIRE = 0.15`) → `PWProjectile.fire()`. Applies `SPRAY_DRAIN_MULT = 3.0` while trigger held, `BRANDISHED_IDLE_MULT = 1.3` while brandished idle. Thin orchestrator, ~60 lines. ~1h.
4. [ ] Extend `CardAuthority` with `resolveProjectileHit({target, source, floorId, impact, fallback})` — draws top-of-hand at hit time, emits combat event, returns resolution. Honors `fallback: 'knockback_only'` when hand is empty. ~1h. Add one test.
5. [ ] Extend `NchWidget` with `'brandish'` mode — subscribes to `HoseState` `attach`/`detach` (or equivalent) events and `inCombat` flag. Surface swaps to a single water-gun button; tapping calls `PWNozzle.setBrandished(!brandished)`. Joker stack compacts to a side badge. Precedence: `combat > brandish > explore`. ~1h. Add one test.
6. [ ] Wire `PWProjectile._advanceJet` torch branch — on wall/tile collision at depth ≥ 3, call `TorchHitResolver.onHoseHit(ctx.floorId, tileX, tileY)` before the generic splatter branch. No new `Lighting` methods — the resolver already calls `Lighting.removeLightSource(x, y)` internally. ~15min.
7. [ ] Author placeholder nozzle sprites (7 frames: 1 stowed, 1 brandished idle, 4 fire, 1 splatter-on-wall burst; pixel-art, silhouette-first, warm-metal palette). ~1h. Final art pass post-jam.
8. [ ] Wire `index.html` script tags — insert `pw-projectile.js` (Layer 1), `pw-nozzle.js` (Layer 2), `pw-fire-controller.js` (Layer 3) at correct layer positions. ~15min.
9. [ ] Add `tests/pw-nozzle.test.js` + `tests/pw-projectile.test.js` + `tests/nch-widget-brandish.test.js` — state transitions, fire-rate throttle, gravity arc, splatter-on-every-bounce paints decal, torch hit routes to `TorchHitResolver.onHoseHit`, `resolveProjectileHit` fallback when hand empty, NchWidget mode precedence. ~2h.
10. [ ] Cross-reference this ADR from `PRESSURE_WASHING_ROADMAP.md`, `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md`, `RUNG_2C_FLOOR_DECAL_SPEC.md`. ~15min. *(Done 2026-04-17 revision — see the three edited docs.)*
11. [ ] Confirm the Rung 2G entry in `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` §11.7 reflects the revised estimate ≈ **~14h total (≈1.75 dev days)** after the NchWidget wiring task was added. ~15min.

### Gates

- **Feel-check gate (same as Rung 2C)**: Rungs 2A/2B must read cleanly at 160×160 minimap before any of this ships. Nothing in this ADR relaxes that.
- **Perf gate**: ≤ 0.3 ms combined for `PWNozzle.render()` + `PWProjectile.updateLerp()` at 960×540 with 4 active jets. Measure on Hero's Wake B2. If blown, drop active jets to 2 and move muzzle flash to a single-pass canvas blit.
- **Card fan integration gate**: before merging, verify that brandish → card collapse → card restore on holster works without breaking a card mid-play. Test by entering brandish mid-drag.

---

## First-play experience — the 60-second loop

This is the explicit UX the implementation should be measured against. If a first-time player deploys from the title screen, walks to the truck, and within 60 seconds is laughing at water blobs bouncing around the room, Rung 2G is shipped:

1. Player spawns, walks to the truck, picks up the hose. `HoseState.attach()` fires.
2. NchWidget flips to `brandish` mode — joker stack compacts to a side badge, a water-gun button appears in its place.
3. Player taps the water-gun button. `PWNozzle` enters `BRANDISHED`. The nozzle sprite bobs into center-bottom position over ~200ms.
4. Player pulls the trigger (LMB, spacebar, or Magic Remote fire button). `PWProjectile.fire()` spawns a water blob that:
   - Launches forward with `speed: 1.8`, `gravityY: 0.08`, `bounces: 3`
   - Arcs visibly under gravity
   - Hits a wall, `vx` mirrors, paints a splatter into `HoseDecal`, `bounces--`
   - Falls, hits the floor, `vy` mirrors, paints a second splatter, `bounces--`
   - Bounces again off a different wall — paint — `bounces--`
   - At `bounces === 0`, transitions to `dissipating`, shrinks exponentially, final poof at 5% scale
5. Player sees the arc, the ricochet, the shrinking, and the wet trail left on the floor. They fire again. And again. Because it's fun.
6. Energy bar drains visibly — 3× spray rate. Player gets feedback that spraying is expensive without anyone having to explain it.
7. Incidentally, a water blob lands near a lit torch. `TorchHitResolver.onHoseHit(floorId, tileX, tileY)` fires. Torch snuffs with steam, toast shows `💨 Torch doused`, `torchesExtinguished++`. Player didn't aim at it; they discover it. **This is the anchor hero interaction** — shooting the torch lights out as an emergent consequence of fluid-like water behavior, not as a dedicated minigame.
8. Hose kinks (player walked across their own trail). Nozzle sprite starts jittering. Player reads the shake, backtracks, unkinks.
9. Energy drops below 15%. Pressure falls. Water blobs arc shorter, bounce less. Player notices, decides to head back to the truck.

The loop's joy is: **water-pistol physics + persistent paint trail + emergent torch-knock-outs**. Not "select target, aim, fire." Just "spray chaotically, enjoy the mess."

## Open questions (non-blocking)

All four previously-open questions are now resolved in the body of this ADR; kept here as a trail for future readers:

1. ~~Cards vs ammo for trigger-pull~~ → **Energy bar, accelerated spend.** No per-shot cards, no ammo counter. Cards commit at enemy-hit time via `CardAuthority.resolveProjectileHit`. See §Ammo model.
2. ~~Brandish binding~~ → **Tap-to-toggle via NchWidget third mode.** Widget swaps surface based on `HoseState.isActive()` + combat status. See §Brandish button.
3. ~~Kink readout mechanism~~ → **Gun jitter.** Nozzle sprite draw offset proportional to `HoseState.getKinkCount()`, capped at 6px. See §Kink readout.
4. ~~Splatter radius~~ → **3-cell falloff centered on each bounce impact.** Paints on every bounce via `HoseDecal._paintStripe`, not just terminal contact. See §Splatter as the decal-paint primitive.

Remaining small decisions (tuning, not architecture):

- Exact sprite glyph for the brandish button in `NchWidget` (💧 vs 🔫 vs pixel-art water-gun). Pick during sprite pass.
- `GRAVITY_Y` initial value (0.08 is the starting guess — playtest to find the arc that looks Sunshine-like, not Quake-like, not moon-gravity).
- Should the `'depleted'` hose event distinct from `detach`, or reuse `detach` with a reason code? Lean reason code.

---

## Changelog

- 2026-04-17 — Drafted. Status: Accepted pending implementation. Gates listed.
- 2026-04-17 (revision) — Refactored five sections after user feedback:
  - Torch interaction: dropped invented `Lighting.extinguishTorch` / `TransitionFX.pulseDark` / stealth cone / ritual torches. Replaced with a single call into the already-shipped `TorchHitResolver.onHoseHit(floorId, cx, cy)` (see `engine/torch-hit-resolver.js` + `engine/torch-state.js`).
  - Projectile model: water **does** ricochet. Added gravity (`gravityY: 0.08`) and Mario Sunshine arc feel. Restored `bounces: 3` from gone-rogue. Added `bouncing` state and floor-bounce branch. Splatter paints on every bounce, not just terminal impact.
  - Combat initiation: removed per-shot card attachment. `CardAuthority.resolveProjectileHit` now draws a card at enemy-contact time with a `knockback_only` fallback when hand is empty.
  - Ammo model: shots consume hose energy via `SPRAY_DRAIN_MULT = 3.0` on top of existing `HoseState` drain. No ammo counter, no empty-clip SFX. The bar the player already watches becomes the ammo UX.
  - Brandish: removed hybrid auto-brandish; collapsed to tap-to-toggle in a new `'brandish'` mode on `NchWidget`. Single button, single mental model.
  - Kink readout: upgraded from hand-wave to a concrete jitter formula (`jitterAmp = min(6, kinks * 1.8)` applied per-frame to the sprite offset).
  - Added §First-play experience — the 60-second loop measuring the Rung 2G ship quality.
  - Action Items +1: `NchWidget` brandish-mode wiring. Total effort nudges from ~13h to ~14h.

# Light-Emitting Sprites & Dungeon Torch Reset — Roadmap

> **Created:** 2026-03-31
> **Scope:** Dynamic light sources, torch wall sprites, and the extinguish/refuel game loop
> **Engine:** Dungeon Gleaner · Vanilla JS IIFE · Layer 1 (Lighting) + Layer 2 (Raycaster)

---

## Design Intent

Torches on dungeon walls are central to the cleaning loop. The hero charges through, knocking torches off walls or extinguishing them. Gleaner's job: relight them, replace fuel, restore the dungeon to operational state. This is the "cleaning up the hero's mess" theme made literal — darkness is the mess, light is the fix.

Light-emitting sprites also serve the broader atmosphere: bonfires warm the area around them, building entrances glow invitingly on dark streets, and dungeon torches cast flickering pools that reveal (or conceal) threats.

---

## Current State

### What exists:
- **Lighting.js** — Per-tile lightmap (Float32Array). Player-centric radial light, radius 6, quadratic falloff. `calculate(player, grid, gridW, gridH)` returns 2D brightness map.
- **Raycaster wall brightness** — Reads `lightMap[y][x]` per wall column. Applies color multiply + darkness overlay.
- **Sprite glow** — Visual halo only (`glow` color + `glowRadius`). Bonfire fire sprite uses it. **Does not contribute to lightmap.**
- **BONFIRE tile (18)** — Has sprite composition (tent + fire + shrubs). Fire has orange glow. No lightmap emission.
- **HEARTH tile (29)** — Opaque column, fireplace. No glow sprite.

### What's missing:
- No `TORCH` or `LANTERN` tile type
- No dynamic light sources in Lighting.js (only player light)
- Sprite glow doesn't affect per-tile brightness
- No extinguish/relight interaction
- No torch fuel resource or refuel mechanic

---

## Phase 1 — Dynamic Light Sources in Lighting.js (1.5h)

Extend the lightmap to support multiple positioned light sources beyond the player.

### 1a. Light source registry

```javascript
var _lightSources = [];  // { x, y, radius, intensity, color, flicker }

function addLightSource(x, y, radius, intensity, opts) { ... }
function removeLightSource(x, y) { ... }
function clearLightSources() { ... }
```

### 1b. Calculate loop extension

In `calculate()`, after player light pass, iterate `_lightSources`:

```javascript
for (var s = 0; s < _lightSources.length; s++) {
  var src = _lightSources[s];
  var effRadius = src.radius * (src.flicker ? (0.85 + 0.15 * Math.sin(now * 0.005 + s)) : 1);
  // Same quadratic falloff as player light
  // lightMap[ty][tx] = Math.max(lightMap[ty][tx], brightness)
}
```

### 1c. Flicker parameter

Torches flicker (±15% radius oscillation at ~3Hz). Bonfires pulse slower (±10% at ~1Hz). Building entrance lights are steady (no flicker).

### 1d. Color tinting (post-jam enhancement)

For now, all lights are white (brightness only). Post-jam: per-source color tinting via separate RGB lightmap channels.

---

## Phase 2 — Torch Tile Type & Wall Sprites (2h)

### 2a. New tile constants

```javascript
TILES.TORCH_LIT   = 30;  // Wall-mounted torch, burning
TILES.TORCH_UNLIT = 31;  // Wall-mounted torch, extinguished (hero's mess)
```

Both are **opaque** (block movement like walls). They render as wall columns in the raycaster with a torch sprite overlay.

### 2b. Torch wall rendering

Torches are wall-adjacent. The raycaster renders the base wall texture, then overlays a torch sprite:
- **Lit**: 🔥 emoji at 0.3 scale, warm glow halo, flickering bobY
- **Unlit**: Charred bracket sprite (no glow, dim)

Implementation: in raycaster wall column loop, after drawing the wall strip, check tile type. If TORCH_LIT, draw a small fire emoji at the column's vertical center with glow. This reuses the sprite glow system but applied per-column.

### 2c. Light source registration

When FloorManager generates a floor, scan for TORCH_LIT tiles and register each as a light source:

```javascript
// In game.js floor setup
for (y...) for (x...) {
  if (grid[y][x] === TILES.TORCH_LIT) {
    Lighting.addLightSource(x, y, 4, 0.8, { flicker: true });
  }
}
```

Radius 4 tiles, intensity 0.8, flickering enabled.

### 2d. Bonfire light registration

Similarly, BONFIRE tiles register as light sources (radius 5, intensity 0.9, slow pulse).

### 2e. Building entrance glow

Exterior DOOR tiles on depth-1 floors register as steady light sources (radius 3, intensity 0.6, no flicker). Makes building entrances visually inviting at night.

---

## Phase 3 — Torch Interaction: Slot-Based Extinguish & Refuel (2.5h)

Central to the "cleaning" game loop. Torches are not binary on/off — they're **slot containers** (like crates and corpse stocks) with fuel management and a flame state.

### 3a. Torch Slot Model

Every torch (lit or unlit) has **3 slots**:

```javascript
torch = {
  tile: TILES.TORCH_LIT | TILES.TORCH_UNLIT,
  biome: 'coral' | 'driftwood' | 'deep' | ...,
  idealFuel: 'torch_oil_coral',   // biome-specific ideal fuel
  slots: [
    { state: 'fuel_hydrated' | 'fuel_dry' | 'empty' | 'flame', item: null | itemRef },
    { state: ... },
    { state: ... }
  ]
};
```

**Slot states:**
- `'flame'` — the torch is lit. This slot holds the active fire. Visually renders as a 🔥 button (same pattern as incinerator emoji in menu).
- `'fuel_hydrated'` — filled with properly hydrated fuel. Contributes to readiness score.
- `'fuel_dry'` — filled with fuel but not hydrated (water bottle needed to prep, or was perfect fuel that doesn't need hydration). Still contributes partial readiness.
- `'empty'` — empty slot waiting for fuel.

**Lit torch** (when player enters dungeon): typically has 1 flame slot + 0–2 empty/dry slots.
**Unlit torch** (post-hero): flame slot is gone → 2–3 empty slots. The hero either knocked the fuel out or extinguished it.

### 3b. Torch Peek (Interaction Surface)

When player faces a torch tile and presses interact → opens **TorchPeek** (same peek pattern as CratePeek, CorpsePeek):

**Lit torch peek** shows:
- Slot 1: 🔥 (flame — draggable/interactive)
- Slot 2: empty / fuel_dry / fuel_hydrated
- Slot 3: empty / fuel_dry / fuel_hydrated

**Player actions in TorchPeek:**
1. **Drag water bottle onto 🔥 flame slot** → extinguishes torch. Flame slot becomes `fuel_hydrated` (the water freed the slot AND hydrated the fuel beneath) or `empty` (if no fuel was under the flame). Consumes 1 water bottle.
2. **Drag fuel item onto empty slot** → fills slot. Item is consumed from inventory.
3. **Drag water bottle onto fuel_dry slot** → hydrates fuel in place. `fuel_dry` → `fuel_hydrated`. Consumes 1 water bottle.
4. **Drag non-fuel item onto empty slot** → fills the slot with junk. Provides a tiny readiness bonus ("they filled the hole with something"). Players stuffing bandages into torch slots think they're being effective but get low readiness marks.

**Fuel quality tiers:**
- **Ideal fuel** (biome-matched): `torch_oil_coral` in Coral Bazaar torches → full readiness per slot
- **Generic fuel** (any torch oil): partial readiness (~60% per slot)
- **Non-fuel item** (bandage, cloth, etc.): tiny readiness (~15% per slot, "filled the hole")
- **Nothing**: 0% readiness for that slot

This creates a **knowledge sink**: players who read in-game books learn which fuel matches which biome torch. Casual players who stuff bandages in every slot still progress, just slowly.

### 3c. Extinguishing Methods

Three ways to extinguish a lit torch:

1. **TorchPeek drag** (careful method) — drag water bottle onto flame slot. Hydrates fuel, preserves slot contents. **Best readiness outcome.**
2. **Pressure washing** (hose method) — spraying a lit torch tile OR an adjacent tile with the pressure washer knocks out the flame slot with **zero chance of fuel hydration**. The water blast extinguishes but also soaks/ruins any dry fuel in other slots. Fast but wasteful. (Requires PRESSURE_WASHING_ROADMAP Phase PW-3.)
3. **Future: combat knockback** — hero or enemy collision extinguishes torches in radius. Post-jam.

**Design intent**: Pressure washing torches is a **trap for impatient players**. It's faster than opening TorchPeek and carefully hydrating, but it destroys fuel state. Careful players who use water bottles through TorchPeek get higher readiness scores. The game rewards reading details from in-game books (fuel matching, hydration order) while still letting spray-everything players progress.

### 3d. Torch Fuel Items

| Item | ID | Source | Ideal For | Notes |
|------|----|--------|-----------|-------|
| Coral Oil | `torch_oil_coral` | Shop (1.1) | Coral Bazaar torches | Pink-tinted |
| Driftwood Resin | `torch_oil_drift` | Loot (1.3.1) | Driftwood Inn torches | Amber |
| Deep Tallow | `torch_oil_deep` | Loot (2.2.1+) | Deep dungeon torches | Blue-grey |
| Generic Torch Oil | `torch_oil` | Shop (2.1), crates | Any (partial match) | Common |
| Water Bottle | `water_bottle` | Shop, crates | Extinguish / hydrate | Multi-use |

Fuel items flow through CardAuthority (bag zone). Water bottles are also used for drinking (HP recovery) so there's a resource tension: use water to carefully extinguish and hydrate, or drink it for survival.

### 3e. Floor Torch State & Readiness

Each floor tracks per-torch slot state. Readiness scoring:

```javascript
// Per-torch readiness = average slot quality
// slot scores: flame=0 (torch should be unlit), fuel_hydrated(ideal)=1.0,
//              fuel_hydrated(generic)=0.6, fuel_dry=0.3,
//              non-fuel-junk=0.15, empty=0.0
var torchReadiness = sumOfSlotScores / (torchCount * SLOTS_PER_TORCH);
// torchReadiness contributes to overall floor readiness %
```

A "perfect" torch: unlit (no flame), all 3 slots filled with biome-ideal hydrated fuel = 3.0/3.0 = 100%.

### 3f. Dungeon Reset Flow

When Gleaner enters a hero-stormed dungeon:
1. Most torches are lit (hero left them burning) with 0–2 empty fuel slots
2. Some torches are unlit (hero knocked them out) with 2–3 empty slots
3. Darkness from unlit torches limits visibility
4. Player must: extinguish lit torches (careful or pressure wash), fill fuel slots, match biome fuel
5. Full torch prep = floor passes "torch readiness" check
6. Combined with grime cleaning, corpse cleanup, trap rearming, crate restocking → floor reset complete

### 3g. Hero Damage Patterns

GridGen generates hero-stormed torch states:
- 30-50% of torches stay lit (hero didn't bother extinguishing) — these have 0–2 empty fuel slots
- 50-70% of torches extinguished by hero combat (knocked out) — 2–3 empty slots
- Torches near combat areas (CORPSE tiles) are always unlit with fully empty slots
- Torches near STAIRS_DN/UP are always lit (hero used them for navigation)
- A few torches retain 1 dry fuel slot (hero missed it)

---

## Phase 4 — Visual Polish (1h, post-jam)

### 4a. Torch flame animation

Procedural fire sprite: 3-frame alternating emoji or pixel-drawn flame. Small particles rising from lit torches (reuse ParticleFX).

### 4b. Light color temperature

Torches = warm orange (multiply wall colors by warm tint). Bonfires = amber. Building lights = cool white. Player lantern = neutral. Requires per-source RGB in lightmap.

### 4c. Shadow casting

Opaque tiles cast shadows from light sources (raycast from each source). Walls between a torch and a tile block light. Expensive but dramatic. Post-jam optimization: only cast shadows for nearest 4 light sources.

### 4d. Day/night cycle interaction

On exterior floors, DayCycle ambient brightness replaces the lightmap. Building entrance lights only visible at night (glow fades during day). Torches are dungeon-only (no sun underground).

---

## Phase 5 — Light-Emitting Sprite Types (1h, additive)

### New sprite categories:

| Sprite | Location | Radius | Flicker | Purpose |
|--------|----------|--------|---------|---------|
| Wall torch (lit) | Dungeon walls | 4 | Yes (3Hz) | Core cleaning target |
| Wall torch (unlit) | Dungeon walls | 0 | — | Hero's mess indicator |
| Bonfire | Rest points | 5 | Slow (1Hz) | Safe zone beacon |
| Building entrance | Exterior doors | 3 | No | Wayfinding |
| Lantern post | Exterior paths | 4 | Slight (0.5Hz) | Street atmosphere |
| Hearth | Inn/home interiors | 3 | Slow (0.8Hz) | Cozy warmth |
| Crystal deposit | Deep dungeons | 2 | Pulse (0.3Hz) | Discovery reward |
| Dragon ember | Conspiracy evidence | 6 | Slow pulse | Narrative breadcrumb |

### Registration pattern

Each light-emitting tile type registers its light source during floor setup. `Lighting.clearLightSources()` is called on floor transition, then new sources are registered for the new floor.

---

## Dependency Graph

```
Phase 1 (Lighting.js extension)
  │
  ├── Phase 2 (Torch tiles + wall sprites)
  │     │
  │     └── Phase 3 (Interaction + fuel + reset loop)
  │           │
  │           └── Phase 5 (Additional sprite types)
  │
  └── Phase 4 (Visual polish — post-jam)
```

**Jam scope:** Phases 1–3 (~5.5h). Phases 4–5 are post-jam polish.

---

## Integration Points

| System | Hook | Purpose |
|--------|------|---------|
| **Lighting.js** | `addLightSource()` / `clearLightSources()` | Core API |
| **Raycaster** | Wall column torch overlay + lightmap reads | Visual |
| **FloorManager** | Floor setup scans for torch/bonfire tiles | Registration |
| **InteractPrompt** | TORCH_UNLIT interaction detection | Player action |
| **ReadinessCalc** | Torch relight % in floor readiness score | Game loop |
| **LootTables** | Torch fuel drops from crates/enemies | Economy |
| **GridGen** | Hero damage patterns (extinguish % on generation) | Content |
| **Minimap** | Torch tile colors (lit=orange, unlit=dark grey) | Navigation |
| **SessionStats** | Track torches relit per run | Stats |

---

## Cross-References to Other Roadmaps

### Phase 1 ≡ TEXTURE_ROADMAP Layer 3 (Sprite Light Emitters)

**These are the same implementation.** TEXTURE_ROADMAP Layer 3 defines a
light source registry with format `{ x, y, color, radius, intensity, flicker }`
and extends Lighting.js with point light calculation + glow overlay +
flicker functions. Phase 1 here defines the identical system. Implement once:

- Phase 1a light source registry = Layer 3 light source registry
- Phase 1b calculate loop extension = Layer 3 lighting integration
- Phase 1c flicker parameter = Layer 3 flicker functions (torch, neon, steady)
- Phase 1d color tinting = Layer 3 color tinting (post-jam for both)

TEXTURE_ROADMAP's "Future — Campfire/Bonfire Sprite with Glow" section says
"Blocked on: Layer 3 implementation." Once Phase 1 ships here, that blocker
is resolved — bonfire registration (Phase 2d below) handles it directly.

### Phase 2 ↔ TEXTURE_ROADMAP Layer 2 (Wall-Mounted Sprites)

TEXTURE Layer 2 defines the `wallDecor[y][x]` data model for attaching
sprites to wall faces. Phase 2b here (torch wall rendering) is a specific
consumer of that system. Implementation order:

1. TEXTURE Layer 2: build wall decor data model + raycaster face-hit rendering
2. Phase 2a here: define TORCH_LIT/TORCH_UNLIT tile constants
3. Phase 2b here: torch sprites as wall decor items (`emitter: true`)
4. Phase 2c here: light source registration scans for torch tiles

Torch wall rendering should NOT duplicate the wall decor sprite system.
Torches are wall decor items — they use the same `anchorU`, `anchorV`,
`scale`, `spriteId` fields plus an `emitter` flag.

### Phase 2 ↔ NLAYER_RAYCASTER_ROADMAP Phase 1

Both Phase 2b (torch overlay in raycaster) and N-layer Phase 1 (multi-hit
DDA refactor) modify the raycaster wall column loop. **N-layer should land
first.** Torch overlays then operate within the back-to-front render loop,
drawing torch sprites per-layer. If torches ship on the current single-hit
DDA, they'll need refactoring when N-layer lands.

Recommended sequence: NLAYER Phase 1 → TEXTURE Layer 2 → this Phase 2.

### Phase 2e (Building entrance glow) ↔ SKYBOX_ROADMAP

Building entrance lights (steady, radius 3, intensity 0.6) should respond
to DayCycle phase. During daytime, entrance glow is invisible (ambient light
overwhelms it). At night, it becomes the primary wayfinding cue. Wire:

```javascript
// Intensity scales with darkness
var nightFactor = DayCycle.getPhase() === 'night' ? 1.0 :
                  DayCycle.getPhase() === 'dusk' ? 0.6 :
                  DayCycle.getPhase() === 'dawn' ? 0.4 : 0.1;
Lighting.addLightSource(x, y, 3, 0.6 * nightFactor, { flicker: false });
```

SKYBOX_ROADMAP Phase 1 (sky color cycling) must ship first so DayCycle
phase-aware rendering is active when entrance lights register.

### Phase 3 (Torch interaction) ↔ TEXTURE_ROADMAP Layer 2 auto-placement

Phase 3e (hero damage patterns) generates floors with 60-80% torches
extinguished. TEXTURE Layer 2's auto-placement rules in GridGen determine
WHERE torches go (room entrances, corridors). These are complementary:

- Layer 2 auto-placement: decides torch positions during grid generation
- Phase 3e: flips a percentage of those positions to TORCH_UNLIT

### Phase 4d (Day/night interaction) ↔ SKYBOX_ROADMAP Phase 7d

Both describe DayCycle-aware rendering adjustments. Phase 4d here says
exterior floors use DayCycle ambient brightness instead of lightmap; torches
are dungeon-only. SKYBOX Phase 7d wires PostProcess color grading to DayCycle
phase changes. These are independent but thematically aligned — both make the
world respond to time of day.

### Phase 3c (Pressure wash extinguish) ↔ PRESSURE_WASHING_ROADMAP Phase PW-3

Pressure washing a lit torch tile (or a tile adjacent to a lit torch) extinguishes the flame slot with zero fuel hydration. This is the "fast but wasteful" path — the hose blast knocks out the fire but soaks/ruins dry fuel. Implementation requires:

1. PRESSURE_WASHING_ROADMAP PW-1 (GrimeGrid) — grime system exists
2. PRESSURE_WASHING_ROADMAP PW-2 (HoseState) — hose is attached
3. PRESSURE_WASHING_ROADMAP PW-3 (Spray interaction) — spray targeting works
4. This Phase 3 (Torch slot model) — torch has slots to modify

When spray hits a TORCH_LIT tile or adjacent tile: `torch.slots[flameIdx].state = 'empty'`, tile flips to TORCH_UNLIT, light source removed. Any `fuel_dry` slots become `empty` (water ruined them). `fuel_hydrated` slots survive (already wet). This makes pressure-wash extinguishing strictly inferior to careful TorchPeek water-bottle extinguishing for readiness score.

**Dependency**: PW-3 + Phase 3 can be wired independently, but the torch-hit detection in the spray system needs the torch slot model from Phase 3a to exist. Implementation order: Phase 3a (slot model) → PW-3 (spray system) → wire torch-hit → test.

### Phase 5 (Additional sprite types) ↔ SKYBOX_ROADMAP Phase 5 (Floor 3)

Crystal deposits and dragon embers (Phase 5 sprite types) are planned for
deep dungeons and conspiracy-evidence floors. Floor 3's dungeon levels
(`"3.1.1"+` Deep Vaults) are where these would first appear. Floor 3
blockout (gated by SKYBOX Phase 5 + frontier textures) determines the
map layouts where these emitters get placed.

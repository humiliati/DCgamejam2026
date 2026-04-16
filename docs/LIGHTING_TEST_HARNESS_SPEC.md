# Lighting Test-Harness Spec

**Status:** proposal · **Owner:** engine/rendering team · **Target:** `test-harness.html` (+ a pre-launch settings modal reachable from the title screen).

## Purpose

We have four overlapping lighting systems — `Lighting` (grid lightmap + flicker snapshot), `LightOrbs` (additive halation), `WeatherSystem` (particle veil + preset modifiers), and `DayCycle` (phase dimming + skybox tint). Tuning them currently requires editing module source, reloading, and eyeballing. We want:

1. A **live tuning panel** in `test-harness.html` that mutates the engine in place so a designer can walk a floor with the sliders open.
2. A **pre-launch settings modal** (reachable from title screen → Settings → Graphics) exposing a smaller curated subset so players with low-spec webOS TVs can dim the halation, disable the proximity wash, or drop particle density.
3. A **preset save/load flow** so the team can snapshot a good look per floor-depth and commit the JSON into `data/lighting-presets.json`.

Both consumers share the same knob catalog below. The harness exposes everything; the player-facing modal exposes a subset marked with ⭐.

## Architecture

### Knob surface

Each live module already has a frozen public API. To avoid unfreezing, add a single `setTunable(name, value)` entrypoint per module that switch-cases the name, or a `setTunables(obj)` that merges a patch. Example for LightOrbs:

```js
// in engine/light-orbs.js
function setTunables(patch) {
  if (patch.BASE_RADIUS_PX      != null) BASE_RADIUS_PX      = +patch.BASE_RADIUS_PX;
  if (patch.RENDER_DIST         != null) RENDER_DIST         = +patch.RENDER_DIST;
  if (patch.FLICKER_SMOOTH_TAU  != null) FLICKER_SMOOTH_TAU  = +patch.FLICKER_SMOOTH_TAU;
  // ...
  if (patch.kind) {
    // deep-merge per-kind overrides
    for (var k in patch.kind) {
      if (_KIND[k]) Object.assign(_KIND[k], patch.kind[k]);
    }
  }
}
```

The returned public API gains one entry: `setTunables`. The IIFE stays frozen; only the inner `var`s mutate. This is the minimum-invasive pattern and matches how `MovementController.setTimings()` already works.

### Harness UI

`test-harness.html` gets a new collapsible right-hand drawer (absolute-positioned, `z-index: 9999` so it floats over the canvas). Uses native `<input type="range">` + `<input type="number">` pairs so both coarse dragging and precise keyboard entry work. No framework — write it vanilla to match the engine.

Structure:

```
[Drawer header: "Lighting" · collapse/expand · preset dropdown · Save / Load / Copy JSON]
  ▸ Orbs (LightOrbs)
  ▸ Flicker (Lighting)
  ▸ Grid lightmap (Lighting)
  ▸ Weather modifiers
  ▸ Depth modifiers
  ▸ Day cycle
  ▸ Per-kind (torch / bonfire / hearth / lantern / brazier)
  ▸ Debug overlays
```

Each section is a `<details>` element so designers can collapse the noise. State persists to `localStorage` under `testharness.lighting.panel` so a page reload doesn't lose layout.

Every slider fires `oninput` (live) and writes through to the module's `setTunables`. Every slider also has a tiny "↺" revert button that restores the module's compile-time default (captured at harness init by reading the public `getTunables()` accessor we add alongside the setter).

### Pre-launch settings modal

Title screen → Settings → Graphics gets:

- ⭐ **Halation intensity** → maps to `LightOrbs.ALPHA_BOOST` 0–3 (default 2.4)
- ⭐ **Flicker calm** → maps to `FLICKER_SMOOTH_TAU` 0.05–1.0 (default 0.38; higher = calmer)
- ⭐ **Light render distance** → maps to `RENDER_DIST` 12–50 (default 50; lets low-spec sets cull distant torches)
- ⭐ **Proximity wash** → on/off toggle (sets `WASH_MAX_ALPHA` to 0.20 or 0)
- ⭐ **Weather particle density** → `WeatherSystem.setParticleScale()` 0.25–1.5
- ⭐ **Day cycle length** → minutes per full cycle, 5/15/30/60
- ⭐ **Photosensitivity mode** → a compound preset that sets `FLICKER_SMOOTH_TAU=0.9`, zeroes the flicker frequencies in Lighting, disables weather sparkle, and caps `ALPHA_BOOST` at 1.6

All player-facing values persist to a config slot inside the existing save system so the choice survives reloads.

## Knob catalog

Grouped by module. ⭐ = also appears in the player-facing modal.

### LightOrbs (`engine/light-orbs.js`)

| Knob | Default | Range | Notes |
|------|---------|-------|-------|
| `BASE_RADIUS_PX` | 105 | 40–200 | Orb size at dist=1. Scales everything downstream. |
| `MAX_RADIUS_PX` | 340 | 120–600 | Near-camera cap. Raise for big exteriors, lower for tight dungeons. |
| `MIN_RADIUS_PX` | 2 | 1–12 | Pinpoint floor. 1 keeps distant torches as single-pixel dots; 6 hides them. |
| `MIN_ALPHA` | 0.015 | 0.005–0.1 | Cull threshold. Lower = farther reach, more overdraw. |
| ⭐ `ALPHA_BOOST` | 2.4 | 0–4 | Additive-composite multiplier. Primary "brightness" dial. |
| ⭐ `RENDER_DIST` | 50 | 12–80 | Tile cull for orb pass. Single biggest perf knob. |
| `SCATTER_LERP` | 0.40 | 0–0.8 | How far the scatter orb slides toward screen centre. |
| `SCATTER_ALPHA_MUL` | 0.55 | 0–1 | Scatter dimming. |
| `SCATTER_RADIUS_MUL` | 0.65 | 0.2–1.5 | Scatter size vs main. |
| ⭐ `FLICKER_SMOOTH_TAU` | 0.38 | 0.02–1.0 | Seconds of EMA lag on peakA. |
| ⭐ `WASH_START_DIST` | 2.4 | 0–6 | Tile radius at which proximity wash begins. |
| `WASH_PEAK_DIST` | 0.55 | 0.1–2.0 | Tile radius at which wash is full strength. |
| ⭐ `WASH_MAX_ALPHA` | 0.20 | 0–0.5 | Wash ceiling (0 disables). |
| `DAY_DIM` / `DUSK_DIM` / `NIGHT_DIM` / `DAWN_DIM` | 0.25 / 0.70 / 1.0 / 0.55 | 0–1 | Exterior-only phase dimming. |

**Per-kind overrides** (`_KIND[torch|bonfire|hearth|lantern|brazier]`):

| Sub-knob | torch | bonfire | hearth | lantern | brazier | Range |
|----------|-------|---------|--------|---------|---------|-------|
| `radiusMul` | 1.0 | 1.8 | 1.6 | 0.7 | 1.4 | 0.3–3.0 |
| `alphaMul`  | 0.85 | 1.00 | 0.95 | 0.75 | 0.90 | 0.2–1.5 |
| `yOffset`   | 0.35 | 0.40 | 0.30 | 0.15 | 0.30 | −0.3–0.8 |

Expose these as a small table with one row per kind and three number inputs per row.

### Lighting (`engine/lighting.js`)

Flicker frequency and shape are the designer's main dials here — the orbs read `peakA` from this module, so calming the orb flicker via LightOrbs' EMA masks but does not replace a source-level fix.

| Knob | Notes |
|------|-------|
| torch flicker freq | Currently hardcoded in `_flickerPulse`. Lift to `_FLICKER_FREQ.torch` so harness can tune. Default 6.3 rad/s; useful range 2–10. |
| bonfire flicker freq | Default 3.1 + 7.7 crossfade. Expose both. |
| hearth flicker freq | 2.2. Slowest of the set; rarely changed. |
| steady flicker freq | 1.1 (electric/terminal sources). |
| flicker amplitude | Split from frequency — fraction of base intensity that flickers. 0 = dead steady, 1 = strobe. |
| `TINT_WARM` / `TINT_COOL` / `TINT_DUNGEON` | RGB palette entries. Expose as colour pickers. |
| grid lightmap radius | Current default 4 tiles. Range 2–8. |
| grid lightmap falloff exponent | Linear vs quadratic. |
| wall-darkness multiplier | How aggressively unlit wall pixels are shaded. |

### WeatherSystem (`engine/weather-system.js`)

| Knob | Notes |
|------|-------|
| ⭐ particle density scale | Multiplier on per-preset particle cap. |
| per-preset overrides | Allow the harness to force any preset (`clear`, `light_rain`, `heavy_rain`, `hearth_smoke`, `indoor_dust`, `lantern_haze`, `cellar_drip`, `dungeon_dust`, `boardwalk_wind`) regardless of floor/day. |
| wind vector | Override the wind direction so designers can check dust-drift from any angle. |
| sparkle rate | Current `sparkle` field on `_WEATHER_MOD`. 0–0.1. |

### DayCycle

| Knob | Notes |
|------|-------|
| ⭐ cycle length (minutes) | Total real-time minutes per dawn→night cycle. |
| phase force | Dropdown: auto / dawn / day / dusk / night. Freezes the cycle at that phase. |
| sun angle override | For skybox + shadow tuning. |

### SpatialContract

| Knob | Notes |
|------|-------|
| fog mode | FADE / CLAMP / DARKNESS / NONE — per-depth override. |
| fog start / end | World units. |
| fog tint | RGB picker. |
| wall height multiplier | 0.5 – 3.0 (exterior uses 0.5–3×, interior 2×, dungeon 1–1.2×). |
| ceiling mode | sky / solid / void. |

These already compile into frozen contract objects at floor-gen — expose a live-edit layer that the raycaster checks each frame. Gate behind a harness-only flag so production path doesn't pay the cost.

### Debug overlays

Toggle switches that route to existing debug paths:

- `LightOrbs.setDebug(true)` — per-frame reject counters
- Show z-buffer as a heatmap strip along the bottom of the canvas
- Draw a dot at every Lighting source in screen space (colour by kind)
- Draw the wash accumulator radius as a translucent ring
- Freeze flicker (`FLICKER_SMOOTH_TAU = 999`)
- Disable `ctx.globalCompositeOperation = 'lighter'` for the orb pass so the raw gradient shape is visible

## Preset system

Panel header has a dropdown populated from `data/lighting-presets.json`:

```json
{
  "boardwalk_sunset":  { "LightOrbs": { "ALPHA_BOOST": 2.1, "WASH_MAX_ALPHA": 0.18, ... }, "DayCycle": { "phase": "dusk" } },
  "cellar_low_vis":    { "LightOrbs": { "RENDER_DIST": 30, "ALPHA_BOOST": 3.0, ... } },
  "hero_wake_oppressive": { ... }
}
```

Panel actions:

- **Load** — applies the preset across all modules
- **Save** — prompts for a name, serialises current tunables into the dropdown's in-memory list (designer copies JSON out manually — we do not write to disk from the browser)
- **Copy JSON** — writes the current diff-vs-defaults to clipboard as a preset entry ready to paste into `lighting-presets.json`
- **Reset all** — restores every module's compile-time defaults

## Implementation order

1. **setTunables / getTunables** on LightOrbs, Lighting, WeatherSystem, DayCycle, SpatialContract. One PR per module so reviews stay small.
2. **Harness drawer scaffolding** — drawer HTML + CSS, collapse/expand, localStorage persistence.
3. **LightOrbs section** — exposes the highest-value knobs first so the hearth-wash work we just landed becomes tunable.
4. **Lighting + flicker split** — requires lifting hardcoded frequencies in `_flickerPulse`. Touches both `lighting.js` and `light-orbs.js` (which has its own flicker response curve).
5. **Weather + day cycle sections** — straightforward once #1 is done for those modules.
6. **Preset save/load** — last, after all knobs stabilise.
7. **Player-facing settings modal** — separate PR referencing the same setter APIs. Ship behind a feature flag until the post-Jam April 25th build.

## Out of scope

- Texture atlas swaps (different concern; goes in a separate `TEXTURE_HARNESS_SPEC.md`)
- Shader-level post-processing — we are not on a shader pipeline for Jam
- Per-tile lighting overrides — would require a level-editor, not a runtime panel

## Open questions for the team

1. Do we want the harness drawer to persist its knob values across reloads, or always reset to file defaults? Leaning toward **reset on reload** so designers don't ship accidental overrides by forgetting the drawer is open.
2. Should the preset system support per-floor-id presets (e.g. `"1.6"` auto-loads the home-hearth preset)? Nice feature but adds scope; defer to post-Jam.
3. Who owns `lighting-presets.json` — one person curates, or anyone can append? Suggest one curator, PR-reviewed.
4. webOS TV Magic Remote UX for the player-facing modal: D-pad navigation is fine for sliders if we snap to 10 steps per slider. Confirm with the TV QA pass.

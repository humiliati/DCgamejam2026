# Weather Module Roadmap

**Status:** Planning  
**Goal:** Replace the static terminus fog veil with a per-floor weather system that renders atmospheric overlays (haze, rain, wind, rolling debris) at configurable Z-depth in the 3D viewport, with a terminus distance that sprites and tiles punch through.

---

## Current State

The terminus fog veil is a one-trick gradient in `raycaster.js` lines 1979–2012:

- **Where it draws:** Only on exterior FADE floors, as a 5-stop vertical linear gradient centered on the horizon line.
- **Config:** `SpatialContract.exterior().terminusFog: { height: 0.15, opacity: 0.7 }` — 15% of screen height above+below horizon, peak 0.7 alpha at center.
- **Sprite interaction:** Two-pass sprite rendering splits at `NEAR_SPRITE_DIST = 2.0` tiles (hardcoded). Distant sprites (≥2 tiles) render before the veil and are masked. Close sprites (<2 tiles) render after the veil and punch through.
- **Parallax system:** `_renderParallax()` (raycaster.js lines 2048–2061) draws flat `fillRect` color bands — no sprite content, no horizontal scrolling.

### What we like and want to keep

1. The **NPC punch-through** at close range. When a sprite enters within the terminus distance it appears over the weather, creating strong depth perception.
2. The **per-floor contract** pattern. Weather should be a contract-level config, not a global toggle.
3. The **sandwich render order** (distant sprites → weather → close sprites). This is the core mechanism.

### What needs to change

1. The veil is **exterior-only and gradient-only**. Interior floors and dungeons should be able to have weather too (torch smoke drifting, dust motes, dripping water).
2. The `NEAR_SPRITE_DIST = 2.0` threshold is **hardcoded**. Different weather effects need different terminus distances (light haze = 3 tiles, heavy rain = 5 tiles, fog bank = 8 tiles).
3. The parallax renderer draws **color rectangles**. We need sprite-based parallax layers — rolling newspaper leaves, rain streaks, wind swooshes — that scroll horizontally and vertically with independent speeds.
4. Weather needs a **Z-layer above the HUD** option. Heavy rain should sometimes streak across the HUD chrome for immersion.

---

## Architecture: WeatherSystem module

**Layer:** 1.5 (after SpatialContract, before Raycaster)  
**Pattern:** IIFE, `var WeatherSystem = (function() { ... })();`  
**Dependencies:** SpatialContract (reads contract), SeededRNG (deterministic particle seeding)

### Data model: WeatherPreset

Each preset is a frozen config object stored on the spatial contract (or overridden at runtime for transitions). The contract carries `weather: 'clear'` by default; named presets expand to full configs at init.

```
WeatherPreset {
  name:             string        // 'clear', 'haze', 'light_rain', 'heavy_rain', 'wind', 'dust', 'fog_bank', 'torch_smoke'
  terminusDist:     number        // tiles — sprites closer than this punch through all weather layers
  
  // ── Veil layer (replaces current terminus fog veil) ──
  veil: {
    enabled:        boolean
    height:         number        // fraction of screen (0.15 = 15% above+below horizon)
    opacity:        number        // peak alpha (0 disables)
    color:          {r,g,b}|null  // null = inherit from contract fogColor
    pulse:          number        // sine amplitude on opacity (0 = static, 0.1 = gentle throb)
    pulseSpeed:     number        // radians per second
  }
  
  // ── Parallax sprite layers (bottom-half debris, top-half wind) ──
  layers: [
    {
      zone:         'lower'|'upper'|'full'   // vertical region of viewport
      zoneHeight:   number                   // fraction of half-screen (0.5 = bottom quarter)
      sprites:      [spriteConfig]           // pool of sprite defs to randomly emit
      density:      number                   // particles per second per screen-width
      scrollX:      number                   // px/sec horizontal drift (negative = leftward)
      scrollY:      number                   // px/sec vertical drift (positive = downward)
      parallaxDepth: number                  // 0–1 how much player rotation affects offset
      opacity:       number                  // base layer alpha
      aboveHUD:      boolean                 // true = render after HUD pass
    }
  ]
  
  // ── Full-screen overlay (ScreenFX-style) ──
  overlay: {
    enabled:        boolean
    type:           'vignette'|'tint'|'none'
    color:          string        // CSS color
    intensity:      number        // 0–1
    aboveHUD:       boolean
  }
}
```

### Sprite config (per parallax particle)

```
spriteConfig {
  type:       'sheet'|'procedural'   // sprite sheet frame or canvas-drawn shape
  sheet:      string|null            // sprite sheet ID (for 'sheet' type)
  frameCount: number                 // animation frames
  frameRate:  number                 // fps
  width:      number                 // screen px at distance=1
  height:     number
  rotation:   { min, max }          // random rotation range (radians)
  tumble:     number                 // rotation speed (rad/sec, 0 = no tumble)
  color:      string|null           // tint or fill (for 'procedural' type)
  opacity:    { min, max }          // random opacity range
  scale:      { min, max }          // random scale range
}
```

### Procedural sprite types (no sprite sheets needed)

For the initial implementation, all weather particles are procedural canvas draws — no PNG assets required:

| Name | Draw method | Use |
|------|------------|-----|
| `newspaper` | Rounded rect + 2 horizontal lines (text) | Rolling debris on windy streets |
| `leaf` | Bezier teardrop, tumbling rotation | Autumn/park floors |
| `raindrop` | 2px × 8px line at 75° angle | Rain streaks |
| `splash` | 3-frame expanding circle ring | Rain hitting ground plane |
| `dust_mote` | 1–2px filled circle, low opacity | Interior dust |
| `wind_streak` | 1px × 20–40px horizontal line, fading alpha | Wind across upper screen |
| `smoke_wisp` | Bezier S-curve, expanding width, fading | Torch/chimney smoke |
| `drip` | 1px × 3px vertical line | Dungeon ceiling drip |

---

## Render Order (the sandwich, expanded)

Current:
```
1. Skybox
2. Parallax color bands
3. Wall columns (with per-column fog)
4. Floor/ceiling strips
5. Distant sprites (≥ NEAR_SPRITE_DIST)
6. Terminus fog veil          ← single gradient
7. Close sprites (< NEAR_SPRITE_DIST)
8. Particles (combat FX)
9. Blit to main canvas
10. HUD / Minimap / Menus
```

New:
```
1.  Skybox
2.  Parallax color bands (unchanged)
3.  Wall columns (with per-column fog)
4.  Floor/ceiling strips
5.  Distant sprites (≥ terminusDist)
6.  WEATHER: veil layer         ← gradient (replaces old terminus veil)
7.  WEATHER: lower parallax     ← rolling debris sprites (bottom half)
8.  WEATHER: upper parallax     ← wind streaks (top half)
9.  Close sprites (< terminusDist)
10. Particles (combat FX)
11. Blit to main canvas
12. HUD / Minimap / Menus
13. WEATHER: aboveHUD layers    ← heavy rain streaks over chrome
14. WEATHER: aboveHUD overlay   ← vignette/tint over everything
```

Steps 6–8 are the "weather sandwich filling" that sprites punch through at `terminusDist`. Steps 13–14 are a separate pass on the main canvas after HUD, for immersion in extreme weather.

---

## Implementation Phases

### Phase 0 — Extract and parameterize the veil (small, safe)

**Files:** `raycaster.js`, `spatial-contract.js`  
**Lines saved from raycaster:** 0 (refactor, not extraction)  
**Risk:** Low — behavior-preserving refactor

1. Replace hardcoded `NEAR_SPRITE_DIST = 2.0` with `contract.terminusDist || 2.0` so the sprite punch-through distance becomes per-floor configurable.
2. Move the veil gradient draw (lines 1990–2011) into a named function `_renderWeatherVeil(ctx, contract, w, h, halfH, fogColor)` — still in raycaster.js but callable independently.
3. Add `terminusDist` field to all three SpatialContract constructors (default: exterior 2.0, interior 1.5, dungeon 1.0).
4. Add `weather: 'clear'` field to all three constructors. Clear = current behavior (veil on exterior, nothing on interior/dungeon).

**Deliverable:** Same visual behavior, but the terminus distance is now per-floor and the veil is an isolated function ready to be replaced.

### Phase 1 — WeatherSystem module (core)

**New file:** `engine/weather-system.js` (Layer 1.5)  
**Dependencies:** SpatialContract, SeededRNG  
**Estimated size:** ~250 lines

1. Create IIFE module with preset registry.
2. Port EyesOnly `ParticleEmitter` pattern: pool-based particle array, per-particle velocity/gravity/friction/fade, configurable max count (300 default).
3. `WeatherSystem.setPreset(presetName)` — called by FloorManager on floor change. Crossfades from current to new preset over 500ms.
4. `WeatherSystem.tick(dt)` — update all active particle positions, spawn new particles per density config, cull dead particles.
5. `WeatherSystem.renderBelow(ctx, w, h, halfH, fogColor)` — draw veil + lower/upper parallax layers (steps 6–8 in render order). Called by raycaster between distant and close sprite passes.
6. `WeatherSystem.renderAbove(ctx, W, H)` — draw aboveHUD layers + overlay (steps 13–14). Called by game loop after HUD render.
7. `WeatherSystem.getTerminusDist()` — returns current preset's terminus distance for the raycaster to use as sprite split threshold.

**Integration points in raycaster.js:**
- Replace `NEAR_SPRITE_DIST = 2.0` with `WeatherSystem.getTerminusDist()`
- Replace veil gradient block with `WeatherSystem.renderBelow(ctx, ...)`
- After main canvas blit + HUD: `WeatherSystem.renderAbove(mainCtx, W, H)`

### Phase 2 — Procedural sprite renderers

**New file:** `engine/weather-sprites.js` (Layer 1, before WeatherSystem)  
**Estimated size:** ~180 lines

Canvas-draw functions for each procedural particle type. Each returns an offscreen canvas (cached after first draw) so the particle renderer blits pre-drawn sprites rather than issuing draw calls per particle per frame.

1. `WeatherSprites.newspaper(w, h, color)` → cached canvas
2. `WeatherSprites.leaf(w, h, color)` → cached canvas
3. `WeatherSprites.raindrop(w, h, color)` → cached canvas
4. `WeatherSprites.windStreak(w, h, color)` → cached canvas
5. `WeatherSprites.smokeWisp(w, h, color, frame)` → cached canvas (multi-frame)
6. `WeatherSprites.dustMote(r, color)` → cached canvas
7. `WeatherSprites.drip(w, h, color)` → cached canvas

Each function draws once and caches. The particle renderer calls `ctx.drawImage(cachedCanvas, ...)` with rotation/scale transforms per particle.

### Phase 3 — Weather presets for existing floors

Define the named presets and wire them into floor contracts:

| Floor | Preset | Description |
|-------|--------|-------------|
| "0" The Approach | `clear` | Tutorial — no weather distractions |
| "1" The Promenade | `boardwalk_wind` | Rolling newspaper leaves (lower), subtle wind streaks (upper). terminusDist: 3.0 |
| "2" Lantern Row | `lantern_haze` | Warm amber haze veil, occasional smoke wisps rising from street level. terminusDist: 2.5 |
| "1.1" Coral Bazaar | `indoor_dust` | Faint dust motes drifting. terminusDist: 1.5 |
| "1.2" Driftwood Inn | `hearth_smoke` | Wisps of smoke from bonfire, warm orange tint overlay. terminusDist: 1.5 |
| "1.3.1" Soft Cellar | `cellar_drip` | Occasional water drips from ceiling plane. terminusDist: 1.0 |
| "2.2.1" Hero's Wake B1 | `dungeon_dust` | Disturbed dust (hero just came through). terminusDist: 1.5 |

### Phase 4 — Rain and heavy weather

Adds the full rain system (the big ask):

1. `light_rain` preset — sparse raindrops at 75° angle, low-opacity veil, occasional splashes. terminusDist: 4.0.
2. `heavy_rain` preset — dense rain streaks, high-opacity veil, `aboveHUD: true` rain layer that streaks over the HUD chrome. Wind-driven horizontal offset. terminusDist: 5.0.
3. `storm` preset — heavy rain + periodic lightning flash (ScreenFX flash adapted from EyesOnly). Veil pulses with thunder timing.
4. Rain density modulated by `SpatialContract.ceilingType` — SKY floors get full rain, interior doors suppress it, VOID ceilings drip instead.

### Phase 5 — Dynamic weather transitions

1. `WeatherSystem.transition(targetPreset, durationMs)` — lerps all numeric weather params (veil opacity, density, scrollX, terminusDist) over time.
2. Floor transitions auto-crossfade weather: entering a building fades rain → indoor_dust over 800ms.
3. Time-of-day hook (future): weather shifts with game time cycle if/when day-night is implemented.
4. Event-triggered weather: quest state changes (e.g., hero rampage aftermath) can push temporary weather overrides that decay.

---

## Raycaster Integration Detail

The key change in `raycaster.js render()` is minimal. The existing sandwich structure already has the slots:

```javascript
// ── Current (lines 1963-2020) ──
var NEAR_SPRITE_DIST = 2.0;
// distant sprites...
// terminus fog veil...
// near sprites...

// ── Becomes ──
var terminusDist = (typeof WeatherSystem !== 'undefined')
  ? WeatherSystem.getTerminusDist()
  : (_contract && _contract.terminusDist) || 2.0;

// Distant sprite pass (≥ terminusDist)
if (sprites && sprites.length > 0) {
  _renderSprites(ctx, ..., terminusDist, null);
}

// Weather below-HUD layers (veil + parallax debris)
if (typeof WeatherSystem !== 'undefined') {
  WeatherSystem.renderBelow(ctx, w, h, halfH, fogColor);
} else if (_contract && _contract.fogModel === 'fade' && _contract.terminusFog) {
  _renderWeatherVeil(ctx, _contract, w, h, halfH, fogColor); // Phase 0 fallback
}

// Near sprite pass (< terminusDist)
if (sprites && sprites.length > 0) {
  _renderSprites(ctx, ..., 0, terminusDist);
}
```

The `typeof` guard means the weather module is entirely optional — if not loaded, the Phase 0 fallback veil still works.

---

## Performance Budget

Target: **< 1ms per frame** on a webOS TV (ARM SoC, ~2015-era GPU).

| Component | Budget | Strategy |
|-----------|--------|----------|
| Particle update | 0.2ms | Pool array, no allocation per frame. Max 300 particles. |
| Veil gradient | 0.1ms | Single `createLinearGradient` + `fillRect` (same as current) |
| Parallax sprites | 0.5ms | Pre-cached offscreen canvases. `drawImage` with transform per particle. Hybrid: nearest 50 particles rendered as sprites, rest as 1px dots. |
| Above-HUD layer | 0.2ms | Sparse — max 30 rain streaks over HUD. Simple `fillRect` lines. |

If frame budget is exceeded, WeatherSystem auto-reduces density by halving spawn rate until `tick()` completes within budget. The quality floor is "veil only" (same as current behavior).

---

## File Manifest

| File | Layer | Purpose | Phase |
|------|-------|---------|-------|
| `engine/weather-sprites.js` | 1 | Procedural sprite cache | 2 |
| `engine/weather-system.js` | 1.5 | Core weather orchestrator | 1 |
| `engine/spatial-contract.js` | 1 | Add `terminusDist`, `weather` fields | 0 |
| `engine/raycaster.js` | 2 | Replace veil block, use terminusDist | 0–1 |
| `data/weather-presets.json` | 5 | Named preset definitions | 3 |

---

## Open Questions

1. **Magic Remote cursor interaction**: On webOS, the Magic Remote cursor floats above everything. Should `aboveHUD` weather layers dodge the cursor region, or is it fine for rain to streak across it?
2. **Minimap weather**: Should the minimap show a weather indicator icon (raindrop, wind, sun) in the corner? Low priority but nice context.
3. **Audio integration**: Weather presets should eventually carry ambient audio cues (rain loop, wind whistle). This roadmap covers visuals only — audio hooks are a follow-up.
4. **Transition during movement**: If the player walks through a DOOR mid-weather-transition, should the crossfade reset or continue? Current `FloorTransition` fade-to-black would mask it naturally.

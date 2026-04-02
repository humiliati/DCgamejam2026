# Skybox Roadmap v2 — Day/Night Cycle, Celestial Bodies, Ocean, and Time Widget

> **v1:** Pre-jam engine work (March 2026). Per-biome parallax sky with clouds, mountains, water, ocean portholes.
> **v2:** Post-jam polish roadmap (March 31 2026). Day/night-aware sky cycling, celestial body traversal, star parallax, HUD time widget, Floor 3 ocean integration.
> **Status:** v1 fully implemented. v2 phases below.

---

## What Shipped (v1) — All Complete

Everything from the original roadmap is live and integrated:

- Per-biome sky gradient with parallax scrolling (8 presets)
- Procedural 1D noise cloud bands (1–4 layers per preset)
- Mountain silhouette generation (alpine + title presets, shaped zones)
- Star field with deterministic placement and subtle twinkle
- Water reflection with ripple distortion (title screen)
- Ocean preset with sea creature silhouettes (whale/jellyfish bands)
- Animated sealab porthole textures (wall + ceiling, per-frame compositing)
- Title screen cinematic lake scene (Skybox.renderFull)
- SpatialContract `skyPreset` field per biome
- Raycaster integration (exterior floors call Skybox.render)
- DayCycle module (phase-based time, atmosphere tint, sun intensity)
- Raycaster reads DayCycle tint to multiply fog color on exteriors

---

## What's Missing (v2 Scope)

### The gap

DayCycle tracks in-game time and provides atmosphere tint multipliers, but the skybox itself is static — each preset has fixed zenith/horizon colors and a fixed star flag. A `harbor` sky is always navy-black with stars; `cedar` is always morning blue. The sky doesn't change as the day progresses. DayCycle tints the fog and wall brightness, but the actual sky gradient, cloud opacity, star visibility, and celestial body positions don't respond to time.

The player has no visual indicator of time-of-day other than subtle fog tinting. There's no sun, moon, or constellation system. No clock widget.

### The target

Standing on the Promenade at dawn: the sky is pink-orange at the horizon, warming to gold. A sun disc sits just above the horizon line, climbing slowly. Clouds catch the golden light. No stars visible.

Same spot at midnight: deep indigo gradient. Dense star field with layered parallax (near stars drift faster than distant ones). A moon disc at ~60° elevation, casting a subtle blue-white glow halo. The Promenade's sodium lamps are the only warm color. The player's HUD shows a small clock icon with the current phase.

Entering Floor 3 (Frontier Gate): the exterior sky shows open ocean to the south. The lower third of the sky gradient transitions into a water horizon band. Cloud reflections shimmer below the horizon line. The ocean preset's creature silhouettes are visible at extreme distance, establishing that the deep ocean from sealab portholes is the same body of water.

---

## Phase 1 — Sky Color Cycling (1.5h)

Make each skybox preset respond to DayCycle phase. Instead of a single fixed `zenith`/`horizon`, each preset defines per-phase color palettes and the renderer interpolates between them.

### 1a. Per-phase color tables

Each preset gains a `phases` object:

```javascript
cedar: {
  phases: {
    dawn:      { zenith: { r: 60, g: 45, b: 70 },  horizon: { r: 180, g: 120, b: 80 } },
    morning:   { zenith: { r: 42, g: 58, b: 90 },  horizon: { r: 90, g: 104, b: 120 } },
    afternoon: { zenith: { r: 50, g: 65, b: 100 },  horizon: { r: 110, g: 95, b: 75 } },
    dusk:      { zenith: { r: 35, g: 25, b: 55 },  horizon: { r: 140, g: 70, b: 40 } },
    night:     { zenith: { r: 8, g: 12, b: 25 },   horizon: { r: 15, g: 20, b: 35 } }
  },
  // Existing: clouds, mountains, water, stars
}
```

The current flat `zenith`/`horizon` becomes the fallback (treated as `morning` phase) for backward compatibility.

### 1b. Phase interpolation in render()

```javascript
function _getPhaseColors(preset) {
  if (!preset.phases) return { zenith: preset.zenith, horizon: preset.horizon };
  var phase = DayCycle.getPhase();
  var nextPhase = DayCycle.getNextPhase();
  var progress = DayCycle.getPhaseProgress(); // 0–1 within current phase
  var a = preset.phases[phase] || preset.phases.morning;
  var b = preset.phases[nextPhase] || a;
  return {
    zenith:  _lerpColor(a.zenith, b.zenith, progress),
    horizon: _lerpColor(a.horizon, b.horizon, progress)
  };
}
```

DayCycle needs two new helpers: `getNextPhase()` and `getPhaseProgress()` (0–1 fraction through current phase based on hour).

### 1c. Star visibility by phase

Stars fade in during dusk (alpha ramp 0→1 over dusk hours) and fade out during dawn. Replace the boolean `stars: true` with a computed alpha:

```javascript
var starAlpha = 0;
if (phase === 'night') starAlpha = 1;
else if (phase === 'dusk') starAlpha = phaseProgress;
else if (phase === 'dawn') starAlpha = 1 - phaseProgress;
```

All exterior presets show stars at night, not just harbor and dockyard.

### 1d. Cloud color shift

Cloud band colors tint toward the current atmosphere tint. Dawn clouds catch pink/orange; night clouds are near-invisible dark blue. Multiply cloud RGB by `DayCycle.getAtmosphereTint()`.

---

## Phase 2 — Celestial Bodies (2h)

Sun and moon as rendered disc sprites in the sky gradient. They move along a sinusoidal arc (rise at horizon → peak at zenith → set at horizon) based on DayCycle hour.

### 2a. Sun disc

- Visible during dawn, morning, afternoon, dusk phases
- Position: `elevation = sin(π * (hour - 6) / 12)` for 06:00–18:00
  - 06:00 (dawn): elevation = 0 (horizon)
  - 12:00 (noon): elevation = 1 (zenith)
  - 18:00 (dusk): elevation = 0 (horizon again)
- Horizontal position: `azimuth = (hour - 6) / 12` mapped to screen x
  - Rises in the east (left of screen facing south), sets in the west
  - Player-angle-relative: `screenX = azimuth * w - angle * w / (2π)`
- Radius: 12–18px (scales with elevation — larger at horizon for atmospheric lensing)
- Color: warm gradient disc (core white → edge orange)
- Glow halo: soft radial gradient, 3× disc radius, low opacity
- Horizon refraction: when elevation < 0.15, disc is oval (squished vertically) and reddened

### 2b. Moon disc

- Visible during dusk, night, dawn phases
- Same sinusoidal arc but offset 12 hours from sun: `elevation = sin(π * (hour - 18) / 12)` for 18:00–06:00
- Radius: 8–12px (slightly smaller than sun)
- Color: cool blue-white core → pale edge
- Glow halo: subtle blue-white, 2× disc radius
- Moon phase: cosmetic detail — optional crescent mask based on in-game day number
- Surface detail: 2–3 dark circle "craters" at fixed offsets within disc

### 2c. Celestial rendering order

Render celestial bodies after sky gradient but before cloud bands. Clouds partially occlude low-elevation celestial bodies (natural effect — sun/moon peek through cloud gaps).

```
1. Sky gradient (Phase 1)
2. Star field (Phase 1)
3. Sun / Moon disc + glow (Phase 2)
4. Cloud bands (existing)
5. Mountain silhouette (existing)
```

### 2d. Horizon glow

When the sun is near the horizon (elevation < 0.2), a wide diffuse glow band appears at the horizon:
- Dawn: warm orange-pink gradient, 20% of sky height
- Dusk: deep orange-red gradient, 15% of sky height
- Intensity = `(0.2 - elevation) / 0.2`

---

## Phase 3 — Advanced Star Parallax (1.5h)

Replace the current flat star field with a multi-layer parallax star system. Distant stars barely move; near stars drift noticeably with player rotation.

### 3a. Star layers

| Layer | Count | Size | Brightness | Depth | Twinkle |
|-------|-------|------|------------|-------|---------|
| Deep field | 200 | 1px | 0.3–0.5 | 0.02 | Slow, subtle |
| Mid field | 80 | 1–2px | 0.5–0.7 | 0.08 | Medium |
| Near field | 30 | 2–3px | 0.7–1.0 | 0.15 | Fast, pronounced |

Each layer scrolls at `angle * w * depth`, creating rotational parallax. The deep field barely moves; the near field shifts noticeably.

### 3b. Star color

Not all white. Distribute star colors:
- 70% white/blue-white (hot stars)
- 15% pale yellow (sun-type)
- 10% orange (cool giants)
- 5% blue (hot dwarfs)

Color is deterministic per star index: `color = STAR_COLORS[_hash1D(i * 31) * 4 | 0]`

### 3c. Constellation patterns (post-jam cosmetic)

Optional: define 3–4 named constellation patterns as coordinate arrays. When the player faces specific angles, constellation lines connect certain stars with faint lines. Pure cosmetic — could tie to narrative (dragon constellations that hint at the conspiracy).

### 3d. Shooting stars

Random event: every ~30 seconds of night time, a single bright line streaks across the sky over 0.5 seconds. Deterministic timing based on `_time` modulo. Low priority but high visual impact.

---

## Phase 4 — HUD Time Widget (1h)

A small, always-visible time indicator so the player knows the phase without guessing from sky color.

### 4a. Widget design

Position: top-left corner, 48×48px area. Minimal, non-intrusive.

Elements:
- **Phase icon**: emoji or small symbol
  - Dawn: 🌅
  - Morning: ☀️
  - Afternoon: 🌤️
  - Dusk: 🌇
  - Night: 🌙
- **Hour display**: "14:00" in small monospace text below icon
- **Day counter**: "Day 3" in dim text

### 4b. Rendering

Canvas-rendered in HUD layer (after game canvas, same z-layer as status bar). Reads `DayCycle.getHour()`, `DayCycle.getPhase()`, `DayCycle.getDay()`.

Pulse animation on phase change: icon briefly scales up 1.2× and glows for 0.5s when phase transitions (dawn→morning, etc).

### 4c. Integration

Add to `hud.js` render pass. Read from DayCycle module. No new module needed — the HUD already renders per-frame.

```javascript
// In HUD.render():
if (typeof DayCycle !== 'undefined') {
  _renderTimeWidget(ctx, vpW, vpH);
}
```

---

## Phase 5 — Floor 3 Ocean Sky (1.5h)

Floor 3 (Frontier Gate) is the exterior frontier at the edge of town, facing the open ocean. Its sky preset needs a water horizon that connects the surface world to the sealab depths.

### 5a. New preset: `frontier`

```javascript
frontier: {
  phases: {
    dawn:    { zenith: { r: 55, g: 40, b: 65 }, horizon: { r: 160, g: 100, b: 70 } },
    morning: { zenith: { r: 40, g: 55, b: 85 }, horizon: { r: 80, g: 95, b: 110 } },
    // ... full day cycle
    night:   { zenith: { r: 5, g: 10, b: 22 },  horizon: { r: 10, g: 18, b: 32 } }
  },
  clouds: [
    // Maritime clouds — low, gray, sea spray feel
    { y: 0.40, h: 0.15, depth: 0.45, speed: 0.0004, ... }
  ],
  mountains: null,
  water: true,          // ENABLE water reflection in bottom portion
  waterHorizon: 0.65,   // Water starts at 65% of sky height (low horizon)
  stars: true,           // Computed alpha from phase
  oceanHint: true        // Show distant ocean creature silhouettes near horizon
}
```

### 5b. Water horizon rendering

Unlike the title screen (full reflection below midline), the frontier sky renders water as a narrow band at the bottom of the sky region (below the cloud line but above where walls start):

```javascript
if (preset.water && preset.waterHorizon) {
  var waterY = Math.floor(h * preset.waterHorizon);
  _renderWaterBand(ctx, w, waterY, h, angle, preset);
}
```

The water band:
- Dark blue-green gradient (matches ocean preset palette)
- Subtle horizontal ripple (sine offset per scanline, slower than title screen)
- Distant wave crests as bright pixel dots near the horizon line
- At night: bioluminescent hints (very faint cyan specks)
- Whale shadows occasionally visible at extreme distance (reuse ocean cloud band at very low opacity)

### 5c. Ocean connectivity

The visual link between Floor 3's water horizon and the sealab porthole ocean view reinforces the world coherence. Same creature types (whales, jellyfish) visible in both, but from different perspectives — surface vs. submerged.

---

## Phase 6 — Weather System (2h, post-jam)

Overlays that modify the sky state beyond time-of-day.

### 6a. Rain

- Additional cloud layers at high opacity (overcast)
- Rain particle overlay: vertical lines falling at slight angle
- Muffled ambient sound (AudioSystem integration)
- Reduced sun intensity (DayCycle modifier)
- Wet ground reflections (future raycaster floor enhancement)

### 6b. Fog

- Increased fog density (SpatialContract modifier)
- Cloud bands descend to horizon level
- Reduced render distance
- Muffled sounds

### 6c. Storm

- Dark overcast + rain
- Lightning flash: full-screen white flash (100ms) at random intervals
- Thunder sound delayed by distance
- Screen shake via CinematicCamera

### 6d. Clear night

- Maximum star visibility
- Enhanced moon glow
- Reduced fog distance
- Cricket ambient

---

## Phase 7 — Visual Polish (1h, additive)

### 7a. God rays / crepuscular beams

During dawn and dusk, when sun elevation is 0.05–0.15, render 3–5 angled bright lines emanating from the sun disc downward through the cloud layer. Simple: bright triangles with low alpha (0.08) drawn after clouds.

### 7b. Sun/moon reflection on water

When Floor 3's water horizon is visible and the sun/moon is near the horizon, render a vertical bright streak on the water surface below the celestial body. Shimmer via horizontal sine offset.

### 7c. Aurora (special event)

Rare night event (hero day nights): green/purple wavy bands across the upper sky. Procedural sine waves with color cycling. Ties to narrative — dragon energy visible in the sky.

### 7d. Skybox PostProcess integration

PostProcess module can apply a warm grade during dusk and a cool grade at night, matching the sky state. Wire `PostProcess.setColorGrade()` to DayCycle phase changes:

```javascript
DayCycle.setOnPhaseChange(function(phase) {
  var grades = {
    dawn:      { r: 255, g: 180, b: 140, a: 0.04 },
    morning:   null,
    afternoon: { r: 255, g: 220, b: 160, a: 0.03 },
    dusk:      { r: 200, g: 100, b: 60, a: 0.06 },
    night:     { r: 60, g: 80, b: 140, a: 0.05 }
  };
  PostProcess.setColorGrade(grades[phase] || null);
});
```

---

## Dependency Graph

```
Phase 1 (Sky color cycling)
  ├── DayCycle.getNextPhase() + getPhaseProgress() helpers
  └── All preset phase tables
        │
        ├── Phase 2 (Celestial bodies)
        │     ├── Sun disc + horizon glow
        │     └── Moon disc + phase
        │
        ├── Phase 3 (Star parallax)
        │     └── Multi-layer depth + star color
        │
        └── Phase 4 (Time widget)
              └── HUD integration

Phase 5 (Floor 3 ocean sky)
  └── Requires Phase 1 (day/night colors) + new frontier preset

Phase 6 (Weather) — Post-jam, independent
Phase 7 (Polish) — Post-jam, requires Phases 1–5
```

**Jam-adjacent scope:** Phases 1–4 (~6h). Phase 5 after Floor 3 blockout.
**Post-jam:** Phases 6–7 (~3h).

---

## DayCycle API Additions Required

| Method | Returns | Purpose |
|--------|---------|---------|
| `getNextPhase()` | string | Phase that follows current (dawn→morning→...) |
| `getPhaseProgress()` | 0–1 | Fraction through current phase |
| `getHour()` | number | Current hour (0–23.99) |
| `getDay()` | number | Current day count |
| `getPhase()` | string | Current phase name |

Most of these likely already exist or are trivial to add from the existing `_hour` and `_phase` state.

---

## Files to Modify

| File | Change | Phase |
|------|--------|-------|
| `engine/skybox.js` | Phase tables, color interpolation, celestial body rendering, star layers | 1, 2, 3, 5 |
| `engine/day-cycle.js` | `getNextPhase()`, `getPhaseProgress()` helpers | 1 |
| `engine/hud.js` | Time widget rendering | 4 |
| `engine/spatial-contract.js` | Frontier preset definition | 5 |
| `engine/floor-manager.js` | Floor 3 biome → frontier preset mapping | 5 |
| `engine/post-process.js` | DayCycle-aware color grade wiring | 7d |

---

## Integration with Other Roadmaps

### Phase 1 (Sky color cycling) ↔ LIGHT_AND_TORCH_ROADMAP Phase 2e

DayCycle phase drives building entrance light visibility. Phase 2e of the
torch roadmap registers exterior DOOR tiles as steady light sources (radius 3,
intensity 0.6). These should scale with DayCycle phase — full intensity at
night, near-zero during daytime when ambient sunlight overwhelms them. Sky
color cycling (Phase 1 here) must ship first so phase-aware light registration
works.

### Phase 5 (Floor 3 ocean) ↔ TEXTURE_ROADMAP

Floor 3 blockout needs BOTH the `frontier` sky preset (defined here in Phase 5)
AND frontier-biome wall/floor textures in TextureAtlas. The sky provides the
upper half; textures provide the ground. Suggested frontier textures (to be
added to TextureAtlas inventory):

- `wall_weathered` — salt-worn stone or timber, maritime atmosphere
- `floor_planks_wet` — dock planking with moisture
- `door_heavy` — reinforced gate/portcullis style

Neither skybox nor textures alone complete Floor 3. Both are prerequisites.

### Phase 5 (Floor 3 ocean) ↔ NLAYER_RAYCASTER_ROADMAP Phase 7

Floor 3 exterior benefits from N-layer see-over tiles — low harbor walls
and fences the player looks over toward the ocean horizon. NLAYER Phase 7
(expanded exterior maps) describes the same technique for larger floor layouts.
Floor 3 can share the shrub/fence tile system from NLAYER Phase 3 for
harbor-side wayfinding.

### Phase 6-7 (Weather + Polish) ↔ LIGHT_AND_TORCH_ROADMAP Phase 4d

Phase 4d of the torch roadmap describes day/night cycle interaction where
exterior ambient brightness replaces the lightmap and building lights only
show at night. Phase 6 here (weather) adds overcast/rain/fog that modify
the same ambient brightness. These are complementary — weather modifies the
base DayCycle atmosphere that building lights already respond to.

### CinematicCamera integration

Morning monologue (MonologuePeek.play('morning_recap')) should trigger
during dawn phase. Wire: `DayCycle.setOnPhaseChange(function(p) { if (p === 'dawn') MonologuePeek.play('morning_recap', { cameraPreset: 'morning_recap' }); })`.

### PostProcess integration

Phase 7d explicitly wires PostProcess color grading to DayCycle phase
transitions for atmosphere consistency between sky and world rendering.
LIGHT_AND_TORCH Phase 4d (day/night interaction) is thematically aligned
but operates on the lightmap, not PostProcess — they're independent systems
that both respond to DayCycle phase.

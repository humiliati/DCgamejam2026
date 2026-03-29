# Skybox Roadmap — Parallax Sky, Clouds, and Water Reflections

> Pre-jam engine work. The skybox replaces the current flat gradient +
> band-based parallax system with a layered atmospheric renderer that
> gives each biome a distinct sky identity and provides the dramatic
> title screen backdrop.

---

## Current State

The raycaster's background is two linear gradients (ceiling half and
floor half) with optional parallax bands drawn as solid-color horizontal
strips. SpatialContract defines `ceilColor`, `floorColor`, and a
`parallax` array of `{ depth, color, height }` objects.

This works for dungeon interiors (VOID/SOLID ceilings) but exterior
streets look flat. All 6 streets share the same visual grammar for
"sky" — a gradient and some colored bands. The Biome Plan calls for
each street to be identifiable within 3 seconds; sky is one of the
strongest distance signals and it's currently wasted.

---

## Target: Per-Biome Skybox with Parallax Layers

### What the Player Sees (Exteriors)

Standing on Cedar Street, looking east: the upper half of the
viewport shows a cool blue-gray sky with thin layered clouds drifting
slowly left. Near the horizon, a distant treeline silhouette. Below
the horizon, the floor gradient.

Standing on Waterfront Avenue, looking south: deep navy sky, almost
black. No clouds — just a faint star field. Near the horizon, a wide
dark band of water with distant boat lights as bright pixel dots.
Industrial fog creeps upward from the horizon.

Standing on North 3rd, looking north: alpine twilight. The sky
grades from deep indigo at zenith to cold orange at the horizon.
Selkirk mountain ridgeline as a jagged silhouette. Clouds are thick
and low, layered in slate gray.

Each biome's sky is a stack of parallax layers that scroll with the
player's facing angle, creating rotational parallax — the sky feels
like it extends around you in all directions, not just a flat backdrop.

### What the Player Sees (Title Screen)

Lake Pend Oreille at twilight. The full viewport is a skybox scene
with no dungeon geometry. The upper half: gradient sky with cloud
layers drifting. The lower half: water surface reflecting the sky
(vertically flipped + ripple distortion). Mountains at the horizon.
The menu box floats in the center of this scene.

The sky slowly animates: clouds drift, colors cycle gently (simulating
the last 20 minutes of sunset in a loop). This creates the "Square
Enix title screen stare" — the player wants to just watch for a
moment before pressing start.

---

## New Module: Skybox

```
engine/skybox.js  (Layer 2, before Raycaster — Raycaster calls Skybox)
```

IIFE module. Renders a multi-layer parallax sky scene to the canvas.
Called by the raycaster for exterior floors and by the title screen
background renderer.

### Layer Stack

Each skybox preset is a stack of layers rendered back-to-front:

```
Layer 0: SKY GRADIENT           ← always present
         Vertical gradient fill, zenith color → horizon color

Layer 1: STAR FIELD             ← optional (night biomes)
         Sparse random dots, very subtle twinkle

Layer 2: CLOUD BAND (far)       ← optional
         Wide horizontal band of color, slow parallax scroll
         Represents high-altitude clouds or atmospheric haze

Layer 3: CLOUD BAND (mid)       ← optional
         Narrower band, faster parallax than Layer 2
         More defined cloud shapes (procedural edge noise)

Layer 4: MOUNTAIN SILHOUETTE    ← optional
         Jagged horizontal profile near horizon line
         Darkest layer — reads as solid terrain cutout

Layer 5: CLOUD BAND (low)       ← optional
         Below mountain line — fog/mist that overlaps terrain
         Fastest parallax (closest to camera)

Layer 6: HORIZON LINE           ← always present
         Sharp or soft edge between sky and ground
         Color matches the biome's floor gradient top

Layer 7: WATER REFLECTION       ← optional (harbor, lake biomes)
         Vertically flipped sky layers rendered below horizon
         Ripple distortion: horizontal sine wave offset per scanline
         Alpha fade — reflections dim toward the bottom
```

### Parallax Scrolling

Each layer scrolls horizontally based on the player's facing angle:

```javascript
var scrollX = (playerAngle / (2 * Math.PI)) * layer.scrollWidth * layer.depth;
```

`depth` controls parallax intensity: 1.0 = moves 1:1 with camera
(foreground), 0.1 = barely moves (deep background). Mountains at 0.95,
far clouds at 0.3, star field at 0.05.

The scroll wraps seamlessly. Each layer's visual pattern tiles
horizontally (procedural generation ensures left edge matches right).

### Cloud Generation

Clouds are NOT sprites or images. They're procedurally rendered
horizontal noise bands:

```javascript
function _renderCloudBand(ctx, w, bandY, bandH, scrollX, params) {
  for (var x = 0; x < w; x++) {
    var worldX = (x + scrollX) / params.scale;
    // Layered noise: large shapes + small detail
    var n1 = _noise1D(worldX * 0.3 + params.seed) * 0.6;
    var n2 = _noise1D(worldX * 1.2 + params.seed + 100) * 0.3;
    var n3 = _noise1D(worldX * 3.0 + params.seed + 200) * 0.1;
    var density = n1 + n2 + n3;

    if (density > params.threshold) {
      var alpha = (density - params.threshold) / (1 - params.threshold);
      alpha *= params.opacity;
      var cy = bandY + bandH * 0.5;
      var cloudH = bandH * alpha * 0.8;
      ctx.fillStyle = 'rgba(' + params.r + ',' + params.g + ',' + params.b + ',' + (alpha * 0.6) + ')';
      ctx.fillRect(x, cy - cloudH / 2, 1, cloudH);
    }
  }
}
```

This renders per-column (same as the raycaster), so it integrates
naturally into the column-based render pipeline without any
architecture mismatch.

### Mountain Silhouette Generation

A 1D noise function generates the ridgeline profile. The profile is
the same for a given biome seed — deterministic but organic:

```javascript
function _renderMountains(ctx, w, horizonY, scrollX, params) {
  ctx.fillStyle = params.color;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (var x = 0; x <= w; x++) {
    var worldX = (x + scrollX * params.depth) / params.scale;
    var h = _noise1D(worldX + params.seed) * params.maxHeight;
    h += _noise1D(worldX * 3 + params.seed + 50) * params.maxHeight * 0.3;
    ctx.lineTo(x, horizonY - h);
  }
  ctx.lineTo(w, horizonY);
  ctx.closePath();
  ctx.fill();
}
```

### Water Reflection

The reflection is a vertically flipped re-render of sky layers 0-5
below the horizon line. Each scanline is offset horizontally by a
sine wave that varies over time (ripple):

```javascript
function _renderWaterReflection(ctx, skyCanvas, horizonY, w, h, time) {
  for (var y = horizonY; y < h; y++) {
    var reflectY = horizonY - (y - horizonY); // Flip
    var rippleOffset = Math.sin((y - horizonY) * 0.15 + time * 2) * 3;
    var alpha = 1 - (y - horizonY) / (h - horizonY) * 0.7; // Fade

    ctx.globalAlpha = alpha * 0.6;
    ctx.drawImage(
      skyCanvas,
      rippleOffset, reflectY, w, 1,   // source: 1 scanline, offset by ripple
      0, y, w, 1                       // dest: current scanline
    );
  }
  ctx.globalAlpha = 1;
}
```

---

## Biome Sky Presets

| Biome | Zenith | Horizon | Clouds | Mountains | Water | Feel |
|-------|--------|---------|--------|-----------|-------|------|
| `cedar` | `#2a3a5a` cool blue | `#5a6878` pale gray | Thin, high, wispy | None (buildings) | None | Morning light, open |
| `mainst` | `#2a1a18` dark amber | `#5a3a20` warm orange | None (clear) | None | None | Sodium lamp evening |
| `harbor` | `#0a1830` deep navy | `#1a2840` cold blue | Low fog bank | None | Subtle reflection | Cold ocean night |
| `historic` | `#1a1525` mauve-black | `#2a2035` dusty purple | Thin mid-layer | None | None | Lamplit dusk |
| `alpine` | `#0a1520` deep indigo | `#3a2818` cold orange | Thick, layered, low | Selkirk ridgeline | None | Mountain twilight |
| `dockyard` | `#050810` near-black | `#101825` steel blue | None (industrial haze) | None | Dark water band | Industrial night |
| `title` | `#0a1530` → `#4a3020` cycling | `#5a4030` warm gold | All layers, animated | Full ridgeline | Full lake reflection | Dramatic, cinematic |

---

## Raycaster Integration

The raycaster currently draws ceiling/floor gradients in lines 86-99.
The skybox replaces the ceiling gradient for exterior contracts:

```javascript
// In Raycaster.render(), replace:
if (_contract && _contract.ceilingType === 'sky') {
  Skybox.render(ctx, w, halfH, player.dir, _contract.skyPreset);
} else {
  // Existing gradient path for SOLID/VOID ceilings
}
```

Skybox renders into the TOP HALF of the viewport only (0 to halfH).
Walls render on top of it. The floor gradient remains unchanged
(floor textures are a separate future feature).

For the title screen, Skybox renders FULL VIEWPORT (sky in top half,
water reflection in bottom half), then the menu box composites on top.

### SpatialContract Addition

Each exterior contract gets a `skyPreset` key:

```javascript
function exterior(opts) {
  return Object.freeze({
    ...existing fields...
    skyPreset: opts.skyPreset || 'cedar',  // Skybox preset name
  });
}
```

---

## Title Screen Animation

At the title screen, the skybox runs in animated mode:

```javascript
Skybox.renderAnimated(ctx, w, h, time, 'title');
```

- Cloud layers drift continuously (different speeds per layer)
- Sky gradient cycles slowly (sunset → dusk → back to sunset, 60s loop)
- Water ripple animates
- Star field twinkles (random alpha variation)
- No player angle input — the camera slowly pans (0.5°/sec rotation)

During gameplay, clouds still drift (time-based) but the gradient
and mountains are static. The parallax scrolls with player facing.

---

## Public API

```javascript
Skybox.init()                              // Generate all presets
Skybox.render(ctx, w, h, angle, preset)    // Render sky (half viewport)
Skybox.renderFull(ctx, w, h, angle, time, preset) // Sky + water (full viewport)
Skybox.getPreset(name)                     // → preset config object
Skybox.registerPreset(name, config)        // Add custom sky
```

---

## Module Load Order

Skybox loads in Layer 2, BEFORE Raycaster (raycaster calls Skybox):

```html
<!-- Layer 2: Rendering + UI -->
<script src="engine/skybox.js"></script>       <!-- NEW -->
<script src="engine/raycaster.js"></script>
```

Skybox depends on nothing except basic canvas 2D API.

---

## 1D Noise Function

Both clouds and mountains need a simple 1D noise function. Not
Perlin — just a hash-based value noise with smoothstep interpolation:

```javascript
function _noise1D(x) {
  var i = Math.floor(x);
  var f = x - i;
  f = f * f * (3 - 2 * f); // smoothstep
  var a = _hash1D(i);
  var b = _hash1D(i + 1);
  return a + (b - a) * f;
}

function _hash1D(n) {
  n = ((n << 13) ^ n) & 0x7fffffff;
  return (1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0) * 0.5 + 0.5;
}
```

This is the same deterministic noise strategy as TextureAtlas — no
randomness, just hash-based. Same seed = same sky every time.

---

## Estimated Size

| Component | Lines |
|-----------|-------|
| Noise function | ~15 |
| Sky gradient render | ~20 |
| Cloud band render | ~40 |
| Mountain silhouette | ~30 |
| Water reflection | ~25 |
| Star field | ~20 |
| Preset definitions (7 biomes + title) | ~60 |
| Public API + init | ~20 |
| Raycaster integration | ~10 |
| SpatialContract `skyPreset` field | ~5 |
| **Total** | **~245** |

---

## What This Replaces

- `Raycaster._renderParallax()` — replaced by `Skybox.render()` for
  exterior contracts. Interior/dungeon contracts continue using the
  gradient-only path (no sky visible underground).
- `SpatialContract.parallax` — deprecated for exteriors (skybox presets
  encode all sky layer data). Still used for dungeon contracts (subtle
  dark background bands in long corridors).
- Title screen background — currently nonexistent. Skybox provides
  the cinematic lake-mirror scene.

---

## Ocean Skybox & Sealab Portholes ✅ IMPLEMENTED

### Ocean Preset

A deep underwater ocean scene designed to be viewed through sealab
porthole windows. Uses the existing cloud band system where "clouds"
are ghostly sea creature silhouettes:

| Band | Role | Speed | Scale | Threshold |
|------|------|-------|-------|-----------|
| Whale silhouettes | Large, slow, sparse shapes at mid-depth | 0.00008 | 150 | 0.55 |
| Jellyfish band | Smaller, numerous, faster drift | 0.00018 | 40 | 0.48 |
| Jellyfish tentacle trails | Thin trailing lines below main band | 0.00018 | 40 | 0.58 |
| Caustic light ripples | Fast, subtle, near top | 0.0006 | 25 | 0.52 |

Seabed ridge at the horizon (mountain layer with organic shape, low
maxHeight). Deep blue-green zenith-to-horizon gradient. No stars,
no water reflection.

### Porthole Textures (Animated)

Two new TextureAtlas textures with per-frame animation:

**`porthole_wall`** — Metal frame with riveted ring surrounding a
circular glass window. Each frame, the window pixels are composited
with an animated ocean scene: deep water gradient, caustic light
patterns, whale shadows drifting horizontally, jellyfish with
bioluminescent glow.

**`porthole_ceil`** — Same frame structure but the interior shows
looking up at the ocean surface: bright caustic light pools from
surface refraction, jellyfish silhouettes from below, lighter
blue-green palette.

### Animation Architecture

TextureAtlas gained a `tick(dt)` method called once per frame from
the game loop. Porthole textures maintain:

- `frameData` — original metal frame pixel data (generated once)
- `mask` — boolean array marking which pixels are window (glass)
- `lookUp` flag — wall (horizontal view) vs ceiling (upward view)

Each frame, for each masked pixel, the ocean color is computed
procedurally from time-based noise (caustics, creature silhouettes)
and written directly into the texture's `data` array. The canvas is
then updated via `putImageData`. The raycaster draws the texture
normally — no special porthole handling needed.

Cost: 2 × 64×64 × ~4096 pixel writes per frame ≈ 8192 operations.
Negligible at 60fps.

### Sealab Integration

In FloorManager's biome texture overrides, sealab assigns
`porthole_wall` to PILLAR tiles (TILES constant 10). Only pillar
walls in sealab become portholes — regular WALL tiles stay
`concrete_dark`. This creates visual variety: long corridors of
concrete with occasional riveted porthole windows showing the deep
ocean.

---

## Jam Scope vs Post-Jam

### Jam (April 5)
- Sky gradient + 1-2 cloud layers per biome preset ✅
- Mountain silhouette for alpine + title presets ✅
- Water reflection for title screen ✅
- Title screen animated sky (cloud drift + slow color cycle) ✅
- 7 biome presets + title + ocean preset ✅
- Sealab porthole textures with animated ocean composite ✅

### Post-Jam
- Full cloud stack (3 layers per biome)
- Water reflections on harbor/waterfront during gameplay
- Time-of-day cycle (sky changes as player explores)
- Weather system (rain overlay, fog density, lightning flash)
- Dynamic cloud shadows on floor plane
- Per-biome ambient sound tied to sky state (wind intensity, rain)
- Animated porthole ceiling casting (ocean through ceiling glass)
- Porthole as standalone skybox viewport (render full Skybox.render
  into porthole window for parallax-correct ocean view)

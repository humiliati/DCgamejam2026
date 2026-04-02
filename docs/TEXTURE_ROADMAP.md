# Texture & Visual Fidelity Roadmap

> Upgrading from flat-colored Wolfenstein strips to Octopath Traveller-style
> pixel-art street views. Three layers, each independently shippable.

**Prerequisite reads:** `CLAUDE.md` (module conventions), `SpatialContract`
(rendering rules), `Raycaster` (current wall rendering pipeline).

---

## Current State (Wolfenstein Flat-Color)

The raycaster renders every wall column as a single `fillRect` with a hex
color chosen by tile type (wall/door) and facing (side 0 / side 1). Biome
identity comes from 6 colors per palette (`wallLight`, `wallDark`, `door`,
`doorDark`, `ceil`, `floor`). Sprites are emoji text or colored rectangles at
tile centers. No pixel-level rendering.

Section 2 of the Biome Plan describes this as "not Cruisin' USA." The goal of
this roadmap is to close the gap between flat-colored walls and atmospheric,
readable street scenes — without leaving Canvas 2D or adding build tooling.

---

## Layer 1 — Wall Textures (Priority: JAM)

### What It Does

Replace the single `fillRect` per wall column with a 1px-wide slice sampled
from a texture image. Each tile type gets a texture assignment per biome
(brick for exterior WALL, aged wood for DOOR, iron plate for BOSS_DOOR).
The raycaster already computes the perpendicular hit distance and wall
column bounds — it just throws away the UV coordinate. We add it back.

### UV Math

When a ray hits side 0 (vertical grid line), the U coordinate is:
```
wallX = playerY + perpDist * rayDirY
wallX = wallX - floor(wallX)          // fractional part = 0..1
```

When a ray hits side 1 (horizontal grid line):
```
wallX = playerX + perpDist * rayDirX
wallX = wallX - floor(wallX)
```

This gives the horizontal position within the wall face (0 = left edge,
1 = right edge). To sample from a texture of width T pixels:
```
texX = floor(wallX * T)
```

### New Module: TextureAtlas

```
engine/texture-atlas.js  (Layer 1, after SpatialContract)
```

IIFE module. Responsibilities:
- Load texture images (PNG) into offscreen canvases at init
- Cache ImageData for pixel-level access (needed for ImageData path)
- Provide `getColumn(textureId, texX, texH)` → returns a 1px-wide
  ImageData column scaled to the requested height
- Procedural texture generation for jam placeholders (brick, stone, wood,
  iron patterns generated at runtime — no external PNGs needed yet)

Public API:
```javascript
TextureAtlas.init()                    // generate/load all textures
TextureAtlas.get(textureId)            // → { width, height, canvas, imageData }
TextureAtlas.hasTexture(textureId)     // → boolean
```

### SpatialContract Changes

Add a `textures` table alongside `tileHeightOffsets` in each contract
constructor. Keyed by TILES constant value, values are texture IDs:

```javascript
textures: opts.textures || _buildTextures({
  1:  'brick_light',     // WALL
  2:  'door_wood',       // DOOR
  3:  'door_wood',       // DOOR_BACK
  14: 'door_iron'        // BOSS_DOOR
})
```

New runtime query:
```javascript
SpatialContract.getTexture(contract, tileType)  // → textureId or null
```

When `getTexture` returns null, the raycaster falls back to flat color
(backward compatible — untextured tiles render exactly as before).

### Raycaster Changes

In the wall-drawing section (after perpDist and lineHeight are computed):

1. Compute `wallX` (UV) from the DDA hit position
2. Look up texture via `SpatialContract.getTexture(_contract, hitTile)`
3. If texture exists: `ctx.drawImage(tex.canvas, texX, 0, 1, texH, col, drawStart, 1, drawEnd - drawStart + 1)`
4. If no texture: existing `fillRect` flat-color path (unchanged)
5. Fog overlay: `ctx.fillStyle = 'rgba(fr,fg,fb,fogFactor)'; ctx.fillRect(col, drawStart, 1, stripH)`

### Performance Notes

- `ctx.drawImage` with 1px-wide source clip is the fastest Canvas 2D
  texture sampling method — avoids per-pixel JS loops
- Target viewport: 480px wide with `image-rendering: pixelated` CSS
  scaling to display resolution. This gives the chunky pixel-art look
  and keeps the ray count manageable
- At 480 rays/frame, 60fps, this is 28,800 drawImage calls/sec —
  well within Canvas 2D budget on modern browsers and webOS TV
- If performance becomes an issue post-jam: switch to ImageData buffer
  writes (write all pixels to a single ImageData, putImageData once) or
  upgrade to WebGL

### Procedural Placeholder Textures

For the jam, textures are generated at runtime in `TextureAtlas.init()`:

| Texture ID        | Pattern                          | Size   |
|-------------------|----------------------------------|--------|
| `brick_light`     | Brick rows with mortar lines     | 64×64  |
| `brick_dark`      | Same pattern, darker palette     | 64×64  |
| `stone_rough`     | Irregular stone blocks           | 64×64  |
| `wood_plank`      | Vertical plank grain             | 64×64  |
| `door_wood`       | Wood with horizontal bands       | 64×64  |
| `door_iron`       | Riveted iron plate               | 64×64  |
| `concrete`        | Smooth concrete with seams       | 64×64  |
| `pillar_stone`    | Rounded stone column             | 64×64  |

Each biome maps tile types to these texture IDs. Cedar Street uses
`concrete` walls + `door_wood` doors. Main Street uses `brick_light`
walls + `door_wood` doors. Waterfront uses `brick_dark` + `door_iron`.

Post-jam: replace procedural textures with hand-pixeled 64×64 PNGs for
each biome. The atlas system loads them identically.

### Estimated Size

~200 lines: TextureAtlas module (~120) + raycaster UV wiring (~30) +
SpatialContract texture table (~30) + procedural generators (~80 shared
with TextureAtlas init).

---

## Layer 2 — Wall-Mounted Sprites (Priority: JAM STRETCH)

### What It Does

Attach small sprite images to specific faces of wall tiles. Torches on
tavern walls, lantern brackets on street walls, grates on dungeon walls,
signage on shop doors. These are not floor-standing billboards (which the
sprite system already handles) — they're pinned to a wall face at a
specific position.

### Data Model

Per-floor decoration table, populated by the floor generator or hand
templates:

```javascript
// wallDecor[y][x] = { north: [...], south: [...], east: [...], west: [...] }
// Each entry: { spriteId, anchorU (0-1 horizontal), anchorV (0-1 vertical), scale }
```

Example: torch on the north face of tile (5, 3) at center-top:
```javascript
wallDecor[3][5].north = [
  { spriteId: 'torch', anchorU: 0.5, anchorV: 0.2, scale: 0.3 }
]
```

### Raycaster Integration

During wall column rendering, after the wall texture/color is drawn:

1. Determine which face was hit (side 0 = east/west based on stepX,
   side 1 = north/south based on stepY)
2. Look up `wallDecor[mapY][mapX][face]`
3. For each decor item on that face:
   - Check if the column's wallX falls within the sprite's horizontal
     span (`anchorU ± spriteWidth/2`)
   - If yes, compute which column of the sprite to draw
   - Draw the sprite column on top of the wall, scaled to distance
4. Z-buffer is already set for this column, so decor respects occlusion

### Sprite Atlas

Wall decor sprites use the same `TextureAtlas` system — they're just
smaller textures (16×16 or 32×32) with transparency. The atlas stores
them alongside wall textures with an alpha channel.

For the jam, procedural sprites: torch (orange/yellow glow column with
bracket), lantern (warm rectangle with halo), grate (horizontal bars),
sign (colored rectangle with border).

### Authoring

The floor designer portal (future work) will support placing wall decor
per-face via click. For the jam, template-based floors embed decor in
their JSON definition. Proc-gen floors auto-place torches at room
entrances and corridors.

### Estimated Size

~150 lines: wall decor data structure + raycaster face detection and
sprite column rendering + auto-placement rules in grid-gen.

---

## Layer 3 — Sprite Light Emitters (Priority: POST-JAM)

### What It Does

Wall-mounted sprites tagged as emitters (torches, lanterns, neon signs)
cast colored light onto nearby wall and floor tiles. This is the
atmosphere maker — warm torch pools in taverns, cold fluorescent glow
in the datacenter, flickering fire in dungeon corridors.

### Light Source Registry

```javascript
// Added to floor data alongside grid and wallDecor:
lightSources: [
  { x: 5.5, y: 3.0, color: { r: 255, g: 180, b: 80 }, radius: 4, intensity: 0.8, flicker: 'torch' }
]
```

Wall decor items with `emitter: true` auto-register a light source at
their wall position when the floor loads. The light position is the
tile center offset toward the wall face (so a torch on the north wall
of (5,3) emits from approximately (5.5, 3.1)).

### Lighting Integration

`Lighting.calculate()` already produces a per-tile brightness map that
the raycaster reads. Extend it to:

1. Accept an array of point light sources
2. For each light: iterate tiles within radius, compute distance
   falloff (`1 - dist/radius`), add contribution scaled by intensity
3. Clamp final brightness to [0, maxBrightness] (prevent blowout)
4. Optional: color tinting. Instead of scalar brightness, output
   `{ r, g, b }` multiplier per tile. Raycaster blends wall color
   with light color.

### Glow Overlay Pass

After the main raycast loop, for each visible emitter:

1. Project emitter world position to screen X (same math as sprite
   rendering)
2. Draw a radial gradient circle at that screen position using
   `ctx.globalCompositeOperation = 'lighter'`
3. Gradient: emitter color at center, transparent at edge
4. Scale radius by distance (closer = larger glow)

This gives the Octopath bloom-lite effect. 5-10 visible emitters per
frame is typical — negligible performance cost.

### Flicker Functions

```javascript
var FLICKER = {
  torch:  function(t) { return 0.85 + 0.15 * Math.sin(t * 8.3) * Math.sin(t * 5.1); },
  neon:   function(t) { return Math.random() > 0.98 ? 0.3 : 1.0; },
  steady: function(t) { return 1.0; }
};
```

Applied as intensity multiplier each frame. Torch flicker uses two
sine waves at irrational-ratio frequencies for organic variation.
Neon has rare random dropout. Steady is for fluorescent/magic lights.

### Estimated Size

~120 lines: point light calculation in Lighting (~60) + glow overlay
pass in Raycaster (~40) + emitter registration in FloorManager (~20).

---

## Layer 1.5 — Floor Textures (Priority: JAM) ✅ IMPLEMENTED

### What It Does

Replaces the flat gradient floor with a textured ground plane using
classic floor casting. For each pixel below the horizon, the raycaster
computes the world floor position and samples a floor texture, giving
the dungeon a physical ground surface instead of a flat color ramp.

### Floor Casting Math

For each scanline `y` below the horizon (`halfH`):
```
rowDist = (halfH * wallHeightMult) / (y - halfH)
```

The camera plane vectors give left-to-right interpolation:
```
planeX = -sin(pDir) * tan(halfFov)
planeY =  cos(pDir) * tan(halfFov)
```

For each column, world floor position:
```
floorX = px + rowDist * (dirX - planeX) + col * floorStepX
floorY = py + rowDist * (dirY - planeY) + col * floorStepY
```

Texture coordinates wrap to tile boundaries:
```
tx = floor(floorX * texW) % texW
ty = floor(floorY * texH) % texH
```

### Performance

Uses an ImageData buffer (allocated once, reused across frames) for
the entire floor region. At 480×135 pixels, this is ~64,800 texel
lookups per frame — well within Canvas 2D budget. The buffer is written
with bitwise-OR for fast integer conversion, then putImageData once.

Distance-based fog and brightness darkening are applied per-scanline
(not per-pixel) since all pixels in a row share the same distance.

### Free-Look Compatibility

The `player.dir` passed to the raycaster already includes the ±32°
MouseLook offset (baked in by game.js). Floor casting uses the same
`pDir` for its direction and camera plane vectors, so free-look
rotates the floor texture correctly with no special handling.

### New Floor Textures

| Texture ID          | Pattern                                | Biome Use       |
|---------------------|----------------------------------------|-----------------|
| `floor_cobble`      | Irregular cobblestone grid             | (fallback)      |
| `floor_wood`        | Horizontal plank grain                 | Interior default |
| `floor_stone`       | Large irregular stone flags            | Dungeon default  |
| `floor_dirt`        | Organic noise, dark patches            | Cellar, Foundry  |
| `floor_brick_red`   | Warm terracotta brick courtyard        | Exterior         |
| `floor_grass_stone` | Grey-Scott reaction-diffusion grass veins through flagstone | Lobby |
| `floor_tile`        | Cool blue-white clinical tile          | Sealab           |

### SpatialContract Integration

Each contract now has a `floorTexture` field:
```javascript
floorTexture: 'floor_cobble'    // exterior
floorTexture: 'floor_wood'      // interior
floorTexture: 'floor_stone'     // nested dungeon (default)
floorTexture: 'floor_dirt'      // crawlspace preset
```

New query: `SpatialContract.getFloorTexture(contract)` returns the
texture ID. When null, the raycaster falls back to the gradient.

### Wall Textures Added

| Texture ID       | Pattern                                        | Biome Use       |
|------------------|------------------------------------------------|-----------------|
| `tree_trunk`     | Brown bark bottom (45%), green canopy top (55%) | Exterior perimeter |
| `door_wood`      | Archway entrance with dark void interior        | All door tiles   |

### Per-Tile Wall Height (`tileWallHeights`)

New spatial contract property added for tiles that render taller/shorter than
the contract default. Currently used for exterior TREE tiles (2× height) so
the courtyard perimeter looks like a dense tree line surrounding a brick
building at normal height.

---

## Future — Campfire / Bonfire Sprite with Glow

The bonfire tile (TILES.BONFIRE) currently renders as a flat emoji sprite.
The target is a campfire billboard sprite with per-frame glow emission,
similar to the EyesOnly `gone-rogue` campfire:

Reference: `EyesOnly/` campfire emoji with animated glow per Lighting system.
Breakable spawner pattern shows how to composite emoji + glow radius.

Implementation: register bonfire position as a point light emitter (Layer 3
light system) with `flicker: 'torch'` and warm orange color
`{ r: 255, g: 160, b: 60 }`. The sprite itself cycles between campfire
emoji frames or uses a procedural flame column texture.

Blocked on: Layer 3 (Sprite Light Emitters) implementation.

---

## Wall Texture Stretch Fix ✅ IMPLEMENTED

### The Bug

When facing an adjacent wall, the texture widened (more screen columns
hit the wall) but didn't get proportionally taller, causing a horizontal
stretch effect at close range.

### Root Cause

`lineHeight` was capped at `h * 3` to prevent "distorted peripheral
strips." This limited wall height but not width — as the player
approached a wall, more columns showed the wall texture (correct) but
the height stopped increasing at h×3 (wrong).

### The Fix

1. Removed the `Math.min(h * 3, ...)` cap on `lineHeight`
2. Added proper texture UV clipping: when the wall extends beyond screen
   bounds, compute the visible fraction of the texture:
   ```javascript
   texSrcY = (drawStart - shiftedTop) / lineHeight * tex.height;
   texSrcH = stripH / lineHeight * tex.height;
   ```
3. Reduced `perpDist` minimum clamp from 0.2 to 0.12 (enough to prevent
   numeric instability, allows natural close-range rendering)

With ±32° free-look, effective viewport spans ±62° total. The UV
clipping handles arbitrarily large lineHeight values correctly.

---

## Biome-Specific Texture Alignment ✅ IMPLEMENTED

### The Problem

All nested dungeon floors used `stone_rough` walls regardless of biome.
Foundry (rusted iron, furnace glow) and Sealab (clean tile, fluorescent)
shared the same dungeon stone texture, undermining biome identity.

### The Fix

`FloorManager.getFloorContract()` now passes biome-specific texture
overrides into SpatialContract constructors:

| Biome    | Wall Texture    | Floor Texture   | Fog Tint            |
|----------|-----------------|-----------------|---------------------|
| Cellar   | `stone_rough`   | `floor_stone`   | Default dark        |
| Foundry  | `metal_plate`   | `floor_stone`   | Warm furnace (12,6,3) |
| Sealab   | `concrete_dark` | `floor_cobble`  | Cold blue (2,5,12)  |

Breakable props from `data/loot-tables.json` already have biome-specific
entries (barrels for cellar, furnace drums for foundry, lab cabinets for
sealab) that thematically match these wall textures.

---

## Door Peek (BoxAnim Proximity Reveal) ✅ IMPLEMENTED

### What It Does

When the player faces a door or stair tile, a small 3D box (BoxAnim
door variant, left-hinged lid) appears in the viewport and swings open
to reveal a direction indicator: "▼ Descend" / "▲ Ascend" / "► Enter".

The glow color inside the box matches the direction: green for descend,
amber for ascend, red for boss doors. This gives the player a physical
preview of what's behind the door without committing to a transition.

### New Module

```
engine/door-peek.js  (Layer 3, after InteractPrompt + BoxAnim)
```

Uses BoxAnim.create('door') to instantiate a door-variant box in a
container div above the interact prompt. show/hide lifecycle is debounced
(300ms delay) to prevent jitter when turning between tiles.

---

## Implementation Order (Updated)

```
JAM DEADLINE (April 5)
│
├─ Layer 1: Wall Textures ✅ DONE
│   ├─ TextureAtlas module (19 procedural textures)
│   ├─ SpatialContract texture table
│   ├─ Raycaster UV sampling + drawImage
│   ├─ Directional stair textures (stairs_down, stairs_up)
│   ├─ Locked door texture (door_locked)
│   └─ Biome-specific texture overrides
│
├─ Layer 1.5: Floor Textures ✅ DONE
│   ├─ Floor casting in Raycaster (ImageData buffer)
│   ├─ 4 floor textures (cobble, wood, stone, dirt)
│   ├─ SpatialContract floorTexture field
│   └─ Wall stretch fix (UV clipping, no lineHeight cap)
│
├─ Layer 1.6: Animated Textures ✅ DONE
│   ├─ TextureAtlas.tick(dt) per-frame compositing
│   ├─ Porthole wall texture (deep ocean + sea creatures)
│   ├─ Porthole ceiling texture (surface caustics from below)
│   └─ Sealab biome wiring (PILLAR tiles → porthole_wall)
│
├─ Layer 2: Wall Decor (if time permits)
│   ├─ Wall decor data model
│   ├─ Raycaster face-hit sprite rendering
│   └─ Auto-placement in grid-gen (torches at room entries)
│
POST-JAM
│
├─ Layer 3: Emitter Lights
│   ├─ Point light system in Lighting
│   ├─ Glow overlay in Raycaster
│   └─ Flicker functions
│
├─ Hand-pixeled texture PNGs (replace procedural)
├─ Per-biome decor sprite sheets
├─ Floor designer portal: texture + decor painting
└─ WebGL migration (if Canvas 2D perf ceiling is hit)
```

---

## Animated Texture System ✅ IMPLEMENTED

### What It Does

TextureAtlas now supports per-frame animation for specific textures.
The `tick(dt)` method is called once per frame from the game loop and
composites time-varying pixel data into registered animated textures.

This was built for sealab porthole windows but the system is general:
any texture can register as animated by pushing an entry onto the
internal `_portholes` array during generation.

### Architecture

Each animated texture stores:

- `frameData` — the original static frame pixels (metal ring, rivets,
  outer wall), captured once at generation time
- `mask` — a boolean array (`Uint8Array`) marking which pixels are the
  animated region (the glass window area)
- `lookUp` — whether the view is horizontal (wall porthole) or upward
  (ceiling porthole), affecting which ocean scene is composited

Each frame, `tick(dt)` iterates all registered animated textures. For
each masked pixel, it computes an ocean color from time-based noise
(caustic ripples, creature silhouettes, depth gradient) and writes it
directly into the texture's `data` array. A single `putImageData` call
per texture updates the canvas. The raycaster draws the texture normally
— no special animated-texture code path needed.

### Cost

2 animated textures × 64×64 pixels × ~4096 masked pixels ≈ 8192
pixel writes per frame. Negligible at 60fps.

### Game Loop Wiring

```javascript
// In Game._renderGameplay(), before raycaster render:
TextureAtlas.tick(frameDt);
```

---

## Texture Inventory (Current — 26 textures)

| Texture ID        | Type     | Pattern                          | Size   | Animated |
|-------------------|----------|----------------------------------|--------|----------|
| `brick_light`     | Wall     | Brick rows with mortar lines     | 64×64  | No       |
| `brick_dark`      | Wall     | Same pattern, darker palette     | 64×64  | No       |
| `brick_red`       | Wall     | Red-toned brick                  | 64×64  | No       |
| `stone_rough`     | Wall     | Irregular stone blocks           | 64×64  | No       |
| `stone_cathedral` | Wall     | Purple-toned stone               | 64×64  | No       |
| `wood_plank`      | Wall     | Vertical plank grain             | 64×64  | No       |
| `wood_dark`       | Wall     | Dark wood planks                 | 64×64  | No       |
| `door_wood`       | Door     | Wood with horizontal bands       | 64×64  | No       |
| `door_iron`       | Door     | Riveted iron plate               | 64×64  | No       |
| `door_locked`     | Door     | Wood + chain X + padlock         | 64×64  | No       |
| `concrete`        | Wall     | Smooth concrete with seams       | 64×64  | No       |
| `concrete_dark`   | Wall     | Dark concrete                    | 64×64  | No       |
| `metal_plate`     | Wall     | Brushed metal with bolt holes    | 64×64  | No       |
| `pillar_stone`    | Wall     | Rounded stone column             | 64×64  | No       |
| `stairs_down`     | Stair    | Dark stone + 3 down chevrons (▼) | 64×64  | No       |
| `stairs_up`       | Stair    | Light stone + 3 up chevrons (▲)  | 64×64  | No       |
| `porthole_wall`   | Porthole | Riveted metal ring, ocean window | 64×64  | Yes      |
| `porthole_ceil`   | Porthole | Same ring, upward ocean view     | 64×64  | Yes      |
| `floor_cobble`    | Floor    | Irregular cobblestone grid       | 64×64  | No       |
| `floor_wood`      | Floor    | Horizontal plank grain           | 64×64  | No       |
| `floor_stone`     | Floor    | Large irregular stone flags      | 64×64  | No       |
| `floor_dirt`      | Floor    | Organic noise, dark patches      | 64×64  | No       |
| `crate_wood`      | Prop     | 3px border, X cross-braces, slat lines, nail heads | 64×64  | No       |

Plus 3 reveal textures in DoorAnimator (descend, ascend, boss).

### Porthole Textures Detail

**`porthole_wall`** — Metal frame with riveted ring surrounding a
circular glass window. Each frame, window pixels are composited with
an animated deep-ocean scene: dark water gradient, caustic light
ripples, whale shadow silhouettes drifting horizontally, jellyfish
with bioluminescent glow. Used on PILLAR tiles in sealab biome.

**`porthole_ceil`** — Same riveted frame but the interior shows an
upward view at the ocean surface: bright caustic light pools from
surface refraction, jellyfish silhouettes from below, lighter
blue-green palette. Available for future ceiling casting in sealab.

---

## Module Load Order Impact

TextureAtlas loads in Layer 1 (after TILES, before Raycaster):

```html
<!-- Layer 1: Core systems -->
<script src="engine/spatial-contract.js"></script>
<script src="engine/texture-atlas.js"></script>

<!-- Layer 2: Rendering -->
<script src="engine/raycaster.js"></script>
```

DoorPeek loads in Layer 3 (after InteractPrompt, BoxAnim):

```html
<script src="engine/interact-prompt.js"></script>
<script src="engine/door-peek.js"></script>
```

---

## Cross-References to Other Roadmaps

### Layer 2 ↔ LIGHT_AND_TORCH_ROADMAP Phase 2

**These are the same system.** The `wallDecor[y][x]` data model defined
here in Layer 2 is the mounting mechanism for wall torches defined in
LIGHT_AND_TORCH Phase 2. Torch sprites are wall decor items with
`emitter: true`. Implementation should be unified:

- Build the wall decor data model and raycaster face-hit rendering (Layer 2)
- TORCH_LIT / TORCH_UNLIT tiles use this system for their wall sprite overlay
- Auto-placement rules in GridGen place torches at room entrances and corridors
- LIGHT_AND_TORCH Phase 2b (torch wall rendering) becomes a consumer of Layer 2

**Execution order:** Layer 2 wall decor model FIRST → then LIGHT_AND_TORCH
Phase 2 torch tiles as a specific use case of wall decor.

### Layer 3 ↔ LIGHT_AND_TORCH_ROADMAP Phase 1

**These are the same implementation.** Both define the identical light source
format `{ x, y, color, radius, intensity, flicker }` extending Lighting.js.
The point light calculation, glow overlay pass, and flicker functions described
in Layer 3 here are the same system as LIGHT_AND_TORCH Phase 1's dynamic
light source registry. Merge into a single implementation:

- `Lighting.addLightSource()` / `clearLightSources()` / `calculate()` extension
- Glow overlay pass in Raycaster (Layer 3 here)
- Flicker functions (torch 3Hz, neon dropout, steady) — shared by both docs
- Wall decor items with `emitter: true` auto-register via this unified API

**Execution order:** Implement once as LIGHT_AND_TORCH Phase 1 (since that
doc has the more detailed spec), then Layer 3 here is satisfied automatically.

### "Future — Campfire/Bonfire" ↔ LIGHT_AND_TORCH_ROADMAP Phase 2d

The bonfire glow section above says "Blocked on: Layer 3 implementation."
LIGHT_AND_TORCH Phase 1 IS Layer 3. Once dynamic light sources ship,
bonfire registration (Phase 2d: radius 5, intensity 0.9, slow pulse) unblocks
this future section with zero additional work.

### Layer 2 wall decor ↔ NLAYER_RAYCASTER_ROADMAP

N-layer raycaster (Phase 1) modifies the wall column DDA loop — the same
loop where Layer 2 adds face-hit sprite rendering. Implementation order matters:

1. NLAYER Phase 1: refactor DDA to N-layer hit collector + back-to-front render
2. THEN Layer 2: add wall decor sprite overlay per-layer in the new render loop

If Layer 2 ships before N-layer, it must be refactored when N-layer lands.
Recommended: do NLAYER Phase 1 first if both are in the same sprint.

### Shrub texture ↔ NLAYER_RAYCASTER_ROADMAP Phase 3b

NLAYER Phase 3b explicitly depends on TextureAtlas for a `_genShrub()`
procedural texture (SHRUB tile 22). This is a new texture addition to the
atlas — same pattern as existing procedural generators. Add `shrub` and
`shrub_flower` to the texture inventory when NLAYER Phase 3 ships.

### Frontier biome textures ↔ SKYBOX_ROADMAP Phase 5

Floor 3 (Frontier Gate) needs biome-specific wall and floor textures for
the frontier/maritime setting. SKYBOX Phase 5 provides the sky (`frontier`
preset); TextureAtlas provides the ground. Both needed for Floor 3 to feel
complete. Suggested frontier textures:

- `wall_weathered` — salt-worn stone or timber
- `floor_planks_wet` — dock planking with moisture
- `door_heavy` — reinforced gate/portcullis style

These should be added to the texture inventory when Floor 3 blockout begins.

---

## What This Does NOT Include

- Ceiling textures (textured ceiling plane). Similar to floor casting
  but less impactful — gradients + skybox handle ceiling identity well.
- Skybox textures. Parallax bands + gradient already handle sky identity.
  Photorealistic sky is a WebGL concern.
- Animated wall textures beyond portholes (waterfalls, fire walls).
  The porthole animation system (`tick(dt)` + mask) could be extended
  to other animated surfaces post-jam.
- 3D model rendering. This is a raycaster, not a polygon engine. The
  Octopath feel comes from texture + lighting + atmosphere, not geometry.

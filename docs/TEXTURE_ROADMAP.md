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

## Implementation Order

```
JAM DEADLINE (April 5)
│
├─ Layer 1: Wall Textures ← START HERE
│   ├─ TextureAtlas module (procedural textures)
│   ├─ SpatialContract texture table
│   ├─ Raycaster UV sampling + drawImage
│   └─ Biome texture assignments
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

## Module Load Order Impact

TextureAtlas loads in Layer 1 (after TILES, before Raycaster):

```html
<!-- Layer 1: Core systems -->
<script src="engine/spatial-contract.js"></script>
<script src="engine/texture-atlas.js"></script>   <!-- NEW -->

<!-- Layer 2: Rendering -->
<script src="engine/raycaster.js"></script>
```

TextureAtlas depends on nothing except TILES constants (for texture ID
conventions). Raycaster reads TextureAtlas during wall rendering. No
circular dependencies.

---

## Biome Plan Section 2 Update

With Layer 1 implemented, Section 2's "What we CANNOT do" warning changes
from "all buildings are the same colored columns" to:

> Buildings are distinguished by wall texture (brick vs. concrete vs.
> weathered wood), door texture (aged oak vs. iron plate vs. glass panel),
> and the biome palette that tints them. You won't see "Baker's Brew"
> written on the wall, but the warm wood-plank texture with a raised
> oak door next to cool concrete walls makes the bakery entrance visually
> distinct from the bank's iron door.

With Layer 2 added:

> A lantern bracket flanks the tavern door. A grate sits above the
> dungeon stairwell. A painted sign hangs on the shop face. Non-gamers
> can read the environment.

---

## What This Does NOT Include

- Floor textures (textured ground plane). This requires a different
  rendering technique (floor casting or mode 7). Deferred to WebGL pass.
- Skybox textures. Parallax bands + gradient already handle sky identity.
  Photorealistic sky is a WebGL concern.
- Animated wall textures (waterfalls, fire walls). Possible with texture
  atlas frame cycling but deferred to post-jam.
- 3D model rendering. This is a raycaster, not a polygon engine. The
  Octopath feel comes from texture + lighting + atmosphere, not geometry.

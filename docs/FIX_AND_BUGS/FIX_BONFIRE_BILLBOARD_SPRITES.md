# FIX_BONFIRE_BILLBOARD_SPRITES.md

## Problem

Bonfire tiles (`TILES.BONFIRE = 18`) exist in the tile system and are walkable + non-opaque, but they have NO visual representation in the 3D viewport. The player sees an empty, blank floor tile where the bonfire should be. The feature requires bonfire tiles to render as billboarding tent emoji sprites at half-wall height, surrounded by shrubs in a "C" shape. This should be a modular "exterior bonfire contract" reusable across floors.

## Root Cause

**Tile definition exists, but sprite composition is missing:**
- `engine/tiles.js` line 18 defines `TILES.BONFIRE = 18` as walkable (`walkable: true`) and non-opaque (`opaque: false`)
- The raycaster's sprite rendering system in `engine/raycaster.js` supports billboarded emoji sprites (NPCs use triple stacks; ground corpses use tilt)
- However, there is no bonfire sprite composition spawned during floor generation
- When a floor is generated with BONFIRE tiles, no corresponding sprite objects are created, so the raycaster has nothing to render

**Sprite composition never defined:**
- `SpatialContract` in `engine/spatial-contract.js` defines per-floor rendering config (wall height, fog, tile height offsets)
- But bonfire sprite composition is not part of any contract
- Grid generation does not spawn bonfire sprite groups

**Result:** Bonfire tiles are invisible in-game, despite being walkable and interactive.

## Files to Modify

1. **`engine/spatial-contract.js`** — Add bonfire rendering config to `exterior()` contract
2. **`engine/raycaster.js`** — Add bonfire sprite type support to sprite rendering pass
3. **`engine/grid-gen.js`** — Spawn bonfire sprite groups during floor generation when BONFIRE tiles are placed
4. **`engine/floor-manager.js`** — Optionally manage bonfire sprite lifecycle if needed
5. **`engine/tiles.js`** — No changes needed; BONFIRE already defined correctly

## Implementation Steps

### Step 1: Define Bonfire Sprite Composition in SpatialContract

In `engine/spatial-contract.js`, add bonfire sprite configuration to the object returned by `exterior()`:

```javascript
bonfireConfig: {
  tent: {
    emoji: '⛺',
    heightScale: 0.5,        // 0.5 × wallHeight = half-wall height
    offsetX: 0,
    offsetY: 0
  },
  fire: {
    emoji: '🔥',
    heightScale: 0.15,       // Ground level, small
    offsetX: 0,
    offsetY: 0.05            // Slightly in front of tent
  },
  shrubs: [
    { emoji: '🌿', heightScale: 0.3, offsetX: -0.35, offsetY: -0.2 },  // Left rear
    { emoji: '🌿', heightScale: 0.3, offsetX: -0.35, offsetY: 0.2 },   // Left rear (alt)
    { emoji: '🌿', heightScale: 0.3, offsetX: 0.35, offsetY: -0.2 },   // Right rear
    { emoji: '🌿', heightScale: 0.3, offsetX: 0.35, offsetY: 0.2 }     // Right rear (alt)
  ]
}
```

The shrub offsets form a "C" shape opening toward the player's likely approach direction (negative Y / north).

### Step 2: Create Bonfire Sprite Spawner Function

In `engine/grid-gen.js` (or in a new utility), add a reusable function:

```javascript
function spawnBonfireGroup(gridX, gridY, spatialContract) {
  const sprites = [];
  const config = spatialContract.bonfireConfig;

  if (!config) return sprites;  // Fallback for floors without bonfire config

  // Tent sprite (center)
  sprites.push({
    x: gridX + config.tent.offsetX,
    y: gridY + config.tent.offsetY,
    emoji: config.tent.emoji,
    heightFraction: config.tent.heightScale,
    type: 'bonfire_tent',
    billboardMode: 'full'  // Always face camera
  });

  // Fire sprite (foreground, ground level)
  sprites.push({
    x: gridX + config.fire.offsetX,
    y: gridY + config.fire.offsetY,
    emoji: config.fire.emoji,
    heightFraction: config.fire.heightScale,
    type: 'bonfire_fire',
    billboardMode: 'full'
  });

  // Shrub sprites (surround in C shape)
  config.shrubs.forEach((shrub, index) => {
    sprites.push({
      x: gridX + shrub.offsetX,
      y: gridY + shrub.offsetY,
      emoji: shrub.emoji,
      heightFraction: shrub.heightScale,
      type: 'bonfire_shrub',
      billboardMode: 'full',
      shrubIndex: index
    });
  });

  return sprites;
}
```

### Step 3: Integrate Sprite Spawning into Floor Generation

In `engine/grid-gen.js`, after the main grid generation loop, add bonfire sprite spawning:

```javascript
// After generating tile grid, scan for BONFIRE tiles and spawn sprites
const bonfireSprites = [];
for (let y = 0; y < tiles.length; y++) {
  for (let x = 0; x < tiles[y].length; x++) {
    if (tiles[y][x] === TILES.BONFIRE) {
      const group = spawnBonfireGroup(x, y, spatialContract);
      bonfireSprites.push(...group);
    }
  }
}

// Add bonfire sprites to the floor's sprite list
if (!result.sprites) result.sprites = [];
result.sprites.push(...bonfireSprites);
```

Ensure that `result.sprites` is initialized before pushing and passed to the floor data.

### Step 4: Update Raycaster Sprite Rendering

In `engine/raycaster.js`, locate the sprite rendering section (typically in the render loop after walls but before UI). Ensure bonfire sprite types are handled:

**For billboarding (existing NPC/corpse code likely does this already):**
- Read sprite `heightFraction` to compute screen height: `screenHeight = sprite.heightFraction * wallHeight`
- Compute world height: `worldY = gridY + heightFraction * wallHeight / 2`
- Billboard faces camera (full facing mode)

**Add bonfire-specific rendering (optional animation):**
```javascript
// In sprite loop, after basic billboard setup
if (sprite.type === 'bonfire_fire') {
  // Subtle y-oscillation: ±2px at 2Hz
  const wobble = Math.sin(Date.now() * 0.004) * 2;  // 0.004 rad/ms ≈ 2Hz
  screenY += wobble;
} else if (sprite.type === 'bonfire_shrub') {
  // Sway: ±1px at 0.5Hz
  const sway = Math.sin(Date.now() * 0.001) * 1;
  screenX += sway;
}
```

### Step 5: Verify Z-Buffer Clipping

Confirm that bonfire sprites are depth-sorted and z-buffer clipped correctly. The existing raycaster sprite rendering should handle this automatically if sprites are added to the floor's sprite list with correct world coordinates.

**Acceptance check:** When walls are rendered in front of the bonfire (at closer distance), they should occlude the sprites. Use the existing z-depth comparison logic.

### Step 6: Test Sprite Composition Across Floors

Call `spawnBonfireGroup()` in any floor generator that has BONFIRE tiles:
- `"1.2"` Driftwood Inn (existing overheal bonfire)
- Future floors with rest points

The function should be exported from `grid-gen.js` or placed in a shared utility module.

### Step 7: Optional Ambient Animation

For subtle fire/shrub animation:
- Fire emoji oscillates vertically at 2 Hz with ±2px amplitude (simulates flickering)
- Shrubs sway horizontally at 0.5 Hz with ±1px amplitude (simulates wind)

Use `Date.now()` to drive the animation in the raycaster's sprite rendering pass. No additional game state needed.

## Acceptance Criteria

- [ ] BONFIRE tiles render a visible tent sprite (⛺) in the 3D viewport at 0.5× wall height
- [ ] A small fire sprite (🔥) appears at ground level (0.15× wall height) in front of the tent
- [ ] 4 shrub sprites (🌿) form a "C" shape surrounding the bonfire (offsets: ±0.35 X, ±0.2 Y)
- [ ] All sprites billboard toward the camera (full facing mode)
- [ ] Sprites are z-buffer clipped correctly — walls in front of the bonfire occlude sprite pixels
- [ ] Bonfire composition is reusable via a single `spawnBonfireGroup(x, y, contract)` function call
- [ ] Existing bonfire tile interaction (walk-on rest/heal) still works unchanged
- [ ] Performance: <10 additional sprites per bonfire site, negligible render cost (<1ms per frame overhead)
- [ ] Bonfire sprites appear on all floors that place BONFIRE tiles (Driftwood Inn confirmed)
- [ ] Optional: Fire emoji subtly wobbles; shrubs sway (no gameplay impact, visual only)

## Testing Checklist

1. Load Driftwood Inn (`"1.2"`), navigate to the bonfire tile
2. Confirm tent, fire, and shrub sprites are visible and billboarded
3. Walk around the bonfire — sprites should rotate to always face the player
4. Walk to a position where a wall blocks the bonfire — confirm wall occludes the sprites
5. Rest on the bonfire tile — confirm heal interaction works
6. Check frame time in dev console — confirm sprite rendering adds <1ms
7. Create a test floor with multiple bonfire tiles — confirm all spawn correctly

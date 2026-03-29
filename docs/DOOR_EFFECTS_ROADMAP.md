# Door Effects Roadmap — Visual Transition Polish

> Pre-jam engine work. DoorContractAudio handles the sound side of door
> transitions. This roadmap covers the visual side — making the "door
> opening" moment feel physical and distinct per floor depth.

---

## Current State

Floor transitions are handled by FloorTransition + HUD:

1. DoorOpen SFX plays (delay 0)
2. Pre-fade delay (~350ms) — player hears the door creak
3. `HUD.showFloorTransition(label)` — hard cut to black `<div>` with text
4. Floor generates (sync)
5. 300ms pause
6. `HUD.hideFloorTransition()` — hard cut back to gameplay

This works but feels like a loading screen, not a door. The transition
from "standing in front of a door" to "black screen" is instant with
no visual continuity. The SFX sells the moment; the visuals don't.

---

## Target: Three-Phase Visual Transition

```
Phase 1: APPROACH (during pre-fade delay, ~350ms)
  → Vignette darkens from edges
  → Door tile animates (subtle: brightness pulse or color shift)
  → Camera drift forward (optional: 0.1 tiles toward door)

Phase 2: OVERLAY (during floor generation)
  → Smooth fade to black (CSS transition, not hard cut)
  → Transition label fades in (floor name, direction indicator)
  → Depth-specific visual treatment (see below)

Phase 3: EMERGE (after floor loads)
  → Smooth fade from black
  → Brief vignette lingers at edges (1s ease-out)
  → New floor's fog/palette visible through the fade
```

---

## Depth-Specific Visual Treatments

### Exterior → Interior (depth 1 → 2): "Entering a Building"

- Phase 1: Warm light spill from door tile (brightness increases)
- Phase 2: Fade through warm amber, not pure black
- Phase 3: Interior palette emerges through amber haze
- Feel: crossing a threshold from open air into enclosed warmth

### Interior → Dungeon (depth 2 → 3): "Descending"

- Phase 1: Dark shadow crawls up from bottom of viewport
- Phase 2: Fade to deep black, label text dim and low
- Phase 3: Slow reveal, fog-heavy — dungeon darkness wraps in
- Feel: sinking into the earth

### Dungeon → Interior (depth 3 → 2): "Ascending"

- Phase 1: Bright crack appears at top of viewport (light above)
- Phase 2: Fade through near-white, then settle
- Phase 3: Interior palette blooms from bright center
- Feel: climbing back toward light

### Same-Depth Transition (street ↔ street): "Walking Through"

- Phase 1: Brief flash/pulse on the door tile
- Phase 2: Quick cross-fade (shorter duration, ~200ms)
- Phase 3: Immediate — new street loads fast
- Feel: casual, no drama — just crossing a threshold

---

## New Module: TransitionFX

```
engine/transition-fx.js  (Layer 2, after HUD)
```

Owns the visual overlay canvas that renders transition effects on top
of the 3D viewport. Separate from HUD's simple show/hide div approach.

**Architecture:** A dedicated `<canvas>` element layered over the viewport.
This canvas draws vignettes, fades, and color washes using 2D gradients.
It does NOT touch the raycaster canvas — it's a compositing layer.

### Public API

```javascript
TransitionFX.init(container)

// Start a transition sequence (returns a Promise-like callback chain)
TransitionFX.begin({
  type: 'enter_building',     // preset name
  duration: 800,              // total ms
  fadeColor: { r: 30, g: 20, b: 10 },  // warm amber
  onMidpoint: function () {   // called at peak darkness (floor gen here)
    FloorManager.generateCurrentFloor();
  },
  onComplete: function () {   // called when fully faded in
    _transitioning = false;
  }
});

// Manual control (for custom sequences)
TransitionFX.setVignette(intensity)  // 0 = none, 1 = full black edges
TransitionFX.setFade(opacity, color) // 0 = transparent, 1 = solid color
TransitionFX.clear()                 // reset to transparent
```

### Transition Presets

Each preset defines a timeline of visual states:

```javascript
var PRESETS = {
  enter_building: {
    fadeColor: { r: 40, g: 30, b: 15 },
    phases: [
      { t: 0.0, vignette: 0.0, fade: 0.0 },
      { t: 0.3, vignette: 0.6, fade: 0.2 },    // approach: vignette
      { t: 0.5, vignette: 1.0, fade: 1.0 },    // midpoint: full dark
      { t: 0.7, vignette: 0.8, fade: 0.6 },    // emerge: partial
      { t: 1.0, vignette: 0.0, fade: 0.0 }     // clear
    ]
  },
  descend: {
    fadeColor: { r: 0, g: 0, b: 0 },
    phases: [
      { t: 0.0, vignette: 0.0, fade: 0.0 },
      { t: 0.2, vignette: 0.3, fade: 0.0 },    // shadow creep
      { t: 0.4, vignette: 0.8, fade: 0.5 },    // sinking
      { t: 0.5, vignette: 1.0, fade: 1.0 },    // midpoint
      { t: 0.8, vignette: 0.6, fade: 0.4 },    // slow emerge
      { t: 1.0, vignette: 0.0, fade: 0.0 }
    ]
  },
  ascend: {
    fadeColor: { r: 60, g: 55, b: 50 },
    phases: [
      { t: 0.0, vignette: 0.0, fade: 0.0 },
      { t: 0.3, vignette: 0.4, fade: 0.3 },
      { t: 0.5, vignette: 0.2, fade: 1.0 },    // midpoint: bright
      { t: 0.7, vignette: 0.1, fade: 0.5 },
      { t: 1.0, vignette: 0.0, fade: 0.0 }
    ]
  },
  walk_through: {
    fadeColor: { r: 0, g: 0, b: 0 },
    phases: [
      { t: 0.0, vignette: 0.0, fade: 0.0 },
      { t: 0.4, vignette: 0.3, fade: 0.8 },
      { t: 0.5, vignette: 0.3, fade: 1.0 },    // quick midpoint
      { t: 0.6, vignette: 0.2, fade: 0.6 },
      { t: 1.0, vignette: 0.0, fade: 0.0 }
    ]
  }
};
```

### Rendering

Each frame during a transition, TransitionFX draws on its overlay canvas:

1. **Vignette:** Radial gradient from transparent center to black edges.
   Intensity controls the gradient's alpha and inner radius.
   ```javascript
   var grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
   grad.addColorStop(0, 'rgba(0,0,0,0)');
   grad.addColorStop(1, 'rgba(0,0,0,' + vignetteIntensity + ')');
   ```

2. **Fade:** Full-canvas fillRect with the preset's fadeColor at the
   current opacity.
   ```javascript
   ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + fadeOpacity + ')';
   ctx.fillRect(0, 0, w, h);
   ```

3. **Label text:** Transition label (floor name) drawn at center when
   fade opacity > 0.8 (visible only during peak darkness).

### FloorTransition Integration

FloorTransition.go() currently uses `HUD.showFloorTransition()` and
`setTimeout`. With TransitionFX:

```javascript
function go(targetFloorNum, direction) {
  _transitioning = true;
  MC.cancelAll();

  // Determine preset from depth pair
  var presetName = _resolvePreset(sourceFloorId, targetFloorId, direction);

  // Play door SFX (unchanged)
  AudioSystem.playSequence(sounds);

  // Start visual transition (replaces HUD.showFloorTransition)
  TransitionFX.begin({
    type: presetName,
    duration: 800 + preFadeDelay,
    label: transitionLabel + ' ' + floorLabel,
    onMidpoint: function () {
      // Floor gen happens at peak darkness (same as before)
      FloorManager.setFloorNum(targetFloorNum);
      FloorManager.generateCurrentFloor();
      // ... minimap, HUD updates
    },
    onComplete: function () {
      _transitioning = false;
    }
  });
}
```

---

## DOM Changes

```html
<!-- Inside #viewport, after view-canvas, before hud -->
<canvas id="transition-canvas"></canvas>
```

```css
#transition-canvas {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 15;  /* above combat overlay, below dialog/screens */
}
```

---

## DoorContractAudio Preset Selection

TransitionFX needs to know which visual preset to use. This maps from
the same depth-pair logic DoorContractAudio already uses:

```javascript
function _resolvePreset(srcId, tgtId, direction) {
  var srcDepth = srcId.split('.').length;
  var tgtDepth = tgtId.split('.').length;

  if (srcDepth === 1 && tgtDepth === 2) return 'enter_building';
  if (srcDepth === 2 && tgtDepth === 1) return 'enter_building';  // reverse
  if (srcDepth === 2 && tgtDepth === 3) return 'descend';
  if (srcDepth === 3 && tgtDepth === 2) return 'ascend';
  if (srcDepth === tgtDepth)            return 'walk_through';

  return direction === 'advance' ? 'descend' : 'ascend';
}
```

---

## Estimated Size

- `transition-fx.js`: ~130 lines (canvas, presets, interpolation, render)
- FloorTransition.go() rewrite: ~20 lines (replace setTimeout chain)
- HTML/CSS: ~10 lines
- Total: ~160 lines

---

## What This Replaces

- `HUD.showFloorTransition()` → `TransitionFX.begin()` (with label)
- `HUD.hideFloorTransition()` → handled by TransitionFX.onComplete
- The `#floor-transition` div in index.html becomes unused (can keep as
  fallback for browsers with canvas issues, or remove)

---

## Directional Door/Stair Textures — ✅ IMPLEMENTED

Stair and door tiles now render distinct procedural textures in the 3D
viewport so the player can read direction at a glance — no interaction
needed.

### Texture Inventory

| Texture ID     | Tile Type   | Visual Description |
|----------------|-------------|-------------------|
| `stairs_down`  | STAIRS_DN   | Dark stone with 3 down-pointing chevrons (▼), step-line horizon bands, dim green arrow tint |
| `stairs_up`    | STAIRS_UP   | Lighter stone with 3 up-pointing chevrons (▲), warm amber tint, vertical brightness gradient (lighter at top = "light above") |
| `door_wood`    | DOOR / DOOR_BACK / DOOR_EXIT | Wooden planks with iron bands — neutral (no direction cue needed, handled by DoorAnimator on open) |
| `door_iron`    | BOSS_DOOR (unlocked) | Iron plate with rivet grid — imposing but passable |
| `door_locked`  | BOSS_DOOR (locked) | Wood + iron bands with diagonal chain X-pattern and centered brass padlock. Keyhole detail at lock center. |

### Rendering Path

```
Raycaster hits wall tile
  → SpatialContract.getTexture(contract, tileType) → texId
  → BOSS_DOOR override: if !FloorTransition.isDoorUnlocked() → texId = 'door_locked'
  → TextureAtlas.get(texId) → tex canvas + ImageData
  → Column sampling + fog + brightness
```

All three spatial contract depths (street, interior, nested dungeon) now
map STAIRS_DN→`stairs_down` and STAIRS_UP→`stairs_up` in their texture tables.

### Design Principle

Follows the Doom spatial-contract philosophy already in SpatialContract:
- **Height offset** communicates vertical direction physically (sunken = down, raised = up)
- **Texture pattern** communicates direction symbolically (chevron arrows, color temperature)
- **Both cues together** make direction readable in <0.5s of looking at a tile

---

## Locked Door System — ✅ IMPLEMENTED

BOSS_DOOR tiles now require a key item from the player's inventory to
unlock. This is the first system that imposes a visible change on the 3D
viewport based on inventory state, proving the T0 inventory pipeline
works end-to-end.

### Lock Flow

```
Player faces BOSS_DOOR → presses Interact
  → FloorTransition.tryInteractDoor()
    → _tryUnlockDoor(fx, fy, floorNum)
      ┌─ Already unlocked (flag/cache)? → true (proceed to transition)
      ├─ Player has key-type item?
      │   → Player.consumeItem(key.id)
      │   → Mark unlocked (session cache + Player flag)
      │   → Toast: "🔑 Door unlocked!"
      │   → Audio: 'door_unlock'
      │   → return true (proceed)
      └─ No key?
          → DialogBox.show("The door is locked. You need a key.")
          → Audio: 'bump'
          → return false (interaction consumed, no transition)
```

### Persistence

- **Session cache:** `_unlockedDoors` map in FloorTransition (fast lookup)
- **Player flag:** `boss_door_{floor}_{x}_{y}` persisted in Player.flags
  (survives floor transitions, used to restore unlock state on revisit)

### Viewport Integration

The raycaster checks `FloorTransition.isDoorUnlocked()` per frame for
BOSS_DOOR tiles. Locked doors render the `door_locked` texture (chains +
padlock). Once unlocked, they revert to `door_iron` — the visual change
is immediate and dramatic, confirming the inventory interaction worked.

### Player API Additions

- `Player.hasItemType(type)` — finds first item matching a type across
  bag + equipped slots (used for "do you have ANY key?")
- `Player.consumeItem(id)` — removes and returns an item by ID from bag
  or equipped slots (used for key consumption)

### Key Item Schema

Key items follow the UNIFIED_INVENTORY_METADATA_CONTRACT:
```javascript
{
  id: 'KEY-001',
  type: 'key',
  subtype: 'boss',
  name: 'Iron Key',
  emoji: '🔑',
  description: 'Opens a heavy iron door.',
  rarity: 'uncommon',
  stackable: false
}
```

Keys equip to slot 2 (the key quick-slot) and are consumed on use.
Future: specific doors could require specific key IDs rather than any
key-type item.

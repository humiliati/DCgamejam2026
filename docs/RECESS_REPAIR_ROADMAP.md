# RECESS_REPAIR_ROADMAP.md — Reinstate & Extend the Recessed Tile System

**Status**: Active — repair required before any new raycaster work  
**Priority**: Blocking  
**Scope**: `engine/raycaster.js` only (all other modules survived intact)

---

## 0. Situation

A previous agent session implemented the Wolfenstein thin-wall recess block
for DOOR_FACADE tiles in `engine/raycaster.js`. That code was never committed.
A subsequent trapdoor session rewrote sections of the raycaster and the recess
block was lost. **The recess block is the only casualty.** Every supporting
module is intact and tested:

| Module | Status | Key artifacts |
|---|---|---|
| `engine/door-sprites.js` | INTACT | `facade_door` gap filler (3-band batch), `getExteriorFace()`, `setExteriorFace()`, `getWallTexture()` |
| `engine/spatial-contract.js` | INTACT | DOOR_FACADE freeform config in exterior (line 267) and interior (line 487) constructors |
| `engine/tiles.js` | INTACT | `DOOR_FACADE` (74), predicates: `isDoor`, `isOpaque`, `isWalkable`, `isFreeform` |
| `engine/floor-manager.js` | INTACT | `doorFaces: { '22,27': 3 }` (line 1648), DOOR_FACADE at grid (22,27), `doorTargets` entry |
| `engine/raycaster.js` texture hook | INTACT | Lines 1433–1442 (foreground), 2830–2836 (back-layer) |
| `engine/raycaster.js` back-face exclusion | INTACT | Line 942: `hitTile !== TILES.DOOR_FACADE` |
| `engine/raycaster.js` DoorAnimator skip | INTACT | Line 1469: `hitTile !== TILES.DOOR_FACADE` |

**What is missing**: The ~45-line recess block that belongs between
`perpDist = Math.abs(perpDist);` (line 1214) and the minimum perpDist clamp
`if (perpDist < 0.2) perpDist = 0.2;` (line 1222). No `_recessD`, no
`_facadeJamb`, no inset calculation, no jamb detection, no z-buffer override,
no freeformCfg suppression for jamb columns.

**Git history**: The recess block was never committed. There is nothing to
cherry-pick or revert to. It must be re-implemented from the spec in
`docs/DOOR_ARCHITECTURE_ROADMAP.md` Phase 1.5 (lines 319–379).

---

## 1. Repair: Reinstate the Recess Block

### 1.1 Insertion point

Open `engine/raycaster.js`. Find the perpDist calculation (around line 1208–1214):

```javascript
perpDist = Math.abs(perpDist);   // ← line 1214

// (RECESS BLOCK GOES HERE)

if (perpDist < 0.2) perpDist = 0.2;  // ← line 1222 (current)
```

All new code inserts between these two lines. Nothing else in the raycaster
needs to change for the base repair.

### 1.2 Algorithm (from DOOR_ARCHITECTURE_ROADMAP.md Phase 1.5)

```
1. Guard: hitTile === TILES.DOOR_FACADE
2. Guard: DoorSprites.getExteriorFace(mapX, mapY) === the face the ray hit
   (exterior face only — interior face stays flush)
3. Compute recessed perpDist:
     rayCompMag = (side === 0) ? Math.abs(rayDirX) : Math.abs(rayDirY)
     _rPD = perpDist + _recessD / (rayCompMag || 1e-10)
4. Bounds check: does the ray at _rPD stay within [mapX..mapX+1, mapY..mapY+1]?
   - Compute world hit point: rX = px + _rPD * rayDirX, rY = py + _rPD * rayDirY
   - Check: Math.floor(rX) === mapX && Math.floor(rY) === mapY
5a. YES (inset hit): perpDist = _rPD → door face renders deeper than walls
5b. NO  (jamb hit):  _facadeJamb = true
     - perpDist = distance to the perpendicular tile boundary the ray exits through
     - side flips (0↔1) — the jamb is on the perpendicular axis
```

### 1.3 Downstream propagation of `_facadeJamb = true`

After the recess block, three things must change for jamb columns downstream
in the same column's render path:

1. **freeformCfg = null** — suppress the cavity/lintel gap filler. The jamb is
   solid masonry, not a portal. This prevents the `facade_door` filler from
   painting a dark interior band on a solid wall.

2. **Z-buffer write = perpDist** — jamb columns are fully opaque. The z-buffer
   entry must reflect the jamb distance, not the original (deeper) freeform
   distance. This prevents sprites from bleeding through the jamb.

3. **wallX recalculation** — because `side` flipped (the jamb is on the
   perpendicular axis), the texture U coordinate must be recalculated from
   the new perpDist and flipped side. The existing wallX formula already uses
   `side`, so it will produce the correct value if placed after the recess
   block (verify this — if wallX is calculated before the recess block, move
   it after or recalculate).

### 1.4 Tunable

```javascript
var _recessD = 0.25;  // Quarter-tile depth. Declared near module top or inline.
```

This is a global constant for now. Section 3.2 discusses making it per-tile.

### 1.5 Verification

After insertion:

- Stand in front of Gleaner's Home door (Promenade, grid 22,27) facing north.
  The door face should be visibly recessed behind the adjacent wall plane.
  Jamb walls should be visible on either side.
- Strafe left/right past the door. Parallax should show the door face sliding
  behind the jamb edges — depth is real, not painted.
- Enter the door (press E). Transition should work identically to before —
  the recess is rendering-only, no gameplay change.
- Check from inside Gleaner's Home looking back at the exit. The interior face
  should be flush (no recess). Only the exterior face recesses.

---

## 2. Elegance Improvements (post-repair)

These refinements make the recess implementation cleaner and more robust.
Each is independent — do them in any order after the base repair works.

### 2.1 Extract the face-match into a helper

The "is this the exterior face?" check will be needed by any future recessed
tile type (shop windows, alcoves, etc.). Extract it:

```javascript
// In door-sprites.js or a new recess-utils section:
function isExteriorHit(mapX, mapY, hitSide, stepX, stepY) {
  var extFace = DoorSprites.getExteriorFace(mapX, mapY);
  if (extFace < 0) return false;
  // Convert DDA hit info to face index (0=E,1=S,2=W,3=N)
  var hitFace;
  if (hitSide === 0) hitFace = (stepX > 0) ? 2 : 0;  // ray hit W or E face
  else               hitFace = (stepY > 0) ? 3 : 1;  // ray hit N or S face
  return hitFace === extFace;
}
```

This removes duplicated direction-decoding logic from the hot raycaster loop.
The function is tiny and inlineable by the JIT.

### 2.2 Jamb crossing distance — closed-form

The jamb crossing distance can be computed directly rather than re-stepping:

```javascript
// The ray exits mapX/mapY through the perpendicular boundary.
// Which boundary? The one the ray reaches first on the cross-axis.
if (side === 0) {
  // Original hit was on X-axis (E/W face). Jamb is on Y-axis.
  var yBound = (stepY > 0) ? mapY + 1 : mapY;
  jambDist = Math.abs((yBound - py) / (rayDirY || 1e-10));
} else {
  var xBound = (stepX > 0) ? mapX + 1 : mapX;
  jambDist = Math.abs((xBound - px) / (rayDirX || 1e-10));
}
perpDist = jambDist;
side = 1 - side;  // flip axis
```

This is O(1) — no DDA re-walk needed.

### 2.3 Declare `_facadeJamb` once, reset per-column

Avoid re-declaring `_facadeJamb` inside the DDA loop. Declare it at column
scope (alongside `perpDist`, `side`, `mapX`, `mapY`) and reset to `false`
at the top of each column iteration. This keeps the variable lifetime clear
and avoids stale state if early-exit paths are added later.

### 2.4 Document the recess block with a section comment

Match the raycaster's existing commenting style (each major section gets a
`// ── Section Name ──` banner). Add:

```javascript
// ── DOOR_FACADE recess (Wolfenstein thin-wall offset) ──
```

This makes it findable via grep and visually delineates it from perpDist
calculation above and the min-clamp below.

---

## 3. Architectural Extensions

The recessed tile system is not just for doors. The same perpDist-inset +
jamb-detection pattern generalizes to any tile that should render at a
different depth than the surrounding wall plane. These are future uses that
the implementation should be designed to accommodate.

### 3.1 Shop windows (WINDOW_FACADE)

A future tile type for storefronts along the Promenade and Lantern Row.
Same technique as DOOR_FACADE recess, but the gap filler renders a window
(glass pane with mullions, warm interior light glow) instead of a dark
portal. The jamb walls are identical — masonry flanking a recessed opening.

The recess block should check `TILES.isFreeform(hitTile)` + a
`DoorSprites.getExteriorFace()` entry rather than hardcoding
`hitTile === TILES.DOOR_FACADE`. This makes the recess apply to any
freeform tile that has an exterior face registered.

### 3.2 Per-tile recess depth

Stone fortress doors should recess deeper (0.35) than wooden shack doors
(0.15). The recess depth should eventually come from the freeform config in
SpatialContract:

```javascript
// In spatial-contract.js (future):
74: { hUpper: 2.20, hLower: 0.00, fillGap: 'facade_door', recessD: 0.25 }
```

The raycaster reads `freeformCfg.recessD` if present, falls back to the
global `_recessD = 0.25`. This is a one-line change once the base system
works: `var depth = (freeformCfg && freeformCfg.recessD) || _recessD;`

### 3.3 Alcoves and display niches

Recessed wall segments that don't have a door — just a shallow nook for
a torch, shrine, or loot pedestal. Same recess math, different gap filler
(render the back wall of the alcove with a flat color or texture instead
of a door portal). The jamb rendering is identical.

### 3.4 Recessed staircases

The existing TRAPDOOR_DN/UP tiles are floor hatches (vertical transition).
A future STAIR_FACADE tile could represent a recessed stairwell entrance
in a wall — visible depth into the stairwell before the player transitions.
The recess provides the visual depth cue; the gap filler renders descending
steps or a dark shaft.

### 3.5 Building depth variation across biomes

Different biomes have different wall thicknesses:

- **The Promenade** (floor "1"): Boardwalk shops, thin wooden walls → `recessD: 0.15`
- **Lantern Row** (floor "2"): Brick commercial buildings → `recessD: 0.25`
- **Future fortress/castle floors**: Thick stone walls → `recessD: 0.35`

This sells the material language of each biome without any new rendering
code — just different constants in SpatialContract.

### 3.6 Double-width recess (archway variant)

Two adjacent DOOR_FACADE tiles with the same exterior face create a wide
recessed opening. The raycaster handles each column independently, so this
already works — both tiles recess by the same amount, producing a seamless
wide arch. The gap fillers need to detect adjacency to suppress the inner
jamb (the shared boundary between the two tiles). This is a gap-filler
concern, not a raycaster concern.

---

## 4. Checklist for the Repair Agent

Read this section as your task list. Do these steps in order.

- [ ] **READ** `engine/raycaster.js` lines 1200–1240 to confirm the insertion point
- [ ] **READ** `engine/door-sprites.js` lines 55–90 to confirm `getExteriorFace()` API
- [ ] **IMPLEMENT** the recess block per Section 1.2, inserting after line 1214
- [ ] **IMPLEMENT** the downstream propagation per Section 1.3 (freeformCfg null, z-buffer, wallX)
- [ ] **VERIFY** `_facadeJamb` is declared at column scope and reset per-column (Section 2.3)
- [ ] **VERIFY** the section comment is present (Section 2.4)
- [ ] **DO NOT** touch any other module — door-sprites, spatial-contract, tiles, floor-manager are all intact
- [ ] **DO NOT** modify the existing texture hook (lines 1433–1442), back-face exclusion (line 942), or DoorAnimator skip (line 1469) — they are correct
- [ ] **DO NOT** add trapdoor logic, new tile types, or any feature beyond the recess restoration
- [ ] **COMMIT** immediately after the repair is verified working

### What "working" looks like

The Promenade has one DOOR_FACADE tile at grid (22,27) with exterior face 3
(north-facing, toward the street). When the player stands south of this
position and looks north, the door face should be visibly set back from the
adjacent wall columns, with solid masonry jamb strips flanking the opening.

---

## 5. Post-Repair: Update DOOR_ARCHITECTURE_ROADMAP.md

After the repair is committed, update the Phase 1.5 status note (line 375–376)
from the false "Complete" claim to an honest status:

```
**Status**: Re-implemented after loss during trapdoor session. Committed [hash].
```

Also update Open Question #8 (line 520–523) about file truncation — mark it
resolved, noting the recess block was the actual casualty, not truncation.

---

## 6. Scope Boundary

This roadmap covers ONE thing: getting the recess block back into
`raycaster.js`. The elegance improvements (Section 2) and architectural
extensions (Section 3) are documented for future reference but are **not**
part of the repair task. The repair agent should implement Section 1, verify
it works, commit, and stop.

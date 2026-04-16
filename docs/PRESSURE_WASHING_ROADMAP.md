# Pressure Washing Roadmap

**Created**: 2026-04-01 | **Status**: Draft for designer evaluation
**Prerequisite**: Sprint 0 (CardAuthority/CardTransfer) — nozzle items flow through inventory
**Depends on**: CleaningSystem (exists), Raycaster (exists), MinimapNav (exists), Pathfind (exists), HeroSystem (exists), BonfireSprites pattern (exists), InteractPrompt (exists)

---

## 1. Design Vision

The player carries a pressure hose through dungeons. The hose is a physical line that trails behind, records the player's path, costs fatigue to drag, enables sub-tile grime cleaning on walls and floors, and provides a "roll up hose" auto-exit that retraces the hose path back to the truck. The hose is optional — players who skip it can still do basic tile-level scrubbing with rags/mops, but the hose unlocks the full cleaning system (sub-tile grime grids, beam shaping via nozzle items, efficient wall cleaning).

**Core fantasy**: You are a secretive hazmat operative winding a hose through a dungeon, methodically pressure-washing blood off walls while a hero's carnage is still warm. When you're done (or too exhausted), you hit "roll up hose" and the line reels itself in as you retrace your route back to the truck.

---

## 2. The Hose Object — Pickup, State, and Lifecycle

### 2.1 Cleaning Truck (Hero Day spawn)

Some days of the week are associated with a Hero Day - the different hero types are represented by a suit symbol on the weekly timeline counter. On Hero day the heros ravage the dungeon(s) associated with that hero group. ( example: spade hero ravages spade dungeon(s) on spade-tuesday . club hero ravages club dungeons(s) on club-friday) the player represents the heart faction, heart dungeons don't get hero days (yet) because going to war with home faction becomes a choice for ~act 2 - player becomes the hero ravager of heart dungeons with perks on heart days. 
Each building associated with that day of the week's hero rotation that has a nested dungeon (depth ≥ 3 child) spawns a **Cleaning Truck** on the parent exterior floor near the building entrance door.

**Truck spec:**
- 2 tiles wide × 1 tile tall, placed adjacent to the building's DOOR tile
- Visual: blacked-out tiles (solid dark texture, like BPRD garbage truck)
- One tile of the truck has a **cutout** (same pattern as HEARTH — a sprite embed slot)
- Inside the cutout: gently bobbing 🧵 emoji (BonfireSprites-style billboard, ~0.3 scale, bob freq ~2Hz)
- InteractPrompt: `[OK] 🧵 Grab Hose`

**Spawn logic** (significantly extends HeroSystem, uses stubbed hud elements):
- `HeroSystem.isHeroDay()` already exists → on hero day morning, `CleaningTruck.spawn(buildingFloorId, doorTileX, doorTileY)` places the truck tiles
- Truck tiles: new TILES constant `TILES.TRUCK` (non-walkable) + `TILES.TRUCK_HOSE` (non-walkable, interactive cutout)
- Truck despawns at end of hero day (DayCycle callback)

### 2.2 Hose Pickup (HosePeek)

Following the existing peek pattern (CratePeek, CorpsePeek, BedPeek):
- Player faces TRUCK_HOSE tile → InteractPrompt shows `[OK] 🧵 Grab Hose`
- OK press → `HosePeek.open()` shows a brief confirmation (hose reel animation or simple text)
- On confirm → `HoseState.attach(buildingFloorId)` applies the dragging-hose state to the player, peek goes away

### 2.3 HoseState — Persistent Dragging State (needs lots of hooks for items to adjust stats)

```
HoseState = {
  active: false,
  originBuildingId: "2.2",     // which building's truck we grabbed from
  originFloorId: "2",          // exterior floor where truck lives
  path: [{x, y, floorId}],    // breadcrumb trail (one entry per tile visited)
  kinkCount: 0,                // number of self-crossings
  maxFloorDepth: 3,            // how many floors into building hose survives
  floorsTraversed: 0,          // floors entered since pickup
  fatigueDrain: 0              // accumulated fatigue cost
}
```

**Survival rules:**
- Hose survives descending into the building adjacent to the truck (the building whose entrance is next to the truck)
- Hose survives descending through sub-floors of that building (2.2 → 2.2.1 → 2.2.2)
- Hose **cancels** if the player enters a different building (walks to 1.1 instead of 2.2) — wrong building, hose snaps
- Hose cancels if player ascends back to exterior without using "roll up hose" (just walking out drops it)
- Hose cancels when taking combat damage (can enter combat and flee safely ~most of the time~ )
- On floor transition, `path` continues accumulating across floors
- Dungeon crossing (example from 2.2.3 secret exit to 3.2.1 or 3.2 or 3 ) 
- Bonfires waypoints cancel hose (example 2.2.3 to 2.2 via bonfire fast travel) 
 
### 2.4 Fatigue Cost

Carrying the hose drains fatigue per tile moved via `Player.drainHoseFatigue(drain)`.
(the following probably needs rebalancing pass based on actual dungeon dimensions when we're closer to deployment):

```
drainPerTile = BASE_DRAIN + (path.length * LENGTH_PENALTY) + (kinkCount * KINK_PENALTY)
```

- `BASE_DRAIN`: 1.0 fatigue per tile
- `LENGTH_PENALTY`: 0.1 fatigue per tile of existing hose length (longer hose = heavier drag)
- `KINK_PENALTY`: 0.5 fatigue per kink (crossed paths compound)
- When fatigue hits max (100) → forced "roll up hose" (auto-exit, cannot continue deeper)
- Equipment modifiers (`hoseFatigueModifier`) and status effects (`StatusEffect.getHoseFatigueMult()`) scale the drain multiplicatively

Fatigue is read from `Player.getFatigue()` / `Player.getMaxFatigue()`. See FATIGUE_SYSTEM_ROADMAP.md.

---

## 3. Hose Path — Trail and Kink Detection

### 3.1 Path Recording

Every time `MC.onMoveFinish(x, y, dir)` fires while `HoseState.active`:
- Push `{x, y, floorId: currentFloorId}` to `HoseState.path`
- Check for kink (see 3.2)

### 3.2 Kink Detection

A **kink** occurs when the player steps onto a tile that already exists in `HoseState.path` on the current floor.

```javascript
var key = x + ',' + y;
if (_visitedSet[key]) {
  HoseState.kinkCount++;
  // Toast: "Hose kinked! Pressure reduced."
}
_visitedSet[key] = true;
```

**Effect of kinks:**
- Each kink applies a stacking multiplier to cleaning speed: `pressureMult = Math.pow(0.7, kinkCount)`
- 1 kink = 70% pressure, 2 kinks = 49%, 3 kinks = 34%
- Visual feedback: beam sprite flickers/sputters when kinked
- Kinks are permanent for the current hose session (can't unkink without rolling up)

### 3.3 Minimap Hose Rendering

> **Superseded 2026-04-16 by Rungs 2A/2B in `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` §9.** The polyline-of-connected-tiles description below is retained as historical context; the shipped implementation is a per-tile edge-midpoint stripe renderer backed by a visit ledger (`HoseDecal`). See the brief for current behavior and the test harness covering it (`outputs/hose-overlay-test.js`, 27/27).

**Original plan (historical):** The hose path renders on the minimap as a colored line (e.g., yellow-green) connecting visited tiles. Kink points render as red dots. This uses the existing `Minimap.drawOverlay(ctx)` extension point or a new `HoseOverlay.draw(ctx, renderParams)` called after minimap base render.

**Shipped plan (Rungs 2A + 2B):**

- **`HoseDecal` (Layer 1 data module, Rung 2A)** — per-tile visit ledger keyed by `floorId → "x,y" → { visits[{entryDir, exitDir, visitIndex}], crossCount }`. Wires itself to `HoseState` events (`attach`, `step`, `detach`, `pop`, `kink`) to record entry/exit direction pairs for every tile the hose crosses, with a monotonic `visitIndex` for head-of-hose queries. Direction constants match the project convention (0=E, 1=S, 2=W, 3=N). Public API: `getVisitsAt`, `isCrossed`, `iterateFloorVisits`, `getHead`, `getTileCount`, `getVersion`, `clearFloor`, `rebuildFromState`, `debugSnapshot`, `reset`. 35/35 tests pass.
- **`HoseOverlay` (Layer 2, Rung 2B rewrite)** — consumes the ledger and renders each tile as one or more **edge-midpoint stripes** rather than a tile-centroid polyline. Dispatch table covers 6 visit shapes:
  - `(entry=null, exit=null)` → seed dot at tile center (origin marker)
  - `(entry=null, exit=D)` → center → edge-mid(D) half-stub (start of path)
  - `(entry=D, exit=null)` → edge-mid(D) → center half-stub + head pulse halo
  - `(entry=D, exit=opposite(D))` → straight stripe across the tile
  - `(entry=D, exit=D)` → cubic-Bézier self-loop U-turn (depth 0.85, splay 0.75)
  - otherwise → quadratic-Bézier 90° elbow with control at tile center
  
  Crossed tiles (visit count ≥ 2) render the base stripes plus an X diagonal in `CROSS_COLOR` (`rgba(80,200,255,0.85)`). Head pulse uses a sine-cycled halo (~0.9s) in `HEAD_HALO_BASE`. Legacy polyline fallback retained for the case where `HoseDecal` is absent.
- **Seamless joints:** the edge-midpoint convention guarantees tile A's east-mid coincides with tile B's west-mid (and south↔north symmetrically), so adjacent visit shapes butt together with no sub-pixel gap or doubled endpoint — verified by an adjacency-invariant assertion in the test harness.
- **Kink markers:** still planned but deferred to Rung 2D (tile-step awareness); the visit ledger already carries enough shape information that we can render them as a state overlay on top of any visit type without extra event plumbing.

---

## 4. "Roll Up Hose" — Reel-In Auto-Exit

### 4.1 Mechanic

Player presses a dedicated button (or selects from interact menu) to begin rolling up the hose. This:

1. Locks manual movement input
2. Reverses `HoseState.path` into a movement queue
3. Feeds the reversed path into `MovementController` step by step
4. Player paths normally — faces the direction of travel as each step advances
5. As each tile is traversed, the hose path shrinks (visual: minimap line retracts)
6. On reaching the truck tile (or building entrance), hose state clears

### 4.2 Implementation — Repurposing MinimapNav

The existing `MinimapNav._advance()` loop already handles step-by-step queued movement via MC. For roll-up:

```javascript
HoseReel = {
  start: function() {
    var reversedPath = HoseState.path.slice().reverse();
    _reelPath = reversedPath;
    _reelActive = true;
    _advance();  // kick off first step
  },
  _advance: function() {
    if (!_reelPath.length) { _arrive(); return; }
    var next = _reelPath.shift();
    // Calculate direction FROM current TO next (retracing the hose path)
    var dx = next.x - MC.getGridPos().x;
    var dy = next.y - MC.getGridPos().y;
    var moveDir = _deltaToDir(dx, dy);
    // Face the direction of travel — normal pathing
    MC.startTurn(moveDir);
    MC.startMove(moveDir);
    // HoseState.path.pop() — shrink hose as we retract
  }
};
```

Key difference from MinimapNav click-to-move:
- Path is predetermined (the hose breadcrumb), not computed by Pathfind
- Hose path visually retracts on minimap as player reels
- Cannot be interrupted by clicking (commitment — you chose to leave)
- Can be interrupted by combat encounter (enemy blocks path)

### 4.3 Floor Transition During Reel

If the reversed path crosses a floor transition (STAIRS_UP, DOOR_EXIT):
- FloorTransition fires normally
- Reel resumes on the parent floor using the remaining path entries for that floor
- Each floor's segment of `HoseState.path` is tagged with `floorId` so we know where to resume

### 4.4 MinimapNav Click-to-Move Distance Gate

Once reel-in is verified working, minimap click-to-move gets a **minimum distance gate**:

```javascript
// In MinimapNav._onClick():
var dist = Math.abs(targetX - pos.x) + Math.abs(targetY - pos.y); // Manhattan
var minDist = 5 + (Player.getItemBonus('minimapRange') || 0);
if (dist < minDist) return; // Too close — click ignored
```

- Default minimum: **5 tiles** Manhattan distance
- Items can reduce this (e.g., "Pathfinder's Compass" gives +N to effective range, lowering the gate)
- This makes minimap clicking a strategic jump for navigating known territory, not a lazy one-tile shortcut
- "Roll up hose" bypasses this gate entirely (it's a hose mechanic, not a minimap click)

---

## 5. Sub-Tile Grime Grid

### 5.1 Architecture

Each tile that has grime gets a small resolution grid tracking cleanliness at sub-tile precision.

**Two resolutions by surface type:**
- **Floor tiles**: 4×4 grid (16 cells) — player can't aim at floors precisely with first-person camera, so coarse is fine. Cleaning floors is a "walk over and spray down" action.
- **Wall tiles**: 16×16 grid (256 cells) — walls are the tactile, juicy surface. Player turns to face a wall, aims the cursor, and scrubs. Higher density = more satisfying reveal.

**Data structure:**
```javascript
// Per-tile grime grid, allocated lazily when hero carnage dirties a tile
GrimeGrid = {
  _grids: {},  // keyed by "floorId:x,y" → Uint8Array(N*N)

  allocate: function(floorId, x, y, resolution, initialLevel) {
    var key = floorId + ':' + x + ',' + y;
    var grid = new Uint8Array(resolution * resolution);
    grid.fill(initialLevel);  // 0=clean, 255=fully dirty
    _grids[key] = { data: grid, res: resolution };
  },

  clean: function(key, subX, subY, strength) {
    var g = _grids[key];
    var idx = subY * g.res + subX;
    g.data[idx] = Math.max(0, g.data[idx] - strength);
  },

  getTileCleanliness: function(key) {
    // Returns 0.0 (fully dirty) to 1.0 (fully clean)
    // Sum of clean cells / total cells
  }
};
```

### 5.2 Grime Placement (Hero Carnage Integration)

When `HeroSystem.applyCarnageManifest()` dirties tiles:
- Currently sets blood level via `CleaningSystem.addBlood()`
- Extended: also calls `GrimeGrid.allocate(floorId, x, y, resolution, level)` for each dirtied tile
- Floor tiles get 4×4 grids, wall tiles adjacent to dirtied floors get 16×16 grids
- Grime level correlates with hero type: Seeker = heavy (200–255), Shadow = light (80–140)

### 5.3 Rendering — Translucent Tint Overlay

Grime renders as a **single semi-transparent color** (dark red-brown) with per-subcell opacity derived from the grime value. This is cheap and jam-scopable.

**Wall columns** (raycaster wall draw loop):
```javascript
// After drawing the texture column, overlay grime
if (grimeGrid) {
  var subX = Math.floor(wallHitU * grimeGrid.res);
  var subY = Math.floor(columnV * grimeGrid.res);
  var grime = grimeGrid.data[subY * grimeGrid.res + subX];
  if (grime > 0) {
    var alpha = (grime / 255) * 0.6;  // max 60% opacity
    // Tint this pixel toward grime color
    r = r * (1 - alpha) + GRIME_R * alpha;
    g = g * (1 - alpha) + GRIME_G * alpha;
    b = b * (1 - alpha) + GRIME_B * alpha;
  }
}
```

**Floor pixels** (raycaster floor cast loop):
```javascript
// Same approach but with 4×4 resolution
var subX = Math.floor(floorFracX * 4);
var subY = Math.floor(floorFracY * 4);
// ... same alpha blend
```

This integrates into the existing per-pixel loops in raycaster.js where floor blood tinting already happens (lines 831–841). Wall grime is new — added to `_drawTiledColumn()` or the column pixel loop.

---

## 6. Beam / Spray Interaction

### 6.1 Aiming

The player aims the pressure washer at the tile they're facing (same as interact prompt targeting). The **crosshair** indicates which wall or floor tile is targeted.

- **Wall targeting**: Player faces a wall tile 1 tile away → crosshair on wall → spray cleans sub-cells at the aimed UV coordinate
- **Floor targeting**: Player faces a floor tile 1 tile ahead (across from player) → spray cleans the full 4×4 grid progressively

While spraying (hold button):
- The aimed subcell and a **brush kernel** of neighbors get cleaned per tick
- Brush shape and size depend on equipped nozzle

### 6.2 Brush System (Nozzle-Driven)

The spray's effect on the grime grid is a **procedural brush** — not geometry.

**Base brush** (no nozzle / default):
```javascript
// Clean a 3×3 kernel centered on aimed subcell
for (dy = -1; dy <= 1; dy++) {
  for (dx = -1; dx <= 1; dx++) {
    GrimeGrid.clean(key, subX + dx, subY + dy, strength * falloff(dx, dy));
  }
}
```

**Fan nozzle** (`nozzle.fan`):
- Wide horizontal brush (1×5 kernel on walls, 1×3 on floors)
- High efficiency for broad sweeps
- Weak on corners/edges

**Cyclone nozzle** (`nozzle.cyclone`):
- Offset oscillates over time: `ox = sin(time * freq) * amp`
- Creates spiral cleaning pattern — misses some subcells, catches others
- Good for irregular grime patterns
- Optional: reveals hidden marks only visible in cyclone mode

### 6.3 Pressure and Kink Effect on Cleaning

Cleaning strength is modified by hose state:

```javascript
var effectiveStrength = BASE_STRENGTH * pressureMult * nozzleEfficiency;
// pressureMult = pow(0.7, kinkCount)
// nozzleEfficiency from equipped nozzle item
```

Without hose (using rag/mop): cleaning is per-tile only (existing CleaningSystem behavior), no sub-tile precision. The hose unlocks the sub-tile system.

---

## 7. Torch Extinguish via Hose

### 7.1 Interaction

Spraying a lit torch tile (TORCH_LIT) or a tile **adjacent** to a lit torch while the hose is active triggers a pressure-wash extinguish:

1. Flame slot → `'empty'` (fire knocked out, no hydration)
2. Any `fuel_dry` slots → `'empty'` (water blast ruins dry fuel)
3. `fuel_hydrated` slots survive (already wet, water doesn't harm them)
4. Tile flips TORCH_LIT → TORCH_UNLIT
5. Light source removed from `Lighting.removeLightSource(x, y)`
6. Toast: "💨 Torch doused — fuel soaked"

### 7.2 Why This Is Intentionally Inferior

Pressure washing torches is the **fast, careless** path. Compared to opening TorchPeek and carefully dragging a water bottle onto the flame slot (which hydrates fuel and preserves slot contents), the hose:

- Destroys dry fuel (slots that could have been hydrated become empty)
- Yields zero fuel hydration (water bottle method hydrates on extinguish)
- Results in lower torch readiness score (empty slots vs hydrated slots)

This creates a **knowledge reward loop**: players who read in-game books learn that careful TorchPeek interaction with matched biome fuel maximizes readiness. Players who spray everything still progress — just with lower scores and less payout.

### 7.3 Adjacent Splash

The hose spray hits the aimed tile AND checks one tile in each cardinal direction for TORCH_LIT. This means spraying a blood-stained floor next to a lit torch extinguishes the torch as collateral. The player may not even realize they knocked out a torch while cleaning a floor — reinforcing the "hose is powerful but sloppy" theme.

### 7.4 Dependencies

This interaction requires **both** systems to be built:
- **LIGHT_AND_TORCH Phase 3a** (torch slot model) — torches must have slots to modify
- **PW-3** (spray interaction) — spray targeting and brush system must exist

Implementation order: LIGHT_AND_TORCH Phase 3a (slot model) ships first → PW-3 (spray) ships → torch-hit detection wired as part of PW-3 or as a small follow-up step.

---

## 8. Nozzle Items

Nozzles are inventory items (flow through CardAuthority after Sprint 0). Two nozzles for jam:


| Item | ID | Effect | Acquisition |
|------|----|--------|-------------|
| Fan Nozzle | `nozzle_fan` | Wide horizontal brush, +40% floor efficiency | Shop (Floor 2.1) |
| Cyclone Nozzle | `nozzle_cyclone` | Oscillating brush, reveals hidden grime, -20% wall efficiency | Dungeon loot (2.2.1+) |

Post-jam nozzles: Prism Nozzle (multi-target split), Turbo Nozzle (narrow + fast), Sundog Nozzle (alignment window mechanic from brainstorm).

Nozzle equip: player equips one nozzle at a time via inventory. Unequipped = default circular brush.

---

## 9. Readiness Score Integration

CleaningSystem already feeds a readiness score (`clean 30%` weight in Phase C5). Sub-tile grime integrates:

```javascript
// Per-tile cleanliness = GrimeGrid.getTileCleanliness(key)
// If no grime grid (no hose / tile not sub-tiled): use existing binary blood level
// If grime grid exists: use fractional cleanliness (0.0–1.0)
```

This means hose users get more granular readiness progress (cleaning 60% of subcells = 60% tile credit), while non-hose users still use the existing blood-layer system.

---

## 10. Module Plan

### New Modules

| Module | Layer | File | Depends On | Purpose |
|--------|-------|------|------------|---------|
| GrimeGrid | 1 | `engine/grime-grid.js` | TILES | Sub-tile grime data per tile |
| HoseState | 1 | `engine/hose-state.js` | — | Hose attachment, path, kink tracking, fatigue drain |
| HoseReel | 3 | `engine/hose-reel.js` | HoseState, MovementController, FloorTransition | Roll-up auto-exit (retraces hose path) |
| HosePeek | 3 | `engine/hose-peek.js` | HoseState, InteractPrompt | Truck interaction → attach hose |
| CleaningTruck | 3 | `engine/cleaning-truck.js` | HeroSystem, TILES, BonfireSprites pattern | Spawn/despawn truck + hose sprite on hero day |
| HoseOverlay | 2 | `engine/hose-overlay.js` | HoseState, Minimap | Draw hose path + kink dots on minimap |

### Modified Modules

| Module | Changes |
|--------|---------|
| `cleaning-system.js` | Add wall tile tracking, integrate GrimeGrid for sub-tile cleaning, hose-gated sub-tile mode |
| `raycaster.js` | Add grime tint to wall column loop (`_drawTiledColumn`), update floor pixel loop to use GrimeGrid |
| `minimap-nav.js` | Add minimum distance gate (5 + itemBonus), skip gate during HoseReel |
| `hero-system.js` | Extend `applyCarnageManifest` to allocate grime grids on dirtied tiles + adjacent walls |
| `interact-prompt.js` | Add TRUCK_HOSE to ACTION_MAP |
| `tiles.js` | Add TRUCK, TRUCK_HOSE constants |
| `movement.js` | Fire HoseState.recordStep on onMoveFinish when hose active |
| `game.js` | Wire HoseState/HoseReel/CleaningTruck/HosePeek/HoseOverlay, spray input binding |
| `index.html` | 6 new script tags in correct layers |

### Deleted / Not Used

| Module | Reason |
|--------|--------|
| EyesOnly `ropeManager.js` | Designed for temporary lever-pull interactions (deploy→resolve→consume). Not a persistent trail system. The hose needs continuous path recording, cross-floor survival, and retracing reel-up — none of which RopeManager provides. MinimapNav + Pathfind + MC already have the movement queue infrastructure we need. |

---

## 11. Execution Plan

> **Status as of 2026-04-16.** Phases PW-1, PW-2, and PW-3 shipped during the jam; the text below is retained as historical plan-of-record. Post-jam work has been re-scoped around the **Rung ladder in `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` §5 and §11.7** — see that table for current hour estimates and ship gates. PW-4 / PW-5 as originally scoped are superseded by Rungs 8 / 9 respectively, with Rungs 1–2F and 3–7 landing ahead of them. Quick map:
>
> | Original phase | Current status | Replacement / successor |
> |---|---|---|
> | PW-1 (grime grid + raycaster) | Shipped | — |
> | PW-2 (hose state + truck) | Shipped | — |
> | PW-3 (spray + brush + torch hit) | Shipped | — |
> | — | — | **Rung 1** (spray droplet FX) ✓ shipped |
> | — | — | **Rung 2A** (HoseDecal ledger) ✓ shipped |
> | — | — | **Rung 2B** (minimap stripes) ✓ shipped |
> | — | — | Rungs 2C–2F (3D decals → flow-squeeze → procgen contracts) |
> | — | — | Rung 3 (material-aware audio) |
> | — | — | Rung 4 (sub-target readout — Loop B) |
> | — | — | Rungs 5–7 (GyroInput + brush-shape signals + thrust boost) |
> | PW-4 (reel-up auto-exit) | Superseded | **Rung 8** (lands after 2F so the decal retracts visibly in 3D) |
> | PW-5 (nozzles + readiness + regression) | Superseded | **Rung 9** (nozzle real-identity with Signals 2/4 wired) + Rung 10 (adaptive feel) |
>
> The hour estimates below are the original pre-jam budget and are **not** being tracked against new work. Current estimates live in the brief's §11.7 table (2A=2h · 2B=2h · 2C=1 day · 2D=3h · 2E=1 day · 2F=1 day + tuning), with Rungs 3–10 re-scoped after 2F lands.

### Phase PW-1: Grime Grid + Raycaster Integration (3h) — **SHIPPED**

1. `grime-grid.js` — Uint8Array per tile, allocate/clean/query API, dual resolution (4×4 floor, 16×16 wall)
2. Raycaster wall grime — tint wall columns using grime subcell lookup in `_drawTiledColumn`
3. Raycaster floor grime — replace existing per-tile blood tint with grime grid lookup (backward compatible: no grid = use old blood alpha)
4. HeroSystem integration — `applyCarnageManifest` allocates grime grids on affected tiles

**Depends on**: Nothing (can start immediately on existing codebase)
**Unblocks**: PW-2 (need renderable grime before spray makes sense)

### Phase PW-2: Hose State + Truck Spawn (2.5h) — **SHIPPED**

1. `hose-state.js` — attach/detach, path recording, kink detection, fatigue drain calc, building validation
2. `cleaning-truck.js` — hero day spawn logic, TRUCK/TRUCK_HOSE tiles, bobbing 🧵 sprite inside truck panel using the **sprite-inside-wall technique** (see LIGHT_AND_TORCH_ROADMAP §2.5a): alpha-transparent cutout in `truck_panel` texture + cavity pre-fill + hose decor sprite with faint blue-white glow when pressurized
3. `hose-peek.js` — interaction prompt, attach confirmation
4. `tiles.js` + `interact-prompt.js` updates
5. Wire `MC.onMoveFinish` → `HoseState.recordStep` in game.js

**Depends on**: PW-1 (grime exists to clean), HeroSystem (hero day detection)
**Unblocks**: PW-3 (need hose attached before spray/reel)

### Phase PW-3: Spray Interaction + Brush System + Torch Hit (3h) — **SHIPPED**

1. Spray input binding — hold button while facing grime tile → continuous cleaning
2. Brush kernel system — base circular brush, apply to grime grid at aimed UV
3. Fan nozzle brush (wide horizontal) + Cyclone nozzle brush (oscillating offset)
4. Pressure multiplier from kink count
5. Non-hose fallback — rag/mop still do per-tile cleaning (existing behavior, no sub-tile)
6. **Torch extinguish on spray** — when spray hits TORCH_LIT tile or adjacent tile: flame slot → empty, fuel_dry slots → empty, tile flips to TORCH_UNLIT, light source removed. Zero fuel hydration. (See §7)

**Depends on**: PW-1 (grime grid), PW-2 (hose state for pressure calc), **LIGHT_AND_TORCH Phase 3a** (torch slot model must exist for torch-hit to modify slots)
**Unblocks**: PW-4 (need spray working before reel-up makes sense as exit)

### Phase PW-4: Hose Reel + MinimapNav Gate (2h) — **SUPERSEDED → Rung 8**

> This phase is now **Rung 8** in the brief's §5 ladder. Scope is unchanged (reverse path → MC queue → MinimapNav distance gate → fatigue-forced trigger) but the landing now comes **after** Rungs 2C–2F so the 3D floor decal retracts visually as the player reels — a satisfaction axis PWS cannot offer. The original prose below remains the functional spec for the reel mechanic; the minimap overlay sub-task is already covered by Rung 2B's shipped HoseOverlay rewrite.

1. `hose-reel.js` — reverse path, feed to MC, normal forward pathing, floor transition handling
2. `hose-overlay.js` — minimap hose path line + kink dots
3. MinimapNav distance gate — reject clicks within 5+itemN tiles
4. Wire "roll up hose" to input (button or interact menu option)
5. Fatigue exhaustion → forced reel trigger

**Depends on**: PW-2 (hose path exists), PW-3 (spray working, game flow proven)
**Unblocks**: PW-5 (full system operational for testing)

### Phase PW-5: Nozzle Items + Polish + Regression (2h) — **SUPERSEDED → Rung 9 (+ Rung 10)**

> Nozzle identity work now lives in **Rung 9** with real per-nozzle feel tied to gyro Signals 2 (roll-shaped brush) and 4 (thrust boost). Readiness score integration and regression sweeping roll into Rung 9's ship gate. **Rung 10** handles the adaptive-feel histogram (Signal 6) as a post-everything tuning pass. The CardAuthority registration, equipped-slot lookup, and loot table wiring described below are still the functional spec — what changes is that per-nozzle behavior is defined by the Signal 2/3/4 hooks rather than by static kernel constants.

1. Register `nozzle_fan` and `nozzle_cyclone` in CardSystem registry + loot tables
2. Equip slot integration (CardAuthority equipped zone)
3. Brush modifier lookup from equipped nozzle
4. Readiness score integration (GrimeGrid fractional cleanliness → CleaningSystem)
5. Regression test: existing rag/mop cleaning still works, hero day spawn/despawn, reel across floors, kink stacking, fatigue forced exit

**Depends on**: PW-1 through PW-4, Sprint 0 (CardAuthority for nozzle items)

### Total (original pre-jam budget): ~12.5h

**Actual jam spend on PW-1 through PW-3**: tracked in session logs, not re-estimated here. Post-jam work tracked in `PRESSURE_WASHING_PWS_TEARDOWN_BRIEF.md` §11.7.

---

## 12. Post-Jam Vision (Not Jam Scope)

These ideas from the brainstorm are explicitly deferred:

- **Saddle mirror / sundog alignment mechanic** — continuous theta-driven beam deformation with helix→flat→split transitions. Requires custom beam rendering (polyline/ribbon), volumetric fog overlay, and phase-memory tiles. Excellent post-jam signature mechanic.
- **Prism Nozzle** — multi-target split beam revealing hidden symbols
- **Hose passive cleaning** — tiles under the hose path get slight passive cleaning
- **Re-contamination** — crossing your own hose transfers grime back
- **Flow direction attenuation** — cleaning stronger away from source
- **Sub-tile grime regrowth** — uncleaned tiles slowly re-dirty
- **Phase-locked grime** — certain grime types only cleanable in specific beam modes
- **LG Magic Remote gyroscope** — gyro-driven aim for spray targeting
- **Smoke/fog volumetric pass** — screen-space additive fog layer showing beam path
- **Per-pixel residual streaking** — gradient trails from cleaning showing water flow
- **Torch extinguish via hose reveals hidden sigils** — sundog beam mode only

---

## 13. Cross-References

- **LIGHT_AND_TORCH_ROADMAP (DOC-31)**: Phase 3 (torch slot model) is a hard dependency for §7 (torch extinguish via hose). Phase 3c explicitly documents the pressure-wash extinguish path and its inferior readiness outcome. Phase 1 (dynamic lights) + Phase 2 (torch tiles) must exist before torch-hit detection can fire in PW-3.
- **INVENTORY_CARD_MENU_REWORK (DOC-46)**: Nozzle items require CardAuthority equipped zone (Sprint 0 prerequisite for PW-5). Water bottles and torch fuel flow through CardAuthority bag zone.
- **EYESONLY_3D_ROADMAP (DOC-47)**: S4 (Cleaning Loop Wire) should incorporate hose system and torch interaction.
- **UNIFIED_EXECUTION_ORDER (DOC-32)**: PW-1 through PW-4 can run after Sprint 0. PW-3 torch-hit wiring requires Track A step A7 (torch interaction). PW-5 requires Sprint 0 completion.
- **TUTORIAL_WORLD_ROADMAP (DOC-2)**: §15 (Pressure Wash Simulator) is fulfilled by this roadmap.
- **GAP_ANALYSIS (DOC-33)**: Cleaning tool progression now includes nozzles as tier above mop/brush.
- **COBWEB_TRAP_STRATEGY_ROADMAP (DOC-31b)**: Trap re-arm via hose (water on mechanism) is a post-jam extension.
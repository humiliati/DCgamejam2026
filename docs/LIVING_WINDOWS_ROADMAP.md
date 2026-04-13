# Living Windows Roadmap — Believable Building Depth

> **DOC-17** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-04-11 | Updated: 2026-04-13
>
> **Status**: Phase 0 ✅, Phase 1 ✅, **Phase 2 next** (Z-depth fix + 3 window types: SHOP/BAY/SLIT)
>
> Companion to `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md` (Phase 4: WINDOW_TAVERN tile), `COZY_INTERIORS_DESIGN.md`, and `DOOR_ARCHITECTURE_ROADMAP.md` (recess tech adapted for window depth). Defines the contract that turns a raycast window from "a hole in the wall with a floating emoji" into a believable view into a lived-in interior — per-building window types with real depth, iron-bar commercial storefronts, protruding residential bays, and narrow fortress slits.

---

## 1. Problem Statement

Phase 4 of the freeform raycaster roadmap shipped `WINDOW_TAVERN` on the Promenade facades (Coral Bazaar and Driftwood Inn), placing a 🍺 billboard inside the glass cavity. In play-test feedback the windows read as "another mailbox setup" — a single emoji floating at the wall plane, framed by what looked like an open hole rather than a real pane of glass. Two things break the illusion:

1. **The glass itself is not visible.** The gap filler paints only a warm amber wash — no mullions, no reflection sheen, no frame. Without those surface cues the hole reads as open air.
2. **The billboard has no depth.** The 🍺 sprite sits at the window tile's center, co-planar with the glass. Real windows show content at several distinct depths — curtains a few inches behind the pane, a table a step further in, a patron another step beyond that. A single emoji at the glass plane can't sell that.

The fix for (1) is small and local to the gap filler (see §3). The fix for (2) is architectural: the engine needs a **Window Depth Contract** that attaches interior content to the tiles *behind* the window on the same floor grid.

---

## 2. Design Axiom

> **"A window is a view, not a label."**
>
> When the player looks through a tavern window, they should see the inside of a tavern at multiple depths — not a pictogram. The beer mug belongs on a table inside the building, the patron belongs standing near that table, and the glass belongs between them and the player.

This is the same contract as `COZY_INTERIORS_DESIGN.md` §1 applied to *exterior* rendering: every window is a tiny promise that the building beyond it is real and inhabited. If the promise is broken once (a dark empty window at business hours, a patron that never moves, a beer mug that phases through the glass) the whole town deflates.

---

## 3. Layer 1 fix — Visible Glass Surface (shipped 2026-04-11)

The glass filler now paints three stacked passes in order (on glass-face hits only — see face-aware dispatch below):

1. **Amber interior wash** — warm sodium-lamp tint (`rgba(255,180,60, 0.14 * brightness * fogFade)`). The only transparent layer; everything that follows is opaque.
2. **Mullion cross — OPAQUE** — a vertical mullion at `wallX ≈ 0.5` and a horizontal mullion at the slot's vertical midpoint. These paint with `rgb(…)` not `rgba(…)`, so they do not inherit the transparency of the amber wash layered beneath them (that was the visibility regression: `rgba(48,28,14, mullionBase)` composited over amber reads as "slightly browner amber," not "solid wood bar"). Color is pre-multiplied by brightness and lerped toward the fog color so the mullions still respect lighting.
3. **Top + bottom frame stops** — 1-pixel opaque dark bands at the edges of the slot, reinforcing the pane boundary.

The blue-white sheen gradient (originally pass 2) was removed — it was barely visible and not the style we want. Phase 0.5 replaces it with a parallax glint sprite (rotating pixel stack driven by angle-from-normal and cyclone math — see `PRESSURE_WASH_SYSTEM.md` for the nozzle math reference).

The mullions form a classic 2×2 colonial tavern pane grid. The 🍺 billboard still renders through the z-bypass path and sits *behind* the mullions — framed by them rather than overlapping — which is half the depth illusion for free.

### 3.1 Face-aware dispatch

A WINDOW_TAVERN tile has four faces. The gap filler is called for every column whose ray passes through the tile, regardless of which face the ray crossed. To prevent the interior wash + mullion from leaking through the sides of the building mass:

- **`info.hitFace`** — computed in `raycaster.js` from the DDA's `side` + `stepX/stepY`. Convention: 0=E, 1=S, 2=W, 3=N.
- **Exterior face** — per-tile, stored in `WindowSprites._exteriorFaces`. Populated from the explicit `windowFaces` map on floor data (§4.3) first; auto-detect heuristic as fallback.
- **Interior face** — `(exteriorFace + 2) % 4`. The opposite side of the same glass pane.

The filler checks: `isGlassFace = (hitFace === exteriorFace || hitFace === interiorFace)`.

- **Glass faces** (exterior + interior): amber wash + mullion cross + frame. Cavity remains transparent so the billboard sprite and facade-interior content render through it from both directions.
- **Perpendicular faces** (the two sides of the tile inside the building mass): opaque masonry fill matching adjacent WALL brightness + fog.

This is Layer 1 of the depth contract: **the glass plane itself is physically present on screen**. Layers 2 and 3 below are what makes the space *beyond* it feel real.

---

## 4. Window Depth Contract

### 4.1 The three layers

| Layer | Content | Lives on | Depth from player |
|---|---|---|---|
| 1. Glass surface | mullions + sheen + frame + amber wash | the `WINDOW_TAVERN` tile itself | at the facade plane |
| 2. Interior vignette | static building-type emoji (🍺 tavern, 🃏 bazaar, 🍲 soup kitchen, etc.) | the floor tile **immediately inside** the building, adjacent to the window | +1 tile behind the glass |
| 3. Patron / occupant NPC | AI-driven short-patrol sprite | floor tiles inside the building footprint | +1 to +3 tiles behind the glass |

Together these read as "through the window I see a pub sign on a table, and beyond it a patron walking around" — three distinct parallax layers without any new rendering machinery.

### 4.2 The Facade Model — why the interior content lives on the EXTERIOR floor grid

Each building in Dungeon Gleaner has **two separate representations** at different levels of the floor hierarchy:

- **Exterior footprint** on the parent floor (e.g. Driftwood Inn at rows 5–8, cols 19–24 on Promenade floor `"1"`). Walls and a door define the silhouette. The interior tiles within the footprint are `"0"` (empty) — unreachable by the player, because the only entrance is the door, which transitions to a *different floor*.
- **Interior floor** at depth 2 (e.g. `"1.2"` for the Inn), a hand-authored room at a completely different scale and coordinate system.

**The building interior on Floor N is a facade.** When the player stands on the Promenade and looks at the Driftwood Inn, they are looking at a shell of wall tiles with empty space behind them. The real Inn interior (Floor `"1.2"`) is a separate grid with its own geometry. No camera trick can make a window on Floor `"1"` show content from Floor `"1.2"` — they are different worlds.

This is the same design trick Wolfenstein 3D used for its fake windows: the content behind the glass is actually on the same grid as the player, just behind a wall the player can't reach. **The contract populates those empty interior-footprint tiles with billboards and NPC spawns so the window has something to "see through to"** — the facade becomes a diorama, not a hole.

Because of this facade model, a WINDOW_TAVERN tile's glass pane has two rendered faces:

- **Exterior face** (street side, e.g. SOUTH on the Promenade): amber wash + mullion cross + transparent cavity showing the billboard behind it.
- **Interior face** (building-facade side, opposite the exterior): transparent — so the cavity reads as a window from both directions, and any billboard / NPC sprites placed on the facade's interior tiles can look natural when viewed through the glass from either angle. The glass pane is the same physical object from both sides.

The two **perpendicular faces** (the sides of the tile that sit inside the building mass) render as opaque masonry — matching the adjacent WALL bands.

### 4.2.1 Stampable modular design

The facade + window system is designed to be **stamped onto any building on any exterior floor** without per-building engine changes:

1. **Author the building footprint** on the exterior floor grid — wall tiles, a door tile, and WINDOW_TAVERN tiles wherever the facade has windows.
2. **Declare `windowFaces`** on the floor data — a map of `"x,y" → face index` telling each window which direction faces the street (same contract as `doorTargets`). The auto-detect heuristic handles simple cases; explicit entries override it for facades with complex surroundings.
3. **Declare `windowScenes`** (§4.3) — attach vignette sprites and patron NPCs to the empty tiles inside the footprint.
4. **Register the building** in BuildingRegistry (§5) with its type, hours, and default content.

That's it — the gap filler, the billboard z-bypass, and the face-aware rendering all trigger automatically from the tile type. New buildings on Lantern Row (`"2"`), future frontier floors, or even procedurally generated exterior floors can stamp windows by repeating these four steps. No new modules, no raycaster changes, no special cases per building.

### 4.3 Declaration: `windowFaces` on floor data (shipped 2026-04-11)

Explicit exterior-face declarations for WINDOW_TAVERN tiles, keyed by `"x,y"` → face index (0=E, 1=S, 2=W, 3=N). Same contract as `doorTargets`. Entries override the auto-detect heuristic in `WindowSprites._detectExteriorFace` — required for facades where both sides of the window are walkable or where street tiles don't align directly with the window column.

```js
{
  floorId: '1',
  grid: ...,
  windowFaces: {
    '9,8':  1,   // Bazaar left window  → facing SOUTH (the promenade)
    '11,8': 1,   // Bazaar right window → facing SOUTH
    '21,8': 1,   // Inn left window     → facing SOUTH
    '23,8': 1    // Inn right window    → facing SOUTH
  },
  // ...
}
```

`WindowSprites.buildSprites(floorId, grid, gridW, gridH, explicitFaces)` checks the explicit map first per tile; any tile not listed falls back to the street-scoring heuristic. `game.js` passes `floorData.windowFaces || null` as the 5th parameter.

### 4.4 Declaration: `windowScenes` on floor data (future)

A new optional field on exterior floor data:

```js
{
  floorId: '1',
  grid: ...,
  // ...
  windowScenes: [
    {
      facade: { x: 21, y: 8 },         // WINDOW_TAVERN tile
      interiorStep: { dx: 0, dy: -1 }, // one tile NORTH = inside the inn
      building: 'driftwood_inn',       // key into BuildingRegistry
      vignette: 'tavern_mug',          // sprite/emoji recipe key
      patron: {
        kind: 'tavern_patron',         // NPC archetype
        patrol: [
          { x: 21, y: 6 },             // tiles inside the footprint
          { x: 22, y: 6 },
          { x: 22, y: 7 }
        ],
        cadence: 2400                  // ms per step
      },
      hours: { openAt: 6, closeAt: 24 } // in-game hours (optional)
    },
    // ...one entry per WINDOW_TAVERN tile...
  ]
}
```

The `building` key resolves through a new `BuildingRegistry` (§5) that knows the type, business hours default, and default vignette/patron archetypes for each named building.

For convenience a floor that has N window tiles pointing at the same building can omit `windowScenes` entirely and declare `windows: { '21,8': 'driftwood_inn', '23,8': 'driftwood_inn' }` — the registry supplies the rest.

### 4.5 Window Type Taxonomy

Phase 0–1 shipped a single tile type (`WINDOW_TAVERN = 73`) used on every building. This creates two problems: (a) every shop/home/fortress has the same chunky colonial mullion grid, and (b) the z-bypass writes `renderDist` to the z-buffer so vignette emojis render on top of everything — they float in front of the glass instead of sitting on a table inside the building.

The fix is a **window type per building archetype**, each with its own gap filler, freeform geometry, and z-depth contract. All three types share the same three-face architecture (glass exterior, transparent interior, masonry sides) and the same `windowScenes` data-driven hookup.

#### WINDOW_SHOP = 77 (commercial storefront)

The bazaar/tavern/shop window. Large plate glass panes divided by thin iron muntins — the texture is *mostly glass*. Think Victorian shopfront display case.

```
  ┌─────────────┐  ← 3.5 wall height
  │  wall tex    │     hUpper: 2.35
  │  ┌─┬─┬─┬─┐  │  ← glass slot top (1.15)
  │  │ │ │ │ │  │     0.75-unit tall glass area
  │  │ │ │ │ │  │     4 vertical panes, thin iron bars
  │  └─┴─┴─┴─┘  │  ← glass slot bottom (0.40, waist-high sill)
  │  wall tex    │     hLower: 0.40
  └─────────────┘
```

- **Gap filler** (`window_shop_interior`): amber wash + 3 thin vertical iron bars at wallX ≈ 0.25, 0.50, 0.75 (1px each, iron grey `rgb(70,72,78)`). Horizontal top/bottom frame (iron). No mullion cross — the glass dominates. Optional parallax glint on each pane segment.
- **Recess**: `recessD: 0.10` — slight inset so the glass sits behind the wall face, creating a shallow reveal. Less aggressive than DOOR_FACADE (0.25) but enough to read as "glass is behind the wall surface."
- **Z-depth fix**: z-buffer writes `perpDist + 1.0` (interior tile depth) instead of `renderDist`. Vignette emoji competes with real geometry — renders behind glass, behind iron bars, in front of back wall.
- **Buildings**: Coral Bazaar, Driftwood Inn, future shops on Lantern Row.
- **Mullion material**: iron bars from `MULLION_STYLES.iron` (cold grey), regardless of building's door hardware tier. Commercial glass = iron frame always.

#### WINDOW_BAY = 78 (residential bay window)

The Gleaner's Home / private residence window. Projects **outward** from the wall face into the adjacent street tile. Uses the DOOR_FACADE recess tech *inverted*: instead of recessing 0.25 into the tile, the window box protrudes 0.20 outward. Beveled side jambs render in the building's wall texture, creating a visible shelf/sill.

```
        ┌───────┐         ← bay top (projects forward)
       ╱│ glass │╲        ← beveled side jambs (wall texture)
  ────╱ │  pane │ ╲────   ← wall face
  wall   └───────┘  wall
         ↑ 0.20 units forward of wall plane
```

- **Gap filler** (`window_bay_interior`): warm amber wash + single mullion cross (wood, `MULLION_STYLES.wood`). Classic 2×2 colonial pane grid — the cozy residential look. Frame lines in dark oak.
- **Protrusion**: `recessD: -0.20` (negative = outward). The raycaster's recess block subtracts from perpDist instead of adding, so the glass face renders *closer* to the player than the surrounding wall. Jamb columns at the protrusion's lateral edges render in the building's `wallTexture`, creating the beveled side panels.
- **Z-depth fix**: same `perpDist + 1.0` z-buffer write. Vignette (🕯️ candle) renders deep inside the bay.
- **Buildings**: Gleaner's Home, future private residences.
- **Sill**: hLower raised to 0.55 (higher than shop) — residential windows sit higher. hUpper: 2.50. Slot height 0.45 (smaller, cozier).

#### WINDOW_SLIT = 79 (institutional fortress slit)

The Storm Shelter / Watchman's Post / Dispatcher's window. Narrow vertical slot — a bunker peephole. Reads as "this building is fortified, you're not getting in through the window."

```
  ┌─────────────┐  ← 3.5 wall height
  │  wall tex    │     hUpper: 1.80
  │    ┌───┐     │  ← slit top (1.70)
  │    │   │     │     1.20-unit tall, 0.30-unit wide
  │    │   │     │     single vertical iron bar at center
  │    └───┘     │  ← slit bottom (0.50)
  │  wall tex    │     hLower: 0.50
  └─────────────┘
```

- **Gap filler** (`window_slit_interior`): cold blue-grey wash (`rgba(140,160,180, 0.10)`). Single vertical iron bar at wallX ≈ 0.50 (2px wide). No horizontal mullion. Top/bottom iron frame. Minimal glow — cold institutional interior.
- **Narrow slot**: the freeform cavity occupies only the center 30% of the tile width. The filler paints opaque masonry on wallX < 0.35 and wallX > 0.65, leaving the narrow center as the glass opening. The masonry bands use the building's `wallTexture`.
- **Recess**: `recessD: 0.15` — moderate inset. The slit is recessed into thick fortress walls.
- **Z-depth fix**: same pattern. Vignette (🔦 or 🏮) renders deep inside, barely visible through the narrow slot.
- **Buildings**: Storm Shelter, Watchman's Post, Dispatcher's Office.

#### Z-Depth Fix (applies to all window types)

The current z-bypass in `raycaster.js` line ~1302 writes `renderDist` to `_zBuffer[col]` for all freeform tiles. This is correct for DOOR_FACADE (need to see through to interior) and ARCH_DOORWAY (open passageway), but wrong for windows — the glass is a *partial* barrier, and content behind it should have real depth.

**Fix**: introduce a `zBypassMode` field on freeform configs:

| Mode | z-buffer write | Use case |
|---|---|---|
| `'full'` | `renderDist` | DOOR_FACADE, ARCH_DOORWAY, PORTHOLE — open passageways |
| `'depth'` | `perpDist + 1.0` | All window types — content behind glass has depth |
| `'solid'` | `perpDist` | Canopy, roof — no see-through |

The raycaster reads `zBypassMode` from the freeform config instead of unconditionally writing `renderDist`. Default is `'full'` for backward compatibility.

#### Texture IDs (new in TextureAtlas)

| ID | Size | Description |
|---|---|---|
| `window_shop_iron` | 64×64 | Iron bar grid: 3 vertical bars + top/bottom frame, glass fill between |
| `window_slit_iron` | 64×64 | Single vertical bar + narrow frame, heavy masonry flanks |
| `window_bay_wood` | 64×64 | Oak mullion cross + 4-pane grid, warm wood frame |

These are optional — the gap fillers can paint procedurally (as WINDOW_TAVERN does now). But pre-rendered textures are cheaper per-column than per-pixel filler math, so we may migrate the filler to texture sampling in a polish pass.

### 4.7 Rules

**Public buildings** (Inn, Bazaar, Dispatcher's Office, Soup Kitchen, Shop, Bar):
- Always have a vignette emoji at the interior-adjacent tile while the building is OPEN.
- Spawn one patron NPC per window scene on the declared patrol path while OPEN.
- On CLOSE (hours.closeAt reached, or global curfew, or hero day lockdown): despawn the patron, swap the vignette for a dimmer "closed" variant (🕯️ unlit, or nothing).

**Private buildings** (Gleaner's Home, shacks, private residences):
- Have a vignette emoji only while the resident is HOME.
- Spawn one occupant NPC while HOME, no patrol (stationary at a declared bed/chair tile).
- `hours` are inverted — residents are home at night, out by day.

**Scale buildings** (Watchman's Post, Temple, Warehouse) — future:
- May have multiple window scenes with different vignettes (counter, back room, upstairs window).
- Patron patrol paths can overlap (guards pacing, clerks at desks).

### 4.8 Lifecycle hook

Game calls `WindowScenes.refresh(floorId, hourOfDay)` on:
- Floor arrive
- Hour rollover (DayCycle hook)
- Hero day start / end
- Building state change (quest unlocks a new shop, curfew closes all public buildings)

`refresh` walks the `windowScenes` table, computes OPEN/CLOSED/HOME/AWAY for each, and inserts or removes the vignette sprite + patron NPC from the live floor state.

---

## 5. BuildingRegistry (shipped 2026-04-11)

Layer 0 data module (`engine/building-registry.js`) — one frozen record per named building. Zero dependencies; loaded before any rendering or game logic.

```js
BuildingRegistry.get('driftwood_inn') →
{
  id: 'driftwood_inn',
  floorId: '1.2',                  // where the interior lives
  parentFloorId: '1',              // where the exterior footprint lives
  type: 'public',                  // 'public' | 'private' | 'scale'
  kind: 'tavern',                  // drives default vignette + patron
  footprint: { x: 19, y: 5, w: 6, h: 4 },
  wallTexture: 'wood_plank',       // TextureAtlas ID for freeform bands
  mullionStyle: 'bronze',          // MULLION_STYLES key for cross + frame
  defaultHours: { openAt: 6, closeAt: 24 },
  defaultVignette: 'tavern_mug',
  defaultPatron: 'tavern_patron',
  closedVignette: null             // null = despawn on close
}
```

The registry seeds itself from the building list already implicit in `floor-manager.js` (every door target is a building), so for the jam we don't need a separate data file — just a static table initialized at module load.

Six buildings registered: `coral_bazaar`, `driftwood_inn`, `storm_shelter`, `gleaners_home`, `dispatchers_office`, `watchmans_post`.

Public API:
- `BuildingRegistry.get(id)` — fetch a record
- `BuildingRegistry.listByFloor(parentFloorId)` — all buildings on an exterior
- `BuildingRegistry.getVignette(name)` — resolve a vignette recipe `{ emoji, scale, glow, glowRadius }`
- `BuildingRegistry.getMullionStyle(name)` — resolve mullion material `{ r, g, b }`
- `BuildingRegistry.isOpen(id, hourOfDay, flags)` — state query with wrap-around hours + curfew/heroDay

### 5.1 Modular texture architecture (approach C+B)

Windows inherit their building's visual material through two data-driven overrides:

**wallTexture** — the TextureAtlas texture ID used for the freeform sill + lintel bands. Without this, every WINDOW_TAVERN tile renders with the default `wood_plank` from `SpatialContract.getTexture()`. With the override, the raycaster swaps the band texture to `brick_red` (Coral Bazaar), `stone_rough` (Storm Shelter), `concrete` (Dispatcher's Office), etc. — the window frame matches the wall it's embedded in.

**mullionStyle** → **MULLION_STYLES** — the base RGB for the mullion cross and frame lines. Three tiers matching the town's social strata:

| Style | RGB | Character | Buildings |
|---|---|---|---|
| `bronze` | `(180, 140, 60)` | Warm aged brass | Coral Bazaar, Driftwood Inn |
| `iron` | `(70, 72, 78)` | Cold grey institutional | Storm Shelter, Dispatcher, Watchman |
| `wood` | `(48, 28, 14)` | Dark oak (original default) | Gleaner's Home |

**Data flow:**

1. `floor-manager.js` declares `windowScenes`, each entry referencing a `building` ID.
2. `WindowSprites.buildSprites()` resolves the building record via `BuildingRegistry.get()` and writes `wallTexture` and `mullionStyle` into per-tile caches (`_windowTextures`, `_windowMullions`).
3. The **raycaster** checks `WindowSprites.getWallTexture(mapX, mapY)` before resolving the default texture — overrides the band material for that column.
4. The **gap filler** checks `_windowMullions[mapX + ',' + mapY]` at render time — overrides the mullion/frame color for that column.

**Adding a new building's windows** requires zero code changes:
1. Register the building in `building-registry.js` with `wallTexture` + `mullionStyle`.
2. Add `windowScenes` entries on the exterior floor data referencing the building ID.
3. Place WINDOW_TAVERN tiles on the grid.

The system resolves everything else at build time.

---

## 6. Vignette sprite module (extends existing WindowSprites)

`engine/window-sprites.js` already emits the 🍺 glyph inside the window cavity. We extend it to support the depth contract:

- Input: `windowScenes` from the current floor's data (not a grid scan).
- Output: one billboard sprite per *active* scene, positioned at the INTERIOR tile (`facade + interiorStep`), not at the window tile itself. The glyph and glow come from the vignette recipe (`tavern_mug`, `bazaar_cards`, `soup_cauldron`, …).
- Closed scenes are skipped. The vignette table is rebuilt on `WindowScenes.refresh()`.

Sprite recipes (new file `engine/data/window-vignettes.js` or inlined for the jam):

```js
var WINDOW_VIGNETTES = {
  tavern_mug:   { emoji: '🍺', scale: 0.42, glow: '#ffaa33', glowRadius: 2 },
  bazaar_cards: { emoji: '🃏', scale: 0.40, glow: '#ffcc55', glowRadius: 2 },
  soup_cauldron:{ emoji: '🍲', scale: 0.42, glow: '#ff9933', glowRadius: 2 },
  dispatch_lamp:{ emoji: '🏮', scale: 0.38, glow: '#ffbb44', glowRadius: 3 },
  home_candle:  { emoji: '🕯️', scale: 0.30, glow: '#ffdd88', glowRadius: 2 },
  closed_dim:   { emoji: '🕯️', scale: 0.18, glow: '#442200', glowRadius: 1 }
};
```

Because vignette sprites live on the interior tile (one step behind the facade), the existing z-bypass path handles them automatically — it already allows sprites in cells behind a freeform tile to render through the cavity.

---

## 7. Patron NPC patrol (new: WindowPatron module)

`engine/window-patron.js` (Layer 3) — minimal NPC driver tailored for window viewing. Not a full NPC with dialogue, just a billboard that:

- Picks the next tile in its `patrol` list every `cadence` ms.
- Lerps between tiles using a reduced copy of the MovementController step animation.
- Despawns / respawns when its parent scene closes / opens.
- Drives a glyph pulled from its archetype (`tavern_patron` → 🧔, `bazaar_merchant` → 🧙, etc.).

Patrons are NOT part of the main EnemyAI or NPC dialogue systems — they are purely visual. Treating them as lightweight sprites keeps them cheap and avoids coupling with combat/interaction systems that they don't participate in.

### 7.1 Path validation

Patrol tiles must all live inside the building footprint (verified by the registry) and must be `0` (empty) tiles on the exterior grid so the patron doesn't overlap a wall, door, or column. Validation runs at `WindowScenes.refresh()` time and logs a warning if any path tile is invalid — the patron then stays parked at the first valid tile.

### 7.2 Visibility culling

Patrons only tick while their parent scene is "visible" — i.e. the player is within `renderDistance` of the window and within a rough facing cone (±90° from the window's outward normal). This keeps the tick budget negligible: at any moment only the handful of windows the player is looking at need their patrons animated.

---

## 8. Cleanup & lifecycle

Every `WindowScenes.refresh()` call produces an **authoritative** list of active scenes for the current floor. The module diffs that list against the previously-active set and:

- For each new scene: spawn vignette sprite + patron sprite.
- For each removed scene: despawn both.
- For each carried-over scene: leave the patron alone (preserves patrol progress).

This diff model is idempotent — the game can call `refresh()` as many times as it wants without double-spawning. Floor transition calls `WindowScenes.clear()` to drop everything for the old floor and rebuild for the new one.

---

## 9. Phases

### Phase 0 — Shipped 2026-04-11 (Layer 1 glass + naive billboard)
- `WINDOW_TAVERN = 73` tile + freeform geometry + `window_tavern_interior` gap filler.
- Naive `WindowSprites.buildSprites()` emits a 🍺 at every WINDOW_TAVERN tile center.
- Mullion cross + frame (opaque `rgb()` so mullions don't inherit amber wash alpha).
- Blue-white sheen removed — not the style we want; replaced in Phase 0.5 by parallax glint.
- Coral Bazaar + Driftwood Inn facades on Promenade (4 windows total).
- **Face-aware filler:** `info.hitFace` derived from DDA `side + stepX/stepY` in `raycaster.js`. The filler compares hitFace against the exterior-face map and only paints glass on the two pane faces (exterior + opposite interior); perpendicular faces get opaque masonry fill.
- **Explicit `windowFaces` map** on floor data (same contract as `doorTargets`). The auto-detect heuristic works for simple facades but fails where both sides of the window are walkable EMPTY and street tiles don't align directly with the window column. Promenade row 8 required explicit entries for all 4 windows (face=1, SOUTH).
- **Facade model acknowledged:** buildings on Floor N are shells — the real interiors are Floor N.N (a different grid). Windows look into the facade's empty interior tiles, not the depth-2 interior floor. The system is stampable to any new building (see §4.2.1).

**Known gap:** the billboard is at the window plane, not behind it. Windows read as "mailbox-style pictograms" rather than views into a space.

### Phase 1 — BuildingRegistry + window scenes (shipped 2026-04-11)
- ✅ `engine/building-registry.js` — 6 building records with `wallTexture` + `mullionStyle` + vignettes + hours.
- ✅ `windowScenes` field on Promenade (`"1"`) floor data — 4 scenes (2× Bazaar, 2× Inn).
- ✅ `WindowSprites.buildSprites()` reads `windowScenes`, resolves vignettes from BuildingRegistry, positions sprites at interior-adjacent tile.
- ✅ `game.js` passes `windowScenes` to `buildSprites()`.
- ✅ Modular texture architecture: per-tile `wallTexture` override in raycaster, per-tile `mullionStyle` override in gap filler. See §5.1.
- Remaining: verify z-bypass depth rendering with sprites one tile behind the freeform cavity.
- Remaining: add `windowScenes` to `"2"` (Lantern Row) when windows are placed.

**Acceptance:** The 🍺 renders visually *behind* the window mullion grid, with a clear depth gap between the glass and the glyph. The player reads it as "beer mug sitting on a table inside the tavern." Window mullions on the Bazaar are warm bronze, on the Inn warm bronze, on institutional buildings cold iron.

### Phase 2 — Z-Depth Fix + Window Type Foundation (HIGH PRIORITY)

The single most impactful change: stop writing `renderDist` to the z-buffer for window tiles. This is why vignette emojis render on top of everything — they have no depth competition with the glass.

**Work**:
1. Add `zBypassMode` field to freeform tile configs in `SpatialContract`:
   - `'full'` (default) = `renderDist` → DOOR_FACADE, ARCH_DOORWAY, PORTHOLE
   - `'depth'` = `perpDist + 1.0` → all window tiles (vignette has real depth)
   - `'solid'` = `perpDist` → canopy, roof tiles
2. Raycaster reads `zBypassMode` from the freeform config instead of the blanket `_zBypass` boolean. One conditional change in the z-buffer write block (~line 1302).
3. Set `zBypassMode: 'depth'` on WINDOW_TAVERN (73) freeform config. Existing windows immediately get correct depth.
4. Register three new tile IDs in `tiles.js`:
   - `WINDOW_SHOP: 77` — commercial plate glass + iron bars
   - `WINDOW_BAY: 78` — residential protruding bay window
   - `WINDOW_SLIT: 79` — institutional fortress slit
5. Add `isFreeform()` entries for 77/78/79 in tiles.js.
6. Add `SpatialContract` freeform configs for each new tile type (see §4.5 for geometry).

**Acceptance:** The 🍺 in the Driftwood Inn window renders *behind* the mullion grid and *behind* the glass wash — visible through the window but clearly inside the building, not floating in front. Walking parallel to the facade produces visible parallax between glass surface and vignette depth.

### Phase 2A — WINDOW_SHOP gap filler + stamp-out (1 day)

The commercial storefront window. Replaces WINDOW_TAVERN on Coral Bazaar and Driftwood Inn.

**Work**:
1. Write `_windowShopFiller()` in `window-sprites.js`:
   - Amber wash (warmer, higher opacity than TAVERN — this is a lit display case).
   - 3 thin vertical iron bars at wallX ≈ 0.25, 0.50, 0.75 (1px each, iron grey).
   - Horizontal top/bottom iron frame (2px).
   - No mullion cross — the glass dominates. The vignette emoji is the star.
   - Parallax glint on each of the 4 pane segments.
2. Register filler as `'window_shop_interior'`.
3. SpatialContract config: `recessD: 0.10` (slight inset — glass sits behind wall face).
4. Generate `window_shop_iron` texture in TextureAtlas (optional — filler can paint procedurally first, migrate to texture sampling in polish).
5. Convert Promenade windows:
   - Coral Bazaar (9,8) and (11,8): WINDOW_TAVERN → WINDOW_SHOP
   - Driftwood Inn (21,8) and (23,8): WINDOW_TAVERN → WINDOW_SHOP
6. Update `windowScenes` to reference new tile type (scene data is tile-agnostic — just need filler dispatch).

**Acceptance:** Coral Bazaar windows show 🃏 playing cards through large plate-glass panes with thin iron bars. The bars are visually minimal — the window reads as "glass display case" not "jail cell." The glass is subtly recessed behind the brick facade.

### Phase 2B — WINDOW_BAY gap filler + Gleaner's Home (1 day)

The residential bay window. Projects outward from the wall into the street tile.

**Work**:
1. Write `_windowBayFiller()` in `window-sprites.js`:
   - Warm amber wash + classic 2×2 mullion cross (wood, dark oak).
   - Frame in building's `wallTexture` color.
2. Implement negative `recessD` in raycaster recess block:
   - Current code: `_rPD = perpDist + _recessD / rayComponent` (positive = deeper).
   - Negative `recessD` makes `_rPD < perpDist` — glass face renders closer to player.
   - Jamb columns at lateral edges use the building's `wallTexture` → beveled side panels.
3. SpatialContract config: `recessD: -0.20`, `hLower: 0.55`, `hUpper: 2.50` (smaller, higher slot).
4. Place WINDOW_BAY tiles on Gleaner's Home facade (Floor 1).
5. Add `windowScenes` for Gleaner's Home: vignette `home_candle` (🕯️), interiorStep pointing into the home footprint.

**Acceptance:** Standing on the Promenade looking at Gleaner's Home, the bay window *protrudes* from the building face. The beveled side panels are visible in the building's dark wood texture. A warm candle glow is visible deep inside. The bay casts a subtle shadow line where it meets the wall.

### Phase 2C — WINDOW_SLIT gap filler + institutional buildings (half day)

The fortress slit. Narrow, cold, minimal.

**Work**:
1. Write `_windowSlitFiller()` in `window-sprites.js`:
   - Cold blue-grey wash (institutional interior light).
   - Opaque masonry on wallX < 0.35 and wallX > 0.65 (narrows the opening).
   - Single vertical iron bar at center (2px).
   - Iron top/bottom frame.
2. SpatialContract config: `recessD: 0.15`, `hLower: 0.50`, `hUpper: 1.80` (tall narrow slit).
3. Place WINDOW_SLIT tiles on Storm Shelter facade (Floor 1). If Storm Shelter has no windows currently, add 1–2 slits flanking the door.
4. Reserve WINDOW_SLIT for Lantern Row institutional buildings (Dispatcher's, Watchman's) when those floors are built out.

**Acceptance:** The Storm Shelter windows read as narrow fortress slits — a dim glow barely visible through thick walls. The contrast with the Bazaar's plate-glass storefronts sells the building's defensive character.

### Phase 3 — Patron NPCs (1 day)
- Add `engine/window-patron.js` — minimal patrol sprite with step-lerp.
- Register 3-4 patron archetypes (tavern patron, bazaar merchant, dispatch clerk, home resident).
- Patron definitions inline in `windowScenes` for jam scope; promote to a data file post-jam.
- Hook into game render loop alongside WindowSprites.

**Acceptance:** Standing outside the Driftwood Inn, the player sees a patron walking between two tiles inside the building, clearly visible through the iron-bar glass as they cross behind the panes.

### Phase 4 — Business hours + open/closed state (half day)
- Extend BuildingRegistry with `defaultHours` + `isOpen(id, hour, flags)`.
- Hook `WindowScenes.refresh()` into DayCycle hour rollover.
- Closed-state vignette swap + patron despawn.
- Private-building inversion (home residents appear at night, not day).

**Acceptance:** The Inn windows are bright with a visible patron during the day, dim and empty at night (or vice versa for Gleaner's Home). Curfew closes all public buildings simultaneously.

### Phase 5 — Scale + polish (stretch)
- Multi-window buildings with different vignettes per window (Watchman's Post: counter window + back room window).
- Per-window lighting tint (warm tavern vs. cool Dispatcher vs. green alchemist).
- Patron path variation with random dwell times.
- Audio: low murmur from public buildings at open hours when the player is within 3 tiles of a window.
- Migrate gap fillers to texture sampling (pre-rendered 64×64 textures) for per-column performance.

---

## 10. Touch list

### Shipped (Phase 0 + Phase 1)
| File | Change |
|---|---|
| `engine/window-sprites.js` | face-aware filler, explicit `explicitFaces` param on `buildSprites`, lazy filler registration, `_detectExteriorFace` heuristic + explicit-map-first lookup, two-face glass pane logic (`isGlassFace`), parallax glint effect, `windowScenes` + `BuildingRegistry` integration, per-tile `_windowTextures`/`_windowMullions` caches, `getWallTexture()`/`getMullionColor()` public API, per-tile mullion color in filler |
| `engine/raycaster.js` | `info.hitFace` derivation from DDA `side + stepX/stepY`, threaded `stepX/stepY` through to freeform foreground + back-layer calls, per-tile window texture override for WINDOW_TAVERN freeform bands |
| `engine/floor-manager.js` | `windowFaces` map on Promenade floor data, `windowScenes` array on Promenade (4 scenes: 2× Coral Bazaar, 2× Driftwood Inn) |
| `engine/game.js` | pass `floorData.windowFaces || null` and `floorData.windowScenes || null` to `WindowSprites.buildSprites` |
| `engine/building-registry.js` | **new** — Layer 0 frozen building records (6 buildings), `VIGNETTES` table, `MULLION_STYLES` table, `isOpen()` with wrap-around hours |
| `index.html` | `<script src="engine/building-registry.js">` at Layer 0 |

### Remaining (Phase 2 — Z-Depth + Window Types)
| File | Change |
|---|---|
| `engine/tiles.js` | Add `WINDOW_SHOP: 77`, `WINDOW_BAY: 78`, `WINDOW_SLIT: 79`; extend `isFreeform()` |
| `engine/spatial-contract.js` | Freeform configs for 77/78/79 with `recessD` + `zBypassMode: 'depth'`; update tile 73 config with `zBypassMode: 'depth'` |
| `engine/raycaster.js` | Replace blanket `_zBypass` z-buffer write with `zBypassMode`-driven conditional (~line 1302); support negative `recessD` for bay window protrusion |
| `engine/window-sprites.js` | Three new gap fillers: `_windowShopFiller`, `_windowBayFiller`, `_windowSlitFiller`; lazy registration for all three |
| `engine/texture-atlas.js` | Optional: `window_shop_iron`, `window_slit_iron`, `window_bay_wood` textures (64×64) |
| `engine/floor-manager.js` | Convert Promenade WINDOW_TAVERN tiles (73→77); add WINDOW_BAY to Gleaner's Home; add WINDOW_SLIT to Storm Shelter; update `windowScenes` + `windowFaces` |
| `engine/building-registry.js` | Add `windowType` field per building record (`'shop'`, `'bay'`, `'slit'`) |

### Remaining (Phases 3–5)
| File | Change |
|---|---|
| `engine/window-patron.js` | **new** — patrol-sprite driver for patrons |
| `engine/window-scenes.js` | **new** (or fold into window-sprites) — `refresh()` / `clear()` / `isOpen()` |
| `engine/game.js` | wire `WindowScenes.refresh()` into floor arrive + DayCycle hour tick |
| `index.html` | `<script>` tags for window-scenes (L3) → window-patron (L3) |
| `docs/COZY_INTERIORS_DESIGN.md` | cross-reference this doc from §6 (Per-Building Interaction Inventory) |
| `docs/RAYCAST_FREEFORM_UPGRADE_ROADMAP.md` | Phase 4 "open items" links here |
| `docs/LIVING_WINDOWS_ROADMAP.md` | this file |

---

## 11. Open questions

1. **Do window scenes persist across floor visits?** If the player leaves the Promenade and returns, should the patron be at the tile where they left, or restart at the patrol origin? Proposal: the `refresh()` diff preserves in-flight patron state if the scene is carried over, otherwise restart. Leaving the floor is "carried over" — game.js holds the scene table across exits and rebuilds only on actual floor generation.

2. **Can the player interact with a patron through the window?** Tempting for cozy vignettes ("*the barkeep waves*") but adds a whole interaction layer. Proposal: **no** for jam scope — patrons are purely visual. Interaction happens through the door.

3. **How does this interact with combat?** Public-building windows sit on exterior floors where combat can happen. If a hero day or enemy encounter is active on the Promenade, does the tavern still show a happy patron? Proposal: Phase 3 adds a "lockdown" flag to the registry — during hero day public buildings close (shutters down, vignette swapped, patrons despawned) even if the clock says open.

4. **Minimap representation.** Currently the minimap doesn't render window tiles differently from walls. A small warm-colored pixel (same amber as the gap filler) would sell placement at a glance. Deferred to Phase 4 polish.

5. **Sound occlusion.** Audio through a window should be muffled compared to through a door. This is a whole separate feature — not in scope.

6. **Same-tile patrons across multiple windows.** If two windows declare patrol paths that intersect, two patrons could end up on the same tile. Proposal: check patrol tile ownership at registry load and warn. For jam scope we manually author non-overlapping paths.

---

## 12. Cross-references

- `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md` §4 Phase 4 — the tile + geometry + gap filler foundation this doc extends
- `DOOR_ARCHITECTURE_ROADMAP.md` — recess tech (Wolfenstein thin-wall offset) adapted for WINDOW_SHOP inset and WINDOW_BAY protrusion; Phase 6A double-door UV split informs future paired-window spans
- `COZY_INTERIORS_DESIGN.md` — the Safety Contract this is the *outside-looking-in* version of
- `NPC_SYSTEM_ROADMAP.md` — main NPC system; window patrons are intentionally **not** part of it (lightweight billboards only)
- `LIVING_INFRASTRUCTURE_BLOCKOUT.md` — building inventory that drives BuildingRegistry records
- `BLOCKOUT_REFRESH_PLAN.docx` §6 — window-door consistency rules; mullion ↔ hardware tier alignment

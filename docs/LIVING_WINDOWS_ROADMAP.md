# Living Windows Roadmap — Believable Building Depth

> **DOC-17** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-04-11 | Updated: 2026-04-14
>
> **Status**: Phase 0 ✅, Phase 1 ✅, Phase 2 ✅ (SHOP/BAY/SLIT + ALCOVE + COMMERCIAL), Phase 2.5 ✅ (corner-window bitmask + ARROWSLIT + MURDERHOLE). **Next**: Phase 6 EmojiMount port (retires `zBypassMode`, unifies window/terminal/table billboard emission — see §4.6), Phase 7 surface-mount tiles (COUNTER, COFFEE_TABLE — see §4.9), Phase 8 blockout tool authoring flow (see §10.6). Phase 12 (Exterior Proxy Zones — interior windows looking *out* onto pasted exterior slices) is the large post-Jam ambition; design lives in sibling doc `PROXY_ZONE_DESIGN.md`. Beveled corners, crumbled-gap variant, Phase 9 patron NPCs follow.
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

### 4.6 EmojiMount unification (supersedes `zBypassMode='depth'`)

The TERMINAL hologram work (`engine/emoji-mount.js`, shipped 2026-04-14) produced a generic **EmojiMount** system: a tile can register a billboarded emoji with an anchor mode (`floor` / `cavity` / `surface`), a `lift` offset, a `recess` value (the unified z-bypass knob), bob/glint/scanline animation, and optional overlay/glow. Sprites flow through the existing `_sprites[]` array; the raycaster billboards them in its normal sprite pass. Same plumbing shape as WindowSprites, generalized.

This supersedes Phase 2's `zBypassMode='depth'` fix. That field was a temporary patch — a binary knob that wrote `perpDist + 1.0` to the z-buffer for window tiles so vignettes didn't cull against the glass column. EmojiMount's per-mount `recess` replaces it with a continuous, per-instance value: how far into the tile (along the view axis) the billboard sits, which determines both the sprite's draw distance and the z-buffer comparison depth. Tile geometry remains the same; only the sprite emitter changes.

**Two registration paths share one runtime.**

- **Type mounts** — `EmojiMount.register({ tile: TILES.TERMINAL, emoji: '💻', … })`. Every tile of that type anywhere in the world gets the mount. Good for tiles whose content is invariant (terminals, torches, pedestals, arcade cabinets).
- **Instance mounts** — `EmojiMount.registerAt(floorId, x, y, { emoji: '🍺', overlay: null, lift: 0.8, … })`. Keyed by `(floorId, x, y)`. The tile's freeform geometry (WINDOW_SHOP, TABLE, COUNTER) determines anchor mode and cavity/surface math; the instance record supplies the glyph, overlay, glow, and lifecycle hooks. This is the path windows, tables, and counters take — the tile is authored once, the emoji is authored per placement.

`EmojiMount.buildSprites()` walks the grid, and for each cell checks (in order): instance mount at this coord → type mount for this tile → nothing. The first hit emits a sprite record using the tile's geometry to pick defaults (anchor, lift, recess) and the mount's fields to override per-instance.

**Floor data grows one sibling map.** `windowScenes` (building-scoped with patron/hours lifecycle) and `emojiMounts` (geometry-scoped, runtime-swappable) coexist:

```js
{
  floorId: '1',
  grid: ...,
  windowFaces: { '9,8': 1, ... },
  windowScenes: [ /* patron + hours stuff — unchanged */ ],
  emojiMounts: {
    '9,8':   { emoji: '🃏', recipe: 'bazaar_cards' },   // WINDOW_SHOP cavity
    '21,8':  { emoji: '🍺', recipe: 'tavern_mug' },     // WINDOW_SHOP cavity
    '23,15': { emoji: '☕', anchor: 'surface' },         // COFFEE_TABLE top
    '11,14': { emoji: '🕯️', anchor: 'surface', lift: 0.78 } // COUNTER top
  }
}
```

`windowScenes` entries may reference an `emojiMounts` key instead of carrying a vignette inline — the scene supplies the lifecycle (open/closed/hero-day swap) and the mount supplies the glyph. A closed tavern swaps the key's record to the `closed_dim` recipe; an open tavern swaps it back. No grid mutation.

**What retires.**

- `zBypassMode` field on freeform configs is deleted. All window tiles drop to the default z-buffer write. The recess knob on the per-coord mount drives sprite depth.
- Per-tile-type vignette emission in `WindowSprites._emitBillboards` is deleted. WindowSprites retains only the filler pass (glass surface, mullions, frame, per-tile `wallTexture` and `mullionStyle` overrides). Billboard emission moves to EmojiMount.
- `BuildingRegistry.defaultVignette` stays — it supplies the *default recipe* the blockout tool uses to seed `emojiMounts` entries when a window is placed via a building-typed stamp. The recipe is still data.

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

### 4.9 Surface-mount family — tables, counters, coffee tables

Windows look *through* a tile into a cavity. Tables look *on top of* a tile. Same EmojiMount system, different anchor.

Surface-mount tiles share a predicate (`TILES.hasFlatTopCap`) that tells the raycaster to project a textured top plane down from the tile's cap elevation to the floor at the correct foreshortening. The top plane is the "stage" the emoji sits on. Three tiles ship with this shape today (TABLE, BED, STOOP/DECK); the decor family extends with COUNTER and COFFEE_TABLE.

**Per-tile cap elevations** (world-Y, matches `tileCapHeights` in the spatial contract):

| Tile | Cap height | Typical emoji | Anchor `lift` |
|---|---|---|---|
| COFFEE_TABLE | 0.30 | ☕ 📖 🕯️ | matches cap — 0.30 |
| TABLE | 0.52 | 🍺 🃏 🍲 🗝️ | 0.52 |
| COUNTER | 0.78 | 💰 ⚖️ 🍞 ☕ | 0.78 |
| SHELF (future) | 1.30 | 📚 🏺 | 1.30 |

EmojiMount uses `anchor: 'surface'` on these. The mount's `lift` defaults to the tile's cap elevation so the billboard's baseline plants flush on the cap. The designer can override `lift` for tall items (a candelabra on a table → `lift: 0.52 + 0.15`). `recess` defaults to `0.5` (tile center) because surface emojis are not peering through a thin-wall cavity — they sit on an open top and standard sprite z-sort handles occlusion correctly.

**Bob and glint** are the same code path as terminals — phase-hashed off grid coords so four coffee tables in a row don't bob in sync. Glint is useful for metallic items (🗝️, ⚔️, 💰).

**Same `emojiMounts` map** authors all three anchor families. The runtime picks anchor mode from the tile's predicates (hasVoidCap → `floor` for terminals, hasFlatTopCap → `surface` for tables, isFreeform window → `cavity`). The per-coord record carries just the glyph and overrides. The blockout tool authors both window and table emojis through one meta-editor panel — the tile type determines the preset recipe list.

**Example — shop interior** (Coral Bazaar, floor `"1.1"`):

```js
emojiMounts: {
  '4,5': { emoji: '💰', recipe: 'shop_counter_coins' },  // COUNTER
  '6,5': { emoji: '⚖️', recipe: 'shop_counter_scale' },  // COUNTER
  '4,3': { emoji: '🗝️', recipe: 'shop_table_key' },      // TABLE
  '8,4': { emoji: '🏺', recipe: 'shop_shelf_urn' }        // SHELF (future)
}
```

The same shop viewed from the Promenade through a WINDOW_SHOP has its *cavity* emoji authored on the exterior floor (`"1"`) at the window coord — a separate record, typically a larger/brighter recipe because it's meant to be read through glass from a distance. The interior floor has the real items; the facade has the marketing poster. Both use EmojiMount.

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

### Phase 2 — Z-Depth Fix + Window Type Foundation (shipped 2026-04-12)

Five window tile types shipped with face-aware gap fillers, per-tile `wallTexture`/`mullionStyle` overrides, and `zBypassMode='depth'` on the freeform configs so vignette emojis render at `perpDist + 1.0` instead of at `renderDist`. Tiles: WINDOW_SHOP (77), WINDOW_BAY (78), WINDOW_SLIT (79), WINDOW_ALCOVE (80), WINDOW_COMMERCIAL (81).

**Note (2026-04-14):** `zBypassMode` is slated for retirement in Phase 6. See §4.6 — the per-mount `recess` on EmojiMount is the unified, per-instance z-depth knob that replaces this boolean. Existing window tiles will drop the field and get the same (or better) depth behavior through EmojiMount's sprite emission.

### Phase 2.5 — Corner-Window Bitmask + Dungeon Apertures (shipped 2026-04-13)

`_exteriorFaces` stores a bitmask (1=E, 2=S, 4=W, 8=N) instead of a single face index; `windowFaces[key]` accepts a number or an array. Two new dungeon aperture tiles: WINDOW_ARROWSLIT (82) and WINDOW_MURDERHOLE (83). Billboard emission is suppressed for aperture tiles — no amber vignette leakage on dungeon floors.

### Phase 6 — EmojiMount port + `zBypassMode` retirement (next, HIGH PRIORITY)

Unify billboard emission under `engine/emoji-mount.js`. Retire `zBypassMode` as a field; per-mount `recess` drives all sprite-vs-freeform z-sort.

**Work**:
1. Extend EmojiMount with instance-keyed registration:
   - `EmojiMount.registerAt(floorId, x, y, cfg)` — store in `_instances[floorId]['x,y'] = frozen cfg`.
   - `EmojiMount.clearFloor(floorId)` — drop all instance mounts for a floor on transition.
   - `buildSprites(floorId, grid, w, h)` walks the grid and resolves mount in priority order: instance → type.
2. Move window vignette emission from `WindowSprites._emitBillboards` into EmojiMount. WindowSprites retains only filler-pass concerns (glass, mullions, frame, texture/mullion overrides).
3. Anchor-mode resolution from tile predicates:
   - `TILES.isWindow(t)` → `anchor: 'cavity'`, default `lift` matches tile's `hLower + (hUpper-hLower)/2`, default `recess` = window config's `recessD + 0.5`.
   - `TILES.hasFlatTopCap(t)` → `anchor: 'surface'`, default `lift` from contract's `tileCapHeights[t]`, default `recess` = 0.5.
   - `TILES.hasVoidCap(t)` → `anchor: 'floor'`, defaults per existing TERMINAL config.
4. Delete `zBypassMode` field from `SpatialContract` freeform configs (all five window tiles). Remove the conditional in `raycaster.js` that switched z-buffer write based on it. All window tiles return to the default `perpDist` write; EmojiMount sprites carry their own depth via `recess`.
5. Add `emojiMounts: { 'x,y': { emoji, recipe?, lift?, recess?, glow?, overlay? } }` to floor data. Migrate existing `windowScenes` vignette fields onto `emojiMounts`; `windowScenes` retains only `building`, `patron`, and `hours`.
6. `game.js` calls `EmojiMount.clearFloor(prev)` + `EmojiMount.registerAt` for each `emojiMounts` entry on floor transition.
7. `BuildingRegistry.defaultVignette` becomes a recipe name consumed by the blockout tool at stamp time (seeds the per-coord mount record), not a runtime lookup.

**Acceptance:** All shipped windows (4 Bazaar/Inn on Promenade, Gleaner's Home alcoves) render identical or better than Phase 2, with `zBypassMode` gone from the codebase. TERMINAL hologram still renders correctly (type mount path, unchanged). Floor transitions don't leak instance mounts between floors. `grep zBypassMode engine/` returns no hits.

### Phase 7 — Surface-mount tiles (TABLE / COUNTER / COFFEE_TABLE emoji)

Extend the surface-mount family so any `hasFlatTopCap` tile can carry an emoji via `emojiMounts`.

**Work**:
1. Add `COUNTER` and `COFFEE_TABLE` tile IDs to `tiles.js`; register both with `hasFlatTopCap`.
2. `SpatialContract.tileCapHeights`: TABLE 0.52 (existing), COUNTER 0.78, COFFEE_TABLE 0.30.
3. Cap texture per tile (wood for TABLE/COFFEE_TABLE, stone or marble for COUNTER) via existing `tileCapTextures` map.
4. EmojiMount resolves `anchor: 'surface'` automatically for these tiles — no new code path once Phase 6 lands.
5. Populate one shop interior (Coral Bazaar `"1.1"`) with a COUNTER + TABLE + COFFEE_TABLE and 3–4 `emojiMounts` entries to validate.
6. Update `tools/blockout-visualizer.html` tile-picker so the new tiles appear in the stamp library with their correct preview colors.

**Acceptance:** Walking into Coral Bazaar, the player sees ☕ on a coffee table, 💰 on the counter, and 🗝️ on a side table — each emoji planted at the correct cap height, billboards aligned, standard sprite z-sort (no special bypass). Same authoring flow for all three.

### Phase 8 — Blockout tool authoring flow for `emojiMounts`

Author emoji-on-tile through the meta-editor panel, not a drop-time prompt. See §10.6 for full UX spec.

**Work**:
1. Extend `bv-meta-editor.js` with an "Emoji Mount" inspector row that shows when the selected tile has a registered mount-capable shape (`isWindow`, `hasFlatTopCap`, `hasVoidCap`).
2. Inspector fields: emoji (text + recipe dropdown), anchor (auto from tile, read-only unless overriding), lift (slider bracketed by tile's cap range), recess (slider 0.0–1.0), glow, overlay.
3. Recipe library panel (`bv-emoji-recipes.js`, new file): curated sets keyed by tile family — `window_shop`, `window_bay`, `table_shop`, `table_tavern`, `counter_shop`, `coffee_table_home`. Each recipe pre-fills the inspector fields in one click.
4. Save patcher writes to floor data's `emojiMounts` map keyed by `"x,y"`. `bv-validation.js` warns when a mount is placed on a tile whose shape doesn't match any anchor mode.
5. Visual indicator in the grid render: a tiny emoji glyph overlaid on the tile cell when a mount is present. Hovering shows the recipe name.
6. Building-typed stamps (e.g. "Tavern window pair") auto-seed default mounts from `BuildingRegistry.defaultVignette` so the designer gets correct content on drop without a prompt.

**Acceptance:** Dropping a WINDOW_SHOP via a non-building stamp leaves it blank; dropping it via the "Coral Bazaar window" compound stamp fills in 🃏 via the registry default. Selecting any mount-capable tile shows an Emoji Mount row in the inspector — never a modal. Saving writes valid `emojiMounts` JSON that loads unmodified in-game.

### Phase 9 — Patron NPCs (previously Phase 3)
- Add `engine/window-patron.js` — minimal patrol sprite with step-lerp.
- Register 3-4 patron archetypes (tavern patron, bazaar merchant, dispatch clerk, home resident).
- Patron definitions inline in `windowScenes` for jam scope; promote to a data file post-jam.
- Hook into game render loop alongside WindowSprites.

**Acceptance:** Standing outside the Driftwood Inn, the player sees a patron walking between two tiles inside the building, clearly visible through the iron-bar glass as they cross behind the panes.

### Phase 10 — Business hours + open/closed state (previously Phase 4)
- Extend BuildingRegistry with `defaultHours` + `isOpen(id, hour, flags)` (partially shipped).
- Hook `WindowScenes.refresh()` into DayCycle hour rollover — swaps `emojiMounts` recipe at the scene's coord (open → `tavern_mug`, closed → `closed_dim`). No grid mutation.
- Patron despawn on close.
- Private-building inversion (home residents appear at night, not day).

**Acceptance:** The Inn windows are bright with a visible patron during open hours, dim and empty at night (or vice versa for Gleaner's Home). Curfew closes all public buildings simultaneously via a single BuildingRegistry flag.

### Phase 11 — Scale + polish (stretch, previously Phase 5)
- Multi-window buildings with different vignettes per window (Watchman's Post: counter window + back room window) — already data-supportable via per-coord `emojiMounts`.
- Per-window lighting tint (warm tavern vs. cool Dispatcher vs. green alchemist) — EmojiMount `glow` field.
- Patron path variation with random dwell times.
- Audio: low murmur from public buildings at open hours when the player is within 3 tiles of a window.
- Migrate gap fillers to texture sampling (pre-rendered 64×64 textures) for per-column performance.

### Phase 12 — Exterior Proxy Zones (inverse facade: interior windows looking *out*)

Full design lives in `docs/PROXY_ZONE_DESIGN.md`. This entry is the phase summary — see the companion doc for rendering pipeline details, blockout tool UX, and the city-floor motel variant.

Interior windows on floor N.N need to show an actual slice of the exterior (floor N) on the far side of the glass — not a tinted poster. The approach embeds a region of floor-N tiles into floor-N.N's grid as a **proxy zone**: regular grid tiles flagged `hasOpenSky`, rendered under a fog profile inherited from the parent floor, with the parent's skybox substituted through the ceiling pass. This is the inverse of the facade interior pattern already shipped on floor N — buildings on N have empty interiors populated with emoji vignettes; buildings on N.N have windows looking out onto pasted exterior slices. Both use the same Wolfenstein "diorama behind a wall you can't reach" trick, mirrored.

**Work**:
1. `TILES.hasOpenSky(t)` predicate + raycaster ceiling-pass branch that paints parent-floor skybox when the ceiling column hits a sky-flagged tile.
2. Window freeform config field `fogProfile: 'parent'` that resets fog params for ray distance beyond the window crossing.
3. `FloorManager.getParent(floorId)` exposed to the raycaster for skybox + fog lookup at render time (currently only used for back-nav).
4. Contract extension: N.N's interior contract accepts N's exterior wall-tile height overrides on the tile IDs pasted into its proxy zones. No new contract — the existing `tileWallHeights` / `tileFaceWallHeights` maps absorb exterior IDs.
5. Floor data metadata: `proxyZones: [{ x, y, w, h, sourceFloorId, sourceOrigin }]` describing each zone's footprint and (optionally) its source region on floor N for refresh-from-source.
6. Blockout tool: sky-zone rectangle tag, blue diagonal hatch overlay in the grid render, auto-wire window `fogProfile` when a window is placed on a wall adjacent to a tagged zone.
7. Pilot: Driftwood Inn interior (`"1.2"`) gets a proxy zone looking out onto the Promenade. Three interior windows, one tall commercial-style storefront view.

**Deferred to 12B**:
- Bidirectional source-bind (edit floor N → re-pull into zone).
- Dynamic sprite replication (NPCs, animations visible through the window).
- Motel variant on future city floor 4 (doubled diorama — see PROXY_ZONE_DESIGN §8).

**Acceptance:** Standing inside the Driftwood Inn and looking out a window, the player sees the Promenade's sunset skybox, the correct building silhouettes across the street, and the DayCycle's current phase through cyan-tinted glass. Walking back outside and looking *in* the same window from the Promenade still shows amber lamp light, the tavern_mug vignette, and any patron. Both directions remain visually coherent.

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

### Shipped (Phase 2 — Z-Depth + Window Types)
| File | Change |
|---|---|
| `engine/tiles.js` | Added `WINDOW_SHOP: 77`, `WINDOW_BAY: 78`, `WINDOW_SLIT: 79`, `WINDOW_ALCOVE: 80`, `WINDOW_COMMERCIAL: 81`; extended `isFreeform()` + `isOpaque()` + `isWindow()` |
| `engine/spatial-contract.js` | Freeform configs for 77/78/79/80/81 with `recessD` (positive = inset; bay uses negative for protrusion) + `zBypassMode: 'depth'`; per-tile textures |
| `engine/raycaster.js` | `zBypassMode`-driven conditional z-buffer write; negative `recessD` protrusion support |
| `engine/window-sprites.js` | Five gap fillers shipped: `_windowShopFiller`, `_windowBayFiller`, `_windowSlitFiller`, `_windowAlcoveFiller`, `_windowCommercialFiller`; per-tile `yAlt` overrides for SHOP (0.125) and COMMERCIAL (1.125) vignette centering |
| `engine/floor-manager.js` | Promenade tile placement, WINDOW_BAY on residential buildings, WINDOW_ALCOVE on Gleaner's Home corners, `windowFaces` map (single index + array for corner tiles), `windowScenes` per building |

### Shipped (Phase 2.5 — Corner-Window Bitmask + Dungeon Apertures)
| File | Change |
|---|---|
| `engine/window-sprites.js` | `_exteriorFaces` now stores a **bitmask** (1=E, 2=S, 4=W, 8=N) instead of a single face index. `buildSprites` accepts `windowFaces[key]` as either a number (single face) or array (multi-face → OR'd bitmask). `_detectExteriorFace` rewritten: street scoring accumulates *all* positive-scoring directions; symmetric walkable-pair fallback handles dungeon slits between two walkable rooms (both sides flagged exterior). `isGlass`/`isBack` hit classification via `(extMask & hitBit)` / `(extMask & oppBit)`. Billboard sprite emission skipped for dungeon aperture tiles (no amber vignette leakage). |
| `engine/tiles.js` | Added `WINDOW_ARROWSLIT: 82`, `WINDOW_MURDERHOLE: 83`; extended `isOpaque()`, `isFreeform()`, `isWindow()` |
| `engine/spatial-contract.js` | Freeform configs + textures (`stone_rough`) on **both** `interior()` and `nestedDungeon()`. Interior: slit `hUpper=0.10 hLower=0.10 recessD=0.08`, murderhole `hUpper=0.30 hLower=1.35 recessD=0.08`. Nested (shorter walls): slit `0.05/0.05 recessD=0.06`, murderhole `0.25/0.70 recessD=0.06` |
| `engine/window-sprites.js` | Two new fillers: `_windowArrowslitFiller` (stone masonry outside wallX [0.45, 0.55], 1px darker edge beads, transparent aperture; base `rgb(70,66,60)`) and `_windowMurderholeFiller` (stone outside [0.40, 0.60] with 1px rim top/bottom + vertical edges; base `rgb(68,64,58)`). Both fog-aware + brightness-adjusted. |
| `engine/floor-manager.js` | Gleaner's Home alcove corner tile `'23,27'` uses array syntax `[3, 0]` → bitmask N+E for the NE corner window face pair. |

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

## 10.5 Where we're going next

**Near-term (unblocks multiple features)**:

1. **Beveled corners for round tile rendering** — higher priority than further window variants. Unlocks:
   - Round stone pillars in dungeon foyers (floor N.N / N.N.N).
   - Round tree trunks on exterior floors (currently blocky squares).
   - True round portholes (tile 72 exists as an alpha-mask freeform but needs beveled corners to read as circular rather than octagonal).
   The raycaster DDA works column-by-column on axis-aligned tile edges. A bevel pass needs either (a) a per-tile corner-clip mask evaluated against the ray's intra-tile wallX/wallY crossing, or (b) a sub-tile geometry hint in the freeform config that tells the column where to truncate. Approach TBD — prototype after dungeon aperture placement work settles.

2. **Crumbled-gap irregular-slice dungeon aperture** — third dungeon window variant to complement the orderly arrowslit and murderhole. Jagged edges, asymmetric, reads as structural damage rather than designed opening. Likely a stone-texture filler with a procedural per-column noise mask on the aperture boundary.

3. **Dungeon aperture placement** — ARROWSLIT + MURDERHOLE shipped with full rendering but not yet placed on any floor. Candidate locations: Hero's Wake B1/B2 (murder holes looking into corpse chambers), Soft Cellar (arrow slits framing the tutorial trap).

**Medium-term**:

4. **Phase 6 — EmojiMount port** (§4.6) — the decisive architectural unifier. Moves window vignette emission into `engine/emoji-mount.js` alongside the terminal hologram, retires `zBypassMode` as a field, keys billboards by `(floorId, x, y)` through instance mounts, and introduces the `emojiMounts` floor-data map. Unblocks Phase 7 and Phase 10's open/closed runtime swaps.

5. **Phase 7 — surface-mount tiles** (§4.9) — COUNTER + COFFEE_TABLE with `hasFlatTopCap` caps and `anchor: 'surface'` mounts. Populate Coral Bazaar `"1.1"` interior as the first validation ground.

6. **Phase 8 — blockout tool authoring flow** (§10.6) — the meta-editor "Emoji Mount" inspector row, recipe library, and compound stamps. No prompt-on-drop, no parallel tile variants — per-coord data only.

7. **Phase 9 — patron NPCs** (`engine/window-patron.js`) — static billboards ship today via `windowScenes`, but lively patrons walking a 2–3 tile patrol behind the glass are the Layer 3 payoff of the whole depth contract (see §4.1).

8. **Phase 10 — business hours + open/closed state** — `BuildingRegistry.isOpen()` already exists; hook into DayCycle hour rollover and swap the `emojiMounts` recipe at the scene's coord (no grid mutation, no re-registration — just a field update on the frozen record, or a re-register if the instance API makes that cheaper).

6. **Window-back face texture** — the interior (back) face currently paints a static dark wash. A cheap win: reuse `TextureAtlas` stone/wood samples so the back of the window reads as an actual inside wall.

## 10.6 Blockout tool authoring flow for emoji mounts

**Design axiom**: *Tiles are geometry. Emojis are data attached by coordinate. Dropping a tile never prompts.*

This section specifies the UX for authoring `emojiMounts` in `tools/blockout-visualizer.html`. It exists because two alternative models were considered and rejected:

| Model | Rejected because |
|---|---|
| Prompt-on-drop ("is this an emoji window?") | Modal mid-authoring breaks flow. Silent-no-emoji failure mode when the designer dismisses the prompt. Can't retrofit emoji to existing tiles without re-placement. |
| Parallel tile variants (WINDOW_SHOP vs WINDOW_SHOP_LIT vs WINDOW_SHOP_MUG) | Tile ID table doubles per emoji variant. Every `isOpaque`/`isFreeform`/`isWindow`/`hasFlatTopCap` switch multiplies. Day/night swaps require re-stamping the grid instead of a table lookup. Minimap/validation/FloorManager all learn new IDs. |

The chosen model — per-coord map keyed by `"x,y"`, authored in the meta-editor panel — follows the same pattern as `doorTargets`, `windowFaces`, and `windowScenes` already established in this codebase.

### 10.6.1 Three-surface UI

**(1) Stamp library** (`bv-stamp-library.js`). No changes to geometry stamps. Two new compound stamps per building archetype:

- `tavern_window_pair` — stamps two WINDOW_SHOP tiles *plus* seeds two `emojiMounts` entries with the building's `defaultVignette` recipe. One-click authoring for the common case.
- `shop_interior_counter_row` — stamps COUNTER + TABLE + COFFEE_TABLE *plus* seeds `emojiMounts` with default shop-interior recipes.

Compound stamps are how "drop a window with content" happens without a prompt: the stamp itself carries the content. Dropping a raw WINDOW_SHOP (non-compound) leaves it blank — that's the "no emoji, the scene is handled by a separate stamp" case.

**(2) Meta-editor panel** (`bv-meta-editor.js`). When the selection tool has a single tile selected, a new "Emoji Mount" inspector row appears — conditionally, only when the tile's shape registers a mount-capable anchor:

- `TILES.isWindow(t)` → anchor: `cavity`
- `TILES.hasFlatTopCap(t)` → anchor: `surface`
- `TILES.hasVoidCap(t)` → anchor: `floor`
- otherwise → row hidden

Inspector fields:

| Field | UI | Default |
|---|---|---|
| **Recipe** | dropdown from curated list filtered by tile family | blank |
| **Emoji** | text input (single glyph) | from recipe |
| **Anchor** | read-only label, derived from tile predicates | auto |
| **Lift** | slider, range bracketed by tile's cap/cavity height | from recipe or anchor default |
| **Recess** | slider 0.0–1.0 (how deep into the tile along view axis) | 0.5 |
| **Glow** | color picker + radius slider, nullable | from recipe |
| **Overlay** | optional second emoji (for layered glyphs like 🐉 over 🔥) | null |
| **Clear** | button — removes the `emojiMounts` entry for this coord | — |

The panel writes directly into the floor data's `emojiMounts` map through `bv-save-patcher.js`. Blank-and-save deletes the entry; setting any field creates one.

**(3) Recipe library** (`bv-emoji-recipes.js`, new file). Curated presets keyed by tile family:

```js
var EMOJI_RECIPES = {
  window_shop: {
    bazaar_cards:  { emoji: '🃏', scale: 0.42, glow: '#ffcc55', glowRadius: 2, lift: 0.9 },
    tavern_mug:    { emoji: '🍺', scale: 0.42, glow: '#ffaa33', glowRadius: 2, lift: 0.85 },
    shop_display:  { emoji: '🗝️', scale: 0.40, glow: '#ffbb44', glowRadius: 2, lift: 0.85 },
    closed_dim:    { emoji: '🕯️', scale: 0.18, glow: '#442200', glowRadius: 1, lift: 0.85 }
  },
  window_bay: {
    home_candle:   { emoji: '🕯️', scale: 0.30, glow: '#ffdd88', glowRadius: 2, lift: 1.10 }
  },
  table_tavern: {
    tavern_mug:    { emoji: '🍺', scale: 0.45, glow: '#ffaa33', glowRadius: 1, lift: 0.52 },
    tavern_food:   { emoji: '🍲', scale: 0.45, glow: '#ff8833', glowRadius: 1, lift: 0.52 }
  },
  table_shop: {
    key_display:   { emoji: '🗝️', scale: 0.40, lift: 0.52 },
    deck_display:  { emoji: '🃏', scale: 0.40, lift: 0.52 }
  },
  counter_shop: {
    coin_pile:     { emoji: '💰', scale: 0.42, lift: 0.78 },
    scale:         { emoji: '⚖️', scale: 0.42, lift: 0.78 },
    bread:         { emoji: '🍞', scale: 0.40, lift: 0.78 }
  },
  coffee_table_home: {
    coffee:        { emoji: '☕', scale: 0.35, lift: 0.30 },
    book:          { emoji: '📖', scale: 0.35, lift: 0.30 },
    candle:        { emoji: '🕯️', scale: 0.30, glow: '#ffdd88', glowRadius: 1, lift: 0.32 }
  }
};
```

The recipe dropdown is filtered by the selected tile's family — a WINDOW_SHOP shows `window_shop.*`, a COUNTER shows `counter_shop.*`. Picking a recipe pre-fills every inspector field; edits after the pick don't unpick the recipe (the `recipe` field stays in the saved JSON as a reference, but the edited fields override). Clearing the recipe field turns the mount into a fully ad-hoc entry.

### 10.6.2 Visual indicator in the grid

The tile cell renders its normal geometry color at 80% opacity, with the mount's emoji drawn at 14px centered. Hover tooltip: `"🍺 (recipe: window_shop.tavern_mug)"`. Coords with an `emojiMounts` entry but an incompatible tile shape (e.g. emoji set on a WALL tile from a stale save) render with a red border and a validation warning in the tooltip.

### 10.6.3 Validation rules

`bv-validation.js` runs these on save:

1. **Anchor match.** For each `emojiMounts` key, the tile at that coord must have a mount-capable predicate (`isWindow` / `hasFlatTopCap` / `hasVoidCap`). Mismatch → error, block save until cleared.
2. **Lift in range.** Lift must fall within the tile's allowed elevation: window `[hLower, hUpper]`, surface `[cap, cap + 1.0]`, floor `[-0.5, 1.0]`. Out-of-range → warning, don't block save.
3. **Recipe integrity.** If `recipe` is set, it must resolve in the recipe library and the resolved family must match the tile family. Mismatch → warning (e.g. `window_shop.tavern_mug` on a COUNTER tile). Don't block; the designer may intentionally be reusing a recipe.
4. **Duplicate-stamp overlap.** If a compound stamp seeds an `emojiMounts` entry at a coord that already has one, keep the existing entry. Show a toast: *"Mount at 11,14 already authored — compound stamp skipped emoji seed."*

### 10.6.4 Loading back into the game

No new loader code. `floor-manager.js` already reads arbitrary sibling fields off floor data (`doorTargets`, `windowFaces`, `windowScenes`). Phase 6 adds one line: `if (fd.emojiMounts) for each → EmojiMount.registerAt(...)` during floor arrival.

The blockout tool's output JSON is already a faithful subset of `floor-manager.js`'s floor records, so `emojiMounts` round-trips through save/load without transform.

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
- `PROXY_ZONE_DESIGN.md` — Phase 12 companion doc; the inverse-facade pattern that lets interior windows render actual exterior tiles + parent-floor skybox + parent-floor fog. Includes the city-floor motel variant (doubled diorama across floor N ↔ N.N).

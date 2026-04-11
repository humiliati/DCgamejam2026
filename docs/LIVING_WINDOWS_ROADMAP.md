# Living Windows Roadmap — Believable Building Depth

> **DOC-17** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-04-11
>
> Companion to `RAYCAST_FREEFORM_UPGRADE_ROADMAP.md` (Phase 4: WINDOW_TAVERN tile) and `COZY_INTERIORS_DESIGN.md`. Defines the contract that turns a raycast window from "a hole in the wall with a floating emoji" into a believable view into a lived-in interior — a three-layer composition of glass surface, interior vignette sprite, and a patron NPC on a short patrol path.

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

The glass filler now paints four stacked passes in order:

1. **Amber interior wash** — warm sodium-lamp tint (unchanged from the first shipment).
2. **Blue-white sheen gradient** — vertical, brightest at the top fading to transparent at the bottom. Sells the sky reflecting off the pane.
3. **Mullion cross — OPAQUE** — a vertical mullion at `wallX ≈ 0.5` and a horizontal mullion at the slot's vertical midpoint. These paint with `rgb(…)` not `rgba(…)`, so they do not inherit the transparency of the amber wash layered beneath them (that was the visibility regression: `rgba(48,28,14, mullionBase)` composited over amber reads as "slightly browner amber," not "solid wood bar"). Color is pre-multiplied by brightness and lerped toward the fog color so the mullions still respect lighting.
4. **Top + bottom frame stops** — 1-pixel opaque dark bands at the edges of the slot, reinforcing the pane boundary.

The mullions form a classic 2×2 colonial tavern pane grid. The 🍺 billboard still renders through the z-bypass path and sits *behind* the mullions — framed by them rather than overlapping — which is half the depth illusion for free.

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

### 4.2 Why the interior content lives on the EXTERIOR floor grid

Each building in Dungeon Gleaner has two representations:

- **Exterior footprint** on the parent floor (e.g. Driftwood Inn at rows 5–8, cols 19–24 on Promenade floor `"1"`). Walls and door define the silhouette; the interior tiles of the footprint are currently `"0"` (empty) and never visited — the player enters via the door, which transitions to a separate floor.
- **Interior floor** at depth 2 (e.g. `"1.2"`), a hand-authored room at a completely different scale.

A window on the exterior cannot "see into" the depth-2 interior floor — it's a different grid with a different coordinate system. But it *can* look at the empty tiles inside the footprint on its own floor. **The contract populates those empty interior-footprint tiles with billboards and NPC spawns so the window has something to see through to.**

This is the same design trick Wolfenstein 3D used for its fake windows: the content behind the glass is actually on the same grid as the player, just behind a wall the player can't reach.

### 4.3 Declaration: `windowScenes` on floor data

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

### 4.4 Rules

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

### 4.5 Lifecycle hook

Game calls `WindowScenes.refresh(floorId, hourOfDay)` on:
- Floor arrive
- Hour rollover (DayCycle hook)
- Hero day start / end
- Building state change (quest unlocks a new shop, curfew closes all public buildings)

`refresh` walks the `windowScenes` table, computes OPEN/CLOSED/HOME/AWAY for each, and inserts or removes the vignette sprite + patron NPC from the live floor state.

---

## 5. BuildingRegistry (new module)

A Layer 1 data module (`engine/building-registry.js`) with one frozen record per named building:

```js
BuildingRegistry.get('driftwood_inn') →
{
  id: 'driftwood_inn',
  floorId: '1.2',                  // where the interior lives
  parentFloorId: '1',              // where the exterior footprint lives
  type: 'public',                  // 'public' | 'private' | 'scale'
  kind: 'tavern',                  // drives default vignette + patron
  footprint: {                     // rectangle on parentFloorId
    x: 19, y: 5, w: 6, h: 4
  },
  defaultHours: { openAt: 6, closeAt: 24 },
  defaultVignette: 'tavern_mug',
  defaultPatron: 'tavern_patron',
  closedVignette: null             // null = despawn on close
}
```

The registry seeds itself from the building list already implicit in `floor-manager.js` (every door target is a building), so for the jam we don't need a separate data file — just a static table initialized at module load.

Public API:
- `BuildingRegistry.get(id)` — fetch a record
- `BuildingRegistry.listByFloor(parentFloorId)` — all buildings on an exterior
- `BuildingRegistry.isOpen(id, hourOfDay, flags)` — state query

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
- Mullion cross + sheen + frame (the visibility fix).
- Coral Bazaar + Driftwood Inn facades on Promenade.

**Known gap:** the billboard is at the window plane, not behind it. Windows read as "mailbox-style pictograms" rather than views into a space.

### Phase 1 — BuildingRegistry + window scenes (half day)
- Add `engine/building-registry.js` with one record per building the current floors use (Bazaar, Inn, Dispatcher, Shelter, Home, Watchman, Soup Kitchen — 7 records).
- Add `windowScenes` field to floor data on `"1"` and `"2"`.
- Refactor `WindowSprites.buildSprites()` to read from `windowScenes`, position vignette sprites at the interior-adjacent tile instead of the window tile.
- Verify the z-bypass path renders sprites one tile behind the freeform cavity correctly (it already does for DUMP_TRUCK but confirm for WINDOW_TAVERN).

**Acceptance:** The 🍺 renders visually *behind* the window mullion grid, with a clear depth gap between the glass and the glyph. The player reads it as "beer mug sitting on a table inside the tavern."

### Phase 2 — Patron NPCs (1 day)
- Add `engine/window-patron.js` — minimal patrol sprite with step-lerp.
- Register 3-4 patron archetypes (tavern patron, bazaar merchant, dispatch clerk, home resident).
- Patron definitions inline in `windowScenes` for jam scope; promote to a data file post-jam.
- Hook into game render loop alongside WindowSprites.

**Acceptance:** Standing outside the Driftwood Inn, the player sees a patron walking between two tiles inside the building, clearly visible through the window as they cross the mullion grid.

### Phase 3 — Business hours + open/closed state (half day)
- Extend BuildingRegistry with `defaultHours` + `isOpen(id, hour, flags)`.
- Hook `WindowScenes.refresh()` into DayCycle hour rollover.
- Closed-state vignette swap + patron despawn.
- Private-building inversion (home residents appear at night, not day).

**Acceptance:** The Inn windows are bright with a visible patron during the day, dim and empty at night (or vice versa for Gleaner's Home). Curfew closes all public buildings simultaneously.

### Phase 4 — Scale + polish (stretch)
- Multi-window buildings with different vignettes per window (Watchman's Post: counter window + back room window).
- Per-window lighting tint (warm tavern vs. cool Dispatcher vs. green alchemist).
- Patron path variation with random dwell times.
- Audio: low murmur from public buildings at open hours when the player is within 3 tiles of a window.

---

## 10. Touch list

| File | Change |
|---|---|
| `engine/building-registry.js` | **new** — frozen building records |
| `engine/floor-manager.js` | add `windowScenes` field to `_buildFloor1()` + future exterior floors |
| `engine/window-sprites.js` | refactor to read `windowScenes`, position vignettes at interior-adjacent tile |
| `engine/window-patron.js` | **new** — patrol-sprite driver for patrons |
| `engine/window-scenes.js` | **new** (or fold into window-sprites) — `refresh()` / `clear()` / `isOpen()` |
| `engine/game.js` | wire `WindowScenes.refresh()` into floor arrive + DayCycle hour tick |
| `engine/raycaster.js` | verify z-bypass handles sprites one tile *behind* a freeform cavity (spot-check, probably no change) |
| `index.html` | `<script>` tags in load order: registry (L1) → window-scenes (L3) → window-patron (L3) |
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
- `COZY_INTERIORS_DESIGN.md` — the Safety Contract this is the *outside-looking-in* version of
- `NPC_SYSTEM_ROADMAP.md` — main NPC system; window patrons are intentionally **not** part of it (lightweight billboards only)
- `LIVING_INFRASTRUCTURE_BLOCKOUT.md` — building inventory that drives BuildingRegistry records

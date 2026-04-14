# Blockout Visualizer — Engine Roadmap

Current state (v0.2, April 2026): visualizer with paint, lasso, resize, full/diff export, all-tile picker.
Reference frame: what a level designer coming from Tiled, Ogmo, Unity Tilemaps, Unreal, or a AAA in-house
editor would expect to find when they sit down at this tool.

This document is organized by **designer expectation tier** — not by implementation difficulty. Tier 1 is
"a working editor should obviously have this." Tier 4 is "this is specific to Dungeon Gleaner and
differentiates us from a generic tile editor."

---

## Phase 3 — Schema extraction (next up)

The immediate blocker before expanding the editor meaningfully. Right now the tool embeds a 77-entry
TILE_SCHEMA copy-pasted from `engine/tiles.js`. Every time `tiles.js` changes, the visualizer drifts.

- Parse `engine/tiles.js` in `extract-floors.js` and emit the schema into `floor-data.json`
- Pull category, walkability, opacity, door/freeform/floating predicates from source
- Include `isDoor()`, `isFreeform()`, `isFloating()` results so the editor can enforce constraints
- Load `data/cards.json`, `data/strings/en.js` for entity and display name resolution
- Surface builder metadata (`shops`, `spawn`, `doorTargets`, `doorFaces`, `biome`) as editable fields

Until this lands, any new tile added to the game is invisible to the tool.

---

## Tier 1 — Table stakes for a tile editor

What a designer will look for in the first ten minutes and be confused if it's missing.

### Drawing tools

- **Rectangle fill** — drag a box, release to fill with the paint tile (solid or outline mode)
- **Flood fill / bucket** — click a cell, fill all connected same-tile cells
- **Line tool** — click-drag to paint a straight line between two cells (Bresenham)
- **Brush size** — 1×1, 2×2, 3×3, 5×5 square brushes (modifier key or picker)
- **Replace-all-of-type** — select a tile ID, one-click replace every instance on the floor

### Selection improvements

- **Magic wand** — select all contiguous tiles of the same type (for moving a whole room, a whole path)
- **Select-by-tile** — select every instance of a tile ID, floor-wide
- **Invert selection**, **shrink/grow** by N cells, **select all**
- **Multi-rectangle selection** (shift+drag adds to selection)
- **Floating selection clipboard** — cut/copy/paste regions between floors

### History

- **Redo** (Ctrl+Shift+Z / Ctrl+Y) — we only have undo right now
- **History panel** — scrollable list of operations with timestamps, click any entry to jump to that state
- **Named checkpoints** — manual save points the designer labels ("before door rework")

### View

- **Minimap** — small overview in a corner, click to jump, draggable viewport rect
- **Jump to coordinates** — text input, tile-snap camera
- **Bookmarks** — named camera positions per floor
- **Measure tool** — click two cells, show grid distance and Manhattan distance
- **Show cursor crosshair** across full row/column for alignment

### Keyboard discoverability

- **Shortcut cheatsheet overlay** (press `?` to show)
- **Customizable shortcuts** (probably defer — vanilla keymap is fine for now)

---

## Tier 2 — Professional expectations

Features found in every mature 2D level editor. Missing these makes the tool feel like a prototype.

### Layers

- **Logical tile layers**: terrain / structure / furniture / entities / lighting / freeform / floating
- **Per-layer visibility + lock toggles** — see the roof separately, lock terrain while editing furniture
- **Per-layer opacity slider** — fade structure to see terrain beneath
- **Layer reorder** via drag
- **Active layer indicator** — new paint goes to the active layer
- The current numeric grid becomes a *composite view* of layer stacks; export collapses back to grid

This is a significant refactor because our current model is a flat `grid[y][x]` of tile IDs. Either
we introduce real layers in the JSON format, or we synthesize layers from tile category at display
time (easier, but loses ability to stack, e.g., a torch *on* a wall).

### Named brushes / stamps

- **Save selection as a brush** — multi-cell patterns with a name and thumbnail
- **Brush library panel** — categorize ("building corner NE", "6×4 stall", "cathedral window")
- **Paint with a stamp** — click to place, rotation modifier keys
- **Random variant brush** — paint grass with 10% flower, 5% rubble; configurable weights
- **Ship default brushes** derived from existing floors (door frames, pod corners, pergola runs)

### Auto-tiling / Wang tiles

- **Terrain brush** — paint a "road" region, corners auto-place ROAD + PATH shoulder + grass transitions
- **Wall corner autofill** — paint a rectangle border, corners resolve to the right wall variant
- **Rule tiles** — if you paint tile X with tile Y to the north, substitute tile Z

For DG this could encode patterns like: "if ARCH_DOORWAY is placed, auto-populate adjacent tiles with
the required road, pillar stubs, and back-face tile."

### Validation

- **Walkability check** — flood-fill from spawn, flag unreachable walkable tiles in red
- **Door contract validation** — every DOOR has a `doorTargets` entry, target floor exists, target floor
  has an inbound door
- **Spawn validity** — spawn on a walkable tile, not blocked by entities
- **Missing required tiles** — e.g. floor "0" must have a SPAWN, exterior floors must have ARCH_DOORWAY pairs
- **Heatmaps**: distance from spawn, distance from nearest door, lighting coverage, line-of-sight
  from key tiles

### File integration

- **Direct file write** — skip the copy-paste step; write directly to `floor-blockout-*.js` with a
  confirmation diff preview
- **Git diff preview panel** — see the pending change as a unified diff before committing
- **Watch mode** — hot-reload `floor-data.json` on disk change
- **Autosave** draft state to localStorage (with the caveat that CLAUDE.md rules out `localStorage` in
  artifacts — but this is a dev tool, not an artifact, so it's fair game)

---

## Tier 3 — The difference between a tool and a platform

### Per-floor metadata editor

All the fields around the grid — not just the grid itself.

- **Rooms array editor** — draw a rect, name it, set `cx/cy`; optional tags (shop, bedroom, hall)
- **Door targets map editor** — click a door tile, dropdown to pick target floor
- **Door faces editor** — click a door tile, pick exterior face direction (N/E/S/W)
- **Shops array editor** — position + shop type
- **Spawn drag** — pick up the spawn marker and drop it somewhere new
- **Biome picker** — per-floor biome assignment affecting texture atlas and fog config
- **Spatial contract inspector** — read-only view of the frozen `SpatialContract.*` for this floor depth

### Entity + decoration layer

The grid holds static tiles. Real level design needs dynamic content on top.

- **Entity palette** — NPCs, enemies (by card ID), loot spawns, trigger volumes, dialogue zones
- **Drag-drop entity placement** — not grid-snapped necessarily
- **Entity inspector** — properties panel for the selected entity
- **Link tool** — draw arrows between entities to express relationships (patrol path, trigger link)
- **Loot table picker** — click a CHEST, assign a loot table by ID

### 3D preview

This is the killer feature for DG specifically.

- **Mini raycast window** — 200×150 inset showing first-person view from a "camera tile"
- **Click-drag camera tile** — move the preview around the grid
- **Face direction** — click-drag to rotate preview heading
- **Vertical slice** — preview wall heights, tile height offsets (the Doom-rule step visualization)
- **Texture preview toggle** — swap flat tile colors for actual rendered wall textures
- **Fog preview** — render with the active SpatialContract fog
- **Sun position slider** — time-of-day preview for exterior floors

### Collaboration + handoff

- **Annotations** — pin a note to a cell or a region ("Tarek's house interior pending")
- **TODO markers** — special tile annotations that list in a sidebar
- **Change summary** — generate a written summary of edits since last save (for commit messages)
- **Designer/programmer handoff mode** — export a spec document showing what tiles/doors were touched,
  which need engineering work (new tile ID, new contract)

---

## Tier 4 — Dungeon Gleaner specific

Features that only make sense because of how DG's engine works. These are the differentiators — no
generic editor has these.

### Window-scene editor (the thing that started this conversation)

When a window tile (`WINDOW_TAVERN`) is placed on an interior floor, the raycaster needs something to
render *beyond* the window. The current engine doesn't model this. The editor should:

- **Detect window tiles** on depth-2 interior floors
- **Open a window-scene panel** — a small separate grid (say 8×6) that represents what's visible
  outside that window
- **Borrow tiles from floor N** (the parent exterior) as a starting palette
- **Allow any tile** regardless of depth, because this is a *visual facade*, not a walkable space
- **Export as a named sub-grid** that the raycaster can look up at render time
- **Preview alignment** — the window-scene panel renders adjacent to the window position so the
  designer sees the intended sightline

Same pattern for PORTHOLE, ARCH_DOORWAY back-faces, and any "see-through" tile.

### Tile height offset editor

CLAUDE.md documents the Doom-rule tile height system: each transition tile renders vertically
displaced from the floor plane per the `tileHeightOffsets` contract. Right now these values are
frozen in `SpatialContract` constants.

- **Per-cell height offset override** — click a cell, enter an offset (-0.3 to +0.3)
- **Visual indicator** — raised/sunken tiles rendered with a shadow stripe
- **Preview in 3D** — the mini raycast shows the offset in perspective
- **Step color editor** — per-contract step fill color
- **Bulk apply** — "all DOOR_FACADE on this floor get +0.15"

### DOOR_FACADE recess visualization

Wolfenstein-style thin-wall offset is invisible in a top-down ASCII view. The editor should:

- **Draw the recess depth** as a chevron or inset stripe on DOOR_FACADE tiles
- **Show which face is the exterior face** (already in tooltip, promote to overlay)
- **Validate jamb boundaries** — warn if a DOOR_FACADE is adjacent to empty space where the jamb
  would fall

### Building footprint grouping

Right now a "building" is implicit — a cluster of WALL tiles on an exterior floor with a DOOR_FACADE
on one face, a name in the BuildingRegistry, and a doorTarget pointing to an interior floor.

- **Building registry editor** — create, name, tag buildings
- **Group selection of building tiles** — select all tiles belonging to a building at once
- **Auto-generate interior floor scaffold** — from a building footprint, generate a starter interior
  grid with walls at the right dimensions
- **Round-trip check** — exterior building dimensions match interior floor gridW/gridH where relevant

### Biome palette swapping

DG has multiple biomes planned. A designer should be able to:

- **Swap palette** — view the same grid with desert/forest/coastal/night palettes
- **Preview texture atlas swaps** — without committing changes
- **Copy-as-biome** — clone a floor and rebias its tiles to a different biome's equivalents

### Narrative layer

From `STREET_CHRONICLES_NARRATIVE_OUTLINE.md`: conspiracy reveals are staged per floor.

- **Narrative beat markers** — pin "Act 1 reveal: hero's trophy wall" to a cell
- **NPC dialogue link** — click an NPC entity, see their dialogue ID from `data/strings/en.js`
- **Faction territory overlay** — tint regions by controlling faction

---

## Tier 5 — Aspirational / post-jam

Things that would be lovely but aren't shipping before Winter 2026 webOS launch.

- **Procedural floor recipe editor** — for the floors we *don't* blockout by hand. Visual node graph
  for "generate N rooms, connect with corridors, place 3 torches per room."
- **Procedural + handcrafted hybrid** — hand-place the entry + boss rooms, let the editor fill the
  middle with procgen, preview the result
- **Multi-floor view** — render the full world graph as a 3D stack of floors
- **Collaborative editing** — multiple designers on the same floor (probably overkill; DG is small team)
- **Playtesting instrumentation** — in the editor, replay player paths from analytics, see heatmaps
  of actual player movement
- **Accessibility check** — validate against WCAG-adjacent rules: contrast between walkable and
  non-walkable, color-blind-safe tile palette, glyph readability
- **i18n preview** — swap `data/strings/en.js` for other locales to check UI overflow

---

## Suggested implementation order

Assuming the current jam timeline (post-jam cleanup through Winter 2026 launch):

1. **Phase 3 (schema extraction)** — 1–2 days. Unlocks everything downstream.
2. **Tier 1 drawing tools** — rectangle fill, flood fill, line, brush size. 1–2 days.
3. **Tier 1 selection + history** — magic wand, redo, history panel. 1 day.
4. **Direct file write** (Tier 2 file integration) — skip the copy-paste dance. Half a day.
5. **Tier 4 window-scene editor** — the thing that motivated this conversation. 2–3 days.
6. **Tier 2 validation** — walkability, door contracts, spawn check. 2 days.
7. **Tier 3 metadata editor** — rooms, doorTargets, spawn drag. 2–3 days.
8. **Tier 4 tile height offset editor** — 1–2 days.
9. **Tier 2 layers** — significant refactor. Save for when the compositional needs are clear.
10. **Tier 3 3D preview** — defer until the editor is otherwise mature; then it becomes the wow feature.

Items that are probably **never worth it** for DG's scope: collaborative editing, procedural recipe
editor, history tree with branching, customizable shortcuts. A small team building one game doesn't
need those.

---

## Design principles for this tool

As features accumulate, these should stay true:

1. **Zero build tools.** Same constraint as the engine. Single HTML file, no npm, no bundler. If a
   feature requires React, reconsider the feature.
2. **The grid literal is the source of truth.** The editor reads from and writes to the same
   `_FLOOR_GRID` array a contributor would hand-edit. No proprietary file format.
3. **Post-builder baseline (Option 2).** The editor works against the built, decorated grid — what
   the player sees. See the fidelity discussion in the session transcript.
4. **Designers shouldn't need to understand IIFEs.** The editor hides the module pattern; the
   exported grid pastes into a builder function transparently.
5. **Every overlay is toggleable.** Rooms, doors, grid lines, IDs, spawn, entities — all off by
   default except the essentials. Readable ASCII-style view first, diagnostic overlays on demand.
6. **Undo everything.** Any state change — paint, lasso, resize, metadata edit, entity placement —
   goes through the undo stack.

---

## Open questions for the next planning session

- Do we want a real layered grid format, or keep the flat `grid[y][x]` and synthesize layers at view time?
- Where does entity placement live — in the grid (as meta tiles) or in a parallel entities array?
- Should the editor bundle a mini raycast engine, or defer to launching the full game in a sibling
  iframe pointed at the edited floor?
- What's the story for undoing across floor switches? (Currently undo stack resets on floor change.)
- When we extract the tile schema from `tiles.js`, do we also want to parse `cards.json` and
  `strings/en.js` to get NPC and item metadata?
